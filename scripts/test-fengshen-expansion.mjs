import test from 'node:test'
import assert from 'node:assert/strict'
import {FENGSHEN_EXPANSION,EXPANSION_CARDS}from '../.private/fengshen/fengshen-expansion.mjs'
import{PLAYABLE_HEROES,makeExpandedDeck,HERO_BY_THEME_ID}from '../.private/fengshen/theme.mjs'
import{makeDeck as legacyDeck}from '../.private/fengshen/core/catalog.mjs'
import {catalog as runtimeCatalog} from '../.private/fengshen/engine.mjs'
import {createEngine} from '../.private/fengshen/core/engine.mjs'
import {createAI} from '../.private/fengshen/core/ai.mjs'
// Expansion mechanics remain regression-tested in isolation, NOT in the shipped Standard deck.
const experiment={...runtimeCatalog,theme:undefined,CARDS:{...runtimeCatalog.CARDS,...EXPANSION_CARDS},makeDeck:makeExpandedDeck,legacyMakeDeck:legacyDeck,deckVersion:2,animatedJudgments:true}
const E=createEngine(experiment),chooseAI=createAI(experiment)
const {dispatch,playerView,allCards,restoreGame}=E
const createGame=({heroId='jinzha',...opts}={})=>E.createGame({...opts,heroId:HERO_BY_THEME_ID[heroId].engineId})
import{cuesForAction}from '../.private/fengshen/voice.mjs'
function fixture(id='jinzha'){
 const s=createGame({heroId:id,role:'lord',seed:17});s.deck=makeExpandedDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastResponse=null;s.lastEvent=null
 const other=['huangfeihu','nezha','yangjian','dixin'].filter(h=>h!==id)
 s.players.slice(1).forEach((p,i)=>p.heroId=HERO_BY_THEME_ID[other[i]||'zeus'].engineId)
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp=HERO_BY_THEME_ID[PLAYABLE_HEROES.find(h=>h.engineId===p.heroId).id].hp+(p.role==='lord'?1:0);p.alive=true}
 return s
}
function give(s,seat,type,predicate=()=>true){const i=s.deck.findIndex(c=>c.type===type&&predicate(c));assert.ok(i>=0,type);const [c]=s.deck.splice(i,1);s.players[seat].hand.push(c);return c}
function equip(s,seat,type,slot){const c=give(s,seat,type);s.players[seat].hand.pop();s.players[seat].equip[slot]=c;return c}
function act(s,a){const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,r.error);return r.state}
function passAll(s){let i=0;while(s.pending&&i++<25)s=act(s,{type:s.pending.kind==='reveal'?'ack':'pass'});return s}
function slash(s,type='sha'){const c=give(s,0,type);return act(s,{type:'play',as:'sha',ids:[c.id],targets:[1]})}
test('draft expansion definitions stay isolated; shipped Standard profiles and legacy physical IDs stable',()=>{
 assert.equal(FENGSHEN_EXPANSION.length,12);assert.equal(PLAYABLE_HEROES.length,25);assert.equal(Object.keys(EXPANSION_CARDS).length,7)
 assert.ok(HERO_BY_THEME_ID.zhaogongming.playable);assert.ok(HERO_BY_THEME_ID.duobao.playable)
 assert.deepEqual(makeExpandedDeck().slice(0,108),legacyDeck());assert.equal(makeExpandedDeck().length,121)
})
test('Qixi actually converts black equipment into a counterable dismantle and can choose a hidden card',()=>{
 let s=fixture('zhaogongming');const c=equip(s,0,'qinggang','weapon');give(s,1,'shan');give(s,1,'nullify');
 const action=playerView(s,0).legal.find(a=>a.as==='dismantle'&&a.ids[0]===c.id&&a.targets[0]===1);assert.ok(action)
 s=act(s,action);assert.equal(s.pending.kind,'counter');s=act(s,{type:'pass'});assert.equal(s.pending.kind,'take');assert.equal(s.players[0].equip.weapon,null)
 const choice=playerView(s,0).legal.find(a=>a.hidden);assert.ok(!choice.card);s=act(s,choice);assert.equal(s.players[1].hand.length,1);assert.ok(s.discard.some(x=>x.id===c.id));assert.ok(restoreGame(s))
})
test('Qingguo uses black hand cards as Dodge, never black equipped cards',()=>{
 let s=fixture('shiji');s.current=1;const c=give(s,1,'sha');const black=give(s,0,'duel',x=>x.suit==='spade');equip(s,0,'qinggang','weapon')
 s=act(s,{seat:1,type:'play',as:'sha',ids:[c.id],targets:[0]});const v=playerView(s,0);assert.ok(v.legal.some(a=>a.type==='respond'&&a.ids[0]===black.id));assert.ok(!v.legal.some(a=>a.ids?.includes(s.players[0].equip.weapon.id)))
 const before=s,hp=s.players[0].hp,a=v.legal.find(a=>a.ids?.[0]===black.id);s=act(s,a);assert.equal(s.players[0].hp,hp);assert.ok(cuesForAction(before,a,s).some(c=>c.key==='skill-qingguo'))
})
test('Keji preserves excess hand cards without Slash, but a Slash used in play requires normal discard',()=>{
 let s=fixture('duobao');for(let i=0;i<8;i++)give(s,0,'shan');s=act(s,{type:'end'});assert.equal(s.players[0].hand.length,8);assert.ok(s.logs.some(l=>l.text.includes('自动发动藏宝')))
 s=fixture('duobao');for(let i=0;i<8;i++)give(s,0,'shan');s=passAll(slash(s));s=act(s,{type:'end'});assert.equal(s.pending.kind,'discard');assert.equal(s.pending.actor,0)
})
test('Keji also counts a Slash responded in a Duel during own play phase',()=>{
 let s=fixture('duobao');const c=give(s,0,'duel');give(s,0,'sha');give(s,1,'sha');for(let i=0;i<8;i++)give(s,0,'shan')
 s=act(s,{type:'play',as:'duel',ids:[c.id],targets:[1]});s=act(s,playerView(s,1).legal.find(a=>a.type==='respond'));s=act(s,playerView(s,0).legal.find(a=>a.type==='respond'));s=passAll(s);assert.equal(s.players[0].marks.shaInPlay,true);s=act(s,{type:'end'});assert.equal(s.pending.kind,'discard')
})
test('empty-hand bonus sword and drunk Slash damage stack, then wine is consumed',()=>{
 let s=fixture();equip(s,0,'guding','weapon');const wine=give(s,0,'wine');s=act(s,{type:'play',as:'wine',ids:[wine.id],targets:[]});const hp=s.players[1].hp;s=passAll(slash(s));assert.equal(s.players[1].hp,hp-3);assert.equal(s.players[0].marks.wine,0);assert.equal(s.players[0].marks.wineUsed,true);give(s,0,'wine');assert.ok(!playerView(s,0).legal.some(a=>a.as==='wine'))
})
test('Silver-lion armor caps damage and recovers exactly once when replaced',()=>{
 let s=fixture();equip(s,0,'guding','weapon');equip(s,1,'silverlion','armor');const hp=s.players[1].hp;s=passAll(slash(s));assert.equal(s.players[1].hp,hp-1)
 s=fixture();equip(s,0,'silverlion','armor');s.players[0].hp-=2;const before=s.players[0].hp,c=give(s,0,'bagua');s=act(s,{type:'play',as:'bagua',ids:[c.id],targets:[]});assert.equal(s.players[0].hp,before+1);assert.equal(s.players[0].equip.armor.type,'bagua');assert.ok(restoreGame(s))
})
test('Silver-lion armor recovers its owner when stolen, not the thief',()=>{
 let s=fixture();const armor=equip(s,1,'silverlion','armor');s.players[1].hp--;const hp=s.players[1].hp,c=give(s,0,'snatch');s=act(s,{type:'play',as:'snatch',ids:[c.id],targets:[1]});s=act(s,{type:'choose',value:armor.id});assert.equal(s.players[1].hp,hp+1);assert.ok(s.players[0].hand.some(c=>c.id===armor.id))
})
test('Vine-style flag blocks normal Slash, fire hits for two, thunder hits for one',()=>{
 for(const [type,loss]of [['sha',0],['firesha',2],['thundersha',1]]){let s=fixture();equip(s,1,'vine','armor');const hp=s.players[1].hp;s=passAll(slash(s,type));assert.equal(s.players[1].hp,hp-loss,type);assert.ok(restoreGame(s))}
})
test('Fan choice changes only normal Slash to fire, persists across restore and can be declined',()=>{
 for(const yes of [true,false]){let s=fixture();equip(s,0,'fan','weapon');equip(s,1,'vine','armor');const hp=s.players[1].hp;s=slash(s);assert.equal(s.pending.skill,'fan');assert.ok(restoreGame(s));s=act(s,{type:'choose',value:yes?'yes':'no'});s=passAll(s);assert.equal(s.players[1].hp,hp-(yes?2:0))}
 let s=fixture();equip(s,0,'fan','weapon');s=slash(s,'thundersha');assert.notEqual(s.pending?.skill,'fan')
})
test('Qinggang ignores armor damage cap and flag immunity',()=>{
 let s=fixture();equip(s,0,'qinggang','weapon');equip(s,1,'silverlion','armor');const wine=give(s,0,'wine');s=act(s,{type:'play',as:'wine',ids:[wine.id],targets:[]});const hp=s.players[1].hp;s=passAll(slash(s));assert.equal(s.players[1].hp,hp-2)
 s=fixture();equip(s,0,'qinggang','weapon');equip(s,1,'vine','armor');const h=s.players[1].hp;s=passAll(slash(s));assert.equal(s.players[1].hp,h-1)
})
test('wine rescues self only, cannot be used to rescue another seat',()=>{
 let s=fixture();s.current=1;s.players[0].hp=1;const wine=give(s,0,'wine'),sha=give(s,1,'sha');s=act(s,{seat:1,type:'play',as:'sha',ids:[sha.id],targets:[0]});s=act(s,{type:'pass'});assert.equal(s.pending.kind,'rescue');const a=playerView(s,0).legal.find(a=>a.as==='wine');assert.ok(a);s=act(s,a);assert.equal(s.players[0].hp,1);assert.equal(s.lastResponse.as,'wine')
 s=fixture();give(s,0,'wine');s.current=2;s.players[1].hp=1;const c=give(s,2,'sha');s=act(s,{seat:2,type:'play',as:'sha',ids:[c.id],targets:[1]});s=passAll(s);assert.equal(s.players[1].alive,false)
})
test('new saves enforce 121 canonical cards, legacy saves stay 108 without injected cards',()=>{
 const s=createGame({seed:8});assert.ok(restoreGame(s));const corrupted=structuredClone(s);corrupted.deck.pop();assert.equal(restoreGame(corrupted),null)
 const old=structuredClone(s);delete old.deckVersion;const extra=c=>Number(c.id.slice(1))>=108;for(const key of ['deck','discard','processing','harvestPool'])old[key]=old[key].filter(c=>!extra(c));for(const p of old.players){p.hand=p.hand.filter(c=>!extra(c));for(const key of Object.keys(p.equip))if(p.equip[key]&&extra(p.equip[key]))p.equip[key]=null}old.lastPlayed=null;old.lastResponse=null;old.pending=null;old.queue=[];old.phase='play';old.current=old.players.find(p=>p.alive).seat
 const restored=restoreGame(old);assert.ok(restored);assert.equal(allCards(restored).length,108);const r=dispatch(restored,{type:'end',seat:restored.current});assert.ok(r.ok);assert.equal(allCards(r.state).length,108)
})
test('150 seeded expanded AI games terminate without cheating or losing canonical cards',()=>{
 for(let seed=0;seed<150;seed++){let s=createGame({heroId:PLAYABLE_HEROES[seed%PLAYABLE_HEROES.length].id,seed:seed+700});let n=0;while(!s.winner&&n++<6000){const seat=s.pending?.actor??s.current,v=playerView(s,seat);for(const p of v.players)if(p.seat!==seat)assert.equal(p.hand.length,0);s=act(s,chooseAI(v));if(n%100===0)assert.ok(restoreGame(s),`restore seed ${seed}`)}assert.ok(s.winner,`seed ${seed}`);assert.equal(allCards(s).length,121)}
})
