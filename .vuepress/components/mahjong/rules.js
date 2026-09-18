// ============================================================
// 四川麻将（血战到底）牌型与番型纯函数（rules.js）
// ------------------------------------------------------------
// 规则版本 scmj-1.0（与 contract.js 一致）
//
// 番型表（番 = 2 的指数，每 +1 番即翻一倍；倍数 = 2^番）：
//   平胡 0（1 倍）| 对对胡 1（2 倍）| 七对 2（4 倍）| 龙七对 3（8 倍）
//   金钩钓 3（8 倍，四副露碰/杠到底 + 手里单吊将；比对对胡高一档，取最高番型计）
//   清一色 +2（4 倍，加法，不随基础番型再乘）
//   组合示例：清对 3 番 8 倍、清七对 4 番 16 倍、清龙七对 5 番 32 倍
//   加法项：根 +1/组（明/暗/补杠与碰后留一张都算，七对系已含不重复）、
//           自摸 +1、海底 +1、杠上胡 +1
//   单笔支付 = 2^min(fan, capFan)；平胡 0 番时仍付 1 分底注
//   七对仅门清（meldCount === 0）
//
// 冻结导出（ai.js / engine.js / 测试共同依赖，签名不可变）：
//   isWinHand(hand, meldCount, opts?) -> bool            opts.yaoji 幺鸡当万能牌
//   winShape(hand, meldCount, opts?) -> null | {qidui, longQidui, pengpeng, jingou, qing}
//   countGen(hand, melds) -> number
//   fanOf(shape, {zimo, haidi, gangshang, qianggang, gen, genFan, capFan, noYaoji}) -> {fan, names}
//   finalFan(hand, melds, {zimo, haidi, gangshang, qianggang, genFan, capFan, yaoji}) -> {fan, names} | null
//   potentialFan(hand, melds, {genFan, capFan, yaoji}) -> {fan, names}   // 未成胡手牌估番（查大叫）
//   handShanten(hand, meldCount, opts?) -> number
//   tingTiles(hand, meldCount, opts?) -> number[]
//   hasVoidTiles(hand, voidSuit, opts?) -> bool           opts.yaoji 定缺豁免幺鸡
// 零依赖纯函数，浏览器与 Node 均可运行。
// ============================================================

import { TILE_KINDS, tileSuit, YAOJI_TILE } from './contract.js'

// ---------- 幺鸡赖子（万能牌）说明 ----------
// 开启幺鸡局（opts.yaoji === true）后，幺鸡（一条，YAOJI_TILE = 18）可当任意牌
// 参与顺子 / 刻子 / 对子。判定思路：把手牌里的幺鸡抽出来当“万能张”计数，
// 其余真牌做常规分解（枚举雀头后逐面子递归），缺的牌用万能张补。
//   - 与真牌融合时，万能张可以补在顺子的任意位置（最低/中间/最高张）；
//   - 所有真牌都必须被消化，多余的万能张必须成组（3 张一组）；
//   - 七对同理：奇数张真牌用万能张配对，剩余万能张两两成对。
// 番型「不带幺鸡 +1 番」：整手（手牌 + 副露）不含任何幺鸡时额外 +1 番。
// 副露（碰/杠）若带了幺鸡，用 meld.wild 记录张数（见 contract.js Meld）。

// ---------- 计数辅助 ----------

/** 手牌 -> 27 位计数数组（索引即 tileId） */
export function countsOf(hand) {
  const counts = new Array(TILE_KINDS).fill(0)
  for (let i = 0; i < hand.length; i++) counts[hand[i]]++
  return counts
}

/** 同种 id 在手上出现的次数 */
export function countTile(hand, id) {
  let n = 0
  for (let i = 0; i < hand.length; i++) if (hand[i] === id) n++
  return n
}

/**
 * 根：手牌 + 副露中每有一组 4 张相同的牌即一个“根”，每个根加 1 番。
 * 计入的形态：明杠 / 暗杠 / 补杠（副露 4 张）、碰后手留一张、手里 4 张未杠。
 * 副露张数：碰 3 张，杠 4 张（明杠/暗杠/补杠的副露都存 4 张）。
 */
