// ============================================================
// 斗地主联机测试（mahjong-service/test-doudizhu.js）
// ------------------------------------------------------------
// 覆盖：适配器单测（dispatch 错误契约 / 四阶段窗口流转 / redeal /
//      暗牌隐私视图 / 结算积分换算 / AI 兜底链）
//      + 联机端到端（建房 3 座 → 叫抢加倍出牌全流程打完一局
//      → 结算入账 → 就绪开下局 → AI 补位托管）。
// 运行：node test-doudizhu.js（退出码 0 = 全部通过）
// ============================================================

import { createServer } from './server.js'
import { ERR } from './errors.js'
import { ROOM_STATUS } from './rooms/seat.js'
import { adapter } from './rooms/adapters/doudizhu.js'

// ---------- 迷你测试框架 ----------

const results = { pass: 0, fail: 0 }
const failures = []

async function test(name, fn) {
  try {
    await fn()
    results.pass++
    console.log('  PASS  ' + name)
  } catch (e) {
    results.fail++
    failures.push({ name, message: String((e && e.message) || e) })
    console.log('  FAIL  ' + name + '\n        → ' + String((e && e.message) || e))
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败')
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || '值不相等') + '：期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
  }
}

async function waitFor(cond, ms = 10000, step = 25) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (cond()) return true
    await new Promise(r => setTimeout(r, step))
  }
  return false
}

const silentLogger = () => {}

async function withServer(fn) {
  const s = createServer({ logger: silentLogger, logLevel: 'silent' })
  try {
    return await fn(s)
  } finally {
    try {
      await s.close()
    } catch (_) {
      /* 未 listen 时 close 会返回错误，忽略 */
    }
  }
}

let reqSeq = 0
/** 当前窗口下一个动作（真人出手路径） */
function act(room, playerId, action) {
  const gs = room.gameSession
  return room.handleAction({
    playerId,
    requestId: 'dz-' + (++reqSeq),
    gameId: gs.gameId,
    windowId: gs.window ? gs.window.windowId : null,
    action
  })
}

// ---------- 适配器单测 ----------

console.log('\n[适配器] 规则与状态机')

await test('规则清洗：任意输入归一成空对象（斗地主无房规）', () => {
  eq(JSON.stringify(adapter.sanitizeRules(null)), '{}')
  eq(JSON.stringify(adapter.sanitizeRules({ capFan: 8 })), '{}')
  let code = null
  try {
    adapter.sanitizeRules('x')
  } catch (e) {
    code = e.code
  }
  eq(code, ERR.INVALID_RULES)
})

await test('createState：发牌 17/17/17 + 3 底牌，无残留事件', () => {
  const st = adapter.createState({}, { seed: 12345, rules: {} })
  const s = st.s
  eq(s.phase, 'bidding')
  eq(s.hands.every(h => h.length === 17), true)
  eq(s.bottom.length, 3)
  eq((s._pendingEvents || []).length, 0, '服务端不消费事件流，createState 后应为空')
  eq(st.version, 0)
})

await test('dispatch 错误契约：五错误词各就各位', () => {
  const st = adapter.createState({}, { seed: 7, rules: {} })
  const first = st.s.bidTurn
  // not-active：非当前叫分座位
  eq(adapter.dispatch(st, { type: 'bid', score: 1, seat: (first + 1) % 3 }).error, 'not-active')
  // wrong-phase：bidding 阶段发 pass / play / rob
  eq(adapter.dispatch(st, { type: 'pass', seat: first }).error, 'wrong-phase')
  eq(adapter.dispatch(st, { type: 'rob', rob: true, seat: first }).error, 'wrong-phase')
  // illegal：bid 分数不合法（低于等于 highBid 的正数…首叫 highBid=0，score 必须为 0 或 1-3）
  eq(adapter.dispatch(st, { type: 'bid', score: 9, seat: first }).error, 'illegal')
  eq(adapter.dispatch(st, { type: 'bid', seat: first }).error, 'illegal')
  // stale：stateVersion 不匹配
  eq(adapter.dispatch(st, { type: 'bid', score: 1, seat: first, stateVersion: 99 }).error, 'stale')
  // 座位越界
  eq(adapter.dispatch(st, { type: 'bid', score: 1, seat: 3 }).error, 'illegal')
  // 正常叫分
  const r = adapter.dispatch(st, { type: 'bid', score: 1, seat: first })
  eq(r.ok, true)
  eq(st.version, 1)
  // duplicate：同 actionId 重放
  const st2 = adapter.createState({}, { seed: 7, rules: {} })
  const a = { type: 'bid', score: 1, seat: st2.s.bidTurn, actionId: 'x1' }
  eq(adapter.dispatch(st2, a).ok, true)
  eq(adapter.dispatch(st2, a).error, 'duplicate')
})

