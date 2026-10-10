import {HEROES,HERO_BY_THEME_ID,PLAYABLE_HEROES,FACTIONS,ALLIANCES,ALLIANCE_NAMES,CARDS_BY_TYPE,PLANNED_EQUIPMENT,heroForBase,displayText,skillName,skillHelp} from './theme.mjs'
import {SKILLS,ROLES,SUITS,isRed,rankName,makeDeck} from '../../.vuepress/components/sanguo/catalog.mjs'
import {createGame,dispatch,playerView,restoreGame,THEME_VERSION,catalog} from './engine.mjs'
import {chooseAI} from './engine.mjs'
import './style.css'
import './table.css'
import './setup.css'
import './combat.css'
import './draw.css'
import './card-ui.css'
import './toolbar.css'
import {renderToolbar,toolButton} from './toolbar.mjs'
import './mobile-table.css'
import './arena-table.css'
import {tutorialEnabled,targetLinks} from './table-visuals.mjs'
import {createSetup,dispatchSetup,setupView,chooseSetupAI,restoreSession} from './setup.mjs'
import {renderHome,renderSetup,heroGallery} from './setup-ui.mjs'
import {CardVoice,cuesForAction} from './voice.mjs'
import {renderBattle,renderOpponent,renderControls,delayIcons} from './table.mjs'
import {esc,display,portrait,hp,cardFace,scaleCards} from './presentation.mjs'
import {combatContext,damageCues,collateralSelection} from './combat.mjs'
import {layoutHand} from './hand.mjs'
import {advanceUnavailable,DecisionClock} from './flow.mjs'
import {BackgroundMusic} from './music.mjs'
import {drawEffects} from './draw-effects.mjs'

const SAVE='vectorac.fengshen.internal.save.v1',PREFS='vectorac.fengshen.internal.prefs.v1'
const RELEASE=typeof __FENGSHEN_RELEASE__!=='undefined'&&__FENGSHEN_RELEASE__
// 预热牌桌小图：每次操作都会整体重渲染，提前解码并常驻引用，避免 iOS 丢弃解码缓存导致整桌图片重绘闪烁。
const prewarmed=[]
const prewarmTableArt=()=>{if(prewarmed.length||typeof Image==='undefined')return;for(const src of [...HEROES.map(h=>h.thumbnail),...Object.values(CARDS_BY_TYPE).map(c=>c.thumb||c.image),'assets/heavenly-arena.jpg']){const img=new Image();img.decoding='async';img.src=src;prewarmed.push(img)}}
// iOS Safari 横屏：工具栏收起的前提是「文档可滚动」（同斗地主方案）。游戏根节点 fixed 不占文档流，
// 触屏设备上补一块隐形垫层让文档永远可滚；用户上滑即可把导航栏推上去，收起后 visualViewport 触发重测铺满。
let scrollSpacer=null
const syncScrollSpacer=()=>{try{if(!matchMedia('(pointer: coarse)').matches)return}catch{return}document.documentElement.classList.add('fs-scrollable');document.body.classList.add('fs-scrollable');if(!scrollSpacer){scrollSpacer=document.createElement('div');scrollSpacer.className='fs-scroll-spacer';scrollSpacer.setAttribute('aria-hidden','true');document.body.append(scrollSpacer)}scrollSpacer.style.height=(innerHeight+120)+'px'}
const equal=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id))
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
const store=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}}

