#!/usr/bin/env node
// ============================================================
// 四川麻将 AI（ai.js）策略测试
// ------------------------------------------------------------
// 运行（仓库根目录）：
//   npx esbuild scripts/test-mahjong-ai.mjs --bundle --format=esm \
//     --platform=node --outfile=/tmp/scmj-ai-test.mjs && node /tmp/scmj-ai-test.mjs
//
// 说明：
//   1. 测试数据全部为手构造的 PlayerView JSON，不依赖 engine.js；
//   2. rules.js 存在性降级：顶部 fs.existsSync 检查——
//        存在 → 复制真实 rules 作为向听断言基准；
//        缺失 → 使用测试内手写的最小 shanten 实现（分解枚举 + 标准公式，
//                仅覆盖面子型牌型）作为基准，验证 ai 主流程；
//   3. ai.js 通过「/tmp 副本 + import 路径重写」加载（源码逻辑零改动，
//      仅把相对 import 改指向同目录副本），绕开项目 package.json 无
//      "type":"module" 导致 Node 按 CJS 解析 .js 的问题；
//   4. 覆盖：easy 缺门/孤张、normal 向听最小化、响应窗口必胡/碰不变过、
//      hard 安全张偏好、suggest 一致性、三档耗时 <50ms、兜底、确定性。
// ============================================================
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 打包到 /tmp 执行时 import.meta.url 会指向临时副本，优先使用当前
// checkout（CI 与文档命令均从仓库根目录执行）；直接 node 运行时再回退
// 到脚本所在目录推导仓库根目录。
const cwdRoot = path.resolve(process.env.SCMJ_ROOT || process.cwd())
const directRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = fs.existsSync(path.join(cwdRoot, '.vuepress/components/mahjong')) ? cwdRoot : directRoot
const SRC = path.join(ROOT, '.vuepress/components/mahjong')
const TMP = path.join(os.tmpdir(), 'scmj-ai-test')

// ---------- 测试内手写最小 shanten 实现（rules.js 缺失时的降级基准） ----------
const STUB_RULES = `
// 测试专用最小向听数实现：分解枚举（面子型牌型）+ 标准公式
// s = (4 - melds) * 2 - min(partials, 4 - melds) - (pairs >= 1 ? 1 : 0)
const splitCache = new Map()
function suitSplits(cnt) {
  const key = cnt.join('')
  if (splitCache.has(key)) return splitCache.get(key)
  const out = []
  const seen = new Set()
  const rec = (i, sets, partials, pairs, singles) => {
    while (i < 9 && cnt[i] === 0) i++
    if (i >= 9) {
      const k = sets + '/' + partials + '/' + pairs + '/' + singles
      if (!seen.has(k)) { seen.add(k); out.push([sets, partials, pairs, singles]) }
      return
    }
    if (cnt[i] >= 3) { cnt[i] -= 3; rec(i, sets + 1, partials, pairs, singles); cnt[i] += 3 }
    if (cnt[i] >= 2) { cnt[i] -= 2; rec(i, sets, partials + 1, pairs, singles); cnt[i] += 2 }
    if (cnt[i] >= 2) { cnt[i] -= 2; rec(i, sets, partials, pairs + 1, singles); cnt[i] += 2 }
    if (i + 2 < 9 && cnt[i + 1] > 0 && cnt[i + 2] > 0) {
      cnt[i]--; cnt[i + 1]--; cnt[i + 2]--
      rec(i, sets + 1, partials, pairs, singles)
      cnt[i]++; cnt[i + 1]++; cnt[i + 2]++
    }
    if (i + 1 < 9 && cnt[i + 1] > 0) {
      cnt[i]--; cnt[i + 1]--
      rec(i, sets, partials + 1, pairs, singles)
      cnt[i]++; cnt[i + 1]++
    }
    if (i + 2 < 9 && cnt[i + 2] > 0) {
      cnt[i]--; cnt[i + 2]--
      rec(i, sets, partials + 1, pairs, singles)
      cnt[i]++; cnt[i + 2]++
    }
    cnt[i]--
    rec(i, sets, partials, pairs, singles + 1)
    cnt[i]++
  }
  rec(0, 0, 0, 0, 0)
  splitCache.set(key, out)
  return out
}
function combos(tiles) {
  const c = [new Array(9).fill(0), new Array(9).fill(0), new Array(9).fill(0)]
  for (const t of tiles) c[Math.floor(t / 9)][t % 9]++
  return [suitSplits(c[0]), suitSplits(c[1]), suitSplits(c[2])]
}
export function isWinHand(tiles, meldCount) {
  const parts = combos(tiles)
  for (const x of parts[0]) for (const y of parts[1]) for (const z of parts[2]) {
    if (x[0] + y[0] + z[0] + meldCount === 4 && x[1] + y[1] + z[1] === 0 && x[2] + y[2] + z[2] === 1 && x[3] + y[3] + z[3] === 0) return true
  }
  return false
}
export function handShanten(hand, meldCount) {
  const parts = combos(hand)
  let best = 8
  for (const x of parts[0]) for (const y of parts[1]) for (const z of parts[2]) {
    const sets = x[0] + y[0] + z[0] + meldCount
    const partials = x[1] + y[1] + z[1]
    const pairs = x[2] + y[2] + z[2]
    const slots = Math.max(0, 4 - sets)
    const s = slots * 2 - Math.min(partials, slots) - (pairs >= 1 ? 1 : 0)
    if (s < best) best = s
  }
  return best < 0 ? 0 : best
}
export function tingTiles(hand, meldCount) {
  const out = []
  for (let d = 0; d < 27; d++) {
    if (isWinHand(hand.concat([d]), meldCount)) out.push(d)
  }
  return out
}
`

