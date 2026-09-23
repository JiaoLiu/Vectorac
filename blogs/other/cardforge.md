---
title: 小丑牌
sidebar: false
meta:
  - name: viewport
    content: width=device-width, initial-scale=1, viewport-fit=cover
---

<div id="balatro-game" aria-label="小丑牌游戏"><p class="bp-loading">正在准备牌桌…</p></div>

<script>
import '../../.vuepress/components/balatro/style.css'

export default {
  mounted() {
    this.$nextTick(async () => {
      const root = this.$el.querySelector('#balatro-game')
      if (!root) return
      try {
        const { default: PokerTable } = await import('../../.vuepress/components/balatro/ui.js')
        if (this._isDestroyed || !root.isConnected) return
        this._pokerTable = new PokerTable(root)
      } catch (error) {
        console.error('[小丑牌] 初始化失败', error)
        root.textContent = '牌桌加载失败，请刷新重试。'
      }
    })
  },
  beforeDestroy() {
    if (this._pokerTable) this._pokerTable.destroy()
  }
}
</script>
