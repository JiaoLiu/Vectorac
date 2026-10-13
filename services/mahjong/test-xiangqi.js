// ============================================================
// 中国象棋联机测试（mahjong-service/test-xiangqi.js）
// ------------------------------------------------------------
// 覆盖：适配器单测（规则清洗 / dispatch 错误契约 / 引擎规则（别马腿、
//      送将）/ 将死判定 / 结算 / 换先）
//      + 联机端到端（建房 2 座 → 走子 → 将死结算入账 → 就绪开下局换先 → AI 补位）。
// 运行：node test-xiangqi.js（退出码 0 = 全部通过）
// ============================================================

import { createServer } from './server.js'
import { ERR } from './errors.js'
import { ROOM_STATUS } from './rooms/seat.js'
import { adapter } from './rooms/adapters/xiangqi.js'
import { RED, BLACK, getLegalMoves } from './engine/xiangqi/engine.js'

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

async function waitFor(cond, ms = 8000, step = 25) {
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
/** 当前窗口下一手（真人出手路径） */
function move(room, playerId, fromX, fromY, toX, toY) {
  const gs = room.gameSession
  return room.handleAction({
    playerId,
    requestId: 'xq-' + (++reqSeq),
    gameId: gs.gameId,
    windowId: gs.window ? gs.window.windowId : null,
    action: { type: 'move', fromX, fromY, toX, toY }
  })
}

/** 造一块只含指定棋子的棋盘（id 仅作占位，引擎只读 side/type） */
function craftBoard(pieces) {
  const board = Array.from({ length: 10 }, () => Array(9).fill(null))
  let n = 0
  for (const p of pieces) {
    board[p.y][p.x] = { side: p.side, type: p.type, id: 't' + ++n }
  }
  return board
}

/**
 * 绝杀局面（红一步将死）：
 *   黑 将(4,0) 孤家寡人；红 帅(5,9) 车(5,7) 马(2,2) 马(6,2)。
 *   红 车(5,7)→(4,7) 沉肋叫将：黑老将 (3,0)/(5,0) 被双马锁死、
 *   (4,1) 仍在车口，无子可吃车、无子可垫 → 将死。
 *   （走位前黑方未被将军：车不占肋线、双马不踩中原。）
 */
const MATE_SETUP = [
  { side: BLACK, type: 'K', x: 4, y: 0 },
  { side: RED, type: 'K', x: 5, y: 9 },
  { side: RED, type: 'R', x: 5, y: 7 },
  { side: RED, type: 'H', x: 2, y: 2 },
  { side: RED, type: 'H', x: 6, y: 2 }
]

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

await test('createState：先手座执红，红棋先行', () => {
  const st = adapter.createState({ firstSeat: 1 })
  eq(st.seatColor[1], RED)
  eq(st.seatColor[0], BLACK)
  eq(st.turn, RED)
  eq(st.phase, 'play')
  eq(st.version, 0)
  eq(st.board[9][4].type, 'K') // 红帅在底
  eq(st.board[0][4].type, 'K') // 黑将在顶
})

await test('dispatch 错误契约：not-active / illegal / stale / duplicate / wrong-phase', () => {
  const st = adapter.createState({ firstSeat: 0 })
  // 轮红（seat0），seat1 抢先 → not-active
  eq(adapter.dispatch(st, { type: 'move', seat: 1, fromX: 1, fromY: 0, toX: 2, toY: 2 }).error, 'not-active')
  // 越界 / 非整数 → illegal
  eq(adapter.dispatch(st, { type: 'move', seat: 0, fromX: 7, fromY: 7, toX: 9, toY: 7 }).error, 'illegal')
  eq(adapter.dispatch(st, { type: 'move', seat: 0, fromX: 7, fromY: 7, toX: 4.5, toY: 7 }).error, 'illegal')
  // stateVersion 不匹配 → stale
  eq(adapter.dispatch(st, { type: 'move', seat: 0, fromX: 7, fromY: 7, toX: 4, toY: 7, stateVersion: 9 }).error, 'stale')
  // 正常走子：炮二平五
  const r1 = adapter.dispatch(st, { type: 'move', seat: 0, fromX: 7, fromY: 7, toX: 4, toY: 7, actionId: 'a1' })
  assert(r1.ok, '炮二平五应成功')
  eq(st.board[7][4].type, 'C')
  eq(st.turn, BLACK)
  eq(st.version, 1)
  // 同 actionId 再来一次 → duplicate
  eq(adapter.dispatch(st, { type: 'move', seat: 1, fromX: 1, fromY: 0, toX: 2, toY: 2, actionId: 'a1' }).error, 'duplicate')
  // 动对方棋子 → illegal
  eq(adapter.dispatch(st, { type: 'move', seat: 1, fromX: 4, fromY: 7, toX: 4, toY: 6 }).error, 'illegal')
  // 走法不符（将走两步）→ illegal
  eq(adapter.dispatch(st, { type: 'move', seat: 1, fromX: 4, fromY: 0, toX: 4, toY: 2 }).error, 'illegal')
  // 吃己方子 → illegal
  eq(adapter.dispatch(st, { type: 'move', seat: 1, fromX: 1, fromY: 0, toX: 2, toY: 0 }).error, 'illegal')
  // 正常应手：马8进7
  const r2 = adapter.dispatch(st, { type: 'move', seat: 1, fromX: 1, fromY: 0, toX: 2, toY: 2 })
  assert(r2.ok, '马8进7应成功')
  eq(st.turn, RED)
  // 结束后 → wrong-phase
  st.phase = 'finished'
  eq(adapter.dispatch(st, { type: 'move', seat: 0, fromX: 4, fromY: 6, toX: 4, toY: 5 }).error, 'wrong-phase')
})

await test('引擎规则：别马腿拒走、畅通可过', () => {
  const st = adapter.createState({ firstSeat: 0 })
  st.board = craftBoard([
    { side: RED, type: 'K', x: 3, y: 9 },
    { side: BLACK, type: 'K', x: 4, y: 0 },
    { side: RED, type: 'H', x: 1, y: 9 },
    { side: RED, type: 'P', x: 1, y: 8 } // 马腿
  ])
  eq(adapter.dispatch(st, { type: 'move', seat: 0, fromX: 1, fromY: 9, toX: 2, toY: 7 }).error, 'illegal')
  const ok = adapter.dispatch(st, { type: 'move', seat: 0, fromX: 1, fromY: 9, toX: 3, toY: 8 })
  assert(ok.ok, '无别腿方向应可走')
})

await test('引擎规则：送将（离肋露帅）拒走', () => {
  const st = adapter.createState({ firstSeat: 0 })
  st.board = craftBoard([
    { side: BLACK, type: 'K', x: 4, y: 0 },
    { side: RED, type: 'R', x: 4, y: 8 },
    { side: RED, type: 'K', x: 4, y: 9 }
  ])
  eq(adapter.dispatch(st, { type: 'move', seat: 0, fromX: 4, fromY: 8, toX: 5, toY: 8 }).error, 'illegal')
  const ok = adapter.dispatch(st, { type: 'move', seat: 0, fromX: 4, fromY: 8, toX: 4, toY: 7 })
  assert(ok.ok, '沿肋进退应可走')
})

await test('将死判定：车沉肋绝杀，winSide/checkmate/winner 正确', () => {
  const st = adapter.createState({ firstSeat: 0 }) // seat0 执红
  st.board = craftBoard(MATE_SETUP)
  const r = adapter.dispatch(st, { type: 'move', seat: 0, fromX: 5, fromY: 7, toX: 4, toY: 7 })
  assert(r.ok, '车(5,7)→(4,7) 应成功')
  eq(st.phase, 'finished')
  eq(st.winSide, RED)
  eq(st.winner, 0)
  eq(st.checkmate, true)
  const view = adapter.playerView(st, 1)
  assert(view.results && view.results.winner === 0 && view.results.checkmate === true, '结算视图应对双方可见')
})

await test('结算：胜 +10 / 负 -10', () => {
  const st = adapter.createState({ firstSeat: 0 })
  st.phase = 'finished'
  st.winner = 1
  const r = adapter.settlementOf(st)
  eq(r.perSeat[0].delta, -10)
  eq(r.perSeat[1].delta, 10)
  eq(r.draw, false)
})

await test('换先：首局房主选边（红先），之后每局互换', () => {
  // 房主（seat0）执红 → 首局 seat0 先手
  let ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: 'red' }, null, null)
  eq(ctx.firstSeat, 0)
  // 房主执黑 → 首局对方先手
  ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: 'black' }, null, null)
  eq(ctx.firstSeat, 1)
  // 未选边默认执红
  ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: null }, null, null)
  eq(ctx.firstSeat, 0)
  // 次局换先
  ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: 'red' }, { perSeat: [] }, { firstSeat: 0 })
  eq(ctx.firstSeat, 1)
  ctx = adapter.nextRoundCtx({ adminSeat: 0, hostSide: 'red' }, { perSeat: [] }, { firstSeat: 1 })
  eq(ctx.firstSeat, 0)
})

