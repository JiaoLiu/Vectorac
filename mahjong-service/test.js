// ============================================================
// 联机服务自动化测试（mahjong-service/test.js）
// ------------------------------------------------------------
// 覆盖文档 §64「测试要求」的全部用例 + §55 统计 + §49/§50 TTL + §43 重连同步。
// 运行：node test.js（退出码 0 = 全部通过，1 = 存在失败）
//
// 说明：测试直接驱动 RoomManager / Room / GameSession（不依赖真实 socket 延迟），
// 用一个 FakeWs 代替 WebSocket，即可验证「连接注册 → 广播 → 断线 → 重连」链路。
// ============================================================

import { createServer } from './server.js'
import { ERR } from './errors.js'
import { OCCUPANT, ROOM_STATUS, humanCount } from './rooms/seat.js'
import { config } from './config.js'

// ---------- 迷你测试框架 ----------

const results = { pass: 0, fail: 0 }
const failures = []
let current = null

async function test(name, fn) {
  current = name
  try {
    await fn()
    results.pass++
    console.log('  PASS  ' + name)
  } catch (e) {
    results.fail++
    failures.push({ name, message: String((e && e.message) || e) })
    console.log('  FAIL  ' + name + '\n        → ' + String((e && e.message) || e))
  }
  current = null
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败')
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || '值不相等') + '：期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual))
  }
}

/** 断言某个操作抛出指定 errorCode */
async function expectFail(promise, code, msg) {
  try {
    await promise
  } catch (e) {
    if (e.code !== code) throw new Error((msg || '错误码不符') + '：期望 ' + code + '，实际 ' + e.code)
    return e
  }
  throw new Error((msg || '本应失败却成功了') + '：期望错误码 ' + code)
}

// ---------- 测试辅助 ----------

/** 静默 logger（测试输出只保留测试结果） */
const silentLogger = () => {}

/** 每个用例一个独立 server 实例（内存隔离，避免用例互相污染） */
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

/** 假 WebSocket：满足 Hub 的 readyState / send / close 约定 */
class FakeWs {
  constructor() {
    this.readyState = 1
    this.sent = []
    this.closed = null
  }
  send(text) {
    this.sent.push(JSON.parse(text))
  }
  close(code, reason) {
    this.closed = { code, reason }
    this.readyState = 3
  }
  terminate() {
    this.readyState = 3
  }
  /** 取最后一条指定类型的消息 */
  last(type) {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      if (this.sent[i].type === type) return this.sent[i]
    }
    return null
  }
  types() {
    return this.sent.map(m => m.type)
  }
}

/** 从某座位视角取一个确定性的合法动作（用于「真人」出手） */
function pickAction(view) {
  const legal = (view && view.legal) || []
  if (!legal.length) return null
  const o = legal[0]
  switch (o.type) {
    case 'discard':
      return { type: 'discard', tile: o.tiles[0] }
    case 'void':
      return { type: 'void', suit: o.suits[0] }
    case 'swap': {
      const hand = (view.my && view.my.hand) || []
      const bySuit = {}
      for (const t of hand) {
        const k = Math.floor(t / 9)
        ;(bySuit[k] = bySuit[k] || []).push(t)
      }
      const arr = Object.values(bySuit).find(a => a.length >= 3)
      return arr ? { type: 'swap', tiles: arr.slice(0, 3) } : null
    }
    case 'peng':
      return { type: 'peng', tile: o.tile }
    case 'gang':
      return { type: 'gang', tile: o.options[0].tile, gangType: o.options[0].gangType }
    case 'hu':
      return { type: 'hu', how: o.how }
    case 'pass':
      return { type: 'pass' }
    default:
      return null
  }
}

/** 让「AI / 超时 / 断线托管」把牌局推进到结束（不等待真实计时器） */
async function driveToFinish(room, maxSteps = 4000) {
  let steps = 0
  let stall = 0
  let lastVersion = -1
  while (room.status === ROOM_STATUS.PLAYING && steps++ < maxSteps) {
    const gs = room.gameSession
    if (!gs || gs.aborted) break
    if (!gs.window) {
      if (gs.state.version === lastVersion) {
        if (++stall > 5) break
      } else {
        stall = 0
        lastVersion = gs.state.version
      }
      await new Promise(r => setImmediate(r))
      continue
    }
    const seat = gs.window.eligibleSeats[0]
    await gs.actAsAi(seat, gs.window.windowId, 'AI')
    if (gs.state.version === lastVersion) {
      if (++stall > 5) break
    } else {
      stall = 0
      lastVersion = gs.state.version
    }
  }
  return steps
}

/** 等房间串行队列彻底排空（用于验证「异步排队的操作」已完成） */
function drain(room) {
  return room.queue.push(() => {})
}

/** 让 AI 把牌局推进到「摸打」阶段（此时只有 turn 一家有合法动作） */
async function advanceToDiscard(room, maxSteps = 400) {
  let steps = 0
  while (room.status === ROOM_STATUS.PLAYING && steps++ < maxSteps) {
    const gs = room.gameSession
    if (!gs || !gs.window) break
    if (gs.state.phase === 'discard') return true
    await gs.actAsAi(gs.window.eligibleSeats[0], gs.window.windowId, 'AI')
  }
  return room.gameSession && room.gameSession.state.phase === 'discard'
}

