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
   // 左右两家战区是下方战区旋转 90° 的镜像：棋子长边与铁路方向垂直。
   const tiles=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.width,r.height]};return {own:box('[data-node="0:0:0"] .jq-piece'),top:box('[data-node="2:0:0"] .jq-piece'),left:box('[data-node="1:0:0"] .jq-piece'),right:box('[data-node="3:0:0"] .jq-piece')}})
   assert.ok(tiles.own[0]>tiles.own[1]&&tiles.top[0]>tiles.top[1],'上下两家的棋子仍是横向')
   assert.ok(tiles.left[1]>tiles.left[0]&&tiles.right[1]>tiles.right[0],'左右两家的棋子竖放，与上下不同')
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
   // 出征先掷骰定先手，落定后自动收起覆盖层并开局。
   await page.waitForSelector('.jq-dice')
   assert.equal(await page.locator('.jq-dice-rows').first().locator('li').count(),4,'第一轮四方各掷一次')
   await page.locator('.jq-dice').screenshot({path:join(out,`${name}-${viewport.width}-dice.png`)})
   await page.waitForFunction(()=>document.querySelector('.jq-dice')&&document.querySelector('.jq-dice').classList.contains('is-settled'))
   const dice=await page.evaluate(()=>{
    const rounds=[...document.querySelectorAll('.jq-dice-rows')].map(ul=>[...ul.querySelectorAll('li')].map(li=>({army:li.querySelector('.jq-dice-army').textContent,sum:Number(li.querySelector('strong').textContent),first:li.classList.contains('is-first')})))
    const last=rounds[rounds.length-1]
    return {rounds:rounds.length,marked:last.filter(r=>r.first).length,winner:last.find(r=>r.first),best:Math.max(...last.map(r=>r.sum))}
   })
   assert.equal(dice.marked,1,'只有一家被标记为先手')
   assert.ok(dice.winner,'决胜轮必须分出先手')
   assert.equal(dice.winner.sum,dice.best,'先手是决胜轮里点数最高的一家')
   assert.equal(await page.locator('.jq-dice-msg').innerText(),dice.rounds>1?`${dice.winner.army}掷出 ${dice.winner.sum} 点取得先手（并列最高点重掷 ${dice.rounds-1} 次）`:`${dice.winner.army}掷出 ${dice.winner.sum} 点取得先手`)
   await page.waitForFunction(()=>document.querySelector('.jq-game').__vue__.game.phase==='play')
   assert.equal(await page.locator('.jq-dice').count(),0)
   const winner=dice.winner.army
   assert.ok(await page.evaluate(a=>document.querySelector('.jq-game').__vue__.game.logs.some(l=>l.startsWith(a+'掷骰得先手')),winner))
   assert.ok(await page.locator('.jq-mode-trigger').isDisabled())
   // 先手可能不是己方：等轮到自己再走子。
   await page.waitForFunction(()=>document.querySelector('.jq-game').__vue__.game.turn===0,{},{timeout:15000})
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
