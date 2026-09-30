// Cross-category art regression: matching presets alone missed the old bug.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {PARTS,DEFAULT_PARTS,partAsset,partThumbnail} from '../.vuepress/components/dressup/parts.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const dir=await mkdtemp(join(tmpdir(),'wardrobe-v7-head-'))
const raw=async id=>sharp('.vuepress/public'+partAsset(PARTS.find(p=>p.id===id))).ensureAlpha().raw().toBuffer()
for(const p of PARTS.filter(p=>p.index>=0)){
 assert.notEqual(partThumbnail(p),partAsset(p),'product art must not point to the wearable sprite')
 const m=await sharp('.vuepress/public'+partThumbnail(p)).metadata();assert.ok(m.width>150&&m.height>150)
 const card=await sharp('.vuepress/public'+partThumbnail(p)).removeAlpha().raw().toBuffer()
 assert.deepEqual([...card.subarray(0,3)],[244,237,229],'catalogue margin must match the one CSS background')
 if(p.id==='hat-1')for(let y=220;y<300;y+=10)for(let x=15;x<45;x+=10)assert.deepEqual([...card.subarray((y*360+x)*3,(y*360+x)*3+3)],[244,237,229],'neighbouring straw-hat ribbon leaked into beret card')
}
const art=JSON.parse(await readFile('scripts/wardrobe-v7-art.json','utf8'))
for(const id of ['catalog-hats','catalog-eyes','catalog-brows','catalog-faces','catalog-lips','catalog-hair','catalog-socks'])assert.ok(art.assets.some(a=>a.id===id&&!a.reference),'catalogue design must be independently illustrated, not a worn-model crop')
const features={};for(const category of ['eyes','brows','lip'])for(const p of PARTS.filter(p=>p.category===category)){
 const data=await raw(p.id);features[p.id]=data
 // No second nose can be hidden inside any eye/brow/lip layer.
 for(let y=120;y<138;y++)for(let x=247;x<265;x++)assert.equal(data[(y*512+x)*4+3],0,p.id+' contains nose/skin')
 for(let y=0;y<1024;y++)for(let x=0;x<512;x++)if(data[(y*512+x)*4+3])assert.ok(category==='eyes'?y>=99&&y<119:category==='brows'?y>=86&&y<101:y>=138&&y<151,'feature extends outside its anatomical region')
}
const faces=await Promise.all([0,1,2,3].map(i=>raw('face-'+i)))
for(let i=1;i<4;i++){
 // Jaw really changes, but the one common nose stays EXACTLY identical.
 let different=0;for(let y=135;y<161;y++)for(let x=207;x<307;x++)if(faces[i][(y*512+x)*4+3]!==faces[0][(y*512+x)*4+3])different++
 assert.ok(different>25,'face shape has no silhouette change')
 for(let y=120;y<137;y++)for(let x=248;x<265;x++)for(let c=0;c<4;c++)assert.equal(faces[i][(y*512+x)*4+c],faces[0][(y*512+x)*4+c],'face selection changes the nose landmark')
 for(let y=156;y<163;y++)for(let x=241;x<272;x++)for(let c=0;c<4;c++)assert.equal(faces[i][(y*512+x)*4+c],faces[0][(y*512+x)*4+c],'face choice shifts the neck shading and produces a seam')
}
for(const id of ['hair-0','hair-1']){const data=await raw(id);assert.ok(data[(150*512+224)*4+3]>100,'rectangular ear/jaw hole returned')}
for(let hair=0;hair<4;hair++){
 // Restored ponytail is pinned to the original wearable, not the new generated
 // sprite. A skin-colour heuristic is not a registration/visual test for it.
 if(hair===2){const path=partAsset(PARTS.find(p=>p.id==='hair-2'));assert.ok(path.endsWith('/hair-2-restored.webp'));const wearable=await readFile('.vuepress/public'+path);assert.deepEqual(wearable,await readFile('.vuepress/public/img/games/dressup/layers/v6/hair-2.webp'),'catalogue regeneration must preserve the original ponytail wearable');assert.equal(createHash('sha256').update(wearable).digest('hex'),'779118293287eb733d2c0e318fa1c9e6d440467e53cabedcdcc702d4030a0331','original ponytail registration must not change');continue}
 const data=await raw('hair-'+hair);let skin=0
 for(let y=105;y<164;y++)for(let x=208;x<307;x++){const p=(y*512+x)*4,[r,g,b,a]=data.subarray(p,p+4);if(a>150&&r>165&&g>110&&r>g&&g>b&&r-g<65)skin++}
 assert.ok(skin<10,'hair sprite contains cheek/ear skin that produces stitched face edges: '+hair)
}
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage()
 await page.route('http://head.test/**',async r=>{
  const path=new URL(r.request().url()).pathname;if(path==='/')return r.fulfill({body:'<canvas width="512" height="1024"></canvas>',contentType:'text/html'})
  return r.fulfill({body:await readFile(path.endsWith('.mjs')?'.vuepress/components/dressup'+path:'.vuepress/public'+path),contentType:path.endsWith('.mjs')?'application/javascript':'image/webp'})
 });await page.goto('http://head.test/')
 const results=await page.evaluate(async defaults=>{
  const {layerSources,paintComposite}=await import('/compositor.mjs'),cache=new Map(),canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),tiles=[]
  async function draw(parts){for(const src of layerSources(parts))if(!cache.has(src))cache.set(src,await new Promise((ok,bad)=>{const i=new Image;i.onload=()=>ok(i);i.onerror=bad;i.src=src}));paintComposite(ctx,cache,parts)}
  for(let f=0;f<4;f++)for(let e=0;e<4;e++)for(let b=0;b<4;b++)for(let l=0;l<5;l++){
   await draw({...defaults,face:'face-'+f,eyes:'eyes-'+e,brows:'brows-'+b,lip:'lip-'+l})
   const crop=document.createElement('canvas');crop.width=137;crop.height=157;crop.getContext('2d').drawImage(canvas,188,24,137,157,0,0,137,157);tiles.push(crop.toDataURL().split(',')[1])
  }
  const hats=[];for(let hair=0;hair<4;hair++)for(let hat=0;hat<4;hat++){
   await draw({...defaults,hair:'hair-'+hair,hat:'hat-'+hat,face:'face-3',eyes:'eyes-3',lip:'lip-4',earrings:'earrings-0'})
   const crop=document.createElement('canvas');crop.width=230;crop.height=190;crop.getContext('2d').drawImage(canvas,141,5,230,190,0,0,230,190);hats.push(crop.toDataURL().split(',')[1])
  }
  const earrings=[]
  for(let hair=0;hair<4;hair++)for(let e=0;e<4;e++){
   const look={...defaults,hair:'hair-'+hair,face:'face-1',lip:'lip-3',headpiece:'headpiece-0'}
   await draw({...look,earrings:'earrings-none'});const before=ctx.getImageData(0,0,512,1024).data
   await draw({...look,earrings:'earrings-'+e});const after=ctx.getImageData(0,0,512,1024).data
   const visible=[0,0];for(let y=130;y<161;y++)for(let x=212;x<302;x++){const p=(y*512+x)*4;if(Math.abs(before[p]-after[p])+Math.abs(before[p+1]-after[p+1])+Math.abs(before[p+2]-after[p+2])>20)visible[x<256?0:1]++}
   const crop=document.createElement('canvas');crop.width=180;crop.height=180;crop.getContext('2d').drawImage(canvas,166,5,180,180,0,0,180,180)
   earrings.push({hair,e,visible,png:crop.toDataURL().split(',')[1]})
  }
  const ponytails=[]
  const {PARTS,partAsset}=await import('/parts.mjs'),pony=partAsset(PARTS.find(p=>p.id==='hair-2'))
  const original=new Image;await new Promise((ok,bad)=>{original.onload=ok;original.onerror=bad;original.src='/img/games/dressup/layers/v6/hair-2.webp'})
  for(let face=0;face<4;face++)for(const hat of ['hat-none','hat-0','hat-1','hat-2','hat-3']){
   const look={...defaults,hair:'hair-2',face:'face-'+face,hat,earrings:'earrings-0'}
   await draw(look);const actual=canvas.toDataURL(),reference=new Map(cache);reference.set(pony,original);paintComposite(ctx,reference,look)
   if(canvas.toDataURL()!==actual)throw Error('ponytail wearable changed with catalogue art: '+face+' '+hat)
   const crop=document.createElement('canvas');crop.width=250;crop.height=200;crop.getContext('2d').drawImage(canvas,140,0,250,200,0,0,250,200);ponytails.push(crop.toDataURL().split(',')[1])
  }
  return {tiles,hats,earrings,ponytails}
 },DEFAULT_PARTS)
 for(let f=0;f<4;f++){
  const cells=results.tiles.slice(f*80,f*80+80);await sharp({create:{width:137*10,height:157*8,channels:4,background:'#f1e6db'}}).composite(cells.map((v,i)=>({input:Buffer.from(v,'base64'),left:i%10*137,top:Math.floor(i/10)*157}))).png().toFile(join(dir,'face-'+f+'-all-makeup.png'))
 }
 await sharp({create:{width:230*4,height:190*4,channels:4,background:'#f1e6db'}}).composite(results.hats.map((v,i)=>({input:Buffer.from(v,'base64'),left:i%4*230,top:Math.floor(i/4)*190}))).png().toFile(join(dir,'all-hats-and-hair.png'))
 for(const e of results.earrings)assert.ok(e.visible.every(n=>n>20),`both earrings must remain visible with hair ${e.hair}, jewellery ${e.e}: ${e.visible}`)
 await sharp({create:{width:180*4,height:180*4,channels:4,background:'#f1e6db'}}).composite(results.earrings.map((v,i)=>({input:Buffer.from(v.png,'base64'),left:i%4*180,top:Math.floor(i/4)*180}))).png().toFile(join(dir,'all-earrings-and-hair.png'))
 await sharp({create:{width:1250,height:800,channels:4,background:'#f1e6db'}}).composite(results.ponytails.map((v,i)=>({input:Buffer.from(v,'base64'),left:i%5*250,top:Math.floor(i/5)*200}))).png().toFile(join(dir,'restored-ponytail-all-faces-and-hats.png'))
 console.log(JSON.stringify({passed:true,makeupCombinations:320,hatHairCombinations:16,screenshots:dir}))
}finally{await browser.close()}
