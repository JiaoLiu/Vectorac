---
meta:
  # viewport 必须排在 head 最前并带 viewport-fit=cover，
  # iOS 刘海机型才会注入 env(safe-area-inset-*)（详见麻将页同款注释）。
  - name: viewport
    content: width=device-width, initial-scale=1, viewport-fit=cover
  - name: apple-mobile-web-app-capable
    content: 'yes'
  - name: mobile-web-app-capable
    content: 'yes'
  - name: apple-mobile-web-app-status-bar-style
    content: black-translucent
  - name: apple-mobile-web-app-title
    content: 五子棋
---

::: warning 五子棋 · 人机对战
经典 15×15 五子棋，黑先白后、先成五连者胜。三档 AI 陪练：简单档随手陪玩，中等档步步为营，困难档带 4 层搜索，会做杀也会补防。
:::

<div id="gomokuGame" class="gk-root">
<div class="gk-panel">
<!-- 顶栏：标题 / 难度 / 战绩 -->
<div class="gk-topbar">
<div class="gk-title-row">
<span class="gk-title">五子棋</span>
<span class="gk-moves" data-gk-moves>第 0 手</span>
</div>
<div class="gk-diff" role="group" aria-label="AI 难度">
<button type="button" data-diff="easy">简单</button>
<button type="button" data-diff="medium">中等</button>
<button type="button" data-diff="hard">困难</button>
</div>
<div class="gk-stats">
<span class="gk-stat"><i class="gk-stat-num win" data-gk-win>0</i>胜</span>
<span class="gk-stat"><i class="gk-stat-num loss" data-gk-loss>0</i>负</span>
<span class="gk-stat"><i class="gk-stat-num draw" data-gk-draw>0</i>平</span>
<span class="gk-stats-scope">· <span data-gk-stats-level>中等</span></span>
</div>
<button type="button" class="gk-btn gk-feedback-entry" data-game-feedback aria-label="反馈五子棋问题">反馈</button>
<a class="gk-btn gk-online-entry" href="/blogs/other/gamehall.html?game=gomoku" aria-label="联机对战">🌐 联机</a>
<button type="button" class="gk-btn gk-fs-toggle" data-gk-fullscreen aria-label="退出全屏">✕</button>
</div>
<!-- 状态条 -->
<div class="gk-status-row">
<div class="gk-status" data-gk-status>
<span class="gk-dot gk-dot-black" data-gk-turn-dot></span>
<span data-gk-status-text>轮到你落子</span>
</div>
</div>
<!-- 棋盘 -->
<div class="gk-board-wrap">
<canvas data-gk-canvas aria-label="五子棋棋盘"></canvas>
<div class="gk-result" data-gk-result hidden>
<div class="gk-result-card">
<div class="gk-result-title" data-gk-result-title></div>
<div class="gk-result-sub" data-gk-result-sub></div>
<div class="gk-result-btns">
<button type="button" class="gk-btn gk-btn-primary" data-gk-again>再来一局</button>
<button type="button" class="gk-btn" data-gk-view>查看棋盘</button>
</div>
</div>
</div>
</div>
<!-- 控制区 -->
<div class="gk-controls">
<button type="button" class="gk-btn" data-gk-undo>↩ 悔棋</button>
<button type="button" class="gk-btn" data-gk-restart>✦ 重开</button>
<div class="gk-first" role="group" aria-label="先后手">
<button type="button" data-first="player">我先手</button>
<button type="button" data-first="ai">AI 先手</button>
</div>
<button type="button" class="gk-btn gk-sound" data-gk-sound>🔊</button>
<button type="button" class="gk-btn gk-music" data-gk-music>♫</button>
</div>
</div>
<div class="gk-tips">黑先白后 · 先成五连（及以上）者胜 · 战绩按难度分别统计，存于本机浏览器<br>背景音乐：Windswept · Kevin MacLeod（incompetech.com），CC-BY 4.0 授权</div>
</div>


<script>
export default {
  mounted() {
    // SSR 保护：DOM 逻辑仅在浏览器端执行
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    this.$nextTick(async () => {
      const root = this.$el && this.$el.querySelector ? this.$el.querySelector('#gomokuGame') : null
      if (!root) return
      // 防重复初始化（路由复用时先销毁旧实例）
      if (window.__gomokuUI) {
        try { window.__gomokuUI.destroy() } catch (e) { /* 忽略 */ }
        window.__gomokuUI = null
      }
      try {
        const { default: GomokuUI } = await import('../../.vuepress/components/gomoku/ui.js')
        if (this._isDestroyed || !root.isConnected) return
        this._gk = new GomokuUI(root)
        this._gk.mount()
        window.__gomokuUI = this._gk
      } catch (err) {
        console.error('[五子棋] 初始化失败：', err)
      }
    })
  },
  beforeDestroy() {
    if (this._gk) {
      try { this._gk.destroy() } catch (e) { /* 忽略 */ }
      this._gk = null
    }
    if (typeof window !== 'undefined' && window.__gomokuUI) window.__gomokuUI = null
  }
}
</script>
