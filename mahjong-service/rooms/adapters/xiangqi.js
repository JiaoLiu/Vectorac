// ============================================================
// 中国象棋适配器（mahjong-service/rooms/adapters/xiangqi.js）
// ------------------------------------------------------------
// 2 人先后手游戏接入通用房间架构：
//   · 房主选边（hostSide: red 执红先行 / black 执黑后行），每局换先；
//   · 红棋先行；将死 / 困毙均判负（引擎 resultForSideToMove 口径）；
//   · 结算 delta：胜 +10 / 负 -10（无和棋判定，与单机引擎行为一致；
//     长打 / 循环招法暂不裁决，与单机版保持同等简化）；
//   · 引擎与 AI 复用 .vuepress/components/xiangqi/engine.mjs（薄转发，规则只有一份）。
// 本文件负责：对局状态机、行动窗口判定、AI 兜底、2 人视角序列化（无旋转，
// 客户端按 myColor 自行翻转棋盘渲染）。
// ============================================================

import {
  RED,
  BLACK,
  FILES,
  RANKS,
  otherSide,
  createInitialBoard,
  applyMove,
  getLegalMoves,
  resultForSideToMove,
  isInCheck,
  chooseMove
} from '../../engine/xiangqi/engine.js'
import { config } from '../../config.js'
import { ERR, fail } from '../../errors.js'
import { WINDOW_TYPE } from '../action-window.js'

const PHASE_PLAY = 'play'
const PHASE_FINISHED = 'finished'

/** 胜方得分 / 负方失分（无和棋），与通用房间积分入账口径一致 */
const WIN_SCORE = 10

const DEFAULT_RULES = { aiLevel: 'medium' }
const AI_LEVELS = new Set(['easy', 'medium', 'hard'])

// ---------- 规则 ----------

/** 规则清洗：只接受 aiLevel（easy/medium/hard），其余字段一律忽略 */
function sanitizeRules(input) {
  const out = { ...DEFAULT_RULES }
  if (input == null) return out
  if (typeof input !== 'object') fail(ERR.INVALID_RULES, 'rules 必须是对象')
  if (Object.prototype.hasOwnProperty.call(input, 'aiLevel')) {
    const v = String(input.aiLevel)
    if (!AI_LEVELS.has(v)) fail(ERR.INVALID_RULES, '规则 aiLevel 必须是 easy / medium / hard')
    out.aiLevel = v
  }
  return out
}

// ---------- 对局状态机（引擎 dispatch 契约：{ok,state} / {ok:false,error}） ----------

function createState(engineInit) {
  const firstSeat = engineInit && engineInit.firstSeat === 1 ? 1 : 0
  const seatColor = [null, null]
  seatColor[firstSeat] = RED // 先手座执红（红棋先行）
  seatColor[1 - firstSeat] = BLACK
  return {
    version: 0,
    phase: PHASE_PLAY,
    board: createInitialBoard(),
    turn: RED,
    seatColor,
    lastMove: null,
    winner: null, // 胜方座位
    winSide: null, // 胜方颜色（RED / BLACK）
    checkmate: false, // true=将死，false=困毙
    moves: 0,
    actionIds: new Set()
  }
}

function inBoard(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < FILES && y >= 0 && y < RANKS
}

