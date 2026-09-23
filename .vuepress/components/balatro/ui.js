import * as E from './engine.mjs'
import { HANDS, JOKERS, TAROTS, SPECTRALS, VOUCHERS, BOSSES, DECKS, STAKES, SUITS, SUIT_NAMES, ENHANCEMENTS, EDITIONS, SEALS, boosterPack, byId } from './catalog.mjs'
import { playingCard, jokerArt, consumableArt, packArt } from './art.mjs'
import { cardCue } from './cues.mjs'
import { playingCardDetails } from './card-details.mjs'

const SAVE='vectorac.balatro.run.v3', SETTINGS='vectorac.balatro.settings.v3'
const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const num=value=>!Number.isFinite(value)?'0':Math.abs(value)>=1e9?value.toExponential(2):new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value)
const button=(action,label,cls='',disabled=false,extra='')=>`<button type="button" data-action="${action}" class="bp-btn ${cls}" ${disabled?'disabled':''} ${extra}>${label}</button>`
const sealShort={red:'红封 ×2',blue:'蓝封·星球',gold:'金封 +$3',purple:'紫封·塔罗'}
const tagNames={money:'经济标签 · 获得 $15',rare:'稀有标签 · 下个商店免费稀有小丑',hands:'便利标签 · 下轮出牌 +3',discards:'垃圾标签 · 下轮弃牌 +3',free:'优惠标签 · 下个商店卡牌免费',double:'双倍标签'}
const stakeDescriptions=[
  '标准难度，没有额外赌注惩罚。',
  '小盲注不再提供奖励金。',
  '提高盲注的目标分数。',
  '部分商店小丑会带有永恒：不能出售或摧毁。',
  '每个盲注少 1 次弃牌。',
  '盲注目标分数再提高一档。',
  '部分小丑会带有易腐：5 轮后失效。',
  '部分小丑会带有租赁：每轮支付 $3。'
]
const stakeColors=['#e6e7da','#d55349','#55a76e','#333b45','#4d9bcd','#8b69bd','#e28a43','#d9b64d']
const rankName=c=>({11:'J',12:'Q',13:'K',14:'A'}[c.rank]||c.rank)
const cardName=c=>`${SUIT_NAMES[c.suit]} ${rankName(c)}`
const safeRead=key=>{try{return localStorage.getItem(key)}catch(_){return null}}

class Sound {
  constructor(settings){this.settings=settings;this.ctx=null;this.timer=null;this.step=0;this.nodes=new Set()}
  unlock(){
    try{if(!this.ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;this.ctx=new Audio();this.master=this.ctx.createGain();this.master.gain.value=.38;this.master.connect(this.ctx.destination)}if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{})}catch(_){}
  }
  note(freq,length=.1,volume=.18,type='triangle',delay=0){
    // iOS resumes AudioContext asynchronously after a tap. Queue the note on its clock now;
    // dropping it while suspended makes every short interaction sound silent.
    if(!this.ctx||this.ctx.state==='closed')return
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime+delay
    o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+length)
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+length+.02);this.nodes.add(o)
    o.onended=()=>{o.disconnect();g.disconnect();this.nodes.delete(o)}
  }
  fx(kind,index=0){
    if(!this.settings.sound)return
    this.unlock()
    if(kind==='coin'||kind==='planet'){
      (kind==='planet'?[440,554,659,880]:[523,659,784]).forEach((f,i)=>this.note(f,.16,.22,'triangle',i*.07))
    }else if(kind==='magic'){
      [392,587,784].forEach((f,i)=>this.note(f,.14,.17,'sine',i*.055))
    }else if(kind==='score')this.note(260*Math.pow(1.05946,index%18),.11,.20)
    else if(kind==='deal')this.note(180,.075,.16,'sawtooth')
    else this.note(440,.065,.18)
  }
  music(active){
    clearInterval(this.timer);this.timer=null
    if(!active||!this.settings.music||document.hidden)return
    this.unlock()
    const tick=()=>{if(!this.ctx||this.ctx.state!=='running')return;const chords=[[146.83,174.61,220,293.66],[130.81,164.81,196,261.63],[116.54,146.83,174.61,233.08],[130.81,164.81,220,261.63]],ch=chords[Math.floor(this.step/16)%4];this.note(ch[this.step%4]*(this.step%8===7?2:1),.45,.09,'triangle');if(this.step%4===0)this.note(ch[0]/2,.65,.14,'sine');this.step++}
    tick();this.timer=setInterval(tick,230)
  }
  destroy(){clearInterval(this.timer);this.nodes.forEach(o=>{try{o.stop()}catch(_){}});if(this.ctx)this.ctx.close().catch(()=>{});this.ctx=null}
}

