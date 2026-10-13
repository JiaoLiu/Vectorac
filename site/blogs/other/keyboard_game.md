<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />

::: warning 键盘学习游戏

欢迎来到键盘学习游戏！这是一个有趣的教育类游戏，帮助你熟悉键盘布局。
:::

### 游戏目标
- 通过输入正确的键盘按键来射击气球
- 尽可能多地射落气球，获得高分
- 避免让气球升出屏幕，否则会失去生命值

### 操作方式
- **电脑端**：使用键盘输入对应的按键
- **移动端**：点击屏幕上的虚拟键盘输入

### 游戏规则
- 每次游戏有3条生命值
- 每个气球升出屏幕会失去1条生命值
- 射中气球可以获得10分
- 游戏会随着时间推移，气球升起的速度会逐渐加快

---

## 开始游戏

输入昵称（可选）：
<div id="nicknameInput" style="margin-bottom: 15px; text-align: left;">
  <input type="text" id="nickname" placeholder="请输入昵称，不输入则显示为游客" style="padding: 8px; width: 250px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;" />
</div>

<!-- 移动端隐藏输入框，用于触发系统键盘，位置设置在游戏界面背景中间 -->
<input type="text" id="mobileInput" style="position: absolute; opacity: 0; width: 1px; height: 1px; border: none; padding: 0; margin: 0; z-index: 1000; outline: none; left: 50%; top: 50%; transform: translate(-50%, -50%);" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />

<div id="game-container">
  <div id="game-score">得分: <span id="score">0</span></div>
  <div id="game-lives">生命值: <span id="lives">3</span></div>
  <div id="game-controls">
    <button id="start-button" class="game-button">开始游戏</button>
    <button id="pause-button" class="game-button" style="display: none;">暂停游戏</button>
    <button id="restart-button" class="game-button" style="display: none;">重新开始</button>
  </div>
  <canvas id="game-canvas" width="800" height="600"></canvas>
  <div id="virtual-keyboard" class="virtual-keyboard"></div>
</div>

## 历史记录

<div id="historyContainer" style="margin-top: 30px; padding: 20px; border: 2px solid #ddd; border-radius: 10px; background-color: #f9f9f9; max-width: 800px; margin-left: auto; margin-right: auto;">
  <h3 style="margin-top: 0; text-align: left;">游戏成绩</h3>
  <button id="showHistory" style="padding: 8px 16px; background-color: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 15px; display: block;">查看历史记录</button>
  <div id="historyList" style="max-height: 200px; overflow-y: auto;"></div>
</div>

<script>
// 游戏配置
const GAME_CONFIG = {
  canvasWidth: 800,
  canvasHeight: 600,
  balloonSpeed: 0.5,
  balloonSpeedIncrease: 0.01,
  balloonSpawnInterval: 2000,
  arrowSpeed: 5,
  initialLives: 3,
  pointsPerBalloon: 10
};

// 游戏状态
let gameState = {
  score: 0,
  lives: GAME_CONFIG.initialLives,
  balloons: [],
  arrows: [],
  keysPressed: new Set(),
  balloonSpawnTimer: 0,
  gameSpeed: 1
};

// 可用按键（包含所有标准键盘按键）
const AVAILABLE_KEYS = [
  // 字母键
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  // 数字键
  ...'0123456789'.split(''),
  // 特殊字符键
  '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=', '[', ']', '{', '}', ';', ':', "'", '"', ',', '.', '<', '>', '/', '\\', '|', '`',
  // 功能键
  'Space', 'Enter', 'Backspace', 'Tab', 'CapsLock', 'Shift', 'Control', 'Alt', 'Meta', 'ContextMenu'
];

// 获取随机按键（只使用字母和数字键）
function getRandomKey() {
  const letterKeys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const numberKeys = '0123456789'.split('');
  const validKeys = [...letterKeys, ...numberKeys];
  return validKeys[Math.floor(Math.random() * validKeys.length)];
}

// 创建气球
function createBalloon() {
  // 根据屏幕宽度调整气球大小
  const screenWidth = window.innerWidth || document.documentElement.clientWidth;
  const isMobile = screenWidth <= 768;
  const radius = isMobile ? 40 : 30; // 移动端40px，PC端30px
  
  const x = Math.random() * (GAME_CONFIG.canvasWidth - radius * 2) + radius;
  const key = getRandomKey();
  return {
    x: x,
    y: GAME_CONFIG.canvasHeight,
    radius: radius,
    key: key,
    speed: GAME_CONFIG.balloonSpeed * gameState.gameSpeed
  };
}

