// ============================================================
// 五子棋联机房间（gomoku/remote.js）
// ------------------------------------------------------------
// 把通用联机服务（房间 / 座位 / 行动窗口 / 多局积分）渲染成五子棋体验：
//   等待室（座位 / AI / 规则 / 开始）→ 对局（木质棋盘 + 倒计时）→
//   结算（胜负 ±10、多局累计、破产）→ 全员准备自动开下一局（换先）。
// 网络层复用 mahjong/multiplayer/net-client.js（HTTP + WS + 自动重连）。
// 服务端是权威：本地只发意图（move），棋盘完全按 GAME_STATE_CHANGED 视图绘制。
// ============================================================

import {
  NetClient,
  saveCredential,
  clearCredential,
  errorText
} from '../mahjong/multiplayer/net-client.js'
import {
  TIMEOUT_VALUES,
  fmtTimeout,
  stepperHtml,
  ctlValue,
  handleCtlClick
} from '../gamehall/controls.js'
import { BOARD_SIZE, EMPTY, BLACK, WHITE } from './engine.js'

const STAR_POINTS = [
  [3, 3],
  [3, 11],
  [11, 3],
  [11, 11],
  [7, 7]
]

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))
}

export default class GomokuRemote {
  /**
   * @param {HTMLElement} root 挂载点（本类负责其中的全部渲染）
   * @param {Object} opts
   *   - net     : 已完成 RECONNECT 的 NetClient
   *   - room    : 建房 / 加入返回的房间摘要
   *   - player  : { playerId, roomCode, seatIndex, displayName }
   *   - onExit  : 离开房间（退出 / 房间销毁 / 令牌失效）后回调，回到大厅
   */
  constructor(root, { net, room, player, onExit } = {}) {
    this.root = root
    this.net = net
    this.room = room || null
    this.player = player || {}
    this.onExit = typeof onExit === 'function' ? onExit : () => {}

    this.view = null // 最新 GAME_STATE_CHANGED（自己座位视角）
    this.results = null // 最近一局的结算（ROOM_UPDATED 口径，含 scores）
    this.hover = null
    this.status = 'open'
    this.destroyed = false
    this.readySent = false

    this._unsub = this.net.subscribe(msg => this._onEvent(msg))
    this._unsubStatus = null
    this._tickTimer = null
    this._recorder = null
    this._recordAt = 0
    this._voiceBubbles = []
  }

  mount() {
    this._renderShell()
    this._renderWaiting()
    this._tickTimer = setInterval(() => this._tick(), 500)
    // 已进入房间的对局（刷新重连）：快照随后由服务器推送
    if (this.room && this.room.status === 'PLAYING') this._showGame()
    return this
  }

  destroy() {
    this.destroyed = true
    if (this._unsub) this._unsub()
    if (this._tickTimer) clearInterval(this._tickTimer)
    if (this._onResize) window.removeEventListener('resize', this._onResize)
    this._stopRecording(true)
    this.root.innerHTML = ''
  }

  // ---------- 事件 ----------

