// ============================================================
// 牌局会话（mahjong-service/rooms/game-session.js）
// ------------------------------------------------------------
// 每个 PLAYING 房间一个 GameSession：把**现有引擎**接进房间架构，
// 不重新实现任何麻将规则（文档 §28 / §六十六）。
//
// 职责：
//   · 用 createGame / dispatch / legalActions / settlementOf 驱动牌局；
//   · 维护 ActionWindow（windowId / eligibleSeats / legalActions / deadline）；
//   · 计时权威在服务端：真人等 deadline，嫌疑断线走 DISCONNECTED_AI_DELAY，
//     真 AI 座位按节奏出牌；超时一律走 AI 决策 + 确定性兜底；
//   · AI 决策在房间队列之外执行（并发受限），产出动作后再入队，
//     入队时二次校验 windowId，过期直接丢弃（文档 §41）；
//   · 每次状态变化把「按座位旋转后的视图」推给每个真人（隐私由引擎视图保证）。
// ============================================================

import {
  PHASE_DISCARD,
  PHASE_RESPOND,
  PHASE_SWAP,
  PHASE_VOID,
  PHASE_FINISHED
} from '../engine/contract.js'
import {
  createGame,
  dispatch as engineDispatch,
  legalActions,
  playerView,
  settlementOf
} from '../engine/engine.js'
import { config } from '../config.js'
import { ERR, fail } from '../errors.js'
import { OCCUPANT, seatSnapshot } from './seat.js'
import { createWindow, isEligible, matchesLegalOption, WINDOW_TYPE } from './action-window.js'
import { fallbackAction } from './ai-jobs.js'
import { buildPlayerViewForSeat } from './serializer.js'

/** 动作来源（文档 §52：日志里必须能区分真人 / AI / 超时托管 / 断线托管） */
export const SOURCE = {
  HUMAN: 'HUMAN',
  AI: 'AI',
  TIMEOUT_AI: 'TIMEOUT_AI',
  DISCONNECT_AI: 'DISCONNECT_AI',
  SYSTEM: 'SYSTEM'
}

let gameCounter = 0

/** 引擎错误码 → 服务端错误码（前端只认后者） */
const ENGINE_ERROR_MAP = {
  stale: ERR.ACTION_WINDOW_EXPIRED,
  duplicate: ERR.ACTION_ALREADY_PROCESSED,
  'not-active': ERR.NOT_YOUR_TURN,
  illegal: ERR.INVALID_ACTION,
  'wrong-phase': ERR.INVALID_ACTION
}

/**
 * 逻辑窗口的稳定标识：同一逻辑窗口内其他座位表态（version 变化）不会改变它，
 * 所以 windowId 不会被误判为过期；换人 / 换阶段 / 换出牌批次才换新窗口。
 */
function windowIdentity(state) {
  switch (state.phase) {
    case PHASE_SWAP:
      return 'swap'
    case PHASE_VOID:
      return 'void'
    case PHASE_DISCARD:
      return 'discard:' + state.turn
    case PHASE_RESPOND:
      // 阶段（hu / gang / peng）也进 identity：同一阶段内所有座位共享同一个
      // 窗口与截止时间（HU 并行窗口下多家同时思考，谁先表态都不影响别人），
      // 换阶段才 ++windowId，旧阶段未表态的请求一律过期。
      if (state.pendingKong) {
        return (
          'respond-kong:' +
          state.pendingKong.seat +
          ':' +
          state.pendingKong.tag +
          ':' +
          state.respondStage
        )
      }
      if (state.pendingDiscard) {
        return (
          'respond:' +
          state.pendingDiscard.seat +
          ':' +
          state.pendingDiscard.tag +
          ':' +
          state.respondStage
        )
      }
      return 'respond:' + state.turn + ':' + state.respondStage
    default:
      return null
  }
}

function windowTypeOf(state) {
  switch (state.phase) {
    case PHASE_SWAP:
      return WINDOW_TYPE.EXCHANGE_SELECTION
    case PHASE_VOID:
      return WINDOW_TYPE.DINGQUE_SELECTION
    case PHASE_DISCARD:
      return WINDOW_TYPE.SELF_TURN
    case PHASE_RESPOND:
      return WINDOW_TYPE.DISCARD_RESPONSE
    default:
      return WINDOW_TYPE.OTHER
  }
}

