::: warning 数独游戏

数独是一款经典的逻辑推理游戏，通过填充数字1-9到9x9的网格中，使每行、每列和每个3x3小宫格内的数字都不重复。
:::

<div id="sudoku-game" class="game-container">
  <div class="game-header">
    <div class="game-title">数独</div>
    <div class="game-stats">
      <span>难度: <div class="difficulty-selector">
        <button id="difficulty-btn" class="difficulty-btn">中等</button>
        <div id="difficulty-menu" class="difficulty-menu">
          <div class="difficulty-item" data-value="easy">简单</div>
          <div class="difficulty-item" data-value="medium">中等</div>
          <div class="difficulty-item" data-value="hard">困难</div>
        </div>
      </div></span>
      <span id="game-timer" class="game-timer">时间: 00:00</span>
      <span id="best-time" class="best-time">最佳: --:--</span>
      <button id="new-game-btn" class="btn-new-game">新游戏</button>
      <button id="hint-btn" class="btn-hint">提示</button>
      <button id="solve-btn" class="btn-solve">解答</button>
    </div>
  </div>
  
  <div class="sudoku-board" id="sudoku-board"></div>
  <div id="victory-banner" class="victory-banner"></div>
  
  <div class="number-selector">
    <h4>选择数字</h4>
    <div class="number-buttons">
      <button class="number-btn" data-number="1">1</button>
      <button class="number-btn" data-number="2">2</button>
      <button class="number-btn" data-number="3">3</button>
      <button class="number-btn" data-number="4">4</button>
      <button class="number-btn" data-number="5">5</button>
      <button class="number-btn" data-number="6">6</button>
      <button class="number-btn" data-number="7">7</button>
      <button class="number-btn" data-number="8">8</button>
      <button class="number-btn" data-number="9">9</button>
      <button class="number-btn" data-number="0">清空</button>
    </div>
  </div>
  
  <div class="game-info">
    <h3>游戏目标</h3>
    <p>填充9x9网格，使每行、每列和每个3x3小宫格内的数字1-9都不重复。</p>
    <h3>操作方式</h3>
    <ul>
      <li>点击空白格子选择要填充的位置</li>
      <li>使用数字键盘或点击下方的数字按钮输入数字</li>
      <li>点击清空按钮或按Delete键清除选中格子的数字</li>
      <li>点击提示按钮获得当前选中格子的正确答案</li>
      <li>点击解答按钮查看完整答案</li>
    </ul>
  </div>
</div>

<style>
.sudoku-board {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  grid-template-rows: repeat(9, 1fr);
  width: 450px;
  height: 450px;
  margin: 20px auto;
  border: 3px solid #2c3e50;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
}

.sudoku-cell {
  border: 1px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: white;
}

.sudoku-cell:hover {
  background-color: #f8f9fa;
}

.sudoku-cell.selected {
  background-color: #e3f2fd;
  border: 2px solid #2196F3;
}

.sudoku-cell.fixed {
  color: #2c3e50;
  background-color: #f5f5f5;
}

.sudoku-cell.user-input {
  color: #2196F3;
  font-weight: bold;
}

/* 高亮辅助：同行/同列/同宫 */
.sudoku-cell.related {
  background-color: #f0f7ff;
}

/* 高亮辅助：相同数字 */
.sudoku-cell.same-number {
  background-color: #d6e9ff;
}

.sudoku-cell.error {
  background-color: #ffebee;
  color: #c62828;
}

.sudoku-cell.hint {
  background-color: #e8f5e9;
  color: #2e7d32;
}

/* 选中格保持最突出（置于其他底色规则之后） */
.sudoku-cell.selected {
  background-color: #bbdefb;
  border: 2px solid #2196F3;
  box-shadow: inset 0 0 0 1px #2196F3;
}

/* 生成中占位 */
.sudoku-board .generating {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #888;
}

/* 计时与最佳成绩 */
.game-timer, .best-time {
  font-size: 14px;
  font-weight: bold;
  color: #555;
  white-space: nowrap;
}

.best-time {
  color: #FF9800;
}

/* 胜利横幅 */
.victory-banner {
  display: none;
  max-width: 450px;
  margin: 0 auto 15px;
  padding: 14px 20px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4CAF50, #45a049);
  color: white;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4);
}

.victory-banner.show {
  display: block;
  animation: bannerPop 0.5s ease;
}

.victory-banner .banner-record {
  color: #ffe082;
}

