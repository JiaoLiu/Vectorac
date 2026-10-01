// Uniform anatomical registration and soft feature extraction, not synthetic
// eyes, eyebrows, jaw reshaping, skin-colour cutouts or independent alpha fits.
import {createRequire} from 'node:module'
import {readFile,mkdir,copyFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='.vuepress/public/img/games/dressup/layers/v16',W=512,H=1024
await mkdir(root+'/catalog',{recursive:true})
// These generated rear strands are confined beneath the existing front and
// the new head; the original v7 long-hair wearable/catalogue are untouched.
await copyFile('.vuepress/public/img/games/dressup/layers/v15/hair-5-back.webp',root+'/hair-1-back.webp')
const manifest=JSON.parse(await readFile('scripts/wardrobe-v16-art.json','utf8'))
const master=await sharp('.vuepress/public/img/games/dressup/layers/v5/master.webp').ensureAlpha().raw().toBuffer()
const raw=async path=>sharp(path).ensureAlpha().raw().toBuffer()
const rects={eyes:[[215,101,39,24],[258,101,39,24]],brows:[[213,89,41,15],[258,89,41,15]],lip:[[236,136,40,19]]}
const images=[]
for(const a of manifest.assets){
 if(!existsSync(a.file))await sharp(a.source).webp({lossless:true}).toFile(a.file)
 const meta=await sharp(a.file).metadata(),scale=51/(a.registration.chinY-a.registration.eyeY),width=Math.round(meta.width*scale)
 const input=await sharp(a.file).resize({width}).png().toBuffer(),ratio=width/meta.width
 const raster=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input,left:Math.round(256-width/2),top:Math.round(109-a.registration.eyeY*ratio)}]).ensureAlpha().raw().toBuffer()
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4
  if(x<190||x>=322||y<25||y>=185){raster[i+3]=0;continue}
  // Generated transparent art sometimes has alpha 252/253 even inside skin.
  // Its opaque interior must hide underlying rear hair; preserve soft edges.
  if(raster[i+3]>240)raster[i+3]=255
  // Keep the complete chin and its under-chin shading. Blend the artist's
  // neck into the original body BELOW the replacement rectangle, instead of
  // cutting across the throat at y=162. Original shoulder anatomy is intact.
  if(y>=163){raster[i+3]=Math.min(raster[i+3],master[i+3]);if(y>=168)raster[i+3]=Math.round(raster[i+3]*(185-y)/17)}
 }
 images[a.index]=raster
 if(a.index<4)await sharp(raster,{raw:{width:W,height:H,channels:4}}).webp({lossless:true}).toFile(`${root}/face-${a.index}.webp`)
 for(const category of a.index<4?['eyes','brows','lip']:['eyes','lip']){
  const layer=Buffer.alloc(raster.length)
  for(const [l,t,w,h] of rects[category])for(let y=t;y<t+h;y++)for(let x=l;x<l+w;x++){
   const i=(y*W+x)*4,edge=Math.min(x-l,l+w-1-x,y-t,t+h-1-y),alpha=Math.min(1,(edge+.5)/2.5)
   raster.copy(layer,i,i,i+4);layer[i+3]=Math.round(layer[i+3]*alpha)
  }
  await sharp(layer,{raw:{width:W,height:H,channels:4}}).webp({lossless:true}).toFile(`${root}/${category}-${a.index}.webp`)
 }
}
const hair=await raw('.vuepress/public/img/games/dressup/layers/v7/hair-0.webp')
const bg='#f4ede5'
const body=Buffer.from(master)
for(let y=25;y<163;y++)for(let x=190;x<322;x++)body[(y*W+x)*4+3]=0
async function portrait(index,feature=null){
 const pieces=[{input:body,raw:{width:W,height:H,channels:4}},{input:'.vuepress/public/img/games/dressup/layers/v5/top-0.webp'},{input:Buffer.from(images[index]),raw:{width:W,height:H,channels:4}}]
 if(feature)pieces.push({input:`${root}/${feature.category}-${feature.index}.webp`})
 pieces.push({input:Buffer.from(hair),raw:{width:W,height:H,channels:4}})
 return sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite(pieces).png().toBuffer()
}
async function card(input,id){await sharp(input).extract({left:175,top:22,width:162,height:193}).resize(360,360,{fit:'contain',background:bg}).flatten({background:bg}).webp({quality:95}).toFile(`${root}/catalog/${id}.webp`)}
for(let i=0;i<4;i++){
 await card(await portrait(i),'face-'+i)
 // Individual choices show that exact feature on the default face. Complete
 // beauty cards below instead show their coordinated face and all features.
 for(const category of ['eyes','brows','lip'])await card(await portrait(0,i?{category,index:i}:null),category+'-'+i)
}
const sakura=await portrait(0,{category:'eyes',index:4})
const sakuraFull=await sharp(sakura).composite([{input:root+'/lip-4.webp'}]).png().toBuffer()
await card(sakuraFull,'eyes-4');await card(sakuraFull,'lip-4')
for(const [i,id] of ['morning','peach','heart','elegant'].entries())await card(await portrait(i),'look-'+id)
await card(sakuraFull,'look-sakura')
console.log('v16 four complete faces, five eye/lip choices and matching beauty portraits prepared')
