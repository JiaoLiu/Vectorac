// Real Chromium rendering/touch checks; not physical iPhone Safari acceptance.
import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {createAssignedGame,catalog} from '../.private/fengshen/engine.mjs'
const browser=await openBrowser({name:'fengshen-health',route:'/games/fengshen/'})
function fixture(){
 const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['hades','jifa','nezha','yangjian','jinling'],seed:23})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:0,lastPlayed:null,logs:[]})
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp}
 s.players[0].hp=2;const i=s.deck.findIndex(c=>c.type==='sha'),c=s.deck.splice(i,1)[0];s.players[0].hand.push(c);return {s,c}
}
try{
 await browser.viewport(932,430);await browser.navigate();await browser.waitFor('!!window.__fengshenUI')
 const {s,c}=fixture()
 assert.ok(await browser.evaluate(`(()=>{const u=window.__fengshenUI;u.clearEffects();u.schedule=()=>{};u.voice.setEnabled(false);u.music.setEnabled(false);u.state=${JSON.stringify(s)};u.setup=null;u.lobby=false;u.modal=null;u.reset();u.render();return u.act({seat:0,type:'play',as:'sha',ids:[${JSON.stringify(c.id)}],targets:[1]})})()`))
 const checks=await browser.evaluate(`(()=>{const u=window.__fengshenUI,n=document.querySelector('.fs-heal-number'),a=document.querySelector('.fs-heal-aura'),r=n.getBoundingClientRect(),root=u.root.getBoundingClientRect();return {hp:u.state.players[0].hp,text:n.textContent,hurt:document.querySelector('[data-player="1"] .fs-damage-number').textContent,animation:getComputedStyle(n).animationName,pointer:getComputedStyle(n).pointerEvents,auraPointer:getComputedStyle(a).pointerEvents,visible:r.width>0&&r.height>0&&r.top>=root.top&&r.bottom<=root.bottom&&r.left>=root.left&&r.right<=root.right,blocking:!!document.querySelector('.fs-actions').closest('[inert]')}})()`)
 assert.equal(checks.hp,3);assert.equal(checks.text,'+1');assert.equal(checks.hurt,'−1');assert.equal(checks.animation,'fs-heal-rise');assert.equal(checks.pointer,'none');assert.equal(checks.auraPointer,'none');assert.equal(checks.visible,true);assert.equal(checks.blocking,false)
 console.log('healing screenshot:',await browser.screenshot('hades-recover-landscape'))
 await browser.evaluate('window.__fengshenUI.render();true');assert.equal(await browser.evaluate('document.querySelectorAll(".fs-heal-number").length'),1)
 await browser.tap('[data-action="role-mark"][data-value="1"]');assert.equal(await browser.evaluate('window.__fengshenUI.roleMarks[1]'),'loyal')
 await browser.viewport(430,932);assert.equal(await browser.evaluate('window.__fengshenUI.state.players[0].hp'),3)
 await browser.waitFor('!document.querySelector(".fs-heal-number,.fs-heal-aura")',4000)
 await browser.evaluate('window.__fengshenUI.render();true');assert.equal(await browser.evaluate('document.querySelectorAll(".fs-heal-number").length'),0)
 assert.deepEqual(browser.errors,[]);console.log('PASS real Chromium healing visibility, touch-through, repaint/rotation, expiry; NOT iPhone Safari')
}finally{await browser.close()}