export function countGen(hand, melds) {
  const counts = new Array(TILE_KINDS).fill(0)
  for (let i = 0; i < hand.length; i++) counts[hand[i]]++
  for (const m of melds || []) {
    if (m && m.tile != null) counts[m.tile] += m.kind === 'peng' ? 3 : 4
  }
  let gen = 0
  for (let i = 0; i < TILE_KINDS; i++) if (counts[i] >= 4) gen++
  return gen
}

/**
 * 手牌中是否还有缺门花色的牌。
 * opts.yaoji 为真时，幺鸡（一条）不算缺门牌——它本身是赖子，定缺条门也保留。
 */
export function hasVoidTiles(hand, voidSuit, opts = {}) {
  if (!voidSuit) return false
  for (let i = 0; i < hand.length; i++) {
    if (opts.yaoji && hand[i] === YAOJI_TILE) continue
    if (tileSuit(hand[i]) === voidSuit) return true
  }
  return false
}

/** 手牌里是否含幺鸡（用于「不带幺鸡 +1 番」判定；副露由 finalFan 一并判断） */
export function hasYaojiTile(hand) {
  for (let i = 0; i < hand.length; i++) if (hand[i] === YAOJI_TILE) return true
  return false
}

// ---------- 分解与胡牌判定 ----------

/**
 * 标准型分解：counts 中能否取出 need 个面子（顺子/刻子）+ 1 雀头。
 * 已枚举雀头（counts 里 h 已减 2），从低位牌递归。
 */
function decompose(counts, need) {
  if (need === 0) {
    // 剩余牌必须恰好构成雀头（在雀头枚举层已处理），
    // 这里 need=0 时说明面子取完，剩余应全为 0
    for (let i = 0; i < TILE_KINDS; i++) if (counts[i] > 0) return false
    return true
  }
  // 找到最低位的非零牌
  let idx = 0
  while (idx < TILE_KINDS && counts[idx] === 0) idx++
  if (idx >= TILE_KINDS) return false
  // 尝试刻子
  if (counts[idx] >= 3) {
    counts[idx] -= 3
    const ok = decompose(counts, need - 1)
    counts[idx] += 3
    if (ok) return true
  }
  // 尝试顺子（同花色内，9 点边界）
  if (idx % 9 <= 6 && counts[idx + 1] > 0 && counts[idx + 2] > 0) {
    counts[idx]--; counts[idx + 1]--; counts[idx + 2]--
    const ok = decompose(counts, need - 1)
    counts[idx]++; counts[idx + 1]++; counts[idx + 2]++
    if (ok) return true
  }
  return false
}

/**
 * 全刻子分解（对对胡判定）：need 个刻子 + 雀头，全部由 3 张相同组成。
 * 雀头同样在外层枚举。
 */
function decomposePengPeng(counts, need) {
  for (let i = 0; i < TILE_KINDS; i++) {
    if (counts[i] !== 0 && counts[i] !== 3) return false
  }
  // 需要恰好 need 个 3 张组
  let groups = 0
  for (let i = 0; i < TILE_KINDS; i++) if (counts[i] === 3) groups++
  return groups === need
}

/** 七对判定（14 张，允许一组 4 张当两对） */
function isQiDui(counts) {
  let pairs = 0
  for (let i = 0; i < TILE_KINDS; i++) {
    if (counts[i] % 2 !== 0) return false
    pairs += counts[i] / 2
  }
  return pairs === 7
}

/** 七对拆解出的对子数（4 张算 2 对），用于向听 */
function qiduiPairs(counts) {
  let pairs = 0
  for (let i = 0; i < TILE_KINDS; i++) pairs += Math.floor(counts[i] / 2)
  return pairs
}

// ---------- 幺鸡赖子：万能张分解 ----------

/** 把手牌拆成「真牌计数 + 万能张（幺鸡）张数」 */
function splitWild(hand) {
  const counts = new Array(TILE_KINDS).fill(0)
  let wild = 0
  for (let i = 0; i < hand.length; i++) {
    if (hand[i] === YAOJI_TILE) wild++
    else counts[hand[i]]++
  }
  return { counts, wild }
}

