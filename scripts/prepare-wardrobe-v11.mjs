// Registered wearables, independently drawn products, and anatomical fit fixes.
// Old source assets and catalogue cards are never rewritten.
import {createRequire} from 'node:module'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='.vuepress/public/img/games/dressup/layers/v11',fixtures='scripts/fixtures/wardrobe-v11-sources',W=512,H=1024
await mkdir(root+'/catalog',{recursive:true});await mkdir(fixtures,{recursive:true})
const manifest=JSON.parse(await readFile('scripts/wardrobe-v11-art.json','utf8'))
const raw=async f=>sharp(f).resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer()
const master=await raw('scripts/fixtures/wardrobe-v5-sources/master.webp'),oldBoot=await raw('.vuepress/public/img/games/dressup/layers/v5/shoes-3.webp')
async function save(id,data){await sharp(data,{raw:{width:W,height:H,channels:4}}).webp({quality:95,alphaQuality:100}).toFile(`${root}/${id}.webp`)}
function rowBounds(d,y,left=0,right=W){left=Math.max(0,Math.floor(left));right=Math.min(W,Math.ceil(right));let l=right,r=left-1;for(let x=left;x<right;x++)if(d[(y*W+x)*4+3]>190){l=Math.min(l,x);r=Math.max(r,x)}return [l,r]}
function sample(d,x,y,out,p){const l=Math.max(0,Math.min(W-1,Math.floor(x))),r=Math.min(W-1,l+1),f=Math.max(0,Math.min(1,x-l)),a=d[(y*W+l)*4+3]*(1-f),b=d[(y*W+r)*4+3]*f,alpha=a+b;out[p+3]=alpha;if(alpha)for(let c=0;c<3;c++)out[p+c]=(d[(y*W+l)*4+c]*a+d[(y*W+r)*4+c]*b)/alpha}
// Every skirt must cover the actual waist/hips, including BOTH sides. The
// central opacity-only check missed skin poking out from the narrowed band.
for(let i=12;i<18;i++){
 const d=await raw(`.vuepress/public/img/games/dressup/layers/v10/bottom-${i}.webp`),out=Buffer.from(d)
 for(let y=365;y<470;y++){
  const [l,r]=rowBounds(d,y),[bl,br]=rowBounds(master,y,190-(y-365)*.28,322+(y-365)*.28)
  const half=Math.min(256-l,r-256),body=Math.max(256-bl,br-256)+3,scale=Math.max(1,body/half)
  for(let x=0;x<W;x++)sample(d,256+(x-256)/scale,y,out,(y*W+x)*4)
 }
 await save('bottom-'+i,out)
}
// All new skirts cover the leotard region. Only actually exposed lower legs
// belong in the underbody; opaque waist flesh must never sit behind a skirt.
const legs=Buffer.from(master);for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(y<490||y>=875||x<165||x>=347)legs[(y*W+x)*4+3]=0
await save('underbody',legs)
// The original straw hat also retained a disconnected forehead island. Remove
// that source matte only, preserving every brim/ribbon pixel and the old fit.
const straw=await raw('.vuepress/public/img/games/dressup/layers/v7/hat-0.webp'),island=new Set([80*W+256]),queue=[80*W+256]
for(let i=0;i<queue.length;i++){const p=queue[i],x=p%W;for(const n of [x?p-1:-1,x<W-1?p+1:-1,p-W,p+W])if(n>=0&&n<W*H&&!island.has(n)&&straw[n*4+3]>60){island.add(n);queue.push(n)}}
if(queue.length>1000)throw Error('Straw scalp matte unexpectedly connects to the hat')
for(const p of island){const x=p%W,y=Math.floor(p/W);for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++){const n=yy*W+xx;if(island.has(n)||straw[n*4+3]<=60)straw[n*4+3]=0}}
await save('hat-0',straw)
function bbox(d,w,h,left=0,right=w){let l=w,r=-1,t=h,b=-1;for(let y=0;y<h;y++)for(let x=left;x<right;x++)if(d[(y*w+x)*4+3]>90){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}if(r<l)throw Error('Empty sprite');return {left:l,top:t,width:r-l+1,height:b-t+1}}
function clean(d,w,h){
 for(let p=0;p<d.length;p+=4){const [r,g,b]=d.subarray(p,p+3);if(r>180&&g<65&&b<90||r>220&&g>180&&b<50||g>200&&r<80&&b<110||b>180&&r<80&&g<160)d[p+3]=0}
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h);for(let i=0;i<w*h;i++)if(!seen[i]&&d[i*4+3]>60){let n=1,j=0;q[0]=i;seen[i]=1;while(j<n){const p=q[j++],x=p%w;for(const k of [x?p-1:-1,x<w-1?p+1:-1,p-w,p+w])if(k>=0&&k<w*h&&!seen[k]&&d[k*4+3]>60){seen[k]=1;q[n++]=k}}if(n<32)for(let j=0;j<n;j++)d[q[j]*4+3]=0}return d
}
async function source(a){const f=`${fixtures}/${a.id}.webp`;if(!existsSync(f))await sharp(a.source).webp({lossless:true}).toFile(f);return f}
async function imageData(f){const {data,info}=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data:clean(data,info.width,info.height),info}}
async function placed(data,info,rects){const inputs=[];for(const {crop,dest} of rects)inputs.push({input:await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(crop).resize(dest[2],dest[3],{fit:'fill'}).png().toBuffer(),left:dest[0],top:dest[1]});return sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite(inputs).raw().toBuffer()}
// Fit boots/stockings to the measured leg and foot landmarks, NOT a generic
// box. Calves lean outward while feet settle at their original centres.
async function legPair(data,info,a){
 const out=Buffer.alloc(W*H*4)
 for(let side=0;side<2;side++){
  const b=bbox(data,info.width,info.height,side?Math.floor(info.width/2):0,side?info.width:Math.floor(info.width/2)),height=989-a.start
  const strip=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(b).resize(128,height,{fit:'fill'}).ensureAlpha().raw().toBuffer()
  for(let j=0;j<height;j++){
   const y=a.start+j;let l=128,r=-1;for(let x=0;x<128;x++)if(strip[(j*128+x)*4+3]>100){l=Math.min(l,x);r=Math.max(r,x)}if(r<l)continue
   let [lo,hi]=rowBounds(a.kind==='boot'&&y>=890?oldBoot:master,y,side?256:175,side?337:256)
   if(hi<lo)continue
   if(a.kind==='boot'&&y<890){lo-=3;hi+=3}
   const width=hi-lo+1
   // Retain transparent edging as well as the opacity core of the object.
   for(let x=lo-2;x<=hi+2;x++){
    const sx=l+(x-lo)/(Math.max(1,width-1))*(r-l),ix=Math.max(0,Math.min(127,Math.floor(sx))),rx=Math.min(127,ix+1),f=Math.max(0,Math.min(1,sx-ix)),p=(y*W+x)*4,al=strip[(j*128+ix)*4+3]*(1-f),ar=strip[(j*128+rx)*4+3]*f
    if(x<lo||x>hi)continue;out[p+3]=al+ar;if(al+ar)for(let c=0;c<3;c++)out[p+c]=(strip[(j*128+ix)*4+c]*al+strip[(j*128+rx)*4+c]*ar)/(al+ar)
   }
  }
 }return out
}
let capCuts
for(const a of manifest.assets){
 const f=await source(a),{data,info}=await imageData(f)
 if(a.kind==='catalog'||a.kind==='jewellery'){
  const b=bbox(data,info.width,info.height),img=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(b).resize({width:300,height:300,fit:'inside'}).png().toBuffer(),m=await sharp(img).metadata()
  await sharp({create:{width:360,height:360,channels:4,background:'#f4ede5'}}).composite([{input:img,left:Math.floor((360-m.width)/2),top:Math.floor((360-m.height)/2)}]).webp({lossless:true}).toFile(`${root}/catalog/${a.item||a.id}.webp`)
  if(a.kind==='catalog')continue
 }
 let layer
 if(a.kind==='hair')layer=clean(await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).resize(W,H,{fit:'fill'}).raw().toBuffer(),W,H)
 else if(a.kind==='sock'||a.kind==='boot')layer=await legPair(data,info,a)
 else if(a.pair){const middle=Math.floor(info.width/2);layer=await placed(data,info,[{crop:bbox(data,info.width,info.height,0,middle),dest:a.dest[0]},{crop:bbox(data,info.width,info.height,middle,info.width),dest:a.dest[1]}])}
 else layer=await placed(data,info,[{crop:bbox(data,info.width,info.height),dest:a.dest}])
 await save(a.item||a.id,layer)
 if(a.cap){capCuts=Array.from({length:W},(_,x)=>{for(let y=0;y<120;y++)if(layer[(y*W+x)*4+3]>96)return Math.max(0,y-1);return 0})}
}
if(capCuts)await writeFile('.vuepress/components/dressup/accessory-coverage.mjs','// Generated from the actual registered cloche silhouette.\nexport const NEW_CAP_CUTS='+JSON.stringify({'hat-10':capCuts})+'\n')
console.log('v11: corrected waist coverage, skin-free crown, 12 new wearables and independent product designs')
