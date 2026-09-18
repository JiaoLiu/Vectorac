// ============================================================
// 四川麻将（血战到底）牌局状态机（engine.js）
// ------------------------------------------------------------
// 核心原则（契约）：页面不判断胡牌，AI 不修改牌局，
// 所有动作都通过 dispatch() 交给本引擎裁决。
//
// 冻结导出（签名见 contract.js）：
//   createGame({seed, rules?}) -> GameState
//   legalActions(state, seat) -> ActionOption[]
//   dispatch(state, action) -> {ok, state, events, error?}
//   playerView(state, seat) -> PlayerView
//   settlementOf(state) -> Settlement | null
//   mulberry32(seed) -> () => [0,1)
//
// 确定性：引擎内无 Math.random / Date.now；全部随机来自 seed 洗牌。
// 相同 seed + 相同动作序列 => 完全相同的最终 state。
//
// 关键实现说明：
// - 庄家起手 14 张：发牌时庄家多发 1 张（第 14 张从墙头摸入），
//   换三张 / 定缺阶段即持有 14 张，定缺完成后由庄家直接打出第一张。
// - 出牌暂存 pendingDiscard，无人碰/杠/胡才落进弃牌区；
//   碰/明杠直接把该牌编入副露，弃牌区不出现。
// - 响应仲裁：三阶段 HU → GANG → PENG，胡是「并行收集」，杠/碰才是「按顺序仲裁」。
//   候选座位一律按「自出牌者下家起的有效摸牌顺序」（跳过已胡出阵者）排列，
//   阶段写在 state.respondStage（'hu' | 'gang' | 'peng'）：
//     1) HU 阶段（并行）——所有能胡且未过水的人同时思考、同时拿到「胡 / 过」，
//        共享同一个截止时间。引擎不因为某人先叫胡就关闭窗口，必须等这一批胡权
//        全部有结果；全部有结果后，把 {seat: HU} 一次性收集起来批量结算
//        （resolveHuBatch），不会出现「先结算的人改了 GameState 导致后来者胡失败」。
//        任意时刻 currentResponder 为 null，huWait 列出还没表态的胡候选人。
//     2) GANG 阶段（串行）——所有胡家都过之后，才有明杠候选人获权；
//        按有效摸牌顺序逐个询问「杠 / 碰 / 过」（同一张牌既能杠又能碰时两个按钮
//        同屏给出，由该玩家自己选），一旦有人杠/碰即成交，后面不再有机会。
//        HU 窗口期间绝不提前开放杠/碰（legalActions 只会给出胡/过）。
//     3) PENG 阶段（串行）——杠候选人都过之后，才轮到「只能碰、不能杠」的候选人；
//        按同一顺序逐个询问「碰 / 过」，一旦有人碰即成交。
//        因此「同时能胡+碰」的人即便过了胡，也要等中间更高优先级的杠问完才能碰。
//   全员过则出牌落弃牌区，下一位活跃玩家摸牌。
//   放弃过胡的人仍保留碰/杠权（claims 标记 'pass-hu'）。
//   「过」是本窗口内的最终决定：同一座位重复提交、旧 windowId 请求都会被拒，
//   不能反悔（超时/断线由 AI 替该座位提交一次最终动作）。
// - 杠分即时入账（ledger + players.delta）；胡牌/查叫也在 ledger 留流水。
// - 杠上胡加番：所有杠（明/暗/补）后都从墙尾补牌，该回合自摸即“杠上花”、
//   打出的牌被胡即“杠上炮”，都给胡牌者额外加番（抢杠胡不算，杠未成立）。
// - 抢杠胡：补杠申请后先建 pendingKong（不落地），与出牌点炮同一模型——
//   所有能抢杠胡的人同时思考、同时拿到「抢杠胡 / 过」，共享同一个截止时间，
//   全部有结果才结算。有人抢杠胡即取消补杠（多人抢则一次性结算多人抢杠胡），
//   只有全员过，补杠才真正成立。补杠被抢则杠不成立——杠钱一分不收（相当于
//   没杠到），被抢的牌落进被抢者弃牌区（相当于他点炮），抢杠者额外加 1 番
//   （qianggangFan）。幺鸡补的
//   那张留在副露里顶替被取走的真牌（副露退回碰；要再杠只能等摸到对应真牌）。
// - 根加番：胡牌时手牌 + 副露中每有一组 4 张相同牌（明/暗/补杠，或碰后
//   手留一张、手里 4 张未杠）额外加 1 番（genFan），与杠钱互相独立。
// - 流局查叫：查花猪（未打缺赔封顶给所有其他未胡玩家）优先于
//   查大叫（已打缺未听牌赔给听牌的未胡玩家，赔付额按未听牌者自己
//   这副牌的最大可能番数算，非一律封顶）；已胡玩家不再参与。
// - 退杠：杠分是预收，流局时未听牌者（含花猪）须退还本局全部已收
//   杠钱（理由 gang-refund，逐笔原路退回）；有人胡满结束的局不退。
// - 定缺（rules.voidRequired）：手里还有缺门牌（幺鸡豁免）时只能打缺门牌，
//   并且不能胡——胡必须已打缺（否则查花猪无从谈起）。碰 / 明杠 / 暗杠 / 补杠
//   不受定缺限制：可以边打缺边叫牌，碰杠之后照旧只能打缺门牌，打缺义务不变。
// - 幺鸡赖子（rules.yaojiEnabled）：幺鸡（一条）当万能牌（详见 rules.js）。
//   · 碰/明杠/暗杠/补杠允许「真牌 + 幺鸡」补位，副露用 meld.wild 记录用了几只幺鸡
//     （一副露最多 1 只：碰里已经带了幺鸡的，只能等摸到真牌再补杠）；
//   · 带幺鸡补位的杠（明杠/暗杠/补杠），之后手里又摸到对应真牌时可用
//     swap-yaoji 把幺鸡换回手牌。判定看幺鸡从哪一步进来：只要是在「碰」那一步
//     进来的（meld.wildPeng > 0，即碰赖），即便之后用真牌补杠成了杠也不可换；
//     碰本身是纯真牌、幺鸡是在补杠那一步才补进来的，则可以换；
//   · 杠钱：带幺鸡按基准、不带幺鸡翻倍（明杠 1/2、暗杠 2/4、补杠 1/2）；
//   · 杠上炮转雨：杠后补牌回合打出的牌被胡时，本回合收到的杠钱转给胡牌者
//     （gangTurn 暂存，理由 gang-zhuan-yu）；
//   · 喜钱：结算时名下（手牌 + 副露，含被抢杠后留在副露的）有 3 只幺鸡每家付 4 分、
//     4 只每家付 8 分（理由 yaoji-xi）；
//   · 定缺豁免：幺鸡不算缺门牌，定缺条门也能保留赖子。
// - 胡牌番型：幺鸡局整手（手牌 + 副露）不含幺鸡时额外 +1 番（rules.js noYaoji）。
// ============================================================

import {
  RULE_VERSION,
  DEFAULT_RULES,
  SUITS,
  PHASE_SWAP,
  PHASE_VOID,
  PHASE_DISCARD,
  PHASE_RESPOND,
  PHASE_FINISHED,
  ACTION,
  ERR,
  allTileIds,
  tileSuit,
  YAOJI_TILE
} from './contract.js'
import {
  isWinHand,
  finalFan,
  potentialFan,
  tingTiles,
  hasVoidTiles,
  countTile
} from './rules.js'

// ---------- 确定性随机 ----------

/** mulberry32 PRNG：seed 相同 => 序列相同 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- 通用辅助 ----------

/** 深拷贝（state 为纯 JSON，无循环引用） */
function clone(x) {
  return JSON.parse(JSON.stringify(x))
}

/** 从数组移除 n 个等于 t 的元素（原地） */
function removeTiles(arr, tiles) {
  for (const t of tiles) {
    const i = arr.indexOf(t)
    if (i < 0) return false
    arr.splice(i, 1)
  }
  return true
}

/** 未胡（活跃）座位列表 */
function activeSeats(s) {
  return s.players.filter(p => !p.hu).map(p => p.seat)
}

/** from 的下一个活跃座位（逆时针 seat+1） */
function nextActive(s, from) {
  for (let k = 1; k <= 4; k++) {
    const seat = (from + k) % 4
    if (!s.players[seat].hu) return seat
  }
  return from
}

/**
 * 有效摸牌顺序：自 from 的下家起逆时针，跳过已胡出阵的玩家。
 * 响应仲裁（胡 / 碰 / 明杠 / 抢杠）一律以此为唯一顺序依据，
 * 不能用 (from + 1) % 4 硬算——血战里已胡的玩家必须跳过。
 */
function seatOrderFrom(s, from) {
  const order = []
  for (let k = 1; k <= 3; k++) {
    const seat = (from + k) % 4
    if (s.players[seat].hu) continue
    order.push(seat)
  }
  return order
}

/** 本局是否为幺鸡赖子局 */
function yaojiOn(s) {
  return s.rules.yaojiEnabled === true
}

/** 手牌中幺鸡（万能张）的张数 */
function yaojiCount(hand) {
  return countTile(hand, YAOJI_TILE)
}

/**
 * 玩家名下幺鸡总数（手牌 + 副露），喜钱按此计数。
 * 副露里的幺鸡有两种形态：幺鸡本身组成的碰/杠（meld.tile === 幺鸡），
 * 以及「真牌 + 幺鸡」补位的副露（meld.wild 记张数）。被抢杠后留在副露
 * 补位的那只幺鸡同样算在名下——牌还是他的，不因杠未成立而丢掉。
 */
function ownedYaoji(p) {
  let n = yaojiCount(p.hand)
  for (const m of p.melds) {
    if (m.tile === YAOJI_TILE) n += m.kind === 'peng' ? 3 : 4
    else n += m.wild || 0
  }
  return n
}

