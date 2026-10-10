import {FACTIONS,CARDS_BY_TYPE,displayText,skillName} from './theme.mjs'
import {ROLES,SUITS} from '../../.vuepress/components/sanguo/catalog.mjs'
import {playerView} from './engine.mjs'
import {esc,display,portrait,hp,cardFace,cardBack,cardTitle} from './presentation.mjs'
import {combatContext,seatName} from './combat.mjs'
import {judgmentMark,publicPicks,responsePrompt} from './table-visuals.mjs'
const roleBadge=(p,own=false)=>`<span class="fs-identity role-${p.role||'unknown'} ${own?'fs-own-identity':''}" data-role="${p.role||'unknown'}">${p.role?ROLES[p.role].name:'？'}</span>`
export const delayLabel=type=>cardTitle(type)
const delays=(p,v)=>[...p.judgment.map(c=>c.type),...(v.pending?.kind==='reveal'&&v.pending.target===p.seat?[v.pending.delayType]:[])]
export const delayIcons=(p,v)=>delays(p,v).map(type=>`<b class="fs-delay-mark" data-delay="${type}" title="${delayLabel(type)}" aria-label="${delayLabel(type)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${type==='lightning'?'<path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z"/>':'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v18M15 3v18M4 10h16"/>'}</svg></b>`).join('')
export function renderOpponent(ui,p,view){
  const h=display(p),target=ui.targetable(view).includes(p.seat),active=view.current===p.seat&&!view.winner
  return `<article class="fs-player faction-${h.faction} ${active?'turn-active':''} ${target?'targetable':''} ${ui.targets.includes(p.seat)?'target-selected':''} ${!p.alive?'fallen':''}" data-player="${p.seat}" data-equip-count="${Object.values(p.equip).filter(Boolean).length}" style="--equip-count:${Math.max(1,Object.values(p.equip).filter(Boolean).length)}">
    <button class="fs-player-main" data-action="target" data-value="${p.seat}" aria-label="${target?'选择目标':'查看'}${h.name}${!p.alive?'，已阵亡，'+ROLES[p.role].name:''}">
      ${portrait(h)}<span class="fs-portrait-shade"></span>${roleBadge(p)}<span class="fs-seat">${p.seat}号 · ${FACTIONS[h.faction]}</span>
      <span class="fs-player-info"><strong style="${h.name.length>4?'font-size:16px;letter-spacing:0':''}">${h.name}</strong>${hp(p)}<span>▣ ${p.handCount}${view.pending?.actor===p.seat?' · 响应中':active?' · 出牌中':''}</span></span>
      ${!p.alive?`<span class="fs-death-banner" data-revealed-role="${p.role}">已阵亡 · ${ROLES[p.role].name}</span>`:''}
      ${delays(p,view).length?`<span class="fs-player-delays">${delayIcons(p,view)}</span>`:''}
    </button><div class="fs-opponent-equipment" data-scroll="equip-${p.seat}">${ui.equipment(p)}</div>
  </article>`
}
function takeChoices(ui,view){
  const pending=view.pending,target=view.players[pending.target],options=view.legal.map((a,i)=>({...a,index:i})),zones=[...new Set(options.map(a=>a.zone||'hand'))]
  const zone=zones.includes(ui.choiceZone)?ui.choiceZone:zones[0],names={hand:'手牌',equipment:'装备',judgment:'判定区'},mode=ui.state.pending.mode==='snatch'?'获得':'弃置'
  return `<section class="fs-center-choice" role="group" aria-label="选择${display(target).name}的区域牌">
    <header><div><small>${mode==='获得'?'摄宝 · 取一张牌':'破阵 · 弃一张牌'}</small><strong>选择${display(target).name}的一张牌</strong></div><span>${mode}</span></header>
    <div class="fs-choice-tabs">${zones.map(z=>`<button data-action="choice-zone" data-value="${z}" aria-pressed="${z===zone}" class="${z===zone?'selected':''}">${names[z]} <b>${options.filter(a=>(a.zone||'hand')===z).length}</b></button>`).join('')}</div>
    <div class="fs-center-card-list" data-scroll="choice-${zone}">${options.filter(a=>(a.zone||'hand')===zone).map(a=>`<button data-action="take-choice" data-value="${a.index}" class="fs-choice-card ${ui.choiceIndex===a.index?'selected':''}" aria-pressed="${ui.choiceIndex===a.index}" aria-label="${a.hidden?a.label:CARDS_BY_TYPE[a.card.type].name}">${a.hidden?cardBack(a.label):cardFace(a.card)}</button>`).join('')}</div>
    <footer>${zone==='hand'?'暗手牌只显示牌背，不能查看牌面':'明置牌可按花色、点数与用途选择'} · 选好后确认${mode}</footer>
  </section>`
}
function counterChoices(ui,view){
  const p=view.pending,d=CARDS_BY_TYPE[p.cardType],target=view.players[p.target],answers=view.legal.filter(a=>a.type==='respond'),own=view.players[0]
  return `<section class="fs-center-choice fs-counter-choice" role="group" aria-label="破法响应">
    <header><div><small>破法 · 抵消锦囊</small><strong>${p.negated?'当前效果已被抵消':'是否抵消当前锦囊？'}</strong></div></header>
    <div class="fs-counter-context"><img src="${d.thumb||d.image}" alt=""><div><b>${d.name}</b><span>${p.source==null?'判定':display(view.players[p.source]).name} → ${display(target).name}</span><small>${p.negated?'再出破法，会让原锦囊恢复生效':'出破法抵消；放弃则继续结算'}</small></div></div>
    <div class="fs-center-card-list" data-scroll="counters">${answers.map(a=>{const c=own.hand.concat(Object.values(own.equip).filter(Boolean)).find(c=>c.id===a.ids[0]);return `<button data-action="card" data-id="${c.id}" class="fs-choice-card ${ui.selected.includes(c.id)?'selected':''}" aria-label="选择破法 ${SUITS[c.suit]}${c.rank}" aria-pressed="${ui.selected.includes(c.id)}">${cardFace(c)}</button>`}).join('')}</div>
  </section>`
}
export function renderCenter(ui,view){
  if(view.pending?.kind==='reveal'){const p=view.pending,m=judgmentMark(p);return `<section class="fs-judgment-reveal" role="status" aria-label="公开判定"><header>${esc(seatName(view,p.target))} · ${delayLabel(p.delayType)}判定</header><div class="fs-flip-card">${cardFace(p.card)}<b class="fs-judge-stamp ${m.hit?'hit':'miss'}" data-judge-hit="${m.hit}" aria-label="${m.label}">${m.symbol}</b></div><strong class="${p.hit?'hit':'safe'}">${p.delayType==='indulgence'?p.hit?'跳过出牌阶段':'正常出牌':p.hit?'受到 3 点伤害':'天雷劫传给下家'}</strong></section>`}
  if(view.pending?.actor===0&&view.pending.kind==='take')return takeChoices(ui,view)
  if(view.pending?.actor===0&&view.pending.kind==='counter')return counterChoices(ui,view)
  const picks=publicPicks(view)
  if(view.lastPlayed?.as==='harvest'&&(view.harvestPool?.length||picks.length)&&view.lastPlayed.turn===view.turns){
    // 全部选完后短暂展示结果即自动收起，不再一直占着桌面中央等待
    if(view.pending?.kind!=='pick'){
      if(ui.harvestDoneId!==view.lastPlayed.id){ui.harvestDoneId=view.lastPlayed.id;ui.harvestDoneAt=Date.now();setTimeout(()=>{if(!ui.destroyed)ui.render()},1500)}
      else if(Date.now()-ui.harvestDoneAt>1400)return playedCenter(view)
    }
    return `<section class="fs-center-choice fs-pool-choice" role="group" aria-label="仙山采宝"><header><strong>仙山采宝</strong><small>${view.pending?.kind==='pick'?(view.pending.actor===0?'请选择一张牌':display(view.players[view.pending.actor]).name+'正在选牌'):'选牌完成'}</small></header><div class="fs-center-card-list" data-scroll="pool">${(view.harvestPool||[]).map(c=>{const i=view.legal.findIndex(a=>a.type==='choose'&&a.value===c.id);return `<button class="fs-choice-card" data-action="response" data-value="${i}" ${i<0?'disabled':''} aria-label="${cardTitle(c.type)}">${cardFace(c)}</button>`}).join('')}${picks.map(p=>`<div class="fs-choice-card fs-harvest-picked" data-picked-by="${p.source}">${cardFace(p.card)}<b>${display(view.players[p.source]).name}</b><small>已选 ${cardTitle(p.card.type)}</small></div>`).join('')}</div></section>`
  }
  return playedCenter(view)
}
function playedCenter(view){
  const played=view.lastPlayed,battle=combatContext(view),converted=(played?.as==='sha'||played?.label==='杀')&&played.cards.some(c=>c.type!=='sha'),response=view.lastResponse?.forPlayed===played?.id&&view.lastResponse?.turn===view.turns?view.lastResponse:null,drawn=played?.as==='draw'&&played.turn===view.turns?view.logs.find(l=>l.cue?.kind==='draw'&&l.cue.playedId===played?.id)?.cue:null
  const visibleCard=(c,as,caption)=>`<span class="fs-card-play">${cardFace(as?{...c,type:as}:c)}${caption?`<small>${esc(caption)}</small>`:''}</span>`
  const responseCard=response?response.cards.slice(0,1).map(c=>visibleCard(c,response.as,seatName(view,response.source)+' · '+(c.type!==response.as?'转化':'响应'))).join(''):''
  const caption=battle?battle.kind==='dodge'?'闪避成功':battle.kind==='damage'?'受到伤害':battle.kind==='blocked'?'防具抵挡':'':drawn?'摸牌 +'+drawn.count:played?esc(displayText(played.label)):''
  return `<div class="fs-table-center"><div class="fs-played">${(played?.cards||[]).slice(0,response?1:2).map(c=>visibleCard(c,converted?'sha':null,converted?'转化攻击':'')).join('')}${responseCard}</div>${caption?`<div class="fs-table-caption"><b>${caption}</b></div>`:''}</div>`
}
function playInstruction(ui,view){
  if(ui.skill)return `${skillName(view.players[0].heroId,ui.skill)}：${ui.skill==='rende'?'选择要交出的手牌，再选择接收者':ui.skill==='zhiheng'?'选择要替换的手牌或装备':'点击人物选择目标'}`
  const as=ui.currentAs(view)
  if(!ui.selected.length)return ui.hints===false?'你的出牌阶段':'你的出牌阶段 · 先选手牌，再选目标，最后确认'
  if(!as)return '这张牌只能在对应的响应窗口使用'
  if(as==='collateral')return ui.targets.length===2?'持刀者和被杀目标已选，请确认':ui.targets.length?'再选择被杀目标，也可以选择自己':'借宝诛敌 · 先选持武器的角色'
  return `${cardTitle(as)} · ${ui.targetable(view).length?ui.targets.length?'目标已选，请确认':'点击人物选择目标':'对自己或全场使用，请确认'}`
}
function operation(ui,v){
  let title='',hint=''
  if(ui.paused)title='牌局已暂停'
  else if(v.winner){title=ui.won()?'你获胜了':'本局结束';hint=ROLES[v.winner].name+'阵营获胜'}
  else if(v.pending?.kind==='reveal'){title=seatName(v,v.pending.target)+'正在进行'+delayLabel(v.pending.delayType)+'判定';hint='判定牌公开翻到中央，展示完自动继续'}
  else if(ui.transfer){title=ui.transfer.mode==='snatch'?'正在取走目标的牌':'正在弃置目标的牌';hint='等移牌动画完成后继续'}
  else if(ui.draws?.length){const d=ui.draws[0];title=`${seatName(v,d.target)} · 天机显化，摸 ${d.count} 张牌`;hint='牌堆 → 手牌 · 摸牌后继续'}
  else if(ui.auto&&!v.pending&&v.current===0){title='AI托管中 · 正在替你出牌';hint='点击“接管”即可恢复自己操作'}
  else if(v.pending?.actor===0){title=responsePrompt(v)||ui.pendingText(v);hint=ui.hints===false?'':(v.pending.kind==='take'?'在牌桌中央选牌后确认':v.pending.kind==='counter'?'在中央选择破法，或放弃响应':'选好手牌后确认，也可以放弃')}
  else if(v.pending){title=display(v.players[v.pending.actor]).name+'正在响应…'}
  else if(v.current===0&&v.players[0].alive)title=playInstruction(ui,v)
  else title=display(v.players[v.current]).name+'的回合 · '+(v.players[0].alive?'等待出牌':'你已阵亡，正在观战')
  const selected=v.players[0].hand.find(c=>c.id===ui.selected[0])||Object.values(v.players[0].equip).find(c=>c?.id===ui.selected[0])
  if(selected&&!ui.skill&&ui.hints!==false){const d=CARDS_BY_TYPE[selected.type];hint=d.name+'：'+displayText(d.help)+(ui.currentAs(v)&&ui.currentAs(v)!==selected.type?' · 当前转化为'+cardTitle(ui.currentAs(v)):'')}
  // 状态提示改为牌面上方的浮空文字，不占布局、不遮挡操作（英雄杀式桌面）。
  return `<div class="fs-status" aria-live="polite"><strong>${esc(title)}</strong>${hint?`<small class="fs-teaching-hint">${esc(hint)}</small>`:''}</div>`
}
export function renderControls(ui,v){
  if(ui.paused)return `<div class="fs-action-row"><button data-action="pause" class="fs-primary">继续对局</button></div>`
  if(v.winner)return `<div class="fs-action-row"><button data-action="new" class="fs-primary">再开一局</button><button data-action="report" class="fs-secondary">身份揭晓</button></div>`
  if(v.pending?.kind==='reveal'||ui.transfer||ui.draws?.length)return `<div class="fs-action-row fs-idle-controls"><span>动画展示中 · 自动继续</span></div>`
  if(ui.auto)return `<div class="fs-action-row"><button data-action="auto" class="fs-primary">接管 · 由我操作</button></div>`
  if(v.pending?.actor===0){
    const pending=v.pending,answers=v.legal.filter(a=>a.type==='respond'),options=v.legal.map((a,i)=>({a,i})).filter(({a})=>!['respond','discard'].includes(a.type))
    if(pending.kind==='take')return `<div class="fs-action-row"><button data-action="clear" class="fs-clear">重选</button><button data-action="choose-confirm" class="fs-primary" ${ui.choiceIndex==null?'disabled':''}>确认${ui.state.pending.mode==='snatch'?'获得':'弃置'}</button></div>`
    if(pending.kind==='pick')return `<div class="fs-action-row"><span class="fs-choice-note">请在中央亮出的牌中选择</span></div>`
    const canConfirm=pending.kind==='discard'?ui.selected.length===pending.count:answers.some(a=>a.ids.length===ui.selected.length&&a.ids.every(id=>ui.selected.includes(id)))
    return `<div class="fs-action-row">${answers.length||pending.kind==='discard'?`<button data-action="confirm" class="fs-primary" ${!canConfirm?'disabled':''}>${pending.kind==='discard'?'确认弃牌':pending.kind==='counter'?'使用破法':'确认响应'}</button>`:''}${options.map(({a,i})=>`<button data-action="response" data-value="${i}" class="fs-secondary">${esc(displayText(a.type==='pass'?'放弃':a.type==='bagua'?'杏黄旗判定':a.type==='support'?'请求援助':a.type==='choose'?a.label||SUITS[a.value]||a.value:'选项'))}</button>`).join('')}<button data-action="clear" class="fs-clear">重选</button></div>`
  }
  if(v.pending||v.current!==0||!v.players[0].alive)return `<div class="fs-action-row fs-idle-controls"><button data-action="report" class="fs-secondary">查看战报</button><span>${v.pending?'等待'+seatName(v,v.pending.actor)+'响应':v.players[0].alive?'等待你的回合':'观战中 · 身份始终可见'}</span></div>`
  const opts=ui.matching(v),as=ui.currentAs(v),variants=[...new Set(opts.map(a=>a.as))],natural=v.players[0].hand.find(c=>c.id===ui.selected[0])?.type
  const conversions=variants.length>1||variants.length===1&&as!==natural?`<div class="fs-conversions">${variants.map(a=>`<button data-action="as" data-value="${a}" class="${a===as?'selected':''}">当${CARDS_BY_TYPE[a].name}</button>`).join('')}</div>`:''
  const selfTarget=as==='collateral'&&ui.targetable(v).includes(0)&&!ui.targets.includes(0)?'<button class="fs-self-target fs-secondary" data-action="target" data-value="0">让他杀我</button>':''
  return `<div class="fs-action-row">${conversions}${selfTarget}<button data-action="clear" class="fs-clear">重选</button><button data-action="confirm" class="fs-primary" ${!ui.skill&&!ui.selected.length?'disabled':''}>${ui.skill?'发动'+skillName(v.players[0].heroId,ui.skill):'确认出牌'}${ui.targets.length?' · '+ui.targets.map(t=>display(v.players[t]).name).join('、'):''}</button><button data-action="end" class="fs-secondary">结束出牌</button></div>`
}
export function renderBattle(ui){
  const v=playerView(ui.state,0),p=v.players[0],h=display(p),selfTarget=ui.targetable(v).includes(0),selfSelected=ui.targets.includes(0)
  return `${ui.header()}<div class="fs-round"><button data-action="identity" class="fs-my-role" aria-label="查看自己的${ROLES[p.role].name}身份">${roleBadge(p,true)}<b>你是${ROLES[p.role].name}</b></button><span>第 ${v.turns} 回合 · 牌堆 ${v.deckCount}</span><button data-action="auto" class="fs-clock" aria-label="${ui.auto?'接管操作':'开启AI托管'}">${ui.auto?'AI托管 · 接管':ui.clock?.key?'<b data-seconds>'+ui.clock.seconds+'s</b>':'托管'}</button><button data-action="pace">${ui.pace===250?'快':ui.pace===1100?'慢':'标准'}</button></div>
    <main class="fs-arena"><div class="fs-players">${v.players.slice(1).map(x=>renderOpponent(ui,x,v)).join('')}</div>${renderCenter(ui,v)}${operation(ui,v)}<div class="fs-deck-stack" aria-label="牌堆剩余 ${v.deckCount} 张"><b>牌堆</b><span>${v.deckCount}</span></div></main>
    <section class="fs-dock"><div class="fs-own-panel"><div class="fs-own-hero ${p.alive?'':'fs-own-fallen'} ${selfTarget?'targetable':''} ${selfSelected?'target-selected':''}"><button data-action="${selfTarget||selfSelected?'target':'hero-detail'}" data-value="0" data-id="${h.id}" aria-label="${selfTarget?'选择自己作为被杀目标':'查看'+h.name}">${portrait(h)}${delays(p,v).length?`<span class="fs-own-delays" aria-label="你的判定区">${delays(p,v).map(type=>`<b>${delayLabel(type)}</b>`).join('')}</span>`:''}</button><div><small>${FACTIONS[h.faction]} · ${p.alive?h.title:'已阵亡，观战中'}</small><strong style="${h.name.length>4?'font-size:16px;letter-spacing:0':''}">${h.name}</strong><button data-action="identity" class="fs-own-role-button" aria-label="你的身份：${ROLES[p.role].name}">${roleBadge(p,true)}<span>你的身份</span></button>${hp(p)}</div></div><div class="fs-own-skills" data-scroll="skills">${ui.skills(p,v)}</div><div class="fs-own-equipment" data-scroll="equipment">${ui.equipment(p,true)}</div></div>
    <div class="fs-hand-area"><div class="fs-hand-heading"><b>手牌 <i>${p.hand.length}</i></b><span>${ui.selected.length?'已选 '+ui.selected.length+' 张':'左右滑动 · 点牌抽起'}</span><button data-action="hand">展开手牌</button></div><div class="fs-hand" data-scroll="hand">${p.hand.length?p.hand.map(c=>`<button class="fs-hand-card ${ui.selected.includes(c.id)?'selected':''}" data-action="card" data-id="${c.id}" aria-label="${cardTitle(c.type)} ${SUITS[c.suit]}${c.rank}" aria-pressed="${ui.selected.includes(c.id)}">${cardFace(c)}</button>`).join(''):'<div class="fs-empty">手中无牌 · 静观其变</div>'}</div><div class="fs-actions">${renderControls(ui,v)}</div></div></section>`
}
