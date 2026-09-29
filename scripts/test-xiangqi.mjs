import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RED, BLACK, createInitialBoard, getLegalMoves, getMovesFrom, isInCheck,
  chooseMove, applyMove, findGeneral, resultForSideToMove
} from '../.vuepress/components/xiangqi/engine.mjs'
import { XIANGQI_PUZZLES, createPuzzleBoard, isCorrectPuzzleChoice, getPuzzlePage } from '../.vuepress/components/xiangqi/puzzles.mjs'

function sparseBoard() {
  const board = Array.from({ length: 10 }, () => Array(9).fill(null))
  board[9][4] = { side: RED, type: 'K', id: 'red-king' }
  board[0][3] = { side: BLACK, type: 'K', id: 'black-king' }
  return board
}

function piece(board, side, type, x, y) {
  board[y][x] = { side, type, id: `${side}-${type}-${x}-${y}` }
}

function hasMove(moves, x, y) {
  return moves.some((move) => move.toX === x && move.toY === y)
}

test('initial position has 32 pieces and legal red moves', () => {
  const board = createInitialBoard()
  assert.equal(board.flat().filter(Boolean).length, 32)
  assert.ok(getLegalMoves(board, RED).length >= 30)
  assert.ok(getLegalMoves(board, BLACK).length >= 30)
})

test('horse leg blocks both jumps through the occupied leg square', () => {
  const board = sparseBoard()
  piece(board, RED, 'H', 4, 5)
  piece(board, RED, 'P', 5, 5)
  const moves = getMovesFrom(board, 4, 5, RED)
  assert.equal(hasMove(moves, 6, 6), false)
  assert.equal(hasMove(moves, 6, 4), false)
  assert.equal(hasMove(moves, 2, 6), true)
})

test('elephant cannot cross the river and cannot jump its eye', () => {
  const board = sparseBoard()
  piece(board, RED, 'E', 2, 5)
  piece(board, RED, 'P', 3, 6)
  const moves = getMovesFrom(board, 2, 5, RED)
  assert.equal(hasMove(moves, 4, 7), false)
  assert.equal(hasMove(moves, 0, 7), true)
  piece(board, RED, 'P', 1, 6)
  assert.equal(hasMove(getMovesFrom(board, 2, 5, RED), 0, 7), false)
})

test('pawn only gains horizontal moves after crossing the river', () => {
  const board = sparseBoard()
  piece(board, RED, 'P', 4, 5)
  assert.equal(hasMove(getMovesFrom(board, 4, 5, RED), 3, 5), false)
  piece(board, RED, 'P', 4, 4)
  const crossed = getMovesFrom(board, 4, 4, RED)
  assert.equal(hasMove(crossed, 3, 4), true)
  assert.equal(hasMove(crossed, 5, 4), true)
})

test('cannon captures only after exactly one screen', () => {
  const board = sparseBoard()
  piece(board, RED, 'C', 1, 5)
  piece(board, RED, 'P', 1, 7)
  piece(board, BLACK, 'R', 1, 9)
  const moves = getMovesFrom(board, 1, 5, RED)
  assert.equal(hasMove(moves, 1, 9), true)
  assert.equal(hasMove(moves, 1, 8), false)
  piece(board, RED, 'P', 1, 8)
  assert.equal(hasMove(getMovesFrom(board, 1, 5, RED), 1, 9), false)
})

test('kings may not face each other and legal moves must answer check', () => {
  const board = sparseBoard()
  board[0][3] = null
  piece(board, BLACK, 'K', 4, 0)
  assert.equal(isInCheck(board, RED), true)
  piece(board, RED, 'P', 4, 4)
  assert.equal(isInCheck(board, RED), false)

  const pinned = sparseBoard()
  piece(pinned, BLACK, 'R', 4, 0)
  piece(pinned, RED, 'R', 4, 5)
  const rookMoves = getMovesFrom(pinned, 4, 5, RED)
  assert.equal(rookMoves.some((move) => move.toX !== 4), false)
})

test('rook can capture the first enemy piece but cannot pass a blocker', () => {
  const board = sparseBoard()
  piece(board, RED, 'R', 0, 5)
  piece(board, BLACK, 'P', 0, 3)
  piece(board, RED, 'P', 0, 6)
  const moves = getMovesFrom(board, 0, 5, RED)
  assert.equal(hasMove(moves, 0, 3), true)
  assert.equal(hasMove(moves, 0, 2), false)
  assert.equal(hasMove(moves, 0, 7), false)
})

test('a trapped general with no legal reply loses by checkmate', () => {
  const board = sparseBoard()
  piece(board, BLACK, 'R', 4, 0)
  piece(board, BLACK, 'R', 0, 9)
  piece(board, BLACK, 'R', 8, 9)
  assert.deepEqual(resultForSideToMove(board, RED), { winner: BLACK, checkmate: true })
})

test('AI returns a legal move without mutating the supplied position', () => {
  const board = createInitialBoard()
  const before = JSON.stringify(board)
  const move = chooseMove(board, RED, 'easy')
  assert.ok(move)
  assert.ok(getLegalMoves(board, RED).some((legal) => JSON.stringify(legal) === JSON.stringify(move)))
  assert.equal(JSON.stringify(board), before)
  assert.equal(findGeneral(applyMove(board, move), RED).y, 9)
})

test('AI avoids the tempting opening cannon capture that loses to the next exchange', () => {
  const board = createInitialBoard()
  const move = chooseMove(board, BLACK, 'medium', () => 0)
  assert.ok(getLegalMoves(board, BLACK).some((legal) => JSON.stringify(legal) === JSON.stringify(move)))
  assert.equal(move.capture, null)
})

