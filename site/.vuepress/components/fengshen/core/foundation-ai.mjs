import {FOUNDATION_SKILLS} from '../foundation-roster.mjs'
import {viewSuit} from '../extension-actions.mjs'
export function foundationResponse(v,{hostility,cardValue,ownCards}){
 const p=v.pending,e=v.extension,self=v.players[v.seat]
 if(!FOUNDATION_SKILLS[p.skill]||e.stage==='pindian')return null
 const invoke=v.legal.find(a=>a.type==='invoke'),pass=v.legal.find(a=>a.type==='pass'),rel=t=>hostility(v,t),cheap=cards=>cards.slice().sort((a,b)=>cardValue(a,v)-cardValue(b,v)),allies=v.players.filter(t=>t.alive&&t.seat!==v.seat&&rel(t.seat)<0)
 if(e.stage==='reveal')return invoke
 if(p.skill==='benghuai')return v.legal.find(a=>a.value===(self.hp<=1&&self.maxHp>1?'maxhp':'hp'))
 if(p.skill==='zhiji')return v.legal.find(a=>a.value===(self.hp<=1?'recover':'draw'))||invoke
 if(p.skill==='baonue')return rel(p.target)<0?invoke:pass||invoke
 if(p.skill==='fangquan'&&e.stage==='yes')return allies.length&&self.hand.some(c=>cardValue(c,v)<5)&&!self.hand.some(c=>c.type==='draw'||c.type==='duel')?invoke:pass||invoke
 if(p.skill==='qiaobian'&&e.stage==='discard'){
  const targets=v.players.filter(t=>t.alive&&t.seat!==v.seat&&t.handCount&&rel(t.seat)>0)
  const worth=e.phase==='judge'?self.judgment.length>0:e.phase==='draw'?targets.length>=2:e.phase==='discard'?self.handCount>self.hp+1:!self.hand.some(c=>['sha','firesha','thundersha','draw','duel'].includes(c.type))
  if(!worth)return pass||invoke
 }
 if(e.stage==='board-pick'){
  const cards=e.cards||[],candidate=cheap(cards).find(c=>v.legal.some(a=>a.value===c.id))
  if(!candidate)return pass||invoke
  return v.legal.find(a=>a.value===candidate.id)
 }
 if(!e.spec)return invoke||pass
 const d=e.spec,cards=cheap(d.handOnly?self.hand:ownCards(v)).filter(c=>(!d.category||v.cardCategories?.[c.type]===d.category||d.category==='basic'&&['sha','shan','tao','wine','firesha','thundersha'].includes(c.type))&&(!d.suit||viewSuit(self,c)===d.suit)),ids=cards.slice(0,d.min).map(c=>c.id)
 if(ids.length<d.min)return pass||invoke
 if(p.skill==='xiangle'&&rel(p.target)<0)return pass||invoke
 let targets=d.targets?.slice()||[]
 const preferEnemy=p.skill==='jixi'||p.skill==='qiaobian'&&(d.multiTargets||e.board?.card?.type==='indulgence'||e.board?.card?.type==='supplyshortage'||e.board?.card?.type==='lightning')
 targets.sort((a,b)=>preferEnemy?rel(b)-rel(a):rel(a)-rel(b)||v.players[a].hp-v.players[b].hp)
 if(p.skill==='fangquan'&&targets.length&&rel(targets[0])>=0)return pass||invoke
 return {...invoke,ids,...(d.targets?d.multiTargets?{targets:targets.slice(0,d.maxTargets||1)}:{target:targets[0]}:{})}
}
export function foundationSkill(v,a,{hostility,cardValue}){
 const self=v.players[v.seat],rel=t=>hostility(v,t)
 if(a.skill==='tiaoxin')return {action:a,score:rel(a.target)*1.7+(v.players[a.target].handCount===0?4:0)-(self.hp<=1?4:0)}
 if(a.skill==='zhijian'){const c=self.hand.find(c=>c.id===a.ids[0]);return {action:a,score:rel(a.target)<0?10-cardValue(c,v)*.2:-5}}
 if(a.skill==='jixi')return {action:a,score:-3} // Direct field-as-Snatch actions carry an exact cost and target.
 if(a.skill==='zhiba'){const max=Math.max(...self.hand.map(c=>c.rank));return {action:a,score:rel(a.target)<0&&max<=7?5:rel(a.target)>0&&max>=11?4:-5}}
 return null
}
