// Explicit release smoke only: creates and then leaves its own two-person room.
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),WebSocket=require('../../mahjong-service/node_modules/ws'),base=process.env.FENGSHEN_SMOKE_ORIGIN||'https://vectorac.com',creds=[],clients=[]
async function http(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)}),j=await r.json();if(!r.ok||!j.ok)throw Error('HTTP '+r.status+' '+j.errorCode);return j.data}
function connect(p){const ws=new WebSocket(base.replace(/^http/,'ws')+'/mahjong-ws'),messages=[];ws.on('message',d=>messages.push(JSON.parse(d)));return {ws,messages,send:a=>ws.send(JSON.stringify(a)),async wait(pred){const start=Date.now();while(Date.now()-start<10000){const m=messages.find(pred);if(m)return m;await new Promise(r=>setTimeout(r,30))}throw Error('wire timeout')}}}
try{
 const deckVersion=process.env.FENGSHEN_SMOKE_DECK==='2'?2:1,created=await http('/api/rooms',{gameType:'fengshen',rules:{mode:'1v1',deckVersion},displayName:'发布自测甲',turnTimeoutSeconds:60});creds.push(created.player);const joined=await http('/api/rooms/join',{roomCode:created.room.roomCode,displayName:'发布自测乙'});creds.push(joined.player)
 for(const p of creds){const c=connect(p);clients.push(c);await new Promise((r,j)=>{c.ws.once('open',r);c.ws.once('error',j)});c.send({type:'RECONNECT',roomId:p.roomId,resumeToken:p.resumeToken});await c.wait(m=>m.type==='RECONNECTED')}
 for(const c of clients)c.send({type:'TOGGLE_READY',ready:true,requestId:'smoke-ready'})
 await clients[0].wait(m=>m.type==='READY_CHANGED'&&m.payload.seats.filter(s=>s.occupantType==='HUMAN').every(s=>s.ready))
 clients[0].send({type:'START_GAME',requestId:'smoke-start'})
 for(const c of clients){const m=await c.wait(m=>m.type==='GAME_STATE_CHANGED'&&m.payload.setup);const v=m.payload.setup;c.send({type:'PLAYER_ACTION',requestId:'smoke-pick-'+v.seat+'-'+m.payload.meta.mySeat,gameId:m.gameId,windowId:m.payload.meta.windowId,action:{type:'pick',heroId:v.candidates[0]}})}
 for(const c of clients){const m=await c.wait(m=>m.type==='GAME_STATE_CHANGED'&&m.payload.game);assert.equal(m.payload.game.deckVersion,deckVersion);assert.equal(m.payload.game.deckSize,deckVersion===2?160:108);assert.equal(m.payload.game.players[1].hand.length,0);assert.ok(m.payload.game.players[0].hand.length>0);for(const w of c.messages.filter(m=>m.type==='ACTION_WINDOW_OPENED'))assert.equal(w.payload.legalActionsBySeat,undefined)}
 clients[0].send({type:'CHAT_MSG',phrase:1,requestId:'smoke-chat'});await clients[1].wait(m=>m.type==='CHAT_MSG'&&m.payload.phrase===1);await new Promise(r=>setTimeout(r,1200));clients[0].send({type:'INTERACT_MSG',effect:0,targetSeat:1,requestId:'smoke-interact'});await clients[1].wait(m=>m.type==='INTERACT_MSG'&&m.payload.targetSeat===1)
 console.log(JSON.stringify({live:true,players:2,draft:true,privateViews:true,chat:true,interaction:true,roomCode:created.room.roomCode}))
}finally{
 for(const p of creds)await http('/api/rooms/leave',{resumeToken:p.resumeToken}).catch(e=>console.error('cleanup failed:',e.message))
 for(const c of clients)c.ws.terminate()
 console.log('owned_test_players_left=true')
}
