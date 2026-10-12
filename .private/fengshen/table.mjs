import {FACTIONS,CARDS_BY_TYPE,displayText,skillName,skillHelp} from './theme.mjs'
import {ROLES,SUITS} from './core/catalog.mjs'
import {playerView} from './engine.mjs'
import {esc,display,portrait,playerResources,cardFace,effectiveCard,cardBack,cardTitle,equipEffect} from './presentation.mjs'
import {combatContext,seatName} from './combat.mjs'
import {judgmentMark,publicPicks,responsePrompt,counterAction} from './table-visuals.mjs'
import {tableTrail,trailCards} from './table-trail.mjs'
import {panelAction,cleanRoleMarks} from './panel-selection.mjs'
import {extensionChoice,extensionControls,extensionPrompt,actualResponseControls} from './extension-table.mjs'
import {EXT_ACTIVE} from './extension-actions.mjs'
import {selectedCardHint} from './card-hint.mjs'
const roleBadge=(p,view,own=false)=>{
  // 对抗局只有敌友：按与本地玩家（0 号席）的阵营关系显示友/敌。
  if(view?.teamMode){const ally=view.sides[p.seat]===view.sides[view.seat];return `<span class="fs-identity ${ally?'role-ally':'role-enemy'} ${own?'fs-own-identity':''}" data-role="${ally?'ally':'enemy'}">${ally?'友':'敌'}</span>`}
  return `<span class="fs-identity role-${p.role||'unknown'} ${own?'fs-own-identity':''}" data-role="${p.role||'unknown'}">${p.role?ROLES[p.role].name:'？'}</span>`
}
const roleName=(p,view)=>view?.teamMode?(view.sides[p.seat]===view.sides[view.seat]?'友方':'敌方'):ROLES[p.role].name
const formMarker=p=>p.incarnation?.activeHero?`<b class="fs-form-mark" title="七十二变：${esc(display({heroId:p.incarnation.activeHero}).name)}形态">形 · ${esc(display({heroId:p.incarnation.activeHero}).name)}</b>`:''
const faceMarker=p=>p.faceDown?'<span class="fs-face-down" aria-label="背面朝上，下次轮到自己时翻回正面并跳过回合">翻面 · 下回合休整</span>':''
// 自己的仙田标记渲染为可点击按钮：仙田既可减距离，也能作为「摄宝」（探囊取物）的代价。
// 引擎保证了「觉醒后有合法目标才出现可用的摄宝」，所以这里只负责给出入口，点击后再走引擎校验。
export const stateMarkers=(p,opts={})=>`<span class="fs-state-marks">${p.chained?'<b class="fs-chain-mark" title="已连环：属性伤害将传导" aria-label="已连环">⚭</b>':''}${p.buquPile?.length?`<b title="公开护道牌 ${p.buquPile.length} 张；点击人物查看点数" aria-label="护道牌${p.buquPile.length}张">护${p.buquPile.length}</b>`:''}${p.fieldPile?.length?(opts.fieldAction?`<button class="fs-field-mark ${(opts.selected||[]).some(id=>(p.fieldPile||[]).some(f=>f.id===id))?'selected':''}" data-action="${opts.fieldAction}" aria-label="仙田${p.fieldPile.length}张，点击当作摄宝使用" title="点击将一张仙田当摄宝（探囊取物）使用">田${p.fieldPile.length}</button>`:`<b aria-label="仙田${p.fieldPile.length}张" title="仙田减少距离；觉醒后可作为摄宝使用">田${p.fieldPile.length}</b>`):''}${p.skillsSealed?'<b title="人物技能已失效" aria-label="人物技能已失效">封</b>':''}</span>`
export const turnActive=(p,v)=>p.alive&&v.current===p.seat&&!v.winner
const turnBadge=(p,v)=>turnActive(p,v)?`<span class="fs-turn-badge" data-turn-seat="${p.seat}" aria-label="${display(p).name}当前回合">${v.phase==='play'?'出牌中':v.phase==='discard'?'弃牌中':v.phase==='judge'?'判定中':'回合中'}</span>`:''
export const delayLabel=type=>cardTitle(type)
const delays=(p,v)=>[...p.judgment.map(c=>c.type),...(v.pending?.kind==='reveal'&&v.pending.target===p.seat&&CARDS_BY_TYPE[v.pending.delayType]?.category==='delay'?[v.pending.delayType]:[])]
// 雷/牢标记：英雄杀式徽章图标。渐变 defs 在同页多枚时重复定义但内容一致，浏览器取首个即可。
const delayArt={
 supplyshortage:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="4" fill="#46372a" stroke="#e6c98a"/><path d="M7 18V8l5-3 5 3v10M5 11h14M7 15h10M4 4l16 16" fill="none" stroke="#efc478" stroke-width="2"/></svg>',
 lightning:'<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="fs-dlg" cx="50%" cy="34%" r="80%"><stop offset="0%" stop-color="#4a6ea8"/><stop offset="58%" stop-color="#24395c"/><stop offset="100%" stop-color="#131f33"/></radialGradient><linearGradient id="fs-dlb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fffbe0"/><stop offset="45%" stop-color="#ffe98a"/><stop offset="100%" stop-color="#f7b733"/></linearGradient></defs><circle cx="12" cy="12" r="10.6" fill="url(#fs-dlg)" stroke="#a9ccff" stroke-opacity=".7" stroke-width=".8"/><path d="M13.6 3.2 6.6 13.2h3.7l-2 7.6 7.4-10.4h-3.9l1.8-7.2z" fill="url(#fs-dlb)" stroke="#fff6c8" stroke-width=".7" stroke-linejoin="round"/><path d="M5.4 8.4l1.5 1.5M18.2 15.3l1.5 1.5M16.9 5.6l1.3-1.4" stroke="#cfe6ff" stroke-width=".9" stroke-linecap="round" stroke-opacity=".85"/></svg>',
 indulgence:'<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="fs-djg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a4128"/><stop offset="100%" stop-color="#2c1f13"/></linearGradient><linearGradient id="fs-djb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f6d492"/><stop offset="55%" stop-color="#caa050"/><stop offset="100%" stop-color="#8f6a2f"/></linearGradient></defs><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.6" fill="url(#fs-djg)" stroke="#e7c27e" stroke-opacity=".8" stroke-width=".9"/><path d="M7.4 5.8v12.4M12 5.8v12.4M16.6 5.8v12.4" stroke="url(#fs-djb)" stroke-width="2.1" stroke-linecap="round"/><path d="M5.6 9.2h12.8M5.6 14.8h12.8" stroke="#e7c27e" stroke-width="1.5" stroke-linecap="round" stroke-opacity=".95"/></svg>',
}
export const delayIcons=(p,v)=>delays(p,v).map(type=>`<b class="fs-delay-mark" data-delay="${type}" title="${delayLabel(type)}" aria-label="${delayLabel(type)}">${delayArt[type]||`<i>${delayLabel(type).slice(-1)}</i>`}</b>`).join('')
// 借刀/魅惑选择目标时的顺序语义徽章：借刀 ①持刀 → ②被杀；魅惑 ①决斗（发起方，后出杀）→ ②先出杀。
function targetSeqBadge(ui,view,seat){
  const i=ui.targets.indexOf(seat)
  if(i<0||i>1)return ''
  const mode=ui.skill==='lijian'?'lijian':!ui.skill?ui.currentAs(view):null
  const label=mode==='collateral'?['持刀','被杀'][i]:mode==='lijian'?['决斗','先出杀'][i]:null
  return label?`<b class="fs-target-seq" data-seq="${i+1}">${label}</b>`:''
}
export function renderOpponent(ui,p,view){
  const h=display(p),target=ui.targetable(view).includes(p.seat),active=turnActive(p,view)
  const mark=cleanRoleMarks(view,ui.roleMarks)[p.seat],marker=!view.teamMode&&!p.role&&p.alive?`<button class="fs-role-marker fs-identity role-${mark||'unknown'}" data-action="role-mark" data-value="${p.seat}" aria-label="${h.name}的身份猜测：${mark?ROLES[mark].name:'未标记'}。点击切换忠臣、反贼、内奸或清除" title="仅自己可见的身份猜测">${mark?{loyal:'忠',rebel:'反',renegade:'内'}[mark]:'？'}<i>猜</i></button>`:''
  return `<article class="fs-player faction-${h.faction} ${active?'turn-active':''} ${target?'targetable':''} ${ui.targets.includes(p.seat)?'target-selected':''} ${!p.alive?'fallen':''}" data-player="${p.seat}" data-equip-count="${Object.values(p.equip).filter(Boolean).length}" style="--equip-count:${Math.max(1,Object.values(p.equip).filter(Boolean).length)}">
    <button class="fs-player-main" data-action="target" data-value="${p.seat}" aria-label="${target?'选择目标':'查看'}${h.name}${!p.alive?'，已阵亡，'+roleName(p,view):''}">
      ${portrait(h)}${targetSeqBadge(ui,view,p.seat)}${formMarker(p)}${faceMarker(p)}${stateMarkers(p)}<span class="fs-portrait-shade"></span>${roleBadge(p,view)}<span class="fs-seat">${p.seat}号 · ${FACTIONS[h.faction]}</span>${turnBadge(p,view)}
      <span class="fs-player-info"><strong>${h.name}</strong>${playerResources(p)}</span>
      ${!p.alive?`<span class="fs-death-banner" data-revealed-role="${p.role}">已阵亡 · ${roleName(p,view)}</span>`:''}
      ${delays(p,view).length?`<span class="fs-player-delays">${delayIcons(p,view)}</span>`:''}
    </button>${marker}<div class="fs-opponent-equipment" data-scroll="equip-${p.seat}">${ui.equipment(p)}</div>
  </article>`
}
function takeChoices(ui,view){
  const pending=view.pending,target=view.players[pending.target],options=view.legal.map((a,i)=>({...a,index:i})),zones=[...new Set(options.map(a=>a.zone||'hand'))]
  const zone=zones.includes(ui.choiceZone)?ui.choiceZone:zones[0],names={hand:'手牌',equipment:'装备',judgment:'判定区'},mode=ui.state.pending.mode==='snatch'?'获得':'弃置'
  return `<section class="fs-center-choice fs-choice-dialog fs-take-choice" role="group" aria-label="选择${display(target).name}的区域牌">
    <header><div><small>${mode==='获得'?'摄宝 · 取一张牌':'破阵 · 弃一张牌'}</small><strong>选择${display(target).name}的一张牌</strong></div><span>${mode}</span></header>
    <div class="fs-choice-tabs">${zones.map(z=>`<button data-action="choice-zone" data-value="${z}" aria-pressed="${z===zone}" class="${z===zone?'selected':''}">${names[z]} <b>${options.filter(a=>(a.zone||'hand')===z).length}</b></button>`).join('')}</div>
    <div class="fs-center-card-list" data-scroll="choice-${zone}">${options.filter(a=>(a.zone||'hand')===zone).map(a=>{const eff=!a.hidden&&CARDS_BY_TYPE[a.card.type]?.category==='equip'?equipEffect(CARDS_BY_TYPE[a.card.type]):'';return `<button data-action="take-choice" data-value="${a.index}" data-prompt="${pending.id}" data-revision="${view.revision}" class="fs-choice-card ${ui.choiceIndex===a.index?'selected':''}" aria-pressed="${ui.choiceIndex===a.index}" aria-label="${a.hidden?a.label:CARDS_BY_TYPE[a.card.type].name}">${a.hidden?cardBack(a.label):cardFace(a.card)}${eff?`<b class="fs-choice-effect">${eff}</b>`:''}</button>`}).join('')}</div>
    <footer><span>${zone==='hand'?'暗手牌只显示牌背':'明置牌可查看牌面'} · 再点已选牌或双击直接${mode}</span><button data-action="choose-confirm" data-prompt="${pending.id}" data-revision="${view.revision}" class="fs-primary" ${ui.choiceIndex==null?'disabled':''}>${mode}选中牌</button></footer>
  </section>`
}
export function renderCenter(ui,view){
  const extra=extensionChoice(ui,view);if(extra)return extra
  if(view.pending?.kind==='incarnation'){
    if(view.pending.actor!==0)return `<section class="fs-center-choice fs-skill-prompt"><header><strong>${seatName(view,view.pending.actor)}正在选择变身</strong></header><p>未展示的变身牌只有本人可见。</p></section>`
    const choices=view.legal.map((a,index)=>({...a,index})),ids=[...new Set(choices.filter(a=>a.type==='transform').map(a=>a.heroId))],pass=choices.find(a=>a.type==='pass'),selected=panelAction(view,ui.panelSelection)
    const attrs=a=>`data-action="panel-choice" data-value="${a.index}" data-prompt="${view.pending.id}" data-revision="${view.revision}" aria-pressed="${selected?.heroId===a.heroId&&selected?.skill===a.skill}"`
    return `<section class="fs-center-choice fs-choice-dialog fs-incarnation-choice" aria-label="七十二变选择"><header><strong>七十二变 · 选择形态与一个技能</strong><small>${view.pending.required?'首次变身，请选择技能':'可更换形态，也可保留当前技能'}</small></header><div class="fs-incarnation-options" data-scroll="incarnations">${ids.map(id=>{const h=display({heroId:id}),options=choices.filter(a=>a.heroId===id);return `<article class="fs-incarnation-entry ${selected?.heroId===id?'selected':''}"><button class="fs-form-portrait" ${attrs(options[0])} aria-label="选择${h.name}形态">${portrait(h)}</button><div><strong>${h.name}</strong>${options.map(a=>`<button ${attrs(a)} class="${selected?.heroId===id&&selected.skill===a.skill?'selected':''}" aria-label="选择${h.name}，借用${h.skillNames[a.skill]}"><b>${h.skillNames[a.skill]}</b><small>${esc(skillHelp(h,a.skill))}</small></button>`).join('')}</div></article>`}).join('')}</div><footer><span aria-live="polite">${selected?`${display({heroId:selected.heroId}).name} · ${skillName(selected.heroId,selected.skill)}`:'先选形态与技能，再确认'}</span><button data-action="panel-confirm" data-prompt="${view.pending.id}" data-revision="${view.revision}" class="fs-primary" ${!selected?'disabled':''}>确认变身</button>${pass?`<button data-action="response" data-value="${pass.index}" class="fs-secondary">保留当前形态</button>`:''}</footer></section>`
  }
  if(view.pending?.kind==='guanxing'){
    if(view.pending.actor!==0)return `<section class="fs-center-choice"><header><strong>${seatName(view,view.pending.actor)}正在推演</strong></header><p>其他玩家不能查看推演的牌。</p></section>`
    const pool=view.legal.find(a=>a.type==='arrange').pool
    if(!ui.star||ui.star.id!==view.pending.id)ui.star={id:view.pending.id,top:pool.map(c=>c.id),bottom:[]}
    return `<section class="fs-center-choice fs-star-choice" aria-label="推演牌序"><header><strong>推演 · 排列牌堆</strong></header><div class="fs-star-rows">${['top','bottom'].map(zone=>`<section class="fs-star-zone" data-star-zone="${zone}"><h4>${zone==='top'?'牌堆顶':'牌堆底'} · 左侧先摸</h4><div class="fs-center-card-list" data-scroll="stars-${zone}">${ui.star[zone].map((id,i)=>{const c=pool.find(c=>c.id===id);return `<button class="fs-choice-card fs-star-card" data-action="star-move" data-id="${id}" aria-label="${cardTitle(c.type)} ${SUITS[c.suit]}${c.rank}，${zone==='top'?'牌顶':'牌底'}第${i+1}张，点击移至${zone==='top'?'牌底':'牌顶'}">${cardFace(c)}</button>`}).join('')||'<small>将牌拖到这里</small>'}</div></section>`).join('')}</div><footer>拖动调整顺序或换排；也可点牌换排。键盘左右排序、上下换排。<div class="fs-star-actions"><button data-action="confirm" class="fs-primary">确认牌序</button><button data-action="response" data-value="1" class="fs-secondary">原序放回牌顶</button></div></footer></section>`
  }
  if(view.pending?.kind==='liuli')return `<section class="fs-center-choice fs-skill-prompt"><header><strong>${skillName(view.players[view.pending.actor],'liuli')} · 转移攻击</strong></header><p>弃一张手牌或装备，选择弃牌后仍在你攻击范围内的角色；不能转给原攻击者。</p></section>`
  if(view.pending?.kind==='yiji'){
    const own=view.pending.actor===0,pool=view.yijiPool||[]
    // 本人：中央弹窗翻出本次摸的牌（不进手牌区），可一次多选后统一交给同一名接收者。
    // 牌池列表始终可见（选牌不再收起弹窗），接收者做进面板内，配合底部「确认赠牌」一次交出多张。
    if(own&&pool.length){
      const targets=ui.targetable(view).filter(t=>t!==0),chosen=ui.targets[0]
      const recipients=targets.length?`<div class="fs-yiji-targets" role="group" aria-label="选择接收者"><span>交给</span>${targets.map(t=>`<button data-action="target" data-value="${t}" class="${chosen===t?'selected':''}" aria-pressed="${chosen===t}">${esc(display(view.players[t]).name)}</button>`).join('')}</div>`:''
      const note=ui.selected.length?(chosen?`已选 ${ui.selected.length} 张 → ${esc(display(view.players[chosen]).name)}，点「确认赠牌」送出`:`已选 ${ui.selected.length} 张，请选择接收者`):'点选要送出的牌，可一次选多张；也可以保留剩余牌'
      return `<section class="fs-center-choice fs-pool-choice fs-yiji-choice" role="group" aria-label="传道分牌"><header><strong>${skillName(view.players[0],'yiji')} · 分配新摸的 ${pool.length} 张牌</strong><small>翻开的牌只有你能看见，原有手牌不能送出</small></header><div class="fs-center-card-list" data-scroll="pool">${pool.map((c,i)=>`<button class="fs-choice-card ${ui.selected.includes(c.id)?'selected':''}" style="animation-delay:${i*70}ms" data-yiji-card="${c.id}" data-action="card" data-id="${c.id}" aria-pressed="${ui.selected.includes(c.id)}" aria-label="${cardTitle(c.type)}">${cardFace(c)}</button>`).join('')}</div>${recipients}<footer><span aria-live="polite">${note}</span></footer></section>`
    }
    // 他人（含 AI）传道：不展示对方的暗牌背——牌背既看不出内容，又会被窄面板裁断；
    // 给牌去向已由飞牌动画表达，这里只留一句等待提示。
    return `<section class="fs-center-choice fs-skill-prompt fs-yiji-wait"><header><strong>${skillName(view.players[view.pending.actor],'yiji')} · 分配新获得的牌</strong></header><p>${'等待'+seatName(view,view.pending.actor)+'分配'}</p></section>`
  }
  if(view.pending?.kind==='tuxi')return `<section class="fs-center-choice fs-skill-prompt"><header><strong>${skillName(view.players[view.pending.actor],'tuxi')}</strong></header><p>不从牌堆摸牌，改为取得一至两名其他角色各一张手牌。请点亮人物，再确认；也可以正常摸两张。</p></section>`
  if(view.pending?.actor===0&&view.pending.kind==='take')return takeChoices(ui,view)
  const picks=publicPicks(view)
  if(view.pending?.kind==='ext')return playedCenter(view,ui)
  if(view.lastPlayed?.as==='harvest'&&(view.harvestPool?.length||picks.length)&&view.lastPlayed.turn===view.turns){
    // 仙山采宝的牌池在打出时即公开：即便正在询问破法（无懈），也保留选牌面板，
    // 让持有无懈的玩家边看牌池边决定是否抵消，而不是把面板整个藏起来、不发动才恢复。
    const countering=view.pending?.kind==='counter'
    // 全部选完后短暂展示结果即自动收起；破法询问期间不收起，避免面板忽隐忽现。
    if(!countering&&view.pending?.kind!=='pick'){
      if(ui.harvestDoneId!==view.lastPlayed.id){ui.harvestDoneId=view.lastPlayed.id;ui.harvestDoneAt=Date.now();setTimeout(()=>{if(!ui.destroyed)ui.render()},1500)}
      else if(Date.now()-ui.harvestDoneAt>1400)return playedCenter(view,ui)
    }
    const selected=panelAction(view,ui.panelSelection),picking=view.pending?.kind==='pick',own=picking&&view.pending.actor===view.seat
    const note=countering?'等待破法结算':picking?(own?'请选择一张牌':display(view.players[view.pending.actor]).name+'正在选牌'):'选牌完成'
    return `<section class="fs-center-choice fs-choice-dialog fs-pool-choice" role="group" aria-label="仙山采宝"><header><strong>仙山采宝</strong><small>${note}</small></header><div class="fs-center-card-list" data-scroll="pool">${(view.harvestPool||[]).map(c=>{const i=view.legal.findIndex(a=>a.type==='choose'&&a.value===c.id);return `<button class="fs-choice-card ${selected?.value===c.id?'selected':''}" data-pool-card="${c.id}" data-action="panel-choice" data-value="${i}" data-prompt="${view.pending?.id}" data-revision="${view.revision}" aria-pressed="${selected?.value===c.id}" ${!own||i<0?'disabled':''} aria-label="${cardTitle(c.type)}">${cardFace(c)}</button>`}).join('')}${picks.map(p=>`<div class="fs-choice-card fs-harvest-picked" data-pool-card="${p.card.id}" data-picked-by="${p.source}">${cardFace(p.card)}<b>${display(view.players[p.source]).name}</b><small>已选 ${cardTitle(p.card.type)}</small></div>`).join('')}</div><footer><span aria-live="polite">${own?(selected?'已选 '+cardTitle(selected.card.type):'选牌后确认；再点已选牌也可直接获取'):countering?'先决定是否破法':picking?'等待选牌':'选牌完成'}</span>${own?`<button class="fs-primary" data-action="panel-confirm" data-prompt="${view.pending.id}" data-revision="${view.revision}" ${!selected?'disabled':''}>获取选中牌</button>`:''}</footer></section>`
  }
  // While a recipient's trick is being countered, keep portraits and lines visible.
  if(view.pending?.kind==='counter')return playedCenter(view,ui)
  // 公开弃置/拆牌：丢掉的牌短暂摆到牌桌中间（与出牌同一行）看清后自动收起，不用单独弹窗、不用点关闭。
  // 偷牌取走的是暗手牌，不公开，不发线索，因此这里不会出现。
  return playedCenter(view,ui)
}
function playedCenter(view,ui){
  const entries=trailCards(tableTrail(ui?.tableTrail||[],view,{closedChain:ui?.closedTableChain})),p=view.pending
  // 当前正在翻出的判定牌 id：改判询问牌与最终判定牌共用同一张牌面，命中/落空的戳记盖在这张牌上。
  const judgeCardId=p?.kind==='reveal'?p.card?.id:p?.kind==='judge-replace'?view.judgmentCard?.id:null
  const publicRows=ui?.discards?.cards?.length?`<div class="fs-played fs-public-discard" data-discard-seat="${ui.discards.seat}" role="status" aria-label="${display(view.players[ui.discards.seat]).name}${ui.discards.by!=null?'被拆掉':'弃置'}的牌">${ui.discards.cards.map(c=>`<span class="fs-card-play fs-discard-card" aria-label="${cardTitle(c.type)}">${cardFace(c)}</span>`).join('')}</div>`:''
  // 出牌行还在（未淡出）且这次公开弃置只有一两张（如落宝/拆牌）时，弃置牌并排在出牌行右侧而不是盖住它。
  const trailVisible=entries.length&&!ui?.tableSettleFrame?.fading,discardSmall=ui?.discards?.cards?.length&&ui.discards.cards.length<=2
  return `<div class="fs-table-center fs-compact-table${trailVisible?' fs-has-trail':''}${discardSmall?' fs-discard-small':''}" role="group" aria-label="公开出牌与判定"><div class="fs-played fs-table-trail ${ui?.tableSettleFrame?.fading?'is-settled':''}">${entries.map(e=>{
    const c=e.card,converted=e.as&&e.as!==c.type&&!CARDS_BY_TYPE[c.type]?.attackNature,face=c,judging=!!judgeCardId&&e.judgment&&e.card?.id===judgeCardId,m=e.judgment&&e.hit!=null?judgmentMark(e):null,label=seatName(view,e.source)+' · '+(e.judgment?(displayText(e.label)||'判定'):e.virtualType?'技能虚拟牌 · 无实体花色点数':converted?'作为'+cardTitle(e.as)+'使用':e.response?'响应':cardTitle(e.as||c.type))
    return `<span class="fs-card-play ${e.currentEffect?'is-current-effect':''} ${e.judgment?'fs-table-judgment':''} ${judging?'is-revealing':''} ${e.negated?'is-negated':''}" data-trail-key="${esc(e.key)}" data-table-card="${esc(c.id||'')}" data-card-source="${e.source}" ${e.judgment?`data-judge-card="${c.id}" data-judge-kind="${e.judgeKind||'replace'}"`:''} aria-label="${esc(label)}">${cardFace(face)}${m?`<b class="fs-judge-stamp ${m.hit?'hit':'miss'}" data-judge-hit="${m.hit}" aria-label="${m.label}">${m.symbol}</b>`:e.negated?'<b class="fs-effect-cancel" aria-label="效果已被抵消">×</b>':''}<small class="fs-sr-only">${esc(label)}</small></span>`
  }).join('')}</div>${publicRows}</div>`
}
function playInstruction(ui,view){
  if(EXT_ACTIVE.has(ui.skill)){const n=skillName(view.players[0],ui.skill),help={tiaoxin:'选择攻击范围包含你的对手：要求他对你出杀，否则弃置其一张牌',zhijian:'选一张装备手牌，再选择对应装备槽为空的其他角色',jixi:'先从中央选择一张仙田，再选择摄宝目标',zhiba:'选择主公拼点：若你未赢，主公可收取两张拼点牌',luanji:'选两张相同花色手牌，作为飞剑齐发使用；保留原牌面',huangtian:'选一张闪或天雷劫，再点亮主公交牌',quhu:'选择体力更高且有手牌的对手，确认后拼点',tianyi:'选择有手牌的对手，确认后拼点',ganlu:'选择两名角色交换装备，可选自己',dimeng:'选两名其他角色，再弃等于其手牌差的牌',anxu:'选择手牌数不同的两名其他角色',xueji:'选一张红色牌，再选范围内的伤害目标',luanwu:'每局一次：令其他角色攻击最近的人，否则失体力',jiushi:'翻面，下一张杀伤害加一；下次自己的回合将休整',lianhuan:'选一张梅花手牌重铸摸一张；直接选牌也可转换为缚神索'};return n+' · '+(help[ui.skill]||'按技能说明选牌与目标')}
  if(ui.skill==='qiangxi')return ui.selected.length?'雷锤：弃选中的武器，对范围内目标造成一点伤害':'雷锤：直接选目标将失去一点体力；也可先选武器作为代价'
  if(ui.skill)return `${skillName(view.players[0],ui.skill)}：${ui.skill==='lijian'?'弃一张牌，先选决斗发起者，再选先出杀者（两名其他男性）':ui.skill==='rende'?'选择要交出的手牌，再选择接收者':ui.skill==='zhiheng'?'选择要替换的手牌或装备':ui.skill==='jieyin'?'选择两张手牌，再选择一名受伤男性':ui.skill==='kurou'?'失去一点体力，摸两张牌；可以连续发动，请留意濒死风险':ui.skill==='qingnang'?'选择一张手牌，再选择受伤角色（包括自己）':'点击人物选择目标'}`
  const as=ui.currentAs(view)
  if(ui.selected.length&&(ui.guhuoMode||ui.matching(view).some(a=>a.guhuo&&a.as===as)))return '妖言 · 声明'+cardTitle(as)+'，选好目标后确认'
  if(!ui.selected.length)return ui.hints===false?'你的出牌阶段':'你的出牌阶段 · 先选手牌，再选目标，最后确认'
  if(!as)return '这张牌只能在对应的响应窗口使用'
  if(as==='collateral')return ui.targets.length===2?'持刀者和被杀目标已选，请确认':ui.targets.length?'再选择被杀目标，也可以选择自己':'借宝诛敌 · 先选持武器的角色'
  if(as==='ironchain')return `${cardTitle(as)} · 选择一至两名角色${ui.chainReset?'解除连环':'进入连环'}${ui.targets.length?'，目标已选，请确认':'，最后确认'}`
  return `${cardTitle(as)} · ${ui.targetable(view).length?ui.targets.length?'目标已选，请确认':'点击人物选择目标':'对自己或全场使用，请确认'}`
}
function operation(ui,v){
  if(ui.online?.roundBreak)return ''
  if(['guanxing','counter','reveal','judge-replace'].includes(v.pending?.kind))return ''
  if(!ui.paused&&!v.winner&&(ui.transfer||ui.draws?.length||ui.moves?.length||!v.pending&&v.current!==0))return ''
  let title='',hint=''
  if(ui.paused)title='牌局已暂停'
  else if(v.winner){title=ui.won()?'你获胜了':'本局结束';hint=v.teamMode?(v.winner==='0'?'友方获胜':'敌方获胜'):ROLES[v.winner].name+'阵营获胜'}
  else if(v.pending?.kind==='reveal'){title=seatName(v,v.pending.target)+'正在进行'+(v.judgmentLabel||CARDS_BY_TYPE[v.pending.delayType]?.name||v.pending.delayType)+'判定';hint='判定牌公开翻到中央，展示完自动继续'}
  else if(ui.transfer){title=ui.transfer.mode==='snatch'?'正在取走目标的牌':'正在弃置目标的牌';hint='等移牌动画完成后继续'}
  else if(ui.draws?.length){const d=ui.draws[0];title=`${seatName(v,d.target)} · 天机显化，摸 ${d.count} 张牌`;hint='牌堆 → 手牌 · 摸牌后继续'}
  else if(ui.auto&&!v.pending&&v.current===0){title='AI托管中 · 正在替你出牌';hint='点击“接管”即可恢复自己操作'}
  else if(v.pending?.actor===0){title=extensionPrompt(v)||responsePrompt(v)||ui.pendingText(v);hint=ui.hints===false?'':(v.pending.kind==='take'?'再点已选牌即可完成':'选好手牌后确认，也可以放弃')}
  else if(v.pending){title=display(v.players[v.pending.actor]).name+'正在响应…'}
  else if(v.current===0&&v.players[0].alive)title=playInstruction(ui,v)
  else title=display(v.players[v.current]).name+'的回合 · '+(v.players[0].alive?'等待出牌':'你已阵亡，正在观战')
  // 状态提示改为牌面上方的浮空文字，不占布局、不遮挡操作（英雄杀式桌面）。
  return `<div class="fs-status" aria-live="polite"><strong>${esc(title)}</strong>${hint?`<small class="fs-teaching-hint">${esc(hint)}</small>`:''}</div>`
}
export function renderControls(ui,v){
  if(ui.online?.roundBreak)return ui.online.roundControls()
  if(ui.paused)return `<div class="fs-action-row"><button data-action="pause" class="fs-primary">继续对局</button></div>`
  if(v.winner)return `<div class="fs-action-row"><button data-action="quit-confirm" class="fs-primary">再开一局</button><button data-action="report" class="fs-secondary">${v.teamMode?'胜负一览':'身份揭晓'}</button></div>`
  if(v.pending?.kind==='reveal'||v.pending?.kind==='ext'&&v.extension.stage==='reveal'||ui.transfer||ui.draws?.length||ui.moves?.length)return `<div class="fs-action-row fs-idle-controls"><span>动画展示中 · 自动继续</span></div>`
  if(ui.auto)return `<div class="fs-action-row"><button data-action="auto" class="fs-primary">接管 · 由我操作</button></div>`
  const extra=extensionControls(ui,v);if(extra)return extra
  if(v.pending?.actor===0){
    const response=actualResponseControls(ui,v);if(response)return response
    if(v.pending.kind==='counter'){
      // 群体锦囊是逐个目标结算的：破法只能抵消"当前这位目标"的效果。牌桌上画的是全体连线，
      // 所以必须在按钮旁点名本次抵消的是谁，否则玩家会以为一次破法能护住整张牌（含他关心的反贼）。
      const answer=counterAction(v,ui.selected,{blockedUntil:ui.counterLockUntil}),pass=v.legal.findIndex(a=>a.type==='pass')
      const spell=CARDS_BY_TYPE[v.pending.cardType]?.name||'该锦囊',victim=v.pending.target!=null?seatName(v,v.pending.target):null
      const note=v.pending.negated?`再次破法：恢复${spell}对${victim||'该角色'}的效果`:victim?`破法：抵消${spell}对${victim}的效果`:`破法：抵消${spell}的效果`
      return `<div class="fs-action-row fs-counter-controls" aria-label="破法响应"><span class="fs-counter-note">${esc(note)}</span><button data-action="confirm" class="fs-primary" ${!answer?'disabled':''} aria-label="${esc(note)}">发动破法</button><button data-action="response" data-value="${pass}" class="fs-secondary">不发动</button></div>`
    }
    if(v.pending.kind==='incarnation')return `<div class="fs-action-row fs-idle-controls"><span>请在变身面板选择技能</span></div>`
    if(v.pending.kind==='guanxing')return `<div class="fs-action-row fs-idle-controls"><span>请在推演面板确认牌序</span></div>`
    if(v.pending.kind==='shensu'){const can=v.legal.some(a=>a.type==='rush'&&a.target===ui.targets[0]&&a.ids.length===ui.selected.length&&a.ids.every(id=>ui.selected.includes(id))),pass=v.legal.findIndex(a=>a.type==='pass');return `<div class="fs-action-row"><button data-action="confirm" class="fs-primary" ${!can?'disabled':''}>确认疾行</button><button data-action="response" data-value="${pass}" class="fs-secondary">${v.pending.mode===1?'正常判定与摸牌':'正常出牌'}</button><button data-action="clear" class="fs-clear">重选</button></div>`}
    if(v.pending.kind==='judge-replace'){const answer=v.legal.find(a=>a.type==='respond'&&a.ids.length===ui.selected.length&&a.ids.every(id=>ui.selected.includes(id))),pass=v.legal.findIndex(a=>a.type==='pass');return `<div class="fs-action-row"><button data-action="confirm" class="fs-primary" ${!answer?'disabled':''}>确认改判</button><button data-action="response" data-value="${pass}" class="fs-secondary">不改判</button></div>`}
    if(v.pending.kind==='liuli')return `<div class="fs-action-row"><button data-action="confirm" class="fs-primary" ${!v.legal.some(a=>a.type==='redirect'&&a.target===ui.targets[0]&&a.ids.length===ui.selected.length&&a.ids.every(id=>ui.selected.includes(id)))?'disabled':''}>确认转移</button><button data-action="response" data-value="0" class="fs-secondary">不转移</button><button data-action="clear" class="fs-clear">重选</button></div>`
    if(v.pending.kind==='yiji')return `<div class="fs-action-row"><button data-action="confirm" class="fs-primary" ${!ui.selected.length||!ui.targets.length?'disabled':''}>确认赠牌</button><button data-action="response" data-value="0" class="fs-secondary">保留剩余牌</button><button data-action="clear" class="fs-clear">重选</button></div>`
    if(v.pending.kind==='tuxi')return `<div class="fs-action-row"><button data-action="confirm" class="fs-primary" ${ui.targets.length<1?'disabled':''}>确认取得手牌</button><button data-action="response" data-value="0" class="fs-secondary">正常摸两张</button><button data-action="clear" class="fs-clear">重选</button></div>`
    const pending=v.pending,answers=v.legal.filter(a=>a.type==='respond'),options=v.legal.map((a,i)=>({a,i})).filter(({a})=>!['respond','discard'].includes(a.type))
    if(pending.kind==='take')return `<div class="fs-action-row fs-idle-controls"><span>点选中央的牌，再点一次即可${ui.state.pending.mode==='snatch'?'获得':'弃置'}</span></div>`
    if(pending.kind==='pick')return `<div class="fs-action-row"><span class="fs-choice-note">请在中央亮出的牌中选择</span></div>`
    const canConfirm=pending.kind==='discard'?ui.selected.length===pending.count:answers.some(a=>a.ids.length===ui.selected.length&&a.ids.every(id=>ui.selected.includes(id)))
    return `<div class="fs-action-row">${answers.length||pending.kind==='discard'?`<button data-action="confirm" class="fs-primary" ${!canConfirm?'disabled':''}>${pending.kind==='discard'?'确认弃牌':pending.kind==='counter'?'使用破法':'确认响应'}</button>`:''}${options.map(({a,i})=>`<button data-action="response" data-value="${i}" class="fs-secondary">${esc(displayText(a.type==='pass'?'放弃':a.type==='bagua'?'杏黄旗判定':a.type==='support'?'请求援助':a.type==='choose'?a.label||SUITS[a.value]||a.value:'选项'))}</button>`).join('')}<button data-action="clear" class="fs-clear">重选</button></div>`
  }
  if(v.pending||v.current!==0||!v.players[0].alive)return `<div class="fs-action-row fs-idle-controls"><button data-action="report" class="fs-secondary">查看战报</button><span>${v.pending?'等待'+seatName(v,v.pending.actor)+'响应':v.players[0].alive?'等待你的回合':'观战中 · 身份始终可见'}</span></div>`
  if(ui.skill==='luanji'){const can=v.legal.some(a=>a.type==='play'&&a.as==='arrows'&&a.ids.length===2&&ui.selected.length===2&&a.ids.every(id=>ui.selected.includes(id)));return `<div class="fs-action-row"><button data-action="clear" class="fs-clear">重选</button><button data-action="confirm" class="fs-primary" ${can?'':'disabled'}>发动万剑</button><button data-action="end" class="fs-secondary">结束出牌</button></div>`}
  if(ui.skill==='huangtian'){const can=ui.selected.length===1&&v.players[0].hand.some(c=>c.id===ui.selected[0]&&['shan','lightning'].includes(c.type))&&v.legal.some(a=>a.skill==='huangtian'&&a.target===ui.targets[0]);return `<div class="fs-action-row"><button data-action="clear" class="fs-clear">重选</button><button data-action="confirm" class="fs-primary" ${can?'':'disabled'}>归灯 · 交牌</button><button data-action="end" class="fs-secondary">结束出牌</button></div>`}
  const opts=ui.matching(v),as=ui.currentAs(v),variants=[...new Set(opts.map(a=>a.as))],natural=v.players[0].hand.find(c=>c.id===ui.selected[0])?.type
  const conversions=variants.length>1||variants.length===1&&(as!==natural||!variants.includes(as))?`<div class="fs-conversions">${variants.map(a=>`<button data-action="as" data-value="${a}" class="${a===as?'selected':''}">当${CARDS_BY_TYPE[a].name}</button>`).join('')}</div>`:''
  const selfTarget=as==='collateral'&&ui.targetable(v).includes(0)&&!ui.targets.includes(0)?'<button class="fs-self-target fs-secondary" data-action="target" data-value="0">让他杀我</button>':''
  const chainMode=as==='ironchain'?`<button class="fs-secondary" data-action="chain-mode" aria-pressed="${!!ui.chainReset}">${ui.chainReset?'改为连接':'改为解除'}</button>`:''
  return `<div class="fs-action-row">${conversions}${selfTarget}${chainMode}<button data-action="clear" class="fs-clear">重选</button><button data-action="confirm" class="fs-primary" ${!ui.skill&&!ui.selected.length?'disabled':''}>${ui.skill?'发动'+skillName(v.players[0],ui.skill):'确认出牌'}${ui.targets.length?' · '+ui.targets.map(t=>display(v.players[t]).name).join('、'):''}</button><button data-action="end" class="fs-secondary">结束出牌</button></div>`
}
export function renderBattle(ui){
  const v=playerView(ui.state,0),p=v.players[0],h=display(p),selfTarget=ui.targetable(v).includes(0),selfSelected=ui.targets.includes(0)
  // Render-only effective suit projection, never mutate the inventory.
  p.hand=p.hand.map(c=>effectiveCard(p,c))
  // 回合与牌堆合并为一枚浮空芯片（英雄杀式左上角），不再独占一行。
  // 思考倒计时是自己出牌的计时，浮在自己的牌区里。
  const hud=`<div class="fs-hud" aria-label="牌局信息"><span class="fs-hud-turns">第 ${v.turns} 回合</span><span class="fs-deck-stack" aria-label="牌堆剩余 ${v.deckCount} 张"><b>牌堆</b><span>${v.deckCount}</span></span></div>`
  const timer=ui.clock?.key?`<span class="fs-timer" aria-label="思考倒计时"><b data-seconds>${ui.clock.seconds}s</b></span>`:''
  const ready=new Set(v.pending?.kind==='counter'&&v.pending.actor===0?v.legal.filter(a=>a.type==='respond').flatMap(a=>a.ids):[])
  return `${ui.header()}
    <main class="fs-arena" data-seats="${v.players.length}">${hud}<div class="fs-players" data-seats="${v.players.length}">${v.players.slice(1).map(x=>renderOpponent(ui,x,v)).join('')}</div>${renderCenter(ui,v)}${operation(ui,v)}${selectedCardHint(ui,v)}${ui.online?.roundSummaryHtml()||''}</main>
    <section class="fs-dock"><div class="fs-own-panel" data-skill-count="${Object.keys(h.skillNames).length}"><div class="fs-own-hero ${turnActive(p,v)?'turn-active':''} ${p.alive?'':'fs-own-fallen'} ${selfTarget?'targetable':''} ${selfSelected?'target-selected':''}"><button data-action="${selfTarget||selfSelected?'target':'hero-detail'}" data-value="0" data-id="${h.id}" aria-label="${selfTarget?'选择自己作为目标':'查看'+h.name}">${portrait(h)}${targetSeqBadge(ui,v,0)}${delays(p,v).length?`<span class="fs-own-delays" aria-label="你的判定区">${delayIcons(p,v)}</span>`:''}</button>${stateMarkers(p,{fieldAction:'field-use',selected:ui.selected})}<div>${formMarker(p)}${turnBadge(p,v)}<small>${FACTIONS[h.faction]} · ${p.alive?h.title:'已阵亡，观战中'}</small><strong>${h.name}</strong><button data-action="identity" class="fs-own-role-button" aria-label="${v.teamMode?'你的阵营：'+roleName(p,v):'你的身份：'+ROLES[p.role].name}">${roleBadge(p,v,true)}<span>${v.teamMode?'你的阵营':'你的身份'}</span></button></div></div><div class="fs-own-skills" data-scroll="skills">${ui.skills(p,v)}</div><div class="fs-own-equipment" data-scroll="equipment">${ui.equipment(p,true)}</div></div>
    <div class="fs-hand-area"><div class="fs-hand-heading">${playerResources(p)}${timer}<span>${ui.selected.length?'已选 '+ui.selected.length+' 张':'左右滑动 · 点牌抽起'}</span><button data-action="hand">展开手牌</button></div><div class="fs-hand" data-scroll="hand">${p.hand.length?`<div class="fs-hand-row">${p.hand.map(c=>`<button class="fs-hand-card ${ui.selected.includes(c.id)?'selected':''} ${ready.has(c.id)?'counter-ready':''}" data-action="card" data-id="${c.id}" aria-label="${cardTitle(c.type)} ${SUITS[c.suit]}${c.rank}" aria-pressed="${ui.selected.includes(c.id)}">${cardFace(c)}</button>`).join('')}</div>`:'<div class="fs-empty">手中无牌 · 静观其变</div>'}</div><div class="fs-actions">${renderControls(ui,v)}</div></div></section>`
}
