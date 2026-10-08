// ============================================================
// 四国军棋适配器（mahjong-service/rooms/adapters/junqi.js）
// ------------------------------------------------------------
// 4 人 2v2 接入通用房间架构，与五子棋 / 象棋有两点本质不同：
//
//   · 并行布阵窗口：开局 4 家同时布阵（随机换阵 / 两子交换 / 确认出征），
//     全部确认后引擎掷骰定先手。借行动窗口「identity 不变则 windowId 复用、
//     eligibleSeats 随确认递减」的机制实现（与麻将换三张同构）；
//   · 暗棋隐私：棋子类型按 visibleType 逐座位过滤，敌方子只发位置与
//     匿名 ref（真实 id 形如 '0-commander-0'，本身就泄露棋种）；
//     玩家视图带 _engine 内部引用供 AI 决策，serializeView 一律剥掉。
//
// 无选边：先后手由掷骰决定（rollOpening），每局重新掷。
// 结算：胜方阵营每人 +10 / 负方 -10；70 手无碰撞和棋各 0。
// 引擎与 AI 复用 .vuepress/components/junqi/engine.mjs（薄转发，规则只有一份）。
// ============================================================

import {
  team,
  createGame,
  randomizeFormation,
  swapFormation,
  rollOpening,
  startGame,
  legalMoves,
  move,
  surrender,
  visibleType,
  chooseAI
} from '../../engine/junqi/engine.js'
import { config } from '../../config.js'
import { ERR, fail } from '../../errors.js'
import { WINDOW_TYPE } from '../action-window.js'

const PHASE_SETUP = 'setup'
const PHASE_PLAY = 'play'
const PHASE_FINISHED = 'finished'

/** 胜方阵营每人得分 / 负方失分，和棋 0 */
const WIN_SCORE = 10

const DEFAULT_RULES = { mode: 'dark' }
const MODES = new Set(['dark', 'dual', 'open'])

// ---------- 规则 ----------

/** 规则清洗：只接受 mode（dark 四暗 / dual 双明 / open 全明），其余字段一律忽略 */
function sanitizeRules(input) {
  const out = { ...DEFAULT_RULES }
  if (input == null) return out
  if (typeof input !== 'object') fail(ERR.INVALID_RULES, 'rules 必须是对象')
  if (Object.prototype.hasOwnProperty.call(input, 'mode')) {
    const v = String(input.mode)
    if (!MODES.has(v)) fail(ERR.INVALID_RULES, '规则 mode 必须是 dark / dual / open')
    out.mode = v
  }
  return out
}

// ---------- 对局状态机（引擎 dispatch 契约：{ok,state} / {ok:false,error}） ----------

/** 给某家棋子补匿名 ref（暗棋视图用它代替会泄露棋种的真实 id） */
function assignRefs(s, seat) {
  let i = 0
  for (const p of s.pieces) {
    if (p.seat === seat) p.ref = 'r' + seat * 25 + i++
  }
}

function createState(engineInit, ctx) {
  // 契约占位：军棋无开局注入（阵型自动生成、先手掷骰定），engineInit 恒为 {}
  void engineInit
  const mode = (ctx && ctx.rules && ctx.rules.mode) || DEFAULT_RULES.mode
  const seed = (ctx && ctx.seed) >>> 0
  const s = createGame({ seed, mode })
  for (let seat = 0; seat < 4; seat++) assignRefs(s, seat)
  return {
    version: 0,
    actionIds: new Set(),
    confirmed: [false, false, false, false],
    opening: null, // 全部确认后填入 { rounds, first }
    s
  }
}

