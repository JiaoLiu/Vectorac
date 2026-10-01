// Mechanical segmentation/registration, never per-row reshaping of an object.
import {createRequire} from 'node:module'
import {readFile,mkdir} from 'node:fs/promises'
import {existsSync} from 'node:fs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='.vuepress/public/img/games/dressup/layers/v14',W=512,H=1024
await mkdir(root,{recursive:true});await mkdir('scripts/fixtures/wardrobe-v14-sources',{recursive:true})
function segment(d,w,h){
 for(let i=0;i<d.length;i+=4){const [r,g,b]=d.subarray(i,i+3);if(r-g>24&&b-g>24&&b>90||r>170&&g<75&&b<100||r>210&&g>170&&b<60)d[i+3]=0}
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h)
 for(let i=0;i<w*h;i++)if(!seen[i]&&d[i*4+3]>60){let n=1,j=0;q[0]=i;seen[i]=1;while(j<n){const p=q[j++],x=p%w;for(const k of [x?p-1:-1,x<w-1?p+1:-1,p-w,p+w])if(k>=0&&k<w*h&&!seen[k]&&d[k*4+3]>60){seen[k]=1;q[n++]=k}}if(n<200)for(let j=0;j<n;j++)d[q[j]*4+3]=0}
 return d
}
const manifest=JSON.parse(await readFile('scripts/wardrobe-v14-art.json','utf8'))
for(const a of manifest.assets){
 if(!existsSync(a.file))await sharp(a.source).webp({lossless:true}).toFile(a.file)
 const {data,info}=await sharp(a.file).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 segment(data,info.width,info.height)
 // Keep the WHOLE waistband and original fitted silhouette, including its
 // curved top edge. Skin reference is removed before downsampling.
 await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).resize(W,H).webp({quality:95,alphaQuality:100}).toFile(`${root}/${a.id}.webp`)
}
for(const index of [6,7]){
 const {data,info}=await sharp(`scripts/fixtures/wardrobe-v13-sources/shoes-${index}.webp`).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 segment(data,info.width,info.height)
 // The generated leg crop has the same framing as reference-legs.webp.
 // Retain one uniform scale for all shoe parts (tongue, upper, sole, collar).
 // Remove the non-object colour-check strip below the soles, not shoe fabric.
 for(let y=1708;y<info.height;y++)for(let x=0;x<info.width;x++)data[(y*info.width+x)*4+3]=0
 const input=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).resize({height:325}).png().toBuffer()
 await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input,left:175,top:675}]).webp({quality:95,alphaQuality:100}).toFile(`${root}/shoes-${index}.webp`)
}
console.log('v14: three intact fitted long-skirt bands; two uniformly registered sneakers; old products and short skirts untouched')
