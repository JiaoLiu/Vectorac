// ============================================================
// 经典斗地主 AI（doudizhu/ai.js）
// 与引擎分离：输入公开视图+自家手牌，输出合法动作。
// 三层结构：
//   1) 记牌器：已出+手牌 → 未见牌分布（DeltaDou 式公开信息推断）
//   2) 启发式：拆牌手数评估 + 报牌攻防 + 农民配合（原引擎级策略，保留）
//   3) 蒙特卡洛残局推演：残局把未见牌随机采样分给对手，
//      用快速启发式打完整局，选出平均得分最高的着法
//      （DouZero/DeltaDou 的核心思想，纯 JS 可行的落地版）
// ============================================================

import { rankOf, canBeat, enumerateCombos, dispatch, playerView } from './engine.mjs'

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

// ---------- 记牌器：未见牌（对手手牌 + 未亮底牌）的按点数分布 ----------
export function unseenCounts(view) {
  const cnt = {}
  for (let r = 3; r <= 15; r++) cnt[r] = 4
  cnt[16] = 1; cnt[17] = 1
  for (const c of view.hand) cnt[rankOf(c)]--
  for (const h of (view.played || [])) for (const c of h.cards) cnt[rankOf(c)]--
  return cnt
}

/** 单张 r 是否已无牌可压（对手不可能有更大的单张） */
function certainSingle(r, cnt) {
  for (let x = r + 1; x <= 17; x++) if (cnt[x] > 0) return false
  return true
}
/** 对子 r 是否无更大对子（近似：未见牌里没有两同点更大） */
function certainPair(r, cnt) {
  for (let x = r + 1; x <= 15; x++) if (cnt[x] >= 2) return false
  return true
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

/** 报牌形势摘要（攻防双方谁快跑了） */
function boardInfo(view, seat) {
  const landlord = view ? view.landlord : -1
  const iAmLandlord = seat === landlord
  const hc = s => (view && typeof view.handCounts[s] === 'number' ? view.handCounts[s] : 99)
  const others = [0, 1, 2].filter(s => s !== seat)
  const oppSeats = others.filter(s => iAmLandlord || s === landlord)
  const mateSeats = others.filter(s => !iAmLandlord && s !== landlord)
  return {
    landlord, iAmLandlord, hc,
    oppOnOne: oppSeats.some(s => hc(s) === 1),
    oppOnTwo: oppSeats.some(s => hc(s) === 2),
    mateOnOne: !oppSeats.some(s => hc(s) === 1) && mateSeats.some(s => hc(s) === 1),
    landlordLeft: hc(landlord),
    others
  }
}

// 首出候选评分：分数升序 = 启发式偏好序（头名即 chooseLead 的选择）。
// 与旧 chooseLead 语义一致：炸弹/四带二不作首出（除非能一手走完，在外层短路）。
function scoreLeadCandidates(view, hand, seat) {
  const all = enumerateCombos(hand)
  const finish = all.filter(c => c.length === hand.length)
  if (finish.length) return cheapest(finish) ? [cheapest(finish)] : []
  const baseHands = handsCount(hand)
  const info = boardInfo(view, seat)
  const cnt = view ? unseenCounts(view) : null

  // 队友报单：喂最小单张（拆对子也值——队友直接走人）
  if (info.mateOnOne) {
    const feed = all.filter(c => c.type === 'single').sort((a, b) => a.rank - b.rank)[0]
    if (feed) return [feed]
  }

  let minRank = 99
  for (const c of hand) minRank = Math.min(minRank, rankOf(c))
  const scored = []
  for (const c of all) {
    if (c.type === 'bomb' || c.type === 'rocket' || c.type === 'quad_solo' || c.type === 'quad_pair') continue
    const rest = hand.filter(x => !c.cards.includes(x))
    const remain = handsCount(rest)
    if (remain > baseHands) continue // 拆烂了
    let s = remain * 100 - c.length * 6 + c.rank * 1.5 +
      (c.type === 'single' ? 4 : 0) +
      (c.type === 'single' && c.rank >= 14 ? 30 : 0) +
      (c.cards.some(x => rankOf(x) === minRank) && !(info.oppOnOne && c.type === 'single') ? -14 : 0)
    if (c.type === 'trio_solo' || c.type === 'trio_pair' || c.type === 'plane_solo' || c.type === 'plane_pair') {
      const wings = c.cards.filter(x => rankOf(x) !== c.rank && !(c.run && c.run.includes(rankOf(x))))
      let wingCost = 0
      for (const w of wings) wingCost += rankOf(w) * 2
      s += wingCost
    }
    // 记牌器：必胜单张（对手无人压得过）是稳定控制权，值得先出
    if (cnt) {
      if (c.type === 'single' && certainSingle(c.rank, cnt)) s -= 26
      if (c.type === 'pair' && certainPair(c.rank, cnt)) s -= 12
    }
    if (info.oppOnOne) {
      if (c.type === 'single') s += 90 + (17 - c.rank) * 5
      else s -= 25
    }
    if (info.oppOnTwo && c.type === 'pair') s += 40
    scored.push({ c, s })
  }
  scored.sort((a, b) => a.s - b.s)
  const out = scored.map(x => x.c)
  if (out.length) return out
  // 兜底：被迫出单——对手报单时出最大单，否则最小单
  const singles = all.filter(c => c.type === 'single').sort((a, b) => a.rank - b.rank)
  if (singles.length) return [info.oppOnOne ? singles[singles.length - 1] : singles[0]]
  return all.length ? [all[0]] : []
}

export function chooseLead(view, hand, seat) {
  return scoreLeadCandidates(view, hand, seat)[0] || null
}

// 跟牌候选评分：返回按偏好排序的候选（null = 不出）。
// 头名即旧 chooseFollow 的选择；其余供蒙特卡洛对比。
function scoreFollowCandidates(view, hand, seat) {
  const last = view.lastPlay
  const cands = enumerateCombos(hand).filter(c => canBeat(c, last.combo))
  if (!cands.length) return [null]
  const finish = cands.filter(c => c.length === hand.length)
  const finisher = finish.length ? cheapest(finish) : null
  if (finisher) return [finisher]

  const info = boardInfo(view, seat)
  const lastIsTeammate = !info.iAmLandlord && last.seat !== info.landlord
  const nonBomb = cands.filter(c => c.type !== 'bomb' && c.type !== 'rocket')
  const bombs = cands.filter(c => c.type === 'bomb' || c.type === 'rocket')
  const cnt = unseenCounts(view)
  const baseHands = handsCount(hand)
  // 拆牌代价：跟这张牌若把剩余手数打多（拆对子/顺子），需有足够收益
  const delta = c => {
    const rest = hand.filter(x => !c.cards.includes(x))
    return handsCount(rest) - baseHands
  }

  if (lastIsTeammate) {
    // 队友的牌权：让队友走；地主快跑时廉价拦一下
    const mateLeft = info.hc(last.seat)
    if (mateLeft > 0 && info.landlordLeft <= 2 && nonBomb.length) {
      const c = cheapest(nonBomb)
      if (c.rank <= 14) return [c, null, ...nonBomb.filter(x => x !== c), ...bombs]
    }
    return [null, ...nonBomb, ...bombs]
  }
  // 对手出的
  if (nonBomb.length) {
    const scored = nonBomb.map(c => {
      let s = COMBO_COST(c) + delta(c) * 45
      if (cnt) {
        if (c.type === 'single' && certainSingle(c.rank, cnt)) s -= 30
        if (c.type === 'pair' && certainPair(c.rank, cnt)) s -= 15
      }
      return { c, s }
    }).sort((a, b) => a.s - b.s || a.c.length - b.c.length)
    const head = scored[0].c
    // 农民跟地主的小牌时，别为一张小单牌拆出 2/王（除非地主快跑了）
    if (!info.iAmLandlord && last.combo.type === 'single' && last.combo.rank <= 10 &&
      head.rank >= 15 && info.landlordLeft > 5) return [null, ...scored.map(x => x.c), ...bombs]
    return [...scored.map(x => x.c), null, ...bombs]
  }
  // 只剩炸弹能压：对手报单/报双才炸
  const threat = info.iAmLandlord
    ? Math.min(...info.others.map(s => info.hc(s)))
    : info.landlordLeft
  if (threat <= 2) return [...bombs]
  return [null, ...bombs]
}

export function chooseFollow(view, hand, seat) {
  return scoreFollowCandidates(view, hand, seat)[0] || null
}

// ---------- 蒙特卡洛残局推演（DeltaDou 思想：采样对手手牌 + 快速模拟到终局） ----------
let MC_ENABLED = true
export function setMonteCarlo(on) { MC_ENABLED = !!on }
export function monteCarloEnabled() { return MC_ENABLED }

const MC_BUDGET_MS = 380   // 单次决策时间预算
const MC_ROLLOUTS = 14     // 每候选最多采样局数
const MC_TOPK = 7          // 最多评估的候选数

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
}

