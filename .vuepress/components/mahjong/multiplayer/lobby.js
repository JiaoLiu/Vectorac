// ============================================================
// 联机大厅 / 等待室（multiplayer/lobby.js）
// ------------------------------------------------------------
// 玩家侧入口：房间列表 → 创建 / 坐下 → 等待室（座位、房主操作、邀请）→ 开局。
//
// 设计要点：
//   · 大厅只管「房间与人」，不碰牌局：开局后把 net + player 交给牌桌 UI，
//     由 remote-game.js 接管（服务端权威）；
//   · 断线 ≠ 退出：WS 断开由 net-client 自动重连（resumeToken 存 localStorage），
//     「退出房间」按钮才会真正作废座位；
//   · 房主权限全部走服务端裁决（ADD_AI / REMOVE_AI / UPDATE_RULES / START_GAME），
//     前端只根据座位快照决定按钮显隐，不做任何本地状态修改。
// ============================================================

import {
  NetClient,
  clearCredential,
  errorText,
  loadCredential,
  loadDisplayName,
  saveCredential,
  saveDisplayName
} from './net-client.js'

const STATUS_TEXT = {
  WAITING: '等待中',
  PLAYING: '对局中',
  FINISHED: '已结束'
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]))
}

/** 座位小标签（等待室与房间列表共用） */
function seatPill(seat, opts = {}) {
  const name = seat.occupantType === 'EMPTY'
    ? '空位'
    : esc(seat.displayName || (seat.isAi ? 'AI' : '玩家'))
  const cls = seat.occupantType === 'EMPTY'
    ? 'empty'
    : (seat.isAi ? 'ai' : (seat.connected === false ? 'offline' : 'human'))
  const extra = seat.isAi ? ' 🤖' : (seat.connected === false ? ' 托管' : '')
  const admin = seat.isAdmin && seat.occupantType !== 'AI' ? '<i class="scmj-lb-crown">👑</i>' : ''
  const action = opts.action || ''
  return (
    '<div class="scmj-lb-seat scmj-lb-seat-' + cls + '">' +
    '<span class="scmj-lb-seatname">' + name + extra + admin + '</span>' +
    '<span class="scmj-lb-seatpos">' + (opts.pos || '') + '</span>' +
    action +
    '</div>'
  )
}

/** 思考时长展示：整分钟显示「X 分钟」，否则显示「X 秒」 */
function fmtTurnTimeout(sec) {
  const n = Math.floor(Number(sec) || 0)
  if (n <= 0) return '30 秒'
  return n % 60 === 0 ? n / 60 + ' 分钟' : n + ' 秒'
}

export class Lobby {
  /**
   * @param {Object} opts
   *   - root    : #scmjGame 容器
   *   - ui      : ScmjUI 实例（开局时回调 ui.startOnlineGame）
   *   - config  : { baseUrl, wsPath }
   */
  constructor({ root, ui, config } = {}) {
    this.root = root
    this.ui = ui
    this.config = config || {}
    this.shell = root.querySelector('[data-scmj-lobby-shell]')
    this.el = root.querySelector('[data-scmj-lobby]')
    this.net = null
    this.rooms = []
    this.room = null // 当前房间摘要（绝对座位口径）
    this.mySeat = null
    this.player = null // { playerId, seatIndex, displayName }
    this.view = 'list' // 'list' | 'waiting'
    this.inGame = false
    this.pendingCode = ''
    this.autoJoinCode = '' // 邀请直达：带房号进来后待自动加入的房号（一次性）
    this.pollTimer = null
    this.busy = false
    this.displayName = loadDisplayName()
    this.notice = ''
    // 建房表单的房规：与单机入口选项一致（换三张 / 幺鸡赖子 / AI 提示 / 封顶番数）。
    // 同样要在轮询重渲染之间保持，故存成状态而不是直接读 DOM。
    // 思考时长是「房级」参数，由房主进入房间后在等待室设置（不在大厅表单里）。
    this.createRules = { swapThree: true, yaojiEnabled: false, assist: true, capFan: 3 }
  }

  // ==================== 生命周期 ====================

