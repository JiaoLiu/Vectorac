// 中国象棋规则与轻量本地 AI。无 DOM 依赖，board[y][x] 为 null 或 { side, type, id }。
export const RED = 'red'
export const BLACK = 'black'
export const FILES = 9
export const RANKS = 10

export const PIECE_LABELS = {
  red: { K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', P: '兵' },
  black: { K: '将', A: '士', E: '象', H: '马', R: '车', C: '炮', P: '卒' }
}

export const PIECE_VALUES = { K: 100000, R: 1000, C: 520, H: 430, E: 220, A: 220, P: 100 }

export function otherSide(side) {
  return side === RED ? BLACK : RED
}

export function createInitialBoard() {
  const board = Array.from({ length: RANKS }, () => Array(FILES).fill(null))
  const backRank = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R']
  for (let x = 0; x < FILES; x++) {
    board[0][x] = { side: BLACK, type: backRank[x], id: `b-${backRank[x]}-${x}` }
    board[9][x] = { side: RED, type: backRank[x], id: `r-${backRank[x]}-${x}` }
  }
  board[2][1] = { side: BLACK, type: 'C', id: 'b-C-1' }
  board[2][7] = { side: BLACK, type: 'C', id: 'b-C-7' }
  board[7][1] = { side: RED, type: 'C', id: 'r-C-1' }
  board[7][7] = { side: RED, type: 'C', id: 'r-C-7' }
  for (const x of [0, 2, 4, 6, 8]) {
    board[3][x] = { side: BLACK, type: 'P', id: `b-P-${x}` }
    board[6][x] = { side: RED, type: 'P', id: `r-P-${x}` }
  }
  return board
}

export function cloneBoard(board) {
  return board.map((row) => row.map((piece) => piece ? { ...piece } : null))
}

export function inBounds(x, y) {
  return x >= 0 && x < FILES && y >= 0 && y < RANKS
}

function inPalace(side, x, y) {
  return x >= 3 && x <= 5 && (side === RED ? y >= 7 && y <= 9 : y >= 0 && y <= 2)
}

function pushIfAvailable(board, moves, side, fromX, fromY, toX, toY) {
  if (!inBounds(toX, toY)) return false
  const target = board[toY][toX]
  if (target && target.side === side) return false
  moves.push({ fromX, fromY, toX, toY, capture: target ? target.type : null })
  return !target
}

function pseudoMovesForPiece(board, x, y) {
  const piece = board[y] && board[y][x]
  if (!piece) return []
  const { side, type } = piece
  const moves = []
  const step = side === RED ? -1 : 1

  if (type === 'R' || type === 'C') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let nx = x + dx
      let ny = y + dy
      let screenFound = false
      while (inBounds(nx, ny)) {
        const target = board[ny][nx]
        if (type === 'R') {
          if (!pushIfAvailable(board, moves, side, x, y, nx, ny)) break
        } else if (!screenFound) {
          if (!target) moves.push({ fromX: x, fromY: y, toX: nx, toY: ny, capture: null })
          else screenFound = true
        } else if (target) {
          if (target.side !== side) moves.push({ fromX: x, fromY: y, toX: nx, toY: ny, capture: target.type })
          break
        }
        nx += dx
        ny += dy
      }
    }
  } else if (type === 'H') {
    const jumps = [
      [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0],
      [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1]
    ]
    for (const [dx, dy, legX, legY] of jumps) {
      if (!board[y + legY] || board[y + legY][x + legX]) continue
      pushIfAvailable(board, moves, side, x, y, x + dx, y + dy)
    }
  } else if (type === 'E') {
    for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const nx = x + dx
      const ny = y + dy
      if (!inBounds(nx, ny) || board[y + dy / 2][x + dx / 2]) continue
      if (side === RED ? ny < 5 : ny > 4) continue
      pushIfAvailable(board, moves, side, x, y, nx, ny)
    }
  } else if (type === 'A') {
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (inPalace(side, nx, ny)) pushIfAvailable(board, moves, side, x, y, nx, ny)
    }
  } else if (type === 'K') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (inPalace(side, nx, ny)) pushIfAvailable(board, moves, side, x, y, nx, ny)
    }
    // 将帅照面时可沿同一条线攻击；实际不允许“吃掉”对方将帅，合法走法中会过滤。
    for (let ny = y + step; inBounds(x, ny); ny += step) {
      const target = board[ny][x]
      if (target) {
        if (target.side !== side && target.type === 'K') {
          moves.push({ fromX: x, fromY: y, toX: x, toY: ny, capture: 'K' })
        }
        break
      }
    }
  } else if (type === 'P') {
    pushIfAvailable(board, moves, side, x, y, x, y + step)
    const crossed = side === RED ? y <= 4 : y >= 5
    if (crossed) {
      pushIfAvailable(board, moves, side, x, y, x - 1, y)
      pushIfAvailable(board, moves, side, x, y, x + 1, y)
    }
  }
  return moves
}

