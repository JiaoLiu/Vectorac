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
import {tutorialEnabled,targetLinks} from './table-visuals.mjs'
import {createSetup,dispatchSetup,setupView,chooseSetupAI,restoreSession,MODE_LIST,modeById} from './setup.mjs'
import {renderHome,renderSetup,heroGallery} from './setup-ui.mjs'
import {CardVoice,cuesForAction} from './voice.mjs'
import {renderBattle,renderOpponent,renderControls} from './table.mjs'
import {esc,display,portrait,hp,cardFace,scaleCards} from './presentation.mjs'
import {combatContext,damageCues,collateralSelection} from './combat.mjs'
import {layoutHand} from './hand.mjs'
import {advanceUnavailable,DecisionClock} from './flow.mjs'
import {BackgroundMusic} from './music.mjs'
import {drawEffects} from './draw-effects.mjs'

// Keep the old mixed-playtest save intact; never reinterpret its hero rules.
const SAVE='vectorac.fengshen.classic-original.save.v2',PREFS='vectorac.fengshen.internal.prefs.v1'
const RELEASE=typeof __FENGSHEN_RELEASE__!=='undefined'&&__FENGSHEN_RELEASE__
// 预热牌桌小图：每次操作都会整体重渲染，提前解码并常驻引用，避免 iOS 丢弃解码缓存导致整桌图片重绘闪烁。
const prewarmed=[]
const prewarmTableArt=()=>{if(prewarmed.length||typeof Image==='undefined')return;for(const src of [...HEROES.map(h=>h.thumbnail),...Object.values(CARDS_BY_TYPE).map(c=>c.thumb||c.image),'assets/heavenly-arena.jpg']){const img=new Image();img.decoding='async';img.src=src;prewarmed.push(img)}}
// iOS Safari 横屏：工具栏收起的前提是「文档可滚动」（同斗地主方案）。游戏根节点 fixed 不占文档流，
// 触屏设备上补一块隐形垫层让文档永远可滚；用户上滑即可把导航栏推上去，收起后 visualViewport 触发重测铺满。
let scrollSpacer=null
const syncScrollSpacer=()=>{try{if(!matchMedia('(pointer: coarse)').matches)return}catch{return}document.documentElement.classList.add('fs-scrollable');document.body.classList.add('fs-scrollable');if(!scrollSpacer){scrollSpacer=document.createElement('div');scrollSpacer.className='fs-scroll-spacer';scrollSpacer.setAttribute('aria-hidden','true');document.body.append(scrollSpacer)}scrollSpacer.style.height=(innerHeight+120)+'px'}
// 增量修补（morph）：按位对齐新旧子树，只更新变化的节点与属性，保留未变化
// 节点的元素身份——img 不销毁重解码、滚动位置与 CSS 动画不中断。此前每次
// 操作都 innerHTML 整体替换，iOS 上整棵子树销毁后分帧重绘，表现为一选牌全桌闪。
const patchAttrs=(a,b)=>{for(const name of a.getAttributeNames())if(!b.hasAttribute(name))a.removeAttribute(name);for(const {name,value}of b.attributes)if(a.getAttribute(name)!==value)a.setAttribute(name,value)}
const patchNode=(a,b)=>{if(a.nodeType!==b.nodeType||a.nodeType===1&&a.tagName!==b.tagName){a.replaceWith(b);return}if(a.nodeType===3){if(a.data!==b.data)a.data=b.data;return}if(a.nodeType!==1)return;patchAttrs(a,b);patchChildren(a,b)}
const patchChildren=(a,b)=>{const an=[...a.childNodes],bn=[...b.childNodes];for(let i=0;i<bn.length;i++)an[i]?patchNode(an[i],bn[i]):a.append(bn[i]);for(let i=bn.length;i<an.length;i++)an[i].remove()}
const morph=(host,html)=>{if(!host.firstChild){host.innerHTML=html;return}const tpl=document.createElement('template');tpl.innerHTML=html;patchChildren(host,tpl.content)}
const equal=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id))
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
const store=(key,v)=>{try{localStorage.setItem(key,JSON.stringify(v))}catch{}}