// 创建弓箭
function createArrow(key) {
  // 找到对应按键的气球位置（只需要存在气球，不需要指定具体哪个）
  const hasBalloon = gameState.balloons.some(b => {
    const match = b.key === key;
    return match;
  });
  if (!hasBalloon) {
    return null;
  }
  
  // 找到第一个对应按键的气球位置作为目标
  const balloon = gameState.balloons.find(b => b.key === key);
  
  return {
    x: GAME_CONFIG.canvasWidth / 2,
    y: GAME_CONFIG.canvasHeight - 50,
    targetX: balloon.x,
    targetY: balloon.y,
    speed: GAME_CONFIG.arrowSpeed,
    key: key,
    timestamp: Date.now() // 添加时间戳，用于自动消失
  };
}

// 游戏主循环
function gameLoop(timestamp) {
  // 检查游戏是否暂停或未开始
  if (!gameControlState.isPlaying || gameControlState.isPaused) {
    return;
  }
  
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  
  // 清空画布
  ctx.clearRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);
  
  // 更新游戏状态
  updateGame(timestamp);
  
  // 渲染游戏元素
  renderGame(ctx);
  
  // 继续游戏循环
  if (gameState.lives > 0) {
    gameControlState.animationId = requestAnimationFrame(gameLoop);
  } else {
    gameOver(ctx);
  }
}

// 更新游戏状态
function updateGame(timestamp) {
  // 生成气球
  if (timestamp - gameState.balloonSpawnTimer > GAME_CONFIG.balloonSpawnInterval) {
    gameState.balloons.push(createBalloon());
    gameState.balloonSpawnTimer = timestamp;
    
    // 逐渐增加游戏难度
    gameState.gameSpeed += GAME_CONFIG.balloonSpeedIncrease;
  }
  
  // 更新气球位置
  gameState.balloons.forEach(balloon => {
    balloon.y -= balloon.speed;
    
    // 气球升出屏幕，失去生命值
    if (balloon.y + balloon.radius < 0) {
      gameState.lives--;
      document.getElementById('lives').textContent = gameState.lives;
    }
  });
  
  // 移除超出屏幕的气球
  gameState.balloons = gameState.balloons.filter(balloon => {
    return !(balloon.y + balloon.radius < 0);
  });
  
  // 更新弓箭位置并检查是否需要提前移除
  const arrowsToRemoveEarly = [];
  
  gameState.arrows.forEach((arrow, index) => {
    // 检查是否还有对应的气球存在
    const hasMatchingBalloon = gameState.balloons.some(b => b.key === arrow.key);
    
    // 如果没有对应的气球了，标记弓箭提前移除
    if (!hasMatchingBalloon) {
      arrowsToRemoveEarly.push(index);
      return; // 跳过位置更新
    }
    
    // 计算弓箭移动方向
    const dx = arrow.targetX - arrow.x;
    const dy = arrow.targetY - arrow.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      arrow.x += (dx / distance) * arrow.speed;
      arrow.y += (dy / distance) * arrow.speed;
    }
  });
  
  // 提前移除没有对应气球的弓箭（从后往前移除）
  for (let i = arrowsToRemoveEarly.length - 1; i >= 0; i--) {
    gameState.arrows.splice(arrowsToRemoveEarly[i], 1);
  }
  
  // 检查弓箭是否击中气球
  const arrowsToRemove = [];
  const balloonsToRemove = [];
  
  for (let i = 0; i < gameState.arrows.length; i++) {
    const arrow = gameState.arrows[i];
    
    for (let j = 0; j < gameState.balloons.length; j++) {
      const balloon = gameState.balloons[j];
      
      // 确保气球和弓箭的键名能够正确匹配
      const arrowKey = arrow.key;
      const balloonKey = balloon.key;
      
      if (balloonKey === arrowKey) {
        const dx = arrow.x - balloon.x;
        const dy = arrow.y - balloon.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 进一步增大碰撞检测范围，特别是对于边缘气球
        if (distance < balloon.radius + 20) {
          // 击中气球
          gameState.score += GAME_CONFIG.pointsPerBalloon;
          document.getElementById('score').textContent = gameState.score;
          
          // 记录需要移除的弓箭和气球
          if (!arrowsToRemove.includes(i)) {
            arrowsToRemove.push(i);
          }
          if (!balloonsToRemove.includes(j)) {
            balloonsToRemove.push(j);
          }
          break;
        }
      }
    }
  }
  
  // 移除弓箭（从后往前移除，避免索引变化问题）
  for (let i = arrowsToRemove.length - 1; i >= 0; i--) {
    gameState.arrows.splice(arrowsToRemove[i], 1);
  }
  
  // 移除气球（从后往前移除，避免索引变化问题）
  for (let j = balloonsToRemove.length - 1; j >= 0; j--) {
    gameState.balloons.splice(balloonsToRemove[j], 1);
  }
  
  // 移除超出屏幕的弓箭或飞行时间过长的弓箭
  const currentTime = Date.now();
  gameState.arrows = gameState.arrows.filter(arrow => {
    const withinBounds = arrow.x >= -50 && arrow.x <= GAME_CONFIG.canvasWidth + 50 &&
                         arrow.y >= -50 && arrow.y <= GAME_CONFIG.canvasHeight + 50;
    const withinTimeLimit = currentTime - arrow.timestamp < 3000; // 3秒后自动消失
    return withinBounds && withinTimeLimit;
  });
}

