// Only public played/response records enter this queue. Never inspect an
// opponent's hand, legal actions, hidden roles or unexposed Guhuo cards.
export const PLAY_FLIGHT_MS=600
const damage=new Set(['sha','firesha','thundersha','arrows','savage','duel','fireattack','collateral','lightning'])
export function impactFor(type,target,{source=null,negated=false}={}){
 if(target==null)return null
 const kind=damage.has(type)?'damage':['draw2','harvest'].includes(type)?'gain':['tao','garden'].includes(type)?'heal':['snatch','dismantle'].includes(type)?'take':'spell'
 return {kind,target,source,type,negated}
}
export function pendingImpact(view){
 const p=view.pending
 if(p?.kind==='counter')return impactFor(p.cardType,p.target,{source:p.source,negated:p.negated})
 const c=p?.context
 if(c&&['aoe','duel','attack','attackDamage','collateral'].includes(c.type))return impactFor(c.type==='collateral'?'collateral':c.type==='aoe'?p.as==='sha'?'savage':'arrows':'sha',c.victim??c.target,{source:c.source})
 return null
}
export function publicPlayMotions(before,after){
 const motions=[],p=after.lastPlayed,r=after.lastResponse
 if(p&&(p.id!==before.lastPlayed?.id||p.turn!==before.lastPlayed?.turn)&&(p.cards?.length||p.virtualType)){
  const target=after.pending?.target??p.targets?.[0]??(['tao','draw2'].includes(p.as)?p.source:null)
  motions.push({key:`play:${p.turn??after.turns}:${p.id}`,trailKey:`play:${p.id}`,source:p.source,cards:p.cards||[],virtualType:p.virtualType,as:p.as,focus:impactFor(p.as,target,{source:p.source}),counter:false})
 }
 if(r&&(r.id!==before.lastResponse?.id||r.turn!==before.lastResponse?.turn)&&r.cards?.length){
  const counter=r.as==='nullify',ctx=before.pending,focus=counter&&ctx?.kind==='counter'?impactFor(ctx.cardType,ctx.target,{source:r.source,negated:!ctx.negated}):impactFor(r.as,ctx?.target??ctx?.context?.target??r.source,{source:r.source})
  motions.push({key:`response:${r.turn??after.turns}:${r.id}`,source:r.source,cards:r.cards,as:r.as,counter,focus})
 }
 return motions
}
export class PlayMotionQueue{
 constructor({now=Date.now}={}){this.now=now;this.clear()}
 clear(){this.items=[];this.seen=new Set()}
 enqueue(events){for(const e of events){if(this.seen.has(e.key))continue;this.seen.add(e.key);this.items.push({...e,duration:PLAY_FLIGHT_MS+Math.min(4,Math.max(0,e.cards.length-1))*80+(e.counter?850:450),started:null})}return this.frame()}
 frame(){const now=this.now();while(this.items.length){const e=this.items[0];if(e.started==null)e.started=now;const elapsed=Math.max(0,now-e.started);if(elapsed<e.duration)return {event:e,elapsed,remaining:e.duration-elapsed};this.items.shift()}return null}
 get busy(){return !!this.frame()}
}
