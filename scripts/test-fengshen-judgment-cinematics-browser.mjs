import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {judgmentFixture} from './fengshen-judgment-fixtures.mjs'
import {playerView} from '../.private/fengshen/engine.mjs'

const b=await openBrowser({name:'gods-judgment-cinematics',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
const load=(f,{sound=false}={})=>b.evaluate(`(()=>{const u=window.__fengshenUI;u.__scheduleOriginal||=(u.schedule.bind(u));u.schedule=()=>{};u.voice.setEnabled(${sound});u.music.setEnabled(false);u.clearEffects();u.judgmentCinematics.now=Date.now;u.state=${JSON.stringify(f.before)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return u.act(${JSON.stringify(f.action)})})()`)
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[932,430],[812,375],[568,320],[390,844]]){
  await b.viewport(w,h)
  for(const effect of ['lightning','indulgence','supplyshortage','leiji']){
   const f=judgmentFixture(effect);assert.equal(await load(f),true)
   assert.equal(await b.evaluate('window.__fengshenUI.state.pending.hit'),true)
   assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.items.length'),1)
   await b.waitFor(`!!document.querySelector('[data-judgment-effect="${effect}"]')`)
   await b.waitFor(`Number(getComputedStyle(document.querySelector('[data-judge-card="${f.after.pending.card.id}"] .fs-judge-stamp')).opacity)>.98`)
   const started=await b.evaluate('window.__fengshenUI.judgmentCinematics.items[0].started')
   const elapsed=['lightning','leiji'].includes(effect)?330:700
   await b.evaluate(`(()=>{const u=window.__fengshenUI;u.judgmentCinematics.now=()=>${started}+${elapsed};u.paintJudgment();clearTimeout(u.judgmentTimer);for(const e of document.querySelectorAll('.fs-judgment-cinematic,.fs-judgment-cinematic [data-motion]'))e.style.animationPlayState='paused';return true})()`)
   await b.waitFor('[...document.querySelectorAll(".fs-player-main .fs-portrait,.fs-own-hero>button .fs-portrait,.fs-table-judgment img")].every(img=>img.complete&&img.naturalWidth>0)',20000)
   const geometry=await b.evaluate(`(()=>{const u=window.__fengshenUI,e=document.querySelector('[data-judgment-effect="${effect}"]'),j=document.querySelector('[data-judge-card="${f.after.pending.card.id}"]'),target=document.querySelector(${JSON.stringify(f.after.pending.target===0?'.fs-own-hero>button':`[data-player="${f.after.pending.target}"] .fs-player-main`)}),a=e.getBoundingClientRect(),r=u.root.getBoundingClientRect(),c=j.getBoundingClientRect(),t=target.getBoundingClientRect();return {count:document.querySelectorAll('.fs-judgment-cinematic').length,stamp:document.querySelectorAll('[data-judge-card="${f.after.pending.card.id}"] .fs-judge-stamp').length,inRoot:a.left>=r.left-1&&a.right<=r.right+1&&a.top>=r.top-1&&a.bottom<=r.bottom+1,attached:e.parentElement===target,fit:Math.abs(a.width-t.width)<=2&&Math.abs(a.height-t.height)<=2,overlap:a.left<c.right&&a.right>c.left&&a.top<c.bottom&&a.bottom>c.top,pointer:getComputedStyle(e).pointerEvents,delay:getComputedStyle(e).animationDelay,inert:document.querySelector('.fs-dock').inert,central:!!u.root.querySelector(':scope>.fs-judgment-cinematic')}})()`)
   if(geometry.overlap)console.log('overlap debug',await b.evaluate(`(()=>{const u=window.__fengshenUI,e=document.querySelector('.fs-judgment-cinematic'),j=document.querySelector('[data-judge-card="${f.after.pending.card.id}"]');return {effect:e.getBoundingClientRect().toJSON(),judge:j.getBoundingClientRect().toJSON(),root:u.root.getBoundingClientRect().toJSON(),width:u.root.clientWidth,height:u.root.clientHeight,style:e.getAttribute('style'),side:getComputedStyle(u.root).getPropertyValue('--center-side')}})()`),await b.screenshot(`${w}x${h}-${effect}-overlap`))
   assert.equal(geometry.count,1);assert.equal(geometry.stamp,1);assert.equal(geometry.inRoot,true,`${w}x${h} ${effect} stays inside board`);assert.equal(geometry.overlap,false,'cinematic must not cover original judgment result');assert.equal(geometry.pointer,'none');assert.equal(geometry.inert,true)
   assert.equal(geometry.attached,true,'effect is on the affected portrait');assert.equal(geometry.fit,true,'effect fills that portrait');assert.equal(geometry.central,false,'no detached central scene')
   console.log('cinematic screenshot',await b.screenshot(`${w}x${h}-${effect}`))
   await b.evaluate('window.__fengshenUI.render();window.__fengshenUI.onViewport();true')
   assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.items[0].started'),started,'resize/render preserves elapsed timeline')
   assert.equal(await b.evaluate('document.querySelectorAll(".fs-judgment-cinematic").length'),1)
   await b.evaluate(`(()=>{const u=window.__fengshenUI;const before=structuredClone(u.state);u.present(before,{});return true})()`)
   assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.items.length'),1,'duplicate public snapshot adds no replay')
   await b.evaluate(`(()=>{const u=window.__fengshenUI;u.judgmentCinematics.now=()=>${started}+2000;u.paintJudgment();return true})()`)
   assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.busy'),false)
   assert.equal(await b.evaluate('document.querySelectorAll(".fs-judgment-cinematic,[data-judgment-afflicted]").length'),0)
   // The engine continues only after the cinematic; no mechanic was replaced.
   assert.equal(await b.evaluate(`window.__fengshenUI.act({type:'ack',seat:${f.after.pending.actor}})`),true)
   const result=await b.evaluate(`(()=>{const p=window.__fengshenUI.state.players[${f.after.pending.target}];return {hp:p.hp,skipPlay:!!p.marks.skipPlay,skipDraw:!!p.marks.skipDraw}})()`)
   if(effect==='indulgence')assert.equal(result.skipPlay,true)
   if(effect==='supplyshortage')assert.equal(result.skipDraw,true)
   if(effect==='lightning')assert.equal(result.hp,f.after.players[0].hp-3)
   if(effect==='leiji')assert.equal(result.hp,f.after.players[1].hp-2)
   await b.evaluate('window.__fengshenUI.clearEffects();window.__fengshenUI.render();true')
   assert.equal(await b.evaluate('document.querySelectorAll(".fs-judgment-cinematic").length'),0,'restoring/repainting cannot replay old reveal')
   const miss=judgmentFixture(effect,{hit:false});assert.equal(await load(miss),true)
   assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.busy'),false,'unsuccessful judgment has no success cinematic')
  }
  console.log(`PASS ${w}x${h}: lightning hits affected hero, doors close over portrait, ration seals cover portrait; no central scene/replay`)
 }
 const f=judgmentFixture('indulgence');await load(f)
 await b.waitFor('!!document.querySelector(".fs-judgment-cinematic")')
 await b.evaluate('Object.defineProperty(document,"hidden",{value:true,configurable:true});window.__fengshenUI.onVisibility();true')
 assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.busy'),false)
 await b.evaluate('delete document.hidden;window.__fengshenUI.onVisibility();true')
 assert.equal(await b.evaluate('document.querySelectorAll(".fs-judgment-cinematic").length'),0,'return from background does not replay')
 await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
 await load(judgmentFixture('lightning'));await b.waitFor('!!document.querySelector(".fs-judgment-cinematic")')
 assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".fs-judgment-cinematic")).animationName'),'none')
 assert.equal(await b.evaluate('getComputedStyle(document.querySelector(".fs-cinema-bolt")).animationName'),'none')
 await b.send('Emulation.setEmulatedMedia',{features:[]})
 // The affected hero is an opponent in a seat-local online snapshot too,
 // not always the local player in the lower-left corner.
 for(const effect of ['indulgence','supplyshortage']){
  const f=judgmentFixture(effect),projected=await import('../.private/fengshen/network-projection.mjs'),before={...f.before,networkView:projected.rotateView(playerView(f.before,1),1)},after={...f.after,networkView:projected.rotateView(playerView(f.after,1),1)}
  before.players=before.networkView.players;after.players=after.networkView.players
  await b.evaluate(`(()=>{const u=window.__fengshenUI;u.clearEffects();u.judgmentCinematics.now=Date.now;u.state=${JSON.stringify(before)};u.reset();u.render();u.state=${JSON.stringify(after)};u.present(${JSON.stringify(before)},{});return true})()`)
  await b.waitFor(`!!document.querySelector('[data-player="${after.networkView.pending.target}"] .fs-player-main>.fs-judgment-cinematic')`)
  assert.equal(await b.evaluate('document.querySelectorAll(".fs-own-hero .fs-judgment-cinematic").length'),0,'opponent effect must not attach to self')
 }
 // Unlock through a real touch gesture, then exercise actual Web Audio (not
 // just a UI toggle or a mock AudioContext). This is not physical iPhone sound.
 await b.evaluate('window.__fengshenUI.voice.setEnabled(true);true')
 await b.tap('[data-action="menu"]');await b.tap('.fs-modal [data-action="close"]')
 await b.waitFor('window.__fengshenUI.voice.context?.state==="running"')
 for(const [effect,kind]of [['indulgence','prison'],['supplyshortage','ration'],['lightning','thunder']]){
  const key='sfx-judgment-'+kind,count=await b.evaluate(`window.__fengshenUI.voice.history.filter(h=>h.key===${JSON.stringify(key)}&&h.status==='queued').length`)
  await load(judgmentFixture(effect),{sound:true})
  await b.waitFor(`window.__fengshenUI.voice.history.filter(h=>h.key===${JSON.stringify(key)}&&h.status==='queued').length>${count}`)
  await b.evaluate('window.__fengshenUI.render();window.__fengshenUI.onViewport();true')
  await b.waitFor(`window.__fengshenUI.voice.history.some(h=>h.key===${JSON.stringify(key)}&&h.status==='played')`)
  assert.equal(await b.evaluate(`window.__fengshenUI.voice.history.filter(h=>h.key===${JSON.stringify(key)}&&h.status==='queued').length`),count+1,'render/resize does not restart sound')
 }
 const audioCount=await b.evaluate('window.__fengshenUI.voice.history.filter(h=>h.key.startsWith("sfx-judgment-")).length')
 await load(judgmentFixture('indulgence'));await b.waitFor('!!document.querySelector(".fs-judgment-cinematic")')
 assert.equal(await b.evaluate('window.__fengshenUI.voice.history.filter(h=>h.key.startsWith("sfx-judgment-")).length'),audioCount,'mute suppresses the effect sound')
 await load(judgmentFixture('lightning'));await b.evaluate('window.__fengshenUI.schedule=window.__fengshenUI.__scheduleOriginal;window.__fengshenUI.schedule();true')
 await b.waitFor('window.__fengshenUI.state.pending?.kind!=="reveal"&&!window.__fengshenUI.judgmentCinematics.busy')
 assert.equal(await b.evaluate('window.__fengshenUI.state.players[0].hp'),2,'automatic acknowledgment continues after the completed scene')
 assert.equal(await b.evaluate('document.querySelectorAll(".fs-judgment-cinematic").length'),0)
 console.log('PASS opponent portrait targeting, native Web Audio once/mute/touch unlock, background/restore, reduced motion, automatic acknowledgment; NOT physical iPhone')
 assert.deepEqual(b.errors,[])
}finally{await b.close()}
