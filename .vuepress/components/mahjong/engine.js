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
// - 响应窗口等所有 waiting 玩家表态（claims）后统一裁决：
//   胡（可多响）> 碰 > 明杠 > 全过。
// - 杠分即时入账（ledger + players.delta）；胡牌/查叫也在 ledger 留流水。
// - 杠上胡加番：所有杠（明/暗/补）后都从墙尾补牌，该回合自摸即“杠上花”、
//   打出的牌被胡即“杠上炮”，都给胡牌者额外加番（抢杠胡不算，杠未成立）。
// - 抢杠胡：补杠被抢则杠不成立——杠钱一分不收（相当于没杠到），被抢的牌落进
//   被抢者弃牌区（相当于他点炮），抢杠者额外加 1 番（qianggangFan）。幺鸡补的
//   那张留在副露里顶替被取走的真牌（碰带幺鸡不可换回，要再杠只能等真牌）。
// - 根加番：胡牌时手牌 + 副露中每有一组 4 张相同牌（明/暗/补杠，或碰后
//   手留一张、手里 4 张未杠）额外加 1 番（genFan），与杠钱互相独立。
// - 流局查叫：查花猪（未打缺赔封顶给所有其他未胡玩家）优先于
//   查大叫（已打缺未听牌赔给听牌的未胡玩家，赔付额按未听牌者自己
//   这副牌的最大可能番数算，非一律封顶）；已胡玩家不再参与。
// - 退杠：杠分是预收，流局时未听牌者（含花猪）须退还本局全部已收
//   杠钱（理由 gang-refund，逐笔原路退回）；有人胡满结束的局不退。
// - 幺鸡赖子（rules.yaojiEnabled）：幺鸡（一条）当万能牌（详见 rules.js）。
//   · 碰/明杠/暗杠/补杠允许「真牌 + 幺鸡」补位，副露用 meld.wild 记录用了几只幺鸡
//     （一副露最多 1 只：碰里已经带了幺鸡的，只能等摸到真牌再补杠）；
//   · 带幺鸡的明杠/暗杠，之后手里又摸到对应真牌时可用 swap-yaoji 把幺鸡换回
//     手牌（碰带幺鸡、碰后补杠都不允许换）；
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
      swapPicked: null
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
    claims: {}, // respond 窗口：{seat: 'hu'|'peng'|'gang'|'pass'}
    waiting: [], // respond 窗口：需要表态的座位
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
    const voiding = hasVoidTiles(full, p.void, { yaoji })
    // 有缺门牌：只能打缺门，且不允许碰杠胡（幺鸡局幺鸡豁免，不算缺门牌）
    if (voiding) {
      const tiles = [...new Set(full.filter(t => tileSuit(t) === p.void))]
      return [{ type: ACTION.DISCARD, tiles }, ...swapYaojiOptions(s, seat)]
    }
    const out = []
    // 出牌：全部可打
    out.push({ type: ACTION.DISCARD, tiles: [...new Set(full)] })
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
    if (!s.mustDiscard && isWinHand(full, meldCount, { yaoji })) {
      out.push({ type: ACTION.HU, how: 'zimo' })
    }
    return out
  }
  // 响应窗口（waiting 且未表态）
  if (s.phase === PHASE_RESPOND) {
    if (!s.waiting.includes(seat) || s.claims[seat] != null) return []
    const yaoji = yaojiOn(s)
    const out = []
    if (s.pendingKong) {
      // 抢杠窗口：只能胡或过
      if (canHuOn(s, seat, s.pendingKong.tile)) {
        out.push({ type: ACTION.HU, how: 'qianggang' })
      }
      out.push({ type: ACTION.PASS })
      return out
    }
    if (s.pendingDiscard) {
      const tile = s.pendingDiscard.tile
      if (canHuOn(s, seat, tile)) {
        out.push({ type: ACTION.HU, how: 'dianpao' })
      }
      const hand = p.hand
      const opts = []
      // 明杠：3 张真牌，或 2 张真牌 + 1 只幺鸡
      if (pengWildCount(hand, tile, yaoji) != null && gangMingWildCount(hand, tile, yaoji) != null) {
        opts.push({ tile, gangType: 'ming' })
      }
      if (pengWildCount(hand, tile, yaoji) != null) {
        // 碰与明杠分开成两个动作项，便于 UI 分别渲染
        out.push({ type: ACTION.PENG, tile })
        if (opts.length) {
          out.push({ type: ACTION.GANG, options: opts })
        }
      }
      out.push({ type: ACTION.PASS })
      return out
    }
  }
  return []
}

