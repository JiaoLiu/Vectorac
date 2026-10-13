import {HEROES,HERO_BY_THEME_ID,PLAYABLE_HEROES,FACTIONS,ALLIANCES,ALLIANCE_NAMES,CARDS_BY_TYPE,PLANNED_EQUIPMENT,heroForBase,displayText,skillName,skillHelp} from './theme.mjs'
import {SKILLS,ROLES,SUITS,isRed,rankName} from './core/catalog.mjs'
import {createGame,dispatch,playerView,restoreGame,THEME_VERSION,catalog,militaryCatalog} from './engine.mjs'
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
import {tutorialEnabled,judgingSeat,counterSelection,counterAction,responseSelection,responderHighlight} from './table-visuals.mjs'
import {TargetBeams} from './target-beams.mjs'
import {mountOnline,onlineCredential} from './online.mjs'
import './online.css'
import './home-entry.css'
import {tableTrail as updateTableTrail,counterTrail,takeJudgmentCard,tableChainKey} from './table-trail.mjs'
import {createSetup,dispatchSetup,setupView,chooseSetupAI,restoreSession,MODE_LIST,modeById} from './setup.mjs'
import {renderHome,renderSetup,heroGallery} from './setup-ui.mjs'
import {CardVoice,cuesForAction} from './voice.mjs'
import {renderBattle,renderOpponent,renderControls,stateMarkers} from './table.mjs'
import {esc,display,portrait,hp,cardFace,effectiveCard,scaleCards,equipmentSlot,equipEffect} from './presentation.mjs'
import {combatContext,damageCues,collateralSelection} from './combat.mjs'
import {recoveryCues,paintRecovery,RECOVERY_DURATION} from './health-effects.mjs'
import {layoutHand} from './hand.mjs'
import {layoutArena,revealHandCard} from './arena-layout.mjs'
import {bindGameViewport} from './viewport.mjs'
import {localPoint} from './screen-mode.mjs'
import {cardTargetCandidates,selectingTargets,replaceTarget,boundedTargets} from './target-selection.mjs'
import {heroDetails,gameRules,formCollection}from './player-guide.mjs'
import {modalReturnEntry}from './modal-navigation.mjs'
import {takeSelection}from './take-selection.mjs'
import {panelSelection,panelAction,cleanRoleMarks,nextRoleMark} from './panel-selection.mjs'
import {extensionTargets,extensionAction} from './extension-actions.mjs'
import {extensionPopup,extensionPrompt} from './extension-table.mjs'
import {bindStarDrag} from './star-drag.mjs'
import {advanceUnavailable,DecisionClock} from './flow.mjs'
import {BackgroundMusic} from './music.mjs'
import {drawEffects,judgmentEffects,harvestEffects,yijiEffects,transferEffects,discardEffects} from './draw-effects.mjs'
import {PlayMotionQueue,publicPlayMotions,pendingImpact,PLAY_FLIGHT_MS} from './play-motion.mjs'
import {TableSettlement} from './table-settlement.mjs'
import {heroBattleDetails,delayedTargetReason,jiushiButton} from './hero-state.mjs'
import './hero-state.css'
import {JudgmentCinematics,successfulJudgments,judgmentKey,paintJudgmentCinematic} from './judgment-cinematics.mjs'
import './judgment-cinematics.css'
import './play-motion.css'
import {FeedbackModal} from './feedback.mjs'

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
const isRevealing=s=>s?.pending?.kind==='reveal'||s?.pending?.kind==='ext'&&(s.pending.stage==='reveal'||s.extension?.stage==='reveal')
const sampleCard=type=>catalog.makeDeck().find(c=>c.type===type)||{type,virtual:true}
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
const store=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}}

