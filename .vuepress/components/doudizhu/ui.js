// ============================================================
// 经典斗地主 UI（doudizhu/ui.js）
// 中国农村风牌桌：四方桌背景、地主/农民形象头像、对手牌背扇形；
// 叫分阶梯按钮、底牌翻转（仅亮牌时翻一次）、倒计时圈、报双警报、
// 炸弹粒子爆炸+翻倍提示、火箭升空拖尾、春天花瓣、胜利金币雨、
// 出牌 TTS 报牌（mp3 优先、浏览器 TTS 兜底）、⛶ 全屏沉浸 +
// 移动端默认强制横屏（移植 mahjong 的 CSS 虚拟视口方案）。
// 事件流驱动渲染，引擎权威。
// ============================================================

import {
  createGame, dispatch, playerView, settlementOf, drainEvents,
  classifyCombo, rankOf, suitOf, COMBO_LABEL
} from './engine.mjs'
import { aiDecide, hintPlay } from './ai.js'
import { createDoudizhuAudio } from './audio.js'
import { playingCard } from '../balatro/art.mjs'

const TURN_SECONDS = 20
const AI_NAMES = ['独孤求败', '常胜将军']
const AI_AVATARS = ['🗡️', '🎖️']
// 口播文本（语音兜底 & 与 gen-doudizhu-tts.mjs 条目一致）
const SPOKEN = ['三', '四', '五', '六', '七', '八', '九', '十', '勾', '圈', '凯', '尖', '二']
const BID_SPOKEN = ['不叫', '一分', '两分', '三分']

// QQ 积分等级
const LEVELS = [
  [30, '包身工'], [60, '短工'], [90, '长工'], [180, '佃户'], [320, '贫农'],
  [530, '渔夫'], [840, '猎人'], [1150, '中农'], [1600, '富农'], [2300, '掌柜'],
  [3450, '商人'], [5000, '衙役'], [6900, '小财主'], [9200, '大财主'],
  [12600, '小地主'], [17700, '大地主'], [23000, '知县'], [32200, '通判'],
  [46000, '知府'], [69000, '总督'], [103000, '巡抚'], [161000, '丞相'], [Infinity, '帝王']
]
const levelOf = pts => LEVELS.find(([cap]) => pts < cap)[1]

const h = (tag, cls, text) => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text !== undefined) el.textContent = text
  return el
}

/** 报牌语音 key / 兜底文本（与 scripts/gen-doudizhu-tts.mjs 条目对齐） */
function voiceForCombo(combo) {
  const r = combo.rank
  switch (combo.type) {
    case 'single':
      if (r === 17) return ['s-17', '大王']
      if (r === 16) return ['s-16', '小王']
      return [`s-${r}`, SPOKEN[r - 3]]
    case 'pair': return [`p-${r}`, '对' + SPOKEN[r - 3]]
    case 'triple': return [`t-${r}`, '三个' + SPOKEN[r - 3]]
    case 'trio_solo': return ['trio-solo', '三带一']
    case 'trio_pair': return ['trio-pair', '三带二']
    case 'straight': return ['straight', '顺子']
    case 'pair_seq': return ['pair-seq', '连对']
    case 'plane': return ['plane', '飞机']
    case 'plane_solo':
    case 'plane_pair': return ['plane-wings', '飞机带翅膀']
    case 'quad_solo':
    case 'quad_pair': return ['quad', '四带二']
    case 'bomb': return ['bomb', '炸弹']
    case 'rocket': return ['rocket', '王炸']
    default: return [null, null]
  }
}

/** 大/小王牌面：与小丑牌同源的 SVG 彩绘（大王红 / 小王黑），120x168 与扑克同版式。
    左上/右下（倒置）竖排英文 JOKER 角标，红黑配色区分大小王 */
function jokerSvg(rank) {
  const big = rank === 17
  const hue = big ? 0 : 215
  const color = big ? '#c22f3c' : '#22262e'
  // 竖排 JOKER 角标（标准扑克样式）
  const corner = '<g font-family="Georgia, serif" font-size="11" font-weight="bold" fill="' + color + '" text-anchor="middle">' +
    'JOKER'.split('').map((ch, i) => `<text x="13" y="${26 + i * 13}">${ch}</text>`).join('') + '</g>'
  // 小丑帽 + 脸谱（取自 balatro/art.mjs 的 joker face，按大/小王定色）
  const face = `
    <path d="M26 68Q14 29 39 43L56 24 73 43Q101 24 95 69L82 56 69 62 55 46 44 67Z" fill="hsl(${hue},55%,46%)" stroke="#273b43" stroke-width="3"/>
    <circle cx="27" cy="66" r="5" fill="#e9c967"/><circle cx="56" cy="25" r="5" fill="#e9c967"/><circle cx="95" cy="66" r="5" fill="#e9c967"/>
    <path d="M39 61Q33 99 58 115Q85 102 82 60L65 67 55 53 45 70Z" fill="#f0d7af" stroke="#273b43" stroke-width="3"/>
    <path d="M44 80l8-3m15 0 9 3M48 95Q61 106 74 92" fill="none" stroke="#293640" stroke-width="3"/>
    <path d="M58 81L55 91 64 92" fill="none" stroke="#ba6960" stroke-width="2"/>
    <path d="M34 122L43 108 58 118 76 108 87 123 71 121 60 135 46 121Z" fill="hsl(${hue},50%,42%)" stroke="#273b43" stroke-width="2"/>`
  return `<svg viewBox="0 0 120 168" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="1" y="1" width="118" height="166" rx="7" fill="#f6f1df" stroke="#ded8c8" stroke-width="2"/>` +
    `<rect x="4" y="4" width="112" height="160" rx="5" fill="none" stroke="#fff" stroke-opacity=".6"/>` +
    face + corner + `<g transform="rotate(180 60 84)">${corner}</g>` +
    `</svg>`
}

/** 牌面复用小丑牌（Balatro）SVG 绘制：数字牌对称花点、J/Q/K 双头人像、A 大花色。
    斗地主 rank 3..15（15=2）映射到 balatro 的 2..14（14=A）；suit 编码两边一致（0♠1♥2♣3♦） */
function cardEl(card, mini) {
  const el = h('div', 'ddz-card' + (mini ? ' ddz-card-mini' : ''))
  const rank = rankOf(card)
  el.innerHTML = rank >= 16
    ? jokerSvg(rank)
    : playingCard({ suit: suitOf(card), rank: rank === 15 ? 2 : rank })
  return el
}

