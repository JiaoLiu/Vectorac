import { HANDS, JOKERS, TAROTS, SPECTRALS, VOUCHERS, BOSSES, DECKS, BOOSTER_PACKS, boosterPack, byId } from './catalog.mjs'

export const VERSION = 3
export const clone = value => JSON.parse(JSON.stringify(value))
const assert = (condition, message) => { if (!condition) throw new Error(message) }
export function random(s) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0
  return s.rng / 4294967296
}
const pick = (s, list) => list[Math.floor(random(s) * list.length)]
const chance = (s, n) => random(s) < Math.pow(2, s.jokers.filter(j => j.id === 'oops' && !j.disabled).length) / n
export function shuffle(s, list) {
  const a = list.slice()
  for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(random(s) * (i + 1)); [a[i], a[k]] = [a[k], a[i]] }
  return a
}
export const has = (s, id) => s.jokers.some(j => j.id === id && !j.disabled && !j.perished)
const count = (s, id) => s.jokers.filter(j => j.id === id && !j.disabled && !j.perished).length
const owns = (s, id) => s.vouchers.includes(id)
const face = (s, c) => c.enh !== 'stone' && (c.rank >= 11 && c.rank <= 13 || has(s, 'pareidolia'))
export const cardChips = c => c.enh === 'stone' ? 50 : c.rank === 14 ? 11 : Math.min(10, c.rank)
export const matchesSuit = (s, c, suit) => c.enh !== 'stone' && (c.enh === 'wild' || c.suit === suit || has(s, 'smeared') && c.suit % 2 === suit % 2)
export function slots(s) {
  return 5 + (s.deckType === 'black' ? 1 : 0) - (s.deckType === 'painted' ? 1 : 0) + Number(owns(s, 'antimatter')) + s.jokers.filter(j => j.edition === 'negative').length
}
export const consumableSlots = s => 2 + Number(owns(s, 'crystal')) - Number(s.deckType === 'nebula') + s.consumables.filter(c=>c.edition==='negative').length
export const sellValue = j => (j.kind==='joker'?Math.max(1, Math.floor((byId(JOKERS,j.id).cost + (j.edition ? 2 : 0)) / 2)) + (j.id === 'egg' ? j.value : 0):1) + (j.sellBonus||0)
export const handSize = s => Math.max(1, 8 + Number(owns(s,'paint')) + Number(owns(s,'palette')) + count(s,'juggler') + count(s,'troubadour')*2 - count(s,'stuntman')*2 - count(s,'merryandy') + (s.deckType === 'painted' ? 2 : 0) + s.handDelta + s.jokers.filter(j=>j.id==='turtle').reduce((n,j)=>n+j.value,0) - Number(bossActive(s,'manacle')))
export function baseTarget(s) {
  const bases = s.stake>=5?[300,1000,3200,9000,25000,60000,110000,200000]:s.stake>=2?[300,900,2600,8000,20000,36000,60000,100000]:[300,800,2000,5000,11000,20000,35000,50000]
  return s.ante <= 8 ? bases[s.ante-1] : Math.floor(50000 * Math.pow(1.6, (s.ante-8)*2 + (s.ante-8)*(s.ante-9)/2))
}
export function target(s, blind = s.blind) {
  let factor = [1,1.5,2][blind]
  if (blind === 2 && !s.disabledBoss && !has(s,'chicot')) factor = {wall:4, needle:1, vessel:6}[s.boss] || 2
  return Math.floor(baseTarget(s) * factor * (s.deckType === 'plasma' ? 2 : 1))
}
function chooseBoss(s) {
  const final = s.ante % 8 === 0
  s.boss = pick(s, BOSSES.filter(b => b.final === final && b.min <= s.ante)).id
  s.bossRerolled = false
}
export function newRun(seed = String(Date.now()), deckType = 'red', stake = 0) {
  assert(byId(DECKS,deckType), '未知牌组')
  let hash = 2166136261
  for (const char of String(seed).slice(0,32)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  const s = {version:VERSION, seed:String(seed).slice(0,32), rng:hash, uid:0, phase:'select', deckType, stake:Math.max(0,Math.min(7,Number(stake)||0)), ante:1, blind:0, round:0, money:4,
    deck:[], hand:[], draw:[], spent:[], selected:[], jokers:[], consumables:[], vouchers:[], tags:[], levels:{}, played:{}, roundPlayed:{}, antePlayed:[], blindPlayed:[],
    score:0, hands:4, discards:3, plays:0, discarded:0, totalHands:0, skips:0, handDelta:0, ectoplasm:0, planets:[], tarotUsed:0, lastUsed:null,
    best:0, earned:0, boss:'', forced:null, disabledBoss:false, shop:null, pack:null, lastResult:null, roundReward:null, won:false, endless:false, grosGone:false}
  HANDS.forEach(h=>{s.levels[h.id]=1;s.played[h.id]=0})
  for(let suit=0;suit<4;suit++) for(let rank=2;rank<=14;rank++) {
    if(deckType==='abandoned' && rank>=11 && rank<=13) continue
    s.deck.push({uid:++s.uid,rank:deckType==='erratic'?2+Math.floor(random(s)*13):rank,suit:deckType==='erratic'?Math.floor(random(s)*4):deckType==='checkered'?suit%2:suit,enh:null,edition:null,seal:null})
  }
  if(deckType==='yellow') s.money+=10
  if(deckType==='magic') {s.vouchers.push('crystal');s.consumables.push(item(s,'tarot','fool'),item(s,'tarot','fool'))}
  if(deckType==='nebula') s.vouchers.push('telescope')
  if(deckType==='zodiac') s.vouchers.push('overstock','tarotmerchant','planetmerchant')
  if(deckType==='ghost') s.consumables.push(item(s,'spectral','hex'))
  s.initialDeckSize=s.deck.length;chooseBoss(s)
  return s
}

export function evaluate(cards, s = {jokers:[]}) {
  assert(cards.length > 0 && cards.length <= 5, '请选择 1～5 张牌')
  const normal = cards.filter(c=>c.enh!=='stone'), groups = new Map()
  normal.forEach(c=>groups.set(c.rank,(groups.get(c.rank)||[]).concat(c)))
  const sorted = Array.from(groups.values()).sort((a,b)=>b.length-a.length || b[0].rank-a[0].rank)
  const size = has(s,'fourfingers')?4:5
  const findStraight = subset => {
    const values = Array.from(new Set(subset.map(c=>c.rank))).sort((a,b)=>a-b)
    if(values.includes(14)) values.unshift(1)
    let seq=[]
    for(const v of values) {
      if(seq.length && (v-seq[seq.length-1] > (has(s,'shortcut')?2:1))) seq=[]
      seq.push(v)
      if(seq.length>=size) return subset.filter(c=>seq.slice(-size).includes(c.rank)||c.rank===14&&seq.slice(-size).includes(1))
    }
    return []
  }
  const flushes = [0,1,2,3].map(suit=>normal.filter(c=>matchesSuit(s,c,suit))).filter(a=>a.length>=size)
  const straight = findStraight(normal), flush=flushes[0]||[]
  const sf = flushes.map(findStraight).find(a=>a.length>=size) || (has(s,'fourfingers') && flush.length && straight.length ? normal : [])
  const lengths = sorted.map(a=>a.length), pair=lengths.filter(n=>n>=2).length>0, two=lengths.filter(n=>n>=2).length>=2, three=lengths.some(n=>n>=3), four=lengths.some(n=>n>=4)
  let id='high', scoring=[]
  if(lengths[0]===5 && flush.length===5) {id='ffive';scoring=normal}
  else if(lengths[0]===3 && lengths[1]===2 && flush.length===5) {id='ffull';scoring=normal}
  else if(lengths[0]===5) {id='five';scoring=normal}
  else if(sf.length) {id='sf';scoring=sf}
  else if(four) {id='four';scoring=sorted[0]}
  else if(lengths[0]===3 && lengths[1]===2) {id='full';scoring=normal}
  else if(flush.length) {id='flush';scoring=flush}
  else if(straight.length) {id='straight';scoring=straight}
  else if(three) {id='three';scoring=sorted[0]}
  else if(two) {id='two';scoring=sorted.filter(a=>a.length===2).flat()}
  else if(pair) {id='pair';scoring=sorted[0]}
  else if(normal.length) scoring=[normal.reduce((a,b)=>a.rank>b.rank?a:b)]
  const ids = new Set(scoring.map(c=>c.uid))
  return {id, scoring:cards.filter(c=>ids.has(c.uid)||c.enh==='stone'||has(s,'splash')), contains:{pair,two,three,four,straight:!!straight.length,flush:!!flush.length}}
}
export function handBase(s,id) {
  const h=byId(HANDS,id), level=s.levels[id]||1
  return {chips:h.chips+(level-1)*h.dc,mult:h.mult+(level-1)*h.dm}
}
function bossActive(s,id) { return s.blind===2 && !s.disabledBoss && !has(s,'chicot') && s.boss===id }
export function debuffed(s,c) {
  if(s.blind!==2||s.disabledBoss||has(s,'chicot')) return false
  const suits={club:2,goad:0,window:3,head:1}
  return s.boss==='leaf' || (suits[s.boss]!==undefined && matchesSuit(s,c,suits[s.boss])) || s.boss==='plant'&&face(s,c) || s.boss==='pillar'&&s.antePlayed.includes(c.uid)
}
export function preview(s) {
  if(!s.selected.length) return null
  const cards=s.selected.map(id=>s.hand.find(c=>c.uid===id)).filter(Boolean)
  if(!cards.length)return null
  if(cards.some(c=>c.hidden))return {unknown:true,name:'暗牌 · 牌型未知'}
  const e=evaluate(cards,s)
  return Object.assign(e,handBase(s,e.id),{name:byId(HANDS,e.id).name})
}
function item(s,kind,id) { return {uid:++s.uid,kind,id} }
function edition(s) {
  const roll=random(s), rate=owns(s,'glow')?.3:owns(s,'hone')?.15:.07
  return roll<rate*.12?'negative':roll<rate*.3?'poly':roll<rate*.6?'holo':roll<rate?'foil':null
}
export function makeJoker(s,id,ed=null) {
  const values={ice:100,popcorn:20,ramen:2,banana:3,constellation:1,hologram:1,vampire:1,glass:1,luckycat:1,wee:10,turtle:5,rocket:1,seltzer:10,madness:1,obelisk:1,campfire:1,hitroad:1,canio:1,yorick:1}
  return {uid:++s.uid,id,kind:'joker',edition:ed,value:values[id]||0,counter:0,suit:Math.floor(random(s)*4),rank:2+Math.floor(random(s)*13),hand:pick(s,HANDS.slice(0,9)).id,disabled:false}
}
function randomJoker(s,rarity,excluded=new Set()) {
  const roll=random(s), r=rarity || (roll<.7?1:roll<.95?2:3)
  const repeat=has(s,'showman'), eligible=j=>(j.id!=='banana'||s.grosGone)&&(repeat||!s.jokers.some(x=>x.id===j.id)&&!excluded.has(j.id))
  let pool=JOKERS.filter(j=>j.rarity===r&&eligible(j))
  if(!pool.length)pool=JOKERS.filter(eligible)
  if(!pool.length)pool=JOKERS.filter(j=>j.id!=='banana'||s.grosGone)
  return makeJoker(s,pick(s,pool).id,edition(s))
}
function planet(s, excluded = new Set()) {
  const held = new Set(s.consumables.filter(c=>c.kind==='planet').map(c=>c.id))
  const repeat=has(s,'showman')
  let available = HANDS.filter(h=>repeat||!excluded.has(h.id)&&!held.has(h.id))
  if(!available.length)available=HANDS.filter(h=>repeat||!excluded.has(h.id))
  if(!available.length)available=HANDS
  const playable = available.filter(h=>HANDS.indexOf(h)<9||s.played[h.id]>0)
  const chosen = pick(s,playable.length?playable:available)
  excluded.add(chosen.id)
  return item(s,'planet',chosen.id)
}
function tarot(s,excluded=new Set()) {
  const repeat=has(s,'showman'),held=new Set(s.consumables.filter(c=>c.kind==='tarot').map(c=>c.id))
  let pool=TAROTS.filter(t=>repeat||!held.has(t.id)&&!excluded.has(t.id))
  if(!pool.length)pool=TAROTS.filter(t=>repeat||!excluded.has(t.id))
  if(!pool.length)pool=TAROTS
  return item(s,'tarot',pick(s,pool).id)
}
function spectral(s,excluded=new Set(),includeSpecial=false) {
  const repeat=has(s,'showman'),held=new Set(s.consumables.filter(c=>c.kind==='spectral').map(c=>c.id))
  const inScope=x=>includeSpecial||!['soul','blackhole'].includes(x.id)
  let pool=SPECTRALS.filter(x=>inScope(x)&&(repeat||!held.has(x.id)&&!excluded.has(x.id)))
  if(!pool.length)pool=SPECTRALS.filter(x=>inScope(x)&&(repeat||!excluded.has(x.id)))
  if(!pool.length)pool=SPECTRALS.filter(inScope)
  return item(s,'spectral',pick(s,pool).id)
}
function specialSpectral(s,excluded=new Set()) {
  const repeat=has(s,'showman'),held=new Set(s.consumables.filter(c=>c.kind==='spectral').map(c=>c.id))
  let pool=SPECTRALS.filter(x=>['soul','blackhole'].includes(x.id)&&(repeat||!held.has(x.id)&&!excluded.has(x.id)))
  if(!pool.length)pool=SPECTRALS.filter(x=>repeat||!held.has(x.id)&&!excluded.has(x.id))
  if(!pool.length)pool=SPECTRALS.filter(x=>['soul','blackhole'].includes(x.id))
  return item(s,'spectral',pick(s,pool).id)
}
function packCardKey(c) {
  if(c.kind==='card')return `card:${c.rank}:${c.suit}:${c.enh||''}:${c.edition||''}:${c.seal||''}`
  return `${c.kind}:${c.id}`
}
const showmanRepeatKinds=new Set(['joker','tarot','planet','spectral'])
function packUsedIds(used,kind) { const prefix=`${kind}:`;return new Set([...used].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length))) }
function distinctPackDraw(s,used,draw) {
  let card
  for(let attempt=0;attempt<64;attempt++) {
    card=draw(used)
    const key=packCardKey(card)
    if(has(s,'showman')&&showmanRepeatKinds.has(card.kind)||!used.has(key)) {used.add(key);return card}
  }
  // If a pool is genuinely exhausted, allow a duplicate instead of looping forever.
  used.add(packCardKey(card))
  return card
}
function addConsumable(s,card) { if(s.consumables.length<consumableSlots(s)) {s.consumables.push(card);return true} return false }
function addCard(s,c) {
  const card=Object.assign({},c,{uid:++s.uid});delete card.hidden
  s.deck.push(card)
  s.jokers.filter(j=>j.id==='hologram').forEach(j=>j.value+=.25)
  return card
}
function removeCards(s,ids) {
  const removed=s.deck.filter(c=>ids.includes(c.uid))
  s.jokers.filter(j=>j.id==='canio').forEach(j=>j.value+=removed.filter(c=>face(s,c)).length)
  for(const field of ['deck','hand','draw','spent']) s[field]=s[field].filter(c=>!ids.includes(c.uid))
  s.jokers.filter(j=>j.id==='glass').forEach(j=>j.value+=.75*removed.filter(c=>c.enh==='glass').length)
  s.selected=s.selected.filter(id=>!ids.includes(id))
}
function syncCards(s) {
  // Draw/hand objects can diverge after JSON restore. The permanent deck is authoritative.
  const map=new Map(s.deck.map(c=>[c.uid,c]))
  for(const field of ['hand','draw','spent']) s[field]=s[field].filter(c=>map.has(c.uid)).map(c=>Object.assign({},map.get(c.uid),{hidden:!!c.hidden}))
}
function drawCards(s,n,cause) {
  for(let i=0;i<n&&s.draw.length;i++) {
    const c=s.draw.pop()
    c.hidden=bossActive(s,'house')&&cause==='initial' || bossActive(s,'mark')&&face(s,c) || bossActive(s,'wheel')&&chance(s,7) || bossActive(s,'fish')&&cause==='play'
    s.hand.push(c)
  }
  if(bossActive(s,'bell') && (!s.forced||!s.hand.some(c=>c.uid===s.forced))) s.forced=s.hand.length?pick(s,s.hand).uid:null
  if(s.forced&&!s.selected.includes(s.forced)) s.selected.push(s.forced)
}
export function selectCard(s,uid) {
  assert(s.phase==='play'||s.pack, '当前不能选牌')
  assert(s.hand.some(c=>c.uid===uid),'这张牌不在手中')
  if(s.selected.includes(uid)) { if(uid!==s.forced)s.selected=s.selected.filter(id=>id!==uid) }
  else if(s.selected.length<5) s.selected.push(uid)
}
export function startBlind(s) {
  assert(s.phase==='select','请先完成当前盲注')
  s.phase='play';s.round++;s.plays=0;s.discarded=0;s.score=0;s.roundPlayed={};s.selected=[];s.spent=[];s.blindPlayed=[];s.forced=null;s.disabledBoss=false;s.lastResult=null
  s.jokers.forEach(j=>{j.disabled=false;if(!['yorick','loyalty'].includes(j.id))j.counter=0})
  for(const j of s.jokers.slice()) if(j.id==='ceremonial') {
    const index=s.jokers.indexOf(j), victim=s.jokers[index+1]
    if(victim&&!victim.eternal) {j.value+=sellValue(victim)*2;s.jokers.splice(index+1,1)}
  }
  if(bossActive(s,'acorn')) s.jokers=shuffle(s,s.jokers)
  const certificates=[],startEffects=jokerTriggers(s,'blindStart')
  let burglarTriggers=0
  for(const {slot,j} of startEffects) {
    if(!s.jokers.includes(slot)||!s.jokers.includes(j)||j.perished)continue
    if(j.id==='burglar')burglarTriggers++
    if(j.id==='marble')addCard(s,{rank:2+Math.floor(random(s)*13),suit:Math.floor(random(s)*4),enh:'stone',edition:null,seal:null})
    if(j.id==='riff')for(let i=0;i<2&&s.jokers.length<slots(s);i++)s.jokers.push(randomJoker(s,1))
    if(j.id==='cartomancer')addConsumable(s,tarot(s))
    if(j.id==='madness'&&s.blind<2){j.value+=.5;const pool=s.jokers.filter(x=>x!==j&&!x.eternal);if(pool.length){const dead=pick(s,pool);s.jokers=s.jokers.filter(x=>x!==dead)}}
    if(j.id==='certificate')certificates.push(addCard(s,{rank:2+Math.floor(random(s)*13),suit:Math.floor(random(s)*4),enh:null,edition:null,seal:pick(s,['red','blue','gold','purple'])}))
  }
  s.hands=Math.max(1,4+Number(s.deckType==='blue')-Number(s.deckType==='black')+Number(owns(s,'grabber'))+Number(owns(s,'nacho'))-Number(owns(s,'hieroglyph'))-count(s,'troubadour'))
  s.discards=Math.max(0,3+Number(s.deckType==='red')+Number(owns(s,'wasteful'))+Number(owns(s,'recyclo'))+count(s,'drunk')+count(s,'merryandy')*3-Number(owns(s,'petroglyph'))-Number(s.stake>=4))
  if(burglarTriggers){s.hands+=3*burglarTriggers;s.discards=0}
  if(bossActive(s,'needle'))s.hands=1
  if(bossActive(s,'water'))s.discards=0
  s.oxHand=HANDS.reduce((a,b)=>(s.played[b.id]||0)>(s.played[a.id]||0)?b:a).id
  s.hand=certificates.map(c=>Object.assign({},c));s.draw=shuffle(s,s.deck.filter(c=>!certificates.some(x=>x.uid===c.uid)).map(c=>Object.assign({},c)));drawCards(s,Math.max(0,handSize(s)-s.hand.length),'initial')
  if(s.tags.includes('hands')){s.hands+=3;s.tags.splice(s.tags.indexOf('hands'),1)}
  if(s.tags.includes('discards')){s.discards+=3;s.tags.splice(s.tags.indexOf('discards'),1)}
}
export function skipBlind(s) {
  assert(s.phase==='select'&&s.blind<2,'Boss 盲注不能跳过')
  const n=1+s.tags.filter(t=>t==='double').length;s.tags=s.tags.filter(t=>t!=='double')
  const reward=skipReward(s)
  for(let i=0;i<n;i++) {if(reward==='money')s.money+=15;else s.tags.push(reward)}
  s.skips++;s.blind++
}
export const skipReward = s => ['money','rare','hands','discards','free'][((s.ante-1)*2+s.blind)%5]
export function rerollBoss(s) {
  assert(s.phase==='select'&&owns(s,'director'),'需要导演剪辑优惠券')
  assert(!s.bossRerolled||owns(s,'retcon'),'本底注已更换过 Boss')
  pay(s,10);const old=s.boss;chooseBoss(s);if(s.boss===old){const pool=BOSSES.filter(b=>b.final===(s.ante%8===0)&&b.min<=s.ante&&b.id!==old);s.boss=pick(s,pool).id}s.bossRerolled=true
}

