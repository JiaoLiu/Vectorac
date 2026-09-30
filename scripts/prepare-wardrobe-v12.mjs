// Deliver independent product art and anatomically registered wearables.
// Only registration/occlusion masks are derived here; artwork comes from imagegen.
import {createRequire} from 'node:module'
import {readFile,mkdir} from 'node:fs/promises'
import {existsSync} from 'node:fs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='.vuepress/public/img/games/dressup/layers/v12',fixtures='scripts/fixtures/wardrobe-v12-sources',W=512,H=1024
await mkdir(root+'/catalog',{recursive:true});await mkdir(fixtures,{recursive:true})
const manifest=JSON.parse(await readFile('scripts/wardrobe-v12-art.json','utf8'))
const raw=async f=>sharp(f).resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer()
const master=await raw('scripts/fixtures/wardrobe-v5-sources/master.webp'),feet=await raw('.vuepress/public/img/games/dressup/layers/v5/shoes-3.webp')
async function save(id,data){await sharp(data,{raw:{width:W,height:H,channels:4}}).webp({quality:95,alphaQuality:100}).toFile(`${root}/${id}.webp`)}
function bbox(d,w,h,left=0,right=w){let l=w,r=-1,t=h,b=-1;for(let y=0;y<h;y++)for(let x=left;x<right;x++)if(d[(y*w+x)*4+3]>90){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}if(r<l)throw Error('Empty sprite');return {left:l,top:t,width:r-l+1,height:b-t+1}}
function rowBounds(d,w,y,left=0,right=w){let l=right,r=left-1;for(let x=left;x<right;x++)if(d[(y*w+x)*4+3]>190){l=Math.min(l,x);r=Math.max(r,x)}return [l,r]}
function smoothBounds(d,y,side){const rows=[];for(let j=Math.max(0,y-2);j<=Math.min(H-1,y+2);j++){const b=rowBounds(d,W,j,side?256:175,side?337:256);if(b[1]>=b[0])rows.push(b)}return rows.length?[rows.reduce((a,b)=>a+b[0],0)/rows.length,rows.reduce((a,b)=>a+b[1],0)/rows.length]:[1,0]}
async function legPair(data,info,a){const out=Buffer.alloc(W*H*4)
 for(let side=0;side<2;side++){
  const b=bbox(data,info.width,info.height,side?Math.floor(info.width/2):0,side?info.width:Math.floor(info.width/2)),height=991-a.start
  const strip=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(b).resize(128,height,{fit:'fill'}).ensureAlpha().raw().toBuffer()
  for(let j=0;j<height;j++){
   const y=a.start+j,[l,r]=rowBounds(strip,128,j);if(r<l)continue
   // The old ankle boot's buckle is not an ankle landmark. Use the master
   // down to the instep, blending into its shoe toe silhouette only below it.
   const body=smoothBounds(master,y,side),toe=smoothBounds(feet,y,side),t=Math.max(0,Math.min(1,(y-935)/20))
   let [lo,hi]=t?body.map((v,i)=>v*(1-t)+toe[i]*t):body;if(hi<lo)continue
   lo-=a.padding;hi+=a.padding
   for(let x=Math.floor(lo)-1;x<=Math.ceil(hi)+1;x++){
    // Preserve rounded/V-shaped boot openings instead of stretching the
    // first one-pixel cuff row into a horizontal stripe across bare skin.
    const cuff=Math.max(0,Math.min(1,j/5)),sl=l*cuff,sr=127+(r-127)*cuff
    const sx=sl+(x-lo)/Math.max(1,hi-lo)*(sr-sl),ix=Math.max(0,Math.min(127,Math.floor(sx))),rx=Math.min(127,ix+1),f=Math.max(0,Math.min(1,sx-ix)),p=(y*W+x)*4
    const al=strip[(j*128+ix)*4+3]*(1-f),ar=strip[(j*128+rx)*4+3]*f,edge=Math.max(0,Math.min(1,x-lo+1,hi-x+1))
    out[p+3]=(al+ar)*edge;if(al+ar)for(let c=0;c<3;c++)out[p+c]=(strip[(j*128+ix)*4+c]*al+strip[(j*128+rx)*4+c]*ar)/(al+ar)
   }
  }
 }return out
}
async function placed(data,info,a){let b=bbox(data,info.width,info.height)
 // The upper arc is the necklace's rear clasp: it must not float across the
 // neck on the wearer. Product cards retain the complete independent design.
 if(a.frontFraction){const trim=Math.round(b.height*a.frontFraction);b={...b,top:b.top+trim,height:b.height-trim}}
 // Sharp rotates before extraction in one pipeline; materialize the crop
 // first so its bbox remains valid for the subsequent rotation.
 let img=sharp(await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(b).png().toBuffer())
 if(a.rotate)img=img.rotate(a.rotate,{background:'#00000000'}).trim()
 const [x,y,w,h]=a.dest,input=await img.resize(w,h,{fit:'fill'}).png().toBuffer()
 return sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input,left:x,top:y}]).raw().toBuffer()
}
for(const a of manifest.assets){
 const f=`${fixtures}/${a.id}.webp`;if(!existsSync(f))await sharp(a.source).webp({lossless:true}).toFile(f)
 const {data,info}=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 if(a.kind==='catalog'||a.kind==='necklace'||a.kind==='wrist'){
  const input=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(bbox(data,info.width,info.height)).resize({width:300,height:300,fit:'inside'}).png().toBuffer(),m=await sharp(input).metadata()
  await sharp({create:{width:360,height:360,channels:4,background:'#f4ede5'}}).composite([{input,left:Math.floor((360-m.width)/2),top:Math.floor((360-m.height)/2)}]).webp({lossless:true}).toFile(`${root}/catalog/${a.item||a.id}.webp`)
  if(a.kind==='catalog')continue
 }
 const layer=a.kind==='shoe'?await legPair(data,info,a):await placed(data,info,a)
 if(a.back){
  const front=Buffer.from(layer),back=Buffer.from(layer),[x,y,w,h]=a.dest,cx=x+w/2,cy=y+h*.36
  for(let yy=0;yy<H;yy++)for(let xx=0;xx<W;xx++){const p=(yy*W+xx)*4;if(yy<cy+Math.tan(18*Math.PI/180)*(xx-cx))front[p+3]=0;else back[p+3]=0}
  await save(a.id,front);await save(a.id+'-back',back)
 }else await save(a.item||a.id,layer)
}
console.log('v12: refitted original small hat, six shoe cuts, four necklaces, four wrist pieces, independent product designs')