@keyframes bannerPop {
  0% {
    opacity: 0;
    transform: translateY(-15px) scale(0.95);
  }
  60% {
    opacity: 1;
    transform: translateY(3px) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 粗边框用于分隔3x3宫格 */
.sudoku-cell:nth-child(3n):not(:nth-child(9n)) {
  border-right: 2px solid #2c3e50;
}

.sudoku-cell:nth-child(n+19):nth-child(-n+27),
.sudoku-cell:nth-child(n+46):nth-child(-n+54) {
  border-bottom: 2px solid #2c3e50;
}

.number-selector {
  text-align: center;
  margin: 20px 0;
}

.number-buttons {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.number-btn {
  width: 50px;
  height: 50px;
  font-size: 16px;
  font-weight: bold;
  border: 2px solid #ddd;
  border-radius: 8px;
  background-color: white;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  white-space: nowrap;
}

.number-btn:hover {
  background-color: #2196F3;
  color: white;
  border-color: #2196F3;
}

.number-btn:active {
  transform: scale(0.95);
}

/* 清空按钮特殊样式 */
.number-btn[data-number="0"] {
  width: auto;
  min-width: 60px;
  font-size: 14px;
  padding: 0 10px;
}

/* 自定义难度选择器样式 */
.difficulty-selector {
  position: relative;
  display: inline-block;
}

.difficulty-btn {
  padding: 8px 24px 8px 12px;
  font-size: 14px;
  font-weight: bold;
  border: 2px solid #ddd;
  border-radius: 5px;
  background-color: white;
  cursor: pointer;
  color: #333;
  position: relative;
  transition: all 0.2s ease;
}

.difficulty-btn:hover {
  border-color: #2196F3;
  background-color: #f8f9fa;
}

.difficulty-btn::after {
  content: '▼';
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #666;
}

.difficulty-menu {
  position: absolute;
  top: 100%;
  left: 0;
  background-color: white;
  border: 2px solid #ddd;
  border-radius: 5px;
  margin-top: 5px;
  min-width: 100px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  display: none;
  z-index: 1000;
  animation: slideDown 0.3s ease;
}

.difficulty-menu.show {
  display: block;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.difficulty-item {
  padding: 10px 15px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  text-align: center;
}

.difficulty-item:hover {
  background-color: #e3f2fd;
  color: #2196F3;
}

/* 响应式难度选择器 */
@media (max-width: 600px) {
  .difficulty-selector {
    position: relative;
    display: inline-block;
    min-width: 80px;
  }
  
  .difficulty-btn {
    font-size: 12px;
    padding: 6px 20px 6px 10px;
    width: 80px;
  }
  
  .difficulty-menu {
    min-width: 80px;
    left: 0;
    transform: none;
    position: absolute;
    top: 100%;
    margin-top: 5px;
  }
  
  .difficulty-item {
    padding: 8px 10px;
    font-size: 12px;
  }
}

/* 美化难度按钮箭头 */
.difficulty-btn::after {
  content: '▼';
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%) scale(0.8);
  font-size: 8px;
  color: #888;
  transition: transform 0.2s ease;
}

.difficulty-btn:hover::after {
  transform: translateY(-50%) scale(0.8) rotate(180deg);
  color: #2196F3;
}

.game-header {
  text-align: center;
  margin-bottom: 20px;
}

.game-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 10px;
}

.game-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.btn-new-game, .btn-hint, .btn-solve {
  padding: 8px 16px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.2s ease;
}

.btn-new-game {
  background-color: #4CAF50;
  color: white;
}

.btn-new-game:hover {
  background-color: #45a049;
}

.btn-hint {
  background-color: #FF9800;
  color: white;
}

.btn-hint:hover {
  background-color: #f57c00;
}

.btn-solve {
  background-color: #f44336;
  color: white;
}

.btn-solve:hover {
  background-color: #da190b;
}

/* 响应式设计 */
@media (max-width: 600px) {
  .sudoku-board {
    width: 280px;
    height: 280px;
    margin: 10px auto;
  }
  
  .sudoku-cell {
    font-size: 14px;
  }
  
  .number-btn {
    width: 35px;
    height: 35px;
    font-size: 14px;
  }
  
  /* 清空按钮在移动端的特殊样式 */
  .number-btn[data-number="0"] {
    width: auto;
    min-width: 70px;
    font-size: 14px;
    padding: 0 12px;
  }
  
  /* 游戏统计栏在移动端 */
  .game-stats {
    gap: 10px;
    flex-direction: column;
  }
  
  /* 游戏标题在移动端 */
  .game-title {
    font-size: 20px;
  }
  
  /* 按钮在移动端 */
  .btn-new-game, .btn-hint, .btn-solve {
    padding: 10px 20px;
    font-size: 16px;
    width: 120px;
  }
}
</style>

<script>
class SudokuGame {
  constructor() {
    this.board = [];
    this.solution = [];
    this.selectedCell = null;
    this.difficulty = 'medium';
    this.hintsUsed = 0;
    this.initialBoard = []; // 保存初始棋盘用于区分用户输入
    this.eventsSet = false; // 标记是否已经设置过事件监听器
    this.timerInterval = null; // 计时器
    this.elapsedSeconds = 0; // 已用时间（秒）
    this.solved = false; // 是否使用过解答（使用解答后不计成绩）
    this.gameOver = false; // 本局是否已结束
    this.init();
  }

  init() {
    // 延迟设置事件监听器，确保DOM完全渲染
    setTimeout(() => {
      // 只设置一次事件监听器
      if (!this.eventsSet) {
        this.setupEventListeners();
        this.eventsSet = true;
      }
      this.newGame();
    }, 50);
  }

  setupEventListeners() {
    // 难度选择按钮
    const difficultyBtn = document.getElementById('difficulty-btn');
    const difficultyMenu = document.getElementById('difficulty-menu');
    
    if (difficultyBtn && difficultyMenu) {
      difficultyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        difficultyMenu.classList.toggle('show');
      });
    }
    
    // 难度菜单项
    const difficultyItems = document.querySelectorAll('.difficulty-item');
    difficultyItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = item.dataset.value;
        this.difficulty = value;
        if (difficultyBtn) {
          difficultyBtn.textContent = item.textContent;
        }
        if (difficultyMenu) {
          difficultyMenu.classList.remove('show');
        }
        this.newGame();
      });
    });
    
    // 点击外部关闭菜单
    document.addEventListener('click', (e) => {
      if (difficultyMenu && !difficultyBtn.contains(e.target) && !difficultyMenu.contains(e.target)) {
        difficultyMenu.classList.remove('show');
      }
    });
    
    // 阻止菜单内部点击事件冒泡
    if (difficultyMenu) {
      difficultyMenu.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // 新游戏按钮
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
      newGameBtn.addEventListener('click', () => {
        this.newGame();
      });
    }

    // 提示按钮
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        this.giveHint();
      });
    }

    // 解答按钮
    const solveBtn = document.getElementById('solve-btn');
    if (solveBtn) {
      solveBtn.addEventListener('click', () => {
        this.solveGame();
      });
    }

    // 数字按钮
    const numberBtns = document.querySelectorAll('.number-btn');
    if (numberBtns) {
      numberBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const number = parseInt(e.target.dataset.number);
          this.inputNumber(number);
        });
      });
    }

    // 键盘输入
    document.addEventListener('keydown', (e) => {
      if (e.key >= '1' && e.key <= '9') {
        this.inputNumber(parseInt(e.key));
      } else if (e.key === '0' || e.key === 'Delete' || e.key === 'Backspace') {
        this.inputNumber(0);
      }
    });
  }

  newGame() {
    this.stopTimer();
    this.hideVictoryBanner();
    
    // 生成期间显示占位，避免用户误以为卡死
    const boardElement = document.getElementById('sudoku-board');
    if (boardElement) {
      boardElement.innerHTML = '<div class="generating">生成中...</div>';
    }
    
    // 延迟执行生成逻辑，让"生成中..."先渲染出来
    setTimeout(() => {
      // 生成新的数独棋盘
      this.solution = this.generateFullSudoku();
      this.board = this.removeNumbers(this.solution, this.difficulty);
      this.initialBoard = this.board.map(row => [...row]); // 保存初始棋盘
      this.selectedCell = null;
      this.hintsUsed = 0;
      this.solved = false;
      this.gameOver = false;
      this.elapsedSeconds = 0;
      this.renderBoard();
      this.updateBestTimeDisplay();
      this.startTimer();
    }, 50);
  }

  // 生成完整的数独棋盘
  generateFullSudoku() {
    const board = Array(9).fill().map(() => Array(9).fill(0));
    this.fillBoard(board);
    return board;
  }

  // 递归填充棋盘
  fillBoard(board) {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (board[row][col] === 0) {
          const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
          // 随机打乱数字顺序
          for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
          }
          
          for (let num of numbers) {
            if (this.isValid(board, row, col, num)) {
              board[row][col] = num;
              if (this.fillBoard(board)) {
                return true;
              }
              board[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  // 验证数字是否有效
  isValid(board, row, col, num) {
    // 检查行
    for (let x = 0; x < 9; x++) {
      if (board[row][x] === num) return false;
    }
    // 检查列
    for (let x = 0; x < 9; x++) {
      if (board[x][col] === num) return false;
    }
    // 检查3x3宫格
    const startRow = row - row % 3;
    const startCol = col - col % 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[startRow + i][startCol + j] === num) return false;
      }
    }
    return true;
  }

  // 统计棋盘的解数量（达到 limit 即提前返回）
  countSolutions(board, limit = 2) {
    let count = 0;
    const solve = () => {
      if (count >= limit) return;
      // 找第一个空格
      let emptyRow = -1;
      let emptyCol = -1;
      for (let row = 0; row < 9 && emptyRow === -1; row++) {
        for (let col = 0; col < 9; col++) {
          if (board[row][col] === 0) {
            emptyRow = row;
            emptyCol = col;
            break;
          }
        }
      }
      // 没有空格，找到一个解
      if (emptyRow === -1) {
        count++;
        return;
      }
      for (let num = 1; num <= 9; num++) {
        if (this.isValid(board, emptyRow, emptyCol, num)) {
          board[emptyRow][emptyCol] = num;
          solve();
          board[emptyRow][emptyCol] = 0;
          if (count >= limit) return;
        }
      }
    };
    solve();
    return count;
  }

  // 根据难度移除数字（保证唯一解）
  removeNumbers(solution, difficulty) {
    const board = solution.map(row => [...row]);
    let cellsToRemove;
    
    switch (difficulty) {
      case 'easy':
        cellsToRemove = 30;
        break;
      case 'medium':
        cellsToRemove = 45;
        break;
      case 'hard':
        cellsToRemove = 55;
        break;
    }
    
    // 将 81 个格子随机打乱顺序，逐个尝试挖洞
    const cells = [];
    for (let i = 0; i < 81; i++) {
      cells.push(i);
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    
    let removed = 0;
    for (const index of cells) {
      if (removed >= cellsToRemove) break;
      const row = Math.floor(index / 9);
      const col = index % 9;
      const backup = board[row][col];
      board[row][col] = 0;
      // 挖掉后仍保持唯一解才保留，否则回填
      if (this.countSolutions(board, 2) === 1) {
        removed++;
      } else {
        board[row][col] = backup;
      }
    }
    
    return board;
  }

  // 渲染棋盘
  renderBoard() {
    const boardElement = document.getElementById('sudoku-board');
    if (!boardElement) {
      return;
    }
    
    boardElement.innerHTML = '';
    
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cell = document.createElement('div');
        cell.className = 'sudoku-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;
        
        if (this.board[row][col] !== 0) {
          cell.textContent = this.board[row][col];
        }
        
        // 固定数字的判断应该基于 initialBoard 而不是 solution
        // 只有在 initialBoard 中就已经存在的数字才是固定数字
        if (this.initialBoard[row][col] !== 0) {
          cell.classList.add('fixed');
        }
        // 如果是用户自己填写的数字，标记为用户输入
        else if (this.board[row][col] !== 0 && this.initialBoard[row][col] === 0) {
          cell.classList.add('user-input');
          // 渲染时同步校验，保证输入/重绘后错误标记正确刷新
          if (this.board[row][col] !== this.solution[row][col]) {
            cell.classList.add('error');
          }
        }
        
        // 恢复选中状态
        if (this.selectedCell && this.selectedCell.row === row && this.selectedCell.col === col) {
          cell.classList.add('selected');
        }
        
        cell.addEventListener('click', () => {
          this.selectCell(row, col);
        });
        
        boardElement.appendChild(cell);
      }
    }
    
    // 渲染后重新应用高亮
    this.applyHighlights();
  }

  // 应用高亮：同行/同列/同宫 + 相同数字
  applyHighlights() {
    document.querySelectorAll('.sudoku-cell.related, .sudoku-cell.same-number').forEach(cell => {
      cell.classList.remove('related', 'same-number');
    });
    
    if (!this.selectedCell) return;
    
    const { row, col } = this.selectedCell;
    const selectedValue = this.board[row][col];
    const boxStartRow = row - row % 3;
    const boxStartCol = col - col % 3;
    
    document.querySelectorAll('.sudoku-cell').forEach(cell => {
      const r = parseInt(cell.dataset.row);
      const c = parseInt(cell.dataset.col);
      if (r === row && c === col) return;
      
      const inSameBox = r >= boxStartRow && r < boxStartRow + 3 && c >= boxStartCol && c < boxStartCol + 3;
      if (r === row || c === col || inSameBox) {
        cell.classList.add('related');
      }
      if (selectedValue !== 0 && this.board[r][c] === selectedValue) {
        cell.classList.add('same-number');
      }
    });
  }

  // 选择单元格
  selectCell(row, col) {
    // 游戏已结束则不再响应选择
    if (this.gameOver) {
      return;
    }
    
    // 移除之前的选择
    document.querySelectorAll('.sudoku-cell.selected').forEach(cell => {
      cell.classList.remove('selected');
    });
    
    // 选择新单元格
    this.selectedCell = { row, col };
    const cellElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cellElement) {
      cellElement.classList.add('selected');
    }
    
    // 刷新高亮
    this.applyHighlights();
  }

  // 输入数字
  inputNumber(number) {
    if (!this.selectedCell) return;
    if (this.gameOver) return;
    
    const { row, col } = this.selectedCell;
    
    // 如果是固定单元格，不允许修改
    if (this.initialBoard[row][col] !== 0) {
      return;
    }
    
    // 清空或设置数字
    this.board[row][col] = number === 0 ? 0 : number;
    
    this.renderBoard();
    
    // 重新选择单元格
    this.selectCell(row, col);
    
    // 检查是否完成
    this.checkWin();
  }

  // 验证单元格
  validateCell(row, col) {
    const cellElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!cellElement) return;
    cellElement.classList.remove('error');
    
    if (this.board[row][col] !== 0 && this.board[row][col] !== this.solution[row][col]) {
      cellElement.classList.add('error');
    }
  }

  // 给提示
  giveHint() {
    if (this.gameOver) return;
    
    if (!this.selectedCell) {
      alert('请先点击选择一个空白格子，再使用提示！');
      return;
    }
    
    const { row, col } = this.selectedCell;
    
    // 如果已经填对，无需提示
    if (this.solution[row][col] !== 0 && this.board[row][col] === this.solution[row][col]) {
      alert('这个格子已经是正确答案，无需提示！');
      return;
    }
    
    // 填充正确答案
    this.board[row][col] = this.solution[row][col];
    this.hintsUsed++;
    
    this.renderBoard();
    
    const cellElement = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cellElement) {
      cellElement.classList.add('hint');
    }
    
    this.selectCell(row, col);
    this.checkWin();
  }

  // 解答游戏
  solveGame() {
    if (this.gameOver) return;
    
    if (confirm('确定要查看完整答案吗？查看后本局将不计入成绩。')) {
      this.board = this.solution.map(row => [...row]);
      this.solved = true;
      this.gameOver = true;
      this.stopTimer();
      this.renderBoard();
    }
  }

  // 检查是否完成
  checkWin() {
    if (this.gameOver) return;
    
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (this.board[row][col] !== this.solution[row][col]) {
          return;
        }
      }
    }
    
    this.gameOver = true;
    this.stopTimer();
    
    // 使用解答的局不计入成绩
    let isNewRecord = false;
    if (!this.solved) {
      const key = 'sudoku-best-' + this.difficulty;
      const prevBest = parseInt(localStorage.getItem(key));
      if (isNaN(prevBest) || this.elapsedSeconds < prevBest) {
        localStorage.setItem(key, String(this.elapsedSeconds));
        isNewRecord = true;
      }
    }
    
    this.updateBestTimeDisplay();
    this.showVictoryBanner(isNewRecord);
  }

  // 开始计时
  startTimer() {
    this.stopTimer();
    this.updateTimerDisplay();
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds++;
      this.updateTimerDisplay();
    }, 1000);
  }

  // 停止计时
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // 格式化时间为 mm:ss
  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // 更新计时显示
  updateTimerDisplay() {
    const timerElement = document.getElementById('game-timer');
    if (timerElement) {
      timerElement.textContent = '时间: ' + this.formatTime(this.elapsedSeconds);
    }
  }

  // 更新当前难度最佳成绩显示
  updateBestTimeDisplay() {
    const bestElement = document.getElementById('best-time');
    if (bestElement) {
      const best = parseInt(localStorage.getItem('sudoku-best-' + this.difficulty));
      bestElement.textContent = '最佳: ' + (isNaN(best) ? '--:--' : this.formatTime(best));
    }
  }

  // 显示胜利横幅
  showVictoryBanner(isNewRecord) {
    const banner = document.getElementById('victory-banner');
    if (!banner) return;
    
    let html = '🎉 恭喜完成数独！用时 ' + this.formatTime(this.elapsedSeconds) + ' · 提示 ' + this.hintsUsed + ' 次';
    if (isNewRecord) {
      html += ' · <span class="banner-record">🏆 新纪录！</span>';
    }
    banner.innerHTML = html;
    banner.classList.add('show');
  }

  // 隐藏胜利横幅
  hideVictoryBanner() {
    const banner = document.getElementById('victory-banner');
    if (banner) {
      banner.classList.remove('show');
      banner.innerHTML = '';
    }
  }
}