function dispatch(state, action) {
  if (!action || action.type !== 'move') return { ok: false, error: 'illegal' }
  if (state.phase !== PHASE_PLAY) return { ok: false, error: 'wrong-phase' }
  if (action.stateVersion != null && action.stateVersion !== state.version) {
    return { ok: false, error: 'stale' }
  }
  if (action.actionId && state.actionIds.has(action.actionId)) {
    return { ok: false, error: 'duplicate' }
  }
  const seat = action.seat
  if (seat !== 0 && seat !== 1) return { ok: false, error: 'illegal' }
  if (state.seatColor[seat] !== state.turn) return { ok: false, error: 'not-active' }
  const fromX = Number(action.fromX)
  const fromY = Number(action.fromY)
  const toX = Number(action.toX)
  const toY = Number(action.toY)
  if (!inBoard(fromX, fromY) || !inBoard(toX, toY)) return { ok: false, error: 'illegal' }

  // 走法合法性由引擎全权裁决（子力归属 / 走子规则 / 别腿塞眼 / 送将全在这里过滤）：
  // 在轮走方的全部合法着法里找同起讫点的一条，找不到即非法。
  const color = state.turn
  const mv = getLegalMoves(state.board, color).find(
    m => m.fromX === fromX && m.fromY === fromY && m.toX === toX && m.toY === toY
  )
  if (!mv) return { ok: false, error: 'illegal' }

  state.board = applyMove(state.board, mv)
  state.moves += 1
  state.lastMove = { fromX, fromY, toX, toY, capture: mv.capture, side: color, seat }
  if (action.actionId) {
    state.actionIds.add(action.actionId)
    // 防膨胀：只保留最近一批 actionId（溢出丢最旧）
    if (state.actionIds.size > 512) state.actionIds.delete(state.actionIds.keys().next().value)
  }
  const result = resultForSideToMove(state.board, otherSide(color))
  if (result) {
    state.phase = PHASE_FINISHED
    state.winSide = result.winner
    state.winner = state.seatColor.indexOf(result.winner)
    state.checkmate = !!result.checkmate
  } else {
    state.turn = otherSide(color)
  }
  state.version += 1
  return { ok: true, state }
}

// ---------- 合法动作 ----------

/**
 * 当前座位的合法动作。moves 是轮走方的全部合法着法（通常 ≤ 40 条），
 * 既供 AI 兜底取用，也随视图下发给客户端做「选中棋子后的落点高亮」；
 * 结构校验只靠 matchesLegalOption，最终合法性由 dispatch 裁决。
 */
function legalActions(state, seat) {
  if (state.phase !== PHASE_PLAY) return []
  if (state.seatColor[seat] !== state.turn) return []
  return [{ type: 'move', moves: getLegalMoves(state.board, state.turn) }]
}

/** 结构校验：起讫坐标是棋盘内整数即可；走法是否合法由 dispatch 最终裁决 */
function matchesLegalOption(legal, action) {
  if (!action || action.type !== 'move') return false
  if (!legal.some(o => o.type === 'move')) return false
  return (
    inBoard(Number(action.fromX), Number(action.fromY)) &&
    inBoard(Number(action.toX), Number(action.toY))
  )
}

// ---------- 行动窗口 ----------

/** 每落一子开新窗口（moves 单调递增，天然稳定且不复用） */
function windowIdentityOf(state) {
  return state.phase === PHASE_PLAY ? 'move:' + state.moves : null
}

function windowTypeOf(state) {
  return state.phase === PHASE_PLAY ? WINDOW_TYPE.SELF_TURN : WINDOW_TYPE.OTHER
}

function eligibleSeatsOf(state) {
  if (state.phase !== PHASE_PLAY) return []
  return [state.seatColor.indexOf(state.turn)]
}

function windowTimeoutMs(state, room) {
  return (room.turnTimeoutSeconds || config.turnTimeoutSeconds) * 1000
}

// ---------- AI ----------

function toAction(mv) {
  return mv
    ? { type: 'move', fromX: mv.fromX, fromY: mv.fromY, toX: mv.toX, toY: mv.toY }
    : null
}

function aiDecideFor(view, level, rng) {
  return toAction(chooseMove(view.board, view.myColor, level || 'medium', rng))
}

/** 确定性兜底：引擎合法着法表的第一条（已含全部规则约束） */
function aiFallback(view) {
  const board = (view && view.board) || null
  const color = view && view.myColor
  if (!board || !color) return null
  const moves = getLegalMoves(board, color)
  return moves.length ? toAction(moves[0]) : null
}

