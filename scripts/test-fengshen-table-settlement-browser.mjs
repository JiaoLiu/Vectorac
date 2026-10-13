import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
function fixture(weapon='crossbow'){
 const s=createAssignedGame({heroIds:['yangjian','jifa','nezha','dixin','moliqing'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],pending:null,lastPlayed:null,lastResponse:null,exchange:null,publicReveal:null,phase:'play',current:0,logs:[]})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0}}
 const take=type=>{const i=s.deck.findIndex(c=>c.type===type);assert.ok(i>=0,'Missing fixture type '+type);return s.deck.splice(i,1)[0]},cards={sha:take('sha'),draw:take('draw'),aoe:take('arrows'),next:take('sha'),costs:[take('shan'),take('tao')]}
 s.players[0].equip.weapon=take(weapon);s.players[0].hand=Object.values(cards).flat()
 for(let i=1;i<5;i++)s.players[i].hand=[take('shan')];s.players[1].hand.push(take('shan'))
 return {s,cards}
}
const b=await openBrowser({name:'gods-current-chain-only',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
const load=async s=>b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return true})()`)
const act=async a=>{const r=await b.evaluate(`(()=>{const u=window.__fengshenUI,ok=u.act(${JSON.stringify(a)});return {ok,error:u.toast,pending:u.state.pending?.kind,phase:u.state.phase,current:u.state.current,hand:ok?null:u.state.players[0].hand}})()`);assert.equal(r.ok,true,JSON.stringify(r))}
const landed=()=>b.waitFor('!window.__fengshenUI.playMotions.busy&&!document.querySelector(".fs-dock").inert')
const empty=()=>b.waitFor('document.querySelectorAll(".fs-table-trail .fs-card-play").length===0',6000)
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[932,430],[812,375],[390,844]]){
  await b.viewport(w,h);const {s,cards:c}=fixture();await load(s)
  await act({seat:0,type:'play',as:'sha',ids:[c.sha.id],targets:[1]});await landed()
  await act({seat:1,type:'respond',ids:[s.players[1].hand[0].id]});assert.equal(await b.evaluate('window.__fengshenUI.state.pending'),null)
  assert.equal(await b.evaluate('document.querySelectorAll(".fs-table-trail .fs-card-play").length'),2)
  await landed();await empty();await b.evaluate('window.__fengshenUI.render();window.__fengshenUI.onViewport();true');await empty()
  await act({seat:0,type:'play',as:'draw',ids:[c.draw.id],targets:[]})
  assert.deepEqual(await b.evaluate('Array.from(document.querySelectorAll(".fs-table-trail [data-table-card]")).map(e=>e.dataset.tableCard)'),[c.draw.id])
  await landed();await empty()
  await act({seat:0,type:'play',as:'arrows',ids:[c.aoe.id],targets:[]});await landed()
  for(let i=0;i<4;i++){
   const a=await b.evaluate('(()=>{const s=window.__fengshenUI.state,p=s.pending;return {seat:p.actor,type:"respond",ids:[s.players[p.actor].hand.find(c=>c.type==="shan").id]}})()')
   assert.equal(await b.evaluate(`!!document.querySelector('[data-table-card="${c.aoe.id}"]')`),true,'AOE stays until every victim completes')
   await act(a);await landed()
  }
  assert.equal(await b.evaluate('window.__fengshenUI.state.pending'),null);await empty()
  await act({seat:0,type:'play',as:'sha',ids:[c.next.id],targets:[1]})
  assert.deepEqual(await b.evaluate('Array.from(document.querySelectorAll(".fs-table-trail [data-table-card]")).map(e=>e.dataset.tableCard)'),[c.next.id])
  await landed();console.log('clean next Slash screenshot',await b.screenshot(`${w}x${h}-one-new-slash`));await empty()
  console.log(`PASS ${w}x${h}: Slash/Dodge clean, draw spell clean, all AOE victims finish, next Slash alone, rerender no resurrection`)
 }
 const {s,cards:c}=fixture('axe');await b.viewport(812,375);await load(s)
 await act({seat:0,type:'play',as:'sha',ids:[c.sha.id],targets:[1]});await landed();await act({seat:1,type:'respond',ids:[s.players[1].hand[0].id]});await landed()
 assert.equal(await b.evaluate('window.__fengshenUI.state.pending.kind'),'axe')
 assert.equal(await b.evaluate('document.querySelectorAll(".fs-table-trail .fs-card-play").length'),2)
 await act({seat:0,type:'respond',ids:c.costs.map(x=>x.id)});assert.equal(await b.evaluate('window.__fengshenUI.state.players[1].hp'),3);await empty()
 assert.equal(await b.evaluate('document.querySelectorAll(".fs-public-discard .fs-card-play").length'),0,'forced-hit discard costs leave with their completed chain')
 console.log('PASS Axe: Dodge does not clear prematurely, forced hit completes then the entire chain clears')
 // 横屏弃置/拆牌：牌桌中央会随结算清空，弃置牌必须压在中线上按横排放大，而不是缩在出牌行下方一小条。
 await b.viewport(812,375)
 {const {s}=fixture();await load(s)
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.discards={seat:1,by:0,cards:u.state.deck.slice(0,8),until:Date.now()+9e8};u.render();u.onViewport();return true})()`)
  await b.waitFor('[...document.querySelectorAll(".fs-public-discard .fs-card-play")].every(c=>c.getAnimations().every(a=>a.playState==="finished"))',3000)
  const dd=await b.evaluate(`(()=>{const row=document.querySelector('.fs-played.fs-public-discard'),card=row.querySelector('.fs-card-play'),c=document.querySelector('.fs-table-center').getBoundingClientRect(),r=row.getBoundingClientRect(),cr=card.getBoundingClientRect();return {h:Math.round(cr.height),pos:getComputedStyle(row).position,mid:Math.round((r.top+r.bottom)/2),bandMid:Math.round((c.top+c.bottom)/2)}})()`)
  assert.ok(dd.h>=60,'landscape public discard stays readable, not a tiny strip: '+JSON.stringify(dd))
  assert.equal(dd.pos,'absolute','landscape public discard overlays the table center instead of stacking below the play row')
  assert.ok(Math.abs(dd.mid-dd.bandMid)<24,'landscape public discard sits on the table midline: '+JSON.stringify(dd))
  console.log('PASS landscape public discard: '+JSON.stringify(dd))
 }
 assert.deepEqual(b.errors,[])
}finally{await b.close()}
