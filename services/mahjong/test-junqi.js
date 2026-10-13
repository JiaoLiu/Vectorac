// ============================================================
// 四国军棋联机测试（mahjong-service/test-junqi.js）
// ------------------------------------------------------------
// 覆盖：适配器单测（规则清洗 / dispatch 错误契约 / 并行布阵窗口 /
//      暗棋隐私视图 / 结算 / AI 兜底链）
//      + 联机端到端（建房 4 座 → 并行布阵确认 → 开战 → 投降链终局
//      → 结算入账 → 就绪开下局 → AI 补位自动布阵与走子）。
// 运行：node test-junqi.js（退出码 0 = 全部通过）
// ============================================================

import { createServer } from './server.js'
import { ERR } from './errors.js'
import { ROOM_STATUS } from './rooms/seat.js'
import { adapter } from './rooms/adapters/junqi.js'
import { legalMoves } from './engine/junqi/engine.js'

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
    requestId: 'jq-' + (++reqSeq),
    gameId: gs.gameId,
    windowId: gs.window ? gs.window.windowId : null,
    action
  })
}

/** 直接驱动到开战：未确认的家全部确认（绕开窗口层，纯状态机） */
function confirmAll(st) {
  for (let seat = 0; seat < 4; seat++) {
    if (st.confirmed[seat]) continue
    const r = adapter.dispatch(st, { type: 'confirm', seat })
    assert(r.ok, 'seat' + seat + ' 确认应成功')
  }
}

// ---------- 适配器单测 ----------

console.log('\n[适配器] 规则与状态机')

await test('规则清洗：缺省 dark；非法 mode 拒收；多余字段忽略', () => {
  eq(adapter.sanitizeRules(null).mode, 'dark')
  eq(adapter.sanitizeRules({ mode: 'dual' }).mode, 'dual')
  eq(adapter.sanitizeRules({ mode: 'open', foo: 1 }).mode, 'open')
  eq(Object.keys(adapter.sanitizeRules({ mode: 'open', foo: 1 })).length, 1)
  let code = null
  try {
    adapter.sanitizeRules({ mode: 'hell' })
  } catch (e) {
    code = e.code
  }
  eq(code, ERR.INVALID_RULES)
})

await test('createState：布阵阶段、100 子、四家各 25、匿名 ref 已分配', () => {
  const st = adapter.createState({}, { seed: 42, rules: { mode: 'dark' } })
  eq(st.s.phase, 'setup')
  eq(st.version, 0)
  eq(st.s.pieces.length, 100)
  for (let seat = 0; seat < 4; seat++) {
    eq(st.s.pieces.filter(p => p.seat === seat).length, 25)
    eq(st.confirmed[seat], false)
    assert(st.s.pieces.filter(p => p.seat === seat).every(p => typeof p.ref === 'string'), '每子应有 ref')
  }
  assert(st.s.pieces.some(p => p.id === '0-commander-0'), '真实 id 应带棋种（隐私靠视图层过滤）')
})

await test('dispatch 错误契约：wrong-phase / not-active / illegal / stale / duplicate', () => {
  const st = adapter.createState({}, { seed: 7, rules: { mode: 'dark' } })
  // 布阵阶段出走子动作 → wrong-phase
  eq(adapter.dispatch(st, { type: 'move', seat: 0, pieceId: 'x', to: 'y' }).error, 'wrong-phase')
  eq(adapter.dispatch(st, { type: 'surrender', seat: 0 }).error, 'wrong-phase')
  // 座位越界 → illegal
  eq(adapter.dispatch(st, { type: 'confirm', seat: 4 }).error, 'illegal')
  // stateVersion 不符 → stale
  eq(adapter.dispatch(st, { type: 'confirm', seat: 0, stateVersion: 9 }).error, 'stale')
  // 正常确认（带 actionId）
  const r1 = adapter.dispatch(st, { type: 'confirm', seat: 0, actionId: 'a1' })
  assert(r1.ok, '确认应成功')
  eq(st.version, 1)
  // 同 actionId 再来 → duplicate
  eq(adapter.dispatch(st, { type: 'confirm', seat: 1, actionId: 'a1' }).error, 'duplicate')
  // 已确认再操作 → illegal
  eq(adapter.dispatch(st, { type: 'confirm', seat: 0 }).error, 'illegal')
  eq(adapter.dispatch(st, { type: 'randomize', seat: 0 }).error, 'illegal')
  // 走完布阵进走子阶段
  confirmAll(st)
  eq(st.s.phase, 'play')
  // 布阵动作在走子阶段 → wrong-phase
  eq(adapter.dispatch(st, { type: 'confirm', seat: 0 }).error, 'wrong-phase')
  // 非轮走方走子 → not-active
  const other = (st.s.turn + 1) % 4
  eq(adapter.dispatch(st, { type: 'move', seat: other, pieceId: 'x', to: 'y' }).error, 'not-active')
  eq(adapter.dispatch(st, { type: 'surrender', seat: other }).error, 'not-active')
  // 轮走方但字段形态错 / 假棋子 → illegal
  eq(adapter.dispatch(st, { type: 'move', seat: st.s.turn, pieceId: 1, to: 'y' }).error, 'illegal')
  eq(adapter.dispatch(st, { type: 'move', seat: st.s.turn, pieceId: 'no-such', to: 'c:8:8' }).error, 'illegal')
})

