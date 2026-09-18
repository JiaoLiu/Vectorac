// ============================================================
// 四川麻将（血战到底）策略 AI（ai.js）
// ------------------------------------------------------------
// 导出入口（签名冻结）：
//   aiDecide(view, level, rng) -> Action | null
//     view  : 契约 PlayerView（座位视角，仅含受限信息）；
//     level : 'easy' | 'normal' | 'hard'；
//     rng   : () -> [0,1) 确定性随机源（由驱动方传入，相同序列 ⇒ 相同决策）；
//     返回动作不含 actionId / stateVersion（由 adapter 补齐）；
//     无合法动作或无法决策（如等待他人表态）时返回 null。
//   suggest(view, level) -> { text, action } | null
//     同一套决策逻辑，用于人类玩家的提示助手（只建议不代打）。
//     text 为一句包含理由的简短中文；action 与 aiDecide 一致
//     （suggest 内部使用固定随机源 () => 0.5，保证确定性）。
//
// 三档策略概要：
//   easy  : 先清缺门（legal 已按缺门优先过滤）→ 打孤张 → 同级随机；
//           不主动碰杠；能胡必胡。
//   normal: 弃牌逐候选评估 handShanten 取最小；同向听按有效进张数排序
//           （听牌用 tingTiles 听牌数 × 剩余可见张数，未听牌用搭子亲和度
//           启发式）；碰/杠当且仅当向听数下降；换三张选最孤立花色；
//           定缺选手牌最少且搭子最少的花色。
//   hard  : 在 normal 基础上增加放铳风险评估（只用公开信息：各家
//           弃牌+副露，等向听时优先打安全张）、听牌压制（自己听牌后
//           倾向打安全张维持听牌）、番型偏好（碰/杠/暗杠决策考虑清一色/
//           对对胡成形度，简单权重）、响应窗口能胡必胡（含抢杠）。
//
// 幺鸡局（view.yaoji = true）：幺鸡是万能牌，AI 一律留手里当赖子——
//   永不换出（换三张 / 兜底都不选它）、永不主动打出，统计定缺与换三张的
//   花色张数时也不计它（它豁免定缺，属条门但不算条门牌）。
//
// 铁律：
//   1. 只读 PlayerView 字段（自己 hand/melds、他人 handCount/discards/
//      melds/void、wallCount），严禁访问引擎内部 state、他人手牌内容、墙序。
//   2. 单次决策 < 50ms：只做枚举 + shanten/ting 评估，禁止深搜/蒙特卡洛。
//   3. 确定性：所有随机仅通过传入 rng；本文件无 Math.random / Date.now。
//   4. 兜底：任何分支拿不准或异常 → 第一个合法动作（响应窗口用 pass，
//      弃牌用 legal 里 discard.tiles[0]），永不 throw、永不返回非法动作。
//   5. 出牌只能从 view.legal 的 discard.tiles 里选（引擎已做缺门优先过滤）。
// ============================================================

import { SUITS, SUIT_NAMES, tileSuit, tileRank, tileName, YAOJI_TILE } from './contract.js'
import { handShanten, tingTiles } from './rules.js'

const LEVELS = ['easy', 'normal', 'hard']

// ---------- 通用小工具（纯函数） ----------

/** 数组中等于 t 的元素个数 */
function countIn(arr, t) {
  let n = 0
  for (let i = 0; i < arr.length; i++) if (arr[i] === t) n++
  return n
}

/** 移除第一张等于 t 的牌，返回新数组（不改原数组） */
function removeOne(arr, t) {
  const i = arr.indexOf(t)
  if (i < 0) return arr.slice()
  return arr.slice(0, i).concat(arr.slice(i + 1))
}

/**
 * 模拟副露（碰/杠）从手牌拿牌：优先真牌，不足张数用幺鸡补位（幺鸡局）。
 * 与引擎口径一致——用幺鸡补位时必须把幺鸡一并拿掉，否则会高估牌力，
 * 导致 AI 一有机会就用赖子碰杠（赖子留手上更值钱）。
 */
