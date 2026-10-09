// Local generated crown composite and mechanical rear alpha registration only.
import {createRequire} from 'node:module'
import {mkdir,readFile,copyFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {HEAD_FRAMES,AIR_BANGS_FRONT_FRAME} from '../.vuepress/components/dressup/head-fit.mjs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp'),m=JSON.parse(await readFile('scripts/wardrobe-v19-art.json','utf8'))
const root='.vuepress/public/img/games/dressup/layers/',S=4,W=512*S,H=1024*S,F=HEAD_FRAMES.hair,B=HEAD_FRAMES.back,A=AIR_BANGS_FRONT_FRAME
await mkdir(root+'v19',{recursive:true});if(!existsSync(m.file))await copyFile(m.source,m.file)
const {data:patch,info}=await sharp(m.file).ensureAlpha().resize(m.patch.w*S,m.patch.h*S,{fit:'fill'}).raw().toBuffer({resolveWithObject:true})
for(let i=0;i<patch.length;i+=4){if(patch[i+3]<30||Math.max(patch[i],patch[i+1],patch[i+2])-Math.min(patch[i],patch[i+1],patch[i+2])>190)patch[i+3]=0;else if(patch[i+3]>240)patch[i+3]=255;if(!patch[i+3])patch[i]=patch[i+1]=patch[i+2]=0}
for(const name of ['hair-5','hair-5-straw','hair-5-beret','hair-5-cloche']){
 const front=await sharp(root+'v18/'+name+'.webp').ensureAlpha().raw().toBuffer()
 if(name==='hair-5'){
  for(let y=0;y<m.transition.end*S;y++)for(let x=0;x<info.width;x++){
   const i=(y*info.width+x)*4,j=(y*F.w*S+(m.patch.x-F.x)*S+x)*4,mix=Math.min(1,(m.transition.end-y/S)/(m.transition.end-m.transition.start)),a=patch[i+3]*mix,b=front[j+3]*(1-mix),alpha=a+b
   for(let k=0;k<3;k++)front[j+k]=alpha?Math.round((patch[i+k]*a+front[j+k]*b)/alpha):0;front[j+3]=Math.round(alpha)
  }
  await sharp(front,{raw:{width:F.w*S,height:F.h*S,channels:4}}).webp({quality:96,alphaQuality:100}).toFile(root+'v19/'+name+'.webp')
 }
 const resized=await sharp(front,{raw:{width:F.w*S,height:F.h*S,channels:4}}).resize(Math.round(A.w*S),Math.round(A.h*S)).png().toBuffer()
 const aligned=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:resized,left:A.x*S,top:A.y*S}]).raw().toBuffer()
 const rear=await sharp(root+'v18/'+name+'-back.webp').ensureAlpha().raw().toBuffer()
 for(let y=0;y<B.h*S;y++){
  const row=y+B.y*S;let l=W,r=-1;for(let x=0;x<W;x++)if(aligned[(row*W+x)*4+3]>48){l=Math.min(l,x);r=Math.max(r,x)}
  for(let x=0;x<B.w*S;x++){const i=(y*B.w*S+x)*4,worldX=x+B.x*S;if(worldX<l+2||worldX>r-2){rear[i]=rear[i+1]=rear[i+2]=rear[i+3]=0}}
 }
 await sharp(rear,{raw:{width:B.w*S,height:B.h*S,channels:4}}).webp({quality:96,alphaQuality:100}).toFile(root+'v19/'+name+'-back.webp')
}
console.log('v19: local low crown, four rear silhouette mattes; cap fronts and all other assets unchanged')
