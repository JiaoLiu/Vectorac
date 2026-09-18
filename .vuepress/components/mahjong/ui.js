// ============================================================
// 四川麻将（血战到底）· 牌桌 UI（ui.js）
// ------------------------------------------------------------
// 职责：把 adapter 返回的 PlayerView 渲染成牌桌，收集人类操作并 dispatch。
// 原则：
//   1. 只依赖 contract.js（牌名 / 规则常量）与注入的 adapter 工厂
//      （createLocalGame，由页面动态 import adapter.js 后注入）。
//   2. 不判断胡牌、不修改牌局：能做什么只看 view().legal。
//   3. 每次数据变化全量重渲染（数据量小，简单可靠）。
//   4. 纯 DOM 操作、零第三方依赖；类名全部 scmj- 前缀，
//      样式由页面 <style> scoped 在 #scmjGame 容器内。
//   5. 所有 DOM 逻辑只在浏览器端执行（由页面的 mounted 动态 import 保证）。
// ============================================================

import {
  tileName,
  tileSuit,
  tileRank,
  SUIT_NAMES,
  DEFAULT_RULES,
  RULE_VERSION,
  YAOJI_TILE
} from './contract.js'

// 座位文案（0 自己 1 右/下家 2 上/对家 3 左/上家）
const SEAT_LABELS = ['你', '右家 · 旺财', '对家 · 阿福', '左家 · 小美']
const SEAT_SHORT = ['你', '右家', '对家', '左家']
const SEAT_AVATARS = ['', '🦊', '🐼', '🐺']
const SEAT_POS = ['下', '右', '上', '左']
const WINDS = ['东', '南', '西', '北']

// 牌面贴图：/mahjong/tiles/{code}.png（万=m 筒=p 条=s）
const SUIT_CODE = { wan: 'm', tong: 'p', tiao: 's' }
function tileImageSrc(id) {
  return '/mahjong/tiles/' + SUIT_CODE[tileSuit(id)] + tileRank(id) + '.png'
}
// 紧凑牌名：1万 / 2筒 / 3条（听牌提示用，省空间）
function compactTileName(id) {
  return tileRank(id) + SUIT_NAMES[tileSuit(id)]
}
// 风位：庄家为东，按行动顺序 0→1→2→3 依次 南/西/北
function windOf(seat, dealer) {
  return WINDS[(seat - dealer + 4) % 4]
}

// 骰子点位（3x3 九宫格下标）
const PIP_MAP = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
}

const HOW_NAMES = { zimo: '自摸', dianpao: '点炮', qianggang: '抢杠' }
const REASON_NAMES = {
  zimo: '自摸胡',
  dianpao: '点炮胡',
  qianggang: '抢杠胡',
  'gang-ming': '明杠（刮风）',
  'gang-an': '暗杠（下雨）',
  'gang-refund': '退杠（流局未听牌）',
  'gang-zhuan-yu': '杠上炮转雨',
  'yaoji-xi': '幺鸡喜钱',
  'cha-huazhu': '查花猪',
  'cha-dajiao': '查大叫'
}
const GANG_NAMES = { ming: '明', an: '暗', bu: '补' }
const PHASE_NAMES = {
  deal: '发牌',
  swap: '换三张',
  void: '定缺',
  discard: '摸打',
  respond: '响应',
  finished: '已结束'
}
const ERROR_HINTS = {
  stale: '操作已过期，请重试',
  duplicate: '该操作已执行过',
  'not-active': '当前不是你的行动窗口',
  illegal: '当前规则下这个操作不合法',
  'wrong-phase': '当前阶段不能进行这个操作'
}

const SAVE_KEY = 'scmj-save'
const SETTINGS_KEY = 'scmj-settings'
const SESSION_KEY = 'scmj-session'
const START_SCORE = 100 // 进游戏每人起始积分
export const WALL_SIDE_SLOTS = 14 // 牌墙每边牌位（双层 2×7），四边共 56
// 牌背贴图真实比例（/mahjong/tiles/back.png，158×200 竖版）：
// 牌墙按真实牌张比例绘制时用「高 = 宽 × TILE_ASPECT」换算，保证牌背不被拉伸。
const TILE_ASPECT = 200 / 158

/**
 * 牌墙环逐牌位占用掩码：掷骰在起点方位墙内开牌，从开牌点起逐张消耗。
 * - 总牌位 = 每边 WALL_SIDE_SLOTS × 4 = 56（发牌后未摸的完整牌墙长度，
 *   庄家起手第 14 张即算作吃掉开牌点那 1 张，故开局 n=55、taken=1）；
 * - 开牌点 = headSeat 方位墙内第 openOffset 个牌位（骰子点数之和 2~12），
 *   摸牌沿环序（0 下 → 1 右 → 2 上 → 3 左）从开牌点逐张吃掉，
 *   开牌点前的牌位成为牌尾、最后才摸到——缺口从骰子点开的那一方中部
 *   出现并逐张扩大，与真实开牌一致；
 * - 返回 [seat0..seat3] 各 14 个布尔（true=该牌位还有牌背），
 *   每个方位渲染全部 14 个牌位，被摸走的位置留空位不位移。
 * 不变量（导出供测试校验）：剩余牌墙里「只占半张」的垛数 = n 的奇偶，
 *   即 n 为偶数时所有垛都是完整两张，n 为奇数时只有墙头待摸的那 1 张孤张。
 */
export function ringMask(n, headSeat, openOffset) {
  const total = WALL_SIDE_SLOTS * 4
  const taken = Math.max(0, Math.min(total, total - Math.max(0, n | 0)))
  const head = ((headSeat | 0) % 4 + 4) % 4
  // 开牌点必须落在「垛」的边界上（每垛 2 张）。骰子点数先归到该边的垛序号再 ×2：
  // 否则开牌会劈开一垛，牌墙上除墙头那张待摸的孤张外，墙尾还会多出一张没配对的重牌。
  const stacksPerSide = WALL_SIDE_SLOTS / 2
  const off =
    (((openOffset | 0) % stacksPerSide + stacksPerSide) % stacksPerSide) * 2
  const start = head * WALL_SIDE_SLOTS + off
  const mask = [0, 1, 2, 3].map(() => new Array(WALL_SIDE_SLOTS).fill(true))
  for (let i = 0; i < taken; i++) {
    const pos = (start + i) % total
    mask[Math.floor(pos / WALL_SIDE_SLOTS)][pos % WALL_SIDE_SLOTS] = false
  }
  return mask
}

function fmtDelta(d) {
  return (d > 0 ? '+' : '') + d
}
function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  return Math.floor(m / 60) + ' 小时前'
}

export default class ScmjUI {
  /**
   * @param {HTMLElement} root            #scmjGame 容器
   * @param {Object} options
   *   - createLocalGame : adapter 工厂（页面动态 import adapter.js 后注入）
   *   - router          : 可选，VuePress $router（结算页“返回官网”用）
   */
  constructor(root, options = {}) {
    this.root = root
    this.createLocalGame = options.createLocalGame
    this.router = options.router || null
    this.game = null
    this.view = null
    this.aiLevel = 'hard' // AI 难度固定「困难」（开始页不再提供选择）
    // capFan：封顶番数（入口 − / ＋ 步进 2~6 可选，默认 3 番）
    // swapThree：换三张开关（入口勾选，关掉则本局直接定缺，不换牌）
    // yaojiEnabled：幺鸡赖子开关（入口勾选，开启后幺鸡当万能牌）
    this.settings = {
      sound: true,
      animation: true,
      passHuConfirm: true,
      capFan: 3,
      swapThree: true,
      yaojiEnabled: false,
      // AI 辅助：关闭后隐藏听牌提示与出牌建议，供玩家自己看牌练习
      assist: true
    }
    this.selectedIdx = null // 手牌选中实例下标（hand + drawnTile 合并数组）
    this.swapPickIdxs = [] // 换三张已选实例下标
    // 会话积分：进游戏每人 100 分，跨局累计（本局 delta 在结算时一次性入账）
    this.round = 1
    this.scores = [START_SCORE, START_SCORE, START_SCORE, START_SCORE]
    // 破产座位：结算时任一家累计积分 ≤ 0 即记入，牌局终止（不允许再开下一局）
    this.bankruptSeats = []
    // 连庄：streakSeat 连续坐庄的座位，streakCount 连庄轮数（>=3 挂 🔥）
    this.streakSeat = null
    this.streakCount = 0
    // 本局摸牌起点方位（墙头所在座位），由适配层 session().headSeat 提供
    this.wallHead = 0
    // 开牌点在该方位墙内的牌位下标（骰子点数之和 2~12），由 session().dice 提供
    this.wallOpenOff = 2
    this._roundSettled = false
    this._toastTimer = null
    this._floatTimer = null
    this._fxTimer = null
    this._tipTimer = null
    this._confirmCb = null
    this._diceTimer = null
    this._diceSettleTimer = null
    this._diceHideTimer = null
    this._diceVisible = false
    this._destroyed = false
    this._els = {}
    this._discLens = [0, 0, 0, 0] // 各座位上次渲染的弃牌数（判断新牌以自动滚到末尾）

    // ---------- 联机（服务端权威）----------
    // isOnline=true 时：game 来自 remote-game.js，view 由服务端推送；
    // 座位名/头像/积分一律以服务端快照为准（见 applyOnlineMeta）。
    this.createOnlineGame = options.createOnlineGame || null
    this.onlineConfig = options.onlineConfig || {}
    this.isOnline = false
    this.net = null
    this.lobby = null
    this.onlineRoom = null
    this.onlinePlayer = null
    // 联机房规里的「AI 提示」开关（true/false）；null = 尚未进联机桌，用本地设置
    this.onlineAssist = null
    this._countdownTimer = null
    this._clockSkew = 0
    // 座位的显示名/简称/头像：本地模式恒用默认人设，联机模式随快照刷新
    this._labels = SEAT_LABELS
    this._shorts = SEAT_SHORT
    this._avatars = SEAT_AVATARS
  }

  // ==================== 生命周期 ====================

  mount() {
    const q = s => this.root.querySelector(s)
    this._els = {
      entry: q('[data-scmj-entry]'),
      table: q('[data-scmj-table]'),
      startBtn: q('[data-scmj-start]'),
      continueBtn: q('[data-scmj-continue]'),
      rulesBtn: q('[data-scmj-rules]'),
      btnRules: q('[data-scmj-btn-rules]'),
      btnSettings: q('[data-scmj-btn-settings]'),
      btnExit: q('[data-scmj-btn-exit]'),
      entrySwap: q('[data-scmj-entry-swap]'),
      entryYaoji: q('[data-scmj-entry-yaoji]'),
      entryAssist: q('[data-scmj-entry-assist]'),
      entryCapFanDec: q('[data-scmj-capfan-dec]'),
      entryCapFanInc: q('[data-scmj-capfan-inc]'),
      entryCapFanVal: q('[data-scmj-entry-capfan-val]'),
      portraitTip: q('.scmj-portrait-tip'),
      modalRules: q('[data-scmj-modal-rules]'),
      modalSettings: q('[data-scmj-modal-settings]'),
      modalConfirm: q('[data-scmj-modal-confirm]'),
      rulesContent: q('[data-scmj-rules-content]'),
      setSound: q('[data-scmj-set-sound]'),
      setAnim: q('[data-scmj-set-anim]'),
      setPassHu: q('[data-scmj-set-passhu]'),
      confirmText: q('.scmj-confirm-text'),
      confirmOk: q('[data-scmj-confirm-ok]'),
      confirmCancel: q('[data-scmj-confirm-cancel]'),
      settle: q('[data-scmj-settle]'),
      countdown: q('[data-scmj-countdown]'),
      lobby: q('[data-scmj-lobby]'),
      entryOnline: q('[data-scmj-online]'),
      dice: q('[data-scmj-dice]'),
      dicePair: q('[data-scmj-dice-pair]'),
      diceMsg: q('[data-scmj-dice-msg]'),
      diceTitle: q('[data-scmj-dice-title]'),
      compass: q('[data-scmj-compass]'),
      roundChip: q('[data-scmj-round]'),
      center: q('[data-scmj-center]'),
      centerslot: q('[data-scmj-centerslot]'),
      centerbox: q('[data-scmj-centerbox]'),
      wallbox: q('[data-scmj-wallbox]'),
      wallring: q('[data-scmj-wallring]'),
      wallringTop: q('[data-scmj-wallring-top]'),
      wallringRight: q('[data-scmj-wallring-right]'),
      wallringBottom: q('[data-scmj-wallring-bottom]'),
      wallringLeft: q('[data-scmj-wallring-left]'),
      float: q('[data-scmj-float]'),
      fx: q('[data-scmj-fx]'),
      toast: q('[data-scmj-toast]'),
      wall: q('[data-scmj-wall]'),
      turn: q('[data-scmj-turn]'),
      latest: q('[data-scmj-latest]'),
      actions: q('[data-scmj-actions]'),
      ting: q('[data-scmj-ting]'),
      suggest: q('[data-scmj-suggest]'),
      mymelds: q('[data-scmj-mymelds]'),
      hand: q('[data-scmj-hand]'),
      seat1: q('[data-scmj-seat1]'),
      seat2: q('[data-scmj-seat2]'),
      seat3: q('[data-scmj-seat3]'),
      pop: q('[data-scmj-pop]')
    }
    for (let s = 0; s < 4; s++) {
      this._els['discTiles' + s] = q('[data-scmj-disc' + s + 'tiles]')
    }
    for (const s of [1, 2, 3]) {
      this._els['seatMelds' + s] = q('[data-scmj-seat' + s + 'melds]')
      this._els['seatPend' + s] = q('[data-scmj-seat' + s + 'pend]')
    }
    // 关键元素自检：缺失通常意味着浏览器持有了旧缓存页面（与新版 ui.js
    // 选择器不匹配），明确警告方便定位，而不是在渲染时抛 null 异常
    const required = ['table', 'hand', 'actions', 'seat1', 'seat2', 'seat3', 'wallbox', 'settle', 'toast']
    const missing = required.filter(k => !this._els[k])
    if (missing.length) {
      console.warn('[四川麻将] 页面缺少关键元素（可能是旧缓存页面，请强制刷新 Cmd/Ctrl+Shift+R）：', missing.map(k => '[data-scmj-' + k + ']').join(', '))
    }
    this.loadSettings()
    this.bindStatic()
    this.bindOnline()
    // 中央面板与牌墙都是正方形，尺寸依赖中央区实际宽高 → 窗口尺寸变化时重算
    // （fitCenterBox 先定面板边长，fitWallRing 再按面板内的牌墙盒计算）
    this._onResize = () => {
      this.fitCenterBox()
      this.fitWallRing()
    }
    window.addEventListener('resize', this._onResize)
    window.addEventListener('orientationchange', this._onResize)
    if (this._els.rulesContent) this._els.rulesContent.innerHTML = this.buildRulesHtml()
    this.refreshEntry()
    this.showEntry()
    // 邀请链接（?room=CODE）：跳过入口页直接进联机大厅，并自动加入该房间。
    // 刷新页面（无邀请参数）时：本地若仍有未退出的房间凭据（multiplayer/net-client.js
    // 的 scmj-online-cred）→ 同样直接进大厅并自动回原座位，避免玩家以为座位丢了。
    let hasOnlineCred = false
    try {
      hasOnlineCred = !!localStorage.getItem('scmj-online-cred')
    } catch (e) {
      /* 隐私模式忽略 */
    }
    const invite = this.takeInviteCode()
    if (invite) this.openOnlineLobby({ inviteCode: invite })
    else if (hasOnlineCred) this.openOnlineLobby()
  }