function removeForMeld(hand, tile, need, opts) {
  const out = hand.slice()
  let left = need
  for (let i = out.length - 1; i >= 0 && left > 0; i--) {
    if (out[i] === tile) { out.splice(i, 1); left-- }
  }
  if (left > 0 && opts && opts.yaoji) {
    for (let i = out.length - 1; i >= 0 && left > 0; i--) {
      if (out[i] === YAOJI_TILE) { out.splice(i, 1); left-- }
    }
  }
  return out
}

/**
 * 幺鸡局真牌是否单色（清一色路径；幺鸡可当任意花色，不计）。
 * 定缺阶段能碰/杠说明手上已无缺门牌，故只看真牌是否同花色即可。
 */
function isQingPath(hand) {
  let suit = null
  for (let i = 0; i < hand.length; i++) {
    const t = hand[i]
    if (t === YAOJI_TILE) continue
    const s = tileSuit(t)
    if (suit == null) suit = s
    else if (suit !== s) return false
  }
  return true
}

/** 用 rng 从数组中等概率取一个（确定性） */
function rngPick(arr, rand) {
  if (!arr || !arr.length) return null
  let idx = Math.floor(rand() * arr.length)
  if (!(idx >= 0)) idx = 0
  if (idx > arr.length - 1) idx = arr.length - 1
  return arr[idx]
}

/** 手牌（含 drawnTile）合并视图：discard 阶段为 3n+2 形 */
function fullHandOf(view) {
  const my = view.my || {}
  const hand = my.hand || []
  return my.drawnTile != null ? hand.concat([my.drawnTile]) : hand.slice()
}

/**
 * 幺鸡局规则选项：幺鸡局里幺鸡当万能牌，向 rules.js 的判定函数透传，
 * 让向听/听牌评估与引擎口径一致（非幺鸡局返回 undefined，保持原行为）。
 */
function ruleOpts(view) {
  return view && view.yaoji === true ? { yaoji: true } : undefined
}

/**
 * 估算自己的座位号（PlayerView 未直接提供 my.seat）：
 * discard 阶段行动者必是自己；respond 阶段 waiting 仅剩一人时即自己；
 * 其余用 handCount/void/副露/弃牌序列特征匹配，匹配不唯一则返回 null（容忍）。
 */
function selfSeatOf(view) {
  const players = view.players || []
  const my = view.my || {}
  if (view.phase === 'discard') return view.turn
  if (view.phase === 'respond' && Array.isArray(view.waiting) && view.waiting.length === 1) {
    return view.waiting[0]
  }
  const hc = (my.hand || []).length + (my.drawnTile != null ? 1 : 0)
  let cands = players.filter(
    p =>
      p &&
      p.handCount === hc &&
      p.void === my.void &&
      (p.melds || []).length === (my.melds || []).length &&
      (p.discards || []).length === (my.discards || []).length
  )
  if (cands.length === 1) return cands[0].seat
  const strict = cands.filter(p => {
    const d1 = p.discards || []
    const d2 = my.discards || []
    if (d1.length !== d2.length) return false
    for (let i = 0; i < d1.length; i++) if (d1[i] !== d2[i]) return false
    return true
  })
  return strict.length === 1 ? strict[0].seat : null
}

/**
 * 牌 t 的剩余张数 = 4 - 已见张数。
 * 已见 = 自己手牌(含 drawnTile) + 全部玩家的副露与弃牌（players 含自己镜像，
 * 因此自己的公开副露/弃牌恰好被计一次，自己的手牌由 my 补充）。
 */
