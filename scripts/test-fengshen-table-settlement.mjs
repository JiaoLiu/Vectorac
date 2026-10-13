import test from 'node:test'
import assert from 'node:assert/strict'
import {TableSettlement} from '../site/.vuepress/components/fengshen/table-settlement.mjs'
import {tableTrail,tableChainKey,trailCards} from '../site/.vuepress/components/fengshen/table-trail.mjs'
import {createAssignedGame,catalog,dispatch,playerView,allCards} from '../site/.vuepress/components/fengshen/engine.mjs'
const fixture=()=>{const s=createAssignedGame({heroIds:['yangjian','jifa','nezha','dixin','moliqing'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37});Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],queue:[],pending:null,lastPlayed:null,lastResponse:null,exchange:null,phase:'play',current:0});for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0}}return s}
const card=(s,seat,type)=>{const c=s.deck.splice(s.deck.findIndex(c=>c.type===type),1)[0];assert.ok(c);s.players[seat].hand.push(c);return c}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,108);return r.state}
test('settled chain fades only after animations; old lastPlayed cannot reappear on render',()=>{
 let now=0;const d=new TableSettlement({now:()=>now}),v={turns:1,lastPlayed:{id:7,turn:1,cards:[catalog.makeDeck()[0]],source:0,as:'sha'},pending:null}
 assert.equal(d.frame(v,{busy:true}).closedChain,null);now=3000;assert.equal(d.frame(v,{busy:true}).closedChain,null)
 assert.equal(d.frame(v).fading,false);now+=400;assert.equal(d.frame(v).fading,true);now+=181;assert.equal(d.frame(v).closedChain,tableChainKey(v))
 assert.deepEqual(tableTrail([],v,{closedChain:d.closedChain}),[])
 now+=10000;assert.equal(d.frame(v).closedChain,tableChainKey(v));v.lastPlayed={...v.lastPlayed,id:8};assert.equal(d.frame(v,{busy:true}).closedChain,null)
 assert.equal(tableTrail([],v,{closedChain:d.closedChain}).length,1)
})
test('Slash/Dodge stay during Axe forced-hit choice, disappear after real completion',()=>{
 let s=fixture(),now=0;const d=new TableSettlement({now:()=>now}),sha=card(s,0,'sha'),shan=card(s,1,'shan'),axe=card(s,0,'axe');s.players[0].hand.pop();s.players[0].equip.weapon=axe
 const costs=[card(s,0,'shan'),card(s,0,'tao')];s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[1]});let trail=tableTrail([],playerView(s,0));s=step(s,{type:'respond',ids:[shan.id]});assert.equal(s.pending.kind,'axe');const v=playerView(s,0);trail=tableTrail(trail,v)
 now=50000;assert.equal(d.frame(v).closedChain,null);assert.equal(trailCards(trail).length,2)
 s=step(s,{type:'respond',ids:costs.map(c=>c.id)});assert.equal(s.pending,null);assert.equal(s.players[1].hp,3);const done=playerView(s,0);d.frame(done);now+=581
 assert.deepEqual(tableTrail(trail,done,{closedChain:d.frame(done).closedChain}),[])
})
test('AOE remains across every response, clears only after last victim and animation',()=>{
 let s=fixture(),now=0;const d=new TableSettlement({now:()=>now}),spell=card(s,0,'arrows');for(let i=1;i<5;i++)card(s,i,'shan')
 s=step(s,{type:'play',as:'arrows',ids:[spell.id],targets:[]});let trail=[]
 for(let i=0;i<4;i++){const v=playerView(s,0);assert.ok(v.pending);now+=5000;assert.equal(d.frame(v).closedChain,null);trail=tableTrail(trail,v);assert.ok(trailCards(trail).some(e=>e.card.id===spell.id));s=step(s,{type:'respond',ids:[s.players[s.pending.actor].hand.find(c=>c.type==='shan').id]})}
 assert.equal(s.pending,null);const v=playerView(s,0);trail=tableTrail(trail,v);assert.equal(trailCards(trail).length,5);d.frame(v,{busy:true});now+=5000;d.frame(v);now+=581;assert.deepEqual(tableTrail(trail,v,{closedChain:d.frame(v).closedChain}),[])
})
test('new draw spell or AOE replaces resolved Slash/Dodge immediately; no stale reveal',()=>{
 const v={turns:1,lastPlayed:{id:1,source:0,as:'sha',cards:[catalog.makeDeck()[0]],turn:1},exchange:[{}, {source:1,as:'shan',cards:[catalog.makeDeck()[1]]}]}
 let trail=tableTrail([],v);assert.equal(trailCards(trail).length,2)
 v.lastPlayed={...v.lastPlayed,id:2,as:'draw',cards:[catalog.makeDeck()[2]]};v.exchange=null;v.publicReveal={id:1,turn:1,owner:1,cards:[catalog.makeDeck()[3]]};trail=tableTrail(trail,v)
 assert.equal(trailCards(trail).length,1);assert.equal(trailCards(trail)[0].card.id,catalog.makeDeck()[2].id)
})
test('follow-up weapons, redirection, judgments and rescue keep the chain open',()=>{
 let now=0;const d=new TableSettlement({now:()=>now}),v={turns:1,phase:'play',lastPlayed:{id:1,turn:1}}
 for(const kind of ['axe','blade','liuli','rescue','judge-replace','reveal','choice','ext','counter','response','support','yiji','discard']){v.pending={kind};now+=5000;assert.equal(d.frame(v).closedChain,null,kind);assert.equal(d.frame(v).remaining,0)}
})
