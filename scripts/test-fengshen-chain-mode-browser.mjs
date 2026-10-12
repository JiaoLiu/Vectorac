import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../.private/fengshen/engine.mjs'
// 缚神索选目标后默认为「连接」；出牌栏需提供「连接/解除」切换，
// 避免 A-B 已连、再连 B-C 时把已连接的 B 翻掉。
function fixture(){
 const s=createAssignedGame({heroIds:['tsukuyomi','jifa','nezha','dixin','moliqing'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],harvestPool:[],pending:null,lastPlayed:null,lastResponse:null,exchange:null,phase:'play',current:0,turns:0,logs:[],winner:null})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0};p.chained=false}
 const i=s.deck.findIndex(c=>c.suit==='club'),card=s.deck.splice(i,1)[0]
 s.players[0].hand.push(card);s.players[1].chained=true
 return {s,cardId:card.id}
}
const b=await openBrowser({name:'gods-chain-mode',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
try{
 await b.viewport(812,375);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 const {s,cardId}=fixture()
 await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.selected=[${JSON.stringify(cardId)}];u.as='ironchain';u.targets=[1,2];u.render();u.onViewport();return true})()`)
 await b.waitFor('!!document.querySelector(\'.fs-action-row [data-action="chain-mode"]\')')
 const before=await b.evaluate(`(()=>{const btn=document.querySelector('.fs-action-row [data-action="chain-mode"]');return {label:btn.textContent,status:(document.querySelector('.fs-status')||{}).textContent||''}})()`)
 assert.ok(before.label.includes('改为解除'),'default chain mode offers a switch to 解除: '+JSON.stringify(before))
 assert.ok(before.status.includes('进入连环'),'default instruction says 进入连环: '+JSON.stringify(before))
 await b.evaluate(`document.querySelector('.fs-action-row [data-action="chain-mode"]').click()`)
 await b.waitFor('(document.querySelector(\'.fs-action-row [data-action="chain-mode"]\')||{}).textContent==="改为连接"')
 const after=await b.evaluate(`(()=>{const u=window.__fengshenUI,btn=document.querySelector('.fs-action-row [data-action="chain-mode"]');return {label:btn.textContent,reset:u.chainReset,status:(document.querySelector('.fs-status')||{}).textContent||''}})()`)
 assert.equal(after.reset,true,'clicking the toggle arms 解除 mode')
 assert.ok(after.label.includes('改为连接'),'toggle flips back to 连接: '+JSON.stringify(after))
 assert.ok(after.status.includes('解除连环'),'instruction follows the 解除 mode: '+JSON.stringify(after))
 assert.deepEqual(b.errors,[])
 console.log('PASS 缚神索出牌栏「连接/解除」切换: '+JSON.stringify({before:before.label,after:after.label}))
}finally{await b.close()}