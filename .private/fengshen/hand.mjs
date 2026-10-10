// Each overlapped strip has its own non-overlapping hit box. The card face
// can overhang visually, but must never steal taps intended for its neighbor.
export const HAND_LIFT=21,HAND_TOP=30,HAND_BOTTOM=4
export function handLayout({count,width,height,landscape=false,availableHeight}){
  let cardWidth=landscape&&height<560?(height<=380?70:76):width<360?66:width<700?80:94,cardHeight=Math.round(cardWidth*1.44)
  if(availableHeight!=null){cardHeight=Math.max(1,Math.min(cardHeight,availableHeight-HAND_TOP-HAND_BOTTOM));cardWidth=cardHeight/1.44}
  const rows=1,perRow=count
  const readableStep=Math.round(cardWidth*.85)
  const step=perRow<=1?cardWidth:Math.min(cardWidth+7,Math.max(readableStep,(width-cardWidth)/(perRow-1)))
  const span=perRow?cardWidth+step*(perRow-1):0
  return {rows,perRow,cardWidth,cardHeight,step,edgeFont:14,span,scroll:span>width+.01}
}
export function layoutHand(root){
  const hand=root.querySelector('.fs-hand');if(!hand)return
  const buttons=[...hand.querySelectorAll('.fs-hand-card')];if(!buttons.length)return
  const width=hand.clientWidth,height=root.clientHeight
  const landscape=root.dataset.layout==='landscape'
  const l=handLayout({count:buttons.length,width,height,landscape,availableHeight:hand.clientHeight})
  const key=`${buttons.length}:${width}:${height}:${innerWidth>innerHeight}`
  // 模板直接输出 hand-row（renderBattle），morph 按位对齐保留按钮元素；
  // 这里只更新布局变量与行宽。无 row 属异常结构（如旧存档 DOM），兜底重建一次。
  let row=hand.firstElementChild?.classList.contains('fs-hand-row')?hand.firstElementChild:null
  if(!row){row=document.createElement('div');row.className='fs-hand-row';hand.replaceChildren(row);buttons.forEach(b=>row.append(b))}
  const scroll=hand.scrollLeft;hand.dataset.layoutKey=key;hand.dataset.rows=l.rows;hand.dataset.scrollable=String(l.scroll)
  hand.style.setProperty('--card-width',`${l.cardWidth}px`);hand.style.setProperty('--card-height',`${l.cardHeight}px`);hand.style.setProperty('--card-step',`${l.step}px`);hand.style.setProperty('--edge-font',`${l.edgeFont}px`)
  hand.style.setProperty('--hand-top',HAND_TOP+'px');hand.style.setProperty('--hand-bottom',HAND_BOTTOM+'px');hand.style.setProperty('--hand-lift',HAND_LIFT+'px')
  row.style.width=`${Math.max(width,l.span)}px`
  hand.scrollLeft=scroll;hand.scrollTop=0
}