  open({ inviteCode } = {}) {
    if (this.el) this.el.hidden = false
    if (!this.shell) return
    this.inGame = false
    // 邀请链接 / 刷新页面：?room=K7M3PX 自动带入房号；带房号进来时列表渲染后自动加入
    const code = String(inviteCode || '').trim().toUpperCase() || this._codeFromUrl()
    this.pendingCode = code
    this.autoJoinCode = code
    this._autoJoinPrompted = false
    this._ensureNet()
    if (this.view === 'waiting' && this.room) this._renderWaiting()
    else this._renderList()
    this._refreshRooms()
    this._startPoll()
    // 刷新页面 / 重新打开大厅：本地仍有未退出的房间凭据，且没有指向其他房间的邀请
    // → 直接回原座位（不再要求玩家先点「回到房间」）。凭据若已失效，_resume 会清掉
    // 并回落到列表。
    const cred = loadCredential()
    if (cred && (!code || cred.roomCode === code)) this._resume()
  }

  close() {
    this._stopPoll()
    if (this.el) this.el.hidden = true
    // 返回入口页：大厅是由入口页「联机对战」打开的，关闭时必须把入口页重新显示出来，
    // 否则入口/设置界面会一直 hidden（看起来像整页内容都没了）。
    if (this.ui && this.ui.showEntry) this.ui.showEntry()
  }

  isInGame() {
    return this.inGame
  }

  /** 从牌桌退出后回到大厅列表 */
  returnToList() {
    this.inGame = false
    this.room = null
    this.mySeat = null
    this.player = null
    this.view = 'list'
    this.open()
  }

  /**
   * 一局打完回到房间等待室（多局联机）：保留座位、房间与累计积分，
   * 只把牌桌收起、恢复等待室显示；全员准备后服务端自动开下一局。
   * 与 returnToList 的区别：不离开房间、不重连、不清凭据。
   */
  returnToWaiting() {
    this.inGame = false
    this.view = 'waiting'
    this.lastGameState = null
    if (this.el) this.el.hidden = false
    if (this.room) this._renderWaiting()
    this._startPoll()
  }

  _codeFromUrl() {
    try {
      const q = new URLSearchParams(location.search)
      const code = (q.get('room') || '').trim().toUpperCase()
      return code || ''
    } catch (e) {
      return ''
    }
  }

  // ==================== 网络 ====================

  _ensureNet() {
    if (this.net) return this.net
    this.net = new NetClient({
      baseUrl: this.config.baseUrl || '',
      wsPath: this.config.wsPath || '/mahjong-ws',
      onEvent: msg => this._onNetEvent(msg),
      onStatus: state => this._onNetStatus(state),
      onError: err => this._onNetError(err)
    })
    return this.net
  }

  _onNetStatus(state) {
    if (!this.shell) return
    const banner = this.shell.querySelector('[data-lb-banner]')
    if (!banner) return
    const text =
      state === 'reconnecting' ? '连接已断开，正在重连…'
        : state === 'connecting' ? '正在连接服务器…'
          : state === 'fatal' ? '房间已失效，请重新进入'
            : ''
    banner.textContent = text
    banner.hidden = !text
    banner.classList.toggle('scmj-lb-banner-bad', state === 'fatal')
    if (state === 'fatal' && this.inGame) {
      // 令牌失效：牌桌已无意义，退回大厅列表
      this.inGame = false
      this.room = null
      this.player = null
      this.view = 'list'
      this.ui.onlineAborted('房间已失效或已解散')
      this._renderList()
    }
  }

  _onNetError(err) {
    if (!err) return
    if (err.fatal) return // 致命错误由 onStatus('fatal') 统一处理
    this._toast(errorText(err.errorCode, err.message))
  }

