// Two isolated, real Chromium clients and real local WS service. Not real iOS.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {resolve,extname} from 'node:path'
import {createServer} from '../mahjong-service/server.js'
import {createAssignedGame,catalog} from '../.private/fengshen/engine.mjs'
import {openBrowser} from './browser-cdp.mjs'
const service=createServer({logger:()=>{}}),clients=[],root=resolve('public'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav'}
// Test-only static handler; no production config/server routes are modified.
service.server.removeAllListeners('request');service.server.on('request',async(req,res)=>{
 if(req.url.startsWith('/api/'))return service.app(req,res)
 const path=new URL(req.url,'http://test').pathname,file=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));if(!file.startsWith(root+'/')){res.writeHead(403).end();return}
 try{res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file))}catch{res.writeHead(404).end()}
})
try{
 await new Promise(r=>service.server.listen(0,'127.0.0.1',r));const baseUrl='http://127.0.0.1:'+service.server.address().port
 const {room,player:p0}=service.manager.createRoom({gameType:'fengshen',rules:{mode:'1v1'},displayName:'测试甲'}),{player:p1}=await service.manager.joinRoom({roomCode:room.roomCode,displayName:'测试乙'})
 for(const [i,p]of [p0,p1].entries()){
  const b=await openBrowser({name:'gods-online-'+i,baseUrl,route:'/games/fengshen/',extraArgs:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});clients.push(b);await b.send('Page.addScriptToEvaluateOnNewDocument',{source:'(()=>{const Native=window.Audio;window.__qaAudios=[];window.Audio=function(...args){const a=new Native(...args);window.__qaAudios.push(a);return a};window.Audio.prototype=Native.prototype})()'});await b.viewport(430,932);await b.navigate();await b.waitFor('!!window.__fengshenUI')
  assert.equal(await b.evaluate('document.querySelector(".fs-online-entry").getBoundingClientRect().height'),46,'portrait entry must not become a tall flex track')
  await b.evaluate(`localStorage.setItem('scmj-online-cred',${JSON.stringify(JSON.stringify({...p,gameType:'fengshen'}))});localStorage.setItem('vectorac.fengshen.internal.prefs.v1',JSON.stringify({voice:false,music:false,hints:true,pace:650}));true`)
  await b.navigate('/games/fengshen/?room='+room.roomCode);await b.waitFor('window.__fengshenUI.online?.ready&&!!document.querySelector(".fs-network-wait")');assert.equal(await b.evaluate('document.querySelectorAll(".fs-net-seats article").length'),2)
  assert.equal(await b.evaluate('document.querySelector(".fs-app").classList.contains("fs-force-landscape")'),false,'waiting room must remain naturally portrait')
  assert.equal(await b.evaluate('!!document.querySelector(".fs-online-bar")'),false)
  console.log('portrait room screenshot:',await b.screenshot('waiting-room-portrait'))
 }
 assert.equal(await clients[0].evaluate('document.querySelector("[data-online=start]").disabled'),true)
 await clients[1].tap('[data-online="ready"]');await clients[0].waitFor('window.__fengshenUI.online.room.seats[1].ready');assert.equal(room.status,'WAITING')
 await clients[1].tap('[data-online="ready"]');await clients[0].waitFor('!window.__fengshenUI.online.room.seats[1].ready')
 for(const b of clients)await b.tap('[data-online="ready"]')
 await clients[0].waitFor('!document.querySelector("[data-online=start]").disabled')
 await clients[0].tap('[data-online="start"]')
 for(const b of clients)await b.viewport(932,430)
 for(const b of clients){await b.waitFor('!!document.querySelector(".fs-draft-pick")');await b.tap('.fs-draft-pick');await b.tap('[data-action="draft-pick"]')}
 for(const [seat,b]of clients.entries()){await b.waitFor('!!window.__fengshenUI.state');assert.equal(await b.evaluate('window.__fengshenUI.state.players[1].hand.length'),0);assert.equal(await b.evaluate('window.__fengshenUI.state.players[0].hand.length'),room.gameSession.state.s.players[seat].hand.length)}
 // Controlled authoritative mid-game checkpoint isolates the nonzero-seat path.
 const gs=room.gameSession,s=createAssignedGame({roles:['lord','rebel'],heroIds:['yangjian','hades'],sides:[0,1],seed:23,firstSeat:1})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:1,logs:[],lastPlayed:null,lastResponse:null,exchange:null,publicReveal:null,eventId:gs.state.s.eventId+100,revision:gs.state.s.revision+1})
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=2}
 const index=s.deck.findIndex(c=>c.type==='sha'),sha=s.deck.splice(index,1)[0];s.players[1].hand.push(sha)
 // Give defender a Dodge, so both clients genuinely take a turn in the response.
 const dodge=s.deck.splice(s.deck.findIndex(c=>c.type==='shan'),1)[0];s.players[0].hand.push(dodge)
 gs.closeWindow();gs.state={...gs.state,setup:null,s,version:gs.state.version+1,action:null};gs.syncWindow();service.hub.pushGameState(room,gs)
 for(const b of clients)await b.waitFor(`window.__fengshenUI.state?.revision===${s.revision}`)
 const attack=clients[1],defense=clients[0];await attack.tap('.fs-hand-card[data-id="'+sha.id+'"]');await attack.tap('[data-player="1"] .fs-player-main');await attack.tap('.fs-actions [data-action="confirm"]')
 await defense.waitFor('window.__fengshenUI.state.pending?.actor===0');assert.equal(await defense.evaluate('window.__fengshenUI.state.pending.source'),1)
 await defense.tap('.fs-actions [data-action="response"][data-value="'+await defense.evaluate('window.__fengshenUI.state.networkView.legal.findIndex(a=>a.type==="pass")')+'"]')
 await attack.waitFor('window.__fengshenUI.state.players[0].hp===3');assert.equal(await defense.evaluate('window.__fengshenUI.state.players[0].hp'),1)
 assert.equal(await attack.evaluate('document.querySelector(".fs-own-hero .fs-heal-number")?.textContent'),'+1')
 console.log('online landscape screenshot:',await attack.screenshot('seat-one-attack-and-recover'))
 for(const b of clients)await b.evaluate('window.__fengshenUI.voice.setEnabled(true);true')
 await attack.tap('[data-chat="toggle"]');await attack.tap('[data-chat="phrase"][data-idx="2"]');await defense.waitFor('window.__fengshenUI.online.messages.some(m=>m.phrase===2)');await defense.waitFor('window.__qaAudios.some(a=>a.src.endsWith("/audio/gamehall/fengshen/phrase-2.mp3")&&!a.paused&&a.currentTime>0)',6000)
 await attack.evaluate('window.__fengshenUI.online.lastSent=0;true');await new Promise(r=>setTimeout(r,1100));await attack.tap('[data-chat="toggle"]');await attack.tap('[data-online="effect"][data-effect="0"]');await attack.tap('[data-player="1"] .fs-player-main');await defense.waitFor('!!document.querySelector(".fs-social-flight")')
 assert.equal(await defense.evaluate('window.__fengshenUI.online.interactions.at(-1).targetSeat'),0);console.log('interaction screenshot:',await defense.screenshot('directed-rose'))
 await attack.viewport(430,932);await attack.waitFor('document.querySelector(".fs-app").classList.contains("fs-force-landscape")');await attack.tap('[data-chat="toggle"]');const panel=await attack.evaluate('(()=>{const r=document.querySelector("[data-chat-panel]").getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,w:innerWidth,h:innerHeight}})()');assert.ok(panel.top>=-1&&panel.bottom<=panel.h+1&&panel.left>=-1&&panel.right<=panel.w+1,JSON.stringify(panel))
 await attack.tap('[data-chat="toggle"]')
 const dock=await attack.evaluate('(()=>{const r=document.querySelector("[data-chat=toggle]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
 await attack.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[dock]});await attack.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:dock.x,y:160}]});await attack.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(await attack.evaluate('!!localStorage.getItem("gkr-dock-pos")'))
 await attack.viewport(932,430);await attack.tap('[data-chat="toggle"]')
 const mic=await attack.evaluate('(()=>{const r=document.querySelector("[data-chat=mic]").getBoundingClientRect();window.__qaDock=document.querySelector("[data-gkr-voice-dock]");return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
 await attack.evaluate(`(()=>{const u=window.__fengshenUI,original=u.inform.bind(u),onError=u.online.net.onError;window.__qaVoice=[];u.inform=text=>{window.__qaVoice.push(text);return original(text)};u.online.net.onError=e=>{window.__qaVoice.push({code:e.errorCode,message:e.message});onError?.(e)};return true})()`)
 // Relay intentionally rate-limits voice for 2 s after any room communication.
 await new Promise(r=>setTimeout(r,2100))
 await attack.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[mic]});try{await attack.waitFor('window.__fengshenUI.online.recorder?._recorder?.state==="recording"')}catch(e){console.log(await attack.evaluate('({toast:window.__fengshenUI.toast,recorder:!!window.__fengshenUI.online.recorder,panelHidden:document.querySelector("[data-chat-panel]").hidden})'));console.log('recording failure screenshot:',await attack.screenshot('recording-failure'));throw e}await attack.evaluate('window.__fengshenUI.render();true');assert.equal(await attack.evaluate('window.__qaDock===document.querySelector("[data-gkr-voice-dock]")'),true);await new Promise(r=>setTimeout(r,1200));await attack.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await defense.waitFor('window.__fengshenUI.online.messages.some(m=>m.voice)',10000);await defense.waitFor('window.__qaAudios.some(a=>a.src.startsWith("data:audio/")&&a.src.length>1000&&!a.paused&&a.currentTime>0)',10000)
 const before=gs.state.s.revision;await attack.navigate('/games/fengshen/?room='+room.roomCode);await attack.waitFor('window.__fengshenUI.online?.ready&&!!window.__fengshenUI.state');assert.equal(await attack.evaluate('window.__fengshenUI.state.revision'),before);assert.equal(await attack.evaluate('window.__fengshenUI.online.meta.mySeat'),1)
 assert.equal(await attack.evaluate('!!localStorage.getItem("vectorac.fengshen.classic-original.save.v2")'),false,'network views never overwrite offline saves')
 await attack.evaluate('window.__fengshenUI.online.net.ws.close();true');await attack.waitFor('window.__fengshenUI.online.status!=="open"');await attack.waitFor('window.__fengshenUI.online.ready',10000);assert.equal(await attack.evaluate('window.__fengshenUI.online.meta.mySeat'),1)
 // Finish through a real killing Slash, then prepare back in the same room for another independent draft.
 const oldGame=gs.gameId,fin=gs.state.s;fin.players[0].hp=1;fin.players[0].hand=[];fin.players[1].marks.sha=0;fin.current=1;fin.phase='play';fin.pending=null;const kill=fin.deck.splice(fin.deck.findIndex(c=>c.type==='sha'),1)[0];fin.players[1].hand=[kill];fin.revision++;gs.state.version++;gs.closeWindow();gs.syncWindow();service.hub.pushGameState(room,gs)
 await attack.waitFor(`window.__fengshenUI.state.revision===${fin.revision}`);await attack.tap('.fs-hand-card[data-id="'+kill.id+'"]');await attack.tap('[data-player="1"] .fs-player-main');await attack.tap('.fs-actions [data-action="confirm"]')
 for(const b of clients){await b.waitFor('window.__fengshenUI.online.waiting&&!!document.querySelector(".fs-round-result")');assert.equal(await b.evaluate('document.querySelector(".fs-app").classList.contains("fs-force-landscape")'),false)}
 assert.equal(room.status,'WAITING');assert.equal(room.roomCode,room.roomCode);await clients[0].tap('[data-online="ready"]');await clients[1].waitFor('window.__fengshenUI.online.room.seats[0].ready');assert.equal(room.status,'WAITING');await clients[1].tap('[data-online="ready"]');for(const b of clients)await b.waitFor('!!document.querySelector(".fs-draft-pick")');assert.notEqual(room.gameSession.gameId,oldGame);assert.equal(room.round,2)
 for(const b of clients)assert.deepEqual(b.errors,[])
 console.log('PASS two real Chromium/WS clients: portrait room, readiness, draft, privacy, social/recorded voice (fake mic), draggable dock, rotation, reconnect and next round; NOT iPhone Safari')
}catch(error){for(const b of clients){try{console.log('voice diagnostic',await b.evaluate('({errors:window.__qaVoice||[],state:window.__fengshenUI?.online?.recorder?._recorder?.state,startAt:window.__fengshenUI?.online?.recorder?._startAt,messages:window.__fengshenUI?.online?.messages.map(m=>({voice:m.voice,phrase:m.phrase})),runtime:!!window.__fengshenUI})'))}catch{}}throw error
}finally{for(const b of clients)await b.close();await service.close()}