/** 当前还需要表态的座位（引擎口径） */
function eligibleSeatsOf(state) {
  switch (state.phase) {
    case PHASE_SWAP:
      return state.players.filter(p => p.swapPicked == null).map(p => p.seat)
    case PHASE_VOID:
      return state.players.filter(p => p.void == null).map(p => p.seat)
    case PHASE_DISCARD:
      return [state.turn]
    case PHASE_RESPOND:
      // HU 阶段（并行收集）：所有未表态的胡候选人同时拥有决定权，共享同一
      // 截止时间——任何一家先叫胡都不会关掉别人的窗口；GANG / PENG 阶段
      // （串行仲裁）只有唯一 currentResponder 有决定权。
      if (state.respondStage === 'hu') return state.huWait.slice()
      return state.currentResponder != null ? [state.currentResponder] : []
    default:
      return []
  }
}

/** 最后一个合法选项（兜底专用，保证绝不卡死牌局） */
function firstLegalAction(legal) {
  if (!legal || !legal.length) return null
  const o = legal[0]
  if (o.type === 'discard') {
    return o.tiles && o.tiles.length ? { type: 'discard', tile: o.tiles[0] } : null
  }
  if (o.type === 'gang') {
    return o.options && o.options.length
      ? { type: 'gang', tile: o.options[0].tile, gangType: o.options[0].gangType }
      : null
  }
  if (o.type === 'peng') return { type: 'peng', tile: o.tile }
  if (o.type === 'hu') return { type: 'hu', how: o.how }
  if (o.type === 'pass') return { type: 'pass' }
  if (o.type === 'void') {
    return o.suits && o.suits.length ? { type: 'void', suit: o.suits[0] } : null
  }
  if (o.type === 'swap') return fallbackAction({ legal })
  return null
}

