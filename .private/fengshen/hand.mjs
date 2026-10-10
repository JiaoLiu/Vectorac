// Each overlapped strip has its own non-overlapping hit box. The card face
// can overhang visually, but must never steal taps intended for its neighbor.
export function handLayout({count,width,height,landscape=false}){
  const cardWidth=landscape&&height<560?(height<=380?70:76):width<360?66:width<700?80:94,cardHeight=Math.round(cardWidth*1.44)
  const rows=1,perRow=count
  const readableStep=Math.round(cardWidth*.85)
  const step=perRow<=1?cardWidth:Math.min(cardWidth+7,Math.max(readableStep,(width-cardWidth)/(perRow-1)))
  const span=perRow?cardWidth+step*(perRow-1):0
  return {rows,perRow,cardWidth,cardHeight,step,edgeFont:14,span,scroll:span>width+.01}
}
export function layoutHand(root){
  const hand=root.querySelector('.fs-hand');if(!hand)return
  const buttons=[...hand.querySelectorAll('.fs-hand-card')];if(!buttons.length)return
  const width=hand.clientWidth,height=window.visualViewport?.height||innerHeight
  const l=handLayout({count:buttons.length,width,height,landscape:innerWidth>innerHeight})
  const key=`${buttons.length}:${width}:${height}:${innerWidth>innerHeight}`
  if(hand.dataset.layoutKey===key)return
  const scroll=hand.scrollLeft;hand.dataset.layoutKey=key
  hand.replaceChildren();hand.dataset.rows=l.rows;hand.dataset.scrollable=String(l.scroll)
  hand.style.setProperty('--card-width',`${l.cardWidth}px`);hand.style.setProperty('--card-height',`${l.cardHeight}px`);hand.style.setProperty('--card-step',`${l.step}px`);hand.style.setProperty('--edge-font',`${l.edgeFont}px`)
  for(let i=0;i<l.rows;i++){
    const row=document.createElement('div');row.className='fs-hand-row';row.style.width=`${Math.max(width,l.span)}px`
    buttons.slice(i*l.perRow,(i+1)*l.perRow).forEach(b=>row.append(b));hand.append(row)
  }
  hand.scrollLeft=scroll
}