/**
 * 碰的补位方案：返回该副露需要用几张幺鸡（0/1），无法碰返回 null。
 * 幺鸡局里「1 张真牌 + 1 只幺鸡」可碰真牌；幺鸡本身只能由 2 张幺鸡碰。
 */
function pengWildCount(hand, tile, yaoji) {
  const c = countTile(hand, tile)
  if (c >= 2) return 0
  if (!yaoji || tile === YAOJI_TILE) return null
  if (c === 1 && yaojiCount(hand) >= 1) return 1
  return null
}

/**
 * 明杠的补位方案：返回需要几张幺鸡（0/1），无法明杠返回 null。
 * 「2 张真牌 + 1 只幺鸡」可杠真牌。
 */
function gangMingWildCount(hand, tile, yaoji) {
  const c = countTile(hand, tile)
  if (c >= 3) return 0
  if (!yaoji || tile === YAOJI_TILE) return null
  if (c === 2 && yaojiCount(hand) >= 1) return 1
  return null
}

/**
 * 暗杠的补位方案：返回需要几张幺鸡（0/1），无法暗杠返回 null。
 * 「3 张真牌 + 1 只幺鸡」可暗杠真牌（之后摸到第 4 张真牌可以换回幺鸡）。
 */
function anGangWildCount(full, tile, yaoji) {
  const c = countTile(full, tile)
  if (c >= 4) return 0
  if (!yaoji || tile === YAOJI_TILE) return null
  if (c === 3 && yaojiCount(full) >= 1) return 1
  return null
}

/** turn 玩家的完整手牌（hand + drawnTile 合并，升序新数组） */
function fullHandOf(s, seat) {
  const p = s.players[seat]
  const arr = p.hand.slice()
  if (s.drawnTile != null && s.turn === seat && s.phase === PHASE_DISCARD) {
    arr.push(s.drawnTile)
  }
  arr.sort((a, b) => a - b)
  return arr
}

// ---------- 建局 ----------

export function createGame(opts = {}) {
  const seed = (opts.seed != null ? Number(opts.seed) : 1) >>> 0
  const rules = { ...DEFAULT_RULES, ...(opts.rules || {}) }
  const rng = mulberry32(seed)
  // 庄家：默认由 seed 派生（保持历史确定性）；跨局固定庄家时由调用方显式传入
  const dealer =
    opts.dealer != null ? (((Number(opts.dealer) % 4) + 4) % 4) : seed % 4
  // 摸排起点：发牌后把剩余牌墙整体旋转（骰子决定从哪一段开始摸），
  // 只改变摸牌顺序，不改变牌墙内容，确定性与守恒不受影响
  const wallOffset = opts.wallOffset != null ? Math.abs(Math.floor(Number(opts.wallOffset))) || 0 : 0

  // 洗牌：Fisher-Yates
  const wall = allTileIds()
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = wall[i]
    wall[i] = wall[j]
    wall[j] = tmp
  }

  const players = []
  for (let seat = 0; seat < 4; seat++) {
    players.push({
      seat,
      hand: [],
      melds: [],
      discards: [],
      void: null,
      hu: null,
      delta: 0,
      swapPicked: null,
      // 过水（过胡）：{fan, tile} = 本巡放弃的那手点炮胡番数；自己摸牌（过庄）
      // 即清空（见 drawFor / drawFromTail）。null = 没有未清的过水限制。
      passHu: null
    })
  }

  // 发牌：每人 13 张，庄家再摸 1 张成起手 14 张（见文件头说明）
  for (let round = 0; round < 13; round++) {
    for (let seat = 0; seat < 4; seat++) {
      players[seat].hand.push(wall.shift())
    }
  }
  players.forEach(p => p.hand.sort((a, b) => a - b))
  // 摸排起点：旋转剩余牌墙（之后所有人都从旋转后的墙头摸）
  if (wallOffset > 0 && wall.length > 1) {
    const off = wallOffset % wall.length
    if (off > 0) wall.push(...wall.splice(0, off))
  }
  // 庄家起手 14 张：第 14 张从墙头摸入，换三张 / 定缺阶段即持有 14 张，
  // 定缺完成后由庄家直接打出第一张（见 doVoid）。
  players[dealer].hand.push(wall.shift())
  players[dealer].hand.sort((a, b) => a - b)

  const state = {
    version: 1,
    ruleVersion: RULE_VERSION,
    rules,
    seed,
    phase: rules.swapThree ? PHASE_SWAP : PHASE_VOID,
    dealer,
    turn: dealer,
    drawnTile: null,
    mustDiscard: false, // 碰牌后进入的强制出牌回合：只许打一张，不能胡/杠
    afterGangDraw: false, // 本次摸牌是否来自杠后补牌（墙尾）：自摸胡即“杠上花”，
    //                       该回合打出的牌被胡即“杠上炮”（见 huSettle）
    wall,
    players,
    pendingDiscard: null,
    pendingKong: null,
    discardTag: 0, // 出牌/补杠批次号：区分“同一张牌被多家胡”与“同一人先后点炮”
    // 本回合杠分暂存：幺鸡局「杠上炮转雨」用——杠者若在该回合打出的牌被胡，
    // 本次收到的杠钱要转给胡牌者（见 huSettle）。下一家摸牌/回合结束即清空。
    gangTurn: null,
    claims: {}, // respond 窗口：{seat: 'hu'|'peng'|'gang'|'pass-hu'|'pass'}
    // respond 窗口三阶段（见文件头）：'hu' | 'gang' | 'peng'。
    //   · HU 阶段并行：所有胡候选人同时表态，currentResponder 为 null，
    //     huWait 列出还没表态的胡候选人；全部有结果才一次性批量结算/进入下一阶段。
    //   · GANG / PENG 阶段串行：只有唯一 currentResponder 拥有决定权，
    //     按有效摸牌顺序逐个询问，一旦成交后面的人不再有机会。
    currentResponder: null, // 当前唯一可提交响应的座位（HU 阶段为 null）
    respondStage: null, // 'hu' | 'gang' | 'peng'：当前响应阶段
    waiting: [], // respond 窗口：全部候选响应者（已按有效摸牌顺序排列）
    huWait: [], // HU 阶段：仍需表态的胡候选人（并行收集）
    gangWait: [], // GANG 阶段：仍待询问的明杠候选人（串行，按摸牌顺序）
    pengWait: [], // PENG 阶段：仍待询问的碰候选人（串行，按摸牌顺序）
    huOrder: [], // 胡牌顺序流水
    ledger: [], // 收支流水（杠分/胡牌/查叫）
    results: null,
    events: [],
    actionLog: []
  }
  const events = state.events
  events.push({ seq: 1, type: 'game-start', data: { seed, dealer, wallOffset } })
  events.push({ seq: 2, type: 'deal', data: { wallLeft: wall.length } })
  return state
}

// ---------- 合法动作 ----------

export function legalActions(state, seat) {
  const s = state
  if (s.phase === PHASE_FINISHED) return []
  const p = s.players[seat]

  // 换三张
  if (s.phase === PHASE_SWAP) {
    if (p.swapPicked != null) return []
    return [{ type: ACTION.SWAP }]
  }
  // 定缺
  if (s.phase === PHASE_VOID) {
    if (p.void != null) return []
    return [{ type: ACTION.VOID, suits: SUITS.slice() }]
  }
  // 摸打阶段（仅 turn 玩家）
  if (s.phase === PHASE_DISCARD && s.turn === seat) {
    const full = fullHandOf(s, seat)
    const meldCount = p.melds.length
    const yaoji = yaojiOn(s)
    // 定缺只限制两件事：①手里还有缺门牌（幺鸡豁免）时只能打缺门牌；
    // ②必须打完缺才能胡。碰 / 明杠 / 暗杠 / 补杠都不受定缺限制——可以边打缺边叫牌，
    // 杠/碰之后照旧只能打缺门牌，打缺义务不变。
    const voiding = hasVoidTiles(full, p.void, { yaoji })
    const out = []
    // 出牌：有缺门牌时只能打缺门，否则全部可打
    out.push({
      type: ACTION.DISCARD,
      tiles: voiding
        ? [...new Set(full.filter(t => tileSuit(t) === p.void))]
        : [...new Set(full)]
    })
    if (!s.mustDiscard) {
      // 暗杠：手里 4 张同 id；幺鸡局允许 3 张真牌 + 1 只幺鸡
      const anGang = []
      const seen = new Set()
      for (const t of full) {
        if (seen.has(t)) continue
        seen.add(t)
        if (anGangWildCount(full, t, yaoji) != null) anGang.push(t)
      }
      if (anGang.length) {
        out.push({ type: ACTION.GANG, options: anGang.map(t => ({ tile: t, gangType: 'an' })) })
      }
      // 补杠：已有该牌的碰副露，手里还有 1 张真牌即可补杠；
      // 幺鸡局手里没有真牌时，也可用手里的幺鸡当第 4 张补杠（真牌优先，幺鸡记入副露 wild），
      // 这样「碰 + 赖子」也能成杠去冲杠上花。
      // 一副露最多含 1 只幺鸡：碰里已经带了幺鸡的，只能等摸到真牌再补杠
      // （被抢杠后副露会退回成「2 真 + 1 幺鸡」，同理只能等真牌）。
      const buGang = []
      for (const m of p.melds) {
        if (m.kind !== 'peng') continue
        const useReal = countTile(full, m.tile) >= 1
        const useWild = !useReal && yaoji && m.tile !== YAOJI_TILE &&
          !((m.wild || 0) > 0) && yaojiCount(full) >= 1
        if (useReal || useWild) buGang.push(m.tile)
      }
      if (buGang.length) {
        out.push({
          type: ACTION.GANG,
          options: buGang.map(t => ({ tile: t, gangType: 'bu' }))
        })
      }
    }
    // 幺鸡换牌：带幺鸡的明杠/暗杠，手里又摸到对应真牌时可把幺鸡收回
    out.push(...swapYaojiOptions(s, seat))
    // 自摸胡（碰牌后的强制出牌回合除外：碰了必须打一张）。
    // drawnTile 为空 = 庄家起手 14 张还没摸牌，此时成胡即天胡（结算按封顶番），
    // 没有单独的「胡牌张」，其余回合自摸的胡牌张就是刚摸进来的 drawnTile。
    // 定缺：手里还有缺门牌时不许胡（胡必须已打缺）。
    if (!s.mustDiscard && !voiding && isWinHand(full, meldCount, { yaoji })) {
      out.push({ type: ACTION.HU, how: 'zimo' })
    }
    return out
  }
  // 响应窗口三阶段（见文件头）：HU 并行、GANG/PENG 串行。
  if (s.phase === PHASE_RESPOND) {
    const tile = respondTile(s)
    if (tile == null) return []
    // HU 阶段（并行）：所有胡候选人同时拿到「胡 / 过」，谁先表态都不会关掉
    // 别人的窗口；其他人此刻连碰/杠按钮都不出现。
    if (s.respondStage === 'hu') {
      if (!s.huWait.includes(seat)) return []
      if (s.pendingKong) {
        // 抢杠窗口：只能抢杠胡或过（补杠尚未落地，不得抢碰）
        if (!canHuOn(s, seat, tile)) return []
        return [{ type: ACTION.HU, how: 'qianggang' }, { type: ACTION.PASS }]
      }
      if (!canClaimHu(s, seat)) return []
      return [{ type: ACTION.HU, how: 'dianpao' }, { type: ACTION.PASS }]
    }
    // GANG / PENG 阶段（串行）：只有 currentResponder 拥有决定权；
    // 杠与碰分处两个阶段——所有杠候选人都过之后才轮到碰。
    if (s.currentResponder !== seat) return []
    if (s.pendingKong) return []
    if (s.respondStage === 'gang') {
      const out = []
      // 明杠：3 张真牌，或 2 张真牌 + 1 只幺鸡
      if (canClaimGang(s, seat, tile)) {
        out.push({ type: ACTION.GANG, options: [{ tile, gangType: 'ming' }] })
      }
      // 同一张牌既能杠又能碰时，两个按钮同屏给出让玩家自己选（不必先过杠才轮到碰）
      if (canClaimPeng(s, seat, tile)) out.push({ type: ACTION.PENG, tile })
      out.push({ type: ACTION.PASS })
      return out
    }
    if (s.respondStage === 'peng') {
      const out = []
      if (canClaimPeng(s, seat, tile)) out.push({ type: ACTION.PENG, tile })
      out.push({ type: ACTION.PASS })
      return out
    }
    return []
  }
  return []
}