  _onEvent(msg) {
    if (this.destroyed || !msg || !msg.type) return
    const p = msg.payload || {}
    switch (msg.type) {
      case 'ROOM_SNAPSHOT':
        this.room = { ...(this.room || {}), ...p }
        if (this.room.status === 'PLAYING') this._showGame()
        else this._renderWaiting()
        break
      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
      case 'AI_ADDED':
      case 'AI_REMOVED':
      case 'READY_CHANGED':
      case 'PLAYER_CONNECTED':
      case 'PLAYER_DISCONNECTED':
        if (p.seats && this.room) this.room.seats = p.seats
        if (p.adminSeat != null && this.room) this.room.adminSeat = p.adminSeat
        if (this.room && this.room.status !== 'PLAYING') this._renderWaiting()
        else this._renderPlayersStrip()
        break
      case 'ADMIN_CHANGED':
        if (this.room) this.room.adminSeat = p.newAdminSeat
        if (p.seats && this.room) this.room.seats = p.seats
        if (this.room && this.room.status !== 'PLAYING') this._renderWaiting()
        break
      case 'RULES_UPDATED':
        if (this.room) {
          this.room.rules = p.rules
          this.room.turnTimeoutSeconds = p.turnTimeoutSeconds
        }
        if (this.room && this.room.status !== 'PLAYING') this._renderWaiting()
        break
      case 'GAME_STARTED':
        this.results = null
        this.readySent = false
        if (this.$settle) this.$settle.hidden = true
        if (this.room) {
          this.room.status = 'PLAYING'
          this.room.round = p.round
          if (p.seats) this.room.seats = p.seats
          if (p.rules) this.room.rules = p.rules
          if (p.turnTimeoutSeconds) this.room.turnTimeoutSeconds = p.turnTimeoutSeconds
          this.room.ceremony = p.ceremony || null
        }
        this._showGame()
        this._toast('第 ' + (p.round || 1) + ' 局开始 · ' + this._firstMoveText(p.ceremony))
        break
      case 'GAME_STATE_CHANGED':
        this.view = p
        if (this.room) this.room.status = 'PLAYING'
        this._showGame()
        this._renderGame()
        break
      case 'ROOM_UPDATED':
        if (this.room) {
          this.room.status = p.status
          this.room.round = p.round
          if (p.seats) this.room.seats = p.seats
          if (p.scores) this.room.scores = p.scores
          if (p.bankruptSeats) this.room.bankruptSeats = p.bankruptSeats
        }
        if (p.results) {
          this.results = p
          this._renderSettlement()
        }
        break
      case 'GAME_FINISHED':
        // 结算展示统一走 ROOM_UPDATED（带累计积分）；这里仅兜底刷新棋盘
        this._drawBoard()
        break
      case 'VOICE_MSG':
        this._addVoiceBubble(p, false)
        break
      case 'ROOM_DESTROYED':
        this._toast('房间已解散')
        this._exit()
        break
      case 'LEFT_ROOM':
        this._exit()
        break
      case 'ERROR':
        if (msg.fatal || msg.errorCode === 'INVALID_RESUME_TOKEN') {
          this._toast(errorText(msg.errorCode))
          this._exit()
        }
        break
    }
  }

  _firstMoveText(ceremony) {
    if (!ceremony || ceremony.firstSeat == null) return '黑棋先行'
    const mine = ceremony.firstSeat === this._mySeat()
    return mine ? '你执黑先行' : '对方执黑先行'
  }

  _mySeat() {
    if (this.view && this.view.meta && this.view.meta.mySeat != null) return this.view.meta.mySeat
    return this.player.seatIndex != null ? this.player.seatIndex : 0
  }

  _isAdmin() {
    const seat = this._mySeat()
    return this.room && this.room.adminSeat === seat
  }

  // ---------- 视图骨架 ----------

  _renderShell() {
    this.root.innerHTML =
      '<div class="gkr-room-head">' +
      '  <div class="gkr-room-title">五子棋 · 房间 <b class="gkr-code">' + esc(this._roomCode()) + '</b></div>' +
      '  <div class="gkr-head-btns">' +
      '    <button type="button" class="gkr-btn" data-gkr="copy">复制邀请链接</button>' +
      '    <button type="button" class="gkr-btn gkr-btn-danger" data-gkr="leave">退出房间</button>' +
      '  </div>' +
      '</div>' +
      '<div class="gkr-status-pill" data-gkr-status hidden></div>' +
      '<div class="gkr-stage" data-gkr-stage></div>' +
      '<div class="gkr-voice-dock" data-gkr-voice-dock>' +
      '  <button type="button" class="gkr-mic" data-gkr="mic" aria-label="按住说话">🎤</button>' +
      '  <div class="gkr-voice-tip" data-gkr-voice-tip>按住说话</div>' +
      '</div>' +
      '<div class="gkr-bubbles" data-gkr-bubbles></div>' +
      '<div class="gkr-toast" data-gkr-toast hidden></div>'

    this.$stage = this.root.querySelector('[data-gkr-stage]')
    this.$status = this.root.querySelector('[data-gkr-status]')
    this.$bubbles = this.root.querySelector('[data-gkr-bubbles]')
    this.$toast = this.root.querySelector('[data-gkr-toast]')
    this.$mic = this.root.querySelector('[data-gkr="mic"]')
    this.$micTip = this.root.querySelector('[data-gkr-voice-tip]')

    this.root.addEventListener('click', ev => this._onClick(ev))
    // 按住说话（触屏 + 鼠标通用）
    const mic = this.$mic
    mic.addEventListener('pointerdown', ev => {
      ev.preventDefault()
      this._startRecording()
    })
    mic.addEventListener('pointerup', () => this._stopRecording(false))
    mic.addEventListener('pointercancel', () => this._stopRecording(true))
    mic.addEventListener('pointerleave', () => this._stopRecording(false))
  }

