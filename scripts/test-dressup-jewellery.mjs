// Browser compositor checks and visual evidence for the v12 anatomical fit.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS,partAsset,partThumbnail,partBackAsset} from '../.vuepress/components/dressup/parts.mjs'
import {JEWELLERY_FOOTWEAR} from '../.vuepress/components/dressup/jewellery-footwear.mjs'
import {sockEnd} from '../.vuepress/components/dressup/compositor.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const out=await mkdtemp(join(tmpdir(),'wardrobe-jewellery-fit-')),group=c=>PARTS.filter(p=>p.category===c&&p.index>=0),raw=async f=>sharp(f).ensureAlpha().raw().toBuffer()
async function sheet(files,name,region,cols=6){const w=region.width*3,h=region.height*3,inputs=[];for(let i=0;i<files.length;i++)inputs.push({input:await sharp(files[i]).extract(region).resize(w,h).png().toBuffer(),left:i%cols*w,top:Math.floor(i/cols)*h});await sharp({create:{width:cols*w,height:Math.ceil(files.length/cols)*h,channels:4,background:'#efe5db'}}).composite(inputs).png().toFile(join(out,name+'.png'))}
let bytes=0
for(const p of JEWELLERY_FOOTWEAR){for(const src of [partAsset(p),partBackAsset(p)].filter(Boolean)){const f='.vuepress/public'+src,m=await sharp(f).metadata();assert.equal(m.width,512);assert.equal(m.height,1024);bytes+=(await stat(f)).size}
 const product='.vuepress/public'+partThumbnail(p),m=await sharp(product).metadata();assert.equal(m.width,360);assert.equal(m.height,360);bytes+=(await stat(product)).size
 const d=await raw(product);for(const [x,y] of [[0,0],[359,0],[0,359],[359,359]])assert.deepEqual([...d.subarray((y*360+x)*4,(y*360+x)*4+4)],[244,237,229,255],'catalogue background must match the card, not a white/pink rectangle')
}
assert.ok(bytes<1024*1024,'new runtime art must remain under 1 MiB')
const anatomy=await sharp('scripts/fixtures/wardrobe-v5-sources/master.webp').resize(512,1024,{fit:'fill'}).ensureAlpha().raw().toBuffer()
for(const p of JEWELLERY_FOOTWEAR.filter(p=>p.category==='shoes')){const d=await raw('.vuepress/public'+partAsset(p));for(let y=sockEnd(p);y<935;y++)for(let x=185;x<327;x++){const i=(y*512+x)*4;if(anatomy[i+3]>240)assert.ok(d[i+3]>180,`${p.id}: closed shaft has an anatomical hole at ${x},${y}`)}}
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
try{
 const page=await browser.newPage()
 await page.route('http://wardrobe.test/**',async r=>{const path=new URL(r.request().url()).pathname;if(path==='/')return r.fulfill({body:'<!doctype html><canvas width="512" height="1024"></canvas>',contentType:'text/html'});try{await r.fulfill({body:await readFile(path.endsWith('.mjs')?'.vuepress/components/dressup'+path:'.vuepress/public'+path),contentType:path.endsWith('.mjs')?'application/javascript':'image/webp'})}catch{await r.fulfill({status:404,body:'missing'})}})
 await page.goto('http://wardrobe.test/')
 async function render(parts,id){const b64=await page.evaluate(async p=>{const {layerSources,paintComposite}=await import('/compositor.mjs');window.fitImages||=new Map();for(const src of layerSources(p))if(!window.fitImages.has(src)){const image=new Image();image.src=src;await image.decode();window.fitImages.set(src,image)}const c=document.querySelector('canvas');paintComposite(c.getContext('2d'),window.fitImages,p);return c.toDataURL().split(',')[1]},parts);const f=join(out,id+'.png');await writeFile(f,Buffer.from(b64,'base64'));return f}
 const hats=[],necklaces=[],wrists=[],shoes=[],products=[]
 const cap=await raw('.vuepress/public'+partAsset(PARTS.find(p=>p.id==='hat-11')))
 for(const hair of group('hair'))for(const face of group('face')){
  const look={...DEFAULT_PARTS,hair:hair.id,face:face.id,hat:'hat-none',headpiece:'headpiece-none'},bare=await raw(await render(look,'bare-'+hair.id+'-'+face.id)),f=await render({...look,hat:'hat-11'},'smallhat-'+hair.id+'-'+face.id);hats.push(f)
  let core=0,overlap=0;for(let y=15;y<65;y++)for(let x=250;x<308;x++){const p=(y*512+x)*4;if(cap[p+3]>200&&cap[p]>cap[p+1]*1.5&&cap[p+2]>cap[p+1]*1.2){core++;if(bare[p+3]>200)overlap++}}
  assert.ok(core>100&&overlap/core>.7,`${hair.id}/${face.id}: cap must sit on the crown, not float outside the hair`)
  const actual=await raw(f);for(let y=78;y<99;y++)for(let x=230;x<282;x++){const p=(y*512+x)*4;assert.deepEqual(actual.subarray(p,p+4),bare.subarray(p,p+4),'small hat may not paint scalp/forehead')}
 }
 const plain={...DEFAULT_PARTS,hat:'hat-none',headpiece:'headpiece-none',earrings:'earrings-none',hair:'hair-0',bottom:'bottom-1',socks:'socks-none'}
 for(const top of group('top')){
  const look={...plain,top:top.id},bare=await raw(await render(look,'bare-'+top.id))
  for(const p of JEWELLERY_FOOTWEAR.filter(p=>['necklace','wrist'].includes(p.category))){
   const f=await render({...look,[p.category]:p.id},top.id+'-'+p.id),actual=await raw(f);(p.category==='necklace'?necklaces:wrists).push(f)
   // Only the accessory's anatomical area can change. No face/hair/clothes
   // reset and no rectangular skin/background patch elsewhere on the model.
   const rect=p.category==='necklace'?[220,168,72,66]:[96,459,32,23];let changed=0
   for(let y=0;y<1024;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4,equal=actual.subarray(i,i+4).equals(bare.subarray(i,i+4));if(!equal){changed++;assert.ok(x>=rect[0]&&x<rect[0]+rect[2]&&y>=rect[1]&&y<rect[1]+rect[3],`${p.id}: changed anatomy outside attachment at ${x},${y}`)}}
   assert.ok(changed>8,`${p.id} must actually be visible, not hidden under the model`)
  }
 }
 for(const p of JEWELLERY_FOOTWEAR.filter(p=>p.category==='necklace'))for(const hair of group('hair'))necklaces.push(await render({...plain,hair:hair.id,necklace:p.id},p.id+'-'+hair.id))
 for(const p of JEWELLERY_FOOTWEAR.filter(p=>p.category==='shoes'))shoes.push(await render({...plain,shoes:p.id},'full-'+p.id))
 for(const p of JEWELLERY_FOOTWEAR)products.push('.vuepress/public'+partThumbnail(p))
 await sheet(hats,'small-hat-by-hair-and-face',{left:180,top:0,width:170,height:180})
 await sheet(necklaces,'necklaces-by-top-and-hair',{left:214,top:160,width:84,height:82},12)
 await sheet(wrists,'wrist-by-top',{left:88,top:448,width:52,height:54},12)
 await sheet(shoes,'new-footwear-on-model',{left:180,top:685,width:152,height:319})
 await sheet(products,'independent-products',{left:0,top:0,width:360,height:360},7)
 console.log(JSON.stringify({passed:true,smallHatFaceHair:hats.length,necklaceTopHair:necklaces.length,wristTop:wrists.length,productionBytes:bytes,screenshots:out}))
}finally{await browser.close()}
