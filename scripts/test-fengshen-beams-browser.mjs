// Actual rendering/timers in Chromium; physical iPhone Safari remains separate.
import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
import {PLAYABLE_HEROES} from '../site/.vuepress/components/fengshen/theme.mjs'
const b=await openBrowser({name:'fengshen-beams',route:'/games/fengshen/'})
const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade','loyal','rebel','rebel'],heroIds:['hades',...PLAYABLE_HEROES.filter(h=>h.id!=='hades').slice(0,7).map(h=>h.id)],seed:23})
Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:0,lastPlayed:null,logs:[]})
for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp}
function card(seat,type){const i=s.deck.findIndex(c=>c.type===type),c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
const arrows=card(0,'arrows');for(let i=1;i<8;i++)card(i,'shan')
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 assert.ok(await b.evaluate(`(()=>{const u=window.__fengshenUI;u.clearEffects();u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.state=${JSON.stringify(s)};u.setup=null;u.lobby=false;u.modal=null;u.reset();u.render();return u.act({seat:0,type:'play',as:'arrows',ids:[${JSON.stringify(arrows.id)}],targets:[]})})()`))
 assert.equal(await b.evaluate('document.querySelectorAll(".fs-beam-core").length'),7)
 assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".fs-target-lines")).animationDuration'),'2.5s')
 console.log('AOE screenshot:',await b.screenshot('eight-player-aoe-beams'))
 // Simulate a viewport update while the same response is still waiting.
 await b.evaluate('new Promise(r=>setTimeout(()=>{window.__fengshenUI.onViewport();r(true)},800))')
 assert.ok(await b.evaluate('parseFloat(document.querySelector(".fs-target-lines").style.animationDelay)<-750'))
 await b.waitFor('!document.querySelector(".fs-target-lines")',4000)
 assert.equal(await b.evaluate('window.__fengshenUI.state.pending.kind'),'response','effect beams expire even before a response is made')
 assert.ok(await b.evaluate('window.__fengshenUI.act({seat:window.__fengshenUI.state.pending.actor,type:"pass"})'))
 assert.equal(await b.evaluate('!!document.querySelector(".fs-target-lines")'),false,'next recipient must not replay')
 await b.viewport(430,932);assert.equal(await b.evaluate('!!document.querySelector(".fs-target-lines")'),false,'rotation must not replay')
 assert.deepEqual(b.errors,[]);console.log('PASS real Chromium 8-player AOE expiry, redraw, next response and rotation; NOT iPhone Safari')
}finally{await b.close()}
