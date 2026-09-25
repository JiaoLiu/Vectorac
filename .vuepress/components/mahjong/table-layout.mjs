// Display geometry only: no rules, hidden hands or wall order are inspected.
export function riverLayout(width, height, counts) {
  // 真实牌桌摆法：各家弃牌河贴着自家牌墙内侧（felt 四边），向桌心生长；
  // 不再收窄居中——收窄会让弃牌河与牌墙脱离（悬空飘在桌中央）
  const side = width * .22, middle = width - side * 2
  const band = (height - compassSize(width, height) * 1.16 - 8) / 2
  // On landscape screens a normal twelve-tile river should form one complete
  // row instead of eleven tiles plus a stranded tile on the next row.
  let w = Math.min(24,middle/(width>=height?12:8))
  for (; w > 4; w -= .25) {
    const h = w * 200 / 158
    const across = Math.max(1, Math.min(12,Math.floor(middle / w))), down = Math.max(1, Math.min(12,Math.floor(height / w)))
    if ([0,2].every(s=>Math.ceil(Math.max(18,counts[s]||0)/across)*h<=band) &&
        [1,3].every(s=>Math.ceil(Math.max(18,counts[s]||0)/down)*h<=side)) break
  }
  const h = w * 200 / 158, across = Math.max(1,Math.min(12,Math.floor(middle/w))), down = Math.max(1,Math.min(12,Math.floor(height/w)))
  return counts.map((count,seat)=>Array.from({length:count},(_,i)=>{
    if(seat===0||seat===2) {
      const col=i%across,row=Math.floor(i/across),start=(width-across*w)/2
      // 对家弃牌 rotation 0：牌面对本方正立可读（用户要求，不再 180° 倒挂）
      return {x:start+(seat===0?col:across-1-col)*w,y:seat===0?height-(row+1)*h:row*h,w,h,rotation:0}
    }
    const row=i%down,col=Math.floor(i/down),start=(height-down*w)/2
    return {x:seat===3?col*h:width-(col+1)*h,y:start+(seat===3?row:down-1-row)*w,w:h,h:w,rotation:seat===3?-90:90}
  }))
}

export function compassSize(width, height) {
  return Math.min(88, width * .45, height * .42)
}

// Older online snapshots have no lastDiscard. Their public event stream still
// tells us which discard is newest, including after reconnect (no UI memory).
export function latestVisibleDiscard(view) {
  if (view.pendingDiscard) return view.pendingDiscard
  const events = view.lastEvents || []
  let last = view.lastDiscard || null
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i], data = ev.data || {}
    if (ev.type === 'peng' || (ev.type === 'gang' && data.gangType === 'ming')) return null
    if (ev.type === 'discard') {
      if (!last) last = {seat: ev.seat, tile: data.tile}
      break
    }
  }
  return last
}
