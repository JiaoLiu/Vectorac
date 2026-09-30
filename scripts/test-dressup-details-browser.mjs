import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const base=process.env.DRESSUP_BASE||'http://127.0.0.1:8080',key='vectorac.flower-wardrobe.v1',out=await mkdtemp(join(tmpdir(),'wardrobe-details-'))
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try{for(const viewport of [{width:320,height:720},{width:390,height:844},{width:844,height:390}]){
  const page=await browser.newPage({viewport,hasTouch:true,isMobile:true}),errors=[]
  await page.addInitScript(key=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,coins:1000,owned:['blush','mint'],scenes:['atelier','garden'],look:{outfit:'mint',scene:'garden',pose:1},albums:[{id:'old',look:{outfit:'mint',scene:'garden',pose:1}}]}))},key)
  await page.route('**/*',r=>/^https?:/.test(r.request().url())&&!r.request().url().startsWith(base)?r.abort():r.continue())
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/blogs/other/flower_wardrobe.html');await page.waitForFunction(()=>!!document.querySelector('.fw-model').dataset.src)
  const game=page.locator('.fw-game'),save=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),tab=name=>page.locator('.fw-tabs button').filter({hasText:name}).click()
  await game.getByRole('button',{name:'全屏',exact:true}).click()
  await tab('衣橱');await game.getByRole('button',{name:'试穿桃枝春信',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.fw-model').dataset.src.includes('hanfu-'))
  const clips=await page.locator('.fw-dress-image').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),i=e.querySelector('img').getBoundingClientRect();return i.width<=r.width+1&&i.left>=r.left-1&&i.right<=r.right+1}));assert.ok(clips.every(Boolean),'every wide dress stays inside its card')
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  await game.getByRole('button',{name:'结束试穿',exact:true}).click()
  const sound=game.getByRole('button',{name:'音效 开',exact:true}),box=await sound.boundingBox()
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2)
  assert.equal(await page.evaluate(()=>visualViewport.scale),1,'quick control taps do not zoom page')
  assert.equal(await sound.evaluate(e=>getComputedStyle(e).touchAction),'manipulation')
  await tab('装扮');await page.waitForFunction(()=>document.querySelector('.fw-model').dataset.src.startsWith('fine:'))
  assert.equal((await save()).coins,1000,'migrating old save preserves currency')
  // Reproduce: unowned clothes -> owned headpiece -> makeup zoom -> return.
  await game.getByRole('button',{name:'试戴夜色丝绒',exact:true}).click()
  await page.locator('.fw-part-categories').getByRole('button',{name:'下装',exact:true}).click();await game.getByRole('button',{name:'试戴桃花长裙',exact:true}).click()
  await page.locator('.fw-part-categories').getByRole('button',{name:'头饰',exact:true}).click();await game.getByRole('button',{name:'试戴珍珠蝴蝶结',exact:true}).click()
  await page.locator('.fw-part-categories').getByRole('button',{name:'脸型',exact:true}).click();await game.getByRole('button',{name:'试戴柔和圆脸',exact:true}).click()
  await page.locator('.fw-part-categories').getByRole('button',{name:'眼睛',exact:true}).click();await game.getByRole('button',{name:'试戴碧绿眼眸',exact:true}).click()
  assert.equal((await save()).look.parts.eyes,'eyes-2','eye customization has its own saved slot')
  await page.waitForFunction(()=>{const p=document.querySelector('.fw-game').__vue__.displayParts;return p.top==='top-3'&&p.bottom==='bottom-2'&&(document.querySelector('.fw-model').dataset.src||'').includes('top-3')})
  const draftBefore=await game.evaluate(e=>JSON.stringify(e.__vue__.displayParts))
  await game.getByRole('button',{name:'查看全身',exact:true}).click();await game.getByRole('button',{name:'查看妆容',exact:true}).click();await game.getByRole('button',{name:'查看全身',exact:true}).click()
  assert.equal(await game.evaluate(e=>JSON.stringify(e.__vue__.displayParts)),draftBefore,'zoom changes no part of fitting draft')
  assert.equal((await save()).ownedParts.includes('top-3'),false)
  await game.getByRole('button',{name:'结束全部试戴',exact:true}).click()
  await page.screenshot({path:join(out,`${name}-${viewport.width}-fine.png`)})
  await page.locator('.fw-part-categories').getByRole('button',{name:'耳环',exact:true}).click()
  await game.getByRole('button',{name:'试戴珍珠耳坠',exact:true}).click()
  assert.equal((await save()).ownedParts.includes('earrings-0'),false,'preview cannot grant ownership')
  await page.locator('.fw-preview-action .fw-primary').click();await page.getByRole('button',{name:'确认解锁',exact:true}).click();assert.equal((await save()).coins,970)
  await page.locator('.fw-part-categories').getByRole('button',{name:'脸型',exact:true}).click();await game.getByRole('button',{name:'试戴柔和圆脸',exact:true}).click()
  await page.locator('.fw-part-categories').getByRole('button',{name:'眉毛',exact:true}).click();await game.getByRole('button',{name:'试戴弯月眉',exact:true}).click()
  await page.locator('.fw-part-categories').getByRole('button',{name:'口红',exact:true}).click();await game.getByRole('button',{name:'试戴莓果红',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('.fw-model').dataset.src.includes('lip-3'))
  await page.screenshot({path:join(out,`${name}-${viewport.width}-makeup.png`)})
  await game.getByRole('button',{name:'查看全身',exact:true}).click()
  await game.getByRole('button',{name:'♡ 收藏穿搭',exact:true}).click();assert.equal((await save()).albums.length,2)
  await game.getByRole('button',{name:'拍张照片',exact:true}).click();await page.waitForSelector('.fw-export');assert.ok(await page.locator('.fw-export').evaluate(i=>i.complete&&i.naturalWidth===900));await page.getByRole('button',{name:'关闭弹窗',exact:true}).click()
  await tab('工坊')
  const room=page.locator('.fw-playroom')
  const pairs=await room.evaluate(el=>{const a=el.__vue__.game.cards;return Array.from({length:6},(_,s)=>a.map((v,i)=>v===s?i:-1).filter(i=>i>=0))})
  for(const pair of pairs){await page.locator('.fw-memory-grid button').nth(pair[0]).click();await page.locator('.fw-memory-grid button').nth(pair[1]).click()}
  assert.equal((await save()).coins,1030);assert.equal((await save()).gameClaims.length,1)
  await room.getByRole('button',{name:'主题搭配',exact:true}).click()
  const before=await room.evaluate(e=>e.__vue__.game.brief)
  await room.getByRole('button',{name:'去搭配',exact:true}).click();await tab('工坊');assert.equal(await room.evaluate(e=>e.__vue__.game.brief),before,'styling brief survives wardrobe navigation')
  await room.getByRole('button',{name:'节奏缝纫',exact:true}).click()
  for(let i=0;i<6;i++){await page.waitForFunction(()=>{const g=document.querySelector('.fw-playroom').__vue__;return Math.abs(g.needle-.5)<.08});await room.getByRole('button',{name:'落针',exact:true}).dispatchEvent('pointerdown')}
  assert.ok((await save()).coins>=1075);assert.equal((await save()).gameClaims.length,2)
  await page.screenshot({path:join(out,`${name}-${viewport.width}-games.png`)})
  for(let i=0;i<4;i++){await page.setViewportSize(i%2?{width:390,height:844}:{width:844,height:390});await page.waitForTimeout(80);assert.ok(await page.locator('.fw-model').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let j=3;j<d.length;j+=4)if(d[j]>100)n++;return n>10000}))}
  await page.reload();await page.waitForFunction(()=>(document.querySelector('.fw-model').dataset.src||'').includes('lip-3'));assert.equal((await save()).look.parts.face,'face-1');assert.equal((await save()).look.parts.eyes,'eyes-2');assert.equal((await save()).look.parts.earrings,'earrings-0');assert.deepEqual(errors,[])
  await page.close()
 }}finally{await browser.close()}
}
console.log(JSON.stringify({passed:true,screenshots:out}))
