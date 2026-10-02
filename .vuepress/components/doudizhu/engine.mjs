// ============================================================
// 经典斗地主引擎（doudizhu/engine.mjs）
// 纯逻辑、零 DOM、确定性（seed 洗牌，禁 Math.random/Date.now）。
// 三人一副牌：54 张，每人 17 张，底牌 3 张；叫分定地主。
// 状态可 JSON 序列化（为联机预留），事件流驱动 UI。
//
// 牌编码：0-51 = (rank-3)*4 + suit，rank 3..15（3..10,J,Q,K,A,2），
//         suit 0♠ 1♥ 2♣ 3♦；52 = 小王，53 = 大王。
// ============================================================

export const rankOf = c => (c >= 52 ? (c === 52 ? 16 : 17) : 3 + ((c / 4) | 0))
export const suitOf = c => (c >= 52 ? -1 : c & 3)
export const isJoker = c => c >= 52

export const RANK_LABEL = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王'
}

export const COMBO_LABEL = {
  single: '单张', pair: '对子', triple: '三张', trio_solo: '三带一', trio_pair: '三带二',
  straight: '顺子', pair_seq: '连对', plane: '飞机', plane_solo: '飞机带单', plane_pair: '飞机带对',
  quad_solo: '四带二', quad_pair: '四带二对', bomb: '炸弹', rocket: '王炸'
}

export const SEAT_NEXT = [1, 2, 0]

// ---------- 确定性随机（mulberry32，状态可序列化） ----------
function rngNext(rng) {
  let t = (rng + 0x6d2b79f5) >>> 0
  let r = t
  r = Math.imul(r ^ (r >>> 15), r | 1)
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
  return [((r ^ (r >>> 14)) >>> 0), t]
}

function shuffle(cards, rng) {
  const a = cards.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const [r, next] = rngNext(rng)
    rng = next
    const j = r % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return [a, rng]
}

const byRankDesc = (a, b) => rankOf(b) - rankOf(a) || a - b
const byRankAsc = (a, b) => rankOf(a) - rankOf(b) || a - b

function countByRank(cards) {
  const m = new Map()
  for (const c of cards) m.set(rankOf(c), (m.get(rankOf(c)) || 0) + 1)
  return m
}

function isConsec(sortedRanks) {
  for (let i = 1; i < sortedRanks.length; i++) if (sortedRanks[i] !== sortedRanks[i - 1] + 1) return false
  return true
}

