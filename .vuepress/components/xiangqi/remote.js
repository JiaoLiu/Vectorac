// ============================================================
// 中国象棋联机房间（xiangqi/remote.js）
// ------------------------------------------------------------
// 把通用联机服务（房间 / 座位 / 行动窗口 / 多局积分）渲染成象棋体验：
//   等待室（座位 / AI / 规则 / 开始）→ 对局（木质棋盘 + 选中高亮 + 将军提示
//   + 倒计时）→ 结算（胜负 ±10、多局累计、破产）→ 全员准备自动开下一局（换先）。
// 网络层复用 mahjong/multiplayer/net-client.js（HTTP + WS + 自动重连）。
// 服务端是权威：本地只发意图（move），棋盘完全按 GAME_STATE_CHANGED 视图绘制；
// 执黑时棋盘自动翻转（自己一方永远在下方）。
// 样式复用 gamehall.md 里的 gkr-* 类（与五子棋联机房间同款外观）。
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
import { RED, BLACK, FILES, RANKS, PIECE_LABELS } from './engine.mjs'

// 炮位 / 兵位的小角标（传统棋盘花符）
const STAR_MARKS = [
  [1, 2],
  [7, 2],
  [0, 3],
  [2, 3],
  [4, 3],
  [6, 3],
  [8, 3],
  [1, 7],
  [7, 7],
  [0, 6],
  [2, 6],
  [4, 6],
  [6, 6],
  [8, 6]
]

const PIECE_FONT = '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", serif'

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))
}

export default class XiangqiRemote {
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
    this.selected = null // 选中的己方棋子 {x,y}（逻辑坐标）
    this.status = 'open'
    this.destroyed = false
    this.readySent = false

