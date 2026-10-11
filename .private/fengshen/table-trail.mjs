// Presentation-only copies of PUBLIC played/revealed cards. No engine state or
// opponents' hands enter this short current-turn trail; it is not a second deck.
export function tableTrail(previous=[],view){
 const trail=previous.filter(e=>e.turn===view.turns).map(e=>({...e,currentEffect:false})),add=e=>{const old=trail.findIndex(x=>x.key===e.key);if(old<0)trail.push(e);else trail[old]={...trail[old],...e}}
 const played=view.lastPlayed,current=played&&(played.turn==null||played.turn===view.turns)
 if(current){
  const global=['arrows','savage','garden','harvest'].includes(played.as),counterCount=(view.exchange||[]).filter(e=>e.as==='nullify').length
  add({key:`play:${played.id}`,turn:view.turns,source:played.source,cards:played.cards,as:played.nature==='fire'&&played.as==='sha'?'firesha':played.as,virtualType:played.virtualType,currentEffect:true,...(global?{negated:false}:counterCount?{negated:counterCount%2===1}:{})})
  for(const [i,e]of (view.exchange||[]).entries())if(i)add({key:`response:${played.id}:${i}`,turn:view.turns,source:e.source,cards:e.cards,as:e.as,response:true})
 }
 const p=view.pending
 if(view.publicReveal?.turn===view.turns){const r=view.publicReveal;add({key:`extra:${r.id}`,turn:view.turns,source:r.owner,cards:r.cards,judgment:r.hit!=null,hit:r.hit,label:r.skill,currentEffect:true})}
 if(p?.kind==='ext'&&view.extension?.privateCards&&p.actor===view.seat&&view.extension.cards.length)add({key:`private:${p.id}`,turn:view.turns,source:p.actor,cards:view.extension.cards,currentEffect:true,label:'当前私有技能牌'})
 if(p?.kind==='counter'&&p.source==null){const c=view.players[p.target]?.judgment.find(c=>c.type===p.cardType);if(c)add({key:`delay:${view.turns}:${c.id}`,turn:view.turns,source:p.target,cards:[c],as:p.cardType,delay:true,currentEffect:true,negated:p.negated})}
 if(p?.kind==='counter'&&p.source!=null&&current){const e=trail.find(e=>e.key===`play:${played.id}`);if(e)e.negated=p.negated}
 if(!current&&view.lastResponse?.turn===view.turns){const e=view.lastResponse;add({key:`standalone:${e.id}`,turn:view.turns,source:e.source,cards:e.cards,as:e.as,response:true})}
 if(p?.kind==='reveal')add({key:`judge:${p.id}`,turn:view.turns,source:p.target,cards:[p.effectiveSuit?{...p.card,suit:p.effectiveSuit}:p.card],as:p.card.type,judgment:true,currentEffect:true,judgeKind:p.delayType,hit:p.hit,label:view.judgmentLabel})
 if(p?.kind==='judge-replace'&&view.judgmentCard)add({key:`replace:${p.id}`,turn:view.turns,source:p.target,cards:[view.judgmentCard],as:view.judgmentCard.type,judgment:true,currentEffect:true,label:'改判'})
 return recentWithFocus(trail,12)
}
export function counterTrail(trail,view){
 const p=view.pending;if(p?.kind!=='counter')return trail
 const c=p.source==null&&view.players[p.target]?.judgment.find(c=>c.type===p.cardType),key=c?`delay:${view.turns}:${c.id}`:`play:${view.lastPlayed?.id}`
 return trail.map(e=>e.key===key?{...e,negated:!p.negated}:e)
}
export function recentWithFocus(entries,count){if(count<=0)return [];const focused=entries.filter(e=>e.currentEffect).slice(-count),rest=entries.filter(e=>!focused.includes(e)).slice(-Math.max(0,count-focused.length));return entries.filter(e=>focused.includes(e)||count>focused.length&&rest.includes(e))}
export function trailCards(trail){return recentWithFocus(trail.flatMap(e=>e.virtualType?[{...e,card:{type:e.virtualType,virtual:true},key:e.key}]:e.cards.map((card,i)=>({...e,card,key:`${e.key}:${i}`}))),12)}
export function tableCardLayout({width,height,count}){
 const gap=5,maxHeight=Math.max(24,Math.min(112,height-10)),minHeight=Math.min(70,maxHeight),columns=Math.max(1,Math.floor((width+gap)/(minHeight/1.44+gap))),rows=Math.max(1,Math.min(2,Math.floor((height+gap)/(minHeight+gap)))),visible=Math.min(count,columns*rows)
 const usedRows=Math.max(1,Math.ceil(visible/columns)),usedCols=Math.min(columns,Math.max(1,visible)),cardHeight=Math.min(112,(height-10-gap*(usedRows-1))/usedRows,(width-gap*(usedCols-1))/usedCols*1.44)
 return {visible,columns:usedCols,rows:usedRows,cardHeight:Math.max(24,cardHeight)}
}