// 渲染游戏元素
function renderGame(ctx) {
  // 渲染气球
  gameState.balloons.forEach(balloon => {
    // 绘制气球主体
    const gradient = ctx.createRadialGradient(
      balloon.x - 10, balloon.y - 10, 0,
      balloon.x, balloon.y, balloon.radius
    );
    gradient.addColorStop(0, '#ff6b6b');
    gradient.addColorStop(1, '#ee5a52');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(balloon.x, balloon.y, balloon.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制气球高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(balloon.x - 8, balloon.y - 8, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制气球尾巴
    ctx.strokeStyle = '#ee5a52';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(balloon.x, balloon.y + balloon.radius);
    ctx.lineTo(balloon.x + 5, balloon.y + balloon.radius + 15);
    ctx.stroke();
    
    // 绘制按键文字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const displayText = balloon.key === ' ' ? 'SPACE' : 
                         balloon.key === '\n' ? 'ENTER' : 
                         balloon.key;
    ctx.fillText(displayText, balloon.x, balloon.y);
  });
  
  // 渲染弓箭
  gameState.arrows.forEach(arrow => {
    ctx.fillStyle = '#8b4513';
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 2;
    
    // 计算弓箭角度
    const dx = arrow.targetX - arrow.x;
    const dy = arrow.targetY - arrow.y;
    const angle = Math.atan2(dy, dx);
    
    // 保存当前画布状态
    ctx.save();
    
    // 移动到弓箭位置并旋转
    ctx.translate(arrow.x, arrow.y);
    ctx.rotate(angle);
    
    // 绘制箭杆
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
    
    // 绘制箭头
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(15, -5);
    ctx.lineTo(15, 5);
    ctx.closePath();
    ctx.fill();
    
    // 恢复画布状态
    ctx.restore();
  });
  
  // 渲染射手
  renderArcher(ctx);
}

// 渲染射手
function renderArcher(ctx) {
  const archerX = GAME_CONFIG.canvasWidth / 2;
  const archerY = GAME_CONFIG.canvasHeight - 50;
  
  // 绘制射手身体
  ctx.fillStyle = '#4a90e2';
  ctx.beginPath();
  ctx.arc(archerX, archerY, 20, 0, Math.PI * 2);
  ctx.fill();
  
  // 绘制射手头部
  ctx.fillStyle = '#ffcc99';
  ctx.beginPath();
  ctx.arc(archerX, archerY - 25, 15, 0, Math.PI * 2);
  ctx.fill();
  
  // 绘制眼睛
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(archerX - 5, archerY - 27, 3, 0, Math.PI * 2);
  ctx.arc(archerX + 5, archerY - 27, 3, 0, Math.PI * 2);
  ctx.fill();
}

// 游戏结束
function gameOver(ctx) {
  // 更新游戏控制状态
  gameControlState.isPlaying = false;
  
  // 更新按钮状态
  document.getElementById('start-button').style.display = 'none';
  document.getElementById('pause-button').style.display = 'none';
  document.getElementById('restart-button').style.display = 'inline-block';
  
  // 自动获取昵称并保存分数（不弹窗）
  const nicknameInput = document.getElementById('nickname');
  const nickname = nicknameInput ? nicknameInput.value.trim() : '';
  saveScore(nickname || '游客');
  
  // 绘制游戏结束画面
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('游戏结束', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 - 50);
  
  ctx.font = '24px Arial';
  ctx.fillText(`最终得分: ${gameState.score}`, GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 + 10);
  
  ctx.fillText('点击"重新开始"按钮继续游戏', GAME_CONFIG.canvasWidth / 2, GAME_CONFIG.canvasHeight / 2 + 60);
}

// 保存分数
function saveScore(nickname) {
  if (typeof localStorage === 'undefined') {
    return;
  }
  
  try {
    // 获取历史分数
    let scoreHistory = JSON.parse(localStorage.getItem('keyboardGameScores') || '[]');
    
    // 添加新分数记录
    const newScore = {
      score: gameState.score,
      timestamp: new Date().toISOString(),
      nickname: nickname || '游客'
    };
    
    scoreHistory.push(newScore);
    
    // 只保存最近20条记录
    if (scoreHistory.length > 20) {
      scoreHistory = scoreHistory.slice(-20);
    }
    
    // 保存更新后的历史记录
    localStorage.setItem('keyboardGameScores', JSON.stringify(scoreHistory));
  } catch (error) {
    // 静默失败
  }
}

// 显示历史记录
function showHistory() {
  if (typeof localStorage === 'undefined') {
    alert('您的浏览器不支持本地存储功能');
    return;
  }
  
  const historyList = document.getElementById('historyList');
  if (!historyList) {
    return;
  }
  
  try {
    // 获取历史分数
    const scoreHistory = JSON.parse(localStorage.getItem('keyboardGameScores') || '[]');
    
    if (scoreHistory.length === 0) {
      historyList.innerHTML = '<p style="text-align: center; color: #666;">暂无历史记录</p>';
      return;
    }
    
    // 按分数降序排列
    scoreHistory.sort((a, b) => b.score - a.score);
    
    // 创建历史记录HTML
    let historyHTML = '<table style="width: 100%; border-collapse: collapse;">';
    historyHTML += '<thead><tr style="background-color: #f2f2f2;"><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">排名</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">得分</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">昵称</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">时间</th></tr></thead>';
    historyHTML += '<tbody>';
    
    scoreHistory.forEach((record, index) => {
      // 为前三名添加奖牌图标
      let medal = '';
      if (index === 0) medal = '🏅';
      else if (index === 1) medal = '🥈';
      else if (index === 2) medal = '🥉';
      
      const date = new Date(record.timestamp);
      const timeString = date.toLocaleString();
      
      historyHTML += '<tr>';
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${medal}</td>`;
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${record.score}</td>`;
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${record.nickname}</td>`;
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${timeString}</td>`;
      historyHTML += '</tr>';
    });
    
    historyHTML += '</tbody></table>';
    
    historyList.innerHTML = historyHTML;
  } catch (error) {
    historyList.innerHTML = '<p style="text-align: center; color: #ff0000;">读取历史记录失败</p>';
  }
}

// 重置游戏
function resetGame() {
  gameState = {
    score: 0,
    lives: GAME_CONFIG.initialLives,
    balloons: [],
    arrows: [],
    keysPressed: new Set(),
    balloonSpawnTimer: 0,
    gameSpeed: 1
  };
  
  document.getElementById('score').textContent = '0';
  document.getElementById('lives').textContent = '3';
}

// 创建虚拟键盘
function createVirtualKeyboard() {
  try {
    const keyboardElement = document.getElementById('virtual-keyboard');
    
    if (!keyboardElement) {
      return false;
    }
    
    // 清空容器，防止重复创建
    keyboardElement.innerHTML = '';
    
    // 检测是否为移动设备
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 键盘布局
    let keyboardLayout;
    
    if (isMobile) {
      // 移动设备布局：优化布局确保所有键都能正常点击
      keyboardLayout = [
        // 第一排：数字键
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        // 第二排：字母键
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        // 第三排：字母键
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '.'],
        // 第四排：字母键
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
      ];
    } else {
      // 桌面设备布局（标准101/104键布局）
      keyboardLayout = [
        // 第一排：功能键和数字键
        ['~', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
        // 第二排：Tab和字母键
        ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
        // 第三排：Caps Lock和字母键
        ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
        // 第四排：Shift和字母键
        ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
        // 第五排：Ctrl、Win、Alt、空格、Alt、Win、Menu、Ctrl
        ['Ctrl', 'Win', 'Alt', 'SPACE', 'Alt', 'Win', 'Menu', 'Ctrl']
      ];
    }
    
    // 为每行创建一个容器
    keyboardLayout.forEach((rowKeys, rowIndex) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'keyboard-row';
      
      rowKeys.forEach(key => {
        const keyElement = document.createElement('button');
        keyElement.className = 'key-button';
        keyElement.textContent = key;
        
        // 设置不同按键的样式和大小
        switch(key) {
          case 'Backspace':
            keyElement.style.width = '90px';
            break;
          case 'Tab':
            keyElement.style.width = '60px';
            break;
          case 'Caps':
            keyElement.style.width = '70px';
            break;
          case 'Enter':
            keyElement.style.width = '80px';
            break;
          case 'Shift':
            keyElement.style.width = '85px';
            break;
          case 'SPACE':
            keyElement.style.width = '300px';
            keyElement.textContent = 'Space';
            break;
          case 'Ctrl':
          case 'Win':
          case 'Alt':
          case 'Menu':
            keyElement.style.width = '55px';
            break;
          default:
            keyElement.style.width = '45px';
        }
        
        // 设置按键的data-key属性
        let keyData;
        switch(key) {
          case 'SPACE':
            keyData = ' ';
            break;
          case 'Enter':
            keyData = 'Enter';
            break;
          case 'Backspace':
            keyData = 'Backspace';
            break;
          case 'Tab':
            keyData = 'Tab';
            break;
          case 'Caps':
            keyData = 'CapsLock';
            break;
          case 'Shift':
            keyData = 'Shift';
            break;
          case 'Ctrl':
            keyData = 'Control';
            break;
          case 'Win':
            keyData = 'Meta';
            break;
          case 'Alt':
            keyData = 'Alt';
            break;
          case 'Menu':
            keyData = 'ContextMenu';
            break;
          case '\\':
            keyData = '\\';
            break;
          default:
            keyData = key;
        }
        keyElement.dataset.key = keyData;
        
        keyElement.addEventListener('click', function() {
          let key = this.dataset.key;
          // 对于字母键，确保它是大写的
          if (key.length === 1 && /[a-zA-Z]/.test(key)) {
            key = key.toUpperCase();
          }
          handleKeyPress(key);
        });
        
        rowElement.appendChild(keyElement);
      });
      
      keyboardElement.appendChild(rowElement);
    });
    
    return true;
  } catch (error) {
    return false;
  }
}

// 处理键盘按键
function handleKeyPress(key) {
  // 检查游戏是否正在进行
  if (!gameControlState.isPlaying || gameControlState.isPaused) {
    return;
  }
  
  // 对于字母键，确保它是大写的
  if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    key = key.toUpperCase();
  }
  
  // 创建弓箭
  const arrow = createArrow(key);
  if (arrow) {
    gameState.arrows.push(arrow);
  }
  
  // 暂时添加到已按下键集合，然后自动释放（允许连续发射）
  gameState.keysPressed.add(key);
  setTimeout(() => {
    gameState.keysPressed.delete(key);
  }, 100);
}

