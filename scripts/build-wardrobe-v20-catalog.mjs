// Only NEW catalogue portraits, rendered with the same model compositor.
import {createRequire} from 'node:module'
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
import {BEAUTY_PRESETS} from '../.vuepress/components/dressup/beauty.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const root='.vuepress/public/img/games/dressup/layers/v20/catalog',out=await mkdtemp(join(tmpdir(),'wardrobe-v20-visual-')),S=3,preset=BEAUTY_PRESETS.find(p=>p.id==='sweet')
await mkdir(root,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage()
 await page.route('http://wear.test/**',async r=>{const p=new URL(r.request().url()).pathname;if(p==='/')return r.fulfill({body:'<canvas width="1536" height="3072"></canvas>',contentType:'text/html'});await r.fulfill({body:await readFile(p.endsWith('.mjs')?'.vuepress/components/dressup'+p:'.vuepress/public'+p),contentType:p.endsWith('.mjs')?'application/javascript':'image/webp'})})
 await page.goto('http://wear.test/')
 async function draw(parts){return Buffer.from(await page.evaluate(async parts=>{const {layerSources,paintComposite}=await import('/compositor.mjs');window.images||=new Map();for(const src of layerSources(parts))if(!window.images.has(src)){const i=new Image();i.src=src;await i.decode();window.images.set(src,i)}const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.setTransform(3,0,0,3,0,0);paintComposite(ctx,window.images,parts);return c.toDataURL().split(',')[1]},parts),'base64')}
 const look={...DEFAULT_PARTS,...preset.parts}
 const portrait=await draw(look)
 for(const id of [...Object.values(preset.parts),'look-sweet'])await sharp(portrait).extract({left:175*S,top:20*S,width:162*S,height:193*S}).resize(360,360,{fit:'contain',background:'#f4ede5'}).flatten({background:'#f4ede5'}).webp({lossless:true}).toFile(root+'/'+id+'.webp')
 const rows=[],caps=[];let looks=0
 for(const hair of PARTS.filter(p=>p.category==='hair'))for(const hat of PARTS.filter(p=>p.category==='hat')){
  const img=await draw({...look,hair:hair.id,hat:hat.id,headpiece:hat.id==='hat-none'?'headpiece-0':'headpiece-none'});looks++
  if(hat.id==='hat-none'){rows.push(img);await writeFile(join(out,hair.id+'.png'),img)}
  if(hair.id==='hair-5'&&['hat-none','hat-0','hat-1','hat-10'].includes(hat.id)){caps.push(img);await writeFile(join(out,hat.id+'.png'),img)}
 }
 async function sheet(data,name,columns){await sharp({create:{width:324*columns,height:386*Math.ceil(data.length/columns),channels:4,background:'#f4ede5'}}).composite(await Promise.all(data.map(async(input,i)=>({input:await sharp(input).extract({left:175*S,top:20*S,width:162*S,height:193*S}).resize(324,386).png().toBuffer(),left:i%columns*324,top:Math.floor(i/columns)*386})))).png().toFile(join(out,name+'.png'))}
 await sheet(rows,'sweet-by-hair',6);await sheet(caps,'sweet-by-caps',4)
 console.log(JSON.stringify({catalogue:5,looks,screenshots:out}))
}finally{await browser.close()}