await test('matchesLegalOption：结构校验（越界拒、非 move 拒）', () => {
  const st = adapter.createState({ firstSeat: 0 })
  const legal = adapter.legalActions(st, 0)
  assert(legal.length === 1 && legal[0].type === 'move', '轮走方应有 move 选项')
  assert(legal[0].moves.length > 0, '开局红方应有合法着法')
  assert(adapter.matchesLegalOption(legal, { type: 'move', fromX: 7, fromY: 7, toX: 4, toY: 7 }), '棋盘内应通过')
  assert(!adapter.matchesLegalOption(legal, { type: 'move', fromX: 7, fromY: 7, toX: 9, toY: 7 }), '越界应拒')
  assert(!adapter.matchesLegalOption(legal, { type: 'move', fromX: 1.5, fromY: 7, toX: 4, toY: 7 }), '非整数应拒')
  assert(!adapter.matchesLegalOption(legal, { type: 'peng' }), '非 move 应拒')
  eq(adapter.legalActions(st, 1).length, 0) // 非轮走方无选项
})

await test('AI 兜底链：aiDecide / aiFallback / aiLastResort 都产出合法着法', () => {
  const st = adapter.createState({ firstSeat: 0 })
  const view = adapter.playerView(st, 0)
  const legalSet = new Set(getLegalMoves(st.board, RED).map(m => m.fromX + ',' + m.fromY + '>' + m.toX + ',' + m.toY))
  const key = a => a.fromX + ',' + a.fromY + '>' + a.toX + ',' + a.toY
  for (const a of [adapter.aiDecide(view, 'medium', Math.random), adapter.aiFallback(view), adapter.aiLastResort(view.legal)]) {
    assert(a && a.type === 'move', '应产出 move')
    assert(legalSet.has(key(a)), '着法必须在合法表中：' + key(a))
  }
})