export function getPseudoLegalMoves(board, side) {
  const moves = []
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      if (board[y][x] && board[y][x].side === side) moves.push(...pseudoMovesForPiece(board, x, y))
    }
  }
  return moves
}

function applyInPlace(board, move) {
  const piece = board[move.fromY][move.fromX]
  const captured = board[move.toY][move.toX]
  board[move.toY][move.toX] = piece
  board[move.fromY][move.fromX] = null
  return { piece, captured }
}

function undoInPlace(board, move, undo) {
  board[move.fromY][move.fromX] = undo.piece
  board[move.toY][move.toX] = undo.captured
}

export function applyMove(board, move) {
  const next = cloneBoard(board)
  applyInPlace(next, move)
  return next
}

export function findGeneral(board, side) {
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const piece = board[y][x]
      if (piece && piece.side === side && piece.type === 'K') return { x, y }
    }
  }
  return null
}

export function isInCheck(board, side) {
  const general = findGeneral(board, side)
  if (!general) return true
  const enemyMoves = getPseudoLegalMoves(board, otherSide(side))
  return enemyMoves.some((move) => move.toX === general.x && move.toY === general.y)
}

export function getLegalMoves(board, side) {
  const legal = []
  for (const move of getPseudoLegalMoves(board, side)) {
    if (move.capture === 'K') continue
    const undo = applyInPlace(board, move)
    const safe = !isInCheck(board, side)
    undoInPlace(board, move, undo)
    if (safe) legal.push(move)
  }
  return legal
}

export function getMovesFrom(board, x, y, side) {
  return getLegalMoves(board, side).filter((move) => move.fromX === x && move.fromY === y)
}

export function resultForSideToMove(board, side) {
  const moves = getLegalMoves(board, side)
  if (moves.length) return null
  return { winner: otherSide(side), checkmate: isInCheck(board, side) }
}

function evaluateRed(board) {
  let score = 0
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const piece = board[y][x]
      if (!piece) continue
      const sign = piece.side === RED ? 1 : -1
      let value = PIECE_VALUES[piece.type]
      if (piece.type === 'P') {
        const advance = piece.side === RED ? 6 - y : y - 3
        value += Math.max(0, advance) * 9
        if (piece.side === RED ? y <= 4 : y >= 5) value += 38
        value += (4 - Math.abs(4 - x)) * 2
      } else if (piece.type === 'H' || piece.type === 'C') {
        value += (4 - Math.abs(4 - x)) * 3
        if (piece.type === 'H') value += Math.max(0, 4 - Math.abs(4 - y)) * 2
      } else if (piece.type === 'R') {
        value += (4 - Math.abs(4 - x)) * 2
      }
      score += sign * value
    }
  }
  if (isInCheck(board, RED)) score -= 45
  if (isInCheck(board, BLACK)) score += 45
  return score
}

