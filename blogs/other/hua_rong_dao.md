::: warning 华容道游戏

华容道是一款经典的中国传统益智游戏。目标是通过滑动方块，帮助曹操从棋盘的底部出口逃脱。
:::

<div id="hua-rong-dao-game" class="game-container">
  <div class="game-header">
    <div class="game-title">华容道</div>
    <div class="level-selector">
      <button id="prev-level-btn" class="btn-level-switch" aria-label="上一关">‹</button>
      <span class="level-label">第 <span id="level-index">1</span> 关 · <span id="level-name">横刀立马</span></span>
      <button id="next-level-btn" class="btn-level-switch" aria-label="下一关">›</button>
    </div>
    <div class="game-stats">
      <span>步数: <span id="move-count">0</span></span>
      <span class="stat-sep">|</span>
      <span>最佳: <span id="best-count">--</span></span>
      <span class="stat-sep">|</span>
      <span>最优: <span id="optimal-count">--</span></span>
      <button id="restart-btn" class="btn-restart">重新开始</button>
    </div>
  </div>

  <div id="victory-banner" class="victory-banner" style="display:none;">
    <div class="victory-title">🎉 恭喜通关！</div>
    <div class="victory-detail" id="victory-detail"></div>
    <div class="victory-record" id="victory-record"></div>
    <div class="victory-actions">
      <button id="victory-next-btn" class="btn-victory btn-next">下一关</button>
      <button id="victory-replay-btn" class="btn-victory btn-replay">重玩本关</button>
    </div>
  </div>

  <div class="game-board" id="game-board">
    <!-- 游戏棋盘将通过JavaScript动态生成 -->
  </div>

  <div class="game-info">
    <h3>游戏目标</h3>
    <p>移动方块，将曹操(大方块)移动到棋盘底部的出口位置即可获胜。</p>
    <h3>操作方式</h3>
    <ul>
      <li>点击棋子选中（金色边框），再点击目标位置移动；再次点击该棋子取消选中</li>
      <li>使用键盘方向键(↑ ↓ ← →)或WASD键移动选中的棋子，Esc/空格键取消选中</li>
      <li>未选中棋子时按方向键会默认选中曹操，开局默认选中曹操</li>
      <li>在电脑或手机上直接拖动/滑动棋子，可将其向滑动方向移动一格，可连续滑动</li>
      <li>点击关卡名两侧的箭头切换关卡，点击重新开始按钮重置本关</li>
    </ul>
  </div>
</div>