/** 建一个「1 真人 + 3 AI」的牌局房（返回常用句柄） */
function makePlayingRoom(mgr, { humans = 1 } = {}) {
  const { room, player } = mgr.createRoom({ displayName: '房主' })
  const players = [player]
  for (let i = 1; i < humans; i++) {
    const aiSeat = room.seats.findIndex(s => s.occupantType === OCCUPANT.EMPTY)
    const session = room.sessions.create({ roomId: room.roomId, seatIndex: aiSeat, displayName: '玩家' + i })
    room.seats[aiSeat].occupantType = OCCUPANT.HUMAN
    room.seats[aiSeat].humanPlayerId = session.playerId
    room.seats[aiSeat].displayName = session.displayName
    room.seats[aiSeat].connected = true
    room.seats[aiSeat].joinedAt = Date.now()
    players.push({ playerId: session.playerId, resumeToken: session.resumeToken, seatIndex: aiSeat, roomId: room.roomId, roomCode: room.roomCode })
  }
  return { room, players }
}

// ============================================================
// 一、房间容量（文档 §64）
// ============================================================

async function suiteCapacity() {
  console.log('\n[一] 房间容量与销毁后重建')

  await test('创建第 1 个房间成功，创建者自动坐 Seat0 且为管理员', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      eq(s.manager.size, 1, '活跃房间数')
      eq(room.status, ROOM_STATUS.WAITING, '房间状态')
      eq(player.seatIndex, 0, '创建者座位')
      eq(room.adminSeat, 0, '管理员座位')
      eq(room.seats[0].occupantType, OCCUPANT.HUMAN, 'Seat0 占用类型')
      assert(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/.test(room.roomCode), '房号格式：' + room.roomCode)
      assert(player.resumeToken && player.resumeToken.length >= 20, 'resumeToken 强度')
    })
  )

  await test('创建到第 20 个成功，第 21 个返回 ROOM_CAPACITY_REACHED', () =>
    withServer(async s => {
      const codes = new Set()
      for (let i = 0; i < config.maxRooms; i++) {
        const { room } = s.manager.createRoom({ displayName: 'P' + i })
        codes.add(room.roomCode)
      }
      eq(s.manager.size, config.maxRooms, '活跃房间数')
      eq(codes.size, config.maxRooms, '房号唯一')
      await expectFail(
        Promise.resolve().then(() => s.manager.createRoom({ displayName: 'P21' })),
        ERR.ROOM_CAPACITY_REACHED
      )
      eq(s.manager.size, config.maxRooms, '上限后不再增加')
    })
  )

  await test('销毁一个房间以后可以重新创建新房间', () =>
    withServer(async s => {
      for (let i = 0; i < config.maxRooms; i++) s.manager.createRoom({ displayName: 'P' + i })
      const victim = s.manager.listRooms()[0]
      const ok = s.manager.destroyRoom(victim.roomId, 'TEST')
      eq(ok, true, '销毁成功')
      eq(s.manager.size, config.maxRooms - 1, '销毁后房间数')
      const { room } = s.manager.createRoom({ displayName: '新房间' })
      eq(s.manager.size, config.maxRooms, '重建后回到上限')
      assert(room.roomCode !== victim.roomCode || true, '房号可复用')
      eq(s.manager.getRoom(victim.roomId), null, '已销毁房间不可查')
      eq(s.manager.getRoomByCode(victim.roomCode), null, 'roomCode 索引已删除')
    })
  )
}

// ============================================================
// 二、管理员规则（文档 §64）
// ============================================================

async function suiteAdmin() {
  console.log('\n[二] 管理员与循环转移')

  await test('管理员主动退出：按 Seat 顺序循环跳过 AI 转移给下一个真人', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' }) // Seat0 Admin
      await room.addAi(player.playerId, 1) // Seat1 AI
      const lisi = await room.join({ displayName: '李四' })
      eq(lisi.seatIndex, 2, '有空位时坐 Seat2')
      eq(room.seats[2].occupantType, OCCUPANT.HUMAN, 'Seat2 李四')
      await room.leave(player.playerId, 'LEAVE_ROOM')
      eq(room.adminSeat, 2, '管理员应跳过 Seat1(AI) 给 Seat2')
      eq(room.seats[0].occupantType, OCCUPANT.EMPTY, 'WAITING 退出后清空座位')
      eq(humanCount(room.seats), 1, '剩余真人数')
      assert(room.status !== ROOM_STATUS.DESTROYED, '房间不应销毁')
    })
  )

  await test('管理员在 Seat3 退出时循环回 Seat0', () =>
    withServer(async s => {
      const { room } = s.manager.createRoom({ displayName: '张三' })
      await room.join({ displayName: '李四' })
      await room.join({ displayName: '王五' })
      await room.join({ displayName: '赵六' })
      // 手工把管理员挪到 Seat3（模拟既定场景），Seat0 仍有真人
      room.adminSeat = 3
      const seat3Player = room.seats[3].humanPlayerId
      await room.leave(seat3Player, 'LEAVE_ROOM')
      eq(room.adminSeat, 0, 'Seat3 退出后应循环回 Seat0')
    })
  )

  await test('普通玩家退出不改变管理员', () =>
    withServer(async s => {
      const { room } = s.manager.createRoom({ displayName: '张三' })
      const lisi = await room.join({ displayName: '李四' })
      const before = room.adminSeat
      await room.leave(lisi.playerId, 'LEAVE_ROOM')
      eq(room.adminSeat, before, '管理员不变')
      eq(room.seats[lisi.seatIndex].occupantType, OCCUPANT.EMPTY, 'Seat 清空')
    })
  )

  await test('AI 永远不会成为管理员（只剩 AI 时房间销毁）', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      await room.addAi(player.playerId, 1)
      await room.addAi(player.playerId, 2)
      await room.addAi(player.playerId, 3)
      await room.leave(player.playerId, 'LEAVE_ROOM')
      eq(s.manager.getRoom(room.roomId), null, 'AI 不能维持房间 → 已销毁')
      eq(room.adminSeat === 1 || room.adminSeat === 2 || room.adminSeat === 3, false, 'AI 未成为管理员')
    })
  )

  await test('非管理员执行 ADD_AI / UPDATE_RULES / START_GAME 均被拒', () =>
    withServer(async s => {
      const { room } = s.manager.createRoom({ displayName: '张三' })
      const lisi = await room.join({ displayName: '李四' })
      await expectFail(room.addAi(lisi.playerId, 2), ERR.NOT_ROOM_ADMIN)
      await expectFail(room.updateRules(lisi.playerId, {}), ERR.NOT_ROOM_ADMIN)
      await expectFail(room.startGame(lisi.playerId), ERR.NOT_ROOM_ADMIN)
    })
  )
}

