import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import {PARTS,partAsset} from '../.vuepress/components/dressup/parts.mjs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp'),root='scripts/fixtures/wardrobe-v18-sources',S=4
await mkdir(root,{recursive:true})
await sharp('.vuepress/public/img/games/dressup/layers/v17/hair-5.webp').flatten({background:'#f4ede5'}).png().toFile(root+'/hair-5-reference.png')
const face=await sharp('.vuepress/public/img/games/dressup/layers/v17/face-0.webp').png().toBuffer()
await sharp({create:{width:512*S,height:1024*S,channels:4,background:'#00000000'}}).composite([{input:face,left:190*S,top:25*S}]).extract({left:100*S,top:0,width:330*S,height:490*S}).flatten({background:'#f4ede5'}).png().toFile(root+'/head-reference.png')
for(const [name,id] of [['straw','hat-0'],['beret','hat-1'],['cloche','hat-10']])await sharp('.vuepress/public'+partAsset(PARTS.find(p=>p.id===id))).resize(512*S,1024*S).extract({left:100*S,top:0,width:330*S,height:490*S}).flatten({background:'#f4ede5'}).png().toFile(root+'/hat-'+name+'-reference.png')