<script>
// 华容道游戏实现
class HuaRongDaoGame {
  constructor() {
    // 关卡配置（棋盘为5行x4列，optimalSteps为BFS验证得出的最少步数，按每格一步口径）
    this.levels = [
      { name: '横刀立马', optimalSteps: 116, board: [
        [3, 1, 1, 4],
        [3, 1, 1, 4],
        [5, 2, 2, 6],
        [5, 7, 8, 6],
        [9, 0, 0, 10]
      ] },
      { name: '指挥若定', optimalSteps: 45, board: [
        [7, 1, 1, 8],
        [3, 1, 1, 4],
        [3, 9, 10, 4],
        [5, 2, 2, 6],
        [5, 0, 0, 6]
      ] },
      { name: '将拥曹营', optimalSteps: 118, board: [
        [3, 1, 1, 4],
        [3, 1, 1, 4],
        [5, 2, 2, 6],
        [5, 0, 0, 6],
        [7, 8, 9, 10]
      ] },
      { name: '齐头并进', optimalSteps: 85, board: [
        [3, 1, 1, 4],
        [3, 1, 1, 4],
        [7, 8, 9, 10],
        [5, 2, 2, 6],
        [5, 0, 0, 6]
      ] },
      { name: '兵分三路', optimalSteps: 92, board: [
        [7, 1, 1, 8],
        [3, 1, 1, 4],
        [3, 2, 2, 4],
        [5, 9, 10, 6],
        [5, 0, 0, 6]
      ] }
    ];

    // 方块配置（img 为 Q版人物头像，zoom 用于裁掉图片圆角白边与水印）
    this.pieces = {
      0: { name: 'empty', size: { rows: 1, cols: 1 }, color: '#e0e0e0' },
      1: { name: 'caocao', size: { rows: 2, cols: 2 }, color: '#8e1f1f', label: '曹', img: '/img/hrd/caocao.png', zoom: 1.12 }, // 曹操
      2: { name: 'guanyu', size: { rows: 1, cols: 2 }, color: '#27ae60', label: '关', img: '/img/hrd/guanyu.png', zoom: 1.12 },   // 关羽横向
      3: { name: 'zhangfei', size: { rows: 2, cols: 1 }, color: '#2c3e70', label: '张', img: '/img/hrd/zhangfei.png', zoom: 1.12 }, // 张飞纵向
      4: { name: 'zhaoyun', size: { rows: 2, cols: 1 }, color: '#5dade2', label: '赵', img: '/img/hrd/zhaoyun.png', zoom: 1.12 }, // 赵云纵向
      5: { name: 'machao', size: { rows: 2, cols: 1 }, color: '#16a085', label: '马', img: '/img/hrd/machao.png', zoom: 1.12 },   // 马超纵向
      6: { name: 'huangzhong', size: { rows: 2, cols: 1 }, color: '#e67e22', label: '黄', img: '/img/hrd/huangzhong.png', zoom: 1.12 }, // 黄忠纵向
      7: { name: 'soldier1', size: { rows: 1, cols: 1 }, color: '#7f8c8d', label: '兵', img: '/img/hrd/soldier.png', zoom: 1.12 },
      8: { name: 'soldier2', size: { rows: 1, cols: 1 }, color: '#7f8c8d', label: '兵', img: '/img/hrd/soldier.png', zoom: 1.12 },
      9: { name: 'soldier3', size: { rows: 1, cols: 1 }, color: '#7f8c8d', label: '兵', img: '/img/hrd/soldier.png', zoom: 1.12 },
      10: { name: 'soldier4', size: { rows: 1, cols: 1 }, color: '#7f8c8d', label: '兵', img: '/img/hrd/soldier.png', zoom: 1.12 }
    };

    this.currentLevel = 0;
    this.selectedPiece = null; // 选中的棋子
    this.moveCount = 0;
    this.gameWon = false; // 游戏是否已获胜
    this._gesture = null; // 当前拖动/滑动手势
    this._suppressClick = false; // 拖动后抑制点击事件
    this.loadLevel(0);
    this.init();
  }

  // 加载指定关卡（支持负数与越界循环）
  loadLevel(index) {
    const count = this.levels.length;
    this.currentLevel = ((index % count) + count) % count;
    const level = this.levels[this.currentLevel];
    this.board = level.board.map(row => row.slice());
    this.moveCount = 0;
    this.selectedPiece = null;
    this.gameWon = false;
    this.hideVictoryBanner();
    this.selectDefaultPiece(); // 默认选中曹操
    this.updateLevelDisplay();
    this.updateBestDisplay();
  }

  // 切换关卡
  switchLevel(index) {
    this.loadLevel(index);
    this.renderBoard();
  }

  // 默认选中曹操
  selectDefaultPiece() {
    for (let r = 0; r < this.board.length; r++) {
      for (let c = 0; c < this.board[r].length; c++) {
        if (this.board[r][c] === 1) {
          this.selectedPiece = { pieceId: 1, row: r, col: c, piece: this.pieces[1] };
          return;
        }
      }
    }
  }

  init() {
    this.renderBoard();
    this.attachEventListeners();
  }

