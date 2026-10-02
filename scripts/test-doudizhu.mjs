// 经典斗地主引擎 / AI 契约测试（node --test）
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createGame, dispatch, playerView, settlementOf,
  classifyCombo, canBeat, enumerateCombos, rankOf
} from '../.vuepress/components/doudizhu/engine.mjs'
import { aiDecide, evaluateBid, handsCount, hintPlay } from '../.vuepress/components/doudizhu/ai.js'

// 组牌工具：按点数造牌，同点多次出现依次取不同花色
const Cs = (...rs) => {
  const seen = {}
  return rs.map(r => {
    if (r >= 16) return r === 16 ? 52 : 53
    const k = seen[r] || 0
    seen[r] = k + 1
    return (r - 3) * 4 + k
  })
}

// ---------------- 牌型识别 ----------------
test('classify: 基础牌型', () => {
  assert.deepEqual(classifyCombo(Cs(5)), { type: 'single', rank: 5, length: 1 })
  assert.deepEqual(classifyCombo(Cs(9, 9)), { type: 'pair', rank: 9, length: 2 })
  assert.deepEqual(classifyCombo(Cs(12, 12, 12)), { type: 'triple', rank: 12, length: 3 })
  assert.deepEqual(classifyCombo(Cs(7, 7, 7, 7)), { type: 'bomb', rank: 7, length: 4 })
  assert.deepEqual(classifyCombo([52, 53]), { type: 'rocket', rank: 17, length: 2 })
  assert.deepEqual(classifyCombo(Cs(10, 10, 10, 4)), { type: 'trio_solo', rank: 10, length: 4 })
  assert.deepEqual(classifyCombo(Cs(6, 6, 6, 13, 13)), { type: 'trio_pair', rank: 6, length: 5 })
})

test('classify: 顺子 / 连对 / 飞机', () => {
  assert.deepEqual(classifyCombo(Cs(3, 4, 5, 6, 7)), { type: 'straight', rank: 7, length: 5 })
  assert.deepEqual(classifyCombo(Cs(10, 11, 12, 13, 14)), { type: 'straight', rank: 14, length: 5 })
  assert.equal(classifyCombo(Cs(11, 12, 13, 14, 15)), null, '2 不能进顺子')
  assert.equal(classifyCombo(Cs(3, 4, 5, 6)), null, '顺子至少 5 张')
  assert.deepEqual(classifyCombo(Cs(3, 3, 4, 4, 5, 5)), { type: 'pair_seq', rank: 5, length: 6 })
  assert.equal(classifyCombo(Cs(13, 13, 14, 14, 15, 15)), null, '2 不能进连对')
  assert.equal(classifyCombo(Cs(3, 3, 4, 4)), null, '连对至少 3 对')
  assert.deepEqual(classifyCombo(Cs(3, 3, 3, 4, 4, 4)), { type: 'plane', rank: 4, length: 6 })
  assert.deepEqual(classifyCombo(Cs(5, 5, 5, 6, 6, 6, 9, 12)), { type: 'plane_solo', rank: 6, length: 8 })
  assert.equal(classifyCombo(Cs(5, 5, 5, 6, 6, 6, 9, 9)), null, '飞机带单的翅膀不能成对')
  assert.deepEqual(classifyCombo(Cs(5, 5, 5, 6, 6, 6, 9, 9, 12, 12)), { type: 'plane_pair', rank: 6, length: 10 })
  assert.equal(classifyCombo(Cs(14, 14, 14, 15, 15, 15)), null, '2 不能进飞机')
})

test('classify: 四带', () => {
  assert.deepEqual(classifyCombo(Cs(8, 8, 8, 8, 3, 13)), { type: 'quad_solo', rank: 8, length: 6 })
  assert.deepEqual(classifyCombo(Cs(8, 8, 8, 8, 3, 3)), { type: 'quad_solo', rank: 8, length: 6 }, '四带二可带一对')
  assert.deepEqual(classifyCombo(Cs(8, 8, 8, 8, 3, 3, 13, 13)), { type: 'quad_pair', rank: 8, length: 8 })
  assert.equal(classifyCombo(Cs(8, 8, 8, 8, 3, 13, 13, 13)), null, '四带二对的翅膀必须是对子')
})

