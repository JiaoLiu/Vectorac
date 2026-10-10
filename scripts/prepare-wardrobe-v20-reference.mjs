// Registered portrait template, not an alpha-bounds crop or a new body.
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp'),root='scripts/fixtures/wardrobe-v20-sources'
await mkdir(root,{recursive:true})
await sharp({create:{width:608,height:912,channels:4,background:'#00000000'}}).composite([{input:await sharp('.vuepress/public/img/games/dressup/layers/v17/face-0.webp').png().toBuffer(),left:40,top:20}]).flatten({background:'#f4ede5'}).png().toFile(root+'/head-template.png')
