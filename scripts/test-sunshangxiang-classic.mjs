import test from 'node:test'
import assert from 'node:assert/strict'
import *as base from '../.private/fengshen/core/catalog.mjs'
import {createEngine}from '../.private/fengshen/core/engine.mjs'
import {createAI}from '../.private/fengshen/core/ai.mjs'
function engine(auto=true){const E=createEngine({...base,automaticSkills:auto?['xiaoji']:[]});return E}
function fixture(E){
 const s=E.createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['sunshangxiang','liubei','guanyu','zhangfei','huangyueying'],seed:19});s.deck=base.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastEvent=null;s.lastPlayed=null
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp}
 return s
}
function card(s,seat,type){const i=s.deck.findIndex(c=>c.type===type);assert.ok(i>=0);const [c]=s.deck.splice(i,1);s.players[seat].hand.push(c);return c}
function equip(s,seat,type){const c=card(s,seat,type);s.players[seat].hand.pop();s.players[seat].equip[base.CARDS[type].slot]=c;return c}
function act(E,s,a){const r=E.dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);return r.state}
test('full Sun Shangxiang has only Jieyin and Xiaoji; no Rende or Jizhi',()=>{assert.deepEqual(base.HERO_BY_ID.sunshangxiang.skills,['jieyin','xiaoji']);assert.equal(base.HERO_BY_ID.sunshangxiang.hp,3);assert.equal(base.HERO_BY_ID.sunshangxiang.sex,'female');assert.equal(base.HERO_BY_ID.sunshangxiang.faction,'wu')})
test('Jieyin discards exactly two HAND cards, heals self and injured male once per play phase',()=>{
 const E=engine(),s=fixture(E);s.players[0].hp--;s.players[1].hp--;const ids=[card(s,0,'sha').id,card(s,0,'shan').id];card(s,0,'sha');card(s,0,'shan');const hp=s.players.map(p=>p.hp),r=act(E,s,{type:'skill',skill:'jieyin',ids,target:1});assert.equal(r.players[0].hp,hp[0]+1);assert.equal(r.players[1].hp,hp[1]+1);assert.ok(ids.every(id=>r.discard.some(c=>c.id===id)));assert.equal(r.players[1].hand.length,0);assert.ok(!E.legalActions(r,0).some(a=>a.skill==='jieyin'));assert.ok(E.restoreGame(r))
})
test('Jieyin rejects uninjured male, female, self, duplicated IDs and equipment-as-cost',()=>{
 for(const variant of ['full','female','self','repeat','equip']){const E=engine(),s=fixture(E);s.players[1].hp--;s.players[4].hp--;let ids=[card(s,0,'sha').id,card(s,0,'shan').id],target=1;if(variant==='full')s.players[1].hp=s.players[1].maxHp;if(variant==='female')target=4;if(variant==='self')target=0;if(variant==='repeat')ids=[ids[0],ids[0]];if(variant==='equip')ids[1]=equip(s,0,'bagua').id;const r=E.dispatch(s,{seat:0,type:'skill',skill:'jieyin',ids,target});assert.equal(r.ok,false,variant);assert.deepEqual(r.state,s)}
})
test('using a normal trick does NOT draw an extra card for Sun Shangxiang',()=>{const E=engine();let s=fixture(E),c=card(s,0,'draw');s=act(E,s,{type:'play',as:'draw',ids:[c.id],targets:[]});assert.equal(s.players[0].hand.length,2)})
test('Xiaoji draws two after equipment replacement, never on equipping from an empty slot',()=>{
 const E=engine();let s=fixture(E),first=card(s,0,'bagua');s=act(E,s,{type:'play',as:'bagua',ids:[first.id],targets:[]});assert.equal(s.players[0].hand.length,0);const next=card(s,0,'renwang');s=act(E,s,{type:'play',as:'renwang',ids:[next.id],targets:[]});assert.equal(s.players[0].hand.length,2);assert.ok(E.restoreGame(s))
})
test('stolen equipment grants two cards to its former owner; thief gets only the equipment',()=>{
 const E=engine();let s=fixture(E),armor=equip(s,0,'bagua');s.current=1;const c=card(s,1,'snatch');s=act(E,s,{seat:1,type:'play',as:'snatch',ids:[c.id],targets:[0]});s=act(E,s,{seat:1,type:'choose',value:armor.id});assert.equal(s.players[0].hand.length,2);assert.deepEqual(s.players[1].hand.map(c=>c.id),[armor.id]);assert.ok(E.restoreGame(s))
})
test('discarding a hand card does not trigger Xiaoji; standard core preserves optional trigger',()=>{
 const E=engine(false);let s=fixture(E);equip(s,0,'bagua');const c=card(s,0,'renwang');s=act(E,s,{type:'play',as:'renwang',ids:[c.id],targets:[]});assert.equal(s.pending.skill,'xiaoji');assert.ok(E.restoreGame(s));s=act(E,s,{type:'choose',value:'no'});assert.equal(s.players[0].hand.length,0)
})
test('canonical Sun Shangxiang AI picks legal Jieyin on a wounded male ally without hidden state',()=>{
 const E=engine(),s=fixture(E),AI=createAI({...base});s.players[0].hp--;s.players[1].hp--;s.suspicion[1]=-3;card(s,0,'sha');card(s,0,'shan');const a=AI(E.playerView(s,0));assert.equal(a.skill,'jieyin');assert.equal(a.target,1);assert.ok(E.dispatch(s,a).ok)
})
test('collateral refusal loses equipped weapon and triggers Xiaoji exactly once',()=>{
 const E=engine();let s=fixture(E);s.current=1;const weapon=equip(s,0,'qinggang'),c=card(s,1,'collateral');s=act(E,s,{type:'play',as:'collateral',ids:[c.id],targets:[0,1]});s=act(E,s,{type:'pass'});assert.equal(s.players[0].equip.weapon,null);assert.equal(s.players[0].hand.length,2);assert.ok(s.players[1].hand.some(c=>c.id===weapon.id));assert.ok(E.restoreGame(s))
})
