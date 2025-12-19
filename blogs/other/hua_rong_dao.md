::: warning 华容道游戏

华容道是一款经典的中国传统益智游戏。目标是通过滑动方块，帮助曹操从棋盘的底部出口逃脱。
:::

<div id="hua-rong-dao-game" class="game-container">
  <div class="game-header">
    <div class="game-title">华容道</div>
    <div class="game-stats">
      <span>步数: <span id="move-count">0</span></span>
      <button id="restart-btn" class="btn-restart">重新开始</button>
    </div>
  </div>
  
  <div class="game-board" id="game-board">
    <!-- 游戏棋盘将通过JavaScript动态生成 -->
  </div>
  
  <div class="game-info">
    <h3>游戏目标</h3>
    <p>滑动方块，将曹操(大方块)移动到棋盘底部的出口位置即可获胜。</p>
    <h3>操作方式</h3>
    <ul>
      <li>使用键盘方向键(↑ ↓ ← →)或WASD键移动方块</li>
      <li>在移动设备上，可通过触摸滑动来移动方块</li>
      <li>点击重新开始按钮可重置游戏</li>
    </ul>
  </div>
</div>

<script>
// 华容道游戏实现
class HuaRongDaoGame {
  constructor() {
    // 棋盘布局 (5行 x 4列)
    this.board = [
      [3, 1, 1, 4],
      [3, 1, 1, 4],
      [5, 2, 2, 6],
      [5, 7, 8, 6],
      [9, 0, 0, 10]
    ]; // 5x4棋盘，包含4个士兵和2个空格
    this.selectedPiece = null; // 选中的棋子
    
    // 方块配置
    this.pieces = {
      0: { name: 'empty', size: { rows: 1, cols: 1 }, color: '#e0e0e0' },
      1: { name: 'caocao', size: { rows: 2, cols: 2 }, color: '#e74c3c', label: '曹' }, // 曹操
      2: { name: 'guanyu', size: { rows: 1, cols: 2 }, color: '#2ecc71', label: '关' },   // 关羽横向
      3: { name: 'zhangfei', size: { rows: 2, cols: 1 }, color: '#3498db', label: '张' }, // 张飞纵向
      4: { name: 'zhaoyun', size: { rows: 2, cols: 1 }, color: '#3498db', label: '赵' }, // 赵云纵向
      5: { name: 'machao', size: { rows: 2, cols: 1 }, color: '#3498db', label: '马' },   // 马超纵向
      6: { name: 'huangzhong', size: { rows: 2, cols: 1 }, color: '#3498db', label: '黄' }, // 黄忠纵向
      7: { name: 'soldier1', size: { rows: 1, cols: 1 }, color: '#f39c12', label: '兵' },
      8: { name: 'soldier2', size: { rows: 1, cols: 1 }, color: '#f39c12', label: '兵' },
      9: { name: 'soldier3', size: { rows: 1, cols: 1 }, color: '#f39c12', label: '兵' },
      10: { name: 'soldier4', size: { rows: 1, cols: 1 }, color: '#f39c12', label: '兵' }
    };
    this.moveCount = 0;
    this.emptyPos = { row: 0, col: 3 }; // 初始空位置（第一个空格）
    this.init();
  }

  init() {
    this.renderBoard();
    this.attachEventListeners();
  }

