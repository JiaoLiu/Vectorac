// ============================================================
// 四川麻将（血战到底）确定性测试（test-mahjong.mjs）
// ------------------------------------------------------------
// 运行：
//   npx esbuild scripts/test-mahjong.mjs --bundle --format=esm \
//     --platform=node --outfile=/tmp/scmj-test.mjs && node /tmp/scmj-test.mjs
//
// 覆盖：
//   1. rules 单元（胡牌判定/牌型/番型/向听/听牌）
//   2. 发牌与 108 张守恒
//   3. 换三张（同花色校验、方向传递）
//   4. 定缺约束（未打缺只能打缺门、不能胡；碰/杠不受限）
//   5. 碰 / 明杠 / 暗杠 / 补杠（状态与杠分）
//   6. 抢杠胡
//   7. 一炮多响
//   8. 血战继续与流局查花猪/查大叫/退杠
//   9. 海底加番（海底捞月/海底炮）与牌墙两牌一垛摆法
//   9b. 杠上胡加番（杠上花/杠上炮）
//   9c. 根加番（4 张相同牌每组 +1 番，含杠；七对系不重复计）
//   9d. 金钩钓（四副露碰/杠到底单吊将 = 3 番，比对对胡高一档）
//   10. 去重（DUPLICATE）与过期（STALE）
//   11. 相同 seed + 相同动作序列可复现
//   12. 随机合法机器人压力局（≥20 局）
//   13. playerView 隐私（不泄露他人手牌/墙序）
// ============================================================

import assert from 'node:assert/strict'
import {
  tileId,
  tileName,
  tileSuit,
  TOTAL_TILES,
  YAOJI_TILE
} from '../.vuepress/components/mahjong/contract.js'
import {
  isWinHand,
  winShape,
  fanOf,
  finalFan,
  potentialFan,
  countGen,
  handShanten,
  tingTiles,
  hasVoidTiles
} from '../.vuepress/components/mahjong/rules.js'
import {
  createGame,
  legalActions,
  dispatch,
  playerView,
  settlementOf,
  mulberry32
} from '../.vuepress/components/mahjong/engine.js'
import { aiDecide } from '../.vuepress/components/mahjong/ai.js'
import { createLocalGame } from '../.vuepress/components/mahjong/local-game.js'
import { ringMask, WALL_SIDE_SLOTS } from '../.vuepress/components/mahjong/ui.js'

const W = r => tileId('wan', r)
const T = r => tileId('tong', r)
const I = r => tileId('tiao', r)

let passed = 0
function ok(name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}
const aid = (tag, n) => `${tag}-${n}`

// ============================================================
// 1. rules 单元
// ============================================================
console.log('=== rules 单元 ===')

ok('平胡（标准型 4 面子 + 雀头）', () => {
  const hand = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), T(2), T(3), T(4), I(5), I(6), I(7)]
  assert.equal(isWinHand(hand, 0), true)
  const shape = winShape(hand, 0)
  assert.equal(shape.qidui, false)
  assert.equal(shape.pengpeng, false)
  assert.equal(shape.qing, false)
  const f = fanOf(shape, { zimo: false })
  assert.equal(f.fan, 0, '平胡不带番（1 倍底注）')
  assert.ok(f.names.includes('平胡'))
})

ok('对对胡（1 番 = 2 倍）', () => {
  const hand = [W(1), W(1), W(1), W(5), W(5), W(5), T(3), T(3), T(3), I(2), I(2), I(2), T(9), T(9)]
  assert.equal(isWinHand(hand, 0), true)
  const shape = winShape(hand, 0)
  assert.equal(shape.pengpeng, true)
  assert.equal(fanOf(shape, {}).fan, 1)
})

ok('清一色平胡（0 + 2 = 2 番 = 4 倍）', () => {
  const hand = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), W(9), W(3), W(6), W(9)]
  // 111 234 567 99 + 3366... 需要可分解：1,1,1,2,3,4,5,6,7,8,9,9,3,6 → 111 234 567 999 36? 不成
  // 换成确定可分解的清一色：111 234 567 889 9 -> 1,1,1,2,3,4,5,6,7,8,8,9,9 + ?
  const h2 = [W(1), W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(8), W(8), W(9), W(9)]
  assert.equal(isWinHand(h2, 0), true)
  const shape = winShape(h2, 0)
  assert.equal(shape.qing, true)
  assert.equal(shape.pengpeng, false)
  assert.equal(fanOf(shape, {}).fan, 2) // 平胡 0 + 清一色 2
})

ok('七对（2 番 = 4 倍，门清专用）', () => {
  const hand = [W(1), W(1), W(3), W(3), T(5), T(5), T(7), T(7), I(2), I(2), I(4), I(4), W(9), W(9)]
  assert.equal(isWinHand(hand, 0), true)
  const shape = winShape(hand, 0)
  assert.equal(shape.qidui, true)
  assert.equal(shape.longQidui, false)
  assert.equal(fanOf(shape, {}).fan, 2)
  // 有副露时七对不成立（该手牌 + 1 副露 = 11 张不可能，这里只测函数防御）
  assert.equal(isWinHand(hand.slice(0, 11), 1), false)
})

ok('龙七对（七对含一组四张，3 番 = 8 倍）', () => {
  const hand = [W(1), W(1), W(1), W(1), W(3), W(3), T(5), T(5), I(7), I(7), I(9), I(9), T(2), T(2)]
  assert.equal(isWinHand(hand, 0), true)
  const shape = winShape(hand, 0)
  assert.equal(shape.qidui, true)
  assert.equal(shape.longQidui, true)
  assert.equal(fanOf(shape, {}).fan, 3)
})

ok('清龙七对 + 自摸 = 封顶', () => {
  const hand = [W(1), W(1), W(1), W(1), W(3), W(3), W(5), W(5), W(7), W(7), W(9), W(9), W(2), W(2)]
  const shape = winShape(hand, 0)
  assert.equal(shape.longQidui && shape.qing, true)
  const f = fanOf(shape, { zimo: true, capFan: 4 })
  // 原始 3 + 清一色 2 + 自摸 1 = 6，封顶 4
  assert.equal(f.fan, 4)
  assert.equal(f.rawFan, 6)
  assert.ok(f.names.includes('龙七对') && f.names.includes('清一色') && f.names.includes('自摸'))
})

ok('自摸番可由规则配置覆盖', () => {
  const hand = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), T(2), T(3), T(4), I(5), I(6), I(7)]
  const shape = winShape(hand, 0)
  assert.equal(fanOf(shape, { zimo: true, zimoFan: 2, capFan: 8 }).fan, 2, '平胡 0 + 自摸 2')
})

ok('抢杠胡番（平胡 0 + 抢杠 1 = 1 番）', () => {
  const hand = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), T(2), T(3), T(4), I(5), I(6), I(7)]
  const shape = winShape(hand, 0)
  const f = fanOf(shape, { qianggang: true })
  assert.equal(f.fan, 1, '平胡 0 + 抢杠胡 1')
  assert.ok(f.names.includes('抢杠胡'), '番型名应含抢杠胡，实际 ' + f.names.join('/'))
  assert.equal(fanOf(shape, { qianggang: true, qianggangFan: 2, capFan: 8 }).fan, 2, '抢杠番值可配置')
})

ok('非胡手牌', () => {
  const hand = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), T(2), T(3), T(4), I(5), I(6), I(8)]
  assert.equal(isWinHand(hand, 0), false)
  assert.equal(winShape(hand, 0), null)
})

ok('potentialFan：未听牌手牌估番（查大叫赔付依据）', () => {
  // 散张烂牌 → 平胡不加番（0 番 = 1 倍）
  const junk = [W(1), W(4), W(7), I(1), I(4), I(7), W(2), W(5), W(8), I(2), I(5), I(8), I(3)]
  assert.equal(potentialFan(junk, [], { capFan: 4 }).fan, 0)
  // 同色 13 张 → 平胡 0 + 清一色 2 = 2 番
  const qing = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), W(9), W(3), W(6)]
  assert.equal(potentialFan(qing, [], { capFan: 4 }).fan, 2)
  // 全刻子 + 单张（补雀头）→ 碰碰胡 1 番
  const pp = [W(1), W(1), W(1), W(5), W(5), W(5), T(3), T(3), T(3), I(2), I(2), I(2), T(9)]
  assert.equal(potentialFan(pp, [], { capFan: 4 }).fan, 1)
  // 6 对 + 1 单 → 七对 2 番；含四张同牌 → 龙七对 3 番
  const qd = [W(1), W(1), W(3), W(3), T(5), T(5), T(7), T(7), I(2), I(2), I(4), I(4), W(9)]
  assert.equal(potentialFan(qd, [], { capFan: 4 }).fan, 2)
  const lqd = [W(1), W(1), W(1), W(1), W(3), W(3), T(5), T(5), I(7), I(7), I(9), I(9), T(2)]
  assert.equal(potentialFan(lqd, [], { capFan: 4 }).fan, 3)
  // 封顶生效
  assert.equal(potentialFan(lqd, [], { capFan: 3 }).fan, 3)
  // 四副露碰/杠到底、手里单吊剩一张 → 金钩钓潜力 3 番
  const jg = [
    { kind: 'peng', tile: W(1), from: 1 },
    { kind: 'peng', tile: W(5), from: 2 },
    { kind: 'peng', tile: T(3), from: 3 },
    { kind: 'peng', tile: I(2), from: 1 }
  ]
  assert.equal(potentialFan([T(9)], jg, { capFan: 6 }).fan, 3, '金钩钓潜力 3 番')
  assert.ok(potentialFan([T(9)], jg, { capFan: 6 }).names.includes('金钩钓'))
})

ok('根：碰后手留一张（4 张同牌）算 1 根，平胡 0 + 根 1 = 1 番', () => {
  // 碰 W5 + 手里 W5W6W7 成顺子：W5 共 4 张 = 1 根（不补杠也加番）
  const melds = [{ kind: 'peng', tile: W(5), from: 1 }]
  const hand = [W(5), W(6), W(7), W(1), W(2), W(3), T(2), T(3), T(4), T(9), T(9)]
  assert.equal(countGen(hand, melds), 1)
  const f = finalFan(hand, melds, { capFan: 4, genFan: 1 })
  assert.equal(f.fan, 1, '平胡 0 + 根 1')
  assert.ok(f.names.includes('根'), '番型名应含“根”，实际 ' + f.names.join('/'))
})

ok('根：杠本身也算根，多根叠加为“根×2”', () => {
  // 暗杠 W5 + 暗杠 T3 → 2 根；手牌 W123 W789 + T99
  const melds = [
    { kind: 'gang', gangType: 'an', tile: W(5), from: null },
    { kind: 'gang', gangType: 'an', tile: T(3), from: null }
  ]
  const hand = [W(1), W(2), W(3), W(7), W(8), W(9), T(9), T(9)]
  assert.equal(countGen(hand, melds), 2)
  const f = finalFan(hand, melds, { capFan: 4, genFan: 1 })
  assert.equal(f.fan, 2, '平胡 0 + 根×2')
  assert.ok(f.names.includes('根×2'), '实际 ' + f.names.join('/'))
})

ok('根：七对 / 龙七对里的 4 张已含在番型中，不重复计根', () => {
  // 龙七对：W1×4 + 5 对 → 3 番（不再叠加根）
  const hand = [W(1), W(1), W(1), W(1), W(3), W(3), T(5), T(5), I(7), I(7), I(9), I(9), T(2), T(2)]
  assert.equal(countGen(hand, []), 1, '按 4 张同牌本身确实有 1 根')
  const f = finalFan(hand, [], { capFan: 4, genFan: 1 })
  assert.equal(f.fan, 3, '龙七对 3 番，不重复计根')
  assert.ok(f.names.includes('龙七对') && !f.names.includes('根'), '实际 ' + f.names.join('/'))
})

ok('金钩钓：四副露碰/杠到底单吊将 = 3 番（比对对胡高一档，取高不叠加）', () => {
  const melds = [
    { kind: 'peng', tile: W(1), from: 1 },
    { kind: 'peng', tile: W(5), from: 2 },
    { kind: 'peng', tile: T(3), from: 3 },
    { kind: 'peng', tile: I(2), from: 1 }
  ]
  const hand = [T(9), T(9)] // 手里只剩单吊将一张（含胡张）
  assert.equal(isWinHand(hand, 4), true)
  const shape = winShape(hand, 4)
  assert.equal(shape.jingou, true, '四副露单吊应为金钩钓')
  assert.equal(shape.pengpeng, true, '金钩钓同时是全刻子')
  const f = finalFan(hand, melds, { capFan: 6, genFan: 1 })
  assert.equal(f.fan, 3, '金钩钓 3 番（不叠加对对胡 1 番）')
  assert.ok(f.names.includes('金钩钓') && !f.names.includes('碰碰胡'), '实际 ' + f.names.join('/'))
})

ok('金钩钓 + 自摸 = 4 番；清金钩钓 = 5 番', () => {
  const melds = [
    { kind: 'peng', tile: W(1), from: 1 },
    { kind: 'peng', tile: W(3), from: 2 },
    { kind: 'peng', tile: W(5), from: 3 },
    { kind: 'peng', tile: W(7), from: 1 }
  ]
  const hand = [W(9), W(9)]
  const f = finalFan(hand, melds, { capFan: 6, genFan: 1, zimo: true })
  // 金钩钓 3 + 清一色 2 + 自摸 1 = 6 番
  assert.equal(f.fan, 6, '金钩钓 3 + 清一色 2 + 自摸 1 = 6')
  assert.ok(
    f.names.includes('金钩钓') && f.names.includes('清一色') && f.names.includes('自摸'),
    '实际 ' + f.names.join('/')
  )
})

ok('金钩钓 + 根（杠）= 4 番（根与金钩钓独立叠加）', () => {
  const melds = [
    { kind: 'peng', tile: W(1), from: 1 },
    { kind: 'peng', tile: W(5), from: 2 },
    { kind: 'peng', tile: T(3), from: 3 },
    { kind: 'gang', gangType: 'an', tile: I(2), from: null }
  ]
  const hand = [T(9), T(9)]
  const f = finalFan(hand, melds, { capFan: 6, genFan: 1 })
  assert.equal(f.fan, 4, '金钩钓 3 + 根 1')
  assert.ok(f.names.includes('金钩钓') && f.names.includes('根'), '实际 ' + f.names.join('/'))
})

ok('三副露 + 手牌成面子 → 不是金钩钓，按对对胡 1 番算', () => {
  const melds = [
    { kind: 'peng', tile: W(1), from: 1 },
    { kind: 'peng', tile: W(5), from: 2 },
    { kind: 'peng', tile: T(3), from: 3 }
  ]
  const hand = [I(2), I(2), I(2), T(9), T(9)]
  const shape = winShape(hand, 3)
  assert.equal(shape.jingou, false, '三副露不是金钩钓')
  assert.equal(shape.pengpeng, true)
  assert.equal(fanOf(shape, { capFan: 6 }).fan, 1, '对对胡 1 番')
})

ok('handShanten：孤立手牌（4 搭子）= 4，一向听 = 1', () => {
  // 13 张：每花色 1/4/7/9 + I2 → 可分解 4 组搭子（W7W9 T7T9 I1I2? I2I4+I7I9）
  // 最优分解 4 搭子无雀头：shanten = 8 - 4 = 4
  const lone = [W(1), W(4), W(7), T(1), T(4), T(7), I(1), I(4), I(7), W(9), T(9), I(9), I(2)]
  assert.equal(handShanten(lone, 0), 4)
  // 一向听：3 面子 + 雀头 + 散张
  const oneAway = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), T(2), T(3), T(4), I(5), I(8)]
  assert.equal(handShanten(oneAway, 0), 1)
})

ok('handShanten：听牌 = 0，胡牌 = -1', () => {
  const ting = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), T(2), T(3), T(4), I(5), I(6)]
  assert.equal(handShanten(ting, 0), 0)
  assert.equal(handShanten([...ting, I(7)], 0), -1)
})

ok('tingTiles：返回能胡的牌', () => {
  const ting = [W(1), W(1), W(2), W(3), W(4), W(5), W(6), W(7), T(2), T(3), T(4), I(5), I(6)]
  const tiles = tingTiles(ting, 0)
  assert.ok(tiles.includes(I(7)))
  assert.ok(tiles.includes(I(4)))
})

ok('hasVoidTiles', () => {
  assert.equal(hasVoidTiles([W(1), T(2)], 'tong'), true)
  assert.equal(hasVoidTiles([W(1), W(2)], 'tong'), false)
})

// ============================================================
// 2. 建局与守恒
// ============================================================
console.log('=== 建局/发牌 ===')

ok('发牌：庄家 14 张、其余 13 张，牌墙 55 张，phase=swap', () => {
  const s = createGame({ seed: 100 })
  assert.equal(s.phase, 'swap')
  // 庄家起手 14 张（第 14 张从墙头摸入，定缺后直接打出第一张）
  assert.equal(s.wall.length, TOTAL_TILES - 53)
  for (const p of s.players) assert.equal(p.hand.length, p.seat === s.dealer ? 14 : 13)
  assert.equal(s.dealer, 100 % 4)
  // 牌不重不漏
  const all = s.wall.concat(...s.players.map(p => p.hand))
  assert.equal(all.length, 108)
  const counts = new Array(27).fill(0)
  all.forEach(t => counts[t]++)
  counts.forEach(c => assert.ok(c <= 4))
})

ok('swapThree=false 时跳过换三张直接定缺', () => {
  const s = createGame({ seed: 5, rules: { swapThree: false } })
  assert.equal(s.phase, 'void')
})

/** 108 张守恒 + 每 id ≤ 4 */
function conservation(s, label) {
  const counts = new Array(27).fill(0)
  let total = 0
  const add = t => { counts[t]++; total++ }
  s.wall.forEach(add)
  total += 0
  for (const p of s.players) {
    p.hand.forEach(add)
    p.discards.forEach(add)
    for (const m of p.melds) {
      const n = m.kind === 'peng' ? 3 : 4
      // 幺鸡局副露可能带补位幺鸡：真牌 (n - wild) 张 + 幺鸡 wild 张
      const wild = m.wild || 0
      for (let k = 0; k < n - wild; k++) add(m.tile)
      for (let k = 0; k < wild; k++) add(YAOJI_TILE)
    }
  }
  if (s.drawnTile != null) add(s.drawnTile)
  if (s.pendingDiscard) add(s.pendingDiscard.tile)
  if (s.pendingKong) add(s.pendingKong.tile)
  assert.equal(total, 108, `${label} 牌总数 ${total} ≠ 108`)
  counts.forEach((c, t) =>
    assert.ok(c <= 4, `${label} 牌 ${tileName(t)} 出现 ${c} 张 > 4`)
  )
}

// ============================================================
// 快进工具：完成换三张 + 定缺
// ============================================================
function fastForward(seed, voidSuits, rules) {
  let s = createGame({ seed, rules })
  const vs = voidSuits || ['tong', 'tong', 'tong', 'tong']
  for (let seat = 0; seat < 4; seat++) {
    const p = s.players[seat]
    const bySuit = { wan: [], tong: [], tiao: [] }
    p.hand.forEach(t => bySuit[tileSuit(t)].push(t))
    let picked = null
    for (const su of ['wan', 'tong', 'tiao']) {
      if (bySuit[su].length >= 3) { picked = bySuit[su].slice(0, 3); break }
    }
    const r = dispatch(s, {
      type: 'swap', seat, tiles: picked,
      actionId: `ff-swap-${seat}`, stateVersion: s.version
    })
    assert.ok(r.ok, `快进 swap 失败: ${r.error}`)
    s = r.state
  }
  for (let seat = 0; seat < 4; seat++) {
    const r = dispatch(s, {
      type: 'void', seat, suit: vs[seat],
      actionId: `ff-void-${seat}`, stateVersion: s.version
    })
    assert.ok(r.ok, `快进 void 失败: ${r.error}`)
    s = r.state
  }
  assert.equal(s.phase, 'discard')
  // 庄家起手已是 14 张：定缺完成直接由其打出第一张，不再额外摸牌
  assert.equal(s.drawnTile, null)
  assert.equal(s.players[s.dealer].hand.length, 14)
  conservation(s, '快进后')
  return s
}

console.log('=== 换三张/定缺 ===')

ok('换三张：非同花色被拒（ILLEGAL）', () => {
  const s = createGame({ seed: 11 })
  const hand = s.players[0].hand
  const r = dispatch(s, {
    type: 'swap', seat: 0, tiles: [hand[0], hand[1], hand[5]],
    actionId: 'x1', stateVersion: s.version
  })
  // 不保证 hand[0..1] 与 hand[5] 异花色，用确定异色构造：
  const r2 = dispatch(s, {
    type: 'swap', seat: 0, tiles: [W(1), W(2), T(3)],
    actionId: 'x2', stateVersion: s.version
  })
  assert.ok(!r2.ok)
  assert.equal(r2.error, 'illegal')
})

