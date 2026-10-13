import assert from 'node:assert/strict'
import {openBrowser} from './browser-cdp.mjs'
import {fireEffectFixture,chainEffectFixture} from './character-effect-fixtures.mjs'
const b=await openBrowser({name:'gods-fire-chain',baseUrl:process.env.FENGSHEN_TEST_ORIGIN||null,route:'/games/fengshen/'})
const load=(s,sound=false)=>b.evaluate(`(()=>{const u=window.__fengshenUI;u.schedule=()=>{};u.voice.setEnabled(${sound});u.music.setEnabled(false);u.clearEffects();u.judgmentCinematics.now=Date.now;u.state=${JSON.stringify(s)};u.lobby=false;u.setup=null;u.modal=null;u.paused=false;u.auto=false;u.reset();u.render();return true})()`)
async function verify(effect,targets,w,h){
 await b.waitFor(`document.querySelectorAll('[data-judgment-effect="${effect}"]').length===${targets.length}`)
 const started=await b.evaluate('window.__fengshenUI.judgmentCinematics.items[0].started')
 await b.evaluate(`(()=>{const u=window.__fengshenUI;u.judgmentCinematics.now=()=>${started}+${effect==='ironchain-release'?400:500};u.paintJudgment();clearTimeout(u.judgmentTimer);for(const n of document.querySelectorAll('.fs-judgment-cinematic,.fs-judgment-cinematic [data-motion]'))n.style.animationPlayState='paused';return true})()`)
 await b.waitFor('[...document.querySelectorAll(".fs-player-main .fs-portrait,.fs-own-hero>button .fs-portrait")].every(i=>i.complete&&i.naturalWidth>0)',20000)
 const view=await b.evaluate(`(()=>{const u=window.__fengshenUI,r=u.root.getBoundingClientRect();return {batch:u.judgmentCinematics.items.length,targets:[...document.querySelectorAll('[data-judgment-effect="${effect}"]')].map(n=>({seat:Number(n.dataset.judgmentTarget),attached:!!n.parentElement.closest('.fs-player-main,.fs-own-hero>button'),inside:(()=>{const a=(n.parentElement.closest('.fs-player,.fs-own-hero')||n).getBoundingClientRect();return a.left>=r.left-1&&a.right<=r.right+1&&a.top>=r.top-1&&a.bottom<=r.bottom+1})()})),center:!!u.root.querySelector(':scope>.fs-judgment-cinematic')}})()`)
 assert.equal(view.batch,1);assert.deepEqual(view.targets.map(t=>t.seat),targets);assert.ok(view.targets.every(t=>t.attached&&t.inside));assert.equal(view.center,false)
 console.log('effect screenshot',await b.screenshot(`${w}x${h}-${effect}`))
 await b.evaluate('window.__fengshenUI.render();window.__fengshenUI.onViewport();true');assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.items[0].started'),started)
 await b.evaluate(`(()=>{const u=window.__fengshenUI;const before=structuredClone(u.state);u.present(before,{});return true})()`);assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.items.length'),1)
 await b.evaluate(`window.__fengshenUI.judgmentCinematics.now=()=>${started}+2000;window.__fengshenUI.paintJudgment();true`)
 assert.equal(await b.evaluate('document.querySelectorAll(".fs-judgment-cinematic").length'),0)
}
try{
 await b.viewport(932,430);await b.navigate();await b.waitFor('!!window.__fengshenUI')
 for(const [w,h]of [[932,430],[812,375],[568,320],[390,844]]){
  await b.viewport(w,h)
  for(const release of [false,true]){
   const f=chainEffectFixture({release});await load(f.before)
   await b.tap(`.fs-hand-card[data-id="${f.card.id}"]`);if(release)await b.tap('[data-action="chain-mode"]')
   await b.tap('[data-player="1"] .fs-player-main');await b.tap('[data-player="2"] .fs-player-main');await b.tap('.fs-actions [data-action="confirm"]')
   await verify(release?'ironchain-release':'ironchain-bind',[1,2],w,h)
   assert.equal(await b.evaluate('window.__fengshenUI.state.players[1].chained'),!release)
  }
  const f=fireEffectFixture({propagate:true});await load(f.before)
  await b.tap(`.fs-hand-card[data-id="${f.cost.id}"]`);await b.tap('.fs-actions [data-action="confirm"]')
  await verify('fire-impact',[1,2,3],w,h)
  for(const t of [1,2,3])assert.equal(await b.evaluate(`window.__fengshenUI.state.players[${t}].hp`),f.before.players[t].hp-1)
  console.log(`PASS ${w}x${h}: true bind/release on both portraits, fire and chain propagation on actual victims, one grouped cue, no replay`)
 }
 await b.evaluate('window.__fengshenUI.voice.setEnabled(true);true');await b.tap('[data-action="menu"]');await b.tap('.fs-modal [data-action="close"]');await b.waitFor('window.__fengshenUI.voice.context?.state==="running"')
 for(const [kind,f]of [['chain',chainEffectFixture()],['unchain',chainEffectFixture({release:true})],['fire',fireEffectFixture({propagate:true})]]){
  const key='sfx-judgment-'+kind,count=await b.evaluate(`window.__fengshenUI.voice.history.filter(h=>h.key===${JSON.stringify(key)}&&h.status==='queued').length`)
  await load(f.before,true);assert.equal(await b.evaluate(`window.__fengshenUI.act(${JSON.stringify(f.action)})`),true)
  await b.waitFor(`window.__fengshenUI.voice.history.filter(h=>h.key===${JSON.stringify(key)}&&h.status==='queued').length>${count}`)
  await b.evaluate('window.__fengshenUI.render();window.__fengshenUI.onViewport();true')
  await b.waitFor(`window.__fengshenUI.voice.history.some(h=>h.key===${JSON.stringify(key)}&&h.status==='played')`)
  assert.equal(await b.evaluate(`window.__fengshenUI.voice.history.filter(h=>h.key===${JSON.stringify(key)}&&h.status==='queued').length`),count+1,'multi-target effect plays one sound, not overlapping copies')
 }
 const reforge=chainEffectFixture({recast:true});await load(reforge.before);await b.evaluate(`window.__fengshenUI.act(${JSON.stringify(reforge.action)});true`);assert.equal(await b.evaluate('window.__fengshenUI.judgmentCinematics.busy'),false)
 console.log('PASS native Web Audio fire/bind/release once per batch and no success effect on reforge; NOT physical iPhone')
 assert.deepEqual(b.errors,[])
}finally{await b.close()}
