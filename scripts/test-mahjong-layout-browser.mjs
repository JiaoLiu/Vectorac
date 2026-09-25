import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join,extname} from 'node:path'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),{build}=require('esbuild')
const {webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const root=resolve(import.meta.dirname,'..'),output=await mkdtemp(join(tmpdir(),'mahjong-layout-'))
console.log('Screenshots:',output)
const md=await readFile(join(root,'blogs/other/mahjong_game.md'),'utf8')
const template=md.slice(md.indexOf('<div id="scmjGame"'),md.indexOf('<div class="scmj-intro">'))
const css=md.match(/<style>([\s\S]*?)<\/style>/)[1]
const compiled=await build({stdin:{contents:`export {default as UI} from './.vuepress/components/mahjong/ui.js';export {createGame,playerView} from './.vuepress/components/mahjong/engine.js'`,resolveDir:root},bundle:true,format:'iife',globalName:'MahjongTest',write:false})
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${css}</style>${template}<script src="/test.js"></script>`
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
  if(path==='/test.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].text);return}
  const file=resolve(root,'.vuepress/public','.'+path)
  if(!file.startsWith(root+'/.vuepress/public/')){res.writeHead(403);res.end();return}
  res.setHeader('Content-Type',extname(file)==='.png'?'image/png':extname(file)==='.svg'?'image/svg+xml':'application/octet-stream');res.end(await readFile(file))
 }catch(_){res.writeHead(404);res.end()}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser
try{
 browser=await webkit.launch({headless:true})
 for(const viewport of [{width:844,height:390},{width:667,height:375},{width:568,height:320},{width:390,height:844},{width:320,height:568},{width:1280,height:800}]){
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:viewport.width<1000}),page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.evaluate(()=>{
   const {UI,createGame,playerView}=MahjongTest,ui=new UI(document.querySelector('#scmjGame'));ui.mount()
   Object.assign(ui.settings,{sound:false,music:false,animation:false,assist:false})
   const v=playerView(createGame({seed:42,dealer:0}),0);v.phase='discard';v.turn=0;v.wallCount=24
   v.players.forEach((p,s)=>{p.handCount=s===1?14:13;p.void='tong';p.discards=Array.from({length:12},(_,i)=>(i+s*3)%27)})
   v.my.hand=[0,1,2,3,4,5,6,7,8,9,10,11,12];v.my.drawnTile=13
   v.legal=[{type:'discard',tiles:v.my.hand.concat(13)}];v.lastDiscard={seat:1,tile:v.players[1].discards.at(-1)}
   ui.game={view:()=>v,exportState:()=>null};ui.showTable();ui.root.classList.add('scmj-fullscreen');ui.render()
   window.fixture={ui,v}
  })
  await page.waitForTimeout(150)
  for(const count of [12,24,36]){
   await page.evaluate(count=>{fixture.v.players.forEach((p,s)=>{p.discards=Array.from({length:count},(_,i)=>(i+s*3)%27)});fixture.ui.render()},count)
   const metrics=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}}
    return {board:rect(document.querySelector('.scmj-board')),felt:rect(document.querySelector('.scmj-felt')),hand:[...document.querySelectorAll('.scmj-hand .scmj-tile')].map(rect),backs:[1,2,3].map(s=>[...document.querySelectorAll('.scmj-handbacks-'+s+' .scmj-handback')].map(rect)),discards:[...document.querySelectorAll('.scmj-felt .scmj-tile')].map(rect),compass:rect(document.querySelector('.scmj-compass')),scroll:document.querySelector('#scmjGame').scrollHeight,client:document.querySelector('#scmjGame').clientHeight}
   })
   await page.screenshot({path:join(output,`${viewport.width}x${viewport.height}-${count}.png`)})
   const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>.6&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.6
   for(const group of metrics.backs)for(const tile of group)assert.ok(tile.x>=0&&tile.right<=viewport.width&&tile.y>=metrics.board.y&&tile.bottom<=metrics.board.bottom,'all hand backs stay on table')
   for(const group of metrics.backs)for(let i=1;i<group.length;i++)assert.ok(!overlap(group[i-1],group[i]),'hand backs do not overlap')
   for(const [side,group] of metrics.backs.entries())if(side!==1)for(let i=1;i<group.length;i++)assert.ok(Math.abs(group[i].y-group[i-1].bottom)<.6,'side tops touch without gaps')
   for(let i=0;i<metrics.discards.length;i++){
    const a=metrics.discards[i]
    assert.ok(a.x>=metrics.felt.x-.6&&a.y>=metrics.felt.y-.6&&a.right<=metrics.felt.right+.6&&a.bottom<=metrics.felt.bottom+.6,'discard stays in felt')
    for(let j=i+1;j<metrics.discards.length;j++)assert.ok(!overlap(a,metrics.discards[j]),'discard faces do not overlap')
    assert.ok(!overlap(a,metrics.compass),'compass does not cover discards')
   }
   assert.equal(metrics.hand.length,14)
   assert.ok(metrics.hand.every(t=>Math.abs(t.y-metrics.hand[0].y)<.6),'own hand stays in one row')
   assert.ok(metrics.hand.at(-1).right<=viewport.width&&metrics.hand.at(-1).bottom<=viewport.height,`hand stays on screen ${JSON.stringify({viewport,metrics,output})}`)
   assert.ok(metrics.scroll<=metrics.client+1,`table does not scroll ${JSON.stringify({viewport,metrics,output})}`)
  }
  await page.locator('.scmj-hand .scmj-tile').first().click()
  assert.equal(await page.locator('.scmj-hand .scmj-tile-selected').count(),1,'hand selection still works')
  assert.ok(await page.getByRole('button',{name:'出牌 · 一万',exact:true}).isVisible())
  await page.locator('[data-scmj-btn-settings]').click()
  assert.ok(await page.locator('[data-scmj-modal-settings]').isVisible())
  await page.locator('button[data-scmj-close-settings]').click()
  // 联机交流仅测试布局与开关，不请求麦克风或发送消息。
  await page.evaluate(()=>{fixture.ui._els.chat.hidden=false;fixture.ui.fitChat()})
  const buttonBefore=await page.locator('[data-scmj-chat-toggle]').boundingBox()
  await page.locator('[data-scmj-chat-toggle]').click()
  const buttonAfter=await page.locator('[data-scmj-chat-toggle]').boundingBox()
  assert.deepEqual(buttonAfter,buttonBefore,'opening chat never moves its toggle')
  const panel=await page.locator('[data-scmj-chat-panel]').boundingBox()
  const hand=await page.locator('.scmj-hand').boundingBox()
  assert.ok(panel.y>=0&&panel.x>=0&&panel.x+panel.width<=viewport.width&&panel.y+panel.height<=hand.y,'voice panel stays onscreen above hand')
  assert.ok(buttonAfter.y+buttonAfter.height<=hand.y,'voice toggle does not cover hand')
  await page.screenshot({path:join(output,`${viewport.width}x${viewport.height}-voice.png`)})
  await page.locator('[data-scmj-chat-toggle]').click()
  // 从一组碰到四组杠：四家都要完整露牌；旁家牌面旋转后也不越界。
  for(const count of [1,4]){
   await page.evaluate(count=>{
    const melds=Array.from({length:count},(_,i)=>({kind:count===1?'peng':'gang',tile:i*3,gangType:['ming','an','bu','ming'][i]}))
    fixture.v.players.forEach(p=>{p.handCount=13-count*3;p.melds=melds})
    fixture.v.my.melds=melds;fixture.v.my.hand=Array.from({length:13-count*3},(_,i)=>i);fixture.v.my.drawnTile=13
    fixture.ui.render()
   },count)
   const rects=await page.locator('.scmj-handbacks .scmj-meld .scmj-tile, .scmj-mymelds .scmj-meld .scmj-tile').evaluateAll(tiles=>tiles.map(t=>{
    const r=t.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}
   }))
   assert.equal(rects.length,4*count*(count===1?3:4),'each player shows all three/four tiles per meld')
   assert.ok(rects.every(r=>r.w>0&&r.h>0&&r.x>=0&&r.right<=viewport.width&&r.y>=0&&r.bottom<=viewport.height),'all exposed meld tiles are visible onscreen')
   for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
    const a=rects[i],b=rects[j]
    assert.ok(!(Math.min(a.right,b.right)-Math.max(a.x,b.x)>.6&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.6),'exposed meld faces do not overlap')
   }
   await page.screenshot({path:join(output,`${viewport.width}x${viewport.height}-melds${count}.png`)})
  }
  assert.deepEqual(errors,[]);await context.close()
 }
 console.log(JSON.stringify({passed:true,screenshots:output}))
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