/**
 * 幺鸡换牌可选项：幺鸡局里「明杠/暗杠」用幺鸡补位（meld.wild>0），
 * 之后手里又拿到对应真牌时，可把真牌编入副露、把幺鸡换回手牌继续当赖子。
 * 碰带幺鸡、碰后补杠都不允许换（呼应规则：只有杠形成的幺鸡才能换回）。
 */
function swapYaojiOptions(s, seat) {
  if (!yaojiOn(s) || s.mustDiscard) return []
  if (s.phase !== PHASE_DISCARD || s.turn !== seat) return []
  const p = s.players[seat]
  const full = fullHandOf(s, seat)
  const out = []
  const seen = new Set()
  for (const m of p.melds) {
    if (m.kind !== 'gang' || m.gangType === 'bu') continue
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

/** seat 玩家能否碰/明杠 tile（无缺门牌且 tile 非其缺门；幺鸡豁免定缺） */
function canClaimPeng(s, seat, tile) {
  const p = s.players[seat]
  const yaoji = yaojiOn(s)
  if (hasVoidTiles(p.hand, p.void, { yaoji })) return false
  if (p.void && tileSuit(tile) === p.void && !(yaoji && tile === YAOJI_TILE)) return false
  return pengWildCount(p.hand, tile, yaoji) != null
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
  const waiting = []
  for (const seat of activeSeats(s)) {
    if (seat === discarder) continue
    const can = canHuOn(s, seat, tile) || canClaimPeng(s, seat, tile)
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
  s.phase = PHASE_RESPOND
}

// ---- 碰（响应窗口） ----

function doPeng(s, a) {
  if (s.phase !== PHASE_RESPOND) return { error: ERR.WRONG_PHASE }
  if (!s.pendingDiscard) return { error: ERR.WRONG_PHASE }
  if (!s.waiting.includes(a.seat) || s.claims[a.seat] != null) {
    return { error: ERR.NOT_ACTIVE }
  }
  const tile = s.pendingDiscard.tile
  if (!canClaimPeng(s, a.seat, tile)) {
    return { error: ERR.ILLEGAL }
  }
  s.claims[a.seat] = 'peng'
  return {
    after: push => {
      // 全员表态后才裁决（避免剥夺其他玩家的胡权）
      if (s.waiting.every(seat => s.claims[seat] != null)) {
        resolveRespond(s, push)
      }
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
  if (hasVoidTiles(full, p.void, { yaoji })) return { error: ERR.ILLEGAL }

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
  if (!s.waiting.includes(a.seat) || s.claims[a.seat] != null) {
    return { error: ERR.NOT_ACTIVE }
  }
  const tile = s.pendingDiscard.tile
  if (gangMingWildCount(s.players[a.seat].hand, tile, yaojiOn(s)) == null) {
    return { error: ERR.ILLEGAL }
  }
  s.claims[a.seat] = 'gang'
  return {
    after: push => {
      if (s.waiting.every(seat => s.claims[seat] != null)) {
        resolveRespond(s, push)
      }
    }
  }
}

/**
 * 幺鸡换牌：把带幺鸡补位的明杠/暗杠里的幺鸡换回手牌——
 * 玩家手里又拿到该副露对应的真牌时，用真牌补全副露、幺鸡回到手里继续当赖子。
 * 碰带幺鸡、碰后补杠一律不可换（只有杠才有此权利）。
 */
function doSwapYaoji(s, a) {
  if (s.phase !== PHASE_DISCARD) return { error: ERR.WRONG_PHASE }
  if (a.seat !== s.turn) return { error: ERR.NOT_ACTIVE }
  if (s.mustDiscard) return { error: ERR.ILLEGAL }
  if (!yaojiOn(s)) return { error: ERR.ILLEGAL }
  const p = s.players[a.seat]
  const meld = p.melds.find(
    m => m.kind === 'gang' && m.gangType !== 'bu' && m.tile === a.tile && (m.wild || 0) > 0
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
 * buWild 记录补的那张是不是幺鸡（1 = 用幺鸡补位），被抢杠胡时决定
 * 副露里是否留下幺鸡顶替被抢杠者取走的真牌。
 */
function openRobWindow(s, seat, tile, pengMeld, push, buWild = 0) {
  const waiting = []
  for (const r of activeSeats(s)) {
    if (r === seat) continue
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
  s.phase = PHASE_RESPOND
  push('rob-start', { tile }, seat)
}

/** 补杠成立：peng 副露升级为杠，杠分入账，墙尾摸牌 */
function finishBuGang(s, seat, tile, pengMeld, push, buWild = 0) {
  pengMeld.kind = 'gang'
  pengMeld.gangType = 'bu'
  // 用幺鸡补的第 4 张：副露标记 wild，杠价与番数按「带幺鸡」计算
  if (buWild > 0) pengMeld.wild = (pengMeld.wild || 0) + buWild
  s.pendingKong = null
  s.waiting = []
  s.claims = {}
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
    if (!s.waiting.includes(a.seat) || s.claims[a.seat] != null) {
      return { error: ERR.NOT_ACTIVE }
    }
    if (s.pendingKong) {
      if (!canHuOn(s, a.seat, s.pendingKong.tile)) return { error: ERR.ILLEGAL }
      s.claims[a.seat] = 'hu'
      return {
        after: push => {
          if (s.waiting.every(seat => s.claims[seat] != null)) {
            resolveRespond(s, push)
          }
        }
      }
    }
    if (s.pendingDiscard) {
      if (!canHuOn(s, a.seat, s.pendingDiscard.tile)) return { error: ERR.ILLEGAL }
      s.claims[a.seat] = 'hu'
      return {
        after: push => {
          if (s.waiting.every(seat => s.claims[seat] != null)) {
            resolveRespond(s, push)
          }
        }
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
  if (!s.waiting.includes(a.seat) || s.claims[a.seat] != null) {
    return { error: ERR.NOT_ACTIVE }
  }
  s.claims[a.seat] = 'pass'
  return {
    after: push => {
      push('pass', null, a.seat)
      // 必须等所有 waiting 玩家表态，不能因第一个玩家点“过”就提前
      // 落牌，剥夺其他玩家的胡/碰/杠权。
      if (s.waiting.every(seat => s.claims[seat] != null)) {
        resolveRespond(s, push)
      }
    }
  }
}

// ---------- 响应窗口裁决 ----------

/** 全部表态后统一处理：胡（可多响）> 碰 > 明杠 > 全过 */
function resolveRespond(s, push) {
  // 抢杠窗口
  if (s.pendingKong) {
    const robbed = s.pendingKong.seat
    const tile = s.pendingKong.tile
    const tag = s.pendingKong.tag
    // 补杠用的是幺鸡（buWild=1）还是真牌：被抢时决定副露里是否留下幺鸡补位
    const buWild = s.pendingKong.buWild || 0
    const hus = s.waiting.filter(seat => s.claims[seat] === 'hu')
    s.pendingKong = null
    s.waiting = []
    s.claims = {}
    if (hus.length > 0) {
      // 抢杠胡：杠不成立，相当于被抢那家点炮——抢杠者取走一张「真牌」凑胡，
      // 副露退回碰；补杠若用的是幺鸡，这张幺鸡留在副露里顶替被取走的真牌
      // （碰带幺鸡不可换回，要再杠只能等摸到对应真牌）。被抢者付分后继续摸牌。
      if (buWild > 0) {
        const meld = s.players[robbed].melds.find(
          m => m.kind === 'peng' && m.tile === tile
        )
        if (meld) meld.wild = (meld.wild || 0) + buWild
      }
      // 物理牌：被抢的那张落进被抢者弃牌区——相当于他点炮打了这张牌。
      // 多响只用这一张物理牌表示（与点炮多响一致，展示走 hu.winTile）。
      s.players[robbed].discards.push(tile)
      for (const seat of hus) {
        huSettle(s, seat, 'qianggang', tile, robbed, push, tag)
      }
      if (s.phase !== PHASE_FINISHED) {
        drawFor(s, robbed, push)
      }
      return
    }
    // 无人抢：补杠成立
    const meld = s.players[robbed].melds.find(
      m => m.kind === 'peng' && m.tile === tile
    )
    if (meld) {
      finishBuGang(s, robbed, tile, meld, push, buWild)
    } else {
      drawFor(s, robbed, push)
    }
    return
  }

  // 出牌响应窗口
  if (!s.pendingDiscard) return
  const payer = s.pendingDiscard.seat
  const tile = s.pendingDiscard.tile
  const tag = s.pendingDiscard.tag
  // 杠上炮：这张牌是杠后补牌回合打出的（多响时 pendingDiscard 会被清空，
  // 需先取出标记再逐家结算）
  const afterGang = s.pendingDiscard.isAfterGang === true
  const hus = s.waiting.filter(seat => s.claims[seat] === 'hu')
  if (hus.length > 0) {
    // 一炮多响：每位胡者各自结算，点炮者各付一份
    // （pendingDiscard 的落牌在 huSettle 内处理，多响只落一次）
    s.waiting = []
    s.claims = {}
    for (const seat of hus) {
      huSettle(s, seat, 'dianpao', tile, payer, push, tag, afterGang)
    }
    s.pendingDiscard = null
    if (s.phase !== PHASE_FINISHED) {
      // 血战继续：由胡牌人的下家摸牌（胡牌人已离场，nextActive 自动跳过）。
      // 同一张牌多家胡时，取环序上距点炮者最近的胡者为准，保证轮转沿出牌
      // 方向向前推进，不会退回点炮者自己再摸一张。
      let ref = hus[0]
      for (const seat of hus) {
        if ((seat - payer + 4) % 4 < (ref - payer + 4) % 4) ref = seat
      }
      drawFor(s, nextActive(s, ref), push)
    }
    return
  }
  const pengSeat = s.waiting.find(seat => s.claims[seat] === 'peng')
  if (pengSeat != null) {
    // 碰：不摸牌直接进入碰者出牌（强制出牌回合：只许打一张，不能胡/杠）
    const p = s.players[pengSeat]
    const wild = pengWildCount(p.hand, tile, yaojiOn(s)) || 0
    removeTiles(p.hand, new Array(2 - wild).fill(tile).concat(new Array(wild).fill(YAOJI_TILE)))
    const meld = { kind: 'peng', tile, from: payer }
    if (wild > 0) meld.wild = wild
    p.melds.push(meld)
    s.pendingDiscard = null
    s.waiting = []
    s.claims = {}
    s.phase = PHASE_DISCARD
    s.turn = pengSeat
    s.drawnTile = null
    s.mustDiscard = true
    // 上一回合的杠分风险随出牌结束而解除（该回合已无杠上炮可能）
    s.gangTurn = null
    push('peng', { tile, from: payer, wild }, pengSeat)
    push('turn', { turn: pengSeat })
    return
  }
  const gangSeat = s.waiting.find(seat => s.claims[seat] === 'gang')
  if (gangSeat != null) {
    // 明杠：出牌者付分（幺鸡局带幺鸡 1 / 不带幺鸡 2），杠者墙尾摸牌继续
    const p = s.players[gangSeat]
    const wild = gangMingWildCount(p.hand, tile, yaojiOn(s)) || 0
    removeTiles(p.hand, new Array(3 - wild).fill(tile).concat(new Array(wild).fill(YAOJI_TILE)))
    const meld = { kind: 'gang', gangType: 'ming', tile, from: payer }
    if (wild > 0) meld.wild = wild
    p.melds.push(meld)
    s.pendingDiscard = null
    s.waiting = []
    s.claims = {}
    push('gang', { tile, gangType: 'ming', from: payer, wild }, gangSeat)
    payGangMing(s, gangSeat, payer, wild, push)
    drawFromTail(s, gangSeat, push)
    return
  }
  // 全部过：牌落弃牌区，下一位活跃玩家摸牌
  s.players[payer].discards.push(tile)
  s.pendingDiscard = null
  s.waiting = []
  s.claims = {}
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
  push('draw', { tile: s.drawnTile, wallCount: s.wall.length, tail: true }, seat)
  push('turn', { turn: seat })
}

/** 三人胡满直接结束 */
function finish(s, push) {
  s.phase = PHASE_FINISHED
  s.pendingDiscard = null
  s.pendingKong = null
  s.waiting = []
  s.claims = {}
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
  s.waiting = []
  s.claims = {}
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
  return {
    liuju: state.huOrder.length < state.rules.endWhenHuPlayers,
    huOrder: clone(state.huOrder),
    ledger: clone(state.ledger),
    perSeat: state.players.map(p => ({ seat: p.seat, delta: p.delta })),
    chaItems: clone(state.chaItems || []),
    refundItems: clone(state.refundItems || []),
    xiItems: clone(state.xiItems || [])
  }
}

/**
 * 玩家视角（受限信息）：严禁泄露他人手牌内容与墙序。
 * draw 事件的 tile 仅对摸牌者本人可见；他人手牌只给 handCount。
 */
export function playerView(state, seat) {
  const s = state
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
    void: p.void,
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
    fan: myFan
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
    waiting:
      s.phase === PHASE_RESPOND
        ? s.waiting.filter(seat2 => s.claims[seat2] == null)
        : [],
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
      return ev
    }),
    results: clone(s.results)
  }
}
