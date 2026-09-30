// Encode generated art and split only the predefined sprite-sheet cells.
import {createRequire} from 'node:module'
import {readFile,mkdir} from 'node:fs/promises'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp')
const manifest=JSON.parse(await readFile(new URL('./wardrobe-v3-art.json',import.meta.url),'utf8'))
const root='.vuepress/public/img/games/dressup',bounds={}
await mkdir(root+'/layers',{recursive:true});await mkdir(root+'/scenes',{recursive:true})
async function encode(source,target,extract){
  const image=()=>extract?sharp(source).extract(extract):sharp(source)
  await image().webp({quality:88,alphaQuality:100}).toFile(target)
  const {data,info}=await image().ensureAlpha().raw().toBuffer({resolveWithObject:true})
  let l=info.width,t=info.height,r=0,b=0
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>100){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y)}
  bounds[target.replace('.vuepress/public','')]={x:l,y:t,w:r-l+1,h:b-t+1}
}
for(const a of manifest.assets){
  const m=await sharp(a.source).metadata()
  if(a.id==='layer-base'){await encode(a.source,root+'/layers/base.webp');continue}
  if(['qipao','fairy','street','ruby'].includes(a.id)){if(!m.hasAlpha||m.width%3)throw new Error('Invalid outfit sheet');for(let i=0;i<3;i++)await encode(a.source,`${root}/${a.id}-${i}.webp`,{left:i*m.width/3,top:0,width:m.width/3,height:m.height});continue}
  const categories={tops:'top',bottoms:'bottom',shoes:'shoes',socks:'socks',hats:'hat',headpieces:'headpiece',earrings:'earrings',faces:'face'}
  if(categories[a.id]){if(!m.hasAlpha)throw new Error('Invalid layer sheet');for(let i=0;i<4;i++){const left=Math.floor(i%2*m.width/2),top=Math.floor(i/2)*Math.floor(m.height/2);await encode(a.source,`${root}/layers/${categories[a.id]}-${i}.webp`,{left,top,width:i%2?m.width-left:Math.floor(m.width/2),height:Math.floor(m.height/2)})}continue}
  await sharp(a.source).resize({width:1000,withoutEnlargement:true}).webp({quality:85}).toFile(`${root}/scenes/${a.id}.webp`)
}
console.log(JSON.stringify(bounds))
