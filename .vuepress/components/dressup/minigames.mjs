export const MEMORY_SYMBOLS=['蝴蝶结','花朵','月亮','珍珠','星星','蝴蝶']
export function memoryGame(random=Math.random){
  const cards=MEMORY_SYMBOLS.flatMap((_,i)=>[i,i]);for(let i=cards.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[cards[i],cards[j]]=[cards[j],cards[i]]}
  return {kind:'memory',cards,open:[],matched:[],moves:0,complete:false,paid:false}
}
export function flipMemory(g,index){
  if(g.complete||g.open.length===2||!Number.isInteger(index)||index<0||index>=12||g.open.includes(index)||g.matched.includes(index))return g
  const next={...g,open:[...g.open,index]}
  if(next.open.length===2){next.moves++;if(next.cards[next.open[0]]===next.cards[next.open[1]]){next.matched=[...g.matched,...next.open];next.open=[];next.complete=next.matched.length===12}}
  return next
}
export const closeMemory=g=>g.open.length===2?{...g,open:[]}:g
export const BRIEFS=[
  {name:'春日花园野餐',text:'带上花朵与轻柔色彩，去花海享受春日。',tags:['甜美','自然'],scene:'garden'},
  {name:'城堡下午茶',text:'古典装束搭配一件甜美配饰，赴城堡之约。',tags:['古典','甜美'],scene:'castle'},
  {name:'海风明信片',text:'清新衣装与自然配饰，留下一张海边照片。',tags:['清新','自然'],scene:'sea'},
  {name:'月夜星光舞会',text:'梦幻服装与星光饰品，去月下露台。',tags:['梦幻','星光'],scene:'moon'},
  {name:'书院春游',text:'国风衣装和花朵配饰，回到春天的花海。',tags:['国风','自然'],scene:'garden'}
]
export function stylingGame(random=Math.random){return {kind:'styling',brief:Math.min(BRIEFS.length-1,Math.floor(random()*BRIEFS.length)),complete:false,paid:false}}
export function submitStyling(g,tags,scene){const b=BRIEFS[g.brief];if(!b||g.paid)return g;const score=b.tags.filter(t=>tags.includes(t)).length*35+(scene===b.scene?30:0);return {...g,score,complete:score===100}}
export function sewingGame(){return {kind:'sewing',stitches:0,score:0,misses:0,marks:[],complete:false,paid:false}}
export function stitch(g,position){
  if(g.complete||!Number.isFinite(position)||position<0||position>1)return g
  const distance=Math.abs(position-.5),grade=distance<=.11?'perfect':distance<=.24?'hit':'miss',perfect=grade==='perfect',hit=grade!=='miss'
  const n={...g,stitches:g.stitches+(hit?1:0),score:g.score+(perfect?2:hit?1:0),misses:g.misses+(hit?0:1),marks:[...(g.marks||[]),{position,grade}]};n.complete=n.stitches>=6;return n
}
export function gameReward(g){if(!g||!g.complete||g.paid)return 0;if(g.kind==='memory'&&g.matched.length===12)return g.moves<=10?60:45;if(g.kind==='styling'&&g.score===100)return 65;if(g.kind==='sewing'&&g.stitches>=6)return g.score>=10?60:45;return 0}