ok('换三张：四人齐后按方向传递，庄家 14 张其余 13 张', () => {
  const seed = 42
  let s = createGame({ seed })
  const off = [1, 3, 2][seed % 3]
  const pickedBy = {}
  for (let seat = 0; seat < 4; seat++) {
    const p = s.players[seat]
    const bySuit = { wan: [], tong: [], tiao: [] }
    p.hand.forEach(t => bySuit[tileSuit(t)].push(t))
    let picked = null
    for (const su of ['wan', 'tong', 'tiao']) {
      if (bySuit[su].length >= 3) { picked = bySuit[su].slice(0, 3); break }
    }
    pickedBy[seat] = picked.slice()
    const r = dispatch(s, {
      type: 'swap', seat, tiles: picked,
      actionId: aid('sw', seat), stateVersion: s.version
    })
    assert.ok(r.ok)
    s = r.state
  }
  assert.equal(s.phase, 'void')
  // 断言方向：seat i 收到 (i - off + 4) % 4 的三张
  for (let i = 0; i < 4; i++) {
    const from = (i - off + 4) % 4
    for (const t of pickedBy[from]) {
      assert.ok(s.players[i].hand.includes(t), `seat${i} 应收到 ${tileName(t)}`)
    }
    assert.equal(s.players[i].hand.length, i === s.dealer ? 14 : 13)
    assert.equal(s.players[i].swapPicked, null)
  }
  conservation(s, '换三张后')
})

ok('定缺后进入摸打：庄家起手 14 张直接打第一张', () => {
  const s = fastForward(77)
  assert.equal(s.turn, s.dealer)
  assert.equal(s.drawnTile, null)
  assert.equal(s.players[s.dealer].hand.length, 14)
})

ok('天胡：庄家起手 14 张成胡，按封顶计，胡后由下家摸牌继续血战', () => {
  // seed 32 → 庄家为 0 号：构造牌先于其他座位补齐从池中取，不会被别人顺手摸走
  const s0 = fastForward(32)
  const d = s0.dealer
  assert.equal(d, 0, '本用例依赖庄家为 0 号座位')
  // 庄家起手就摆成胡牌型、还没摸牌（drawnTile 为空），定缺自己手里没有的万门：
  // 111 234 567 99 筒 + 222 条 = 14 张
  setupTable(s0, {
    turn: d,
    specs: {
      [d]: {
        tiles: [T(1), T(1), T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(9), T(9), I(2), I(2), I(2)],
        void: 'wan'
      }
    }
  })
  assert.equal(s0.drawnTile, null, '庄家尚未摸牌')
  assert.equal(s0.players[d].hand.length, 14)
  assert.ok(isWinHand(s0.players[d].hand, 0), '构造的起手牌应为胡牌型')
  // 起手未摸牌（drawnTile 为空）也要能报胡
  assert.ok(legalActions(s0, d).find(o => o.type === 'hu'), '起手成胡应给出胡选项')

  const r = dispatch(s0, { type: 'hu', seat: d, actionId: 'th-hu', stateVersion: s0.version })
  assert.ok(r.ok, `天胡失败: ${r.error}`)
  const s = r.state
  const capFan = s.rules.capFan
  const winner = s.players[d]
  assert.ok(winner.hu, '庄家应已胡牌')
  assert.equal(winner.hu.how, 'zimo')
  assert.equal(winner.hu.winTile, null, '天胡没有单独的胡牌张')
  assert.ok(winner.hu.names.includes('天胡'), '番型应含天胡，实际 ' + winner.hu.names.join('/'))
  assert.equal(winner.hu.fan, capFan, '天胡按封顶（满格）计')
  assert.equal(winner.hu.scoreDelta, 3 * Math.pow(2, capFan), '三家各付 2^capFan')
  // 血战继续：下一位活跃玩家摸牌，牌局不结束
  assert.notEqual(s.phase, 'finished')
  assert.equal(s.turn, (d + 1) % 4, '应由下家摸牌')
  assert.ok(s.drawnTile != null, '下家应已摸到牌')
  assert.equal(s.phase, 'discard')
  conservation(s, '天胡后')
})

// ============================================================
// 3. 定缺约束
// ============================================================
console.log('=== 定缺约束 ===')

ok('未打缺时打非缺门牌被拒', () => {
  let s = fastForward(7)
  s.turn = 0
  s.drawnTile = W(1)
  const p0 = s.players[0]
  p0.void = 'tong'
  p0.hand = [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), W(2), W(5), W(8), T(3)]
  // 手里有筒（缺门）→ 只能打筒
  const legal = legalActions(s, 0)
  const disc = legal.find(o => o.type === 'discard')
  assert.ok(disc.tiles.every(t => tileSuit(t) === 'tong'), '合法出牌应只有缺门')
  const r = dispatch(s, {
    type: 'discard', seat: 0, tile: W(1),
    actionId: 'v1', stateVersion: s.version
  })
  assert.ok(!r.ok)
  assert.equal(r.error, 'illegal')
  // 打缺门成功
  const r2 = dispatch(s, {
    type: 'discard', seat: 0, tile: T(3),
    actionId: 'v2', stateVersion: s.version
  })
  assert.ok(r2.ok, `打缺门失败: ${r2.error}`)
})

ok('未打缺时不能胡（自摸）：含缺门牌的成胡型不给胡，仍只能打缺门', () => {
  const s = fastForward(7)
  s.turn = 0
  s.drawnTile = W(1)
  const p0 = s.players[0]
  p0.void = 'tong'
  // W123 W456 W789 T222 T99：14 张成胡型，但含缺门筒 → 定缺没打完，不许胡
  p0.hand = [W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), T(2), T(2), T(2), T(9), T(9)]
  const legal = legalActions(s, 0)
  assert.equal(legal.find(o => o.type === 'hu'), undefined, '有缺门时不应有胡选项')
  const disc = legal.find(o => o.type === 'discard')
  assert.ok(disc && disc.tiles.length > 0 && disc.tiles.every(t => tileSuit(t) === 'tong'),
    '有缺门时出牌只能打缺门')
})

ok('未打缺时能暗杠（自己回合）：定缺只禁「胡」和「打非缺门」，不禁止杠', () => {
  const s = fastForward(9)
  setupTable(s, {
    turn: 0,
    drawnTile: W(1),
    specs: {
      0: {
        // 手牌 3 张真 W1 + 摸到的第 4 张 → 可暗杠；同时手里有缺门筒（未打缺）
        tiles: [W(1), W(1), W(1), W(2), W(3), W(4), T(1), T(1), T(1), T(5), T(5), I(2), I(3)],
        void: 'tong'
      }
    }
  })
  const legal = legalActions(s, 0)
  const gang = legal.find(o => o.type === 'gang')
  assert.ok(gang && gang.options.some(x => x.gangType === 'an' && x.tile === W(1)),
    '未打缺也能暗杠 W1')
  assert.equal(legal.find(o => o.type === 'hu'), undefined, '未打缺不给胡')
  const disc = legal.find(o => o.type === 'discard')
  assert.ok(disc.tiles.every(t => tileSuit(t) === 'tong'), '出牌仍只能打缺门筒')
  // 引擎真的放行，且杠完照旧只能打缺门（打缺义务不变）
  const r = dispatch(s, {
    type: 'gang', seat: 0, tile: W(1), gangType: 'an',
    actionId: 'v-gang-an', stateVersion: s.version
  })
  assert.ok(r.ok, `未打缺暗杠失败: ${r.error}`)
  assert.equal(r.state.players[0].melds[0].kind, 'gang')
  const disc2 = legalActions(r.state, 0).find(o => o.type === 'discard')
  assert.ok(disc2 && disc2.tiles.every(t => tileSuit(t) === 'tong'),
    '杠完（补牌后）仍只能打缺门筒')
  conservation(r.state, '未打缺暗杠')
})

// ============================================================
// 4. 碰 / 明杠 / 暗杠 / 补杠
// ============================================================
console.log('=== 碰/杠 ===')

/**
 * 场景构造：把全桌牌收进池，再按 specs 重新分配（保证守恒）。
 * specs: { turn, drawnTile, specs: {seat: {tiles, melds, void}}, keepWall? }
 * 未指定 tiles 的座位从池里补 13 张，并把 void 设为手里存在的花色
 * （有缺门牌 → 不能胡；碰/杠仍允许，隔离被测交互靠默认补牌构不成对子）。
 */
function setupTable(s, { turn = 0, drawnTile = null, specs = {} }) {
  const pool = s.wall.slice()
  for (const p of s.players) {
    pool.push(...p.hand)
    pool.push(...p.discards)
    p.hand = []
    p.discards = []
    for (const m of p.melds) {
      const n = m.kind === 'peng' ? 3 : 4
      for (let k = 0; k < n; k++) pool.push(m.tile)
    }
    p.melds = []
  }
  if (s.drawnTile != null) { pool.push(s.drawnTile); s.drawnTile = null }
  s.pendingDiscard = null
  s.pendingKong = null
  s.waiting = []
  s.claims = {}
  s.currentResponder = null
  s.respondStage = null
  s.mustDiscard = false
  s.afterGangDraw = false // 场景重建：默认非杠后补牌回合
  s.phase = 'discard'
  s.turn = turn

  const take = t => {
    const i = pool.indexOf(t)
    assert.ok(i >= 0, `牌 ${tileName(t)} 不在池中（池中该牌 ${pool.filter(x => x === t).length} 张）`)
    return pool.splice(i, 1)[0]
  }
  // 先给「所有座位」的副露和显式手牌占位，再从池补齐常规手牌数；
  // 否则靠前座位的默认补牌会 pool.shift 抢走靠后座位显式指定的牌。
  for (let seat = 0; seat < 4; seat++) {
    const p = s.players[seat]
    const spec = specs[seat] || {}
    for (const m of spec.melds || []) {
      const n = m.kind === 'peng' ? 3 : 4
      const wild = m.wild || 0
      for (let k = 0; k < n - wild; k++) take(m.tile)
      for (let k = 0; k < wild; k++) take(YAOJI_TILE)
      p.melds.push(m)
    }
  }
  for (let seat = 0; seat < 4; seat++) {
    const spec = specs[seat] || {}
    for (const t of spec.tiles || []) s.players[seat].hand.push(take(t))
  }
  if (drawnTile != null) s.drawnTile = take(drawnTile)
  for (let seat = 0; seat < 4; seat++) {
    const p = s.players[seat]
    const spec = specs[seat] || {}
    // 从池补齐常规手牌数（13 张 - 每组副露占用的 3 张；杠同样按 1 组 3 张计）
    const need = 13 - 3 * p.melds.length
    while (p.hand.length < need) {
      assert.ok(pool.length > 0, '池中牌不足')
      p.hand.push(pool.shift())
    }
    p.hand.sort((a, b) => a - b)
    if (spec.void) {
      p.void = spec.void
    } else {
      // 默认：手里存在的花色 → 有缺门牌（不能胡；碰/杠仍允许，隔离被测交互
      // 靠默认补牌构不成对子）
      const inHand = ['wan', 'tong', 'tiao'].filter(su =>
        p.hand.some(t => tileSuit(t) === su)
      )
      p.void = inHand[0] || 'tong'
    }
  }
  s.wall = pool
  conservation(s, '场景构造')
  return s
}

/** 无缺门（可响应）的响应者：void = 手里不存在的花色 */
function noVoidSuit(hand) {
  const inHand = new Set(hand.map(tileSuit))
  return ['wan', 'tong', 'tiao'].find(su => !inHand.has(su))
}

/**
 * 保证 want 这张牌在牌墙里（供「之后摸到同一张真牌」的场景使用）。
 * 不在墙里就与下家手牌原地对调，牌数与花色计数都不变。
 */
function ensureInWall(s, want) {
  if (s.wall.includes(want)) return
  for (let seat = 1; seat < 4; seat++) {
    const h = s.players[seat].hand
    const i = h.indexOf(want)
    if (i >= 0) {
      h[i] = s.wall[0]
      s.wall[0] = want
      return
    }
  }
  assert.fail(`牌墙与他人手牌都找不到 ${tileName(want)}`)
}

/** 把 want 挪到「刚摸到」的位置（与 drawnTile 原地对调，保持守恒） */
function drawTile(s, want) {
  ensureInWall(s, want)
  const i = s.wall.indexOf(want)
  s.wall[i] = s.drawnTile
  s.drawnTile = want
  s.turn = 0
  s.phase = 'discard'
  s.mustDiscard = false
}

ok('碰：副露正确、碰者直接出牌（不摸牌）', () => {
  let s = fastForward(7)
  // seat0 打 W9；seat1 持 2 张 W9 且无缺门（万+筒两门）；seat2/3 手里没有 W9 对子不响应
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(6), T(8), T(9), I(1), I(2), I(6), I(8), I(9), I(3)], void: 'wan' },
      1: { tiles: [W(9), W(9), W(1), W(2), W(4), W(5), T(2), T(3), T(4), T(5), T(6), T(7), T(8)], void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'p0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.phase, 'respond')
  assert.deepEqual(s.waiting, [1])
  const legal = legalActions(s, 1)
  assert.ok(legal.find(o => o.type === 'peng'))
  r = dispatch(s, { type: 'peng', seat: 1, actionId: 'p1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  const p1 = s.players[1]
  assert.equal(p1.melds.length, 1)
  assert.equal(p1.melds[0].kind, 'peng')
  assert.equal(p1.melds[0].tile, W(9))
  assert.equal(p1.melds[0].from, 0)
  assert.equal(p1.hand.filter(t => t === W(9)).length, 0)
  assert.equal(s.turn, 1)
  assert.equal(s.phase, 'discard')
  assert.equal(s.drawnTile, null, '碰后不摸牌')
  conservation(s, '碰后')
})

ok('碰后必须打一张：不能报胡/杠（听碰同牌场景回归）', () => {
  let s = fastForward(11)
  // seat1 听 W9：3 面子 + 雀头 + 对子 W9W9（仅万/筒两门，缺条）
  // seat0 打 W9 → seat1 同时「能胡能碰」；选择碰后 11 手牌 + 碰副露
  // 恰成 4 面子 + 雀头，但规则要求碰了必须打一张，不能报胡/杠
  setupTable(s, {
    turn: 0,
    drawnTile: I(9),
    specs: {
      0: { tiles: [W(9), T(1), T(6), T(8), T(9), I(1), I(2), I(3), I(6), I(7), I(8), I(9), I(5)], void: null },
      1: { tiles: [W(9), W(9), T(1), T(2), T(3), T(2), T(3), T(4), T(5), T(6), T(7), T(8), T(8)], void: 'tiao' }
    }
  })
  // seat0 走 setupTable 默认缺门：手里有万 → 缺万 → 只能打万，打 W9 合法
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'md0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.phase, 'respond')
  // 胡优先、逐个询问：seat1 是胡候选人，先只拿到「胡 / 过」（碰/杠要等胡阶段结束）
  const legalRsp = legalActions(s, 1)
  assert.ok(legalRsp.find(o => o.type === 'hu'), '响应窗口可点炮胡')
  assert.ok(!legalRsp.find(o => o.type === 'peng'), '胡阶段先不给碰（HU 高于碰/杠）')
  // 放弃点炮胡（过）：仍保留碰权，进入碰/明杠阶段后才拿到「碰 / 过」
  r = dispatch(s, { type: 'pass', seat: 1, actionId: 'mdp', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.phase, 'respond', '过胡后仍留在响应窗口等待碰/杠')
  const legalMeld = legalActions(s, 1)
  assert.ok(legalMeld.find(o => o.type === 'peng'), '碰/杠阶段可碰')
  r = dispatch(s, { type: 'peng', seat: 1, actionId: 'md1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.turn, 1)
  assert.equal(s.phase, 'discard')
  assert.equal(s.drawnTile, null)
  assert.equal(s.mustDiscard, true, '碰后进入强制出牌回合')
  const legal = legalActions(s, 1)
  assert.ok(!legal.find(o => o.type === 'hu'), '碰后不能报胡（即便牌型已齐）')
  assert.ok(!legal.find(o => o.type === 'gang'), '碰后不能补杠/暗杠')
  assert.ok(legal.find(o => o.type === 'discard'), '碰后只剩出牌')
  // 直接 dispatch 胡 / 杠也必须被引擎拒绝
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'md2', stateVersion: s.version })
  assert.ok(!r.ok, '碰后 dispatch 胡被拒绝')
  r = dispatch(s, { type: 'gang', seat: 1, tile: T(8), gangType: 'an', actionId: 'md3', stateVersion: s.version })
  assert.ok(!r.ok, '碰后 dispatch 杠被拒绝')
  // 打出一张后强制回合结束
  r = dispatch(s, { type: 'discard', seat: 1, tile: T(1), actionId: 'md4', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.mustDiscard, false, '出牌后强制回合结束')
  conservation(s, '碰后强制出牌')
})

ok('碰后手留一张：轮到自己时可出牌也可补杠（不强制补杠）', () => {
  let s = fastForward(9)
  // seat0 碰了 I7，手里还留 I7I8I9 想组顺子：第 4 张 I7 可补杠，也可留着打别的牌
  setupTable(s, {
    turn: 0,
    drawnTile: I(3),
    specs: {
      0: {
        tiles: [I(7), I(8), I(9), W(1), W(2), W(4), W(6), W(7), W(9), I(2)],
        melds: [{ kind: 'peng', tile: I(7), from: 2 }],
        void: 'tong'
      }
    }
  })
  const legal = legalActions(s, 0)
  const disc = legal.find(o => o.type === 'discard')
  const gang = legal.find(o => o.type === 'gang')
  assert.ok(disc, '必须同时给出出牌选项')
  assert.ok(disc.tiles.includes(I(7)) && disc.tiles.includes(I(8)) && disc.tiles.includes(I(9)), '含第 4 张 I7 在内的手牌都可打')
  assert.ok(gang && gang.options.some(o => o.gangType === 'bu' && o.tile === I(7)), '补杠只是可选项')
  // 选择不杠：直接出牌必须成功（不被补杠卡住）
  const r = dispatch(s, { type: 'discard', seat: 0, tile: I(8), actionId: 'nb0', stateVersion: s.version })
  assert.ok(r.ok, '不补杠直接出牌应合法: ' + r.error)
  conservation(r.state, '碰后不补杠出牌')
})

ok('明杠：放杠者付 1 分，杠者墙尾摸牌', () => {
  let s = fastForward(8)
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(6), T(8), T(9), I(1), I(2), I(6), I(8), I(9), I(3)], void: 'wan' },
      1: { tiles: [W(9), W(9), W(9), W(1), W(2), W(4), T(2), T(3), T(4), T(5), T(6), T(7), T(9)], void: 'tiao' }
    }
  })
  const wallTailBefore = s.wall[s.wall.length - 1]
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'g0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  const legal = legalActions(s, 1)
  const gangOpt = legal.find(o => o.type === 'gang')
  assert.ok(gangOpt && gangOpt.options[0].gangType === 'ming')
  const d0 = s.players[0].delta
  const d1 = s.players[1].delta
  r = dispatch(s, { type: 'gang', seat: 1, tile: W(9), gangType: 'ming', actionId: 'g1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.players[0].delta, d0 - 1, '明杠放杠者付 1')
  assert.equal(s.players[1].delta, d1 + 1, '明杠者收 1')
  assert.equal(s.players[1].melds[0].kind, 'gang')
  assert.equal(s.players[1].melds[0].gangType, 'ming')
  assert.equal(s.drawnTile, wallTailBefore, '杠后从墙尾摸牌')
  assert.equal(s.turn, 1)
  assert.ok(s.ledger.some(e => e.reason === 'gang-ming' && e.from === 0 && e.to === 1 && e.amount === 1))
  conservation(s, '明杠后')
})

ok('明杠后胡牌：杠本身算 1 根（平胡 0 + 根 1 + 自摸 1 + 杠上花 1 = 3 番 = 8 倍）', () => {
  let s = fastForward(18)
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(6), T(8), T(9), I(1), I(2), I(6), I(8), I(9), I(3)], void: 'wan' },
      // seat1 持 3 张 W9 可明杠；其余 10 张只差一张 T9 成胡（W123 T234 T567 + T99）
      1: { tiles: [W(9), W(9), W(9), W(1), W(2), W(3), T(2), T(3), T(4), T(5), T(6), T(7), T(9)], void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'mg0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  r = dispatch(s, { type: 'gang', seat: 1, tile: W(9), gangType: 'ming', actionId: 'mg1', stateVersion: s.version })
  assert.ok(r.ok, '明杠应成功: ' + r.error)
  s = r.state
  assert.equal(s.players[1].melds[0].gangType, 'ming')
  // 杠后补牌固定为 T9（隔离牌墙随机性）
  s.drawnTile = T(9)
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'mg2', stateVersion: s.version })
  assert.ok(r.ok, '明杠后自摸胡应成功: ' + r.error)
  const hu = r.state.players[1].hu
  assert.equal(hu.fan, 3, '平胡 0 + 根 1（明杠）+ 自摸 1 + 杠上花 1')
  assert.ok(hu.names.includes('根') && hu.names.includes('杠上花'), '实际 ' + hu.names.join('/'))
})

