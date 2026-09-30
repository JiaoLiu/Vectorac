// ============================================================
// 四国军棋联机房间（junqi/remote.js）
// ------------------------------------------------------------
// 与单机共用同一套棋盘 UI（FourKingdoms.vue 的 online 适配器模式）：
//   对局区直接挂载单机组件（木纹 SVG 棋盘 / 横屏全屏布局 / 布阵交换 /
//   掷骰动画 / 音效全部与单机一致，自己永远旋转到下方）；本类只负责：
//   等待室（4 座 / AI / 思考时长；固定四暗）→ 视图适配（服务端权威，
//   本地只发意图 randomize / swap / confirm / move / surrender）→
//   阵营结算（±10、多局累计、破产）→ 全员准备自动开下一局。
// 暗棋隐私由服务端视图保证：敌子只发匿名 ref，没有棋种。
// 网络层复用 mahjong/multiplayer/net-client.js（HTTP + WS + 自动重连）。
// ============================================================

import Vue from 'vue'
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
  bindChatDock
} from '../gamehall/chatkit.js'
import FourKingdoms from '../FourKingdoms.vue'
import { ARMIES } from './engine.mjs'

const COLORS = ['#176b5a', '#9d4139', '#355f92', '#936028']
const TEAM_NAMES = ['青龙 × 玄武', '赤虎 × 朱雀']

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

    this.view = null // 最新 GAME_STATE_CHANGED（自己座位视角）
    this.results = null // 最近一局的结算（ROOM_UPDATED 口径，含 scores）
    this.destroyed = false
    this.readySent = false
    this._openingShown = null // 已展示过掷骰的 gameId

    this.vm = null // FourKingdoms 的包装实例
    this.game = null // FourKingdoms 组件实例（online 模式）
    this._unsub = this.net.subscribe(msg => this._onEvent(msg))
    this._tickTimer = null
    this._recorder = null
    this._recordAt = 0
    this._voiceBubbles = []
  }

  mount() {
    enterFullscreen()
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
    this._stopRecording(true)
    if (this._chat) this._chat.destroy()
    if (this.vm) {
      this.vm.$destroy()
      this.vm = null
      this.game = null
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
        // 对局中座位状态（断线 / 托管）实时进棋盘徽标
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
        this._showGame()
        // 布阵 → 开战：四家确认后展示一次掷骰定先手
        const gid = p.meta && p.meta.gameId
        if (p.phase === 'play' && p.opening && prevPhase === 'setup' && this._openingShown !== gid) {
          this._openingShown = gid
          this.game.showOnlineDice(p.opening)
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
          this._syncGame()
          this._renderSettlement()
        }
        break
      case 'GAME_FINISHED':
        this._syncGame()
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
      '<div class="gkr-stage" data-gkr-stage>' +
      '  <div data-jqr-waiting></div>' +
      '  <div data-jqr-host hidden></div>' +
      '</div>' +
      '<div class="gkr-settle gkr-settle-fixed" data-gkr-settle hidden></div>' +
      chatDockHtml() +
      '<div class="gkr-bubbles" data-gkr-bubbles></div>' +
      '<div class="gkr-toast" data-gkr-toast hidden></div>'

    this.$waiting = this.root.querySelector('[data-jqr-waiting]')
    this.$host = this.root.querySelector('[data-jqr-host]')
    this.$settle = this.root.querySelector('[data-gkr-settle]')
    this.$bubbles = this.root.querySelector('[data-gkr-bubbles]')
    this.$toast = this.root.querySelector('[data-gkr-toast]')

    this.root.addEventListener('click', ev => this._onClick(ev))
    // 聊天面板：🎤 点开 → 快捷语（普通话 TTS 播报）+ 按住说话
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

  _sendIntent(action) {
    if (!this.view || !this.view.meta) return
    this.net.sendAction({
      gameId: this.view.meta.gameId,
      windowId: this.view.meta.windowId,
      action
    })
  }

  // ---------- 联机适配器（FourKingdoms 的数据源） ----------

  _makeOnlineAdapter() {
    return {
      getView: () => this.view,
      trySwap: (first, second) => this._sendIntent({ type: 'swap', first, second }),
      tryRandomize: () => this._sendIntent({ type: 'randomize' }),
      tryConfirm: () => this._sendIntent({ type: 'confirm' }),
      tryMove: (pieceId, to) => this._sendIntent({ type: 'move', pieceId, to }),
      trySurrender: () => this._sendIntent({ type: 'surrender' }),
      seatLabel: seat => this._seatLabel(seat),
      copyInvite: () => this._copyInvite(),
      leave: () => this._leave(),
      roomCode: () => this._roomCode()
    }
  }

  /** 棋盘徽标文案：军色由组件拼，这里出玩家名 + 关系 + 连接状态 */
  _seatLabel(seat) {
    const metaSeats = (this.view && this.view.meta && this.view.meta.seats) || []
    const m = metaSeats[seat] || {}
    const mySeat = this._mySeat()
    const name = m.displayName || (m.isAi ? 'AI' : '虚位')
    const tag = seat === mySeat ? '·你' : seat % 2 === mySeat % 2 ? '·队友' : ''
    let st = ''
    if (!m.isAi) {
      if (m.connected === false) st = ' ·断线'
      else if (m.autoPlay) st = ' ·托管'
    }
    return name + tag + st
  }

  // ---------- 等待室 ----------

  _renderWaiting() {
    if (!this.room) return
    // 容器归位：等待室显示，对局区与结算浮层收起（组件保持挂载不销毁）
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

    this.$waiting.innerHTML =
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

  // ---------- 对局（单机组件挂载） ----------

  _showGame() {
    if (!this.vm) {
      const adapter = this._makeOnlineAdapter()
      this.vm = new Vue({
        render: h => h(FourKingdoms, { props: { online: adapter }, ref: 'game' })
      })
      this.vm.$mount()
      this.$host.appendChild(this.vm.$el)
      this.game = this.vm.$refs.game
    }
    // 容器归位：对局区显示，等待室收起
    this.$waiting.hidden = true
    this.$host.hidden = false
    if (this.$settle && !this.results) this.$settle.hidden = true
    this._syncGame()
  }

  _syncGame() {
    if (this.game) this.game.syncFromOnline()
  }

  _tick() {
    if (!this.game) return
    const v = this.view
    if (!v || !v.meta || v.phase === 'finished') {
      this.game.countdown = ''
      return
    }
    const dl = v.meta.deadlineAt
    this.game.countdown = dl ? Math.max(0, Math.ceil((dl - Date.now()) / 1000)) + 's' : ''
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
      if (this._chat) this._chat.setRecUI(true)
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
    // 对方的快捷语用普通话 TTS 播报；自己的不播
    if (!mine) speakPhrase(text)
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