function remainingOf(view, t) {
  const my = view.my || {}
  let seen = countIn(my.hand || [], t)
  if (my.drawnTile === t) seen++
  for (const p of view.players || []) {
    for (const m of p.melds || []) {
      if (m && m.tile === t) seen += m.kind === 'gang' ? 4 : 3
    }
    seen += countIn(p.discards || [], t)
  }
  return Math.max(0, 4 - seen)
}

/**
 * t 在 hand 中的“邻居数”：其它张与 t 同牌或同花色且点数差 ≤2 的数量
 * （同牌按 hand 内总张数 - 1 计，扣除自身；孤张 ⇒ 0）
 */
function neighborsIn(hand, t) {
  const suit = tileSuit(t)
  const rank = tileRank(t)
  let same = 0
  let adj = 0
  for (const x of hand) {
    if (x === t) same++
    else if (tileSuit(x) === suit && Math.abs(tileRank(x) - rank) <= 2) adj++
  }
  return same - 1 + adj
}

/**
 * 放铳风险得分（仅 hard 使用，越大越安全）：
 *   - 牌已出现在任意公开弃牌堆 → 绝对安全加分（振听/一发简化）；
 *   - 对每个活跃对手：其副露集中于该花色、或其弃牌中该花色占比低（说明留有该花色）
 *     → 危险；中间张更危险；副露多（接近听牌）的对手危险放大。
 * 全部信息来自 PlayerView 公开字段。
 */
function safeScoreOf(view, t) {
  let score = 0
  const selfSeat = selfSeatOf(view)
  const suit = tileSuit(t)
  const rank = tileRank(t)
  let inDiscards = false
  for (const p of view.players || []) {
    if (countIn(p.discards || [], t) > 0) {
      inDiscards = true
      break
    }
  }
  if (inDiscards) score += 3
  for (const p of view.players || []) {
    if (selfSeat != null && p.seat === selfSeat) continue
    if (p.hu) continue // 已胡者不再放铳给自己
    if (countIn(p.discards || [], t) > 0) continue // 该对手已弃过此牌 → 对其安全
    let danger = 0.5
    for (const m of p.melds || []) {
      if (m && tileSuit(m.tile) === suit) danger += 1.5 // 对手碰/杠该花色 → 收该花色
    }
    const total = (p.discards || []).length
    if (total > 0) {
      const ratio = (p.discards || []).filter(d => tileSuit(d) === suit).length / total
      danger += (1 - ratio) * 1.2 // 弃得少 → 手里留得多 → 危险
    }
    const mid = rank >= 4 && rank <= 6 ? 1.3 : rank === 3 || rank === 7 ? 1.15 : 1
    danger *= mid
    danger *= 1 + (p.melds || []).length * 0.12
    score -= danger
  }
  return score
}

/**
 * 番型成形度（hard 碰/杠决策的简单权重）：
 * 缺门外两门花色中主门占比 ≥ 65% 且牌属主门 → 清一色潜力；
 * 或手牌对子 ≥ 3 组且该牌成对 → 对对胡潜力。
 */
function biasHigh(view, t) {
  const my = view.my || {}
  const full = fullHandOf(view)
  const cnt = { wan: 0, tong: 0, tiao: 0 }
  for (const x of full) cnt[tileSuit(x)]++
  for (const m of my.melds || []) {
    if (m) cnt[tileSuit(m.tile)] += m.kind === 'gang' ? 4 : 3
  }
  const suits = SUITS.filter(s => s !== my.void)
  if (!suits.length) return false
  const main = cnt[suits[0]] >= cnt[suits[1]] ? suits[0] : suits[1]
  const total = cnt[suits[0]] + cnt[suits[1]]
  if (total > 0 && total * 0.65 <= Math.max(cnt[suits[0]], cnt[suits[1]]) && tileSuit(t) === main) {
    return true
  }
  const kinds = {}
  for (const x of full) kinds[x] = (kinds[x] || 0) + 1
  let pairs = 0
  for (const k in kinds) if (kinds[k] >= 2) pairs++
  return pairs >= 3 && (kinds[t] || 0) >= 2
}

