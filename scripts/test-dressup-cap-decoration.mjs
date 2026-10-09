// Real compositor pixels: cap decorations and their material cache placements.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright'),out=await mkdtemp(join(tmpdir(),'wardrobe-cap-decoration-'))
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage()
 await page.route('http://wardrobe.test/**',async r=>{const p=new URL(r.request().url()).pathname;if(p==='/')return r.fulfill({body:'<canvas width="512" height="1024"></canvas>',contentType:'text/html'});await r.fulfill({body:await readFile(p.endsWith('.mjs')?'.vuepress/components/dressup'+p:'.vuepress/public'+p),contentType:p.endsWith('.mjs')?'application/javascript':'image/webp'})})
 await page.goto('http://wardrobe.test/')
 let looks=0,pixels=0
 for(const hair of ['hair-0','hair-2','hair-5'])for(const hat of ['hat-0','hat-1','hat-4','hat-5','hat-6','hat-7','hat-10'])for(const piece of ['headpiece-0','headpiece-1','headpiece-4','headpiece-5','headpiece-6','headpiece-7','headpiece-10']){
  const result=await page.evaluate(async({hair,hat,piece})=>{
   const {PARTS,DEFAULT_PARTS,partAsset,fitIndex}=await import('/parts.mjs'),{layerSources,paintComposite}=await import('/compositor.mjs'),{capDecoration,HAIR_PIECE_ANCHORS}=await import('/headpiece-fit.mjs'),{materialImage}=await import('/materials.mjs'),{default:bounds}=await import('/layer-bounds.mjs'),parts={...DEFAULT_PARTS,hair,hat,headpiece:piece},p=PARTS.find(p=>p.id===piece),h=PARTS.find(p=>p.id===hat)
   window.images||=new Map();for(const src of layerSources(parts))if(!window.images.has(src)){const i=new Image();i.src=src;await i.decode();window.images.set(src,i)}
   const src=partAsset(p),b=bounds[src]||{x:289,y:50,w:40,h:52},target=capDecoration(p,h),rect=[b.x,b.y,b.w,b.h,...target]
   // Populate the bare-hair material cache first; cap placement must not reuse it.
   if(p.material)materialImage(window.images.get(src),p,false,[[b.x,b.y,b.w,b.h,...HAIR_PIECE_ANCHORS[fitIndex(p)]]])
   const expected=document.createElement('canvas');expected.width=512;expected.height=1024;const pen=expected.getContext('2d')
   if(p.material)pen.drawImage(materialImage(window.images.get(src),{...p,id:p.id+'-expected'},false,[rect]),0,0);else pen.drawImage(window.images.get(src),...rect)
   // Compare through the SAME browser canvas/downsample path, including soft alpha.
   const c=document.querySelector('canvas'),ctx=c.getContext('2d')
   paintComposite(ctx,window.images,{...parts,headpiece:'headpiece-none'})
   if(p.material)ctx.drawImage(materialImage(window.images.get(src),{...p,id:p.id+'-expected'},false,[rect]),0,0);else ctx.drawImage(window.images.get(src),...rect)
   const finished=ctx.getImageData(0,0,512,1024).data
   paintComposite(ctx,window.images,parts);const actual=ctx.getImageData(0,0,512,1024).data,e=pen.getImageData(0,0,512,1024).data;let checked=0,mismatch=0,maxDiff=0;const examples=[]
   for(let i=0;i<e.length;i+=4)if(e[i+3]>40){checked++;const diff=Math.max(...[0,1,2,3].map(k=>Math.abs(actual[i+k]-finished[i+k])));maxDiff=Math.max(maxDiff,diff);if(diff>2){mismatch++;if(examples.length<3)examples.push({x:i/4%512,y:Math.floor(i/4/512),alpha:e[i+3],actual:Array.from(actual.slice(i,i+4)),expected:Array.from(finished.slice(i,i+4))})}}
   return {checked,mismatch,maxDiff,examples,png:hair==='hair-5'&&['hat-0','hat-1','hat-10'].includes(hat)&&['headpiece-0','headpiece-6'].includes(piece)?c.toDataURL().split(',')[1]:null}
  },{hair,hat,piece})
  assert.ok(result.checked>30,'empty decoration '+[hair,hat,piece].join('/'));assert.equal(result.mismatch,0,'hat hides cap decoration '+[hair,hat,piece].join('/')+' '+JSON.stringify({maxDiff:result.maxDiff,examples:result.examples}));pixels+=result.checked;looks++
  if(result.png)await writeFile(join(out,[hair,hat,piece].join('-')+'.png'),Buffer.from(result.png,'base64'))
 }
 console.log(JSON.stringify({passed:true,looks,pixels,screenshots:out}))
}finally{await browser.close()}
