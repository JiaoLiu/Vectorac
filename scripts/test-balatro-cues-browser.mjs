import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as E from '../.vuepress/components/balatro/engine.mjs'
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const base=process.env.BASE_URL||'http://127.0.0.1:8091',SAVE='vectorac.balatro.run.v3',out=mkdtempSync(join(tmpdir(),'balatro-cues-'))
const browser=await(process.env.BROWSER==='webkit'?webkit:chromium).launch({headless:true,...(process.env.BROWSER!=='webkit'&&process.env.CHROME_BINARY?{executablePath:process.env.CHROME_BINARY}:{})})
const errors=[]
function fixture(){
 const s=E.newRun('CUES','yellow');s.jokers=[E.makeJoker(s,'toDo'),E.makeJoker(s,'mail'),E.makeJoker(s,'DNA')];E.startBlind(s);s.jokers[0].hand='pair';s.jokers[1].rank=8
 s.hand=s.deck.filter(c=>c.rank===8).slice(0,2).concat(s.deck.filter(c=>[14,13,11,9,5,2].includes(c.rank)&&c.suit===0));s.draw=s.deck.filter(c=>!s.hand.some(h=>h.uid===c.uid));s.selected=[]
 s.consumables=[{uid:++s.uid,kind:'planet',id:'pair'},{uid:++s.uid,kind:'planet',id:'pair'}];return s
}
const read=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE)
async function setup(mobile=false){
 const ctx=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1200,height:900},isMobile:mobile,hasTouch:mobile})
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));const s=fixture()
 await page.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key:SAVE,value:s})
 await page.goto(base+'/blogs/other/cardforge.html');await page.locator('.bp-entry-cover').evaluate(img=>img.decode())
 await page.screenshot({path:join(out,mobile?'entry-mobile.png':'entry-desktop.png'),fullPage:true})
 await page.locator('[data-action=resume]').click();return {page,s}
}
async function contained(page,label){
 const boxes=await page.evaluate(()=>{const r=document.querySelector('#balatro-game').getBoundingClientRect();return {width:innerWidth,body:document.body.scrollWidth,root:r.toJSON(),overflow:document.querySelector('#balatro-game').scrollWidth,children:['.bp-topbar','.bp-table','.bp-hand','[data-action=play]','[data-action=fullscreen]','[data-action=music]','[data-action=sound]','.bp-consumable-rack'].map(sel=>({sel,...document.querySelector(sel).getBoundingClientRect().toJSON()}))}})
 assert.ok(boxes.overflow<=boxes.root.width+1,label+' game overflow')
 for(const c of boxes.children){assert.ok(c.left>=boxes.root.left-1&&c.right<=boxes.root.right+1,label+' horizontal '+c.sel);assert.ok(c.bottom<=boxes.root.bottom+1,label+' vertical '+c.sel)}
 assert.ok(boxes.body<=boxes.width+1,label+' page overflow')
 await page.locator('#balatro-game').screenshot({path:join(out,label+'.png')})
}
try{
 const {page,s}=await setup()
 const todo=page.locator(`[data-visual="${s.jokers[0].uid}"]`)
 assert.match(await todo.locator('[data-cue=toDo]').innerText(),/对子.*\+\$4/);assert.equal(await page.locator('.bp-dialog').count(),0)
 for(const c of s.hand.slice(0,2))await page.locator(`.bp-hand [data-uid="${c.uid}"]`).click({position:{x:8,y:15}})
 assert.ok(await todo.evaluate(el=>el.classList.contains('bp-cue-ready')));assert.match(await page.locator('.bp-live-cues').innerText(),/待办清单.*对子/)
 await page.locator('#balatro-game').screenshot({path:join(out,'matching-cue.png')})
 const p1=s.consumables[0].uid,p2=s.consumables[1].uid
 await page.locator(`[data-action=info][data-uid="${p1}"]`).dblclick({delay:80});await page.waitForTimeout(450)
 assert.equal((await read(page)).levels.pair,2);assert.equal((await read(page)).consumables.length,1);assert.equal(await page.locator('.bp-dialog').count(),0,'double click does not leave a delayed dialog')
 assert.match(await page.locator('[data-effect-notice]').innerText(),/对子 Lv\.2.*筹码.*倍率/,'planet upgrade shows exact new scoring values')
 await page.locator(`[data-action=info][data-uid="${p2}"]`).click();await page.locator('.bp-dialog').waitFor();assert.equal((await read(page)).levels.pair,2,'single click never consumes');await page.locator('[data-action=close]').click()
 await page.locator(`[data-action=info][data-uid="${p2}"]`).click();await page.locator('[data-action=menu]').first().click();await page.waitForTimeout(450);assert.equal(await page.locator('.bp-dialog').getAttribute('aria-label'),'游戏选项','unrelated action cancels pending single click');await page.locator('[data-action=close]').click()
 await page.locator('[data-action=fullscreen]').click();await page.locator('#balatro-game').evaluate(el=>el.style.width='360px');await page.waitForFunction(()=>document.querySelector('#balatro-game').classList.contains('bp-compact'));await contained(page,'narrow-container-wide-browser')
 const {page:phone,s:mobileState}=await setup(true)
 const planet=phone.locator(`[data-action=info][data-uid="${mobileState.consumables[0].uid}"]`)
 await planet.tap();await planet.tap();await phone.waitForTimeout(450);assert.equal((await read(phone)).levels.pair,2);assert.equal((await read(phone)).consumables.length,1);assert.equal(await phone.evaluate(()=>visualViewport.scale),1)
 await phone.locator('[data-action=fullscreen]').tap();assert.equal(await phone.evaluate(()=>document.body.style.overflow),'');await contained(phone,'embedded-390')
 await phone.setViewportSize({width:320,height:568});await contained(phone,'embedded-320')
 const target=phone.locator(`.bp-hand [data-uid="${mobileState.hand[0].uid}"]`);await target.scrollIntoViewIfNeeded();const b=await target.boundingBox();await phone.touchscreen.tap(b.x+8,b.y+14);assert.equal(await target.getAttribute('aria-pressed'),'true')
 const unselected=phone.locator('.bp-hand .bp-playing:not(.bp-selected)').first();assert.equal(await unselected.evaluate(el=>getComputedStyle(el).transform),'none','touch does not leave unselected cards raised')
 await phone.setViewportSize({width:844,height:390});await contained(phone,'embedded-landscape')
 await phone.locator('[data-action=fullscreen]').tap();await contained(phone,'fullscreen-landscape');await phone.setViewportSize({width:390,height:844});await contained(phone,'fullscreen-portrait')
 await phone.locator('[data-action=fullscreen]').tap();await phone.setViewportSize({width:320,height:568});await phone.reload({waitUntil:'domcontentloaded'});await phone.locator('[data-action=resume]').waitFor()
 const entryBounds=await phone.evaluate(()=>({root:document.querySelector('#balatro-game').getBoundingClientRect().toJSON(),start:document.querySelector('[data-action=start]').getBoundingClientRect().toJSON()}));assert.ok(entryBounds.start.bottom<=entryBounds.root.bottom,'small embedded landing controls cannot be clipped');await phone.locator('#balatro-game').screenshot({path:join(out,'entry-320.png')})
 await phone.goto(base+'/blogs/other/games.html',{waitUntil:'domcontentloaded'});const cover=phone.locator('img[src="/img/games/balatro-cover.svg"]');await cover.scrollIntoViewIfNeeded();await cover.evaluate(img=>img.decode());await cover.screenshot({path:join(out,'gallery-cover.png')})
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,browser:process.env.BROWSER||'chromium',base,artifacts:out,checks:['target badge and glow','desktop double-click consumes once','single-click details','cancel delayed action','mobile double tap without zoom','embedded 320/390 and landscape','narrow container on wide screen','fullscreen orientation','page intro and cover'],errors},null,2))
}catch(e){console.error('Browser errors',errors);throw e}finally{await browser.close()}
