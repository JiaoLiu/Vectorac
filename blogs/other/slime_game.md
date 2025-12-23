<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

::: warning 史莱姆模拟解压游戏
一款有趣的解压游戏，模拟真实的史莱姆（起泡胶）手感！软软绵绵，色彩丰富，拖动变形，按压凹陷，戳破气泡，享受减压的乐趣！
:::

<div id="slimeGame" class="game-container">
<div class="game-header">
<div class="game-title">史莱姆解压玩具</div>
<div class="game-stats">
<span>拖动变形 · 按压凹陷 · 戳破气泡 · 色彩混合</span>
</div>
</div>

<div class="slime-controls">
<div class="control-row">
  <div class="color-selector">
    <div class="selector-label">选择颜色:</div>
    <div class="color-buttons">
      <button class="color-btn active" data-color="#FF6B9D" style="background: #FF6B9D;"></button>
      <button class="color-btn" data-color="#4ECDC4" style="background: #4ECDC4;"></button>
      <button class="color-btn" data-color="#FFE66D" style="background: #FFE66D;"></button>
      <button class="color-btn" data-color="#95E1D3" style="background: #95E1D3;"></button>
      <button class="color-btn" data-color="#F38181" style="background: #F38181;"></button>
      <button class="color-btn" data-color="#AA96DA" style="background: #AA96DA;"></button>
    </div>
  </div>
</div>
<div class="control-row">
  <div class="tool-selector">
    <div class="selector-label">工具:</div>
    <div class="tool-buttons">
      <button class="tool-btn active" data-tool="finger">👆 手指</button>
      <button class="tool-btn" data-tool="pump">🔨 按压</button>
      <button class="tool-btn" data-tool="pop">🫧 戳破</button>
    </div>
  </div>
</div>
</div>

<div class="slime-canvas-container">
<canvas id="slimeCanvas"></canvas>
<div class="instructions">
🖱️ 点击并拖动变形 | 📱 触摸互动
</div>
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
// 在浏览器环境中初始化游戏
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', function() {
    console.log('[史莱姆游戏] DOM已加载，准备初始化');
    new SlimeGame();
  });
}

