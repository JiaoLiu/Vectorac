// ============================================================
// 五子棋适配器（mahjong-service/rooms/adapters/gomoku.js）
// ------------------------------------------------------------
// 2 人先后手游戏接入通用房间架构：
//   · 房主选边（hostSide: black 执黑先行 / white 执白后行），每局换先；
//   · 黑棋先行；结算 delta：胜 +10 / 负 -10 / 和棋 0（破产判定走通用房间逻辑）；
//   · 引擎与 AI 复用 .vuepress/components/gomoku/（薄转发，规则只有一份）。
// 本文件负责：对局状态机、行动窗口判定、AI 兜底、2 人视角序列化（无旋转）。
// ============================================================

import {
  EMPTY,
  BLACK,
  WHITE,
  createBoard,
  inBoard,
  opponentOf,
  checkWin,
  isFull,
  getCandidateMoves
} from '../../engine/gomoku/engine.js'
import { chooseMove, LEVEL } from '../../engine/gomoku/ai.js'
import { config } from '../../config.js'
import { ERR, fail } from '../../errors.js'
import { WINDOW_TYPE } from '../action-window.js'

const PHASE_PLAY = 'play'
const PHASE_FINISHED = 'finished'

/** 胜方得分 / 负方失分（和棋 0），与通用房间积分入账口径一致 */
const WIN_SCORE = 10

const DEFAULT_RULES = { aiLevel: LEVEL.MEDIUM }
const AI_LEVELS = new Set([LEVEL.EASY, LEVEL.MEDIUM, LEVEL.HARD])

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
  const seatColor = [EMPTY, EMPTY]
  seatColor[firstSeat] = BLACK // 先手座执黑
  seatColor[1 - firstSeat] = WHITE
  return {
    version: 0,
    phase: PHASE_PLAY,
    board: createBoard(),
    turn: BLACK,
    seatColor,
    lastMove: null,
    winLine: null,
    winner: null, // 胜方座位；和棋为 null
    draw: false,
    moves: 0,
    actionIds: new Set()
  }
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
  const x = Number(action.x)
  const y = Number(action.y)
  if (!Number.isInteger(x) || !Number.isInteger(y) || !inBoard(x, y)) {
    return { ok: false, error: 'illegal' }
  }
  if (state.board[y][x] !== EMPTY) return { ok: false, error: 'illegal' }

  const color = state.turn
  state.board[y][x] = color
  state.moves += 1
  state.lastMove = { x, y, color, seat }
  if (action.actionId) {
    state.actionIds.add(action.actionId)
    // 防膨胀：只保留最近一批 actionId（溢出丢最旧）
    if (state.actionIds.size > 512) state.actionIds.delete(state.actionIds.keys().next().value)
  }
  const line = checkWin(state.board, x, y)
  if (line) {
    state.phase = PHASE_FINISHED
    state.winner = seat
    state.winLine = line
  } else if (isFull(state.board)) {
    state.phase = PHASE_FINISHED
    state.draw = true
  } else {
    state.turn = opponentOf(color)
  }
  state.version += 1
  return { ok: true, state }
}

// ---------- 合法动作 ----------

/**
 * 当前座位的合法动作。points 是候选落点（已有棋子附近的空点，启发式子集），
 * 供 AI 兜底取用；不做结构校验依据 —— 远点收官同样是合法棋。
 */
function legalActions(state, seat) {
  if (state.phase !== PHASE_PLAY) return []
  if (state.seatColor[seat] !== state.turn) return []
  return [{ type: 'move', points: getCandidateMoves(state.board) }]
}

/** 结构校验：坐标是棋盘内整数即可；落点是否占用由 dispatch 最终裁决 */
function matchesLegalOption(legal, action) {
  if (!action || action.type !== 'move') return false
  if (!legal.some(o => o.type === 'move')) return false
  const x = Number(action.x)
  const y = Number(action.y)
  return Number.isInteger(x) && Number.isInteger(y) && inBoard(x, y)
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

function aiDecideFor(view, level, rng) {
  const mv = chooseMove(view.board, view.myColor, level || LEVEL.MEDIUM, rng)
  return mv ? { type: 'move', x: mv.x, y: mv.y } : null
}

/** 确定性兜底：候选点表已按「近子 + 近中心」排序，取第一个 */
function aiFallback(view) {
  const board = (view && view.board) || null
  if (!board) return null
  const cands = getCandidateMoves(board)
  if (!cands.length) return null
  const [x, y] = cands[0]
  return { type: 'move', x, y }
}

function aiLastResort(legal) {
  const opt = (legal || []).find(o => o.type === 'move')
  const pt = opt && opt.points && opt.points[0]
  return pt ? { type: 'move', x: pt[0], y: pt[1] } : null
}

// ---------- 视角序列化（2 人无旋转，双方同盘） ----------

function settlementOf(state) {
  return {
    winner: state.winner,
    draw: state.draw,
    moves: state.moves,
    winLine: state.winLine,
    perSeat: [0, 1].map(seat => ({
      seat,
      delta: state.draw ? 0 : seat === state.winner ? WIN_SCORE : -WIN_SCORE
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
    winLine: state.winLine,
    winner: state.winner,
    draw: state.draw,
    moves: state.moves,
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
  gameId: 'gomoku',
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
  aiLevelOf: room => (room.rules && room.rules.aiLevel) || LEVEL.MEDIUM,

  serializeView,

  /** 首局按房主选边定先手；之后每局换先（与上局 firstSeat 互换） */
  nextRoundCtx(room, results, roundCtx) {
    if (!results) {
      const admin = room.adminSeat === 0 || room.adminSeat === 1 ? room.adminSeat : 0
      return { firstSeat: room.hostSide === 'white' ? 1 - admin : admin }
    }
    const prev = roundCtx && roundCtx.firstSeat != null ? roundCtx.firstSeat : 0
    return { firstSeat: 1 - prev }
  }
}
