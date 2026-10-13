// Actual responsive CSS, read-only private fixtures; no rooms or feedback writes.
import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
import {CARDS_BY_TYPE} from '../site/.vuepress/components/fengshen/theme.mjs'
const b=await openBrowser({name:'gods-resources',route:'/games/fengshen/'})
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const n of [5,8])for(const [w,h,mobile]of [[932,430,true],[667,375,true],[568,320,true],[430,932,true],[430,932,false],[320,568,false]]){
  const s=createAssignedGame({roles:(n===5?['lord','loyal','rebel','rebel','renegade']:['lord','loyal','loyal','rebel','rebel','rebel','rebel','renegade']),heroIds:['yangjian','wenzhong','nezha','jinling','daji','jifa','hades','yuding'].slice(0,n),seed:23})
  Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:0,logs:[],lastPlayed:null})
  for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0};p.hp=p.seat===1?1:p.maxHp}
  for(const [seat,type]of [[0,'sha'],[0,'zixing'],[1,'shan'],[1,'tao'],[1,'sha'],[1,'bow'],[1,'bagua'],[1,'chitu'],[1,'dilu']]){const i=s.deck.findIndex(c=>c.type===type),c=s.deck.splice(i,1)[0],slot=CARDS_BY_TYPE[c.type]?.slot;if(slot)s.players[seat].equip[slot]=c;else s.players[seat].hand.push(c)}
  await b.viewport(w,h);await b.evaluate(`(()=>{const u=window.__fengshenUI;u.clearEffects();u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.viewport.setMobileOverride(${mobile});u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.auto=false;u.paused=false;u.reset();u.render();return true})()`)
  const stats=await b.evaluate(`(()=>{const node=document.querySelector('[data-player="1"]'),r=node.getBoundingClientRect(),metrics=node.querySelector('.fs-resources'),m=metrics.getBoundingClientRect(),eq=node.querySelector('.fs-opponent-equipment').getBoundingClientRect(),hp=node.querySelector('[data-resource="hp"]'),hand=node.querySelector('[data-resource="hand"]');return {text:metrics.textContent,hp:hp.getAttribute('aria-label'),hand:hand.getAttribute('aria-label'),tone:hp.dataset.hpTone,font:getComputedStyle(hp.querySelector('b')).fontSize,visible:m.left>=r.left&&m.right<=r.right+.5&&m.bottom<=r.bottom+.5&&m.top>=r.top,clearEquipment:Math.min(eq.right,m.right)<=Math.max(eq.left,m.left)+1||Math.min(eq.bottom,m.bottom)<=Math.max(eq.top,m.top)+1,own:document.querySelector('.fs-hand-heading .fs-resources').textContent}})()`)
  assert.equal(stats.hp,'血量 1/3');assert.equal(stats.hand,'手牌 3 张');assert.equal(stats.tone,'critical');assert.ok(parseFloat(stats.font)>=14);assert.ok(stats.visible,JSON.stringify(stats));if(!stats.clearEquipment)console.log('clearance failure screenshot',await b.screenshot('clearance-failure'));assert.ok(stats.clearEquipment,JSON.stringify(stats));assert.ok(stats.own.includes('血量'));assert.ok(stats.own.includes('手牌'))
  assert.ok(await b.evaluate(`(()=>{const row=document.querySelector('[data-player="1"] [data-resource="hand"]');row.querySelector('b').textContent='108';return row.scrollWidth<=row.clientWidth+1})()`),'three-digit count must not overflow its labeled badge')
  await b.tap('.fs-hand-card');await b.tap('[data-player="1"] .fs-player-main');assert.equal(await b.evaluate('window.__fengshenUI.targets[0]'),1)
  console.log('screenshot',await b.screenshot(n+'-players-'+w+'x'+h+(mobile?'':'-upright')))
 }
 assert.deepEqual(b.errors,[]);console.log('PASS 12 viewport/seat cases: labeled public HP/count, legible 3-digit numbers, equipment clearance, targeting, virtual landscape/upright portrait; NOT physical Safari')
}finally{await b.close()}
