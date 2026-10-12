import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,militaryCatalog,dispatch} from '../.private/fengshen/engine.mjs'
// 濒死自救时，若手里只有「琼浆（酒）」而没有仙桃：pending.as 固定是 tao，合法响应的 as 却是 wine。
// 旧 UI 把声明当成 tao 去匹配，导致选中琼浆后「确认救援」按钮永远 disabled、也无法提交。
function fixture(){
 const s=createAssignedGame({heroIds:['jifa','juliusun','nezha','yangjian','jinling'],roles:['lord','loyal','rebel','rebel','renegade'],seed:23,deckVersion:2})
 Object.assign(s,{deck:militaryCatalog.makeDeck(),discard:[],processing:[],queue:[],harvestPool:[],pending:null,phase:'play',current:1,turns:0,logs:[],winner:null})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0};p.alive=true;p.chained=false;delete p.faceDown}
 const take=t=>{const i=s.deck.findIndex(c=>c.type===t);assert.ok(i>=0,t);return s.deck.splice(i,1)[0]}
 const sha=take('sha'),wine=take('wine')
 s.players[1].hand.push(sha);s.players[0].hand.push(wine);s.players[0].hp=1
 let r=dispatch(s,{type:'play',as:'sha',ids:[sha.id],targets:[0],seat:1,revision:s.revision})
 assert.ok(r.ok,r.error)
 r=dispatch(r.state,{type:'pass',seat:0,revision:r.state.revision})
 assert.ok(r.ok,r.error)
 const st=r.state
 assert.equal(st.pending.kind,'rescue','进入濒死救援')
 assert.equal(st.pending.actor,0,'向濒死的自己询问自救')
 st.publicReveal=null;st.lastPlayed=null;st.lastResponse=null
 return {s:st,wineId:wine.id}
}
const b=await openBrowser({name:'gods-rescue-wine',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
try{
 await b.viewport(812,375);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 const {s,wineId}=fixture()
 await b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();u.onViewport();return true})()`)
 await b.waitFor('!!document.querySelector(\'.fs-response-controls button[data-action="confirm"]\')')
 const prompt=await b.evaluate(`(document.querySelector('.fs-status strong')||{}).textContent||''`)
 assert.ok(prompt.includes('琼浆'),'提示按实际可用牌点名琼浆，而不是只写仙桃: '+JSON.stringify(prompt))
 const disabledBefore=await b.evaluate(`document.querySelector('.fs-response-controls button[data-action="confirm"]').disabled`)
 assert.equal(disabledBefore,true,'未选牌时确认救援不可点')
 await b.evaluate(`document.querySelector('.fs-hand-card[data-id="'+${JSON.stringify(wineId)}+'"]').click()`)
 await b.waitFor('!document.querySelector(\'.fs-response-controls button[data-action="confirm"]\').disabled')
 const ready=await b.evaluate(`(()=>{const u=window.__fengshenUI,btn=document.querySelector('.fs-response-controls button[data-action="confirm"]');return {disabled:btn.disabled,text:btn.textContent,selected:u.selected.slice()}})()`)
 assert.equal(ready.disabled,false,'选中琼浆后确认救援可点: '+JSON.stringify(ready))
 assert.ok(ready.text.includes('救援'),'按钮文案为确认救援: '+JSON.stringify(ready))
 await b.evaluate(`document.querySelector('.fs-response-controls button[data-action="confirm"]').click()`)
 await b.waitFor(`window.__fengshenUI.state.players[0].hp>0`)
 const after=await b.evaluate(`(()=>{const u=window.__fengshenUI;return {hp:u.state.players[0].hp,pending:u.state.pending&&u.state.pending.kind||null,wineInHand:u.state.players[0].hand.some(c=>c.id===${JSON.stringify(wineId)})}})()`)
 assert.equal(after.hp,1,'琼浆自救回复一点体力: '+JSON.stringify(after))
 assert.equal(after.wineInHand,false,'琼浆已作为代价离手: '+JSON.stringify(after))
 assert.deepEqual(b.errors,[])
 console.log('PASS 濒死时用琼浆自救可选中并确认: '+JSON.stringify({prompt,after}))
}finally{await b.close()}