import {HEROES,HERO_BY_THEME_ID,PLAYABLE_HEROES,FACTIONS,ALLIANCES,ALLIANCE_NAMES,CARDS_BY_TYPE,PLANNED_EQUIPMENT,heroForBase,displayText,skillName,skillHelp} from './theme.mjs'
import {SKILLS,ROLES,SUITS,isRed,rankName} from './core/catalog.mjs'
import {createGame,dispatch,playerView,restoreGame,THEME_VERSION,catalog} from './engine.mjs'
import {chooseAI} from './engine.mjs'
import './style.css'
import './table.css'
import './setup.css'
import './combat.css'
import './draw.css'
import './card-ui.css'
import './toolbar.css'
import {renderToolbar,renderMenu} from './toolbar.mjs'
import './mobile-table.css'
import './arena-table.css'
import {tutorialEnabled,targetLinks,judgingSeat,counterSelection,counterAction} from './table-visuals.mjs'
import {tableTrail as updateTableTrail,counterTrail} from './table-trail.mjs'
import {createSetup,dispatchSetup,setupView,chooseSetupAI,restoreSession,MODE_LIST,modeById} from './setup.mjs'
import {renderHome,renderSetup,heroGallery} from './setup-ui.mjs'
import {CardVoice,cuesForAction} from './voice.mjs'
import {renderBattle,renderOpponent,renderControls,stateMarkers} from './table.mjs'
import {esc,display,portrait,hp,cardFace,effectiveCard,scaleCards,equipmentSlot} from './presentation.mjs'
import {combatContext,damageCues,collateralSelection} from './combat.mjs'
import {layoutHand} from './hand.mjs'
import {layoutArena,revealHandCard} from './arena-layout.mjs'
import {bindGameViewport} from './viewport.mjs'
import {localPoint} from './screen-mode.mjs'
import {cardTargetCandidates,selectingTargets,replaceTarget,boundedTargets} from './target-selection.mjs'
import {heroDetails,gameRules,formCollection}from './player-guide.mjs'
import {modalReturnEntry}from './modal-navigation.mjs'
import {takeSelection}from './take-selection.mjs'
import {panelSelection,panelAction,harvestSeat,cleanRoleMarks,nextRoleMark} from './panel-selection.mjs'
import {extensionTargets,extensionAction} from './extension-actions.mjs'
import {extensionPopup,extensionPrompt} from './extension-table.mjs'
import {bindStarDrag} from './star-drag.mjs'
import {advanceUnavailable,DecisionClock} from './flow.mjs'
import {BackgroundMusic} from './music.mjs'
import {drawEffects,judgmentEffects,harvestEffects,yijiEffects,transferEffects} from './draw-effects.mjs'

// Keep the old mixed-playtest save intact; never reinterpret its hero rules.
const SAVE='vectorac.fengshen.classic-original.save.v2',PREFS='vectorac.fengshen.internal.prefs.v1'
const RELEASE=typeof __FENGSHEN_RELEASE__!=='undefined'&&__FENGSHEN_RELEASE__
// 预热牌桌小图：每次操作都会整体重渲染，提前解码并常驻引用，避免 iOS 丢弃解码缓存导致整桌图片重绘闪烁。
// 分批+错峰：牌桌背景优先（进对局即用），缩略图队列等首页主视觉下载完再启动，
// 避免 90 余张小图与大厅孙悟空原图抢带宽导致首屏迟迟不渲染。
const prewarmed=[]
const prewarmTableArt=()=>{
  if(prewarmed.length||typeof Image==='undefined')return
  const queue=[...HEROES.map(h=>h.thumbnail),...Object.values(CARDS_BY_TYPE).map(c=>c.thumb||c.image),'assets/heavenly-arena.jpg']
  let i=0
  const step=()=>{for(let n=0;n<6&&i<queue.length;n++,i++){const img=new Image();img.decoding='async';img.src=queue[i];prewarmed.push(img)}if(i<queue.length)setTimeout(step,120)}
  if(document.readyState==='complete')setTimeout(step,1200)
  else addEventListener('load',()=>setTimeout(step,600),{once:true})
}
// 增量修补（morph）：按位对齐新旧子树，只更新变化的节点与属性，保留未变化
// 节点的元素身份——img 不销毁重解码、滚动位置与 CSS 动画不中断。此前每次
// 操作都 innerHTML 整体替换，iOS 上整棵子树销毁后分帧重绘，表现为一选牌全桌闪。
const patchAttrs=(a,b)=>{for(const name of a.getAttributeNames())if(!b.hasAttribute(name))a.removeAttribute(name);for(const {name,value}of b.attributes)if(a.getAttribute(name)!==value)a.setAttribute(name,value)}
const patchNode=(a,b)=>{if(a.nodeType!==b.nodeType||a.nodeType===1&&a.tagName!==b.tagName){a.replaceWith(b);return}if(a.nodeType===3){if(a.data!==b.data)a.data=b.data;return}if(a.nodeType!==1)return;patchAttrs(a,b);patchChildren(a,b)}
const patchChildren=(a,b)=>{const an=[...a.childNodes],bn=[...b.childNodes];for(let i=0;i<bn.length;i++)an[i]?patchNode(an[i],bn[i]):a.append(bn[i]);for(let i=bn.length;i<an.length;i++)an[i].remove()}
const morph=(host,html)=>{if(!host.firstChild){host.innerHTML=html;return}const tpl=document.createElement('template');tpl.innerHTML=html;patchChildren(host,tpl.content)}
const equal=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id))
const isRevealing=s=>s?.pending?.kind==='reveal'||s?.pending?.kind==='ext'&&s.pending.stage==='reveal'
const sampleCard=type=>catalog.makeDeck().find(c=>c.type===type)||{type,virtual:true}
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
const store=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}}

