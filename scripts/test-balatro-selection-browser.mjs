import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFile, mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve, join, extname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import * as E from '../.vuepress/components/balatro/engine.mjs'

const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url)
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const output=await mkdtemp(join(tmpdir(),'balatro-selection-'))
// Serve the actual UI module and styles in isolation from unrelated site/network services.
const html='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/.vuepress/components/balatro/style.css"><div id="balatro-game"></div><script type="module">import PokerTable from "/.vuepress/components/balatro/ui.js";window.table=new PokerTable(document.querySelector("#balatro-game"));</script>'
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
  const file=resolve(root,'.'+(path.startsWith('/img/')?'/.vuepress/public'+path:path))
  if(!file.startsWith(root)){res.writeHead(403);res.end();return}
  res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream')
  res.end(await readFile(file))
 }catch(_){res.writeHead(404);res.end()}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser
try{
 const webkitMode=process.env.BROWSER==='webkit'
 browser=await(webkitMode?webkit:chromium).launch({headless:true,...(!webkitMode&&process.env.CHROME_BINARY?{executablePath:process.env.CHROME_BINARY}:{})})
 const errors=[]
 for(const viewport of [{width:906,height:352},{width:844,height:390},{width:667,height:375},{width:390,height:844},{width:320,height:568}]){
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true})
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  const s=E.newRun('SELECTION-UI');E.startBlind(s);s.blind=2;s.boss='pillar';s.ante=3
  s.jokers=['constellation','jolly','cloud','smiley'].map(id=>E.makeJoker(s,id));s.jokers[0].value=1.2
  s.played.pair=8;s.roundPlayed.pair=2
  s.lastResult={id:'pair',name:'对子',total:980}
  s.hand[0].seal='gold';s.hand[1].enh='lucky';s.hand[1].edition='poly';s.hand[1].seal='blue';s.hand[2].hidden=true;s.hand[2].seal='purple'
  for(const card of s.hand)Object.assign(s.deck.find(c=>c.uid===card.uid),{enh:card.enh,edition:card.edition,seal:card.seal})
  await page.addInitScript(s=>{localStorage.setItem('vectorac.balatro.run.v3',JSON.stringify(s));localStorage.setItem('vectorac.balatro.settings.v3',JSON.stringify({sound:false,music:false,handSort:'custom'}))},s)
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.locator('[data-action=resume]').click()
  const geometry=()=>page.evaluate(()=>{
   const rect=sel=>document.querySelector(sel).getBoundingClientRect().toJSON(),stage=document.querySelector('.bp-stage')
   return {hand:rect('.bp-hand'),button:rect('[data-action=play]'),footer:rect('.bp-table-footer'),stage:rect('.bp-stage'),scroll:stage.scrollHeight,height:stage.clientHeight}
  })
  const before=await geometry()
  const tap=async uid=>{const box=await page.locator(`.bp-hand [data-uid="${uid}"]`).boundingBox();await page.touchscreen.tap(box.x+8,box.y+14)}
  for(const [index,kind] of [[0,'seal'],[1,'combined']]){
   await tap(s.hand[index].uid)
   const hint=page.locator('[data-selection-hint]');await hint.waitFor({timeout:2000})
   assert.match(await hint.innerText(),index===0?/金封：计分 \+\$3/:/蓝封/)
   const after=await geometry(),box=await hint.boundingBox()
   await page.screenshot({path:join(output,`${viewport.width}x${viewport.height}-${kind}.png`)})
   assert.equal(after.hand.y,before.hand.y,'hint does not move the hand')
   assert.equal(after.button.y,before.button.y,'hint does not move the controls')
   assert.ok(after.footer.bottom<=viewport.height,`footer stays on screen: ${JSON.stringify({viewport,after,output})}`)
   assert.ok(after.scroll<=after.height+1,`${viewport.width}x${viewport.height}: stage must not scroll: ${JSON.stringify({before,after,box,output})}`)
   assert.ok(box.x>=after.stage.x&&box.x+box.width<=after.stage.right+1,'hint fits horizontally')
   assert.ok(box.y>=after.stage.y-1&&box.y+box.height<=after.hand.y,'hint remains above the hand')
   assert.equal(await hint.evaluate(el=>getComputedStyle(el).pointerEvents),'none')
   assert.equal(await page.locator('.bp-live-boss,.bp-selected-card-effects').count(),0)
   assert.equal(await page.locator('.bp-boss-rule').count(),1)
  }
  await page.locator('[data-selection-hint]').waitFor({state:'detached',timeout:3500})
  await tap(s.hand[1].uid);assert.equal(await page.locator('[data-selection-hint]').count(),0)
  await tap(s.hand[1].uid);assert.equal(await page.locator('[data-selection-hint]').count(),1)
  await tap(s.hand[2].uid);assert.equal(await page.locator('[data-selection-hint]').count(),0,'hidden card clears the preceding hint')
  await page.locator('.bp-topbar [data-action=menu]').click()
  await page.locator('.bp-dialog [data-action=hands]').click()
  const row=page.locator('[data-hand-id=pair]');await row.scrollIntoViewIfNeeded()
  assert.match(await row.innerText(),/本轮 2 次 · 本局 8 次/)
  assert.ok(await row.locator('.bp-hand-usage').isVisible(),'counts remain visible on compact screens')
  assert.ok(await page.locator('.bp-dialog-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'hand dialog does not overflow horizontally')
  await page.screenshot({path:join(output,`${viewport.width}x${viewport.height}-counts.png`)})
  await page.locator('.bp-dialog [data-action=close]').click()
  await page.locator(`[data-action=info][data-uid="${s.jokers[0].uid}"]`).click()
  const progress=page.locator('.bp-joker-progress');assert.equal(await progress.innerText(),'当前 ×1.2 倍率')
  await progress.scrollIntoViewIfNeeded()
  assert.ok(await progress.isVisible())
  assert.ok(await page.locator('.bp-dialog-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'joker dialog does not overflow horizontally')
  await page.screenshot({path:join(output,`${viewport.width}x${viewport.height}-progress.png`)})
  await context.close()
 }
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({passed:true,browser:process.env.BROWSER||'chromium',screenshots:output},null,2))
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
