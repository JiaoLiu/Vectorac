// ============================================================
// AI 服务与并发限制（mahjong-service/rooms/ai-jobs.js）
// ------------------------------------------------------------
// 文档 §37 / §38 / §39 / §53：真人超时、真人断线、真 AI 座位都走同一套
// AIService.decide()，绝不另写「随机出牌」系统。AI 只产出标准 Action，
// 不直接改 GameState：AI Decision → 标准 Action → Room Queue → 引擎裁决。
//
// 并发限制：aiDecide 是同步 CPU（hard 档含向听/听张枚举），2 核机器上
// 20 房 × 4 座同时决策会顶满 CPU，所以全局限流 + 排队。
//
// 诚实说明（重要）：ai.js 的契约是「单次决策 < 50ms」。同步 CPU 代码无法被
// 真正抢占，所以 AI_DECISION_TIMEOUT_MS 是**软超时**——超时会记警告日志并
// 走兜底动作，但不会把已开始的决策打断（硬抢占需要 worker_threads，第一版
// 不做）。限流器是把 CPU 峰值压在安全区的主要手段。
// ============================================================

import { mulberry32 } from '../engine/engine.js'
import { aiDecide } from '../engine/ai.js'
import { YAOJI_TILE, tileSuit, SUITS } from '../engine/contract.js'

/**
 * 确定性兜底动作（文档 §38）：AI 报错 / 卡死 / 超时 / 返回 null 时使用。
 * 唯一目标：绝对合法、绝不阻塞牌局。
 */
export function fallbackAction(view) {
  const legal = (view && view.legal) || []
  if (!legal.length) return null
  const pick = t => legal.find(o => o.type === t)

  // 出牌：优先「规则要求先打缺门」——legal.discard.tiles 已被引擎按缺门过滤，
  // 所以直接在其中选；优先刚摸到的牌，其次按升序第一张（确定性）。
  const discard = pick('discard')
  if (discard) {
    const tiles = discard.tiles || []
    if (!tiles.length) return null
    const drawn = view.my ? view.my.drawnTile : null
    const tile = drawn != null && tiles.indexOf(drawn) >= 0 ? drawn : tiles[0]
    return { type: 'discard', tile }
  }

  // 响应窗口：没有强制动作就过（过永远在 legal 里）
  if (pick('pass')) return { type: 'pass' }

  // 换三张：选一个张数最少但 ≥3 的花色（幺鸡优先不换出）
  const swap = pick('swap')
  if (swap) {
    const hand = (view.my && view.my.hand) || []
    const yaojiAware = view.yaoji === true
    let best = null
    for (const suit of SUITS) {
      const inSuit = hand.filter(t => tileSuit(t) === suit)
      const real = yaojiAware ? inSuit.filter(t => t !== YAOJI_TILE) : inSuit
      if (real.length >= 3) {
        if (!best || real.length < best.tiles.length) {
          best = { tiles: real.slice(0, 3).sort((a, b) => a - b) }
        }
        continue
      }
      // 去掉幺鸡后不够 3 张：实在没有别的选择时才把幺鸡搭进去
      if (!best && inSuit.length >= 3) {
        best = { tiles: inSuit.slice(0, 3).sort((a, b) => a - b) }
      }
    }
    return best ? { type: 'swap', tiles: best.tiles } : null
  }

  // 定缺：选手牌最少的花色（幺鸡豁免，不计入条门）
  const voidOpt = pick('void')
  if (voidOpt) {
    const hand = (view.my && view.my.hand) || []
    const yaojiAware = view.yaoji === true
    const suits = voidOpt.suits || SUITS
    let best = null
    for (const suit of suits) {
      const n = hand.filter(
        t => tileSuit(t) === suit && !(yaojiAware && t === YAOJI_TILE)
      ).length
      if (!best || n < best.n) best = { suit, n }
    }
    return best ? { type: 'void', suit: best.suit } : null
  }

  // 剩下的单选项（碰 / 杠 / 胡）按固定顺序取，保证不卡死
  const peng = pick('peng')
  if (peng) return { type: 'peng', tile: peng.tile }
  const gang = pick('gang')
  if (gang && gang.options && gang.options.length) {
    return { type: 'gang', tile: gang.options[0].tile, gangType: gang.options[0].gangType }
  }
  const hu = pick('hu')
  if (hu) return { type: 'hu', how: hu.how }
  const only = legal[0]
  return only ? { type: only.type } : null
}

/** 全局 AI 并发限流器 + 决策入口 */
export class AiService {
  constructor({ maxConcurrency = 2, level = 'normal', decisionTimeoutMs = 3000, logger } = {}) {
    this.maxConcurrency = maxConcurrency
    this.level = level
    this.decisionTimeoutMs = decisionTimeoutMs
    this.logger = logger || (() => {})
    this.queue = []
    this.running = 0
    this.rngBase = Date.now() & 0x7fffffff
    this.stats = { decided: 0, fallbacks: 0, errors: 0, slow: 0 }
  }

  setLevel(level) {
    if (level) this.level = level
  }

  /** 每个座位一个确定性随机源（seed 派生），保证同 seed 决策可复现 */
  rngFor(seed, seat) {
    return mulberry32(((seed >>> 0) * 131 + seat * 7) >>> 0)
  }

  /**
   * 决策：返回标准 Action（不含 actionId / seat / stateVersion）。
   * 并发受限、异常兜底；无论发生什么都不会 throw。
   */
  decide(view, seat, { seed = this.rngBase, level } = {}) {
    return this._enqueue(() => {
      const t0 = Date.now()
      let action = null
      try {
        action = aiDecide(view, level || this.level, this.rngFor(seed, seat))
      } catch (e) {
        this.stats.errors++
        this.logger('ai-error', { seat, message: String(e && e.message) })
        action = null
      }
      const cost = Date.now() - t0
      if (cost > this.decisionTimeoutMs) {
        this.stats.slow++
        this.logger('ai-slow', { seat, cost, limit: this.decisionTimeoutMs })
      }
      if (!action) {
        action = fallbackAction(view)
        if (action) this.stats.fallbacks++
      }
      this.stats.decided++
      return action
    })
  }

  _enqueue(fn) {
    return new Promise(resolve => {
      this.queue.push({ fn, resolve })
      this._drain()
    })
  }

  _drain() {
    while (this.running < this.maxConcurrency && this.queue.length) {
      const job = this.queue.shift()
      this.running++
      // 让出一个微任务，避免 AI 决策与房间队列任务在同一 tick 里挤在一起
      Promise.resolve()
        .then(() => job.fn())
        .then(
          v => {
            this.running--
            job.resolve(v)
            this._drain()
          },
          () => {
            this.running--
            this.stats.errors++
            job.resolve(null)
            this._drain()
          }
        )
    }
  }

  snapshot() {
    return {
      aiRunning: this.running,
      aiQueued: this.queue.length,
      aiDecided: this.stats.decided,
      aiFallbacks: this.stats.fallbacks,
      aiErrors: this.stats.errors,
      aiSlow: this.stats.slow
    }
  }
}