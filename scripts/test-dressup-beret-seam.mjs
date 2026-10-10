// Focused enlarged beret/temple seams, not just ear/nape channel checks.
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright'),out=await mkdtemp(join(tmpdir(),'wardrobe-beret-seam-')),S=3
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage();await page.route('http://wear.test/**',async r=>{const p=new URL(r.request().url()).pathname;if(p==='/')return r.fulfill({body:'<canvas width="1536" height="3072"></canvas>',contentType:'text/html'});await r.fulfill({body:await readFile(p.endsWith('.mjs')?'.vuepress/components/dressup'+p:'.vuepress/public'+p),contentType:p.endsWith('.mjs')?'application/javascript':'image/webp'})});await page.goto('http://wear.test/')
 async function render(parts){return Buffer.from(await page.evaluate(async({parts,forceGeneric})=>{const {layerSources,paintComposite}=await import('/compositor.mjs'),{PARTS}=await import('/parts.mjs');if(forceGeneric)PARTS.find(p=>p.id==='hair-2').capReadyByHat={};window.images||=new Map();for(const src of layerSources(parts))if(!window.images.has(src)){const i=new Image();i.src=src;await i.decode();window.images.set(src,i)}const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.setTransform(3,0,0,3,0,0);paintComposite(ctx,window.images,parts);if(parts.hair==='hair-2'){const d=ctx.getImageData(0,0,1536,3072).data;for(const [x,y] of [[210,73],[208,80],[205,85],[205,90]])if(d[((y*3+1)*1536+x*3+1)*4+3]<240)throw Error('pony/beret left seam exposes background at '+x+','+y)}return c.toDataURL().split(',')[1]},{parts,forceGeneric:process.env.BERET_SEAM_FORCE_GENERIC==='1'}),'base64')}
 const pics=[]
 for(const hair of PARTS.filter(p=>p.category==='hair')){
  const img=await render({...DEFAULT_PARTS,hair:hair.id,hat:'hat-1'})
  await writeFile(join(out,hair.id+'.png'),img);pics.push(img)
 }
 let variants=0
 for(const face of PARTS.filter(p=>p.category==='face'))for(const hat of ['hat-1','hat-6','hat-7']){await render({...DEFAULT_PARTS,hair:'hair-2',hat,face:face.id});variants++}
 for(const [name,region,w,h] of [['heads',{left:170*S,top:20*S,width:172*S,height:193*S},344,386],['left-seams',{left:192*S,top:40*S,width:44*S,height:60*S},264,360]])await sharp({create:{width:w*6,height:h,channels:4,background:'#49ccb8'}}).composite(await Promise.all(pics.map(async(input,n)=>({input:await sharp(input).extract(region).resize(w,h).png().toBuffer(),left:n*w,top:0})))).png().toFile(join(out,name+'.png'))
 console.log(JSON.stringify({passed:true,variants,screenshots:out,hair:PARTS.filter(p=>p.category==='hair').map(p=>({id:p.id,name:p.name}))}))
}finally{await browser.close()}
