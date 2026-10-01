import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='scripts/fixtures/wardrobe-v16-sources'
await mkdir(root,{recursive:true})
await sharp('.vuepress/public/img/games/dressup/layers/v5/master.webp').extract({left:160,top:0,width:192,height:192}).resize(1152,1152).webp({lossless:true}).toFile(root+'/head-registration.webp')
await sharp('.vuepress/public/img/games/dressup/blush-0.webp').extract({left:176,top:15,width:160,height:165}).resize(960,990).webp({lossless:true}).toFile(root+'/outfit-style.webp')
console.log('v16 exact head registration reference and outfit style crop prepared')
