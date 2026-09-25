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
import { riverLayout } from './table-layout.mjs'

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
// 手牌尺寸（见 fitHand）：自己的手牌是全桌最该看清的牌，按可用空间自适应取尺寸，
// 不再按媒体查询写死小常数（矮横屏曾一路压到 28×38，屏幕宽度却只用掉三分之一）。
const HAND_SLOTS_REF = 14 // 尺寸按满手 14 张定档：张数变化不改变牌的大小，牌桌不抖
const HAND_DRAWN_GAP = 12 // 新摸的牌与前排之间的正间距（一眼看出刚摸的是哪张）
// 联机交流：固定短语（点击即发；服务端限长 30 字，这里的文案都远低于上限）
const CHAT_PHRASES = ['快点啊', '等等，我想想', '别放炮哦', '这牌打得漂亮', '手气真好', '稳一手', '碰得好！', '承让承让']
// 面板只展示前 4 条（语音为主、短语为辅）；查表保留全量 8 条，旧客户端发来的大序号仍能播
const CHAT_PANEL_COUNT = 4
const VOICE_MAX_SEC = 15 // 语音消息最长秒数（按住录音到点自动停）
const MIN_HAND_TILE_W = 16 // 14 张紧邻单排，窄屏仍保留每张独立点击区
// 单张手牌的高度上限（宽 = 高 / TILE_ASPECT）。统一给到桌面档，让**宽度**成为
// 唯一限制：横屏手机横向富余，14 张按可用宽度算出来的牌宽本来就更大，
// 之前被矮屏分档（54/58）压住，白白空着三分之一屏宽。真正窄屏由 byWidth 兜住。
const HAND_MAX_TILE_H = 68

