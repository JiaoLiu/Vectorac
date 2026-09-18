// ============================================================
// ⚠⚠⚠  仅用于 UI 开发 —— MOCK 适配层（假对局） ⚠⚠⚠
// ============================================================
// 本文件按 contract.js 的 adapter 接口实现一个“假对局”，供牌桌 UI
// （ui.js）在真实规则引擎（engine.js）与 AI（ai.js）完成前独立开发。
//
// 关键约定：
//  1. view() 返回的 PlayerView / legal(ActionOption) / lastEvents(GameEvent)
//     与 results(Settlement) 的字段形状与契约【完全一致】——这是主集成时
//     把 adapter.js 内部替换为真实引擎而 UI 零改动的关键。
//  2. 对局为脚本化简化演示：发牌 → 换三张 → 定缺 → 循环摸打；
//     AI 以约 600ms 间隔行动（aiLevel 影响节奏：简单 900ms / 普通 600ms / 困难 420ms）。
//     为保证 UI 各模块有内容可渲染，内置演示剧情：
//       - 定缺全部完成后，把人类手牌调整为“听牌型”（保证出现听牌提示、
//         自摸胡按钮与胡牌结算演示；第 4 次摸牌起未摸中进张则强制摸中）；
//       - 左家(3号) AI 永远保留缺门牌（演示“查花猪”条目）；
//       - 其余 AI 正常打缺，流局时大概率触发“查大叫”条目。
//  3. mock 内嵌一个“4 面子 + 1 对子”的简版胡牌检查器（仅演示判定，
//     不含七对/龙七对等特殊牌型；番型固定按“平胡(+自摸)”演示）。
//  4. 契约之外的扩展（真实引擎可选择是否提供同名能力，UI 均做了防御）：
//       - view().my.ting        : [tileId...] 当前可胡的牌（听牌提示）
//       - game.exportState()    : 导出可 JSON 序列化的对局状态（存档用）
//       - createLocalGame({ restoreState }) : 从存档恢复对局
//       - GameState.ledger      : 全程收支流水（结算时并入 Settlement.ledger）
//
// 主集成时：adapter.js 内部改为 re-export 真实引擎封装，本文件不再被引用。
// ============================================================

import {
  SUITS,
  tileId,
  tileSuit,
  tileName,
  allTileIds,
  DEFAULT_RULES,
  RULE_VERSION,
  PHASE_SWAP,
  PHASE_VOID,
  PHASE_DISCARD,
  PHASE_RESPOND,
  PHASE_FINISHED,
  ERR
} from './contract.js'

// ---------- 可复现伪随机（mulberry32）：相同 seed ⇒ 相同对局 ----------
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- 简版胡牌检查（仅演示用） ----------
// 检查三门花色计数能否组成 4 面子 + 1 对子
function suitSplits(cnt) {
  const out = []
  const rec = (i, sets, pairs) => {
    while (i < 9 && cnt[i] === 0) i++
    if (i >= 9) {
      out.push([sets, pairs])
      return
    }
    if (cnt[i] >= 3) {
      cnt[i] -= 3
      rec(i, sets + 1, pairs)
      cnt[i] += 3
    }
    if (i + 2 < 9 && cnt[i + 1] > 0 && cnt[i + 2] > 0) {
      cnt[i]--
      cnt[i + 1]--
      cnt[i + 2]--
      rec(i, sets + 1, pairs)
      cnt[i]++
      cnt[i + 1]++
      cnt[i + 2]++
    }
    if (cnt[i] >= 2) {
      cnt[i] -= 2
      rec(i, sets, pairs + 1)
      cnt[i] += 2
    }
  }
  rec(0, 0, 0)
  return out
}

function canHu(tiles) {
  const c = [new Array(9).fill(0), new Array(9).fill(0), new Array(9).fill(0)]
  tiles.forEach(t => c[Math.floor(t / 9)][t % 9]++)
  const s = c.map(suitSplits)
  for (const [a0, p0] of s[0]) {
    for (const [a1, p1] of s[1]) {
      for (const [a2, p2] of s[2]) {
        if (a0 + a1 + a2 === 4 && p0 + p1 + p2 === 1) return true
      }
    }
  }
  return false
}

// 13 张牌的听牌检查：返回所有“摸到即胡”的牌 id
function tingWaits(tiles13) {
  const waits = []
  for (let id = 0; id < 27; id++) {
    if (canHu(tiles13.concat([id]))) waits.push(id)
  }
  return waits
}