// 处理键盘释放
function handleKeyRelease(key) {
  gameState.keysPressed.delete(key);
}

// 游戏控制状态
let gameControlState = {
  isPlaying: false,
  isPaused: false,
  animationId: null
};

// 防止重复绑定事件的标记
let eventListenersBound = false;

// 游戏状态初始化
function resetGameState() {
  gameState = {
    score: 0,
    lives: GAME_CONFIG.initialLives,
    balloons: [],
    arrows: [],
    keysPressed: new Set(),
    balloonSpawnTimer: 0,
    gameSpeed: 1
  };
  
  gameControlState = {
    isPlaying: false,
    isPaused: false,
    animationId: null
  };
}

// 强制初始化游戏（用于解决VuePress路由问题）
function forceInitializeGame() {
  // 重置游戏状态
  resetGameState();
  
  // 立即调用初始化
  initializeGame();
  
  // 尝试强制显示虚拟键盘
  const keyboardElement = document.getElementById('virtual-keyboard');
  if (keyboardElement) {
    keyboardElement.style.display = 'block';
    keyboardElement.style.visibility = 'visible';
    keyboardElement.style.opacity = '1';
  }
}

// 初始化游戏
function initGame() {
  // 确保DOM已经加载完成
  if (!document || !document.getElementById) {
    return;
  }
  
  // 创建虚拟键盘 - 确保每次都重新创建
  const keyboardElement = document.getElementById('virtual-keyboard');
  if (keyboardElement) {
    createVirtualKeyboard();
  }
  
  // 每次都重新绑定按钮事件（因为在VuePress路由切换时DOM元素会重新渲染）
    // 绑定游戏控制按钮事件
    const startButton = document.getElementById('start-button');
    const pauseButton = document.getElementById('pause-button');
    const restartButton = document.getElementById('restart-button');
    
    if (startButton) {
      // 移除可能存在的旧事件监听器，然后添加新的
      startButton.removeEventListener('click', startGame);
      startButton.addEventListener('click', startGame);
    }
    
    if (pauseButton) {
      pauseButton.removeEventListener('click', togglePauseGame);
      pauseButton.addEventListener('click', togglePauseGame);
    }
    
    if (restartButton) {
      restartButton.removeEventListener('click', restartGame);
      restartButton.addEventListener('click', restartGame);
    }
    
    // 监听键盘事件
    document.addEventListener('keydown', function(e) {
      // 检查是否在输入框中输入
      // - 如果是昵称输入框(#nickname)，则让浏览器正常处理
      // - 如果是隐藏的移动端输入框(#mobileInput)，则继续处理游戏逻辑
      const activeElement = document.activeElement;
      const isNicknameInput = activeElement && activeElement.id === 'nickname';
      const isMobileInput = activeElement && activeElement.id === 'mobileInput';
      
      if (['INPUT', 'TEXTAREA'].includes(activeElement.tagName) && !isMobileInput) {
        // 如果是昵称输入框，让浏览器正常处理输入
        return;
      }
      
      // 映射e.key到AVAILABLE_KEYS数组中的键名
      let key;
      switch(e.key) {
        case ' ': 
          key = 'Space';
          break;
        case 'Enter':
        case 'Backspace':
        case 'Tab':
        case 'CapsLock':
        case 'Shift':
        case 'Control':
        case 'Alt':
        case 'Meta':
        case 'ContextMenu':
          key = e.key;
          break;
        default:
          // 字母键转为大写，其他键保持原样
          key = e.key.length === 1 && /[a-zA-Z]/.test(e.key) ? e.key.toUpperCase() : e.key;
      }
      
      if (AVAILABLE_KEYS.includes(key)) {
        e.preventDefault();
        // 对于特殊键，将它们转换为我们游戏中使用的键名
        const gameKey = key === 'Space' ? ' ' : 
                        key === 'Enter' ? 'Enter' : 
                        key;
        handleKeyPress(gameKey);
      }
    });
    
    document.addEventListener('keyup', function(e) {
      // 映射e.key到AVAILABLE_KEYS数组中的键名
      let key;
      switch(e.key) {
        case ' ': 
          key = 'Space';
          break;
        case 'Enter':
        case 'Backspace':
        case 'Tab':
        case 'CapsLock':
        case 'Shift':
        case 'Control':
        case 'Alt':
        case 'Meta':
        case 'ContextMenu':
          key = e.key;
          break;
        default:
          // 字母键转为大写，其他键保持原样
          key = e.key.length === 1 && /[a-zA-Z]/.test(e.key) ? e.key.toUpperCase() : e.key;
      }
      
      if (AVAILABLE_KEYS.includes(key)) {
        // 对于特殊键，将它们转换为我们游戏中使用的键名
        const gameKey = key === 'Space' ? ' ' : 
                        key === 'Enter' ? 'Enter' : 
                        key;
        handleKeyRelease(gameKey);
      }
    });
    
    eventListenersBound = true;
}

