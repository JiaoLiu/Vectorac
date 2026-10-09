import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const base=process.env.DRESSUP_BASE||'http://127.0.0.1:8084',out=await mkdtemp(join(tmpdir(),'wardrobe-hair-ui-')),key='vectorac.flower-wardrobe.v1'
let looks=0,rotations=0
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3}),errors=[],requests=new Set()
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.add(new URL(r.url()).pathname))
  await page.addInitScript(({key,parts,defaults})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,coins:1000,owned:['blush'],scenes:['atelier'],ownedParts:parts,look:{mode:'fine',parts:defaults}}))},{key,parts:PARTS.map(p=>p.id),defaults:DEFAULT_PARTS})
  await page.route('**/*',r=>/^https?:/.test(r.request().url())&&!r.request().url().startsWith(base)?r.abort():r.continue())
  await page.goto(base+'/blogs/other/flower_wardrobe.html')
  await page.waitForFunction(()=>(document.querySelector('.fw-model').dataset.src||'').startsWith('fine:'))
  const game=page.locator('.fw-game');await game.getByRole('button',{name:'全屏',exact:true}).click();await game.getByRole('button',{name:'装扮',exact:true}).click()
  async function snapshot(path){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});await page.screenshot({path})}
  for(const face of PARTS.filter(p=>p.category==='face'))for(const hat of PARTS.filter(p=>p.category==='hat')){
   const look={hair:'hair-5',face:face.id,hat:hat.id,headpiece:'headpiece-none',earrings:hat.index%2?'earrings-none':'earrings-8'}
   await game.evaluate((e,p)=>Object.values(p).forEach(id=>e.__vue__.choosePart(id)),look)
   await page.waitForFunction(p=>{const vm=document.querySelector('.fw-game').__vue__,src=document.querySelector('.fw-model').dataset.src||'';return !vm.loading&&Object.values(p).every(id=>src.includes('"'+id+'"'))},look)
   const channels=await page.locator('.fw-model').evaluate(c=>{const logical=document.createElement('canvas');logical.width=512;logical.height=1024;logical.getContext('2d').drawImage(c,0,0,512,1024);const d=logical.getContext('2d').getImageData(0,0,512,1024).data;return [218,294].every(x=>{for(let y=145;y<175;y++)if(d[(y*512+x)*4+3]<245)return false;return true})})
   assert.ok(channels,`${name}/${face.id}/${hat.id}: live ear gap`);assert.equal(await game.evaluate(e=>e.__vue__.imageError),false);looks++
   if(hat.id==='hat-none'||hat.id==='hat-0'||hat.id==='hat-1'||hat.id==='hat-10'||hat.id==='hat-11'){
    const state=await game.evaluate(e=>JSON.stringify(e.__vue__.state.look))
    if(!await game.evaluate(e=>e.__vue__.faceZoom))await game.getByRole('button',{name:'查看妆容',exact:true}).click()
    if(face.id==='face-0')await snapshot(join(out,name+'-'+hat.id+'-portrait.png'))
    await page.setViewportSize({width:844,height:390});rotations++
    if(face.id==='face-0'&&hat.id==='hat-1')await snapshot(join(out,name+'-beret-landscape.png'))
    assert.equal(await game.evaluate(e=>JSON.stringify(e.__vue__.state.look)),state)
    await page.setViewportSize({width:390,height:844});await game.getByRole('button',{name:'查看全身',exact:true}).click()
    assert.equal(await game.evaluate(e=>JSON.stringify(e.__vue__.state.look)),state)
   }
  }
  // Reproduce the reported air-bang + pink bow appearance, not only bare hair.
  await game.evaluate(e=>{e.__vue__.chooseBeauty('morning');for(const id of ['hair-5','hat-none','headpiece-0','earrings-none'])e.__vue__.choosePart(id)})
  await page.waitForFunction(()=>{const vm=document.querySelector('.fw-game').__vue__,src=document.querySelector('.fw-model').dataset.src||'';return !vm.loading&&src.includes('hair-5')&&src.includes('hat-none')&&src.includes('headpiece-0')})
  if(!await game.evaluate(e=>e.__vue__.faceZoom))await game.getByRole('button',{name:'查看妆容',exact:true}).click()
  await snapshot(join(out,name+'-air-bangs-bow-portrait.png'))
  await page.setViewportSize({width:844,height:390});await snapshot(join(out,name+'-air-bangs-bow-landscape.png'));await page.setViewportSize({width:390,height:844})
  for(const hat of ['hat-0','hat-1','hat-10'])for(const headpiece of ['headpiece-0','headpiece-6']){
   await game.evaluate((e,p)=>{e.__vue__.choosePart(p.hat);e.__vue__.choosePart(p.headpiece)},{hat,headpiece})
   await page.waitForFunction(p=>{const vm=document.querySelector('.fw-game').__vue__,src=document.querySelector('.fw-model').dataset.src||'';return !vm.loading&&src.includes(p.hat)&&src.includes(p.headpiece)},{hat,headpiece})
   assert.equal(await game.evaluate(e=>e.__vue__.imageError),false)
   await snapshot(join(out,name+'-'+hat+'-'+headpiece+'-portrait.png'))
   await page.setViewportSize({width:844,height:390});await snapshot(join(out,name+'-'+hat+'-'+headpiece+'-landscape.png'));await page.setViewportSize({width:390,height:844})
  }
  await game.evaluate(e=>{for(let i=0;i<12;i++){e.__vue__.choosePart('hair-'+(i%6));e.__vue__.choosePart('face-'+(i%4));e.__vue__.choosePart('hat-'+i)}})
  await page.waitForFunction(()=>{const vm=document.querySelector('.fw-game').__vue__,src=document.querySelector('.fw-model').dataset.src||'';return !vm.loading&&src.includes('hair-5')&&src.includes('face-3')&&src.includes('hat-11')})
  const saved=await game.evaluate(e=>JSON.stringify(e.__vue__.state.look));await page.reload();await page.waitForFunction(()=>{const vm=document.querySelector('.fw-game').__vue__;return !vm.loading&&(document.querySelector('.fw-model').dataset.src||'').includes('hair-5')})
  assert.equal(await game.evaluate(e=>JSON.stringify(e.__vue__.state.look)),saved)
  for(const [version,files] of [['v19',['hair-5','hair-5-back','hair-5-straw-back','hair-5-beret-back','hair-5-cloche-back']],['v18',['hair-5-straw','hair-5-beret','hair-5-cloche']]])for(const file of files)assert.ok(requests.has('/img/games/dressup/layers/'+version+'/'+file+'.webp'),name+': stale wearing runtime')
  assert.deepEqual(errors,[])
 }finally{await browser.close()}
}
console.log(JSON.stringify({passed:true,base,looks,rotations,screenshots:out}))
