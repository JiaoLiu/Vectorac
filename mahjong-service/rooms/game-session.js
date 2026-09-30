// ============================================================
// 对局会话（mahjong-service/rooms/game-session.js）
// ------------------------------------------------------------
// 每个 PLAYING 房间一个 GameSession：把**游戏适配器**接进房间架构，
// 本模块游戏无关，不 import 任何游戏引擎模块。
//
// 职责：
//   · 用 adapter.createState / dispatch / legalActions / settlementOf 驱动对局；
//   · 维护 ActionWindow（windowId / eligibleSeats / legalActions / deadline）；
//   · 计时权威在服务端：真人等 deadline，嫌疑断线走 DISCONNECTED_AI_DELAY，
//     真 AI 座位按节奏出招；超时一律走 AI 决策 + 确定性兜底；
//   · AI 决策在房间队列之外执行（并发受限），产出动作后再入队，
//     入队时二次校验 windowId，过期直接丢弃（文档 §41）；
//   · 每次状态变化把「按座位视角的视图」推给每个真人（隐私由适配器视图保证）。
// ============================================================

import { config } from '../config.js'
import { ERR, fail } from '../errors.js'
import { OCCUPANT, seatSnapshot } from './seat.js'
import { createWindow, isEligible } from './action-window.js'

/** 动作来源（文档 §52：日志里必须能区分真人 / AI / 超时托管 / 断线托管） */
export const SOURCE = {
  HUMAN: 'HUMAN',
  AI: 'AI',
  TIMEOUT_AI: 'TIMEOUT_AI',
  DISCONNECT_AI: 'DISCONNECT_AI',
  SYSTEM: 'SYSTEM'
}

let gameCounter = 0

/** 引擎错误码 → 服务端错误码（前端只认后者）。适配器 dispatch 复用同一组错误词 */
const ENGINE_ERROR_MAP = {
  stale: ERR.ACTION_WINDOW_EXPIRED,
  duplicate: ERR.ACTION_ALREADY_PROCESSED,
  'not-active': ERR.NOT_YOUR_TURN,
  illegal: ERR.INVALID_ACTION,
  'wrong-phase': ERR.INVALID_ACTION
}

export class GameSession {
  /**
   * @param {object} opening  adapter.openingFor 的返回：{ engineInit, ceremony, firstMoverSeat }
   */
  constructor({ room, aiService, hub, logger, adapter, opening, seed, round }) {
    this.room = room
    this.ai = aiService
    this.hub = hub
    this.logger = logger || (() => {})
    this.adapter = adapter

    this.gameId = 'g' + (++gameCounter) + '-' + room.roomCode
    this.seed = seed >>> 0
    this.round = round == null ? 1 : Number(round) || 1
    // 开局仪式信息（骰子 / 先后手分配等，纯展示，不参与任何判定），
    // 由适配器产出，viewFor 时原样摊进 meta 供前端做开局表现。
    this.ceremony = (opening && opening.ceremony) || {}
    this.state = adapter.createState(opening.engineInit, {
      room,
      seed: this.seed,
      rules: room.rules
    })

    this.window = null
    this.windowSeq = 0
    this.seatTimers = new Map()
    this.aborted = false
    this.actionSeq = 0
    this.startedAt = Date.now()
    this.finishedAt = null
  }

  get gameVersion() {
    return this.state.version
  }

  get finished() {
    return this.adapter.isFinished(this.state)
  }

  /** 对外信封字段（文档 §31 / §45） */
  info() {
    return {
      roomId: this.room.roomId,
      roomVersion: this.room.roomVersion,
      gameId: this.gameId,
      gameVersion: this.state.version,
      windowId: this.window ? this.window.windowId : null,
      deadlineAt: this.window ? this.window.deadlineAt : null,
      serverTime: Date.now()
    }
  }

  // ---------- 生命周期 ----------

  /** 开局：打开首个 ActionWindow 并把视图推给所有真人（在房间队列内调用） */
  start() {
    this.syncWindow()
    this.hub.pushGameState(this.room, this)
  }

  /** 按当前引擎状态同步 ActionWindow（每次 dispatch 后调用） */
  syncWindow() {
    if (this.aborted) return
    if (this.finished) {
      this.closeWindow()
      return
    }
    const adapter = this.adapter
    const identity = adapter.windowIdentityOf(this.state)
    const eligible = adapter
      .eligibleSeatsOf(this.state)
      .filter(seat => adapter.legalActions(this.state, seat).length > 0)
    if (!identity || !eligible.length) {
      this.closeWindow()
      return
    }
    const legalBySeat = {}
    for (const seat of eligible) legalBySeat[seat] = adapter.legalActions(this.state, seat)

    const reused = this.window && this.window.identity === identity
    if (reused) {
      // 同一逻辑窗口：保留 windowId / deadline，只更新剩余座位与合法动作
      this.window.eligibleSeats = eligible
      this.window.legalActionsBySeat = legalBySeat
    } else {
      this.closeWindow()
      this.window = createWindow({
        windowId: ++this.windowSeq,
        identity,
        type: adapter.windowTypeOf(this.state),
        eligibleSeats: eligible,
        legalActionsBySeat: legalBySeat,
        timeoutMs: this.windowTimeoutMs(),
        now: Date.now()
      })
      this.hub.broadcastEvent(this.room, 'ACTION_WINDOW_OPENED', {
        windowId: this.window.windowId,
        type: this.window.type,
        eligibleSeats: this.window.eligibleSeats,
        deadlineAt: this.window.deadlineAt,
        legalActionsBySeat: this.window.legalActionsBySeat
      })
    }
    this.armTimers()
  }