  _roomCode() {
    return (this.room && this.room.roomCode) || this.player.roomCode || ''
  }

  _onClick(ev) {
    // 分段 chips / 步进器（等待室房规，改动即生效）
    if (handleCtlClick(ev, () => this._sendRules())) return
    const t = ev.target.closest('[data-gkr]')
    if (!t) return
    const act = t.getAttribute('data-gkr')
    switch (act) {
      case 'copy':
        this._copyInvite()
        break
      case 'leave':
        this._leave()
        break
      case 'start':
        this.net.sendAdmin('START_GAME')
        break
      case 'add-ai':
        this.net.sendAdmin('ADD_AI', { seatIndex: Number(t.getAttribute('data-seat')) })
        break
      case 'remove-ai':
        this.net.sendAdmin('REMOVE_AI', { seatIndex: Number(t.getAttribute('data-seat')) })
        break
      case 'ready':
        this._toggleReady(true)
        break
      case 'rules':
        this._sendRules()
        break
      case 'voice-play':
        this._playVoice(Number(t.getAttribute('data-idx')))
        break
    }
  }

  // ---------- 等待室 ----------

  _renderWaiting() {
    if (!this.room) return
    const room = this.room
    const seats = room.seats || []
    const admin = this._isAdmin()
    const mySeat = this._mySeat()

    let seatHtml = ''
    for (const s of seats) {
      const isMe = s.seatIndex === mySeat
      let body
      if (s.occupantType === 'HUMAN') {
        body =
          '<div class="gkr-seat-name">' + esc(s.displayName || '棋友') +
          (s.isAdmin ? ' 👑' : '') + (isMe ? '（你）' : '') + '</div>' +
          '<div class="gkr-seat-sub">' +
          (s.connected ? (s.ready ? '已准备' : (room.hasPlayed ? '未准备' : '在线')) : '断线托管中') +
          '</div>'
      } else if (s.occupantType === 'AI') {
        body =
          '<div class="gkr-seat-name">AI 陪练' + (s.isAdmin ? ' 👑' : '') + '</div>' +
          '<div class="gkr-seat-sub">已就绪</div>' +
          (admin ? '<button type="button" class="gkr-btn gkr-btn-mini" data-gkr="remove-ai" data-seat="' + s.seatIndex + '">移除</button>' : '')
      } else {
        body =
          '<div class="gkr-seat-name gkr-empty">空位</div>' +
          (admin
            ? '<button type="button" class="gkr-btn gkr-btn-mini" data-gkr="add-ai" data-seat="' + s.seatIndex + '">+ 添加 AI</button>'
            : '<div class="gkr-seat-sub">分享房号邀好友，或等房主补 AI</div>')
      }
      seatHtml += '<div class="gkr-seat' + (isMe ? ' is-me' : '') + '">' + body + '</div>'
    }

    let actionHtml
    if (room.hasPlayed) {
      const me = seats.find(s => s.seatIndex === mySeat)
      const ready = me && me.ready
      const othersReady = seats.every(s => s.occupantType !== 'HUMAN' || !s.connected || s.ready)
      actionHtml =
        '<button type="button" class="gkr-btn gkr-btn-primary" data-gkr="ready"' + (ready ? ' disabled' : '') + '>' +
        (ready ? '已准备 · 等待对手' : '准备下一局') + '</button>' +
        (ready && !othersReady ? '<div class="gkr-hint">对方还没准备…</div>' : '')
    } else if (admin) {
      actionHtml =
        '<button type="button" class="gkr-btn gkr-btn-primary" data-gkr="start">开始游戏</button>' +
        '<div class="gkr-hint">空位会自动补 AI；黑棋先行，每局换先</div>'
    } else {
      actionHtml = '<div class="gkr-hint">等待房主开始游戏…</div>'
    }

    this.$stage.innerHTML =
      '<div class="gkr-waiting">' +
      '  <div class="gkr-seats">' + seatHtml + '</div>' +
      '  <div class="gkr-rules-row">' +
      '    <span class="gh-field">思考时长 ' + stepperHtml('turnTimeoutSeconds', TIMEOUT_VALUES, room.turnTimeoutSeconds || 20, fmtTimeout, !admin) + '</span>' +
      '    <span class="gh-field gkr-fixed-rule">AI 难度：中等（补位 / 托管同档）</span>' +
      '  </div>' +
      '  <div class="gkr-waiting-actions">' + actionHtml + '</div>' +
      '  <div class="gkr-share-hint">邀请好友：把房号 <b>' + esc(this._roomCode()) + '</b> 发给对方，或复制邀请链接</div>' +
      '</div>'
  }