ok('暗杠：每位活跃玩家付 2 分', () => {
  let s = fastForward(9)
  setupTable(s, {
    turn: 0,
    drawnTile: W(5),
    specs: {
      0: { tiles: [W(5), W(5), W(5), W(1), W(2), W(3), W(7), W(8), W(9), I(1), I(4), I(7), I(2)], void: 'tong' }
    }
  })
  const wallTailBefore = s.wall[s.wall.length - 1]
  const legal = legalActions(s, 0)
  const gang = legal.find(o => o.type === 'gang')
  assert.ok(gang && gang.options.some(o => o.tile === W(5) && o.gangType === 'an'))
  const r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'an', actionId: 'a1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.players[0].delta, 6, '暗杠收 3×2')
  for (let seat = 1; seat < 4; seat++) assert.equal(s.players[seat].delta, -2)
  assert.equal(s.drawnTile, wallTailBefore, '暗杠后墙尾摸牌')
  assert.ok(s.ledger.filter(e => e.reason === 'gang-an').length === 3)
  conservation(s, '暗杠后')
})

ok('补杠（无人抢）：peng 副露升级 + 杠分', () => {
  let s = fastForward(10)
  setupTable(s, {
    turn: 0,
    drawnTile: W(5),
    specs: {
      0: {
        melds: [{ kind: 'peng', tile: W(5), from: 2 }],
        tiles: [W(2), W(3), T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), T(9), T(1)],
        void: 'tiao'
      }
    }
  })
  const wallTailBefore = s.wall[s.wall.length - 1]
  const legal = legalActions(s, 0)
  const gang = legal.find(o => o.type === 'gang')
  assert.ok(gang && gang.options.some(o => o.gangType === 'bu'))
  const r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'bu', actionId: 'b1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  const meld = s.players[0].melds[0]
  assert.equal(meld.kind, 'gang')
  assert.equal(meld.gangType, 'bu')
  assert.equal(s.players[0].delta, 6, '补杠收 3×2')
  assert.equal(s.drawnTile, wallTailBefore, '补杠后墙尾摸牌')
  assert.equal(s.phase, 'discard')
  conservation(s, '补杠后')
})

// ============================================================
// 5. 抢杠胡
// ============================================================
console.log('=== 抢杠胡 ===')

ok('抢杠胡：杠不成立、被抢的牌算被抢者点炮、抢杠 +1 番', () => {
  let s = fastForward(11)
  // seat0 补杠 W5（meld 3 张 + drawnTile）；seat1 恰好听 W5
  setupTable(s, {
    turn: 0,
    drawnTile: W(5),
    specs: {
      0: {
        melds: [{ kind: 'peng', tile: W(5), from: 2 }],
        tiles: [W(2), W(3), W(4), W(6), W(7), W(8), T(2), T(2), T(3), T(3), T(4), T(8), T(9)],
        void: 'tiao'
      },
      // seat1: T11 + W123 + W789 + T567 + W4W6 嵌张 → 听 W5
      1: {
        tiles: [T(1), T(1), W(1), W(2), W(3), W(7), W(8), W(9), T(5), T(6), T(7), W(4), W(6)],
        void: 'tiao'
      }
    }
  })
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'bu', actionId: 'r0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.phase, 'respond', '应进入抢杠窗口')
  assert.equal(s.pendingKong.tile, W(5))
  assert.deepEqual(s.waiting, [1])
  const legal = legalActions(s, 1)
  assert.ok(legal.find(o => o.type === 'hu' && o.how === 'qianggang'), 'seat1 应可抢杠胡')
  const d0 = s.players[0].delta
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'r1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.players[1].hu.how, 'qianggang')
  assert.ok(s.players[1].hu.names.includes('抢杠胡'), '抢杠应加番：' + s.players[1].hu.names.join('/'))
  assert.equal(s.players[1].hu.fan, 1, '平胡 0 + 抢杠胡 1')
  assert.equal(s.players[1].hu.scoreDelta, 2)
  assert.equal(s.players[0].delta, d0 - 2, '被抢者按点炮赔付')
  assert.equal(s.players[0].melds[0].kind, 'peng', '杠不成立（peng 未升级）')
  assert.ok(s.players[0].discards.includes(W(5)), '被抢的牌进被抢者弃牌区（相当于他点炮）')
  assert.equal(s.players[0].hand.filter(t => t === W(5)).length, 0, '被抢的牌不回手')
  assert.ok(!s.ledger.some(e => e.reason.startsWith('gang')), '杠钱一分不收（相当于没杠到）')
  assert.equal(s.turn, 0, '被抢者继续摸牌')
  assert.notEqual(s.drawnTile, null)
  conservation(s, '抢杠后')
})

ok('幺鸡补杠被抢：幺鸡留在副露里补位（2 真 + 1 赖）、不可换回、只能摸真牌再杠', () => {
  let s = fastForward(11, undefined, { yaojiEnabled: true })
  // seat0 碰 3 真 W5，摸到幺鸡 → 拿幺鸡补杠 W5；seat1 听 W5 抢杠
  setupTable(s, {
    turn: 0,
    drawnTile: YAOJI_TILE,
    specs: {
      0: {
        melds: [{ kind: 'peng', tile: W(5), from: 2 }],
        tiles: [W(2), W(3), W(4), W(6), W(7), W(8), T(2), T(2), T(3), T(4)],
        void: 'tiao'
      },
      1: {
        tiles: [T(1), T(1), W(1), W(2), W(3), W(7), W(8), W(9), T(5), T(6), T(7), W(4), W(6)],
        void: 'tiao'
      }
    }
  })
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'bu', actionId: 'yj-q0', stateVersion: s.version })
  assert.ok(r.ok, `补杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.pendingKong.buWild, 1, '补的是幺鸡')
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'yj-q1', stateVersion: s.version })
  assert.ok(r.ok, `抢杠胡失败: ${r.error}`)
  s = r.state
  const p0 = s.players[0]
  assert.equal(p0.melds[0].kind, 'peng', '杠不成立')
  assert.equal(p0.melds[0].wild, 1, '被取走一张真牌，幺鸡留在副露里补位（2 真 + 1 赖）')
  assert.equal(p0.hand.filter(t => t === YAOJI_TILE).length, 0, '幺鸡不回手')
  assert.equal(p0.hand.length, 10, '手牌回到 3n+1（被抢的牌不回手）')
  assert.ok(s.drawnTile != null, '被抢者继续摸牌')
  assert.ok(!s.ledger.some(e => e.reason.startsWith('gang')), '杠钱一分不收')
  // 幺鸡留在副露里 → 不可换回、也不能再用幺鸡补杠，只能等摸到真牌
  const buOpts = () => legalActions(s, 0)
    .filter(o => o.type === 'gang')
    .flatMap(o => o.options)
    .filter(o => o.gangType === 'bu')
  assert.equal(legalActions(s, 0).find(o => o.type === 'swap-yaoji'), undefined, '碰带幺鸡不可换回')
  assert.equal(buOpts().length, 0, '手里只剩幺鸡时不能再用幺鸡补杠')
  // 摸到真牌 W5（与刚摸的牌对调，保持牌池守恒）→ 可补杠，幺鸡补位杠价每家 1 分
  const drawn = s.drawnTile
  const wi = s.wall.indexOf(W(5))
  assert.ok(wi >= 0, '墙里应有真牌 W5')
  s.wall[wi] = drawn
  s.drawnTile = W(5)
  assert.ok(
    buOpts().some(o => o.tile === W(5)),
    '摸到真牌后可再补杠'
  )
  const dBefore = s.players[0].delta
  r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'bu', actionId: 'yj-q2', stateVersion: s.version })
  assert.ok(r.ok, `再补杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[0].melds[0].kind, 'gang')
  assert.equal(s.players[0].melds[0].wild, 1, '3 真 + 1 赖，一副露仍只 1 只幺鸡')
  // 带幺鸡的补杠：每位活跃未胡对手付 1 分（seat1 已胡，只剩 2 家付）
  assert.equal(s.players[0].delta - dBefore, 2, '补杠带幺鸡：每家 1 分 × 2 家')
  conservation(s, '幺鸡补杠被抢后再补杠')
})

// ============================================================
// 6. 一炮多响
// ============================================================
console.log('=== 一炮多响 ===')

ok('一炮多响：所有胡权玩家同时表态，全部有结果后一次性结算', () => {
  let s = fastForward(12)
  // seat0 打 W9（缺门万只能打它）；seat1/seat2 都听 W9（W7W8 两面）
  const tingW9 = pair => [pair, pair, W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(5), T(6), T(7)]
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(2), T(3), T(4), T(5), T(6), T(7), T(8), I(2), I(3), I(4), I(5), I(6), I(7)], void: 'wan' },
      1: { tiles: tingW9(T(1)), void: 'tiao' },
      2: { tiles: tingW9(T(9)), void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'm0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.phase, 'respond')
  assert.deepEqual(s.waiting, [1, 2], '候选按有效摸牌顺序排列')
  assert.equal(s.respondStage, 'hu', '先进入并行 HU 阶段')
  assert.equal(s.currentResponder, null, 'HU 阶段并行收集，没有唯一响应者')
  assert.deepEqual(s.huWait, [1, 2], '两家同时拥有胡权、同时思考')
  assert.equal(legalActions(s, 1).filter(o => o.type === 'hu').length, 1, 'seat1 可以胡')
  assert.equal(legalActions(s, 2).filter(o => o.type === 'hu').length, 1, 'seat2 同时也拿到胡权（不因 seat1 先到而失效）')
  // seat1 先叫胡：窗口不关，seat2 仍可胡（有人先点胡也不能马上关闭窗口）
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'm1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.phase, 'respond', 'seat1 叫胡后窗口仍未关闭，等这一批胡权全部有结果')
  assert.equal(s.players[1].hu, null, '未全部表态前不结算')
  assert.deepEqual(s.huWait, [2], '只剩 seat2 还没表态')
  assert.ok(legalActions(s, 2).some(o => o.type === 'hu'), 'seat2 依然拥有胡权')
  // seat2 也叫胡 → 这一批全部有结果，一次性批量结算两家
  r = dispatch(s, { type: 'hu', seat: 2, actionId: 'm2', stateVersion: s.version })
  assert.ok(r.ok, `seat2 胡失败: ${r.error}`)
  s = r.state
  assert.ok(s.players[1].hu && s.players[2].hu, '两家同时胡成（一炮多响）')
  assert.equal(s.players[1].hu.how, 'dianpao')
  assert.equal(s.players[2].hu.how, 'dianpao')
  assert.equal(s.huOrder.length, 2)
  const pays = s.ledger.filter(e => e.reason === 'dianpao')
  assert.equal(pays.length, 2, '向两位胡者各结算一份')
  assert.ok(pays.every(e => e.from === 0), '均由点炮者 seat0 支付')
  assert.equal(s.players[0].delta, -pays.reduce((a, e) => a + e.amount, 0), '点炮者付两份')
  // 血战继续：下一手复用引擎活跃座位逻辑——seat1/seat2 已出阵，轮到 seat3
  assert.equal(s.turn, 3, '两位胡家出阵后，由其次位活跃玩家摸牌')
  assert.notEqual(s.drawnTile, null)
  conservation(s, '一炮多响一次性结算后')
})

ok('自摸比平胡多一番：同一副平胡牌点炮 1 分 / 自摸每户 2 分', () => {
  let s = fastForward(21)
  // 门清平胡：W123 W456 W789 T234 + T55，自摸 T5
  const ting13 = [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), T(2), T(3), T(4), T(5)]
  setupTable(s, {
    turn: 0,
    drawnTile: T(5),
    specs: { 0: { tiles: ting13, void: 'tiao' } }
  })
  const r = dispatch(s, { type: 'hu', seat: 0, actionId: 'zf0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  const hu = s.players[0].hu
  assert.equal(hu.how, 'zimo')
  assert.equal(hu.fan, 1, '平胡 0 番 + 自摸 1 番 = 1 番（点炮 0 番即 1 分）')
  assert.ok(hu.names.includes('自摸'))
  const pays = s.ledger.filter(e => e.reason === 'zimo')
  assert.equal(pays.length, 3)
  assert.ok(pays.every(e => e.amount === 2), '每户付 2^1 = 2 分')
  conservation(s, '自摸加番后')
})

ok('海底捞月：牌墙摸空后自摸，平胡 0 + 自摸 1 + 海底 1 = 2 番 = 4 倍', () => {
  let s = fastForward(31)
  // 门清平胡：W123 W456 W789 T234 + T55，摸到 T5
  const ting13 = [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), T(2), T(3), T(4), T(5)]
  setupTable(s, {
    turn: 0,
    drawnTile: T(5),
    specs: { 0: { tiles: ting13, void: 'tiao' } }
  })
  // 模拟「牌墙最后一张」：这张 T5 就是墙里最后一张，摸走后牌墙为空
  s.wall = []
  const r = dispatch(s, { type: 'hu', seat: 0, actionId: 'hd0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  const hu = s.players[0].hu
  assert.equal(hu.how, 'zimo')
  assert.equal(hu.fan, 2, '平胡 0 + 自摸 1 + 海底 1')
  assert.ok(hu.names.includes('海底捞月'), '自摸的海底称“海底捞月”，实际 ' + hu.names.join('/'))
  assert.ok(hu.names.includes('自摸'))
  const pays = s.ledger.filter(e => e.reason === 'zimo')
  assert.ok(pays.length > 0 && pays.every(e => e.amount === 4), '每户付 2^2 = 4 分')
})

ok('海底炮：牌墙摸空后点炮胡，平胡 0 + 海底 1 = 1 番 = 2 倍', () => {
  let s = fastForward(41)
  const tingW9 = pair => [pair, pair, W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(5), T(6), T(7)]
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), I(2), I(3), I(4), I(5), I(6)], void: 'wan' },
      1: { tiles: tingW9(T(1)), void: 'tiao' }
    }
  })
  // 这张 W(9) 是牌墙最后一张：打出后牌墙为空 → 点炮即“海底炮”
  s.wall = []
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'hd1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'hd2', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  const hu = s.players[1].hu
  assert.equal(hu.how, 'dianpao')
  assert.equal(hu.fan, 1, '平胡 0 + 海底 1（点炮不加自摸番）')
  assert.ok(hu.names.includes('海底炮'), '点炮的海底称“海底炮”，实际 ' + hu.names.join('/'))
  assert.ok(!hu.names.includes('自摸'))
})

ok('海底炮叠加：在原有番数上额外 +1 番（碰碰胡 1 + 海底 1 = 2 番 = 4 倍）', () => {
  let s = fastForward(43)
  // 0 号缺万且手里无万，打出摸到的 T9；1 号碰碰胡单吊 T9 点炮胡
  setupTable(s, {
    turn: 0,
    drawnTile: T(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), I(2), I(3), I(4), I(5), I(6)], void: 'wan' },
      1: {
        tiles: [W(1), W(1), W(1), W(5), W(5), W(5), W(7), W(7), W(7), T(3), T(3), T(3), T(9)],
        void: 'tiao'
      }
    }
  })
  // 这张 T9 是牌墙最后一张：打出后牌墙为空 → 点炮即“海底炮”
  s.wall = []
  let r = dispatch(s, { type: 'discard', seat: 0, tile: T(9), actionId: 'hd4', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'hd5', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  const hu = s.players[1].hu
  assert.equal(hu.how, 'dianpao')
  assert.equal(hu.fan, 2, '碰碰胡 1 + 海底 1 = 2 番（海底为叠加项，不是把番数改成 1）')
  assert.ok(hu.names.includes('碰碰胡'), '番型名应含碰碰胡，实际 ' + hu.names.join('/'))
  assert.ok(hu.names.includes('海底炮'), '番型名应含海底炮，实际 ' + hu.names.join('/'))
  assert.ok(!hu.names.includes('自摸'))
  const pays = s.ledger.filter(e => e.reason === 'dianpao')
  assert.equal(pays.length, 1)
  assert.equal(pays[0].amount, 4, '点炮者付 2^2 = 4 分（底番 1 + 海底 1）')
})

ok('非海底不加番：牌墙未空时同一副牌自摸只有 1 番', () => {
  let s = fastForward(51)
  const ting13 = [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), T(2), T(3), T(4), T(5)]
  setupTable(s, {
    turn: 0,
    drawnTile: T(5),
    specs: { 0: { tiles: ting13, void: 'tiao' } }
  })
  assert.ok(s.wall.length > 0)
  const r = dispatch(s, { type: 'hu', seat: 0, actionId: 'hd3', stateVersion: s.version })
  assert.ok(r.ok)
  const hu = r.state.players[0].hu
  assert.equal(hu.fan, 1, '平胡 0 + 自摸 1，无海底番')
  assert.ok(!hu.names.includes('海底捞月') && !hu.names.includes('海底炮'))
})

// ---- 杠上胡加番：杠上花（杠后自摸）/ 杠上炮（杠后点炮） ----

ok('杠上花：杠后补牌自摸，平胡 0 + 根 1（暗杠）+ 自摸 1 + 杠上花 1 = 3 番 = 8 倍', () => {
  let s = fastForward(61)
  // seat0 起手 14 张：暗杠 W5×4 + W123 W789 T234 + 孤张 T9（补到 T9 成对即胡）
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [
          W(5), W(5), W(5), W(5),
          W(1), W(2), W(3), W(7), W(8), W(9),
          T(2), T(3), T(4), T(9)
        ],
        void: 'tiao'
      }
    }
  })
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'an', actionId: 'gs0', stateVersion: s.version })
  assert.ok(r.ok, '暗杠应成功: ' + r.error)
  s = r.state
  assert.equal(s.afterGangDraw, true, '杠后补牌回合应打上标记')
  // 杠后从墙尾摸牌：测试内固定补牌结果为 T9（隔离牌墙随机性）
  s.drawnTile = T(9)
  r = dispatch(s, { type: 'hu', seat: 0, actionId: 'gs1', stateVersion: s.version })
  assert.ok(r.ok, '杠后自摸胡应成功: ' + r.error)
  s = r.state
  const hu = s.players[0].hu
  assert.equal(hu.how, 'zimo')
  assert.equal(hu.fan, 3, '平胡 0 + 根 1 + 自摸 1 + 杠上花 1')
  assert.ok(hu.names.includes('杠上花'), '杠后自摸称“杠上花”，实际 ' + hu.names.join('/'))
  assert.ok(hu.names.includes('自摸'))
  assert.ok(hu.names.includes('根'), '暗杠本身也是一根，实际 ' + hu.names.join('/'))
  const pays = s.ledger.filter(e => e.reason === 'zimo')
  assert.ok(pays.length > 0 && pays.every(e => e.amount === 8), '每户付 2^3 = 8 分')
})

ok('杠上炮：杠后打出点炮，平胡 0 + 杠上炮 1 = 1 番 = 2 倍', () => {
  let s = fastForward(71)
  const tingW9 = pair => [pair, pair, W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(5), T(6), T(7)]
  // seat0 暗杠 T9×4 后打 W9；seat1 听 W9（W7W8 两面）
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [
          T(9), T(9), T(9), T(9),
          W(9), W(1), W(2), W(3), W(7), W(8),
          T(1), T(2), T(3), T(4)
        ],
        void: 'tiao'
      },
      1: { tiles: tingW9(T(1)), void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'gang', seat: 0, tile: T(9), gangType: 'an', actionId: 'gp0', stateVersion: s.version })
  assert.ok(r.ok, '暗杠应成功: ' + r.error)
  s = r.state
  assert.equal(s.afterGangDraw, true)
  // 杠后补牌固定为墙里一张非缺门牌（隔离随机性：摸到缺门条子时只能打缺，无法按需出牌；
  // 与墙内另一张牌交换，保持 108 张守恒）
  const tail = s.drawnTile
  const wi = s.wall.findIndex(t => tileSuit(t) !== 'tiao')
  assert.ok(wi >= 0, '墙里应有非条子牌可换')
  s.drawnTile = s.wall.splice(wi, 1)[0]
  s.wall.push(tail)
  r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'gp1', stateVersion: s.version })
  assert.ok(r.ok, '杠后打出 W9 应成功: ' + r.error)
  s = r.state
  assert.equal(s.phase, 'respond')
  assert.ok(s.waiting.includes(1))
  assert.equal(s.afterGangDraw, false, '出牌后清空杠后标记')
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'gp2', stateVersion: s.version })
  assert.ok(r.ok, '点炮胡应成功: ' + r.error)
  s = r.state
  const hu = s.players[1].hu
  assert.equal(hu.how, 'dianpao')
  assert.equal(hu.fan, 1, '平胡 0 + 杠上炮 1（点炮不加自摸番）')
  assert.ok(hu.names.includes('杠上炮'), '点炮的杠胡称“杠上炮”，实际 ' + hu.names.join('/'))
  assert.ok(!hu.names.includes('自摸'))
})

ok('非杠后胡不加杠上番：普通自摸平胡只有 1 番', () => {
  let s = fastForward(81)
  const ting13 = [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), T(2), T(3), T(4), T(5)]
  setupTable(s, {
    turn: 0,
    drawnTile: T(5),
    specs: { 0: { tiles: ting13, void: 'tiao' } }
  })
  assert.equal(s.afterGangDraw, false, '普通摸牌不标记杠后')
  const r = dispatch(s, { type: 'hu', seat: 0, actionId: 'ng0', stateVersion: s.version })
  assert.ok(r.ok)
  const hu = r.state.players[0].hu
  assert.equal(hu.fan, 1, '平胡 0 + 自摸 1，无杠上番')
  assert.ok(!hu.names.includes('杠上花') && !hu.names.includes('杠上炮'))
})