// 开始游戏
function startGame() {
  gameControlState.isPlaying = true;
  gameControlState.isPaused = false;
  
  // 更新按钮状态
  document.getElementById('start-button').style.display = 'none';
  document.getElementById('pause-button').style.display = 'inline-block';
  document.getElementById('restart-button').style.display = 'none';
  
  // 禁用昵称输入框，防止游戏进行时修改昵称
  const nicknameInput = document.getElementById('nickname');
  if (nicknameInput) {
    nicknameInput.disabled = true;
    nicknameInput.style.opacity = '0.6';
    nicknameInput.style.cursor = 'not-allowed';
  }
  
  // 重置游戏状态
  resetGame();
  
  // 移动端输入处理
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const mobileInput = document.getElementById('mobileInput');
  if (mobileInput && isMobile) {
    // 确保移动设备上能正确弹出虚拟键盘
    // 先点击再聚焦，解决某些移动设备上的兼容性问题
    mobileInput.click();
    mobileInput.focus();
  }
  
  // 开始游戏循环
  gameLoop(0);
}

// 暂停/继续游戏
function togglePauseGame() {
  if (!gameControlState.isPlaying) {
    return;
  }
  
  gameControlState.isPaused = !gameControlState.isPaused;
  
  // 更新按钮文字
  const pauseButton = document.getElementById('pause-button');
  if (pauseButton) {
    pauseButton.textContent = gameControlState.isPaused ? '继续游戏' : '暂停游戏';
  }
  
  // 移动端输入处理
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const mobileInput = document.getElementById('mobileInput');
  
  if (gameControlState.isPaused) {
    // 暂停时失去焦点，关闭键盘
    if (mobileInput && isMobile) {
      mobileInput.blur();
    }
  } else {
    // 继续时重新聚焦到隐藏输入字段
    if (mobileInput && isMobile) {
      mobileInput.focus();
    }
    // 重新开始游戏循环
    gameLoop(0);
  }
}

