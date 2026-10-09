import { HEROES, HERO_BY_ID, SKILLS, CARDS, FACTIONS, ROLES, SUITS, rankName, isRed, makeDeck } from './catalog.mjs'
import { createGame, dispatch, playerView, restoreGame } from './engine.mjs'
import { chooseAI } from './ai.mjs'
import '../../styles/sanguo.css'

const SAVE='vectorac.sanguo.save.v1', PREFS='vectorac.sanguo.prefs.v1', STATS='vectorac.sanguo.stats.v1'
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const idsEqual=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id))
const heroName=p=>HERO_BY_ID[p.heroId].name
const factionColor={shu:'#397866',wei:'#516b98',wu:'#a85d48',qun:'#847099'}
const load=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback}catch{return fallback}}
const store=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}}

// Original vector medallions: twelve silhouettes, no third-party character art.
function portrait(hero,scope) {
  const id=`sg-${scope}-${hero.id}`,color=factionColor[hero.faction],female=hero.sex==='female'
  const helmet=['zhaoyun','machao','huanggai','lvbu'].includes(hero.id)
  const beard=['guanyu','zhangfei','liubei','caocao','huanggai'].includes(hero.id)
  const silver=['zhaoyun','huanggai'].includes(hero.id),face=female?'#eac7ad':'#d7ac88'
  const hats={guanyu:'M24 39Q24 10 50 12Q76 10 76 39L64 27H37Z',zhangfei:'M20 35Q23 11 50 11Q77 11 80 35L72 23L62 29L43 21L27 36Z',liubei:'M25 33L32 16L43 12L45 3H57L59 16L70 20L75 33Z',caocao:'M24 32L26 14H40L42 3H58L60 14H74L76 32Z',sunquan:'M23 35L22 13L35 20L49 4L64 20L77 13L76 35Z',zhouyu:'M23 33Q26 11 50 11Q77 11 78 37L67 26H37Z',xuchu:'M24 39Q21 13 50 14Q78 14 77 41L67 31L57 33L43 28L30 40Z',huangyueying:'M21 42Q18 13 50 11Q82 14 79 45L68 24L43 28L25 44Z'}
  const head=helmet?`<path d="M22 40Q22 11 50 9Q80 12 78 40L65 31L50 18L36 32Z" fill="${silver?'#d2d9d6':'#b8a269'}" stroke="#413c31"/><path d="M47 10L51 3L54 11V27H47Z" fill="#dfc58d"/>`: `<path d="${hats[hero.id]}" fill="${hero.id==='guanyu'?'#294c3c':'#282b2c'}"/>`
  const plumes=hero.id==='lvbu'?'<path d="M35 20Q2-2 20-10M64 20Q103-2 83-10" stroke="#b85551" stroke-width="6" fill="none"/>':hero.id==='machao'?'<path d="M53 11Q82-9 72-18" stroke="#d7d1b8" stroke-width="7" fill="none"/>':''
  return `<svg class="sg-portrait" viewBox="0 0 100 112" role="img" aria-label="${hero.name}原创徽像"><defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#182c29"/></linearGradient></defs><rect width="100" height="112" rx="12" fill="url(#${id})"/><circle cx="50" cy="43" r="38" fill="none" stroke="#cfb98a" opacity=".24"/><path d="M10 112L15 91Q22 74 41 72H60Q84 76 89 94L93 112Z" fill="${silver?'#909d9e':color}"/><path d="M28 82L49 108L73 81L61 73H39Z" fill="#d4bd91" opacity=".7"/><path d="M37 70V84L50 94L63 82V69Z" fill="${face}"/><ellipse cx="50" cy="48" rx="${female?21:23}" ry="30" fill="${face}"/><path d="M30 45L43 42M57 42L70 45" stroke="#433128" stroke-width="${hero.id==='zhangfei'?4:2.5}"/><path d="M34 49H41M59 49H66" stroke="#272a2a" stroke-width="2.6"/><path d="M48 49L45 60H51" stroke="#a8795c" fill="none"/><path d="M42 68Q50 72 58 68" stroke="#965e4b" fill="none"/>${beard?`<path d="M30 59Q36 71 50 66Q63 71 70 59L66 80L50 ${hero.id==='guanyu'?106:hero.id==='zhangfei'?88:96}L35 80Z" fill="${hero.id==='huanggai'?'#d6d1bf':'#272b2a'}"/><path d="M37 62L47 65M53 65L64 62" stroke="#1b2422" stroke-width="3"/>`:''}${head}${plumes}<path d="M15 93L32 101M69 101L88 93" stroke="#decb96" opacity=".55"/><text x="85" y="103" text-anchor="end" fill="#e3cea0" font-size="16" font-family="serif">${hero.emblem}</text></svg>`
}
function cardFace(card,extra='') {
  const def=CARDS[card.type]
  return `<span class="sg-card-face category-${def.category} type-${card.type} ${isRed(card)?'red-suit':''} ${extra}"><span class="sg-card-rank">${rankName(card.rank)}<i>${SUITS[card.suit]}</i></span><span class="sg-card-category">${{basic:'基本',trick:'锦囊',delay:'判定',equip:'装备'}[def.category]}</span><span class="sg-card-symbol">${def.symbol}</span><strong class="sg-card-name">${def.name}</strong><span class="sg-card-bottom">${SUITS[card.suit]} ${rankName(card.rank)}</span></span>`
}
function hpMarkup(p) { return `<span class="sg-hp" aria-label="体力 ${p.hp} / ${p.maxHp}">${Array.from({length:p.maxHp},(_,i)=>`<i class="${i<p.hp?'full':''}">◆</i>`).join('')}<b>${p.hp}/${p.maxHp}</b></span>` }