await test('布阵操作：randomize 重摆、swap 校验、四家齐确认开战掷骰', () => {
  const st = adapter.createState({}, { seed: 99, rules: { mode: 'dark' } })
  const before = st.s.pieces.filter(p => p.seat === 0).map(p => p.id + '@' + p.pos).join(',')
  const r1 = adapter.dispatch(st, { type: 'randomize', seat: 0 })
  assert(r1.ok, 'randomize 应成功')
  eq(st.s.pieces.filter(p => p.seat === 0).length, 25)
  const after = st.s.pieces.filter(p => p.seat === 0).map(p => p.id + '@' + p.pos).join(',')
  assert(before !== after, '重摆后阵型应变化')
  assert(st.s.pieces.filter(p => p.seat === 0).every(p => typeof p.ref === 'string'), '重摆后 ref 应重排')

  // swap：自家两子交换 ok；军旗换到非 HQ 拒；换他家棋子拒
  const mine = st.s.pieces.filter(p => p.seat === 1)
  const r2 = adapter.dispatch(st, { type: 'swap', seat: 1, first: mine[0].id, second: mine[1].id })
  // 两子互换必须双方都放得进对方位置（引擎裁决），失败也只允许是 illegal
  if (!r2.ok) eq(r2.error, 'illegal')
  const flag = mine.find(p => p.type === 'flag')
  const nonHq = mine.find(p => !/5:[13]$/.test(p.pos) && p.type !== 'mine')
  if (nonHq) {
    eq(adapter.dispatch(st, { type: 'swap', seat: 1, first: flag.id, second: nonHq.id }).error, 'illegal')
  }
  eq(adapter.dispatch(st, { type: 'swap', seat: 1, first: mine[0].id, second: '0-platoon-0' }).error, 'illegal')
  eq(adapter.dispatch(st, { type: 'swap', seat: 1, first: mine[0].id, second: 5 }).error, 'illegal')

  // 四家确认 → 开战 + 掷骰定先手
  confirmAll(st)
  eq(st.s.phase, 'play')
  assert(st.opening && Array.isArray(st.opening.rounds), '应有掷骰记录')
  assert(st.opening.first >= 0 && st.opening.first <= 3, '先手应在 0..3')
  eq(st.s.turn, st.opening.first)
  eq(st.confirmed.every(Boolean), true)
})

await test('行动窗口：布阵并行窗口、确认递减、开战后每手一窗', () => {
  const st = adapter.createState({}, { seed: 5, rules: { mode: 'dark' } })
  eq(adapter.windowIdentityOf(st), 'setup')
  eq(adapter.windowTypeOf(st), 'EXCHANGE_SELECTION')
  eq(adapter.eligibleSeatsOf(st).join(','), '0,1,2,3')
  adapter.dispatch(st, { type: 'confirm', seat: 0 })
  adapter.dispatch(st, { type: 'confirm', seat: 2 })
  eq(adapter.windowIdentityOf(st), 'setup') // identity 不变 ⇒ 窗口复用
  eq(adapter.eligibleSeatsOf(st).join(','), '1,3')
  adapter.dispatch(st, { type: 'confirm', seat: 1 })
  adapter.dispatch(st, { type: 'confirm', seat: 3 })
  eq(adapter.windowIdentityOf(st), 'move:0')
  eq(adapter.windowTypeOf(st), 'SELF_TURN')
  eq(adapter.eligibleSeatsOf(st).join(','), String(st.s.turn))
  // 布阵时限 ≥ 走子时限
  const setupMs = adapter.windowTimeoutMs({ s: { phase: 'setup' } }, { turnTimeoutSeconds: 15 })
  const playMs = adapter.windowTimeoutMs({ s: { phase: 'play' } }, { turnTimeoutSeconds: 15 })
  assert(setupMs >= 60000 && setupMs === Math.max(60, 45) * 1000, '布阵给 3 倍且至少 60s')
  eq(playMs, 15000)
  // 终局无窗口
  st.s.phase = 'finished'
  eq(adapter.windowIdentityOf(st), null)
  eq(adapter.eligibleSeatsOf(st).length, 0)
})

