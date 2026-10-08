// ============================================================
// 斗地主联机房间（doudizhu/remote.js）
// ------------------------------------------------------------
// 与单机共用同一套牌桌 UI（DoudizhuUI 的 online 适配器模式）：
//   对局区直接挂单机 DoudizhuUI（QQ 风桌面 / 叫抢加倍 / 炸弹特效 /
//   TTS 报牌全部与单机一致）；本类只负责：等待室（3 座 / AI / 思考
//   时长）→ 视图适配（服务端权威，本地只发意图 bid/rob/double/
//   pass/play）→ 结算（地主 ±20 / 农民 ±10 入账、多局累计、破产）
//   → 全员准备自动开下一局。
// 暗牌隐私由服务端视图保证：他家只发张数，底牌未亮只发长度。
// 事件流（音效/气泡/特效）由引擎 acts 公开日志 diff 还原（见 ui.js
// applyOnlineView）。网络层复用 mahjong/multiplayer/net-client.js。
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
  enterFullscreen,
  exitFullscreen,
  speakPhrase,
  chatDockHtml,
  bindChatDock,
  VoiceRecorder,
  enqueueVoice
} from '../gamehall/chatkit.js'
import DoudizhuUI from './ui.js'

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))
}

export default class DoudizhuRemote {
  /**
   * @param {HTMLElement} root 挂载点
   * @param {Object} opts { net, room, player, onExit }（与军棋联机同契约）
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

    this.game = null // DoudizhuUI 实例（online 模式）
    this._unsub = this.net.subscribe(msg => this._onEvent(msg))
    this._tickTimer = null
    this._voiceRec = null
    this._voiceBubbles = []
  }

  mount() {
    enterFullscreen()
    this._renderShell()
    this._renderWaiting()
    this._tickTimer = setInterval(() => this._tick(), 500)
    // 已进入房间的对局（刷新重连）：快照随后由服务器推送
    if (this.room && this.room.status === 'PLAYING') this._showGame()
    window.__doudizhuRemote = this // 调试/测试钩子（单机页有 __doudizhuUI 同款）
    return this
  }

  destroy() {
    this.destroyed = true
    if (window.__doudizhuRemote === this) delete window.__doudizhuRemote
    if (this._unsub) this._unsub()
    if (this._tickTimer) clearInterval(this._tickTimer)
    this._stopRecording(true)
    if (this._chat) this._chat.destroy()
    if (this.game) {
      this.game.destroy()
      this.game = null
    }
    // 结算浮层常驻 body（见 _renderShell），须显式摘除
    if (this.$settle) {
      this.$settle.remove()
      this.$settle = null
    }
    exitFullscreen()
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
        if (p.seats && this.view && this.view.meta && Array.isArray(this.view.meta.seats)) {
          this.view.meta.seats = this.view.meta.seats.map((m, i) => {
            const s = p.seats[i]
            if (!s) return m
            return {
              ...m,
              displayName: s.displayName || m.displayName,
              occupantType: s.occupantType,
              isAi: s.occupantType === 'AI',
              connected: s.connected,
              autoPlay: s.autoPlay
            }
          })
          this._syncGame()
        }
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
        this.view = null // 旧局视图作废，等本局首个 GAME_STATE_CHANGED
        if (this.$settle) this.$settle.hidden = true
        if (this.room) {
          this.room.status = 'PLAYING'
          this.room.round = p.round
          if (p.seats) this.room.seats = p.seats
          if (p.rules) this.room.rules = p.rules
          if (p.turnTimeoutSeconds) this.room.turnTimeoutSeconds = p.turnTimeoutSeconds
        }
        this._showGame()
        this._toast('第 ' + (p.round || 1) + ' 局开始 · 发牌叫分')
        break
      case 'GAME_STATE_CHANGED':
        this.view = p
        if (this.room) this.room.status = 'PLAYING'
        this._showGame()
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
          this._syncGame()
          this._renderSettlement()
        }
        break
      case 'GAME_FINISHED':
        this._syncGame()
        break
      case 'VOICE_MSG':
        this._addVoiceBubble(p, false)
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
      '  <div class="gkr-room-title">斗地主 · 房间 <b class="gkr-code">' + esc(this._roomCode()) + '</b></div>' +
      '  <div class="gkr-head-btns">' +
      '    <button type="button" class="gkr-btn" data-dzr="copy">复制邀请链接</button>' +
      '    <button type="button" class="gkr-btn gkr-btn-danger" data-dzr="leave">退出房间</button>' +
      '  </div>' +
      '</div>' +
      '<div class="gkr-stage" data-dzr-stage>' +
      '  <div data-dzr-waiting></div>' +
      // ddz-root 类必须带上：DoudizhuUI 的全套样式（fixed 全屏/桌面布局/
      // 强制横屏旋转）都挂在这个类上，单机页由页面 HTML 提供，联机在这里给
      '  <div data-dzr-host class="ddz-root" hidden></div>' +
      '</div>' +
      chatDockHtml() +
      '<div class="gkr-bubbles" data-dzr-bubbles></div>' +
      '<div class="gkr-toast" data-dzr-toast hidden></div>'

    this.$waiting = this.root.querySelector('[data-dzr-waiting]')
    this.$host = this.root.querySelector('[data-dzr-host]')
    this.$settle = document.createElement('div')
    this.$settle.className = 'gkr-settle gkr-settle-fixed'
    this.$settle.setAttribute('data-dzr-settle', '')
    this.$settle.hidden = true
    // 结算浮层必须常驻 body、与牌桌平级：牌桌 setImmersive(true) 会 portal
    // 到 body（z-index:1000 全屏），浮层若留在房间壳里会被牌桌整个盖住
    // （壳退出 gkr-full 后不再是 fixed，还困在主题 transform 的层叠上下文里，
    // 自身的 z-index:15010 出不来——表现为「结算卡不弹」）。
    // 注意：脱离 .gh-root 后站内 `.gh-root [hidden]` 规则够不着，hidden 由
    // doudizhu.css 的 [data-dzr-settle][hidden] 兜底；脱离壳后点击也不再
    // 冒泡到 root，须自带监听
    document.body.appendChild(this.$settle)
    this.$settle.addEventListener('click', ev => this._onClick(ev))
    this.$bubbles = this.root.querySelector('[data-dzr-bubbles]')
    this.$toast = this.root.querySelector('[data-dzr-toast]')

    this.root.addEventListener('click', ev => this._onClick(ev))
    this._chat = bindChatDock(this.root.querySelector('[data-gkr-voice-dock]'), {
      onStartRec: () => this._startRecording(),
      onStopRec: cancel => this._stopRecording(cancel),
      onPhrase: idx => this._sendPhrase(idx)
    })
  }

  _roomCode() {
    return (this.room && this.room.roomCode) || this.player.roomCode || ''
  }

  _onClick(ev) {
    // 思考时长步进器（等待室房规，改动即生效）
    if (handleCtlClick(ev, () => this._sendRules())) return
    const t = ev.target.closest('[data-dzr]')
    if (!t) return
    const act = t.getAttribute('data-dzr')
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

  _sendIntent(action) {
    if (!this.view || !this.view.meta) return
    this.net.sendAction({
      gameId: this.view.meta.gameId,
      windowId: this.view.meta.windowId,
      action
    })
  }

  // ---------- 联机适配器（DoudizhuUI 的数据源） ----------

  _makeOnlineAdapter() {
    return {
      tryAction: action => this._sendIntent(action),
      seatName: seat => this._seatLabel(seat),
      roomScores: () => (this.view && this.view.meta && this.view.meta.scores) || null,
      leave: () => this._leave()
    }
  }

  /** 玩家名（UI 顶栏 / 状态栏 / 结算卡共用） */
  _seatLabel(seat) {
    const metaSeats = (this.view && this.view.meta && this.view.meta.seats) || []
    const m = metaSeats[seat] || ((this.room && this.room.seats) || [])[seat] || {}
    const name = m.displayName || (m.isAi ? 'AI' : '棋友')
    let st = ''
    if (!m.isAi) {
      if (m.connected === false) st = ' ·断线'
      else if (m.autoPlay) st = ' ·托管'
    }
    return name + st
  }

