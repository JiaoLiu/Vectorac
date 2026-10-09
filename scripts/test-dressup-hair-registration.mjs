// Anatomical regression: a decoded sprite is not proof that its face opening fits.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,mkdtemp,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS,partHairAsset} from '../.vuepress/components/dressup/parts.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const out=await mkdtemp(join(tmpdir(),'wardrobe-hair-registration-')),hair=PARTS.find(p=>p.id==='hair-5'),candidates=process.env.HAIR_FIT_COMPARE==='1'
const frames=candidates?[{x:100,y:0,w:330,h:490},{x:96,y:0,w:310.2,h:490}]:[hair.frame]
const hats=['hat-none','hat-0','hat-1','hat-10'],centres=[]
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage()
 await page.route('http://wardrobe.test/**',async r=>{const p=new URL(r.request().url()).pathname;if(p==='/')return r.fulfill({body:'<canvas width="1536" height="3072"></canvas>',contentType:'text/html'});await r.fulfill({body:await readFile(p.endsWith('.mjs')?'.vuepress/components/dressup'+p:'.vuepress/public'+p),contentType:p.endsWith('.mjs')?'application/javascript':'image/webp'})})
 await page.goto('http://wardrobe.test/')
 for(let n=0;n<frames.length;n++)for(const hatId of hats){
  const frame=frames[n],hat=PARTS.find(p=>p.id===hatId),{data,info}=await sharp('.vuepress/public'+partHairAsset(hair,hat)).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  for(const y of [110,125,140]){const row=Math.round(y/frame.h*info.height),center=Math.round((256-frame.x)/frame.w*info.width);let l=center,r=center;while(l>0&&data[(row*info.width+l)*4+3]<50)l--;while(r<info.width-1&&data[(row*info.width+r)*4+3]<50)r++;const left=frame.x+l/info.width*frame.w,right=frame.x+r/info.width*frame.w,mid=(left+right)/2;centres.push({n,hat:hatId,y,left,right,mid});if(!candidates){assert.ok(Math.abs(mid-256)<4,`${hatId} face opening drift at ${y}: ${mid}`);if(y===110)assert.ok(left<230&&right>282,`${hatId}: an eye is covered by side hair`)}}
  for(const face of ['face-0','face-1','face-2','face-3']){
   const png=Buffer.from(await page.evaluate(async({frame,parts})=>{const {PARTS}=await import('/parts.mjs'),{layerSources,paintComposite}=await import('/compositor.mjs');PARTS.find(p=>p.id==='hair-5').frame=frame;window.images||=new Map();for(const src of layerSources(parts))if(!window.images.has(src)){const i=new Image();i.src=src;await i.decode();window.images.set(src,i)}const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.setTransform(3,0,0,3,0,0);paintComposite(ctx,window.images,parts);return c.toDataURL().split(',')[1]},{frame,parts:{...DEFAULT_PARTS,hair:'hair-5',hat:hatId,headpiece:'headpiece-0',face,eyes:face.replace('face','eyes'),brows:face.replace('face','brows'),lip:face.replace('face','lip')}}),'base64')
   await writeFile(join(out,`${n}-${hatId}-${face}.png`),png)
  }
 }
 await sharp({create:{width:480*4,height:600*frames.length,channels:4,background:'#eee5dc'}}).composite(await Promise.all(frames.flatMap((_,n)=>hats.map(async(h,i)=>({input:await sharp(join(out,`${n}-${h}-face-0.png`)).extract({left:150*3,top:5*3,width:215*3,height:235*3}).resize(480,600).png().toBuffer(),left:i*480,top:n*600}))))).png().toFile(join(out,'comparison.png'))
 console.log(JSON.stringify({passed:true,centres,screenshots:out}))
}finally{await browser.close()}