    this._unsub = this.net.subscribe(msg => this._onEvent(msg))
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
        this.selected = null
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
      case 'GAME_STATE_CHANGED': {
        const prevTurn = this.view && this.view.turn
        this.view = p
        if (this.room) this.room.status = 'PLAYING'
        // 换人走子时清掉旧选中；若选中的棋子已不在（被吃/已走）也清掉
        if (this.selected && (!this._isMyTurn() || p.turn !== prevTurn)) this.selected = null
        this._showGame()
        this._renderGame()
        break
      }
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
          this.selected = null
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
    if (!ceremony || ceremony.firstSeat == null) return '红棋先行'
    const mine = ceremony.firstSeat === this._mySeat()
    return mine ? '你执红先行' : '对方执红先行'
  }

  _mySeat() {
    if (this.view && this.view.meta && this.view.meta.mySeat != null) return this.view.meta.mySeat
    return this.player.seatIndex != null ? this.player.seatIndex : 0
  }

  _isAdmin() {
    const seat = this._mySeat()
    return this.room && this.room.adminSeat === seat
  }

  _isMyTurn() {
    return !!(this.view && this.view.phase === 'play' && (this.view.legal || []).some(o => o.type === 'move'))
  }

  // ---------- 视图骨架 ----------

  _renderShell() {
    this.root.innerHTML =
      '<div class="gkr-room-head">' +
      '  <div class="gkr-room-title">中国象棋 · 房间 <b class="gkr-code">' + esc(this._roomCode()) + '</b></div>' +
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
        '<div class="gkr-hint">空位会自动补 AI；红棋先行，每局换先</div>'
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
    window.addEventListener('resize', this._onResize || (this._onResize = () => this._layoutBoard()))
    this._layoutBoard()
    this._renderGame()
  }

  _layoutBoard() {
    if (!this.$canvas) return
    const wrap = this.$canvas.parentElement
    const maxW = Math.min(wrap.clientWidth || 320, 480)
    const maxH = Math.max(320, window.innerHeight - 260)
    // 棋盘 9 路 × 10 路：宽 ≈ 9.6·cell（2×0.8 边距 + 8 格），高 ≈ 10.6·cell
    let cell = Math.min(maxW / 9.6, maxH / 10.6)
    cell = Math.max(24, Math.floor(cell))
    this.cell = cell
    this.pad = Math.round(cell * 0.8)
    const w = this.pad * 2 + cell * (FILES - 1)
    const h = this.pad * 2 + cell * (RANKS - 1)
    this.w = w
    this.h = h
    this.dpr = window.devicePixelRatio || 1
    this.$canvas.width = w * this.dpr
    this.$canvas.height = h * this.dpr
    this.$canvas.style.width = w + 'px'
    this.$canvas.style.height = h + 'px'
    this.pieceR = cell * 0.42
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
    const colorName = c => (c === RED ? '🔴 红方' : '⚫ 黑方')
    const strip = seats
      .map(s => {
        const color = this.view.seatColor ? this.view.seatColor[s.absSeat] : null
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
    this.$players.innerHTML =
      strip +
      '<div class="gkr-round">第 ' + (meta.round || 1) + ' 局 · ' + Math.floor((this.view.moves || 0) / 2) + ' 回合 · 你执' +
      (myColor === RED ? '红' : '黑') + '</div>'
  }

  _renderFoot() {
    if (!this.$foot || !this.view) return
    if (this.view.phase !== 'play') {
      this._setStatus('本局结束', false)
      this.$foot.innerHTML = ''
      return
    }
    const myTurn = this._isMyTurn()
    const turnColor = this.view.turn === RED ? '红' : '黑'
    const checked = !!this.view.inCheck
    this._setStatus(
      (myTurn ? '轮到你走子（' + turnColor + '）' : '对手思考中') + (checked ? ' · 将军！' : ''),
      !myTurn
    )
    this.$foot.innerHTML = myTurn ? '<div class="gkr-hint">点选棋子，再点高亮落点；超时由 AI 代走</div>' : ''
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
    const myTurn = this._isMyTurn()
    const base = myTurn ? '轮到你走子' : '对手思考中'
    this._setStatus(base + ' · ' + left + 's', !myTurn)
  }

  // ---------- 棋盘交互 ----------

  /** 执黑时棋盘翻转：显示坐标 = 8-x, 9-y（对合变换，正逆相同） */
  _flip() {
    return this.view && this.view.myColor === BLACK
  }

  _toDisplay(x, y) {
    return this._flip() ? { x: FILES - 1 - x, y: RANKS - 1 - y } : { x, y }
  }

  _boardPoint(ev) {
    const rect = this.$canvas.getBoundingClientRect()
    const px = ev.clientX - rect.left
    const py = ev.clientY - rect.top
    const dx = Math.round((px - this.pad) / this.cell)
    const dy = Math.round((py - this.pad) / this.cell)
    if (dx < 0 || dx >= FILES || dy < 0 || dy >= RANKS) return null
    const cx = this.pad + dx * this.cell
    const cy = this.pad + dy * this.cell
    if (Math.abs(px - cx) > this.cell * 0.5 || Math.abs(py - cy) > this.cell * 0.5) return null
    return this._toDisplay(dx, dy)
  }

  /** 当前选中棋子的合法落点表（服务端视图 legal 已按轮走方过滤） */
  _targetsOf(sel) {
    const opt = (this.view && (this.view.legal || []) || []).find(o => o.type === 'move')
    if (!opt || !sel) return []
    return (opt.moves || []).filter(m => m.fromX === sel.x && m.fromY === sel.y)
  }

  _onBoardClick(ev) {
    if (!this._isMyTurn()) return
    const pt = this._boardPoint(ev)
    if (!pt) {
      if (this.selected) {
        this.selected = null
        this._drawBoard()
      }
      return
    }
    const piece = this.view.board[pt.y] && this.view.board[pt.y][pt.x]
    // 已选中：点高亮落点 → 走子；点回原棋子 → 取消
    if (this.selected) {
      if (pt.x === this.selected.x && pt.y === this.selected.y) {
        this.selected = null
        this._drawBoard()
        return
      }
      const hit = this._targetsOf(this.selected).find(m => m.toX === pt.x && m.toY === pt.y)
      if (hit) {
        const meta = this.view.meta || {}
        this.net.sendAction({
          gameId: meta.gameId,
          windowId: meta.windowId,
          action: { type: 'move', fromX: hit.fromX, fromY: hit.fromY, toX: hit.toX, toY: hit.toY }
        })
        this.selected = null
        this._drawBoard()
        return
      }
    }
    // 点己方棋子 → 选中 / 改选
    if (piece && piece.side === this.view.myColor) {
      this.selected = { x: pt.x, y: pt.y }
      this._drawBoard()
      return
    }
    if (this.selected) {
      this.selected = null
      this._drawBoard()
    }
  }

  // ---------- 棋盘绘制（与单机同款木质配色） ----------

  _drawBoard() {
    if (!this.ctx) return
    const { ctx, w, h, pad, cell, dpr } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // 外框 + 木板
    const frame = ctx.createLinearGradient(0, 0, w, h)
    frame.addColorStop(0, '#a96e3b')
    frame.addColorStop(1, '#5f3824')
    ctx.fillStyle = frame
    this._roundRect(0, 0, w, h, Math.min(18, cell * 0.4))
    ctx.fill()
    const inset = Math.max(5, cell * 0.14)
    const wood = ctx.createLinearGradient(0, 0, w, h)
    wood.addColorStop(0, '#f6d999')
    wood.addColorStop(0.5, '#e9bd70')
    wood.addColorStop(1, '#cf9148')
    ctx.fillStyle = wood
    this._roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.min(12, cell * 0.3))
    ctx.fill()

    const X = lx => pad + this._toDisplay(lx, 0).x * cell
    const Y = ly => pad + this._toDisplay(0, ly).y * cell

    // 网格线
    ctx.strokeStyle = 'rgba(74, 45, 16, 0.85)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let f = 0; f < FILES; f++) {
      if (f === 0 || f === FILES - 1) {
        ctx.moveTo(X(f), Y(0))
        ctx.lineTo(X(f), Y(RANKS - 1))
      } else {
        // 河界处断开（两端各留 2px 小口，贴近传统棋盘）
        ctx.moveTo(X(f), Y(0))
        ctx.lineTo(X(f), Y(4) - 2)
        ctx.moveTo(X(f), Y(5) + 2)
        ctx.lineTo(X(f), Y(RANKS - 1))
      }
    }
    for (let r = 0; r < RANKS; r++) {
      ctx.moveTo(X(0), Y(r))
      ctx.lineTo(X(FILES - 1), Y(r))
    }
    ctx.stroke()
    // 外边框加粗（翻转时 X(0) 在右侧，必须取小值作起点）
    ctx.lineWidth = 2
    ctx.strokeRect(
      Math.min(X(0), X(FILES - 1)),
      Math.min(Y(0), Y(RANKS - 1)),
      cell * (FILES - 1),
      cell * (RANKS - 1)
    )

    // 九宫斜线
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const [fx, fy, tx, ty] of [
      [3, 0, 5, 2],
      [5, 0, 3, 2],
      [3, 7, 5, 9],
      [5, 7, 3, 9]
    ]) {
      ctx.moveTo(X(fx), Y(fy))
      ctx.lineTo(X(tx), Y(ty))
    }
    ctx.stroke()

    // 炮位 / 兵位角标
    ctx.strokeStyle = 'rgba(74, 45, 16, 0.75)'
    for (const [mx, my] of STAR_MARKS) this._starMark(X(mx), Y(my), mx, cell)

    // 河界文字（屏幕向恒正；翻转时随棋盘互换左右）
    ctx.save()
    ctx.fillStyle = 'rgba(74, 45, 16, 0.66)'
    ctx.font = '600 ' + Math.round(cell * 0.52) + 'px ' + PIECE_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const riverY = (Y(4) + Y(5)) / 2
    ctx.fillText('楚  河', X(1) + cell * 0.5, riverY)
    ctx.fillText('漢  界', X(6) + cell * 0.5, riverY)
    ctx.restore()

    if (!this.view || !this.view.board) return
    const board = this.view.board

    // 最后一手高亮（起 / 止点）
    const last = this.view.lastMove
    if (last) {
      ctx.save()
      ctx.fillStyle = 'rgba(255, 126, 61, 0.28)'
      for (const [lx, ly] of [
        [last.fromX, last.fromY],
        [last.toX, last.toY]
      ]) {
        const d = this._toDisplay(lx, ly)
        this._roundRect(pad + d.x * cell - cell * 0.46, pad + d.y * cell - cell * 0.46, cell * 0.92, cell * 0.92, cell * 0.14)
        ctx.fill()
      }
      ctx.restore()
    }

    // 选中棋子 + 合法落点
    if (this.selected) {
      const d = this._toDisplay(this.selected.x, this.selected.y)
      ctx.save()
      ctx.strokeStyle = 'rgba(46, 160, 90, 0.95)'
      ctx.lineWidth = Math.max(2, cell * 0.06)
      ctx.beginPath()
      ctx.arc(pad + d.x * cell, pad + d.y * cell, this.pieceR + cell * 0.07, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      for (const m of this._targetsOf(this.selected)) {
        const td = this._toDisplay(m.toX, m.toY)
        const cx = pad + td.x * cell
        const cy = pad + td.y * cell
        ctx.save()
        if (board[m.toY][m.toX]) {
          // 可吃子：红圈
          ctx.strokeStyle = 'rgba(210, 60, 40, 0.9)'
          ctx.lineWidth = Math.max(2, cell * 0.055)
          ctx.beginPath()
          ctx.arc(cx, cy, this.pieceR + cell * 0.06, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          ctx.fillStyle = 'rgba(46, 160, 90, 0.75)'
          ctx.beginPath()
          ctx.arc(cx, cy, Math.max(3, cell * 0.11), 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
    }

    // 棋子
    for (let ly = 0; ly < RANKS; ly++) {
      for (let lx = 0; lx < FILES; lx++) {
        const piece = board[ly][lx]
        if (piece) this._drawPiece(lx, ly, piece)
      }
    }

    // 将军警示圈（画在被将军的将 / 帅上）
    if (this.view.inCheck) {
      const side = this.view.inCheck
      outer: for (let ly = 0; ly < RANKS; ly++) {
        for (let lx = 0; lx < FILES; lx++) {
          const piece = board[ly][lx]
          if (piece && piece.side === side && piece.type === 'K') {
            const d = this._toDisplay(lx, ly)
            ctx.save()
            ctx.strokeStyle = 'rgba(235, 50, 35, 0.95)'
            ctx.lineWidth = Math.max(2.5, cell * 0.07)
            ctx.shadowColor = 'rgba(235, 50, 35, 0.8)'
            ctx.shadowBlur = 10
            ctx.beginPath()
            ctx.arc(pad + d.x * cell, pad + d.y * cell, this.pieceR + cell * 0.09, 0, Math.PI * 2)
            ctx.stroke()
            ctx.restore()
            break outer
          }
        }
      }
    }
  }

  _starMark(cx, cy, file, cell) {
    const g = Math.max(2.5, cell * 0.07)
    const len = Math.max(4, cell * 0.14)
    const { ctx } = this
    ctx.save()
    ctx.lineWidth = 1
    ctx.beginPath()
    // 边路的点只画朝内的两个角
    const dirs = []
    if (file > 0) dirs.push(-1)
    if (file < FILES - 1) dirs.push(1)
    for (const sx of dirs) {
      for (const sy of [-1, 1]) {
        ctx.moveTo(cx + sx * g, cy + sy * (g + len))
        ctx.lineTo(cx + sx * g, cy + sy * g)
        ctx.lineTo(cx + sx * (g + len), cy + sy * g)
      }
    }
    ctx.stroke()
    ctx.restore()
  }

  _drawPiece(lx, ly, piece) {
    const { ctx, pad, cell, pieceR } = this
    const d = this._toDisplay(lx, ly)
    const cx = pad + d.x * cell
    const cy = pad + d.y * cell
    const r = pieceR
    const isRed = piece.side === RED

    ctx.save()
    // 投影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = r * 0.3
    ctx.shadowOffsetY = r * 0.12
    // 木面
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r)
    if (isRed) {
      grad.addColorStop(0, '#fff8e8')
      grad.addColorStop(0.5, '#f3dfbd')
      grad.addColorStop(1, '#d7b278')
    } else {
      grad.addColorStop(0, '#fff5de')
      grad.addColorStop(0.5, '#e8ddc5')
      grad.addColorStop(1, '#c4b28e')
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // 外沿 + 内圈
    ctx.save()
    ctx.strokeStyle = 'rgba(110, 66, 26, 0.85)'
    ctx.lineWidth = Math.max(1, r * 0.07)
    ctx.beginPath()
    ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = isRed ? 'rgba(179, 35, 26, 0.8)' : 'rgba(43, 43, 43, 0.7)'
    ctx.lineWidth = Math.max(1, r * 0.05)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()

    // 字
    ctx.save()
    ctx.fillStyle = isRed ? '#b3231a' : '#2b2b2b'
    ctx.font = '700 ' + Math.round(r * 1.02) + 'px ' + PIECE_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(PIECE_LABELS[piece.side][piece.type], cx, cy + r * 0.05)
    ctx.restore()
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
      '<div class="gkr-settle-sub">第 ' + (this.results.round || 1) + ' 局 · 共 ' + Math.floor((res.moves || 0) / 2) + ' 回合' +
      (res.winner != null ? ' · ' + (res.checkmate ? '绝杀' : '困毙') : '') + '</div>' +
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
    const text = '来下中国象棋！房号 ' + code + ' → ' + url
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

/** 进入中国象棋房间：建 NetClient → 连接 → 挂载房间 UI（供大厅调用） */
export function enterXiangqiRoom(root, { room, player, cred, onExit }) {
  const net = new NetClient({
    onError: () => {}
  })
  saveCredential(cred)
  return new Promise((resolve, reject) => {
    net
      .connect(cred)
      .then(() => {
        const remote = new XiangqiRemote(root, { net, room, player, onExit })
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