export default class SanguoUI {
  constructor(root) {
    this.root=root;this.destroyed=false;this.state=null;this.selected=[];this.targets=[];this.skill=null;this.as=null;this.modal=null;this.paused=false;this.lobby=true;this.heroId='guanyu';this.role='random';this.timer=null;this.toast='';this.noticeTimer=null;this.recorded=false
    const prefs=load(PREFS,{pace:650,sound:true});this.pace=[250,650,1100].includes(prefs.pace)?prefs.pace:650;this.sound=prefs.sound!==false
    this.stats=load(STATS,{games:0,wins:0});this.saved=load(SAVE,null);this.resumeState=this.saved&&restoreGame(this.saved.state||this.saved)
    this.placeholder=document.createComment('sanguo-placeholder');root.parentNode.insertBefore(this.placeholder,root);document.body.appendChild(root)
    this.overflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.classList.add('sg-page-active');root.className='sg-app'
    this.onClick=e=>this.click(e);this.onKey=e=>{
      if(!this.modal)return
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.modal=null;this.render()}
      if(e.key==='Tab'){const list=[...this.root.querySelectorAll('.sg-modal button:not(:disabled),.sg-modal a[href]')],last=list[list.length-1];if(list.length&&(e.shiftKey&&document.activeElement===list[0]||!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:list[0]).focus()}}
    }
    this.onVisibility=()=>{clearTimeout(this.timer);if(!document.hidden)this.schedule()}
    root.addEventListener('click',this.onClick);root.addEventListener('keydown',this.onKey);document.addEventListener('visibilitychange',this.onVisibility)
    this.render()
  }
  soundEffect(kind) {
    if(!this.sound)return
    try {
      if(!this.audio){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;this.audio=new Audio()}
      if(this.audio.state==='suspended')this.audio.resume().catch(()=>{})
      const t=this.audio.currentTime,o=this.audio.createOscillator(),g=this.audio.createGain();o.connect(g);g.connect(this.audio.destination);o.type='triangle';o.frequency.setValueAtTime(kind==='damage'?115:kind==='select'?500:320,t);o.frequency.exponentialRampToValueAtTime(kind==='damage'?50:180,t+.12);g.gain.setValueAtTime(.05,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);o.start(t);o.stop(t+.17);o.onended=()=>{o.disconnect();g.disconnect()}
    } catch {}
  }
  inform(message) {this.toast=message;clearTimeout(this.noticeTimer);this.noticeTimer=setTimeout(()=>{this.toast='';if(!this.destroyed)this.render()},2600);this.render()}
  preferences(){store(PREFS,{pace:this.pace,sound:this.sound})}
  save() {
    if(!this.state)return
    if(this.state.winner&&!this.recorded){const role=this.state.players[0].role;this.stats.games++;if(role===this.state.winner||role==='loyal'&&this.state.winner==='lord')this.stats.wins++;this.recorded=true;store(STATS,this.stats)}
    this.saved={state:this.state,recorded:this.recorded};this.resumeState=this.state;store(SAVE,this.saved)
  }
  start() {clearTimeout(this.timer);this.state=createGame({heroId:this.heroId,role:this.role});this.lobby=false;this.paused=false;this.recorded=false;this.resetSelection();this.save();this.render()}
  resume() {if(!this.resumeState)return;this.state=restoreGame(this.resumeState);if(!this.state)return;this.lobby=false;this.paused=false;this.recorded=!!this.saved?.recorded;this.resetSelection();this.render()}
  resetSelection(){this.selected=[];this.targets=[];this.skill=null;this.as=null}
  act(action) {
    if(!this.state)return false
    const result=dispatch(this.state,{...action,seat:action.seat??0,revision:this.state.revision,promptId:this.state.pending?.id})
    if(!result.ok){this.inform(result.error);return false}
    this.state=result.state;this.resetSelection();this.soundEffect(this.state.lastEvent?.label==='伤害'?'damage':'play');this.save();this.render();return true
  }
  schedule() {
    clearTimeout(this.timer)
    if(this.destroyed||this.lobby||this.paused||this.modal||document.hidden||!this.state||this.state.phase==='finished')return
    const feedback=document.getElementById('game-feedback-modal')
    if(feedback&&!feedback.hidden){this.timer=setTimeout(()=>this.schedule(),400);return}
    const seat=this.state.pending?.actor??this.state.current
    if(seat===0)return
    const revision=this.state.revision
    this.timer=setTimeout(()=>{
      if(this.destroyed||!this.state||this.state.revision!==revision||document.hidden)return
      const feedback=document.getElementById('game-feedback-modal')
      if(feedback&&!feedback.hidden){this.schedule();return}
      const action=chooseAI(playerView(this.state,seat))
      if(action&&!this.act(action)){this.paused=true;console.error('[三国逐鹿] AI 动作失败',action);this.inform('对局已暂停，请重新开局或查看战报')}
    },this.pace)
  }
  matching(view) {return view.legal.filter(action=>action.type==='play'&&idsEqual(action.ids,this.selected))}
  currentAs(view) {const choices=this.matching(view);return this.as||choices.find(a=>a.as===view.players[0].hand.find(c=>c.id===this.selected[0])?.type)?.as||choices[0]?.as}
  targetable(view) {
    if(this.skill==='rende'||this.skill==='fanjian')return view.players.filter(p=>p.alive&&p.seat!==0).map(p=>p.seat)
    if(this.skill==='jijiang')return view.legal.filter(a=>a.type==='skill'&&a.skill==='jijiang').map(a=>a.target)
    const as=this.currentAs(view),choices=this.matching(view).filter(a=>a.as===as)
    if(as==='collateral')return [...new Set(choices.filter(a=>!this.targets.length||a.targets[0]===this.targets[0]).map(a=>a.targets[this.targets.length?1:0]))]
    return [...new Set(choices.filter(a=>this.targets.every(t=>a.targets.includes(t))).flatMap(a=>a.targets))]
  }
  confirm() {
    const view=playerView(this.state,0),pending=view.pending
    if(pending?.actor===0) {
      if(pending.kind==='discard')return this.act({type:'discard',ids:this.selected})
      const option=view.legal.find(a=>a.type==='respond'&&idsEqual(a.ids,this.selected))
      if(option)return this.act(option)
      return this.inform('请选择提示中可以使用的牌')
    }
    if(this.skill)return this.act({type:'skill',skill:this.skill,ids:this.selected,target:this.targets[0]})
    const as=this.currentAs(view),choice=this.matching(view).find(a=>a.as===as&&a.targets.length===this.targets.length&&a.targets.every((t,i)=>as==='collateral'?t===this.targets[i]:this.targets.includes(t)))
    if(choice)this.act(choice);else this.inform('先选手牌，再点亮目标，最后确认出牌')
  }
  click(event) {
    const button=event.target.closest('[data-sg]');if(!button||!this.root.contains(button)||button.disabled)return
    const command=button.dataset.sg,id=button.dataset.id,value=button.dataset.value
    if(command==='hero'){this.heroId=id;this.render();return}
    if(command==='role'){this.role=value;this.render();return}
    if(command==='start'){this.start();return}
    if(command==='resume'){this.resume();return}
    if(command==='close'){this.modal=null;this.render();return}
    if(command==='rules'||command==='catalog'||command==='report'){this.modal={kind:command};this.render();return}
    if(command==='detail'){this.modal={kind:'hero',id};this.render();return}
    if(command==='new'){this.modal={kind:'new'};this.render();return}
    if(command==='new-confirm'){this.modal=null;this.lobby=true;this.paused=false;this.resetSelection();this.render();return}
    if(command==='pause'){this.paused=!this.paused;this.render();return}
    if(command==='pace'){this.pace=this.pace===650?250:this.pace===250?1100:650;this.preferences();this.render();return}
    if(command==='sound'){this.sound=!this.sound;this.preferences();this.render();return}
    if(command==='card-info'){this.modal={kind:'card',id};this.render();return}
    if(!this.state||this.paused)return
    const view=playerView(this.state,0),own=view.players[0]
    if(command==='card') {
      const available=(view.pending?view.pending.actor===0:view.current===0&&view.phase==='play')&&!this.paused
      if(!available){this.modal={kind:'card',id};this.render();return}
      if(this.selected.includes(id))this.selected=this.selected.filter(c=>c!==id)
      else {
        const equipped=Object.values(own.equip).some(c=>c?.id===id)
        if(equipped&&this.skill!=='zhiheng'&&!view.legal.some(a=>a.ids?.includes(id))){this.modal={kind:'card',id};this.render();return}
        const spear=own.equip.weapon?.type==='spear'&&(!view.pending||view.pending.as==='sha')
        const multi=this.skill==='zhiheng'||this.skill==='rende'||view.pending?.kind==='discard'||view.pending?.kind==='axe'
        this.selected=multi?this.selected.concat(id):spear&&this.selected.length<2?this.selected.concat(id):[id]
      }
      this.targets=[];this.as=null;this.soundEffect('select');this.render();return
    }
    if(command==='target') {
      const target=Number(value)
      if(!this.targetable(view).includes(target)&&!this.targets.includes(target)){this.modal={kind:'hero',id:view.players[target].heroId};this.render();return}
      const multiple=!this.skill&&this.currentAs(view)==='sha'&&this.matching(view).some(a=>a.targets.length>1)
      if(this.targets.includes(target))this.targets=this.targets.filter(t=>t!==target)
      else if(!this.skill&&this.currentAs(view)==='collateral')this.targets=this.targets.length===1?[this.targets[0],target]:[target]
      else this.targets=multiple?this.targets.concat(target):[target]
      this.render();return
    }
    if(command==='skill'){this.resetSelection();this.skill=value;this.render();return}
    if(command==='as'){this.as=value;this.targets=[];this.render();return}
    if(command==='confirm'){this.confirm();return}
    if(command==='clear'){this.resetSelection();this.render();return}
    if(command==='end'){this.act({type:'end'});return}
    if(command==='response'){const index=Number(value),option=view.legal[index];if(option)this.act(option);return}
  }
  skillButtons(view) {
    const p=view.players[0],h=HERO_BY_ID[p.heroId]
    return h.skills.filter(id=>SKILLS[id][2]!=='lord'||p.role==='lord').map(id=>{
      const actionable=view.legal.some(a=>a.type==='skill'&&a.skill===id),active=this.skill===id
      return `<button data-sg="${actionable?'skill':'detail'}" data-id="${h.id}" data-value="${id}" class="sg-skill ${active?'selected':''}" title="${esc(SKILLS[id][1])}"><b>${SKILLS[id][0]}</b><small>${active?'选牌 / 目标':actionable?'点击发动':{locked:'锁定',convert:'转化',trigger:'触发',lord:'主公技'}[SKILLS[id][2]]||'技能'}</small></button>`
    }).join('')
  }
  pendingText(view) {
    const p=view.pending;if(!p)return ''
    const source=p.source==null?'锦囊':heroName(view.players[p.source]),target=p.target==null?'目标':heroName(view.players[p.target])
    if(p.kind==='response')return `响应${source}：请打出${p.remaining>1?p.remaining+' 张':''}${CARDS[p.as].name}`
    if(p.kind==='rescue')return `${target}濒死：是否使用桃救援？`
    if(p.kind==='counter')return `${p.negated?'反制无懈':'使用无懈'}：${CARDS[p.cardType].name} → ${target}`
    if(p.kind==='discard')return `弃牌阶段：选择 ${p.count} 张手牌`
    if(p.kind==='guess')return '反间：请选择你猜测的花色'
    if(p.kind==='pick')return '五谷丰登：选择一张牌加入手牌'
    if(p.kind==='take')return `选择${target}的一张牌`
    if(p.kind==='axe')return '贯石斧：弃两张牌，使杀仍造成伤害'
    if(p.kind==='blade')return '青龙刀：是否对原目标再出一张杀？'
    if(p.kind==='support')return `${heroName(view.players[p.requester])}请求援助：提供${CARDS[p.as].name}？`
    if(p.kind==='choice')return `${SKILLS[p.skill]?.[0]||{dualsword:'雌雄双股剑',dualTarget:'雌雄双股剑',ice:'寒冰剑',bow:'麒麟弓'}[p.skill]}：请选择`
    return '等待响应'
  }
  equipment(p,selectable=false) {
    const items=Object.entries(p.equip).filter(([,c])=>c)
    return items.length?items.map(([slot,c])=>`<button class="sg-equip ${this.selected.includes(c.id)?'selected':''}" data-sg="${selectable?'card':'card-info'}" data-id="${c.id}" title="${esc(CARDS[c.type].help)}"><span>${CARDS[c.type].symbol}</span>${CARDS[c.type].name}<i>${slot==='weapon'?'距'+CARDS[c.type].range:slot==='offenseHorse'?'−1':slot==='defenseHorse'?'+1':''}</i></button>`).join(''):'<span class="sg-no-equip">尚无装备</span>'
  }
  opponent(p,view,index) {
    const h=HERO_BY_ID[p.heroId],canTarget=this.targetable(view).includes(p.seat),selected=this.targets.includes(p.seat),active=view.current===p.seat&&view.phase!=='finished',acting=view.pending?.actor===p.seat
    return `<article class="sg-player faction-${h.faction} ${!p.alive?'fallen':''} ${canTarget?'targetable':''} ${selected?'target-selected':''} ${active?'turn-active':''}" data-player="${p.seat}" style="--faction:${factionColor[h.faction]}"><button class="sg-player-main" data-sg="target" data-value="${p.seat}" aria-label="${canTarget?'选择目标':'查看武将'} ${h.name}" ${!p.alive?'disabled':''}>${portrait(h,'seat'+p.seat)}<span class="sg-player-summary"><span class="sg-seat-label">${index+1}号席 ${acting?'· 响应中':active?'· 回合中':''}</span><strong>${h.name}<i>${FACTIONS[h.faction]}</i></strong>${hpMarkup(p)}<span class="sg-hand-count">▣ ${p.handCount} 张手牌</span></span><span class="sg-role ${p.role?'role-'+p.role:''}">${p.role?ROLES[p.role].name:'身份未明'}</span>${selected?'<span class="sg-target-mark">已选</span>':''}</button><div class="sg-player-skills">${h.skills.filter(id=>SKILLS[id][2]!=='lord'||p.role==='lord').map(id=>`<button data-sg="detail" data-id="${h.id}">${SKILLS[id][0]}</button>`).join('')}</div><div class="sg-opponent-equip">${this.equipment(p)}</div>${p.judgment.length?`<span class="sg-judgments">${p.judgment.map(c=>`<button data-sg="card-info" data-id="${c.id}">${CARDS[c.type].symbol} ${CARDS[c.type].name}</button>`).join('')}</span>`:''}</article>`
  }
  renderLobby() {
    const h=HERO_BY_ID[this.heroId]
    return `<div class="sg-lobby"><section class="sg-lobby-hero"><div class="sg-lobby-shade"></div><a href="/blogs/other/games.html" class="sg-back">← 游戏大厅</a><div class="sg-lobby-copy"><span>VECTORAC · STRATEGY CARDS</span><h1>三国<span>逐鹿</span></h1><p>藏锋于手，谋胜于局。</p><div class="sg-lobby-tags"><i>五人身份</i><i>十二名将</i><i>单机 AI</i></div></div></section><section class="sg-lobby-controls"><div><span class="sg-eyebrow">择一身份 · 可随机</span><div class="sg-role-options">${[{id:'random',name:'随机'},...Object.entries(ROLES).map(([id,r])=>({id,name:r.name}))].map(r=>`<button data-sg="role" data-value="${r.id}" aria-pressed="${this.role===r.id}" class="${this.role===r.id?'selected':''}">${r.name}</button>`).join('')}</div></div><button data-sg="rules" class="sg-text-btn">怎么玩 ↗</button></section><section class="sg-roster"><div class="sg-section-title"><span>点将台</span><small>选择你的武将 · 经典技能</small></div><div class="sg-hero-grid">${HEROES.map(hero=>`<button class="sg-hero-pick ${hero.id===this.heroId?'selected':''}" data-sg="hero" data-id="${hero.id}" aria-pressed="${hero.id===this.heroId}" style="--faction:${factionColor[hero.faction]}">${portrait(hero,'roster')}<span><i>${FACTIONS[hero.faction]} · ${hero.hp} 体力</i><strong>${hero.name}</strong><small>${hero.skills.map(id=>SKILLS[id][0]).join(' · ')}</small></span>${hero.id===this.heroId?'<b class="sg-picked">✓</b>':''}</button>`).join('')}</div></section><section class="sg-lobby-footer"><div class="sg-chosen-summary"><strong>${h.name} <span>${h.title}</span></strong><p>${h.skills.map(id=>`<b>${SKILLS[id][0]}</b> ${SKILLS[id][1]}`).join('　')}</p></div><div class="sg-lobby-start">${this.resumeState?`<button class="sg-secondary" data-sg="resume">${this.resumeState.phase==='finished'?'查看上局':'继续上次'}</button>`:''}<button class="sg-primary" data-sg="start">进入战局 <span>→</span></button></div><small class="sg-lobby-note">本地自动存档 · ${this.stats.games} 局 / ${this.stats.wins} 胜 · <button data-sg="catalog">查看全部卡牌</button></small></section></div>`
  }
  renderActions(view) {
    const pending=view.pending,human=pending?.actor===0,canPlay=!pending&&view.current===0&&view.phase==='play'
    if(human) {
      const direct=view.legal.map((a,i)=>({a,i})).filter(({a})=>['choose','pass','bagua','support'].includes(a.type))
      const response=view.legal.some(a=>a.type==='respond'||a.type==='discard')
      const label=a=>esc(a.card?CARDS[a.card.type].name:a.label||({pass:['choice','counter','rescue','support','blade','axe'].includes(pending.kind)?'暂不发动':'承受伤害',bagua:'八卦判定',support:'请求援助'}[a.type])||SUITS[a.value]||a.value)
      return `<div class="sg-response-line"><strong>${this.pendingText(view)}</strong><span>${pending.kind==='response'&&pending.remaining>1?'需依次响应；一张不够':''}</span></div>${pending.kind==='pick'?`<div class="sg-pick-pool">${direct.filter(({a})=>a.card).map(({a,i})=>`<button data-sg="response" data-value="${i}">${cardFace(a.card)}</button>`).join('')}</div>`:''}<div class="sg-action-row">${direct.filter(()=>pending.kind!=='pick').map(({a,i})=>`<button data-sg="response" data-value="${i}" class="${a.type==='pass'?'sg-secondary':'sg-response-option'}">${label(a)}</button>`).join('')}${response?`<button class="sg-primary" data-sg="confirm">${pending.kind==='discard'?'确认弃牌':pending.kind==='axe'?'弃两张 · 强击':'打出选中的牌'}${this.selected.length?' · '+this.selected.length:''}</button>`:''}<button class="sg-clear" data-sg="clear" aria-label="清除选择">重选</button></div>`
    }
    if(view.phase==='finished')return `<div class="sg-action-row"><strong>${this.won()?'你获胜了':'本局惜败'}</strong><button class="sg-primary" data-sg="new">再开一局 →</button><button class="sg-secondary" data-sg="report">查看战报</button></div>`
    if(!canPlay)return `<div class="sg-waiting"><i></i>${this.paused?'牌局已暂停':pending?`${heroName(view.players[pending.actor])}正在响应…`:`${heroName(view.players[view.current])}正在行棋用策…`}<small>${view.players[0].alive?'可点牌查看说明':'你已阵亡，正在观战'}</small></div>`
    const as=this.currentAs(view),variants=[...new Set(this.matching(view).map(a=>a.as))]
    const instruction=this.skill?`${SKILLS[this.skill][0]}：${this.skill==='rende'?'选手牌，再选一名角色':this.skill==='zhiheng'?'选择要换掉的手牌或装备':this.skill==='kurou'?'失去一点体力，摸两张牌':'选择目标'}`:this.selected.length?as?`${CARDS[as].name} · ${this.targetable(view).length?as==='collateral'?(this.targets.length?'再选被攻击的角色':'先选持有武器的角色'):this.targets.length?'目标已选，可确认出牌':'点击武将选择目标':'对自己 / 全场使用'}`:'这张牌只能在响应时使用':'选一张手牌，开始你的谋划'
    return `<div class="sg-response-line"><strong>${instruction}</strong>${variants.length>1?`<span class="sg-conversions">${variants.map(a=>`<button data-sg="as" data-value="${a}" class="${a===as?'selected':''}">当${CARDS[a].name}</button>`).join('')}</span>`:''}</div><div class="sg-action-row"><button class="sg-clear" data-sg="clear">重选</button><button class="sg-primary" data-sg="confirm" ${!this.skill&&!this.selected.length?'disabled':''}>${this.skill?'发动'+SKILLS[this.skill][0]:'确认出牌'}${this.targets.length?' · '+this.targets.map(t=>heroName(view.players[t])).join('、'):''}</button><button class="sg-secondary" data-sg="end">结束出牌</button></div>`
  }
  won() {const role=this.state.players[0].role;return role===this.state.winner||role==='loyal'&&this.state.winner==='lord'}
  renderGame() {
    const view=playerView(this.state,0),own=view.players[0],h=HERO_BY_ID[own.heroId],played=view.lastPlayed
    const centerCards=played?.cards.slice(0,2)||[]
    return `<header class="sg-topbar"><a href="/blogs/other/games.html" aria-label="返回游戏大厅">←</a><div class="sg-brand"><b>三国<span>逐鹿</span></b><small>CLASSIC IDENTITY</small></div><nav><button data-sg="rules">规则</button><button data-sg="catalog">牌谱</button><button data-sg="pause">${this.paused?'继续':'暂停'}</button><button data-sg="new">新局</button></nav></header><div class="sg-round-bar"><span class="sg-own-role role-${own.role}">${ROLES[own.role].name} · 你的身份</span><span>${view.turns} 回合 <i>·</i> 牌堆 ${view.deckCount}</span><button data-sg="sound" aria-pressed="${this.sound}">音效 ${this.sound?'开':'关'}</button><button data-sg="pace">${this.pace===250?'快节奏':this.pace===1100?'慢节奏':'标准节奏'}</button></div><main class="sg-arena"><div class="sg-arena-pattern"></div><div class="sg-players">${view.players.slice(1).map((p,i)=>this.opponent(p,view,i)).join('')}</div><div class="sg-table-center"><div class="sg-center-seal">逐<span>鹿</span></div><div class="sg-played-cards">${centerCards.map(c=>cardFace(c,'table-card')).join('')}</div><div class="sg-center-caption"><strong>${played?esc(played.label):'五人入局 · 各怀谋略'}</strong><p>${view.logs[0]?esc(view.logs[0].text):''}</p><button data-sg="report">战报 ↗</button></div></div></main><section class="sg-dock"><div class="sg-own-panel"><div class="sg-own-hero" style="--faction:${factionColor[h.faction]}"><button data-sg="detail" data-id="${h.id}">${portrait(h,'own')}</button><div><span>${h.title} · ${FACTIONS[h.faction]}</span><strong>${h.name}<i>你</i></strong>${hpMarkup(own)}</div><span class="sg-own-hand">▣ ${own.hand.length}</span></div><div class="sg-own-skills" data-scroll="skills">${this.skillButtons(view)}</div><div class="sg-own-equipment" data-scroll="equipment">${this.equipment(own,true)}</div></div><div class="sg-hand-area"><div class="sg-hand-heading"><span>你的手牌 <b>${own.hand.length}</b></span><small>${this.selected.length?'已选 '+this.selected.length+' 张':'点牌选择 · 横滑查看更多'}</small></div><div class="sg-hand" data-scroll="hand">${own.hand.length?own.hand.map(c=>`<button class="sg-hand-card ${this.selected.includes(c.id)?'selected':''}" data-sg="card" data-id="${c.id}" aria-label="${CARDS[c.type].name} ${SUITS[c.suit]}${rankName(c.rank)}" aria-pressed="${this.selected.includes(c.id)}">${cardFace(c)}</button>`).join(''):'<div class="sg-empty-hand">手中无牌 · 静观其变</div>'}</div><div class="sg-actions">${this.renderActions(view)}</div></div></section>${this.paused?'<div class="sg-pause-tag">已暂停 <button data-sg="pause">继续对局</button></div>':''}`
  }
  findCard(id) {if(!this.state)return null;return makeDeck().find(c=>c.id===id)}
  modalContent() {
    if(!this.modal)return ''
    const kind=this.modal.kind
    let title='',body=''
    if(kind==='new'){title='重开一局？';body='<p>当前牌局已自动存档。进入点将台后，可以继续上局，也可以选择新武将重新开战。</p><div class="sg-modal-actions"><button data-sg="close" class="sg-secondary">留在牌桌</button><button data-sg="new-confirm" class="sg-primary">进入点将台</button></div>'}
    if(kind==='hero') {const h=HERO_BY_ID[this.modal.id];title=h.name+' · '+h.title;body=`<div class="sg-hero-detail">${portrait(h,'detail')}<span>${FACTIONS[h.faction]}势力 · ${h.hp} 基础体力</span></div>${h.skills.map(id=>`<section class="sg-help-section"><h3>${SKILLS[id][0]}<small>${{active:'主动',locked:'锁定',convert:'转化',trigger:'触发',lord:'主公技'}[SKILLS[id][2]]}</small></h3><p>${SKILLS[id][1]}</p></section>`).join('')}<a href="${h.source}" target="_blank" rel="noopener" class="sg-source-link">三国杀官方武将资料 ↗</a>`}
    if(kind==='card') {const card=this.findCard(this.modal.id);if(card){const c=CARDS[card.type];title=c.name;body=`<div class="sg-card-detail">${cardFace(card)}<div><span>${{basic:'基本牌',trick:'普通锦囊',delay:'延时锦囊',equip:'装备牌'}[c.category]}${c.range?' · 攻击距离 '+c.range:''}</span><p>${c.help}</p></div></div>`}else{title='卡牌说明';body='<p>该牌暂时不可查看。</p>'}}
    if(kind==='report'){title=this.state?.winner?`${this.won()?'胜局':'终局'} · 身份揭晓`:'战场记录';const v=playerView(this.state,0);body=`${v.winner?`<div class="sg-result-roles">${v.players.map(p=>`<span><b>${heroName(p)}</b><i class="role-${p.role}">${ROLES[p.role].name}</i></span>`).join('')}</div>`:''}<ol class="sg-report">${v.logs.map(line=>`<li>${esc(line.text)}</li>`).join('')}</ol>`}
    if(kind==='catalog'){title='牌谱 · 108 张经典牌池';body=`<div class="sg-catalog-intro">基本牌 53 · 锦囊 36 · 装备 19</div>${['basic','trick','delay','equip'].map(category=>`<section class="sg-help-section"><h3>${{basic:'基本',trick:'锦囊',delay:'判定',equip:'装备'}[category]}</h3><div class="sg-catalog-grid">${Object.entries(CARDS).filter(([,c])=>c.category===category).map(([id,c])=>`<article><i>${c.symbol}</i><div><strong>${c.name}${c.range?' <small>距离 '+c.range+'</small>':''}</strong><p>${c.help}</p></div><b>×${makeDeck().filter(card=>card.type===id).length}</b></article>`).join('')}</div></section>`).join('')}`}
    if(kind==='rules'){title='新手作战手册';body=`<section class="sg-help-section"><h3>01 · 你的胜利条件</h3>${Object.values(ROLES).map(r=>`<p><b>${r.name}</b> ${r.goal}。</p>`).join('')}<p>五人配置：1 主公、1 忠臣、2 反贼、1 内奸。只公开主公；其他人阵亡或终局才亮身份。主公额外增加一点体力上限。</p></section><section class="sg-help-section"><h3>02 · 回合与操作</h3><p>从主公开始，依席位轮流。判定 → 摸牌 → 出牌 → 弃牌。通常摸两张、每个出牌阶段只用一张杀；装备连弩或张飞咆哮可多次出杀。出牌结束，手牌要弃到当前体力值。</p><p><b>先点手牌，再点目标武将，最后点“确认出牌”。</b>响应提示出现时选择杀／闪／桃等牌；可以放弃响应。需要两张杀或闪时，按提示依次打出。</p><p>借刀需先选持武器的角色，再选其攻击范围内的目标。仁德、制衡先点技能再选牌；红牌武圣、闪转龙胆会显示“当杀”选项。丈八蛇矛可选择两张手牌合成杀。</p></section><section class="sg-help-section"><h3>03 · 距离、濒死与反制</h3><p>距离取存活角色间顺逆时针的较短路线；基础攻击距离一。武器扩大范围，马与马术修正距离。体力降到零以下时按顺序求桃，救至一点才能存活。</p><p>无懈可击逐个抵消锦囊对单一角色的效果，也能反制另一张无懈。主公误杀忠臣要失去所有手牌和装备；击败反贼的人摸三张牌。</p></section><section class="sg-help-section"><h3>04 · 本版内容</h3><p>12 名经典武将、108 张牌、四名本地 AI。技能以经典版本为准；暂不包含军争、界限突破、国战或联机。AI 依据公开行为判断身份，不能读取你的手牌和隐藏身份。关掉页面后，可从点将台继续上次对局。</p><p>界面、封面与徽像为原创设计，玩法资料参考<a href="https://www.sanguosha.com/mode" target="_blank" rel="noopener">三国杀官方模式</a>、官方武将介绍与<a href="https://guozhan.sanguosha.com/a/kapaiyilan/" target="_blank" rel="noopener">卡牌资料</a>。</p></section>`}
    return `<div class="sg-modal-overlay"><section class="sg-modal" role="dialog" aria-modal="true" aria-labelledby="sg-dialog-title" tabindex="-1"><header><span class="sg-eyebrow">三国 · 逐鹿</span><h2 id="sg-dialog-title">${title}</h2><button data-sg="close" aria-label="关闭弹窗">×</button></header><div class="sg-modal-body">${body}</div></section></div>`
  }
  render() {
    if(this.destroyed)return
    clearTimeout(this.timer)
    const scrolls=Object.fromEntries([...this.root.querySelectorAll('[data-scroll]')].map(el=>[el.dataset.scroll,el.scrollLeft]))
    this.root.classList.toggle('sg-has-pool',this.state?.pending?.actor===0&&this.state?.pending?.kind==='pick')
    const previousModal=!!this.root.querySelector('.sg-modal'),priorFocus=document.activeElement
    this.root.innerHTML=(this.lobby?this.renderLobby():this.renderGame())+this.modalContent()+(this.toast?`<div class="sg-toast" role="status">${esc(this.toast)}</div>`:'')
    const nav=this.root.querySelector('.sg-topbar nav')
    if(nav){const catalog=nav.querySelector('[data-sg="catalog"]');if(catalog){catalog.dataset.sg='report';catalog.textContent='战报'}const feedback=document.createElement('button');feedback.textContent='反馈';feedback.dataset.gameFeedback='';nav.appendChild(feedback)}
    if(this.modal?.kind==='rules'){const catalog=document.createElement('button');catalog.textContent='打开完整牌谱 →';catalog.dataset.sg='catalog';catalog.className='sg-secondary';this.root.querySelector('.sg-modal-body').appendChild(catalog)}
    for(const [key,left]of Object.entries(scrolls)){const el=this.root.querySelector(`[data-scroll="${key}"]`);if(el)el.scrollLeft=left}
    if(this.modal&&!previousModal){this.modalFocus=priorFocus;this.root.querySelector('.sg-modal [data-sg="close"]')?.focus()}
    if(!this.modal&&previousModal){const key=this.modalFocus?.dataset?.sg;this.root.querySelector(`[data-sg="${key}"]`)?.focus()}
    this.schedule()
  }
  destroy() {
    this.destroyed=true;clearTimeout(this.timer);clearTimeout(this.noticeTimer);this.root.removeEventListener('click',this.onClick);this.root.removeEventListener('keydown',this.onKey);document.removeEventListener('visibilitychange',this.onVisibility)
    if(this.audio)this.audio.close().catch(()=>{});document.body.classList.remove('sg-page-active');document.body.style.overflow=this.overflow
    if(this.placeholder.parentNode){this.placeholder.parentNode.insertBefore(this.root,this.placeholder);this.placeholder.remove()}
  }
}
