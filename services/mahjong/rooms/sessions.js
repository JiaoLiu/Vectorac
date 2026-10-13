// ============================================================
// 真人身份与重连令牌（mahjong-service/rooms/sessions.js）
// ------------------------------------------------------------
// 文档 §7 / §42 / §63：房间级 Session，不依赖登录体系。
//   · playerId    ：服务端生成的 UUID
//   · resumeToken ：高强度随机串，客户端存 localStorage 用于重连
// 重连只认 resumeToken —— 昵称 / 房号 / 座位都不能作为凭据。
// 日志里一律用 maskToken()，禁止完整打印。
// ============================================================

import { randomBytes, randomUUID } from 'node:crypto'
import { config } from '../config.js'

export class PlayerSessionManager {
  constructor() {
    this.byPlayerId = new Map()
    this.byToken = new Map()
  }

  /** 新建房间级 Session（创建 / 加入房间时调用） */
  create({ roomId, seatIndex, displayName }) {
    const playerId = randomUUID()
    const resumeToken = randomBytes(config.resumeTokenBytes).toString('base64url')
    const session = {
      playerId,
      roomId,
      seatIndex,
      resumeToken,
      displayName: displayName || '玩家',
      createdAt: Date.now(),
      leftAt: null
    }
    this.byPlayerId.set(playerId, session)
    this.byToken.set(resumeToken, playerId)
    return session
  }

  get(playerId) {
    return this.byPlayerId.get(playerId) || null
  }

  /** 用 resumeToken 换 session（无效 token 返回 null） */
  resolve(resumeToken) {
    if (!resumeToken) return null
    const playerId = this.byToken.get(resumeToken)
    return playerId ? this.get(playerId) : null
  }

  setSeat(playerId, seatIndex) {
    const s = this.get(playerId)
    if (s) s.seatIndex = seatIndex
    return s
  }

  /** 永久退出：令牌立即作废（文档 §12 / §14） */
  remove(playerId) {
    const s = this.get(playerId)
    if (!s) return null
    s.leftAt = Date.now()
    this.byPlayerId.delete(playerId)
    this.byToken.delete(s.resumeToken)
    return s
  }

  /** 房间销毁时清掉该房间全部 Session（文档 §48 第 8 步） */
  removeByRoom(roomId) {
    let n = 0
    for (const [playerId, s] of this.byPlayerId) {
      if (s.roomId === roomId) {
        this.byToken.delete(s.resumeToken)
        this.byPlayerId.delete(playerId)
        n++
      }
    }
    return n
  }

  countInRoom(roomId) {
    let n = 0
    for (const s of this.byPlayerId.values()) if (s.roomId === roomId) n++
    return n
  }

  stats() {
    return { sessions: this.byPlayerId.size }
  }
}

/** 日志脱敏：只留前 6 位（禁止完整打印 resumeToken） */
export function maskToken(token) {
  if (!token || typeof token !== 'string') return ''
  return token.slice(0, 6) + '…'
}