  renderBoard() {
    const boardElement = document.getElementById('game-board');
    boardElement.innerHTML = '';
    
    // 创建棋盘格子背景（包括空白格子）
    for (let row = 0; row < this.board.length; row++) {
      for (let col = 0; col < this.board[row].length; col++) {
        const cellElement = document.createElement('div');
        cellElement.className = 'board-cell';
        cellElement.style.width = '80px';
        cellElement.style.height = '80px';
        cellElement.style.position = 'absolute';
        cellElement.style.left = `${col * 80}px`;
        cellElement.style.top = `${row * 80}px`;
        cellElement.style.zIndex = '1';
        cellElement.dataset.row = row;
        cellElement.dataset.col = col;
        
        boardElement.appendChild(cellElement);
      }
    }
    
    // 创建非空方块
    for (let row = 0; row < this.board.length; row++) {
      for (let col = 0; col < this.board[row].length; col++) {
        const pieceId = this.board[row][col];
        const piece = this.pieces[pieceId];
        
        // 只创建非空方块，避免重复
        if (pieceId !== 0 && row === this.getTopLeftRow(row, col) && col === this.getTopLeftCol(row, col)) {
          const pieceElement = document.createElement('div');
          pieceElement.className = `game-piece piece-${pieceId}`;
          pieceElement.style.width = `${piece.size.cols * 80}px`;
          pieceElement.style.height = `${piece.size.rows * 80}px`;
          pieceElement.style.backgroundColor = piece.color;
          // 选中状态的边框样式
          if (this.selectedPiece && this.selectedPiece.pieceId === pieceId &&
              this.selectedPiece.row === row && this.selectedPiece.col === col) {
            pieceElement.style.border = '3px solid #ffd700'; // 金黄色边框
            pieceElement.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.5)'; // 发光效果
          } else {
            pieceElement.style.border = '2px solid #2c3e50';
          }
          pieceElement.style.borderRadius = '5px';
          pieceElement.style.position = 'absolute';
          pieceElement.style.left = `${col * 80}px`;
          pieceElement.style.top = `${row * 80}px`;
          pieceElement.style.display = 'flex';
          pieceElement.style.justifyContent = 'center';
          pieceElement.style.alignItems = 'center';
          pieceElement.style.fontSize = '24px';
          pieceElement.style.fontWeight = 'bold';
          pieceElement.style.color = '#2c3e50';
          pieceElement.style.cursor = 'pointer';
          pieceElement.style.zIndex = '100';
          pieceElement.style.transition = 'all 0.2s ease';
          pieceElement.textContent = piece.label;
          pieceElement.dataset.pieceId = pieceId;
          pieceElement.dataset.row = row;
          pieceElement.dataset.col = col;
          
          // 添加悬停效果
          pieceElement.addEventListener('mouseenter', function() {
            if (!this.style.border.includes('ffd700')) { // 非选中状态才显示悬停效果
              this.style.transform = 'scale(1.05)';
              this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
            }
          });
          
          pieceElement.addEventListener('mouseleave', function() {
            if (!this.style.border.includes('ffd700')) { // 非选中状态才显示悬停效果
              this.style.transform = 'scale(1)';
              this.style.boxShadow = 'none';
            }
          });
          
          boardElement.appendChild(pieceElement);
        }
      }
    }
    
    // 绘制出口标记
    this.renderExit();
    
