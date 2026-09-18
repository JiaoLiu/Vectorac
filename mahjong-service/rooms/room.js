// ============================================================
// 房间（mahjong-service/rooms/room.js）
// ------------------------------------------------------------
// 一个 Room = 4 个 Seat + 一条串行事件队列 + 可选的一个 GameSession。
//
// 铁律（文档 §六十八）：
//   · 任何会修改 Room / GameState 的操作都必须走 this.queue（串行）；
//   · Admin 必须是 HUMAN；AI 永远不能成为管理员；
//   · DISCONNECT 不减少 humanCount、不转移管理员；只有 LEAVE 才永久退出；
//   · PLAYING 的 HUMAN Leave → 该 Seat 转 AI（不重新发牌、不重建 Seat）；
//   · humanCount == 0 → 立即走 RoomManager.destroyRoom 统一销毁；
//   · PLAYING 后完全锁房：JOIN / ADD_AI / REMOVE_AI / UPDATE_RULES 全拒。
//
// 统一销毁入口：Room 自己绝不 rooms.delete()，只调用 manager.destroyRoom()。
// ============================================================

import { randomInt, randomUUID } from 'node:crypto'
import { DEFAULT_RULES } from '../engine/contract.js'
import { config } from '../config.js'
import { ERR, fail } from '../errors.js'
import {
  OCCUPANT,
  ROOM_STATUS,
  aiCount,
  clearSeat,
  connectedHumanCount,
  createSeats,
  humanCount,
  nextAdminSeat,
  pickJoinSeat,
  seatOfPlayer,
  seatSnapshot,
  setAi,
  setHuman
} from './seat.js'
import { RoomQueue } from './room-queue.js'
import { GameSession } from './game-session.js'
import { roomSummary } from './serializer.js'

const RULE_KEYS = Object.keys(DEFAULT_RULES)
/** 牌墙每边牌位（双层 2×7），与前端 ui.js WALL_SIDE_SLOTS 一致 */
const WALL_SEG = 14
/** 数值型规则的合法区间（越界直接 INVALID_RULES，不做静默 clamp） */
const RULE_RANGES = {
  baseScore: [1, 100],
  capFan: [2, 6],
  zimoFan: [0, 10],
  haidiFan: [0, 10],
  gangShangFan: [0, 10],
  qianggangFan: [0, 10],
  genFan: [0, 10],
  gangMing: [0, 20],
  gangAn: [0, 20],
  gangBu: [0, 20],
  xiThree: [0, 100],
  xiFour: [0, 100],
  endWhenHuPlayers: [1, 4]
}

/**
 * 规则清洗（文档 §23）：只接受 DEFAULT_RULES 里已有的字段，
 * 服务端固定项（players / ruleVersion）不允许客户端改写。
 * 未知字段（如未来可能出现的 variant）一律忽略——引擎只认 DEFAULT_RULES 的键，
 * 静默忽略比直接报错更不容易因前端多带一个字段就把整局拦下来；
 * 但已知字段的类型与取值区间必须合法，越界返回 INVALID_RULES。
 */
export function sanitizeRules(input) {
  const out = { ...DEFAULT_RULES }
  if (input == null) return out
  if (typeof input !== 'object') fail(ERR.INVALID_RULES, 'rules 必须是对象')
  const fixed = new Set(['ruleVersion', 'players'])
  for (const key of RULE_KEYS) {
    if (fixed.has(key)) continue
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue
    const def = DEFAULT_RULES[key]
    const val = input[key]
    if (typeof def === 'boolean') {
      if (typeof val !== 'boolean') fail(ERR.INVALID_RULES, '规则 ' + key + ' 必须是布尔值')
      out[key] = val
      continue
    }
    const n = Math.floor(Number(val))
    if (!Number.isFinite(n)) fail(ERR.INVALID_RULES, '规则 ' + key + ' 必须是数字')
    const range = RULE_RANGES[key]
    if (range && (n < range[0] || n > range[1])) {
      fail(ERR.INVALID_RULES, '规则 ' + key + ' 超出允许范围 [' + range[0] + ',' + range[1] + ']')
    }
    out[key] = n
  }
  return out
}

