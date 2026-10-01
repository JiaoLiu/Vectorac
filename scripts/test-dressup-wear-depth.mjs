// Physical wearing regressions missed by alpha coverage and bounding-box tests.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {PARTS,partAsset,partBackAsset,partThumbnail,DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
import {paintComposite,layerSources,BASE} from '../.vuepress/components/dressup/compositor.mjs'
import {tucksIntoWaist} from '../.vuepress/components/dressup/waist-fit.mjs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const raw=async path=>sharp('.vuepress/public'+path).ensureAlpha().raw().toBuffer()
const pixel=(d,x,y)=>d.subarray((y*512+x)*4,(y*512+x)*4+4)
for(const [index,start] of [[6,888],[7,871],[8,852],[9,850],[10,800],[11,695]]){
 const p=PARTS.find(p=>p.id==='shoes-'+index),d=await raw(partAsset(p))
 // Ankles must remain visible INSIDE the collar, never be covered by an
 // opaque empty interior/liner copied from the independent product picture.
 for(const x of [228,282])assert.ok(pixel(d,x,start+3)[3]<30,`${p.id}: shoe opening covers the ankle`)
 let rim=0;for(let y=start;y<start+15;y++)for(let x=200;x<312;x++)if(pixel(d,x,y)[3]>180)rim++
 assert.ok(rim>15,`${p.id}: removing the liner may not erase the physical collar`)
 assert.ok(partAsset(p).includes('/'+p.wearVersion+'/'));assert.ok(partThumbnail(p).includes('/v12/catalog/'))
 if(index<8){
  let left=256,right=0,top=1024,bottom=0
  for(let y=0;y<1024;y++)for(let x=185;x<256;x++)if(pixel(d,x,y)[3]>180){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
  const ratio=(bottom-top+1)/(right-left+1)
  assert.ok(ratio>1.7&&ratio<2.1,`${p.id}: upper/sole proportions are flattened (${ratio})`)
  assert.ok(bottom-top>90,`${p.id}: cannot squash whole shoe into old 64-pixel slot`)
 }
}
for(const index of [2,8,9,12,17]){
 const p=PARTS.find(p=>p.id==='bottom-'+index),d=await raw(partAsset(p));assert.equal(p.frontBand,true)
 // An intact curved band begins above the old 365px crop, at a genuinely
 // fitted waist. Body-coverage tests alone encouraged an oversized cylinder.
 let above=0;for(let y=350;y<365;y++)for(let x=195;x<317;x++)if(pixel(d,x,y)[3]>190)above++
 assert.ok(above>120,`${p.id}: complete waistband was cropped away`)
 let l=512,r=0;for(let x=0;x<512;x++)if(pixel(d,x,370)[3]>190){l=Math.min(l,x);r=Math.max(r,x)}
 assert.ok(r-l>=98&&r-l<=112,`${p.id}: lost the narrow fitted waist`)
 if(!p.material)for(const topId of ['top-0','top-1','top-2','top-3','top-12','top-17']){
  const parts={...DEFAULT_PARTS,bottom:p.id,top:topId},draws=[],top=PARTS.find(p=>p.id===topId)
  paintComposite(new Proxy({drawImage:img=>draws.push(img.src)},{get:(o,k)=>o[k]||(()=>{})}),new Map(layerSources(parts).map(src=>[src,{src}])),parts)
  assert.equal(draws.indexOf(partAsset(p))>draws.indexOf(partAsset(top)),tucksIntoWaist(top,p),'belt may only cover a genuinely tucked blouse')
 }
}
for(const index of [2,12,13,14,15,16,17]){
 const d=await raw(partAsset(PARTS.find(p=>p.id==='bottom-'+index)))
 // Registering a front band must not introduce a one-row hip-width jump.
 const span=y=>{let l=512,r=0;for(let x=0;x<512;x++)if(pixel(d,x,y)[3]>190){l=Math.min(l,x);r=Math.max(r,x)}return r-l}
 for(let y=460;y<510;y++)assert.ok(Math.abs(span(y)-span(y+1))<7,`bottom-${index}: discontinuous hip correction at ${y}`)
}
for(const index of [12,13,17]){
 const d=await raw(partAsset(PARTS.find(p=>p.id==='bottom-'+index)))
 for(let y=365;y<373;y++)for(let x=220;x<292;x++){
  const [r,g,b,a]=pixel(d,x,y);assert.ok(a>190,'front waistband must be opaque cloth')
  assert.ok(!(r-g>20&&g-b>15),`bottom-${index}: exposed abdomen/blouse remnant inside waistband at ${x},${y}`)
 }
}
const watch=PARTS.find(p=>p.id==='wrist-2'),front=await raw(partAsset(watch)),back=await raw(partBackAsset(watch))
assert.ok(pixel(front,112,471)[3]>190,'round dial must lie on the wrist')
assert.ok(back.some((v,i)=>i%4===3&&v>100),'watch needs actual rear strap pixels')
const parts={...DEFAULT_PARTS,wrist:watch.id},sources=layerSources(parts),draws=[],images=new Map(sources.map(src=>[src,{src}]))
paintComposite(new Proxy({drawImage:img=>draws.push(img.src)},{get:(o,k)=>o[k]||(()=>{})}),images,parts)
assert.ok(draws.indexOf(partBackAsset(watch))<draws.indexOf(BASE));assert.ok(draws.indexOf(partAsset(watch))>draws.indexOf(BASE))
let protectedAssets=0
for(const version of ['v13','v14']){const manifest=JSON.parse(await readFile(`scripts/wardrobe-${version}-art.json`,'utf8'))
 for(const [path,hash] of Object.entries(manifest.protectedAssets||{})){assert.equal(createHash('sha256').update(await readFile('.vuepress/public'+path)).digest('hex'),hash,`product/old hairstyle/normal skirt unexpectedly changed: ${path}`);protectedAssets++}
}
console.log(JSON.stringify({passed:true,wornFootwear:6,proportionalSneakers:2,completeLongBands:5,frontBands:7,wrappedWatch:1,protectedAssets}))