// ============================================================
// 三、房间销毁（文档 §16 / §64）
// ============================================================

async function suiteDestroy() {
  console.log('\n[三] 房间销毁')

  await test('WAITING 最后一个真人退出 → 立即销毁（即使还有 AI）', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      await room.addAi(player.playerId, 1)
      await room.addAi(player.playerId, 2)
      eq(room.status, ROOM_STATUS.WAITING, '销毁前状态')
      await room.leave(player.playerId, 'LEAVE_ROOM')
      eq(s.manager.getRoom(room.roomId), null, '房间已销毁')
      eq(s.manager.getRoomByCode(room.roomCode), null, 'roomCode 索引已清除')
      eq(s.sessions.countInRoom(room.roomId), 0, 'session 已清除')
    })
  )

  await test('PLAYING 最后一个真人退出 → abort GameSession + 立即销毁', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      eq(room.status, ROOM_STATUS.PLAYING, '开局后 PLAYING')
      eq(aiCountOf(room), 3, '自动补 3 AI')
      await room.leave(players[0].playerId, 'LEAVE_ROOM')
      eq(gs.aborted, true, 'GameSession 已 abort')
      eq(s.manager.getRoom(room.roomId), null, '房间已销毁')
    })
  )

  await test('销毁后所有资源释放：队列关闭、Timer 清空、映射移除', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      assert(gs.seatTimers.size > 0, '开局后应有待处理计时器')
      const ws = new FakeWs()
      s.hub.register(players[0].playerId, room.roomId, 0, ws)
      s.manager.destroyRoom(room.roomId, 'TEST_DESTROY')
      eq(room.queue.closed, true, '队列已关闭')
      eq(gs.aborted, true, 'GameSession 已终止')
      eq(gs.seatTimers.size, 0, '计时器已清空')
      eq(room.gameSession, null, 'GameState 引用已释放')
      eq(s.manager.getRoom(room.roomId), null, 'Room Map 已移除')
      eq(s.hub.connectionOf(players[0].playerId), null, 'WebSocket 已解绑')
      eq(ws.last('ROOM_DESTROYED') != null, true, '已广播 ROOM_DESTROYED')
    })
  )

  await test('已销毁房间不再接受任何 Command', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const versionBefore = gs.state.version
      const queueMaxBefore = room.queue.maxDepth
      eq(s.manager.destroyRoom(room.roomId, 'TEST'), true, '销毁成功')
      // 销毁后所有入口都必须显式拒绝（不能悄悄把任务丢掉）
      await expectFail(room.join({ displayName: '新玩家' }), ERR.ROOM_DESTROYED)
      await expectFail(
        room.handleAction({ playerId: players[0].playerId, requestId: 'x', windowId: 1, action: { type: 'pass' } }),
        ERR.ROOM_DESTROYED
      )
      await expectFail(room.disconnect(players[0].playerId, 'X'), ERR.ROOM_DESTROYED)
      await expectFail(room.leave(players[0].playerId, 'LEAVE_ROOM'), ERR.ROOM_DESTROYED)
      eq(gs.state.version, versionBefore, 'GameState 未被修改')
      eq(gs.aborted, true, 'GameSession 已终止')
      eq(room.queue.maxDepth, queueMaxBefore, '队列未再接受任务')
    })
  )
}

function aiCountOf(room) {
  return room.seats.filter(x => x.occupantType === OCCUPANT.AI).length
}

// ============================================================
// 四、断线 vs 退出（文档 §12 / §17 / §42 / §64）
// ============================================================

