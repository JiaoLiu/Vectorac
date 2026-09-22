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
</div>
</div>
<div class="gk-tips">黑先白后 · 先成五连（及以上）者胜 · 战绩按难度分别统计，存于本机浏览器</div>
</div>

<style>
/* ============ 容器（深色面板，与站点暗色风格一致） ============ */
.gk-root {
  max-width: 720px;
  margin: 18px auto;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.gk-panel {
  background: linear-gradient(160deg, #242a3c 0%, #171b27 55%, #10131c 100%);
  border-radius: 20px;
  padding: 18px 18px 16px;
  box-sizing: border-box;
  box-shadow: 0 18px 44px rgba(10, 12, 20, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: #e8eaf2;
}
.gk-root [hidden] { display: none !important; }
.gk-root button { font: inherit; }

/* ============ 顶栏 ============ */
.gk-topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  margin-bottom: 12px;
}
.gk-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-right: auto;
}
.gk-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 4px;
  background: linear-gradient(135deg, #ffd9a0, #ff9d5c);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.gk-moves { font-size: 12px; color: #8b93a8; letter-spacing: 1px; }

/* 难度分段控件（Apple 风格） */
.gk-diff {
  display: flex;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 999px;
  padding: 3px;
}
.gk-diff button {
  border: none;
  background: transparent;
  color: #aeb6c9;
  font-size: 13px;
  padding: 6px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.gk-diff button.active {
  background: linear-gradient(135deg, #ffb26b, #ff7e3d);
  color: #231300;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(255, 126, 61, 0.4);
}

/* 战绩 */
.gk-stats {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
  color: #8b93a8;
}
.gk-stat { white-space: nowrap; }
.gk-stat-num { font-style: normal; font-weight: 700; margin-right: 2px; font-size: 14px; }
.gk-stat-num.win { color: #6fdc8c; }
.gk-stat-num.loss { color: #ff7b72; }
.gk-stat-num.draw { color: #f5c542; }
.gk-stats-scope { color: #6d7488; }

/* ============ 状态条 ============ */
.gk-status-row { display: flex; justify-content: center; margin-bottom: 12px; }
.gk-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 158px;
  padding: 7px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 13.5px;
  color: #cdd3e3;
  transition: color 0.2s ease;
}
.gk-status.is-thinking { color: #ffd9a0; }
.gk-status.is-thinking::after {
  content: '…';
  width: 14px;
  text-align: left;
  animation: gkDots 1.1s steps(4) infinite;
}
@keyframes gkDots {
  0% { content: ''; }
  25% { content: '·'; }
  50% { content: '··'; }
  75% { content: '···'; }
}
.gk-status.is-over { color: #8be39b; font-weight: 700; }
.gk-dot { width: 14px; height: 14px; border-radius: 50%; flex: none; }
.gk-dot-black {
  background: radial-gradient(circle at 32% 30%, #6a6a6a, #000 72%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.gk-dot-white {
  background: radial-gradient(circle at 32% 30%, #ffffff, #cfcfcf 75%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(0, 0, 0, 0.15);
}

/* ============ 棋盘 ============ */
.gk-board-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  min-width: 0;
}
.gk-board-wrap canvas {
  display: block;
  max-width: 100%;
  border-radius: 12px;
  cursor: pointer;
  touch-action: manipulation;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
}

/* ============ 结算浮层 ============ */
.gk-result {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(10, 12, 18, 0);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease, background 0.3s ease;
}
.gk-result.show {
  opacity: 1;
  pointer-events: auto;
  background: rgba(10, 12, 18, 0.45);
}
.gk-result-card {
  text-align: center;
  background: rgba(24, 28, 40, 0.94);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 26px 36px;
  border-radius: 16px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  transform: translateY(10px) scale(0.96);
  transition: transform 0.3s ease;
}
.gk-result.show .gk-result-card { transform: none; }
.gk-result-title { font-size: 26px; font-weight: 800; margin-bottom: 6px; letter-spacing: 1px; }
.gk-result-title.is-win { color: #7be495; }
.gk-result-title.is-loss { color: #ff8a80; }
.gk-result-title.is-draw { color: #f5c542; }
.gk-result-sub { font-size: 13px; color: #9aa3b8; margin-bottom: 18px; }
.gk-result-btns { display: flex; gap: 10px; justify-content: center; }

/* ============ 控制区 ============ */
.gk-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
}
.gk-btn {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: #dfe4f0;
  font-size: 13.5px;
  padding: 9px 18px;
  border-radius: 12px;
  cursor: pointer;
  min-height: 40px;
  transition: background 0.2s ease, filter 0.2s ease;
}
.gk-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
.gk-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.gk-btn-primary {
  background: linear-gradient(135deg, #ffb26b, #ff7e3d);
  border: none;
  color: #2a1500;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(255, 126, 61, 0.35);
}
.gk-btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #ffb26b, #ff7e3d);
  filter: brightness(1.07);
}
.gk-first {
  display: flex;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  padding: 3px;
}
.gk-first button {
  border: none;
  background: transparent;
  color: #aeb6c9;
  font-size: 12.5px;
  padding: 7px 13px;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.gk-first button.active {
  background: rgba(255, 178, 107, 0.92);
  color: #231300;
  font-weight: 700;
}
.gk-sound { width: 46px; padding-left: 0; padding-right: 0; text-align: center; }
.gk-sound.muted { opacity: 0.45; }
.gk-fs-toggle {
  width: 40px;
  min-height: 36px;
  padding: 0;
  text-align: center;
  font-size: 15px;
  line-height: 1;
  border-radius: 999px;
  flex: none;
}

/* ============ 全屏沉浸模式（默认开启，占满整个屏幕，麻将同款方案） ============ */
/* 主题容器 .theme-reco-content 带 transform，fixed 会被限制在其内部，
   因此全屏期间 JS 会把根节点临时移挂到 body 下，退出时还原。 */
#gomokuGame.gk-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 200;
  max-width: none;
  margin: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: radial-gradient(1200px 800px at 50% 0%, #1d2334 0%, #0d1017 70%);
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
#gomokuGame.gk-fullscreen .gk-panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  box-sizing: border-box;
}
#gomokuGame.gk-fullscreen .gk-topbar,
#gomokuGame.gk-fullscreen .gk-status-row,
#gomokuGame.gk-fullscreen .gk-controls,
#gomokuGame.gk-fullscreen .gk-tips { flex: 0 0 auto; }
/* 棋盘区吃满剩余空间；canvas 绝对定位居中，尺寸由 JS 按可用宽高中的小值计算，
   避免 canvas 撑开容器造成尺寸循环依赖 */
#gomokuGame.gk-fullscreen .gk-board-wrap {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  position: relative;
}
#gomokuGame.gk-fullscreen .gk-board-wrap canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
body.gk-lock { overflow: hidden; }
/* 游戏全屏期间隐藏全局 AI 客服悬浮按钮与面板（退出游戏自动恢复） */
body.gk-lock #cw-fab,
body.gk-lock #cw-panel { display: none !important; }

/* ============ 底部提示 ============ */
.gk-tips {
  text-align: center;
  font-size: 12.5px;
  color: #97a0b5;
  margin-top: 10px;
  letter-spacing: 0.5px;
}

/* ============ 移动端 ============ */
@media (max-width: 640px) {
  .gk-panel { padding: 14px 12px 12px; border-radius: 16px; }
  .gk-topbar { justify-content: center; gap: 8px 10px; }
  .gk-title-row { width: 100%; justify-content: center; margin-right: 0; }
  .gk-title { font-size: 20px; }
  .gk-controls { gap: 8px; }
  .gk-btn { padding: 9px 14px; }
  .gk-result-card { padding: 20px 24px; }
  .gk-result-title { font-size: 22px; }
  /* 全屏时收窄面板横向 padding，把宽度尽量让给棋盘 */
  #gomokuGame.gk-fullscreen .gk-panel { padding: 12px 6px 10px; border-radius: 14px; }
  /* 竖屏全屏：隐藏设置类控件（标题/难度/战绩/提示），只留手数、状态条与操作按钮，
     需要改难度/先后手设置时退出全屏在文章流里改 */
  #gomokuGame.gk-fullscreen .gk-title,
  #gomokuGame.gk-fullscreen .gk-diff,
  #gomokuGame.gk-fullscreen .gk-stats,
  #gomokuGame.gk-fullscreen .gk-tips { display: none; }
  #gomokuGame.gk-fullscreen .gk-topbar { justify-content: space-between; margin-bottom: 8px; }
  #gomokuGame.gk-fullscreen .gk-title-row { width: auto; margin-right: 0; }
  #gomokuGame.gk-fullscreen .gk-status-row { margin-bottom: 8px; }
  /* 操作按钮一排靠底边、紧凑不折行 */
  #gomokuGame.gk-fullscreen .gk-controls { flex-wrap: nowrap; gap: 6px; margin-top: 10px; }
  #gomokuGame.gk-fullscreen .gk-controls .gk-btn { min-height: 34px; padding: 6px 10px; font-size: 12.5px; }
  #gomokuGame.gk-fullscreen .gk-first button { padding: 5px 9px; font-size: 12px; }
  #gomokuGame.gk-fullscreen .gk-sound { width: 40px; }
  #gomokuGame.gk-fullscreen .gk-fs-toggle { width: 36px; min-height: 32px; }
}

/* ============ 横屏手机全屏：棋盘居左占满高度，控制按钮竖排靠右 ============ */
@media (max-height: 540px) and (orientation: landscape) {
  #gomokuGame.gk-fullscreen {
    padding: max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
  }
  #gomokuGame.gk-fullscreen .gk-panel {
    display: grid;
    /* 右列固定宽度：状态条文本长度变化（轮到你落子/AI 思考中）不再
       改变列宽，避免棋盘区尺寸跟着跳、canvas 反复重建闪动 */
    grid-template-columns: minmax(0, 1fr) 150px;
    grid-template-rows: auto auto 1fr;
    column-gap: 10px;
    max-width: none;
    padding: 8px 10px;
    border-radius: 14px;
  }
  #gomokuGame.gk-fullscreen .gk-board-wrap { grid-row: 1 / 4; grid-column: 1; }
  #gomokuGame.gk-fullscreen .gk-topbar { grid-column: 2; grid-row: 1; margin: 0 0 6px; justify-content: space-between; }
  #gomokuGame.gk-fullscreen .gk-title-row { width: auto; margin-right: 0; }
  #gomokuGame.gk-fullscreen .gk-title,
  #gomokuGame.gk-fullscreen .gk-diff,
  #gomokuGame.gk-fullscreen .gk-stats,
  #gomokuGame.gk-fullscreen .gk-tips { display: none; }
  #gomokuGame.gk-fullscreen .gk-status-row { grid-column: 2; grid-row: 2; margin: 0 0 8px; }
  #gomokuGame.gk-fullscreen .gk-status { min-width: 0; padding: 5px 12px; }
  #gomokuGame.gk-fullscreen .gk-controls {
    grid-column: 2;
    grid-row: 3;
    align-self: start;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    margin: 0;
  }
  #gomokuGame.gk-fullscreen .gk-controls .gk-btn { min-height: 34px; padding: 6px 10px; font-size: 12.5px; }
  #gomokuGame.gk-fullscreen .gk-first { justify-content: center; }
  #gomokuGame.gk-fullscreen .gk-first button { padding: 5px 8px; font-size: 12px; }
  #gomokuGame.gk-fullscreen .gk-sound { width: auto; }
  #gomokuGame.gk-fullscreen .gk-fs-toggle { width: 36px; min-height: 32px; }
}
</style>

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