export class Room {
  constructor({ roomId, roomCode, rules, manager, sessions, hub, aiService, logger }) {
    this.roomId = roomId || randomUUID()
    this.roomCode = roomCode
    this.status = ROOM_STATUS.WAITING
    this.adminSeat = -1
    this.rules = rules || { ...DEFAULT_RULES }
    this.seats = createSeats(config.seatsPerRoom)

    this.createdAt = Date.now()
    this.startedAt = null
    this.finishedAt = null
    this.lastActivityAt = this.createdAt
    this.roomVersion = 0
    this.destroyReason = null

    this.gameSession = null
    this.queue = new RoomQueue()
    /** requestId → {ok:true}：同一 requestId 最多执行一次（文档 §34） */
    this.processed = new Map()

    this.manager = manager
    this.sessions = sessions
    this.hub = hub
    this.aiService = aiService
    this.logger = logger || (() => {})
    this.aiLevel = config.aiLevel
  }

  // ---------- 基础 ----------

  touch() {
    this.lastActivityAt = Date.now()
  }

  bumpVersion() {
    this.roomVersion++
    return this.roomVersion
  }

  seatSnapshots() {
    return this.seats.map(seatSnapshot)
  }

  summary() {
    return roomSummary(this)
  }

  stats() {
    return {
      roomId: this.roomId,
      roomCode: this.roomCode,
      status: this.status,
      adminSeat: this.adminSeat,
      humanCount: humanCount(this.seats),
      connectedHumans: connectedHumanCount(this.seats),
      aiSeats: aiCount(this.seats),
      roomVersion: this.roomVersion,
      queueDepth: this.queue.depth,
      queueMaxDepth: this.queue.maxDepth,
      game: this.gameSession ? this.gameSession.stats() : null
    }
  }

  /** 统一销毁入口（文档 §48）：只调 manager，不在房间内部 delete */
  destroy(reason) {
    this.manager.destroyRoom(this.roomId, reason)
  }

  /**
   * 终态保护（文档 §48 第 2 步「停止接受新 Command」）：
   * 销毁后队列已 closed，入队会被静默跳过，所以必须在**入队之前**显式拒绝，
   * 让调用方拿到确定的 ROOM_DESTROYED，而不是无声无息。
   */
  _guardAlive() {
    if (this.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_DESTROYED, '房间已销毁')
  }

  // ---------- 创建期（房间刚建立，无需入队） ----------

  /** 创建者入座 Seat0 并成为第一任管理员（文档 §8 / §9） */
  placeFounder({ displayName }) {
    const session = this.sessions.create({
      roomId: this.roomId,
      seatIndex: 0,
      displayName
    })
    setHuman(this.seats[0], { playerId: session.playerId, displayName })
    this.adminSeat = 0
    this.touch()
    this.logger('room-created', { roomId: this.roomId, roomCode: this.roomCode })
    return session
  }

  // ---------- 加入（文档 §19 / §20） ----------

  async join({ displayName }) {
    this._guardAlive()
    return this.queue.push(() => {
      if (this.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_NOT_FOUND)
      if (this.status === ROOM_STATUS.PLAYING) fail(ERR.GAME_ALREADY_STARTED)
      if (this.status === ROOM_STATUS.FINISHED) fail(ERR.GAME_ALREADY_FINISHED)

      const seatIndex = pickJoinSeat(this.seats)
      if (seatIndex < 0) fail(ERR.ROOM_FULL)
      const seat = this.seats[seatIndex]
      const replacedAi = seat.occupantType === OCCUPANT.AI

      const session = this.sessions.create({ roomId: this.roomId, seatIndex, displayName })
      setHuman(seat, { playerId: session.playerId, displayName })
      this.touch()
      this.bumpVersion()
      this.logger('player-joined', {
        roomId: this.roomId,
        roomCode: this.roomCode,
        seatIndex,
        replacedAi
      })
      this.hub.broadcast(this, 'PLAYER_JOINED', {
        seatIndex,
        displayName: seat.displayName,
        replacedAi,
        adminSeat: this.adminSeat,
        seats: this.seatSnapshots()
      })
      return {
        playerId: session.playerId,
        resumeToken: session.resumeToken,
        displayName: session.displayName,
        seatIndex,
        roomId: this.roomId,
        roomCode: this.roomCode
      }
    })
  }

  // ---------- 断线 / 重连 / 退出（文档 §12–§18 / §40 / §42） ----------