  renderBoard() {
    const boardElement = document.getElementById('game-board');
    if (!boardElement) {
      return;
    }

    boardElement.innerHTML = '';

    // 根据屏幕大小动态调整格子大小，解决小屏幕显示问题
    let cellWidth, cellHeight;
    const screenWidth = window.innerWidth;

    if (screenWidth < 400) {
      cellWidth = 60; // 小屏幕
      cellHeight = 60;
    } else if (screenWidth < 500) {
      cellWidth = 65; // 中等屏幕
      cellHeight = 65;
    } else {
      cellWidth = 75; // 大屏幕
      cellHeight = 75;
    }

    const boardWidth = cellWidth * this.board[0].length; // 4列
    const boardHeight = cellHeight * this.board.length; // 5行

    // 设置棋盘的固定尺寸（保持5x4，不增加高度），并允许出口显示在下方
    boardElement.style.width = `${boardWidth}px`;
    boardElement.style.height = `${boardHeight}px`; // 5行高度
    boardElement.style.position = 'relative'; // 确保子元素定位正确
    boardElement.style.margin = '0 auto'; // 居中显示
    boardElement.style.display = 'block';
    boardElement.style.overflow = 'visible'; // 允许出口元素溢出棋盘显示在下方

    // 创建棋盘格子背景（不添加任何边框，移除灰色线）
    // 只绘制5行棋盘格子，不绘制到出口区域
    for (let row = 0; row < this.board.length; row++) {
      for (let col = 0; col < this.board[row].length; col++) {
        const cellElement = document.createElement('div');
        cellElement.className = 'board-cell';
        cellElement.style.width = `${cellWidth}px`;
        cellElement.style.height = `${cellHeight}px`;
        cellElement.style.position = 'absolute';
        cellElement.style.left = `${col * cellWidth}px`;
        cellElement.style.top = `${row * cellHeight}px`;
        cellElement.style.zIndex = '1';
        cellElement.style.backgroundColor = 'transparent'; // 移除背景色
        cellElement.style.border = 'none'; // 移除所有边框
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
          // 调整棋子尺寸，确保完全适合格子
          pieceElement.style.width = `${piece.size.cols * cellWidth - 2}px`; // 减去2px避免超出边框
          pieceElement.style.height = `${piece.size.rows * cellHeight - 2}px`; // 减去2px避免超出边框
          pieceElement.style.fontSize = `${cellHeight * 0.32}px`; // 字体大小与格子大小成比例
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
          pieceElement.style.left = `${col * cellWidth}px`;
          pieceElement.style.top = `${row * cellHeight}px`;
          pieceElement.style.display = 'flex';
          pieceElement.style.justifyContent = 'center';
          pieceElement.style.alignItems = 'center';
          pieceElement.style.fontWeight = 'bold';
          pieceElement.style.color = '#2c3e50';
          pieceElement.style.cursor = 'pointer';
          pieceElement.style.zIndex = '100';
          pieceElement.style.transition = 'all 0.2s ease';
          pieceElement.style.overflow = 'hidden'; // 配合图片裁掉圆角/水印边缘
          // Q版人物头像；加载失败时回退为文字标签
          if (piece.img) {
            const img = document.createElement('img');
            img.src = piece.img;
            img.alt = piece.label;
            img.draggable = false;
            img.style.cssText = `width:100%;height:100%;object-fit:cover;object-position:center 20%;display:block;pointer-events:none;transform:scale(${piece.zoom || 1.12});`;
            img.onerror = () => {
              img.remove();
              pieceElement.textContent = piece.label;
            };
            pieceElement.appendChild(img);
          } else {
            pieceElement.textContent = piece.label;
          }
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
    // 先检查是否已有出口元素，避免重复创建
    let exitElement = boardElement.querySelector('.exit-mark');

    if (!exitElement) {
      exitElement = document.createElement('div');
      exitElement.className = 'exit-mark';
      exitElement.textContent = '出口';
      // 将出口元素添加到棋盘容器内部
      boardElement.appendChild(exitElement);
    }

    // 获取棋盘尺寸信息
    const boardWidth = boardElement.offsetWidth;
    const boardHeight = boardElement.offsetHeight;

    // 设置出口样式，显示在棋盘底部，在棋盘容器内部，不改变棋盘大小
    exitElement.style.width = '120px'; // 小于2个格子但比1个格子大
    exitElement.style.height = '60px'; // 比1个格子稍小
    exitElement.style.position = 'absolute'; // 绝对定位在棋盘容器内
    exitElement.style.left = `${(boardWidth - 120) / 2}px`; // 水平居中
    exitElement.style.top = `${boardHeight - 55}px`; // 垂直定位在棋盘底部，靠近底部边缘
    exitElement.style.border = '2px dashed #ff6b6b';
    exitElement.style.borderRadius = '5px';
    exitElement.style.display = 'flex';
    exitElement.style.justifyContent = 'center';
    exitElement.style.alignItems = 'center';
    exitElement.style.fontSize = '14px'; // 适当大小字体
    exitElement.style.fontWeight = 'bold';
    exitElement.style.color = '#ff6b6b';
    exitElement.style.background = 'rgba(255, 107, 107, 0.1)';
    exitElement.style.visibility = 'visible';
    exitElement.style.opacity = '1'; // 完全可见
    exitElement.style.zIndex = '5'; // 在棋子和棋盘中间
    exitElement.style.pointerEvents = 'none'; // 不影响交互
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

    // 关卡切换按钮
    const prevLevelBtn = document.getElementById('prev-level-btn');
    if (prevLevelBtn) {
      prevLevelBtn.addEventListener('click', () => this.switchLevel(this.currentLevel - 1));
    }
    const nextLevelBtn = document.getElementById('next-level-btn');
    if (nextLevelBtn) {
      nextLevelBtn.addEventListener('click', () => this.switchLevel(this.currentLevel + 1));
    }

    // 胜利横幅按钮
    const victoryNextBtn = document.getElementById('victory-next-btn');
    if (victoryNextBtn) {
      victoryNextBtn.addEventListener('click', () => this.switchLevel(this.currentLevel + 1));
    }
    const victoryReplayBtn = document.getElementById('victory-replay-btn');
    if (victoryReplayBtn) {
      victoryReplayBtn.addEventListener('click', () => this.restart());
    }

    const boardElement = document.getElementById('game-board');
    const SWIPE_THRESHOLD = 20; // 滑动触发阈值（像素）

    // 鼠标点击事件 - 点击方块选择，点击空白格子移动
    boardElement.addEventListener('click', (e) => {
      if (this._suppressClick) {
        return; // 拖动结束后的合成点击，忽略
      }
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

    // PC端鼠标拖动：mousedown记录起点，mousemove检测滑动，mouseup结束
    boardElement.addEventListener('mousedown', (e) => {
      const pieceElement = e.target.closest('.game-piece');
      if (!pieceElement) return;
      e.preventDefault(); // 防止拖动时选中文字
      this._gesture = {
        type: 'mouse',
        refX: e.clientX,
        refY: e.clientY,
        pieceInfo: {
          pieceId: parseInt(pieceElement.dataset.pieceId),
          row: parseInt(pieceElement.dataset.row),
          col: parseInt(pieceElement.dataset.col)
        },
        swipeSelected: false,
        swiped: false
      };
    });

    document.addEventListener('mousemove', (e) => {
      const g = this._gesture;
      if (!g || g.type !== 'mouse') return;
      this.handleSwipeMove(e.clientX, e.clientY, SWIPE_THRESHOLD, null);
    });

    document.addEventListener('mouseup', () => {
      const g = this._gesture;
      if (!g || g.type !== 'mouse') return;
      this._gesture = null;
      if (g.swiped) {
        // 抑制紧随其后的click事件，避免拖动被误判为点击
        this._suppressClick = true;
        setTimeout(() => { this._suppressClick = false; }, 0);
      }
    });

    // 触摸事件：轻点走点击逻辑，滑动走拖动逻辑
    boardElement.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      const startTarget = document.elementFromPoint(touch.clientX, touch.clientY);
      const pieceElement = startTarget ? startTarget.closest('.game-piece') : null;
      this._gesture = {
        type: 'touch',
        startX: touch.clientX,
        startY: touch.clientY,
        refX: touch.clientX,
        refY: touch.clientY,
        startTime: Date.now(),
        startTarget: startTarget,
        pieceInfo: pieceElement ? {
          pieceId: parseInt(pieceElement.dataset.pieceId),
          row: parseInt(pieceElement.dataset.row),
          col: parseInt(pieceElement.dataset.col)
        } : null,
        swipeSelected: false,
        swiped: false
      };
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      const g = this._gesture;
      if (!g || g.type !== 'touch' || !g.pieceInfo) return;
      const touch = e.touches[0];
      this.handleSwipeMove(touch.clientX, touch.clientY, SWIPE_THRESHOLD, e);
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
      const g = this._gesture;
      if (!g || g.type !== 'touch') return;
      this._gesture = null;

      if (g.swiped) {
        // 滑动手势已处理移动，阻止合成点击
        if (e.cancelable) e.preventDefault();
        return;
      }

      const touch = e.changedTouches[0];
      const touchDuration = Date.now() - g.startTime;
      const touchDistance = Math.sqrt(
        Math.pow(touch.clientX - g.startX, 2) +
        Math.pow(touch.clientY - g.startY, 2)
      );

      // 如果触摸时间短且移动距离小，视为点击操作
      if (touchDuration < 500 && touchDistance < SWIPE_THRESHOLD) {
        if (e.cancelable) e.preventDefault();

        try {
          // 使用触摸开始时的目标元素，避免触摸结束时元素位置变化
          let targetElement = g.startTarget;

          // 如果之前的目标元素不存在，尝试使用结束位置的元素
          if (!targetElement) {
            targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
          }

          if (targetElement) {
            // 查找是否点击在棋子上
            const clickedPiece = targetElement.closest('.game-piece');

            if (clickedPiece) {
              this.tryMovePiece(clickedPiece);
            } else {
              // 点击了空白格子
              if (this.selectedPiece) {
                const clickedCell = targetElement.closest('.board-cell');
                if (clickedCell) {
                  const row = parseInt(clickedCell.dataset.row);
                  const col = parseInt(clickedCell.dataset.col);
                  this.tryMoveToCell(row, col);
                }
              }
            }
          }
        } catch (error) {
          // 忽略触摸处理异常，避免影响页面其他功能
        }
      }
    }, { passive: false });
  }

  // 处理拖动/滑动移动：超过阈值时按主轴方向移动一格，移动后棋子保持选中可继续滑
  handleSwipeMove(clientX, clientY, threshold, event) {
    const g = this._gesture;
    if (!g || this.gameWon) return;

    const dx = clientX - g.refX;
    const dy = clientY - g.refY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;

    if (event && event.cancelable) event.preventDefault(); // 阻止页面滚动

    // 取滑动主轴方向
    const direction = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');

    // 首次滑动时选中起始棋子（后续滑动沿用已选中的棋子，位置随移动更新）
    if (!g.swipeSelected) {
      this.selectedPiece = {
        pieceId: g.pieceInfo.pieceId,
        row: g.pieceInfo.row,
        col: g.pieceInfo.col,
        piece: this.pieces[g.pieceInfo.pieceId]
      };
      g.swipeSelected = true;
      this.renderBoard();
    }

    this.tryMoveSelected(direction);

    // 更新参考点，支持一次手势内连续滑动多格
    g.refX = clientX;
    g.refY = clientY;
    g.swiped = true;
  }

  handleKeyDown(e) {
    const keyDirectionMap = {
      'ArrowUp': 'up', 'w': 'up', 'W': 'up',
      'ArrowDown': 'down', 's': 'down', 'S': 'down',
      'ArrowLeft': 'left', 'a': 'left', 'A': 'left',
      'ArrowRight': 'right', 'd': 'right', 'D': 'right'
    };

    // Esc/空格键取消选中
    if (e.key === 'Escape' || e.key === ' ') {
      if (this.selectedPiece) {
        this.selectedPiece = null;
        this.renderBoard();
        e.preventDefault();
      }
      return;
    }

    const direction = keyDirectionMap[e.key];
    if (!direction) return;

    e.preventDefault();

    // 未选中棋子时，方向键默认选中曹操
    if (!this.selectedPiece) {
      this.selectDefaultPiece();
      this.renderBoard();
      return;
    }

    this.tryMoveSelected(direction);
  }

  // 移动当前选中的棋子（键盘与滑动共用）
  tryMoveSelected(direction) {
    if (!this.selectedPiece || this.gameWon) return false;

    const { piece, row, col } = this.selectedPiece;
    if (this.canMoveTo(piece, row, col, direction)) {
      this.movePieceByCoordinates(piece, row, col, direction);
      return true;
    }
    return false;
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
    if (!this.selectedPiece) {
      return false;
    }

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

          return true; // 移动成功，返回true
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
    if (this.gameWon) return;

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

    // 更新步数
    this.moveCount++;

    // 如果移动的是当前选中的棋子，更新选中棋子的位置信息
    if (this.selectedPiece && this.selectedPiece.piece === piece &&
        this.selectedPiece.row === topLeftRow && this.selectedPiece.col === topLeftCol) {
      this.selectedPiece.row = newTopLeftRow;
      this.selectedPiece.col = newTopLeftCol;
    }

    // 重新渲染棋盘
    this.renderBoard();

    // 检查是否获胜
    this.checkWin();
  }

  checkWin() {
    // 检查曹操是否到达出口位置(第4行，第1、2列 - 5x4棋盘底部中央)
    if (!this.gameWon && this.board[4][1] === 1 && this.board[4][2] === 1 &&
        this.board[3][1] === 1 && this.board[3][2] === 1) {
      this.gameWon = true; // 设置游戏已获胜状态
      setTimeout(() => {
        this.showVictoryBanner();
      }, 300);
      return true;
    }
    return this.gameWon;
  }

  // 读取当前关卡的本地最佳成绩
  getBestScore() {
    try {
      const value = localStorage.getItem('hrd-best-' + this.currentLevel);
      const best = parseInt(value, 10);
      return isNaN(best) ? null : best;
    } catch (error) {
      return null;
    }
  }

  // 保存当前关卡的本地最佳成绩
  saveBestScore(score) {
    try {
      localStorage.setItem('hrd-best-' + this.currentLevel, String(score));
    } catch (error) {
      // 本地存储不可用时静默失败
    }
  }

  // 显示胜利结算横幅
  showVictoryBanner() {
    const banner = document.getElementById('victory-banner');
    if (!banner) return;

    const level = this.levels[this.currentLevel];
    const prevBest = this.getBestScore();
    const isNewRecord = prevBest === null || this.moveCount < prevBest;
    if (isNewRecord) {
      this.saveBestScore(this.moveCount);
    }
    const best = isNewRecord ? this.moveCount : prevBest;

    const detailElement = document.getElementById('victory-detail');
    if (detailElement) {
      detailElement.textContent =
        `关卡「${level.name}」 · 本局步数: ${this.moveCount} · 最佳: ${best} · 最优: ${level.optimalSteps}`;
    }

    const recordElement = document.getElementById('victory-record');
    if (recordElement) {
      if (isNewRecord && this.moveCount <= level.optimalSteps) {
        recordElement.textContent = '🏆 新纪录！已达到最优解！';
      } else if (isNewRecord) {
        recordElement.textContent = '🏆 新纪录！';
      } else if (this.moveCount <= level.optimalSteps) {
        recordElement.textContent = '⭐ 已达到最优解！';
      } else {
        recordElement.textContent = `距最优解还差 ${this.moveCount - level.optimalSteps} 步，继续挑战！`;
      }
    }

    // 最后一关通关时，下一关按钮回到第一关
    const nextBtn = document.getElementById('victory-next-btn');
    if (nextBtn) {
      nextBtn.textContent = this.currentLevel === this.levels.length - 1 ? '回到第一关' : '下一关';
    }

    banner.style.display = 'block';
    this.updateBestDisplay();
  }

  hideVictoryBanner() {
    const banner = document.getElementById('victory-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  restart() {
    // 重置为当前关卡的初始布局
    const level = this.levels[this.currentLevel];
    this.board = level.board.map(row => row.slice());
    this.moveCount = 0;
    this.selectedPiece = null; // 重置选中状态
    this.gameWon = false; // 重置游戏获胜状态
    this.hideVictoryBanner();
    this.selectDefaultPiece(); // 默认选中曹操
    this.renderBoard();
  }

  updateMoveCount() {
    const moveCountElement = document.getElementById('move-count');
    if (moveCountElement) {
      moveCountElement.textContent = this.moveCount;
    }
  }

  updateLevelDisplay() {
    const levelIndexElement = document.getElementById('level-index');
    if (levelIndexElement) {
      levelIndexElement.textContent = this.currentLevel + 1;
    }
    const levelNameElement = document.getElementById('level-name');
    if (levelNameElement) {
      levelNameElement.textContent = this.levels[this.currentLevel].name;
    }
  }

  updateBestDisplay() {
    const bestElement = document.getElementById('best-count');
    if (bestElement) {
      const best = this.getBestScore();
      bestElement.textContent = best === null ? '--' : best;
    }
    const optimalElement = document.getElementById('optimal-count');
    if (optimalElement) {
      optimalElement.textContent = this.levels[this.currentLevel].optimalSteps;
    }
  }
}

// 初始化游戏函数
function initHuaRongDao() {
  // 检查DOM元素是否存在
  const gameBoard = document.getElementById('game-board');
  if (!gameBoard) {
    return false;
  }

  try {
    new HuaRongDaoGame();
    return true;
  } catch (error) {
    return false;
  }
}

// 检查游戏容器并初始化
function checkAndInitGame(observer) {
  const gameBoard = document.getElementById('game-board');
  const gameContainer = document.getElementById('hua-rong-dao-game');

  if (gameBoard && gameContainer) {
    // 初始化游戏
    initHuaRongDao();

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
    const gamePieces = document.querySelectorAll('.game-piece');
    if (gamePieces.length === 0) {
      if (!checkAndInitGame()) {
        globalObserver = setupDOMObserver();
      }
    }
  }, 2000);

  // 5. 5秒后最后尝试
  setTimeout(function() {
    const gamePieces = document.querySelectorAll('.game-piece');
    if (gamePieces.length === 0) {
      initHuaRongDao();
    }
  }, 5000);

  // 初始化所有监听器
  globalObserver = setupDOMObserver();
  setupRouteListeners();
}
</script>

<style>
/* 游戏容器样式 */
.game-container {
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
  background-color: transparent;
  border-radius: 0;
  box-shadow: none;
  font-family: 'Microsoft YaHei', 'SimHei', sans-serif;
}

/* 游戏标题 */
.game-header {
  text-align: center;
  margin-bottom: 15px;
  padding: 15px;
  background-color: transparent;
  border-bottom: none;
}

.game-header .game-title {
  font-size: 24px;
  font-weight: bold;
  color: #2c3e50;
  margin: 0 0 10px 0;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.1);
}

/* 关卡选择器 */
.level-selector {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.level-label {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  min-width: 150px;
  display: inline-block;
}

.btn-level-switch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 20px;
  font-weight: bold;
  line-height: 1;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0;
  font-family: 'Microsoft YaHei', 'SimHei', sans-serif;
}

.btn-level-switch:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-level-switch:active {
  transform: translateY(0);
}

.game-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 20px;
  font-size: 16px;
  color: #666;
}

