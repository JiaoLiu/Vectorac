import {NetClient,loadCredential,saveCredential,clearCredential,loadDisplayName,saveDisplayName,randomName,errorText} from '../../.vuepress/components/mahjong/multiplayer/net-client.js'
import {speakPhrase,chatDockHtml,bindChatDock,VoiceRecorder,enqueueVoice,registerBgm,unregisterBgm} from '../../.vuepress/components/gamehall/chatkit.js'
import '../../.vuepress/components/gamehall/room.css'
import {absoluteAction,seatMap} from './network-projection.mjs'
import {esc} from './presentation.mjs'
import {localPoint} from './screen-mode.mjs'
import {cleanRoleMarks} from './panel-selection.mjs'
import {modeById} from './setup.mjs'
import {roomTeam,roomTeamBadge,roomTeamsGuide} from './room-teams.mjs'
const effects=['🌹','👏','🤝','🍅','⚡']
// 牌类专属快捷语：棋类共享表的「好棋」「这步走得漂亮」不适用。序号即服务端白名单 0-7，
// 语音预生成在 /audio/gamehall/fengshen/phrase-N.mp3（与棋类共享目录分开，避免播报与文案不符）。
const PHRASES=['快点出牌，我等不及了','别急，让我想想','好牌！','这牌打得漂亮！','哎呀，大意了','稳住，这局能赢','承让承让','痛快，再来一局！']
export function onlineCredential(){const c=loadCredential();return c?.gameType==='fengshen'?c:null}
export class OnlineGame{
 constructor(ui,{baseUrl=window.__FENGSHEN_NET_BASE__||''}={}){
  this.ui=ui;this.status='connecting';this.waiting=true;this.room=null;this.meta=null;this.ready=false;this.lastVersion=-1;this.lastGame=null;this.pending=null;this.talk=false;this.messages=[];this.interactions=[];this.lastSent=0;this.selectedEffect=null
  this.net=new NetClient({baseUrl,onEvent:m=>this.event(m),onStatus:s=>{this.status=s;if(s!=='open')this.ready=false;ui.render()},onError:e=>{this.pending=null;clearTimeout(this.pendingTimer);if(['INVALID_RESUME_TOKEN','PLAYER_ALREADY_LEFT','ROOM_NOT_FOUND','ROOM_DESTROYED'].includes(e.errorCode))this.ready=false;if(this.ready&&['INVALID_ACTION','ACTION_WINDOW_EXPIRED','NOT_YOUR_TURN'].includes(e.errorCode))this.net.resync();ui.inform(errorText(e.errorCode,e.message))}})
  this.capture=e=>{const button=e.target.closest('[data-online]');if(button){e.preventDefault();e.stopImmediatePropagation();this.click(button);return}if(this.selectedEffect!=null){const node=e.target.closest('[data-player],.fs-own-hero');if(node){e.preventDefault();e.stopImmediatePropagation();this.sendInteraction(node.dataset.player==null?0:Number(node.dataset.player))}}}
  ui.root.addEventListener('click',this.capture,true)
  // Keep the shared dock alive across state updates: an in-progress recording/drag must never be morphed away.
  this.commLayer=document.createElement('div');this.commLayer.className='fs-online-comm'
  this.commLayer.innerHTML=chatDockHtml(PHRASES);this.dock=this.commLayer.firstElementChild
  this.dock.querySelector('[data-chat-panel]').insertAdjacentHTML('beforeend',`<div class="fs-emotes">${effects.map((e,i)=>`<button data-online="effect" data-effect="${i}" aria-label="发送${e}">${e}</button>`).join('')}</div>`)
  this.commLayer.addEventListener('click',this.capture,true)
  this.chat=bindChatDock(this.dock,{onStartRec:()=>this.startRecording(),onStopRec:cancel=>this.recorder?.stop(cancel),onPhrase:phrase=>this.sendPhrase(phrase)})
  this.key=e=>{if(e.key==='Escape'){this.chat.closePanel();if(this.selectedEffect!=null){e.preventDefault();e.stopImmediatePropagation();this.selectedEffect=null;ui.render()}}};ui.root.addEventListener('keydown',this.key,true)
  this.fullscreen=()=>this.placeDock();document.addEventListener('fullscreenchange',this.fullscreen);document.addEventListener('webkitfullscreenchange',this.fullscreen)
  this.placeDock()
 }
 async connect(code){
  try{let c=loadCredential();if(c&&c.roomCode===code&&c.gameType==='fengshen'){this.cred=c}else{
    const found=await this.net.getRoom(code);if(found.room.gameType!=='fengshen')throw Error('这个房间不是众神斗法')
    if(c?.resumeToken){await this.net.leaveRoomByToken(c.resumeToken);clearCredential()}
    const name=loadDisplayName()||randomName();saveDisplayName(name);const joined=await this.net.joinRoom({roomCode:code,displayName:name});this.cred={...joined.player,gameType:'fengshen'};saveCredential(this.cred);this.room=joined.room
   }await this.net.connect(this.cred)
  }catch(e){this.status='fatal';this.ui.inform(errorText(e.errorCode,e.message||'连接失败，请返回大厅'))}
 }
 event(m){
  if(m.type==='RECONNECTED'){this.ready=true;this.status='open';this.net.resync();this.ui.render();return}
  if(m.type==='ROOM_DESTROYED'){this.ready=false;this.status='fatal';clearCredential();this.ui.inform('房间已解散，请返回大厅');return}
  if(m.type==='ROOM_SNAPSHOT'){this.room=m.payload;if(this.cred&&Number.isInteger(m.payload.mySeat)){this.cred.seatIndex=m.payload.mySeat;saveCredential(this.cred)}this.waiting=m.payload.status!=='PLAYING';this.ui.render();return}
  if(m.type==='ROOM_UPDATED'){this.room={...this.room,...m.payload,hasPlayed:!!m.payload.results||this.room?.hasPlayed};this.results=m.payload.results||this.results;this.waiting=m.payload.status!=='PLAYING';this.ui.render();this.net.resync();return}
  if(m.type==='GAME_STATE_CHANGED'){this.accept(m);return}
  if(m.type==='ACTION_REJECTED'){this.pending=null;clearTimeout(this.pendingTimer);this.net.resync();this.ui.inform(errorText(m.payload.errorCode,m.payload.message));return}
  if(m.type==='CHAT_MSG'){this.message(m.payload);return}
  if(m.type==='VOICE_MSG'){this.message({...m.payload,voice:true});if(this.ui.voice.enabled)enqueueVoice(m.payload);return}
  if(m.type==='INTERACT_MSG'){this.interaction(m.payload);return}
  if(m.type==='GAME_FINISHED'){this.results=m.payload.results;return}
  if(m.type==='AUTOPLAY_SET'){this.net.resync();return}
  if(['PLAYER_JOINED','PLAYER_LEFT','PLAYER_DISCONNECTED','PLAYER_RECONNECTED','PLAYER_CONNECTED','ADMIN_CHANGED','AI_ADDED','AI_REMOVED','SEAT_CHANGED','ROUND_FINISHED','RULES_UPDATED','READY_CHANGED','GAME_STARTED'].includes(m.type))this.net.resync()
 }
 accept(m){
  const data=m.payload,newGame=m.gameId!==this.lastGame,version=m.gameVersion??data.version
  if(!newGame&&version<this.lastVersion)return
  this.meta=data.meta;this.offset=Date.now()-(data.meta?.serverTime||Date.now());this.waiting=!!data.game?.winner;this.pending=null;clearTimeout(this.pendingTimer)
  this.ui.auto=!!this.meta?.seats?.[this.meta.mySeat]?.autoPlay;this.ui.paused=false
  if(!newGame&&version===this.lastVersion){this.ui.render();return}
  const before=this.ui.state;if(newGame){this.ui.clearEffects();this.lastGame=m.gameId;try{this.ui.roleMarks=JSON.parse(localStorage.getItem(this.notesKey())||'{}')}catch{this.ui.roleMarks={}}this.results=null}
  this.lastVersion=version;this.ui.lobby=false
  if(data.setup){this.ui.state=null;this.ui.setup={...data.setup,networkSetup:data.setup};this.ui.draftHero=data.setup.candidates.includes(this.ui.draftHero)?this.ui.draftHero:null;this.ui.render();return}
  this.ui.setup=null;this.ui.state={...data.game,networkView:data.game};this.ui.roleMarks=cleanRoleMarks(data.game,this.ui.roleMarks)
  if(before&&!newGame){const a=data.action||{type:'remote'};this.ui.present(before,a)}else{this.ui.beams.restore(data.game);this.ui.reset();this.ui.render()}
 }
 send(action){
  if(action.type==='pick')this.ui.requestGameScreen()
  if(!this.ready||this.pending){this.ui.inform(this.pending?'正在确认操作，请稍候':'网络未连接，正在重连');return false}
  if(action.seat!=null&&action.seat!==0)return false
  const n=this.ui.setup?.networkSetup.players.length||this.ui.state.players.length,seat=this.meta?.mySeat??this.cred.seatIndex
  const a=absoluteAction(action,seat,n,this.ui.state?.pending);if(this.ui.state){a.revision=this.ui.state.revision;a.promptId=this.ui.state.pending?.id}
  this.pending=this.net.sendAction({gameId:this.lastGame,windowId:this.meta?.windowId,action:a})
  if(!this.pending)return false
  clearTimeout(this.pendingTimer);this.pendingTimer=setTimeout(()=>{this.pending=null;this.net.resync();this.ui.inform('操作确认超时，已请求最新牌局；不会自动重发')},7000);this.afterRender();return true
 }
 notesKey(){return 'vectorac.fengshen.online.notes:'+this.cred?.roomId+':'+this.lastGame}
 saveNotes(){if(!this.ui.state)return;try{localStorage.setItem(this.notesKey(),JSON.stringify(this.ui.roleMarks))}catch{}}
 waitingHtml(){
  const r=this.room,own=this.cred?.seatIndex,admin=r?.adminSeat===own,me=r?.seats?.find(s=>s.seatIndex===own),humans=r?.seats?.filter(s=>s.occupantType==='HUMAN')||[],allReady=humans.length>0&&humans.every(s=>s.connected&&s.ready),finished=r?.status==='FINISHED'
  return `<main class="fs-network-wait"><section class="gh-room"><header class="gkr-room-head"><h1 class="gkr-room-title">众神斗法 · 房间 <b class="gkr-code">${esc(r?.roomCode||this.cred?.roomCode||'连接中')}</b></h1><div class="gkr-head-btns"><button class="gkr-btn" data-online="share">邀请朋友</button><button class="gkr-btn gkr-btn-danger" data-online="leave">退出房间</button></div></header><p class="fs-room-meta">${esc(modeById(r?.rules?.mode||'identity8').name)} · ${r?.seatsPerRoom||''} 席 · ${r?.turnTimeoutSeconds||60}s 思考 · ${this.status==='open'?'已连接':'正在连接 / 重连'}</p>
  ${r?.hasPlayed?`<section class="fs-round-result" aria-label="上局结果"><h2>第 ${r.round||1} 局已结束</h2><p>${finished?'本房间已结算，请退出后重新建房。':'房间和座位已保留，所有在线玩家准备后自动开下一局。'}</p>${this.results?.perSeat?`<div>${this.results.perSeat.map(p=>`<span>${esc(r.seats?.[p.seat]?.displayName||'玩家')} ${p.delta>=0?'+':''}${p.delta}</span>`).join('')}</div>`:''}</section>`:''}
  ${roomTeamsGuide(r?.rules?.mode,own)}
  <div class="gkr-seats fs-net-seats">${(r?.seats||[]).map(s=>`<article class="gkr-seat ${s.seatIndex===own?'is-me':''}" data-room-seat="${s.seatIndex}" data-team-side="${roomTeam(r?.rules?.mode,s.seatIndex,own)?.side??''}"><b class="gkr-seat-name">${s.seatIndex+1} 号 · ${esc(s.displayName||'空位')}${s.seatIndex===own?'（你）':''}${s.isAdmin?' 👑':''}</b>${roomTeamBadge(r?.rules?.mode,s.seatIndex,own)}<small class="gkr-seat-sub">${s.occupantType==='AI'?'AI · 已就绪':s.occupantType==='EMPTY'?'等待朋友':!s.connected?'离线':s.ready?'✓ 已准备':'未准备'}</small><div class="fs-seat-actions">${admin&&s.occupantType==='AI'?`<button class="gkr-btn gkr-btn-mini" data-online="remove" data-seat="${s.seatIndex}">移除 AI</button>`:s.occupantType==='EMPTY'?`${admin?`<button class="gkr-btn gkr-btn-mini" data-online="add" data-seat="${s.seatIndex}">＋ AI</button>`:''}<button class="gkr-btn gkr-btn-mini" data-online="seat" data-seat="${s.seatIndex}">坐这里</button>`:''}</div></article>`).join('')}</div>
  <footer class="gkr-waiting-actions">${!finished?`<button class="gkr-btn gkr-btn-primary" data-online="ready" aria-pressed="${!!me?.ready}" ${!this.ready?'disabled':''}>${me?.ready?'取消准备':r?.hasPlayed?'准备下一局':'准备'}</button>${admin&&!r?.hasPlayed?`<button class="gkr-btn gkr-btn-primary" data-online="start" ${!this.ready||!allReady?'disabled':''}>开始对局 · 空位补 AI</button>`:''}<p class="gkr-hint">${r?.hasPlayed?'全部准备后自动进入新一轮身份 / 选将。':allReady?'准备齐了，等待房主开始。':'先邀请朋友入座；所有真人准备后由房主开始。'}</p>`:''}<p class="gkr-share-hint">房号 <b>${esc(r?.roomCode||'')}</b> · 可分享给朋友加入</p></footer></section></main>`
 }
 async click(b){const act=b.dataset.online
  if(act==='cancel'){this.selectedEffect=null;this.ui.render();return}
  if(act==='leave'){this.ui.openModal('quit');return}
  if(act==='share'){if(!this.cred)return;const url=new URL('/games/fengshen/',location.origin);url.searchParams.set('room',this.cred.roomCode);try{if(navigator.share)await navigator.share({title:'众神斗法 · 好友房',url:url.href});else{await navigator.clipboard.writeText(url.href);this.ui.inform('邀请链接已复制')}}catch{this.ui.inform('房号：'+this.cred.roomCode)}return}
  if(!this.ready){this.ui.inform('连接恢复后再操作');return}
  if(act==='start')this.net.sendAdmin('START_GAME')
  if(act==='add')this.net.sendAdmin('ADD_AI',{seatIndex:Number(b.dataset.seat)})
  if(act==='remove')this.net.sendAdmin('REMOVE_AI',{seatIndex:Number(b.dataset.seat)})
  if(act==='seat')this.net.sendMoveSeat(Number(b.dataset.seat))
  if(act==='ready')this.net.sendAdmin('TOGGLE_READY',{ready:!this.room?.seats?.find(s=>s.seatIndex===this.cred.seatIndex)?.ready})
  if(act==='effect'){if(!this.ui.state||this.waiting){this.ui.inform('开局后可以向人物发送互动');return}this.selectedEffect=Number(b.dataset.effect);this.chat.closePanel();this.ui.inform('点选人物，发送 '+effects[this.selectedEffect])}
 }
 sendPhrase(phrase){if(!this.ready||Date.now()-this.lastSent<1100)return;this.lastSent=Date.now();if(this.net.sendChat({phrase}))this.message({seatIndex:this.meta?.mySeat??this.cred.seatIndex,phrase})}
 startRecording(){
  if(!this.ready){this.ui.inform('网络未连接，恢复后再录音');return}
  if(!this.recorder)this.recorder=new VoiceRecorder({onSend:p=>{if(this.closed)return;if(this.net.sendVoice(p)){this.message({...p,voice:true,seatIndex:this.meta?.mySeat??this.cred.seatIndex});clearTimeout(this.replayTimer);this.replayTimer=setTimeout(()=>{if(!this.closed&&this.ui.voice.enabled)enqueueVoice(p)},350)}else this.ui.inform('连接已断开，语音未发出')},onState:on=>this.chat.setRecUI(on),onError:text=>{if(!this.closed)this.ui.inform(text)}})
  this.recorder.start()
 }
 beforeRender(){if(this.commLayer.parentNode===this.ui.root){this.commLayer.remove();this.detachedForRender=true}}
 placeDock(){
  if(this.closed)return
  const root=this.ui.root,native=(document.fullscreenElement||document.webkitFullscreenElement)===root,host=native?root:document.body,changed=this.commLayer.parentNode!==host
  if(changed)host.append(this.commLayer)
  const rotated=native&&root.classList.contains('fs-force-landscape')
  this.commLayer.style.cssText=rotated?`position:absolute;left:0;top:${root.clientHeight}px;width:${innerWidth}px;height:${innerHeight}px;transform:rotate(-90deg);transform-origin:0 0`:''
  if(changed&&!this.detachedForRender)this.chat.restick()
  this.detachedForRender=false
 }
 sendInteraction(local){if(!this.ready||Date.now()-this.lastSent<1100)return;const targetSeat=seatMap(local,this.meta.mySeat,this.ui.state.players.length,true),effect=this.selectedEffect;this.selectedEffect=null;this.lastSent=Date.now();if(this.net.sendInteraction({effect,targetSeat}))this.interaction({seatIndex:this.meta.mySeat,targetSeat,effect});this.ui.render()}
 message(p){if(!p.voice&&(!Number.isInteger(p.phrase)||!PHRASES[p.phrase]))return;const until=Date.now()+(p.voice?Math.min(12000,3000+(p.duration||1)*1000):4500);this.messages.push({...p,until});this.messages=this.messages.slice(-4);if(!p.voice&&this.ui.voice.enabled)speakPhrase(p.phrase,PHRASES[p.phrase],'fengshen');this.afterRender();clearTimeout(this.messageTimer);this.messageTimer=setTimeout(()=>this.afterRender(),Math.max(...this.messages.map(m=>m.until))-Date.now()+30)}
 interaction(p){if(!effects[p.effect])return;this.interactions.push({...p,started:Date.now(),until:Date.now()+1400});this.interactions=this.interactions.slice(-5);this.afterRender();clearTimeout(this.interactionTimer);this.interactionTimer=setTimeout(()=>this.afterRender(),1450)}
 anchor(abs){if(!this.meta||!this.ui.state)return null;const local=seatMap(abs,this.meta.mySeat,this.ui.state.players.length);return this.ui.root.querySelector(local===0?'.fs-own-hero>button':`[data-player="${local}"] .fs-player-main`)}
 socialHtml(){return this.selectedEffect==null?'':`<div class="fs-interaction-hint">点人物发送 ${effects[this.selectedEffect]} <button data-online="cancel">取消</button></div>`}
 afterRender(){
  if(this.closed)return
  this.placeDock()
  const root=this.ui.root;root.querySelectorAll('.fs-online-bubble,.fs-online-name,.fs-social-flight').forEach(e=>e.remove());if(this.ui.music.audio)registerBgm(this.ui.music.audio)
  if(this.pending)root.querySelectorAll('.fs-actions button,.fs-draft-footer button').forEach(b=>b.disabled=true)
  for(const s of this.meta?.seats||[]){const a=this.anchor(s.seatIndex);if(a){const name=document.createElement('small');name.className='fs-online-name';name.textContent=s.displayName+(s.autoPlay?' · 托管':'');a.append(name)}}
  this.commLayer.querySelector('.fs-voice-receipts')?.remove();const receipts=document.createElement('div');receipts.className='fs-voice-receipts'
  for(const m of this.messages.filter(m=>m.until>Date.now())){const text=m.voice?'🔊 '+Math.round(m.duration||1)+'″':PHRASES[m.phrase],a=this.anchor(m.seatIndex);if(a){const e=document.createElement('span');e.className='fs-online-bubble';e.textContent=text;a.append(e)}
   const e=document.createElement(m.voice?'button':'span');e.textContent=(this.room?.seats?.[m.seatIndex]?.displayName||'玩家')+' · '+text;if(m.voice){e.setAttribute('aria-label','重播语音');e.onclick=()=>enqueueVoice(m)}receipts.append(e)
  }this.commLayer.append(receipts)
  for(const m of this.interactions.filter(m=>m.until>Date.now())){const a=this.anchor(m.seatIndex)?.getBoundingClientRect(),b=this.anchor(m.targetSeat)?.getBoundingClientRect();if(!a||!b)continue;const ap=localPoint(root,a.x+a.width/2,a.y+a.height/2),bp=localPoint(root,b.x+b.width/2,b.y+b.height/2),e=document.createElement('span');e.className='fs-social-flight';e.textContent=effects[m.effect];e.style.cssText=`--sx:${ap.x}px;--sy:${ap.y}px;--tx:${bp.x}px;--ty:${bp.y}px;animation-delay:${-(Date.now()-m.started)}ms`;root.append(e)}
 }
 leave(){if(this.cred)this.net.leaveRoom();this.close();const u=this.ui;u.online=null;u.clearEffects();u.voice.stop();u.music.pause();u.state=null;u.setup=null;u.lobby=true;u.modal=null;u.auto=false;u.reset();const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);u.render()}
 close(){this.closed=true;this.recorder?.stop(true);this.chat.destroy();this.commLayer.remove();this.ui.root.removeEventListener('click',this.capture,true);this.ui.root.removeEventListener('keydown',this.key,true);document.removeEventListener('fullscreenchange',this.fullscreen);document.removeEventListener('webkitfullscreenchange',this.fullscreen);clearTimeout(this.pendingTimer);clearTimeout(this.messageTimer);clearTimeout(this.interactionTimer);clearTimeout(this.replayTimer);unregisterBgm(this.ui.music.audio);this.net.close()}
}
export async function mountOnline(ui){const code=new URL(location.href).searchParams.get('room');if(!code)return;ui.online=new OnlineGame(ui);ui.lobby=false;ui.state=null;ui.setup=null;ui.render();await ui.online.connect(code.trim().toUpperCase())}
