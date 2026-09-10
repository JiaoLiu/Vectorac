<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

::: warning 史莱姆模拟解压游戏
一款有趣的解压游戏，模拟真实的史莱姆（起泡胶）手感！软软绵绵，色彩丰富，拖动变形，按压凹陷，戳破气泡，享受减压的乐趣！
:::

<div id="slimeGame" class="game-container">
<div class="game-header">
<div class="game-title">史莱姆塑形工坊</div>
<div class="game-stats">
<span>选一块泥，压个模具，慢慢捏成你的作品</span>
</div>
</div>

<div class="slime-controls">
<div class="studio-row">
<span class="selector-label">手感</span>
<div class="studio-options">
<button class="active" data-material="butter">黄油泥</button>
<button data-material="crystal">水晶胶</button>
<button data-material="memory">超慢回弹</button>
<button data-material="liquid">流动胶</button>
<button data-material="foam">起泡胶</button>
<button data-material="clay">雕塑泥</button>
</div>
</div>
<div class="studio-row">
<span class="selector-label">压模</span>
<div class="studio-options">
<button class="active" data-mold="round">◯ 原团</button>
<button data-mold="star">☆ 星星</button>
<button data-mold="heart">♡ 心形</button>
<button data-mold="melody">美乐蒂 · 简化轮廓</button>
</div>
</div>
<div class="control-row control-colors">
  <div class="color-selector">
    <div class="selector-label">选择颜色:</div>
    <div class="color-buttons">
      <button class="color-btn active" data-color="#FF6B9D" style="background: #FF6B9D;"></button>
      <button class="color-btn" data-color="#4ECDC4" style="background: #4ECDC4;"></button>
      <button class="color-btn" data-color="#FFE66D" style="background: #FFE66D;"></button>
      <button class="color-btn" data-color="#95E1D3" style="background: #95E1D3;"></button>
      <button class="color-btn" data-color="#F38181" style="background: #F38181;"></button>
      <button class="color-btn" data-color="#AA96DA" style="background: #AA96DA;"></button>
      <button class="color-btn" data-color="#FF9FF3" style="background: #FF9FF3;"></button>
      <button class="color-btn" data-color="#54A0FF" style="background: #54A0FF;"></button>
      <button class="color-btn" data-color="#00D2D3" style="background: #00D2D3;"></button>
      <button class="color-btn" data-color="#5F27CD" style="background: #5F27CD;"></button>
      <button class="color-btn" data-color="#FF6B6B" style="background: #FF6B6B;"></button>
      <button class="color-btn" data-color="#48DBFB" style="background: #48DBFB;"></button>
      <button class="color-btn" data-color="#00C851" style="background: #00C851;"></button>
      <button class="color-btn" data-color="#FFD54F" style="background: #FFD54F;"></button>
      <button class="color-btn" data-color="#FF8A65" style="background: #FF8A65;"></button>
      <button class="color-btn" data-color="#BA68C8" style="background: #BA68C8;"></button>
      <button class="color-btn" data-color="#64B5F6" style="background: #64B5F6;"></button>
      <button class="color-btn" data-color="#81C784" style="background: #81C784;"></button>
      <button class="color-btn" data-color="#FFB74D" style="background: #FFB74D;"></button>
      <button class="color-btn" data-color="#E57373" style="background: #E57373;"></button>
    </div>
  </div>
</div>
<div class="control-row control-tools">
  <div class="tool-selector">
    <div class="selector-label">工具:</div>
    <div class="tool-buttons">
      <button class="tool-btn active" data-tool="pump" title="按住压出指印，拖动揉出沟槽。">按压</button>
      <button class="tool-btn" data-tool="pinch" title="按住将局部捏起，形成小尖峰。">捏起</button>
      <button class="tool-btn" data-tool="carve" title="按住拖动刻出连续沟槽；雕塑泥能长期保留刻痕。">刻线</button>
      <button class="tool-btn" data-tool="tear" title="从泥团内部向外拖动撕开，产生独立碎块。">撕裂</button>
      <button class="tool-btn" data-tool="fold" title="从外沿向中心拖动，把这一侧翻折过去。">翻折</button>
      <button class="tool-btn" data-tool="move" title="拖动整团或撕下的独立碎块。">挪动</button>
      <button class="tool-btn" data-tool="flatten" title="宽工具压出一片平缓凹面。">压平</button>
      <button class="tool-btn" data-tool="smooth" title="抹平附近凹凸，修整你的作品。">抹平</button>
      <button class="tool-btn" data-tool="bubble" title="按住将胶膜捏起，松开生成气泡。">起泡</button>
      <button class="tool-btn" data-tool="pop" title="点击凸起的透明气泡将它戳破。">戳泡</button>
      <button class="tool-btn" data-tool="rotate" title="拖动环绕旋转视角；空白处拖动、双指或鼠标右键也可以。">旋转视角</button>
    </div>
