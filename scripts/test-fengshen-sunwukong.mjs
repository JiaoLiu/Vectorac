import test from 'node:test'
import assert from 'node:assert/strict'
import {createAssignedGame,dispatch,playerView,restoreGame,allCards,hasSkill,hero,chooseAI,catalog}from '../.private/fengshen/engine.mjs'
import {heroDetails,gameRules,formCollection}from '../.private/fengshen/player-guide.mjs'
import {HEROES,skillName}from '../.private/fengshen/theme.mjs'
import {modalReturnEntry}from '../.private/fengshen/modal-navigation.mjs'
const setup=()=>createAssignedGame({roles:['loyal','lord','rebel','rebel','renegade'],heroIds:['sunwukong','moliqing','nezha','yangjian','jifa'],seed:71})
function step(s,a){const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,108);return r.state}
function prepared(){let s=setup();s.players[0].incarnation.pool=['daqiao','ganning'];s=step(s,{type:'transform',heroId:'daqiao',skill:'guose'});assert.equal(s.pending.skill,'luoyi');s=step(s,{type:'choose',value:'yes'});return s}
function give(s,seat,type){const at=s.deck.findIndex(c=>c.type===type);assert.ok(at>=0);const c=s.deck.splice(at,1)[0];s.players[seat].hand.push(c);return c}
test('Sun Wukong starts with two distinct private unused forms and mandatory skill selection',()=>{
 const s=setup(),p=s.players[0];assert.equal(s.pending.kind,'incarnation');assert.equal(s.pending.required,true);assert.equal(p.incarnation.pool.length,2);assert.equal(new Set(p.incarnation.pool).size,2);assert.ok(p.incarnation.pool.every(id=>!s.players.some(p=>p.alive&&p.heroId===id)));assert.ok(!playerView(s,0).legal.some(a=>a.type==='pass'));assert.ok(playerView(s,0).legal.every(a=>catalog.SKILLS[a.skill][2]!=='lord'))
 const publicView=playerView(s,1);assert.equal(publicView.players[0].incarnation.pool,undefined);assert.deepEqual(publicView.legal,[]);assert.ok(restoreGame(s))
})
test('borrow exactly one skill, change faction/sex but never base identity or maximum HP',()=>{
 const s=prepared(),p=s.players[0];assert.equal(p.heroId,'zuoci');assert.equal(p.maxHp,3);assert.equal(hero(p).sex,'female');assert.equal(hero(p).faction,'wu');assert.ok(hasSkill(p,'guose'));assert.ok(!hasSkill(p,'liuli'));assert.ok(hasSkill(p,'huashen')&&hasSkill(p,'xinsheng'));assert.ok(restoreGame(s));assert.equal(playerView(s,1).players[0].incarnation.activeSkill,'guose')
})
test('fabricated forms, missing fields and forbidden lord skills reject transactionally',()=>{
 const s=setup();s.players[0].incarnation.pool=['caocao','ganning'];const r=dispatch(s,{seat:0,type:'transform',heroId:'caocao',skill:'hujia',promptId:s.pending.id});assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(s.players[0].incarnation.activeHero,null)
 const valid=prepared();for(const change of [p=>p.incarnation.activeSkill='hujia',p=>p.incarnation.pool.push(p.incarnation.pool[0]),p=>delete p.incarnation,p=>p.incarnation.activeHero='unknown']){const bad=structuredClone(valid);change(bad.players[0]);assert.equal(restoreGame(bad),null)}
})
test('two actual damage points add two forms without changing the current borrowed skill',()=>{
 let s=prepared();const card=give(s,1,'sha'),before=s.players[0].incarnation.pool.length;s=step(s,{type:'play',as:'sha',ids:[card.id],targets:[0]});assert.equal(s.pending.actor,0);s=step(s,{type:'pass'});assert.equal(s.players[0].hp,1);assert.equal(s.players[0].incarnation.pool.length,before+2);assert.equal(s.players[0].incarnation.activeSkill,'guose');assert.ok(restoreGame(s))
})
test('lethal damage never awards forms to a dead character',()=>{
 let s=prepared();for(const p of s.players)s.deck.push(...p.hand.splice(0));s.players[0].hp=1;s.players[1].marks.naked=false;const c=give(s,1,'sha'),before=s.players[0].incarnation.pool.length;s=step(s,{type:'play',as:'sha',ids:[c.id],targets:[0]});s=step(s,{type:'pass'});let guard=0;while(s.pending?.kind==='rescue'&&guard++<10)s=step(s,{type:'pass'});assert.equal(s.players[0].alive,false);assert.equal(s.players[0].incarnation.pool.length,before)
})
test('turn-start change runs before borrowed preparation skill and save/resume keeps that prompt',()=>{
 let ending=prepared();for(const p of ending.players)ending.deck.push(...p.hand.splice(0));ending.current=0;ending=step(ending,{type:'end'});assert.equal(ending.pending.reason,'end');assert.ok(restoreGame(ending))
 let s=prepared();s.players[0].incarnation.pool.push('zhugeliang');for(const p of s.players)s.deck.push(...p.hand.splice(0));s.current=4;s.phase='play';s.queue=[];s=step(s,{type:'end'});assert.equal(s.pending.reason,'start');assert.ok(restoreGame(s));s=step(s,{type:'transform',heroId:'zhugeliang',skill:'guanxing'});assert.equal(s.pending.kind,'guanxing');assert.equal(s.pending.actor,0);assert.ok(restoreGame(s))
})
test('AI uses private owner options only and every borrowed skill remains dispatchable',()=>{
 for(const source of catalog.HEROES.filter(h=>!h.skills.includes('huashen')))for(const skill of source.skills.filter(s=>catalog.SKILLS[s][2]!=='lord')){let s=setup();const onBoard=s.players.find(p=>p.heroId===source.id);if(onBoard){const spare=catalog.HEROES.find(h=>!h.skills.includes('huashen')&&!s.players.some(p=>p.heroId===h.id)&&h.id!==source.id);onBoard.heroId=spare.id;onBoard.hp=onBoard.maxHp=spare.hp+(onBoard.role==='lord'?1:0)}s.players[0].incarnation.pool=[source.id];s=step(s,{type:'transform',heroId:source.id,skill});assert.ok(restoreGame(s));const seat=s.pending?.actor??s.current,r=dispatch(s,{...chooseAI(playerView(s,seat)),seat});assert.ok(r.ok,source.id+' '+skill+' '+r.error)}
})
test('player rules and every character detail never expose comparison or engine labels',()=>{
 const forbidden=/三国杀|曹操|刘备|左慈|测试基准|完整原型|经典原版|映射|军争|pending-full|huashen/;assert.ok(!forbidden.test(gameRules()));for(const h of HEROES)assert.ok(!forbidden.test(heroDetails(h)),h.name)
 assert.equal(skillName({heroId:'zuoci',incarnation:{activeHero:'sunquan',activeSkill:'zhiheng'}},'zhiheng'),'炼化');assert.equal(skillName('zuoci','zhiheng'),'炼化')
})
test('detail closes back to the originating catalog with scroll and focus metadata',()=>{
 const source={kind:'gallery'},entry=modalReturnEntry(source,'card-detail',{scroll:420,focus:'sha'});assert.deepEqual(entry,{modal:{kind:'gallery'},scroll:420,focus:'sha'});assert.notEqual(entry.modal,source);assert.equal(modalReturnEntry({kind:'hand'},'card-detail'),null);assert.equal(modalReturnEntry({kind:'heroes'},'rules'),null)
 const s=prepared(),own=formCollection(playerView(s,0).players[0]),other=formCollection(playerView(s,1).players[0]);assert.ok(own.includes('赵公明'));assert.ok(!other.includes('赵公明'));assert.ok(!own.includes('data-action'));assert.ok(own.includes('正在借用'))
})