.stat-sep {
  color: #ccc;
}

.btn-restart {
  padding: 12px 28px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 25px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  font-family: 'Microsoft YaHei', 'SimHei', sans-serif;
}

.btn-restart:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.btn-restart:active {
  transform: translateY(0);
}

/* 胜利结算横幅 */
.victory-banner {
  max-width: 420px;
  margin: 0 auto 20px;
  padding: 20px;
  text-align: center;
  background: linear-gradient(135deg, #f6fff8 0%, #e3f9e5 100%);
  border: 2px solid #2ecc71;
  border-radius: 12px;
  box-shadow: 0 4px 15px rgba(46, 204, 113, 0.2);
}

.victory-title {
  font-size: 22px;
  font-weight: bold;
  color: #27ae60;
  margin-bottom: 10px;
}

.victory-detail {
  font-size: 14px;
  color: #2c3e50;
  margin-bottom: 6px;
  line-height: 1.6;
}

.victory-record {
  font-size: 15px;
  font-weight: 600;
  color: #e67e22;
  margin-bottom: 14px;
  min-height: 20px;
}

.victory-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-victory {
  padding: 10px 24px;
  border: none;
  border-radius: 25px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: 'Microsoft YaHei', 'SimHei', sans-serif;
}

.btn-victory.btn-next {
  background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(46, 204, 113, 0.3);
}

.btn-victory.btn-replay {
  background: white;
  color: #27ae60;
  border: 2px solid #2ecc71;
}

.btn-victory:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(46, 204, 113, 0.4);
}