// ---------- 向听 / 进张评估 ----------

/** 3n+2 形手牌的当前向听数 = 枚举弃一张后的最小 handShanten */
function bestShanten(hand3n2, meldCount, opts) {
  const uniq = Array.from(new Set(hand3n2))
  if (!uniq.length) return handShanten(hand3n2, meldCount, opts)
  let best = Infinity
  for (const u of uniq) {
    const s = handShanten(removeOne(hand3n2, u), meldCount, opts)
    if (s < best) best = s
  }
  return best
}

/**
 * 有效进张分（越大越好）：
 *   - 已听牌（s === 0）：tingTiles 听牌数 × 各听牌剩余张数（任务定义）；
 *   - 未听牌：搭子亲和度启发式 —— 对每种与手牌同点/邻点/隔点的牌按
 *     结构权重 × 剩余张数求和（无递归向听计算，保证 <50ms）。
 */
function drawScoreOf(view, hand3n1, meldCount, s, opts) {
  if (s === 0) {
    const waits = tingTiles(hand3n1, meldCount, opts) || []
    if (waits.length) {
      let sum = 0
      for (const w of waits) sum += remainingOf(view, w)
      return sum
    }
    return 0
  }
  const cnt = new Array(27).fill(0)
  for (const t of hand3n1) cnt[t]++
  let score = 0
  for (let d = 0; d < 27; d++) {
    const rem = remainingOf(view, d)
    if (rem <= 0) continue
    let w = 0
    if (cnt[d] >= 2) w = 3 // 摸成刻子
    else if (cnt[d] === 1) w = 2 // 摸成对子
    const rank = d % 9
    if (rank > 0 && cnt[d - 1] > 0) w = Math.max(w, 2) // 顺子搭子
    if (rank < 8 && cnt[d + 1] > 0) w = Math.max(w, 2)
    if (rank > 1 && cnt[d - 2] > 0) w = Math.max(w, 1) // 隔张搭子
    if (rank < 7 && cnt[d + 2] > 0) w = Math.max(w, 1)
    score += w * rem
  }
  return score / 2
}

// ---------- 各阶段决策（返回 { action, reason } | null） ----------

/** 换三张：选手牌最少（normal/hard 再叠加搭子最少）的花色，取其中最孤立的 3 张 */
function decideSwap(view, level, rand) {
  const hand = (view.my && view.my.hand) || []
  if (hand.length < 3) return null
  const yaoji = view.yaoji === true
  const bySuit = { wan: [], tong: [], tiao: [] }
  for (const t of hand) {
    // 幺鸡局：幺鸡是万能牌（赖子），绝不当换三张的筹码送出去，留手里最值钱。
    // 幺鸡本属条门，若不去掉，条门张数会被高估、且它的邻居恒为 0，
    // 排序时反而排在最前被优先换出。
    if (yaoji && t === YAOJI_TILE) continue
    bySuit[tileSuit(t)].push(t)
  }
  const cands = SUITS.filter(s => bySuit[s].length >= 3)
  if (!cands.length) return null // 13 张真牌去幺鸡后必有一门 ≥3，实际不可达
  let pick = cands[0]
  let best = Infinity
  for (const s of cands) {
    const tiles = bySuit[s]
    let score = tiles.length
    if (level !== 'easy') {
      let adj = 0
      for (const t of tiles) adj += neighborsIn(tiles, t)
      score += adj * 0.1 // 搭子越少越好
    }
    score += rand() * 1e-6
    if (score < best) {
      best = score
      pick = s
    }
  }
  const tiles = bySuit[pick].slice()
  tiles.sort((a, b) => neighborsIn(tiles, a) - neighborsIn(tiles, b) || a - b)
  const three = tiles.slice(0, 3).sort((a, b) => a - b)
  return {
    action: { type: 'swap', tiles: three },
    reason: `建议换${three.map(tileName).join('')}：该花色牌少且最孤立，换出后手牌结构更好`
  }
}