test('canBeat: 比较规则', () => {
  const rocket = classifyCombo([52, 53])
  const bomb5 = classifyCombo(Cs(5, 5, 5, 5))
  const bomb9 = classifyCombo(Cs(9, 9, 9, 9))
  assert.ok(canBeat(rocket, bomb9))
  assert.ok(canBeat(bomb5, classifyCombo(Cs(14))))
  assert.ok(canBeat(bomb9, bomb5))
  assert.ok(!canBeat(bomb9, rocket))
  assert.ok(canBeat(classifyCombo(Cs(14)), classifyCombo(Cs(13))))
  assert.ok(!canBeat(classifyCombo(Cs(4, 5, 6, 7, 8)), classifyCombo(Cs(5, 6, 7, 8, 9))))
  assert.ok(!canBeat(classifyCombo(Cs(4, 5, 6, 7, 8)), classifyCombo(Cs(9, 9))), '牌型不同不能压')
  assert.ok(!canBeat(classifyCombo(Cs(3, 3, 4, 4, 5, 5)), classifyCombo(Cs(4, 4, 5, 5, 6, 6, 7, 7))), '长度不同不能压')
})

// ---------------- 叫分流程 ----------------
test('bidding: 叫 3 分立即成地主并拿底牌', () => {
  let s = createGame({ seed: 42 })
  const first = s.bidTurn
  let r = dispatch(s, { type: 'bid', score: 3 }, first)
  assert.ok(r.ok)
  assert.equal(s.phase, 'playing')
  assert.equal(s.landlord, first)
  assert.equal(s.calledScore, 3)
  assert.equal(s.hands[first].length, 20)
  assert.equal(s.turn, first)
  assert.ok(r.events.some(e => e.type === 'landlord' && e.bottom.length === 3))
})

test('bidding: 最高叫分者成地主；低分不能再叫', () => {
  let s = createGame({ seed: 7 })
  const [a, b, c] = [s.bidTurn, (s.bidTurn + 1) % 3, (s.bidTurn + 2) % 3]
  assert.ok(dispatch(s, { type: 'bid', score: 1 }, a).ok)
  assert.ok(dispatch(s, { type: 'bid', score: 2 }, b).ok)
  assert.ok(!dispatch(s, { type: 'bid', score: 1 }, c).ok, '必须叫得更高')
  assert.ok(dispatch(s, { type: 'bid', score: 0 }, c).ok)
  assert.ok(dispatch(s, { type: 'bid', score: 0 }, a).ok)
  assert.equal(s.phase, 'playing')
  assert.equal(s.landlord, b)
  assert.equal(s.calledScore, 2)
})

test('bidding: 全部不叫重发，三轮后首家强制 1 分', () => {
  let s = createGame({ seed: 99 })
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 3 && s.phase === 'bidding'; i++) {
      const r = dispatch(s, { type: 'bid', score: 0 }, s.bidTurn)
      assert.ok(r.ok)
    }
  }
  assert.equal(s.phase, 'playing')
  assert.equal(s.calledScore, 1)
  assert.equal(s.redealCount, 3)
})

// ---------------- 出牌规则 ----------------
function playingState(seed = 5) {
  const s = createGame({ seed })
  dispatch(s, { type: 'bid', score: 3 }, s.bidTurn)
  return s
}

test('play: 首出自由，跟牌必须压过或不出，两不出后清圈', () => {
  const s = playingState()
  const lord = s.landlord
  assert.equal(s.turn, lord)
  assert.ok(!dispatch(s, { type: 'pass' }, lord).ok, '首出不能不出')
  // 出一手最小单张
  const hand = s.hands[lord]
  const single = hand.filter(c => rankOf(c) === rankOf(hand[hand.length - 1])).slice(0, 1)
  assert.ok(dispatch(s, { type: 'play', cards: single }, lord).ok)
  const next = s.turn
  assert.notEqual(next, lord)
  // 用小牌压不过
  const low = s.hands[next].filter(c => rankOf(c) < rankOf(single[0]))
  if (low.length) assert.ok(!dispatch(s, { type: 'play', cards: [low[0]] }, next).ok)
  assert.ok(dispatch(s, { type: 'pass' }, next).ok)
  const third = s.turn
  assert.ok(dispatch(s, { type: 'pass' }, third).ok)
  assert.equal(s.turn, lord, '两不出后回到首出者')
  assert.equal(s.lastPlay, null, '清圈后自由出牌')
})

