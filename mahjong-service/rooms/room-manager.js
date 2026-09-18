// ============================================================
// 房间管理器（mahjong-service/rooms/room-manager.js）
// ------------------------------------------------------------
// 全服唯一权威（文档 §3 / §8 / §48 / §49 / §55）：
//   · Map<roomId, Room> + roomCode → roomId 索引；
//   · createRoom 的「查上限 + 插入」在同一同步代码块完成，Node 单线程下天然原子，
//     不会出现两个请求同时看到 19 个房间再各自创建变成 21 个；
//   · destroyRoom 是唯一销毁入口（Room 内部只调用它）；
//   · 周期 sweep 处理 WAITING 断线 implicit leave、WAITING / FINISHED 的 TTL。
// ============================================================

import { randomInt, randomUUID } from 'node:crypto'
import os from 'node:os'
import { config } from '../config.js'
import { ERR, fail } from '../errors.js'
import { Room, sanitizeRules } from './room.js'
import { OCCUPANT, ROOM_STATUS, aiCount, connectedHumanCount, humanCount } from './seat.js'

/** 房号规范化：大写、去空格与连字符（用户手抄容易带空格） */
export function normalizeRoomCode(code) {
  if (code == null) return ''
  return String(code).replace(/[\s-]/g, '').toUpperCase()
}

export class RoomManager {
  constructor({ sessions, hub, aiService, logger } = {}) {
    this.rooms = new Map()
    this.byCode = new Map()
    this.sessions = sessions
    this.hub = hub
    this.aiService = aiService
    this.logger = logger || (() => {})
    this.sweeper = null
  }

  get size() {
    return this.rooms.size
  }

  // ---------- 创建（文档 §8） ----------

  /**
   * 创建房间并让创建者坐进 Seat0（第一任管理员）。
   * 全程同步、无 await ⇒ 上限检查与插入原子完成。
   */
  createRoom({ displayName, rules } = {}) {
    if (this.rooms.size >= config.maxRooms) fail(ERR.ROOM_CAPACITY_REACHED)

    const roomId = randomUUID()
    const roomCode = this._allocRoomCode()
    const room = new Room({
      roomId,
      roomCode,
      rules: sanitizeRules(rules),
      manager: this,
      sessions: this.sessions,
      hub: this.hub,
      aiService: this.aiService,
      logger: this.logger
    })
    this.rooms.set(roomId, room)
    this.byCode.set(roomCode, roomId)

    const session = room.placeFounder({ displayName })
    this.logger('room-created', {
      roomId,
      roomCode,
      activeRooms: this.rooms.size,
      maxRooms: config.maxRooms
    })
    return {
      room,
      summary: room.summary(),
      player: {
        playerId: session.playerId,
        resumeToken: session.resumeToken,
        displayName: session.displayName,
        seatIndex: 0,
        roomId,
        roomCode
      }
    }
  }

  /** 生成未占用的房号（字母表已剔除 0/O/1/I/L） */
  _allocRoomCode() {
    const { roomCodeAlphabet: A, roomCodeLength: L, maxRoomCodeAttempts: max } = config
    for (let attempt = 0; attempt < max; attempt++) {
      let code = ''
      for (let i = 0; i < L; i++) code += A[randomInt(0, A.length)]
      if (!this.byCode.has(code)) return code
    }
    fail(ERR.ROOM_CAPACITY_REACHED, '房号空间暂时不可用，请稍后重试')
  }

  // ---------- 查询 ----------

  getRoom(roomId) {
    return this.rooms.get(roomId) || null
  }

  getRoomByCode(code) {
    const id = this.byCode.get(normalizeRoomCode(code))
    return id ? this.rooms.get(id) || null : null
  }

  /** 大厅列表（不含任何手牌；joinable 标记供前端决定「坐下」按钮） */
  listRooms() {
    const out = []
    for (const room of this.rooms.values()) {
      if (room.status === ROOM_STATUS.DESTROYED) continue
      out.push(room.summary())
    }
    out.sort((a, b) => b.createdAt - a.createdAt)
    return out
  }

  // ---------- 加入（文档 §19 / §20） ----------

  joinRoom({ roomCode, displayName }) {
    const code = normalizeRoomCode(roomCode)
    if (!code) fail(ERR.INVALID_ROOM_CODE)
    const room = this.getRoomByCode(code)
    if (!room || room.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_NOT_FOUND)
    return room.join({ displayName }).then(player => ({
      room,
      summary: room.summary(),
      player
    }))
  }

  // ---------- 重连（文档 §42） ----------