.btn-victory:active {
  transform: translateY(0);
}

/* 游戏棋盘样式 */
.game-board-container {
  text-align: center;
  margin: 0 auto;
  padding: 0;
}

.game-board {
  position: relative;
  width: 100%;
  max-width: 320px;
  height: auto;
  margin: 0 auto;
  background: linear-gradient(135deg, #e8e8e8 0%, #d0d0d0 100%);
  border-radius: 10px;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: visible;
  aspect-ratio: 4/5;
}

.board-cell {
  /* 格子样式已在JavaScript中动态设置 */
}

.game-piece {
  /* 棋子样式已在JavaScript中动态设置 */
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  text-align: center !important;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

/* 游戏信息展示 */
.game-status {
  text-align: center;
  padding: 15px;
  margin: 0 15px 20px;
  background: linear-gradient(135deg, #e8f4f8 0%, #d9ecf2 100%);
  border-radius: 10px;
  font-size: 14px;
  color: #2c3e50;
  border-left: 4px solid #3498db;
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
    max-width: 100%;
    padding: 0;
  }

  .game-header .game-title {
    font-size: 22px;
  }

  .game-board {
    max-width: 90%;
    margin: 0 auto;
  }

  .game-piece {
    font-size: 20px;
  }

  .game-info {
    padding: 15px;
    margin-top: 15px;
  }
}

@media (max-width: 480px) {
  .game-container {
    max-width: 100%;
    padding: 0;
  }

  .game-header .game-title {
    font-size: 20px;
  }

  .level-label {
    min-width: 120px;
    font-size: 14px;
  }

  .game-stats {
    gap: 10px;
    font-size: 12px;
  }

  .btn-restart {
    padding: 10px 20px;
    font-size: 14px;
  }

  .victory-banner {
    margin: 0 10px 15px;
    padding: 15px;
  }

  .victory-title {
    font-size: 18px;
  }

  .game-board {
    max-width: 95%;
    margin: 0 auto;
  }

  .game-piece {
    font-size: 18px;
  }

  .game-info {
    padding: 10px;
    font-size: 14px;
  }
}

/* 小于360px屏幕的专门适配 */
@media (max-width: 360px) {
  .game-header {
    padding: 12px;
  }

  .game-header .game-title {
    font-size: 18px;
  }

  .level-label {
    min-width: 100px;
    font-size: 13px;
  }

  .game-board {
    max-width: 98%;
  }

  .game-piece {
    font-size: 16px;
  }

  .game-info {
    font-size: 12px;
  }
}
</style>
