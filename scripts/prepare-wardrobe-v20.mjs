// Mechanical uniform anatomical registration / alpha sanitation only.
// One complete imagegen face; no cheek patching, jaw warps or nose replacement.
import {createRequire} from 'node:module'
import {mkdir,readFile,copyFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {HEAD_FRAMES} from '../.vuepress/components/dressup/head-fit.mjs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp'),m=JSON.parse(await readFile('scripts/wardrobe-v20-art.json','utf8')),S=4,W=512*S,H=1024*S,root='.vuepress/public/img/games/dressup/layers/v20'
await mkdir(root+'/catalog',{recursive:true});if(!existsSync(m.file))await copyFile(m.source,m.file)
const {data,info}=await sharp(m.file).ensureAlpha().raw().toBuffer({resolveWithObject:true})
for(let i=0;i<data.length;i+=4){if(data[i+3]<30)data[i+3]=0;else if(data[i+3]>240)data[i+3]=255;if(!data[i+3])data[i]=data[i+1]=data[i+2]=0}
const r=m.registration,sprite=await sharp(data,{raw:info}).resize({width:Math.round(info.width*r.scale*S)}).png().toBuffer(),d=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:sprite,left:Math.round(r.left*S),top:Math.round(r.top*S)}]).raw().toBuffer()
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(y/S>=184)d[i+3]=0;else if(y/S>174)d[i+3]=Math.round(d[i+3]*(184-y/S)/10);if(!d[i+3])d[i]=d[i+1]=d[i+2]=0}
async function save(data,category,id){const f=HEAD_FRAMES[category];await sharp(data,{raw:{width:W,height:H,channels:4}}).extract({left:f.x*S,top:f.y*S,width:f.w*S,height:f.h*S}).webp({quality:96,alphaQuality:100}).toFile(root+'/'+id+'.webp')}
await save(d,'face',m.parts.face)
for(const [category,rects] of Object.entries({eyes:[[218,100,36,26],[258,100,36,26]],brows:[[215,89,41,18],[258,89,41,18]],lip:[[236,134,40,22]]})){
 const patch=Buffer.alloc(d.length)
 for(const [l,t,w,h] of rects)for(let y=t*S;y<(t+h)*S;y++)for(let x=l*S;x<(l+w)*S;x++){const i=(y*W+x)*4,edge=Math.min(x-l*S,(l+w)*S-1-x,y-t*S,(t+h)*S-1-y);d.copy(patch,i,i,i+4);patch[i+3]=Math.round(patch[i+3]*Math.min(1,(edge+.5)/(3*S)))}
 await save(patch,category,m.parts[category])
}
console.log('v20: one coherent sweet head with matching modular features; all prior assets preserved')
