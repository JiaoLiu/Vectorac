// ============================================================
// 经典斗地主 AI（doudizhu/ai.js）
// 与引擎分离：输入公开视图+自家手牌，输出合法动作。
// 启发式：叫分按牌力评估；出牌先拆牌（hand 数最少），
// 跟牌取最小代价；农民有队友配合意识（不压队友大牌、地主剩牌时拦截）。
// ============================================================

import { rankOf, canBeat, enumerateCombos } from './engine.mjs'

// ---------- 拆牌：贪心提取长组合，返回组合列表（张数升序的“手数”评估） ----------
export function decompose(hand) {
  const counts = new Map()
  for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) || 0) + 1)
  const combos = []
  const seqRanks = () => [...counts.keys()].filter(r => r <= 14 && counts.get(r) > 0).sort((a, b) => a - b)
  const consume = (r, k) => counts.set(r, counts.get(r) - k)
  // 飞机（含主体）
  for (;;) {
    const rs = seqRanks().filter(r => counts.get(r) >= 3)
    let best = null
    for (let i = 0; i < rs.length; i++) {
      let j = i
      while (j + 1 < rs.length && rs[j + 1] === rs[j] + 1) j++
      if (j - i + 1 >= 2 && (!best || j - i + 1 > best.length)) best = rs.slice(i, j + 1)
    }
    if (!best) break
    for (const r of best) consume(r, 3)
    combos.push({ type: 'plane', rank: best[best.length - 1], length: best.length * 3, run: best })
  }
  // 顺子
  for (;;) {
    const rs = seqRanks()
    let best = null
    for (let i = 0; i < rs.length; i++) {
      let j = i
      while (j + 1 < rs.length && rs[j + 1] === rs[j] + 1) j++
      if (j - i + 1 >= 5 && (!best || j - i + 1 > best.length)) best = rs.slice(i, j + 1)
    }
    if (!best) break
    for (const r of best) consume(r, 1)
    combos.push({ type: 'straight', rank: best[best.length - 1], length: best.length })
  }
  // 连对
  for (;;) {
    const rs = seqRanks().filter(r => counts.get(r) >= 2)
    let best = null
    for (let i = 0; i < rs.length; i++) {
      let j = i
      while (j + 1 < rs.length && rs[j + 1] === rs[j] + 1) j++
      if (j - i + 1 >= 3 && (!best || j - i + 1 > best.length)) best = rs.slice(i, j + 1)
    }
    if (!best) break
    for (const r of best) consume(r, 2)
    combos.push({ type: 'pair_seq', rank: best[best.length - 1], length: best.length * 2 })
  }
  // 炸弹 / 三张 / 对子 / 单张
  const rest = [...counts.keys()].filter(r => counts.get(r) > 0).sort((a, b) => a - b)
  const singles = []
  for (const r of rest) {
    const c = counts.get(r)
    if (c === 4) { combos.push({ type: 'bomb', rank: r, length: 4 }); continue }
    if (c === 3) combos.push({ type: 'triple', rank: r, length: 3 })
    else if (c === 2) combos.push({ type: 'pair', rank: r, length: 2 })
    else singles.push(r)
  }
  // 三张顺手带最低单/对，减少手数
  const lowSingles = singles.filter(r => r < 15)
  const lowPairs = combos.filter(c => c.type === 'pair' && c.rank < 15).sort((a, b) => a.rank - b.rank)
  for (const t of combos.filter(c => c.type === 'triple')) {
    if (lowSingles.length) {
      lowSingles.shift()
      t.type = 'trio_solo'; t.length = 4
    } else if (lowPairs.length && combos.filter(c => c.type === 'triple').length > 1) {
      const p = lowPairs.shift()
      combos.splice(combos.indexOf(p), 1)
      t.type = 'trio_pair'; t.length = 5
    }
  }
  for (const r of lowSingles) combos.push({ type: 'single', rank: r, length: 1 })
  for (const r of singles.filter(r => r >= 15)) combos.push({ type: 'single', rank: r, length: 1 })
  // 王炸
  if ((counts.get(16) || 0) === 1 && (counts.get(17) || 0) === 1) {
    const i16 = combos.findIndex(c => c.type === 'single' && c.rank === 16)
    const i17 = combos.findIndex(c => c.type === 'single' && c.rank === 17)
    if (i16 >= 0 && i17 >= 0) {
      combos.splice(Math.max(i16, i17), 1)
      combos.splice(Math.min(i16, i17), 1)
      combos.push({ type: 'rocket', rank: 17, length: 2 })
    }
  }
  return combos
}

export function handsCount(hand) {
  return decompose(hand).length
}

// ---------- 叫分评估 ----------
export function evaluateBid(hand) {
  const counts = new Map()
  for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) || 0) + 1)
  let score = 0
  if (counts.get(16) && counts.get(17)) score += 6
  for (const [, c] of counts) if (c === 4) score += 4
  score += (counts.get(17) || 0) * 2 + (counts.get(16) || 0) * 1.5
  score += (counts.get(15) || 0) * 1.2 + (counts.get(14) || 0) * 0.5
  const hc = handsCount(hand)
  score -= Math.max(0, hc - 6) * 0.9
  if (score >= 6.5) return 3
  if (score >= 4) return 2
  if (score >= 2.2) return 1
  return 0
}

// ---------- 出牌决策 ----------
const COMBO_COST = c =>
  (c.type === 'rocket' ? 1000 : 0) +
  (c.type === 'bomb' ? 500 : 0) +
  c.rank + (c.length <= 2 && c.rank >= 15 ? 8 : 0)

