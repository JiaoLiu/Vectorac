import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
await mkdir('/tmp/wardrobe-depth',{recursive:true})
const master=await sharp('scripts/fixtures/wardrobe-v5-sources/master.webp').resize(512,1024).png().toBuffer()
await sharp(master).extract({left:175,top:675,width:162,height:325}).resize(648,1300).png().toFile('/tmp/wardrobe-depth/legs.png')
await sharp(master).extract({left:80,top:415,width:70,height:110}).resize(560,880).png().toFile('/tmp/wardrobe-depth/wrist.png')
const inputs=[]
for(const [i,n] of ['ice','butterfly','strawberry','academy','forest','lotus'].entries()){
 const d=await sharp(`scripts/fixtures/wardrobe-v10-sources/${n}.webp`).resize(512,1024).png().toBuffer()
 inputs.push({input:await sharp(d).extract({left:145,top:335,width:222,height:160}).resize(444,320).png().toBuffer(),left:i*444,top:0})
}
await sharp({create:{width:2664,height:320,channels:4,background:'#d6b9a1'}}).composite(inputs).png().toFile('/tmp/wardrobe-depth/waists-before.png')
