// Presentation-only copies of PUBLIC played/revealed cards. No engine state or
// opponents' hands enter this CURRENT resolution chain; not turn history.
export const tableChainKey=view=>view.lastPlayed&&(view.lastPlayed.turn==null||view.lastPlayed.turn===view.turns)?`play:${view.turns}:${view.lastPlayed.id}`:`turn:${view.turns}`
export function tableTrail(previous=[],view,{closedChain=null}={}){
 const chainKey=tableChainKey(view),closed=closedChain===chainKey
 const trail=(closed?[]:previous.filter(e=>e.turn===view.turns&&e.chainKey===chainKey&&!e.key.startsWith('private:'))).map(e=>({...e,currentEffect:false})),add=e=>{e={...e,chainKey};const old=trail.findIndex(x=>x.key===e.key);if(old<0)trail.push(e);else trail[old]={...trail[old],...e}}
 const played=view.lastPlayed,current=played&&(played.turn==null||played.turn===view.turns)
 if(current&&!closed){
  const global=['arrows','savage','garden','harvest'].includes(played.as),counterCount=(view.exchange||[]).filter(e=>e.as==='nullify').length
  add({key:`play:${played.id}`,turn:view.turns,source:played.source,cards:played.cards,as:played.nature==='fire'&&played.as==='sha'?'firesha':played.as,virtualType:played.virtualType,currentEffect:true,...(global?{negated:false}:counterCount?{negated:counterCount%2===1}:{})})
  for(const [i,e]of (view.exchange||[]).entries())if(i)add({key:`response:${played.id}:${i}`,turn:view.turns,source:e.source,cards:e.cards,as:e.as,response:true})
 }
 const p=view.pending
 if(view.publicReveal?.turn===view.turns&&view.pending?.kind==='ext'&&view.extension?.stage==='reveal'){const r=view.publicReveal;add({key:`extra:${r.id}`,turn:view.turns,source:r.owner,cards:r.cards,judgment:r.hit!=null,hit:r.hit,label:r.skill,currentEffect:true})}
 if(p?.kind==='ext'&&view.extension?.privateCards&&p.actor===view.seat&&view.extension.cards.length)add({key:`private:${p.id}`,turn:view.turns,source:p.actor,cards:view.extension.cards,currentEffect:true,label:'当前私有技能牌'})
 if(p?.kind==='counter'&&p.source==null){const c=view.players[p.target]?.judgment.find(c=>c.type===p.cardType);if(c)add({key:`delay:${view.turns}:${c.id}`,turn:view.turns,source:p.target,cards:[c],as:p.cardType,delay:true,currentEffect:true,negated:p.negated})}
 if(p?.kind==='counter'&&p.source!=null&&current){const e=trail.find(e=>e.key===`play:${played.id}`);if(e)e.negated=p.negated}
 if(!closed&&!current&&view.lastResponse?.turn===view.turns){const e=view.lastResponse;add({key:`standalone:${e.id}`,turn:view.turns,source:e.source,cards:e.cards,as:e.as,response:true})}
 // 判定牌只占一个牌位：改判询问阶段先亮出这张牌，判定完成后命中/落空直接盖在同一张牌上，
 // 不再另起一张复制牌，否则玩家会看到「一张原牌 + 一张带勾的复制牌」。
 if(p?.kind==='reveal')add({key:`judge:${p.card.id}`,turn:view.turns,source:p.target,cards:[p.effectiveSuit?{...p.card,suit:p.effectiveSuit,physicalSuit:p.card.suit}:p.card],as:p.card.type,judgment:true,currentEffect:true,judgeKind:p.delayType,hit:p.hit,label:view.judgmentLabel})
 if(p?.kind==='judge-replace'&&view.judgmentCard)add({key:`judge:${view.judgmentCard.id}`,turn:view.turns,source:p.target,cards:[view.judgmentCard],as:view.judgmentCard.type,judgment:true,currentEffect:true,label:'改判'})
 return recentWithFocus(trail,12)
}
export function counterTrail(trail,view){
 const p=view.pending;if(p?.kind!=='counter')return trail
 const c=p.source==null&&view.players[p.target]?.judgment.find(c=>c.type===p.cardType),key=c?`delay:${view.turns}:${c.id}`:`play:${view.lastPlayed?.id}`
 return trail.map(e=>e.key===key?{...e,negated:!p.negated}:e)
}
export function recentWithFocus(entries,count){if(count<=0)return [];const focused=entries.filter(e=>e.currentEffect).slice(-count),rest=entries.filter(e=>!focused.includes(e)).slice(-Math.max(0,count-focused.length));return entries.filter(e=>focused.includes(e)||count>focused.length&&rest.includes(e))}
export function trailCards(trail){return recentWithFocus(trail.flatMap(e=>e.virtualType?[{...e,card:{type:e.virtualType,virtual:true},key:e.key}]:e.cards.map((card,i)=>({...e,card,key:`${e.key}:${i}`}))),12)}
// A publicly received judgment leaves the table; keep other cards/results intact.
// Removing the real id also prevents its old stamped face returning after flight.
export function takeJudgmentCard(trail,cardId){return trail.map(e=>e.judgment?{...e,cards:e.cards.filter(c=>c.id!==cardId)}:e).filter(e=>e.virtualType||e.cards.length)}
export function tableCardLayout({width,height,count}){
 const gap=5,maxHeight=Math.max(24,Math.min(112,height-10)),minHeight=Math.min(70,maxHeight),columns=Math.max(1,Math.floor((width+gap)/(minHeight/1.44+gap))),rows=Math.max(1,Math.min(2,Math.floor((height+gap)/(minHeight+gap)))),visible=Math.min(count,columns*rows)
 const usedRows=Math.max(1,Math.ceil(visible/columns)),usedCols=Math.min(columns,Math.max(1,visible)),cardHeight=Math.min(112,(height-10-gap*(usedRows-1))/usedRows,(width-gap*(usedCols-1))/usedCols*1.44)
 return {visible,columns:usedCols,rows:usedRows,cardHeight:Math.max(24,cardHeight)}
}
// 公开弃置/阵亡亮牌一次可能摆出整副手牌：竖屏上下有空间就换行铺开（不限两行），
// 横屏空间不够就按宽度把牌面压小。绝不横向裁切；只有极小屏实在放不下才少摆几张。
export function publicDiscardLayout({width,height,count}){
 const gap=5,n=Math.max(1,count||0),usable=Math.max(24,height-10),maxCardHeight=Math.min(112,usable),preferred=Math.min(70,maxCardHeight)
 const columns=Math.max(1,Math.min(n,Math.floor((width+gap)/(preferred/1.44+gap)))),rows=Math.max(1,Math.ceil(n/columns))
 const cardHeight=Math.max(24,Math.min(maxCardHeight,(usable-gap*(rows-1))/rows,(width-gap*(columns-1))/columns*1.44))
 const floorRows=Math.max(1,Math.floor((height+gap)/(24+gap))),visible=cardHeight>24||24*rows+gap*(rows-1)<=height+.01?n:Math.min(n,columns*floorRows)
 return {columns,rows:Math.max(1,Math.ceil(visible/columns)),cardHeight,visible}
}