</div>
</div>
<div class="studio-options studio-settings">
<button class="tool-btn" data-tool="glitter" title="点一下撒闪粉，按住连续撒；换按压工具把它揉进去。">✦ 撒闪粉</button>
<button class="tool-btn" data-tool="foil" title="撒下金属薄片，落在表面后可以随泥团一起揉动。">◆ 撒金属屑</button>
<label><input type="checkbox" data-sculpt /> 保留捏痕</label>
<label>工具大小 <input type="range" data-radius min="0.12" max="0.42" step="0.02" value="0.24" /></label>
<button data-undo disabled>撤销塑形</button>
<button data-reset>重新揉好</button>
<button data-view>视角复位</button>
</div>
<p class="studio-status" data-slime-status role="status" aria-live="polite">正在准备你的工作台…</p>
</div>

<div class="slime-fs-bar">
<div class="fs-drop" data-fs-drop="tool">
<button type="button" class="fs-trigger">按压<i class="fs-chevron">▾</i></button>
<div class="fs-menu"></div>
</div>
<div class="fs-drop" data-fs-drop="material">
<button type="button" class="fs-trigger">黄油泥<i class="fs-chevron">▾</i></button>
<div class="fs-menu"></div>
</div>
<div class="fs-drop" data-fs-drop="mold">
<button type="button" class="fs-trigger">◯ 原团<i class="fs-chevron">▾</i></button>
<div class="fs-menu"></div>
</div>
<input type="color" data-fs-color value="#FF6B9D" aria-label="选择颜色" />
<button class="tool-btn" data-tool="glitter" title="点一下撒闪粉，按住连续撒。">✦</button>
<button class="tool-btn" data-tool="foil" title="撒下金属薄片。">◆</button>
<button class="slime-gear" data-gear title="展开更多选项。">⚙ 选项</button>
</div>

<div class="slime-canvas-container">
<canvas id="slimeCanvas" aria-label="三维史莱姆塑形工作台，选择工具后拖动操作"></canvas>
<div class="instructions">
拖动揉捏 · 空白处拖动旋转视角 · 双指缩放 · 撕开后可挪动碎块 · 右键旋转
</div>
<button class="slime-max" data-maximize title="全屏游玩" aria-label="全屏游玩">⛶</button>
</div>
</div>

<div class="game-introduction">
<h3>游戏介绍</h3>
<p>欢迎来到史莱姆模拟解压游戏！在这里你可以体验到逼真的电子史莱姆，通过触摸、按压、拖动来达到解压效果，还可以混合不同颜色创造独特的史莱姆。</p>
<h3>操作方式</h3>
<ul>
<li>电脑端：使用鼠标点击、拖动、按压进行互动</li>
<li>移动端：使用手指触摸、滑动进行操作</li>
<li>选择不同颜色和工具获得不同游戏体验</li>
</ul>
</div>

<style>
#slimeGame .studio-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
#slimeGame .studio-options { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
#slimeGame .studio-options button { padding: 8px 14px; border: 1px solid #ded3df; border-radius: 18px; background: #fffafa; color: #56445d; cursor: pointer; font: inherit; font-size: 13px; }
#slimeGame .studio-options button.active { background: #765573; border-color: #765573; color: white; }
#slimeGame button:focus-visible, #slimeGame input:focus-visible { outline: 3px solid #975cac; outline-offset: 3px; }
#slimeGame button:disabled { opacity: .4; cursor: default; }
#slimeGame .studio-settings { margin-top: 16px; }
#slimeGame .studio-settings label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #56445d; }
#slimeGame .studio-settings input[type=range] { width: 95px; }
#slimeGame .studio-status { margin: 12px 0 0; min-height: 22px; font-size: 13px; color: #765573; }
#slimeGame #slimeCanvas { width: 100%; height: auto; max-height: none; touch-action: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; -webkit-user-drag: none; }
.game-container {
  max-width: 900px;
  margin: 20px auto;
  padding: 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
  box-sizing: border-box;
}

