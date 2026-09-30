// Deterministic, bounded, canvas-native materials. No CSS/canvas filter API:
// older mobile Safari lacks CanvasRenderingContext2D.filter support.
const cache=[]
const palettes=new Map()
const BG=[244,237,229]
const clamp=v=>Math.max(0,Math.min(1,v))
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255)
function hsl(r,g,b){const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo,l=(hi+lo)/2
 if(!d)return [0,0,l]
 let h=hi===r?(g-b)/d+(g<b?6:0):hi===g?(b-r)/d+2:(r-g)/d+4
 return [h/6,d/(1-Math.abs(2*l-1)),l]
}
function fromHsl(h,s,l){const a=s*Math.min(l,1-l),f=n=>{const k=(n+h*12)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1))};return [f(0),f(8),f(4)]}
function inside(x,y,poly){let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)result=!result}return result}
// Original top sprites include exposed neck/chest/arms, not just textile.
// Keep those measured anatomical regions untouched; a skin-colour threshold
// would wrongly protect pink lace or dye shadowed skin.
export function protectedSkin(part,x,y){
 if(part.category!=='top')return false
 if(y<165)return true
 const i=part.sourceIndex,arm=[310,292,266,290][i]
 if(y>=arm&&(x<194||x>318))return true
 if(i===0)return x>=194&&x<=320&&y<258
 if(i===3)return x>=193&&x<=320&&y<245
 if(i===2)return x>=194&&x<=320&&y<181
 return inside(x,y,[[232,155],[281,155],[284,194],[256,241],[228,194]])
}
export function materialPixel(r,g,b,material){
 if(!palettes.has(material.color))palettes.set(material.color,hsl(...rgb(material.color)))
 const [h,s]=palettes.get(material.color),[,oldS,l]=hsl(r/255,g/255,b/255)
 // White lace/pearls and deep seams keep their highlights; dark velvet can
 // accept a gentle colour lift without becoming a flat painted silhouette.
 const weight=clamp(oldS*5)*clamp((.99-l)*12)
 const lift=l<.28?.08*(1-l/.28):0
 const tinted=fromHsl(h,Math.max(s*.8,oldS*.6),clamp(l+lift))
 return [r,g,b].map((v,c)=>Math.round(v*(1-weight)+tinted[c]*255*weight))
}
function ornament(ctx,kind,x,y,size,ink){
 ctx.fillStyle=ink
 if(kind==='dot'){ctx.beginPath();ctx.arc(x,y,size*.30,0,Math.PI*2);ctx.fill();return}
 if(kind==='star'){ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?size*.24:size;ctx.lineTo(x+Math.sin(a)*r,y+Math.cos(a)*r)}ctx.closePath();ctx.fill();return}
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.ellipse(x+Math.sin(a)*size*.58,y+Math.cos(a)*size*.58,size*.30,size*.50,-a,0,Math.PI*2);ctx.fill()}
 ctx.fillStyle='#dab977';ctx.beginPath();ctx.arc(x,y,size*.24,0,Math.PI*2);ctx.fill()
}
export function materialImage(image,part,catalog=false,placement=null){
 if(!part.material)return image
 const key=part.id+':'+catalog,hit=cache.find(e=>e.image===image&&e.key===key)
 if(hit){cache.splice(cache.indexOf(hit),1);cache.push(hit);return hit.canvas}
 const canvas=document.createElement('canvas');canvas.width=placement?512:image.naturalWidth||image.width;canvas.height=placement?1024:image.naturalHeight||image.height
 const ctx=canvas.getContext('2d')
 // Tiny jewellery must be scaled with the original Image first. Recolouring
 // its large source into a Canvas first changes the browser's downsample
 // path and can make lace/pearl edges much harsher on a small phone model.
 if(placement)for(const rect of placement)ctx.drawImage(image,...rect)
 else ctx.drawImage(image,0,0)
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),d=pixels.data
 // Catalogue background stays warm ivory, never coloured with the garment.
 const mask=new Uint8ClampedArray(d.length)
 for(let p=0;p<d.length;p+=4){
  if(!d[p+3])continue
  if(!catalog&&protectedSkin(part,p/4%canvas.width,Math.floor(p/4/canvas.width)))continue
  const background=catalog&&Math.max(...BG.map((v,c)=>Math.abs(v-d[p+c])))<28
  if(background)continue
  const tinted=materialPixel(d[p],d[p+1],d[p+2],part.material)
  for(let c=0;c<3;c++)d[p+c]=tinted[c]
  mask[p+3]=d[p+3]
 }
 ctx.putImageData(pixels,0,0)
 if(part.material.pattern){
  const overlay=document.createElement('canvas');overlay.width=canvas.width;overlay.height=canvas.height;const pen=overlay.getContext('2d')
  const w=canvas.width,h=canvas.height,area=catalog?[w*.34,h*.40,w*.66,h*.80]:part.category==='top'?[211,251,301,355]:[180,405,332,552]
  const step=catalog?w*.13:27,size=catalog?w*.014:part.material.pattern==='dot'?3:4
  for(let y=area[1];y<area[3];y+=step)for(let x=area[0]+(Math.round(y/step)%2)*step/2;x<area[2];x+=step)ornament(pen,part.material.pattern,x,y,size,part.material.ink)
  // Clip ink to the garment alpha, preserving every lace opening and edge.
  const stencil=document.createElement('canvas');stencil.width=w;stencil.height=h;const sctx=stencil.getContext('2d'),m=sctx.createImageData(w,h);m.data.set(mask);sctx.putImageData(m,0,0)
  pen.globalCompositeOperation='destination-in';pen.drawImage(stencil,0,0);ctx.drawImage(overlay,0,0)
  const final=ctx.getImageData(0,0,w,h);for(let p=3;p<d.length;p+=4)final.data[p]=d[p];ctx.putImageData(final,0,0)
 }
 cache.push({image,key,canvas});while(cache.length>4)cache.shift()
 return canvas
}