// ---------- 联机端到端 ----------

console.log('\n[联机] 双人对局全流程')

await withServer(async s => {
  const m = s.manager

  await test('建象棋房：2 座、summary 带 gameType/seatsPerRoom', async () => {
    const { room, summary } = m.createRoom({ displayName: '房主', gameType: 'xiangqi', hostSide: 'red' })
    eq(room.gameType, 'xiangqi')
    eq(room.seats.length, 2)
    eq(summary.gameType, 'xiangqi')
    eq(summary.seatsPerRoom, 2)
    const listed = m.listRooms().find(r => r.roomId === room.roomId)
    assert(listed && listed.gameType === 'xiangqi', '大厅列表应带 gameType')
  })

  await test('完整一局：走子→将死，结算 +10/-10 入账，回 WAITING，次局换先', async () => {
    const { room, player: p0 } = m.createRoom({ displayName: '房主', gameType: 'xiangqi', hostSide: 'red' })
    const { player: p1 } = await m.joinRoom({ roomCode: room.roomCode, displayName: '挑战者' })
    eq(p1.seatIndex, 1)
    let started = null
    const origBroadcast = s.hub.broadcast.bind(s.hub)
    s.hub.broadcast = (rm, type, payload, extra) => {
      if (type === 'GAME_STARTED' && rm === room) started = payload
      return origBroadcast(rm, type, payload, extra)
    }
    await room.startGame(p0.playerId)
    eq(room.status, ROOM_STATUS.PLAYING)
    assert(started, '应广播 GAME_STARTED')
    eq(started.gameType, 'xiangqi')
    eq(started.ceremony && started.ceremony.firstSeat, 0) // 首局房主执红 → seat0 先手
    eq(room.roundCtx.firstSeat, 0)
    const gs = room.gameSession
    eq(gs.state.seatColor[0], RED)
    const view0 = gs.viewFor(0)
    eq(view0.myColor, RED)
    eq(view0.meta.firstSeat, 0)
    const view1 = gs.viewFor(1)
    eq(view1.myColor, BLACK)
    eq(view1.legal.length, 0) // 黑方等待

    // 非轮走方出手 → NOT_YOUR_TURN
    await expectFail(move(room, p1.playerId, 1, 0, 2, 2), ERR.NOT_YOUR_TURN)

    // 红 炮二平五
    const wid1 = gs.window.windowId
    let r = await move(room, p0.playerId, 7, 7, 4, 7)
    assert(r.ok, '炮二平五应成功')
    // 旧 windowId 立即失效
    await expectFail(
      room.handleAction({
        playerId: p1.playerId,
        requestId: 'xq-stale',
        gameId: gs.gameId,
        windowId: wid1,
        action: { type: 'move', fromX: 1, fromY: 0, toX: 2, toY: 2 }
      }),
      ERR.ACTION_WINDOW_EXPIRED
    )
    // 幂等：同 requestId 重放 → duplicate
    const dup = await room.handleAction({
      playerId: p0.playerId,
      requestId: 'xq-' + reqSeq, // 上一手的 requestId
      gameId: gs.gameId,
      windowId: gs.window.windowId,
      action: { type: 'move', fromX: 7, fromY: 7, toX: 4, toY: 7 }
    })
    assert(dup.duplicate === true, '同 requestId 应返回 duplicate')

    // 黑 马8进7
    r = await move(room, p1.playerId, 1, 0, 2, 2)
    assert(r.ok, '马8进7应成功')
    eq(gs.state.turn, RED)
    eq(gs.state.lastMove.capture, null)

    // 白盒：摆入绝杀局面（真实对局铺垫太长，测试引擎终局链路即可），红走绝杀
    gs.state.board = craftBoard(MATE_SETUP)
    gs.state.turn = RED
    r = await move(room, p0.playerId, 5, 7, 4, 7)
    assert(r.ok, '绝杀走子应成功')

    eq(gs.finished, true)
    eq(gs.state.winner, 0)
    eq(gs.state.checkmate, true)
    eq(room.status, ROOM_STATUS.WAITING)
    eq(room.lastResults.perSeat[0].delta, 10)
    eq(room.lastResults.perSeat[1].delta, -10)
    eq(room.scores[0], 110)
    eq(room.scores[1], 90)

    // 全员就绪 → 自动开第 2 局并换先
    await room.setReady(p0.playerId, true)
    const r2 = await room.setReady(p1.playerId, true)
    assert(r2.started, '全员就绪应自动开局')
    eq(room.round, 2)
    eq(room.roundCtx.firstSeat, 1) // 换先
    const gs2 = room.gameSession
    eq(gs2.state.seatColor[1], RED)
    eq(gs2.state.seatColor[0], BLACK)
    eq(gs2.state.turn, RED)
    eq(gs2.state.moves, 0)
    eq(gs2.viewFor(1).meta.firstSeat, 1)
    // 第 2 局 seat1（红）先行
    const r3 = await move(room, p1.playerId, 7, 7, 4, 7)
    assert(r3.ok, '换先后 seat1 应能先行')
  })

  await test('AI 补位：房主执黑 → AI 执红先行；真人应手后 AI 回应', async () => {
    const { room, player: p0 } = m.createRoom({ displayName: '房主', gameType: 'xiangqi', hostSide: 'black' })
    await room.startGame(p0.playerId) // seat1 自动补 AI
    eq(room.seats[1].occupantType, 'AI')
    eq(room.roundCtx.firstSeat, 1) // 房主选黑 → AI 座先手
    const gs = room.gameSession
    eq(gs.state.seatColor[1], RED)

    // AI 执红首着，等它走出
    const ok1 = await waitFor(() => gs.state.moves >= 1)
    assert(ok1, 'AI 应先手走子')
    eq(gs.state.turn, BLACK)

    // 真人（黑）应手 → AI 回应
    const r = await move(room, p0.playerId, 1, 0, 2, 2)
    assert(r.ok, '黑方应手应成功')
    const ok2 = await waitFor(() => gs.state.moves >= 3)
    assert(ok2, 'AI 回应后 moves 应 ≥3')
    eq(gs.state.turn, BLACK) // 又轮回真人
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