ok('响应窗口：先过不能跳过其他玩家的胡权', () => {
  let s = fastForward(15)
  const tingW9 = pair => [pair, pair, W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(5), T(6), T(7)]
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), I(2), I(3), I(4), I(5), I(6)], void: 'wan' },
      1: { tiles: tingW9(T(1)), void: 'tiao' },
      2: { tiles: tingW9(T(9)), void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'pass-window-0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.ok(s.waiting.includes(1) && s.waiting.includes(2))
  r = dispatch(s, { type: 'pass', seat: 1, actionId: 'pass-window-1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.phase, 'respond', '第一位过牌后仍应等待第二位')
  assert.equal(s.pendingDiscard.tile, W(9))
  assert.equal(s.claims[1], 'pass')
  r = dispatch(s, { type: 'hu', seat: 2, actionId: 'pass-window-2', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.players[2].hu.how, 'dianpao')
  assert.equal(s.turn, 3, '点炮后由胡牌人下家摸牌')
  conservation(s, '响应窗口先过后胡')
})

/**
 * 构造「seat2（对家）打 7 万，seat3（左家/上家）与 seat0（我）都能碰」的牌桌。
 * 幺鸡局：seat0 用「幺鸡 + 7万」碰（较远），seat3 用 2 张真 7万 碰（较近）。
 * 摸牌顺序自 seat2 起为 3 → 0 → 1，故 seat3 比 seat0 优先叫碰。
 * 两家的牌面都刻意不成胡，保证只测「碰/杠同级按顺序」。
 */
function twoClaimersForW7(seed) {
  const s = fastForward(seed, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 2,
    drawnTile: W(7),
    specs: {
      0: {
        tiles: [W(7), YAOJI_TILE, W(1), W(4), W(9), W(2), W(5), W(8), I(2), I(5), I(8), I(3), I(6)],
        void: 'tong'
      },
      1: {
        tiles: [T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), T(9), I(2), I(3), I(4), I(8)],
        void: 'tong'
      },
      2: {
        tiles: [T(1), T(1), T(2), T(2), T(3), T(3), T(4), T(4), T(5), T(5), T(6), T(6), T(7)],
        void: 'tiao'
      },
      3: {
        tiles: [W(7), W(7), W(1), W(3), W(5), W(9), I(2), I(4), I(6), I(8), I(3), I(5), I(7)],
        void: 'tong'
      }
    }
  })
  const r = dispatch(s, { type: 'discard', seat: 2, tile: W(7), actionId: aid('w7', seed), stateVersion: s.version })
  assert.ok(r.ok, `出牌失败: ${r.error}`)
  // 无胡候选人、也无杠候选人：直接进入碰阶段，测的就是同级按顺序
  assert.equal(r.state.respondStage, 'peng', '无人可胡/杠 → 直接进入碰阶段')
  return r.state
}

ok('响应顺序：waiting 按摸牌顺序排列，更近的一家没表态前较远者拿不到碰', () => {
  let s = twoClaimersForW7(21)
  assert.deepEqual(s.waiting, [3, 0], 'waiting 应按离出牌者的距离排列（左家 3 在前）')
  assert.equal(s.currentResponder, 3, '最近的一家先获得决定权')
  assert.ok(legalActions(s, 3).some(o => o.type === 'peng'), '最近的一家应能叫碰')
  assert.equal(legalActions(s, 0).length, 0, '更近的一家还没表态时，较远者没有决定权')
  // 左家放弃 → 才轮到我思考，这时才出现「碰」
  let r = dispatch(s, { type: 'pass', seat: 3, actionId: aid('ord', 2), stateVersion: s.version })
  assert.ok(r.ok, `过牌失败: ${r.error}`)
  s = r.state
  assert.ok(
    legalActions(s, 0).some(o => o.type === 'peng'),
    '更近的一家放弃后，较远者才获得碰选项'
  )
  r = dispatch(s, { type: 'peng', seat: 0, actionId: aid('ord', 3), stateVersion: s.version })
  assert.ok(r.ok, `碰失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[0].melds.length, 1)
  assert.equal(s.players[0].melds[0].tile, W(7))
  assert.equal(s.players[0].melds[0].wild, 1, '幺鸡 + 7万 碰成（用赖子补位）')
  conservation(s, '响应顺序：先叫后碰')
})

ok('响应顺序：非当前响应者的 view 标注 awaitingNearer（UI 显示等待而不是可点的「过」）', () => {
  let s = twoClaimersForW7(23)
  const v0 = playerView(s, 0)
  assert.deepEqual(v0.my.awaitingNearer, [3], '我应被告知：在等左家先叫牌（他不是我的回合）')
  assert.equal(v0.legal.length, 0, '不是我的回合：引擎不给任何动作（不给可点的「过」）')
  assert.deepEqual(playerView(s, 3).my.awaitingNearer, [], '最近的左家是当前响应者，不该等任何人')
  assert.ok(playerView(s, 3).legal.some(o => o.type === 'peng'), '当前响应者才拿到「碰」')
  // 左家表态后：等待清空，碰才出现——UI 那一下等待提示就会换成「碰」
  const r = dispatch(s, { type: 'pass', seat: 3, actionId: aid('aw', 2), stateVersion: s.version })
  assert.ok(r.ok, `过牌失败: ${r.error}`)
  s = r.state
  const v1 = playerView(s, 0)
  assert.deepEqual(v1.my.awaitingNearer, [], '左家表态后不再等待')
  assert.ok(v1.legal.some(o => o.type === 'peng'), '这时才出现「碰」')
  conservation(s, 'awaitingNearer')
})

ok('响应优先级：碰从属于胡——有胡候选人时先问胡，碰权玩家要等', () => {
  // 对面(2)打 4 万：我(0)能用幺鸡碰，右家(1)吃这张就胡。胡 > 碰：
  // 先按顺序逐个问胡候选人（右家），他叫胡立即成立；我(0)的碰要等胡阶段结束。
  let s = fastForward(31, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 2,
    drawnTile: W(4),
    specs: {
      // 我(0)：1 张真 4 万 + 1 只幺鸡 → 能碰；牌面散乱，胡不了
      0: {
        tiles: [W(4), YAOJI_TILE, W(1), W(3), W(5), W(7), W(9), T(1), T(2), T(3), T(5), T(7), T(9)],
        void: 'tiao'
      },
      // 右家(1)：吃 4 万即胡（W123 / W456 / W99 / T123 / T456）
      1: {
        tiles: [W(1), W(2), W(3), W(5), W(6), W(9), W(9), T(1), T(2), T(3), T(4), T(5), T(6)],
        void: 'tiao'
      },
      // 对面(2)：drawnTile 即要打出的 4 万（不发幺鸡，留给座位 0 用）
      2: {
        tiles: [T(4), T(6), T(8), T(8), I(2), I(2), I(3), I(3), I(4), I(4), I(5), I(5), I(6)],
        void: 'wan'
      },
      // 左家(3)：无 4 万、也胡不了，不参与本次响应
      3: {
        tiles: [T(9), T(9), T(8), T(7), I(3), I(3), I(4), I(4), I(7), I(7), I(8), I(8), I(9)],
        void: 'wan'
      }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 2, tile: W(4), actionId: aid('hp', 1), stateVersion: s.version })
  assert.ok(r.ok, `出牌失败: ${r.error}`)
  s = r.state
  assert.deepEqual(s.waiting, [0, 1], '响应者应为：等碰的我(0) + 等胡的右家(1)')
  assert.equal(s.respondStage, 'hu', '先进入胡阶段')
  assert.equal(s.currentResponder, null, 'HU 阶段并行收集，没有唯一响应者')
  assert.equal(legalActions(s, 0).length, 0, '胡阶段我不该拿到碰（要等胡候选人表态）')
  assert.deepEqual(legalActions(s, 1).map(o => o.type), ['hu', 'pass'], '右家只有胡 / 过')

  // 右家叫胡：胡 > 碰，立即成立，我的碰权随之失效
  r = dispatch(s, { type: 'hu', seat: 1, actionId: aid('hp', 2), stateVersion: s.version })
  assert.ok(r.ok, `叫胡失败: ${r.error}`)
  s = r.state
  assert.ok(s.players[1].hu, '右家应立刻胡成')
  assert.equal(s.players[1].hu.how, 'dianpao')
  assert.equal(s.players[0].melds.length, 0, '胡优先于碰：我的碰不应成立')
  assert.equal(s.pendingDiscard, null, '点炮那张已被胡走，响应窗口关闭')
  assert.equal(s.currentResponder, null, '窗口已裁决，无响应者')
  conservation(s, '胡优先于碰')
})

ok('响应顺序：两家都能碰，近家先决定——远家抢先提交被拒，近家碰成', () => {
  let s = twoClaimersForW7(22)
  // 当前响应者是较近的左家(3)；较远的我(0)抢先叫碰必须被拒绝
  let r = dispatch(s, { type: 'peng', seat: 0, actionId: aid('pri', 2), stateVersion: s.version })
  assert.ok(!r.ok, '非当前响应者（较远者）提交碰被拒绝')
  assert.equal(s.players[0].melds.length, 0, '被拒后不应给自己编入副露')
  r = dispatch(s, { type: 'peng', seat: 3, actionId: aid('pri', 3), stateVersion: s.version })
  assert.ok(r.ok, `碰失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[3].melds.length, 1, '离出牌者最近的左家碰成')
  assert.equal(s.players[3].melds[0].tile, W(7))
  assert.ok(!s.players[3].melds[0].wild, '左家用 2 张真牌碰，不带幺鸡')
  assert.equal(s.players[0].melds.length, 0, '较远者抢不走碰权')
  assert.equal(s.turn, 3, '碰者（左家）进入强制出牌回合')
  conservation(s, '响应顺序：近家先碰')
})

// ============================================================
// 7. 血战继续与流局查叫
// ============================================================
console.log('=== 流局查叫 ===')

ok('流局：查花猪 + 查大叫，delta 总和为 0', () => {
  let s = fastForward(13)
  // seat0 打 W9 后无人响应、墙空 → 流局
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      // seat0：纯筒听牌（T111 T234 T567 T888 + T9 单钓），打 W9 后仍听 T9
      0: { tiles: [T(1), T(1), T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), T(8), T(8), T(9)], void: 'tiao' },
      // seat1：花猪（void=tong 且手含筒）
      1: { tiles: [I(1), I(2), I(3), I(4), I(5), I(6), I(7), I(8), I(9), I(2), I(5), I(8), T(5)], void: 'tong' },
      // seat2：已打缺但未听（烂牌）
      2: { tiles: [W(1), W(4), W(7), I(1), I(4), I(7), W(2), W(5), W(8), I(2), I(5), I(8), I(3)], void: 'tong' },
      // seat3：听牌（I44 + W234 + W678 + I678 + W3W4 搭，听 W2/W5，不听 W9）
      3: { tiles: [I(4), I(4), W(2), W(3), W(3), W(4), W(4), W(6), W(7), W(8), I(6), I(7), I(8)], void: 'tong' }
    }
  })
  // 清空牌墙触发流局（此场景不校验守恒：墙牌被移除）
  s.wall = []
  const r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'f0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.equal(s.phase, 'finished', `应流局结束，实际 ${s.phase}`)
  const results = settlementOf(s)
  assert.ok(results.liuju)
  // 查花猪：seat1 赔 seat0/2/3 各 16（cap 4 → 2^4）
  const hz = s.ledger.filter(e => e.reason === 'cha-huazhu')
  assert.equal(hz.length, 3)
  assert.ok(hz.every(e => e.from === 1 && e.amount === 16))
  assert.deepEqual(hz.map(e => e.to).sort(), [0, 2, 3])
  // 查大叫：seat2（未听，13 张散牌 → 平胡 0 番，2^0 = 1 分底注）
  // 赔给听牌的 seat0/seat3 各 1，不再一律按封顶 16
  const dj = s.ledger.filter(e => e.reason === 'cha-dajiao')
  assert.equal(dj.length, 2)
  assert.ok(dj.every(e => e.from === 2 && e.amount === 1))
  assert.deepEqual(dj.map(e => e.to).sort(), [0, 3])
  const djItem = results.chaItems.find(c => c.type === 'dajiao')
  assert.ok(djItem, '结算应含查大叫条目')
  assert.equal(djItem.fan, 0, '散牌查大叫按平胡 0 番（1 倍）')
  assert.equal(djItem.amount, 1)
  // 总和为零
  const sum = s.players.reduce((a, p) => a + p.delta, 0)
  assert.equal(sum, 0, `delta 总和 ${sum} ≠ 0`)
  assert.equal(results.perSeat.reduce((a, p) => a + p.delta, 0), 0)
})

ok('流局退杠：未听牌者退还本局全部已收杠钱（明杠 + 暗杠，逐笔原路退回）', () => {
  let s = fastForward(41)
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      // seat0：纯筒听牌（缺条），打 W9
      0: { tiles: [T(1), T(1), T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), T(8), T(8), T(9)], void: 'tiao' },
      // seat1：持 3 张 W9 可明杠（无条，缺条）
      1: { tiles: [W(9), W(9), W(9), W(1), W(2), W(4), T(2), T(3), T(4), T(5), T(6), T(7), T(1)], void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'rg0', stateVersion: s.version })
  assert.ok(r.ok, `seat0 打 W9 失败: ${r.error}`)
  s = r.state
  r = dispatch(s, { type: 'gang', seat: 1, tile: W(9), gangType: 'ming', actionId: 'rg1', stateVersion: s.version })
  assert.ok(r.ok, `seat1 明杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.turn, 1, '明杠后由杠者摸牌')
  assert.equal(s.players[1].delta, 1, '明杠收放杠者 1 分')
  // 再补一个暗杠（累计两笔杠钱）；把牌墙清空，使杠后补牌直接流局
  s.players[1].hand = [W(1), W(1), W(1), W(1), W(4), W(7), I(1), I(4), I(7), W(2)]
  s.players[1].void = 'tong'
  s.drawnTile = null
  s.wall = []
  r = dispatch(s, { type: 'gang', seat: 1, tile: W(1), gangType: 'an', actionId: 'rg2', stateVersion: s.version })
  assert.ok(r.ok, `seat1 暗杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.phase, 'finished', `杠后补牌牌墙已空应流局，实际 ${s.phase}`)
  const results = settlementOf(s)
  assert.ok(results.liuju)
  // 已收杠钱：明杠 1 + 暗杠 3×2 = 7（seat1 缺筒无筒，未听牌）
  const income = s.ledger.filter(
    e => e.to === 1 && (e.reason === 'gang-an' || e.reason === 'gang-ming')
  )
  assert.equal(income.reduce((a, e) => a + e.amount, 0), 7)
  // 未听牌 → 逐笔原路退还
  const refund = s.ledger.filter(e => e.from === 1 && e.reason === 'gang-refund')
  assert.equal(refund.length, 4, '1 笔明杠 + 3 笔暗杠各退一笔')
  assert.equal(refund.reduce((a, e) => a + e.amount, 0), 7)
  assert.deepEqual(
    refund.map(e => e.to + ':' + e.amount).sort(),
    income.map(e => e.from + ':' + e.amount).sort(),
    '退杠应逐笔退还给原支付者'
  )
  const item = results.refundItems.find(c => c.seat === 1)
  assert.ok(item, '结算应含 seat1 退杠条目')
  assert.equal(item.type, 'tuigang')
  assert.equal(item.amount, 7)
  assert.equal(item.count, 4)
  // 听牌的 seat0 不退杠，且仍收 seat1 的查大叫
  assert.ok(!refund.some(e => e.from === 0), '听牌者不退杠')
  assert.ok(s.ledger.some(e => e.reason === 'cha-dajiao' && e.to === 0 && e.from === 1))
  // 零和：退杠用 transfer 记账，delta 总和仍为 0
  assert.equal(s.players.reduce((a, p) => a + p.delta, 0), 0)
})

ok('流局退杠：已听牌者不收退杠，杠钱照收', () => {
  let s = fastForward(42)
  setupTable(s, {
    turn: 2,
    specs: {
      // seat0：3 张 W9 + 纯筒听牌手牌（明杠后剩 10 张，听 T9）
      0: {
        tiles: [W(9), W(9), W(9), T(1), T(1), T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(9)],
        void: 'tiao'
      },
      // seat1/seat3：默认补牌里没有 W9 对子 → 不响应，隔离被测交互
      // seat2：出牌者（无筒），打 W9 给 seat0 明杠
      2: { tiles: [W(1), W(2), W(4), W(6), W(7), W(9), I(1), I(2), I(3), I(4), I(5), I(7), I(8)], void: 'tong' }
    }
  })
  // 牌墙清空：明杠补牌时直接流局（seat0 不再出牌，保持听牌）
  s.wall = []
  let r = dispatch(s, { type: 'discard', seat: 2, tile: W(9), actionId: 'rk0', stateVersion: s.version })
  assert.ok(r.ok, `seat2 打 W9 失败: ${r.error}`)
  s = r.state
  r = dispatch(s, { type: 'gang', seat: 0, tile: W(9), gangType: 'ming', actionId: 'rk1', stateVersion: s.version })
  assert.ok(r.ok, `seat0 明杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.phase, 'finished', `杠后补牌牌墙已空应流局，实际 ${s.phase}`)
  const results = settlementOf(s)
  assert.ok(results.liuju)
  const gangIn = s.ledger.filter(e => e.to === 0 && e.reason === 'gang-ming')
  assert.equal(gangIn.length, 1)
  assert.equal(gangIn[0].from, 2)
  // seat0 已听牌（10 张：T111 T234 T567 + T9 单钓）→ 不退杠
  assert.equal(s.ledger.filter(e => e.reason === 'gang-refund').length, 0, '听牌者不应退杠')
  assert.equal(results.refundItems.length, 0)
  assert.ok(!s.ledger.some(e => e.reason === 'cha-dajiao' && e.from === 0), '听牌者不赔查大叫')
  assert.equal(s.players.reduce((a, p) => a + p.delta, 0), 0)
})

ok('三人胡满立即结束（不做一炮多响：多家胡须跨回合逐个累计）', () => {
  let s = fastForward(14)
  // seat0 打 W9 → 只有 seat1 有胡权（seat2/seat3 听条，不能胡/碰 W9）；
  // 其余两家在后续回合自摸成胡，凑满三人即结束（一炮三响已按新规则取消）。
  const tingW9 = pair => [pair, pair, W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(5), T(6), T(7)]
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), I(2), I(3), I(4), I(5), I(6)], void: 'wan' },
      1: { tiles: tingW9(T(4)), void: 'tiao' },
      2: { tiles: [I(1), I(2), I(3), I(4), I(5), I(6), I(7), I(8), I(9), T(1), T(2), T(3), I(9)], void: 'wan' },
      3: { tiles: [I(1), I(2), I(3), I(4), I(5), I(6), I(7), I(8), I(9), T(4), T(5), T(6), I(1)], void: 'wan' }
    }
  })
  // 把 seat2 / seat3 的自摸张排到墙头，保证两家依次自摸成胡
  const bringFront = (arr, t) => { const i = arr.indexOf(t); if (i > 0) { arr.splice(i, 1); arr.unshift(t) } }
  bringFront(s.wall, I(1))
  bringFront(s.wall, I(9))
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 't0', stateVersion: s.version })
  assert.ok(r.ok, `seat0 打 W9 失败: ${r.error}`)
  s = r.state
  assert.deepEqual(s.waiting, [1], '只有 seat1 能胡 W9（不做一炮多响）')
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 't1', stateVersion: s.version })
  assert.ok(r.ok, `seat1 胡失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[1].hu.how, 'dianpao')
  // 第 2 家：seat2 自摸成胡
  assert.equal(s.turn, 2, '胡后由 seat2 摸牌')
  assert.equal(s.drawnTile, I(9), '墙头已排好 seat2 的自摸张')
  r = dispatch(s, { type: 'hu', seat: 2, actionId: 't2', stateVersion: s.version })
  assert.ok(r.ok, `seat2 胡失败: ${r.error}`)
  s = r.state
  assert.equal(s.phase, 'discard', '两人胡未满，继续血战')
  // 第 3 家：seat3 自摸成胡 → 三人胡满立即结束
  assert.equal(s.turn, 3, '胡后由 seat3 摸牌')
  r = dispatch(s, { type: 'hu', seat: 3, actionId: 't3', stateVersion: s.version })
  assert.ok(r.ok, `seat3 胡失败: ${r.error}`)
  s = r.state
  assert.equal(s.phase, 'finished', '三人胡满应立即结束')
  const results = settlementOf(s)
  assert.equal(results.huOrder.length, 3)
  assert.equal(results.liuju, false)
  assert.equal(results.perSeat.reduce((a, p) => a + p.delta, 0), 0)
  conservation(s, '三人胡后')
})