/** 残局判定：牌少到可以采样推演 */
function endgameTrigger(view, seat) {
  const myN = view.hand.length
  const others = [0, 1, 2].filter(s => s !== seat)
  const counts = others.map(s => view.handCounts[s])
  if (!counts.every(c => typeof c === 'number')) return false
  const totalUnseen = counts.reduce((a, b) => a + b, 0)
  const minOpp = Math.min(...counts)
  return myN <= 6 || minOpp <= 4 || totalUnseen <= 12
}

/** 把未见牌随机分给两家对手，从「我出 cand」开始用启发式打完，返回我的胜负（1/0） */
function simulate(view, seat, otherSeats, oppHands, cand) {
  const hands = [null, null, null]
  hands[seat] = view.hand.slice()
  otherSeats.forEach((s, i) => { hands[s] = oppHands[i].slice() })
  const st = {
    phase: 'playing', rng: 0,
    hands,
    bottom: [],
    bidTurn: 0, highBid: view.calledScore || 1, highBidder: view.landlord, bidPasses: 0, bids: [], redealCount: 0,
    landlord: view.landlord, calledScore: view.calledScore || 1,
    robTurn: -1, robs: [], robWinner: -1, dblTurn: -1, dbls: [],
    turn: seat,
    lastPlay: view.lastPlay ? { seat: view.lastPlay.seat, combo: view.lastPlay.combo, cards: view.lastPlay.cards.slice() } : null,
    passCount: (view.trickPasses || []).length,
    multiplier: view.multiplier || 1, bombs: view.bombs || 0,
    playCount: (view.playCount || [0, 0, 0]).slice(),
    trickPasses: (view.trickPasses || []).slice(),
    winner: -1, winSide: '', spring: false, scores: [0, 0, 0],
    history: (view.played || []).map(h => ({ seat: h.seat, combo: h.combo, cards: h.cards.slice() }))
  }
  const first = cand === null
    ? dispatch(st, { type: 'pass' }, seat)
    : dispatch(st, { type: 'play', cards: cand.cards }, seat)
  if (!first.ok) return 0.2
  let guard = 0
  while (st.phase !== 'over' && guard++ < 400) {
    const a = st.turn
    const act = heuristicPlay(playerView(st, a), a)
    if (!act || !dispatch(st, act, a).ok) break
  }
  if (st.phase !== 'over') return 0.45 // 推演超时：按略偏负处理
  return st.scores[seat] > 0 ? 1 : 0
}