  destroy() {
    this._destroyed = true
    if (this.game && this.game.dispose) this.game.dispose()
    this.game = null
    this.view = null
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize)
      window.removeEventListener('orientationchange', this._onResize)
      this._onResize = null
    }
    this.hideOpening()
    this.exitFullscreen()
    clearTimeout(this._toastTimer)
    clearTimeout(this._floatTimer)
    clearTimeout(this._fxTimer)
    clearTimeout(this._tipTimer)
  }

  // ==================== 设置与存档 ====================

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s && typeof s === 'object') this.settings = Object.assign(this.settings, s)
      }
    } catch (e) {
      /* 存档异常时使用默认设置 */
    }
    this.applySettingsToUi()
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    } catch (e) {
      /* 隐私模式等场景忽略 */
    }
    this.applySettingsToUi()
    // 封顶番数会写进规则说明，设置变化后重建一次
    if (this._els.rulesContent) this._els.rulesContent.innerHTML = this.buildRulesHtml()
  }

  applySettingsToUi() {
    const e = this._els
    if (!e.entry) return
    // 设置控件属于可选 UI：旧版缓存页、裁剪版嵌入页可能只保留入口或
    // 牌桌，不应因为缺少某个 checkbox 阻断整张牌桌初始化。
    const setChecked = (el, value) => {
      if (el) el.checked = !!value
    }
    setChecked(e.entrySwap, this.settings.swapThree)
    setChecked(e.entryYaoji, this.settings.yaojiEnabled)
    setChecked(e.entryAssist, this.settings.assist !== false)
    setChecked(e.setSound, this.settings.sound)
    setChecked(e.setAnim, this.settings.animation)
    setChecked(e.setPassHu, this.settings.passHuConfirm)
    // 封顶番数步进器（2~6，点 − / ＋ 加减，到边界禁用对应按钮）
    const cap = Math.max(2, Math.min(6, Number(this.settings.capFan) || 3))
    this.settings.capFan = cap
    if (e.entryCapFanVal) e.entryCapFanVal.textContent = cap + ' 番'
    if (e.entryCapFanDec) e.entryCapFanDec.disabled = cap <= 2
    if (e.entryCapFanInc) e.entryCapFanInc.disabled = cap >= 6
    // 动画总开关：关闭时禁用容器内全部 CSS 动画/过渡
    this.root.classList.toggle('scmj-no-anim', !this.settings.animation)
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return null
      const s = JSON.parse(raw)
      if (s && s.state && s.state.players && s.state.phase) return s
    } catch (e) {
      /* 损坏的存档视为不存在 */
    }
    return null
  }

  saveGame() {
    if (!this.game || !this.view || this.view.phase === 'finished') return
    let st = null
    try {
      if (this.game.exportState) st = this.game.exportState()
    } catch (e) {
      st = null
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ savedAt: Date.now(), state: st }))
    } catch (e) {
      /* 忽略 */
    }
  }

  /** 会话存档：局号 + 四人累计积分 + 连庄状态（进游戏每人 100 分起，跨局累计） */
  loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (!raw) return null
      const s = JSON.parse(raw)
      if (!s || !Array.isArray(s.scores) || s.scores.length !== 4) return null
      if (s.scores.some(n => typeof n !== 'number' || !isFinite(n))) return null
      return {
        round: Math.max(1, Number(s.round) | 0),
        scores: s.scores.map(n => Math.round(n)),
        streakSeat: s.streakSeat != null ? ((Number(s.streakSeat) % 4) + 4) % 4 : null,
        streakCount: Math.max(0, Number(s.streakCount) | 0)
      }
    } catch (e) {
      return null
    }
  }

  saveSession() {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          round: this.round,
          scores: this.scores,
          streakSeat: this.streakSeat,
          streakCount: this.streakCount,
          savedAt: Date.now()
        })
      )
    } catch (e) {
      /* 隐私模式等场景忽略 */
    }
  }

  resetSession() {
    this.round = 1
    this.scores = [START_SCORE, START_SCORE, START_SCORE, START_SCORE]
    this.bankruptSeats = []
    this.streakSeat = null
    this.streakCount = 0
    this._roundSettled = false
    this.saveSession()
  }

  /** 恢复会话（继续上局）；无存档则开新会话 */
  restoreSession() {
    const s = this.loadSession()
    if (s) {
      this.round = s.round
      this.scores = s.scores
      this.streakSeat = s.streakSeat
      this.streakCount = s.streakCount
    } else {
      this.round = 1
      this.scores = [START_SCORE, START_SCORE, START_SCORE, START_SCORE]
      this.streakSeat = null
      this.streakCount = 0
    }
    // 破产只在局末结算时判定；能续上的存档必然没判过破产
    this.bankruptSeats = []
    this._roundSettled = false
  }

  /** 与 adapter 对齐局号（adapter 为会话信息的权威来源） */
  syncSession() {
    try {
      const s = this.game && this.game.session ? this.game.session() : null
      if (s && s.round != null) this.round = s.round
      if (s && s.headSeat != null) this.wallHead = ((Number(s.headSeat) % 4) + 4) % 4
      if (s && Array.isArray(s.dice)) {
        const sum = (Number(s.dice[0]) || 0) + (Number(s.dice[1]) || 0)
        if (sum >= 2) this.wallOpenOff = sum
      }
      // 首局（或新会话恢复后）以当前庄家为连庄起点
      if (s && s.dealer != null && (this.round === 1 || this.streakSeat == null)) {
        this.streakSeat = ((Number(s.dealer) % 4) + 4) % 4
        this.streakCount = Math.max(1, this.streakCount || 1)
      }
    } catch (e) {
      /* 适配层未实现 session() 时以本地局号为准 */
    }
  }

  /**
   * 下局庄家：谁先胡谁坐庄；一炮多响（同一张点炮/抢杠 2~3 人同胡）时点炮者坐庄；
   * 流局（无人胡）庄家留任。返回座位号。
   */
  nextDealerOf(v) {
    const huOrder = (v && v.results && v.results.huOrder) || []
    if (!huOrder.length) return v ? v.dealer : 0
    const first = huOrder[0]
    if (first.how !== 'zimo' && first.from != null) {
      // 一炮多响：必须是同一张牌（同一次出牌 / 抢杠，tag 相同）被两家以上胡，
      // 才由点炮者坐庄；同一人先后两次点炮 tag 不同，不算多响。
      const sameDiscard = huOrder.filter(
        h => h.how !== 'zimo' && h.from === first.from && h.tag === first.tag
      )
      if (sameDiscard.length >= 2) return first.from
    }
    return first.seat
  }

  /** 本局结算：把每人 delta 一次性累计进会话积分（每局只入账一次） */
  settleRound(v) {
    if (this._roundSettled || !v.results) return
    this._roundSettled = true
    if (this.isOnline) {
      // 多局联机：房间累计积分由服务端结算后随 meta.scores 下发（进桌/结算帧都带），
      // 本地绝不重复累加，避免与服务端口径打架；破产座位同理以服务端为准。
      const meta = v.meta || {}
      if (Array.isArray(meta.scores) && meta.scores.length === 4) {
        this.scores = meta.scores.map(n => Math.round(Number(n) || 0))
      }
      this.bankruptSeats = Array.isArray(meta.bankruptSeats)
        ? meta.bankruptSeats.slice()
        : this.scores.map((score, seat) => (score <= 0 ? seat : -1)).filter(seat => seat >= 0)
      return
    }
    v.results.perSeat.forEach(p => {
      if (p.seat >= 0 && p.seat < 4) this.scores[p.seat] += p.delta
    })
    // 破产判定：任一家累计积分 ≤ 0，本局照常算完，但牌局到此终止。
    // 因为积分只在结算时入账，所以只可能在局末判出，天然满足「本局打完」。
    this.bankruptSeats = this.scores
      .map((score, seat) => (score <= 0 ? seat : -1))
      .filter(seat => seat >= 0)
    if (!this.isOnline) this.saveSession()
  }

  refreshEntry() {
    const save = this.loadSave()
    const btn = this._els.continueBtn
    if (!btn) return
    if (save) {
      btn.disabled = false
      btn.textContent = '继续上局（' + timeAgo(save.savedAt) + '）'
    } else {
      btn.disabled = true
      btn.textContent = '继续上局'
    }
  }

  // ==================== 静态事件绑定 ====================

  bindStatic() {
    const e = this._els
    const on = (el, event, fn) => {
      if (el) el.addEventListener(event, fn)
    }
    on(e.startBtn, 'click', () => {
      this.sound('click')
      this.startGame({})
    })
    on(e.continueBtn, 'click', () => {
      const save = this.loadSave()
      if (!save) return this.toast('没有找到上次的对局存档')
      this.sound('click')
      this.startGame({ save })
    })
    on(e.rulesBtn, 'click', () => {
      this.sound('click')
      if (e.modalRules) e.modalRules.hidden = false
    })
    // 入口：换三张开关（关掉则本局跳过换三张，直接定缺）
    on(e.entrySwap, 'change', () => {
      this.settings.swapThree = e.entrySwap.checked
      this.saveSettings()
    })
    // 入口：幺鸡赖子开关（开启后幺鸡当万能牌，本局生效）
    on(e.entryYaoji, 'change', () => {
      this.settings.yaojiEnabled = e.entryYaoji.checked
      this.saveSettings()
    })
    // 入口：AI 辅助开关（关闭后隐藏听牌提示与出牌建议，练习自己看牌）
    on(e.entryAssist, 'change', () => {
      this.settings.assist = e.entryAssist.checked
      this.saveSettings()
      // 立即刷新提示区，无需等下一次牌桌重绘（对局中改设置也能即时生效）
      if (this.view) this.renderHints(this.view)
    })
    // 入口：封顶番数步进器（2~6，点 − / ＋ 加减，改完即时保存）
    const stepCap = delta => {
      const cap = Math.max(2, Math.min(6, (Number(this.settings.capFan) || 3) + delta))
      this.settings.capFan = cap
      this.sound('click')
      this.saveSettings()
    }
    on(e.entryCapFanDec, 'click', () => stepCap(-1))
    on(e.entryCapFanInc, 'click', () => stepCap(1))
    // 座位面板：点击查看对手详情（积分/手牌数/副露/本局得失）
    for (const s of [1, 2, 3]) {
      on(this._els['seat' + s], 'click', () => this.showSeatPop(s))
    }
    // 详情弹层：点遮罩或关闭按钮收起
    this.root.querySelectorAll('[data-scmj-close-pop]').forEach(el => {
      on(el, 'click', () => this.hideSeatPop())
    })
    // 牌桌顶栏
    on(e.btnRules, 'click', () => {
      this.sound('click')
      if (e.modalRules) e.modalRules.hidden = false
    })
    on(e.btnSettings, 'click', () => {
      this.sound('click')
      if (e.modalSettings) e.modalSettings.hidden = false
    })
    on(e.btnExit, 'click', () => this.onExit())
    // 弹层关闭（遮罩与按钮共用 data 属性）
    this.root.querySelectorAll('[data-scmj-close-rules]').forEach(el => {
      on(el, 'click', () => {
        if (e.modalRules) e.modalRules.hidden = true
      })
    })
    this.root.querySelectorAll('[data-scmj-close-settings]').forEach(el => {
      on(el, 'click', () => {
        if (e.modalSettings) e.modalSettings.hidden = true
      })
    })
    // 设置弹层开关
    on(e.setSound, 'change', () => {
      this.settings.sound = e.setSound.checked
      this.saveSettings()
    })
    on(e.setAnim, 'change', () => {
      this.settings.animation = e.setAnim.checked
      this.saveSettings()
    })
    on(e.setPassHu, 'change', () => {
      this.settings.passHuConfirm = e.setPassHu.checked
      this.saveSettings()
    })
    // 轻量确认条
    on(e.confirmOk, 'click', () => {
      if (e.modalConfirm) e.modalConfirm.hidden = true
      const cb = this._confirmCb
      this._confirmCb = null
      if (cb) cb()
    })
    on(e.confirmCancel, 'click', () => {
      if (e.modalConfirm) e.modalConfirm.hidden = true
      this._confirmCb = null
    })
  }

  showEntry() {
    if (this._els.entry) this._els.entry.hidden = false
    if (this._els.table) this._els.table.hidden = true
    if (this._els.settle) this._els.settle.hidden = true
    if (this._els.lobby) this._els.lobby.hidden = true
  }

  showTable() {
    if (this._els.entry) this._els.entry.hidden = true
    if (this._els.table) this._els.table.hidden = false
    if (this._els.lobby) this._els.lobby.hidden = true
    // 竖屏提示：开局后在原位显示 5s，再收起腾出高度给牌桌
    this.showPortraitTip()
  }

  /** 竖屏提示显示 5s 后自动收起 */
  showPortraitTip() {
    const tip = this._els.portraitTip
    if (!tip) return
    tip.hidden = false
    clearTimeout(this._tipTimer)
    this._tipTimer = setTimeout(() => { tip.hidden = true }, 5000)
  }

  // ==================== 联机（大厅 / 牌桌） ====================

  /** 入口页「联机对战」：懒加载大厅模块，避免单机玩家多付一份解析成本 */
  bindOnline() {
    const btn = this._els.entryOnline
    if (!btn) return
    btn.addEventListener('click', () => {
      this.sound('click')
      this.openOnlineLobby()
    })
  }

  async openOnlineLobby({ inviteCode } = {}) {
    if (!this.createOnlineGame) return this.toast('联机模块未加载，请刷新页面重试')
    if (!this.lobby) {
      try {
        const { Lobby } = await import('./multiplayer/lobby.js')
        this.lobby = new Lobby({ root: this.root, ui: this, config: this.onlineConfig })
      } catch (e) {
        console.error('[四川麻将] 联机大厅加载失败：', e)
        return this.toast('联机大厅加载失败，请刷新重试')
      }
    }
    if (this._els.entry) this._els.entry.hidden = true
    if (this._els.table) this._els.table.hidden = true
    if (this._els.settle) this._els.settle.hidden = true
    if (this._els.lobby) this._els.lobby.hidden = false
    this.lobby.open({ inviteCode })
  }

  /**
   * 邀请链接 ?room=CODE：读取后立即从地址栏摘掉该参数。
   * 摘掉是必要的——否则玩家退出房间 / 从大厅返回后，再次打开大厅仍会读到旧参数，
   * 被反复自动拉回同一房间。返回有效的 6 位房号，否则返回空串。
   */
  takeInviteCode() {
    try {
      const q = new URLSearchParams(location.search)
      const code = (q.get('room') || '').trim().toUpperCase()
      if (!code) return ''
      q.delete('room')
      const qs = q.toString()
      if (window.history && history.replaceState) {
        history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash)
      }
      return /^[0-9A-Z]{6}$/.test(code) ? code : ''
    } catch (e) {
      return ''
    }
  }

  /**
   * 等待室 → 牌桌。服务端推来的 PlayerView 已做隐私过滤与视角旋转
   * （自己永远是 0 号位），所以牌桌渲染逻辑与单机完全一致。
   */
  startOnlineGame({ net, player, room, view }) {
    if (this.game && this.game.dispose) this.game.dispose()
    this.isOnline = true
    this.net = net
    this.onlinePlayer = player || null
    this.onlineRoom = room || null
    // 房规「AI 提示」：与单机 assist 同理，关闭时隐藏听牌提示与出牌建议
    this.onlineAssist = !(room && room.rules && room.rules.assist === false)
    this.selectedIdx = null
    this.swapPickIdxs = []
    this._discLens = [0, 0, 0, 0]
    // 多局联机：局号与累计积分都以服务端为准（syncSession 取局号，applyOnlineMeta 取积分），
    // 这里先给一个首帧兜底值，避免进桌瞬间显示空积分
    this.round = 1
    this._roundSettled = false
    this.bankruptSeats = []
    this.scores = [START_SCORE, START_SCORE, START_SCORE, START_SCORE]
    this.streakSeat = null
    this.streakCount = 0
    this.game = this.createOnlineGame({
      net,
      player,
      view,
      aiLevel: this.aiLevel,
      onEvent: ev => this.onGameEvent(ev)
    })
    this.syncSession()
    this.showTable()
    this.enterFullscreen()
    this.render()
    this.sound('deal')
    this.playOpening()
    this.startCountdown()
    // 保险：再要一帧，确保牌桌与服务端状态严格一致（重连/进桌共用）
    if (net && net.resync) net.resync()
  }

  /** 联机退出：明确 LEAVE（永久退出，座位转 AI / 释放），回到大厅 */
  onOnlineExit() {
    this.confirm('退出房间？退出后座位会立即交给 AI 托管，无法再回到本局。', () => this.leaveOnline())
  }

  /**
   * 收起牌桌与结算浮层。
   * 牌桌/结算是覆盖在页面上的浮层；回大厅（返回房间列表 / 房间失效）时必须收起，
   * 否则它们会一直盖在大厅列表上面，看起来像按钮点了没反应。
   */
  hideTableChrome() {
    if (this._els.table) this._els.table.hidden = true
    if (this._els.settle) this._els.settle.hidden = true
  }

  /**
   * 联机多局：本局结束点「准备下一局」。
   * 先向服务端标记本座位就绪（全员就绪后由服务端自动开下一局），
   * 再收起牌桌回到房间等待室——不必退出房间，座位与累计积分都保留。
   */
  onOnlineReady() {
    if (this.net && this.net.sendAdmin) this.net.sendAdmin('TOGGLE_READY', { ready: true })
    this.backToRoom()
  }

  /**
   * 收起牌桌回到房间等待室（不退出房间）。
   * 与 leaveOnline 的区别：不发 LEAVE_ROOM、不释放座位、不丢累计积分，只拆掉本地
   * 牌局适配层；服务端推来下一局的 GAME_STATE_CHANGED 时会自动重新进桌。
   */
  backToRoom() {
    this.stopCountdown()
    if (this.game && this.game.dispose) this.game.dispose()
    this.game = null
    this.view = null
    this.isOnline = false
    this.onlineAssist = null
    this._roundSettled = false
    this.bankruptSeats = []
    this.hideOpening()
    this.exitFullscreen()
    this.hideTableChrome()
    if (this.lobby) this.lobby.returnToWaiting()
    else this.showEntry()
  }

  leaveOnline() {
    this.stopCountdown()
    if (this.game && this.game.dispose) this.game.dispose()
    this.game = null
    this.view = null
    this.isOnline = false
    this.onlineAssist = null
    this.hideOpening()
    this.exitFullscreen()
    this.hideTableChrome()
    if (this.net) this.net.leaveRoom()
    this.net = null
    this.onlinePlayer = null
    this.onlineRoom = null
    if (this.lobby) this.lobby.returnToList()
    else this.showEntry()
  }

  /** 房间被销毁 / 令牌失效（由大厅回调）：中止牌局并回到大厅列表 */
  onlineAborted(reason) {
    if (!this.isOnline) return
    this.stopCountdown()
    if (this.game && this.game.dispose) this.game.dispose()
    this.game = null
    this.view = null
    this.isOnline = false
    this.onlineAssist = null
    this.net = null
    this.onlinePlayer = null
    this.onlineRoom = null
    this.hideOpening()
    this.exitFullscreen()
    this.hideTableChrome()
    if (reason) this.toast(reason)
    if (this.lobby) this.lobby.open()
    else this.showEntry()
  }

  // ---------- 联机：座位元信息与倒计时 ----------

  /** 联机座位名/头像/积分全部以服务端快照为准；本地模式保持原人设 */
  applyOnlineMeta(v) {
    const meta = v && v.meta
    if (!(this.isOnline && meta && meta.online && Array.isArray(meta.seats))) {
      this._labels = SEAT_LABELS
      this._shorts = SEAT_SHORT
      this._avatars = SEAT_AVATARS
      return
    }
    const nameOf = s => s.displayName || (s.isAi ? 'AI' : '玩家')
    this._labels = meta.seats.map((s, i) => (i === 0 ? '你' : nameOf(s)))
    this._shorts = meta.seats.map((s, i) => {
      if (i === 0) return '你'
      const n = nameOf(s)
      return n.length > 4 ? n.slice(0, 4) : n
    })
    this._avatars = meta.seats.map((s, i) => (i === 0 ? '' : s.isAi ? '🤖' : '🙂'))
    // 多局联机：累计积分以服务端 meta.scores（视角座位口径，已旋转）为唯一口径，
    // 每帧都同步，进桌即显示跨局累计分；破产座位同理以服务端为准。
    if (Array.isArray(meta.scores) && meta.scores.length === 4) {
      this.scores = meta.scores.map(n => Math.round(Number(n) || 0))
    }
    if (Array.isArray(meta.bankruptSeats) && meta.bankruptSeats.length) {
      this.bankruptSeats = meta.bankruptSeats.slice()
    }
  }

  /** 服务端是本局计时权威：按 deadlineAt 显示剩余秒数（用 serverTime 校正时钟偏差） */
  startCountdown() {
    this.stopCountdown()
    this._countdownTimer = setInterval(() => this.renderCountdown(), 250)
    this.renderCountdown()
  }

  stopCountdown() {
    if (this._countdownTimer) clearInterval(this._countdownTimer)
    this._countdownTimer = null
    if (this._els.countdown) {
      this._els.countdown.textContent = ''
      this._els.countdown.hidden = true
    }
  }

  renderCountdown() {
    const el = this._els.countdown
    if (!el) return
    const v = this.view
    const meta = v && v.meta
    if (!this.isOnline || !meta || !meta.deadlineAt || v.phase === 'finished' || !v.legal || !v.legal.length) {
      el.textContent = ''
      el.hidden = true
      return
    }
    const left = Math.max(0, Math.round((meta.deadlineAt - (Date.now() - this._clockSkew)) / 1000))
    el.hidden = false
    el.textContent = '⏳ ' + left + 's'
    el.classList.toggle('scmj-countdown-urgent', left <= 5)
  }

  // ==================== 对局控制 ====================

  startGame(opts = {}) {
    if (this.game && this.game.dispose) this.game.dispose()
    // 单机模式：撤掉联机状态与倒计时（从大厅回来时可能还留着）
    this.stopCountdown()
    this.isOnline = false
    this.net = null
    this.saveSettings()
    this.selectedIdx = null
    this.swapPickIdxs = []
    this._discLens = [0, 0, 0, 0] // 新对局：弃牌计数归零，保证第一张起就滚到末尾
    // 会话：开始游戏 = 新会话（每人 100 分重新起算）；继续上局 = 沿用存档
    if (opts.save) this.restoreSession()
    else this.resetSession()
    const gameOpts = {
      aiLevel: this.aiLevel,
      session: { round: this.round },
      rules: { capFan: this.settings.capFan, swapThree: this.settings.swapThree, yaojiEnabled: this.settings.yaojiEnabled }, // 入口选择的规则
      onEvent: ev => this.onGameEvent(ev)
    }
    if (opts.save && opts.save.state) gameOpts.restoreState = opts.save.state
    this.game = this.createLocalGame(gameOpts)
    this.syncSession()
    this.showTable()
    this.enterFullscreen()
    this.render()
    this.sound('deal')
    if (!opts.save) this.playOpening() // 新开局：掷骰仪式（继续上局不重放）
  }

  // ==================== 开局掷骰 ====================
  // 首局：点数定庄；后续局：点数定摸排起点（庄家跨局不变）。
  // 点数由 adapter 依 seed 与局号派生，仅用于表现与摸牌起点，
  // 不参与任何牌权/番型判定。

  makeDie(value) {
    const die = document.createElement('div')
    die.className = 'scmj-die'
    const on = PIP_MAP[value] || []
    for (let i = 0; i < 9; i++) {
      const pip = document.createElement('span')
      pip.className = 'scmj-pip' + (on.indexOf(i) >= 0 ? ' scmj-pip-on' : '')
      die.appendChild(pip)
    }
    return die
  }

  playOpening() {
    const e = this._els
    if (!e.dice || !e.dicePair || !this.game) return
    let info = null
    try {
      info = this.game.opening ? this.game.opening() : null
    } catch (err) {
      info = null
    }
    const dealer = info && info.dealer != null ? info.dealer : this.view ? this.view.dealer : 0
    const dice = info && info.dice ? info.dice : [1, 1]
    const mode = info && info.mode ? info.mode : 'dealer'
    const round = info && info.round != null ? info.round : this.round
    const startSeat = info && info.startSeat != null ? info.startSeat : dealer
    if (e.diceTitle) e.diceTitle.textContent = mode === 'dealer' ? '掷骰定庄' : '掷骰定摸排起点'
    clearInterval(this._diceTimer)
    clearTimeout(this._diceHideTimer)
    e.dicePair.innerHTML = ''
    const d1 = this.makeDie(dice[0])
    const d2 = this.makeDie(dice[1])
    e.dicePair.appendChild(d1)
    e.dicePair.appendChild(d2)
    e.diceMsg.textContent = ''
    e.dice.hidden = false
    // 强制回流后再加 show，保证过渡动画生效
    void e.dice.offsetWidth
    e.dice.classList.add('scmj-dice-show')
    this._diceVisible = true

    const settle = () => {
      clearInterval(this._diceTimer)
      this._diceTimer = null
      e.dicePair.innerHTML = ''
      e.dicePair.appendChild(this.makeDie(dice[0]))
      e.dicePair.appendChild(this.makeDie(dice[1]))
      e.diceMsg.textContent =
        mode === 'dealer'
          ? '点数 ' + (dice[0] + dice[1]) + ' · ' + windOf(dealer, dealer) + '家坐庄（' + this._shorts[dealer] + '）'
          : '第 ' + round + ' 局 · 点数 ' + (dice[0] + dice[1]) + ' · 由 ' + windOf(startSeat, dealer) + '家方位起牌'
      this.sound('click')
      this._diceHideTimer = setTimeout(() => this.hideOpening(), this.settings.animation ? 1100 : 600)
    }

    if (!this.settings.animation) {
      settle()
      return
    }
    // 掷骰表现：随机滚动若干帧后落定（随机只影响过场帧，不影响结果）
    for (const die of [d1, d2]) die.classList.add('scmj-die-rolling')
    this._diceTimer = setInterval(() => {
      const faces = [1, 2, 3, 4, 5, 6]
      ;[d1, d2].forEach(d => {
        const v = faces[Math.floor(Math.random() * 6)]
        const pips = d.querySelectorAll('.scmj-pip')
        const on = PIP_MAP[v]
        pips.forEach((p, i) => p.classList.toggle('scmj-pip-on', on.indexOf(i) >= 0))
      })
    }, 90)
    this._diceSettleTimer = setTimeout(settle, 1100)
  }

  hideOpening() {
    clearInterval(this._diceTimer)
    clearTimeout(this._diceSettleTimer)
    clearTimeout(this._diceHideTimer)
    this._diceTimer = null
    this._diceSettleTimer = null
    this._diceHideTimer = null
    const e = this._els
    if (!e.dice) return
    e.dice.classList.remove('scmj-dice-show')
    this._diceVisible = false
    setTimeout(() => {
      if (!this._diceVisible && e.dice) e.dice.hidden = true
    }, 240)
  }

  // 全屏沉浸模式：CSS fixed 占满视口；触屏设备再尝试原生全屏隐藏浏览器地址栏
  // 注意：主题容器 .theme-reco-content 带 transform，fixed 会被限制在其内部，
  // 因此全屏期间把根节点临时移挂到 body 下，退出时还原到原位置。
  enterFullscreen() {
    if (!this._reparented && this.root.parentElement && this.root.parentElement !== document.body) {
      this._placeholder = document.createComment('scmj-anchor')
      this.root.parentElement.insertBefore(this._placeholder, this.root)
      document.body.appendChild(this.root)
      this._reparented = true
    }
    this.root.classList.add('scmj-fullscreen')
    if (typeof document !== 'undefined' && document.body) document.body.classList.add('scmj-lock')
    try {
      const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches
      if (coarse && !document.fullscreenElement && !document.webkitFullscreenElement) {
        const req = this.root.requestFullscreen || this.root.webkitRequestFullscreen
        if (req) {
          const p = req.call(this.root)
          if (p && p.catch) p.catch(() => { /* 用户拒绝或不支持则仅用 CSS 全屏 */ })
        }
      }
    } catch (e) { /* 不支持则仅使用 CSS 全屏 */ }
  }

  exitFullscreen() {
    if (this._reparented && this._placeholder && this._placeholder.parentElement) {
      this._placeholder.parentElement.insertBefore(this.root, this._placeholder)
      if (this._placeholder.remove) this._placeholder.remove()
    }
    this._reparented = false
    this._placeholder = null
    this.root.classList.remove('scmj-fullscreen')
    if (typeof document !== 'undefined' && document.body) document.body.classList.remove('scmj-lock')
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        if (exit) {
          const p = exit.call(document)
          if (p && p.catch) p.catch(() => { /* 忽略 */ })
        }
      }
    } catch (e) { /* 忽略 */ }
  }

  onGameEvent(ev) {
    // 碰/杠/胡结果浮层（只表现结果，不做长过场）
    if (ev && ev.seat != null && (ev.type === 'peng' || ev.type === 'gang' || ev.type === 'hu')) {
      const verb = ev.type === 'peng' ? '碰' : ev.type === 'gang' ? '杠' : '胡'
      this.float((ev.seat === 0 ? '你' : this._shorts[ev.seat]) + ' · ' + verb + '！')
      // 杠特效：明杠 / 补杠「刮风」、暗杠「下雨」，约 1s
      if (ev.type === 'gang') this.gangFx(ev.data && ev.data.gangType)
    }
    if (ev && ev.type === 'discard') this.sound('discard')
    else if (ev && (ev.type === 'peng' || ev.type === 'draw')) this.sound('draw')
    else if (ev && ev.type === 'gang') this.sound('gang')
    else if (ev && ev.type === 'hu') this.sound('hu')
    // 全量重渲染：数据量小，简单可靠
    this.render()
  }

  act(payload) {
    if (!this.game) return { ok: false }
    const res = this.game.dispatch(Object.assign({ seat: 0 }, payload))
    if (res.ok) {
      this.selectedIdx = null // 动作成功后手牌可能变化，清除选中避免下标越界
    } else {
      this.toast(ERROR_HINTS[res.error] || '操作无效')
    }
    this.render()
    return res
  }

  onExit() {
    // 联机退出 = 明确 LEAVE（永久退出，座位交由 AI 托管或释放），与断线严格区分
    if (this.isOnline) return this.onOnlineExit()
    this.confirm('退出本局？进度将自动保存，可从首页“继续上局”恢复。', () => {
      this.saveGame()
      if (this.game && this.game.dispose) this.game.dispose()
      this.game = null
      this.view = null
      this.hideOpening()
      this.showEntry()
      this.exitFullscreen()
      this.refreshEntry()
    })
  }

  goHome() {
    const path = '/blogs/other/games/'
    if (this.router && this.router.push) {
      this.router.push(path)
      return
    }
    location.href = path
  }

  onRestart() {
    localStorage.removeItem(SAVE_KEY)
    // 下一局：局号 +1、积分跨局保留（本局 delta 已在结算时入账）
    this.round += 1
    this._roundSettled = false
    // 下局庄家：谁先胡谁坐庄；一炮多响时点炮者坐庄；流局庄家留任
    const prevDealer = this.view ? this.view.dealer : null
    const nextDealer = this.nextDealerOf(this.view)
    // 连庄：同一座位继续坐庄则连庄轮数 +1，否则重新计 1
    if (prevDealer != null && nextDealer === prevDealer && this.streakSeat === nextDealer) {
      this.streakCount += 1
    } else {
      this.streakSeat = nextDealer
      this.streakCount = 1
    }
    this.saveSession()
    if (this.game) {
      this.game.restart({
        aiLevel: this.aiLevel,
        round: this.round,
        dealer: nextDealer,
        rules: { capFan: this.settings.capFan, swapThree: this.settings.swapThree, yaojiEnabled: this.settings.yaojiEnabled }
      })
    }
    this.syncSession()
    this.selectedIdx = null
    this.swapPickIdxs = []
    this.render()
    this.refreshEntry()
    this.sound('deal')
    this.playOpening() // 再来一局：掷骰决定摸排起点
  }

  // ==================== 渲染总入口 ====================

  render() {
    if (this._destroyed || !this.game) return
    if (!this._els.table || !this._els.hand) return // 关键 DOM 缺失（旧缓存页），mount 已警告
    const v = this.game.view()
    if (!v) return
    this.view = v
    // 选区只在对应阶段有意义：换三张以外清掉换三张选牌；不是自己出牌时清掉出牌选中。
    // 否则阶段切换（换三张由超时 / 服务端代选、出现响应窗口、换局……）会留下「抬起」
    // 的牌——定缺阶段既不响应点击也无法取消选中，看起来就是永远放不回去。
    if (v.phase !== 'swap') this.swapPickIdxs = []
    const discardOpt = v.legal.find(o => o.type === 'discard')
    if (!discardOpt) {
      this.selectedIdx = null
    } else if (this.selectedIdx != null) {
      const sel = this.mergedHand()[this.selectedIdx]
      if (!sel || discardOpt.tiles.indexOf(sel.id) < 0) this.selectedIdx = null
    }
    // 联机：座位名/头像/积分以服务端快照为准，并记录服务端时钟偏差供倒计时使用
    if (v.meta && v.meta.serverTime) this._clockSkew = Date.now() - v.meta.serverTime
    this.applyOnlineMeta(v)
    this.hideSeatPop() // 状态已变，详情弹层内容会过期，先收起
    if (v.results) this.settleRound(v) // 本局积分一次性入账（跨局累计），先入账再渲染
    this.renderSeats(v)
    this.renderCenter(v)
    this.renderWallRing(v)
    this.renderDiscards(v)
    this.renderMelds(v)
    this.renderHand(v)
    this.renderActions(v)
    this.renderHints(v)
    // 弃牌 / 副露 / 手牌 / 操作栏的高度变化都会改变中央行可用高度：
    // 全部渲染完再量一次，牌墙不会按上一帧尺寸绘制（避免「一会儿大一会儿小」）
    this.fitCenterBox()
    this.fitWallRing()
    if (v.results) {
      this.renderSettlement(v)
      localStorage.removeItem(SAVE_KEY) // 对局结束，清掉存档
      this.refreshEntry()
    } else {
      this._els.settle.hidden = true
      // 联机牌局状态由服务端持有，不写本地存档（避免「继续上局」误入联机残局）
      if (!this.isOnline) this.saveGame()
    }
    this.renderCountdown()
  }

  // ---------- 三个 AI 面板（上/左/右三个方向） ----------
  // 精简面板：方位角标 + 头像 + 名字 + 积分一行，点击弹详情；
  // 副露用牌面小图排在面板下方，定缺阶段未选者显示「定缺中…」浮字。
  renderSeats(v) {
    for (const s of [1, 2, 3]) {
      const el = this._els['seat' + s]
      if (!el) continue // 缺失防御：跳过该座位而不是整桌崩溃（mount 已警告）
      const p = v.players[s]
      el.innerHTML = ''
      el.classList.toggle('scmj-seat-active', v.turn === s && v.phase !== 'finished')
      el.classList.toggle('scmj-seat-hu', !!p.hu)
      el.title = '点击查看 ' + this._labels[s] + ' 的详情'
      // 头上角标：定缺后显示该家缺门（缺万/缺筒/缺条），未定时显示风位 + 桌面方位。
      // 缺门是公开信息，比「左/西」这类方位更实用。
      if (p.void != null) {
        const voidTag = document.createElement('div')
        voidTag.className = 'scmj-voidtag scmj-voidtag-' + p.void
        voidTag.textContent = '缺' + SUIT_NAMES[p.void]
        voidTag.title = this._shorts[s] + ' 缺' + SUIT_NAMES[p.void] + '（整局公开）'
        el.appendChild(voidTag)
      } else {
        const wind = document.createElement('div')
        wind.className = 'scmj-windtag' + (v.dealer === s ? ' scmj-windtag-dealer' : '')
        const windCh = document.createElement('span')
        windCh.textContent = windOf(s, v.dealer)
        wind.appendChild(windCh)
        const windPos = document.createElement('span')
        windPos.className = 'scmj-windtag-pos'
        windPos.textContent = SEAT_POS[s]
        wind.appendChild(windPos)
        wind.title = windOf(s, v.dealer) + '家' + (v.dealer === s ? '（庄家）' : '') + ' · 座位在牌桌' + SEAT_POS[s] + '方位'
        el.appendChild(wind)
      }
      const av = document.createElement('div')
      av.className = 'scmj-avatar'
      av.textContent = this._avatars[s]
      // 手牌数角标：常驻显示，一眼看出对手手里还剩几张、有没有在憋大牌
      const handBadge = document.createElement('span')
      handBadge.className = 'scmj-seat-hand'
      handBadge.textContent = p.handCount
      handBadge.title =
        this._shorts[s] + ' 手牌 ' + p.handCount + ' 张' +
        (p.melds.length ? '，已副露 ' + p.melds.length + ' 组' : '') +
        '（张数越少越接近听牌）'
      av.appendChild(handBadge)
      el.appendChild(av)
      const meta = document.createElement('div')
      meta.className = 'scmj-seat-meta'
      const name = document.createElement('div')
      name.className = 'scmj-seat-name'
      name.textContent = this._shorts[s]
      meta.appendChild(name)
      const score = document.createElement('div')
      score.className = 'scmj-seat-score'
      score.textContent = '💰' + this.scores[s]
      meta.appendChild(score)
      el.appendChild(meta)
      // 连庄 >=3 轮挂 🔥 标；>=2 轮显示「连庄 xN」
      if (v.dealer === s && this.streakSeat === s && this.streakCount >= 2) {
        const streak = document.createElement('div')
        streak.className = 'scmj-streak' + (this.streakCount >= 3 ? ' scmj-streak-hot' : '')
        streak.textContent = (this.streakCount >= 3 ? '🔥' : '') + '连庄x' + this.streakCount
        streak.title = this._shorts[s] + ' 已连续坐庄 ' + this.streakCount + ' 轮'
        el.appendChild(streak)
      }
      // 已胡/行动中用小角标提示（不再整排徽章占空间）
      if (p.hu) {
        const hu = document.createElement('div')
        hu.className = 'scmj-seat-flag scmj-seat-flag-hu'
        hu.textContent = '已胡'
        hu.title = '已胡 · ' + (p.hu.names || []).join('')
        el.appendChild(hu)
      } else if (v.turn === s && v.phase !== 'finished') {
        const act = document.createElement('div')
        act.className = 'scmj-seat-flag'
        act.textContent = '…'
        act.title = '行动中'
        el.appendChild(act)
      }
      // 副露整组显示：与自己一侧完全一致的「碰 3 张 / 杠 4 张 + 标签」
      const meldRow = this._els['seatMelds' + s]
      if (meldRow) {
        meldRow.innerHTML = ''
        p.melds.forEach(m => meldRow.appendChild(this.makeMeldGroup(m)))
        // 胡牌那张捡到胡牌者自己一侧，金框高亮标出是哪一张
        if (p.hu && p.hu.winTile != null) meldRow.appendChild(this.makeWinMeld(p.hu))
      }
      // 定缺阶段未选花色者：面板旁浮字「定缺中…」
      const pend = this._els['seatPend' + s]
      if (pend) {
        const waitingVoid = v.phase === 'void' && !p.hu && p.void == null
        pend.textContent = waitingVoid ? '定缺中…' : ''
        pend.hidden = !waitingVoid
      }
    }
  }

  // ---------- 对手详情弹层（点击头像查看） ----------
  showSeatPop(s) {
    const pop = this._els.pop
    if (!pop || !this.view) return
    const v = this.view
    const p = v.players[s]
    if (!p) return
    this.sound('click')
    const body = pop.querySelector('[data-scmj-pop-body]')
    const title = pop.querySelector('[data-scmj-pop-title]')
    if (title) {
      title.textContent =
        windOf(s, v.dealer) + '家 · ' + this._labels[s] + (v.dealer === s ? '（庄家）' : '')
    }
    if (body) {
      const rows = []
      rows.push('<div class="scmj-pop-row"><span>累计积分</span><b>' + this.scores[s] + '</b></div>')
      rows.push(
        '<div class="scmj-pop-row"><span>本局得失</span><b class="scmj-delta-' +
          (p.delta > 0 ? 'pos' : p.delta < 0 ? 'neg' : 'zero') + '">' + fmtDelta(p.delta || 0) + '</b></div>'
      )
      rows.push('<div class="scmj-pop-row"><span>手牌</span><b>' + p.handCount + ' 张</b></div>')
      rows.push('<div class="scmj-pop-row"><span>缺门</span><b>' + (p.void ? SUIT_NAMES[p.void] : '未定') + '</b></div>')
      if (v.dealer === s && this.streakSeat === s && this.streakCount >= 2) {
        rows.push('<div class="scmj-pop-row"><span>连庄</span><b>' + this.streakCount + ' 轮</b></div>')
      }
      const melds = p.melds.length
        ? p.melds.map(m => (m.kind === 'peng' ? '碰' : (GANG_NAMES[m.gangType] || '') + '杠') + tileName(m.tile)).join('、')
        : '无'
      rows.push('<div class="scmj-pop-row"><span>副露</span><b>' + melds + '</b></div>')
      rows.push('<div class="scmj-pop-row"><span>弃牌</span><b>' + p.discards.length + ' 张</b></div>')
      if (p.hu) {
        rows.push(
          '<div class="scmj-pop-row"><span>胡牌</span><b>' + (HOW_NAMES[p.hu.how] || '') + ' · ' +
            (p.hu.names || []).join('') + '（' + p.hu.fan + ' 番）</b></div>'
        )
      }
      body.innerHTML = rows.join('')
    }
    pop.hidden = false
  }

  hideSeatPop() {
    if (this._els.pop) this._els.pop.hidden = true
  }

  // ---------- 方位罗盘（上=对家 右=下家 下=自己 左=上家） ----------
  renderCompass(v) {
    const el = this._els.compass
    if (!el) return
    el.innerHTML = ''
    const core = document.createElement('div')
    core.className = 'scmj-compass-core'
    core.textContent = '方位'
    el.appendChild(core)
    const layout = [
      { seat: 2, pos: 'top' },
      { seat: 1, pos: 'right' },
      { seat: 0, pos: 'bottom' },
      { seat: 3, pos: 'left' }
    ]
    layout.forEach(item => {
      const s = item.seat
      const w = document.createElement('div')
      let cls = 'scmj-wind scmj-wind-' + item.pos
      if (v.turn === s && v.phase !== 'finished') cls += ' scmj-wind-turn'
      if (s === 0) cls += ' scmj-wind-me'
      if (v.dealer === s) cls += ' scmj-wind-dealer'
      w.className = cls
      w.title =
        windOf(s, v.dealer) + '家 · ' + this._labels[s] + (v.dealer === s ? ' · 庄家' : '')
      const ch = document.createElement('span')
      ch.textContent = windOf(s, v.dealer)
      w.appendChild(ch)
      const sub = document.createElement('span')
      sub.className = 'scmj-wind-seat'
      sub.textContent = this._shorts[s]
      w.appendChild(sub)
      el.appendChild(w)
    })
  }

  // ---------- 中央信息 ----------
  renderCenter(v) {
    this.fitCenterBox() // 中央面板恒为正方形，尺寸依赖中央区实际宽高
    this._els.wall.textContent = v.wallCount
    if (this._els.roundChip) {
      this._els.roundChip.textContent = this.isOnline
        ? '房间 ' + ((this.onlineRoom && this.onlineRoom.roomCode) || '') + ' · 你 ' + this.scores[0] + ' 分'
        : '第 ' + this.round + ' 局 · 你 ' + this.scores[0] + ' 分'
    }
    this.renderCompass(v)
    let turnText
    if (v.phase === 'finished') {
      turnText = '本局结束'
    } else {
      turnText =
        '行动：' + windOf(v.turn, v.dealer) + '家 · ' + this._labels[v.turn] +
        '（' + (PHASE_NAMES[v.phase] || v.phase) + '）'
      if (v.phase === 'respond' && v.waiting && v.waiting.length) {
        turnText += ' · 等待 ' + v.waiting.map(s => this._shorts[s]).join('、') + ' 表态'
      }
    }
    this._els.turn.textContent = turnText
    const latest = this._els.latest
    if (v.pendingDiscard) {
      latest.textContent = '最新出牌：' + this._shorts[v.pendingDiscard.seat] + ' · ' + tileName(v.pendingDiscard.tile)
    } else if (v.my && v.my.drawnTile != null) {
      latest.textContent = '你摸到了「' + tileName(v.my.drawnTile) + '」'
    } else {
      latest.textContent = ''
    }
  }

  /**
   * 中央面板恒为正方形：边长取中间行（.scmj-centerslot）可用宽高的较小值并居中。
   * 信息条 / 最新动态在面板外独占整行，因此面板拿到的是“文字之外的全部空间”，
   * 横屏时不会被文字换行挤成一条缝。正方形写在内部 .scmj-centerbox 上，
   * 横屏时不会跟着中央区一起被拉成长方形。
   */
  fitCenterBox() {
    const slot = this._els.centerslot
    const box = this._els.centerbox
    if (!slot || !box) return
    const w = slot.clientWidth
    const h = slot.clientHeight
    if (!w || !h) return
    const size = Math.max(0, Math.min(w, h))
    if (!size) return
    box.style.width = size + 'px'
    box.style.height = size + 'px'
    // 横屏矮屏把信息/最新动态做成中央区左右浮层，这里把正方形边长暴露给 CSS，
    // 浮层宽度按「(中央区宽 - 边长) / 2」收敛，窄屏也不会压到牌墙上。
    const center = this._els.center
    if (center) center.style.setProperty('--scmj-square', size + 'px')
  }

  /**
   * 牌墙恒为正方形：取牌墙盒（正方形面板内）可用宽高的较小值作为边长居中，
   * 并按边长反推单张牌背尺寸（写入 CSS 变量），保证每边铺得下、不被裁切。
   * 牌背是真实牌张（back.png，竖版），长边一律顺着墙走（横躺 = 贴图转 90°）：
   *   上下墙（横向墙）牌横躺：沿 X 排 7 摞，2 行 = 两层牌深；
   *   左右墙（纵向墙）牌竖放：沿 Y 排 7 摞，2 列 = 两层牌深。
   * 这样每张牌沿墙方向占「一张牌高」，四边摞距一致、整条边看起来是连续的一条；
   * 径向占「一张牌宽」，四条边等厚 = 两层牌深 = 2×牌宽 + 缝。故
   *   边长 = 2×内缩 + 7×牌高 + 6×缝，内缩 = 2×牌宽 + 缝
   *        = 4×牌宽 + 7×牌高 + 8×缝
   * 牌宽 = 牌高 / TILE_ASPECT，回代反推牌高（取整向下，保证任何边长下都不溢出）。
   */
  fitWallRing() {
    const ring = this._els.wallring
    const box = this._els.wallbox
    if (!ring || !box) return
    const w = box.clientWidth
    const h = box.clientHeight
    if (!w || !h) return
    const size = Math.min(w, h)
    const COLS = 7 // 每边可见 7 摞（每摞 2 张 = 两层牌深）
    const GAP = 1 // 牌间 1px 缝
    // 边长 = 4×牌宽 + 7×牌高 + 8×缝（见上方推导），牌宽 = 牌高 / TILE_ASPECT，
    // 故 牌高 = (边长 - 8×缝) / (7 + 4 / TILE_ASPECT)；牌宽向下取整，保证不溢出。
    const tileH = Math.max(8, Math.floor((size - 8 * GAP) / (COLS + 4 / TILE_ASPECT)))
    const tileW = Math.max(5, Math.floor(tileH / TILE_ASPECT))
    const inset = 2 * tileW + GAP
    // 罗盘（含探出的风位圆牌）同比缩放，限制在内圈里且封顶 104px
    const inner = Math.max(0, size - 2 * inset)
    const compass = Math.max(40, Math.min(104, Math.round(size * 0.62), inner))
    const left = Math.round((w - size) / 2)
    const top = Math.round((h - size) / 2)
    ring.style.left = left + 'px'
    ring.style.top = top + 'px'
    ring.style.width = size + 'px'
    ring.style.height = size + 'px'
    // 变量挂在牌墙盒上，供牌背与罗盘（子元素）按同一边长取尺寸
    box.style.setProperty('--scmj-wall-tile-w', tileW + 'px')
    box.style.setProperty('--scmj-wall-tile-h', tileH + 'px')
    box.style.setProperty('--scmj-wall-inset', inset + 'px')
    box.style.setProperty('--scmj-compass-size', compass + 'px')
  }

  // ---------- 中央牌墙（四方围一圈双层牌背，摸一张少一张） ----------
  // 只依赖 view.wallCount（不泄露墙序）。掷骰在起点方位（wallHead）墙内
  // 第 wallOpenOff 个牌位开牌，摸牌从开牌点起沿环序逐张吃掉——缺口
  // 从骰子点开的那一方中部出现并转圈扩大，被摸走的牌位留空不位移。
  renderWallRing(v) {
    this.fitWallRing() // 牌墙正方形尺寸依赖中央区实际宽高
    const mask = ringMask(v.wallCount, this.wallHead, this.wallOpenOff)
    // 环序 = 出牌顺序「下→右→上→左」，掩码下标沿此环序递增，缺口从开牌点
    // 起顺着牌桌转圈扩大。右/上两边的 DOM 排布方向（右：上→下；上：左→右）
    // 与环序相反，需要对位反向，否则缺口会在边上反向生长、看起来在四边乱跳。
    // 四边都竖着显示牌背（真实牌张），不再区分横躺/竖躺，故只保留对位反向标记
    const sides = [
      [this._els.wallringBottom, mask[0], false], // 座位0 = 自己(下)
      [this._els.wallringRight, mask[1], true], // 座位1 = 右(下家)
      [this._els.wallringTop, mask[2], true], // 座位2 = 上(对家)
      [this._els.wallringLeft, mask[3], false] // 座位3 = 左(上家)
    ]
    for (const [el, slots, reverse] of sides) {
      if (!el) continue
      // 每边固定渲染 14 个牌位：有牌显示牌背，被摸走的位置留空位
      // （visibility 占位，剩余牌不位移，缺口位置就是开牌与消耗轨迹）
      while (el.childElementCount > slots.length) el.removeChild(el.lastElementChild)
      while (el.childElementCount < slots.length) {
        const back = document.createElement('i')
        back.className = 'scmj-wallback'
        el.appendChild(back)
      }
      for (let i = 0; i < slots.length; i++) {
        const slot = reverse ? slots[slots.length - 1 - i] : slots[i]
        el.children[i].classList.toggle('scmj-wallback-gap', !slot)
      }
    }
  }

  // ---------- 四方向弃牌区 ----------
  renderDiscards(v) {
    for (let s = 0; s < 4; s++) {
      const wrap = this._els['discTiles' + s]
      wrap.innerHTML = ''
      const list = v.players[s].discards
      list.forEach((id, i) => {
        const t = this.makeTile(id, 'disc')
        if (
          this.settings.animation &&
          v.pendingDiscard &&
          v.pendingDiscard.seat === s &&
          i === list.length - 1
        ) {
          t.classList.add('scmj-tile-new') // 出牌滑入弃牌区（只表现结果）
        }
        wrap.appendChild(t)
      })
      // 窄屏弃牌区靠滚动容纳更多牌，新牌在末尾：仅在牌数增加时滚到末尾，
      // 用户回看历史时不强行拉回
      const grew = list.length > (this._discLens[s] || 0)
      this._discLens[s] = list.length
      if (grew) {
        wrap.scrollTop = wrap.scrollHeight
        wrap.scrollLeft = wrap.scrollWidth
      }
    }
  }

  // ---------- 副露（自己与对手共用同一套整组渲染） ----------
  renderMelds(v) {
    const el = this._els.mymelds
    el.innerHTML = ''
    const melds = (v.my && v.my.melds) || []
    melds.forEach(m => el.appendChild(this.makeMeldGroup(m)))
    // 自己胡牌：胡的那张同样捡到副露区末尾并高亮
    if (v.my && v.my.hu && v.my.hu.winTile != null) el.appendChild(this.makeWinMeld(v.my.hu))
  }

  /** 副露整组：碰 3 张 / 杠 4 张 + 标签（碰 / 明杠 / 暗杠 / 补杠），自己与对手一致 */
  makeMeldGroup(m) {
    const g = document.createElement('div')
    g.className = 'scmj-meld'
    const n = m.kind === 'peng' ? 3 : 4
    const kindText = m.kind === 'peng' ? '碰' : (GANG_NAMES[m.gangType] || '') + '杠'
    // 幺鸡局里碰/杠可用幺鸡补位：真牌 (n - wild) 张 + 幺鸡 wild 张
    const wild = Math.max(0, Math.min(n, m.wild || 0))
    for (let i = 0; i < n - wild; i++) {
      const t = this.makeTile(m.tile, 'disc')
      t.title = kindText + ' ' + tileName(m.tile)
      g.appendChild(t)
    }
    for (let i = 0; i < wild; i++) {
      const t = this.makeTile(YAOJI_TILE, 'disc')
      t.classList.add('scmj-tile-wild')
      t.appendChild(this.makeWildMark())
      t.title = kindText + ' ' + tileName(m.tile) + '（幺鸡赖子补位）'
      g.appendChild(t)
    }
    const tag = document.createElement('span')
    tag.className = 'scmj-meld-tag'
    tag.textContent = kindText + (wild > 0 ? '赖' : '')
    g.appendChild(tag)
    g.title =
      kindText + ' ' + tileName(m.tile) + '（' + n + ' 张' +
      (wild > 0 ? '，含 ' + wild + ' 只幺鸡' : '') + '）'
    return g
  }

  /** 胡牌那张牌：金框高亮 +「胡」标，放在胡牌者自己一侧的副露区 */
  makeWinMeld(hu) {
    const g = document.createElement('div')
    g.className = 'scmj-meld scmj-meld-win'
    const t = this.makeTile(hu.winTile, 'disc')
    t.title =
      '胡牌：' + tileName(hu.winTile) +
      (hu.names && hu.names.length ? '（' + hu.names.join(' + ') + '）' : '')
    const tag = document.createElement('span')
    tag.className = 'scmj-meld-tag'
    tag.textContent = '胡'
    g.appendChild(t)
    g.appendChild(tag)
    return g
  }

  // ---------- 手牌 ----------
  mergedHand() {
    const my = this.view.my
    const arr = my.hand.map((id, i) => ({ id, idx: i, drawn: false }))
    if (my.drawnTile != null) arr.push({ id: my.drawnTile, idx: arr.length, drawn: true })
    return arr
  }

  makeTile(id, size) {
    const t = document.createElement('div')
    t.className = 'scmj-tile scmj-tile-' + size
    t.appendChild(this.makeTileImage(id))
    return t
  }

  // 牌面贴图（透明背景 PNG，alt 保留中文牌名便于无障碍/加载失败兜底）
  makeTileImage(id) {
    const img = document.createElement('img')
    img.className = 'scmj-tile-img'
    img.src = tileImageSrc(id)
    img.alt = tileName(id)
    img.draggable = false
    return img
  }

  /** 幺鸡赖子角标（右上角金色「赖」，样式与缺门红角标一致） */
  makeWildMark() {
    const mark = document.createElement('span')
    mark.className = 'scmj-tile-wildmark'
    mark.textContent = '赖'
    return mark
  }

  renderHand(v) {
    const el = this._els.hand
    el.innerHTML = ''
    const merged = this.mergedHand()
    const discardOpt = v.legal.find(o => o.type === 'discard')
    const legalTiles = discardOpt ? discardOpt.tiles : null
    const swapMode = v.phase === 'swap'
    merged.forEach(t => {
      const b = document.createElement('button')
      b.type = 'button'
      let cls = 'scmj-tile scmj-tile-hand'
      if (t.drawn) cls += ' scmj-tile-drawn' // 新摸的牌与原手牌留间距
      if (this.selectedIdx === t.idx || this.swapPickIdxs.indexOf(t.idx) >= 0) cls += ' scmj-tile-selected'
      if (legalTiles && !swapMode && legalTiles.indexOf(t.id) < 0) cls += ' scmj-tile-disabled'
      b.className = cls
      b.setAttribute('aria-label', tileName(t.id))
      // 幺鸡局：幺鸡是赖子（万能牌），标金色「赖」角标；否则按缺门标红「缺」
      const isWild = v.yaoji && t.id === YAOJI_TILE
      if (isWild) {
        b.classList.add('scmj-tile-wildsuit')
        b.appendChild(this.makeWildMark())
      } else if (v.my.void && tileSuit(t.id) === v.my.void) {
        b.classList.add('scmj-tile-voidsuit')
        const mark = document.createElement('span')
        mark.className = 'scmj-tile-voidmark'
        mark.textContent = '缺'
        b.appendChild(mark)
      }
      b.appendChild(this.makeTileImage(t.id))
      b.addEventListener('click', () => this.onHandTile(t.idx, t.id))
      el.appendChild(b)
    })
  }

  onHandTile(idx, tileId) {
    if (!this.view) return
    const v = this.view
    this.sound('click')
    // 换三张：选 3 张同花色
    if (v.phase === 'swap') {
      if (!v.legal.some(o => o.type === 'swap')) return this.toast('已选好换牌，等待其他玩家…')
      const i = this.swapPickIdxs.indexOf(idx)
      if (i >= 0) {
        this.swapPickIdxs.splice(i, 1)
      } else {
        if (this.swapPickIdxs.length >= 3) return this.toast('最多选择 3 张')
        const merged = this.mergedHand()
        const suit = tileSuit(tileId)
        for (const j of this.swapPickIdxs) {
          if (tileSuit(merged[j].id) !== suit) return this.toast('换三张需选择 3 张同花色的牌')
        }
        this.swapPickIdxs.push(idx)
      }
      this.renderHand(v)
      this.renderActions(v)
      return
    }
    if (v.phase === 'void') return this.toast('请先在上方选择定缺花色')
    if (v.my.hu) return this.toast('你已胡牌，继续观战，牌桌继续血战')
    const canDiscard = v.legal.some(o => o.type === 'discard')
    if (!canDiscard) {
      if (v.phase === 'respond') return this.toast('现在是响应阶段，请先选择 碰/杠/胡 或 过')
      return this.toast('还没轮到你出牌')
    }
    const opt = v.legal.find(o => o.type === 'discard')
    if (opt.tiles.indexOf(tileId) < 0) {
      // 不可打的牌：弱化显示 + 说明原因
      if (v.my.void && this.hasVoidLeft(v)) {
        return this.toast('还有缺门牌（' + SUIT_NAMES[v.my.void] + '）必须先打缺门')
      }
      return this.toast('这张牌现在不能打')
    }
    // 点击选中（高亮），再点一次确认，减少误触
    if (this.selectedIdx === idx) {
      this.confirmDiscard(idx)
    } else {
      this.selectedIdx = idx
      this.renderHand(v)
      this.renderActions(v)
    }
  }

  hasVoidLeft(v) {
    const full = v.my.hand.concat(v.my.drawnTile != null ? [v.my.drawnTile] : [])
    return full.some(t => tileSuit(t) === v.my.void)
  }

  confirmDiscard(idx) {
    const merged = this.mergedHand()
    const picked = merged[idx]
    if (!picked) return // 防御：选中下标已失效（手牌已变化）
    const tile = picked.id
    const canHu = this.view.legal.some(o => o.type === 'hu')
    const doIt = () => {
      this.selectedIdx = null
      this.act({ type: 'discard', tile })
    }
    // 能胡时打出 = 过胡，可配置二次确认（默认开）
    if (canHu && this.settings.passHuConfirm) {
      this.confirm('当前可以胡牌，确定打出「' + tileName(tile) + '」放弃胡牌吗？', doIt)
    } else {
      doIt()
    }
  }

  // ---------- 操作条（手牌上方，只渲染 legal 里出现的动作） ----------
  renderActions(v) {
    const bar = this._els.actions
    bar.innerHTML = ''
    const mkBtn = (text, cls, fn, disabled) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'scmj-btn scmj-action' + (cls ? ' ' + cls : '')
      b.textContent = text
      if (disabled) b.disabled = true
      b.addEventListener('click', fn)
      bar.appendChild(b)
      return b
    }
    const mkInfo = (text, explain) => {
      const s = document.createElement('span')
      // explain=true 为纯操作指引（竖屏下省略、横屏保留），状态类文案不标记
      s.className = 'scmj-action-info' + (explain ? ' scmj-action-explain' : '')
      s.textContent = text
      bar.appendChild(s)
    }
    // 换三张阶段
    if (v.phase === 'swap') {
      if (v.legal.some(o => o.type === 'swap')) {
        const n = this.swapPickIdxs.length
        const firstPick = n ? this.mergedHand()[this.swapPickIdxs[0]] : null
        const suitName = firstPick ? SUIT_NAMES[tileSuit(firstPick.id)] : ''
        mkInfo('换三张：已选 ' + n + '/3 张' + (n ? '（' + suitName + '）' : '') + '，须同花色')
        mkBtn('确认换牌', 'scmj-btn-primary', () => this.onSwapConfirm(), n !== 3)
      } else {
        mkInfo('已选好换牌，等待其他玩家…')
      }
      return
    }
    // 定缺阶段
    if (v.phase === 'void') {
      const opt = v.legal.find(o => o.type === 'void')
      if (opt) {
        mkInfo('定缺：选择一门花色作为缺门（优先打完）', true)
        opt.suits.forEach(su => {
          mkBtn('定缺 · ' + SUIT_NAMES[su], 'scmj-btn-void', () => {
            this.sound('click')
            this.act({ type: 'void', suit: su })
          })
        })
      } else {
        mkInfo('已定缺，等待其他玩家…')
      }
      return
    }
    // 常规动作
    const selTile = this.selectedIdx != null ? this.mergedHand()[this.selectedIdx] : null
    // 本回合除出牌外还允许碰/杠/胡：出牌是主路径，这些只是可选项，
    // 未选牌时必须给出指引，否则操作栏只剩「杠」按钮，玩家会误以为必须杠。
    const hasOptional = v.legal.some(o => o.type !== 'discard')
    // 更近的一家还没表态时，引擎给的 legal 只有「过」——那不是我的回合，是
    // 左家/对家优先叫牌。这个「过」不能渲染成可点按钮：玩家看到操作栏只有
    // 一个「过」会以为轮到自己，一点就把碰权送掉了。改成等待提示，等更近的
    // 一家叫完，重渲染时自然会出现「碰 / 过」。
    // 例外：能胡时 legal 里还有「胡」（胡不受叫牌顺序影响），此时「过」是
    // 「放弃这次胡」的正常选项，照旧保留。
    const awaitingSeats =
      v.phase === 'respond' && v.my && Array.isArray(v.my.awaitingNearer)
        ? v.my.awaitingNearer
        : []
    const waitingNearer = awaitingSeats.length > 0 && !v.legal.some(o => o.type === 'hu')
    let needDiscardHint = false
    for (const o of v.legal) {
      if (o.type === 'discard') {
        if (selTile && o.tiles.indexOf(selTile.id) >= 0) {
          mkBtn('出牌 · ' + tileName(selTile.id), 'scmj-btn-primary', () => this.confirmDiscard(this.selectedIdx))
        } else {
          // 指引放在按钮之后：横屏小屏操作栏横向滚动，放前面会把「出牌」挤出可视区
          needDiscardHint = true
        }
      } else if (o.type === 'peng') {
        mkBtn('碰 · ' + tileName(o.tile), 'scmj-btn-peng', () => this.act({ type: 'peng' }))
      } else if (o.type === 'gang') {
        // 多种杠时展开 options 逐项显示，不能一个按钮随便执行
        o.options.forEach(g => {
          mkBtn('杠 · ' + tileName(g.tile) + '（' + GANG_NAMES[g.gangType] + '）', 'scmj-btn-gang', () =>
            this.act({ type: 'gang', tile: g.tile, gangType: g.gangType })
          )
        })
      } else if (o.type === 'hu') {
        // 能胡时突出“胡”按钮（金色）
        mkBtn('胡！' + (o.how === 'zimo' ? '（自摸）' : ''), 'scmj-btn-hu', () => this.act({ type: 'hu' }))
      } else if (o.type === 'swap-yaoji') {
        // 幺鸡局：带幺鸡的明杠/暗杠，摸到对应真牌可换回幺鸡继续当赖子
        mkBtn('换幺鸡 · ' + tileName(o.tile), 'scmj-btn-peng', () =>
          this.act({ type: 'swap-yaoji', tile: o.tile })
        )
      } else if (o.type === 'pass') {
        if (waitingNearer) continue // 不是我的回合：不渲染可点的「过」（下面给等待提示）
        mkBtn('过', 'scmj-btn-pass', () => this.onPass())
      }
    }
    if (waitingNearer) {
      mkInfo('等待 ' + awaitingSeats.map(s2 => this._shorts[s2]).join('、') + ' 叫牌…')
    }
    if (!v.legal.length && v.phase !== 'finished') {
      if (v.my.hu) {
        mkInfo('你已胡牌（' + (v.my.hu.names || []).join(' + ') + '），继续观战，牌桌继续血战')
      } else {
        mkInfo('等待其他玩家…')
      }
    }
    if (needDiscardHint) {
      mkInfo(hasOptional ? '点选下方手牌出牌（杠可选，不杠即正常出牌）' : '点选下方手牌即可出牌', true)
    }
    // 过水提示：本巡已放弃过低番的炮，所以这次没给「胡」（自摸、番更大的炮照旧可胡）
    if (v.phase === 'respond' && v.my.passHu) {
      mkInfo('过水：本巡已放弃 ' + v.my.passHu.fan + ' 番的点炮胡，需更高番的炮或自摸才能胡', true)
    }
    // 横屏小屏时操作栏可横向滚动：每次重渲染回到最左，保证主要动作按钮可见
    bar.scrollLeft = 0
  }

  onSwapConfirm() {
    if (this.swapPickIdxs.length !== 3) return this.toast('请先选择 3 张同花色的牌')
    const merged = this.mergedHand()
    const picks = this.swapPickIdxs.map(i => merged[i])
    if (picks.some(p => !p)) return this.toast('所选牌已变化，请重新选择')
    const tiles = picks.map(p => p.id)
    const suits = tiles.map(tileSuit)
    if (suits.some(s => s !== suits[0])) return this.toast('换三张必须选择同花色')
    const res = this.act({ type: 'swap', tiles })
    if (res.ok) this.swapPickIdxs = []
  }

  onPass() {
    const canHu = this.view.legal.some(o => o.type === 'hu')
    const doIt = () => this.act({ type: 'pass' })
    // 过胡二次确认（设置里可关，默认开）
    if (canHu && this.settings.passHuConfirm) {
      this.confirm('确定放弃本次胡牌？', doIt)
    } else {
      doIt()
    }
  }

  // ---------- 听牌提示 + AI 建议 ----------
  renderHints(v) {
    // AI 辅助关闭：听牌提示与右侧出牌建议一并清空，交给玩家自己看牌。
    // 联机时以房规 assist 为准（房主建房时选），单机时用本地设置。
    const assistOn = this.isOnline ? this.onlineAssist !== false : this.settings.assist !== false
    if (!assistOn) {
      this._els.ting.innerHTML = ''
      this._els.suggest.textContent = ''
      return
    }
    // 听牌提示（依赖 adapter 的扩展字段 my.ting，未提供时隐藏）
    const tingEl = this._els.ting
    tingEl.innerHTML = ''
    if (v.my.hu) {
      const label = document.createElement('span')
      label.className = 'scmj-ting-label scmj-ting-hu'
      label.textContent = '已胡'
      const text = document.createElement('span')
      text.className = 'scmj-ting-text'
      text.textContent =
        (v.my.hu.names || []).join(' + ') + ' · ' + v.my.hu.fan + ' 番 · ' + fmtDelta(v.my.hu.scoreDelta) + ' 分'
      tingEl.appendChild(label)
      tingEl.appendChild(text)
    } else if (v.my.void && Array.isArray(v.my.ting) && v.my.ting.length) {
      const label = document.createElement('span')
      label.className = 'scmj-ting-label'
      label.textContent = '听牌'
      tingEl.appendChild(label)
      v.my.ting.forEach(id => {
        const chip = document.createElement('span')
        chip.className = 'scmj-ting-chip'
        // 只提示“还能摸到几张可胡”，不再显示已出张数（对玩家无意义）
        const left = Math.max(0, 4 - this.visibleCount(id, v))
        // 简约：1万（2）＝听 1万 还剩 2 张可摸
        chip.textContent = compactTileName(id) + '（' + left + '）'
        chip.title = '听 ' + tileName(id) + '，还剩 ' + left + ' 张'
        tingEl.appendChild(chip)
      })
      const fc = this.makeFanChip(v.my.fan)
      if (fc) tingEl.appendChild(fc)
    } else if (v.my.fan) {
      // 已杠 / 有副露但未听牌：显示当前手牌最大可能番数，方便判断做牌方向
      const label = document.createElement('span')
      label.className = 'scmj-ting-label'
      label.textContent = '牌型'
      tingEl.appendChild(label)
      const fc = this.makeFanChip(v.my.fan)
      if (fc) tingEl.appendChild(fc)
    }
    // AI 建议栏：只建议不代打
    const sug = this._els.suggest
    let s = null
    try {
      s = this.game.suggest ? this.game.suggest() : null
    } catch (e) {
      s = null
    }
    sug.textContent = s ? '💡 ' + s.text : ''
  }

  // 可见张数估算：基于公开弃牌 + 副露 + 自己手牌
  visibleCount(id, v) {
    let n = 0
    v.players.forEach(p => {
      p.discards.forEach(d => {
        if (d === id) n++
      })
      p.melds.forEach(m => {
        if (m.tile === id) n += m.kind === 'peng' ? 3 : 4
      })
    })
    v.my.hand.forEach(d => {
      if (d === id) n++
    })
    if (v.my.drawnTile === id) n++
    return n
  }

  /** 当前番数小标签（听牌 / 有副露未听时显示；无番数信息返回 null） */
  makeFanChip(fan) {
    if (!fan || fan.fan == null) return null
    const chip = document.createElement('span')
    chip.className = 'scmj-ting-fan'
    // 简约显示：只给番数（3 番），番型明细放 title 悬浮提示，避免听牌多时溢出
    chip.textContent = fan.fan + ' 番'
    const names = (fan.names || []).join(' + ')
    chip.title = '当前 ' + fan.fan + ' 番 · ' + Math.pow(2, fan.fan) + ' 倍' + (names ? '（' + names + '）' : '')
    return chip
  }

  // ---------- 结算覆盖层 ----------
  renderSettlement(v) {
    const r = v.results
    const el = this._els.settle
    el.innerHTML = ''
    const card = document.createElement('div')
    card.className = 'scmj-settle-card'
    // 标题
    const h = document.createElement('div')
    h.className = 'scmj-settle-title'
    h.textContent = (r.liuju ? '流局 · ' : '') + '第 ' + this.round + ' 局结束'
    card.appendChild(h)
    // 破产：任一家累计积分 ≤ 0 —— 本局已打完，牌局终止，不再开下一局
    if (this.bankruptSeats.length) {
      const bank = document.createElement('div')
      bank.className = 'scmj-settle-bankrupt'
      const who = this.bankruptSeats
        .map(seat => this._labels[seat] + '（积分 ' + this.scores[seat] + '）')
        .join('、')
      bank.innerHTML =
        '<div class="scmj-settle-bankrupt-title">已破产</div>' +
        '<div class="scmj-settle-bankrupt-desc">' + who +
        ' 积分已跌到 0 或以下，本局结束后牌局终止，不能再开下一局。</div>'
      card.appendChild(bank)
      // 最终排名：按累计积分定名次（区别于上面的「本局得失」排名）
      const secFinalRank = this.makeSection('最终排名（按累计积分）')
      const finalRanks = [0, 1, 2, 3]
        .map(seat => ({ seat, score: this.scores[seat] }))
        .sort((a, b) => b.score - a.score)
      finalRanks.forEach((p, i) => {
        const row = document.createElement('div')
        row.className = 'scmj-settle-rank'
        const cls = p.score > 0 ? 'pos' : p.score < 0 ? 'neg' : 'zero'
        const tag = p.score <= 0 ? '<em class="scmj-bankrupt-tag">已破产</em>' : ''
        row.innerHTML =
          '<span class="scmj-rank-no">' + (i + 1) + '</span>' +
          '<span class="scmj-rank-name">' + this._labels[p.seat] + tag + '</span>' +
          '<span class="scmj-rank-delta ' + cls + '">' + p.score + ' 分</span>'
        secFinalRank.body.appendChild(row)
      })
      card.appendChild(secFinalRank.el)
    }
    // 1. 排名与积分变化（正绿负红；右侧为跨局累计积分）
    const secRank = this.makeSection('本局排名与累计积分')
    const ranks = r.perSeat.slice().sort((a, b) => b.delta - a.delta)
    ranks.forEach((p, i) => {
      const row = document.createElement('div')
      row.className = 'scmj-settle-rank'
      const cls = p.delta > 0 ? 'pos' : p.delta < 0 ? 'neg' : 'zero'
      row.innerHTML =
        '<span class="scmj-rank-no">' + (i + 1) + '</span>' +
        '<span class="scmj-rank-name">' + this._labels[p.seat] + '</span>' +
        '<span class="scmj-rank-delta ' + cls + '">' + fmtDelta(p.delta) + '</span>' +
        '<span class="scmj-rank-total">积分 ' + this.scores[p.seat] + '</span>'
      secRank.body.appendChild(row)
    })
    card.appendChild(secRank.el)
    // 详情区默认收起（横屏一屏即可看完积分），点击「查看详情」展开
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = 'scmj-btn scmj-btn-ghost scmj-settle-toggle'
    toggle.textContent = '查看详情 ▾'
    const detail = document.createElement('div')
    detail.className = 'scmj-settle-detail'
    detail.hidden = true
    toggle.addEventListener('click', () => {
      detail.hidden = !detail.hidden
      toggle.textContent = detail.hidden ? '查看详情 ▾' : '收起详情 ▴'
      this.sound('click')
    })
    card.appendChild(toggle)
    // 2. 终局牌面（各家手牌 + 副露）：摆出来才能核对番型（七对/清一色…）、杠数、听牌
    const secFinal = this.makeSection('终局牌面（各家手牌 + 副露）')
    if (r.seats && r.seats.length) {
      // 按行动顺序（自己 → 右家 → 对家 → 左家）展示，与牌桌座位一致
      r.seats.slice().sort((a, b) => a.seat - b.seat).forEach(ps => {
        secFinal.body.appendChild(this.makeFinalSeatRow(ps))
      })
    } else {
      const row = document.createElement('div')
      row.className = 'scmj-settle-row scmj-muted'
      row.textContent = '无牌面信息'
      secFinal.body.appendChild(row)
    }
    detail.appendChild(secFinal.el)
    // 3. 胡牌顺序（牌型名 / 番数 / 胡牌方式）
    const secHu = this.makeSection('胡牌顺序')
    if (r.huOrder && r.huOrder.length) {
      r.huOrder.forEach((hh, i) => {
        const row = document.createElement('div')
        row.className = 'scmj-settle-row'
        const fromText = hh.from != null ? '（放炮：' + this._labels[hh.from] + '）' : ''
        // 天胡（庄家起手 14 张成胡）没有单独的胡牌张，不展示牌面
        const winText = hh.winTile != null ? '胡「' + tileName(hh.winTile) + '」' : '天胡（起手成胡）'
        row.textContent =
          '第 ' + (i + 1) + ' 胡 · ' + this._labels[hh.seat] + ' · ' + (HOW_NAMES[hh.how] || hh.how) +
          fromText + ' · ' + winText + ' · ' + (hh.names || []).join(' + ') +
          ' · ' + hh.fan + ' 番 · ' + fmtDelta(hh.scoreDelta) + ' 分'
        secHu.body.appendChild(row)
      })
    } else {
      const row = document.createElement('div')
      row.className = 'scmj-settle-row scmj-muted'
      row.textContent = '本局无人胡牌'
      secHu.body.appendChild(row)
    }
    detail.appendChild(secHu.el)
    // 4. 收支明细表（ledger：谁向谁支付、原因中文、金额）
    const secLedger = this.makeSection('收支明细')
    if (r.ledger && r.ledger.length) {
      r.ledger.forEach(l => {
        const row = document.createElement('div')
        row.className = 'scmj-settle-row scmj-ledger-row'
        row.innerHTML =
          '<span class="scmj-ledger-who">' + this._labels[l.from] + ' → ' + this._labels[l.to] + '</span>' +
          '<span class="scmj-ledger-reason">' + (REASON_NAMES[l.reason] || l.reason) + '</span>' +
          '<span class="scmj-ledger-amt">' + l.amount + ' 分</span>'
        secLedger.body.appendChild(row)
      })
    } else {
      const row = document.createElement('div')
      row.className = 'scmj-settle-row scmj-muted'
      row.textContent = '本局无收支'
      secLedger.body.appendChild(row)
    }
    detail.appendChild(secLedger.el)
    // 5. 退杠（流局时未听牌者退还已收杠钱）
    if (r.refundItems && r.refundItems.length) {
      const secRefund = this.makeSection('退杠（流局未听牌）')
      r.refundItems.forEach(c => {
        const row = document.createElement('div')
        row.className = 'scmj-settle-row'
        row.textContent =
          this._labels[c.seat] + ' 未听牌，退还 ' + c.count + ' 笔杠钱共 ' + c.amount + ' 分'
        secRefund.body.appendChild(row)
      })
      detail.appendChild(secRefund.el)
    }
    // 6. 查花猪 / 查大叫条目
    if (r.chaItems && r.chaItems.length) {
      const secCha = this.makeSection('查花猪 / 查大叫')
      r.chaItems.forEach(c => {
        const row = document.createElement('div')
        row.className = 'scmj-settle-row'
        row.textContent =
          (c.type === 'huazhu' ? '查花猪' : '查大叫') + ' · ' + this._labels[c.seat] +
          (c.fan ? '（' + (c.names || []).join(' + ') + ' ' + c.fan + ' 番）' : '') +
          ' 共赔付 ' + c.amount + ' 分'
        secCha.body.appendChild(row)
      })
      detail.appendChild(secCha.el)
    }
    // 7. 幺鸡喜钱（幺鸡局：结算时手上有 3 只 / 4 只幺鸡，每家给喜钱）
    if (r.xiItems && r.xiItems.length) {
      const secXi = this.makeSection('幺鸡喜钱')
      r.xiItems.forEach(c => {
        const row = document.createElement('div')
        row.className = 'scmj-settle-row'
        row.textContent =
          this._labels[c.seat] + ' 手上 ' + c.count + ' 只幺鸡，每家给 ' + c.amount +
          ' 分，共收 ' + c.total + ' 分'
        secXi.body.appendChild(row)
      })
      detail.appendChild(secXi.el)
    }
    card.appendChild(detail)
    // 8. 按钮
    //    · 单机：再来一局 / 返回官网（破产后禁用再来一局）
    //    · 联机多局：准备下一局 / 退出房间——点「准备下一局」回房间等待室并标记就绪，
    //      全员就绪后服务端自动开下一局；破产（房间终态）时没有下一局，只能退出房间
    const btns = document.createElement('div')
    btns.className = 'scmj-settle-btns'
    const again = document.createElement('button')
    again.type = 'button'
    again.className = 'scmj-btn scmj-btn-primary'
    const home = document.createElement('button')
    home.type = 'button'
    home.className = 'scmj-btn'
    if (this.isOnline) {
      if (this.bankruptSeats.length) {
        // 房间已进终态（有玩家破产）：不再开下一局
        again.disabled = true
        again.textContent = '已破产 · 本局结束'
      } else {
        again.textContent = '准备下一局'
        again.addEventListener('click', () => this.onOnlineReady())
      }
      home.textContent = '退出房间'
      home.addEventListener('click', () => this.onOnlineExit())
    } else {
      again.textContent = '再来一局'
      if (this.bankruptSeats.length) {
        // 破产即结束：本局打完不再开下一局
        again.disabled = true
        again.textContent = '已破产 · 无法再开一局'
      }
      again.addEventListener('click', () => this.onRestart())
      home.textContent = '返回官网'
      home.addEventListener('click', () => this.goHome())
    }
    btns.appendChild(again)
    btns.appendChild(home)
    card.appendChild(btns)
    el.appendChild(card)
    el.hidden = false
  }

  makeSection(title) {
    const el = document.createElement('div')
    el.className = 'scmj-settle-section'
    const t = document.createElement('div')
    t.className = 'scmj-settle-section-title'
    t.textContent = title
    const body = document.createElement('div')
    body.className = 'scmj-settle-section-body'
    el.appendChild(t)
    el.appendChild(body)
    return { el, body }
  }

  /**
   * 结算页：一家的终局牌面（手牌 + 副露 [+ 胡牌张]）。
   * 手牌按升序摆出，副露整组展示（碰/明杠/暗杠/补杠 + 赖标），
   * 点炮 / 抢杠胡的胡牌张不在 hand 里（那张牌落在点炮者弃牌区），
   * 用金框「胡」标补在末尾，凑成完整胡牌型；缺门牌仍标红「缺」，
   * 便于一眼看出罗列是否正确（七对 / 清一色 / 杠几组 / 花猪）。
   */
  makeFinalSeatRow(ps) {
    const row = document.createElement('div')
    row.className = 'scmj-final-row'
    const head = document.createElement('div')
    head.className = 'scmj-final-head'
    const gangs = (ps.melds || []).filter(m => m.kind === 'gang').length
    const tags = []
    if (ps.void) tags.push('缺' + SUIT_NAMES[ps.void])
    if (gangs) tags.push('杠 ' + gangs + ' 组')
    const status = ps.hu
      ? (HOW_NAMES[ps.hu.how] || ps.hu.how) + ' · ' + (ps.hu.names || []).join(' + ') +
        ' · ' + ps.hu.fan + ' 番'
      : ps.ting ? '听牌 · 未胡' : '未听牌'
    head.innerHTML =
      '<span class="scmj-final-name">' + this._labels[ps.seat] + '</span>' +
      '<span class="scmj-final-status">' + status + '</span>' +
      (tags.length ? '<span class="scmj-final-tags">' + tags.join(' · ') + '</span>' : '')
    row.appendChild(head)
    const tiles = document.createElement('div')
    tiles.className = 'scmj-final-tiles'
    ;(ps.hand || []).slice().sort((a, b) => a - b).forEach(id => {
      const t = this.makeTile(id, 'disc')
      t.title = tileName(id)
      if (ps.void && tileSuit(id) === ps.void) {
        t.classList.add('scmj-tile-voidsuit')
        const mark = document.createElement('span')
        mark.className = 'scmj-tile-voidmark'
        mark.textContent = '缺'
        t.appendChild(mark)
      }
      tiles.appendChild(t)
    })
    ;(ps.melds || []).forEach(m => tiles.appendChild(this.makeMeldGroup(m)))
    if (ps.hu && ps.hu.winTile != null && ps.hu.how !== 'zimo') {
      tiles.appendChild(this.makeWinMeld(ps.hu))
    }
    row.appendChild(tiles)
    return row
  }

  // ---------- 规则说明（由契约 DEFAULT_RULES + 入口所选封顶番数生成中文清单） ----------
  buildRulesHtml() {
    const r = { ...DEFAULT_RULES, capFan: this.settings.capFan, swapThree: this.settings.swapThree, yaojiEnabled: this.settings.yaojiEnabled }
    const cap = r.baseScore * Math.pow(2, r.capFan)
    const yaojiLi = r.yaojiEnabled
      ? '<li>幺鸡赖子（本局启用）：幺鸡（一条）为万能牌，可当任意牌与真牌凑顺子 / 刻子 / 对子；1 张真牌 + 1 只幺鸡可碰；明杠 2 张真牌 + 1 只幺鸡、暗杠 3 张真牌 + 1 只幺鸡；碰过的副露也能拿手里的幺鸡当第 4 张补杠（一副露最多只含 1 只幺鸡：碰里已经带了幺鸡的，只能等摸到真牌再补杠；带幺鸡的副露在牌桌标注「赖」）。</li>' +
        '<li>幺鸡杠价：带幺鸡时点杠 ' + r.gangMing + ' 分、暗杠每家 ' + r.gangAn + ' 分、补杠每家 ' + r.gangBu +
        ' 分；整组不带幺鸡时翻倍（点杠 ' + r.gangMing * 2 + ' 分、暗杠每家 ' + r.gangAn * 2 + ' 分、补杠每家 ' + r.gangBu * 2 + ' 分）。</li>' +
        '<li>幺鸡番数：整手牌（手牌 + 副露）不含任何幺鸡时额外 +1 番（不带幺鸡点炮 2 倍，带幺鸡 1 倍）。</li>' +
        '<li>幺鸡换牌：用幺鸡补位形成的杠（明杠 / 暗杠 / 补杠），之后摸到对应真牌可点「换幺鸡」把幺鸡换回手牌继续当赖子。例外：幺鸡是在「碰」那一步进来的（碰赖），即便之后用真牌补杠成杠也不能换；碰本身是纯真牌、幺鸡是补杠时才补进来的，则可以换。</li>' +
        '<li>杠上炮转雨：杠后补牌回合打出的牌被胡，本回合收到的杠钱转给胡牌者。</li>' +
        '<li>幺鸡喜钱：结算时名下（手牌 + 副露，含被抢杠后留在副露补位的）有 3 只幺鸡每家付 ' + r.xiThree + ' 分，4 只每家付 ' + r.xiFour + ' 分。</li>'
      : '<li>幺鸡赖子：未启用（入口可勾选开启）。</li>'
    return (
      '<ul class="scmj-rules-list">' +
      '<li>规则版本 <b>' + RULE_VERSION + '</b>。本作规则为产品配置，非全部四川麻将通用规则。</li>' +
      '<li>底分 ' + r.baseScore + ' 分，封顶 ' + r.capFan + ' 番（单笔支付上限 ' + cap + ' 分，入口可点 − / ＋ 调整为 2~6 番）。</li>' +
      '<li>番型：平胡 0 番（1 倍）、对对胡 1 番、七对 2 番、龙七对 3 番、金钩钓 3 番（四副露碰 / 杠到底、手里单吊将，比对对胡高一档）；清一色固定 +2 番。判番时取番值最高的番型。</li>' +
      '<li>坐庄：首局掷骰定庄，庄家起手 14 张先打；之后每局由上一局最先胡牌者坐庄，一炮多响（2~3 人同胡一张）时点炮者坐庄；流局庄家留任。</li>' +
      '<li>连庄：同一玩家连续坐庄 2 轮起显示「连庄 xN」，满 3 轮挂 🔥 标记。</li>' +
      '<li>换三张：' + (r.swapThree ? '启用（传牌方向由牌局派生：下家 / 上家 / 对家）' : '关闭（入口可勾选）') + '。</li>' +
      '<li>定缺：' + (r.voidRequired ? '必须定缺，缺门牌未打完前只能打缺门、不能胡（碰 / 杠不受限，碰杠后仍须把缺门打完）' : '关闭') + '。</li>' +
      '<li>不允许吃牌。</li>' +
      '<li>明杠（刮风）：放杠者付 ' + r.gangMing + ' 分；补杠（刮风）：每位活跃未胡玩家付 ' +
      (r.yaojiEnabled ? r.gangBu : r.gangAn) + ' 分；暗杠（下雨）：每位活跃未胡玩家付 ' + r.gangAn + ' 分。</li>' +
      yaojiLi +
      '<li>自摸额外加 ' + r.zimoFan + ' 番。</li>' +
      '<li>海底捞：摸到牌墙最后一张自摸（海底捞月）或胡最后一张打出牌（海底炮），额外加 ' + r.haidiFan + ' 番。</li>' +
      '<li>根：每有一组 4 张相同的牌加 ' + r.genFan + ' 番（明杠 / 暗杠 / 补杠，或碰后手留一张、手里 4 张未杠都算根；与杠钱独立）。七对 / 龙七对里的 4 张已含在番型中，不重复计根。</li>' +
      '<li>杠上花：杠后补牌自摸，额外加 ' + r.gangShangFan + ' 番（与根、自摸叠加：平胡 0 + 根 1 + 自摸 1 + 杠上花 1 = 3 番 = 8 倍）。</li>' +
      '<li>杠上炮：杠后补牌打出的牌被胡，给胡牌者额外加 ' + r.gangShangFan + ' 番（抢杠胡不算）。</li>' +
      '<li>抢杠胡：补杠被抢则杠不成立——杠钱一分不收（相当于没杠到），被抢的那张牌算被抢者点炮（落进他的弃牌区），抢杠者额外加 ' + r.qianggangFan + ' 番。幺鸡补的那张留在副露里顶替被抢走的真牌（碰带幺鸡不可换回，要再杠只能等摸到真牌）。</li>' +
      '<li>查花猪：' + (r.chaHuaZhu ? '流局时未打缺者按封顶赔给每位未胡玩家' : '关闭') +
      '；查大叫：' + (r.chaDaJiao ? '流局时未听牌者按自己手牌的最大可能番数赔给每位已听牌玩家（不超过封顶）' : '关闭') + '。</li>' +
      '<li>退杠：' + (r.refundGangOnFlow
        ? '流局时未听牌者（含花猪）退还本局全部已收杠钱（明杠 / 暗杠 / 补杠），杠钱听牌才算落袋；有人胡满结束的局照收不退'
        : '关闭（流局未听牌者也保留杠钱）') + '。</li>' +
      '<li>自摸比平胡多 ' + r.zimoFan + ' 番（平胡 0 番 = 1 倍，自摸 1 番 = 2 倍）；听牌 / 杠后牌桌会显示当前番数与倍数。</li>' +
      '<li>退税：' + (r.taxRefund ? '启用' : '未启用') + '。</li>' +
      '<li>' + r.endWhenHuPlayers + ' 人胡牌即结束本局；已胡玩家离场观战，牌桌继续血战。</li>' +
      '</ul>' +
      '<p class="scmj-rules-note">注：本作规则为产品配置，非全部四川麻将通用规则，规则版本 ' + RULE_VERSION + '；退税未启用。</p>'
    )
  }

  // ==================== 轻量组件：toast / 浮层 / 确认 ====================

  toast(msg) {
    const el = this._els.toast
    el.textContent = msg
    el.classList.add('scmj-toast-show')
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => el.classList.remove('scmj-toast-show'), 2200)
  }

  float(text) {
    if (!this.settings.animation) return // 动画开关可关
    const el = this._els.float
    el.textContent = text
    el.classList.add('scmj-float-show')
    clearTimeout(this._floatTimer)
    this._floatTimer = setTimeout(() => el.classList.remove('scmj-float-show'), 1000)
  }

  /** 杠特效：明杠 / 补杠=刮风（一家或分摊、钱少），暗杠=下雨（每家都付、钱多），约 1s */
  gangFx(gangType) {
    if (!this.settings.animation) return
    const el = this._els.fx
    if (!el) return
    const rain = gangType === 'an' // 暗杠下雨，明杠 / 补杠刮风
    el.className = 'scmj-fx'
    el.innerHTML = ''
    const n = rain ? 26 : 14
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div')
      p.className = rain ? 'scmj-fx-drop' : 'scmj-fx-wind'
      p.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's'
      if (rain) {
        p.style.left = (Math.random() * 100).toFixed(1) + '%'
        p.style.height = (10 + Math.random() * 14).toFixed(0) + 'px'
      } else {
        p.style.top = (Math.random() * 100).toFixed(1) + '%'
      }
      el.appendChild(p)
    }
    el.classList.add('scmj-fx-show')
    clearTimeout(this._fxTimer)
    this._fxTimer = setTimeout(() => {
      el.classList.remove('scmj-fx-show')
      el.innerHTML = ''
    }, 1000)
  }

  confirm(msg, onOk) {
    this._els.confirmText.textContent = msg
    this._els.modalConfirm.hidden = false
    this._confirmCb = onOk
  }

  // ==================== 音效（WebAudio 简单合成，v1 占位级） ====================

  sound(type) {
    if (!this.settings.sound || typeof window === 'undefined') return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      if (!this._ac) this._ac = new AC()
      const ac = this._ac
      if (ac.state === 'suspended') ac.resume()
      const conf = {
        click: [660, 0.05, 0.04],
        draw: [500, 0.05, 0.04],
        discard: [320, 0.08, 0.06],
        peng: [520, 0.16, 0.14],
        gang: [420, 0.2, 0.18],
        hu: [880, 0.35, 0.32],
        deal: [440, 0.12, 0.1]
      }[type] || [600, 0.05, 0.04]
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = 'sine'
      o.frequency.value = conf[0]
      g.gain.setValueAtTime(0.16, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + conf[2])
      o.connect(g)
      g.connect(ac.destination)
      o.start()
      o.stop(ac.currentTime + conf[1])
    } catch (e) {
      /* 音频不可用时静默 */
    }
  }
}
