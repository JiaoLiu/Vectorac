import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog,militaryCatalog} from '../site/.vuepress/components/fengshen/engine.mjs'
function fixture(own='yangjian',other='jifa',deckVersion=1){
 const s=createAssignedGame({heroIds:[own,other,'nezha','jinling','daji'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37,deckVersion});Object.assign(s,{deck:(deckVersion===2?militaryCatalog:catalog).makeDeck(),discard:[],processing:[],queue:[],pending:null,phase:'play',current:0,lastPlayed:null,lastResponse:null,exchange:null,publicReveal:null,logs:[]});for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0}}return s
}
const take=(s,type,seat)=>{const i=s.deck.findIndex(c=>c.type===type);assert.ok(i>=0,type);const c=s.deck.splice(i,1)[0];if(seat!=null)s.players[seat].hand.push(c);return c}
const b=await openBrowser({name:'gods-live-hero-status',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
const load=s=>b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.clearEffects();u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return true})()`)
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[932,430],[812,375],[568,320],[390,844]]){
  await b.viewport(w,h);let s=fixture(),c=take(s,'indulgence',0);s.players[1].equip.defenseHorse=take(s,'dilu');s.players[2].equip.defenseHorse=take(s,'jueying');await load(s)
  await b.tap(`.fs-hand-card[data-id="${c.id}"]`);await b.tap('[data-player="1"] .fs-player-main');assert.equal(await b.evaluate('window.__fengshenUI.targets[0]'),1)
  await b.tap('[data-player="2"] .fs-player-main');assert.equal(await b.evaluate('window.__fengshenUI.targets[0]'),2,'distant defensive-horse target still legal')
  await b.tap('.fs-actions [data-action="confirm"]');assert.equal(await b.evaluate(`window.__fengshenUI.state.players[2].judgment.some(c=>c.id===${JSON.stringify(c.id)})`),true)
  s=fixture('yangjian','kongxuan');c=take(s,'indulgence',0);s.players[1].equip.defenseHorse=take(s,'dilu');await load(s);await b.tap(`.fs-hand-card[data-id="${c.id}"]`);await b.tap('[data-player="1"] .fs-player-main');assert.equal(await b.evaluate('window.__fengshenUI.modal'),null);assert.match(await b.evaluate('window.__fengshenUI.toast'),/免疫迷魂阵/)
  s=fixture('apollo');s.players[0].faceDown=true;await load(s);await b.tap('.fs-own-skills [data-value="jiushi"]');assert.equal(await b.evaluate('window.__fengshenUI.modal'),null);assert.match(await b.evaluate('window.__fengshenUI.toast'),/不能主动.*翻正/)
  s=fixture('apollo');s.current=1;s.players[0].faceDown=true;const sha=take(s,'sha',1);await load(s);await b.evaluate(`window.__fengshenUI.act({seat:1,type:'play',as:'sha',ids:[${JSON.stringify(sha.id)}],targets:[0]});true`)
  await b.waitFor('window.__fengshenUI.state.pending?.skill==="jiushi-back"&&!document.querySelector(".fs-dock").inert')
  assert.equal(await b.evaluate('document.querySelector(".fs-own-skills [data-value=jiushi]").dataset.action'),'skill-trigger');await b.tap('.fs-own-skills [data-value="jiushi"]');assert.equal(await b.evaluate('window.__fengshenUI.state.players[0].faceDown'),false);assert.equal(await b.evaluate('window.__fengshenUI.modal'),null)
  // Stress the first screen with every equipment slot, three delayed spells,
  // and abnormal status. Skills must remain readable without scrolling.
  s=fixture('yangjian','jifa',2);for(const [slot,type]of Object.entries({weapon:'blade',armor:'bagua',offenseHorse:'chitu',defenseHorse:'dilu'}))s.players[1].equip[slot]=take(s,type)
  for(const type of ['indulgence','supplyshortage','lightning'])s.players[1].judgment.push(take(s,type))
  s.players[1].faceDown=true;s.players[1].chained=true;take(s,'sha',1);await load(s);await b.tap('[data-player="1"] .fs-player-info>strong')
  await b.waitFor('document.querySelector(".fs-hero-detail>.fs-portrait")?.complete&&document.querySelector(".fs-hero-detail>.fs-portrait")?.naturalWidth>0',20000)
  const text=await b.evaluate('document.querySelector(".fs-live-hero-state").textContent');for(const word of ['戊己杏黄旗','青鸾','迷魂阵','背面朝上','已连环','手牌 1 张'])assert.ok(text.includes(word),word);assert.ok(!text.includes('忠臣'));assert.ok(!text.includes('身份未公开'))
  const visibleSkill=await b.evaluate(`(()=>{const body=document.querySelector('.fs-modal-body'),p=body.querySelector('.fs-hero-skill p'),r=p.getBoundingClientRect(),c=body.getBoundingClientRect();return {scroll:body.scrollTop,inside:r.top>=c.top-1&&r.bottom<=c.bottom+1&&r.left>=c.left-1&&r.right<=c.right+1,collapsed:!body.querySelector('details').open,statusInHeader:!!body.querySelector('.fs-hero-detail .fs-live-hero-state')}})()`)
  assert.equal(visibleSkill.scroll,0);assert.equal(visibleSkill.inside,true,`${w}x${h} first skill explanation visible`);assert.equal(visibleSkill.collapsed,true);assert.equal(visibleSkill.statusInHeader,true)
  console.log('status screenshot',await b.screenshot(`${w}x${h}-compact-status`))
  await b.tap('.fs-live-state-more>summary');assert.equal(await b.evaluate('document.querySelector(".fs-live-state-more").open'),true)
  await b.evaluate('window.__fengshenUI.render();true');assert.equal(await b.evaluate('document.querySelector(".fs-live-state-more").open'),true,'state disclosure survives render')
  await b.tap('.fs-live-state-more>summary');assert.equal(await b.evaluate('document.querySelector(".fs-live-state-more").open'),false)
  await b.tap('.fs-live-equipment [data-action="card-detail"]');assert.equal(await b.evaluate('window.__fengshenUI.modal.kind'),'card-detail');await b.tap('.fs-modal [data-action="close"]')
  s=fixture();await load(s);await b.tap('[data-player="1"] .fs-player-info>strong')
  assert.equal(await b.evaluate('!!document.querySelector(".fs-live-equipment,.fs-live-delays,.fs-live-state-more")'),false,'empty state creates no placeholder blocks')
  assert.equal(await b.evaluate('document.querySelector(".fs-modal-body").scrollTop'),0);await b.tap('.fs-modal [data-action="close"]')
  console.log(`PASS ${w}x${h}: +1 horse Indulgence placement, immunity feedback, Jiushi blocked/triggered, public real-time character status`)
 }
 assert.deepEqual(b.errors,[])
}finally{await b.close()}
