import {createRequire} from 'node:module'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='scripts/fixtures/wardrobe-v17-sources',src='/Users/Jiao/.codex/generated_images/01a06bd4-83e2-7680-a983-22c87f9788d0/'
for(const [id,name] of [[2,'exec-6d072e70-91fa-41b0-b86f-ab2e471741cb.png'],[5,'exec-42d0c5bf-41dd-4282-9a08-16782d653270.png']]){
 const {data,info}=await sharp(src+name).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 for(let i=0;i<data.length;i+=4)if(data[i+3]<255&&Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>190)data[i+3]=0
 const input=await sharp(data,{raw:info}).resize(576,1200).png().toBuffer()
 await sharp({create:{width:840,height:1320,channels:4,background:'#00000000'}}).composite([{input,left:120,top:0}]).flatten({background:'#f4ede5'}).png().toFile(root+'/hair-expanded-'+id+'.png')
}
