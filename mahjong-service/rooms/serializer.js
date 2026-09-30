// ============================================================
// 房间摘要序列化（mahjong-service/rooms/serializer.js）
// ------------------------------------------------------------
// 本模块游戏无关，只负责「不含任何对局隐私信息」的房间摘要
// （大厅列表 / 等待室快照）。
//
// 各游戏的「对局内玩家视图」序列化（隐私过滤 + 视角旋转）在对应
// 游戏适配器里（adapter.serializeView）：麻将的 4 人视角旋转见
// rooms/adapters/mahjong.js。
// ============================================================

/** 房间列表 / 等待室用的房间摘要（绝对座位口径，不含任何对局隐私） */
export function roomSummary(room) {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    gameType: room.gameType,
    seatsPerRoom: room.seats.length,
    status: room.status,
    adminSeat: room.adminSeat,
    rules: room.rules,
    // 本房间的思考时长（秒）：建房时房主设置，等待室展示给所有人
    turnTimeoutSeconds: room.turnTimeoutSeconds,
    // 多局联机：局号 / 是否已打过至少一局（等待室据此区分「首局等房主开始」与
    // 「局间等全员准备」）/ 每个座位累计积分 / 破产座位
    round: room.round || 1,
    hasPlayed: room.lastResults != null,
    scores: (room.scores || []).slice(),
    bankruptSeats: (room.bankruptSeats || []).slice(),
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
      ready: s.occupantType === 'HUMAN' ? !!s.ready : s.occupantType === 'AI',
      isAdmin: room.adminSeat === s.seatIndex,
      isAi: s.occupantType === 'AI'
    })),
    humanCount: room.seats.filter(s => s.occupantType === 'HUMAN').length,
    aiCount: room.seats.filter(s => s.occupantType === 'AI').length,
    emptyCount: room.seats.filter(s => s.occupantType === 'EMPTY').length,
    joinable: room.status === 'WAITING'
  }
}
