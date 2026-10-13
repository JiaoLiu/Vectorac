import assert from 'node:assert/strict'
import {createAssignedGame,militaryCatalog,dispatch,playerView} from '../.private/fengshen/engine.mjs'
export function judgmentFixture(effect,{hit=true,owner='jifa'}={}){
 const s=createAssignedGame({heroIds:effect==='leiji'?['randeng','yangjian','jinling','daji','nezha']:[owner,'yangjian','jinling','daji','nezha'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37,deckVersion:2})
 Object.assign(s,{deck:militaryCatalog.makeDeck(),discard:[],processing:[],queue:[],harvestPool:[],pending:null,phase:'play',current:effect==='leiji'?1:4,logs:[],lastPlayed:null,lastResponse:null,publicReveal:null})
 for(const p of s.players){p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.hp=p.maxHp;p.marks={sha:0}}
 const take=match=>{const i=s.deck.findIndex(typeof match==='function'?match:c=>c.type===match);assert.ok(i>=0,String(match));return s.deck.splice(i,1)[0]}
 let before=s,action
 const step=(st,a)=>{const r=dispatch(st,{seat:st.pending?.actor??st.current,...a});assert.ok(r.ok,r.error);return r.state}
 if(effect==='leiji'){
  const attack=take('sha'),dodge=take('shan');s.players[1].hand.push(attack);s.players[0].hand.push(dodge)
  const judge=take(c=>c.suit===(hit?'spade':'club')&&c.rank>=2&&c.rank<=9);s.deck.unshift(judge)
  before=step(s,{seat:1,type:'play',as:'sha',ids:[attack.id],targets:[0]});before=step(before,{type:'respond',as:'shan',ids:[dodge.id]})
  assert.equal(before.pending.skill,'leiji');action={seat:0,type:'invoke',value:'confirm',target:1,ids:[]}
 }else{
  s.players[0].judgment.push(take(effect))
  const suit=effect==='indulgence'?hit?'spade':'heart':effect==='supplyshortage'?hit?'heart':'club':hit?'spade':'heart'
  s.deck.unshift(take(c=>c.suit===suit&&c.rank>=2&&c.rank<=9));action={seat:4,type:'end'}
 }
 const after=step(before,action);assert.equal(after.pending.kind,'reveal');assert.equal(after.pending.delayType,effect)
 return {before,action,after,beforeView:playerView(before,0),afterView:playerView(after,0)}
}
