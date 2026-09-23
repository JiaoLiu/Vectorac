import test from 'node:test'
import assert from 'node:assert/strict'
import * as E from '../.vuepress/components/balatro/engine.mjs'
import { HANDS,JOKERS,TAROTS,SPECTRALS,VOUCHERS,BOSSES,DECKS } from '../.vuepress/components/balatro/catalog.mjs'
import { cardCue } from '../.vuepress/components/balatro/cues.mjs'

const cards=(ranks,suits=[])=>ranks.map((rank,i)=>({uid:i+1,rank,suit:suits[i]===undefined?i%4:suits[i],enh:null,edition:null,seal:null}))
const state=(ranks=[14,14,13,12,10,8,4,2],suits=[])=>{
 const s=E.newRun('REGRESSION');E.startBlind(s)
 s.hand=cards(ranks,suits);s.deck=E.clone(s.hand);s.uid=100;s.draw=[];s.spent=[];s.selected=[]
 return s
}
const add=(s,id,edition)=>{const j=E.makeJoker(s,id,edition);s.jokers.push(j);return j}
const play=(s,ids)=>{s.selected=ids;return E.play(s)}

test('all catalog identifiers are unique, full core card sets are present',()=>{
 assert.equal(JOKERS.length,150);assert.equal(TAROTS.length,22);assert.equal(SPECTRALS.length,18);assert.equal(VOUCHERS.length,32);assert.equal(DECKS.length,15)
 for(const list of [JOKERS,TAROTS,SPECTRALS,VOUCHERS,BOSSES,DECKS,HANDS])assert.equal(new Set(list.map(c=>c.id)).size,list.length)
})
const examples=[['high',[14,11,9,5,2]],['pair',[8,8,13,5,2]],['two',[8,8,4,4,2]],['three',[8,8,8,5,2]],['straight',[14,2,3,4,5]],['flush',[14,11,9,5,2],[1,1,1,1,1]],['full',[8,8,8,5,5]],['four',[8,8,8,8,2]],['sf',[5,6,7,8,9],[2,2,2,2,2]],['five',[8,8,8,8,8]],['ffull',[8,8,8,5,5],[1,1,1,1,1]],['ffive',[8,8,8,8,8],[0,0,0,0,0]]]
for(const [id,ranks,suits]of examples)test(`poker classification: ${id}`,()=>assert.equal(E.evaluate(cards(ranks,suits)).id,id))
test('A only wraps at the low end of straights',()=>{assert.equal(E.evaluate(cards([12,13,14,2,3])).id,'high');assert.equal(E.evaluate(cards([10,11,12,13,14])).id,'straight')})
test('only matching cards score; A=11, courts=10',()=>{
 const s=state();const result=play(s,[1,2,3,4,5]);assert.equal(result.chips,32);assert.equal(result.mult,2);assert.equal(result.total,64)
 const t=state([13,9,8,5,2]);assert.equal(play(t,[1]).total,15)
})
test('four of a kind excludes the kicker',()=>{const s=state([8,8,8,8,14]);assert.equal(play(s,[1,2,3,4,5]).chips,92)})
test('stone always scores but cannot form a pair',()=>{const s=state([5,5,14,9,8]);s.hand[0].enh=s.deck[0].enh='stone';const r=play(s,[1,2,3]);assert.equal(r.id,'high');assert.equal(r.chips,66)})
test('splash includes non-matching kickers',()=>{const s=state();add(s,'splash');assert.equal(play(s,[1,2,3]).chips,42)})
test('four fingers, shortcut and smeared alter evaluator, not card values',()=>{
 const s=state();add(s,'fourfingers');assert.equal(E.evaluate(cards([2,3,4,5]),s).id,'straight')
 add(s,'shortcut');assert.equal(E.evaluate(cards([2,4,6,8]),s).id,'straight')
 add(s,'smeared');assert.equal(E.evaluate(cards([2,3,8,11,14],[1,3,1,3,1]),s).id,'flush')
})
test('joker order changes score; Blueprint copies effects without recursion',()=>{
 const a=state();add(a,'joker');add(a,'duo');assert.equal(play(a,[1,2]).mult,12)
 const b=state();add(b,'duo');add(b,'joker');assert.equal(play(b,[1,2]).mult,8)
 const c=state();add(c,'blueprint');add(c,'joker');assert.equal(play(c,[1,2]).mult,10)
 const d=state();add(d,'blueprint');add(d,'brainstorm');assert.equal(play(d,[1,2]).mult,2)
})
test('held steel and Baron precede joker additions',()=>{
 const s=state();s.hand[2].enh=s.deck[2].enh='steel';add(s,'baron');add(s,'joker');assert.equal(play(s,[1,2]).mult,8.5)
})
test('red seals retrigger scoring; holographic joker editions add before effects',()=>{
 const s=state([14,2,3,7,9]);s.hand[0].seal=s.deck[0].seal='red';assert.equal(play(s,[1]).chips,27)
 const t=state();add(t,'duo','holo');assert.equal(play(t,[1,2]).mult,24)
})
test('round stages enforce single cashout, single purchase, no double advancement',()=>{
 const s=state([10,11,12,13,14],[1,1,1,1,1]);play(s,[1,2,3,4,5]);assert.equal(s.phase,'reward');const money=s.money
 assert.throws(()=>E.play(s));E.cashOut(s);assert.equal(s.phase,'shop');assert.equal(s.money,money);assert.throws(()=>E.cashOut(s))
 s.money=100;const card=s.shop.cards[0],fee=E.itemCost(s,card);E.buy(s,card.uid);assert.equal(s.money,100-fee);assert.throws(()=>E.buy(s,card.uid))
 E.nextBlind(s);assert.equal(s.phase,'select');assert.equal(s.blind,1);assert.throws(()=>E.nextBlind(s))
})
test('skip cannot bypass Boss and tags are single use',()=>{const s=E.newRun('SKIP');E.skipBlind(s);assert.equal(s.money,19);E.skipBlind(s);assert.equal(s.blind,2);assert.throws(()=>E.skipBlind(s))})
test('Psychic invalid hand consumes a play but scores zero',()=>{const s=state();s.blind=2;s.boss='psychic';const r=play(s,[1]);assert.equal(r.total,0);assert.equal(s.hands,3)})
test('debuffed cards retain base hand scoring; Chicot removes debuffs',()=>{
 const s=state([8,8,5,3,2],[1,1,0,2,3]);s.blind=2;s.boss='head';assert.equal(play(s,[1,2]).total,20)
 const t=state([8,8,5,3,2],[1,1,0,2,3]);t.blind=2;t.boss='head';add(t,'chicot');assert.equal(play(t,[1,2]).total,52)
})
test('Water/Needle/Manacle override resource counts; face-up replacement for House',()=>{
 for(const boss of ['water','needle','manacle']){const s=E.newRun('BOSS');s.blind=2;s.boss=boss;E.startBlind(s);if(boss==='water')assert.equal(s.discards,0);if(boss==='needle')assert.equal(s.hands,1);if(boss==='manacle')assert.equal(s.hand.length,7)}
 const s=E.newRun('HOUSE');s.blind=2;s.boss='house';E.startBlind(s);assert.ok(s.hand.every(c=>c.hidden));s.selected=[s.hand[0].uid];E.discard(s);assert.equal(s.hand.filter(c=>!c.hidden).length,1)
})
test('boss Bell selection stays mandatory and refreshes after discard',()=>{const s=E.newRun('BELL');s.blind=2;s.boss='bell';E.startBlind(s);const old=s.forced;assert.ok(s.selected.includes(old));E.selectCard(s,old);assert.ok(s.selected.includes(old));E.discard(s);assert.notEqual(s.forced,old);assert.ok(s.selected.includes(s.forced))})
test('planet cards persist hand levels and grow Constellation',()=>{
 const s=state(),j=add(s,'constellation');s.consumables=[{uid:500,kind:'planet',id:'pair'}];E.use(s,500);assert.equal(s.levels.pair,2);assert.equal(s.consumables.length,0);assert.equal(s.jokers.find(x=>x.uid===j.uid).value,1.1)
})
test('tarot failed target is atomic; Death follows hand order; changes survive restore',()=>{
 const s=state();s.consumables=[{uid:500,kind:'tarot',id:'death'}];const old=JSON.stringify(s);assert.throws(()=>E.use(s,500));assert.equal(JSON.stringify(s),old)
 s.hand=[s.hand[4],s.hand[0],...s.hand.filter(c=>c.uid!==5&&c.uid!==1)];s.selected=[1,5];E.use(s,500);assert.equal(s.deck.find(c=>c.uid===5).rank,14)
 assert.ok(E.restore(JSON.stringify(s)));assert.equal(E.restore(s).hand[0].rank,14)
})
test('destruction, Fool and Hermit accounting',()=>{
 const s=state();s.consumables=[{uid:500,kind:'tarot',id:'hanged'}];s.selected=[1,2];E.use(s,500);assert.equal(s.deck.length,6)
 s.money=35;s.consumables=[{uid:501,kind:'tarot',id:'hermit'}];E.use(s,501);assert.equal(s.money,55)
 s.consumables=[{uid:502,kind:'tarot',id:'fool'}];E.use(s,502);assert.equal(s.consumables[0].id,'hermit')
})
test('capacity, negative editions, credit and permanent jokers',()=>{
 const s=state();for(const j of ['joker','jolly','zany','mad','crazy'])add(s,j);assert.equal(E.slots(s),5)
 s.jokers[0].edition='negative';assert.equal(E.slots(s),6)
 s.jokers[0].eternal=true;assert.throws(()=>E.sell(s,s.jokers[0].uid));s.jokers[0].eternal=false;E.sell(s,s.jokers[0].uid);assert.equal(E.slots(s),5)
 s.money=0;assert.equal(E.canPay(s,1),false);add(s,'credit');assert.equal(E.canPay(s,20),true);assert.equal(E.canPay(s,21),false)
})
test('all 15 decks initialize valid resources, all 8 stakes roundtrip',()=>{
 for(const d of DECKS)for(let stake=0;stake<8;stake++){const s=E.newRun('DECK',d.id,stake);E.startBlind(s);assert.ok(s.hand.length);assert.ok(E.restore(s),`${d.id}/${stake}`);if(d.id==='abandoned')assert.equal(s.deck.length,40);else assert.equal(s.deck.length,52)}
})
test('all Bosses are playable state transitions, no nonfinite scores',()=>{
 for(const b of BOSSES){const s=E.newRun('BOSS-'+b.id);s.ante=b.min;s.blind=2;s.boss=b.id;E.startBlind(s);s.selected=s.hand.slice(0,5).map(c=>c.uid);if(s.forced&&!s.selected.includes(s.forced))s.selected[0]=s.forced;const r=E.play(s);assert.ok(Number.isFinite(r.total),b.id);assert.ok(E.restore(s),b.id)}
})
test('150 joker effects survive select/play/discard/reward/save cycles',()=>{
 for(const def of JOKERS){
   const s=E.newRun('JOKER-'+def.id);add(s,def.id);s.money=30;E.startBlind(s)
   if(s.discards){s.selected=s.hand.slice(0,2).map(c=>c.uid);E.discard(s)}
   s.selected=s.hand.slice(0,5).map(c=>c.uid);const result=E.play(s)
   assert.ok(Number.isFinite(result.total),def.id);assert.ok(E.restore(s),def.id)
 }
})
test('all tarots, spectrals execute with valid target fixtures',()=>{
 for(const kind of ['tarot','spectral'])for(const def of kind==='tarot'?TAROTS:SPECTRALS){
   const s=state();add(s,'joker');s.lastUsed={kind:'planet',id:'high'};s.consumables=[{uid:999,kind,id:def.id}];if(def.max)s.selected=s.hand.slice(0,def.id==='death'?2:1).map(c=>c.uid)
   E.use(s,999);assert.ok(E.restore(s),kind+'/'+def.id)
 }
})
test('all 32 vouchers buy without breaking stage and save',()=>{
 for(const v of VOUCHERS){const s=state([10,11,12,13,14],[1,1,1,1,1]);play(s,[1,2,3,4,5]);E.cashOut(s);s.money=100;s.shop.voucher={uid:900,kind:'voucher',id:v.id};E.buy(s,900);assert.ok(s.vouchers.includes(v.id));assert.ok(E.restore(s),v.id)}
})
test('ante 8 win and endless continuation advance to ante 9 once',()=>{
 const s=state([10,11,12,13,14],[1,1,1,1,1]);s.ante=8;s.blind=2;s.boss='vessel';s.score=E.target(s);play(s,[1,2,3,4,5]);E.cashOut(s);assert.equal(s.phase,'won');E.continueEndless(s);assert.equal(s.phase,'shop');E.nextBlind(s);assert.equal(s.ante,9);assert.equal(s.blind,0)
})
test('Yorick and Loyalty counters are not reset at blind entry',()=>{const s=E.newRun('COUNTERS');add(s,'yorick').counter=22;add(s,'loyalty').counter=5;E.startBlind(s);assert.equal(s.jokers[0].counter,22);assert.equal(s.jokers[1].counter,5)})
test('invalid saves are rejected rather than mounted',()=>{assert.equal(E.restore('{'),null);const s=E.newRun('BAD');s.deck[0].rank=100;assert.equal(E.restore(s),null);assert.equal(E.restore({version:0}),null)})
test('To Do List displays its target and highlights only a matching selection',()=>{
 const s=state(),j=add(s,'toDo');j.hand='pair'
 assert.equal(cardCue(s,j).label,'对子 +$4');assert.equal(cardCue(s,j).ready,false)
 s.selected=[1,2];assert.equal(cardCue(s,j).ready,true)
 const before=JSON.stringify(s);for(let i=0;i<50;i++)cardCue(s,j);assert.equal(JSON.stringify(s),before,'cue must not mutate RNG or scoring state')
 s.selected=[1];assert.equal(cardCue(s,j).ready,false)
 j.hand='flush';assert.equal(cardCue(s,j).label,'同花 +$4')
 j.hand='pair';s.selected=[1,2];s.blind=2;s.boss='psychic';assert.equal(cardCue(s,j).ready,false,'Boss-disallowed selection must not promise a proc')
})
test('target rank/suit, limited triggers and copied reminders remain current',()=>{
 const s=state(),mail=add(s,'mail');mail.rank=14;s.selected=[1,2];assert.equal(cardCue(s,mail).label,'A +$5');assert.equal(cardCue(s,mail).ready,true)
 s.discards=0;assert.equal(cardCue(s,mail).ready,false)
 const loyalty=add(s,'loyalty');loyalty.counter=5;assert.equal(cardCue(s,loyalty).ready,true)
 const dna=add(s,'DNA');s.selected=[1];assert.equal(cardCue(s,dna).ready,true);s.plays=1;assert.equal(cardCue(s,dna).label,'下轮恢复')
 const b=state(),copy=add(b,'blueprint'),todo=add(b,'toDo');todo.hand='pair';b.selected=[1,2];assert.equal(cardCue(b,copy).label,'对子 +$4');assert.equal(cardCue(b,copy).ready,true)
 b.jokers=[copy,add(b,'brainstorm')];assert.equal(cardCue(b,copy).label,'复制循环')
})
test('reminders do not leak face-down cards or disabled joker identities',()=>{
 const s=state(),j=add(s,'toDo');j.hand='pair';s.selected=[1,2];s.hand[0].hidden=true;assert.equal(cardCue(s,j).ready,false)
 s.blind=2;s.boss='acorn';assert.equal(cardCue(s,j),null)
 s.disabledBoss=true;assert.equal(cardCue(s,j).label,'对子 +$4')
 j.disabled=true;assert.equal(cardCue(s,j).label,'已失效')
})
test('consumable reminders distinguish upgrade, targeting and exact Death count',()=>{
 const s=state();assert.equal(cardCue(s,{kind:'planet',id:'pair'}).label,'对子 ↑1')
 const death={kind:'tarot',id:'death'};s.selected=[1];assert.equal(cardCue(s,death).ready,false);s.selected=[1,2];assert.equal(cardCue(s,death).ready,true)
})
