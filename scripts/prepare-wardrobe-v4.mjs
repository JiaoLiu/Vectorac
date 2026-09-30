// Asset packing only: fixed atlas cells and encoding, no content manipulation.
import {createRequire} from 'node:module'
import {readFile,mkdir} from 'node:fs/promises'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp')
const manifest=JSON.parse(await readFile(new URL('./wardrobe-v4-art.json',import.meta.url),'utf8'))
const root='.vuepress/public/img/games/dressup/layers/v4',bounds={}
await mkdir(root,{recursive:true})
async function pack(source,target,extract){
 const pipeline=()=>extract?sharp(source).extract(extract):sharp(source)
 await pipeline().webp({quality:92,alphaQuality:100}).toFile(target)
 const {data,info}=await pipeline().ensureAlpha().raw().toBuffer({resolveWithObject:true})
 let l=info.width,t=info.height,r=0,b=0
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>100){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y)}
 bounds[target.replace('.vuepress/public','')]={x:l,y:t,w:r-l+1,h:b-t+1}
}
for(const a of manifest.assets){
 const m=await sharp(a.source).metadata();if(!m.hasAlpha)throw new Error('Missing alpha: '+a.id)
 if(a.id.startsWith('base-')){await pack(a.source,`${root}/${a.id}.webp`);continue}
 for(let i=0;i<4;i++){const left=Math.floor(i%2*m.width/2),top=Math.floor(i/2)*Math.floor(m.height/2);await pack(a.source,`${root}/${a.id}-${i}.webp`,{left,top,width:Math.floor(m.width/2),height:Math.floor(m.height/2)})}
}
console.log(JSON.stringify(bounds,null,2))