export class FengshenUI {
  constructor(root) {
    this.root=root;this.state=null;this.setup=null;this.draftHero=null;this.lobby=true;this.selected=[];this.targets=[];this.skill=null;this.as=null;this.modal=null;this.paused=false;this.timer=null;this.toast='';this.destroyed=false
    const preferences=load(PREFS,{pace:650,voice:true});this.hints=tutorialEnabled(preferences);this.pace=preferences.pace;if(![250,650,1100].includes(this.pace))this.pace=650
    this.mode=MODE_LIST.some(m=>m.id===preferences.mode)?preferences.mode:'identity5'
    this.choiceIndex=null;this.choiceZone='hand';this.hits=[];this.transfer=null;this.draws=[];this.auto=false;this.clock=new DecisionClock();this.music=new BackgroundMusic({enabled:preferences.music!==false});this.voice=new CardVoice({enabled:preferences.voice!==false,onIdle:()=>{if(!this.destroyed)this.schedule()}})
    this.resumeSession=restoreSession(load(SAVE,null));this.resumeState=this.resumeSession?.kind==='game'?this.resumeSession.game:null;this.legacySave=load('vectorac.fengshen.internal.save.v1',null)!=null;root.className='fs-app'
    this.onClick=e=>this.click(e);this.onKey=e=>this.key(e)
    this.onVisibility=()=>{clearTimeout(this.timer);if(document.hidden){this.voice.stop();this.music.pause()}else{if(!this.lobby)this.music.unlock();this.schedule()}this.syncClock()}
    this.onViewport=()=>{const v=window.visualViewport;root.style.setProperty('--fs-height',`${v?.height||innerHeight}px`);root.style.setProperty('--fs-top',`${v?.offsetTop||0}px`);syncScrollSpacer();layoutHand(root);root.querySelector('.fs-hand-card.selected .fs-card-face')?.scrollIntoView({block:'nearest',inline:'nearest'});this.decorateBattle();scaleCards(root)}
    this.onScreen=()=>{if(!document.fullscreenElement)screen.orientation?.unlock?.();this.onViewport();this.render()};document.addEventListener('fullscreenchange',this.onScreen)
    root.addEventListener('click',this.onClick);root.addEventListener('keydown',this.onKey);document.addEventListener('visibilitychange',this.onVisibility);window.addEventListener('resize',this.onViewport);window.visualViewport?.addEventListener('resize',this.onViewport);window.visualViewport?.addEventListener('scroll',this.onViewport)
    this.clockTimer=setInterval(()=>this.tickClock(),250);this.onViewport();this.render();prewarmTableArt()
  }
  reset(){this.selected=[];this.targets=[];this.skill=null;this.as=null;this.choiceIndex=null;this.choiceZone='hand';this.star=null}
  savePreferences(){store(PREFS,{pace:this.pace,voice:this.voice.enabled,music:this.music.enabled,hints:this.hints,mode:this.mode})}
  start(){
    if(!this.lobby)return
    this.requestGameScreen();this.clearEffects();this.voice.stop();this.music.unlock();this.auto=false;this.state=null;this.setup=createSetup({mode:this.mode});this.draftHero=null;this.lobby=false;this.paused=false;this.reset();this.save();this.render()
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
  decorateBattle(){
    if(!this.state||this.lobby||this.setup)return
    const v=playerView(this.state,0),battle=combatContext(v),anchor=seat=>this.root.querySelector(seat===0?'.fs-own-hero>button':`[data-player="${seat}"] .fs-player-main`)
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
    if(view.pending?.kind==='liuli'&&view.pending.actor===0)return [...new Set(view.legal.filter(a=>a.type==='redirect'&&equal(a.ids,this.selected)).map(a=>a.target))]
    if(view.pending?.kind==='yiji'&&view.pending.actor===0)return [...new Set(view.legal.filter(a=>a.type==='give').map(a=>a.target))]
    if(view.pending?.kind==='tuxi'&&view.pending.actor===0)return [...new Set(view.legal.flatMap(a=>a.targets||[]))]
    if(this.skill==='rende'||this.skill==='fanjian')return view.players.filter(p=>p.alive&&p.seat!==0).map(p=>p.seat)
    if(this.skill==='jieyin')return view.players.filter(p=>p.alive&&p.seat!==0&&catalog.HERO_BY_ID[p.heroId].sex==='male'&&p.hp<p.maxHp).map(p=>p.seat)
    if(this.skill==='qingnang')return view.players.filter(p=>p.alive&&p.hp<p.maxHp).map(p=>p.seat)
    if(this.skill==='lijian')return view.players.filter(p=>p.alive&&p.seat!==0&&catalog.HERO_BY_ID[p.heroId].sex==='male'&&(!this.targets.length||p.seat===this.targets[0]||!(catalog.HERO_BY_ID[p.heroId].skills.includes('kongcheng')&&!p.handCount))).map(p=>p.seat)
    if(this.skill==='jijiang')return view.legal.filter(a=>a.type==='skill'&&a.skill==='jijiang').map(a=>a.target)
    let opts=this.matching(view).filter(a=>a.as===this.currentAs(view))
    if(this.currentAs(view)==='collateral')return [...new Set(opts.filter(a=>!this.targets.length||a.targets[0]===this.targets[0]).map(a=>a.targets[this.targets.length?1:0]))]
    return [...new Set(opts.filter(a=>this.targets.every(t=>a.targets.includes(t))).flatMap(a=>a.targets))]
  }
  confirm(){
    const view=playerView(this.state,0),pending=view.pending
    if(pending?.actor===0){
      if(pending.kind==='guanxing')return this.act({type:'arrange',top:this.star?.id===pending.id?this.star.top:view.legal.find(a=>a.type==='arrange').pool.map(c=>c.id),bottom:this.star?.id===pending.id?this.star.bottom:[]})
      if(pending.kind==='liuli'){const a=view.legal.find(a=>a.type==='redirect'&&a.target===this.targets[0]&&equal(a.ids,this.selected));return a?this.act(a):this.inform('选择一张牌，再选择弃牌后仍在范围内的目标')}
      if(pending.kind==='yiji'){const a=view.legal.find(a=>a.type==='give'&&a.target===this.targets[0]&&equal(a.ids,this.selected));return a?this.act(a):this.inform('只选择本次传道得到的牌和接收者')}
      if(pending.kind==='tuxi'){const a=view.legal.find(a=>a.targets?.length===this.targets.length&&a.targets.every(t=>this.targets.includes(t)));return a?this.act(a):this.inform('选择一至两名角色')}
      if(pending.kind==='discard')return this.act({type:'discard',ids:this.selected})
      const answer=view.legal.find(a=>a.type==='respond'&&equal(a.ids,this.selected));return answer?this.act(answer):this.inform('请按提示选择可以响应的牌')
    }
    if(this.skill)return this.act({type:'skill',skill:this.skill,ids:this.selected,target:this.targets[0],targets:this.targets})
    const as=this.currentAs(view),a=this.matching(view).find(a=>a.as===as&&a.targets.length===this.targets.length&&a.targets.every((t,i)=>as==='collateral'?t===this.targets[i]:this.targets.includes(t)))
    return a?this.act(a):this.inform('先选牌，再点亮目标，最后确认')
  }
  click(event){
    const b=event.target.closest('[data-action]');if(!b||!this.root.contains(b)||b.disabled)return
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
    if(action==='close'){this.modal=null;this.render();return}
    if(action==='hand'){this.modal={kind:'hand'};this.render();return}
    if(['rules','heroes','gallery','report','hero-detail','card-detail','new'].includes(action)){this.modal={kind:action,id};this.render();return}
    if(action==='new-confirm'){this.clearEffects();this.voice.stop();this.music.pause();this.auto=false;this.resumeSession=restoreSession(load(SAVE,null));this.resumeState=this.resumeSession?.kind==='game'?this.resumeSession.game:null;this.setup=null;this.state=null;this.draftHero=null;this.lobby=true;this.modal=null;this.paused=false;this.reset();this.render();return}
    if(action==='pause'){this.paused=!this.paused;this.render();return}
    if(action==='pace'){this.pace=this.pace===650?250:this.pace===250?1100:650;this.savePreferences();this.render();return}
    if(!this.state||this.paused||this.auto||this.transfer||this.draws.length||this.state.pending?.kind==='reveal'||this.modal&&!(this.modal.kind==='hand'&&action==='card'))return
    const view=playerView(this.state,0),own=view.players[0]
    if(action==='star-move'&&view.pending?.kind==='guanxing'&&view.pending.actor===0){
      const pool=view.legal.find(a=>a.type==='arrange').pool
      if(!this.star||this.star.id!==view.pending.id)this.star={id:view.pending.id,top:pool.map(c=>c.id),bottom:[]}
      const from=this.star.top.includes(id)?'top':'bottom',to=from==='top'?'bottom':'top';this.star[from]=this.star[from].filter(x=>x!==id);this.star[to].push(id);this.render();return
    }
    if(action==='choice-zone'&&view.pending?.kind==='take'&&view.pending.actor===0){this.choiceZone=value;this.render();return}
    if(action==='take-choice'&&view.pending?.kind==='take'&&view.pending.actor===0){const index=Number(value);if(view.legal[index]?.type==='choose'){this.choiceIndex=index;this.render()}return}
    if(action==='choose-confirm'&&view.pending?.kind==='take'&&view.pending.actor===0){const choice=view.legal[this.choiceIndex];if(choice?.type==='choose')this.act(choice);return}
    if(action==='card'){
      if(view.pending?.kind==='yiji'&&view.pending.actor===0&&!view.legal.some(a=>a.type==='give'&&a.ids.includes(id))){this.inform('只能分配本次传道获得的牌');return}
      const available=view.pending?view.pending.actor===0:view.current===0&&view.phase==='play'
      if(!available){this.modal={kind:'card-detail',id};this.render();return}
      if(this.selected.includes(id))this.selected=this.selected.filter(c=>c!==id)
      else{
        const equipped=Object.values(own.equip).some(c=>c?.id===id)
        if(equipped&&this.skill!=='zhiheng'&&!view.legal.some(a=>a.ids?.includes(id))){this.modal={kind:'card-detail',id};this.render();return}
        const spear=own.equip.weapon?.type==='spear'&&(!view.pending||view.pending.as==='sha'),multi=['zhiheng','rende','jieyin'].includes(this.skill)||['discard','axe','yiji'].includes(view.pending?.kind)
        this.selected=multi?this.selected.concat(id):spear&&this.selected.length<2?this.selected.concat(id):[id]
      }
      this.targets=[];this.as=null;this.render();return
    }
    if(action==='target'){
      const t=Number(value)
      if(!this.targetable(view).includes(t)&&!this.targets.includes(t)){this.modal={kind:'hero-detail',id:display(view.players[t]).id};this.render();return}
      const multi=view.pending?.kind==='tuxi'||this.skill==='lijian'||!this.skill&&this.currentAs(view)==='sha'&&this.matching(view).some(a=>a.targets.length>1)
      if(!this.skill&&this.currentAs(view)==='collateral')this.targets=collateralSelection(this.targets,t)
      else if(this.targets.includes(t))this.targets=this.targets.filter(x=>x!==t)
      else this.targets=multi?((view.pending?.kind==='tuxi'||this.skill==='lijian')&&this.targets.length>=2?this.targets.slice(1).concat(t):this.targets.concat(t)):[t]
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
  header(){const label=this.lobby?'准备大厅':this.setup?(setupView(this.setup,0).teamMode?'选将':'身份选将'):(this.state?.teamMode?'两军对垒':'经典身份');return `<header class="fs-header"><div class="fs-brand">众神<span>斗法</span><small>内部原型 / ${label}</small></div>${renderToolbar({lobby:this.lobby,setup:this.setup,paused:this.paused,voice:this.voice.enabled,music:this.music.enabled})}</header>`}
  renderLobby(){return renderHome(this)}
  equipment(p,own=false){return Object.entries(p.equip).filter(([,c])=>c).map(([slot,c])=>`<button class="fs-equip ${this.selected.includes(c.id)?'selected':''}" data-action="${own?'card':'card-detail'}" data-id="${c.id}" aria-label="${{weapon:'武器',armor:'防具',offenseHorse:'进攻坐骑',defenseHorse:'防御坐骑'}[slot]}：${CARDS_BY_TYPE[c.type].name}" title="${esc(displayText(CARDS_BY_TYPE[c.type].help))}"><img src="${CARDS_BY_TYPE[c.type].image}" alt="" loading="lazy"><span>${CARDS_BY_TYPE[c.type].name}</span><small>${CARDS_BY_TYPE[c.type].range?'距'+CARDS_BY_TYPE[c.type].range:CARDS_BY_TYPE[c.type].slot==='offenseHorse'?'−1':CARDS_BY_TYPE[c.type].slot==='defenseHorse'?'+1':'防'}</small></button>`).join('')||'<small class="fs-no-equip">法宝栏为空</small>'}
  skills(p,view){const h=display(p);return Object.keys(h.skillNames).filter(s=>SKILLS[s][2]!=='lord'||(!view.teamMode&&p.role==='lord')).map(s=>{const active=p.seat===0&&view.legal.some(a=>a.type==='skill'&&a.skill===s);return `<button data-action="${active?'skill':'hero-detail'}" data-value="${s}" data-id="${h.id}" class="fs-skill ${this.skill===s&&p.seat===0?'selected':''}"><b>${h.skillNames[s]}</b><small>${active?'发动':catalog.automaticSkills.includes(s)?'自动':{lord:'主公技',locked:'锁定',convert:'转化',trigger:'触发'}[SKILLS[s][2]]||'技能'}</small></button>`}).join('')}
  opponent(p,view){return renderOpponent(this,p,view)}
  pendingText(view){const p=view.pending;if(!p)return '';const source=p.source==null?'法术':display(view.players[p.source]).name,target=p.target==null?'目标':display(view.players[p.target]).name;return {
    response:combatContext(view)?.hint||`${source} → ${target}：请打出${p.remaining>1?p.remaining+' 张':''}${CARDS_BY_TYPE[p.as]?.name||''}`,
    rescue:`${target}濒死：是否使用仙桃救援？`,counter:`${p.negated?'反制破法':'使用破法'}：${CARDS_BY_TYPE[p.cardType]?.name||''} → ${target}`,
    guanxing:'推演：排列牌顶与牌底，然后确认',liuli:'移劫：弃一张牌，选择转移目标',yiji:'传道：分配本次获得的牌，或保留',tuxi:'地行：选择一至两名角色，或正常摸牌','judge-replace':'天眼：用一张手牌改判，或放弃',
    discard:`弃牌：请选 ${p.count} 张手牌`,guess:`${skillName(view.players[p.actor]?.heroId,'fanjian')}：猜测花色`,pick:'仙山采宝：选择一张牌',take:`选择${target}的一张牌`,axe:'番天印：弃两张牌，令杀命中',blade:'打神鞭：是否再出一张杀？',support:`${p.requester==null?'主公':display(view.players[p.requester]).name}请求${CARDS_BY_TYPE[p.as]?.name||''}援助`,choice:`${SKILLS[p.skill]?skillName(view.players[p.actor]?.heroId,p.skill):displayText({dualsword:'阴阳双剑',dualTarget:'阴阳双剑',ice:'乾坤圈',bow:'五色神光'}[p.skill]||'法宝')}：请选择`,
  }[p.kind]||'等待响应'}
  renderActions(view){return renderControls(this,view)}
  won(){const s=this.state;if(s.teamMode)return s.winner===String(s.sides[0]);const role=s.players[0].role;return role===s.winner||role==='loyal'&&s.winner==='lord'}
  renderGame(){return renderBattle(this)}
  modalContent(){
    if(!this.modal)return ''
    const {kind,id}=this.modal;let title='',body=''
    // 牌桌「菜单」收纳（英雄杀式）：不常用功能全部收进这里，顶栏只留菜单按钮。
    if(kind==='menu'){title='菜单';body=renderMenu({inGame:!!this.state,paused:this.paused,voice:this.voice.enabled,music:this.music.enabled,hints:this.hints!==false,pace:this.pace===250?'快':this.pace===1100?'慢':'标准',auto:this.auto})}
    if(kind==='heroes'){title='人物图鉴 · 不用于自由选将';body=heroGallery()}
    if(kind==='hand'&&this.state){const v=playerView(this.state,0);title='展开手牌 · '+v.players[0].hand.length+' 张';body=`<p>点击选牌，选中后点“完成选择”回到牌桌确认。这里不会自动出牌。</p><div class="fs-expanded-hand">${v.players[0].hand.map(c=>`<button data-action="card" data-id="${c.id}" class="${this.selected.includes(c.id)?'selected':''}" aria-label="${CARDS_BY_TYPE[c.type].baseName} ${SUITS[c.suit]}${c.rank}" aria-pressed="${this.selected.includes(c.id)}">${cardFace(c)}</button>`).join('')}</div><button data-action="close" class="fs-primary fs-hand-done">完成选择${this.selected.length?' · '+this.selected.length+' 张':''}</button>`}
    if(kind==='identity'&&this.setup){const r=ROLES[setupView(this.setup,0).role];title='你的身份：'+r.name;body=`<h3>${r.name}的胜利条件</h3><p>${r.goal}。</p><p>身份已随机分配且锁定，主公先选将，再由其他玩家选将。</p>`}
    if(kind==='identity'&&this.state){const v=playerView(this.state,0),p=v.players[0]
      if(v.teamMode){const ally=v.sides[0]===0;title='你的阵营';body=`<section class="fs-identity-help"><strong class="fs-identity ${ally?'role-ally':'role-enemy'}">${ally?'友方':'敌方'}</strong><h3>胜利条件</h3><p>消灭敌方全部角色即获胜；我方全部阵亡则失败。</p><p>座位穿插：你之后依次是敌方、队友、敌方循环。开局掷骰，点数最高者先手。</p></section>`}
      else{const r=ROLES[p.role];title='你的身份：'+r.name;body=`<section class="fs-identity-help"><strong class="fs-identity role-${p.role}">${r.name}</strong><h3>你的胜利条件</h3><p>${r.goal}。</p><p>${p.alive?'其他玩家不能看到你的身份，主公除外。':'你已阵亡，身份已公开；仍可在牌桌观看结算。'}</p></section>`}}
    if(kind==='hero-detail'){const h=HERO_BY_THEME_ID[id];title=h.name+' · '+h.title;body=`<div class="fs-hero-detail">${portrait(h,'',true)}<div><span>${FACTIONS[h.faction]} · ${ALLIANCE_NAMES[h.mechanicalFaction]} · ${h.hp}基础体力 · ${h.sex==='female'?'女性':'男性'}</span><p>完整原型：${esc(h.referenceName)} · ${esc(h.sourcePack)} · 经典原版</p><p>${h.playable?'技能已接入，可在单机局使用':'完整技能尚未接入；人物仅供形象与映射评审'}</p></div></div>${Object.entries(h.skillNames).map(([s,n])=>`<section><h3>${n}<small>${SKILLS[s]?{active:'主动',locked:'锁定',lord:'主公技',trigger:'触发',convert:'转化'}[SKILLS[s][2]]||'技能':'待开发'}</small></h3><p>${SKILLS[s]?esc(skillHelp(h,s)):'映射已记录，当前引擎尚无 '+s+' 完整实现。'}</p></section>`).join('')}`}
    if(kind==='card-detail'){const c=catalog.makeDeck().find(c=>c.id===id)||catalog.makeDeck().find(c=>c.type===id),d=c&&CARDS_BY_TYPE[c.type];title=d?.name||'卡牌';body=d?`<div class="fs-card-detail">${cardFace(c)}<div><b>${{basic:'基本牌',trick:'即时法术',delay:'延时阵法',equip:'法宝'}[d.category]}</b><p>${esc(displayText(d.help))}</p><small>测试基准：${d.baseName} · 共 ${catalog.makeDeck().filter(c=>c.type===d.type).length} 张</small></div></div>`:''}
    if(kind==='gallery'){title='法宝与卡牌图鉴';body=`<p>经典标准 108 张牌池 · 53 基本 / 36 锦囊 / 19 装备。旧混搭存档保留在原存储位置，不直接加载到新规则。仅更换表现层，花色、点数、数量与距离不变。</p><div class="fs-gallery">${Object.values(CARDS_BY_TYPE).map(d=>`<button data-action="card-detail" data-id="${d.type}">${cardFace(catalog.makeDeck().find(c=>c.type===d.type))}</button>`).join('')}</div><section><h3>扩展法宝 · 未加入当前牌堆</h3><p>${PLANNED_EQUIPMENT.map(d=>d.name).join('、')}已制作素材或规则草稿；完整军争包尚未核定，暂不进入经典标准牌池。</p></section>`}
    if(kind==='report'){title=this.state?.winner?(playerView(this.state,0).teamMode?'终局 · 胜负一览':'终局 · 身份揭晓'):'战场记录';if(this.state){const v=playerView(this.state,0);body=`${v.winner?`<div class="fs-role-reveal">${v.players.map(p=>`<span>${display(p).name}<b>${v.teamMode?(v.sides[p.seat]===v.sides[v.seat]?'友方':'敌方'):ROLES[p.role].name}</b></span>`).join('')}</div>`:''}<ol class="fs-report">${v.logs.map(l=>`<li>${esc(displayText(l.text))}</li>`).join('')}</ol>`}}
    if(kind==='new'){title='返回准备大厅？';body='<p>当前牌局或选将进度已保存。你可以继续上次进度，也可以新开身份局重新随机分配身份。</p><button data-action="new-confirm" class="fs-primary">返回准备大厅</button>'}
    if(kind==='rules'){title='众神身份局 · 试玩规则';body=`<section><h3>身份不变</h3>${Object.values(ROLES).map(r=>`<p><b>${r.name}</b>：${r.goal}。</p>`).join('')}<p>五人身份局：1主1忠2反1内；八人身份局：1主2忠4反1内。主公额外一点体力；只公开主公，其他角色阵亡或终局才亮身份。1v1／2v2／3v3为本项目简化队伍对抗，不是官方竞技模式：全员先选将、掷骰定先手，按席位轮转。没有身份主公加血与主公技。联机尚未接入。</p></section><section><h3>操作与回合</h3><p>主公先行，按席位循环。准备 → 判定 → 摸牌 → 出牌 → 弃牌 → 结束。通常摸两张牌，出牌阶段限一次杀；风火与火尖枪可以解除次数限制。弃牌到当前体力值。</p><p>先选牌，再点亮目标，最后确认出牌。响应时选牌后确认，或主动放弃。两张闪按提示分次打出。混天绫选择两张手牌；借宝诛敌先选持武器者，再选被攻击者。转化牌显示“当杀 / 当闪”，须确认其用途。</p></section><section><h3>主公技与阵营适配</h3><p>机械同盟严格对应原版：青盟=蜀、赤盟=魏、金盟=吴、玄盟=群。神话势力只负责人物背景，不改变主公技响应阵营。每个人物绑定完整原武将技能组，不混搭。</p><p>龙吉公主替代慈航道人对应小乔，保留女性判定语义；阴阳双剑等性别相关装备仍按明确的人物性别结算。</p></section><section><h3>当前完成边界</h3><p>${HEROES.length} 人主题图鉴，${PLAYABLE_HEROES.length} 人完整原武将技能可用，${Object.keys(CARDS_BY_TYPE).length}类插画卡牌，108张物理牌。尚未实现完整原型技能的人物只能看图鉴，不进入选将。AI 只接收玩家视图，不能读取隐藏手牌和身份。</p><p>没有灵蕴、神位积分或封神争榜。不新增法宝冷却与耐久。这是免费的单机试玩版，不代表商业版或完成原创性审核。</p></section>`}
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
    morph(this.root,(this.lobby?this.renderLobby():this.setup?renderSetup(this):this.renderGame())+this.modalContent()+(this.toast?`<div class="fs-toast" role="status">${esc(this.toast)}</div>`:''))
    if(this.modal&&!this.lobby&&(this.state||this.setup)){
      const role=this.setup?setupView(this.setup,0).role:this.state.players[0].role
      this.root.querySelector('.fs-modal header>small').textContent+=' · 你的身份：'+ROLES[role].name
      if(this.modal.kind==='hero-detail'&&this.state){
        const p=playerView(this.state,0).players.find(p=>display(p).id===this.modal.id)
        if(p){const info=document.createElement('p');info.className='fs-role-detail';info.textContent=`本局身份：${p.role?ROLES[p.role].name:'隐藏'}${!p.alive?' · 已阵亡，身份已公开':''}`;this.root.querySelector('.fs-modal-body').prepend(info)}
      }
    }
    // 大厅主视觉与详情大图在渲染时直接出原图（见 renderHome/modalContent 的 full=true）。
    if(RELEASE){const label=this.root.querySelector('.fs-brand>small');if(label)label.textContent=label.textContent.replace('内部原型','单机试玩');if(this.modal?.kind==='rules'){const body=this.root.querySelector('.fs-modal-body');if(body)body.innerHTML=body.innerHTML.replace('此为本机内部原型，不代表商业发行或完成原创性审核。','当前为免费单机试玩版，部分人物技能仍在开发；名称、主题与玩法仍需在商业发行前另行审核。')}}
    layoutHand(this.root)
    for(const [key,v]of Object.entries(scrolls)){const e=this.root.querySelector(`[data-scroll="${key}"]`);if(e){e.scrollLeft=v.left;e.scrollTop=v.top}}
    this.root.querySelector('.fs-hand-card.selected .fs-card-face')?.scrollIntoView({block:'nearest',inline:'nearest'});this.decorateBattle()
    const ownIds=this.draws.flatMap(d=>d.ownIds)
    for(const id of ownIds)this.root.querySelector(`.fs-hand-card[data-id="${id}"]`)?.classList.add('fs-newly-drawn')
    if(ownIds.length)this.root.querySelector(`.fs-hand-card[data-id="${ownIds.at(-1)}"] .fs-card-face`)?.scrollIntoView({block:'nearest',inline:'nearest'})
    if(this.transfer||this.draws.length||this.state?.pending?.kind==='reveal')this.root.querySelector('.fs-dock')?.setAttribute('inert','')
    if(this.modal){this.root.querySelectorAll('.fs-header,.fs-lobby,.fs-entry,.fs-setup,.fs-hud,.fs-arena,.fs-status,.fs-dock').forEach(e=>e.inert=true);this.root.querySelector('[data-action="close"]')?.focus()}
    else if(wasModal&&this.returnFocus?.action){const s=`[data-action="${this.returnFocus.action}"]${this.returnFocus.id?`[data-id="${this.returnFocus.id}"]`:''}`;this.root.querySelector(s)?.focus()}
    scaleCards(this.root);this.schedule()
  }
  destroy(){this.destroyed=true;this.voice.destroy();this.music.destroy();this.clearEffects();clearInterval(this.clockTimer);clearTimeout(this.timer);clearTimeout(this.toastTimer);this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('keydown',this.onKey);document.removeEventListener('fullscreenchange',this.onScreen);document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('resize',this.onViewport);window.visualViewport?.removeEventListener('resize',this.onViewport);window.visualViewport?.removeEventListener('scroll',this.onViewport)}
}
window.__fengshenUI=new FengshenUI(document.getElementById('app'))
window.__fengshenTheme={version:THEME_VERSION,heroes:HEROES,cards:CARDS_BY_TYPE}