  _sendRules() {
    if (!this._isAdmin()) return
    // 联机固定中等 AI（补位 / 断线托管同档），房主只能改思考时长
    this.net.sendAdmin('UPDATE_RULES', {
      rules: { aiLevel: 'medium' },
      turnTimeoutSeconds: Number(ctlValue(this.$stage, 'turnTimeoutSeconds')) || undefined
    })
  }

  _toggleReady(ready) {
    this.readySent = ready
    this.net.sendAdmin('TOGGLE_READY', { ready })
    const me = this.room && (this.room.seats || []).find(s => s.seatIndex === this._mySeat())
    if (me) me.ready = ready
    if (this.room && this.room.status !== 'PLAYING') this._renderWaiting()
    this._renderSettlement()
  }

  // ---------- 对局 ----------

  _showGame() {
    if (this.$game) return
    this.$stage.innerHTML =
      '<div class="gkr-game">' +
      '  <div class="gkr-players" data-gkr-players></div>' +
      '  <div class="gkr-board-wrap"><canvas data-gkr-canvas></canvas></div>' +
      '  <div class="gkr-game-foot" data-gkr-foot></div>' +
      '  <div class="gkr-settle" data-gkr-settle hidden></div>' +
      '</div>'
    this.$game = this.$stage.querySelector('.gkr-game')
    this.$canvas = this.$stage.querySelector('[data-gkr-canvas]')
    this.ctx = this.$canvas.getContext('2d')
    this.$players = this.$stage.querySelector('[data-gkr-players]')
    this.$foot = this.$stage.querySelector('[data-gkr-foot]')
    this.$settle = this.$stage.querySelector('[data-gkr-settle]')

    this.$canvas.addEventListener('click', ev => this._onBoardClick(ev))
    this.$canvas.addEventListener('mousemove', ev => this._onBoardHover(ev))
    this.$canvas.addEventListener('mouseleave', () => {
      this.hover = null
      this._drawBoard()
    })
    window.addEventListener('resize', this._onResize || (this._onResize = () => this._layoutBoard()))
    this._layoutBoard()
    this._renderGame()
  }

  _layoutBoard() {
    if (!this.$canvas) return
    const wrap = this.$canvas.parentElement
    const avail = Math.min(wrap.clientWidth || 320, window.innerHeight - 240, 560)
    const size = Math.max(280, Math.floor(avail))
    this.size = size
    this.dpr = window.devicePixelRatio || 1
    this.$canvas.width = size * this.dpr
    this.$canvas.height = size * this.dpr
    this.$canvas.style.width = size + 'px'
    this.$canvas.style.height = size + 'px'
    this.pad = Math.round(size * 0.075)
    this.cell = (size - this.pad * 2) / (BOARD_SIZE - 1)
    this.stoneR = this.cell * 0.44
    this._drawBoard()
  }

