import { createGame, dispatch, allCards } from '../../.vuepress/components/sanguo/engine.mjs'
import { makeDeck, HERO_BY_ID, HEROES } from '../../.vuepress/components/sanguo/catalog.mjs'
import assert from 'node:assert/strict'

export function fixture(heroId='guanyu',role='lord',current=0) {
  const s=createGame({heroId,role,seed:123})
  s.deck=makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.logs=[];s.lastEvent=null;s.lastPlayed=null;s.suspicion=[0,0,0,0,0]
  const others=HEROES.filter(h=>h.id!==heroId)
  s.players.forEach((p,i)=>{p.heroId=i===0?heroId:others[i-1].id;p.maxHp=HERO_BY_ID[p.heroId].hp+(p.role==='lord'?1:0);p.hp=p.maxHp;p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.alive=true})
  return s
}
export function setHero(s,seat,id) {
  const other=s.players.find(p=>p.heroId===id)
  if(other)other.heroId=s.players[seat].heroId
  s.players[seat].heroId=id
  for(const p of s.players){p.maxHp=HERO_BY_ID[p.heroId].hp+(p.role==='lord'?1:0);p.hp=p.maxHp}
}
export function take(s,type,suit=null,rank=null) {
  const index=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit)&&(!rank||c.rank===rank))
  assert.ok(index>=0,`missing fixture card ${type} ${suit} ${rank}`)
  return s.deck.splice(index,1)[0]
}
export function hand(s,seat,...types) {const cards=types.map(type=>Array.isArray(type)?take(s,...type):take(s,type));s.players[seat].hand.push(...cards);return cards}
export function equipment(s,seat,type) {const card=take(s,type);const slots={bagua:'armor',renwang:'armor',chitu:'offenseHorse',dayuan:'offenseHorse',zixing:'offenseHorse',jueying:'defenseHorse',dilu:'defenseHorse',zhuahuang:'defenseHorse'};s.players[seat].equip[slots[type]||'weapon']=card;return card}
export function judgeTop(s,suit,rank) {const c=s.deck.find(c=>c.suit===suit&&c.rank===rank);assert.ok(c);s.deck.splice(s.deck.indexOf(c),1);s.deck.unshift(c);return c}
export function step(s,action) {const result=dispatch(s,{seat:s.pending?.actor??s.current,...action});assert.ok(result.ok,result.error+' '+JSON.stringify(action));check(result.state);return result.state}
export function play(s,card,target=null,as=card.type) {return step(s,{type:'play',ids:[card.id],as,targets:target==null?[]:Array.isArray(target)?target:[target]})}
export function pass(s) {return step(s,{type:'pass'})}
export function respond(s,card) {return step(s,{type:'respond',ids:Array.isArray(card)?card.map(c=>c.id):[card.id]})}
export function choose(s,value) {return step(s,{type:'choose',value})}
export function check(s) {const cards=allCards(s);assert.equal(cards.length,108,'all 108 physical cards are conserved');assert.equal(new Set(cards.map(c=>c.id)).size,108,'no physical card is duplicated')}