/** 定缺：选手牌最少（normal/hard 再叠加搭子最少）的花色（只从 legal.suits 里选） */
function decideVoid(view, level, rand) {
  const opt = (view.legal || []).find(o => o.type === 'void')
  if (!opt || !Array.isArray(opt.suits) || !opt.suits.length) return null
  const hand = (view.my && view.my.hand) || []
  const yaoji = view.yaoji === true
  const bySuit = { wan: [], tong: [], tiao: [] }
  for (const t of hand) {
    // 幺鸡局：幺鸡豁免定缺（不算缺门牌），统计各门张数时不计入，
    // 否则条门被虚高，AI 反而不愿把真正零散的条门定为缺。
    if (yaoji && t === YAOJI_TILE) continue
    bySuit[tileSuit(t)].push(t)
  }
  let pick = opt.suits[0]
  let best = Infinity
  for (const s of opt.suits) {
    const tiles = bySuit[s] || []
    let score = tiles.length
    if (level !== 'easy') {
      let adj = 0
      for (const t of tiles) adj += neighborsIn(tiles, t)
      score += adj * 0.1
    }
    score += rand() * 1e-6
    if (score < best) {
      best = score
      pick = s
    }
  }
  return {
    action: { type: 'void', suit: pick },
    reason: `建议定缺${SUIT_NAMES[pick]}：该花色张数最少${level !== 'easy' ? '且搭子最少' : ''}，最容易打缺`
  }
}

/**
 * 弃牌核心：easy 走缺门/孤张启发式；normal/hard 走向听数最小 →
 * 有效进张 → （hard）安全度的字典序评分（rand 兜底打破平级）。
 */
function decideDiscard(view, candidates, level, rand, opts) {
  const my = view.my || {}
  const full = fullHandOf(view)
  const meldCount = (my.melds || []).length

  if (level === 'easy') {
    const voidTiles = my.void ? candidates.filter(t => tileSuit(t) === my.void) : []
    let pool
    let why
    if (voidTiles.length) {
      pool = voidTiles
      why = '缺门未打完，先清缺门'
    } else {
      const isolated = candidates.filter(t => neighborsIn(full, t) === 0)
      pool = isolated.length ? isolated : candidates.slice()
      why = isolated.length ? '孤张，与其它牌无法组成搭子' : '没有明显更优目标'
    }
    const t = rngPick(pool, rand)
    if (t == null) return null
    return { action: { type: 'discard', tile: t }, reason: `建议打${tileName(t)}：${why}` }
  }

  // normal / hard：向听数最小化
  const infos = []
  for (const t of candidates) {
    const h = removeOne(full, t)
    infos.push({ t, h, s: handShanten(h, meldCount, opts) })
  }
  let sMin = Infinity
  for (const x of infos) if (x.s < sMin) sMin = x.s
  const sBefore = bestShanten(full, meldCount, opts)
  const pool = infos.filter(x => x.s === sMin)
  for (const x of pool) {
    x.e = drawScoreOf(view, x.h, meldCount, x.s, opts)
    x.iso = neighborsIn(full, x.t)
    x.safe = level === 'hard' ? safeScoreOf(view, x.t) : 0
    x.r = rand()
  }
  // 评分：hard 听牌时安全优先（听牌压制），未听牌时进张优先、安全作次级；
  // normal 用进张 + 孤张/边张微调。
  const safeWeight = level === 'hard' ? (sMin === 0 ? 3 : 0.3) : 0
  const keyOf = x => {
    const isoBonus = (3 - Math.min(3, x.iso)) * 0.05
    const edgeBonus = tileRank(x.t) === 1 || tileRank(x.t) === 9 ? 0.03 : 0
    if (level === 'hard') {
      if (sMin === 0) return x.safe * 3 + x.e // 听牌压制：安全张维持听牌
      return x.e + x.safe * safeWeight + isoBonus
    }
    return x.e + isoBonus + edgeBonus
  }
  let best = pool[0]
  for (const x of pool) {
    const ka = keyOf(x)
    const kb = keyOf(best)
    if (ka > kb + 1e-9 || (Math.abs(ka - kb) <= 1e-9 && x.r < best.r)) best = x
  }
  const parts = []
  if (sMin < sBefore) parts.push(`向听数 ${sBefore}→${sMin}`)
  else parts.push(`保持当前向听数（${sMin}）`)
  if (best.e > 0) parts.push(sMin === 0 ? `有效进张 ${best.e}` : '有效进张更多')
  if (level === 'hard' && best.safe > 0.5) parts.push('相对安全')
  return {
    action: { type: 'discard', tile: best.t },
    reason: `建议打${tileName(best.t)}：${parts.join('，')}`
  }
}

