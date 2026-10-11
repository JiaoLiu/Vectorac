// Actual client click handlers in an OFFLINE mock DOM, not Safari/visual QA.
// JSDOM_PATH may point at an isolated test-only installation; no repo dependency changes.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {createAssignedGame,catalog,dispatch} from '../.private/fengshen/engine.mjs'
const require=createRequire(import.meta.url),{JSDOM}=require(process.env.JSDOM_PATH||'jsdom')
const bundle=await build({entryPoints:['.private/fengshen/app.js'],bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{__FENGSHEN_RELEASE__:'false'}})
const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'https://offline-gods.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,errors=[]
w.addEventListener('error',e=>errors.push(e.error?.message||e.message))
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}})
w.ResizeObserver=class{observe(){}disconnect(){}}
w.scrollTo=()=>{};w.fetch=()=>Promise.reject(Error('network prohibited in mock DOM'))
Object.defineProperty(w,'innerWidth',{value:932,writable:true});Object.defineProperty(w,'innerHeight',{value:430,writable:true})
Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return this.id==='app'?932:this.classList.contains('fs-card-face')?80:500}})
Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return this.id==='app'?430:this.classList.contains('fs-card-face')?115:150}})
w.localStorage.setItem('vectorac.fengshen.internal.prefs.v1',JSON.stringify({voice:false,music:false,hints:true,pace:650}))
w.eval(bundle.outputFiles[0].text)
const ui=w.__fengshenUI;ui.schedule=()=>{};ui.voice.setEnabled(false);ui.music.setEnabled(false)
function fixture(hero,others=['jifa','nezha','yangjian','jinling'],current=0){const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:[hero,...others],seed:23});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.lastPlayed=null;s.lastResponse=null;s.exchange=null;s.publicReveal=null;s.logs=[];for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp}return s}
function card(s,seat,type,rank){const i=s.deck.findIndex(c=>c.type===type&&(!rank||c.rank===rank));assert.ok(i>=0);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
function load(s){ui.clearEffects();ui.reset();ui.state=s;ui.setup=null;ui.lobby=false;ui.modal=null;ui.modalStack=[];ui.auto=false;ui.paused=false;ui.roleMarks={};ui.render()}
function click(selector){const e=ui.root.querySelector(selector);assert.ok(e,'missing '+selector);assert.equal(e.disabled,false,'disabled '+selector);e.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}))}
let count=0
try{
 // Pair target selection is preserved while picking the multi-card exact cost.
 let s=fixture('zeus'),a=card(s,0,'sha'),b=card(s,0,'shan');card(s,1,'tao');for(let i=0;i<3;i++)card(s,2,'sha');load(s)
 click('[data-action="skill"][data-value="dimeng"]');click('[data-player="1"] .fs-player-main');click('[data-player="2"] .fs-player-main')
 assert.deepEqual(Array.from(ui.targets),[1,2]);click('.fs-hand-card[data-id="'+a.id+'"]');click('.fs-hand-card[data-id="'+b.id+'"]');assert.deepEqual(Array.from(ui.targets),[1,2]);click('.fs-actions [data-action="confirm"]');assert.equal(ui.state.players[1].hand.length,3);assert.equal(ui.state.players[2].hand.length,1);count++
 // A selected hand card enables the actual Pindian confirmation.
 s=fixture('fuxi');s.players[0].hp=2;a=card(s,0,'sha',13);b=card(s,1,'shan',2);load(s)
 click('[data-action="skill"][data-value="quhu"]');click('[data-player="1"] .fs-player-main');click('.fs-actions [data-action="confirm"]');assert.equal(ui.state.pending.stage,'pindian');click('.fs-hand-card[data-id="'+a.id+'"]');click('.fs-actions [data-action="confirm"]');assert.equal(ui.state.pending.actor,1);assert.ok(ui.act({seat:1,type:'invoke',value:'confirm',ids:[b.id]}));assert.ok(ui.act({seat:0,type:'invoke',value:'ack'}));click('[data-player="2"] .fs-player-main');click('.fs-actions [data-action="confirm"]');assert.equal(ui.state.players[2].hp,3);count++
 // Own portrait remains a valid target for an equipment exchange.
 s=fixture('nuwa');s.players[0].hp--;a=card(s,0,'bow');s.players[0].hand.pop();s.players[0].equip.weapon=a;b=card(s,1,'bagua');s.players[1].hand.pop();s.players[1].equip.armor=b;load(s)
 click('[data-action="skill"][data-value="ganlu"]');click('[data-player="1"] .fs-player-main');click('.fs-own-hero>button');assert.equal(ui.targets.length,2);click('.fs-actions [data-action="confirm"]');assert.equal(ui.state.players[0].equip.armor.id,b.id);count++
 // Post-damage red-view spade hand cost and recipient selection really dispatch.
 s=fixture('longji',['jifa','nezha','yangjian','jinling'],1);s.players[0].hp=2;a=card(s,0,'sha');b=card(s,1,'sha');let r=dispatch(s,{seat:1,type:'play',as:'sha',ids:[b.id],targets:[0]});assert.ok(r.ok);r=dispatch(r.state,{seat:0,type:'pass'});assert.ok(r.ok);load(r.state)
 click('.fs-hand-card[data-id="'+a.id+'"]');click('[data-player="2"] .fs-player-main');click('.fs-actions [data-action="confirm"]');assert.equal(ui.state.players[0].hp,2);assert.equal(ui.state.players[2].hp,3);count++
 // An option switch does not discard the selected recipient.
 s=fixture('ra',undefined,4);s.players[0].hp=2;r=dispatch(s,{seat:4,type:'end'});assert.ok(r.ok);load(r.state);click('[data-player="1"] .fs-player-main');click('.fs-actions [data-action="ext-option"]');assert.deepEqual(Array.from(ui.targets),[1]);count++
 // Every new virtual card has a real detail view; close returns to gallery.
 load(fixture('odin'));click('[data-action="menu"]');click('[data-action="gallery"]');assert.ok(ui.root.querySelector('.fs-gallery [data-id="fireattack"]'));click('.fs-gallery [data-id="fireattack"]');assert.ok(ui.root.querySelector('.fs-card-detail img').src.endsWith('fireattack.svg'));click('[data-action="close"]');assert.ok(ui.root.querySelector('.fs-gallery'));count++
 // Updated private identity cycle remains an independent action, not a hero modal.
 load(fixture('yangjian',['jifa','nezha','dixin','jinling']));click('[data-action="role-mark"][data-value="1"]');assert.equal(ui.roleMarks[1],'loyal');assert.equal(ui.modal,null);count++
 // Full hero guide: all portraits are enabled and none of the new cards is undefined.
 ui.openModal('heroes');assert.equal(ui.root.querySelectorAll('.fs-collection-grid button').length,54);assert.equal(ui.root.querySelectorAll('.fs-collection-grid .not-ready').length,0);assert.ok(!ui.root.textContent.includes('undefined'));count++
 assert.deepEqual(errors,[]);console.log('PASS',count,'actual-client offline DOM click scenarios; NOT visual/Safari acceptance')
}finally{ui.destroy();w.close()}
