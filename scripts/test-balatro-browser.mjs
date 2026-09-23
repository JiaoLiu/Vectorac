import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as E from '../.vuepress/components/balatro/engine.mjs'
const require=createRequire(import.meta.url)
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH || 'playwright')
const base=process.env.BASE_URL||'http://127.0.0.1:8091',url=base+'/blogs/other/cardforge.html',out=process.env.BALATRO_QA_DIR || mkdtempSync(join(tmpdir(),'balatro-qa-')),SAVE='vectorac.balatro.run.v3'
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch({headless:true,...(process.env.BROWSER!=='webkit'&&process.env.CHROME_BINARY?{executablePath:process.env.CHROME_BINARY}:{})})
const errors=[],results=[]
async function pageFor(viewport,mobile=false){
 const ctx=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1})
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/\/assets\/|\/js\//.test(r.url())&&r.url().startsWith(base))errors.push(r.status()+' '+r.url())})
 await page.addInitScript(()=>{window.__longTasks=[];if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>list.getEntries().forEach(e=>window.__longTasks.push(e.duration))).observe({type:'longtask',buffered:true})})
 await page.goto(url);await page.locator('[data-action=start]').waitFor({timeout:20000});return page
}
const read=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE)
async function seedPage(page,s){await page.evaluate(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{key:SAVE,state:s});await page.reload();await page.locator('[data-action=resume]').click();await page.locator('.bp-game').waitFor()}
function bestMove(s){
 let best={total:-1,ids:[]};const limit=1<<s.hand.length
 for(let mask=1;mask<limit;mask++){
  const ids=s.hand.filter((_,i)=>mask&(1<<i)).map(c=>c.uid);if(ids.length>5)continue
  const draft=E.clone(s);draft.selected=ids
  try{const r=E.play(draft);if(r.total>best.total)best={total:r.total,ids}}catch(_){}
 }
 return best
}
async function selected(page,ids,touch=false){
 const state=await read(page)
 for(const id of state.selected||[])if(!ids.includes(id))await page.locator(`.bp-hand [data-uid="${id}"]`).click()
 for(const id of ids){const loc=page.locator(`.bp-hand [data-uid="${id}"]`);if(await loc.getAttribute('aria-pressed')!=='true'){const box=await loc.boundingBox();if(touch)await page.touchscreen.tap(box.x+10,box.y+17);else await loc.click({position:{x:10,y:17}})}}
}
async function playMove(page,ids,touch=false){await selected(page,ids,touch);await page.locator('[data-action=play]').click();await page.waitForFunction(()=>!document.querySelector('#balatro-game').classList.contains('bp-is-busy'))}
async function layout(page,label){
 const data=await page.evaluate(()=>{
  const rect=sel=>{const el=document.querySelector(sel);return el?el.getBoundingClientRect().toJSON():null}
  return {width:innerWidth,height:innerHeight,scale:visualViewport.scale,root:rect('#balatro-game'),play:rect('[data-action=play]'),hand:rect('.bp-hand'),scroll:document.querySelector('#balatro-game').scrollWidth,body:document.body.scrollWidth}
 })
 assert.equal(data.root.width,data.width,label+' full width');assert.ok(data.root.height<=data.height+1,label+' height');assert.ok(data.scroll<=data.width+1,label+' horizontal overflow')
 if(data.play)assert.ok(data.play.top>=0&&data.play.bottom<=data.height,label+' reachable play button')
 results.push({label,...data});await page.screenshot({path:out+'/'+label+'.png'})
}