    this.updateMoveCount();
  }
  
  // 绘制出口标记
  renderExit() {
    const boardElement = document.getElementById('game-board');
    const exitElement = document.createElement('div');
    exitElement.className = 'exit-mark';
    exitElement.textContent = '出口';
    exitElement.style.position = 'absolute';
    exitElement.style.width = `${2 * 80}px`; // 2格宽
    exitElement.style.height = `${80}px`; // 1格高
    exitElement.style.left = `${1 * 80}px`; // 第1列开始
    exitElement.style.top = `${5 * 80}px`; // 棋盘下方
    exitElement.style.border = '2px dashed #ff6b6b';
    exitElement.style.borderRadius = '5px';
    exitElement.style.display = 'flex';
    exitElement.style.justifyContent = 'center';
    exitElement.style.alignItems = 'center';
    exitElement.style.fontSize = '18px';
    exitElement.style.fontWeight = 'bold';
    exitElement.style.color = '#ff6b6b';
    exitElement.style.background = 'rgba(255, 107, 107, 0.1)';
    exitElement.style.zIndex = '10';
    
    boardElement.appendChild(exitElement);
  }

  getTopLeftRow(row, col) {
    const pieceId = this.board[row][col];
    if (pieceId === 0) return row;
    
    // 向上查找，找到方块的左上角
    for (let r = row; r >= 0; r--) {
      if (this.board[r][col] === pieceId) {
        row = r;
      } else {
        break;
      }
    }
    return row;
  }

  getTopLeftCol(row, col) {
    const pieceId = this.board[row][col];
    if (pieceId === 0) return col;
    
    // 向左查找，找到方块的左上角
    for (let c = col; c >= 0; c--) {
      if (this.board[row][c] === pieceId) {
        col = c;
      } else {
        break;
      }
    }
    return col;
  }

  attachEventListeners() {
    // 键盘事件
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    
    // 重新开始按钮
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restart());
    }
    
    // 鼠标点击事件 - 点击方块选择，点击空白格子移动
    const boardElement = document.getElementById('game-board');
    boardElement.addEventListener('click', (e) => {
      const clickedPiece = e.target.closest('.game-piece');
      
      if (clickedPiece) {
        // 点击了棋子
        this.tryMovePiece(clickedPiece);
      } else {
        // 点击了空白格子
        if (this.selectedPiece) {
          // 如果有选中的棋子，尝试移动到点击的位置
          const clickedCell = e.target.closest('.board-cell');
          if (clickedCell) {
            const row = parseInt(clickedCell.dataset.row);
            const col = parseInt(clickedCell.dataset.col);
            this.tryMoveToCell(row, col);
          }
        }
      }
    });
    
    // 触摸事件 - 改为点击操作，与鼠标点击一致
    boardElement.addEventListener('touchstart', (e) => {
      // 防止触摸事件触发鼠标事件
      e.preventDefault();
    });
    
    boardElement.addEventListener('touchend', (e) => {
      e.preventDefault();
      
      const touch = e.changedTouches[0];
      const touchX = touch.clientX;
      const touchY = touch.clientY;
      
      // 创建一个鼠标事件，模拟点击
      const clickEvent = new MouseEvent('click', {
        clientX: touchX,
        clientY: touchY,
        bubbles: true,
        cancelable: true
      });
      
      // 触发点击事件
      document.elementFromPoint(touchX, touchY).dispatchEvent(clickEvent);
    });
  }

  handleKeyDown(e) {
    // 如果没有选中棋子，使用原来的移动方式
    if (!this.selectedPiece) {
      switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          this.movePiece('up');
          e.preventDefault();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          this.movePiece('down');
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.movePiece('left');
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.movePiece('right');
          e.preventDefault();
          break;
      }
      return;
    }
    
    // 如果有选中棋子，移动选中的棋子
    const { piece, row, col } = this.selectedPiece;
    let direction;
    
    // 检查方向键
    switch(e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        direction = 'up';
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        direction = 'down';
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        direction = 'left';
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        direction = 'right';
        break;
      case 'Escape':
      case ' ': // 空格键取消选中
        this.selectedPiece = null;
        this.renderBoard();
        e.preventDefault();
        return;
      default:
        return;
    }
    
    if (direction && this.canMoveTo(piece, row, col, direction)) {
      this.movePieceByCoordinates(piece, row, col, direction);
      // 更新选中棋子的位置
      let newRow = row;
      let newCol = col;
      switch(direction) {
        case 'up':
          newRow--;
          break;
        case 'down':
          newRow++;
          break;
        case 'left':
          newCol--;
          break;
        case 'right':
          newCol++;
          break;
      }
      this.selectedPiece.row = newRow;
      this.selectedPiece.col = newCol;
      this.renderBoard();
    }
    e.preventDefault();
  }

  // 处理棋子点击事件（选中或取消选中）
  tryMovePiece(pieceElement) {
    const pieceId = parseInt(pieceElement.dataset.pieceId);
    const topLeftRow = parseInt(pieceElement.dataset.row);
    const topLeftCol = parseInt(pieceElement.dataset.col);
    const piece = this.pieces[pieceId];
    
    // 如果有选中的棋子
    if (this.selectedPiece) {
      // 如果点击的是同一个棋子，取消选中
      if (this.selectedPiece.pieceId === pieceId &&
          this.selectedPiece.row === topLeftRow &&
          this.selectedPiece.col === topLeftCol) {
        this.selectedPiece = null;
        this.renderBoard();
        return;
      }
      // 否则取消之前的选中并选中新的棋子
      this.selectedPiece = { pieceId, row: topLeftRow, col: topLeftCol, piece };
      this.renderBoard();
      return;
    }
    
    // 选中当前棋子
    this.selectedPiece = { pieceId, row: topLeftRow, col: topLeftCol, piece };
    this.renderBoard();
  }
  
  // 尝试将选中的棋子移动到指定的格子
  tryMoveToCell(targetRow, targetCol) {
    const { piece, row, col } = this.selectedPiece;
    
    // 对于不同大小的棋子，尝试所有可能的移动方向
    const possibleDirections = ['up', 'down', 'left', 'right'];
    
    // 尝试每个方向
    for (let direction of possibleDirections) {
      if (this.canMoveTo(piece, row, col, direction)) {
        // 计算移动后的左上角位置
        let newRow = row;
        let newCol = col;
        
        switch(direction) {
          case 'up':
            newRow--;
            break;
          case 'down':
            newRow++;
            break;
          case 'left':
            newCol--;
            break;
          case 'right':
            newCol++;
            break;
        }
        
        // 检查目标位置是否在移动后的棋子范围内
        const isTargetInPieceArea = 
          targetRow >= newRow && 
          targetRow < newRow + piece.size.rows && 
          targetCol >= newCol && 
          targetCol < newCol + piece.size.cols;
        
        if (isTargetInPieceArea) {
          // 移动棋子
          this.movePieceByCoordinates(piece, row, col, direction);
          // 更新选中棋子的位置
          this.selectedPiece.row = newRow;
          this.selectedPiece.col = newCol;
          this.renderBoard();
          return true;
        }
      }
    }
    
    return false;
  }
  
  // 检查方块是否可以向某个方向移动
  canMoveTo(piece, topLeftRow, topLeftCol, direction) {
    // 计算新的左上角位置
    let newTopLeftRow = topLeftRow;
    let newTopLeftCol = topLeftCol;
    
    switch(direction) {
      case 'up':
        newTopLeftRow--;
        break;
      case 'down':
        newTopLeftRow++;
        break;
      case 'left':
        newTopLeftCol--;
        break;
      case 'right':
        newTopLeftCol++;
        break;
    }
    
    // 检查新的位置是否在棋盘内
    if (newTopLeftRow < 0 || newTopLeftRow + piece.size.rows > this.board.length || 
        newTopLeftCol < 0 || newTopLeftCol + piece.size.cols > this.board[0].length) {
      return false;
    }
    
    // 检查新位置的所有格子：除了棋子本身原来的位置外，必须都是空格
    for (let r = 0; r < piece.size.rows; r++) {
      for (let c = 0; c < piece.size.cols; c++) {
        const checkRow = newTopLeftRow + r;
        const checkCol = newTopLeftCol + c;
        
        // 检查当前格子是否在原来的位置范围内
        const isInOriginalPosition = checkRow >= topLeftRow && 
                                      checkRow < topLeftRow + piece.size.rows && 
                                      checkCol >= topLeftCol && 
                                      checkCol < topLeftCol + piece.size.cols;
        
        // 如果不在原来的位置，且不是空格，则移动不合法
        if (!isInOriginalPosition && this.board[checkRow][checkCol] !== 0) {
          return false;
        }
      }
    }
    
    // 所有检查都通过，移动合法
    return true;
  }
  
  // 根据坐标移动方块
  movePieceByCoordinates(piece, topLeftRow, topLeftCol, direction) {
    // 清空当前位置
    for (let r = 0; r < piece.size.rows; r++) {
      for (let c = 0; c < piece.size.cols; c++) {
        this.board[topLeftRow + r][topLeftCol + c] = 0;
      }
    }
    
    // 计算新的左上角位置
    let newTopLeftRow = topLeftRow;
    let newTopLeftCol = topLeftCol;
    
    switch(direction) {
      case 'up':
        newTopLeftRow--;
        break;
      case 'down':
        newTopLeftRow++;
        break;
      case 'left':
        newTopLeftCol--;
        break;
      case 'right':
        newTopLeftCol++;
        break;
    }
    
    // 设置新位置
    const pieceId = Object.keys(this.pieces).find(key => this.pieces[key] === piece);
    for (let r = 0; r < piece.size.rows; r++) {
      for (let c = 0; c < piece.size.cols; c++) {
        this.board[newTopLeftRow + r][newTopLeftCol + c] = parseInt(pieceId);
      }
    }
    
    // 更新空位置（找到新的空位置）
    for (let r = 0; r < this.board.length; r++) {
      for (let c = 0; c < this.board[r].length; c++) {
        if (this.board[r][c] === 0) {
          this.emptyPos = { row: r, col: c };
          break;
        }
      }
    }
    
    // 更新步数
    this.moveCount++;
    
    // 重新渲染棋盘
    this.renderBoard();
    
    // 检查是否获胜
    this.checkWin();
  }
  
  // 处理选中棋子的移动（用于键盘和鼠标拖动）
  moveSelectedPiece(direction) {
    if (!this.selectedPiece) return false;
    
    // 找到选中棋子的当前位置
    let topLeftRow, topLeftCol;
    let found = false;
    for (let r = 0; r < this.board.length && !found; r++) {
      for (let c = 0; c < this.board[r].length && !found; c++) {
        const pieceId = this.board[r][c];
        if (pieceId !== 0 && this.pieces[pieceId] === this.selectedPiece) {
          topLeftRow = this.getTopLeftRow(r, c);
          topLeftCol = this.getTopLeftCol(r, c);
          found = true;
        }
      }
    }
    
    if (!found) return false;
    
    // 检查选中棋子是否可以向该方向移动
    if (this.canMoveTo(this.selectedPiece, topLeftRow, topLeftCol, direction)) {
      this.movePieceByCoordinates(this.selectedPiece, topLeftRow, topLeftCol, direction);
      return true;
    }
    
    return false;
  }
  
  // 基于空位置的移动（用于传统的华容道移动方式）
  movePiece(direction) {
    let { row, col } = this.emptyPos;
    let targetRow = row;
    let targetCol = col;
    
    // 根据移动方向，确定哪个方块可以移动到空位置
    switch(direction) {
      case 'up':
        targetRow = row + 1; // 空位置上方的方块可以向下移动到空位置
        break;
      case 'down':
        targetRow = row - 1; // 空位置下方的方块可以向上移动到空位置
        break;
      case 'left':
        targetCol = col + 1; // 空位置左侧的方块可以向右移动到空位置
        break;
      case 'right':
        targetCol = col - 1; // 空位置右侧的方块可以向左移动到空位置
        break;
    }
    
    // 检查目标位置是否在棋盘内
    if (targetRow < 0 || targetRow >= this.board.length || 
        targetCol < 0 || targetCol >= this.board[0].length) {
      return false;
    }
    
    const targetPieceId = this.board[targetRow][targetCol];
    if (targetPieceId === 0) return false;
    
    const piece = this.pieces[targetPieceId];
    const topLeftRow = this.getTopLeftRow(targetRow, targetCol);
    const topLeftCol = this.getTopLeftCol(targetRow, targetCol);
    
    // 确定方块需要移动的方向（与空位置移动方向相反）
    let pieceMoveDirection;
    switch(direction) {
      case 'up':
        pieceMoveDirection = 'down';
        break;
      case 'down':
        pieceMoveDirection = 'up';
        break;
      case 'left':
        pieceMoveDirection = 'right';
        break;
      case 'right':
        pieceMoveDirection = 'left';
        break;
    }
    
    // 检查方块是否可以向该方向移动
    if (this.canMoveTo(piece, topLeftRow, topLeftCol, pieceMoveDirection)) {
      this.movePieceByCoordinates(piece, topLeftRow, topLeftCol, pieceMoveDirection);
      return true;
    }
    
    return false;
  }

  checkWin() {
    // 检查曹操是否到达出口位置(第4行，第1、2列 - 5x4棋盘底部中央)
    if (this.board[4][1] === 1 && this.board[4][2] === 1 && 
        this.board[3][1] === 1 && this.board[3][2] === 1) {
      setTimeout(() => {
        alert(`恭喜你获胜了！\n\n使用了 ${this.moveCount} 步！\n\n挑战更高难度，尝试用更少的步数完成吧！`);
      }, 300);
      return true;
    }
    return false;
  }

  restart() {
    // 重置为5x4棋盘布局 - 用户调整后的布局
    this.board = [
      [3, 1, 1, 4],
      [3, 1, 1, 4],
      [5, 2, 2, 6],
      [5, 7, 8, 6],
      [9, 0, 0, 10]
    ];
    this.moveCount = 0;
    this.selectedPiece = null; // 重置选中状态
    // 设置初始空位置
    this.emptyPos = { row: 4, col: 1 };
    this.renderBoard();
  }

  updateMoveCount() {
    const moveCountElement = document.getElementById('move-count');
    if (moveCountElement) {
      moveCountElement.textContent = this.moveCount;
    }
  }
}

