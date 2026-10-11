import test from 'node:test'
import assert from 'node:assert/strict'
import {createAssignedGame,dispatch,playerView,restoreGame,allCards,catalog,chooseAI,hasSkill} from '../.private/fengshen/engine.mjs'
import {PLAYABLE_HEROES,HERO_BY_THEME_ID} from '../.private/fengshen/theme.mjs'
import {renderControls,renderCenter} from '../.private/fengshen/table.mjs'
import {selectingTargets} from '../.private/fengshen/target-selection.mjs'
import {drawEffects} from '../.private/fengshen/draw-effects.mjs'
const added=['houyi','hades','lijing','huangtianhua','thor','luya']
function fixture(id='houyi',current=0){const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:[id,'jifa','nezha','yangjian','jinling'],seed:23});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.lastPlayed=null;s.logs=[];for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp;p.alive=true;delete p.faceDown}return s}
const card=(s,seat,type)=>{const i=s.deck.findIndex(c=>c.type===type);assert.ok(i>=0);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
const equip=(s,seat,type)=>{const c=card(s,seat,type);s.players[seat].hand.pop();s.players[seat].equip[catalog.CARDS[type].slot]=c;return c}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,108);assert.equal(new Set(allCards(r.state).map(c=>c.id)).size,108);assert.ok(restoreGame(r.state),JSON.stringify(r.state.pending));return r.state}
const attack=(s,c,t)=>step(s,{type:'play',as:'sha',ids:[c.id],targets:[t]})
const pass=(s)=>step(s,{type:s.pending?.kind==='reveal'?'ack':'pass'})
const ui=s=>({state:s,selected:[],targets:[],paused:false,matching:()=>[],currentAs:()=>null})
test('six complete original profiles add distinct full skill sets and no deck changes',()=>{assert.equal(PLAYABLE_HEROES.length,32);for(const id of added){const h=HERO_BY_THEME_ID[id];assert.ok(h.playable);assert.deepEqual(catalog.HERO_BY_ID[h.engineId].skills,Object.keys(h.skillNames));assert.equal(h.hp,4)}assert.deepEqual(HERO_BY_THEME_ID.luya.skillNames,{mashu:'游仙',mengjin:'钉魂'});assert.equal(catalog.makeDeck().length,108)})
test('Liegong uses original hand/HP/range thresholds and auto-skips all Dodge resources only in play phase',()=>{
 for(const [n,bow,hit]of [[1,false,true],[3,false,false],[5,false,true],[3,true,true]]){let s=fixture();const c=card(s,0,'sha');if(bow)equip(s,0,'bow');for(let i=0;i<n;i++)card(s,1,'shan');const hp=s.players[1].hp;s=attack(s,c,1);if(hit){assert.equal(s.players[1].hp,hp-1);assert.equal(s.pending,null)}else{assert.equal(s.pending.as,'shan');assert.equal(s.players[1].hp,hp)}}
 let s=fixture('houyi',2);equip(s,0,'qinggang');const sha=card(s,0,'sha'),collateral=card(s,2,'collateral');card(s,1,'shan');s=step(s,{type:'play',as:'collateral',ids:[collateral.id],targets:[0,1]});s=step(s,{type:'respond',ids:[sha.id]});assert.equal(s.pending.actor,1);assert.equal(s.pending.as,'shan');assert.ok(!s.logs.some(l=>l.cue?.skill==='liegong'))
})
test('Kuanggu heals actual damage, snapshots distance before a victim dies, and never heals for Dodge/far damage',()=>{
 for(const [target,dodge,dying]of [[1,false,false],[2,false,false],[1,true,false],[1,false,true]]){let s=fixture('hades');s.players[0].hp=2;equip(s,0,'bow');if(dying)s.players[target].hp=1;const c=card(s,0,'sha'),defense=dodge?card(s,target,'shan'):null;s=attack(s,c,target);s=defense?step(s,{type:'respond',ids:[defense.id]}):pass(s);let guard=0;while(s.pending?.kind==='rescue'&&guard++<10)s=pass(s);assert.equal(s.players[0].hp,target===1&&!dodge?3:2)}
})
test('Kuanggu restores per actual damage point, while Qiangxi ignores Dodge and hand weapon costs preserve equipped range',()=>{
 let s=fixture('hades');s.players[0].hp=1;s.players[0].marks.naked=true;const sha=card(s,0,'sha');s=attack(s,sha,1);s=pass(s);assert.equal(s.players[0].hp,3);assert.equal(s.players[1].hp,s.players[1].maxHp-2)
 s=fixture('thor');const equipped=equip(s,0,'bow'),cost=card(s,0,'qinggang');card(s,2,'shan');const hp=s.players[2].hp;s=step(s,{type:'skill',skill:'qiangxi',ids:[cost.id],target:2});assert.equal(s.players[0].equip.weapon.id,equipped.id);assert.equal(s.players[2].hp,hp-1);assert.equal(s.pending,null);assert.equal(s.lastPlayed.as,'qiangxi');assert.equal(s.players[0].marks.sha,0)
})
test('Shensu first mode skips judgment/draw, retains delayed cards, does not consume the normal play Slash',()=>{
 let s=fixture('huangtianhua',4);const delay=card(s,0,'indulgence');s.players[0].hand.pop();s.players[0].judgment.push(delay);card(s,0,'sha');s=step(s,{type:'end'});assert.equal(s.pending.kind,'shensu');assert.equal(s.pending.mode,1);const n=s.players[0].hand.length,legal=playerView(s,0).legal.find(a=>a.type==='rush'&&a.target===2);assert.ok(legal,'unlimited distance');s=step(s,legal);s=pass(s);assert.equal(s.phase,'play');assert.equal(s.current,0);assert.equal(s.players[0].hand.length,n);assert.equal(s.players[0].judgment[0].id,delay.id);assert.equal(s.players[0].marks.sha,0);assert.ok(playerView(s,0).legal.some(a=>a.type==='play'&&a.as==='sha'))
})
test('Shensu can use both modes, second spends an equip from hand and skips the entire play phase',()=>{
 let s=fixture('huangtianhua',4),cost=card(s,0,'bagua');s=step(s,{type:'end'});s=step(s,playerView(s,0).legal.find(a=>a.type==='rush'&&a.target===1));s=pass(s);assert.equal(s.pending.kind,'shensu');assert.equal(s.pending.mode,2);assert.ok(!playerView(s,0).legal.some(a=>a.type==='rush'&&a.ids.length===0));s=step(s,playerView(s,0).legal.find(a=>a.type==='rush'&&a.target===2&&a.ids[0]===cost.id));s=pass(s);assert.notEqual(s.current,0);assert.ok(s.discard.some(c=>c.id===cost.id));assert.equal(s.players[1].hp,s.players[1].maxHp-1);assert.equal(s.players[2].hp,s.players[2].maxHp-1)
})
test('Shensu declining resumes ordinary phases and cannot bypass a failed prison with second mode',()=>{
 let s=fixture('huangtianhua',4);equip(s,0,'bagua');s=step(s,{type:'end'});s=pass(s);assert.equal(s.players[0].hand.length,2);assert.equal(s.pending.mode,2);s=pass(s);assert.equal(s.phase,'play');assert.equal(s.current,0)
 s=fixture('huangtianhua',4);const delay=card(s,0,'indulgence');s.players[0].hand.pop();s.players[0].judgment.push(delay);equip(s,0,'bagua');const i=s.deck.findIndex(c=>c.suit==='spade'),judge=s.deck.splice(i,1)[0];s.deck.unshift(judge);s=step(s,{type:'end'});s=pass(s);assert.equal(s.pending.kind,'reveal');s=pass(s);assert.notEqual(s.current,0)
})
test('Shensu cannot target Kongcheng and its mobile controls expose explicit confirmation and phase cost',()=>{
 const s=fixture('huangtianhua',4);s.players[1].heroId='zhugeliang';s.players[1].hp=s.players[1].maxHp=3;const next=step(s,{type:'end'}),v=playerView(next,0);assert.ok(!v.legal.some(a=>a.target===1));assert.ok(selectingTargets({selected:[]},v));const html=renderControls({...ui(next),targets:[2]},v);assert.ok(html.includes('确认疾行'));assert.ok(html.includes('正常判定与摸牌'));assert.ok(!/data-action="confirm"[^>]*disabled/.test(html))
})
test('Jushou follows discard, draws exactly three, flips, skips next whole turn and does not repeat at skipped finish',()=>{
 let s=fixture('lijing');for(let i=0;i<6;i++)card(s,0,'shan');s=step(s,{type:'end'});assert.equal(s.pending.kind,'discard');s=step(s,{type:'discard',ids:[s.players[0].hand[0].id]});assert.equal(s.pending.skill,'jushou');const before=s;s=step(s,{type:'choose',value:'yes'});assert.equal(s.players[0].hand.length,8);assert.equal(s.players[0].faceDown,true);assert.equal(drawEffects(before,s).find(e=>e.target===0).count,3);assert.equal(playerView(s,2).players[0].faceDown,true);let guard=0;while(s.current!==4&&guard++<20){if(s.pending)s=pass(s);else s=step(s,{type:'end'})}const cards=s.players[0].hand.length;s=step(s,{type:'end'});assert.equal(s.current,1);assert.equal(s.players[0].faceDown,false);assert.equal(s.players[0].hand.length,cards);assert.equal(s.logs.filter(l=>l.cue?.skill==='jushou').length,1)
})
test('Qiangxi costs HP or one weapon, excludes self, once per play, and recalculates range without discarded weapon',()=>{
 let s=fixture('thor'),weapon=equip(s,0,'bow');const hp=s.players[0].hp;assert.ok(playerView(s,0).legal.some(a=>a.skill==='qiangxi'&&!a.ids.length&&a.target===2));assert.ok(!playerView(s,0).legal.some(a=>a.skill==='qiangxi'&&a.ids.includes(weapon.id)&&a.target===2));const invalid=dispatch(s,{seat:0,type:'skill',skill:'qiangxi',ids:[weapon.id],target:2});assert.equal(invalid.ok,false);s=step(s,{type:'skill',skill:'qiangxi',ids:[weapon.id],target:1});assert.equal(s.players[0].hp,hp);assert.equal(s.players[1].hp,s.players[1].maxHp-1);assert.ok(!playerView(s,0).legal.some(a=>a.skill==='qiangxi'));assert.ok(s.discard.some(c=>c.id===weapon.id))
 s=fixture('thor');const victim=s.players[1].hp;s=step(s,{type:'skill',skill:'qiangxi',ids:[],target:1});assert.equal(s.players[0].hp,s.players[0].maxHp-1);assert.equal(s.players[1].hp,victim-1);assert.ok(!playerView(s,0).legal.some(a=>a.skill==='qiangxi'&&a.target===0))
})
test('Qiangxi HP cost goes through rescue rather than damage-trigger skills before target damage',()=>{
 let s=fixture('thor');s.players[0].hp=1;const peach=card(s,0,'tao'),hp=s.players[1].hp;s=step(s,{type:'skill',skill:'qiangxi',ids:[],target:1});assert.equal(s.pending.kind,'rescue');assert.equal(s.players[1].hp,hp);s=step(s,{type:'respond',ids:[peach.id]});assert.equal(s.players[1].hp,hp-1);assert.equal(s.players[0].hp,1);assert.ok(!s.logs.some(l=>l.cue?.kind==='damage'&&l.cue.target===0))
})
test('Mengjin happens after actual Dodge, not damage; excludes judgment and continues blade after removal',()=>{
 let s=fixture('luya'),sha=card(s,0,'sha'),follow=card(s,0,'sha');equip(s,0,'blade');const dodge=card(s,1,'shan'),held=card(s,1,'tao'),delay=card(s,1,'indulgence');s.players[1].hand.pop();s.players[1].judgment.push(delay);s=attack(s,sha,1);s=step(s,{type:'respond',ids:[dodge.id]});assert.equal(s.pending.skill,'mengjin');s=step(s,{type:'choose',value:'yes'});assert.equal(s.pending.kind,'take');const v=playerView(s,0);assert.ok(v.legal.every(a=>a.zone!=='judgment'));s=step(s,v.legal.find(a=>a.zone==='hand'));assert.ok(s.discard.some(c=>c.id===held.id));assert.equal(s.pending.kind,'blade');s=step(s,{type:'respond',ids:[follow.id]});s=pass(s);assert.equal(s.players[1].hp,s.players[1].maxHp-1)
})
test('all six heroes finish seeded AI matches with every intermediate save restored and hidden hands omitted',()=>{
 for(const id of added)for(const mode of ['identity','team']){let s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:[id,'jifa','nezha','yangjian','jinling'],seed:31,...(mode==='team'?{roles:null,sides:[0,1,0,1,1],firstSeat:0}:{})}),steps=0;while(!s.winner&&steps++<1600){const seat=s.pending?.actor??s.current,v=playerView(s,seat);assert.ok(v.players.every(p=>p.seat===seat||p.hand.length===0));const a=chooseAI(v);assert.ok(a,id+' missing AI');s=step(s,a)}assert.ok(s.winner,id+' '+mode+' stalled '+steps)}
})
test('Sun can borrow new stage/active/recovery skills and restore does not require changing his permanent identity',()=>{
 for(const skill of ['liegong','kuanggu','shensu','jushou','qiangxi','mengjin']){let s=createAssignedGame({roles:['loyal','lord','rebel','rebel','renegade'],heroIds:['sunwukong','jifa','nezha','yangjian','jinling'],seed:71}),source=catalog.HEROES.find(h=>h.skills.includes(skill));s.players[0].incarnation.pool=[source.id];s=step(s,{type:'transform',heroId:source.id,skill});assert.equal(s.players[0].heroId,'zuoci');assert.equal(s.players[0].maxHp,3);assert.ok(hasSkill(s.players[0],skill));assert.ok(restoreGame(s))}
})
test('new prompt mode and face-down saves reject fabricated fields and old absent face-down field remains valid',()=>{
 const s=step(fixture('huangtianhua',4),{type:'end'});assert.ok(restoreGame(s));for(const mutate of [s=>s.pending.mode=3,s=>s.pending.event.seat=1,s=>s.pending.event.type='turnEnd',s=>s.players[0].faceDown='true']){const bad=structuredClone(s);mutate(bad);assert.equal(restoreGame(bad),null)}const old=fixture('houyi');assert.ok(restoreGame(old));assert.equal(old.players[0].faceDown,undefined)
})
