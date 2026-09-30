import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdtemp} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp'),{chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const out=await mkdtemp(join(tmpdir(),'wardrobe-editions-'))
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try{
  const page=await browser.newPage()
  await page.route('http://editions.test/**',async r=>{const path=new URL(r.request().url()).pathname
   if(path==='/')return r.fulfill({body:'<canvas width="512" height="1024"></canvas>',contentType:'text/html'})
   return r.fulfill({body:await readFile(path.endsWith('.mjs')?'.vuepress/components/dressup'+path:'.vuepress/public'+path),contentType:path.endsWith('.mjs')?'application/javascript':'image/webp'})
  });await page.goto('http://editions.test/')
  const result=await page.evaluate(async defaults=>{
   const {PARTS,partAsset,partThumbnail}=await import('/parts.mjs'),{EDITIONS}=await import('/collections.mjs')
   const {paintComposite,layerSources}=await import('/compositor.mjs'),{materialImage}=await import('/materials.mjs')
   const {default:bounds}=await import('/layer-bounds.mjs')
   const cache=new Map(),canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),models=[],cards=[],times=[]
   async function load(src){if(!cache.has(src))cache.set(src,await new Promise((ok,bad)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=bad;i.src=src}));return cache.get(src)}
   async function draw(look){for(const s of layerSources(look))await load(s);paintComposite(ctx,cache,look);return ctx.getImageData(0,0,512,1024).data}
   for(const part of EDITIONS){
    const original=PARTS.find(p=>p.id===`${part.category}-${part.sourceIndex}`),before=await draw({...defaults,[part.category]:original.id})
    const start=performance.now(),after=await draw({...defaults,[part.category]:part.id});times.push({id:part.id,ms:performance.now()-start})
    let different=0,alphaChanged=0,skinChanged=0,maxAlphaDelta=0
    for(let p=0;p<after.length;p+=4){
     const alphaDelta=Math.abs(after[p+3]-before[p+3]);maxAlphaDelta=Math.max(maxAlphaDelta,alphaDelta);if(alphaDelta>1)alphaChanged++
     if(Math.abs(after[p]-before[p])+Math.abs(after[p+1]-before[p+1])+Math.abs(after[p+2]-before[p+2])>20)different++
     // Clothing editions cannot dye the neutral face, hands or bare toes.
     const y=Math.floor(p/4/512),x=p/4%512
     if(['top','bottom'].includes(part.category)&&(y<165||y>890||y>=330&&y<360&&(x>=155&&x<168||x>=344&&x<357))&&before[p+3]>220&&after[p+3]>220){
      if(Math.abs(after[p]-before[p])+Math.abs(after[p+1]-before[p+1])+Math.abs(after[p+2]-before[p+2])>12)skinChanged++
     }
    }
    if(['earrings','headpiece'].includes(part.category)){
     // Images and canvases have different mipmap paths when scaling jewellery.
     // Assert the registered isolated accessory alpha, not final compositing's
     // downsample rounding against an already-read CPU canvas.
     const source=await load(partAsset(part)),b=bounds[partAsset(part)],i=part.sourceIndex
     const a=[[285,46,43,60],[289,66,38,42],[282,58,45,87],[286,54,40,62]][i],h=[21,25,27,12][i],w=i===3?9:11
     const rects=part.category==='headpiece'?[[b.x,b.y,b.w,b.h,...a]]:[[b.x,b.y,b.w/2,b.h,220-w/2,131,w,h],[b.x+b.w/2,b.y,b.w/2,b.h,292-w/2,131,w,h]]
     const plain=document.createElement('canvas');plain.width=512;plain.height=1024;const pc=plain.getContext('2d');for(const r of rects)pc.drawImage(source,...r)
     const expected=pc.getImageData(0,0,512,1024).data,actual=materialImage(source,part,false,rects).getContext('2d').getImageData(0,0,512,1024).data
     for(let p=3;p<actual.length;p+=4)if(actual[p]!==expected[p])throw Error('accessory fit/alpha changed: '+part.id)
    }else if(alphaChanged)throw Error(`${part.id}: ${alphaChanged} silhouette pixels changed, max alpha delta ${maxAlphaDelta}`)
    if(skinChanged)throw Error(`${part.id}: ${skinChanged} fixed anatomy pixels changed`)
    if(different<20)throw Error(`${part.id}: recolour not visible (${different})`)
    models.push({id:part.id,png:canvas.toDataURL().split(',')[1]})
    const source=await load(partThumbnail(part)),product=materialImage(source,part,true),c=product.getContext('2d'),d=c.getImageData(0,0,product.width,product.height).data
    if(d[0]!==244||d[1]!==237||d[2]!==229)throw Error('catalogue background changed: '+part.id)
    cards.push({id:part.id,png:product.toDataURL().split(',')[1]})
   }
   // Every coloured cap retains the exact original occlusion for every hair.
   for(const part of EDITIONS.filter(p=>p.category==='hat'))for(let hair=0;hair<4;hair++){
    const look={...defaults,hair:'hair-'+hair},base=PARTS.find(p=>p.id==='hat-'+part.sourceIndex)
    const before=await draw({...look,hat:base.id}),after=await draw({...look,hat:part.id})
    for(let p=3;p<after.length;p+=4)if(Math.abs(after[p]-before[p])>1)throw Error('cap/hair silhouette changed: '+part.id+'/'+hair)
   }
   // Switching editions cannot recolour the shared original image in place.
   const normal=await draw(defaults),saved=canvas.toDataURL();await draw({...defaults,top:'top-4',bottom:'bottom-11'});await draw(defaults)
   if(canvas.toDataURL()!==saved)throw Error('edition changed original source pixels')
   const brows=[];for(const id of ['brows-0','brows-1','brows-2','brows-3']){
    await draw({...defaults,brows:id});const crop=document.createElement('canvas');crop.width=137;crop.height=157;crop.getContext('2d').drawImage(canvas,188,24,137,157,0,0,137,157);brows.push(crop.toDataURL().split(',')[1])
   }
   return {models,cards,brows,times}
  },DEFAULT_PARTS)
  for(const m of result.models)await writeFile(join(out,`${name}-${m.id}.png`),Buffer.from(m.png,'base64'))
  await sharp({create:{width:360*8,height:360*4,channels:4,background:'#f4ede5'}}).composite(result.cards.map((c,i)=>({input:Buffer.from(c.png,'base64'),left:i%8*360,top:Math.floor(i/8)*360}))).png().toFile(join(out,`${name}-all-designs.png`))
  await sharp({create:{width:274*4,height:314,channels:4,background:'#f4ede5'}}).composite(await Promise.all(result.brows.map(async(p,i)=>({input:await sharp(Buffer.from(p,'base64')).resize(274,314).png().toBuffer(),left:i*274,top:0})))).png().toFile(join(out,`${name}-brow-comparison.png`))
  const ms=result.times.map(t=>t.ms).sort((a,b)=>a-b)
  console.log(JSON.stringify({engine:name,passed:true,editions:result.models.length,medianCompositionMs:ms[16],worstCompositionMs:ms[31],screenshots:out}))
 }finally{await browser.close()}
}