/** 摸打阶段：能胡必胡 → 暗杠/补杠评估 → 弃牌 */
function decideDiscardPhase(view, level, rand) {
  const legal = view.legal || []
  const opts = ruleOpts(view)
  const huOpt = legal.find(o => o.type === 'hu')
  if (huOpt) {
    return { action: { type: 'hu' }, reason: '能胡必胡' }
  }
  const full = fullHandOf(view)
  const meldCount = (view.my.melds || []).length
  const gangOpt = legal.find(o => o.type === 'gang')
  if (gangOpt && level !== 'easy' && Array.isArray(gangOpt.options)) {
    const sNow = bestShanten(full, meldCount, opts)
    let bestG = null
    for (const g of gangOpt.options) {
      const t = g.tile
      if (t == null) continue
      // 暗杠：手牌-4（幺鸡局不足张数用幺鸡补位，实际消耗赖子）、副露+1；
      // 补杠：手牌-1（优先真牌，没有真牌则扣掉幺鸡补位）、副露数不变
      const sAfter =
        g.gangType === 'an'
          ? handShanten(removeForMeld(full, t, 4, opts), meldCount + 1, opts)
          : handShanten(removeForMeld(full, t, 1, opts), meldCount, opts)
      const want =
        sAfter < sNow ||
        (level === 'hard' && sAfter === sNow && (biasHigh(view, t) || (g.gangType === 'an' && sNow <= 1)))
      if (want && (!bestG || sAfter < bestG.sAfter)) bestG = { g, sAfter }
    }
    if (bestG) {
      const gt = bestG.g.gangType
      return {
        action: { type: 'gang', tile: bestG.g.tile, gangType: gt },
        reason:
          bestG.sAfter < sNow
            ? `建议${gt === 'an' ? '暗杠' : '补杠'}${tileName(bestG.g.tile)}：向听数 ${sNow}→${bestG.sAfter}`
            : `建议${gt === 'an' ? '暗杠' : '补杠'}${tileName(bestG.g.tile)}：不伤手牌结构，提升番型成形度`
      }
    }
  }
  // 幺鸡局：带幺鸡的杠若手里已有对应真牌，换回幺鸡当赖子（更灵活，总是有利）
  const swapOpt = legal.find(o => o.type === 'swap-yaoji')
  if (swapOpt && swapOpt.tile != null) {
    return {
      action: { type: 'swap-yaoji', tile: swapOpt.tile },
      reason: `建议换幺鸡：用${tileName(swapOpt.tile)}换回幺鸡当赖子`
    }
  }
  const discOpt = legal.find(o => o.type === 'discard')
  if (!discOpt || !Array.isArray(discOpt.tiles) || !discOpt.tiles.length) return null
  // 幺鸡局：幺鸡是万能牌，绝不主动打出（它当任意牌用，比任何真牌都值钱）。
  // 只在引擎确实给了别的可打牌时才过滤，避免把候选清空。
  let cands = discOpt.tiles
  if (view.yaoji === true && cands.length > 1) {
    const real = cands.filter(t => t !== YAOJI_TILE)
    if (real.length) cands = real
  }
  return decideDiscard(view, cands, level, rand, opts)
}