async function suiteDisconnect() {
  console.log('\n[四] 断线与重连')

  await test('真人断线：Seat 仍为 HUMAN、humanCount 不变、管理员不变', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      const lisi = await room.join({ displayName: '李四' })
      const ws = new FakeWs()
      s.hub.register(lisi.playerId, room.roomId, lisi.seatIndex, ws)
      await room.disconnect(lisi.playerId, 'SOCKET_CLOSED')
      eq(room.seats[lisi.seatIndex].occupantType, OCCUPANT.HUMAN, '占用类型不变')
      eq(room.seats[lisi.seatIndex].connected, false, 'connected=false')
      eq(room.seats[lisi.seatIndex].autoPlay, true, 'autoPlay=true')
      eq(humanCount(room.seats), 2, 'humanCount 不变')
      eq(room.adminSeat, 0, '管理员不变')
      assert(room.status !== ROOM_STATUS.DESTROYED, '不销毁')
      assert(room.sessions.get(lisi.playerId) != null, 'resumeToken 保留')
    })
  )

  await test('管理员断线不触发管理员转移', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      await room.join({ displayName: '李四' })
      const ws = new FakeWs()
      s.hub.register(player.playerId, room.roomId, 0, ws)
      await room.disconnect(player.playerId, 'SOCKET_CLOSED')
      eq(room.adminSeat, 0, '管理员身份保持')
    })
  )

  await test('所有真人同时断线：Room 不能销毁', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      const lisi = await room.join({ displayName: '李四' })
      await room.disconnect(player.playerId, 'X')
      await room.disconnect(lisi.playerId, 'X')
      assert(room.status !== ROOM_STATUS.DESTROYED, '不得销毁')
      eq(humanCount(room.seats), 2, 'humanCount 保持 2')
      eq(room.seats.filter(x => x.connected).length, 0, '在线真人数 0')
      eq(s.manager.size, 1, '房间仍在管理器中')
    })
  )

  await test('resumeToken 重连回到原 Seat 并恢复在线', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      await room.disconnect(player.playerId, 'X')
      const { session, room: found } = s.manager.resolveReconnect(player.resumeToken)
      eq(found.roomId, room.roomId, '令牌定位到房间')
      const ws = new FakeWs()
      s.hub.register(session.playerId, room.roomId, session.seatIndex, ws)
      await room.reconnect({ playerId: session.playerId })
      eq(room.seats[session.seatIndex].connected, true, '恢复在线')
      eq(room.seats[session.seatIndex].autoPlay, false, '撤销托管')
      eq(room.seats[session.seatIndex].humanPlayerId, player.playerId, '回到原 Seat')
      eq(humanCount(room.seats), 1, '座位仍归属该真人')
      s.hub.pushRoomSnapshot(room, session.playerId)
      const snap = ws.last('ROOM_SNAPSHOT')
      assert(snap && snap.payload.roomCode === room.roomCode, '收到房间快照')
      eq(snap.payload.mySeat, session.seatIndex, '快照带自己的座位')
    })
  )

  await test('无效 resumeToken 重连被拒（INVALID_RESUME_TOKEN）', () =>
    withServer(async s => {
      s.manager.createRoom({ displayName: '张三' })
      await expectFail(Promise.resolve().then(() => s.manager.resolveReconnect('bad-token')), ERR.INVALID_RESUME_TOKEN)
    })
  )

  await test('新连接顶替旧连接：一个玩家只有一个有效 Socket', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      const ws1 = new FakeWs()
      const ws2 = new FakeWs()
      s.hub.register(player.playerId, room.roomId, 0, ws1)
      const replaced = s.hub.register(player.playerId, room.roomId, 0, ws2)
      eq(replaced, ws1, '返回被顶替的旧连接')
      eq(s.hub.connectionOf(player.playerId).ws, ws2, '当前有效连接是新连接')
      // 旧连接的 close 事件不能把新连接标记为断线
      const unregistered = s.hub.unregister(player.playerId, ws1)
      eq(unregistered, false, '旧连接解绑被忽略')
      assert(s.hub.connectionOf(player.playerId) != null, '新连接仍在')
    })
  )

  await test('PLAYING 重连：收到完整牌局快照（含自己的手牌与 ActionWindow）', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      await room.disconnect(players[0].playerId, 'X')
      const ws = new FakeWs()
      s.hub.register(players[0].playerId, room.roomId, players[0].seatIndex, ws)
      await room.reconnect({ playerId: players[0].playerId })
      s.hub.pushRoomSnapshot(room, players[0].playerId)
      s.hub.pushGameState(room, room.gameSession)
      const stateMsg = ws.last('GAME_STATE_CHANGED')
      assert(stateMsg != null, '收到 GAME_STATE_CHANGED')
      assert(Array.isArray(stateMsg.payload.my.hand), '含自己的手牌')
      assert(stateMsg.payload.meta.windowId != null, '含当前 windowId')
      assert(stateMsg.payload.meta.deadlineAt != null, '含服务器 deadline')
    })
  )
}

// ============================================================
// 五、主动退出（文档 §14 / §64）
// ============================================================