function dispatch(state, action) {
  if (!action || typeof action.type !== 'string') return { ok: false, error: 'illegal' }
  const s = state.s
  const isSetupAction = action.type === 'randomize' || action.type === 'swap' || action.type === 'confirm'
  if (isSetupAction && s.phase !== PHASE_SETUP) return { ok: false, error: 'wrong-phase' }
  if (!isSetupAction && s.phase !== PHASE_PLAY) return { ok: false, error: 'wrong-phase' }
  if (action.stateVersion != null && action.stateVersion !== state.version) {
    return { ok: false, error: 'stale' }
  }
  if (action.actionId && state.actionIds.has(action.actionId)) {
    return { ok: false, error: 'duplicate' }
  }
  const seat = action.seat
  if (seat !== 0 && seat !== 1 && seat !== 2 && seat !== 3) return { ok: false, error: 'illegal' }

  if (s.phase === PHASE_SETUP) {
    if (state.confirmed[seat]) return { ok: false, error: 'illegal' }
    if (action.type === 'randomize') {
      if (!randomizeFormation(s, seat)) return { ok: false, error: 'illegal' }
      assignRefs(s, seat)
    } else if (action.type === 'swap') {
      if (typeof action.first !== 'string' || typeof action.second !== 'string') {
        return { ok: false, error: 'illegal' }
      }
      if (!swapFormation(s, action.first, action.second)) return { ok: false, error: 'illegal' }
    } else {
      // confirm：锁定阵型；四家齐确认 → 掷骰定先手，转入走子阶段
      state.confirmed[seat] = true
      if (state.confirmed.every(Boolean)) {
        const roll = rollOpening(s)
        startGame(s, roll)
        state.opening = { rounds: roll.rounds, first: roll.first }
      }
    }
  } else if (action.type === 'move') {
    if (seat !== s.turn) return { ok: false, error: 'not-active' }
    if (typeof action.pieceId !== 'string' || typeof action.to !== 'string') {
      return { ok: false, error: 'illegal' }
    }
    if (!move(s, action.pieceId, action.to)) return { ok: false, error: 'illegal' }
  } else if (action.type === 'surrender') {
    if (seat !== s.turn) return { ok: false, error: 'not-active' }
    if (!surrender(s, seat)) return { ok: false, error: 'illegal' }
  } else {
    return { ok: false, error: 'illegal' }
  }

  if (action.actionId) {
    state.actionIds.add(action.actionId)
    if (state.actionIds.size > 512) state.actionIds.delete(state.actionIds.keys().next().value)
  }
  state.version += 1
  return { ok: true, state }
}

// ---------- 合法动作 ----------

/** 某座位全部可走招法（{pieceId,to} 平铺），供视图高亮与 AI 兜底 */
function allMoves(s, seat) {
  const out = []
  for (const p of s.pieces) {
    if (p.seat !== seat) continue
    for (const to of legalMoves(s, p.id)) out.push({ pieceId: p.id, to })
  }
  return out
}

function legalActions(state, seat) {
  const s = state.s
  if (s.phase === PHASE_SETUP) {
    return state.confirmed[seat]
      ? []
      : [{ type: 'randomize' }, { type: 'swap' }, { type: 'confirm' }]
  }
  if (s.phase !== PHASE_PLAY || seat !== s.turn || !s.alive[seat]) return []
  return [{ type: 'move', moves: allMoves(s, seat) }, { type: 'surrender' }]
}

/** 结构校验：类型在选项里、字段形态对；最终合法性由 dispatch 裁决 */
function matchesLegalOption(legal, action) {
  if (!action || typeof action.type !== 'string') return false
  const opt = (legal || []).find(o => o.type === action.type)
  if (!opt) return false
  if (action.type === 'move') {
    return typeof action.pieceId === 'string' && typeof action.to === 'string'
  }
  if (action.type === 'swap') {
    return typeof action.first === 'string' && typeof action.second === 'string'
  }
  return true // randomize / confirm / surrender 无参数
}

// ---------- 行动窗口 ----------

/** 布阵阶段一个并行窗口；走子阶段每手一个窗口（turns 单调递增） */
function windowIdentityOf(state) {
  const s = state.s
  if (s.phase === PHASE_SETUP) return 'setup'
  if (s.phase === PHASE_PLAY) return 'move:' + s.turns
  return null
}

function windowTypeOf(state) {
  return state.s.phase === PHASE_SETUP ? WINDOW_TYPE.EXCHANGE_SELECTION : WINDOW_TYPE.SELF_TURN
}

function eligibleSeatsOf(state) {
  const s = state.s
  if (s.phase === PHASE_SETUP) return [0, 1, 2, 3].filter(seat => !state.confirmed[seat])
  if (s.phase === PHASE_PLAY) return [s.turn]
  return []
}