// Resolve copy chains without recursion loops. Editions belong to the original slot.
function effective(s,index,seen=[]) {
  if(index<0||index>=s.jokers.length||seen.includes(index))return null
  const j=s.jokers[index];if(j.disabled||j.perished)return null
  if(j.id==='blueprint')return effective(s,index+1,seen.concat(index))
  if(j.id==='brainstorm')return effective(s,0,seen.concat(index))
  return j
}
// Copyable triggers are deliberately phase-scoped. Passive slot/hand-size rules,
// card editions, and stickers stay on their own card. Stateful effects marked
// compatible by the original (including Madness and Square) run once per trigger;
// incompatible destructive one-offs are excluded. Golden Joker is an explicit
// exception requested for this game's Blueprint behavior.
const BLUEPRINT_COPYABLE = {
  scoring: new Set(('greedy lusty wrath glutton fibonacci scary even odd scholar business photograph smiley ticket triboulet bloodstone arrowhead onyx rough walkie ancient idol wee eightball hiker mime baron shoot reserved jolly zany mad crazy droll sly wily clever devious crafty duo trio family order tribe joker half banner summit misprint fist blackboard steel abstract supernova green bus trousers popcorn redcard flash ceremonial runner square ice castle constellation hologram ramen banana vampire glass luckycat madness obelisk campfire hitroad canio yorick fortune acrobat loyalty stencil bull boot seeing cardsharp flower stone throwback gros blue erosion swash stuntman drivers superposition seance vagabond toDo DNA baseball sock hack dusk seltzer hanging space matador').split(' ')),
  blindStart: new Set(['marble','riff','cartomancer','madness','certificate','burglar']),
  discard: new Set(['green','ramen','burnt','castle','mail','faceless','hitroad','yorick']),
  roundReward: new Set(['golden']),
  shopExit: new Set(['perkeo']),
  packOpen: new Set(['hallucination'])
}
export function blueprintCanCopy(id,phase) { return !!(BLUEPRINT_COPYABLE[phase]&&BLUEPRINT_COPYABLE[phase].has(id)) }
export function blueprintCanCopyAny(id) { return Object.values(BLUEPRINT_COPYABLE).some(ids=>ids.has(id)) }
function jokerTriggers(s,phase) {
  return s.jokers.map((slot,index)=>({slot,j:effective(s,index)})).filter(({slot,j})=>j&&(slot===j||blueprintCanCopy(j.id,phase)))
}
function scoring(s,cards,e) {
  let {chips,mult}=handBase(s,e.id), events=[],destroy=[]
  if(bossActive(s,'flint')){chips=Math.max(1,Math.round(chips/2));mult=Math.max(1,Math.round(mult/2))}
  const add=(source,c=0,m=0,x=1,uid=null)=>{chips+=c;mult=(mult+m)*x;if(c||m||x!==1)events.push({source,chips,mult,c,m,x,uid})}
  events.push({source:byId(HANDS,e.id).name,chips,mult,c:chips,m:mult,x:1})
  const effects=jokerTriggers(s,'scoring')
  const createTarot=(source,uid)=>{
    const card=tarot(s)
    if(addConsumable(s,card))events.push({source:`${source}：生成${byId(TAROTS,card.id).name}`,chips,mult,uid})
  }
  const scoringCards=e.scoring, held=s.hand.filter(c=>!cards.some(p=>p.uid===c.uid))
  for(const {j} of effects) {
    if(j.id==='green')j.value++
    if(j.id==='bus')j.value=scoringCards.some(c=>face(s,c)&&!debuffed(s,c))?0:j.value+1
    if(j.id==='square'&&cards.length===4)j.value+=4
    if(j.id==='runner'&&e.contains.straight)j.value+=15
    if(j.id==='trousers'&&e.contains.two)j.value+=2
    if(j.id==='vampire')for(const c of scoringCards)if(c.enh&&!debuffed(s,c)){c.enh=null;s.deck.find(x=>x.uid===c.uid).enh=null;j.value+=.1}
    if(j.id==='obelisk')j.value=s.played[e.id]===Math.max(...Object.values(s.played))?1:j.value+.2
    if(j.id==='sixth'&&s.plays===0&&cards.length===1&&cards[0].rank===6){destroy.push(cards[0].uid);addConsumable(s,spectral(s))}
    if(j.id==='midas')cards.filter(c=>face(s,c)).forEach(c=>{c.enh='gold';s.deck.find(x=>x.uid===c.uid).enh='gold'})
  }
  let photographed=false
  for(const c of scoringCards) {
    if(debuffed(s,c)) {events.push({source:'被 Boss 削弱',chips,mult,c:0,m:0,x:1,uid:c.uid});continue}
    let repeats=1+Number(c.seal==='red')
    effects.forEach(({j})=>{if(j.id==='sock'&&face(s,c)||j.id==='hack'&&[2,3,4,5].includes(c.rank)||j.id==='dusk'&&s.hands===1||j.id==='seltzer')repeats++;if(j.id==='hanging'&&c.uid===scoringCards[0].uid)repeats+=2})
    const firstFace=face(s,c)&&!photographed;if(face(s,c))photographed=true
    for(let repeat=0;repeat<repeats;repeat++) {
      add(repeat?'再次触发':'扑克牌',cardChips(c)+(c.bonus||0),0,1,c.uid)
      if(c.enh==='bonus')add('奖励牌',30,0,1,c.uid)
      if(c.enh==='mult')add('倍率牌',0,4,1,c.uid)
      if(c.enh==='glass')add('玻璃牌',0,0,2,c.uid)
      if(c.enh==='lucky') {
        let triggered=0
        if(chance(s,5)){add('幸运牌',0,20,1,c.uid);triggered++}
        if(chance(s,15)){s.money+=20;triggered++;events.push({source:'幸运牌 +$20',chips,mult,uid:c.uid})}
        if(triggered)s.jokers.filter(j=>j.id==='luckycat').forEach(j=>j.value+=.25*triggered)
      }
      if(c.edition==='foil')add('闪箔',50,0,1,c.uid)
      if(c.edition==='holo')add('镭射',0,10,1,c.uid)
      if(c.edition==='poly')add('多彩',0,0,1.5,c.uid)
      if(c.seal==='gold')s.money+=3
      for(const {j,slot} of effects) {
        const name=byId(JOKERS,j.id).name, suit={greedy:3,lusty:1,wrath:0,glutton:2}[j.id]
        const emit=(ch=0,mu=0,x=1)=>add(name,ch,mu,x,slot.uid)
        if(suit!==undefined&&matchesSuit(s,c,suit))emit(0,3)
        if(j.id==='fibonacci'&&c.enh!=='stone'&&[14,2,3,5,8].includes(c.rank))emit(0,8)
        if(j.id==='scary'&&face(s,c))emit(30)
        if(j.id==='even'&&c.enh!=='stone'&&[2,4,6,8,10].includes(c.rank))emit(0,4)
        if(j.id==='odd'&&c.enh!=='stone'&&[14,3,5,7,9].includes(c.rank))emit(31)
        if(j.id==='scholar'&&c.enh!=='stone'&&c.rank===14)emit(20,4)
        if(j.id==='business'&&face(s,c)&&chance(s,2))s.money+=2
        if(j.id==='photograph'&&firstFace)emit(0,0,2)
        if(j.id==='smiley'&&face(s,c))emit(0,5)
        if(j.id==='ticket'&&c.enh==='gold')s.money+=4
        if(j.id==='triboulet'&&c.enh!=='stone'&&[12,13].includes(c.rank))emit(0,0,2)
        if(j.id==='bloodstone'&&matchesSuit(s,c,1)&&chance(s,2))emit(0,0,1.5)
        if(j.id==='arrowhead'&&matchesSuit(s,c,0))emit(50)
        if(j.id==='onyx'&&matchesSuit(s,c,2))emit(0,7)
        if(j.id==='rough'&&matchesSuit(s,c,3))s.money++
        if(j.id==='walkie'&&c.enh!=='stone'&&[10,4].includes(c.rank))emit(10,4)
        if(j.id==='ancient'&&matchesSuit(s,c,j.suit))emit(0,0,1.5)
        if(j.id==='idol'&&c.rank===j.rank&&matchesSuit(s,c,j.suit))emit(0,0,2)
        if(j.id==='wee'&&c.enh!=='stone'&&c.rank===2)j.value+=8
        if(j.id==='eightball'&&c.enh!=='stone'&&c.rank===8&&chance(s,4))createTarot(name,slot.uid)
        if(j.id==='hiker'){c.bonus=(c.bonus||0)+5;s.deck.find(x=>x.uid===c.uid).bonus=c.bonus}
      }
    }
    if(c.enh==='glass'&&chance(s,4))destroy.push(c.uid)
  }
  const mime=effects.filter(x=>x.j.id==='mime').length
  for(const c of held) if(!debuffed(s,c))for(let i=0;i<1+mime+Number(c.seal==='red');i++) {
    if(c.enh==='steel')add('钢铁牌',0,0,1.5,c.uid)
    for(const {j,slot} of effects) {
      if(j.id==='baron'&&c.rank===13&&c.enh!=='stone')add('男爵',0,0,1.5,slot.uid)
      if(j.id==='shoot'&&c.rank===12&&c.enh!=='stone')add('射月',0,13,1,slot.uid)
      if(j.id==='reserved'&&face(s,c)&&chance(s,2))s.money++
    }
  }
  const effectBySlot=new Map(effects.map(({slot,j})=>[slot,j]))
  for(const slot of s.jokers) {
    if(slot.disabled||slot.perished)continue
    const j=effectBySlot.get(slot)||null
    if(slot.edition==='foil')add('闪箔',50,0,1,slot.uid)
    if(slot.edition==='holo')add('镭射',0,10,1,slot.uid)
    if(j) {
      const emit=(ch=0,mu=0,x=1)=>add(byId(JOKERS,j.id).name,ch,mu,x,slot.uid)
      const bonuses={jolly:['pair',0,8],zany:['three',0,12],mad:['two',0,10],crazy:['straight',0,12],droll:['flush',0,10],sly:['pair',50,0],wily:['three',100,0],clever:['two',80,0],devious:['straight',100,0],crafty:['flush',80,0],duo:['pair',0,0,2],trio:['three',0,0,3],family:['four',0,0,4],order:['straight',0,0,3],tribe:['flush',0,0,2]}
      const b=bonuses[j.id];if(b&&e.contains[b[0]])emit(b[1],b[2],b[3]||1)
      if(j.id==='joker')emit(0,4)
      if(j.id==='half'&&cards.length<=3)emit(0,20)
      if(j.id==='banner')emit(s.discards*30)
      if(j.id==='summit'&&s.discards===3)emit(0,15)
      if(j.id==='misprint')emit(0,Math.floor(random(s)*24))
      if(j.id==='fist'&&held.filter(c=>c.enh!=='stone').length){const c=held.filter(c=>c.enh!=='stone').reduce((a,b)=>a.rank<b.rank?a:b);if(!debuffed(s,c))emit(0,cardChips(c)*2*(1+mime+Number(c.seal==='red')))}
      if(j.id==='blackboard'&&held.length&&held.every(c=>matchesSuit(s,c,0)||matchesSuit(s,c,2)))emit(0,0,3)
      if(j.id==='steel')emit(0,0,1+.2*s.deck.filter(c=>c.enh==='steel').length)
      if(j.id==='abstract')emit(0,s.jokers.length*3)
      if(j.id==='supernova')emit(0,s.played[e.id]+1)
      if(['green','bus','trousers','popcorn','redcard','flash','ceremonial'].includes(j.id))emit(0,j.value)
      if(['runner','square','ice','wee','castle'].includes(j.id))emit(j.value)
      if(['constellation','hologram','ramen','banana','vampire','glass','luckycat','madness','obelisk','campfire','hitroad','canio','yorick'].includes(j.id))emit(0,0,j.value)
      if(j.id==='fortune')emit(0,s.tarotUsed)
      if(j.id==='acrobat'&&s.hands===1)emit(0,0,3)
      if(j.id==='loyalty'&&(j.counter+1)%6===0)emit(0,0,4)
      if(j.id==='stencil')emit(0,0,Math.max(1,slots(s)-s.jokers.length+count(s,'stencil')))
      if(j.id==='bull')emit(Math.max(0,s.money)*2)
      if(j.id==='boot')emit(0,Math.max(0,Math.floor(s.money/5))*2)
      if(j.id==='seeing'&&scoringCards.some(c=>matchesSuit(s,c,2))&&scoringCards.some(c=>[0,1,3].some(suit=>matchesSuit(s,c,suit))))emit(0,0,2)
      if(j.id==='cardsharp'&&s.roundPlayed[e.id])emit(0,0,3)
      if(j.id==='flower'&&[0,1,2,3].every(suit=>scoringCards.some(c=>matchesSuit(s,c,suit)&&!debuffed(s,c))))emit(0,0,3)
      if(j.id==='stone')emit(s.deck.filter(c=>c.enh==='stone').length*25)
      if(j.id==='throwback')emit(0,0,1+.25*s.skips)
      if(j.id==='gros')emit(0,15)
      if(j.id==='blue')emit(s.draw.length*2)
      if(j.id==='erosion')emit(0,Math.max(0,s.initialDeckSize-s.deck.length)*4)
      if(j.id==='swash')emit(0,s.jokers.filter(x=>x.uid!==j.uid).reduce((n,x)=>n+sellValue(x),0))
      if(j.id==='stuntman')emit(250)
      if(j.id==='drivers'&&s.deck.filter(c=>c.enh).length>=16)emit(0,0,3)
      if(j.id==='superposition'&&e.contains.straight&&cards.some(c=>c.rank===14))createTarot(byId(JOKERS,j.id).name,slot.uid)
      if(j.id==='seance'&&e.id==='sf')addConsumable(s,spectral(s))
      if(j.id==='vagabond'&&s.money<=4)createTarot(byId(JOKERS,j.id).name,slot.uid)
      if(j.id==='toDo'&&j.hand===e.id)s.money+=4
      if(j.id==='DNA'&&s.plays===0&&cards.length===1)s.hand.push(addCard(s,cards[0]))
    }
    if(byId(JOKERS,slot.id).rarity===2)for(const {j} of effects)if(j.id==='baseball')add('棒球卡',0,0,1.5,slot.uid)
    if(slot.edition==='poly')add('多彩',0,0,1.5,slot.uid)
  }
  if(owns(s,'observatory'))for(const c of s.consumables)if(c.kind==='planet'&&c.id===e.id)add('天文台',0,0,1.5,c.uid)
  if(s.deckType==='plasma'){chips=mult=(chips+mult)/2;events.push({source:'等离子平衡',chips,mult})}
  return {id:e.id,name:byId(HANDS,e.id).name,chips,mult,total:Math.min(Number.MAX_SAFE_INTEGER,Math.floor(chips*mult)),events,destroy,cards:clone(cards)}
}
export function play(s) {
  assert(s.phase==='play'&&s.hands>0,'当前无法出牌')
  const cards=s.hand.filter(c=>s.selected.includes(c.uid));assert(cards.length>0&&cards.length<=5,'请选择 1～5 张牌')
  assert(!s.forced||cards.some(c=>c.uid===s.forced),'必须打出铃铛指定的牌')
  const e=evaluate(cards,s)
  const blocked=bossActive(s,'psychic')&&cards.length!==5||bossActive(s,'eye')&&s.roundPlayed[e.id]||bossActive(s,'mouth')&&Object.keys(s.roundPlayed).length>0&&!s.roundPlayed[e.id]
  for(const {j} of jokerTriggers(s,'scoring'))if(j.id==='space'&&chance(s,4))s.levels[e.id]++
  if(bossActive(s,'arm'))s.levels[e.id]=Math.max(1,s.levels[e.id]-1)
  if(bossActive(s,'ox')&&e.id===s.oxHand)s.money=0
  if(bossActive(s,'tooth'))s.money=Math.max(-20,s.money-cards.length)
  if(bossActive(s,'heart')&&s.jokers.length){s.jokers.forEach(j=>j.disabled=false);pick(s,s.jokers).disabled=true}
  let result
  if(blocked){s.money+=8*jokerTriggers(s,'scoring').filter(({j})=>j.id==='matador').length;result={id:e.id,name:e.id==='high'?'牌型被限制':byId(HANDS,e.id).name,chips:0,mult:0,total:0,events:[{source:'Boss 限制：本手不计分',chips:0,mult:0}],destroy:[],cards:clone(cards)}}
  else result=scoring(s,cards,e)
  s.hands--;s.plays++;s.totalHands++;s.played[e.id]++;s.roundPlayed[e.id]=(s.roundPlayed[e.id]||0)+1;s.score+=result.total;s.best=Math.max(s.best,result.total)
  s.spent.push(...cards);s.blindPlayed=Array.from(new Set(s.blindPlayed.concat(cards.map(c=>c.uid))));s.hand=s.hand.filter(c=>!cards.some(p=>p.uid===c.uid));s.selected=[];s.forced=null
  s.jokers.forEach(j=>{if(j.id==='ice')j.value-=5;if(j.id==='seltzer')j.value--;if(j.id==='loyalty')j.counter++})
  s.jokers=s.jokers.filter(j=>!(['ice','seltzer'].includes(j.id)&&j.value<=0))
  removeCards(s,result.destroy)
  s.lastResult=result
  // 分数达标只切到结算页（phase='reward'），奖励在玩家点「领取奖励」（cashOut）时才入账，
  // 避免结算动画还没播完，钱、星球牌等奖励就已提前到账。
  if(s.score>=target(s)){s.phase='reward';return result}
  if(s.hands<=0||!s.hand.length&&!s.draw.length){if(has(s,'mrbones')&&s.score>=target(s)*.25){s.jokers.splice(s.jokers.findIndex(j=>j.id==='mrbones'),1);s.phase='reward'}else s.phase='lost';return result}
  if(bossActive(s,'hook')){const discard=shuffle(s,s.hand).slice(0,2);s.spent.push(...discard);s.hand=s.hand.filter(c=>!discard.includes(c))}
  drawCards(s,bossActive(s,'serpent')?3:Math.max(0,handSize(s)-s.hand.length),'play')
  return result
}
export function discard(s) {
  assert(s.phase==='play'&&s.discards>0,'没有剩余弃牌次数')
  const cards=s.hand.filter(c=>s.selected.includes(c.uid));assert(cards.length>0,'请选择要弃掉的牌')
  const e=evaluate(cards,s)
  for(const {j} of jokerTriggers(s,'discard')) {
    if(j.id==='green')j.value=Math.max(0,j.value-1)
    if(j.id==='ramen')j.value=Math.max(1,j.value-.01*cards.length)
    if(j.id==='burnt'&&s.discarded===0)s.levels[e.id]++
    if(j.id==='castle')j.value+=3*cards.filter(c=>matchesSuit(s,c,j.suit)).length
    if(j.id==='mail')s.money+=5*cards.filter(c=>c.rank===j.rank).length
    if(j.id==='faceless'&&cards.filter(c=>face(s,c)).length>=3)s.money+=5
    if(j.id==='hitroad')j.value+=cards.filter(c=>c.rank===11&&c.enh!=='stone').length*.5
    if(j.id==='yorick'){j.counter+=cards.length;while(j.counter>=23){j.value++;j.counter-=23}}
  }
  cards.forEach(c=>{if(c.seal==='purple')addConsumable(s,tarot(s))})
  const destroy=jokerTriggers(s,'discard').some(({j})=>j.id==='trading')&&s.discarded===0&&cards.length===1
  if(destroy)s.money+=3
  s.discards--;s.discarded++;s.hand=s.hand.filter(c=>!cards.includes(c));s.spent.push(...cards);s.selected=[];s.forced=null
  if(destroy)removeCards(s,cards.map(c=>c.uid))
  drawCards(s,bossActive(s,'serpent')?3:Math.max(0,handSize(s)-s.hand.length),'discard')
  if(!s.hand.length&&!s.draw.length)s.phase='lost'
}
export const blindReward = (s,blind=s.blind) => s.stake>=1&&blind===0?0:blind===2&&s.ante%8===0?8:([3,4,5][blind]||0)
// 击败盲注后的奖励预览：纯计算、不改动 state。
// 结算页（phase='reward'）在玩家点「领取奖励」前用它展示即将获得的奖励；
// 真正入账发生在 cashOut → finishBlind，两处共用此函数保证数值一致。
export function previewReward(s) {
  const reward=blindReward(s), hands=s.hands*(s.deckType==='green'?2:1),discardMoney=s.deckType==='green'?s.discards:0
  const interest=s.deckType==='green'?0:Math.min(owns(s,'tree')?20:owns(s,'seed')?10:5,Math.max(0,Math.floor(s.money/5))*(1+count(s,'tomoon')))
  let extra=0,blueSealPlanets=0,planetRoom=Math.max(0,consumableSlots(s)-s.consumables.length)
  const mimeTriggers=jokerTriggers(s,'scoring').filter(({j})=>j.id==='mime').length
  for(const c of s.hand) if(!debuffed(s,c)) {
    const repeat=1+mimeTriggers+Number(c.seal==='red')
    if(c.enh==='gold')extra+=3*repeat
    if(c.seal==='blue')for(let i=0;i<repeat;i++)if(planetRoom-->0)blueSealPlanets++
  }
  const rocketProgressed=new Set()
  for(const {slot,j} of jokerTriggers(s,'roundReward')) {
    if(!s.jokers.includes(slot)||!s.jokers.includes(j)||j.perished)continue
    if(j.id==='golden')extra+=4
    if(j.id==='rocket'){let v=j.value;if(s.blind===2&&!rocketProgressed.has(j.uid)){v+=2;rocketProgressed.add(j.uid)}extra+=v}
    if(j.id==='cloud')extra+=s.deck.filter(c=>c.rank===9&&c.enh!=='stone').length
    if(j.id==='satellite')extra+=s.planets.length
    if(j.id==='delayed'&&s.discarded===0)extra+=s.discards*2
  }
  for(const j of s.jokers) if(j.rental)extra-=3
  const total=reward+hands+interest+extra+discardMoney
  return {reward,hands,interest,extra:extra+discardMoney,total,blueSealPlanets}
}
function finishBlind(s) {
  const r=previewReward(s)
  // 火箭在 Boss 盲注后成长（预览已按成长后数值计入奖励）。
  const rocketProgressed=new Set()
  for(const {slot,j} of jokerTriggers(s,'roundReward')) {
    if(!s.jokers.includes(slot)||!s.jokers.includes(j)||j.perished)continue
    if(j.id==='rocket'&&s.blind===2&&!rocketProgressed.has(j.uid)){j.value+=2;rocketProgressed.add(j.uid)}
  }
  // 蓝蜡封留手生成星球牌（数量已在预览中按槽位上限计算）。
  const mimeTriggers=jokerTriggers(s,'scoring').filter(({j})=>j.id==='mime').length
  for(const c of s.hand) if(!debuffed(s,c)&&c.seal==='blue') {
    const repeat=1+mimeTriggers+Number(c.seal==='red')
    for(let i=0;i<repeat;i++)addConsumable(s,item(s,'planet',s.lastResult.id))
  }
  for(const j of s.jokers) {
    if(j.perished)continue
    if(j.id==='egg')j.value+=3
    if(j.id==='popcorn')j.value-=4
    if(j.id==='turtle')j.value--
    if(j.id==='banana'&&chance(s,1000))j.value=0
    if(j.id==='gros'&&!j.eternal&&chance(s,6)){j.expired=true;s.grosGone=true}
    if(j.id==='invisible')j.value++
    if(j.id==='hitroad'||j.id==='campfire'&&s.blind===2)j.value=1
    if(j.id==='gift')s.jokers.concat(s.consumables).filter(x=>x!==j).forEach(x=>x.sellBonus=(x.sellBonus||0)+1)
    if(j.perishable){j.perishable--;if(j.perishable===0)j.perished=true}
    j.suit=Math.floor(random(s)*4);j.rank=s.deck.length?pick(s,s.deck).rank:14;j.hand=pick(s,HANDS.slice(0,9)).id;j.disabled=false
  }
  s.jokers=s.jokers.filter(j=>!j.expired&&!(['popcorn','turtle','banana'].includes(j.id)&&j.value<=0))
  s.money+=r.total;s.earned+=r.total;s.roundReward=r
  s.antePlayed=Array.from(new Set(s.antePlayed.concat(s.blindPlayed)))
  if(s.blind===2&&s.deckType==='anaglyph')s.tags.push('double')
  // The hand, draw pile, and played cards are returned to the deck between blinds.
  // Clear the table only after rewards and per-card effects have been calculated.
  s.hand=[];s.draw=[];s.spent=[];s.selected=[];s.forced=null
  s.phase='reward'
}
export function cashOut(s) {
  assert(s.phase==='reward','当前不能结算')
  // 奖励在此刻才入账；旧存档在出牌时已入账（roundReward 存在），跳过避免重复领取。
  if(!s.roundReward)finishBlind(s)
  const r=s.roundReward
  // 入账标记随结算完成清除，下一轮盲注的奖励重新累积。
  s.roundReward=null
  if(s.ante===8&&s.blind===2&&!s.endless){s.won=true;s.phase='won';return r}
  openShop(s)
  return r
}
export function continueEndless(s) {assert(s.phase==='won','尚未通关');s.endless=true;openShop(s)}
function cost(s,n) {return Math.max(1,Math.floor(n*(owns(s,'liquidation')?.5:owns(s,'clearance')?.75:1)))}
export const canPay = (s,n) => s.money-n >= (has(s,'credit')?-20:0)
function pay(s,n) {assert(canPay(s,n),'金钱不足');s.money-=n}
export const itemCost = (s,card) => card.free||has(s,'astronomer')&&(card.kind==='planet'||card.kind==='pack'&&boosterPack(card.id).family==='planet')?0:card.rental?1:cost(s,card.kind==='joker'?byId(JOKERS,card.id).cost+(card.edition?2:0):card.kind==='voucher'?10:card.kind==='pack'?boosterPack(card.id).cost:3)
function shopCards(s) {
  const result=[]
  for(let i=0;i<2+Number(owns(s,'overstock'))+Number(owns(s,'plus'));i++) {
    const options=['joker','joker','joker','joker','tarot','planet']
    if(owns(s,'tarotmerchant'))options.push('tarot');if(owns(s,'tarottycoon'))options.push('tarot','tarot');if(owns(s,'planetmerchant'))options.push('planet');if(owns(s,'planettycoon'))options.push('planet','planet')
    if(owns(s,'magictrick'))options.push('card');if(s.deckType==='ghost')options.push('spectral')
    const kind=pick(s,options)
    const card=kind==='joker'?randomJoker(s):kind==='tarot'?tarot(s):kind==='planet'?planet(s):kind==='spectral'?spectral(s):{uid:++s.uid,kind:'card',rank:2+Math.floor(random(s)*13),suit:Math.floor(random(s)*4),enh:owns(s,'illusion')&&random(s)<.4?pick(s,['bonus','mult','wild','glass','steel','gold','lucky']):null,edition:owns(s,'illusion')?edition(s):null,seal:owns(s,'illusion')&&random(s)<.2?pick(s,['red','blue','gold','purple']):null}
    if(card.kind==='card'&&card.edition==='negative')card.edition=null
    if(card.kind==='joker') {
      if(s.stake>=3&&random(s)<.3&&!['ice','popcorn','banana','gros','seltzer','turtle','mrbones','invisible'].includes(card.id))card.eternal=true
      if(s.stake>=6&&!card.eternal&&random(s)<.3)card.perishable=5
      if(s.stake>=7&&random(s)<.3)card.rental=true
    }
    const duplicateNamedCard=showmanRepeatKinds.has(card.kind)&&!has(s,'showman')&&result.some(x=>x.kind===card.kind&&x.id===card.id)
    const duplicatePlayingCard=card.kind==='card'&&result.some(x=>packCardKey(x)===packCardKey(card))
    if(duplicateNamedCard||duplicatePlayingCard){i--;continue}
    result.push(card)
  }
  if(s.tags.includes('rare')){result[0]=randomJoker(s,3);result[0].free=true;s.tags.splice(s.tags.indexOf('rare'),1)}
  if(s.tags.includes('free')){result.forEach(c=>c.free=true);s.tags.splice(s.tags.indexOf('free'),1)}
  return result
}
function openShop(s) {
  s.phase='shop';s.selected=[]
  const pool=VOUCHERS.filter(v=>!owns(s,v.id)&&(!v.requires||owns(s,v.requires)))
  const voucher=pool.length?item(s,'voucher',pick(s,pool).id):null
  s.shop={cards:shopCards(s),packs:[s.round===1?item(s,'pack','joker'):randomBoosterPack(s),randomBoosterPack(s)],voucher,rerolls:0,freeUsed:false}
}
function randomBoosterPack(s) {
  const packs=Object.values(BOOSTER_PACKS),total=packs.reduce((sum,pack)=>sum+pack.weight,0)
  let roll=random(s)*total
  for(const pack of packs){roll-=pack.weight;if(roll<0)return item(s,'pack',pack.id)}
  return item(s,'pack',packs[packs.length-1].id)
}
export const rerollCost = s => has(s,'chaos')&&!s.shop.freeUsed?0:Math.max(1,5-2*Number(owns(s,'reroll'))-2*Number(owns(s,'glut')))+s.shop.rerolls
export function rerollShop(s) {
  assert(s.phase==='shop'&&!s.pack,'请先完成补充包选择')
  const fee=rerollCost(s);pay(s,fee);if(!fee)s.shop.freeUsed=true;else s.shop.rerolls++
  s.jokers.filter(j=>j.id==='flash').forEach(j=>j.value+=2);s.shop.cards=shopCards(s)
}
export function nextBlind(s) {
  assert(s.phase==='shop'&&!s.pack,'请先完成当前商店操作')
  for(const {j} of jokerTriggers(s,'shopExit'))if(j.id==='perkeo'&&s.consumables.length){const c=clone(pick(s,s.consumables));c.uid=++s.uid;c.edition='negative';s.consumables.push(c)}
  if(s.blind<2)s.blind++;else{s.blind=0;s.ante++;s.antePlayed=[];chooseBoss(s)}
  s.phase='select';s.hand=[];s.draw=[];s.spent=[];s.selected=[];s.shop=null
}
export function buy(s,uid) {
  assert(s.phase==='shop'&&!s.pack,'当前不能购买')
  const all=s.shop.cards.concat(s.shop.packs,s.shop.voucher?[s.shop.voucher]:[]), card=all.find(c=>c.uid===uid)
  assert(card,'商品已售出')
  if(card.kind==='joker')assert(s.jokers.length<slots(s)+(card.edition==='negative'?1:0),'小丑槽位已满，请先卖出一张')
  if(['tarot','planet','spectral'].includes(card.kind))assert(s.consumables.length<consumableSlots(s),'消耗牌槽位已满')
  pay(s,itemCost(s,card))
  if(card.kind==='joker')s.jokers.push(card)
  else if(card.kind==='voucher'){s.vouchers.push(card.id);if(['hieroglyph','petroglyph'].includes(card.id))s.ante=Math.max(1,s.ante-1)}
  else if(card.kind==='pack')openPack(s,card.id)
  else if(card.kind==='card')addCard(s,card)
  else s.consumables.push(card)
  s.shop.cards=s.shop.cards.filter(c=>c.uid!==uid);s.shop.packs=s.shop.packs.filter(c=>c.uid!==uid)
  if(s.shop.voucher&&s.shop.voucher.uid===uid)s.shop.voucher=null
}
function openPack(s,id) {
  const def=boosterPack(id),kind=def.family
  for(const {j} of jokerTriggers(s,'packOpen'))if(j.id==='hallucination'&&chance(s,2))addConsumable(s,tarot(s))
  const cards=[],offered=new Set()
  const planetIds=new Set()
  if(kind==='planet'&&owns(s,'telescope')) {
    const mostPlayed=HANDS.reduce((a,b)=>s.played[b.id]>s.played[a.id]?b:a)
    cards.push(item(s,'planet',mostPlayed.id));planetIds.add(mostPlayed.id)
  }
  for(let i=cards.length;i<def.options;i++) {
    const c=distinctPackDraw(s,offered,()=>{
      if(kind==='joker')return randomJoker(s)
      if(kind==='planet')return planet(s,planetIds)
      if(kind==='tarot')return owns(s,'omen')&&random(s)<.2?spectral(s):tarot(s)
      if(kind==='spectral')return random(s)<.006?item(s,'spectral',pick(s,['soul','blackhole'])):spectral(s)
      return {uid:++s.uid,kind:'card',rank:2+Math.floor(random(s)*13),suit:Math.floor(random(s)*4),enh:random(s)<.4?pick(s,['bonus','mult','wild','glass','steel','stone','gold','lucky']):null,edition:edition(s),seal:random(s)<.2?pick(s,['red','blue','gold','purple']):null}
    })
    if(c.edition==='negative'&&c.kind==='card')c.edition=null
    cards.push(c)
  }
  s.pack={id:def.id,kind,size:def.size,cards,choose:def.choose,picksLeft:def.choose,picksMade:0,handBefore:clone(s.hand)}
  if(['tarot','spectral'].includes(kind)){s.hand=shuffle(s,s.deck).slice(0,handSize(s)).map(c=>Object.assign({},c));s.selected=[]}
}
export function choosePack(s,uid) {
  assert(s.pack,'没有打开的补充包')
  const c=s.pack.cards.find(x=>x.uid===uid);assert(c,'请选择包中的卡牌')
  if(c.kind==='joker'){assert(s.jokers.length<slots(s)+(c.edition==='negative'?1:0),'小丑槽位已满');s.jokers.push(c)}
  else if(c.kind==='card')addCard(s,c)
  else useEffect(s,c)
  const picksLeft=s.pack.picksLeft||s.pack.choose||boosterPack(s.pack.id||s.pack.kind).choose||1
  if(picksLeft>1){s.pack.cards=s.pack.cards.filter(x=>x.uid!==c.uid);s.pack.picksLeft=picksLeft-1;s.pack.picksMade=(s.pack.picksMade||0)+1;s.selected=[];return}
  closePack(s,false)
}
export function closePack(s,skip=true) {
  assert(s.pack,'没有打开的补充包')
  if(skip)s.jokers.filter(j=>j.id==='redcard').forEach(j=>j.value+=3)
  s.hand=s.pack.handBefore;s.pack=null;s.selected=[];syncCards(s)
}
export function sell(s,uid) {
  assert(['play','shop','select'].includes(s.phase),'当前不能出售')
  const index=s.jokers.findIndex(j=>j.uid===uid)
  if(index>=0){
    const j=s.jokers[index];assert(!j.eternal,'永恒小丑不能出售');s.money+=sellValue(j);s.jokers.splice(index,1)
    if(j.id==='luchador'&&s.blind===2||bossActive(s,'leaf'))s.disabledBoss=true
    if(j.id==='dietcola')s.tags.push('double')
    if(j.id==='invisible'&&j.value>=2&&s.jokers.length&&s.jokers.length<slots(s)){const c=clone(pick(s,s.jokers));c.uid=++s.uid;if(c.edition==='negative')c.edition=null;s.jokers.push(c)}
  }
  else {const i=s.consumables.findIndex(c=>c.uid===uid);assert(i>=0,'找不到这张牌');s.money+=sellValue(s.consumables[i]);s.consumables.splice(i,1)}
  s.jokers.filter(j=>j.id==='campfire').forEach(j=>j.value+=.25)
}
export function reorder(s,uid,direction) {
  assert(['play','shop','select'].includes(s.phase),'计分时不能调整小丑顺序')
  const i=s.jokers.findIndex(j=>j.uid===uid),n=i+direction
  if(i>=0&&n>=0&&n<s.jokers.length)[s.jokers[i],s.jokers[n]]=[s.jokers[n],s.jokers[i]]
}
export function use(s,uid) {
  assert(['play','shop','select'].includes(s.phase)&&!s.pack,'当前无法使用消耗牌')
  const index=s.consumables.findIndex(c=>c.uid===uid);assert(index>=0,'此牌已使用')
  const c=s.consumables[index]
  // Work on a transaction: failed targeting or capacity checks cannot consume cards or RNG.
  const draft=clone(s);draft.consumables.splice(index,1);useEffect(draft,c);Object.assign(s,draft)
}
function useEffect(s,card) {
  if(card.kind==='planet'){
    s.levels[card.id]++;if(!s.planets.includes(card.id))s.planets.push(card.id)
    s.jokers.filter(j=>j.id==='constellation').forEach(j=>j.value+=.1);s.lastUsed={kind:card.kind,id:card.id};return
  }
  const def=byId(card.kind==='spectral'?SPECTRALS:TAROTS,card.id);assert(def,'未知消耗牌')
  const chosen=s.hand.filter(c=>s.selected.includes(c.uid)), max=def.max
  if(max) {
    assert((s.phase==='play'||s.pack)&&chosen.length>=1&&chosen.length<=max,`请先选择 1～${max} 张手牌`)
    if(card.id==='death')assert(chosen.length===2,'死神需要恰好选择 2 张牌')
  }
  const mutate=(c,fields)=>{Object.assign(c,fields);const permanent=s.deck.find(x=>x.uid===c.uid);if(permanent)Object.assign(permanent,fields)}
  if(card.kind==='spectral') {
    if(['familiar','grim','incantation','sigil','ouija','immolate'].includes(card.id))assert(s.hand.length>0&&(s.phase==='play'||s.pack),'请在盲注内或幻灵包中使用')
    if(['familiar','grim','incantation'].includes(card.id)){
      removeCards(s,[pick(s,s.hand).uid]);const n={familiar:3,grim:2,incantation:4}[card.id]
      for(let i=0;i<n;i++)s.hand.push(addCard(s,{rank:card.id==='grim'?14:card.id==='familiar'?11+Math.floor(random(s)*3):2+Math.floor(random(s)*9),suit:Math.floor(random(s)*4),enh:pick(s,['bonus','mult','wild','glass','steel','gold','lucky']),edition:null,seal:null}))
    }
    if(card.id==='immolate'){assert(s.hand.length>=5,'需要至少 5 张手牌');removeCards(s,shuffle(s,s.hand).slice(0,5).map(c=>c.uid));s.money+=20}
    if(card.id==='sigil'){const suit=Math.floor(random(s)*4);s.hand.forEach(c=>mutate(c,{suit}))}
    if(card.id==='ouija'){const rank=2+Math.floor(random(s)*13);s.hand.forEach(c=>mutate(c,{rank}));s.handDelta--}
    if(['talisman','deja','trance','medium'].includes(card.id))mutate(chosen[0],{seal:{talisman:'gold',deja:'red',trance:'blue',medium:'purple'}[card.id]})
    if(card.id==='aura')mutate(chosen[0],{edition:pick(s,['foil','holo','poly'])})
    if(card.id==='cryptid')for(let i=0;i<2;i++)s.hand.push(addCard(s,chosen[0]))
    if(['wraith','soul'].includes(card.id)){assert(s.jokers.length<slots(s),'小丑槽位已满');s.jokers.push(randomJoker(s,card.id==='soul'?4:3));if(card.id==='wraith')s.money=0}
    if(['ectoplasm','hex','ankh'].includes(card.id)){
      const pool=card.id==='ectoplasm'?s.jokers.filter(j=>!j.edition):s.jokers
      assert(pool.length,'没有符合条件的小丑');const j=pick(s,pool)
      if(card.id==='ectoplasm'){j.edition='negative';s.ectoplasm++;s.handDelta-=s.ectoplasm}
      if(card.id==='hex'){j.edition='poly';s.jokers=s.jokers.filter(x=>x===j||x.eternal)}
      if(card.id==='ankh'){const copied=Object.assign(clone(j),{uid:++s.uid});if(copied.edition==='negative')copied.edition=null;s.jokers=s.jokers.filter(x=>x===j||x.eternal);if(s.jokers.length<slots(s))s.jokers.push(copied)}
    }
    if(card.id==='blackhole')HANDS.forEach(h=>s.levels[h.id]++)
  } else {
    if(typeof def.effect==='string')chosen.forEach(c=>mutate(c,{enh:def.effect}))
    if(typeof def.effect==='number')chosen.forEach(c=>mutate(c,{suit:def.effect}))
    if(card.id==='strength')chosen.forEach(c=>mutate(c,{rank:c.rank===14?2:c.rank+1}))
    if(card.id==='death'){const fields=Object.assign({},chosen[1]);delete fields.uid;delete fields.hidden;mutate(chosen[0],fields)}
    if(card.id==='hanged')removeCards(s,chosen.map(c=>c.uid))
    if(card.id==='hermit')s.money+=Math.min(20,Math.max(0,s.money))
    if(card.id==='temperance')s.money+=Math.min(50,s.jokers.reduce((n,j)=>n+sellValue(j),0))
    if(card.id==='fool'){assert(s.lastUsed,'还未使用过塔罗或星球牌');assert(addConsumable(s,item(s,s.lastUsed.kind,s.lastUsed.id)),'消耗牌槽位已满')}
    if(['priestess','emperor'].includes(card.id)){assert(s.consumables.length<consumableSlots(s),'消耗牌槽位已满');for(let i=0;i<2;i++)addConsumable(s,card.id==='priestess'?planet(s):tarot(s))}
    if(card.id==='judgement'){assert(s.jokers.length<slots(s),'小丑槽位已满');s.jokers.push(randomJoker(s))}
    if(card.id==='wheel'){const pool=s.jokers.filter(j=>!j.edition);assert(pool.length,'需要一张无版本的小丑');if(chance(s,4))pick(s,pool).edition=pick(s,['foil','holo','poly']);else s.notice='命运之轮：这次没有触发'}
    s.tarotUsed++;if(card.id!=='fool')s.lastUsed={kind:card.kind,id:card.id}
  }
  s.selected=[];syncCards(s)
  if(s.forced&&!s.hand.some(c=>c.uid===s.forced))s.forced=null
  if(bossActive(s,'bell')&&!s.forced&&s.hand.length)s.forced=pick(s,s.hand).uid
  if(s.forced)s.selected=[s.forced]
}

