// Crop only the crown for a local imagegen edit, not a full hairstyle redraw.
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
await mkdir('scripts/fixtures/wardrobe-v19-sources',{recursive:true})
await sharp('.vuepress/public/img/games/dressup/layers/v18/hair-5.webp').extract({left:60*4,top:0,width:200*4,height:100*4}).flatten({background:'#f4ede5'}).png().toFile('scripts/fixtures/wardrobe-v19-sources/crown-reference.png')