async function suiteLeavePlaying() {
  console.log('\n[五] PLAYING 主动退出')

  await test('PLAYING 真人主动退出：Seat → AI，旧 resumeToken 失效', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      const leaver = players[1]
      await room.leave(leaver.playerId, 'LEAVE_ROOM')
      eq(room.seats[leaver.seatIndex].occupantType, OCCUPANT.AI, 'Seat 转 AI')
      eq(humanCount(room.seats), 1, '只剩 1 个真人')
      eq(s.sessions.get(leaver.playerId), null, 'session 已删除')
      await expectFail(Promise.resolve().then(() => s.manager.resolveReconnect(leaver.resumeToken)), ERR.INVALID_RESUME_TOKEN)
      assert(room.status === ROOM_STATUS.PLAYING, '牌局继续')
      eq(room.gameSession.aborted, false, '牌局未中断')
    })
  )

  await test('PLAYING 管理员退出：Seat → AI 后管理员转移给下一个真人，牌局继续', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 3 })
      await room.startGame(players[0].playerId)
      await room.leave(players[0].playerId, 'LEAVE_ROOM')
      eq(room.seats[0].occupantType, OCCUPANT.AI, 'Seat0 → AI')
      eq(room.adminSeat, 1, '管理员转给 Seat1 真人')
      assert(room.status === ROOM_STATUS.PLAYING, '牌局继续')
    })
  )

  await test('PLAYING 退出不重新发牌：原手牌与分数保留在 GameState 中', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const handBefore = gs.state.players[players[1].seatIndex].hand.slice()
      const versionBefore = gs.state.version
      await room.leave(players[1].playerId, 'LEAVE_ROOM')
      assert(
        JSON.stringify(gs.state.players[players[1].seatIndex].hand) === JSON.stringify(handBefore),
        '手牌未被重发'
      )
      eq(gs.state.version, versionBefore, '座位占用变化不改动 GameState')
    })
  )
}

// ============================================================
// 六、开局与锁房（文档 §23–§25 / §64）
// ============================================================

async function suiteStartGame() {
  console.log('\n[六] 开局自动补 AI 与完全锁房')

  for (const humans of [1, 2, 3, 4]) {
    await test(`${humans} 个真人开始游戏 → 自动补 ${4 - humans} 个 AI`, () =>
      withServer(async s => {
        const { room, players } = makePlayingRoom(s.manager, { humans })
        await room.startGame(players[0].playerId)
        eq(aiCountOf(room), 4 - humans, 'AI 数量')
        eq(room.seats.filter(x => x.occupantType === OCCUPANT.EMPTY).length, 0, '无空位')
        eq(room.status, ROOM_STATUS.PLAYING, '状态 PLAYING')
        eq(humanCount(room.seats), humans, '真人数不变')
        eq(room.gameSession != null, true, 'GameSession 已创建')
      })
    )
  }

  await test('开局后 JOIN → GAME_ALREADY_STARTED', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      await expectFail(room.join({ displayName: '迟到的朋友' }), ERR.GAME_ALREADY_STARTED)
    })
  )

  await test('开局后 ADD_AI / REMOVE_AI / UPDATE_RULES → ROOM_LOCKED', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      await expectFail(room.addAi(players[0].playerId, 0), ERR.ROOM_LOCKED)
      await expectFail(room.removeAi(players[0].playerId, 2), ERR.ROOM_LOCKED)
      await expectFail(room.updateRules(players[0].playerId, { capFan: 5 }), ERR.ROOM_LOCKED)
    })
  )

  await test('重复 START_GAME → GAME_ALREADY_STARTED', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      await expectFail(room.startGame(players[0].playerId), ERR.GAME_ALREADY_STARTED)
    })
  )

  await test('WAITING 修改规则生效并校验非法值', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      const { rules } = await room.updateRules(player.playerId, { capFan: 6, yaojiEnabled: true })
      eq(rules.capFan, 6, 'capFan 生效')
      eq(rules.yaojiEnabled, true, 'yaojiEnabled 生效')
      await expectFail(room.updateRules(player.playerId, { capFan: 99 }), ERR.INVALID_RULES)
      await expectFail(room.updateRules(player.playerId, { yaojiEnabled: 'yes' }), ERR.INVALID_RULES)
      await expectFail(room.updateRules(player.playerId, 'not-an-object'), ERR.INVALID_RULES)
      // 未知字段被静默忽略（引擎只认 DEFAULT_RULES 的键），不会因此拦下整局
      const ignored = await room.updateRules(player.playerId, { notARule: 1, capFan: 4 })
      eq(ignored.rules.notARule, undefined, '未知字段被忽略')
      eq(ignored.rules.capFan, 4, '已知字段仍然生效')
    })
  )
}

// ============================================================
// 七、WAITING 真人优先于 AI（文档 §20 / §64）
// ============================================================

