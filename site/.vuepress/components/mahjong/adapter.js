// ============================================================
// 牌桌 UI 适配层（adapter.js）
// ------------------------------------------------------------
// UI 只通过本接口与牌局交互，接口定义见 contract.js 末尾说明：
//   createLocalGame({seed?, aiLevel?, restoreState?, onEvent?}) ->
//     { view, dispatch, suggest, finished, restart, dispose, exportState }
//
// 当前实现：真实引擎（engine.js）+ 策略 AI（ai.js）的本地封装。
// 未来联网版：用 WebSocket 实现相同接口替换下面的 re-export，
// UI（ui.js）与页面（mahjong_game.md）不需要任何改动。
// ============================================================

export { createLocalGame } from './local-game.js'