// 全局变量用于防止重复初始化
let sudokuGameInstance = null;

// 初始化游戏函数
function initSudokuGame() {
  // 检查是否已经初始化过
  if (sudokuGameInstance) {
    return true;
  }
  
  // 检查DOM元素是否存在
  const gameContainer = document.getElementById('sudoku-game');
  const boardElement = document.getElementById('sudoku-board');
  const difficultyBtn = document.getElementById('difficulty-btn');
  
  if (!gameContainer || !boardElement || !difficultyBtn) {
    return false;
  }
  
  try {
    sudokuGameInstance = new SudokuGame();
    return true;
  } catch (error) {
    return false;
  }
}

// 检查游戏容器并初始化
function checkAndInitGame(observer) {
  const gameContainer = document.getElementById('sudoku-game');
  const boardElement = document.getElementById('sudoku-board');
  const difficultyBtn = document.getElementById('difficulty-btn');
  
  if (gameContainer && boardElement && difficultyBtn) {
    // 初始化游戏
    initSudokuGame();
    
    // 如果观察器存在，停止观察
    if (observer) {
      observer.disconnect();
    }
    return true;
  }
  return false;
}

// 使用 MutationObserver 监听 DOM 变化，用于单页应用场景（如 VuePress）
function setupDOMObserver() {
  let observer;
  
  // 首先尝试立即初始化
  if (!checkAndInitGame(observer)) {
    // 创建 MutationObserver 实例
    observer = new MutationObserver(function(mutationsList) {
      checkAndInitGame(observer);
    });
    
    // 开始观察 body 元素的变化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
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
    // 延迟检查，确保 VuePress 有足够时间渲染页面
    setTimeout(function() {
      // 重新设置 DOM 观察器
      globalObserver = setupDOMObserver();
    }, 1000);
  };
  
  // 添加路由变化事件监听器
  window.addEventListener('hashchange', handleRouteChange);
  window.addEventListener('popstate', handleRouteChange);
}