test('play: 牌不在手中 / 牌型非法 / 非轮次 都被拒绝', () => {
  const s = playingState()
  const lord = s.landlord
  const other = (lord + 1) % 3
  assert.ok(!dispatch(s, { type: 'play', cards: [s.hands[other][0]] }, lord).ok, '不能出别人的牌')
  assert.ok(!dispatch(s, { type: 'play', cards: [s.hands[lord][0]] }, other).ok, '非轮次不能出')
  assert.ok(!dispatch(s, { type: 'play', cards: s.hands[lord].slice(0, 2) }, lord).ok || classifyCombo(s.hands[lord].slice(0, 2)), '非法牌型被拒')
  assert.ok(!dispatch(s, { type: 'bid', score: 1 }, lord).ok, '出牌阶段不能叫分')
})

test('settlement: 地主胜得分 = 2×底分×倍数，农民各 -底分×倍数', () => {
  const s = playingState(11)
  // 直接构造终局：地主一手出完
  const lord = s.landlord
  s.hands[lord] = Cs(3)
  s.hands[(lord + 1) % 3] = Cs(5, 6, 7)
  s.hands[(lord + 2) % 3] = Cs(8, 9, 10)
  const r = dispatch(s, { type: 'play', cards: Cs(3) }, lord)
  assert.ok(r.ok)
  assert.equal(s.phase, 'over')
  assert.equal(s.winner, lord)
  assert.equal(s.winSide, 'landlord')
  assert.ok(s.spring, '两农民一张未出应为春天')
  const st = settlementOf(s)
  assert.equal(st.scores[lord], 3 * 1 * 2 * 2, '底分3×春天2倍×地主2家')
  assert.equal(st.scores[(lord + 1) % 3], -3 * 1 * 2)
  assert.equal(st.scores.reduce((a, b) => a + b, 0), 0, '零和')
})

test('settlement: 炸弹翻倍', () => {
  const s = playingState(13)
  const lord = s.landlord
  s.hands[lord] = Cs(6, 6, 6, 6, 3)
  dispatch(s, { type: 'play', cards: Cs(6, 6, 6, 6) }, lord)
  assert.equal(s.multiplier, 2)
  dispatch(s, { type: 'pass' }, s.turn)
  dispatch(s, { type: 'pass' }, s.turn)
  dispatch(s, { type: 'play', cards: Cs(3) }, lord)
  const st = settlementOf(s)
  assert.equal(st.bombs, 1)
  assert.equal(st.multiplier, 4, '炸弹×2 + 春天×2')
})

// ---------------- 确定性 ----------------
test('determinism: 同 seed 同牌局', () => {
  const a = createGame({ seed: 123 })
  const b = createGame({ seed: 123 })
  assert.deepEqual(a.hands, b.hands)
  assert.deepEqual(a.bottom, b.bottom)
  assert.equal(a.bidTurn, b.bidTurn)
  const c = createGame({ seed: 124 })
  assert.notDeepEqual(a.hands, c.hands)
})

test('state: 可 JSON 序列化（联机预留）', () => {
  const s = playingState(17)
  const copy = JSON.parse(JSON.stringify(s))
  assert.equal(copy.landlord, s.landlord)
  assert.deepEqual(copy.hands, s.hands)
})

// ---------------- AI ----------------
test('ai: 叫分在合法范围内，牌好叫高分', () => {
  const strong = Cs(15, 15, 14, 14, 13, 13, 12, 12, 10, 10, 10, 9, 9, 9, 52, 53, 8)
  assert.ok(evaluateBid(strong) >= 2)
  const weak = Cs(3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 3, 4, 6, 8, 9, 11, 13)
  assert.ok(evaluateBid(weak) <= 1)
})

test('ai: 每个决策都是合法动作（200 局随机 seed 完整打满）', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = createGame({ seed })
    let guard = 0
    while (s.phase !== 'over' && guard++ < 2000) {
      const seat = s.phase === 'bidding' ? s.bidTurn : s.turn
      const view = playerView(s, seat)
      const act = aiDecide(view, seat)
      assert.ok(act, `seed=${seed} AI 必须给出动作`)
      const r = dispatch(s, act, seat)
      assert.ok(r.ok, `seed=${seed} AI 动作必须合法: ${JSON.stringify(act)} phase=${s.phase}`)
    }
    assert.equal(s.phase, 'over', `seed=${seed} 对局必须收敛`)
    assert.equal(s.scores.reduce((a, b) => a + b, 0), 0, '零和')
    assert.ok(s.hands[s.winner].length === 0)
  }
})

