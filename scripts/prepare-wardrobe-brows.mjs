// Native vector eyebrow art; no skin pixels, rectangles or face crops.
// At the registered 512x1024 scale the two styles differ by several pixels,
// rather than applying a subpixel bend to the same nearly straight texture.
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='.vuepress/public/img/games/dressup/layers/v9'
await mkdir(root+'/catalog',{recursive:true})
const shapes={
 2:'M216 96 C222 87 235 86 248 94 C238 90 229 88 218 97 Z',
 3:'M216 92 L226 87 Q235 88 248 94 L247 96 Q235 92 228 90 L217 95 Z'
}
function pair(i){
 const hairs=Array.from({length:18},(_,n)=>{const x=217+n*1.65,y=i===2?93-4*Math.sin(n/17*Math.PI):n<6?92-n*.7:88+(n-6)*.49
  return `<path d="M${x} ${y+1} l1.2 -2" stroke="#b59a83" stroke-width=".25" opacity=".42"/>`
 }).join('')
 const brow=`<path d="${shapes[i]}" fill="${i===2?'#6c4d40':'#594034'}" opacity=".88"/>${hairs}`
 return `<g>${brow}</g><g transform="translate(512 0) scale(-1 1)">${brow}</g>`
}
for(const i of [2,3]){
 await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="1024">${pair(i)}</svg>`)).webp({lossless:true}).toFile(`${root}/brows-${i}.webp`)
 // Independent vector design at a readable product scale, not a worn crop.
 await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><rect width="360" height="360" fill="#f4ede5"/><g transform="translate(-588 -114) scale(3)">${pair(i)}</g></svg>`)).webp({lossless:true}).toFile(`${root}/catalog/brows-${i}.webp`)
}
console.log('Two distinct pigment-only registered brow designs and independent catalogue cards prepared')