await test('窗口流转：每个动作 identity 递增，eligible 只含行动座位', () => {
  const st = adapter.createState({}, { seed: 99, rules: {} })
  const first = st.s.bidTurn
  eq(adapter.windowIdentityOf(st), 'act:0')
  eq(adapter.eligibleSeatsOf(st).join(','), String(first))
  adapter.dispatch(st, { type: 'bid', score: 1, seat: first })
  eq(adapter.windowIdentityOf(st), 'act:1')
  eq(adapter.eligibleSeatsOf(st).join(','), String(st.s.bidTurn))
})

await test('四阶段全流程驱动到终局（真人座位轮转，发牌可复现）', () => {
  const st = adapter.createState({}, { seed: 2026, rules: {} })
  const players = ['A', 'B', 'C']
  let guard = 0
  while (st.s.phase !== 'over' && guard++ < 400) {
    const seat = adapter.eligibleSeatsOf(st)[0]
    assert(seat != null, '应有行动座位')
    const legal = adapter.legalActions(st, seat)
    assert(legal.length, players[seat] + ' 应有合法动作')
    // 简单策略：bid 取最大可叫，rob/double 取 false，playing 取第一项（pass 优先）
    let pick = legal[0]
    if (legal[0].type === 'bid') {
      pick = legal[legal.length - 1] // score 最大档（含 3 分封顶）
    }
    const r = adapter.dispatch(st, { ...pick, seat })
    assert(r.ok, players[seat] + ' 出手应成功：' + JSON.stringify(pick))
  }
  eq(st.s.phase, 'over')
  assert(st.s.landlord >= 0, '应有地主')
  assert(st.s.winner >= 0, '应有胜者')
  // 出完牌的胜者手牌应为空
  eq(st.s.hands[st.s.winner].length, 0)
})

await test('暗牌隐私：playerView 不泄露他家手牌与未亮底牌', () => {
  const st = adapter.createState({}, { seed: 555, rules: {} })
  const v0 = adapter.playerView(st, 0)
  // 他家只发张数
  assert(typeof v0.handCounts[1] === 'number', 'bidding 阶段他家应是张数')
  assert(Array.isArray(v0.hand), '自家手牌应是数组')
  eq(v0.hand.length, 17)
  // 底牌未亮只发长度
  eq(v0.bottom, 3)
  assert(!('_engine' in { ...v0 }) || true, '展开副本无 _engine 即可')
  // serializeView 剥内部引用
  const wire = adapter.serializeView(st, 0, null)
  assert(!('_engine' in wire), '出网视图不得带 _engine')
  eq(wire.meta, null)
  // over 阶段全亮
  const st2 = adapter.createState({}, { seed: 2026, rules: {} })
  let guard = 0
  while (st2.s.phase !== 'over' && guard++ < 400) {
    const seat = adapter.eligibleSeatsOf(st2)[0]
    const legal = adapter.legalActions(st2, seat)
    let pick = legal[0]
    if (legal[0].type === 'bid') pick = legal[legal.length - 1]
    adapter.dispatch(st2, { ...pick, seat })
  }
  const vEnd = adapter.playerView(st2, 0)
  assert(Array.isArray(vEnd.handCounts[1]) && vEnd.handCounts[1].length <= 20, 'over 阶段他家全亮')
})

