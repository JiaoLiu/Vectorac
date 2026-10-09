// Run after npm run build. Uses installed Chrome/CDP; no Playwright required.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { join, resolve, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { adapter } from '../mahjong-service/rooms/adapters/junqi.js'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const output = await mkdtemp(join(tmpdir(), 'junqi-perspective-'))
const root = resolve('public')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg' }
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname))
  if (!file.startsWith(root + '/')) { res.writeHead(403).end(); return }
  try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)) }
  catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = (process.env.JUNQI_TEST_URL || `http://127.0.0.1:${server.address().port}`).replace(/\/$/, '')
const chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(output, 'profile')}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] })
let socket, sessionId, serial = 0
const pending = new Map(), errors = []
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome CDP startup timed out')), 15000)
    let stderr = ''
    chrome.stderr.on('data', data => {
      stderr += data
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(timeout); resolve(match[1]) }
    })
    chrome.once('error', error => { clearTimeout(timeout); reject(error) })
    chrome.once('exit', code => { clearTimeout(timeout); reject(new Error(`Chrome exited ${code}`)) })
  })
  socket = new WebSocket(endpoint)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const send = (method, params = {}, target = sessionId) => new Promise((resolve, reject) => {
    const id = ++serial
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 20000)
    pending.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) }))
  })
  socket.on('message', data => {
    const message = JSON.parse(data)
    if (message.id) {
      const call = pending.get(message.id)
      if (!call) return
      pending.delete(message.id); clearTimeout(call.timeout)
      if (message.error) call.reject(new Error(JSON.stringify(message.error)))
      else call.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    else if (message.method === 'Fetch.requestPaused') {
      const allow = message.params.request.url.startsWith(origin) || message.params.request.url.startsWith('data:')
      send(allow ? 'Fetch.continueRequest' : 'Fetch.failRequest', {
        requestId: message.params.requestId, ...(allow ? {} : { errorReason: 'BlockedByClient' })
      }, message.sessionId).catch(error => errors.push(error.message))
    }
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, null)
  ;({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, null))
  await send('Runtime.enable'); await send('Page.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Page.navigate', { url: origin + '/blogs/other/junqi.html' })
  for (let i = 0; i < 100; i++) {
    if (await evaluate('!!document.querySelector(".jq-game")?.__vue__?.game')) break
    if (i === 99) throw new Error('Junqi did not mount')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  await evaluate('window.__Junqi = document.querySelector(".jq-game").__vue__.constructor; true')
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: true })
    await send('Emulation.setTouchEmulationEnabled', { enabled: true })
    let baselineBadgePositions
    for (let viewer = 0; viewer < 4; viewer++) {
      const state = adapter.createState({}, { seed: 42, rules: { mode: 'open' } })
      const setup = adapter.serializeView(state, viewer)
      await evaluate(`(async () => {
        const previous = document.querySelector('.jq-game'); previous.__vue__.$destroy(); previous.remove();
        window.__view = ${JSON.stringify(setup)}; window.__actions = [];
        window.__vm = new window.__Junqi({propsData:{online:{
          getView:()=>window.__view, roomCode:()=> 'TEST', seatLabel:s=>s===${viewer}?'你':'玩家',
          trySwap:(a,b)=>window.__actions.push(['swap',a,b]),
          tryMove:(a,b)=>window.__actions.push(['move',a,b])
        }}});
        window.__vm.$mount(); document.body.appendChild(window.__vm.$el);
        await window.__vm.$nextTick();
      })()`)
      const inspect = () => evaluate(`(() => {
        const angle = el => { const m=el.getCTM(); return Math.round(Math.atan2(m.b,m.a)*180/Math.PI) || 0 };
        return Array.from(document.querySelectorAll('.jq-site .jq-piece')).map(piece=>{
          const site=piece.closest('.jq-site'), node=window.__vm.board.byId[site.dataset.node];
          const relative=(node.seat-${viewer}+4)%4, expected=node.seat<0?0:[0,90,0,-90][relative];
          const rect=piece.querySelector('rect').getBoundingClientRect();
          return {id:node.id,expected,body:angle(piece),label:angle(piece.querySelector('.jq-piece-label')),width:rect.width,height:rect.height};
        });
      })()`)
      for (const tile of await inspect()) {
        assert.equal(tile.body, tile.expected, `viewer ${viewer}, ${tile.id}: tile direction`)
        assert.equal(tile.label, tile.expected, `viewer ${viewer}, ${tile.id}: printed text follows tile`)
        assert.ok(tile.expected === 0 ? tile.width > tile.height : tile.height > tile.width)
      }
      const ownPosition = await evaluate(`(() => {const a=document.querySelector('[data-node="${viewer}:5:2"]').getBoundingClientRect(),b=document.querySelector('[data-node="${(viewer+2)%4}:5:2"]').getBoundingClientRect();return a.y>b.y})()`)
      assert.ok(ownPosition, `viewer ${viewer}: own army below teammate`)
      const badgePositions = await evaluate(`Array.from({length:4},(_,relative)=>document.querySelector('[data-seat="'+((${viewer}+relative)%4)+'"]').getAttribute('transform'))`)
      if (viewer === 0) baselineBadgePositions = badgePositions
      else assert.deepEqual(badgePositions, baselineBadgePositions, 'seat labels keep the same relative layout after changing seat')
      const swapIds = [`${viewer}:0:0`, `${viewer}:0:1`].map(pos => setup.pieces.find(piece => piece.pos === pos).id)
      await evaluate(`['${viewer}:0:0','${viewer}:0:1'].forEach(id=>document.querySelector('[data-node="'+id+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true})))`)
      assert.deepEqual(await evaluate('window.__actions'), [['swap', ...swapIds]], 'swap sends absolute piece IDs')
      for (let seat = 0; seat < 4; seat++) assert.ok(adapter.dispatch(state, { type: 'confirm', seat }).ok)
      state.s.turn = viewer
      const play = adapter.serializeView(state, viewer)
      const move = play.legal.find(option => option.type === 'move').moves.find(move => move.to.startsWith('c:'))
      assert.ok(move, 'real server legal table has a move onto the common railway')
      const from = play.pieces.find(piece => piece.id === move.pieceId).pos
      await evaluate(`(async()=>{window.__view=${JSON.stringify(play)};window.__vm.syncFromOnline();await window.__vm.$nextTick();['${from}','${move.to}'].forEach(id=>document.querySelector('[data-node="'+id+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true})))})()`)
      assert.deepEqual((await evaluate('window.__actions')).at(-1), ['move', move.pieceId, move.to], 'move keeps server node IDs')
      for (const pos of [move.to, `${(viewer+1)%4}:0:0`, `${(viewer+3)%4}:0:0`, `${(viewer+2)%4}:0:0`]) {
        const snapshot = structuredClone(play)
        snapshot.pieces = snapshot.pieces.filter(piece => piece.pos !== pos || piece.id === move.pieceId)
        snapshot.pieces.find(piece => piece.id === move.pieceId).pos = pos
        await evaluate(`(async()=>{window.__view=${JSON.stringify(snapshot)};window.__vm.syncFromOnline();await window.__vm.$nextTick()})()`)
        const tile = (await inspect()).find(tile => tile.id === pos)
        assert.equal(tile.body, tile.expected, 'moving tile follows its destination region')
        assert.equal(tile.label, tile.body, 'body and print rotate together after crossing regions')
      }
      // Real dark-view serialization: ranks stay private; the inference stamp
      // is printed on the tile and follows it into the common railway too.
      state.s.mode = 'dark'
      const enemy = state.s.pieces.find(piece => piece.seat === (viewer + 1) % 4)
      state.s.intel = { [`${viewer}:${enemy.id}`]: ['commander'] }
      for (const pos of [enemy.pos, move.to]) {
        const dark = adapter.serializeView(state, viewer)
        dark.pieces = dark.pieces.filter(piece => piece.pos !== pos || piece.id === enemy.ref)
        dark.pieces.find(piece => piece.id === enemy.ref).pos = pos
        await evaluate(`(async()=>{window.__view=${JSON.stringify(dark)};window.__vm.syncFromOnline();await window.__vm.$nextTick()})()`)
        const stamp = await evaluate(`(() => {const piece=document.querySelector('[data-node="${pos}"] .jq-piece'),text=piece.querySelector('.jq-intel-badge text');const angle=el=>{const m=el.getCTM();return Math.round(Math.atan2(m.b,m.a)*180/Math.PI)||0};return {body:angle(piece),text:angle(text),rank:!!piece.querySelector('.jq-piece-label'),value:text.textContent}})()`)
        assert.equal(stamp.rank, false, 'dark view does not expose the enemy rank')
        assert.equal(stamp.value, '司')
        assert.equal(stamp.text, stamp.body, 'inference text rotates with the whole tile')
        assert.equal(stamp.body, pos.startsWith('c:') ? 0 : 90)
      }
      await evaluate(`(async()=>{window.__view=${JSON.stringify(setup)};window.__vm.syncFromOnline();await window.__vm.$nextTick()})()`)
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(output, `${viewport.width}-seat-${viewer}.png`), Buffer.from(screenshot.data, 'base64'))
    }
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, origin, views: 8, screenshots: output }))
} finally {
  if (socket) socket.close()
  for (const call of pending.values()) clearTimeout(call.timeout)
  chrome.kill()
  await new Promise(resolve => server.close(resolve))
}