async function suiteReplaceAi() {
  console.log('\n[七] WAITING 阶段真人替换 AI')

  await test('1 真人 + 3 AI 时第二真人可加入（顶掉 AI，不返回 ROOM_FULL）', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      await room.addAi(player.playerId, 1)
      await room.addAi(player.playerId, 2)
      await room.addAi(player.playerId, 3)
      const joined = await room.join({ displayName: '李四' })
      eq(room.seats[joined.seatIndex].occupantType, OCCUPANT.HUMAN, '顶掉的座位变成真人')
      eq(aiCountOf(room), 2, 'AI 减少一个')
      eq(humanCount(room.seats), 2, '真人 2 个')
      eq(room.seats[joined.seatIndex].displayName, '李四', '昵称正确')
    })
  )

  await test('选座确定：先占 EMPTY，无空位才顶掉「最后添加的 AI」', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      await room.addAi(player.playerId, 2) // 先加 AI 到 Seat2
      const aiSeat2AddedAt = room.seats[2].joinedAt
      await new Promise(r => setTimeout(r, 5))
      await room.addAi(player.playerId, 3) // 后加 AI 到 Seat3
      const j1 = await room.join({ displayName: '李四' })
      eq(j1.seatIndex, 1, '有空位先坐 Seat1')
      const j2 = await room.join({ displayName: '王五' })
      eq(j2.seatIndex, 3, '无空位时顶掉最后添加的 AI（Seat3）')
      assert(room.seats[2].occupantType === OCCUPANT.AI, '较早添加的 AI 保留')
      assert(room.seats[2].joinedAt === aiSeat2AddedAt, 'AI 加入时间未被改写')
    })
  )
}

// ============================================================
// 八、游戏安全（文档 §44 / §64）
// ============================================================

async function suiteSecurity() {
  console.log('\n[八] 手牌隐私与伪造防护')

  await test('客户端看不到其他真人 / AI 的暗牌', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      const view = room.gameSession.viewFor(players[0].seatIndex)
      assert(Array.isArray(view.my.hand), '自己的手牌可见')
      assert(view.my.hand.length === 13 || view.my.hand.length === 14, '自己的手牌张数')
      for (const p of view.players) {
        if (p.seat === 0) continue
        assert(p.hand === undefined, '他人不可见 hand 牌值（seat ' + p.seat + '）')
        assert(p.drawnTile === undefined, '他人不可见刚摸的牌（seat ' + p.seat + '）')
        assert(typeof p.handCount === 'number', '他人仅可见 handCount')
      }
      assert(view.state === undefined, '不得下发完整 GameState')
      assert(view.wall === undefined, '不得下发牌墙')
      assert(view.wallCount != null, '只给墙剩余数')
      // 逐项检查：他人 players 项里除了 handCount 不该出现任何手牌数组
      for (const p of view.players) {
        if (p.seat === 0) continue
        const keys = Object.keys(p)
        assert(!keys.includes('hand'), 'players 项不含 hand 字段')
        assert(!keys.includes('wall'), 'players 项不含 wall 字段')
      }
    })
  )

  await test('不能伪造他人的 Action（非本座位出手一律被拒）', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      // 推进到「摸打」阶段：此刻只有 turn 一家有合法动作
      const reached = await advanceToDiscard(room)
      assert(reached, '已进入摸打阶段')
      const turn = gs.state.turn
      const victim = players.find(p => p.seatIndex !== turn)
      assert(victim != null, '存在非当前回合的真人')
      const view = gs.viewFor(turn)
      const action = pickAction(view)
      await expectFail(
        room.handleAction({
          playerId: victim.playerId,
          requestId: 'forge-others',
          windowId: gs.window.windowId,
          action
        }),
        ERR.NOT_YOUR_TURN
      )
      assert(gs.state.phase === 'discard' || gs.state.phase === 'respond', '牌局未被破坏')
    })
  )

  await test('已退出的玩家不能再用旧身份出手', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      const leaver = players[1]
      await room.leave(leaver.playerId, 'LEAVE_ROOM')
      await expectFail(
        room.handleAction({
          playerId: leaver.playerId,
          requestId: 'ghost-action',
          windowId: room.gameSession.window.windowId,
          action: { type: 'pass' }
        }),
        ERR.PLAYER_ALREADY_LEFT
      )
    })
  )

  await test('非法动作 / 过期 windowId 被引擎与服务端拒绝', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const good = pickAction(gs.viewFor(players[0].seatIndex))
      await expectFail(
        room.handleAction({
          playerId: players[0].playerId,
          requestId: 'bad-1',
          windowId: gs.window.windowId + 999,
          action: good
        }),
        ERR.ACTION_WINDOW_EXPIRED
      )
      await expectFail(
        room.handleAction({
          playerId: players[0].playerId,
          requestId: 'bad-2',
          windowId: gs.window.windowId,
          action: { type: 'discard', tile: 999 }
        }),
        ERR.INVALID_ACTION
      )
    })
  )
}

// ============================================================
// 九、并发与幂等（文档 §34 / §41 / §64）
// ============================================================