/** 纯启发式出牌（模拟内部用，禁止再进蒙特卡洛） */
function heuristicPlay(view, seat) {
  if (!view.lastPlay) {
    const c = chooseLead(view, view.hand, seat)
    return c ? { type: 'play', cards: c.cards } : null
  }
  const c = chooseFollow(view, view.hand, seat)
  return c ? { type: 'play', cards: c.cards } : { type: 'pass' }
}

/** 蒙特卡洛主入口：对每个候选取平均胜率，预算内采样，平手尊重启发式排序 */
function monteCarlo(view, seat, candidates) {
  const playedSet = new Set()
  for (const c of view.hand) playedSet.add(c)
  for (const h of (view.played || [])) for (const c of h.cards) playedSet.add(c)
  const unseen = []
  for (let c = 0; c < 54; c++) if (!playedSet.has(c)) unseen.push(c)
  const otherSeats = [0, 1, 2].filter(s => s !== seat)
  const counts = otherSeats.map(s => view.handCounts[s])
  if (!counts.every(c => typeof c === 'number') || counts[0] + counts[1] !== unseen.length) return candidates[0]
  const t0 = now()
  const stats = candidates.map(() => ({ sum: 0, n: 0 }))
  for (let r = 0; r < MC_ROLLOUTS; r++) {
    const deck = unseen.slice()
    shuffleInPlace(deck)
    const oppHands = [deck.slice(0, counts[0]), deck.slice(counts[0])]
    for (let i = 0; i < candidates.length; i++) {
      stats[i].sum += simulate(view, seat, otherSeats, oppHands, candidates[i])
      stats[i].n++
      if (now() - t0 > MC_BUDGET_MS) break
    }
    if (now() - t0 > MC_BUDGET_MS) break
  }
  let bestIdx = -1, bestVal = -Infinity
  candidates.forEach((_, i) => {
    if (!stats[i].n) return
    // 平手时尊重启发式排序（越靠前加微小偏置）
    const v = stats[i].sum / stats[i].n + (candidates.length - i) * 1e-4
    if (v > bestVal) { bestVal = v; bestIdx = i }
  })
  return bestIdx >= 0 ? candidates[bestIdx] : candidates[0]
}

