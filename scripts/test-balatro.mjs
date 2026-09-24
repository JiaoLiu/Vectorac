import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import * as E from '../.vuepress/components/balatro/engine.mjs'
import { HANDS,JOKERS,TAROTS,SPECTRALS,VOUCHERS,BOSSES,DECKS,BOOSTER_PACKS } from '../.vuepress/components/balatro/catalog.mjs'
import { cardCue } from '../.vuepress/components/balatro/cues.mjs'
import { playingCardDetails, playingCardSummary } from '../.vuepress/components/balatro/card-details.mjs'
import { playingCard } from '../.vuepress/components/balatro/art.mjs'
import PokerTable from '../.vuepress/components/balatro/ui.js'

const cards=(ranks,suits=[])=>ranks.map((rank,i)=>({uid:i+1,rank,suit:suits[i]===undefined?i%4:suits[i],enh:null,edition:null,seal:null}))
const state=(ranks=[14,14,13,12,10,8,4,2],suits=[])=>{
 const s=E.newRun('REGRESSION');E.startBlind(s)
 s.hand=cards(ranks,suits);s.deck=E.clone(s.hand);s.uid=100;s.draw=[];s.spent=[];s.selected=[]
 return s
}
const add=(s,id,edition)=>{const j=E.makeJoker(s,id,edition);s.jokers.push(j);return j}
const play=(s,ids)=>{s.selected=ids;return E.play(s)}
const cardIdentity=c=>c.kind==='card'?`card:${c.rank}:${c.suit}:${c.enh||''}:${c.edition||''}:${c.seal||''}`:`${c.kind}:${c.id}`
const boosterOffers=(seed,family,{showman=false,held=null}={})=>{
 const s=E.newRun(seed);s.phase='shop';s.money=100
 if(held){if(family==='joker')s.jokers.push({uid:900,kind:'joker',id:held});else s.consumables.push({uid:900,kind:family,id:held})}
 if(showman)s.jokers.push({uid:901,kind:'joker',id:'showman'})
 s.shop={cards:[],packs:[{uid:902,kind:'pack',id:`${family}-mega`}],voucher:null,rerolls:0,freeUsed:false}
 E.buy(s,902);return s.pack.cards
}
const shopOffers=(seed,family,{showman=false,held=null,magicTrick=false}={})=>{
 const s=E.newRun(seed,family==='spectral'?'ghost':'red');s.phase='shop';s.money=100;s.vouchers.push('overstock','plus')
 if(magicTrick)s.vouchers.push('magictrick')
 if(held&&!(family==='spectral'&&s.consumables.some(c=>c.kind===family&&c.id===held))){if(family==='joker')s.jokers.push({uid:900,kind:'joker',id:held});else s.consumables.push({uid:900,kind:family,id:held})}
 if(showman)s.jokers.push({uid:901,kind:'joker',id:'showman'})
 s.shop={cards:[],packs:[],voucher:null,rerolls:0,freeUsed:false};E.rerollShop(s);return s.shop.cards
}

