import test from 'node:test'
import assert from 'node:assert/strict'
import {completedCharacterEffects} from '../.private/fengshen/character-effect-cues.mjs'
import {JudgmentCinematics,sceneHtml} from '../.private/fengshen/judgment-cinematics.mjs'
import {playerView} from '../.private/fengshen/engine.mjs'
import {rotateView} from '../.private/fengshen/network-projection.mjs'
import {fireEffectFixture,chainEffectFixture,effectStep} from './character-effect-fixtures.mjs'
test('Fire Attack flames only when matching cost causes actual fire damage, never on play/show/pass',()=>{
 const f=fireEffectFixture();for(const [a,b]of [[f.initial,f.played],[f.played,f.revealed],[f.revealed,f.before]])assert.deepEqual(completedCharacterEffects(playerView(a,0),playerView(b,0)),[])
 const events=completedCharacterEffects(f.beforeView,f.afterView);assert.equal(events.length,1);assert.equal(events[0].kind,'fire');assert.deepEqual(events[0].targets,[1]);assert.equal(f.after.players[1].hp,f.before.players[1].hp-1)
 const passed=effectStep(f.before,{type:'pass'});assert.deepEqual(completedCharacterEffects(f.beforeView,playerView(passed,0)),[])
})
test('canceled fire or chain effects have no successful effect animation',()=>{
 for(const type of ['fire','chain']){
  const f=type==='fire'?fireEffectFixture({counter:true}):chainEffectFixture({counter:true}),initial=f.initial||f.before;let s=f.played||f.after
  s=effectStep(s,{type:'respond',as:'nullify',ids:[f.nullify.id]});let n=0;while(s.pending&&n++<40)s=effectStep(s,{type:'pass'})
  assert.ok(n<40);const events=completedCharacterEffects(playerView(initial,0),playerView(s,0))
  if(type==='fire')assert.deepEqual(events,[])
  else{assert.equal(events.length,1);assert.deepEqual(events[0].targets,[2],'Nullify cancels its current victim, not the whole two-target card');assert.equal(s.players[1].chained,false)}
 }
})
test('chained fire damage groups real victims and preserves damage amounts and automatic unchain',()=>{
 const f=fireEffectFixture({propagate:true}),events=completedCharacterEffects(f.beforeView,f.afterView);assert.equal(events.length,1);assert.deepEqual(events[0].targets,[1,2,3])
 for(const t of [1,2,3]){assert.equal(f.after.players[t].hp,f.before.players[t].hp-1);assert.equal(f.after.players[t].chained,false)}
 assert.ok(f.after.logs.some(l=>l.cue?.nature==='fire'&&l.cue.chain===true));assert.equal(events[0].leadMs,0)
})
test('chain bind and explicit release group both people; no effect for recast or unchanged state',()=>{
 for(const release of [false,true]){const f=chainEffectFixture({release}),events=completedCharacterEffects(f.beforeView,f.afterView);assert.equal(events.length,1);assert.equal(events[0].kind,release?'unchain':'chain');assert.deepEqual(events[0].targets,[1,2]);for(const t of [1,2])assert.equal(f.after.players[t].chained,!release)}
 for(const opts of [{recast:true},{repeat:true}]){const f=chainEffectFixture(opts);assert.deepEqual(completedCharacterEffects(f.beforeView,f.afterView),[])}
})
test('duplicate snapshot and saved existing effects do not replay; group queue and illustrations remain distinct',()=>{
 const f=chainEffectFixture(),events=completedCharacterEffects(f.beforeView,f.afterView),q=new JudgmentCinematics();q.enqueue(events);q.enqueue(events);assert.equal(q.items.length,1);assert.equal(q.frame().event.targets.length,2)
 assert.deepEqual(completedCharacterEffects(f.afterView,f.afterView),[])
 for(const kind of ['fire','chain','unchain'])assert.ok(sceneHtml({kind,title:'测试',result:'公开效果'}).includes(kind==='fire'?'fs-character-fire':'fs-character-chains'))
})
test('seat-local online mapping preserves all bound targets and hides unknown cards',()=>{
 const f=chainEffectFixture(),a=rotateView(playerView(f.before,3),3),b=rotateView(playerView(f.after,3),3),events=completedCharacterEffects(a,b);assert.deepEqual(events[0].targets,[3,4]);assert.ok(b.players.filter(p=>p.seat!==0).every(p=>p.hand.length===0))
})