try{
 const page=await pageFor({width:1440,height:900})
 await page.locator('[data-seed]').fill('QA-17');await page.locator('[data-action=start]').click();await layout(page,'desktop-blinds');await page.locator('[data-action=blind]:enabled').click()
 const started=await read(page);assert.equal(started.phase,'play');assert.equal(started.hand.length,8)
 const top=bestMove(started);await selected(page,top.ids);await page.locator('[data-action=play]').dblclick({delay:45})
 await page.waitForFunction(()=>!document.querySelector('#balatro-game').classList.contains('bp-is-busy'))
 assert.equal((await read(page)).totalHands,1,'double click must never play twice');await layout(page,'desktop-play')
 const beforeReload=await read(page);await page.reload();await page.locator('[data-action=resume]').click();assert.equal((await read(page)).totalHands,beforeReload.totalHands)
 await page.locator('[data-action=fullscreen]').click();assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.equal(await page.locator('#balatro-game').evaluate(el=>el.classList.contains('bp-fullscreen')),false)
 await page.locator('[data-action=fullscreen]').click()
 // Start-to-shop playthrough: find a deterministic, unmodified deal that can win through actual card play.
 let run
 for(let i=0;i<100;i++){const s=E.newRun('QA-'+i);E.startBlind(s);const copy=E.clone(s);while(copy.phase==='play'){const best=bestMove(copy);copy.selected=best.ids;E.play(copy)}if(copy.phase==='reward'){run=E.newRun('QA-'+i);break}}
 assert.ok(run,'natural winning seed found');await seedPage(page,run);await page.locator('[data-action=blind]:enabled').click()
 while((await read(page)).phase==='play'){const state=await read(page);await playMove(page,bestMove(state).ids)}
 assert.equal((await read(page)).phase,'reward');await page.locator('[data-action=cash]').click();assert.equal((await read(page)).phase,'shop');await layout(page,'desktop-shop')
 const shop=await read(page),affordable=shop.shop.cards.find(c=>E.itemCost(shop,c)<=shop.money);assert.ok(affordable);await page.locator(`[data-action=buy][data-uid="${affordable.uid}"]`).click()
 assert.equal((await read(page)).money,shop.money-E.itemCost(shop,affordable));await page.locator('[data-action=next]').click();assert.equal((await read(page)).blind,1);await page.locator('[data-action=blind]:enabled').click()
 assert.equal((await read(page)).phase,'play')
 // Targeted UI fixtures, separate from the unmodified playthrough above.
 const fixture=E.newRun('TOUCH','yellow');fixture.jokers=[E.makeJoker(fixture,'joker'),E.makeJoker(fixture,'duo')];E.startBlind(fixture)
 fixture.consumables=[{uid:++fixture.uid,kind:'planet',id:'pair'},{uid:++fixture.uid,kind:'tarot',id:'strength'}]
 const legacyFixture=JSON.parse(readFileSync(new URL('./fixtures/balatro-v3-midblind-pre-blindplayed.json',import.meta.url),'utf8'))
 await seedPage(page,legacyFixture);const migrated=await read(page)
 assert.equal(migrated.phase,'play');assert.ok(migrated.plays>0);assert.deepEqual(migrated.antePlayed,[]);assert.deepEqual(migrated.blindPlayed,[])
 assert.match(await page.locator('.bp-toast').innerText(),/支柱记录已重置/,'legacy migration explains why old Pillar history was cleared')
 const backFixture=E.clone(fixture),backUid=backFixture.hand[0].uid;backFixture.hand[0].hidden=true;backFixture.hand[0].edition='poly'
 await seedPage(page,backFixture);const back=page.locator(`.bp-hand .bp-playing[data-uid="${backUid}"]`)
 assert.equal(await back.getAttribute('aria-label'),'背面朝上的牌');assert.equal(await back.getAttribute('title'),'背面朝上')
 assert.ok(!(await back.getAttribute('class')).split(/\s+/).includes('bp-ed-poly'),'face-down cards do not expose the edition class')
 assert.deepEqual(await back.evaluate(el=>{const style=getComputedStyle(el);return [style.outlineStyle,style.filter,getComputedStyle(el,'::after').backgroundImage]}),['none','none','none'],'face-down cards do not show Poly outline, glow, or sheen')
 await seedPage(page,fixture);const planet=fixture.consumables[0];await page.locator(`[data-action=info][data-uid="${planet.uid}"]`).click();await page.locator('[data-action=use]').click();assert.equal((await read(page)).levels.pair,2)
 const target=(await read(page)).hand[0];await selected(page,[target.uid]);const tarot=fixture.consumables[1];await page.locator(`[data-action=info][data-uid="${tarot.uid}"]`).click();await page.locator('[data-action=use]').click();assert.equal((await read(page)).deck.find(c=>c.uid===target.uid).rank,target.rank===14?2:target.rank+1)
 await page.locator(`[data-action=info][data-uid="${fixture.jokers[0].uid}"]`).click();await page.locator('[data-action=right]').click();assert.equal((await read(page)).jokers[1].id,'joker')
 await page.locator('[data-action=menu]').first().click();await page.locator('[data-action=music]').last().click();await page.locator('[data-action=close]').click();await page.locator('[data-action=fullscreen]').click();await page.goto(base+'/blogs/other/games.html');assert.equal(await page.evaluate(()=>document.body.style.overflow),'')
 // Real touch events in Chromium's mobile emulation, small portrait and both orientations.
 const mobile=await pageFor({width:390,height:844},true);await mobile.locator('[data-action=start]').tap();await mobile.locator('[data-action=blind]:enabled').tap();await layout(mobile,'mobile-portrait')
 const first=await mobile.locator('.bp-hand .bp-playing').first().getAttribute('data-uid');const box=await mobile.locator('.bp-hand .bp-playing').first().boundingBox()
 await mobile.touchscreen.tap(box.x+9,box.y+15);const selectedBox=await mobile.locator('.bp-hand .bp-playing').first().boundingBox();await mobile.touchscreen.tap(selectedBox.x+9,selectedBox.y+15)
 assert.equal(await mobile.evaluate(()=>visualViewport.scale),1,'double tap must not zoom');assert.equal(await mobile.locator('.bp-hand .bp-playing').first().getAttribute('aria-pressed'),'false')
 const cbox=await mobile.locator('.bp-hand .bp-playing').first().boundingBox();await mobile.touchscreen.tap(cbox.x+9,cbox.y+15);await mobile.locator('[data-action=discard]').tap();assert.equal((await read(mobile)).discarded,1)
 for(const viewport of [{width:375,height:667},{width:320,height:568},{width:844,height:390},{width:667,height:375}]){await mobile.setViewportSize(viewport);await layout(mobile,`mobile-${viewport.width}x${viewport.height}`)}
 await mobile.setViewportSize({width:390,height:844});const ms=await read(mobile);await playMove(mobile,bestMove(ms).ids,true);assert.equal((await read(mobile)).totalHands,1)
 // Shop pack use on touch viewport, including reopening an in-progress pack save.
 const packState=E.newRun('PACK','yellow');E.startBlind(packState);packState.score=1000;packState.selected=[packState.hand[0].uid];E.play(packState);E.cashOut(packState);packState.money=100
 packState.shop.packs=[{uid:++packState.uid,kind:'pack',id:'tarot'}];await seedPage(mobile,packState);await mobile.locator(`[data-action=buy][data-uid="${packState.shop.packs[0].uid}"]`).tap();assert.ok((await read(mobile)).pack);await layout(mobile,'mobile-pack')
 await mobile.reload();await mobile.locator('[data-action=resume]').tap();assert.ok((await read(mobile)).pack);await mobile.locator('[data-action=pack-skip]').tap();assert.equal((await read(mobile)).pack,null)
 await layout(mobile,'mobile-shop');await mobile.locator('[data-action=fullscreen]').tap();assert.equal(await mobile.evaluate(()=>document.body.style.overflow),'')
 assert.deepEqual(errors,[],'no browser exceptions or missing game bundles')
 console.log(JSON.stringify({passed:true,base,artifacts:out,browser:process.env.BROWSER||'chromium',checks:results.map(r=>({name:r.label,width:r.width,height:r.height,playVisible:!r.play||r.play.bottom<=r.height})),errors},null,2))
}catch(error){console.error('BROWSER ERRORS',errors);throw error}finally{await browser.close()}
