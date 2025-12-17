<!-- 移动端优化：添加meta标签以控制视口和键盘行为 -->
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

::: warning 键盘打字游戏

一个专业键盘打字学习游戏，通过有趣的游戏方式帮助所有人掌握键盘输入技能。
:::

## 游戏功能

- 🎮 交互式打字练习
- 🏆 得分系统
- ⏰ 计时功能
- 🎯 不同难度级别
- 📊 进度统计

## 开始游戏

选择难度级别：
<div id="difficultySelector" style="margin-bottom: 15px;">
  <label style="margin-right: 15px;">
    <input type="radio" name="difficulty" value="easy" checked /> 简单
  </label>
  <label style="margin-right: 15px;">
    <input type="radio" name="difficulty" value="medium" /> 中等
  </label>
  <label>
    <input type="radio" name="difficulty" value="hard" /> 困难
  </label>
</div>

输入昵称（可选）：
<div id="nicknameInput" style="margin-bottom: 15px;">
  <input type="text" id="nickname" placeholder="请输入昵称，不输入则显示为游客" style="padding: 8px; width: 250px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;" />
</div>

点击下方按钮开始游戏：

<button id="startGame" style="padding: 10px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; pointer-events: auto; user-select: none; transition: all 0.3s ease;">开始游戏</button>
<button id="pauseGame" style="padding: 10px 20px; background-color: #ff9800; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; pointer-events: auto; user-select: none; transition: all 0.3s ease; display: none; margin-left: 10px;">暂停游戏</button>
<button id="stopGame" style="padding: 10px 20px; background-color: #f44336; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; pointer-events: auto; user-select: none; transition: all 0.3s ease; display: none; margin-left: 10px;">停止游戏</button>

<!-- 移动设备键盘触发用的隐藏输入字段 -->
<input type="text" id="mobileInput" style="position: absolute; opacity: 0; width: 1px; height: 1px; border: none; padding: 0; margin: 0; z-index: 1000; outline: none;" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />

## 游戏区域

<div id="gameContainer" style="margin-top: 20px; padding: 15px; border: 2px solid #ddd; border-radius: 10px; background-color: #f9f9f9; max-width: 100%; box-sizing: border-box; min-height: 200px;">
  <div id="scoreDisplay" style="font-size: 20px; font-weight: bold; color: #333; margin-bottom: 10px;">得分: <span id="score">0</span></div>
  <div id="timeDisplay" style="font-size: 18px; color: #666; margin-bottom: 15px;">时间: <span id="time">60</span>秒</div>
  <div id="wordDisplay" style="font-size: 32px; font-weight: bold; text-align: center; margin-bottom: 15px; color: #4CAF50; height: 45px; word-break: break-word;">点击开始按钮</div>
  <div id="inputDisplay" style="font-size: 20px; text-align: center; margin-bottom: 15px; color: #2196F3; height: 25px;"></div>
  <div id="gameStatus" style="font-size: 16px; text-align: center; color: #666;"></div>
</div>

## 游戏说明

1. 点击"开始游戏"按钮开始
2. 屏幕中央会显示一个随机单词
3. 请使用键盘输入对应的单词
4. 输入正确得分增加，自动显示下一个单词
5. 60秒内尽可能多地输入正确单词
6. 游戏结束后显示最终得分

## 历史记录

<div id="historyContainer" style="margin-top: 30px; padding: 20px; border: 2px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
  <h3 style="margin-top: 0;">练习历史</h3>
  <button id="showHistory" style="padding: 8px 16px; background-color: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 15px;">查看历史记录</button>
  <div id="historyList" style="max-height: 200px; overflow-y: auto;"></div>
</div>