ok('结算牌面：暴露各家终局手牌 + 副露（点炮胡的牌张用 hu.winTile 补全即可复原胡牌型）', () => {
  // endWhenHuPlayers=1：单家胡牌即结束，便于直接检视结算牌面（不做一炮多响）
  let s = fastForward(14, undefined, { endWhenHuPlayers: 1 })
  const tingW9 = pair => [pair, pair, W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(5), T(6), T(7)]
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), I(2), I(3), I(4), I(5), I(6)], void: 'wan' },
      1: { tiles: tingW9(T(4)), void: 'tiao' },
      2: { tiles: tingW9(T(1)), void: 'tiao' },
      3: { tiles: tingW9(T(8)), void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'fs0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  // HU 阶段并行收集：seat1/seat2/seat3 同时拥有胡权，全部表态后才一次性结算。
  // 本用例设 endWhenHuPlayers=1，只让 seat1 胡、seat2/seat3 过，便于直接检视结算牌面。
  assert.equal(s.respondStage, 'hu', 'HU 阶段并行收集')
  assert.equal(s.currentResponder, null, 'HU 阶段没有唯一响应者')
  assert.deepEqual(s.huWait, [1, 2, 3], '三家同时拥有胡权')
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'fs1', stateVersion: s.version })
  assert.ok(r.ok, `seat1 胡失败: ${r.error}`)
  assert.equal(r.state.players[1].hu, null, '未全部表态前不结算')
  r = dispatch(r.state, { type: 'pass', seat: 2, actionId: 'fs2', stateVersion: r.state.version })
  assert.ok(r.ok, `seat2 过失败: ${r.error}`)
  r = dispatch(r.state, { type: 'pass', seat: 3, actionId: 'fs3', stateVersion: r.state.version })
  assert.ok(r.ok, `seat3 过失败: ${r.error}`)
  s = r.state
  const results = settlementOf(s)
  assert.equal(results.seats.length, 4, '结算应给出 4 家终局牌面')
  results.seats.forEach(ps => {
    assert.ok(Array.isArray(ps.hand) && Array.isArray(ps.melds), '每家应含 hand/melds')
    assert.equal(typeof ps.ting, 'boolean', '未胡者应给出听牌判定')
  })
  // 点炮胡：hand 里不含胡牌张（那张牌在点炮者弃牌区），hand + winTile 必须能复原胡牌型，
  // 结算页正是照此把「胡」那张牌补在牌面末尾，供用户核对番型算得对不对。
  for (const hh of results.huOrder) {
    const ps = results.seats.find(x => x.seat === hh.seat)
    assert.equal(ps.hu.how, hh.how)
    assert.ok(ps.hu.winTile != null)
    const full = [...ps.hand, hh.winTile].sort((a, b) => a - b)
    assert.equal(
      isWinHand(full, ps.melds.length),
      true,
      `seat${hh.seat} 牌面 + 胡牌张应成胡，实际 ${full.map(tileName).join(' ')}`
    )
  }
  // 未胡的 seat0 不是胡牌者，牌面照实展示
  assert.equal(results.seats[0].hu, null)
})

ok('胡满结束不退杠：已收杠钱照收（区别于流局）', () => {
  // endWhenHuPlayers=1：单家胡牌即胡满结束（不做一炮多响）
  let s = fastForward(15, undefined, { endWhenHuPlayers: 1 })
  // seat0 先暗杠 W5，收 3×2 = 6 分
  setupTable(s, {
    turn: 0,
    drawnTile: W(5),
    specs: {
      0: { tiles: [W(5), W(5), W(5), W(1), W(2), W(3), W(7), W(8), W(9), I(1), I(4), I(7), I(2)], void: 'tong' }
    }
  })
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'an', actionId: 'rh0', stateVersion: s.version })
  assert.ok(r.ok, `暗杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[0].delta, 6)
  // 再构造 seat1 点炮胡 W9 → 立即胡满结束
  const tingW9 = pair => [pair, pair, W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(5), T(6), T(7)]
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(5), T(6), T(7), T(8), I(2), I(3), I(4), I(5), I(6)], void: 'wan' },
      1: { tiles: tingW9(T(4)), void: 'tiao' }
    }
  })
  r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'rh1', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'rh2', stateVersion: s.version })
  assert.ok(r.ok, `seat1 胡失败: ${r.error}`)
  s = r.state
  assert.equal(s.phase, 'finished')
  const results = settlementOf(s)
  assert.equal(results.liuju, false, '胡满结束，非流局')
  // 胡满结束不走退杠：杠钱已落袋
  assert.equal(s.ledger.filter(e => e.reason === 'gang-refund').length, 0, '胡满结束不退杠')
  assert.equal(results.refundItems.length, 0)
  assert.equal(s.ledger.filter(e => e.to === 0 && e.reason === 'gang-an').length, 3)
  assert.equal(s.ledger.filter(e => e.reason === 'gang-an').reduce((a, e) => a + e.amount, 0), 6)
  assert.equal(results.perSeat.reduce((a, p) => a + p.delta, 0), 0)
})

// ============================================================
// 8. 幺鸡赖子（万能牌 / 补位碰杠 / 换牌 / 杠价 / 转雨 / 喜钱 / 加番）
// ============================================================
console.log('=== 幺鸡赖子 ===')

ok('rules：幺鸡当万能牌可补顺子位置完成胡牌（仅幺鸡局）', () => {
  // 幺鸡(I(1))当 W(1)：W123 + W456 + T234 + I567 + 雀头 T99
  const hand = [YAOJI_TILE, W(2), W(3), W(4), W(5), W(6), T(2), T(3), T(4), I(5), I(6), I(7), T(9), T(9)]
  assert.equal(isWinHand(hand, 0, { yaoji: true }), true, '幺鸡局应可用幺鸡补位成胡')
  assert.equal(isWinHand(hand, 0), false, '非幺鸡局不认万能')
})

ok('rules：整手不含幺鸡额外 +1 番（不带幺鸡 2 倍，带幺鸡 1 倍）', () => {
  const noYaoji = [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), T(1), T(2), T(3), I(2), I(2)]
  const f1 = finalFan(noYaoji, [], { yaoji: true, capFan: 6 })
  assert.equal(f1.fan, 1, '平胡 0 + 不带幺鸡 1 = 1 番（2 倍）')
  assert.ok(f1.names.includes('不带幺鸡'))
  const withYaoji = [YAOJI_TILE, W(2), W(3), W(4), W(5), W(6), T(2), T(3), T(4), I(5), I(6), I(7), T(9), T(9)]
  const f2 = finalFan(withYaoji, [], { yaoji: true, capFan: 6 })
  assert.equal(f2.fan, 0, '带幺鸡平胡 0 番（1 倍）')
  assert.ok(!f2.names.includes('不带幺鸡'))
})

ok('幺鸡赖子：1 张真牌 + 1 只幺鸡可碰（副露 wild=1）', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(6), T(8), T(9), I(2), I(3), I(6), I(8), I(9), I(4)], void: 'wan' },
      1: { tiles: [W(9), YAOJI_TILE, W(1), W(2), W(4), W(5), T(1), T(2), T(3), T(4), T(5), T(6), T(7)], void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'yj-p0', stateVersion: s.version })
  assert.ok(r.ok, `seat0 打 W9 失败: ${r.error}`)
  s = r.state
  assert.deepEqual(s.waiting, [1])
  const legal = legalActions(s, 1)
  assert.ok(legal.find(o => o.type === 'peng'), '1 真牌 + 1 幺鸡应可碰')
  r = dispatch(s, { type: 'peng', seat: 1, actionId: 'yj-p1', stateVersion: s.version })
  assert.ok(r.ok, `碰失败: ${r.error}`)
  s = r.state
  const p1 = s.players[1]
  assert.equal(p1.melds[0].kind, 'peng')
  assert.equal(p1.melds[0].tile, W(9))
  assert.equal(p1.melds[0].wild, 1, '碰副露应用 1 只幺鸡补位')
  assert.equal(p1.hand.filter(t => t === W(9)).length, 0)
  assert.equal(p1.hand.filter(t => t === YAOJI_TILE).length, 0, '幺鸡已编入副露')
  conservation(s, '幺鸡碰后')
})

ok('幺鸡赖子：2 张真牌 + 1 只幺鸡可明杠，点杠 1 分（不带幺鸡 2 分）', () => {
  // 带幺鸡
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(6), T(8), T(9), I(2), I(3), I(6), I(8), I(9), I(4)], void: 'wan' },
      1: { tiles: [W(9), W(9), YAOJI_TILE, W(1), W(2), W(4), T(1), T(2), T(3), T(4), T(5), T(6), T(7)], void: 'tiao' }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'yj-g0', stateVersion: s.version })
  assert.ok(r.ok)
  s = r.state
  assert.ok(legalActions(s, 1).find(o => o.type === 'gang'), '2 真牌 + 1 幺鸡应可明杠')
  r = dispatch(s, { type: 'gang', seat: 1, tile: W(9), gangType: 'ming', actionId: 'yj-g1', stateVersion: s.version })
  assert.ok(r.ok, `明杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[1].melds[0].wild, 1)
  assert.equal(s.players[1].delta, 1, '带幺鸡点杠：放杠者付 1 分')
  conservation(s, '幺鸡明杠后')

  // 不带幺鸡：3 张真牌，点杠翻倍 2 分
  let t = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(t, {
    turn: 0,
    drawnTile: W(9),
    specs: {
      0: { tiles: [T(1), T(2), T(3), T(4), T(6), T(8), T(9), I(2), I(3), I(6), I(8), I(9), I(4)], void: 'wan' },
      1: { tiles: [W(9), W(9), W(9), W(1), W(2), W(4), T(1), T(2), T(3), T(4), T(5), T(6), T(7)], void: 'tiao' }
    }
  })
  r = dispatch(t, { type: 'discard', seat: 0, tile: W(9), actionId: 'yj-g2', stateVersion: t.version })
  assert.ok(r.ok)
  t = r.state
  r = dispatch(t, { type: 'gang', seat: 1, tile: W(9), gangType: 'ming', actionId: 'yj-g3', stateVersion: t.version })
  assert.ok(r.ok, `明杠失败: ${r.error}`)
  t = r.state
  assert.ok(!t.players[1].melds[0].wild, '纯真牌杠无 wild')
  assert.equal(t.players[1].delta, 2, '不带幺鸡点杠翻倍：2 分')
})

ok('幺鸡赖子：3 张真牌 + 1 只幺鸡可暗杠，每家 2 分（不带幺鸡每家 4 分）', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(5), W(5), YAOJI_TILE, W(1), W(2), W(3), W(4), W(4), W(6), W(7), W(8), W(9)],
        void: 'tong'
      }
    }
  })
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'an', actionId: 'yj-a0', stateVersion: s.version })
  assert.ok(r.ok, `暗杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[0].melds[0].wild, 1)
  assert.equal(s.players[0].delta, 6, '带幺鸡暗杠：每家 2 分 × 3')

  let t = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(t, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(5), W(5), W(5), W(1), W(2), W(3), W(4), W(6), W(7), W(8), W(9), W(1)],
        void: 'tong'
      }
    }
  })
  r = dispatch(t, { type: 'gang', seat: 0, tile: W(5), gangType: 'an', actionId: 'yj-a1', stateVersion: t.version })
  assert.ok(r.ok, `暗杠失败: ${r.error}`)
  t = r.state
  assert.equal(t.players[0].delta, 12, '不带幺鸡暗杠翻倍：每家 4 分 × 3')
})

ok('幺鸡赖子：补杠带幺鸡每家 1 分、不带幺鸡每家 2 分', () => {
  // 带幺鸡的碰（2 真 + 1 幺鸡）→ 补杠：每家 1
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(1), W(2), W(3), W(7), W(8), W(9), T(1), T(2), T(3)],
        melds: [{ kind: 'peng', tile: W(5), from: 2, wild: 1 }],
        void: 'tiao'
      }
    }
  })
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'bu', actionId: 'yj-b0', stateVersion: s.version })
  assert.ok(r.ok, `补杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[0].melds[0].gangType, 'bu')
  assert.equal(s.players[0].delta, 3, '带幺鸡补杠：每家 1 分 × 3')

  // 不带幺鸡的碰（3 真）→ 补杠：每家 2
  let t = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(t, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(1), W(2), W(3), W(7), W(8), W(9), T(1), T(2), T(3)],
        melds: [{ kind: 'peng', tile: W(5), from: 2 }],
        void: 'tiao'
      }
    }
  })
  r = dispatch(t, { type: 'gang', seat: 0, tile: W(5), gangType: 'bu', actionId: 'yj-b1', stateVersion: t.version })
  assert.ok(r.ok, `补杠失败: ${r.error}`)
  t = r.state
  assert.equal(t.players[0].delta, 6, '不带幺鸡补杠翻倍：每家 2 分 × 3')
})

ok('幺鸡赖子：带幺鸡的杠可换回幺鸡；碰带幺鸡不可换', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(1), W(2), W(3), W(7), W(8), W(9), T(1), T(2), T(3)],
        melds: [{ kind: 'gang', gangType: 'ming', tile: W(5), from: 2, wild: 1 }],
        void: 'tong'
      }
    }
  })
  const legal = legalActions(s, 0)
  const swap = legal.find(o => o.type === 'swap-yaoji')
  assert.ok(swap && swap.tile === W(5), '杠带幺鸡且手里有真牌 → 应提供换幺鸡')
  let r = dispatch(s, { type: 'swap-yaoji', seat: 0, tile: W(5), actionId: 'yj-s0', stateVersion: s.version })
  assert.ok(r.ok, `换幺鸡失败: ${r.error}`)
  s = r.state
  const p0 = s.players[0]
  assert.ok(!p0.melds[0].wild, '换牌后副露不再含幺鸡')
  assert.equal(p0.hand.filter(t => t === YAOJI_TILE).length, 1, '幺鸡回到手牌')
  assert.equal(p0.hand.filter(t => t === W(5)).length, 0, '真牌编入副露')
  conservation(s, '换幺鸡后')

  // 碰带幺鸡：不可换
  let t = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(t, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(1), W(2), W(3), W(7), W(8), W(9), T(1), T(2), T(3)],
        melds: [{ kind: 'peng', tile: W(5), from: 2, wild: 1 }],
        void: 'tong'
      }
    }
  })
  assert.equal(legalActions(t, 0).find(o => o.type === 'swap-yaoji'), undefined, '碰带幺鸡不可换')
})

ok('幺鸡赖子：真牌碰后用幺鸡补杠，之后摸到第 4 张真牌可换回幺鸡', () => {
  // 用户场景：先用 3 张真 W5 碰（副露不含幺鸡），再用手里唯一的幺鸡补杠（第 4 张），
  // 之后摸到第 4 张真 W5 → 应可把幺鸡换回手牌（幺鸡来自补杠，不是碰）
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [YAOJI_TILE, W(1), W(2), W(3), W(7), W(8), W(9), T(1), T(2), T(3)],
        melds: [{ kind: 'peng', tile: W(5), from: 1 }],
        void: 'tiao'
      }
    }
  })
  const buOpt = legalActions(s, 0)
    .filter(o => o.type === 'gang')
    .flatMap(o => o.options)
    .find(o => o.tile === W(5) && o.gangType === 'bu')
  assert.ok(buOpt, '手里有幺鸡、无真 W5 时，应可用幺鸡补杠')
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'bu', actionId: 'yj-bu-g', stateVersion: s.version })
  assert.ok(r.ok, `幺鸡补杠失败: ${r.error}`)
  s = r.state
  let p0 = s.players[0]
  assert.equal(p0.melds[0].kind, 'gang')
  assert.equal(p0.melds[0].gangType, 'bu')
  assert.equal(p0.melds[0].wild, 1, '补杠用 1 只幺鸡补位')
  assert.ok(!(p0.melds[0].wildPeng > 0), '幺鸡来自补杠而非碰，不应标记 wildPeng')
  assert.equal(p0.hand.filter(t => t === YAOJI_TILE).length, 0, '幺鸡已编入副露')
  conservation(s, '真牌碰 + 幺鸡补杠后')

  // 之后摸到第 4 张真 W5 → 可换回幺鸡
  drawTile(s, W(5))
  const swap = legalActions(s, 0).find(o => o.type === 'swap-yaoji')
  assert.ok(swap && swap.tile === W(5), '摸到第 4 张真牌后应提供换幺鸡')
  r = dispatch(s, { type: 'swap-yaoji', seat: 0, tile: W(5), actionId: 'yj-bu-s', stateVersion: s.version })
  assert.ok(r.ok, `换幺鸡失败: ${r.error}`)
  s = r.state
  p0 = s.players[0]
  assert.ok(!p0.melds[0].wild, '换牌后副露为 4 张真牌')
  assert.equal(s.drawnTile, YAOJI_TILE, '幺鸡回到「刚摸到」的牌位')
  conservation(s, '补杠换回幺鸡后')
})

ok('幺鸡赖子：暗杠与补杠同屏时合并成一条 gang（不拆成两条，否则补杠被判非法）', () => {
  // 复现线上反馈：碰赖 5万 后摸到真 5万，手里又刚好有 4 张别的牌可暗杠。
  // legal 必须是一条 gang 带两个 options——服务端 matchesLegalOption 用 find 取第一条，
  // 拆成两条会让「补杠」被服务端判成不合法（引擎自己 dispatch 是放行的）。
  const s = fastForward(11, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    drawnTile: W(5),
    specs: {
      0: {
        tiles: [W(3), W(3), W(3), W(3), W(5), W(7), I(1), I(2), I(3), I(5)],
        melds: [{ kind: 'peng', tile: W(5), from: 1, wild: 1, wildPeng: 1 }],
        void: 'tong'
      }
    }
  })
  const legal = legalActions(s, 0)
  const gangEntries = legal.filter(o => o.type === 'gang')
  assert.equal(gangEntries.length, 1, '暗杠/补杠必须合并成一条 gang 选项')
  assert.ok(gangEntries[0].options.some(o => o.tile === W(3) && o.gangType === 'an'), '含暗杠 3万')
  assert.ok(gangEntries[0].options.some(o => o.tile === W(5) && o.gangType === 'bu'), '含补杠 5万')
  // 两个候选都要能真正执行（哪个按钮点下去都不该被拒）
  const rb = dispatch(s, {
    type: 'gang', seat: 0, tile: W(5), gangType: 'bu',
    actionId: 'sg-bu', stateVersion: s.version
  })
  assert.ok(rb.ok, `补杠应可执行: ${rb.error}`)
  conservation(rb.state, '暗杠补杠同屏-补杠')
  const ra = dispatch(s, {
    type: 'gang', seat: 0, tile: W(3), gangType: 'an',
    actionId: 'sg-an', stateVersion: s.version
  })
  assert.ok(ra.ok, `暗杠应可执行: ${ra.error}`)
  conservation(ra.state, '暗杠补杠同屏-暗杠')
})

ok('幺鸡赖子：碰赖升级成的杠不可换（幺鸡是碰那一步进来的）', () => {
  // 用户给的例外：2 真 W5 + 1 幺鸡碰（碰赖）→ 摸到真 W5 补杠成杠 → 又来 W5 也不能换
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(1), W(2), W(3), W(7), W(8), W(9), T(1), T(2), T(3)],
        melds: [{ kind: 'peng', tile: W(5), from: 1, wild: 1, wildPeng: 1 }],
        void: 'tiao'
      }
    }
  })
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'bu', actionId: 'yj-bu2-g', stateVersion: s.version })
  assert.ok(r.ok, `补杠失败: ${r.error}`)
  s = r.state
  const p0 = s.players[0]
  assert.equal(p0.melds[0].kind, 'gang')
  assert.equal(p0.melds[0].gangType, 'bu')
  assert.equal(p0.melds[0].wild, 1, '3 真 + 1 赖')
  assert.equal(p0.melds[0].wildPeng, 1, '幺鸡来自碰，标记应保留')
  conservation(s, '碰赖升级补杠后')

  // 摸到第 4 张真牌也不可换
  drawTile(s, W(5))
  assert.equal(
    legalActions(s, 0).find(o => o.type === 'swap-yaoji'),
    undefined,
    '碰赖升级成的杠不可换回幺鸡'
  )
  conservation(s, '碰赖升级杠后摸真牌')
})

