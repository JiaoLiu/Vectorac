// ============================================================
// 游戏适配器注册表（mahjong-service/rooms/adapters/index.js）
// ------------------------------------------------------------
// 通用房间架构支持的所有游戏在这里注册。建房时按 gameType 查表，
// 未注册的类型直接 INVALID_RULES（白名单校验）。
// 新增游戏 = 加一个适配器文件 + 在这里登记一行，房间/会话/通信层零改动。
// ============================================================

import { ERR, fail } from '../../errors.js'
import { adapter as mahjong } from './mahjong.js'
import { adapter as gomoku } from './gomoku.js'
import { adapter as xiangqi } from './xiangqi.js'
import { adapter as junqi } from './junqi.js'

const ADAPTERS = {
  mahjong,
  gomoku,
  xiangqi,
  junqi
}

export const GAME_IDS = Object.keys(ADAPTERS)
export const DEFAULT_GAME = 'mahjong'

/**
 * 按 gameType 解析适配器。未传 → 默认麻将（兼容旧客户端）；
 * 传了但未注册 → INVALID_RULES。
 */
export function resolveAdapter(gameType) {
  const id = gameType == null || gameType === '' ? DEFAULT_GAME : String(gameType)
  const adapter = ADAPTERS[id]
  if (!adapter) fail(ERR.INVALID_RULES, '不支持的游戏类型：' + id)
  return adapter
}