export class FengshenUI {
  constructor(root) {
    this.root=root;this.state=null;this.setup=null;this.draftHero=null;this.lobby=true;this.selected=[];this.targets=[];this.skill=null;this.as=null;this.modal=null;this.paused=false;this.timer=null;this.toast='';this.destroyed=false
    const preferences=load(PREFS,{pace:650,voice:true});this.hints=tutorialEnabled(preferences);this.pace=preferences.pace;if(![250,650,1100].includes(this.pace))this.pace=650
    this.mode=MODE_LIST.some(m=>m.id===preferences.mode)?preferences.mode:'identity5'
    this.modalStack=[];this.choiceIndex=null;this.choiceZone='hand';this.hits=[];this.transfer=null;this.draws=[];this.auto=false;this.clock=new DecisionClock();this.music=new BackgroundMusic({enabled:preferences.music!==false});this.voice=new CardVoice({enabled:preferences.voice!==false,onIdle:()=>{if(!this.destroyed)this.schedule()}})
    this.resumeSession=restoreSession(load(SAVE,null));this.resumeState=this.resumeSession?.kind==='game'?this.resumeSession.game:null;this.legacySave=load('vectorac.fengshen.internal.save.v1',null)!=null;root.className='fs-app'
    this.onClick=e=>this.click(e);this.onKey=e=>this.key(e)
    this.moves=[]
    this.onVisibility=()=>{clearTimeout(this.timer);if(document.hidden){this.voice.stop();this.music.pause()}else{if(this.transfer?.until<Date.now())this.transfer=null;if(this.draws?.every(d=>(d.started||0)+1300<Date.now()))this.draws=[];if(this.moves?.every(m=>m.until<Date.now()))this.moves=[];if(!this.lobby)this.music.unlock();this.schedule()}this.syncClock()}
    this.onViewport=()=>{layoutArena(root);layoutHand(root);if(this.selected.length)revealHandCard(root,this.selected.at(-1));this.decorateBattle();scaleCards(root)}
    this.viewport=bindGameViewport(root,this.onViewport)
    this.starGesture=bindStarDrag(root,{getState:()=>this.state?.pending?.kind==='guanxing'?this.star:null,onMove:state=>{this.star=state;this.render()},onInteraction:active=>{this.draggingStars=active;this.syncClock()}})
    this.onScreen=()=>{if(!document.fullscreenElement)screen.orientation?.unlock?.();this.onViewport();this.render()};document.addEventListener('fullscreenchange',this.onScreen)
    root.addEventListener('click',this.onClick);root.addEventListener('keydown',this.onKey);document.addEventListener('visibilitychange',this.onVisibility);
    this.clockTimer=setInterval(()=>this.tickClock(),250);this.onViewport();this.render();prewarmTableArt()
  }
  reset(){this.selected=[];this.targets=[];this.skill=null;this.as=null;this.guhuoMode=false;this.extValue=null;this.choiceIndex=null;this.choiceSelection=null;this.panelSelection=null;this.choiceZone='hand';this.star=null}
  savePreferences(){store(PREFS,{pace:this.pace,voice:this.voice.enabled,music:this.music.enabled,hints:this.hints,mode:this.mode})}
  start(){
    if(!this.lobby)return
    this.requestGameScreen();this.clearEffects();this.voice.stop();this.music.unlock();this.auto=false;this.state=null;this.setup=createSetup({mode:this.mode});this.draftHero=null;this.lobby=false;this.paused=false;this.reset();this.save();this.render()
  }
  save(){if(this.setup)store(SAVE,{kind:'setup',setup:this.setup});else if(this.state){this.roleMarks=cleanRoleMarks(playerView(this.state,0),this.roleMarks);store(SAVE,{kind:'game',game:this.state,roleMarks:this.roleMarks})}}
  resume(){
    const raw=load(SAVE,null),session=restoreSession(raw);if(!session)return
    this.roleMarks=session.kind==='game'?cleanRoleMarks(playerView(session.game,0),raw?.roleMarks):{}
    this.requestGameScreen();this.clearEffects();this.voice.stop();this.music.unlock();this.auto=false;this.setup=session.kind==='setup'?session.setup:null;this.state=session.kind==='game'?advanceUnavailable(session.game,dispatch,playerView):null;this.draftHero=null;this.lobby=false;this.paused=false;this.reset();this.save();this.render()
  }
  actSetup(action){
    if(!this.setup)return false
    const before=this.setup,result=dispatchSetup(before,{...action,revision:before.revision})
    if(!result.ok){this.inform(result.error);return false}
    if(result.game){this.state=result.game;this.roleMarks={};this.setup=null;this.draftHero=null;this.reset();for(const cue of cuesForAction({players:result.game.players,eventId:0},{type:'begin',seat:0},result.game))this.voice.speak(cue.key,cue.sex)}
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
    if(before.pending?.kind==='counter'&&action.type==='respond'){this.tableTrail=counterTrail(this.tableTrail||[],playerView(before,0));if(action.seat==null||action.seat===0){this.counterLockUntil=Date.now()+700;clearTimeout(this.counterLockTimer);this.counterLockTimer=setTimeout(()=>{if(!this.destroyed)this.render()},720)}}
    const judged=judgmentEffects(before,this.state).at(-1)
    if(judged){this.transfer={from:judged.target,to:judged.target,mode:'judgment',card:judged.card,until:Date.now()+1050};clearTimeout(this.transferTimer);this.transferTimer=setTimeout(()=>{this.transfer=null;if(!this.destroyed)this.render()},1100)}
    const picked=harvestEffects(before,this.state).at(-1)
    if(picked){const r=this.root.querySelector(`[data-pool-card="${picked.card.id}"]`)?.getBoundingClientRect(),origin=r&&localPoint(this.root,r.x+r.width/2,r.y+r.height/2);this.transfer={from:picked.target,to:picked.target,mode:'harvest',card:picked.card,origin,until:Date.now()+1050};clearTimeout(this.transferTimer);this.transferTimer=setTimeout(()=>{this.transfer=null;if(!this.destroyed)this.render()},1100)}
    const gifted=yijiEffects(before,this.state).at(-1)
    if(gifted){const r=(this.root.querySelector(`[data-yiji-card="${gifted.cards.at(-1)}"]`)||this.root.querySelector('.fs-yiji-choice'))?.getBoundingClientRect(),origin=r&&localPoint(this.root,r.x+r.width/2,r.y+r.height/2);this.transfer={from:gifted.seat,to:gifted.target,mode:'yiji',card:null,count:gifted.count,origin,until:Date.now()+1050};clearTimeout(this.transferTimer);this.transferTimer=setTimeout(()=>{this.transfer=null;if(!this.destroyed)this.render()},1100)}
    const draws=drawEffects(before,this.state)
    if(draws.length){const started=Date.now();this.draws=draws.map(d=>({...d,started}));clearTimeout(this.drawTimer);this.drawTimer=setTimeout(()=>{this.draws=[];if(!this.destroyed)this.render()},1300)}
    const moves=transferEffects(before,this.state)
    if(moves.length){const started=Date.now();this.moves=moves.map(m=>({...m,started,until:started+1200}));clearTimeout(this.moveTimer);this.moveTimer=setTimeout(()=>{this.moves=[];if(!this.destroyed)this.render()},1250)}
    const previousIds=new Set(before.players[0].hand.map(c=>c.id)),received=this.state.players[0].hand.filter(c=>!previousIds.has(c.id))
    this.handRevealId=received.at(-1)?.id||null
    this.reset();this.save();this.render();return true}
  clearEffects(){clearTimeout(this.hitTimer);clearTimeout(this.transferTimer);clearTimeout(this.drawTimer);clearTimeout(this.moveTimer);clearTimeout(this.counterLockTimer);this.hits=[];this.transfer=null;this.draws=[];this.moves=[];this.tableTrail=[];this.counterKey=null;this.counterLockUntil=0}
  syncClock(){
    const s=this.state,human=!this.lobby&&!this.setup&&s&&!s.winner&&(s.pending?.actor??s.current)===0&&!isRevealing(s)&&(s.players[0].alive||s.pending?.kind==='ext'&&s.pending.skill==='zhuiyi')
    const key=human?`${s.revision}:${s.pending?.id||s.phase}`:null
    this.clock.sync(key,!!human&&!this.draggingStars&&!this.auto&&!this.paused&&!document.hidden&&!this.transfer&&!this.draws.length&&!this.moves.length)
  }
  tickClock(){
    if(this.destroyed)return
    this.syncClock();this.root.querySelectorAll('[data-seconds]').forEach(e=>e.textContent=this.clock.seconds+'s')
    if(this.clock.key&&this.clock.running&&this.clock.left===0&&!this.auto){this.auto=true;this.modal=null;this.reset();this.render();this.inform('思考时间已到，AI 已接手；点“接管”可随时回来')}
  }
  async requestGameScreen(){
    this.viewport.setImmersive(true)
    // 全屏默认开启；只有手机竖屏的虚拟横屏才锁横屏，平板等大屏保持原方向不旋转。
    const landscape=this.root.classList.contains('fs-force-landscape')
    try{const req=this.root.requestFullscreen||this.root.webkitRequestFullscreen;if(!document.fullscreenElement&&!document.webkitFullscreenElement)await req?.call(this.root,{navigationUI:'hide'});if(landscape)await screen.orientation?.lock?.('landscape')}catch{/* CSS landscape remains active when native APIs are unavailable. */}
    this.viewport.recover()
    if(!this.destroyed){this.onViewport();if(landscape&&innerHeight>innerWidth&&!this.screenNotice){this.screenNotice=true;this.inform('已进入横屏画面；Safari工具栏仍在时，可在牌桌空白处上滑收起')}}
  }
  decorateBattle(){
    if(!this.state||this.lobby||this.setup)return
    const v=playerView(this.state,0),battle=combatContext(v),anchor=seat=>this.root.querySelector(seat===0?'.fs-own-hero>button':`[data-player="${seat}"] .fs-player-main`)
    this.root.querySelectorAll('[data-combat-role]').forEach(e=>{e.removeAttribute('data-combat-role');e.querySelector('.fs-combat-tag')?.remove()})
    this.root.querySelectorAll('.fs-hurt').forEach(e=>{e.classList.remove('fs-hurt');e.querySelector('.fs-damage-number')?.remove()})
    const counterBlade=v.pending?.kind==='counter'&&v.pending.cardType==='collateral'&&v.pending.victim!=null?v.pending:null
    // 借刀三角（借刀者/持刀者/指定被杀）在无懈询问与持刀者响应两个阶段都全程标注。
    const roles=counterBlade?[[counterBlade.source,'借刀者'],[counterBlade.target,'持刀者'],[counterBlade.victim,'指定被杀']]:battle?.kind==='command'?[[battle.commandedBy,'借刀者'],[battle.source,'持刀者'],[battle.target,'指定被杀']]:battle&&['attack','duel','aoe'].includes(battle.kind)?[[battle.source,'攻击者'],[battle.target,'受击者']]:[]
    for(const [seat,role]of roles){const e=anchor(seat);if(e){e.dataset.combatRole=role;const tag=document.createElement('span');tag.className='fs-combat-tag';tag.textContent=role;e.append(tag)}}
    this.root.querySelector('.fs-target-lines')?.remove()
    const links=targetLinks(v,{targets:this.targets,as:this.currentAs(v)}),r=this.root.getBoundingClientRect()
    this.root.querySelectorAll('.fs-judging,.fs-effect-source,.fs-effect-target,.fs-effect-focus,.fs-pick-focus,.fs-replace-focus,.fs-responding').forEach(e=>e.classList.remove('fs-judging','fs-effect-source','fs-effect-target','fs-effect-focus','fs-pick-focus','fs-replace-focus','fs-responding'))
    const judge=judgingSeat(v);if(judge!=null)anchor(judge)?.classList.add('fs-judging')
    // 轮候响应者黄色脉冲圈：飞剑/万妖/杀/决斗/借刀轮到谁出杀闪，动画提示不靠文字。
    if(battle&&['attack','command','duel','aoe'].includes(battle.kind)&&['response','support'].includes(v.pending?.kind))anchor(v.pending.actor)?.classList.add('fs-responding')
    for(const link of links){anchor(link.source)?.classList.add('fs-effect-source');anchor(link.target)?.classList.add('fs-effect-target')}
    if(v.pending?.kind==='counter')anchor(v.pending.target)?.classList.add('fs-effect-focus')
    const picker=this.transfer?.mode==='harvest'?this.transfer.to:harvestSeat(v);if(picker!=null)anchor(picker)?.classList.add('fs-pick-focus')
    if(v.pending?.kind==='judge-replace')anchor(v.pending.actor)?.classList.add('fs-replace-focus')
    for(const p of v.players){const e=anchor(p.seat);e?.classList.toggle('fs-flipped',p.faceDown);if(p.seat===0){e?.querySelector('.fs-face-down')?.remove();if(e&&p.faceDown){const tag=document.createElement('span');tag.className='fs-face-down';tag.textContent='翻面 · 下回合休整';e.append(tag)}}}
    this.root.querySelectorAll('.fs-extension-actor').forEach(e=>e.classList.remove('fs-extension-actor'))
    if(v.pending?.kind==='ext'&&v.extension.stage!=='reveal')anchor(v.pending.actor)?.classList.add('fs-extension-actor')
    const ownAnchor=anchor(0);ownAnchor?.querySelector('.fs-state-marks')?.remove();ownAnchor?.insertAdjacentHTML('beforeend',stateMarkers(v.players[0]))
    if(links.length){const layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.classList.add('fs-target-lines');layer.setAttribute('viewBox',`0 0 ${this.root.clientWidth} ${this.root.clientHeight}`);layer.setAttribute('aria-hidden','true');const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');layer.append(defs)
      // 光束式指向线（参考英雄杀）：细亮芯+柔光晕，源端亮、目标端渐隐，不再用粗箭头。
      for(const [i,link] of links.entries()){const a=anchor(link.source)?.getBoundingClientRect(),b=anchor(link.target)?.getBoundingClientRect();if(!a||!b)continue;const ap=localPoint(this.root,a.x+a.width/2,a.y+a.height/2),bp=localPoint(this.root,b.x+b.width/2,b.y+b.height/2),cx=ap.x,cy=ap.y,bx=bp.x,by=bp.y,length=Math.hypot(bx-cx,by-cy)||1,sa=Math.min(a.width,a.height)*.32,sb=Math.min(b.width,b.height)*.32
        const x=cx+(bx-cx)*sa/length,y=cy+(by-cy)*sa/length,tx=bx-(bx-cx)*sb/length,ty=by-(by-cy)*sb/length,gid=`fs-beam-g${i}`
        const grad=document.createElementNS('http://www.w3.org/2000/svg','linearGradient');grad.id=gid;grad.setAttribute('gradientUnits','userSpaceOnUse');grad.setAttribute('x1',x);grad.setAttribute('y1',y);grad.setAttribute('x2',tx);grad.setAttribute('y2',ty)
        for(const [o,c,op] of [[0,'#fff6cf',1],[.55,'#ffd77a',.9],[1,'#ffe99e',.8]]){const stop=document.createElementNS('http://www.w3.org/2000/svg','stop');stop.setAttribute('offset',o);stop.setAttribute('stop-color',c);stop.setAttribute('stop-opacity',op);grad.append(stop)}defs.append(grad)
        const glow=document.createElementNS('http://www.w3.org/2000/svg','path');glow.setAttribute('d',`M${x} ${y} L${tx} ${ty}`);glow.setAttribute('class','fs-beam-glow')
        const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.dataset.source=link.source;line.dataset.target=link.target;line.setAttribute('d',`M${x} ${y} L${tx} ${ty}`);line.setAttribute('class','fs-beam-core');line.setAttribute('stroke',`url(#${gid})`);layer.append(glow,line)}this.root.append(layer)}
    for(const h of this.hits.filter(h=>h.until>Date.now())){const e=anchor(h.target);if(e){e.classList.add('fs-hurt');const badge=document.createElement('span');badge.className='fs-damage-number';badge.textContent='−'+h.amount;e.append(badge)}}
    this.root.querySelector('.fs-transfer-flight')?.remove()
    if(this.transfer&&this.transfer.until>Date.now()){
      const f=this.transfer,a=(f.mode==='harvest'?this.root.querySelector(`[data-pool-card="${f.card.id}"]`)||this.root.querySelector('.fs-pool-choice'):f.mode==='judgment'?this.root.querySelector(`[data-judge-card="${f.card.id}"]`)||this.root.querySelector('.fs-table-center'):anchor(f.from))?.getBoundingClientRect(),to=(['judgment','harvest','yiji'].includes(f.mode)?(f.to===0?this.root.querySelector('.fs-hand'):anchor(f.to)):f.mode==='snatch'?anchor(f.to):this.root.querySelector('.fs-table-center,.fs-center-choice'))?.getBoundingClientRect()
      if((a||f.origin)&&to){const ap=f.origin||localPoint(this.root,a.x+a.width/2,a.y+a.height/2),tp=localPoint(this.root,to.x+to.width/2,to.y+to.height/2);const e=document.createElement('div');e.className='fs-transfer-flight';e.dataset.transferMode=f.mode;e.innerHTML=(f.card?cardFace(f.card):'<span class="fs-card-back"><i>封</i><b>暗手牌</b></span>')+(['judgment','harvest'].includes(f.mode)?'':`<span>${f.mode==='yiji'?`赠予${f.count>1?'×'+f.count:''}`:f.mode==='snatch'?'取走':'弃置'}</span>`);e.style.setProperty('--from-x',`${ap.x-27}px`);e.style.setProperty('--from-y',`${ap.y-38}px`);e.style.setProperty('--to-x',`${tp.x-27}px`);e.style.setProperty('--to-y',`${tp.y-38}px`);this.root.append(e)}
    }
    this.root.querySelectorAll('.fs-draw-flight,.fs-draw-count').forEach(e=>e.remove())
    this.root.querySelectorAll('.fs-move-flight,.fs-move-count').forEach(e=>e.remove())
    for(const m of this.moves.filter(m=>m.until>Date.now())){
      const from=(m.origin==='table'?this.root.querySelector('.fs-table-center,.fs-center-choice'):anchor(m.from))?.getBoundingClientRect(),to=(m.to===0?this.root.querySelector('.fs-hand'):anchor(m.to))?.getBoundingClientRect();if(!from||!to)continue
      const a=localPoint(this.root,from.x+from.width/2,from.y+from.height/2),b=localPoint(this.root,to.x+to.width/2,to.y+to.height/2),receiver=anchor(m.to)
      if(receiver){const tag=document.createElement('span');tag.className='fs-move-count';tag.textContent='得牌 +'+m.count;receiver.append(tag)}
      for(let i=0;i<Math.min(4,m.count);i++){const f=document.createElement('div');f.className='fs-move-flight';f.dataset.moveTarget=m.to;f.innerHTML=m.cards?.[i]?cardFace(m.cards[i]):'<span class="fs-card-back"><i>封</i><b>手牌</b></span>';f.style.setProperty('--from-x',(a.x-27+i*4)+'px');f.style.setProperty('--from-y',(a.y-39)+'px');f.style.setProperty('--to-x',(b.x-27+i*4)+'px');f.style.setProperty('--to-y',(b.y-39)+'px');f.style.animationDelay=(i*65-Math.max(0,Date.now()-m.started))+'ms';this.root.append(f)}
    }
    this.root.querySelectorAll('.fs-draw-receiver').forEach(e=>e.classList.remove('fs-draw-receiver'))
    const deck=this.root.querySelector('.fs-deck-stack')?.getBoundingClientRect(),deckPoint=deck&&localPoint(this.root,deck.x,deck.y)
    for(const d of this.draws){
      const receiver=anchor(d.target),to=(d.target===0?this.root.querySelector('.fs-hand'):receiver?.querySelector('.fs-player-info>span:last-child')||receiver)?.getBoundingClientRect()
      if(receiver){receiver.classList.add('fs-draw-receiver');const badge=document.createElement('span');badge.className='fs-draw-count';badge.textContent=`摸牌 +${d.count}`;receiver.append(badge)}
      if(!deck||!to)continue
      for(let i=0;i<d.count;i++){
        const e=document.createElement('div');e.className='fs-draw-flight';e.dataset.drawTarget=d.target;e.dataset.drawIndex=i+1
        e.innerHTML=`<span class="fs-card-back"><i>封</i><b>暗手牌</b><small>摸牌 ${i+1}/${d.count}</small></span>`
        const tp=localPoint(this.root,to.x+to.width/2,to.y+to.height/2),x=tp.x-20+i*12,y=tp.y-28
        e.style.setProperty('--from-x',`${deckPoint.x+i*4}px`);e.style.setProperty('--from-y',`${deckPoint.y}px`);e.style.setProperty('--to-x',`${x}px`);e.style.setProperty('--to-y',`${y}px`);e.style.setProperty('--mid-x',`${(deckPoint.x+x)/2}px`);e.style.setProperty('--mid-y',`${(deckPoint.y+y)/2-25}px`);e.style.setProperty('--draw-delay',`${i*140-Math.max(0,Date.now()-(d.started??Date.now()))}ms`);this.root.append(e)
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
        // 对抗局选完将后先播掷骰动画再开局，故 ready 停顿更久。
        const delay=draft.stage==='identity'?1600:draft.sides?2400:800
        this.timer=setTimeout(()=>{if(this.setup?.revision===revision&&!this.modal&&!this.paused&&!document.hidden)this.actSetup({type,seat:0})},delay)
        return
      }
      // 对抗局全员同时选将：AI 替所有非本地席位选将；身份局按主公→其余顺序。
      const seat=draft.sides
        ?draft.roles.findIndex((_,i)=>i!==0&&!draft.picks[i])
        :draft.stage==='lord'&&draft.lord!==0?draft.lord:draft.stage==='others'?draft.roles.findIndex((_,i)=>i!==0&&i!==draft.lord&&!draft.picks[i]):-1
      if(seat<0)return
      const revision=draft.revision
      this.timer=setTimeout(()=>{if(!this.setup||this.setup.revision!==revision||this.modal||this.paused||document.hidden)return;const action=chooseSetupAI(setupView(this.setup,seat));if(action)this.actSetup(action)},this.pace)
      return
    }
    if(!this.state||this.state.winner)return
    if(this.transfer||this.draws.length||this.moves.length)return
    if(isRevealing(this.state)){
      const p=this.state.pending,revision=this.state.revision
      this.timer=setTimeout(()=>{if(!this.destroyed&&this.state.revision===revision&&!this.paused&&!document.hidden&&!this.modal)this.act(p.kind==='reveal'?{type:'ack',seat:p.actor}:{type:'invoke',value:'ack',seat:p.actor})},1800)
      return
    }
    if(this.voice.busy){this.timer=setTimeout(()=>this.schedule(),80);return}
    const seat=this.state.pending?.actor??this.state.current;if(seat===0&&!this.auto)return
    const revision=this.state.revision
    this.timer=setTimeout(()=>{if(this.destroyed||document.hidden||this.modal||this.paused||this.state.revision!==revision)return;const action=chooseAI(playerView(this.state,seat));if(action&&!this.act(action)){this.paused=true;this.inform('AI动作未通过校验，已暂停对局')}},this.pace)
  }
  matching(view){return view.legal.filter(a=>a.type==='play'&&equal(a.ids,this.selected))}
  openModal(kind,id){const e=document.activeElement,back=modalReturnEntry(this.modal,kind,{scroll:this.root.querySelector('.fs-modal-body')?.scrollTop||0,focus:e?.dataset?.id});if(back)this.modalStack.push(back);else this.modalStack=[];this.modal={kind,id};this.render()}
  closeModal(){const back=this.modalStack.pop();this.modal=back?.modal||null;this.render();if(back){const body=this.root.querySelector('.fs-modal-body');if(body)body.scrollTop=back.scroll;this.root.querySelector(`[data-id="${back.focus}"]`)?.focus({preventScroll:true})}}
  currentAs(view){const opts=this.matching(view),natural=view.players[0].hand.find(c=>c.id===this.selected[0])?.type;return this.as||opts.find(a=>a.as===natural)?.as||opts[0]?.as}
  targetable(view){
    const extra=extensionTargets(view,this);if(extra)return extra
    if(view.pending?.kind==='shensu'&&view.pending.actor===0)return [...new Set(view.legal.filter(a=>a.type==='rush'&&equal(a.ids,this.selected)).map(a=>a.target))]
    if(this.skill==='qiangxi')return [...new Set(view.legal.filter(a=>a.type==='skill'&&a.skill==='qiangxi'&&equal(a.ids,this.selected)).map(a=>a.target))]
    if(view.pending?.kind==='liuli'&&view.pending.actor===0)return [...new Set(view.legal.filter(a=>a.type==='redirect'&&equal(a.ids,this.selected)).map(a=>a.target))]
    if(view.pending?.kind==='yiji'&&view.pending.actor===0)return [...new Set(view.legal.filter(a=>a.type==='give').map(a=>a.target))]
    if(view.pending?.kind==='tuxi'&&view.pending.actor===0)return [...new Set(view.legal.flatMap(a=>a.targets||[]))]
    if(this.skill==='rende'||this.skill==='fanjian')return view.players.filter(p=>p.alive&&p.seat!==0).map(p=>p.seat)
    if(this.skill==='jieyin')return view.players.filter(p=>p.alive&&p.seat!==0&&display(p).sex==='male'&&p.hp<p.maxHp).map(p=>p.seat)
    if(this.skill==='qingnang')return view.players.filter(p=>p.alive&&p.hp<p.maxHp).map(p=>p.seat)
    if(this.skill==='lijian')return view.players.filter(p=>p.alive&&p.seat!==0&&display(p).sex==='male'&&(!this.targets.length||p.seat===this.targets[0]||!((p.effectiveSkills||catalog.HERO_BY_ID[p.heroId].skills).includes('kongcheng')&&!p.handCount))).map(p=>p.seat)
    if(this.skill==='jijiang')return view.legal.filter(a=>a.type==='skill'&&a.skill==='jijiang').map(a=>a.target)
    let opts=this.matching(view).filter(a=>a.as===this.currentAs(view))
    return cardTargetCandidates(opts,this.currentAs(view),this.targets)
  }
  confirm(){
    const view=playerView(this.state,0),pending=view.pending
    if(pending?.actor===0){
      if(pending.kind==='ext'){const answer=extensionPopup(view)?panelAction(view,this.panelSelection):extensionAction(view,this);return answer?this.act(answer):false}
      if(pending.kind==='shensu'){const a=view.legal.find(a=>a.type==='rush'&&a.target===this.targets[0]&&equal(a.ids,this.selected));return a?this.act(a):this.inform('选择合法目标；第二次疾行还需要一张装备牌')}
      if(['incarnation','pick'].includes(pending.kind)){const answer=panelAction(view,this.panelSelection);return answer?this.act(answer):false}
      if(pending.kind==='counter'){const answer=counterAction(view,this.selected,{blockedUntil:this.counterLockUntil});return answer?this.act({...answer,guhuo:this.guhuoMode||answer.guhuo}):false}
      if(pending.kind==='guanxing')return this.act({type:'arrange',top:this.star?.id===pending.id?this.star.top:view.legal.find(a=>a.type==='arrange').pool.map(c=>c.id),bottom:this.star?.id===pending.id?this.star.bottom:[]})
      if(pending.kind==='liuli'){const a=view.legal.find(a=>a.type==='redirect'&&a.target===this.targets[0]&&equal(a.ids,this.selected));return a?this.act(a):this.inform('选择一张牌，再选择弃牌后仍在范围内的目标')}
      if(pending.kind==='yiji'){const a=view.legal.find(a=>a.type==='give'&&a.target===this.targets[0]&&equal(a.ids,this.selected));return a?this.act(a):this.inform('只选择本次传道得到的牌和接收者')}
      if(pending.kind==='tuxi'){const a=view.legal.find(a=>a.targets?.length===this.targets.length&&a.targets.every(t=>this.targets.includes(t)));return a?this.act(a):this.inform('选择一至两名角色')}
      if(pending.kind==='discard')return this.act({type:'discard',ids:this.selected})
      const answer=view.legal.find(a=>a.type==='respond'&&(a.as||pending.as)===(this.as||pending.as)&&equal(a.ids,this.selected));return answer?this.act({...answer,guhuo:this.guhuoMode||answer.guhuo}):this.inform('请按提示选择可以响应的牌')
    }
    if(this.skill)return this.act({type:'skill',skill:this.skill,ids:this.selected,target:this.targets[0],targets:this.targets})
    const as=this.currentAs(view),a=this.matching(view).find(a=>a.as===as&&a.targets.length===this.targets.length&&a.targets.every((t,i)=>as==='collateral'?t===this.targets[i]:this.targets.includes(t)))
    return a?this.act({...a,guhuo:this.guhuoMode||a.guhuo}):this.inform('先选牌，再点亮目标，最后确认')
  }
  setTarget(view,t){const as=this.currentAs(view),pair=['lijian','ganlu','dimeng','anxu'].includes(this.skill),multi=view.pending?.kind==='tuxi'||pair||this.skill==='xueji'||!this.skill&&['sha','ironchain'].includes(as)&&this.matching(view).some(a=>a.targets.length>1),limit=pair||view.pending?.kind==='tuxi'||as==='ironchain'?2:this.skill==='xueji'?Math.max(1,view.players[0].maxHp-view.players[0].hp):Math.max(1,...this.matching(view).filter(a=>a.as===as).map(a=>a.targets.length));this.targets=!this.skill&&as==='collateral'?collateralSelection(this.targets,t):multi?boundedTargets(this.targets,t,limit):replaceTarget(this.targets,t)}
  click(event){
    let b=event.target.closest('[data-action]');if(!b||!this.root.contains(b)||b.disabled)return
    if(this.state&&!this.modal&&!this.paused&&!this.auto&&!this.transfer&&!this.draws.length&&b.dataset.action==='card'&&event.target.closest('.fs-own-equipment')){
      const view=playerView(this.state,0)
      if(!view.pending&&!this.skill&&selectingTargets(this,view)&&this.matching(view).some(a=>a.targets.length)){
        if(this.targetable(view).includes(0)){this.setTarget(view,0);this.render()}return
      }
    }
    // Portrait equipment and detail buttons must not steal a targeting tap.
    if(this.state&&!this.modal&&!this.lobby&&!this.paused&&!this.auto&&!this.transfer&&!this.draws.length&&['target','hero-detail','card-detail','identity','role-mark'].includes(b.dataset.action)&&selectingTargets(this,playerView(this.state,0))){
      const player=event.target.closest('.fs-player'),own=event.target.closest('.fs-own-hero')
      if(player)b=player.querySelector('[data-action="target"]')||b
      else if(own){const view=playerView(this.state,0);if(this.targetable(view).includes(0)){this.setTarget(view,0);this.render()}return}
      else if(b.dataset.action==='hero-detail')return
    }
    const action=b.dataset.action,id=b.dataset.id,value=b.dataset.value
    this.voice.unlock()
    if(!this.lobby&&action!=='music')this.music.unlock()
    if(action==='help'){this.hints=!this.hints;this.savePreferences();this.render();return}
    if(action==='menu'){this.modal={kind:'menu'};this.render();return}
    if(action==='music'){this.music.setEnabled(!this.music.enabled);this.savePreferences();this.render();return}
    if(action==='auto'){this.auto=!this.auto;this.reset();this.clock.key=null;this.render();return}
    if(action==='voice'){this.voice.setEnabled(!this.voice.enabled);this.savePreferences();this.render();return}
    if(action==='identity'){this.modal={kind:'identity'};this.render();return}
    if(action==='hero'){if(this.setup){const v=setupView(this.setup,0);if(v.candidates.includes(id)&&!v.picked){this.draftHero=id;this.render()}}return}
    if(action==='setup-next'){this.actSetup({type:'reveal',seat:0});return}
    if(action==='draft-pick'){this.actSetup({type:'pick',seat:0,heroId:this.draftHero});return}
    if(action==='setup-begin'){this.actSetup({type:'begin',seat:0});return}
    if(action==='start'){this.start();return}
    if(action==='mode'&&this.lobby){this.mode=modeById(id).id;this.savePreferences();this.render();return}
    if(action==='resume'){this.resume();return}
    if(action==='close'){this.closeModal();return}
    if(action==='hand'){this.modal={kind:'hand'};this.render();return}
    if(['rules','heroes','gallery','forms','report','hero-detail','card-detail','quit'].includes(action)){this.openModal(action,id);return}
    if(action==='quit-confirm'){this.clearEffects();this.voice.stop();this.music.pause();this.auto=false;this.resumeSession=restoreSession(load(SAVE,null));this.resumeState=this.resumeSession?.kind==='game'?this.resumeSession.game:null;this.setup=null;this.state=null;this.draftHero=null;this.lobby=true;this.modal=null;this.paused=false;this.reset();this.render();return}
    if(action==='pause'){this.paused=!this.paused;this.render();return}
    if(action==='pace'){this.pace=this.pace===650?250:this.pace===250?1100:650;this.savePreferences();this.render();return}
    if(!this.state||this.paused||this.auto||this.transfer||this.draws.length||this.moves.length||isRevealing(this.state)||this.modal&&!(this.modal.kind==='hand'&&action==='card'))return
    const view=playerView(this.state,0),own=view.players[0]
    if(action==='ext-option'){this.extValue=value;this.render();return}
    if(action==='guhuo'){if(view.legal.some(a=>a.type==='play'||a.type==='respond')){this.guhuoMode=!this.guhuoMode;this.render()}return}
    if(action==='role-mark'){this.roleMarks=nextRoleMark(view,this.roleMarks,Number(value));this.save();this.render();return}
    if(['panel-choice','panel-confirm'].includes(action)){
      if(action==='panel-confirm'){if(String(view.pending?.id)===b.dataset.prompt&&String(view.revision)===b.dataset.revision)this.confirm();return}
      const result=panelSelection({view,selection:this.panelSelection,index:Number(value),promptId:b.dataset.prompt,revision:b.dataset.revision})
      if(result.kind==='commit')this.act(result.action)
      else if(result.kind==='select'){this.panelSelection=result.selection;this.render()}
      return
    }
    if(action==='star-move'&&view.pending?.kind==='guanxing'&&view.pending.actor===0){
      const pool=view.legal.find(a=>a.type==='arrange').pool
      if(!this.star||this.star.id!==view.pending.id)this.star={id:view.pending.id,top:pool.map(c=>c.id),bottom:[]}
      const from=this.star.top.includes(id)?'top':'bottom',to=from==='top'?'bottom':'top';this.star[from]=this.star[from].filter(x=>x!==id);this.star[to].push(id);this.render();return
    }
    if(action==='choice-zone'&&view.pending?.kind==='take'&&view.pending.actor===0){this.choiceZone=value;this.choiceIndex=null;this.choiceSelection=null;this.render();return}
    if(['take-choice','choose-confirm'].includes(action)&&view.pending?.kind==='take'&&view.pending.actor===0){
      const result=takeSelection({pending:view.pending,revision:view.revision,legal:view.legal,selection:this.choiceSelection,index:action==='take-choice'?Number(value):this.choiceIndex,promptId:b.dataset.prompt,eventRevision:b.dataset.revision})
      if(result.kind==='commit')this.act(result.action)
      else if(action==='take-choice'&&result.kind==='select'){this.choiceSelection=result.selection;this.choiceIndex=result.selection.index;this.render()}
      return
    }
    if(action==='card'){
      if(view.pending?.kind==='yiji'&&view.pending.actor===0&&!view.legal.some(a=>a.type==='give'&&a.ids.includes(id))){this.inform('只能分配本次传道获得的牌');return}
      const available=view.pending?view.pending.actor===0:view.current===0&&view.phase==='play'
      if(!available){this.modal={kind:'card-detail',id};this.render();return}
      if(this.selected.includes(id))this.selected=this.selected.filter(c=>c!==id)
      else{
        const equipped=Object.values(own.equip).some(c=>c?.id===id)
        if(equipped&&this.skill!=='zhiheng'&&!view.legal.some(a=>a.ids?.includes(id))){this.modal={kind:'card-detail',id};this.render();return}
        const spear=!this.skill&&own.equip.weapon?.type==='spear'&&(!view.pending||view.pending.as==='sha'),multi=['zhiheng','rende','jieyin','dimeng'].includes(this.skill)||['discard','axe','yiji'].includes(view.pending?.kind)||view.pending?.kind==='ext'&&view.extension.spec?.max>1
        this.selected=multi?this.selected.concat(id):spear&&this.selected.length<2?this.selected.concat(id):[id]
      }
      if(this.skill==='dimeng'||view.pending?.kind==='ext')this.targets=this.targets.filter(t=>this.targetable(view).includes(t));else this.targets=[];this.as=null;this.render();return
    }
    if(action==='target'){
      const t=Number(value)
      if(!selectingTargets(this,view)){this.modal={kind:'hero-detail',id:display(view.players[t]).id};this.render();return}
      if(!this.targetable(view).includes(t)&&!this.targets.includes(t))return
      this.setTarget(view,t)
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
    if(event.key==='Escape'){event.preventDefault();this.closeModal();return}
    if(event.key==='Tab'){
      const controls=[...this.root.querySelectorAll('.fs-modal button:not(:disabled),.fs-modal a[href]')],first=controls[0],last=controls.at(-1)
      if(controls.length&&(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last||!this.root.querySelector('.fs-modal').contains(document.activeElement))){event.preventDefault();(event.shiftKey?last:first).focus()}
    }
  }
  header(){const label=this.lobby?'准备大厅':this.setup?(setupView(this.setup,0).teamMode?'选将':'身份选将'):(this.state?.teamMode?'两军对垒':'身份对决');return `<header class="fs-header"><div class="fs-brand">众神<span>斗法</span><small>单机对局 / ${label}</small></div>${renderToolbar({lobby:this.lobby,setup:this.setup,paused:this.paused,voice:this.voice.enabled,music:this.music.enabled})}</header>`}
  renderLobby(){return renderHome(this)}
  equipment(p,own=false){return Object.entries(p.equip).filter(([,c])=>c).map(([slot,c])=>`<button class="fs-equip ${this.selected.includes(c.id)?'selected':''}" data-action="${own?'card':'card-detail'}" data-id="${c.id}" data-slot="${slot}" aria-label="${{weapon:'武器',armor:'防具',offenseHorse:'进攻坐骑',defenseHorse:'防御坐骑'}[slot]}：${CARDS_BY_TYPE[c.type].name}" title="${esc(displayText(CARDS_BY_TYPE[c.type].help))}"><img src="${CARDS_BY_TYPE[c.type].image}" alt="" loading="lazy">${equipmentSlot(slot)}<span>${CARDS_BY_TYPE[c.type].name}</span><small>${CARDS_BY_TYPE[c.type].range?'距'+CARDS_BY_TYPE[c.type].range:CARDS_BY_TYPE[c.type].slot==='offenseHorse'?'−1':CARDS_BY_TYPE[c.type].slot==='defenseHorse'?'+1':'防'}</small></button>`).join('')||'<small class="fs-no-equip">法宝栏为空</small>'}
  skills(p,view){const h=display(p);return Object.keys(h.skillNames).filter(s=>SKILLS[s][2]!=='lord'||(!view.teamMode&&p.role==='lord')).map(s=>{const active=p.seat===0&&view.legal.some(a=>a.type==='skill'&&a.skill===s),guhuo=p.seat===0&&s==='guhuo'&&view.legal.some(a=>a.type==='play'||a.type==='respond');return `<button data-action="${guhuo?'guhuo':p.seat===0&&s==='huashen'?'forms':active?'skill':'hero-detail'}" data-value="${s}" data-id="${h.id}" class="fs-skill ${(this.skill===s||guhuo&&this.guhuoMode)&&p.seat===0?'selected':''}"><b>${h.skillNames[s]}</b><small>${guhuo?(this.guhuoMode?'已扣置':'扣置声明'):active?'发动':catalog.automaticSkills.includes(s)?'自动':{lord:'主公技',locked:'锁定',convert:'转化',trigger:'触发',limited:'限定',wake:'觉醒'}[SKILLS[s][2]]||'技能'}</small></button>`}).join('')}
  opponent(p,view){return renderOpponent(this,p,view)}
  pendingText(view){const p=view.pending;if(!p)return '';const source=p.source==null?'法术':display(view.players[p.source]).name,target=p.target==null?'目标':display(view.players[p.target]).name;return {
    shensu:p.mode===1?'疾行：选择目标；发动后跳过判定与摸牌':'疾行：选一张装备牌和目标；发动后跳过出牌',
    response:combatContext(view)?.hint||`${source} → ${target}：请打出${p.remaining>1?p.remaining+' 张':''}${CARDS_BY_TYPE[p.as]?.name||''}`,
    rescue:`${target}濒死：是否使用仙桃救援？`,counter:`${p.negated?'反制破法':'使用破法'}：${CARDS_BY_TYPE[p.cardType]?.name||''} → ${target}`,
    incarnation:'七十二变：在中央选择形态与技能',guanxing:'推演：排列牌顶与牌底，然后确认',liuli:'移劫：弃一张牌，选择转移目标',yiji:'传道：分配本次获得的牌，或保留',tuxi:'地行：选择一至两名角色，或正常摸牌','judge-replace':'天眼：用一张手牌改判，或放弃',
    discard:`弃牌：请选 ${p.count} 张手牌`,guess:`${skillName(view.players[p.actor],'fanjian')}：猜测花色`,pick:'仙山采宝：选择一张牌',take:`选择${target}的一张牌`,axe:'番天印：弃两张牌，令杀命中',blade:'打神鞭：是否再出一张杀？',support:`${p.requester==null?'主公':display(view.players[p.requester]).name}请求${CARDS_BY_TYPE[p.as]?.name||''}援助`,choice:`${SKILLS[p.skill]?skillName(view.players[p.actor],p.skill):displayText({dualsword:'阴阳双剑',dualTarget:'阴阳双剑',ice:'乾坤圈',bow:'五色神光'}[p.skill]||'法宝')}：请选择`,
  }[p.kind]||'等待响应'}
  renderActions(view){return renderControls(this,view)}
  won(){const s=this.state;if(s.teamMode)return s.winner===String(s.sides[0]);const role=s.players[0].role;return role===s.winner||role==='loyal'&&s.winner==='lord'}
  renderGame(){return renderBattle(this)}
  modalContent(){
    if(!this.modal)return ''
    const {kind,id}=this.modal;let title='',body=''
    // 牌桌「菜单」收纳（英雄杀式）：不常用功能全部收进这里，顶栏只留菜单按钮。
    if(kind==='menu'){title='菜单';body=renderMenu({inGame:!!this.state,paused:this.paused,voice:this.voice.enabled,music:this.music.enabled,hints:this.hints!==false,pace:this.pace===250?'快':this.pace===1100?'慢':'标准',auto:this.auto})}
    if(kind==='heroes'){title='人物图鉴';body=heroGallery()}
    if(kind==='forms'&&this.state){title='七十二变 · 你的变身牌';body=formCollection(playerView(this.state,0).players[0])}
    if(kind==='hand'&&this.state){const v=playerView(this.state,0);title='展开手牌 · '+v.players[0].hand.length+' 张';body=`<p>点击选牌，选中后点“完成选择”回到牌桌确认。这里不会自动出牌。</p><div class="fs-expanded-hand">${v.players[0].hand.map(c=>`<button data-action="card" data-id="${c.id}" class="${this.selected.includes(c.id)?'selected':''}" aria-label="${CARDS_BY_TYPE[c.type].name} ${SUITS[c.suit]}${c.rank}" aria-pressed="${this.selected.includes(c.id)}">${cardFace(c)}</button>`).join('')}</div><button data-action="close" class="fs-primary fs-hand-done">完成选择${this.selected.length?' · '+this.selected.length+' 张':''}</button>`}
    if(kind==='identity'&&this.setup){const r=ROLES[setupView(this.setup,0).role];title='你的身份：'+r.name;body=`<h3>${r.name}的胜利条件</h3><p>${r.goal}。</p><p>身份已随机分配且锁定，主公先选将，再由其他玩家选将。</p>`}
    if(kind==='identity'&&this.state){const v=playerView(this.state,0),p=v.players[0]
      if(v.teamMode){const ally=v.sides[0]===0;title='你的阵营';body=`<section class="fs-identity-help"><strong class="fs-identity ${ally?'role-ally':'role-enemy'}">${ally?'友方':'敌方'}</strong><h3>胜利条件</h3><p>消灭敌方全部角色即获胜；我方全部阵亡则失败。</p><p>座位穿插：你之后依次是敌方、队友、敌方循环。开局掷骰，点数最高者先手。</p></section>`}
      else{const r=ROLES[p.role];title='你的身份：'+r.name;body=`<section class="fs-identity-help"><strong class="fs-identity role-${p.role}">${r.name}</strong><h3>你的胜利条件</h3><p>${r.goal}。</p><p>${p.alive?'其他玩家不能看到你的身份，主公除外。':'你已阵亡，身份已公开；仍可在牌桌观看结算。'}</p></section>`}}
    if(kind==='hero-detail'){const p=this.state&&playerView(this.state,0).players.find(p=>display(p).id===id),h=p?display(p):HERO_BY_THEME_ID[id];title=h.name+' · '+h.title;body=heroDetails(h)}
    if(kind==='card-detail'){const c=catalog.makeDeck().find(c=>c.id===id)||catalog.makeDeck().find(c=>c.type===id)||(CARDS_BY_TYPE[id]?sampleCard(id):null),d=c&&CARDS_BY_TYPE[c.type];title=d?.name||'卡牌';body=d?`<div class="fs-card-detail">${cardFace(c)}<div><b>${{basic:'基本牌',trick:'即时法术',delay:'延时阵法',equip:'法宝'}[d.category]}</b><p>${esc(displayText(d.help))}</p><small>${d.virtualOnly?'仅由技能生成，不增加实体牌数量':'牌库中共有 '+catalog.makeDeck().filter(c=>c.type===d.type).length+' 张'}</small></div></div>`:''}
    if(kind==='gallery'){title='法宝与卡牌图鉴';body=`<p>实体牌库共 108 张；焚天焰、缚神索、琼浆由技能生成。点击卡牌查看用途，返回图鉴后可以继续浏览。</p><div class="fs-gallery">${Object.values(CARDS_BY_TYPE).map(d=>`<button data-action="card-detail" data-id="${d.type}">${cardFace(sampleCard(d.type))}</button>`).join('')}</div><section><h3>扩展法宝 · 未加入当前牌堆</h3><p>${PLANNED_EQUIPMENT.map(d=>d.name).join('、')}将在后续版本逐步开放，当前对局只使用上方列出的卡牌。</p></section>`}
    if(kind==='report'){title=this.state?.winner?(playerView(this.state,0).teamMode?'终局 · 胜负一览':'终局 · 身份揭晓'):'战场记录';if(this.state){const v=playerView(this.state,0);body=`${v.winner?`<div class="fs-role-reveal">${v.players.map(p=>`<span>${display(p).name}<b>${v.teamMode?(v.sides[p.seat]===v.sides[v.seat]?'友方':'敌方'):ROLES[p.role].name}</b></span>`).join('')}</div>`:''}<ol class="fs-report">${v.logs.map(l=>`<li>${esc(displayText(l.text))}</li>`).join('')}</ol>`}}
    if(kind==='quit'){title='退出游戏？';body='<p>当前牌局或选将进度已保存，回到大厅后可以继续上次进度。</p><button data-action="quit-confirm" class="fs-primary">退出游戏</button>'}
    if(kind==='rules'){title='众神斗法 · 游戏规则';body=gameRules()}
    return `<div class="fs-modal-overlay"><section class="fs-modal" role="dialog" aria-modal="true" aria-labelledby="fs-dialog-title" tabindex="-1"><header><small>众神斗法</small><h2 id="fs-dialog-title">${title}</h2><button data-action="close" aria-label="${this.modalStack.length?'返回图鉴':'关闭弹窗'}">${this.modalStack.length?'←':'×'}</button></header><div class="fs-modal-body">${body}</div></section></div>`
  }
  render(){
    if(this.destroyed)return
    clearTimeout(this.timer)
    const scrolls=Object.fromEntries([...this.root.querySelectorAll('[data-scroll]')].map(e=>[e.dataset.scroll,{left:e.scrollLeft,top:e.scrollTop}]))
    const wasModal=!!this.root.querySelector('.fs-modal'),prior=document.activeElement
    if(this.state&&!this.setup){const v=playerView(this.state,0),choice=counterSelection(v,this.counterKey,this.selected);this.counterKey=choice.key;this.selected=choice.selected;this.tableTrail=updateTableTrail(this.tableTrail||[],v)}
    if(this.modal&&!wasModal)this.returnFocus={action:prior?.dataset?.action,id:prior?.dataset?.id}
    this.viewport.setImmersive(!this.lobby);this.syncClock()
    this.root.classList.toggle('fs-playing',!this.lobby&&!this.setup)
    morph(this.root,(this.lobby?this.renderLobby():this.setup?renderSetup(this):this.renderGame())+this.modalContent()+(this.toast?`<div class="fs-toast" role="status">${esc(this.toast)}</div>`:''))
    if(this.modal&&!this.lobby&&(this.state||this.setup)){
      const role=this.setup?setupView(this.setup,0).role:this.state.players[0].role
      this.root.querySelector('.fs-modal header>small').textContent+=' · 你的身份：'+ROLES[role].name
      if(this.modal.kind==='hero-detail'&&this.state){
        const p=playerView(this.state,0).players.find(p=>display(p).id===this.modal.id)
        if(p){const info=document.createElement('p');info.className='fs-role-detail';info.textContent=`本局身份：${p.role?ROLES[p.role].name:'隐藏'}${!p.alive?' · 已阵亡，身份已公开':''}${p.chained?' · 已连环':''}${p.faceDown?' · 背面，下一回合休整':''}${p.skillsSealed?' · 人物技能已失效':''}`;this.root.querySelector('.fs-modal-body').prepend(info);if(p.buquPile.length){const pile=document.createElement('div');pile.className='fs-gallery fs-public-pile';pile.innerHTML='<h3>公开护道牌</h3>'+p.buquPile.map(c=>cardFace(c)).join('');this.root.querySelector('.fs-modal-body').append(pile)}}
      }
    }
    // 大厅主视觉与详情大图在渲染时直接出原图（见 renderHome/modalContent 的 full=true）。
    // Player-facing copy is native to the game in preview and release alike.
    layoutArena(this.root);layoutHand(this.root)
    for(const [key,v]of Object.entries(scrolls)){const e=this.root.querySelector(`[data-scroll="${key}"]`);if(e){e.scrollLeft=v.left;e.scrollTop=v.top}}
    if(this.selected.length)revealHandCard(this.root,this.selected.at(-1));this.decorateBattle()
    const ownIds=this.draws.flatMap(d=>d.ownIds)
    for(const id of ownIds)this.root.querySelector(`.fs-hand-card[data-id="${id}"]`)?.classList.add('fs-newly-drawn')
    if(ownIds.length)revealHandCard(this.root,ownIds.at(-1))
    if(this.handRevealId){revealHandCard(this.root,this.handRevealId);this.handRevealId=null}
    if(this.state?.pending?.kind==='counter'&&this.state.pending.actor===0&&this.selected.length)revealHandCard(this.root,this.selected.at(-1))
    if(this.transfer||this.draws.length||this.moves.length||isRevealing(this.state))this.root.querySelector('.fs-dock')?.setAttribute('inert','')
    if(this.modal){this.root.querySelectorAll('.fs-header,.fs-lobby,.fs-entry,.fs-setup,.fs-hud,.fs-arena,.fs-status,.fs-dock').forEach(e=>e.inert=true);this.root.querySelector('[data-action="close"]')?.focus()}
    else if(wasModal&&this.returnFocus?.action){const s=`[data-action="${this.returnFocus.action}"]${this.returnFocus.id?`[data-id="${this.returnFocus.id}"]`:''}`;this.root.querySelector(s)?.focus()}
    scaleCards(this.root);this.schedule()
  }
  destroy(){this.destroyed=true;this.voice.destroy();this.music.destroy();this.clearEffects();clearInterval(this.clockTimer);clearTimeout(this.timer);clearTimeout(this.toastTimer);this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('keydown',this.onKey);document.removeEventListener('fullscreenchange',this.onScreen);document.removeEventListener('visibilitychange',this.onVisibility);this.viewport.destroy();this.starGesture.destroy()}
}
window.__fengshenUI=new FengshenUI(document.getElementById('app'))
window.__fengshenTheme={version:THEME_VERSION,heroes:HEROES,cards:CARDS_BY_TYPE}