ok('幺鸡赖子：明杠用幺鸡补位，之后摸到同一张真牌可换回幺鸡（完整杠牌流程）', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  // seat1 定缺万，摸到 W5 只能打它；seat0 手里 W5×2 + 幺鸡，可带幺鸡明杠
  setupTable(s, {
    turn: 1,
    drawnTile: W(5),
    specs: {
      0: {
        tiles: [W(5), W(5), YAOJI_TILE, W(1), W(2), W(3), W(4), W(7), W(8), W(9), I(4), I(5), I(6)],
        void: 'tong'
      },
      1: {
        tiles: [T(3), T(4), T(5), T(6), T(7), T(8), T(9), I(2), I(3), I(4), I(5), I(6), I(7)],
        void: 'wan'
      }
    }
  })
  let r = dispatch(s, { type: 'discard', seat: 1, tile: W(5), actionId: 'yj-ming-d', stateVersion: s.version })
  assert.ok(r.ok, `出牌失败: ${r.error}`)
  s = r.state
  assert.deepEqual(s.waiting, [0], '只有 seat0 能响应')
  // 此手牌带幺鸡可成胡（幺鸡当 W6）→ 胡阶段先只给「胡 / 过」，必须先过胡才轮到碰/杠
  assert.equal(s.respondStage, 'hu', '胡优先于碰/杠')
  assert.deepEqual(legalActions(s, 0).map(o => o.type), ['hu', 'pass'], '胡阶段只有胡 / 过')
  let rp = dispatch(s, { type: 'pass', seat: 0, actionId: 'yj-ming-pass', stateVersion: s.version })
  assert.ok(rp.ok, `过胡失败: ${rp.error}`)
  s = rp.state
  assert.equal(s.respondStage, 'gang', '过胡后先进入 GANG 阶段（杠优先于碰）')
  const gangOpt = legalActions(s, 0).find(o => o.type === 'gang')
  assert.ok(
    gangOpt && gangOpt.options.some(g => g.tile === W(5) && g.gangType === 'ming'),
    '应提供带幺鸡的明杠'
  )
  r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'ming', actionId: 'yj-ming-g', stateVersion: s.version })
  assert.ok(r.ok, `明杠失败: ${r.error}`)
  s = r.state
  let p0 = s.players[0]
  assert.equal(p0.melds[0].kind, 'gang')
  assert.equal(p0.melds[0].gangType, 'ming')
  assert.equal(p0.melds[0].wild, 1, '副露应记录 1 只幺鸡补位')
  assert.equal(p0.hand.filter(t => t === W(5)).length, 0, '两张真牌已编入副露')
  assert.equal(p0.hand.filter(t => t === YAOJI_TILE).length, 0, '幺鸡已编入副露')
  // 带幺鸡明杠按基准价 1 分，由放杠者（出牌者）付
  assert.equal(s.players[1].delta, -1)
  assert.equal(p0.delta, 1)
  conservation(s, '带幺鸡明杠后')

  // 之后摸到第 4 张真牌 → 可把副露里的幺鸡换回手牌
  drawTile(s, W(5))
  const swap = legalActions(s, 0).find(o => o.type === 'swap-yaoji')
  assert.ok(swap && swap.tile === W(5), '摸到同一张真牌后应提供换幺鸡')
  r = dispatch(s, { type: 'swap-yaoji', seat: 0, tile: W(5), actionId: 'yj-ming-s', stateVersion: s.version })
  assert.ok(r.ok, `换幺鸡失败: ${r.error}`)
  s = r.state
  p0 = s.players[0]
  assert.ok(!p0.melds[0].wild, '换牌后副露不再带幺鸡（4 张全是真牌）')
  assert.equal(s.drawnTile, YAOJI_TILE, '幺鸡回到「刚摸到」的牌位')
  assert.equal(p0.hand.filter(t => t === W(5)).length, 0, '真牌编入副露')
  assert.equal(p0.hand.filter(t => t === YAOJI_TILE).length, 0, '手牌里原本没有幺鸡')
  assert.equal(legalActions(s, 0).find(o => o.type === 'swap-yaoji'), undefined, '换完后不再提供换幺鸡')
  conservation(s, '明杠换回幺鸡后')
})

ok('幺鸡赖子：暗杠用幺鸡补位，之后摸到同一张真牌可换回幺鸡', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  // seat0 手里 W5×3 + 1 只幺鸡 → 可暗杠（补位幺鸡记入副露）
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(5), W(5), YAOJI_TILE, W(1), W(2), W(3), W(4), W(6), W(7), W(8), W(9), I(4), I(5)],
        void: 'tong'
      }
    }
  })
  // 摆成常规回合：13 张手牌 + 1 张刚摸到（把 W6 挪到摸牌位，牌数守恒）
  const me = s.players[0]
  me.hand.splice(me.hand.indexOf(W(6)), 1)
  s.drawnTile = W(6)
  const anOpt = legalActions(s, 0).find(o => o.type === 'gang')
  assert.ok(
    anOpt && anOpt.options.some(g => g.tile === W(5) && g.gangType === 'an'),
    '应提供带幺鸡的暗杠'
  )
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'an', actionId: 'yj-an-g', stateVersion: s.version })
  assert.ok(r.ok, `暗杠失败: ${r.error}`)
  s = r.state
  let p0 = s.players[0]
  assert.equal(p0.melds[0].kind, 'gang')
  assert.equal(p0.melds[0].gangType, 'an')
  assert.equal(p0.melds[0].wild, 1, '副露应记录 1 只幺鸡补位')
  assert.equal(p0.hand.filter(t => t === W(5)).length, 0, '三张真牌已编入副露')
  assert.equal(p0.hand.filter(t => t === YAOJI_TILE).length, 0, '幺鸡已编入副露')
  // 带幺鸡暗杠按基准价 2 分，每位活跃未胡玩家各付
  assert.equal(p0.delta, 6)
  conservation(s, '带幺鸡暗杠后')

  // 之后摸到第 4 张真牌 → 换回幺鸡
  drawTile(s, W(5))
  assert.ok(
    legalActions(s, 0).find(o => o.type === 'swap-yaoji' && o.tile === W(5)),
    '摸到同一张真牌后应提供换幺鸡'
  )
  r = dispatch(s, { type: 'swap-yaoji', seat: 0, tile: W(5), actionId: 'yj-an-s', stateVersion: s.version })
  assert.ok(r.ok, `换幺鸡失败: ${r.error}`)
  s = r.state
  p0 = s.players[0]
  assert.ok(!p0.melds[0].wild, '换牌后副露不再带幺鸡')
  assert.equal(s.drawnTile, YAOJI_TILE, '幺鸡回到「刚摸到」的牌位')
  conservation(s, '暗杠换回幺鸡后')
})

ok('幺鸡赖子：杠上炮转雨——本回合收到的杠钱转给胡牌者', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  // seat0 暗杠 W5（3 真 + 1 幺鸡）收 6 分 → 杠后补牌 → 打 W9 被 seat1 胡（杠上炮）
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [W(5), W(5), W(5), YAOJI_TILE, W(9), W(1), W(2), W(3), W(7), W(8), W(4), W(6), W(2)],
        void: 'tong'
      },
      1: {
        tiles: [T(4), T(4), W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(5), T(6), T(7)],
        void: 'tiao'
      }
    }
  })
  // 保证墙尾有牌可补（不清空，避免直接流局）
  let r = dispatch(s, { type: 'gang', seat: 0, tile: W(5), gangType: 'an', actionId: 'yj-t0', stateVersion: s.version })
  assert.ok(r.ok, `暗杠失败: ${r.error}`)
  s = r.state
  assert.equal(s.players[0].delta, 6, '暗杠先收 6 分')
  assert.equal(s.afterGangDraw, true, '杠后补牌回合')
  r = dispatch(s, { type: 'discard', seat: 0, tile: W(9), actionId: 'yj-t1', stateVersion: s.version })
  assert.ok(r.ok, `杠后打 W9 失败: ${r.error}`)
  s = r.state
  r = dispatch(s, { type: 'hu', seat: 1, actionId: 'yj-t2', stateVersion: s.version })
  assert.ok(r.ok, `seat1 胡失败: ${r.error}`)
  s = r.state
  const hu = s.players[1].hu
  assert.equal(hu.how, 'dianpao')
  assert.ok(hu.names.includes('杠上炮'), `应含杠上炮：${hu.names}`)
  // 转雨：seat0 的 6 分杠钱转给 seat1
  const zhuan = s.ledger.filter(e => e.reason === 'gang-zhuan-yu')
  assert.equal(zhuan.length, 3, '暗杠 3 笔杠钱逐笔转雨')
  assert.ok(zhuan.every(e => e.from === 0 && e.to === 1))
  assert.equal(zhuan.reduce((a, e) => a + e.amount, 0), 6)
  // hu.scoreDelta = 点炮赔付 + 转来的杠钱；seat0 暗杠先收 6、付点炮、再把 6 分转出
  const dianpaoPaid = hu.scoreDelta - 6
  assert.equal(s.players[0].delta, 6 - dianpaoPaid - 6, 'seat0 杠钱被转走，另付点炮分')
  assert.equal(s.players[1].delta, hu.scoreDelta - 2, 'seat1 收胡牌分 + 转雨，扣掉暗杠支出 2')
  assert.equal(s.players.reduce((a, p) => a + p.delta, 0), 0, '转雨前后零和守恒')
})

ok('幺鸡喜钱：结算时手上 3 只幺鸡每家给 4 分', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [YAOJI_TILE, YAOJI_TILE, YAOJI_TILE, W(1), W(2), W(4), W(7), T(1), T(2), T(4), T(7), I(5), I(8)],
        void: 'tong'
      }
    }
  })
  s.wall = [] // 清空牌墙触发流局（此场景不校验守恒：墙牌被移除）
  const r = dispatch(s, { type: 'discard', seat: 0, tile: T(1), actionId: 'yj-x0', stateVersion: s.version })
  assert.ok(r.ok, `出牌失败: ${r.error}`)
  s = r.state
  assert.equal(s.phase, 'finished')
  const results = settlementOf(s)
  const item = results.xiItems.find(c => c.seat === 0)
  assert.ok(item, '结算应含 seat0 喜钱条目')
  assert.equal(item.count, 3)
  assert.equal(item.amount, 4)
  assert.equal(item.total, 12)
  const xi = s.ledger.filter(e => e.reason === 'yaoji-xi')
  assert.equal(xi.length, 3)
  assert.ok(xi.every(e => e.to === 0 && e.amount === 4))
  assert.deepEqual(xi.map(e => e.from).sort(), [1, 2, 3])
  assert.equal(s.players.reduce((a, p) => a + p.delta, 0), 0)
})

ok('幺鸡喜钱：手上 4 只幺鸡每家给 8 分', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        tiles: [YAOJI_TILE, YAOJI_TILE, YAOJI_TILE, YAOJI_TILE, W(1), W(2), W(4), T(1), T(2), T(4), T(7), I(5), I(8)],
        void: 'tong'
      }
    }
  })
  s.wall = []
  const r = dispatch(s, { type: 'discard', seat: 0, tile: T(1), actionId: 'yj-x1', stateVersion: s.version })
  assert.ok(r.ok, `出牌失败: ${r.error}`)
  s = r.state
  const item = settlementOf(s).xiItems.find(c => c.seat === 0)
  assert.ok(item)
  assert.equal(item.count, 4)
  assert.equal(item.amount, 8)
  assert.equal(item.total, 24)
  assert.equal(s.players.reduce((a, p) => a + p.delta, 0), 0)
})

ok('幺鸡喜钱：副露里的幺鸡也计入（含被抢杠后留在副露补位的）', () => {
  let s = fastForward(7, undefined, { yaojiEnabled: true })
  // seat0：碰 W5 用 1 只幺鸡补位（wild=1），手里再留 2 只幺鸡 → 名下共 3 只
  setupTable(s, {
    turn: 0,
    specs: {
      0: {
        melds: [{ kind: 'peng', tile: W(5), from: 2, wild: 1 }],
        tiles: [YAOJI_TILE, YAOJI_TILE, W(1), W(2), W(4), T(1), T(2), T(4), T(7), I(5)],
        void: 'tong'
      }
    }
  })
  s.wall = [] // 清空牌墙触发流局（此场景不校验守恒：墙牌被移除）
  const r = dispatch(s, { type: 'discard', seat: 0, tile: T(1), actionId: 'yj-x2', stateVersion: s.version })
  assert.ok(r.ok, `出牌失败: ${r.error}`)
  s = r.state
  assert.equal(s.phase, 'finished')
  const item = settlementOf(s).xiItems.find(c => c.seat === 0)
  assert.ok(item, '手牌 2 只 + 副露 1 只 = 3 只，应有喜钱')
  assert.equal(item.count, 3, '副露里的幺鸡也算在名下')
  assert.equal(item.amount, 4)
  assert.equal(item.total, 12)
  assert.equal(s.players.reduce((a, p) => a + p.delta, 0), 0)
})

ok('幺鸡局：定缺条门时幺鸡不算缺门牌（可留作赖子）', () => {
  const s = fastForward(7, undefined, { yaojiEnabled: true })
  // 手牌只有幺鸡属于缺门条：豁免后不算有缺门牌
  const hand = [YAOJI_TILE, W(1), W(2), W(3), T(1), T(2), T(3)]
  assert.equal(hasVoidTiles(hand, 'tiao', { yaoji: true }), false, '幺鸡豁免缺门')
  assert.equal(hasVoidTiles(hand, 'tiao'), true, '非幺鸡局幺鸡算条牌')
  // 手上有非幺鸡条牌时仍算缺门
  assert.equal(hasVoidTiles([...hand, I(5)], 'tiao', { yaoji: true }), true)
})

// ============================================================
// 8. 牌墙摆法（两牌一垛）
// ============================================================
console.log('=== 牌墙摆法（两牌一垛）===')

ok('任意开牌点/任意剩余牌数：除墙头待摸孤张外，牌墙都是两牌一垛', () => {
  // 遍历 4 个墙头方位 × 14 个开牌偏移 × 0~56 张剩余牌，
  // 统计「只占半张」的垛数（一层有牌、一层被摸走）。
  // 传统麻将摆法要求：剩余偶数张 ⇒ 全部成对；剩余奇数张 ⇒ 仅 1 个孤张
  // （就是墙头那张等下一家摸的牌）。
  let checked = 0
  for (let headSeat = 0; headSeat < 4; headSeat++) {
    for (let openOffset = 0; openOffset < 14; openOffset++) {
      for (let n = 0; n <= 56; n++) {
        const mask = ringMask(n, headSeat, openOffset)
        assert.equal(mask.length, 4)
        let remaining = 0
        for (const side of mask) {
          assert.equal(side.length, WALL_SIDE_SLOTS)
          side.forEach(v => { if (v) remaining++ })
        }
        assert.equal(remaining, n, `剩余牌数与掩码不符：head=${headSeat} off=${openOffset} n=${n}`)
        let half = 0
        for (const side of mask) {
          for (let i = 0; i < side.length; i += 2) {
            if (side[i] !== side[i + 1]) half++
          }
        }
        assert.equal(half, n % 2, `半垛孤张数应为 n 的奇偶：head=${headSeat} off=${openOffset} n=${n}（实际 ${half}）`)
        checked++
      }
    }
  }
  assert.equal(checked, 4 * 14 * 57)
})

ok('开局（55 张）只有 1 张孤张；摸走 1 张（54 张）后全部成对', () => {
  const first = ringMask(55, 0, 5)
  let half = 0
  for (const side of first) for (let i = 0; i < side.length; i += 2) if (side[i] !== side[i + 1]) half++
  assert.equal(half, 1, '开局牌墙应只有墙头 1 张待摸的孤张')
  const after = ringMask(54, 0, 5)
  half = 0
  for (const side of after) for (let i = 0; i < side.length; i += 2) if (side[i] !== side[i + 1]) half++
  assert.equal(half, 0, '摸走 1 张后牌墙应两两重叠、无孤张')
})

// ============================================================
// 9. 去重 / 过期
// ============================================================
console.log('=== 去重/过期 ===')

ok('同 actionId 重复 dispatch → DUPLICATE', () => {
  let s = createGame({ seed: 21 })
  const p0 = s.players[0]
  const bySuit = { wan: [], tong: [], tiao: [] }
  p0.hand.forEach(t => bySuit[tileSuit(t)].push(t))
  let picked = null
  for (const su of ['wan', 'tong', 'tiao']) {
    if (bySuit[su].length >= 3) { picked = bySuit[su].slice(0, 3); break }
  }
  const action = { type: 'swap', seat: 0, tiles: picked, actionId: 'dup1', stateVersion: s.version }
  const r1 = dispatch(s, action)
  assert.ok(r1.ok)
  s = r1.state
  const r2 = dispatch(s, action)
  assert.ok(!r2.ok)
  assert.equal(r2.error, 'duplicate')
})

ok('过期 stateVersion → STALE', () => {
  let s = createGame({ seed: 22 })
  const action = {
    type: 'swap', seat: 0, tiles: [W(1), W(2), W(3)],
    actionId: 'stale1', stateVersion: s.version + 99
  }
  const r = dispatch(s, action)
  assert.ok(!r.ok)
  assert.equal(r.error, 'stale')
})

// ============================================================
// 10. playerView 隐私
// ============================================================
console.log('=== playerView 隐私 ===')

ok('视角不含他人手牌/墙序，draw 事件已脱敏', () => {
  const s = fastForward(31)
  s.turn = 0
  const view = playerView(s, 1)
  // 他人手牌不可见
  for (const p of view.players) {
    assert.equal(p.hand, undefined, 'players 数组不得包含 hand')
    assert.equal(p.wall, undefined)
    assert.ok(typeof p.handCount === 'number')
  }
  // 墙序不可见
  assert.equal(view.wall, undefined)
  assert.equal(typeof view.wallCount, 'number')
  assert.equal(view.wallCount, s.wall.length)
  // 自己的合法动作与 legalActions 一致
  assert.deepEqual(view.legal, legalActions(s, 1))
  // 他人 draw 事件不含 tile
  const draws = view.lastEvents.filter(e => e.type === 'draw' && e.seat !== 1)
  draws.forEach(e => assert.equal(e.data.tile, undefined, '他人摸牌不可见'))
  // 自己的 draw 事件含 tile
  const mine = view.lastEvents.find(e => e.type === 'draw' && e.seat === 1)
  if (mine) assert.ok(mine.data.tile != null)
})

ok('playerView.my.fan：听牌给当前番数，有副露未听给潜力番', () => {
  // 全万听牌（W123 W234 W456 W789 + W9 单钓）→ 平胡 0 + 清一色 2 = 2 番
  let s = fastForward(22)
  setupTable(s, {
    turn: 1,
    specs: {
      0: { tiles: [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), W(2), W(3), W(4), W(9)], void: 'tong' }
    }
  })
  let v = playerView(s, 0)
  assert.ok(v.my.ting.length > 0, '应处于听牌')
  assert.ok(v.my.fan && v.my.fan.kind === 'ting', '听牌应给出当前番数')
  assert.equal(v.my.fan.fan, 2, '全万平胡 + 清一色 = 2 番')

  // 有碰副露但未听牌 → 给潜力番（散牌 = 平胡 0 番）
  s = fastForward(23)
  setupTable(s, {
    turn: 1,
    specs: {
      0: {
        tiles: [W(1), W(4), W(7), I(1), I(4), I(7), W(2), W(5), W(8), W(3)],
        melds: [{ kind: 'peng', tile: W(9), from: 3 }],
        void: 'tong'
      }
    }
  })
  v = playerView(s, 0)
  assert.equal(v.my.ting.length, 0, '不应听牌')
  assert.ok(v.my.fan && v.my.fan.kind === 'potential', '有副露未听应给潜力番')
  assert.equal(v.my.fan.fan, 0, '散牌潜力 = 平胡 0 番（1 倍）')
})

ok('定缺未亮底：定缺阶段看不到他人缺门，四家定完才公开', () => {
  let s = createGame({ seed: 41, rules: { swapThree: false } })
  assert.equal(s.phase, 'void')
  // 自己先定，再让 AI（座位1、2）定完：阶段仍是 void（座位3 未定）
  for (const [seat, suit] of [[0, 'tong'], [1, 'wan'], [2, 'tiao']]) {
    const r = dispatch(s, {
      type: 'void', seat, suit,
      actionId: `pv-void-${seat}`, stateVersion: s.version
    })
    assert.ok(r.ok, `定缺失败: ${r.error}`)
    s = r.state
  }
  assert.equal(s.phase, 'void')
  let view = playerView(s, 0)
  assert.equal(view.my.void, 'tong', '自己的缺门自己可见')
  assert.equal(view.players[0].void, 'tong')
  for (const seat of [1, 2]) {
    assert.equal(view.players[seat].void, null, `定缺阶段不得看到座位${seat}的缺门`)
  }
  assert.equal(view.players[3].void, null)
  // 事件流同样不泄露：他人的 void-set 只报事件、不带花色，自己的带花色
  const others = view.lastEvents.filter(e => e.type === 'void-set' && e.seat !== 0)
  assert.ok(others.length > 0, '应有他人的定缺事件')
  others.forEach(e => assert.equal(e.data.suit, undefined, '他人定缺花色不可见'))
  const mine = view.lastEvents.find(e => e.type === 'void-set' && e.seat === 0)
  assert.ok(mine && mine.data.suit === 'tong', '自己的定缺事件带花色')
  // 四家定完 → 转入摸打，他人缺门一并公开
  const r = dispatch(s, {
    type: 'void', seat: 3, suit: 'wan',
    actionId: 'pv-void-3', stateVersion: s.version
  })
  assert.ok(r.ok, `定缺失败: ${r.error}`)
  s = r.state
  assert.equal(s.phase, 'discard')
  view = playerView(s, 0)
  assert.equal(view.players[1].void, 'wan', '定完后公开他人缺门')
  assert.equal(view.players[2].void, 'tiao')
  assert.equal(view.players[3].void, 'wan')
})

// ============================================================
// 11. 随机合法机器人：压力 + 守恒 + 复现
// ============================================================
console.log('=== 随机压力局 ===')

/** 用真实 AI（ai.js）构造具体动作（确定性 rng） */
function robotAction(s, seat, rng, tag) {
  const view = playerView(s, seat)
  const action = aiDecide(view, 'normal', rng)
  if (!action) return null
  // AI 返回的动作不带 actionId/stateVersion/seat，由驱动方补齐
  return { ...action, seat, actionId: tag, stateVersion: s.version }
}

