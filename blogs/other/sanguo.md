---
title: 三国·逐鹿 · 经典身份牌局
pageClass: sanguo-page
meta:
  - name: viewport
    content: width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover
  - name: description
    content: 五人经典身份牌局，十二名三国武将、108张牌与四名本地AI。原创牌桌，手机横竖屏适配，自动保存对局。
  - name: apple-mobile-web-app-capable
    content: 'yes'
  - name: apple-mobile-web-app-status-bar-style
    content: black-translucent
---

<div id="sanguoGame"><p style="padding:40px;text-align:center">正在展开逐鹿牌桌…</p></div>

<script>
export default {
  mounted() {
    this.$nextTick(async () => {
      const root = this.$el.querySelector('#sanguoGame')
      if (!root) return
      try {
        const { default: SanguoUI } = await import('../../.vuepress/components/sanguo/ui.js')
        if (this._isDestroyed || !root.isConnected) return
        if (window.__sanguoUI) window.__sanguoUI.destroy()
        this._sanguo = new SanguoUI(root)
        window.__sanguoUI = this._sanguo
      } catch (error) {
        console.error('[三国逐鹿] 初始化失败', error)
        root.textContent = '牌桌加载失败，请刷新页面重试。'
      }
    })
  },
  beforeDestroy() {
    if (this._sanguo) this._sanguo.destroy()
    if (typeof window !== 'undefined' && window.__sanguoUI === this._sanguo) window.__sanguoUI = null
    this._sanguo = null
  }
}
</script>
