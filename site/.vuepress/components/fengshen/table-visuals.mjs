import {combatContext} from './combat.mjs'
import {CARDS_BY_TYPE,skillName} from './theme.mjs'
import {display} from './presentation.mjs'
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
 // 玩家正在挑牌（已选定牌型）却还没点亮目标：等玩家选择，不要回退显示上一张牌遗留的连线，
 // 否则打完群体牌后再出杀，会残留"全体连线"看起来像一张杀打向所有人。
 if(as&&!p)return []
 const battle=combatContext(view)
 if(battle?.kind==='aoe')return view.players.filter(p=>p.alive&&p.seat!==battle.source).map(p=>({source:battle.source,target:p.seat}))
 if(battle?.kind==='command'&&battle.commandedBy!=null)return [{source:battle.commandedBy,target:battle.source},...(battle.source!==battle.target?[{source:battle.source,target:battle.target}]:[])]
 if(battle&&view.lastPlayed?.as==='sha'&&view.lastPlayed.targets?.length>1)return view.lastPlayed.targets.filter(t=>view.players[t]?.alive).map(target=>({source:battle.source,target}))
 if(battle&&battle.source!=null&&battle.target!=null&&battle.source!==battle.target)return [{source:battle.source,target:battle.target}]
 if(played&&played.turn===view.turns){if(played.as==='collateral'){const t=played.targets||[];return [...direct(played.source,t.slice(0,1)),...(t.length>1&&t[0]!==t[1]?[{source:t[0],target:t[1]}]:[])]}return direct(played.source,global.includes(played.as)?view.players.filter(t=>t.alive).map(t=>t.seat):played.targets||[])}
 return []
}
export const judgingSeat=view=>['reveal','judge-replace'].includes(view.pending?.kind)||view.pending?.kind==='counter'&&view.pending.source==null?view.pending.target:null
// 被动抉择者高亮：轮到某人做响应/选牌等被动决定时返回其座位，否则 null。
// 排除纯公开展示（判定翻开、ext 展示阶段）——那些只需自动 ack，不是抉择，否则会两人轮流闪黄框。
export function responderHighlight(view){
 const p=view.pending
 if(!p||p.actor==null||p.actor===view.current)return null
 if(p.kind==='reveal'||p.kind==='ext'&&view.extension?.stage==='reveal')return null
 // 破法（无懈）询问是私密信息，只有持无懈者本人屏幕可以提示，绝不公开高亮：
 // 否则全场都能看出谁攥着无懈，进而推断他是不是忠臣，等于把身份牌亮了。三国杀/英雄杀均如此。
 if(p.kind==='counter'&&p.actor!==view.seat)return null
 // 濒死求桃同样按座次逐个私下询问：一圈问下来，谁被问到就说明谁手里有桃，
 // 公开亮黄框等于替全场记牌（桃还剩几张、谁可能能救），直接影响后续打法，所以绝不公开高亮。
 if(p.kind==='rescue')return null
 // 变法改判的等待者用更淡的黄色单独标注（见 fs-replace-focus），不走响应黄框，避免身上叠两圈黄。
 if(p.kind==='judge-replace')return null
 return p.actor
}
export function counterSelection(view,previousKey,selected=[]){
 const p=view.pending,key=p?.kind==='counter'&&p.actor===view.seat?`${view.revision}:${p.id}`:null
 if(!key)return {key:null,selected}
 return {key,selected:key===previousKey?selected:((view.legal.find(a=>a.type==='respond'&&!a.guhuo)||view.legal.find(a=>a.type==='respond'))?.ids.slice()||[])}
}
// 被杀/万妖袭营/决斗等要求出响应牌时，若手里有「字面一致」的实体杀/闪，先替玩家选中一张，
// 与破法询问一样只是辅助：换一张（不同点数或花色转化）、放弃仍由玩家决定。
// 实体杀包含普通杀与炎杀、雷杀（它们物理上就是杀，只是带属性）；要闪只代选普通闪。
// 花色/牌种转化（黑桃当闪、红桃当杀、杀当闪、闪当杀等技能）绝不代选，玩家须自己确认。
export function responseSelection(view,previousKey,selected=[]){
 const p=view.pending,key=p?.kind==='response'&&p.actor===view.seat?`${view.revision}:${p.id}`:null
 if(!key)return {key:null,selected}
 if(key===previousKey)return {key,selected}
 const literal=c=>c.type===p.as||p.as==='sha'&&CARDS_BY_TYPE[c.type]?.attackNature
 const match=view.legal.find(a=>a.type==='respond'&&!a.guhuo&&a.ids.length===1&&view.players[view.seat].hand.some(c=>c.id===a.ids[0]&&literal(c)))
 return {key,selected:match?match.ids.slice():selected}
}
export function counterAction(view,selected,{blockedUntil=0,now=Date.now()}={}){
 if(view.pending?.kind!=='counter'||view.pending.actor!==view.seat||now<blockedUntil)return null
 return view.legal.find(a=>a.type==='respond'&&a.ids.length===selected.length&&a.ids.every(id=>selected.includes(id)))||null
}
export function judgmentMark(pending){return {symbol:pending.hit?'✓':'×',label:pending.hit?'判定生效':'判定未生效',hit:pending.hit}}
export function publicPicks(view){return (view.logs||[]).filter(l=>l.cue?.kind==='harvest-pick'&&l.cue.playedId===view.lastPlayed?.id).slice().reverse().map(l=>l.cue)}
// 濒死救援提示必须写明「凭什么能救」：琼浆只能自救，救别人一定是技能转化（妖言假冒、急救红牌当桃）。
// 否则只攥着琼浆的玩家被询问救援时，会误以为琼浆能救别人。
export function rescuePrompt(view){
 const p=view.pending
 if(p?.kind!=='rescue')return null
 const target=display(view.players[p.target]||{}).name||'目标',own=view.players[view.seat]||{},answers=view.legal.filter(a=>a.type==='respond')
 const names=[...new Set(answers.map(a=>a.as))].map(k=>CARDS_BY_TYPE[k]?.name).filter(Boolean).join('或')||'仙桃'
 const natural=answers.some(a=>!a.guhuo&&a.ids?.some(id=>(own.hand||[]).some(c=>c.id===id&&c.type==='tao')))
 if(p.actor===p.target||natural||!answers.length)return `${target}濒死：是否使用${names}救援？`
 if(answers.some(a=>a.guhuo))return `${target}濒死：${skillName(own,'guhuo')}可扣置一张手牌假冒${names}救援，是否声明？`
 if((own.effectiveSkills||[]).includes('jijiu'))return `${target}濒死：${skillName(own,'jijiu')}可用红色牌当${names}救援，是否救援？`
 return `${target}濒死：是否使用${names}救援？`
}
export function responsePrompt(view){
 const p=view.pending
 if(p?.context?.type==='collateral')return '请出杀，或交出武器'
 if(p?.kind==='response')return '请出'+(p.as==='sha'?'杀':p.as==='shan'?'闪':'仙桃')+(p.remaining>1?'（共 '+p.remaining+' 张）':'')
 if(p?.kind==='support')return '是否提供援助？'
 if(p?.kind==='rescue')return rescuePrompt(view)
 return null
}