.game-header {
  text-align: center;
  margin-bottom: 30px;
  padding: 20px;
  background: white;
  border-radius: 15px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.05);
}

.game-title {
  font-size: 28px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 10px;
}

.game-stats {
  font-size: 14px;
  color: #7f8c8d;
}

.slime-controls {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 30px;
  padding: 20px;
  background: white;
  border-radius: 15px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.05);
  max-width: 100%;
  box-sizing: border-box;
}

.control-row {
  display: flex;
  justify-content: center;
  align-items: center;
}

.color-selector,
.tool-selector {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 15px;
  max-width: 100%;
  justify-content: center;
  flex-wrap: wrap;
}

.selector-label {
  font-size: clamp(14px, 3vw, 16px);
  font-weight: bold;
  color: #2c3e50;
  white-space: nowrap;
}

.color-buttons,
.tool-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.color-btn {
  width: clamp(25px, 4vw, 35px);
  height: clamp(25px, 4vw, 35px);
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.3s ease;
}

.color-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 0 10px rgba(0,0,0,0.15);
}

.color-btn.active {
  border-color: #34495e;
  transform: scale(1.1);
}

.tool-btn {
  padding: clamp(6px, 1.5vw, 10px) clamp(12px, 3vw, 18px);
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 15px;
  cursor: pointer;
  font-size: clamp(13px, 2.5vw, 15px);
  font-weight: bold;
  transition: all 0.3s ease;
  white-space: nowrap;
}

.tool-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.tool-btn.active {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.slime-canvas-container {
  position: relative;
  width: 100%;
  max-width: 600px;
  margin: 0 auto 30px;
  padding: 20px;
  background: white;
  border-radius: 15px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.05);
  box-sizing: border-box;
}

#slimeCanvas {
  display: block;
  width: 100%;
  height: auto;
  min-height: 250px;
  max-height: 400px;
  border-radius: 10px;
  background: #f8f9fa;
  cursor: grab;
  border: 2px solid #e0e0e0;
  box-sizing: border-box;
}

#slimeCanvas:active {
  cursor: grabbing;
}

.instructions {
  text-align: center;
  margin-top: 15px;
  font-size: 14px;
  color: #7f8c8d;
}

.slime-max {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 5;
  width: 36px;
  height: 36px;
  border: 1px solid #ded3df;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: #56445d;
  font-size: 19px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.slime-max:hover {
  background: #fff;
  transform: scale(1.06);
}

/* 全屏 / 假全屏布局：下拉工具栏 + 画布铺满锁定 */
#slimeGame.slime-fs {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  max-width: none;
  margin: 0;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  overscroll-behavior: none;
}

#slimeGame.slime-fs .game-header,
#slimeGame.slime-fs .slime-controls,
#slimeGame.slime-fs .instructions {
  display: none;
}

/* 点「⚙ 选项」展开完整控制面板（可滚动，不撑爆画布） */
#slimeGame.slime-fs.fs-gear .slime-controls {
  display: flex;
  max-height: 46vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0;
  padding: 8px 10px;
  border-radius: 0;
  box-shadow: none;
}

/* 全屏下拉工具栏 */
.slime-fs-bar {
  display: none;
}

#slimeGame.slime-fs .slime-fs-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
}

#slimeGame.slime-fs .slime-fs-bar select {
  display: none;
}

/* 自定义下拉（参考 usermgr product-dropdown：trigger + menu + mask） */
.fs-drop {
  position: relative;
  flex: 1 1 88px;
  min-width: 0;
}

#slimeGame.slime-fs .fs-trigger {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 8px;
  border: 1px solid #ded3df;
  border-radius: 10px;
  background: #fff;
  color: #56445d;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}

.fs-chevron {
  font-style: normal;
  font-size: 10px;
  opacity: 0.55;
  transition: transform 0.2s;
  flex: none;
}

.fs-drop.open .fs-chevron {
  transform: rotate(180deg);
}

.fs-menu {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 60;
  min-width: 100%;
  width: max-content;
  max-width: 64vw;
  max-height: 46vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 4px;
  background: #fff;
  border: 1px solid #eee2ef;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(60, 40, 60, 0.22);
}

.fs-drop.open .fs-menu {
  display: block;
}

.fs-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  border: none;
  background: none;
  border-radius: 8px;
  color: #56445d;
  font: inherit;
  font-size: 15px;
  white-space: nowrap;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .fs-menu button:hover {
    background: #f6eff6;
  }
}

