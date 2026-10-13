import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
// 仙山采宝选牌弹窗：横屏下曾铺满整屏、盖住自己的手牌，只是牌面又被挤在中央留白。
function fixture(){
 const s=createAssignedGame({heroIds:['yangjian','jifa','nezha','dixin','moliqing'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],harvestPool:[],pending:null,lastPlayed:null,lastResponse:null,exchange:null,phase:'play',current:0,turns:0,logs:[]})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0}}
 s.harvestPool=s.deck.splice(0,5)
 s.players[0].hand=s.deck.splice(0,4)
 s.lastPlayed={id:1,as:'harvest',turn:0,source:0,cards:[{id:'hv',type:'harvest'}]}
 return s
}
const b=await openBrowser({name:'gods-choice-panel-landscape',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
try{
 await b.viewport(812,375);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[812,375],[932,430],[568,320]]){
  await b.viewport(w,h);await b.navigate('/games/fengshen/?cb='+w+'x'+h);await b.waitFor('!!window.__fengshenUI')
  const s=fixture()
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.harvestDoneId=null;u.reset();u.render();u.onViewport();return true})()`)
  await b.waitFor('!!document.querySelector(".fs-pool-choice .fs-choice-card")')
  await b.waitFor('[...document.querySelectorAll(".fs-pool-choice .fs-choice-card")].every(c=>c.getAnimations().every(a=>a.playState==="finished"))',3000)
  const m=await b.evaluate(`(()=>{const p=document.querySelector('.fs-pool-choice'),card=p.querySelector('.fs-choice-card'),pr=p.getBoundingClientRect(),cr=card.getBoundingClientRect(),dock=document.querySelector('.fs-dock').getBoundingClientRect();return {cardH:Math.round(cr.height),panelW:Math.round(pr.width),panelBottom:Math.round(pr.bottom),dockTop:Math.round(dock.top),vw:innerWidth}})()`)
  assert.ok(m.cardH<=96,'landscape pool cards are trimmed down instead of filling the screen: '+JSON.stringify(m))
  assert.ok(m.panelBottom<=m.dockTop,'landscape pool panel sits above the hand so the own hand stays visible: '+JSON.stringify(m))
  assert.ok(m.panelW<m.vw-16,'landscape pool panel hugs its cards instead of spanning the whole table width: '+JSON.stringify(m))
  console.log('PASS landscape pool panel '+w+'x'+h+': '+JSON.stringify(m))
 }
 assert.deepEqual(b.errors,[])
}finally{await b.close()}