// Asset packing only: extracts three fixed sprite cells and encodes WebP.
// No recoloring, background removal or generative edits are performed here.
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
const require=createRequire(import.meta.url)
const sharp=require(process.env.SHARP_PATH||'sharp')
const source=process.argv[2]
if(!source)throw new Error('Pass generated image directory')
const target='.vuepress/public/img/games/dressup'
await mkdir(target,{recursive:true})
const sheets={blush:'exec-a6dc1001-b36b-49bc-91ed-0d32f8dd22f0.png',mint:'exec-e3d525d1-fb75-4167-9eee-f124142dad7a.png',rose:'exec-cae896cb-92d5-4d9a-80e7-c08c3345e52b.png',night:'exec-7da467af-17e6-4b10-bc2b-0c5fdcf3ad19.png',ice:'exec-75128bab-87a4-430e-8463-be69cca9c85b.png'}
Object.assign(sheets,{hanfu:'exec-2a375349-dd53-4132-9dae-711f4da5774c.png',academy:'exec-2f33fdd2-5659-4e4d-b516-1b3c532b4a7c.png',sailor:'exec-28da8713-c9de-4b32-9896-7d60b7eac48c.png',wisteria:'exec-cb53babb-ecb3-4d28-8895-4e222b669d52.png',champagne:'exec-a46d6638-4eca-4068-a2a1-b66db71417bc.png'})
for(const [id,file] of Object.entries(sheets)){
  const src=`${source}/${file}`,m=await sharp(src).metadata()
  if(!m.hasAlpha||m.width%3!==0)throw new Error(`Invalid transparent sprite sheet: ${id}`)
  for(let pose=0;pose<3;pose++)await sharp(src).extract({left:pose*m.width/3,top:0,width:m.width/3,height:m.height}).webp({quality:88,alphaQuality:100}).toFile(`${target}/${id}-${pose}.webp`)
}
await sharp(`${source}/exec-3a17dd5b-d4fb-474b-8eee-b72af679836d.png`).resize({width:1200,withoutEnlargement:true}).webp({quality:85}).toFile(`${target}/cover.webp`)
console.log('Packed 30 transparent character poses + cover')