  _onNetEvent(msg) {
    if (!msg || !msg.type) return
    switch (msg.type) {
      case 'ROOM_SNAPSHOT':
        this.room = msg.payload
        this.mySeat = msg.payload.mySeat
        if (this.mySeat != null) this._syncPlayerFromRoom()
        if (this.room.status === 'PLAYING' && !this.inGame) {
          // 已开局：先请服务端补一帧牌局视图，等 GAME_STATE_CHANGED 到再进桌
          this.net.resync()
          this._renderWaiting()
        } else if (!this.inGame) {
          this._renderWaiting()
        }
        break
      case 'READY_CHANGED': {
        // 局间准备状态变化：只更新座位快照并刷新等待室（不整页重渲染牌桌）
        const p = msg.payload || {}
        if (this.room && Array.isArray(p.seats)) this.room.seats = p.seats
        if (!this.inGame) this._renderWaiting()
        break
      }
      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
      case 'PLAYER_DISCONNECTED':
      case 'PLAYER_CONNECTED':
      case 'AI_ADDED':
      case 'AI_REMOVED':
      case 'ADMIN_CHANGED':
      case 'RULES_UPDATED': {
        const p = msg.payload || {}
        if (this.room && p.rules) this.room.rules = { ...(this.room.rules || {}), ...p.rules }
        if (this.room && Array.isArray(p.seats)) {
          this.room.seats = p.seats
          this.room.aiCount = p.seats.filter(s => s.isAi).length
          this.room.emptyCount = p.seats.filter(s => s.occupantType === 'EMPTY').length
          this.room.humanCount = p.seats.filter(s => s.occupantType === 'HUMAN').length
        }
        if (this.room && msg.payload && msg.payload.adminSeat != null) {
          this.room.adminSeat = msg.payload.adminSeat
        }
        if (this.inGame) break
        this._renderWaiting()
        break
      }
      case 'GAME_STARTED':
        if (this.room) {
          this.room.status = 'PLAYING'
          if (Array.isArray(msg.payload && msg.payload.seats)) this.room.seats = msg.payload.seats
        }
        if (!this.inGame) {
          this.net.resync()
          this._renderWaiting()
        }
        break
      case 'GAME_STATE_CHANGED':
        // 存下最近一帧交给牌桌适配层做首帧，避免进桌瞬间白屏
        this.lastGameState = msg.payload
        if (!this.inGame) this._enterGame()
        break
      case 'ROOM_UPDATED':
        // 局末房间回写：一局打完房间回 WAITING（或有人破产进 FINISHED），
        // 同时带上局号 / 累计积分 / 破产座位，等待室据此切到「局间准备」视图。
        // 能收到 ROOM_UPDATED 就说明至少已经打完一局。
        if (this.room && msg.payload) {
          const p = msg.payload
          if (p.status) this.room.status = p.status
          if (Array.isArray(p.seats)) this.room.seats = p.seats
          if (p.round != null) this.room.round = p.round
          if (Array.isArray(p.scores)) this.room.scores = p.scores
          if (Array.isArray(p.bankruptSeats)) this.room.bankruptSeats = p.bankruptSeats
          this.room.hasPlayed = true
        }
        if (!this.inGame) this._renderWaiting()
        break
      case 'ROOM_DESTROYED':
        clearCredential()
        this.inGame = false
        this.room = null
        this.player = null
        this.view = 'list'
        this.ui.onlineAborted('房间已解散')
        this._renderList()
        this._toast('房间已解散')
        break
      case 'LEFT_ROOM':
        clearCredential()
        this.inGame = false
        this.room = null
        this.player = null
        this.view = 'list'
        this._renderList()
        break
      default:
        break
    }
  }

  _syncPlayerFromRoom() {
    if (!this.room || this.mySeat == null) return
    const seat = (this.room.seats || [])[this.mySeat]
    this.player = {
      playerId: (this.net && this.net.playerId) || (this.player && this.player.playerId),
      seatIndex: this.mySeat,
      displayName: (seat && seat.displayName) || this.displayName,
      roomId: this.room.roomId,
      roomCode: this.room.roomCode
    }
  }

  _enterGame() {
    if (this.inGame || !this.room) return
    this.inGame = true
    this._stopPoll()
    if (this.el) this.el.hidden = true
    this.ui.startOnlineGame({
      net: this.net,
      player: this.player || { seatIndex: this.mySeat, displayName: this.displayName },
      room: this.room,
      view: this.lastGameState || null
    })
  }

  // ==================== 房间列表 ====================

  _startPoll() {
    this._stopPoll()
    this.pollTimer = setInterval(() => {
      if (this.inGame || (this.el && this.el.hidden)) return
      if (this.view === 'list') this._refreshRooms()
    }, 4000)
  }