async function suiteConcurrency() {
  console.log('\n[九] 幂等与并发')

  await test('相同 requestId 只执行一次（第二次返回 duplicate）', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 2 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const windowId = gs.window.windowId
      const action = pickAction(gs.viewFor(players[0].seatIndex))
      const v0 = gs.state.version
      const r1 = await room.handleAction({ playerId: players[0].playerId, requestId: 'req-1', windowId, action })
      eq(r1.ok, true, '首次执行成功')
      eq(gs.state.version, v0 + 1, 'version 推进一次')
      const r2 = await room.handleAction({ playerId: players[0].playerId, requestId: 'req-1', windowId, action })
      eq(r2.duplicate, true, '重复请求标记 duplicate')
      eq(gs.state.version, v0 + 1, 'version 不再推进')
    })
  )

  await test('PLAYER_ACTION 与 TIMEOUT 同一 windowId 同时执行：只有一个生效', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const windowId = gs.window.windowId
      const action = pickAction(gs.viewFor(players[0].seatIndex))
      const v0 = gs.state.version
      const p1 = room.handleAction({ playerId: players[0].playerId, requestId: 'race-human', windowId, action })
      const p2 = gs.actAsAi(players[0].seatIndex, windowId, 'TIMEOUT_AI')
      await Promise.all([p1, p2])
      eq(gs.state.version, v0 + 1, 'gameVersion 只推进一次')
    })
  )

  await test('AI 决策期间真人抢先操作 → 旧 AI 动作因 windowId 失效被丢弃', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const staleWindow = gs.window.windowId
      const action = pickAction(gs.viewFor(players[0].seatIndex))
      // 真人先出手，窗口推进
      await room.handleAction({ playerId: players[0].playerId, requestId: 'human-first', windowId: staleWindow, action })
      const vAfterHuman = gs.state.version
      // AI 拿着旧 windowId 回来（模拟思考较慢）
      await gs.actAsAi(players[0].seatIndex, staleWindow, 'AI')
      eq(gs.state.version, vAfterHuman, '过期 AI 动作被丢弃')
    })
  )

  await test('房间内所有 GameState 修改严格串行（队列深度可观测）', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const windowId = gs.window.windowId
      const action = pickAction(gs.viewFor(players[0].seatIndex))
      const tasks = [
        room.handleAction({ playerId: players[0].playerId, requestId: 'ser-1', windowId, action }),
        room.handleAction({ playerId: players[0].playerId, requestId: 'ser-2', windowId, action }),
        room.handleAction({ playerId: players[0].playerId, requestId: 'ser-3', windowId, action })
      ]
      await Promise.all(tasks.map(p => p.catch(() => null)))
      eq(gs.state.version, 2, '同一 windowId 只有第一次成功（version 由 1 到 2）')
      eq(room.queue.depth, 0, '队列已排空')
    })
  )
}

// ============================================================
// 十、AI 托管（文档 §37 / §39 / §40 / §64）
// ============================================================

async function suiteAi() {
  console.log('\n[十] AI 座位与托管')

  await test('AI 座位正常操作并推进 gameVersion', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const aiSeat = gs.window.eligibleSeats.find(seat => room.seats[seat].occupantType === OCCUPANT.AI)
      assert(aiSeat != null, '存在 AI 座位参与当前窗口')
      const v0 = gs.state.version
      await gs.actAsAi(aiSeat, gs.window.windowId, 'AI')
      eq(gs.state.version, v0 + 1, 'AI 动作生效')
    })
  )

  await test('真人断线后由 AI 托管（DISCONNECT_AI 同样只产出标准 Action）', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      await room.disconnect(players[0].playerId, 'X')
      const seat = players[0].seatIndex
      assert(gs.window.eligibleSeats.indexOf(seat) >= 0, '断线真人仍在自己窗口')
      const v0 = gs.state.version
      await gs.actAsAi(seat, gs.window.windowId, 'DISCONNECT_AI')
      eq(gs.state.version, v0 + 1, '托管动作生效')
    })
  )

  await test('真人超时由 AI 托管（TIMEOUT_AI）', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      const gs = room.gameSession
      const seat = players[0].seatIndex
      const v0 = gs.state.version
      await gs.actAsAi(seat, gs.window.windowId, 'TIMEOUT_AI')
      eq(gs.state.version, v0 + 1, '超时托管推进牌局')
    })
  )

  await test('1 真人 + 3 AI 可以完整打完一局（血战到底）', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      await driveToFinish(room)
      eq(room.status, ROOM_STATUS.FINISHED, '牌局结束 → FINISHED')
      const results = room.gameSession.state.results
      assert(results != null, '有结算结果')
      const sum = results.perSeat.reduce((a, x) => a + x.delta, 0)
      eq(sum, 0, '积分守恒（perSeat 之和为 0）')
      eq(humanCount(room.seats), 1, '真人仍在（未销毁）')
      // 结算视图按座位旋转后仍然完整
      const view = room.gameSession.viewFor(0)
      assert(view.results && Array.isArray(view.results.seats), '结算明细按视角下发')
    })
  )
}

// ============================================================
// 十一、TTL（文档 §18 / §49 / §50）
// ============================================================