function allZero(counts) {
  for (let i = 0; i < TILE_KINDS; i++) if (counts[i] > 0) return false
  return true
}

/**
 * 尝试用 ids（元素为牌 id，-1 表示用一张万能张补位）凑一个面子：
 * 可行性检查 → 扣牌 → 递归求剩余面子 → 还原。
 * allowSeq 原样透传（不能因为本面子用了真牌就禁止后续面子用顺子）。
 */
function tryMeld(counts, need, wild, ids, allowSeq) {
  let w = 0
  const used = []
  for (const id of ids) {
    if (id === -1) { w++; continue }
    if (counts[id] <= 0) {
      for (const u of used) counts[u]++
      return false
    }
    counts[id]--
    used.push(id)
  }
  if (w > wild) {
    for (const u of used) counts[u]++
    return false
  }
  const ok = meldsWithWild(counts, need - 1, wild - w, allowSeq)
  for (const u of used) counts[u]++
  return ok
}

/**
 * 真牌 + 万能张能否凑出 need 个面子（顺子/刻子）。
 * allowSeq 为假时只允许刻子（对对胡判定用）。
 * 关键：以「当前最小的真牌」为锚点，枚举它所在面子的形态
 * （刻子 / 顺子最低张 / 中间张 / 最高张），缺的位置用万能张补。
 * 这样每个真牌都会被消化，不会漏解。
 */
function meldsWithWild(counts, need, wild, allowSeq) {
  if (need === 0) return wild === 0 && allZero(counts)
  let idx = 0
  while (idx < TILE_KINDS && counts[idx] === 0) idx++
  if (idx >= TILE_KINDS) return wild === need * 3
  const inSuit = idx % 9
  // 刻子：用 r 张真 idx + (3-r) 张万能
  const maxR = Math.min(3, counts[idx])
  for (let r = maxR; r >= 1; r--) {
    const ids = []
    for (let k = 0; k < r; k++) ids.push(idx)
    for (let k = 0; k < 3 - r; k++) ids.push(-1)
    if (tryMeld(counts, need, wild, ids, allowSeq)) return true
  }
  if (allowSeq) {
    // 顺子（idx 为最低张）
    if (inSuit <= 6) {
      const ids = [idx, counts[idx + 1] > 0 ? idx + 1 : -1, counts[idx + 2] > 0 ? idx + 2 : -1]
      if (tryMeld(counts, need, wild, ids, allowSeq)) return true
    }
    // 顺子（idx 为中间张，低张用万能）
    if (inSuit >= 1 && inSuit <= 7) {
      const ids = [counts[idx - 1] > 0 ? idx - 1 : -1, idx, counts[idx + 1] > 0 ? idx + 1 : -1]
      if (tryMeld(counts, need, wild, ids, allowSeq)) return true
    }
    // 顺子（idx 为最高张，前两张用万能）
    if (inSuit >= 2) {
      const ids = [counts[idx - 2] > 0 ? idx - 2 : -1, counts[idx - 1] > 0 ? idx - 1 : -1, idx]
      if (tryMeld(counts, need, wild, ids, allowSeq)) return true
    }
  }
  return false
}

/**
 * 真牌 + 万能张能否成标准型（need 个面子 + 1 雀头）。
 * allowSeq 为假时面子只能是刻子（对对胡）。
 */
function stdWinWithWild(counts, need, wild, allowSeq) {
  // 雀头：2 张真同牌
  for (let i = 0; i < TILE_KINDS; i++) {
    if (counts[i] >= 2) {
      counts[i] -= 2
      const ok = meldsWithWild(counts, need, wild, allowSeq)
      counts[i] += 2
      if (ok) return true
    }
  }
  // 雀头：1 真 + 1 万能
  if (wild >= 1) {
    for (let i = 0; i < TILE_KINDS; i++) {
      if (counts[i] >= 1) {
        counts[i]--
        const ok = meldsWithWild(counts, need, wild - 1, allowSeq)
        counts[i]++
        if (ok) return true
      }
    }
  }
  // 雀头：2 万能
  if (wild >= 2 && meldsWithWild(counts, need, wild - 2, allowSeq)) return true
  return false
}