test('all catalog identifiers are unique, full core card sets are present',()=>{
 assert.equal(JOKERS.length,150);assert.equal(TAROTS.length,22);assert.equal(SPECTRALS.length,18);assert.equal(VOUCHERS.length,32);assert.equal(DECKS.length,15);assert.equal(Object.keys(BOOSTER_PACKS).length,15)
 for(const list of [JOKERS,TAROTS,SPECTRALS,VOUCHERS,BOSSES,DECKS,HANDS])assert.equal(new Set(list.map(c=>c.id)).size,list.length)
})
test('J, Q and K have distinct double-ended art while indices and seals remain legible',()=>{
 const names={11:'jack',12:'queen',13:'king'}
 for(const suit of [0,1,2,3])for(const rank of [11,12,13]){
  const art=playingCard({rank,suit,enh:null,edition:null,seal:'blue'})
  assert.match(art,new RegExp(`class="bp-court-${names[rank]}"`))
  assert.equal((art.match(new RegExp(`class="bp-court-${names[rank]}"`,'g'))||[]).length,2,'court art stays double-ended')
  assert.match(art,/>[JQK]<\/text>/,'the large rank emblem stays visible')
  assert.match(art,/>P<\/text>/,'a Blue Seal remains on the card')
  const stack=[]
  for(const [,closing,tag,attrs] of art.matchAll(/<(\/)?([a-z][\w-]*)\b([^>]*)>/g)){
   if(closing)assert.equal(stack.pop(),tag,`${names[rank]} SVG has mismatched tags`)
   else if(!attrs.trimEnd().endsWith('/'))stack.push(tag)
  }
  assert.deepEqual(stack,[],`${names[rank]} SVG has unclosed tags`)
 }
 for(const rank of [11,12,13])assert.doesNotMatch(playingCard({rank,suit:0,seal:'blue'},true),/bp-court-|>P<\/text>/,'face-down cards reveal no court identity or seal')
})
test('the game introduction and gallery cover describe and show the refreshed J, Q and K art',()=>{
 const cover=readFileSync(new URL('../.vuepress/public/img/games/balatro-cover.svg',import.meta.url),'utf8')
 const intro=readFileSync(new URL('../blogs/other/cardforge.md',import.meta.url),'utf8')
 const gallery=readFileSync(new URL('../blogs/other/games.md',import.meta.url),'utf8')
 for(const court of ['jack','queen','king'])assert.match(cover,new RegExp(`id="court-${court}"`),`${court} appears in the cover`)
 assert.match(cover,/新版双面杰克、皇后与国王牌面/);assert.match(intro,/新版双面人像牌面/)
 assert.match(intro,/牌桌中央会显示它的效果与触发时机/);assert.match(gallery,/双面 J\/Q\/K 人头牌/)
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
test('Blueprint copies supported abilities at scoring, blind entry, discard and blind reward triggers',()=>{
 const scoring=state();add(scoring,'blueprint');add(scoring,'joker');assert.equal(play(scoring,[1,2]).mult,10)
 const entry=E.newRun('BLUEPRINT-ENTRY'),bp=E.makeJoker(entry,'blueprint'),marble=E.makeJoker(entry,'marble');entry.jokers.push(bp,marble);E.startBlind(entry)
 assert.equal(entry.deck.filter(c=>c.enh==='stone').length,2,'Marble effect runs once on itself and once through Blueprint')
 const discarded=state([14,13,12,10,8,6,4,2]);add(discarded,'blueprint');const mail=add(discarded,'mail');mail.rank=discarded.hand[0].rank;discarded.money=0;discarded.selected=[discarded.hand[0].uid];E.discard(discarded)
 assert.equal(discarded.money,10,'Mail pays once directly and once through Blueprint')
 const round=state();add(round,'blueprint');add(round,'golden');round.score=E.target(round)-1;round.selected=[round.hand[0].uid];E.play(round)
 assert.equal(round.phase,'reward');assert.ok(!round.roundReward,'rewards wait for cashout')
 assert.equal(E.previewReward(round).extra,8,'Golden Joker reward is copied for this game')
 const paid=E.cashOut(round);assert.equal(paid.extra,8,'the copied reward is paid on cashout');assert.ok(!round.roundReward,'the payment marker clears after cashout')
 assert.equal(E.blueprintCanCopy('golden','roundReward'),true);assert.equal(E.blueprintCanCopy('trading','scoring'),false);assert.equal(E.blueprintCanCopy('trading','discard'),false)
})
test('Trading stays native-only for discard while retaining its native $3 trigger',()=>{
 const s=state(),removed=s.hand[0].uid;add(s,'blueprint');add(s,'trading');s.money=0;s.selected=[removed];E.discard(s)
 assert.equal(s.money,3,'Trading pays its native single-card discard reward exactly once')
 assert.equal(s.deck.some(c=>c.uid===removed),false,'Trading still destroys the discarded card natively')
})
test('skipping score stays final and disabled after fullscreen re-render',()=>{
 const skipButton={disabled:false},chips={textContent:''},mult={textContent:''},label={textContent:''},roundScore={textContent:''}
 const table=Object.create(PokerTable.prototype)
 table.root={contains:()=>true,querySelector:selector=>({'[data-action="skip-score"]':skipButton,'[data-chips]':chips,'[data-mult]':mult,'[data-score-event]':label,'[data-round-score]':roundScore}[selector]||null),querySelectorAll:()=>[]}
 table.anim={token:9,skipped:false,before:{score:40},event:{chips:5,mult:2,source:'旧计分事件'},result:{name:'对子',cards:[],chips:1324,mult:4,total:5296}}
 table.busy=true;table.immersive=false;table.scoreTimer=null;table.timers=new Set();table.audio={fx:()=>{}}
 table.clearScoreTimer=()=>{table.scoreTimer=null};table.later=(fn,ms)=>({fn,ms});table.showEffect=()=>{}
 table.fullscreen=()=>{table.immersive=true};table.render=()=>{table.renderedStage=table.playStage({})}

 table.skipScoreAnimation()
 assert.equal(table.anim.skipped,true)
 assert.deepEqual(table.anim.event,{chips:1324,mult:4,source:'+5,296'})
 table.click({target:{closest:()=>({dataset:{action:'fullscreen'},disabled:false})}})

 assert.match(table.renderedStage,/data-action="skip-score"[^>]*disabled/,'fullscreen re-render keeps skip unavailable')
 assert.equal(chips.textContent,'1,324');assert.equal(mult.textContent,'4');assert.equal(label.textContent,'+5,296','fullscreen re-render reapplies the final score instead of the last animation tick')
 assert.equal(roundScore.textContent,'5,336','skipping advances the visible round score before rewards appear')
})
const consumableAnimation=(operation,used,{initialState,realCardDetails=false,handSort='rank'}={})=>{
 const table=Object.create(PokerTable.prototype),queue=[],frames=[]
 table.state=initialState||state();table.sort=handSort;table.settings={fast:false};table.audio={fx:()=>{}}
 table.destroyed=false;table.anim=null;table.actionFx=null;table.busy=false
 if(!realCardDetails){table.itemName=()=>used.id;table.itemDesc=()=>used.id}
 table.persist=()=>{};table.showEffect=()=>{}
 table.root={clientWidth:800}
 table.orderedHand=()=>handSort==='custom'?table.state.hand.slice():table.state.hand.slice().sort((a,b)=>b.rank-a.rank||a.suit-b.suit)
 table.cardButton=(card,{fxClass})=>`<i data-card="${card.uid}" data-edition="${card.edition||''}" data-fx="${fxClass}"></i>`
 table.render=()=>frames.push(table.hand(table.state)+table.addedCardsOverlay())
 table.later=fn=>queue.push(fn)
 const priorWindow=globalThis.window
 globalThis.window={matchMedia:()=>({matches:false})}
 try{
  table.animateConsumable(operation,used)
  return {table,frames,next:()=>queue.shift()?.(),pending:()=>queue.length}
 }finally{globalThis.window=priorWindow}
}
test('an existing hand card gains an edition in place, without a deal-from-deck animation',()=>{
 const fx=consumableAnimation(s=>{
  const aura={uid:++s.uid,id:'aura',kind:'spectral'};s.consumables.push(aura);s.selected=[1];s.rng=4000;E.use(s,aura.uid)
 },{id:'aura',kind:'spectral'})
 assert.deepEqual(fx.table.actionFx.changedUIDs,[1]);assert.deepEqual(fx.table.actionFx.gatherUIDs,[])
 fx.next()
 assert.match(fx.frames.at(-1),/data-card="1" data-edition="poly" data-fx="bp-fx-reveal"/)
 fx.next()
 assert.equal(fx.table.state.hand[0].edition,'poly')
 assert.equal(fx.table.actionFx,null)
 assert.ok(fx.frames.every(frame=>!frame.includes('bp-fx-gather')&&!frame.includes('bp-fx-deal')))
})
test('a Tarot rank conversion reveals two existing hand cards without gathering them',()=>{
 const fx=consumableAnimation(s=>{
  const strength={uid:++s.uid,id:'strength',kind:'tarot'};s.consumables.push(strength);s.selected=[1,2];E.use(s,strength.uid)
 },{id:'strength',kind:'tarot'})
 assert.deepEqual(fx.table.actionFx.changedUIDs,[1,2])
 fx.next();assert.equal((fx.frames.at(-1).match(/bp-fx-reveal/g)||[]).length,2)
 fx.next();assert.equal(fx.table.actionFx,null)
 assert.ok(fx.frames.every(frame=>!frame.includes('bp-fx-gather')&&!frame.includes('bp-fx-deal')))
})
test('multi-card transformation stays in place, including while another card is destroyed',()=>{
 const fx=consumableAnimation(s=>{
  for(const c of s.hand.slice(0,2)){c.edition='poly';s.deck.find(x=>x.uid===c.uid).edition='poly'}
  s.hand=s.hand.filter(c=>c.uid!==3);s.deck=s.deck.filter(c=>c.uid!==3)
 },{id:'mixed',kind:'spectral'})
 fx.next();assert.match(fx.frames.at(-1),/data-card="1" data-edition="poly" data-fx="bp-fx-reveal"/)
 fx.next();assert.equal(fx.table.actionFx.phase,'gather')
 assert.match(fx.frames.at(-1),/data-card="1" data-edition="poly" data-fx=""/,'the changed face does not revert during destruction')
 assert.ok(!fx.frames.at(-1).includes('bp-fx-gather'))
 fx.next();assert.equal(fx.table.actionFx,null)
 assert.equal(fx.table.state.hand.some(c=>c.uid===3),false)
 assert.ok(fx.frames.every(frame=>!frame.includes('bp-fx-deal')))
})
test('a genuinely added card still deals into the hand',()=>{
 const fx=consumableAnimation(s=>{
  const created={uid:++s.uid,rank:10,suit:0,enh:null,edition:null,seal:null}
  s.deck.push(created);s.hand.push(created)
 },{id:'cryptid',kind:'spectral'})
 const added=fx.table.actionFx.addedUIDs[0]
 fx.next();fx.next();fx.next()
 assert.deepEqual(fx.table.actionFx.dealUIDs,[added])
 assert.match(fx.frames.at(-1),/bp-fx-deal/)
 fx.next();assert.equal(fx.table.actionFx,null)
})
test('Familiar from a Spectral pack reveals and commits all three enhanced cards',()=>{
 const packed=state(),familiar={uid:++packed.uid,id:'familiar',kind:'spectral'}
 packed.phase='shop';packed.pack={id:'spectral',kind:'spectral',cards:[familiar],choose:1,picksLeft:1,picksMade:0,handBefore:E.clone(packed.hand)}
 const originalUIDs=new Set(packed.deck.map(c=>c.uid))
 const fx=consumableAnimation(s=>E.choosePack(s,familiar.uid),familiar,{initialState:packed,realCardDetails:true})
 assert.equal(fx.table.actionFx.addedUIDs.length,3)
 fx.next();fx.next();fx.next()
 assert.equal(fx.table.actionFx.phase,'added','the reveal renders without throwing before the state commits')
 assert.match(fx.frames.at(-1),/获得 3 张增强人头牌/)
 while(fx.pending())fx.next()
 assert.equal(fx.table.state.pack,null)
 assert.equal(fx.table.state.deck.filter(c=>!originalUIDs.has(c.uid)).length,3)
 assert.ok(fx.table.state.deck.filter(c=>!originalUIDs.has(c.uid)).every(c=>c.enh),'every generated card is enhanced')
 assert.equal(fx.table.state.deck.filter(c=>originalUIDs.has(c.uid)).length,originalUIDs.size-1,'one original card is destroyed')
 assert.equal(fx.table.actionFx,null)
 assert.equal(fx.table.busy,false)
})
test('Familiar used during play replaces one card with three enhanced cards in hand',()=>{
 const playing=state(),familiar={uid:++playing.uid,id:'familiar',kind:'spectral'}
 playing.consumables.push(familiar)
 const originalUIDs=new Set(playing.deck.map(c=>c.uid))
 const fx=consumableAnimation(s=>E.use(s,familiar.uid),familiar,{initialState:playing,realCardDetails:true})
 fx.next();fx.next();fx.next()
 const created=fx.table.state.hand.filter(c=>!originalUIDs.has(c.uid))
 assert.equal(created.length,3)
 assert.ok(created.every(c=>c.enh))
 assert.equal(fx.table.state.hand.length,playing.hand.length+2)
 assert.deepEqual(new Set(fx.table.actionFx.dealUIDs),new Set(created.map(c=>c.uid)))
 while(fx.pending())fx.next()
 assert.equal(fx.table.actionFx,null)
 assert.equal(fx.table.busy,false)
})
test('a consumable keeps the manually arranged hand order through its animation',()=>{
 const arranged=state();arranged.hand.reverse()
 const orderedUIDs=arranged.hand.map(c=>c.uid)
 const fx=consumableAnimation(s=>{
  const uid=s.hand[0].uid
  s.hand[0].edition='poly';s.deck.find(c=>c.uid===uid).edition='poly'
 },{id:'aura',kind:'spectral'},{initialState:arranged,handSort:'custom'})
 assert.deepEqual(fx.table.actionFx.beforeHand.map(c=>c.uid),orderedUIDs)
 while(fx.pending())fx.next()
 assert.deepEqual(fx.table.state.hand.map(c=>c.uid),orderedUIDs)
})
const copiedRepeatScore=(jokerId,rank,configure=()=>{})=>{
 const s=state([rank,8,6,4,2]);add(s,'blueprint');add(s,jokerId);configure(s);s.selected=[s.hand[0].uid]
 return E.play(s)
}
test('Blueprint copies Sock and Buskin face-card retriggers',()=>{
 assert.equal(E.blueprintCanCopy('sock','scoring'),true)
 assert.equal(copiedRepeatScore('sock',13).chips,35)
})
test('Blueprint copies Hack retriggers for scoring 2 through 5',()=>{
 assert.equal(E.blueprintCanCopy('hack','scoring'),true)
 assert.equal(copiedRepeatScore('hack',2).chips,11)
})
test('Blueprint copies Dusk retriggers on the final hand',()=>{
 assert.equal(E.blueprintCanCopy('dusk','scoring'),true)
 assert.equal(copiedRepeatScore('dusk',13,s=>{s.hands=1}).chips,35)
})
test('Blueprint copies Seltzer retriggers before it expires',()=>{
 assert.equal(E.blueprintCanCopy('seltzer','scoring'),true)
 assert.equal(copiedRepeatScore('seltzer',8).chips,29)
})
test('Blueprint copies Hanging Joker retriggers on the first scoring card every hand',()=>{
 assert.equal(E.blueprintCanCopy('hanging','scoring'),true)
 assert.equal(copiedRepeatScore('hanging',13).chips,55)
 assert.equal(copiedRepeatScore('hanging',8,s=>{s.plays=1}).chips,45,'the copied effect also applies to a non-face card after the first play')
})
test('Hanging Joker follows played card order, skipping non-scoring kickers',()=>{
 const first=state([8,8,6,4,2]);add(first,'hanging');first.hand[0].edition=first.deck[0].edition='foil'
 const firstResult=play(first,[1,2]);assert.equal(firstResult.chips,192,'the Foil first scoring card is retriggered twice')
 const second=state([8,8,6,4,2]);add(second,'hanging');second.hand[0].edition=second.deck[0].edition='foil'
 ;[second.hand[0],second.hand[1]]=[second.hand[1],second.hand[0]]
 const secondResult=play(second,[1,2]);assert.equal(secondResult.chips,92,'moving Foil second leaves it with just one trigger')
 const kicker=state([2,8,8,6,4]);add(kicker,'hanging')
 const result=play(kicker,[1,2,3])
 assert.equal(result.chips,42,'the first card used in scoring, not the unscored kicker, is retriggered')
 assert.deepEqual(result.events.filter(event=>['扑克牌','再次触发'].includes(event.source)).map(event=>event.uid),[2,2,2,3])
})
test('a lone Eight Ball rolls once for one 8 in a straight; retriggering that 8 can generate twice',()=>{
 const setup=(seed,hanging=false)=>{
  const s=state([8,9,10,11,12]);add(s,'eightball');if(hanging)add(s,'hanging')
  s.rng=seed
  const result=play(s,[1,2,3,4,5])
  assert.equal(result.id,'straight')
  const count=s.consumables.filter(c=>c.kind==='tarot').length
  assert.equal(result.events.filter(event=>event.source.startsWith('八号球：生成')).length,count,'the scoring log identifies each generated Tarot')
  return count
 }
 let generated=false
 for(let seed=1;seed<=128;seed++){
  const count=setup(seed)
  assert.ok(count<=1,`one Eight Ball and one non-retriggered 8 cannot generate two Tarot cards (seed ${seed})`)
  generated ||= count===1
 }
 assert.ok(generated,'the isolated case exercises at least one successful Eight Ball roll')
 assert.equal(setup(2,true),2,'Hanging Joker retriggers the first scoring 8 twice, so two Tarot cards are valid')
})
test('Blueprint repeats compatible stateful Madness and Square triggers',()=>{
 assert.equal(E.blueprintCanCopy('madness','blindStart'),true)
 const entry=E.newRun('BLUEPRINT-MADNESS'),bp=E.makeJoker(entry,'blueprint'),madness=E.makeJoker(entry,'madness')
 // Keep Blueprint out of Madness's eligible destruction pool so both victims prove
 // that the copied and native triggers each resolve exactly once.
 bp.eternal=true;entry.jokers.push(bp,madness,E.makeJoker(entry,'joker'),E.makeJoker(entry,'duo'));E.startBlind(entry)
 assert.equal(madness.value,2,'Madness gains +0.5 twice: once through Blueprint and once natively')
 assert.deepEqual(entry.jokers.map(j=>j.id),['blueprint','madness'],'each trigger destroys one eligible victim')

 const squareState=state([14,13,12,11,10,8,4,2]),square=add(squareState,'square')
 squareState.jokers.unshift(E.makeJoker(squareState,'blueprint'))
 squareState.selected=squareState.hand.slice(0,4).map(c=>c.uid);E.play(squareState)
 assert.equal(square.value,8,'a four-card hand applies Square’s +4 state change for each compatible trigger')
})
test('Blueprint only copies Golden Joker among blind-end reward effects',()=>{
 const cases=[['rocket',1],['cloud',1],['satellite',2],['delayed',8]]
 for(const [id,expected] of cases){
  assert.equal(E.blueprintCanCopy(id,'roundReward'),false,`${id} is not Blueprint compatible`)
  const s=state([14,13,12,11,9,8,4,2]);add(s,'blueprint');add(s,id)
  if(id==='satellite')s.planets=[{},{}]
  s.score=E.target(s)-1;s.selected=[s.hand[0].uid];E.play(s)
  assert.equal(s.phase,'reward');assert.equal(E.previewReward(s).extra,expected,`${id} keeps its native single-trigger reward`)
 }
})
test('Blueprint and Brainstorm keep their own editions when the copied ability is unavailable',()=>{
 const foil=state();add(foil,'blueprint','foil');add(foil,'golden')
 assert.equal(play(foil,[1,2]).chips,82,'the incompatible scoring ability does not suppress Blueprint’s own +50 Chips edition')
 const holo=state();add(holo,'brainstorm','holo');add(holo,'joker')
 assert.equal(play(holo,[1,2]).mult,16,'a self-copy loop does not suppress Brainstorm’s own +10 Mult edition')
})
test('Blueprint copies Burglar on blind entry and Space Joker independently before scoring',()=>{
 assert.equal(E.blueprintCanCopy('burglar','blindStart'),true)
 const entry=E.newRun('BLUEPRINT-BURGLAR');add(entry,'blueprint');add(entry,'burglar');E.startBlind(entry)
 assert.equal(entry.hands,10,'two Burglar triggers each grant three hands');assert.equal(entry.discards,0)
 assert.equal(E.blueprintCanCopy('space','scoring'),true)
 const space=state();add(space,'blueprint');add(space,'space');space.rng=8
 const prior=space.levels.high;play(space,[1])
 assert.equal(space.levels.high,prior+2,'seed 8 makes both independent 1-in-4 Space triggers succeed')
})
test('Blueprint copies Mime at blind reward and Matador on a blocked Boss hand',()=>{
 const mime=state();add(mime,'blueprint');add(mime,'mime');mime.hand[2].enh=mime.deck[2].enh='gold'
 mime.score=E.target(mime)-1;play(mime,[1]);assert.equal(E.previewReward(mime).extra,9,'held Gold pays once plus two Mime retriggers')
 assert.equal(E.blueprintCanCopy('matador','scoring'),true)
 const blocked=state();blocked.blind=2;blocked.boss='psychic';add(blocked,'blueprint');add(blocked,'matador')
 const money=blocked.money;play(blocked,[1]);assert.equal(blocked.money-money,16,'the blocked hand pays both Matador triggers')
})
test('Blueprint copies Perkeo at shop exit and Hallucination on pack opening',()=>{
 assert.equal(E.blueprintCanCopy('perkeo','shopExit'),true)
 const exit=E.newRun('BLUEPRINT-PERKEO');exit.phase='shop';exit.consumables.push({uid:++exit.uid,kind:'tarot',id:'hermit'})
 add(exit,'blueprint');add(exit,'perkeo');E.nextBlind(exit)
 assert.equal(exit.consumables.length,3,'Perkeo and its Blueprint copy each add a Negative copy')
 assert.equal(exit.consumables.filter(c=>c.edition==='negative').length,2)
 assert.equal(E.blueprintCanCopy('hallucination','packOpen'),true)
 const pack=E.newRun('BLUEPRINT-HALLUCINATION');pack.phase='shop';pack.money=100
 add(pack,'blueprint');add(pack,'hallucination');add(pack,'oops')
 pack.shop={cards:[],packs:[{uid:++pack.uid,kind:'pack',id:'joker'}],voucher:null,rerolls:0,freeUsed:false}
 const packUID=pack.shop.packs[0].uid;E.buy(pack,packUID)
 assert.equal(pack.consumables.length,2,'Oops guarantees that both Hallucination triggers create Tarot cards')
})
test('blind reward display value comes from the same stake-aware engine rule as payout',()=>{
 const white=E.newRun('REWARD-WHITE','red',0),red=E.newRun('REWARD-RED','red',1)
 assert.equal(E.blindReward(white,0),3);assert.equal(E.blindReward(white,1),4);assert.equal(E.blindReward(white,2),5)
 assert.equal(E.blindReward(red,0),0);assert.equal(E.blindReward(red,1),4);assert.equal(E.blindReward(red,2),5)
})
test('a selected face-down card conceals preview details without changing visible previews',()=>{
 const hidden=state([14,13,12,11,10]);hidden.hand[0].hidden=true;hidden.selected=hidden.hand.slice(0,5).map(c=>c.uid)
 const concealed=E.preview(hidden)
 assert.deepEqual(concealed,{unknown:true,name:'暗牌 · 牌型未知'})
 for(const key of ['id','chips','mult','scoring','contains'])assert.equal(Object.hasOwn(concealed,key),false,`concealed preview omits ${key}`)
 const visible=state([8,8,13,5,2]);visible.selected=visible.hand.slice(0,2).map(c=>c.uid)
 const known=E.preview(visible);assert.equal(known.id,'pair');assert.equal(known.chips,10);assert.equal(known.mult,2)
})
test('playing-card details share complete face, enhancement, edition and seal trigger copy',()=>{
 const expected={red:'本牌计分',blue:'击败盲注时',gold:'每次触发获得 $3',purple:'弃掉本牌时'}
 for(const [seal,phrase] of Object.entries(expected)){
  const details=playingCardDetails({rank:14,suit:2,enh:'mult',edition:'foil',seal})
  assert.deepEqual(details.map(d=>d.label),['牌面','增强','版本','封蜡'])
  assert.equal(details[0].value,'梅花 A');assert.match(details[1].value,/计分时/);assert.match(details[2].value,/参与计分时/);assert.ok(details[3].value.includes(phrase),seal)
 }
 assert.deepEqual(playingCardDetails({rank:14,suit:0,hidden:true}),[],'face-down cards reveal no card facts')
})
test('selected enhanced hand cards show concise effect reminders in the empty center table area',()=>{
 const s=state([12,10,8],[1,0,2]);s.hand[0].enh=s.deck[0].enh='bonus';s.hand[0].seal=s.deck[0].seal='blue';s.selected=[s.hand[0].uid]
 const table=Object.create(PokerTable.prototype);table.anim=null;table.busy=false
 const stage=table.playStage(s)
 assert.match(stage,/bp-selected-card-effects/);assert.match(stage,/红桃 Q/);assert.match(stage,/奖励牌/);assert.match(stage,/额外获得 30 筹码/)
 assert.match(stage,/蓝色蜡封/);assert.match(stage,/生成一张对应上一手牌型的星球牌/)
 assert.doesNotMatch(stage,/bp-last-hand/,'the table center uses its otherwise empty space for the selected card details')
 s.hand[0].hidden=true
 const concealed=table.playStage(s)
 assert.doesNotMatch(concealed,/bp-selected-card-effects|蓝色蜡封|奖励牌/,'a face-down card never leaks its effects in the center reminder')
 s.hand[0].hidden=false;s.hand[0].enh=null;s.hand[0].seal=null
 assert.doesNotMatch(table.playStage(s),/bp-selected-card-effects/,'unmodified selected cards keep the table center clear')
})
test('pack and shop card descriptions spell out seal effects instead of bare names',()=>{
 assert.equal(playingCardSummary({rank:10,suit:1}),'标准扑克牌','plain cards stay short')
 const blue=playingCardSummary({rank:10,suit:1,seal:'blue'})
 assert.ok(blue.includes('蓝色蜡封：'),blue);assert.ok(blue.includes('生成一张对应上一手牌型的星球牌'),blue)
 const gold=playingCardSummary({rank:10,suit:1,seal:'gold'})
 assert.ok(gold.includes('金色蜡封：'),gold);assert.ok(gold.includes('每次触发获得 $3'),gold)
 const red=playingCardSummary({rank:10,suit:1,seal:'red'})
 assert.ok(red.includes('红色蜡封：')&&red.includes('额外触发一次'),red)
 const purple=playingCardSummary({rank:10,suit:1,seal:'purple'})
 assert.ok(purple.includes('紫色蜡封：')&&purple.includes('生成一张塔罗牌'),purple)
 const special=playingCardSummary({rank:10,suit:1,enh:'glass',edition:'poly'})
 assert.ok(special.includes('玻璃牌：')&&special.includes('多彩：'),special)
 assert.equal(playingCardSummary({rank:10,suit:1,hidden:true}),'背面朝上')
})
test('detail dialogs name deck cards that carry no kind field',()=>{
 const table=Object.create(PokerTable.prototype)
 assert.equal(table.itemName({uid:1,rank:14,suit:0}),'黑桃 A','deck cards are playing cards, not tarots')
 assert.equal(table.itemName({uid:2,rank:10,suit:1,seal:'blue'}),'红桃 10')
 assert.equal(table.itemName({kind:'card',rank:4,suit:2}),'梅花 4')
 assert.equal(table.itemName({kind:'joker',id:JOKERS[0].id}),JOKERS[0].name)
 assert.equal(table.itemName({kind:'tarot',id:TAROTS[0].id}),TAROTS[0].name)
 assert.equal(table.itemName({kind:'spectral',id:SPECTRALS[0].id}),SPECTRALS[0].name)
 assert.equal(table.itemName({kind:'planet',id:HANDS[0].id}),HANDS[0].planet)
 assert.equal(table.itemName({kind:'voucher',id:VOUCHERS[0].id}),VOUCHERS[0].name)
 assert.equal(table.itemName({kind:'pack',id:BOOSTER_PACKS.standard.id}),BOOSTER_PACKS.standard.name)
})
test('held steel and Baron precede joker additions',()=>{
 const s=state();s.hand[2].enh=s.deck[2].enh='steel';add(s,'baron');add(s,'joker');assert.equal(play(s,[1,2]).mult,8.5)
})
test('red seals retrigger scoring; holographic joker editions add before effects',()=>{
 const s=state([14,2,3,7,9]);s.hand[0].seal=s.deck[0].seal='red';assert.equal(play(s,[1]).chips,27)
 const t=state();add(t,'duo','holo');assert.equal(play(t,[1,2]).mult,24)
})
test('Blue Seal creates a Planet only when still held as the blind ends',()=>{
 const unsealed=state();unsealed.score=E.target(unsealed)-1
 play(unsealed,[1]);assert.equal(unsealed.phase,'reward');assert.equal(unsealed.consumables.length,0,'winning without any Blue Seal creates no Planet')
 assert.equal(E.previewReward(unsealed).blueSealPlanets,0)
 E.cashOut(unsealed);assert.equal(unsealed.consumables.length,0)
 const held=state();held.hand[0].seal=held.deck[0].seal='blue'
 play(held,[2]);assert.equal(held.phase,'play');assert.equal(held.consumables.length,0,'a regular play does not trigger the held Blue Seal')
 held.score=E.target(held)-1;play(held,[3])
 assert.equal(held.phase,'reward');assert.equal(held.consumables.length,0,'the Planet waits for cashout')
 assert.equal(E.previewReward(held).blueSealPlanets,1,'the preview records why the Planet will appear')
 const heldReward=E.cashOut(held)
 assert.deepEqual(held.consumables.map(c=>[c.kind,c.id]),[['planet',held.lastResult.id]],'cashing out triggers the Blue Seal still in hand')
 assert.equal(heldReward.blueSealPlanets,1,'the reward records why the Planet appeared')

 const played=state();played.hand[0].seal=played.deck[0].seal='blue';played.score=E.target(played)-1
 play(played,[1]);assert.equal(played.phase,'reward');assert.equal(played.consumables.length,0,'a Blue Seal played in the winning hand is no longer held')
 assert.equal(E.previewReward(played).blueSealPlanets,0)
})
test('round stages enforce single cashout, single purchase, no double advancement',()=>{
 const s=state([10,11,12,13,14],[1,1,1,1,1]);play(s,[1,2,3,4,5]);assert.equal(s.phase,'reward')
 const unpaid=s.money,preview=E.previewReward(s)
 assert.ok(!s.roundReward,'rewards are only previewed before cashout')
 assert.throws(()=>E.play(s))
 const paidOut=E.cashOut(s);assert.equal(s.phase,'shop');assert.equal(s.money,unpaid+preview.total,'cashout pays the previewed reward exactly once')
 assert.equal(paidOut.total,preview.total);assert.ok(!s.roundReward,'the marker clears so the next blind re-earns its reward');assert.throws(()=>E.cashOut(s))
 s.money=100;const card=s.shop.cards[0],fee=E.itemCost(s,card);E.buy(s,card.uid);assert.equal(s.money,100-fee);assert.throws(()=>E.buy(s,card.uid))
 E.nextBlind(s);assert.equal(s.phase,'select');assert.equal(s.blind,1);assert.throws(()=>E.nextBlind(s))
})
test('blind payout records played cards, then clears the table for the next screen',()=>{
 const s=state([14,14,13,12,10,8,4,2]);const played=s.hand.slice(0,5).map(c=>c.uid);s.score=E.target(s)-1;s.selected=played;E.play(s)
 assert.equal(s.phase,'reward');assert.ok(s.hand.length,'the table stays until the player claims the reward')
 E.cashOut(s)
 assert.ok(played.every(uid=>s.antePlayed.includes(uid)))
 assert.deepEqual(s.hand,[]);assert.deepEqual(s.draw,[]);assert.deepEqual(s.spent,[]);assert.deepEqual(s.selected,[]);assert.equal(s.forced,null)
})
test('Pillar tracks only actually played cards across blinds',()=>{
 const s=state([14,13,12,10,8,6,4,2]),discarded=s.hand[0].uid,firstPlayed=s.hand[1].uid
 s.selected=[discarded];E.discard(s)
 s.score=E.target(s)-1;play(s,[firstPlayed])
 assert.equal(s.antePlayed.includes(firstPlayed),false,'antePlayed updates only on cashout')
 E.cashOut(s)
 assert.ok(s.antePlayed.includes(firstPlayed));assert.equal(s.antePlayed.includes(discarded),false)
 s.phase='select';s.blind=1;E.startBlind(s)
 s.phase='select';s.blind=2;s.boss='pillar';E.startBlind(s)
 const priorPlay=s.deck.find(c=>c.uid===firstPlayed),priorDiscard=s.deck.find(c=>c.uid===discarded)
 assert.equal(E.debuffed(s,priorPlay),true);assert.equal(E.debuffed(s,priorDiscard),false)
 const currentPlay=s.hand.find(c=>!s.antePlayed.includes(c.uid));assert.ok(currentPlay);assert.equal(E.debuffed(s,currentPlay),false)
 s.score=0;play(s,[currentPlay.uid]);assert.equal(E.debuffed(s,currentPlay),false,'this blind’s own play is not debuffed retroactively before it ends')
})
test('Pillar boss blind does not grey out the hand that defeats it',()=>{
 const s=state([14,14,13,12,10,8,4,2]);s.blind=2;s.boss='pillar'
 const priorPlayed=s.hand[1].uid,winner=s.hand[0].uid
 s.antePlayed=[priorPlayed];s.score=E.target(s)-1
 const before=E.clone(s),result=play(s,[winner])
 assert.equal(s.phase,'reward')
 assert.equal(E.debuffed(before,s.deck.find(c=>c.uid===winner)),false,'the winning hand was never played before this blind, so it scores normally')
 assert.equal(s.antePlayed.includes(winner),false,'the winning hand is not folded into antePlayed before cashout')
 E.cashOut(s);assert.ok(s.antePlayed.includes(winner),'the engine folds the winning hand into antePlayed once the blind is paid out')
 const table=Object.create(PokerTable.prototype)
 table.state=s;table.anim={before,result}
 const html=table.playStage(s)
 assert.equal(html.includes('bp-debuff'),false,'the scoring stage judges debuffs from the pre-play snapshot, not the post-payout state')
})
test('actual pre-tracking v3 save resets contaminated Pillar history and resumes tracking',()=>{
 const legacy=JSON.parse(readFileSync(new URL('./fixtures/balatro-v3-pre-blindplayed.json',import.meta.url),'utf8'))
 assert.equal(legacy.version,3);assert.equal(legacy.blindPlayed,undefined)
 assert.deepEqual(legacy.antePlayed,[26,16],'the original v3 engine recorded both the discarded uid 26 and played uid 16')
 const restored=E.restore(legacy)
 assert.ok(restored,'original v3 save remains loadable');assert.deepEqual(restored.antePlayed,[]);assert.deepEqual(restored.blindPlayed,[])
 assert.match(restored.notice,/支柱记录已重置/)
 E.cashOut(restored);E.nextBlind(restored);E.startBlind(restored)
 const played=restored.hand[0].uid;restored.score=E.target(restored)-1;restored.selected=[played];E.play(restored);E.cashOut(restored)
 assert.deepEqual(restored.antePlayed,[played],'only plays after migration are tracked for Pillar')
})
test('actual pre-tracking v3 mid-blind save warns even before antePlayed was populated',()=>{
 const legacy=JSON.parse(readFileSync(new URL('./fixtures/balatro-v3-midblind-pre-blindplayed.json',import.meta.url),'utf8'))
 assert.equal(legacy.version,3);assert.equal(legacy.blindPlayed,undefined);assert.equal(legacy.phase,'play')
 assert.equal(legacy.ante,1);assert.equal(legacy.blind,0);assert.ok(legacy.plays>0);assert.deepEqual(legacy.antePlayed,[])
 const restored=E.restore(legacy)
 assert.ok(restored,'original v3 mid-blind save remains loadable');assert.deepEqual(restored.antePlayed,[]);assert.deepEqual(restored.blindPlayed,[])
 assert.match(restored.notice,/支柱记录已重置/,'played cards before the first blind payout are missing from antePlayed but still need a migration notice')
})
test('Hook-discarded cards are not recorded as played for Pillar',()=>{
 const s=state([14,13,12,10,8,6,4,2]);s.blind=2;s.boss='hook'
 const actuallyPlayed=s.hand[0].uid;play(s,[actuallyPlayed])
 const hookDiscarded=s.spent.map(c=>c.uid).filter(uid=>uid!==actuallyPlayed)
 assert.equal(hookDiscarded.length,2);assert.deepEqual(s.blindPlayed,[actuallyPlayed])
 s.score=E.target(s)-1;const nextPlayed=s.hand[0].uid;play(s,[nextPlayed]);E.cashOut(s)
 assert.ok(s.antePlayed.includes(actuallyPlayed));assert.ok(s.antePlayed.includes(nextPlayed))
 assert.ok(hookDiscarded.every(uid=>!s.antePlayed.includes(uid)))
})
test('finisher Boss blinds pay $8 at every eighth Ante; regular Boss remains $5',()=>{
 for(const [ante,stake,reward] of [[7,0,5],[8,0,8],[16,2,8]]){
  const s=state();s.ante=ante;s.blind=2;s.stake=stake;s.disabledBoss=true
  assert.equal(E.blindReward(s,2),reward,`sidebar and blind-choice helper: ante ${ante}, stake ${stake}`)
  s.score=E.target(s)-1;play(s,[s.hand[0].uid])
  assert.equal(s.phase,'reward');assert.equal(E.previewReward(s).reward,reward,`actual payout: ante ${ante}, stake ${stake}`)
 }
})
test('Fish hides post-play replacements but not post-discard replacements',()=>{
 const s=state([14,13,12,11,10,9,8,7]);s.blind=2;s.boss='fish'
 s.draw=cards([6,5]);s.draw.forEach((c,i)=>{c.uid=200+i});s.deck=s.hand.concat(s.draw);s.uid=201
 play(s,[s.hand[0].uid])
 const fishReplacement=s.hand.find(c=>c.uid===201);assert.ok(fishReplacement);assert.equal(fishReplacement.hidden,true,'Fish hides a replacement drawn after playing')
 const priorHand=new Set(s.hand.map(c=>c.uid)),discarded=s.hand.find(c=>!c.hidden);assert.ok(discarded)
 s.selected=[discarded.uid];E.discard(s)
 const discardReplacement=s.hand.find(c=>!priorHand.has(c.uid));assert.ok(discardReplacement);assert.equal(discardReplacement.hidden,false,'Fish does not hide a replacement drawn after discarding')
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
test('Soul in a spectral pack grants a legendary joker and closes the pack',()=>{
 const s=E.newRun('SOUL');E.startBlind(s);s.phase='shop';s.hand=[];s.pack={kind:'spectral',cards:[{uid:900,kind:'spectral',id:'soul'}],handBefore:[]};E.choosePack(s,900)
 assert.equal(s.phase,'shop');assert.equal(s.pack,null);assert.equal(s.jokers.length,1);assert.equal(JOKERS.find(j=>j.id===s.jokers[0].id).rarity,4)
})
test('booster variants use Balatro size, pick, cost and shop weight data',()=>{
 const expectedWeights={joker:1.2,'joker-jumbo':.6,'joker-mega':.15,planet:4,'planet-jumbo':2,'planet-mega':.5,tarot:4,'tarot-jumbo':2,'tarot-mega':.5,standard:4,'standard-jumbo':2,'standard-mega':.5,spectral:.6,'spectral-jumbo':.3,'spectral-mega':.07}
 assert.deepEqual(Object.fromEntries(Object.entries(BOOSTER_PACKS).map(([id,p])=>[id,p.weight])),expectedWeights)
 for(const pack of Object.values(BOOSTER_PACKS)){
  const s=E.newRun('OPEN-'+pack.id);s.phase='shop';s.money=100;s.shop={cards:[],packs:[{uid:900,kind:'pack',id:pack.id}],voucher:null,rerolls:0,freeUsed:false}
  assert.equal(E.itemCost(s,s.shop.packs[0]),pack.cost)
  E.buy(s,900);assert.equal(s.pack.id,pack.id);assert.equal(s.pack.kind,pack.family);assert.equal(s.pack.cards.length,pack.options);assert.equal(s.pack.picksLeft,pack.choose)
 }
 const first=E.newRun('FIRST-BOOSTER');E.startBlind(first);first.phase='reward';E.cashOut(first)
 assert.ok(first.shop.packs.some(pack=>pack.id==='joker'),'first shop guarantees a normal Buffoon/Joker pack')
})
test('booster offer choices do not repeat the same card identity',()=>{
 for(const pack of Object.values(BOOSTER_PACKS))for(let seed=0;seed<24;seed++){
  const s=E.newRun(`${pack.id}-${seed}`);s.phase='shop';s.money=100
  if(pack.family==='tarot'&&seed%2===0)s.vouchers.push('omen')
  s.shop={cards:[],packs:[{uid:1000,kind:'pack',id:pack.id}],voucher:null,rerolls:0,freeUsed:false}
  E.buy(s,1000)
  const keys=s.pack.cards.map(c=>c.kind==='card'?`card:${c.rank}:${c.suit}:${c.enh||''}:${c.edition||''}:${c.seal||''}`:`${c.kind}:${c.id}`)
  assert.equal(new Set(keys).size,keys.length,`${pack.id}, seed ${seed}`)
 }
})
test('Showman allows held Jokers and consumables to return in shops, without affecting playing cards',()=>{
 const showmanText=JOKERS.find(j=>j.id==='showman').desc
 assert.match(showmanText,/小丑、塔罗、星球和幻灵牌/);assert.match(showmanText,/商店与补充包/);assert.match(showmanText,/不保证出现/)
 const fixtures=[
  ['joker','joker','SHOP-joker-32'],['tarot','fool','SHOP-tarot-34'],
  ['planet','pair','SHOP-planet-24'],['spectral','hex','SHOP-spectral-1']
 ]
 for(const [kind,held,seed] of fixtures){
  const repeated=shopOffers(seed,kind,{showman:true,held}).some(card=>card.kind===kind&&card.id===held)
  const distinct=shopOffers(seed,kind,{held}).some(card=>card.kind===kind&&card.id===held)
  assert.equal(repeated,true,`${kind} may reappear with Showman`);assert.equal(distinct,false,`${kind} held without Showman stays out of this shop`)
 }
 const withShowman=shopOffers('STANDARD-SHOP-0','joker',{showman:true,magicTrick:true}).filter(card=>card.kind==='card').map(cardIdentity)
 const without=shopOffers('STANDARD-SHOP-0','joker',{magicTrick:true}).filter(card=>card.kind==='card').map(cardIdentity)
 assert.deepEqual(withShowman,without,'Showman must not enable or suppress regular playing-card offers')
 assert.equal(without.length,3,'different playing cards remain separate shop offers')
})
test('Showman permits named repeats inside matching Mega packs, but does not affect Standard packs',()=>{
 const fixtures=[['joker','SHOWMAN-joker-6'],['tarot','SHOWMAN-tarot-0'],['planet','SHOWMAN-planet-1'],['spectral','SHOWMAN-spectral-0']]
 for(const [kind,seed] of fixtures){
  const repeated=boosterOffers(seed,kind,{showman:true}).map(cardIdentity)
  const distinct=boosterOffers(seed,kind).map(cardIdentity)
  assert.ok(new Set(repeated).size<repeated.length,`${kind} Mega pack can contain a repeated named card with Showman`)
  assert.equal(new Set(distinct).size,distinct.length,`${kind} Mega pack stays distinct without Showman`)
 }
 const withShowman=boosterOffers('SHOWMAN-standard-48','standard',{showman:true}).map(cardIdentity)
 const without=boosterOffers('SHOWMAN-standard-48','standard').map(cardIdentity)
 assert.deepEqual(withShowman,without,'Showman has no effect on standard playing-card identities')
})
test('Mega booster packs allow two sequential picks across all five pack families',()=>{
 const fixtures={
  joker:[{uid:910,kind:'joker',id:'joker'},{uid:911,kind:'joker',id:'jolly'}],
  planet:[{uid:901,kind:'planet',id:'high'},{uid:902,kind:'planet',id:'pair'}],
  tarot:[{uid:903,kind:'tarot',id:'hermit'},{uid:904,kind:'tarot',id:'hermit'}],
  standard:[{uid:905,kind:'card',rank:14,suit:0},{uid:906,kind:'card',rank:13,suit:1}],
  spectral:[{uid:907,kind:'spectral',id:'blackhole'},{uid:908,kind:'spectral',id:'blackhole'}]
 }
 for(const [family,choices] of Object.entries(fixtures)){
  const s=E.newRun('MEGA-'+family);s.phase='shop';s.pack={id:`${family}-mega`,kind:family,size:'mega',choose:2,picksLeft:2,picksMade:0,cards:choices,handBefore:[]}
  E.choosePack(s,choices[0].uid);assert.equal(s.pack.picksLeft,1,`${family} remains open after first pick`);assert.equal(s.pack.cards.length,1);assert.equal(s.pack.picksMade,1)
  E.choosePack(s,choices[1].uid);assert.equal(s.pack,null,`${family} closes after second pick`)
 }
})
test('Grim in a spectral pack destroys one card and adds two enhanced Aces before pack close',()=>{
 const s=E.newRun('GRIM');E.startBlind(s);const before=s.deck.map(c=>c.uid);s.pack={kind:'spectral',cards:[{uid:900,kind:'spectral',id:'grim'}],handBefore:[]};s.hand=s.deck.slice(0,8).map(c=>({...c}));E.choosePack(s,900)
 const added=s.deck.filter(c=>!before.includes(c.uid)),removed=before.filter(uid=>!s.deck.some(c=>c.uid===uid))
 assert.equal(s.pack,null);assert.equal(s.hand.length,0);assert.equal(removed.length,1);assert.equal(added.length,2);assert.ok(added.every(c=>c.rank===14&&['bonus','mult','wild','glass','steel','gold','lucky'].includes(c.enh)))
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
 const incompatible=state(),blueprint=add(incompatible,'blueprint');add(incompatible,'trading')
 assert.equal(cardCue(incompatible,blueprint).label,'无法复制','the reminder does not advertise a Trading trigger that the engine will not copy')
})
test('Hanging Chad reminder matches a numeric first scoring card on every hand',()=>{
 const s=state([8,9,10,11,12]),j=add(s,'hanging')
 s.selected=[1,2,3,4,5]
 assert.equal(E.evaluate(s.hand,s).id,'straight')
 assert.equal(cardCue(s,j).label,'首张计分牌 +2 次')
 assert.equal(cardCue(s,j).ready,true,'a numeric 8 can be the first scoring card')
 s.plays=1
 assert.equal(cardCue(s,j).ready,true,'Hanging Chad is not limited to the first play of a blind')
 s.blind=2;s.boss='pillar';s.antePlayed=[1]
 assert.equal(cardCue(s,j).ready,false,'a debuffed first scoring card does not pass its retriggers to the next card')
 s.selected=[]
 assert.equal(cardCue(s,j).ready,false)
 const copied=state([8,9,10,11,12]),blueprint=add(copied,'blueprint')
 add(copied,'hanging');copied.selected=[1,2,3,4,5];copied.plays=1
 assert.equal(cardCue(copied,blueprint).label,'首张计分牌 +2 次')
 assert.equal(cardCue(copied,blueprint).ready,true,'Blueprint inherits the corrected reminder')
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
test('manual reorder changes played scoring order and is saved',()=>{
 const table=Object.create(PokerTable.prototype),s=state([14,14,13,12,10])
 table.state=s;table.sort='rank';table.settings={handSort:'rank'};table.persist=()=>{table.saved=E.clone(table.state)}
 s.selected=[1,2]
 assert.deepEqual(table.orderedHand().map(c=>c.uid),[1,2,3,4,5])
 assert.equal(table.reorderHand(2,0),true)
 assert.equal(table.sort,'custom');assert.equal(table.settings.handSort,'custom')
 assert.deepEqual(table.orderedHand().map(c=>c.uid),[2,1,3,4,5])
 assert.deepEqual(s.selected,[1,2],'moving a selected card does not deselect it')
 assert.deepEqual(table.saved.hand.map(c=>c.uid),[2,1,3,4,5],'manual arrangement is saved')
 assert.deepEqual(E.restore(table.saved).hand.map(c=>c.uid),[2,1,3,4,5],'loading a save preserves the arrangement')
 const result=table.transact(E.play)
 assert.deepEqual(result.cards.map(c=>c.uid),[2,1],'engine receives selected cards in the visible manual order')
 assert.equal(table.reorderHand(999,0),false,'unknown card cannot change arrangement')
})
test('pointer drag moves a hand card without also selecting it on release',()=>{
 const table=Object.create(PokerTable.prototype),s=state([14,13,12])
 table.state=s;table.sort='rank';table.settings={handSort:'rank'};table.busy=false;table.modal=null;table.jokerDrag=null;table.handDrag=null;table.audio={fx:()=>{}}
 table.persist=()=>{};table.render=()=>{};table.animateHandReorder=()=>{};table.later=()=>{};table.root={contains:()=>true,querySelector:selector=>selector==='.bp-hand'?hand:null}
 const wrappers=[]
 const hand={children:wrappers,scrollLeft:0,querySelectorAll:()=>wrappers}
 for(let i=0;i<3;i++){
  const uid=i+1,button={dataset:{uid:String(uid)},disabled:false}
  const classes=new Set(),wrapper={parentElement:hand,querySelector:()=>button,getBoundingClientRect:()=>({left:i*100,top:0,width:80,height:110}),classList:{add:name=>classes.add(name),remove:(...names)=>names.forEach(name=>classes.delete(name))},style:{setProperty:()=>{},removeProperty:()=>{}}}
  button.parentElement=wrapper;button.closest=selector=>selector.includes('bp-hand')?button:null
  wrappers.push(wrapper)
 }
 const down={button:0,pointerId:1,clientX:230,clientY:40,target:wrappers[2].querySelector()}
 table.pointerDown(down)
 table.pointerMove({pointerId:1,clientX:10,clientY:40,preventDefault:()=>{}})
 table.pointerUp({pointerId:1,clientX:10,clientY:40,preventDefault:()=>{}})
 assert.deepEqual(table.state.hand.map(c=>c.uid),[3,1,2])
 assert.equal(table.sort,'custom')
 let clickPrevented=false
 table.click({target:{closest:()=>({dataset:{action:'select',uid:'1'},disabled:false})},preventDefault:()=>{clickPrevented=true}})
 assert.equal(clickPrevented,true);assert.deepEqual(table.state.selected,[],'release click must not select the dragged card or the card under it')
})
test('manual order survives other transactions; rank/suit controls can restore automatic display',()=>{
 const table=Object.create(PokerTable.prototype)
 table.state=state([10,14,13],[2,1,0]);table.sort='custom';table.settings={handSort:'custom'};table.persist=()=>{}
 assert.deepEqual(table.orderedHand().map(c=>c.uid),[1,2,3])
 table.transact(s=>{s.money++})
 assert.deepEqual(table.state.hand.map(c=>c.uid),[1,2,3])
 table.sort='rank';assert.deepEqual(table.orderedHand().map(c=>c.uid),[2,3,1])
 table.sort='suit';assert.deepEqual(table.orderedHand().map(c=>c.uid),[3,2,1])
})
test('moving a Foil card to the first scoring slot raises Hanging Joker score',()=>{
 const score=move=>{
  const table=Object.create(PokerTable.prototype),s=state([8,8,6,4,2])
  add(s,'hanging');s.hand[1].edition=s.deck[1].edition='foil';s.selected=[1,2]
  table.state=s;table.sort='rank';table.settings={handSort:'rank'};table.persist=()=>{}
  if(move)table.reorderHand(2,0)
  return table.transact(E.play).chips
 }
 assert.equal(score(false),92)
 assert.equal(score(true),192)
})
test('the play hand has no detail buttons while card acquisition explains a Blue Seal',()=>{
 const table=Object.create(PokerTable.prototype),s=state([8,11,12])
 s.hand[0].seal=s.deck[0].seal='blue';s.hand[1].enh=s.deck[1].enh='bonus';s.selected=[1,2]
 table.state=s;table.sort='rank';table.actionFx=null;table.anim=null;table.busy=false;table.modal=null;table.pendingPlanet=null;table.packFx=null;table.packChoiceFx=null
 const html=table.hand(s)
 assert.ok(!html.includes('data-action="card-details"'),'hand cards must not cover adjacent ranks or seals with detail controls')
 assert.ok(!html.includes('bp-selected-card-details'),'selected cards do not open a second detail row during play')
 assert.match(html,/蓝封·星球/,'the visible hand card still identifies its Blue Seal')
 const acquired=table.itemTile({uid:999,kind:'card',rank:8,suit:0,seal:'blue'},'pack')
 assert.match(acquired,/蓝色蜡封：/,'a card offered by a pack explains the seal before acquisition')
})
test('score animation waits until blind reward to reveal Blue Seal Planets',()=>{
 const before=state(),after=E.clone(before)
 before.hand[0].seal=before.deck[0].seal=after.hand[0].seal=after.deck[0].seal='blue'
 after.score=E.target(after)-1;after.selected=[2];E.play(after)
 assert.equal(after.phase,'reward');assert.equal(after.consumables.length,0,'the Planet is not granted before cashout')
 assert.equal(E.previewReward(after).blueSealPlanets,1)
 const table=Object.create(PokerTable.prototype)
 table.state=after;table.actionFx=null;table.itemTile=c=>`<i data-consumable="${c.kind}:${c.id}"></i>`
 table.anim={before}
 assert.ok(!table.inventory(after).includes('data-consumable="planet:'),'the Planet is not shown before scoring finishes')
 table.anim=null
 assert.match(table.reward(after),/蓝色蜡封留在手牌中：领取后获得 1 张星球牌/,'the reward page previews the pending Planet')
 E.cashOut(after)
 assert.match(table.inventory(after),/data-consumable="planet:/,'the Planet appears only after cashing out')
})
test('scoring visibly reaches the target before money and Blue Seal rewards appear',()=>{
 const before=state([14,13,12,10,8]),queue=[]
 before.money=7;before.hand[0].seal=before.deck[0].seal='blue';before.selected=[2]
 add(before,'stuntman');add(before,'stuntman');add(before,'golden')
 const expiring=add(before,'seltzer');expiring.value=1
 const table=Object.create(PokerTable.prototype)
 table.state=before;table.sort='custom';table.settings={sound:false,music:false,fast:false}
 table.anim=null;table.actionFx=null;table.busy=false;table.timers=new Set();table.scoreTimer=null;table.scoreToken=0
 table.audio={fx:()=>{}};table.persist=()=>{};table.showEffect=()=>{}
 table.root={querySelector:()=>null,querySelectorAll:()=>[]}
 table.render=()=>{};table.later=fn=>{const timer={fn};queue.push(timer);return timer}
 const previousWindow=globalThis.window
 globalThis.window={matchMedia:()=>({matches:false})}
 try{table.animatePlay()}finally{globalThis.window=previousWindow}
 assert.equal(table.state.phase,'reward','the winning play reaches the reward stage before playback')
 assert.equal(table.anim.displayScore,before.score)
 assert.equal(table.state.money,before.money,'money waits for cashout')
 assert.equal(E.previewReward(table.state).blueSealPlanets,1)
 const pending=table.game()
 assert.match(pending,/<div class="bp-money">\$7<\/div>/,'the wallet stays at the pre-play amount')
 assert.match(pending,/<b data-round-score>0<\/b>/,'the score has not started moving')
 assert.match(pending,new RegExp(`data-visual="${expiring.uid}"`),'a Joker that expires this play remains visible while scoring')
 assert.doesNotMatch(pending,/盲注击破|蓝色蜡封留在手牌中/,'rewards are not presented early')
 assert.doesNotMatch(pending,/种子 REGRESSION/,'the deck footer still belongs to the play phase')
 queue.shift().fn()
 assert.ok(table.anim.displayScore>before.score,'the first scoring event advances the visible round score')
 assert.ok(table.anim.displayScore<E.target(before),'the first event has not yet beaten the blind')
 assert.match(table.game(),/<div class="bp-money">\$7<\/div>/,'scoring events do not reveal final money')
 let steps=0,reachedTargetBeforeReward=false
 while(table.anim&&steps++<100){
  assert.ok(queue.length,'animation has a pending timer');queue.shift().fn()
  if(table.anim){
   const frame=table.game()
   assert.match(frame,/<div class="bp-money">\$7<\/div>/)
   assert.doesNotMatch(frame,/盲注击破|蓝色蜡封留在手牌中/)
   if(table.anim.displayScore>=E.target(before))reachedTargetBeforeReward=true
  }
 }
 assert.equal(table.anim,null,'the score animation completes')
 assert.ok(steps<100,'the score animation terminates')
 assert.equal(reachedTargetBeforeReward,true,'the target score appears before the reward stage')
 const settled=table.game()
 assert.match(settled,/<h2>盲注击破<\/h2>/)
 assert.ok(settled.includes(`<b data-round-score>${table.state.score.toLocaleString('en-US')}</b>`))
 assert.ok(settled.includes(`<div class="bp-money">$${table.state.money}</div>`))
 assert.doesNotMatch(settled,new RegExp(`data-visual="${expiring.uid}"`),'expired Jokers disappear only after scoring completes')
 assert.match(settled,/蓝色蜡封留在手牌中：领取后获得 1 张星球牌/)
 E.cashOut(table.state)
 assert.ok(table.state.money>before.money,'rewards land in the wallet on cashout')
 assert.equal(table.state.consumables.filter(c=>c.kind==='planet').length,1,'the Blue Seal Planet appears on cashout')
})
test('Gold Seal cash stays visually pending even when the blind is not defeated',()=>{
 const before=state([14,13,12])
 before.money=7;before.hand[0].seal=before.deck[0].seal='gold';before.selected=[1]
 const after=E.clone(before)
 const result=E.play(after)
 assert.equal(after.phase,'play');assert.equal(after.money,10)
 const table=Object.create(PokerTable.prototype)
 table.state=after;table.sort='custom';table.settings={sound:false,music:false};table.busy=true;table.actionFx=null
 table.anim={before,result,event:result.events[0],displayScore:before.score}
 assert.match(table.game(),/<div class="bp-money">\$7<\/div>/)
 table.anim=null;table.busy=false
 assert.match(table.game(),/<div class="bp-money">\$10<\/div>/)
})