/**
 * 幺鸡换牌可选项：幺鸡局里带幺鸡补位的杠（明杠/暗杠/补杠），
 * 之后手里又拿到对应真牌时，可把真牌编入副露、把幺鸡换回手牌继续当赖子。
 * 唯一的例外：幺鸡是在「碰」这一步进来的（meld.wildPeng > 0）——这种碰赖
 * 即便之后用真牌补杠成了杠，也不允许换（呼应规则：幺鸡碰出来的不能换）。
 */
function swapYaojiOptions(s, seat) {
  if (!yaojiOn(s) || s.mustDiscard) return []
  if (s.phase !== PHASE_DISCARD || s.turn !== seat) return []
  const p = s.players[seat]
  const full = fullHandOf(s, seat)
  const out = []
  const seen = new Set()
  for (const m of p.melds) {
    if (m.kind !== 'gang') continue
    if ((m.wildPeng || 0) > 0) continue
    if (!((m.wild || 0) > 0)) continue
    if (seen.has(m.tile) || !full.includes(m.tile)) continue
    seen.add(m.tile)
    out.push({ type: ACTION.SWAP_YAOJI, tile: m.tile })
  }
  return out
}

/** seat 玩家能否以 tile 胡牌（无缺门牌且该牌非其缺门花色；幺鸡豁免定缺） */
function canHuOn(s, seat, tile) {
  const p = s.players[seat]
  const yaoji = yaojiOn(s)
  if (hasVoidTiles(p.hand, p.void, { yaoji })) return false
  if (p.void && tileSuit(tile) === p.void && !(yaoji && tile === YAOJI_TILE)) return false
  return isWinHand([...p.hand, tile], p.melds.length, { yaoji })
}

/**
 * 过水（俗称「过胡 / 没过庄」）：放弃一次点炮胡之后，在自己下一次摸牌
 * （过庄）之前，不能再胡同番或更低番的炮——自摸不受限，番数更大的炮
 * 仍然可以胡；胡还是不胡始终由玩家自己决定（这里只决定「给不给胡按钮」）。
 * 返回 true = 本次点炮胡被过水挡住，不提供「胡」选项。
 */
function passHuBlocks(s, seat, tile, afterGang) {
  const rec = s.players[seat].passHu
  if (!rec) return false
  return dianpaoFanOn(s, seat, tile, afterGang) <= rec.fan
}

/**
 * 某张牌点炮胡时的实际番数（过水比较口径：与 huSettle 同一套番型 + 实况番，
 * 海底 / 杠上炮都算进去，保证「番更大」的判断和真正结算一致）。
 */
function dianpaoFanOn(s, seat, tile, afterGang) {
  const p = s.players[seat]
  const res = finalFan([...p.hand, tile].sort((x, y) => x - y), p.melds, {
    zimo: false,
    haidi: s.wall.length === 0,
    gangshang: afterGang === true,
    qianggang: false,
    capFan: s.rules.capFan,
    zimoFan: s.rules.zimoFan,
    haidiFan: s.rules.haidiFan,
    gangShangFan: s.rules.gangShangFan,
    qianggangFan: s.rules.qianggangFan,
    genFan: s.rules.genFan,
    yaoji: yaojiOn(s),
    tianhu: false
  })
  return res ? res.fan : 0
}

/**
 * seat 玩家能否碰 tile（tile 非其缺门；幺鸡豁免定缺）。
 * 定缺只限制「打什么」和「能不能胡」：手里还有缺门牌时照样可以碰/杠，
 * 碰完把缺门牌打掉即可（碰/杠不会让你不用打缺，只是不禁止你叫牌）。
 */
function canClaimPeng(s, seat, tile) {
  const p = s.players[seat]
  const yaoji = yaojiOn(s)
  if (p.void && tileSuit(tile) === p.void && !(yaoji && tile === YAOJI_TILE)) return false
  return pengWildCount(p.hand, tile, yaoji) != null
}

/**
 * 该座位此刻是否「还能胡这张牌」——点炮胡 / 抢杠胡，含过水限制。
 * 响应裁决要靠它判断还该等谁：胡优先级高于碰 / 明杠，但一炮多响（含抢杠多响）
 * 不能漏人，所以只有「还有胡资格且未表态」的人才值得等；只有碰 / 杠资格的
 * 人不能拖住胡。
 */
function canClaimHu(s, seat) {
  if (s.pendingDiscard) {
    const tile = s.pendingDiscard.tile
    return (
      canHuOn(s, seat, tile) &&
      !passHuBlocks(s, seat, tile, s.pendingDiscard.isAfterGang === true)
    )
  }
  if (s.pendingKong) return canHuOn(s, seat, s.pendingKong.tile)
  return false
}

// ---------- 动作裁决 ----------

export function dispatch(state, action) {
  if (!action || typeof action !== 'object' || !action.actionId) {
    return { ok: false, error: ERR.ILLEGAL, state, events: [] }
  }
  // 去重：同一 actionId 只执行一次（幂等）
  if (state.actionLog.some(a => a.actionId === action.actionId)) {
    return { ok: false, error: ERR.DUPLICATE, state, events: [] }
  }
  // 拒绝过期动作
  if (action.stateVersion !== state.version) {
    return { ok: false, error: ERR.STALE, state, events: [] }
  }

  const s = clone(state)
  const newEvents = []
  const push = (type, data, seat) => {
    const ev = { seq: s.events.length + 1, type }
    if (seat != null) ev.seat = seat
    if (data != null) ev.data = data
    s.events.push(ev)
    newEvents.push(ev)
  }

  let res
  switch (action.type) {
    case ACTION.SWAP:
      res = doSwap(s, action)
      break
    case ACTION.VOID:
      res = doVoid(s, action)
      break
    case ACTION.DISCARD:
      res = doDiscard(s, action)
      break
    case ACTION.PENG:
      res = doPeng(s, action)
      break
    case ACTION.GANG:
      res = doGang(s, action)
      break
    case ACTION.SWAP_YAOJI:
      res = doSwapYaoji(s, action)
      break
    case ACTION.HU:
      res = doHu(s, action)
      break
    case ACTION.PASS:
      res = doPass(s, action)
      break
    default:
      res = { error: ERR.ILLEGAL }
  }
  if (res.error) {
    return { ok: false, error: res.error, state, events: [] }
  }
  // 副作用（事件/推进）已在 doXxx 内完成
  if (res.after) res.after(push)

  s.actionLog.push({ ...action })
  s.version++
  return { ok: true, state: s, events: newEvents }
}

// ---- 换三张 ----

function doSwap(s, a) {
  if (s.phase !== PHASE_SWAP) return { error: ERR.WRONG_PHASE }
  if (a.seat == null || a.seat < 0 || a.seat > 3) return { error: ERR.ILLEGAL }
  const p = s.players[a.seat]
  if (p.swapPicked != null) return { error: ERR.NOT_ACTIVE }
  const tiles = a.tiles
  if (!Array.isArray(tiles) || tiles.length !== 3) return { error: ERR.ILLEGAL }
  // 三张必须在手里且同花色
  const hand = p.hand.slice()
  if (!removeTiles(hand, tiles)) return { error: ERR.ILLEGAL }
  const suit = tileSuit(tiles[0])
  if (tiles.some(t => tileSuit(t) !== suit)) return { error: ERR.ILLEGAL }
  p.swapPicked = tiles.slice().sort((x, y) => x - y)
  return {
    after: push => {
      push('swap-select', { count: 3 }, a.seat)
      // 四人齐 → 统一传递
      if (s.players.every(q => q.swapPicked != null)) applySwap(s, push)
    }
  }
}

