// The restored ponytail remains byte-for-byte its old registered artwork.
// Its early extraction also retained fragments of the old model's ears and
// features. Matte those remnants only; do not reshape/resize the hairstyle.
const cache=new WeakMap()
export function wearingHair(image,part,master){
 if(part.id!=='hair-2'||typeof document==='undefined')return image
 if(cache.has(image))return cache.get(image)
 const c=document.createElement('canvas');c.width=512;c.height=1024
 const ctx=c.getContext('2d');ctx.drawImage(image,0,0)
 const pixels=ctx.getImageData(0,0,512,1024),d=pixels.data
 const mask=document.createElement('canvas');mask.width=512;mask.height=1024
 const pen=mask.getContext('2d');pen.drawImage(master,0,0)
 const anatomy=pen.getImageData(0,0,512,1024).data
 for(let y=104;y<163;y++)for(let x=205;x<307;x++){
  const i=(y*512+x)*4
  const feature=x>=232&&x<280
  const ear=y<139&&(x<232||x>=280)
  // A measured anatomical matte, NOT a colour threshold that could mistake
  // highlights or shadowed strands for skin. Leave all hair outside it alone.
  let skin=false
  if(ear)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(anatomy[((y+dy)*512+x+dx)*4+3]>100)skin=true
  if(feature||skin)d[i+3]=0
 }
 ctx.putImageData(pixels,0,0);cache.set(image,c);return c
}