function moveOrderScore(board, move) {
  const moving = board[move.fromY][move.fromX]
  const target = board[move.toY][move.toX]
  const capture = target ? PIECE_VALUES[target.type] * 10 - PIECE_VALUES[moving.type] : 0
  const central = (4 - Math.abs(4 - move.toX)) * 2
  return capture + central
}

function ordered(moves, board, limit) {
  return moves
    .map((move) => ({ move, score: moveOrderScore(board, move) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.move)
}

function search(board, side, depth, alpha, beta, ply) {
  if (depth <= 0) return quiescence(board, side, alpha, beta, ply, 3)
  const allMoves = getLegalMoves(board, side)
  if (!allMoves.length) return -1000000 + ply
  const moves = ordered(allMoves, board, depth === 1 ? 7 : 10)
  let best = -Infinity
  for (const move of moves) {
    const undo = applyInPlace(board, move)
    const value = -search(board, otherSide(side), depth - 1, -beta, -alpha, ply + 1)
    undoInPlace(board, move, undo)
    if (value > best) best = value
    if (value > alpha) alpha = value
    if (alpha >= beta) break
  }
  return best
}

// 搜索到普通层数边界时继续看完短促的吃子交换，避免把“吃了一个子、下一手马上被吃”误判成好棋。
function quiescence(board, side, alpha, beta, ply, remaining) {
  const legalMoves = getLegalMoves(board, side)
  if (!legalMoves.length) return -1000000 + ply
  const checked = isInCheck(board, side)
  const redScore = evaluateRed(board)
  const standPat = side === RED ? redScore : -redScore
  if (remaining <= 0) return standPat

  if (!checked) {
    if (standPat >= beta) return standPat
    alpha = Math.max(alpha, standPat)
  }

  const tacticalMoves = checked
    ? ordered(legalMoves, board, 12)
    : ordered(legalMoves.filter((move) => move.capture), board, 8)
  if (!tacticalMoves.length) return checked ? -1000000 + ply : standPat

  let best = checked ? -Infinity : standPat
  for (const move of tacticalMoves) {
    const undo = applyInPlace(board, move)
    const value = -quiescence(board, otherSide(side), -beta, -alpha, ply + 1, remaining - 1)
    undoInPlace(board, move, undo)
    if (value > best) best = value
    if (value > alpha) alpha = value
    if (alpha >= beta) break
  }
  return best
}

function chooseByScore(scoredMoves, difficulty, opening, rng) {
  const best = Math.max(...scoredMoves.map((item) => item.score))
  const window = difficulty === 'easy'
    ? (opening ? 230 : 160)
    : difficulty === 'hard'
      ? (opening ? 22 : 8)
      : (opening ? 92 : 38)
  const temperature = difficulty === 'easy' ? 95 : difficulty === 'hard' ? 7 : 34
  const candidates = scoredMoves.filter((item) => item.score >= best - window)
  const weighted = candidates.map((item) => ({
    ...item,
    weight: Math.exp((item.score - best) / temperature)
  }))
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  const sample = Math.min(0.999999999, Math.max(0, Number(rng()) || 0)) * total
  let cursor = 0
  for (const item of weighted) {
    cursor += item.weight
    if (sample < cursor) return item.move
  }
  return weighted[weighted.length - 1].move
}

/** 返回 AI 的一个合法着法。可注入 rng 以便测试开局变化和复现局面。 */
export function chooseMove(board, side, difficulty = 'medium', rng = Math.random) {
  const depth = difficulty === 'hard' ? 3 : difficulty === 'easy' ? 1 : 2
  const moves = ordered(getLegalMoves(board, side), board, 40)
  if (!moves.length) return null
  const scoredMoves = []
  for (const move of moves) {
    const undo = applyInPlace(board, move)
    const value = -search(board, otherSide(side), depth - 1, -Infinity, Infinity, 1)
    undoInPlace(board, move, undo)
    scoredMoves.push({ move, score: value })
  }
  const opening = board.flat().filter(Boolean).length >= 28
  return chooseByScore(scoredMoves, difficulty, opening, rng)
}
