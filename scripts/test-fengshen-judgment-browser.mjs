import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog,dispatch,playerView} from '../site/.vuepress/components/fengshen/engine.mjs'
let s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['yuding','jifa','nezha','jinling','daji'],seed:23})
Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],pending:null,phase:'play',current:1,logs:[],lastPlayed:null,lastResponse:null,publicReveal:null})
for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0};p.hp=p.maxHp}
const take=type=>s.deck.splice(s.deck.findIndex(c=>c.type===type),1)[0]
const armor=take('bagua'),attack=take('sha'),judged=take('guanshi')
s.players[0].equip.armor=armor;s.players[1].hand=[attack];s.deck.unshift(judged)
const played=dispatch(s,{seat:1,type:'play',as:'sha',ids:[attack.id],targets:[0]});assert.ok(played.ok,played.error);s=played.state
const bagua=playerView(s,0).legal.find(a=>a.type==='bagua');assert.ok(bagua)
const b=await openBrowser({name:'gods-judgment-single-face',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h] of [[932,430],[812,375],[390,844]]){
  await b.viewport(w,h)
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return u.act(${JSON.stringify({...bagua,seat:0})})})()`)
  assert.equal(await b.evaluate('window.__fengshenUI.state.pending.kind'),'reveal')
  assert.equal(await b.evaluate(`document.querySelectorAll('[data-judge-card="${judged.id}"]').length`),1)
  assert.equal(await b.evaluate(`document.querySelectorAll('[data-judge-card="${judged.id}"] .fs-judge-stamp').length`),1)
  await b.evaluate('window.__fengshenUI.act({type:"ack",seat:0});true')
  const result=await b.evaluate(`(()=>{const u=window.__fengshenUI;u.decorateBattle();const flight=document.querySelector('.fs-transfer-flight[data-transfer-mode="judgment"]');return {table:document.querySelectorAll('[data-judge-card="${judged.id}"]').length,flight:!!flight,tableIds:u.tableTrail.filter(e=>e.judgment&&e.cards.some(c=>c.id===${JSON.stringify(judged.id)})).length,received:u.state.players[0].hand.some(c=>c.id===${JSON.stringify(judged.id)})}})()`)
  console.log('judgment receive',w,h,result)
  assert.ok(result.received);assert.ok(result.flight);assert.equal(result.table,0,'original table face must not stay beside its moving copy');assert.equal(result.tableIds,0,'received judgment must not return to table after animation')
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('.fs-hand-card[data-id="${judged.id}"]')).visibility`),'hidden','incoming hand card stays a placeholder until arrival')
  console.log('screenshot',await b.screenshot(`${w}x${h}-receive`))
  await b.evaluate('window.__fengshenUI.transfer.until=Date.now()-1;window.__fengshenUI.decorateBattle();true')
  assert.equal(await b.evaluate(`getComputedStyle(document.querySelector('.fs-hand-card[data-id="${judged.id}"]')).visibility`),'visible')
  await b.evaluate('window.__fengshenUI.transfer=null;window.__fengshenUI.render();true')
  assert.equal(await b.evaluate(`document.querySelectorAll('[data-judge-card="${judged.id}"]').length`),0,'finished flight cannot resurrect the old table judgment')
  console.log(`PASS ${w}x${h}: result on original card, one moving face, receive/expiry/rerender without duplication`)
 }
 assert.deepEqual(b.errors,[])
}finally{await b.close()}
