import {HERO_BY_THEME_ID,PLAYABLE_HEROES,FACTIONS,ALLIANCES,ALLIANCE_NAMES,displayText,skillHelp} from './theme.mjs'
import {ROLES,SKILLS} from './core/catalog.mjs'
import {setupView,LORD_HEROES,MODE_LIST,modeById} from './setup.mjs'
import {esc,portrait} from './presentation.mjs'
const identity=(role,extra='')=>`<span class="fs-identity role-${role} ${extra}">${ROLES[role].name}</span>`
// 阵营/身份徽章：对抗局按 sides 显示友/敌，身份局按 role 显示身份名。
const sideBadge=(view,seat,extra='')=>{
  if(view.teamMode){const ally=view.sides[seat]===view.sides[view.seat];return `<span class="fs-identity ${ally?'role-ally':'role-enemy'} ${extra}">${ally?'友方':'敌方'}</span>`}
  return identity(view.players[seat].role||'unknown',extra)
}
export function renderHome(ui){
  const h=HERO_BY_THEME_ID.sunwukong,session=ui.resumeSession,mode=modeById(ui.mode),team=!!mode.teams
  const steps=team?['随机分配敌友','各自从候选中选将','掷骰，点数最高者先手','发牌，由先手开始行动']:['随机抽取身份','主公先选将并亮出','其余玩家从各自候选中选将','发牌，从主公开始行动']
  const tag=team?'两军对垒 · 单机 / AI':'众神身份 · 单机 / AI'
  const legacy=ui.legacySave?'<p class="fs-legacy-notice" role="status">上一版存档已保留，不会覆盖；本次更新需要新开一局。</p>':''
  return `${ui.header()}<main class="fs-entry"><div class="fs-entry-art">${portrait(h,'',true)}<span></span></div><section class="fs-entry-copy"><small>${tag}</small><h1>众神斗法</h1><p>诸天神话，同桌斗法</p><ol>${steps.map((s,i)=>`<li><b>0${i+1}</b>${s}</li>`).join('')}</ol><div class="fs-mode-row" role="group" aria-label="玩法模式">${MODE_LIST.map(m=>`<button class="fs-mode-chip ${ui.mode===m.id?'selected':''}" data-action="mode" data-id="${m.id}" aria-pressed="${ui.mode===m.id}"><b>${m.menu}</b><small>${m.blurb}</small></button>`).join('')}</div><div class="fs-entry-actions">${session?`<button class="fs-secondary" data-action="resume">${session.kind==='setup'?'继续选将':'继续上局'}</button>`:''}<button class="fs-primary" data-action="start">开始${mode.name} →</button></div>${legacy}<button class="fs-entry-catalog" data-action="heroes">查看人物图鉴 ↗</button><small class="fs-entry-note">${mode.name} · ${PLAYABLE_HEROES.length} 名可用武将 · ${team?'敌友公开，掷骰定先手':'身份不可自选'}</small></section></main>`
}
// 掷骰动画：每席一枚骰子，滚动后定格在点数；点数最高者（view.first）标「先手」。
const diceStage=view=>{
  const max=view.dice?Math.max(...view.dice):0
  return `<section class="fs-dice-stage" role="group" aria-label="开局掷骰决定先手">
    <small>掷骰定先手 · 点数最高者先行</small>
    <div class="fs-dice-row">${view.dice.map((d,i)=>`<span class="fs-die ${i===view.first?'is-first':''}" style="--roll:${d}" data-die="${d}" data-first="${i===view.first}" aria-label="${i===view.seat?'你':i+' 号席'}掷出 ${d} 点${i===view.first?'，先手':''}">
      <span class="fs-die-cube" aria-hidden="true">${[1,2,3,4,5,6].map(n=>`<b>${n}</b>`).join('')}</span>
      <span class="fs-die-num">${d}</span>
      <small>${i===view.seat?'你':i+' 号'}${i===view.first?' · 先手':''}</small>
    </span>`).join('')}</div>
    <strong class="fs-dice-result">${view.first===view.seat?'你骰点最高，先手出牌':view.first+' 号席骰点最高，先手出牌'}</strong>
  </section>`
}
export function renderSetup(ui){
  const v=setupView(ui.setup,0),own=ROLES[v.role],lord=v.players[v.lord],lordHero=lord.heroId&&HERO_BY_THEME_ID[lord.heroId],candidate=HERO_BY_THEME_ID[ui.draftHero]
  const stages=['identity','lord','others','ready'],labels=['抽身份','主公先选','其他选将','准备出战'],at=stages.indexOf(v.stage)
  // 对抗局：没有身份，改为敌友；全员同时选将，选完才掷骰定先手。
  const team=v.teamMode,ally=team&&v.sides[0]===0
  const stepLabels=team?['敌友分配','各自选将','掷骰定先手','准备出战']:labels
  const teamAt=team?(v.stage==='identity'?0:v.stage==='lord'?1:2):at
  const firstLabel=team?(v.dice?(v.first===0?'你':'先手在 '+v.first+' 号席'):'选将后掷骰'):(v.lord===0?'你是主公':'主公在 '+v.lord+' 号席')
  const title=v.stage==='identity'?(team?`你是${ally?'友方':'敌方'}`:'你抽到了'+own.name)
    :v.stage==='lord'?(team?'从你的候选中选择一名武将':(v.lord===0?'主公，请先选择你的武将':'等待主公先选将'))
    :v.stage==='others'?(v.picked?'你已选定，等待其他玩家':'从你的候选中选择一名武将'):'武将已全部选定'
  const steps=team?stepLabels:labels,stepAt=team?teamAt:at
  return `${ui.header()}<main class="fs-setup"><ol class="fs-setup-steps">${steps.map((label,i)=>`<li class="${i===stepAt?'current':i<stepAt?'done':''}"><b>${i+1}</b>${label}</li>`).join('')}</ol>
    <section class="fs-draft-identity">${sideBadge(v,0)}<div><strong>${team?'你的阵营：'+(ally?'友方':'敌方'):'你的身份：'+own.name}</strong><p>${team?'消灭敌方全部角色即获胜。':own.goal}</p></div><span>${firstLabel}</span></section>
    <section class="fs-draft-status"><div><small>${v.stage==='identity'?(team?'敌友已分配':'身份已随机分配'):v.stage==='lord'?(team?'全员同时选将，互不占用候选':'主公选定前，其他人不能选将'):v.stage==='others'?'各自候选独立，身份仍保持隐藏':(team?'骰点已定，即将发牌':'选将完成后才发初始手牌')}</small><h2>${title}</h2></div>${lordHero?`<div class="fs-draft-lord">${portrait(lordHero)}<span><small>${team?'先手已亮将':'主公已亮将'}</small><b>${lordHero.name}</b></span></div>`:''}</section>
    ${v.stage==='identity'?`<section class="fs-role-reveal-panel"><div class="fs-role-card ${team?(ally?'role-ally':'role-enemy'):'role-'+v.role}"><span>${team?'你的阵营':'你的身份'}</span><strong>${team?(ally?'友方':'敌方'):own.name}</strong><small>${team?'座位穿插：你之后是敌方、队友、敌方循环':(v.lord===0?'主公身份对所有人公开':'仅你能看到，其他玩家不知道')}</small></div><p>${team?'确认阵营后进入选将，选完才掷骰定先手。':'身份已锁定，刷新不会重新抽取。'}</p></section>`
      :team&&v.stage==='ready'&&v.dice?diceStage(v)
      :v.candidates.length&&!v.picked?`<section class="fs-draft-options"><div class="fs-draft-count">随机候选 · ${v.candidates.length} 选 1 <small>${!team&&v.lord===0?'3 名主公型 + 2 名随机角色':'当前将池 '+PLAYABLE_HEROES.length+' 人，每人 '+v.candidateCount+' 张独立候选'}</small></div><div class="fs-draft-grid" data-scroll="draft">${v.candidates.map(id=>{const h=HERO_BY_THEME_ID[id];return `<article class="fs-draft-option faction-${h.faction} ${ui.draftHero===id?'selected':''}"><button class="fs-draft-pick" data-action="hero" data-id="${id}" aria-label="选择${h.name}" aria-pressed="${ui.draftHero===id}">${portrait(h)}<span><small>${FACTIONS[h.faction]} · ${ALLIANCE_NAMES[h.mechanicalFaction]} · ${h.hp} 体力</small><strong>${h.name}</strong><i>${Object.values(h.skillNames).join(' · ')}</i></span>${!team&&LORD_HEROES.includes(id)?'<b class="fs-lord-type">主公型</b>':''}</button><button class="fs-draft-details" data-action="hero-detail" data-id="${id}">技能说明</button></article>`}).join('')}</div></section>`
      :`<section class="fs-draft-wait"><b>${v.stage==='ready'?v.players.length+'席齐备，即将发牌':'请稍候'}</b><p>${v.stage==='ready'?'所有武将已亮出；'+(team?'敌友关系公开。':'其他玩家的身份依然隐藏。'):v.stage==='lord'?(team?'其他 AI 正在各自的候选中选择。':'主公 AI 正在从自己的候选武将中选择。'):'其他 AI 正在确认各自的候选武将，不会占用你的候选。'}</p></section>`}
    ${v.stage!=='identity'?`<section class="fs-draft-seats" aria-label="选将进度">${v.players.map(p=>{const h=p.heroId&&HERO_BY_THEME_ID[p.heroId];return `<div class="${p.seat===0?'own':''}${!h&&p.ready?' ready':''}">${h?portrait(h):'<span class="fs-draft-hidden">？</span>'}<div><small>${p.seat===0?'你':p.seat+' 号席'}${team?' · '+(v.sides[p.seat]===v.sides[0]?'友':'敌'):(p.role?' · '+ROLES[p.role].name:'')}</small><strong>${h?h.name:p.ready?'✓ 已选':'选将中…'}</strong></div></div>`}).join('')}</section>`:''}
    <footer class="fs-draft-footer">${candidate&&v.candidates.includes(candidate.id)&&!v.picked?`<p><b>${candidate.name}</b> ${Object.entries(candidate.skillNames).map(([s,n])=>`${n}：${esc(skillHelp(candidate,s))}`).join('　')}</p>`:`<p>${v.stage==='identity'?(team?'确认阵营后进入选将。':'确认自己的身份后进入选将。'):v.stage==='lord'?(team?'全员同时选将，从发给你的候选中选择。':(v.lord!==0?'主公完成选将后才会给你发候选武将。':'从发给你的候选中选择。')):v.stage==='ready'?(team?'初始每人四张手牌，由骰点最高者开始。':'初始每人四张手牌，首个回合由主公开始。'):v.picked?'选择已经锁定，不会因刷新改变。':'只能从发给你的候选中选择，不能自选身份或任意点将。'}</p>`}
      ${v.stage==='identity'?'<button class="fs-primary" data-action="setup-next">进入选将 →</button>':v.stage==='ready'?'<button class="fs-primary" data-action="setup-begin">立即进入对局 →</button>':v.candidates.length&&!v.picked?`<button class="fs-primary" data-action="draft-pick" ${!v.candidates.includes(ui.draftHero)?'disabled':''}>确认${candidate?'选择 '+candidate.name:'选择武将'}</button>`:'<span class="fs-draft-waiting-label">正在等待其他玩家…</span>'}
    </footer></main>`
}
export function heroGallery(){
  return `<p>查看诸天角色与技能。开局时，从发给你的随机候选中选择出战角色。</p><div class="fs-collection-grid">${Object.values(HERO_BY_THEME_ID).map(h=>`<button data-action="hero-detail" data-id="${h.id}" class="${h.playable?'':'not-ready'}">${portrait(h)}<strong>${h.name}</strong><small>${h.playable?'已开放':'开发中'}</small></button>`).join('')}</div>`
}
