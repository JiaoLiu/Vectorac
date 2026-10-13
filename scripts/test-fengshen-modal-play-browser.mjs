import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createGame,catalog} from '../.private/fengshen/engine.mjs'
import {heroForBase} from '../.private/fengshen/theme.mjs'
import {hand} from './fixtures/sanguo.mjs'
// 弹窗（人物介绍/设置/图鉴等）只是浮层：打开后 AI 必须照常出牌、自动结束出牌照常触发，
// 不能像旧实现那样把整个调度链一起冻住（单机表现为「AI 不动了」，联机里空过回合还会拖住全场）。
function fixture(){
 const s=createGame({heroId:'yangjian',role:'lord',seed:17});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.turns=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
 return s
}
const b=await openBrowser({name:'gods-modal-play',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
// 用真实调度链注入牌局：只静音并清掉旧动画，不碰 schedule()，弹窗不打断的断言才有意义。
const inject=s=>b.evaluate(`(()=>{const u=window.__fengshenUI;clearTimeout(u.timer);u.voice.setEnabled(false);u.voice.stop();u.music.setEnabled(false);u.clearEffects();u.pace=650;u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return true})()`)
try{
 await b.viewport(812,375);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 // —— 场景一：AI 回合里打开人物介绍弹窗，AI 仍要继续出牌 ——
 const s=fixture();s.current=1;hand(s,1,'sha');hand(s,1,'tao');hand(s,1,'snatch');hand(s,2,'shan')
 const hero1=heroForBase(s.players[1].heroId).id
 await inject(s)
 const opened=await b.evaluate(`(()=>{window.__fengshenUI.openModal('hero-detail','${hero1}');return window.__fengshenUI.state.revision})()`)
 await sleep(3200)
 const after=await b.evaluate(`(()=>({revision:window.__fengshenUI.state.revision,modal:!!document.querySelector('.fs-modal')}))()`)
 assert.ok(after.modal,'AI 出牌期间弹窗保持打开')
 assert.ok(after.revision>opened,`弹窗打开后 AI 仍出牌（revision ${opened} → ${after.revision}）`)
 assert.deepEqual(b.errors,[])
 console.log(`PASS 弹窗打开不冻结 AI 出牌: revision ${opened} → ${after.revision}`)

 // —— 场景二：自己回合无牌可出时，弹窗打开也要自动进入弃牌阶段（联机里不拖住全场）——
 const empty=fixture(),hero2=heroForBase(empty.players[2].heroId).id
 await inject(empty)
 await b.evaluate(`window.__fengshenUI.openModal('hero-detail','${hero2}')`)
 await sleep(600)
 const ended=await b.evaluate(`(()=>({phase:window.__fengshenUI.state.phase,current:window.__fengshenUI.state.current,modal:!!document.querySelector('.fs-modal')}))()`)
 assert.ok(ended.modal,'自动结束出牌不关闭弹窗')
 assert.ok(ended.phase!=='play'||ended.current!==0,`弹窗打开时无牌可出照样自动结束出牌: ${JSON.stringify(ended)}`)
 assert.deepEqual(b.errors,[])
 console.log(`PASS 弹窗打开时自动结束出牌照常: ${JSON.stringify(ended)}`)
}finally{await b.close()}
