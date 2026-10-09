// Exercise the real browser compositor, not a second preview-only renderer.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS,partAsset} from '../.vuepress/components/dressup/parts.mjs'
import {BEAUTY_PRESETS} from '../.vuepress/components/dressup/beauty.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const out=await mkdtemp(join(tmpdir(),'wardrobe-beauty-fit-')),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
const heads=[],hats=[],mixed=[]
async function registeredRaw(p){const f=p.frame,input=await sharp('.vuepress/public'+partAsset(p)).resize(f.w,f.h).png().toBuffer();return sharp({create:{width:512,height:1024,channels:4,background:'#00000000'}}).composite([{input,left:f.x,top:f.y}]).ensureAlpha().raw().toBuffer()}
async function sheet(images,id,columns=6){const width=288,height=320;await sharp({create:{width:width*columns,height:height*Math.ceil(images.length/columns),channels:4,background:'#f4ede5'}}).composite(await Promise.all(images.map(async (input,i)=>({input:await sharp(input).extract({left:180,top:20,width:152,height:169}).resize(width,height).png().toBuffer(),left:i%columns*width,top:Math.floor(i/columns)*height})))).png().toFile(join(out,id+'.png'))}
try{
 const page=await browser.newPage()
 await page.route('http://wardrobe.test/**',async r=>{const path=new URL(r.request().url()).pathname;if(path==='/')return r.fulfill({body:'<canvas width="512" height="1024"></canvas>',contentType:'text/html'});try{await r.fulfill({body:await readFile(path.endsWith('.mjs')?'.vuepress/components/dressup'+path:'.vuepress/public'+path),contentType:path.endsWith('.mjs')?'application/javascript':'image/webp'})}catch{await r.fulfill({status:404,body:'missing'})}})
 await page.goto('http://wardrobe.test/')
 async function render(parts){return Buffer.from(await page.evaluate(async parts=>{const {layerSources,paintComposite}=await import('/compositor.mjs');window.images=window.images||new Map();for(const src of layerSources(parts))if(!window.images.has(src)){const i=new Image();i.src=src;await i.decode();window.images.set(src,i)}const c=document.querySelector('canvas');paintComposite(c.getContext('2d'),window.images,parts);return c.toDataURL().split(',')[1]},parts),'base64')}
 // Full preset matching must be pixel-for-pixel the artist's complete face,
 // not a reassembled set of overlapping skin patches. Nose is never replaced.
 let exactPixels=0,combinations=0
 for(const preset of BEAUTY_PRESETS){
  const p={...DEFAULT_PARTS,...preset.parts},img=await render(p)
  await writeFile(join(out,preset.id+'-full.png'),img)
  if(preset.id!=='sakura'){
   const complete=await render({...p,eyes:'',brows:'',lip:''})
   assert.ok(img.equals(complete),preset.id+': double-painted coordinated features');exactPixels+=512*1024
  }
  for(const hair of PARTS.filter(p=>p.category==='hair')){
   heads.push(await render({...p,hair:hair.id,earrings:'earrings-0'}))
   for(const hat of PARTS.filter(p=>p.category==='hat')){const image=await render({...p,hair:hair.id,hat:hat.id});assert.ok(image.length>30000);combinations++;if(hair.id==='hair-5')hats.push(image)}
  }
 }
 // Every face/eye/brow/lip mix leaves the single nose and its surrounding skin
 // untouched; patch opacity and bounded replacement are separately asserted.
 let makeupMixes=0
 for(let f=0;f<4;f++){
  const baseline=await sharp(await render({...DEFAULT_PARTS,face:'face-'+f,eyes:'eyes-'+f,brows:'brows-'+f,lip:'lip-'+f})).ensureAlpha().raw().toBuffer()
  for(let e=0;e<5;e++)for(let b=0;b<4;b++)for(let l=0;l<5;l++){
   const image=await render({...DEFAULT_PARTS,face:'face-'+f,eyes:'eyes-'+e,brows:'brows-'+b,lip:'lip-'+l}),actual=await sharp(image).ensureAlpha().raw().toBuffer()
   for(let y=126;y<134;y++)for(let x=246;x<266;x++){const i=(y*512+x)*4;assert.deepEqual(actual.subarray(i,i+4),baseline.subarray(i,i+4),'makeup mix replaces nose '+[f,e,b,l].join('/'))}
   makeupMixes++;if(e===b&&l===e)mixed.push(image)
  }
 }
 const jawWidths=[]
 for(let f=0;f<4;f++){
  const data=await registeredRaw(PARTS.find(p=>p.id==='face-'+f)),row=[]
  for(const y of [140,145,150,155]){const xs=[];for(let x=200;x<312;x++)if(data[(y*512+x)*4+3]>240)xs.push(x);row.push(xs.at(-1)-xs[0]+1)}jawWidths.push(row)
 }
 // Curated soft faces: no old broad square/chubby contour. Contour variation
 // may be subtle; aesthetics are checked on the enlarged actual matrices.
 for(const widths of jawWidths)assert.ok(widths[0]<65&&widths[1]<55,'lower cheeks inflated')
 assert.ok(PARTS.filter(p=>p.category==='face').every(p=>!p.name.includes('方')),'square face still offered')
 for(const category of ['eyes','brows','lip'])for(const p of PARTS.filter(p=>p.category===category)){
  const data=await registeredRaw(p)
  const centers=category==='eyes'?[[234,110],[277,110]]:category==='brows'?[[234,96],[277,96]]:[[255,144]]
  for(const [x,y] of centers)assert.equal(data[(y*512+x)*4+3],255,p.id+': core transparent gap')
 }
 const oldSkin=await page.evaluate(async defaults=>{
  const {layerSources,paintComposite,BASE,underbodySource}=await import('/compositor.mjs'),{PARTS,partAsset}=await import('/parts.mjs'),images=new Map(window.images)
  const top=partAsset(PARTS.find(p=>p.id===defaults.top))
  for(const src of [BASE,underbodySource(defaults),top]){const c=document.createElement('canvas');c.width=512;c.height=1024;const ctx=c.getContext('2d');ctx.drawImage(images.get(src),0,0);ctx.fillStyle='#00ff00';ctx.fillRect(210,155,92,15);images.set(src,c)}
  const c=document.querySelector('canvas'),ctx=c.getContext('2d');paintComposite(ctx,images,defaults);const d=ctx.getImageData(0,0,512,1024).data;let green=0
  for(let y=155;y<170;y++)for(let x=205;x<307;x++){const i=(y*512+x)*4;if(d[i+1]>d[i]+80&&d[i+1]>d[i+2]+80&&d[i+3]>100)green++}
  return green
 },DEFAULT_PARTS)
 assert.equal(oldSkin,0,'old lower-jaw skin leaks beside the new neck')
 for(const p of PARTS.filter(p=>p.frame)){const m=await sharp('.vuepress/public'+partAsset(p)).metadata();assert.ok(m.width>=p.frame.w*2&&m.height>=p.frame.h*2,'head still downsampled to old low-res sprite');assert.ok(m.width<=2048&&m.height<=2048,'oversized mobile texture')}
 await sheet(heads,'presets-by-hair',6);await sheet(hats,'presets-by-hats',13);await sheet(mixed,'mixed-features',4)
 console.log(JSON.stringify({passed:true,exactPixels,hatHairPreset:combinations,makeupMixes,jawWidths,oldSkin,screenshots:out}))
}finally{await browser.close()}
