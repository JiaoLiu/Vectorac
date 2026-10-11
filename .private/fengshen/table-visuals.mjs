import {combatContext} from './combat.mjs'
export const tutorialEnabled=preferences=>preferences?.hints!==false
export function targetLinks(view,{targets=[],as=null}={}){
 if(targets.length){if(as==='collateral')return [{source:0,target:targets[0]},...(targets.length>1?[{source:targets[0],target:targets[1]}]:[])]
  return targets.map(target=>({source:0,target}))}
 const p=view.pending,played=view.lastPlayed
 if(['reveal','judge-replace'].includes(p?.kind)||p?.kind==='counter'&&p.source==null)return []
 const direct=(source,list)=>source==null?[]:[...new Set(list)].filter(t=>t!==source&&view.players[t]?.alive).map(target=>({source,target}))
 const global=['arrows','savage','garden','harvest']
 if(p?.kind==='counter'){
  // 借刀无懈询问阶段即画出两条线：借刀者→持刀者、持刀者→被杀目标，
  // 玩家决定要不要出破法前就能看清"借谁的刀、杀谁"。
  if(p.cardType==='collateral'&&p.victim!=null&&p.source!=null)return [{source:p.source,target:p.target},...(p.target!==p.victim?[{source:p.target,target:p.victim}]:[])]
  return direct(p.source,global.includes(p.cardType)?view.players.filter(t=>t.alive).map(t=>t.seat):[p.target])
 }
 if(p?.kind==='take')return direct(p.source??p.actor,[p.target])
 const battle=combatContext(view)
 if(battle?.kind==='aoe')return view.players.filter(p=>p.alive&&p.seat!==battle.source).map(p=>({source:battle.source,target:p.seat}))
 if(battle?.kind==='command'&&battle.commandedBy!=null)return [{source:battle.commandedBy,target:battle.source},...(battle.source!==battle.target?[{source:battle.source,target:battle.target}]:[])]
 if(battle&&view.lastPlayed?.as==='sha'&&view.lastPlayed.targets?.length>1)return view.lastPlayed.targets.filter(t=>view.players[t]?.alive).map(target=>({source:battle.source,target}))
 if(battle&&battle.source!=null&&battle.target!=null&&battle.source!==battle.target)return [{source:battle.source,target:battle.target}]
 if(played&&played.turn===view.turns){if(played.as==='collateral'){const t=played.targets||[];return [...direct(played.source,t.slice(0,1)),...(t.length>1&&t[0]!==t[1]?[{source:t[0],target:t[1]}]:[])]}return direct(played.source,global.includes(played.as)?view.players.filter(t=>t.alive).map(t=>t.seat):played.targets||[])}
 return []
}
export const judgingSeat=view=>['reveal','judge-replace'].includes(view.pending?.kind)||view.pending?.kind==='counter'&&view.pending.source==null?view.pending.target:null
export function counterSelection(view,previousKey,selected=[]){
 const p=view.pending,key=p?.kind==='counter'&&p.actor===view.seat?`${view.revision}:${p.id}`:null
 if(!key)return {key:null,selected}
 return {key,selected:key===previousKey?selected:((view.legal.find(a=>a.type==='respond'&&!a.guhuo)||view.legal.find(a=>a.type==='respond'))?.ids.slice()||[])}
}
export function counterAction(view,selected,{blockedUntil=0,now=Date.now()}={}){
 if(view.pending?.kind!=='counter'||view.pending.actor!==view.seat||now<blockedUntil)return null
 return view.legal.find(a=>a.type==='respond'&&a.ids.length===selected.length&&a.ids.every(id=>selected.includes(id)))||null
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
