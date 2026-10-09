// Catalogue portraits use the SAME actual compositor and HD anatomical frames
// as the model. Existing independent hairstyle/product illustrations stay.
import {createRequire} from 'node:module'
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
import {BEAUTY_PRESETS} from '../.vuepress/components/dressup/beauty.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const root='.vuepress/public/img/games/dressup/layers/v17/catalog',out=await mkdtemp(join(tmpdir(),'wardrobe-v17-visual-')),S=3
await mkdir(root,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage()
 await page.route('http://wear.test/**',async r=>{const p=new URL(r.request().url()).pathname;if(p==='/')return r.fulfill({body:'<canvas width="1536" height="3072"></canvas>',contentType:'text/html'});await r.fulfill({body:await readFile(p.endsWith('.mjs')?'.vuepress/components/dressup'+p:'.vuepress/public'+p),contentType:p.endsWith('.mjs')?'application/javascript':'image/webp'})})
 await page.goto('http://wear.test/')
 async function draw(parts){return Buffer.from(await page.evaluate(async parts=>{const {layerSources,paintComposite}=await import('/compositor.mjs');window.images=window.images||new Map();for(const src of layerSources(parts))if(!window.images.has(src)){const i=new Image();i.src=src;await i.decode();window.images.set(src,i)}const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.setTransform(3,0,0,3,0,0);paintComposite(ctx,window.images,parts);return c.toDataURL().split(',')[1]},parts),'base64')}
 async function card(parts,id){const data=await draw(parts);await sharp(data).extract({left:175*S,top:20*S,width:162*S,height:193*S}).resize(360,360,{fit:'contain',background:'#f4ede5'}).flatten({background:'#f4ede5'}).webp({lossless:true}).toFile(root+'/'+id+'.webp')}
 for(const p of PARTS.filter(p=>['face','eyes','brows','lip'].includes(p.category)))await card({...DEFAULT_PARTS,[p.category]:p.id},p.id)
 for(const p of BEAUTY_PRESETS)await card({...DEFAULT_PARTS,...p.parts},'look-'+p.id)
 // Inspect matching AND non-matching makeup, not just the easy presets.
 const rows=[]
 for(let face=0;face<4;face++)for(let hair=0;hair<6;hair++){
  const p={...DEFAULT_PARTS,top:'top-1',face:'face-'+face,hair:'hair-'+hair,headpiece:'headpiece-0'}
  const data=await draw(p);rows.push(data);await writeFile(join(out,`face-${face}-hair-${hair}.png`),data)
 }
 const hats=[]
 for(let hair=0;hair<6;hair++)for(const hat of ['hat-none','hat-0','hat-1','hat-10'])hats.push(await draw({...DEFAULT_PARTS,hair:'hair-'+hair,hat,top:'top-1'}))
 async function sheet(data,id,columns){await sharp({create:{width:324*columns,height:386*Math.ceil(data.length/columns),channels:4,background:'#f4ede5'}}).composite(await Promise.all(data.map(async(input,i)=>({input:await sharp(input).extract({left:175*S,top:20*S,width:162*S,height:193*S}).resize(324,386).png().toBuffer(),left:i%columns*324,top:Math.floor(i/columns)*386})))).png().toFile(join(out,id+'.png'))}
 await sheet(rows,'all-faces-by-hair',6);await sheet(hats,'all-hairs-by-caps',4)
 console.log(JSON.stringify({catalogue:23,visualMatrices:out}))
}finally{await browser.close()}
