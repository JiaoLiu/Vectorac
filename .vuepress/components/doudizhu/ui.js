// ============================================================
// 经典斗地主 UI（doudizhu/ui.js）
// QQ 游戏经典布局：地主居上/两农民分列左右（对家视角），
// 自己坐下方；叫分阶梯按钮、底牌翻转、倒计时圈、报双警报、
// 炸弹震动、结算明细。事件流驱动渲染，引擎权威。
// ============================================================

import {
  createGame, dispatch, playerView, settlementOf, drainEvents,
  classifyCombo, rankOf, suitOf, RANK_LABEL, COMBO_LABEL
} from './engine.mjs'
import { aiDecide, hintPlay } from './ai.js'
import { createDoudizhuAudio } from './audio.js'

const SUIT_SYMBOL = ['♠', '♥', '♣', '♦']
const SUIT_RED = [false, true, false, true]
const TURN_SECONDS = 20
const AI_NAMES = ['独孤求败', '常胜将军']
const AI_AVATARS = ['🗡️', '🎖️']

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

function cardEl(card, mini) {
  const el = h('div', 'ddz-card' + (mini ? ' ddz-card-mini' : ''))
  const rank = rankOf(card)
  if (rank >= 16) {
    el.classList.add('ddz-joker', rank === 17 ? 'ddz-joker-big' : 'ddz-joker-small')
    el.append(h('span', 'ddz-card-joker', rank === 17 ? '大王' : '小王'))
  } else {
    const suit = suitOf(card)
    if (SUIT_RED[suit]) el.classList.add('ddz-red')
    el.append(h('span', 'ddz-card-rank', RANK_LABEL[rank]), h('span', 'ddz-card-suit', SUIT_SYMBOL[suit]))
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
    // 隐藏全站右下角浮动客服，避免遮挡右侧玩家面板
    this.cwFab = document.getElementById('cw-fab')
    if (this.cwFab) { this.cwFabPrevDisplay = this.cwFab.style.display; this.cwFab.style.display = 'none' }
    // 精确贴合视口：根元素顶到屏幕底，规避主题 navbar/页脚高度差异
    this.fitViewport = () => {
      const top = Math.max(0, this.root.getBoundingClientRect().top)
      this.root.style.height = Math.max(320, window.innerHeight - top) + 'px'
    }
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
    btnSound.title = '音效'
    btnSound.onclick = () => {
      this.audio.setSoundOn(!this.audio.soundOn)
      btnSound.classList.toggle('is-on', this.audio.soundOn)
    }
    const btnExit = h('a', 'ddz-icon-btn', '✕')
    btnExit.href = '/blogs/other/games.html'
    btnExit.title = '返回游戏列表'
    this.topbar.append(
      h('span', 'ddz-logo', '斗地主'),
      this.elBase, this.elMult,
      h('span', 'ddz-topbar-gap'),
      this.elLevel, btnMusic, btnSound, btnExit
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
    // 特效层
    this.fx = h('div', 'ddz-fx')
    // 结算层
    this.overlay = h('div', 'ddz-overlay')
    this.overlay.style.display = 'none'
    this.table.append(
      this.bottomWrap,
      this.oppPanels[2], this.oppPanels[1],
      this.playAreas[2], this.playAreas[1], this.playAreas[0],
      this.status, this.actions, this.mePanel, this.handEl, this.fx, this.overlay
    )
    r.append(this.topbar, this.table)
  }

  bindGestures() {
    // 首次手势解锁音频
    const unlock = () => this.audio.unlock()
    this.root.addEventListener('pointerdown', unlock, { once: true })
    this.root.addEventListener('touchstart', unlock, { once: true })
  }

  // ---------- 对局控制 ----------
  newGame() {
    this.clearTimers()
    this.overlay.style.display = 'none'
    this.state = createGame({ seed: (Math.random() * 0xffffffff) >>> 0 })
    this.selected.clear()
    this.lastHint = null
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
        break
      case 'landlord':
        this.audio.sfx('landlord')
        this.flashFx('👑', e.seat === this.seat ? '你当地主！' : `${this.oppName(e.seat)} 当地主`)
        break
      case 'bomb':
        this.audio.sfx(e.combo === 'rocket' ? 'rocket' : 'bomb')
        this.flashFx(e.combo === 'rocket' ? '🚀' : '💥', e.combo === 'rocket' ? '王炸！' : '炸弹！')
        this.shake()
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
        if (e.spring) this.flashFx('🌸', '春天！')
        break
      }
    }
    if (e.type === 'play') this.audio.sfx('play')
    if (e.type === 'pass') this.audio.sfx('pass')
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
      this.meTimer.textContent = left <= 5 ? `${left}` : `${left}`
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
      if (s.phase !== 'playing' && s.phase !== 'over') continue
      const lp = s.lastPlay
      // 每家展示区：lastPlay 属于他家→牌；本 trick pass→不出
      if (lp && lp.seat === seat) {
        const wrap = h('div', 'ddz-played-cards')
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
    const n = hand.length
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
    this.handEl.style.setProperty('--hand-count', n)
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
    this.overlay.innerHTML = ''
    this.overlay.append(box)
    this.overlay.style.display = 'flex'
  }

  // ---------- 特效 ----------
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
    if (this.cwFab) this.cwFab.style.display = this.cwFabPrevDisplay || ''
    this.root.innerHTML = ''
    this.root.style.height = ''
  }
}
