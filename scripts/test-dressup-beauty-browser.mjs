import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {PARTS,DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
import {BEAUTY_PRESETS,BEAUTY_SLOTS} from '../.vuepress/components/dressup/beauty.mjs'
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const base=process.env.DRESSUP_BASE||'http://127.0.0.1:8084',out=await mkdtemp(join(tmpdir(),'wardrobe-beauty-ui-')),key='vectorac.flower-wardrobe.v1'
let clicks=0,rotations=0
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(({key,owned,parts})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,coins:1000,owned:['blush'],scenes:['atelier'],ownedParts:owned,look:{mode:'fine',parts}}))},{key,owned:PARTS.filter(p=>p.id!=='top-3').map(p=>p.id),parts:{...DEFAULT_PARTS,top:'top-1',bottom:'bottom-2',hair:'hair-2',hat:'hat-1',earrings:'earrings-0'}})
  await page.route('**/*',r=>/^https?:/.test(r.request().url())&&!r.request().url().startsWith(base)?r.abort():r.continue())
  await page.goto(base+'/blogs/other/flower_wardrobe.html')
  await page.waitForFunction(()=>{const vm=document.querySelector('.fw-game').__vue__;return !vm.loading&&(document.querySelector('.fw-model').dataset.src||'').startsWith('fine:')})
  const game=page.locator('.fw-game');await game.getByRole('button',{name:'全屏',exact:true}).click();await game.getByRole('button',{name:'装扮',exact:true}).click();await game.locator('.fw-part-groups').getByRole('button',{name:'妆容',exact:true}).click()
  const initial=await game.evaluate(e=>JSON.parse(JSON.stringify(e.__vue__.state)))
  async function settled(parts){await page.waitForFunction(p=>{const vm=document.querySelector('.fw-game').__vue__,src=document.querySelector('.fw-model').dataset.src||'';return !vm.loading&&Object.entries(p).every(([k,v])=>src.includes('"'+k+'":"'+v+'"'))},parts)}
  for(const preset of BEAUTY_PRESETS){
   await game.getByRole('button',{name:'换上'+preset.name+'妆容',exact:true}).click();await settled(preset.parts);clicks++
   const state=await game.evaluate(e=>JSON.parse(JSON.stringify(e.__vue__.state)))
   for(const [slot,id] of Object.entries(initial.look.parts))if(!BEAUTY_SLOTS.includes(slot))assert.equal(state.look.parts[slot],id,name+'/'+preset.id+': altered '+slot)
   assert.equal(state.coins,initial.coins);assert.deepEqual(state.ownedParts,initial.ownedParts)
   assert.equal(await game.getByRole('button',{name:'换上'+preset.name+'妆容'}).getAttribute('aria-pressed'),'true')
   await game.evaluate(e=>{e.__vue__.$refs.panel.scrollTop=0})
   await page.screenshot({path:join(out,name+'-'+preset.id+'-portrait.png')})
   await page.setViewportSize({width:844,height:390});await settled(preset.parts);rotations++
   const bounds=await game.evaluate(e=>({right:e.getBoundingClientRect().right,width:window.innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.right<=bounds.width+1&&bounds.scroll<=bounds.width+1,name+': horizontal overflow')
   await page.screenshot({path:join(out,name+'-'+preset.id+'-landscape.png')})
   await page.setViewportSize({width:390,height:844});await settled(preset.parts)
  }
  // A beauty choice retains unpurchased garment drafts; it clears only old
  // makeup drafts. Browsing and zooming never restore an earlier outfit.
  await game.evaluate(e=>{e.__vue__.choosePart('top-3');e.__vue__.finePreviews={...e.__vue__.finePreviews,eyes:'eyes-1'};e.__vue__.chooseBeauty('peach')})
  await settled({...BEAUTY_PRESETS[1].parts,top:'top-3'})
  assert.deepEqual(await game.evaluate(e=>JSON.parse(JSON.stringify(e.__vue__.finePreviews))),{top:'top-3'})
  await game.evaluate(e=>{e.__vue__.finePreviews={};e.__vue__.choosePart('eyes-4');e.__vue__.choosePart('brows-3')});await settled({face:'face-1',eyes:'eyes-4',brows:'brows-3',lip:'lip-1',top:'top-1'})
  await game.getByRole('button',{name:'查看全身',exact:true}).click();await settled({face:'face-1',eyes:'eyes-4',brows:'brows-3'})
  await page.screenshot({path:join(out,name+'-fullbody.png')})
  await game.evaluate(e=>{for(let i=0;i<20;i++)e.__vue__.chooseBeauty(['morning','peach','heart','elegant','sakura'][i%5])});await settled(BEAUTY_PRESETS[4].parts)
  await game.evaluate(e=>e.__vue__.saveLook());const album=await game.evaluate(e=>e.__vue__.state.albums[0].id)
  await game.evaluate(e=>e.__vue__.chooseBeauty('peach'));await settled(BEAUTY_PRESETS[1].parts)
  await game.evaluate((e,id)=>e.__vue__.restoreLook(id),album);await settled(BEAUTY_PRESETS[4].parts)
  const saved=await game.evaluate(e=>JSON.stringify(e.__vue__.state.look));await page.reload();await settled(BEAUTY_PRESETS[4].parts)
  assert.equal(await game.evaluate(e=>JSON.stringify(e.__vue__.state.look)),saved);assert.deepEqual(errors,[])
 }finally{await browser.close()}
}
await writeFile(join(out,'result.json'),JSON.stringify({base,clicks,rotations,passed:true}))
console.log(JSON.stringify({passed:true,base,clicks,rotations,screenshots:out}))