/**
 * 响应窗口（对 pendingDiscard / pendingKong 表态）：
 * 能胡必胡（含抢杠，easy 亦然）→ easy 直接 pass →
 * 明杠/碰仅当向听数下降（hard 放宽至成形度高的平级碰杠）→ pass。
 */
function decideRespond(view, level, rand) {
  const legal = view.legal || []
  const huOpt = legal.find(o => o.type === 'hu')
  if (huOpt) {
    const how = huOpt.how === 'qianggang' ? '抢杠' : huOpt.how === 'zimo' ? '自摸' : '点炮'
    return { action: { type: 'hu' }, reason: `能胡（${how}），必胡` }
  }
  if (level === 'easy') {
    return { action: { type: 'pass' }, reason: '建议过：简单档不主动碰杠' }
  }
  const hand = (view.my && view.my.hand) || []
  const meldCount = ((view.my && view.my.melds) || []).length
  const opts = ruleOpts(view)
  const sNow = handShanten(hand, meldCount, opts)

  // 明杠（针对 pendingDiscard）
  const gangOpt = legal.find(o => o.type === 'gang')
  if (gangOpt && Array.isArray(gangOpt.options)) {
    for (const g of gangOpt.options) {
      const t = g.tile
      if (t == null) continue
      const sAfter = handShanten(removeForMeld(hand, t, 3, opts), meldCount + 1, opts)
      if (sAfter < sNow || (level === 'hard' && sAfter === sNow && biasHigh(view, t))) {
        return {
          action: { type: 'gang', tile: t, gangType: g.gangType || 'ming' },
          reason:
            sAfter < sNow
              ? `建议杠：向听数 ${sNow}→${sAfter}`
              : `建议杠${tileName(t)}：提升清一色/对对胡成形度`
        }
      }
    }
  }

  // 碰
  const pengOpt = legal.find(o => o.type === 'peng')
  if (pengOpt) {
    const t = pengOpt.tile != null ? pengOpt.tile : view.pendingDiscard ? view.pendingDiscard.tile : null
    if (t != null) {
      // 手上真牌不足 2 张时碰要靠幺鸡补位（消耗赖子），单独评估
      const needWild = opts && opts.yaoji && countIn(hand, t) < 2
      const sAfter = bestShanten(removeForMeld(hand, t, 2, opts), meldCount + 1, opts)
      if (needWild) {
        // 赖子留手上做牌更强：只有做清一色且不亏向听时才值得用赖子碰；
        // 平胡等普通牌型没必要为此花掉赖子。
        if (isQingPath(hand) && sAfter <= sNow) {
          return { action: { type: 'peng' }, reason: `建议碰${tileName(t)}：用赖子补位做清一色` }
        }
        return {
          action: { type: 'pass' },
          reason: `建议过：用赖子碰${tileName(t)}不划算，赖子留手上做牌更值`
        }
      }
      if (sAfter < sNow || (level === 'hard' && sAfter === sNow && biasHigh(view, t))) {
        return {
          action: { type: 'peng' },
          reason:
            sAfter < sNow
              ? `建议碰：向听数 ${sNow}→${sAfter}`
              : `建议碰${tileName(t)}：提升清一色/对对胡成形度`
        }
      }
    }
  }

  return { action: { type: 'pass' }, reason: `建议过：碰杠不降向听数（当前 ${sNow}）` }
}

// ---------- 兜底：永不 throw、永不返回非法动作 ----------

