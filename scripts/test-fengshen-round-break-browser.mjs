// Render-only controlled fixtures in Chromium; never contacts a room service.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame} from '../.private/fengshen/engine.mjs'
const module=await build({entryPoints:['.private/fengshen/online.mjs'],bundle:true,write:false,format:'iife',globalName:'QARound',loader:{'.css':'empty'}}),b=await openBrowser({name:'gods-round-break',route:'/games/fengshen/'})
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI');await b.evaluate(module.outputFiles[0].text+';window.__qaRound=QARound;true')
 await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.online=new window.__qaRound.OnlineGame(u);u.online.cred={roomId:'fixture',roomCode:'QAROOM',playerId:'fixture-user',seatIndex:0};u.online.ready=true;u.online.status='open';return true})()`)
 for(const [w,h,mobile]of [[932,430,true],[667,375,true],[568,320,true],[430,932,true],[430,932,false]]){
  const s=createAssignedGame({roles:['lord','loyal','loyal','rebel','rebel','rebel','rebel','renegade'],heroIds:['yangjian','wenzhong','nezha','jinling','daji','jifa','hades','yuding'],seed:23})
  s.winner='lord';s.pending=null;s.queue=[];for(const p of s.players){p.hand=[];if(['rebel','renegade'].includes(p.role)){p.alive=false;p.hp=0}}
  await b.viewport(w,h);await b.evaluate(`(()=>{const u=window.__fengshenUI;u.clearEffects();u.reset();u.viewport.setMobileOverride(${mobile});u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.online.roomView=false;u.online.room={status:'WAITING',hasPlayed:true,round:1,seats:Array.from({length:8},(_,i)=>({seatIndex:i,occupantType:'HUMAN',displayName:'测试玩家'+(i+1),ready:i%2===1,connected:true}))};u.render();return true})()`)
  const result=await b.evaluate(`(()=>{const summary=document.querySelector('.fs-table-settle'),ready=document.querySelector('.fs-actions [data-online=ready]'),r=ready.getBoundingClientRect(),label=summary.querySelector('b').getBoundingClientRect();return {board:!window.__fengshenUI.online.waiting,enabled:!ready.disabled,text:ready.textContent,readyVisible:r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,titleVisible:label.left>=0&&label.top>=0&&label.right<=innerWidth+1&&label.bottom<=innerHeight+1,people:summary.querySelectorAll('[data-next-seat]').length,realClick:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-online=ready]')===ready}})()`)
  assert.ok(result.board);assert.ok(result.enabled);assert.equal(result.text,'准备下一轮');assert.ok(result.readyVisible&&result.titleVisible&&result.realClick,JSON.stringify(result));assert.equal(result.people,8)
  console.log('screenshot',await b.screenshot(w+'x'+h+(mobile?'':'-upright')))
 }
 await b.evaluate('window.__fengshenUI.online.room.status="FINISHED";window.__fengshenUI.render();true');assert.equal(await b.evaluate('!!document.querySelector(".fs-actions [data-online=ready]")'),false)
 assert.deepEqual(b.errors,[]);console.log('PASS ended eight-seat table: short landscape/virtual landscape/upright portrait, reachable ready control, visible roster, terminal room guard; NOT real Safari')
}finally{await b.close()}
