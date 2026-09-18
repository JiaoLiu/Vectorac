// ============================================================
// 联机服务配置（mahjong-service/config.js）
// ------------------------------------------------------------
// 所有 TTL / 超时 / 并发都走环境变量，禁止写死在业务代码里
// （文档 §18 / §49 / §50 / §53）。.env 由 install.sh 生成，不入库。
// ============================================================

import 'dotenv/config'

const MINUTE = 60 * 1000

/** 读取整数环境变量，非法值回退默认值 */
function intEnv(name, def, min = 0) {
  const raw = process.env[name]
  if (raw == null || raw === '') return def
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < min) return def
  return n
}

export const MINUTE_MS = MINUTE

export const config = {
  port: intEnv('PORT', 3032, 1),
  host: process.env.HOST || '127.0.0.1',
  // WebSocket 路径：nginx 按此路径反代（与 HTTP 同端口）
  wsPath: process.env.WS_PATH || '/mahjong-ws',

  // 房间规模：全服务器活跃房间上限（含 WAITING / PLAYING / FINISHED 保留期）
  maxRooms: intEnv('MAX_ROOMS', 20, 1),
  seatsPerRoom: 4,

  // 房号：6 位，字母表剔除容易混淆的 0 O 1 I L
  roomCodeLength: 6,
  roomCodeAlphabet: '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
  maxRoomCodeAttempts: 64,

  // 重连令牌强度（文档 §7：禁止只靠昵称 / 房号 / 座位重连）
  resumeTokenBytes: intEnv('RESUME_TOKEN_BYTES', 32, 16),

  // 回合超时（秒）：ActionWindow 的 deadline
  turnTimeoutSeconds: intEnv('TURN_TIMEOUT_SECONDS', 20, 1),
  // 真人断线后 AI 接管前的额外等待（毫秒）：不必等满整轮超时
  disconnectedAiDelayMs: intEnv('DISCONNECTED_AI_DELAY_MS', 1500, 0),

  // TTL（文档 §18 / §49 / §50）
  waitingRoomTtlMs: intEnv('WAITING_ROOM_TTL_MINUTES', 30, 1) * MINUTE,
  waitingDisconnectedTtlMs: intEnv('WAITING_DISCONNECTED_TTL_MINUTES', 10, 1) * MINUTE,
  finishedRoomTtlMs: intEnv('FINISHED_ROOM_TTL_MINUTES', 10, 1) * MINUTE,
  sweepIntervalMs: intEnv('SWEEP_INTERVAL_SECONDS', 30, 1) * 1000,

  // AI（文档 §38 / §53）
  aiMaxConcurrency: intEnv('AI_MAX_CONCURRENCY', 2, 1),
  aiDecisionTimeoutMs: intEnv('AI_DECISION_TIMEOUT_MS', 3000, 100),
  aiLevel: process.env.AI_LEVEL || 'normal',

  // 幂等表容量（文档 §34）：每房间保留的最近 requestId 数量
  processedRequestIdLimit: intEnv('PROCESSED_REQUEST_ID_LIMIT', 512, 32),

  // 统计接口令牌：为空则该接口直接拒绝（不暴露内部状态）
  adminToken: process.env.ADMIN_TOKEN || ''
}