  closeWindow() {
    for (const t of this.seatTimers.values()) clearTimeout(t)
    this.seatTimers.clear()
    this.window = null
  }

  /** 本窗口的 deadline 时长（毫秒），由适配器按游戏与阶段决定 */
  windowTimeoutMs() {
    return this.adapter.windowTimeoutMs(this.state, this.room)
  }

  // ---------- 计时（服务端是计时权威） ----------

  /** 真 AI 座位的出招节奏（纯表现，不是超时配置） */
  aiPaceMs(seat) {
    return 350 + (seat % this.room.seats.length) * 120
  }

  /**
   * 为窗口内每个座位安排「什么时候由谁出招」：
   *   · 真 AI 座            → AI 节奏后自动决策（source=AI）
   *   · 真人已断线          → DISCONNECTED_AI_DELAY 后托管（source=DISCONNECT_AI）
   *   · 真人在线            → 等到 deadline，未表态则由 AI 托管（source=TIMEOUT_AI）
   */
  armTimers() {
    const w = this.window
    if (!w || this.aborted) return

    for (const [seat, timer] of [...this.seatTimers]) {
      if (w.eligibleSeats.indexOf(seat) < 0) {
        clearTimeout(timer)
        this.seatTimers.delete(seat)
      }
    }

    for (const seat of w.eligibleSeats) {
      if (this.seatTimers.has(seat)) continue
      const s = this.room.seats[seat]
      let delay = Math.max(1, w.deadlineAt - Date.now())
      let source = SOURCE.TIMEOUT_AI
      if (s.occupantType === OCCUPANT.AI) {
        delay = this.aiPaceMs(seat)
        source = SOURCE.AI
      } else if (s.occupantType === OCCUPANT.HUMAN && !s.connected) {
        delay = Math.max(1, config.disconnectedAiDelayMs)
        source = SOURCE.DISCONNECT_AI
      }
      const windowId = w.windowId
      const timer = setTimeout(() => {
        this.seatTimers.delete(seat)
        this.actAsAi(seat, windowId, source)
      }, delay)
      // 定时器不应阻止进程退出（测试与优雅关闭都需要）
      if (timer.unref) timer.unref()
      this.seatTimers.set(seat, timer)
    }
  }

  /**
   * 座位占用状态发生变化（断线托管 / 主动退出转 AI）：撤掉旧定时器并按新身份重排。
   * 转 AI 的座位会拿到 AI 节奏，断线的真人换用 DISCONNECTED_AI_DELAY。
   */
  onSeatChanged(seat) {
    const timer = this.seatTimers.get(seat)
    if (timer) {
      clearTimeout(timer)
      this.seatTimers.delete(seat)
    }
    this.armTimers()
  }

  /** 真人重连：撤销托管定时器，并给他重新留出出手时间 */
  onSeatReconnected(seat) {
    const timer = this.seatTimers.get(seat)
    if (timer) {
      clearTimeout(timer)
      this.seatTimers.delete(seat)
    }
    if (!this.window || !isEligible(this.window, seat)) return
    const windowId = this.window.windowId
    const grace = Math.max(this.window.deadlineAt - Date.now(), 3000)
    const t = setTimeout(() => {
      this.seatTimers.delete(seat)
      this.actAsAi(seat, windowId, SOURCE.TIMEOUT_AI)
    }, grace)
    if (t.unref) t.unref()
    this.seatTimers.set(seat, t)
  }

