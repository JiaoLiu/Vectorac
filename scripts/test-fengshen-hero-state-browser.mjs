import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../.private/fengshen/engine.mjs'
function fixture(own='yangjian',other='jifa'){
 const s=createAssignedGame({heroIds:[own,other,'nezha','jinling','daji'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37});Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],pending:null,phase:'play',current:0,lastPlayed:null,lastResponse:null,exchange:null,publicReveal:null,logs:[]});for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0}}return s
}
const take=(s,type,seat)=>{const i=s.deck.findIndex(c=>c.type===type);assert.ok(i>=0,type);const c=s.deck.splice(i,1)[0];if(seat!=null)s.players[seat].hand.push(c);return c}
const b=await openBrowser({name:'gods-live-hero-status',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
const load=s=>b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return true})()`)
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[932,430],[812,375],[390,844]]){
  await b.viewport(w,h);let s=fixture(),c=take(s,'indulgence',0);s.players[1].equip.defenseHorse=take(s,'dilu');s.players[2].equip.defenseHorse=take(s,'jueying');await load(s)
  await b.tap(`.fs-hand-card[data-id="${c.id}"]`);await b.tap('[data-player="1"] .fs-player-main');assert.equal(await b.evaluate('window.__fengshenUI.targets[0]'),1)
  await b.tap('[data-player="2"] .fs-player-main');assert.equal(await b.evaluate('window.__fengshenUI.targets[0]'),2,'distant defensive-horse target still legal')
  await b.tap('.fs-actions [data-action="confirm"]');assert.equal(await b.evaluate(`window.__fengshenUI.state.players[2].judgment.some(c=>c.id===${JSON.stringify(c.id)})`),true)
  s=fixture('yangjian','kongxuan');c=take(s,'indulgence',0);s.players[1].equip.defenseHorse=take(s,'dilu');await load(s);await b.tap(`.fs-hand-card[data-id="${c.id}"]`);await b.tap('[data-player="1"] .fs-player-main');assert.equal(await b.evaluate('window.__fengshenUI.modal'),null);assert.match(await b.evaluate('window.__fengshenUI.toast'),/免疫迷魂阵/)
  s=fixture('apollo');s.players[0].faceDown=true;await load(s);await b.tap('.fs-own-skills [data-value="jiushi"]');assert.equal(await b.evaluate('window.__fengshenUI.modal'),null);assert.match(await b.evaluate('window.__fengshenUI.toast'),/不能主动.*翻正/)
  s=fixture('apollo');s.current=1;s.players[0].faceDown=true;const sha=take(s,'sha',1);await load(s);await b.evaluate(`window.__fengshenUI.act({seat:1,type:'play',as:'sha',ids:[${JSON.stringify(sha.id)}],targets:[0]});true`)
  await b.waitFor('window.__fengshenUI.state.pending?.skill==="jiushi-back"&&!document.querySelector(".fs-dock").inert')
  assert.equal(await b.evaluate('document.querySelector(".fs-own-skills [data-value=jiushi]").dataset.action'),'skill-trigger');await b.tap('.fs-own-skills [data-value="jiushi"]');assert.equal(await b.evaluate('window.__fengshenUI.state.players[0].faceDown'),false);assert.equal(await b.evaluate('window.__fengshenUI.modal'),null)
  s=fixture();s.players[1].equip.armor=take(s,'bagua');s.players[1].equip.defenseHorse=take(s,'dilu');s.players[1].judgment.push(take(s,'indulgence'));s.players[1].faceDown=true;s.players[1].chained=true;take(s,'sha',1);await load(s);await b.tap('[data-player="1"] .fs-player-info>strong')
  const text=await b.evaluate('document.querySelector(".fs-live-hero-state").textContent');for(const word of ['戊己杏黄旗','青鸾','迷魂阵','背面朝上','已连环','手牌 1 张','身份未公开'])assert.ok(text.includes(word),word);assert.ok(!text.includes('忠臣'))
  console.log('status screenshot',await b.screenshot(`${w}x${h}-live-status`));await b.tap('.fs-modal [data-action="close"]')
  console.log(`PASS ${w}x${h}: +1 horse Indulgence placement, immunity feedback, Jiushi blocked/triggered, public real-time character status`)
 }
 assert.deepEqual(b.errors,[])
}finally{await b.close()}