export class FengshenUI {
  constructor(root) {
    this.root=root;this.state=null;this.setup=null;this.draftHero=null;this.lobby=true;this.selected=[];this.targets=[];this.skill=null;this.as=null;this.modal=null;this.paused=false;this.timer=null;this.toast='';this.destroyed=false
    const preferences=load(PREFS,{pace:650,voice:true});this.hints=tutorialEnabled(preferences);this.pace=preferences.pace;if(![250,650,1100].includes(this.pace))this.pace=650
    this.mode=MODE_LIST.some(m=>m.id===preferences.mode)?preferences.mode:'identity5'
    this.deckVersion=preferences.deckVersion===2?2:1
    this.modalStack=[];this.choiceIndex=null;this.choiceZone='hand';this.hits=[];this.transfer=null;this.draws=[];this.auto=false;this.clock=new DecisionClock();this.music=new BackgroundMusic({enabled:preferences.music!==false});this.voice=new CardVoice({enabled:preferences.voice!==false,onIdle:()=>{if(!this.destroyed)this.schedule()}})
    this.resumeSession=restoreSession(load(SAVE,null));this.resumeState=this.resumeSession?.kind==='game'?this.resumeSession.game:null;this.legacySave=load('vectorac.fengshen.internal.save.v1',null)!=null;root.className='fs-app'
    this.feedback=new FeedbackModal()
    this.onClick=e=>this.click(e);this.onKey=e=>this.key(e)
    this.moves=[];this.discards=null;this.recoveries=[];this.beams=new TargetBeams();this.playMotions=new PlayMotionQueue();this.judgmentCinematics=new JudgmentCinematics();this.tableSettlement=new TableSettlement()
    this.onVisibility=()=>{clearTimeout(this.timer);if(document.hidden){this.voice.stop();this.music.pause();clearTimeout(this.judgmentTimer);this.judgmentCinematics.clear();paintJudgmentCinematic(this.root,null)}else{if(this.transfer?.until<Date.now())this.transfer=null;if(this.draws?.every(d=>(d.started||0)+1300<Date.now()))this.draws=[];if(this.moves?.every(m=>m.until<Date.now()))this.moves=[];this.recoveries=this.recoveries.filter(h=>h.until>Date.now());this.decorateBattle();if(!this.lobby)this.music.unlock();this.voice.unlock();this.keepAwake(!this.lobby);this.schedule()}this.syncClock()}
    this.onViewport=()=>{layoutArena(root);layoutHand(root);if(this.selected.length)revealHandCard(root,this.selected.at(-1));this.decorateBattle();scaleCards(root);this.online?.afterRender()}
    this.viewport=bindGameViewport(root,this.onViewport)
    this.starGesture=bindStarDrag(root,{getState:()=>this.state?.pending?.kind==='guanxing'?this.star:null,onMove:state=>{this.star=state;this.render()},onInteraction:active=>{this.draggingStars=active;this.syncClock()}})
    this.onScreen=()=>{if(!document.fullscreenElement)screen.orientation?.unlock?.();this.onViewport();this.render()};document.addEventListener('fullscreenchange',this.onScreen)
    root.addEventListener('click',this.onClick);root.addEventListener('keydown',this.onKey);document.addEventListener('visibilitychange',this.onVisibility);
    this.clockTimer=setInterval(()=>this.tickClock(),250);this.onViewport();this.render();prewarmTableArt()
  }
  reset(){this.selected=[];this.targets=[];this.skill=null;this.as=null;this.guhuoMode=false;this.chainReset=false;this.extValue=null;this.choiceIndex=null;this.choiceSelection=null;this.panelSelection=null;this.choiceZone='hand';this.star=null}
  savePreferences(){store(PREFS,{pace:this.pace,voice:this.voice.enabled,music:this.music.enabled,hints:this.hints,mode:this.mode,deckVersion:this.deckVersion})}
  start(){
    if(!this.lobby)return
    this.requestGameScreen();this.clearEffects();this.voice.stop();this.music.unlock();this.auto=false;this.state=null;this.setup=createSetup({mode:this.mode,deckVersion:this.deckVersion});this.draftHero=null;this.lobby=false;this.paused=false;this.reset();this.save();this.render()
  }
  save(){if(this.online){if(this.state)this.roleMarks=cleanRoleMarks(playerView(this.state,0),this.roleMarks);this.online.saveNotes();return}if(this.setup)store(SAVE,{kind:'setup',setup:this.setup});else if(this.state){this.roleMarks=cleanRoleMarks(playerView(this.state,0),this.roleMarks);store(SAVE,{kind:'game',game:this.state,roleMarks:this.roleMarks})}}
  resume(){
    const raw=load(SAVE,null),session=restoreSession(raw);if(!session)return
    this.roleMarks=session.kind==='game'?cleanRoleMarks(playerView(session.game,0),raw?.roleMarks):{}
    this.requestGameScreen();this.clearEffects();this.voice.stop();this.music.unlock();this.auto=false;this.setup=session.kind==='setup'?session.setup:null;this.state=session.kind==='game'?advanceUnavailable(session.game,dispatch,playerView):null;if(this.state)this.beams.restore(playerView(this.state,0));this.draftHero=null;this.lobby=false;this.paused=false;this.reset();this.save();this.render()
  }
  actSetup(action){
    if(this.online)return this.online.send(action)
    if(!this.setup)return false
    const before=this.setup,result=dispatchSetup(before,{...action,revision:before.revision})
    if(!result.ok){this.inform(result.error);return false}
    if(result.game){this.state=result.game;this.roleMarks={};this.setup=null;this.draftHero=null;this.reset();for(const cue of cuesForAction({players:result.game.players,eventId:0},{type:'begin',seat:0},result.game))this.voice.speak(cue.key,cue.sex)}
    else{this.setup=result.setup;if(before.stage!==this.setup.stage||action.type==='pick'&&action.seat===0)this.draftHero=null}
    this.save();this.render();return true
  }
  inform(message){this.toast=displayText(message);clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>{this.toast='';if(!this.destroyed)this.render()},2800);this.render()}
  act(action){if(this.online)return this.online.send(action);if(!this.state)return false;const before=this.state,r=dispatch(before,{...action,seat:action.seat??0,revision:before.revision,promptId:before.pending?.id});if(!r.ok){this.inform(r.error);return false}this.state=advanceUnavailable(r.state,dispatch,playerView);return this.present(before,action)}
  // 页面在后台时 AudioContext 被挂起，drain 卡在当前这句上不再消费队列；若继续入队，
  // 回到前台会一次性把期间攒下的报牌全播一遍（AI 早出下一张了还在念前面的牌）。所以后台不入队。
  present(before,action){if(!document.hidden)for(const cue of cuesForAction(before,action,this.state))this.voice.speak(cue.key,cue.sex);const hits=damageCues(before,this.state);if(hits.length){this.hits=hits.map(h=>({...h,until:Date.now()+900}));for(const h of hits)this.voice.hurt(h.amount);clearTimeout(this.hitTimer);this.hitTimer=setTimeout(()=>{this.hits=[];if(!this.destroyed)this.decorateBattle()},920)}
    const beforeView=playerView(before,0),afterView=playerView(this.state,0)
    const publicMotions=publicPlayMotions(beforeView,afterView).map(e=>{const c=e.cards[0],a=(e.source===0?this.root.querySelector(`.fs-hand-card[data-id="${c?.id}"]`)||this.root.querySelector('.fs-own-hero>button'):this.root.querySelector(`[data-player="${e.source}"] .fs-player-main`))?.getBoundingClientRect();return {...e,origin:a&&localPoint(this.root,a.x+a.width/2,a.y+a.height/2)}})
    if(document.hidden)this.playMotions.clear();else this.playMotions.enqueue(publicMotions)
    if(document.hidden)this.judgmentCinematics.clear();else this.judgmentCinematics.enqueue(successfulJudgments(beforeView,afterView).map(e=>({...e,targetName:display(afterView.players[e.target]).name})))
    this.beams.record(afterView)
    const recovered=recoveryCues(before,this.state)
    if(recovered.length){const started=Date.now();this.recoveries=this.recoveries.filter(h=>h.until>started).concat(recovered.map(h=>({...h,started,until:started+RECOVERY_DURATION})));clearTimeout(this.recoveryTimer);this.recoveryTimer=setTimeout(()=>{this.recoveries=[];if(!this.destroyed)this.decorateBattle()},RECOVERY_DURATION+20)}
    if(before.pending?.kind==='take'&&action.type==='choose'){
      const pending=playerView(before,before.pending.actor).pending,option=playerView(before,before.pending.actor).legal.find(a=>a.value===action.value),hidden=option?.hidden||action.value==='hand'
      this.transfer={from:pending.target,to:before.pending.actor,mode:before.pending.mode,card:hidden?null:option?.card,started:Date.now(),until:Date.now()+1050}
      clearTimeout(this.transferTimer);this.transferTimer=setTimeout(()=>{this.transfer=null;if(!this.destroyed)this.render()},1100)
    }
    if(before.pending?.kind==='counter'&&action.type==='respond'){this.tableTrail=counterTrail(this.tableTrail||[],playerView(before,0));if(action.seat==null||action.seat===0){this.counterLockUntil=Date.now()+700;clearTimeout(this.counterLockTimer);this.counterLockTimer=setTimeout(()=>{if(!this.destroyed)this.render()},720)}}
    const judged=judgmentEffects(before,this.state).at(-1)
    if(judged){
      const r=this.root.querySelector(`[data-judge-card="${judged.card.id}"]`)?.getBoundingClientRect(),origin=r&&localPoint(this.root,r.x+r.width/2,r.y+r.height/2)
      this.tableTrail=takeJudgmentCard(this.tableTrail||[],judged.card.id)
      this.transfer={from:judged.target,to:judged.target,mode:'judgment',card:judged.card,origin,started:Date.now(),until:Date.now()+1050};clearTimeout(this.transferTimer);this.transferTimer=setTimeout(()=>{this.transfer=null;if(!this.destroyed)this.render()},1100)
    }
    const picked=harvestEffects(before,this.state).at(-1)
    if(picked){const r=this.root.querySelector(`[data-pool-card="${picked.card.id}"]`)?.getBoundingClientRect(),origin=r&&localPoint(this.root,r.x+r.width/2,r.y+r.height/2);this.transfer={from:picked.target,to:picked.target,mode:'harvest',card:picked.card,origin,started:Date.now(),until:Date.now()+1050};clearTimeout(this.transferTimer);this.transferTimer=setTimeout(()=>{this.transfer=null;if(!this.destroyed)this.render()},1100)}
    const gifted=yijiEffects(before,this.state).at(-1)
    if(gifted){const r=(this.root.querySelector(`[data-yiji-card="${gifted.cards.at(-1)}"]`)||this.root.querySelector('.fs-yiji-choice'))?.getBoundingClientRect(),origin=r&&localPoint(this.root,r.x+r.width/2,r.y+r.height/2);this.transfer={from:gifted.seat,to:gifted.target,mode:'yiji',card:null,count:gifted.count,origin,started:Date.now(),until:Date.now()+1050};clearTimeout(this.transferTimer);this.transferTimer=setTimeout(()=>{this.transfer=null;if(!this.destroyed)this.render()},1100)}
    // 救援牌只走统一的公开出牌→牌桌动画；回血光效与 +血数字由 recoveryCues 独立保留。
    // 公开弃置/拆牌：丢掉的牌在牌桌中间内联展示一会再自动收起，让人看清丢了什么。
    // 自己弃牌同样展示——碧曲（悲歌）等技能代价、弃牌阶段的弃牌都是公开流程，不能只给别人看。
    const discarded=discardEffects(before,this.state).at(-1)
    if(discarded){const p=beforeView.pending,chainKey=p&&!(p.kind==='discard'&&!p.skill&&beforeView.phase==='resolve')&&this.closedTableChain!==tableChainKey(beforeView)?tableChainKey(beforeView):null;this.discards={seat:discarded.seat,by:discarded.by??null,cards:discarded.cards||[],chainKey,until:Date.now()+2200};clearTimeout(this.discardTimer);this.discardTimer=setTimeout(()=>{this.discards=null;if(!this.destroyed)this.render()},2250)}
    const draws=drawEffects(before,this.state)
    if(draws.length){const started=Date.now();this.draws=draws.map(d=>({...d,started}));clearTimeout(this.drawTimer);this.drawTimer=setTimeout(()=>{this.draws=[];if(!this.destroyed)this.render()},1300)}
    const moves=transferEffects(before,this.state)
    if(moves.length){const started=Date.now();this.moves=moves.map(m=>({...m,started,until:started+1200}));clearTimeout(this.moveTimer);this.moveTimer=setTimeout(()=>{this.moves=[];if(!this.destroyed)this.render()},1250)}
    const previousIds=new Set(before.players[0].hand.map(c=>c.id)),received=this.state.players[0].hand.filter(c=>!previousIds.has(c.id))
    this.handRevealId=received.at(-1)?.id||null
    this.reset();this.save();this.render();return true}
  clearEffects(){clearTimeout(this.tableSettleTimer);this.tableSettlement?.clear();clearTimeout(this.playMotionTimer);this.playMotions?.clear();clearTimeout(this.judgmentTimer);this.judgmentCinematics?.clear();paintJudgmentCinematic(this.root,null);clearTimeout(this.hitTimer);clearTimeout(this.beamTimer);this.beams.clear();clearTimeout(this.recoveryTimer);clearTimeout(this.transferTimer);clearTimeout(this.drawTimer);clearTimeout(this.moveTimer);clearTimeout(this.discardTimer);clearTimeout(this.counterLockTimer);this.hits=[];this.recoveries=[];this.transfer=null;this.draws=[];this.moves=[];this.discards=null;this.tableTrail=[];this.counterKey=null;this.counterLockUntil=0}
  syncClock(){
    if(this.online){const m=this.online.meta,s=this.state,human=s&&!s.winner&&(s.pending?.actor??s.current)===0&&!this.auto&&!isRevealing(s);this.clock.running=false;this.clock.key=human?'online:'+m?.windowId:null;this.clock.left=Math.max(0,(m?.deadlineAt||0)-Date.now()+(this.online.offset||0));return}
    const s=this.state,human=!this.lobby&&!this.setup&&s&&!s.winner&&(s.pending?.actor??s.current)===0&&!isRevealing(s)&&(s.players[0].alive||s.pending?.kind==='ext'&&s.pending.skill==='zhuiyi')
    const key=human?`${s.revision}:${s.pending?.id||s.phase}`:null
    this.clock.sync(key,!!human&&!this.draggingStars&&!this.auto&&!this.paused&&!document.hidden&&!this.transfer&&!this.draws.length&&!this.moves.length&&!this.playMotions.busy&&!this.judgmentCinematics.busy)
  }
  tickClock(){
    if(this.destroyed)return
    this.syncClock();this.root.querySelectorAll('[data-seconds]').forEach(e=>e.textContent=this.clock.seconds+'s')
    if(this.clock.key&&this.clock.running&&this.clock.left===0&&!this.auto){this.auto=true;this.modal=null;this.reset();this.render();this.inform('思考时间已到，AI 已接手；点“接管”可随时回来')}
  }
  // 牌局期间保持屏幕常亮：手机上长时间不操作会被系统息屏锁屏，牌局就断在那里。
  // 切到后台时浏览器会自动释放锁，回到前台由 onVisibility 重新申请一次。
  async keepAwake(on){
    try{
      if(!on){const lock=this.wakeLock;this.wakeLock=null;await lock?.release?.();return}
      if(this.wakeLock||document.hidden||!navigator.wakeLock?.request)return
      const lock=await navigator.wakeLock.request('screen')
      if(this.destroyed){await lock.release?.();return}
      this.wakeLock=lock
      lock.addEventListener?.('release',()=>{if(this.wakeLock===lock)this.wakeLock=null})
    }catch{/* 不支持 Screen Wake Lock 的浏览器退回系统默认息屏行为 */}
  }
  async requestGameScreen(){
    this.viewport.setImmersive(true);this.keepAwake(true)
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
    // Keep the original 2.5s group attack beams. Public response flights do
    // not add a second dashed source-to-target overlay or restart these beams.
    const beam=this.beams.frame(v,{targets:this.targets,as:this.currentAs(v)}),links=beam.links
    clearTimeout(this.beamTimer)
    if(links.length&&!beam.preview)this.beamTimer=setTimeout(()=>{if(!this.destroyed)this.decorateBattle()},beam.remaining+20)
    this.root.querySelectorAll('.fs-judging,.fs-effect-source,.fs-effect-target,.fs-effect-focus,.fs-pick-focus,.fs-replace-focus,.fs-responding,.fs-dying').forEach(e=>e.classList.remove('fs-judging','fs-effect-source','fs-effect-target','fs-effect-focus','fs-pick-focus','fs-replace-focus','fs-responding','fs-dying'))
    const judge=judgingSeat(v);if(judge!=null)anchor(judge)?.classList.add('fs-judging')
    // 被动抉择者淡黄色边框：轮到某人做响应/选牌等被动决定时提示（万妖/飞剑出杀闪、借刀、五谷选牌…）。
    // 排除纯公开展示（判定翻开、ext 展示阶段）——那些只需自动 ack，不是抉择，否则会两人轮流闪黄框；
    // 濒死求桃、无懈询问也排除（逐个私下询问，高亮会暴露谁有桃/无懈）。
    // 与回合提示一样挂在人物外框；内层头像的光晕会被 overflow:hidden 裁掉，自己的按钮还会被 border:0 覆盖。
    const responder=responderHighlight(v);if(responder!=null)this.root.querySelector(responder===0?'.fs-own-hero':`[data-player="${responder}"]`)?.classList.add('fs-responding')
    // 濒死角色：谁濒死是全场公开信息，给本人一个"濒死"红框状态；被询问的救援者一律不给高亮。
    const dying=v.pending?.kind==='rescue'?v.pending.target:null;if(dying!=null)this.root.querySelector(dying===0?'.fs-own-hero':`[data-player="${dying}"]`)?.classList.add('fs-dying')
    for(const link of links){anchor(link.source)?.classList.add('fs-effect-source');anchor(link.target)?.classList.add('fs-effect-target')}
    // 五谷选牌轮到的用泛黄边框提示（与被动抉择统一，见下方 fs-responding）；
    // 紫色"取宝"只保留取牌飞行动画，避免选牌时整张人物卡被紫色内发光覆盖。
    const picker=this.transfer?.mode==='harvest'?this.transfer.to:null;if(picker!=null)anchor(picker)?.classList.add('fs-pick-focus')
    if(v.pending?.kind==='judge-replace')anchor(v.pending.actor)?.classList.add('fs-replace-focus')
    for(const p of v.players){const e=anchor(p.seat);e?.classList.toggle('fs-flipped',p.faceDown);if(p.seat===0){e?.querySelector('.fs-face-down')?.remove();if(e&&p.faceDown){const tag=document.createElement('span');tag.className='fs-face-down';tag.textContent='翻面 · 下回合休整';e.append(tag)}}}
    this.root.querySelectorAll('.fs-extension-actor').forEach(e=>e.classList.remove('fs-extension-actor'))
    if(v.pending?.kind==='ext'&&v.extension.stage!=='reveal')anchor(v.pending.actor)?.classList.add('fs-extension-actor')
    const ownAnchor=this.root.querySelector('.fs-own-hero');ownAnchor?.querySelector('.fs-state-marks')?.remove();ownAnchor?.insertAdjacentHTML('beforeend',stateMarkers(v.players[0],{fieldAction:'field-use',selected:this.selected}))
    if(links.length){const layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.classList.add('fs-target-lines');layer.dataset.beamMode=beam.preview?'aim':'effect';if(!beam.preview)layer.style.animationDelay=-beam.elapsed+'ms';layer.setAttribute('viewBox',`0 0 ${this.root.clientWidth} ${this.root.clientHeight}`);layer.setAttribute('aria-hidden','true');const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');layer.append(defs)
      // 光束式指向线（参考英雄杀）：细亮芯+柔光晕，源端亮、目标端渐隐，不再用粗箭头。
      for(const [i,link] of links.entries()){const a=anchor(link.source)?.getBoundingClientRect(),b=anchor(link.target)?.getBoundingClientRect();if(!a||!b)continue;const ap=localPoint(this.root,a.x+a.width/2,a.y+a.height/2),bp=localPoint(this.root,b.x+b.width/2,b.y+b.height/2),cx=ap.x,cy=ap.y,bx=bp.x,by=bp.y,length=Math.hypot(bx-cx,by-cy)||1,sa=Math.min(a.width,a.height)*.32,sb=Math.min(b.width,b.height)*.32
        const x=cx+(bx-cx)*sa/length,y=cy+(by-cy)*sa/length,tx=bx-(bx-cx)*sb/length,ty=by-(by-cy)*sb/length,gid=`fs-beam-g${i}`
        const grad=document.createElementNS('http://www.w3.org/2000/svg','linearGradient');grad.id=gid;grad.setAttribute('gradientUnits','userSpaceOnUse');grad.setAttribute('x1',x);grad.setAttribute('y1',y);grad.setAttribute('x2',tx);grad.setAttribute('y2',ty)
        for(const [o,c,op] of [[0,'#fff6cf',1],[.55,'#ffd77a',.9],[1,'#ffe99e',.8]]){const stop=document.createElementNS('http://www.w3.org/2000/svg','stop');stop.setAttribute('offset',o);stop.setAttribute('stop-color',c);stop.setAttribute('stop-opacity',op);grad.append(stop)}defs.append(grad)
        const glow=document.createElementNS('http://www.w3.org/2000/svg','path');glow.setAttribute('d',`M${x} ${y} L${tx} ${ty}`);glow.setAttribute('class','fs-beam-glow')
        const line=document.createElementNS('http://www.w3.org/2000/svg','path');line.dataset.source=link.source;line.dataset.target=link.target;line.setAttribute('d',`M${x} ${y} L${tx} ${ty}`);line.setAttribute('class','fs-beam-core');line.setAttribute('stroke',`url(#${gid})`);layer.append(glow,line)}this.root.append(layer)}
    for(const h of this.hits.filter(h=>h.until>Date.now())){const e=anchor(h.target);if(e){e.classList.add('fs-hurt');const badge=document.createElement('span');badge.className='fs-damage-number';badge.textContent='−'+h.amount;e.append(badge)}}
    paintRecovery(this.root,this.recoveries)
    this.root.querySelector('.fs-transfer-flight')?.remove()
    this.root.querySelectorAll('[data-judgment-incoming]').forEach(e=>{e.style.removeProperty('visibility');e.removeAttribute('data-judgment-incoming')})
    if(this.transfer&&this.transfer.until>Date.now()){
      const f=this.transfer,incoming=f.mode==='judgment'&&f.to===0?this.root.querySelector(`.fs-hand-card[data-id="${f.card.id}"]`):null,a=(f.mode==='harvest'?this.root.querySelector(`[data-pool-card="${f.card.id}"]`)||this.root.querySelector('.fs-pool-choice'):f.mode==='judgment'?this.root.querySelector(`[data-judge-card="${f.card.id}"]`)||this.root.querySelector('.fs-table-center'):anchor(f.from))?.getBoundingClientRect(),to=(incoming||(['judgment','harvest','yiji'].includes(f.mode)?(f.to===0?this.root.querySelector('.fs-hand'):anchor(f.to)):f.mode==='snatch'?anchor(f.to):this.root.querySelector('.fs-table-center,.fs-center-choice')))?.getBoundingClientRect()
      if((a||f.origin)&&to){const ap=f.origin||localPoint(this.root,a.x+a.width/2,a.y+a.height/2),tp=localPoint(this.root,to.x+to.width/2,to.y+to.height/2);const e=document.createElement('div');e.className='fs-transfer-flight';e.dataset.transferMode=f.mode;e.innerHTML=(f.card?cardFace(f.card):'<span class="fs-card-back"><i>封</i><b>暗手牌</b></span>')+(['judgment','harvest'].includes(f.mode)?'':`<span>${f.mode==='yiji'?`赠予${f.count>1?'×'+f.count:''}`:f.mode==='snatch'?'取走':'弃置'}</span>`);e.style.setProperty('--from-x',`${ap.x-27}px`);e.style.setProperty('--from-y',`${ap.y-38}px`);e.style.setProperty('--to-x',`${tp.x-27}px`);e.style.setProperty('--to-y',`${tp.y-38}px`);
        // 每次重渲染都会重建飞牌节点；用负延迟对齐已流逝的时间，避免 AI 连续行动时同一张牌从起点反复飞（看起来像飞出 2-3 张）。
        if(f.started)e.style.animationDelay=`${Math.min(0,f.started-Date.now())}ms`
        this.root.append(e)
        if(incoming){incoming.dataset.judgmentIncoming='true';incoming.style.visibility='hidden'}
      }
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
      const receiver=anchor(d.target),to=(d.target===0?this.root.querySelector('.fs-hand'):receiver?.querySelector('[data-resource="hand"]')||receiver)?.getBoundingClientRect()
      if(receiver){receiver.classList.add('fs-draw-receiver');const badge=document.createElement('span');badge.className='fs-draw-count';badge.textContent=`摸牌 +${d.count}`;receiver.append(badge)}
      if(!deck||!to)continue
      for(let i=0;i<d.count;i++){
        const e=document.createElement('div');e.className='fs-draw-flight';e.dataset.drawTarget=d.target;e.dataset.drawIndex=i+1
        e.innerHTML=`<span class="fs-card-back"><i>封</i><b>暗手牌</b><small>摸牌 ${i+1}/${d.count}</small></span>`
        const tp=localPoint(this.root,to.x+to.width/2,to.y+to.height/2),x=tp.x-20+i*12,y=tp.y-28
        e.style.setProperty('--from-x',`${deckPoint.x+i*4}px`);e.style.setProperty('--from-y',`${deckPoint.y}px`);e.style.setProperty('--to-x',`${x}px`);e.style.setProperty('--to-y',`${y}px`);e.style.setProperty('--mid-x',`${(deckPoint.x+x)/2}px`);e.style.setProperty('--mid-y',`${(deckPoint.y+y)/2-25}px`);e.style.setProperty('--draw-delay',`${i*140-Math.max(0,Date.now()-(d.started??Date.now()))}ms`);this.root.append(e)
      }
    }
    this.decoratePlayMotion(v,anchor);this.paintJudgment()
  }
  paintJudgment(){
    clearTimeout(this.judgmentTimer)
    const play=this.playMotions.frame(),blocked=!!this.modal||document.hidden||!!this.transfer||!!this.draws.length||!!this.moves.length||!!play&&play.elapsed<PLAY_FLIGHT_MS
    const frame=this.judgmentCinematics.frame({blocked});paintJudgmentCinematic(this.root,frame)
    if(frame?.event&&!frame.event.soundStarted){frame.event.soundStarted=true;void this.voice.judgmentSound(frame.event.kind,{elapsed:frame.elapsed})}
    if(frame)this.judgmentTimer=setTimeout(()=>{if(this.destroyed)return;this.paintJudgment();if(!this.judgmentCinematics.busy){if(!this.modal&&!this.transfer&&!this.draws.length&&!this.moves.length&&!this.playMotions.busy&&!isRevealing(this.state))this.root.querySelector('.fs-dock')?.removeAttribute('inert');this.syncClock();this.settleTable();this.schedule();this.maybeAutoEnd()}},frame.event?frame.remaining+15:Math.min(80,frame.remaining))
  }
  decoratePlayMotion(view,anchor){
    this.root.querySelectorAll('.fs-play-flight,.fs-play-links,.fs-play-source-symbol,.fs-impact-symbol').forEach(e=>e.remove())
    this.root.querySelectorAll('.fs-public-caster,.fs-impact-target').forEach(e=>{e.classList.remove('fs-public-caster','fs-impact-target');e.removeAttribute('data-impact-kind');e.removeAttribute('data-impact-negated');e.removeAttribute('data-caster-seat');e.removeAttribute('data-impact-target')})
    this.root.querySelectorAll('[data-play-hidden]').forEach(e=>{e.style.removeProperty('visibility');e.removeAttribute('data-play-hidden')})
    clearTimeout(this.playMotionTimer)
    const frame=this.playMotions.frame(),event=frame?.event,focus=event?.focus&&event.counter&&frame.elapsed<PLAY_FLIGHT_MS?{...event.focus,negated:!event.focus.negated}:event?.focus||pendingImpact(view)
    if(frame||view.pending?.kind==='counter')this.root.querySelectorAll('.fs-responding').forEach(e=>e.classList.remove('fs-responding'))
    if(!frame&&focus){const inner=anchor(focus.target),node=inner?.closest('.fs-player,.fs-own-hero')||inner;if(node){node.classList.add('fs-impact-target');node.dataset.impactKind=focus.kind;node.dataset.impactNegated=String(!!focus.negated);node.dataset.impactTarget=focus.target}}
    if(!frame)return
    const caster=anchor(event.source)
    // 当前回合者已经有蓝绿边框：出牌/响应时不再叠一圈金色外框。否则金色会盖住蓝绿，
    // 自己出杀、出闪时明明轮到自己却看不出蓝绿，等于把回合提示作废。
    if(caster){const node=caster.closest('.fs-player,.fs-own-hero')||caster;if(!node.classList.contains('turn-active')){node.classList.add('fs-public-caster');node.dataset.casterSeat=event.source}}
    // Upcoming cards stay hidden in their final table slots until their flight
    // lands. IDs, not artwork/type, keep equal-looking physical cards distinct.
    for(const [q,item]of this.playMotions.items.entries())for(const [i,c]of item.cards.entries()){
      if(q===0&&frame.elapsed>=PLAY_FLIGHT_MS+Math.min(i,4)*80)continue
      this.root.querySelectorAll(`[data-table-card="${c.id}"]`).forEach(e=>{e.dataset.playHidden='true';e.style.visibility='hidden'})
    }
    for(const [q,item]of this.playMotions.items.entries())if(item.virtualType&&(q>0||frame.elapsed<PLAY_FLIGHT_MS)){const node=this.root.querySelector(`[data-trail-key="${item.trailKey}"]`);if(node){node.dataset.playHidden='true';node.style.visibility='hidden'}}
    const cards=event.cards.length?event.cards:[{type:event.virtualType,virtual:true}]
    for(const [i,c]of cards.entries()){
      const stagger=Math.min(i,4)*80,elapsed=frame.elapsed-stagger;if(elapsed>=PLAY_FLIGHT_MS)continue
      const slot=c.id?this.root.querySelector(`[data-table-card="${c.id}"]`):this.root.querySelector(`[data-trail-key="${event.trailKey}"]`)
      const from=event.origin||(caster&&(()=>{const r=caster.getBoundingClientRect();return localPoint(this.root,r.x+r.width/2,r.y+r.height/2)})()),r=(slot||this.root.querySelector('.fs-table-center'))?.getBoundingClientRect()
      if(!from||!r)continue
      const to=localPoint(this.root,r.x+r.width/2,r.y+r.height/2),w=slot?.clientWidth||54,h=slot?.clientHeight||78,e=document.createElement('div');e.className='fs-play-flight';e.dataset.playSource=event.source;e.dataset.playKey=event.key;e.dataset.playCard=c.id||'virtual';e.innerHTML=cardFace(c)
      e.style.setProperty('--play-width',w+'px');e.style.setProperty('--play-height',h+'px');e.style.setProperty('--from-x',from.x-w/2+i*3+'px');e.style.setProperty('--from-y',from.y-h/2+'px');e.style.setProperty('--to-x',to.x-w/2+'px');e.style.setProperty('--to-y',to.y-h/2+'px');e.style.animationDelay=(-elapsed)+'ms';this.root.append(e);scaleCards(e)
    }
    const flyingUntil=PLAY_FLIGHT_MS+Math.min(4,Math.max(0,cards.length-1))*80
    this.playMotionTimer=setTimeout(()=>{if(!this.destroyed)this.render()},Math.max(16,Math.min(frame.remaining,frame.elapsed<flyingUntil?flyingUntil-frame.elapsed:frame.remaining)+15))
  }
  schedule(){
    clearTimeout(this.timer)
    if(this.online)return
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
    if(this.transfer||this.draws.length||this.moves.length||this.playMotions.busy||this.judgmentCinematics.busy)return
    if(isRevealing(this.state)){
      const p=this.state.pending,revision=this.state.revision
      const delay=p.kind==='reveal'&&this.judgmentCinematics.completed===judgmentKey(playerView(this.state,0))?180:1800
      this.timer=setTimeout(()=>{if(!this.destroyed&&this.state.revision===revision&&!this.paused&&!document.hidden&&!this.modal)this.act(p.kind==='reveal'?{type:'ack',seat:p.actor}:{type:'invoke',value:'ack',seat:p.actor})},delay)
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
  currentAs(view){const opts=this.matching(view),natural=view.players[0].hand.find(c=>c.id===this.selected[0])?.type;return this.as||(!this.guhuoMode&&natural==='indulgence'?natural:opts.find(a=>a.as===natural)?.as||opts[0]?.as)}
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
      if(pending.kind==='judge-replace'){const answer=view.legal.find(a=>a.type==='respond'&&a.as==='judgment'&&equal(a.ids,this.selected));return answer?this.act(answer):false}
      // 救援时可能只有「琼浆（酒）」而没有仙桃：pending.as 固定为 tao，但合法响应里的 as 是 wine。
      // 这里按实际合法响应回退到可用声明，避免按钮可用却选不中（旧逻辑会把 as 当 tao 而永远匹配不到）。
      const answers=view.legal.filter(a=>a.type==='respond'),respAs=this.as||(answers.some(a=>(a.as||pending.as)===pending.as)?pending.as:answers[0]?.as)||pending.as
      const answer=answers.find(a=>(a.as||pending.as)===respAs&&equal(a.ids,this.selected));return answer?this.act({...answer,guhuo:this.guhuoMode||answer.guhuo}):this.inform('请按提示选择可以响应的牌')
    }
    if(this.skill)return this.act({type:'skill',skill:this.skill,ids:this.selected,target:this.targets[0],targets:this.targets})
    const as=this.currentAs(view),a=this.matching(view).find(a=>a.as===as&&a.targets.length===this.targets.length&&a.targets.every((t,i)=>as==='collateral'?t===this.targets[i]:this.targets.includes(t)))
    return a?this.act({...a,guhuo:this.guhuoMode||a.guhuo,...(as==='ironchain'?{reset:!!this.chainReset}:{})}):this.inform('先选牌，再点亮目标，最后确认')
  }
  setTarget(view,t){const as=this.currentAs(view),pair=['lijian','ganlu','dimeng','anxu'].includes(this.skill),multi=view.pending?.kind==='ext'&&view.extension.spec?.multiTargets||view.pending?.kind==='tuxi'||pair||this.skill==='xueji'||!this.skill&&['sha','ironchain'].includes(as)&&this.matching(view).some(a=>a.targets.length>1),limit=view.pending?.kind==='ext'&&view.extension.spec?.multiTargets?view.extension.spec.maxTargets:pair||view.pending?.kind==='tuxi'||as==='ironchain'?2:this.skill==='xueji'?Math.max(1,view.players[0].maxHp-view.players[0].hp):Math.max(1,...this.matching(view).filter(a=>a.as===as).map(a=>a.targets.length));this.targets=!this.skill&&as==='collateral'?collateralSelection(this.targets,t):multi?boundedTargets(this.targets,t,limit):replaceTarget(this.targets,t)}
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
      if(player){const v=playerView(this.state,0),t=Number(player.dataset.player);if(!this.targetable(v).includes(t)){const as=this.currentAs(v)||v.players[0].hand.find(c=>c.id===this.selected[0])?.type,reason=delayedTargetReason(v,as,t,v.players[0].hand.filter(c=>this.selected.includes(c.id)));if(reason)this.inform(reason);return}b=player.querySelector('[data-action="target"]')||b}
      else if(own){const view=playerView(this.state,0);if(this.targetable(view).includes(0)){this.setTarget(view,0);this.render()}return}
      else if(b.dataset.action==='hero-detail')return
    }
    const action=b.dataset.action,id=b.dataset.id,value=b.dataset.value
    this.voice.unlock()
    if(!this.lobby&&action!=='music')this.music.unlock()
    if(action==='help'){this.hints=!this.hints;this.savePreferences();this.render();return}
    if(action==='menu'){this.modal={kind:'menu'};this.render();return}
    if(action==='music'){this.music.setEnabled(!this.music.enabled);this.savePreferences();this.render();return}
    if(action==='auto'){if(this.online){this.online.net.sendAdmin('SET_AUTOPLAY',{autoPlay:!this.auto});return}this.auto=!this.auto;this.reset();this.clock.key=null;this.render();return}
    if(action==='voice'){this.voice.setEnabled(!this.voice.enabled);this.savePreferences();this.render();return}
    if(action==='identity'){this.modal={kind:'identity'};this.render();return}
    if(action==='hero'){if(this.setup){const v=setupView(this.setup,0);if(v.candidates.includes(id)&&!v.picked){this.draftHero=id;this.render()}}return}
    if(action==='setup-next'){this.actSetup({type:'reveal',seat:0});return}
    if(action==='draft-pick'){this.actSetup({type:'pick',seat:0,heroId:this.draftHero});return}
    if(action==='setup-begin'){this.actSetup({type:'begin',seat:0});return}
    if(action==='start'){this.start();return}
    if(action==='mode'&&this.lobby){this.mode=modeById(id).id;this.savePreferences();this.render();return}
    if(action==='deck'&&this.lobby){this.deckVersion=this.deckVersion===2?1:2;this.savePreferences();this.render();return}
    if(action==='resume'){this.resume();return}
    if(action==='close'){this.closeModal();return}
    if(action==='feedback'){this.feedback.open();return}
    if(action==='hand'){this.modal={kind:'hand'};this.render();return}
    if(['rules','heroes','gallery','forms','report','hero-detail','card-detail','quit'].includes(action)){this.openModal(action,id);return}
    if(action==='quit-confirm'){this.keepAwake(false);if(this.online){this.online.leave();return}this.clearEffects();this.voice.stop();this.music.pause();this.auto=false;this.resumeSession=restoreSession(load(SAVE,null));this.resumeState=this.resumeSession?.kind==='game'?this.resumeSession.game:null;this.setup=null;this.state=null;this.draftHero=null;this.lobby=true;this.modal=null;this.paused=false;this.reset();this.render();return}
    if(action==='pause'){if(this.online){this.inform('联机牌局不能暂停其他玩家');return}this.paused=!this.paused;this.render();return}
    if(action==='pace'){this.pace=this.pace===650?250:this.pace===250?1100:650;this.savePreferences();this.render();return}
    // 取牌待决时，上一张牌的飞行动画（transfer）不应拦住下一次取牌：地变这类连续取两名角色的牌，
    // 第二个弹窗会在动画期间出现，若一并拦截，玩家在这一秒内点牌背/确认都没有反应（AI 无此 UI 门槛，故能照常取牌）。
    const takeReady=this.state&&this.state.pending?.kind==='take'&&this.state.pending.actor===0&&['choice-zone','take-choice','choose-confirm'].includes(action)
    if(!this.state||this.paused||this.auto||this.transfer&&!takeReady||this.draws.length||this.moves.length||isRevealing(this.state)||this.modal&&!(this.modal.kind==='hand'&&action==='card'))return
    const view=playerView(this.state,0),own=view.players[0]
    if(action==='skill-unavailable'){this.inform(jiushiButton(view).reason);return}
    if(action==='skill-trigger'){const a=jiushiButton(view).action;if(a)this.act(a);else this.inform(jiushiButton(view).reason);return}
    if(action==='ext-option'){this.extValue=value;this.render();return}
    if(action==='guhuo'){if(view.legal.some(a=>a.type==='play'||a.type==='respond')){this.guhuoMode=!this.guhuoMode;this.render()}return}
    if(action==='chain-mode'){this.chainReset=!this.chainReset;this.render();return}
    // 仙田标记点击：觉醒后把一张田当摄宝（探囊取物）使用。引擎只在存在合法目标时才给出 jixi 的 skill 合法项，
    // 故此处只需转交激活动作；否则按觉醒/无目标两种情况给出提示。
    if(action==='field-use'){
      if(view.legal.some(a=>a.type==='skill'&&a.skill==='jixi')){this.act({type:'skill',skill:'jixi',ids:[],targets:[]});return}
      this.inform((own.effectiveSkills||[]).includes('jixi')?'仙田只能对距离以内、且身上有牌的角色使用；当前没有合法目标':'仙田需先觉醒：准备阶段有至少三张田后，才能把田当摄宝使用')
      return
    }
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
      const available=!view.winner&&(view.pending?view.pending.actor===0:view.current===0&&view.phase==='play')
      if(!available){this.modal={kind:'card-detail',id};this.render();return}
      if(this.selected.includes(id))this.selected=this.selected.filter(c=>c!==id)
      else{
        const equipped=Object.values(own.equip).some(c=>c?.id===id)
        if(equipped&&this.skill!=='zhiheng'&&!view.legal.some(a=>a.ids?.includes(id))){this.modal={kind:'card-detail',id};this.render();return}
        const spear=!this.skill&&own.equip.weapon?.type==='spear'&&(!view.pending||view.pending.as==='sha'),multi=['zhiheng','rende','jieyin','dimeng','luanji'].includes(this.skill)||['discard','axe','yiji'].includes(view.pending?.kind)||view.pending?.kind==='ext'&&view.extension.spec?.max>1
        this.selected=multi?this.selected.concat(id):spear&&this.selected.length<2?this.selected.concat(id):[id]
      }
      if(this.skill==='dimeng'||view.pending?.kind==='ext'||view.pending?.kind==='yiji')this.targets=this.targets.filter(t=>this.targetable(view).includes(t));else this.targets=[];this.as=null;this.render();return
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
      const controls=[...this.root.querySelectorAll('.fs-modal button:not(:disabled),.fs-modal a[href],.fs-modal summary')],first=controls[0],last=controls.at(-1)
      if(controls.length&&(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last||!this.root.querySelector('.fs-modal').contains(document.activeElement))){event.preventDefault();(event.shiftKey?last:first).focus()}
    }
  }
  header(){const label=this.lobby?'准备大厅':this.setup?(setupView(this.setup,0).teamMode?'选将':'身份选将'):(this.state?.teamMode?'两军对垒':'身份对决');return `<header class="fs-header"><div class="fs-brand">众神<span>斗法</span><small>${this.online?'好友联机':'单机对局'} / ${label}</small></div>${renderToolbar({lobby:this.lobby,setup:this.setup,paused:this.paused,voice:this.voice.enabled,music:this.music.enabled})}</header>`}
  renderLobby(){this.networkCredential=onlineCredential();return renderHome(this)}
  equipment(p,own=false){return Object.entries(p.equip).filter(([,c])=>c).map(([slot,c])=>`<button class="fs-equip ${this.selected.includes(c.id)?'selected':''}" data-action="${own?'card':'card-detail'}" data-id="${c.id}" data-slot="${slot}" aria-label="${{weapon:'武器',armor:'防具',offenseHorse:'进攻坐骑',defenseHorse:'防御坐骑'}[slot]}：${CARDS_BY_TYPE[c.type].name}" title="${esc(displayText(CARDS_BY_TYPE[c.type].help))}"><img src="${CARDS_BY_TYPE[c.type].image}" alt="" loading="lazy">${equipmentSlot(slot)}<span>${CARDS_BY_TYPE[c.type].name}</span><small>${equipEffect(CARDS_BY_TYPE[c.type])}</small></button>`).join('')||'<small class="fs-no-equip">法宝栏为空</small>'}
  skills(p,view){const h=display(p),donate=p.seat===0&&view.legal.some(a=>['huangtian','zhiba'].includes(a.skill)),names={...h.skillNames,...Object.fromEntries(donate?view.legal.filter(a=>['huangtian','zhiba'].includes(a.skill)).map(a=>[a.skill,skillName(p,a.skill)]):[])};return Object.keys(names).filter(s=>donate&&['huangtian','zhiba'].includes(s)||SKILLS[s][2]!=='lord'||(!view.teamMode&&p.role==='lord')).map(s=>{const jb=s==='jiushi'&&p.seat===0?jiushiButton(view):null,active=p.seat===0&&view.legal.some(a=>a.type==='skill'&&a.skill===s),guhuo=p.seat===0&&s==='guhuo'&&view.legal.some(a=>a.type==='play'||a.type==='respond');return `<button data-action="${jb?.action?'skill-trigger':guhuo?'guhuo':p.seat===0&&s==='huashen'?'forms':active?'skill':jb?'skill-unavailable':'hero-detail'}" data-value="${s}" data-id="${h.id}" class="fs-skill ${(this.skill===s||guhuo&&this.guhuoMode)&&p.seat===0?'selected':''}"><b>${names[s]}</b><small>${guhuo?(this.guhuoMode?'已扣置':'扣置声明'):jb?jb.label:active?'发动':catalog.automaticSkills.includes(s)?'自动':{lord:'主公技',locked:'锁定',convert:'转化',trigger:'触发',limited:'限定',wake:'觉醒'}[SKILLS[s][2]]||'技能'}</small></button>`}).join('')}
  opponent(p,view){return renderOpponent(this,p,view)}
  pendingText(view){const p=view.pending;if(!p)return '';const source=p.source==null?'法术':display(view.players[p.source]).name,target=p.target==null?'目标':display(view.players[p.target]).name;return {
    shensu:p.mode===1?'疾行：选择目标；发动后跳过判定与摸牌':'疾行：选一张装备牌和目标；发动后跳过出牌',
    response:combatContext(view)?.hint||`${source} → ${target}：请打出${p.remaining>1?p.remaining+' 张':''}${CARDS_BY_TYPE[p.as]?.name||''}`,
    rescue:(()=>{const n=[...new Set(view.legal.filter(a=>a.type==='respond').map(a=>a.as))].map(k=>CARDS_BY_TYPE[k]?.name).filter(Boolean).join('或')||'仙桃';return `${target}濒死：是否使用${n}救援？`})(),counter:`${p.negated?'反制破法':'使用破法'}：${CARDS_BY_TYPE[p.cardType]?.name||''} → ${target}`,
    incarnation:'七十二变：在中央选择形态与技能',guanxing:'推演：排列牌顶与牌底，然后确认',liuli:'移劫：弃一张牌，选择转移目标',yiji:'传道：分配本次获得的牌，或保留',tuxi:'地行：选择一至两名角色，或正常摸牌','judge-replace':`${skillName(view.players[p.actor],p.skill)}：选择合法改判牌，或放弃`,
    discard:`弃牌：请选 ${p.count} 张手牌`,guess:`${skillName(view.players[p.actor],'fanjian')}：猜测花色`,pick:'仙山采宝：选择一张牌',take:`选择${target}的一张牌`,axe:'番天印：弃两张牌，令杀命中',blade:'打神鞭：是否再出一张杀？',support:`${p.requester==null?'主公':display(view.players[p.requester]).name}请求${CARDS_BY_TYPE[p.as]?.name||''}援助`,choice:`${SKILLS[p.skill]?skillName(view.players[p.actor],p.skill):displayText({dualsword:'阴阳双剑',dualTarget:'阴阳双剑',ice:'乾坤圈',bow:'五色神光'}[p.skill]||'法宝')}：请选择`,
  }[p.kind]||'等待响应'}
  renderActions(view){return renderControls(this,view)}
  won(){const s=this.state;if(s.teamMode)return s.winner===String(s.sides[0]);const role=s.players[0].role;return role===s.winner||role==='loyal'&&s.winner==='lord'}
  settleTable(){
    if(this.destroyed||!this.state||this.lobby||this.setup||this.online?.waiting)return
    const v=playerView(this.state,0),busy=this.playMotions.busy||this.judgmentCinematics.busy||!!this.transfer||!!this.draws.length||!!this.moves.length||this.hits.some(h=>h.until>Date.now())||this.recoveries.some(h=>h.until>Date.now())
    const f=this.tableSettlement.frame(v,{busy});this.tableSettleFrame=f;this.closedTableChain=f.closedChain
    const row=this.root.querySelector('.fs-table-trail');row?.classList.toggle('is-settled',f.fading)
    if(f.closedChain){this.tableTrail=updateTableTrail(this.tableTrail||[],v,{closedChain:f.closedChain});if(!this.tableTrail.length)row?.replaceChildren();if(this.discards?.chainKey===f.closedChain){this.discards=null;this.root.querySelector('.fs-public-discard')?.remove()}}
    // Clear just the public table, not the entire app. Rebuilding the online
    // social layer here would interrupt an unrelated drag/recording gesture.
    clearTimeout(this.tableSettleTimer)
    if(f.remaining)this.tableSettleTimer=setTimeout(()=>this.settleTable(),f.remaining+15)
    else if(busy&&!v.pending&&!this.playMotions.busy)this.tableSettleTimer=setTimeout(()=>this.settleTable(),250)
  }
  renderGame(){return renderBattle(this)}
  modalContent(){
    if(!this.modal)return ''
    const {kind,id}=this.modal;let title='',body='';const deck=(this.state?(playerView(this.state,0).deckVersion===2?militaryCatalog:catalog):(this.deckVersion===2?militaryCatalog:catalog)).makeDeck()
    // 牌桌「菜单」收纳（英雄杀式）：不常用功能全部收进这里，顶栏只留菜单按钮。
    if(kind==='menu'){title='菜单';body=renderMenu({inGame:!!this.state,paused:this.paused,voice:this.voice.enabled,music:this.music.enabled,hints:this.hints!==false,pace:this.pace===250?'快':this.pace===1100?'慢':'标准',auto:this.auto})}
    if(kind==='heroes'){title='人物图鉴';body=heroGallery()}
    if(kind==='forms'&&this.state){title='七十二变 · 你的变身牌';body=formCollection(playerView(this.state,0).players[0])}
    if(kind==='hand'&&this.state){const v=playerView(this.state,0);title='展开手牌 · '+v.players[0].hand.length+' 张';body=`<p>点击选牌，选中后点“完成选择”回到牌桌确认。这里不会自动出牌。</p><div class="fs-expanded-hand">${v.players[0].hand.map(c=>`<button data-action="card" data-id="${c.id}" class="${this.selected.includes(c.id)?'selected':''}" aria-label="${CARDS_BY_TYPE[c.type].name} ${SUITS[c.suit]}${c.rank}" aria-pressed="${this.selected.includes(c.id)}">${cardFace(c)}</button>`).join('')}</div><button data-action="close" class="fs-primary fs-hand-done">完成选择${this.selected.length?' · '+this.selected.length+' 张':''}</button>`}
    if(kind==='identity'&&this.setup){const r=ROLES[setupView(this.setup,0).role];title='你的身份：'+r.name;body=`<h3>${r.name}的胜利条件</h3><p>${r.goal}。</p><p>身份已随机分配且锁定，主公先选将，再由其他玩家选将。</p>`}
    if(kind==='identity'&&this.state){const v=playerView(this.state,0),p=v.players[0]
      if(v.teamMode){const ally=v.sides[0]===0;title='你的阵营';body=`<section class="fs-identity-help"><strong class="fs-identity ${ally?'role-ally':'role-enemy'}">${ally?'友方':'敌方'}</strong><h3>胜利条件</h3><p>消灭敌方全部角色即获胜；我方全部阵亡则失败。</p><p>座位穿插：你之后依次是敌方、队友、敌方循环。开局掷骰，点数最高者先手。</p></section>`}
      else{const r=ROLES[p.role];title='你的身份：'+r.name;body=`<section class="fs-identity-help"><strong class="fs-identity role-${p.role}">${r.name}</strong><h3>你的胜利条件</h3><p>${r.goal}。</p><p>${p.alive?'其他玩家不能看到你的身份，主公除外。':'你已阵亡，身份已公开；仍可在牌桌观看结算。'}</p></section>`}}
    if(kind==='hero-detail'){const v=this.state&&playerView(this.state,0),p=v?.players.find(p=>display(p).id===id),h=p?display(p):HERO_BY_THEME_ID[id];title=h.name+' · '+h.title;body=heroDetails(h,p?heroBattleDetails(p,v,{expanded:this.modal.statusExpanded,heroId:id}):'')}
    if(kind==='card-detail'){const c=deck.find(c=>c.id===id)||deck.find(c=>c.type===id)||(CARDS_BY_TYPE[id]?sampleCard(id):null),d=c&&CARDS_BY_TYPE[c.type],count=d?deck.filter(c=>c.type===d.type).length:0;title=d?.name||'卡牌';body=d?`<div class="fs-card-detail">${cardFace(c)}<div><b>${{basic:'基本牌',trick:'即时法术',delay:'延时阵法',equip:'法宝'}[d.category]}</b><p>${esc(displayText(d.help))}</p><small>${count?'本局牌堆中共有 '+count+' 张':'本局无此实体牌；部分技能可转化使用'}</small></div></div>`:''}
    if(kind==='gallery'){title='法宝与卡牌图鉴';body=`<p>当前${deck.length===160?'军争160张':'标准108张'}牌堆。军争增加炎杀、雷杀、焚天焰、缚神索、琼浆、闭粮阵及配套法宝。点击查看用途，返回后可以继续浏览。</p><div class="fs-gallery">${Object.values(CARDS_BY_TYPE).map(d=>`<button data-action="card-detail" data-id="${d.type}">${cardFace(deck.find(c=>c.type===d.type)||sampleCard(d.type))}</button>`).join('')}</div>`}
    if(kind==='report'){title=this.state?.winner?(playerView(this.state,0).teamMode?'终局 · 胜负一览':'终局 · 身份揭晓'):'战场记录';if(this.state){const v=playerView(this.state,0);body=`${v.winner?`<div class="fs-role-reveal">${v.players.map(p=>`<span>${display(p).name}<b>${v.teamMode?(v.sides[p.seat]===v.sides[v.seat]?'友方':'敌方'):ROLES[p.role].name}</b></span>`).join('')}</div>`:''}<ol class="fs-report">${v.logs.map(l=>`<li>${esc(displayText(l.text))}</li>`).join('')}</ol>`}}
    if(kind==='quit'){title='退出游戏？';body=`<p>${this.online?'退出房间会放弃本席，进行中的对局由 AI 继续；暂时断网或切后台可自动重连。':'当前牌局或选将进度已保存，回到大厅后可以继续上次进度。'}</p><button data-action="quit-confirm" class="fs-primary">退出游戏</button>`}
    if(kind==='rules'){title='众神斗法 · 游戏规则';body=gameRules()}
    return `<div class="fs-modal-overlay"><section class="fs-modal" role="dialog" aria-modal="true" aria-labelledby="fs-dialog-title" tabindex="-1"><header><small>众神斗法</small><h2 id="fs-dialog-title">${title}</h2><button data-action="close" aria-label="${this.modalStack.length?'返回图鉴':'关闭弹窗'}">${this.modalStack.length?'←':'×'}</button></header><div class="fs-modal-body">${body}</div></section></div>`
  }
  render(){
    if(this.destroyed)return
    this.online?.syncWaiting()
    this.online?.settleReady()
    clearTimeout(this.timer)
    const scrolls=Object.fromEntries([...this.root.querySelectorAll('[data-scroll]')].map(e=>[e.dataset.scroll,{left:e.scrollLeft,top:e.scrollTop}]))
    const wasModal=!!this.root.querySelector('.fs-modal'),prior=document.activeElement
    const heroStatus=this.root.querySelector('.fs-live-hero-state')
    if(this.modal?.kind==='hero-detail'&&heroStatus?.dataset.heroStateId===this.modal.id)this.modal.statusExpanded=!!heroStatus.querySelector('details')?.open
    clearTimeout(this.tableSettleTimer)
    if(this.state&&!this.setup){
      const v=playerView(this.state,0),choice=counterSelection(v,this.counterKey,this.selected);this.counterKey=choice.key;this.selected=choice.selected
      // 出杀/闪响应的辅助预选：与破法相同只在新询问出现时替换一次，之后玩家可自由改选。
      const resp=responseSelection(v,this.responseKey,this.selected);this.responseKey=resp.key;this.selected=resp.selected
      const busy=this.playMotions.busy||this.judgmentCinematics.busy||!!this.transfer||!!this.draws.length||!!this.moves.length||this.hits.some(h=>h.until>Date.now())||this.recoveries.some(h=>h.until>Date.now())
      this.tableSettleFrame=this.tableSettlement.frame(v,{busy});this.closedTableChain=this.tableSettleFrame.closedChain
      if(this.discards?.chainKey&&(this.discards.chainKey===this.closedTableChain||this.discards.chainKey!==tableChainKey(v)))this.discards=null
      this.tableTrail=updateTableTrail(this.tableTrail||[],v,{closedChain:this.closedTableChain})
      if(this.tableSettleFrame.remaining)this.tableSettleTimer=setTimeout(()=>this.settleTable(),this.tableSettleFrame.remaining+15)
      else if(busy&&!v.pending&&!this.playMotions.busy)this.tableSettleTimer=setTimeout(()=>this.settleTable(),250)
    }
    if(this.modal&&!wasModal){this.returnFocus={action:prior?.dataset?.action,id:prior?.dataset?.id};clearTimeout(this.toastTimer);this.toast=''}
    this.viewport.setImmersive(!this.lobby&&!this.online?.waiting);this.syncClock()
    this.root.classList.toggle('fs-network-room',!!this.online?.waiting)
    this.root.classList.toggle('fs-playing',!this.lobby&&!this.setup&&!this.online?.waiting)
    const feedback=this.feedback?.modal,keepFeedback=feedback?.parentNode===this.root
    if(keepFeedback)feedback.remove()
    this.online?.beforeRender()
    morph(this.root,(this.online?.waiting?this.online.waitingHtml():this.lobby?this.renderLobby():this.setup?renderSetup(this):this.renderGame())+(this.online?.socialHtml()||'')+this.modalContent()+(this.toast?`<div class="fs-toast" role="status">${esc(this.toast)}</div>`:''))
    if(keepFeedback){this.root.append(feedback);this.feedback.moveToDisplayRoot()}
    if(this.modal&&!this.lobby&&(this.state||this.setup)){
      const role=this.setup?setupView(this.setup,0).role:this.state.players[0].role
      this.root.querySelector('.fs-modal header>small').textContent+=' · 你的身份：'+ROLES[role].name
      if(this.modal.kind==='hero-detail'&&this.state){
        const v=playerView(this.state,0),p=v.players.find(p=>display(p).id===this.modal.id)
        if(p?.buquPile.length){const pile=document.createElement('div');pile.className='fs-gallery fs-public-pile';pile.innerHTML='<h3>公开护道牌</h3>'+p.buquPile.map(c=>cardFace(c)).join('');this.root.querySelector('.fs-modal-body').append(pile)}
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
    if(this.transfer||this.draws.length||this.moves.length||this.playMotions.busy||this.judgmentCinematics.busy||isRevealing(this.state))this.root.querySelector('.fs-dock')?.setAttribute('inert','')
    if(this.modal){this.root.querySelectorAll('.fs-header,.fs-lobby,.fs-entry,.fs-setup,.fs-hud,.fs-arena,.fs-status,.fs-dock').forEach(e=>e.inert=true);this.root.querySelector('[data-action="close"]')?.focus()}
    else if(wasModal&&this.returnFocus?.action){const s=`[data-action="${this.returnFocus.action}"]${this.returnFocus.id?`[data-id="${this.returnFocus.id}"]`:''}`;this.root.querySelector(s)?.focus()}
    scaleCards(this.root);this.online?.afterRender();this.schedule();this.maybeAutoEnd()
  }
  // 出牌阶段已经没有任何牌可出、也没有技能可发动（合法动作只剩「结束出牌」）时，
  // 直接进入弃牌阶段，省一次手动点击。联机本地状态可能滞后于服务器，用 revision 去重防止重复发送。
  maybeAutoEnd(){
    if(this.lobby||this.setup||this.paused||this.modal||this.auto||this.online?.roundBreak)return
    if(this.transfer||this.draws.length||this.moves.length||this.playMotions.busy||this.judgmentCinematics.busy)return
    const v=this.state&&!this.state.winner?playerView(this.state,0):null
    if(!v||v.pending||v.current!==0||v.phase!=='play')return
    if(v.legal.length!==1||v.legal[0].type!=='end')return
    if(this.autoEndFor===v.revision)return
    this.autoEndFor=v.revision;this.act({type:'end'})
  }
  destroy(){this.destroyed=true;this.keepAwake(false);this.online?.close();this.voice.destroy();this.music.destroy();this.clearEffects();clearInterval(this.clockTimer);clearTimeout(this.timer);clearTimeout(this.toastTimer);this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('keydown',this.onKey);document.removeEventListener('fullscreenchange',this.onScreen);document.removeEventListener('visibilitychange',this.onVisibility);this.viewport.destroy();this.starGesture.destroy()}
}
window.__fengshenUI=new FengshenUI(document.getElementById('app'))
mountOnline(window.__fengshenUI)
window.__fengshenTheme={version:THEME_VERSION,heroes:HEROES,cards:CARDS_BY_TYPE}
