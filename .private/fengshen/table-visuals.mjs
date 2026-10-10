import {combatContext} from './combat.mjs'
export const tutorialEnabled=preferences=>preferences?.hints!==false
export function targetLinks(view,{targets=[],as=null}={}){
 if(targets.length){if(as==='collateral')return [{source:0,target:targets[0]},...(targets.length>1?[{source:targets[0],target:targets[1]}]:[])]
  return targets.map(target=>({source:0,target}))}
 const battle=combatContext(view)
 if(battle?.kind==='aoe')return view.players.filter(p=>p.alive&&p.seat!==battle.source).map(p=>({source:battle.source,target:p.seat}))
 if(battle&&view.lastPlayed?.as==='sha'&&view.lastPlayed.targets?.length>1)return view.lastPlayed.targets.filter(t=>view.players[t]?.alive).map(target=>({source:battle.source,target}))
 return battle&&battle.source!=null&&battle.target!=null&&battle.source!==battle.target?[{source:battle.source,target:battle.target}]:[]
}
export function judgmentMark(pending){return {symbol:pending.hit?'✓':'×',label:pending.hit?'判定生效':'判定未生效',hit:pending.hit}}
export function publicPicks(view){return (view.logs||[]).filter(l=>l.cue?.kind==='harvest-pick'&&l.cue.playedId===view.lastPlayed?.id).slice().reverse().map(l=>l.cue)}
export function responsePrompt(view){
 const p=view.pending
 if(p?.context?.type==='collateral')return '请出杀，或交出武器'
 if(p?.kind==='response')return '请出'+(p.as==='sha'?'杀':p.as==='shan'?'闪':'仙桃')+(p.remaining>1?'（共 '+p.remaining+' 张）':'')
 if(p?.kind==='support')return '是否提供援助？'
 return null
}
