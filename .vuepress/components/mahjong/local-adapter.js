// ============================================================
// 四川麻将本地适配层：真实规则引擎 + 三家 AI
// ------------------------------------------------------------
// UI 只看到 contract.js 定义的 PlayerView；所有动作仍由 engine.dispatch
// 裁决。本文件只负责：
//   - 为人类座位 0 补 actionId/stateVersion
//   - 按节奏驱动座位 1/2/3 的 AI
//   - 转发引擎事件、提供存档/恢复和生命周期
// ============================================================

import { createGame, dispatch as engineDispatch, playerView } from './engine.js'
import { aiDecide, suggest as aiSuggest } from './ai.js'

const AI_SEATS = [1, 2, 3]
const AI_DELAYS = { easy: 900, normal: 600, hard: 420 }

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function seedForRestart(seed) {
  return (seed != null ? Number(seed) : Date.now()) >>> 0
}

/**
 * @param {Object} opts
 * @returns {{view: Function, dispatch: Function, suggest: Function,
 *   finished: Function, restart: Function, dispose: Function, exportState: Function}}
 */
export function createLocalGame(opts = {}) {
  const onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : null
  let aiLevel = ['easy', 'normal', 'hard'].includes(opts.aiLevel) ? opts.aiLevel : 'normal'
  let state = opts.restoreState && opts.restoreState.players
    ? clone(opts.restoreState)
    : createGame({ seed: seedForRestart(opts.seed), rules: opts.rules })
  let disposed = false
  let actionSeq = Array.isArray(state.actionLog) ? state.actionLog.length : 0
  let timers = new Set()
  const scheduled = new Set()

  function emit(events) {
    if (!onEvent) return
    for (const event of events || []) {
      try { onEvent(event) } catch (e) { /* UI 回调不能阻塞牌局 */ }
    }
  }

  function clearTimers() {
    for (const timer of timers) clearTimeout(timer)
    timers = new Set()
    scheduled.clear()
  }

  // 从当前确定性状态派生 AI 随机源；恢复存档后不会因丢失 RNG 游标而改变策略。
  function aiRng(seat) {
    let a = (state.seed ^ Math.imul(state.version + 1, 0x9e3779b9) ^ Math.imul(seat + 1, 0x45d9f3b)) >>> 0
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function schedule(seat, delay) {
    if (disposed) return
    const key = state.version + ':' + seat
    if (scheduled.has(key)) return
    scheduled.add(key)
    const timer = setTimeout(() => {
      timers.delete(timer)
      scheduled.delete(key)
      if (!disposed) runAi(seat)
    }, delay)
    timers.add(timer)
  }

  function runAi(seat) {
    const view = playerView(state, seat)
    if (!view.legal || !view.legal.length) {
      scheduleAi()
      return
    }
    const payload = aiDecide(view, aiLevel, aiRng(seat))
    if (!payload) {
      scheduleAi()
      return
    }
    dispatchForSeat(seat, payload)
  }

  function dispatchForSeat(seat, payload) {
    const action = {
      ...payload,
      seat,
      actionId: 'local-' + (++actionSeq),
      stateVersion: state.version
    }
    const result = engineDispatch(state, action)
    if (!result.ok) return result
    state = result.state
    emit(result.events)
    scheduleAi()
    return { ok: true, state: clone(state), events: result.events }
  }

  function scheduleAi() {
    if (disposed || state.phase === 'finished') return
    const delay = AI_DELAYS[aiLevel] || AI_DELAYS.normal
    if (state.phase === 'swap' || state.phase === 'void') {
      AI_SEATS.forEach((seat, index) => {
        if (playerView(state, seat).legal.length) schedule(seat, delay + index * 180)
      })
      return
    }
    if (state.phase === 'discard') {
      if (AI_SEATS.includes(state.turn)) schedule(state.turn, delay)
      return
    }
    if (state.phase === 'respond') {
      // 三阶段响应：HU 阶段是并行收集，所有胡候选人（huWait）同时拥有决定权；
      // GANG/PENG 阶段是按有效摸牌顺序串行仲裁的唯一 currentResponder。
      // AI 托管所有此刻有待办事项的 AI 座位（runAi 会重新校验 legal）。
      const seats =
        state.respondStage === 'hu'
          ? state.huWait.slice()
          : state.currentResponder != null
            ? [state.currentResponder]
            : []
      for (const seat of seats) {
        if (AI_SEATS.includes(seat)) schedule(seat, delay)
      }
      return
    }
  }

  function view() {
    return playerView(state, 0)
  }

  function dispatch(payload = {}) {
    if (disposed) return { ok: false, error: 'disposed' }
    return dispatchForSeat(0, payload)
  }

  function suggest() {
    return aiSuggest(view(), aiLevel)
  }

  function finished() {
    return state.phase === 'finished'
  }

  function restart(restartOpts = {}) {
    clearTimers()
    disposed = false
    if (restartOpts.aiLevel && ['easy', 'normal', 'hard'].includes(restartOpts.aiLevel)) {
      aiLevel = restartOpts.aiLevel
    }
    state = createGame({ seed: seedForRestart(restartOpts.seed), rules: restartOpts.rules || opts.rules })
    actionSeq = 0
    scheduleAi()
  }

  function dispose() {
    disposed = true
    clearTimers()
  }

  function exportState() {
    return clone(state)
  }

  scheduleAi()
  return { view, dispatch, suggest, finished, restart, dispose, exportState }
}