function applySwap(s, push) {
  const off = [1, 3, 2][s.seed % 3] // 0:+1下家 1:+3上家 2:+2对家
  const incoming = []
  for (let i = 0; i < 4; i++) {
    incoming[(i + off) % 4] = s.players[i].swapPicked
  }
  for (let i = 0; i < 4; i++) {
    const p = s.players[i]
    removeTiles(p.hand, p.swapPicked)
    p.hand.push(...incoming[i])
    p.hand.sort((x, y) => x - y)
    p.swapPicked = null
  }
  s.phase = PHASE_VOID
  push('swap-apply', { dir: off })
}

// ---- 定缺 ----

function doVoid(s, a) {
  if (s.phase !== PHASE_VOID) return { error: ERR.WRONG_PHASE }
  if (a.seat == null || a.seat < 0 || a.seat > 3) return { error: ERR.ILLEGAL }
  const p = s.players[a.seat]
  if (p.void != null) return { error: ERR.NOT_ACTIVE }
  if (!SUITS.includes(a.suit)) return { error: ERR.ILLEGAL }
  p.void = a.suit
  return {
    after: push => {
      push('void-set', { suit: a.suit }, a.seat)
      // 四人齐 → 进入摸打：庄家起手已是 14 张，直接由庄家打出第一张
      if (s.players.every(q => q.void != null)) {
        s.phase = PHASE_DISCARD
        s.turn = s.dealer
        s.drawnTile = null
        push('turn', { turn: s.dealer })
      }
    }
  }
}

// ---- 出牌 ----

function doDiscard(s, a) {
  if (s.phase !== PHASE_DISCARD) return { error: ERR.WRONG_PHASE }
  if (a.seat !== s.turn) return { error: ERR.NOT_ACTIVE }
  if (a.tile == null || a.tile < 0 || a.tile > 26) return { error: ERR.ILLEGAL }
  const p = s.players[a.seat]
  const full = fullHandOf(s, a.seat)
  if (!full.includes(a.tile)) return { error: ERR.ILLEGAL }
  // 定缺约束：有缺门牌时必须先打缺门（幺鸡局幺鸡豁免，不算缺门牌）
  if (hasVoidTiles(full, p.void, { yaoji: yaojiOn(s) }) && tileSuit(a.tile) !== p.void) {
    return { error: ERR.ILLEGAL }
  }
  // 消耗：drawnTile 并回手牌再移除（统一处理）
  const idx = full.indexOf(a.tile)
  full.splice(idx, 1)
  p.hand = full
  s.drawnTile = null
  s.mustDiscard = false // 出牌后强制回合结束
  // 本次出牌是否杠后打出（用于判定杠上炮），出牌后清空标记
  const afterGang = s.afterGangDraw === true
  s.afterGangDraw = false
  return {
    after: push => {
      push('discard', { tile: a.tile }, a.seat)
      openRespond(s, a.seat, a.tile, push, afterGang)
    }
  }
}

/** 打出牌后开响应窗口；无人可响应则直接轮转 */
function openRespond(s, discarder, tile, push, afterGang) {
  // 候选响应者按有效摸牌顺序排列（自出牌者下家起逆时针，跳过已胡出阵者）
  const waiting = []
  for (const seat of seatOrderFrom(s, discarder)) {
    const can =
      (canHuOn(s, seat, tile) && !passHuBlocks(s, seat, tile, afterGang)) ||
      canClaimPeng(s, seat, tile) ||
      canClaimGang(s, seat, tile)
    if (can) waiting.push(seat)
  }
  if (waiting.length === 0) {
    // 无人要牌：落进弃牌区，下一位活跃玩家摸牌
    s.players[discarder].discards.push(tile)
    s.pendingDiscard = null
    drawFor(s, nextActive(s, discarder), push)
    return
  }
  s.pendingDiscard = { seat: discarder, tile, tag: ++s.discardTag, isAfterGang: afterGang === true }
  s.pendingKong = null
  s.waiting = waiting
  s.claims = {}
  // 三阶段候选：HU 并行收集、GANG 串行、PENG 串行，均按有效摸牌顺序预排。
  // 三个阶段同时预排好，但一次只开放一个阶段（见 advanceRespond）——
  // HU 窗口期间绝不提前开放杠/碰，所有胡都过了才轮到杠，所有杠都过了才轮到碰。
  s.huWait = waiting.filter(seat => canClaimHu(s, seat))
  s.gangWait = waiting.filter(seat => canClaimGang(s, seat, tile))
  s.pengWait = waiting.filter(seat => canClaimPeng(s, seat, tile))
  s.phase = PHASE_RESPOND
  // 无胡候选人则直接落到杠/碰阶段；仍无人可响应则全过轮转
  if (advanceRespond(s) == null) settleAllPass(s, push)
}

// ---- 碰（响应窗口） ----

function doPeng(s, a) {
  if (s.phase !== PHASE_RESPOND) return { error: ERR.WRONG_PHASE }
  if (!s.pendingDiscard) return { error: ERR.WRONG_PHASE }
  // 碰在 PENG 阶段（所有杠候选人都过之后）；若同一张牌当前座位既能杠又能碰，
  // GANG 阶段就同屏给出「杠 / 碰 / 过」，玩家在 GANG 阶段直接选碰也允许。
  // 无论哪个阶段，都只有当前串行响应者能提交。
  if (
    (s.respondStage !== 'peng' && s.respondStage !== 'gang') ||
    s.currentResponder !== a.seat
  ) {
    return { error: ERR.NOT_ACTIVE }
  }
  const tile = s.pendingDiscard.tile
  if (!canClaimPeng(s, a.seat, tile)) {
    return { error: ERR.ILLEGAL }
  }
  s.claims[a.seat] = 'peng'
  return {
    after: push => {
      // 当前响应者一旦选择碰即成交，后面的座位不再有机会
      settleMeld(s, a.seat, 'peng', push)
    }
  }
}

// ---- 杠（暗杠/补杠 in discard；明杠 in respond） ----

function doGang(s, a) {
  if (s.phase === PHASE_RESPOND) return doGangMing(s, a)
  if (s.phase !== PHASE_DISCARD) return { error: ERR.WRONG_PHASE }
  if (a.seat !== s.turn) return { error: ERR.NOT_ACTIVE }
  // 碰牌后的强制出牌回合不能补杠/暗杠（必须打出一张）
  if (s.mustDiscard) return { error: ERR.ILLEGAL }
  const p = s.players[a.seat]
  const full = fullHandOf(s, a.seat)
  const yaoji = yaojiOn(s)
  // 有缺门牌也能暗杠/补杠（定缺只限制「打什么」与「能不能胡」）：
  // 杠完照旧只能打缺门牌，不会因此跳过打缺。

  if (a.gangType === 'an') {
    const wild = anGangWildCount(full, a.tile, yaoji)
    if (wild == null) return { error: ERR.ILLEGAL }
    // 真牌 + 补位幺鸡：幺鸡局允许 3 张真牌 + 1 只幺鸡暗杠（幺鸡从手牌拿掉编入副露）
    removeTiles(full, new Array(4 - wild).fill(a.tile).concat(new Array(wild).fill(YAOJI_TILE)))
    p.hand = full
    s.drawnTile = null
    const meld = { kind: 'gang', gangType: 'an', tile: a.tile, from: null }
    if (wild > 0) meld.wild = wild
    p.melds.push(meld)
    return {
      after: push => {
        push('gang', { tile: a.tile, gangType: 'an', wild }, a.seat)
        payGangSelf(s, a.seat, 'an', wild, push)
        drawFromTail(s, a.seat, push)
      }
    }
  }
  if (a.gangType === 'bu') {
    const meld = p.melds.find(m => m.kind === 'peng' && m.tile === a.tile)
    if (!meld) return { error: ERR.ILLEGAL }
    // 补的那张优先用真牌；幺鸡局手里没有真牌但有幺鸡时，用幺鸡补位
    // （wild 在杠真正成立时才 +1；被抢杠胡则这张幺鸡留在副露里补位，见 resolveRespond）
    const useReal = countTile(full, a.tile) >= 1
    const useWild = !useReal && yaoji && a.tile !== YAOJI_TILE && yaojiCount(full) >= 1
    if (!useReal && !useWild) return { error: ERR.ILLEGAL }
    // 补的那张：真牌优先，没有真牌才用幺鸡补位
    removeTiles(full, [useReal ? a.tile : YAOJI_TILE])
    p.hand = full
    s.drawnTile = null
    return {
      after: push => {
        openRobWindow(s, a.seat, a.tile, meld, push, useWild ? 1 : 0)
      }
    }
  }
  return { error: ERR.ILLEGAL }
}

/** 明杠（响应他人出牌） */
function doGangMing(s, a) {
  if (!s.pendingDiscard) return { error: ERR.WRONG_PHASE }
  // 明杠只在 GANG 阶段（胡阶段/碰阶段都不给杠），且只有当前串行响应者能提交
  if (s.respondStage !== 'gang' || s.currentResponder !== a.seat) {
    return { error: ERR.NOT_ACTIVE }
  }
  const tile = s.pendingDiscard.tile
  if (gangMingWildCount(s.players[a.seat].hand, tile, yaojiOn(s)) == null) {
    return { error: ERR.ILLEGAL }
  }
  s.claims[a.seat] = 'gang'
  return {
    after: push => {
      // 当前响应者一旦选择杠即成交，后面的座位不再有机会
      settleMeld(s, a.seat, 'gang', push)
    }
  }
}

/**
 * 幺鸡换牌：把带幺鸡补位的杠（明杠/暗杠/补杠）里的幺鸡换回手牌——
 * 玩家手里又拿到该副露对应的真牌时，用真牌补全副露、幺鸡回到手里继续当赖子。
 * 幺鸡是在「碰」这一步进来的（meld.wildPeng > 0）不可换：无论它现在是碰赖，
 * 还是之后用真牌补杠成的杠，都不能换（只有杠那一步引入的幺鸡才有此权利）。
 */
