// Actual compositor matrices, including the user's forehead/waist/foot failures.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS,partAsset,partThumbnail} from '../.vuepress/components/dressup/parts.mjs'
import {ACCESSORIES} from '../.vuepress/components/dressup/accessories.mjs'
import {sockEnd} from '../.vuepress/components/dressup/compositor.mjs'
import {HAT_HAIR_CUTS} from '../.vuepress/components/dressup/hat-coverage.mjs'
import {NEW_CAP_CUTS} from '../.vuepress/components/dressup/accessory-coverage.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const out=await mkdtemp(join(tmpdir(),'wardrobe-accessory-fit-')),browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
const group=category=>PARTS.filter(p=>p.category===category&&p.index>=0),raw=async f=>sharp(f).ensureAlpha().raw().toBuffer()
async function sheet(files,name,region,cols=6){const w=region.width*2,h=region.height*2,inputs=[];for(let i=0;i<files.length;i++)inputs.push({input:await sharp(files[i]).extract(region).resize(w,h).png().toBuffer(),left:(i%cols)*w,top:Math.floor(i/cols)*h});await sharp({create:{width:cols*w,height:Math.ceil(files.length/cols)*h,channels:4,background:'#efe5db'}}).composite(inputs).png().toFile(join(out,name+'.png'))}
try{
 const page=await browser.newPage()
 await page.route('http://wardrobe.test/**',async r=>{const path=new URL(r.request().url()).pathname;if(path==='/')return r.fulfill({body:'<!doctype html><canvas width="512" height="1024"></canvas>',contentType:'text/html'});try{await r.fulfill({body:await readFile(path.endsWith('.mjs')?'.vuepress/components/dressup'+path:'.vuepress/public'+path),contentType:path.endsWith('.mjs')?'application/javascript':'image/webp'})}catch{await r.fulfill({status:404,body:'missing'})}})
 await page.goto('http://wardrobe.test/')
 async function render(parts,id){const b64=await page.evaluate(async p=>{const {layerSources,paintComposite}=await import('/compositor.mjs');window.fitImages||=new Map();for(const src of layerSources(p))if(!window.fitImages.has(src)){const image=new Image();image.src=src;await image.decode();window.fitImages.set(src,image)}const c=document.querySelector('canvas');paintComposite(c.getContext('2d'),window.fitImages,p);return c.toDataURL().split(',')[1]},parts);const f=join(out,id+'.png');await writeFile(f,Buffer.from(b64,'base64'));return f}
 const hats=[],feet=[],waists=[],extras=[]
 // Every hat, including colour editions, against every old/new hairstyle.
 for(const hat of group('hat'))for(const hair of group('hair'))hats.push(await render({...DEFAULT_PARTS,hair:hair.id,hat:hat.id,headpiece:'headpiece-none'},`${hat.id}-${hair.id}`))
 // Exact original forehead-island region remains transparent in the new hat.
 const straw=await raw('.vuepress/public'+partAsset(PARTS.find(p=>p.id==='hat-0')))
 for(let y=78;y<85;y++)for(let x=243;x<273;x++)assert.equal(straw[(y*512+x)*4+3],0,'straw hat still includes dyed scalp')
 for(const hair of group('hair'))for(const face of group('face')){
  const look={...DEFAULT_PARTS,hair:hair.id,face:face.id,hat:'hat-none',headpiece:'headpiece-none'},before=await raw(await render(look,`no-cap-${hair.id}-${face.id}`))
  for(const hat of group('hat').filter(p=>p.cap||(p.sourceIndex??p.index)<2)){
   const after=await raw(await render({...look,hat:hat.id},`cap-${hat.id}-${hair.id}-${face.id}`)),pixels=await raw('.vuepress/public'+partAsset(hat)),cuts=hat.cap?NEW_CAP_CUTS[hat.id]:HAT_HAIR_CUTS[hat.sourceIndex??hat.index]
   for(let y=0;y<100;y++)for(let x=170;x<340;x++){const i=(y*512+x)*4;if(y>=cuts[x]+2&&before[i+3]>240&&!pixels[i+3])assert.deepEqual(after.subarray(i,i+4),before.subarray(i,i+4),`${hat.id}/${hair.id}/${face.id} erases side hair ${x},${y}`)}
  }
 }
 // Skin-free crowns may not change a single forehead pixel across any face.
 for(const hair of group('hair'))for(const face of group('face')){const p={...DEFAULT_PARTS,hair:hair.id,face:face.id,hat:'hat-none',headpiece:'headpiece-none'},baseline=await raw(await render(p,`bare-${hair.id}-${face.id}`));for(const hat of ['hat-3','hat-9']){const actual=await raw(await render({...p,hat},`${hat}-${hair.id}-${face.id}`));for(let y=76;y<99;y++)for(let x=232;x<281;x++){const i=(y*512+x)*4;assert.deepEqual(actual.subarray(i,i+4),baseline.subarray(i,i+4),`${hat} paints forehead ${x},${y}`)}}}
 for(const p of ACCESSORIES.filter(p=>['headpiece','earrings'].includes(p.category)))for(const hair of group('hair'))extras.push(await render({...DEFAULT_PARTS,hat:'hat-none',headpiece:'headpiece-none',earrings:'earrings-none',hair:hair.id,[p.category]:p.id},`${p.id}-${hair.id}`))
 // Old fitted skirts cover the neutral body. New long skirts instead retain
 // their real narrow waist, with the torso underneath removed. Widening them
 // to the nude master's silhouette is exactly the thick-waist regression.
 const master=await sharp('scripts/fixtures/wardrobe-v5-sources/master.webp').resize(512,1024,{fit:'fill'}).ensureAlpha().raw().toBuffer()
 const legs=await raw('.vuepress/public/img/games/dressup/layers/v13/underbody.webp');for(let y=0;y<490;y++)for(let x=0;x<512;x++)assert.equal(legs[(y*512+x)*4+3],0,'covered underbody waist may not leak out beside a skirt')
 for(const bottom of [2,8,9,12,13,14,15,16,17]){
  const p=PARTS.find(p=>p.id==='bottom-'+bottom),d=await raw('.vuepress/public'+partAsset(p))
  if(!p.frontBand)for(let y=365;y<470;y++)for(let x=Math.ceil(190-(y-365)*.28);x<322+(y-365)*.28;x++)if(master[(y*512+x)*4+3]>190)assert.ok(d[(y*512+x)*4+3]>190,`${p.id} waist flesh leak ${x},${y}`)
  for(const top of group('top')){
   const f=await render({...DEFAULT_PARTS,top:top.id,bottom:p.id,hair:'hair-0',socks:'socks-none'},`${top.id}-${p.id}`);waists.push(f)
   if(p.frontBand){
    const actual=await raw(f),b64=await page.evaluate(async p=>{const {materialImage}=await import('/materials.mjs');const c=document.createElement('canvas');c.width=512;c.height=1024;c.getContext('2d').drawImage(materialImage(window.fitImages.get(p.src),p.part),0,0);return c.toDataURL().split(',')[1]},{src:partAsset(p),part:p}),expected=await raw(Buffer.from(b64,'base64'))
    let visible=0;for(let y=353;y<382;y++)for(let x=210;x<306;x++){const i=(y*512+x)*4;if(expected[i+3]>250){visible++;for(let k=0;k<3;k++)assert.ok(Math.abs(actual[i+k]-expected[i+k])<10,`${top.id}/${p.id}: blouse hides front waistband at ${x},${y}`)}}
    assert.ok(visible>1200,`${p.id}: missing complete waistband`)
   }
  }
 }
 // All shoes with every sock, plus no sock. Feet below the shoe opening must
 // exactly follow its own alpha silhouette, never naked toes or sock overflow.
 for(const shoe of group('shoes')){const bare=await raw(await render({...DEFAULT_PARTS,shoes:shoe.id,socks:'socks-none'},`${shoe.id}-bare`));for(const sock of PARTS.filter(p=>p.category==='socks')){const f=await render({...DEFAULT_PARTS,shoes:shoe.id,socks:sock.id},`${shoe.id}-${sock.id}`),actual=await raw(f)
  // Use the same browser decoder for both sides: libwebp vs Chrome rounds
  // partially transparent WebP edging differently by up to two alpha units.
  const b64=await page.evaluate(src=>{const c=document.createElement('canvas');c.width=512;c.height=1024;c.getContext('2d').drawImage(window.fitImages.get(src),0,0);return c.toDataURL().split(',')[1]},partAsset(shoe)),d=await raw(Buffer.from(b64,'base64'))
  for(let y=sockEnd(shoe);y<1024;y++)for(let x=185;x<327;x++){const i=(y*512+x)*4;assert.deepEqual(actual.subarray(i,i+4),bare.subarray(i,i+4),`${shoe.id}/${sock.id} sock paints over boot ${x},${y}`)}
  // A skirt can correctly cover the top of a mid-calf boot. Below the skirt
  // hem, only the shoe silhouette may remain (including toe/sock overflow).
  for(let y=Math.max(925,sockEnd(shoe));y<1024;y++)for(let x=185;x<327;x++)assert.ok(Math.abs(actual[(y*512+x)*4+3]-d[(y*512+x)*4+3])<=1,`${shoe.id}/${sock.id} foot spill ${x},${y}`);feet.push(f)}}
 await sheet(hats,'hats-by-hair',{left:170,top:0,width:180,height:220})
 await sheet(extras,'jewellery-by-hair',{left:170,top:15,width:180,height:180})
 await sheet(feet,'shoes-by-socks',{left:180,top:790,width:150,height:215},9)
 await sheet(waists,'tops-by-new-skirts',{left:170,top:335,width:172,height:150},18)
 for(const p of ACCESSORIES){const f=await render({...DEFAULT_PARTS,[p.category]:p.id},'single-'+p.id);await sharp(f).png().toFile(join(out,'full-'+p.id+'.png'));assert.ok((await sharp('.vuepress/public'+partThumbnail(p)).metadata()).width>=300)}
 await sheet(ACCESSORIES.map(p=>'.vuepress/public'+partThumbnail(p)),'products',{left:0,top:0,width:360,height:360},6)
 console.log(JSON.stringify({passed:true,hatHair:hats.length,capFaceHair:168,crownFaceHair:48,headpieceEarringHair:extras.length,shoeSock:feet.length,topSkirt:waists.length,screenshots:out}))
}finally{await browser.close()}
