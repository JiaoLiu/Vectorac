// ============================================================
// 五子棋 AI（gomoku/ai.js）
// 棋型评估 + alpha-beta 搜索，三档难度：
//   easy   评估弱化 + 大噪声，会漏挡，适合入门
//   medium 单层贪心：进攻分 + 防守分取最大
//   hard   必胜先赢 / 必败先挡 + 4 层 alpha-beta 搜索
// 性能关键：9 字符线型串（3^9=19683 种）得分全部走 Map 缓存。
// ============================================================

import {
  BOARD_SIZE,
  EMPTY,
  WHITE,
  inBoard,
  opponentOf,
  checkWin,
  getCandidateMoves,
  countStones
} from './engine.js'

export const LEVEL = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' }

const WIN = 100000000
const SEARCH_DEPTH = 4
const ROOT_MOVES = 12
const NODE_MOVES = 10

const SCORE = {
  FIVE: 1000000,
  OPEN_FOUR: 120000,
  FOUR: 20000,
  OPEN_THREE: 15000,
  SLEEP_THREE: 1200,
  OPEN_TWO: 600,
  SLEEP_TWO: 80,
  OPEN_ONE: 15,
  SLEEP_ONE: 3
}

// 线型表（按优先级从高到低；匹配段必须覆盖中心点=将要落子的位置）
const PATTERNS = [
  [SCORE.FIVE, ['11111']],
  [SCORE.OPEN_FOUR, ['011110']],
  [SCORE.FOUR, ['211110', '011112', '11101', '11011', '10111']],
  [SCORE.OPEN_THREE, ['011100', '001110', '010110', '011010']],
  [
    SCORE.SLEEP_THREE,
    ['211100', '001112', '210110', '011012', '010112', '211010', '10011', '11001', '10101']
  ],
  [SCORE.OPEN_TWO, ['001100', '011000', '000110', '010100', '001010', '010010']],
  [SCORE.SLEEP_TWO, ['211000', '000112', '210100', '001012', '210010', '010012', '10001']],
  [SCORE.OPEN_ONE, ['001000', '000100', '010000', '000010']],
  [SCORE.SLEEP_ONE, ['210000', '000012', '2101000', '0001012']]
]

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
]

const lineScoreCache = new Map()

/**
 * 单方向线型得分：line 为 9 字符串（中心 index=4 视为已落 color 子，
 * '1' 己方 / '2' 对方或边界 / '0' 空）。只统计覆盖中心的匹配段。
 */
function matchLine(line) {
  const cached = lineScoreCache.get(line)
  if (cached !== undefined) return cached
  const CENTER = 4
  let hit = 0
  outer: for (const [score, list] of PATTERNS) {
    for (const p of list) {
      for (let i = 0; i + p.length <= line.length; i++) {
        if (i > CENTER || i + p.length <= CENTER) continue
        if (line.substr(i, p.length) === p) {
          hit = score
          break outer
        }
      }
    }
  }
  lineScoreCache.set(line, hit)
  return hit
}

/** 评估在 (x, y) 落 color 子的棋型总分（4 个方向求和） */
export function scorePoint(board, x, y, color) {
  let total = 0
  for (const [dx, dy] of DIRS) {
    let line = ''
    for (let k = -4; k <= 4; k++) {
      const nx = x + dx * k
      const ny = y + dy * k
      if (k === 0) {
        line += '1'
      } else if (!inBoard(nx, ny)) {
        line += '2'
      } else {
        const v = board[ny][nx]
        line += v === EMPTY ? '0' : v === color ? '1' : '2'
      }
    }
    total += matchLine(line)
  }
  return total
}

/** 生成按当前行棋方视角排序的候选点（进攻 + 防守加权），取前 n 个 */
function orderedMoves(board, color, n) {
  const opp = opponentOf(color)
  const cands = getCandidateMoves(board, 2)
  const scored = cands.map(([x, y]) => {
    const attack = scorePoint(board, x, y, color)
    const defense = scorePoint(board, x, y, opp)
    return { x, y, s: attack + defense * 0.9 }
  })
  scored.sort((a, b) => b.s - a.s)
  return scored.slice(0, n)
}

/** 取某方得分最高的两个落点分（用于叶节点局势评估） */
function topTwoPointScores(board, color) {
  const cands = getCandidateMoves(board, 2)
  let first = 0
  let second = 0
  for (const [x, y] of cands) {
    const s = scorePoint(board, x, y, color)
    if (s > first) {
      second = first
      first = s
    } else if (s > second) {
      second = s
    }
  }
  return [first, second]
}

