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

// ---------- 最少手数（最优拆牌）：记忆化搜索 ----------
// 求「打空这些牌的最少出牌次数」。比贪心 decompose 更准：remain/delta 评估由此受益。
// 状态 = 各点数（3..17→idx0..14）余量；WLOG 首手必含最低非空点，避免排列爆炸。
// 翅膀（三带/四带/飞机带牌）取最小可用牌（近最优），序列（顺/连对/飞机）穷举。
const _mhMemo = new Map()
const _MH_MEMO_MAX = 200000

function _mhCnt(hand) {
  const cnt = new Array(15).fill(0)
  for (const c of hand) cnt[rankOf(c) - 3]++
  return cnt
}

/** 飞机带牌：从主体区间 [bodyStart, bodyStart+k) 之外取 k 个点数作翅膀（单翼 per=1，对翼 per=2），取最小 */
function _pickWings(cnt, bodyStart, k, per) {
  const out = []
  for (let i = 0; i < 15 && out.length < k; i++) {
    if (i >= bodyStart && i < bodyStart + k) continue // 排除飞机主体占用的点
    if (cnt[i] >= per) out.push(i)
  }
  return out.length === k ? out : null
}

function _minHandsCnt(cnt) {
  const key = cnt.join('')
  const hit = _mhMemo.get(key)
  if (hit !== undefined) return hit
  let lo = -1, total = 0
  for (let i = 0; i < 15; i++) {
    if (cnt[i] > 0) { if (lo < 0) lo = i; total += cnt[i] }
  }
  if (total === 0) return 0
  let best = total // 上界：全单张
  const use = (i, k) => { cnt[i] -= k }
  const unuse = (i, k) => { cnt[i] += k }
  const rec = () => _minHandsCnt(cnt)
  const cLo = cnt[lo]

  // 单/对/三/炸（含最低点 lo）
  if (cLo >= 1) { use(lo, 1); best = Math.min(best, 1 + rec()); unuse(lo, 1) }
  if (cLo >= 2) { use(lo, 2); best = Math.min(best, 1 + rec()); unuse(lo, 2) }
  if (cLo >= 3) { use(lo, 3); best = Math.min(best, 1 + rec()); unuse(lo, 3) }
  if (cLo === 4) { use(lo, 4); best = Math.min(best, 1 + rec()); unuse(lo, 4) }
  // 王炸
  if ((lo === 13 || lo === 14) && cnt[13] >= 1 && cnt[14] >= 1) {
    use(13, 1); use(14, 1); best = Math.min(best, 1 + rec()); unuse(13, 1); unuse(14, 1)
  }
  // 三带一 / 三带二
  if (cLo >= 3) {
    for (let w = 0; w < 15; w++) {
      if (w === lo || cnt[w] < 1) continue
      use(lo, 3); use(w, 1); best = Math.min(best, 1 + rec()); unuse(lo, 3); unuse(w, 1)
      if (cnt[w] >= 2) { use(lo, 3); use(w, 2); best = Math.min(best, 1 + rec()); unuse(lo, 3); unuse(w, 2) }
    }
  }
  // 四带二（两张单 / 两对）
  if (cLo === 4) {
    for (let a = 0; a < 15; a++) {
      if (a === lo || cnt[a] < 1) continue
      for (let b = a; b < 15; b++) {
        if (b === lo || cnt[b] < 1) continue
        if (b === a && cnt[a] < 2) continue
        use(lo, 4); use(a, 1); use(b, 1); best = Math.min(best, 1 + rec()); unuse(lo, 4); unuse(a, 1); unuse(b, 1)
      }
    }
    for (let a = 0; a < 15; a++) {
      if (a === lo || cnt[a] < 2) continue
      for (let b = a + 1; b < 15; b++) {
        if (b === lo || cnt[b] < 2) continue
        use(lo, 4); use(a, 2); use(b, 2); best = Math.min(best, 1 + rec()); unuse(lo, 4); unuse(a, 2); unuse(b, 2)
      }
    }
  }
  // 顺子（idx0..11，即 3..A，2/王不进）
  if (lo <= 11) {
    for (let len = 5; lo + len - 1 <= 11; len++) {
      let ok = true
      for (let i = lo; i < lo + len; i++) if (cnt[i] < 1) { ok = false; break }
      if (!ok) break
      for (let i = lo; i < lo + len; i++) use(i, 1)
      best = Math.min(best, 1 + rec())
      for (let i = lo; i < lo + len; i++) unuse(i, 1)
    }
  }
  // 连对（3+ 对）
  if (lo <= 11 && cLo >= 2) {
    for (let pairs = 3; lo + pairs - 1 <= 11; pairs++) {
      let ok = true
      for (let i = lo; i < lo + pairs; i++) if (cnt[i] < 2) { ok = false; break }
      if (!ok) break
      for (let i = lo; i < lo + pairs; i++) use(i, 2)
      best = Math.min(best, 1 + rec())
      for (let i = lo; i < lo + pairs; i++) unuse(i, 2)
    }
  }
  // 飞机（2+ 连三），可裸/带 k 单/带 k 对（翼取最小，近最优控分支）
  if (lo <= 11 && cLo >= 3) {
    for (let k = 2; lo + k - 1 <= 11; k++) {
      let ok = true
      for (let i = lo; i < lo + k; i++) if (cnt[i] < 3) { ok = false; break }
      if (!ok) break
      for (let i = lo; i < lo + k; i++) use(i, 3)
      best = Math.min(best, 1 + rec())
      const wingS = _pickWings(cnt, lo, k, 1)
      const wingP = _pickWings(cnt, lo, k, 2)
      if (wingS) for (const w of wingS) use(w, 1)
      if (wingS) best = Math.min(best, 1 + rec())
      if (wingS) for (const w of wingS) unuse(w, 1)
      if (wingP) for (const w of wingP) use(w, 2)
      if (wingP) best = Math.min(best, 1 + rec())
      if (wingP) for (const w of wingP) unuse(w, 2)
      for (let i = lo; i < lo + k; i++) unuse(i, 3)
    }
  }
  if (_mhMemo.size > _MH_MEMO_MAX) _mhMemo.clear()
  _mhMemo.set(key, best)
  return best
}

