import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const require=createRequire(import.meta.url),{chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright')
const out=await mkdtemp(join(tmpdir(),'junqi-review-'))
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})})
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}]){
   const page=await browser.newPage({viewport}),errors=[]
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>{errors.push('unexpected native dialog: '+dialog.message());dialog.dismiss()})
   await page.route('**/*',r=>{const u=r.request().url();return /^https?:/.test(u)&&!u.startsWith('http://127.0.0.1:8080')?r.abort():r.continue()})
   await page.goto('http://127.0.0.1:8080/blogs/other/junqi.html')
   await page.waitForSelector('.jq-site',{timeout:60000})
   await page.waitForFunction(()=>document.querySelector('.jq-game').__vue__&&document.querySelector('.jq-game').__vue__.game)
   await page.waitForTimeout(2200) // Theme loading mask fades after route mount.
   assert.equal(await page.locator('.jq-site').count(),129)
   assert.equal(await page.locator('.jq-piece').count(),100)
   assert.equal(await page.locator('.jq-piece text').count(),25)
   if(viewport.width<900){
    const sizes=await page.evaluate(()=>{const w=document.querySelector('.jq-board-window'),s=document.querySelector('.jq-board');return {window:w.clientWidth,board:s.getBoundingClientRect().width,scroll:w.scrollTop}})
    assert.ok(sizes.board>=700&&sizes.board>sizes.window);assert.ok(sizes.scroll>0)
   }
   assert.match(await page.locator('.jq-mode-trigger').innerText(),/四暗/)
   await page.locator('.jq-mode-trigger').click()
   const dialog=page.getByRole('dialog',{name:'棋子可见模式'})
   await dialog.waitFor()
   assert.ok((await dialog.boundingBox()).width>=Math.min(320,viewport.width-32))
   for(const option of await page.locator('.jq-mode-option').all())assert.ok((await option.boundingBox()).height>=70)
   await dialog.screenshot({path:join(out,`${name}-${viewport.width}-mode.png`)})
   await page.locator('.jq-mode-option').filter({hasText:'双明'}).click()
   assert.equal(await page.locator('.jq-piece text').count(),50)
   await page.locator('.jq-mode-trigger').click()
   await page.locator('.jq-mode-option').filter({hasText:'四暗'}).click()
   assert.equal(await page.locator('.jq-piece text').count(),25)
   await page.locator('.jq-game').screenshot({path:join(out,`${name}-${viewport.width}-default.png`)})
   await page.getByRole('button',{name:'音乐 开',exact:true}).click()
   await page.getByRole('button',{name:'音乐 关',exact:true}).click()
   await page.getByRole('button',{name:'音效 开',exact:true}).click()
   await page.getByRole('button',{name:'音效 关',exact:true}).click()
   // Overview for deterministic coordinate clicks; default phone view is enlarged.
   if(viewport.width<900)await page.getByRole('button',{name:'全局总览',exact:true}).click()
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'page has no horizontal overflow')
   await page.locator('.jq-game').screenshot({path:join(out,`${name}-${viewport.width}-setup.png`)})
   const before=await page.evaluate(()=>document.querySelector('.jq-game').__vue__.game.pieces.find(p=>p.pos==='0:0:0').id)
   await page.locator('[data-node="0:0:0"]').click();await page.locator('[data-node="0:0:1"]').click()
   assert.equal(await page.evaluate(()=>document.querySelector('.jq-game').__vue__.game.pieces.find(p=>p.pos==='0:0:1').id),before)
   await page.getByRole('button',{name:'保存阵型',exact:true}).click()
   await page.getByRole('button',{name:/完成调度/}).click()
   if(await page.getByRole('dialog',{name:'确认出征'}).count())await page.getByRole('button',{name:'确认',exact:true}).click()
   await page.waitForFunction(()=>document.querySelector('.jq-game').__vue__.game.phase==='play')
   assert.ok(await page.locator('.jq-mode-trigger').isDisabled())
   // Front-row piece always has a railway exit (only mobile types may deploy there).
   await page.locator('[data-node="0:0:0"]').click()
   const target=await page.evaluate(()=>document.querySelector('.jq-game').__vue__.destinations[0])
   assert.ok(target);await page.locator(`[data-node="${target}"]`).click()
   assert.equal(await page.getByRole('button',{name:/暂停对局|继续对局/}).count(),0)
   // Simulated backgrounding must resume automatically, without a pause button.
   await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__jqHidden});window.__jqHidden=true;document.dispatchEvent(new Event('visibilitychange'))})
   const turns=await page.evaluate(()=>document.querySelector('.jq-game').__vue__.game.turns)
   await page.waitForTimeout(800)
   assert.equal(await page.evaluate(()=>document.querySelector('.jq-game').__vue__.game.turns),turns)
   await page.evaluate(()=>{window.__jqHidden=false;document.dispatchEvent(new Event('visibilitychange'))})
   await page.waitForFunction(()=>document.querySelector('.jq-game').__vue__.game.turn===0,{},{timeout:15000})
   assert.ok(await page.evaluate(()=>document.querySelector('.jq-game').__vue__.game.turns>=4))
   await page.getByRole('button',{name:'我方投降',exact:true}).click()
   await page.getByRole('dialog',{name:'确认投降'}).waitFor()
   await page.getByRole('button',{name:'取消',exact:true}).click()
   assert.ok(await page.evaluate(()=>document.querySelector('.jq-game').__vue__.game.alive[0]))
   await page.getByRole('button',{name:'重新布阵',exact:true}).click()
   await page.getByRole('dialog',{name:'重新布阵'}).waitFor()
   await page.getByRole('button',{name:'取消',exact:true}).click()
   await page.getByRole('button',{name:'全屏',exact:true}).click()
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden')
   const full=await page.locator('.jq-game').boundingBox()
   assert.ok(Math.abs(full.x)<2&&Math.abs(full.y)<2&&Math.abs(full.height-viewport.height)<2,'fullscreen is viewport-relative, not the animated article container')
   if(viewport.width<900){await page.getByRole('button',{name:'放大棋盘',exact:true}).click();await page.getByRole('button',{name:'回到己方',exact:true}).click()}
   await page.locator('.jq-game').screenshot({path:join(out,`${name}-${viewport.width}-play.png`)})
   await page.getByRole('button',{name:'退出全屏',exact:true}).click()
   assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden')
   await page.reload();await page.getByRole('button',{name:'继续上次对局',exact:true}).click()
   assert.equal(await page.evaluate(()=>document.querySelector('.jq-game').__vue__.game.phase),'play')
   assert.ok(await page.evaluate(()=>document.querySelector('.jq-game').__vue__.game.turns>=4))
   assert.deepEqual(errors,[]);await page.close()
  }
 }finally{await browser.close()}
}
console.log(JSON.stringify({passed:true,screenshots:out}))
