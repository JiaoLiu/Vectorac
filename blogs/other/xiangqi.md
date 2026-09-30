---
title: 中国象棋 · 楚河汉界
pageClass: xiangqi-page
meta:
  - name: viewport
    content: width=device-width, initial-scale=1, viewport-fit=cover
  - name: description
    content: 中国象棋网页版，人机对弈与残局闯关，红黑双方、本地 AI 三档难度，支持手机横竖屏。
  - name: apple-mobile-web-app-capable
    content: 'yes'
  - name: mobile-web-app-capable
    content: 'yes'
  - name: apple-mobile-web-app-status-bar-style
    content: black-translucent
  - name: apple-mobile-web-app-title
    content: 中国象棋
---

<div id="xiangqiGame" class="xq-root">
  <div class="xq-topbar">
    <div class="xq-brand">
      <div class="xq-brand-mark" aria-hidden="true"><span>帅</span><i>将</i></div>
      <div><div class="xq-kicker">棋逢对手 · 方寸之间</div><h1>中国象棋</h1></div>
    </div>
    <div class="xq-top-actions">
      <span class="xq-move-count" data-xq-move-count>0 手</span>
      <a class="xq-btn xq-btn-quiet xq-lobby-entry" data-xq-back href="/blogs/other/games.html">返回游戏列表</a>
      <button type="button" class="xq-btn xq-btn-quiet xq-feedback-entry" data-game-feedback aria-label="反馈中国象棋问题">反馈</button>
      <a class="xq-btn xq-btn-quiet xq-online-entry" href="/blogs/other/gamehall.html?game=xiangqi" aria-label="联机对战">🌐 联机</a>
    </div>
  </div>

  <div class="xq-layout">
    <section class="xq-board-card" aria-label="象棋对局">
      <div class="xq-board-frame"><div class="xq-board" data-xq-board></div>
        <div class="xq-result" data-xq-result hidden>
          <div class="xq-result-card"><div class="xq-result-stamp">对局结束</div><h2 data-xq-result-title>本局结束</h2><p data-xq-result-text></p>
            <div class="xq-result-actions"><button type="button" class="xq-btn xq-btn-primary" data-xq-next hidden>下一关</button><button type="button" class="xq-btn xq-btn-primary" data-xq-again>再来一局</button><button type="button" class="xq-btn xq-btn-quiet" data-xq-result-close>看看棋盘</button></div>
          </div>
        </div>
      </div>
    </section>
    <div class="xq-side">
      <section class="xq-match-card">
        <div class="xq-match-title"><span data-xq-match-title>本局对弈</span><span class="xq-match-live"><i></i> 单机</span></div>
        <div class="xq-mode-switch" role="group" aria-label="选择游戏模式"><button type="button" class="is-active" data-xq-mode="match">人机对弈</button><button type="button" data-xq-mode="puzzle">残局闯关</button></div>
        <div class="xq-players">
          <div class="xq-player black-player"><div class="xq-player-token">将</div><div><b data-xq-ai-label>黑方 · 电脑</b><small>沉着应战</small></div><span class="xq-player-crown">AI</span></div>
          <div class="xq-vs">VS</div>
          <div class="xq-player red-player"><div class="xq-player-token">帅</div><div><b data-xq-player-label>红方 · 你</b><small>运筹帷幄</small></div><span class="xq-player-crown">YOU</span></div>
        </div>
        <div class="xq-status" data-xq-status role="status" aria-live="polite">轮到红方行棋</div>
        <div class="xq-audio-controls" aria-label="音频设置">
          <button type="button" class="xq-audio-toggle is-on" data-xq-music aria-pressed="true" aria-label="背景音乐默认开启，首次点击游戏区域后开始播放">♫ 背景音乐：开</button>
          <button type="button" class="xq-audio-toggle is-on" data-xq-sound aria-pressed="true">♩ 落子音效：开</button>
        </div>
        <div class="xq-audio-credit"><a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN2100001" target="_blank" rel="noopener">《Guzheng City》 · Kevin MacLeod · CC BY 4.0</a></div>
        <div data-xq-match-settings>
          <div class="xq-setting-block">
            <div class="xq-setting-label">选择执棋方</div>
            <div class="xq-segment" role="group" aria-label="选择执棋方"><button type="button" data-xq-side="red">执红先行</button><button type="button" data-xq-side="black">执黑后手</button></div>
          </div>
          <div class="xq-setting-block">
            <div class="xq-setting-label">电脑难度</div>
            <div class="xq-segment xq-levels" role="group" aria-label="电脑难度"><button type="button" data-xq-level="easy">轻松</button><button type="button" class="is-active" data-xq-level="medium">标准</button><button type="button" data-xq-level="hard">挑战</button></div>
          </div>
        </div>
        <section class="xq-puzzle-panel" data-xq-puzzle-panel hidden aria-label="残局闯关">
          <div class="xq-puzzle-heading"><strong data-xq-puzzle-title>第 1 关</strong><span data-xq-puzzle-progress></span></div>
          <p data-xq-puzzle-lesson></p>
          <div class="xq-puzzle-page-nav"><button type="button" data-xq-puzzle-page="-1" aria-label="上一页关卡">‹</button><span data-xq-puzzle-page-label></span><button type="button" data-xq-puzzle-page="1" aria-label="下一页关卡">›</button></div>
          <div class="xq-puzzle-levels" data-xq-puzzle-levels aria-label="关卡列表"></div>
          <div class="xq-puzzle-choices" data-xq-puzzle-choices hidden aria-label="候选着法"></div>
          <div class="xq-puzzle-source" data-xq-puzzle-source hidden></div>
          <div class="xq-puzzle-actions"><button type="button" class="xq-btn" data-xq-puzzle-restart>重摆本关</button><button type="button" class="xq-btn" data-xq-hint>✦ 提示</button></div>
        </section>
        <div class="xq-actions" data-xq-match-actions>
          <button type="button" class="xq-btn xq-btn-primary" data-xq-new>新开一局</button>
          <button type="button" class="xq-btn" data-xq-hint>✦ 着法提示</button>
          <button type="button" class="xq-btn" data-xq-undo disabled>↶ 悔棋</button>
        </div>
      </section>
      <section class="xq-history-card">
        <div class="xq-section-heading"><span>最近着法</span><span class="xq-section-note">MOVE HISTORY</span></div>
        <div class="xq-history" data-xq-history><div class="xq-history-empty">棋盘已摆好，轮到红方先行。</div></div>
      </section>
      <details class="xq-rules-card">
        <summary><span>新手速览</span><span>＋</span></summary>
        <div class="xq-rules-copy">
          <p><b>车</b>走直线；<b>马</b>走日字，蹩马腿不能走；<b>炮</b>平时走直线，吃子要隔一个棋子。</p>
          <p><b>相 / 象</b>走田字且不能过河；<b>仕 / 士</b>斜走一格并守在九宫；<b>兵 / 卒</b>过河后可横走。</p>
          <p>将帅不能照面。被将军时必须应将；无棋可走的一方判负。</p>
        </div>
      </details>
    </div>
  </div>
  <div class="xq-footer"><span>用心落子，静候佳音</span><span>本地对局 · 不上传棋谱</span></div>
</div>




<script>
export default {
  mounted() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    this.$nextTick(async () => {
      const root = this.$el && this.$el.querySelector ? this.$el.querySelector('#xiangqiGame') : null
      if (!root) return
      if (window.__xiangqiUI) {
        try { window.__xiangqiUI.destroy() } catch (e) { /* ignore stale instance */ }
        window.__xiangqiUI = null
      }
      try {
        const { default: XiangqiUI } = await import('../../.vuepress/components/xiangqi/ui.js')
        if (this._isDestroyed || !root.isConnected) return
        this._xq = new XiangqiUI(root)
        window.__xiangqiUI = this._xq
      } catch (error) {
        console.error('[中国象棋] 初始化失败：', error)
      }
    })
  },
  beforeDestroy() {
    if (this._xq) {
      try { this._xq.destroy() } catch (e) { /* ignore */ }
      this._xq = null
    }
    if (typeof window !== 'undefined' && window.__xiangqiUI) window.__xiangqiUI = null
  }
}
</script>
