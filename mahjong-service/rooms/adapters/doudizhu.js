// ============================================================
// 斗地主适配器（mahjong-service/rooms/adapters/doudizhu.js）
// ------------------------------------------------------------
// 3 人房接入通用房间架构。引擎（.vuepress/components/doudizhu/
// engine.mjs）已是纯函数 + 可序列化状态，本层只做三件事：
//
//   · 契约包装：引擎 dispatch(state, action, seat) 三参 → 契约单参 +
//     五错误词（stale/duplicate/not-active/illegal/wrong-phase）+
//     version/actionIds 幂等（与 junqi 同款 wrapper state）；
//   · 窗口映射：叫分/抢地主/加倍/出牌四阶段每步一窗
//     （identity 用 wrapper version 单调递增，redeal 重发也不回退）；
//   · 积分换算：引擎局分（calledScore×multiplier，地主可 ±384）
//     换成房间节奏分——地主 ±20 / 农民各 ±10（100 分起始破产制）。
//
// 暗牌隐私由引擎 playerView 保证：只发自家手牌 + 他家张数 +
// 未亮底牌只发长度。AI 托管复用 doudizhu/ai.js（aiDecide 吃
// playerView 输出，四阶段全覆盖）。
// ============================================================

import {
  createGame,
  legalActions as engineLegalActions,
  dispatch as engineDispatch,
  playerView as enginePlayerView,
  settlementOf as engineSettlement,
  drainEvents
} from '../../engine/doudizhu/engine.js'
import { aiDecide } from '../../engine/doudizhu/ai.js'
import { ERR, fail } from '../../errors.js'
import { WINDOW_TYPE } from '../action-window.js'

const PHASE_OVER = 'over'

/** 房间积分口径：地主 ±20 / 农民各 ±10（引擎局分只作展示，不作入账） */
const LANDLORD_DELTA = 20
const FARMER_DELTA = 10

const DEFAULT_RULES = {}

// ---------- 规则 ----------

/** 斗地主暂无房规：任何输入都归一成空对象（传字段不报错，全部忽略） */
function sanitizeRules(input) {
  if (input == null) return { ...DEFAULT_RULES }
  if (typeof input !== 'object') fail(ERR.INVALID_RULES, 'rules 必须是对象')
  return { ...DEFAULT_RULES }
}

// ---------- 对局状态机 ----------

/** 当前唯一行动座位（四阶段各一个 turn 字段；over / 过渡瞬间为 null） */
function phaseSeat(s) {
  if (s.phase === 'bidding') return s.bidTurn
  if (s.phase === 'robbing') return s.robTurn
  if (s.phase === 'doubling') return s.dblTurn
  if (s.phase === 'playing') return s.turn
  return null
}

/** 各阶段接受的动作类型（错误码 wrong-phase 的判定依据） */
const TYPES_BY_PHASE = {
  bidding: ['bid'],
  robbing: ['rob'],
  doubling: ['double'],
  playing: ['pass', 'play']
}

function createState(engineInit, ctx) {
  // 契约占位：斗地主无开局注入（发牌种子由会话层给）
  void engineInit
  const seed = (ctx && ctx.seed) >>> 0
  const s = createGame({ seed: seed || 1 })
  drainEvents(s) // 服务端不消费事件流（单机 UI 的动画驱动），防止状态里积攒
  return {
    version: 0,
    actionIds: new Set(),
    s
  }
}

function dispatch(state, action) {
  if (!action || typeof action.type !== 'string') return { ok: false, error: 'illegal' }
  const s = state.s
  if (action.stateVersion != null && action.stateVersion !== state.version) {
    return { ok: false, error: 'stale' }
  }
  if (action.actionId && state.actionIds.has(action.actionId)) {
    return { ok: false, error: 'duplicate' }
  }
  const seat = action.seat
  if (seat !== 0 && seat !== 1 && seat !== 2) return { ok: false, error: 'illegal' }

  const active = phaseSeat(s)
  if (s.phase === PHASE_OVER || active == null) return { ok: false, error: 'wrong-phase' }
  if (!(TYPES_BY_PHASE[s.phase] || []).includes(action.type)) return { ok: false, error: 'wrong-phase' }
  if (seat !== active) return { ok: false, error: 'not-active' }

  const res = engineDispatch(s, action, seat)
  if (!res.ok) return { ok: false, error: 'illegal' }
  drainEvents(s)

  if (action.actionId) {
    state.actionIds.add(action.actionId)
    if (state.actionIds.size > 512) state.actionIds.delete(state.actionIds.keys().next().value)
  }
  state.version += 1
  return { ok: true, state }
}

// ---------- 合法动作 ----------

function legalActions(state, seat) {
  return engineLegalActions(state.s, seat)
}

/** 结构校验：类型在选项里、字段形态对；最终合法性由 dispatch 裁决 */
function matchesLegalOption(legal, action) {
  if (!action || typeof action.type !== 'string') return false
  const opt = (legal || []).find(o => o.type === action.type)
  if (!opt) return false
  if (action.type === 'bid') return Number.isInteger(action.score)
  if (action.type === 'rob') return typeof action.rob === 'boolean'
  if (action.type === 'double') return typeof action.double === 'boolean'
  if (action.type === 'play') {
    return Array.isArray(action.cards) &&
      action.cards.length > 0 &&
      action.cards.every(c => Number.isInteger(c) && c >= 0 && c < 54)
  }
  return true // pass 无参数
}

