// ============================================================
// 五子棋联机测试（mahjong-service/test-gomoku.js）
// ------------------------------------------------------------
// 覆盖：适配器单测（规则清洗 / dispatch 错误契约 / 结算 / 换先）
//      + 联机端到端（建房 2 座 → 落子 → 胜负结算入账 → 就绪开下局换先 → AI 补位）。
// 运行：node test-gomoku.js（退出码 0 = 全部通过）
// ============================================================

import { createServer } from './server.js'
import { ERR } from './errors.js'
import { ROOM_STATUS } from './rooms/seat.js'
import { adapter } from './rooms/adapters/gomoku.js'
import { BLACK, WHITE } from './engine/gomoku/engine.js'

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

async function expectFail(promise, code, msg) {
  try {
    await promise
  } catch (e) {
    if (e.code !== code) throw new Error((msg || '错误码不符') + '：期望 ' + code + '，实际 ' + e.code)
    return e
  }
  throw new Error((msg || '本应失败却成功了') + '：期望错误码 ' + code)
}

async function waitFor(cond, ms = 4000, step = 25) {
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
/** 当前窗口下落一子（真人出手路径） */
function move(room, playerId, x, y) {
  const gs = room.gameSession
  return room.handleAction({
    playerId,
    requestId: 'gk-' + (++reqSeq),
    gameId: gs.gameId,
    windowId: gs.window ? gs.window.windowId : null,
    action: { type: 'move', x, y }
  })
}

// ---------- 适配器单测 ----------

console.log('\n[适配器] 规则与状态机')

await test('规则清洗：缺省 medium；非法 aiLevel 拒收', () => {
  eq(adapter.sanitizeRules(null).aiLevel, 'medium')
  eq(adapter.sanitizeRules({ aiLevel: 'hard' }).aiLevel, 'hard')
  let code = null
  try {
    adapter.sanitizeRules({ aiLevel: 'hell' })
  } catch (e) {
    code = e.code
  }
  eq(code, ERR.INVALID_RULES)
})

await test('createState：先手座执黑，黑棋先行', () => {
  const st = adapter.createState({ firstSeat: 1 })
  eq(st.seatColor[1], BLACK)
  eq(st.seatColor[0], WHITE)
  eq(st.turn, BLACK)
  eq(st.phase, 'play')
  eq(st.version, 0)
})

await test('dispatch 错误契约：not-active / illegal / stale / duplicate / wrong-phase', () => {
  const st = adapter.createState({ firstSeat: 0 })
  // 轮黑（seat0），seat1 抢先 → not-active
  eq(adapter.dispatch(st, { type: 'move', seat: 1, x: 0, y: 0 }).error, 'not-active')
  // 越界 → illegal
  eq(adapter.dispatch(st, { type: 'move', seat: 0, x: 15, y: 0 }).error, 'illegal')
  eq(adapter.dispatch(st, { type: 'move', seat: 0, x: -1, y: 0 }).error, 'illegal')
  // stateVersion 不匹配 → stale
  eq(adapter.dispatch(st, { type: 'move', seat: 0, x: 7, y: 7, stateVersion: 9 }).error, 'stale')
  // 正常落子
  const r1 = adapter.dispatch(st, { type: 'move', seat: 0, x: 7, y: 7, actionId: 'a1' })
  assert(r1.ok, '首子应成功')
  eq(st.turn, WHITE)
  eq(st.version, 1)
  // 同 actionId 再来一次 → duplicate
  eq(adapter.dispatch(st, { type: 'move', seat: 1, x: 0, y: 0, actionId: 'a1' }).error, 'duplicate')
  // 占位 → illegal
  eq(adapter.dispatch(st, { type: 'move', seat: 1, x: 7, y: 7 }).error, 'illegal')
  // 结束后 → wrong-phase
  st.phase = 'finished'
  eq(adapter.dispatch(st, { type: 'move', seat: 1, x: 0, y: 0 }).error, 'wrong-phase')
})

await test('结算：胜 +10 / 负 -10；和棋 0', () => {
  const st = adapter.createState({ firstSeat: 0 })
  st.phase = 'finished'
  st.winner = 1
  let r = adapter.settlementOf(st)
  eq(r.perSeat[0].delta, -10)
  eq(r.perSeat[1].delta, 10)
  st.winner = null
  st.draw = true
  r = adapter.settlementOf(st)
  eq(r.perSeat[0].delta, 0)
  eq(r.perSeat[1].delta, 0)
})

await test('换先：首局房主选边，之后每局互换', () => {
  // 房主（seat0）执黑 → 首局 seat0 先手
  let ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: 'black' }, null, null)
  eq(ctx.firstSeat, 0)
  // 房主执白 → 首局对方先手
  ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: 'white' }, null, null)
  eq(ctx.firstSeat, 1)
  // 未选边默认执黑
  ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: null }, null, null)
  eq(ctx.firstSeat, 0)
  // 次局换先
  ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: 'black' }, { perSeat: [] }, { firstSeat: 0 })
  eq(ctx.firstSeat, 1)
  ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: 'black' }, { perSeat: [] }, { firstSeat: 1 })
  eq(ctx.firstSeat, 0)
})

