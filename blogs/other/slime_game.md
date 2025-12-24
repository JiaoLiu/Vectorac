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
      <button class="tool-btn active" data-tool="pump">🔨 按压</button>
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
    this.selectedTool = 'pump';
    this.nodes = [];
    this.decorations = [];
    this.numNodes = 80;
    this.targetPositions = [];
    this.damping = 0.96;
    this.spring = 0.03;
    this.dragForce = 20;
    this.colorMap = [];
    this.bubbles = []; // 默认没有气泡
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
    this.initColorMap();
    
    this.setupEventListeners(); // 添加事件监听
    this.animate(); // 开始动画
    
    console.log('[史莱姆游戏] 游戏初始化完成');
    
    this.bubbles = []; // 默认没有气泡
  }

  adjustCanvasSize() {
    const container = this.canvas.parentElement;
    const containerWidth = container.offsetWidth;
    const containerStyle = window.getComputedStyle(container);
    const padding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    
    this.width = Math.min(containerWidth - padding, 600);
    this.height = this.width * 0.7;
    
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
    
    this.initNodes();
    this.initDecorations();
    this.initColorMap();
    
    this.bubbles = []; // 默认没有气泡
  }

  initNodes() {
    this.nodes = [];
    this.targetPositions = [];
    
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = Math.min(this.width, this.height) * 0.45;
    
    // 使用极坐标均匀分布节点，形成完整的圆形
    const thetaStep = (2 * Math.PI) / this.numNodes;
    for (let i = 0; i < this.numNodes; i++) {
      const theta = i * thetaStep;
      const x = centerX + radius * Math.cos(theta);
      const y = centerY + radius * Math.sin(theta);
      
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

  initColorMap() {
    this.colorMap = [];
    for (let i = 0; i < this.nodes.length; i++) {
      this.colorMap.push({ r: 255, g: 107, b: 157 }); // 默认粉色
    }
  }

  hexToRgb(hex) {
    // 移除#符号
    hex = hex.replace(/^#/, '');
    
    // 处理3个字符的十六进制颜色
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    
    const bigint = parseInt(hex, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  handleBubbleClick(bubble) {
    // 如果气泡半径 >= 20，分裂成小气泡，否则消失
    if (bubble.radius >= 20) {
      this.splitBubble(bubble);
    } else {
      // 小气泡直接消失
      const index = this.bubbles.indexOf(bubble);
      if (index !== -1) {
        this.bubbles.splice(index, 1);
      }
    }
  }

  splitBubble(bubble) {
    // 通过坐标和半径比较找到气泡索引，而不是直接使用 indexOf
    let index = -1;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (Math.abs(b.x - bubble.x) < 0.1 && Math.abs(b.y - bubble.y) < 0.1 && Math.abs(b.radius - bubble.radius) < 0.1) {
        index = i;
        break;
      }
    }
    if (index === -1) return;
    
    // 当气泡小于最小尺寸时，直接消失
    if (bubble.radius < 20) {
      this.bubbles.splice(index, 1);
      return;
    }
    
    this.bubbles.splice(index, 1);
    
    const newRadius = bubble.radius * 0.7;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    // 确定新气泡要绑定的节点
    let nodeIndex;
    if (bubble.nodeIndex !== undefined && this.nodes && this.nodes.length > 0) {
      nodeIndex = bubble.nodeIndex;
    } else {
      nodeIndex = Math.floor(Math.random() * this.nodes.length);
    }
    
    const node = this.nodes[nodeIndex];
    
    // 创建两个新气泡，带有分裂动画，并绑定到同一节点
    for (let i = 0; i < 2; i++) {
      // 计算从节点到中心点的向量
      const dxToCenter = centerX - node.x;
      const dyToCenter = centerY - node.y;
      const distanceToCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
      
      // 将偏移量限制在朝向中心的方向，确保气泡始终在slime内部
      const maxAllowedOffset = Math.max(20, distanceToCenter * 0.7);
      const offsetRatio = (Math.random() * 0.8) + 0.1;
      const offsetDistance = maxAllowedOffset * offsetRatio;
      const offsetAngle = Math.atan2(dyToCenter, dxToCenter);
      
      const offsetX = Math.cos(offsetAngle) * offsetDistance;
      const offsetY = Math.sin(offsetAngle) * offsetDistance;
      
      this.bubbles.push({
        x: centerX,
        y: centerY,
        radius: 0,
        targetRadius: newRadius,
        visible: true,
        alpha: 0,
        animating: true,
        nodeIndex: nodeIndex,
        offsetX: offsetX,
        offsetY: offsetY
      });
    }
  }

  updateBubbles() {
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      
      // 确保气泡有必要的属性
      if (!bubble.targetRadius) {
        // 对于旧的气泡对象（没有 targetRadius），设置初始值
        bubble.targetRadius = bubble.radius;
        bubble.alpha = 1;
        bubble.animating = false;
      }
      
      // 气泡动画：半径从0增加到目标值
      if (bubble.radius < bubble.targetRadius) {
        bubble.radius += (bubble.targetRadius - bubble.radius) * 0.2;
      }
      
      // 透明度动画
      if (bubble.alpha < 1) {
        bubble.alpha += (1 - bubble.alpha) * 0.2;
      }
      
      // 只有动画状态的气泡才执行漂浮动画
      if (bubble.animating) {
        bubble.x += Math.sin(Date.now() * 0.001 + i) * 0.2;
        bubble.y += Math.cos(Date.now() * 0.001 + i) * 0.1;
        
        // 检查动画是否完成，如果完成则停止动画
        if (Math.abs(bubble.radius - bubble.targetRadius) < 0.1 && bubble.alpha > 0.95) {
          bubble.animating = false;
        }
      }
    }
  }

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  mixColors(c1, c2, ratio = 0.5) {
    return {
      r: Math.round(c1.r * (1 - ratio) + c2.r * ratio),
      g: Math.round(c1.g * (1 - ratio) + c2.g * ratio),
      b: Math.round(c1.b * (1 - ratio) + c2.b * ratio)
    };
  }

  initDecorations() {
    this.decorations = [];
    const colors = ['#FFFFFF', '#FFD700', '#FF69B4', '#87CEEB', '#90EE90'];
    const shapes = ['circle', 'star', 'triangle', 'square'];
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    // 确保nodes数组已初始化
    if (this.nodes && this.nodes.length > 0) {
      for (let i = 0; i < 20; i++) {
        // 随机选择一个形状
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        // 为每个装饰分配一个节点索引
        const nodeIndex = Math.floor(Math.random() * this.nodes.length);
        const node = this.nodes[nodeIndex];
        
        // 计算从节点到中心点的向量
        const dxToCenter = centerX - node.x;
        const dyToCenter = centerY - node.y;
        const distanceToCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
        
        // 将偏移量限制在朝向中心的方向，确保装饰始终在slime内部
        // 最大偏移量基于节点到中心的距离，越靠近边缘，允许的偏移量越小
        const maxAllowedOffset = Math.max(10, distanceToCenter * 0.8);
        // 生成朝向中心的随机偏移
        const offsetRatio = (Math.random() * 0.8) + 0.1; // 0.1 到 0.9，确保不会太靠近边缘
        const offsetDistance = maxAllowedOffset * offsetRatio;
        const offsetAngle = Math.atan2(dyToCenter, dxToCenter);
        
        const offsetX = Math.cos(offsetAngle) * offsetDistance;
        const offsetY = Math.sin(offsetAngle) * offsetDistance;
        
        this.decorations.push({
          nodeIndex: nodeIndex,
          radius: 2 + Math.random() * 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          shape: shape,
          offsetX: offsetX,
          offsetY: offsetY
        });
      }
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

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.updateNodes();
    this.updateBubbles(); // 更新气泡动画
    this.drawSlime();
    this.drawBubbles();
    this.drawDecorations();
    requestAnimationFrame(() => this.animate());
  }

  handleMouseMove(e) {
    this.updateMousePosition(e);
  }

  handleTouchMove(e) {
      if (e) e.preventDefault();
      const touch = e && e.touches[0];
      if (!touch) return;
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = touch.clientX - rect.left;
      this.mouseY = touch.clientY - rect.top;
      }
  
      // 创建气泡的独立方法
      createBubbles() {
        if (this.bubbles.length > 5) return;
        const bubbleCount = Math.floor(Math.random() * 10) + 5; // 生成5-14个气泡
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const slimeRadius = Math.min(this.width, this.height) * 0.45; // 史莱姆的实际半径
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const maxBubbleRadius = isMobile ? slimeRadius / 4 : 50; // 移动端最大气泡半径为slime的1/4，PC端50
        this.bubbles = [];
        
        if (this.nodes && this.nodes.length > 0) {
          for (let i = 0; i < bubbleCount; i++) {
              const radius = Math.random() * (maxBubbleRadius - 10) + 10; // 随机半径10到maxBubbleRadius
              // 为每个气泡分配一个节点
              const nodeIndex = Math.floor(Math.random() * this.nodes.length);
              const node = this.nodes[nodeIndex];
              // 获取节点颜色
              const nodeColor = this.colorMap[nodeIndex];
              
              // 计算从节点到中心点的向量
              const dxToCenter = centerX - node.x;
              const dyToCenter = centerY - node.y;
              const distanceToCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
              
              // 将偏移量限制在朝向中心的方向，确保气泡始终在slime内部
              // 最大偏移量基于节点到中心的距离，越靠近边缘，允许的偏移量越小
              const maxAllowedOffset = Math.max(20, distanceToCenter * 0.7);
              // 生成朝向中心的随机偏移
              const offsetRatio = (Math.random() * 0.8) + 0.1; // 0.1 到 0.9，确保不会太靠近边缘
              const offsetDistance = maxAllowedOffset * offsetRatio;
              const offsetAngle = Math.atan2(dyToCenter, dxToCenter);
              
              const offsetX = Math.cos(offsetAngle) * offsetDistance;
              const offsetY = Math.sin(offsetAngle) * offsetDistance;
              
              this.bubbles.push({
              x: centerX,
              y: centerY,
              radius: radius,
              targetRadius: radius,
              visible: true,
              alpha: 1,
              animating: false,
              nodeIndex: nodeIndex,
              offsetX: offsetX,
              offsetY: offsetY,
              color: nodeColor // 添加气泡颜色属性，初始化为节点颜色
              });
          }
        }
      }
  
      handleTouchEnd(e) {
        if (e) e.preventDefault();
        this.isMouseDown = false;
        if (this.selectedTool === 'pump') {
          this.createBubbles(); // 调用创建气泡的方法
        }
      }
  
      handleMouseUp() {
        this.isMouseDown = false;
        if (this.selectedTool === 'pump') {
          this.createBubbles(); // 调用创建气泡的方法
        }
      }
  
      handleTouchStart(e) {
      if (e) e.preventDefault();
      this.isMouseDown = true;
      const touch = e && e.touches[0];
      if (!touch) return;
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = touch.clientX - rect.left;
      this.mouseY = touch.clientY - rect.top;
      }

  updateMousePosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  }

  updateNodes() {
    if (this.isMouseDown) {
      const newColor = this.hexToRgb(this.selectedColor);
      const centerX = this.width / 2;
      const centerY = this.height / 2;
      const ballRadius = Math.min(this.width, this.height) * 0.45;
      
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const dx = this.mouseX - node.x;
        const dy = this.mouseY - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // 颜色叠加功能：无论工具类型，只要鼠标交互就会变色
        if (dist < 120) {
          const currentColor = this.colorMap[i];
          const blendRatio = (1 - dist / 120) * 0.5; // 混合比例，靠近鼠标的地方混合更多新颜色
          const blendedColor = this.mixColors(currentColor, newColor, blendRatio);
          this.colorMap[i] = blendedColor;
        }
        
        // 同时更新气泡颜色：为绑定到该节点的气泡应用相同的颜色叠加
        for (let j = 0; j < this.bubbles.length; j++) {
          const bubble = this.bubbles[j];
          if (bubble.nodeIndex === i) {
            const bubbleX = node.x + bubble.offsetX;
            const bubbleY = node.y + bubble.offsetY;
            const bubbleDx = this.mouseX - bubbleX;
            const bubbleDy = this.mouseY - bubbleY;
            const bubbleDist = Math.sqrt(bubbleDx * bubbleDx + bubbleDy * bubbleDy);
            
            if (bubbleDist < 120) {
              const currentColor = bubble.color || this.colorMap[i];
              const blendRatio = (1 - bubbleDist / 120) * 0.5; // 气泡也使用相同的混合比例
              const blendedColor = this.mixColors(currentColor, newColor, blendRatio);
              bubble.color = blendedColor;
            }
          }
        }
        
        // 根据工具类型应用不同效果
        if (this.selectedTool === 'pump' && dist < 120) {
          // 按压凹陷效果：优化为平滑凹陷，避免放射状撕裂
          // 使用更平滑的力分布，考虑节点与鼠标的相对位置和距离
          const force = (1 - dist / 120) * this.dragForce * 1.8;
          
          // 计算向量方向，并调整力的大小，使凹陷更自然
          if (dist > 0.1) {
            // 添加阻尼效果，防止节点过度分离
            const normalizedForce = force * (1 + dist / 120) * 0.8;
            node.vx -= (dx / dist) * normalizedForce;
            node.vy -= (dy / dist) * normalizedForce;
          }
        } else if (this.selectedTool === 'pop') {
          // 戳破气泡效果：分裂气泡
          // 保存需要处理的气泡索引，避免遍历过程中数组长度变化
          const bubblesToProcess = [...this.bubbles];
          for (let j = 0; j < bubblesToProcess.length; j++) {
            const bubble = bubblesToProcess[j];
            // 根据气泡绑定的 nodeIndex 计算实际位置
            let bubbleX = bubble.x;
            let bubbleY = bubble.y;
            
            if (bubble.nodeIndex !== undefined && this.nodes && this.nodes.length > 0) {
              const nodeIndex = bubble.nodeIndex % this.nodes.length;
              const bubbleNode = this.nodes[nodeIndex];
              bubbleX = bubbleNode.x + bubble.offsetX;
              bubbleY = bubbleNode.y + bubble.offsetY;
            }
            
            const bubbleDx = this.mouseX - bubbleX;
            const bubbleDy = this.mouseY - bubbleY;
            const bubbleDist = Math.sqrt(bubbleDx * bubbleDx + bubbleDy * bubbleDy);
            
            if (bubbleDist < bubble.radius + 10) {
              // 使用 splitBubble 方法来处理气泡分裂，确保动画效果
              this.splitBubble(bubble);
              // 移除 break 语句，允许同时处理多个气泡
            }
          }
        }
      }
    } else {
      // 鼠标释放时，如果是戳破模式则重置气泡
    //   if (this.selectedTool != 'pop') {
    //     this.bubbles = [{x: this.width/2, y: this.height/2, radius: 30, visible: true}];
    //   }
    }
    
    // 添加节点之间的连接力，防止撕裂
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const prevNode = this.nodes[(i - 1 + this.nodes.length) % this.nodes.length];
      const nextNode = this.nodes[(i + 1) % this.nodes.length];
      
      // 连接前一个节点
      const prevDx = prevNode.x - node.x;
      const prevDy = prevNode.y - node.y;
      const prevDist = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
      const idealPrevDist = 2 * Math.PI * Math.min(this.width, this.height) * 0.45 / this.numNodes;
      
      if (prevDist > idealPrevDist * 1.5 || prevDist < idealPrevDist * 0.5) {
        const correction = (prevDist - idealPrevDist) * 0.1;
        node.vx += (prevDx / prevDist) * correction;
        node.vy += (prevDy / prevDist) * correction;
      }
      
      // 连接后一个节点
      const nextDx = nextNode.x - node.x;
      const nextDy = nextNode.y - node.y;
      const nextDist = Math.sqrt(nextDx * nextDx + nextDy * nextDy);
      
      if (nextDist > idealPrevDist * 1.5 || nextDist < idealPrevDist * 0.5) {
        const correction = (nextDist - idealPrevDist) * 0.1;
        node.vx += (nextDx / nextDist) * correction;
        node.vy += (nextDy / nextDist) * correction;
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
    
    // 绘制填充的圆形液体效果
    this.ctx.beginPath();
    
    // 移动到第一个节点
    this.ctx.moveTo(this.nodes[0].x, this.nodes[0].y);
    
    // 绘制平滑的曲线连接所有节点
    for (let i = 1; i < this.nodes.length; i++) {
      const prev = this.nodes[i - 1];
      const curr = this.nodes[i];
      const next = this.nodes[(i + 1) % this.nodes.length];
      
      const cx1 = prev.x + (curr.x - prev.x) / 2;
      const cy1 = prev.y + (curr.y - prev.y) / 2;
      const cx2 = curr.x - (next.x - curr.x) / 2;
      const cy2 = curr.y - (next.y - curr.y) / 2;
      
      this.ctx.bezierCurveTo(cx1, cy1, cx2, cy2, curr.x, curr.y);
    }
    
    // 连接最后一个节点到第一个节点
    const lastNode = this.nodes[this.nodes.length - 1];
    const firstNode = this.nodes[0];
    const secondNode = this.nodes[1];
    const cx1 = lastNode.x + (firstNode.x - lastNode.x) / 2;
    const cy1 = lastNode.y + (firstNode.y - lastNode.y) / 2;
    const cx2 = firstNode.x - (secondNode.x - firstNode.x) / 2;
    const cy2 = firstNode.y - (secondNode.y - firstNode.y) / 2;
    this.ctx.bezierCurveTo(cx1, cy1, cx2, cy2, firstNode.x, firstNode.y);
    
    this.ctx.closePath();
    
    // 计算中心点用于渐变
    let centerX = 0, centerY = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      centerX += this.nodes[i].x;
      centerY += this.nodes[i].y;
    }
    centerX /= this.nodes.length;
    centerY /= this.nodes.length;
    
    // 渐变填充
    const gradient = this.ctx.createRadialGradient(
      centerX - 20, centerY - 20, 0,
      centerX, centerY, Math.min(this.width, this.height) * 0.45
    );
    
    // 计算平均颜色用于渐变
    let avgR = 0, avgG = 0, avgB = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const color = this.colorMap[i];
      avgR += color.r;
      avgG += color.g;
      avgB += color.b;
    }
    avgR /= this.nodes.length;
    avgG /= this.nodes.length;
    avgB /= this.nodes.length;
    
    gradient.addColorStop(0, `rgba(${Math.min(255, avgR + 50)}, ${Math.min(255, avgG + 50)}, ${Math.min(255, avgB + 50)}, 1)`);
    gradient.addColorStop(1, this.rgbToHex(avgR, avgG, avgB));
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
    
    // 绘制高光
    this.ctx.beginPath();
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.arc(centerX - 30, centerY - 30, 50, 0, Math.PI * 2);
    this.ctx.fill();
  }

    drawDecorations() {
    // 确保decorations数组有元素
    if (!this.decorations || this.decorations.length === 0) {
      return;
    }
    
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const slimeRadius = Math.min(this.width, this.height) * 0.45;
    
    for (let i = 0; i < this.decorations.length; i++) {
      const dec = this.decorations[i];
      
      // 根据绑定的节点计算当前装饰位置
      let decX = 0;
      let decY = 0;
      if (dec.nodeIndex !== undefined && this.nodes && this.nodes.length > 0) {
        const nodeIndex = dec.nodeIndex % this.nodes.length;
        const node = this.nodes[nodeIndex];
        decX = node.x + dec.offsetX;
        decY = node.y + dec.offsetY;
        
        // 验证并调整装饰位置，确保始终在slime内部
        const dxToCenter = decX - centerX;
        const dyToCenter = decY - centerY;
        const distanceToCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
        
        if (distanceToCenter > slimeRadius - dec.radius) {
          // 如果装饰超出slime边界，将其移回内部
          const ratio = (slimeRadius - dec.radius) / distanceToCenter;
          decX = centerX + dxToCenter * ratio;
          decY = centerY + dyToCenter * ratio;
        }
      }
      
      this.ctx.fillStyle = dec.color;
      
      // 根据形状绘制装饰
      switch(dec.shape) {
        case 'circle':
          this.drawCircleDecoration({x: decX, y: decY, radius: dec.radius});
          break;
        case 'star':
          this.drawStarDecoration({x: decX, y: decY, radius: dec.radius});
          break;
        case 'triangle':
          this.drawTriangleDecoration({x: decX, y: decY, radius: dec.radius});
          break;
        case 'square':
          this.drawSquareDecoration({x: decX, y: decY, radius: dec.radius});
          break;
        default:
          this.drawCircleDecoration({x: decX, y: decY, radius: dec.radius});
      }
    }
  }
  
  // 绘制圆形装饰
  drawCircleDecoration(dec) {
    this.ctx.beginPath();
    this.ctx.arc(dec.x, dec.y, dec.radius, 0, Math.PI * 2);
    this.ctx.fill();
  }
  
  // 绘制星星装饰
  drawStarDecoration(dec) {
    this.ctx.beginPath();
    const spikes = 5;
    const outerRadius = dec.radius;
    const innerRadius = dec.radius * 0.4;
    
    for (let i = 0; i < spikes * 2; i++) {
      const angle = (i * Math.PI) / spikes - Math.PI / 2; // 调整星星的起始角度
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = dec.x + Math.cos(angle) * radius;
      const y = dec.y + Math.sin(angle) * radius;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  // 绘制三角形装饰
  drawTriangleDecoration(dec) {
    this.ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3 - Math.PI / 2; // 调整三角形的起始角度
      const x = dec.x + Math.cos(angle) * dec.radius;
      const y = dec.y + Math.sin(angle) * dec.radius;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();
  }
  
  // 绘制正方形装饰
  drawSquareDecoration(dec) {
    this.ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI * 2) / 4 - Math.PI / 4; // 调整正方形的起始角度
      const x = dec.x + Math.cos(angle) * dec.radius * Math.sqrt(2);
      const y = dec.y + Math.sin(angle) * dec.radius * Math.sqrt(2);
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  drawBubbles() {
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      if (bubble.visible) {
        // 获取气泡附加的节点位置
        let bubbleX = bubble.x;
        let bubbleY = bubble.y;
        
        if (bubble.nodeIndex !== undefined && this.nodes && this.nodes.length > 0) {
          const nodeIndex = bubble.nodeIndex % this.nodes.length;
          const node = this.nodes[nodeIndex];
          bubbleX = node.x + bubble.offsetX;
          bubbleY = node.y + bubble.offsetY;
        }
        
        // 使用气泡自身的颜色
        const bubbleColor = bubble.color || this.hexToRgb(this.selectedColor);
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(${bubbleColor.r}, ${bubbleColor.g}, ${bubbleColor.b}, ${0.7 * bubble.alpha})`;
        this.ctx.arc(bubbleX, bubbleY, bubble.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 气泡高光
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * bubble.alpha})`;
        this.ctx.arc(bubbleX - bubble.radius * 0.3, bubbleY - bubble.radius * 0.3, bubble.radius * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  findNearestBubble(mx, my) {
    let nearest = null;
    let minDistance = 50; // 最大搜索距离
    
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      const dx = mx - bubble.x;
      const dy = my - bubble.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < bubble.radius + 10 && (nearest === null || distance < minDistance)) {
        nearest = bubble;
        minDistance = distance;
      }
    }
    
    return nearest;
  }

  splitBubble(bubble) {
    // 通过坐标和半径比较找到气泡索引，而不是直接使用 indexOf
    let index = -1;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      if (Math.abs(b.x - bubble.x) < 0.1 && Math.abs(b.y - bubble.y) < 0.1 && Math.abs(b.radius - bubble.radius) < 0.1) {
        index = i;
        break;
      }
    }
    if (index === -1) return;
    
    // 当气泡小于最小尺寸时，直接消失
    if (bubble.radius < 20) {
      this.bubbles.splice(index, 1);
      return;
    }
    
    this.bubbles.splice(index, 1);
    
    const newRadius = bubble.radius * 0.7;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    // 确定新气泡要绑定的节点
    let nodeIndex;
    if (bubble.nodeIndex !== undefined && this.nodes && this.nodes.length > 0) {
      nodeIndex = bubble.nodeIndex;
    } else {
      nodeIndex = Math.floor(Math.random() * this.nodes.length);
    }
    
    const node = this.nodes[nodeIndex];
    
    // 创建两个新气泡，带有分裂动画，并绑定到同一节点
    for (let i = 0; i < 2; i++) {
      // 计算从节点到中心点的向量
      const dxToCenter = centerX - node.x;
      const dyToCenter = centerY - node.y;
      const distanceToCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
      
      // 将偏移量限制在朝向中心的方向，确保气泡始终在slime内部
      const maxAllowedOffset = Math.max(20, distanceToCenter * 0.7);
      const offsetRatio = (Math.random() * 0.8) + 0.1;
      const offsetDistance = maxAllowedOffset * offsetRatio;
      const offsetAngle = Math.atan2(dyToCenter, dxToCenter);
      
      const offsetX = Math.cos(offsetAngle) * offsetDistance;
      const offsetY = Math.sin(offsetAngle) * offsetDistance;
      
      this.bubbles.push({
        x: centerX,
        y: centerY,
        radius: 0,
        targetRadius: newRadius,
        visible: true,
        alpha: 0,
        animating: true,
        nodeIndex: nodeIndex,
        offsetX: offsetX,
        offsetY: offsetY
      });
    }
  }

  updateBubbles() {
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      
      // 气泡动画：半径从0增加到目标值
      if (bubble.radius < bubble.targetRadius) {
        bubble.radius += (bubble.targetRadius - bubble.radius) * 0.2;
      }
      
      // 透明度动画
      if (bubble.alpha < 1) {
        bubble.alpha += (1 - bubble.alpha) * 0.2;
      }
      
      // 只有动画状态的气泡才执行漂浮动画
      if (bubble.animating) {
        bubble.x += Math.sin(Date.now() * 0.001 + i) * 0.2;
        bubble.y += Math.cos(Date.now() * 0.001 + i) * 0.1;
        
        // 检查动画是否完成，如果完成则停止动画
        if (Math.abs(bubble.radius - bubble.targetRadius) < 0.1 && bubble.alpha > 0.95) {
          bubble.animating = false;
        }
      }
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

// 在浏览器环境中初始化
if (isBrowser()) {
  console.log('[史莱姆游戏] 在浏览器环境中，准备初始化...');
  // 设置 DOM 观察器
  globalObserver = setupDOMObserver();
  
  // 设置路由变化监听器
  setupRouteListeners();
}
</script>