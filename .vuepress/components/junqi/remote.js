// ============================================================
// 四国军棋联机房间（junqi/remote.js）
// ------------------------------------------------------------
// 把通用联机服务渲染成军棋体验：
//   等待室（4 座 / 思考时长；固定四暗，只能看自己棋子）→ 并行布阵（换阵 / 两子交换 /
//   确认出征，四家确认态）→ 掷骰定先手 → 十字棋盘对局（暗子背面、
//   合法落点高亮、战场记录）→ 阵营结算（±10）→ 全员准备开下一局。
//
// 服务端是权威：本地只发意图（randomize / swap / confirm / move /
// surrender），棋盘完全按 GAME_STATE_CHANGED 视图绘制。
// 暗棋隐私由服务端视图保证：敌子只发匿名 ref，没有棋种。
// 棋盘 SVG 与单机版同源（engine.mjs 的 BOARD 拓扑），按 mySeat 旋转
// 视角：自己永远在下方，对家（队友）在上方。
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
import { BOARD, TYPES, ARMIES } from './engine.mjs'

const COLORS = ['#176b5a', '#9d4139', '#355f92', '#936028']
const TEAM_NAMES = ['青龙 × 玄武', '赤虎 × 朱雀']
// 单机版徽标锚点（下 / 左 / 上 / 右），联机版按视角旋转后重新定位
const BADGE_ANCHORS = [
  [680, 792],
  [173, 235],
  [221, 106],
  [727, 663]
]
// 骰子点位：3×3 九宫格下标
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

const px = n => 50 + n * 50

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))
}

export default class JunqiRemote {
  /**
   * @param {HTMLElement} root 挂载点
   * @param {Object} opts { net, room, player, onExit }（与五子棋联机同契约）
   */
  constructor(root, { net, room, player, onExit } = {}) {
    this.root = root
    this.net = net
    this.room = room || null
    this.player = player || {}
    this.onExit = typeof onExit === 'function' ? onExit : () => {}

    this.view = null
    this.results = null
    this.selected = null // 当前选中的己方棋子 id
    this.destroyed = false
    this.readySent = false
    this._openingShown = null // 已展示过掷骰的 gameId

    this._unsub = this.net.subscribe(msg => this._onEvent(msg))
    this._tickTimer = null
    this._diceTimer = null
    this._recorder = null
    this._recordAt = 0
    this._voiceBubbles = []
  }

  mount() {
    this._renderShell()
    this._renderWaiting()
    this._tickTimer = setInterval(() => this._tick(), 500)
    if (this.room && this.room.status === 'PLAYING') this._showGame()
    return this
  }

  destroy() {
    this.destroyed = true
    if (this._unsub) this._unsub()
    if (this._tickTimer) clearInterval(this._tickTimer)
    if (this._diceTimer) clearTimeout(this._diceTimer)
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
        this._openingShown = null
        if (this.$settle) this.$settle.hidden = true
        if (this.room) {
          this.room.status = 'PLAYING'
          this.room.round = p.round
          if (p.seats) this.room.seats = p.seats
          if (p.rules) this.room.rules = p.rules
          if (p.turnTimeoutSeconds) this.room.turnTimeoutSeconds = p.turnTimeoutSeconds
        }
        this._showGame()
        this._toast('第 ' + (p.round || 1) + ' 局开始 · 布阵阶段')
        break
      case 'GAME_STATE_CHANGED': {
        const prevPhase = this.view && this.view.phase
        this.view = p
        if (this.room) this.room.status = 'PLAYING'
        if (this.selected && !(p.pieces || []).some(x => x.id === this.selected)) this.selected = null
        this._showGame()
        this._renderGame()
        // 布阵 → 开战：展示一次掷骰结果
        const gid = p.meta && p.meta.gameId
        if (p.phase === 'play' && p.opening && prevPhase === 'setup' && this._openingShown !== gid) {
          this._openingShown = gid
          this._showDice(p.opening)
        }
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
          this._drawBoard()
        }
        break
      case 'GAME_FINISHED':
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

  _mySeat() {
    if (this.view && this.view.meta && this.view.meta.mySeat != null) return this.view.meta.mySeat
    return this.player.seatIndex != null ? this.player.seatIndex : 0
  }

  _isAdmin() {
    return this.room && this.room.adminSeat === this._mySeat()
  }

  // ---------- 视图骨架 ----------

  _renderShell() {
    this.root.innerHTML =
      '<div class="gkr-room-head">' +
      '  <div class="gkr-room-title">四国军棋 · 房间 <b class="gkr-code">' + esc(this._roomCode()) + '</b></div>' +
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
      case 'randomize':
        this._sendIntent({ type: 'randomize' })
        break
      case 'confirm':
        this.selected = null
        this._sendIntent({ type: 'confirm' })
        break
      case 'surrender':
        this.selected = null
        this._sendIntent({ type: 'surrender' })
        break
      case 'voice-play':
        this._playVoice(Number(t.getAttribute('data-idx')))
        break
    }
  }

