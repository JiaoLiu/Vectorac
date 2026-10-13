// Real CSS and touch selection; never joins a room or submits feedback.
import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['yangjian','jifa','nezha','jinling','daji'],seed:23})
Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:0,logs:[],lastPlayed:null,lastResponse:null,publicReveal:null})
for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0};p.hp=p.maxHp}
const take=type=>s.deck.splice(s.deck.findIndex(c=>c.type===type),1)[0]
const slash=take('sha'),weapon=take('dualsword');s.players[0].hand=[slash,weapon,take('shan'),take('snatch')]
const b=await openBrowser({name:'gods-card-face',route:'/games/fengshen/'})
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[932,430],[812,375],[430,932]]){
  await b.viewport(w,h)
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.hints=true;u.reset();u.render();return true})()`)
  await b.tap('.fs-hand-card[data-id="'+weapon.id+'"]')
  assert.equal(await b.evaluate('window.__fengshenUI.modal'),null)
  const tip=await b.evaluate(`(()=>{const e=document.querySelector('.fs-selected-tip'),r=e.getBoundingClientRect(),c=getComputedStyle(e);return {text:e.textContent,display:c.display,pointer:c.pointerEvents,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()`)
  assert.ok(tip.text.includes('攻击距离 2'));assert.ok(tip.text.includes('弃一张手牌'));assert.ok(tip.text.includes('摸一张牌'));assert.equal(tip.pointer,'none');assert.notEqual(tip.display,'none');assert.ok(tip.x>=0&&tip.y>=0&&tip.right<=w+1&&tip.bottom<=h+1,JSON.stringify(tip))
  await b.tap('.fs-hand-card[data-id="'+slash.id+'"]');await b.tap('[data-player="1"] .fs-player-main');assert.equal(await b.evaluate('window.__fengshenUI.targets[0]'),1)
  await b.evaluate(`(()=>{const u=window.__fengshenUI;const f=document.createElement('span');f.className='fs-card-play';f.innerHTML=document.querySelector('.fs-hand-card[data-id="${slash.id}"]').innerHTML;document.querySelector('.fs-arena').append(f);f.style.cssText='position:absolute;left:45%;top:40%;width:60px;height:86px';u.renderCardProbe=f;return true})()`)
  const same=await b.evaluate(`(()=>{const hand=document.querySelector('.fs-hand-card[data-id="${slash.id}"] .fs-card-design'),table=document.querySelector('.fs-arena>.fs-card-play .fs-card-design'),style=e=>{const c=getComputedStyle(e);return ['left','top','bottom','width','height','fontFamily','fontSize','borderWidth','boxShadow','opacity'].map(k=>c[k])};return {image:JSON.stringify(style(hand.querySelector('img')))===JSON.stringify(style(table.querySelector('img'))),title:JSON.stringify(style(hand.querySelector('strong')))===JSON.stringify(style(table.querySelector('strong'))),inner:getComputedStyle(hand).boxShadow,imageBorder:getComputedStyle(hand.querySelector('img')).borderWidth}})()`)
  assert.equal(same.image,true);assert.equal(same.title,true);assert.equal(same.inner,'none');assert.equal(same.imageBorder,'0px')
  await b.evaluate('window.__fengshenUI.renderCardProbe.remove();true');console.log('screenshot',await b.screenshot(w+'x'+h+'-selected'))
  await b.evaluate('window.__fengshenUI.hints=false;window.__fengshenUI.render();true');assert.equal(await b.evaluate('!!document.querySelector(".fs-selected-tip")'),false)
 }
 assert.deepEqual(b.errors,[]);console.log('PASS three viewport sizes: real touch selection/targeting, visible nonblocking aid, identical hand/table face styles, no internal borders; NOT physical Safari')
}finally{await b.close()}
