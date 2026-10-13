import test from 'node:test'
import assert from 'node:assert/strict'
import {successfulJudgments,JudgmentCinematics,JUDGMENT_LEAD_MS,JUDGMENT_SCENE_MS,sceneHtml} from '../site/.vuepress/components/fengshen/judgment-cinematics.mjs'
import {dispatch,playerView,restoreGame} from '../site/.vuepress/components/fengshen/engine.mjs'
import {rotateView} from '../site/.vuepress/components/fengshen/network-projection.mjs'
import {judgmentFixture} from './fengshen-judgment-fixtures.mjs'
for(const effect of ['lightning','leiji','indulgence','supplyshortage'])test(`${effect}: only final successful public judgment animates, existing rules unchanged`,()=>{
 const f=judgmentFixture(effect),events=successfulJudgments(f.beforeView,f.afterView);assert.equal(events.length,1);assert.equal(events[0].effect,effect);assert.equal(events[0].judgeId,f.after.pending.card.id)
 const r=dispatch(f.after,{seat:f.after.pending.actor,type:'ack'});assert.ok(r.ok,r.error)
 if(effect==='indulgence')assert.equal(r.state.players[0].marks.skipPlay,true)
 if(effect==='supplyshortage')assert.equal(r.state.players[0].marks.skipDraw,true)
 if(effect==='lightning')assert.equal(r.state.players[0].hp,f.after.players[0].hp-3)
 if(effect==='leiji')assert.equal(r.state.players[1].hp,f.after.players[1].hp-2)
 assert.deepEqual(successfulJudgments(f.afterView,playerView(r.state,0)),[])
 const miss=judgmentFixture(effect,{hit:false});assert.equal(miss.after.pending.hit,false);assert.deepEqual(successfulJudgments(miss.beforeView,miss.afterView),[])
 const replacement={...f.afterView,pending:{...f.afterView.pending,kind:'judge-replace'}};assert.deepEqual(successfulJudgments(f.beforeView,replacement),[])
 assert.deepEqual(successfulJudgments(f.afterView,f.afterView),[],'duplicate snapshot cannot replay')
 const restored=restoreGame(f.after);assert.ok(restored);const v=playerView(restored,0);assert.deepEqual(successfulJudgments(v,v),[],'restore has no new transition')
})
test('Hongyan effective suit overrides physical spade before successful-effect detection',()=>{
 const f=judgmentFixture('lightning',{owner:'longji'});assert.equal(f.after.pending.card.suit,'spade');assert.equal(f.after.pending.effectiveSuit,'heart');assert.equal(f.after.pending.hit,false);assert.deepEqual(successfulJudgments(f.beforeView,f.afterView),[])
})
test('unrelated armor judgments do not create cinematic effects',()=>{
 const f=judgmentFixture('indulgence');assert.deepEqual(successfulJudgments(f.beforeView,{...f.afterView,pending:{...f.afterView.pending,delayType:'bagua'}}),[])
})
test('public seat-local online projection keeps the correct cinematic recipient',()=>{
 const f=judgmentFixture('indulgence'),before=rotateView(playerView(f.before,2),2),after=rotateView(playerView(f.after,2),2),events=successfulJudgments(before,after)
 assert.equal(events.length,1);assert.equal(events[0].target,after.pending.target);assert.equal(events[0].judgeId,f.after.pending.card.id)
})
test('cinematics queue once, wait for flight/lead, retain elapsed time and finish in order',()=>{
 let now=0;const q=new JudgmentCinematics({now:()=>now}),a=successfulJudgments(...['beforeView','afterView'].map(k=>judgmentFixture('indulgence')[k]))[0],b={...a,key:'second',effect:'supplyshortage',kind:'ration'}
 q.enqueue([a,a,b]);assert.equal(q.items.length,2);assert.equal(q.frame().event,null);now=JUDGMENT_LEAD_MS+100;assert.equal(q.frame({blocked:true}).event,null)
 const first=q.frame();assert.equal(first.event.key,a.key);const started=first.event.started;now+=400;assert.equal(q.frame().elapsed,400);assert.equal(q.frame().event.started,started)
 now=started+JUDGMENT_SCENE_MS;assert.equal(q.frame().event.key,b.key);assert.equal(q.completed,a.key);now+=JUDGMENT_SCENE_MS;assert.equal(q.frame(),null);assert.equal(q.busy,false);assert.equal(q.completed,b.key)
 q.enqueue([a,b]);assert.equal(q.busy,false);q.clear();assert.equal(q.completed,null);assert.equal(q.seen.size,0)
})
test('each illustration is distinct, escaped and contains no extra judgment card',()=>{
 // 角色化特效版：雷击是 SVG 闪电，迷魂阵是门扉，闭粮阵是封条盖章——按各自标志断言，三个场景互不相同。
 const marks={lightning:'fs-character-lightning',indulgence:'fs-character-door',supplyshortage:'fs-character-stamp'},seen=new Set()
 for(const effect of ['lightning','indulgence','supplyshortage']){const f=judgmentFixture(effect),e=successfulJudgments(f.beforeView,f.afterView)[0],html=sceneHtml({...e,targetName:'<hidden>'});assert.ok(html.includes(marks[effect]));seen.add(html);assert.ok(!html.includes('fs-card-face'));assert.ok(html.includes('&lt;hidden&gt;'));assert.ok(!html.includes('<hidden>'))}
 assert.equal(seen.size,3)
})