  _sendIntent(action) {
    if (!this.view || !this.view.meta) return
    this.net.sendAction({
      gameId: this.view.meta.gameId,
      windowId: this.view.meta.windowId,
      action
    })
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
      const isAlly = s.seatIndex % 2 === mySeat % 2
      const role = isMe ? '（你）' : isAlly ? '（队友）' : ''
      const army =
        '<span class="jqr-army-tag" style="background:' + COLORS[s.seatIndex] + '">' + ARMIES[s.seatIndex] + '</span>'
      let body
      if (s.occupantType === 'HUMAN') {
        body =
          '<div class="gkr-seat-name">' + army + esc(s.displayName || '棋友') +
          (s.isAdmin ? ' 👑' : '') + role + '</div>' +
          '<div class="gkr-seat-sub">' +
          (s.connected ? (s.ready ? '已准备' : room.hasPlayed ? '未准备' : '在线') : '断线托管中') +
          '</div>'
      } else if (s.occupantType === 'AI') {
        body =
          '<div class="gkr-seat-name">' + army + 'AI 陪练' + (s.isAdmin ? ' 👑' : '') + role + '</div>' +
          '<div class="gkr-seat-sub">已就绪</div>' +
          (admin ? '<button type="button" class="gkr-btn gkr-btn-mini" data-gkr="remove-ai" data-seat="' + s.seatIndex + '">移除</button>' : '')
      } else {
        body =
          '<div class="gkr-seat-name gkr-empty">' + army + '空位</div>' +
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
      actionHtml =
        '<button type="button" class="gkr-btn gkr-btn-primary" data-gkr="ready"' + (ready ? ' disabled' : '') + '>' +
        (ready ? '已准备 · 等待其他玩家' : '准备下一局') + '</button>'
    } else if (admin) {
      actionHtml =
        '<button type="button" class="gkr-btn gkr-btn-primary" data-gkr="start">开始游戏</button>' +
        '<div class="gkr-hint">空位会自动补 AI；对家是你的队友，布阵完成后掷骰定先手</div>'
    } else {
      actionHtml = '<div class="gkr-hint">等待房主开始游戏…</div>'
    }

    this.$stage.innerHTML =
      '<div class="gkr-waiting">' +
      '  <div class="gkr-seats">' + seatHtml + '</div>' +
      '  <div class="gkr-rules-row">' +
      '    <span class="gh-field">思考时长 ' + stepperHtml('turnTimeoutSeconds', TIMEOUT_VALUES, room.turnTimeoutSeconds || 20, fmtTimeout, !admin) + '</span>' +
      '    <span class="gh-field gkr-fixed-rule">模式：四暗（只能看到自己的棋子）</span>' +
      '  </div>' +
      '  <div class="gkr-waiting-actions">' + actionHtml + '</div>' +
      '  <div class="gkr-share-hint">邀请好友：把房号 <b>' + esc(this._roomCode()) + '</b> 发给对方，或复制邀请链接</div>' +
      '</div>'
  }