export class GameSession {
  constructor({ room, aiService, hub, logger, seed, dealer, wallOffset, dice, headSeat, round }) {
    this.room = room
    this.ai = aiService
    this.hub = hub
    this.logger = logger || (() => {})

    this.gameId = 'g' + (++gameCounter) + '-' + room.roomCode
    this.seed = seed >>> 0
    // 本局骰子与墙头方位（纯展示 + 牌墙缺口表现，不参与任何牌权判定）
    this.round = round == null ? 1 : Number(round) || 1
    this.dice = Array.isArray(dice) && dice.length === 2 ? [Number(dice[0]) | 0, Number(dice[1]) | 0] : [1, 1]
    this.dealer = dealer
    this.headSeat = headSeat != null ? headSeat : dealer
    this.wallOffset = wallOffset || 0
    this.state = createGame({
      seed: this.seed,
      dealer,
      wallOffset,
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
    return this.state.phase === PHASE_FINISHED
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
    if (this.state.phase === PHASE_FINISHED) {
      this.closeWindow()
      return
    }
    const identity = windowIdentity(this.state)
    const eligible = eligibleSeatsOf(this.state).filter(
      seat => legalActions(this.state, seat).length > 0
    )
    if (!identity || !eligible.length) {
      this.closeWindow()
      return
    }
    const legalBySeat = {}
    for (const seat of eligible) legalBySeat[seat] = legalActions(this.state, seat)

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
        type: windowTypeOf(this.state),
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

  /**
   * 本窗口的 deadline 时长（毫秒）。
   *   · 定缺 / 换三张是**并行窗口**：全桌都在等同一家选完，固定走
   *     config.voidTimeoutSeconds（不随房间思考时长放大，否则开局会被拖住）；
   *   · 摸打 / 响应按本房间的思考时长（建房间时房主可设置，缺省服务端默认值）。
   */
  windowTimeoutMs() {
    if (this.state.phase === PHASE_SWAP || this.state.phase === PHASE_VOID) {
      return config.voidTimeoutSeconds * 1000
    }
    return (this.room.turnTimeoutSeconds || config.turnTimeoutSeconds) * 1000
  }

  // ---------- 计时（服务端是计时权威） ----------

  /** 真 AI 座位的出牌节奏（纯表现，不是超时配置） */
  aiPaceMs(seat) {
    return 350 + (seat % 4) * 120
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
    const legal = legalActions(this.state, seat)
    if (!legal.length) return
    const view = playerView(this.state, seat)

    const action = await this.ai.decide(view, seat, { seed: this.seed })

    // 返回队列任务：调用方（测试 / 关停流程）可以 await 到这一步真正落子
    return this.room.queue.push(() => {
      if (this.aborted || this.state.phase === PHASE_FINISHED) return
      if (!this.window || this.window.windowId !== windowId) return // 窗口已推进，丢弃
      if (!isEligible(this.window, seat)) return
      const nowLegal = legalActions(this.state, seat)
      if (!nowLegal.length) return
      let final = action && matchesLegalOption(nowLegal, action) ? action : null
      if (!final) final = fallbackAction(playerView(this.state, seat))
      if (!final || !matchesLegalOption(nowLegal, final)) final = firstLegalAction(nowLegal)
      if (!final) return
      this.applyAction({ seat, action: final, source, requestId: null })
    })
  }

  // ---------- 动作 ----------

  /**
   * 真人的 PLAYER_ACTION（调用方需已在房间队列内）。
   * 校验：房间状态 / 是否轮到你 / windowId 是否仍有效 / 动作是否合法
   * （文档 §33）；最终裁决仍由引擎 dispatch 完成。
   */
  handlePlayerAction({ seat, windowId, action, requestId, source = SOURCE.HUMAN }) {
    if (this.aborted) fail(ERR.ROOM_DESTROYED)
    if (this.state.phase === PHASE_FINISHED) fail(ERR.GAME_ALREADY_FINISHED)
    if (!this.window) fail(ERR.ACTION_WINDOW_EXPIRED)
    if (windowId == null || windowId !== this.window.windowId) {
      fail(ERR.ACTION_WINDOW_EXPIRED, '行动窗口已失效')
    }
    if (!isEligible(this.window, seat)) fail(ERR.NOT_YOUR_TURN)
    const legal = legalActions(this.state, seat)
    if (!matchesLegalOption(legal, action)) fail(ERR.INVALID_ACTION)

    const res = this.applyAction({ seat, action, source, requestId })
    if (!res.ok) fail(ENGINE_ERROR_MAP[res.error] || ERR.INVALID_ACTION, '引擎拒绝：' + res.error)
    return res
  }

  /** 统一落子入口：补 actionId / stateVersion → 引擎裁决 → 推进窗口 → 广播 */
  applyAction({ seat, action, source, requestId }) {
    const payload = {
      ...action,
      seat,
      actionId: requestId || 'srv-' + this.gameId + '-' + ++this.actionSeq,
      stateVersion: this.state.version
    }
    const res = engineDispatch(this.state, payload)
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

    if (this.state.phase === PHASE_FINISHED) {
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
    const results = settlementOf(this.state)
    this.hub.broadcastEvent(this.room, 'GAME_FINISHED', {
      gameId: this.gameId,
      results
    })
    this.room.onSessionFinished(this, results)
  }

  /** 终止牌局（最后一个真人退出 / 房间销毁）：撤掉全部定时器与待处理动作 */
  abort(reason) {
    if (this.aborted) return
    this.aborted = true
    this.closeWindow()
    this.logger('game-aborted', { gameId: this.gameId, reason })
  }

  dispose(reason) {
    this.abort(reason || 'disposed')
  }

  /** 该座位可见的完整视图（含房间 meta） */
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
      // 开局骰子 / 局号 / 墙头方位：前端据此做掷骰仪式与牌墙缺口（纯展示）
      round: this.round,
      dice: this.dice,
      headSeat: this.headSeat,
      mode: 'dealer',
      // 多局联机：房间累计积分（绝对座位口径，serializer 会按视角旋转）与破产座位
      scores: (room.scores || []).slice(),
      bankruptSeats: (room.bankruptSeats || []).slice(),
      seats: room.seats.map(seatSnapshot)
    }
    return buildPlayerViewForSeat(this.state, seat, meta)
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