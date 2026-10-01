import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS,partAsset,partBackAsset} from '../.vuepress/components/dressup/parts.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const out=await mkdtemp(join(tmpdir(),'wardrobe-rear-hair-'))
const hair=PARTS.find(p=>p.id==='hair-5'),front=await readFile('.vuepress/public'+partAsset(hair))
assert.deepEqual(front,await readFile('.vuepress/public/img/games/dressup/layers/v11/hair-5.webp'),'original bangs, silhouette and front locks must not change')
const meta=await sharp('.vuepress/public'+partBackAsset(hair)).metadata();assert.equal(meta.width,512);assert.equal(meta.height,1024);assert.ok(meta.hasAlpha)
const protectedAssets={...JSON.parse(await readFile('scripts/wardrobe-v14-art.json','utf8')).protectedAssets,...JSON.parse(await readFile('scripts/wardrobe-v15-art.json','utf8')).protectedAssets}
const {createHash}=await import('node:crypto')
for(const [src,hash] of Object.entries(protectedAssets))assert.equal(createHash('sha256').update(await readFile('.vuepress/public'+src)).digest('hex'),hash,src+' changed unexpectedly')
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage()
 await page.route('http://wardrobe.test/**',async r=>{const path=new URL(r.request().url()).pathname;if(path==='/')return r.fulfill({body:'<canvas width="512" height="1024"></canvas>',contentType:'text/html'});await r.fulfill({body:await readFile(path.endsWith('.mjs')?'.vuepress/components/dressup'+path:'.vuepress/public'+path),contentType:path.endsWith('.mjs')?'application/javascript':'image/webp'})})
 await page.goto('http://wardrobe.test/')
 const samples=[];let tested=0
 for(const face of PARTS.filter(p=>p.category==='face'))for(const hat of PARTS.filter(p=>p.category==='hat'))for(const earrings of PARTS.filter(p=>p.category==='earrings')){
  const p={...DEFAULT_PARTS,hair:'hair-5',face:face.id,hat:hat.id,earrings:earrings.id,headpiece:'headpiece-none'}
  const result=await page.evaluate(async p=>{
   const {paintComposite,layerSources}=await import('/compositor.mjs');window.images||=new Map()
   for(const src of layerSources(p))if(!window.images.has(src)){const img=new Image();img.src=src;await img.decode();window.images.set(src,img)}
   const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),back='/img/games/dressup/layers/v15/hair-5-back.webp',image=window.images.get(back)
   window.images.set(back,document.createElement('canvas'));paintComposite(ctx,window.images,p);const old=ctx.getImageData(0,0,512,1024).data
   window.images.set(back,image);paintComposite(ctx,window.images,p);const actual=ctx.getImageData(0,0,512,1024).data
   for(let y=0;y<1024;y++)for(let x=0;x<512;x++)if(x<210||x>=304||y<102||y>=215){const i=(y*512+x)*4;for(let k=0;k<4;k++)if(actual[i+k]!==old[i+k])throw new Error('unrelated pixel changed '+x+','+y)}
   // Both ear/nape channels must have hair behind them even without earrings.
   for(const x of [218,294])for(let y=145;y<175;y++)if(actual[(y*512+x)*4+3]<245)throw new Error('rear ear channel remains empty '+x+','+y)
   // Existing facial features remain untouched in front of the rear layer.
   for(let y=103;y<145;y++)for(let x=234;x<278;x++){const i=(y*512+x)*4;for(let k=0;k<4;k++)if(actual[i+k]!==old[i+k])throw new Error('rear hair paints facial feature '+x+','+y)}
   return p.earrings==='earrings-none'||p.earrings==='earrings-8'?canvas.toDataURL().split(',')[1]:null
  },p);tested++
  if(result)samples.push({input:await sharp(Buffer.from(result,'base64')).extract({left:180,top:20,width:152,height:200}).resize(228,300).png().toBuffer(),left:samples.length%13*228,top:Math.floor(samples.length/13)*300})
 }
 await sharp({create:{width:13*228,height:Math.ceil(samples.length/13)*300,channels:4,background:'#efe5da'}}).composite(samples).png().toFile(join(out,'faces-hats-earrings.png'))
 console.log(JSON.stringify({passed:true,combinations:tested,protectedAssets:Object.keys(protectedAssets).length,contact:join(out,'faces-hats-earrings.png')}))
}finally{await browser.close()}