// ---------- 准备 /tmp 副本链：contract / rules / ai ----------
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })

const hasRules = fs.existsSync(path.join(SRC, 'rules.js'))

fs.copyFileSync(path.join(SRC, 'contract.js'), path.join(TMP, 'contract.mjs'))
if (hasRules) {
  fs.writeFileSync(
    path.join(TMP, 'rules.mjs'),
    fs
      .readFileSync(path.join(SRC, 'rules.js'), 'utf8')
      .replace(/from ['"]\.\/contract\.js['"]/g, "from './contract.mjs'")
  )
} else {
  fs.writeFileSync(path.join(TMP, 'rules.mjs'), STUB_RULES)
}
fs.writeFileSync(
  path.join(TMP, 'ai.mjs'),
  fs
    .readFileSync(path.join(SRC, 'ai.js'), 'utf8')
    .replace(/from ['"]\.\/contract\.js['"]/g, "from './contract.mjs'")
    .replace(/from ['"]\.\/rules\.js['"]/g, "from './rules.mjs'")
)

const ai = await import(pathToFileURL(path.join(TMP, 'ai.mjs')).href)
const rulesMod = await import(pathToFileURL(path.join(TMP, 'rules.mjs')).href)
const contractMod = await import(pathToFileURL(path.join(TMP, 'contract.mjs')).href)

const { aiDecide, suggest } = ai
const { handShanten } = rulesMod
const { tileSuit, tileName } = contractMod

// ---------- 测试工具 ----------
let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✓ ' + name)
  } catch (e) {
    failed++
    console.error('  ✗ ' + name + ' —— ' + (e && e.message ? e.message : e))
  }
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fixedRng = () => 0.5

function baseView(over) {
  const v = {
    version: 1,
    ruleVersion: 'scmj-1.0',
    phase: 'discard',
    turn: 0,
    dealer: 0,
    wallCount: 50,
    pendingDiscard: null,
    pendingKong: null,
    players: [0, 1, 2, 3].map(seat => ({
      seat,
      handCount: 13,
      melds: [],
      discards: [],
      void: null,
      hu: null,
      delta: 0
    })),
    my: { hand: [], drawnTile: null, melds: [], discards: [], void: null, hu: null, delta: 0 },
    legal: [],
    waiting: [],
    lastEvents: [],
    results: null
  }
  return Object.assign(v, over)
}

function removeOne(arr, t) {
  const i = arr.indexOf(t)
  return i < 0 ? arr.slice() : arr.slice(0, i).concat(arr.slice(i + 1))
}

// ============================================================
// 测试场景
// ============================================================

// 场景A（normal/hard 弃牌）：手牌 万123456789 + 筒5567，摸筒9
// 打筒门任一张（5/6/7/9）均可听牌（s=0），打万则 s=1 —— 向听可降场景
function scenarioA() {
  const hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 13, 14, 15]
  return baseView({
    my: { hand, drawnTile: 17, melds: [], discards: [], void: 'tiao', hu: null, delta: 0 },
    players: [
      { seat: 0, handCount: 14, melds: [], discards: [], void: 'tiao', hu: null, delta: 0 },
      { seat: 1, handCount: 13, melds: [], discards: [12], void: 'wan', hu: null, delta: 0 },
      { seat: 2, handCount: 13, melds: [], discards: [17, 17], void: 'wan', hu: null, delta: 0 },
      { seat: 3, handCount: 13, melds: [{ kind: 'peng', tile: 0, from: 1 }], discards: [9, 10], void: 'tong', hu: null, delta: 0 }
    ],
    legal: [{ type: 'discard', tiles: [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 17] }]
  })
}

// 场景B（easy 缺门优先）：缺万未打完，引擎过滤后 legal 只有万
function scenarioVoidPending() {
  return baseView({
    my: {
      hand: [0, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      drawnTile: 21,
      melds: [],
      discards: [],
      void: 'wan',
      hu: null,
      delta: 0
    },
    players: [
      { seat: 0, handCount: 14, melds: [], discards: [], void: 'wan', hu: null, delta: 0 },
      { seat: 1, handCount: 13, melds: [], discards: [], void: 'tong', hu: null, delta: 0 },
      { seat: 2, handCount: 13, melds: [], discards: [], void: 'tiao', hu: null, delta: 0 },
      { seat: 3, handCount: 13, melds: [], discards: [], void: 'wan', hu: null, delta: 0 }
    ],
    legal: [{ type: 'discard', tiles: [0] }]
  })
}

// 场景C（easy 孤张）：缺万已打完，手牌含孤立条1/条9
function scenarioIsolated() {
  return baseView({
    my: {
      hand: [9, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 26],
      drawnTile: 22,
      melds: [],
      discards: [],
      void: 'wan',
      hu: null,
      delta: 0
    },
    players: [
      { seat: 0, handCount: 14, melds: [], discards: [], void: 'wan', hu: null, delta: 0 },
      { seat: 1, handCount: 13, melds: [], discards: [], void: 'tong', hu: null, delta: 0 },
      { seat: 2, handCount: 13, melds: [], discards: [], void: 'tiao', hu: null, delta: 0 },
      { seat: 3, handCount: 13, melds: [], discards: [], void: 'wan', hu: null, delta: 0 }
    ],
    legal: [{ type: 'discard', tiles: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22, 26] }]
  })
}

// 场景D（响应-能胡）：手牌 万111 234 567 + 筒222 3，对家打筒3 → 可胡
function scenarioHu() {
  return baseView({
    phase: 'respond',
    turn: 1,
    pendingDiscard: { seat: 1, tile: 11 },
    my: {
      hand: [0, 0, 0, 1, 2, 3, 4, 5, 6, 10, 10, 10, 11],
      drawnTile: null,
      melds: [],
      discards: [],
      void: 'tiao',
      hu: null,
      delta: 0
    },
    players: [
      { seat: 0, handCount: 13, melds: [], discards: [], void: 'tiao', hu: null, delta: 0 },
      { seat: 1, handCount: 13, melds: [], discards: [11], void: 'wan', hu: null, delta: 0 },
      { seat: 2, handCount: 13, melds: [], discards: [], void: 'wan', hu: null, delta: 0 },
      { seat: 3, handCount: 13, melds: [], discards: [], void: 'tong', hu: null, delta: 0 }
    ],
    legal: [{ type: 'hu', how: 'dianpao' }, { type: 'pass' }],
    waiting: [0]
  })
}

// 场景E（响应-碰不变向听）：手牌 万1234556789 + 筒589，对家打万5
// 碰后最优向听仍为 1（不变）→ normal 应 pass；hard 因清一色成形度放宽为碰
function scenarioPeng() {
  return baseView({
    phase: 'respond',
    turn: 1,
    pendingDiscard: { seat: 1, tile: 4 },
    my: {
      hand: [0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 13, 16, 17],
      drawnTile: null,
      melds: [],
      discards: [],
      void: 'tiao',
      hu: null,
      delta: 0
    },
    players: [
      { seat: 0, handCount: 13, melds: [], discards: [], void: 'tiao', hu: null, delta: 0 },
      { seat: 1, handCount: 13, melds: [], discards: [4], void: 'wan', hu: null, delta: 0 },
      { seat: 2, handCount: 13, melds: [], discards: [], void: 'wan', hu: null, delta: 0 },
      { seat: 3, handCount: 13, melds: [], discards: [], void: 'tong', hu: null, delta: 0 }
    ],
    legal: [{ type: 'peng', tile: 4 }, { type: 'pass' }],
    waiting: [0, 2, 3]
  })
}

// 场景H（幺鸡局响应-赖子补位碰）：手里只有 1 张真万1 + 1 只幺鸡，其余为条门
// （非清一色）→ 用赖子碰会白花掉赖子，normal/hard 都应选择 pass
function scenarioWildPeng() {
  return baseView({
    yaoji: true,
    phase: 'respond',
    turn: 1,
    pendingDiscard: { seat: 1, tile: 0 },
    my: {
      hand: [0, 18, 1, 2, 3, 5, 6, 7, 8, 20, 22, 24, 26],
      drawnTile: null,
      melds: [],
      discards: [],
      void: 'tong',
      hu: null,
      delta: 0
    },
    players: [
      { seat: 0, handCount: 13, melds: [], discards: [], void: 'tong', hu: null, delta: 0 },
      { seat: 1, handCount: 13, melds: [], discards: [0], void: 'wan', hu: null, delta: 0 },
      { seat: 2, handCount: 13, melds: [], discards: [], void: 'wan', hu: null, delta: 0 },
      { seat: 3, handCount: 13, melds: [], discards: [], void: 'tiao', hu: null, delta: 0 }
    ],
    legal: [{ type: 'peng', tile: 0 }, { type: 'pass' }],
    waiting: [0, 2, 3]
  })
}

// 场景F（换三张）：万3张（互相搭）/ 筒6张（连）/ 条5张（孤立）→ 选张数最少的万
function scenarioSwap() {
  return baseView({
    phase: 'swap',
    my: {
      hand: [0, 1, 2, 9, 10, 11, 12, 13, 14, 18, 20, 22, 24],
      drawnTile: null,
      melds: [],
      discards: [],
      void: null,
      hu: null,
      delta: 0
    },
    legal: [{ type: 'swap' }]
  })
}

// 场景G（定缺）：万5张 / 筒2张（孤立）/ 条6张 → 定缺筒
function scenarioVoid() {
  return baseView({
    phase: 'void',
    my: {
      hand: [0, 1, 2, 3, 4, 12, 17, 18, 19, 20, 21, 25, 26],
      drawnTile: null,
      melds: [],
      discards: [],
      void: null,
      hu: null,
      delta: 0
    },
    legal: [{ type: 'void', suits: ['wan', 'tong', 'tiao'] }]
  })
}

// ============================================================
// 测试主体
// ============================================================
console.log('=== 四川麻将 AI 测试（ai.js）===')
console.log(
  'rules 基准：' + (hasRules ? '真实 rules.js（副本）' : 'rules.js 缺失 → 测试内手写最小 shanten（降级）')
)
console.log('')

test('easy：缺门未打完时，选择必在 legal.tiles 内且为缺门花色', () => {
  const v = scenarioVoidPending()
  const a = aiDecide(v, 'easy', mulberry32(1))
  assert.ok(a, '应返回动作')
  assert.strictEqual(a.type, 'discard')
  assert.ok(v.legal[0].tiles.includes(a.tile), '所选牌必须在 legal.tiles 内')
  assert.strictEqual(tileSuit(a.tile), 'wan')
})

test('easy：缺门打完后优先打孤张（邻居数为 0）', () => {
  const v = scenarioIsolated()
  const a = aiDecide(v, 'easy', mulberry32(2))
  assert.ok(a && a.type === 'discard')
  assert.ok(v.legal[0].tiles.includes(a.tile), '所选牌必须在 legal.tiles 内')
  // 孤张集合 = 条1(18)/条9(26)
  assert.ok([18, 26].includes(a.tile), '应从孤张 {条1, 条9} 中选择，实际 ' + a.tile)
})

test('normal：弃牌选择使 handShanten 达到全体候选最小值（argmin）', () => {
  const v = scenarioA()
  const a = aiDecide(v, 'normal', mulberry32(3))
  assert.ok(a && a.type === 'discard')
  assert.ok(v.legal[0].tiles.includes(a.tile), '所选牌必须在 legal.tiles 内')
  const full = v.my.hand.concat([v.my.drawnTile])
  let sMin = Infinity
  const sMap = {}
  for (const t of v.legal[0].tiles) {
    const s = handShanten(removeOne(full, t), 0)
    sMap[t] = s
    if (s < sMin) sMin = s
  }
  assert.strictEqual(sMap[a.tile], sMin, '选择 ' + a.tile + ' 的向听 ' + sMap[a.tile] + ' 应等于最小 ' + sMin)
  assert.strictEqual(sMin, 0, '场景应可降到听牌（s=0）')
})

test('hard：听牌状态下优先打安全张（公开信息：弃牌堆/副露）', () => {
  const v = scenarioA()
  const a = aiDecide(v, 'hard', mulberry32(4))
  assert.ok(a && a.type === 'discard')
  const full = v.my.hand.concat([v.my.drawnTile])
  assert.strictEqual(handShanten(removeOne(full, a.tile), 0), 0, '安全张也应维持听牌')
  // 筒9 已在 2 号位弃牌堆（绝对安全）；万门被 3 号位碰（危险）→ hard 应选筒
  assert.strictEqual(tileSuit(a.tile), 'tong', 'hard 应优先安全花色（筒），实际选择 ' + a.tile)
  assert.strictEqual(a.tile, 17, '最安全张为已现于弃牌堆的筒9(id 17)')
})

test('respond：能胡的 view 必返回 hu（三档一致）', () => {
  const v = scenarioHu()
  for (const lv of ['easy', 'normal', 'hard']) {
    const a = aiDecide(v, lv, mulberry32(5))
    assert.ok(a, lv + ' 应返回动作')
    assert.strictEqual(a.type, 'hu', lv + ' 能胡必胡')
  }
})

test('respond：normal 碰后向听不变 → 选择 pass', () => {
  const v = scenarioPeng()
  const a = aiDecide(v, 'normal', mulberry32(6))
  assert.ok(a, '应返回动作')
  assert.strictEqual(a.type, 'pass', '碰不降向听数时 normal 应过')
})

test('respond：hard 因清一色成形度放宽碰（向听不变也可碰）', () => {
  const v = scenarioPeng()
  const a = aiDecide(v, 'hard', mulberry32(7))
  assert.ok(a, '应返回动作')
  assert.strictEqual(a.type, 'peng', '万字占 10/13 ≥ 65% 且碰牌属主门 → hard 应碰')
})

test('幺鸡局：手上只有 1 张真牌时用赖子补位碰不划算 → normal/hard 均 pass', () => {
  const v = scenarioWildPeng()
  for (const lv of ['normal', 'hard']) {
    const a = aiDecide(v, lv, mulberry32(12))
    assert.ok(a, lv + ' 应返回动作')
    assert.strictEqual(a.type, 'pass', lv + ' 平胡牌型不应花赖子去碰，实际 ' + a.type)
  }
  // 提示文案应解释「赖子留手上更值」
  const s = suggest(scenarioWildPeng(), 'hard')
  assert.ok(s && /赖子/.test(s.text), '建议文案应提到赖子：' + (s && s.text))
})

test('suggest：text 非空且含建议/牌名/理由，action 与 aiDecide 完全一致', () => {
  for (const [v, lv] of [
    [scenarioA(), 'normal'],
    [scenarioA(), 'hard'],
    [scenarioHu(), 'easy'],
    [scenarioPeng(), 'normal'],
    [scenarioSwap(), 'normal'],
    [scenarioVoid(), 'hard']
  ]) {
    const s = suggest(v, lv)
    assert.ok(s, 'suggest 应返回建议')
    assert.strictEqual(typeof s.text, 'string')
    assert.ok(s.text.length > 0, 'text 非空')
    assert.ok(/建议|向听|胡|碰|杠|换|定缺/.test(s.text), 'text 应含理由关键词：' + s.text)
    const a = aiDecide(v, lv, fixedRng)
    assert.deepStrictEqual(s.action, a, 'suggest 与 aiDecide(固定 rng=0.5) 的 action 应一致：' + s.text)
  }
})

test('三档对同一 view 各跑一遍不 throw，单次决策 < 50ms（console.time）', () => {
  const views = [
    ['弃牌-场景A', scenarioA()],
    ['响应-胡', scenarioHu()],
    ['响应-碰', scenarioPeng()],
    ['换三张', scenarioSwap()],
    ['定缺', scenarioVoid()]
  ]
  for (const [name, v] of views) {
    for (const lv of ['easy', 'normal', 'hard']) {
      const label = 'aiDecide[' + lv + '][' + name + ']'
      console.time(label)
      const t0 = performance.now()
      const a = aiDecide(v, lv, mulberry32(8))
      const ms = performance.now() - t0
      console.timeEnd(label)
      assert.ok(ms < 50, label + ' 耗时 ' + ms.toFixed(2) + 'ms 应 < 50ms')
      assert.ok(a === null || typeof a === 'object', '不 throw 且返回 null 或动作对象')
      if (a && a.type === 'discard') {
        const opt = v.legal.find(o => o.type === 'discard')
        assert.ok(opt && opt.tiles.includes(a.tile), '弃牌必须在 legal.tiles 内')
      }
    }
  }
})

test('兜底：legal 为空数组时返回 null 不抛错（三档）', () => {
  const v = baseView({ legal: [] })
  for (const lv of ['easy', 'normal', 'hard']) {
    assert.strictEqual(aiDecide(v, lv, mulberry32(9)), null, lv + ' legal 空应返回 null')
  }
  // 异常防御：legal 结构残缺 / my 缺失等不抛错，返回 null 或合法动作
  assert.strictEqual(aiDecide(baseView({ legal: [{ type: 'discard', tiles: [] }] }), 'normal', fixedRng), null)
  const noMy = aiDecide(baseView({ my: undefined, legal: [{ type: 'pass' }] }), 'normal', fixedRng)
  assert.deepStrictEqual(noMy, { type: 'pass' }, 'my 缺失时兜底应返回合法动作 pass 而非抛错')
  const passOnly = aiDecide(baseView({ phase: 'respond', legal: [{ type: 'pass' }] }), 'hard', fixedRng)
  assert.deepStrictEqual(passOnly, { type: 'pass' })
})

test('swap：返回 3 张同花色且全部来自手牌', () => {
  const v = scenarioSwap()
  for (const lv of ['easy', 'normal', 'hard']) {
    const a = aiDecide(v, lv, mulberry32(10))
    assert.ok(a && a.type === 'swap', lv + ' 应返回换三张')
    assert.strictEqual(a.tiles.length, 3)
    const suits = new Set(a.tiles.map(tileSuit))
    assert.strictEqual(suits.size, 1, '必须同花色')
    const pool = v.my.hand.slice()
    for (const t of a.tiles) {
      const i = pool.indexOf(t)
      assert.ok(i >= 0, '换出的牌必须来自自己手牌')
      pool.splice(i, 1)
    }
  }
})

test('void：选择张数最少且搭子最少的花色（三档一致选筒）', () => {
  const v = scenarioVoid()
  for (const lv of ['easy', 'normal', 'hard']) {
    const a = aiDecide(v, lv, mulberry32(11))
    assert.ok(a && a.type === 'void', lv + ' 应返回定缺')
    assert.strictEqual(a.suit, 'tong', lv + ' 应定缺筒（2张且无搭子），实际 ' + a.suit)
    assert.ok(v.legal[0].suits.includes(a.suit), '必须在 legal.suits 内')
  }
})

test('确定性：相同 view + 相同 rng 序列 → 决策完全一致（可复现）', () => {
  const vs = [scenarioA(), scenarioHu(), scenarioPeng(), scenarioSwap(), scenarioIsolated()]
  for (const v of vs) {
    for (const lv of ['easy', 'normal', 'hard']) {
      const a1 = aiDecide(v, lv, mulberry32(42))
      const a2 = aiDecide(v, lv, mulberry32(42))
      assert.deepStrictEqual(a1, a2, lv + ' 相同输入必须产出相同决策')
    }
  }
})

// ---------- 结果汇总 ----------
console.log('')
console.log('=== 测试完成：' + passed + ' 通过，' + failed + ' 失败 ===')
if (failed > 0) {
  process.exit(1)
}
