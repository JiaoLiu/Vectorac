import * as defaultCatalog from './catalog.mjs'
import {borrowableSkills,effectiveHero,validIncarnation}from './incarnations.mjs'
import {createCompleteSkills,EXT_OPS} from './complete-skills.mjs'
import {createFoundationSkills,FOUNDATION_OPS} from './foundation-skills.mjs'

export const VERSION = 1
// Each instance closes over its own catalog. Themes never mutate the public
// classic roster, and its saves continue to use the unmodified default engine.
export function createEngine(catalog = defaultCatalog) {
const { CARDS, HEROES, HERO_BY_ID, isRed, makeDeck } = catalog
const clone = value => JSON.parse(JSON.stringify(value))
const equalIDs=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every(id=>b.includes(id))
const slots = ['weapon', 'armor', 'offenseHorse', 'defenseHorse']
const hero = p => effectiveHero(catalog,p)
const hasSkill = (p, skill) => hero(p).skills.includes(skill)
const aliveSeats = s => s.players.filter(p => p.alive).map(p => p.seat)
const player = (s, seat) => s.players[seat]
const name = (s, seat) => seat == null ? '天灾' : hero(player(s, seat)).name
const enqueue = (s, ...events) => s.queue.unshift(...events)
const note = (s, text, cue=null) => { s.logs.unshift({ id: ++s.eventId, text, ...(cue?{cue}:{}) }); s.logs = s.logs.slice(0, 80) }
const autoSkill = skill => catalog.automaticSkills?.includes(skill)
const slashCard = c => c?.type==='sha'||!!CARDS[c?.type]?.attackNature
const slashNature = cards => cards.length===1&&slashCard(cards[0])?CARDS[cards[0].type].attackNature||'normal':'normal'
const slashAs=as=>as==='sha'||!!CARDS[as]?.attackNature
const handLimit=(s,p)=>Math.max(0,p.hp)+(!s.teamMode&&p.role==='lord'&&hasSkill(p,'xueyi')?2*s.players.filter(t=>t.alive&&t.seat!==p.seat&&hero(t).faction==='qun').length:0)
const skillOwner=(p,skill)=>p.incarnation?.activeSkill===skill?p.incarnation.activeHero:p.heroId
const expectedMaxHp=(s,p)=>HERO_BY_ID[p.heroId].hp+(!s.teamMode&&p.role==='lord'?1:0)+(p.persistent?.wuji?1:0)+(p.persistent?.ruoyu?1:0)-(p.persistent?.zhiji?1:0)-(p.persistent?.zaoxian?1:0)-(p.persistent?.hunzi?1:0)-(p.maxHpLoss||0)
const labelSkill = (s,seat,skill,fallback) => catalog.skillName?.(skillOwner(player(s,seat),skill),skill)||fallback
const announceSkill = (s,seat,skill) => note(s,`${name(s,seat)}自动发动${labelSkill(s,seat,skill,catalog.skillNames?.[skill]||skill)}`,{kind:'skill',seat,skill})
const skillAPI={catalog,CARDS,clone,player,hero,hasSkill,aliveSeats,orderFrom,nextAlive,name,enqueue,note,makePending,topCard,draw,heal,spend,ownedCards,distance,attackRange,selectedCards,conversions,beginJudgment,unequip,canConvert,remember,finalDeath,die,playCard,answer,failedResponse,targetsFor}
const baseSkills=createCompleteSkills(skillAPI),F=createFoundationSkills(skillAPI,baseSkills)
const X={...baseSkills,
 prepare:(s,seat)=>F.prepare(s,seat),finish:(s,seat)=>F.endTurn(s,seat).concat(baseSkills.finish(s,seat),F.finish(s,seat)),
 legalSkills:(s,seat)=>baseSkills.legalSkills(s,seat).concat(F.legalSkills(s,seat)),
 activate:(s,a)=>F.skills.has(a.skill)?F.activate(s,a):baseSkills.activate(s,a),
 answer:(s,p,a)=>F.skills.has(p.skill)&&p.stage!=='pindian'?F.answer(s,p,a):baseSkills.answer(s,p,a),
 handle:(s,e)=>{if(FOUNDATION_OPS.has(e.op)||e.op==='pindian-result'&&e.skill==='zhiba')F.handle(s,e);else baseSkills.handle(s,e);if(e.op==='post-damage')enqueue(s,...F.afterDamage(s,e.ctx))},
 judgment:(s,c,j)=>baseSkills.judgment(s,c,j).concat(F.judgment(s,c,j)),
 discarded:(s,seat,cards,reason)=>{baseSkills.discarded(s,seat,cards,reason);F.discarded(s,seat,cards,reason)},
}
function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296 }
function shuffle(s, cards) { const out = cards.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [out[i],out[j]] = [out[j],out[i]] } return out }
function acquireIncarnations(s,seat,count){
 const p=player(s,seat),i=p.incarnation,used=new Set(s.players.filter(p=>p.alive).map(p=>p.heroId).concat(i.pool))
 const added=shuffle(s,HEROES.filter(h=>!used.has(h.id)&&borrowableSkills(catalog,h.id).length)).slice(0,count).map(h=>h.id)
 i.pool.push(...added);if(added.length)note(s,`${name(s,seat)}获得 ${added.length} 张变身牌（共 ${i.pool.length} 张）`)
}
function incarnationOptions(p){return p.incarnation.pool.flatMap(id=>borrowableSkills(catalog,id).map(skill=>({type:'transform',heroId:id,skill})))}
function orderFrom(s, start) { return Array.from({ length: s.players.length }, (_, i) => (start + i) % s.players.length).filter(seat => player(s, seat).alive) }
function nextAlive(s, seat) { return orderFrom(s, (seat + 1) % s.players.length)[0] }
function topCard(s) {
  if (!s.deck.length && s.discard.length) { s.deck = shuffle(s, s.discard); s.discard = []; note(s, '弃牌堆洗回牌堆') }
  return s.deck.shift() || null
}
function draw(s, seat, count, cause=null) {
  if (!player(s, seat).alive) return
  let actual = 0
  for (let i = 0; i < count; i++) { const card = topCard(s); if (!card) break; player(s, seat).hand.push(card); actual++ }
  if (actual) note(s, `${name(s, seat)}摸了 ${actual} 张牌`,catalog.trackBattle&&['card-draw','skill-draw'].includes(cause)?{kind:'draw',target:seat,count:actual,reason:cause,playedId:s.lastPlayed?.id}:null)
}
function heal(s, seat, amount) { const p = player(s, seat),before=p.hp; p.hp = Math.min(p.maxHp, p.hp + amount);const actual=Math.max(0,p.hp-before);note(s, `${name(s, seat)}回复 ${actual} 点体力`,catalog.trackBattle&&actual?{kind:'recover',target:seat,amount:actual}:null);X.handChanged(s,p);if(p.buquPile?.length)enqueue(s,X.event('recover-pile',{seat})) }
function ownedCards(p) { return p.hand.concat(slots.map(slot => p.equip[slot]).filter(Boolean)) }
function handEmptied(s,p){X.handChanged(s,p);if(p.alive&&!p.hand.length&&hasSkill(p,'lianying'))enqueue(s,{type:'equipmentDraw',seat:p.seat,count:1,skill:'lianying'})}
function unequip(s,p,slot){
 const card=p.equip[slot];p.equip[slot]=null
 if(card)F.cardsLost(s,p.seat)
 if(card?.type==='silverlion'&&p.alive&&p.hp>0&&p.hp<p.maxHp)heal(s,p.seat,1)
 if(card&&p.alive&&hasSkill(p,'xiaoji'))enqueue(s,{type:'equipmentDraw',seat:p.seat,count:2,skill:'xiaoji'})
 return card
}
function removeOwned(p, id, s) {
  const index = p.hand.findIndex(c => c.id === id)
  if (index >= 0) {const c=p.hand.splice(index, 1)[0];handEmptied(s,p);return c}
  const slot = slots.find(slot => p.equip[slot]?.id === id)
  if (slot) return unequip(s,p,slot)
  const field=(p.fieldPile||[]).findIndex(c=>c.id===id)
  if(field>=0&&hasSkill(p,'jixi'))return p.fieldPile.splice(field,1)[0]
  throw new Error('请选择自己的牌')
}
function spend(s, seat, ids, processing = false,reason=processing?'use':'discard') {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error('牌不能重复选择')
  const lostOwned=ids.some(id=>ownedCards(player(s,seat)).some(c=>c.id===id))
  const cards = ids.map(id => removeOwned(player(s, seat), id, s))
  if(lostOwned)F.cardsLost(s,seat)
  ;(processing ? s.processing : s.discard).push(...cards)
  if(!processing){X.discarded(s,seat,cards,reason)
    // 公开弃置线索：弃置的牌本就公开（进入弃牌堆），前端据此在牌桌上短暂展示后再收起，
    // 让所有人看清其他玩家丢了什么牌。出牌/判定等非弃置消耗不发。
    if(reason==='discard'&&catalog.trackBattle)note(s,`${name(s,seat)}弃置${cards.length}张牌`,{kind:'discard-cue',seat,cards:cards.map(c=>clone(c))})}
  return cards
}
function finishCards(s, ids,context=null) {
  const collectors=s.players.filter(p=>p.alive&&hasSkill(p,'juxiang')&&p.seat!==context?.source),collector=collectors[0]
  for (const id of ids) { const i = s.processing.findIndex(c => c.id === id); if (i >= 0) s.discard.push(...s.processing.splice(i, 1)) }
  if(collector&&context?.as==='savage'&&!context.virtual)for(const id of ids){const i=s.discard.findIndex(c=>c.id===id&&c.type==='savage');if(i>=0)collector.hand.push(...s.discard.splice(i,1))}
}
function cardColor(cards,p) { return cards.every(c=>p?X.red(p,c):isRed(c)) ? 'red' : cards.every(c => p?!X.red(p,c):!isRed(c)) ? 'black' : 'none' }
function remember(s, cards, label, source, targets, as) { s.lastEvent = { id: s.eventId + 1, cards: clone(cards), label, source, targets: targets.slice(), ...(catalog.trackBattle?{as,turn:s.turns}:{}) }; s.lastPlayed = clone(s.lastEvent); if(catalog.trackBattle) s.exchange = [{ source, cards: clone(cards), as }] }
function suspect(s, source, target, hostile) {
  // 对抗局只有敌友，没有可推断的隐藏身份，怀疑度模型不适用。
  if (s.teamMode) return
  if (source == null || source === target) return
  const lord = s.players.find(p => p.role === 'lord').seat
  if (target === lord) s.suspicion[source] = Math.max(-3, Math.min(3, s.suspicion[source] + (hostile ? 1.6 : -1.5)))
  else if (Math.abs(s.suspicion[target]) > 0.7) s.suspicion[source] = Math.max(-3, Math.min(3, s.suspicion[source] - Math.sign(s.suspicion[target]) * (hostile ? .4 : -.4)))
}
function distance(s, from, to, excluded = []) {
  if (from === to) return 0
  if(player(s,from)?.marks.ignoreDistance?.includes(to))return 1
  const alive = aliveSeats(s), a = alive.indexOf(from), b = alive.indexOf(to)
  if (a < 0 || b < 0) return Infinity
  const usable = (p, slot) => p.equip[slot] && !excluded.includes(p.equip[slot].id)
  return Math.max(1, Math.min(Math.abs(a-b), alive.length-Math.abs(a-b))
    - (usable(player(s, from), 'offenseHorse') ? 1 : 0) - (hasSkill(player(s, from), 'mashu') ? 1 : 0) - (hasSkill(player(s,from),'tuntian')?(player(s,from).fieldPile||[]).filter(c=>!excluded.includes(c.id)).length:0)
    + (usable(player(s, to), 'defenseHorse') ? 1 : 0))
}
function attackRange(s, seat, excluded = []) {
  const w = player(s, seat).equip.weapon
  return w && !excluded.includes(w.id) ? CARDS[w.type].range : 1
}
function unlimited(p, ids = []) { return hasSkill(p, 'paoxiao') || p.equip.weapon?.type === 'crossbow' && !ids.includes(p.equip.weapon.id) }
function canConvert(p, cards, as, s,allowGuhuo=true) {
  if(cards.some(c=>(p.fieldPile||[]).some(f=>f.id===c.id)))return as==='snatch'&&hasSkill(p,'jixi')&&cards.length===1
  if(as==='arrows'&&hasSkill(p,'luanji')&&cards.length===2&&cards.every(c=>p.hand.some(h=>h.id===c.id))&&X.suit(p,cards[0])===X.suit(p,cards[1]))return true
  if(as==='supplyshortage'&&hasSkill(p,'duanliang')&&cards.length===1&&!X.red(p,cards[0])&&['basic','equip'].includes(CARDS[cards[0].type]?.category))return true
  if(cards.length===1&&p.hand.some(c=>c.id===cards[0].id)){
    if(as==='wine'&&hasSkill(p,'jiuchi')&&X.suit(p,cards[0])==='spade')return true
    if(as==='fireattack'&&hasSkill(p,'huoji')&&X.red(p,cards[0]))return true
    if(as==='nullify'&&hasSkill(p,'kanpo')&&!X.red(p,cards[0]))return true
    if(as==='ironchain'&&hasSkill(p,'lianhuan')&&X.suit(p,cards[0])==='club')return true
    if(as==='duel'&&p.marks.shuangxiongColor&&(X.red(p,cards[0])?'red':'black')!==p.marks.shuangxiongColor)return true
  }
  if (cards.length === 1 && p.hand.some(c => c.id === cards[0].id) && cards[0].type === as) return true
  if (cards.length === 1 && as === 'sha' && hasSkill(p,'wusheng') && X.red(p,cards[0])) return true
  if(cards.length===1&&as==='sha'&&p.hand.some(c=>c.id===cards[0].id)&&slashCard(cards[0]))return true
  if(cards.length===1&&as==='dismantle'&&hasSkill(p,'qixi')&&!X.red(p,cards[0]))return true
  if(cards.length===1&&as==='shan'&&hasSkill(p,'qingguo')&&!X.red(p,cards[0])&&p.hand.some(c=>c.id===cards[0].id))return true
  if(cards.length===1&&as==='tao'&&hasSkill(p,'jijiu')&&X.red(p,cards[0])&&s&&s.current!==p.seat)return true
  if(cards.length===1&&as==='indulgence'&&hasSkill(p,'guose')&&cards[0].suit==='diamond')return true
  if (cards.length === 1 && hasSkill(p,'longdan') && p.hand.some(c => c.id === cards[0].id)
    && (as === 'sha' && cards[0].type === 'shan' || as === 'shan' && slashCard(cards[0]))) return true
  return as === 'sha' && cards.length === 2 && p.equip.weapon?.type === 'spear' && cards.every(card => p.hand.some(c => c.id === card.id))||allowGuhuo&&hasSkill(p,'guhuo')&&cards.length===1&&p.hand.some(c=>c.id===cards[0].id)&&X.guhuoTypes().includes(as)
}
function selectedCards(s, seat, ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return []
  const p=player(s,seat),owned = ownedCards(p).concat(hasSkill(p,'jixi')?p.fieldPile||[]:[])
  const cards = ids.map(id => owned.find(c => c.id === id))
  return cards.every(Boolean) ? cards : []
}
function targetCardCount(p) { return ownedCards(p).length + p.judgment.length }
const delayType=(p,c)=>p.virtualJudgments?.[c.id]||c.type
const publicDelay=(p,c)=>({...clone(c),type:delayType(p,c),physicalType:c.type})
function targetsFor(s, seat, as, ids = []) {
  const p = player(s, seat), others = aliveSeats(s).filter(t => t !== seat)
  if (slashAs(as)) return others.filter(t => !(hasSkill(player(s,t),'kongcheng')&&!player(s,t).hand.length)&&(p.marks.tianyiWin||distance(s, seat, t, ids) <= attackRange(s, seat, ids)))
  if(as==='supplyshortage')return others.filter(t=>!player(s,t).judgment.some(c=>delayType(player(s,t),c)===as)&&(hasSkill(p,'qicai')||distance(s,seat,t,ids)<=(hasSkill(p,'duanliang')?2:1)))
  if(as==='fireattack')return aliveSeats(s).filter(t=>player(s,t).hand.length)
  if(as==='ironchain')return aliveSeats(s)
  if (as === 'snatch') return others.filter(t => !hasSkill(player(s,t),'qianxun')&&targetCardCount(player(s,t)) && (hasSkill(p,'qicai') || distance(s,seat,t,ids) <= 1))
  if (as === 'dismantle') return others.filter(t => targetCardCount(player(s,t)))
  if (as === 'duel') return others.filter(t=>!(hasSkill(player(s,t),'kongcheng')&&!player(s,t).hand.length))
  if (as === 'indulgence') return others.filter(t => !hasSkill(player(s,t),'qianxun')&&!player(s,t).judgment.some(c => delayType(player(s,t),c) === as))
  if (as === 'collateral') return others.filter(t => player(s,t).equip.weapon && aliveSeats(s).some(v => v !== t && !(hasSkill(player(s,v),'kongcheng')&&!player(s,v).hand.length)&&distance(s,t,v) <= attackRange(s,t)))
  return []
}
function maxTargets(s, seat, ids) {
  const p = player(s,seat)
  return (p.marks.tianyiWin?1:0)+(p.equip.weapon?.type === 'halberd' && p.hand.length > 0 && p.hand.every(c => ids.includes(c.id)) && ids.every(id => p.hand.some(c => c.id === id)) ? 3 : 1)
}
function combinations(items, min, max = min) {
  const out = []
  const walk = (at, chosen) => { if (chosen.length >= min) out.push(chosen.slice()); if (chosen.length === max) return; for (let i = at; i < items.length; i++) { chosen.push(items[i]); walk(i+1,chosen); chosen.pop() } }
  walk(0,[]); return out
}
function conversions(p, as, s) {
  const out = ownedCards(p).filter(c => canConvert(p,[c],as,s)).map(c => ({ ids: [c.id], as,...(X.needsGuhuo(p,[c],as,s)?{guhuo:true}:{}) }))
  if (as === 'sha' && p.equip.weapon?.type === 'spear') out.push(...combinations(p.hand.map(c => c.id),2).map(ids => ({ids,as})))
  if(as==='arrows'&&hasSkill(p,'luanji'))out.push(...combinations(p.hand,2).filter(cards=>canConvert(p,cards,as,s)).map(cards=>({ids:cards.map(c=>c.id),as})))
  if(as==='snatch'&&hasSkill(p,'jixi'))out.push(...(p.fieldPile||[]).map(c=>({ids:[c.id],as})))
  return out
}
function makePending(s, value) { s.pending = { ...(value.event?.source!=null?{source:value.event.source}:{}), ...(value.event?.target!=null?{target:value.event.target}:{}), ...value, id: ++s.promptId } }
function resumeNormalTurn(s){const seat=s.extraTurnReturn;delete s.extraTurnReturn;if(seat!=null)enqueue(s,{type:'turnStart',seat})}
function supportCandidates(s, seat, as) {
  const p = player(s,seat), skill = as === 'sha' ? 'jijiang' : 'hujia', faction = as === 'sha' ? 'shu' : 'wei'
  // 对抗局没有主公，主公技（求援/护驾）不生效。
  return !s.teamMode && p.role === 'lord' && hasSkill(p,skill) ? orderFrom(s,(seat+1)%s.players.length).filter(other => other !== seat && hero(player(s,other)).faction === faction) : []
}
function responseOptions(s, pending) {
  if(pending.kind==='ext')return X.promptOptions(s,pending)
  if(pending.kind==='shensu'){
    const p=player(s,pending.actor),costs=pending.mode===1?[[]]:ownedCards(p).filter(c=>CARDS[c.type].category==='equip').map(c=>[c.id])
    return [{type:'pass'},...costs.flatMap(ids=>aliveSeats(s).filter(t=>t!==p.seat&&!(hasSkill(player(s,t),'kongcheng')&&!player(s,t).hand.length)).map(target=>({type:'rush',target,ids,mode:pending.mode})))]
  }
  if(pending.kind==='incarnation'){const p=player(s,pending.actor);return [...incarnationOptions(p),...(!pending.required?[{type:'pass'}]:[])]}
  const p = player(s,pending.actor), opts = []
  if(pending.kind==='guanxing')return [{type:'arrange',pool:clone(pending.pool)},{type:'pass'}]
  if(pending.kind==='liuli')return [{type:'pass'},...ownedCards(p).flatMap(c=>aliveSeats(s).filter(t=>t!==p.seat&&t!==pending.event.source&&!(hasSkill(player(s,t),'kongcheng')&&!player(s,t).hand.length)&&distance(s,p.seat,t,[c.id])<=attackRange(s,p.seat,[c.id])).map(target=>({type:'redirect',ids:[c.id],target})))]
  if(pending.kind==='tuxi'){
    const targets=s.players.filter(t=>t.alive&&t.seat!==pending.actor&&t.hand.length).map(t=>t.seat)
    return [{type:'choose',value:'normal',label:'正常摸两张'},...combinations(targets,1,2).map(targets=>({type:'choose',value:targets.join(','),targets,label:'获取'+targets.map(t=>name(s,t)).join('、')+'各一张手牌'}))]
  }
  if(pending.kind==='judge-replace')return (pending.skill==='guidao'?ownedCards(p).filter(c=>!X.red(p,c)):p.hand).map(c=>({type:'respond',ids:[c.id],as:'judgment'})).concat({type:'pass'})
  if(pending.kind==='yiji')return [{type:'choose',value:'keep',label:'保留剩余的牌'},...combinations(pending.ids,1,pending.ids.length).flatMap(ids=>aliveSeats(s).map(target=>({type:'give',ids,target})))]
  if(pending.kind==='reveal')return [{type:'ack'}]
  if (pending.kind === 'response' || pending.kind === 'support' || pending.kind === 'rescue' || pending.kind === 'counter' || pending.kind === 'blade') {
    const as = pending.as
    opts.push(...conversions(p,as,s).filter(c=>pending.event?.type!=='provocation'||!(hasSkill(player(s,pending.target),'kongcheng')&&!player(s,pending.target).hand.length)&&distance(s,pending.actor,pending.target,c.ids)<=attackRange(s,pending.actor,c.ids)).map(c => ({ ...c, type: 'respond' })))
    if(pending.kind==='rescue'&&pending.actor===pending.target&&CARDS.wine)opts.push(...conversions(p,'wine',s).map(a=>({...a,type:'respond'})))
    if (as === 'shan' && (p.equip.armor?.type === 'bagua'||!p.equip.armor&&hasSkill(p,'bazhen')) && !pending.ignoreArmor && !pending.baguaTried) opts.push({ type:'bagua' })
    if (pending.kind === 'response' && !pending.supportTried && supportCandidates(s,pending.actor,as).length) opts.push({ type:'support' })
  } else if (pending.kind === 'discard') {if(p.hand.length>=pending.count)opts.push({ type:'discard', count:pending.count });if(pending.canPass)opts.push({type:'pass'})}
  else if (pending.kind === 'choice') opts.push(...pending.choices.map(choice => ({ type:'choose', value:choice.value, label:choice.label })))
  else if (pending.kind === 'guess') opts.push(...Object.keys({spade:1,heart:1,club:1,diamond:1}).map(value => ({type:'choose',value})))
  else if (pending.kind === 'pick') opts.push(...pending.pool.map(c => ({type:'choose',value:c.id,card:clone(c)})))
  else if (pending.kind === 'take') {
    const target = player(s,pending.target)
    if (catalog.individualHandChoices) opts.push(...target.hand.map((_,index)=>({type:'choose',value:`hand:${index}`,label:`手牌 ${index+1}`,zone:'hand',hidden:true})))
    else if (target.hand.length) opts.push({type:'choose',value:'hand',label:`随机手牌（${target.hand.length} 张）`})
    if(!pending.handOnly)for (const slot of slots) if (target.equip[slot]) opts.push({type:'choose',value:target.equip[slot].id,card:clone(target.equip[slot]),zone:'equipment'})
    if (!pending.equipmentOnly&&!pending.handOnly) opts.push(...target.judgment.map(c=>({type:'choose',value:c.id,card:publicDelay(target,c),zone:'judgment'})))
  } else if (pending.kind === 'axe') {
    opts.push(...combinations(ownedCards(p).filter(c=>c.id !== p.equip.weapon?.id).map(c=>c.id),2).map(ids=>({type:'respond',ids,as:'axe'})))
  }
  if (!['discard','guess','pick','take'].includes(pending.kind)) opts.push({type:'pass'})
  return opts
}
function legalActions(s, seat) {
  if(s.pending?.kind==='ext'&&s.pending.actor===seat)return X.promptOptions(s,s.pending)
  if (s.phase === 'finished' || !player(s,seat)?.alive) return []
  if (s.pending) return s.pending.actor === seat ? responseOptions(s,s.pending) : []
  if (s.phase !== 'play' || s.current !== seat) return []
  const p = player(s,seat), uses = p.hand.filter(c=>!['sha','shan','nullify'].includes(c.type)&&!CARDS[c.type]?.attackNature).map(c=>({ids:[c.id],as:c.type}))
  uses.push(...conversions(p,'sha'))
  if(hasSkill(p,'qixi'))uses.push(...conversions(p,'dismantle').filter(a=>!uses.some(u=>u.as===a.as&&u.ids[0]===a.ids[0])))
  if(hasSkill(p,'guose'))uses.push(...conversions(p,'indulgence').filter(a=>!uses.some(u=>u.as===a.as&&u.ids[0]===a.ids[0])))
  for(const as of ['fireattack','ironchain','duel','arrows','supplyshortage','snatch','wine'])uses.push(...conversions(p,as,s).filter(a=>!uses.some(u=>u.as===a.as&&equalIDs(u.ids,a.ids))))
  if(hasSkill(p,'guhuo'))for(const as of X.guhuoTypes().filter(type=>!['shan','nullify'].includes(type)))uses.push(...conversions(p,as,s).filter(a=>!uses.some(u=>u.as===a.as&&equalIDs(u.ids,a.ids))))
  const actions = []
  for (const use of uses) {
    if (slashAs(use.as) && (p.marks.tianyiLose||p.marks.sha >= 1+(p.marks.tianyiWin?1:0)+(p.marks.huxiao||0) && !unlimited(p,use.ids))) continue
    if (use.as === 'tao' && p.hp >= p.maxHp || use.as === 'lightning' && p.judgment.some(c=>c.type==='lightning')) continue
    if(use.as==='wine'&&p.marks.wineUsed)continue
    if(use.as==='lightning'&&hasSkill(p,'weimu')&&cardColor(selectedCards(s,seat,use.ids),p)==='black')continue
    const targets = targetsFor(s,seat,use.as,use.ids).filter(t=>!(['trick','delay'].includes(CARDS[use.as]?.category)&&hasSkill(player(s,t),'weimu')&&cardColor(selectedCards(s,seat,use.ids),p)==='black'))
    if (slashAs(use.as)||['fireattack','ironchain','duel','snatch','dismantle','indulgence','supplyshortage'].includes(use.as)) {
      if(use.as==='ironchain'&&!use.guhuo)actions.push({type:'play',...use,targets:[]})
      for (const chosen of combinations(targets,1,use.as==='ironchain'?2:slashAs(use.as)?maxTargets(s,seat,use.ids):1)) actions.push({type:'play',...use,targets:chosen})
    } else if (use.as === 'collateral') {
      for (const holder of targets) for (const victim of aliveSeats(s).filter(v=>v !== holder && !(hasSkill(player(s,v),'kongcheng')&&!player(s,v).hand.length)&&distance(s,holder,v)<=attackRange(s,holder))) actions.push({type:'play',...use,targets:[holder,victim]})
    } else actions.push({type:'play',...use,targets:[]})
  }
  for (const skill of ['rende','zhiheng','kurou','fanjian']) if (hasSkill(p,skill) && !(['zhiheng','fanjian'].includes(skill) && p.marks[skill]) && (skill !== 'fanjian' && skill !== 'rende' || p.hand.length)) actions.push({type:'skill',skill})
  if(hasSkill(p,'jieyin')&&!p.marks.jieyin&&p.hand.length>=2&&s.players.some(t=>t.alive&&t.seat!==seat&&hero(t).sex==='male'&&t.hp<t.maxHp))actions.push({type:'skill',skill:'jieyin'})
  if(hasSkill(p,'qingnang')&&!p.marks.qingnang&&p.hand.length&&s.players.some(t=>t.alive&&t.hp<t.maxHp))actions.push({type:'skill',skill:'qingnang'})
  if(hasSkill(p,'lijian')&&!p.marks.lijian&&ownedCards(p).length&&s.players.filter(t=>t.alive&&t.seat!==seat&&hero(t).sex==='male').length>=2)actions.push({type:'skill',skill:'lijian'})
  if(hasSkill(p,'qiangxi')&&!p.marks.qiangxi)for(const ids of [[],...ownedCards(p).filter(c=>CARDS[c.type].slot==='weapon').map(c=>[c.id])])for(const target of aliveSeats(s).filter(t=>t!==seat&&distance(s,seat,t,ids)<=attackRange(s,seat,ids)))actions.push({type:'skill',skill:'qiangxi',ids,target})
  if (supportCandidates(s,seat,'sha').length && (p.marks.sha<1 || unlimited(p))) for (const target of targetsFor(s,seat,'sha')) actions.push({type:'skill',skill:'jijiang',target})
  actions.push(...X.legalSkills(s,seat))
  actions.push({type:'end'}); return actions
}