  /**
   * 只认 resumeToken 找到 session → room（调用方随后绑定 socket 并调用
   * room.reconnect 完成 connected=true 与状态同步）。
   */
  resolveReconnect(resumeToken) {
    const session = this.sessions.resolve(resumeToken)
    if (!session) fail(ERR.INVALID_RESUME_TOKEN)
    const room = this.getRoom(session.roomId)
    if (!room || room.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_NOT_FOUND)
    const seat = room.seats[session.seatIndex]
    if (!seat || seat.occupantType !== OCCUPANT.HUMAN || seat.humanPlayerId !== session.playerId) {
      fail(ERR.PLAYER_ALREADY_LEFT)
    }
    return { session, room }
  }

  // ---------- 统一销毁（文档 §48） ----------

  destroyRoom(roomId, reason = 'DESTROYED') {
    const room = this.rooms.get(roomId)
    if (!room || room.status === ROOM_STATUS.DESTROYED) return false

    // 1. 置终态 → 此后所有命令都在校验里被拒
    room.status = ROOM_STATUS.DESTROYED
    room.destroyReason = reason
    // 2. 关闭串行队列：排队中但还没跑的任务直接跳过
    room.queue.close()
    // 3. 结束 GameSession（内部 cancel 所有 turn timer；pending AI 结果靠 aborted 失效）
    if (room.gameSession) {
      room.gameSession.abort(reason)
      room.gameSession = null
    }
    // 4. 广播 + 关闭该房间所有 socket
    this.hub.broadcast(room, 'ROOM_DESTROYED', { reason })
    this.hub.closeRoom(room)
    // 5. 清除 player room session（resumeToken 全部作废）
    this.sessions.removeByRoom(roomId)
    // 6. 删除 roomCode 索引 + activeRooms
    this.byCode.delete(room.roomCode)
    this.rooms.delete(roomId)

    this.logger('room-destroyed', {
      roomId,
      roomCode: room.roomCode,
      reason,
      activeRooms: this.rooms.size
    })
    return true
  }

  // ---------- TTL 清扫（文档 §49 / §50） ----------

  sweep(now = Date.now()) {
    for (const room of [...this.rooms.values()]) {
      if (room.status === ROOM_STATUS.DESTROYED) continue
      try {
        room.sweep(now)
      } catch (e) {
        this.logger('sweep-error', { roomId: room.roomId, message: String(e && e.message) })
      }
    }
  }

  startSweeper() {
    if (this.sweeper) return this.sweeper
    this.sweeper = setInterval(() => this.sweep(), config.sweepIntervalMs)
    if (this.sweeper.unref) this.sweeper.unref()
    return this.sweeper
  }

  stopSweeper() {
    if (this.sweeper) clearInterval(this.sweeper)
    this.sweeper = null
  }

  /** 优雅关闭：销毁全部房间（进程退出/重启时清理 timer 与 socket） */
  destroyAll(reason = 'SERVER_SHUTDOWN') {
    for (const roomId of [...this.rooms.keys()]) {
      this.destroyRoom(roomId, reason)
    }
  }

  // ---------- 统计（文档 §55） ----------

  stats() {
    let waiting = 0
    let playing = 0
    let finished = 0
    let connectedHumans = 0
    let disconnectedHumans = 0
    let aiSeats = 0
    for (const room of this.rooms.values()) {
      if (room.status === ROOM_STATUS.WAITING) waiting++
      else if (room.status === ROOM_STATUS.PLAYING) playing++
      else if (room.status === ROOM_STATUS.FINISHED) finished++
      const hc = humanCount(room.seats)
      const cc = connectedHumanCount(room.seats)
      connectedHumans += cc
      disconnectedHumans += hc - cc
      aiSeats += aiCount(room.seats)
    }
    const mem = process.memoryUsage()
    const ai = this.aiService ? this.aiService.snapshot() : {}
    return {
      activeRooms: this.rooms.size,
      maxRooms: config.maxRooms,
      waitingRooms: waiting,
      playingRooms: playing,
      finishedRooms: finished,
      connectedHumans,
      disconnectedHumans,
      aiSeats,
      websocketConnections: this.hub ? this.hub.count() : 0,
      aiRunning: ai.aiRunning || 0,
      aiQueued: ai.aiQueued || 0,
      aiDecided: ai.aiDecided || 0,
      aiFallbacks: ai.aiFallbacks || 0,
      aiErrors: ai.aiErrors || 0,
      aiSlow: ai.aiSlow || 0,
      memoryUsage: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal
      },
      cpuUsage: {
        loadAvg1: os.loadavg()[0],
        cores: os.cpus().length
      },
      uptimeSeconds: Math.floor(process.uptime()),
      sweptAt: Date.now()
    }
  }

  /** 每个房间的明细（排障用，仍然不含手牌） */
  roomStats() {
    return [...this.rooms.values()].map(r => r.stats())
  }
}