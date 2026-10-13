// 四国军棋：纯规则引擎。棋盘拓扑、隐藏视图与 AI 不依赖 DOM。
export const RULE_VERSION = 1
export const ARMIES = ['青龙', '赤虎', '玄武', '朱雀']
// Physical clockwise order on the cross board: bottom, left, top, right.
const NEXT_CLOCKWISE_SEAT = Object.freeze([1, 2, 3, 0])
export function nextClockwiseSeat(seat) { return NEXT_CLOCKWISE_SEAT[seat] }
export const TYPES = {
  flag: { name: '军旗', count: 1, rank: 0 }, mine: { name: '地雷', count: 3, rank: 0 },
  bomb: { name: '炸弹', count: 2, rank: 0 }, engineer: { name: '工兵', count: 3, rank: 1 },
  platoon: { name: '排长', count: 3, rank: 2 }, company: { name: '连长', count: 3, rank: 3 },
  battalion: { name: '营长', count: 2, rank: 4 }, regiment: { name: '团长', count: 2, rank: 5 },
  brigade: { name: '旅长', count: 2, rank: 6 }, division: { name: '师长', count: 2, rank: 7 },
  general: { name: '军长', count: 1, rank: 8 }, commander: { name: '司令', count: 1, rank: 9 }
}
export const team = seat => seat % 2
export const armyNode = (seat, row, col) => `${seat}:${row}:${col}`
function rotate(x, y, seat) { for (let i = 0; i < seat; i++) { const t = x; x = -y; y = t } return [x + 8, y + 8] }
function buildBoard() {
  const nodes = [], byId = {}, edges = [], adjacency = {}
  const addNode = n => { nodes.push(n); byId[n.id] = n; adjacency[n.id] = [] }
  for (let s = 0; s < 4; s++) for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
    const camp = (r === 1 || r === 3) && (c === 1 || c === 3) || r === 2 && c === 2
    const hq = r === 5 && (c === 1 || c === 3), [x, y] = rotate(c - 2, r + 3, s)
    addNode({ id: armyNode(s, r, c), seat: s, row: r, col: c, x, y, kind: camp ? 'camp' : hq ? 'hq' : 'station' })
  }
  for (let y = 6; y <= 10; y += 2) for (let x = 6; x <= 10; x += 2) addNode({ id: `c:${x}:${y}`, x, y, seat: -1, kind: 'junction' })
  const addEdge = (a, b, rail, curve = false, start, end) => {
    const na = byId[a], nb = byId[b]
    const dir = [Math.sign(nb.x - na.x), Math.sign(nb.y - na.y)]
    start = start || dir; end = end || dir
    edges.push({ a, b, rail, curve })
    adjacency[a].push({ to: b, rail, start, end })
    adjacency[b].push({ to: a, rail, start: end.map(v => -v), end: start.map(v => -v) })
  }
  for (let s = 0; s < 4; s++) for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
    const id = armyNode(s, r, c)
    if (c < 4) addEdge(id, armyNode(s, r, c + 1), r === 0 || r === 4)
    if (r < 5) addEdge(id, armyNode(s, r + 1, c), r < 4 && (c === 0 || c === 4))
    if (r < 5) for (const dc of [-1, 1]) if (c + dc >= 0 && c + dc < 5) {
      const to = armyNode(s, r + 1, c + dc)
      if (byId[id].kind === 'camp' || byId[to].kind === 'camp') addEdge(id, to, false)
    }
  }
  for (const n of nodes.filter(n => n.seat === -1)) {
    if (n.x < 10) addEdge(n.id, `c:${n.x + 2}:${n.y}`, true)
    if (n.y < 10) addEdge(n.id, `c:${n.x}:${n.y + 2}`, true)
  }
  for (let s = 0; s < 4; s++) {
    for (const c of [0, 2, 4]) {
      const [x, y] = rotate(c - 2, 2, s)
      addEdge(armyNode(s, 0, c), `c:${x}:${y}`, true)
    }
    // 四条弧形铁路：普通棋子可顺弧线，不等于能在九宫直角转弯。
    const a = armyNode(s, 0, 0), b = armyNode((s + 1) % 4, 0, 4)
    const startPoint = rotate(0, -1, s), endPoint = rotate(-1, 0, s)
    addEdge(a, b, true, true, startPoint.map(v => v - 8), endPoint.map(v => v - 8))
  }
  return { nodes, byId, edges, adjacency }
}
export const BOARD = buildBoard()
function random(state) { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296 }
function shuffled(items, state) { const a = items.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random(state) * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
export function canDeploy(type, node, seat) {
  return !!node && node.seat === seat && node.kind !== 'camp' &&
    (type !== 'flag' || node.kind === 'hq') && (type !== 'mine' || node.row >= 4) && (type !== 'bomb' || node.row > 0)
}
export function formation(state, seat) {
  const slots = BOARD.nodes.filter(n => n.seat === seat && n.kind !== 'camp'), pieces = []
  const flagCol = random(state) < .5 ? 1 : 3
  for (const type of ['flag', 'mine', 'bomb', 'commander', 'general', 'division', 'brigade', 'regiment', 'battalion', 'company', 'platoon', 'engineer']) {
    for (let i = 0; i < TYPES[type].count; i++) {
      const choices = slots.filter(n => canDeploy(type, n, seat) && !pieces.some(p => p.pos === n.id))
      // Randomized defensive formations: protect the flag, never imprison a major
      // officer in the spare HQ, and keep bombs behind the first wave.
      const scored = choices.map(n => ({ n, score: random(state) * 3 +
        (type === 'flag' ? n.col === flagCol ? 20 : 0 :
          type === 'mine' ? (n.kind === 'hq' ? 15 : 5 - Math.abs(n.col - flagCol) - Math.abs(n.row - 5)) :
            type === 'bomb' ? (n.row === 2 || n.row === 3 ? 6 : 0) :
              TYPES[type].rank >= 6 ? (n.row <= 2 ? 4 : 0) - (n.kind === 'hq' ? 30 : 0) : 0) }))
      scored.sort((a,b) => b.score-a.score)
      const node = scored[0].n
      pieces.push({ id: `${seat}-${type}-${i}`, seat, type, pos: node.id, moved: false })
    }
  }
  return pieces
}
export function createGame({ seed = Date.now(), mode = 'dark' } = {}) {
  const s = { version: RULE_VERSION, seed: seed >>> 0, phase: 'setup', mode, turn: 0, turns: 0, quiet: 0, pieces: [], alive: [true, true, true, true], flags: [false, false, false, false], logs: [], lastMove: null, winner: null }
  for (let seat = 0; seat < 4; seat++) s.pieces.push(...formation(s, seat))
  return s
}
export function randomizeFormation(s, seat = 0) { if (s.phase !== 'setup') return false; s.pieces = s.pieces.filter(p => p.seat !== seat).concat(formation(s, seat)); return true }
export function swapFormation(s, first, second) {
  if (s.phase !== 'setup') return false
  const a = s.pieces.find(p => p.id === first), b = s.pieces.find(p => p.id === second)
  if (!a || !b || a.seat !== b.seat || !canDeploy(a.type, BOARD.byId[b.pos], a.seat) || !canDeploy(b.type, BOARD.byId[a.pos], b.seat)) return false
  ;[a.pos, b.pos] = [b.pos, a.pos]; return true
}
// 掷骰只定先手：之后各家始终按棋盘座次顺时针轮行。
// 四方各掷两颗骰子，点数之和最大者先行；并列最高点时只在并列者之间重掷。
export function rollOpening(s) {
  let contenders = [0, 1, 2, 3].filter(seat => s.alive[seat])
  const rounds = []
  while (contenders.length > 1) {
    const rolls = contenders.map(seat => ({ seat, dice: [1 + Math.floor(random(s) * 6), 1 + Math.floor(random(s) * 6)] }))
    rounds.push(rolls)
    const best = Math.max(...rolls.map(r => r.dice[0] + r.dice[1]))
    contenders = rolls.filter(r => r.dice[0] + r.dice[1] === best).map(r => r.seat)
  }
  return { rounds, first: contenders[0] }
}
export function startGame(s, opening) {
  if (s.phase !== 'setup') return false
  const roll = opening || rollOpening(s)
  const round = roll.rounds[roll.rounds.length - 1] || []
  s.phase = 'play'; s.turn = roll.first
  s.logs = [`${ARMIES[roll.first]}掷骰得先手；之后固定按座次顺时针轮行。`,
    '定先手点数：' + round.map(r => `${ARMIES[r.seat]} ${r.dice[0] + r.dice[1]}`).join('、') + (roll.rounds.length > 1 ? `（并列最高点重掷 ${roll.rounds.length - 1} 次）` : '')]
  settleTurn(s); return true
}
export function at(s, pos) { return s.pieces.find(p => p.pos === pos) }
export function legalMoves(s, pieceId) {
  const p = s.pieces.find(p => p.id === pieceId)
  if (!p || !s.alive[p.seat] || p.type === 'flag' || p.type === 'mine' || BOARD.byId[p.pos].kind === 'hq') return []
  const occupied = new Map(s.pieces.map(p => [p.pos, p])), result = new Set()
  const allowed = pos => {
    const target = occupied.get(pos)
    return !target || team(target.seat) !== team(p.seat) && BOARD.byId[pos].kind !== 'camp'
  }
  for (const edge of BOARD.adjacency[p.pos]) if (allowed(edge.to)) result.add(edge.to)
  const queue = [{ pos: p.pos, dir: null }], visited = new Set()
  while (queue.length) {
    const current = queue.shift()
    for (const edge of BOARD.adjacency[current.pos]) {
      if (!edge.rail || edge.to === p.pos) continue
      if (p.type !== 'engineer' && current.dir && (current.dir[0] !== edge.start[0] || current.dir[1] !== edge.start[1])) continue
      if (allowed(edge.to)) result.add(edge.to)
      if (occupied.has(edge.to)) continue
      const key = edge.to + ':' + edge.end.join(',')
      if (visited.has(key)) continue
      visited.add(key); queue.push({ pos: edge.to, dir: edge.end })
    }
  }
  return Array.from(result)
}
export function battle(a, b) {
  if (a === 'bomb' || b === 'bomb') return 'both'
  if (b === 'flag') return 'win'
  if (b === 'mine') return a === 'engineer' ? 'win' : 'lose'
  return TYPES[a].rank === TYPES[b].rank ? 'both' : TYPES[a].rank > TYPES[b].rank ? 'win' : 'lose'
}
// 情报标记缩写：假设池收窄到单一类型 → 军衔单字；全为师长以上 → 「大」
const SHORT_NAMES = { flag: '旗', mine: '雷', bomb: '炸', engineer: '兵', platoon: '排', company: '连', battalion: '营', regiment: '团', brigade: '旅', division: '师', general: '军', commander: '司' }
/**
 * 从假设池生成玩家可读的推断标记（QQ 军棋式辅助记忆）。
 * 数据源 s.intel[viewer:pieceId] 只在「我方明子亲自参战」时记录——
 * 队友被吃而没开双明时池不存在，自然不标（玩家无法推断）。
 * 池只剩一种类型（如吃军长存活必是司令）→ 标军衔；
 * 池全部 ≥ 师长（如吃旅长存活）→ 标「大」；信息量不足不标。
 */
export function badgeOf(pool) {
  if (!Array.isArray(pool) || !pool.length) return null
  const ok = pool.filter(t => TYPES[t])
  if (ok.length === 1) return SHORT_NAMES[ok[0]]
  if (ok.length && ok.every(t => TYPES[t].rank >= 7)) return '大'
  return null
}
function eliminate(s, seat, reason) { s.alive[seat] = false; s.pieces = s.pieces.filter(p => p.seat !== seat); s.logs.unshift(`${ARMIES[seat]}${reason}，全军退出；队友继续作战。`) }
function checkWinner(s) {
  for (const t of [0, 1]) if (!s.alive.some((a, i) => a && team(i) === t)) { s.phase = 'finished'; s.winner = 1 - t; return true }
  return false
}
const movable = (s, seat) => s.pieces.some(p => p.seat === seat && legalMoves(s, p.id).length)
// 无棋可走立即判负，不再等轮行才发现：每次落子后即刻清算所有存活方
// （棋子被吃完只剩旗/雷，或全被封堵，都当场出局）。出局方棋子离场可能
// 解除对其他家的封堵，故循环清算至没有新出局为止，避免误杀。
function sweepImmobile(s) {
  let again = true
  while (again) {
    again = false
    for (let seat = 0; seat < 4; seat++) if (s.alive[seat] && !movable(s, seat)) { eliminate(s, seat, '无棋可走'); again = true }
  }
}
function settleTurn(s) {
  if (checkWinner(s)) return
  for (let i = 0; i < 4; i++) {
    if (s.alive[s.turn]) {
      if (s.pieces.some(p => p.seat === s.turn && legalMoves(s, p.id).length)) return
      eliminate(s, s.turn, '无棋可走')
      if (checkWinner(s)) return
    }
    s.turn = nextClockwiseSeat(s.turn)
  }
}
export function move(s, pieceId, to) {
  const p = s.pieces.find(p => p.id === pieceId)
  if (s.phase !== 'play' || !p || p.seat !== s.turn || !legalMoves(s, pieceId).includes(to)) return false
  const target = at(s, to), from = p.pos
  let outcome = 'move'
  if (target) {
    outcome = battle(p.type, target.type)
    // Only combatants learn bounds from their own known piece and the public
    // result. 双明队友看得见参战己方棋子的身份，同样能从公开结果推断，
    // 一并获得情报；四暗队友看不见队友棋子，不能推断，不记录。
    s.intel = s.intel || {}
    const viewers = [p.seat, target.seat]
    if (s.mode === 'dual') viewers.push((p.seat + 2) % 4, (target.seat + 2) % 4)
    const onPside = viewer => viewer === p.seat || (s.mode === 'dual' && team(viewer) === team(p.seat))
    for (const viewer of viewers) {
      const onP = onPside(viewer)
      const other = onP ? target : p
      const known = onP ? p.type : target.type
      const key = viewer + ':' + other.id
      const prior = s.intel[key] || Object.keys(TYPES)
      s.intel[key] = prior.filter(t => (onP ? battle(known, t) : battle(t, known)) === outcome)
    }
    // 同归于尽互锁：viewer 确认敌方阵亡子的类型（= 自己方参战子类型），
    // 计入死亡配额。敌方两颗炸弹都换掉后，其未知存活子必非炸弹。
    if (outcome === 'both') {
      s.dead = s.dead || {}
      for (const viewer of viewers) {
        const onP = onPside(viewer)
        const foeSeat = onP ? target.seat : p.seat
        const deadType = onP ? target.type : p.type
        const m = s.dead[viewer] = s.dead[viewer] || {}
        const k = foeSeat + ':' + deadType
        m[k] = (m[k] || 0) + 1
      }
    }
    const dead = outcome === 'win' ? [target] : outcome === 'lose' ? [p] : [p, target]
    for (const d of dead) if (d.type === 'commander') { s.flags[d.seat] = true; s.logs.unshift(`${ARMIES[d.seat]}司令阵亡，军旗亮出。`) }
    s.pieces = s.pieces.filter(q => !dead.includes(q))
    if (outcome === 'win') p.pos = to
    for (const d of dead) if (d.type === 'flag') eliminate(s, d.seat, '军旗被夺')
    s.quiet = 0
  } else { p.pos = to; s.quiet++ }
  p.moved = true
  p.recent = (p.recent || []).concat(from).slice(-6)
  s.turns++; s.lastMove = { from, to, seat: p.seat, outcome }
  s.logs.unshift(`${ARMIES[p.seat]}${target ? '进攻' + ARMIES[target.seat] + '：' + ({ win: '攻方胜', lose: '守方胜', both: '同归于尽' })[outcome] : '调动棋子'}。`)
  s.logs = s.logs.slice(0, 60)
  sweepImmobile(s)
  if (checkWinner(s)) return true
  if (s.quiet >= 70) { s.phase = 'finished'; s.winner = 'draw'; s.logs.unshift('连续 70 手无碰撞，和棋。'); return true }
  s.turn = nextClockwiseSeat(s.turn); settleTurn(s); return true
}
export function surrender(s, seat) {
  if (s.phase !== 'play' || !s.alive[seat]) return false
  eliminate(s, seat, '投降'); if (!checkWinner(s)) settleTurn(s); return true
}
export function visibleType(s, p, viewer = 0) {
  if (s.mode === 'open' || p.seat === viewer || s.mode === 'dual' && team(p.seat) === team(viewer) || p.type === 'flag' && s.flags[p.seat]) return p.type
  return null
}
// AI 只读取公开身份，不以未知敌子的真实类型评分；布局随机种子不由 AI 反推。
export function chooseAI(s, seat = s.turn) {
  const choices = []
  const value = t => t === 'flag' ? 180 : t === 'bomb' ? 12 : t === 'engineer' ? 6 : t === 'mine' ? 5 : 3 + TYPES[t].rank * 1.8
  // 动态剩余计数：某阵营已被本方确认存活的某类型棋子，要从该类型可分配权重里扣除
  // （例如队友的司令可见时，敌方未知子仍可能是司令——类型池按阵营独立；
  //   但自家可见的同阵营已用掉的类型名额不能再算进未知子的假设权重）
  const knownAlive = new Map()
  for (const q of s.pieces) {
    const t = visibleType(s, q, seat)
    if (!t) continue
    const m = knownAlive.get(q.seat) || new Map()
    m.set(t, (m.get(t) || 0) + 1)
    knownAlive.set(q.seat, m)
  }
  const typeWeight = (t, pieceSeat) => {
    const m = knownAlive.get(pieceSeat)
    return Math.max(0, TYPES[t].count - (m ? (m.get(t) || 0) : 0))
  }
  const hypotheses = p => {
    const known = visibleType(s,p,seat)
    if (known) return [known]
    const deadOf = (s.dead && s.dead[seat]) || {}
    const pool = (s.intel && s.intel[seat + ':' + p.id] || Object.keys(TYPES)).filter(t => {
      // 敌方司令已亡（亮旗是公开事件）：其存活子必非司令，别再当司令怕
      if (s.flags[p.seat] && t === 'commander') return false
      // 该类型配额已被「确认存活 + 确认阵亡」占满：未知存活子必非该类型
      if (typeWeight(t, p.seat) - (deadOf[p.seat + ':' + t] || 0) <= 0) return false
      if (p.moved) return t !== 'flag' && t !== 'mine'
      return canDeploy(t,BOARD.byId[p.pos],p.seat)
    })
    return pool.length ? pool : [p.moved ? 'platoon' : 'company']
  }
  // ---------- 主攻方向（动态选择，不再固定打下家）----------
  // 优先级：旗已亮的敌人（司令阵亡旗位公开，直捣黄龙）＞ 旗位可强推断的敌人
  //（一个大本营已空且该家未出局 → 旗必在另一个）＞ 残存实力更弱的敌人。
  const foes = [(seat + 1) % 4, (seat + 3) % 4].filter(e => s.alive[e])
  const foeStrength = e => {
    let v = 0, unknown = 0
    for (const q of s.pieces) if (q.seat === e) {
      const t = visibleType(s, q, seat)
      if (t) v += value(t); else unknown++
    }
    return v + unknown * 8
  }
  const flagLead = e => s.flags[e] ? 100
    : BOARD.nodes.filter(n => n.kind === 'hq' && n.seat === e && at(s, n.id)).length === 1 ? 40 : 0
  let targetSeat = foes[0]
  for (const e of foes) {
    if (flagLead(e) - foeStrength(e) * .25 > flagLead(targetSeat) - foeStrength(targetSeat) * .25) targetSeat = e
  }
  // Hold a coherent offensive front. Opposite allies naturally pressure opposite
  // enemies, rather than oscillating between whichever HQ is a square nearer.
  const enemies = BOARD.nodes.filter(n => n.kind === 'hq' && n.seat===targetSeat)
  const revealedFlag=s.pieces.find(p=>p.seat===targetSeat&&visibleType(s,p,seat)==='flag')
  // 大本营里的棋子整局不能动：空了说明原驻子已被吃且不是旗（否则该家已
  // 出局），旗必在另一个大本营——空营不作为推进目标，免得往死路里钻。
  let goals=revealedFlag?[revealedFlag.pos]:enemies.filter(n=>{
    const q=at(s,n.id)
    return q && visibleType(s,q,seat)!=='mine'
  }).map(n=>n.id)
  if(!goals.length) goals=enemies.map(n=>n.id) // 两营皆现雷：仍以大本营为方向，工兵挖雷开路
  const distances=new Map(BOARD.nodes.map(n=>[n.id,Infinity])), pending=new Set(BOARD.nodes.map(n=>n.id))
  for(const goal of goals)distances.set(goal,0)
  while(pending.size){
    let nearest=null;for(const id of pending)if(nearest===null||distances.get(id)<distances.get(nearest))nearest=id
    pending.delete(nearest)
    for(const e of BOARD.adjacency[nearest]){
      const cost=distances.get(nearest)+(e.rail?.4:1)
      if(cost<distances.get(e.to))distances.set(e.to,cost)
    }
  }
  const distance = pos => distances.get(pos)
  const expectation = (p, target) => {
    const types = hypotheses(target); let total=0, weights=0
    for (const t of types) {
      const weight=typeWeight(t, target.seat), result=battle(p.type,t)
      total += weight * (result==='win' ? value(t) : result==='both' ? value(t)-value(p.type) : -value(p.type))
      weights += weight
    }
    return weights ? total/weights : 0
  }
  // Generate enemy reach from visible/hypothetical identities, not actual dark
  // types. This also prevents hidden engineers being detected by their routes.
  const threats = new Map()
  for (const enemy of s.pieces.filter(p=>team(p.seat)!==team(seat))) {
    const types=hypotheses(enemy)
    const reach=new Set()
    // 炸弹的威胁也要算：任何假设含炸弹的敌子都可能与大子同归于尽
    for (const type of ['commander','engineer','bomb']) {
      if (!types.some(t=>type==='engineer'?t==='engineer':type==='bomb'?t==='bomb':TYPES[t].rank>1||t==='bomb')) continue
      const view=Object.assign({},s,{pieces:s.pieces.map(p=>p===enemy?Object.assign({},p,{type}):team(p.seat)===team(enemy.seat)?Object.assign({},p,{seat}):p)})
      for (const to of legalMoves(view,enemy.id)) reach.add(to)
    }
    for (const to of reach) { if(!threats.has(to))threats.set(to,[]);threats.get(to).push(enemy) }
  }
  const ownFlag=s.pieces.find(p=>p.seat===seat&&p.type==='flag')
  const flagDanger=ownFlag && (threats.get(ownFlag.pos)||[])
  // 护旗距离图（DL-Chess-AI 方案：靠旗越近防守价值越高，按 15/步数 递减）
  const flagSteps=new Map()
  if (ownFlag) {
    const q=[[ownFlag.pos,0]]
    flagSteps.set(ownFlag.pos,0)
    while(q.length){
      const [cur,d]=q.shift()
      for(const e of BOARD.adjacency[cur]){
        if(flagSteps.has(e.to))continue
        flagSteps.set(e.to,d+1); q.push([e.to,d+1])
      }
    }
  }
  // ---------- 局势激励：优势要压制，僵局要破局 ----------
  // quiet 持续走高说明双方都在磨蹭，AI 若再不进攻就奔 70 手和棋去了：
  // 对期望为正的碰撞逐手加码，对原地换位的安全步逐手加重惩罚。
  const sideValue = t => s.pieces.filter(q => s.alive[q.seat] && team(q.seat) === t)
    .reduce((sum, q) => sum + (visibleType(s, q, seat) ? value(visibleType(s, q, seat)) : 8), 0)
  const myVal = sideValue(team(seat)), foeVal = sideValue(1 - team(seat))
  const dominance = foeVal > 0 ? Math.max(0, (myVal - foeVal) / foeVal) : 1
  const urgency = s.quiet > 20 ? Math.min(14, (s.quiet - 20) * .35) : 0
  for (const p of s.pieces.filter(p => p.seat === seat)) for (const to of legalMoves(s, p.id)) {
    const target = at(s, to), n = BOARD.byId[to], known = target && visibleType(s, target, seat)
    const progress=distance(p.pos)-distance(to)
    let score = progress * 3.8 + random(s) * .35
    // Initiative matters: an unthreatened army must deploy and contest the
    // opponent's side, not score free points by shuttling between safe camps.
    if(progress>0 && n.seat===targetSeat)score+=1.4
    if(!target && progress<=0)score-=1.2+urgency*.4
    if (n.kind === 'hq') {
      if (n.seat === seat || team(n.seat) === team(seat)) score -= 14 // 进自家/队友大本营：永久失动，纯浪费
      else if (target) score += 6 // 攻敌大本营：军旗必在其中一个大本营，值得搏
      else score -= 10 // 空敌大本营：进去出不来，除非确定旗在此否则不进
    }
    if (target) {
      const exp=expectation(p,target)
      score += exp*2 + (known==='flag'?300:4+Math.min(6,s.quiet*.15)) + urgency*Math.max(0,exp) + dominance*2.2
      if(flagDanger && flagDanger.some(e=>e.id===target.id)) score+=45+exp
      // 工兵挖雷开路：敌大本营及其紧邻的未动棋子大概率是护旗雷，
      // 工兵是唯一能安全吃雷的兵种，挖开就是夺旗通路
      if (p.type === 'engineer' && hypotheses(target).includes('mine') &&
          (n.kind === 'hq' || BOARD.adjacency[to].some(e => BOARD.byId[e.to].kind === 'hq' && BOARD.byId[e.to].seat === targetSeat)))
        score += 22
    }
    // 位置价值：铁路机动性强、行营不可被攻击
    if (!target) {
      if (BOARD.adjacency[to].some(e => e.rail)) score += .35
      if (n.kind === 'camp') score += .45
    }
    // 护旗：敌子逼近己旗时，向旗靠拢的防守加分（15/步数的轻量版）
    if (ownFlag && n.kind !== 'hq') {
      const fd = flagSteps.get(to)
      if (fd >= 1) score += (flagDanger && flagDanger.length ? 7 : 1.8) / fd
    }
    if (n.kind!=='camp' && (!target || !known || battle(p.type,known)==='win')) {
      const danger=(threats.get(to)||[]).filter(e=>!target||e.id!==target.id)
      let risk=0
      for(const enemy of danger){
        const types=hypotheses(enemy)
        const certainty=visibleType(s,enemy,seat)?1:(s.intel&&s.intel[seat+':'+enemy.id]?.65:.23)
        // 按类型配额加权求损失期望，而不是对假设池简单均摊
        let wsum=0,lsum=0
        for(const t of types){
          const w=typeWeight(t,enemy.seat)
          if(!w)continue
          wsum+=w
          if(battle(t,p.type)!=='lose')lsum+=w*value(p.type)
        }
        risk=Math.max(risk,wsum?lsum/wsum*certainty:0)
      }
      score-=risk*1.4
    }
    if(p.type==='bomb'&&!target)score-=1.5
    if(p.type==='engineer'&&!target&&n.seat===seat)score+=.2
    if (p.recent && p.recent.includes(to)) score -= 10 + p.recent.filter(x=>x===to).length*3
    choices.push({ pieceId: p.id, to, score })
  }
  choices.sort((a, b) => b.score - a.score)
  return choices[0] || null
}
export function restoreGame(raw) {
  try {
    const s = JSON.parse(raw)
    if (!s || s.version !== RULE_VERSION || !['setup', 'play', 'finished'].includes(s.phase) || !['dual', 'dark', 'open'].includes(s.mode) || !Array.isArray(s.pieces) || s.pieces.length > 100 || !Number.isInteger(s.turn) || s.turn < 0 || s.turn > 3) return null
    if (!Array.isArray(s.alive) || s.alive.length !== 4 || !Array.isArray(s.flags) || s.flags.length !== 4 || !Array.isArray(s.logs)) return null
    if (!s.alive.every(v => typeof v === 'boolean') || !s.flags.every(v => typeof v === 'boolean') || !Number.isInteger(s.turns) || s.turns < 0 || !Number.isInteger(s.quiet) || s.quiet < 0 || !Number.isInteger(s.seed)) return null
    if (s.lastMove && (!BOARD.byId[s.lastMove.from] || !BOARD.byId[s.lastMove.to])) return null
    const positions = new Set(), ids = new Set()
    for (const p of s.pieces) {
      if (!TYPES[p.type] || !BOARD.byId[p.pos] || !Number.isInteger(p.seat) || p.seat < 0 || p.seat > 3 || ids.has(p.id) || positions.has(p.pos)) return null
      ids.add(p.id); positions.add(p.pos)
    }
    for (let seat = 0; seat < 4; seat++) {
      if (s.alive[seat] && !s.pieces.some(p => p.seat === seat && p.type === 'flag')) return null
      for (const type of Object.keys(TYPES)) if (s.pieces.filter(p => p.seat === seat && p.type === type).length > TYPES[type].count) return null
    }
    return s
  } catch (e) { return null }
}
