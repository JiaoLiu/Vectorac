import assert from 'node:assert/strict'
import {createAssignedGame,militaryCatalog,dispatch,playerView,allCards,restoreGame} from '../.private/fengshen/engine.mjs'
export function effectBase(){const s=createAssignedGame({heroIds:['jifa','nezha','jinling','daji','yangjian'],roles:['lord','loyal','rebel','rebel','renegade'],seed:23,deckVersion:2});Object.assign(s,{deck:militaryCatalog.makeDeck(),discard:[],processing:[],queue:[],harvestPool:[],pending:null,phase:'play',current:0,logs:[],lastPlayed:null,lastResponse:null,publicReveal:null});for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0};p.hp=p.maxHp;p.chained=false}return s}
export function giveEffectCard(s,seat,type,suit){const i=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit));assert.ok(i>=0,type);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
export function effectStep(s,a){const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,160);assert.ok(restoreGame(r.state));return r.state}
export function chainEffectFixture({release=false,recast=false,repeat=false,counter=false}={}){
 const before=effectBase(),card=giveEffectCard(before,0,'ironchain');giveEffectCard(before,0,'sha');if(release||repeat)for(const t of [1,2])before.players[t].chained=true
 const nullify=counter?giveEffectCard(before,3,'nullify'):null,action={seat:0,type:'play',as:'ironchain',ids:[card.id],targets:recast?[]:[1,2],reset:release},after=effectStep(before,action)
 return {before,action,after,card,nullify,beforeView:playerView(before,0),afterView:playerView(after,0)}
}
export function fireEffectFixture({propagate=false,counter=false}={}){
 const initial=effectBase(),card=giveEffectCard(initial,0,'fireattack'),cost=giveEffectCard(initial,0,'tao','heart'),shown=giveEffectCard(initial,1,'shan','heart');giveEffectCard(initial,0,'sha')
 if(propagate)for(const t of [1,2,3])initial.players[t].chained=true
 const nullify=counter?giveEffectCard(initial,3,'nullify'):null,play={seat:0,type:'play',as:'fireattack',ids:[card.id],targets:[1]},played=effectStep(initial,play)
 if(counter)return {initial,play,played,card,cost,shown,nullify}
 assert.equal(played.pending.stage,'fire-show');const revealed=effectStep(played,{type:'invoke',value:'confirm',ids:[shown.id]});assert.equal(revealed.pending.stage,'reveal')
 const before=effectStep(revealed,{type:'invoke',value:'ack'});assert.equal(before.pending.stage,'fire-discard');const action={seat:0,type:'invoke',value:'confirm',ids:[cost.id]},after=effectStep(before,action)
 return {initial,play,played,revealed,before,action,after,card,cost,shown,beforeView:playerView(before,0),afterView:playerView(after,0)}
}