// ---------- 牌型识别 ----------
// 返回 {type, rank, length} 或 null。rank 为主牌最大点数，length 为总张数。
export function classifyCombo(cards) {
  if (!cards || !cards.length) return null
  const n = cards.length
  const counts = countByRank(cards)
  const ranks = [...counts.keys()].sort((a, b) => a - b)
  const maxRank = ranks[ranks.length - 1]
  // 王炸
  if (n === 2 && counts.get(16) === 1 && counts.get(17) === 1) return { type: 'rocket', rank: 17, length: 2 }
  if (n === 1) return { type: 'single', rank: ranks[0], length: 1 }
  if (n === 2 && ranks.length === 1) return { type: 'pair', rank: ranks[0], length: 2 }
  if (n === 3 && ranks.length === 1) return { type: 'triple', rank: ranks[0], length: 3 }
  if (n === 4 && ranks.length === 1) return { type: 'bomb', rank: ranks[0], length: 4 }
  // 顺子：5+ 张连续单牌，不含 2 与王
  if (n >= 5 && ranks.length === n && maxRank <= 14 && isConsec(ranks)) return { type: 'straight', rank: maxRank, length: n }
  // 连对：3+ 对连续，不含 2 与王
  if (n >= 6 && n % 2 === 0 && ranks.length === n / 2 && maxRank <= 14 && isConsec(ranks) && ranks.every(r => counts.get(r) === 2))
    return { type: 'pair_seq', rank: maxRank, length: n }
  const tripleRanks = ranks.filter(r => counts.get(r) === 3)
  // 飞机族：k 个连续三张（k>=2，不含 2 与王）
  const planeRun = k => {
    for (let i = 0; i + k <= tripleRanks.length; i++) {
      const run = tripleRanks.slice(i, i + k)
      if (run[k - 1] <= 14 && isConsec(run)) return run
    }
    return null
  }
  if (n >= 6 && n % 3 === 0) {
    const k = n / 3
    if (k >= 2) {
      const run = planeRun(k)
      if (run && ranks.every(r => counts.get(r) === 3)) return { type: 'plane', rank: run[k - 1], length: n }
    }
  }
  if (n >= 8 && n % 4 === 0) {
    const k = n / 4
    if (k >= 2) {
      const run = planeRun(k)
      if (run) {
        // 翅膀：k 张互不同点数的单牌（可含 2 / 王）
        const left = new Map(counts)
        for (const r of run) left.delete(r)
        const wings = [...left.entries()]
        if (wings.reduce((s, [, c]) => s + c, 0) === k && wings.every(([, c]) => c === 1))
          return { type: 'plane_solo', rank: run[k - 1], length: n }
      }
    }
  }
  if (n >= 10 && n % 5 === 0) {
    const k = n / 5
    if (k >= 2) {
      const run = planeRun(k)
      if (run) {
        const left = new Map(counts)
        for (const r of run) left.delete(r)
        const wings = [...left.entries()]
        if (wings.reduce((s, [, c]) => s + c, 0) === k * 2 && wings.every(([, c]) => c === 2))
          return { type: 'plane_pair', rank: run[k - 1], length: n }
      }
    }
  }
  // 三带
  if (n === 4) {
    const t = ranks.find(r => counts.get(r) === 3)
    if (t !== undefined) return { type: 'trio_solo', rank: t, length: 4 }
  }
  if (n === 5) {
    const t = ranks.find(r => counts.get(r) === 3)
    if (t !== undefined && ranks.some(r => counts.get(r) === 2)) return { type: 'trio_pair', rank: t, length: 5 }
  }
  // 四带
  if (n === 6) {
    const q = ranks.find(r => counts.get(r) === 4)
    if (q !== undefined) return { type: 'quad_solo', rank: q, length: 6 }
  }
  if (n === 8) {
    const q = ranks.find(r => counts.get(r) === 4)
    if (q !== undefined) {
      const left = ranks.filter(r => r !== q)
      if (left.length === 2 && left.every(r => counts.get(r) === 2)) return { type: 'quad_pair', rank: q, length: 8 }
    }
  }
  return null
}

// 出牌展示排序：与手牌一致从大到小；带翅膀牌型（三带/四带/飞机带翅）
// 主体在前、翅膀在后——纯降序会把大点翅膀排到主体前面（333+J → J,3,3,3），
// 纯升序又让小翅膀打头（JJJ+3 → 3,J,J,J），都读不顺。
// classifyCombo 的 rank 即主体点数（飞机族 = 连三最高位），据此分主体/翅膀
function orderPlayedCards(cards, combo) {
  const desc = cards.slice().sort(byRankDesc)
  if (!combo) return desc
  let bodyCount = 0
  let bodyRanks = null
  if (combo.type === 'trio_solo' || combo.type === 'trio_pair') { bodyCount = 3; bodyRanks = [combo.rank] }
  else if (combo.type === 'quad_solo' || combo.type === 'quad_pair') { bodyCount = 4; bodyRanks = [combo.rank] }
  else if (combo.type === 'plane_solo' || combo.type === 'plane_pair') {
    bodyCount = 3
    const k = Math.floor(cards.length / (combo.type === 'plane_solo' ? 4 : 5))
    bodyRanks = []
    for (let r = combo.rank; bodyRanks.length < k; r--) bodyRanks.push(r)
  } else return desc
  const used = new Map()
  const body = []
  const wings = []
  for (const c of desc) {
    const r = rankOf(c)
    const usedN = used.get(r) || 0
    if (bodyRanks.includes(r) && usedN < bodyCount) { body.push(c); used.set(r, usedN + 1) } else wings.push(c)
  }
  return body.concat(wings) // body / wings 内部保持降序
}

// ---------- 牌型比较 ----------
export function canBeat(a, b) {
  if (!a || !b) return false
  if (a.type === 'rocket') return true
  if (b.type === 'rocket') return false
  if (a.type === 'bomb' && b.type !== 'bomb') return true
  if (a.type !== b.type) return false
  if (a.length !== b.length) return false
  return a.rank > b.rank
}