  _renderGame() {
    if (!this.$game || !this.view) return
    this._renderPlayersStrip()
    this._renderFoot()
    this._drawBoard()
    if (this.results) this._renderSettlement()
  }

  _renderPlayersStrip() {
    if (!this.$players || !this.view) return
    const meta = this.view.meta || {}
    const seats = meta.seats || []
    const myColor = this.view.myColor
    const colorName = c => (c === BLACK ? '⚫ 黑棋' : '⚪ 白棋')
    const strip = seats
      .map(s => {
        const color = this.view.seatColor ? this.view.seatColor[s.absSeat] : EMPTY
        const turn = this.view.phase === 'play' && this.view.seatColor && this.view.seatColor[s.absSeat] === this.view.turn
        const cls = 'gkr-pl' + (s.absSeat === meta.mySeat ? ' is-me' : '') + (turn ? ' is-turn' : '')
        const score = this.room && this.room.scores ? this.room.scores[s.absSeat] : null
        return (
          '<div class="' + cls + '">' +
          '<span class="gkr-pl-color">' + (color ? colorName(color) : '') + '</span>' +
          '<span class="gkr-pl-name">' + esc(s.displayName || (s.isAi ? 'AI 陪练' : '棋友')) +
          (s.absSeat === meta.mySeat ? '（你）' : '') + '</span>' +
          (score != null ? '<span class="gkr-pl-score">' + score + ' 分</span>' : '') +
          '<span class="gkr-pl-state">' +
          (s.isAi ? 'AI' : s.connected ? (s.autoPlay ? '托管' : '在线') : '断线') +
          '</span>' +
          '</div>'
        )
      })
      .join('')
    this.$players.innerHTML = strip + '<div class="gkr-round">第 ' + (meta.round || 1) + ' 局 · ' + (this.view.moves || 0) + ' 手 · 你执' + (myColor === BLACK ? '黑' : '白') + '</div>'
  }

  _renderFoot() {
    if (!this.$foot || !this.view) return
    if (this.view.phase !== 'play') {
      this._setStatus('本局结束', false)
      this.$foot.innerHTML = ''
      return
    }
    const myTurn = (this.view.legal || []).some(o => o.type === 'move')
    const turnColor = this.view.turn === BLACK ? '黑' : '白'
    this._setStatus(myTurn ? '轮到你落子（' + turnColor + '）' : '对手思考中', !myTurn)
    this.$foot.innerHTML = myTurn ? '<div class="gkr-hint">点棋盘交叉点落子，超时由 AI 代下</div>' : ''
  }

  _setStatus(text, thinking) {
    this.$status.hidden = false
    this.$status.textContent = text
    this.$status.classList.toggle('is-thinking', !!thinking)
  }

  _tick() {
    if (!this.view || !this.view.meta || this.view.phase !== 'play') return
    const dl = this.view.meta.deadlineAt
    if (!dl) return
    const left = Math.max(0, Math.ceil((dl - Date.now()) / 1000))
    const myTurn = (this.view.legal || []).some(o => o.type === 'move')
    const base = myTurn ? '轮到你落子' : '对手思考中'
    this._setStatus(base + ' · ' + left + 's', !myTurn)
  }

  // ---------- 棋盘绘制（与单机同款木质风格） ----------

  _boardPoint(ev) {
    const rect = this.$canvas.getBoundingClientRect()
    const px = ev.clientX - rect.left
    const py = ev.clientY - rect.top
    const x = Math.round((px - this.pad) / this.cell)
    const y = Math.round((py - this.pad) / this.cell)
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null
    const cx = this.pad + x * this.cell
    const cy = this.pad + y * this.cell
    if (Math.abs(px - cx) > this.cell * 0.45 || Math.abs(py - cy) > this.cell * 0.45) return null
    return { x, y }
  }

