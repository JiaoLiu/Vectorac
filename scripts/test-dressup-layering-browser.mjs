import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PARTS,DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
import {chooseCategory} from './wardrobe-category-browser.mjs'
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const base=process.env.DRESSUP_BASE||'http://127.0.0.1:8080',out=await mkdtemp(join(tmpdir(),'wardrobe-layering-'))
const key='vectorac.flower-wardrobe.v1'
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[],requested=new Set()
  page.on('request',r=>requested.add(new URL(r.url()).pathname))
  await page.addInitScript(({key,parts,defaults})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,coins:1000,owned:['blush'],scenes:['atelier'],ownedParts:parts,look:{mode:'fine',parts:defaults}}))},{key,parts:PARTS.map(p=>p.id),defaults:DEFAULT_PARTS})
  await page.route('**/*',r=>/^https?:/.test(r.request().url())&&!r.request().url().startsWith(base)?r.abort():r.continue())
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/blogs/other/flower_wardrobe.html')
  await page.waitForFunction(()=>(document.querySelector('.fw-model').dataset.src||'').startsWith('fine:'))
  const game=page.locator('.fw-game');await game.getByRole('button',{name:'全屏',exact:true}).click();await game.getByRole('button',{name:'装扮',exact:true}).click()
  for(const category of ['上衣','下装','发型','头饰','帽子','耳环','项链','手饰','袜子','鞋子','脸型','眼睛','眉毛','口红']){
   const before=await game.evaluate(e=>JSON.stringify(e.__vue__.displayParts));await chooseCategory(page,category)
   assert.equal(await game.evaluate(e=>JSON.stringify(e.__vue__.displayParts)),before,'browsing a group never changes clothes or jewellery')
   // Product images are intentionally lazy. Visit every card like a player
   // browsing the list; waiting for off-screen lazy images would never finish.
   for(const image of await page.locator('.fw-part-preview img').all())await image.scrollIntoViewIfNeeded()
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('.fw-part-preview img')).every(i=>i.complete&&i.naturalWidth>0)&&Array.from(document.querySelectorAll('.fw-design-canvas')).every(c=>c.dataset.ready==='true'))
   assert.ok(await page.locator('.fw-part-preview img').evaluateAll(es=>es.every(i=>/\/v(?:7|9|10|11|12)\/catalog\//.test(i.src))),'all item cards use independent catalogue art')
   if(['上衣','下装','帽子','耳环','项链','手饰','鞋子','脸型','眼睛','眉毛'].includes(category))await page.screenshot({path:join(out,`${name}-catalog-${category}.png`)})
  }
  const looks=[
   {top:'top-0',bottom:'bottom-0',face:'face-1',hair:'hair-0',hat:'hat-none',headpiece:'headpiece-0',earrings:'earrings-0',eyes:'eyes-0',brows:'brows-0',lip:'lip-3'},
   {face:'face-2',hair:'hair-0',earrings:'earrings-2'},
   {top:'top-3',bottom:'bottom-0',face:'face-1',hair:'hair-0',hat:'hat-0',eyes:'eyes-3',lip:'lip-4',socks:'socks-none',shoes:'shoes-0'},
   {top:'top-0',bottom:'bottom-0',face:'face-2',hair:'hair-1',hat:'hat-1',eyes:'eyes-2',brows:'brows-3',lip:'lip-1',socks:'socks-4',shoes:'shoes-1'},
   {top:'top-2',bottom:'bottom-2',face:'face-3',hair:'hair-2',hat:'hat-2',eyes:'eyes-1',lip:'lip-4',socks:'socks-none',shoes:'shoes-2'},
   {face:'face-0',hair:'hair-2',hat:'hat-none',headpiece:'headpiece-none'},
   {face:'face-1',hair:'hair-2',hat:'hat-3'},
   {face:'face-1',hair:'hair-0',hat:'hat-1',headpiece:'headpiece-none'},
   {face:'face-3',hair:'hair-0',hat:'hat-1'},
   {face:'face-1',hair:'hair-1',hat:'hat-1'},
   {face:'face-3',hair:'hair-1',hat:'hat-1'},
   {face:'face-1',hair:'hair-2',hat:'hat-1'},
   {face:'face-3',hair:'hair-2',hat:'hat-1'},
   {face:'face-1',hair:'hair-3',hat:'hat-1'},
   {face:'face-3',hair:'hair-3',hat:'hat-1'},
   {top:'top-1',bottom:'bottom-3',face:'face-0',hair:'hair-3',hat:'hat-3',eyes:'eyes-3',brows:'brows-2',lip:'lip-3',socks:'socks-5',shoes:'shoes-3'}
  ]
  looks.push(
   {top:'top-4',bottom:'bottom-4',hair:'hair-0',hat:'hat-7',headpiece:'headpiece-none',earrings:'earrings-6',brows:'brows-2'},
   {top:'top-11',bottom:'bottom-11',hair:'hair-2',hat:'hat-9',earrings:'earrings-5',brows:'brows-3'},
   {top:'top-8',bottom:'bottom-8',hair:'hair-3',hat:'hat-8',headpiece:'headpiece-8'},
   {top:'top-7',bottom:'bottom-7',hair:'hair-1',hat:'hat-5',headpiece:'headpiece-none',earrings:'earrings-4'}
  )
  for(let i=12;i<18;i++)looks.push({top:'top-'+i,bottom:'bottom-'+i,hair:'hair-'+(i%4),brows:'brows-'+(2+i%2),hat:'hat-none',headpiece:'headpiece-none',socks:'socks-none'})
  for(const hair of ['hair-4','hair-5'])for(const hat of ['hat-none','hat-10','hat-11','hat-9'])looks.push({hair,hat,headpiece:hat==='hat-none'?'headpiece-11':'headpiece-10',earrings:'earrings-8',socks:'socks-6',shoes:'shoes-4'})
  looks.push({hair:'hair-5',hat:'hat-10',headpiece:'headpiece-none',earrings:'earrings-9',socks:'socks-7',shoes:'shoes-5'})
  for(let i=6;i<12;i++)looks.push({top:'top-1',bottom:'bottom-1',hair:'hair-'+(i%6),hat:'hat-11',headpiece:'headpiece-none',shoes:'shoes-'+i,socks:'socks-'+(i%8),necklace:'necklace-'+(i%4),wrist:'wrist-'+(i%4)})
  for(let i=0;i<looks.length;i++){
   const look=looks[i];await game.evaluate((e,p)=>Object.values(p).forEach(id=>e.__vue__.choosePart(id)),look)
   await page.waitForFunction(p=>{const vm=document.querySelector('.fw-game').__vue__,src=document.querySelector('.fw-model').dataset.src||'';return !vm.loading&&Object.values(p).every(id=>src.includes('"'+id+'"'))},look)
   assert.equal(await game.evaluate(e=>e.__vue__.imageError),false)
   const data=await page.locator('.fw-model').evaluate(c=>c.toDataURL('image/png').split(',')[1]);await writeFile(join(out,`${name}-${i}-model.png`),Buffer.from(data,'base64'))
   if(!await game.evaluate(e=>e.__vue__.faceZoom))await game.getByRole('button',{name:'查看妆容',exact:true}).click();await page.screenshot({path:join(out,`${name}-${i}-makeup.png`)})
   if(i===0||look.hair==='hair-2'||look.hat==='hat-1'||i>=20){await page.setViewportSize({width:844,height:390});await page.screenshot({path:join(out,`${name}-look-${i}-landscape.png`)});await page.setViewportSize({width:390,height:844})}
   const snapshot=await game.evaluate(e=>JSON.stringify(e.__vue__.state.look));await game.getByRole('button',{name:'查看全身',exact:true}).click();assert.equal(await game.evaluate(e=>JSON.stringify(e.__vue__.state.look)),snapshot)
   if(i>=20){
    await page.screenshot({path:join(out,`${name}-${i}-full-portrait.png`)})
    await page.setViewportSize({width:844,height:390});await page.screenshot({path:join(out,`${name}-${i}-full-landscape.png`)})
    const fit=await page.locator('.fw-model').evaluate(c=>{const m=c.getBoundingClientRect(),s=c.closest('.fw-model-space').getBoundingClientRect();return m.left>=s.left-1&&m.right<=s.right+1&&m.top>=s.top-1&&m.bottom<=s.bottom+1})
    assert.ok(fit,'new skirt must fit completely inside the stage in landscape');await page.setViewportSize({width:390,height:844})
   }
  }
  // Cold asset loads / rapid selection / rotation must settle on the final
  // choices, never a late image decode from a previous top or eyebrow.
  await game.evaluate(e=>{for(let i=12;i<18;i++){e.__vue__.choosePart('top-'+i);e.__vue__.choosePart('bottom-'+i);e.__vue__.choosePart('brows-'+(2+i%2));e.__vue__.choosePart('shoes-'+(6+i%6));e.__vue__.choosePart('necklace-'+(i%4));e.__vue__.choosePart('wrist-'+(i%4))}})
  await page.setViewportSize({width:844,height:390});await page.setViewportSize({width:390,height:844})
  await page.waitForFunction(()=>{const vm=document.querySelector('.fw-game').__vue__,src=document.querySelector('.fw-model').dataset.src||'';return !vm.loading&&src.includes('top-17')&&src.includes('bottom-17')&&src.includes('brows-3')&&src.includes('shoes-11')&&src.includes('necklace-1')&&src.includes('wrist-1')})
  const last=await game.evaluate(e=>JSON.stringify(e.__vue__.state.look));await page.reload();await page.waitForFunction(()=>(document.querySelector('.fw-model').dataset.src||'').includes('bottom-17'));assert.equal(await page.locator('.fw-game').evaluate(e=>JSON.stringify(e.__vue__.state.look)),last)
  for(const path of ['shoes-6','shoes-7','shoes-8','shoes-9','shoes-10','shoes-11','wrist-2','wrist-2-back','bottom-2','bottom-12','bottom-17'])assert.ok(requested.has('/img/games/dressup/layers/v13/'+path+'.webp'),`${name}: stale runtime did not load repaired wearing art ${path}`)
  assert.deepEqual(errors,[]);await page.close()
 }finally{await browser.close()}
}
console.log(JSON.stringify({passed:true,screenshots:out}))
