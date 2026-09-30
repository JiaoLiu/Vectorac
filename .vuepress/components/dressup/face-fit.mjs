const clamp=v=>Math.max(0,Math.min(1,v))
const smooth=v=>v*v*(3-2*v)
const arch=(y,start,end)=>y<=start||y>=end?0:Math.sin(Math.PI*(y-start)/(end-start))**2
// Small, continuous changes to the actual lower cheek/jaw. Neck pixels must
// stay unwarped: widening the neck was what created the two lateral "lumps".
export function faceSampleX(face,x,y){
 const offset=face===1?.075*arch(y,120,148):face===2?-.055*arch(y,126,148):face===3?.065*arch(y,128,148):0
 const lateral=smooth(clamp((Math.abs(x-256)-16)/20))
 return 256+(x-256)/(1+offset*lateral)
}