// 重新开始游戏
function restartGame() {
  // 重置游戏控制状态
  gameControlState.isPlaying = false;
  gameControlState.isPaused = false;
  
  // 重置游戏状态
  resetGame();
  
  // 启用昵称输入框，允许重新输入昵称
  const nicknameInput = document.getElementById('nickname');
  if (nicknameInput) {
    nicknameInput.disabled = false;
    nicknameInput.style.opacity = '1';
    nicknameInput.style.cursor = 'text';
  }
  
  // 更新按钮状态
  document.getElementById('start-button').style.display = 'inline-block';
  document.getElementById('pause-button').style.display = 'none';
  document.getElementById('restart-button').style.display = 'none';
  
  // 清空画布
  const canvas = document.getElementById('game-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, GAME_CONFIG.canvasWidth, GAME_CONFIG.canvasHeight);
    renderArcher(ctx);
  }
}

// 简化的游戏初始化函数
function initializeGame() {
  try {
    // 延迟1秒加载键盘，确保DOM元素已经准备好
    setTimeout(function() {
      // 检查关键元素是否存在
      const gameContainer = document.getElementById('game-container');
      const keyboardContainer = document.getElementById('virtual-keyboard');
      
      // 尝试初始化游戏
      initGame();
      
      // 绑定历史记录按钮点击事件
      const showHistoryButton = document.getElementById('showHistory');
      if (showHistoryButton) {
        showHistoryButton.addEventListener('click', function() {
          showHistory();
        });
      }
    }, 1000);
    
    return true;
  } catch (error) {
    return false;
  }
}


