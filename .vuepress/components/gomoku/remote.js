// ============================================================
// 五子棋联机房间（gomoku/remote.js）
// ------------------------------------------------------------
// 与单机共用同一套棋盘 UI（gomoku/ui.js 的 online 适配器模式）：
//   房间骨架直接用 .gk-root/.gk-panel 结构（顶栏 / 状态条 / 棋盘 /
//   结算浮层），GomokuUI 负责全屏接管、木纹棋盘、落子动画与音效，
//   横屏布局与单机完全一致；本类只负责：
//   等待室（座位 / AI / 规则 / 开始）→ 视图适配（服务端权威，本地只发
//   落子意图）→ 结算（±10、多局累计、破产）→ 全员准备自动开下一局。
// 网络层复用 mahjong/multiplayer/net-client.js（HTTP + WS + 自动重连）。
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
import {
  CHAT_PHRASES,
  speakPhrase,
  chatDockHtml,
  bindChatDock,
  VoiceRecorder,
  enqueueVoice
} from '../gamehall/chatkit.js'
import GomokuUI from './ui.js'
import { createBoard, BLACK } from './engine.js'

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
    this.destroyed = false
    this.readySent = false

    this.ui = null // GomokuUI（online 模式）：全屏 / 棋盘 / 动画 / 音效
    this._unsub = this.net.subscribe(msg => this._onEvent(msg))
    this._tickTimer = null
    this._voiceRec = null // VoiceRecorder（懒建，见 _startRecording）
    this._voiceBubbles = []
  }

  mount() {
    this._renderShell()
    // 单机 UI 以联机适配器挂载：enterFullscreen 会把 gk-root 移挂 body，
    // 等待室起即全屏；棋盘区在游戏开始前保持 hidden
    this.ui = new GomokuUI(this.$roomRoot, { online: this._makeOnlineAdapter() })
    this.ui.mount()
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
    this._stopRecording(true)
    if (this._chat) this._chat.destroy()
    // ui.destroy 内部 exitFullscreen 并把 gk-root 移回原位
    if (this.ui) {
      this.ui.destroy()
      this.ui = null
    }
    this.root.innerHTML = ''
  }

  // ---------- 联机适配器（GomokuUI 的数据源） ----------

  _makeOnlineAdapter() {
    return {
      getView: () => this._onlineView(),
      place: (x, y) => {
        const meta = (this.view && this.view.meta) || {}
        this.net.sendAction({
          gameId: meta.gameId,
          windowId: meta.windowId,
          action: { type: 'move', x, y }
        })
      },
      statusText: () => this._statusText()
    }
  }

  /** 渲染层视图：把服务端 GAME_STATE_CHANGED 映射成 GomokuUI 的契约 */
  _onlineView() {
    const v = this.view
    if (!v) {
      // 等待室 / 开局快照未到的空窗：空棋盘（棋盘区此时 hidden，仅兜底）
      if (!this._emptyBoard) this._emptyBoard = createBoard()
      return {
        board: this._emptyBoard,
        myColor: BLACK,
        lastMove: null,
        winLine: null,
        moves: 0,
        canMove: false,
        over: false,
        iWon: false,
        draw: false
      }
    }
    const over = v.phase !== 'play'
    const mySeat = v.meta && v.meta.mySeat != null ? v.meta.mySeat : this._mySeat()
    return {
      board: v.board,
      myColor: v.myColor,
      lastMove: v.lastMove,
      winLine: v.winLine,
      moves: v.moves || 0,
      canMove: v.phase === 'play' && (v.legal || []).some(o => o.type === 'move'),
      over,
      iWon: over && v.winner != null && v.winner === mySeat,
      draw: over && !!v.draw
    }
  }

  /** 状态条文案：轮次 / 倒计时 / 对手断线托管提示 */
  _statusText() {
    const v = this.view
    if (!v) return { text: '同步棋局中…', dot: null }
    if (v.phase !== 'play') return { text: '本局结束', dot: null }
    const myTurn = (v.legal || []).some(o => o.type === 'move')
    const meta = v.meta || {}
    let cd = ''
    if (meta.deadlineAt) {
      cd = ' · ' + Math.max(0, Math.ceil((meta.deadlineAt - Date.now()) / 1000)) + 's'
    }
    let text
    if (myTurn) {
      text = '轮到你落子' + cd
    } else {
      // 对手状态：断线 / 托管时给出明确提示（AI 补位不赘述）
      const opp = (meta.seats || []).find(s => s.absSeat !== meta.mySeat)
      const tag = opp && !opp.isAi ? (!opp.connected ? ' · 断线托管中' : (opp.autoPlay ? ' · 托管中' : '')) : ''
      text = '对手思考中' + tag + cd
    }
    return { text, dot: v.turn === BLACK ? 'black' : 'white', thinking: !myTurn }
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
        this.view = null // 旧局视图作废，等本局首个 GAME_STATE_CHANGED
        this._hideSettle()
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
        if (this.results) this._renderSettlement()
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
        // 结算展示统一走 ROOM_UPDATED（带累计积分）；这里仅兜底同步棋盘
        if (this.ui) this.ui.syncFromOnline()
        break
      case 'VOICE_MSG':
        this._addVoiceBubble(p, false)
        // 人语音权重最高：收到即排队播报（插队队首）；iOS 未解锁时积压，
        // 首次手势后由 chatkit 自动补播
        enqueueVoice(p)
        break
      case 'CHAT_MSG':
        this._addChatBubble(p, false)
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

  // ---------- 视图骨架（与单机 gomoku.md 同结构，复用其全屏 / 横屏样式） ----------

  _renderShell() {
    this.root.innerHTML =
      '<div class="gk-root" data-gkr-room>' +
      '  <div class="gk-panel">' +
      '    <div class="gk-topbar">' +
      '      <div class="gk-title-row">' +
      '        <span class="gk-title">五子棋</span>' +
      '        <span class="gk-moves" data-gk-moves>第 0 手</span>' +
      '      </div>' +
      '      <span class="gkr-room-code">房号 <b class="gkr-code">' + esc(this._roomCode()) + '</b></span>' +
      '      <button type="button" class="gk-btn" data-gkr="copy">邀请</button>' +
      '      <button type="button" class="gk-btn gkr-btn-danger" data-gkr="leave">退出</button>' +
      '      <button type="button" class="gk-btn gk-sound" data-gk-sound aria-label="关闭音效">🔊</button>' +
      '      <button type="button" class="gk-btn gk-music" data-gk-music aria-label="打开背景音乐">♫</button>' +
      '      <button type="button" class="gk-btn gk-fs-toggle" data-gk-fullscreen aria-label="退出全屏">✕</button>' +
      '    </div>' +
      '    <div class="gk-status-row" data-gkr-status-row hidden>' +
      '      <div class="gk-status" data-gk-status>' +
      '        <span class="gk-dot gk-dot-black" data-gk-turn-dot></span>' +
      '        <span data-gk-status-text>…</span>' +
      '      </div>' +
      '    </div>' +
      '    <div class="gkr-players" data-gkr-players hidden></div>' +
      '    <div class="gkr-stage" data-gkr-stage></div>' +
      '    <div class="gk-board-wrap" data-gkr-board-wrap hidden>' +
      '      <canvas data-gk-canvas aria-label="五子棋棋盘"></canvas>' +
      '      <div class="gk-result" data-gk-result hidden>' +
      '        <div class="gk-result-card">' +
      '          <div class="gk-result-title" data-gk-result-title></div>' +
      '          <div class="gk-result-sub" data-gk-result-sub></div>' +
      '          <div class="gkr-settle-scores" data-gkr-settle-scores></div>' +
      '          <div class="gk-result-btns" data-gkr-settle-btns></div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      chatDockHtml() +
      '<div class="gkr-bubbles" data-gkr-bubbles></div>' +
      '<div class="gkr-toast" data-gkr-toast hidden></div>' +
      '</div>'

    this.$roomRoot = this.root.querySelector('[data-gkr-room]')
    this.$stage = this.$roomRoot.querySelector('[data-gkr-stage]')
    this.$boardWrap = this.$roomRoot.querySelector('[data-gkr-board-wrap]')
    this.$statusRow = this.$roomRoot.querySelector('[data-gkr-status-row]')
    this.$players = this.$roomRoot.querySelector('[data-gkr-players]')
    this.$result = this.$roomRoot.querySelector('[data-gk-result]')
    this.$bubbles = this.$roomRoot.querySelector('[data-gkr-bubbles]')
    this.$toast = this.$roomRoot.querySelector('[data-gkr-toast]')

    // 事件委托挂在 gk-root 上：全屏时它被移挂 body，外层 root 已空
    this.$roomRoot.addEventListener('click', ev => this._onClick(ev))
    // 聊天面板：🎤 点开 → 快捷语（普通话 TTS 播报）+ 按住说话
    this._chat = bindChatDock(this.$roomRoot.querySelector('[data-gkr-voice-dock]'), {
      onStartRec: () => this._startRecording(),
      onStopRec: cancel => this._stopRecording(cancel),
      onPhrase: idx => this._sendPhrase(idx),
      onMicDenied: text => this._toast(text)
    })
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
      case 'voice-play':
        this._playVoice(Number(t.getAttribute('data-idx')))
        break
    }
  }

  // ---------- 等待室 ----------

  _renderWaiting() {
    if (!this.room) return
    // 容器归位：等待室显示，棋盘 / 状态条 / 玩家条收起
    this.$roomRoot.classList.add('is-waiting')
    this.$stage.hidden = false
    this.$boardWrap.hidden = true
    this.$statusRow.hidden = true
    this.$players.hidden = true

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
    if (this.$boardWrap.hidden) {
      this.$roomRoot.classList.remove('is-waiting')
      this.$stage.hidden = true
      this.$boardWrap.hidden = false
      this.$statusRow.hidden = false
      this.$players.hidden = false
      // 棋盘区从 hidden 变为可见：量取真实尺寸重建木纹与画布
      this.ui._resize()
    }
    this.ui.syncFromOnline()
    this._renderPlayersStrip()
  }

  _renderPlayersStrip() {
    if (!this.$players || !this.view) return
    const meta = this.view.meta || {}
    const seats = meta.seats || []
    const myColor = this.view.myColor
    const colorName = c => (c === BLACK ? '⚫ 黑棋' : '⚪ 白棋')
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
    this.$players.innerHTML = strip + '<div class="gkr-round">第 ' + (meta.round || 1) + ' 局 · 你执' + (myColor === BLACK ? '黑' : '白') + '</div>'
  }

  _tick() {
    if (!this.ui || !this.view || this.view.phase !== 'play') return
    if (this.view.meta && this.view.meta.deadlineAt) this.ui.refreshStatus()
  }

  // ---------- 结算（复用单机 gk-result 浮层，内容按联机口径填充） ----------

  _hideSettle() {
    if (!this.$result) return
    this.$result.classList.remove('show')
    this.$result.hidden = true
  }

  _renderSettlement() {
    if (!this.$result || !this.results) return
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
      title = '🎉 你赢了 +' + Math.abs(mine.delta || 0)
      cls = 'is-win'
    } else {
      title = '你输了 ' + (mine.delta || 0)
      cls = 'is-loss'
    }

    const seats = (this.view && this.view.meta ? this.view.meta.seats : (this.room && this.room.seats) || [])
    const scoreLine = seats
      .map(s => {
        const abs = s.absSeat != null ? s.absSeat : s.seatIndex
        const sc = scores[abs]
        const bust = bankrupt.indexOf(abs) >= 0
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

    this.$result.querySelector('[data-gk-result-title]').textContent = title
    this.$result.querySelector('[data-gk-result-title]').className = 'gk-result-title ' + cls
    this.$result.querySelector('[data-gk-result-sub]').textContent =
      '第 ' + (this.results.round || 1) + ' 局 · 共 ' + (res.moves || 0) + ' 手'
    this.$result.querySelector('[data-gkr-settle-scores]').innerHTML = scoreLine
    this.$result.querySelector('[data-gkr-settle-btns]').innerHTML = btns
    this.$result.hidden = false
    requestAnimationFrame(() => this.$result && this.$result.classList.add('show'))
  }

  // ---------- 语音 ----------

  /** 录音器（与麻将联机同一流程，iOS 兼容）：懒建，用得到时才创建 */
  _voiceRecorder() {
    if (!this._voiceRec) {
      this._voiceRec = new VoiceRecorder({
        onSend: ({ mime, data, duration }) => {
          if (this.net.sendVoice({ mime, data, duration })) {
            // 本地即时回显（服务端不回环发件人）
            this._addVoiceBubble({ mime, data, duration, seatIndex: this._mySeat() }, true)
            // 自动回放（对齐麻将：发出去就出声）。延迟 350ms：iOS 录音停止后
            // 音频会话从「录制」切回「播放」需要一点时间，立刻播会哑火
            setTimeout(() => enqueueVoice({ mime, data, duration }), 350)
          } else {
            this._toast('连接已断开，语音未发出')
          }
        },
        onState: on => {
          if (this._chat) this._chat.setRecUI(on)
        },
        onError: text => this._toast(text)
      })
    }
    return this._voiceRec
  }

  _startRecording() {
    this._voiceRecorder().start()
  }

  _stopRecording(cancel) {
    if (this._voiceRec) this._voiceRec.stop(cancel)
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
    // 与麻将一致：语音气泡按内容时长停留后自动淡出移除（旧版只变淡不消失，积多了挡棋盘）
    setTimeout(() => this._fadeBubble(el), Math.min(12000, 3000 + (p.duration || 1) * 1000))
  }

  /** 气泡退场：加过渡 class，动画结束即从 DOM 移除 */
  _fadeBubble(el) {
    if (!el || !el.isConnected) return
    el.classList.add('is-out')
    setTimeout(() => el.remove(), 240)
  }

  _seatName(seatIndex) {
    const seats = (this.view && this.view.meta && this.view.meta.seats) || (this.room && this.room.seats) || []
    const s = seats.find(x => (x.absSeat != null ? x.absSeat : x.seatIndex) === seatIndex)
    return s ? s.displayName || (s.isAi ? 'AI' : '棋友') : '棋友'
  }

  // ---------- 快捷语（普通话 TTS；发序号，两端本地查表） ----------

  _sendPhrase(idx) {
    const text = CHAT_PHRASES[idx]
    if (!text) return
    this.net.sendChat({ phrase: idx })
    this._addChatBubble({ phrase: idx, seatIndex: this._mySeat() }, true)
  }

  _addChatBubble(p, mine) {
    const text = CHAT_PHRASES[p.phrase]
    if (!text) return
    const who = mine ? '你' : this._seatName(p.seatIndex)
    const el = document.createElement('div')
    el.className = 'gkr-bubble is-chat' + (mine ? ' is-mine' : '')
    el.textContent = '💬 ' + who + '：' + text
    this.$bubbles.appendChild(el)
    // 快捷语气泡 4.5s 后自动淡出移除（对齐麻将）
    setTimeout(() => this._fadeBubble(el), 4500)
    // 对方（含 AI 位真人）的快捷语播报（预生成普通话音频，缺文件回退 TTS）；自己的不播
    if (!mine) speakPhrase(p.phrase, text)
  }

  _playVoice(idx) {
    const b = this._voiceBubbles[idx]
    if (!b) return
    // 走 chatkit 通信通道重播（插队队首、播放期间 duck BGM）
    enqueueVoice({ mime: b.mime, data: b.data, duration: b.duration })
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
        // 「回到房间」只带 roomCode 空壳，RECONNECT 的完整快照在订阅建立前已丢失；
        // 订阅就绪后主动要一次全量同步（等待室快照 + 对局中补牌局视图），与麻将 lobby 同款
        net.resync()
        resolve({ net, remote })
      })
      .catch(err => {
        clearCredential()
        net.close()
        reject(err)
      })
  })
}
