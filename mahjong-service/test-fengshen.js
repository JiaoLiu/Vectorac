import test from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import {adapterFor} from './rooms/adapters/fengshen.js'
import {createServer} from './server.js'
import {createAssignedGame,catalog,allCards,absoluteAction,rotateView,playerView} from './engine/fengshen/engine.js'
function fresh(mode='identity8',seed=23){const a=adapterFor({mode});return {a,s:a.createState({}, {rules:{mode},seed})}}
function action(a,s,seat,pick){const r=a.dispatch(s,{...pick,seat,stateVersion:s.version,actionId:'t'+s.version});assert.ok(r.ok,JSON.stringify({pick,error:r.error}));return r.state}
function draft(a,s){while(s.setup){const seat=a.eligibleSeatsOf(s)[0];s=action(a,s,seat,a.aiDecide(a.playerView(s,seat)))}return s}
function meta(n){return {roomId:'test',roomCode:'ABCDEF',seats:Array.from({length:n},(_,seatIndex)=>({seatIndex,displayName:'P'+seatIndex})),serverTime:Date.now()}}
test('all five modes reuse one canonical draft/game engine with correct seat counts',()=>{
 for(const [mode,n]of [['identity8',8],['identity5',5],['3v3',6],['2v2',4],['1v1',2]]){let {a,s}=fresh(mode);assert.equal(a.seatsPerRoom,n);assert.equal(s.setup.stage,'lord');s=draft(a,s);assert.equal(s.s.players.length,n);assert.equal(allCards(s.s).length,108);assert.equal(a.privateActions,true)}
 assert.throws(()=>adapterFor({mode:'__proto__'}));assert.throws(()=>adapterFor({mode:'identity5'}).sanitizeRules({mode:'identity8'}))
})
test('identity draft hides other roles/candidates and rejects stolen candidates/out-of-stage picks',()=>{
 let {a,s}=fresh();const lord=s.setup.lord,other=(lord+1)%8,v=a.serializeView(s,other,meta(8)).setup
 assert.equal(v.seat,0);assert.equal(v.candidates.length,0);assert.equal(v.players[0].role,s.setup.roles[other]);for(const p of v.players)if(p.seat!==0&&p.seat!==v.lord)assert.equal(p.role,null)
 assert.equal(a.dispatch(s,{seat:other,type:'pick',heroId:s.setup.offers[lord][0]}).ok,false)
 s=action(a,s,lord,a.legalActions(s,lord)[0]);const picks=a.eligibleSeatsOf(s),first=picks[0],second=picks[1],old=s.setup.revision
 const c0=a.legalActions(s,first)[0],c1=a.legalActions(s,second)[0];s=action(a,s,first,{...c0,revision:old});s=action(a,s,second,{...c1,revision:old});assert.ok(s.setup.picks[first]);assert.ok(s.setup.picks[second],'independent parallel draft does not reject an unchanged offer due to another player picking')
})
test('game wire views hide all concealed hands/identities for every seat, with local seat always zero',()=>{
 let {a,s}=fresh();s=draft(a,s);for(let seat=0;seat<8;seat++){const wire=a.serializeView(s,seat,meta(8)),v=wire.game;assert.equal(v.seat,0);assert.equal(v.players[0].heroId,s.s.players[seat].heroId);assert.deepEqual(v.players[0].hand,s.s.players[seat].hand);assert.equal(v.current,(s.s.current-seat+8)%8)
  for(let i=1;i<8;i++){assert.equal(v.players[i].hand.length,0);const p=s.s.players[(seat+i)%8];assert.equal(v.players[i].role,p.role==='lord'?'lord':null);for(const c of p.hand)assert.equal(JSON.stringify(wire).includes('"'+c.id+'"'),false)}
  assert.equal('seed'in v,false);assert.equal('deck'in v,false);assert.equal('offers'in v,false);assert.equal('_engine'in wire,false)
 }
})
test('rotation maps every public target, cue, nested skill target and Tuxi choice back without rotating card ranks',()=>{
 const v={seat:4,current:3,turns:2,players:Array.from({length:5},(_,seat)=>({seat})),sides:[0,1,0,1,0],attackRanges:[1,2,3,4,5],pending:{actor:4,target:0,kind:'tuxi'},legal:[{type:'choose',targets:[0,2],value:'0,2'}],extension:{spec:{targets:[0,2]}},logs:[{cue:{kind:'damage',source:4,target:0,amount:1,card:{rank:4}}}]}
 const r=rotateView(v,4);assert.equal(r.current,4);assert.equal(r.logs[0].cue.source,0);assert.equal(r.logs[0].cue.target,1);assert.equal(r.logs[0].cue.card.rank,4);assert.deepEqual(r.extension.spec.targets,[1,3]);assert.equal(r.legal[0].value,'1,3');assert.deepEqual(absoluteAction(r.legal[0],4,5,v.pending),v.legal[0]);assert.deepEqual(v.players.map(p=>p.seat),[0,1,2,3,4])
})
test('nonzero seat can target itself/its next seat correctly; forbidden cards and stale revisions are rejected',()=>{
 const a=adapterFor({mode:'identity5'}),s={version:0,actionIds:new Set(),setup:null,s:createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['jifa','nezha','yangjian','jinling','hades'],seed:23})}
 Object.assign(s.s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:4});for(const p of s.s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0};p.hp=p.maxHp}const c=s.s.deck.shift();c.type='sha';s.s.players[4].hand.push(c);s.s.players[4].hp=2
 const local=absoluteAction({type:'play',as:'sha',ids:[c.id],targets:[1],revision:s.s.revision},4,5,null),r=a.dispatch(s,{...local,seat:4,stateVersion:0});assert.ok(r.ok);assert.equal(r.state.s.players[0].hp,s.s.players[0].hp-1);assert.equal(r.state.s.players[4].hp,3);assert.equal(a.dispatch(r.state,{...local,seat:4,stateVersion:0}).ok,false);assert.equal(a.dispatch(s,{...local,ids:['not-owned'],seat:4}).ok,false)
})
test('15 seeded adapter AI games finish and preserve canonical card ownership through all prompts',()=>{
 for(const mode of ['identity8','identity5','3v3','2v2','1v1'])for(let seed=1;seed<=3;seed++){let {a,s}=fresh(mode,seed);s=draft(a,s);let steps=0;while(!a.isFinished(s)&&steps++<3500){const seat=a.eligibleSeatsOf(s)[0],pick=a.aiDecide(a.playerView(s,seat));assert.ok(pick);s=action(a,s,seat,pick);assert.equal(allCards(s.s).length,108);assert.equal(new Set(allCards(s.s).map(c=>c.id)).size,108)}assert.ok(a.isFinished(s),mode+' seed '+seed);assert.equal(a.settlementOf(s).perSeat.length,a.seatsPerRoom)}
})