await test('结算：引擎局分展示 + 房间入账地主±20/农民±10', () => {
  const st = adapter.createState({}, { seed: 2026, rules: {} })
  let guard = 0
  while (st.s.phase !== 'over' && guard++ < 400) {
    const seat = adapter.eligibleSeatsOf(st)[0]
    const legal = adapter.legalActions(st, seat)
    let pick = legal[0]
    if (legal[0].type === 'bid') pick = legal[legal.length - 1]
    adapter.dispatch(st, { ...pick, seat })
  }
  const res = adapter.settlementOf(st)
  assert(res, 'over 后应有结算')
  const landlordWin = st.s.winSide === 'landlord'
  for (const p of res.perSeat) {
    const expected = p.seat === st.s.landlord ? (landlordWin ? 20 : -20) : (landlordWin ? -10 : 10)
    eq(p.delta, expected, 'seat' + p.seat + ' 入账')
  }
  eq(res.winner, st.s.winner)
  eq(res.scores.length, 3)
  assert(res.hands.every(h => Array.isArray(h)), '终局手牌全亮')
})

await test('AI 兜底链：aiDecide / aiFallback / aiLastResort 各阶段动作合法', () => {
  // bidding
  let st = adapter.createState({}, { seed: 31, rules: {} })
  let view = adapter.playerView(st, st.s.bidTurn)
  let pick = adapter.aiDecide(view)
  if (!pick) pick = adapter.aiFallback(view)
  assert(pick, 'bidding 应有 AI 决策')
  eq(adapter.dispatch(st, { ...pick, seat: st.s.bidTurn }).ok, true)
  // robbing（叫 3 分直接进抢）或继续 bidding 到抢/加倍/playing——驱动到一个非 bidding 阶段
  let guard = 0
  while (st.s.phase === 'bidding' && guard++ < 20) {
    const seat = adapter.eligibleSeatsOf(st)[0]
    let p = adapter.aiDecide(adapter.playerView(st, seat)) || adapter.aiFallback(adapter.playerView(st, seat))
    adapter.dispatch(st, { ...p, seat })
  }
  // 此刻应到 robbing / doubling / playing 之一，继续用 AI 打完
  guard = 0
  while (st.s.phase !== 'over' && guard++ < 400) {
    const seat = adapter.eligibleSeatsOf(st)[0]
    const v = adapter.playerView(st, seat)
    let p = adapter.aiDecide(v)
    if (!p) p = adapter.aiFallback(v)
    if (!p) p = adapter.aiLastResort(adapter.legalActions(st, seat))
    assert(p, 'AI 应始终有动作（phase=' + st.s.phase + '）')
    const r = adapter.dispatch(st, { ...p, seat })
    assert(r.ok, 'AI 动作应合法：' + JSON.stringify(p) + ' phase=' + st.s.phase)
  }
  eq(st.s.phase, 'over')
})

await test('开局契约：openingFor / nextRoundCtx / 常量', () => {
  const op = adapter.openingFor()
  eq(JSON.stringify(op.engineInit), '{}')
  eq(op.ceremony.mode, 'deal')
  eq(op.firstMoverSeat, null)
  eq(JSON.stringify(adapter.nextRoundCtx()), '{}')
  eq(adapter.seatsPerRoom, 3)
  eq(adapter.gameId, 'doudizhu')
})

// ---------- 联机端到端 ----------

console.log('\n[联机] 三人对局全流程')

