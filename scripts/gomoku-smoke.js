// 临时验证脚本：五子棋引擎 + AI 正确性冒烟测试
import { createBoard, checkWin, getCandidateMoves, BLACK, WHITE } from '../.vuepress/components/gomoku/engine.js'
import { chooseMove, scorePoint } from '../.vuepress/components/gomoku/ai.js'

let pass = 0
let fail = 0
function assert(cond, name) {
  if (cond) { pass++ } else { fail++; console.error('FAIL:', name) }
}

// 1. 胜负判定：横/竖/斜
{
  const b = createBoard()
  for (let i = 0; i < 5; i++) b[7][3 + i] = BLACK
  assert(checkWin(b, 5, 7)?.length === 5, '横向五连')
}
{
  const b = createBoard()
  for (let i = 0; i < 5; i++) b[2 + i][9] = WHITE
  assert(checkWin(b, 9, 4)?.length === 5, '竖向五连')
}
{
  const b = createBoard()
  for (let i = 0; i < 5; i++) b[3 + i][3 + i] = BLACK
  assert(checkWin(b, 5, 5)?.length === 5, '主斜五连')
}
{
  const b = createBoard()
  for (let i = 0; i < 5; i++) b[3 + i][11 - i] = WHITE
  assert(checkWin(b, 9, 5)?.length === 5, '副斜五连')
}
{
  const b = createBoard()
  for (let i = 0; i < 4; i++) b[7][3 + i] = BLACK
  assert(checkWin(b, 6, 7) === null, '四连不算赢')
}

// 2. 棋型评估：活四 > 冲四 > 活三
{
  const b = createBoard()
  // 黑已有 3 子，落第 4 子后两端皆空 → 活四
  b[7][5] = BLACK; b[7][6] = BLACK; b[7][7] = BLACK
  const sOpenFour = scorePoint(b, 4, 7, BLACK)
  assert(sOpenFour >= 100000, `活四得分 ${sOpenFour} >= 100000`)
}
{
  const b = createBoard()
  b[7][4] = WHITE // 堵一端
  b[7][5] = BLACK; b[7][6] = BLACK; b[7][7] = BLACK
  const sFour = scorePoint(b, 8, 7, BLACK)
  assert(sFour >= 10000 && sFour < 100000, `冲四得分 ${sFour} 在 [10000,100000)`)
}
{
  const b = createBoard()
  b[7][5] = BLACK; b[7][6] = BLACK
  const sThree = scorePoint(b, 4, 7, BLACK)
  assert(sThree >= 5000 && sThree < 100000, `活三得分 ${sThree} 在 [5000,100000)`)
}

// 3. AI：困难档必须赢棋时直接赢
{
  const b = createBoard()
  b[7][3] = WHITE; b[7][4] = WHITE; b[7][5] = WHITE; b[7][6] = WHITE // AI(白) 四子
  b[5][5] = BLACK; b[6][6] = BLACK
  const m = chooseMove(b, WHITE, 'hard')
  assert((m.x === 2 && m.y === 7) || (m.x === 7 && m.y === 7), `AI 直接五连: (${m.x},${m.y})`)
}

// 4. AI：困难档必须挡对方四连
{
  const b = createBoard()
  b[7][3] = BLACK; b[7][4] = BLACK; b[7][5] = BLACK; b[7][6] = BLACK // 玩家(黑) 四子
  b[4][4] = WHITE; b[5][5] = WHITE
  const m = chooseMove(b, WHITE, 'hard')
  assert((m.x === 2 && m.y === 7) || (m.x === 7 && m.y === 7), `AI 挡四连: (${m.x},${m.y})`)
}

// 5. AI：困难档挡活三（对方活三，AI 应手）
{
  const b = createBoard()
  b[7][5] = BLACK; b[7][6] = BLACK; b[7][7] = BLACK // 黑活三
  b[3][3] = WHITE; b[4][4] = WHITE
  const m = chooseMove(b, WHITE, 'hard')
  // 应在 7 行附近应（挡三或造自己威胁）
  assert(Math.abs(m.y - 7) <= 1 || scorePoint(b, m.x, m.y, WHITE) >= 10000, `AI 应对活三: (${m.x},${m.y})`)
}

// 6. AI：首手天元
{
  const b = createBoard()
  const m = chooseMove(b, BLACK, 'hard')
  assert(m.x === 7 && m.y === 7, '空盘下天元')
}

// 7. 候选点生成
{
  const b = createBoard()
  b[7][7] = BLACK
  const c = getCandidateMoves(b, 1)
  assert(c.length === 8, `单子 range=1 候选 8 个，实际 ${c.length}`)
}

// 8. 完整对局冒烟：AI vs AI 不崩溃且能分出胜负或下满
{
  const b = createBoard()
  let color = BLACK
  let moves = 0
  let winner = null
  while (moves < 225) {
    const m = chooseMove(b, color, moves % 2 === 0 ? 'medium' : 'easy')
    if (!m) break
    b[m.y][m.x] = color
    moves++
    if (checkWin(b, m.x, m.y)) { winner = color; break }
    color = color === BLACK ? WHITE : BLACK
  }
  assert(moves > 10, `AI 对弈进行 ${moves} 手`)
  console.log(`  （冒烟对局：${moves} 手，${winner ? (winner === 1 ? '黑胜' : '白胜') : '平局/未分'}）`)
}

// 9. 困难档性能：中盘一手耗时
{
  const b = createBoard()
  // 摆一个中盘局面
  const preset = [[7,7,BLACK],[7,8,WHITE],[8,7,BLACK],[6,8,WHITE],[9,7,BLACK],[7,9,WHITE],[6,6,BLACK],[8,8,WHITE],[5,5,BLACK],[9,9,WHITE]]
  for (const [x,y,c] of preset) b[y][x] = c
  const t0 = Date.now()
  const m = chooseMove(b, BLACK, 'hard')
  const dt = Date.now() - t0
  console.log(`  （困难档中盘一手耗时 ${dt}ms，落子 (${m.x},${m.y})）`)
  assert(dt < 3000, `困难档耗时 ${dt}ms < 3000ms`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