/** 叶节点评估（color 视角）：己方最优两手潜力 − 对方最优两手潜力（防守略加权） */
function evaluate(board, color) {
  const [m1, m2] = topTwoPointScores(board, color)
  const [o1, o2] = topTwoPointScores(board, opponentOf(color))
  return m1 + m2 * 0.5 - (o1 + o2 * 0.5) * 1.1
}

function negamax(board, depth, alpha, beta, color, ply) {
  const moves = orderedMoves(board, color, NODE_MOVES)
  if (!moves.length) return 0
  const opp = opponentOf(color)
  let best = -Infinity
  for (const { x, y } of moves) {
    board[y][x] = color
    let v
    if (checkWin(board, x, y)) v = WIN - ply // 越快赢越好
    else if (depth <= 1) v = evaluate(board, color)
    else v = -negamax(board, depth - 1, -beta, -alpha, opp, ply + 1)
    board[y][x] = EMPTY
    if (v > best) best = v
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

/** 困难档：根节点选择 */
function hardMove(board, color) {
  const opp = opponentOf(color)
  const cands = getCandidateMoves(board, 2)

  // 1) 自己能五连，直接赢
  for (const [x, y] of cands) {
    board[y][x] = color
    const win = checkWin(board, x, y)
    board[y][x] = EMPTY
    if (win) return { x, y }
  }

  // 2) 对方下一手能五连，必须挡（多个五连点则败势已定，挡棋型分最高的）
  const oppWins = []
  for (const [x, y] of cands) {
    board[y][x] = opp
    const win = checkWin(board, x, y)
    board[y][x] = EMPTY
    if (win) oppWins.push([x, y])
  }
  if (oppWins.length) {
    let bestPt = oppWins[0]
    let bestScore = -1
    for (const [x, y] of oppWins) {
      const s = scorePoint(board, x, y, opp)
      if (s > bestScore) {
        bestScore = s
        bestPt = [x, y]
      }
    }
    return { x: bestPt[0], y: bestPt[1] }
  }

  // 3) alpha-beta 搜索
  const ordered = orderedMoves(board, color, ROOT_MOVES)
  let best = -Infinity
  let pool = []
  for (const { x, y } of ordered) {
    board[y][x] = color
    let v
    if (checkWin(board, x, y)) v = WIN
    else v = -negamax(board, SEARCH_DEPTH - 1, -Infinity, Infinity, opp, 1)
    board[y][x] = EMPTY
    if (v > best) {
      best = v
      pool = [{ x, y }]
    } else if (v === best) {
      pool.push({ x, y })
    }
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * 选择一手棋。返回 { x, y }；无可下返回 null。
 * @param {number[][]} board
 * @param {number} color 当前 AI 执子颜色
 * @param {string} level easy | medium | hard
 */
export function chooseMove(board, color, level = LEVEL.MEDIUM) {
  const stones = countStones(board)

  // 开局定式（轻量）：AI 执黑首手下天元；执白首手下对方斜角
  if (stones === 0) return { x: 7, y: 7 }
  if (stones === 1 && color === WHITE) {
    const cands = []
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (board[y][x] !== EMPTY) {
          for (const [dx, dy] of [
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1]
          ]) {
            const nx = x + dx
            const ny = y + dy
            if (inBoard(nx, ny) && board[ny][nx] === EMPTY) cands.push({ x: nx, y: ny })
          }
        }
      }
    }
    if (cands.length) return cands[Math.floor(Math.random() * cands.length)]
  }

  if (level === LEVEL.HARD) return hardMove(board, color)

  const opp = opponentOf(color)
  const cands = getCandidateMoves(board, 2)
  if (!cands.length) return null

  let best = -Infinity
  let bestPt = null
  for (const [x, y] of cands) {
    const attack = scorePoint(board, x, y, color)
    const defense = scorePoint(board, x, y, opp)
    let total
    if (level === LEVEL.EASY) {
      // 弱化攻防 + 大噪声：会漏挡、走出随手棋
      total = attack * 0.6 + defense * 0.45 + Math.random() * 4000
    } else {
      total = attack + defense * 0.95 + Math.random() * 200
    }
    if (total > best) {
      best = total
      bestPt = { x, y }
    }
  }
  return bestPt
}