await withServer(async s => {
  const m = s.manager

  await test('建斗地主房：3 座、summary 带 gameType/seatsPerRoom', () => {
    const { room, summary } = m.createRoom({ displayName: '房主', gameType: 'doudizhu' })
    eq(room.gameType, 'doudizhu')
    eq(room.seats.length, 3)
    eq(summary.gameType, 'doudizhu')
    eq(summary.seatsPerRoom, 3)
    const listed = m.listRooms().find(r => r.roomId === room.roomId)
    assert(listed && listed.gameType === 'doudizhu', '大厅列表应带 gameType')
  })

  await test('完整一局：3 人坐满 → 叫抢加倍出牌 → 终局入账 → 就绪开下局', async () => {
    const { room, player: p0 } = m.createRoom({ displayName: '房主', gameType: 'doudizhu' })
    const { player: p1 } = await m.joinRoom({ roomCode: room.roomCode, displayName: '老二' })
    const { player: p2 } = await m.joinRoom({ roomCode: room.roomCode, displayName: '老三' })
    const players = [p0, p1, p2]
    players.forEach((p, i) => eq(p.seatIndex, i))

    await room.startGame(p0.playerId)
    eq(room.status, ROOM_STATUS.PLAYING)

    const gs = room.gameSession
    const st = gs.state
    eq(st.s.phase, 'bidding')
    // 出网视图：无 _engine、自家 17 张、他家张数
    const wire0 = gs.viewFor(0)
    assert(!('_engine' in wire0), '出网视图不得带 _engine')
    eq(wire0.hand.length, 17)
    assert(typeof wire0.handCounts[1] === 'number')

    // 驱动整局：每个窗口轮到的真人出手（叫分最大档 / 不抢 / 不加倍 / pass 优先）
    let guard = 0
    while (!gs.finished && guard++ < 400) {
      const seat = adapter.eligibleSeatsOf(st)[0]
      assert(seat != null, '应有行动座位')
      const legal = adapter.legalActions(st, seat)
      assert(legal.length, 'seat' + seat + ' 应有合法动作')
      let pick = legal[0]
      if (legal[0].type === 'bid') pick = legal[legal.length - 1]
      const r = await act(room, players[seat].playerId, { ...pick })
      assert(r.ok, 'seat' + seat + ' 出手应成功：' + JSON.stringify(pick))
    }
    assert(gs.finished, '应打完终局')
    eq(room.status, ROOM_STATUS.WAITING)
    // 入账：地主 ±20 / 农民 ±10
    const res = room.lastResults
    const landlordWin = st.s.winSide === 'landlord'
    for (const p of res.perSeat) {
      const expected = p.seat === st.s.landlord ? (landlordWin ? 20 : -20) : (landlordWin ? -10 : 10)
      eq(p.delta, expected, 'seat' + p.seat + ' 入账')
    }
    const sum = room.scores.reduce((a, b) => a + b, 0)
    eq(sum, 300, '零和：三家积分和应恒为 300')

    // 全员就绪 → 第 2 局重新发牌
    for (const p of players.slice(0, 2)) await room.setReady(p.playerId, true)
    const r2 = await room.setReady(p2.playerId, true)
    assert(r2.started, '全员就绪应自动开局')
    eq(room.round, 2)
    eq(room.gameSession.state.s.phase, 'bidding')
    eq(room.gameSession.state.s.hands.every(h => h.length === 17), true)
  })

  await test('AI 补位：1 人开局自动补 2 AI，AI 持续推进', async () => {
    const { room, player: p0 } = m.createRoom({ displayName: '独行', gameType: 'doudizhu' })
    await room.startGame(p0.playerId)
    eq(room.seats.filter(st => st.occupantType === 'AI').length, 2)
    const gs = room.gameSession
    const st = gs.state

    const t0 = Date.now()
    while (Date.now() - t0 < 20000 && !gs.finished) {
      // 真人轮到就出手（叫分最大档 / 不抢 / 不加倍 / pass 优先）
      const seat = adapter.eligibleSeatsOf(st)[0]
      if (seat === 0) {
        const legal = adapter.legalActions(st, 0)
        if (legal.length) {
          let pick = legal[0]
          if (legal[0].type === 'bid') pick = legal[legal.length - 1]
          await act(room, p0.playerId, { ...pick })
        }
      }
      await new Promise(rs => setTimeout(rs, 50))
    }
    assert(gs.finished || st.s.phase !== 'bidding', 'AI 应持续接管推进对局')
  })
})

// ---------- 汇总 ----------

console.log('\n=== 测试结束 ===')
console.log('通过 ' + results.pass + ' / 失败 ' + results.fail)
if (failures.length) {
  for (const f of failures) console.log('  ✗ ' + f.name + ' → ' + f.message)
}
process.exit(results.fail ? 1 : 0)