export default class DoudizhuUI {
  /**
   * @param {HTMLElement} root 挂载点
   * @param {Object} [opts] online 适配器（联机模式，服务端权威）：
   *   { tryAction(action), seatName(seat), roomScores(), leave() }
   *   联机时本地不 createGame / 不跑本地 AI / 不写本地积分，
   *   状态由 applyOnlineView(view) 注入（remote.js 在每次 GAME_STATE_CHANGED 后调用）。
   */
  constructor(root, opts = {}) {
    this.root = root
    this.online = opts.online || null
    this._actsLen = 0 // 联机：已消费的 acts 日志长度（diff 事件用）
    this.audio = createDoudizhuAudio()
    this.seat = 0 // 单机人类固定 0 号位；联机为服务端分配的绝对座位
    this.selected = new Set()
    this.lastHint = null
    this.points = Number(localStorage.getItem('ddz-points') || 0)
    this.timer = null
    this.aiTimer = null
    this.particles = []
    this.fxRaf = 0
    this.rocketEl = null
    this._playedKeys = {}
    this._bottomKey = null
    this._destroyed = false
    // 隐藏全站右下角浮动客服，避免遮挡右侧玩家面板
    this.cwFab = document.getElementById('cw-fab')
    if (this.cwFab) { this.cwFabPrevDisplay = this.cwFab.style.display; this.cwFab.style.display = 'none' }
    // 站点 fixed navbar（全屏时需隐藏，否则盖住游戏顶栏 ⛶ 无法退出）
    this.navbar = document.querySelector('header.navbar') || document.querySelector('.navbar')
    // 精确贴合视口：根元素顶到屏幕底，规避主题 navbar/页脚高度差异。
    // 内容微溢会让页面可滚动，一旦 scrollY>0 量到的 top 偏小、height 越算越大
    // （恶性循环），所以测量前强制滚回顶部；全屏时 root 已 portal 到 body 下
    // （fixed 包含块即视口，CSS inset:0 铺满），此处只需重测粒子画布，
    // 并重算手牌错位（否则转屏后还用旧宽度算出的负边距，牌会溢出看不见）。
    this.fitViewport = () => {
      if (this.root.classList.contains('ddz-full')) {
        if (this._syncSpacer) this._syncSpacer()
        if (this.resizeFx) this.resizeFx()
        if (this.fitHandShift) this.fitHandShift()
        return
      }
      if (window.scrollY > 0) window.scrollTo(0, 0)
      const top = Math.max(0, this.root.getBoundingClientRect().top)
      this.root.style.height = Math.max(320, window.innerHeight - top) + 'px'
      if (this.resizeFx) this.resizeFx()
      if (this.fitHandShift) this.fitHandShift()
    }
    // 本页禁止整页滚动（游戏视口精确贴合，滚动只会触发上述漂移）。
    // 用 class 而非 inline style：移动端全屏期间需要临时解除（见 setImmersive），
    // class 切换即可，不必记录/还原 inline 值
    document.body.classList.add('ddz-lock')
    window.addEventListener('resize', this.fitViewport)
    window.addEventListener('orientationchange', this.fitViewport)
    // iOS Safari 工具栏收起/展开有时只触发 visualViewport resize（不触发 window resize）
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this.fitViewport)
    this.buildDom()
    this.bindGestures()
    // 强制横屏机制（竖屏持机时旋转桌面铺满）。与 mahjong 对齐：
    // 页面加载不自动进全屏——iOS 无用户手势时原生全屏必被拒绝、地址栏推不走；
    // 点「开始游戏」拿到手势后再进全屏+强制横屏
    this._setupForceLandscape()
    // 主题 navbar 水合/字体加载会二次撑高页头，分多次重测贴合
    requestAnimationFrame(this.fitViewport)
    window.addEventListener('load', this.fitViewport)
    this.fitTimers = [setTimeout(this.fitViewport, 400), setTimeout(this.fitViewport, 1200)]
    if (!this.online) this.showLobby()
  }

  /** 开始大厅：点「开始游戏」（用户手势）后才进全屏横屏开打（对齐 mahjong 流程） */
  showLobby() {
    if (this.online) return // 联机：等待室由 remote.js 渲染，UI 只挂对局桌面
    this.clearTimers()
    this.overlay.style.display = 'none'
    this.root.classList.remove('ddz-over')
    if (!this.lobbyEl) {
      this.lobbyEl = h('div', 'ddz-lobby')
      const btn = h('button', 'ddz-btn ddz-btn-primary ddz-lobby-start', '开 始 游 戏')
      btn.type = 'button'
      btn.onclick = () => {
        this.lobbyEl.style.display = 'none'
        this.newGame()
        this.setImmersive(true)
      }
      this.lobbyEl.append(
        h('div', 'ddz-lobby-title', '🃏 斗地主'),
        h('div', 'ddz-lobby-sub', '经典三人 · 叫分抢地主 · 炸弹翻倍'),
        btn,
        h('div', 'ddz-lobby-tip', '进入后为全屏牌桌 · 竖屏持机会自动转为横屏画面')
      )
      this.table.append(this.lobbyEl)
    }
    this.lobbyEl.style.display = ''
  }

  // ---------- DOM 骨架 ----------
  buildDom() {
    const r = this.root
    r.innerHTML = ''
    // 顶栏
    this.topbar = h('div', 'ddz-topbar')
    this.elMult = h('span', 'ddz-chip ddz-chip-mult', '倍数 ×1')
    this.elBase = h('span', 'ddz-chip', '底分 -')
    this.elLevel = h('span', 'ddz-chip ddz-chip-level', `${levelOf(this.points)} ${this.points}分`)
    const btnMusic = h('button', 'ddz-icon-btn is-on', '♫')
    btnMusic.type = 'button'
    btnMusic.title = '背景音乐'
    btnMusic.onclick = () => {
      this.audio.setMusicOn(!this.audio.musicOn)
      btnMusic.classList.toggle('is-on', this.audio.musicOn)
    }
    const btnSound = h('button', 'ddz-icon-btn is-on', '🔔')
    btnSound.type = 'button'
    btnSound.title = '音效与报牌'
    btnSound.onclick = () => {
      this.audio.setSoundOn(!this.audio.soundOn)
      btnSound.classList.toggle('is-on', this.audio.soundOn)
    }
    this.btnFull = h('button', 'ddz-icon-btn', '⛶')
    this.btnFull.type = 'button'
    this.btnFull.title = '全屏'
    this.btnFull.onclick = () => this.toggleFull()
    const btnExit = h('a', 'ddz-icon-btn', '✕')
    if (this.online) {
      btnExit.href = 'javascript:void(0)'
      btnExit.title = '退出房间'
      btnExit.onclick = () => this.online.leave()
    } else {
      btnExit.href = '/blogs/other/games.html'
      btnExit.title = '返回游戏列表'
    }
    // 单机页联机入口：跳联机大厅预选斗地主（对齐军棋单机页）
    const btnOnline = this.online ? null : h('a', 'ddz-icon-btn ddz-icon-online', '🌐')
    if (btnOnline) {
      btnOnline.href = '/blogs/other/gamehall.html?game=doudizhu'
      btnOnline.title = '联机对战'
    }
    this.topbar.append(
      h('span', 'ddz-logo', '斗地主'),
      this.elBase, this.elMult,
      h('span', 'ddz-topbar-gap'),
      this.elLevel, btnMusic, btnSound, this.btnFull, ...(btnOnline ? [btnOnline] : []), btnExit
    )
    // 桌面
    this.table = h('div', 'ddz-table')
    // 底牌区
    this.bottomWrap = h('div', 'ddz-bottom-cards')
    // 对手面板（左 2 号位 = 我上家？逆时针：1 下家右，2 上家左）
    // 横排布局：头像信息块 + 竖排牌背列（QQ 斗地主式，一眼看出剩牌数）
    this.oppPanels = {}
    for (const s of [2, 1]) {
      const p = h('div', `ddz-opp ddz-opp-${s === 2 ? 'left' : 'right'}`)
      const main = h('div', 'ddz-opp-main')
      main.append(
        h('div', 'ddz-avatar', AI_AVATARS[s - 1]),
        h('div', 'ddz-opp-name', AI_NAMES[s - 1]),
        h('div', 'ddz-role'),
        h('div', 'ddz-timer', '')
      )
      const side = h('div', 'ddz-opp-side')
      side.append(
        // 竖排牌背列：每张背对应一手牌
        h('div', 'ddz-opp-backs'),
        h('div', 'ddz-opp-count')
      )
      p.append(main, side, h('div', 'ddz-bid-bubble'))
      this.oppPanels[s] = p
    }
    // 出牌区
    this.playAreas = {}
    this.playAreas[2] = h('div', 'ddz-played ddz-played-left')
    this.playAreas[1] = h('div', 'ddz-played ddz-played-right')
    this.playAreas[0] = h('div', 'ddz-played ddz-played-me')
    // 状态条
    this.status = h('div', 'ddz-status')
    // 操作区
    this.actions = h('div', 'ddz-actions')
    // 我的面板
    this.mePanel = h('div', 'ddz-me-panel')
    // 手牌
    this.handEl = h('div', 'ddz-hand')
    // 粒子画布层
    this.fxCanvas = h('canvas', 'ddz-fx-canvas')
    // 特效层（emoji 文案）
    this.fx = h('div', 'ddz-fx')
    // 结算层
    this.overlay = h('div', 'ddz-overlay')
    this.overlay.style.display = 'none'
    this.table.append(
      this.bottomWrap,
      this.oppPanels[2], this.oppPanels[1],
      this.playAreas[2], this.playAreas[1], this.playAreas[0],
      this.status, this.actions, this.mePanel, this.handEl,
      this.fxCanvas, this.fx, this.overlay
    )
    r.append(this.topbar, this.table)
    // 粒子画布随桌面尺寸（用 offset 尺寸：强制横屏旋转后
    // getBoundingClientRect 返回的是变换后的包围盒，宽高是反的）
    this.resizeFx = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      this.fxCanvas.width = Math.max(1, Math.round(this.table.offsetWidth * dpr))
      this.fxCanvas.height = Math.max(1, Math.round(this.table.offsetHeight * dpr))
      this.fxDpr = dpr
    }
    this.resizeFx()
  }

  bindGestures() {
    // 首次手势解锁音频（WebAudio + 共享 <audio> 元素）；
    // 自动沉浸时原生全屏可能因缺少手势被拒，首次点按补一次请求
    const unlock = () => {
      this.audio.unlock()
      if (this.root.classList.contains('ddz-full') && !document.fullscreenElement && !document.webkitFullscreenElement) {
        try {
          const req = this.root.requestFullscreen || this.root.webkitRequestFullscreen
          if (req) {
            const p = req.call(this.root)
            if (p && p.catch) p.catch(() => { /* ignore */ })
          }
        } catch (e) { /* ignore */ }
      }
    }
    this.root.addEventListener('pointerdown', unlock, { once: true })
    this.root.addEventListener('touchstart', unlock, { once: true })
  }

  // ---------- 全屏 / 强制横屏 ----------
  // 沉浸全屏：root 移入 document.body（portal，fixed 包含块即视口）+ 隐藏站点
  // navbar；触屏设备再对 root 请求原生全屏（Android 生效；iOS 不支持则仅 CSS）。
  // 滚动垫层：iOS Safari 工具栏收起的先决条件是「文档可滚动」。
  // 全屏 root 是 fixed（不占文档流），portal 走后页面内容塌缩，
  // scrollHeight≈0 文档滚不动 → 上滑手势无法被识别为页面滚动 →
  // 工具栏永远收不起。垫一块 innerHeight+120px 的隐形层保证文档
  // 永远可滚；fixed 游戏不随文档滚动，工具栏收起后 resize 触发
  // inset:0 自动长高铺满（麻将等页面背后天然有长内容，无需此层）
  _syncSpacer() {
    if (!this._scrollSpacer) return
    this._scrollSpacer.style.height = (window.innerHeight + 120) + 'px'
  }

  setImmersive(on) {
    if (this._destroyed) return
    const coarse = (() => {
      try { return window.matchMedia('(pointer: coarse)').matches } catch (e) { return false }
    })()
    const already = this.root.classList.contains('ddz-full')
    if (on) {
      // 幂等：已全屏时只确保垫层在位，不重复 portal/建 anchor
      // （大厅点全屏→开始游戏会连调两次 true；重复建 anchor 会让
      //   退出时 root 回到 body 内的错误位置，页面结构错乱）
      if (already) {
        if (coarse) {
          document.body.classList.remove('ddz-lock')
          if (!this._scrollSpacer) this._scrollSpacer = h('div', 'ddz-scroll-spacer')
          if (!this._scrollSpacer.parentNode) document.body.appendChild(this._scrollSpacer)
          this._syncSpacer()
        }
        return
      }
      this._anchor = document.createComment('ddz-root-anchor')
      if (this.root.parentNode) this.root.parentNode.insertBefore(this._anchor, this.root)
      document.body.appendChild(this.root)
      this.root.classList.add('ddz-full')
      this.root.style.height = '' // 清掉非全屏时的贴合高度，改由 CSS inset:0
      if (this.navbar) this.navbar.style.display = 'none'
      if (coarse) {
        // 触屏设备：解锁文档 + 加滚动垫层（工具栏收起机制，见 _syncSpacer 注释）。
        // 桌面保持锁定：没有工具栏问题，锁住还可避免出现页面滚动条。
        // 垫层可能被 setImmersive(false) remove 过（引用未清），必须检查
        // parentNode 重新挂回——否则二次进全屏垫层缺失，导航栏又收不起了
        document.body.classList.remove('ddz-lock')
        if (!this._scrollSpacer) this._scrollSpacer = h('div', 'ddz-scroll-spacer')
        if (!this._scrollSpacer.parentNode) document.body.appendChild(this._scrollSpacer)
        this._syncSpacer()
      }
      try {
        if (coarse && !document.fullscreenElement && !document.webkitFullscreenElement) {
          const req = this.root.requestFullscreen || this.root.webkitRequestFullscreen
          if (req) {
            const p = req.call(this.root)
            if (p && p.catch) p.catch(() => { /* 用户拒绝或不支持则仅用 CSS 全屏 */ })
          }
        }
      } catch (e) { /* 不支持则仅使用 CSS 全屏 */ }
    } else {
      if (!already) return // 幂等：未全屏时退出无操作
      this.root.classList.remove('ddz-full')
      this.root.style.width = ''
      this.root.style.height = ''
      this.root.style.top = ''
      if (this._scrollSpacer && this._scrollSpacer.parentNode) this._scrollSpacer.remove()
      this._scrollSpacer = null // 置空：下次进全屏重新创建挂载
      document.body.classList.add('ddz-lock') // 回到大厅：恢复文档锁定
      if (this._anchor && this._anchor.parentNode) {
        this._anchor.parentNode.insertBefore(this.root, this._anchor)
        this._anchor.remove()
      }
      this._anchor = null
      if (this.navbar) this.navbar.style.display = ''
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          const ex = document.exitFullscreen || document.webkitExitFullscreen
          if (ex) {
            const p = ex.call(document)
            if (p && p.catch) p.catch(() => { /* ignore */ })
          }
        }
      } catch (e) { /* ignore */ }
    }
    this.btnFull.classList.toggle('is-on', on)
    if (this._flsApply) this._flsApply()
    setTimeout(this.fitViewport, 60)
    setTimeout(this.fitViewport, 380)
  }

  toggleFull() {
    this.setImmersive(!this.root.classList.contains('ddz-full'))
  }

  // 移植自 mahjong/ui.js：竖屏持机时把牌桌旋转 90° 铺满竖屏（用户看到横屏画面）。
  // 难点在 CSS 媒体查询按「物理视口」评估——旋转后 portrait 规则错误命中、
  // landscape 规则缺失。解法：CSSOM 直接改写 CSSMediaRule 的 mediaText，强制
  // 横屏期间按「虚拟视口」（宽高互换）重新评估每条规则，解除时逐一还原原文。
  // 用户一旦物理旋转过屏幕（orientationchange），本会话内横竖屏自由切换。
  _setupForceLandscape() {
    if (typeof window === 'undefined') return
    const KEY = 'ddz-rotated'
    let rotated = false
    try { rotated = sessionStorage.getItem(KEY) === '1' } catch (e) { /* 隐私模式忽略 */ }
    const isMobile = () => {
      try { if (window.matchMedia('(pointer: coarse)').matches) return true } catch (e) { /* ignore */ }
      return 'ontouchstart' in window && Math.min(window.screen.width, window.screen.height) < 820
    }
    const evalCond = (cond, vw, vh) => {
      let m = cond.match(/max-width\s*:\s*([\d.]+)px/)
      if (m) return vw <= +m[1]
      m = cond.match(/min-width\s*:\s*([\d.]+)px/)
      if (m) return vw >= +m[1]
      m = cond.match(/max-height\s*:\s*([\d.]+)px/)
      if (m) return vh <= +m[1]
      m = cond.match(/min-height\s*:\s*([\d.]+)px/)
      if (m) return vh >= +m[1]
      if (/orientation\s*:\s*portrait/.test(cond)) return vh >= vw
      if (/orientation\s*:\s*landscape/.test(cond)) return vw > vh
      return null // 不认识的条件 → 整条媒体查询保持原样不动
    }
    // 逗号分组任一命中即命中；组内 and 需全部成立。有解析不了的组则整体返回 null。
    const evalMedia = (text, vw, vh) => {
      let sawUnknown = false, sawHit = false
      for (const part of text.split(',')) {
        const conds = []
        const re = /\(([^)]+)\)/g
        let mm
        while ((mm = re.exec(part))) conds.push(mm[1])
        if (!conds.length) {
          if (/^\s*(all|screen)?\s*$/.test(part)) sawHit = true
          else sawUnknown = true
          continue
        }
        let allHit = true, unknown = false
        for (const c of conds) {
          const r = evalCond(c, vw, vh)
          if (r === null) { unknown = true; break }
          if (!r) { allHit = false; break }
        }
        if (unknown) sawUnknown = true
        else if (allHit) sawHit = true
      }
      if (sawHit) return true
      if (sawUnknown) return null
      return false
    }
    // 懒收集全部 CSSMediaRule（跨域样式表读 cssRules 会抛 SecurityError，跳过）
    this._flsMedia = null
    const collectMediaRules = () => {
      if (this._flsMedia) return this._flsMedia
      this._flsMedia = []
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch (e) { continue }
        if (!rules) continue
        for (const rule of rules) {
          if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
            this._flsMedia.push({ rule, orig: rule.media.mediaText })
          }
        }
      }
      return this._flsMedia
    }
    this._flsApply = () => {
      if (this._destroyed) return
      const portrait = window.innerHeight >= window.innerWidth
      // 仅在牌桌全屏（ddz-full）时强制横屏
      const inGame = this.root.classList.contains('ddz-full')
      const force = !rotated && portrait && inGame && isMobile()
      this.root.classList.toggle('ddz-fls', force)
      if (force) {
        // portal 状态下 root 已在 body 直下（setImmersive 保证），旋转后逻辑宽高互换。
        // 尺寸用 innerWidth/innerHeight（当前可视区，与 mahjong 一致）：
        // 铺满可视区且不溢出；地址栏收起/展开时 resize 会带着 _flsApply 重算，
        // 始终贴合。曾试过 screen 物理尺寸（想盖住地址栏），结果地址栏展开时
        // 旋转桌面反而超出可视区、左缘被地址栏盖住——已回退
        this.root.style.width = window.innerHeight + 'px'
        this.root.style.height = window.innerWidth + 'px'
        this.root.style.top = (-window.innerWidth) + 'px'
      } else {
        // 解除旋转：清掉内联尺寸，全屏时改由 CSS inset:0 铺满
        this.root.style.width = ''
        this.root.style.height = ''
        this.root.style.top = ''
      }
      for (const item of collectMediaRules()) {
        if (!force) { item.rule.media.mediaText = item.orig; continue }
        // 虚拟视口：旋转 90° 后逻辑宽高互换
        const hit = evalMedia(item.orig, window.innerHeight, window.innerWidth)
        if (hit === null) continue
        item.rule.media.mediaText = hit ? 'all' : 'not all'
      }
      if (this.fitViewport) this.fitViewport()
    }
    this._flsOnOrientation = () => {
      // 只在全屏内才消耗「自由切换」名额
      if (!this.root.classList.contains('ddz-full')) return
      rotated = true
      try { sessionStorage.setItem(KEY, '1') } catch (e) { /* ignore */ }
      // iOS orientationchange 触发瞬间 innerWidth/innerHeight 可能还是旧值，延迟重评估
      setTimeout(() => this._flsApply && this._flsApply(), 80)
    }
    window.addEventListener('orientationchange', this._flsOnOrientation)
    window.addEventListener('resize', this._flsApply)
  }

  // ---------- 对局控制 ----------
  newGame() {
    if (this.online) return // 联机：开局由服务端驱动（GAME_STARTED → applyOnlineView）
    this.clearTimers()
    this.overlay.style.display = 'none'
    this.root.classList.remove('ddz-over') // 新一局恢复桌面 chrome
    this.state = createGame({ seed: (Math.random() * 0xffffffff) >>> 0 })
    this.selected.clear()
    this.lastHint = null
    this._playedKeys = {}
    this.renderAll()
    this.audio.sfx('deal')
    this.pump(drainEvents(this.state))
  }

  // ---------- 联机视图注入（remote.js 在每次 GAME_STATE_CHANGED 后调用） ----------
  /**
   * 把服务端玩家视图映射成本地渲染层的 state 同构对象（render 系列零改动）：
   * 他家手牌用「张数占位数组」（renderOpps 只读 length），over 阶段全亮真实牌；
   * 底牌未亮时视图只发长度 → 造 null 占位。acts 日志按长度 diff 转成单机同款
   * 事件喂给 onEvent（音效/气泡/特效全部复用）。
   */
  applyOnlineView(view) {
    if (this._destroyed || !view) return
    const prevLen = this._actsLen
    const acts = view.acts || []
    // 新一局（acts 回退）或本局首帧：清理桌面状态
    if (acts.length < prevLen || (prevLen === 0 && acts.length === 0 && view.phase === 'bidding' && this.state && this.state.phase === 'over')) {
      this.clearTimers()
      this.selected.clear()
      this.lastHint = null
      this._playedKeys = {}
      this._bottomKey = null
      this.overlay.style.display = 'none'
      this.root.classList.remove('ddz-over')
      this.audio.sfx('deal')
    }
    this.seat = view.seat
    const hands = view.handCounts.map((h, i) =>
      i === view.seat ? view.hand.slice() : (Array.isArray(h) ? h.slice() : Array(h).fill(null)))
    this.state = {
      phase: view.phase,
      hands,
      bottom: Array.isArray(view.bottom) ? view.bottom : Array(3).fill(null),
      bidTurn: view.bidTurn, highBid: view.highBid, highBidder: view.highBidder, bids: view.bids || [],
      robTurn: view.robTurn, robs: view.robs || [], dblTurn: view.dblTurn, dbls: view.dbls || [],
      landlord: view.landlord, calledScore: view.calledScore,
      turn: view.turn, lastPlay: view.lastPlay, passCount: 0,
      history: view.played || [], trickPasses: view.trickPasses || [],
      multiplier: view.multiplier, bombs: view.bombs,
      playCount: view.playCount || [0, 0, 0],
      winner: view.winner, winSide: view.winSide, spring: view.spring,
      scores: view.scores || [0, 0, 0],
      meta: view.meta || null
    }
    // acts 日志 diff → 单机同款事件（音效/语音气泡/特效）
    const landlord = view.landlord
    for (let i = prevLen; i < acts.length; i++) {
      const a = acts[i]
      if (a.t === 'bid') this.onEvent({ type: 'bid', seat: a.seat, score: a.score })
      else if (a.t === 'rob') this.onEvent({ type: 'rob', seat: a.seat, rob: a.rob, multiplier: a.multiplier })
      else if (a.t === 'double') this.onEvent({ type: 'double', seat: a.seat, double: a.double, super: a.seat === landlord, multiplier: a.multiplier })
      else if (a.t === 'pass') this.onEvent({ type: 'pass', seat: a.seat })
      else if (a.t === 'play') {
        this.onEvent({ type: 'play', seat: a.seat, combo: a.combo, cards: a.cards })
        if (a.combo && (a.combo.type === 'bomb' || a.combo.type === 'rocket')) {
          this.onEvent({ type: 'bomb', seat: a.seat, combo: a.combo.type, multiplier: view.multiplier })
        }
      } else if (a.t === 'redeal') this.onEvent({ type: 'redeal' })
      else if (a.t === 'landlord') this.onEvent({ type: 'landlord', seat: a.seat })
      else if (a.t === 'over') this.onEvent({ type: 'over', scores: a.scores, spring: a.spring })
    }
    this._actsLen = acts.length
    this.renderAll()
    // 联机不跑本地 AI / 本地计时（服务端窗口权威，倒计时由 remote tick 驱动 renderTimer）
    this.clearTimers()
    if (view.phase === 'over') this.showSettlement()
  }

  view() { return playerView(this.state, this.seat) }

  /** 当前该谁表态（叫分/抢地主/加倍/出牌四阶段统一入口） */
  activeSeat() {
    const s = this.state
    if (s.phase === 'bidding') return s.bidTurn
    if (s.phase === 'robbing') return s.robTurn
    if (s.phase === 'doubling') return s.dblTurn
    return s.turn
  }

  // 事件泵：处理 createGame/dispatch 产出的事件并推进 AI（单机专用）
  pump(events = []) {
    if (this.online) return
    for (const e of events) this.onEvent(e)
    this.renderAll()
    const s = this.state
    if (s.phase === 'over') { this.showSettlement(); return }
    const active = this.activeSeat()
    if (active === this.seat) {
      this.startTimer()
    } else {
      this.clearTimers()
      // 抢/加倍表态节奏快（QQ 同款一闪而过），出牌思考慢
      const quick = s.phase === 'robbing' || s.phase === 'doubling'
      this.aiTimer = setTimeout(() => this.aiMove(active), (quick ? 420 : 650) + Math.random() * (quick ? 480 : 750))
    }
  }

  aiMove(seat) {
    const s = this.state
    if (s.phase === 'over') return
    const view = playerView(s, seat)
    const act = aiDecide(view, seat)
    if (!act) return
    const r = dispatch(s, act, seat)
    if (r.ok) this.pump(r.events)
    else this.aiTimer = setTimeout(() => this.aiMove(seat), 400)
  }

  humanAct(action) {
    const s = this.state
    const active = this.activeSeat()
    if (active !== this.seat) return
    // 联机：只发意图，合法性由服务端窗口裁决；本地做结构校验提前提示
    if (this.online) {
      if (action.type === 'play') {
        if (!this.selected.size) { this.toast('先点选手牌'); return false }
        if (!classifyCombo(action.cards)) { this.toast('所选牌不构成合法牌型'); this.shakeHand(); return false }
      }
      this.selected.clear()
      this.lastHint = null
      this.online.tryAction(action)
      return true
    }
    const r = dispatch(s, action, this.seat)
    if (!r.ok) {
      this.toast(action.type === 'play' ? '牌型不符或压不过上家' : '现在不能这样操作')
      this.audio.sfx('pass')
      return false
    }
    this.selected.clear()
    this.lastHint = null
    this.pump(r.events)
    return true
  }

  onEvent(e) {
    switch (e.type) {
      case 'bid':
        this.showBidBubble(e.seat, e.score)
        this.audio.sfx('bid')
        this.audio.voice(`bid-${e.score}`, BID_SPOKEN[e.score] || '不叫')
        break
      case 'rob':
        this.showBubble(e.seat, e.rob ? '抢地主！' : '不抢')
        this.audio.sfx('bid')
        this.audio.voice(e.rob ? 'rob' : 'no-rob', e.rob ? '抢地主' : '不抢')
        if (e.rob) this.flashFx('×2', `抢地主！倍数 ×${e.multiplier}`)
        break
      case 'double':
        this.showBubble(e.seat, e.double ? (e.super ? '超级加倍！' : '加倍！') : '不加倍')
        this.audio.sfx('bid')
        this.audio.voice(e.double ? (e.super ? 'super-double' : 'double') : 'no-double', e.double ? (e.super ? '超级加倍' : '加倍') : '不加倍')
        if (e.double) this.flashFx('×2', `${e.super ? '超级加倍' : '加倍'}！倍数 ×${e.multiplier}`)
        break
      case 'landlord':
        this.audio.sfx('landlord')
        this.flashFx('👑', e.seat === this.seat ? '你当地主！' : `${this.oppName(e.seat)} 当地主`)
        break
      case 'bomb': {
        this.audio.sfx(e.combo === 'rocket' ? 'rocket' : 'bomb')
        this.flashFx(e.combo === 'rocket' ? '🚀' : '💥', e.combo === 'rocket' ? '王炸！' : '炸弹！')
        this.shake()
        if (e.combo === 'rocket') this.rocketFly()
        this.explosion()
        // 炸弹/王炸翻倍计分提示：爆炸特效后补一条醒目的 ×2
        const st = this.state
        const mult = st.multiplier
        setTimeout(() => {
          if (!this._destroyed && this.state === st) this.flashFx('×2', `翻倍！积分 ×${mult}`)
        }, 700)
        break
      }
      case 'alarm':
        this.audio.sfx('alarm')
        break
      case 'redeal':
        this.toast('三家不叫，重新发牌')
        break
      case 'over': {
        const win = e.scores[this.seat] > 0
        this.audio.sfx(win ? 'win' : 'lose')
        if (e.spring) { this.flashFx('🌸', '春天！'); this.petals() }
        if (win) this.coins()
        break
      }
    }
    if (e.type === 'play') {
      this.audio.sfx('play')
      const [key, text] = voiceForCombo(e.combo)
      if (key) this.audio.voice(key, text)
    }
    if (e.type === 'pass') {
      this.audio.sfx('pass')
      this.audio.voice('pass', '不要')
      // 「不要」气泡挂头像旁：不随清圈消失——左家是出牌圈最后表态者，
      // 双 pass 清圈时出牌区标签与 pass 同一帧被清空，永远看不到
      this.showBubble(e.seat, '不要')
    }
  }

  oppName(seat) {
    if (seat === this.seat) return '你'
    if (this.online) {
      const name = this.online.seatName(seat)
      if (name) return name
    }
    return AI_NAMES[seat - 1]
  }

  /** 通用语音气泡：挂各家头像旁，动画后自动清文字（叫分/抢地主/加倍/不要共用） */
  showBubble(seat, text) {
    if (!text) return // 空文字不弹：空 text 无行盒，气泡塌成 6px 白条
    const panel = seat === this.seat ? this.mePanel : this.oppPanels[seat]
    if (!panel) return
    const bubble = panel.querySelector('.ddz-bid-bubble')
    if (!bubble) return
    bubble.textContent = text
    bubble.classList.remove('pop')
    void bubble.offsetWidth
    bubble.classList.add('pop')
    // 动画（1.2s）后清文字：残留文字的气泡若被重排会闪现
    clearTimeout(bubble._t)
    bubble._t = setTimeout(() => { bubble.textContent = '' }, 1300)
  }

  showBidBubble(seat, score) {
    const text = score === 0 ? '不叫' : `${score} 分`
    this.showBubble(seat, text)
    if (seat === this.seat) this.status.textContent = `你：${text}`
  }

  // ---------- 倒计时 ----------
  startTimer() {
    this.clearTimers()
    let left = TURN_SECONDS
    this.renderTimer(left)
    this.timer = setInterval(() => {
      left--
      this.renderTimer(left)
      if (left <= 0) {
        this.clearTimers()
        this.timeoutAct()
      }
    }, 1000)
  }

  renderTimer(left) {
    for (const s of [1, 2]) this.oppPanels[s].querySelector('.ddz-timer').textContent = ''
    const active = this.activeSeat()
    if (active === this.seat) {
      this.meTimer.textContent = `${left}`
      this.meTimer.classList.toggle('urgent', left <= 5)
    } else {
      const el = this.oppPanels[active] && this.oppPanels[active].querySelector('.ddz-timer')
      if (el) el.textContent = `${left}`
    }
  }

  timeoutAct() {
    // 联机：服务端窗口超时自动托管，本地只提醒（不代打）
    if (this.online) { this.toast('已超时，即将自动托管'); return }
    const s = this.state
    if (s.phase === 'bidding') return this.humanAct({ type: 'bid', score: 0 })
    // 抢/加倍超时保守表态：不抢、不加倍
    if (s.phase === 'robbing') return this.humanAct({ type: 'rob', rob: false })
    if (s.phase === 'doubling') return this.humanAct({ type: 'double', double: false })
    const view = this.view()
    if (!view.lastPlay) {
      const cards = hintPlay(view, view.hand, null)
      if (cards) return this.humanAct({ type: 'play', cards })
    }
    this.humanAct({ type: 'pass' })
  }

  clearTimers() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null }
    if (this.meTimer) { this.meTimer.textContent = ''; this.meTimer.classList.remove('urgent') }
  }

  // ---------- 渲染 ----------
  renderAll() {
    const s = this.state
    if (!s) return
    this.renderTop()
    this.renderBottom()
    this.renderOpps()
    this.renderPlayed()
    this.renderMe()
    this.renderHand()
    this.renderActions()
    this.renderStatus()
  }

  renderTop() {
    const s = this.state
    this.elMult.textContent = `倍数 ×${s.multiplier}`
    this.elBase.textContent = s.calledScore ? `底分 ${s.calledScore}` : '叫分中'
    // 单机显示本地积分等级；联机显示服务端房间积分（多局累计）
    if (this.online) {
      const roomScores = s.meta && s.meta.scores
      this.elLevel.textContent = `积分 ${roomScores ? roomScores[this.seat] : '-'}`
    } else {
      this.elLevel.textContent = `${levelOf(this.points)} ${this.points}分`
    }
  }

  renderBottom() {
    const s = this.state
    // 底牌只在「地主确定亮牌」那一刻重建并播翻面动画，之后每次出牌不再重绘
    // （否则每打一张牌底牌都翻一次面）
    const revealed = s.landlord >= 0
    const key = revealed ? `r${s.bottom.join('.')}` : 'hidden'
    if (key === this._bottomKey) return
    const justRevealed = revealed && !String(this._bottomKey || '').startsWith('r')
    this._bottomKey = key
    this.bottomWrap.innerHTML = ''
    const label = h('span', 'ddz-bottom-label', '底牌')
    this.bottomWrap.append(label)
    const cards = revealed ? s.bottom : [null, null, null]
    for (const c of cards) {
      if (c === null) this.bottomWrap.append(h('div', 'ddz-card ddz-card-mini ddz-card-back'))
      else {
        const el = cardEl(c, true)
        if (justRevealed) el.classList.add('flip-in')
        this.bottomWrap.append(el)
      }
    }
  }

  /** 角色头像：地主用地主形象，农民/未定用农民形象 */
  avatarHtml(seat) {
    const isLord = this.state.landlord >= 0 && this.state.landlord === seat
    return `<img class="ddz-avatar-img" src="/img/games/ddz-avatar-${isLord ? 'landlord' : 'farmer'}.jpg" alt="">`
  }

  renderOpps() {
    const s = this.state
    for (const seat of [1, 2]) {
      const p = this.oppPanels[seat]
      const count = s.hands[seat].length
      p.querySelector('.ddz-avatar').innerHTML = this.avatarHtml(seat)
      // 牌背扇形：每张背对应一手牌，一眼看出对手剩牌
      const backs = p.querySelector('.ddz-opp-backs')
      const n = s.phase === 'over' ? 0 : count
      if (backs.childElementCount !== n) {
        backs.innerHTML = ''
        for (let i = 0; i < n; i++) backs.append(h('div', 'ddz-back'))
      }
      p.querySelector('.ddz-opp-count').textContent = s.landlord >= 0 ? `${count} 张` : '17 张'
      const role = p.querySelector('.ddz-role')
      role.textContent = ''
      role.className = 'ddz-role'
      if (s.landlord >= 0) {
        const isLord = seat === s.landlord
        role.textContent = isLord ? '👑 地主' : '🌾 农民'
        role.classList.add(isLord ? 'ddz-role-lord' : 'ddz-role-farmer')
      }
      p.classList.toggle('ddz-alarm', s.phase === 'playing' && count <= 2 && count > 0)
      const active = this.activeSeat() === seat && s.phase !== 'over'
      p.classList.toggle('is-active', active)
      if (!active) p.querySelector('.ddz-timer').textContent = ''
      // 气板不在这里清空：「不要/抢地主/加倍」等气泡靠 CSS pop 动画
      // 1.6s 自动淡出（旧实现非叫分阶段每帧清文字，气泡永远闪不出来）
    }
  }

  renderPlayed() {
    const s = this.state
    for (const seat of [0, 1, 2]) {
      const area = this.playAreas[seat]
      area.innerHTML = ''
      if (s.phase !== 'playing' && s.phase !== 'over') { this._playedKeys[seat] = null; continue }
      const lp = s.lastPlay
      // 每家展示区：lastPlay 属于他家→牌；本 trick pass→不出
      // key 带 history 长度作 nonce，仅在新出牌时播 3D 飞入动画
      let key = null
      if (lp && lp.seat === seat) key = `c${lp.cards.join('.')}#${s.history.length}`
      else if (lp && s.trickPasses.includes(seat)) key = `pass#${s.history.length}`
      const fresh = key !== null && key !== this._playedKeys[seat]
      this._playedKeys[seat] = key
      if (lp && lp.seat === seat) {
        const wrap = h('div', 'ddz-played-cards')
        // 长牌型分档缩卡（QQ 斗地主同款）：宽牌型横排会穿过对家
        // 头像/牌背面板（竖屏半场净空仅 ~174px），按张数缩小卡面
        const n = lp.cards.length
        if (n >= 12) wrap.classList.add('ddz-mass')
        else if (n >= 8) wrap.classList.add('ddz-huge')
        else if (n >= 5) wrap.classList.add('ddz-many')
        if (fresh) {
          const isBomb = lp.combo.type === 'bomb' || lp.combo.type === 'rocket'
          wrap.classList.add(isBomb ? 'bomb-in' : 'play-in')
        }
        for (const c of lp.cards) wrap.append(cardEl(c, true))
        area.append(wrap, h('div', 'ddz-combo-label', COMBO_LABEL[lp.combo.type]))
      } else if (lp && s.trickPasses.includes(seat)) {
        area.append(h('div', 'ddz-pass-label', '不出'))
      }
    }
  }

  renderMe() {
    const s = this.state
    // 子元素一次建好、之后只更新内容：innerHTML 重建会把气泡节点移出再放回，
    // DOM 重插会从头重播 pop 动画——每次 AI 动作后我的气泡就重弹一次
    // （空文字时更会反复闪出 60x6 白条，「气泡满屏飞」的根因）
    if (!this._meBuilt) {
      this._meBuilt = true
      this.mePanel.innerHTML = ''
      this.meAvatarEl = h('div', 'ddz-avatar ddz-avatar-me')
      this.meRoleEl = h('div', 'ddz-role')
      this.meTimer = h('div', 'ddz-timer')
      this.meBubble = h('div', 'ddz-bid-bubble')
      this.mePanel.append(this.meAvatarEl, h('div', 'ddz-opp-name', '你'), this.meRoleEl, this.meTimer, this.meBubble)
    }
    this.meAvatarEl.innerHTML = this.avatarHtml(this.seat)
    this.meRoleEl.textContent = ''
    this.meRoleEl.className = 'ddz-role'
    if (s.landlord >= 0) {
      const isLord = s.landlord === this.seat
      this.meRoleEl.textContent = isLord ? '👑 地主' : '🌾 农民'
      this.meRoleEl.classList.add(isLord ? 'ddz-role-lord' : 'ddz-role-farmer')
    }
    const active = this.activeSeat() === this.seat && s.phase !== 'over'
    this.mePanel.classList.toggle('is-active', active)
  }

  renderHand() {
    const s = this.state
    this.handEl.innerHTML = ''
    const hand = s.hands[this.seat]
    hand.forEach((c, i) => {
      const el = cardEl(c)
      el.style.zIndex = i
      if (this.selected.has(c)) el.classList.add('is-selected')
      if (s.phase === 'over') el.classList.add('is-disabled')
      el.onclick = () => {
        if (s.phase !== 'playing' || s.turn !== this.seat) return
        if (this.selected.has(c)) this.selected.delete(c)
        else { this.selected.add(c); this.audio.sfx('select') }
        el.classList.toggle('is-selected')
        this.renderActionButtons()
      }
      this.handEl.append(el)
    })
    this.fitHandShift()
  }

  /** 按可用宽度动态计算手牌错位（牌多时加深重叠，保证不换行不溢出） */
  fitHandShift() {
    const cards = this.handEl.children
    const n = cards.length
    if (n < 2) return
    const cw = cards[0].offsetWidth
    if (!cw) return
    const avail = this.handEl.clientWidth - 20 // 左右 padding 各 10
    // 理想错位 42% 牌宽；空间不足时压缩错位，至少露出 14px
    const ideal = cw * 0.42
    const shift = Math.max(14, Math.min(ideal, (avail - cw) / (n - 1)))
    const overlap = cw - shift
    for (let i = 1; i < n; i++) {
      /** @type {HTMLElement} */ (cards[i]).style.marginLeft = `-${overlap.toFixed(1)}px`
    }
  }

  renderStatus() {
    const s = this.state
    if (s.phase === 'bidding') {
      const who = s.bidTurn === this.seat ? '轮到你叫分' : `等待 ${this.oppName(s.bidTurn)} 叫分…`
      this.status.textContent = s.highBid ? `${who}（当前最高 ${s.highBid} 分）` : who
    } else if (s.phase === 'robbing') {
      this.status.textContent = s.robTurn === this.seat
        ? `${this.oppName(s.highBidder)} 叫了 ${s.highBid} 分，要抢地主吗？`
        : `等待 ${this.oppName(s.robTurn)} 抢地主…（倍数 ×${s.multiplier}）`
    } else if (s.phase === 'doubling') {
      const lord = s.dblTurn === s.landlord
      this.status.textContent = s.dblTurn === this.seat
        ? (lord ? '要超级加倍吗？（倍数再 ×2）' : '要加倍吗？（倍数再 ×2）')
        : `等待 ${this.oppName(s.dblTurn)} ${lord ? '超级加倍' : '加倍'}…（倍数 ×${s.multiplier}）`
    } else if (s.phase === 'playing') {
      if (s.turn === this.seat) {
        this.status.textContent = s.lastPlay ? `压过 ${this.oppName(s.lastPlay.seat)} 的${COMBO_LABEL[s.lastPlay.combo.type]}，或不出` : '轮到你出牌'
      } else {
        this.status.textContent = `等待 ${this.oppName(s.turn)} 出牌…`
      }
    }
  }

  // ---------- 操作区 ----------
  renderActions() {
    this.actions.innerHTML = ''
    const s = this.state
    if (s.phase === 'bidding' && s.bidTurn === this.seat) {
      const mk = (label, score, primary) => {
        const b = h('button', 'ddz-btn' + (primary ? ' ddz-btn-primary' : ''), label)
        b.type = 'button'
        b.disabled = score > 0 && score <= s.highBid
        b.onclick = () => this.humanAct({ type: 'bid', score })
        return b
      }
      this.actions.append(mk('不叫', 0), mk('1 分', 1), mk('2 分', 2), mk('3 分', 3, true))
    } else if (s.phase === 'robbing' && s.robTurn === this.seat) {
      const mk = (label, rob, primary) => {
        const b = h('button', 'ddz-btn' + (primary ? ' ddz-btn-primary' : ''), label)
        b.type = 'button'
        b.onclick = () => this.humanAct({ type: 'rob', rob })
        return b
      }
      this.actions.append(mk('不 抢', false), mk('抢地主', true, true))
    } else if (s.phase === 'doubling' && s.dblTurn === this.seat) {
      const isLord = s.landlord === this.seat
      const mk = (label, dbl, primary) => {
        const b = h('button', 'ddz-btn' + (primary ? ' ddz-btn-primary' : ''), label)
        b.type = 'button'
        b.onclick = () => this.humanAct({ type: 'double', double: dbl })
        return b
      }
      this.actions.append(mk('不加倍', false), mk(isLord ? '超级加倍' : '加 倍', true, true))
    } else if (s.phase === 'playing' && s.turn === this.seat) {
      this.renderActionButtons()
    }
  }

  renderActionButtons() {
    const s = this.state
    if (s.phase !== 'playing' || s.turn !== this.seat) return
    this.actions.innerHTML = ''
    const btnHint = h('button', 'ddz-btn', '💡 提示')
    btnHint.type = 'button'
    btnHint.onclick = () => {
      const cards = hintPlay(this.view(), s.hands[this.seat], this.lastHint)
      if (!cards) { this.toast('没有能压过的牌'); return }
      this.selected = new Set(cards)
      this.lastHint = cards
      this.renderHand()
      this.audio.sfx('select')
    }
    const btnPass = h('button', 'ddz-btn', '不出')
    btnPass.type = 'button'
    btnPass.disabled = !s.lastPlay
    btnPass.onclick = () => this.humanAct({ type: 'pass' })
    const btnPlay = h('button', 'ddz-btn ddz-btn-primary', '出牌')
    btnPlay.type = 'button'
    btnPlay.onclick = () => {
      if (!this.selected.size) { this.toast('先点选手牌'); return }
      const cards = [...this.selected]
      if (!classifyCombo(cards)) { this.toast('所选牌不构成合法牌型'); this.shakeHand(); return }
      this.humanAct({ type: 'play', cards })
    }
    this.actions.append(btnHint, btnPass, btnPlay)
  }

  // ---------- 结算 ----------
  showSettlement() {
    const s = settlementOf(this.state)
    if (!s) return
    // 局终：隐藏桌面 chrome（对手面板等），结算画面干净（CSS .ddz-over）
    this.root.classList.add('ddz-over')
    if (!this.online) {
      this.points = Math.max(0, this.points + s.scores[this.seat])
      localStorage.setItem('ddz-points', String(this.points))
    }
    const win = s.scores[this.seat] > 0
    const box = h('div', 'ddz-settle')
    box.append(h('div', 'ddz-settle-stamp ' + (win ? 'win' : 'lose'), win ? '胜 利' : '失 败'))
    box.append(h('h2', '', s.winSide === 'landlord' ? '地主获胜' : '农民获胜'))
    // 倍数明细
    const detail = h('div', 'ddz-settle-detail')
    detail.append(
      h('div', 'ddz-settle-row', `底分 ${s.calledScore}`),
      h('div', 'ddz-settle-row', `炸弹 × ${s.bombs}`),
      ...(s.spring ? [h('div', 'ddz-settle-row ddz-spring', '🌸 春天 ×2')] : []),
      h('div', 'ddz-settle-row ddz-mult', `总倍数 ×${s.multiplier}`)
    )
    box.append(detail)
    // 三家积分与余牌（联机显示玩家名，单机显示 AI 名）
    for (const seat of [0, 1, 2]) {
      const row = h('div', 'ddz-settle-player')
      const sc = s.scores[seat]
      row.append(
        h('span', 'ddz-settle-name', `${this.oppName(seat)}${seat === s.landlord ? ' 👑' : ''}`),
        h('span', 'ddz-settle-score ' + (sc > 0 ? 'plus' : 'minus'), sc > 0 ? `+${sc}` : `${sc}`)
      )
      const cards = h('div', 'ddz-settle-cards')
      if (s.hands[seat].length) for (const c of s.hands[seat]) cards.append(cardEl(c, true))
      else cards.append(h('span', 'ddz-settle-empty', '已出完'))
      row.append(cards)
      box.append(row)
    }
    if (this.online) {
      // 联机：积分入账与「准备下一局 / 退出房间」按钮由 remote 结算浮层负责
      const roomScores = s.meta && s.meta.scores
      box.append(h('div', 'ddz-settle-level', roomScores
        ? `房间积分：${[0, 1, 2].map(i => this.oppName(i) + ' ' + roomScores[i]).join(' · ')}`
        : '等待房间结算…'))
    } else {
      box.append(h('div', 'ddz-settle-level', `当前积分 ${this.points} · ${levelOf(this.points)}`))
      const again = h('button', 'ddz-btn ddz-btn-primary', '再来一局')
      again.type = 'button'
      again.onclick = () => this.newGame()
      const back = h('a', 'ddz-btn', '返回游戏列表')
      back.href = '/blogs/other/games.html'
      const row = h('div', 'ddz-settle-actions')
      row.append(again, back)
      box.append(row)
    }
    // BGM 署名（CC BY 3.0 要求）
    box.append(h('div', 'ddz-settle-credit', '♪ BGM: Shenyang — Kevin MacLeod (incompetech.com) · CC BY 3.0'))
    this.overlay.innerHTML = ''
    this.overlay.append(box)
    this.overlay.style.display = 'flex'
  }

  // ---------- 粒子特效 ----------
  fxLoop() {
    if (this.fxRaf) return
    const cvs = this.fxCanvas
    const g = cvs.getContext('2d')
    if (!g) return
    const tick = () => {
      const dpr = this.fxDpr || 1
      g.clearRect(0, 0, cvs.width, cvs.height)
      // 火箭飞行期间持续喷拖尾火花
      if (this.rocketEl) {
        const rr = this.rocketEl.getBoundingClientRect()
        const cr = cvs.getBoundingClientRect()
        const x = (rr.left + rr.width / 2 - cr.left) * dpr
        const y = (rr.top + rr.height * 0.85 - cr.top) * dpr
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            kind: 'spark', x, y,
            vx: (Math.random() - 0.5) * 2 * dpr, vy: (1 + Math.random() * 2) * dpr,
            grav: 0, life: 22 + Math.random() * 14, age: 0,
            size: (2 + Math.random() * 3) * dpr,
            color: Math.random() < 0.5 ? '#ffb03a' : '#ffe27a'
          })
        }
      }
      this.particles = this.particles.filter(p => {
        p.age++
        const t = p.age / p.life
        if (t >= 1) return false
        if (p.kind === 'ring') {
          const r = p.size + p.age * p.vr
          g.beginPath()
          g.arc(p.x, p.y, r, 0, Math.PI * 2)
          g.strokeStyle = p.color
          g.globalAlpha = (1 - t) * 0.85
          g.lineWidth = Math.max(1, 5 * dpr * (1 - t))
          g.stroke()
        } else if (p.kind === 'spark') {
          p.x += p.vx; p.y += p.vy; p.vy += p.grav || 0
          g.globalAlpha = 1 - t
          g.fillStyle = p.color
          g.beginPath()
          g.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2)
          g.fill()
        } else if (p.kind === 'petal') {
          p.x += p.vx + Math.sin(p.sway + p.age * 0.09) * 0.9 * dpr
          p.y += p.vy
          p.rot += p.vr
          g.save()
          g.translate(p.x, p.y)
          g.rotate(p.rot)
          g.globalAlpha = Math.min(1, (p.life - p.age) / 26)
          g.fillStyle = p.color
          g.beginPath()
          g.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2)
          g.fill()
          g.restore()
        } else if (p.kind === 'coin') {
          p.y += p.vy
          p.x += Math.sin(p.sway + p.age * 0.07) * 1.2 * dpr
          g.globalAlpha = Math.min(1, (p.life - p.age) / 26)
          g.font = `${p.size}px serif`
          g.fillText('🪙', p.x, p.y)
        }
        g.globalAlpha = 1
        return true
      })
      if (this.particles.length || this.rocketEl) {
        this.fxRaf = requestAnimationFrame(tick)
      } else {
        this.fxRaf = 0
        g.clearRect(0, 0, cvs.width, cvs.height)
      }
    }
    this.fxRaf = requestAnimationFrame(tick)
  }

  /** 炸弹爆炸：金橙火花 + 冲击波环 */
  explosion() {
    if (!this.fxCanvas.width) return
    const dpr = this.fxDpr || 1
    const cx = this.fxCanvas.width / 2
    const cy = this.fxCanvas.height * 0.4
    this.particles.push({ kind: 'ring', x: cx, y: cy, life: 32, age: 0, size: 8 * dpr, vr: 8 * dpr, color: '#ffd970' })
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = (2 + Math.random() * 7.5) * dpr
      this.particles.push({
        kind: 'spark', x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5 * dpr,
        grav: 0.13 * dpr, life: 40 + Math.random() * 30, age: 0,
        size: (2 + Math.random() * 3.5) * dpr,
        color: ['#ffd970', '#ffb03a', '#ff7a3c', '#fff3c2'][i % 4]
      })
    }
    this.fxLoop()
  }

  /** 王炸火箭升空（DOM 火箭 + 粒子拖尾） */
  rocketFly() {
    const el = h('div', 'ddz-rocket-fly', '🚀')
    this.table.append(el)
    this.rocketEl = el
    this.fxLoop()
    setTimeout(() => { el.remove(); if (this.rocketEl === el) this.rocketEl = null }, 1250)
  }

  /** 春天：花瓣飘落 */
  petals() {
    if (!this.fxCanvas.width) return
    const dpr = this.fxDpr || 1
    const W = this.fxCanvas.width
    const H = this.fxCanvas.height
    for (let i = 0; i < 34; i++) {
      this.particles.push({
        kind: 'petal',
        x: Math.random() * W, y: -20 * dpr - Math.random() * H * 0.35,
        vx: (Math.random() - 0.5) * 1.2 * dpr, vy: (1 + Math.random() * 1.6) * dpr,
        sway: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.12,
        life: 150 + Math.random() * 60, age: 0,
        size: (5 + Math.random() * 5) * dpr,
        color: ['#ffb7c5', '#ff9fb0', '#ffd0da'][i % 3]
      })
    }
    this.fxLoop()
  }

  /** 胜利：金币雨 */
  coins() {
    if (!this.fxCanvas.width) return
    const dpr = this.fxDpr || 1
    const W = this.fxCanvas.width
    const H = this.fxCanvas.height
    for (let i = 0; i < 42; i++) {
      this.particles.push({
        kind: 'coin',
        x: Math.random() * W, y: -30 * dpr - Math.random() * H * 0.5,
        vy: (2 + Math.random() * 2.6) * dpr,
        sway: Math.random() * Math.PI * 2,
        life: 130 + Math.random() * 60, age: 0,
        size: (16 + Math.random() * 12) * dpr
      })
    }
    this.fxLoop()
  }

  // ---------- 特效（DOM） ----------
  flashFx(emoji, text) {
    const el = h('div', 'ddz-fx-item')
    el.append(h('div', 'ddz-fx-emoji', emoji), h('div', 'ddz-fx-text', text))
    this.fx.append(el)
    setTimeout(() => el.remove(), 1400)
  }

  shake() {
    this.table.classList.remove('ddz-shake')
    void this.table.offsetWidth
    this.table.classList.add('ddz-shake')
  }

  shakeHand() {
    this.handEl.classList.remove('ddz-shake')
    void this.handEl.offsetWidth
    this.handEl.classList.add('ddz-shake')
  }

  toast(text) {
    const t = h('div', 'ddz-toast', text)
    this.table.append(t)
    setTimeout(() => t.classList.add('show'))
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300) }, 1600)
  }

  destroy() {
    this._destroyed = true
    this.clearTimers()
    this.audio.destroy()
    // 还原强制横屏改写的媒体查询与监听
    if (this._flsApply) {
      window.removeEventListener('orientationchange', this._flsOnOrientation)
      window.removeEventListener('resize', this._flsApply)
      if (this._flsMedia) for (const item of this._flsMedia) item.rule.media.mediaText = item.orig
      this._flsApply = null
      this._flsOnOrientation = null
    }
    window.removeEventListener('resize', this.fitViewport)
    window.removeEventListener('orientationchange', this.fitViewport)
    window.removeEventListener('load', this.fitViewport)
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', this.fitViewport)
    if (this.fitTimers) this.fitTimers.forEach(clearTimeout)
    if (this.fxRaf) cancelAnimationFrame(this.fxRaf)
    this.rocketEl = null
    if (this.cwFab) this.cwFab.style.display = this.cwFabPrevDisplay || ''
    if (this.navbar) this.navbar.style.display = ''
    document.body.classList.remove('ddz-lock')
    if (this._scrollSpacer && this._scrollSpacer.parentNode) this._scrollSpacer.remove()
    this._scrollSpacer = null
    // 全屏 portal 状态移回文档流原位，并清掉强制横屏残留
    this.root.classList.remove('ddz-full')
    this.root.classList.remove('ddz-fls')
    this.root.classList.remove('ddz-over')
    this.root.style.width = ''
    this.root.style.height = ''
    this.root.style.top = ''
    if (this._anchor && this._anchor.parentNode) {
      this._anchor.parentNode.insertBefore(this.root, this._anchor)
      this._anchor.remove()
      this._anchor = null
    }
    this.root.innerHTML = ''
    this.root.style.height = ''
  }
}