  /** 断线：座位仍归该真人，AI 临时托管；不动 humanCount、不动管理员 */
  async disconnect(playerId, reason) {
    this._guardAlive()
    return this.queue.push(() => {
      const seat = seatOfPlayer(this.seats, playerId)
      if (!seat) return { changed: false }
      if (!seat.connected) return { changed: false }
      seat.connected = false
      seat.autoPlay = true
      seat.disconnectedAt = Date.now()
      this.touch()
      this.logger('player-disconnected', {
        roomId: this.roomId,
        seatIndex: seat.seatIndex,
        reason: reason || 'SOCKET_CLOSED'
      })
      this.hub.broadcast(this, 'PLAYER_DISCONNECTED', {
        seatIndex: seat.seatIndex,
        seats: this.seatSnapshots()
      })
      if (this.gameSession) this.gameSession.onSeatChanged(seat.seatIndex)
      return { changed: true, seatIndex: seat.seatIndex }
    })
  }

  /**
   * 重连：只认 resumeToken（调用方已校验并完成 socket 绑定）。
   * 重连成功 → connected=true、撤销 AI 托管、重开计时器、发完整快照。
   */
  async reconnect({ playerId }) {
    this._guardAlive()
    return this.queue.push(() => {
      const session = this.sessions.get(playerId)
      if (!session || session.roomId !== this.roomId) fail(ERR.INVALID_RESUME_TOKEN)
      const seat = this.seats[session.seatIndex]
      if (!seat || seat.occupantType !== OCCUPANT.HUMAN || seat.humanPlayerId !== playerId) {
        fail(ERR.PLAYER_ALREADY_LEFT)
      }
      seat.connected = true
      seat.autoPlay = false
      seat.disconnectedAt = null
      this.touch()
      this.logger('player-reconnected', { roomId: this.roomId, seatIndex: seat.seatIndex })
      this.hub.broadcast(this, 'PLAYER_CONNECTED', {
        seatIndex: seat.seatIndex,
        seats: this.seatSnapshots()
      })
      if (this.gameSession) this.gameSession.onSeatReconnected(seat.seatIndex)
      return { seatIndex: seat.seatIndex, playerId }
    })
  }

  /**
   * 主动退出（文档 §13 / §14 / §16）：
   *   WAITING/FINISHED → Seat 清空；PLAYING → Seat 转 AI（牌局继续，不重发牌）；
   *   管理员退出 → 循环转移；humanCount==0 → abort + 销毁。
   */
  async leave(playerId, reason) {
    this._guardAlive()
    return this.queue.push(() => this._leaveSync(playerId, reason || 'LEAVE_ROOM'))
  }

  _leaveSync(playerId, reason) {
    const seat = seatOfPlayer(this.seats, playerId)
    if (!seat) return { left: false, reason: 'NOT_IN_ROOM' }
    const seatIndex = seat.seatIndex
    const wasAdmin = this.adminSeat === seatIndex
    const playing = this.status === ROOM_STATUS.PLAYING && this.gameSession != null

    if (playing) {
      // 牌局已开始：座位必须转 AI，绝不变成 EMPTY（手牌/分数保存在 GameState 里）
      setAi(seat)
      seat.aiProfile = { level: this.aiLevel }
    } else {
      clearSeat(seat)
    }
    this.sessions.remove(playerId) // resumeToken 立即作废
    this.touch()
    this.bumpVersion()

    this.logger('player-leave', {
      roomId: this.roomId,
      seatIndex,
      wasAdmin,
      playing,
      reason,
      humanCount: humanCount(this.seats)
    })
    this.hub.broadcast(this, 'PLAYER_LEFT', {
      seatIndex,
      wasAdmin,
      seats: this.seatSnapshots()
    })

    if (playing) this.gameSession.onSeatChanged(seatIndex)

    if (wasAdmin && !this._transferAdmin(seatIndex)) {
      // 已无真人可接任 → 下面统一走 humanCount==0 的销毁分支
    }

    if (humanCount(this.seats) === 0) {
      if (this.gameSession) this.gameSession.abort('NO_HUMAN_PLAYERS')
      this.logger('room-no-human', { roomId: this.roomId, reason })
      this.destroy('NO_HUMAN_PLAYERS')
      return { left: true, destroyed: true, seatIndex }
    }
    return { left: true, destroyed: false, seatIndex }
  }

  /** 管理员循环转移（文档 §10）；返回是否找到下一个真人 */
  _transferAdmin(oldAdminSeat) {
    const next = nextAdminSeat(this.seats, oldAdminSeat)
    if (next < 0) return false
    this.adminSeat = next
    this.logger('admin-changed', { roomId: this.roomId, oldAdminSeat, newAdminSeat: next })
    this.hub.broadcast(this, 'ADMIN_CHANGED', { oldAdminSeat, newAdminSeat: next })
    return true
  }

