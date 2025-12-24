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

  updateNodes() {
    let bubblePoppedThisFrame = false;
    
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      
      const centerX = this.width / 2;
      const centerY = this.height / 2;
      const radius = Math.min(this.width, this.height) * 0.4;
      
      const dx = node.x - centerX;
      const dy = node.y - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        const targetX = centerX + (dx / distance) * radius;
        const targetY = centerY + (dy / distance) * radius;
        
        node.vx += (targetX - node.x) * this.spring;
        node.vy += (targetY - node.y) * this.spring;
      }
      
      if (this.isMouseDown) {
        const mouseDx = node.x - this.mouseX;
        const mouseDy = node.y - this.mouseY;
        const mouseDistance = Math.sqrt(mouseDx * mouseDx + mouseDy * mouseDy);
        
        if (mouseDistance < 120 && this.selectedTool === 'pump') {
          const force = this.dragForce * 1.8;
          const angle = Math.atan2(mouseDy, mouseDx);
          const normalizedDistance = mouseDistance / 120;
          const distanceFactor = 1 - normalizedDistance;
          const normalizedForce = force * distanceFactor;
          node.vx -= (mouseDx / mouseDistance) * normalizedForce;
          node.vy -= (mouseDy / mouseDistance) * normalizedForce;
          
          // 按压模式下随机生成气泡
          if (Math.random() < 0.1) {
            this.addRandomBubble();
          }
        } else if (mouseDistance < 70 && this.selectedTool === 'pop' && !bubblePoppedThisFrame) {
          const clickedBubble = this.findNearestBubble(this.mouseX, this.mouseY);
          if (clickedBubble) {
            this.handleBubbleClick(clickedBubble);
            bubblePoppedThisFrame = true;
          }
        }
      }
      
      const prevIndex = (i - 1 + this.nodes.length) % this.nodes.length;
      const nextIndex = (i + 1) % this.nodes.length;
      const prevNode = this.nodes[prevIndex];
      const nextNode = this.nodes[nextIndex];
      
      const prevDx = node.x - prevNode.x;
      const prevDy = node.y - prevNode.y;
      const prevDistance = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
      const idealPrevDistance = (Math.PI * 2 * radius) / this.numNodes;
      
      const nextDx = node.x - nextNode.x;
      const nextDy = node.y - nextNode.y;
      const nextDistance = Math.sqrt(nextDx * nextDx + nextDy * nextDistance);
      const idealNextDistance = idealPrevDistance;
      
      if (prevDistance > idealPrevDistance * 1.2) {
        const correction = (prevDistance - idealPrevDistance) * 0.1;
        node.x -= (prevDx / prevDistance) * correction;
        node.y -= (prevDy / prevDistance) * correction;
        prevNode.x += (prevDx / prevDistance) * correction;
        prevNode.y += (prevDy / prevDistance) * correction;
      }
      
      if (nextDistance > idealNextDistance * 1.2) {
        const correction = (nextDistance - idealNextDistance) * 0.1;
        node.x -= (nextDx / nextDistance) * correction;
        node.y -= (nextDy / nextDistance) * correction;
        nextNode.x += (nextDx / nextDistance) * correction;
        nextNode.y += (nextDy / nextDistance) * correction;
      }
      
      node.vx *= this.damping;
      node.vy *= this.damping;
      
      node.x += node.vx;
      node.y += node.vy;
    }
    
    this.updateBubbles();
  }

  addRandomBubble() {
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxDistance = Math.min(this.width, this.height) * 0.4;
    
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * maxDistance * 0.8;
    const x = centerX + Math.cos(angle) * distance;
    const y = centerY + Math.sin(angle) * distance;
    
    this.bubbles.push({
      x: x,
      y: y,
      radius: 0,
      targetRadius: 15 + Math.random() * 20,
      visible: true,
      alpha: 0,
      isMoving: false,
      animating: true
    });
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
    
    // 创建两个新气泡，带有分裂动画
    this.bubbles.push({
      x: bubble.x + (Math.random() - 0.5) * 30,
      y: bubble.y + (Math.random() - 0.5) * 30,
      radius: 0,
      targetRadius: newRadius,
      visible: true,
      alpha: 0, 
      animating: true
    });
    this.bubbles.push({
      x: bubble.x + (Math.random() - 0.5) * 30,
      y: bubble.y + (Math.random() - 0.5) * 30,
      radius: 0,
      targetRadius: newRadius,
      visible: true,
      alpha: 0, 
      animating: true
    });
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
    
    // 确保nodes数组已初始化
    if (this.nodes && this.nodes.length > 0) {
      for (let i = 0; i < 20; i++) {
        this.decorations.push({
          x: this.width / 2 + (Math.random() - 0.5) * 250,
          y: this.height / 2 + (Math.random() - 0.5) * 250,
          radius: 2 + Math.random() * 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          nodeIndex: Math.floor(Math.random() * this.nodes.length)
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
  
      handleTouchEnd(e) {
      if (e) e.preventDefault();
      this.isMouseDown = false;
      }
  
      handleMouseUp() {
      this.isMouseDown = false;
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
            const bubbleDx = this.mouseX - bubble.x;
            const bubbleDy = this.mouseY - bubble.y;
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
      if (this.selectedTool != 'pop') {
        this.bubbles = [{x: this.width/2, y: this.height/2, radius: 30, visible: true}];
      }
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

  drawBubbles() {
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      if (bubble.visible) {
        this.ctx.beginPath();
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 气泡高光
        this.ctx.beginPath();
        this.ctx.fillStyle = '#E8F4F8';
        this.ctx.arc(bubble.x - bubble.radius * 0.3, bubble.y - bubble.radius * 0.3, bubble.radius * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  drawDecorations() {
    // 确保nodes数组和decorations数组都有元素
    if (!this.nodes || this.nodes.length === 0 || !this.decorations || this.decorations.length === 0) {
      return;
    }
    
    for (let i = 0; i < this.decorations.length; i++) {
      const dec = this.decorations[i];
      const nodeIndex = dec.nodeIndex % this.nodes.length;
      const node = this.nodes[nodeIndex];
      
      // 确保node存在
      if (node && node.x !== undefined && node.y !== undefined) {
        this.ctx.beginPath();
        this.ctx.fillStyle = dec.color;
        this.ctx.arc(node.x, node.y, dec.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  drawBubbles() {
    const currentColor = this.hexToRgb(this.selectedColor);
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i];
      if (bubble.visible) {
        // 使用选择的颜色加透明度
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${0.7 * bubble.alpha})`;
        this.ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 气泡高光
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * bubble.alpha})`;
        this.ctx.arc(bubble.x - bubble.radius * 0.3, bubble.y - bubble.radius * 0.3, bubble.radius * 0.3, 0, Math.PI * 2);
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
    const index = this.bubbles.indexOf(bubble);
    if (index === -1) return;
    
    // 当气泡小于最小尺寸时，直接消失
    if (bubble.radius < 20) {
      this.bubbles.splice(index, 1);
      return;
    }
    
    this.bubbles.splice(index, 1);
    
    const newRadius = bubble.radius * 0.7;
    
    // 创建两个新气泡，带有分裂动画
    this.bubbles.push({
      x: bubble.x + (Math.random() - 0.5) * 30,
      y: bubble.y + (Math.random() - 0.5) * 30,
      radius: 0,
      targetRadius: newRadius,
      visible: true,
      alpha: 0, animating: true
    });
    this.bubbles.push({
      x: bubble.x + (Math.random() - 0.5) * 30,
      y: bubble.y + (Math.random() - 0.5) * 30,
      radius: 0,
      targetRadius: newRadius,
      visible: true,
      alpha: 0, animating: true
    });
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