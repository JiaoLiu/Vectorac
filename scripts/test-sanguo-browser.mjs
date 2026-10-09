import assert from 'node:assert/strict'
import { openBrowser } from './browser-cdp.mjs'
import { fixture,hand,setHero,equipment,play } from './fixtures/sanguo.mjs'
import { chooseAI } from '../.vuepress/components/sanguo/ai.mjs'
import { playerView, allCards } from '../.vuepress/components/sanguo/engine.mjs'
const browser=await openBrowser({name:'sanguo',baseUrl:process.env.SANGUO_TEST_URL,route:'/blogs/other/sanguo.html'})
const {evaluate,tap,viewport,screenshot}=browser
const ready=async()=>{await browser.navigate();await browser.waitFor('!!window.__sanguoUI && !!document.querySelector(".sg-lobby")')}
const feedback=async()=>{
  await tap('[data-game-feedback]');await browser.waitFor('!!document.querySelector("#game-feedback-modal .veditor")')
  await new Promise(resolve=>setTimeout(resolve,150))
  assert.equal(await evaluate('document.querySelector("#game-feedback-modal").hidden'),false)
}
const closeFeedback=async()=>{await tap('[data-gf-close]');await browser.waitFor('document.querySelector("#game-feedback-modal").hidden')}
const inject=async state=>evaluate(`(()=>{const ui=window.__sanguoUI;clearTimeout(ui.timer);ui.schedule=()=>{};ui.state=${JSON.stringify(state)};ui.lobby=false;ui.paused=false;ui.modal=null;ui.resetSelection();ui.render();return true})()`)
const geometry=()=>evaluate(`(()=>{const root=document.querySelector('.sg-app'),r=root.getBoundingClientRect(),dock=document.querySelector('.sg-dock'),d=dock?.getBoundingClientRect(),buttons=Array.from(document.querySelectorAll('.sg-action-row button')).map(b=>{const q=b.getBoundingClientRect();return {name:b.textContent.trim(),y:q.y,bottom:q.bottom,height:q.height}});return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,root:{x:r.x,y:r.y,width:r.width,height:r.height},dock:d?{top:d.top,bottom:d.bottom}:null,buttons}})()`)
try {
  for(const size of [[390,844],[844,390],[667,375],[320,568],[1280,900]]) {
    await viewport(...size);await ready()
    await evaluate('localStorage.removeItem("vectorac.sanguo.save.v1");true');await ready()
    assert.equal(await evaluate('document.querySelectorAll(".sg-hero-pick").length'),12)
    assert.ok(await evaluate('document.querySelector(".sg-lobby-copy h1").getBoundingClientRect().height>0'),'lobby title remains visible despite site heading styles')
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    await screenshot(`${size[0]}-lobby`)
    await tap('[data-sg="hero"][data-id="guanyu"]');await tap('[data-sg="role"][data-value="lord"]');await tap('[data-sg="start"]')
    await browser.waitFor('!!document.querySelector(".sg-hand")')
    assert.equal(await evaluate('window.__sanguoUI.state.players[0].role'),'lord')
    const actual=await geometry();assert.ok(actual.scroll<=size[0]+1,JSON.stringify({size,...actual}));assert.ok(actual.dock.bottom<=size[1]+1,JSON.stringify({size,...actual}))
    for(const button of actual.buttons)assert.ok(button.bottom<=size[1]+1&&button.y>=0,`${size}: ${button.name} remains visible`)
    const playersVisible=await evaluate('(()=>{const arena=document.querySelector(".sg-arena").getBoundingClientRect();return Array.from(document.querySelectorAll(".sg-player")).every(el=>{const rect=el.getBoundingClientRect();return rect.top>=arena.top&&rect.bottom<=arena.bottom+1})})()')
    assert.ok(playersVisible,`${size}: all four opponents are fully visible`)
    await screenshot(`${size[0]}-table`)
    let s=fixture();const [sha]=hand(s,0,'sha');hand(s,0,'shan','tao');await inject(s)
    await tap(`[data-sg="card"][data-id="${sha.id}"]`);await tap('[data-player="1"] [data-sg="target"]');await tap('[data-sg="confirm"]')
    assert.equal(await evaluate('window.__sanguoUI.state.pending.actor'),1,'real touch sequence sends a legal slash')
    assert.equal(await evaluate('window.__sanguoUI.state.players[0].hand.length'),2)
    await tap('[data-sg="rules"]');assert.equal(await evaluate('!!document.querySelector(".sg-modal")'),true)
    const modal=await evaluate('(()=>{const r=document.querySelector(".sg-modal").getBoundingClientRect(),b=document.querySelector(".sg-modal-body");return {top:r.top,bottom:r.bottom,scroll:b.scrollHeight> b.clientHeight}})()')
    assert.ok(modal.top>=0&&modal.bottom<=size[1]+1);await screenshot(`${size[0]}-rules`);await tap('.sg-modal [data-sg="close"]')
    await feedback();await closeFeedback()
    // Actual engine-created double-dodge prompt; tap the two separate replies.
    s=fixture('guanyu','loyal',1);setHero(s,1,'lvbu');const [attack]=hand(s,1,'sha'),dodges=hand(s,0,'shan','shan');s=play(s,attack,0);await inject(s)
    assert.equal(await evaluate('window.__sanguoUI.state.pending.remaining'),2)
    await tap(`[data-sg="card"][data-id="${dodges[0].id}"]`);await tap('[data-sg="confirm"]')
    assert.equal(await evaluate('window.__sanguoUI.state.pending.remaining'),1)
    const revision=await evaluate('window.__sanguoUI.state.revision')
    await viewport(size[1],size[0]);assert.equal(await evaluate('window.__sanguoUI.state.revision'),revision,'rotation preserves response and cards')
    await viewport(...size)
    await tap(`[data-sg="card"][data-id="${dodges[1].id}"]`);await tap('[data-sg="confirm"]')
    assert.equal(await evaluate('window.__sanguoUI.state.players[0].hp'),s.players[0].maxHp)
    // Dying rescue is offered as an explicit playable Peach, and survives reload.
    s=fixture('guanyu','loyal',1);s.players[0].hp=1;const [damage]=hand(s,1,'sha'),[peach]=hand(s,0,'tao');s=play(s,damage,0);await inject(s)
    await tap('[data-sg="response"]');assert.equal(await evaluate('window.__sanguoUI.state.pending.kind'),'rescue')
    await screenshot(`${size[0]}-rescue`)
    await tap(`[data-sg="card"][data-id="${peach.id}"]`);await tap('[data-sg="confirm"]')
    assert.equal(await evaluate('window.__sanguoUI.state.players[0].hp'),1)
    await ready();await tap('[data-sg="resume"]')
    assert.equal(await evaluate('window.__sanguoUI.state.players[0].hp'),1,'resume restores healed HP')
    await tap('[data-sg="pause"]');const pausedRevision=await evaluate('window.__sanguoUI.state.revision')
    await new Promise(resolve=>setTimeout(resolve,800));assert.equal(await evaluate('window.__sanguoUI.state.revision'),pausedRevision,'paused AI has no late action')
    // Long hands are scrollable, not clipped, and pool selection replaces hand.
    s=fixture();hand(s,0,...Array(12).fill('sha'));equipment(s,0,'spear');await inject(s)
    assert.ok(await evaluate('(()=>{const el=document.querySelector(".sg-hand");return el.scrollWidth>el.clientWidth})()'))
    await tap(`[data-sg="card"][data-id="${s.players[0].hand[0].id}"]`);await tap(`[data-sg="card"][data-id="${s.players[0].hand[1].id}"]`)
    assert.equal(await evaluate('window.__sanguoUI.selected.length'),2,'spear permits two selected hand cards')
    s=fixture();const [harvest]=hand(s,0,'harvest');s=play(s,harvest);await inject(s)
    assert.equal(await evaluate('document.querySelectorAll(".sg-pick-pool button").length'),5)
    const poolGeometry=await geometry();assert.ok(poolGeometry.dock.bottom<=size[1]+1,'harvest still fits short screen')
    await tap('.sg-pick-pool [data-sg="response"]');assert.equal(await evaluate('window.__sanguoUI.state.players[0].hand.length'),1)
  }
  // One complete rendered match: the app's own timers run all four AI seats,
  // while a test player drives only human-seat decisions through the same API.
  await viewport(390,844);await ready();await evaluate('localStorage.removeItem("vectorac.sanguo.save.v1");true');await ready()
  await tap('[data-sg="role"][data-value="lord"]');await tap('[data-sg="start"]')
  await tap('[data-sg="end"]')
  if(await evaluate('window.__sanguoUI.state.pending?.kind === "discard"')){
    const discard=await evaluate('window.__sanguoUI.state.players[0].hand.slice(0,window.__sanguoUI.state.pending.count).map(c=>c.id)')
    for(const id of discard)await tap(`[data-sg="card"][data-id="${id}"]`)
    await tap('[data-sg="confirm"]')
  }
  await feedback();const feedbackRevision=await evaluate('window.__sanguoUI.state.revision')
  await new Promise(resolve=>setTimeout(resolve,800));assert.equal(await evaluate('window.__sanguoUI.state.revision'),feedbackRevision,'feedback window pauses pending AI timers')
  await closeFeedback();await browser.waitFor(`window.__sanguoUI.state.revision>${feedbackRevision}`)
  await evaluate('window.__sanguoUI.pace=1;true')
  const started=Date.now();let complete=false
  while(Date.now()-started<35000){
    const snapshot=await evaluate('window.__sanguoUI.state')
    if(snapshot.phase==='finished'){complete=true;assert.equal(allCards(snapshot).length,108);break}
    assert.equal(await evaluate('window.__sanguoUI.paused'),false,'AI timer must not pause due to a failed action')
    const seat=snapshot.pending?.actor??snapshot.current
    if(seat===0){const action=chooseAI(playerView(snapshot,0));assert.ok(action);assert.equal(await evaluate(`window.__sanguoUI.act(${JSON.stringify(action)})`),true)}
    else await new Promise(resolve=>setTimeout(resolve,10))
  }
  assert.equal(complete,true,'rendered AI match terminates without a timer or response deadlock')
  await tap('[data-sg="report"]');assert.equal(await evaluate('document.querySelectorAll(".sg-result-roles>span").length'),5)
  await screenshot('complete-match')
  await browser.navigate('/blogs/other/games.html')
  assert.equal(await evaluate('document.body.classList.contains("sg-page-active")'),false,'leaving restores the site surface')
  assert.deepEqual(browser.errors,[])
  console.log(JSON.stringify({passed:true,origin:browser.origin,viewports:5,screenshots:browser.output}))
}catch(error){console.log(JSON.stringify({failed:true,screenshot:await screenshot('failure'),geometry:await geometry()}));throw error}
finally{await browser.close()}
