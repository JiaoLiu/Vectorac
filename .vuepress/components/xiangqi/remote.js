// ============================================================
// 中国象棋联机房间（xiangqi/remote.js）
// ------------------------------------------------------------
// 与单机共用同一套棋盘 UI（xiangqi/ui.js 的 online 适配器模式）：
//   房间骨架直接用 .xq-root 结构（顶栏 / 棋盘卡 / 状态栏 / 结算浮层），
//   XiangqiUI 负责全屏接管、木纹 SVG 棋盘、选中高亮、将军警示、
//   落子动画与音效，横屏布局与单机完全一致；本类只负责：
//   等待室（座位 / AI / 规则 / 开始）→ 视图适配（服务端权威，本地只发
//   走子意图）→ 结算（±10、多局累计、破产）→ 全员准备自动开下一局。
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
  bindChatDock
} from '../gamehall/chatkit.js'
import XiangqiUI from './ui.js'
import { RED, BLACK, createInitialBoard } from './engine.mjs'

const SIDE_LABEL = { red: '红方', black: '黑方' }

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
    this.destroyed = false
    this.readySent = false

    this.ui = null // XiangqiUI（online 模式）：全屏 / 棋盘 / 动画 / 音效
    this._unsub = this.net.subscribe(msg => this._onEvent(msg))
    this._tickTimer = null
    this._recorder = null
    this._recordAt = 0
    this._voiceBubbles = []
  }

  mount() {
    this._renderShell()
    // 单机 UI 以联机适配器挂载：构造函数内 enterFullscreen 把 xq-root
    // 移挂 body，等待室起即全屏；对局区在开赛前保持 hidden
    this.ui = new XiangqiUI(this.$roomRoot, { online: this._makeOnlineAdapter() })
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
    // ui.destroy 内部 exitFullscreen 并把 xq-root 移回原位
    if (this.ui) {
      this.ui.destroy()
      this.ui = null
    }
    this.root.innerHTML = ''
  }

  // ---------- 联机适配器（XiangqiUI 的数据源） ----------

  _makeOnlineAdapter() {
    return {
      getView: () => this._onlineView(),
      tryMove: mv => {
        const meta = (this.view && this.view.meta) || {}
        this.net.sendAction({
          gameId: meta.gameId,
          windowId: meta.windowId,
          action: { type: 'move', fromX: mv.fromX, fromY: mv.fromY, toX: mv.toX, toY: mv.toY }
        })
      },
      statusText: () => this._statusText(this.view)
    }
  }

  /** 渲染层视图：把服务端 GAME_STATE_CHANGED 映射成 XiangqiUI 的契约 */
  _onlineView() {
    const v = this.view
    if (!v) {
      // 等待室 / 开局快照未到的空窗：初始棋盘（对局区此时 hidden，仅兜底）
      if (!this._emptyBoard) this._emptyBoard = createInitialBoard()
      return {
        board: this._emptyBoard,
        mySide: RED,
        currentSide: RED,
        lastMove: null,
        moves: 0,
        canMove: false,
        over: false,
        winner: null,
        inCheck: null
      }
    }
    return {
      board: v.board,
      mySide: v.myColor === BLACK ? BLACK : RED,
      currentSide: v.turn,
      lastMove: v.lastMove,
      moves: v.moves || 0,
      canMove: v.phase === 'play' && (v.legal || []).some(o => o.type === 'move'),
      over: v.phase !== 'play',
      winner: v.winner != null ? v.winner : null,
      inCheck: v.inCheck != null ? v.inCheck : null
    }
  }

  /** 状态条文案：轮次 / 倒计时 / 将军 / 对手断线托管提示 */
  _statusText(v) {
    if (!v || !this.view) return { text: this.room && this.room.status === 'PLAYING' ? '同步棋局中…' : '等待开局…' }
    if (v.phase !== 'play') return { text: '本局结束' }
    const myTurn = (v.legal || []).some(o => o.type === 'move')
    const meta = v.meta || {}
    let cd = ''
    if (meta.deadlineAt) {
      cd = ' · ' + Math.max(0, Math.ceil((meta.deadlineAt - Date.now()) / 1000)) + 's'
    }
    const meInCheck = v.inCheck != null && v.inCheck === v.myColor
    let text
    if (myTurn) {
      text = (meInCheck ? '将军！请你应将' : '轮到你行棋') + cd
    } else {
      // 对手状态：断线 / 托管时给出明确提示（AI 补位不赘述）
      const opp = (meta.seats || []).find(s => s.absSeat !== meta.mySeat)
      const tag = opp && !opp.isAi ? (!opp.connected ? ' · 断线托管中' : (opp.autoPlay ? ' · 托管中' : '')) : ''
      text = (v.inCheck != null ? '对方被将军，思考应将' : '对方思考中') + tag + cd
    }
    return { text, thinking: !myTurn, check: meInCheck }
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
        else this._renderSideCards()
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

  // ---------- 视图骨架（与单机 xiangqi.md 同结构，复用其全屏 / 横屏样式） ----------

  _renderShell() {
    this.root.innerHTML =
      '<div class="xq-root" data-xqr-room>' +
      '  <div class="xq-topbar">' +
      '    <div class="xq-brand">' +
      '      <div class="xq-brand-mark" aria-hidden="true"><span>帅</span><i>将</i></div>' +
      '      <div><div class="xq-kicker">联机对战 · 房间 <b class="xqr-code">' + esc(this._roomCode()) + '</b></div><h1>中国象棋</h1></div>' +
      '    </div>' +
      '    <div class="xq-top-actions">' +
      '      <span class="xq-move-count" data-xq-move-count>0 手</span>' +
      '      <button type="button" class="xq-btn xq-btn-quiet" data-xqr="copy">邀请</button>' +
      '      <button type="button" class="xq-btn xq-btn-quiet" data-xqr="leave">退出</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="xq-layout" data-xqr-layout hidden>' +
      '    <section class="xq-board-card" aria-label="象棋对局">' +
      '      <div class="xq-board-frame">' +
      '        <div class="xq-board" data-xq-board></div>' +
      '        <div class="xq-result" data-xq-result hidden>' +
      '          <div class="xq-result-card">' +
      '            <div class="xq-result-stamp" data-xqr-settle-stamp>对局结束</div>' +
      '            <h2 data-xq-result-title></h2>' +
      '            <p data-xq-result-text></p>' +
      '            <div class="xqr-settle-scores" data-xqr-settle-scores></div>' +
      '            <div class="xq-result-actions" data-xqr-settle-btns></div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +
      '    </section>' +
      '    <div class="xq-side">' +
      '      <section class="xq-match-card">' +
      '        <div class="xq-match-title"><span>联机对弈</span><span class="xq-match-live"><i></i> 联机</span></div>' +
      '        <div class="xq-players">' +
      '          <div class="xq-player black-player" data-xqr-opp-card>' +
      '            <div class="xq-player-token" data-xqr-opp-token>将</div>' +
      '            <div><b data-xqr-opp-label>对手</b><small data-xqr-opp-state>…</small></div>' +
      '          </div>' +
      '          <div class="xq-vs">VS</div>' +
      '          <div class="xq-player red-player" data-xqr-me-card>' +
      '            <div class="xq-player-token" data-xqr-me-token>帅</div>' +
      '            <div><b data-xqr-me-label>你</b><small data-xqr-me-state>…</small></div>' +
      '          </div>' +
      '        </div>' +
      '        <div class="xq-status" data-xq-status role="status" aria-live="polite">等待开局…</div>' +
      '        <div class="xq-audio-controls" aria-label="音频设置">' +
      '          <button type="button" class="xq-audio-toggle" data-xq-music aria-pressed="false">♫ 背景音乐：关</button>' +
      '          <button type="button" class="xq-audio-toggle is-on" data-xq-sound aria-pressed="true">♩ 落子音效：开</button>' +
      '        </div>' +
      '        <div class="xqr-round-line" data-xqr-round></div>' +
      '      </section>' +
      '    </div>' +
      '  </div>' +
      '  <div class="xqr-stage" data-xqr-stage></div>' +
      chatDockHtml() +
      '<div class="gkr-bubbles" data-gkr-bubbles></div>' +
      '<div class="gkr-toast" data-gkr-toast hidden></div>' +
      '</div>'

    this.$roomRoot = this.root.querySelector('[data-xqr-room]')
    this.$layout = this.$roomRoot.querySelector('[data-xqr-layout]')
    this.$stage = this.$roomRoot.querySelector('[data-xqr-stage]')
    this.$result = this.$roomRoot.querySelector('[data-xq-result]')
    this.$bubbles = this.$roomRoot.querySelector('[data-gkr-bubbles]')
    this.$toast = this.$roomRoot.querySelector('[data-gkr-toast]')

    // 事件委托挂在 xq-root 上：全屏时它被移挂 body，外层 root 已空
    this.$roomRoot.addEventListener('click', ev => this._onClick(ev))
    // 聊天面板：🎤 点开 → 快捷语（普通话 TTS 播报）+ 按住说话
    this._chat = bindChatDock(this.$roomRoot.querySelector('[data-gkr-voice-dock]'), {
      onStartRec: () => this._startRecording(),
      onStopRec: cancel => this._stopRecording(cancel),
      onPhrase: idx => this._sendPhrase(idx)
    })
  }

  _roomCode() {
    return (this.room && this.room.roomCode) || this.player.roomCode || ''
  }

  _onClick(ev) {
    // 分段 chips / 步进器（等待室房规，改动即生效）
    if (handleCtlClick(ev, () => this._sendRules())) return
    const t = ev.target.closest('[data-xqr]')
    if (!t) return
    const act = t.getAttribute('data-xqr')
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
    // 容器归位：等待室显示，对局区收起
    this.$stage.hidden = false
    this.$layout.hidden = true

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
          '<div class="xqr-seat-name">' + esc(s.displayName || '棋友') +
          (s.isAdmin ? ' 👑' : '') + (isMe ? '（你）' : '') + '</div>' +
          '<div class="xqr-seat-sub">' +
          (s.connected ? (s.ready ? '已准备' : (room.hasPlayed ? '未准备' : '在线')) : '断线托管中') +
          '</div>'
      } else if (s.occupantType === 'AI') {
        body =
          '<div class="xqr-seat-name">AI 陪练' + (s.isAdmin ? ' 👑' : '') + '</div>' +
          '<div class="xqr-seat-sub">已就绪</div>' +
          (admin ? '<button type="button" class="xq-btn xqr-btn-mini" data-xqr="remove-ai" data-seat="' + s.seatIndex + '">移除</button>' : '')
      } else {
        body =
          '<div class="xqr-seat-name xqr-empty">空位</div>' +
          (admin
            ? '<button type="button" class="xq-btn xqr-btn-mini" data-xqr="add-ai" data-seat="' + s.seatIndex + '">+ 添加 AI</button>'
            : '<div class="xqr-seat-sub">分享房号邀好友，或等房主补 AI</div>')
      }
      seatHtml += '<div class="xqr-seat' + (isMe ? ' is-me' : '') + '">' + body + '</div>'
    }

    let actionHtml
    if (room.hasPlayed) {
      const me = seats.find(s => s.seatIndex === mySeat)
      const ready = me && me.ready
      const othersReady = seats.every(s => s.occupantType !== 'HUMAN' || !s.connected || s.ready)
      actionHtml =
        '<button type="button" class="xq-btn xq-btn-primary" data-xqr="ready"' + (ready ? ' disabled' : '') + '>' +
        (ready ? '已准备 · 等待对手' : '准备下一局') + '</button>' +
        (ready && !othersReady ? '<div class="xqr-hint">对方还没准备…</div>' : '')
    } else if (admin) {
      actionHtml =
        '<button type="button" class="xq-btn xq-btn-primary" data-xqr="start">开始游戏</button>' +
        '<div class="xqr-hint">空位会自动补 AI；红棋先行，每局换先</div>'
    } else {
      actionHtml = '<div class="xqr-hint">等待房主开始游戏…</div>'
    }

    this.$stage.innerHTML =
      '<section class="xq-match-card xqr-waiting">' +
      '  <div class="xq-match-title"><span>等待开局</span><span class="xq-match-live"><i></i> 房间 ' + esc(this._roomCode()) + '</span></div>' +
      '  <div class="xqr-seats">' + seatHtml + '</div>' +
      '  <div class="xqr-rules-row">' +
      '    <span class="xqr-field">思考时长 ' + stepperHtml('turnTimeoutSeconds', TIMEOUT_VALUES, room.turnTimeoutSeconds || 30, fmtTimeout, !admin) + '</span>' +
      '    <span class="xqr-field xqr-fixed-rule">AI 难度：中等（补位 / 托管同档）</span>' +
      '  </div>' +
      '  <div class="xqr-waiting-actions">' + actionHtml + '</div>' +
      '  <div class="xqr-waiting-ops">' +
      '    <button type="button" class="xq-btn xq-btn-quiet" data-xqr="copy">复制邀请链接</button>' +
      '    <button type="button" class="xq-btn xq-btn-quiet" data-xqr="leave">退出房间</button>' +
      '  </div>' +
      '  <div class="xqr-share-hint">邀请好友：把房号 <b>' + esc(this._roomCode()) + '</b> 发给对方，或复制链接邀请</div>' +
      '</section>'
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
    if (this.$layout.hidden) {
      this.$stage.hidden = true
      this.$layout.hidden = false
    }
    this.ui.syncFromOnline()
    this._renderSideCards()
  }

  /** 双方卡片：执子方 / 名字 / 在线状态 / 积分 / 回合 */
  _renderSideCards() {
    if (!this.view) return
    const meta = this.view.meta || {}
    const seats = meta.seats || []
    const me = seats.find(s => s.absSeat === meta.mySeat) || {}
    const opp = seats.find(s => s.absSeat !== meta.mySeat) || {}
    const mySide = this.view.myColor === BLACK ? BLACK : RED
    const oppSide = mySide === RED ? BLACK : RED
    const scores = (this.room && this.room.scores) || (meta.scores) || []

    const meCard = this.$roomRoot.querySelector('[data-xqr-me-card]')
    const oppCard = this.$roomRoot.querySelector('[data-xqr-opp-card]')
    meCard.className = 'xq-player ' + (mySide === RED ? 'red-player' : 'black-player')
    oppCard.className = 'xq-player ' + (oppSide === RED ? 'red-player' : 'black-player')
    this.$roomRoot.querySelector('[data-xqr-me-token]').textContent = mySide === RED ? '帅' : '将'
    this.$roomRoot.querySelector('[data-xqr-opp-token]').textContent = oppSide === RED ? '帅' : '将'
    this.$roomRoot.querySelector('[data-xqr-me-label]').textContent =
      (me.displayName || '你') + ' · ' + SIDE_LABEL[mySide] + (scores[me.absSeat] != null ? ' · ' + scores[me.absSeat] + ' 分' : '')
    this.$roomRoot.querySelector('[data-xqr-opp-label]').textContent =
      (opp.displayName || (opp.isAi ? 'AI 陪练' : '对手')) + ' · ' + SIDE_LABEL[oppSide] + (scores[opp.absSeat] != null ? ' · ' + scores[opp.absSeat] + ' 分' : '')
    this.$roomRoot.querySelector('[data-xqr-me-state]').textContent = '在线'
    this.$roomRoot.querySelector('[data-xqr-opp-state]').textContent =
      opp.isAi ? 'AI' : opp.connected ? (opp.autoPlay ? '托管中' : '在线') : '断线托管中'

    const roundEl = this.$roomRoot.querySelector('[data-xqr-round]')
    if (roundEl) {
      roundEl.textContent = '第 ' + (meta.round || 1) + ' 局 · 你执' + (mySide === RED ? '红' : '黑') + (mySide === RED ? '（先行）' : '（后行）')
    }
  }

  _tick() {
    if (!this.ui || !this.view || this.view.phase !== 'play') return
    if (this.view.meta && this.view.meta.deadlineAt) this.ui.refreshStatus()
  }

  // ---------- 结算（复用单机 xq-result 浮层，内容按联机口径填充） ----------

  _hideSettle() {
    if (!this.$result) return
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

    let title
    if (res.draw) {
      title = '和棋'
    } else if (res.winner === mySeat) {
      title = '🎉 你赢了 +' + Math.abs(mine.delta || 0)
    } else {
      title = '你输了 ' + (mine.delta || 0)
    }

    const seats = (this.view && this.view.meta ? this.view.meta.seats : (this.room && this.room.seats) || [])
    const scoreLine = seats
      .map(s => {
        const abs = s.absSeat != null ? s.absSeat : s.seatIndex
        const sc = scores[abs]
        const bust = bankrupt.indexOf(abs) >= 0
        return (
          '<span class="xqr-settle-score' + (bust ? ' is-bust' : '') + '">' +
          esc(s.displayName || (s.isAi ? 'AI' : '棋友')) + '：' + (sc == null ? '-' : sc) +
          (bust ? '（已破产）' : '') + '</span>'
        )
      })
      .join('')

    let btns
    if (finished) {
      btns =
        '<div class="xqr-settle-final">有玩家破产，房间进入终局</div>' +
        '<button type="button" class="xq-btn xq-btn-primary" data-xqr="leave">退出房间</button>'
    } else {
      const me = this.room && (this.room.seats || []).find(s => s.seatIndex === mySeat)
      const ready = (me && me.ready) || this.readySent
      btns =
        '<button type="button" class="xq-btn xq-btn-primary" data-xqr="ready"' + (ready ? ' disabled' : '') + '>' +
        (ready ? '已准备 · 等待对手' : '准备下一局（换先）') + '</button>' +
        '<button type="button" class="xq-btn" data-xqr="leave">退出房间</button>'
    }

    this.$result.querySelector('[data-xqr-settle-stamp]').textContent = '第 ' + (this.results.round || 1) + ' 局结束'
    this.$result.querySelector('[data-xq-result-title]').textContent = title
    this.$result.querySelector('[data-xq-result-text]').textContent =
      (res.checkmate ? '将死' : '无棋可走') + ' · 共 ' + (res.moves || 0) + ' 手' + (res.winSide ? ' · ' + SIDE_LABEL[res.winSide] + '胜' : '')
    this.$result.querySelector('[data-xqr-settle-scores]').innerHTML = scoreLine
    this.$result.querySelector('[data-xqr-settle-btns]').innerHTML = btns
    this.$result.hidden = false
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
      if (this._chat) this._chat.setRecUI(true)
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
    if (this._chat) this._chat.setRecUI(false)
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
    el.setAttribute('data-xqr', 'voice-play')
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
    setTimeout(() => {
      el.classList.add('is-old')
    }, 30000)
    // 对方（含 AI 位真人）的快捷语播报（预生成普通话音频，缺文件回退 TTS）；自己的不播
    if (!mine) speakPhrase(p.phrase, text)
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
    const text = '来下象棋！房号 ' + code + ' → ' + url
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

/** 进入象棋房间：建 NetClient → 连接 → 挂载房间 UI（供大厅调用） */
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