function doSwapYaoji(s, a) {
  if (s.phase !== PHASE_DISCARD) return { error: ERR.WRONG_PHASE }
  if (a.seat !== s.turn) return { error: ERR.NOT_ACTIVE }
  if (s.mustDiscard) return { error: ERR.ILLEGAL }
  if (!yaojiOn(s)) return { error: ERR.ILLEGAL }
  const p = s.players[a.seat]
  const meld = p.melds.find(
    m =>
      m.kind === 'gang' &&
      m.tile === a.tile &&
      (m.wild || 0) > 0 &&
      !((m.wildPeng || 0) > 0)
  )
  if (!meld) return { error: ERR.ILLEGAL }
  const full = fullHandOf(s, a.seat)
  if (!full.includes(a.tile)) return { error: ERR.ILLEGAL }
  // 真牌编入副露，幺鸡收回手牌（drawnTile 与 hand 分离：只替换到 1 张幺鸡）
  const hi = p.hand.indexOf(a.tile)
  if (hi >= 0) {
    p.hand.splice(hi, 1)
    p.hand.push(YAOJI_TILE)
    p.hand.sort((x, y) => x - y)
  } else {
    // 刚摸到的正是这张真牌：把它换成一个幺鸡（保持 drawnTile 语义）
    s.drawnTile = YAOJI_TILE
  }
  meld.wild -= 1
  if (meld.wild <= 0) delete meld.wild
  return {
    after: push => push('swap-yaoji', { tile: a.tile, wildLeft: meld.wild || 0 }, a.seat)
  }
}

/**
 * 补杠后的抢杠窗口：无人可抢直接成杠，否则等待表态。
 * 与出牌点炮同一模型（并行收集）：所有能抢杠胡的人同时思考，共享同一截止时间，
 * 全部有结果才结算。有人抢即取消补杠（多人抢则一次性结算多人抢杠胡），
 * 只有全员过，补杠才真正成立。
 * buWild 记录补的那张是不是幺鸡（1 = 用幺鸡补位），被抢杠胡时决定
 * 副露里是否留下幺鸡顶替被抢杠者取走的真牌。
 */
function openRobWindow(s, seat, tile, pengMeld, push, buWild = 0) {
  const waiting = []
  for (const r of seatOrderFrom(s, seat)) {
    if (canHuOn(s, r, tile)) waiting.push(r)
  }
  if (waiting.length === 0) {
    // 无人可抢：立即成杠
    finishBuGang(s, seat, tile, pengMeld, push, buWild)
    return
  }
  s.pendingKong = { seat, tile, tag: ++s.discardTag, buWild }
  s.pendingDiscard = null
  s.waiting = waiting
  s.claims = {}
  s.huWait = waiting.slice() // 抢杠窗口只有 HU 阶段（并行），没有杠/碰阶段
  s.gangWait = []
  s.pengWait = []
  s.phase = PHASE_RESPOND
  push('rob-start', { tile }, seat)
  // 补杠暂不落地：所有人同时思考，有胡则一次性结算，全过才真正成杠
  if (advanceRespond(s) == null) settleAllPass(s, push)
}

/** 补杠成立：peng 副露升级为杠，杠分入账，墙尾摸牌 */
function finishBuGang(s, seat, tile, pengMeld, push, buWild = 0) {
  pengMeld.kind = 'gang'
  pengMeld.gangType = 'bu'
  // 用幺鸡补的第 4 张：副露标记 wild，杠价与番数按「带幺鸡」计算
  if (buWild > 0) pengMeld.wild = (pengMeld.wild || 0) + buWild
  s.pendingKong = null
  closeRespondWindow(s)
  push('gang', { tile, gangType: 'bu', wild: pengMeld.wild || 0 }, seat)
  payGangSelf(s, seat, 'bu', pengMeld.wild || 0, push)
  drawFromTail(s, seat, push)
}

/**
 * 单份杠分（baseScore 单位）：幺鸡局里「不带幺鸡」翻倍（相当于多一番）：
 *   明杠（点杠）：带幺鸡 1 / 不带幺鸡 2；
 *   暗杠（自己甩）：带幺鸡 2 / 不带幺鸡 4；
 *   补杠：带幺鸡 1 / 不带幺鸡 2。
 * 非幺鸡局保持原有定价（明杠 gangMing、暗杠/补杠 gangAn）。
 */
function gangUnit(s, kind, wild) {
  const base = s.rules.baseScore
  if (!yaojiOn(s)) {
    return (kind === 'ming' ? s.rules.gangMing : s.rules.gangAn) * base
  }
  let unit
  if (kind === 'ming') unit = s.rules.gangMing
  else if (kind === 'an') unit = s.rules.gangAn
  else unit = s.rules.gangBu
  return unit * base * ((wild || 0) > 0 ? 1 : 2)
}

/**
 * 暗杠/补杠分：每位活跃未胡玩家各付一份。
 * 同时把本回合杠分暂存到 gangTurn，供「杠上炮转雨」使用。
 */
function payGangSelf(s, seat, kind, wild, push) {
  const amount = gangUnit(s, kind, wild)
  const items = []
  for (const r of activeSeats(s)) {
    if (r === seat) continue
    transfer(s, r, seat, amount, 'gang-an')
    items.push({ from: r, amount })
  }
  addGangTurn(s, seat, items)
}

/** 明杠分：放杠者（被碰杠的出牌者）付一份 */
function payGangMing(s, seat, fromSeat, wild, push) {
  const amount = gangUnit(s, 'ming', wild)
  transfer(s, fromSeat, seat, amount, 'gang-ming')
  addGangTurn(s, seat, [{ from: fromSeat, amount }])
}

/** 记录本回合杠分（同一回合可多次杠，累加；换人则重置） */
function addGangTurn(s, seat, items) {
  if (!s.gangTurn || s.gangTurn.seat !== seat) {
    s.gangTurn = { seat, total: 0, items: [] }
  }
  for (const it of items) {
    s.gangTurn.total += it.amount
    s.gangTurn.items.push(it)
  }
}

// ---- 胡 ----

function doHu(s, a) {
  if (s.phase === PHASE_DISCARD) {
    // 自摸：turn 玩家手牌 + drawnTile 成胡
    if (a.seat !== s.turn) return { error: ERR.NOT_ACTIVE }
    // 碰牌后的强制出牌回合不能报胡（必须打出一张）
    if (s.mustDiscard) return { error: ERR.ILLEGAL }
    const p = s.players[a.seat]
    const full = fullHandOf(s, a.seat)
    const yaoji = yaojiOn(s)
    if (hasVoidTiles(full, p.void, { yaoji })) return { error: ERR.ILLEGAL }
    if (!isWinHand(full, p.melds.length, { yaoji })) return { error: ERR.ILLEGAL }
    // drawnTile 为空 = 庄家起手 14 张成胡（天胡）：手牌本身就是完整胡牌型，
    // 没有单独的胡牌张；不传 winTile，由 huSettle 按封顶番结算。
    const winTile = s.drawnTile
    return {
      after: push => {
        huSettle(s, a.seat, 'zimo', winTile, null, push, undefined, s.afterGangDraw)
        // 血战继续：胡者下一活跃座位摸牌（三人胡满则在 huSettle 内结束）
        if (s.phase !== PHASE_FINISHED) {
          drawFor(s, nextActive(s, a.seat), push)
        }
      }
    }
  }
  if (s.phase === PHASE_RESPOND) {
    // HU 阶段（并行）：只有本阶段胡候选人（huWait）能提交；提交只登记表态，
    // 绝不立即结算——必须等这一批胡权全部有结果，由 afterRespond 一次性批量结算。
    if (s.respondStage !== 'hu') return { error: ERR.NOT_ACTIVE }
    if (!s.huWait.includes(a.seat)) return { error: ERR.NOT_ACTIVE }
    if (s.pendingKong) {
      if (!canHuOn(s, a.seat, s.pendingKong.tile)) return { error: ERR.ILLEGAL }
    } else if (s.pendingDiscard) {
      if (!canClaimHu(s, a.seat)) return { error: ERR.ILLEGAL }
    } else {
      return { error: ERR.WRONG_PHASE }
    }
    s.claims[a.seat] = 'hu'
    return {
      after: push => {
        // 只登记表态并推进：全部胡权有结果后才批量结算（见 afterRespond）
        afterRespond(s, push)
      }
    }
  }
  return { error: ERR.WRONG_PHASE }
}

/**
 * 胡牌结算：自摸由所有活跃未胡玩家各付，点炮/抢杠由责任者付。
 * 物理牌归属：自摸的 drawnTile 并入胡者手牌；点炮的牌落回出牌者
 * 弃牌区（多胡共享展示，展示信息用 hu.winTile，不重复占物理牌）；
 * 抢杠的牌归抢杠者（相当于被抢那家点炮），被抢者副露退回碰——幺鸡补的
 * 那张留在副露里顶替被取走的真牌（见 resolveRespond）。
 * afterGang：本次胡是否由杠后补牌引起（自摸=杠上花 / 点炮=杠上炮），
 *   抢杠胡不算（杠未成立），改按 qianggang 加番。
 */
