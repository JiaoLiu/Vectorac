// ============================================================
// 五子棋引擎（gomoku/engine.js）
// 纯逻辑、无 DOM：棋盘状态、落子、胜负判定、候选点生成。
// board[y][x]：0 空 / 1 黑 / 2 白。黑棋先行。
// ============================================================

export const BOARD_SIZE = 15
export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2

export function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(EMPTY))
}

export function inBoard(x, y) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
}

export function opponentOf(color) {
  return color === BLACK ? WHITE : BLACK
}

export function isEmptyBoard(board) {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== EMPTY) return false
    }
  }
  return true
}

export function countStones(board) {
  let n = 0
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] !== EMPTY) n++
    }
  }
  return n
}

export function isFull(board) {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === EMPTY) return false
    }
  }
  return true
}

const DIRS = [
  [1, 0], // 横
  [0, 1], // 竖
  [1, 1], // 主斜
  [1, -1] // 副斜
]

/**
 * 判定最后一手 (x, y) 是否形成五连及以上。
 * 返回连成一线的坐标数组（[[x,y], ...]，≥5 颗），未胜返回 null。
 */
export function checkWin(board, x, y) {
  const color = board[y] && board[y][x]
  if (!color) return null
  for (const [dx, dy] of DIRS) {
    const line = [[x, y]]
    let nx = x + dx
    let ny = y + dy
    while (inBoard(nx, ny) && board[ny][nx] === color) {
      line.push([nx, ny])
      nx += dx
      ny += dy
    }
    nx = x - dx
    ny = y - dy
    while (inBoard(nx, ny) && board[ny][nx] === color) {
      line.unshift([nx, ny])
      nx -= dx
      ny -= dy
    }
    if (line.length >= 5) return line
  }
  return null
}

/**
 * 生成候选落点：所有已有棋子周围 range 格内的空点。
 * 空盘返回天元。按离最近棋子的距离与中心度粗略排序（近者优先）。
 */
export function getCandidateMoves(board, range = 2) {
  const set = new Set()
  let hasStone = false
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === EMPTY) continue
      hasStone = true
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (inBoard(nx, ny) && board[ny][nx] === EMPTY) set.add(ny * BOARD_SIZE + nx)
        }
      }
    }
  }
  if (!hasStone) return [[7, 7]]
  const center = (BOARD_SIZE - 1) / 2
  return [...set]
    .map((k) => [k % BOARD_SIZE, Math.floor(k / BOARD_SIZE)])
    .sort((a, b) => {
      const da = Math.abs(a[0] - center) + Math.abs(a[1] - center)
      const db = Math.abs(b[0] - center) + Math.abs(b[1] - center)
      return da - db
    })
}
