// ============================================================
// 麻将适配器（mahjong-service/rooms/adapters/mahjong.js）
// ------------------------------------------------------------
// 通用房间架构（Room / GameSession / Hub）与麻将规则之间的粘合层。
// 所有麻将专属逻辑都收在这里：规则清洗、开局掷骰仪式、行动窗口判定、
// AI 兜底、4 人视角旋转序列化。Room / GameSession 不 import 任何麻将模块。
//
// 本文件是从 room.js / game-session.js / action-window.js / ai-jobs.js /
// serializer.js 原样搬迁的麻将逻辑，行为必须与搬迁前完全等价。
// ============================================================

import { DEFAULT_RULES, PHASE_DISCARD, PHASE_RESPOND, PHASE_SWAP, PHASE_VOID, PHASE_FINISHED, YAOJI_TILE, tileSuit, SUITS } from '../../engine/contract.js'
import { createGame, dispatch as engineDispatch, legalActions, playerView, settlementOf } from '../../engine/engine.js'
import { aiDecide } from '../../engine/ai.js'
import { config } from '../../config.js'
import { ERR, fail } from '../../errors.js'
import { WINDOW_TYPE } from '../action-window.js'

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

// ---------- 规则 ----------

/**
 * 规则清洗（文档 §23）：只接受 DEFAULT_RULES 里已有的字段，
 * 服务端固定项（players / ruleVersion）不允许客户端改写。
 * 未知字段一律忽略；已知字段的类型与取值区间必须合法，越界返回 INVALID_RULES。
 */