  // ---------- 等待室 ----------

  _renderWaiting() {
    if (!this.room) return
    // 回等待室：牌桌退出全屏（root portal 回 $host 内，hidden 才能藏住），
    // 等待室壳的全屏布局（gkr-full）重新接管
    if (this.game) this.game.setImmersive(false)
    enterFullscreen()
    this.$waiting.hidden = false
    this.$host.hidden = true
    if (this.$settle) this.$settle.hidden = true

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
          '<div class="gkr-seat-name">' + esc(s.displayName || '牌友') +
          (s.isAdmin ? ' 👑' : '') + (isMe ? '（你）' : '') + '</div>' +
          '<div class="gkr-seat-sub">' +
          (s.connected ? (s.ready ? '已准备' : room.hasPlayed ? '未准备' : '在线') : '断线托管中') +
          '</div>'
      } else if (s.occupantType === 'AI') {
        body =
          '<div class="gkr-seat-name">AI 陪练' + (s.isAdmin ? ' 👑' : '') + '</div>' +
          '<div class="gkr-seat-sub">已就绪</div>' +
          (admin ? '<button type="button" class="gkr-btn gkr-btn-mini" data-dzr="remove-ai" data-seat="' + s.seatIndex + '">移除</button>' : '')
      } else {
        body =
          '<div class="gkr-seat-name gkr-empty">空位</div>' +
          (admin
            ? '<button type="button" class="gkr-btn gkr-btn-mini" data-dzr="add-ai" data-seat="' + s.seatIndex + '">+ 添加 AI</button>'
            : '<div class="gkr-seat-sub">分享房号邀牌友，或等房主补 AI</div>')
      }
      seatHtml += '<div class="gkr-seat' + (isMe ? ' is-me' : '') + '">' + body + '</div>'
    }

    let actionHtml
    if (room.hasPlayed) {
      const me = seats.find(s => s.seatIndex === mySeat)
      const ready = me && me.ready
      actionHtml =
        '<button type="button" class="gkr-btn gkr-btn-primary" data-dzr="ready"' + (ready ? ' disabled' : '') + '>' +
        (ready ? '已准备 · 等待其他玩家' : '准备下一局') + '</button>'
    } else if (admin) {
      actionHtml =
        '<button type="button" class="gkr-btn gkr-btn-primary" data-dzr="start">开始游戏</button>' +
        '<div class="gkr-hint">空位会自动补 AI；叫分定地主 → 抢地主 → 加倍 → 出牌</div>'
    } else {
      actionHtml = '<div class="gkr-hint">等待房主开始游戏…</div>'
    }

    this.$waiting.innerHTML =
      '<div class="gkr-waiting">' +
      '  <div class="gkr-seats">' + seatHtml + '</div>' +
      '  <div class="gkr-rules-row">' +
      '    <span class="gh-field">思考时长 ' + stepperHtml('turnTimeoutSeconds', TIMEOUT_VALUES, room.turnTimeoutSeconds || 20, fmtTimeout, !admin) + '</span>' +
      '    <span class="gh-field gkr-fixed-rule">积分：地主 ±20 / 农民 ±10 · 100 分破产制</span>' +
      '  </div>' +
      '  <div class="gkr-waiting-actions">' + actionHtml + '</div>' +
      '  <div class="gkr-share-hint">邀请牌友：把房号 <b>' + esc(this._roomCode()) + '</b> 发给对方，或复制邀请链接</div>' +
      '</div>'
  }

  _sendRules() {
    if (!this._isAdmin()) return
    this.net.sendAdmin('UPDATE_RULES', {
      rules: {},
      turnTimeoutSeconds: Number(ctlValue(this.$waiting, 'turnTimeoutSeconds')) || undefined
    })
  }

  _toggleReady(ready) {
    this.readySent = ready
    this.net.sendAdmin('TOGGLE_READY', { ready })
    const me = this.room && (this.room.seats || []).find(s => s.seatIndex === this._mySeat())
    if (me) me.ready = ready
    if (this.room && this.room.status !== 'PLAYING') this._renderWaiting()
    else this._renderSettlement()
  }

  // ---------- 对局（单机 UI 挂载） ----------

  _showGame() {
    // 撤掉等待室壳的全屏（gkr-lock 的 overflow:hidden 会挡死牌桌的
    // 滚动垫层机制——iOS 收起工具栏需要文档可滚）；牌桌用自己的
    // setImmersive 全屏接管 body
    exitFullscreen()
    if (!this.game) {
      // 联机直接进全屏牌桌（大厅点击链已给用户手势；原生全屏被拒时
      // setImmersive 自带 CSS 全屏兜底）
      this.game = new DoudizhuUI(this.$host, { online: this._makeOnlineAdapter() })
      this.game.setImmersive(true)
    }
    this.$waiting.hidden = true
    this.$host.hidden = false
    if (this.$settle && !this.results) this.$settle.hidden = true
    this._syncGame()
  }

  _syncGame() {
    if (this.game && this.view) this.game.applyOnlineView(this.view)
  }

  /** 500ms 心跳：服务端窗口倒计时 → 牌桌计时器（本地不起 setInterval 计时） */
  _tick() {
    if (!this.game || !this.view || !this.view.meta) return
    const v = this.view
    if (v.phase === 'over' || !v.meta.deadlineAt) {
      if (this.game.meTimer) this.game.meTimer.textContent = ''
      return
    }
    const left = Math.max(0, Math.ceil((v.meta.deadlineAt - Date.now()) / 1000))
    this.game.renderTimer(left)
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
    const iWin = (mine.delta || 0) > 0

    const title = iWin ? '胜利 +' + Math.abs(mine.delta || 0) : '本局失利 ' + (mine.delta || 0)
    const cls = iWin ? 'is-win' : 'is-loss'
    const sideText = res.winSide === 'landlord' ? '地主获胜' : res.winSide === 'farmer' ? '农民获胜' : ''

    const seats = (this.view && this.view.meta ? this.view.meta.seats : [])
    const scoreLine = seats
      .map(s => {
        const sc = scores[s.absSeat]
        const bust = bankrupt.indexOf(s.absSeat) >= 0
        return (
          '<span class="gkr-settle-score' + (bust ? ' is-bust' : '') + '">' +
          esc((s.displayName || (s.isAi ? 'AI' : '牌友')) + (s.absSeat === res.landlord ? ' 👑' : '')) + '：' + (sc == null ? '-' : sc) +
          (bust ? '（已破产）' : '') + '</span>'
        )
      })
      .join('')

    let btns
    if (finished) {
      btns =
        '<div class="gkr-settle-final">有玩家破产，房间进入终局</div>' +
        '<button type="button" class="gkr-btn gkr-btn-primary" data-dzr="leave">退出房间</button>'
    } else {
      const me = this.room && (this.room.seats || []).find(s => s.seatIndex === mySeat)
      const ready = (me && me.ready) || this.readySent
      btns =
        '<button type="button" class="gkr-btn gkr-btn-primary" data-dzr="ready"' + (ready ? ' disabled' : '') + '>' +
        (ready ? '已准备 · 等待其他玩家' : '准备下一局') + '</button>' +
        '<button type="button" class="gkr-btn" data-dzr="leave">退出房间</button>'
    }

    this.$settle.hidden = false
    this.$settle.innerHTML =
      '<div class="gkr-settle-card">' +
      '<div class="gkr-settle-title ' + cls + '">' + title + '</div>' +
      '<div class="gkr-settle-sub">第 ' + (this.results.round || 1) + ' 局 · 底分 ' + (res.calledScore || '-') +
      ' · 总倍数 ×' + (res.multiplier || 1) + (sideText ? ' · ' + sideText : '') +
      (res.spring ? ' · 🌸春天' : '') + '</div>' +
      '<div class="gkr-settle-scores">' + scoreLine + '</div>' +
      '<div class="gkr-settle-btns">' + btns + '</div>' +
      '</div>'
  }

  // ---------- 语音（与军棋联机同款） ----------

  _voiceRecorder() {
    if (!this._voiceRec) {
      this._voiceRec = new VoiceRecorder({
        onSend: ({ mime, data, duration }) => {
          if (this.net.sendVoice({ mime, data, duration })) {
            this._addVoiceBubble({ mime, data, duration, seatIndex: this._mySeat() }, true)
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
    const who = mine ? '你' : this._seatLabel(p.seatIndex)
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'gkr-bubble' + (mine ? ' is-mine' : '')
    el.setAttribute('data-dzr', 'voice-play')
    el.setAttribute('data-idx', String(idx))
    el.textContent = '🔊 ' + who + ' · ' + Math.round(p.duration || 0) + '″'
    this.$bubbles.appendChild(el)
    setTimeout(() => this._fadeBubble(el), Math.min(12000, 3000 + (p.duration || 1) * 1000))
  }

  _fadeBubble(el) {
    if (!el || !el.isConnected) return
    el.classList.add('is-out')
    setTimeout(() => el.remove(), 240)
  }

  _sendPhrase(idx) {
    const text = CHAT_PHRASES[idx]
    if (!text) return
    this.net.sendChat({ phrase: idx })
    this._addChatBubble({ phrase: idx, seatIndex: this._mySeat() }, true)
    speakPhrase(idx, text)
  }

  _addChatBubble(p, mine) {
    const text = CHAT_PHRASES[p.phrase]
    if (!text) return
    const who = mine ? '你' : this._seatLabel(p.seatIndex)
    const el = document.createElement('div')
    el.className = 'gkr-bubble is-chat' + (mine ? ' is-mine' : '')
    el.textContent = '💬 ' + who + '：' + text
    this.$bubbles.appendChild(el)
    setTimeout(() => this._fadeBubble(el), 4500)
    if (!mine) speakPhrase(p.phrase, text)
  }

  _playVoice(idx) {
    const b = this._voiceBubbles[idx]
    if (!b) return
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
    const text = '来打斗地主！房号 ' + code + ' → ' + url
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

/** 进入斗地主房间：建 NetClient → 连接 → 挂载房间 UI（供大厅调用） */
export function enterDoudizhuRoom(root, { room, player, cred, onExit }) {
  const net = new NetClient({
    onError: () => {}
  })
  saveCredential(cred)
  return new Promise((resolve, reject) => {
    net
      .connect(cred)
      .then(() => {
        const remote = new DoudizhuRemote(root, { net, room, player, onExit })
        remote.mount()
        // 订阅就绪后主动要一次全量同步（等待室快照 + 对局中补牌局视图）
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