/** 七对判定（带万能张）：奇数真牌用万能配对，剩余万能两两成对 */
function isQiDuiWild(counts, wild) {
  let singles = 0
  for (let i = 0; i < TILE_KINDS; i++) {
    if (counts[i] % 2 !== 0) singles++
  }
  return wild >= singles && (wild - singles) % 2 === 0
}

/** 不带幺鸡的整手是否单色（万能张视为可随其余真牌同色） */
function isMonoSuitWild(hand) {
  let suit = null
  for (const t of hand) {
    if (t === YAOJI_TILE) continue
    const s = tileSuit(t)
    if (suit == null) suit = s
    else if (suit !== s) return false
  }
  return true
}

/**
 * 胡牌判定。hand 为含胡牌张在内的完整手牌，
 * 长度必须为 (4 - meldCount) * 3 + 2。
 * opts.yaoji 为真时幺鸡当万能牌。
 */
export function isWinHand(hand, meldCount, opts = {}) {
  const need = 4 - meldCount
  if (hand.length !== need * 3 + 2) return false
  if (opts.yaoji) {
    const { counts, wild } = splitWild(hand)
    if (meldCount === 0 && isQiDuiWild(counts, wild)) return true
    return stdWinWithWild(counts, need, wild, true)
  }
  const counts = countsOf(hand)
  // 七对（仅门清）
  if (meldCount === 0 && isQiDui(counts)) return true
  // 标准型：枚举雀头后分解面子
  for (let h = 0; h < TILE_KINDS; h++) {
    if (counts[h] >= 2) {
      counts[h] -= 2
      const ok = decompose(counts, need)
      counts[h] += 2
      if (ok) return true
    }
  }
  return false
}

/**
 * 最优分解的牌型标记（取番值最大的一种胡法）。
 * qing 仅判断手牌单色；副露花色由 finalFan 综合判定。
 * jingou 金钩钓：meldCount === 4（四副露碰/杠到底，手里只剩单吊将）。
 * opts.yaoji 为真时幺鸡当万能牌，走赖子分解。
 */
export function winShape(hand, meldCount, opts = {}) {
  const need = 4 - meldCount
  if (hand.length !== need * 3 + 2) return null
  const counts = countsOf(hand)

  // --- 幺鸡赖子：真牌 + 万能张分解 ---
  if (opts.yaoji) {
    const { counts: rc, wild } = splitWild(hand)
    const qing = isMonoSuitWild(hand)
    // 七对系（仅门清）：真牌奇数张由万能张配对，剩余万能张两两成对
    let qidui = null
    if (meldCount === 0 && isQiDuiWild(rc, wild)) {
      let long = false
      for (let i = 0; i < TILE_KINDS; i++) {
        // 真牌 4 张，或 3 张真牌 + 1 张幺鸡（逻辑上仍是 4 张相同）都算龙七对
        if (rc[i] >= 4 || (rc[i] === 3 && wild > 0)) long = true
      }
      qidui = { qidui: true, longQidui: long, pengpeng: false, jingou: false, qing }
    }
    // 标准型：真牌枚举面子（缺位用万能补），对对胡只允许刻子
    let std = false
    let stdPengpeng = false
    if (stdWinWithWild(rc.slice(), need, wild, true)) {
      std = true
      stdPengpeng = stdWinWithWild(rc.slice(), need, wild, false)
    }
    const stdShape = std
      ? {
          qidui: false,
          longQidui: false,
          pengpeng: stdPengpeng,
          jingou: meldCount === 4,
          qing
        }
      : null
    // 七对系番值不低于标准型，优先取七对
    if (qidui && stdShape) return qidui
    return qidui || stdShape
  }

  // --- 七对系（仅门清） ---
  let qidui = null
  if (meldCount === 0 && isQiDui(counts)) {
    let long = false
    for (let i = 0; i < TILE_KINDS; i++) if (counts[i] === 4) long = true
    qidui = { qidui: true, longQidui: long, pengpeng: false, jingou: false, qing: isMonoSuit(hand) }
  }

  // --- 标准型 ---
  let std = null
  let stdPengpeng = false
  for (let h = 0; h < TILE_KINDS; h++) {
    if (counts[h] >= 2) {
      counts[h] -= 2
      let ok = decompose(counts, need)
      let pp = ok && decomposePengPeng(counts, need)
      counts[h] += 2
      if (ok) { std = true; if (pp) stdPengpeng = true }
    }
  }

  // --- 取番值较大者（七对 2/龙 3 vs 对对 1/平 0；七对系番值更高，优先） ---
  // 金钩钓：四副露（碰/杠）到底、手里只剩单吊将一张（四川无吃，4 副露 + 雀头
  // 必然全刻子），比对对胡高一档，作为独立番型取 3 番。
  const stdShape = std
    ? { qidui: false, longQidui: false, pengpeng: stdPengpeng, jingou: meldCount === 4, qing: isMonoSuit(hand) }
    : null
  if (qidui && stdShape) {
    // 龙七对(4) > 对对(2)；七对(2) vs 对对(2) 平手取七对
    return qidui
  }
  return qidui || stdShape
}

