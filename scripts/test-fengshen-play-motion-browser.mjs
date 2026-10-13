import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
const s=createAssignedGame({roles:['lord','rebel','rebel','loyal','renegade'],heroIds:['yangjian','jifa','nezha','jinling','daji'],seed:23})
Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],pending:null,phase:'play',current:4,logs:[],lastPlayed:null,lastResponse:null,exchange:null,publicReveal:null})
for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp}
const take=type=>s.deck.splice(s.deck.findIndex(c=>c.type===type),1)[0]
const attack=take('arrows'),ownCounter=take('nullify'),helperCounter=take('nullify')
s.players[4].hand=[attack];s.players[0].hand=[ownCounter,take('shan')];s.players[3].hand=[helperCounter]
const b=await openBrowser({name:'gods-public-play-flight',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[932,430],[812,375],[390,844]]){
  await b.viewport(w,h)
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return u.act({seat:4,type:'play',as:'arrows',ids:[${JSON.stringify(attack.id)}],targets:[]})})()`)
  assert.equal(await b.evaluate('document.querySelector(".fs-play-flight").dataset.playSource'),'4')
  // 4 号席是当前回合者（蓝绿）：出牌时不再叠一圈金色外框，否则蓝绿被盖住看不出轮到谁。
  assert.equal(await b.evaluate('document.querySelector(\'[data-player="4"]\').classList.contains("fs-public-caster")'),false,'current turn player keeps blue-green instead of an extra gold caster frame')
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('[data-table-card="${attack.id}"]')).visibility`),'hidden')
  await b.waitFor('!window.__fengshenUI.playMotions.busy')
  await b.waitFor('!document.querySelector(".fs-dock").inert')
  assert.ok(await b.evaluate('document.querySelectorAll(".fs-beam-core").length>0'),'original AOE beams are retained during their 2.5s lifetime')
  assert.equal(await b.evaluate('window.__fengshenUI.state.pending.actor'),0)
  assert.equal(await b.evaluate('window.__fengshenUI.state.pending.target'),0)
  assert.equal(await b.evaluate(`document.querySelector('[data-impact-target="0"]').dataset.impactKind`),'damage')
  assert.equal(await b.evaluate(`!!document.querySelector('[data-caster-seat="3"]')`),false,'a holder is not highlighted before publicly responding')
  const pass=await b.evaluate('window.__fengshenUI.state.pending&&window.__fengshenUI.state.pending.actor===0&&window.__fengshenUI.state.pending.kind==="counter"?window.__fengshenUI.state.pending:null')
  assert.ok(pass)
  const index=await b.evaluate('window.__fengshenUI.state&&window.__fengshenUI.root.querySelectorAll(".fs-action-row [data-action=response]").length')
  assert.ok(index)
  await b.tap('.fs-action-row [data-action="response"]')
  assert.equal(await b.evaluate('window.__fengshenUI.state.pending.actor'),3)
  await b.evaluate(`window.__fengshenUI.act({seat:3,type:'respond',ids:[${JSON.stringify(helperCounter.id)}],as:'nullify'});true`)
  const shown=await b.evaluate(`(()=>{const u=window.__fengshenUI,f=document.querySelector('.fs-play-flight'),q=u.playMotions.frame();return {source:f?.dataset.playSource,target:q?.event.focus.target,blocked:q?.event.focus.negated,kind:q?.event.focus.kind,privateRole:document.querySelector('[data-player="3"] .fs-player-role')?.textContent}})()`)
  assert.equal(shown.source,'3');assert.equal(shown.target,0);assert.equal(shown.blocked,true);assert.equal(shown.kind,'damage')
  // 3 号席不是当前回合者：响应出牌仍保留"刚才是谁出的"金色外框。
  assert.ok(await b.evaluate('document.querySelector(\'[data-player="3"]\').classList.contains("fs-public-caster")'),'a non-turn responder still gets the gold caster frame')
  const started=await b.evaluate('window.__fengshenUI.playMotions.frame().event.started')
  await b.evaluate('window.__fengshenUI.render();window.__fengshenUI.decorateBattle();true')
  assert.equal(await b.evaluate('window.__fengshenUI.playMotions.frame().event.started'),started,'render cannot restart flying card')
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('[data-table-card="${helperCounter.id}"]')).visibility`),'hidden')
  assert.equal(await b.evaluate('document.querySelectorAll(".fs-play-links,.fs-impact-symbol,.fs-play-source-symbol").length'),0,'no new yellow dashed overlay or extra badges')
  console.log('counter flight screenshot',await b.screenshot(`${w}x${h}-helper-counter`))
  await b.waitFor('!window.__fengshenUI.playMotions.busy')
  await b.waitFor('!document.querySelector(".fs-dock").inert')
  await b.waitFor('document.querySelectorAll(".fs-beam-core").length===0')
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('[data-table-card="${helperCounter.id}"]')).visibility`),'visible')
  // Now the lord counters that protection: same source/recipient geometry,
  // but the public effect is restored, not another protection shield.
  assert.equal(await b.evaluate('window.__fengshenUI.state.pending.actor'),0)
  await b.tap('.fs-actions [data-action="confirm"]')
  assert.equal(await b.evaluate('document.querySelector(".fs-play-flight").dataset.playSource'),'0')
  assert.equal(await b.evaluate('window.__fengshenUI.playMotions.frame().event.focus.negated'),false)
  await b.waitFor('!window.__fengshenUI.playMotions.busy')
  console.log(`PASS ${w}x${h}: AOE flight, own visual counter target, actual helper caster, nullify/reversal, landing once and no replay`)
 }
 for(const [type,kind]of [['harvest','gain'],['garden','heal']]){
  const x=structuredClone(s),old=x.players[4].hand.pop(),i=x.deck.findIndex(c=>c.type===type),c=x.deck.splice(i,1)[0];x.deck.push(old);x.players[4].hand=[c];x.players[4].hp=1
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.clearEffects();u.state=${JSON.stringify(x)};u.reset();u.render();return u.act({seat:4,type:'play',as:${JSON.stringify(type)},ids:[${JSON.stringify(c.id)}],targets:[]})})()`)
  await b.waitFor('!window.__fengshenUI.playMotions.busy')
  assert.equal(await b.evaluate('window.__fengshenUI.state.pending.actor'),0)
  const target=await b.evaluate('window.__fengshenUI.state.pending.target')
  await b.waitFor(`!!document.querySelector('[data-impact-target="${target}"]')`)
  assert.equal(await b.evaluate(`document.querySelector('[data-impact-target="${target}"]').dataset.impactKind`),kind)
  console.log('benefit target screenshot',await b.screenshot(`${type}-own-counter-target`))
  console.log(`PASS ${type}: own counter decision shows who will ${kind}, without reading a log`)
 }
 assert.deepEqual(b.errors,[])
}finally{await b.close()}