function createGame({ heroId = HEROES[0].id, role = 'random', seed = Date.now() >>> 0 } = {}) {
  if (!HERO_BY_ID[heroId]) throw new Error('未知武将')
  const s = {seed:seed>>>0}
  const roles = ['lord','loyal','rebel','rebel','renegade']
  const mine = role === 'random' ? roles[Math.floor(random(s)*roles.length)] : role
  if (!roles.includes(mine)) throw new Error('未知身份')
  roles.splice(roles.indexOf(mine),1)
  const assigned = [mine,...shuffle(s,roles)], others = shuffle(s,HEROES.filter(h=>h.id!==heroId)).slice(0,4)
  const heroes = [HERO_BY_ID[heroId],...others]
  return createAssignedGame({roles:assigned,heroIds:heroes.map(h=>h.id),seed:s.seed})
}
// The ready-room performs identity assignment and draft first. Initial dealing
// must preserve those choices, not randomize them a second time.
function createAssignedGame({roles,heroIds,seed=Date.now()>>>0,label='五人身份局',sides=null,firstSeat=null}) {
  const ROLE_SET=['lord','loyal','rebel','renegade']
  const teamMode=Array.isArray(sides)
  // 对抗局（1v1/2v2/3v3）只有敌友两队：roles 退化为阵营标记（side0=lord、side1=rebel），
  // 不做身份局校验；身份局仍按原规则校验。
  if(teamMode){
    if(sides.length!==heroIds.length||sides.length<2||sides.length>8||sides.some(x=>x!==0&&x!==1)||!sides.includes(0)||!sides.includes(1))throw new Error('对抗局阵营配置无效')
  }else if(!Array.isArray(roles)||roles.length<2||roles.length>8||roles.some(r=>!ROLE_SET.includes(r))||roles.filter(r=>r==='lord').length!==1||!roles.includes('rebel')||roles.filter(r=>r==='renegade').length>1)throw new Error('身份配置无效')
  if(!Array.isArray(heroIds)||heroIds.length!==(teamMode?sides.length:roles.length)||new Set(heroIds).size!==heroIds.length||heroIds.some(id=>!HERO_BY_ID[id]))throw new Error('武将配置无效或重复')
  const assigned=teamMode?sides.map(x=>x===0?'lord':'rebel'):roles.slice(),heroes=heroIds.map(id=>HERO_BY_ID[id])
  const s = { version:VERSION, seed:seed>>>0, revision:0, phase:'resolve', current:0, turns:0, players:[], deck:[], discard:[], processing:[], harvestPool:[], queue:[], pending:null, logs:[], eventId:0, promptId:0, suspicion:Array(heroIds.length).fill(0), winner:null, lastEvent:null }
  if(catalog.deckVersion)s.deckVersion=catalog.deckVersion
  if(teamMode){s.teamMode=true;s.sides=sides.slice()}
  const lordBonus=seat=>!teamMode&&assigned[seat]==='lord'
  s.players = heroes.map((h,seat)=>({seat,heroId:h.id,role:assigned[seat],hp:h.hp+(lordBonus(seat)?1:0),maxHp:h.hp+(lordBonus(seat)?1:0),alive:true,hand:[],equip:Object.fromEntries(slots.map(slot=>[slot,null])),judgment:[],marks:{sha:0}}))
  for(const p of s.players)if(hasSkill(p,'huashen'))p.incarnation={pool:[],activeHero:null,activeSkill:null}
  s.deck = shuffle(s,makeDeck()); s.players.forEach(p=>draw(s,p.seat,4))
  // 对抗局先手由开局掷骰决定（firstSeat）；身份局仍由主公先手。
  s.current = Number.isInteger(firstSeat)?firstSeat:assigned.indexOf('lord')
  if(!s.players[s.current]||!s.players[s.current].alive)s.current=0
  note(s, teamMode?`${name(s,s.current)}骰点最高，${label}开始`:`${name(s,s.current)}担任主公，${label}开始`)
  // 化身：开局先给所有化身角色发两张变身牌（日志只记数量，牌面仅本人可见）。
  // 先手玩家不另外问一次开局形态——紧接着的回合开始询问会一次问完（此时还没有形态，必选），
  // 否则开局选完窗口还没关就又弹同一个窗口，用户得连点两次。
  const huashen=s.players.filter(p=>hasSkill(p,'huashen'))
  for(const p of huashen)acquireIncarnations(s,p.seat,2)
  s.queue.push(...huashen.filter(p=>p.seat!==s.current).map(p=>({type:'incarnationOffer',seat:p.seat,reason:'initial'})),{type:'turnStart',seat:s.current}); settle(s); return s
}
function winCheck(s) {
  const alive = s.players.filter(p=>p.alive)
  if(s.teamMode){
    // 对抗局：一方全部阵亡即败。winner 记为胜方阵营下标（'0'/'1' 的字符串），
    // 与身份局 winner 用 role 名保持同一字段但取值空间不同。
    const sideAlive=side=>s.players.some(p=>p.alive&&s.sides[p.seat]===side)
    if(!sideAlive(0))s.winner='1'
    else if(!sideAlive(1))s.winner='0'
    if(s.winner!=null){
      s.discard.push(...s.harvestPool.splice(0)); finishCards(s,s.processing.map(c=>c.id))
      s.phase='finished'; s.pending=null; s.queue=[]; note(s,'战局结束，胜负已分'); return true
    }
    return false
  }
  const lord = s.players.find(p=>p.role==='lord')
  if (!lord.alive) s.winner = alive.length===1 && alive[0].role==='renegade' ? 'renegade' : 'rebel'
  else if (!alive.some(p=>p.role==='rebel'||p.role==='renegade')) s.winner='lord'
  if (s.winner) {
    s.discard.push(...s.harvestPool.splice(0)); finishCards(s,s.processing.map(c=>c.id))
    s.phase='finished'; s.pending=null; s.queue=[]; note(s,'战局结束，身份揭晓'); return true
  }
  return false
}
function die(s, seat, source) {if(X.death(s,seat,source))return;finalDeath(s,seat,source)}
function finalDeath(s, seat, source) {
  const p = player(s,seat); p.alive=false
  const hand=p.hand.splice(0)
  s.discard.push(...hand,...p.judgment.splice(0));p.virtualJudgments={}
  s.discard.push(...(p.buquPile||[]),...(p.fieldPile||[]));p.buquPile=[];p.fieldPile=[]
  for (const slot of slots) if (p.equip[slot]) {s.discard.push(p.equip[slot]);p.equip[slot]=null}
  note(s, s.teamMode?`${name(s,seat)}阵亡（${s.sides[seat]===0?'友方':'敌方'}）`:`${name(s,seat)}阵亡，身份为${{lord:'主公',loyal:'忠臣',rebel:'反贼',renegade:'内奸'}[p.role]}`)
  // 阵亡后所有手牌一并弃置是公开信息：把死者的手牌摆到牌桌中间，让所有人看清他手里还有什么。
  if(catalog.trackBattle&&hand.length)note(s,`${name(s,seat)}阵亡，弃置所有手牌`,{kind:'discard-cue',seat,cards:hand.map(c=>clone(c))})
  if (winCheck(s)) return
  // 阵营局没有反贼赏功与主公误杀忠臣的规则。
  if (!s.teamMode && source!=null && player(s,source).alive) {
    if (p.role==='rebel') draw(s,source,3)
    if (p.role==='loyal' && player(s,source).role==='lord') {
      const killer=player(s,source); s.discard.push(...killer.hand.splice(0))
      for(const slot of slots) if(killer.equip[slot])s.discard.push(unequip(s,killer,slot))
      note(s,'主公误杀忠臣，弃置所有手牌与装备')
    }
  }
}
function openRescue(s, context) {
  const p=player(s,context.target)
  if(!p.alive||p.hp>0)return
  if(X.rescue(s,context))return
  const order=context.order||orderFrom(s,s.current)
  const cursor=context.cursor||0
  for(let i=cursor;i<order.length;i++) if(player(s,order[i]).alive && (!player(s,s.current).alive||!hasSkill(player(s,s.current),'wansha')||order[i]===s.current||order[i]===context.target) && (conversions(player(s,order[i]),'tao',s).length||order[i]===context.target&&conversions(player(s,order[i]),'wine',s).length)) {
    makePending(s,{...context,kind:'rescue',actor:order[i],as:'tao',target:context.target,source:context.source,order,cursor:i});return
  }
  die(s,context.target,context.source)
}
function counter(s, chain) {
  const living=aliveSeats(s)
  if (chain.passes>=living.length) {
    if(!chain.negated) enqueue(s,catalog.trackBattle&&chain.cardType==='draw'?{...chain.effect,cause:'card-draw'}:chain.effect)
    else {note(s,`${CARDS[chain.cardType].name}对${name(s,chain.target)}的效果被抵消`);if(chain.cancel)enqueue(s,chain.cancel)}
    return
  }
  const seat=nextAlive(s,chain.cursor)
  chain.cursor=seat
  if(!conversions(player(s,seat),'nullify').length) {chain.passes++;enqueue(s,{type:'counter',chain});return}
  makePending(s,{kind:'counter',actor:seat,as:'nullify',target:chain.target,source:chain.source,chain})
}
function gate(s, effect, cardType, source, target, cancel=null) { enqueue(s,{type:'counter',chain:{effect,cardType,source,target,cancel,cursor:(s.current+s.players.length-1)%s.players.length,passes:0,negated:false}}) }
function takeCard(s, pending, choice) {
  const target=player(s,pending.target)
  const wasJudgment=target.judgment.some(c=>c.id===choice)
  let card
  if(choice==='hand') { if(!target.hand.length)throw new Error('对方已没有手牌');card=target.hand.splice(Math.floor(random(s)*target.hand.length),1)[0] }
  else if(catalog.individualHandChoices&&/^hand:\d+$/.test(choice)) {
    const index=Number(choice.slice(5));if(index>=target.hand.length)throw new Error('这张暗手牌已不可选')
    card=target.hand.splice(index,1)[0]
  }
  else if(target.judgment.some(c=>c.id===choice) && !pending.equipmentOnly) {card=target.judgment.splice(target.judgment.findIndex(c=>c.id===choice),1)[0];if(target.virtualJudgments)delete target.virtualJudgments[card.id]}
  else card=removeOwned(target,choice,s)
  if(choice==='hand'||choice.startsWith('hand:'))handEmptied(s,target)
  if(!wasJudgment)F.cardsLost(s,target.seat)
  if(pending.mode==='snatch')player(s,pending.actor).hand.push(card);else s.discard.push(card)
  if(pending.mode!=='snatch')X.discarded(s,pending.target,[card])
  // 拆牌公开线索：被拆掉的牌本就公开（进入弃牌堆），前端据此在牌桌上短暂展示后再收起。
  // 偷牌（snatch）取走的是暗手牌，不公开，因此不发线索。
  if(pending.mode==='dismantle'&&catalog.trackBattle)note(s,`${name(s,pending.actor)}拆掉了${name(s,pending.target)}的一张牌`,{kind:'discard-cue',seat:pending.target,by:pending.actor,cards:[clone(card)]})
  if(pending.publicTaken)note(s,'公开取牌',{kind:'public-transfer',source:pending.target,target:pending.actor,card:clone(card)})
  if(pending.continuation)enqueue(s,{...pending.continuation,card:clone(card),owner:pending.target,recipient:pending.actor})
  note(s,`${name(s,pending.actor)}${pending.mode==='snatch'?'获得':'弃置'}了${name(s,pending.target)}的${(choice==='hand'||choice.startsWith('hand:'))&&pending.mode==='snatch'?'一张手牌':CARDS[card.type].name}`)
  if(pending.repeat>1 && ownedCards(target).length) enqueue(s,{type:'take',...pending,repeat:pending.repeat-1})
}
function attacking(s, event) {
  if(!player(s,event.target).alive||!player(s,event.source).alive)return
  if(catalog.trackBattle&&!event.announced){
    note(s,`${name(s,event.source)}向${name(s,event.target)}出杀`,{kind:'attack',source:event.source,target:event.target,commandedBy:event.commandedBy})
    event.announced=true
  }
  const attacker=player(s,event.source), defender=player(s,event.target)
  if(!event.qiuyuanChecked&&hasSkill(defender,'qiuyuan')){const targets=aliveSeats(s).filter(t=>t!==event.source&&t!==event.target&&player(s,t).hand.length);if(targets.length){X.spec(s,'qiuyuan',event.target,'helper',{min:0,max:0,targets},{ctx:event});return}event.qiuyuanChecked=true}
  if(!event.liegongChecked){
    event.liegongChecked=true
    if(hasSkill(attacker,'liegong')&&s.current===event.source&&s.phase==='play'&&(defender.hand.length>=attacker.hp||defender.hand.length<=attackRange(s,event.source))){
      if(autoSkill('liegong')){announceSkill(s,event.source,'liegong');event.unavoidable=true}
      else {makePending(s,{kind:'choice',actor:event.source,target:event.target,skill:'liegong',event,choices:[{value:'yes',label:'烈弓：令目标不能闪'},{value:'no',label:'允许正常响应'}]});return}
    }
  }
  if(!event.redirectChecked){
    event.redirectChecked=true
    if(hasSkill(defender,'liuli')&&responseOptions(s,{kind:'liuli',actor:event.target,event}).some(a=>a.type==='redirect')){makePending(s,{kind:'liuli',actor:event.target,source:event.source,target:event.target,skill:'liuli',event});return}
  }
  if(F.attack(s,event))return
  if(!event.fanChecked&&attacker.equip.weapon?.type==='fan'&&(event.nature||'normal')==='normal'){
    makePending(s,{kind:'choice',actor:event.source,skill:'fan',event,choices:[{value:'yes',label:'五火七禽扇：转为炎杀'},{value:'no',label:'保持普通杀'}]});return
  }
  if(!event.prepared && attacker.equip.weapon?.type==='dualsword' && hero(attacker).sex!==hero(defender).sex) {
    makePending(s,{kind:'choice',actor:event.source,skill:'dualsword',event,choices:[{value:'yes',label:'发动双股剑'},{value:'no',label:'直接出杀'}]});return
  }
  if(!event.ironChecked && hasSkill(attacker,'tieji')) {
    if(autoSkill('tieji')){announceSkill(s,event.source,'tieji');choice(s,{actor:event.source,skill:'tieji',event,choices:[{value:'yes'}]},'yes');return}
    makePending(s,{kind:'choice',actor:event.source,skill:'tieji',event,choices:[{value:'yes',label:'发动铁骑'},{value:'no',label:'不发动'}]});return
  }
  // Target-declaration triggers happen before an armor effect stops this Slash.
  if(!event.ignoreArmor && defender.equip.armor?.type==='renwang' && event.color==='black') {note(s,`${name(s,event.target)}的仁王盾挡下黑色杀`,catalog.trackBattle?{kind:'blocked',source:event.source,target:event.target}:null);return}
  if(!event.ignoreArmor&&defender.equip.armor?.type==='vine'&&(event.nature||'normal')==='normal'){note(s,`${name(s,event.target)}的${CARDS.vine.name}挡下普通杀`,catalog.trackBattle?{kind:'blocked',source:event.source,target:event.target}:null);return}
  if(event.unavoidable) {enqueue(s,{...event,type:'attackDamage'});return}
  makePending(s,{kind:'response',actor:event.target,as:'shan',source:event.source,target:event.target,remaining:hasSkill(attacker,'wushuang')||hasSkill(attacker,'roulin')&&hero(defender).sex==='female'||hasSkill(defender,'roulin')&&hero(attacker).sex==='female'?2:1,event,ignoreArmor:event.ignoreArmor,baguaTried:false})
}
function attackDamage(s,event) {
  if(!player(s,event.target).alive)return
  const attacker=player(s,event.source), defender=player(s,event.target), weapon=attacker.equip.weapon?.type
  if(!event.iceChecked && weapon==='ice' && ownedCards(defender).length) {
    makePending(s,{kind:'choice',actor:event.source,skill:'ice',event,choices:[{value:'yes',label:'寒冰剑：弃敌两张牌'},{value:'no',label:'造成伤害'}]});return
  }
  if(!event.bowChecked && weapon==='bow' && (defender.equip.offenseHorse||defender.equip.defenseHorse)) {
    makePending(s,{kind:'choice',actor:event.source,skill:'bow',event,choices:[...['offenseHorse','defenseHorse'].filter(slot=>defender.equip[slot]).map(slot=>({value:slot,label:'弃置'+CARDS[defender.equip[slot].type].name})),{value:'no',label:'保留坐骑'}]});return
  }
  enqueue(s,{type:'damage',source:event.source,target:event.target,amount:1+(attacker.marks.naked&&s.current===event.source?1:0)+(event.wine||0)+(weapon==='guding'&&!defender.hand.length?1:0),nature:event.nature||'normal',ignoreArmor:event.ignoreArmor,cardIds:event.cardIds,slash:true})
}
function dodgeComplete(s,event) {
  note(s,`${name(s,event.target)}闪过了杀`,catalog.trackBattle?{kind:'dodge',source:event.source,target:event.target}:null)
  if(hasSkill(player(s,event.source),'huxiao')&&s.current===event.source&&s.phase==='play')player(s,event.source).marks.huxiao=(player(s,event.source).marks.huxiao||0)+1
  if(player(s,event.source).alive&&hasSkill(player(s,event.source),'mengjin')&&ownedCards(player(s,event.target)).length){makePending(s,{kind:'choice',actor:event.source,target:event.target,skill:'mengjin',event,choices:[{value:'yes',label:'猛进：弃置目标一张牌'},{value:'no',label:'不发动'}]});return}
  dodgeWeapons(s,event)
}
function dodgeWeapons(s,event) {
  if(!player(s,event.source).alive||!player(s,event.target).alive)return
  const weapon=player(s,event.source).equip.weapon?.type
  if(weapon==='axe')makePending(s,{kind:'axe',actor:event.source,as:'axe',source:event.source,target:event.target,event})
  else if(weapon==='blade' && conversions(player(s,event.source),'sha').length && !(hasSkill(player(s,event.target),'kongcheng')&&!player(s,event.target).hand.length) && distance(s,event.source,event.target)<=attackRange(s,event.source))makePending(s,{kind:'blade',actor:event.source,as:'sha',source:event.source,target:event.target,event})
}
function delayed(s,event) {
  const p=player(s,event.target), card=p.judgment.find(c=>c.id===event.cardId)
  if(!p.alive||!card)return
  gate(s,{type:'judgeResult',target:event.target,cardId:card.id},delayType(p,card),event.target,event.target,{type:'delayCancelled',target:event.target,cardId:card.id})
}
function passLightning(s,seat,card) {
  const next=nextAlive(s,seat)
  if(next!=null && next!==seat && !player(s,next).judgment.some(c=>c.type==='lightning')) {player(s,next).judgment.push(card);note(s,`闪电流向${name(s,next)}`)}
  else s.discard.push(card)
}
function applyJudgment(s,target,card,judge,type=card.type){
  const p=player(s,target)
  if(type==='indulgence'){s.discard.push(card);if(judge.suit!=='heart')p.marks.skipPlay=true}
  else if(type==='supplyshortage'){s.discard.push(card);if(judge.suit!=='club')p.marks.skipDraw=true}
  else if(judge.suit==='spade'&&judge.rank>=2&&judge.rank<=9){s.discard.push(card);enqueue(s,{type:'damage',source:null,target,amount:3,nature:'thunder',cardIds:[card.id]})}
  else passLightning(s,target,card)
}
function beginJudgment(s,ctx){
 const judge=topCard(s)
 if(!judge){note(s,'没有可用判定牌');applyFinalJudgment(s,{...ctx,judge:null});return}
 s.processing.push(judge);enqueue(s,{type:'judgmentScan',ctx:{...ctx,judgeId:judge.id},cursor:0})
}
function beginYiji(s,seat,amount=1){
 const pool=[]
 // 按伤害点数批量摸牌：每点两张，进分配池（processing），不进手牌——翻出来本人可见，分完或收起才归手。
 for(let i=0;i<2*Math.max(1,amount);i++){const c=topCard(s);if(!c)break;pool.push(c)}
 if(pool.length){s.processing.push(...pool);note(s,`${name(s,seat)}发动${labelSkill(s,seat,'yiji','遗计')}摸出${pool.length}张牌分配`,{kind:'skill',seat,skill:'yiji'});makePending(s,{kind:'yiji',actor:seat,ids:pool.map(c=>c.id),pool,count:pool.length})}
}
function judgmentScan(s,event){
 const order=orderFrom(s,s.current)
 for(let i=event.cursor;i<order.length;i++){
  const p=player(s,order[i])
  if(p.seat===event.ctx.owner&&hasSkill(p,'zhenlie')&&!event.ctx.zhenlieTried){event.ctx.zhenlieTried=true;X.ask(s,'zhenlie',p.seat,'zhenlie',{ctx:{...event,cursor:i}});return}
  if(hasSkill(p,'guicai')&&p.hand.length){makePending(s,{kind:'judge-replace',actor:p.seat,target:event.ctx.owner,skill:'guicai',card:clone(s.processing.find(c=>c.id===event.ctx.judgeId)),event:{...event,cursor:i+1}});return}
  if(hasSkill(p,'guidao')&&ownedCards(p).some(c=>!X.red(p,c))){makePending(s,{kind:'judge-replace',actor:p.seat,target:event.ctx.owner,skill:'guidao',card:clone(s.processing.find(c=>c.id===event.ctx.judgeId)),event:{...event,cursor:i+1}});return}
 }
 const ctx=event.ctx,judge=s.processing.find(c=>c.id===ctx.judgeId);if(!judge)throw new Error('判定牌丢失')
 const effective={...judge,suit:X.suit(player(s,ctx.owner),judge)},hit=ctx.kind==='baonue'?effective.suit==='spade':ctx.kind==='tuntian'?effective.suit!=='heart':ctx.kind==='shuangxiong'||ctx.kind==='beige'?true:ctx.kind==='leiji'?effective.suit==='spade':ctx.kind==='supplyshortage'?effective.suit!=='club':ctx.kind==='miji'?!isRed(effective):ctx.kind==='indulgence'?effective.suit!=='heart':ctx.kind==='lightning'?effective.suit==='spade'&&judge.rank>=2&&judge.rank<=9:ctx.kind==='luoshen'?!isRed(effective):ctx.kind==='ganglie'?effective.suit!=='heart':isRed(effective)
 const label=CARDS[ctx.kind]?.name||labelSkill(s,ctx.source??ctx.owner,ctx.kind,ctx.kind)
 note(s,`${name(s,ctx.owner)}判定${label}：${{spade:'♠',heart:'♥',club:'♣',diamond:'♦'}[judge.suit]}${judge.rank}`)
 if(catalog.animatedJudgments)makePending(s,{kind:'reveal',actor:ctx.owner,target:ctx.owner,card:clone(judge),effectiveSuit:effective.suit,delayType:ctx.kind,label,hit,event:{type:'judgmentComplete',ctx}})
 else enqueue(s,{type:'judgmentComplete',ctx})
}
function judgmentComplete(s,ctx,keep){
 const i=s.processing.findIndex(c=>c.id===ctx.judgeId);if(i<0)throw new Error('最终判定牌丢失')
 const judge=s.processing[i],p=player(s,ctx.owner)
 if(keep==null&&p.alive&&hasSkill(p,'tiandu')){
  if(autoSkill('tiandu')){announceSkill(s,p.seat,'tiandu');keep=true}
  else {makePending(s,{kind:'choice',actor:p.seat,skill:'tiandu',event:{type:'judgmentComplete',ctx},choices:[{value:'yes',label:'天妒：获得最终判定牌'},{value:'no',label:'不获得'}]});return}
 }
 s.processing.splice(i,1)
 if(!F.onJudgeCard(s,ctx,judge)){if(p.alive&&(keep||ctx.kind==='shuangxiong'||ctx.kind==='luoshen'&&!X.red(p,judge))){p.hand.push(judge);if(catalog.trackBattle)note(s,`${name(s,ctx.owner)}获得公开判定牌`,{kind:'judgment-keep',target:ctx.owner,card:clone(judge)})}else {s.discard.push(judge);X.discarded(s,ctx.owner,[judge],'judge')}}
 applyFinalJudgment(s,{...ctx,judge:clone(judge)})
  enqueue(s,...X.judgment(s,ctx,judge))
}
function applyFinalJudgment(s,ctx){
 const p=player(s,ctx.owner),judge=ctx.judge?{...ctx.judge,suit:X.suit(p,ctx.judge)}:null
 if(ctx.kind==='indulgence'||ctx.kind==='lightning'||ctx.kind==='supplyshortage'){
  const i=s.processing.findIndex(c=>c.id===ctx.delayId);if(i<0)return
  const [delay]=s.processing.splice(i,1)
  if(judge)applyJudgment(s,ctx.owner,delay,judge,ctx.kind);else s.discard.push(delay)
 }else if(ctx.kind==='bagua'){
  if(judge&&isRed(judge))successfulResponse(s,ctx.response);else makePending(s,ctx.response)
 }else if(ctx.kind==='tieji'){
  ctx.attack.ironChecked=true;ctx.attack.unavoidable=!!judge&&isRed(judge);enqueue(s,ctx.attack)
 }else if(ctx.kind==='luoshen'){
  if(judge&&!isRed(judge)&&p.alive)enqueue(s,{type:'luoshenAsk',seat:ctx.owner})
 }else if(ctx.kind==='ganglie'&&judge&&judge.suit!=='heart'&&player(s,ctx.source)?.alive){
  const source=player(s,ctx.source)
  if(source.hand.length>=2)makePending(s,{kind:'discard',actor:ctx.source,target:ctx.source,source:ctx.owner,skill:'ganglie',mode:'ganglie',count:2,canPass:true})
  else enqueue(s,{type:'damage',source:ctx.owner,target:ctx.source,amount:1,cardIds:[]})
 }
}
function settleEvent(s,event) {
  if(event.type==='ext'){X.handle(s,event);return}
  switch(event.type) {
    case 'turnStart': {
      const p=player(s,event.seat);s.turnIsExtra=!!event.extra;if(!p.alive){if(event.extra)resumeNormalTurn(s);else enqueue(s,{type:'turnEnd',seat:event.seat});break}
      s.current=event.seat;s.turns++;s.phase='resolve';p.marks={sha:0,rende:0};note(s,`第 ${s.turns} 回合 · ${name(s,event.seat)}`)
      if(p.faceDown){p.faceDown=false;note(s,`${name(s,event.seat)}翻回正面，跳过本回合`);if(s.turnIsExtra)resumeNormalTurn(s);else enqueue(s,{type:'turnStart',seat:nextAlive(s,event.seat)});break}
      enqueue(s,...(hasSkill(p,'huashen')?[{type:'incarnationOffer',seat:event.seat,reason:'start'}]:[]),{type:'turnPrepare',seat:event.seat});break
    }
    case 'turnPrepare':{const p=player(s,event.seat);if(!p.alive){enqueue(s,{type:'turnEnd',seat:event.seat});break}enqueue(s,...X.prepare(s,event.seat),{type:'turnPrepared',seat:event.seat});break}
    case 'turnPrepared':{const p=player(s,event.seat);if(!p.alive){enqueue(s,{type:'turnEnd',seat:event.seat});break}enqueue(s,...baseSkills.prepare(s,event.seat),...(hasSkill(p,'guanxing')?[{type:'guanxingStart',seat:event.seat}]:[]),...(hasSkill(p,'luoshen')?[{type:'luoshenAsk',seat:event.seat}]:[]),{type:'judgeDrawStart',seat:event.seat});break}
    case 'judgeDrawStart':{const p=player(s,event.seat);if(!p.alive){enqueue(s,{type:'turnEnd',seat:event.seat});break;}if(!event.checked&&hasSkill(p,'shensu')){const pending={kind:'shensu',actor:event.seat,skill:'shensu',mode:1,event:{...event,checked:true}};if(responseOptions(s,pending).some(a=>a.type==='rush')){makePending(s,pending);break}}enqueue(s,...(p.marks.skipJudgeDraw?[]:[{type:'judgePhase',seat:event.seat},{type:'drawPhase',seat:event.seat}]),{type:'playPhase',seat:event.seat});break}
    case 'judgePhase':{const p=player(s,event.seat);if(!p.alive||p.marks.skipJudge)break;if(F.phase(s,event.seat,'judge',event))break;enqueue(s,...p.judgment.slice().reverse().map(c=>({type:'delayed',target:event.seat,cardId:c.id})));break}
    case 'incarnationOffer':{
      const p=player(s,event.seat);if(!p.alive||!hasSkill(p,'huashen'))break
      if(incarnationOptions(p).length)makePending(s,{kind:'incarnation',actor:p.seat,skill:'huashen',required:!p.incarnation.activeHero,reason:event.reason});break
    }
    case 'xinshengOffer':{const p=player(s,event.seat);if(!p.alive||!hasSkill(p,'xinsheng'))break;if(autoSkill('xinsheng')){announceSkill(s,p.seat,'xinsheng');acquireIncarnations(s,p.seat,event.count)}else makePending(s,{kind:'choice',actor:p.seat,skill:'xinsheng',count:event.count,choices:[{value:'yes',label:'获得新的变身牌'},{value:'no',label:'不发动'}]});break}
    case 'drawPhase': {
      const p=player(s,event.seat);if(!p.alive||p.marks.skipDraw)break
      if(F.phase(s,event.seat,'draw',event))break
      const extra=['haoshi','shuangxiong',...(p.hp<p.maxHp?['zaiqi']:[])].find(skill=>hasSkill(p,skill));if(extra){X.ask(s,extra,event.seat,'yes',{continuation:{type:'draw',target:event.seat,count:2}});break}
      if(hasSkill(p,'tuxi')&&s.players.some(t=>t.alive&&t.seat!==event.seat&&t.hand.length)){makePending(s,{kind:'tuxi',actor:event.seat,skill:'tuxi'});break}
      if(hasSkill(p,'yingzi')&&autoSkill('yingzi')&&!hasSkill(p,'luoyi')){announceSkill(s,event.seat,'yingzi');draw(s,event.seat,3)}
      else if(hasSkill(p,'luoyi')||hasSkill(p,'yingzi'))makePending(s,{kind:'choice',actor:event.seat,skill:hasSkill(p,'luoyi')?'luoyi':'yingzi',choices:[{value:'yes',label:hasSkill(p,'luoyi')?'裸衣：少摸一张，增强伤害':'英姿：额外摸一张'},{value:'no',label:'正常摸两张'}]})
      else draw(s,event.seat,2);break
    }
    case 'playPhase':{const p=player(s,event.seat);if(!p.alive||p.marks.skipPlay){enqueue(s,{type:'endPhase',seat:event.seat});break}if(!event.checked&&hasSkill(p,'shensu')){const pending={kind:'shensu',actor:event.seat,skill:'shensu',mode:2,event:{...event,checked:true}};if(responseOptions(s,pending).some(a=>a.type==='rush')){makePending(s,pending);break}}if(F.phase(s,event.seat,'play',event))break;s.phase='play';break}
    case 'endPhase': {
      const p=player(s,event.seat);s.phase='resolve'
      if(p.alive&&!p.marks.skipDiscard&&F.phase(s,event.seat,'discard',event))break
      if(p.marks.skipDiscard){enqueue(s,{type:'turnEnd',seat:event.seat});break}
      if(p.alive&&hasSkill(p,'keji')&&!p.marks.shaInPlay){announceSkill(s,event.seat,'keji');enqueue(s,{type:'turnEnd',seat:event.seat})}
      else if(p.alive && p.hand.length>handLimit(s,p)){F.discardStart(s,event.seat);makePending(s,{kind:'discard',actor:event.seat,count:p.hand.length-handLimit(s,p)})}
      else enqueue(s,{type:'turnEnd',seat:event.seat});break
    }
    case 'turnEnd': enqueue(s,...(player(s,event.seat).alive?X.finish(s,event.seat):[]),...(player(s,event.seat).alive&&hasSkill(player(s,event.seat),'biyue')?[{type:'equipmentDraw',seat:event.seat,count:1,skill:'biyue'}]:[]),...(player(s,event.seat).alive&&hasSkill(player(s,event.seat),'jushou')?[{type:'jushouOffer',seat:event.seat}]:[]),...(player(s,event.seat).alive&&hasSkill(player(s,event.seat),'huashen')?[{type:'incarnationOffer',seat:event.seat,reason:'end'}]:[]),{type:'turnCleanup',seat:event.seat},...(s.turnIsExtra?[]:[{type:'turnStart',seat:nextAlive(s,event.seat)}]));break
    case 'turnCleanup':{const m=player(s,event.seat).marks,target=m.extraGrant;for(const key of ['tianyiWin','tianyiLose','shuangxiongColor','huxiao','ignoreDistance','wine','wineUsed','naked','extraGrant','fangquan'])delete m[key];if(target!=null&&player(s,target)?.alive){if(!s.turnIsExtra){const i=s.queue.findIndex(e=>e.type==='turnStart'&&!e.extra);if(i>=0)s.extraTurnReturn=s.queue.splice(i,1)[0].seat}enqueue(s,{type:'turnStart',seat:target,extra:true})}else if(s.turnIsExtra)resumeNormalTurn(s);break}
    case 'discardFinished':F.discardEnd(s,event.seat);s.queue.push({type:'turnEnd',seat:event.seat});break
    case 'jushouOffer':if(player(s,event.seat).alive)makePending(s,{kind:'choice',actor:event.seat,skill:'jushou',choices:[{value:'yes',label:'据守：摸三张并翻面'},{value:'no',label:'不发动'}]});break
    case 'kuangguRecover':{const p=player(s,event.seat);if(p.alive&&p.hp<p.maxHp){announceSkill(s,event.seat,'kuanggu');heal(s,event.seat,event.count)}break}
    case 'dodgeFollow':dodgeWeapons(s,event);break
    case 'finishCard': finishCards(s,event.ids,event);break
    case 'counter': counter(s,event.chain);break
    case 'gate': gate(s,event.effect,event.cardType,event.source,event.target,event.cancel);break
    case 'attack': attacking(s,event);break
    case 'attackDamage': attackDamage(s,event);break
    case 'duel': {
      if(!player(s,event.source).alive||!player(s,event.target).alive)break
      if(!event.jiangChecked){event.jiangChecked=true;F.jiangUse(s,event.source,'duel','none');F.jiangTarget(s,event.target,'duel','none')}
      const actor=event.actor??event.target, other=actor===event.target?event.source:event.target
      makePending(s,{kind:'response',actor,as:'sha',source:other,target:actor,remaining:hasSkill(player(s,other),'wushuang')?2:1,event:{...event,actor}});break
    }
    case 'aoe': if(player(s,event.target).alive){
      if(event.as==='sha'&&(hasSkill(player(s,event.target),'huoshou')||hasSkill(player(s,event.target),'juxiang')))break
      if(player(s,event.target).equip.armor?.type==='vine')note(s,`${name(s,event.target)}的${CARDS.vine.name}抵挡群体攻击`,catalog.trackBattle?{kind:'blocked',source:event.source,target:event.target}:null)
      else makePending(s,{kind:'response',actor:event.target,as:event.as,source:event.source,target:event.target,remaining:1,event,ignoreArmor:false,baguaTried:false})
    }break
    case 'damage': {
      const p=player(s,event.target);if(!p.alive)break
      if(X.beforeDamage(s,event))break
      if(event.source!=null)event.sourceFaction=hero(player(s,event.source)).faction
      if(!event.ignoreArmor){
        if(p.equip.armor?.type==='vine'&&event.nature==='fire')event.amount++
        if(p.equip.armor?.type==='silverlion')event.amount=Math.min(1,event.amount)
      }
      const source=event.source!=null?player(s,event.source):null,recover=source?.alive&&hasSkill(source,'kuanggu')&&distance(s,event.source,event.target)<=1
      p.hp-=event.amount;suspect(s,event.source,event.target,true);note(s,`${name(s,event.source)}使${name(s,event.target)}受到 ${event.amount} 点伤害`,catalog.trackBattle?{kind:'damage',source:event.source,target:event.target,amount:event.amount}:null)
      s.lastEvent={id:s.eventId,source:event.source,targets:[event.target],label:'伤害',amount:event.amount,cards:[]}
      enqueue(s,...X.hpEvents(s,event.target),{type:'rescue',target:event.target,source:event.source},...(recover?[{type:'kuangguRecover',seat:event.source,count:event.amount}]:[]),{...event,type:'postDamage'},X.event('post-damage',{ctx:event}));break
    }
    case 'postDamage': {
      const p=player(s,event.target);if(!p.alive)break
      const ids=(event.cardIds||[]).filter(id=>s.processing.some(c=>c.id===id)||s.discard.some(c=>c.id===id))
      if(hasSkill(p,'jianxiong')&&ids.length){
        if(autoSkill('jianxiong')){announceSkill(s,event.target,'jianxiong');choice(s,{actor:event.target,skill:'jianxiong',ids,choices:[{value:'yes'}]},'yes')}
        else makePending(s,{kind:'choice',actor:event.target,skill:'jianxiong',ids,choices:[{value:'yes',label:'奸雄：获得伤害牌'},{value:'no',label:'不发动'}]})
      }
      if(hasSkill(p,'fankui')&&event.source!=null&&player(s,event.source)?.alive&&ownedCards(player(s,event.source)).length)makePending(s,{kind:'choice',actor:event.target,skill:'fankui',event,choices:[{value:'yes',label:'反馈：取得伤害来源一张牌'},{value:'no',label:'不发动'}]})
      if(hasSkill(p,'ganglie')&&event.source!=null&&player(s,event.source)?.alive)makePending(s,{kind:'choice',actor:event.target,skill:'ganglie',event,choices:[{value:'yes',label:'刚烈：进行判定'},{value:'no',label:'不发动'}]})
      if(hasSkill(p,'yiji'))enqueue(s,{type:'yijiOffer',seat:event.target,amount:event.amount})
      if(hasSkill(p,'xinsheng'))enqueue(s,{type:'xinshengOffer',seat:event.target,count:event.amount})
      break
    }
    case 'rescue': openRescue(s,event);break
    case 'heal': if(player(s,event.target).alive){heal(s,event.target,1);suspect(s,event.source,event.target,false)}break
    case 'draw': draw(s,event.target,event.count,event.cause);break
    case 'yijiOffer': if(player(s,event.seat).alive){
      const amount=Math.max(1,event.amount||1)
      if(autoSkill('yiji'))beginYiji(s,event.seat,amount)
      else makePending(s,{kind:'choice',actor:event.seat,skill:'yiji',count:amount,choices:[{value:'yes',label:`遗计：摸${amount*2}张并分配`},{value:'no',label:'不发动'}]})
    }break
    case 'guanxingStart': if(player(s,event.seat).alive){
      const pool=[];for(let i=0;i<Math.min(5,aliveSeats(s).length);i++){const c=topCard(s);if(c)pool.push(c)}
      if(pool.length){s.processing.push(...pool);makePending(s,{kind:'guanxing',actor:event.seat,skill:'guanxing',pool})}
    }break
    case 'luoshenAsk': if(player(s,event.seat).alive){
      if(autoSkill('luoshen')){announceSkill(s,event.seat,'luoshen');beginJudgment(s,{owner:event.seat,kind:'luoshen'})}
      else makePending(s,{kind:'choice',actor:event.seat,skill:'luoshen',choices:[{value:'yes',label:'洛神：判定黑牌归自己'},{value:'no',label:'停止判定'}]})
    }break
    case 'judgmentScan': judgmentScan(s,event);break
    case 'judgmentComplete': judgmentComplete(s,event.ctx);break
    case 'responseContinue':successfulResponse(s,event.pending);break
    case 'equipmentDraw': if(player(s,event.seat).alive){
      if(autoSkill(event.skill)){announceSkill(s,event.seat,event.skill);draw(s,event.seat,event.count)}
      else makePending(s,{kind:'choice',actor:event.seat,skill:event.skill,count:event.count,choices:[{value:'yes',label:`${event.skill==='xiaoji'?'枭姬':event.skill==='biyue'?'闭月':'连营'}：摸${event.count}张牌`},{value:'no',label:'不发动'}]})
    }break
    case 'jizhi':
      if(!player(s,event.seat).alive)break
      if(autoSkill('jizhi')){announceSkill(s,event.seat,'jizhi');draw(s,event.seat,1,'skill-draw')}
      else makePending(s,{kind:'choice',actor:event.seat,skill:'jizhi',choices:[{value:'yes',label:'集智：摸一张'},{value:'no',label:'不发动'}]});break
    case 'take': if(event.handOnly?player(s,event.target).hand.length:event.equipmentOnly?ownedCards(player(s,event.target)).length:targetCardCount(player(s,event.target)))makePending(s,{...event,kind:'take',actor:event.actor??event.source});break
    case 'harvest': {
      if(!player(s,event.target).alive||!s.harvestPool.length)break
      makePending(s,{kind:'pick',actor:event.target,pool:clone(s.harvestPool)});break
    }
    case 'harvestCleanup': s.discard.push(...s.harvestPool.splice(0));break
    case 'collateral': if(player(s,event.target).alive&&player(s,event.victim).alive&&player(s,event.target).equip.weapon)makePending(s,{kind:'response',actor:event.target,as:'sha',source:event.source,target:event.victim,remaining:1,event});break
    case 'provocation':{const actor=player(s,event.target),victim=player(s,event.victim);if(!actor?.alive||!victim?.alive)break;makePending(s,{kind:'response',actor:event.target,as:'sha',source:event.source,target:event.victim,remaining:1,event});break}
    case 'delayed': delayed(s,event);break
    case 'judgeResult': {
      const p=player(s,event.target),index=p.judgment.findIndex(c=>c.id===event.cardId);if(index<0||!p.alive)break
      const card=p.judgment.splice(index,1)[0],kind=delayType(p,card);if(p.virtualJudgments)delete p.virtualJudgments[card.id];s.processing.push(card);beginJudgment(s,{owner:event.target,kind,delayId:card.id})
      break
    }
    case 'judgeApply': {
      const i=s.processing.findIndex(c=>c.id===event.cardId),judge=s.discard.find(c=>c.id===event.judgeId)
      if(i<0||!judge)throw new Error('判定牌已变化')
      const card=s.processing.splice(i,1)[0];applyJudgment(s,event.target,card,judge);break
    }
    case 'delayCancelled': {
      const p=player(s,event.target),i=p.judgment.findIndex(c=>c.id===event.cardId);if(i<0)break
      const card=p.judgment.splice(i,1)[0],kind=delayType(p,card);if(p.virtualJudgments)delete p.virtualJudgments[card.id];if(kind==='lightning')passLightning(s,event.target,card);else s.discard.push(card);break
    }
    case 'supportAsk': {
      const candidates=event.candidates||supportCandidates(s,event.requester,event.as),cursor=event.cursor||0
      if(cursor>=candidates.length){if(event.returnPending){s.pending=event.returnPending;s.pending.supportTried=true}else note(s,'没有武将提供杀');break}
      makePending(s,{...event,kind:'support',actor:candidates[cursor],candidates,cursor});break
    }
    default: throw new Error('未知结算事件：'+event.type)
  }
}
function settle(s) {
  let iterations=0
  while(!s.pending&&s.phase!=='finished'&&(s.queue.length||s.phase==='play'&&!player(s,s.current).alive)) {
    if(++iterations>1200)throw new Error('结算未收敛')
    if(!s.queue.length)s.queue.push({type:'endPhase',seat:s.current})
    const event=s.queue.shift();settleEvent(s,event)
    if(s.phase==='play'&&!s.pending&&!s.queue.length&&player(s,s.current).alive)break
  }
  return s
}
function successfulResponse(s,pending) {
  if(pending.as==='shan'&&!pending.leijiChecked&&hasSkill(player(s,pending.actor),'leiji')){
    enqueue(s,X.event('ask',{seat:pending.actor,skill:'leiji'}),{type:'responseContinue',pending:{...pending,leijiChecked:true}});return
  }
  if(pending.kind==='counter')return
  if(pending.kind==='rescue') {
    const target=player(s,pending.target),amount=pending.usedAs!=='wine'&&!s.teamMode&&target.role==='lord'&&hasSkill(target,'jiuyuan')&&pending.actor!==pending.target&&hero(player(s,pending.actor)).faction==='wu'?2:1
    // 救援线索：公开谁用桃/酒把谁救起，前端据此播放飞牌动画（牌面本就公开）。
    const shown=(pending.usedIds||[]).map(id=>s.discard.find(c=>c.id===id)||s.processing.find(c=>c.id===id)).filter(Boolean)
    note(s,`${name(s,pending.actor)}以${CARDS[pending.usedAs]?.name||'桃'}救助${name(s,pending.target)}`,{kind:'rescue-heal',source:pending.actor,target:pending.target,card:shown[0]?clone(shown[0]):null,amount})
    heal(s,pending.target,amount);suspect(s,pending.actor,pending.target,false)
    if(target.hp<=0)enqueue(s,...(target.buquPile?.length?[X.event('recover-pile',{seat:pending.target})]:[]),{type:'rescue',...pending});return
  }
  if(pending.kind==='support') {
    if(pending.returnPending) { const original=pending.returnPending;original.supportTried=true;original.usedIds=pending.usedIds;original.color=pending.color;successfulResponse(s,original) }
    else {const source=pending.requester,p=player(s,source);p.marks.jijiangTried=false;p.marks.sha++;p.marks.shaInPlay=true;const wine=p.marks.wine||0;p.marks.wine=0;enqueue(s,{type:'attack',source,target:pending.target,cardIds:pending.usedIds,color:pending.color,nature:pending.nature,wine,ignoreArmor:p.equip.weapon?.type==='qinggang'},{type:'finishCard',ids:pending.usedIds})}
    return
  }
  if(pending.kind==='blade') {const p=player(s,pending.actor),wine=p.marks.wine||0;p.marks.wine=0;enqueue(s,{type:'attack',source:pending.actor,target:pending.target,cardIds:pending.usedIds,color:pending.color,nature:pending.nature,wine,ignoreArmor:p.equip.weapon?.type==='qinggang'},{type:'finishCard',ids:pending.usedIds});return}
  if(pending.event?.type==='attack'&&(!player(s,pending.event.source)?.alive||!player(s,pending.event.target)?.alive))return
  if(--pending.remaining>0) {pending.baguaTried=false;pending.supportTried=false;delete pending.leijiChecked;makePending(s,pending);return}
  const event=pending.event
  if(event.type==='attack')dodgeComplete(s,event)
  else if(event.type==='duel')enqueue(s,{...event,actor:pending.actor===event.source?event.target:event.source})
  else if(event.type==='provocation'){const p=player(s,pending.actor),wine=p.marks.wine||0;p.marks.wine=0;enqueue(s,{type:'attack',source:p.seat,target:event.victim,cardIds:pending.usedIds,color:pending.color,nature:pending.nature,wine,ignoreArmor:p.equip.weapon?.type==='qinggang',commandedBy:event.source},{type:'finishCard',ids:pending.usedIds})}
  else if(event.type==='collateral'){const p=player(s,pending.actor),wine=p.marks.wine||0;p.marks.wine=0;enqueue(s,{type:'attack',source:pending.actor,target:pending.target,cardIds:pending.usedIds,color:pending.color,nature:pending.nature,wine,ignoreArmor:p.equip.weapon?.type==='qinggang',...(catalog.trackBattle?{commandedBy:event.source}:{})},{type:'finishCard',ids:pending.usedIds})}
}
function failedResponse(s,pending) {
  if(pending.kind==='discard'&&pending.mode==='ganglie'){enqueue(s,{type:'damage',source:pending.source,target:pending.actor,amount:1,cardIds:[]});return}
  if(pending.kind==='rescue')enqueue(s,{type:'rescue',...pending,cursor:pending.cursor+1})
  else if(pending.kind==='counter'){pending.chain.passes++;enqueue(s,{type:'counter',chain:pending.chain})}
  else if(pending.kind==='support')enqueue(s,{type:'supportAsk',...pending,cursor:pending.cursor+1})
  else if(pending.kind==='axe'||pending.kind==='blade')return
  else if(pending.kind==='response') {
    const event=pending.event
    if(event.type==='attack')enqueue(s,{...event,type:'attackDamage'})
    else if(event.type==='provocation'){if(ownedCards(player(s,pending.actor)).length)enqueue(s,{type:'take',actor:event.source,source:event.source,target:pending.actor,mode:'dismantle',equipmentOnly:true})}
    else if(event.type==='collateral') {
      const holder=player(s,pending.actor),weapon=holder.equip.weapon
      if(weapon){unequip(s,holder,'weapon');player(s,event.source).hand.push(weapon);note(s,`${name(s,event.source)}获得了${CARDS[weapon.type].name}`)}
    } else enqueue(s,{type:'damage',source:pending.source,target:pending.actor,amount:1+(event.type==='duel'&&player(s,pending.source).marks.naked&&s.current===pending.source?1:0),cardIds:event.cardIds})
  }
}
function choice(s,pending,value) {
  const p=player(s,pending.actor),event=pending.event
  if(!pending.choices.some(c=>c.value===value))throw new Error('请选择有效选项')
  if(pending.skill==='liegong'){if(value==='yes'){announceSkill(s,pending.actor,'liegong');event.unavoidable=true}enqueue(s,event)}
  else if(pending.skill==='jushou'&&value==='yes'){announceSkill(s,pending.actor,'jushou');draw(s,pending.actor,3,'skill-draw');p.faceDown=!p.faceDown;note(s,`${name(s,pending.actor)}${p.faceDown?'翻至背面':'翻回正面'}`)}
  else if(pending.skill==='mengjin'){if(value==='yes'){announceSkill(s,pending.actor,'mengjin');enqueue(s,{type:'take',actor:pending.actor,source:pending.actor,target:event.target,mode:'dismantle',equipmentOnly:true},{...event,type:'dodgeFollow'})}else enqueue(s,{...event,type:'dodgeFollow'})}
  else if(pending.skill==='luoyi'){p.marks.naked=value==='yes';draw(s,pending.actor,value==='yes'?1:2)}
  else if(pending.skill==='xinsheng'&&value==='yes')acquireIncarnations(s,pending.actor,pending.count)
  else if(pending.skill==='tiandu')judgmentComplete(s,pending.event.ctx,value==='yes')
  else if(pending.skill==='luoshen'&&value==='yes')beginJudgment(s,{owner:pending.actor,kind:'luoshen'})
  else if(pending.skill==='ganglie'&&value==='yes')beginJudgment(s,{owner:pending.actor,kind:'ganglie',source:event.source})
  else if(pending.skill==='fankui'&&value==='yes')enqueue(s,{type:'take',actor:pending.actor,source:pending.actor,target:event.source,mode:'snatch',equipmentOnly:true})
  else if(pending.skill==='yiji'&&value==='yes')beginYiji(s,pending.actor,pending.count||1)
  else if(pending.skill==='fan'){event.fanChecked=true;if(value==='yes'){
    event.nature='fire';note(s,`${name(s,pending.actor)}以${CARDS.fan.name}转为炎杀`)
    if(s.lastPlayed?.source===pending.actor&&s.lastPlayed.cards.some(c=>event.cardIds?.includes(c.id)))s.lastPlayed.nature='fire'
    if(s.lastResponse?.source===pending.actor&&s.lastResponse.cards.some(c=>event.cardIds?.includes(c.id)))s.lastResponse.as='firesha'
    for(const entry of s.exchange||[])if(entry.source===pending.actor&&entry.cards.some(c=>event.cardIds?.includes(c.id)))entry.as='firesha'
  }enqueue(s,event)}
  else if(pending.skill==='yingzi')draw(s,pending.actor,value==='yes'?3:2)
  else if(pending.skill==='xiaoji'&&value==='yes')draw(s,pending.actor,2)
  else if(pending.skill==='lianying'&&value==='yes')draw(s,pending.actor,1)
  else if(pending.skill==='biyue'&&value==='yes')draw(s,pending.actor,1)
  else if(pending.skill==='jizhi'&&value==='yes')draw(s,pending.actor,1,'skill-draw')
  else if(pending.skill==='jianxiong'&&value==='yes') {
    for(const id of pending.ids)for(const zone of [s.processing,s.discard]) {const index=zone.findIndex(c=>c.id===id);if(index>=0)p.hand.push(...zone.splice(index,1))}
    note(s,`${name(s,pending.actor)}发动奸雄收回牌`)
  } else if(pending.skill==='tieji') {
    event.ironChecked=true
    if(value==='yes')beginJudgment(s,{owner:pending.actor,kind:'tieji',attack:event});else enqueue(s,event)
  } else if(pending.skill==='dualsword') {
    event.prepared=true
    if(value==='yes')makePending(s,{kind:'choice',actor:event.target,skill:'dualTarget',event,choices:[{value:'discard',label:'弃一张手牌'},{value:'draw',label:'让对方摸一张'}].filter(c=>c.value!=='discard'||player(s,event.target).hand.length)})
    else enqueue(s,event)
  } else if(pending.skill==='dualTarget') {
    if(value==='discard')makePending(s,{kind:'discard',actor:pending.actor,count:1,continuation:event})
    else {draw(s,event.source,1);enqueue(s,event)}
  } else if(pending.skill==='ice') {
    if(value==='yes')enqueue(s,{type:'take',source:pending.actor,target:event.target,mode:'dismantle',equipmentOnly:true,repeat:2})
    else enqueue(s,{...event,type:'attackDamage',iceChecked:true})
  } else if(pending.skill==='bow') {
    if(value!=='no'&&player(s,event.target).equip[value])s.discard.push(removeOwned(player(s,event.target),player(s,event.target).equip[value].id,s))
    enqueue(s,{...event,type:'attackDamage',bowChecked:true})
  }
}
function playCard(s,action,resolvedCard=null) {
  const seat=action.seat,p=player(s,seat),cards=resolvedCard?[resolvedCard]:selectedCards(s,seat,action.ids),as=action.as||cards[0]?.type,targets=action.targets||[]
  const available=resolvedCard||legalActions(s,seat).find(option=>option.type==='play'&&option.as===as&&option.ids.length===action.ids?.length&&option.ids.every(id=>action.ids.includes(id))&&option.targets.length===targets.length&&option.targets.every((t,i)=>as==='collateral'?t===targets[i]:targets.includes(t)))
  if(!available||!resolvedCard&&!canConvert(p,cards,as,s))throw new Error('这张牌当前不能这样使用，请检查目标与距离')
  if(!resolvedCard&&X.startGuhuo(s,action))return
  const used=resolvedCard?[resolvedCard]:spend(s,seat,action.ids,true),ids=used.map(c=>c.id),def=CARDS[as],label=as==='sha'&&used.length===1&&CARDS[used[0].type].attackNature?CARDS[used[0].type].name:def.name
  remember(s,used,label,seat,targets,as);note(s,`${name(s,seat)}使用${label}${targets.length?' → '+targets.map(t=>name(s,t)).join('、'):''}`)
  F.jiangUse(s,seat,as,cardColor(used,p))
  if(as==='duel')for(const target of targets)F.jiangTarget(s,target,as,cardColor(used,p))
  if(def.category==='equip') {
    if(p.equip[def.slot])s.discard.push(unequip(s,p,def.slot));p.equip[def.slot]=used[0];s.processing=s.processing.filter(c=>c.id!==used[0].id);return
  }
  if(def.category==='delay') {
    const target=as==='lightning'?seat:targets[0],recipient=player(s,target);recipient.judgment.push(used[0]);if(used[0].type!==as){recipient.virtualJudgments||={};recipient.virtualJudgments[used[0].id]=as}s.processing=s.processing.filter(c=>c.id!==used[0].id);return
  }
  const events=[]
  if(slashAs(as)){p.marks.sha++;p.marks.shaInPlay=true;const wine=p.marks.wine||0;p.marks.wine=0;events.push(...targets.map(target=>({type:'attack',sourceJiangDone:true,source:seat,target,cardIds:ids,color:cardColor(used,p),nature:CARDS[as].attackNature||slashNature(used),wine,ignoreArmor:p.equip.weapon?.type==='qinggang'})))}
  else if(as==='tao')events.push({type:'heal',source:seat,target:seat})
  else if(as==='wine'){p.marks.wine=1;p.marks.wineUsed=true;note(s,`${name(s,seat)}饮用${CARDS.wine.name}：下一张杀伤害增加一点`)}
  else if(as==='ironchain'&&!targets.length){draw(s,seat,1,'skill-draw')}
  else {
    if(hasSkill(p,'jizhi'))events.push({type:'jizhi',seat})
    const targetOrder=(['draw'].includes(as)?[seat]:['ironchain'].includes(as)?targets:['savage','arrows'].includes(as)?orderFrom(s,(seat+1)%s.players.length).filter(t=>t!==seat):['garden','harvest'].includes(as)?orderFrom(s,seat):[targets[0]]).filter(t=>(!hasSkill(player(s,t),'weimu')||cardColor(used,p)!=='black')&&(as!=='savage'||!hasSkill(player(s,t),'huoshou')&&!hasSkill(player(s,t),'juxiang')))
    if(as==='harvest')for(let i=0;i<targetOrder.length;i++){const card=topCard(s);if(card)s.harvestPool.push(card)}
    for(const target of targetOrder) {
      let effect
      if(as==='duel')effect={type:'duel',jiangChecked:true,source:seat,target,cardIds:ids}
      if(as==='draw')effect={type:'draw',target,count:2}
      if(as==='garden')effect={type:'heal',source:seat,target}
      if(as==='harvest')effect={type:'harvest',target}
      if(as==='snatch'||as==='dismantle')effect={type:'take',source:seat,target,mode:as}
      if(as==='savage'||as==='arrows')effect={type:'aoe',source:as==='savage'?(s.players.find(p=>p.alive&&hasSkill(p,'huoshou'))?.seat??seat):seat,target,as:as==='savage'?'sha':'shan',cardIds:ids}
      if(as==='fireattack')effect=X.event('fireattack',{seat,target,cardIds:ids})
      if(as==='ironchain')effect=X.event('chain',{seat:target})
      if(as==='collateral')effect={type:'collateral',source:seat,target,victim:targets[1],cardIds:ids}
      events.push({type:'gate',cardType:as,source:seat,target,effect})
    }
    if(as==='harvest')events.push({type:'harvestCleanup'})
  }
  enqueue(s,...events,{type:'finishCard',ids,source:seat,as,virtual:!!resolvedCard||!!action.guhuo})
}
function activeSkill(s,action) {
  const p=player(s,action.seat),skill=action.skill,ids=action.ids||[],target=action.target
  if(!legalActions(s,action.seat).some(a=>a.type==='skill'&&a.skill===skill))throw new Error('技能暂时不可发动')
  if(X.activate(s,action))return
  if(skill==='qiangxi'){
    if(!legalActions(s,action.seat).some(a=>a.type==='skill'&&a.skill===skill&&a.target===target&&equalIDs(a.ids,ids)))throw new Error('强袭需要范围内目标与一张武器，或失去一点体力')
    p.marks.qiangxi=true;note(s,`${name(s,action.seat)}发动${labelSkill(s,action.seat,skill,'强袭')}`)
    remember(s,[],labelSkill(s,action.seat,skill,'强袭'),action.seat,[target],'qiangxi')
    if(ids.length)spend(s,action.seat,ids);else {p.hp--;note(s,`${name(s,action.seat)}失去一点体力`);enqueue(s,{type:'rescue',target:action.seat,source:null})}
    s.queue.push({type:'damage',source:action.seat,target,amount:1,cardIds:[]})
  } else if(skill==='rende') {
    if(!ids.length||!player(s,target)?.alive||target===action.seat||!ids.every(id=>p.hand.some(c=>c.id===id)))throw new Error('仁德需选择手牌和一名其他角色')
    const cards=spend(s,action.seat,ids,true);s.processing=s.processing.filter(c=>!ids.includes(c.id));player(s,target).hand.push(...cards)
    const before=p.marks.rende||0;p.marks.rende=before+ids.length;if(before<2&&p.marks.rende>=2)heal(s,action.seat,1)
    suspect(s,action.seat,target,false);note(s,`${name(s,action.seat)}以${labelSkill(s,action.seat,'rende','仁德')}交给${name(s,target)} ${ids.length} 张牌`)
  } else if(skill==='lijian'){
    const targets=action.targets||[],[source,victim]=targets
    if(ids.length!==1||!ownedCards(p).some(c=>c.id===ids[0])||targets.length!==2||source===victim||targets.some(t=>!player(s,t)?.alive||t===action.seat||hero(player(s,t)).sex!=='male')||hasSkill(player(s,victim),'kongcheng')&&!player(s,victim).hand.length)throw new Error('离间需要一张自己的牌和两名合法男性，第二名不能为空城')
    spend(s,action.seat,ids);p.marks.lijian=true;note(s,`${name(s,action.seat)}发动${labelSkill(s,action.seat,'lijian','离间')}令${name(s,source)}与${name(s,victim)}决斗`)
    remember(s,[],labelSkill(s,action.seat,'lijian','离间'),action.seat,targets,'duel');s.lastPlayed.virtualType='duel';enqueue(s,{type:'duel',source,target:victim,cardIds:[],skillController:action.seat})
  } else if(skill==='jieyin'){
    const recipient=player(s,target)
    if(ids.length!==2||!ids.every(id=>p.hand.some(c=>c.id===id))||!recipient?.alive||target===action.seat||hero(recipient).sex!=='male'||recipient.hp>=recipient.maxHp)throw new Error('结姻需要两张手牌和一名受伤的其他男性')
    spend(s,action.seat,ids);p.marks.jieyin=true;heal(s,action.seat,1);heal(s,target,1);suspect(s,action.seat,target,false)
    note(s,`${name(s,action.seat)}发动${labelSkill(s,action.seat,'jieyin','结姻')}，与${name(s,target)}各恢复一点体力`)
  } else if(skill==='qingnang'){
    const recipient=player(s,target)
    if(ids.length!==1||!p.hand.some(c=>c.id===ids[0])||!recipient?.alive||recipient.hp>=recipient.maxHp)throw new Error('青囊需要一张手牌和一名受伤角色')
    spend(s,action.seat,ids);p.marks.qingnang=true;heal(s,target,1);suspect(s,action.seat,target,false)
    note(s,`${name(s,action.seat)}发动${labelSkill(s,action.seat,'qingnang','青囊')}治疗${name(s,target)}`)
  } else if(skill==='zhiheng') {
    if(!ids.length)throw new Error('制衡至少选择一张手牌或装备')
    spend(s,action.seat,ids);p.marks.zhiheng=true;draw(s,action.seat,ids.length)
  } else if(skill==='kurou') {
    p.hp--;note(s,`${name(s,action.seat)}发动${labelSkill(s,action.seat,'kurou','苦肉')}，失去一点体力`);enqueue(s,{type:'rescue',target:action.seat,source:null},{type:'draw',target:action.seat,count:2})
  } else if(skill==='fanjian') {
    if(!player(s,target)?.alive||target===action.seat||!p.hand.length)throw new Error('反间需指定一名其他角色')
    p.marks.fanjian=true;makePending(s,{kind:'guess',actor:target,source:action.seat,target})
  } else if(skill==='jijiang') {
    if(!targetsFor(s,action.seat,'sha').includes(target))throw new Error('目标不在攻击范围')
    p.marks.jijiangTried=true;enqueue(s,{type:'supportAsk',requester:action.seat,target,as:'sha'})
  }
}
function answer(s,action,resolvedCard=null,forcedPending=null) {
  const pending=forcedPending||s.pending
  if(action.promptId!=null&&action.promptId!==pending.id)throw new Error('响应窗口已改变')
  const options=responseOptions(s,pending)
  const matches=options.some(o=>o.type===action.type&&(action.as==null||o.as==null||o.as===action.as)&&(o.value==null||o.value===action.value)&&(o.ids==null||o.ids.length===action.ids?.length&&o.ids.every(id=>action.ids.includes(id))))
  if(!matches&&!resolvedCard)throw new Error('请选择可用的响应')
  s.pending=null
  if(action.type==='respond'&&!resolvedCard&&X.startGuhuo(s,action,pending))return
  if(pending.kind==='ext'){X.answer(s,pending,action);return}
  if(pending.kind==='shensu'){
    if(action.type==='rush'){
      if(!options.some(o=>o.type==='rush'&&o.target===action.target&&equalIDs(o.ids,action.ids)))throw new Error('请选择本次疾行的目标与装备成本')
      if(action.ids.length)spend(s,action.seat,action.ids)
      player(s,action.seat).marks[pending.mode===1?'skipJudgeDraw':'skipPlay']=true
      announceSkill(s,action.seat,'shensu');remember(s,[],labelSkill(s,action.seat,'shensu','神速'),action.seat,[action.target],'sha');s.lastPlayed.virtualType='sha'
      enqueue(s,{type:'attack',source:action.seat,target:action.target,color:'none',nature:'normal',cardIds:[],ignoreArmor:player(s,action.seat).equip.weapon?.type==='qinggang'},pending.event)
    }else enqueue(s,pending.event)
    return
  }
  if(pending.kind==='incarnation'){
    if(action.type==='pass')return
    if(!options.some(o=>o.type==='transform'&&o.heroId===action.heroId&&o.skill===action.skill))throw new Error('请选择这次变身池中的角色和技能')
    const p=player(s,pending.actor);p.incarnation.activeHero=action.heroId;p.incarnation.activeSkill=action.skill
    note(s,`${name(s,p.seat)}变为${HERO_BY_ID[action.heroId].name}的形态，借用${labelSkill(s,p.seat,action.skill,action.skill)}`,{kind:'skill',seat:p.seat,skill:'huashen'});return
  }
  if(pending.kind==='guanxing'){
    const top=action.type==='pass'?pending.pool.map(c=>c.id):action.top||[],bottom=action.type==='pass'?[]:action.bottom||[],ids=top.concat(bottom),expected=pending.pool.map(c=>c.id)
    if(ids.length!==expected.length||new Set(ids).size!==expected.length||ids.some(id=>!expected.includes(id)))throw new Error('必须恰好安排本次看到的所有牌')
    s.processing=s.processing.filter(c=>!expected.includes(c.id));const find=id=>pending.pool.find(c=>c.id===id);s.deck=top.map(find).concat(s.deck,bottom.map(find));note(s,`${name(s,pending.actor)}完成${labelSkill(s,pending.actor,'guanxing','观星')}，${top.length}张置顶、${bottom.length}张置底`,{kind:'skill',seat:pending.actor,skill:'guanxing'});return
  }
  if(pending.kind==='liuli'){
    const event=pending.event
    if(action.type==='redirect'){
      if(!options.some(o=>o.type==='redirect'&&o.target===action.target&&equalIDs(o.ids,action.ids)))throw new Error('弃牌后该目标不在流离范围')
      spend(s,action.seat,action.ids);event.target=action.target;event.announced=false;event.redirectChecked=false;note(s,`${name(s,action.seat)}发动${labelSkill(s,action.seat,'liuli','流离')}转移杀`,{kind:'skill',seat:action.seat,skill:'liuli'})
    }enqueue(s,event);return
  }
  if(pending.kind==='judge-replace'){
    const event=pending.event
    if(action.type==='respond'){
      if(action.ids?.length!==1||!responseOptions(s,pending).some(o=>o.ids?.[0]===action.ids[0]))throw new Error('请选择合法改判牌')
      const [replacement]=spend(s,action.seat,action.ids,true),i=s.processing.findIndex(c=>c.id===event.ctx.judgeId);if(i<0)throw new Error('原判定牌丢失')
      const old=s.processing.splice(i,1);if(pending.skill==='guidao')player(s,action.seat).hand.push(...old);else{s.discard.push(...old);X.discarded(s,event.ctx.owner,old,'judge')}event.ctx.judgeId=replacement.id;note(s,`${name(s,action.seat)}发动${labelSkill(s,action.seat,pending.skill,pending.skill)}替换判定`,{kind:'skill',seat:action.seat,skill:pending.skill})
    }enqueue(s,event);return
  }
  if(pending.kind==='yiji'){
    const takeFromPool=ids=>{const cards=[];for(const id of ids){const i=s.processing.findIndex(c=>c.id===id);if(i<0)throw new Error('只能分配本次遗计得到的牌');cards.push(...s.processing.splice(i,1))}return cards}
    if(action.type==='give'){
      if(!options.some(o=>o.type==='give'&&o.target===action.target&&o.ids.length===action.ids?.length&&o.ids.every(id=>action.ids.includes(id))))throw new Error('只能分配本次遗计得到的牌')
      const cards=takeFromPool(action.ids);player(s,action.target).hand.push(...cards)
      note(s,`${name(s,action.seat)}将遗计所得${cards.length}张牌交给${name(s,action.target)}`,{kind:'yiji-give',seat:action.seat,target:action.target,cards:action.ids.slice()})
      pending.ids=pending.ids.filter(id=>!action.ids.includes(id));pending.pool=pending.pool.filter(c=>!action.ids.includes(c.id));pending.count=pending.ids.length
      if(pending.ids.length)makePending(s,pending)
    }else{
      // 保留：分配池里剩余的牌收回手牌（此前未进过手牌区，原有手牌不可用于分配）。
      const kept=takeFromPool(pending.ids)
      if(kept.length){player(s,pending.actor).hand.push(...kept);note(s,`${name(s,pending.actor)}收起${kept.length}张遗计牌`)}
    }
    return
  }
  if(action.type==='ack'){enqueue(s,pending.event);return}
  if(action.type==='pass'){if(pending.kind==='choice')choice(s,pending,pending.choices[pending.choices.length-1].value);else failedResponse(s,pending);return}
  if(action.type==='discard') {
    if(action.ids?.length!==pending.count||!action.ids.every(id=>player(s,action.seat).hand.some(c=>c.id===id)))throw new Error(`请弃置 ${pending.count} 张手牌`)
    spend(s,action.seat,action.ids);note(s,`${name(s,action.seat)}弃置 ${pending.count} 张手牌`);if(pending.mode!=='ganglie'){if(pending.continuation)enqueue(s,pending.continuation);else s.queue.push({type:'discardFinished',seat:action.seat})}return
  }
  if(action.type==='choose') {
    if(pending.kind==='tuxi'){
      if(action.value==='normal')draw(s,pending.actor,2)
      else {note(s,`${name(s,pending.actor)}发动${labelSkill(s,pending.actor,'tuxi','突袭')}替代摸牌`,{kind:'skill',seat:pending.actor,skill:'tuxi'});enqueue(s,...action.value.split(',').map(Number).map(target=>({type:'take',actor:pending.actor,source:pending.actor,target,mode:'snatch',handOnly:true})))}
      return
    }
    if(pending.kind==='choice')choice(s,pending,action.value)
    if(pending.kind==='guess') {
      const source=player(s,pending.source);if(!source.hand.length)return
      const card=source.hand.splice(Math.floor(random(s)*source.hand.length),1)[0];player(s,pending.actor).hand.push(card)
      handEmptied(s,source)
      note(s,`${labelSkill(s,pending.source,'fanjian','反间')}揭晓：${{spade:'♠',heart:'♥',club:'♣',diamond:'♦'}[card.suit]}${CARDS[card.type].name}`)
      if(card.suit!==action.value)enqueue(s,{type:'damage',source:pending.source,target:pending.actor,amount:1,cardIds:[]})
    }
    if(pending.kind==='pick'){const index=s.harvestPool.findIndex(c=>c.id===action.value);if(index<0)throw new Error('该牌已被选走');const [card]=s.harvestPool.splice(index,1);player(s,pending.actor).hand.push(card);note(s,`${name(s,pending.actor)}从五谷丰登选择了一张牌`,catalog.trackBattle?{kind:'harvest-pick',source:pending.actor,card:clone(card),playedId:s.lastPlayed?.id}:null)}
    if(pending.kind==='take')takeCard(s,pending,action.value)
    return
  }
  if(action.type==='support'){pending.supportTried=true;enqueue(s,{type:'supportAsk',requester:pending.actor,as:pending.as,returnPending:pending});return}
  if(action.type==='bagua') {
    pending.baguaTried=true;beginJudgment(s,{owner:pending.actor,kind:'bagua',response:pending});return
  }
  if(action.type==='respond') {
    const processing=pending.kind==='blade'||pending.kind==='support'&&(!pending.returnPending||['collateral','provocation'].includes(pending.returnPending.event?.type))||['collateral','provocation'].includes(pending.event?.type)
    const cards=resolvedCard?[resolvedCard]:spend(s,action.seat,action.ids,processing,'response');if(resolvedCard&&!processing){s.processing=s.processing.filter(c=>c.id!==resolvedCard.id);s.discard.push(resolvedCard)}pending.usedIds=cards.map(c=>c.id);pending.color=cardColor(cards,player(s,action.seat))
    pending.nature=slashNature(cards);pending.usedAs=action.as||options.find(o=>o.type==='respond'&&o.ids?.length===action.ids?.length&&o.ids.every(id=>action.ids.includes(id)))?.as||pending.as
    if(pending.usedAs==='sha'&&s.current===action.seat&&s.phase==='play')player(s,action.seat).marks.shaInPlay=true
    if(catalog.trackBattle&&pending.kind!=='axe'){s.lastResponse={id:s.eventId+1,cards:clone(cards),as:pending.usedAs,source:action.seat,forPlayed:s.lastPlayed?.id,turn:s.turns};if(s.exchange&&s.lastResponse.forPlayed===s.lastPlayed?.id)s.exchange.push({source:action.seat,cards:clone(cards),as:pending.usedAs})}
    note(s,`${name(s,action.seat)}${pending.kind==='axe'?'发动贯石斧':'打出'+CARDS[pending.usedAs].name}`)
    if(pending.kind==='axe'){enqueue(s,{...pending.event,type:'attackDamage'});return}
    if(pending.kind==='counter') {
      pending.chain.negated=!pending.chain.negated;pending.chain.passes=0;enqueue(s,...(hasSkill(player(s,action.seat),'jizhi')?[{type:'jizhi',seat:action.seat}]:[]),{type:'counter',chain:pending.chain})
    } else successfulResponse(s,pending)
  }
}

