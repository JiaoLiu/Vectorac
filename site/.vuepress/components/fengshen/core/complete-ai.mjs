import {viewSuit,viewDistance,viewRange} from '../extension-actions.mjs'
export function extensionResponse(v,{hostility,cardValue,ownCards}){
 const e=v.extension,p=v.pending,self=v.players[v.seat],pass=v.legal.find(a=>a.type==='pass'),invoke=v.legal.find(a=>a.type==='invoke'),cheap=ownCards(v).slice().sort((a,b)=>cardValue(a,v)-cardValue(b,v)),relation=t=>hostility(v,t),pick=list=>list.slice().sort((a,b)=>relation(a)-relation(b)||v.players[a].hp-v.players[b].hp)[0]
 if(e.stage==='reveal')return invoke
 if(e.stage==='question'){const lies=v.logs.filter(l=>l.cue?.kind==='guhuo-reveal'&&l.cue.seat===p.source&&!l.cue.real).length,question=relation(p.source)>0&&(lies>=2||(v.revision+v.seat*13)%5===0);return v.legal.find(a=>a.value===(question?'question':'believe'))}
 if(e.stage==='buqu-remove'){const ranks=e.cards.map(c=>c.rank),card=e.cards.find(c=>ranks.filter(r=>r===c.rank).length>1)||e.cards[0];return v.legal.find(a=>a.value===card.id)}
 if(e.stage==='buyi'){if(relation(p.target)>0&&p.target!==v.seat)return pass||invoke;if(p.target!==v.seat)return invoke;const c=self.hand.find(c=>!['sha','shan','tao','wine','firesha','thundersha'].includes(c.type));return c?{...invoke,ids:[c.id]}:pass||{...invoke,ids:[self.hand[0].id]}}
 if(e.stage==='zhenlie'){const c=e.cards[0],kind=e.judgmentKind,good=c&&(kind==='supplyshortage'?viewSuit(self,c)==='club':kind==='leiji'?viewSuit(self,c)!=='spade':kind==='indulgence'?viewSuit(self,c)==='heart':kind==='lightning'?!(viewSuit(self,c)==='spade'&&c.rank>=2&&c.rank<=9):['luoshen','miji'].includes(kind)?!['heart','diamond'].includes(viewSuit(self,c)):true);return good?pass:invoke}
 if(e.spec){const d=e.spec;let cards=(d.handOnly?self.hand:cheap).filter(c=>!d.suit||viewSuit(self,c)===d.suit),ids=cards.slice(0,d.min||0).map(c=>c.id),target=d.targets?.[0],value=invoke.value
  if(e.stage==='pindian')ids=self.hand.slice().sort((a,b)=>b.rank-a.rank).slice(0,1).map(c=>c.id)
  if(e.stage==='transfer'||e.stage==='quhu-target')target=d.targets.slice().sort((a,b)=>relation(b)-relation(a)||v.players[a].hp-v.players[b].hp)[0]
  else if(e.stage==='helper')target=d.targets.slice().sort((a,b)=>relation(b)-relation(a))[0]
  else if(e.stage==='qiuyuan-give'){const dodge=self.hand.find(c=>c.type==='shan');ids=[(dodge||cards.slice().sort((a,b)=>cardValue(a,v)-cardValue(b,v))[0]).id]}
  else if(e.stage==='fire-show')ids=[self.hand.slice().sort((a,b)=>cardValue(a,v)-cardValue(b,v))[0].id]
  else if(e.stage==='luanwu'){const ss=self.effectiveSkills||[],sets=ownCards(v).filter(c=>self.hand.some(h=>h.id===c.id)&&(c.type==='sha'||c.type==='firesha'||c.type==='thundersha'||ss.includes('guhuo')||c.type==='shan'&&ss.includes('longdan'))||['heart','diamond'].includes(viewSuit(self,c))&&ss.includes('wusheng')).map(c=>[c.id]);if(self.equip.weapon?.type==='spear'&&self.hand.length>=2)sets.push(cheap.filter(c=>self.hand.some(h=>h.id===c.id)).slice(0,2).map(c=>c.id));const candidates=sets.flatMap(ids=>d.targets.filter(t=>viewDistance(v,v.seat,t,ids)<=viewRange(v,v.seat,ids)).map(target=>({ids,target,score:relation(target)*2-ids.reduce((n,id)=>n+cardValue(cheap.find(c=>c.id===id),v)*.2,0)}))).sort((a,b)=>b.score-a.score);if(candidates[0]&&(candidates[0].score>0||self.hp<=1)){ids=candidates[0].ids;target=candidates[0].target}else{ids=[];value='lose'}}
  else if(p.skill==='jieming')target=d.targets.slice().sort((a,b)=>Math.max(0,Math.min(5,v.players[b].maxHp)-v.players[b].handCount)*(relation(b)<0?1:-1)-Math.max(0,Math.min(5,v.players[a].maxHp)-v.players[a].handCount)*(relation(a)<0?1:-1))[0]
  else if(p.skill==='fangzhu'){const ally=d.targets.find(t=>v.players[t].faceDown&&relation(t)<0);target=ally??d.targets.slice().sort((a,b)=>relation(b)-relation(a))[0]}
  else if(p.skill==='yinghun'&&d.targets){target=pick(d.targets);if(relation(target)<0)value='draw-many';else{target=d.targets.slice().sort((a,b)=>relation(b)-relation(a))[0];value='discard-many'}}
  else if(p.skill==='leiji'){target=d.targets.slice().sort((a,b)=>relation(b)-relation(a)||v.players[a].hp-v.players[b].hp)[0];if(relation(target)<=0)return pass||invoke}
  else if(d.targets)target=pick(d.targets)
  if(e.stage==='beige-cost'&&relation(p.target)>0)return pass||invoke
  if(ids.length<(d.min||0)&&value!=='lose')return pass||invoke
  return {...invoke,value,ids,...(d.targets?{target}:{})}
 }
 if(p.skill==='songwei'&&relation(p.target)>0)return pass||invoke
 if(p.skill==='zhuikong'&&relation(p.target)<0)return pass||invoke
 if(p.skill==='lieren'&&relation(p.target)<0)return pass||invoke
 return invoke||pass
}
export function expansionSkill(v,a,{hostility,cardValue,ownCards}){
 const self=v.players[v.seat],others=v.players.filter(p=>p.alive&&p.seat!==v.seat),rel=p=>hostility(v,p.seat),cheap=ownCards(v).slice().sort((a,b)=>cardValue(a,v)-cardValue(b,v)),skill=a.skill,lost=Math.max(0,self.maxHp-self.hp)
 if(skill==='quhu'||skill==='tianyi'){const target=others.filter(p=>p.handCount&&(skill!=='quhu'||p.hp>self.hp)).sort((a,b)=>rel(b)-rel(a))[0];return {action:{...a,target:target?.seat},score:target&&self.hand.length?rel(target)*2+(Math.max(...self.hand.map(c=>c.rank))>=10?4:-3):-5}}
 if(['ganlu','dimeng','anxu'].includes(skill)){const list=skill==='ganlu'?v.players.filter(p=>p.alive):others,pairs=[];for(const first of list)for(const second of list)if(first.seat<second.seat){const na=skill==='ganlu'?Object.values(first.equip).filter(Boolean).length:first.handCount,nb=skill==='ganlu'?Object.values(second.equip).filter(Boolean).length:second.handCount,diff=Math.abs(na-nb);if(skill==='ganlu'&&diff>lost||skill==='dimeng'&&diff>cheap.length||skill==='anxu'&&!diff)continue;const ids=skill==='dimeng'?cheap.slice(0,diff).map(c=>c.id):[],score=skill==='anxu'?(na>nb?rel(first)-rel(second):rel(second)-rel(first))*1.4+2:(nb-na)*(rel(second)-rel(first))-(skill==='dimeng'?ids.reduce((n,id)=>n+cardValue(cheap.find(c=>c.id===id),v),0)*.4:0);pairs.push({score,action:{...a,ids,targets:[first.seat,second.seat]}})}return pairs.sort((a,b)=>b.score-a.score)[0]||{action:a,score:-5}}
 if(skill==='xueji'){const c=cheap.find(c=>['heart','diamond'].includes(viewSuit(self,c))),targets=c?others.filter(p=>rel(p)>0&&viewDistance(v,v.seat,p.seat,[c.id])<=viewRange(v,v.seat,[c.id])).sort((a,b)=>rel(b)-rel(a)).slice(0,lost).map(p=>p.seat):[];return {action:{...a,ids:c?[c.id]:[],targets},score:targets.length?targets.reduce((n,t)=>n+hostility(v,t)*2,0)-cardValue(c,v)*.3:-5}}
 if(skill==='luanwu')return {action:a,score:others.reduce((n,p)=>n+rel(p)*(p.hp<=1?2:1),0)-2}
 if(skill==='jiushi')return {action:a,score:self.hand.some(c=>c.type==='sha')&&others.some(p=>rel(p)>0&&p.hp<=2)&&!self.marks.wine?17:-5}
 if(skill==='lianhuan')return {action:a,score:a.ids?.length?6-cardValue(self.hand.find(c=>c.id===a.ids[0]),v): -5}
 if(skill==='huangtian'){const c=cheap.find(c=>self.hand.some(h=>h.id===c.id)&&['shan','lightning'].includes(c.type));return {action:{...a,ids:c?[c.id]:[]},score:c&&hostility(v,a.target)<0&&(c.type==='lightning'||self.handCount>2)?7-cardValue(c,v)*.3:-5}}
 if(skill==='luanji'){const pairs=v.legal.filter(o=>o.type==='play'&&o.as==='arrows'&&o.ids.length===2).sort((a,b)=>a.ids.reduce((n,id)=>n+cardValue(self.hand.find(c=>c.id===id),v),0)-b.ids.reduce((n,id)=>n+cardValue(self.hand.find(c=>c.id===id),v),0));return {action:{...a,ids:pairs[0]?.ids||[]},score:-5}}
 return null
}
