// Actual client click handlers in an OFFLINE mock DOM, not Safari/visual QA.
// JSDOM_PATH may point at an isolated test-only installation; no repo dependency changes.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {createAssignedGame,catalog,dispatch} from '../.private/fengshen/engine.mjs'
import {paintRecovery} from '../.private/fengshen/health-effects.mjs'
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
 // Feedback entry opens the built-in popup shell (same form other card games use), not a page jump.
 // This is an offline shell test: never initialize the real comment service.
 ui.feedback.ensureValine=async()=>{}
 load(fixture('odin'));click('[data-action="menu"]');click('[data-action="feedback"]');const fb=w.document.querySelector('#fs-feedback-modal');assert.ok(fb,'feedback modal missing');assert.equal(fb.hidden,false);assert.equal(fb.querySelector('.gf-title').textContent,'众神斗法 · 意见反馈');assert.ok(fb.querySelector('#fs-feedback-valine'));fb.querySelector('[data-gf-close]').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(fb.hidden,true);count++
 Object.defineProperty(w.document,'fullscreenElement',{value:ui.root,configurable:true});ui.feedback.open();fb.querySelector('#fs-feedback-valine').innerHTML='<textarea class="veditor">保留这段未提交的反馈</textarea>';ui.render();assert.equal(fb.isConnected,true);assert.equal(fb.parentNode,ui.root);assert.equal(fb.querySelector('.veditor').value,'保留这段未提交的反馈');ui.feedback.close();delete w.document.fullscreenElement;count++
 // Hades' automatic recovery has a green actual-amount cue alongside target damage.
 s=fixture('hades');s.players[0].hp=2;a=card(s,0,'sha');load(s);assert.ok(ui.act({seat:0,type:'play',as:'sha',ids:[a.id],targets:[1]}));assert.equal(ui.state.players[0].hp,3);assert.equal(ui.root.querySelector('.fs-own-hero .fs-heal-number').textContent,'+1');assert.equal(ui.root.querySelector('[data-player="1"] .fs-damage-number').textContent,'−1');assert.equal(ui.root.querySelectorAll('.fs-heal-aura').length,1)
 ui.render();assert.equal(ui.root.querySelectorAll('.fs-heal-number').length,1);assert.equal(ui.root.querySelector('.fs-own-hero>button').disabled,false);assert.equal(ui.root.querySelector('.fs-actions').closest('[inert]'),null);click('[data-action="role-mark"][data-value="1"]');assert.equal(ui.roleMarks[1],'loyal');ui.clearEffects();ui.render();assert.equal(ui.root.querySelectorAll('.fs-heal-number').length,0);count++
 // Every avatar can recover, and a repaint retains elapsed animation time.
 s=fixture('hades',undefined,1);s.players[1].hp--;a=card(s,1,'tao');load(s);assert.ok(ui.act({seat:1,type:'play',as:'tao',ids:[a.id],targets:[]}));assert.equal(ui.root.querySelector('[data-player="1"] .fs-heal-number').textContent,'+1');const effect=ui.recoveries[0];effect.started-=400;ui.render();assert.ok(parseFloat(ui.root.querySelector('.fs-heal-number').style.animationDelay)<=-400);count++
 // Repeated cues use the newest timeline; an old one cannot hide a new recovery.
 paintRecovery(ui.root,[{target:1,amount:1,started:0,until:1500},{target:1,amount:2,started:1000,until:2500}],{now:1200});assert.equal(ui.root.querySelector('.fs-heal-number').textContent,'+3');assert.equal(ui.root.querySelector('.fs-heal-number').style.animationDelay,'-200ms');paintRecovery(ui.root,[{target:1,amount:1,started:0,until:1500}],{now:1500});assert.equal(ui.root.querySelectorAll('.fs-heal-number,.fs-heal-aura').length,0);count++
 // Full-HP passive recovery emits no badge, and old restored logs do not replay.
 s=fixture('jifa',['dixin','nezha','yangjian','jinling']);a=card(s,0,'sha');b=card(s,0,'shan');load(s);assert.ok(ui.act({seat:0,type:'skill',skill:'rende',ids:[a.id,b.id],target:1}));assert.equal(ui.recoveries.length,0);assert.equal(ui.root.querySelectorAll('.fs-heal-number').length,0);load(ui.state);assert.equal(ui.root.querySelectorAll('.fs-heal-number').length,0);count++
 // Whole AOE beams expire without depending on AI progress or another render.
 let beamTime=0;s=fixture('hades');a=card(s,0,'arrows');for(let i=1;i<5;i++)card(s,i,'shan');load(s);ui.beams.now=()=>beamTime;assert.ok(ui.act({seat:0,type:'play',as:'arrows',ids:[a.id],targets:[]}));assert.equal(ui.root.querySelectorAll('.fs-beam-core').length,4);assert.equal(ui.root.querySelector('.fs-target-lines').dataset.beamMode,'effect');beamTime=1700;ui.render();assert.equal(ui.root.querySelector('.fs-target-lines').style.animationDelay,'-1700ms');beamTime=2500;ui.decorateBattle();assert.equal(ui.root.querySelector('.fs-target-lines'),null);assert.ok(ui.act({seat:1,type:'pass'}));assert.equal(ui.root.querySelector('.fs-target-lines'),null);count++
 // Response frame covers the whole portrait, not the clipped inner avatar; beam expiry must not clear it.
 assert.ok(ui.root.querySelector('[data-player="2"].fs-responding'));assert.equal(ui.root.querySelector('.fs-player-main.fs-responding'),null);count++
 s=fixture('hades',undefined,1);a=card(s,1,'sha');b=card(s,0,'shan');load(s);assert.ok(ui.act({seat:1,type:'play',as:'sha',ids:[a.id],targets:[0]}));assert.ok(ui.root.querySelector('.fs-own-hero.fs-responding'));assert.equal(ui.root.querySelector('.fs-own-hero>button.fs-responding'),null);assert.ok(ui.root.querySelector('[data-player="1"].turn-active'));beamTime+=2500;ui.decorateBattle();assert.ok(ui.root.querySelector('.fs-own-hero.fs-responding'));assert.ok(ui.act({seat:0,type:'respond',as:'shan',ids:[b.id]}));assert.equal(ui.root.querySelector('.fs-responding'),null);count++
 // Aiming stays visible until confirmation; old persisted plays do not animate.
 s=fixture('hades');a=card(s,0,'sha');load(s);click('.fs-hand-card[data-id="'+a.id+'"]');click('[data-player="1"] .fs-player-main');beamTime=9999;ui.render();assert.equal(ui.root.querySelector('.fs-target-lines').dataset.beamMode,'aim');assert.equal(ui.root.querySelectorAll('.fs-beam-core').length,1);assert.ok(ui.act({seat:0,type:'play',as:'sha',ids:[a.id],targets:[1]}));assert.equal(ui.root.querySelector('.fs-target-lines').dataset.beamMode,'effect');load(ui.state);assert.equal(ui.root.querySelector('.fs-target-lines'),null);count++
 // Actual saved-game resume must also keep the old AOE expired on its next response.
 s=fixture('hades');a=card(s,0,'arrows');for(let i=1;i<5;i++)card(s,i,'shan');load(s);assert.ok(ui.act({seat:0,type:'play',as:'arrows',ids:[a.id],targets:[]}));ui.resume();assert.equal(ui.root.querySelector('.fs-target-lines'),null);assert.ok(ui.act({seat:1,type:'pass'}));assert.equal(ui.root.querySelector('.fs-target-lines'),null);count++
 // A rescue/transfer flight keeps its elapsed time across re-renders instead of restarting from the source (would look like 2-3 cards flying out).
 s=fixture('hades',undefined,1);let atk=card(s,1,'sha');card(s,1,'tao');s.players[2].hp=1;load(s);assert.ok(ui.act({seat:1,type:'play',as:'sha',ids:[atk.id],targets:[2]}));assert.equal(ui.state.pending.kind,'rescue');const rescuer=ui.state.pending.actor,heal=ui.state.players[rescuer].hand.find(c=>c.type==='tao');assert.ok(ui.act({seat:rescuer,type:'respond',ids:[heal.id],as:'tao'}));assert.equal(ui.transfer.mode,'rescue');assert.ok(ui.root.querySelector('.fs-transfer-flight'));ui.transfer.started-=400;ui.render();const again=ui.root.querySelector('.fs-transfer-flight');assert.ok(again);assert.ok(parseFloat(again.style.animationDelay)<=-400,'transfer flight restarted instead of continuing');count++
 assert.deepEqual(errors,[]);console.log('PASS',count,'actual-client offline DOM click scenarios; NOT visual/Safari acceptance')
}finally{ui.destroy();w.close()}