await test('matchesLegalOption：结构校验（越界拒、非 move 拒）', () => {
  const st = adapter.createState({ firstSeat: 0 })
  const legal = adapter.legalActions(st, 0)
  assert(legal.length === 1 && legal[0].type === 'move', '轮走方应有 move 选项')
  assert(adapter.matchesLegalOption(legal, { type: 'move', x: 7, y: 7 }), '棋盘内应通过')
  assert(!adapter.matchesLegalOption(legal, { type: 'move', x: 15, y: 7 }), '越界应拒')
  assert(!adapter.matchesLegalOption(legal, { type: 'move', x: 1.5, y: 7 }), '非整数应拒')
  assert(!adapter.matchesLegalOption(legal, { type: 'peng' }), '非 move 应拒')
  eq(adapter.legalActions(st, 1).length, 0) // 非轮走方无选项
})

await test('AI 兜底链：aiDecide / aiFallback / aiLastResort 都产出合法落子', () => {
  const st = adapter.createState({ firstSeat: 0 })
  const view = adapter.playerView(st, 0)
  const a1 = adapter.aiDecide(view, 'medium', Math.random)
  assert(a1 && a1.type === 'move' && adapter.matchesLegalOption(view.legal, a1), 'aiDecide 应合法')
  const a2 = adapter.aiFallback(view)
  assert(a2 && a2.type === 'move', 'aiFallback 应产出 move')
  const a3 = adapter.aiLastResort(view.legal)
  assert(a3 && a3.type === 'move' && adapter.matchesLegalOption(view.legal, a3), 'aiLastResort 应合法')
})

// ---------- 联机端到端 ----------

console.log('\n[联机] 双人对局全流程')

