import { JIANGHU108 } from './jianghu108.mjs'

// 入门组：本项目原创编排，练习一步绝杀。
// pieces: [side, type, file, rank]；solution 为唯一的一步将死着。
export const XIANGQI_PUZZLES = [
  {
    id: 'horse-screen',
    title: '马作炮架',
    lesson: '马跳到炮前，借马为架，封死将门。',
    side: 'red',
    pieces: [['black', 'K', 4, 0], ['red', 'H', 2, 3], ['red', 'C', 4, 3], ['red', 'K', 4, 9]],
    solution: { fromX: 2, fromY: 3, toX: 4, toY: 2 }
  },
  {
    id: 'rook-file',
    title: '车封宫门',
    lesson: '找准将门旁的纵线，一车压住九宫退路。',
    side: 'red',
    pieces: [['black', 'K', 4, 0], ['black', 'E', 4, 1], ['red', 'R', 6, 4], ['red', 'K', 4, 9]],
    solution: { fromX: 6, fromY: 4, toX: 6, toY: 0 }
  },
  {
    id: 'rook-bottom-rank',
    title: '车压底线',
    lesson: '黑车切入底线，红帅无处可逃。',
    side: 'black',
    pieces: [['black', 'K', 4, 0], ['black', 'R', 2, 7], ['black', 'P', 4, 7], ['black', 'H', 4, 8], ['red', 'K', 4, 9]],
    solution: { fromX: 2, fromY: 7, toX: 2, toY: 9 }
  },
  {
    id: 'horse-cannon-net',
    title: '马炮连环',
    lesson: '马先占位，炮借子作架，形成贴身绝杀。',
    side: 'black',
    pieces: [['black', 'K', 4, 0], ['black', 'H', 5, 5], ['black', 'C', 4, 6], ['red', 'H', 7, 6], ['red', 'K', 4, 9]],
    solution: { fromX: 5, fromY: 5, toX: 4, toY: 7 }
  },
  {
    id: 'cannon-screen',
    title: '炮借马架',
    lesson: '平炮成线，让马成为炮架，封住将的退路。',
    side: 'red',
    pieces: [['black', 'K', 4, 0], ['red', 'H', 4, 2], ['red', 'C', 5, 4], ['red', 'K', 4, 9]],
    solution: { fromX: 5, fromY: 4, toX: 4, toY: 4 }
  },
  {
    id: 'rook-palace',
    title: '横车锁宫',
    lesson: '车从侧翼横切，利用宫内棋子堵住将门。',
    side: 'red',
    pieces: [['black', 'K', 4, 0], ['black', 'E', 4, 1], ['black', 'R', 6, 1], ['red', 'R', 2, 2], ['red', 'H', 6, 3], ['red', 'K', 4, 9]],
    solution: { fromX: 2, fromY: 2, toX: 2, toY: 0 }
  },
  {
    id: 'cannon-and-horse',
    title: '炮马封门',
    lesson: '炮移到中路，马守住炮架，完成连续封锁。',
    side: 'black',
    pieces: [['black', 'K', 4, 0], ['black', 'C', 6, 5], ['black', 'H', 4, 7], ['black', 'H', 6, 9], ['red', 'K', 4, 9]],
    solution: { fromX: 6, fromY: 5, toX: 4, toY: 5 }
  },
  {
    id: 'horse-door',
    title: '跃马封门',
    lesson: '马跳入关键点，借炮照将，最后一关考验子力配合。',
    side: 'black',
    pieces: [['black', 'K', 4, 0], ['black', 'R', 2, 6], ['black', 'C', 4, 6], ['black', 'H', 6, 6], ['red', 'K', 4, 9]],
    solution: { fromX: 6, fromY: 6, toX: 4, toY: 7 }
  },
  // 进阶组：108 道江湖残局首着判断题，采用原题的“红胜 / 谋和”目标和选项。
  ...JIANGHU108.map((puzzle) => ({
    ...puzzle,
    lesson: `江湖残局 · 红先，目标：${puzzle.target === 'draw' ? '谋和' : '取胜'}。从候选首着中找正解；红方视角左下为 A1，“+”将军，“x”吃子。`,
    solution: puzzle.options.find((option) => option.label === puzzle.answer).move
  }))
]

export function isCorrectPuzzleChoice(puzzle, answer) {
  return puzzle.kind === 'choice' && puzzle.answer === answer
}

export function getPuzzlePage(puzzles, page, pageSize = 10) {
  const pageCount = Math.max(1, Math.ceil(puzzles.length / pageSize))
  const pageIndex = Math.max(0, Math.min(pageCount - 1, Number.isInteger(page) ? page : 0))
  const startIndex = pageIndex * pageSize
  return { pageIndex, pageCount, startIndex, items: puzzles.slice(startIndex, startIndex + pageSize) }
}

export function createPuzzleBoard(puzzle) {
  const board = Array.from({ length: 10 }, () => Array(9).fill(null))
  for (const [side, type, x, y] of puzzle.pieces) {
    board[y][x] = { side, type, id: `${puzzle.id}-${side}-${type}-${x}-${y}` }
  }
  return board
}