function client(url){const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));return {ws,messages,send:o=>ws.send(JSON.stringify(o)),async wait(pred,ms=4000){const start=Date.now();while(Date.now()-start<ms){const m=messages.find(pred);if(m)return m;await new Promise(r=>setTimeout(r,15))}throw Error('missing wire event '+messages.map(m=>m.type).join(','))}}}
test('real room/WS: private windows, ordered draft, actions, reconnect, social routing and no cross-room leakage',async()=>{
 const service=createServer({logger:()=>{}}),clients=[]
 try{await new Promise(r=>service.server.listen(0,'127.0.0.1',r));const port=service.server.address().port,url='ws://127.0.0.1:'+port+'/mahjong-ws'
  const {room,player:p0}=service.manager.createRoom({gameType:'fengshen',rules:{mode:'1v1'},displayName:'A'}),{player:p1}=await service.manager.joinRoom({roomCode:room.roomCode,displayName:'B'});assert.equal(room.turnTimeoutSeconds,60)
  const outsider=service.manager.createRoom({gameType:'fengshen',rules:{mode:'1v1'},displayName:'Outside'})
  for(const p of [p0,p1,outsider.player]){const c=client(url);clients.push(c);await new Promise(r=>c.ws.once('open',r));c.send({type:'RECONNECT',roomId:p.roomId,resumeToken:p.resumeToken});await c.wait(m=>m.type==='RECONNECTED')}
  await assert.rejects(room.startGame(p0.playerId),/准备/)
  await room.setReady(p0.playerId,true);await assert.rejects(room.startGame(p0.playerId),/准备/)
  await room.setReady(p1.playerId,true)
  await room.startGame(p0.playerId);for(const c of clients.slice(0,2)){const m=await c.wait(m=>m.type==='ACTION_WINDOW_OPENED');assert.equal(m.payload.legalActionsBySeat,undefined)}
  while(room.gameSession.state.setup){const gs=room.gameSession,version=gs.gameVersion,seat=gs.adapter.eligibleSeatsOf(gs.state)[0],pick=gs.adapter.legalActions(gs.state,seat)[0];clients[seat].send({type:'PLAYER_ACTION',requestId:'draft-'+version,gameId:gs.gameId,windowId:gs.window.windowId,action:{...pick,seat:1-seat}});await clients[seat].wait(m=>m.type==='GAME_STATE_CHANGED'&&m.gameVersion>version)}
  const gs=room.gameSession;assert.equal(gs.state.s.players.length,2);const seat=gs.state.s.pending?.actor??gs.state.s.current,other=1-seat,oldWindow=gs.window.windowId
  clients[other].send({type:'PLAYER_ACTION',requestId:'cheat',gameId:gs.gameId,windowId:oldWindow,action:{type:'end',seat}});assert.equal((await clients[other].wait(m=>m.type==='ACTION_REJECTED'&&m.payload.requestId==='cheat')).payload.errorCode,'NOT_YOUR_TURN')
  clients[0].send({type:'CHAT_MSG',requestId:'chat',phrase:2});await clients[1].wait(m=>m.type==='CHAT_MSG'&&m.payload.phrase===2);assert.equal(clients[2].messages.some(m=>m.type==='CHAT_MSG'),false)
  await new Promise(r=>setTimeout(r,1050));clients[0].send({type:'INTERACT_MSG',requestId:'emote',effect:3,targetSeat:1});const emote=await clients[1].wait(m=>m.type==='INTERACT_MSG');assert.equal(emote.payload.seatIndex,0);assert.equal(emote.payload.targetSeat,1);assert.equal(clients[2].messages.some(m=>m.type==='INTERACT_MSG'),false)
  await new Promise(r=>setTimeout(r,1050));clients[0].send({type:'INTERACT_MSG',requestId:'invalid',effect:90,targetSeat:1});assert.equal((await clients[0].wait(m=>m.type==='ERROR'&&m.requestId==='invalid')).errorCode,'INVALID_ACTION')
  const revision=gs.state.s.revision,replacement=client(url);clients.push(replacement);await new Promise(r=>replacement.ws.once('open',r));replacement.send({type:'RECONNECT',resumeToken:p0.resumeToken,roomId:p0.roomId});await replacement.wait(m=>m.type==='RECONNECTED');const restored=await replacement.wait(m=>m.type==='GAME_STATE_CHANGED');assert.equal(restored.payload.game.revision,revision);for(const m of replacement.messages.filter(m=>m.type==='ACTION_WINDOW_OPENED'))assert.equal(m.payload.legalActionsBySeat,undefined)
  await room.setAutoPlay(p0.playerId,true);assert.equal(room.seats[0].autoPlay,true);await room.setAutoPlay(p0.playerId,false);assert.equal(room.seats[0].autoPlay,false)
  await room.leave(p0.playerId);assert.equal(room.seats[0].occupantType,'AI');assert.throws(()=>service.manager.resolveReconnect(p0.resumeToken));assert.equal(room.gameSession,gs)
 }finally{for(const c of clients)c.ws.terminate();await service.close()}
})