<script>
  // 预定义的真实单词列表
  const wordLists = {
    easy: [
      'cat', 'dog', 'hat', 'bed', 'sun', 'man', 'top', 'cup', 'pen', 'car',
      'bus', 'map', 'bag', 'box', 'key', 'fan', 'leg', 'arm', 'eye', 'ear',
      'nose', 'mouth', 'hand', 'foot', 'tree', 'bird', 'fish', 'egg', 'milk', 'rice',
      'cake', 'bread', 'water', 'juice', 'tea', 'coffee', 'apple', 'banana', 'orange', 'grape',
      'pear', 'peach', 'melon', 'tomato', 'potato', 'carrot', 'onion', 'garlic', 'salt', 'sugar',
      'pepper', 'oil', 'butter', 'cheese', 'yogurt', 'honey', 'jam', 'candy', 'chocolate', 'cookie',
      'book', 'pen', 'pencil', 'paper', 'desk', 'chair', 'door', 'window', 'light', 'dark',
      'left', 'right', 'up', 'down', 'in', 'out', 'big', 'small', 'hot', 'cold',
      'warm', 'cool', 'dry', 'wet', 'clean', 'dirty', 'old', 'new', 'good', 'bad',
      'happy', 'sad', 'angry', 'calm', 'fast', 'slow', 'quick', 'high', 'low', 'near'
    ],
    medium: [
      'house', 'water', 'paper', 'pencil', 'window', 'door', 'table', 'chair', 'book', 'phone',
      'clock', 'plant', 'light', 'money', 'friend', 'family', 'school', 'teacher', 'student', 'classroom',
      'blackboard', 'desk', 'chair', 'notebook', 'pencil', 'eraser', 'ruler', 'sharpener', 'backpack', 'uniform',
      'hospital', 'doctor', 'nurse', 'patient', 'medicine', 'pill', 'syringe', 'thermometer', 'bandage', 'stethoscope',
      'store', 'shop', 'market', 'supermarket', 'cashier', 'customer', 'product', 'price', 'sale', 'discount',
      'restaurant', 'cafe', 'bar', 'menu', 'food', 'drink', 'waiter', 'waitress', 'chef', 'cook',
      'hotel', 'room', 'bed', 'bathroom', 'toilet', 'shower', 'towel', 'soap', 'shampoo', 'toothpaste'
    ],
    hard: [
      'computer', 'elephant', 'university', 'guitar', 'mountain', 'restaurant', 'television', 'airplane', 'database', 'algorithm',
      'programming', 'technology', 'psychology', 'philosophy', 'environment', 'education', 'communication', 'information', 'knowledge', 'intelligence',
      'creativity', 'innovation', 'development', 'management', 'organization', 'structure', 'system', 'process', 'method', 'technique',
      'strategy', 'planning', 'implementation', 'evaluation', 'analysis', 'synthesis', 'interpretation', 'understanding', 'application', 'creation',
      'science', 'mathematics', 'physics', 'chemistry', 'biology', 'geography', 'history', 'literature', 'language', 'culture',
      'art', 'music', 'theater', 'film', 'photography', 'design', 'architecture', 'engineering', 'medicine', 'law',
      'politics', 'economy', 'society', 'community', 'family', 'relationship', 'friendship', 'love', 'happiness', 'success'
    ]
  };

  // 初始化游戏状态
  // 只在浏览器环境中设置游戏配置
  if (typeof window !== 'undefined') {
    window.gameConfig = {
    timeLimit: 60,
    // 难度配置
    difficultySettings: {
      easy: { minLength: 3, maxLength: 4, timeLimit: 60 },
      medium: { minLength: 5, maxLength: 6, timeLimit: 60 },
      hard: { minLength: 7, maxLength: 10, timeLimit: 60 }
    },
    selectedDifficulty: 'easy',
    nickname: '',
    currentWord: '',
    userInput: '',
    score: 0,
    timeLeft: 60,
    gameRunning: false,
    gamePaused: false,
    timer: null,
    wordQueue: [] // 用于存储当前游戏会话的单词队列
  };
  }

  // 打乱数组顺序的函数
  function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  // 生成随机单词
  function getRandomWord() {
    // 只在浏览器环境中执行
    if (typeof window === 'undefined') return '';
    const config = window.gameConfig;
    const difficulty = config.selectedDifficulty;
    
    // 如果单词队列为空，重新生成打乱的单词队列
    if (config.wordQueue.length === 0) {
      config.wordQueue = shuffleArray(wordLists[difficulty]);
    }
    
    // 从队列中取出第一个单词
    return config.wordQueue.shift();
  }

  // 辅助函数：禁用游戏控件（难度选择器和昵称输入框）
  function disableGameControls() {
    // 禁用难度选择器
    const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
    difficultyRadios.forEach(radio => {
      radio.disabled = true;
    });
    
    // 禁用昵称输入框
    const nicknameInput = document.getElementById('nickname');
    if (nicknameInput) {
      nicknameInput.disabled = true;
    }
  }
  
  // 辅助函数：启用游戏控件（难度选择器和昵称输入框）
  function enableGameControls() {
    // 启用难度选择器
    const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
    difficultyRadios.forEach(radio => {
      radio.disabled = false;
    });
    
    // 启用昵称输入框
    const nicknameInput = document.getElementById('nickname');
    if (nicknameInput) {
      nicknameInput.disabled = false;
    }
  }
  
  // 开始游戏 - 暴露到全局
  if (typeof window !== 'undefined') {
    window.startGame = function() {
    // 只在浏览器环境中执行
    if (typeof window === 'undefined') return;
    console.log('开始游戏函数被调用');
    
    // 直接获取元素，不依赖initGameElements
    const startButton = document.getElementById('startGame');
    const scoreDisplay = document.getElementById('score');
    const timeDisplay = document.getElementById('time');
    const wordDisplay = document.getElementById('wordDisplay');
    const inputDisplay = document.getElementById('inputDisplay');
    const gameStatus = document.getElementById('gameStatus');
    
    console.log('获取到的元素:', { startButton, scoreDisplay, timeDisplay, wordDisplay, inputDisplay, gameStatus });
    
    // 确保所有必要元素都存在
    if (!startButton || !scoreDisplay || !timeDisplay || !wordDisplay || !inputDisplay || !gameStatus) {
      console.error('游戏元素未找到');
      alert('游戏元素未找到，请刷新页面重试');
      return;
    }
    
    const config = window.gameConfig;
    
    // 获取用户选择的难度级别
    const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked');
    if (selectedDifficulty) {
      config.selectedDifficulty = selectedDifficulty.value;
      console.log('选择的难度:', config.selectedDifficulty);
      
      // 清空单词队列，确保使用新难度的单词列表
      config.wordQueue = [];
      
      // 更新时间限制
      const difficultySettings = config.difficultySettings[config.selectedDifficulty];
      if (difficultySettings) {
        config.timeLimit = difficultySettings.timeLimit;
      }
    }
    
    // 获取用户输入的昵称
    const nicknameInput = document.getElementById('nickname');
    if (nicknameInput) {
      config.nickname = nicknameInput.value.trim() || '';
      console.log('用户昵称:', config.nickname);
    }
    
    if (config.gameRunning) {
      console.log('游戏已经在运行中');
      return;
    }
    
    config.gameRunning = true;
    config.gamePaused = false;
    config.score = 0;
    config.timeLeft = config.timeLimit;
    config.userInput = '';
    
    // 显示暂停和停止按钮，隐藏开始按钮
    const pauseButton = document.getElementById('pauseGame');
    const stopButton = document.getElementById('stopGame');
    if (pauseButton) pauseButton.style.display = 'inline-block';
    if (stopButton) stopButton.style.display = 'inline-block';
    startButton.style.display = 'none';
    
    scoreDisplay.textContent = '0';
    timeDisplay.textContent = config.timeLimit;
    gameStatus.textContent = '游戏进行中...';
    
    // 显示第一个单词
    config.currentWord = getRandomWord();
    wordDisplay.textContent = config.currentWord;
    wordDisplay.style.color = '#4CAF50';
    
    inputDisplay.textContent = '';
    
    // 检测是否为移动设备
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 聚焦到隐藏的输入字段，仅在移动端触发键盘
    const mobileInput = document.getElementById('mobileInput');
    if (mobileInput && isMobile) {
      // 确保移动设备上能正确弹出虚拟键盘
      // 先点击再聚焦，解决某些移动设备上的兼容性问题
      mobileInput.click();
      mobileInput.focus();
      console.log('游戏开始，已聚焦到隐藏输入字段');
      console.log('移动设备检测:', isMobile);
      console.log('mobileInput元素:', mobileInput);
      
      // 键盘弹出后，确保游戏区域保持在可视范围内
      handleKeyboardScroll();
    }
    
    // 清除之前的定时器
    if (config.timer) {
      clearInterval(config.timer);
    }
    
    // 禁用游戏控件
    disableGameControls();
    
    // 开始计时
    config.timer = setInterval(() => {
      config.timeLeft--;
      timeDisplay.textContent = config.timeLeft;
      
      if (config.timeLeft <= 0) {
        endGame();
      }
    }, 1000);
    
    console.log('游戏已开始');
    console.log('游戏控件已禁用');
    
  };
  }

  // 暂停/继续游戏
  if (typeof window !== 'undefined') {
    window.pauseGame = function() {
    // 只在浏览器环境中执行
    if (typeof window === 'undefined') return;
    const config = window.gameConfig;
    if (!config.gameRunning) return;
    
    const pauseButton = document.getElementById('pauseGame');
    const gameStatus = document.getElementById('gameStatus');
    const timeDisplay = document.getElementById('time');
    
    if (config.gamePaused) {
      // 继续游戏
      config.gamePaused = false;
      
      // 重启定时器
      config.timer = setInterval(() => {
        config.timeLeft--;
        if (timeDisplay) timeDisplay.textContent = config.timeLeft;
        
        if (config.timeLeft <= 0) {
          endGame();
        }
      }, 1000);
      
      if (pauseButton) pauseButton.textContent = '暂停游戏';
      if (gameStatus) gameStatus.textContent = '游戏进行中...';
      
      // 检测是否为移动设备
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // 重新聚焦到隐藏输入字段，仅在移动端执行
      const mobileInput = document.getElementById('mobileInput');
      if (mobileInput && isMobile) {
        mobileInput.focus();
        console.log('游戏继续，已重新聚焦到隐藏输入字段');
        
        // 键盘弹出后，确保游戏区域保持在可视范围内
        handleKeyboardScroll();
      }
      
      console.log('游戏已继续');
    } else {
      // 暂停游戏
      config.gamePaused = true;
      clearInterval(config.timer);
      
      if (pauseButton) pauseButton.textContent = '继续游戏';
      if (gameStatus) gameStatus.textContent = '游戏已暂停...';
      
      // 检测是否为移动设备
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // 暂停时失去焦点，关闭键盘，仅在移动端执行
      const mobileInput = document.getElementById('mobileInput');
      if (mobileInput && isMobile) {
        mobileInput.blur();
        console.log('游戏暂停，已从隐藏输入字段失去焦点');
      }
      
      console.log('游戏已暂停');
    }
  };
  }

  // 停止游戏
  if (typeof window !== 'undefined') {
    window.stopGame = function() {
    // 只在浏览器环境中执行
    if (typeof window === 'undefined') return;
    const startButton = document.getElementById('startGame');
    const pauseButton = document.getElementById('pauseGame');
    const stopButton = document.getElementById('stopGame');
    const wordDisplay = document.getElementById('wordDisplay');
    const inputDisplay = document.getElementById('inputDisplay');
    const gameStatus = document.getElementById('gameStatus');
    const config = window.gameConfig;
    
    config.gameRunning = false;
    config.gamePaused = false;
    clearInterval(config.timer);
    config.timer = null;
    
    if (startButton) {
      startButton.style.display = 'inline-block';
      startButton.disabled = false;
      startButton.textContent = '重新开始';
    }
    if (pauseButton) pauseButton.style.display = 'none';
    if (stopButton) stopButton.style.display = 'none';
    
    if (gameStatus) {
      gameStatus.textContent = `游戏结束！最终得分: ${config.score}`;
    }
    
    if (wordDisplay) {
      wordDisplay.textContent = '点击开始按钮';
    }
    
    if (inputDisplay) {
      inputDisplay.textContent = '';
    }
    
    // 检测是否为移动设备
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 停止时失去焦点，关闭键盘，仅在移动端执行
    const mobileInput = document.getElementById('mobileInput');
    if (mobileInput && isMobile) {
      mobileInput.blur();
      console.log('游戏停止，已从隐藏输入字段失去焦点');
    }
    
    // 启用游戏控件
    enableGameControls();
    
    console.log('游戏已停止，得分:', config.score);
    console.log('游戏控件已启用');
    
  };
  }

  // 结束游戏（内部使用）
  function endGame() {
    // 只在浏览器环境中执行
    if (typeof window === 'undefined') return;
    const config = window.gameConfig;
    
    // 保存分数到localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        // 获取历史分数
        let scoreHistory = JSON.parse(localStorage.getItem('typingGameScores') || '[]');
        
        // 添加新分数记录
        const newScore = {
          score: config.score,
          difficulty: config.selectedDifficulty,
          timestamp: new Date().toISOString(),
          timeUsed: config.timeLimit - config.timeLeft,
          nickname: config.nickname || '游客'
        };
        
        scoreHistory.push(newScore);
        
        // 只保存最近20条记录
        if (scoreHistory.length > 20) {
          scoreHistory = scoreHistory.slice(-20);
        }
        
        // 保存更新后的历史记录
        localStorage.setItem('typingGameScores', JSON.stringify(scoreHistory));
        console.log('分数已保存到localStorage');
      } catch (error) {
        console.error('保存分数失败:', error);
      }
    }
    
    window.stopGame();
  }

  // 显示历史记录
  function showHistory() {
    if (typeof localStorage === 'undefined') {
      alert('您的浏览器不支持本地存储功能');
      return;
    }
    
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    try {
      // 获取历史分数
      const scoreHistory = JSON.parse(localStorage.getItem('typingGameScores') || '[]');
      
      if (scoreHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #666;">暂无历史记录</p>';
        return;
      }
      
      // 按分数降序排列
    scoreHistory.sort((a, b) => b.score - a.score);
    
    // 创建历史记录HTML
    let historyHTML = '<table style="width: 100%; border-collapse: collapse;">';
    historyHTML += '<thead><tr style="background-color: #f2f2f2;"><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">排名</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">得分</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">昵称</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">难度</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">用时</th><th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">时间</th></tr></thead>';
    historyHTML += '<tbody>';
    
    scoreHistory.forEach((record, index) => {
      const difficultyNames = { easy: '简单', medium: '中等', hard: '困难' };
      const date = new Date(record.timestamp);
      const timeString = date.toLocaleString();
      
      // 为前三名添加奖牌图标
      let medal = '';
      if (index === 0) medal = '🏅';
      else if (index === 1) medal = '🥈';
      else if (index === 2) medal = '🥉';
      
      historyHTML += '<tr>';
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${medal}</td>`;
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${record.score}</td>`;
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${record.nickname || '游客'}</td>`;
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${difficultyNames[record.difficulty] || record.difficulty}</td>`;
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${record.timeUsed}秒</td>`;
      historyHTML += `<td style="padding: 8px; border-bottom: 1px solid #ddd;">${timeString}</td>`;
      historyHTML += '</tr>';
    });
      
      historyHTML += '</tbody></table>';
      
      historyList.innerHTML = historyHTML;
    } catch (error) {
      console.error('读取历史记录失败:', error);
      historyList.innerHTML = '<p style="text-align: center; color: #ff0000;">读取历史记录失败</p>';
    }
  }

  // 处理键盘输入
  function handleKeyDown(event) {
    // 只在浏览器环境中执行
    if (typeof window === 'undefined') return;
    const config = window.gameConfig;
    if (!config.gameRunning || config.gamePaused) return;
    
    const scoreDisplay = document.getElementById('score');
    const wordDisplay = document.getElementById('wordDisplay');
    const inputDisplay = document.getElementById('inputDisplay');
    
    // 处理移动设备和桌面设备的键盘事件差异
    let key = event.key;
    
    // 移动设备兼容性处理
    if (!key && event.keyCode) {
      // 根据keyCode获取字符
      if (event.keyCode >= 65 && event.keyCode <= 90) { // A-Z
        key = String.fromCharCode(event.keyCode).toLowerCase();
      } else if (event.keyCode === 13) { // Enter
        key = 'Enter';
      } else if (event.keyCode === 8) { // Backspace
        key = 'Backspace';
      }
    }
    
    // 忽略特殊键
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    
    console.log('键盘事件:', key);
    
    if (key === 'Enter') {
      // 检查输入是否为空
      if (config.userInput === '') {
        // 如果输入为空，不做任何操作
        event.preventDefault();
        return;
      }
      
      // 检查输入是否正确
      if (config.userInput === config.currentWord) {
        // 输入正确，处理逻辑（实时检查已经处理了大部分情况，但这里保留作为备用）
        // 由于实时检查已经更新了分数和单词，这里不需要重复处理
        console.log('Enter键确认正确输入');
      } else {
        // 输入错误，高亮显示
        if (wordDisplay) {
          wordDisplay.style.color = '#ff0000';
          setTimeout(() => {
            wordDisplay.style.color = '#4CAF50';
          }, 500);
        }
        // 清空输入，让用户重新开始
        config.userInput = '';
        if (inputDisplay) inputDisplay.textContent = '';
      }
      event.preventDefault();
    } else if (key === 'Backspace') {
      // 删除最后一个字符
      config.userInput = config.userInput.slice(0, -1);
      if (inputDisplay) inputDisplay.textContent = config.userInput;
      event.preventDefault();
    } else if (key && key.length === 1 && /^[a-zA-Z]$/.test(key)) {
      // 添加字符（仅字母）
      config.userInput += key.toLowerCase();
      if (inputDisplay) inputDisplay.textContent = config.userInput;
      
      // 实时检查输入
      if (config.userInput === config.currentWord) {
        // 立即处理正确输入，不延迟
        config.score++;
        if (scoreDisplay) scoreDisplay.textContent = config.score;
        
        config.currentWord = getRandomWord();
        if (wordDisplay) wordDisplay.textContent = config.currentWord;
        
        config.userInput = '';
        if (inputDisplay) inputDisplay.textContent = '';
      } else if (!config.currentWord.startsWith(config.userInput)) {
        // 输入错误，高亮显示
        if (inputDisplay) {
          inputDisplay.style.color = '#ff0000';
          setTimeout(() => {
            inputDisplay.style.color = '#2196F3';
          }, 500);
        }
      }
    }
  }

  // 页面加载完成后初始化
  if (typeof window !== 'undefined') {
    // 使用立即执行函数确保代码在浏览器环境中运行
    (function() {
      console.log('打字游戏脚本已加载');
      
      // 移动设备检测函数
      function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      }
      
      // 移动端键盘弹出时的滚动处理函数
      function handleKeyboardScroll() {
        if (!isMobileDevice()) return;
        
        // 延迟执行，确保键盘已完全弹出
      setTimeout(() => {
        const gameContainer = document.getElementById('gameContainer');
        if (gameContainer) {
          // 将游戏区域滚动到可视范围内
          gameContainer.scrollIntoView({ 
            behavior: 'auto', 
            block: 'center', 
            inline: 'center' 
          });
          console.log('键盘弹出，已滚动到游戏区域');
        }
      }, 300);
      }
      
      // 确保DOM完全加载
      function waitForDOM() {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initGameUI);
        } else {
          initGameUI();
        }
      }
      
      // 初始化游戏UI
      function initGameUI() {
        console.log('初始化游戏UI');
        
        // 直接获取所有需要的元素
        const startButton = document.getElementById('startGame');
        const scoreDisplay = document.getElementById('score');
        const timeDisplay = document.getElementById('time');
        const wordDisplay = document.getElementById('wordDisplay');
        const inputDisplay = document.getElementById('inputDisplay');
        const gameStatus = document.getElementById('gameStatus');
        
        console.log('初始化时获取到的元素:', { startButton, scoreDisplay, timeDisplay, wordDisplay, inputDisplay, gameStatus });
        
        // 确保所有元素都存在
        if (startButton && scoreDisplay && timeDisplay && wordDisplay && inputDisplay && gameStatus) {
          // 设置初始状态
          // 只更新分数和时间的数值部分，保留描述文本
          document.getElementById('score').textContent = '0';
          document.getElementById('time').textContent = typeof window !== 'undefined' && window.gameConfig ? window.gameConfig.timeLimit : '60';
          wordDisplay.textContent = '点击开始按钮';
          inputDisplay.textContent = '';
          gameStatus.textContent = '游戏已准备就绪，点击开始按钮';
          
          // 按钮样式和事件
          startButton.style.cursor = 'pointer';
          startButton.style.transition = 'all 0.3s ease';
          startButton.disabled = false;
          
          // 按钮点击事件监听
          startButton.addEventListener('click', function() {
            console.log('按钮点击事件被触发');
            window.startGame();
          });
          
          // 检测是否为移动设备
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          
          // 游戏区域点击事件，用于移动端触发键盘
          const gameContainer = document.getElementById('gameContainer');
          const mobileInput = document.getElementById('mobileInput');
          
          if (gameContainer && mobileInput && isMobile) {
            gameContainer.addEventListener('click', function() {
              // 只要是移动设备，点击游戏区域就触发键盘
              // 无论游戏是否运行，这样用户可以在开始前就准备好输入
              mobileInput.click();
              mobileInput.focus();
              console.log('游戏区域被点击，已聚焦到隐藏输入字段');
              console.log('移动设备检测:', isMobile);
              console.log('游戏运行状态:', window.gameConfig ? window.gameConfig.gameRunning : '未初始化');
              console.log('游戏暂停状态:', window.gameConfig ? window.gameConfig.gamePaused : '未初始化');
            });
          }
          
          // 键盘事件监听
          document.addEventListener('keydown', handleKeyDown);
          
          // 暂停和停止按钮事件监听
          const pauseButton = document.getElementById('pauseGame');
          const stopButton = document.getElementById('stopGame');
          if (pauseButton) {
            pauseButton.addEventListener('click', function() {
              window.pauseGame();
            });
          }
          if (stopButton) {
            stopButton.addEventListener('click', function() {
              window.stopGame();
            });
          }
          
          // 历史记录按钮事件监听
          const showHistoryButton = document.getElementById('showHistory');
          if (showHistoryButton) {
            showHistoryButton.addEventListener('click', function() {
              showHistory();
            });
          }
          
          // 处理隐藏输入字段的输入事件，防止输入内容被看到，仅在移动端执行
          if (mobileInput && isMobile) {
            mobileInput.addEventListener('input', function(e) {
              // 清除输入内容，因为我们不需要在隐藏字段中保留任何内容
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
            
            // 添加focus事件监听器，确保每次获得焦点时触发滚动处理
            mobileInput.addEventListener('focus', function() {
              handleKeyboardScroll();
            });
          }
          
          console.log('游戏UI初始化完成');
        } else {
          console.error('游戏元素未找到，1秒后重试');
          setTimeout(waitForDOM, 1000);
        }
      }
      
      waitForDOM();
    })();
  }
</script>