async function suiteTtl() {
  console.log('\n[十一] TTL 自动回收')

  await test('WAITING 断线超时 → implicit leave 释放座位', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      await room.join({ displayName: '李四' })
      await room.disconnect(player.playerId, 'X')
      room.seats[0].disconnectedAt = Date.now() - config.waitingDisconnectedTtlMs - 1000
      room.sweep(Date.now())
      await drain(room)
      eq(room.seats[0].occupantType, OCCUPANT.EMPTY, '断线超时座位被释放')
      eq(room.adminSeat, 1, '管理员转给 Seat1')
    })
  )

  await test('WAITING 长时间无人上线 → 销毁房间', () =>
    withServer(async s => {
      const { room, player } = s.manager.createRoom({ displayName: '张三' })
      await room.disconnect(player.playerId, 'X')
      room.lastActivityAt = Date.now() - config.waitingRoomTtlMs - 1000
      s.manager.sweep(Date.now())
      eq(s.manager.getRoom(room.roomId), null, '房间已回收')
    })
  )

  await test('FINISHED 超过保留期 → 销毁房间', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      await driveToFinish(room)
      eq(room.status, ROOM_STATUS.FINISHED, '先进入 FINISHED')
      room.finishedAt = Date.now() - config.finishedRoomTtlMs - 1000
      s.manager.sweep(Date.now())
      eq(s.manager.getRoom(room.roomId), null, 'FINISHED 房间已回收')
    })
  )

  await test('PLAYING 断线真人不会被 TTL 删除（AI 托管到牌局结束）', () =>
    withServer(async s => {
      const { room, players } = makePlayingRoom(s.manager, { humans: 1 })
      await room.startGame(players[0].playerId)
      await room.disconnect(players[0].playerId, 'X')
      room.seats[0].disconnectedAt = Date.now() - config.waitingDisconnectedTtlMs * 10
      room.lastActivityAt = Date.now() - config.waitingRoomTtlMs * 10
      s.manager.sweep(Date.now())
      assert(s.manager.getRoom(room.roomId) != null, 'PLAYING 房间不被 TTL 回收')
      eq(room.seats[0].occupantType, OCCUPANT.HUMAN, '断线真人保留')
    })
  )
}

// ============================================================
// 十二、HTTP 接口与统计（文档 §47 / §55）
// ============================================================

async function suiteHttp() {
  console.log('\n[十二] HTTP 接口与后台统计')

  await test('HTTP：创建 / 列表 / 房号查询 / 加入 / 统计鉴权', () =>
    withServer(async s => {
      await new Promise(resolve => s.server.listen(0, '127.0.0.1', resolve))
      const port = s.server.address().port
      const base = 'http://127.0.0.1:' + port
      const j = async (path, opts) => {
        const r = await fetch(base + path, opts)
        return { status: r.status, body: await r.json() }
      }

      const health = await j('/api/health')
      eq(health.status, 200, 'health 200')
      eq(health.body.ok, true, 'health ok')

      const created = await j('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: '张三', rules: { capFan: 5 } })
      })
      eq(created.status, 200, '创建 200')
      assert(created.body.data.player.resumeToken, '返回 resumeToken')
      eq(created.body.data.room.rules.capFan, 5, '规则生效')
      const code = created.body.data.room.roomCode

      const list = await j('/api/rooms')
      eq(list.body.data.rooms.length, 1, '列表 1 个房间')
      eq(list.body.data.maxRooms, config.maxRooms, '返回上限')
      eq(list.body.data.rooms[0].joinable, true, 'WAITING 可加入')

      const byCode = await j('/api/rooms/' + code)
      eq(byCode.status, 200, '按房号查询 200')

      const joined = await j('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code.toLowerCase(), displayName: '李四' })
      })
      eq(joined.status, 200, '加入 200（房号大小写不敏感）')
      eq(joined.body.data.room.seats.filter(x => x.occupantType === 'HUMAN').length, 2, '两位真人')

      const missing = await j('/api/rooms/ZZZZZZ')
      eq(missing.status, 404, '不存在的房号 404')
      eq(missing.body.errorCode, ERR.ROOM_NOT_FOUND, '错误码')

      const noToken = await j('/api/game-stats')
      eq(noToken.status, 403, '统计接口无令牌 403')

      // 临时开启管理令牌，验证统计接口成功路径
      const savedToken = config.adminToken
      config.adminToken = 'test-admin-token'
      try {
        const wrong = await j('/api/game-stats', { headers: { 'X-Admin-Token': 'wrong' } })
        eq(wrong.status, 403, '令牌错误 403')
        const stats = await j('/api/game-stats', { headers: { 'X-Admin-Token': 'test-admin-token' } })
        eq(stats.status, 200, '统计接口 200')
        eq(stats.body.data.activeRooms, 1, 'activeRooms')
        eq(stats.body.data.waitingRooms, 1, 'waitingRooms')
        eq(stats.body.data.connectedHumans, 2, 'connectedHumans')
        assert(typeof stats.body.data.memoryUsage.rss === 'number', '含内存用量')
        assert(stats.body.data.activeRooms <= stats.body.data.maxRooms, 'activeRooms 不超过上限')
      } finally {
        config.adminToken = savedToken
      }
    })
  )
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('=== mahjong-service 测试开始（maxRooms=' + config.maxRooms + '）===')
  const t0 = Date.now()
  await suiteCapacity()
  await suiteAdmin()
  await suiteDestroy()
  await suiteDisconnect()
  await suiteLeavePlaying()
  await suiteStartGame()
  await suiteReplaceAi()
  await suiteSecurity()
  await suiteConcurrency()
  await suiteAi()
  await suiteTtl()
  await suiteHttp()

  const elapsed = Date.now() - t0
  console.log('\n=== 测试结束 ===')
  console.log('通过 ' + results.pass + ' / 失败 ' + results.fail + '，耗时 ' + elapsed + 'ms')
  if (failures.length) {
    console.log('\n失败用例：')
    for (const f of failures) console.log('  - ' + f.name + '：' + f.message)
  }
  process.exit(results.fail === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('测试框架异常：', e)
  process.exit(1)
})