function huSettle(s, seat, how, winTile, payerSeat, push, discardTag, afterGang) {
  const p = s.players[seat]
  // 天胡（庄家起手 14 张）没有单独的胡牌张（winTile 为空）：手牌本身就是
  // 完整胡牌型，不能再补一张，否则长度变 15 导致番型判定失败。
  const tianhu = winTile == null && how === 'zimo'
  const full = (tianhu ? p.hand.slice() : [...p.hand, winTile]).sort((x, y) => x - y)
  // 海底：牌墙已空（摸到/打出的是最后一张）时的自摸或点炮，额外加番
  const haidi = s.wall.length === 0 && (how === 'zimo' || how === 'dianpao')
  // 杠上胡：本次胡发生在杠后补牌回合（自摸→杠上花，点炮→杠上炮），额外加番
  const gangshang = afterGang === true && (how === 'zimo' || how === 'dianpao')
  const fanRes = finalFan(full, p.melds, {
    zimo: how === 'zimo',
    haidi,
    gangshang,
    qianggang: how === 'qianggang',
    capFan: s.rules.capFan,
    zimoFan: s.rules.zimoFan,
    haidiFan: s.rules.haidiFan,
    gangShangFan: s.rules.gangShangFan,
    qianggangFan: s.rules.qianggangFan,
    genFan: s.rules.genFan,
    yaoji: yaojiOn(s),
    tianhu
  })
  const amount = s.rules.baseScore * Math.pow(2, fanRes.fan)
  let total = 0
  if (how === 'zimo') {
    for (const r of activeSeats(s)) {
      if (r === seat) continue
      transfer(s, r, seat, amount, 'zimo')
      total += amount
    }
  } else {
    transfer(s, payerSeat, seat, amount, how)
    total = amount
  }
  // 杠上炮转雨（仅幺鸡局）：出杠者在杠后补牌回合打出的牌被胡，本回合收到的
  // 杠钱转给胡牌者（只转一次：一炮多响时归到最先结算的胡牌者，转完即清空 gangTurn）。
  if (yaojiOn(s) && gangshang && how === 'dianpao' && s.gangTurn && s.gangTurn.seat === payerSeat) {
    const gt = s.gangTurn
    s.gangTurn = null
    for (const it of gt.items) {
      transfer(s, gt.seat, seat, it.amount, 'gang-zhuan-yu')
      total += it.amount
    }
  }
  const huOrder = s.huOrder.length + 1
  p.hu = {
    how,
    winTile,
    fan: fanRes.fan,
    names: fanRes.names,
    huOrder,
    scoreDelta: total
  }
  if (how === 'zimo') {
    // 自摸：刚摸的牌并入胡者手牌（展示完整胡牌）
    p.hand = full
    if (s.turn === seat) s.drawnTile = null
  } else if (how === 'dianpao' && s.pendingDiscard) {
    // 点炮：牌落回出牌者弃牌区（多响只落一次）
    s.players[s.pendingDiscard.seat].discards.push(s.pendingDiscard.tile)
    s.pendingDiscard = null
  }
  s.huOrder.push({
    seat,
    how,
    winTile,
    fan: fanRes.fan,
    names: fanRes.names,
    scoreDelta: total,
    from: payerSeat != null ? payerSeat : undefined,
    // 出牌/补杠批次号：仅点炮、抢杠有；用于判定“一炮多响”（同一张牌多家胡）
    tag: discardTag != null ? discardTag : undefined
  })
  push('hu', { winTile, fan: fanRes.fan, names: fanRes.names, how, huOrder }, seat)
  // 三人胡满 → 立即结束（无查叫）
  if (s.huOrder.length >= s.rules.endWhenHuPlayers) {
    finish(s, push)
  }
}

// ---- 过 ----

function doPass(s, a) {
  if (s.phase !== PHASE_RESPOND) return { error: ERR.WRONG_PHASE }
  if (a.seat == null) return { error: ERR.ILLEGAL }
  // HU 阶段（并行）：huWait 里的胡候选人各自表态；「过」= 放弃这次胡，但若本人
  // 还有碰/明杠资格，权利保留到后面的 GANG / PENG 阶段（claims 记 'pass-hu'）。
  if (s.respondStage === 'hu') {
    if (!s.huWait.includes(a.seat)) return { error: ERR.NOT_ACTIVE }
    // 过水登记：放弃的是一次真能胡的点炮 → 记下这手番数，自己摸牌（过庄）
    // 之前不能再胡同番或更低番的炮（自摸不受限、番更大的炮仍可胡）。
    // 抢杠（pendingKong）不属于「别人打出的牌」，不登记。
    if (
      s.pendingDiscard &&
      canHuOn(s, a.seat, s.pendingDiscard.tile) &&
      !passHuBlocks(s, a.seat, s.pendingDiscard.tile, s.pendingDiscard.isAfterGang === true)
    ) {
      s.players[a.seat].passHu = {
        fan: dianpaoFanOn(s, a.seat, s.pendingDiscard.tile, s.pendingDiscard.isAfterGang === true),
        tile: s.pendingDiscard.tile
      }
    }
    const tile = respondTile(s)
    s.claims[a.seat] = tile != null && canClaimMeld(s, a.seat, tile) ? 'pass-hu' : 'pass'
    return {
      after: push => {
        push('pass', { stage: 'hu' }, a.seat)
        afterRespond(s, push)
      }
    }
  }
  // GANG / PENG 阶段（串行）：只有当前唯一响应者能提交「过」
  if (s.currentResponder !== a.seat) return { error: ERR.NOT_ACTIVE }
  const stage = s.respondStage
  // 「过」是本窗口内的最终决定：GANG 阶段同屏给过「杠 / 碰 / 过」，
  // 点「过」即同时放弃杠和碰，不再于 PENG 阶段重复询问。
  s.claims[a.seat] = 'pass'
  return {
    after: push => {
      push('pass', { stage }, a.seat)
      afterRespond(s, push)
    }
  }
}

// ---------- 响应窗口裁决 ----------

/** 当前响应窗口待裁决的那张牌（抢杠窗口为被抢的补杠牌） */
function respondTile(s) {
  if (s.pendingKong) return s.pendingKong.tile
  if (s.pendingDiscard) return s.pendingDiscard.tile
  return null
}

/** 该座位能否在该牌上碰/明杠（放弃过胡后是否保留后续阶段权利） */
function canClaimMeld(s, seat, tile) {
  if (tile == null) return false
  return canClaimPeng(s, seat, tile) || canClaimGang(s, seat, tile)
}

/** seat 玩家能否明杠 tile（tile 非其缺门；缺门约束与碰一致：有缺门牌也能杠） */
function canClaimGang(s, seat, tile) {
  if (tile == null) return false
  const p = s.players[seat]
  const yaoji = yaojiOn(s)
  if (p.void && tileSuit(tile) === p.void && !(yaoji && tile === YAOJI_TILE)) return false
  return gangMingWildCount(p.hand, tile, yaoji) != null
}

/**
 * 推进响应窗口到「下一个拥有决定权的阶段 / 座位」：
 *   1) HU 阶段（并行收集）——只要 huWait 还有未表态的胡候选人，就停在 HU 阶段，
 *      所有人同时拥有决定权（currentResponder 为 null）；绝不因为某人先叫胡
 *      就关掉别人的窗口。所有胡候选人都表态后，才轮到下一阶段。
 *   2) GANG 阶段（串行）——按有效摸牌顺序逐个问明杠；过胡者（pass-hu）仍保留
 *      杠权，所以会继续排到它。该座位同一张牌既能杠又能碰时，两个选项同屏给
 *      出（选碰也立即成交）；一旦有人杠/碰即成交，后面不再有机会。
 *   3) PENG 阶段（串行）——所有杠候选人都过之后，才按同一顺序逐个问碰；
 *      过胡（pass-hu）者仍保留碰权。
 * 返回当前阶段 'hu' | 'gang' | 'peng'，无人可响应时返回 null。
 */
function advanceRespond(s) {
  // HU 阶段（并行）
  if (s.huWait.length > 0) {
    s.respondStage = 'hu'
    s.currentResponder = null
    return 'hu'
  }
  s.respondStage = null
  s.currentResponder = null
  // 抢杠窗口只有 HU 阶段，没有杠/碰
  if (s.pendingKong) return null
  const tile = respondTile(s)
  if (tile == null) return null
  // GANG 阶段（串行）：过胡者仍保留杠权，继续排到它；已彻底出局（pass/gang 已表态）的跳过
  while (s.gangWait.length && !waitingForStage(s.claims[s.gangWait[0]])) s.gangWait.shift()
  if (s.gangWait.length) {
    s.respondStage = 'gang'
    s.currentResponder = s.gangWait[0]
    return 'gang'
  }
  // PENG 阶段（串行）：过胡者仍保留碰权
  while (s.pengWait.length && !waitingForStage(s.claims[s.pengWait[0]])) s.pengWait.shift()
  if (s.pengWait.length) {
    s.respondStage = 'peng'
    s.currentResponder = s.pengWait[0]
    return 'peng'
  }
  return null
}

/**
 * 该座位在 GANG / PENG 阶段的表态是否「尚未发生」：
 * 从未表态（null）或只过过胡（pass-hu）的人都还要问；
 * 已表态（pass / gang / peng）即为本窗口内的最终决定，不再重复询问。
 */
function waitingForStage(claim) {
  if (claim == null) return true
  return claim === 'pass-hu'
}

/**
 * 一次响应表态之后的统一推进（HU 并行收集 / GANG·PENG 串行推进）：
 *   · HU 阶段：把已表态者移出 huWait；只要还有人没表态就继续等（窗口不关、
 *     不结算）。全部有结果后——有人叫胡则一次性批量结算所有胡
 *     （resolveHuBatch），无人叫胡才进入 GANG / PENG 阶段。
 *   · GANG / PENG 阶段：当前响应者已表态，推进到下一个（或下一阶段 / 全过轮转）。
 */
function afterRespond(s, push) {
  if (s.phase !== PHASE_RESPOND) return
  if (s.respondStage === 'hu') {
    s.huWait = s.huWait.filter(seat => s.claims[seat] == null)
    if (s.huWait.length > 0) return // 还有胡权玩家在思考：不关窗、不结算
    const huSeats = s.waiting.filter(seat => s.claims[seat] === 'hu')
    if (huSeats.length > 0) {
      resolveHuBatch(s, huSeats, push)
      return
    }
    if (advanceRespond(s) == null) settleAllPass(s, push)
    return
  }
  if (advanceRespond(s) == null) settleAllPass(s, push)
}

