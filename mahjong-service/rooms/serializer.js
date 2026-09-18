// ============================================================
// 玩家视图序列化（mahjong-service/rooms/serializer.js）
// ------------------------------------------------------------
// 两个职责（文档 §44 / §56 / §58 / §59）：
//
// 1. 隐私过滤：直接用引擎的 playerView(state, seat) —— 它本来就只给「该座位
//    可见」的信息（自己的手牌、他人的牌数/副露/弃牌、他人摸牌事件不带牌面）。
//    绝不把完整 GameState 发到浏览器再用 CSS 隐藏。
//
// 2. 视角旋转：座位 UI 是固定方位（0 下 / 1 右 / 2 上 / 3 左），所以把
//    绝对座位重映射成「自己永远是 0 号位」，UI 无需知道我是几号座。
//    旋转必须覆盖所有带 seat 的字段：players / turn / dealer /
//    pendingDiscard / pendingKong / waiting / awaitingNearer / lastEvents /
//    results 全家（huOrder / ledger / perSeat / seats / chaItems /
//    refundItems / xiItems）。
//
// meta 里额外带上房间与座位信息（昵称、AI、断线、管理员），供等待室与
// 牌桌上的「断线 · AI托管」标记使用。
// ============================================================

import { playerView } from '../engine/engine.js'

/** 绝对座位 → 视角座位（视角座位 0 = 自己） */
export function toViewSeat(seat, viewerSeat) {
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

/**
 * 生成某一玩家可见的完整视图。
 * @param {object} state      引擎权威 GameState
 * @param {number} viewerSeat 观看者绝对座位（0..3）
 * @param {object} meta       房间级信息（绝对座位口径），见文件头
 */
export function buildPlayerViewForSeat(state, viewerSeat, meta) {
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
    pendingKong: raw.pendingKong ? { ...raw.pendingKong, seat: m(raw.pendingKong.seat) } : null,
    players,
    my: {
      ...raw.my,
      seat: 0,
      awaitingNearer: (raw.my.awaitingNearer || []).map(m)
    },
    legal: raw.legal,
    waiting: (raw.waiting || []).map(m),
    lastEvents: (raw.lastEvents || []).map(ev => (ev.seat == null ? ev : { ...ev, seat: m(ev.seat) })),
    results: remapResults(raw.results, viewerSeat),
    meta: buildMeta(meta, viewerSeat)
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
    // 开局骰子 / 局号 / 墙头方位：牌桌据此做掷骰仪式与牌墙缺口（纯展示）。
    // headSeat 是「摸牌起点方位」，UI 的方位与视角座位同口径，必须一起旋转，
    // 否则非 0 号位玩家看到的牌墙缺口会开在错误的边上。
    round: meta.round == null ? 1 : meta.round,
    dice: Array.isArray(meta.dice) && meta.dice.length === 2 ? [meta.dice[0], meta.dice[1]] : null,
    headSeat: meta.headSeat == null ? null : m(meta.headSeat),
    mode: meta.mode || 'dealer',
    // 视角座位（UI 只需要 seats 这一份），保留原始座位仅供排查
    mySeat: viewerSeat,
    adminSeat: meta.adminSeat == null ? null : m(meta.adminSeat),
    isAdmin: viewerSeat === meta.adminSeat,
    seats
  }
}

/** 房间列表 / 等待室用的房间摘要（绝对座位口径，不含任何手牌） */
export function roomSummary(room) {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    status: room.status,
    adminSeat: room.adminSeat,
    rules: room.rules,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
    lastActivityAt: room.lastActivityAt,
    seats: room.seats.map(s => ({
      seatIndex: s.seatIndex,
      occupantType: s.occupantType,
      displayName: s.displayName,
      connected: s.occupantType === 'HUMAN' ? !!s.connected : false,
      autoPlay: s.occupantType === 'HUMAN' ? !!s.autoPlay : false,
      isAdmin: room.adminSeat === s.seatIndex,
      isAi: s.occupantType === 'AI'
    })),
    humanCount: room.seats.filter(s => s.occupantType === 'HUMAN').length,
    aiCount: room.seats.filter(s => s.occupantType === 'AI').length,
    emptyCount: room.seats.filter(s => s.occupantType === 'EMPTY').length,
    joinable: room.status === 'WAITING'
  }
}