test('AI varies among close-quality opening moves instead of repeating one fixed line', () => {
  const board = createInitialBoard()
  const first = chooseMove(board, BLACK, 'medium', () => 0)
  const alternate = chooseMove(board, BLACK, 'medium', () => 0.999999)
  assert.notDeepEqual(alternate, first)
  assert.ok(getLegalMoves(board, BLACK).some((legal) => JSON.stringify(legal) === JSON.stringify(first)))
  assert.ok(getLegalMoves(board, BLACK).some((legal) => JSON.stringify(legal) === JSON.stringify(alternate)))
})

test('the eight introductory puzzles are legal, unique mate-in-one positions', () => {
  const puzzles = XIANGQI_PUZZLES.filter((puzzle) => puzzle.kind !== 'choice')
  assert.equal(puzzles.length, 8)
  assert.deepEqual(new Set(puzzles.map((puzzle) => puzzle.side)), new Set([RED, BLACK]))
  for (const puzzle of puzzles) {
    const board = createPuzzleBoard(puzzle)
    const opponent = puzzle.side === RED ? BLACK : RED
    assert.equal(board.flat().filter(Boolean).filter((piece) => piece.type === 'K' && piece.side === RED).length, 1, `${puzzle.id} has one red general`)
    assert.equal(board.flat().filter(Boolean).filter((piece) => piece.type === 'K' && piece.side === BLACK).length, 1, `${puzzle.id} has one black general`)
    assert.equal(isInCheck(board, puzzle.side), false, `${puzzle.id} does not start with the solver illegally in check`)
    assert.equal(isInCheck(board, opponent), false, `${puzzle.id} does not start with the opponent already checked`)
    const legal = getLegalMoves(board, puzzle.side)
    const solution = legal.find((move) => move.fromX === puzzle.solution.fromX && move.fromY === puzzle.solution.fromY && move.toX === puzzle.solution.toX && move.toY === puzzle.solution.toY)
    assert.ok(solution, `${puzzle.id} solution is legal`)
    const mates = legal.filter((move) => {
      const result = resultForSideToMove(applyMove(board, move), opponent)
      return result && result.checkmate && result.winner === puzzle.side
    })
    assert.equal(mates.length, 1, `${puzzle.id} has a single mate-in-one answer`)
    assert.deepEqual(mates[0], solution, `${puzzle.id} answer is the unique mate`)
  }
})

test('the Jianghu collection adds 108 sourced, legal win-or-draw first-move challenges', () => {
  const puzzles = XIANGQI_PUZZLES.filter((puzzle) => puzzle.kind === 'choice')
  assert.equal(puzzles.length, 108)
  assert.equal(new Set(XIANGQI_PUZZLES.map((puzzle) => puzzle.id)).size, 116)
  assert.equal(puzzles.filter((puzzle) => puzzle.target === 'red-win').length, 46)
  assert.equal(puzzles.filter((puzzle) => puzzle.target === 'draw').length, 62)

  for (const puzzle of puzzles) {
    const board = createPuzzleBoard(puzzle)
    const redMoves = getLegalMoves(board, RED)
    assert.equal(board.flat().filter((piece) => piece && piece.side === RED && piece.type === 'K').length, 1, `${puzzle.id} has one red general`)
    assert.equal(board.flat().filter((piece) => piece && piece.side === BLACK && piece.type === 'K').length, 1, `${puzzle.id} has one black general`)
    assert.equal(isInCheck(board, RED), false, `${puzzle.id} does not start with red illegally in check`)
    assert.equal(isInCheck(board, BLACK), false, `${puzzle.id} does not start with black illegally in check`)
    assert.deepEqual(puzzle.options.map((option) => option.label), ['A', 'B', 'C', 'D', 'E'], `${puzzle.id} keeps all five source choices`)
    assert.equal(puzzle.options.find((option) => option.label === 'E').move, null, `${puzzle.id} represents “none above” without inventing a move`)
    assert.match(puzzle.source, /^https:\/\/www\.bilibili\.com\/video\//)
    assert.ok(puzzle.solution === null || redMoves.some((move) => move.fromX === puzzle.solution.fromX && move.fromY === puzzle.solution.fromY && move.toX === puzzle.solution.toX && move.toY === puzzle.solution.toY), `${puzzle.id} answer move is legal when one is supplied`)
    for (const option of puzzle.options.filter((item) => item.move)) {
      assert.ok(redMoves.some((move) => move.fromX === option.move.fromX && move.fromY === option.move.fromY && move.toX === option.move.toX && move.toY === option.move.toY), `${puzzle.id} option ${option.label} is legal`)
    }
    assert.equal(isCorrectPuzzleChoice(puzzle, puzzle.answer), true)
    assert.equal(isCorrectPuzzleChoice(puzzle, puzzle.options.find((option) => option.label !== puzzle.answer).label), false)
  }
})

test('116 Xiangqi levels are paged in groups of ten rather than flooding the controls', () => {
  assert.deepEqual(getPuzzlePage(XIANGQI_PUZZLES, 0).items.map((puzzle) => puzzle.id), XIANGQI_PUZZLES.slice(0, 10).map((puzzle) => puzzle.id))
  assert.equal(getPuzzlePage(XIANGQI_PUZZLES, 11).pageCount, 12)
  assert.equal(getPuzzlePage(XIANGQI_PUZZLES, 11).items.length, 6)
  assert.equal(getPuzzlePage(XIANGQI_PUZZLES, 999).pageIndex, 11)
})
