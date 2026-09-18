// ============================================================
// 本地对局适配层（local-game.js）
// ------------------------------------------------------------
// 契约（contract.js 末尾）：UI 只通过本接口与牌局交互。
// 本实现 = 规则引擎（engine.js）+ 策略 AI（ai.js）的封装：
//
//   createLocalGame({seed?, aiLevel?, rules?, restoreState?, session?, onEvent?}) ->
//     { view, dispatch, suggest, opening, session, finished,
//       restart, dispose, exportState }
//
// - 人类固定座位 0；AI 座位 1/2/3 由 aiDecide 驱动，节奏用
//   setTimeout 控制（dispose 可清理），引擎本身不做任何等待。
// - 动作统一由本层补齐 actionId（会话内递增计数）与
//   stateVersion（取当前 state.version），引擎负责去重与拒过期。
// - 会话信息（局号、庄家、本局骰子、摸牌起点方位 headSeat）只在本层
//   维护，不写入 GameState；骰子两段语义：首局定庄（墙头在庄家方位），
//   后续局定摸牌起点方位；下局庄家由 UI 按上局结果经 restart({dealer})
//   传入（先胡者坐庄，一炮多响时点炮者坐庄），缺省沿用本局庄家。
// - rules 可覆盖引擎默认规则（如 capFan 封顶番数），恢复存档时以存档内
//   rules 为准。
// - 存档/恢复：exportState() 返回完整 GameState（纯 JSON，
//   含牌墙与 actionLog），restoreState 直接作为初始状态续打。
// - 未来联网版：用 WebSocket 实现相同接口替换本文件即可，
//   UI 与页面无需改动。
// ============================================================

import { createGame, dispatch, playerView, mulberry32 } from './engine.js'
import { aiDecide, suggest } from './ai.js'

const HUMAN = 0
const AI_SEATS = [1, 2, 3]
// 牌墙每边牌位（双层 2×7）：108 张牌墙四边均分，发牌后剩余约 56 张
const WALL_SEG = 14

/**
 * 本局骰子（仅用于表现与摸排起点，不参与牌权判定）。
 * 由 seed 与局号派生，确定性可复现；只暴露点数与派生结果，
 * 不泄露牌墙顺序。
 */
function rollDice(seed, round) {
  const rng = mulberry32((seed ^ Math.imul(round, 0x9e3779b9)) >>> 0)
  const d1 = Math.floor(rng() * 6) + 1
  const d2 = Math.floor(rng() * 6) + 1
  return [d1, d2]
}