// ---------- 枚举手牌中的全部组合（供 legalActions / AI / 提示） ----------
// 返回 [{type,rank,length,cards:[...具体牌id]}]，cards 按点数升序取低花色。
export function enumerateCombos(hand) {
  const counts = countByRank(hand)
  const byRank = new Map()
  for (const c of hand.slice().sort(byRankAsc)) {
    const r = rankOf(c)
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r).push(c)
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b)
  const out = []
  const seen = new Set()
  const push = (type, rank, cards) => {
    const key = cards.slice().sort((a, b) => a - b).join(',')
    if (seen.has(key)) return
    seen.add(key)
    out.push({ type, rank, length: cards.length, cards: cards.slice().sort(byRankAsc) })
  }
  const take = (r, k) => byRank.get(r).slice(0, k)
  // 单/对/三/炸
  for (const r of ranks) {
    const c = counts.get(r)
    push('single', r, take(r, 1))
    if (c >= 2) push('pair', r, take(r, 2))
    if (c >= 3) push('triple', r, take(r, 3))
    if (c === 4) push('bomb', r, take(r, 4))
  }
  if (counts.get(16) && counts.get(17)) push('rocket', 17, [52, 53])
  // 顺子
  const seqRanks = ranks.filter(r => r <= 14)
  for (let i = 0; i < seqRanks.length; i++) {
    for (let j = i + 4; j < seqRanks.length; j++) {
      const run = seqRanks.slice(i, j + 1)
      if (!isConsec(run)) break
      push('straight', run[run.length - 1], run.flatMap(r => take(r, 1)))
    }
  }
  // 连对
  const pairRanks = seqRanks.filter(r => counts.get(r) >= 2)
  for (let i = 0; i < pairRanks.length; i++) {
    for (let j = i + 2; j < pairRanks.length; j++) {
      const run = pairRanks.slice(i, j + 1)
      if (!isConsec(run)) break
      push('pair_seq', run[run.length - 1], run.flatMap(r => take(r, 2)))
    }
  }
  // 飞机（不带/带单/带对）
  const tripleSeq = seqRanks.filter(r => counts.get(r) >= 3)
  for (let i = 0; i < tripleSeq.length; i++) {
    for (let j = i + 1; j < tripleSeq.length; j++) {
      const run = tripleSeq.slice(i, j + 1)
      if (!isConsec(run)) break
      const k = run.length
      const body = run.flatMap(r => take(r, 3))
      push('plane', run[k - 1], body)
      const restRanks = ranks.filter(r => !run.includes(r))
      // 带单：翅膀互不同点数
      for (const wings of pickK(restRanks, k)) push('plane_solo', run[k - 1], [...body, ...wings.flatMap(r => take(r, 1))])
      // 带对：翅膀为 k 个对子
      const restPairs = restRanks.filter(r => counts.get(r) >= 2)
      for (const wings of pickK(restPairs, k)) push('plane_pair', run[k - 1], [...body, ...wings.flatMap(r => take(r, 2))])
    }
  }
  // 三带
  for (const r of ranks) {
    if (counts.get(r) !== 3) continue
    const body = take(r, 3)
    for (const w of ranks) {
      if (w === r) continue
      push('trio_solo', r, [...body, ...take(w, 1)])
      if (counts.get(w) >= 2) push('trio_pair', r, [...body, ...take(w, 2)])
    }
  }
  // 四带
  for (const r of ranks) {
    if (counts.get(r) !== 4) continue
    const body = take(r, 4)
    const rest = ranks.filter(w => w !== r)
    for (let i = 0; i < rest.length; i++) {
      // 翅膀必须为两张：同点一对（8888+33）或两张不同点单牌（8888+3K），
      // 只带一张的 5 张牌不是合法牌型（classifyCombo 不认）
      if (counts.get(rest[i]) >= 2) push('quad_solo', r, [...body, ...take(rest[i], 2)])
      for (let j = i + 1; j < rest.length; j++) push('quad_solo', r, [...body, ...take(rest[i], 1), ...take(rest[j], 1)])
    }
    const pairRest = rest.filter(w => counts.get(w) >= 2)
    for (let i = 0; i < pairRest.length; i++) {
      for (let j = i + 1; j < pairRest.length; j++)
        push('quad_pair', r, [...body, ...take(pairRest[i], 2), ...take(pairRest[j], 2)])
    }
  }
  return out
}

function pickK(arr, k) {
  const res = []
  const rec = (start, acc) => {
    if (acc.length === k) return res.push(acc.slice())
    for (let i = start; i <= arr.length - (k - acc.length); i++) {
      acc.push(arr[i])
      rec(i + 1, acc)
      acc.pop()
    }
  }
  rec(0, [])
  return res
}

