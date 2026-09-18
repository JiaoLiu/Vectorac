// ============================================================
// WebSocket 连接中心（mahjong-service/rooms/hub.js）
// ------------------------------------------------------------
// 职责（文档 §42 / §43 / §44 / §45 / §46）：
//   · 维护 playerId → 连接 的唯一映射：同一玩家新连接生效，旧连接立即失效
//     （防止一个玩家同时用两个浏览器操作同一个 Seat）；
//   · 统一 Envelope 封装（type / roomId / roomVersion / gameId / gameVersion /
//     serverTime / payload），排查同步问题时一眼看清版本；
//   · 广播按「房间内 HUMAN 座位」逐个发，绝不做全服广播；
//   · pushGameState 用 serializer 的按座位视图（隐私过滤 + 视角旋转），
//     服务端不把完整 GameState 交给浏览器。
//
// 本模块不 import Room（避免循环依赖），只按约定字段使用 room / room.seats /
// room.gameSession。
// ============================================================

import { OCCUPANT } from './seat.js'
import { roomSummary } from './serializer.js'

export class Hub {
  constructor({ logger } = {}) {
    this.logger = logger || (() => {})
    /** playerId -> { ws, roomId, playerId, seatIndex, openedAt, lastSeenAt } */
    this.byPlayer = new Map()
  }

  // ---------- 连接注册 ----------

  /**
   * 绑定（或替换）某玩家的有效连接（文档 §42：单 Socket 替换）。
   * 返回被顶替的旧连接（调用方负责关闭），没有则 null。
   */
  register(playerId, roomId, seatIndex, ws) {
    const old = this.byPlayer.get(playerId)
    const entry = {
      playerId,
      roomId,
      seatIndex,
      ws,
      openedAt: Date.now(),
      lastSeenAt: Date.now()
    }
    this.byPlayer.set(playerId, entry)
    ws.playerId = playerId
    ws.roomId = roomId
    ws.seatIndex = seatIndex
    if (old && old.ws && old.ws !== ws) {
      this.logger('socket-replaced', { playerId, roomId, seatIndex })
      return old.ws
    }
    return null
  }

  /**
   * 解绑：只有当前有效连接可以解绑自己（旧连接的 close 事件不能顶掉新连接）。
   * 返回 true 表示确实解绑了当前连接。
   */
  unregister(playerId, ws) {
    const entry = this.byPlayer.get(playerId)
    if (!entry) return false
    if (ws && entry.ws !== ws) return false
    this.byPlayer.delete(playerId)
    return true
  }

  connectionOf(playerId) {
    return this.byPlayer.get(playerId) || null
  }

  count() {
    return this.byPlayer.size
  }

  // ---------- 发送 ----------

  /** 统一 Envelope（文档 §45） */
  envelope(room, type, payload, extra) {
    const gs = room && room.gameSession
    return {
      type,
      roomId: room ? room.roomId : null,
      roomCode: room ? room.roomCode : null,
      roomVersion: room ? room.roomVersion : null,
      gameId: gs ? gs.gameId : null,
      gameVersion: gs ? gs.state.version : null,
      serverTime: Date.now(),
      ...(extra || {}),
      payload: payload == null ? {} : payload
    }
  }

  /** 发一条原始消息给某玩家（连接不存在/已关闭则静默丢弃） */
  sendRaw(playerId, msg) {
    const entry = this.byPlayer.get(playerId)
    if (!entry) return false
    return this._write(entry.ws, msg)
  }

  /** 以房间为上下文给某玩家发事件 */
  send(playerId, room, type, payload, extra) {
    const entry = this.byPlayer.get(playerId)
    if (!entry) return false
    entry.lastSeenAt = Date.now()
    return this._write(entry.ws, this.envelope(room, type, payload, extra))
  }

  /** 广播给房间内所有在线真人（不动 AI 座、不碰 EMPTY 座） */
  broadcast(room, type, payload, extra) {
    if (!room || !room.seats) return 0
    let n = 0
    for (const seat of room.seats) {
      if (seat.occupantType !== OCCUPANT.HUMAN || !seat.humanPlayerId) continue
      if (this.send(seat.humanPlayerId, room, type, payload, extra)) n++
    }
    return n
  }

  /** game-session 使用的别名（语义：状态变化事件） */
  broadcastEvent(room, type, payload) {
    return this.broadcast(room, type, payload)
  }

  /**
   * 推完整牌桌视图（文档 §43 / §44）。
   * 每个真人只收到「自己座位视角」的 PlayerView —— 他人手牌在服务端就被剥掉，
   * 不是前端 CSS 隐藏。
   */
  pushGameState(room, session) {
    if (!room || !session) return 0
    let n = 0
    for (const seat of room.seats) {
      if (seat.occupantType !== OCCUPANT.HUMAN || !seat.humanPlayerId) continue
      const entry = this.byPlayer.get(seat.humanPlayerId)
      if (!entry) continue
      let view
      try {
        view = session.viewFor(seat.seatIndex)
      } catch (e) {
        this.logger('view-build-error', { roomId: room.roomId, seat: seat.seatIndex, message: String(e && e.message) })
        continue
      }
      if (this._write(entry.ws, this.envelope(room, 'GAME_STATE_CHANGED', view))) n++
    }
    return n
  }

  /** 重连 / 刷新后的完整房间快照（等待室与牌桌通用，不含任何手牌） */
  pushRoomSnapshot(room, playerId) {
    const entry = this.byPlayer.get(playerId)
    if (!entry) return false
    const payload = {
      ...roomSummary(room),
      mySeat: entry.seatIndex,
      serverTime: Date.now()
    }
    return this._write(entry.ws, this.envelope(room, 'ROOM_SNAPSHOT', payload))
  }

  /** 房间销毁：给所有在线真人发 ROOM_DESTROYED 并关闭连接 */
  closeRoom(room) {
    if (!room || !room.seats) return 0
    let n = 0
    for (const seat of room.seats) {
      if (seat.occupantType !== OCCUPANT.HUMAN || !seat.humanPlayerId) continue
      const playerId = seat.humanPlayerId
      const entry = this.byPlayer.get(playerId)
      if (!entry) continue
      this._write(entry.ws, this.envelope(room, 'ROOM_DESTROYED', { reason: room.destroyReason || 'DESTROYED' }))
      this.byPlayer.delete(playerId)
      try {
        entry.ws.close(1000, 'room-destroyed')
      } catch (_) {
        /* 连接已断开，忽略 */
      }
      n++
    }
    return n
  }

  _write(ws, msg) {
    if (!ws || ws.readyState !== 1 /* OPEN */) return false
    try {
      ws.send(JSON.stringify(msg))
      return true
    } catch (e) {
      this.logger('ws-send-error', { message: String(e && e.message) })
      return false
    }
  }
}