export function createLocalGame(opts = {}) {
  let disposed = false
  let timers = []
  let counter = 0
  let aiLevel = opts.aiLevel || 'normal'
  let seed = opts.seed != null ? Number(opts.seed) >>> 0 : (Date.now() & 0x7fffffff)
  // 测试加速：speed=0 时 AI 延迟压到 1ms（浏览器默认走真实节奏）
  const speed = opts.speed != null ? Number(opts.speed) : 1
  const delayOf = ms => (speed <= 0 ? 1 : Math.max(1, Math.round(ms * speed)))

  // 每个座位独立的确定性随机源（seed 派生），AI 决策可复现
  const aiRngs = {}
  for (const seat of AI_SEATS) {
    aiRngs[seat] = mulberry32((seed * 131 + seat * 7) >>> 0)
  }

  const emit = ev => {
    try {
      if (typeof opts.onEvent === 'function') opts.onEvent(ev)
    } catch (e) {
      /* UI 回调异常不影响牌局 */
    }
  }

  // ---------- 会话（跨局） ----------
  // 首局：骰子点数定庄；后续局：庄家由 UI 按上局结果（先胡者坐庄，
  // 一炮多响时点炮者坐庄）经 restart({dealer}) 传入，骰子只定摸排起点。
  let round =
    opts.session && opts.session.round != null
      ? Math.max(1, Number(opts.session.round) | 0)
      : 1
  let dealer = null
  let dice = [1, 1]
  let startSeat = 0
  let wallOffset = 0
  let headSeat = 0
  // 规则覆盖（如 capFan 封顶番数，由入口滑杆选择）：建局与 restart 都带上
  let rulesOverride = opts.rules && typeof opts.rules === 'object' ? { ...opts.rules } : {}

  const rollForRound = () => {
    dice = rollDice(seed, round)
    startSeat = (dice[0] + dice[1] - 2) % 4
    // 开牌点：骰子点数之和（2~12）= 在起点方位墙内第 diceSum 个牌位开牌，
    // 摸牌从开牌点起沿环序逐张消耗（开牌点前的牌位成为牌尾，最后才摸到）。
    // 牌墙旋转只改变摸牌顺序，与 headSeat/骰子同源，保证表现与引擎一致。
    const diceSum = dice[0] + dice[1]
    if (dealer == null) {
      dealer = startSeat // 首局：点数定庄
      headSeat = dealer // 首局墙头在庄家方位（庄家起手第 14 张即从开牌点摸入）
    } else {
      headSeat = startSeat // 后续局：点数定摸牌起点方位（墙头），庄家不变
    }
    wallOffset = (headSeat * WALL_SEG + diceSum) % (WALL_SEG * 4)
  }

  // ---------- 状态初始化 ----------
  let state = null
  if (opts.restoreState && Array.isArray(opts.restoreState.players) && opts.restoreState.phase) {
    state = opts.restoreState
    if (opts.restoreState.seed != null) seed = opts.restoreState.seed
    dealer = state.dealer // 恢复存档：庄家沿用，跨局保持一致
    dice = rollDice(seed, round)
    startSeat = (dice[0] + dice[1] - 2) % 4
    headSeat = round === 1 ? dealer : startSeat
    wallOffset = 0 // 存档里的牌墙已是旋转后的，不再重复旋转
  } else {
    rollForRound()
    state = createGame({ seed, dealer, wallOffset, rules: rulesOverride })
    // 新建对局：把开局事件（game-start/deal）也派发给 UI（恢复存档不重放历史）
    state.events.slice(0, 2).forEach(emit)
  }

  const newActionId = () => 'aid-' + Date.now().toString(36) + '-' + (++counter)

  // ---------- AI 节奏 ----------
  const clearTimers = () => {
    timers.forEach(t => clearTimeout(t))
    timers = []
  }

  /** 安排一个 AI 行动（延迟后决策；期间状态可能已被人类动作推进） */
  const scheduleAi = (seat, delay) => {
    const t = setTimeout(() => {
      if (disposed || state.phase === 'finished') return
      // 决策前重新校验该座位仍需行动（过期回调不执行）
      const view = playerView(state, seat)
      if (!view.legal || !view.legal.length) return
      let action = null
      try {
        action = aiDecide(view, aiLevel, aiRngs[seat])
      } catch (e) {
        action = null
      }
      if (!action) return
      // 兜底：AI 给不出动作但确实轮到它时选第一个合法项，不卡死牌局
      apply({ ...action, seat })
    }, delay)
    timers.push(t)
  }

  /** 状态推进后调度所有该行动的 AI */
  const pump = () => {
    if (disposed || state.phase === 'finished') return
    clearTimers()
    if (state.phase === 'discard' && state.turn !== HUMAN) {
      scheduleAi(state.turn, delayOf(650 + state.turn * 120))
      return
    }
    if (state.phase === 'respond') {
      // state.waiting 已按「自出牌者下家起逆时针」排好序，即离出牌者最近的一家排最前。
      // 延迟必须跟着这个顺序走（更近的先行动）：否则远处的 AI 先表态触发 pump，
      // 会把近处 AI 的定时器 clearTimers 掉再往后排，近处叫牌被一路推迟，
      // 人类就得对着「等待…」干等更久。
      state.waiting.forEach((seat, i) => {
        if (seat !== HUMAN) scheduleAi(seat, delayOf(500 + i * 150))
      })
      return
    }
    if (state.phase === 'swap') {
      for (const seat of AI_SEATS) {
        if (state.players[seat].swapPicked == null) scheduleAi(seat, delayOf(420))
      }
      return
    }
    if (state.phase === 'void') {
      for (const seat of AI_SEATS) {
        if (state.players[seat].void == null) scheduleAi(seat, delayOf(380))
      }
    }
  }

  /** 统一动作入口：补 actionId/stateVersion → 引擎裁决 → 派发事件 → 调度 AI */
  const apply = action => {
    const res = dispatch(state, { ...action, actionId: newActionId(), stateVersion: state.version })
    if (res.ok) {
      state = res.state
      res.events.forEach(emit)
      pump()
    }
    return res
  }

  // ---------- 对外接口 ----------

  /** 人类（座位 0）视角 */
  const view = () => playerView(state, HUMAN)

  /** 人类动作（引擎负责全部合法性校验） */
  const apiDispatch = payload => {
    if (disposed) return { ok: false, error: 'disposed' }
    if (!payload || payload.seat !== HUMAN) return { ok: false, error: 'not-active' }
    return apply({ ...payload, seat: HUMAN })
  }

  /** 策略建议（只建议不代打，同样只用受限信息） */
  const apiSuggest = () => {
    try {
      return suggest(playerView(state, HUMAN), aiLevel)
    } catch (e) {
      return null
    }
  }

  const finished = () => state.phase === 'finished'

  /** 会话信息：局号、固定庄家与本局骰子（不写入 GameState） */
  const sessionInfo = () => ({
    round,
    dealer,
    dice,
    startSeat,
    headSeat,
    wallOffset,
    mode: round === 1 ? 'dealer' : 'draw'
  })

  /** 开局掷骰表现信息：首局定庄 / 后续局定摸牌起点，纯展示字段 */
  const opening = () => ({
    dice,
    dealer,
    round,
    startSeat,
    headSeat,
    mode: round === 1 ? 'dealer' : 'draw'
  })

  /** 导出完整牌局状态（存档用，纯 JSON） */
  const exportState = () => state

  /**
   * 再来一局（局号 +1，新 seed 重掷骰子定摸排起点）。
   * restartOpts:
   *   - round   : 显式局号（缺省 +1）
   *   - dealer  : 下局庄家（UI 按上局结果算好传入；缺省沿用本局庄家）
   *   - rules   : 规则覆盖（与建局覆盖合并，如改封顶番数）
   *   - aiLevel : 切换 AI 难度
   */
  const restart = restartOpts => {
    if (restartOpts && restartOpts.aiLevel) aiLevel = restartOpts.aiLevel
    if (restartOpts && restartOpts.rules && typeof restartOpts.rules === 'object') {
      rulesOverride = { ...rulesOverride, ...restartOpts.rules }
    }
    clearTimers()
    round =
      restartOpts && restartOpts.round != null
        ? Math.max(1, Number(restartOpts.round) | 0)
        : round + 1
    if (restartOpts && restartOpts.dealer != null) {
      dealer = ((Number(restartOpts.dealer) % 4) + 4) % 4
    }
    seed = Date.now() & 0x7fffffff
    for (const seat of AI_SEATS) {
      aiRngs[seat] = mulberry32((seed * 131 + seat * 7) >>> 0)
    }
    rollForRound()
    state = createGame({ seed, dealer, wallOffset, rules: rulesOverride })
    emit({ type: 'game-start', data: { seed, dealer, wallOffset, round } })
    pump()
  }

  const dispose = () => {
    disposed = true
    clearTimers()
  }

  // 启动（恢复存档时也会续上 AI 节奏）
  pump()

  return {
    view,
    dispatch: apiDispatch,
    suggest: apiSuggest,
    opening,
    session: sessionInfo,
    finished,
    restart,
    dispose,
    exportState
  }
}
