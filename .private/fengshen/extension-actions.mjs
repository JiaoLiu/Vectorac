import {CARDS_BY_TYPE} from './theme.mjs'
export const EXT_ACTIVE=new Set(['quhu','tianyi','ganlu','dimeng','anxu','xueji','luanwu','jiushi','lianhuan','huangtian','luanji'])
const skills=p=>p.effectiveSkills||[]
export const viewSuit=(p,c)=>skills(p).includes('hongyan')&&c.suit==='spade'?'heart':c.suit
export function viewDistance(v,from,to,excluded=[]){if(from===to)return 0;const alive=v.players.filter(p=>p.alive).map(p=>p.seat),a=alive.indexOf(from),b=alive.indexOf(to);if(a<0||b<0)return Infinity;const p=v.players[from],q=v.players[to],equipped=(p,slot)=>p.equip[slot]&&!excluded.includes(p.equip[slot].id);return p.marks.ignoreDistance?.includes(to)?1:Math.max(1,Math.min(Math.abs(a-b),alive.length-Math.abs(a-b))-(equipped(p,'offenseHorse')?1:0)-(skills(p).includes('mashu')?1:0)+(equipped(q,'defenseHorse')?1:0))}
export const viewRange=(v,seat,excluded=[])=>{const w=v.players[seat].equip.weapon;return w&&!excluded.includes(w.id)?v.attackRanges?.[seat]??CARDS_BY_TYPE[w.type]?.range??1:1}
export function extensionTargets(v,ui){const p=v.players[v.seat],others=v.players.filter(t=>t.alive&&t.seat!==v.seat),selected=ui.targets||[],skill=ui.skill
 if(v.pending?.kind==='ext'&&v.pending.actor===v.seat){const d=v.extension?.spec;if(d?.as==='sha'&&ui.selected?.length)return (d.targets||[]).filter(t=>viewDistance(v,v.seat,t,ui.selected)<=viewRange(v,v.seat,ui.selected));return d?.targets||[]}
 if(!EXT_ACTIVE.has(skill))return null
 if(skill==='huangtian')return v.legal.filter(a=>a.skill===skill).map(a=>a.target)
 if(skill==='quhu'||skill==='tianyi')return p.hand.length?others.filter(t=>t.handCount&&(skill!=='quhu'||t.hp>p.hp)).map(t=>t.seat):[]
 if(['ganlu','dimeng','anxu'].includes(skill)){const candidates=skill==='ganlu'?v.players.filter(t=>t.alive):others;if(!selected.length)return candidates.map(t=>t.seat);const first=v.players[selected[0]],n=t=>Object.values(t.equip).filter(Boolean).length;return candidates.filter(t=>t.seat===first.seat||skill==='ganlu'&&Math.abs(n(t)-n(first))<=p.maxHp-p.hp||skill==='dimeng'&&Math.abs(t.handCount-first.handCount)<=(p.hand.length+Object.values(p.equip).filter(Boolean).length)||skill==='anxu'&&t.handCount!==first.handCount).map(t=>t.seat)}
 if(skill==='xueji')return others.filter(t=>viewDistance(v,v.seat,t.seat,ui.selected)<=viewRange(v,v.seat,ui.selected)).map(t=>t.seat)
 return []
}
export function extensionAction(v,ui,value){const e=v.extension,p=v.pending,own=v.players[v.seat],ids=ui.selected||[],target=ui.targets?.[0]
 if(p?.kind!=='ext'||p.actor!==v.seat)return null
 const options=v.legal.filter(a=>a.type==='invoke'),chosen=options.find(a=>a.value===(value??ui.extValue))||options[0];if(!chosen)return null
 const d=e.spec
 if(d&&!(e.stage==='luanwu'&&chosen.value==='lose')){const cards=d.handOnly?own.hand:own.hand.concat(Object.values(own.equip).filter(Boolean));if(ids.length<(d.min||0)||ids.length>(d.max??d.min??0)||!ids.every(id=>cards.some(c=>c.id===id))||d.suit&&ids.some(id=>viewSuit(own,cards.find(c=>c.id===id))!==d.suit)||d.targets&&!d.targets.includes(target))return null}
 return {...chosen,ids:ids.slice(),guhuo:!!ui.guhuoMode,...(d?.targets?{target}:{})}
}