/** 四种方向均按满手 14 张连续单排，只有新摸牌留识别间距。 */
function handSlotsPerRow() {
  return HAND_SLOTS_REF
}

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
      music: true,
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
    // 联机局间：已点「准备下一局」，停在结算页等下一局（牌桌不切走）
    this._awaitingNextRound = false
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
    // ---------- 联机交流（语音 / 快捷短语，服务端纯转发不存储）----------
    this._unsubChat = null // net.subscribe 的取消函数
    this._bubbles = {} // 视角座位号 -> { el, timer }（每座位同时只留一条气泡）
    this._recorder = null // MediaRecorder 实例（录音中非 null）
    this._recStream = null // getUserMedia 流（停止时必须关轨，否则麦克风指示灯常亮）
    this._recChunks = []
    this._recMime = ''
    this._recStartAt = 0
    this._recTimer = null
    this._recDiscard = false // 离开/销毁时丢弃录音，不发送
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
      setMusic: q('[data-scmj-set-music]'),
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
      winds: q('[data-scmj-winds]'),
      roundChip: q('[data-scmj-round]'),
      center: q('[data-scmj-center]'),
      centerslot: q('[data-scmj-centerslot]'),
      centerbox: q('[data-scmj-centerbox]'),
      wallbox: q('[data-scmj-wallbox]'),
      felt: q('[data-scmj-felt]'),
      wallring: q('[data-scmj-wallring]'),
      wallringTop: q('[data-scmj-wallring-top]'),
      wallringRight: q('[data-scmj-wallring-right]'),
      wallringBottom: q('[data-scmj-wallring-bottom]'),
      wallringLeft: q('[data-scmj-wallring-left]'),
      float: q('[data-scmj-float]'),
      fx: q('[data-scmj-fx]'),
      toast: q('[data-scmj-toast]'),
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
      backs1: q('[data-scmj-backs1]'),
      backs2: q('[data-scmj-backs2]'),
      backs3: q('[data-scmj-backs3]'),
      pop: q('[data-scmj-pop]'),
      chat: q('[data-scmj-chat]'),
      chatMic: q('[data-scmj-chat-mic]'),
      chatToggle: q('[data-scmj-chat-toggle]'),
      chatPanel: q('[data-scmj-chat-panel]'),
      chatRecTip: q('[data-scmj-chat-rectip]')
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
    // 矩形牌桌随可用宽高伸展；窗口变化时重算手牌、牌墙与四家弃牌占位。
    // （fitHand 先按新宽高定手牌尺寸，fitCenterBox 再定面板边长，fitWallRing 最后
    // 按面板内的牌墙盒计算）
    this._onResize = () => {
      this.fitHand()
      this.fitCenterBox()
      this.fitWallRing()
    }
    window.addEventListener('resize', this._onResize)
    window.addEventListener('orientationchange', this._onResize)
    // 页面切后台时只暂停 Web Audio 合成（系统也会挂起它）；BGM 音频文件继续播，
    // 回前台恢复。想完全静音可用设置里的「背景音乐」开关。
    this._onVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.hidden) this._stopSynth()
      else if (this._els.table && !this._els.table.hidden) this.music(true)
    }
    document.addEventListener('visibilitychange', this._onVisibility)
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
    this._teardownChat()
    if (this.game && this.game.dispose) this.game.dispose()
    this.game = null
    this.view = null
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize)
      window.removeEventListener('orientationchange', this._onResize)
      this._onResize = null
    }
    if (this._onVisibility) {
      document.removeEventListener('visibilitychange', this._onVisibility)
      this._onVisibility = null
    }
    this.music(false)
    if (this._bgm) { this._bgm.pause(); this._bgm.removeAttribute('src'); this._bgm = null }
    this._stopVoiceNow() // 掐断当前播报 + speechSynthesis.cancel
    if (this._voiceMsgPlaying) { try { this._voiceMsgPlaying.pause() } catch (e) { /* 忽略 */ } this._voiceMsgPlaying = null }
    if (this._ac && this._ac.state !== 'closed') { this._ac.close().catch(() => {}); this._ac = null }
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
    setChecked(e.setMusic, this.settings.music !== false)
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
    on(e.setMusic, 'change', () => {
      this.settings.music = e.setMusic.checked
      this.saveSettings()
      this.music(this.settings.music && this._els.table && !this._els.table.hidden)
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
    this.bindChat()
  }

  // ==================== 联机交流：快捷短语 + 按住说话 ====================

  /** 绑定交流入口（仅联机牌桌显示；单机时元素隐藏，绑了也不会触发） */
  bindChat() {
    const e = this._els
    if (!e.chat) return
    // 注意：on 是 bindStatic 的局部 helper，这里不可复用（独立作用域）
    const listen = (el, ev, fn) => {
      if (el) el.addEventListener(ev, fn)
    }
    // 固定短语面板（一次性渲染，只放最常用的前 4 条；「按住说话」按钮在模板里排首位）：
    // 点击发 phrase 序号，全员播报对应预生成语音
    if (e.chatPanel) {
      CHAT_PHRASES.slice(0, CHAT_PANEL_COUNT).forEach((text, idx) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'scmj-chat-phrase'
        b.textContent = text
        b.addEventListener('click', () => {
          this.sound('click')
          e.chatPanel.hidden = true
          if (!this.isOnline || !this.net) return
          // 本地即时播报 + 气泡（服务端不回环发件人）
          if (this.net.sendChat({ phrase: idx })) {
            this.speak('phrase-' + idx, text)
            this.showChatBubble(0, { phrase: idx, text })
          } else this.toast('连接已断开，短语未发出')
        })
        e.chatPanel.appendChild(b)
      })
    }
    listen(e.chatToggle, 'click', () => {
      this.sound('click')
      if (e.chatPanel) e.chatPanel.hidden = !e.chatPanel.hidden
      e.chatToggle.setAttribute('aria-expanded', String(!e.chatPanel.hidden))
      this.fitChat()
    })
    // 按住说话：pointerdown 开录、up/cancel/滑出 停并发。用 pointer 系事件同时覆盖
    // 鼠标与触屏；contextmenu 防 iOS 长按弹系统菜单打断录音。
    listen(e.chatMic, 'pointerdown', ev => {
      ev.preventDefault()
      this.startVoiceRec()
    })
    listen(e.chatMic, 'pointerup', ev => {
      ev.preventDefault()
      this.stopVoiceRec()
    })
    listen(e.chatMic, 'pointercancel', () => this.stopVoiceRec())
    listen(e.chatMic, 'pointerleave', () => this.stopVoiceRec())
    listen(e.chatMic, 'contextmenu', ev => ev.preventDefault())
  }

  /** 订阅服务端的交流转发（进联机桌时挂；重复进桌先退旧订阅） */
  _bindChatRelay(net) {
    if (this._unsubChat) {
      this._unsubChat()
      this._unsubChat = null
    }
    if (!net || !net.subscribe) return
    this._unsubChat = net.subscribe(msg => this._onChatMsg(msg))
  }

  _onChatMsg(msg) {
    if (!msg || (msg.type !== 'VOICE_MSG' && msg.type !== 'CHAT_MSG')) return
    const p = msg.payload || {}
    const mySeat = this.onlinePlayer && this.onlinePlayer.seatIndex
    if (p.seatIndex == null || mySeat == null) return
    // 服务端发的是绝对座位号，转成视角座位（自己永远 0 号位）
    const viewSeat = (p.seatIndex - mySeat + 4) % 4
    if (msg.type === 'CHAT_MSG') {
      // 固定短语：服务端只转发白名单序号，查表播报预生成语音
      const text = CHAT_PHRASES[p.phrase]
      if (text == null) return
      this.showChatBubble(viewSeat, { phrase: p.phrase, text })
      this.speak('phrase-' + p.phrase, text)
      return
    }
    const duration = Math.min(20, Math.max(1, Math.round(Number(p.duration) || 0)))
    const bubbleEl = this.showChatBubble(viewSeat, { voice: true, duration, mime: p.mime, data: p.data })
    // 音效开关关=不自动播语音，气泡仍可点按重播；正在录音时也不自动播（会被麦克风回录）
    if (this.settings.sound !== false && !this._recorder && !this._recStarting) this._playVoiceData(p.mime, p.data, bubbleEl)
  }

  /** 在某座位旁弹气泡（同一座位新消息顶掉旧的；textContent 渲染防注入） */
  showChatBubble(viewSeat, msg) {
    const anchor = this._chatAnchor(viewSeat)
    if (!anchor) return
    const old = this._bubbles[viewSeat]
    if (old) {
      clearTimeout(old.timer)
      old.el.remove()
      delete this._bubbles[viewSeat]
    }
    const el = document.createElement('div')
    el.className = 'scmj-bubble scmj-bubble-' + viewSeat
    let hideAfter = 3500
    if (msg.voice) {
      el.classList.add('scmj-bubble-voice')
      el.textContent = '🔊 ' + (msg.duration || 1) + '″'
      el.title = '点击停/重播'
      el.addEventListener('click', () => {
        this.sound('click')
        // 这条气泡的语音正在播：点一下停（不听）；否则播/重播
        const cur = this._voiceMsgPlaying
        if (cur && cur._bubble === el) {
          try { cur.pause() } catch (e) { /* 忽略 */ }
          if (cur._release) cur._release()
          this._voiceMsgPlaying = null
        } else {
          this._playVoiceData(msg.mime, msg.data, el)
        }
      })
      hideAfter = Math.min(12000, 3000 + (msg.duration || 1) * 1000)
    } else if (msg.phrase != null) {
      // 短语语音气泡：🔊 + 文字（文字仅作视觉辅助，点击停/重播语音）
      el.classList.add('scmj-bubble-voice')
      el.textContent = '🔊 ' + msg.text
      el.title = '点击停/重播'
      el.addEventListener('click', () => {
        this.sound('click')
        // 这条短语正在播：点一下停；否则播/重播
        const now = this._voiceNow
        if (now && now.key === 'phrase-' + msg.phrase) this._stopVoiceNow()
        else this.speak('phrase-' + msg.phrase, msg.text)
      })
      hideAfter = 4500
    } else {
      el.textContent = msg.text
    }
    anchor.appendChild(el)
    const timer = setTimeout(() => {
      el.classList.add('scmj-bubble-out')
      setTimeout(() => el.remove(), 240)
      delete this._bubbles[viewSeat]
    }, hideAfter)
    this._bubbles[viewSeat] = { el, timer }
    return el
  }

  /** 气泡锚点：对手挂座位面板的 seatwrap，自己挂玩家区域 */
  _chatAnchor(viewSeat) {
    if (viewSeat === 0) return this.root.querySelector('.scmj-player')
    const seat = this._els['seat' + viewSeat]
    return seat && seat.closest ? seat.closest('.scmj-seatwrap') : null
  }

  /** base64 语音消息播放。单例：连点多个气泡 / 自动播与重播叠加时，永远只有
   *  最新一条出声，同时掐掉语音播报（语音类声音全局互斥，避免好几个声音重叠）。
   *  bubbleEl：来源气泡（自动播也带上），气泡「播中点停」靠它辨认自己在播的那条。
   *  优先 Web Audio 解码播放：可加增益（录音普遍偏小，人声 ×1.5 放大才不被
   *  提示音盖过），且 iOS 上 Web Audio 音量可控；解码失败回退 <audio> 元素
   *  （iOS Safari 对 data: 音频兼容性差，走 Blob URL 更稳）。 */
  _playVoiceData(mime, data, bubbleEl) {
    if (!mime || !data) return
    try {
      const bin = atob(data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      if (this._voiceMsgPlaying) {
        try { this._voiceMsgPlaying.pause() } catch (e) { /* 忽略 */ }
        if (this._voiceMsgPlaying._release) this._voiceMsgPlaying._release()
        this._voiceMsgPlaying = null
      }
      this._stopVoiceNow() // 语音消息与播报互斥：听消息时不掺报牌声
      // 语音消息=用户交流（最高层级）：播放期间 BGM 压到近乎静音（iOS 则暂停）。
      // 时长按字节粗估（opus ≈16kbps、mp4 ≈64kbps），最长 15 秒
      const bps = /mp4/.test(mime) ? 8000 : 2000
      this._duckBgmComm(Math.max(0.6, Math.min(15, bytes.length / bps)))
      if (!this._playVoiceViaWebAudio(mime, bytes, bubbleEl)) this._playVoiceViaElement(mime, bytes, bubbleEl)
    } catch (err) {
      /* 非法数据忽略 */
    }
  }

  /** Web Audio 增益播放：返回 false 表示环境不支持，调用方回退 <audio> */
  _playVoiceViaWebAudio(mime, bytes, bubbleEl) {
    try {
      const ac = this._ensureAudio()
      if (!ac || ac.state === 'closed' || typeof ac.decodeAudioData !== 'function') return false
      // holder 伪装成 Audio 接口（pause/_release/_bubble），供单例互斥与气泡点停复用
      const holder = { _bubble: bubbleEl || null, _release: null, pause: null }
      let src = null
      let gain = null
      let done = false
      let decoded = false
      let wdDecode = null
      let wdPlay = null
      const release = () => {
        if (done) return
        done = true
        clearTimeout(wdDecode)
        clearTimeout(wdPlay)
        try { if (src) src.stop() } catch (e) { /* 忽略 */ }
        try { if (gain) gain.disconnect() } catch (e) { /* 忽略 */ }
        if (this._voiceMsgPlaying === holder) this._voiceMsgPlaying = null
      }
      const fallback = () => {
        release()
        this._playVoiceViaElement(mime, bytes, bubbleEl)
      }
      holder._release = release
      holder.pause = release // Web Audio 不能暂停续播：点停=停止；再点=重新解码重播
      this._voiceMsgPlaying = holder
      // 看门狗1：iOS 的 decodeAudioData 对部分 MediaRecorder 产物（fMP4）可能
      // 永不回调（无成功也无失败），1 秒没动静就转 <audio> 回退，不能让用户等无声
      wdDecode = setTimeout(() => { if (!decoded && !done) fallback() }, 1000)
      ac.decodeAudioData(
        bytes.buffer.slice(0),
        buf => {
          decoded = true
          clearTimeout(wdDecode)
          if (done) return
          try {
            gain = ac.createGain()
            gain.gain.value = 1.5 // 人声增益（BGM 已被交流档压低/暂停，不怕突出）
            src = ac.createBufferSource()
            src.buffer = buf
            src.onended = release
            src.connect(gain)
            gain.connect(ac.destination)
            src.start()
            // 看门狗2：录音刚停 iOS 音频会话可能还在切换（context 卡在 interrupted），
            // start 后排在冻结时间线上无声——700ms 后还没 running 就回退 <audio>
            wdPlay = setTimeout(() => { if (!done && ac.state !== 'running') fallback() }, 700)
          } catch (e) {
            release()
          }
        },
        () => {
          // 解码失败（如老 Safari 不认 webm/opus）：回退 <audio> 元素
          fallback()
        }
      )
      return true
    } catch (e) {
      return false
    }
  }

  /** <audio> 元素播放（回退路径）：音量上限 100%，但兼容性最广 */
  _playVoiceViaElement(mime, bytes, bubbleEl) {
    try {
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
      const a = new Audio(url)
      a._bubble = bubbleEl || null
      if (this._voiceMsgPlaying) {
        try { this._voiceMsgPlaying.pause() } catch (e) { /* 忽略 */ }
        if (this._voiceMsgPlaying._release) this._voiceMsgPlaying._release()
      }
      this._voiceMsgPlaying = a
      const release = () => {
        URL.revokeObjectURL(url)
        if (this._voiceMsgPlaying === a) this._voiceMsgPlaying = null
      }
      a._release = release
      a.onended = release
      a.onerror = release
      a.play().catch(release)
    } catch (e) {
      /* 忽略 */
    }
  }

  async startVoiceRec() {
    if (this._recorder || this._recStarting) return // 已在录/正在开录
    if (!this.isOnline || !this.net) return
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      this.toast('当前浏览器不支持录音，可改用快捷短语')
      return
    }
    // 开录中标记：getUserMedia 是异步的（授权弹窗/硬件初始化可达数百毫秒），
    // 此窗口内松手必须能放弃开录，否则录音机变孤儿一直收音
    this._recStarting = true
    this._recAbort = false
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      this._recStarting = false
      this.toast('无法使用麦克风，请检查系统授权')
      return
    }
    if (this._recAbort) { // 等待授权期间已松手：立即关轨，不开录
      this._recStarting = false
      stream.getTracks().forEach(t => t.stop())
      return
    }
    const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    const mime =
      mimes.find(m => {
        try {
          return MediaRecorder.isTypeSupported(m)
        } catch (err) {
          return false
        }
      }) || ''
    let rec
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    } catch (err) {
      this._recStarting = false
      stream.getTracks().forEach(t => t.stop())
      this.toast('录音初始化失败')
      return
    }
    this._recChunks = []
    this._recMime = rec.mimeType || mime || 'audio/webm'
    this._recStartAt = Date.now()
    this._recDiscard = false
    this._recorder = rec
    this._recStarting = false
    this._recStream = stream
    rec.ondataavailable = ev => {
      if (ev.data && ev.data.size) this._recChunks.push(ev.data)
    }
    rec.onstop = () => this._finishVoiceRec()
    try {
      // 必须带 timeslice：iOS Safari 不带时 stop() 常产出只有文件头的空录音
      rec.start(1000)
    } catch (err) {
      this._recorder = null
      this._recStream = null
      this._recStartAt = 0
      stream.getTracks().forEach(t => t.stop())
      this.toast('录音启动失败')
      return
    }
    if (this._els.chatMic) this._els.chatMic.classList.add('scmj-chat-mic-on')
    if (this._els.chatRecTip) this._els.chatRecTip.hidden = false
    // 到最长时限自动停（走正常发送流程）
    clearTimeout(this._recTimer)
    this._recTimer = setTimeout(() => this.stopVoiceRec(), VOICE_MAX_SEC * 1000)
  }

  stopVoiceRec() {
    if (this._recStarting && !this._recorder) {
      // getUserMedia 还在路上：标记放弃，resolve 后由 startVoiceRec 关轨
      this._recAbort = true
      return
    }
    const rec = this._recorder
    if (!rec) return
    this._recorder = null // 先置空防重入；收尾在 onstop → _finishVoiceRec
    clearTimeout(this._recTimer)
    try {
      if (rec.state !== 'inactive') {
        try { rec.requestData() } catch (e) { /* 部分浏览器不支持，忽略 */ }
        rec.stop()
      } else {
        this._finishVoiceRec()
      }
    } catch (err) {
      this._finishVoiceRec()
    }
  }

  /** 录音结束收尾：关轨、复位 UI、编码发送（或按场景丢弃） */
  _finishVoiceRec() {
    if (!this._recStartAt) return // 已收尾过
    const durMs = Date.now() - this._recStartAt
    this._recStartAt = 0
    clearTimeout(this._recTimer)
    if (this._recStream) {
      this._recStream.getTracks().forEach(t => t.stop())
      this._recStream = null
    }
    if (this._els.chatMic) this._els.chatMic.classList.remove('scmj-chat-mic-on')
    if (this._els.chatRecTip) this._els.chatRecTip.hidden = true
    const chunks = this._recChunks
    this._recChunks = []
    const mime = this._recMime
    if (this._recDiscard) {
      this._recDiscard = false
      return
    }
    if (!chunks.length) {
      this.toast('没有录到声音，请重试')
      return
    }
    if (durMs < 800) {
      this.toast('说话时间太短')
      return
    }
    const blob = new Blob(chunks, { type: mime })
    if (blob.size > 200 * 1024) {
      this.toast('语音太长了，控制在 ' + VOICE_MAX_SEC + ' 秒内')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      const base64 = url.slice(url.indexOf(',') + 1)
      if (!base64) return
      const seconds = Math.min(VOICE_MAX_SEC, Math.max(1, Math.round(durMs / 1000)))
      if (this.net && this.net.sendVoice({ mime, data: base64, duration: seconds })) {
        // 本地即时回显 + 自动播（服务端不回环发件人；与快捷短语一致：发出去就出声）。
        // 延迟 350ms 再播：iOS 录音停止后音频会话从「录制」切回「播放」需要一点时间，
        // 立刻播会卡在冻结的 AudioContext 时间线上（第二次发语音不自动播的根因）。
        // 正在录下一条时不自动播：播放声会被麦克风回录（气泡保留，可点按收听）
        const bubbleEl = this.showChatBubble(0, { voice: true, duration: seconds, mime, data: base64 })
        setTimeout(() => {
          if (this.settings.sound !== false && !this._recorder && !this._recStarting) this._playVoiceData(mime, base64, bubbleEl)
        }, 350)
      } else {
        this.toast('连接已断开，语音未发出')
      }
    }
    reader.readAsDataURL(blob)
  }

  /** 离开/销毁时：退订阅、丢弃进行中的录音、清空气泡 */
  _teardownChat() {
    if (this._unsubChat) {
      this._unsubChat()
      this._unsubChat = null
    }
    if (this._recStarting) this._recAbort = true // getUserMedia 在路上：放弃开录
    if (this._recorder) {
      this._recDiscard = true
      this.stopVoiceRec()
    }
    for (const k of Object.keys(this._bubbles)) {
      clearTimeout(this._bubbles[k].timer)
      this._bubbles[k].el.remove()
      delete this._bubbles[k]
    }
    if (this._els.chat) this._els.chat.hidden = true
    if (this._els.chatPanel) this._els.chatPanel.hidden = true
  }

  showEntry() {
    this.music(false)
    if (this._els.entry) this._els.entry.hidden = false
    if (this._els.table) this._els.table.hidden = true
    if (this._els.settle) this._els.settle.hidden = true
    if (this._els.lobby) this._els.lobby.hidden = true
  }

  showTable() {
    if (this._els.entry) this._els.entry.hidden = true
    if (this._els.table) this._els.table.hidden = false
    if (this._els.lobby) this._els.lobby.hidden = true
    this.music(true)
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
    // 多局联机：局号与累计积分都以服务端为准（syncSession 取局号，applyOnlineMeta 取积分），
    // 这里先给一个首帧兜底值，避免进桌瞬间显示空积分
    this.round = 1
    this._roundSettled = false
    this._awaitingNextRound = false
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
    // 联机交流：显示右下入口并订阅服务端转发（重进桌时 _bindChatRelay 会先退旧订阅）
    if (this._els.chat) this._els.chat.hidden = false
    this._bindChatRelay(net)
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
    this.music(false)
    if (this._els.table) this._els.table.hidden = true
    if (this._els.settle) this._els.settle.hidden = true
  }

  /**
   * 联机多局：本局结束点「准备下一局」/「取消准备」。
   * 留在牌桌上等下一局：只向服务端切换本座位就绪状态（全员就绪后服务端自动开
   * 下一局），牌桌与结算卡原地不动——不再收起牌桌切回房间等待室，避免房间页
   * 在牌桌后面闪一下、下一局又重新进桌。服务端推来下一局的 GAME_STATE_CHANGED
   * 时，大厅会就地重进牌桌（见 lobby._enterGame(true)）。
   */
  onOnlineReady(ready = true) {
    this._awaitingNextRound = true
    this.stopCountdown()
    if (this.net && this.net.sendAdmin) this.net.sendAdmin('TOGGLE_READY', { ready })
    this.updateSettleBtns()
  }

  /** 是否正停在结算页等下一局（大厅据此判断要不要就地重进牌桌） */
  isAwaitingNextRound() {
    return this._awaitingNextRound === true
  }

  leaveOnline() {
    this.stopCountdown()
    this._teardownChat()
    if (this.game && this.game.dispose) this.game.dispose()
    this.game = null
    this.view = null
    this.isOnline = false
    this.onlineAssist = null
    this._awaitingNextRound = false
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
    this._teardownChat()
    if (this.game && this.game.dispose) this.game.dispose()
    this.game = null
    this.view = null
    this.isOnline = false
    this.onlineAssist = null
    this._awaitingNextRound = false
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
    this._lastTickSec = null
    this._duckBgm(false) // 读秒结束还原 BGM 音量
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
      this._duckBgm(false) // 倒计时消失（轮完/无期限）同样还原 BGM
      return
    }
    const left = Math.max(0, Math.round((meta.deadlineAt - (Date.now() - this._clockSkew)) / 1000))
    el.hidden = false
    el.textContent = '⏳ ' + left + 's'
    el.classList.toggle('scmj-countdown-urgent', left <= 5)
    // 读秒阶段压低背景音乐，让提醒音盖过 BGM；离开读秒区间即还原
    this._duckBgm(left >= 1 && left <= 5)
    // 读秒提醒：最后 5 秒每到新的一秒滴一声（仅轮到自己操作时倒计时会显示）
    if (left >= 1 && left <= 5 && this.settings.sound !== false && this._lastTickSec !== left) {
      this._lastTickSec = left
      if (this._ensureAudio()) this._note(990, 0.12, 0.2, 'triangle')
    }
  }

  /** BGM 音量统一结算。层级：用户交流（语音消息/快捷短语）＞事件特效播报
   * （读秒滴滴/碰杠胡音效/语音播报）＞背景音乐。
   * 基准 0.4；交流档 ×0.08（近乎静音，人声必须字字清晰）；
   * 读秒持续档与音效临时档各 ×0.2，可相互叠乘 */
  _duckApply() {
    if (!this._bgm) return
    let v = 0.4
    if (this._bgmCommDucks > 0) v *= 0.08
    if (this._bgmDucked) v *= 0.2
    if (this._bgmTempDucks > 0) v *= 0.2
    this._bgm.volume = v
  }

  /** 读秒 ducking（持续档）：读秒期间 BGM 压低，提醒音更突出；结束后还原 */
  _duckBgm(on) {
    if (this._bgmDucked === on) return
    this._bgmDucked = on
    this._duckApply()
  }

  /** 音效/语音播报 ducking（事件临时档）：播放期间压低 BGM，sec 秒后自动恢复；并发计数叠加 */
  _duckBgmTemp(sec) {
    if (typeof window === 'undefined') return
    this._bgmTempDucks = (this._bgmTempDucks || 0) + 1
    this._duckApply()
    setTimeout(() => {
      this._bgmTempDucks = Math.max(0, (this._bgmTempDucks || 0) - 1)
      this._duckApply()
    }, Math.max(200, Math.round((sec || 0.6) * 1000)))
  }

  /** 当前平台是否允许 JS 设置媒体音量。iOS Safari 的 HTMLMediaElement.volume
   * 只读（恒为 1，音量只能由用户物理键控制），所有 _duckApply 写在 iPhone 上无效 */
  _volCanSet() {
    if (this._volSettable == null) {
      try {
        const a = document.createElement('audio')
        a.volume = 0.42
        this._volSettable = a.volume === 0.42
      } catch (e) {
        this._volSettable = false
      }
    }
    return this._volSettable
  }

  /** 用户交流 ducking（交流档，最高层级）：语音消息/快捷短语播放期间
   *  BGM 压到近乎静音，sec 秒后自动恢复；并发计数叠加。
   *  音量不可设置的平台（iOS）：无法压低就 0→1 沿整体暂停 BGM，全部结束后恢复，
   *  否则 BGM 满音量盖过人声。 */
  _duckBgmComm(sec) {
    if (typeof window === 'undefined') return
    const was = (this._bgmCommDucks || 0) > 0
    this._bgmCommDucks = (this._bgmCommDucks || 0) + 1
    const ms = Math.max(200, Math.round((sec || 0.6) * 1000))
    if (this._volCanSet()) {
      this._duckApply()
    } else if (!was && this._bgm && !this._bgm.paused) {
      this._bgmCommHolding = true
      try { this._bgm.pause() } catch (e) { /* 忽略 */ }
    }
    setTimeout(() => {
      this._bgmCommDucks = Math.max(0, (this._bgmCommDucks || 0) - 1)
      if (this._volCanSet()) {
        this._duckApply()
      } else if (!this._bgmCommDucks && this._bgmCommHolding) {
        this._bgmCommHolding = false
        // 播放期间用户主动关了音乐则不恢复
        if (this._bgm && this._bgm.paused && this.settings.music !== false) {
          try { this._bgm.play().catch(() => {}) } catch (e) { /* 忽略 */ }
        }
      }
    }, ms)
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
    this.sound('dice') // 掷骰音效：一串咔哒 + 落定

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
    // 碰/杠/胡同步语音播报（自己与他人都报；自摸单独播报）；出牌播报牌名
    if (ev && ev.type === 'peng') this.speak('peng')
    else if (ev && ev.type === 'gang') this.speak('gang')
    else if (ev && ev.type === 'hu') this.speak(ev.data && ev.data.how === 'zimo' ? 'zimo' : 'hu')
    else if (ev && ev.type === 'discard' && ev.data && ev.data.tile != null) {
      this.speak(`${tileSuit(ev.data.tile)}${tileRank(ev.data.tile)}`, tileName(ev.data.tile))
    }
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
    // 手牌尺寸自适应要在量牌墙之前算：手牌区高度会跟着变
    this.fitHand()
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
      // 手牌牌背堆叠：对家横排在面板上方、左右两家竖排在面板内侧（竖屏改面板下横排），
      // 与牌墙同张贴图，牌数与 handCount 一致；数量不变时跳过重建（每帧 render 都走这里）
      const backs = this._els['backs' + s]
      if (backs) {
        const n = Math.max(0, Math.min(14, p.handCount || 0))
        if (backs._n !== n) {
          backs._n = n
          backs.innerHTML = ''
          for (let i = 0; i < n; i++) {
            const b = document.createElement('i')
            b.className = 'scmj-handback'
            backs.appendChild(b)
          }
        }
      }
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
        // 副露沿手牌末端摆放，不挤在头像下；保留同一节点供后续渲染复用。
        if (backs) backs.appendChild(meldRow)
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
  // 核心显示牌墙剩余张数（原「方位」二字无信息量；「剩余 X 张」从信息条收进来，
  // 弃牌全收进牌墙内圈后，罗盘是桌心唯一常驻元素）
  renderCompass(v) {
    const el = this._els.compass
    if (!el) return
    el.innerHTML = ''
    const core = document.createElement('div')
    core.className = 'scmj-compass-core'
    const cnt = document.createElement('b')
    cnt.textContent = v.wallCount
    core.appendChild(cnt)
    const lab = document.createElement('i')
    lab.textContent = '剩余'
    core.appendChild(lab)
    el.appendChild(core)
    // 风位圆牌渲染到独立层 .scmj-winds（z-index 0，沉在弃牌之下）：
    // 东南西北只是「牌桌嵌入的方位指示」，弃牌多了应压住它，而非被它挡住
    const windsEl = this._els.winds
    if (windsEl) windsEl.innerHTML = ''
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
      ;(windsEl || el).appendChild(w)
    })
  }

  // ---------- 中央信息 ----------
  renderCenter(v) {
    this.fitCenterBox() // 使用中央区实际宽高，不再缩成居中的小正方形
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

  // Use the whole rectangular table; only the artwork has perspective, not its hit boxes.
  fitCenterBox() {
    const slot=this._els.centerslot, box=this._els.centerbox
    if(!slot||!box||!slot.clientWidth||!slot.clientHeight)return
    box.style.width=slot.clientWidth+'px'
    box.style.height=slot.clientHeight+'px'
    const board=this.root.querySelector('.scmj-board')
    if(board) {
      board.style.setProperty('--scmj-back-step',Math.min(22,Math.max(8,(board.clientHeight-72)/14))+'px')
      board.style.setProperty('--scmj-back-width',Math.min(22,Math.max(10,Math.min((board.clientWidth-140)/14,board.clientHeight*.075)))+'px')
      // 杠比碰多一张，按各家实际总张数预算，四组副露也不挤出牌桌。
      for (const s of [1, 2, 3]) {
        const rack = this._els['backs' + s]
        if (!rack) continue
        const count = rack.querySelectorAll('.scmj-handback, .scmj-tile').length || 14
        const groups = rack.querySelectorAll('.scmj-meld').length
        const portrait = window.matchMedia('(max-width:760px) and (orientation:portrait)').matches
        const step = Math.max(5, Math.min(22, (board.clientHeight - 72 - groups * 4) / Math.max(14, count)))
        rack.style.setProperty('--scmj-back-step', step + 'px')
        rack.style.setProperty('--scmj-side-meld-w', Math.min(portrait ? 12 : 22, step * 1.4) + 'px')
        rack.style.setProperty('--scmj-back-width', Math.min(22, Math.max(6, Math.min((board.clientWidth - 140 - groups * 4) / Math.max(14, count), board.clientHeight * .075))) + 'px')
      }
    }
    this.fitChat()
  }

  fitChat() {
    const {chat, chatPanel, chatToggle, table} = this._els
    if (!chat || !table || table.hidden) return
    const root = this.root.getBoundingClientRect()
    const board = this.root.querySelector('.scmj-board').getBoundingClientRect()
    // 按钮固定在牌桌右下角、手牌区上方。面板绝对定位向上展开，不推动按钮。
    const top = Math.max(8, board.bottom - root.top - 48)
    chat.style.top = top + 'px'
    chatPanel.style.maxHeight = Math.max(60, top - 12) + 'px'
    if (chatToggle) chatToggle.setAttribute('aria-expanded', String(!chatPanel.hidden))
  }

  fitWallRing() {
    const ring=this._els.wallring,box=this._els.wallbox
    if(!ring||!box||!box.clientWidth||!box.clientHeight)return
    const w=box.clientWidth,h=box.clientHeight
    const tileW=Math.max(6,Math.min(10,Math.floor(Math.min(w,h)/26)))
    const tileH=Math.max(8,Math.min(24,Math.floor((Math.min(w,h)-4*tileW)/7)))
    const inset=2*tileW+3
    Object.assign(ring.style,{left:'0px',top:'0px',width:w+'px',height:h+'px'})
    box.style.setProperty('--scmj-wall-tile-w',tileW+'px')
    box.style.setProperty('--scmj-wall-tile-h',tileH+'px')
    box.style.setProperty('--scmj-wall-inset',inset+'px')
    box.style.setProperty('--scmj-felt-inset',inset+'px')
    box.style.setProperty('--scmj-compass-size',Math.min(54,(h-2*inset)*.22)+'px')
    this.fitDiscards()
  }

  fitDiscards() {
    const felt=this._els.felt
    if(!felt||!felt.clientWidth||!felt.clientHeight)return
    const wraps=[0,1,2,3].map(s=>this._els['discTiles'+s])
    const layout=riverLayout(felt.clientWidth,felt.clientHeight,wraps.map(el=>el.children.length))
    wraps.forEach((el,s)=>Array.from(el.children).forEach((tile,i)=>{
      const p=layout[s][i],side=s===1||s===3
      Object.assign(tile.style,{left:p.x+'px',top:p.y+'px',width:p.w+'px',height:p.h+'px'})
      tile.style.setProperty('--scmj-face-w',(side?p.h:p.w)+'px')
      tile.style.setProperty('--scmj-face-h',(side?p.w:p.h)+'px')
      tile.style.setProperty('--scmj-disc-rot',p.rotation+'deg')
    }))
  }

  /**
   * 手牌尺寸自适应（自己的牌是全桌最该看清的牌，不能写死成小常数）。
   * 宽度取「单行高度上限」与「横向每行放得下」的较小值，牌面按真实牌张比例
   * TILE_ASPECT 绘制（贴图正好铺满，不留空白边），所以牌面视觉就是写入的尺寸。
   * 尺寸经 CSS 变量下发（.scmj-tile-hand 用 var() 取，媒体查询只留兜底值），
   * JS 没跑到时仍是原来的固定尺寸，不会缩成 0。
   * 手牌区高度按「满手 14 张」的行数钉住：打牌 / 碰杠后张数变化不改变牌的大小，
   * 牌桌与中央牌墙不会跟着抖（与旧布局写死高度的用意一致）。
   */
  fitHand() {
    const el = this._els.hand
    if (!el) return
    if (!el.children.length) return
    const cs = getComputedStyle(el)
    const px = k => parseFloat(cs[k]) || 0
    const avail = el.clientWidth - px('paddingLeft') - px('paddingRight')
    if (!(avail > 0)) return // 入口 / 大厅里牌桌是隐藏的，量不到宽度
    const gap = HAND_DRAWN_GAP
    const slots = handSlotsPerRow() // 每行几张
    // 横向要留出：新摸牌那道正间距 + 4px 余量（避免临界时折行）
    const byWidth = (avail - gap - 4) / slots
    // 横屏矮屏手牌上限压到 60：中央牌墙/弃牌区被手牌区挤到 110px 以下时，
    // 桌心弃牌必然互相叠压（实测教训），手牌少 8px 换桌心平铺值得
    const landscapeShort = window.innerWidth > window.innerHeight && window.innerHeight <= 540
    const byHeight = (landscapeShort ? 60 : HAND_MAX_TILE_H) / TILE_ASPECT
    const w = Math.max(MIN_HAND_TILE_W, Math.min(byHeight, byWidth))
    const h = w * TILE_ASPECT
    const rows = Math.ceil(HAND_SLOTS_REF / slots)
    el.style.setProperty('--scmj-hand-tile-w', w.toFixed(1) + 'px')
    el.style.setProperty('--scmj-hand-tile-h', h.toFixed(1) + 'px')
    el.style.setProperty('--scmj-hand-gap', gap + 'px')
    const rowGap = px('rowGap') || px('gap')
    el.style.minHeight = Math.round(rows * h + (rows - 1) * rowGap + px('paddingTop') + px('paddingBottom')) + 'px'
  }

  // ---------- 中央牌墙（四方围一圈双层牌背，摸一张少一张） ----------
  // 只依赖 view.wallCount（不泄露墙序）。掷骰在起点方位（wallHead）墙内
  // 第 wallOpenOff 个牌位开牌，摸牌从开牌点起沿环序逐张吃掉——缺口
  // 从骰子点开的那一方中部出现并转圈扩大，被摸走的牌位留空不位移。
  renderWallRing(v) {
    this.fitWallRing() // 牌墙与弃牌尺寸依赖中央区实际宽高
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

  // ---------- 四方向弃牌（全部收进牌墙内圈 .scmj-felt，向桌心生长不滚动） ----------
  renderDiscards(v) {
    // 追踪「最新一张弃牌」：优先用引擎层 lastDiscard（打出瞬间即记录，落定/被碰走不清除）；
    // pendingDiscard 是未落定暂存（落定即清 null，同步推进 AI 时中间态未必渲染），
    // 仅作旧适配器没有 lastDiscard 字段时的兜底记忆
    if (v.pendingDiscard) this._lastDiscard = { seat: v.pendingDiscard.seat, tile: v.pendingDiscard.tile }
    const ld = v.lastDiscard || this._lastDiscard
    for (let s = 0; s < 4; s++) {
      const wrap = this._els['discTiles' + s]
      wrap.innerHTML = ''
      const list = v.players[s].discards
      list.forEach((id, i) => {
        const t = this.makeTile(id, 'disc')
        // 全局最新打出的那张：常驻金色亮圈（取代「最新出牌」文本提醒）；
        // 校验 id 一致——暂存牌被碰/杠拿走后该座位末位变成别的牌，亮圈不错位
        // （同点数牌的极小概率误亮可接受）；滑入动效只在未落定期间叠加
        if (ld && ld.seat === s && i === list.length - 1 && id === ld.tile) {
          t.classList.add('scmj-tile-latest')
          if (this.settings.animation && v.pendingDiscard && v.pendingDiscard.seat === s) t.classList.add('scmj-tile-new')
        }
        wrap.appendChild(t)
      })
    }
    this.fitDiscards()
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
        // from 非空：点炮/抢杠记放炮者；点杠包牌（自摸口径）记点杠者，标注“包赔”
        const fromText =
          hh.from != null
            ? (hh.how === 'zimo' ? '（包赔：' : '（放炮：') + this._labels[hh.from] + '）'
            : ''
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
    // 8. 按钮（内容由 updateSettleBtns 就地重绘：局间点「准备下一局」后只换按钮
    //    文案与等待提示，不重建整张结算卡，保留「查看详情」展开状态与滚动位置）
    const btns = document.createElement('div')
    btns.className = 'scmj-settle-btns'
    card.appendChild(btns)
    el.appendChild(card)
    el.hidden = false
    this.updateSettleBtns()
  }

  /**
   * 结算卡底部按钮（就地重绘）。三种口径：
   *   · 单机：再来一局 / 返回官网（破产后禁用再来一局）；
   *   · 联机：准备下一局 / 退出房间（破产终态禁用准备）；
   *   · 联机局间等待（已点准备、牌桌不切走）：可「取消准备」，并显示准备人数。
   * 抽成独立方法是为了服务端每次推 READY_CHANGED 时只重绘按钮区——整卡重建会
   * 重置「查看详情」的展开状态与滚动位置，且每次有人准备都闪一下。
   */
  updateSettleBtns() {
    const box = this._els.settle && this._els.settle.querySelector('.scmj-settle-btns')
    if (!box) return
    box.innerHTML = ''
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
      } else if (this._awaitingNextRound && this.iAmReady()) {
        again.textContent = '取消准备'
        again.addEventListener('click', () => this.onOnlineReady(false))
      } else {
        again.textContent = '准备下一局'
        again.addEventListener('click', () => this.onOnlineReady(true))
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
    box.appendChild(again)
    box.appendChild(home)
    if (this.isOnline && this._awaitingNextRound) {
      const hint = document.createElement('div')
      hint.className = 'scmj-settle-wait'
      hint.textContent = this.readyWaitText()
      box.appendChild(hint)
    }
  }

  /** 本座位在房间快照里的准备状态（联机）；无快照时按已准备处理 */
  iAmReady() {
    const room = this.lobby && this.lobby.room
    const seat = this.onlinePlayer
      ? this.onlinePlayer.seatIndex
      : (this.lobby ? this.lobby.mySeat : null)
    const snap = room && Array.isArray(room.seats) && seat != null ? room.seats[seat] : null
    return snap ? !!snap.ready : true
  }

  /** 局间等待提示：已准备几家 / 共几家（只统计在线真人，与「全员准备」口径一致） */
  readyWaitText() {
    const room = this.lobby && this.lobby.room
    if (!room || !Array.isArray(room.seats)) return '已准备，等待其他玩家开始下一局…'
    const humans = room.seats.filter(s => s.occupantType === 'HUMAN' && s.connected !== false)
    const readyN = humans.filter(s => s.ready).length
    return '已准备 ' + readyN + ' / ' + humans.length + ' 人 · 全员准备后自动开始第 ' +
      ((room.round || 1) + 1) + ' 局'
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

  // ==================== 音效 / 背景音乐 / 语音播报 ====================

  _ensureAudio() {
    if (typeof window === 'undefined') return null
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      if (!this._ac) {
        this._ac = new AC()
        this._master = this._ac.createGain()
        this._master.gain.value = 0.6
        this._master.connect(this._ac.destination)
      }
      // iOS 录音停止会把 context 打进 'interrupted'（非 suspended），同样需要 resume，
      // 否则录音刚停时的自动播排在冻结时间线上无声（第二次发语音不自动播的根因之一）
      if (this._ac.state === 'suspended' || this._ac.state === 'interrupted') this._ac.resume().catch(() => {})
      return this._ac
    } catch (e) {
      return null
    }
  }

  _note(freq, length = 0.1, volume = 0.14, type = 'sine', delay = 0) {
    const ac = this._ac
    if (!ac || ac.state === 'closed') return
    const o = ac.createOscillator()
    const g = ac.createGain()
    const t = ac.currentTime + delay
    o.type = type
    o.frequency.value = freq
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(volume, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + length)
    o.connect(g)
    g.connect(this._master)
    o.start(t)
    o.stop(t + length + 0.02)
    o.onended = () => { o.disconnect(); g.disconnect() }
  }

  sound(type) {
    if (!this.settings.sound || typeof window === 'undefined') return
    if (!this._ensureAudio()) return
    // 特殊音效期间压低 BGM（临时档，与读秒持续档叠乘；click/discard/deal 太短不压）
    const duckSec = { peng: 0.5, gang: 0.7, hu: 1.2, dice: 0.9, draw: 0.3 }[type]
    if (duckSec) this._duckBgmTemp(duckSec)
    // 碰/杠/胡用和弦垫底（语音播报同步进行），其余为轻量单音
    if (type === 'peng') {
      this._note(520, 0.14, 0.1, 'triangle')
      this._note(780, 0.12, 0.06, 'triangle', 0.02)
    } else if (type === 'gang') {
      this._note(420, 0.2, 0.12, 'triangle')
      this._note(210, 0.24, 0.09, 'sine')
      this._note(630, 0.16, 0.06, 'triangle', 0.03)
    } else if (type === 'hu') {
      ;[660, 880, 1108.7].forEach((f, i) => this._note(f, 0.2, 0.1, 'triangle', i * 0.06))
    } else if (type === 'draw') {
      // 抓牌：短促上扬双音，模拟牌张从牌墙上被抹走的摩擦感
      this._note(330, 0.045, 0.1, 'triangle')
      this._note(590, 0.06, 0.11, 'triangle', 0.032)
    } else if (type === 'dice') {
      // 掷骰：一串随机音高的短咔哒（骰子乱跳碰撞），最后一记低频落定
      for (let i = 0; i < 6; i++) {
        this._note(680 + Math.random() * 520, 0.035, 0.075, 'square', i * 0.085)
      }
      this._note(230, 0.15, 0.12, 'triangle', 6 * 0.085 + 0.04)
    } else {
      const conf = {
        click: [660, 0.05, 0.07],
        discard: [320, 0.09, 0.09],
        deal: [440, 0.12, 0.08]
      }[type] || [600, 0.05, 0.06]
      this._note(conf[0], conf[1], conf[2], 'sine')
    }
  }

  /** 只停 Web Audio 合成（切后台用），BGM 音频文件不动 */
  _stopSynth() {
    clearInterval(this._musicTimer)
    this._musicTimer = null
  }

  /** 背景音乐：优先音乐文件循环（Ishikari Lore · Kevin MacLeod, CC-BY 4.0），
   *  文件缺失时回退 Web Audio 合成（A 宫五声音阶，竹笛 pluck + 低音 drone）。
   *  音频文件在页面后台/锁屏后可继续播放（已设 MediaSession 元信息）。 */
  music(active) {
    this._stopSynth()
    if (!active || this.settings.music === false) {
      if (this._bgm) this._bgm.pause()
      return
    }
    if (typeof document !== 'undefined' && document.hidden) return
    if (!this._bgmFailed) {
      if (!this._bgm) {
        try {
          const a = new Audio('/audio/mahjong/bgm.mp3')
          a.loop = true
          a.volume = 0.5
          a.addEventListener('error', () => { this._bgmFailed = true; this._bgm = null; this.music(true) })
          this._bgm = a
          // 锁屏/后台播放时让系统媒体中心显示标题（提升后台保活待遇）
          if ('mediaSession' in navigator) {
            try {
              navigator.mediaSession.metadata = new MediaMetadata({ title: '四川麻将 · 背景音乐', artist: 'Kevin MacLeod', album: 'Vectorac' })
            } catch (e) { /* 忽略 */ }
          }
        } catch (e) {
          this._bgmFailed = true
        }
      }
      if (this._bgm) {
        this._duckApply() // 新建的 BGM 也要套用进行中的 duck（读秒/音效临时档）
        if (this._bgm.paused) {
          const p = this._bgm.play()
          if (p && p.catch) p.catch(() => {})
        }
        return
      }
    }
    if (!this._ensureAudio()) return
    const scale = [440, 493.88, 554.37, 659.25, 739.99] // A B C# E F#
    const melody = [3, 0, 4, 0, 3, 2, 0, 1, 0, 2, 3, 0, 5, 0, 4, 0] // 16 步，0=休止
    let step = this._musicStep || 0
    const tick = () => {
      if (!this._ac || this._ac.state !== 'running') return
      // 合成兜底 BGM 同样服从交流档（音量不可调，语音消息/短语播放期间直接静默）
      if ((this._bgmCommDucks || 0) > 0) {
        step++
        this._musicStep = step
        return
      }
      const n = melody[step % 16]
      if (n) this._note(scale[n - 1], 0.55, 0.07, 'triangle')
      if (step % 8 === 0) this._note(110, 1.5, 0.06, 'sine')
      step++
      this._musicStep = step
    }
    tick()
    this._musicTimer = setInterval(tick, 320)
  }

  /**
   * 语音播报（动作/报牌/短语），抢占式：新播报立即顶替旧的，保证「打哪张报哪张」零延迟。
   * 优先级：报牌（牌名 wan/tong/tiao）为低；碰/杠/胡/自摸/短语（peng/gang/hu/zimo/phrase）
   * 为高。高优先级播报期间新来的报牌直接丢弃（不排队不补播）；其余情况一律掐旧播新
   * （连打只报最新一张；杠上花「杠」→「自摸」也能及时接上）。
   * 真人录音优先：/audio/mahjong/{key}.mp3 存在即播放；文件缺失时回退浏览器语音合成。
   */
  speak(key, text) {
    if (this.settings.sound === false || typeof window === 'undefined') return
    const say = text || { peng: '碰！', gang: '杠！', hu: '胡喽！', zimo: '自摸！' }[key]
    if (!say) return
    const lowPrio = /^(wan|tong|tiao)/.test(key) // 仅报牌为低优先级
    const now = this._voiceNow
    if (now && !now.lowPrio && lowPrio) return // 高优先级播报中，报牌让路
    this._stopVoiceNow()
    // 播报与语音消息互斥：报牌/短语开声前掐掉正在播的语音消息
    if (this._voiceMsgPlaying) {
      try { this._voiceMsgPlaying.pause() } catch (e) { /* 忽略 */ }
      if (this._voiceMsgPlaying._release) this._voiceMsgPlaying._release()
      this._voiceMsgPlaying = null
    }
    const item = { key, say, lowPrio }
    this._voiceNow = item
    // 音量层级：快捷短语=用户交流（最高层级，BGM 压到近乎静音）；
    // 动作/报牌播报=事件档（与音效同级）
    if (/^phrase-/.test(key)) this._duckBgmComm(1.6)
    else this._duckBgmTemp(1.6) // 播报期间压低 BGM（真人录音多为 1~2 秒）
    this._playVoiceItem(item)
  }

  /** 掐断当前播报（抢占或销毁时用）；不清 _voiceCache（复用已加载音频） */
  _stopVoiceNow() {
    const clip = this._voicePlaying
    if (clip) {
      try { clip.pause() } catch (e) { /* 忽略 */ }
    }
    this._voicePlaying = null
    try {
      const synth = window.speechSynthesis
      if (synth) synth.cancel()
    } catch (e) { /* 忽略 */ }
    this._voiceNow = null
  }

  _playVoiceItem(item) {
    const { key } = item
    // 播完/失败/超时统一收尾：只有没被更新的播报顶替时才释放占用标记
    const done = () => {
      if (this._voiceNow === item) this._voiceNow = null
    }
    if (!this._voiceCache) this._voiceCache = {}
    let clip = this._voiceCache[key]
    if (!clip) {
      try {
        clip = new Audio(`/audio/mahjong/${key}.mp3`)
        clip.preload = 'auto'
        clip.addEventListener('error', () => { clip._broken = true })
        this._voiceCache[key] = clip
      } catch (e) {
        this._speakSynth(item)
        return
      }
    }
    if (clip._broken) {
      this._speakSynth(item)
      return
    }
    try {
      clip.currentTime = 0
      let settled = false
      const timer = setTimeout(() => finish(), 5000) // 加载卡死兜底，防占用标记永不释放
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        clip.removeEventListener('ended', finish)
        clip.removeEventListener('error', onErr)
        if (this._voicePlaying === clip) this._voicePlaying = null
        done()
      }
      const onErr = () => { clip._broken = true; finish() }
      clip.addEventListener('ended', finish, { once: true })
      clip.addEventListener('error', onErr, { once: true })
      const p = clip.play()
      this._voicePlaying = clip
      if (p && p.catch) {
        p.catch(() => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          clip.removeEventListener('ended', finish)
          clip.removeEventListener('error', onErr)
          clip._broken = true
          if (this._voicePlaying === clip) this._voicePlaying = null
          // 文件加载失败回退合成；若该条已被顶替则无需再播
          if (this._voiceNow === item) this._speakSynth(item)
          else done()
        })
      }
    } catch (e) {
      clip._broken = true
      this._speakSynth(item)
    }
  }

  _speakSynth(item) {
    const say = item.say
    const done = () => {
      if (this._voiceNow === item) this._voiceNow = null
    }
    try {
      const synth = window.speechSynthesis
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
        done()
        return
      }
      const u = new SpeechSynthesisUtterance(say)
      u.lang = 'zh-CN'
      u.pitch = 1.4
      u.rate = 1.15
      u.volume = 0.9
      u.onend = done
      u.onerror = done
      synth.speak(u)
      // 合成不可用手势/无声环境时兜底跳过，防占用标记卡死
      setTimeout(done, 5000)
    } catch (e) {
      done()
    }
  }
}
