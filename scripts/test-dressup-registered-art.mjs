import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DEFAULT_PARTS,PARTS,REGISTERED_CATEGORIES,partAsset} from '../.vuepress/components/dressup/parts.mjs'
import {SOCK_VISIBLE_END} from '../.vuepress/components/dressup/compositor.mjs'
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright'),sharp=require(process.env.SHARP_PATH||'sharp')
const output=await mkdtemp(join(tmpdir(),'wardrobe-v5-art-'))
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage()
 await page.route('http://wardrobe.test/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/'){await route.fulfill({body:'<!doctype html><canvas width="512" height="1024"></canvas>',contentType:'text/html'});return}
  const file=path.endsWith('.mjs')?`.vuepress/components/dressup${path}`:`.vuepress/public${path}`
  try{await route.fulfill({body:await readFile(file),contentType:path.endsWith('.mjs')?'application/javascript':'image/webp'})}catch(e){await route.fulfill({status:404,body:'missing asset'})}
 })
 await page.goto('http://wardrobe.test/')
 async function render(parts,name){
  const bytes=await page.evaluate(async parts=>{
   const {layerSources,paintComposite}=await import('/compositor.mjs'),srcs=layerSources(parts)
   const entries=await Promise.all(srcs.map(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve([src,img]);img.onerror=reject;img.src=src})))
   const canvas=document.querySelector('canvas');paintComposite(canvas.getContext('2d'),new Map(entries),parts);return canvas.toDataURL().split(',')[1]
  },parts)
  const file=join(output,name+'.png');await writeFile(file,Buffer.from(bytes,'base64'));return file
 }
 for(const p of PARTS.filter(p=>p.index>=0&&REGISTERED_CATEGORIES.includes(p.category))){
  const m=await sharp('.vuepress/public'+partAsset(p)).metadata();assert.equal(m.width,512);assert.equal(m.height,1024);assert.equal(m.hasAlpha,true)
 }
 // Every top/bottom seam, not just four matching outfits. Capture close-ups of
 // the user's actual failure areas, rather than treating visible pixels as fit proof.
 for(let top=0;top<4;top++)for(let bottom=0;bottom<4;bottom++){
  const f=await render({...DEFAULT_PARTS,top:'top-'+top,bottom:'bottom-'+bottom,socks:'socks-none'},`clothing-${top}-${bottom}`)
  const {data}=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  for(let y=360;y<373;y++)for(let x=225;x<285;x++)assert.ok(data[(y*512+x)*4+3]>200,`waist gap ${top}/${bottom} at ${x},${y}`)
 }
 for(let hair=0;hair<4;hair++)for(let face=0;face<4;face++){
  const f=await render({...DEFAULT_PARTS,hair:'hair-'+hair,face:'face-'+face,eyes:'eyes-'+((face+1)%4),brows:'brows-'+((face+2)%4),lip:'lip-'+((face+3)%5)},`head-${hair}-${face}`)
  await sharp(f).extract({left:160,top:15,width:190,height:170}).resize(570,510).png().toFile(join(output,`head-close-${hair}-${face}.png`))
 }
 for(let shoes=0;shoes<4;shoes++)for(const socks of ['socks-none','socks-0','socks-1','socks-4','socks-5']){
  const f=await render({...DEFAULT_PARTS,shoes:'shoes-'+shoes,socks},`feet-${shoes}-${socks}`)
  const actual=await sharp(f).ensureAlpha().raw().toBuffer(),shoe=await sharp(`.vuepress/public/img/games/dressup/layers/v5/shoes-${shoes}.webp`).ensureAlpha().raw().toBuffer()
  for(let y=SOCK_VISIBLE_END[shoes];y<1024;y++)for(let x=185;x<327;x++)assert.ok(Math.abs(actual[(y*512+x)*4+3]-shoe[(y*512+x)*4+3])<=1,'bare toes or sock fabric visible outside worn shoe silhouette')
  await sharp(f).extract({left:175,top:850,width:165,height:155}).resize(495,465).png().toFile(join(output,`feet-close-${shoes}-${socks}.png`))
 }
 console.log(JSON.stringify({passed:true,screenshots:output}))
}finally{await browser.close()}