  // ---------- 管理员命令（文档 §21–§25） ----------

  _requireAdmin(playerId) {
    const seat = seatOfPlayer(this.seats, playerId)
    if (!seat || this.adminSeat !== seat.seatIndex) fail(ERR.NOT_ROOM_ADMIN)
    return seat
  }

  _requireWaiting() {
    if (this.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_DESTROYED)
    if (this.status === ROOM_STATUS.PLAYING) fail(ERR.ROOM_LOCKED)
    if (this.status === ROOM_STATUS.FINISHED) fail(ERR.GAME_ALREADY_FINISHED)
  }

  _seatAt(index) {
    const i = Math.floor(Number(index))
    if (!Number.isFinite(i) || i < 0 || i >= this.seats.length) {
      fail(ERR.INVALID_ACTION, '座位号非法')
    }
    return this.seats[i]
  }

  async addAi(actorPlayerId, seatIndex) {
    this._guardAlive()
    return this.queue.push(() => {
      this._requireAdmin(actorPlayerId)
      this._requireWaiting()
      const seat = this._seatAt(seatIndex)
      if (seat.occupantType !== OCCUPANT.EMPTY) fail(ERR.INVALID_ACTION, '该座位不是空位')
      setAi(seat)
      seat.aiProfile = { level: this.aiLevel }
      this.touch()
      this.bumpVersion()
      this.hub.broadcast(this, 'AI_ADDED', {
        seatIndex: seat.seatIndex,
        seats: this.seatSnapshots()
      })
      return { seatIndex: seat.seatIndex }
    })
  }

  async removeAi(actorPlayerId, seatIndex) {
    this._guardAlive()
    return this.queue.push(() => {
      this._requireAdmin(actorPlayerId)
      this._requireWaiting()
      const seat = this._seatAt(seatIndex)
      if (seat.occupantType !== OCCUPANT.AI) fail(ERR.INVALID_ACTION, '只能删除 AI 座位')
      clearSeat(seat)
      this.touch()
      this.bumpVersion()
      this.hub.broadcast(this, 'AI_REMOVED', {
        seatIndex: seat.seatIndex,
        seats: this.seatSnapshots()
      })
      return { seatIndex: seat.seatIndex }
    })
  }

  async updateRules(actorPlayerId, rules) {
    this._guardAlive()
    return this.queue.push(() => {
      this._requireAdmin(actorPlayerId)
      this._requireWaiting()
      this.rules = sanitizeRules(rules)
      this.touch()
      this.bumpVersion()
      this.hub.broadcast(this, 'RULES_UPDATED', { rules: { ...this.rules } })
      return { rules: { ...this.rules } }
    })
  }

  /** 开始游戏（文档 §24 / §25）：EMPTY 自动补 AI，随后完全锁房 */
  async startGame(actorPlayerId) {
    this._guardAlive()
    return this.queue.push(() => {
      this._requireAdmin(actorPlayerId)
      if (this.status === ROOM_STATUS.PLAYING) fail(ERR.GAME_ALREADY_STARTED)
      if (this.status === ROOM_STATUS.FINISHED) fail(ERR.GAME_ALREADY_FINISHED)
      if (this.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_DESTROYED)
      if (humanCount(this.seats) < 1) fail(ERR.ROOM_NOT_FOUND, '房间已无真人')

      for (const seat of this.seats) {
        if (seat.occupantType !== OCCUPANT.EMPTY) continue
        setAi(seat)
        seat.aiProfile = { level: this.aiLevel }
      }

      this.status = ROOM_STATUS.PLAYING
      this.startedAt = Date.now()
      this.touch()
      this.bumpVersion()

      // 掷骰定庄（与单机开局同源）：点数之和定庄家 / 墙头方位，
      // 骰子同时派给前端做掷骰仪式与牌墙缺口显示。在线房间一局定胜负，
      // 故 mode 恒为 'dealer'（首局定庄，庄家即墙头方位）。
      const dice = [randomInt(1, 7), randomInt(1, 7)]
      const dealer = (dice[0] + dice[1] - 2) % 4
      const headSeat = dealer
      const wallOffset = (headSeat * WALL_SEG + (dice[0] + dice[1])) % (WALL_SEG * 4)

      this.gameSession = new GameSession({
        room: this,
        aiService: this.aiService,
        hub: this.hub,
        logger: this.logger,
        seed: randomInt(0, 0x7fffffff),
        dealer,
        wallOffset,
        dice,
        headSeat
      })
      this.logger('game-started', {
        roomId: this.roomId,
        roomCode: this.roomCode,
        gameId: this.gameSession.gameId
      })
      this.hub.broadcast(this, 'GAME_STARTED', {
        gameId: this.gameSession.gameId,
        rules: { ...this.rules },
        seats: this.seatSnapshots()
      })
      this.gameSession.start()
      return { gameId: this.gameSession.gameId }
    })
  }

