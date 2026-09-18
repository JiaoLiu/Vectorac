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
    this.pollTimer = null
    this.busy = false
    this.displayName = loadDisplayName()
    this.notice = ''
  }

  // ==================== 生命周期 ====================

  open() {
    if (this.el) this.el.hidden = false
    if (!this.shell) return
    this.inGame = false
    // 邀请链接 / 刷新页面：?room=K7M3PX 自动带入房号
    this.pendingCode = this._codeFromUrl()
    if (this.view === 'waiting' && this.room) this._renderWaiting()
    else this._renderList()
    this._ensureNet()
    this._refreshRooms()
    this._startPoll()
  }

  close() {
    this._stopPoll()
    if (this.el) this.el.hidden = true
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
      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
      case 'PLAYER_DISCONNECTED':
      case 'PLAYER_CONNECTED':
      case 'AI_ADDED':
      case 'AI_REMOVED':
      case 'ADMIN_CHANGED':
      case 'RULES_UPDATED': {
        const p = msg.payload || {}
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
        if (this.room && msg.payload) {
          if (msg.payload.status) this.room.status = msg.payload.status
          if (Array.isArray(msg.payload.seats)) this.room.seats = msg.payload.seats
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
      '<span class="scmj-lb-count">' + r.humanCount + '人 · ' + r.aiCount + 'AI · ' + r.emptyCount + '空位</span>' +
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
    const seats = (room.seats || []).map(s => {
      const canAdd = isAdmin && waiting && s.occupantType === 'EMPTY'
      const canRemove = isAdmin && waiting && s.isAi
      const action =
        (canAdd ? '<button type="button" class="scmj-lb-seatbtn" data-lb="addai" data-seat="' + s.seatIndex + '">加AI</button>' : '') +
        (canRemove ? '<button type="button" class="scmj-lb-seatbtn" data-lb="removeai" data-seat="' + s.seatIndex + '">移除</button>' : '') +
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
        '<span class="scmj-lb-rule">封顶 ' +
        '<button type="button" class="scmj-lb-step" data-lb="cap-dec"' + (isAdmin ? '' : ' disabled') + '>−</button>' +
        '<b data-lb="cap-val">' + (rules.capFan || 3) + '</b>' +
        '<button type="button" class="scmj-lb-step" data-lb="cap-inc"' + (isAdmin ? '' : ' disabled') + '>＋</button>' +
        ' 番</span>' +
        '</div>'
      : ''

    const footer = waiting
      ? (isAdmin
        ? '<button type="button" class="scmj-btn scmj-btn-primary" data-lb="start">开始游戏（空位自动补 AI）</button>'
        : '<div class="scmj-lb-tip">等待房主开始游戏…</div>')
      : '<div class="scmj-lb-tip">牌局已开始，正在进入牌桌…</div>'

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
    shell.querySelectorAll('[data-lb]').forEach(el => {
      const act = el.getAttribute('data-lb')
      if (el.tagName === 'INPUT') return // 输入框只读值，不绑点击
      if (act === 'rule-swap' || act === 'rule-yaoji') {
        el.addEventListener('change', () => this._updateRules())
        return
      }
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
      case 'cap-dec':
      case 'cap-inc':
        this._updateRules(act === 'cap-inc' ? 1 : -1)
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
        rules: { capFan: 3, swapThree: true, yaojiEnabled: false }
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

  _updateRules(delta) {
    if (!this.room || !this.net) return
    const cur = this.room.rules || {}
    const swap = this.shell.querySelector('[data-lb="rule-swap"]')
    const yaoji = this.shell.querySelector('[data-lb="rule-yaoji"]')
    const capFan = Math.max(2, Math.min(6, (Number(cur.capFan) || 3) + (delta || 0)))
    const next = {
      capFan,
      swapThree: swap ? !!swap.checked : cur.swapThree !== false,
      yaojiEnabled: yaoji ? !!yaoji.checked : !!cur.yaojiEnabled
    }
    this.room.rules = { ...cur, ...next }
    const val = this.shell.querySelector('[data-lb="cap-val"]')
    if (val) val.textContent = String(capFan)
    this.net.sendAdmin('UPDATE_RULES', { rules: next })
  }

  _toast(text) {
    if (this.ui && this.ui.toast) this.ui.toast(text)
  }
}