export class FengshenUI {
  constructor(root) {
    this.root=root;this.state=null;this.setup=null;this.draftHero=null;this.lobby=true;this.selected=[];this.targets=[];this.skill=null;this.as=null;this.modal=null;this.paused=false;this.timer=null;this.toast='';this.destroyed=false
    const preferences=load(PREFS,{pace:650,voice:true});this.hints=tutorialEnabled(preferences);this.pace=preferences.pace;if(![250,650,1100].includes(this.pace))this.pace=650
    this.choiceIndex=null;this.choiceZone='hand';this.hits=[];this.transfer=null;this.draws=[];this.auto=false;this.clock=new DecisionClock();this.music=new BackgroundMusic({enabled:preferences.music!==false});this.voice=new CardVoice({enabled:preferences.voice!==false,onIdle:()=>{if(!this.destroyed)this.schedule()}})
    this.resumeSession=restoreSession(load(SAVE,null));this.resumeState=this.resumeSession?.kind==='game'?this.resumeSession.game:null;root.className='fs-app'
    this.onClick=e=>this.click(e);this.onKey=e=>this.key(e)
    this.onVisibility=()=>{clearTimeout(this.timer);if(document.hidden){this.voice.stop();this.music.pause()}else{if(!this.lobby)this.music.unlock();this.schedule()}this.syncClock()}
    this.onViewport=()=>{const v=window.visualViewport;root.style.setProperty('--fs-height',`${v?.height||innerHeight}px`);root.style.setProperty('--fs-top',`${v?.offsetTop||0}px`);syncScrollSpacer();layoutHand(root);root.querySelector('.fs-hand-card.selected .fs-card-face')?.scrollIntoView({block:'nearest',inline:'nearest'});this.decorateBattle();scaleCards(root)}
    this.onScreen=()=>{if(!document.fullscreenElement)screen.orientation?.unlock?.();this.onViewport();this.render()};document.addEventListener('fullscreenchange',this.onScreen)
    root.addEventListener('click',this.onClick);root.addEventListener('keydown',this.onKey);document.addEventListener('visibilitychange',this.onVisibility);window.addEventListener('resize',this.onViewport);window.visualViewport?.addEventListener('resize',this.onViewport);window.visualViewport?.addEventListener('scroll',this.onViewport)
    this.clockTimer=setInterval(()=>this.tickClock(),250);this.onViewport();this.render();prewarmTableArt()
  }
  reset(){this.selected=[];this.targets=[];this.skill=null;this.as=null;this.choiceIndex=null;this.choiceZone='hand'}
  savePreferences(){store(PREFS,{pace:this.pace,voice:this.voice.enabled,music:this.music.enabled,hints:this.hints})}
  start(){
    if(!this.lobby)return
    this.requestGameScreen();this.clearEffects();this.voice.stop();this.music.unlock();this.auto=false;this.state=null;this.setup=createSetup();this.draftHero=null;this.lobby=false;this.paused=false;this.reset();this.save();this.render()
  }
  save(){if(this.setup)store(SAVE,{kind:'setup',setup:this.setup});else if(this.state)store(SAVE,this.state)}
  resume(){
    const session=restoreSession(load(SAVE,null));if(!session)return
    this.requestGameScreen();this.clearEffects();this.voice.stop();this.music.unlock();this.auto=false;this.setup=session.kind==='setup'?session.setup:null;this.state=session.kind==='game'?advanceUnavailable(session.game,dispatch,playerView):null;this.draftHero=null;this.lobby=false;this.paused=false;this.reset();this.save();this.render()
  }
  actSetup(action){
    if(!this.setup)return false
    const before=this.setup,result=dispatchSetup(before,{...action,revision:before.revision})
    if(!result.ok){this.inform(result.error);return false}
    if(result.game){this.state=result.game;this.setup=null;this.draftHero=null;this.reset();for(const cue of cuesForAction({players:result.game.players,eventId:0},{type:'begin',seat:0},result.game))this.voice.speak(cue.key,cue.sex)}
    else{this.setup=result.setup;if(before.stage!==this.setup.stage||action.type==='pick'&&action.seat===0)this.draftHero=null}
    this.save();this.render();return true
  }
  inform(message){this.toast=displayText(message);clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{this.toast='';if(!this.destroyed)this.render()},2800);this.render()}
  act(action){if(!this.state)return false;const before=this.state,r=dispatch(before,{...action,seat:action.seat??0,revision:before.revision,promptId:before.pending?.id});if(!r.ok){this.inform(r.error);return false}this.state=advanceUnavailable(r.state,dispatch,playerView);for(const cue of cuesForAction(before,action,this.state))this.voice.speak(cue.key,cue.sex);const hits=damageCues(before,this.state);if(hits.length){this.hits=hits.map(h=>({...h,until:Date.now()+900}));for(const h of hits)this.voice.hurt(h.amount);clearTimeout(this.hitTimer);this.hitTimer=setTimeout(()=>{this.hits=[];if(!this.destroyed)this.decorateBattle()},920)}
    if(before.pending?.kind==='take'&&action.type==='choose'){
      const pending=playerView(before,before.pending.actor).pending,option=playerView(before,before.pending.actor).legal.find(a=>a.value===action.value),hidden=option?.hidden||action.value==='hand'
      this.transfer={from:pending.target,to:before.pending.actor,mode:before.pending.mode,card:hidden?null:option?.card,until:Date.now()+1050}
      clearTimeout(this.transferTimer);this.transferTimer=setTimeout(()=>{this.transfer=null;if(!this.destroyed)this.render()},1100)
    }
    const draws=drawEffects(before,this.state)
    if(draws.length){const started=Date.now();this.draws=draws.map(d=>({...d,started}));clearTimeout(this.drawTimer);this.drawTimer=setTimeout(()=>{this.draws=[];if(!this.destroyed)this.render()},1300)}
    this.reset();this.save();this.render();return true}
  clearEffects(){clearTimeout(this.hitTimer);clearTimeout(this.transferTimer);clearTimeout(this.drawTimer);this.hits=[];this.transfer=null;this.draws=[]}
  syncClock(){
    const s=this.state,human=!this.lobby&&!this.setup&&s&&!s.winner&&(s.pending?.actor??s.current)===0&&s.pending?.kind!=='reveal'&&s.players[0].alive
    const key=human?`${s.revision}:${s.pending?.id||s.phase}`:null
    this.clock.sync(key,!!human&&!this.auto&&!this.paused&&!document.hidden&&!this.transfer&&!this.draws.length)
  }
  tickClock(){
    if(this.destroyed)return
    this.syncClock();this.root.querySelectorAll('[data-seconds]').forEach(e=>e.textContent=this.clock.seconds+'s')
    if(this.clock.key&&this.clock.running&&this.clock.left===0&&!this.auto){this.auto=true;this.modal=null;this.reset();this.render();this.inform('思考时间已到，AI 已接手；点“接管”可随时回来')}
  }
  async requestGameScreen(){
    try{if(!document.fullscreenElement)await this.root.requestFullscreen?.({navigationUI:'hide'});await screen.orientation?.lock?.('landscape')}catch{/* iPhone/WebViews may forbid fullscreen or orientation locking. */}
    if(!this.destroyed){this.onViewport();if(innerHeight>innerWidth&&!this.screenNotice){this.screenNotice=true;this.inform('已请求全屏横屏；若未自动旋转，请手动横过手机')}}
  }
  async toggleScreen(){if(document.fullscreenElement){try{await document.exitFullscreen();screen.orientation?.unlock?.()}catch{}}else await this.requestGameScreen();this.render()}
  decorateBattle(){
    if(!this.state||this.lobby||this.setup)return
    const v=playerView(this.state,0),battle=combatContext(v),anchor=seat=>this.root.querySelector(seat===0?'.fs-own-hero>button':`[data-player="${seat}"] .fs-player-main`)
    const ownDelay=this.root.querySelector('.fs-own-delays');if(ownDelay)ownDelay.innerHTML=delayIcons(v.players[0],v)
    this.root.querySelectorAll('[data-combat-role]').forEach(e=>{e.removeAttribute('data-combat-role');e.querySelector('.fs-combat-tag')?.remove()})
    this.root.querySelectorAll('.fs-hurt').forEach(e=>{e.classList.remove('fs-hurt');e.querySelector('.fs-damage-number')?.remove()})
    if(battle&&['attack','command','duel','aoe'].includes(battle.kind))for(const [seat,role]of [[battle.source,'攻击者'],[battle.target,'受击者']]){const e=anchor(seat);if(e)e.dataset.combatRole=role}
    this.root.querySelector('.fs-target-lines')?.remove()
    const links=targetLinks(v,{targets:this.targets,as:this.currentAs(v)}),r=this.root.getBoundingClientRect()
    if(links.length){const layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.classList.add('fs-target-lines');layer.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);layer.setAttribute('aria-hidden','true');const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');layer.append(defs)
      // 光束式指向线（参考英雄杀）：细亮芯+柔光晕，源端亮、目标端渐隐，不再用粗箭头。
      for(const [i,link] of links.entries()){const a=anchor(link.source)?.getBoundingClientRect(),b=anchor(link.target)?.getBoundingClientRect();if(!a||!b)continue;const cx=a.x+a.width/2-r.x,cy=a.y+a.height/2-r.y,bx=b.x+b.width/2-r.x,by=b.y+b.height/2-r.y,length=Math.hypot(bx-cx,by-cy)||1,sa=Math.min(a.width,a.height)*.32,sb=Math.min(b.width,b.height)*.32
        const x=cx+(bx-cx)*sa/length,y=cy+(by-cy)*sa/length,tx=bx-(bx-cx)*sb/length,ty=by-(by-cy)*sb/length,gid=`fs-beam-g${i}`
        const grad=document.createElementNS('http://www.w3.org/2000/svg','linearGradient');grad.id=gid;grad.setAttribute('gradientUnits','userSpaceOnUse');grad.setAttribute('x1',x);grad.setAttribute('y1',y);grad.setAttribute('x2',tx);grad.setAttribute('y2',ty)
        for(const [o,c,op] of [[0,'#fff6cf',.95],[.55,'#ffd77a',.55],[1,'#ffd77a',0]]){const stop=document.createElementNS('http://www.w3.org/2000/svg','stop');stop.setAttribute('offset',o);stop.setAttribute('stop-color',c);stop.setAttribute('stop-opacity',op);grad.append(stop)}defs.append(grad)
        const glow=document.createElementNS('http://www.w3.org/2000/svg','path');glow.setAttribute('d',`M${x} ${y} L${tx} ${ty}`);glow.setAttribute('class','fs-beam-glow')
        const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.dataset.source=link.source;line.dataset.target=link.target;line.setAttribute('d',`M${x} ${y} L${tx} ${ty}`);line.setAttribute('class','fs-beam-core');line.setAttribute('stroke',`url(#${gid})`);layer.append(glow,line)}this.root.append(layer)}
    for(const h of this.hits.filter(h=>h.until>Date.now())){const e=anchor(h.target);if(e){e.classList.add('fs-hurt');const badge=document.createElement('span');badge.className='fs-damage-number';badge.textContent='−'+h.amount;e.append(badge)}}
    this.root.querySelector('.fs-transfer-flight')?.remove()
    if(this.transfer&&this.transfer.until>Date.now()){
      const f=this.transfer,r=this.root.getBoundingClientRect(),a=anchor(f.from)?.getBoundingClientRect(),to=f.mode==='snatch'?anchor(f.to)?.getBoundingClientRect():this.root.querySelector('.fs-table-center,.fs-center-choice')?.getBoundingClientRect()
      if(a&&to){const e=document.createElement('div');e.className='fs-transfer-flight';e.dataset.transferMode=f.mode;e.innerHTML=(f.card?cardFace(f.card):'<span class="fs-card-back"><i>封</i><b>暗手牌</b></span>')+`<span>${f.mode==='snatch'?'取走':'弃置'}</span>`;e.style.setProperty('--from-x',`${a.x+a.width/2-r.x-27}px`);e.style.setProperty('--from-y',`${a.y+a.height/2-r.y-38}px`);e.style.setProperty('--to-x',`${to.x+to.width/2-r.x-27}px`);e.style.setProperty('--to-y',`${to.y+to.height/2-r.y-38}px`);this.root.append(e)}
    }
    this.root.querySelectorAll('.fs-draw-flight,.fs-draw-count').forEach(e=>e.remove())
    this.root.querySelectorAll('.fs-draw-receiver').forEach(e=>e.classList.remove('fs-draw-receiver'))
    const deck=this.root.querySelector('.fs-deck-stack')?.getBoundingClientRect(),bounds=this.root.getBoundingClientRect()
    for(const d of this.draws){
      const receiver=anchor(d.target),to=(d.target===0?this.root.querySelector('.fs-hand'):receiver?.querySelector('.fs-player-info>span:last-child')||receiver)?.getBoundingClientRect()
      if(receiver){receiver.classList.add('fs-draw-receiver');const badge=document.createElement('span');badge.className='fs-draw-count';badge.textContent=`摸牌 +${d.count}`;receiver.append(badge)}
      if(!deck||!to)continue
      for(let i=0;i<d.count;i++){
        const e=document.createElement('div');e.className='fs-draw-flight';e.dataset.drawTarget=d.target;e.dataset.drawIndex=i+1
        e.innerHTML=`<span class="fs-card-back"><i>封</i><b>暗手牌</b><small>摸牌 ${i+1}/${d.count}</small></span>`
        const x=to.x+to.width/2-bounds.x-20+i*12,y=to.y+to.height/2-bounds.y-28
        e.style.setProperty('--from-x',`${deck.x-bounds.x+i*4}px`);e.style.setProperty('--from-y',`${deck.y-bounds.y}px`);e.style.setProperty('--to-x',`${x}px`);e.style.setProperty('--to-y',`${y}px`);e.style.setProperty('--mid-x',`${(deck.x-bounds.x+x)/2}px`);e.style.setProperty('--mid-y',`${(deck.y-bounds.y+y)/2-25}px`);e.style.setProperty('--draw-delay',`${i*140-Math.max(0,Date.now()-(d.started??Date.now()))}ms`);this.root.append(e)
      }
    }
  }
  schedule(){
    clearTimeout(this.timer)
    if(this.destroyed||this.lobby||this.paused||this.modal||document.hidden)return
    if(this.setup){
      const draft=this.setup
      if(draft.stage==='identity'||draft.stage==='ready'){
        const revision=draft.revision,type=draft.stage==='identity'?'reveal':'begin'
        this.timer=setTimeout(()=>{if(this.setup?.revision===revision&&!this.modal&&!this.paused&&!document.hidden)this.actSetup({type,seat:0})},draft.stage==='identity'?1600:800)
        return
      }
      const seat=draft.stage==='lord'&&draft.lord!==0?draft.lord:draft.stage==='others'?draft.roles.findIndex((_,i)=>i!==0&&i!==draft.lord&&!draft.picks[i]):-1
      if(seat<0)return
      const revision=draft.revision
      this.timer=setTimeout(()=>{if(!this.setup||this.setup.revision!==revision||this.modal||this.paused||document.hidden)return;const action=chooseSetupAI(setupView(this.setup,seat));if(action)this.actSetup(action)},this.pace)
      return
    }
    if(!this.state||this.state.winner)return
    if(this.transfer||this.draws.length)return
    if(this.state.pending?.kind==='reveal'){
      const p=this.state.pending,revision=this.state.revision
      this.timer=setTimeout(()=>{if(!this.destroyed&&this.state.revision===revision&&!this.paused&&!document.hidden&&!this.modal)this.act({type:'ack',seat:p.actor})},1800)
      return
    }
    if(this.voice.busy){this.timer=setTimeout(()=>this.schedule(),80);return}
    const seat=this.state.pending?.actor??this.state.current;if(seat===0&&!this.auto)return
    const revision=this.state.revision
    this.timer=setTimeout(()=>{if(this.destroyed||document.hidden||this.modal||this.paused||this.state.revision!==revision)return;const action=chooseAI(playerView(this.state,seat));if(action&&!this.act(action)){this.paused=true;this.inform('AI动作未通过校验，已暂停对局')}},this.pace)
  }
  matching(view){return view.legal.filter(a=>a.type==='play'&&equal(a.ids,this.selected))}
  currentAs(view){const opts=this.matching(view),natural=view.players[0].hand.find(c=>c.id===this.selected[0])?.type;return this.as||opts.find(a=>a.as===natural)?.as||opts[0]?.as}
  targetable(view){
    if(this.skill==='rende'||this.skill==='fanjian')return view.players.filter(p=>p.alive&&p.seat!==0).map(p=>p.seat)
    if(this.skill==='jijiang')return view.legal.filter(a=>a.type==='skill'&&a.skill==='jijiang').map(a=>a.target)
    let opts=this.matching(view).filter(a=>a.as===this.currentAs(view))
    if(this.currentAs(view)==='collateral')return [...new Set(opts.filter(a=>!this.targets.length||a.targets[0]===this.targets[0]).map(a=>a.targets[this.targets.length?1:0]))]
    return [...new Set(opts.filter(a=>this.targets.every(t=>a.targets.includes(t))).flatMap(a=>a.targets))]
  }
  confirm(){
    const view=playerView(this.state,0),pending=view.pending
    if(pending?.actor===0){
      if(pending.kind==='discard')return this.act({type:'discard',ids:this.selected})
      const answer=view.legal.find(a=>a.type==='respond'&&equal(a.ids,this.selected));return answer?this.act(answer):this.inform('请按提示选择可以响应的牌')
    }
    if(this.skill)return this.act({type:'skill',skill:this.skill,ids:this.selected,target:this.targets[0]})
    const as=this.currentAs(view),a=this.matching(view).find(a=>a.as===as&&a.targets.length===this.targets.length&&a.targets.every((t,i)=>as==='collateral'?t===this.targets[i]:this.targets.includes(t)))
    return a?this.act(a):this.inform('先选牌，再点亮目标，最后确认')
  }
  click(event){
    const b=event.target.closest('[data-action]');if(!b||!this.root.contains(b)||b.disabled)return
    const action=b.dataset.action,id=b.dataset.id,value=b.dataset.value
    this.voice.unlock()
    if(!this.lobby&&action!=='music')this.music.unlock()
    if(action==='help'){this.hints=!this.hints;this.savePreferences();this.render();return}
    if(action==='music'){this.music.setEnabled(!this.music.enabled);this.savePreferences();this.render();return}
    if(action==='screen'){this.toggleScreen();return}
    if(action==='auto'){this.auto=!this.auto;this.reset();this.clock.key=null;this.render();return}
    if(action==='voice'){this.voice.setEnabled(!this.voice.enabled);this.savePreferences();this.render();return}
    if(action==='identity'){this.modal={kind:'identity'};this.render();return}
    if(action==='hero'){if(this.setup){const v=setupView(this.setup,0);if(v.candidates.includes(id)&&!v.picked){this.draftHero=id;this.render()}}return}
    if(action==='setup-next'){this.actSetup({type:'reveal',seat:0});return}
    if(action==='draft-pick'){this.actSetup({type:'pick',seat:0,heroId:this.draftHero});return}
    if(action==='setup-begin'){this.actSetup({type:'begin',seat:0});return}
    if(action==='start'){this.start();return}
    if(action==='resume'){this.resume();return}
    if(action==='close'){this.modal=null;this.render();return}
    if(action==='hand'){this.modal={kind:'hand'};this.render();return}
    if(['rules','heroes','gallery','report','hero-detail','card-detail','new'].includes(action)){this.modal={kind:action,id};this.render();return}
    if(action==='new-confirm'){this.clearEffects();this.voice.stop();this.music.pause();this.auto=false;this.resumeSession=restoreSession(load(SAVE,null));this.resumeState=this.resumeSession?.kind==='game'?this.resumeSession.game:null;this.setup=null;this.state=null;this.draftHero=null;this.lobby=true;this.modal=null;this.paused=false;this.reset();this.render();return}
    if(action==='pause'){this.paused=!this.paused;this.render();return}
    if(action==='pace'){this.pace=this.pace===650?250:this.pace===250?1100:650;this.savePreferences();this.render();return}
    if(!this.state||this.paused||this.auto||this.transfer||this.draws.length||this.state.pending?.kind==='reveal'||this.modal&&!(this.modal.kind==='hand'&&action==='card'))return
    const view=playerView(this.state,0),own=view.players[0]
    if(action==='choice-zone'&&view.pending?.kind==='take'&&view.pending.actor===0){this.choiceZone=value;this.render();return}
    if(action==='take-choice'&&view.pending?.kind==='take'&&view.pending.actor===0){const index=Number(value);if(view.legal[index]?.type==='choose'){this.choiceIndex=index;this.render()}return}
    if(action==='choose-confirm'&&view.pending?.kind==='take'&&view.pending.actor===0){const choice=view.legal[this.choiceIndex];if(choice?.type==='choose')this.act(choice);return}
    if(action==='card'){
      const available=view.pending?view.pending.actor===0:view.current===0&&view.phase==='play'
      if(!available){this.modal={kind:'card-detail',id};this.render();return}
      if(this.selected.includes(id))this.selected=this.selected.filter(c=>c!==id)
      else{
        const equipped=Object.values(own.equip).some(c=>c?.id===id)
        if(equipped&&this.skill!=='zhiheng'&&!view.legal.some(a=>a.ids?.includes(id))){this.modal={kind:'card-detail',id};this.render();return}
        const spear=own.equip.weapon?.type==='spear'&&(!view.pending||view.pending.as==='sha'),multi=['zhiheng','rende'].includes(this.skill)||['discard','axe'].includes(view.pending?.kind)
        this.selected=multi?this.selected.concat(id):spear&&this.selected.length<2?this.selected.concat(id):[id]
      }
      this.targets=[];this.as=null;this.render();return
    }
    if(action==='target'){
      const t=Number(value)
      if(!this.targetable(view).includes(t)&&!this.targets.includes(t)){this.modal={kind:'hero-detail',id:display(view.players[t]).id};this.render();return}
      const multi=!this.skill&&this.currentAs(view)==='sha'&&this.matching(view).some(a=>a.targets.length>1)
      if(!this.skill&&this.currentAs(view)==='collateral')this.targets=collateralSelection(this.targets,t)
      else if(this.targets.includes(t))this.targets=this.targets.filter(x=>x!==t)
      else this.targets=multi?this.targets.concat(t):[t]
      this.render();return
    }
    if(action==='skill'){this.reset();this.skill=value;this.render();return}
    if(action==='as'){this.as=value;this.targets=[];this.render();return}
    if(action==='clear'){this.reset();this.render();return}
    if(action==='confirm'){this.confirm();return}
    if(action==='end'){this.act({type:'end'});return}
    if(action==='response'){const a=view.legal[Number(value)];if(a)this.act(a)}
  }
  key(event){
    if(!this.modal)return
    if(event.key==='Escape'){event.preventDefault();this.modal=null;this.render();return}
    if(event.key==='Tab'){
      const controls=[...this.root.querySelectorAll('.fs-modal button:not(:disabled),.fs-modal a[href]')],first=controls[0],last=controls.at(-1)
      if(controls.length&&(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last||!this.root.querySelector('.fs-modal').contains(document.activeElement))){event.preventDefault();(event.shiftKey?last:first).focus()}
    }
  }
  header(){return `<header class="fs-header"><div class="fs-brand">众神<span>斗法</span><small>内部原型 / ${this.lobby?'准备大厅':this.setup?'身份选将':'经典身份'}</small></div>${renderToolbar({lobby:this.lobby,setup:this.setup,paused:this.paused,voice:this.voice.enabled,music:this.music.enabled,fullscreen:!!document.fullscreenElement})}</header>`}
  renderLobby(){return renderHome(this)}
  equipment(p,own=false){return Object.entries(p.equip).filter(([,c])=>c).map(([slot,c])=>`<button class="fs-equip ${this.selected.includes(c.id)?'selected':''}" data-action="${own?'card':'card-detail'}" data-id="${c.id}" aria-label="${{weapon:'武器',armor:'防具',offenseHorse:'进攻坐骑',defenseHorse:'防御坐骑'}[slot]}：${CARDS_BY_TYPE[c.type].name}" title="${esc(displayText(CARDS_BY_TYPE[c.type].help))}"><img src="${CARDS_BY_TYPE[c.type].image}" alt="" loading="lazy"><span>${CARDS_BY_TYPE[c.type].name}</span><small>${CARDS_BY_TYPE[c.type].range?'距'+CARDS_BY_TYPE[c.type].range:CARDS_BY_TYPE[c.type].slot==='offenseHorse'?'−1':CARDS_BY_TYPE[c.type].slot==='defenseHorse'?'+1':'防'}</small></button>`).join('')||'<small class="fs-no-equip">法宝栏为空</small>'}
  skills(p,view){const h=display(p);return Object.keys(h.skillNames).filter(s=>SKILLS[s][2]!=='lord'||p.role==='lord').map(s=>{const active=p.seat===0&&view.legal.some(a=>a.type==='skill'&&a.skill===s);return `<button data-action="${active?'skill':'hero-detail'}" data-value="${s}" data-id="${h.id}" class="fs-skill ${this.skill===s&&p.seat===0?'selected':''}"><b>${h.skillNames[s]}</b><small>${active?'发动':catalog.automaticSkills.includes(s)?'自动':{lord:'主公技',locked:'锁定',convert:'转化',trigger:'触发'}[SKILLS[s][2]]||'技能'}</small></button>`}).join('')}
  opponent(p,view){return renderOpponent(this,p,view)}
  pendingText(view){const p=view.pending;if(!p)return '';const source=p.source==null?'法术':display(view.players[p.source]).name,target=p.target==null?'目标':display(view.players[p.target]).name;return {
    response:combatContext(view)?.hint||`${source} → ${target}：请打出${p.remaining>1?p.remaining+' 张':''}${CARDS_BY_TYPE[p.as]?.name||''}`,
    rescue:`${target}濒死：是否使用仙桃救援？`,counter:`${p.negated?'反制破法':'使用破法'}：${CARDS_BY_TYPE[p.cardType]?.name||''} → ${target}`,
    discard:`弃牌：请选 ${p.count} 张手牌`,guess:`${skillName(view.players[p.actor]?.heroId,'fanjian')}：猜测花色`,pick:'仙山采宝：选择一张牌',take:`选择${target}的一张牌`,axe:'番天印：弃两张牌，令杀命中',blade:'打神鞭：是否再出一张杀？',support:`${p.requester==null?'主公':display(view.players[p.requester]).name}请求${CARDS_BY_TYPE[p.as]?.name||''}援助`,choice:`${SKILLS[p.skill]?skillName(view.players[p.actor]?.heroId,p.skill):displayText({dualsword:'阴阳双剑',dualTarget:'阴阳双剑',ice:'乾坤圈',bow:'五色神光'}[p.skill]||'法宝')}：请选择`,
  }[p.kind]||'等待响应'}
  renderActions(view){return renderControls(this,view)}
  won(){const role=this.state.players[0].role;return role===this.state.winner||role==='loyal'&&this.state.winner==='lord'}
  renderGame(){return renderBattle(this)}
  modalContent(){
    if(!this.modal)return ''
    const {kind,id}=this.modal;let title='',body=''
    if(kind==='heroes'){title='人物图鉴 · 不用于自由选将';body=heroGallery()}
    if(kind==='hand'&&this.state){const v=playerView(this.state,0);title='展开手牌 · '+v.players[0].hand.length+' 张';body=`<p>点击选牌，选中后点“完成选择”回到牌桌确认。这里不会自动出牌。</p><div class="fs-expanded-hand">${v.players[0].hand.map(c=>`<button data-action="card" data-id="${c.id}" class="${this.selected.includes(c.id)?'selected':''}" aria-label="${CARDS_BY_TYPE[c.type].baseName} ${SUITS[c.suit]}${c.rank}" aria-pressed="${this.selected.includes(c.id)}">${cardFace(c)}</button>`).join('')}</div><button data-action="close" class="fs-primary fs-hand-done">完成选择${this.selected.length?' · '+this.selected.length+' 张':''}</button>`}
    if(kind==='identity'&&this.setup){const r=ROLES[setupView(this.setup,0).role];title='你的身份：'+r.name;body=`<h3>${r.name}的胜利条件</h3><p>${r.goal}。</p><p>身份已随机分配且锁定，主公先选将，再由其他玩家选将。</p>`}
    if(kind==='identity'&&this.state){const p=this.state.players[0],r=ROLES[p.role];title='你的身份：'+r.name;body=`<section class="fs-identity-help"><strong class="fs-identity role-${p.role}">${r.name}</strong><h3>你的胜利条件</h3><p>${r.goal}。</p><p>${p.alive?'其他玩家不能看到你的身份，主公除外。':'你已阵亡，身份已公开；仍可在牌桌观看结算。'}</p></section>`}
    if(kind==='hero-detail'){const h=HERO_BY_THEME_ID[id];title=h.name+' · '+h.title;body=`<div class="fs-hero-detail">${portrait(h)}<div><span>${FACTIONS[h.faction]} · ${ALLIANCE_NAMES[ALLIANCES[h.faction]]} · ${h.hp}基础体力 · ${h.sex==='female'?'女性':'男性'}</span><p>${h.playable?'技能已接入，可在单机局使用':'完整技能尚未接入；人物仅供形象与映射评审'}</p></div></div>${Object.entries(h.skillNames).map(([s,n])=>`<section><h3>${n}<small>${SKILLS[s]?{active:'主动',locked:'锁定',lord:'主公技',trigger:'触发',convert:'转化'}[SKILLS[s][2]]||'技能':'待开发'}</small></h3><p>${SKILLS[s]?esc(skillHelp(h,s)):'映射已记录，当前引擎尚无 '+s+' 完整实现。'}</p></section>`).join('')}`}
    if(kind==='card-detail'){const c=makeDeck().find(c=>c.id===id)||makeDeck().find(c=>c.type===id),d=c&&CARDS_BY_TYPE[c.type];title=d?.name||'卡牌';body=d?`<div class="fs-card-detail">${cardFace(c)}<div><b>${{basic:'基本牌',trick:'即时法术',delay:'延时阵法',equip:'法宝'}[d.category]}</b><p>${esc(displayText(d.help))}</p><small>测试基准：${d.baseName} · 共 ${makeDeck().filter(c=>c.type===d.type).length} 张</small></div></div>`:''}
    if(kind==='gallery'){title='法宝与卡牌图鉴';body=`<p>108 张经典牌池 · 53 基本 / 36 锦囊 / 19 装备。仅更换表现层，花色、点数、数量与距离不变。</p><div class="fs-gallery">${Object.values(CARDS_BY_TYPE).map(d=>`<button data-action="card-detail" data-id="${d.type}">${cardFace(makeDeck().find(c=>c.type===d.type))}</button>`).join('')}</div><section><h3>扩展法宝 · 未加入当前牌堆</h3><p>${PLANNED_EQUIPMENT.map(d=>d.name).join('、')}仅已建立映射，原引擎没有这些装备效果，未作为可用牌展示。</p></section>`}
    if(kind==='report'){title=this.state?.winner?'终局 · 身份揭晓':'战场记录';if(this.state){const v=playerView(this.state,0);body=`${v.winner?`<div class="fs-role-reveal">${v.players.map(p=>`<span>${display(p).name}<b>${ROLES[p.role].name}</b></span>`).join('')}</div>`:''}<ol class="fs-report">${v.logs.map(l=>`<li>${esc(displayText(l.text))}</li>`).join('')}</ol>`}}
    if(kind==='new'){title='返回准备大厅？';body='<p>当前牌局或选将进度已保存。你可以继续上次进度，也可以新开身份局重新随机分配身份。</p><button data-action="new-confirm" class="fs-primary">返回准备大厅</button>'}
    if(kind==='rules'){title='众神身份局 · 试玩规则';body=`<section><h3>身份不变</h3>${Object.values(ROLES).map(r=>`<p><b>${r.name}</b>：${r.goal}。</p>`).join('')}<p>当前复用五人引擎：1 主公、1 忠臣、2 反贼、1 内奸。主公额外一点体力；只公开主公，其他角色阵亡或终局才亮身份。八人局与联机尚未接入，不以界面换名冒充完成。</p></section><section><h3>操作与回合</h3><p>主公先行，按席位循环。准备 → 判定 → 摸牌 → 出牌 → 弃牌 → 结束。通常摸两张牌，出牌阶段限一次杀；风火与火尖枪可以解除次数限制。弃牌到当前体力值。</p><p>先选牌，再点亮目标，最后确认出牌。响应时选牌后确认，或主动放弃。两张闪按提示分次打出。混天绫选择两张手牌；借宝诛敌先选持武器者，再选被攻击者。转化牌显示“当杀 / 当闪”，须确认其用途。</p></section><section><h3>主公技与阵营适配</h3><p>青盟：周、尼罗神域；赤盟：商、奥林匹斯；金盟：阐、高天原；玄盟：截、阿斯加德。主公的召集杀、召集闪、救援加成分别只由同盟响应。新角色组合仍在平衡试玩中。</p><p>龙吉公主替代慈航道人对应小乔，保留女性判定语义；阴阳双剑等性别相关装备仍按明确的人物性别结算。</p></section><section><h3>当前完成边界</h3><p>40 人主题图鉴，29 人完整技能可试玩，32 类插画卡牌，108 张物理牌，四名本地 AI。保留的 11 人有独立形象，但技能未完成时禁止开局。AI 只接收玩家视图，不能读取隐藏手牌和身份。</p><p>没有灵蕴、神位积分或封神争榜。不新增法宝冷却与耐久。这是免费的单机试玩版，不代表商业版或完成原创性审核。</p></section>`}
    return `<div class="fs-modal-overlay"><section class="fs-modal" role="dialog" aria-modal="true" aria-labelledby="fs-dialog-title" tabindex="-1"><header><small>众神斗法 / INTERNAL</small><h2 id="fs-dialog-title">${title}</h2><button data-action="close" aria-label="关闭弹窗">×</button></header><div class="fs-modal-body">${body}</div></section></div>`
  }
  render(){
    if(this.destroyed)return
    clearTimeout(this.timer)
    const scrolls=Object.fromEntries([...this.root.querySelectorAll('[data-scroll]')].map(e=>[e.dataset.scroll,{left:e.scrollLeft,top:e.scrollTop}]))
    const wasModal=!!this.root.querySelector('.fs-modal'),prior=document.activeElement
    if(this.modal&&!wasModal)this.returnFocus={action:prior?.dataset?.action,id:prior?.dataset?.id}
    this.syncClock();this.root.classList.toggle('fs-has-pool',this.state?.pending?.kind==='pick'&&this.state.pending.actor===0)
    this.root.classList.toggle('fs-playing',!this.lobby&&!this.setup)
    this.root.innerHTML=(this.lobby?this.renderLobby():this.setup?renderSetup(this):this.renderGame())+this.modalContent()+(this.toast?`<div class="fs-toast" role="status">${esc(this.toast)}</div>`:'')
    this.root.querySelector('.fs-round')?.insertAdjacentHTML('beforeend',toolButton('help','help','教学提示'+(this.hints?'开':'关'),this.hints))
    const round=this.root.querySelector('.fs-round'),deck=this.root.querySelector('.fs-deck-stack')
    if(round&&deck){const phase=round.querySelector(':scope>span');if(phase)phase.textContent='第 '+this.state.turns+' 回合';round.insertBefore(deck,round.querySelector('.fs-clock'))}
    if(this.modal&&!this.lobby&&(this.state||this.setup)){
      const role=this.setup?setupView(this.setup,0).role:this.state.players[0].role
      this.root.querySelector('.fs-modal header>small').textContent+=' · 你的身份：'+ROLES[role].name
      if(this.modal.kind==='hero-detail'&&this.state){
        const p=playerView(this.state,0).players.find(p=>display(p).id===this.modal.id)
        if(p){const info=document.createElement('p');info.className='fs-role-detail';info.textContent=`本局身份：${p.role?ROLES[p.role].name:'隐藏'}${!p.alive?' · 已阵亡，身份已公开':''}`;this.root.querySelector('.fs-modal-body').prepend(info)}
      }
    }
    // Thumbnail cards load cheaply on phones; large/detail portraits use the
    // original optimized art before the browser paints the newly rendered DOM.
    for(const img of this.root.querySelectorAll('.fs-feature>.fs-portrait,.fs-hero-detail>.fs-portrait')){
      const h=HEROES.find(h=>h.thumbnail===img.getAttribute('src'));if(h){img.src=h.image;img.loading='eager'}
    }
    if(RELEASE){const label=this.root.querySelector('.fs-brand>small');if(label)label.textContent=label.textContent.replace('内部原型','单机试玩');if(this.modal?.kind==='rules'){const body=this.root.querySelector('.fs-modal-body');if(body)body.innerHTML=body.innerHTML.replace('此为本机内部原型，不代表商业发行或完成原创性审核。','当前为免费单机试玩版，部分人物技能仍在开发；名称、主题与玩法仍需在商业发行前另行审核。')}}
    layoutHand(this.root)
    for(const [key,v]of Object.entries(scrolls)){const e=this.root.querySelector(`[data-scroll="${key}"]`);if(e){e.scrollLeft=v.left;e.scrollTop=v.top}}
    this.root.querySelector('.fs-hand-card.selected .fs-card-face')?.scrollIntoView({block:'nearest',inline:'nearest'});this.decorateBattle()
    const ownIds=this.draws.flatMap(d=>d.ownIds)
    for(const id of ownIds)this.root.querySelector(`.fs-hand-card[data-id="${id}"]`)?.classList.add('fs-newly-drawn')
    if(ownIds.length)this.root.querySelector(`.fs-hand-card[data-id="${ownIds.at(-1)}"] .fs-card-face`)?.scrollIntoView({block:'nearest',inline:'nearest'})
    if(this.transfer||this.draws.length||this.state?.pending?.kind==='reveal')this.root.querySelector('.fs-dock')?.setAttribute('inert','')
    if(this.modal){this.root.querySelectorAll('.fs-header,.fs-lobby,.fs-entry,.fs-setup,.fs-round,.fs-arena,.fs-status,.fs-dock').forEach(e=>e.inert=true);this.root.querySelector('[data-action="close"]')?.focus()}
    else if(wasModal&&this.returnFocus?.action){const s=`[data-action="${this.returnFocus.action}"]${this.returnFocus.id?`[data-id="${this.returnFocus.id}"]`:''}`;this.root.querySelector(s)?.focus()}
    scaleCards(this.root);this.schedule()
  }
  destroy(){this.destroyed=true;this.voice.destroy();this.music.destroy();this.clearEffects();clearInterval(this.clockTimer);clearTimeout(this.timer);clearTimeout(this.toastTimer);this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('keydown',this.onKey);document.removeEventListener('fullscreenchange',this.onScreen);document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('resize',this.onViewport);window.visualViewport?.removeEventListener('resize',this.onViewport);window.visualViewport?.removeEventListener('scroll',this.onViewport)}
}
window.__fengshenUI=new FengshenUI(document.getElementById('app'))
window.__fengshenTheme={version:THEME_VERSION,heroes:HEROES,cards:CARDS_BY_TYPE}