function cheapest(cands) {
  return cands.slice().sort((a, b) => COMBO_COST(a) - COMBO_COST(b) || a.length - b.length)[0]
}

// 选首出组合：优先手数降幅大、点数低的长组合；炸弹王炸留后，四带二不留作首出。
// 额外偏好：① 能带走手里最小散牌的组合（避免大牌打完剩个 3 跑不掉）
// ② 单张出小不出大（A/2/王单飞是控制权，除非没有别的选择）
export function chooseLead(hand) {
  const all = enumerateCombos(hand)
  const finish = all.filter(c => c.length === hand.length)
  if (finish.length) return cheapest(finish)
  const baseHands = handsCount(hand)
  let minRank = 99
  for (const c of hand) minRank = Math.min(minRank, rankOf(c))
  let best = null
  let bestScore = Infinity
  for (const c of all) {
    // 炸弹/王炸留作后手；四带二带牌质量差、易送对手小牌，绝不在有选择时首出
    if (c.type === 'bomb' || c.type === 'rocket' || c.type === 'quad_solo' || c.type === 'quad_pair') continue
    const rest = hand.filter(x => !c.cards.includes(x))
    const remain = handsCount(rest)
    if (remain > baseHands) continue // 拆烂了
    // 代价：剩余手数为主，长牌优先，点数越低越好，大牌单张重罚
    const s = remain * 100 - c.length * 6 + c.rank * 1.5 +
      (c.type === 'single' ? 4 : 0) +
      (c.type === 'single' && c.rank >= 14 ? 30 : 0) +
      (c.cards.some(x => rankOf(x) === minRank) ? -14 : 0)
    if (s < bestScore) { bestScore = s; best = c }
  }
  if (best) return best
  // 兜底：最小单张
  return all.filter(c => c.type === 'single').sort((a, b) => a.rank - b.rank)[0]
}

// 跟牌：最小代价压过；农民配合（队友的牌权不抢）；炸弹仅在关键时刻用
export function chooseFollow(view, hand, seat) {
  const last = view.lastPlay
  const cands = enumerateCombos(hand).filter(c => canBeat(c, last.combo))
  if (!cands.length) return null
  const finish = cands.filter(c => c.length === hand.length)
  const landlord = view.landlord
  const iAmLandlord = seat === landlord
  const lastIsTeammate = !iAmLandlord && last.seat !== landlord
  const landlordLeft = typeof view.handCounts[landlord] === 'number' ? view.handCounts[landlord] : 99
  const nonBomb = cands.filter(c => c.type !== 'bomb' && c.type !== 'rocket')

  if (lastIsTeammate) {
    // 队友的牌权：能一手走净才接，否则让队友继续走
    if (finish.length) return cheapest(finish)
    // 地主只剩一两张、队友这手又走不完 → 廉价拦一下，防地主直接顺走
    const mateLeft = typeof view.handCounts[last.seat] === 'number' ? view.handCounts[last.seat] : 99
    if (mateLeft > 0 && landlordLeft <= 2 && nonBomb.length) {
      const c = cheapest(nonBomb)
      if (c.rank <= 14) return c
    }
    return null
  }
  // 对手出的：能压则压最小
  if (finish.length) return cheapest(finish)
  if (nonBomb.length) {
    const c = cheapest(nonBomb)
    // 农民跟地主的小牌时，别为一张小单牌拆出 2/王（除非地主快跑了）
    if (!iAmLandlord && last.combo.type === 'single' && last.combo.rank <= 10 && c.rank >= 15 && landlordLeft > 5) return null
    return c
  }
  // 只剩炸弹能压：对手报单/报双，或自己能一炸收尾则炸
  if (finish.length) return cheapest(finish)
  const threat = iAmLandlord
    ? Math.min(...[0, 1, 2].filter(s => s !== seat).map(s => (typeof view.handCounts[s] === 'number' ? view.handCounts[s] : 99)))
    : landlordLeft
  if (threat <= 2) return cheapest(cands)
  return null
}

// ---------- 主入口 ----------
export function aiDecide(view, seat) {
  if (view.phase === 'bidding') {
    if (view.bidTurn !== seat) return null
    const want = evaluateBid(view.hand)
    return { type: 'bid', score: want > view.highBid ? want : 0 }
  }
  if (view.phase !== 'playing' || view.turn !== seat) return null
  const hand = view.hand
  if (!view.lastPlay) {
    const c = chooseLead(hand)
    return { type: 'play', cards: c.cards }
  }
  const c = chooseFollow(view, hand, seat)
  return c ? { type: 'play', cards: c.cards } : { type: 'pass' }
}

// ---------- 提示（供人类玩家）：首出给推荐，跟出枚举最小 ----------
export function hintPlay(view, hand, prevHintCards) {
  if (view.phase !== 'playing') return null
  if (!view.lastPlay) {
    const c = chooseLead(hand)
    return c ? c.cards : null
  }
  const cands = enumerateCombos(hand).filter(c => canBeat(c, view.lastPlay.combo))
  if (!cands.length) return null
  cands.sort((a, b) => COMBO_COST(a) - COMBO_COST(b) || a.length - b.length)
  // 多次点提示：轮换下一候选
  if (prevHintCards && prevHintCards.length) {
    const key = prevHintCards.slice().sort((x, y) => x - y).join(',')
    const idx = cands.findIndex(c => c.cards.slice().sort((x, y) => x - y).join(',') === key)
    if (idx >= 0 && idx + 1 < cands.length) return cands[idx + 1].cards
  }
  return cands[0].cards
}