/** 换三张兜底：任意一门 ≥3 张的花色取 3 张（鸽笼保证存在） */
function fallbackSwapTiles(view) {
  const hand = (view.my && view.my.hand) || []
  const yaoji = view && view.yaoji === true
  const bySuit = {}
  for (const t of hand) {
    // 幺鸡局：幺鸡留手里当赖子，不参与换三张（同 decideSwap）
    if (yaoji && t === YAOJI_TILE) continue
    const s = tileSuit(t)
    ;(bySuit[s] = bySuit[s] || []).push(t)
  }
  for (const s of SUITS) {
    if (bySuit[s] && bySuit[s].length >= 3) return bySuit[s].slice(0, 3)
  }
  return null
}

/**
 * 兜底动作：能胡先胡 → 弃牌 tiles[0] → pass → 定缺 suits[0] → 换三张 →
 * 杠 options[0] → 碰。legal 为空返回 null。
 */
function fallbackAction(view) {
  const legal = (view && view.legal) || []
  if (!legal.length) return null
  if (legal.some(o => o.type === 'hu')) return { type: 'hu' }
  const disc = legal.find(o => o.type === 'discard')
  if (disc && Array.isArray(disc.tiles) && disc.tiles.length) {
    return { type: 'discard', tile: disc.tiles[0] }
  }
  if (legal.some(o => o.type === 'pass')) return { type: 'pass' }
  const voidOpt = legal.find(o => o.type === 'void')
  if (voidOpt && Array.isArray(voidOpt.suits) && voidOpt.suits.length) {
    return { type: 'void', suit: voidOpt.suits[0] }
  }
  if (legal.some(o => o.type === 'swap')) {
    const tiles = fallbackSwapTiles(view)
    if (tiles) return { type: 'swap', tiles }
  }
  const gang = legal.find(o => o.type === 'gang')
  if (gang && Array.isArray(gang.options) && gang.options.length) {
    const g = gang.options[0]
    return { type: 'gang', tile: g.tile, gangType: g.gangType }
  }
  if (legal.some(o => o.type === 'peng')) return { type: 'peng' }
  return null
}

// ---------- 主入口 ----------

/** 核心决策：返回 { action, reason } | null（不 throw） */
function decideCore(view, level, rand) {
  if (!view || !Array.isArray(view.legal) || view.legal.length === 0) return null
  const lv = LEVELS.indexOf(level) >= 0 ? level : 'normal'
  let r = null
  switch (view.phase) {
    case 'swap':
      r = decideSwap(view, lv, rand)
      break
    case 'void':
      r = decideVoid(view, lv, rand)
      break
    case 'discard':
      r = decideDiscardPhase(view, lv, rand)
      break
    case 'respond':
      r = decideRespond(view, lv, rand)
      break
    default:
      r = null
  }
  if (r && r.action) return r
  const fb = fallbackAction(view)
  return fb ? { action: fb, reason: '兜底策略：选择第一个合法动作' } : null
}

/**
 * AI 决策入口（签名冻结）。
 * @param {object} view 契约 PlayerView（座位视角）
 * @param {'easy'|'normal'|'hard'} level 难度
 * @param {function(): number} rng () -> [0,1) 确定性随机源
 * @returns {object|null} 不含 actionId/stateVersion 的动作；无法决策返回 null
 */
export function aiDecide(view, level, rng) {
  try {
    const rand = typeof rng === 'function' ? rng : () => 0.5
    const r = decideCore(view, level, rand)
    return r ? r.action : null
  } catch (e) {
    try {
      return fallbackAction(view)
    } catch (e2) {
      return null
    }
  }
}

/**
 * 提示助手（签名冻结）：与 aiDecide 同一套决策逻辑（固定随机源 0.5），
 * 只用受限信息，仅建议不代打。
 * @param {object} view 契约 PlayerView
 * @param {'easy'|'normal'|'hard'} level 难度
 * @returns {{text: string, action: object}|null}
 */
export function suggest(view, level) {
  try {
    const r = decideCore(view, level, () => 0.5)
    if (!r) return null
    return { text: r.reason || '暂无建议', action: r.action }
  } catch (e) {
    return null
  }
}