/** 整手（手牌 + 副露）是否含幺鸡：手牌含幺鸡、副露补位用幺鸡、或副露本身即幺鸡 */
function handHasYaoji(hand, melds) {
  for (let i = 0; i < hand.length; i++) if (hand[i] === YAOJI_TILE) return true
  for (const m of melds || []) {
    if (!m) continue
    if (m.tile === YAOJI_TILE) return true
    if (m.wild != null && m.wild > 0) return true
  }
  return false
}

/** 手牌是否单花色 */
function isMonoSuit(hand) {
  if (hand.length === 0) return true
  const s = tileSuit(hand[0])
  for (let i = 1; i < hand.length; i++) {
    if (tileSuit(hand[i]) !== s) return false
  }
  return true
}

// ---------- 番型计算 ----------

/**
 * 番值计算。番是 2 的指数：平胡不带番（1 倍），每 +1 番即翻倍。
 * shape 来自 winShape（或手工构造）；capFan 默认 4。
 * 返回 {fan（封顶后）, rawFan（封顶前）, names}。
 */
export function fanOf(shape, opts = {}) {
  if (!shape) return { fan: 0, rawFan: 0, names: [] }
  const capFan = opts.capFan != null ? opts.capFan : 4
  // 基础番型：平胡 0 | 对对胡 1 | 七对 2 | 龙七对 3 | 金钩钓 3
  let fan = 0
  const names = []
  if (shape.longQidui) {
    fan = 3
    names.push('龙七对')
  } else if (shape.jingou) {
    // 金钩钓：四副露碰/杠到底单吊将，取最高基础番型（比对对胡高一档）
    fan = 3
    names.push('金钩钓')
  } else if (shape.qidui) {
    fan = 2
    names.push('七对')
  } else if (shape.pengpeng) {
    fan = 1
    names.push('碰碰胡')
  } else {
    names.push('平胡')
  }
  if (shape.qing) {
    // 清一色固定 +2 番（4 倍），不随基础番型再乘
    fan += 2
    names.push('清一色')
  }
  if (opts.noYaoji) {
    // 幺鸡局「不带幺鸡 +1 番」：整手（手牌 + 副露）不含任何幺鸡
    fan += opts.noYaojiFan != null ? opts.noYaojiFan : 1
    names.push('不带幺鸡')
  }
  if (opts.zimo) {
    fan += opts.zimoFan != null ? opts.zimoFan : 1
    names.push('自摸')
  }
  if (opts.haidi) {
    // 海底：摸到/打出牌墙最后一张牌时胡牌，额外加番（自摸即“海底捞月”）
    fan += opts.haidiFan != null ? opts.haidiFan : 1
    names.push(opts.zimo ? '海底捞月' : '海底炮')
  }
  if (opts.gangshang) {
    // 杠上胡：杠后补牌胡（自摸即“杠上花”，点炮即“杠上炮”），额外加番
    fan += opts.gangShangFan != null ? opts.gangShangFan : 1
    names.push(opts.zimo ? '杠上花' : '杠上炮')
  }
  if (opts.qianggang) {
    // 抢杠胡：补杠被抢，杠不成立（与杠上胡互斥），抢杠者额外加番
    fan += opts.qianggangFan != null ? opts.qianggangFan : 1
    names.push('抢杠胡')
  }
  if (opts.gen > 0) {
    // 根：每有一组 4 张相同牌加番（明/暗/补杠，或碰后手留一张、手里 4 张未杠）
    fan += opts.gen * (opts.genFan != null ? opts.genFan : 1)
    names.push(opts.gen > 1 ? '根×' + opts.gen : '根')
  }
  if (opts.tianhu) {
    // 天胡：庄家起手 14 张即已成胡，直接按封顶（满格）计，不再叠加其他番
    names.push('天胡')
    return { fan: capFan, rawFan: capFan, names }
  }
  return { fan: Math.min(fan, capFan), rawFan: fan, names }
}

