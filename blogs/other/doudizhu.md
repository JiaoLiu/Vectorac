---
title: 斗地主 · 经典三人
pageClass: doudizhu-page
meta:
  - name: viewport
    content: width=device-width, initial-scale=1, viewport-fit=cover
  - name: description
    content: 经典三人斗地主网页版，一副牌、叫分抢地主、炸弹春天翻倍，本地 AI 对战，支持手机横竖屏。
  - name: apple-mobile-web-app-capable
    content: 'yes'
  - name: mobile-web-app-capable
    content: 'yes'
  - name: apple-mobile-web-app-status-bar-style
    content: black-translucent
  - name: apple-mobile-web-app-title
    content: 斗地主
---

<div id="ddzGame" class="ddz-root"></div>

<script>
export default {
  mounted() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    this.$nextTick(async () => {
      const root = this.$el && this.$el.querySelector ? this.$el.querySelector('#ddzGame') : null
      if (!root) return
      if (window.__doudizhuUI) {
        try { window.__doudizhuUI.destroy() } catch (e) { /* ignore stale instance */ }
        window.__doudizhuUI = null
      }
      try {
        const { default: DoudizhuUI } = await import('../../.vuepress/components/doudizhu/ui.js')
        if (this._isDestroyed || !root.isConnected) return
        this._ddz = new DoudizhuUI(root)
        window.__doudizhuUI = this._ddz
      } catch (error) {
        console.error('[斗地主] 初始化失败：', error)
      }
    })
    // iOS bfcache 防御：跳去联机大厅后返回时页面从缓存恢复，脚本不重跑；
    // 音频上下文 / 定时器若已失效（Safari 会杀掉 bfcache 页的音频），
    // DOM 可能残留半销毁状态——恢复时校验 UI 实例，坏了就重建
    this._onPageshow = e => {
      if (!e.persisted) return
      const root = this.$el && this.$el.querySelector ? this.$el.querySelector('#ddzGame') : null
      if (!root) return
      const ui = window.__doudizhuUI
      if (ui && !ui._destroyed && root.contains(ui.topbar)) return // 实例健康
      if (ui) { try { ui.destroy() } catch (err) { /* ignore */ } }
      window.__doudizhuUI = null
      import('../../.vuepress/components/doudizhu/ui.js')
        .then(({ default: DoudizhuUI }) => {
          if (this._isDestroyed || !root.isConnected) return
          this._ddz = new DoudizhuUI(root)
          window.__doudizhuUI = this._ddz
        })
        .catch(() => {})
    }
    window.addEventListener('pageshow', this._onPageshow)
  },
  beforeDestroy() {
    if (this._onPageshow) {
      window.removeEventListener('pageshow', this._onPageshow)
      this._onPageshow = null
    }
    if (this._ddz) {
      try { this._ddz.destroy() } catch (e) { /* ignore */ }
      this._ddz = null
    }
    if (typeof window !== 'undefined' && window.__doudizhuUI) window.__doudizhuUI = null
  }
}
</script>
