import {heroForBase} from './theme.mjs'
export const seatName=(view,seat)=>seat==null?'天雷':`${heroForBase(view.players[seat]?.heroId)?.name||'角色'}${seat===view.seat?'（你）':`（${seat}号）`}`
// Public-only pending metadata: never inspect another player's hand or role.
export function combatContext(view){
  const p=view.pending,e=p?.context
  if(e?.type==='collateral')return {source:p.actor,target:e.victim,commandedBy:e.source,kind:'command',text:`${seatName(view,e.source)}借刀：${seatName(view,p.actor)} → 杀 → ${seatName(view,e.victim)}`,hint:`持刀者打出杀，否则交出武器`}
  if(e&&['attack','attackDamage'].includes(e.type))return {source:e.source,target:e.target,kind:'attack',text:`${seatName(view,e.source)} → 杀 → ${seatName(view,e.target)}`,hint:p.kind==='response'?`${seatName(view,p.actor)}需出${p.remaining>1?p.remaining+' 张':''}闪；放弃将受伤`:p.kind==='support'?`${seatName(view,p.actor)}正在提供闪援助`:'正在结算武器或技能'}
  if(e?.type==='duel')return {source:e.source,target:e.target,kind:'duel',text:`${seatName(view,e.source)} ↔ 决斗 ↔ ${seatName(view,e.target)}`,hint:`${seatName(view,p.actor)}需出${p.remaining>1?p.remaining+' 张':''}杀；这不是普通攻击`}
  if(e?.type==='aoe')return {source:e.source,target:e.target,kind:'aoe',text:`${seatName(view,e.source)} → ${p.as==='sha'?'南蛮入侵':'万箭齐发'} → ${seatName(view,e.target)}`,hint:`${seatName(view,p.actor)}需出${p.as==='sha'?'杀':'闪'}抵御；放弃将受伤`}
  // Only retain a recent completed attack when it still belongs to the last
  // played card. A later heal, draw or new turn must not imply a live attack.
  const cue=view.logs.find(l=>['attack','dodge','damage','blocked'].includes(l.cue?.kind)&&l.id>=(view.lastPlayed?.id??Infinity))?.cue
  if(!p&&['sha','collateral'].includes(view.lastPlayed?.as)&&view.lastPlayed.turn===view.turns&&cue)return {source:cue.source,target:cue.target,kind:cue.kind,text:`${seatName(view,cue.source)} → 杀 → ${seatName(view,cue.target)}`,hint:cue.kind==='dodge'?'已打出闪 · 伤害被抵消':cue.kind==='damage'?`已受到 ${cue.amount} 点伤害`:cue.kind==='blocked'?'防具挡下了这张杀':'杀正在结算'}
  return null
}
export function damageCues(before,after){return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='damage').slice().reverse().map(l=>({...l.cue,id:l.id}))}
export function collateralSelection(targets,seat){
  if(!targets.length)return [seat]
  if(seat===targets[0])return []
  return seat===targets[1]?[targets[0]]:[targets[0],seat]
}