await test('legalActions / matchesLegalOption：阶段与座位过滤', () => {
  const st = adapter.createState({}, { seed: 11, rules: { mode: 'dark' } })
  const legal0 = adapter.legalActions(st, 0)
  eq(legal0.map(o => o.type).join(','), 'randomize,swap,confirm')
  adapter.dispatch(st, { type: 'confirm', seat: 0 })
  eq(adapter.legalActions(st, 0).length, 0)
  confirmAll(st)
  const turn = st.s.turn
  const legal = adapter.legalActions(st, turn)
  eq(legal.map(o => o.type).join(','), 'move,surrender')
  assert(legal[0].moves.length > 0, '开战首家应有棋可走')
  eq(adapter.legalActions(st, (turn + 1) % 4).length, 0)
  // 结构校验
  assert(adapter.matchesLegalOption(legal, { type: 'move', pieceId: 'a', to: 'b' }), 'move 字段齐全应过')
  assert(!adapter.matchesLegalOption(legal, { type: 'move', pieceId: 'a' }), 'move 缺 to 应拒')
  assert(!adapter.matchesLegalOption(legal, { type: 'swap', first: 'a', second: 'b' }), '非本窗口类型应拒')
  assert(adapter.matchesLegalOption(legal, { type: 'surrender' }), 'surrender 应过')
  const setupLegal = [{ type: 'randomize' }, { type: 'swap' }, { type: 'confirm' }]
  assert(adapter.matchesLegalOption(setupLegal, { type: 'swap', first: 'a', second: 'b' }), 'swap 字段齐全应过')
  assert(!adapter.matchesLegalOption(setupLegal, { type: 'swap', first: 'a', second: 1 }), 'swap 字段非字符串应拒')
})

await test('暗棋隐私：dark 敌子匿名、dual 队友可见、open 全明、serializeView 剥 _engine', () => {
  const dark = adapter.createState({}, { seed: 3, rules: { mode: 'dark' } })
  const v0 = adapter.playerView(dark, 0)
  const own = v0.pieces.filter(p => p.seat === 0)
  const foe = v0.pieces.filter(p => p.seat === 1)
  assert(own.every(p => p.type && p.id.indexOf('0-') === 0), '自家子应见真实 id 与棋种')
  assert(foe.every(p => p.type === null && p.id.indexOf('r') === 0), 'dark 敌子应匿名且无棋种')
  assert(!JSON.stringify(v0.pieces).includes('commander-1'), '序列化不得泄露敌子棋种')

  const dual = adapter.createState({}, { seed: 3, rules: { mode: 'dual' } })
  const vd = adapter.playerView(dual, 0)
  assert(vd.pieces.filter(p => p.seat === 2).every(p => p.type !== null), 'dual 队友应可见')
  assert(vd.pieces.filter(p => p.seat === 1).every(p => p.type === null), 'dual 敌方仍隐藏')

  const open = adapter.createState({}, { seed: 3, rules: { mode: 'open' } })
  assert(adapter.playerView(open, 0).pieces.every(p => p.type !== null), 'open 全明')

  const wire = adapter.serializeView(dark, 0, null)
  assert(!('_engine' in wire), '_engine 绝不出网')
  assert(v0._engine, 'playerView 应带 _engine 供 AI 决策')
})

await test('结算：胜方阵营 +10 / 负方 -10；和棋各 0', () => {
  const st = adapter.createState({}, { seed: 8, rules: { mode: 'dark' } })
  st.s.phase = 'finished'
  st.s.winner = 1 // 阵营 1（seat1/seat3）胜
  const r = adapter.settlementOf(st)
  eq(r.winner, 1)
  eq(r.draw, false)
  eq(r.perSeat.map(p => p.delta).join(','), '-10,10,-10,10')
  st.s.winner = 'draw'
  const d = adapter.settlementOf(st)
  eq(d.winner, null)
  eq(d.draw, true)
  eq(d.perSeat.map(p => p.delta).join(','), '0,0,0,0')
})