// ---------- 局面 ----------
function deal(state, events) {
  let deck = Array.from({ length: 54 }, (_, i) => i)
  let rng = state.rng
  ;[deck, rng] = shuffle(deck, rng)
  state.rng = rng
  state.hands = [deck.slice(0, 17).sort(byRankDesc), deck.slice(17, 34).sort(byRankDesc), deck.slice(34, 51).sort(byRankDesc)]
  state.bottom = deck.slice(51).sort(byRankDesc)
  const [r, next] = rngNext(state.rng)
  state.rng = next
  state.bidTurn = r % 3
  state.highBid = 0
  state.highBidder = -1
  state.bidPasses = 0
  state.bids = []
  state.phase = 'bidding'
  events.push({ type: 'deal', first: state.bidTurn, redeal: state.redealCount })
}

export function createGame({ seed = 1 } = {}) {
  const state = {
    phase: 'bidding',
    rng: seed >>> 0,
    hands: [[], [], []],
    bottom: [],
    bidTurn: 0, highBid: 0, highBidder: -1, bidPasses: 0, bids: [], redealCount: 0,
    landlord: -1, calledScore: 0,
    turn: 0, lastPlay: null, passCount: 0,
    multiplier: 1, bombs: 0,
    playCount: [0, 0, 0],
    trickPasses: [], // 本 trick 已 pass 的座位（供 AI 判断队友形势）
    winner: -1, winSide: '', spring: false,
    scores: [0, 0, 0],
    history: []
  }
  const events = []
  deal(state, events)
  state._pendingEvents = events
  return state
}

// ---------- 合法动作 ----------
export function legalActions(state, seat) {
  if (state.phase === 'over') return []
  if (state.phase === 'bidding') {
    if (seat !== state.bidTurn) return []
    const acts = [{ type: 'bid', score: 0 }]
    for (let s = state.highBid + 1; s <= 3; s++) acts.push({ type: 'bid', score: s })
    return acts
  }
  // playing
  if (seat !== state.turn) return []
  const hand = state.hands[seat]
  const combos = enumerateCombos(hand)
  if (!state.lastPlay) return combos.map(c => ({ type: 'play', cards: c.cards }))
  const beats = combos.filter(c => canBeat(c, state.lastPlay.combo))
  return [{ type: 'pass' }, ...beats.map(c => ({ type: 'play', cards: c.cards }))]
}

function isLegal(state, seat, action) {
  if (!action) return false
  if (action.type === 'bid')
    return state.phase === 'bidding' && seat === state.bidTurn && Number.isInteger(action.score) &&
      action.score >= 0 && action.score <= 3 && (action.score === 0 || action.score > state.highBid)
  if (action.type === 'pass') return state.phase === 'playing' && seat === state.turn && !!state.lastPlay
  if (action.type === 'play') {
    if (state.phase !== 'playing' || seat !== state.turn) return false
    const combo = classifyCombo(action.cards)
    if (!combo) return false
    const hand = state.hands[seat]
    for (const c of action.cards) if (!hand.includes(c)) return false
    if (new Set(action.cards).size !== action.cards.length) return false
    if (!state.lastPlay) return true
    return canBeat(combo, state.lastPlay.combo)
  }
  return false
}