/**
 * 一次性结算本窗口所有叫胡的座位（一炮多响 / 多人抢杠胡）。
 * 关键：所有胡者的结算都在同一份「还未被胡牌修改过」的 GameState 上一次做完，
 * 不会出现「先结算的人改了状态导致后来者胡失败」。结算顺序取有效摸牌顺序
 * （s.waiting），保证 huOrder 确定可复现。
 */
function resolveHuBatch(s, huSeats, push) {
  const isRob = !!s.pendingKong
  const block = isRob ? s.pendingKong : s.pendingDiscard
  const tile = block.tile
  const payer = block.seat
  const tag = block.tag
  const afterGang = isRob ? false : block.isAfterGang === true
  if (isRob) {
    // 抢杠胡成立 → 补杠取消（杠不成立、杠钱一分不收）；用幺鸡补的第 4 张留在
    // 副露里顶替被取走的真牌；被抢的牌相当于被杠者点炮，落进他的弃牌区。
    const buWild = s.pendingKong.buWild || 0
    if (buWild > 0) {
      const meld = s.players[payer].melds.find(m => m.kind === 'peng' && m.tile === tile)
      if (meld) meld.wild = (meld.wild || 0) + buWild
    }
    s.players[payer].discards.push(tile)
    s.pendingKong = null
  }
  const ordered = s.waiting.filter(seat => huSeats.includes(seat))
  closeRespondWindow(s)
  for (const seat of ordered) {
    if (s.phase === PHASE_FINISHED) break // 胡满（如 endWhenHuPlayers）即止
    huSettle(s, seat, isRob ? 'qianggang' : 'dianpao', tile, payer, push, tag, afterGang)
  }
  if (s.phase === PHASE_FINISHED) return
  // 点炮的牌由 huSettle 落进点炮者弃牌区（多响只落一次）；这里只作防御性收尾
  if (s.pendingDiscard) {
    s.players[s.pendingDiscard.seat].discards.push(s.pendingDiscard.tile)
    s.pendingDiscard = null
  }
  // 血战继续：下一手摸牌一律复用引擎「活跃座位」逻辑（跳过已胡出阵者），不在
  // 联机层另算。多人胡时以最靠近出牌者的那位胡家为基准取其次位活跃玩家；
  // 抢杠胡则由被抢者（本次的负方）接着摸牌（他的杠被打断，回合归还给他）。
  drawFor(s, isRob ? payer : nextActive(s, ordered[0]), push)
}

/** 关闭响应窗口（清空窗口字段与三阶段队列） */
function closeRespondWindow(s) {
  s.waiting = []
  s.claims = {}
  s.currentResponder = null
  s.respondStage = null
  s.huWait = []
  s.gangWait = []
  s.pengWait = []
}

/**
 * 碰/明杠响应：同级按顺序，当前响应者一旦选择即成交，后面的座位不再有机会。
 */
function settleMeld(s, seat, kind, push) {
  const payer = s.pendingDiscard.seat
  const tile = s.pendingDiscard.tile
  const p = s.players[seat]
  if (kind === 'peng') {
    // 碰：不摸牌直接进入碰者出牌（强制出牌回合：只许打一张，不能胡/杠）
    const wild = pengWildCount(p.hand, tile, yaojiOn(s)) || 0
    removeTiles(p.hand, new Array(2 - wild).fill(tile).concat(new Array(wild).fill(YAOJI_TILE)))
    const meld = { kind: 'peng', tile, from: payer }
    if (wild > 0) {
      meld.wild = wild
      // 幺鸡是在「碰」这一步进来的：此类副露不可换回幺鸡（含之后用真牌补杠）
      meld.wildPeng = wild
    }
    p.melds.push(meld)
    s.pendingDiscard = null
    closeRespondWindow(s)
    s.phase = PHASE_DISCARD
    s.turn = seat
    s.drawnTile = null
    s.mustDiscard = true
    // 上一回合的杠分风险随出牌结束而解除（该回合已无杠上炮可能）
    s.gangTurn = null
    push('peng', { tile, from: payer, wild }, seat)
    push('turn', { turn: seat })
    return
  }
  // 明杠：出牌者付分（幺鸡局带幺鸡 1 / 不带幺鸡 2），杠者墙尾摸牌继续
  const wild = gangMingWildCount(p.hand, tile, yaojiOn(s)) || 0
  removeTiles(p.hand, new Array(3 - wild).fill(tile).concat(new Array(wild).fill(YAOJI_TILE)))
  const meld = { kind: 'gang', gangType: 'ming', tile, from: payer }
  if (wild > 0) meld.wild = wild
  p.melds.push(meld)
  s.pendingDiscard = null
  closeRespondWindow(s)
  push('gang', { tile, gangType: 'ming', from: payer, wild }, seat)
  payGangMing(s, seat, payer, wild, push)
  drawFromTail(s, seat, push)
}

/** 全部响应者都过：出牌落弃牌区轮转 / 补杠真正成立并补牌 */
function settleAllPass(s, push) {
  if (s.pendingKong) {
    const robbed = s.pendingKong.seat
    const tile = s.pendingKong.tile
    const buWild = s.pendingKong.buWild || 0
    s.pendingKong = null
    closeRespondWindow(s)
    const meld = s.players[robbed].melds.find(m => m.kind === 'peng' && m.tile === tile)
    if (meld) {
      finishBuGang(s, robbed, tile, meld, push, buWild)
    } else {
      drawFor(s, robbed, push)
    }
    return
  }
  if (!s.pendingDiscard) {
    closeRespondWindow(s)
    return
  }
  const payer = s.pendingDiscard.seat
  const tile = s.pendingDiscard.tile
  s.players[payer].discards.push(tile)
  s.pendingDiscard = null
  closeRespondWindow(s)
  drawFor(s, nextActive(s, payer), push)
}

// ---------- 摸牌与流局 ----------

/** 普通摸牌（墙头）；墙空则流局结算 */
function drawFor(s, seat, push) {
  if (s.wall.length === 0) {
    finishByFlow(s, push)
    return
  }
  s.drawnTile = s.wall.shift()
  s.turn = seat
  s.phase = PHASE_DISCARD
  s.mustDiscard = false // 新摸牌回合，恢复可胡可杠
  s.afterGangDraw = false // 普通摸牌（墙头）非杠后补牌
  s.gangTurn = null // 新回合开始：上一回合的杠分不再有转雨风险
  s.players[seat].passHu = null // 过庄：本巡的过水限制解除（自摸/再点炮都可胡）
  push('draw', { tile: s.drawnTile, wallCount: s.wall.length }, seat)
  push('turn', { turn: seat })
}

/** 杠后摸牌（墙尾）；墙空则流局结算 */
function drawFromTail(s, seat, push) {
  if (s.wall.length === 0) {
    finishByFlow(s, push)
    return
  }
  s.drawnTile = s.wall.pop()
  s.turn = seat
  s.phase = PHASE_DISCARD
  s.mustDiscard = false // 新摸牌回合，恢复可胡可杠
  s.afterGangDraw = true // 杠后补牌：本回合自摸即“杠上花”，打出的牌被胡即“杠上炮”
  s.players[seat].passHu = null // 过庄：杠后补牌同样是「摸到牌」，过水限制解除
  push('draw', { tile: s.drawnTile, wallCount: s.wall.length, tail: true }, seat)
  push('turn', { turn: seat })
}

/** 三人胡满直接结束 */
function finish(s, push) {
  s.phase = PHASE_FINISHED
  s.pendingDiscard = null
  s.pendingKong = null
  closeRespondWindow(s)
  s.drawnTile = null
  s.gangTurn = null
  s.xiItems = settleXi(s)
  s.results = settlementOf(s)
  push('settle', { liuju: false, huCount: s.huOrder.length })
}

/**
 * 幺鸡喜钱（幺鸡局）：结算时名下恰有 3 只幺鸡 → 每家给 4 分；
 * 4 只幺鸡 → 每家给 8 分。由其余三家（含已胡者）支付。
 * 计数含手牌 + 副露：补位用的幺鸡、被抢杠后留在副露的幺鸡都还算在名下。
 */
function settleXi(s) {
  const xiItems = []
  if (!yaojiOn(s)) return xiItems
  const amountOf = n => (n >= 4 ? s.rules.xiFour : s.rules.xiThree)
  for (const p of s.players) {
    const count = ownedYaoji(p)
    if (count < 3) continue
    const amount = amountOf(count) * s.rules.baseScore
    let total = 0
    for (const q of s.players) {
      if (q.seat === p.seat) continue
      transfer(s, q.seat, p.seat, amount, 'yaoji-xi')
      total += amount
    }
    xiItems.push({ seat: p.seat, count, amount, total })
  }
  return xiItems
}