function windowTimeoutMs(state, room) {
  const seconds = room.turnTimeoutSeconds || config.turnTimeoutSeconds
  // 布阵要摆弄 25 枚棋子，给走子时限的 3 倍、且至少 60 秒
  if (state.s.phase === PHASE_SETUP) return Math.max(60, seconds * 3) * 1000
  return seconds * 1000
}

// ---------- AI ----------

function aiDecideFor(view) {
  const state = view && view._engine
  if (!state) return null
  const s = state.s
  if (s.phase === PHASE_SETUP) return { type: 'confirm' }
  const pick = chooseAI(s, view.mySeat)
  return pick ? { type: 'move', pieceId: pick.pieceId, to: pick.to } : null
}

/** 确定性兜底：布阵直接确认；走子取合法表第一手，无棋可走则投降 */
function aiFallback(view) {
  const state = view && view._engine
  if (!state) return null
  const s = state.s
  if (s.phase === PHASE_SETUP) return { type: 'confirm' }
  const moves = allMoves(s, view.mySeat)
  if (moves.length) return { type: 'move', pieceId: moves[0].pieceId, to: moves[0].to }
  return { type: 'surrender' }
}

function aiLastResort(legal) {
  const opt = (legal || []).find(o => o.type === 'move')
  const mv = opt && opt.moves && opt.moves[0]
  if (mv) return { type: 'move', pieceId: mv.pieceId, to: mv.to }
  if ((legal || []).some(o => o.type === 'confirm')) return { type: 'confirm' }
  if ((legal || []).some(o => o.type === 'surrender')) return { type: 'surrender' }
  return null
}

// ---------- 视角序列化（暗棋过滤：类型按 visibleType，敌子用匿名 ref） ----------

function settlementOf(state) {
  const s = state.s
  const draw = s.winner === 'draw'
  return {
    winner: draw ? null : s.winner, // 胜方阵营（0 / 1）
    draw,
    turns: s.turns,
    perSeat: [0, 1, 2, 3].map(seat => ({
      seat,
      delta: draw ? 0 : team(seat) === s.winner ? WIN_SCORE : -WIN_SCORE
    }))
  }
}

function playerViewFor(state, seat) {
  const s = state.s
  return {
    version: state.version,
    phase: s.phase,
    mode: s.mode,
    turn: s.turn,
    turns: s.turns,
    quiet: s.quiet,
    mySeat: seat,
    confirmed: state.confirmed.slice(),
    myConfirmed: state.confirmed[seat],
    alive: s.alive.slice(),
    flags: s.flags.slice(),
    opening: state.opening,
    // 隐私核心：visibleType 过的子发真实 id 与棋种，其余只发匿名 ref。
    // 敌暗子附 intel 假设池（只含 viewer 自己交战可推断的范围），供前端
    // 渲染情报角标（吃军长存活 → 必是司令）；不含任何服务端私有信息。
    pieces: s.pieces.map(p => {
      const type = visibleType(s, p, seat)
      const item = { id: type ? p.id : p.ref, seat: p.seat, pos: p.pos, type, moved: !!p.moved }
      if (!type && team(p.seat) !== team(seat)) {
        const pool = s.intel && s.intel[seat + ':' + p.id]
        if (pool && pool.length) item.intel = pool
      }
      return item
    }),
    logs: s.logs.slice(0, 30),
    lastMove: s.lastMove,
    legal: legalActions(state, seat),
    results: s.phase === PHASE_FINISHED ? settlementOf(state) : null,
    // 内部引用：仅供 adapter.aiDecide / aiFallback 使用，serializeView 一律剥掉
    _engine: state
  }
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
    mode: meta.mode || 'deploy',
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
  gameId: 'junqi',
  seatsPerRoom: 4,
  defaultRules: DEFAULT_RULES,
  sanitizeRules,

  /** 无选边：阵型在 createState 自动生成，先手由布阵后掷骰决定 */
  openingFor() {
    return {
      engineInit: {},
      ceremony: { mode: 'deploy' },
      firstMoverSeat: null
    }
  },

  createState,

  dispatch,
  legalActions,
  playerView: playerViewFor,
  settlementOf,
  isFinished: state => state.s.phase === PHASE_FINISHED,

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

  /** 每局重新开始（新 seed 布阵 + 重新掷骰），无局间上下文 */
  nextRoundCtx() {
    return {}
  }
}