// ---------- 主入口 ----------
export function aiDecide(view, seat) {
  if (view.phase === 'bidding') {
    if (view.bidTurn !== seat) return null
    const want = evaluateBid(view.hand)
    return { type: 'bid', score: want > view.highBid ? want : 0 }
  }
  // 抢地主：自己当地主且倍数翻倍——牌力够「叫 2 分」才抢，弱牌白送倍数不抢
  if (view.phase === 'robbing') {
    if (view.robTurn !== seat) return null
    return { type: 'rob', rob: evaluateBid(view.hand) >= 2 }
  }
  // 加倍：农民中强牌加倍；地主已收底牌（20 张）门槛更高才超级加倍
  if (view.phase === 'doubling') {
    if (view.dblTurn !== seat) return null
    const power = evaluateBid(view.hand)
    return { type: 'double', double: power >= (seat === view.landlord ? 3 : 2) }
  }
  if (view.phase !== 'playing' || view.turn !== seat) return null
  const hand = view.hand
  const ranked = view.lastPlay
    ? scoreFollowCandidates(view, hand, seat)
    : scoreLeadCandidates(view, hand, seat)
  const pick = ranked[0]
  if (pick === undefined) return null
  // 一手走完直接出，无需推演
  if (pick && pick.cards && pick.cards.length === hand.length) return { type: 'play', cards: pick.cards }
  // 残局蒙特卡洛：候选不多、牌面收敛时采样推演（提示/测试可关）
  if (MC_ENABLED && endgameTrigger(view, seat)) {
    const cands = ranked.slice(0, MC_TOPK).filter(c => c === null || c.cards)
    if (cands.length > 1) {
      const best = monteCarlo(view, seat, cands)
      return best === null ? { type: 'pass' } : { type: 'play', cards: best.cards }
    }
  }
  if (pick === null) return { type: 'pass' }
  return pick.cards ? { type: 'play', cards: pick.cards } : { type: 'pass' }
}

// ---------- 提示（供人类玩家）：首出给推荐，跟出枚举最小（不跑蒙特卡洛，保持即点即得） ----------
export function hintPlay(view, hand, prevHintCards) {
  if (view.phase !== 'playing') return null
  if (!view.lastPlay) {
    const c = chooseLead(view, hand, 0)
    return c ? c.cards : null
  }
  const cands = enumerateCombos(hand).filter(c => canBeat(c, view.lastPlay.combo))
  if (!cands.length) return null
  cands.sort((a, b) => COMBO_COST(a) - COMBO_COST(b) || a.length - b.length)
  if (prevHintCards && prevHintCards.length) {
    const key = prevHintCards.slice().sort((x, y) => x - y).join(',')
    const idx = cands.findIndex(c => c.cards.slice().sort((x, y) => x - y).join(',') === key)
    if (idx >= 0 && idx + 1 < cands.length) return cands[idx + 1].cards
  }
  return cands[0].cards
}
