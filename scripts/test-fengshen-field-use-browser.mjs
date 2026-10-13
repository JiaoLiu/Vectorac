import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
// 仙田（惧留孙/屯田积累的公开仙田）既是减距离的状态，也是觉醒后「当摄宝（探囊取物）使用」的代价。
// 引擎允许该出牌路径，但此前 UI 没有入口、仙田标记也因 pointer-events:none 点不到。
// 现在把自己的仙田标记渲染为可点击按钮，点击即触发 jixi（夺域）的摄宝流程（选一张仙田 → 选目标）。
function fixture(){
 const s=createAssignedGame({heroIds:['juliusun','jifa','nezha','yangjian','jinling'],roles:['lord','loyal','rebel','rebel','renegade'],seed:23})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],harvestPool:[],pending:null,phase:'play',current:0,turns:0,logs:[],winner:null})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0};p.alive=true;p.chained=false;delete p.faceDown}
 const d=s.deck;s.players[0].persistent={zaoxian:true};s.players[0].gainedSkills=['jixi']
 s.players[0].fieldPile=[d.shift(),d.shift(),d.shift()]
 s.players[2].hand.push(d.shift())
 return s
}
const inject=async(s)=>`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();u.onViewport();return true})()`
const b=await openBrowser({name:'gods-field-use',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
try{
 await b.viewport(812,375);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 await b.evaluate(await inject(fixture()))
 await b.waitFor('!!document.querySelector(\'.fs-state-marks .fs-field-mark[data-action="field-use"]\')')
 const mark=await b.evaluate(`(()=>{const e=document.querySelector('.fs-state-marks .fs-field-mark[data-action="field-use"]');return {text:e.textContent,pe:getComputedStyle(e).pointerEvents}})()`)
 assert.ok(mark.text.includes('田3'),'仙田标记显示田的张数: '+JSON.stringify(mark))
 assert.equal(mark.pe,'auto','仙田标记可点击（pointer-events:auto）: '+JSON.stringify(mark))
 await b.evaluate(`document.querySelector('.fs-state-marks .fs-field-mark[data-action="field-use"]').click()`)
 await b.waitFor('!!document.querySelector(".fs-ext-choice")')
 const pick=await b.evaluate(`(()=>{const u=window.__fengshenUI,d=document.querySelector('.fs-ext-choice');return {kind:u.state.pending&&u.state.pending.kind,header:d?d.querySelector('header strong').textContent:'',options:(d||{querySelectorAll:()=>[]}).querySelectorAll('.fs-choice-card').length,confirm:!!(d&&d.querySelector('[data-action="panel-confirm"]'))}})()`)
 assert.equal(pick.kind,'ext','点击仙田进入扩展选择流程: '+JSON.stringify(pick))
 assert.ok(pick.header.includes('仙田'),'提示点明在选仙田: '+JSON.stringify(pick))
 assert.equal(pick.options,3,'列出三张可当摄宝使用的仙田: '+JSON.stringify(pick))
 assert.ok(pick.confirm,'提供确认按钮以继续选目标: '+JSON.stringify(pick))
 assert.deepEqual(b.errors,[])
 console.log('PASS 仙田标记可作为摄宝入口: '+JSON.stringify({mark:mark.text,header:pick.header,options:pick.options}))

 // 未觉醒（无 jixi）时仙田仍显示，但点击应给出提示而非静默失败。
 const raw=fixture();delete raw.players[0].gainedSkills;raw.players[0].persistent={}
 await b.evaluate(await inject(raw))
 await b.waitFor('!!document.querySelector(\'.fs-state-marks .fs-field-mark[data-action="field-use"]\')')
 await b.evaluate(`document.querySelector('.fs-state-marks .fs-field-mark[data-action="field-use"]').click()`)
 await b.waitFor('!!document.querySelector(".fs-toast")')
 const toast=await b.evaluate(`(()=>{const u=window.__fengshenUI;return {kind:u.state.pending&&u.state.pending.kind||null,text:(document.querySelector('.fs-toast')||{}).textContent||''}})()`)
 assert.equal(toast.kind,null,'未觉醒时不会误入扩展流程: '+JSON.stringify(toast))
 assert.ok(toast.text.includes('觉醒'),'未觉醒给出觉醒提示: '+JSON.stringify(toast))
 assert.deepEqual(b.errors,[])
 console.log('PASS 未觉醒仙田点击给出提示: '+JSON.stringify({toast:toast.text}))
}finally{await b.close()}