// ---------- 行动窗口 ----------

/** 每个动作一个窗口：identity 用 wrapper version（单调递增，redeal 重发不回退） */
function windowIdentityOf(state) {
  return state.s.phase === PHASE_OVER ? null : 'act:' + state.version
}

function windowTypeOf() {
  return WINDOW_TYPE.SELF_TURN
}

function eligibleSeatsOf(state) {
  const seat = phaseSeat(state.s)
  return seat == null ? [] : [seat]
}

function windowTimeoutMs(state, room) {
  // 叫分/抢/加倍通常几秒表态，与走子共用房间的思考时限，简单一致
  void state
  const seconds = room.turnTimeoutSeconds
  return seconds * 1000
}

// ---------- AI ----------

function aiDecideFor(view) {
  const state = view && view._engine
  if (!state) return null
  const s = state.s
  if (s.phase === PHASE_OVER) return null
  return aiDecide(view, view.seat)
}

/** 确定性兜底：叫分不叫 / 不抢 / 不加倍 / 能过则过（legalActions 首项） */
function aiFallback(view) {
  const state = view && view._engine
  if (!state) return null
  const s = state.s
  if (s.phase === 'bidding') return { type: 'bid', score: 0 }
  if (s.phase === 'robbing') return { type: 'rob', rob: false }
  if (s.phase === 'doubling') return { type: 'double', double: false }
  if (s.phase === 'playing') {
    const acts = engineLegalActions(s, view.seat)
    return acts.length ? acts[0] : null
  }
  return null
}

function aiLastResort(legal) {
  return (legal && legal[0]) || null
}

// ---------- 视角序列化（暗牌过滤：他家只发张数，底牌未亮只发长度） ----------

function settlementOf(state) {
  const s = state.s
  if (s.phase !== PHASE_OVER) return null
  const eng = engineSettlement(s)
  // 引擎局分只作展示；房间入账用地主 ±20 / 农民 ±10（破产节奏可控）
  const sign = s.winSide === 'landlord' ? 1 : -1
  const perSeat = [0, 1, 2].map(seat => ({
    seat,
    delta: seat === s.landlord ? sign * LANDLORD_DELTA : -sign * FARMER_DELTA
  }))
  return { ...eng, perSeat }
}

function playerViewFor(state, seat) {
  const view = enginePlayerView(state.s, seat)
  // 内部引用：仅供 adapter.aiDecide / aiFallback 使用，serializeView 一律剥掉
  view._engine = state
  return view
}

function buildMeta(meta, viewerSeat) {
  if (!meta) return null
  const seats = (meta.seats || []).map((s, i) => ({
    seatIndex: i,
    absSeat: i,
    occupantType: s.occupantType,
    displayName: s.displayName || '',
    connected: !!s.connected,
    autoPlay: !!s.autoPlay,
    isAi: s.occupantType === 'AI',
    isEmpty: s.occupantType === 'EMPTY',
    ready: !!s.ready,
    isAdmin: meta.adminSeat === i
  }))
  return {
    online: true,
    roomId: meta.roomId,
    roomCode: meta.roomCode,
    status: meta.status,
    gameId: meta.gameId,
    playerId: meta.playerId,
    windowId: meta.windowId == null ? null : meta.windowId,
    deadlineAt: meta.deadlineAt == null ? null : meta.deadlineAt,
    serverTime: meta.serverTime,
    round: meta.round == null ? 1 : meta.round,
    mode: meta.mode || 'deal',
    scores: Array.isArray(meta.scores) ? meta.scores.slice() : null,
    bankruptSeats: Array.isArray(meta.bankruptSeats) ? meta.bankruptSeats.slice() : [],
    mySeat: viewerSeat,
    adminSeat: meta.adminSeat == null ? null : meta.adminSeat,
    isAdmin: viewerSeat === meta.adminSeat,
    seats
  }
}

function serializeView(state, viewerSeat, meta) {
  const view = playerViewFor(state, viewerSeat)
  delete view._engine // 内部状态绝不出网
  return { ...view, meta: buildMeta(meta, viewerSeat) }
}

// ---------- 适配器 ----------

export const adapter = {
  gameId: 'doudizhu',
  seatsPerRoom: 3,
  defaultRules: DEFAULT_RULES,
  sanitizeRules,

  /** 无选边无注入：发牌与首家叫分都由引擎 seed 决定 */
  openingFor() {
    return {
      engineInit: {},
      ceremony: { mode: 'deal' },
      firstMoverSeat: null
    }
  },

  createState,

  dispatch,
  legalActions,
  playerView: playerViewFor,
  settlementOf,
  isFinished: state => state.s.phase === PHASE_OVER,

  windowIdentityOf,
  windowTypeOf,
  eligibleSeatsOf,
  windowTimeoutMs,
  matchesLegalOption,

  aiDecide: aiDecideFor,
  aiFallback,
  aiLastResort,
  aiLevelOf: () => null,

  serializeView,

  /** 每局重新发牌（新 seed），无局间上下文 */
  nextRoundCtx() {
    return {}
  }
}
