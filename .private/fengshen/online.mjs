import {NetClient,loadCredential,saveCredential,clearCredential,loadDisplayName,saveDisplayName,randomName,errorText} from '../../.vuepress/components/mahjong/multiplayer/net-client.js'
import {CHAT_PHRASES,speakPhrase,bindCommPrime,registerBgm,unregisterBgm} from '../../.vuepress/components/gamehall/chatkit.js'
import {absoluteAction,seatMap} from './network-projection.mjs'
import {esc} from './presentation.mjs'
import {paths} from './toolbar.mjs'
import {localPoint} from './screen-mode.mjs'
import {cleanRoleMarks} from './panel-selection.mjs'
const effects=['🌹','👏','🤝','🍅','🥚','⚡']
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${paths[name]}</svg>`
export function onlineCredential(){const c=loadCredential();return c?.gameType==='fengshen'?c:null}
export class OnlineGame{
 constructor(ui,{baseUrl=window.__FENGSHEN_NET_BASE__||''}={}){
  this.ui=ui;this.status='connecting';this.waiting=true;this.room=null;this.meta=null;this.ready=false;this.lastVersion=-1;this.lastGame=null;this.pending=null;this.talk=false;this.messages=[];this.interactions=[];this.lastSent=0;this.selectedEffect=null
  this.net=new NetClient({baseUrl,onEvent:m=>this.event(m),onStatus:s=>{this.status=s;if(s!=='open')this.ready=false;ui.render()},onError:e=>{this.pending=null;clearTimeout(this.pendingTimer);if(['INVALID_RESUME_TOKEN','PLAYER_ALREADY_LEFT','ROOM_NOT_FOUND','ROOM_DESTROYED'].includes(e.errorCode))this.ready=false;if(this.ready&&['INVALID_ACTION','ACTION_WINDOW_EXPIRED','NOT_YOUR_TURN'].includes(e.errorCode))this.net.resync();ui.inform(errorText(e.errorCode,e.message))}})
  this.capture=e=>{const button=e.target.closest('[data-online]');if(button){e.preventDefault();e.stopImmediatePropagation();this.click(button);return}if(this.selectedEffect!=null){const node=e.target.closest('[data-player],.fs-own-hero');if(node){e.preventDefault();e.stopImmediatePropagation();this.sendInteraction(node.dataset.player==null?0:Number(node.dataset.player))}}}
  ui.root.addEventListener('click',this.capture,true);bindCommPrime()
  this.key=e=>{if(e.key==='Escape'&&(this.talk||this.selectedEffect!=null)){e.preventDefault();e.stopImmediatePropagation();this.talk=false;this.selectedEffect=null;ui.render()}};ui.root.addEventListener('keydown',this.key,true)
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
  if(m.type==='GAME_STATE_CHANGED'){this.accept(m);return}
  if(m.type==='ACTION_REJECTED'){this.pending=null;clearTimeout(this.pendingTimer);this.net.resync();this.ui.inform(errorText(m.payload.errorCode,m.payload.message));return}
  if(m.type==='CHAT_MSG'){this.message(m.payload);return}
  if(m.type==='INTERACT_MSG'){this.interaction(m.payload);return}
  if(m.type==='GAME_FINISHED'){this.results=m.payload.results;return}
  if(m.type==='AUTOPLAY_SET'){this.net.resync();return}
  if(['PLAYER_JOINED','PLAYER_LEFT','PLAYER_DISCONNECTED','PLAYER_RECONNECTED','PLAYER_CONNECTED','ADMIN_CHANGED','AI_ADDED','AI_REMOVED','SEAT_CHANGED','ROUND_FINISHED','RULES_UPDATED','READY_CHANGED','ROOM_UPDATED','GAME_STARTED'].includes(m.type))this.net.resync()
 }
 accept(m){
  const data=m.payload,newGame=m.gameId!==this.lastGame,version=m.gameVersion??data.version
  if(!newGame&&version<this.lastVersion)return
  this.meta=data.meta;this.offset=Date.now()-(data.meta?.serverTime||Date.now());this.waiting=false;this.pending=null;clearTimeout(this.pendingTimer)
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
 waitingHtml(){const r=this.room,own=this.cred?.seatIndex,admin=r?.adminSeat===own;return `${this.ui.header()}<main class="fs-network-wait"><h1>众神斗法 · 好友房</h1><p>房号 <b>${esc(r?.roomCode||this.cred?.roomCode||'连接中')}</b> · ${r?.seatsPerRoom||''} 席 · ${esc(this.status==='open'?'已连接':'正在连接 / 重连')}</p><div class="fs-net-seats">${(r?.seats||[]).map(s=>`<article><b>${s.seatIndex===own?'你 · ':''}${esc(s.displayName||'空位')}</b><small>${s.occupantType==='AI'?'AI 补位':s.occupantType==='EMPTY'?'等待朋友':s.connected?'在线':'离线'}${s.isAdmin?' · 房主':''}</small>${admin&&s.occupantType==='AI'?`<button data-online="remove" data-seat="${s.seatIndex}">移除 AI</button>`:s.occupantType==='EMPTY'?`<button data-online="seat" data-seat="${s.seatIndex}">坐这里</button>`:''}</article>`).join('')}</div><div class="fs-net-room-actions"><button data-online="share">邀请朋友</button>${admin?`<button data-online="add">添加 AI</button><button class="fs-primary" data-online="start" ${!this.ready?'disabled':''}>${r?.hasPlayed?'再开一局':'开始对局'} · 空位补 AI</button>`:r?.hasPlayed?'<button data-online="ready">准备下一局</button>':'<span>等待房主开始</span>'}<button data-online="leave">退出房间</button></div>${this.results?'<p>上局已结算，可继续下一局。</p>':''}</main>`}
 async click(b){const act=b.dataset.online
  if(act==='talk'){this.talk=!this.talk;this.ui.render();return}
  if(act==='cancel'){this.selectedEffect=null;this.ui.render();return}
  if(act==='leave'){this.ui.openModal('quit');return}
  if(act==='share'){if(!this.cred)return;const url=new URL('/games/fengshen/',location.origin);url.searchParams.set('room',this.cred.roomCode);try{if(navigator.share)await navigator.share({title:'众神斗法 · 好友房',url:url.href});else{await navigator.clipboard.writeText(url.href);this.ui.inform('邀请链接已复制')}}catch{this.ui.inform('房号：'+this.cred.roomCode)}return}
  if(!this.ready){this.ui.inform('连接恢复后再操作');return}
  if(act==='start'){this.ui.requestGameScreen();this.net.sendAdmin('START_GAME')}
  if(act==='add')this.net.sendAdmin('ADD_AI')
  if(act==='remove')this.net.sendAdmin('REMOVE_AI',{seatIndex:Number(b.dataset.seat)})
  if(act==='seat')this.net.sendMoveSeat(Number(b.dataset.seat))
  if(act==='ready')this.net.sendAdmin('TOGGLE_READY',{ready:true})
  if(act==='phrase'){const phrase=Number(b.dataset.phrase);if(Date.now()-this.lastSent<1100)return;this.lastSent=Date.now();if(this.net.sendChat({phrase})){this.message({seatIndex:this.meta?.mySeat??this.cred.seatIndex,phrase});this.talk=false;this.ui.render()}}
  if(act==='effect'){if(!this.ui.state||this.waiting){this.ui.inform('开局后可以向人物发送互动');return}this.selectedEffect=Number(b.dataset.effect);this.talk=false;this.ui.inform('点选人物，发送 '+effects[this.selectedEffect])}
 }
 sendInteraction(local){if(!this.ready||Date.now()-this.lastSent<1100)return;const targetSeat=seatMap(local,this.meta.mySeat,this.ui.state.players.length,true),effect=this.selectedEffect;this.selectedEffect=null;this.lastSent=Date.now();if(this.net.sendInteraction({effect,targetSeat}))this.interaction({seatIndex:this.meta.mySeat,targetSeat,effect});this.ui.render()}
 message(p){if(!Number.isInteger(p.phrase)||!CHAT_PHRASES[p.phrase])return;this.messages.push({...p,until:Date.now()+3500});this.messages=this.messages.slice(-4);if(this.ui.voice.enabled)speakPhrase(p.phrase);this.afterRender();clearTimeout(this.messageTimer);this.messageTimer=setTimeout(()=>this.afterRender(),3600)}
 interaction(p){if(!effects[p.effect])return;this.interactions.push({...p,started:Date.now(),until:Date.now()+1400});this.interactions=this.interactions.slice(-5);this.afterRender();clearTimeout(this.interactionTimer);this.interactionTimer=setTimeout(()=>this.afterRender(),1450)}
 anchor(abs){if(!this.meta||!this.ui.state)return null;const local=seatMap(abs,this.meta.mySeat,this.ui.state.players.length);return this.ui.root.querySelector(local===0?'.fs-own-hero>button':`[data-player="${local}"] .fs-player-main`)}
 socialHtml(){return '<div class="fs-online-ui">'+`<nav class="fs-online-bar" data-connected="${this.ready}" aria-label="联机交流">${this.selectedEffect!=null?`<button data-online="cancel" aria-label="取消互动">×</button>`:""}<span>${esc(this.cred?.roomCode||'')} · ${this.ready?'在线':'重连中'}</span><button data-online="share" aria-label="邀请朋友">${icon('feedback')}</button><button data-online="talk" aria-label="快捷语音和互动">${icon('voice')}</button></nav>${this.talk?`<section class="fs-social-panel" aria-label="快捷语音和互动"><header><b>快捷语音</b><button data-online="talk" aria-label="关闭交流">×</button></header><div class="fs-phrases">${CHAT_PHRASES.map((p,i)=>`<button data-online="phrase" data-phrase="${i}">${esc(p)}</button>`).join('')}</div><div class="fs-emotes">${effects.map((e,i)=>`<button data-online="effect" data-effect="${i}" aria-label="发送${e}">${e}</button>`).join('')}</div><small>选择互动后点人物；交流不暂停牌局。</small></section>`:''}`+'</div>'}
 afterRender(){
  const root=this.ui.root;root.querySelectorAll('.fs-online-bubble,.fs-online-name,.fs-social-flight').forEach(e=>e.remove());if(this.ui.music.audio)registerBgm(this.ui.music.audio)
  if(this.pending)root.querySelectorAll('.fs-actions button,.fs-draft-footer button').forEach(b=>b.disabled=true)
  for(const s of this.meta?.seats||[]){const a=this.anchor(s.seatIndex);if(a){const name=document.createElement('small');name.className='fs-online-name';name.textContent=s.displayName+(s.autoPlay?' · 托管':'');a.append(name)}}
  for(const m of this.messages.filter(m=>m.until>Date.now())){const a=this.anchor(m.seatIndex);if(a){const e=document.createElement('span');e.className='fs-online-bubble';e.textContent=CHAT_PHRASES[m.phrase];a.append(e)}}
  for(const m of this.interactions.filter(m=>m.until>Date.now())){const a=this.anchor(m.seatIndex)?.getBoundingClientRect(),b=this.anchor(m.targetSeat)?.getBoundingClientRect();if(!a||!b)continue;const ap=localPoint(root,a.x+a.width/2,a.y+a.height/2),bp=localPoint(root,b.x+b.width/2,b.y+b.height/2),e=document.createElement('span');e.className='fs-social-flight';e.textContent=effects[m.effect];e.style.cssText=`--sx:${ap.x}px;--sy:${ap.y}px;--tx:${bp.x}px;--ty:${bp.y}px;animation-delay:${-(Date.now()-m.started)}ms`;root.append(e)}
 }
 leave(){if(this.cred)this.net.leaveRoom();this.close();const u=this.ui;u.online=null;u.clearEffects();u.voice.stop();u.music.pause();u.state=null;u.setup=null;u.lobby=true;u.modal=null;u.auto=false;u.reset();const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);u.render()}
 close(){this.ui.root.removeEventListener('click',this.capture,true);this.ui.root.removeEventListener('keydown',this.key,true);clearTimeout(this.pendingTimer);clearTimeout(this.messageTimer);clearTimeout(this.interactionTimer);unregisterBgm(this.ui.music.audio);this.net.close()}
}
export async function mountOnline(ui){const code=new URL(location.href).searchParams.get('room');if(!code)return;ui.online=new OnlineGame(ui);ui.lobby=false;ui.state=null;ui.setup=null;ui.render();await ui.online.connect(code.trim().toUpperCase())}
