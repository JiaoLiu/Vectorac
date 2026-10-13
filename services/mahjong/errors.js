// ============================================================
// 统一错误码（mahjong-service/errors.js）
// ------------------------------------------------------------
// 文档 §65：前端只依赖 errorCode 判断，不解析错误文字。
// HTTP 接口回 { errorCode, message }，WS 回 ERROR 消息。
// ============================================================

export const ERR = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_CAPACITY_REACHED: 'ROOM_CAPACITY_REACHED',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_LOCKED: 'ROOM_LOCKED',
  GAME_ALREADY_STARTED: 'GAME_ALREADY_STARTED',
  GAME_ALREADY_FINISHED: 'GAME_ALREADY_FINISHED',
  NOT_ROOM_ADMIN: 'NOT_ROOM_ADMIN',
  INVALID_RESUME_TOKEN: 'INVALID_RESUME_TOKEN',
  INVALID_ACTION: 'INVALID_ACTION',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  ACTION_WINDOW_EXPIRED: 'ACTION_WINDOW_EXPIRED',
  ACTION_ALREADY_PROCESSED: 'ACTION_ALREADY_PROCESSED',
  PLAYER_ALREADY_LEFT: 'PLAYER_ALREADY_LEFT',
  ROOM_DESTROYED: 'ROOM_DESTROYED',
  SERVER_ERROR: 'SERVER_ERROR',
  // 房间码 / 加入流程（HTTP 层）
  INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
  INVALID_RULES: 'INVALID_RULES',
  FORBIDDEN: 'FORBIDDEN'
}

/** 默认 HTTP 状态码（WS 只取 errorCode） */
const HTTP_STATUS = {
  [ERR.ROOM_NOT_FOUND]: 404,
  [ERR.ROOM_CAPACITY_REACHED]: 503,
  [ERR.ROOM_FULL]: 409,
  [ERR.ROOM_LOCKED]: 409,
  [ERR.GAME_ALREADY_STARTED]: 409,
  [ERR.GAME_ALREADY_FINISHED]: 409,
  [ERR.NOT_ROOM_ADMIN]: 403,
  [ERR.INVALID_RESUME_TOKEN]: 401,
  [ERR.INVALID_ACTION]: 400,
  [ERR.NOT_YOUR_TURN]: 409,
  [ERR.ACTION_WINDOW_EXPIRED]: 409,
  [ERR.ACTION_ALREADY_PROCESSED]: 409,
  [ERR.PLAYER_ALREADY_LEFT]: 409,
  [ERR.ROOM_DESTROYED]: 410,
  [ERR.SERVER_ERROR]: 500,
  [ERR.INVALID_ROOM_CODE]: 400,
  [ERR.INVALID_RULES]: 400,
  [ERR.FORBIDDEN]: 403
}

export class AppError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'AppError'
    this.code = code
    this.status = HTTP_STATUS[code] || 400
  }
}

/** 抛出业务错误（调用方统一 catch 转成 errorCode 响应） */
export function fail(code, message) {
  throw new AppError(code, message)
}

/** 把任意异常收敛成 {errorCode, message} */
export function toErrorPayload(err) {
  if (err instanceof AppError) return { errorCode: err.code, message: err.message }
  return { errorCode: ERR.SERVER_ERROR, message: '服务器内部错误' }
}