// 使用IIFE包装，避免变量污染全局作用域
(() => {
  // 初始化游戏的安全函数
  function initializeGameSafely() {
    if (document.getElementById('hua-rong-dao-game') && document.getElementById('game-board')) {
      console.log('华容道游戏DOM元素已准备好，开始初始化游戏...');
      new HuaRongDaoGame();
    } else {
      console.log('等待华容道游戏DOM元素渲染...');
      setTimeout(initializeGameSafely, 100);
    }
  }
  
  // 页面加载完成后初始化游戏
  document.addEventListener('DOMContentLoaded', initializeGameSafely);
  
  // 立即尝试初始化，可能DOM已经准备好
  initializeGameSafely();
})();
</script>

<style>
/* 华容道游戏样式 */
.game-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.game-header {
  text-align: center;
  margin-bottom: 20px;
}

.game-header .game-title {
  font-size: 28px;
  color: #333;
  margin-bottom: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: bold;
  text-align: center;
}

.game-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  font-size: 16px;
  color: #666;
}

.btn-restart {
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.btn-restart:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-restart:active {
  transform: translateY(0);
}

.game-board {
  position: relative;
  width: 320px;
  height: 400px;
  margin: 0 auto 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  border-radius: 10px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
}

.game-piece {
  position: absolute;
  border: 2px solid #2c3e50;
  border-radius: 5px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  font-weight: bold;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.game-piece:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.game-piece:active {
  transform: scale(0.98);
}

.game-info {
  background: white;
  border-radius: 10px;
  padding: 20px;
  margin-top: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.game-info h3 {
  color: #333;
  margin-bottom: 10px;
  font-size: 18px;
}

.game-info p {
  color: #666;
  margin-bottom: 10px;
  line-height: 1.6;
}

.game-info ul {
  list-style: none;
  padding: 0;
  color: #666;
}

.game-info li {
  margin-bottom: 8px;
  padding-left: 20px;
  position: relative;
  line-height: 1.5;
}

.game-info li::before {
  content: '•';
  color: #667eea;
  font-weight: bold;
  position: absolute;
  left: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .game-container {
    padding: 15px;
  }
  
  .game-header h2 {
    font-size: 24px;
  }
  
  .game-board {
    width: 280px;
    height: 350px;
  }
  
  .game-piece {
    font-size: 20px;
  }
  
  .game-info {
    padding: 15px;
  }
}

@media (max-width: 480px) {
  .game-container {
    padding: 10px;
  }
  
  .game-header h2 {
    font-size: 22px;
  }
  
  .game-board {
    width: 240px;
    height: 300px;
  }
  
  .game-piece {
    font-size: 18px;
  }
}
</style>