// 移动端系统键盘支持
function initMobileKeyboardSupport() {
  const isMobile = window.innerWidth <= 768;
  const mobileInput = document.getElementById('mobileInput');
  const gameContainer = document.getElementById('game-container');
  
  if (isMobile && mobileInput && gameContainer) {
    // 点击游戏区域时让隐藏input获得焦点，触发系统键盘
    gameContainer.addEventListener('click', function() {
      mobileInput.click();
      mobileInput.focus();
    });
    
    // 处理隐藏输入字段的输入事件，防止输入内容被看到
    mobileInput.addEventListener('input', function(e) {
      e.target.value = '';
    });
    
    // 处理移动设备上的回车键
    mobileInput.addEventListener('keydown', function(e) {
      // 我们已经在document的keydown事件中处理了所有逻辑，这里只需要确保事件冒泡
      // 并阻止默认行为，防止在隐藏字段中产生不必要的换行
      if (e.key === 'Enter') {
        e.preventDefault();
      }
    });
  }
}

// 在客户端环境中初始化游戏
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // 防止重复初始化的标志
  let gameInitialized = false;
  
  // 初始化游戏的函数
  function initGameOnPage() {
    // 检查是否已经初始化过
    if (gameInitialized) {
      return;
    }
    
    // 使用带循环检测的初始化方法
    initGameWithRetry();
    initMobileKeyboardSupport();
    
    // 设置初始化标志为 true
    gameInitialized = true;
  }
  
  // 绑定DOMContentLoaded事件监听器
  document.addEventListener('DOMContentLoaded', function() {
    initGameOnPage();
  });
  
  // 立即调用初始化
  initGameOnPage();
  
  // 游戏容器检查和初始化函数
  function checkAndInitGame(observer) {
    const gameContainer = document.getElementById('game-container');
    const keyboardContainer = document.getElementById('virtual-keyboard');
    
    if (gameContainer || keyboardContainer) {
      // 初始化游戏
      initGameOnPage();
      
      // 如果观察器存在，停止观察
      if (observer) {
        observer.disconnect();
      }
      return true;
    }
    return false;
  }

  // 带循环检测的DOM初始化函数
  function initGameWithRetry() {
    // 立即尝试一次
    if (tryInitGame()) {
      return;
    }
    
    // 如果失败，设置循环检测，每200ms尝试一次
    let retryCount = 0;
    const maxRetries = 50; // 最多尝试50次，总共10秒
    
    window.gameInitializationTimer = setInterval(() => {
      retryCount++;
      
      if (tryInitGame()) {
        clearInterval(window.gameInitializationTimer);
        window.gameInitializationTimer = null;
        return;
      }
      
      // 如果达到最大尝试次数
      if (retryCount >= maxRetries) {
        clearInterval(window.gameInitializationTimer);
        window.gameInitializationTimer = null;
      }
    }, 200);
  }
  
  // 实际执行游戏初始化的函数
  function tryInitGame() {
    const gameContainer = document.getElementById('game-container');
    
    if (gameContainer) {
      // 直接初始化游戏，不调用 initGameOnPage() 避免循环
      initGame();
      return true;
    }
    return false;
  }
  
  // 使用 MutationObserver 监听 DOM 变化，用于单页应用场景（如 VuePress）
  function setupDOMObserver() {
    let observer;
    
    // 立即检查一次
    if (!checkAndInitGame(observer)) {
      // 创建 MutationObserver 实例
      observer = new MutationObserver(function(mutationsList) {
        checkAndInitGame(observer);
      });
      
      // 配置并启动观察器
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    return observer;
  }
  
  // 全局变量存储当前的 observer 实例
  let globalObserver = null;
  
  // 设置路由变化监听器，用于 VuePress 单页应用
  function setupRouteListeners() {
    // 路由变化时的处理函数
    const handleRouteChange = function() {
      // 重置初始化标志，允许重新初始化
      gameInitialized = false;
      // 延迟检查，确保 VuePress 有足够时间渲染页面
      setTimeout(function() {
        // 重新设置 DOM 观察器
        globalObserver = setupDOMObserver();
      }, 1000);
    };
    
    // 添加路由变化事件监听器
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    
    // 对于现代单页应用，也可以监听 visibilitychange 事件
    window.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        // 重置初始化标志，允许重新初始化
        gameInitialized = false;
        setTimeout(function() {
          // 重新设置 DOM 观察器
          globalObserver = setupDOMObserver();
        }, 500);
      }
    });
  }
  
  // 初始化所有监听器
  globalObserver = setupDOMObserver();
  setupRouteListeners();
}
</script>

