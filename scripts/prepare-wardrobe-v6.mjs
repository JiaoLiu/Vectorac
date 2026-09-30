// Head registration is shared, not a patchwork of complete faces. Features
// contain pigment/eyeballs only, never another nose or a rectangle of skin.
import {createRequire} from 'node:module'
import {readFile,mkdir} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const W=512,H=1024,root='.vuepress/public/img/games/dressup/layers/v6',old='.vuepress/public/img/games/dressup/layers'
await mkdir(root,{recursive:true});await mkdir(root+'/catalog',{recursive:true})
const raster=async file=>sharp(file).resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer()
const master=await raster('scripts/fixtures/wardrobe-v5-sources/master.webp')
const portrait=await raster('scripts/fixtures/wardrobe-v5-sources/face-0.webp')
const save=async(id,data)=>sharp(data,{raw:{width:W,height:H,channels:4}}).webp({lossless:true}).toFile(`${root}/${id}.webp`)
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x))
function sample(data,x,y,c){x=clamp(x,0,W-1);y=clamp(y,0,H-1);const l=Math.floor(x),t=Math.floor(y),fx=x-l,fy=y-t;return data[(t*W+l)*4+c]*(1-fx)*(1-fy)+data[(t*W+Math.min(W-1,l+1))*4+c]*fx*(1-fy)+data[(Math.min(H-1,t+1)*W+l)*4+c]*(1-fx)*fy+data[(Math.min(H-1,t+1)*W+Math.min(W-1,l+1))*4+c]*fx*fy}
function inside(x,y,p){let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const [a,b]=p[i],[c,d]=p[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes}return yes}
// All four jaw outlines use the same feature-free skin/nose. Central landmarks
// stay fixed; only the lateral cheek/jaw and chin silhouette are reshaped.
for(let face=0;face<4;face++){
 const out=Buffer.alloc(master.length)
 for(let y=25;y<163;y++)for(let x=190;x<322;x++){
  const jaw=clamp((y-114)/30),chin=clamp((y-146)/16)
  const width=[1,1+.28*jaw,1+.10*jaw-.35*chin,1+.26*jaw-.04*chin][face]
  const side=clamp((Math.abs(x-256)-16)/22),sx=256+(x-256)/(1+(width-1)*side)
  const sy=face===1?y+4*chin:face===2?y-1*chin:y
  for(let c=0;c<4;c++)out[(y*W+x)*4+c]=sample(master,sx,sy,c)
 }
 await save('face-'+face,out)
}
const eyeLeft=[[215,107],[222,101],[234,100],[242,102],[248,111],[242,116],[228,117],[218,113]]
const eyeRight=eyeLeft.map(([x,y])=>[512-x,y])
function eyeMask(x,y){return inside(x,y,eyeLeft)||inside(x,y,eyeRight)}
for(let eye=0;eye<4;eye++){
 const out=Buffer.alloc(master.length)
 for(let y=99;y<119;y++)for(let x=210;x<303;x++){
  const sy=eye===1?109+(y-109)/.87:y;if(!eyeMask(x,sy))continue
  const p=(y*W+x)*4
  for(let c=0;c<3;c++)out[p+c]=sample(portrait,x,sy,c)
  // Eye whites retain their shape; outside the eyelids there are NO skin pixels.
  out[p+3]=255
  const cx=x<256?236:276,iris=Math.hypot((x-cx)/5.2,(sy-109)/5.3)
  if(iris<1&&iris>.35){const [r,g,b]=out.subarray(p,p+3),lum=(r+g+b)/3;const color=eye===2?[.76,.93,.78]:eye===3?[.80,.87,.93]:eye===1?[.70,.52,.40]:[1.07,.72,.48];for(let c=0;c<3;c++)out[p+c]=clamp(lum*color[c],0,255)}
 }
 await save('eyes-'+eye,out)
}
// Brows: transparent individual hair pigment; no eyebrow-to-eye skin strip.
for(let brow=0;brow<4;brow++){
 const out=Buffer.alloc(master.length)
 for(let y=86;y<101;y++)for(let x=212;x<301;x++){
  const center=x<256?231:281,arch=Math.abs(x-center)/17
  const sy=y+[0,(1-arch)*2.2,-(1-arch)*1.4,(x<256?x-center:center-x)*.09][brow]
  const rgb=[0,1,2].map(c=>sample(portrait,x,sy,c)),skin=[0,1,2].map(c=>sample(master,x,sy,c))
  const dark=Math.min(...skin.map((v,c)=>v-rgb[c])),alpha=clamp((dark-26)/43)
  if(!alpha)continue;const p=(y*W+x)*4;out[p]=91;out[p+1]=59;out[p+2]=45;out[p+3]=255*alpha*(brow===3?1:.85)
 }
 await save('brows-'+brow,out)
}
const lipTint=[[0,0,0],[-14,-18,-1],[5,0,-12],[-42,-43,-24],[0,6,17]]
for(let lip=0;lip<5;lip++){
 const out=Buffer.alloc(master.length)
 for(let y=138;y<151;y++)for(let x=239;x<272;x++){
  const p=(y*W+x)*4,ellipse=((x-255)/14.5)**2+((y-143.5)/6.3)**2
  const pigment=(portrait[p]-portrait[p+1])-(master[p]-master[p+1]),alpha=clamp((1-ellipse)*3)*clamp((pigment-13)/16)
  if(!alpha)continue
  for(let c=0;c<3;c++)out[p+c]=clamp(portrait[p+c]+lipTint[lip][c],0,255)
  out[p+3]=255*alpha
 }
 await save('lip-'+lip,out)
}
for(let hair=0;hair<4;hair++){
 const src=await raster(`scripts/fixtures/wardrobe-v5-sources/hair-${hair}.webp`),out=Buffer.alloc(src.length)
 for(let y=0;y<430;y++)for(let x=110;x<400;x++){
  const p=(y*W+x)*4,[r,g,b,a]=src.subarray(p,p+4)
  // Remove unchanged mannequin skin, not a geometric face hole. Hair crossing
  // the cheek/ear is much darker than the neutral reference and remains intact.
  const skinDifference=Math.abs(r-master[p])+Math.abs(g-master[p+1])+Math.abs(b-master[p+2])
  if(master[p+3]>150&&skinDifference<90)continue
  if(a&&r<230&&g<187&&b<163&&r>g*1.025&&g>b*1.01)src.copy(out,p,p,p+4)
 }
 await save('hair-'+hair,out)
}
// Catalogue art is independent product art, never the worn alpha cutout.
for(const category of ['top','bottom','shoes','hat','headpiece','earrings','socks'])for(let i=0;i<4;i++){
 await sharp(`${old}/${category}-${i}.webp`).trim().resize(360,360,{fit:'contain',background:'#f7eee6'}).webp({quality:93}).toFile(`${root}/catalog/${category}-${i}.webp`)
}
const manifest=JSON.parse(await readFile('scripts/wardrobe-v6-art.json','utf8'))
await mkdir('scripts/fixtures/wardrobe-v6-sources',{recursive:true})
await sharp('scripts/fixtures/wardrobe-v5-sources/hair-0.webp').extract({left:260,top:20,width:365,height:450}).resize(730,900).webp({lossless:true}).toFile('scripts/fixtures/wardrobe-v6-sources/hat-reference.webp')
for(const item of manifest.assets.filter(a=>a.id.startsWith('hat-'))){
 const i=Number(item.id.slice(4)),fallback=`scripts/fixtures/wardrobe-v6-sources/${item.id}.webp`
 let source;try{source=await readFile(item.source)}catch{source=await readFile(fallback)}
 await sharp(source).webp({lossless:true}).toFile(fallback)
 // The generation reference is a crop of the full-body master. Its inverse
 // transform is fixed for all hats, never a per-product alpha bounding box.
 const crop=await sharp(source).resize(211,260,{fit:'fill'}).ensureAlpha().raw().toBuffer(),out=Buffer.alloc(master.length)
 for(let y=0;y<260;y++)for(let x=0;x<211;x++){
  const dx=x+150,dy=y+12,p=(y*211+x)*4,[r,g,b,a]=crop.subarray(p,p+4)
  let keep=false
  if(i===0)keep=(dy<86||dx<213&&dy<111||dx>310&&dy<162)&&r>150&&g>120&&b>93&&r-g<66&&(g>r*.82||dx>312)
  if(i===1)keep=dy<115&&(b>r*1.1&&b>g*1.07||dx>305&&dy<93&&r>145&&g>115&&b<g*.9)
  if(i===2)keep=dy<97&&(g>r*.9&&b>90||r>170&&g>r*.79&&b<g*.82)
  if(i===3)keep=dy<86&&r>145&&g>r*.80&&b>r*.72
  if(keep&&a>35)crop.copy(out,(dy*W+dx)*4,p,p+4)
 }
 await save(item.id,out)
 await sharp(out,{raw:{width:W,height:H,channels:4}}).trim().resize(360,360,{fit:'contain',background:'#f7eee6'}).webp({quality:93}).toFile(`${root}/catalog/${item.id}.webp`)
}
const socksArt=manifest.assets.find(a=>a.id==='socks-catalog'),socksFile='scripts/fixtures/wardrobe-v6-sources/socks-catalog.webp'
let socksSource;try{socksSource=await readFile(socksArt.source)}catch{socksSource=await readFile(socksFile)}
await sharp(socksSource).webp({quality:96}).toFile(socksFile)
const sm=await sharp(socksSource).metadata(),rows=[0,.275,.54,1]
for(let i=0;i<6;i++){const row=Math.floor(i/2),top=Math.round(sm.height*rows[row]),bottom=Math.round(sm.height*rows[row+1]);await sharp(socksSource).extract({left:i%2*Math.floor(sm.width/2),top,width:Math.floor(sm.width/2),height:bottom-top}).resize(360,360,{fit:'contain',background:'#f7eee6'}).webp({quality:93}).toFile(`${root}/catalog/socks-${i}.webp`)}
// Beauty and hairstyle design cards show styled portraits or the selected
// feature close-up, not identical bald heads or fragments of the body mask.
const {PARTS,DEFAULT_PARTS}=await import('../.vuepress/components/dressup/parts.mjs')
for(const part of PARTS.filter(p=>p.index>=0&&['hair','face','eyes','brows','lip'].includes(p.category))){
 const selected={...DEFAULT_PARTS,[part.category]:part.id,hair:part.category==='hair'?part.id:'hair-2'}
 const body=Buffer.from(master);for(let y=25;y<163;y++)for(let x=190;x<322;x++)body[(y*W+x)*4+3]=0
 const png=await sharp(body,{raw:{width:W,height:H,channels:4}}).composite(['face','eyes','brows','lip','hair'].map(c=>({input:`${root}/${selected[c]}.webp`}))).png().toBuffer()
 const rect=part.category==='eyes'?{left:207,top:97,width:98,height:25}:part.category==='brows'?{left:207,top:83,width:98,height:25}:part.category==='lip'?{left:231,top:132,width:50,height:24}:part.category==='hair'?{left:157,top:4,width:198,height:244}:{left:188,top:24,width:137,height:157}
 await sharp(png).extract(rect).resize(360,360,{fit:'contain',background:'#f7eee6'}).webp({quality:95}).toFile(`${root}/catalog/${part.id}.webp`)
}
console.log('v6 neutral jaw shapes, isolated facial features, complete hair and independent product cards prepared')
