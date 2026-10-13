import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,militaryCatalog,playerView} from '../site/.vuepress/components/fengshen/engine.mjs'
// 落宝（赵公明的奇袭：黑牌当【过河拆桥】）拆牌时，被拆掉的牌必须摆在出牌行旁边，
// 不能像旧横屏那样绝对居中盖住技能牌；出牌行为空时弃置牌仍照旧居中压中线。
function fixture(){
 const s=createAssignedGame({heroIds:['zhaogongming','jifa','nezha','yangjian','jinling'],roles:['lord','loyal','rebel','rebel','renegade'],seed:23,deckVersion:2})
 Object.assign(s,{deck:militaryCatalog.makeDeck(),discard:[],processing:[],queue:[],harvestPool:[],pending:null,phase:'play',current:0,turns:0,logs:[],winner:null})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0};p.alive=true;p.chained=false}
 const take=t=>{const i=s.deck.findIndex(c=>c.type===t);assert.ok(i>=0,t);return s.deck.splice(i,1)[0]}
 const black=take('sha'),weapon=take('guding')
 s.players[0].hand.push(black);s.players[1].equip.weapon=weapon
 const play=playerView(s,0).legal.find(a=>a.as==='dismantle'&&a.targets.includes(1))
 assert.ok(play,'赵公明可用黑牌当拆使用')
 return {s,weapon,play,seat2Card:s.deck.find(c=>c.type==='sha')}
}
const geometry=`(function(){var tc=document.querySelector('.fs-table-center'),R=e=>e?e.getBoundingClientRect():null,t=R(document.querySelector('.fs-table-trail .fs-card-play')),d=R(document.querySelector('.fs-public-discard .fs-card-play')),c=R(tc),dd=document.querySelector('.fs-public-discard');return {cls:tc.className,dir:getComputedStyle(tc).flexDirection,pos:dd?getComputedStyle(dd).position:null,centerX:Math.round(c.left+c.width/2),discCX:d?Math.round(d.left+d.width/2):null,trailLeft:t?Math.round(t.left):null,trailRight:t?Math.round(t.right):null,discLeft:d?Math.round(d.left):null,discRight:d?Math.round(d.right):null,pairMid:t&&d?Math.round((t.left+d.right)/2):null,overlap:!!(t&&d&&t.left<d.right&&d.left<t.right&&t.top<d.bottom&&d.top<t.bottom)}})()`
const b=await openBrowser({name:'gods-dismantle-cue',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
try{
 await b.viewport(812,375);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 const {s,weapon,play,seat2Card}=fixture()
 await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();u.onViewport();return true})()`)
 await b.evaluate(`window.__fengshenUI.act(${JSON.stringify({...play,seat:0})})`)
 await b.waitFor('window.__fengshenUI.state.pending&&window.__fengshenUI.state.pending.kind==="take"')
 await b.evaluate(`window.__fengshenUI.act(${JSON.stringify({type:'choose',value:weapon.id,seat:0})})`)
 await b.waitFor('!!document.querySelector(".fs-public-discard")')
 await sleep(700)
 const a=await b.evaluate(geometry)
 assert.ok(a.cls.includes('fs-has-trail')&&a.cls.includes('fs-discard-small'),'同屏时标记出牌行仍在且只弃一两张: '+JSON.stringify(a))
 assert.equal(a.dir,'row','横屏同屏时出牌行与弃置牌并排: '+JSON.stringify(a))
 assert.equal(a.overlap,false,'被拆掉的牌不覆盖技能牌: '+JSON.stringify(a))
 assert.ok(a.discLeft>=a.trailRight,'弃置牌落在出牌行右侧: '+JSON.stringify(a))
 assert.ok(Math.abs(a.centerX-a.pairMid)<=2,'两张牌整体居中，不偏出中线: '+JSON.stringify(a))
 assert.deepEqual(b.errors,[])
 console.log('PASS 落宝拆牌与被拆牌并排不覆盖: '+JSON.stringify(a))

 // 出牌行为空时，弃置牌仍绝对居中压中线（保持原有观感）：换一副全新的牌局状态（无出牌记录）只留这次弃置。
 const fresh=fixture().s
 await b.evaluate(`(()=>{const u=window.__fengshenUI;u.clearEffects();u.state=${JSON.stringify(fresh)};u.tableTrail=[];u.discards={seat:1,by:0,cards:[${JSON.stringify(seat2Card)}],chainKey:null,until:Date.now()+30000};u.reset();u.render();u.onViewport();return true})()`)
 await sleep(500)
 const c=await b.evaluate(geometry)
 assert.ok(!c.cls.includes('fs-has-trail'),'无出牌行时不并排: '+JSON.stringify(c))
 assert.equal(c.dir,'column','无出牌行时仍为竖排: '+JSON.stringify(c))
 assert.equal(c.pos,'absolute','无出牌行时弃置牌仍绝对居中: '+JSON.stringify(c))
 assert.equal(c.centerX,c.discCX,'弃置牌居中压中线: '+JSON.stringify(c))
 assert.deepEqual(b.errors,[])
 console.log('PASS 无出牌行时弃置牌仍居中: '+JSON.stringify(c))
}finally{await b.close()}