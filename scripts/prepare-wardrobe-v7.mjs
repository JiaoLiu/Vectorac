// v7 separates independent catalogue artwork from registered wearable sprites.
// Do not infer hair from skin-colour thresholds: shadowed cheeks pass them.
import {createRequire} from 'node:module'
import {readFile,mkdir,copyFile} from 'node:fs/promises'
import {faceSampleX} from '../.vuepress/components/dressup/face-fit.mjs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='.vuepress/public/img/games/dressup/layers/v7',old='.vuepress/public/img/games/dressup/layers'
const fixture='scripts/fixtures/wardrobe-v7-sources',W=512,H=1024,BG={r:244,g:237,b:229,alpha:1}
const faceRoot='.vuepress/public/img/games/dressup/layers/v8'
await mkdir(root+'/catalog',{recursive:true});await mkdir(fixture,{recursive:true})
await mkdir(faceRoot,{recursive:true})
const manifest=JSON.parse(await readFile('scripts/wardrobe-v7-art.json','utf8')),sources={}
for(const asset of manifest.assets){
 const dest=fixture+'/'+asset.id+'.webp';let data
 try{data=await readFile(asset.source)}catch{data=await readFile(dest)}
 await sharp(data).webp({lossless:true}).toFile(dest);sources[asset.id]=dest
}
for(const c of ['eyes','brows','lip','hat'])for(let i=0;i<(c==='lip'?5:4);i++)await copyFile(`${old}/v6/${c}-${i}.webp`,`${root}/${c}-${i}.webp`)
for(let i=0;i<4;i++){
 if(i===2)await copyFile(`${old}/v6/hair-2.webp`,`${root}/hair-2-restored.webp`)
 else await sharp(sources['hair-'+i]).resize(W,H,{fit:'fill'}).webp({lossless:true}).toFile(`${root}/hair-${i}.webp`)
}
const master=await sharp('scripts/fixtures/wardrobe-v5-sources/master.webp').resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer()
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v))
// Alpha must be interpolated in premultiplied space: otherwise transparent
// pixels' hidden RGB creates a dark/peach fringe around the reshaped cheek.
function pixel(x,y){
 x=clamp(x,0,W-1);y=clamp(y,0,H-1);const l=Math.floor(x),t=Math.floor(y),fx=x-l,fy=y-t
 const samples=[[l,t,(1-fx)*(1-fy)],[l+1,t,fx*(1-fy)],[l,t+1,(1-fx)*fy],[l+1,t+1,fx*fy]],out=[0,0,0,0]
 for(const [sx,sy,weight] of samples){const p=(Math.min(H-1,sy)*W+Math.min(W-1,sx))*4,a=master[p+3]*weight;out[3]+=a;for(let c=0;c<3;c++)out[c]+=master[p+c]*a}
 if(out[3])for(let c=0;c<3;c++)out[c]/=out[3]
 return out
}
for(let face=0;face<4;face++){
 const out=Buffer.alloc(master.length)
 for(let y=25;y<163;y++)for(let x=190;x<322;x++){
  out.set(pixel(faceSampleX(face,x,y),y).map(Math.round),(y*W+x)*4)
 }
 await sharp(out,{raw:{width:W,height:H,channels:4}}).webp({lossless:true}).toFile(`${faceRoot}/face-${face}.webp`)
}
// Flat catalogue palette, not a white inset screenshot on a pink gradient.
// Background grading is soft and colour-local; never cut holes into products.
async function card(input,id){
 const {data,info}=await sharp(input).resize(336,336,{fit:'contain',background:BG}).flatten({background:BG}).raw().toBuffer({resolveWithObject:true})
 const reference=[...data.subarray(0,3)]
 for(let p=0;p<data.length;p+=3){const d=Math.max(...reference.map((v,c)=>Math.abs(v-data[p+c]))),mix=clamp((18-d)/12);for(let c=0;c<3;c++)data[p+c]=Math.round(data[p+c]*(1-mix)+[244,237,229][c]*mix)}
 await sharp(data,{raw:{width:info.width,height:info.height,channels:3}}).extend({top:12,bottom:12,left:12,right:12,background:BG}).webp({lossless:true}).toFile(`${root}/catalog/${id}.webp`)
}
for(const c of ['top','bottom','shoes','headpiece','earrings'])for(let i=0;i<4;i++)await card(await sharp(`${old}/${c}-${i}.webp`).trim().png().toBuffer(),c+'-'+i)
const atlases=[['catalog-hats','hat',2,2,4],['catalog-eyes','eyes',2,2,4],['catalog-brows','brows',2,2,4],['catalog-lips','lip',3,2,5],['catalog-faces','face',2,2,4],['catalog-hair','hair',2,2,4],['catalog-socks','socks',2,3,6]]
for(const [src,c,cols,rows,count] of atlases){const m=await sharp(sources[src]).metadata(),w=Math.floor(m.width/cols),h=Math.floor(m.height/rows);for(let i=0;i<count;i++){
 let cell=await sharp(sources[src]).extract({left:i%cols*w,top:Math.floor(i/cols)*h,width:w,height:h}).png().toBuffer()
 // The straw-hat ribbon crosses the atlas gutter into the beret's lower-left
 // whitespace. Do not ship that neighbour fragment as part of the beret card.
 if(c==='hat'&&i===1){const raw=await sharp(cell).removeAlpha().raw().toBuffer();for(let y=Math.floor(h*.55);y<h;y++)for(let x=0;x<w*.18;x++)raw.set([244,237,229],(y*w+x)*3);cell=await sharp(raw,{raw:{width:w,height:h,channels:3}}).png().toBuffer()}
 await card(cell,c+'-'+i)
}}
console.log('v7: skin-free hair, premultiplied jaw edges, 51 independent/uniform catalogue cards')