test('ai: 农民不压队友的大牌', () => {
  // 构造：0 地主已出牌被队友 2 用 K 压住，1 号农民应手
  const s = playingState(21)
  const lord = s.landlord
  const f1 = (lord + 1) % 3
  const f2 = (lord + 2) % 3
  s.hands[f1] = Cs(14, 5, 6, 7, 8, 9)
  s.lastPlay = { seat: f2, combo: classifyCombo(Cs(13)), cards: Cs(13) }
  s.turn = f1
  s.passCount = 1 // 地主已 pass
  s.trickPasses = [lord]
  const act = aiDecide(playerView(s, f1), f1)
  assert.deepEqual(act, { type: 'pass' }, '队友的 K 且地主已 pass，应放行')
})

test('ai: 地主报单时农民会拦截', () => {
  const s = playingState(23)
  const lord = s.landlord
  const f1 = (lord + 1) % 3
  const f2 = (lord + 2) % 3
  s.hands[f1] = Cs(14, 5, 6, 7, 8, 9)
  s.hands[lord] = Cs(3, 15)
  s.lastPlay = { seat: f2, combo: classifyCombo(Cs(7)), cards: Cs(7) }
  s.turn = f1
  s.passCount = 0
  s.trickPasses = []
  const act = aiDecide(playerView(s, f1), f1)
  assert.equal(act.type, 'play', '地主报双，必须压过队友的小牌拦截')
  assert.ok(canBeat(classifyCombo(act.cards), classifyCombo(Cs(7))), '拦截牌必须压过 7')
})

test('hint: 提示返回合法可出的牌', () => {
  const s = playingState(29)
  const seat = s.turn
  const view = playerView(s, seat)
  const cards = hintPlay(view, view.hand, null)
  assert.ok(cards && cards.length)
  assert.ok(classifyCombo(cards), '提示必须是合法牌型')
  const r = dispatch(s, { type: 'play', cards }, seat)
  assert.ok(r.ok, '提示必须能直接出')
})

test('enumerate: 组合枚举个数合理且去重', () => {
  const hand = Cs(3, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 52)
  const combos = enumerateCombos(hand)
  const keys = new Set(combos.map(c => c.cards.join(',')))
  assert.equal(keys.size, combos.length, '无重复')
  assert.ok(combos.every(c => classifyCombo(c.cards)), '枚举结果皆合法牌型')
  assert.ok(handsCount(hand) >= 1)
})

