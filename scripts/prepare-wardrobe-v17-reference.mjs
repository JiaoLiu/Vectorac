import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='scripts/fixtures/wardrobe-v17-sources'
await mkdir(root,{recursive:true})
await sharp('.vuepress/public/img/games/dressup/layers/v16/face-0.webp').extract({left:190,top:25,width:132,height:178}).resize(792,1068).webp({lossless:true}).toFile(root+'/head-template.webp')
await sharp('.vuepress/public/img/games/dressup/layers/v5/master.webp').extract({left:175,top:0,width:162,height:220}).resize(810,1100).webp({lossless:true}).toFile(root+'/body-neck-reference.webp')
for(const name of ['head-template','body-neck-reference'])await sharp(root+'/'+name+'.webp').flatten({background:'#f4ede5'}).png().toFile(root+'/'+name+'.png')
// Reference views only. Runtime layers always retain the original full canvas.
for(let i=0;i<6;i++){
 const version=i===4?'v11':i===5?'v15':'v7',name=i===2?'hair-2-restored':'hair-'+i
 await sharp(`.vuepress/public/img/games/dressup/layers/${version}/${name}.webp`).extract({left:160,top:0,width:192,height:400}).resize(576,1200).webp({lossless:true}).toFile(root+'/hair-reference-'+i+'.webp')
 await sharp(root+'/hair-reference-'+i+'.webp').flatten({background:'#f4ede5'}).png().toFile(root+'/hair-reference-'+i+'.png')
}
