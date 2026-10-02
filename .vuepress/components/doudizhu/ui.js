// ============================================================
// 经典斗地主 UI（doudizhu/ui.js）
// QQ 游戏经典布局：地主居上/两农民分列左右（对家视角），
// 自己坐下方；叫分阶梯按钮、底牌翻转、倒计时圈、报双警报、
// 炸弹粒子爆炸、火箭升空拖尾、春天花瓣、胜利金币雨、
// 出牌 TTS 报牌（mp3 优先、浏览器 TTS 兜底）、⛶ 全屏沉浸。
// 事件流驱动渲染，引擎权威。
// ============================================================

import {
  createGame, dispatch, playerView, settlementOf, drainEvents,
  classifyCombo, rankOf, suitOf, RANK_LABEL, COMBO_LABEL
} from './engine.mjs'
import { aiDecide, hintPlay } from './ai.js'
import { createDoudizhuAudio } from './audio.js'

const SUIT_SYMBOL = ['♠', '♥', '♣', '♦']
const SUIT_RED = [false, true, false, true]
// J/Q/K 人物牌面符号（骑士/王后/国王，unicode  chess 字符渲染稳定）
const FACE_GLYPH = { 11: '♞', 12: '♛', 13: '♚' }
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

/** QQ 大牌面扑克：左上/右下（倒置）角标 + 中央花色/人物图案 */
function cardEl(card, mini) {
  const el = h('div', 'ddz-card' + (mini ? ' ddz-card-mini' : ''))
  const rank = rankOf(card)
  if (rank >= 16) {
    el.classList.add('ddz-joker', rank === 17 ? 'ddz-joker-big' : 'ddz-joker-small')
    const face = h('div', 'ddz-joker-face')
    face.append(
      h('span', 'ddz-joker-hat', rank === 17 ? '👑' : '🎩'),
      h('span', 'ddz-joker-cn', rank === 17 ? '大王' : '小王'),
      h('span', 'ddz-joker-en', 'JOKER')
    )
    el.append(face)
    return el
  }
  const suit = suitOf(card)
  if (SUIT_RED[suit]) el.classList.add('ddz-red')
  const corner = cls => {
    const c = h('div', cls)
    c.append(h('span', 'ddz-rank', RANK_LABEL[rank]), h('span', 'ddz-suit', SUIT_SYMBOL[suit]))
    return c
  }
  if (FACE_GLYPH[rank] && !mini) {
    // J/Q/K 人物牌：中央人物符号 + 花色
    const pip = h('div', 'ddz-pip ddz-pip-face')
    pip.append(h('span', 'ddz-face-glyph', FACE_GLYPH[rank]), h('span', 'ddz-face-suit', SUIT_SYMBOL[suit]))
    el.append(corner('ddz-corner'), pip, corner('ddz-corner ddz-corner-b'))
  } else {
    el.append(corner('ddz-corner'), h('div', 'ddz-pip', SUIT_SYMBOL[suit]), corner('ddz-corner ddz-corner-b'))
  }
  return el
}