export default class PokerTable {
  constructor(root){
    this.root=root;this.state=null;this.saved=E.restore(safeRead(SAVE));this.settings={sound:true,music:false,fast:false}
    try{Object.assign(this.settings,JSON.parse(safeRead(SETTINGS)||'{}'))}catch(_){}
    this.audio=new Sound(this.settings);this.modal=null;this.busy=false;this.immersive=false;this.destroyed=false;this.timers=new Set();this.scoreTimer=null;this.scoreToken=0;this.seed='';this.deckType='red';this.sort='rank';this.toast='';this.effect='';this.anim=null;this.actionFx=null;this.packFx=null;this.packChoiceFx=null
    this.stake=0;this.marker=document.createComment('balatro-position');root.parentNode.insertBefore(this.marker,root)
    this.onClick=this.click.bind(this);this.onKey=this.key.bind(this);this.onDouble=e=>e.preventDefault()
    this.onPointerDown=this.pointerDown.bind(this);this.onPointerMove=this.pointerMove.bind(this);this.onPointerUp=this.pointerUp.bind(this);this.onPointerCancel=this.pointerCancel.bind(this)
    this.jokerDrag=null;this.suppressInfoClickUid=null
    this.pendingPlanet=null
    this.onResize=()=>{if(this.resizeFrame)cancelAnimationFrame(this.resizeFrame);this.resizeFrame=requestAnimationFrame(()=>{this.resizeFrame=null;this.updateLayout()})}
    this.resizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(this.onResize):null
    if(this.resizeObserver)this.resizeObserver.observe(root)
    window.addEventListener('resize',this.onResize)
    this.onVisibility=()=>this.audio.music(!!this.state&&!document.hidden)
    this.onFull=()=>{
      const active=document.fullscreenElement===this.root||document.webkitFullscreenElement===this.root
      this.nativeFullscreen=active
      if(this.immersive&&!active)this.exitFullscreen(false)
    }
    root.addEventListener('click',this.onClick);root.addEventListener('dblclick',this.onDouble);root.addEventListener('pointerdown',this.onPointerDown);document.addEventListener('pointermove',this.onPointerMove,{passive:false});document.addEventListener('pointerup',this.onPointerUp);document.addEventListener('pointercancel',this.onPointerCancel);document.addEventListener('keydown',this.onKey);document.addEventListener('visibilitychange',this.onVisibility);document.addEventListener('fullscreenchange',this.onFull);document.addEventListener('webkitfullscreenchange',this.onFull)
    this.render()
  }
  later(fn,ms){const t=setTimeout(()=>{this.timers.delete(t);if(this.destroyed)return;try{fn()}catch(error){this.recoverAnimation(error)}},ms);this.timers.add(t);return t}
  recoverAnimation(error){
    console.error('Balatro timed action failed',error)
    this.clearScoreTimer();this.scoreToken++
    this.busy=false;this.anim=null;this.actionFx=null;this.packFx=null;this.packChoiceFx=null
    this.toast='动画中断，操作已恢复'
    try{this.render()}catch(renderError){console.error('Balatro recovery render failed',renderError)}
  }
  updateLayout(){
    if(this.destroyed)return
    const width=this.root.clientWidth,height=this.root.clientHeight
    this.root.classList.toggle('bp-compact',width<=640)
    this.root.classList.toggle('bp-short',width>640&&height<=500)
  }
  clearPlanetTap(){
    if(this.pendingPlanet){clearTimeout(this.pendingPlanet.timer);this.timers.delete(this.pendingPlanet.timer);this.pendingPlanet=null}
  }
  showItem(uid,event){
    const s=this.state,card=s&&s.consumables.find(c=>c.uid===uid)
    const quick=card&&card.kind==='planet'&&!this.busy&&!s.pack&&['play','shop','select'].includes(s.phase)&&event.detail!==0
    if(quick){
      if(this.pendingPlanet&&this.pendingPlanet.uid===uid){this.clearPlanetTap();this.perform('use',uid);return}
      this.clearPlanetTap()
      const timer=this.later(()=>{this.pendingPlanet=null;if(!this.busy&&this.findItem(uid)){this.modal={type:'info',uid};this.render()}},330)
      this.pendingPlanet={uid,timer};return
    }
    this.clearPlanetTap();this.modal={type:'info',uid};this.render()
  }
  persist(){
    try{if(this.state)localStorage.setItem(SAVE,JSON.stringify(this.state));localStorage.setItem(SETTINGS,JSON.stringify(this.settings));this.saved=this.state?E.clone(this.state):this.saved}
    catch(_){this.toast='浏览器未允许保存进度，请不要关闭本页'}
  }
  transact(fn){const draft=E.clone(this.state);draft.hand.sort(this.sort==='rank'?(a,b)=>b.rank-a.rank||a.suit-b.suit:(a,b)=>a.suit-b.suit||b.rank-a.rank);const result=fn(draft);this.state=draft;this.persist();return result}
  fullscreen(){
    if(this.immersive)return
    this.oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.classList.add('bp-body-immersive');document.body.appendChild(this.root);this.immersive=true;this.root.classList.add('bp-fullscreen')
    const request=this.root.requestFullscreen||this.root.webkitRequestFullscreen
    if(request)try{const result=request.call(this.root);if(result&&result.then)result.then(()=>{this.nativeFullscreen=true}).catch(()=>{this.nativeFullscreen=false});else this.nativeFullscreen=true}catch(_){this.nativeFullscreen=false}
  }
  exitFullscreen(native=true){
    this.immersive=false;this.nativeFullscreen=false;this.root.classList.remove('bp-fullscreen');document.body.classList.remove('bp-body-immersive');document.body.style.overflow=this.oldOverflow||''
    if(this.marker.parentNode)this.marker.parentNode.insertBefore(this.root,this.marker.nextSibling)
    if(native&&(document.fullscreenElement===this.root||document.webkitFullscreenElement===this.root))try{const p=(document.exitFullscreen||document.webkitExitFullscreen).call(document);if(p&&p.catch)p.catch(()=>{})}catch(_){}
    this.render()
    if(this.busy&&this.anim)this.updateScore(this.anim.event)
  }
  start(resume=false){
    this.clearScoreTimer();this.scoreToken++
    this.audio.unlock();this.state=resume&&this.saved?E.clone(this.saved):E.newRun(this.seed||Math.random().toString(36).slice(2,10).toUpperCase(),this.deckType,this.stake)
    const migrationNotice=resume?this.state.notice:''
    if(migrationNotice)delete this.state.notice
    this.modal=null;this.busy=false;this.anim=null;this.actionFx=null;this.packFx=null;this.packChoiceFx=null;this.fullscreen();this.persist();this.render();this.audio.music(true)
    if(migrationNotice)this.notify(migrationNotice)
  }
  notify(message){this.toast=message;this.render();this.later(()=>{if(this.toast===message){this.toast='';const t=this.root.querySelector('.bp-toast');if(t)t.remove()}},3500)}
  showEffect(message){
    this.effect=message
    const banner=this.root.querySelector('[data-effect-notice]')
    if(banner){banner.textContent=message;banner.classList.remove('bp-effect-hidden');banner.classList.remove('bp-effect-pop');void banner.offsetWidth;banner.classList.add('bp-effect-pop')}
    if(this.effectTimer){clearTimeout(this.effectTimer);this.timers.delete(this.effectTimer)}
    this.effectTimer=this.later(()=>{if(this.effect===message){this.effect='';const el=this.root.querySelector('[data-effect-notice]');if(el){el.textContent='';el.classList.add('bp-effect-hidden')}}},2400)
  }
  key(e){
    if(!this.state||!this.immersive&&!this.root.contains(document.activeElement)||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return
    if(e.key==='Escape'){if(this.modal){e.preventDefault();this.modal=null;this.render()}return}
    if(this.busy||this.modal)return
    if(/^[1-9]$/.test(e.key)&&this.state.phase==='play'){const c=this.orderedHand()[Number(e.key)-1];if(c){e.preventDefault();this.perform('select',c.uid)}}
    if(e.key==='Enter'&&this.state.phase==='play'){e.preventDefault();this.perform('play')}
    if(e.key.toLowerCase()==='d'&&this.state.phase==='play'){e.preventDefault();this.perform('discard')}
  }
  click(e){
    const b=e.target.closest('[data-action]');if(!b||!this.root.contains(b)||b.disabled)return
    const action=b.dataset.action,uid=Number(b.dataset.uid),id=b.dataset.id
    if(action==='info'&&this.suppressInfoClickUid===uid){this.suppressInfoClickUid=null;e.preventDefault();return}
    if(this.busy&&action!=='fullscreen'&&action!=='skip-score')return
    if(action!=='info')this.clearPlanetTap()
    if(action==='deck-choice'){this.deckType=id;this.seed=(this.root.querySelector('[data-seed]')||{}).value||this.seed;this.render();return}
    if(action==='stake'){this.seed=(this.root.querySelector('[data-seed]')||{}).value||this.seed;this.modal={type:'stakes'};this.render();return}
    if(action==='stake-select'){this.stake=Math.max(0,Math.min(STAKES.length-1,Number(id)||0));this.seed=(this.root.querySelector('[data-seed]')||{}).value||this.seed;this.modal=null;this.render();return}
    if(action==='start'){
      this.seed=(this.root.querySelector('[data-seed]')||{}).value||this.seed
      if(this.saved){this.modal={type:'new-run'};this.render();return}
      this.start(false);return
    }
    if(action==='start-confirm'){this.modal=null;this.start(false);return}
    if(action==='resume'){this.start(true);return}
    if(action==='fullscreen'){if(this.immersive)this.exitFullscreen();else{this.fullscreen();this.render();if(this.busy&&this.anim)this.updateScore(this.anim.event)}return}
    if(action==='sound'||action==='music'||action==='fast'){this.settings[action]=!this.settings[action];this.audio.unlock();this.audio.music(!!this.state);this.persist();this.render();if(action==='sound'&&this.settings.sound)this.audio.fx('magic');return}
    if(action==='help'||action==='hands'||action==='deck'||action==='collection'||action==='menu'){this.modal={type:action};this.render();return}
    if(action==='close'){this.modal=null;this.render();return}
    if(action==='info'){this.showItem(uid,e);return}
    if(action==='restart'){this.modal={type:'confirm'};this.render();return}
    if(action==='new-confirm'){
      this.modal=null;this.state=null;this.saved=null;try{localStorage.removeItem(SAVE)}catch(_){};this.audio.music(false)
      if(this.immersive||document.fullscreenElement===this.root||document.webkitFullscreenElement===this.root)this.exitFullscreen()
      else this.render()
      return
    }
    if(action==='skip-score'){this.skipScoreAnimation();return}
    if(action==='card-details'){
      const card=this.findItem(uid);if(!card||card.hidden)return
      this.modal={type:'card-info',uid,from:b.dataset.from||''};this.render();return
    }
    if(action==='back-deck'){this.modal={type:'deck'};this.render();return}
    if(this.busy)return
    this.perform(action,uid,id)
  }
  pointerDown(e){
    if(e.button!==0||e.isPrimary===false||this.jokerDrag||this.busy||this.modal||!this.state||this.state.pack||!['play','shop','select'].includes(this.state.phase))return
    const art=e.target.closest('.bp-joker-rack .bp-rack-cards > .bp-item[data-visual] > .bp-item-art')
    if(!art)return
    const item=art.parentElement
    const uid=Number(item.dataset.visual),fromIndex=this.state.jokers.findIndex(j=>j.uid===uid)
    if(fromIndex<0)return
    this.jokerDrag={pointerId:e.pointerId,uid,fromIndex,toIndex:fromIndex,x:e.clientX,y:e.clientY,item,rack:item.parentElement,marker:null,markerSide:''}
  }
  pointerMove(e){
    const drag=this.jokerDrag;if(!drag||drag.pointerId!==e.pointerId)return
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y
    if(!drag.active&&Math.hypot(dx,dy)<7)return
    drag.active=true;e.preventDefault()
    drag.item.classList.add('bp-joker-dragging');drag.item.style.setProperty('--joker-drag-x',`${dx}px`);drag.item.style.setProperty('--joker-drag-y',`${dy}px`)
    const others=Array.from(drag.rack.querySelectorAll(':scope > .bp-item[data-visual]')).filter(el=>el!==drag.item)
    const before=others.findIndex(el=>e.clientX<el.getBoundingClientRect().left+el.getBoundingClientRect().width/2)
    const side=before<0?'after':'before',marker=before<0?others[others.length-1]:others[before]
    if(drag.marker!==marker||drag.markerSide!==side){
      drag.marker?.classList.remove('bp-joker-drop-before','bp-joker-drop-after')
      drag.marker=marker||null;drag.markerSide=side
      drag.marker?.classList.add(`bp-joker-drop-${side}`)
    }
    drag.toIndex=before<0?others.length:before
  }
  clearJokerDrag(drag,returnToSlot=false){
    if(!drag)return
    drag.marker?.classList.remove('bp-joker-drop-before','bp-joker-drop-after')
    drag.rack?.querySelectorAll('.bp-joker-drop-before,.bp-joker-drop-after').forEach(el=>el.classList.remove('bp-joker-drop-before','bp-joker-drop-after'))
    drag.item.classList.remove('bp-joker-dragging')
    if(returnToSlot&&drag.active){
      drag.item.classList.add('bp-joker-returning');void drag.item.offsetWidth;drag.item.style.setProperty('--joker-drag-x','0px');drag.item.style.setProperty('--joker-drag-y','0px')
      this.later(()=>{drag.item.classList.remove('bp-joker-returning');drag.item.style.removeProperty('--joker-drag-x');drag.item.style.removeProperty('--joker-drag-y')},190)
    }else{
      drag.item.classList.remove('bp-joker-returning');drag.item.style.removeProperty('--joker-drag-x');drag.item.style.removeProperty('--joker-drag-y')
    }
  }
  pointerCancel(e){
    if(!this.jokerDrag||this.jokerDrag.pointerId!==e.pointerId)return
    const drag=this.jokerDrag;this.jokerDrag=null;this.clearJokerDrag(drag,true)
  }
  pointerUp(e){
    const drag=this.jokerDrag;if(!drag||drag.pointerId!==e.pointerId)return
    this.pointerMove(e)
    this.jokerDrag=null
    if(!drag.active){this.clearJokerDrag(drag);return}
    e.preventDefault();this.suppressInfoClickUid=drag.uid
    this.later(()=>{if(this.suppressInfoClickUid===drag.uid)this.suppressInfoClickUid=null},400)
    if(drag.toIndex===drag.fromIndex||this.busy||this.state?.pack||!this.state||!['play','shop','select'].includes(this.state.phase)){
      this.clearJokerDrag(drag,true);return
    }
    this.clearJokerDrag(drag)
    const oldPositions=new Map(Array.from(drag.rack.querySelectorAll(':scope > .bp-item[data-visual]'),el=>[Number(el.dataset.visual),el.getBoundingClientRect()]))
    const scrollLeft=drag.rack.scrollLeft,direction=drag.toIndex>drag.fromIndex?1:-1
    try{
      this.transact(s=>{for(let i=drag.fromIndex;i!==drag.toIndex;i+=direction)E.reorder(s,drag.uid,direction)})
      this.audio.fx('tap');this.render()
      const rack=this.root.querySelector('.bp-joker-rack .bp-rack-cards');if(rack)rack.scrollLeft=scrollLeft
      this.animateJokerReorder(oldPositions)
    }catch(error){this.notify(error.message||'小丑排序失败，请重试')}
  }
  animateJokerReorder(oldPositions){
    const cards=Array.from(this.root.querySelectorAll('.bp-joker-rack .bp-rack-cards > .bp-item[data-visual]')),moving=[]
    cards.forEach(el=>{
      const old=oldPositions.get(Number(el.dataset.visual));if(!old)return
      const next=el.getBoundingClientRect(),dx=old.left-next.left,dy=old.top-next.top
      if(Math.abs(dx)<1&&Math.abs(dy)<1)return
      el.style.transition='none';el.style.transform=`translate3d(${dx}px,${dy}px,0)`;moving.push(el)
    })
    if(!moving.length)return
    void this.root.offsetWidth
    requestAnimationFrame(()=>{
      if(this.destroyed)return
      moving.forEach(el=>{el.style.transition='transform 220ms cubic-bezier(.2,.78,.25,1)';el.style.transform='translate3d(0,0,0)'})
      this.later(()=>moving.forEach(el=>{if(el.isConnected){el.style.removeProperty('transition');el.style.removeProperty('transform')}}),260)
    })
  }
  perform(action,uid,id){
    try{
      this.toast=''
      if(action==='select'){E.selectCard(this.state,uid);this.audio.fx('tap');this.render();return}
      if(action==='sort-rank'||action==='sort-suit'){this.sort=action==='sort-rank'?'rank':'suit';this.render();return}
      if(action==='play'){this.animatePlay();return}
      const ops={blind:E.startBlind,skip:E.skipBlind,discard:E.discard,cash:E.cashOut,next:E.nextBlind,reroll:E.rerollShop,boss:E.rerollBoss,endless:E.continueEndless,'pack-skip':E.closePack,buy:s=>E.buy(s,uid),'pack-choose':s=>E.choosePack(s,uid),use:s=>E.use(s,uid),sell:s=>E.sell(s,uid),left:s=>E.reorder(s,uid,-1),right:s=>E.reorder(s,uid,1)}
      if(!ops[action])return
      const used=action==='use'?this.state.consumables.find(c=>c.uid===uid):action==='pack-choose'?this.state.pack?.cards.find(c=>c.uid===uid):null
      const pack=action==='buy'?this.state.shop?.packs.find(c=>c.uid===uid):null
      if(pack){this.animatePackOpening(ops[action],pack);return}
      if(action==='pack-choose'&&used&&['card','joker'].includes(used.kind)){this.animatePackChoice(ops[action],used);return}
      if(used&&(action==='use'&&used.kind!=='planet'||action==='pack-choose'&&['tarot','spectral','planet'].includes(used.kind))){this.animateConsumable(ops[action],used);return}
      this.transact(ops[action]);this.modal=null;this.audio.fx(action==='use'?used?.kind==='planet'?'planet':'magic':['buy','cash','sell'].includes(action)?'coin':'deal')
      if(this.state.notice){this.toast=this.state.notice;delete this.state.notice}
      this.render()
      if(used){
        if(used.kind==='planet'){
          const hand=byId(HANDS,used.id),base=E.handBase(this.state,used.id)
          this.showEffect(`${hand.planet} 生效 · ${hand.name} Lv.${this.state.levels[used.id]} · ${num(base.chips)} 筹码 × ${num(base.mult)} 倍率`)
        }else this.showEffect(`${this.itemName(used)} 已生效 · ${this.itemDesc(used)}`)
      }
    }catch(error){this.busy=false;this.anim=null;this.actionFx=null;this.packFx=null;this.packChoiceFx=null;this.notify(error.message||'操作失败，请重试')}
  }
  packSource(card){
    const root=this.root.getBoundingClientRect(),art=this.root.querySelector(`.bp-item[data-visual="${card.uid}"] .bp-item-art`),rect=art?.getBoundingClientRect()
    if(!rect)return {left:this.root.clientWidth/2-45,top:this.root.clientHeight/2-63,width:90,height:126,x:0,y:0,scale:.65}
    const width=Math.max(1,rect.width),height=Math.max(1,rect.height)
    return {left:rect.left-root.left,top:rect.top-root.top,width,height,x:rect.left+rect.width/2-(root.left+root.width/2),y:rect.top+rect.height/2-(root.top+root.height/2),scale:width/96}
  }
  animatePackOpening(operation,pack){
    const preview=E.clone(this.state);operation(preview)
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,from=this.packSource(pack),booster=boosterPack(pack.id),fx={phase:'travel',id:pack.id,family:booster.family,size:booster.size,from,preview,token:Symbol('booster-opening')}
    this.packFx=fx;this.busy=true;this.modal=null;this.audio.fx('deal');this.render()
    const advance=(phase,delay,next)=>this.later(()=>{if(this.destroyed||this.packFx!==fx)return;fx.phase=phase;this.audio.fx(phase==='tear'?'magic':'tap');this.render();if(next)next()},delay)
    advance('shake',reduced?45:440,()=>advance('tear',reduced?60:700,()=>this.later(()=>{
      if(this.destroyed||this.packFx!==fx)return
      this.state=preview;this.persist();fx.phase='reveal';this.render();this.audio.fx('magic')
      fx.cards=preview.pack?.cards||[]
      fx.cards.forEach((_,index)=>this.later(()=>this.audio.fx('deal'),index*(reduced?15:135)))
      this.later(()=>{if(this.packFx!==fx)return;this.packFx=null;this.busy=false;this.render()},reduced?100:1120)
    },reduced?70:470)))
  }
  animatePackChoice(operation,card){
    const preview=E.clone(this.state);operation(preview)
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,fx={phase:'lift',card,from:this.packSource(card),token:Symbol('booster-choice')}
    this.packChoiceFx=fx;this.busy=true;this.modal=null;this.audio.fx('deal');this.render()
    this.later(()=>{
      if(this.destroyed||this.packChoiceFx!==fx)return
      this.state=preview;this.persist();fx.phase='fly';this.render();this.audio.fx('deal')
      this.later(()=>{
        if(this.packChoiceFx!==fx)return
        const name=this.itemName(card);this.packChoiceFx=null;this.busy=false;this.render();this.showEffect(`${name} 已加入${card.kind==='joker'?'小丑牌架':'牌组'}`)
      },reduced?90:640)
    },reduced?25:220)
  }
  packOpeningOverlay(){
    const fx=this.packFx;if(!fx||fx.phase==='reveal')return ''
    const art=packArt(fx.family,fx.size)
    return `<div class="bp-pack-opening" aria-hidden="true"><div class="bp-pack-opening-shade"></div><div class="bp-pack-prop bp-pack-prop-${fx.phase}" style="--pack-from-x:${fx.from.x}px;--pack-from-y:${fx.from.y}px;--pack-from-scale:${fx.from.scale}"><div class="bp-pack-face">${art}</div><div class="bp-pack-half bp-pack-half-top">${art}</div><div class="bp-pack-half bp-pack-half-bottom">${art}</div><i class="bp-pack-rip"></i></div><span class="bp-pack-opening-label">${fx.phase==='tear'?'撕开补充包':fx.phase==='shake'?'摇一摇…':'补充包送达'}</span></div>`
  }
  packChoiceOverlay(){
    const fx=this.packChoiceFx;if(!fx)return ''
    const {card,from}=fx
    return `<div class="bp-card-flight bp-card-flight-${fx.phase}" style="--flight-left:${from.left}px;--flight-top:${from.top}px;--flight-width:${from.width}px;--flight-height:${from.height}px" aria-hidden="true">${this.art(card)}</div>`
  }
  addedCardsOverlay(){
    const fx=this.actionFx;if(fx?.phase!=='added')return ''
    const count=fx.addedCards.length,panelWidth=Math.min(520,this.root.clientWidth*.9),width=Math.min(144,Math.max(52,(panelWidth-64-(count-1)*12)/count))
    const afterText=fx.preview.pack?`确认后继续选择（还可选 ${fx.preview.pack.picksLeft} 张）`:'确认强化效果后返回游戏'
    return `<div class="bp-added-reveal" role="status" aria-live="polite"><section class="bp-added-panel"><span class="bp-eyebrow">新牌生成</span><h2>获得 ${count} 张${esc(fx.addedLabel)}</h2><div class="bp-added-cards">${fx.addedCards.map((card,index)=>`<div class="bp-added-card" style="--added-delay:${index*110}ms;--added-width:${width}px"><div>${playingCard(card)}</div><b>${esc(this.itemName(card))}</b><small>${esc(this.itemDesc(card))}</small></div>`).join('')}</div><p>${esc(afterText)}</p></section></div>`
  }
  positionPackRevealCards(){
    if(this.packFx?.phase!=='reveal')return
    const stage=this.root.querySelector('.bp-pack-stage .bp-shop-cards');if(!stage)return
    const center=stage.getBoundingClientRect(),cards=stage.querySelectorAll(':scope > .bp-item.bp-pack-card-reveal')
    cards.forEach(el=>{
      el.style.animation='none'
      const rect=el.getBoundingClientRect()
      el.style.setProperty('--pack-from-x',`${center.left+center.width/2-(rect.left+rect.width/2)}px`)
      el.style.setProperty('--pack-from-y',`${center.top+center.height/2-(rect.top+rect.height/2)}px`)
      void el.offsetWidth
      el.style.removeProperty('animation')
    })
  }
  positionPackChoice(){
    const fx=this.packChoiceFx;if(fx?.phase!=='fly')return
    const target=this.root.querySelector(fx.card.kind==='joker'?'.bp-joker-rack .bp-rack-cards':'[data-deck-pile]'),el=this.root.querySelector('.bp-card-flight')
    if(!target||!el)return
    const root=this.root.getBoundingClientRect(),rect=target.getBoundingClientRect()
    const toX=rect.left+rect.width/2-(root.left+fx.from.left+fx.from.width/2),toY=rect.top+rect.height/2-(root.top+fx.from.top+fx.from.height/2)
    el.style.setProperty('--flight-x',`${toX}px`);el.style.setProperty('--flight-y',`${toY}px`)
  }
  animateConsumable(operation,used){
    const before=E.clone(this.state),preview=E.clone(this.state),packChoice=!!this.state.pack
    const sort=this.sort==='rank'?(a,b)=>b.rank-a.rank||a.suit-b.suit:(a,b)=>a.suit-b.suit||b.rank-a.rank
    before.hand.sort(sort);preview.hand.sort(sort);operation(preview)
    const original=new Map(before.deck.map(c=>[c.uid,c])),finalCards=new Map(preview.deck.map(c=>[c.uid,c]))
    const changedUIDs=before.hand.filter(c=>{const next=finalCards.get(c.uid);return next&&['rank','suit','enh','edition','seal'].some(k=>c[k]!==next[k])}).map(c=>c.uid)
    const removedUIDs=before.hand.filter(c=>!finalCards.has(c.uid)).map(c=>c.uid)
    const addedUIDs=preview.deck.filter(c=>!original.has(c.uid)).map(c=>c.uid)
    const addedCards=preview.deck.filter(c=>!original.has(c.uid))
    const previewJokers=new Map(preview.jokers.map(j=>[j.uid,j])),beforeJokers=new Map(before.jokers.map(j=>[j.uid,j]))
    const removedJokers=before.jokers.filter(j=>!previewJokers.has(j.uid)),addedJokerUIDs=preview.jokers.filter(j=>!beforeJokers.has(j.uid)).map(j=>j.uid),changedJokerUIDs=before.jokers.filter(j=>{const next=previewJokers.get(j.uid);return next&&['edition','value','perished','disabled'].some(k=>j[k]!==next[k])}).map(j=>j.uid)
    const gatherUIDs=Array.from(new Set(changedUIDs))
    const sealUID=changedUIDs.find(id=>!original.get(id)?.seal&&finalCards.get(id)?.seal)||null
    const fx={phase:'cast',beforeHand:before.hand,preview,finalCards,changedUIDs,removedUIDs,addedUIDs,gatherUIDs,sealUID,removedJokers,changedJokerUIDs,addedJokerUIDs,token:Symbol('card-effect')}
    this.actionFx=fx;this.busy=true;this.modal=null
    this.effect=used.id==='sigil'?`${this.itemName(used)} · 正在重铸所有手牌花色`:sealUID?`${this.itemName(used)} · 正在压印封蜡`:removedUIDs.length?`${this.itemName(used)} · 目标牌即将销毁`:`${this.itemName(used)} · 效果正在显现`
    this.audio.fx('magic');this.render()
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const commitPreview=()=>{
      if(this.destroyed||this.actionFx!==fx)return
      this.state=preview;this.persist()
      const dealUIDs=Array.from(new Set(changedUIDs.concat(addedUIDs))).filter(id=>preview.hand.some(c=>c.uid===id))
      const hasExitFX=dealUIDs.length>0||removedJokers.length>0||changedJokerUIDs.length>0||addedJokerUIDs.length>0
      this.busy=hasExitFX;this.actionFx=hasExitFX?{phase:'after',dealUIDs,removedJokers,changedJokerUIDs,addedJokerUIDs,token:fx.token}:null
      this.render();this.audio.fx('coin')
      this.showEffect(`${this.itemName(used)} 已生效 · ${this.itemDesc(used)}`)
      if(this.actionFx){const handDuration=dealUIDs.length?(reduced?180:1050+Math.max(0,dealUIDs.length-1)*65):0,jokerDuration=changedJokerUIDs.length||addedJokerUIDs.length?900:removedJokers.length?780+Math.max(0,removedJokers.length-1)*90:0;this.later(()=>{if(this.actionFx?.token===fx.token){this.actionFx=null;this.busy=false;this.render()}},Math.max(handDuration,jokerDuration))}
    }
    const finish=()=>{
      if(this.destroyed||this.actionFx!==fx)return
      if(packChoice&&addedCards.length){
        fx.phase='added';fx.addedCards=addedCards;fx.addedLabel={grim:'增强 A',familiar:'增强人头牌',incantation:'增强数字牌',cryptid:'复制牌'}[used.id]||'新牌'
        this.render();this.showEffect(`${this.itemName(used)} · 获得 ${addedCards.length} 张${fx.addedLabel}，请确认新牌`)
        addedCards.forEach((_,index)=>this.later(()=>this.audio.fx('deal'),index*(reduced?45:150)))
        this.later(commitPreview,reduced?750:this.settings.fast?1400:1800)
        return
      }
      commitPreview()
    }
    this.later(()=>{
      if(this.destroyed||this.actionFx!==fx)return
      fx.phase='reveal';this.render();this.audio.fx('magic')
      this.later(()=>{
        if(this.destroyed||this.actionFx!==fx)return
        const shouldGather=gatherUIDs.length>1||removedUIDs.length>0||addedUIDs.length>0||removedJokers.length>0||changedJokerUIDs.length>0||addedJokerUIDs.length>0
        if(!shouldGather){finish();return}
        fx.phase='gather';this.render();this.audio.fx('deal')
        const gatherDuration=(reduced?50:390)+Math.max(0,Math.max(gatherUIDs.length,removedUIDs.length)-1)*(reduced?15:65)
        const destroyDuration=removedUIDs.length?(reduced?50:(this.settings.fast?650:840)+(removedUIDs.length-1)*95+160):0
        const duration=Math.max(gatherDuration,destroyDuration)
        this.later(finish,duration)
      },reduced?90:1000)
    },reduced?60:420)
  }
  positionEffectCards(){
    const pile=this.root.querySelector('[data-deck-pile]')?.getBoundingClientRect()
    if(!pile)return
    const fx=this.actionFx,ids=fx?.phase==='gather'?fx.gatherUIDs:fx?.phase==='after'?fx.dealUIDs:[]
    ids.forEach((uid,index)=>{
      const el=this.root.querySelector(`.bp-hand [data-uid="${uid}"]`);if(!el)return
      const card=el.getBoundingClientRect(),x=pile.left+pile.width/2-(card.left+card.width/2),y=pile.top+pile.height/2-(card.top+card.height/2)
      el.style.setProperty('--fx-x',`${x}px`);el.style.setProperty('--fx-y',`${y}px`);el.style.setProperty('--fx-from-x',`${-x}px`);el.style.setProperty('--fx-from-y',`${-y}px`);el.style.setProperty('--fx-delay',`${index*65}ms`)
    })
  }
  animatePlay(){
    if(this.busy)return
    const before=E.clone(this.state),result=this.transact(E.play)
    const token=++this.scoreToken
    this.busy=true;this.anim={before,result,event:result.events[0],index:0,token,skipped:false};this.render()
    const events=result.events.length>22?result.events.filter((_,i)=>i===0||i===result.events.length-1||i%Math.ceil(result.events.length/20)===0):result.events
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const tickDelay=reduced?95:this.settings.fast?145:280
    let index=0
    const schedule=fn=>{
      this.clearScoreTimer()
      const timer=this.later(()=>{if(this.scoreTimer===timer)this.scoreTimer=null;fn()},tickDelay)
      this.scoreTimer=timer
    }
    const tick=()=>{
      if(!this.anim||this.anim.token!==token)return
      if(this.anim.skipped){this.finishScoreAnimation(token);return}
      if(index<events.length){this.anim.event=events[index];this.anim.index=index;this.updateScore(events[index]);this.audio.fx('score',index++);schedule(tick)}
      else {
        this.updateScore({chips:result.chips,mult:result.mult,source:`+${num(result.total)}`});this.audio.fx('coin')
        this.clearScoreTimer();const timer=this.later(()=>{if(this.scoreTimer===timer)this.scoreTimer=null;this.finishScoreAnimation(token)},reduced?100:this.settings.fast?260:450);this.scoreTimer=timer
      }
    }
    this.clearScoreTimer();const timer=this.later(tick,150);this.scoreTimer=timer
  }
  clearScoreTimer(){
    if(!this.scoreTimer)return
    clearTimeout(this.scoreTimer);this.timers.delete(this.scoreTimer);this.scoreTimer=null
  }
  finishScoreAnimation(token){
    if(!this.anim||this.anim.token!==token)return
    this.clearScoreTimer();this.busy=false;this.anim=null;this.render()
  }
  skipScoreAnimation(){
    if(!this.anim||this.anim.skipped)return
    const token=this.anim.token,result=this.anim.result
    this.anim.skipped=true
    this.anim.event={chips:result.chips,mult:result.mult,source:`+${num(result.total)}`}
    const skipButton=this.root.querySelector('[data-action="skip-score"]');if(skipButton)skipButton.disabled=true
    this.clearScoreTimer()
    this.updateScore(this.anim.event)
    this.showEffect(`${result.name} · 最终得分 ${num(result.total)}`);this.audio.fx('coin')
    const timer=this.later(()=>{if(this.scoreTimer===timer)this.scoreTimer=null;this.finishScoreAnimation(token)},650);this.scoreTimer=timer
  }
  updateScore(event){
    const chips=this.root.querySelector('[data-chips]'),mult=this.root.querySelector('[data-mult]'),label=this.root.querySelector('[data-score-event]')
    if(chips)chips.textContent=num(event.chips);if(mult)mult.textContent=num(event.mult);if(label)label.textContent=event.source
    if(event.uid&&(event.c||event.m||event.x&&event.x!==1))this.showEffect(`${event.source} · ${event.x&&event.x!==1?`倍率 ×${num(event.x)}`:event.m?`倍率 +${num(event.m)}`:`筹码 +${num(event.c)}`}`)
    this.root.querySelectorAll('.bp-trigger').forEach(el=>el.classList.remove('bp-trigger'))
    if(event.uid){const el=this.root.querySelector(`[data-visual="${event.uid}"]`);if(el){void el.offsetWidth;el.classList.add('bp-trigger')}}
  }
  orderedHand(){return this.state.hand.slice().sort(this.sort==='rank'?(a,b)=>b.rank-a.rank||a.suit-b.suit:(a,b)=>a.suit-b.suit||b.rank-a.rank)}
  cardDetailsPanel(card){
    const entries=playingCardDetails(card)
    if(!entries.length)return '<p>这张牌背面朝上，牌面与效果暂不可查看。</p>'
    return `<div class="bp-card-facts">${entries.map(({label,value})=>`<section><b>${esc(label)}</b><p>${esc(value)}</p></section>`).join('')}</div>`
  }
  cardButton(c,{selected=false,disabled=false,hidden=false,scoring=false,fxClass='',sealFx=false,sealKind='gold',fxDelay='0ms'}={}){
    const detail=[c.enh?ENHANCEMENTS[c.enh]:'',c.edition?EDITIONS[c.edition]:'',c.seal?SEALS[c.seal]:''].filter(Boolean).join(' · ')
    const mods=[c.enh?ENHANCEMENTS[c.enh].split(' ')[0]:'',c.edition?EDITIONS[c.edition].split(' ')[0]:'',c.seal?sealShort[c.seal]:''].filter(Boolean).join(' · ')
    const destroying=fxClass.split(/\s+/).includes('bp-fx-destroy')
    const shards=destroying?`<span class="bp-destroy-shards" aria-hidden="true">${Array.from({length:5},(_,i)=>`<span class="bp-destroy-shard bp-shard-${i+1}">${playingCard(c,hidden)}</span>`).join('')}</span>`:''
    return `<button type="button" class="bp-playing ${selected?'bp-selected':''} ${!hidden&&c.edition?'bp-ed-'+c.edition:''} ${fxClass} ${!hidden&&this.state&&E.debuffed(this.state,c)?'bp-debuff':''}" style="--fx-delay:${fxDelay}" data-action="select" data-uid="${c.uid}" data-visual="${c.uid}" ${disabled?'disabled':''} aria-pressed="${selected}" aria-label="${esc(hidden?'背面朝上的牌':cardName(c)+(detail?'，'+detail:''))}" title="${esc(hidden?'背面朝上':cardName(c)+(detail?' · '+detail:''))}">${playingCard(c,hidden)}${shards}${sealFx?`<span class="bp-seal-stamp bp-seal-${sealKind}" aria-hidden="true">✦</span>`:''}${!hidden&&mods?`<span class="bp-card-mod">${esc(mods)}</span>`:''}${this.state&&this.state.forced===c.uid?'<span class="bp-forced">必须选择</span>':''}</button>`
  }
  itemName(card){return card.kind==='joker'?byId(JOKERS,card.id).name:card.kind==='planet'?byId(HANDS,card.id).planet:card.kind==='voucher'?byId(VOUCHERS,card.id).name:card.kind==='pack'?boosterPack(card.id).name:card.kind==='card'?cardName(card):byId(card.kind==='spectral'?SPECTRALS:TAROTS,card.id).name}
  itemDesc(card){
    if(card.kind==='joker')return byId(JOKERS,card.id).desc
    if(card.kind==='planet'){const h=byId(HANDS,card.id);return `${h.name}升 1 级：+${h.dc} 筹码，+${h.dm} 倍率`}
    if(card.kind==='voucher')return byId(VOUCHERS,card.id).desc
    if(card.kind==='pack'){
      const pack=boosterPack(card.id)
      return `含 ${pack.options} 张${pack.content}，选择 ${pack.choose} 张${pack.action}。${pack.description}`
    }
    if(card.kind==='card')return [card.enh?ENHANCEMENTS[card.enh]:'标准扑克牌',card.edition?EDITIONS[card.edition]:'',card.seal?SEALS[card.seal].split('：')[0]:''].filter(Boolean).join(' · ')
    return byId(card.kind==='spectral'?SPECTRALS:TAROTS,card.id).desc
  }
  art(card,hidden=false){if(card.kind==='joker')return jokerArt(card,hidden);if(card.kind==='pack'){const pack=boosterPack(card.id);return packArt(pack.family,pack.size)}return card.kind==='card'?playingCard(card):consumableArt(card)}
  itemTile(card,mode='owned',options={}){
    const s=this.state,hidden=mode==='owned'&&s&&s.phase==='play'&&s.blind===2&&s.boss==='acorn'&&!s.disabledBoss&&!E.has(s,'chicot')&&card.kind==='joker',name=hidden?'翻面的小丑':this.itemName(card),description=hidden?'琥珀橡果：本轮小丑翻面并打乱':this.itemDesc(card)
    const cost=s?E.itemCost(s,card):0
    const hint=mode==='owned'&&!hidden?cardCue(s,card):null,ready=hint&&hint.ready&&!this.busy
    const jokerFx=this.actionFx?.phase==='after'&&(this.actionFx.changedJokerUIDs?.includes(card.uid)||this.actionFx.addedJokerUIDs?.includes(card.uid))?'bp-fx-joker-upgrade':''
    const packReveal=mode==='pack'&&this.packFx?.phase==='reveal',packSelected=this.packChoiceFx?.phase==='lift'&&this.packChoiceFx.card.uid===card.uid
    return `<div class="bp-item ${card.edition?'bp-ed-'+card.edition:''} ${card.disabled||card.perished?'bp-disabled-joker':''} ${hint?'bp-has-cue':''} ${ready?'bp-cue-ready':''} ${jokerFx} ${packReveal?'bp-pack-card-reveal':''} ${packSelected?'bp-pack-choice-selected':''}" data-visual="${card.uid}" ${packReveal?`style="--pack-delay:${(options.index||0)*135}ms"`:''}>
      <button class="bp-item-art ${card.kind==='voucher'?'bp-voucher-frame':''}" data-action="info" data-uid="${card.uid}" title="${esc(hint?hint.detail:description)}" aria-label="${esc(name+'：'+(hint?hint.detail:description))}">${card.kind==='voucher'?`<div class="bp-voucher-art"><span>VOUCHER</span><b>10</b><small>永久升级</small></div>`:this.art(card,hidden)}${hint?`<span class="bp-card-cue bp-cue-${hint.tone}" data-cue="${card.id}">${ready?'✦ ':''}${esc(hint.label)}</span>`:''}</button>
      <span class="bp-item-name">${esc(name)}</span>
      ${mode!=='owned'?`${mode==='shop'&&card.kind==='pack'?'':`<p class="bp-item-desc">${esc(description)}</p>`}${button(mode==='shop'?'buy':'pack-choose',mode==='shop'?`购买 <b>$${cost}</b>`:card.kind==='joker'||card.kind==='card'?'选择':'使用','bp-gold',this.busy||mode==='shop'&&!E.canPay(s,cost),`data-uid="${card.uid}"`)}`:''}
    </div>`
  }
  entry(){
    const deck=byId(DECKS,this.deckType)
    return `<div class="bp-entry"><div class="bp-entry-top"><span>POKER ROGUELIKE</span>${button('help','玩法说明','bp-quiet')}${this.immersive||this.nativeFullscreen?button('fullscreen','退出全屏','bp-quiet'):''}</div><div class="bp-title-art"><img class="bp-entry-cover" src="/img/games/balatro-cover.svg" alt="小丑牌 · 筹码与倍率，构筑你的致胜牌组"></div><div class="bp-start-panel"><div class="bp-deck-preview" style="--deck-color:${deck.color}">${playingCard({},true)}<b>${deck.name}</b><span>${deck.desc}</span></div><div class="bp-start-options"><div class="bp-start-stake"><label class="bp-eyebrow">起始赌注</label>${button('stake',`${STAKES[this.stake]} <span aria-hidden="true">▾</span>`,'bp-quiet',false,'aria-haspopup="dialog"')}</div><div class="bp-deck-choices">${DECKS.map(d=>`<button data-action="deck-choice" data-id="${d.id}" class="${d.id===deck.id?'active':''}" style="--deck-color:${d.color}" title="${esc(d.name+'：'+d.desc)}" aria-label="${d.name}" aria-pressed="${d.id===deck.id}"><i></i></button>`).join('')}</div><label class="bp-seed-label">种子 <input data-seed maxlength="32" placeholder="随机开局（可选）" value="${esc(this.seed)}" /></label><div class="bp-start-buttons">${this.saved?button('resume',`继续游戏 <small>底注 ${this.saved.ante} · $${this.saved.money}</small>`,'bp-blue'):''}${button('start',this.saved?'新一局':'开始游戏','bp-red')}</div><small class="bp-entry-note">开始即全屏 · 随时退出 · 自动保存进度</small></div></div><div class="bp-entry-bottom"><span>♠ ♥ ♣ ♦</span><span>盲注 · 小丑组合 · 商店 · 塔罗 · 星球</span><a class="bp-btn bp-quiet bp-lobby-link" href="/blogs/other/games.html">返回游戏大厅</a>${button('collection','查看卡牌','bp-quiet')}</div></div>`
  }
  sidebar(s){
    const boss=byId(BOSSES,s.boss),blindName=s.blind===2?boss.name:['小盲注','大盲注'][s.blind]
    const p=this.anim?Object.assign({},this.anim.result,{name:this.anim.result.name}):s.selected.length&&s.phase==='play'?E.preview(s):null
    const hiddenPreview=!!(p&&p.unknown)
    const chips=this.anim?this.anim.event.chips:p&&!hiddenPreview?p.chips:0,mult=this.anim?this.anim.event.mult:p&&!hiddenPreview?p.mult:0
    const chipsLabel=hiddenPreview?'?':num(chips),multLabel=hiddenPreview?'?':num(mult)
    return `<aside class="bp-sidebar"><div class="bp-brand"><b>小丑牌</b><span>BALATRO</span></div><section class="bp-blind-panel"><div class="bp-blind-label"><span class="bp-chip-icon">${s.blind===2?'✦':'$'}</span><b>${blindName}</b></div><small>至少获得</small><strong class="bp-target">${num(E.target(s))}</strong><small>分数 · 奖励 $${E.blindReward(s)}</small>${s.blind===2?`<p class="bp-boss-rule">${esc(boss.desc)}</p>`:''}</section><div class="bp-round-score"><span>本轮得分</span><b>${num(this.anim?this.anim.before.score:s.score)}</b></div><div class="bp-calculator ${hiddenPreview?'bp-calculator-hidden':''}"><div class="bp-hand-name">${p?(hiddenPreview?'暗牌 · 牌型未知':p.name):'选择牌型'} ${p&&!hiddenPreview?`<small>Lv.${s.levels[p.id]}</small>`:''}</div><div class="bp-equation"><strong data-chips>${chipsLabel}</strong><span>×</span><strong data-mult>${multLabel}</strong></div><small>${this.anim?'正在结算…':hiddenPreview?'暗牌信息隐藏':'基础筹码 × 基础倍率'}</small></div><div class="bp-counters"><div><span>出牌</span><b class="bp-blue-text">${s.hands}</b></div><div><span>弃牌</span><b class="bp-red-text">${s.discards}</b></div></div><div class="bp-money">$${num(s.money)}</div><div class="bp-progress"><div><span>底注</span><b>${s.ante}<small>/8</small></b></div><div><span>回合</span><b>${s.round}</b></div></div><div class="bp-side-actions">${button('hands','牌型','bp-blue')}${button('menu','选项','bp-red')}</div></aside>`
  }
  inventory(s){
    const lost=this.actionFx?.phase==='after'?this.actionFx.removedJokers:[]
    const ghosts=lost.map((j,i)=>`<div class="bp-item bp-joker-ghost bp-fx-joker-destroy" style="--fx-delay:${i*90}ms" aria-hidden="true"><div class="bp-item-art">${jokerArt(j)}</div><span class="bp-item-name">${esc(this.itemName(j))}</span></div>`).join('')
    return `<div class="bp-inventory"><section class="bp-joker-rack"><div class="bp-rack-label"><span>小丑牌 <b>${s.jokers.length}/${E.slots(s)}</b></span><small>从左至右触发 · 拖动调序 · 点击查看</small></div><div class="bp-rack-cards">${s.jokers.map(j=>this.itemTile(j)).join('')}${ghosts}${Array.from({length:Math.max(0,E.slots(s)-s.jokers.length)},()=>'<div class="bp-empty-slot"><span>J</span></div>').join('')}</div></section><section class="bp-consumable-rack"><div class="bp-rack-label"><span>消耗牌 <b>${s.consumables.length}/${E.consumableSlots(s)}</b></span></div><div class="bp-rack-cards">${s.consumables.map(c=>this.itemTile(c)).join('')}${Array.from({length:Math.max(0,E.consumableSlots(s)-s.consumables.length)},()=>'<div class="bp-empty-slot bp-consume-empty"><span>✧</span></div>').join('')}</div></section></div>`
  }
  cueStrip(s){
    if(this.busy||s.phase!=='play')return ''
    const tracked=s.jokers.filter(j=>['toDo','ancient','castle','idol','mail','loyalty','DNA','sixth','trading','burnt'].includes(j.id))
    const reminders=tracked.map(j=>({j,hint:cardCue(s,j)})).filter(x=>x.hint&&x.hint.tone!=='muted')
    return reminders.length?`<div class="bp-live-cues" aria-label="本轮卡牌提醒">${reminders.map(({j,hint})=>`<span class="${hint.ready?'ready':''}">${hint.ready?'✦ ':''}${esc(byId(JOKERS,j.id).name)} · ${esc(hint.label)}</span>`).join('')}</div>`:''
  }
  blindSelection(s){
    return `<div class="bp-select-stage"><div class="bp-stage-heading"><span>底注 ${s.ante}</span><h2>选择你的盲注</h2><p>击败盲注后进入商店；跳过盲注获得标签。</p></div><div class="bp-blind-choices">${[0,1,2].map(i=>{
      const boss=byId(BOSSES,s.boss),active=i===s.blind,done=i<s.blind
      return `<section class="bp-blind-choice ${active?'active':''} ${done?'complete':''} bp-blind-${i}"><div class="bp-blind-choice-head">${i===2?boss.name:['小盲注','大盲注'][i]}</div><div class="bp-blind-token">${done?'✓':i===2?'✦':i===1?'$$':'$'}</div><small>至少获得</small><strong>${num(E.target(s,i))}</strong><span>奖励 $${E.blindReward(s,i)}</span><p>${i===2?boss.desc:active?tagNames[E.skipReward(s)]:'击败后进入商店'}</p>${button('blind',done?'已完成':active?'选择盲注':'未解锁',active?'bp-red':'',!active)}${i<2&&active?button('skip','跳过盲注 →','bp-quiet'):''}</section>`
    }).join('')}</div>${s.tags.length?`<div class="bp-tags">${s.tags.map(t=>`<span>${tagNames[t]}</span>`).join('')}</div>`:''}${s.vouchers.includes('director')?button('boss','更换 Boss · $10','bp-quiet',!E.canPay(s,10)):''}</div>`
  }
  hand(s){
    const fx=this.actionFx,list=this.orderedHand(),baseCards=this.anim?this.anim.before.hand.filter(c=>!this.anim.result.cards.some(p=>p.uid===c.uid)):fx&&['cast','reveal','gather','added'].includes(fx.phase)?fx.beforeHand:list
    const cards=fx?.phase==='added'?baseCards.filter(c=>!fx.removedUIDs.includes(c.uid)):baseCards
    return `<div class="bp-hand-area"><div class="bp-hand-caption"><span>${this.anim?'结算中':this.busy?'效果处理中…':s.pack?'选择手牌作为消耗牌目标':`手牌 ${s.hand.length}/${E.handSize(s)} · 已选 ${s.selected.length}/5`}</span><div>${button('sort-rank','点数',this.sort==='rank'?'bp-sort-active':'',this.busy)}${button('sort-suit','花色',this.sort==='suit'?'bp-sort-active':'',this.busy)}</div></div><div class="bp-hand ${cards.length>12?'bp-overfull':''}" style="--hand-count:${Math.max(1,cards.length)}">${cards.map((c,index)=>{
      const next=fx?.phase==='reveal'?fx.finalCards.get(c.uid):null,display=next||c,changed=fx?.changedUIDs.includes(c.uid),removed=fx?.removedUIDs.includes(c.uid),gather=fx?.phase==='gather'&&fx.gatherUIDs.includes(c.uid),destroy=fx?.phase==='gather'&&removed,deal=fx?.phase==='after'&&fx.dealUIDs.includes(c.uid)
      const sealTarget=fx?.sealUID===c.uid,fxClass=gather?'bp-fx-gather':deal?'bp-fx-deal':destroy?'bp-fx-destroy':removed?'bp-fx-mark':sealTarget&&fx.phase==='cast'?'bp-fx-seal-pending':changed?fx.phase==='reveal'?'bp-fx-reveal':fx.phase==='cast'?'bp-fx-shake':'' :''
      const sealFx=sealTarget&&fx.phase==='reveal',sealKind=fx?.finalCards.get(c.uid)?.seal||'gold'
      const destroyDelay=destroy?fx.removedUIDs.indexOf(c.uid)*95:index*65
      return `<div class="bp-hand-card">${this.cardButton(display,{selected:s.selected.includes(c.uid),disabled:this.busy||s.phase!=='play'&&!s.pack,hidden:c.hidden,fxClass,sealFx,sealKind,fxDelay:`${destroyDelay}ms`})}${!c.hidden?`<button type="button" class="bp-card-detail-button" data-action="card-details" data-uid="${c.uid}" aria-label="查看 ${esc(cardName(c))} 的牌面与效果详情" title="卡牌详情">i</button>`:''}</div>`
    }).join('')}</div><div class="bp-play-controls">${button('play','出牌','bp-blue',this.busy||s.phase!=='play'||!s.selected.length||!!s.pack)}<span>${this.anim?'正在结算…':this.busy?'正在展示效果…':s.pack?'先选目标，再点击包中的「使用」':'最多选择 5 张牌'}</span>${button('discard','弃牌','bp-red',this.busy||s.phase!=='play'||!s.selected.length||s.discards<=0||!!s.pack)}</div></div>`
  }
  playStage(s){
    if(this.anim)return `<div class="bp-play-stage"><div class="bp-score-label" data-score-event>${this.anim.result.name}</div><div class="bp-scoring-cards">${this.anim.result.cards.map(c=>this.cardButton(c,{disabled:true})).join('')}</div><span class="bp-stage-hint">扑克牌 → 留手效果 → 小丑牌</span>${button('skip-score','跳过本次结算','bp-quiet',this.anim.skipped)}</div>`
    return `<div class="bp-play-stage"><div class="bp-table-emblem">♠<span>PLAY YOUR HAND</span></div>${s.lastResult?`<div class="bp-last-hand"><span>上一手 · ${s.lastResult.name}</span><b>+${num(s.lastResult.total)}</b></div>`:`<p class="bp-stage-hint">选择手牌，组合牌型<br>小丑牌让每一手牌都不一样。</p>`}${s.blind===2?`<div class="bp-live-boss">✦ ${esc(byId(BOSSES,s.boss).desc)}</div>`:''}</div>`
  }
  reward(s){const r=s.roundReward;return `<div class="bp-result"><span class="bp-eyebrow">BLIND DEFEATED</span><h2>盲注击破</h2><div class="bp-result-score">${num(s.score)} <small>分</small></div><div class="bp-receipt"><div><span>盲注奖励</span><b>$${r.reward}</b></div><div><span>剩余出牌</span><b>$${r.hands}</b></div><div><span>利息</span><b>$${r.interest}</b></div>${r.extra?`<div><span>卡牌与牌组奖励</span><b>$${r.extra}</b></div>`:''}<div class="bp-receipt-total"><span>本轮收入</span><b>$${r.total}</b></div></div>${button('cash','领取奖励 →','bp-gold')}<small>奖励已入账，结算不会重复领取。</small></div>`}
  shop(s){
    if(s.pack){
      const pack=boosterPack(s.pack.id||s.pack.kind),picksLeft=s.pack.picksLeft||pack.choose,picksMade=s.pack.picksMade||0,instruction=pack.action.includes('加入')?`选择 ${picksLeft} 张加入牌组`:`选择 ${picksLeft} 张立即使用`
      return `<div class="bp-shop-stage bp-pack-stage"><div class="bp-stage-heading"><span>补充包 · 已选 ${picksMade}/${pack.choose} · 还可选 ${picksLeft} 张</span><h2>${pack.name}</h2><p>${esc(instruction)} · ${esc(this.itemDesc({kind:'pack',id:pack.id}))}</p></div><div class="bp-shop-cards">${s.pack.cards.map((c,index)=>this.itemTile(c,'pack',{index})).join('')}</div>${button('pack-skip',picksMade?'跳过剩余选择':'跳过补充包','bp-quiet',this.busy)}</div>`
    }
    return `<div class="bp-shop-stage"><div class="bp-shop-heading"><div><span>SHOP</span><h2>商店</h2></div>${button('next','下一轮 →','bp-red')}${button('reroll',`重掷 <b>$${E.rerollCost(s)}</b>`,'bp-green',!E.canPay(s,E.rerollCost(s)))}</div><div class="bp-shop-shelves"><section><label>卡牌</label><div class="bp-shop-cards">${s.shop.cards.length?s.shop.cards.map(c=>this.itemTile(c,'shop')).join(''):'<p class="bp-sold-out">本批商品已售完</p>'}</div></section><section class="bp-shop-extras"><label>补充包与优惠券</label><div class="bp-shop-cards">${s.shop.packs.map(c=>this.itemTile(c,'shop')).join('')}${s.shop.voucher?this.itemTile(s.shop.voucher,'shop'):''}</div></section></div><div class="bp-shop-tip">小丑槽位 ${s.jokers.length}/${E.slots(s)} · 点击拥有的卡牌可出售 · 每 $5 存款产生 $1 利息</div></div>`
  }
  end(s){const win=s.phase==='won';return `<div class="bp-result"><span class="bp-eyebrow">${win?'YOU WIN!':'GAME OVER'}</span><h2>${win?'底注 8 · 通关！':'本局结束'}</h2><div class="bp-result-score">${num(s.best)}<small>最高单手</small></div><p>${win?'继续挑战无尽模式，看看这副牌的极限。':`本轮得到 ${num(s.score)} 分，还差 ${num(E.target(s)-s.score)} 分。`}</p><div class="bp-receipt"><div><span>底注 / 回合</span><b>${s.ante} / ${s.round}</b></div><div><span>累计出牌</span><b>${s.totalHands}</b></div><div><span>种子</span><b>${esc(s.seed)}</b></div></div>${win?button('endless','继续无尽模式','bp-blue'):''}${button('restart','再来一局','bp-red')}</div>`}
  game(){
    const s=this.state,withHand=(s.phase==='play'||s.pack&&['tarot','spectral'].includes(s.pack.kind)||!!this.anim)
    const stage=this.anim?this.playStage(s):s.phase==='select'?this.blindSelection(s):s.phase==='play'?this.playStage(s):s.phase==='reward'?this.reward(s):s.phase==='shop'?this.shop(s):this.end(s)
    return `<div class="bp-game"><div class="bp-topbar"><span>♠ <b>小丑牌</b> <small>${esc(byId(DECKS,s.deckType).name)}</small></span><div>${button('menu','≡','bp-icon',false,'aria-label="游戏选项"')}${button('help','?','bp-icon',false,'aria-label="玩法帮助"')}${button('sound',this.settings.sound?'音效 开':'音效 关','bp-quiet')}${button('music',this.settings.music?'♫ 开':'♫ 关','bp-quiet',false,'aria-label="切换音乐"')}${button('fullscreen',this.immersive?'退出全屏':'进入全屏','bp-quiet')}</div></div><div class="bp-table">${this.sidebar(s)}<main class="bp-main">${this.inventory(s)}${this.cueStrip(s)}<div class="bp-stage ${withHand?'bp-has-hand':''}">${stage}</div>${withHand?this.hand(s):''}<footer class="bp-table-footer"><span data-deck-pile>${s.phase==='play'?`牌库 ${s.draw.length} · 已出 ${s.spent.length}`:`种子 ${esc(s.seed)}`}<small> · 自动保存</small></span>${button('deck',`查看牌组 ${s.deck.length} 张`,'bp-quiet')}</footer></main></div></div>`
  }
  findItem(uid){const s=this.state;if(!s)return null;return s.deck.concat(s.jokers,s.consumables,s.shop?s.shop.cards.concat(s.shop.packs,s.shop.voucher?[s.shop.voucher]:[]):[],s.pack?s.pack.cards:[]).find(c=>c.uid===uid)}
  dialog(){
    const m=this.modal;if(!m)return ''
    let title='',body='',cls=''
    const s=this.state
    if(m.type==='help'){
      title='怎么玩'
      body=`<div class="bp-help-grid"><section><b>01 · 打出牌型</b><p>从手牌选 1～5 张。对子、同花、顺子等决定基础筹码和倍率。只有参与牌型的牌计分；A 为 11 筹码，人头牌为 10。</p></section><section><b>02 · 筹码 × 倍率</b><p>先结算打出的牌，再结算留手效果，最后从左到右触发小丑。把加倍率的小丑放在乘倍率的小丑前面，得分会不同。</p></section><section><b>03 · 卡包里有什么</b><p>补充包分普通、巨型和超级三种：巨型包提供更多选项，超级包可选两张。小丑包获得持续能力；天体包升级牌型；秘术包改变或强化手牌；幻灵包是强力的一次性效果。点开卡包详情可查看本包张数、选择数和卡牌用途。</p></section><section><b>04 · 连过 8 个底注</b><p>每个底注有小盲注、大盲注、Boss 盲注。前两个可跳过领取标签，Boss 不能跳过。出牌耗尽且分数不够则本局结束。</p></section><section class="bp-help-seals"><b>05 · 四种蜡封效果</b><div class="bp-seal-legend"><p><strong>红色蜡封</strong>：触发时，这张牌的效果额外触发一次。</p><p><strong>蓝色蜡封</strong>：击败盲注时若留在手牌中，生成上一手牌型对应的星球牌。</p><p><strong>金色蜡封</strong>：这张牌打出计分时，每次触发获得 $3。</p><p><strong>紫色蜡封</strong>：弃掉这张牌时生成一张塔罗牌。</p></div></section></div><div class="bp-help-note"><b>操作</b><p>单击选牌；再次单击取消。星球牌可快速双点使用。键盘 1～8 选牌，Enter 出牌，D 弃牌。拖动小丑牌可调整结算顺序，也可打开详情使用左右移牌。改牌类消耗牌须先选择手牌目标。</p><p>开始自动请求全屏；不支持系统全屏的设备使用网页全屏。iPhone Safari 普通标签页仍保留系统地址栏，添加到主屏幕后可使用独立窗口。关闭页面后可从首页继续。</p></div>`
    }
    if(m.type==='stakes'){
      title='选择起始赌注';cls='bp-stake-dialog'
      body=`<p class="bp-stake-intro">难度逐级增加；选择更高赌注时，下面所有较低赌注的规则也会一并生效。</p><div class="bp-stakes-list">${STAKES.map((name,index)=>{const selected=this.stake===index;return button('stake-select',`<span class="bp-stake-token" style="--stake-color:${stakeColors[index]}">${String(index+1).padStart(2,'0')}</span><span class="bp-stake-copy"><b>${name}</b><small>${stakeDescriptions[index]}</small></span><span class="bp-stake-check" aria-hidden="true">${selected?'✓':''}</span>`,`bp-stake-option ${selected?'bp-stake-active':''}`,false,`data-id="${index}" aria-pressed="${selected}"`) }).join('')}</div><p class="bp-stake-footnote">赌注规则会在开局后持续生效，本局中不能更改。</p>`
    }
    if(m.type==='hands'){
      title='牌型与等级';body=`<div class="bp-hands-table">${HANDS.slice().reverse().map(h=>{const b=s?E.handBase(s,h.id):h;return `<div><b>${h.name}</b><span>Lv.${s?s.levels[h.id]:1}</span><strong class="bp-blue-text">${num(b.chips)}</strong><span>×</span><strong class="bp-red-text">${num(b.mult)}</strong><small>${h.planet}</small></div>`}).join('')}</div><p class="bp-help-note">显示基础分数。计分牌的筹码、增强牌与小丑效果会依次加入。高牌只计算最高点数牌，对子只计算对子牌；石头牌额外计分。</p>`
    }
    if(m.type==='menu'){
      title='游戏选项';body=`<div class="bp-menu-buttons">${button('sound',`音效：${this.settings.sound?'开':'关'}`,'bp-blue')}${button('music',`背景音乐：${this.settings.music?'开':'关'}`,'bp-blue')}${button('fast',`快速结算：${this.settings.fast?'开':'关'}`,'bp-blue')}${button('hands','查看牌型','bp-green')}${button('collection','卡牌图鉴','bp-green')}${button('restart','重新开始','bp-red',this.busy)}</div><p>当前牌组：${byId(DECKS,s.deckType).name}<br>种子：${esc(s.seed)}<br>进度会自动保存在当前浏览器。</p>`
    }
    if(m.type==='confirm'){title='重新开始？';body=`<p>确认后会离开当前失败/通关画面，返回牌组与赌注选择。当前进度存档将被替换；取消则留在这局，不改动进度。</p><div class="bp-menu-buttons">${button('new-confirm','确认并返回开局选择','bp-red',this.busy)}${button('close','取消，留在当前游戏','bp-blue')}</div>`}
    if(m.type==='new-run'){title='开始新一局？';body=`<p>这会用当前选择的牌组、赌注和种子开始新局，并替换浏览器里已有的自动存档。旧进度不会被保留。</p><div class="bp-menu-buttons">${button('start-confirm','确认并开始新一局','bp-red')}${button('close','取消','bp-blue')}</div>`}
    if(m.type==='deck'){
      title=`完整牌组 · ${s.deck.length} 张`;cls='bp-wide-dialog';body=`<div class="bp-deck-summary">${SUITS.map((suit,i)=>`<span>${suit} ${s.deck.filter(c=>c.suit===i&&c.enh!=='stone').length}</span>`).join('')}<span>石头 ${s.deck.filter(c=>c.enh==='stone').length}</span></div><div class="bp-deck-grid">${s.deck.slice().sort((a,b)=>a.suit-b.suit||b.rank-a.rank).map(c=>{const hidden=s.hand.some(handCard=>handCard.uid===c.uid&&handCard.hidden),detail=hidden?'背面朝上':playingCardDetails(c).map(x=>`${x.label}：${x.value}`).join('；');return `<button type="button" class="bp-deck-card" data-action="card-details" data-from="deck" data-uid="${c.uid}" ${hidden?'disabled':''} title="${esc(detail)}" aria-label="${hidden?'背面朝上的牌':`查看 ${cardName(c)} 的牌面与效果详情`}">${playingCard(c,hidden)}</button>`}).join('')}</div>`
    }
    if(m.type==='collection'){
      title=`卡牌图鉴 · ${JOKERS.length} 张小丑`;cls='bp-wide-dialog';body=`<p>另含 ${TAROTS.length} 张塔罗、${HANDS.length} 张星球、${SPECTRALS.length} 张幻灵，${VOUCHERS.length} 种优惠券。此处展示当前已实现效果。</p><div class="bp-collection">${JOKERS.map(j=>`<div><div>${jokerArt(j)}</div><b>${j.name}</b><p>${j.desc}</p></div>`).join('')}</div>`
    }
    if(m.type==='card-info'){
      const card=this.findItem(m.uid);if(!card)return ''
      title=`扑克牌详情 · ${card.hidden?'背面朝上':this.itemName(card)}`;cls='bp-card-info-dialog'
      body=`<div class="bp-info"><div class="bp-info-art">${playingCard(card,!!card.hidden)}</div><div>${this.cardDetailsPanel(card)}${m.from==='deck'?button('back-deck','返回完整牌组','bp-quiet'):''}</div></div>`
    }
    if(m.type==='info'){
      const card=this.findItem(m.uid);if(!card)return ''
      const ownedJ=s.jokers.some(j=>j.uid===card.uid),ownedC=s.consumables.some(c=>c.uid===card.uid),hidden=ownedJ&&s.phase==='play'&&s.blind===2&&s.boss==='acorn'&&!s.disabledBoss&&!E.has(s,'chicot')
      title=hidden?'翻面的小丑':this.itemName(card)
      if(card.kind==='pack'){
        const pack=boosterPack(card.id),action=pack.action.includes('加入')?`任选 ${pack.choose} 张加入${pack.family==='joker'?'小丑牌架':'牌组'}。`:`任选 ${pack.choose} 张立即使用。`
        const forSale=!!s?.shop?.packs.some(pack=>pack.uid===card.uid),cost=E.itemCost(s,card)
        cls='bp-pack-info-dialog'
        body=`<div class="bp-pack-info"><div class="bp-pack-info-cover">${this.art(card)}</div><div class="bp-pack-info-copy"><span class="bp-eyebrow">补充包 · ${pack.options} 选 ${pack.choose}</span><h3>${esc(pack.name)}</h3><p class="bp-pack-info-summary">${action}</p><section><b>里面有什么</b><p>本包提供 ${pack.options} 张${pack.content}供选择。${pack.description}</p></section>${forSale?button('buy',`购买补充包 · $${cost}`,'bp-gold',this.busy||!E.canPay(s,cost),`data-uid="${card.uid}"`):''}</div></div>`
      }else{
        const cardDescription=this.itemDesc(card)
        body=`<div class="bp-info"><div class="bp-info-art">${card.kind==='voucher'?`<div class="bp-voucher-art"><b>$10</b></div>`:this.art(card,hidden)}</div><div>${card.kind==='card'?this.cardDetailsPanel(card):`<p>${hidden?'琥珀橡果：本轮无法查看小丑正面。':esc(cardDescription)}</p>`}${(card.eternal||card.perishable||card.rental)&&!hidden?`<p>${card.eternal?'永恒 · 不可出售 / 摧毁 ':''}${card.perishable?'易腐 · 剩余 '+card.perishable+' 轮 ':''}${card.rental?'租赁 · 每轮 $3':''}</p>`:''}${card.edition&&!hidden&&card.kind!=='card'?`<p class="bp-edition-label">${EDITIONS[card.edition]}</p>`:''}${card.kind==='joker'&&!hidden?`<small>${['','普通','罕见','稀有','传奇'][byId(JOKERS,card.id).rarity]}小丑</small>${card.value?`<p>当前累计效果数值：<b>${num(card.value)}</b></p>`:''}${['ancient','castle'].includes(card.id)?`<p>本轮花色：${SUITS[card.suit]}</p>`:''}${['idol','mail'].includes(card.id)?`<p>本轮目标：${card.id==='idol'?SUITS[card.suit]:''}${rankName(card)}</p>`:''}${card.id==='toDo'?`<p>本轮目标：${byId(HANDS,card.hand).name}</p>`:''}`:''}${ownedC?button('use','使用','bp-blue',this.busy,`data-uid="${card.uid}"`):''}${ownedJ?`<div class="bp-reorder">${button('left','← 左移','bp-blue',this.busy||s.jokers[0].uid===card.uid,`data-uid="${card.uid}"`)}${button('right','右移 →','bp-blue',this.busy||s.jokers[s.jokers.length-1].uid===card.uid,`data-uid="${card.uid}"`)}</div>`:''}${ownedJ||ownedC?button('sell',`出售 · $${E.sellValue(card)}`,'bp-red',this.busy||!!card.eternal,`data-uid="${card.uid}"`):''}</div></div>`
      }
    }
    return `<div class="bp-modal-backdrop"><section class="bp-dialog ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="bp-dialog-header"><h2>${title}</h2>${button('close','✕','bp-icon',false,'aria-label="关闭"')}</div><div class="bp-dialog-content">${body}</div></section></div>`
  }
  render(){
    if(this.destroyed)return
    this.updateLayout()
    this.root.innerHTML=(this.state?this.game():this.entry())+this.dialog()+`<div class="bp-effect-notice ${this.effect?'':'bp-effect-hidden'}" data-effect-notice role="status" aria-live="polite">${esc(this.effect)}</div>`+(this.toast?`<div class="bp-toast" role="status">${esc(this.toast)}</div>`:'')+this.packOpeningOverlay()+this.packChoiceOverlay()+this.addedCardsOverlay()
    const phase=this.state?.phase
    this.root.classList.toggle('bp-is-playing',!!this.state);this.root.classList.toggle('bp-is-busy',this.busy);this.root.classList.toggle('bp-fast',this.settings.fast);this.root.classList.toggle('bp-pack-open',!!this.state?.pack);this.root.classList.toggle('bp-intermission',!this.busy&&!!this.state&&['select','reward','won','lost'].includes(phase));this.root.classList.toggle('bp-pack-reveal',this.packFx?.phase==='reveal');this.root.classList.toggle('bp-pack-choice-flight',!!this.packChoiceFx)
    this.positionEffectCards();this.positionPackRevealCards();this.positionPackChoice()
  }
  destroy(){
    this.destroyed=true;this.persist();this.timers.forEach(t=>clearTimeout(t));this.timers.clear();this.audio.destroy()
    if(this.resizeObserver)this.resizeObserver.disconnect()
    if(this.resizeFrame)cancelAnimationFrame(this.resizeFrame)
    window.removeEventListener('resize',this.onResize)
    this.clearJokerDrag(this.jokerDrag);this.jokerDrag=null
    this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('dblclick',this.onDouble);this.root.removeEventListener('pointerdown',this.onPointerDown);document.removeEventListener('pointermove',this.onPointerMove);document.removeEventListener('pointerup',this.onPointerUp);document.removeEventListener('pointercancel',this.onPointerCancel);document.removeEventListener('keydown',this.onKey);document.removeEventListener('visibilitychange',this.onVisibility);document.removeEventListener('fullscreenchange',this.onFull);document.removeEventListener('webkitfullscreenchange',this.onFull)
    if(this.immersive)this.exitFullscreen();if(this.marker.parentNode)this.marker.remove()
  }
}
