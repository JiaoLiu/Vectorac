import test from 'node:test'
import assert from 'node:assert/strict'
import {GODS} from '../.private/fengshen/gods.mjs'
import {HEROES,PLAYABLE_HEROES,heroForBase,skillName,skillHelp,ALLIANCES} from '../.private/fengshen/theme.mjs'
import {catalog,createGame,createAssignedGame,dispatch,playerView,restoreGame,allCards,chooseAI} from '../.private/fengshen/engine.mjs'
import {createSetup,dispatchSetup,restoreSetup} from '../.private/fengshen/setup.mjs'
import {cuesForAction} from '../.private/fengshen/voice.mjs'
import {AUDIO_ENTRIES,skillAudioKey} from '../.private/fengshen/audio-manifest.mjs'
import {HEROES as CLASSIC,SKILLS,makeDeck} from '../.private/fengshen/core/catalog.mjs'
import {createGame as classicGame,playerView as classicView} from '../.private/fengshen/core/engine.mjs'
import {chooseAI as classicAI} from '../.private/fengshen/core/ai.mjs'
const roles=['lord','loyal','rebel','rebel','renegade']
function fixture(id){
 const s=createAssignedGame({heroIds:[id,...GODS.filter(h=>h.id!==id).slice(0,4).map(h=>h.id)],roles,seed:17})
 s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0,rende:0};p.hp=p.maxHp}
 return s
}
function give(s,seat,type){const i=s.deck.findIndex(c=>c.type===type);assert.ok(i>=0);const [c]=s.deck.splice(i,1);s.players[seat].hand.push(c);return c}
function act(s,a){const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,r.error);return r.state}
test('20 new independent IDs with unique skill sets; classic catalog untouched',()=>{
 assert.equal(GODS.length,20);assert.equal(PLAYABLE_HEROES.length,43);assert.equal(HEROES.length,52)
 assert.equal(new Set(GODS.map(h=>Object.keys(h.skillNames).sort().join('|'))).size,20)
 for(const h of GODS){assert.equal(heroForBase(h.id),h);assert.equal(h.engineId,h.id);assert.equal(catalog.HERO_BY_ID[h.id].faction,ALLIANCES[h.faction]);for(const s of Object.keys(h.skillNames))assert.ok(SKILLS[s]);assert.ok(!CLASSIC.some(x=>x.id===h.id))}
})
test('every new god can be assigned, restored and run through legal AI turns',()=>{
 for(let seed=0;seed<100;seed++){
  let s=createGame({heroId:GODS[seed%20].id,seed:seed+200,role:['lord','loyal','rebel','renegade'][seed%4]})
  let steps=0
  while(!s.winner&&steps++<5000){const seat=s.pending?.actor??s.current;const v=playerView(s,seat);for(const p of v.players)if(p.seat!==seat)assert.equal(p.hand.length,0);const a=chooseAI(v);assert.ok(a,`seed ${seed}`);s=act(s,a);if(steps%100===0){assert.ok(restoreGame(s));assert.equal(allCards(s).length,121)}}
  assert.ok(s.winner,`seed ${seed} stalled`);assert.equal(allCards(s).length,121)
 }
})
test('Sun Wukong converts Dodge to Slash and can use Slash repeatedly',()=>{
 let s=fixture('sunwukong');give(s,0,'shan');give(s,0,'sha');const first=playerView(s,0).legal.find(a=>a.type==='play'&&a.as==='sha'&&s.players[0].hand.find(c=>c.id===a.ids[0])?.type==='shan');assert.ok(first);s=act(s,first)
 while(s.pending)s=act(s,{type:'pass'})
 assert.ok(playerView(s,0).legal.some(a=>a.type==='play'&&a.as==='sha'));assert.equal(skillName('sunwukong','paoxiao'),'大闹天宫')
})
test('Thor attack requires two Dodge responses',()=>{
 let s=fixture('thor'),c=give(s,0,'sha');give(s,1,'shan');give(s,1,'shan');s=act(s,{type:'play',as:'sha',ids:[c.id],targets:[1]});assert.equal(s.pending.kind,'response');assert.equal(s.pending.remaining,2)
 const dodge=playerView(s,1).legal.find(a=>a.type==='respond');s=act(s,dodge);assert.equal(s.pending.remaining,1)
})
test('Apollo automatically draws three at start and uses a character-specific oracle cue',()=>{
 const start=createGame({heroId:'apollo',role:'lord',seed:7});assert.equal(start.players[0].hand.length,7);assert.notEqual(start.pending?.skill,'yingzi')
 let s=fixture('apollo'),c=give(s,0,'draw'),a={seat:0,type:'play',as:'draw',ids:[c.id],targets:[]},next=act(s,a);assert.equal(next.players[0].hand.length,3)
 assert.ok(next.logs.some(l=>l.text.includes('阿波罗自动发动神谕')));assert.deepEqual(cuesForAction(s,a,next),[{key:'card-draw',sex:'male'},{key:'skill-apollo-jizhi',sex:'male'}])
})
test('Hades health-for-cards and Nuwa gifting/healing actually resolve',()=>{
 let s=fixture('hades'),hp=s.players[0].hp;s=act(s,{type:'skill',skill:'kurou'});assert.equal(s.players[0].hp,hp-1);assert.equal(s.players[0].hand.length,2);assert.ok(s.logs.some(l=>l.text.includes('冥契')))
 s=fixture('nuwa');s.players[0].hp--;const before=s.players[0].hp,ids=[give(s,0,'sha').id,give(s,0,'shan').id];const next=act(s,{type:'skill',skill:'rende',ids,target:1});assert.equal(next.players[0].hp,before+1);assert.equal(next.players[1].hand.length,2);assert.ok(next.logs.some(l=>l.text.includes('补天')));assert.equal(cuesForAction(s,{seat:0,type:'skill',skill:'rende'},next)[0].sex,'female')
})
test('god-specific names and every sex-specific audio key are independent',()=>{
 for(const h of GODS)for(const [skill,name]of Object.entries(h.skillNames)){assert.equal(skillName(h.id,skill),name);assert.ok(skillHelp(h,skill));assert.ok(AUDIO_ENTRIES.some(e=>e.key===skillAudioKey(h.id,skill)&&e.text===name))}
 assert.equal(AUDIO_ENTRIES.length,117);assert.notEqual(skillAudioKey('apollo','jizhi'),skillAudioKey('odin','jizhi'))
})
test('old two-candidate drafts remain loadable without rerolling identity or offers',()=>{
 let setup=createSetup({seed:2});setup.offers[setup.lord]=['jifa','dixin','yunzhongzi','nezha','yangjian'];setup.candidateCount=2
 setup=dispatchSetup(setup,{seat:0,type:'reveal'}).setup;setup=dispatchSetup(setup,{seat:setup.lord,type:'pick',heroId:'jifa'}).setup
 assert.deepEqual(restoreSetup(setup),setup);assert.ok(setup.offers.filter((_,i)=>i!==setup.lord).every(x=>x.length===2))
})
test('god AI decisions stay invariant under concealed opponents state permutations',()=>{
 const s=createGame({heroId:'zeus',seed:28}),seat=s.pending?.actor??s.current,v=playerView(s,seat),altered=structuredClone(s)
 for(const p of altered.players)if(p.seat!==seat){p.hand.reverse();if(p.role==='rebel')p.role='renegade';else if(p.role==='renegade')p.role='rebel'}
 assert.deepEqual(chooseAI(v),chooseAI(playerView(altered,seat)))
 const classic=classicGame({seed:4});assert.ok(classicAI(classicView(classic,classic.pending?.actor??classic.current)))
})