  _stopPoll() {
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  async _refreshRooms() {
    if (!this.net) return
    try {
      const data = await this.net.listRooms()
      this.rooms = (data && data.rooms) || []
      this.maxRooms = (data && data.maxRooms) || 20
      this.activeRooms = (data && data.activeRooms) || this.rooms.length
      if (this.view === 'list') this._renderList()
    } catch (e) {
      if (this.view === 'list') {
        this.notice = errorText(e.errorCode, e.message)
        this._renderList()
      }
    }
  }

  _renderList() {
    if (!this.shell) return
    this.view = 'list'
    const cred = loadCredential()
    const cards = this.rooms.length
      ? this.rooms.map(r => this._roomCard(r)).join('')
      : '<div class="scmj-lb-empty">还没有房间，创建一个等朋友来吧～</div>'
    const resume = cred
      ? '<div class="scmj-lb-resume">检测到未退出的房间 <b>' + esc(cred.roomCode || '') + '</b>' +
        '<button type="button" class="scmj-btn scmj-btn-primary" data-lb="resume">回到房间</button></div>'
      : ''
    this.shell.innerHTML =
      '<div class="scmj-lb">' +
      '<div class="scmj-lb-head">' +
      '<div class="scmj-lb-title">🀄 联机对战</div>' +
      '<button type="button" class="scmj-btn scmj-btn-ghost" data-lb="close">返回</button>' +
      '</div>' +
      '<div data-lb-banner class="scmj-lb-banner" hidden></div>' +
      resume +
      '<div class="scmj-lb-name">' +
      '<span>昵称</span>' +
      '<input type="text" maxlength="12" data-lb="name" value="' + esc(this.displayName) + '" placeholder="输入昵称" />' +
      '</div>' +
      this._newRulesBar() +
      '<div class="scmj-lb-actions">' +
      '<button type="button" class="scmj-btn scmj-btn-primary" data-lb="create">创建房间</button>' +
      '<button type="button" class="scmj-btn" data-lb="refresh">刷新</button>' +
      '</div>' +
      '<div class="scmj-lb-join">' +
      '<input type="text" maxlength="6" data-lb="code" placeholder="输入 6 位房号" value="' + esc(this.pendingCode || '') + '" />' +
      '<button type="button" class="scmj-btn" data-lb="join">加入</button>' +
      '</div>' +
      '<div class="scmj-lb-meta">房间 ' + this.rooms.length + ' / ' + (this.maxRooms || 20) + ' · 点击「坐下」进入等待室' +
      (this.notice ? ' · <span class="scmj-lb-warn">' + esc(this.notice) + '</span>' : '') +
      '</div>' +
      '<div class="scmj-lb-rooms">' + cards + '</div>' +
      '</div>'
    this.notice = ''
    this._bindShell()
    this.pendingCode = ''
    this._maybeAutoJoin()
  }

  /**
   * 邀请直达：带房号进来时列表渲染后立刻加入，不必再手动点「加入」。
   *   · 已有该房间的凭据 → 直接回原座位（避免重复占座）；
   *   · 已有昵称 → 立即加入；
   *   · 还没昵称 → 聚焦昵称框并提示，填好后（失焦/回车）自动加入。
   */
  _maybeAutoJoin() {
    const code = this.autoJoinCode
    if (!code || this.busy || !this.net) return
    const cred = loadCredential()
    if (cred && cred.roomCode === code) {
      this.autoJoinCode = ''
      this._resume()
      return
    }
    if (!this.displayName) {
      if (!this._autoJoinPrompted) {
        this._autoJoinPrompted = true
        this._toast('请填写昵称，将自动进入房间 ' + code)
        const input = this.shell && this.shell.querySelector('[data-lb="name"]')
        if (input) input.focus()
      }
      return
    }
    this.autoJoinCode = ''
    this._autoJoinPrompted = false
    this._joinRoom(code)
  }

  /**
   * 建房表单的房规条：与单机入口选项一致（换三张 / 幺鸡赖子 / AI 提示 / 封顶番数）。
   * 建房后房主仍可在等待室改（同一套选项），这里的初值直接带进新房间。
   */
  _newRulesBar() {
    const cr = this.createRules
    return (
      '<div class="scmj-lb-rules">' +
      '<label class="scmj-lb-rule"><input type="checkbox" data-lb="new-swap"' + (cr.swapThree ? ' checked' : '') + ' /> 换三张</label>' +
      '<label class="scmj-lb-rule"><input type="checkbox" data-lb="new-yaoji"' + (cr.yaojiEnabled ? ' checked' : '') + ' /> 幺鸡赖子</label>' +
      '<label class="scmj-lb-rule"><input type="checkbox" data-lb="new-assist"' + (cr.assist ? ' checked' : '') + ' /> AI 提示</label>' +
      '<span class="scmj-lb-rule">封顶 ' +
      '<button type="button" class="scmj-lb-step" data-lb="new-cap-dec"' + (cr.capFan <= 2 ? ' disabled' : '') + '>−</button>' +
      '<b data-lb="new-cap-val">' + cr.capFan + '</b>' +
      '<button type="button" class="scmj-lb-step" data-lb="new-cap-inc"' + (cr.capFan >= 6 ? ' disabled' : '') + '>＋</button>' +
      ' 番</span>' +
      '</div>'
    )
  }

  _roomCard(r) {
    const seats = (r.seats || []).map(s => seatPill(s, { pos: '座位' + (s.seatIndex + 1) })).join('')
    const joinable = r.status === 'WAITING'
    const btn = joinable
      ? '<button type="button" class="scmj-btn scmj-btn-primary" data-lb="sit" data-code="' + esc(r.roomCode) + '">坐下</button>'
      : '<button type="button" class="scmj-btn" disabled>' +
        (r.status === 'PLAYING' ? '已开局' : '已结束') + '</button>'
    return (
      '<div class="scmj-lb-room">' +
      '<div class="scmj-lb-room-top">' +
      '<b class="scmj-lb-code">' + esc(r.roomCode) + '</b>' +
      '<span class="scmj-lb-status scmj-lb-status-' + esc(r.status) + '">' + (STATUS_TEXT[r.status] || r.status) + '</span>' +
      '<span class="scmj-lb-count">' + r.humanCount + '人 · ' + r.aiCount + 'AI · ' + r.emptyCount + '空位 · 思考 ' + fmtTurnTimeout(r.turnTimeoutSeconds) + '</span>' +
      '</div>' +
      '<div class="scmj-lb-seats">' + seats + '</div>' +
      '<div class="scmj-lb-room-btns">' + btn + '</div>' +
      '</div>'
    )
  }

  // ==================== 等待室 ====================

  _renderWaiting() {
    if (!this.shell || !this.room) return
    this.view = 'waiting'
    const room = this.room
    const isAdmin = room.adminSeat === this.mySeat
    const waiting = room.status === 'WAITING'
    // 局间等待（已打过至少一局）：座位显示准备状态，全员准备后服务端自动开下一局
    const betweenRounds = waiting && !!room.hasPlayed
    const seats = (room.seats || []).map(s => {
      const canAdd = isAdmin && waiting && s.occupantType === 'EMPTY'
      const canRemove = isAdmin && waiting && s.isAi
      const readyBadge = betweenRounds && s.occupantType === 'HUMAN'
        ? '<span class="scmj-lb-ready' + (s.ready ? ' ok' : '') + '">' + (s.ready ? '✓ 已准备' : '未准备') + '</span>'
        : ''
      const action =
        (canAdd ? '<button type="button" class="scmj-lb-seatbtn" data-lb="addai" data-seat="' + s.seatIndex + '">加AI</button>' : '') +
        (canRemove ? '<button type="button" class="scmj-lb-seatbtn" data-lb="removeai" data-seat="' + s.seatIndex + '">移除</button>' : '') +
        readyBadge +
        (s.seatIndex === this.mySeat ? '<span class="scmj-lb-me">我</span>' : '')
      return seatPill(s, { pos: '座位' + (s.seatIndex + 1), action })
    }).join('')

    const rules = room.rules || {}
    const rulebar = waiting
      ? '<div class="scmj-lb-rules' + (isAdmin ? '' : ' scmj-lb-rules-ro') + '">' +
        '<label class="scmj-lb-rule"><input type="checkbox" data-lb="rule-swap"' + (rules.swapThree ? ' checked' : '') +
        (isAdmin ? '' : ' disabled') + ' /> 换三张</label>' +
        '<label class="scmj-lb-rule"><input type="checkbox" data-lb="rule-yaoji"' + (rules.yaojiEnabled ? ' checked' : '') +
        (isAdmin ? '' : ' disabled') + ' /> 幺鸡赖子</label>' +
        '<label class="scmj-lb-rule"><input type="checkbox" data-lb="rule-assist"' + (rules.assist !== false ? ' checked' : '') +
        (isAdmin ? '' : ' disabled') + ' /> AI 提示</label>' +
        '<span class="scmj-lb-rule">封顶 ' +
        '<button type="button" class="scmj-lb-step" data-lb="cap-dec"' + (isAdmin ? '' : ' disabled') + '>−</button>' +
        '<b data-lb="cap-val">' + (rules.capFan || 3) + '</b>' +
        '<button type="button" class="scmj-lb-step" data-lb="cap-inc"' + (isAdmin ? '' : ' disabled') + '>＋</button>' +
        ' 番</span>' +
        // 思考时长是房级参数，房主在等待室直接改（非房主只读）；所有局沿用
        '<span class="scmj-lb-rule">思考 ' +
        '<button type="button" class="scmj-lb-step" data-lb="tt-dec"' + (isAdmin ? '' : ' disabled') + '>−</button>' +
        '<b data-lb="tt-val">' + fmtTurnTimeout(room.turnTimeoutSeconds) + '</b>' +
        '<button type="button" class="scmj-lb-step" data-lb="tt-inc"' + (isAdmin ? '' : ' disabled') + '>＋</button>' +
        ' / 步</span>' +
        '</div>'
      : ''

    const humanSeats = (room.seats || []).filter(s => s.occupantType === 'HUMAN')
    // 只统计「在线真人」：断线真人由 AI 托管，不阻塞下一局（与服务端 _maybeStartNextRound 一致）
    const activeHumans = humanSeats.filter(s => s.connected !== false)
    const readyN = activeHumans.filter(s => s.ready).length
    const mySeatSnap = (room.seats || [])[this.mySeat] || null
    const iAmReady = !!(mySeatSnap && mySeatSnap.ready)
    let footer
    if (betweenRounds) {
      footer =
        '<button type="button" class="scmj-btn ' + (iAmReady ? '' : 'scmj-btn-primary') + '" data-lb="ready">' +
        (iAmReady ? '取消准备' : '准备下一局') + '</button>' +
        '<div class="scmj-lb-tip">已准备 ' + readyN + ' / ' + activeHumans.length +
        ' 人 · 全员准备后自动开始第 ' + ((room.round || 1) + 1) + ' 局</div>'
    } else if (waiting) {
      footer = isAdmin
        ? '<button type="button" class="scmj-btn scmj-btn-primary" data-lb="start">开始游戏（空位自动补 AI）</button>'
        : '<div class="scmj-lb-tip">等待房主开始游戏…</div>'
    } else if (room.status === 'FINISHED') {
      // 破产终态：本局打完不再开下一局（房间稍后回收），只能退出房间
      footer = '<div class="scmj-lb-tip">本局已结束（有玩家破产）· 请退出房间</div>'
    } else {
      footer = '<div class="scmj-lb-tip">牌局已开始，正在进入牌桌…</div>'
    }

    this.shell.innerHTML =
      '<div class="scmj-lb">' +
      '<div class="scmj-lb-head">' +
      '<div class="scmj-lb-title">房间 <b class="scmj-lb-code">' + esc(room.roomCode) + '</b></div>' +
      '<button type="button" class="scmj-btn scmj-btn-ghost" data-lb="leave">退出房间</button>' +
      '</div>' +
      '<div data-lb-banner class="scmj-lb-banner" hidden></div>' +
      '<div class="scmj-lb-invite">' +
      '<span>邀请好友：把房号 <b>' + esc(room.roomCode) + '</b> 发给对方，或</span>' +
      '<button type="button" class="scmj-btn" data-lb="copy">复制邀请链接</button>' +
      '</div>' +
      '<div class="scmj-lb-waitseats">' + seats + '</div>' +
      rulebar +
      '<div class="scmj-lb-foot">' + footer + '</div>' +
      '</div>'
    this._bindShell()
  }

  // ==================== 事件 ====================

  _bindShell() {
    const shell = this.shell
    if (!shell) return
    // 昵称输入：即时保存，后续创建/加入都用它
    const nameInput = shell.querySelector('[data-lb="name"]')
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        this.displayName = nameInput.value.slice(0, 12)
        saveDisplayName(this.displayName)
      })
    }
    // 回车即加入：邀请链接进来的玩家填完昵称按回车就直接进房，不用再找按钮
    const codeInput = shell.querySelector('[data-lb="code"]')
    for (const input of [nameInput, codeInput]) {
      if (!input) continue
      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        if (this.autoJoinCode) this._maybeAutoJoin()
        else this._onAct('join')
      })
    }
    // 房规复选（建房表单 new-* / 等待室 rule-*）：checkbox 也是 INPUT，
    // 必须在下面「其余输入框不绑点击」之前处理，否则 change 绑不上、勾选毫无反应。
    const RULE_CHECKS = {
      'rule-swap': 'swapThree',
      'rule-yaoji': 'yaojiEnabled',
      'rule-assist': 'assist',
      'new-swap': 'swapThree',
      'new-yaoji': 'yaojiEnabled',
      'new-assist': 'assist'
    }
    shell.querySelectorAll('[data-lb]').forEach(el => {
      const act = el.getAttribute('data-lb')
      if (RULE_CHECKS[act]) {
        el.addEventListener('change', () => {
          // 建房表单只改本地草稿（建房时才提交）；等待室即时提交给服务端
          if (act.indexOf('new-') === 0) this.createRules[RULE_CHECKS[act]] = el.checked
          else this._updateRules()
        })
        return
      }
      if (el.tagName === 'INPUT') return // 其余输入框只读值，不绑点击
      el.addEventListener('click', () => this._onAct(act, el))
    })
  }

  _onAct(act, el) {
    switch (act) {
      case 'close':
        this.close()
        break
      case 'refresh':
        this._refreshRooms()
        break
      case 'create':
        this._createRoom()
        break
      case 'join': {
        const input = this.shell.querySelector('[data-lb="code"]')
        this._joinRoom(input ? input.value : '')
        break
      }
      case 'sit':
        this._joinRoom(el.getAttribute('data-code'))
        break
      case 'resume':
        this._resume()
        break
      case 'leave':
        this._leave()
        break
      case 'copy':
        this._copyInvite()
        break
      case 'addai':
        this._admin('ADD_AI', { seatIndex: Number(el.getAttribute('data-seat')) })
        break
      case 'removeai':
        this._admin('REMOVE_AI', { seatIndex: Number(el.getAttribute('data-seat')) })
        break
      case 'start':
        this._admin('START_GAME', {})
        break
      case 'ready':
        if (this.net) this.net.sendAdmin('TOGGLE_READY', {})
        break
      case 'cap-dec':
      case 'cap-inc':
        this._updateRules(act === 'cap-inc' ? 1 : -1)
        break
      case 'tt-dec':
      case 'tt-inc':
        this._ttStep(act === 'tt-inc' ? 1 : -1)
        break
      case 'new-cap-dec':
      case 'new-cap-inc':
        this._newCapStep(act === 'new-cap-inc' ? 1 : -1)
        break
      default:
        break
    }
  }

  async _createRoom() {
    if (this.busy) return
    this.busy = true
    this.notice = ''
    try {
      const data = await this.net.createRoom({
        displayName: this.displayName,
        rules: { ...this.createRules }
      })
      await this._enterWith(data)
    } catch (e) {
      this.notice = errorText(e.errorCode, e.message)
      this._renderList()
    } finally {
      this.busy = false
    }
  }

  async _joinRoom(code) {
    const roomCode = String(code || '').trim().toUpperCase()
    if (!roomCode) return this._toast('请输入房号')
    // 这个房号就是自己尚未退出的房间（刷新后凭据还在）：直接回原座位，
    // 而不是走 join 新建一个重复座位（满员时还会被判「房间已满」坐不进去）。
    const cred = loadCredential()
    if (cred && cred.roomCode === roomCode) return this._resume()
    if (this.busy) return
    this.busy = true
    this.notice = ''
    try {
      const data = await this.net.joinRoom({ roomCode, displayName: this.displayName })
      await this._enterWith(data)
    } catch (e) {
      this.notice = errorText(e.errorCode, e.message)
      this._renderList()
    } finally {
      this.busy = false
    }
  }

  /** 创建/加入成功后：存凭据 → 建连接（RECONNECT 绑定）→ 等服务端快照 */
  async _enterWith(data) {
    if (!data || !data.player || !data.room) throw { errorCode: 'SERVER_ERROR', message: '服务器返回异常' }
    const p = data.player
    this.player = p
    this.room = data.room
    this.mySeat = p.seatIndex
    saveCredential({
      roomId: p.roomId,
      roomCode: p.roomCode,
      playerId: p.playerId,
      resumeToken: p.resumeToken,
      displayName: p.displayName,
      seatIndex: p.seatIndex,
      savedAt: Date.now()
    })
    this._ensureNet()
    this._stopPoll()
    try {
      await this.net.connect({
        roomId: p.roomId,
        playerId: p.playerId,
        resumeToken: p.resumeToken,
        displayName: p.displayName
      })
    } catch (e) {
      clearCredential()
      this.player = null
      this.room = null
      this.mySeat = null
      this.view = 'list'
      this.notice = errorText(e.errorCode, e.message)
      this._renderList()
      return
    }
    if (this.room && this.room.status === 'PLAYING') {
      // 加入/回到进行中的房间：等服务端推首帧牌局视图后自动进桌
      this.net.resync()
    }
    this._renderWaiting()
  }

  /** 刷新后凭 localStorage 里的 resumeToken 回到原座位 */
  async _resume() {
    const cred = loadCredential()
    if (!cred) return
    if (this.busy) return
    this.busy = true
    try {
      this.player = {
        playerId: cred.playerId,
        seatIndex: cred.seatIndex,
        displayName: cred.displayName || this.displayName,
        roomId: cred.roomId,
        roomCode: cred.roomCode
      }
      this.displayName = cred.displayName || this.displayName
      this._ensureNet()
      this._stopPoll()
      await this.net.connect(cred)
      // 等服务端快照（ROOM_SNAPSHOT / GAME_STATE_CHANGED 里会渲染或进桌）
      this.net.resync()
    } catch (e) {
      clearCredential()
      this.player = null
      this.notice = errorText(e.errorCode, e.message)
      this._renderList()
      this._startPoll() // 回落到列表后恢复轮询（_stopPoll 已在上面执行）
    } finally {
      this.busy = false
    }
  }

  _leave() {
    if (!window.confirm('退出房间？座位将立即释放，退出后无法再回到本局。')) return
    clearCredential()
    if (this.net) this.net.leaveRoom()
    this.inGame = false
    this.room = null
    this.player = null
    this.mySeat = null
    this.view = 'list'
    this._renderList()
    this._startPoll()
  }

  _copyInvite() {
    if (!this.room) return
    let url = ''
    try {
      const u = new URL(location.href)
      u.searchParams.set('room', this.room.roomCode)
      url = u.toString()
    } catch (e) {
      url = location.href + '?room=' + this.room.roomCode
    }
    const text = '来打四川麻将！房号 ' + this.room.roomCode + ' → ' + url
    const fallback = () => this._toast('邀请链接：' + url)
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => this._toast('邀请链接已复制'),
          fallback
        )
      } else fallback()
    } catch (e) {
      fallback()
    }
  }

  _admin(type, payload) {
    if (!this.net) return
    this.net.sendAdmin(type, payload)
  }

  /** 建房表单「封顶番数」步进（2~6）：只改本地草稿 + 就地更新按钮状态，不整页重渲染 */
  _newCapStep(delta) {
    const n = Math.max(2, Math.min(6, (Number(this.createRules.capFan) || 3) + delta))
    this.createRules.capFan = n
    const val = this.shell.querySelector('[data-lb="new-cap-val"]')
    if (val) val.textContent = String(n)
    const dec = this.shell.querySelector('[data-lb="new-cap-dec"]')
    const inc = this.shell.querySelector('[data-lb="new-cap-inc"]')
    if (dec) dec.disabled = n <= 2
    if (inc) inc.disabled = n >= 6
  }

  _updateRules(delta, turnTimeoutSeconds) {
    if (!this.room || !this.net) return
    const cur = this.room.rules || {}
    const swap = this.shell.querySelector('[data-lb="rule-swap"]')
    const yaoji = this.shell.querySelector('[data-lb="rule-yaoji"]')
    const assist = this.shell.querySelector('[data-lb="rule-assist"]')
    const capFan = Math.max(2, Math.min(6, (Number(cur.capFan) || 3) + (delta || 0)))
    const next = {
      capFan,
      swapThree: swap ? !!swap.checked : cur.swapThree !== false,
      yaojiEnabled: yaoji ? !!yaoji.checked : !!cur.yaojiEnabled,
      assist: assist ? !!assist.checked : cur.assist !== false
    }
    this.room.rules = { ...cur, ...next }
    const val = this.shell.querySelector('[data-lb="cap-val"]')
    if (val) val.textContent = String(capFan)
    const payload = { rules: next }
    // 思考时长（秒）随房规一起提交；未改则不带该字段（服务端保持原值）
    if (turnTimeoutSeconds != null) {
      this.room.turnTimeoutSeconds = turnTimeoutSeconds
      payload.turnTimeoutSeconds = turnTimeoutSeconds
    }
    this.net.sendAdmin('UPDATE_RULES', payload)
  }

  /** 等待室「思考时长」步进（房主，10 秒一档，范围 10~600 秒）：只改房级参数，不整页重渲染 */
  _ttStep(delta) {
    if (!this.room || !this.net) return
    if (this.room.adminSeat !== this.mySeat) return
    const STEP = 10
    const MIN = 10
    const MAX = 600
    const cur = Math.floor(Number(this.room.turnTimeoutSeconds) || 30)
    const next = Math.max(MIN, Math.min(MAX, cur + delta * STEP))
    if (next === cur) return
    const val = this.shell.querySelector('[data-lb="tt-val"]')
    if (val) val.textContent = fmtTurnTimeout(next)
    const dec = this.shell.querySelector('[data-lb="tt-dec"]')
    const inc = this.shell.querySelector('[data-lb="tt-inc"]')
    if (dec) dec.disabled = next <= MIN
    if (inc) inc.disabled = next >= MAX
    this._updateRules(0, next)
  }

  _toast(text) {
    if (this.ui && this.ui.toast) this.ui.toast(text)
  }
}