/** 全自动跑一局；返回 {state, log} */
function playGame(seed, { maxSteps = 5000, actionPrefix = '', rules } = {}) {
  let s = createGame({ seed, rules })
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const log = []
  let steps = 0
  while (s.phase !== 'finished' && steps < maxSteps) {
    steps++
    let acted = false
    // 响应窗口优先让 waiting 玩家表态（按座位序）
    const order = s.phase === 'respond' ? s.waiting : [0, 1, 2, 3]
    for (const seat of order) {
      const action = robotAction(s, seat, rng, `${actionPrefix}a${log.length}`)
      if (!action) continue
      const r = dispatch(s, action)
      if (r.ok) {
        s = r.state
        log.push(action)
        acted = true
        break
      }
    }
    if (!acted) {
      assert.fail(`seed=${seed} 第 ${steps} 步死锁 phase=${s.phase} turn=${s.turn} waiting=${JSON.stringify(s.waiting)} claims=${JSON.stringify(s.claims)}`)
    }
    conservation(s, `seed=${seed} step=${steps}`)
  }
  assert.ok(s.phase === 'finished', `seed=${seed} 超出步数上限`)
  return { state: s, log }
}

let totalGames = 0
let liujuCount = 0
let huCount = 0
for (let seed = 1; seed <= 20; seed++) {
  const { state } = playGame(seed)
  totalGames++
  const results = settlementOf(state)
  assert.ok(results, '应产生结算')
  const sum = state.players.reduce((a, p) => a + p.delta, 0)
  assert.equal(sum, 0, `seed=${seed} delta 总和 ${sum} ≠ 0`)
  if (results.liuju) liujuCount++
  else huCount += results.huOrder.length
  assert.ok(results.huOrder.length <= 3)
  // 胡牌者 delta 与流水一致（重算 ledger）
  const per = [0, 0, 0, 0]
  for (const e of state.ledger) {
    per[e.from] -= e.amount
    per[e.to] += e.amount
  }
  state.players.forEach((p, i) => assert.equal(p.delta, per[i], `seed=${seed} seat${i} delta 与流水不符`))
}
ok(`20 个 seed 全自动对局：流局 ${liujuCount} 局，胡牌 ${huCount} 次，守恒/零和/流水全部通过`, () => {})

// 幺鸡局压力：开启赖子后跑若干局，验证无死锁、守恒、零和、流水一致
let yjLiu = 0
let yjHu = 0
for (let seed = 201; seed <= 210; seed++) {
  const { state } = playGame(seed, { rules: { yaojiEnabled: true } })
  const results = settlementOf(state)
  assert.ok(results, '幺鸡局应产生结算')
  const sum = state.players.reduce((a, p) => a + p.delta, 0)
  assert.equal(sum, 0, `幺鸡局 seed=${seed} delta 总和 ${sum} ≠ 0`)
  if (results.liuju) yjLiu++
  else yjHu += results.huOrder.length
  const per = [0, 0, 0, 0]
  for (const e of state.ledger) {
    per[e.from] -= e.amount
    per[e.to] += e.amount
  }
  state.players.forEach((p, i) => assert.equal(p.delta, per[i], `幺鸡局 seed=${seed} seat${i} delta 与流水不符`))
}
ok(`幺鸡局 10 个 seed 全自动对局：流局 ${yjLiu} 局，胡牌 ${yjHu} 次，守恒/零和/流水全部通过`, () => {})

ok('相同 seed + 相同动作序列 → 完全相同的最终 state', () => {
  const { log } = playGame(777, { actionPrefix: 'rep-' })
  const first = playGame(777, { actionPrefix: 'rep-' }).state
  // 重放：相同 actionId + stateVersion
  let s = createGame({ seed: 777 })
  for (const action of log) {
    const r = dispatch(s, action)
    assert.ok(r.ok, `重放失败: ${r.error} @ ${action.actionId}`)
    s = r.state
  }
  assert.equal(s.phase, 'finished')
  assert.deepEqual(JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(first)))
})

// ============================================================
// 13. 出牌响应仲裁与抢杠胡 专项（用户规则 TEST1~15）
// ------------------------------------------------------------
// 三阶段模型（单机 / 联机 / AI / 超时托管 / 断线托管共用同一引擎）：
//   DISCARD → HU 窗口（并行）→ GANG 窗口（串行）→ PENG 窗口（串行）→ 下一家摸牌
//   · HU 阶段（并行收集）：所有胡候选人同时思考、同时拿到「胡 / 过」，共享同一
//     截止时间；谁先叫胡都不关别人的窗口，全部有结果才一次性结算（一炮多响）。
//     此阶段绝不提前开放杠/碰按钮。
//   · GANG 阶段（串行仲裁）：所有胡都过了才有杠权，按「自出牌者下家起的有效摸牌
//     顺序」逐个询问，一旦有人杠即成交，后面的人不再有机会。当前座位同一张牌
//     「既能杠又能碰」时，杠/碰/过三个按钮同屏给出，由本人当场选（选碰也成交）。
//   · PENG 阶段（串行仲裁）：所有杠都过了才有碰权，同一顺序逐个询问，成交即结束。
//   · 「胡 + 碰」同一人（只能碰不能杠）：过胡后仍要等 GANG 阶段全部问完，才轮到他碰。
//   · 「过」是本窗口内的最终决定：同一座位重复提交、旧 stateVersion / 重复
//     actionId 一律拒绝，不能反悔；GANG 阶段点「过」即同时放弃杠和碰，
//     不再于 PENG 阶段二次询问（超时 / 断线由 AI 替该座位提交一次最终动作）。
//   · 定缺：未打完缺（手里还有缺门牌）只是不能胡、出牌只能打缺门，
//     碰 / 明杠照样可以叫牌（碰完仍必须打缺门）。
//   · 过水（passHu）限制完整保留：放弃点炮胡后、自己摸牌（过庄）前，同番或更低番
//     的炮不再给「胡」；番更大的炮仍可胡；自摸不受限。
//   · 下一手摸牌一律复用引擎「活跃座位」逻辑（跳过已胡出阵者），联机层不自己算。
// ============================================================
console.log('=== 响应仲裁专项（三阶段 HU→GANG→PENG）===')

const yqid = n => `spec-${n}`

/** 公共出牌者规格：座位 0 手里无万、缺万 → 可直接打出摸到的 W9 */
const D0_W9 = {
  tiles: [T(3), T(4), T(5), T(6), T(7), T(8), T(9), I(4), I(5), I(6), I(7), I(8), I(9)],
  void: 'wan'
}

/** 座位 0 打 W9，按 specs 摆好其余座位；markHu 里的座位先标记为已胡出阵 */
function w9Respond(seed, specs, { yaoji = false, markHu = [] } = {}) {
  const s = fastForward(seed, undefined, yaoji ? { yaojiEnabled: true } : undefined)
  setupTable(s, { turn: 0, drawnTile: W(9), specs: { 0: D0_W9, ...specs } })
  for (const seat of markHu) {
    s.players[seat].hu = { how: 'zimo', winTile: null, fan: 0, names: [], huOrder: 0, scoreDelta: 0 }
  }
  const r = dispatch(s, {
    type: 'discard', seat: 0, tile: W(9), actionId: yqid(`${seed}-d`), stateVersion: s.version
  })
  assert.ok(r.ok, `打 W9 失败: ${r.error}`)
  return r.state
}

// 各座位手牌规格（缺门一律取手里没有的花色，才能参与响应）
// seat1：幺鸡局下 1 真 W9 + 1 赖即可碰（只能碰，胡不了）
const H1_PENG = {
  tiles: [W(9), YAOJI_TILE, W(1), W(4), W(7), I(2), I(2), I(5), I(5), I(8), I(8), I(3), I(3)],
  void: 'tong'
}
// seat2：幺鸡局下 2 真 W9 + 1 赖可明杠（也能碰）
const H2_GANG = {
  tiles: [W(9), W(9), YAOJI_TILE, W(1), W(4), W(7), I(3), I(3), I(6), I(6), I(9), I(9), I(4)],
  void: 'tong'
}
// seat1：吃 W9 即胡（W123 W456 W789 + T111 + T22）
const H1_HU = {
  tiles: [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(1), T(1), T(1), T(2), T(2)],
  void: 'tiao'
}
// seat2：2 真 W9 可碰（非幺鸡局；胡不了）
const H2_PENG = {
  tiles: [W(9), W(9), W(1), W(3), W(5), W(7), T(3), T(3), T(5), T(5), T(7), T(7), T(9)],
  void: 'tiao'
}
// seat3：吃 W9 即胡（W123 W456 W789 + T888 + T99）
const H3_HU = {
  tiles: [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), T(8), T(8), T(8), T(9), T(9)],
  void: 'tiao'
}
// seat3：幺鸡局下 1 真 W9 + 1 赖可碰（胡不了）
const H3_PENG = {
  tiles: [W(9), YAOJI_TILE, W(2), W(5), W(8), I(2), I(2), I(5), I(5), I(7), I(7), I(8), I(8)],
  void: 'tong'
}
// seat1：手里 3 真 W9，同时可碰可明杠（非幺鸡局）
const H1_PENG_GANG = {
  tiles: [W(9), W(9), W(9), W(1), W(4), W(7), T(1), T(1), T(4), T(4), T(7), T(7), T(9)],
  void: 'tiao'
}
// seat1：幺鸡局下吃 W9 即胡（W999 用 1 真 + 1 赖补位 + W123 + W456 + T111 + T22），
// 同时手里 1 真 W9 + 1 赖可碰——「胡 + 碰」双重资格：过胡后必须等 GANG 阶段问完，
// 才能轮到碰。
const H1_HU_PENG = {
  tiles: [W(9), YAOJI_TILE, W(1), W(2), W(3), W(4), W(5), W(6), T(1), T(1), T(1), T(2), T(2)],
  void: 'tiao'
}
// seat2：幺鸡局下 2 真 W9 + 1 赖可明杠（也能碰），牌面不成胡
// （Seat0 出 1 张、Seat1 占 1 张、Seat2 占 2 张，正好用满 4 张 W9）
const H2_GANG3 = {
  tiles: [W(9), W(9), YAOJI_TILE, W(1), W(4), W(7), T(1), T(2), T(3), T(4), T(5), T(7), T(9)],
  void: 'tiao'
}
// seat1：碰碰胡听 T9（W111 W222 W333 T555 + T9），点炮 1 番（> 平胡 0 番）
const H1_PENGPENGHU = {
  tiles: [W(1), W(1), W(1), W(2), W(2), W(2), W(3), W(3), W(3), T(5), T(5), T(5), T(9)],
  void: 'tiao'
}
// 通用「手里无筒、缺筒」的出牌者规格：可自由打出任意万 / 条
const NO_TONG_DISCARDER = {
  tiles: [W(1), W(2), W(3), W(4), W(5), W(6), W(7), W(8), W(9), I(1), I(2), I(3), I(4)],
  void: 'tong'
}

ok('TEST1 HU 阶段并行收集：所有胡候选人同时拿到「胡/过」，碰/杠此刻连按钮都没有', () => {
  const s = w9Respond(101, { 1: H1_PENG, 2: H2_GANG, 3: H3_HU }, { yaoji: true })
  assert.deepEqual(s.waiting, [1, 2, 3], '候选按有效摸牌顺序 1→2→3')
  assert.equal(s.respondStage, 'hu', '先进入 HU 阶段')
  assert.equal(s.currentResponder, null, 'HU 阶段并行收集，没有唯一响应者')
  assert.deepEqual(s.huWait, [3], '只有 seat3 有胡权，但它走并行窗口而非串行排队')
  assert.deepEqual(legalActions(s, 3).map(o => o.type), ['hu', 'pass'], 'seat3 拿到胡/过')
  assert.equal(legalActions(s, 1).length, 0, 'seat1 有碰权，但 HU 窗口期间不给按钮')
  assert.equal(legalActions(s, 2).length, 0, 'seat2 有杠权，但 HU 窗口期间不给按钮')
  let r = dispatch(s, { type: 'peng', seat: 1, actionId: yqid('t1-p'), stateVersion: s.version })
  assert.ok(!r.ok && r.error === 'not-active', 'seat1 此时提交碰必须无效')
  r = dispatch(s, {
    type: 'gang', seat: 2, tile: W(9), gangType: 'ming',
    actionId: yqid('t1-g'), stateVersion: s.version
  })
  assert.ok(!r.ok && r.error === 'not-active', 'seat2 此时提交杠必须无效')
  r = dispatch(s, { type: 'hu', seat: 3, actionId: yqid('t1-h'), stateVersion: s.version })
  assert.ok(r.ok, `seat3 胡失败: ${r.error}`)
  assert.ok(r.state.players[3].hu, 'seat3 胡成')
  assert.equal(r.state.players[1].melds.length, 0, 'seat1 的碰失效')
  assert.equal(r.state.players[2].melds.length, 0, 'seat2 的杠失效')
  conservation(r.state, 'TEST1')
})

ok('TEST2 先叫胡不关窗：seat1 叫胡后 seat3 仍可胡，全部有结果后一次性结算（一炮多响）', () => {
  const s = w9Respond(102, { 1: H1_HU, 2: H2_PENG, 3: H3_HU })
  assert.deepEqual(s.huWait, [1, 3], '两家同时拥有胡权')
  let r = dispatch(s, { type: 'hu', seat: 1, actionId: yqid('t2-h1'), stateVersion: s.version })
  assert.ok(r.ok, `seat1 胡失败: ${r.error}`)
  let st = r.state
  assert.equal(st.phase, 'respond', 'seat1 叫胡后窗口不关（不能关掉别人的胡权）')
  assert.equal(st.players[1].hu, null, '未全部表态前不结算')
  assert.deepEqual(st.huWait, [3], '只剩 seat3 还没表态')
  assert.deepEqual(legalActions(st, 3).map(o => o.type), ['hu', 'pass'], 'seat3 依然拥有胡权')
  r = dispatch(st, { type: 'hu', seat: 3, actionId: yqid('t2-h3'), stateVersion: st.version })
  assert.ok(r.ok, `seat3 胡失败: ${r.error}`)
  st = r.state
  assert.ok(st.players[1].hu && st.players[3].hu, '两家同时胡成（一炮多响）')
  assert.equal(st.players[1].hu.how, 'dianpao')
  assert.equal(st.players[3].hu.how, 'dianpao')
  assert.equal(st.huOrder.length, 2, '一次性结算两位胡者（不是先改状态再处理第二个）')
  assert.equal(st.ledger.filter(e => e.reason === 'dianpao').length, 2, '向两位胡者各结算一份')
  assert.equal(st.players[2].melds.length, 0, 'seat2 的碰权随窗口结束失效')
  conservation(st, 'TEST2')
})

ok('TEST3 HU→GANG→PENG：Seat1(胡+碰)/Seat2(杠)/Seat3(胡)——过胡后 Seat1 不能立刻碰，先等 Seat2 的杠', () => {
  const s = w9Respond(103, { 1: H1_HU_PENG, 2: H2_GANG3, 3: H3_HU }, { yaoji: true })
  assert.deepEqual(s.waiting, [1, 2, 3], '候选按有效摸牌顺序 1→2→3')
  assert.deepEqual(s.huWait, [1, 3], '第一阶段：Seat1 / Seat3 有胡权')
  assert.deepEqual(s.gangWait, [2], '第二阶段：Seat2 排在杠')
  assert.deepEqual(s.pengWait, [1, 2], '第三阶段：Seat1 / Seat2 排在碰')
  assert.equal(s.respondStage, 'hu', '当前是并行 HU 阶段')
  assert.equal(legalActions(s, 2).length, 0, 'Seat2 在 HU 阶段没有任何按钮')
  // Seat1 过胡
  let r = dispatch(s, { type: 'pass', seat: 1, actionId: yqid('t3-p1'), stateVersion: s.version })
  assert.ok(r.ok, `Seat1 过失败: ${r.error}`)
  let st = r.state
  assert.equal(st.respondStage, 'hu', 'Seat3 还没表态，仍停在 HU 阶段')
  assert.equal(legalActions(st, 1).length, 0, 'Seat1 过胡后不能立刻碰（中间还有更高优先级的杠）')
  // Seat3 过胡 → HU 阶段结束，才进入 GANG 阶段
  r = dispatch(st, { type: 'pass', seat: 3, actionId: yqid('t3-p3'), stateVersion: st.version })
  assert.ok(r.ok, `Seat3 过失败: ${r.error}`)
  st = r.state
  assert.equal(st.respondStage, 'gang', '所有胡都过了才进入 GANG 阶段')
  assert.equal(st.currentResponder, 2, '轮到 Seat2 的杠')
  assert.equal(legalActions(st, 1).length, 0, 'Seat1 的碰仍在排队（杠优先于碰）')
  assert.ok(legalActions(st, 2).some(o => o.type === 'gang'), 'Seat2 这时才拿到杠')
  // Seat2 过杠 → 才进入 PENG 阶段，Seat1 终于拿到碰
  r = dispatch(st, { type: 'pass', seat: 2, actionId: yqid('t3-p2'), stateVersion: st.version })
  assert.ok(r.ok, `Seat2 过失败: ${r.error}`)
  st = r.state
  assert.equal(st.respondStage, 'peng', '所有杠都过了才进入 PENG 阶段')
  assert.equal(st.currentResponder, 1, '轮到最近的 Seat1 碰')
  assert.ok(legalActions(st, 1).some(o => o.type === 'peng'), 'Seat1 这时才拿到碰')
  r = dispatch(st, { type: 'peng', seat: 1, actionId: yqid('t3-k1'), stateVersion: st.version })
  assert.ok(r.ok, `Seat1 碰失败: ${r.error}`)
  assert.equal(r.state.players[1].melds[0].kind, 'peng')
  conservation(r.state, 'TEST3')
})

ok('TEST4 GANG 成交即结束：Seat2 杠成，Seat1 的碰权随之失效', () => {
  const s = w9Respond(104, { 1: H1_HU_PENG, 2: H2_GANG3, 3: H3_HU }, { yaoji: true })
  let r = dispatch(s, { type: 'pass', seat: 1, actionId: yqid('t4-p1'), stateVersion: s.version })
  assert.ok(r.ok)
  r = dispatch(r.state, { type: 'pass', seat: 3, actionId: yqid('t4-p3'), stateVersion: r.state.version })
  assert.ok(r.ok)
  assert.equal(r.state.respondStage, 'gang')
  r = dispatch(r.state, {
    type: 'gang', seat: 2, tile: W(9), gangType: 'ming',
    actionId: yqid('t4-g2'), stateVersion: r.state.version
  })
  assert.ok(r.ok, `Seat2 明杠失败: ${r.error}`)
  const st = r.state
  assert.equal(st.players[2].melds[0].kind, 'gang')
  assert.equal(st.players[1].melds.length, 0, 'Seat1 的碰不得执行')
  assert.equal(st.players[0].delta, -1, '明杠由放杠者付 1 分')
  conservation(st, 'TEST4')
})

ok('TEST5 GANG 优先于 PENG：Seat1 能碰、Seat2 能杠，先问 Seat2 的杠', () => {
  const s = w9Respond(105, { 1: H1_PENG, 2: H2_GANG }, { yaoji: true })
  assert.deepEqual(s.waiting, [1, 2], '无胡候选人 → 直接进入杠/碰阶段')
  assert.equal(s.respondStage, 'gang', '杠优先：先进入 GANG 阶段')
  assert.equal(s.currentResponder, 2, '杠候选者 Seat2 先决定')
  assert.ok(legalActions(s, 2).some(o => o.type === 'gang'), 'Seat2 拿到杠')
  // 杠碰同屏：Seat2 手里 2 真 W9 + 1 赖，同一张牌既能杠又能碰 → 杠/碰一起给出，
  // 由本人当场选（不必先过杠才轮到碰）
  assert.ok(legalActions(s, 2).some(o => o.type === 'peng'), 'Seat2 同时能碰 → GANG 阶段同屏给出碰按钮')
  assert.equal(legalActions(s, 1).length, 0, 'Seat1 的碰要等杠阶段结束')
  const rP = dispatch(s, { type: 'peng', seat: 1, actionId: yqid('t5-p'), stateVersion: s.version })
  assert.ok(!rP.ok && rP.error === 'not-active', 'Seat1 越过杠抢碰被拒')
  // Seat2 过杠 → 才轮到 Seat1 碰
  const r = dispatch(s, { type: 'pass', seat: 2, actionId: yqid('t5-pg'), stateVersion: s.version })
  assert.ok(r.ok, `Seat2 过失败: ${r.error}`)
  const st = r.state
  assert.equal(st.respondStage, 'peng', '所有杠都过了才进入 PENG 阶段')
  assert.equal(st.currentResponder, 1, 'Seat1（碰）这时才获决定权')
  assert.ok(legalActions(st, 1).some(o => o.type === 'peng'))
  conservation(st, 'TEST5')
})

ok('TEST6 杠成交后后面的碰失效：Seat1 过胡 → Seat2 杠成 → Seat3 碰不得执行', () => {
  const s = w9Respond(106, { 1: H1_HU, 2: H2_GANG, 3: H3_PENG }, { yaoji: true })
  assert.deepEqual(s.huWait, [1], 'Seat1 是胡候选人（并行窗口）')
  assert.equal(s.currentResponder, null)
  let r = dispatch(s, { type: 'pass', seat: 1, actionId: yqid('t6-p1'), stateVersion: s.version })
  assert.ok(r.ok, `seat1 过失败: ${r.error}`)
  const st = r.state
  assert.equal(st.respondStage, 'gang', 'Seat1 过完胡后进入 GANG 阶段')
  assert.equal(st.currentResponder, 2, '轮到杠候选者 Seat2')
  assert.equal(legalActions(st, 3).length, 0, 'Seat3 的碰还没有决定权')
  r = dispatch(st, {
    type: 'gang', seat: 2, tile: W(9), gangType: 'ming',
    actionId: yqid('t6-g'), stateVersion: st.version
  })
  assert.ok(r.ok, `seat2 明杠失败: ${r.error}`)
  assert.equal(r.state.players[2].melds[0].gangType, 'ming')
  assert.equal(r.state.players[3].melds.length, 0, 'seat3 的碰不得执行')
  conservation(r.state, 'TEST6')
})

