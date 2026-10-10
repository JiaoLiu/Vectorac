import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createGame,dispatch,playerView,allCards,catalog} from '../.private/fengshen/engine.mjs'
import {chooseAI} from '../.private/fengshen/engine.mjs'
import {HERO_BY_THEME_ID,CARDS_BY_TYPE} from '../.private/fengshen/theme.mjs'
import {hand,equipment} from './fixtures/sanguo.mjs'
const browser=await openBrowser({name:'fengshen',baseUrl:process.env.FENGSHEN_TEST_URL||'http://127.0.0.1:4178',route:'/'})
const {evaluate,tap,viewport,screenshot}=browser
const ready=async()=>{await browser.navigate();await browser.waitFor('!!window.__fengshenUI');await evaluate('localStorage.removeItem("vectorac.fengshen.internal.save.v1");true');await browser.navigate();await browser.waitFor('!!document.querySelector(".fs-entry")')}
const startDraft=async()=>{
  await tap('[data-action="start"]');await browser.waitFor('!!window.__fengshenUI.setup')
  const role=await evaluate('window.__fengshenUI.setup.roles[0]')
  if(await evaluate('!!document.querySelector("[data-action=setup-next]")'))await tap('[data-action="setup-next"]')
  await browser.waitFor('!!document.querySelector(".fs-draft-pick")')
  assert.equal(await evaluate('document.querySelectorAll(".fs-draft-pick").length'),role==='lord'?5:await evaluate('window.__fengshenUI.setup.candidateCount'))
  await screenshot('draft-'+role)
  await tap('.fs-draft-pick');await tap('[data-action="draft-pick"]')
  await browser.waitFor('!!document.querySelector(".fs-hand")')
  assert.equal(await evaluate('window.__fengshenUI.state.players[0].role'),role)
}
const geometry=()=>evaluate(`(()=>{const app=document.querySelector('.fs-app').getBoundingClientRect();return {w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth,appBottom:app.bottom,buttons:[...document.querySelectorAll('.fs-action-row button')].map(b=>{const r=b.getBoundingClientRect();return {name:b.textContent,top:r.top,bottom:r.bottom,height:r.height}}),players:[...document.querySelectorAll('.fs-player')].map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom}}),dockTop:document.querySelector('.fs-dock')?.getBoundingClientRect().top}})()`)
function fixture(heroId='yangjian'){
  const s=createGame({heroId,role:'lord',seed:17});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null
  for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
  return s
}
const inject=async s=>evaluate(`(()=>{const ui=window.__fengshenUI;clearTimeout(ui.timer);ui.voice.stop();ui.schedule=()=>{};ui.setup=null;ui.state=${JSON.stringify(s)};ui.lobby=false;ui.paused=false;ui.modal=null;ui.reset();ui.render();return true})()`)
try{
  for(const size of [[390,844],[844,390],[667,375],[320,568],[1280,900]]){
    await viewport(...size);await ready()
    assert.equal(await evaluate('document.querySelectorAll("[data-action=role],[data-action=hero]").length'),0,'no role/free-hero preselection')
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    await screenshot(`${size[0]}-lobby`)
    await tap('[data-action="heroes"]');assert.equal(await evaluate('document.querySelectorAll(".fs-collection-grid>button").length'),Object.keys(HERO_BY_THEME_ID).length)
    await tap('.fs-collection-grid [data-id="jiangziya"]');await browser.waitFor('!!document.querySelector(".fs-modal")');assert.ok(await evaluate('document.querySelector(".fs-modal-body").textContent.includes("尚未接入")'))
    await tap('[data-action="close"]')
    await startDraft()
    await evaluate('window.__fengshenUI.paused=true;window.__fengshenUI.render();true')
    let g=await geometry();assert.ok(g.scroll<=size[0]+1,JSON.stringify(g));assert.ok(g.appBottom<=size[1]+1)
    for(const b of g.buttons)assert.ok(b.top>=0&&b.bottom<=size[1]+1,`${size} button ${JSON.stringify(b)}`)
    for(const p of g.players)assert.ok(p.top>=0&&p.bottom<=g.dockTop+1,`${size} opponent ${JSON.stringify(p)} / dock ${g.dockTop}`)
    await screenshot(`${size[0]}-table`)
    const s=fixture(),[attack,dodge]=hand(s,0,'sha','shan');hand(s,1,'shan');await inject(s)
    await tap(`[data-action="card"][data-id="${dodge.id}"]`)
    assert.ok(await evaluate('!!document.querySelector(".fs-conversions [data-value=sha]")'),'九转 conversion is explicit')
    await tap('[data-action="clear"]');await tap(`[data-action="card"][data-id="${attack.id}"]`);await tap('[data-player="1"] [data-action="target"]');await tap('[data-action="confirm"]')
    assert.equal(await evaluate('window.__fengshenUI.state.pending.actor'),1)
    assert.equal(await evaluate('window.__fengshenUI.state.players[0].hand.length'),1)
    assert.equal(await evaluate('document.querySelector("[data-action=confirm]")?.matches(":active")||false'),false,'touch end releases active button state')
    const revision=await evaluate('window.__fengshenUI.state.revision')
    await viewport(size[1],size[0]);assert.equal(await evaluate('window.__fengshenUI.state.revision'),revision)
    await viewport(...size)
    await tap('[data-action="menu"]');await tap('.fs-modal [data-action="rules"]');const before=await evaluate('window.__fengshenUI.state.revision');await new Promise(r=>setTimeout(r,700));assert.equal(await evaluate('window.__fengshenUI.state.revision'),before,'modal pauses AI')
    assert.ok(await evaluate('(()=>{const r=document.querySelector(".fs-modal").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1})()'))
    await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',modifiers:8});assert.ok(await evaluate('document.querySelector(".fs-modal").contains(document.activeElement)'))
    await screenshot(`${size[0]}-rules`);await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});assert.equal(await evaluate('!!document.querySelector(".fs-modal")'),false)
    // Two-card spear selection, many-card hand scroll, and refresh mid-response.
    const many=fixture();equipment(many,0,'spear');hand(many,0,...Array(15).fill('shan'));await inject(many)
    assert.ok(await evaluate('document.querySelector(".fs-hand").scrollWidth>document.querySelector(".fs-hand").clientWidth'))
    const ids=many.players[0].hand.slice(0,2).map(c=>c.id);await tap(`[data-action="card"][data-id="${ids[0]}"]`);await tap(`[data-action="card"][data-id="${ids[1]}"]`);assert.equal(await evaluate('window.__fengshenUI.selected.length'),2)
    const rescue=fixture(),[incoming]=hand(rescue,1,'sha'),[peach]=hand(rescue,0,'tao');rescue.current=1;rescue.players[0].hp=1
    let r=dispatch(rescue,{seat:1,type:'play',as:'sha',ids:[incoming.id],targets:[0]});assert.ok(r.ok);r=dispatch(r.state,{seat:0,type:'pass'});assert.ok(r.ok);assert.equal(r.state.pending.kind,'rescue');await inject(r.state)
    await evaluate('window.__fengshenUI.save();true');await browser.navigate();await browser.waitFor('!!window.__fengshenUI');await tap('[data-action="resume"]')
    assert.equal(await evaluate('window.__fengshenUI.state.pending.kind'),'rescue')
    await tap(`[data-action="card"][data-id="${peach.id}"]`);await tap('[data-action="confirm"]');assert.ok(await evaluate('window.__fengshenUI.state.players[0].hp>0'))
  }
  await viewport(390,844);await ready();await tap('[data-action="gallery"]')
  assert.equal(await evaluate('document.querySelectorAll(".fs-gallery>button").length'),Object.keys(CARDS_BY_TYPE).length)
  await evaluate('[...document.images].forEach(i=>i.loading="eager");true')
  await browser.waitFor('[...document.images].every(i=>i.complete&&i.naturalWidth>0)')
  await screenshot('390-gallery')
  await tap('.fs-gallery [data-id="crossbow"]');assert.equal(await evaluate('document.querySelector("#fs-dialog-title").textContent'),'火尖枪')
  await tap('[data-action="close"]');await startDraft()
  await evaluate('delete window.__fengshenUI.schedule;window.__fengshenUI.voice.setEnabled(false);window.__fengshenUI.pace=1;window.__fengshenUI.render();window.__fengshenUI.schedule();true')
  // Run an entire match through UI timers. Only choose the human seat action.
  let steps=0
  while(steps++<15000){const s=await evaluate('window.__fengshenUI.state');if(s.winner)break;if((s.pending?.actor??s.current)===0){const a=chooseAI(playerView(s,0));assert.ok(a);assert.ok(await evaluate(`window.__fengshenUI.act(${JSON.stringify(a)})`))}else if(s.pending?.kind==='reveal')assert.ok(await evaluate(`window.__fengshenUI.act(${JSON.stringify({type:'ack',seat:s.pending.actor})})`));else await new Promise(r=>setTimeout(r,3))}
  const finished=await evaluate('window.__fengshenUI.state');assert.ok(finished.winner);assert.equal(allCards(finished).length,catalog.makeDeck().length)
  await tap('[data-action="menu"]');await tap('.fs-modal [data-action="report"]');assert.equal(await evaluate('document.querySelectorAll(".fs-role-reveal>span").length'),5);await screenshot('390-result')
  // A reload can cancel an intercepted image before CDP's continue arrives.
  // Ignore only that exact transport race, not application exceptions.
  assert.deepEqual(browser.errors.filter(e=>e!==JSON.stringify({code:-32602,message:'Invalid InterceptionId.'})),[])
  console.log('PASS: 5 viewports, touch/rotation/response/restore, 52 local assets, complete UI-timer match. Screenshots:',browser.output)
}catch(error){console.error('Failure screenshot:',await screenshot('failure'));throw error}finally{await browser.close()}
