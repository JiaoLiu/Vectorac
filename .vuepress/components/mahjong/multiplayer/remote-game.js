// ============================================================
// 联机牌局适配层（multiplayer/remote-game.js）
// ------------------------------------------------------------
// 与 local-game.js 实现**同一套契约**（contract.js 末尾）：
//   createOnlineGame({net, player, onEvent, onError, aiLevel}) ->
//     { view, dispatch, suggest, opening, session, finished,
//       restart, dispose, exportState }
//
// 关键差异（服务端权威，文档 §一）：
//   · view() 返回**服务端推送的最近一帧**玩家视角（已做隐私过滤 + 视角旋转：
//     自己永远是 0 号位），客户端不持有 GameState，也绝不本地推进牌局；
//   · dispatch() 只把意图发给服务端并立即返回 {ok:true}；真正的裁决结果由
//     服务端 ACTION_WINDOW_OPENED / GAME_STATE_CHANGED 推送回来，被拒时走
//     onError 提示（表单里的 error 文案由 net-client 的 ERROR_TEXT 统一）；
//   · restart() 是空操作：在线房间一局定胜负，是否续局由房主在服务端决定；
//   · 每次收到新视图时，把 lastEvents 里没派发过的新事件按 seq 递增补发给
//     UI（音效/动画），再补一个 sync 事件触发整桌重渲染。
// ============================================================

import { suggest as aiSuggest } from '../ai.js'

/** 牌墙每边牌位（与 ui.js WALL_SIDE_SLOTS 一致），用于换算 wallOffset */
const WALL_SEG = 14

export function createOnlineGame(opts = {}) {
  const net = opts.net
  if (!net) throw new Error('createOnlineGame 需要 net 客户端')

  const onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : () => {}
  const aiLevel = opts.aiLevel || 'normal'

  let view = null
  let disposed = false
  let lastSeq = 0

  function emit(ev) {
    try {
      onEvent(ev)
    } catch (e) {
      /* UI 回调异常不影响牌局同步 */
    }
  }

  /** 收到服务端「自己视角」的完整视图：缓存 + 增量派发事件 + 触发重渲染 */
  function applyView(next) {
    if (disposed || !next) return
    view = next
    const events = Array.isArray(next.lastEvents) ? next.lastEvents : []
    const maxSeq = events.length ? events[events.length - 1].seq || 0 : 0
    if (lastSeq === 0) {
      // 首次（含重连后的首帧）：把历史事件视为已读，不重放开局动画
      lastSeq = maxSeq
    } else {
      for (const ev of events) {
        if ((ev.seq || 0) > lastSeq) {
          lastSeq = ev.seq || 0
          emit(ev)
        }
      }
    }
    emit({ type: 'sync', data: {} })
  }

  function onMessage(msg) {
    if (!msg || disposed) return
    // 被拒动作（ACTION_REJECTED）由大厅的 onError 统一提示，这里不重复弹窗
    if (msg.type === 'GAME_STATE_CHANGED') applyView(msg.payload)
  }

  // 订阅而不覆盖：大厅仍能收到房间事件（房间销毁、连接状态等）
  const unsubscribe = net.subscribe(onMessage)
  // 进入牌桌时大厅已把最近一帧交过来，先落地（避免首帧到达前的空白牌桌）
  if (opts.view) applyView(opts.view)

  // ---------- 契约实现 ----------

  function apiView() {
    return view
  }

  function apiDispatch(payload = {}) {
    if (disposed) return { ok: false, error: 'disposed' }
    if (!view || !view.meta || !view.meta.gameId) return { ok: false, error: 'stale' }
    const action = {}
    for (const k of Object.keys(payload)) {
      if (k === 'seat' || k === 'actionId' || k === 'stateVersion') continue
      action[k] = payload[k]
    }
    if (!action.type) return { ok: false, error: 'illegal' }
    const requestId = net.sendAction({
      gameId: view.meta.gameId,
      windowId: view.meta.windowId,
      action
    })
    if (!requestId) return { ok: false, error: 'stale' }
    return { ok: true }
  }

  /** 出牌建议只作参考：用本地 AI 算，不占用服务端算力，也不代打 */
  function apiSuggest() {
    if (!view) return null
    try {
      return aiSuggest(view, aiLevel)
    } catch (e) {
      return null
    }
  }

  /** 开局掷骰信息（纯展示）：座位与骰子都来自服务端，与单机同源 */
  function openingInfo() {
    const meta = (view && view.meta) || {}
    const dice = Array.isArray(meta.dice) ? meta.dice : null
    const headSeat = meta.headSeat != null ? meta.headSeat : 0
    return {
      dice,
      dealer: view ? view.dealer : null,
      round: meta.round != null ? meta.round : 1,
      startSeat: headSeat,
      headSeat,
      mode: meta.mode || 'dealer'
    }
  }

  function sessionInfo() {
    const info = openingInfo()
    const dice = info.dice || [0, 0]
    const sum = (Number(dice[0]) || 0) + (Number(dice[1]) || 0)
    return {
      ...info,
      wallOffset: info.headSeat == null ? 0 : (info.headSeat * WALL_SEG + sum) % (WALL_SEG * 4)
    }
  }

  function apiFinished() {
    return !!view && view.phase === 'finished'
  }

  function apiDispose() {
    disposed = true
    unsubscribe()
  }

  return {
    online: true,
    canRestart: false,
    view: apiView,
    dispatch: apiDispatch,
    suggest: apiSuggest,
    opening: openingInfo,
    session: sessionInfo,
    finished: apiFinished,
    restart: () => {},
    dispose: apiDispose,
    exportState: () => null
  }
}