// 妖言（旧于吉·蛊惑）声明选牌弹窗浏览器回归：
// ⓪各分辨率下弹窗虚拟卡面无点数角标、卡名不溢出牌列；
// ①出牌阶段点「妖言」弹出无点数虚拟卡面弹窗，点选→发动→扣置上桌进入质疑；
// ②濒死救援窗的声明按钮打开同一弹窗，列仙桃/琼浆，再点已选卡面可直接发动；
// ③弹窗只是浮层，不冻结「结束出牌」与自动结束出牌（maybeAutoEnd 不看弹窗状态）。
import assert from 'node:assert/strict'
import {rm} from 'node:fs/promises'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,dispatch,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
function fixture(){
 const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['shengongbao','jifa','nezha','dixin','jinling'],seed:23})
 s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.turns=1;s.lastPlayed=null;s.lastResponse=null;s.exchange=null;s.publicReveal=null;s.logs=[]
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp;p.alive=true}
 return s
}
const give=(s,seat,type,suit=null)=>{const i=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit));assert.ok(i>=0,`牌堆缺 ${type}`);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,`dispatch ${JSON.stringify(a)}: ${r.error}`);return r.state}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const b=await openBrowser({name:'gods-guhuo',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
const inject=s=>b.evaluate(`(()=>{const u=window.__fengshenUI;clearTimeout(u.timer);u.schedule=()=>{};u.voice.setEnabled(false);u.voice.stop();u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return true})()`)
const state=()=>b.evaluate('JSON.parse(JSON.stringify(window.__fengshenUI.state))')
const status=()=>b.evaluate('document.querySelector(".fs-status strong")?.textContent||""')
try{
 await b.viewport(812,375);await b.navigate();await b.waitFor('!!window.__fengshenUI')

 // 横竖屏都要完整显示牌名；虚拟横屏旋转后，逻辑纵向对应物理横向。
 for(const [width,height] of [[932,430],[568,320],[390,844]]){
  await b.viewport(width,height)
  const sample=fixture();give(sample,0,'shan');give(sample,0,'tao');await inject(sample)
  await b.tap('.fs-skill[data-action="guhuo"]');await sleep(100)
  const bounds=await b.evaluate(`(()=>{const panel=document.querySelector('.fs-guhuo-choice'),list=panel.querySelector('.fs-center-card-list').getBoundingClientRect(),rotated=document.querySelector('.fs-app').classList.contains('fs-force-landscape');return [...panel.querySelectorAll('.fs-card-design>strong')].map(e=>{const r=e.getBoundingClientRect();return {name:e.textContent,start:rotated?r.left:r.top,end:rotated?r.right:r.bottom,listStart:rotated?list.left:list.top,listEnd:rotated?list.right:list.bottom}})})()`)
  assert.ok(bounds.length>0,'声明牌名存在')
  for(const r of bounds)assert.ok(r.start>=r.listStart-1&&r.end<=r.listEnd+1,`${width}x${height}: ${JSON.stringify(r)}`)
  const button=await b.evaluate(`(()=>{const r=document.querySelector('.fs-guhuo-choice [data-action="guhuo-confirm"]').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`)
  assert.ok(button.left>=0&&button.top>=0&&button.right<=button.width&&button.bottom<=button.height,'发动按钮在屏内')
  console.log(`PASS ${width}x${height}: complete declared card titles and reachable confirmation`)
 }
 await b.viewport(812,375)

 // —— 场景一：出牌阶段点「妖言」，弹窗选「杀」发动后扣置上桌 ——
 let s=fixture();const fake=give(s,0,'shan');give(s,0,'tao')
 await inject(s);await sleep(400)
 await b.tap('.fs-skill[data-action="guhuo"]');await sleep(300)
 const popup=await b.evaluate(`(()=>{const p=document.querySelector('.fs-guhuo-choice');if(!p)return null;return {types:[...p.querySelectorAll('[data-action="guhuo-choice"]')].map(n=>n.dataset.value),ranks:[...p.querySelectorAll('.fs-rank')].map(n=>n.textContent.trim()),confirmDisabled:p.querySelector('[data-action="guhuo-confirm"]').disabled}})()`)
 assert.ok(popup,'点「妖言」弹出声明弹窗')
 assert.ok(popup.types.includes('sha')&&popup.types.length>=3,'弹窗列出一堆可声明牌型: '+popup.types.join(','))
 assert.ok(!popup.types.includes('shan')&&!popup.types.includes('dilu'),'出牌阶段不列闪与装备')
 assert.ok(popup.ranks.length&&popup.ranks.every(r=>r===''),'虚拟卡面无点数花色')
 assert.equal(popup.confirmDisabled,true,'未选中时「发动」禁用')
 await b.tap('[data-action="guhuo-choice"][data-value="sha"]');await sleep(200)
 const picked=await b.evaluate(`(()=>{const p=document.querySelector('.fs-guhuo-choice');return {selected:!!p.querySelector('[data-value="sha"].selected'),disabled:p.querySelector('[data-action="guhuo-confirm"]').disabled}})()`)
 assert.equal(picked.selected,true,'卡面选中高亮')
 assert.equal(picked.disabled,false,'选中后「发动」可用')
 await b.tap('[data-action="guhuo-confirm"]');await sleep(300)
 assert.ok(!(await b.evaluate('!!document.querySelector(".fs-guhuo-choice")')),'发动后弹窗关闭')
 assert.ok((await status()).includes('妖言'),'提示语引导声明: '+await status())
 assert.ok((await b.evaluate('window.__fengshenUI.guhuoMode'))===true)
 assert.ok((await b.evaluate(`document.querySelector('.fs-skill[data-action="guhuo"] small').textContent`)).includes('已声明'),'技能按钮显示已声明')
 await b.tap(`.fs-hand-card[data-id="${fake.id}"]`);await sleep(200)
 assert.equal(await b.evaluate('window.__fengshenUI.as'),'sha','选牌不丢已声明牌型')
 await b.tap('[data-player="1"] .fs-player-main');await sleep(200)
 await b.tap('.fs-actions [data-action="confirm"]');await sleep(600)
 s=await state()
 assert.equal(s.pending?.stage,'question','扣置上桌，进入质疑流程')
 assert.deepEqual(b.errors,[])

 // —— 场景二：濒死救援窗，声明按钮打开同一弹窗列仙桃/琼浆 ——
 s=fixture();s.current=1;const tao=give(s,0,'tao');give(s,0,'draw');const attack=give(s,1,'sha');s.players[0].hp=1
 s=step(s,{type:'play',as:'sha',ids:[attack.id],targets:[0]})
 s=step(s,{type:'pass'})
 assert.equal(s.pending?.kind,'rescue','进入濒死救援窗')
 await inject(s);await sleep(400)
 await b.tap('.fs-response-controls [data-action="guhuo"]');await sleep(300)
 const rescue=await b.evaluate(`(()=>{const p=document.querySelector('.fs-guhuo-choice');return p?[...p.querySelectorAll('[data-action="guhuo-choice"]')].map(n=>n.dataset.value):null})()`)
 assert.deepEqual(rescue,['tao','wine'],'救援窗只列仙桃与琼浆: '+JSON.stringify(rescue))
 await b.tap('[data-action="guhuo-choice"][data-value="wine"]');await sleep(150)
 await b.tap('[data-action="guhuo-choice"][data-value="wine"]');await sleep(250)
 assert.equal(await b.evaluate('window.__fengshenUI.guhuoMode'),true,'再点已选卡面直接发动')
 assert.equal(await b.evaluate('window.__fengshenUI.as'),'wine','声明为琼浆')
 assert.ok(!(await b.evaluate('!!document.querySelector(".fs-guhuo-choice")')),'发动后弹窗关闭')
 await b.tap(`.fs-hand-card[data-id="${tao.id}"]`);await sleep(200)
 const ready=await b.evaluate(`(()=>{const btn=document.querySelector('.fs-response-controls [data-action="confirm"]');return {disabled:btn.disabled,label:btn.textContent.trim()}})()`)
 assert.equal(ready.disabled,false,'声明琼浆后确认救援可用')
 assert.ok(ready.label.includes('妖言'),'确认按钮标注妖言: '+ready.label)
 await b.tap('.fs-response-controls [data-action="confirm"]');await sleep(500)
 s=await state()
 assert.equal(s.pending?.stage,'question','扣置救援牌进入质疑')
 assert.deepEqual(b.errors,[])

 // —— 场景三：弹窗只是浮层，不冻结结束出牌与自动结束出牌 ——
 s=fixture();give(s,0,'shan')
 await inject(s);await sleep(300)
 await b.tap('.fs-skill[data-action="guhuo"]');await sleep(250)
 assert.ok(await b.evaluate('!!document.querySelector(".fs-guhuo-choice")'),'弹窗打开')
 await b.tap('.fs-actions [data-action="end"]');await sleep(400)
 const ended=await state()
 assert.ok(ended.phase!=='play'||ended.current!==0,'弹窗开着照样结束自己的出牌阶段')
 assert.equal(await b.evaluate('window.__fengshenUI.guhuoChoice'),false,'结束出牌后弹窗状态清空')
 const empty=fixture()
 const auto=await b.evaluate(`(()=>{const u=window.__fengshenUI;clearTimeout(u.timer);u.state=${JSON.stringify(empty)};u.lobby=false;u.paused=false;u.auto=false;u.guhuoChoice=true;u.autoEndFor=null;u.maybeAutoEnd();return {phase:u.state.phase,current:u.state.current}})()`)
 assert.ok(auto.phase!=='play'||auto.current!==0,`弹窗状态不拦截自动结束出牌: ${JSON.stringify(auto)}`)
 assert.deepEqual(b.errors,[])

 // —— 场景四：回合外单响应窗口（被杀出闪），操作按钮区直接给「妖言」按钮，
 //     不必再回人物左下角的技能条小按钮（此前只有技能条一个入口）——
 s=fixture();s.current=1;const junk=give(s,0,'sha');const enemySlash=give(s,1,'sha')
 s=step(s,{type:'play',as:'sha',ids:[enemySlash.id],targets:[0]})
 assert.equal(s.pending?.kind,'response','进入出闪响应窗')
 await inject(s);await sleep(400)
 const bar=await b.evaluate(`(()=>{const btn=document.querySelector('.fs-skill-actions [data-action="guhuo"]');return btn?btn.textContent.trim():null})()`)
 assert.ok(bar,'回合外响应窗的操作区有妖言按钮: '+bar)
 await b.tap('.fs-skill-actions [data-action="guhuo"]');await sleep(300)
 const single=await b.evaluate(`(()=>{const p=document.querySelector('.fs-guhuo-choice');return p?[...p.querySelectorAll('[data-action="guhuo-choice"]')].map(n=>n.dataset.value):null})()`)
 assert.deepEqual(single,['shan'],'响应窗只列可声明的闪: '+JSON.stringify(single))
 await b.tap('[data-action="guhuo-choice"][data-value="shan"]');await sleep(150)
 await b.tap('[data-action="guhuo-choice"][data-value="shan"]');await sleep(250)
 assert.equal(await b.evaluate('window.__fengshenUI.guhuoMode'),true,'声明为闪')
 await b.tap(`.fs-hand-card[data-id="${junk.id}"]`);await sleep(200)
 await b.tap('.fs-actions [data-action="confirm"]');await sleep(500)
 assert.equal((await state()).pending?.stage,'question','假闪扣置上桌进入质疑')
 assert.deepEqual(b.errors,[])
 console.log('PASS 妖言声明弹窗浏览器回归')
}finally{await b.close();await rm(b.output,{recursive:true,force:true})}
