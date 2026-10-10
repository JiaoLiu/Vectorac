import * as defaultCatalog from './catalog.mjs'
import {borrowableSkills,effectiveHero,validIncarnation}from './incarnations.mjs'

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
const skillOwner=(p,skill)=>p.incarnation?.activeSkill===skill?p.incarnation.activeHero:p.heroId
const labelSkill = (s,seat,skill,fallback) => catalog.skillName?.(skillOwner(player(s,seat),skill),skill)||fallback
const announceSkill = (s,seat,skill) => note(s,`${name(s,seat)}自动发动${labelSkill(s,seat,skill,catalog.skillNames?.[skill]||skill)}`,{kind:'skill',seat,skill})
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
  if (actual) note(s, `${name(s, seat)}摸了 ${actual} 张牌`,catalog.trackBattle&&cause==='card-draw'?{kind:'draw',target:seat,count:actual,reason:cause,playedId:s.lastPlayed?.id}:null)
}
function heal(s, seat, amount) { const p = player(s, seat); p.hp = Math.min(p.maxHp, p.hp + amount); note(s, `${name(s, seat)}回复 ${amount} 点体力`) }
function ownedCards(p) { return p.hand.concat(slots.map(slot => p.equip[slot]).filter(Boolean)) }
function handEmptied(s,p){if(p.alive&&!p.hand.length&&hasSkill(p,'lianying'))enqueue(s,{type:'equipmentDraw',seat:p.seat,count:1,skill:'lianying'})}
function unequip(s,p,slot){
 const card=p.equip[slot];p.equip[slot]=null
 if(card?.type==='silverlion'&&p.alive&&p.hp>0&&p.hp<p.maxHp)heal(s,p.seat,1)
 if(card&&p.alive&&hasSkill(p,'xiaoji'))enqueue(s,{type:'equipmentDraw',seat:p.seat,count:2,skill:'xiaoji'})
 return card
}
function removeOwned(p, id, s) {
  const index = p.hand.findIndex(c => c.id === id)
  if (index >= 0) {const c=p.hand.splice(index, 1)[0];handEmptied(s,p);return c}
  const slot = slots.find(slot => p.equip[slot]?.id === id)
  if (slot) return unequip(s,p,slot)
  throw new Error('请选择自己的牌')
}
function spend(s, seat, ids, processing = false) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error('牌不能重复选择')
  const cards = ids.map(id => removeOwned(player(s, seat), id, s))
  ;(processing ? s.processing : s.discard).push(...cards)
  return cards
}
function finishCards(s, ids) {
  for (const id of ids) { const i = s.processing.findIndex(c => c.id === id); if (i >= 0) s.discard.push(...s.processing.splice(i, 1)) }
}
function cardColor(cards) { return cards.every(isRed) ? 'red' : cards.every(c => !isRed(c)) ? 'black' : 'none' }
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
  const alive = aliveSeats(s), a = alive.indexOf(from), b = alive.indexOf(to)
  if (a < 0 || b < 0) return Infinity
  const usable = (p, slot) => p.equip[slot] && !excluded.includes(p.equip[slot].id)
  return Math.max(1, Math.min(Math.abs(a-b), alive.length-Math.abs(a-b))
    - (usable(player(s, from), 'offenseHorse') ? 1 : 0) - (hasSkill(player(s, from), 'mashu') ? 1 : 0)
    + (usable(player(s, to), 'defenseHorse') ? 1 : 0))
}
function attackRange(s, seat, excluded = []) {
  const w = player(s, seat).equip.weapon
  return w && !excluded.includes(w.id) ? CARDS[w.type].range : 1
}
function unlimited(p, ids = []) { return hasSkill(p, 'paoxiao') || p.equip.weapon?.type === 'crossbow' && !ids.includes(p.equip.weapon.id) }
function canConvert(p, cards, as, s) {
  if (cards.length === 1 && p.hand.some(c => c.id === cards[0].id) && cards[0].type === as) return true
  if (cards.length === 1 && as === 'sha' && hasSkill(p,'wusheng') && isRed(cards[0])) return true
  if(cards.length===1&&as==='sha'&&p.hand.some(c=>c.id===cards[0].id)&&slashCard(cards[0]))return true
  if(cards.length===1&&as==='dismantle'&&hasSkill(p,'qixi')&&!isRed(cards[0]))return true
  if(cards.length===1&&as==='shan'&&hasSkill(p,'qingguo')&&!isRed(cards[0])&&p.hand.some(c=>c.id===cards[0].id))return true
  if(cards.length===1&&as==='tao'&&hasSkill(p,'jijiu')&&isRed(cards[0])&&s&&s.current!==p.seat)return true
  if(cards.length===1&&as==='indulgence'&&hasSkill(p,'guose')&&cards[0].suit==='diamond')return true
  if (cards.length === 1 && hasSkill(p,'longdan') && p.hand.some(c => c.id === cards[0].id)
    && (as === 'sha' && cards[0].type === 'shan' || as === 'shan' && slashCard(cards[0]))) return true
  return as === 'sha' && cards.length === 2 && p.equip.weapon?.type === 'spear' && cards.every(card => p.hand.some(c => c.id === card.id))
}
function selectedCards(s, seat, ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return []
  const owned = ownedCards(player(s, seat))
  const cards = ids.map(id => owned.find(c => c.id === id))
  return cards.every(Boolean) ? cards : []
}
function targetCardCount(p) { return ownedCards(p).length + p.judgment.length }
const delayType=(p,c)=>p.virtualJudgments?.[c.id]||c.type
const publicDelay=(p,c)=>({...clone(c),type:delayType(p,c),physicalType:c.type})
function targetsFor(s, seat, as, ids = []) {
  const p = player(s, seat), others = aliveSeats(s).filter(t => t !== seat)
  if (as === 'sha') return others.filter(t => !(hasSkill(player(s,t),'kongcheng')&&!player(s,t).hand.length)&&distance(s, seat, t, ids) <= attackRange(s, seat, ids))
  if (as === 'snatch') return others.filter(t => !hasSkill(player(s,t),'qianxun')&&targetCardCount(player(s,t)) && (hasSkill(p,'qicai') || distance(s,seat,t,ids) <= 1))
  if (as === 'dismantle') return others.filter(t => targetCardCount(player(s,t)))
  if (as === 'duel') return others.filter(t=>!(hasSkill(player(s,t),'kongcheng')&&!player(s,t).hand.length))
  if (as === 'indulgence') return others.filter(t => !hasSkill(player(s,t),'qianxun')&&!player(s,t).judgment.some(c => delayType(player(s,t),c) === as))
  if (as === 'collateral') return others.filter(t => player(s,t).equip.weapon && aliveSeats(s).some(v => v !== t && !(hasSkill(player(s,v),'kongcheng')&&!player(s,v).hand.length)&&distance(s,t,v) <= attackRange(s,t)))
  return []
}
function maxTargets(s, seat, ids) {
  const p = player(s,seat)
  return p.equip.weapon?.type === 'halberd' && p.hand.length > 0 && p.hand.every(c => ids.includes(c.id)) && ids.every(id => p.hand.some(c => c.id === id)) ? 3 : 1
}
function combinations(items, min, max = min) {
  const out = []
  const walk = (at, chosen) => { if (chosen.length >= min) out.push(chosen.slice()); if (chosen.length === max) return; for (let i = at; i < items.length; i++) { chosen.push(items[i]); walk(i+1,chosen); chosen.pop() } }
  walk(0,[]); return out
}
function conversions(p, as, s) {
  const out = ownedCards(p).filter(c => canConvert(p,[c],as,s)).map(c => ({ ids: [c.id], as }))
  if (as === 'sha' && p.equip.weapon?.type === 'spear') out.push(...combinations(p.hand.map(c => c.id),2).map(ids => ({ids,as})))
  return out
}
function makePending(s, value) { s.pending = { ...(value.event?.source!=null?{source:value.event.source}:{}), ...(value.event?.target!=null?{target:value.event.target}:{}), ...value, id: ++s.promptId } }
function supportCandidates(s, seat, as) {
  const p = player(s,seat), skill = as === 'sha' ? 'jijiang' : 'hujia', faction = as === 'sha' ? 'shu' : 'wei'
  // 对抗局没有主公，主公技（求援/护驾）不生效。
  return !s.teamMode && p.role === 'lord' && hasSkill(p,skill) ? orderFrom(s,(seat+1)%s.players.length).filter(other => other !== seat && hero(player(s,other)).faction === faction) : []
}
function responseOptions(s, pending) {
  if(pending.kind==='incarnation'){const p=player(s,pending.actor);return [...incarnationOptions(p),...(!pending.required?[{type:'pass'}]:[])]}
  const p = player(s,pending.actor), opts = []
  if(pending.kind==='guanxing')return [{type:'arrange',pool:clone(pending.pool)},{type:'pass'}]
  if(pending.kind==='liuli')return [{type:'pass'},...ownedCards(p).flatMap(c=>aliveSeats(s).filter(t=>t!==p.seat&&t!==pending.event.source&&!(hasSkill(player(s,t),'kongcheng')&&!player(s,t).hand.length)&&distance(s,p.seat,t,[c.id])<=attackRange(s,p.seat,[c.id])).map(target=>({type:'redirect',ids:[c.id],target})))]
  if(pending.kind==='tuxi'){
    const targets=s.players.filter(t=>t.alive&&t.seat!==pending.actor&&t.hand.length).map(t=>t.seat)
    return [{type:'choose',value:'normal',label:'正常摸两张'},...combinations(targets,1,2).map(targets=>({type:'choose',value:targets.join(','),targets,label:'获取'+targets.map(t=>name(s,t)).join('、')+'各一张手牌'}))]
  }
  if(pending.kind==='judge-replace')return p.hand.map(c=>({type:'respond',ids:[c.id],as:'judgment'})).concat({type:'pass'})
  if(pending.kind==='yiji')return [{type:'choose',value:'keep',label:'保留剩余的牌'},...combinations(pending.ids.filter(id=>p.hand.some(c=>c.id===id)),1,2).flatMap(ids=>aliveSeats(s).filter(t=>t!==pending.actor).map(target=>({type:'give',ids,target})))]
  if(pending.kind==='reveal')return [{type:'ack'}]
  if (pending.kind === 'response' || pending.kind === 'support' || pending.kind === 'rescue' || pending.kind === 'counter' || pending.kind === 'blade') {
    const as = pending.as
    opts.push(...conversions(p,as,s).map(c => ({ ...c, type: 'respond' })))
    if(pending.kind==='rescue'&&pending.actor===pending.target&&CARDS.wine)opts.push(...p.hand.filter(c=>c.type==='wine').map(c=>({type:'respond',as:'wine',ids:[c.id]})))
    if (as === 'shan' && p.equip.armor?.type === 'bagua' && !pending.ignoreArmor && !pending.baguaTried) opts.push({ type:'bagua' })
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
  if (s.phase === 'finished' || !player(s,seat)?.alive) return []
  if (s.pending) return s.pending.actor === seat ? responseOptions(s,s.pending) : []
  if (s.phase !== 'play' || s.current !== seat) return []
  const p = player(s,seat), uses = p.hand.filter(c=>!['sha','shan','nullify'].includes(c.type)&&!CARDS[c.type]?.attackNature).map(c=>({ids:[c.id],as:c.type}))
  uses.push(...conversions(p,'sha'))
  if(hasSkill(p,'qixi'))uses.push(...conversions(p,'dismantle').filter(a=>!uses.some(u=>u.as===a.as&&u.ids[0]===a.ids[0])))
  if(hasSkill(p,'guose'))uses.push(...conversions(p,'indulgence').filter(a=>!uses.some(u=>u.as===a.as&&u.ids[0]===a.ids[0])))
  const actions = []
  for (const use of uses) {
    if (use.as === 'sha' && p.marks.sha >= 1 && !unlimited(p,use.ids)) continue
    if (use.as === 'tao' && p.hp >= p.maxHp || use.as === 'lightning' && p.judgment.some(c=>c.type==='lightning')) continue
    if(use.as==='wine'&&p.marks.wineUsed)continue
    const targets = targetsFor(s,seat,use.as,use.ids)
    if (['sha','duel','snatch','dismantle','indulgence'].includes(use.as)) {
      for (const chosen of combinations(targets,1,use.as==='sha'?maxTargets(s,seat,use.ids):1)) actions.push({type:'play',...use,targets:chosen})
    } else if (use.as === 'collateral') {
      for (const holder of targets) for (const victim of aliveSeats(s).filter(v=>v !== holder && !(hasSkill(player(s,v),'kongcheng')&&!player(s,v).hand.length)&&distance(s,holder,v)<=attackRange(s,holder))) actions.push({type:'play',...use,targets:[holder,victim]})
    } else actions.push({type:'play',...use,targets:[]})
  }
  for (const skill of ['rende','zhiheng','kurou','fanjian']) if (hasSkill(p,skill) && !(['zhiheng','fanjian'].includes(skill) && p.marks[skill]) && (skill !== 'fanjian' && skill !== 'rende' || p.hand.length)) actions.push({type:'skill',skill})
  if(hasSkill(p,'jieyin')&&!p.marks.jieyin&&p.hand.length>=2&&s.players.some(t=>t.alive&&t.seat!==seat&&hero(t).sex==='male'&&t.hp<t.maxHp))actions.push({type:'skill',skill:'jieyin'})
  if(hasSkill(p,'qingnang')&&!p.marks.qingnang&&p.hand.length&&s.players.some(t=>t.alive&&t.hp<t.maxHp))actions.push({type:'skill',skill:'qingnang'})
  if(hasSkill(p,'lijian')&&!p.marks.lijian&&ownedCards(p).length&&s.players.filter(t=>t.alive&&t.seat!==seat&&hero(t).sex==='male').length>=2)actions.push({type:'skill',skill:'lijian'})
  if (supportCandidates(s,seat,'sha').length && (p.marks.sha<1 || unlimited(p))) for (const target of targetsFor(s,seat,'sha')) actions.push({type:'skill',skill:'jijiang',target})
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
  s.queue.push(...s.players.filter(p=>hasSkill(p,'huashen')).map(p=>({type:'incarnationOffer',seat:p.seat,reason:'initial'})),{type:'turnStart',seat:s.current}); settle(s); return s
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
function die(s, seat, source) {
  const p = player(s,seat); p.alive=false
  s.discard.push(...p.hand.splice(0),...p.judgment.splice(0));p.virtualJudgments={}
  for (const slot of slots) if (p.equip[slot]) {s.discard.push(p.equip[slot]);p.equip[slot]=null}
  note(s, s.teamMode?`${name(s,seat)}阵亡（${s.sides[seat]===0?'友方':'敌方'}）`:`${name(s,seat)}阵亡，身份为${{lord:'主公',loyal:'忠臣',rebel:'反贼',renegade:'内奸'}[p.role]}`)
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
  const order=context.order||orderFrom(s,s.current)
  const cursor=context.cursor||0
  for(let i=cursor;i<order.length;i++) if(player(s,order[i]).alive && (conversions(player(s,order[i]),'tao',s).length||order[i]===context.target&&player(s,order[i]).hand.some(c=>c.type==='wine'))) {
    makePending(s,{kind:'rescue',actor:order[i],as:'tao',target:context.target,source:context.source,order,cursor:i});return
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
  let card
  if(choice==='hand') { if(!target.hand.length)throw new Error('对方已没有手牌');card=target.hand.splice(Math.floor(random(s)*target.hand.length),1)[0] }
  else if(catalog.individualHandChoices&&/^hand:\d+$/.test(choice)) {
    const index=Number(choice.slice(5));if(index>=target.hand.length)throw new Error('这张暗手牌已不可选')
    card=target.hand.splice(index,1)[0]
  }
  else if(target.judgment.some(c=>c.id===choice) && !pending.equipmentOnly) {card=target.judgment.splice(target.judgment.findIndex(c=>c.id===choice),1)[0];if(target.virtualJudgments)delete target.virtualJudgments[card.id]}
  else card=removeOwned(target,choice,s)
  if(choice==='hand'||choice.startsWith('hand:'))handEmptied(s,target)
  if(pending.mode==='snatch')player(s,pending.actor).hand.push(card);else s.discard.push(card)
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
  if(!event.redirectChecked){
    event.redirectChecked=true
    if(hasSkill(defender,'liuli')&&responseOptions(s,{kind:'liuli',actor:event.target,event}).some(a=>a.type==='redirect')){makePending(s,{kind:'liuli',actor:event.target,source:event.source,target:event.target,skill:'liuli',event});return}
  }
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
  makePending(s,{kind:'response',actor:event.target,as:'shan',source:event.source,target:event.target,remaining:hasSkill(attacker,'wushuang')?2:1,event,ignoreArmor:event.ignoreArmor,baguaTried:false})
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
  enqueue(s,{type:'damage',source:event.source,target:event.target,amount:1+(attacker.marks.naked&&s.current===event.source?1:0)+(event.wine||0)+(weapon==='guding'&&!defender.hand.length?1:0),nature:event.nature||'normal',ignoreArmor:event.ignoreArmor,cardIds:event.cardIds})
}
function dodgeComplete(s,event) {
  note(s,`${name(s,event.target)}闪过了杀`,catalog.trackBattle?{kind:'dodge',source:event.source,target:event.target}:null)
  const weapon=player(s,event.source).equip.weapon?.type
  if(weapon==='axe')makePending(s,{kind:'axe',actor:event.source,source:event.source,target:event.target,event})
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
  else if(judge.suit==='spade'&&judge.rank>=2&&judge.rank<=9){s.discard.push(card);enqueue(s,{type:'damage',source:null,target,amount:3,cardIds:[card.id]})}
  else passLightning(s,target,card)
}
function beginJudgment(s,ctx){
 const judge=topCard(s)
 if(!judge){note(s,'没有可用判定牌');applyFinalJudgment(s,{...ctx,judge:null});return}
 s.processing.push(judge);enqueue(s,{type:'judgmentScan',ctx:{...ctx,judgeId:judge.id},cursor:0})
}
function beginYiji(s,seat){
 const p=player(s,seat),ids=[]
 for(let i=0;i<2;i++){const c=topCard(s);if(!c)break;p.hand.push(c);ids.push(c.id)}
 if(ids.length){note(s,`${name(s,seat)}发动${labelSkill(s,seat,'yiji','遗计')}获得${ids.length}张牌`,{kind:'skill',seat,skill:'yiji'});makePending(s,{kind:'yiji',actor:seat,ids})}
}
function judgmentScan(s,event){
 const order=orderFrom(s,s.current)
 for(let i=event.cursor;i<order.length;i++){
  const p=player(s,order[i])
  if(hasSkill(p,'guicai')&&p.hand.length){makePending(s,{kind:'judge-replace',actor:p.seat,target:event.ctx.owner,skill:'guicai',card:clone(s.processing.find(c=>c.id===event.ctx.judgeId)),event:{...event,cursor:i+1}});return}
 }
 const ctx=event.ctx,judge=s.processing.find(c=>c.id===ctx.judgeId);if(!judge)throw new Error('判定牌丢失')
 const hit=ctx.kind==='indulgence'?judge.suit!=='heart':ctx.kind==='lightning'?judge.suit==='spade'&&judge.rank>=2&&judge.rank<=9:ctx.kind==='luoshen'?!isRed(judge):ctx.kind==='ganglie'?judge.suit!=='heart':isRed(judge)
 const label=CARDS[ctx.kind]?.name||labelSkill(s,ctx.owner,ctx.kind,ctx.kind)
 note(s,`${name(s,ctx.owner)}判定${label}：${{spade:'♠',heart:'♥',club:'♣',diamond:'♦'}[judge.suit]}${judge.rank}`)
 if(catalog.animatedJudgments)makePending(s,{kind:'reveal',actor:ctx.owner,target:ctx.owner,card:clone(judge),delayType:ctx.kind,label,hit,event:{type:'judgmentComplete',ctx}})
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
 if(p.alive&&(keep||ctx.kind==='luoshen'&&!isRed(judge)))p.hand.push(judge);else s.discard.push(judge)
 applyFinalJudgment(s,{...ctx,judge:clone(judge)})
}
function applyFinalJudgment(s,ctx){
 const judge=ctx.judge,p=player(s,ctx.owner)
 if(ctx.kind==='indulgence'||ctx.kind==='lightning'){
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
  switch(event.type) {
    case 'turnStart': {
      const p=player(s,event.seat); if(!p.alive){enqueue(s,{type:'turnEnd',seat:event.seat});break}
      s.current=event.seat;s.turns++;s.phase='resolve';p.marks={sha:0,rende:0};note(s,`第 ${s.turns} 回合 · ${name(s,event.seat)}`)
      enqueue(s,...(hasSkill(p,'huashen')?[{type:'incarnationOffer',seat:event.seat,reason:'start'}]:[]),{type:'turnPrepare',seat:event.seat});break
    }
    case 'turnPrepare':{const p=player(s,event.seat);if(p.alive)enqueue(s,...(hasSkill(p,'guanxing')?[{type:'guanxingStart',seat:event.seat}]:[]),...(hasSkill(p,'luoshen')?[{type:'luoshenAsk',seat:event.seat}]:[]),...p.judgment.slice().reverse().map(c=>({type:'delayed',target:event.seat,cardId:c.id})),{type:'drawPhase',seat:event.seat},{type:'playPhase',seat:event.seat});break}
    case 'incarnationOffer':{
      const p=player(s,event.seat);if(!p.alive||!hasSkill(p,'huashen'))break
      if(event.reason==='initial')acquireIncarnations(s,p.seat,2)
      if(incarnationOptions(p).length)makePending(s,{kind:'incarnation',actor:p.seat,skill:'huashen',required:!p.incarnation.activeHero,reason:event.reason});break
    }
    case 'xinshengOffer':{const p=player(s,event.seat);if(!p.alive||!hasSkill(p,'xinsheng'))break;if(autoSkill('xinsheng')){announceSkill(s,p.seat,'xinsheng');acquireIncarnations(s,p.seat,event.count)}else makePending(s,{kind:'choice',actor:p.seat,skill:'xinsheng',count:event.count,choices:[{value:'yes',label:'获得新的变身牌'},{value:'no',label:'不发动'}]});break}
    case 'drawPhase': {
      const p=player(s,event.seat);if(!p.alive)break
      if(hasSkill(p,'tuxi')&&s.players.some(t=>t.alive&&t.seat!==event.seat&&t.hand.length)){makePending(s,{kind:'tuxi',actor:event.seat,skill:'tuxi'});break}
      if(hasSkill(p,'yingzi')&&autoSkill('yingzi')&&!hasSkill(p,'luoyi')){announceSkill(s,event.seat,'yingzi');draw(s,event.seat,3)}
      else if(hasSkill(p,'luoyi')||hasSkill(p,'yingzi'))makePending(s,{kind:'choice',actor:event.seat,skill:hasSkill(p,'luoyi')?'luoyi':'yingzi',choices:[{value:'yes',label:hasSkill(p,'luoyi')?'裸衣：少摸一张，增强伤害':'英姿：额外摸一张'},{value:'no',label:'正常摸两张'}]})
      else draw(s,event.seat,2);break
    }
    case 'playPhase': if(!player(s,event.seat).alive||player(s,event.seat).marks.skipPlay)enqueue(s,{type:'endPhase',seat:event.seat});else s.phase='play';break
    case 'endPhase': {
      const p=player(s,event.seat);s.phase='resolve'
      if(p.alive&&hasSkill(p,'keji')&&!p.marks.shaInPlay){announceSkill(s,event.seat,'keji');enqueue(s,{type:'turnEnd',seat:event.seat})}
      else if(p.alive && p.hand.length>Math.max(0,p.hp))makePending(s,{kind:'discard',actor:event.seat,count:p.hand.length-Math.max(0,p.hp)})
      else enqueue(s,{type:'turnEnd',seat:event.seat});break
    }
    case 'turnEnd': enqueue(s,...(player(s,event.seat).alive&&hasSkill(player(s,event.seat),'biyue')?[{type:'equipmentDraw',seat:event.seat,count:1,skill:'biyue'}]:[]),...(player(s,event.seat).alive&&hasSkill(player(s,event.seat),'huashen')?[{type:'incarnationOffer',seat:event.seat,reason:'end'}]:[]),{type:'turnStart',seat:nextAlive(s,event.seat)});break
    case 'finishCard': finishCards(s,event.ids);break
    case 'counter': counter(s,event.chain);break
    case 'gate': gate(s,event.effect,event.cardType,event.source,event.target,event.cancel);break
    case 'attack': attacking(s,event);break
    case 'attackDamage': attackDamage(s,event);break
    case 'duel': {
      if(!player(s,event.source).alive||!player(s,event.target).alive)break
      const actor=event.actor??event.target, other=actor===event.target?event.source:event.target
      makePending(s,{kind:'response',actor,as:'sha',source:other,target:actor,remaining:hasSkill(player(s,other),'wushuang')?2:1,event:{...event,actor}});break
    }
    case 'aoe': if(player(s,event.target).alive){
      if(player(s,event.target).equip.armor?.type==='vine')note(s,`${name(s,event.target)}的${CARDS.vine.name}抵挡群体攻击`,catalog.trackBattle?{kind:'blocked',source:event.source,target:event.target}:null)
      else makePending(s,{kind:'response',actor:event.target,as:event.as,source:event.source,target:event.target,remaining:1,event,ignoreArmor:false,baguaTried:false})
    }break
    case 'damage': {
      const p=player(s,event.target);if(!p.alive)break
      if(!event.ignoreArmor){
        if(p.equip.armor?.type==='vine'&&event.nature==='fire')event.amount++
        if(p.equip.armor?.type==='silverlion')event.amount=Math.min(1,event.amount)
      }
      p.hp-=event.amount;suspect(s,event.source,event.target,true);note(s,`${name(s,event.source)}使${name(s,event.target)}受到 ${event.amount} 点伤害`,catalog.trackBattle?{kind:'damage',source:event.source,target:event.target,amount:event.amount}:null)
      s.lastEvent={id:s.eventId,source:event.source,targets:[event.target],label:'伤害',amount:event.amount,cards:[]}
      enqueue(s,{type:'rescue',target:event.target,source:event.source},{...event,type:'postDamage'});break
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
      if(hasSkill(p,'yiji'))enqueue(s,...Array.from({length:event.amount},()=>({type:'yijiOffer',seat:event.target})))
      if(hasSkill(p,'xinsheng'))enqueue(s,{type:'xinshengOffer',seat:event.target,count:event.amount})
      break
    }
    case 'rescue': openRescue(s,event);break
    case 'heal': if(player(s,event.target).alive){heal(s,event.target,1);suspect(s,event.source,event.target,false)}break
    case 'draw': draw(s,event.target,event.count,event.cause);break
    case 'yijiOffer': if(player(s,event.seat).alive){
      if(autoSkill('yiji'))beginYiji(s,event.seat)
      else makePending(s,{kind:'choice',actor:event.seat,skill:'yiji',choices:[{value:'yes',label:'遗计：摸两张并分配'},{value:'no',label:'不发动'}]})
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
    case 'equipmentDraw': if(player(s,event.seat).alive){
      if(autoSkill(event.skill)){announceSkill(s,event.seat,event.skill);draw(s,event.seat,event.count)}
      else makePending(s,{kind:'choice',actor:event.seat,skill:event.skill,count:event.count,choices:[{value:'yes',label:`${event.skill==='xiaoji'?'枭姬':event.skill==='biyue'?'闭月':'连营'}：摸${event.count}张牌`},{value:'no',label:'不发动'}]})
    }break
    case 'jizhi':
      if(!player(s,event.seat).alive)break
      if(autoSkill('jizhi')){announceSkill(s,event.seat,'jizhi');draw(s,event.seat,1)}
      else makePending(s,{kind:'choice',actor:event.seat,skill:'jizhi',choices:[{value:'yes',label:'集智：摸一张'},{value:'no',label:'不发动'}]});break
    case 'take': if(event.handOnly?player(s,event.target).hand.length:event.equipmentOnly?ownedCards(player(s,event.target)).length:targetCardCount(player(s,event.target)))makePending(s,{...event,kind:'take',actor:event.actor??event.source});break
    case 'harvest': {
      if(!player(s,event.target).alive||!s.harvestPool.length)break
      makePending(s,{kind:'pick',actor:event.target,pool:clone(s.harvestPool)});break
    }
    case 'harvestCleanup': s.discard.push(...s.harvestPool.splice(0));break
    case 'collateral': if(player(s,event.target).alive&&player(s,event.victim).alive&&player(s,event.target).equip.weapon)makePending(s,{kind:'response',actor:event.target,as:'sha',source:event.source,target:event.victim,remaining:1,event});break
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
  if(pending.kind==='counter')return
  if(pending.kind==='rescue') {
    const target=player(s,pending.target),amount=pending.usedAs!=='wine'&&!s.teamMode&&target.role==='lord'&&hasSkill(target,'jiuyuan')&&pending.actor!==pending.target&&hero(player(s,pending.actor)).faction==='wu'?2:1
    heal(s,pending.target,amount);suspect(s,pending.actor,pending.target,false)
    if(target.hp<=0)enqueue(s,{type:'rescue',...pending});return
  }
  if(pending.kind==='support') {
    if(pending.returnPending) { const original=pending.returnPending;original.supportTried=true;original.usedIds=pending.usedIds;original.color=pending.color;successfulResponse(s,original) }
    else {const source=pending.requester,p=player(s,source);p.marks.jijiangTried=false;p.marks.sha++;p.marks.shaInPlay=true;const wine=p.marks.wine||0;p.marks.wine=0;enqueue(s,{type:'attack',source,target:pending.target,cardIds:pending.usedIds,color:pending.color,nature:pending.nature,wine,ignoreArmor:p.equip.weapon?.type==='qinggang'},{type:'finishCard',ids:pending.usedIds})}
    return
  }
  if(pending.kind==='blade') {const p=player(s,pending.actor),wine=p.marks.wine||0;p.marks.wine=0;enqueue(s,{type:'attack',source:pending.actor,target:pending.target,cardIds:pending.usedIds,color:pending.color,nature:pending.nature,wine,ignoreArmor:p.equip.weapon?.type==='qinggang'},{type:'finishCard',ids:pending.usedIds});return}
  if(--pending.remaining>0) {pending.baguaTried=false;pending.supportTried=false;makePending(s,pending);return}
  const event=pending.event
  if(event.type==='attack')dodgeComplete(s,event)
  else if(event.type==='duel')enqueue(s,{...event,actor:pending.actor===event.source?event.target:event.source})
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
    else if(event.type==='collateral') {
      const holder=player(s,pending.actor),weapon=holder.equip.weapon
      if(weapon){unequip(s,holder,'weapon');player(s,event.source).hand.push(weapon);note(s,`${name(s,event.source)}获得了${CARDS[weapon.type].name}`)}
    } else enqueue(s,{type:'damage',source:pending.source,target:pending.actor,amount:1+(event.type==='duel'&&player(s,pending.source).marks.naked&&s.current===pending.source?1:0),cardIds:event.cardIds})
  }
}
function choice(s,pending,value) {
  const p=player(s,pending.actor),event=pending.event
  if(!pending.choices.some(c=>c.value===value))throw new Error('请选择有效选项')
  if(pending.skill==='luoyi'){p.marks.naked=value==='yes';draw(s,pending.actor,value==='yes'?1:2)}
  else if(pending.skill==='xinsheng'&&value==='yes')acquireIncarnations(s,pending.actor,pending.count)
  else if(pending.skill==='tiandu')judgmentComplete(s,pending.event.ctx,value==='yes')
  else if(pending.skill==='luoshen'&&value==='yes')beginJudgment(s,{owner:pending.actor,kind:'luoshen'})
  else if(pending.skill==='ganglie'&&value==='yes')beginJudgment(s,{owner:pending.actor,kind:'ganglie',source:event.source})
  else if(pending.skill==='fankui'&&value==='yes')enqueue(s,{type:'take',actor:pending.actor,source:pending.actor,target:event.source,mode:'snatch',equipmentOnly:true})
  else if(pending.skill==='yiji'&&value==='yes')beginYiji(s,pending.actor)
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
  else if(pending.skill==='jizhi'&&value==='yes')draw(s,pending.actor,1)
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
function playCard(s,action) {
  const seat=action.seat,p=player(s,seat),cards=selectedCards(s,seat,action.ids),as=action.as||cards[0]?.type,targets=action.targets||[]
  const available=legalActions(s,seat).find(option=>option.type==='play'&&option.as===as&&option.ids.length===action.ids?.length&&option.ids.every(id=>action.ids.includes(id))&&option.targets.length===targets.length&&option.targets.every((t,i)=>as==='collateral'?t===targets[i]:targets.includes(t)))
  if(!available||!canConvert(p,cards,as,s))throw new Error('这张牌当前不能这样使用，请检查目标与距离')
  const used=spend(s,seat,action.ids,true),ids=used.map(c=>c.id),def=CARDS[as],label=as==='sha'&&used.length===1&&CARDS[used[0].type].attackNature?CARDS[used[0].type].name:def.name
  remember(s,used,label,seat,targets,as);note(s,`${name(s,seat)}使用${label}${targets.length?' → '+targets.map(t=>name(s,t)).join('、'):''}`)
  if(def.category==='equip') {
    if(p.equip[def.slot])s.discard.push(unequip(s,p,def.slot));p.equip[def.slot]=used[0];s.processing=s.processing.filter(c=>c.id!==used[0].id);return
  }
  if(def.category==='delay') {
    const target=as==='lightning'?seat:targets[0],recipient=player(s,target);recipient.judgment.push(used[0]);if(used[0].type!==as){recipient.virtualJudgments||={};recipient.virtualJudgments[used[0].id]=as}s.processing=s.processing.filter(c=>c.id!==used[0].id);return
  }
  const events=[]
  if(as==='sha'){p.marks.sha++;p.marks.shaInPlay=true;const wine=p.marks.wine||0;p.marks.wine=0;events.push(...targets.map(target=>({type:'attack',source:seat,target,cardIds:ids,color:cardColor(used),nature:slashNature(used),wine,ignoreArmor:p.equip.weapon?.type==='qinggang'})))}
  else if(as==='tao')events.push({type:'heal',source:seat,target:seat})
  else if(as==='wine'){p.marks.wine=1;p.marks.wineUsed=true;note(s,`${name(s,seat)}饮用${CARDS.wine.name}：下一张杀伤害增加一点`)}
  else {
    if(hasSkill(p,'jizhi'))events.push({type:'jizhi',seat})
    const targetOrder=['draw'].includes(as)?[seat]:['savage','arrows'].includes(as)?orderFrom(s,(seat+1)%s.players.length).filter(t=>t!==seat):['garden','harvest'].includes(as)?orderFrom(s,seat):[targets[0]]
    if(as==='harvest')for(let i=0;i<targetOrder.length;i++){const card=topCard(s);if(card)s.harvestPool.push(card)}
    for(const target of targetOrder) {
      let effect
      if(as==='duel')effect={type:'duel',source:seat,target,cardIds:ids}
      if(as==='draw')effect={type:'draw',target,count:2}
      if(as==='garden')effect={type:'heal',source:seat,target}
      if(as==='harvest')effect={type:'harvest',target}
      if(as==='snatch'||as==='dismantle')effect={type:'take',source:seat,target,mode:as}
      if(as==='savage'||as==='arrows')effect={type:'aoe',source:seat,target,as:as==='savage'?'sha':'shan',cardIds:ids}
      if(as==='collateral')effect={type:'collateral',source:seat,target,victim:targets[1],cardIds:ids}
      events.push({type:'gate',cardType:as,source:seat,target,effect})
    }
    if(as==='harvest')events.push({type:'harvestCleanup'})
  }
  enqueue(s,...events,{type:'finishCard',ids})
}
function activeSkill(s,action) {
  const p=player(s,action.seat),skill=action.skill,ids=action.ids||[],target=action.target
  if(!legalActions(s,action.seat).some(a=>a.type==='skill'&&a.skill===skill))throw new Error('技能暂时不可发动')
  if(skill==='rende') {
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
function answer(s,action) {
  const pending=s.pending
  if(action.promptId!=null&&action.promptId!==pending.id)throw new Error('响应窗口已改变')
  const options=responseOptions(s,pending)
  const matches=options.some(o=>o.type===action.type&&(o.value==null||o.value===action.value)&&(o.ids==null||o.ids.length===action.ids?.length&&o.ids.every(id=>action.ids.includes(id))))
  if(!matches)throw new Error('请选择可用的响应')
  s.pending=null
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
      if(action.ids?.length!==1||!player(s,action.seat).hand.some(c=>c.id===action.ids[0]))throw new Error('鬼才只能使用一张手牌')
      const [replacement]=spend(s,action.seat,action.ids,true),i=s.processing.findIndex(c=>c.id===event.ctx.judgeId);if(i<0)throw new Error('原判定牌丢失')
      s.discard.push(...s.processing.splice(i,1));event.ctx.judgeId=replacement.id;note(s,`${name(s,action.seat)}发动${labelSkill(s,action.seat,'guicai','鬼才')}替换判定`,{kind:'skill',seat:action.seat,skill:'guicai'})
    }enqueue(s,event);return
  }
  if(pending.kind==='yiji'){
    if(action.type==='give'){
      if(!options.some(o=>o.type==='give'&&o.target===action.target&&o.ids.length===action.ids?.length&&o.ids.every(id=>action.ids.includes(id))))throw new Error('只能分配本次遗计得到的牌')
      const cards=spend(s,action.seat,action.ids,true);s.processing=s.processing.filter(c=>!action.ids.includes(c.id));player(s,action.target).hand.push(...cards)
      note(s,`${name(s,action.seat)}将遗计所得${cards.length}张牌交给${name(s,action.target)}`)
      pending.ids=pending.ids.filter(id=>!action.ids.includes(id));if(pending.ids.length)makePending(s,pending)
    }return
  }
  if(action.type==='ack'){enqueue(s,pending.event);return}
  if(action.type==='pass'){if(pending.kind==='choice')choice(s,pending,pending.choices[pending.choices.length-1].value);else failedResponse(s,pending);return}
  if(action.type==='discard') {
    if(action.ids?.length!==pending.count||!action.ids.every(id=>player(s,action.seat).hand.some(c=>c.id===id)))throw new Error(`请弃置 ${pending.count} 张手牌`)
    spend(s,action.seat,action.ids);note(s,`${name(s,action.seat)}弃置 ${pending.count} 张手牌`);if(pending.mode!=='ganglie')enqueue(s,pending.continuation||{type:'turnEnd',seat:action.seat});return
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
    const processing=pending.kind==='blade'||pending.kind==='support'&&(!pending.returnPending||pending.returnPending.event?.type==='collateral')||pending.event?.type==='collateral'
    const cards=spend(s,action.seat,action.ids,processing);pending.usedIds=cards.map(c=>c.id);pending.color=cardColor(cards)
    pending.nature=slashNature(cards);pending.usedAs=options.find(o=>o.type==='respond'&&o.ids?.length===action.ids?.length&&o.ids.every(id=>action.ids.includes(id)))?.as||pending.as
    if(pending.usedAs==='sha'&&s.current===action.seat&&s.phase==='play')player(s,action.seat).marks.shaInPlay=true
    if(catalog.trackBattle&&pending.kind!=='axe'){s.lastResponse={id:s.eventId+1,cards:clone(cards),as:pending.usedAs,source:action.seat,forPlayed:s.lastPlayed?.id,turn:s.turns};if(s.exchange&&s.lastResponse.forPlayed===s.lastPlayed?.id)s.exchange.push({source:action.seat,cards:clone(cards),as:pending.usedAs})}
    note(s,`${name(s,action.seat)}${pending.kind==='axe'?'发动贯石斧':'打出'+CARDS[pending.as].name}`)
    if(pending.kind==='axe'){enqueue(s,{...pending.event,type:'attackDamage'});return}
    if(pending.kind==='counter') {
      pending.chain.negated=!pending.chain.negated;pending.chain.passes=0;enqueue(s,...(hasSkill(player(s,action.seat),'jizhi')?[{type:'jizhi',seat:action.seat}]:[]),{type:'counter',chain:pending.chain})
    } else successfulResponse(s,pending)
  }
}

function dispatch(state,action) {
  if(!state||state.phase==='finished')return {ok:false,error:'本局已经结束',state}
  if(!action||!Number.isInteger(action.seat)||!player(state,action.seat)?.alive)return {ok:false,error:'无效玩家',state}
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
    deckCount:s.deck.length,discardCount:s.discard.length,logs:clone(s.logs),lastEvent:clone(s.lastEvent),lastPlayed:clone(s.lastPlayed||null),suspicion:s.suspicion.slice(),
    ...(catalog.trackBattle?{lastResponse:clone(s.lastResponse||null),harvestPool:clone(s.harvestPool),exchange:clone(s.exchange||null)}:{}),
    players:s.players.map(p=>({seat:p.seat,heroId:p.heroId,hp:p.hp,maxHp:p.maxHp,alive:p.alive,handCount:p.hand.length,
      hand:p.seat===seat?clone(p.hand):[],role:s.teamMode||p.role==='lord'||p.seat===seat||!p.alive||s.phase==='finished'?p.role:null,
      equip:clone(p.equip),judgment:p.judgment.map(c=>publicDelay(p,c)),marks:clone(p.marks),
      ...(p.incarnation?{effectiveSkills:hero(p).skills.slice(),effectiveSex:hero(p).sex,effectiveFaction:hero(p).faction,incarnation:p.seat===seat?clone(p.incarnation):{activeHero:p.incarnation.activeHero,activeSkill:p.incarnation.activeSkill,count:p.incarnation.pool.length}}:{})})),
    pending:s.pending?{id:s.pending.id,kind:s.pending.kind,actor:s.pending.actor,as:s.pending.as,target:s.pending.target,source:s.pending.source,skill:s.pending.skill,remaining:s.pending.remaining,count:s.pending.count,
      negated:s.pending.chain?.negated,cardType:s.pending.chain?.cardType,requester:s.pending.requester,required:s.pending.required,reason:s.pending.reason,
      ...(catalog.trackBattle?{context:(()=>{const e=s.pending.event||s.pending.returnPending?.event;return e?{type:e.type,source:e.source,target:e.target,victim:e.victim,commandedBy:e.commandedBy}:null})()}: {}),
      ...(s.pending.kind==='reveal'?{card:clone(s.pending.card),delayType:s.pending.delayType,hit:s.pending.hit}:{})}:null,
    ...(s.pending?.kind==='judge-replace'?{judgmentCard:clone(s.pending.card),judgmentKind:s.pending.event.ctx.kind}:{}),
    ...(s.pending?.kind==='reveal'?{judgmentLabel:s.pending.label}:{}),
    ...(s.pending?.kind==='yiji'&&s.pending.actor===seat?{yijiIds:s.pending.ids.slice()}:{}),
    legal:clone(legalActions(s,seat))
  }
}
function allCards(s) {return s.deck.concat(s.discard,s.processing,s.harvestPool,...s.players.map(p=>ownedCards(p).concat(p.judgment)))}
const eventTypes=new Set(['turnStart','turnPrepare','incarnationOffer','xinshengOffer','drawPhase','playPhase','endPhase','turnEnd','finishCard','counter','gate','attack','attackDamage','duel','aoe','damage','postDamage','rescue','heal','draw','equipmentDraw','jizhi','take','harvest','harvestCleanup','collateral','delayed','judgeResult','judgeApply','delayCancelled','supportAsk','judgmentScan','judgmentComplete','luoshenAsk','yijiOffer','guanxingStart'])
const pendingKinds=new Set(['incarnation','response','rescue','counter','support','blade','axe','discard','choice','guess','pick','take','reveal','tuxi','judge-replace','yiji','guanxing','liuli'])
const validSeat=seat=>Number.isInteger(seat)&&seat>=0&&seat<8
function validEvent(event,depth=0) {
  if(!event||depth>8||!eventTypes.has(event.type))return false
  for(const key of ['seat','source','target','actor','victim','requester'])if(event[key]!=null&&!validSeat(event[key]))return false
  if(event.type==='incarnationOffer'&&!['initial','start','end'].includes(event.reason))return false
  if(event.type==='xinshengOffer'&&(!Number.isInteger(event.count)||event.count<1||event.count>8))return false
  if(event.effect&&!validEvent(event.effect,depth+1)||event.cancel&&!validEvent(event.cancel,depth+1)||event.event&&!validEvent(event.event,depth+1))return false
  if(event.type==='counter'&&(!event.chain||!validEvent(event.chain.effect,depth+1)))return false
  if(['judgmentScan','judgmentComplete'].includes(event.type)){
    const c=event.ctx;if(!c||!validSeat(c.owner)||!['indulgence','lightning','bagua','tieji','ganglie','luoshen'].includes(c.kind)||typeof c.judgeId!=='string')return false
    if(c.source!=null&&!validSeat(c.source)||c.attack&&!validEvent(c.attack,depth+1)||c.response&&!validPending(c.response,depth+1))return false
    if(event.type==='judgmentScan'&&(!Number.isInteger(event.cursor)||event.cursor<0||event.cursor>8))return false
  }
  return true
}
function validPending(p,depth=0) {
  if(!p||depth>3||!pendingKinds.has(p.kind)||!validSeat(p.actor)||!Number.isInteger(p.id)||p.id<1)return false
  for(const key of ['source','target','requester'])if(p[key]!=null&&!validSeat(p[key]))return false
  if(p.event&&!validEvent(p.event)||p.returnPending&&!validPending(p.returnPending,depth+1))return false
  if(['response','rescue','blade','axe','guess','take'].includes(p.kind)&&!validSeat(p.target))return false
  if(['response','rescue','counter','support','blade'].includes(p.kind)&&!['sha','shan','tao','nullify'].includes(p.as))return false
  if(p.kind==='response'&&(!p.event||!Number.isInteger(p.remaining)||p.remaining<1||p.remaining>2))return false
  if(p.kind==='counter'&&(!p.chain||!validEvent(p.chain.effect)||!CARDS[p.chain.cardType]||typeof p.chain.negated!=='boolean'||!validSeat(p.chain.cursor)||!Number.isInteger(p.chain.passes)))return false
  if(p.kind==='discard'&&(!Number.isInteger(p.count)||p.count<1||p.count>makeDeck().length))return false
  if(p.kind==='choice'&&(!Array.isArray(p.choices)||!p.choices.length||p.choices.length>5||p.choices.some(c=>typeof c.value!=='string'||typeof c.label!=='string')))return false
  if(p.kind==='choice'&&!['xinsheng','luoyi','yingzi','jizhi','jianxiong','tieji','dualsword','dualTarget','ice','bow','fan','xiaoji','lianying','biyue','tiandu','fankui','ganglie','luoshen','yiji'].includes(p.skill))return false
  if(p.kind==='choice'&&p.skill==='xinsheng'&&(!Number.isInteger(p.count)||p.count<1||p.count>8))return false
  if(p.kind==='incarnation'&&(typeof p.required!=='boolean'||!['initial','start','end'].includes(p.reason)||p.skill!=='huashen'))return false
  if(p.kind==='pick'&&(!Array.isArray(p.pool)||!p.pool.length||p.pool.length>8||p.pool.some(c=>!CARDS[c.type])))return false
  if(p.kind==='support'&&(!Array.isArray(p.candidates)||p.candidates.some(c=>!validSeat(c))||!validSeat(p.requester)))return false
  if(p.kind==='reveal'&&(!catalog.animatedJudgments||!['judgeApply','judgmentComplete'].includes(p.event?.type)||!['indulgence','lightning','tieji','bagua','ganglie','luoshen'].includes(p.delayType)||typeof p.hit!=='boolean'||!CARDS[p.card?.type]))return false
  if(p.kind==='judge-replace'&&(p.event?.type!=='judgmentScan'||p.card?.id!==p.event.ctx.judgeId))return false
  if(p.kind==='yiji'&&(!Array.isArray(p.ids)||p.ids.length<1||p.ids.length>2||new Set(p.ids).size!==p.ids.length||p.ids.some(id=>typeof id!=='string')))return false
  if(p.kind==='guanxing'&&(!Array.isArray(p.pool)||p.pool.length<1||p.pool.length>5||new Set(p.pool.map(c=>c.id)).size!==p.pool.length||p.pool.some(c=>!CARDS[c.type])))return false
  if(p.kind==='liuli'&&(p.event?.type!=='attack'||p.event.target!==p.actor))return false
  return true
}
function restoreGame(raw) {
  try {
    const s=typeof raw==='string'?JSON.parse(raw):clone(raw)
    if(!s||s.theme!==catalog.theme||s.version!==VERSION||!Array.isArray(s.players)||s.players.length<2||s.players.length>8||!Number.isInteger(s.current)||s.current<0||s.current>=s.players.length||!['play','resolve','finished'].includes(s.phase))return null
    if(![s.deck,s.discard,s.processing,s.harvestPool,s.queue,s.logs,s.suspicion].every(Array.isArray))return null
    if(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!Number.isInteger(s.revision)||s.revision<0||!Number.isInteger(s.promptId)||!Number.isInteger(s.eventId)||!Number.isInteger(s.turns)||s.turns<0)return null
    if(s.suspicion.length!==s.players.length||s.suspicion.some(n=>!Number.isFinite(n))||s.queue.length>512||s.queue.some(event=>!validEvent(event))||s.logs.some(line=>typeof line.text!=='string'))return null
    if(s.teamMode){
      // 对抗局：sides 与座位一一对应，两队都非空；不校验身份局角色分布。
      if(!Array.isArray(s.sides)||s.sides.length!==s.players.length||s.sides.some(x=>x!==0&&x!==1)||!s.sides.includes(0)||!s.sides.includes(1))return null
      if(new Set(s.players.map(p=>p.heroId)).size!==s.players.length)return null
    }else if(new Set(s.players.map(p=>p.heroId)).size!==s.players.length||s.players.filter(p=>p.role==='lord').length!==1||!s.players.some(p=>p.role==='rebel')||s.players.filter(p=>p.role==='renegade').length>1||s.players.some(p=>!['lord','loyal','rebel','renegade'].includes(p.role)))return null
    for(const p of s.players)if(!HERO_BY_ID[p.heroId]||p.seat!==s.players.indexOf(p)||!Number.isInteger(p.hp)||p.hp>p.maxHp||p.hp< -4||typeof p.alive!=='boolean'||p.maxHp!==hero(p).hp+(s.teamMode?0:(p.role==='lord'?1:0))||!Array.isArray(p.hand)||!Array.isArray(p.judgment)||!p.equip||!p.marks)return null
    if(s.players.some(p=>!validIncarnation(catalog,p)))return null
    if(s.players.some(p=>p.incarnation&&(s.phase==='play'&&!p.incarnation.activeHero||p.incarnation.pool.some(id=>s.players.some(other=>other.alive&&other.heroId===id)))))return null
    if(s.pending?.kind==='incarnation'&&(!player(s,s.pending.actor).incarnation?.pool.length||s.pending.required!==!player(s,s.pending.actor).incarnation.activeHero))return null
    if(s.deckVersion!=null&&s.deckVersion!==catalog.deckVersion)return null
    const definitions=s.deckVersion==null&&catalog.legacyMakeDeck?catalog.legacyMakeDeck():makeDeck()
    const canonical=new Map(definitions.map(c=>[c.id,c])),cards=allCards(s)
    if(cards.length!==canonical.size||new Set(cards.map(c=>c.id)).size!==canonical.size||cards.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))))return null
    if(s.pending&&(!validPending(s.pending)||!player(s,s.pending.actor)?.alive))return null
    if(s.pending?.kind==='pick'&&s.pending.pool.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))||!s.harvestPool.some(card=>card.id===c.id)))return null
    if(s.pending?.kind==='reveal'){
      const e=s.pending.event,id=e.type==='judgmentComplete'?e.ctx.judgeId:e.judgeId
      if(JSON.stringify(s.pending.card)!==JSON.stringify(canonical.get(id)))return null
      if(e.type==='judgmentComplete'&&!s.processing.some(c=>c.id===id))return null
      if(e.type==='judgeApply'&&(!s.processing.some(c=>c.id===e.cardId&&c.type===s.pending.delayType)||!s.discard.some(c=>c.id===id)))return null
    }
    if(s.pending?.kind==='judge-replace'&&(!s.processing.some(c=>c.id===s.pending.card.id)||JSON.stringify(s.pending.card)!==JSON.stringify(canonical.get(s.pending.card.id))))return null
    if(s.pending?.kind==='yiji'&&s.pending.ids.some(id=>!player(s,s.pending.actor).hand.some(c=>c.id===id)))return null
    if(s.pending?.kind==='guanxing'&&s.pending.pool.some(c=>!s.processing.some(p=>p.id===c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))))return null
    for(const p of s.players)if(p.virtualJudgments&&Object.entries(p.virtualJudgments).some(([id,type])=>type!=='indulgence'||!p.judgment.some(c=>c.id===id&&c.suit==='diamond')))return null
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
