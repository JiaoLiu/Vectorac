// ============================================================
// 行动窗口（mahjong-service/rooms/action-window.js)
// ------------------------------------------------------------
// 文档 §29 / §30 / §35：麻将不只有「轮到谁摸打」，还有打出一张牌后多家
// 同时拥有 胡/碰/杠/过，以及换三张 / 定缺的并行选择，所以抽象成 ActionWindow。
//
// 关键设计：window.identity 是「逻辑窗口」的稳定标识。
//   · 响应窗口里其他座位陆续表态（state.version 会变）时，identity 不变
//     ⇒ 保留同一个 windowId，未表态的座位依然能用原 windowId 操作；
//   · 只有进入新的逻辑窗口（换人、换阶段、换批次）才 ++windowId，
//     旧 windowId 的操作一律 ACTION_WINDOW_EXPIRED（文档 §36 / §41 / §64）。
// ============================================================

export const WINDOW_TYPE = {
  SELF_TURN: 'SELF_TURN', // 自己摸打
  DISCARD_RESPONSE: 'DISCARD_RESPONSE', // 他人出牌/补杠后的响应
  EXCHANGE_SELECTION: 'EXCHANGE_SELECTION', // 换三张
  DINGQUE_SELECTION: 'DINGQUE_SELECTION', // 定缺
  OTHER: 'OTHER'
}

export function createWindow({
  windowId,
  identity,
  type,
  eligibleSeats,
  legalActionsBySeat,
  timeoutMs,
  now
}) {
  return {
    windowId,
    identity,
    type,
    eligibleSeats: [...eligibleSeats],
    legalActionsBySeat,
    openedAt: now,
    deadlineAt: now + Math.max(1, timeoutMs),
    // responses 只作审计用（引擎自己的 claims 才是权威）
    responses: {}
  }
}

export function isEligible(window, seat) {
  return !!window && window.eligibleSeats.indexOf(seat) >= 0
}

export function legalFor(window, seat) {
  if (!window || !window.legalActionsBySeat) return []
  return window.legalActionsBySeat[seat] || []
}

// matchesLegalOption 是游戏专属逻辑（合法选项的结构由各游戏引擎定义），
// 已迁入对应适配器（麻将见 rooms/adapters/mahjong.js）。