// 检查是否在浏览器环境中
function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// 在多种情况下尝试初始化游戏
if (isBrowser()) {
  // 1. 立即尝试
  setTimeout(function() {
    if (!checkAndInitGame()) {
      // 如果立即初始化失败，设置 DOM 观察器
      globalObserver = setupDOMObserver();
    }
  }, 200);
  
  // 2. DOMContentLoaded事件
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      if (!checkAndInitGame()) {
        globalObserver = setupDOMObserver();
      }
    }, 100);
  });
  
  // 3. window.load事件
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (!checkAndInitGame()) {
        globalObserver = setupDOMObserver();
      }
    }, 50);
  });
  
  // 4. 2秒后再次尝试（作为备用）
  setTimeout(function() {
    const gameElements = document.querySelectorAll('.sudoku-cell');
    if (gameElements.length === 0) {
      if (!checkAndInitGame()) {
        globalObserver = setupDOMObserver();
      }
    }
  }, 2000);
  
  // 5. 5秒后最后尝试
  setTimeout(function() {
    const gameElements = document.querySelectorAll('.sudoku-cell');
    if (gameElements.length === 0) {
      initSudokuGame();
    }
  }, 5000);
  
  // 初始化所有监听器
  globalObserver = setupDOMObserver();
  setupRouteListeners();
}
</script>