/**
 * 综合副露的最终番型（清一色需副露同色）。
 * melds: [{tile, ...}] 副露数组（契约 Meld 结构）。
 * opts.yaoji 为真时启用幺鸡赖子规则（万能胡牌 + 不带幺鸡加番）。
 */
export function finalFan(hand, melds, opts = {}) {
  const shape = winShape(hand, (melds || []).length, opts)
  if (!shape) return null
  const yaoji = opts.yaoji === true
  // 清一色修正：所有真牌（手牌 + 副露）必须同花色。
  // 幺鸡本身可当任意花色，不参与花色判定（副露里的补位幺鸡同理）。
  let qing = shape.qing
  if (qing && melds && melds.length > 0) {
    const real = []
    for (const t of hand) if (!(yaoji && t === YAOJI_TILE)) real.push(t)
    for (const m of melds) {
      if (yaoji && m.tile === YAOJI_TILE) continue
      real.push(m.tile)
    }
    if (real.length > 0) {
      const s0 = tileSuit(real[0])
      if (real.some(t => tileSuit(t) !== s0)) qing = false
    }
  }
  // 根：4 张相同牌每组加 1 番（含明/暗/补杠与碰后手留一张）。
  // 七对系（含龙七对）里的 4 张已由龙七对番型覆盖，不重复计根。
  const gen = shape.qidui ? 0 : countGen(hand, melds)
  // 「不带幺鸡 +1 番」：整手（手牌 + 副露）不含任何幺鸡
  const noYaoji = yaoji && !handHasYaoji(hand, melds)
  return fanOf({ ...shape, qing }, { ...opts, gen, noYaoji })
}

/**
 * 未成胡手牌（3n+1 张）的“最大可能番数”估算，用于流局查大叫赔付。
 *
 * 与 finalFan 的区别：finalFan 要求手牌已成胡型（3n+2 张），而查大叫时
 * 未听牌者手里只有 3n+1 张、根本胡不了，只能按“这副牌再做下去最多
 * 能成什么番型”来赔：
 *   - 一色到底（手牌 + 副露全部同花色）：清一色 +2 番；
 *   - 对对胡潜力：已全是刻子，只差一张补成雀头（或两张对子其一补刻）；
 *   - 金钩钓潜力：四副露碰/杠到底（meldCount === 4）、手里只剩单吊将一张（3 番）；
 *   - 七对潜力（仅门清）：对子数 ≥ 6（含 4 张同牌即龙七对 3 番，否则 2 番）；
 *   - 根：手牌 + 副露中每有一组 4 张相同牌（含明/暗/补杠）额外 +1 番；
 *   - 以上都不满足：平胡不加番（1 倍）。
 * 结果按 capFan 封顶，返回结构与 fanOf 一致。
 */