export function minHands(hand) {
  // 取「搜索值」与「贪心拆牌值」的较小者：
  // 贪心 decompose 给出一组合法拆牌（=可达上界），搜索值在多数情况更优（更接近真实最少手数）。
  // 二者取 min 保证 handsCount 永不劣于旧贪心，且更贴近真实最小手数。
  const searched = _minHandsCnt(_mhCnt(hand))
  const greedy = decompose(hand).length
  return Math.min(searched, greedy)
}

export function handsCount(hand) {
  return minHands(hand)
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

// 分层预算：残局多采样、中期少采样，均带时间预算；单步决策硬顶护流畅
const MC_TIERS = {
  end: { budget: 380, rollouts: 14, topk: 7 },   // 残局：充分推演（与旧版一致）
  mid: { budget: 45, rollouts: 5, topk: 4 },    // 关键抉择 / 对手快跑
  light: { budget: 30, rollouts: 3, topk: 4 }   // 牌面收敛但非关键
}
const MC_HARD_CAP_MS = 120 // 启发式 + MC 合计硬顶，避免联机卡顿

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
}

/** 是否值得跑蒙特卡洛、跑哪一档：返回档位对象或 null（前期纯启发式保流畅） */
function mcPlan(view, seat, ranked) {
  if (ranked.length <= 1) return null // 无可比候选，无需推演
  const myN = view.hand.length
  const others = [0, 1, 2].filter(s => s !== seat)
  const counts = others.map(s => view.handCounts[s])
  if (!counts.every(c => typeof c === 'number')) return null
  const totalUnseen = counts.reduce((a, b) => a + b, 0)
  const minOpp = Math.min(...counts)
  const threat = minOpp <= 2 // 对手报单/报双
  const top1 = ranked[0]
  const key = ranked.includes(null) ||
    (top1 && (top1.type === 'bomb' || top1.type === 'rocket' || top1.type === 'quad_solo' || top1.type === 'quad_pair'))
  if (myN <= 6 || minOpp <= 4 || totalUnseen <= 12) return MC_TIERS.end
  if (threat || key) return MC_TIERS.mid
  if (myN <= 10 || totalUnseen <= 20) return MC_TIERS.light
  return null // 前期牌多、局面平淡：纯启发式
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
function monteCarlo(view, seat, candidates, plan) {
  const { budget, rollouts, topk } = plan
  const t0 = now()
  const cap = () => now() - t0 > Math.min(budget, MC_HARD_CAP_MS)
  const playedSet = new Set()
  for (const c of view.hand) playedSet.add(c)
  for (const h of (view.played || [])) for (const c of h.cards) playedSet.add(c)
  const unseen = []
  for (let c = 0; c < 54; c++) if (!playedSet.has(c)) unseen.push(c)
  const otherSeats = [0, 1, 2].filter(s => s !== seat)
  const counts = otherSeats.map(s => view.handCounts[s])
  if (!counts.every(c => typeof c === 'number') || counts[0] + counts[1] !== unseen.length) return candidates[0]
  const cands = candidates.slice(0, topk)
  const stats = cands.map(() => ({ sum: 0, n: 0 }))
  for (let r = 0; r < rollouts; r++) {
    const deck = unseen.slice()
    shuffleInPlace(deck)
    const oppHands = [deck.slice(0, counts[0]), deck.slice(counts[0])]
    for (let i = 0; i < cands.length; i++) {
      stats[i].sum += simulate(view, seat, otherSeats, oppHands, cands[i])
      stats[i].n++
      if (cap()) break
    }
    if (cap()) break
  }
  let bestIdx = -1, bestVal = -Infinity
  cands.forEach((_, i) => {
    if (!stats[i].n) return
    // 平手时尊重启发式排序（越靠前加微小偏置）
    const v = stats[i].sum / stats[i].n + (cands.length - i) * 1e-4
    if (v > bestVal) { bestVal = v; bestIdx = i }
  })
  return bestIdx >= 0 ? cands[bestIdx] : cands[0]
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
  // 全阶段蒙特卡洛（残局/关键抉择/牌面收敛时）：采样推演选平均胜率最高（提示/测试可关）
  const plan = MC_ENABLED ? mcPlan(view, seat, ranked) : null
  if (plan) {
    const cands = ranked.slice(0, plan.topk).filter(c => c === null || c.cards)
    if (cands.length > 1) {
      const best = monteCarlo(view, seat, cands, plan)
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
