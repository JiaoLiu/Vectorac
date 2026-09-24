---
title: 小丑牌
sidebar: false
meta:
  - name: viewport
    content: width=device-width, initial-scale=1, viewport-fit=cover
  - name: apple-mobile-web-app-capable
    content: 'yes'
  - name: mobile-web-app-capable
    content: 'yes'
  - name: apple-mobile-web-app-status-bar-style
    content: black-translucent
  - name: apple-mobile-web-app-title
    content: 小丑牌
---

::: tip 小丑牌 · 扑克 Roguelike
不是比谁的牌大，而是让每一手牌打出更高的分数。组合扑克、小丑牌与消耗牌，用「筹码 × 倍率」击破盲注，构筑能闯过 8 个底注的牌组。
:::

<div id="balatro-game" aria-label="小丑牌游戏"><p class="bp-loading">正在准备牌桌…</p></div>

## 上手指南

- **选牌出手**：每次选 1～5 张牌，组成对子、顺子、同花等牌型。次数有限，善用弃牌寻找机会。
- **让小丑联动**：小丑从左到右触发，加倍率与乘倍率的排列会影响得分。点击小丑可查看详情、调整顺序或出售。
- **升级与改牌**：星球提升牌型等级，塔罗和幻灵改变扑克牌。击破盲注后，到商店购买卡牌、补充包和永久优惠券。
- **留意牌面提醒**：待办清单会直接显示本轮目标；选牌符合条件时高亮。指定花色、点数和剩余触发次数也会显示在相关卡牌上。

### 操作说明

单击或轻点扑克牌选中，再点一次取消；点击「出牌」或「弃牌」执行。**已持有的星球牌可双击 / 快速双点直接使用**，单击仍可查看详情。改牌类消耗牌须先选择目标手牌。

开始时自动进入游戏全屏，右上角可退出；非全屏也能继续玩，页面可以正常滚动。iPhone Safari 普通标签页的地址栏不能由网页隐藏；添加到主屏幕后再打开，可获得无浏览器栏的独立窗口。游戏自动保存在当前浏览器，下次选择「继续游戏」即可恢复。

键盘快捷键：`1～8` 选牌，`Enter` 出牌，`D` 弃牌。音效与音乐可单独关闭。

<small>背景音乐：Fluffing a Duck · Kevin MacLeod（incompetech.com），CC-BY 4.0 授权。</small>

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
