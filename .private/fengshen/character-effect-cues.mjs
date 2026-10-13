// Public completed effects only: no guessed suit, private hand or initial card
// click. Group simultaneous victims, so one chain/fire sound does not overlap itself.
export function completedCharacterEffects(before,after){
 if(!before?.logs||!after?.logs)return []
 const seen=Math.max(0,...before.logs.map(l=>l.id)),groups=new Map()
 for(const l of after.logs.filter(l=>l.id>seen).slice().sort((a,b)=>a.id-b.id)){
  const c=l.cue,kind=c?.kind==='damage'&&c.nature==='fire'&&c.amount>0?'fire':c?.kind==='chain-state'?c.chained?'chain':'unchain':null
  if(!kind||!Number.isInteger(c.target))continue
  if(!groups.has(kind))groups.set(kind,{kind,ids:[],targets:[]})
  const g=groups.get(kind);g.ids.push(l.id);if(!g.targets.includes(c.target))g.targets.push(c.target)
 }
 const names={fire:['焚天焰','受到火焰伤害','fire-impact'],chain:['缚神索','进入连环','ironchain-bind'],unchain:['缚神索','解除连环','ironchain-release']}
 return [...groups.values()].map(g=>({kind:g.kind,key:`character:${g.kind}:${g.ids.join(':')}`,target:g.targets[0],targets:g.targets,title:g.kind==='fire'&&after.lastPlayed?.as!=='fireattack'?'火焰灼烧':names[g.kind][0],result:names[g.kind][1],effect:names[g.kind][2],leadMs:0}))
}
