// ============================================================
// 房间（mahjong-service/rooms/room.js）
// ------------------------------------------------------------
// 一个 Room = 4 个 Seat + 一条串行事件队列 + 可选的一个 GameSession。
//
// 多局联机：一局打完房间**不销毁**，回到 WAITING 等全员「准备」后自动开下一局；
// 每人起始 config.startScore 分，每局 delta 跨局累加，任一家 ≤ 0 即破产 → FINISHED。
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
  humanSeats,
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

/**
 * 房间思考时长（秒）清洗：建房间时可选传入，覆盖服务端默认 turnTimeoutSeconds。
 * 未传（null / 空串）→ 用默认值；传了必须是 [min,max] 区间内的整数秒，
 * 越界直接 INVALID_RULES（与规则一致，不做静默 clamp）。
 */
export function sanitizeTurnTimeoutSeconds(input) {
  if (input == null || input === '') return config.turnTimeoutSeconds
  const n = Math.floor(Number(input))
  if (!Number.isFinite(n)) fail(ERR.INVALID_RULES, '思考时长必须是数字（秒）')
  if (n < config.minRoomTurnTimeoutSeconds || n > config.maxRoomTurnTimeoutSeconds) {
    fail(
      ERR.INVALID_RULES,
      '思考时长超出允许范围 [' +
        config.minRoomTurnTimeoutSeconds +
        ',' +
        config.maxRoomTurnTimeoutSeconds +
        '] 秒'
    )
  }
  return n
}

/**
 * 下局庄家（与单机 ui.js nextDealerOf 同口径）：先胡者坐庄；一炮多响
 * （同一次出牌 / 抢杠被两家以上胡）时由点炮者坐庄；流局庄家留任。
 * results.huOrder 是绝对座位口径（服务端未经视角旋转），可直接用。
 */
export function nextDealerOf(results, fallbackSeat) {
  const huOrder = (results && results.huOrder) || []
  if (!huOrder.length) return fallbackSeat != null ? fallbackSeat : 0
  const first = huOrder[0]
  if (first.how !== 'zimo' && first.from != null) {
    const sameDiscard = huOrder.filter(
      h => h.how !== 'zimo' && h.from === first.from && h.tag === first.tag
    )
    if (sameDiscard.length >= 2) return first.from
  }
  return first.seat
}