export default class DoudizhuUI {
  constructor(root) {
    this.root = root
    this.audio = createDoudizhuAudio()
    this.seat = 0 // 人类固定 0 号位
    this.selected = new Set()
    this.lastHint = null
    this.points = Number(localStorage.getItem('ddz-points') || 0)
    this.timer = null
    this.aiTimer = null
    this.particles = []
    this.fxRaf = 0
    this.rocketEl = null
    this._playedKeys = {}
    // 隐藏全站右下角浮动客服，避免遮挡右侧玩家面板
    this.cwFab = document.getElementById('cw-fab')
    if (this.cwFab) { this.cwFabPrevDisplay = this.cwFab.style.display; this.cwFab.style.display = 'none' }
    // 站点 fixed navbar（全屏时需隐藏，否则盖住游戏顶栏 ⛶ 无法退出）
    this.navbar = document.querySelector('header.navbar') || document.querySelector('.navbar')
    // 精确贴合视口：根元素顶到屏幕底，规避主题 navbar/页脚高度差异。
    // 内容微溢会让页面可滚动，一旦 scrollY>0 量到的 top 偏小、height 越算越大
    // （恶性循环），所以测量前强制滚回顶部；全屏时 root 已 portal 到 body 下
    // （fixed 包含块即视口，CSS inset:0 铺满），此处只需重测粒子画布。
    this.fitViewport = () => {
      if (this.root.classList.contains('ddz-full')) {
        if (this.resizeFx) this.resizeFx()
        return
      }
      if (window.scrollY > 0) window.scrollTo(0, 0)
      const top = Math.max(0, this.root.getBoundingClientRect().top)
      this.root.style.height = Math.max(320, window.innerHeight - top) + 'px'
      if (this.resizeFx) this.resizeFx()
    }
    // 本页禁止整页滚动（游戏视口精确贴合，滚动只会触发上述漂移）
    this.bodyPrevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('resize', this.fitViewport)
    window.addEventListener('orientationchange', this.fitViewport)
    this.buildDom()
    this.bindGestures()
    // 主题 navbar 水合/字体加载会二次撑高页头，分多次重测贴合
    requestAnimationFrame(this.fitViewport)
    window.addEventListener('load', this.fitViewport)
    this.fitTimers = [setTimeout(this.fitViewport, 400), setTimeout(this.fitViewport, 1200)]
    this.newGame()
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
    btnExit.href = '/blogs/other/games.html'
    btnExit.title = '返回游戏列表'
    this.topbar.append(
      h('span', 'ddz-logo', '斗地主'),
      this.elBase, this.elMult,
      h('span', 'ddz-topbar-gap'),
      this.elLevel, btnMusic, btnSound, this.btnFull, btnExit
    )
    // 桌面
    this.table = h('div', 'ddz-table')
    // 底牌区
    this.bottomWrap = h('div', 'ddz-bottom-cards')
    // 对手面板（左 2 号位 = 我上家？逆时针：1 下家右，2 上家左）
    this.oppPanels = {}
    for (const s of [2, 1]) {
      const p = h('div', `ddz-opp ddz-opp-${s === 2 ? 'left' : 'right'}`)
      p.append(
        h('div', 'ddz-avatar', AI_AVATARS[s - 1]),
        h('div', 'ddz-opp-name', AI_NAMES[s - 1]),
        h('div', 'ddz-opp-count'),
        h('div', 'ddz-role'),
        h('div', 'ddz-timer', ''),
        h('div', 'ddz-bid-bubble')
      )
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
    // 粒子画布随桌面尺寸
    this.resizeFx = () => {
      const rect = this.table.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      this.fxCanvas.width = Math.max(1, Math.round(rect.width * dpr))
      this.fxCanvas.height = Math.max(1, Math.round(rect.height * dpr))
      this.fxDpr = dpr
    }
    this.resizeFx()
  }

  bindGestures() {
    // 首次手势解锁音频（WebAudio + 共享 <audio> 元素）
    const unlock = () => this.audio.unlock()
    this.root.addEventListener('pointerdown', unlock, { once: true })
    this.root.addEventListener('touchstart', unlock, { once: true })
  }

  // ---------- 全屏 ----------
  // root 移入/移出 document.body（portal）：游戏 root 原本位于带
  // transform/padding 的主题祖先内，fixed 包含块不可靠（曾因补偿时序
  // 差异整屏移出视口），挂到 body 下后包含块即视口，inset:0 天然铺满。
  toggleFull() {
    const on = !this.root.classList.contains('ddz-full')
    if (on) {
      this._anchor = document.createComment('ddz-root-anchor')
      if (this.root.parentNode) this.root.parentNode.insertBefore(this._anchor, this.root)
      document.body.appendChild(this.root)
      this.root.classList.add('ddz-full')
    } else {
      this.root.classList.remove('ddz-full')
      if (this._anchor && this._anchor.parentNode) {
        this._anchor.parentNode.insertBefore(this.root, this._anchor)
        this._anchor.remove()
      }
      this._anchor = null
    }
    this.btnFull.classList.toggle('is-on', on)
    // 全屏隐藏站点 navbar（双保险：portal 后 root z-index 已高于它，隐藏更干净）
    if (this.navbar) this.navbar.style.display = on ? 'none' : ''
    const doc = /** @type {any} */ (document)
    if (on && doc.documentElement.requestFullscreen) {
      doc.documentElement.requestFullscreen().catch(() => { /* iOS Safari 不支持则仅用 CSS 沉浸 */ })
    } else if (!on && doc.fullscreenElement && doc.exitFullscreen) {
      doc.exitFullscreen().catch(() => { /* ignore */ })
    }
    // 全屏切换后重测粒子画布
    setTimeout(this.fitViewport, 60)
    setTimeout(this.fitViewport, 380)
  }

  // ---------- 对局控制 ----------
  newGame() {
    this.clearTimers()
    this.overlay.style.display = 'none'
    this.state = createGame({ seed: (Math.random() * 0xffffffff) >>> 0 })
    this.selected.clear()
    this.lastHint = null
    this._playedKeys = {}
    this.renderAll()
    this.audio.sfx('deal')
    this.pump(drainEvents(this.state))
  }

  view() { return playerView(this.state, this.seat) }

  // 事件泵：处理 createGame/dispatch 产出的事件并推进 AI
  pump(events = []) {
    for (const e of events) this.onEvent(e)
    this.renderAll()
    const s = this.state
    if (s.phase === 'over') { this.showSettlement(); return }
    const active = s.phase === 'bidding' ? s.bidTurn : s.turn
    if (active === this.seat) {
      this.startTimer()
    } else {
      this.clearTimers()
      this.aiTimer = setTimeout(() => this.aiMove(active), 650 + Math.random() * 750)
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
    const active = s.phase === 'bidding' ? s.bidTurn : s.turn
    if (active !== this.seat) return
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
      case 'landlord':
        this.audio.sfx('landlord')
        this.flashFx('👑', e.seat === this.seat ? '你当地主！' : `${this.oppName(e.seat)} 当地主`)
        break
      case 'bomb':
        this.audio.sfx(e.combo === 'rocket' ? 'rocket' : 'bomb')
        this.flashFx(e.combo === 'rocket' ? '🚀' : '💥', e.combo === 'rocket' ? '王炸！' : '炸弹！')
        this.shake()
        if (e.combo === 'rocket') this.rocketFly()
        this.explosion()
        break
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
    }
  }

  oppName(seat) { return seat === this.seat ? '你' : AI_NAMES[seat - 1] }

  showBidBubble(seat, score) {
    const text = score === 0 ? '不叫' : `${score} 分`
    if (seat === this.seat) {
      this.status.textContent = `你：${text}`
      return
    }
    const panel = this.oppPanels[seat]
    const bubble = panel.querySelector('.ddz-bid-bubble')
    bubble.textContent = text
    bubble.classList.remove('pop')
    void bubble.offsetWidth
    bubble.classList.add('pop')
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
    const s = this.state
    const active = s.phase === 'bidding' ? s.bidTurn : s.turn
    if (active === this.seat) {
      this.meTimer.textContent = `${left}`
      this.meTimer.classList.toggle('urgent', left <= 5)
    } else {
      const el = this.oppPanels[active].querySelector('.ddz-timer')
      el.textContent = `${left}`
    }
  }

  timeoutAct() {
    const s = this.state
    if (s.phase === 'bidding') return this.humanAct({ type: 'bid', score: 0 })
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
    this.elLevel.textContent = `${levelOf(this.points)} ${this.points}分`
  }

  renderBottom() {
    const s = this.state
    this.bottomWrap.innerHTML = ''
    const label = h('span', 'ddz-bottom-label', '底牌')
    this.bottomWrap.append(label)
    const revealed = s.landlord >= 0
    const cards = revealed ? s.bottom : [null, null, null]
    for (const c of cards) {
      if (c === null) this.bottomWrap.append(h('div', 'ddz-card ddz-card-mini ddz-card-back'))
      else {
        const el = cardEl(c, true)
        el.classList.add('flip-in')
        this.bottomWrap.append(el)
      }
    }
  }

  renderOpps() {
    const s = this.state
    for (const seat of [1, 2]) {
      const p = this.oppPanels[seat]
      const count = s.hands[seat].length
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
      const active = (s.phase === 'bidding' ? s.bidTurn : s.turn) === seat && s.phase !== 'over'
      p.classList.toggle('is-active', active)
      if (!active) p.querySelector('.ddz-timer').textContent = ''
      if (s.phase !== 'bidding') p.querySelector('.ddz-bid-bubble').textContent = ''
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
    this.mePanel.innerHTML = ''
    const avatar = h('div', 'ddz-avatar ddz-avatar-me', '😎')
    const name = h('div', 'ddz-opp-name', '你')
    const role = h('div', 'ddz-role')
    if (s.landlord >= 0) {
      const isLord = s.landlord === this.seat
      role.textContent = isLord ? '👑 地主' : '🌾 农民'
      role.classList.add(isLord ? 'ddz-role-lord' : 'ddz-role-farmer')
    }
    this.meTimer = h('div', 'ddz-timer')
    this.mePanel.append(avatar, name, role, this.meTimer)
    const active = (s.phase === 'bidding' ? s.bidTurn : s.turn) === this.seat && s.phase !== 'over'
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
    this.points = Math.max(0, this.points + s.scores[this.seat])
    localStorage.setItem('ddz-points', String(this.points))
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
    // 三家积分与余牌
    for (const seat of [0, 1, 2]) {
      const row = h('div', 'ddz-settle-player')
      const sc = s.scores[seat]
      row.append(
        h('span', 'ddz-settle-name', `${seat === this.seat ? '你' : AI_NAMES[seat - 1]}${seat === s.landlord ? ' 👑' : ''}`),
        h('span', 'ddz-settle-score ' + (sc > 0 ? 'plus' : 'minus'), sc > 0 ? `+${sc}` : `${sc}`)
      )
      const cards = h('div', 'ddz-settle-cards')
      if (s.hands[seat].length) for (const c of s.hands[seat]) cards.append(cardEl(c, true))
      else cards.append(h('span', 'ddz-settle-empty', '已出完'))
      row.append(cards)
      box.append(row)
    }
    box.append(h('div', 'ddz-settle-level', `当前积分 ${this.points} · ${levelOf(this.points)}`))
    const again = h('button', 'ddz-btn ddz-btn-primary', '再来一局')
    again.type = 'button'
    again.onclick = () => this.newGame()
    const back = h('a', 'ddz-btn', '返回游戏列表')
    back.href = '/blogs/other/games.html'
    const row = h('div', 'ddz-settle-actions')
    row.append(again, back)
    box.append(row)
    // BGM 署名（CC BY 3.0 要求）
    box.append(h('div', 'ddz-settle-credit', '♪ BGM: Kawai Kitsune — Kevin MacLeod (incompetech.com) · CC BY 3.0'))
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
    this.clearTimers()
    this.audio.destroy()
    window.removeEventListener('resize', this.fitViewport)
    window.removeEventListener('orientationchange', this.fitViewport)
    window.removeEventListener('load', this.fitViewport)
    if (this.fitTimers) this.fitTimers.forEach(clearTimeout)
    if (this.fxRaf) cancelAnimationFrame(this.fxRaf)
    this.rocketEl = null
    if (this.cwFab) this.cwFab.style.display = this.cwFabPrevDisplay || ''
    if (this.navbar) this.navbar.style.display = ''
    document.body.style.overflow = this.bodyPrevOverflow || ''
    // 全屏 portal 状态移回文档流原位
    this.root.classList.remove('ddz-full')
    if (this._anchor && this._anchor.parentNode) {
      this._anchor.parentNode.insertBefore(this.root, this._anchor)
      this._anchor.remove()
      this._anchor = null
    }
    this.root.innerHTML = ''
    this.root.style.height = ''
  }
}