  _onBoardClick(ev) {
    if (!this.view || this.view.phase !== 'play') return
    if (!(this.view.legal || []).some(o => o.type === 'move')) return
    const pt = this._boardPoint(ev)
    if (!pt) return
    if (this.view.board[pt.y][pt.x] !== EMPTY) return
    const meta = this.view.meta || {}
    this.net.sendAction({
      gameId: meta.gameId,
      windowId: meta.windowId,
      action: { type: 'move', x: pt.x, y: pt.y }
    })
  }

  _onBoardHover(ev) {
    if (!this.view || this.view.phase !== 'play') return
    if (!(this.view.legal || []).some(o => o.type === 'move')) {
      if (this.hover) {
        this.hover = null
        this._drawBoard()
      }
      return
    }
    const pt = this._boardPoint(ev)
    const next = pt && this.view.board[pt.y][pt.x] === EMPTY ? pt : null
    if ((next && !this.hover) || (!next && this.hover) || (next && this.hover && (next.x !== this.hover.x || next.y !== this.hover.y))) {
      this.hover = next
      this._drawBoard()
    }
  }

  _drawBoard() {
    if (!this.ctx || !this.view) {
      // 等待室还没视图时不画
      if (this.ctx && !this.view) this._drawEmptyBoard()
      return
    }
    const { ctx, size, pad, cell } = this
    const board = this.view.board
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    // 外框 + 木板
    const frame = ctx.createLinearGradient(0, 0, size, size)
    frame.addColorStop(0, '#8a5a2b')
    frame.addColorStop(0.5, '#6f4419')
    frame.addColorStop(1, '#54310f')
    ctx.fillStyle = frame
    this._roundRect(0, 0, size, size, size * 0.03)
    ctx.fill()
    const inset = pad * 0.55
    const wood = ctx.createLinearGradient(inset, inset, size - inset, size - inset)
    wood.addColorStop(0, '#f0c98c')
    wood.addColorStop(0.5, '#e2af6a')
    wood.addColorStop(1, '#d29a52')
    ctx.fillStyle = wood
    this._roundRect(inset, inset, size - inset * 2, size - inset * 2, size * 0.02)
    ctx.fill()

    // 网格
    ctx.strokeStyle = 'rgba(58, 34, 8, 0.78)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < BOARD_SIZE; i++) {
      const p = pad + i * cell
      ctx.moveTo(pad, p)
      ctx.lineTo(size - pad, p)
      ctx.moveTo(p, pad)
      ctx.lineTo(p, size - pad)
    }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(58, 34, 8, 0.95)'
    ctx.lineWidth = 2
    ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2)

    // 星位
    ctx.fillStyle = 'rgba(58, 34, 8, 0.9)'
    for (const [sx, sy] of STAR_POINTS) {
      ctx.beginPath()
      ctx.arc(pad + sx * cell, pad + sy * cell, Math.max(3, cell * 0.1), 0, Math.PI * 2)
      ctx.fill()
    }

    // 悬停预览
    if (this.hover && board[this.hover.y][this.hover.x] === EMPTY) {
      this._drawStone(this.hover.x, this.hover.y, this.view.myColor, 0.35)
    }

    // 棋子
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (board[y][x] !== EMPTY) this._drawStone(x, y, board[y][x], 1)
      }
    }

    // 最后一手
    const last = this.view.lastMove
    if (last) {
      ctx.beginPath()
      ctx.arc(pad + last.x * cell, pad + last.y * cell, Math.max(2.5, cell * 0.09), 0, Math.PI * 2)
      ctx.fillStyle = '#ff4d2d'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.stroke()
    }

    // 胜利连线
    const line = this.view.winLine
    if (line && line.length) {
      const a = line[0]
      const b = line[line.length - 1]
      ctx.save()
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(255, 77, 45, 0.85)'
      ctx.lineWidth = Math.max(3, cell * 0.12)
      ctx.shadowColor = 'rgba(255, 77, 45, 0.8)'
      ctx.shadowBlur = 14
      ctx.beginPath()
      ctx.moveTo(pad + a[0] * cell, pad + a[1] * cell)
      ctx.lineTo(pad + b[0] * cell, pad + b[1] * cell)
      ctx.stroke()
      ctx.restore()
    }
  }

  _drawEmptyBoard() {
    const { ctx, size } = this
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
  }

  _drawStone(x, y, color, alpha) {
    const { ctx, pad, cell, stoneR } = this
    const cx = pad + x * cell
    const cy = pad + y * cell
    const r = stoneR
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
    ctx.shadowBlur = r * 0.35
    ctx.shadowOffsetY = r * 0.14
    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
    if (color === BLACK) {
      grad.addColorStop(0, '#777')
      grad.addColorStop(0.35, '#333')
      grad.addColorStop(1, '#000')
    } else {
      grad.addColorStop(0, '#fff')
      grad.addColorStop(0.6, '#efefef')
      grad.addColorStop(1, '#c6c6c6')
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    if (color === WHITE) {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }
  }

  _roundRect(x, y, w, h, r) {
    const { ctx } = this
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  // ---------- 结算 ----------

  _renderSettlement() {
    if (!this.$settle || !this.results) return
    const res = this.results.results || {}
    const scores = this.results.scores || (this.room && this.room.scores) || []
    const bankrupt = this.results.bankruptSeats || []
    const mySeat = this._mySeat()
    const mine = (res.perSeat || []).find(p => p.seat === mySeat) || {}
    const finished = this.results.status === 'FINISHED'

    let title, cls
    if (res.draw) {
      title = '和棋'
      cls = 'is-draw'
    } else if (res.winner === mySeat) {
      title = '你赢了 +' + Math.abs(mine.delta || 0)
      cls = 'is-win'
    } else {
      title = '你输了 ' + (mine.delta || 0)
      cls = 'is-loss'
    }

    const scoreLine = (this.view && this.view.meta ? this.view.meta.seats : [])
      .map(s => {
        const sc = scores[s.absSeat]
        const bust = bankrupt.indexOf(s.absSeat) >= 0
        return (
          '<span class="gkr-settle-score' + (bust ? ' is-bust' : '') + '">' +
          esc(s.displayName || (s.isAi ? 'AI' : '棋友')) + '：' + (sc == null ? '-' : sc) +
          (bust ? '（已破产）' : '') + '</span>'
        )
      })
      .join('')

    let btns
    if (finished) {
      btns =
        '<div class="gkr-settle-final">有玩家破产，房间进入终局</div>' +
        '<button type="button" class="gkr-btn gkr-btn-primary" data-gkr="leave">退出房间</button>'
    } else {
      const me = this.room && (this.room.seats || []).find(s => s.seatIndex === mySeat)
      const ready = (me && me.ready) || this.readySent
      btns =
        '<button type="button" class="gkr-btn gkr-btn-primary" data-gkr="ready"' + (ready ? ' disabled' : '') + '>' +
        (ready ? '已准备 · 等待对手' : '准备下一局（换先）') + '</button>' +
        '<button type="button" class="gkr-btn" data-gkr="leave">退出房间</button>'
    }

    this.$settle.hidden = false
    this.$settle.innerHTML =
      '<div class="gkr-settle-card">' +
      '<div class="gkr-settle-title ' + cls + '">' + title + '</div>' +
      '<div class="gkr-settle-sub">第 ' + (this.results.round || 1) + ' 局 · 共 ' + (res.moves || 0) + ' 手</div>' +
      '<div class="gkr-settle-scores">' + scoreLine + '</div>' +
      '<div class="gkr-settle-btns">' + btns + '</div>' +
      '</div>'
  }

  // ---------- 语音 ----------

  async _startRecording() {
    if (this._recorder || !navigator.mediaDevices || !window.MediaRecorder) {
      if (!window.MediaRecorder) this._toast('当前浏览器不支持语音录制')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks = []
      rec.ondataavailable = e => {
        if (e.data && e.data.size) chunks.push(e.data)
      }
      rec.onstop = () => {
        for (const t of stream.getTracks()) t.stop()
        if (this._recordCancel) return
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        const duration = Math.min(20, (Date.now() - this._recordAt) / 1000)
        if (duration < 0.4 || !blob.size) return
        const reader = new FileReader()
        reader.onload = () => {
          const base64 = String(reader.result || '').split(',')[1] || ''
          if (!base64) return
          this.net.sendVoice({ mime: blob.type, data: base64, duration })
          this._addVoiceBubble({ mime: blob.type, data: base64, duration, seatIndex: this._mySeat() }, true)
        }
        reader.readAsDataURL(blob)
      }
      this._recorder = rec
      this._recordCancel = false
      this._recordAt = Date.now()
      rec.start()
      this.$mic.classList.add('is-rec')
      this.$micTip.textContent = '松开发送 · 最长 20s'
      // 硬上限：20s 自动停
      this._recTimer = setTimeout(() => this._stopRecording(false), 20000)
    } catch (e) {
      this._toast('无法使用麦克风')
    }
  }

  _stopRecording(cancel) {
    if (this._recTimer) {
      clearTimeout(this._recTimer)
      this._recTimer = null
    }
    const rec = this._recorder
    this._recorder = null
    this.$mic.classList.remove('is-rec')
    this.$micTip.textContent = '按住说话'
    if (!rec) return
    this._recordCancel = !!cancel
    try {
      if (rec.state !== 'inactive') rec.stop()
    } catch (e) {
      /* 已停止 */
    }
  }

  _addVoiceBubble(p, mine) {
    this._voiceBubbles.push({ ...p, mine })
    if (this._voiceBubbles.length > 12) this._voiceBubbles.shift()
    const idx = this._voiceBubbles.length - 1
    const who = mine ? '你' : this._seatName(p.seatIndex)
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'gkr-bubble' + (mine ? ' is-mine' : '')
    el.setAttribute('data-gkr', 'voice-play')
    el.setAttribute('data-idx', String(idx))
    el.textContent = '🔊 ' + who + ' · ' + Math.round(p.duration || 0) + '″'
    this.$bubbles.appendChild(el)
    setTimeout(() => {
      el.classList.add('is-old')
    }, 30000)
  }

  _seatName(seatIndex) {
    const seats = (this.view && this.view.meta && this.view.meta.seats) || (this.room && this.room.seats) || []
    const s = seats.find(x => (x.absSeat != null ? x.absSeat : x.seatIndex) === seatIndex)
    return s ? s.displayName || (s.isAi ? 'AI' : '棋友') : '棋友'
  }

  _playVoice(idx) {
    const b = this._voiceBubbles[idx]
    if (!b) return
    try {
      new Audio('data:' + b.mime + ';base64,' + b.data).play()
    } catch (e) {
      this._toast('语音播放失败')
    }
  }

  // ---------- 通用 ----------

  _copyInvite() {
    const code = this._roomCode()
    let url
    try {
      const u = new URL(location.href)
      u.searchParams.set('room', code)
      url = u.toString()
    } catch (e) {
      url = location.href + '?room=' + code
    }
    const text = '来下五子棋！房号 ' + code + ' → ' + url
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this._toast('邀请链接已复制'),
        () => this._toast('房号：' + code)
      )
    } else {
      this._toast('房号：' + code)
    }
  }

  _leave() {
    clearCredential()
    this.net.leaveRoom()
    this._exit()
  }

  _exit() {
    if (this.destroyed) return
    const cb = this.onExit
    this.destroy()
    cb()
  }

  _toast(text) {
    this.$toast.textContent = text
    this.$toast.hidden = false
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => {
      this.$toast.hidden = true
    }, 2400)
  }
}

/** 进入五子棋房间：建 NetClient → 连接 → 挂载房间 UI（供大厅调用） */
export function enterGomokuRoom(root, { room, player, cred, onExit }) {
  const net = new NetClient({
    onError: () => {}
  })
  saveCredential(cred)
  return new Promise((resolve, reject) => {
    net
      .connect(cred)
      .then(() => {
        const remote = new GomokuRemote(root, { net, room, player, onExit })
        remote.mount()
        resolve({ net, remote })
      })
      .catch(err => {
        clearCredential()
        net.close()
        reject(err)
      })
  })
}