/** 流局：查花猪 + 查大叫 */
function finishByFlow(s, push) {
  // 防御：未落地的出牌先进弃牌区（正常路径 drawFor 前已清空）
  if (s.pendingDiscard) {
    s.players[s.pendingDiscard.seat].discards.push(s.pendingDiscard.tile)
    s.pendingDiscard = null
  }
  s.phase = PHASE_FINISHED
  s.pendingDiscard = null
  s.pendingKong = null
  closeRespondWindow(s)
  s.drawnTile = null
  s.gangTurn = null

  const yaoji = yaojiOn(s)
  const capAmount =
    s.rules.baseScore * Math.pow(2, s.rules.capFan)
  const actives = activeSeats(s)
  // 花猪：未胡且手牌仍含缺门花色（幺鸡局幺鸡豁免，不算缺门牌）
  const huazhu = actives.filter(seat =>
    hasVoidTiles(s.players[seat].hand, s.players[seat].void, { yaoji })
  )
  const others = actives.filter(seat => !huazhu.includes(seat))
  // 听牌判定：已打缺且 tingTiles 非空（排除缺门花色候选）
  const ting = seat => {
    const p = s.players[seat]
    if (hasVoidTiles(p.hand, p.void, { yaoji })) return false
    return tingTiles(p.hand, p.melds.length, { yaoji }).some(
      t => tileSuit(t) !== p.void || (yaoji && t === YAOJI_TILE)
    )
  }
  const listeners = others.filter(ting)
  const notListeners = others.filter(seat => !ting(seat))

  // 退杠：流局时未听牌者（含花猪，花猪手里还有缺门牌必然未听）退还本局
  // 全部已收杠钱（明杠 / 补杠刮风、暗杠下雨）——杠分是预收，听牌才算落袋。
  // 胡满结束的局（finish）不走这里，已收杠钱照收。
  const refundItems = []
  if (s.rules.refundGangOnFlow) {
    for (const seat of actives.filter(seat => !ting(seat))) {
      const income = s.ledger.filter(
        e => e.to === seat && (e.reason === 'gang-an' || e.reason === 'gang-ming')
      )
      if (!income.length) continue
      let amount = 0
      for (const e of income) {
        transfer(s, seat, e.from, e.amount, 'gang-refund')
        amount += e.amount
      }
      refundItems.push({ type: 'tuigang', seat, amount, count: income.length })
    }
  }

  const chaItems = []
  if (s.rules.chaHuaZhu) {
    for (const hz of huazhu) {
      for (const r of others) {
        transfer(s, hz, r, capAmount, 'cha-huazhu')
      }
      chaItems.push({ type: 'huazhu', seat: hz, amount: capAmount })
    }
  }
  if (s.rules.chaDaJiao) {
    for (const nj of notListeners) {
      // 赔付按该未听牌玩家手里这副牌“再做下去最多能成的番数”算，
      // 而不是一律按封顶：烂牌只赔平胡 0 番（1 倍底分），好牌才赔得多。
      const pot = potentialFan(s.players[nj].hand, s.players[nj].melds, {
        capFan: s.rules.capFan,
        genFan: s.rules.genFan,
        yaoji
      })
      const amount = s.rules.baseScore * Math.pow(2, pot.fan)
      for (const t of listeners) {
        transfer(s, nj, t, amount, 'cha-dajiao')
      }
      chaItems.push({ type: 'dajiao', seat: nj, amount, fan: pot.fan, names: pot.names })
    }
  }
  s.chaItems = chaItems
  s.refundItems = refundItems
  s.xiItems = settleXi(s)
  push('liuju', { huazhu, notListeners, listeners, refundItems })
  s.results = settlementOf(s)
  push('settle', { liuju: true })
}

/** 记账：from 向 to 支付 amount（reason 流水原因），同步双方 delta */
function transfer(s, from, to, amount, reason) {
  s.players[from].delta -= amount
  s.players[to].delta += amount
  s.ledger.push({ from, to, amount, reason })
}

// ---------- 视图与结算 ----------

/** 收支流水（对外） */
export function settlementOf(state) {
  if (state.phase !== PHASE_FINISHED) return null
  const yaoji = yaojiOn(state)
  return {
    liuju: state.huOrder.length < state.rules.endWhenHuPlayers,
    huOrder: clone(state.huOrder),
    ledger: clone(state.ledger),
    perSeat: state.players.map(p => ({ seat: p.seat, delta: p.delta })),
    // 终局牌面：各家手牌 + 副露 + 缺门，结算页摆出来供核对
    // （番型是否算对、杠了几组、是否真听牌）。牌局已结束，公开手牌无隐私问题。
    // 点炮 / 抢杠胡者手里的 hand 不含胡牌张（那张牌在点炮者弃牌区），
    // 展示时由 UI 用 hu.winTile 补上，自摸（含天胡）的 hand 已含胡牌张。
    seats: state.players.map(p => ({
      seat: p.seat,
      hand: clone(p.hand),
      melds: clone(p.melds),
      void: p.void,
      hu: clone(p.hu),
      ting:
        !p.hu &&
        p.hand.length % 3 === 1 &&
        !hasVoidTiles(p.hand, p.void, { yaoji }) &&
        tingTiles(p.hand, p.melds.length, { yaoji }).some(
          t => tileSuit(t) !== p.void || (yaoji && t === YAOJI_TILE)
        )
    })),
    chaItems: clone(state.chaItems || []),
    refundItems: clone(state.refundItems || []),
    xiItems: clone(state.xiItems || [])
  }
}

/**
 * 玩家视角（受限信息）：严禁泄露他人手牌内容与墙序。
 * draw 事件的 tile 仅对摸牌者本人可见；他人手牌只给 handCount。
 * 定缺是「同时亮底」：定缺阶段他人缺门一律为 null（只看得到自己的），
 * 四家全部定完（阶段转入摸打）才公开——否则先定完的 AI 会变成后面玩家
 * 针对性定缺的依据。
 */
export function playerView(state, seat) {
  const s = state
  const allVoided = s.players.every(p => p.void != null)
  const players = s.players.map(p => ({
    seat: p.seat,
    handCount:
      p.hand.length +
      (s.drawnTile != null && s.turn === p.seat && s.phase === PHASE_DISCARD ? 1 : 0),
    melds: clone(p.melds),
    discards:
      s.pendingDiscard && s.pendingDiscard.seat === p.seat
        ? [...p.discards, s.pendingDiscard.tile]
        : clone(p.discards),
    void: p.seat === seat || allVoided ? p.void : null,
    hu: clone(p.hu),
    delta: p.delta
  }))
  const me = s.players[seat]
  const yaoji = yaojiOn(s)
  const myDrawn =
    s.phase === PHASE_DISCARD && s.turn === seat && s.drawnTile != null
      ? s.drawnTile
      : null
  const myTing =
    me.hand.length % 3 === 1 && !hasVoidTiles(me.hand, me.void, { yaoji })
      ? tingTiles(me.hand, me.melds.length, { yaoji }).filter(
          t => !(me.void && tileSuit(t) === me.void && !(yaoji && t === YAOJI_TILE))
        )
      : []
  // 当前番数：已胡给胡牌番数；听牌取所有可胡张的最大番（番张可能不同番）；
  // 未听牌但有副露（碰/杠）时按手牌最大可能番数估算，便于判断做牌方向。
  let myFan = null
  if (me.hu) {
    myFan = { fan: me.hu.fan, names: me.hu.names || [], kind: 'hu' }
  } else if (myTing.length) {
    let best = null
    for (const t of myTing) {
      const fr = finalFan([...me.hand, t], me.melds, {
        capFan: s.rules.capFan,
        genFan: s.rules.genFan,
        yaoji
      })
      if (fr && (!best || fr.fan > best.fan)) best = fr
    }
    if (best) myFan = { fan: best.fan, names: best.names, kind: 'ting' }
  } else if (me.melds.length > 0 && me.hand.length % 3 === 1) {
    const pf = potentialFan(me.hand, me.melds, {
      capFan: s.rules.capFan,
      genFan: s.rules.genFan,
      yaoji
    })
    myFan = { fan: pf.fan, names: pf.names, kind: 'potential' }
  }
  // 响应窗口三阶段（HU 并行 / GANG·PENG 串行）：当前拥有决定权的座位集合——
  // HU 阶段是 huWait 里所有未表态的胡候选人（并行），GANG/PENG 阶段是唯一
  // currentResponder。我不在其中时 legal 为空，UI 依据 awaitingNearer 显示
  // 「等待 X 叫牌…」而不是一个会被误点的「过」。
  const deciders =
    s.phase === PHASE_RESPOND
      ? s.respondStage === 'hu'
        ? s.huWait.slice()
        : s.currentResponder != null
          ? [s.currentResponder]
          : []
      : []
  const awaitingNearer = deciders.filter(s2 => s2 !== seat)
  const my = {
    seat,
    hand: clone(me.hand),
    drawnTile: myDrawn,
    melds: clone(me.melds),
    discards: players[seat].discards,
    void: me.void,
    hu: clone(me.hu),
    delta: me.delta,
    ting: myTing,
    fan: myFan,
    // 过水状态：本巡已放弃的点炮番数（UI 用来解释「为什么这次不能胡」）。
    // 自己摸牌（过庄）后自动清空；自摸与番更大的炮不受影响。
    passHu: me.passHu ? { fan: me.passHu.fan, tile: me.passHu.tile } : null,
    // 此刻仍拥有决定权、且不是我的座位：非空表示「还在等其他家表态」，
    // 我的碰/杠权还在排队，UI 显示等待提示而不是可点的「过」。
    awaitingNearer
  }
  return {
    version: s.version,
    ruleVersion: s.ruleVersion,
    phase: s.phase,
    turn: s.turn,
    dealer: s.dealer,
    wallCount: s.wall.length,
    yaoji,
    pendingDiscard: clone(s.pendingDiscard),
    pendingKong: clone(s.pendingKong),
    players,
    my,
    legal: legalActions(s, seat),
    // 响应窗口：暴露当前拥有决定权的座位（HU 阶段可能多家并行，GANG/PENG 阶段
    // 只有唯一 currentResponder）；其余座位 legal 为空，UI 依据
    // my.awaitingNearer 显示等待提示。respondStage 一并暴露便于前端与日志对齐
    // 三阶段（'hu' | 'gang' | 'peng'）。
    waiting: s.phase === PHASE_RESPOND ? deciders : [],
    currentResponder: s.phase === PHASE_RESPOND ? s.currentResponder : null,
    respondStage: s.phase === PHASE_RESPOND ? s.respondStage : null,
    lastEvents: s.events.slice(-20).map(ev => {
      // 隐私过滤：他人摸到的牌不可见
      if (ev.type === 'draw' && ev.seat !== seat) {
        const d = { ...ev.data }
        delete d.tile
        return { ...ev, data: d }
      }
      if (ev.type === 'swap-select' && ev.seat !== seat) {
        const d = { ...ev.data }
        delete d.tiles
        return { ...ev, data: d }
      }
      // 定缺未亮底：他人的 void-set 只报事件、不带花色
      if (ev.type === 'void-set' && ev.seat !== seat && !allVoided) {
        const d = { ...ev.data }
        delete d.suit
        return { ...ev, data: d }
      }
      return ev
    }),
    results: clone(s.results)
  }
}