// ---------- 状态推进 ----------
export function dispatch(state, action, seat) {
  if (!isLegal(state, seat, action)) return { ok: false, state, events: [] }
  const events = []

  if (action.type === 'bid') {
    const { score } = action
    state.bids.push({ seat, score })
    events.push({ type: 'bid', seat, score })
    if (score === 3 || (score > 0 && score > state.highBid)) {
      state.highBid = score
      state.highBidder = seat
      state.bidPasses = 0
    } else {
      state.bidPasses++
    }
    const done = score === 3 || (state.highBidder >= 0 && state.bidPasses >= 2)
    const allPass = state.highBidder < 0 && state.bids.length >= 3
    if (done) {
      becomeLandlord(state, events, state.highBidder)
    } else if (allPass) {
      state.redealCount++
      events.push({ type: 'redeal' })
      if (state.redealCount >= 3) {
        // 三轮无人叫：首家强制 1 分当地主，避免死循环
        becomeLandlord(state, events, state.bidTurn)
      } else {
        deal(state, events)
      }
    } else {
      state.bidTurn = SEAT_NEXT[state.bidTurn]
    }
    return { ok: true, state, events }
  }

  if (action.type === 'pass') {
    state.passCount++
    state.trickPasses.push(seat)
    events.push({ type: 'pass', seat })
    if (state.passCount >= 2) {
      events.push({ type: 'trick-clear', leader: state.lastPlay.seat })
      state.turn = state.lastPlay.seat
      state.lastPlay = null
      state.passCount = 0
      state.trickPasses = []
    } else {
      state.turn = SEAT_NEXT[seat]
    }
    return { ok: true, state, events }
  }

  // play
  const combo = classifyCombo(action.cards)
  const hand = state.hands[seat]
  state.hands[seat] = hand.filter(c => !action.cards.includes(c))
  // 出牌记录：结构感知排序（序列降序、带牌主体在前），展示与手牌读牌习惯一致
  state.lastPlay = { seat, combo, cards: orderPlayedCards(action.cards, combo) }
  state.passCount = 0
  state.trickPasses = []
  state.playCount[seat]++
  state.history.push({ seat, combo, cards: state.lastPlay.cards })
  if (combo.type === 'bomb' || combo.type === 'rocket') {
    state.bombs++
    state.multiplier *= 2
    events.push({ type: 'bomb', seat, combo: combo.type, multiplier: state.multiplier })
  }
  events.push({ type: 'play', seat, cards: state.lastPlay.cards, combo })

  if (state.hands[seat].length === 0) {
    finish(state, events, seat)
  } else {
    state.turn = SEAT_NEXT[seat]
    if (state.hands[seat].length <= 2) events.push({ type: 'alarm', seat, left: state.hands[seat].length })
  }
  return { ok: true, state, events }
}

function becomeLandlord(state, events, seat) {
  state.landlord = seat
  state.calledScore = state.highBid || 1
  state.highBid = state.calledScore
  state.hands[seat] = state.hands[seat].concat(state.bottom).sort(byRankDesc)
  state.phase = 'playing'
  state.turn = seat
  state.lastPlay = null
  state.passCount = 0
  events.push({ type: 'landlord', seat, score: state.calledScore, bottom: state.bottom.slice() })
}

function finish(state, events, winner) {
  state.phase = 'over'
  state.winner = winner
  const landlordWin = winner === state.landlord
  state.winSide = landlordWin ? 'landlord' : 'farmer'
  // 春天：地主胜且两农民一张未出；反春：农民胜且地主只出过一手
  const farmers = [0, 1, 2].filter(s => s !== state.landlord)
  if (landlordWin && farmers.every(s => state.playCount[s] === 0)) state.spring = true
  if (!landlordWin && state.playCount[state.landlord] === 1) state.spring = true
  if (state.spring) state.multiplier *= 2
  const base = state.calledScore * state.multiplier
  for (const s of [0, 1, 2]) {
    const isLandlord = s === state.landlord
    const win = isLandlord ? landlordWin : !landlordWin
    state.scores[s] = (win ? 1 : -1) * base * (isLandlord ? 2 : 1)
  }
  events.push({
    type: 'over', winner, winSide: state.winSide, spring: state.spring,
    multiplier: state.multiplier, calledScore: state.calledScore,
    bombs: state.bombs, scores: state.scores.slice()
  })
}

// ---------- 玩家视图（联机预留：隐藏他家手牌） ----------
export function playerView(state, seat) {
  return {
    phase: state.phase,
    seat,
    hand: state.hands[seat].slice(),
    handCounts: state.hands.map((h, i) => (i === seat || state.phase === 'over' ? state.hands[i].slice() : h.length)),
    bottom: state.landlord >= 0 ? state.bottom.slice() : state.bottom.length,
    bidTurn: state.bidTurn, highBid: state.highBid, bids: state.bids.slice(),
    landlord: state.landlord, calledScore: state.calledScore,
    turn: state.turn, lastPlay: state.lastPlay,
    trickPasses: state.trickPasses.slice(),
    multiplier: state.multiplier, bombs: state.bombs,
    playCount: state.playCount.slice(),
    winner: state.winner, winSide: state.winSide, spring: state.spring,
    scores: state.scores.slice()
  }
}

export function settlementOf(state) {
  if (state.phase !== 'over') return null
  return {
    winner: state.winner, winSide: state.winSide, spring: state.spring,
    calledScore: state.calledScore, multiplier: state.multiplier, bombs: state.bombs,
    scores: state.scores.slice(),
    hands: state.hands.map(h => h.slice()),
    landlord: state.landlord
  }
}

export function drainEvents(state) {
  const ev = state._pendingEvents || []
  state._pendingEvents = []
  return ev
}
