// Mechanical extraction of generated rear strands; the original front is not redrawn.
import {createRequire} from 'node:module'
import {readFile,mkdir,copyFile} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const manifest=JSON.parse(await readFile('scripts/wardrobe-v15-art.json','utf8'))
const root='.vuepress/public/img/games/dressup/layers/v15'
await mkdir(root,{recursive:true})
await mkdir('scripts/fixtures/wardrobe-v15-sources',{recursive:true})
if(process.env.WARDROBE_REAR_SOURCE)await sharp(process.env.WARDROBE_REAR_SOURCE).webp({lossless:true}).toFile(manifest.file)
const {data,info}=await sharp(manifest.file).resize(512,1024).extract(manifest.registration).ensureAlpha().raw().toBuffer({resolveWithObject:true})
// Extract only the two rear locks, not pixels behind transparent eye/lip
// detail sprites. Below the jaw the locks extend inward behind the neck.
for(let y=0;y<info.height;y++){
 const inset=Math.min(14,Math.max(0,(y+manifest.registration.top-150)*.7)),left=232+inset,right=280-inset
 for(let x=0;x<info.width;x++)if(x+manifest.registration.left>=left&&x+manifest.registration.left<right)data[(y*info.width+x)*4+3]=0
}
const patch=await sharp(data,{raw:info}).png().toBuffer()
await sharp({create:{width:512,height:1024,channels:4,background:'#00000000'}}).composite([{input:patch,left:manifest.registration.left,top:manifest.registration.top}]).webp({quality:95,alphaQuality:100}).toFile(root+'/hair-5-back.webp')
await copyFile('.vuepress/public/img/games/dressup/layers/v11/hair-5.webp',root+'/hair-5.webp')
console.log('v15: local rear strands; original front and catalogue untouched')
