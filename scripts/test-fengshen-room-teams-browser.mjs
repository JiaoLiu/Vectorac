// Local controlled room DOM; no joins, ready commands or writes to production.
import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {build} from 'esbuild'
const bundle=await build({entryPoints:['.private/fengshen/online.mjs'],bundle:true,write:false,format:'iife',globalName:'QAOnline',platform:'browser',loader:{'.css':'empty'}})
const b=await openBrowser({name:'gods-room-teams',route:'/games/fengshen/'})
try{
 await b.viewport(430,932);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 // Build a browser-only OnlineGame to exercise the actual waiting renderer.
 // The two real WS client flow is tested separately by online-browser.
 await b.evaluate(bundle.outputFiles[0].text+';window.__qaOnline=QAOnline;true')
 await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.online=new window.__qaOnline.OnlineGame(u);u.online.ready=true;u.online.status='open';u.online.waiting=true;u.online.cred={roomCode:'QAONLY',roomId:'local-only',seatIndex:0,gameType:'fengshen'};u.lobby=false;u.state=null;u.setup=null;return true})()`)
 for(const mode of ['2v2','3v3','identity8'])for(const [w,h]of [[430,932],[932,430],[812,375]]){
  const n=mode==='2v2'?4:mode==='3v3'?6:8,me=mode==='3v3'?4:1
  await b.viewport(w,h)
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.online.room={roomCode:'QAONLY',status:'WAITING',adminSeat:0,rules:{mode:${JSON.stringify(mode)}},seatsPerRoom:${n},turnTimeoutSeconds:60,seats:Array.from({length:${n}},(_,i)=>({seatIndex:i,occupantType:i===${me}?'HUMAN':i===3?'AI':'EMPTY',displayName:i===${me}?'本机测试':i===3?'AI陪练':null,connected:i===${me},ready:i===3,isAdmin:i===0}))};u.online.event({type:'ROOM_SNAPSHOT',payload:{...u.online.room,mySeat:${me}}});return true})()`)
  const result=await b.evaluate(`(()=>{const u=window.__fengshenUI;return {force:u.root.classList.contains('fs-force-landscape'),guide:document.querySelector('.fs-room-teams')?.textContent||'',seats:[...document.querySelectorAll('[data-room-seat]')].map(e=>({seat:+e.dataset.roomSeat,side:e.dataset.teamSide,badge:e.querySelector('.fs-room-team')?.textContent||'',color:e.querySelector('.fs-room-team')?getComputedStyle(e.querySelector('.fs-room-team')).color:null}))}})()`)
  assert.equal(result.force,false);assert.equal(result.seats.length,n)
  for(const s of result.seats){if(mode==='identity8'){assert.equal(s.side,'');assert.equal(s.badge,'');continue}assert.equal(+s.side,s.seat%2);assert.ok(s.badge.includes(s.seat===me?' · 你':s.seat%2===me%2?'与你同队':'对方队伍'))}
  if(mode!=='identity8'){assert.ok(result.guide.includes(mode==='2v2'?'1、3 号':'1、3、5 号'));assert.notEqual(result.seats[0].color,result.seats[1].color)}else assert.equal(result.guide,'')
  console.log('screenshot',await b.screenshot(mode+'-'+w+'x'+h))
 }
 // Change seats through the same server-snapshot handler; relative ally labels must reverse.
 await b.evaluate(`(()=>{const u=window.__fengshenUI;u.online.room.rules.mode='2v2';u.online.room.seats=u.online.room.seats.slice(0,4);u.online.event({type:'ROOM_SNAPSHOT',payload:{...u.online.room,mySeat:0}});return true})()`)
 assert.equal(await b.evaluate(`document.querySelector('[data-room-seat="2"] .fs-room-team').textContent`),'青龙队 · 与你同队')
 assert.equal(await b.evaluate(`document.querySelector('[data-room-seat="1"] .fs-room-team').textContent`),'朱雀队 · 对方队伍')
 assert.deepEqual(b.errors,[]);console.log('PASS 2v2/3v3 fixed teams, self/AI/empty seats, identity privacy, nonzero seat and seat-change updates in 3 viewport sizes; NOT physical Safari')
}finally{await b.close()}
