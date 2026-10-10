import * as defaultCatalog from './catalog.mjs'

export const VERSION = 1
// Each instance closes over its own catalog. Themes never mutate the public
// classic roster, and its saves continue to use the unmodified default engine.
export function createEngine(catalog = defaultCatalog) {
const { CARDS, HEROES, HERO_BY_ID, isRed, makeDeck } = catalog
const clone = value => JSON.parse(JSON.stringify(value))
const slots = ['weapon', 'armor', 'offenseHorse', 'defenseHorse']
const hero = p => HERO_BY_ID[p.heroId]
const hasSkill = (p, skill) => hero(p).skills.includes(skill)
const aliveSeats = s => s.players.filter(p => p.alive).map(p => p.seat)
const player = (s, seat) => s.players[seat]
const name = (s, seat) => seat == null ? '天灾' : hero(player(s, seat)).name
const enqueue = (s, ...events) => s.queue.unshift(...events)
const note = (s, text, cue=null) => { s.logs.unshift({ id: ++s.eventId, text, ...(cue?{cue}:{}) }); s.logs = s.logs.slice(0, 80) }
const autoSkill = skill => catalog.automaticSkills?.includes(skill)
const announceSkill = (s,seat,skill) => note(s,`${name(s,seat)}自动发动${catalog.skillNames?.[skill]||skill}`,{kind:'skill',seat,skill})
function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296 }
function shuffle(s, cards) { const out = cards.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [out[i],out[j]] = [out[j],out[i]] } return out }
function orderFrom(s, start) { return Array.from({ length: 5 }, (_, i) => (start + i) % 5).filter(seat => player(s, seat).alive) }
function nextAlive(s, seat) { return orderFrom(s, (seat + 1) % 5)[0] }
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
function removeOwned(p, id) {
  const index = p.hand.findIndex(c => c.id === id)
  if (index >= 0) return p.hand.splice(index, 1)[0]
  const slot = slots.find(slot => p.equip[slot]?.id === id)
  if (slot) { const card = p.equip[slot]; p.equip[slot] = null; return card }
  throw new Error('请选择自己的牌')
}
function spend(s, seat, ids, processing = false) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error('牌不能重复选择')
  const cards = ids.map(id => removeOwned(player(s, seat), id))
  ;(processing ? s.processing : s.discard).push(...cards)
  return cards
}
function finishCards(s, ids) {
  for (const id of ids) { const i = s.processing.findIndex(c => c.id === id); if (i >= 0) s.discard.push(...s.processing.splice(i, 1)) }
}
function cardColor(cards) { return cards.every(isRed) ? 'red' : cards.every(c => !isRed(c)) ? 'black' : 'none' }
function remember(s, cards, label, source, targets, as) { s.lastEvent = { id: s.eventId + 1, cards: clone(cards), label, source, targets: targets.slice(), ...(catalog.trackBattle?{as,turn:s.turns}:{}) }; s.lastPlayed = clone(s.lastEvent) }
function suspect(s, source, target, hostile) {
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
function canConvert(p, cards, as) {
  if (cards.length === 1 && p.hand.some(c => c.id === cards[0].id) && cards[0].type === as) return true
  if (cards.length === 1 && as === 'sha' && hasSkill(p,'wusheng') && isRed(cards[0])) return true
  if (cards.length === 1 && hasSkill(p,'longdan') && p.hand.some(c => c.id === cards[0].id)
    && (as === 'sha' && cards[0].type === 'shan' || as === 'shan' && cards[0].type === 'sha')) return true
  return as === 'sha' && cards.length === 2 && p.equip.weapon?.type === 'spear' && cards.every(card => p.hand.some(c => c.id === card.id))
}
function selectedCards(s, seat, ids) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return []
  const owned = ownedCards(player(s, seat))
  const cards = ids.map(id => owned.find(c => c.id === id))
  return cards.every(Boolean) ? cards : []
}
function targetCardCount(p) { return ownedCards(p).length + p.judgment.length }
function targetsFor(s, seat, as, ids = []) {
  const p = player(s, seat), others = aliveSeats(s).filter(t => t !== seat)
  if (as === 'sha') return others.filter(t => distance(s, seat, t, ids) <= attackRange(s, seat, ids))
  if (as === 'snatch') return others.filter(t => targetCardCount(player(s,t)) && (hasSkill(p,'qicai') || distance(s,seat,t,ids) <= 1))
  if (as === 'dismantle') return others.filter(t => targetCardCount(player(s,t)))
  if (as === 'duel') return others
  if (as === 'indulgence') return others.filter(t => !player(s,t).judgment.some(c => c.type === as))
  if (as === 'collateral') return others.filter(t => player(s,t).equip.weapon && aliveSeats(s).some(v => v !== t && distance(s,t,v) <= attackRange(s,t)))
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
function conversions(p, as) {
  const out = ownedCards(p).filter(c => canConvert(p,[c],as)).map(c => ({ ids: [c.id], as }))
  if (as === 'sha' && p.equip.weapon?.type === 'spear') out.push(...combinations(p.hand.map(c => c.id),2).map(ids => ({ids,as})))
  return out
}
function makePending(s, value) { s.pending = { source:value.event?.source, target:value.event?.target, ...value, id: ++s.promptId } }
function supportCandidates(s, seat, as) {
  const p = player(s,seat), skill = as === 'sha' ? 'jijiang' : 'hujia', faction = as === 'sha' ? 'shu' : 'wei'
  return p.role === 'lord' && hasSkill(p,skill) ? orderFrom(s,(seat+1)%5).filter(other => other !== seat && hero(player(s,other)).faction === faction) : []
}
function responseOptions(s, pending) {
  const p = player(s,pending.actor), opts = []
  if(pending.kind==='reveal')return [{type:'ack'}]
  if (pending.kind === 'response' || pending.kind === 'support' || pending.kind === 'rescue' || pending.kind === 'counter' || pending.kind === 'blade') {
    const as = pending.as
    opts.push(...conversions(p,as).map(c => ({ ...c, type: 'respond' })))
    if (as === 'shan' && p.equip.armor?.type === 'bagua' && !pending.ignoreArmor && !pending.baguaTried) opts.push({ type:'bagua' })
    if (pending.kind === 'response' && !pending.supportTried && supportCandidates(s,pending.actor,as).length) opts.push({ type:'support' })
  } else if (pending.kind === 'discard') opts.push({ type:'discard', count:pending.count })
  else if (pending.kind === 'choice') opts.push(...pending.choices.map(choice => ({ type:'choose', value:choice.value, label:choice.label })))
  else if (pending.kind === 'guess') opts.push(...Object.keys({spade:1,heart:1,club:1,diamond:1}).map(value => ({type:'choose',value})))
  else if (pending.kind === 'pick') opts.push(...pending.pool.map(c => ({type:'choose',value:c.id,card:clone(c)})))
  else if (pending.kind === 'take') {
    const target = player(s,pending.target)
    if (catalog.individualHandChoices) opts.push(...target.hand.map((_,index)=>({type:'choose',value:`hand:${index}`,label:`手牌 ${index+1}`,zone:'hand',hidden:true})))
    else if (target.hand.length) opts.push({type:'choose',value:'hand',label:`随机手牌（${target.hand.length} 张）`})
    for (const slot of slots) if (target.equip[slot]) opts.push({type:'choose',value:target.equip[slot].id,card:clone(target.equip[slot]),zone:'equipment'})
    if (!pending.equipmentOnly) opts.push(...target.judgment.map(c=>({type:'choose',value:c.id,card:clone(c),zone:'judgment'})))
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
  const p = player(s,seat), uses = p.hand.filter(c=>!['sha','shan','nullify'].includes(c.type)).map(c=>({ids:[c.id],as:c.type}))
  uses.push(...conversions(p,'sha'))
  const actions = []
  for (const use of uses) {
    if (use.as === 'sha' && p.marks.sha >= 1 && !unlimited(p,use.ids)) continue
    if (use.as === 'tao' && p.hp >= p.maxHp || use.as === 'lightning' && p.judgment.some(c=>c.type==='lightning')) continue
    const targets = targetsFor(s,seat,use.as,use.ids)
    if (['sha','duel','snatch','dismantle','indulgence'].includes(use.as)) {
      for (const chosen of combinations(targets,1,use.as==='sha'?maxTargets(s,seat,use.ids):1)) actions.push({type:'play',...use,targets:chosen})
    } else if (use.as === 'collateral') {
      for (const holder of targets) for (const victim of aliveSeats(s).filter(v=>v !== holder && distance(s,holder,v)<=attackRange(s,holder))) actions.push({type:'play',...use,targets:[holder,victim]})
    } else actions.push({type:'play',...use,targets:[]})
  }
  for (const skill of ['rende','zhiheng','kurou','fanjian']) if (hasSkill(p,skill) && !(['zhiheng','fanjian'].includes(skill) && p.marks[skill]) && (skill !== 'fanjian' && skill !== 'rende' || p.hand.length)) actions.push({type:'skill',skill})
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
function createAssignedGame({roles,heroIds,seed=Date.now()>>>0}) {
  const counts={lord:1,loyal:1,rebel:2,renegade:1}
  if(!Array.isArray(roles)||roles.length!==5||Object.entries(counts).some(([r,n])=>roles.filter(x=>x===r).length!==n))throw new Error('身份配置无效')
  if(!Array.isArray(heroIds)||heroIds.length!==5||new Set(heroIds).size!==5||heroIds.some(id=>!HERO_BY_ID[id]))throw new Error('武将配置无效或重复')
  const assigned=roles.slice(),heroes=heroIds.map(id=>HERO_BY_ID[id])
  const s = { version:VERSION, seed:seed>>>0, revision:0, phase:'resolve', current:0, turns:0, players:[], deck:[], discard:[], processing:[], harvestPool:[], queue:[], pending:null, logs:[], eventId:0, promptId:0, suspicion:[0,0,0,0,0], winner:null, lastEvent:null }
  s.players = heroes.map((h,seat)=>({seat,heroId:h.id,role:assigned[seat],hp:h.hp+(assigned[seat]==='lord'?1:0),maxHp:h.hp+(assigned[seat]==='lord'?1:0),alive:true,hand:[],equip:Object.fromEntries(slots.map(slot=>[slot,null])),judgment:[],marks:{sha:0}}))
  s.deck = shuffle(s,makeDeck()); s.players.forEach(p=>draw(s,p.seat,4))
  s.current = assigned.indexOf('lord'); note(s, `${name(s,s.current)}担任主公，五人身份局开始`)
  s.queue.push({type:'turnStart',seat:s.current}); settle(s); return s
}
function winCheck(s) {
  const alive = s.players.filter(p=>p.alive), lord = s.players.find(p=>p.role==='lord')
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
  s.discard.push(...p.hand.splice(0),...p.judgment.splice(0))
  for (const slot of slots) if (p.equip[slot]) {s.discard.push(p.equip[slot]);p.equip[slot]=null}
  note(s,`${name(s,seat)}阵亡，身份为${{lord:'主公',loyal:'忠臣',rebel:'反贼',renegade:'内奸'}[p.role]}`)
  if (winCheck(s)) return
  if (source!=null && player(s,source).alive) {
    if (p.role==='rebel') draw(s,source,3)
    if (p.role==='loyal' && player(s,source).role==='lord') {
      const killer=player(s,source); s.discard.push(...killer.hand.splice(0))
      for(const slot of slots) if(killer.equip[slot]) {s.discard.push(killer.equip[slot]);killer.equip[slot]=null}
      note(s,'主公误杀忠臣，弃置所有手牌与装备')
    }
  }
}
function openRescue(s, context) {
  const p=player(s,context.target)
  if(!p.alive||p.hp>0)return
  const order=context.order||orderFrom(s,s.current)
  const cursor=context.cursor||0
  for(let i=cursor;i<order.length;i++) if(player(s,order[i]).alive && conversions(player(s,order[i]),'tao').length) {
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
function gate(s, effect, cardType, source, target, cancel=null) { enqueue(s,{type:'counter',chain:{effect,cardType,source,target,cancel,cursor:(s.current+4)%5,passes:0,negated:false}}) }
function takeCard(s, pending, choice) {
  const target=player(s,pending.target)
  let card
  if(choice==='hand') { if(!target.hand.length)throw new Error('对方已没有手牌');card=target.hand.splice(Math.floor(random(s)*target.hand.length),1)[0] }
  else if(catalog.individualHandChoices&&/^hand:\d+$/.test(choice)) {
    const index=Number(choice.slice(5));if(index>=target.hand.length)throw new Error('这张暗手牌已不可选')
    card=target.hand.splice(index,1)[0]
  }
  else if(target.judgment.some(c=>c.id===choice) && !pending.equipmentOnly) card=target.judgment.splice(target.judgment.findIndex(c=>c.id===choice),1)[0]
  else card=removeOwned(target,choice)
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
  if(!event.prepared && attacker.equip.weapon?.type==='dualsword' && hero(attacker).sex!==hero(defender).sex) {
    makePending(s,{kind:'choice',actor:event.source,skill:'dualsword',event,choices:[{value:'yes',label:'发动双股剑'},{value:'no',label:'直接出杀'}]});return
  }
  if(!event.ironChecked && hasSkill(attacker,'tieji')) {
    if(autoSkill('tieji')){announceSkill(s,event.source,'tieji');choice(s,{actor:event.source,skill:'tieji',event,choices:[{value:'yes'}]},'yes');return}
    makePending(s,{kind:'choice',actor:event.source,skill:'tieji',event,choices:[{value:'yes',label:'发动铁骑'},{value:'no',label:'不发动'}]});return
  }
  // Target-declaration triggers happen before an armor effect stops this Slash.
  if(!event.ignoreArmor && defender.equip.armor?.type==='renwang' && event.color==='black') {note(s,`${name(s,event.target)}的仁王盾挡下黑色杀`,catalog.trackBattle?{kind:'blocked',source:event.source,target:event.target}:null);return}
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
  enqueue(s,{type:'damage',source:event.source,target:event.target,amount:1+(attacker.marks.naked&&s.current===event.source?1:0),cardIds:event.cardIds})
}
function dodgeComplete(s,event) {
  note(s,`${name(s,event.target)}闪过了杀`,catalog.trackBattle?{kind:'dodge',source:event.source,target:event.target}:null)
  const weapon=player(s,event.source).equip.weapon?.type
  if(weapon==='axe')makePending(s,{kind:'axe',actor:event.source,source:event.source,target:event.target,event})
  else if(weapon==='blade' && conversions(player(s,event.source),'sha').length && distance(s,event.source,event.target)<=attackRange(s,event.source))makePending(s,{kind:'blade',actor:event.source,as:'sha',source:event.source,target:event.target,event})
}
function delayed(s,event) {
  const p=player(s,event.target), card=p.judgment.find(c=>c.id===event.cardId)
  if(!p.alive||!card)return
  gate(s,{type:'judgeResult',target:event.target,cardId:card.id},card.type,event.target,event.target,{type:'delayCancelled',target:event.target,cardId:card.id})
}
function passLightning(s,seat,card) {
  const next=nextAlive(s,seat)
  if(next!=null && next!==seat && !player(s,next).judgment.some(c=>c.type==='lightning')) {player(s,next).judgment.push(card);note(s,`闪电流向${name(s,next)}`)}
  else s.discard.push(card)
}
function applyJudgment(s,target,card,judge){
  const p=player(s,target)
  if(card.type==='indulgence'){s.discard.push(card);if(judge.suit!=='heart')p.marks.skipPlay=true}
  else if(judge.suit==='spade'&&judge.rank>=2&&judge.rank<=9){s.discard.push(card);enqueue(s,{type:'damage',source:null,target,amount:3,cardIds:[card.id]})}
  else passLightning(s,target,card)
}
function settleEvent(s,event) {
  switch(event.type) {
    case 'turnStart': {
      const p=player(s,event.seat); if(!p.alive){enqueue(s,{type:'turnEnd',seat:event.seat});break}
      s.current=event.seat;s.turns++;s.phase='resolve';p.marks={sha:0,rende:0};note(s,`第 ${s.turns} 回合 · ${name(s,event.seat)}`)
      enqueue(s,...p.judgment.slice().reverse().map(c=>({type:'delayed',target:event.seat,cardId:c.id})),{type:'drawPhase',seat:event.seat},{type:'playPhase',seat:event.seat});break
    }
    case 'drawPhase': {
      const p=player(s,event.seat);if(!p.alive)break
      if(hasSkill(p,'yingzi')&&autoSkill('yingzi')&&!hasSkill(p,'luoyi')){announceSkill(s,event.seat,'yingzi');draw(s,event.seat,3)}
      else if(hasSkill(p,'luoyi')||hasSkill(p,'yingzi'))makePending(s,{kind:'choice',actor:event.seat,skill:hasSkill(p,'luoyi')?'luoyi':'yingzi',choices:[{value:'yes',label:hasSkill(p,'luoyi')?'裸衣：少摸一张，增强伤害':'英姿：额外摸一张'},{value:'no',label:'正常摸两张'}]})
      else draw(s,event.seat,2);break
    }
    case 'playPhase': if(!player(s,event.seat).alive||player(s,event.seat).marks.skipPlay)enqueue(s,{type:'endPhase',seat:event.seat});else s.phase='play';break
    case 'endPhase': {
      const p=player(s,event.seat);s.phase='resolve'
      if(p.alive && p.hand.length>Math.max(0,p.hp))makePending(s,{kind:'discard',actor:event.seat,count:p.hand.length-Math.max(0,p.hp)})
      else enqueue(s,{type:'turnEnd',seat:event.seat});break
    }
    case 'turnEnd': enqueue(s,{type:'turnStart',seat:nextAlive(s,event.seat)});break
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
    case 'aoe': if(player(s,event.target).alive)makePending(s,{kind:'response',actor:event.target,as:event.as,source:event.source,target:event.target,remaining:1,event,ignoreArmor:false,baguaTried:false});break
    case 'damage': {
      const p=player(s,event.target);if(!p.alive)break
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
      }break
    }
    case 'rescue': openRescue(s,event);break
    case 'heal': if(player(s,event.target).alive){heal(s,event.target,1);suspect(s,event.source,event.target,false)}break
    case 'draw': draw(s,event.target,event.count,event.cause);break
    case 'jizhi':
      if(!player(s,event.seat).alive)break
      if(autoSkill('jizhi')){announceSkill(s,event.seat,'jizhi');draw(s,event.seat,1)}
      else makePending(s,{kind:'choice',actor:event.seat,skill:'jizhi',choices:[{value:'yes',label:'集智：摸一张'},{value:'no',label:'不发动'}]});break
    case 'take': if(targetCardCount(player(s,event.target)))makePending(s,{...event,kind:'take',actor:event.actor??event.source});break
    case 'harvest': {
      if(!player(s,event.target).alive||!s.harvestPool.length)break
      makePending(s,{kind:'pick',actor:event.target,pool:clone(s.harvestPool)});break
    }
    case 'harvestCleanup': s.discard.push(...s.harvestPool.splice(0));break
    case 'collateral': if(player(s,event.target).alive&&player(s,event.victim).alive&&player(s,event.target).equip.weapon)makePending(s,{kind:'response',actor:event.target,as:'sha',source:event.source,target:event.victim,remaining:1,event});break
    case 'delayed': delayed(s,event);break
    case 'judgeResult': {
      const p=player(s,event.target),index=p.judgment.findIndex(c=>c.id===event.cardId);if(index<0||!p.alive)break
      const card=p.judgment.splice(index,1)[0], judge=topCard(s)
      if(!judge){s.discard.push(card);break}s.discard.push(judge);note(s,`${name(s,event.target)}判定 ${CARDS[card.type].name}：${{spade:'♠',heart:'♥',club:'♣',diamond:'♦'}[judge.suit]}${judge.rank}`)
      if(catalog.animatedJudgments){
        s.processing.push(card)
        const hit=card.type==='indulgence'?judge.suit!=='heart':judge.suit==='spade'&&judge.rank>=2&&judge.rank<=9
        makePending(s,{kind:'reveal',actor:event.target,target:event.target,card:clone(judge),delayType:card.type,hit,event:{type:'judgeApply',target:event.target,cardId:card.id,judgeId:judge.id}})
      }else applyJudgment(s,event.target,card,judge)
      break
    }
    case 'judgeApply': {
      const i=s.processing.findIndex(c=>c.id===event.cardId),judge=s.discard.find(c=>c.id===event.judgeId)
      if(i<0||!judge)throw new Error('判定牌已变化')
      const card=s.processing.splice(i,1)[0];applyJudgment(s,event.target,card,judge);break
    }
    case 'delayCancelled': {
      const p=player(s,event.target),i=p.judgment.findIndex(c=>c.id===event.cardId);if(i<0)break
      const card=p.judgment.splice(i,1)[0];if(card.type==='lightning')passLightning(s,event.target,card);else s.discard.push(card);break
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
    const target=player(s,pending.target),amount=target.role==='lord'&&hasSkill(target,'jiuyuan')&&pending.actor!==pending.target&&hero(player(s,pending.actor)).faction==='wu'?2:1
    heal(s,pending.target,amount);suspect(s,pending.actor,pending.target,false)
    if(target.hp<=0)enqueue(s,{type:'rescue',...pending});return
  }
  if(pending.kind==='support') {
    if(pending.returnPending) { const original=pending.returnPending;original.supportTried=true;original.usedIds=pending.usedIds;original.color=pending.color;successfulResponse(s,original) }
    else {const source=pending.requester;player(s,source).marks.jijiangTried=false;player(s,source).marks.sha++;enqueue(s,{type:'attack',source,target:pending.target,cardIds:pending.usedIds,color:pending.color,ignoreArmor:player(s,source).equip.weapon?.type==='qinggang'},{type:'finishCard',ids:pending.usedIds})}
    return
  }
  if(pending.kind==='blade') {enqueue(s,{type:'attack',source:pending.actor,target:pending.target,cardIds:pending.usedIds,color:pending.color,ignoreArmor:player(s,pending.actor).equip.weapon?.type==='qinggang'},{type:'finishCard',ids:pending.usedIds});return}
  if(--pending.remaining>0) {pending.baguaTried=false;pending.supportTried=false;makePending(s,pending);return}
  const event=pending.event
  if(event.type==='attack')dodgeComplete(s,event)
  else if(event.type==='duel')enqueue(s,{...event,actor:pending.actor===event.source?event.target:event.source})
  else if(event.type==='collateral')enqueue(s,{type:'attack',source:pending.actor,target:pending.target,cardIds:pending.usedIds,color:pending.color,ignoreArmor:player(s,pending.actor).equip.weapon?.type==='qinggang',...(catalog.trackBattle?{commandedBy:event.source}:{})},{type:'finishCard',ids:pending.usedIds})
}
function failedResponse(s,pending) {
  if(pending.kind==='rescue')enqueue(s,{type:'rescue',...pending,cursor:pending.cursor+1})
  else if(pending.kind==='counter'){pending.chain.passes++;enqueue(s,{type:'counter',chain:pending.chain})}
  else if(pending.kind==='support')enqueue(s,{type:'supportAsk',...pending,cursor:pending.cursor+1})
  else if(pending.kind==='axe'||pending.kind==='blade')return
  else if(pending.kind==='response') {
    const event=pending.event
    if(event.type==='attack')enqueue(s,{...event,type:'attackDamage'})
    else if(event.type==='collateral') {
      const holder=player(s,pending.actor),weapon=holder.equip.weapon
      if(weapon){holder.equip.weapon=null;player(s,event.source).hand.push(weapon);note(s,`${name(s,event.source)}获得了${CARDS[weapon.type].name}`)}
    } else enqueue(s,{type:'damage',source:pending.source,target:pending.actor,amount:1+(event.type==='duel'&&player(s,pending.source).marks.naked&&s.current===pending.source?1:0),cardIds:event.cardIds})
  }
}
function choice(s,pending,value) {
  const p=player(s,pending.actor),event=pending.event
  if(!pending.choices.some(c=>c.value===value))throw new Error('请选择有效选项')
  if(pending.skill==='luoyi'){p.marks.naked=value==='yes';draw(s,pending.actor,value==='yes'?1:2)}
  else if(pending.skill==='yingzi')draw(s,pending.actor,value==='yes'?3:2)
  else if(pending.skill==='jizhi'&&value==='yes')draw(s,pending.actor,1)
  else if(pending.skill==='jianxiong'&&value==='yes') {
    for(const id of pending.ids)for(const zone of [s.processing,s.discard]) {const index=zone.findIndex(c=>c.id===id);if(index>=0)p.hand.push(...zone.splice(index,1))}
    note(s,`${name(s,pending.actor)}发动奸雄收回牌`)
  } else if(pending.skill==='tieji') {
    event.ironChecked=true
    if(value==='yes'){const judge=topCard(s);if(judge){s.discard.push(judge);event.unavoidable=isRed(judge);note(s,`铁骑判定${isRed(judge)?'红色，不能闪避':'黑色，可正常响应'}`)}}
    enqueue(s,event)
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
    if(value!=='no'&&player(s,event.target).equip[value])s.discard.push(removeOwned(player(s,event.target),player(s,event.target).equip[value].id))
    enqueue(s,{...event,type:'attackDamage',bowChecked:true})
  }
}
function playCard(s,action) {
  const seat=action.seat,p=player(s,seat),cards=selectedCards(s,seat,action.ids),as=action.as||cards[0]?.type,targets=action.targets||[]
  const available=legalActions(s,seat).find(option=>option.type==='play'&&option.as===as&&option.ids.length===action.ids?.length&&option.ids.every(id=>action.ids.includes(id))&&option.targets.length===targets.length&&option.targets.every((t,i)=>as==='collateral'?t===targets[i]:targets.includes(t)))
  if(!available||!canConvert(p,cards,as))throw new Error('这张牌当前不能这样使用，请检查目标与距离')
  const used=spend(s,seat,action.ids,true),ids=used.map(c=>c.id),def=CARDS[as]
  remember(s,used,def.name,seat,targets,as);note(s,`${name(s,seat)}使用${def.name}${targets.length?' → '+targets.map(t=>name(s,t)).join('、'):''}`)
  if(def.category==='equip') {
    if(p.equip[def.slot])s.discard.push(p.equip[def.slot]);p.equip[def.slot]=used[0];s.processing=s.processing.filter(c=>c.id!==used[0].id);return
  }
  if(def.category==='delay') {
    const target=as==='lightning'?seat:targets[0];player(s,target).judgment.push(used[0]);s.processing=s.processing.filter(c=>c.id!==used[0].id);return
  }
  const events=[]
  if(as==='sha'){p.marks.sha++;events.push(...targets.map(target=>({type:'attack',source:seat,target,cardIds:ids,color:cardColor(used),ignoreArmor:p.equip.weapon?.type==='qinggang'})))}
  else if(as==='tao')events.push({type:'heal',source:seat,target:seat})
  else {
    if(hasSkill(p,'jizhi'))events.push({type:'jizhi',seat})
    const targetOrder=['draw'].includes(as)?[seat]:['savage','arrows'].includes(as)?orderFrom(s,(seat+1)%5).filter(t=>t!==seat):['garden','harvest'].includes(as)?orderFrom(s,seat):[targets[0]]
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
    suspect(s,action.seat,target,false);note(s,`${name(s,action.seat)}以仁德交给${name(s,target)} ${ids.length} 张牌`)
  } else if(skill==='zhiheng') {
    if(!ids.length)throw new Error('制衡至少选择一张手牌或装备')
    spend(s,action.seat,ids);p.marks.zhiheng=true;draw(s,action.seat,ids.length)
  } else if(skill==='kurou') {
    p.hp--;note(s,`${name(s,action.seat)}发动苦肉，失去一点体力`);enqueue(s,{type:'rescue',target:action.seat,source:null},{type:'draw',target:action.seat,count:2})
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
  if(action.type==='ack'){enqueue(s,pending.event);return}
  if(action.type==='pass'){if(pending.kind==='choice')choice(s,pending,pending.choices[pending.choices.length-1].value);else failedResponse(s,pending);return}
  if(action.type==='discard') {
    if(action.ids?.length!==pending.count||!action.ids.every(id=>player(s,action.seat).hand.some(c=>c.id===id)))throw new Error(`请弃置 ${pending.count} 张手牌`)
    spend(s,action.seat,action.ids);note(s,`${name(s,action.seat)}弃置 ${pending.count} 张手牌`);enqueue(s,pending.continuation||{type:'turnEnd',seat:action.seat});return
  }
  if(action.type==='choose') {
    if(pending.kind==='choice')choice(s,pending,action.value)
    if(pending.kind==='guess') {
      const source=player(s,pending.source);if(!source.hand.length)return
      const card=source.hand.splice(Math.floor(random(s)*source.hand.length),1)[0];player(s,pending.actor).hand.push(card)
      note(s,`反间揭晓：${{spade:'♠',heart:'♥',club:'♣',diamond:'♦'}[card.suit]}${CARDS[card.type].name}`)
      if(card.suit!==action.value)enqueue(s,{type:'damage',source:pending.source,target:pending.actor,amount:1,cardIds:[]})
    }
    if(pending.kind==='pick'){const index=s.harvestPool.findIndex(c=>c.id===action.value);if(index<0)throw new Error('该牌已被选走');const [card]=s.harvestPool.splice(index,1);player(s,pending.actor).hand.push(card);note(s,`${name(s,pending.actor)}从五谷丰登选择了一张牌`,catalog.trackBattle?{kind:'harvest-pick',source:pending.actor,card:clone(card),playedId:s.lastPlayed?.id}:null)}
    if(pending.kind==='take')takeCard(s,pending,action.value)
    return
  }
  if(action.type==='support'){pending.supportTried=true;enqueue(s,{type:'supportAsk',requester:pending.actor,as:pending.as,returnPending:pending});return}
  if(action.type==='bagua') {
    pending.baguaTried=true;const judge=topCard(s)
    if(judge){s.discard.push(judge);note(s,`${name(s,pending.actor)}八卦判定${isRed(judge)?'成功':'失败'}`)}
    if(judge&&isRed(judge))successfulResponse(s,pending);else makePending(s,pending);return
  }
  if(action.type==='respond') {
    const processing=pending.kind==='blade'||pending.kind==='support'&&(!pending.returnPending||pending.returnPending.event?.type==='collateral')||pending.event?.type==='collateral'
    const cards=spend(s,action.seat,action.ids,processing);pending.usedIds=cards.map(c=>c.id);pending.color=cardColor(cards)
    if(catalog.trackBattle&&pending.kind!=='axe')s.lastResponse={id:s.eventId+1,cards:clone(cards),as:pending.as,source:action.seat,forPlayed:s.lastPlayed?.id,turn:s.turns}
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
    version:s.version,revision:s.revision,phase:s.phase,current:s.current,turns:s.turns,winner:s.winner,seat,
    deckCount:s.deck.length,discardCount:s.discard.length,logs:clone(s.logs),lastEvent:clone(s.lastEvent),lastPlayed:clone(s.lastPlayed||null),suspicion:s.suspicion.slice(),
    ...(catalog.trackBattle?{lastResponse:clone(s.lastResponse||null),harvestPool:clone(s.harvestPool)}:{}),
    players:s.players.map(p=>({seat:p.seat,heroId:p.heroId,hp:p.hp,maxHp:p.maxHp,alive:p.alive,handCount:p.hand.length,
      hand:p.seat===seat?clone(p.hand):[],role:p.role==='lord'||p.seat===seat||!p.alive||s.phase==='finished'?p.role:null,
      equip:clone(p.equip),judgment:clone(p.judgment),marks:clone(p.marks)})),
    pending:s.pending?{id:s.pending.id,kind:s.pending.kind,actor:s.pending.actor,as:s.pending.as,target:s.pending.target,source:s.pending.source,skill:s.pending.skill,remaining:s.pending.remaining,count:s.pending.count,
      negated:s.pending.chain?.negated,cardType:s.pending.chain?.cardType,requester:s.pending.requester,
      ...(catalog.trackBattle?{context:(()=>{const e=s.pending.event||s.pending.returnPending?.event;return e?{type:e.type,source:e.source,target:e.target,victim:e.victim,commandedBy:e.commandedBy}:null})()}: {}),
      ...(s.pending.kind==='reveal'?{card:clone(s.pending.card),delayType:s.pending.delayType,hit:s.pending.hit}:{})}:null,
    legal:clone(legalActions(s,seat))
  }
}
function allCards(s) {return s.deck.concat(s.discard,s.processing,s.harvestPool,...s.players.map(p=>ownedCards(p).concat(p.judgment)))}
const eventTypes=new Set(['turnStart','drawPhase','playPhase','endPhase','turnEnd','finishCard','counter','gate','attack','attackDamage','duel','aoe','damage','postDamage','rescue','heal','draw','jizhi','take','harvest','harvestCleanup','collateral','delayed','judgeResult','judgeApply','delayCancelled','supportAsk'])
const pendingKinds=new Set(['response','rescue','counter','support','blade','axe','discard','choice','guess','pick','take','reveal'])
const validSeat=seat=>Number.isInteger(seat)&&seat>=0&&seat<5
function validEvent(event,depth=0) {
  if(!event||depth>8||!eventTypes.has(event.type))return false
  for(const key of ['seat','source','target','actor','victim','requester'])if(event[key]!=null&&!validSeat(event[key]))return false
  if(event.effect&&!validEvent(event.effect,depth+1)||event.cancel&&!validEvent(event.cancel,depth+1)||event.event&&!validEvent(event.event,depth+1))return false
  if(event.type==='counter'&&(!event.chain||!validEvent(event.chain.effect,depth+1)))return false
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
  if(p.kind==='discard'&&(!Number.isInteger(p.count)||p.count<1||p.count>108))return false
  if(p.kind==='choice'&&(!Array.isArray(p.choices)||!p.choices.length||p.choices.length>5||p.choices.some(c=>typeof c.value!=='string'||typeof c.label!=='string')))return false
  if(p.kind==='choice'&&!['luoyi','yingzi','jizhi','jianxiong','tieji','dualsword','dualTarget','ice','bow'].includes(p.skill))return false
  if(p.kind==='pick'&&(!Array.isArray(p.pool)||!p.pool.length||p.pool.length>5||p.pool.some(c=>!CARDS[c.type])))return false
  if(p.kind==='support'&&(!Array.isArray(p.candidates)||p.candidates.some(c=>!validSeat(c))||!validSeat(p.requester)))return false
  if(p.kind==='reveal'&&(!catalog.animatedJudgments||p.event?.type!=='judgeApply'||!['indulgence','lightning'].includes(p.delayType)||typeof p.hit!=='boolean'||!CARDS[p.card?.type]))return false
  return true
}
function restoreGame(raw) {
  try {
    const s=typeof raw==='string'?JSON.parse(raw):clone(raw)
    if(!s||s.theme!==catalog.theme||s.version!==VERSION||!Array.isArray(s.players)||s.players.length!==5||!Number.isInteger(s.current)||s.current<0||s.current>4||!['play','resolve','finished'].includes(s.phase))return null
    if(![s.deck,s.discard,s.processing,s.harvestPool,s.queue,s.logs,s.suspicion].every(Array.isArray))return null
    if(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!Number.isInteger(s.revision)||s.revision<0||!Number.isInteger(s.promptId)||!Number.isInteger(s.eventId)||!Number.isInteger(s.turns)||s.turns<0)return null
    if(s.suspicion.length!==5||s.suspicion.some(n=>!Number.isFinite(n))||s.queue.length>512||s.queue.some(event=>!validEvent(event))||s.logs.some(line=>typeof line.text!=='string'))return null
    if(new Set(s.players.map(p=>p.heroId)).size!==5||s.players.filter(p=>p.role==='lord').length!==1||s.players.filter(p=>p.role==='loyal').length!==1||s.players.filter(p=>p.role==='rebel').length!==2||s.players.filter(p=>p.role==='renegade').length!==1)return null
    for(const p of s.players)if(!HERO_BY_ID[p.heroId]||p.seat!==s.players.indexOf(p)||!Number.isInteger(p.hp)||p.hp>p.maxHp||p.hp< -3||typeof p.alive!=='boolean'||p.maxHp!==hero(p).hp+(p.role==='lord'?1:0)||!Array.isArray(p.hand)||!Array.isArray(p.judgment)||!p.equip||!p.marks)return null
    const canonical=new Map(makeDeck().map(c=>[c.id,c])),cards=allCards(s)
    if(cards.length!==108||new Set(cards.map(c=>c.id)).size!==108||cards.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))))return null
    if(s.pending&&(!validPending(s.pending)||!player(s,s.pending.actor)?.alive))return null
    if(s.pending?.kind==='pick'&&s.pending.pool.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id))||!s.harvestPool.some(card=>card.id===c.id)))return null
    if(s.pending?.kind==='reveal'&&(!s.processing.some(c=>c.id===s.pending.event.cardId&&c.type===s.pending.delayType)||!s.discard.some(c=>c.id===s.pending.card.id)||JSON.stringify(s.pending.card)!==JSON.stringify(canonical.get(s.pending.event.judgeId))))return null
    if(s.lastPlayed&&(!Array.isArray(s.lastPlayed.cards)||s.lastPlayed.cards.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id)))))return null
    if(s.lastResponse&&(!Array.isArray(s.lastResponse.cards)||s.lastResponse.cards.some(c=>!canonical.has(c.id)||JSON.stringify(c)!==JSON.stringify(canonical.get(c.id)))))return null
    if(s.phase==='finished'&&!['lord','rebel','renegade'].includes(s.winner)||s.phase!=='finished'&&s.winner)return null
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