await withServer(async s => {
  const m = s.manager

  await test('建五子棋房：2 座、summary 带 gameType/seatsPerRoom', async () => {
    const { room, summary } = m.createRoom({ displayName: '房主', gameType: 'gomoku', hostSide: 'black' })
    eq(room.gameType, 'gomoku')
    eq(room.seats.length, 2)
    eq(summary.gameType, 'gomoku')
    eq(summary.seatsPerRoom, 2)
    const listed = m.listRooms().find(r => r.roomId === room.roomId)
    assert(listed && listed.gameType === 'gomoku', '大厅列表应带 gameType')
  })

  await test('完整一局：黑五连获胜，结算 +10/-10 入账，回 WAITING', async () => {
    const { room, player: p0 } = m.createRoom({ displayName: '房主', gameType: 'gomoku', hostSide: 'black' })
    const { player: p1 } = await m.joinRoom({ roomCode: room.roomCode, displayName: '挑战者' })
    eq(p1.seatIndex, 1)
    // 侦听 GAME_STARTED 广播：应带 gameType + ceremony.firstSeat
    let started = null
    const origBroadcast = s.hub.broadcast.bind(s.hub)
    s.hub.broadcast = (rm, type, payload, extra) => {
      if (type === 'GAME_STARTED' && rm === room) started = payload
      return origBroadcast(rm, type, payload, extra)
    }
    await room.startGame(p0.playerId)
    eq(room.status, ROOM_STATUS.PLAYING)
    assert(started, '应广播 GAME_STARTED')
    eq(started.gameType, 'gomoku')
    eq(started.ceremony && started.ceremony.firstSeat, 0) // 首局房主执黑 → seat0 先手
    eq(room.roundCtx.firstSeat, 0)
    const gs = room.gameSession
    eq(gs.state.seatColor[0], BLACK)
    const view0 = gs.viewFor(0)
    eq(view0.myColor, BLACK)
    eq(view0.meta.firstSeat, 0)
    const view1 = gs.viewFor(1)
    eq(view1.myColor, WHITE)
    eq(view1.legal.length, 0) // 白方等待

    // 非轮走方出手 → NOT_YOUR_TURN
    await expectFail(move(room, p1.playerId, 0, 0), ERR.NOT_YOUR_TURN)

    // 黑：(7,7)(8,7)(9,7)(10,7)(11,7)；白：(0,0)(1,0)(2,0)(3,0)
    const wid1 = gs.window.windowId
    let r = await move(room, p0.playerId, 7, 7)
    assert(r.ok, '黑 1 应成功')
    // 旧 windowId 立即失效
    await expectFail(
      room.handleAction({
        playerId: p1.playerId,
        requestId: 'gk-stale',
        gameId: gs.gameId,
        windowId: wid1,
        action: { type: 'move', x: 0, y: 0 }
      }),
      ERR.ACTION_WINDOW_EXPIRED
    )
    // 幂等：同 requestId 重放 → duplicate
    const dup = await room.handleAction({
      playerId: p0.playerId,
      requestId: 'gk-' + reqSeq, // 上一手黑 1 的 requestId
      gameId: gs.gameId,
      windowId: gs.window.windowId,
      action: { type: 'move', x: 7, y: 7 }
    })
    assert(dup.duplicate === true, '同 requestId 应返回 duplicate')

    await move(room, p1.playerId, 0, 0)
    await move(room, p0.playerId, 8, 7)
    await move(room, p1.playerId, 1, 0)
    await move(room, p0.playerId, 9, 7)
    await move(room, p1.playerId, 2, 0)
    await move(room, p0.playerId, 10, 7)
    await move(room, p1.playerId, 3, 0)
    r = await move(room, p0.playerId, 11, 7)

    eq(gs.finished, true)
    eq(gs.state.winner, 0)
    assert(gs.state.winLine && gs.state.winLine.length >= 5, '应有五连线')
    eq(room.status, ROOM_STATUS.WAITING)
    eq(room.lastResults.perSeat[0].delta, 10)
    eq(room.lastResults.perSeat[1].delta, -10)
    eq(room.scores[0], 110)
    eq(room.scores[1], 90)
    eq(room.lastResults.moves, 9)

    // 终局视图：results 可见
    const fin = gs.viewFor(1)
    assert(fin.results && fin.results.winner === 0, '结算视图应对双方可见')

    // 全员就绪 → 自动开第 2 局并换先
    await room.setReady(p0.playerId, true)
    const r2 = await room.setReady(p1.playerId, true)
    assert(r2.started, '全员就绪应自动开局')
    eq(room.round, 2)
    eq(room.roundCtx.firstSeat, 1) // 换先
    const gs2 = room.gameSession
    eq(gs2.state.seatColor[1], BLACK)
    eq(gs2.state.seatColor[0], WHITE)
    eq(gs2.state.turn, BLACK)
    eq(gs2.state.moves, 0)
    eq(gs2.viewFor(1).meta.firstSeat, 1)
    // 第 2 局 seat1（黑）先行
    const r3 = await move(room, p1.playerId, 7, 7)
    assert(r3.ok, '换先后 seat1 应能先行')
  })

  await test('AI 补位：房主执白 → AI 执黑先行；真人落子后 AI 应手', async () => {
    const { room, player: p0 } = m.createRoom({ displayName: '房主', gameType: 'gomoku', hostSide: 'white' })
    await room.startGame(p0.playerId) // seat1 自动补 AI
    eq(room.seats[1].occupantType, 'AI')
    eq(room.roundCtx.firstSeat, 1) // 房主选白 → AI 座先手
    const gs = room.gameSession
    eq(gs.state.seatColor[1], BLACK)

    // AI 执黑首子（天元），等它落下
    const ok1 = await waitFor(() => gs.state.moves >= 1)
    assert(ok1, 'AI 应先手落子')
    eq(gs.state.board[7][7], BLACK)

    // 真人（白）落子 → AI 应手
    const r = await move(room, p0.playerId, 6, 6)
    assert(r.ok, '白方落子应成功')
    const ok2 = await waitFor(() => gs.state.moves >= 3)
    assert(ok2, 'AI 应手后 moves 应 ≥3')
    eq(gs.state.turn, WHITE) // 又轮回真人
  })

  await test('未注册 gameType 仍拒；缺省仍麻将', () => {
    let code = null
    try {
      m.createRoom({ displayName: 'x', gameType: 'xyz' })
    } catch (e) {
      code = e.code
    }
    eq(code, ERR.INVALID_RULES)
    const { room } = m.createRoom({ displayName: 'y' })
    eq(room.gameType, 'mahjong')
  })
})

// ---------- 汇总 ----------

console.log('\n=== 测试结束 ===')
console.log('通过 ' + results.pass + ' / 失败 ' + results.fail)
if (failures.length) {
  for (const f of failures) console.log('  ✗ ' + f.name + ' → ' + f.message)
}
process.exit(results.fail ? 1 : 0)
