// Fixed-frame registration and alpha matting only; imagegen supplies all artwork.
import {createRequire} from 'node:module'
import {mkdir,readFile,copyFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const m=JSON.parse(await readFile('scripts/wardrobe-v18-art.json','utf8')),old=JSON.parse(await readFile('scripts/wardrobe-v17-art.json','utf8'))
const root='.vuepress/public/img/games/dressup/layers/v18',S=4,W=512*S,H=1024*S
await mkdir(root,{recursive:true})
function clean(d){for(let i=0;i<d.length;i+=4){if(d[i+3]<30||Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>190)d[i+3]=0;else if(d[i+3]>240)d[i+3]=255;if(!d[i+3])d[i]=d[i+1]=d[i+2]=0}return d}
const reg=old.registration.back,src=old.assets.find(a=>a.key==='hair5back').file
const {data,info}=await sharp(src).ensureAlpha().raw().toBuffer({resolveWithObject:true})
const rearSprite=await sharp(clean(data),{raw:info}).resize({width:Math.round(info.width*reg.scale*S)}).png().toBuffer()
const rear=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:rearSprite,left:Math.round(reg.left*S),top:Math.round(reg.top*S)}]).raw().toBuffer()
for(const a of m.assets){
 if(!existsSync(a.file))await copyFile(a.source,a.file)
 const f=m.frames.hair,{data,info}=await sharp(a.file).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 const sprite=await sharp(clean(data),{raw:info}).resize(f.w*S,f.h*S,{fit:'fill'}).png().toBuffer()
 const front=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:sprite,left:f.x*S,top:f.y*S}]).raw().toBuffer(),back=Buffer.from(rear)
 // Keep the rear inside THIS front outline without deleting its inner nape.
 for(let y=0;y<H;y++){let l=W,r=-1;for(let x=0;x<W;x++)if(front[(y*W+x)*4+3]>48){l=Math.min(l,x);r=Math.max(r,x)}for(let x=0;x<W;x++){const i=(y*W+x)*4;if(x<l||x>r)back[i+3]=0;else if(y/S>210)back[i+3]=Math.round(back[i+3]*Math.max(0,(230-y/S)/20));if(!back[i+3])back[i]=back[i+1]=back[i+2]=0}}
 for(const [d,frame,id] of [[front,f,a.key],[back,m.frames.back,a.key+'-back']])await sharp(d,{raw:{width:W,height:H,channels:4}}).extract({left:frame.x*S,top:frame.y*S,width:frame.w*S,height:frame.h*S}).webp({quality:96,alphaQuality:100}).toFile(root+'/'+id+'.webp')
}
console.log('v18: hair-5 only, with independent straw/beret/cloche fits; catalogue unchanged')
