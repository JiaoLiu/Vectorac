// Real CSS/DOM regression in isolated Chromium; never joins a room or submits feedback.
import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog,dispatch} from '../site/.vuepress/components/fengshen/engine.mjs'

function fixture(count,current,target){
 const roles=count===5?['lord','loyal','rebel','rebel','renegade']:['lord','loyal','loyal','rebel','rebel','rebel','rebel','renegade']
 const s=createAssignedGame({roles,heroIds:['hades','jifa','nezha','yangjian','jinling','wenzhong','daji','leizhenzi'].slice(0,count),seed:23})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current,logs:[],lastPlayed:null})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0};p.hp=p.maxHp}
 const card=(seat,type)=>{const i=s.deck.findIndex(c=>c.type===type),c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
 const sha=card(current,'sha'),shan=card(target,'shan'),r=dispatch(s,{seat:current,type:'play',as:'sha',ids:[sha.id],targets:[target]})
 assert.ok(r.ok,r.error);assert.equal(r.state.pending.actor,target)
 return {state:r.state,shan}
}
const b=await openBrowser({name:'gods-response-ring',baseUrl:process.env.VECTORAC_BROWSER_ORIGIN||null,route:'/games/fengshen/'})
const frame=seat=>seat===0?'.fs-own-hero':`[data-player="${seat}"]`
let count=0
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const players of [5,8])for(const [current,target]of [[0,1],[1,0]]){
  const {state,shan}=fixture(players,current,target)
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.clearEffects();u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.state=${JSON.stringify(state)};u.lobby=false;u.setup=null;u.modal=null;u.reset();u.render();return true})()`)
  const check=()=>b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(frame(target))}),c=getComputedStyle(e),turn=document.querySelector(${JSON.stringify(frame(current))}),tc=getComputedStyle(turn),r=e.getBoundingClientRect();return {outer:e.classList.contains('fs-responding'),inner:!!e.querySelector('.fs-responding'),width:c.borderTopWidth,color:c.borderTopColor,turnColor:tc.borderTopColor,animation:c.animationName,pointer:getComputedStyle(e,':after').pointerEvents,inViewport:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,beams:!!document.querySelector('.fs-target-lines')}})()`)
  let result=await check();assert.ok(result.outer);assert.equal(result.inner,false);assert.equal(result.width,'3px');assert.equal(result.color,'rgb(255, 224, 138)');assert.equal(result.turnColor,'rgb(119, 255, 220)');assert.equal(result.animation,'fs-respond-pulse');assert.equal(result.pointer,'none');assert.ok(result.inViewport)
  // Expire the public beam without ending the pending response.
  await b.waitFor('!document.querySelector(".fs-target-lines")',4000);result=await check();assert.ok(result.outer);assert.equal(result.width,'3px')
  await b.viewport(430,932);await b.waitFor('document.querySelector(".fs-responding")?.getBoundingClientRect().height>0');assert.ok((await check()).outer)
  await b.viewport(932,430);await b.evaluate('window.__fengshenUI.onViewport()');result=await check();assert.ok(result.outer);assert.ok(result.inViewport)
  await b.waitFor('[...document.querySelectorAll(".fs-player img,.fs-own-hero img")].every(i=>i.complete)',15000)
  console.log('screenshot',await b.screenshot(`${players}-players-${target===0?'self':'other'}-responding`))
  const ended=await b.evaluate(`(()=>{const u=window.__fengshenUI;const ok=u.act({seat:${target},type:'respond',as:'shan',ids:[${JSON.stringify(shan.id)}]});return {ok,ring:!!document.querySelector('.fs-responding'),turn:!!document.querySelector(${JSON.stringify(frame(current)+'.turn-active')})}})()`)
  assert.ok(ended.ok);assert.equal(ended.ring,false);assert.ok(ended.turn);count++
 }
 assert.deepEqual(b.errors,[]);console.log('PASS',count,'five/eight-player self/other response frames, beam expiry and rotation; NOT physical Safari acceptance')
}finally{await b.close()}