test('ai: 队友的小牌权也不抢（地主未表态、地主不急）', () => {
  // 队友 2 出小对 9，农民 1 手上有对 Q，地主还有 10 张 → 应放行让队友继续走
  const s = playingState(31)
  const lord = s.landlord
  const f1 = (lord + 1) % 3
  const f2 = (lord + 2) % 3
  s.hands[f1] = Cs(12, 12, 5, 6, 7, 8, 9)
  s.hands[lord] = Cs(3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
  s.lastPlay = { seat: f2, combo: classifyCombo(Cs(9, 9)), cards: Cs(9, 9) }
  s.turn = f1
  s.passCount = 0
  s.trickPasses = []
  const act = aiDecide(playerView(s, f1), f1)
  assert.deepEqual(act, { type: 'pass' }, '队友的牌权不抢，对 Q 应留着')
})

test('ai: 首出不打四带二', () => {
  // 手牌 8888+3+K+5：四带二（8888+3+5）不是一手走完，不得作为首出
  const s = playingState(33)
  const seat = s.turn
  s.hands[seat] = Cs(8, 8, 8, 8, 3, 13, 5)
  s.lastPlay = null
  const act = aiDecide(playerView(s, seat), seat)
  assert.equal(act.type, 'play')
  const combo = classifyCombo(act.cards)
  assert.ok(combo.type !== 'quad_solo' && combo.type !== 'quad_pair', `首出不应是四带二，实际 ${combo.type}`)
  assert.equal(combo.type, 'single', '这手牌合理首出是最小单张')
})

test('ai: 四带二能一手走完时可以直接出', () => {
  const s = playingState(34)
  const seat = s.turn
  s.hands[seat] = Cs(8, 8, 8, 8, 3, 5)
  s.lastPlay = null
  const act = aiDecide(playerView(s, seat), seat)
  assert.equal(act.type, 'play')
  assert.equal(classifyCombo(act.cards).type, 'quad_solo', '一手走完不受首出限制')
})

test('ai: 首出优先带走最小散牌（不孤留 3）', () => {
  // 手牌 3,K,7,7：出单 3 能把最小散牌带走，而不是先飞 K 留个 3
  const s = playingState(35)
  const seat = s.turn
  s.hands[seat] = Cs(3, 13, 7, 7)
  s.lastPlay = null
  const act = aiDecide(playerView(s, seat), seat)
  assert.equal(act.type, 'play')
  const combo = classifyCombo(act.cards)
  assert.equal(combo.type, 'single', '应出单张')
  assert.equal(combo.rank, 3, '应先出 3 带走最小散牌，而不是 K')
})

test('ai: 不用大牌单飞开局（有更小单张时）', () => {
  // 手牌 4,A：两张散单，先出 4 留 A 控制后手
  const s = playingState(36)
  const seat = s.turn
  s.hands[seat] = Cs(4, 14)
  s.lastPlay = null
  const act = aiDecide(playerView(s, seat), seat)
  assert.equal(classifyCombo(act.cards).rank, 4, '先出 4，A 留作控制')
})

test('ai: 对手报单不出小单（有对子时改出对子）', () => {
  // 地主手牌 3,3,4：任一农民（对手）报单时，首出对 3 而不是单 4/单 3 送走
  const s = playingState(37)
  const seat = s.turn // 叫完 3 分后轮到地主先出
  s.hands[seat] = Cs(3, 3, 4)
  const farmer = [0, 1, 2].find(x => x !== seat)
  s.hands[farmer] = [Cs(15)[0]] // 该农民只剩一张 2
  s.lastPlay = null
  const act = aiDecide(playerView(s, seat), seat)
  assert.equal(act.type, 'play')
  const combo = classifyCombo(act.cards)
  assert.equal(combo.type, 'pair', '对手报单时应出对子，不出单张放走')
  assert.equal(combo.rank, 3)
})

test('ai: 对手报单、被迫只剩单张时出最大单', () => {
  // 地主手牌 3,4（两张散单）：农民报单，出 4（大者）而非 3
  const s = playingState(38)
  const seat = s.turn
  s.hands[seat] = Cs(3, 4)
  const farmer = [0, 1, 2].find(x => x !== seat)
  s.hands[farmer] = [Cs(15)[0]]
  s.lastPlay = null
  const act = aiDecide(playerView(s, seat), seat)
  assert.equal(classifyCombo(act.cards).rank, 4, '被迫出单时出最大的，给对手压不穿的机会')
})

test('ai: 队友报单时喂最小单张', () => {
  // 农民手牌 3,3,5，农民队友报单 → 喂单 3（拆对也值）
  const s = playingState(39)
  const farmer = [0, 1, 2].find(x => x !== s.landlord)
  const mate = [0, 1, 2].find(x => x !== farmer && x !== s.landlord)
  s.turn = farmer // 强制轮到该农民出牌
  s.hands[farmer] = Cs(3, 3, 5)
  s.hands[mate] = [Cs(15)[0]] // 队友只剩一张
  s.lastPlay = null
  const act = aiDecide(playerView(s, farmer), farmer)
  assert.equal(act.type, 'play')
  const combo = classifyCombo(act.cards)
  assert.equal(combo.type, 'single', '队友报单应喂单张')
  assert.equal(combo.rank, 3, '喂最小的单张')
})

test('ai: 双三张先出小的三带一（333+散 不拆 JJJ）', () => {
  // 手牌 333 JJJ 7 10 A：应出 333+7（最小三张带最小散牌），
  // 而不是 JJJ+3 把 333 拆散（用户实测吐槽点）
  const s = playingState(40)
  const seat = s.turn
  s.hands[seat] = Cs(3, 3, 3, 11, 11, 11, 7, 10, 14)
  s.lastPlay = null
  const act = aiDecide(playerView(s, seat), seat)
  assert.equal(act.type, 'play')
  const combo = classifyCombo(act.cards)
  assert.equal(combo.type, 'trio_solo', '三张应带单张')
  assert.equal(combo.rank, 3, '先出 333（小的三张），不拆 JJJ')
})

test('ai: 三带一带最小散牌（333+7 而非 333+A）', () => {
  const s = playingState(41)
  const seat = s.turn
  s.hands[seat] = Cs(3, 3, 3, 7, 14, 15)
  s.lastPlay = null
  const act = aiDecide(playerView(s, seat), seat)
  const combo = classifyCombo(act.cards)
  assert.equal(combo.type, 'trio_solo')
  assert.equal(combo.rank, 3)
  // 带的必须是 7（rank 7），不能是 A/2
  const wing = act.cards.find(c => classifyCombo([c]).rank !== 3)
  assert.equal(classifyCombo([wing]).rank, 7, '三带一带最小的散牌 7，不烧 A/2')
})