  _sendRules() {
    if (!this._isAdmin()) return
    // 联机固定四暗（只能看自己棋子），房主只能改思考时长
    this.net.sendAdmin('UPDATE_RULES', {
      rules: { mode: 'dark' },
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
      '  <div class="jqr-board-wrap">' +
      '    <svg class="jqr-board" data-jqr-svg viewBox="24 24 852 852" role="group" aria-label="四国军棋棋盘"></svg>' +
      '  </div>' +
      '  <div class="jqr-actions" data-jqr-actions></div>' +
      '  <div class="jqr-log" data-jqr-log><ol></ol></div>' +
      '  <div class="gkr-settle" data-gkr-settle hidden></div>' +
      '</div>' +
      '<div class="jqr-dice" data-jqr-dice hidden></div>'
    this.$game = this.$stage.querySelector('.gkr-game')
    this.$svg = this.$stage.querySelector('[data-jqr-svg]')
    this.$actions = this.$stage.querySelector('[data-jqr-actions]')
    this.$log = this.$stage.querySelector('[data-jqr-log] ol')
    this.$settle = this.$stage.querySelector('[data-gkr-settle]')
    this.$dice = this.root.querySelector('[data-jqr-dice]')

    this.$svg.addEventListener('click', ev => {
      const g = ev.target && ev.target.closest ? ev.target.closest('[data-node]') : null
      if (g) this._clickNode(g.getAttribute('data-node'))
    })
    this._renderGame()
  }

  _renderGame() {
    if (!this.$game || !this.view) return
    this._renderActions()
    this._renderLog()
    this._drawBoard()
    if (this.results) this._renderSettlement()
  }

  _setStatus(text, thinking) {
    this.$status.hidden = false
    this.$status.textContent = text
    this.$status.classList.toggle('is-thinking', !!thinking)
  }

  _baseStatus() {
    const v = this.view
    if (!v) return { text: '', thinking: false }
    if (v.phase === 'setup') {
      return v.myConfirmed
        ? { text: '已确认出征 · 等待其他玩家布阵', thinking: true }
        : { text: '布阵阶段 · 点击两枚己方棋子交换位置', thinking: false }
    }
    if (v.phase === 'play') {
      const myTurn = (v.legal || []).some(o => o.type === 'move')
      return myTurn
        ? { text: '轮到你行棋', thinking: false }
        : { text: ARMIES[v.turn] + ' 行棋中', thinking: true }
    }
    return { text: '本局结束', thinking: false }
  }

  _tick() {
    if (!this.view || !this.view.meta || this.view.phase === 'finished') return
    const dl = this.view.meta.deadlineAt
    if (!dl) return
    const left = Math.max(0, Math.ceil((dl - Date.now()) / 1000))
    const base = this._baseStatus()
    this._setStatus(base.text + ' · ' + left + 's', base.thinking)
  }

  // ---------- 布阵 / 走子交互 ----------

  _legalMovesFor(pieceId) {
    const opt = (this.view && this.view.legal ? this.view.legal : []).find(o => o.type === 'move')
    if (!opt) return []
    return opt.moves.filter(m => m.pieceId === pieceId).map(m => m.to)
  }

  _clickNode(nodeId) {
    const v = this.view
    if (!v || this.results) return
    const piece = (v.pieces || []).find(p => p.pos === nodeId)
    const mySeat = v.mySeat

    if (v.phase === 'setup') {
      if (v.myConfirmed) return this._toast('已确认出征，等待其他玩家')
      if (!piece || piece.seat !== mySeat) return this._toast('只能调整自己的棋子')
      if (this.selected && this.selected !== piece.id) {
        this._sendIntent({ type: 'swap', first: this.selected, second: piece.id })
        this.selected = null
      } else {
        this.selected = this.selected === piece.id ? null : piece.id
      }
      this._drawBoard()
      return
    }

    if (v.phase !== 'play') return
    const canMove = (v.legal || []).some(o => o.type === 'move')
    if (!canMove) return // 非我方回合

    if (this.selected && this._legalMovesFor(this.selected).indexOf(nodeId) >= 0) {
      const id = this.selected
      this.selected = null
      this._sendIntent({ type: 'move', pieceId: id, to: nodeId })
      this._drawBoard()
      return
    }
    if (piece && piece.seat === mySeat && piece.type) {
      if (this.selected === piece.id) {
        this.selected = null
      } else {
        this.selected = piece.id
        if (!this._legalMovesFor(piece.id).length) this._toast('这枚棋子不能移动')
      }
    } else {
      this.selected = null
    }
    this._drawBoard()
  }

  _renderActions() {
    if (!this.$actions || !this.view) return
    const v = this.view
    if (v.phase === 'setup') {
      const locked = v.myConfirmed
      const confirmed = (v.confirmed || []).map((c, i) => (c ? ARMIES[i] : null)).filter(Boolean)
      this.$actions.innerHTML =
        '<button type="button" class="gkr-btn" data-gkr="randomize"' + (locked ? ' disabled' : '') + '>换一套阵型</button>' +
        '<button type="button" class="gkr-btn gkr-btn-primary" data-gkr="confirm"' + (locked ? ' disabled' : '') + '>' +
        (locked ? '已确认出征' : '确认出征') + '</button>' +
        '<div class="jqr-actions-note">' +
        (confirmed.length ? '已出征：' + confirmed.join('、') : '四家都在布阵中') +
        '</div>'
      return
    }
    if (v.phase === 'play') {
      const canPlay = (v.legal || []).length > 0
      this.$actions.innerHTML =
        '<button type="button" class="gkr-btn gkr-btn-danger" data-gkr="surrender"' + (canPlay ? '' : ' disabled') + '>投降</button>' +
        '<div class="jqr-actions-note">' + v.quiet + ' / 70 无碰撞</div>'
      return
    }
    this.$actions.innerHTML = ''
  }

  _renderLog() {
    if (!this.$log || !this.view) return
    const logs = (this.view.logs || []).slice(0, 8)
    this.$log.innerHTML = logs.length
      ? logs.map(line => '<li>' + esc(line) + '</li>').join('')
      : '<li>布阵完成后四家确认出征，掷骰定先手。</li>'
  }

  // ---------- 棋盘绘制（视角：自己永远在下方） ----------

  _viewAngle() {
    return ((360 - 90 * this._mySeat()) % 360 + 360) % 360
  }

  _edgePath(e) {
    const a = BOARD.byId[e.a]
    const b = BOARD.byId[e.b]
    if (!e.curve) return 'M' + px(a.x) + ' ' + px(a.y) + 'L' + px(b.x) + ' ' + px(b.y)
    const turn = BOARD.adjacency[e.a].find(x => x.to === e.b)
    return 'M' + px(a.x) + ' ' + px(a.y) + 'Q' + px(a.x + turn.start[0]) + ' ' + px(a.y + turn.start[1]) + ' ' + px(b.x) + ' ' + px(b.y)
  }

  _drawBoard() {
    if (!this.$svg || !this.view) return
    const v = this.view
    const A = this._viewAngle()
    const mySeat = v.mySeat
    const destinations = this.selected ? this._legalMovesFor(this.selected) : []
    const seats = (v.meta && v.meta.seats) || []
    const scores = (this.room && this.room.scores) || (v.meta && v.meta.scores) || []

    const byPos = {}
    for (const p of v.pieces || []) byPos[p.pos] = p

    let out =
      '<defs>' +
      '<linearGradient id="jqr-surface" x2="0" y2="1"><stop stop-color="#203c38"/><stop offset="1" stop-color="#112a29"/></linearGradient>' +
      '<linearGradient id="jqr-piece" x2="0" y2="1"><stop stop-color="#fff8df"/><stop offset="1" stop-color="#d5c596"/></linearGradient>' +
      '<filter id="jqr-shadow" x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="1" flood-opacity=".35"/></filter>' +
      '</defs>' +
      '<rect x="24" y="24" width="852" height="852" fill="url(#jqr-surface)"/>'

    // 视野旋转层：四家阵地着色 → 道路 → 铁路枕木 → 最后一手 → 节点与棋子
    out += '<g transform="rotate(' + A + ' 450 450)">'
    for (let seat = 0; seat < 4; seat++) {
      out +=
        '<rect x="340" y="584" width="220" height="272" rx="14" transform="rotate(' + seat * 90 + ' 450 450)" fill="' +
        COLORS[seat] + '" opacity=".1"/>'
    }
    for (const e of BOARD.edges) {
      out +=
        '<path d="' + this._edgePath(e) + '" fill="none" stroke="' + (e.rail ? '#8eaa97' : '#648279') +
        '" stroke-width="' + (e.rail ? 6 : 1.5) + '" opacity="' + (e.rail ? 0.78 : 0.6) + '"/>'
    }
    for (const e of BOARD.edges) {
      if (!e.rail) continue
      out += '<path d="' + this._edgePath(e) + '" fill="none" stroke="#152e2a" stroke-width="2" stroke-dasharray="3 5"/>'
    }
    if (v.lastMove && BOARD.byId[v.lastMove.from] && BOARD.byId[v.lastMove.to]) {
      const a = BOARD.byId[v.lastMove.from]
      const b = BOARD.byId[v.lastMove.to]
      out +=
        '<path d="M' + px(a.x) + ' ' + px(a.y) + 'L' + px(b.x) + ' ' + px(b.y) + '" fill="none" stroke="#ffdc83" stroke-width="4" opacity=".6" stroke-dasharray="6 6" pointer-events="none"/>' +
        '<circle cx="' + px(b.x) + '" cy="' + px(b.y) + '" r="24" fill="none" stroke="#ffdc83" stroke-width="2" pointer-events="none"/>'
    }

    for (const node of BOARD.nodes) {
      const seatDeg = node.seat === 1 ? ' rotate(90)' : node.seat === 3 ? ' rotate(-90)' : ''
      const labelDeg = -(A + (node.seat === 1 ? 90 : node.seat === 3 ? -90 : 0))
      const piece = byPos[node.id]
      const isDest = destinations.indexOf(node.id) >= 0
      out += '<g data-node="' + node.id + '" transform="translate(' + px(node.x) + ' ' + px(node.y) + ')' + seatDeg + '" class="jqr-node">'
      out += '<rect x="-24" y="-23" width="48" height="46" fill="transparent"/>'
      if (node.kind === 'camp') {
        out += '<circle r="16" fill="#243f35" stroke="#94af82" stroke-width="2"/>'
      } else if (node.kind === 'hq') {
        out += '<rect x="-21" y="-15" width="42" height="30" rx="3" fill="#3b4935" stroke="#c0a86e" stroke-width="2"/>'
      } else {
        out += '<circle r="' + (node.kind === 'junction' ? 7 : 4) + '" fill="#243c35" stroke="#a4aa87" stroke-width="1.5"/>'
      }
      if (!piece && (node.kind === 'camp' || node.kind === 'hq')) {
        out +=
          '<text class="jqr-site-label" text-anchor="middle" y="4" transform="rotate(' + labelDeg + ')">' +
          (node.kind === 'camp' ? '营' : '本营') + '</text>'
      }
      if (isDest) {
        out += '<circle r="22" fill="#f6db79" opacity=".25"/><circle r="7" fill="#ffe8a0"/>'
      }
      if (piece) {
        const sel = this.selected === piece.id
        out += '<g filter="url(#jqr-shadow)">'
        out +=
          '<rect x="-23" y="-20" width="46" height="40" rx="6" fill="' + (piece.type ? 'url(#jqr-piece)' : COLORS[piece.seat]) +
          '" stroke="' + (sel ? '#fff0a0' : COLORS[piece.seat]) + '" stroke-width="' + (sel ? 4 : 2) + '"/>'
        out +=
          '<rect x="-19" y="-16" width="38" height="32" rx="3" fill="none" stroke="' +
          (piece.type ? COLORS[piece.seat] : '#ffffff55') + '" stroke-width=".7"/>'
        if (piece.type) {
          out +=
            '<text class="jqr-piece-t" text-anchor="middle" y="6" fill="' + COLORS[piece.seat] + '">' +
            TYPES[piece.type].name + '</text>'
        }
        out += '</g>'
      }
      out += '</g>'
    }
    out += '</g>' // 视野旋转层结束

    // 四家徽标（不随视野转，文字始终正立）：军色 + 军名 + 玩家 + 状态
    const rad = (A * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    for (let seat = 0; seat < 4; seat++) {
      const dx = BADGE_ANCHORS[seat][0] - 450
      const dy = BADGE_ANCHORS[seat][1] - 450
      const bx = 450 + dx * cos - dy * sin
      const by = 450 + dx * sin + dy * cos
      const meta = seats[seat] || {}
      const name = meta.displayName || (meta.isAi ? 'AI' : '虚位')
      const meTag = seat === mySeat ? '（你）' : seat % 2 === mySeat % 2 ? '（队友）' : ''
      let state
      if (v.phase === 'setup') state = (v.confirmed || [])[seat] ? '已出征' : '布阵中'
      else if (!(v.alive || [])[seat]) state = '已出局'
      else if (v.phase === 'play' && v.turn === seat) state = '行棋中'
      else state = ''
      const active = v.phase === 'play' && v.turn === seat && (v.alive || [])[seat]
      const score = scores[seat]
      out +=
        '<g transform="translate(' + bx + ' ' + by + ')" pointer-events="none">' +
        '<rect x="-86" y="-15" width="172" height="30" rx="15" fill="' + (active ? COLORS[seat] : '#0b2321') +
        '" stroke="' + (active ? '#ffdda1' : '#48635b') + '"/>' +
        '<text text-anchor="middle" y="5" fill="#f8efd5" font-size="13">' +
        esc(ARMIES[seat] + ' · ' + name + meTag + (state ? ' · ' + state : '') + (score != null ? ' · ' + score + '分' : '')) +
        '</text></g>'
    }

    this.$svg.innerHTML = out
  }

  // ---------- 掷骰定先手 ----------

  _showDice(opening) {
    if (!this.$dice || !opening || !opening.rounds) return
    const rounds = opening.rounds
    const first = opening.first
    const dieHtml = value =>
      '<b class="jqr-die">' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => '<i class="' + ((PIPS[value] || []).indexOf(n) >= 0 ? 'is-on' : '') + '"></i>').join('') +
      '</b>'
    let html =
      '<div class="jqr-dice-card">' +
      '<div class="jqr-dice-title">掷骰定先手</div>'
    rounds.forEach((rows, i) => {
      html += '<div class="jqr-dice-round">'
      if (rounds.length > 1) {
        html += '<div class="jqr-dice-round-tag">' + (i ? '并列最高点 · 重掷第 ' + i + ' 轮' : '第一轮') + '</div>'
      }
      html += '<ul class="jqr-dice-rows">'
      for (const row of rows) {
        const sum = row.dice[0] + row.dice[1]
        html +=
          '<li class="' + (i === rounds.length - 1 && row.seat === first ? 'is-first' : '') + (i < rounds.length - 1 ? ' is-past' : '') + '">' +
          '<i class="jqr-dice-seat" style="background:' + COLORS[row.seat] + '"></i>' +
          '<span class="jqr-dice-army">' + ARMIES[row.seat] + '</span>' +
          '<span class="jqr-dice-hand">' + dieHtml(row.dice[0]) + dieHtml(row.dice[1]) + '</span>' +
          '<strong>' + sum + '</strong></li>'
      }
      html += '</ul></div>'
    })
    html +=
      '<div class="jqr-dice-msg">' + ARMIES[first] + ' 取得先手，对局开始' +
      (rounds.length > 1 ? '（并列重掷 ' + (rounds.length - 1) + ' 次）' : '') + '</div></div>'
    this.$dice.innerHTML = html
    this.$dice.hidden = false
    if (this._diceTimer) clearTimeout(this._diceTimer)
    this._diceTimer = setTimeout(() => {
      this.$dice.hidden = true
      this.$dice.innerHTML = ''
    }, 2600)
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
      title = '和棋 · 势均力敌'
      cls = 'is-draw'
    } else if (res.winner === mySeat % 2) {
      title = '同盟胜利 +' + Math.abs(mine.delta || 0)
      cls = 'is-win'
    } else {
      title = '本局失利 ' + (mine.delta || 0)
      cls = 'is-loss'
    }

    const seats = (this.view && this.view.meta ? this.view.meta.seats : [])
    const scoreLine = seats
      .map(s => {
        const sc = scores[s.absSeat]
        const bust = bankrupt.indexOf(s.absSeat) >= 0
        return (
          '<span class="gkr-settle-score' + (bust ? ' is-bust' : '') + '">' +
          '<i class="jqr-dot" style="background:' + COLORS[s.absSeat] + '"></i>' +
          esc(ARMIES[s.absSeat] + ' · ' + (s.displayName || (s.isAi ? 'AI' : '棋友'))) + '：' + (sc == null ? '-' : sc) +
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
        (ready ? '已准备 · 等待其他玩家' : '准备下一局（重新布阵）') + '</button>' +
        '<button type="button" class="gkr-btn" data-gkr="leave">退出房间</button>'
    }

    const winnerText = res.draw ? '' : res.winner != null ? '胜方：' + TEAM_NAMES[res.winner] : ''
    this.$settle.hidden = false
    this.$settle.innerHTML =
      '<div class="gkr-settle-card">' +
      '<div class="gkr-settle-title ' + cls + '">' + title + '</div>' +
      '<div class="gkr-settle-sub">第 ' + (this.results.round || 1) + ' 局 · 共 ' + (res.turns || 0) + ' 手' +
      (winnerText ? ' · ' + winnerText : '') + '</div>' +
      '<div class="gkr-settle-scores">' + scoreLine + '</div>' +
      '<div class="gkr-settle-btns">' + btns + '</div>' +
      '</div>'
  }

  // ---------- 语音（与五子棋联机同款） ----------

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
    const text = '来下四国军棋！房号 ' + code + ' → ' + url
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

/** 进入军棋房间：建 NetClient → 连接 → 挂载房间 UI（供大厅调用） */
export function enterJunqiRoom(root, { room, player, cred, onExit }) {
  const net = new NetClient({
    onError: () => {}
  })
  saveCredential(cred)
  return new Promise((resolve, reject) => {
    net
      .connect(cred)
      .then(() => {
        const remote = new JunqiRemote(root, { net, room, player, onExit })
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
