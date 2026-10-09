// Mechanical anatomical registration / alpha matting of imagegen artwork.
// No skin painting, jaw warping, fake vector eyes or bounding-box auto fitting.
import {createRequire} from 'node:module'
import {mkdir,readFile,copyFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const manifest=JSON.parse(await readFile('scripts/wardrobe-v17-art.json','utf8'))
const root='.vuepress/public/img/games/dressup/layers/v17',S=4,W=512*S,H=1024*S,F=manifest.frames
await mkdir(root+'/catalog',{recursive:true})
for(const a of manifest.assets)if(!existsSync(a.file))await copyFile(a.source,a.file)
const file=id=>manifest.assets.find(a=>a.key===id).file
function clean(d){for(let i=0;i<d.length;i+=4){const range=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);if(d[i+3]<30||range>190)d[i+3]=0;else if(d[i+3]>240)d[i+3]=255;if(!d[i+3])d[i]=d[i+1]=d[i+2]=0}return d}
async function registered(input,reg){
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 const resized=await sharp(clean(data),{raw:info}).resize({width:Math.round(info.width*reg.scale*S)}).png().toBuffer()
 return sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:resized,left:Math.round(reg.left*S),top:Math.round(reg.top*S)}]).ensureAlpha().raw().toBuffer()
}
async function save(d,frame,id){await sharp(d,{raw:{width:W,height:H,channels:4}}).extract({left:frame.x*S,top:frame.y*S,width:frame.w*S,height:frame.h*S}).webp({quality:96,alphaQuality:100}).toFile(root+'/'+id+'.webp')}
const eyeRects=[[218,100,36,26],[258,100,36,26]],browRects=[[215,89,41,18],[258,89,41,18]],lipRects=[[236,134,40,22]]
for(let n=0;n<5;n++){
 const d=await registered(file('face'+n),manifest.registration.face)
 // One clean head down through the jaw/neck; blend only at the bottom of the
 // neck, well below all cheeks/chin. Do not constrain it to the OLD head mask.
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,worldY=y/S;if(worldY>=184)d[i+3]=0;else if(worldY>174)d[i+3]=Math.round(d[i+3]*(184-worldY)/10);if(!d[i+3])d[i]=d[i+1]=d[i+2]=0}
 if(n<4)await save(d,F.face,'face-'+n)
 for(const [category,rects] of Object.entries(n<4?{eyes:eyeRects,brows:browRects,lip:lipRects}:{eyes:eyeRects,lip:lipRects})){
  const patch=Buffer.alloc(d.length)
  for(const [l,t,w,h] of rects)for(let y=t*S;y<(t+h)*S;y++)for(let x=l*S;x<(l+w)*S;x++){const i=(y*W+x)*4,edge=Math.min(x-l*S,(l+w)*S-1-x,y-t*S,(t+h)*S-1-y),a=Math.min(1,(edge+.5)/(3*S));d.copy(patch,i,i,i+4);patch[i+3]=Math.round(patch[i+3]*a)}
  await save(patch,F[category],category+'-'+n)
 }
}
let ponyFront,ponyRear
function rearMatte(rear,front){
 const result=Buffer.from(rear)
 for(let y=0;y<H;y++){
  let left=W,right=-1
  for(let x=0;x<W;x++)if(front[(y*W+x)*4+3]>48){left=Math.min(left,x);right=Math.max(right,x)}
  for(let x=0;x<W;x++){const i=(y*W+x)*4;if(x<left||x>right)result[i+3]=0;else if(y/S>210)result[i+3]=Math.round(result[i+3]*Math.max(0,(230-y/S)/20));if(!result[i+3])result[i]=result[i+1]=result[i+2]=0}
 }
 return result
}
for(let n=0;n<6;n++){
 let front
 if(n===2||n===5)front=await registered(file('hair'+n+'front-final'),manifest.registration['hair'+n])
 else{
  const src=n===4?'scripts/fixtures/wardrobe-v11-sources/hair-4.webp':`scripts/fixtures/wardrobe-v7-sources/hair-${n}.webp`
  front=await sharp(src).resize(W,H).ensureAlpha().raw().toBuffer();clean(front)
 }
 await save(front,F.hair,'hair-'+n);if(n===2)ponyFront=front
 const rear=await registered(file('hair'+n+'back'),manifest.registration.back)
 // Local rear scalp/nape only, not a replacement of the original long locks.
 // The rear scalp must fit THIS hairstyle's actual outer outline. Keep its
 // inner cavity filled, but never expose a rectangular crop or a second crown
 // outside the real front silhouette. This is an alpha matte, not hair paint.
 await save(rearMatte(rear,front),F.back,'hair-'+n+'-back');if(n===2)ponyRear=rear
}
const cap=await registered(file('hair2cap'),manifest.registration.hair2cap)
// The fitted crown is a distinct imagegen asset; keep the original tail byte
// layout outside its crown, with a narrow alpha transition through the strands.
for(let y=0;y<115*S;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,mix=Math.min(1,(115-y/S)/10),a=cap[i+3]*mix,b=ponyFront[i+3]*(1-mix),alpha=a+b;for(let k=0;k<3;k++)ponyFront[i+k]=alpha?Math.round((cap[i+k]*a+ponyFront[i+k]*b)/alpha):0;ponyFront[i+3]=Math.round(alpha)}
await save(ponyFront,F.hair,'hair-2-cap')
await save(rearMatte(ponyRear,ponyFront),F.back,'hair-2-cap-back')
console.log('v17: four coherent heads, high-resolution cropped features, six independent rear hairstyles and fitted ponytail cap variant')