<style>
#game-container {
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
  background: #f8f9fa;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

#game-controls {
  margin-bottom: 15px;
  text-align: left;
}

.game-button {
  padding: 10px 20px;
  margin: 0 5px;
  font-size: 16px;
  font-weight: bold;
  color: #ffffff;
  background: #007bff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.game-button:hover {
  background: #0056b3;
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 123, 255, 0.3);
}

.game-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 123, 255, 0.2);
}

#game-score, #game-lives {
  display: inline-block;
  margin: 0 15px 10px 0;
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

#game-canvas {
  width: 100%;
  height: auto;
  background: linear-gradient(to bottom, #87CEEB 0%, #E0F6FF 100%);
  border-radius: 8px;
  display: block;
}

.virtual-keyboard {
  margin-top: 20px;
  display: block;
  padding: 10px;
  background: #e9ecef;
  border-radius: 8px;
  text-align: center;
}

.keyboard-row {
  display: flex;
  gap: 5px;
  justify-content: center;
  margin-bottom: 5px;
  flex-wrap: wrap;
}

.keyboard-row:last-child {
  margin-bottom: 0;
}

.key-button {
  padding: 8px 12px;
  font-size: 14px;
  font-weight: bold;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.3s ease;
  min-width: 40px;
  text-align: center;
}

.key-button:hover {
  background: #007bff;
  color: white;
  border-color: #007bff;
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0, 123, 255, 0.3);
}

.key-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 123, 255, 0.2);
}

/* 响应式设计 */
@media (max-width: 768px) {
  #game-container {
    padding: 0;
    margin: 0 auto;
    max-width: 100vw;
    height: auto;
    min-height: auto;
  }
  
  #game-score, #game-lives {
    font-size: 16px;
    margin: 0 10px 8px 0;
  }
  
  .key-button {
    padding: 10px 12px;
    font-size: 14px;
    min-width: 40px;
    min-height: 40px;
  }
  
  .virtual-keyboard {
    padding: 15px;
    text-align: center;
    margin-top: 15px;
  }
  
  .keyboard-row {
    justify-content: center;
    flex-wrap: wrap;
    width: 100%;
    margin-bottom: 10px;
  }
}

@media (max-width: 480px) {
  #game-container {
    padding: 0;
    margin: 0 auto;
    max-width: 100vw;
    height: auto;
    min-height: auto;
  }
  
  #game-score, #game-lives {
    display: block;
    margin: 0 0 5px 0;
  }
  
  .key-button {
    padding: 8px 10px;
    font-size: 12px;
    min-width: 35px;
    min-height: 35px;
    margin: 0 1px 1px 0;
  }
  
  .keyboard-row {
    gap: 3px;
    justify-content: center;
    flex-wrap: wrap;
    width: 100%;
    margin-bottom: 5px;
  }
  
  .virtual-keyboard {
    padding: 10px;
    text-align: center;
    margin-top: 10px;
  }
}
</style>