function aiLastResort(legal) {
  const opt = (legal || []).find(o => o.type === 'move')
  const mv = opt && opt.moves && opt.moves[0]
  return mv ? toAction(mv) : null
}

// ---------- 视角序列化（2 人无旋转，双方同盘；客户端按 myColor 翻转渲染） ----------

function settlementOf(state) {
  return {
    winner: state.winner,
    winSide: state.winSide,
    draw: false,
    checkmate: state.checkmate,
    moves: state.moves,
    perSeat: [0, 1].map(seat => ({
      seat,
      delta: seat === state.winner ? WIN_SCORE : -WIN_SCORE
    }))
  }
}

function playerViewFor(state, seat) {
  return {
    version: state.version,
    phase: state.phase,
    board: state.board,
    turn: state.turn,
    myColor: state.seatColor[seat],
    seatColor: state.seatColor.slice(),
    lastMove: state.lastMove,
    winner: state.winner,
    winSide: state.winSide,
    checkmate: state.checkmate,
    moves: state.moves,
    // 当前被将军的一方（仅对局中计算，客户端给将/帅画警示圈）
    inCheck:
      state.phase === PHASE_PLAY && isInCheck(state.board, state.turn) ? state.turn : null,
    legal: legalActions(state, seat),
    results: state.phase === PHASE_FINISHED ? settlementOf(state) : null
  }
}

function buildMeta(meta, viewerSeat) {
  if (!meta) return null
  const seats = [0, 1].map(i => {
    const s = (meta.seats || [])[i] || { seatIndex: i, occupantType: 'EMPTY' }
    return {
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
    }
  })
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
    firstSeat: meta.firstSeat == null ? null : meta.firstSeat,
    mode: meta.mode || 'first-move',
    scores: Array.isArray(meta.scores) ? meta.scores.slice() : null,
    bankruptSeats: Array.isArray(meta.bankruptSeats) ? meta.bankruptSeats.slice() : [],
    mySeat: viewerSeat,
    adminSeat: meta.adminSeat == null ? null : meta.adminSeat,
    isAdmin: viewerSeat === meta.adminSeat,
    seats
  }
}

function serializeView(state, viewerSeat, meta) {
  return { ...playerViewFor(state, viewerSeat), meta: buildMeta(meta, viewerSeat) }
}

// ---------- 适配器 ----------

export const adapter = {
  gameId: 'xiangqi',
  seatsPerRoom: 2,
  defaultRules: DEFAULT_RULES,
  sanitizeRules,

  /** 开局：firstSeat 已由 nextRoundCtx 定好（首局房主选边，之后换先） */
  openingFor(room, roundCtx) {
    const firstSeat = roundCtx && roundCtx.firstSeat != null ? roundCtx.firstSeat : 0
    return {
      engineInit: { firstSeat },
      ceremony: { firstSeat, mode: 'first-move' },
      firstMoverSeat: firstSeat
    }
  },

  createState,

  dispatch,
  legalActions,
  playerView: playerViewFor,
  settlementOf,
  isFinished: state => state.phase === PHASE_FINISHED,

  windowIdentityOf,
  windowTypeOf,
  eligibleSeatsOf,
  windowTimeoutMs,
  matchesLegalOption,

  aiDecide: aiDecideFor,
  aiFallback,
  aiLastResort,
  aiLevelOf: room => (room.rules && room.rules.aiLevel) || 'medium',

  serializeView,

  /** 首局按房主选边定先手（执红先行）；之后每局换先（与上局 firstSeat 互换） */
  nextRoundCtx(room, results, roundCtx) {
    if (!results) {
      const admin = room.adminSeat === 0 || room.adminSeat === 1 ? room.adminSeat : 0
      return { firstSeat: room.hostSide === 'black' ? 1 - admin : admin }
    }
    const prev = roundCtx && roundCtx.firstSeat != null ? roundCtx.firstSeat : 0
    return { firstSeat: 1 - prev }
  }
}