export function potentialFan(hand, melds, opts = {}) {
  const capFan = opts.capFan != null ? opts.capFan : 4
  const meldCount = (melds || []).length
  const need = Math.max(0, 4 - meldCount)
  const allRaw = hand.concat((melds || []).map(m => m.tile))
  const counts = countsOf(hand)
  let n1 = 0, n2 = 0, n3 = 0, n4 = 0
  for (let i = 0; i < TILE_KINDS; i++) {
    const c = counts[i]
    if (c === 1) n1++
    else if (c === 2) n2++
    else if (c === 3) n3++
    else if (c >= 4) n4++
  }
  let best = { fan: 0, names: ['平胡'] }
  const consider = (fan, names) => {
    if (fan > best.fan) best = { fan, names }
  }
  // 对对胡潜力：全刻子 + 一张单张（补雀头）/ 两张对子（其一补刻）/ 一个杠
  if (
    (n1 === 1 && n2 === 0 && n4 === 0 && n3 === need) ||
    (n1 === 0 && n2 === 2 && n4 === 0 && n3 === need - 1) ||
    (n1 === 0 && n2 === 0 && n4 === 1 && n3 === need - 1)
  ) {
    consider(1, ['碰碰胡'])
  }
  // 金钩钓潜力：四副露碰/杠到底、手里只剩单吊将一张（3 番，高于对对胡）
  if (meldCount === 4) consider(3, ['金钩钓'])
  // 七对潜力：仅门清，对子数够 6 对即可（含 4 张同牌即龙七对 3 番）
  if (meldCount === 0) {
    let pairs = 0
    for (let i = 0; i < TILE_KINDS; i++) pairs += Math.floor(counts[i] / 2)
    if (pairs >= 6) consider(n4 > 0 ? 3 : 2, [n4 > 0 ? '龙七对' : '七对'])
  }
  // 清一色：手牌与副露同色则 +2 番（幺鸡局里幺鸡可当任意花色，不参与判定）
  const all = opts.yaoji ? allRaw.filter(t => t !== YAOJI_TILE) : allRaw
  const qing = all.length > 0 && all.every(t => tileSuit(t) === tileSuit(all[0]))
  if (qing) best = { fan: best.fan + 2, names: best.names.concat(['清一色']) }
  // 「不带幺鸡 +1 番」：整手（手牌 + 副露）不含任何幺鸡
  if (opts.yaoji === true && !handHasYaoji(hand, melds)) {
    best = { fan: best.fan + 1, names: best.names.concat(['不带幺鸡']) }
  }
  // 根：4 张相同牌每组加 1 番（含杠与碰后留一张）；七对系的 4 张已由
  // 龙七对番型覆盖，不重复计根。
  const qiduiBest = best.names.includes('七对') || best.names.includes('龙七对')
  const gen = qiduiBest ? 0 : countGen(hand, melds)
  if (gen > 0) {
    best = {
      fan: best.fan + gen * (opts.genFan != null ? opts.genFan : 1),
      names: best.names.concat([gen > 1 ? '根×' + gen : '根'])
    }
  }
  return { fan: Math.min(best.fan, capFan), rawFan: best.fan, names: best.names }
}

// ---------- 向听数 ----------

/**
 * 标准型向听数（含雀头枚举）。
 * 递归枚举面子/搭子组合，公式：shanten = 2*need - 2*面子 - 搭子 - 雀头
 * 约束：面子 + 搭子 <= need。胡牌返回 -1。
 */