export function restore(raw) {
  try {
    const s=typeof raw==='string'?JSON.parse(raw):clone(raw)
    if(!s||s.version!==VERSION||!byId(DECKS,s.deckType)||!['select','play','reward','shop','lost','won'].includes(s.phase))return null
    // Older v3 saves mixed played and discarded cards in antePlayed. Plays during
    // the current blind were not added there yet, so `plays` also detects lost
    // history. Blind-boundary cleanup destroyed the source data; reset this ante
    // and track again from here instead of guessing which cards were played.
    const legacyPillarHistory=s.blindPlayed===undefined
    if(legacyPillarHistory)s.blindPlayed=[]
    if(!Number.isInteger(s.ante)||s.ante<1||s.ante>30||![0,1,2].includes(s.blind)||!byId(BOSSES,s.boss))return null
    if(!Number.isFinite(s.money)||!Number.isFinite(s.score)||!Number.isInteger(s.rng)||!Number.isInteger(s.uid))return null
    if(!['deck','hand','draw','spent','jokers','consumables','vouchers','tags','selected','planets','antePlayed','blindPlayed'].every(k=>Array.isArray(s[k])))return null
    if(legacyPillarHistory){
      const lostPillarHistory=s.antePlayed.length>0||(s.phase==='play'&&s.plays>0)
      if(lostPillarHistory)s.notice='旧版存档无法区分本底注的出牌与弃牌，支柱记录已重置；从现在开始重新累计。'
      s.antePlayed=[]
    }
    if(!s.deck.length||s.deck.length>1000||s.jokers.length>30||s.consumables.length>30)return null
    if(!s.deck.every(c=>Number.isInteger(c.uid)&&Number.isInteger(c.rank)&&c.rank>=2&&c.rank<=14&&[0,1,2,3].includes(c.suit)))return null
    if(!s.jokers.every(j=>byId(JOKERS,j.id)&&Number.isFinite(j.value)))return null
    if(!s.consumables.every(c=>byId(c.kind==='planet'?HANDS:c.kind==='tarot'?TAROTS:c.kind==='spectral'?SPECTRALS:[],c.id)))return null
    if(!HANDS.every(h=>Number.isInteger(s.levels[h.id])&&s.levels[h.id]>=1&&Number.isInteger(s.played[h.id])))return null
    syncCards(s);s.selected=s.selected.filter(id=>s.hand.some(c=>c.uid===id));return s
  }catch(_){return null}
}