await test('AI 兜底链：布阵确认；走子 aiDecide/aiFallback/aiLastResort 皆合法', () => {
  const st = adapter.createState({}, { seed: 21, rules: { mode: 'dark' } })
  const vSetup = adapter.playerView(st, 0)
  eq(adapter.aiDecide(vSetup, 'normal', Math.random).type, 'confirm')
  eq(adapter.aiFallback(vSetup).type, 'confirm')
  confirmAll(st)
  const turn = st.s.turn
  const view = adapter.playerView(st, turn)
  const legalSet = new Set()
  for (const p of st.s.pieces.filter(p => p.seat === turn)) {
    for (const to of legalMoves(st.s, p.id)) legalSet.add(p.id + '>' + to)
  }
  for (const a of [adapter.aiDecide(view, 'normal', Math.random), adapter.aiFallback(view), adapter.aiLastResort(view.legal)]) {
    assert(a && (a.type === 'move' || a.type === 'surrender'), '应产出 move/surrender')
    if (a.type === 'move') assert(legalSet.has(a.pieceId + '>' + a.to), '着法必须在合法表中')
  }
})

await test('开局契约：openingFor 无选边、ceremony deploy；nextRoundCtx 空', () => {
  const opening = adapter.openingFor()
  eq(opening.ceremony.mode, 'deploy')
  eq(opening.firstMoverSeat, null)
  eq(JSON.stringify(adapter.nextRoundCtx()), '{}')
  eq(adapter.seatsPerRoom, 4)
  eq(adapter.gameId, 'junqi')
})

// ---------- 联机端到端 ----------

console.log('\n[联机] 四人对局全流程')