function dispatch(state,action) {
  if(!state||state.phase==='finished')return {ok:false,error:'本局已经结束',state}
  if(!action||!Number.isInteger(action.seat)||!player(state,action.seat)?.alive&&!(state.pending?.kind==='ext'&&state.pending.actor===action.seat&&state.pending.skill==='zhuiyi'))return {ok:false,error:'无效玩家',state}
  if(action.revision!=null&&action.revision!==state.revision)return {ok:false,error:'牌局已经变化，请重新选择',state}
  const s=clone(state)
  try {
    if(s.pending) {if(s.pending.actor!==action.seat)throw new Error('正在等待其他角色响应');answer(s,action)}
    else {
      if(s.phase!=='play'||s.current!==action.seat)throw new Error('还没有轮到你出牌')
      if(action.type==='play')playCard(s,action)
      else if(action.type==='skill')activeSkill(s,action)
      else if(action.type==='end')enqueue(s,{type:'endPhase',seat:action.seat})
      else throw new Error('无效动作')
    }
    settle(s);s.revision++;return {ok:true,state:s}
  } catch(error) {return {ok:false,error:error.message,state}}
}
function playerView(s,seat) {
  return {
    version:s.version,revision:s.revision,phase:s.phase,current:s.current,turns:s.turns,winner:s.winner,seat,deckSize:allCards(s).length,deckVersion:s.deckVersion||1,publicRoleCounts:s.players.reduce((counts,p)=>(counts[p.role]=(counts[p.role]||0)+1,counts),{}),
    ...(s.teamMode?{teamMode:true,sides:s.sides.slice()}:{}),
    deckCount:s.deck.length,discardCount:s.discard.length,logs:clone(s.logs).map(l=>l.cue?.kind==='yiji-give'&&l.cue.seat!==seat&&l.cue.target!==seat?{...l,cue:{...l.cue,cards:[],count:l.cue.cards?.length||l.cue.count||0}}:l),lastEvent:clone(s.lastEvent),lastPlayed:clone(s.lastPlayed||null),suspicion:s.suspicion.slice(),attackRanges:s.players.map(p=>attackRange(s,p.seat)),
    ...(catalog.trackBattle?{lastResponse:clone(s.lastResponse||null),harvestPool:clone(s.harvestPool),exchange:clone(s.exchange||null)}:{}),
    players:s.players.map(p=>({seat:p.seat,heroId:p.heroId,hp:p.hp,maxHp:p.maxHp,alive:p.alive,handCount:p.hand.length,
      hand:p.seat===seat?clone(p.hand):[],role:s.teamMode||p.role==='lord'||p.seat===seat||!p.alive||s.phase==='finished'?p.role:null,
      fieldPile:clone(p.fieldPile||[]),equip:clone(p.equip),judgment:p.judgment.map(c=>publicDelay(p,c)),marks:clone(p.marks),persistent:clone(p.persistent||{}),faceDown:!!p.faceDown,chained:!!p.chained,effectiveSkills:hero(p).skills.slice(),buquPile:clone(p.buquPile||[]),skillsSealed:!!p.skillsSealed,
      ...(p.incarnation?{effectiveSkills:hero(p).skills.slice(),effectiveSex:hero(p).sex,effectiveFaction:hero(p).faction,incarnation:p.seat===seat?clone(p.incarnation):{activeHero:p.incarnation.activeHero,activeSkill:p.incarnation.activeSkill,count:p.incarnation.pool.length}}:{})})),
    pending:s.pending?{id:s.pending.id,kind:s.pending.kind,actor:s.pending.actor,as:s.pending.as,target:s.pending.target,source:s.pending.source,skill:s.pending.skill,remaining:s.pending.remaining,count:s.pending.count,
      negated:s.pending.chain?.negated,cardType:s.pending.chain?.cardType,requester:s.pending.requester,required:s.pending.required,reason:s.pending.reason,mode:s.pending.mode,
      // 借刀的无懈询问也要暴露被杀目标（座位号，公开信息），客户端才能同时画出两条指向线。
      ...(s.pending.kind==='counter'&&s.pending.chain?.cardType==='collateral'?{victim:s.pending.chain.effect?.victim}:{}),
      ...(catalog.trackBattle?{context:(()=>{const e=s.pending.event||s.pending.returnPending?.event||(s.pending.kind==='ext'?(s.pending.ctx?.type?s.pending.ctx:s.pending.ctx?.original?.event):null);return e?{type:e.type,source:e.source,target:e.target,victim:e.victim,commandedBy:e.commandedBy}:null})()}: {}),
      ...(s.pending.kind==='reveal'?{card:clone(s.pending.card),effectiveSuit:s.pending.effectiveSuit,delayType:s.pending.delayType,hit:s.pending.hit}:{})}:null,
    ...(s.pending?.kind==='ext'?{extension:X.publicFields(s,s.pending,seat)}:{}),publicReveal:clone(s.publicReveal||null),
    ...(s.pending?.kind==='judge-replace'?{judgmentCard:clone(s.pending.card),judgmentKind:s.pending.event.ctx.kind}:{}),
    ...(s.pending?.kind==='reveal'?{judgmentLabel:s.pending.label}:{}),
    ...(s.pending?.kind==='yiji'&&s.pending.actor===seat?{yijiPool:clone(s.pending.pool)}:{}),
    legal:clone(legalActions(s,seat))
  }
}
function allCards(s) {return s.deck.concat(s.discard,s.processing,s.harvestPool,...s.players.map(p=>ownedCards(p).concat(p.judgment,p.buquPile||[],p.fieldPile||[])))}
const eventTypes=new Set(['provocation','judgePhase','turnPrepared','discardFinished','responseContinue','turnCleanup','judgeDrawStart','jushouOffer','kuangguRecover','dodgeFollow','turnStart','turnPrepare','incarnationOffer','xinshengOffer','drawPhase','playPhase','endPhase','turnEnd','finishCard','counter','gate','attack','attackDamage','duel','aoe','damage','postDamage','rescue','heal','draw','equipmentDraw','jizhi','take','harvest','harvestCleanup','collateral','delayed','judgeResult','judgeApply','delayCancelled','supportAsk','judgmentScan','judgmentComplete','luoshenAsk','yijiOffer','guanxingStart'])
const pendingKinds=new Set(['shensu','incarnation','response','rescue','counter','support','blade','axe','discard','choice','guess','pick','take','reveal','tuxi','judge-replace','yiji','guanxing','liuli'])
const validSeat=seat=>Number.isInteger(seat)&&seat>=0&&seat<8
function validEvent(event,depth=0) {
  if(event?.type==='ext')return depth<=12&&(EXT_OPS.has(event.op)||FOUNDATION_OPS.has(event.op))&&['seat','source','target','actor'].every(k=>event[k]==null||validSeat(event[k]))
  if(!event||depth>8||!eventTypes.has(event.type))return false
  if(event.type==='responseContinue'&&(!event.pending?.leijiChecked||!validPending(event.pending,depth+1)))return false
  for(const key of ['seat','source','target','actor','victim','requester'])if(event[key]!=null&&!validSeat(event[key]))return false
  if(event.type==='incarnationOffer'&&!['initial','start','end'].includes(event.reason))return false
  if(event.type==='xinshengOffer'&&(!Number.isInteger(event.count)||event.count<1||event.count>8))return false
  if(event.type==='kuangguRecover'&&(!Number.isInteger(event.count)||event.count<1||event.count>8))return false
  if(event.effect&&!validEvent(event.effect,depth+1)||event.cancel&&!validEvent(event.cancel,depth+1)||event.event&&!validEvent(event.event,depth+1))return false
  if(event.type==='counter'&&(!event.chain||!validEvent(event.chain.effect,depth+1)))return false
  if(['judgmentScan','judgmentComplete'].includes(event.type)){
    const c=event.ctx;if(!c||!validSeat(c.owner)||!['baonue','tuntian','leiji','supplyshortage','beige','miji','shuangxiong','indulgence','lightning','bagua','tieji','ganglie','luoshen'].includes(c.kind)||typeof c.judgeId!=='string')return false
    if(c.source!=null&&!validSeat(c.source)||c.attack&&!validEvent(c.attack,depth+1)||c.response&&!validPending(c.response,depth+1))return false
    if(event.type==='judgmentScan'&&(!Number.isInteger(event.cursor)||event.cursor<0||event.cursor>8))return false
  }
  return true
}
function validPending(p,depth=0) {
  if(p?.kind==='ext')return validSeat(p.actor)&&Number.isInteger(p.id)&&p.id>0&&typeof p.skill==='string'&&['board-pick','board-target','reveal','pindian','transfer','gift','discard','quhu-target','qiuyuan-give','fire-show','fire-discard','beige-cost','buqu-remove','buyi','zhenlie','yes','target','helper','question','luanwu'].includes(p.stage)&&!!catalog.SKILLS[p.skill.replace('-back','')]&&(!p.cards||Array.isArray(p.cards)&&p.cards.every(c=>!!CARDS[c.type]))&&(!p.spec||Number.isInteger(p.spec.min)&&Number.isInteger(p.spec.max)&&p.spec.min>=0&&p.spec.max>=p.spec.min&&p.spec.max<=makeDeck().length&&(!p.spec.targets||Array.isArray(p.spec.targets)&&p.spec.targets.every(validSeat)))
  if(!p||depth>3||!pendingKinds.has(p.kind)||!validSeat(p.actor)||!Number.isInteger(p.id)||p.id<1)return false
  for(const key of ['source','target','requester'])if(p[key]!=null&&!validSeat(p[key]))return false
  if(p.event&&!validEvent(p.event)||p.returnPending&&!validPending(p.returnPending,depth+1))return false
  if(['response','rescue','blade','axe','guess','take'].includes(p.kind)&&!validSeat(p.target))return false
  if(['response','rescue','counter','support','blade'].includes(p.kind)&&!['sha','shan','tao','nullify'].includes(p.as))return false
  if(p.kind==='response'&&(!p.event||!Number.isInteger(p.remaining)||p.remaining<1||p.remaining>2))return false
  if(p.kind==='counter'&&(!p.chain||!validEvent(p.chain.effect)||!CARDS[p.chain.cardType]||typeof p.chain.negated!=='boolean'||!validSeat(p.chain.cursor)||!Number.isInteger(p.chain.passes)))return false
  if(p.kind==='discard'&&(!Number.isInteger(p.count)||p.count<1||p.count>makeDeck().length))return false
  if(p.kind==='choice'&&(!Array.isArray(p.choices)||!p.choices.length||p.choices.length>5||p.choices.some(c=>typeof c.value!=='string'||typeof c.label!=='string')))return false
  if(p.kind==='choice'&&!['liegong','jushou','mengjin','xinsheng','luoyi','yingzi','jizhi','jianxiong','tieji','dualsword','dualTarget','ice','bow','fan','xiaoji','lianying','biyue','tiandu','fankui','ganglie','luoshen','yiji'].includes(p.skill))return false
  if(p.kind==='shensu'&&(![1,2].includes(p.mode)||p.skill!=='shensu'||p.event?.type!==(p.mode===1?'judgeDrawStart':'playPhase')||p.event.seat!==p.actor))return false
  if(p.kind==='choice'&&p.skill==='xinsheng'&&(!Number.isInteger(p.count)||p.count<1||p.count>8))return false
  if(p.kind==='incarnation'&&(typeof p.required!=='boolean'||!['initial','start','end'].includes(p.reason)||p.skill!=='huashen'))return false
  if(p.kind==='pick'&&(!Array.isArray(p.pool)||!p.pool.length||p.pool.length>8||p.pool.some(c=>!CARDS[c.type])))return false
  if(p.kind==='support'&&(!Array.isArray(p.candidates)||p.candidates.some(c=>!validSeat(c))||!validSeat(p.requester)))return false
  if(p.kind==='reveal'&&(!catalog.animatedJudgments||!['judgeApply','judgmentComplete'].includes(p.event?.type)||!['baonue','tuntian','leiji','supplyshortage','beige','miji','shuangxiong','indulgence','lightning','tieji','bagua','ganglie','luoshen'].includes(p.delayType)||typeof p.hit!=='boolean'||!CARDS[p.card?.type]))return false
  if(p.kind==='judge-replace'&&(p.event?.type!=='judgmentScan'||p.card?.id!==p.event.ctx.judgeId))return false
  if(p.kind==='yiji'&&(!Array.isArray(p.ids)||p.ids.length<1||p.ids.length>12||new Set(p.ids).size!==p.ids.length||p.ids.some(id=>typeof id!=='string')||!Array.isArray(p.pool)||p.pool.length!==p.ids.length||p.pool.some(c=>!CARDS[c.type]||!p.ids.includes(c.id))))return false
  if(p.kind==='guanxing'&&(!Array.isArray(p.pool)||p.pool.length<1||p.pool.length>5||new Set(p.pool.map(c=>c.id)).size!==p.pool.length||p.pool.some(c=>!CARDS[c.type])))return false
  if(p.kind==='liuli'&&(p.event?.type!=='attack'||p.event.target!==p.actor))return false
  return true
}
function restoreGame(raw) {
  try {
    const s=typeof raw==='string'?JSON.parse(raw):clone(raw)
    if(!s||s.theme!==catalog.theme||s.version!==VERSION||!Array.isArray(s.players)||s.players.length<2||s.players.length>8||!Number.isInteger(s.current)||s.current<0||s.current>=s.players.length||!['play','resolve','finished'].includes(s.phase))return null
    if(!F.validState(s))return null
    if(![s.deck,s.discard,s.processing,s.harvestPool,s.queue,s.logs,s.suspicion].every(Array.isArray))return null
    if(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!Number.isInteger(s.revision)||s.revision<0||!Number.isInteger(s.promptId)||!Number.isInteger(s.eventId)||!Number.isInteger(s.turns)||s.turns<0)return null
    if(s.suspicion.length!==s.players.length||s.suspicion.some(n=>!Number.isFinite(n))||s.queue.length>512||s.queue.some(event=>!validEvent(event))||s.logs.some(line=>typeof line.text!=='string'))return null
    if(s.teamMode){
      // 对抗局：sides 与座位一一对应，两队都非空；不校验身份局角色分布。
      if(!Array.isArray(s.sides)||s.sides.length!==s.players.length||s.sides.some(x=>x!==0&&x!==1)||!s.sides.includes(0)||!s.sides.includes(1))return null
      if(new Set(s.players.map(p=>p.heroId)).size!==s.players.length)return null
    }else if(new Set(s.players.map(p=>p.heroId)).size!==s.players.length||s.players.filter(p=>p.role==='lord').length!==1||!s.players.some(p=>p.role==='rebel')||s.players.filter(p=>p.role==='renegade').length>1||s.players.some(p=>!['lord','loyal','rebel','renegade'].includes(p.role)))return null
    for(const p of s.players)if(!HERO_BY_ID[p.heroId]||p.seat!==s.players.indexOf(p)||!Number.isInteger(p.hp)||p.hp>p.maxHp||p.hp< -makeDeck().length||typeof p.alive!=='boolean'||p.maxHp!==expectedMaxHp(s,p)||!Array.isArray(p.hand)||!Array.isArray(p.judgment)||!p.equip||!p.marks)return null
    if(s.players.some(p=>p.faceDown!=null&&typeof p.faceDown!=='boolean'))return null
    if(s.players.some(p=>p.chained!=null&&typeof p.chained!=='boolean'||p.skillsSealed!=null&&typeof p.skillsSealed!=='boolean'||p.disabledSkills&&(!Array.isArray(p.disabledSkills)||p.disabledSkills.some(k=>!catalog.SKILLS[k]))||p.gainedSkills&&(!Array.isArray(p.gainedSkills)||p.gainedSkills.some(k=>!catalog.SKILLS[k]))))return null
    if(s.players.some(p=>p.persistent&&Object.entries(p.persistent).some(([k,v])=>!['wuji','niepan','luanwu','ruoyu','zhiji','zaoxian','hunzi'].includes(k)||typeof v!=='boolean'||v&&!HERO_BY_ID[p.heroId].skills.includes(k))))return null
    if(s.players.some(p=>!validIncarnation(catalog,p)))return null
    if(s.players.some(p=>p.incarnation&&(s.phase==='play'&&!p.incarnation.activeHero||p.incarnation.pool.some(id=>s.players.some(other=>other.alive&&other.heroId===id)))))return null
    if(s.pending?.kind==='incarnation'&&(!player(s,s.pending.actor).incarnation?.pool.length||s.pending.required!==!player(s,s.pending.actor).incarnation.activeHero))return null
    if(s.deckVersion!=null&&s.deckVersion!==catalog.deckVersion)return null
    const definitions=s.deckVersion==null&&catalog.legacyMakeDeck?catalog.legacyMakeDeck():makeDeck()
    const canonical=new Map(definitions.map(c=>[c.id,c])),cards=allCards(s)
    if(cards.length!==canonical.size||new Set(cards.map(c=>c.id)).size!==canonical.size||cards.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))))return null
    if(s.pending&&(!validPending(s.pending)||!player(s,s.pending.actor)?.alive&&!(s.pending.kind==='ext'&&s.pending.skill==='zhuiyi')))return null
    if(s.pending?.kind==='pick'&&s.pending.pool.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))||!s.harvestPool.some(card=>card.id===c.id)))return null
    if(s.pending?.kind==='reveal'){
      const e=s.pending.event,id=e.type==='judgmentComplete'?e.ctx.judgeId:e.judgeId
      if(JSON.stringify(s.pending.card)!==JSON.stringify(canonical.get(id)))return null
      if(e.type==='judgmentComplete'&&!s.processing.some(c=>c.id===id))return null
      if(e.type==='judgeApply'&&(!s.processing.some(c=>c.id===e.cardId&&c.type===s.pending.delayType)||!s.discard.some(c=>c.id===id)))return null
    }
    if(s.pending?.kind==='judge-replace'&&(!s.processing.some(c=>c.id===s.pending.card.id)||JSON.stringify(s.pending.card)!==JSON.stringify(canonical.get(s.pending.card.id))))return null
    if(s.pending?.kind==='yiji'&&s.pending.pool.some(c=>!s.processing.some(p=>p.id===c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))))return null
    if(s.pending?.kind==='guanxing'&&s.pending.pool.some(c=>!s.processing.some(p=>p.id===c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))))return null
    for(const p of s.players)if(p.virtualJudgments&&Object.entries(p.virtualJudgments).some(([id,type])=>!p.judgment.some(c=>c.id===id&&(type==='indulgence'?c.suit==='diamond':type==='supplyshortage'?['spade','club'].includes(c.suit)&&['basic','equip'].includes(CARDS[c.type].category):false))))return null
    if(s.lastPlayed&&(!Array.isArray(s.lastPlayed.cards)||s.lastPlayed.cards.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id)))))return null
    if(s.lastResponse&&(!Array.isArray(s.lastResponse.cards)||s.lastResponse.cards.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id)))))return null
    if(s.exchange&&(!Array.isArray(s.exchange)||s.exchange.some(e=>!validSeat(e.source)||!Array.isArray(e.cards)||e.cards.length>2||e.cards.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))))))return null
    if(s.phase==='finished'&&!(s.teamMode?['0','1'].includes(s.winner):['lord','rebel','renegade'].includes(s.winner))||s.phase!=='finished'&&s.winner)return null
    if(s.phase==='play'&&!s.pending&&!player(s,s.current).alive||s.phase==='resolve'&&!s.pending&&!s.queue.length)return null
    return s
  } catch {return null}
}
return { VERSION, hero, hasSkill, aliveSeats, random, ownedCards, distance,
  attackRange, canConvert, targetsFor, legalActions, createGame, createAssignedGame, settle,
  dispatch, playerView, allCards, restoreGame }
}
const classicEngine=createEngine()
export const {hero,hasSkill,aliveSeats,random,ownedCards,distance,attackRange,
  canConvert,targetsFor,legalActions,settle,dispatch,playerView,allCards,restoreGame}=classicEngine
// Preserve the classic public API's default selected general.
export const createGame=options=>classicEngine.createGame({heroId:'guanyu',...options})
