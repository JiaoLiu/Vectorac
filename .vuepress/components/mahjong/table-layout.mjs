// Display geometry only: no rules, hidden hands or wall order are inspected.
export function riverLayout(width, height, counts) {
  // Keep four rivers around one readable table centre, not stretched to the
  // viewport corners. Portrait uses its extra height as breathing room.
  const tableWidth=width,tableHeight=height
  width=Math.min(width,Math.max(height*2,width*.76))
  height=Math.min(height,width*1.5)
  const offsetX=(tableWidth-width)/2,offsetY=(tableHeight-height)/2
  const side = width * .22, middle = width - side * 2, band = height * .38
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
      return {x:offsetX+start+(seat===0?col:across-1-col)*w,y:offsetY+(seat===0?height-(row+1)*h:row*h),w,h,rotation:seat===0?0:180}
    }
    const row=i%down,col=Math.floor(i/down),start=(height-down*w)/2
    return {x:offsetX+(seat===3?col*h:width-(col+1)*h),y:offsetY+start+(seat===3?row:down-1-row)*w,w:h,h:w,rotation:seat===3?-90:90}
  }))
}