export class Room {
  constructor({ roomId, roomCode, rules, turnTimeoutSeconds, manager, sessions, hub, aiService, logger }) {
    this.roomId = roomId || randomUUID()
    this.roomCode = roomCode
    this.status = ROOM_STATUS.WAITING
    this.adminSeat = -1
    this.rules = rules || { ...DEFAULT_RULES }
    // 本房间的思考时长（秒）：建房间时可选设置，摸打 / 响应窗口按它计时；
    // 定缺 / 换三张这类并行窗口固定走 config.voidTimeoutSeconds（见 GameSession）。
    this.turnTimeoutSeconds = sanitizeTurnTimeoutSeconds(turnTimeoutSeconds)
    this.seats = createSeats(config.seatsPerRoom)

    this.createdAt = Date.now()
    this.startedAt = null
    this.finishedAt = null
    this.lastActivityAt = this.createdAt
    this.roomVersion = 0
    this.destroyReason = null

    // 多局联机：局号 + 每个座位（绝对口径）累计积分 + 上局结果 + 破产座位。
    // 积分只在每局结束时按 perSeat.delta 入账一次；破产只在局末判出。
    this.round = 1
    this.scores = new Array(config.seatsPerRoom).fill(config.startScore)
    this.lastResults = null
    this.bankruptSeats = []

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

  async updateRules(actorPlayerId, rules, turnTimeoutSeconds) {
    this._guardAlive()
    return this.queue.push(() => {
      this._requireAdmin(actorPlayerId)
      this._requireWaiting()
      this.rules = sanitizeRules(rules)
      // 思考时长与规则同属房主在等待室可改的房级参数；未传则保持不变
      if (turnTimeoutSeconds !== undefined) {
        this.turnTimeoutSeconds = sanitizeTurnTimeoutSeconds(turnTimeoutSeconds)
      }
      this.touch()
      this.bumpVersion()
      this.hub.broadcast(this, 'RULES_UPDATED', {
        rules: { ...this.rules },
        turnTimeoutSeconds: this.turnTimeoutSeconds
      })
      return { rules: { ...this.rules }, turnTimeoutSeconds: this.turnTimeoutSeconds }
    })
  }

  /**
   * 准备 / 取消准备下一局（多局联机）。
   * 只在「局间等待」有意义：WAITING 状态下切换本座位 ready，
   * 全员（在线真人）就绪则由服务端自动开下一局，不需要房主再点开始。
   */
  async setReady(playerId, ready) {
    this._guardAlive()
    return this.queue.push(() => {
      if (this.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_DESTROYED)
      if (this.status === ROOM_STATUS.PLAYING) fail(ERR.ROOM_LOCKED)
      if (this.status === ROOM_STATUS.FINISHED) fail(ERR.GAME_ALREADY_FINISHED)
      const seat = seatOfPlayer(this.seats, playerId)
      if (!seat) fail(ERR.PLAYER_ALREADY_LEFT)
      const want = ready == null ? !seat.ready : !!ready
      if (seat.ready !== want) {
        seat.ready = want
        this.touch()
        this.bumpVersion()
        this.hub.broadcast(this, 'READY_CHANGED', { seats: this.seatSnapshots() })
      }
      const started = this._maybeStartNextRound()
      return { ready: seat.ready, started: !!started }
    })
  }

  /**
   * 全员就绪 → 自动开下一局。仅对「已经打过至少一局」的房间生效：
   * 首局仍由房主点「开始游戏」（否则刚建房就会直接开局）。
   * 断线真人视作自动就绪（AI 托管），避免一人掉线卡死下一局；
   * 但至少要有一位在线真人，否则不开局（交由 TTL 回收）。
   */
  _maybeStartNextRound() {
    if (this.status !== ROOM_STATUS.WAITING) return null
    if (this.lastResults == null) return null
    const humans = humanSeats(this.seats)
    if (!humans.length) return null
    if (!humans.some(s => s.connected)) return null
    if (humans.some(s => s.connected && !s.ready)) return null
    this.round += 1
    return this._launchRound()
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
      return { gameId: this._launchRound().gameId }
    })
  }

  /**
   * 本轮发牌开局（首局由房主触发，后续局由全员就绪自动触发）。
   * 调用方必须已在房间队列内。EMPTY 自动补 AI；真人开赛即清 ready。
   */
  _launchRound() {
    for (const seat of this.seats) {
      if (seat.occupantType === OCCUPANT.EMPTY) {
        setAi(seat)
        seat.aiProfile = { level: this.aiLevel }
      }
      // AI 恒就绪；真人本局结束需要重新点「准备下一局」
      seat.ready = seat.occupantType === OCCUPANT.AI
    }

    this.status = ROOM_STATUS.PLAYING
    this.startedAt = Date.now()
    this.finishedAt = null
    this.touch()
    this.bumpVersion()

    // 掷骰（与单机开局同源）：骰子派给前端做掷骰仪式与牌墙缺口。
    // 首局：点数之和定庄；后续局：沿用上一局结果推得的庄家（先胡者坐庄），
    // 骰子只决定摸牌起点，与单机 onRestart 一致。
    const dice = [randomInt(1, 7), randomInt(1, 7)]
    const dealer =
      this.round > 1 && this.lastResults != null
        ? nextDealerOf(this.lastResults, this.gameSession ? this.gameSession.dealer : 0)
        : (dice[0] + dice[1] - 2) % 4
    const headSeat = this.round > 1 ? (dice[0] + dice[1] - 2) % 4 : dealer
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
      headSeat,
      round: this.round
    })
    this.logger('game-started', {
      roomId: this.roomId,
      roomCode: this.roomCode,
      gameId: this.gameSession.gameId,
      round: this.round
    })
    this.hub.broadcast(this, 'GAME_STARTED', {
      gameId: this.gameSession.gameId,
      round: this.round,
      rules: { ...this.rules },
      turnTimeoutSeconds: this.turnTimeoutSeconds,
      seats: this.seatSnapshots()
    })
    this.gameSession.start()
    return { gameId: this.gameSession.gameId }
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

  /**
   * 一局结束（多局联机）：
   *   · 按 perSeat.delta 把本局得失一次性累加进房间累计积分（服务端是积分权威）；
   *   · 任一家累计积分 ≤ 0 → 破产，房间进入 FINISHED 终态（不再开下一局，TTL 回收）；
   *   · 否则回到 WAITING 等待室，真人 ready 清零，等全员点「准备」后自动开下一局。
   * 保留 gameSession（已结束）供结算视图与排查使用，下一局会被替换。
   */
  onSessionFinished(session, results) {
    if (this.status === ROOM_STATUS.DESTROYED) return
    this.lastResults = results
    for (const p of results.perSeat || []) {
      if (p && p.seat >= 0 && p.seat < this.scores.length) this.scores[p.seat] += p.delta
    }
    this.bankruptSeats = this.scores
      .map((score, seat) => (score <= 0 ? seat : -1))
      .filter(seat => seat >= 0)
    this.touch()
    this.bumpVersion()

    if (this.bankruptSeats.length) {
      this.status = ROOM_STATUS.FINISHED
      this.finishedAt = Date.now()
      this.logger('room-finished-bankrupt', {
        roomId: this.roomId,
        roomCode: this.roomCode,
        gameId: session.gameId,
        round: this.round,
        bankruptSeats: this.bankruptSeats.slice()
      })
    } else {
      // 局间等待：真人需重新点「准备下一局」，AI 恒就绪
      this.status = ROOM_STATUS.WAITING
      this.finishedAt = null
      for (const seat of this.seats) seat.ready = seat.occupantType === OCCUPANT.AI
      this.logger('round-finished', {
        roomId: this.roomId,
        roomCode: this.roomCode,
        gameId: session.gameId,
        round: this.round
      })
    }

    this.hub.broadcast(this, 'ROOM_UPDATED', {
      status: this.status,
      round: this.round,
      results,
      scores: this.scores.slice(),
      bankruptSeats: this.bankruptSeats.slice(),
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