function sanitizeRules(input) {
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
 * 下局庄家（与单机 ui.js nextDealerOf 同口径）：先胡者坐庄；一炮多响
 * （同一次出牌 / 抢杠被两家以上胡）时由点炮者坐庄；流局庄家留任。
 */
function nextDealerOf(results, fallbackSeat) {
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

// ---------- 行动窗口（麻将阶段判定） ----------

/**
 * 逻辑窗口的稳定标识：同一逻辑窗口内其他座位表态（version 变化）不会改变它。
 * 换人 / 换阶段 / 换出牌批次才换新窗口。
 */
function windowIdentityOf(state) {
  switch (state.phase) {
    case PHASE_SWAP:
      return 'swap'
    case PHASE_VOID:
      return 'void'
    case PHASE_DISCARD:
      return 'discard:' + state.turn
    case PHASE_RESPOND:
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
      // HU 阶段（并行收集）：所有未表态的胡候选人共享同一窗口与截止时间；
      // GANG / PENG 阶段（串行仲裁）只有唯一 currentResponder 有决定权。
      if (state.respondStage === 'hu') return state.huWait.slice()
      return state.currentResponder != null ? [state.currentResponder] : []
    default:
      return []
  }
}

/** 定缺 / 换三张是并行窗口，固定走 config.voidTimeoutSeconds；摸打 / 响应按房间思考时长 */
function windowTimeoutMs(state, room) {
  if (state.phase === PHASE_SWAP || state.phase === PHASE_VOID) {
    return config.voidTimeoutSeconds * 1000
  }
  return (room.turnTimeoutSeconds || config.turnTimeoutSeconds) * 1000
}

/**
 * 客户端动作是否落在该座位当前的合法选项内（文档 §33）。
 * 只做「结构性」校验，真正裁决始终交给引擎 dispatch。
 */
export function matchesLegalOption(legal, action) {
  if (!action || !action.type) return false
  const opt = legal.find(o => o.type === action.type)
  if (!opt) return false
  switch (action.type) {
    case 'discard':
      return (opt.tiles || []).indexOf(action.tile) >= 0
    case 'peng':
      return action.tile == null || action.tile === opt.tile
    case 'gang':
      return (opt.options || []).some(
        o => o.tile === action.tile && o.gangType === action.gangType
      )
    case 'void':
      return (opt.suits || []).indexOf(action.suit) >= 0
    case 'swap':
      return Array.isArray(action.tiles) && action.tiles.length === 3
    case 'hu':
      return true
    case 'pass':
    case 'swap-yaoji':
      return true
    default:
      return false
  }
}

// ---------- AI ----------

/**
 * 确定性兜底动作（文档 §38）：AI 报错 / 卡死 / 超时 / 返回 null 时使用。
 * 唯一目标：绝对合法、绝不阻塞牌局。
 */
function aiFallback(view) {
  const legal = (view && view.legal) || []
  if (!legal.length) return null
  const pick = t => legal.find(o => o.type === t)

  // 出牌：legal.discard.tiles 已被引擎按缺门过滤；优先刚摸到的牌，其次升序第一张
  const discard = pick('discard')
  if (discard) {
    const tiles = discard.tiles || []
    if (!tiles.length) return null
    const drawn = view.my ? view.my.drawnTile : null
    const tile = drawn != null && tiles.indexOf(drawn) >= 0 ? drawn : tiles[0]
    return { type: 'discard', tile }
  }

  if (pick('pass')) return { type: 'pass' }

  // 换三张：选一个张数最少但 ≥3 的花色（幺鸡优先不换出）
  const swap = pick('swap')
  if (swap) {
    const hand = (view.my && view.my.hand) || []
    const yaojiAware = view.yaoji === true
    let best = null
    for (const suit of SUITS) {
      const inSuit = hand.filter(t => tileSuit(t) === suit)
      const real = yaojiAware ? inSuit.filter(t => t !== YAOJI_TILE) : inSuit
      if (real.length >= 3) {
        if (!best || real.length < best.tiles.length) {
          best = { tiles: real.slice(0, 3).sort((a, b) => a - b) }
        }
        continue
      }
      if (!best && inSuit.length >= 3) {
        best = { tiles: inSuit.slice(0, 3).sort((a, b) => a - b) }
      }
    }
    return best ? { type: 'swap', tiles: best.tiles } : null
  }

  // 定缺：选手牌最少的花色（幺鸡豁免，不计入条门）
  const voidOpt = pick('void')
  if (voidOpt) {
    const hand = (view.my && view.my.hand) || []
    const yaojiAware = view.yaoji === true
    const suits = voidOpt.suits || SUITS
    let best = null
    for (const suit of suits) {
      const n = hand.filter(
        t => tileSuit(t) === suit && !(yaojiAware && t === YAOJI_TILE)
      ).length
      if (!best || n < best.n) best = { suit, n }
    }
    return best ? { type: 'void', suit: best.suit } : null
  }

  const peng = pick('peng')
  if (peng) return { type: 'peng', tile: peng.tile }
  const gang = pick('gang')
  if (gang && gang.options && gang.options.length) {
    return { type: 'gang', tile: gang.options[0].tile, gangType: gang.options[0].gangType }
  }
  const hu = pick('hu')
  if (hu) return { type: 'hu', how: hu.how }
  const only = legal[0]
  return only ? { type: only.type } : null
}

/** 最后一个合法选项（AI 兜底都失败时的最后手段，保证绝不卡死牌局） */
function aiLastResort(legal) {
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
  if (o.type === 'swap') return aiFallback({ legal })
  return null
}

// ---------- 4 人视角旋转序列化 ----------

/** 绝对座位 → 视角座位（视角座位 0 = 自己） */
function toViewSeat(seat, viewerSeat) {
  if (seat == null) return seat
  return (((seat - viewerSeat) % 4) + 4) % 4
}

/** 结算结构里的所有座位字段都要一起旋转，漏一个就会挂错方位 */
function remapResults(results, viewerSeat) {
  if (!results) return null
  const m = seat => toViewSeat(seat, viewerSeat)
  return {
    ...results,
    huOrder: (results.huOrder || []).map(h => ({
      ...h,
      seat: m(h.seat),
      from: h.from == null ? h.from : m(h.from)
    })),
    ledger: (results.ledger || []).map(l => ({
      ...l,
      from: l.from == null ? l.from : m(l.from),
      to: l.to == null ? l.to : m(l.to)
    })),
    perSeat: (results.perSeat || []).map(p => ({ ...p, seat: m(p.seat) })),
    seats: (results.seats || []).map(s => ({ ...s, seat: m(s.seat) })),
    chaItems: (results.chaItems || []).map(c => ({ ...c, seat: m(c.seat) })),
    refundItems: (results.refundItems || []).map(c => ({ ...c, seat: m(c.seat) })),
    xiItems: (results.xiItems || []).map(c => ({ ...c, seat: m(c.seat) }))
  }
}

function buildMeta(meta, viewerSeat) {
  if (!meta) return null
  const m = seat => toViewSeat(seat, viewerSeat)
  const seats = [0, 1, 2, 3].map(i => {
    const abs = (i + viewerSeat) % 4
    const s = (meta.seats || [])[abs] || { seatIndex: abs, occupantType: 'EMPTY' }
    return {
      seatIndex: i,
      absSeat: abs,
      occupantType: s.occupantType,
      displayName: s.displayName || '',
      connected: !!s.connected,
      autoPlay: !!s.autoPlay,
      isAi: s.occupantType === 'AI',
      isEmpty: s.occupantType === 'EMPTY',
      ready: !!s.ready,
      isAdmin: meta.adminSeat === abs
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
    dice: Array.isArray(meta.dice) && meta.dice.length === 2 ? [meta.dice[0], meta.dice[1]] : null,
    headSeat: meta.headSeat == null ? null : m(meta.headSeat),
    mode: meta.mode || 'dealer',
    scores:
      Array.isArray(meta.scores) && meta.scores.length === 4
        ? [0, 1, 2, 3].map(i => meta.scores[(i + viewerSeat) % 4])
        : null,
    bankruptSeats: Array.isArray(meta.bankruptSeats) ? meta.bankruptSeats.map(m) : [],
    mySeat: viewerSeat,
    adminSeat: meta.adminSeat == null ? null : m(meta.adminSeat),
    isAdmin: viewerSeat === meta.adminSeat,
    seats
  }
}

/** 生成某一玩家可见的完整视图（隐私过滤 + 4 人视角旋转） */
function serializeView(state, viewerSeat, meta) {
  const raw = playerView(state, viewerSeat)
  const m = seat => toViewSeat(seat, viewerSeat)

  const players = [0, 1, 2, 3].map(i => {
    const p = raw.players[(i + viewerSeat) % 4]
    return { ...p, seat: i }
  })

  return {
    version: raw.version,
    ruleVersion: raw.ruleVersion,
    phase: raw.phase,
    turn: m(raw.turn),
    dealer: m(raw.dealer),
    wallCount: raw.wallCount,
    yaoji: raw.yaoji,
    pendingDiscard: raw.pendingDiscard
      ? { ...raw.pendingDiscard, seat: m(raw.pendingDiscard.seat) }
      : null,
    lastDiscard: raw.lastDiscard
      ? { ...raw.lastDiscard, seat: m(raw.lastDiscard.seat) }
      : null,
    pendingKong: raw.pendingKong ? { ...raw.pendingKong, seat: m(raw.pendingKong.seat) } : null,
    players,
    my: {
      ...raw.my,
      seat: 0,
      awaitingNearer: (raw.my.awaitingNearer || []).map(m)
    },
    legal: raw.legal,
    waiting: (raw.waiting || []).map(m),
    currentResponder: raw.currentResponder == null ? null : m(raw.currentResponder),
    respondStage: raw.respondStage == null ? null : raw.respondStage,
    lastEvents: (raw.lastEvents || []).map(ev => (ev.seat == null ? ev : { ...ev, seat: m(ev.seat) })),
    results: remapResults(raw.results, viewerSeat),
    meta: buildMeta(meta, viewerSeat)
  }
}

// ---------- 适配器 ----------

export const adapter = {
  gameId: 'mahjong',
  seatsPerRoom: 4,
  defaultRules: DEFAULT_RULES,
  sanitizeRules,

  /** 开局掷骰（与单机开局同源）：骰子派给前端做掷骰仪式与牌墙缺口 */
  openingFor(room, roundCtx, randomInt) {
    const dice = [randomInt(1, 7), randomInt(1, 7)]
    // 首局：点数之和定庄；后续局：沿用 nextRoundCtx 推得的庄家（先胡者坐庄），
    // 骰子只决定摸牌起点，与单机 onRestart 一致。
    const dealer =
      roundCtx && roundCtx.firstSeat != null ? roundCtx.firstSeat : (dice[0] + dice[1] - 2) % 4
    const headSeat = room.round > 1 ? (dice[0] + dice[1] - 2) % 4 : dealer
    const wallOffset = (headSeat * WALL_SEG + (dice[0] + dice[1])) % (WALL_SEG * 4)
    return {
      engineInit: { dealer, wallOffset },
      ceremony: { dice, headSeat, mode: 'dealer' },
      firstMoverSeat: dealer
    }
  },

  createState(engineInit, { seed, rules }) {
    return createGame({ seed, dealer: engineInit.dealer, wallOffset: engineInit.wallOffset, rules })
  },

  dispatch: (state, action) => engineDispatch(state, action),
  legalActions: (state, seat) => legalActions(state, seat),
  playerView: (state, seat) => playerView(state, seat),
  settlementOf: state => settlementOf(state),
  isFinished: state => state.phase === PHASE_FINISHED,

  windowIdentityOf,
  windowTypeOf,
  eligibleSeatsOf,
  windowTimeoutMs,
  matchesLegalOption,

  aiDecide: (view, level, rng) => aiDecide(view, level, rng),
  aiFallback,
  aiLastResort,
  aiLevelOf: () => null, // 麻将走全局 config.aiLevel（AiService.level）

  serializeView,

  /** 下局庄家进 roundCtx.firstSeat；首局 null = 掷骰定庄 */
  nextRoundCtx(room, results, roundCtx) {
    if (!results) return { firstSeat: null }
    const fallback = roundCtx && roundCtx.firstSeat != null ? roundCtx.firstSeat : 0
    return { firstSeat: nextDealerOf(results, fallback) }
  }
}
