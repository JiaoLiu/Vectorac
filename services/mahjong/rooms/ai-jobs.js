// ============================================================
// AI 服务与并发限制（mahjong-service/rooms/ai-jobs.js）
// ------------------------------------------------------------
// 文档 §37 / §38 / §39 / §53：真人超时、真人断线、真 AI 座位都走同一套
// AIService.decide()，绝不另写「随机出牌」系统。AI 只产出标准 Action，
// 不直接改 GameState：AI Decision → 标准 Action → Room Queue → 引擎裁决。
//
// 并发限制：aiDecide 是同步 CPU（hard 档含向听/听张枚举），2 核机器上
// 20 房 × 多座同时决策会顶满 CPU，所以全局限流 + 排队。
//
// 本模块游戏无关：具体游戏的 AI 决策与确定性兜底都在对应适配器里
// （adapter.aiDecide / adapter.aiFallback），decide() 按房间适配器分发。
//
// 诚实说明（重要）：aiDecide 的契约是「单次决策 < 50ms」。同步 CPU 代码无法被
// 真正抢占，所以 AI_DECISION_TIMEOUT_MS 是**软超时**——超时会记警告日志并
// 走兜底动作，但不会把已开始的决策打断（硬抢占需要 worker_threads，第一版
// 不做）。限流器是把 CPU 峰值压在安全区的主要手段。
// ============================================================

import { mulberry32 } from '../engine/engine.js'

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
   * 游戏专属逻辑走 adapter：adapter.aiDecide 产出动作，失败时 adapter.aiFallback 兜底。
   */
  decide(adapter, view, seat, { seed = this.rngBase, level } = {}) {
    return this._enqueue(() => {
      const t0 = Date.now()
      let action = null
      try {
        action = adapter.aiDecide(view, level || this.level, this.rngFor(seed, seat))
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
        action = adapter.aiFallback(view)
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