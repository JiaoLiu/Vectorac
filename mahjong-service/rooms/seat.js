// ============================================================
// 座位模型（mahjong-service/rooms/seat.js）
// ------------------------------------------------------------
// 固定 4 座。核心不变量（文档 §六十八）：
//   · connected 只对 HUMAN 有意义；
//   · HUMAN + connected=false ≠ AI 座 —— 玩家仍拥有该座位，只是断线由 AI 托管；
//   · Admin 必须是 HUMAN，AI 永远不能当管理员；
//   · 销毁只看 humanCount（occupantType==HUMAN 数量），绝不看 connectedHumanCount。
// ============================================================

export const OCCUPANT = { EMPTY: 'EMPTY', HUMAN: 'HUMAN', AI: 'AI' }

export const ROOM_STATUS = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
  DESTROYED: 'DESTROYED'
}

/** AI 座位固定人设：按座位号取，确定性且不与真人混淆 */
const AI_PERSONAS = ['旺财', '阿福', '小美', '来福']

export function createSeats(n = 4) {
  const seats = []
  for (let i = 0; i < n; i++) {
    seats.push({
      seatIndex: i,
      occupantType: OCCUPANT.EMPTY,
      humanPlayerId: null,
      displayName: null,
      connected: false, // 仅 HUMAN 有意义
      autoPlay: false, // 断线 / 超时托管标记（仅展示与决策来源用）
      ready: false, // 多局联机：是否已准备下一局（AI 座恒为 true）
      joinedAt: null,
      disconnectedAt: null,
      aiProfile: null
    })
  }
  return seats
}

export function emptySeats(seats) {
  return seats.filter(s => s.occupantType === OCCUPANT.EMPTY)
}

export function humanSeats(seats) {
  return seats.filter(s => s.occupantType === OCCUPANT.HUMAN)
}

/** 真人座位数（销毁判定唯一依据） */
export function humanCount(seats) {
  return humanSeats(seats).length
}

export function connectedHumanCount(seats) {
  return seats.filter(s => s.occupantType === OCCUPANT.HUMAN && s.connected).length
}

export function aiCount(seats) {
  return seats.filter(s => s.occupantType === OCCUPANT.AI).length
}

/** 该真人当前占用的座位（没有则 null） */
export function seatOfPlayer(seats, playerId) {
  return (
    seats.find(s => s.occupantType === OCCUPANT.HUMAN && s.humanPlayerId === playerId) || null
  )
}

/** 清空座位（不改 occupantType 的调用方请用其专用流程） */
export function clearSeat(seat) {
  seat.occupantType = OCCUPANT.EMPTY
  seat.humanPlayerId = null
  seat.displayName = null
  seat.connected = false
  seat.autoPlay = false
  seat.ready = false
  seat.joinedAt = null
  seat.disconnectedAt = null
  seat.aiProfile = null
  return seat
}

export function setHuman(seat, { playerId, displayName }) {
  seat.occupantType = OCCUPANT.HUMAN
  seat.humanPlayerId = playerId
  seat.displayName = displayName || '玩家'
  seat.connected = true
  seat.autoPlay = false
  seat.ready = false
  seat.joinedAt = Date.now()
  seat.disconnectedAt = null
  seat.aiProfile = null
  return seat
}

export function setAi(seat) {
  seat.occupantType = OCCUPANT.AI
  seat.humanPlayerId = null
  seat.displayName = AI_PERSONAS[seat.seatIndex] || 'AI'
  seat.connected = false
  seat.autoPlay = false
  seat.ready = true // AI 永远就绪，不阻塞「全员准备」开下一局
  seat.joinedAt = Date.now()
  seat.disconnectedAt = null
  seat.aiProfile = { level: null } // level 由 AIService 按房间配置补
  return seat
}

/**
 * 加入时选座（文档 §19 / §20）：
 *   1. 有 EMPTY 座 → 直接坐（按下标最小，确定性）；
 *   2. 等待阶段且没有 EMPTY 但有 AI 座 → 顶掉「最后添加的 AI」（并列时取大下标），
 *      绝不返回 ROOM_FULL；
 *   3. 开局后调用方必须先拦 ROOM_LOCKED，本函数不做状态判断。
 * 无位可坐返回 -1。
 */
export function pickJoinSeat(seats) {
  const empty = seats.find(s => s.occupantType === OCCUPANT.EMPTY)
  if (empty) return empty.seatIndex
  const ais = seats.filter(s => s.occupantType === OCCUPANT.AI)
  if (!ais.length) return -1
  ais.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || a.seatIndex - b.seatIndex)
  return ais[ais.length - 1].seatIndex
}

/**
 * 管理员循环转移（文档 §10）：从 oldAdminSeat + 1 起按 0→1→2→3→0 找下一个 HUMAN。
 * 找不到（已无真人）返回 -1，调用方据此解散房间。
 */
export function nextAdminSeat(seats, oldAdminSeat) {
  for (let step = 1; step <= 4; step++) {
    const idx = (((oldAdminSeat + step) % 4) + 4) % 4
    const seat = seats[idx]
    if (seat && seat.occupantType === OCCUPANT.HUMAN) return idx
  }
  return -1
}

/** 座位对外快照（不含任何手牌信息） */
export function seatSnapshot(seat) {
  return {
    seatIndex: seat.seatIndex,
    occupantType: seat.occupantType,
    displayName: seat.displayName,
    connected: seat.occupantType === OCCUPANT.HUMAN ? seat.connected : false,
    autoPlay: seat.occupantType === OCCUPANT.HUMAN ? seat.autoPlay : false,
    ready: seat.occupantType === OCCUPANT.HUMAN ? !!seat.ready : seat.occupantType === OCCUPANT.AI,
    isAi: seat.occupantType === OCCUPANT.AI
  }
}