.fs-menu button.on {
  background: rgba(118, 85, 115, 0.14);
  color: #4a3548;
  font-weight: 600;
}

.fs-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  display: none;
  background: transparent;
  border: none;
  padding: 0;
}

#slimeGame.slime-fs .slime-fs-bar input[type="color"] {
  width: 36px;
  height: 32px;
  padding: 2px;
  border: 1px solid #ded3df;
  border-radius: 10px;
  background: #fff;
  flex: none;
  cursor: pointer;
}

#slimeGame.slime-fs .slime-fs-bar .tool-btn {
  padding: 6px 11px;
  font-size: 13px;
  flex: none;
}

#slimeGame.slime-fs .slime-gear {
  display: inline-flex;
  align-items: center;
  padding: 6px 11px;
  font-size: 13px;
  background: #fff;
  color: #56445d;
  border: 1px solid #ded3df;
  border-radius: 14px;
  cursor: pointer;
  flex: none;
}

#slimeGame.slime-fs.fs-gear .slime-gear {
  background: #765573;
  border-color: #765573;
  color: #fff;
}

#slimeGame.slime-fs .slime-canvas-container {
  flex: 1;
  min-height: 0;
  max-width: none;
  width: auto;
  margin: 0;
  padding: 0;
  background: transparent;
  box-shadow: none;
  border-radius: 0;
}

#slimeGame.slime-fs #slimeCanvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: none;
  border: none;
  border-radius: 0;
  background: transparent;
}

#slimeGame.slime-fs .slime-max {
  top: 10px;
  right: 10px;
}

.game-introduction {
  max-width: 900px;
  margin: 20px auto;
  padding: 20px;
  background: white;
  border-radius: 15px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.05);
  box-sizing: border-box;
}

.game-introduction h3 {
  font-size: 18px;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 2px solid #3498db;
}

.game-introduction p {
  font-size: 14px;
  color: #555;
  line-height: 1.6;
  margin-bottom: 15px;
}

.game-introduction ul {
  margin-left: 20px;
  margin-bottom: 15px;
}

.game-introduction li {
  font-size: 14px;
  color: #555;
  line-height: 1.6;
  margin-bottom: 8px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .game-container {
    margin: 10px;
    padding: 15px;
    border-radius: 15px;
    box-sizing: border-box;
  }
  
  .game-title {
    font-size: 24px;
  }
  
  .slime-controls {
    flex-direction: column;
    gap: 15px;
    align-items: center;
    padding: 15px;
  }
  
  .color-selector,
  .tool-selector {
    width: 100%;
    justify-content: center;
  }
  
  .color-buttons,
  .tool-buttons {
    justify-content: center;
  }
  
  .color-btn {
    width: clamp(30px, 8vw, 40px);
    height: clamp(30px, 8vw, 40px);
  }
  
  .tool-btn {
    padding: clamp(8px, 2vw, 12px) clamp(15px, 4vw, 20px);
    font-size: clamp(13px, 3vw, 15px);
    width: auto;
  }
  
  .slime-canvas-container {
    padding: 15px;
    box-sizing: border-box;
  }
  
  #slimeCanvas {
    height: 300px;
  }
  
  .game-introduction {
    margin: 10px;
    padding: 15px;
    border-radius: 15px;
    box-sizing: border-box;
  }
}

@media (max-width: 480px) {
  .game-container {
    margin: 5px;
    padding: 10px;
    box-sizing: border-box;
  }
  
  .game-title {
    font-size: 20px;
  }
  
  .slime-controls {
    padding: 10px;
  }
  
  #slimeCanvas {
    height: 250px;
  }
  
  .game-introduction {
    margin: 5px;
    padding: 10px;
    box-sizing: border-box;
  }
}
</style>

<script>
export default {
  mounted() {
    this.$nextTick(async () => {
      const canvas = this.$el.querySelector('#slimeCanvas')
      if (canvas) {
        try {
          const { default: SlimeStudio } = await import('../../.vuepress/components/SlimeStudio')
          if (this._isDestroyed || !canvas.isConnected) return
          this.slime = new SlimeStudio(canvas)
        } catch (error) {
          this.$el.querySelector('[data-slime-status]').textContent = '三维工作台未能启动，请启用浏览器硬件加速或换用支持 WebGL 的浏览器。'
          console.error('[史莱姆工坊]', error)
        }
      }
    })
  },
  beforeDestroy() {
    if (this.slime) this.slime.destroy()
  }
}
</script>