ok('TEST7 同一人可碰可杠：GANG 阶段同屏给出「杠/碰/过」，由本人当场选', () => {
  const s = w9Respond(107, { 1: H1_PENG_GANG })
  assert.deepEqual(s.waiting, [1], '只有 seat1 能响应')
  assert.equal(s.respondStage, 'gang', '有杠资格时先进入 GANG 阶段')
  assert.equal(s.currentResponder, 1)
  const gTypes = legalActions(s, 1).map(o => o.type)
  assert.ok(gTypes.includes('gang'), 'GANG 阶段含 GANG：' + gTypes.join('/'))
  assert.ok(gTypes.includes('peng'), 'GANG 阶段同屏含 PENG：' + gTypes.join('/'))
  assert.ok(gTypes.includes('pass'), 'GANG 阶段含 PASS：' + gTypes.join('/'))
  // 直接选碰（不必先过杠）也能成交
  const r = dispatch(s, { type: 'peng', seat: 1, actionId: yqid('t7-pk'), stateVersion: s.version })
  assert.ok(r.ok, `seat1 在 GANG 阶段选碰失败: ${r.error}`)
  assert.equal(r.state.players[1].melds[0].kind, 'peng')
  conservation(r.state, 'TEST7')
})

ok('TEST7b 同一人可碰可杠：点「过」即同时放弃杠和碰，不再二次询问碰', () => {
  const s = w9Respond(107, { 1: H1_PENG_GANG })
  const r = dispatch(s, { type: 'pass', seat: 1, actionId: yqid('t7b-pass'), stateVersion: s.version })
  assert.ok(r.ok, `seat1 过失败: ${r.error}`)
  assert.equal(r.state.players[1].melds.length, 0, '点过 = 杠、碰都放弃')
  conservation(r.state, 'TEST7b')
})

// 定缺未打完时照样可碰/明杠：定缺只限制「打什么」和「能不能胡」。
// （缺筒且手里有筒 = 未打缺；手里 W9 成对/成刻即可叫牌）
const H1_PENG_VOIDING = {
  tiles: [W(9), W(9), W(1), W(4), W(7), T(1), T(1), T(4), T(4), T(7), T(7), T(9), T(2)],
  void: 'tong'
}
const H2_GANG_VOIDING = {
  tiles: [W(9), W(9), W(9), W(1), W(4), W(7), T(1), T(1), T(4), T(4), T(7), T(9), T(2)],
  void: 'tong'
}

ok('TEST7c 定缺未打完也能碰：碰完仍必须打缺门牌', () => {
  const s = w9Respond(115, { 1: H1_PENG_VOIDING })
  assert.deepEqual(s.waiting, [1], 'seat1 未打缺但有 2 张 W9 → 可碰')
  assert.equal(s.respondStage, 'peng', '只有碰资格（无杠）→ 直接进入 PENG 阶段')
  assert.ok(legalActions(s, 1).some(o => o.type === 'peng'), '未打缺也拿到碰按钮')
  const r = dispatch(s, { type: 'peng', seat: 1, actionId: yqid('t7c-peng'), stateVersion: s.version })
  assert.ok(r.ok, `未打缺碰失败: ${r.error}`)
  const st = r.state
  assert.equal(st.players[1].melds[0].kind, 'peng')
  assert.equal(st.mustDiscard, true, '碰后进入强制出牌回合')
  const disc = legalActions(st, 1).find(o => o.type === 'discard')
  assert.ok(disc && disc.tiles.length > 0 && disc.tiles.every(t => tileSuit(t) === 'tong'),
    '碰完仍只能打缺门筒')
  conservation(st, 'TEST7c')
})

ok('TEST7d 定缺未打完也能明杠', () => {
  const s = w9Respond(116, { 2: H2_GANG_VOIDING })
  assert.deepEqual(s.waiting, [2], 'seat2 未打缺但有 3 张 W9 → 可明杠')
  assert.equal(s.respondStage, 'gang')
  assert.equal(s.currentResponder, 2)
  assert.ok(legalActions(s, 2).some(o => o.type === 'gang'), '未打缺也拿到杠按钮')
  const r = dispatch(s, {
    type: 'gang', seat: 2, tile: W(9), gangType: 'ming',
    actionId: yqid('t7d-gang'), stateVersion: s.version
  })
  assert.ok(r.ok, `未打缺明杠失败: ${r.error}`)
  assert.equal(r.state.players[2].melds[0].gangType, 'ming')
  conservation(r.state, 'TEST7d')
})

/** 抢杠场景：seat0 碰 W5 后摸到第 4 张 W5 发起补杠；seat1、seat3 都听 W5 */
const ROB_SEAT0 = {
  melds: [{ kind: 'peng', tile: W(5), from: 2 }],
  tiles: [W(2), W(3), W(4), W(6), W(7), W(8), T(2), T(2), T(3), T(3)],
  void: 'tiao'
}
const ROB_H1 = {
  tiles: [T(1), T(1), W(1), W(2), W(3), W(7), W(8), W(9), T(5), T(6), T(7), W(4), W(6)],
  void: 'tiao'
}
const ROB_H3 = {
  tiles: [W(4), W(6), I(2), I(2), I(2), I(5), I(5), I(5), I(8), I(8), I(8), I(9), I(9)],
  void: 'tong'
}

function robBuGang(seed) {
  const s = fastForward(seed)
  setupTable(s, { turn: 0, drawnTile: W(5), specs: { 0: ROB_SEAT0, 1: ROB_H1, 3: ROB_H3 } })
  const r = dispatch(s, {
    type: 'gang', seat: 0, tile: W(5), gangType: 'bu',
    actionId: yqid(`${seed}-bu`), stateVersion: s.version
  })
  assert.ok(r.ok, `补杠失败: ${r.error}`)
  return r.state
}

ok('TEST8 抢杠并行：补杠不落地（仍 pending），所有抢杠候选人同时拿到「抢杠胡/过」', () => {
  const s = robBuGang(108)
  assert.equal(s.phase, 'respond')
  assert.ok(s.pendingKong && s.pendingKong.tile === W(5), '补杠仍处于 pending（未落地）')
  assert.equal(s.players[0].melds[0].kind, 'peng', '副露仍是碰，杠没有先写成')
  assert.deepEqual(s.waiting, [1, 3], '抢杠胡候选人按被杠者下家起顺序：seat1 → seat3')
  assert.equal(s.respondStage, 'hu', '抢杠窗口只有并行 HU 阶段')
  assert.equal(s.currentResponder, null, '并行收集，没有唯一响应者')
  assert.deepEqual(s.huWait, [1, 3], '两家同时拥有抢杠胡权')
  assert.deepEqual(legalActions(s, 1).map(o => o.type), ['hu', 'pass'], 'seat1 拿到抢杠胡/过')
  assert.deepEqual(legalActions(s, 3).map(o => o.type), ['hu', 'pass'], 'seat3 同时拿到抢杠胡/过')
  assert.ok(legalActions(s, 1).some(o => o.how === 'qianggang'), '动作为抢杠胡')
  conservation(s, 'TEST8')
})

ok('TEST9 多人抢杠一次性结算：两家都抢，补杠取消、杠不成立，一次结算两家抢杠胡', () => {
  const s = robBuGang(109)
  let r = dispatch(s, { type: 'hu', seat: 1, actionId: yqid('t9-h1'), stateVersion: s.version })
  assert.ok(r.ok, `seat1 抢杠胡失败: ${r.error}`)
  let st = r.state
  assert.equal(st.phase, 'respond', 'seat1 抢杠后窗口不关，等 seat3 表态')
  assert.equal(st.players[1].hu, null, '未全部表态前不结算')
  assert.deepEqual(st.huWait, [3])
  assert.ok(legalActions(st, 3).some(o => o.type === 'hu'), 'seat3 依然拥有抢杠胡权')
  r = dispatch(st, { type: 'hu', seat: 3, actionId: yqid('t9-h3'), stateVersion: st.version })
  assert.ok(r.ok, `seat3 抢杠胡失败: ${r.error}`)
  st = r.state
  assert.equal(st.players[1].hu.how, 'qianggang')
  assert.equal(st.players[3].hu.how, 'qianggang')
  assert.ok(st.players[1].hu.names.includes('抢杠胡'), st.players[1].hu.names.join('/'))
  assert.equal(st.huOrder.length, 2, '一次性结算两家抢杠胡')
  assert.equal(st.pendingKong, null, 'pendingKong 被取消')
  assert.equal(st.players[0].melds[0].kind, 'peng', '杠没有真正成立')
  assert.ok(!st.ledger.some(e => e.reason.startsWith('gang')), '杠分一分不收')
  assert.ok(st.players[0].discards.includes(W(5)), '被抢的牌算 seat0 点炮')
  assert.equal(st.turn, 0, '被抢者（seat0）接着摸牌')
  conservation(st, 'TEST9')
})

ok('TEST10 抢杠全过：seat1、seat3 都过 → 补杠才真正成立并补牌', () => {
  const s = robBuGang(110)
  let r = dispatch(s, { type: 'pass', seat: 1, actionId: yqid('t10-p1'), stateVersion: s.version })
  assert.ok(r.ok, `seat1 过失败: ${r.error}`)
  let st = r.state
  assert.ok(st.pendingKong, 'seat1 过后补杠仍 pending（等 seat3）')
  assert.equal(st.respondStage, 'hu', '仍停在 HU 并行窗口')
  assert.deepEqual(st.huWait, [3])
  assert.ok(legalActions(st, 3).some(o => o.how === 'qianggang'), 'seat3 仍可抢杠胡')
  r = dispatch(st, { type: 'pass', seat: 3, actionId: yqid('t10-p3'), stateVersion: st.version })
  assert.ok(r.ok, `seat3 过失败: ${r.error}`)
  st = r.state
  assert.equal(st.pendingKong, null, '抢杠窗口关闭')
  assert.equal(st.players[0].melds[0].kind, 'gang', '补杠这时才真正成立')
  assert.equal(st.players[0].melds[0].gangType, 'bu')
  assert.equal(st.phase, 'discard', '补杠成立后从墙尾补牌，进入摸打')
  assert.notEqual(st.drawnTile, null, '已完成补牌')
  assert.ok(st.ledger.some(e => e.reason === 'gang-an'), '补杠分已入账')
  conservation(st, 'TEST10')
})

ok('TEST11 「过」是本窗口的最终决定：不能改口，重复 / 过期请求一律拒绝', () => {
  const s = w9Respond(111, { 1: H1_HU, 2: H2_PENG, 3: H3_HU })
  let r = dispatch(s, { type: 'pass', seat: 1, actionId: yqid('t11-p1'), stateVersion: s.version })
  assert.ok(r.ok, `seat1 过失败: ${r.error}`)
  const st = r.state
  const r2 = dispatch(st, { type: 'hu', seat: 1, actionId: yqid('t11-h1'), stateVersion: st.version })
  assert.ok(!r2.ok && r2.error === 'not-active', '同一窗口内过胡后不能改口胡')
  const r3 = dispatch(st, { type: 'hu', seat: 3, actionId: yqid('t11-h3'), stateVersion: s.version })
  assert.ok(!r3.ok && r3.error === 'stale', '旧 stateVersion 请求被拒（不可反悔）')
  const r4 = dispatch(st, { type: 'pass', seat: 1, actionId: yqid('t11-p1'), stateVersion: st.version })
  assert.ok(!r4.ok && r4.error === 'duplicate', '重复 actionId（网络重发）被拒')
  conservation(st, 'TEST11')
})

ok('TEST12 超时 / AI 托管：HU 窗口内每个待表态者各自被托管一次', () => {
  let s = w9Respond(112, { 1: H1_HU, 2: H2_PENG, 3: H3_HU })
  assert.deepEqual(s.huWait, [1, 3], '两家同时待表态，共享同一窗口')
  for (const seat of [1, 3]) {
    const hosted = aiDecide(playerView(s, seat), 'normal', mulberry32(seat)) || { type: 'pass' }
    const r = dispatch(s, { ...hosted, seat, actionId: yqid('t12-' + seat), stateVersion: s.version })
    assert.ok(r.ok, `seat${seat} 托管失败: ${r.error}`)
    s = r.state
  }
  assert.ok(!s.huWait.includes(1) && !s.huWait.includes(3), '两家都已表态，窗口不再等他们')
  conservation(s, 'TEST12')
})

ok('TEST13 跳过已胡出阵者：seat1 已退出，响应顺序为 seat2 → seat3', () => {
  const s = w9Respond(113, { 2: H2_PENG, 3: H3_HU }, { markHu: [1] })
  assert.deepEqual(s.waiting, [2, 3], '已胡出阵的 seat1 被跳过')
  assert.deepEqual(s.huWait, [3], 'HU 阶段只有 seat3')
  assert.deepEqual(s.pengWait, [2], 'PENG 阶段只有 seat2')
  assert.equal(s.respondStage, 'hu', '仍有胡候选人 → 先走 HU 阶段')
  const r1 = dispatch(s, { type: 'pass', seat: 1, actionId: yqid('t13-x'), stateVersion: s.version })
  assert.ok(!r1.ok, '已胡出阵的 seat1 不能提交')
  const r = dispatch(s, { type: 'hu', seat: 3, actionId: yqid('t13-h'), stateVersion: s.version })
  assert.ok(r.ok, `seat3 胡失败: ${r.error}`)
  assert.ok(r.state.players[3].hu)
  assert.equal(r.state.players[2].melds.length, 0, 'seat2 的碰因 seat3 胡而失效')
  conservation(r.state, 'TEST13')
})

ok('TEST14 多人胡后下一手：复用引擎活跃座位逻辑（跳过已胡出阵者）', () => {
  const s = w9Respond(114, { 1: H1_HU, 2: H2_PENG, 3: H3_HU })
  let r = dispatch(s, { type: 'hu', seat: 1, actionId: yqid('t14-h1'), stateVersion: s.version })
  assert.ok(r.ok)
  r = dispatch(r.state, { type: 'hu', seat: 3, actionId: yqid('t14-h3'), stateVersion: r.state.version })
  assert.ok(r.ok, `seat3 胡失败: ${r.error}`)
  const st = r.state
  assert.equal(st.huOrder.length, 2)
  assert.ok(st.players[1].hu && st.players[3].hu, 'seat1 / seat3 出阵')
  assert.equal(st.players[2].hu, null, 'seat2 未胡')
  // 最靠近出牌者的胡家是 seat1，其次位活跃玩家是 seat2 → 由 seat2 摸牌
  // （不是 lastWinner + 1，也不是出牌者 + 1；已胡的 seat1/seat3 被跳过）
  assert.equal(st.turn, 2, '由引擎按活跃座位算出下一手')
  assert.equal(st.phase, 'discard')
  assert.notEqual(st.drawnTile, null)
  conservation(st, 'TEST14')
})

ok('TEST15 过水限制保留：放弃的点炮胡被记录，同番被挡、过庄解除、番更大仍可胡', () => {
  // (a) 放弃点炮胡 → 记录 passHu（平胡 0 番）；未过庄前限制保持
  let s = w9Respond(115, { 1: H1_HU, 2: H2_PENG, 3: H3_HU })
  let r = dispatch(s, { type: 'pass', seat: 1, actionId: yqid('t15-p1'), stateVersion: s.version })
  assert.ok(r.ok, `seat1 过失败: ${r.error}`)
  s = r.state
  assert.ok(s.players[1].passHu, '放弃的这手点炮胡被记录')
  assert.equal(s.players[1].passHu.fan, 0, '平胡 0 番')
  assert.equal(s.players[1].passHu.tile, W(9))
  // seat3 也过 → 无人要牌 → 出牌者下家 seat1 摸牌（过庄）→ 过水限制自动解除
  r = dispatch(s, { type: 'pass', seat: 3, actionId: yqid('t15-p3'), stateVersion: s.version })
  assert.ok(r.ok, `seat3 过失败: ${r.error}`)
  s = r.state
  assert.equal(s.currentResponder, 2, '轮到碰候选者 seat2')
  r = dispatch(s, { type: 'pass', seat: 2, actionId: yqid('t15-p2'), stateVersion: s.version })
  assert.ok(r.ok, `seat2 过失败: ${r.error}`)
  s = r.state
  assert.equal(s.turn, 1, '无人要牌 → 出牌者下家 seat1 摸牌（过庄）')
  assert.equal(s.players[1].passHu, null, '过庄后过水限制解除')

  // (b) 同番：另一窗口里同一张牌被过水挡住，不再给「胡」
  const b = fastForward(1151)
  setupTable(b, { turn: 2, drawnTile: W(9), specs: { 1: H1_HU, 2: NO_TONG_DISCARDER } })
  b.players[1].passHu = { fan: 0, tile: W(9) } // 模拟已记录的过水（同番 0）
  const rB = dispatch(b, { type: 'discard', seat: 2, tile: W(9), actionId: yqid('t15-d2'), stateVersion: b.version })
  assert.ok(rB.ok, `同番场景出牌失败: ${rB.error}`)
  assert.ok(!rB.state.huWait.includes(1), '同番点炮被过水挡住，不再给「胡」')
  assert.equal(legalActions(rB.state, 1).length, 0, 'seat1 拿不到胡按钮')

  // (c) 番更大：碰碰胡 1 番 > 已放弃的 0 番 → 仍可胡
  const c0 = fastForward(1152)
  setupTable(c0, { turn: 2, drawnTile: T(9), specs: { 1: H1_PENGPENGHU, 2: NO_TONG_DISCARDER } })
  c0.players[1].passHu = { fan: 0, tile: W(9) } // 之前放弃过一次 0 番点炮胡
  const rC = dispatch(c0, { type: 'discard', seat: 2, tile: T(9), actionId: yqid('t15-d3'), stateVersion: c0.version })
  assert.ok(rC.ok, `番更大场景出牌失败: ${rC.error}`)
  assert.ok(rC.state.huWait.includes(1), '番更大的炮（碰碰胡 1 番 > 0 番）仍可胡')
  assert.ok(legalActions(rC.state, 1).some(o => o.type === 'hu'))
  conservation(rB.state, 'TEST15b')
  conservation(rC.state, 'TEST15c')
})

console.log(`\n=== 全部通过：${passed} 项 ===`)

// ============================================================
// 12. 适配层全链路（local-game.js）：人机对局 + 存档恢复
// ============================================================
console.log('=== 适配层全链路（异步） ===')

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** 用 AI 模拟人类玩家（座位 0），走 adapter 完整链路打完一局 */
async function adapterPlay(seed, { saveAtStep, maxSteps = 4000 } = {}) {
  const events = []
  const game = createLocalGame({
    seed,
    aiLevel: 'normal',
    speed: 0,
    onEvent: ev => events.push(ev.type)
  })
  const humanRng = mulberry32((seed ^ 0x5bf03635) >>> 0)
  let steps = 0
  let saved = null
  while (!game.finished() && steps < maxSteps) {
    steps++
    if (saveAtStep != null && steps === saveAtStep) {
      // 模拟刷新：导出存档 → 销毁 → 用存档重建
      saved = game.exportState()
      game.dispose()
      break
    }
    const v = game.view()
    const action = aiDecide(v, 'normal', humanRng)
    if (action) game.dispatch({ seat: 0, ...action })
    await sleep(1) // 让 AI 定时器推进
  }
  if (saved != null) {
    // 从存档续打到结束
    const game2 = createLocalGame({
      restoreState: saved,
      aiLevel: 'normal',
      speed: 0,
      onEvent: ev => events.push(ev.type)
    })
    let steps2 = 0
    while (!game2.finished() && steps2 < maxSteps) {
      steps2++
      const v = game2.view()
      const action = aiDecide(v, 'normal', humanRng)
      if (action) game2.dispatch({ seat: 0, ...action })
      await sleep(1)
    }
    game2.dispose()
    assert.ok(game2.finished(), '存档恢复后应能打完')
    return { finished: true, resumed: true, events, steps: steps + steps2 }
  }
  game.dispose()
  return { finished: game.finished(), resumed: false, events, steps }
}

const results = await Promise.all([adapterPlay(2026), adapterPlay(2027), adapterPlay(2028, { saveAtStep: 40 })])
assert.ok(results.every(r => r.finished), '三局人机对局都应打完')
assert.ok(results[2].resumed, '第三局应验证存档恢复')
assert.ok(results.every(r => r.events.includes('deal')))
// suggest 全程不抛错且格式正确（抽一局验证）
{
  const game = createLocalGame({ seed: 99, aiLevel: 'hard', speed: 0 })
  const s = game.suggest()
  assert.ok(s === null || (typeof s.text === 'string' && s.text.length > 0))
  game.dispose()
}
console.log('  ✓ 适配层：3 局人机对局打完（含 1 局中途存档恢复续打）、suggest 可用')
console.log(`\n=== 全部通过：${passed + 1} 项 ===`)