  // ---------- 牌局动作（文档 §32–§34） ----------

  async handleAction({ playerId, requestId, gameId, windowId, action }) {
    this._guardAlive()
    return this.queue.push(() => {
      if (this.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_DESTROYED)
      if (this.status === ROOM_STATUS.FINISHED || !this.gameSession) fail(ERR.GAME_ALREADY_FINISHED)
      if (this.status !== ROOM_STATUS.PLAYING) fail(ERR.ROOM_LOCKED)

      const seat = seatOfPlayer(this.seats, playerId)
      if (!seat) fail(ERR.PLAYER_ALREADY_LEFT)
      if (gameId && gameId !== this.gameSession.gameId) {
        fail(ERR.ACTION_WINDOW_EXPIRED, '牌局已更新')
      }
      // 幂等：同一 requestId 只有第一次真正执行
      if (requestId && this.processed.has(requestId)) {
        const cached = this.processed.get(requestId)
        return { ...cached, duplicate: true }
      }
      const res = this.gameSession.handlePlayerAction({
        seat: seat.seatIndex,
        windowId,
        action,
        requestId
      })
      if (requestId) this._remember(requestId, res)
      return res
    })
  }

  _remember(requestId, res) {
    this.processed.set(requestId, { ok: !!(res && res.ok) })
    while (this.processed.size > config.processedRequestIdLimit) {
      const oldest = this.processed.keys().next().value
      this.processed.delete(oldest)
    }
  }

  // ---------- 牌局结束（文档 §50） ----------

  onSessionFinished(session, results) {
    if (this.status === ROOM_STATUS.DESTROYED) return
    this.status = ROOM_STATUS.FINISHED
    this.finishedAt = Date.now()
    this.touch()
    this.bumpVersion()
    this.logger('room-finished', {
      roomId: this.roomId,
      roomCode: this.roomCode,
      gameId: session.gameId
    })
    this.hub.broadcast(this, 'ROOM_UPDATED', {
      status: this.status,
      results,
      seats: this.seatSnapshots()
    })
  }

  // ---------- TTL 清扫（文档 §18 / §49 / §50） ----------

  /**
   * 由 RoomManager 周期调用。
   *   FINISHED → 超过 FINISHED_ROOM_TTL 销毁；
   *   WAITING  → 断线真人超过 WAITING_DISCONNECTED_TTL 视作 implicit leave；
   *              且长时间无人上线（超过 WAITING_ROOM_TTL）销毁；
   *   PLAYING  → 不删断线真人（AI 托管到牌局结束），不做任何回收。
   */
  sweep(now = Date.now()) {
    if (this.status === ROOM_STATUS.DESTROYED) return
    if (this.status === ROOM_STATUS.FINISHED) {
      if (this.finishedAt && now - this.finishedAt > config.finishedRoomTtlMs) {
        this.destroy('FINISHED_TTL')
      }
      return
    }
    if (this.status !== ROOM_STATUS.WAITING) return

    for (const seat of this.seats) {
      if (this.status === ROOM_STATUS.DESTROYED) return
      if (seat.occupantType !== OCCUPANT.HUMAN || seat.connected) continue
      if (!seat.disconnectedAt) continue
      if (now - seat.disconnectedAt <= config.waitingDisconnectedTtlMs) continue
      const playerId = seat.humanPlayerId
      this.logger('implicit-leave', { roomId: this.roomId, seatIndex: seat.seatIndex })
      this.leave(playerId, 'WAITING_DISCONNECTED_TTL')
    }

    if (
      connectedHumanCount(this.seats) === 0 &&
      humanCount(this.seats) > 0 &&
      now - this.lastActivityAt > config.waitingRoomTtlMs
    ) {
      this.destroy('WAITING_TTL')
    }
  }
}