function shantenStandard(counts, need) {
  let best = 2 * need // 最差：全部散牌
  const record = (m, p, hasPair) => {
    if (m + p > need) return
    const s = need * 2 - m * 2 - p - (hasPair ? 1 : 0)
    if (s < best) best = s
  }
  // dfs：从 idx 起取组件；每次在当前状态先记账（后续可能取不满）
  const dfs = (idx, m, p, hasPair) => {
    // 剪枝：组件数已满，无需再取
    if (m + p >= need) { record(m, p, hasPair); return }
    while (idx < TILE_KINDS && counts[idx] === 0) idx++
    if (idx >= TILE_KINDS) { record(m, p, hasPair); return }
    record(m, p, hasPair)
    const inSuit = idx % 9
    // 刻子
    if (counts[idx] >= 3) {
      counts[idx] -= 3
      dfs(idx, m + 1, p, hasPair)
      counts[idx] += 3
    }
    // 顺子
    if (inSuit <= 6 && counts[idx + 1] > 0 && counts[idx + 2] > 0) {
      counts[idx]--; counts[idx + 1]--; counts[idx + 2]--
      dfs(idx, m + 1, p, hasPair)
      counts[idx]++; counts[idx + 1]++; counts[idx + 2]++
    }
    // 对子搭子
    if (counts[idx] >= 2) {
      counts[idx] -= 2
      dfs(idx, m, p + 1, hasPair)
      counts[idx] += 2
    }
    // 两面搭子
    if (inSuit <= 7 && counts[idx + 1] > 0) {
      counts[idx]--; counts[idx + 1]--
      dfs(idx, m, p + 1, hasPair)
      counts[idx]++; counts[idx + 1]++
    }
    // 嵌张搭子
    if (inSuit <= 6 && counts[idx + 2] > 0) {
      counts[idx]--; counts[idx + 2]--
      dfs(idx, m, p + 1, hasPair)
      counts[idx]++; counts[idx + 2]++
    }
    // 全部跳过（剩余同种牌当散牌/雀头，直接前进）
    const save = counts[idx]
    counts[idx] = 0
    dfs(idx + 1, m, p, hasPair)
    counts[idx] = save
  }
  // 无雀头
  dfs(0, 0, 0, false)
  // 枚举雀头
  for (let h = 0; h < TILE_KINDS; h++) {
    if (counts[h] >= 2) {
      counts[h] -= 2
      dfs(0, 0, 0, true)
      counts[h] += 2
    }
  }
  return best
}

/**
 * 幺鸡赖子向听数（近似）：真牌按标准型算向听，每张万能张可补一个缺口
 * （向听 -1）；七对同样允许万能张先把单张配对、剩余两两成对。
 * 仅用于 AI 决策与提示，不参与任何结算判定。
 */
function qiduiShantenWild(counts, wild) {
  let pairs = 0
  let singles = 0
  for (let i = 0; i < TILE_KINDS; i++) {
    pairs += Math.floor(counts[i] / 2)
    if (counts[i] % 2 === 1) singles++
  }
  let w = wild
  const useS = Math.min(w, singles)
  pairs += useS
  w -= useS
  pairs += Math.floor(w / 2)
  if (pairs >= 7) return -1
  return 6 - pairs
}

/**
 * 通用向听数：标准型与七对取小（七对仅门清）。
 * hand 可为 3n+1（弃牌后）或 3n+2（含胡张）形；胡牌返回 -1。
 * opts.yaoji 为真时幺鸡当万能牌（近似计算，仅供 AI / 提示）。
 */
export function handShanten(hand, meldCount, opts = {}) {
  const need = 4 - meldCount
  if (need < 0) return 0
  if (opts.yaoji) {
    const { counts: rc, wild } = splitWild(hand)
    let best = Math.max(-1, shantenStandard(rc.slice(), need) - wild)
    if (meldCount === 0) {
      const q = qiduiShantenWild(rc, wild)
      if (q < best) best = q
    }
    if (best < -1) best = -1
    return best
  }
  const counts = countsOf(hand)
  let best = shantenStandard(counts, need)
  if (meldCount === 0) {
    // 七对向听 = 6 - 对子数（13 张听牌 0，14 张 7 对 -1）
    const q = 6 - qiduiPairs(counts)
    if (q < best) best = q
  }
  if (best < -1) best = -1
  return best
}

/**
 * 听牌列表：hand（3n+1 形）加哪张牌能胡。
 * 仅返回未在自己手里出现 4 张的牌（每种共 4 张）。
 * opts.yaoji 为真时幺鸡当万能牌。
 */
export function tingTiles(hand, meldCount, opts = {}) {
  const out = []
  const counts = countsOf(hand)
  for (let t = 0; t < TILE_KINDS; t++) {
    if (counts[t] >= 4) continue // 自己已有 4 张，不可能再摸到
    counts[t]++
    if (isWinHand(countsToList(counts), meldCount, opts)) out.push(t)
    counts[t]--
  }
  return out
}

/** 计数数组还原为升序手牌 */
function countsToList(counts) {
  const out = []
  for (let i = 0; i < TILE_KINDS; i++) {
    for (let c = 0; c < counts[i]; c++) out.push(i)
  }
  return out
}