  /**
   * 由 AI（或超时/断线托管）替该座位出招。
   * 决策在房间队列**之外**执行（AI 并发受限），产出动作后再入队并二次校验
   * windowId —— 若期间真人已操作导致窗口推进，则这个 AI 动作被直接丢弃。
   */
  async actAsAi(seat, windowId, source) {
    if (this.aborted) return
    if (!this.window || this.window.windowId !== windowId) return
    if (!isEligible(this.window, seat)) return
    const adapter = this.adapter
    const legal = adapter.legalActions(this.state, seat)
    if (!legal.length) return
    const view = adapter.playerView(this.state, seat)

    const level = adapter.aiLevelOf ? adapter.aiLevelOf(this.room) : null
    const action = await this.ai.decide(adapter, view, seat, {
      seed: this.seed,
      level: level || undefined
    })

    // 返回队列任务：调用方（测试 / 关停流程）可以 await 到这一步真正落子
    return this.room.queue.push(() => {
      if (this.aborted || this.finished) return
      if (!this.window || this.window.windowId !== windowId) return // 窗口已推进，丢弃
      if (!isEligible(this.window, seat)) return
      const nowLegal = adapter.legalActions(this.state, seat)
      if (!nowLegal.length) return
      let final = action && adapter.matchesLegalOption(nowLegal, action) ? action : null
      if (!final) final = adapter.aiFallback(adapter.playerView(this.state, seat))
      if (!final || !adapter.matchesLegalOption(nowLegal, final)) {
        final = adapter.aiLastResort(nowLegal)
      }
      if (!final) return
      this.applyAction({ seat, action: final, source, requestId: null })
    })
  }

  // ---------- 动作 ----------

  /**
   * 真人的 PLAYER_ACTION（调用方需已在房间队列内）。
   * 校验：房间状态 / 是否轮到你 / windowId 是否仍有效 / 动作是否合法
   * （文档 §33）；最终裁决仍由适配器 dispatch 完成。
   */
  handlePlayerAction({ seat, windowId, action, requestId, source = SOURCE.HUMAN }) {
    if (this.aborted) fail(ERR.ROOM_DESTROYED)
    if (this.finished) fail(ERR.GAME_ALREADY_FINISHED)
    if (!this.window) fail(ERR.ACTION_WINDOW_EXPIRED)
    if (windowId == null || windowId !== this.window.windowId) {
      fail(ERR.ACTION_WINDOW_EXPIRED, '行动窗口已失效')
    }
    if (!isEligible(this.window, seat)) fail(ERR.NOT_YOUR_TURN)
    const legal = this.adapter.legalActions(this.state, seat)
    if (!this.adapter.matchesLegalOption(legal, action)) fail(ERR.INVALID_ACTION)

    const res = this.applyAction({ seat, action, source, requestId })
    if (!res.ok) fail(ENGINE_ERROR_MAP[res.error] || ERR.INVALID_ACTION, '引擎拒绝：' + res.error)
    return res
  }

  /** 统一落子入口：补 actionId / stateVersion → 适配器裁决 → 推进窗口 → 广播 */
  applyAction({ seat, action, source, requestId }) {
    const payload = {
      ...action,
      seat,
      actionId: requestId || 'srv-' + this.gameId + '-' + ++this.actionSeq,
      stateVersion: this.state.version
    }
    const res = this.adapter.dispatch(this.state, payload)
    if (!res.ok) {
      this.logger('action-rejected', { gameId: this.gameId, seat, source, error: res.error })
      return res
    }
    this.state = res.state
    this.logger('action', {
      gameId: this.gameId,
      seat,
      source,
      action: action.type,
      gameVersion: this.state.version
    })

    if (this.finished) {
      this.finish()
    } else {
      this.syncWindow()
    }
    this.room.touch()
    this.hub.pushGameState(this.room, this)
    return res
  }

  finish() {
    this.finishedAt = Date.now()
    this.closeWindow()
    const results = this.adapter.settlementOf(this.state)
    this.hub.broadcastEvent(this.room, 'GAME_FINISHED', {
      gameId: this.gameId,
      results
    })
    this.room.onSessionFinished(this, results)
  }

  /** 终止对局（最后一个真人退出 / 房间销毁）：撤掉全部定时器与待处理动作 */
  abort(reason) {
    if (this.aborted) return
    this.aborted = true
    this.closeWindow()
    this.logger('game-aborted', { gameId: this.gameId, reason })
  }

  dispose(reason) {
    this.abort(reason || 'disposed')
  }

  /** 该座位可见的完整视图（含房间 meta），由适配器序列化 */
  viewFor(seat) {
    const room = this.room
    const meta = {
      roomId: room.roomId,
      roomCode: room.roomCode,
      status: room.status,
      adminSeat: room.adminSeat,
      playerId: (room.seats[seat] && room.seats[seat].humanPlayerId) || null,
      gameId: this.gameId,
      windowId: this.window ? this.window.windowId : null,
      deadlineAt: this.window ? this.window.deadlineAt : null,
      serverTime: Date.now(),
      round: this.round,
      // 开局仪式（骰子 / 先后手等，纯展示）由适配器产出，原样摊进 meta
      ...this.ceremony,
      // 多局联机：房间累计积分与破产座位（绝对座位口径，适配器按视角处理）
      scores: (room.scores || []).slice(),
      bankruptSeats: (room.bankruptSeats || []).slice(),
      seats: room.seats.map(seatSnapshot)
    }
    return this.adapter.serializeView(this.state, seat, meta)
  }

  stats() {
    return {
      gameId: this.gameId,
      gameVersion: this.state.version,
      phase: this.state.phase,
      windowId: this.window ? this.window.windowId : null,
      timers: this.seatTimers.size
    }
  }
}