// ============================================================
// createLocalGame —— 契约 adapter 接口的 mock 实现
// ============================================================
export function createLocalGame(opts = {}) {
  const onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : null
  const aiLevel = opts.aiLevel || 'normal'
  // AI 出牌节奏（可取消的延时调度，dispose 时统一清理）
  const aiDelay = aiLevel === 'easy' ? 900 : aiLevel === 'hard' ? 420 : 600

  let disposed = false
  let timers = []
  let rng = mulberry32((((opts.seed != null ? opts.seed : Date.now() % 1e9) >>> 0) ^ 0x5bf03635) >>> 0)
  let state = null
  let seq = 0 // GameEvent.seq
  let actionSeq = 0 // actionId / 响应表态 id 计数
  let huOrderList = [] // 胡牌顺序（结算用）
  const executedIds = new Set() // actionId 去重
  const respondActs = new Map() // seat -> 已表态动作（responded 里只存 actionId）
  const plot = { humanDraws: 0, pengSeen: 0 } // 演示剧情计数

  // ---------- 定时器 ----------
  function later(fn, ms) {
    const t = setTimeout(() => {
      timers = timers.filter(x => x !== t)
      if (!disposed) fn()
    }, ms)
    timers.push(t)
  }
  function clearTimers() {
    timers.forEach(clearTimeout)
    timers = []
  }

  // ---------- 事件 ----------
  function emit(type, seat, data) {
    const ev = { seq: ++seq, type }
    if (seat !== null && seat !== undefined) ev.seat = seat
    if (data) ev.data = data
    state.events.push(ev)
    if (onEvent) {
      try {
        onEvent(ev)
      } catch (e) {
        /* UI 回调异常不阻塞牌局 */
      }
    }
  }
  function touch() {
    state.version++
  }

  // ---------- 初始化（发牌为瞬时阶段，构造完成即进入换三张） ----------
  function initState(sd) {
    const wall = allTileIds()
    for (let i = wall.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const t = wall[i]
      wall[i] = wall[j]
      wall[j] = t
    }
    const players = [0, 1, 2, 3].map(seat => ({
      seat,
      hand: [],
      melds: [],
      discards: [],
      void: null,
      hu: null,
      delta: 0,
      swapPicked: null
    }))
    for (let r = 0; r < 13; r++) for (const p of players) p.hand.push(wall.shift())
    players.forEach(p => p.hand.sort((a, b) => a - b))
    state = {
      version: 1,
      ruleVersion: RULE_VERSION,
      rules: { ...DEFAULT_RULES },
      seed: sd,
      phase: PHASE_SWAP,
      dealer: sd % 4,
      turn: sd % 4,
      drawnTile: null,
      wall,
      players,
      pendingDiscard: null,
      pendingKong: null, // mock 不实现补杠抢胡窗口，恒为 null
      responded: {},
      results: null,
      events: [],
      actionLog: [],
      ledger: [] // 【mock 扩展】全程收支流水，结算时并入 Settlement.ledger
    }
    huOrderList = []
    emit('game-start')
    emit('deal')
  }

  // ---------- 换三张 / 定缺 ----------
  function boot() {
    ;[1, 2, 3].forEach((s, i) => later(() => aiPickSwap(s), 500 + i * 240))
  }

  function aiPickSwap(s) {
    if (state.phase !== PHASE_SWAP) return
    const p = state.players[s]
    if (p.swapPicked) return
    const bySuit = {}
    p.hand.forEach(t => {
      const su = tileSuit(t)
      ;(bySuit[su] = bySuit[su] || []).push(t)
    })
    let pick = null
    for (const su of SUITS) {
      if (bySuit[su] && bySuit[su].length >= 3 && (!pick || bySuit[su].length < bySuit[pick.suit].length)) {
        pick = { suit: su, tiles: bySuit[su].slice(0, 3) }
      }
    }
    if (!pick) {
      const su = SUITS.find(x => bySuit[x] && bySuit[x].length >= 3) || SUITS[0]
      pick = { suit: su, tiles: (bySuit[su] || p.hand.slice(0, 3)).slice(0, 3) }
    }
    p.swapPicked = pick.tiles
    emit('swap-select', s, {})
    touch()
    maybeApplySwap()
  }

  function maybeApplySwap() {
    if (state.players.some(p => !p.swapPicked)) return
    // 交换方向由 seed 派生：0 传下家 / 1 传上家 / 2 传对家
    const dir = state.seed % 3
    const gives = state.players.map(p => p.swapPicked)
    state.players.forEach((p, i) => {
      const removeList = gives[i].slice()
      p.hand = p.hand.filter(t => {
        const k = removeList.indexOf(t)
        if (k >= 0) {
          removeList.splice(k, 1)
          return false
        }
        return true
      })
    })
    state.players.forEach((p, i) => {
      const src = dir === 0 ? (i + 3) % 4 : dir === 1 ? (i + 1) % 4 : (i + 2) % 4
      p.hand = p.hand.concat(gives[src]).sort((a, b) => a - b)
      p.swapPicked = null
    })
    emit('swap-apply')
    touch()
    state.phase = PHASE_VOID
    ;[1, 2, 3].forEach((s, i) => later(() => aiPickVoid(s), 450 + i * 240))
  }

  function aiPickVoid(s) {
    if (state.phase !== PHASE_VOID) return
    const p = state.players[s]
    if (p.void) return
    const cnt = { wan: 0, tong: 0, tiao: 0 }
    p.hand.forEach(t => cnt[tileSuit(t)]++)
    p.void = SUITS.reduce((a, b) => (cnt[a] <= cnt[b] ? a : b))
    emit('void-set', s, { suit: p.void })
    touch()
    maybeStartDiscard()
  }

  // 演示剧情：定缺全部完成后，把人类手牌替换为“听牌型”
  // （两门花色：AAA 234 567 + 234 5，摸到缺的那张即胡），
  // 保证听牌提示 / 自摸胡 / 胡牌结算演示必然出现。
  // 注：mock 不严格保证牌池守恒（原手牌塞回墙尾做近似补偿）。
  function arrangeHumanHand() {
    const me = state.players[0]
    const v = me.void || 'tiao'
    const rest = SUITS.filter(s => s !== v)
    const A = rest[0]
    const B = rest[1]
    const hand = [
      tileId(A, 1), tileId(A, 1), tileId(A, 1),
      tileId(A, 2), tileId(A, 3), tileId(A, 4),
      tileId(A, 5), tileId(A, 6), tileId(A, 7),
      tileId(B, 2), tileId(B, 3), tileId(B, 4),
      tileId(B, 5)
    ].sort((a, b) => a - b)
    state.wall.push(...me.hand)
    me.hand = hand
  }

  function maybeStartDiscard() {
    if (state.players.some(p => !p.void)) return
    state.phase = PHASE_DISCARD
    arrangeHumanHand()
    startTurn(state.dealer)
  }

  // ---------- 回合推进 ----------
  function nextTurn(fromSeat) {
    let s = fromSeat
    for (let i = 0; i < 4; i++) {
      s = (s + 1) % 4
      if (!state.players[s].hu) return s
    }
    return -1
  }

  function startTurn(seat) {
    if (!state || state.phase === PHASE_FINISHED) return
    let s = seat
    if (s < 0 || state.players[s].hu) s = nextTurn(s < 0 ? 0 : s)
    if (s < 0 || state.players[s].hu) {
      finishSettle(false)
      return
    }
    state.turn = s
    state.drawnTile = null
    state.responded = {}
    respondActs.clear()
    state.phase = PHASE_DISCARD
    state.pendingDiscard = null
    emit('turn', s)
    if (state.wall.length === 0) {
      finishLiuju()
      return
    }
    const tile = state.wall.shift()
    state.drawnTile = tile
    if (s !== 0) {
      // AI 的摸牌直接并入手牌（handCount 由此自然 +1）
      state.players[s].hand.push(tile)
      emit('draw', s, {})
    } else {
      plot.humanDraws++
      // 演示保底：第 4 次起摸牌，若手牌听牌但没摸中，强制摸到进张
      const full = state.players[0].hand.concat([tile])
      if (plot.humanDraws >= 4 && !canHu(full)) {
        const waits = state.players[0].melds.length ? [] : tingWaits(state.players[0].hand)
        if (waits.length) {
          state.wall.unshift(tile) // 原牌塞回墙头做近似补偿
          state.drawnTile = waits[0]
        }
      }
      emit('draw', 0, { tile: state.drawnTile })
    }
    touch()
    if (s !== 0) later(() => aiPlay(s), aiDelay)
  }

  // 从手牌移除 n 张指定牌（人类的新摸牌单列在 drawnTile，优先消耗）
  function takeFromHand(seat, tile, n) {
    const p = state.players[seat]
    for (let i = 0; i < n; i++) {
      if (seat === 0 && state.drawnTile === tile) {
        state.drawnTile = null
        continue
      }
      const idx = p.hand.indexOf(tile)
      if (idx >= 0) p.hand.splice(idx, 1)
    }
    p.hand.sort((a, b) => a - b)
  }

  // ---------- AI 决策（mock 简化策略） ----------
  function pickDiscardAI(seat) {
    const p = state.players[seat]
    const hand = p.hand
    // 1) 缺门优先（3 号 AI 故意保留最后缺门牌 → 演示查花猪）
    const voidTiles = p.void ? hand.filter(t => tileSuit(t) === p.void) : []
    if (voidTiles.length && (seat !== 3 || voidTiles.length > 1)) return voidTiles[0]
    // 2) 非缺门中随机打一张（mock 不做真实策略）
    const others = hand.filter(t => !p.void || tileSuit(t) !== p.void)
    if (others.length) return others[Math.floor(rng() * others.length)]
    return voidTiles[0] != null ? voidTiles[0] : hand[0]
  }

  function aiPlay(seat) {
    if (state.phase !== PHASE_DISCARD || state.turn !== seat) return
    if (state.players[seat].hu) return
    const p = state.players[seat]
    // 自摸胡检查（简版真实判定）
    if (canHu(p.hand)) {
      doHu(seat, 'zimo')
      return
    }
    // 暗杠：手里 4 张相同（低频自然事件）
    const cnt = {}
    p.hand.forEach(t => (cnt[t] = (cnt[t] || 0) + 1))
    for (const k of Object.keys(cnt)) {
      if (cnt[k] === 4 && rng() < 0.5) {
        doGang(seat, Number(k), 'an')
        return
      }
    }
    doDiscard(seat, pickDiscardAI(seat))
  }

  function aiRespond(s) {
    if (state.phase !== PHASE_RESPOND || !state.pendingDiscard) return
    if (state.players[s].hu || s in state.responded) return
    const pd = state.pendingDiscard
    const p = state.players[s]
    const t = pd.tile
    const n = p.hand.filter(x => x === t).length
    // 未打缺不能碰/杠（voidRequired 规则）
    const voidLeft = p.void ? p.hand.some(x => tileSuit(x) === p.void) : false
    let act = null
    if (canHu(p.hand.concat([t]))) {
      act = { type: 'hu' }
    } else if (!voidLeft) {
      if (n >= 3 && rng() < 0.7) act = { type: 'gang', tile: t, gangType: 'ming' }
      else if (n === 2 && (plot.pengSeen < 2 || rng() < 0.45)) act = { type: 'peng' }
    }
    state.responded[s] = 'r' + (++actionSeq)
    respondActs.set(s, act || { type: 'pass' })
    if (act && act.type === 'peng') plot.pengSeen++
    if (!act) emit('pass', s, {}) // 真正的碰/杠/胡事件在汇总执行时才发
    touch()
    checkRespondDone()
  }

  // ---------- 出牌 / 响应 ----------
  function doDiscard(seat, tile) {
    const p = state.players[seat]
    takeFromHand(seat, tile, 1)
    p.discards.push(tile)
    state.drawnTile = null
    state.pendingDiscard = { seat, tile }
    state.phase = PHASE_RESPOND
    state.responded = {}
    respondActs.clear()
    emit('discard', seat, { tile })
    touch()
    let i = 0
    for (const s of [1, 2, 3]) {
      if (s !== seat && !state.players[s].hu) later(() => aiRespond(s), 320 + (i++) * 260)
    }
    later(() => checkRespondDone(), 700) // 人类无可选项时的兜底推进
  }

  // 响应窗口人类的可选动作（legal 计算复用）
  function humanRespondLegal() {
    const pd = state.pendingDiscard
    if (!pd || state.phase !== PHASE_RESPOND) return []
    const me = state.players[0]
    if (me.hu || 0 in state.responded || pd.seat === 0) return []
    const opts = []
    const n = me.hand.filter(t => t === pd.tile).length
    if (n >= 2) opts.push({ type: 'peng', tile: pd.tile })
    if (n >= 3) opts.push({ type: 'gang', options: [{ tile: pd.tile, gangType: 'ming' }] })
    if (canHu(me.hand.concat([pd.tile]))) opts.push({ type: 'hu', how: 'dianpao' })
    if (opts.length) opts.push({ type: 'pass' })
    return opts
  }

  function checkRespondDone() {
    if (state.phase !== PHASE_RESPOND || !state.pendingDiscard) return
    const pd = state.pendingDiscard
    const candidates = [0, 1, 2, 3].filter(s => s !== pd.seat && !state.players[s].hu)
    // 人类：有选项且未表态 → 继续等待
    const humanPending = candidates.includes(0) && !(0 in state.responded) && humanRespondLegal().length > 0
    const aiPending = candidates.filter(s => s !== 0 && !(s in state.responded))
    if (humanPending || aiPending.length) return
    // 汇总：胡 > 杠 > 碰
    const prio = { hu: 3, gang: 2, peng: 1 }
    const acts = []
    respondActs.forEach((act, seat) => {
      if (act.type !== 'pass') acts.push({ seat, ...act })
    })
    acts.sort((a, b) => (prio[b.type] || 0) - (prio[a.type] || 0))
    state.responded = {}
    respondActs.clear()
    if (acts.length) {
      const w = acts[0]
      if (w.type === 'peng') doPeng(w.seat)
      else if (w.type === 'gang') doGang(w.seat, w.tile, w.gangType)
      else if (w.type === 'hu') doHu(w.seat, 'dianpao')
    } else {
      startTurn(nextTurn(pd.seat))
    }
  }

  function doPeng(seat) {
    const p = state.players[seat]
    const t = state.pendingDiscard.tile
    const from = state.pendingDiscard.seat
    takeFromHand(seat, t, 2)
    p.melds.push({ kind: 'peng', tile: t, from })
    state.pendingDiscard = null
    state.responded = {}
    respondActs.clear()
    state.turn = seat
    state.phase = PHASE_DISCARD
    state.drawnTile = null
    emit('peng', seat, { tile: t })
    emit('turn', seat)
    touch()
    if (seat !== 0) later(() => aiPlay(seat), aiDelay)
  }

  function doGang(seat, tile, gangType) {
    const p = state.players[seat]
    let from = null
    if (gangType === 'ming') {
      from = state.pendingDiscard.seat
      takeFromHand(seat, tile, 3)
      state.pendingDiscard = null
    } else if (gangType === 'an') {
      takeFromHand(seat, tile, 4)
    } else {
      // 补杠：升级已有的碰（mock 不做抢杠窗口）
      takeFromHand(seat, tile, 1)
      const m = p.melds.find(x => x.kind === 'peng' && x.tile === tile)
      if (m) {
        m.kind = 'gang'
        m.gangType = 'bu'
      }
    }
    if (gangType !== 'bu') p.melds.push({ kind: 'gang', gangType, tile, from })
    // 杠分即时结算（刮风：放杠者付；下雨：每位活跃未胡玩家付）
    if (gangType === 'ming') {
      const q = state.players[from]
      q.delta -= DEFAULT_RULES.gangMing
      p.delta += DEFAULT_RULES.gangMing
      state.ledger.push({ from, to: seat, amount: DEFAULT_RULES.gangMing, reason: 'gang-ming' })
    } else {
      for (const q of state.players) {
        if (q.seat !== seat && !q.hu) {
          q.delta -= DEFAULT_RULES.gangAn
          p.delta += DEFAULT_RULES.gangAn
          state.ledger.push({ from: q.seat, to: seat, amount: DEFAULT_RULES.gangAn, reason: 'gang-an' })
        }
      }
    }
    state.responded = {}
    respondActs.clear()
    state.turn = seat
    state.phase = PHASE_DISCARD
    emit('gang', seat, { tile, gangType })
    touch()
    // 杠后从墙尾摸牌（契约：普通摸牌 shift，杠后摸牌 pop）
    if (state.wall.length) {
      const t = state.wall.pop()
      state.drawnTile = t
      if (seat !== 0) p.hand.push(t)
      emit('draw', seat, seat === 0 ? { tile: t } : {})
      touch()
    }
    if (seat !== 0) later(() => aiPlay(seat), aiDelay)
  }

  function doHu(seat, how) {
    const p = state.players[seat]
    let winTile
    let from = null
    if (how === 'zimo') {
      winTile = state.drawnTile
      state.drawnTile = null
    } else {
      winTile = state.pendingDiscard.tile
      from = state.pendingDiscard.seat
    }
    // mock 番型：平胡 1 番，自摸额外加番
    const names = ['平胡']
    let fan = 1
    if (how === 'zimo') {
      names.push('自摸')
      fan += DEFAULT_RULES.zimoFan
    }
    const amount = DEFAULT_RULES.baseScore * Math.pow(2, fan)
    let total = 0
    if (how === 'zimo') {
      for (const q of state.players) {
        if (q.seat !== seat && !q.hu) {
          q.delta -= amount
          p.delta += amount
          total += amount
          state.ledger.push({ from: q.seat, to: seat, amount, reason: 'zimo' })
        }
      }
    } else {
      const q = state.players[from]
      q.delta -= amount
      p.delta += amount
      total = amount
      state.ledger.push({ from, to: seat, amount, reason: how === 'qianggang' ? 'qianggang' : 'dianpao' })
    }
    const huInfo = { how, winTile, fan, names, huOrder: huOrderList.length + 1, scoreDelta: total }
    p.hu = huInfo
    const entry = { seat, how, winTile, fan, names, scoreDelta: total }
    if (from !== null) entry.from = from
    huOrderList.push(entry)
    state.pendingDiscard = null
    state.responded = {}
    respondActs.clear()
    emit('hu', seat, { how, winTile, fan })
    touch()
    const huCount = state.players.filter(q => q.hu).length
    if (huCount >= DEFAULT_RULES.endWhenHuPlayers) {
      finishSettle(false)
      return
    }
    startTurn(nextTurn(from !== null ? from : seat))
  }

  // ---------- 结算 ----------
  function finishLiuju() {
    state.phase = PHASE_FINISHED
    state.drawnTile = null
    emit('liuju')
    finishSettle(true)
  }

  function finishSettle(liuju) {
    const chaItems = []
    if (liuju) {
      const capAmount = DEFAULT_RULES.baseScore * Math.pow(2, DEFAULT_RULES.capFan)
      // 查花猪：未胡且缺门未打完 → 赔封顶给每位未胡玩家
      const huazhu = state.players.filter(
        p => !p.hu && p.void && p.hand.some(t => tileSuit(t) === p.void)
      )
      huazhu.forEach(p => {
        let total = 0
        state.players.forEach(q => {
          if (q.seat !== p.seat && !q.hu) {
            p.delta -= capAmount
            q.delta += capAmount
            total += capAmount
            state.ledger.push({ from: p.seat, to: q.seat, amount: capAmount, reason: 'cha-huazhu' })
          }
        })
        chaItems.push({ type: 'huazhu', seat: p.seat, amount: total })
      })
      // 查大叫：已打缺但未听牌的未胡玩家 → 赔封顶给每位已胡玩家
      state.players.forEach(p => {
        if (p.hu || huazhu.includes(p)) return
        const ting = p.melds.length ? [] : tingWaits(p.hand) // 副露后 mock 简化视为未听
        if (ting.length) return
        let total = 0
        state.players.forEach(q => {
          if (q.hu) {
            p.delta -= capAmount
            q.delta += capAmount
            total += capAmount
            state.ledger.push({ from: p.seat, to: q.seat, amount: capAmount, reason: 'cha-dajiao' })
          }
        })
        chaItems.push({ type: 'dajiao', seat: p.seat, amount: total })
      })
    }
    state.results = {
      liuju,
      huOrder: huOrderList.map(h => ({ ...h })),
      ledger: state.ledger.map(l => ({ ...l })),
      perSeat: state.players.map(p => ({ seat: p.seat, delta: p.delta })),
      chaItems
    }
    state.phase = PHASE_FINISHED
    state.drawnTile = null
    emit('settle')
  }

  // ---------- 人类动作校验 ----------
  function validateHuman(a) {
    const me = state.players[0]
    if (me.hu && a.type !== 'pass') return ERR.ILLEGAL
    switch (a.type) {
      case 'swap': {
        if (state.phase !== PHASE_SWAP || me.swapPicked) return ERR.WRONG_PHASE
        if (!Array.isArray(a.tiles) || a.tiles.length !== 3) return ERR.ILLEGAL
        const suits = a.tiles.map(tileSuit)
        if (suits.some(s => s !== suits[0])) return ERR.ILLEGAL
        const pool = me.hand.slice()
        for (const t of a.tiles) {
          const i = pool.indexOf(t)
          if (i < 0) return ERR.ILLEGAL
          pool.splice(i, 1)
        }
        return null
      }
      case 'void': {
        if (state.phase !== PHASE_VOID || me.void) return ERR.WRONG_PHASE
        if (!SUITS.includes(a.suit)) return ERR.ILLEGAL
        return null
      }
      case 'discard': {
        if (state.phase !== PHASE_DISCARD || state.turn !== 0) return ERR.WRONG_PHASE
        const full = me.hand.concat(state.drawnTile != null ? [state.drawnTile] : [])
        if (!full.includes(a.tile)) return ERR.ILLEGAL
        if (me.void && full.some(t => tileSuit(t) === me.void) && tileSuit(a.tile) !== me.void) {
          return ERR.ILLEGAL
        }
        return null
      }
      case 'gang': {
        if (state.phase === PHASE_DISCARD && state.turn === 0) {
          const full = me.hand.concat(state.drawnTile != null ? [state.drawnTile] : [])
          const n = full.filter(t => t === a.tile).length
          if (a.gangType === 'an') return n === 4 ? null : ERR.ILLEGAL
          if (a.gangType === 'bu') {
            const penged = me.melds.some(m => m.kind === 'peng' && m.tile === a.tile)
            return penged && n >= 1 ? null : ERR.ILLEGAL
          }
          return ERR.ILLEGAL
        }
        if (state.phase === PHASE_RESPOND && state.pendingDiscard) {
          if (0 in state.responded) return ERR.DUPLICATE
          if (state.pendingDiscard.tile !== a.tile) return ERR.ILLEGAL
          const n = me.hand.filter(t => t === a.tile).length
          return n >= 3 ? null : ERR.ILLEGAL // 明杠
        }
        return ERR.WRONG_PHASE
      }
      case 'hu': {
        if (state.phase === PHASE_DISCARD && state.turn === 0 && state.drawnTile != null) {
          return canHu(me.hand.concat([state.drawnTile])) ? null : ERR.ILLEGAL
        }
        if (state.phase === PHASE_RESPOND && state.pendingDiscard) {
          if (0 in state.responded) return ERR.DUPLICATE
          return canHu(me.hand.concat([state.pendingDiscard.tile])) ? null : ERR.ILLEGAL
        }
        return ERR.WRONG_PHASE
      }
      case 'peng': {
        if (state.phase !== PHASE_RESPOND || !state.pendingDiscard) return ERR.WRONG_PHASE
        if (0 in state.responded) return ERR.DUPLICATE
        const n = me.hand.filter(t => t === state.pendingDiscard.tile).length
        return n >= 2 ? null : ERR.ILLEGAL
      }
      case 'pass': {
        if (state.phase !== PHASE_RESPOND || !state.pendingDiscard) return ERR.WRONG_PHASE
        if (0 in state.responded) return ERR.DUPLICATE
        return null
      }
      default:
        return ERR.ILLEGAL
    }
  }

  // ---------- 人类动作执行 ----------
  function executeHuman(a) {
    const me = state.players[0]
    switch (a.type) {
      case 'swap':
        me.swapPicked = a.tiles.slice()
        emit('swap-select', 0, {})
        maybeApplySwap()
        break
      case 'void':
        me.void = a.suit
        emit('void-set', 0, { suit: a.suit })
        maybeStartDiscard()
        break
      case 'discard':
        doDiscard(0, a.tile)
        break
      case 'gang':
        if (state.phase === PHASE_RESPOND) {
          state.responded[0] = a.actionId
          respondActs.set(0, { type: 'gang', tile: state.pendingDiscard.tile, gangType: 'ming' })
          checkRespondDone()
        } else {
          doGang(0, a.tile, a.gangType)
        }
        break
      case 'peng':
        state.responded[0] = a.actionId
        respondActs.set(0, { type: 'peng', tile: state.pendingDiscard.tile })
        checkRespondDone()
        break
      case 'hu':
        if (state.phase === PHASE_RESPOND) {
          state.responded[0] = a.actionId
          respondActs.set(0, { type: 'hu' })
          checkRespondDone()
        } else {
          doHu(0, 'zimo')
        }
        break
      case 'pass':
        state.responded[0] = a.actionId
        respondActs.set(0, { type: 'pass' })
        emit('pass', 0, {})
        checkRespondDone()
        break
    }
  }

  // ---------- PlayerView ----------
  // 【mock 扩展】听牌提示：已打缺且未胡时，计算当前可胡的牌
  function computeTing() {
    const me = state.players[0]
    if (!me.void || me.hu) return []
    const full = me.hand.concat(
      state.turn === 0 && state.phase === PHASE_DISCARD && state.drawnTile != null ? [state.drawnTile] : []
    )
    if (full.some(t => tileSuit(t) === me.void)) return [] // 缺门未打完不显示
    if (me.melds.length || full.length < 13) return [] // 副露后手数变化，mock 简化不计算
    const waits = new Set()
    if (full.length === 14) {
      for (let i = 0; i < full.length; i++) {
        const rest = full.slice(0, i).concat(full.slice(i + 1))
        tingWaits(rest).forEach(w => waits.add(w))
      }
    } else {
      tingWaits(full).forEach(w => waits.add(w))
    }
    return Array.from(waits).sort((a, b) => a - b)
  }

  function computeLegal() {
    const me = state.players[0]
    if (me.hu) return []
    if (state.phase === PHASE_SWAP) return me.swapPicked ? [] : [{ type: 'swap' }]
    if (state.phase === PHASE_VOID) return me.void ? [] : [{ type: 'void', suits: SUITS.slice() }]
    if (state.phase === PHASE_DISCARD && state.turn === 0) {
      const full = me.hand.concat(state.drawnTile != null ? [state.drawnTile] : [])
      const voidLeft = me.void ? full.some(t => tileSuit(t) === me.void) : false
      const pool = voidLeft ? full.filter(t => tileSuit(t) === me.void) : full
      const discardOpt = { type: 'discard', tiles: Array.from(new Set(pool)).sort((a, b) => a - b) }
      if (voidLeft) return [discardOpt] // 未打缺：不能碰杠胡
      const opts = [discardOpt]
      const cnt = {}
      full.forEach(t => (cnt[t] = (cnt[t] || 0) + 1))
      const gOpts = []
      for (const k of Object.keys(cnt)) {
        if (cnt[k] === 4) gOpts.push({ tile: Number(k), gangType: 'an' })
      }
      me.melds.forEach(m => {
        if (m.kind === 'peng' && cnt[m.tile] >= 1) gOpts.push({ tile: m.tile, gangType: 'bu' })
      })
      if (gOpts.length) opts.push({ type: 'gang', options: gOpts })
      if (state.drawnTile != null && canHu(full)) opts.push({ type: 'hu', how: 'zimo' })
      return opts
    }
    if (state.phase === PHASE_RESPOND) return humanRespondLegal()
    return []
  }

  function view() {
    if (!state) return null
    const me = state.players[0]
    return {
      version: state.version,
      ruleVersion: state.ruleVersion,
      phase: state.phase,
      turn: state.turn,
      dealer: state.dealer,
      wallCount: state.wall.length,
      pendingDiscard: state.pendingDiscard ? { ...state.pendingDiscard } : null,
      pendingKong: null,
      players: state.players.map(p => ({
        seat: p.seat,
        handCount: p.hand.length + (p.seat === 0 && state.turn === 0 && state.phase === PHASE_DISCARD && state.drawnTile != null ? 1 : 0),
        melds: p.melds.map(m => ({ ...m })),
        discards: p.discards.slice(),
        void: p.void,
        hu: p.hu ? { ...p.hu } : null,
        delta: p.delta
      })),
      my: {
        hand: me.hand.slice(),
        drawnTile: state.turn === 0 && state.phase === PHASE_DISCARD ? state.drawnTile : null,
        melds: me.melds.map(m => ({ ...m })),
        discards: me.discards.slice(),
        void: me.void,
        hu: me.hu ? { ...me.hu } : null,
        delta: me.delta,
        ting: computeTing() // 【mock 扩展字段】真实引擎可选择提供
      },
      legal: computeLegal(),
      waiting:
        state.phase === PHASE_RESPOND && state.pendingDiscard
          ? [0, 1, 2, 3].filter(s => {
              if (s === state.pendingDiscard.seat || state.players[s].hu) return false
              if (s in state.responded) return false
              if (s === 0) return humanRespondLegal().length > 0
              return true
            })
          : [],
      lastEvents: state.events.slice(-20),
      results: state.results ? JSON.parse(JSON.stringify(state.results)) : null
    }
  }

  // ---------- 对外接口 ----------
  function dispatch(action) {
    if (disposed || !state) return { ok: false, error: ERR.NOT_ACTIVE }
    const a = Object.assign({}, action)
    if (a.seat === undefined) a.seat = 0
    if (a.seat !== 0) return { ok: false, error: ERR.NOT_ACTIVE }
    if (!a.actionId) a.actionId = 'u' + (++actionSeq) // actionId 由 adapter 生成
    if (executedIds.has(a.actionId)) return { ok: false, error: ERR.DUPLICATE }
    if (a.stateVersion != null && a.stateVersion !== state.version) {
      return { ok: false, error: ERR.STALE }
    }
    const err = validateHuman(a)
    if (err) return { ok: false, error: err }
    executedIds.add(a.actionId)
    const log = { actionId: a.actionId, seat: 0, type: a.type }
    ;['tiles', 'suit', 'tile', 'gangType', 'how'].forEach(k => {
      if (a[k] !== undefined) log[k] = a[k]
    })
    state.actionLog.push(log)
    executeHuman(a)
    touch()
    return { ok: true }
  }

  // 策略建议（mock 假建议，注明仅供参考；只建议不代打）
  function suggest() {
    if (disposed || !state || state.phase === PHASE_FINISHED) return null
    const v = view()
    const opt = v.legal.find(o => o.type === 'discard')
    if (!opt || !opt.tiles.length) return null
    // mock 启发式：缺门 > 边张 > 任意（非真实策略）
    const me = state.players[0]
    let pick = opt.tiles[0]
    if (me.void) {
      const vt = opt.tiles.find(t => tileSuit(t) === me.void)
      if (vt !== undefined) pick = vt
    } else {
      const edge = opt.tiles.find(t => t % 9 === 0 || t % 9 === 8)
      if (edge !== undefined) pick = edge
    }
    return {
      text: `建议打「${tileName(pick)}」：保持当前向听数，有效进张更多（演示建议，仅供参考）`,
      action: { type: 'discard', seat: 0, tile: pick }
    }
  }

  function finished() {
    return !!state && state.phase === PHASE_FINISHED
  }

  function restart(restartOpts = {}) {
    clearTimers()
    disposed = false
    executedIds.clear()
    respondActs.clear()
    plot.humanDraws = 0
    plot.pengSeen = 0
    actionSeq = 0
    const seed = ((Date.now() % 1e9) ^ (restartOpts.seed != null ? restartOpts.seed : 0)) >>> 0
    rng = mulberry32((seed ^ 0x5bf03635) >>> 0)
    initState(seed)
    boot()
  }

  function dispose() {
    disposed = true
    clearTimers()
  }

  // 【mock 扩展】导出可存档状态（纯 JSON）
  function exportState() {
    return JSON.parse(JSON.stringify(state))
  }

  // 【mock 扩展】从存档恢复并重新挂 AI 调度
  function resume() {
    const ph = state.phase
    if (ph === PHASE_SWAP) {
      boot()
    } else if (ph === PHASE_VOID) {
      ;[1, 2, 3].forEach((s, i) => later(() => aiPickVoid(s), 400 + i * 240))
    } else if (ph === PHASE_DISCARD && state.turn !== 0 && !state.players[state.turn].hu) {
      later(() => aiPlay(state.turn), aiDelay)
    } else if (ph === PHASE_RESPOND && state.pendingDiscard) {
      let i = 0
      for (const s of [1, 2, 3]) {
        if (s !== state.pendingDiscard.seat && !state.players[s].hu && !(s in state.responded)) {
          later(() => aiRespond(s), 320 + (i++) * 260)
        }
      }
      later(() => checkRespondDone(), 700)
    }
  }

  // ---------- 启动 ----------
  if (opts.restoreState && opts.restoreState.players && opts.restoreState.phase) {
    state = JSON.parse(JSON.stringify(opts.restoreState))
    seq = state.events.length ? state.events[state.events.length - 1].seq : 0
    actionSeq = state.actionLog.length
    state.actionLog.forEach(l => executedIds.add(l.actionId))
    huOrderList = state.players.filter(p => p.hu).map(p => {
      const h = { seat: p.seat, how: p.hu.how, winTile: p.hu.winTile, fan: p.hu.fan, names: p.hu.names, scoreDelta: p.hu.scoreDelta }
      return h
    })
    plot.humanDraws = 4 // 恢复后继续兜底剧情
    resume()
  } else {
    initState(opts.seed != null ? opts.seed : Date.now() % 1e9)
    boot()
  }

  return { view, dispatch, suggest, finished, restart, dispose, exportState }
}