await withServer(async s => {
  const m = s.manager

  await test('建军棋房：4 座、summary 带 gameType/seatsPerRoom', () => {
    const { room, summary } = m.createRoom({ displayName: '房主', gameType: 'junqi' })
    eq(room.gameType, 'junqi')
    eq(room.seats.length, 4)
    eq(summary.gameType, 'junqi')
    eq(summary.seatsPerRoom, 4)
    eq(room.rules.mode, 'dark')
    const listed = m.listRooms().find(r => r.roomId === room.roomId)
    assert(listed && listed.gameType === 'junqi', '大厅列表应带 gameType')
    let code = null
    try {
      m.createRoom({ displayName: 'x', gameType: 'junqi', rules: { mode: 'nope' } })
    } catch (e) {
      code = e.code
    }
    eq(code, ERR.INVALID_RULES)
  })

  await test('完整一局：并行布阵 → 开战 → 投降链终局 → ±10 入账 → 次局重新布阵', async () => {
    const { room, player: p0 } = m.createRoom({ displayName: '房主', gameType: 'junqi' })
    const { player: p1 } = await m.joinRoom({ roomCode: room.roomCode, displayName: '老二' })
    const { player: p2 } = await m.joinRoom({ roomCode: room.roomCode, displayName: '老三' })
    const { player: p3 } = await m.joinRoom({ roomCode: room.roomCode, displayName: '老四' })
    const players = [p0, p1, p2, p3]
    players.forEach((p, i) => eq(p.seatIndex, i))

    let started = null
    const origBroadcast = s.hub.broadcast.bind(s.hub)
    s.hub.broadcast = (rm, type, payload, extra) => {
      if (type === 'GAME_STARTED' && rm === room) started = payload
      return origBroadcast(rm, type, payload, extra)
    }
    await room.startGame(p0.playerId)
    eq(room.status, ROOM_STATUS.PLAYING)
    assert(started, '应广播 GAME_STARTED')
    eq(started.gameType, 'junqi')
    eq(started.ceremony && started.ceremony.mode, 'deploy')

    const gs = room.gameSession
    eq(gs.state.s.phase, 'setup')
    // 暗棋视图出网检查：敌子匿名、无 _engine
    const wire0 = gs.viewFor(0)
    assert(!('_engine' in wire0), '出网视图不得带 _engine')
    assert(wire0.pieces.filter(p => p.seat === 1).every(p => p.type === null && p.id[0] === 'r'), '敌子应匿名')
    assert(wire0.pieces.filter(p => p.seat === 0).every(p => p.type !== null), '己子应可见')

    // 并行布阵：identity 不变 ⇒ windowId 复用，eligible 随确认递减
    const wid = gs.window.windowId
    let r = await act(room, p0.playerId, { type: 'confirm' })
    assert(r.ok, 'seat0 确认应成功')
    eq(gs.window.windowId, wid) // 同一逻辑窗口
    eq(gs.window.eligibleSeats.length, 3)
    r = await act(room, p1.playerId, { type: 'confirm' })
    assert(r.ok, 'seat1 确认应成功')
    eq(gs.window.windowId, wid)
    eq(gs.window.eligibleSeats.length, 2)
    // 已确认者再确认 → INVALID_ACTION
    let code = null
    try {
      await act(room, p0.playerId, { type: 'confirm' })
    } catch (e) {
      code = e.code
    }
    assert(code, '重复确认应报错')

    r = await act(room, p2.playerId, { type: 'randomize' })
    assert(r.ok, 'randomize 应成功')
    r = await act(room, p2.playerId, { type: 'confirm' })
    assert(r.ok, 'seat2 确认应成功')
    r = await act(room, p3.playerId, { type: 'confirm' })
    assert(r.ok, 'seat3 确认应成功')

    // 开战：掷骰定先手
    eq(gs.state.s.phase, 'play')
    assert(gs.state.opening && gs.state.opening.first >= 0, '应有先手座位')
    eq(gs.state.s.turn, gs.state.opening.first)
    assert(gs.window && gs.window.windowId !== wid, '开战后应是新窗口')
    eq(gs.window.eligibleSeats.join(','), String(gs.state.s.turn))

    // 投降链终局：阵营 0（seat0/seat2）轮到自己就投降，阵营 1 走第一手
    let guard = 0
    while (!gs.finished && guard++ < 12) {
      const seat = gs.state.s.turn
      const pid = players[seat].playerId
      if (seat % 2 === 0) {
        r = await act(room, pid, { type: 'surrender' })
        assert(r.ok, 'seat' + seat + ' 投降应成功')
      } else {
        const legal = adapter.legalActions(gs.state, seat)
        const mv = legal[0].moves[0]
        assert(mv, 'seat' + seat + ' 应有棋可走')
        r = await act(room, pid, { type: 'move', pieceId: mv.pieceId, to: mv.to })
        assert(r.ok, 'seat' + seat + ' 走子应成功')
      }
    }
    assert(gs.finished, '阵营 0 两家退出后应终局')
    eq(gs.state.s.winner, 1)
    eq(room.status, ROOM_STATUS.WAITING)
    eq(room.lastResults.perSeat.map(p => p.delta).join(','), '-10,10,-10,10')
    eq(room.scores.join(','), '90,110,90,110')

    // 全员就绪 → 第 2 局重新布阵
    for (const p of players.slice(0, 3)) await room.setReady(p.playerId, true)
    const r2 = await room.setReady(p3.playerId, true)
    assert(r2.started, '全员就绪应自动开局')
    eq(room.round, 2)
    const gs2 = room.gameSession
    eq(gs2.state.s.phase, 'setup')
    eq(gs2.state.s.pieces.length, 100)
    eq(gs2.state.confirmed.every(v => !v), true)
  })

  await test('AI 补位：3 家 AI 自动确认布阵并走子', async () => {
    const { room, player: p0 } = m.createRoom({ displayName: '房主', gameType: 'junqi' })
    await room.startGame(p0.playerId) // 其余 3 座自动补 AI
    eq(room.seats.filter(st => st.occupantType === 'AI').length, 3)
    const gs = room.gameSession

    // AI 自动确认后，等真人确认进开战
    const okSetup = await waitFor(() => gs.state.confirmed.filter(Boolean).length >= 3)
    assert(okSetup, '3 家 AI 应自动确认布阵')
    const r = await act(room, p0.playerId, { type: 'confirm' })
    assert(r.ok, '真人确认应成功')
    eq(gs.state.s.phase, 'play')

    // 真人轮到自己就走第一手；其余等 AI 推进
    const t0 = Date.now()
    while (Date.now() - t0 < 15000 && !gs.finished && gs.state.s.turns < 3) {
      if (gs.state.s.phase === 'play' && gs.state.s.turn === 0 && gs.state.s.alive[0]) {
        const legal = adapter.legalActions(gs.state, 0)
        const mv = legal.length && legal[0].moves[0]
        if (mv) await act(room, p0.playerId, { type: 'move', pieceId: mv.pieceId, to: mv.to })
        else await act(room, p0.playerId, { type: 'surrender' })
      }
      await new Promise(rs => setTimeout(rs, 50))
    }
    assert(gs.finished || gs.state.s.turns >= 3, 'AI 应持续走子（turns=' + gs.state.s.turns + '）')
  })
})

// ---------- 汇总 ----------

console.log('\n=== 测试结束 ===')
console.log('通过 ' + results.pass + ' / 失败 ' + results.fail)
if (failures.length) {
  for (const f of failures) console.log('  ✗ ' + f.name + ' → ' + f.message)
}
process.exit(results.fail ? 1 : 0)