class SlimeGame {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.width = 0;
    this.height = 0;
    this.isMouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.selectedColor = '#FF6B9D';
    this.selectedTool = 'finger';
    this.nodes = [];
    this.decorations = [];
    this.numNodes = 30;
    this.spacing = 18;
    this.targetPositions = [];
    this.damping = 0.97;
    this.spring = 0.05;
    this.dragForce = 8;
    this.init();
  }

  init() {
    console.log('[史莱姆游戏] 初始化游戏实例');
    this.canvas = document.getElementById('slimeCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    if (!this.canvas || !this.ctx) {
      console.error('[史莱姆游戏] 无法获取canvas元素');
      return;
    }

    this.adjustCanvasSize();
    window.addEventListener('resize', () => this.adjustCanvasSize());
    
    this.initNodes();
    this.initDecorations();
    this.setupEventListeners();
    this.animate();
    
    console.log('[史莱姆游戏] 游戏初始化完成');
  }

  adjustCanvasSize() {
    const container = this.canvas.parentElement;
    const containerWidth = container.offsetWidth;
    const containerStyle = window.getComputedStyle(container);
    const padding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    
    this.width = Math.min(containerWidth - padding, 600);
    this.height = this.width * 0.7; // 保持合适的宽高比
    
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
    
    console.log(`[史莱姆游戏] Canvas尺寸调整: ${this.width}x${this.height}`);
    
    this.initNodes();
    this.initDecorations();
  }

  initNodes() {
    this.nodes = [];
    this.targetPositions = [];
    
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = Math.min(this.width, this.height) * 0.4;
    
    for (let i = 0; i < this.numNodes; i++) {
      for (let j = 0; j < this.numNodes; j++) {
        const x = centerX + (j - this.numNodes / 2) * this.spacing;
        const y = centerY + (i - this.numNodes / 2) * this.spacing;
        
        const distToCenter = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (distToCenter < radius) {
          this.nodes.push({
            x: x,
            y: y,
            targetX: x,
            targetY: y,
            vx: 0,
            vy: 0
          });
          
          this.targetPositions.push({ x: x, y: y });
        }
      }
    }
  }

  initDecorations() {
    this.decorations = [];
    const colors = ['#FFFFFF', '#FFD700', '#FF69B4', '#87CEEB', '#90EE90'];
    
    for (let i = 0; i < 15; i++) {
      this.decorations.push({
        x: this.width / 2 + (Math.random() - 0.5) * 250,
        y: this.height / 2 + (Math.random() - 0.5) * 250,
        radius: 3 + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: Math.random() > 0.5 ? 'circle' : 'triangle',
        nodeIndex: Math.floor(Math.random() * this.nodes.length)
      });
    }
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
    
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', () => this.handleTouchEnd());
    this.canvas.addEventListener('touchcancel', () => this.handleTouchEnd());
    
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectedColor = e.target.dataset.color;
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
    
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectedTool = e.target.dataset.tool;
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
  }

  handleMouseDown(e) {
    this.isMouseDown = true;
    this.updateMousePosition(e);
  }

  handleMouseMove(e) {
    this.updateMousePosition(e);
  }

  handleMouseUp() {
    this.isMouseDown = false;
  }

  handleTouchStart(e) {
    e.preventDefault();
    this.isMouseDown = true;
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = touch.clientX - rect.left;
    this.mouseY = touch.clientY - rect.top;
  }

  handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = touch.clientX - rect.left;
    this.mouseY = touch.clientY - rect.top;
  }

  handleTouchEnd(e) {
    e.preventDefault();
    this.isMouseDown = false;
  }

  updateMousePosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.updateNodes();
    this.drawSlime();
    this.drawDecorations();
    requestAnimationFrame(() => this.animate());
  }

  updateNodes() {
    if (this.isMouseDown) {
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const dx = this.mouseX - node.x;
        const dy = this.mouseY - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 80) {
          const force = (1 - dist / 80) * this.dragForce;
          node.vx += (dx / dist) * force;
          node.vy += (dy / dist) * force;
        }
      }
    }
    
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const target = this.targetPositions[i];
      
      const dx = target.x - node.x;
      const dy = target.y - node.y;
      node.vx += dx * this.spring;
      node.vy += dy * this.spring;
      node.vx *= this.damping;
      node.vy *= this.damping;
      
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  drawSlime() {
    if (this.nodes.length === 0) return;
    
    this.ctx.beginPath();
    this.ctx.fillStyle = this.selectedColor;
    this.ctx.globalAlpha = 0.9;
    
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, this.spacing / 2, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    this.ctx.globalAlpha = 1.0;
  }

  drawDecorations() {
    for (let i = 0; i < this.decorations.length; i++) {
      const dec = this.decorations[i];
      const node = this.nodes[dec.nodeIndex % this.nodes.length];
      
      this.ctx.beginPath();
      this.ctx.fillStyle = dec.color;
      this.ctx.arc(node.x, node.y, dec.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

// 初始化史莱姆游戏函数
function initSlimeGame() {
  const canvas = document.getElementById('slimeCanvas');
  if (!canvas) {
    console.error('游戏canvas元素不存在！');
    return false;
  }
  
  try {
    console.log('创建史莱姆游戏实例...');
    new SlimeGame();
    console.log('史莱姆游戏初始化成功！');
    return true;
  } catch (error) {
    console.error('史莱姆游戏初始化失败:', error);
    return false;
  }
}

// 检查游戏容器并初始化
function checkAndInitGame(observer) {
  const canvas = document.getElementById('slimeCanvas');
  const gameContainer = document.getElementById('slimeGame');
  
  console.log('[史莱姆游戏] 检查游戏容器元素:', {canvas: !!canvas, gameContainer: !!gameContainer});
  
  if (canvas && gameContainer) {
    console.log('[史莱姆游戏] 检测到游戏容器，初始化游戏...');
    // 初始化游戏
    initSlimeGame();
    
    // 如果观察器存在，停止观察
    if (observer) {
      console.log('[史莱姆游戏] 停止 DOM 观察器...');
      observer.disconnect();
    }
    return true;
  }
  return false;
}

// 使用 MutationObserver 监听 DOM 变化，用于单页应用场景（如 VuePress）
function setupDOMObserver() {
  console.log('[史莱姆游戏] 设置 DOM 观察器...');
  
  let observer;
  
  // 首先尝试立即初始化
  if (!checkAndInitGame(observer)) {
    // 创建 MutationObserver 实例
    observer = new MutationObserver(function(mutationsList) {
      console.log('[史莱姆游戏] DOM 变化观察到:', mutationsList.length, '个变化');
      checkAndInitGame(observer);
    });
    
    // 开始观察 body 元素的变化
    observer.observe(document.body, { 
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    console.log('[史莱姆游戏] DOM 观察器已启动，正在监听 body 元素变化...');
  }
  
  return observer;
}

// 全局变量存储当前的 observer 实例
let globalObserver = null;

// 设置路由变化监听器，用于 VuePress 单页应用
function setupRouteListeners() {
  console.log('[史莱姆游戏] 设置路由变化监听器...');
  
  // 路由变化时的处理函数
  const handleRouteChange = function() {
    console.log('[史莱姆游戏] 路由变化被检测到，重新设置监听器...');
    // 延迟检查，确保 VuePress 有足够时间渲染页面
    setTimeout(function() {
      // 重新设置 DOM 观察器
      globalObserver = setupDOMObserver();
    }, 1000);
  };
  
  // 添加路由变化事件监听器
  window.addEventListener('hashchange', handleRouteChange);
  window.addEventListener('popstate', handleRouteChange);
  
  console.log('[史莱姆游戏] 路由变化监听器已设置完成');
}

// 检查是否在浏览器环境中
function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// 在多种情况下尝试初始化游戏
if (isBrowser()) {
  // 1. 立即尝试
  console.log('立即尝试初始化...');
  setTimeout(function() {
    if (!checkAndInitGame()) {
      // 如果立即初始化失败，设置 DOM 观察器
      globalObserver = setupDOMObserver();
    }
  }, 200);
  
  // 2. DOMContentLoaded事件
  document.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded 事件触发，初始化游戏...');
    setTimeout(function() {
      checkAndInitGame();
    }, 500);
  });
  
  // 3. 设置路由监听器
  setupRouteListeners();
}
</script>