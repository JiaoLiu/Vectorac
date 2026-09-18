// ============================================================
// 联机网络客户端（multiplayer/net-client.js）
// ------------------------------------------------------------
// 职责：把服务端 HTTP + WebSocket 接口包成 Promise / 事件回调，
// 供 lobby（大厅/等待室）与 remote-game（牌局适配层）调用。
//
// 分工（与服务端 server.js 一致）：
//   HTTP → 房间列表 / 创建 / 加入 / 按房号查询（一次性动作）
//   WS   → 重连绑定、房间与牌局实时同步、管理员命令、牌局动作
//
// 重连令牌（resumeToken）是重连唯一凭据，存 localStorage；
// 断线 ≠ 退出：网络断开只触发自动重连，只有明确调用 leaveRoom() 才是退出。
// 日志/对外都不打印完整令牌（只留尾部 4 位便于排查）。
// ============================================================

const CRED_KEY = 'scmj-online-cred'
const NAME_KEY = 'scmj-online-name'

/** 玩家自己的昵称（跨房间复用，可改） */
export function loadDisplayName() {
  try {
    return localStorage.getItem(NAME_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function saveDisplayName(name) {
  try {
    localStorage.setItem(NAME_KEY, String(name || '').slice(0, 12))
  } catch (e) {
    /* 隐私模式忽略 */
  }
}

/** 房间级凭据：刷新后可凭 resumeToken 重连回原座位 */
export function loadCredential() {
  try {
    const raw = localStorage.getItem(CRED_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    return c && c.resumeToken && c.roomId ? c : null
  } catch (e) {
    return null
  }
}

export function saveCredential(cred) {
  try {
    localStorage.setItem(CRED_KEY, JSON.stringify(cred))
  } catch (e) {
    /* 忽略 */
  }
}

export function clearCredential() {
  try {
    localStorage.removeItem(CRED_KEY)
  } catch (e) {
    /* 忽略 */
  }
}

/** 对外错误（只暴露 errorCode，前端按码判断文案） */
export class NetError extends Error {
  constructor(errorCode, message, status) {
    super(message || errorCode)
    this.name = 'NetError'
    this.errorCode = errorCode || 'SERVER_ERROR'
    this.status = status || 0
  }
}

/** 业务错误码 → 玩家可读文案 */
export const ERROR_TEXT = {
  ROOM_NOT_FOUND: '房间不存在或已解散',
  ROOM_CAPACITY_REACHED: '当前房间数量已达上限，请稍后再试',
  ROOM_FULL: '房间已满',
  ROOM_LOCKED: '牌局已经开始，无法再修改',
  GAME_ALREADY_STARTED: '牌局已经开始，无法加入',
  GAME_ALREADY_FINISHED: '本局已经结束',
  NOT_ROOM_ADMIN: '只有房主可以进行该操作',
  INVALID_RESUME_TOKEN: '重连凭据已失效，请重新进入房间',
  INVALID_ACTION: '操作不合法',
  NOT_YOUR_TURN: '当前不是你的行动回合',
  ACTION_WINDOW_EXPIRED: '操作已过期，请重试',
  ACTION_ALREADY_PROCESSED: '该操作已执行过',
  PLAYER_ALREADY_LEFT: '你已退出该房间',
  ROOM_DESTROYED: '房间已解散',
  INVALID_ROOM_CODE: '房号格式不正确',
  INVALID_RULES: '规则参数不合法',
  FORBIDDEN: '无权限',
  SERVER_ERROR: '服务器开小差了，请稍后重试'
}

export function errorText(code, fallback) {
  return ERROR_TEXT[code] || fallback || '操作失败'
}

function randomId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 由 baseUrl 推导 WebSocket 地址（同源时用当前页面 host） */
export function buildWsUrl(baseUrl, wsPath) {
  const path = wsPath || '/mahjong-ws'
  if (baseUrl) {
    try {
      const u = new URL(baseUrl, location.href)
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
      u.pathname = path
      u.search = ''
      u.hash = ''
      return u.toString()
    } catch (e) {
      /* 落回同源 */
    }
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return proto + '//' + location.host + path
}

export class NetClient {
  /**
   * @param {Object} opts
   *   - baseUrl  : 服务端根地址（空 = 同源，生产由 nginx 反代）
   *   - wsPath   : WebSocket 路径（默认 /mahjong-ws）
   *   - onEvent  : (msg) => void   服务端消息（含 type / payload）
   *   - onStatus : (state) => void 'connecting'|'open'|'closed'|'reconnecting'|'fatal'
   *   - onError  : ({errorCode, message, fatal, requestId}) => void
   */
  constructor({ baseUrl = '', wsPath = '/mahjong-ws', onEvent, onStatus, onError } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '')
    this.wsPath = wsPath
    /** 事件订阅者：大厅与牌局适配层可同时订阅（牌局不覆盖大厅的订阅） */
    this._eventFns = []
    if (typeof onEvent === 'function') this._eventFns.push(onEvent)
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {}
    this.onError = typeof onError === 'function' ? onError : () => {}

    this.ws = null
    this.roomId = null
    this.playerId = null
    this.resumeToken = null
    this.displayName = ''
    this.closed = false // 主动关闭后不再自动重连
    this.retry = 0
    this._retryTimer = null
    this._pingTimer = null
    this._leaveCloseTimer = null
    this._reconnectWaiters = []
  }

  // ---------- HTTP ----------

  async http(path, { method = 'GET', body } = {}) {
    let res
    try {
      res = await fetch(this.baseUrl + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      })
    } catch (e) {
      throw new NetError('SERVER_ERROR', '无法连接服务器，请检查网络', 0)
    }
    let data = null
    try {
      data = await res.json()
    } catch (e) {
      data = null
    }
    if (!res.ok || !data || data.ok === false) {
      const code = (data && (data.errorCode || data.error)) || 'SERVER_ERROR'
      throw new NetError(code, (data && data.message) || errorText(code), res.status)
    }
    return data.data
  }

  listRooms() {
    return this.http('/api/rooms')
  }

  getRoom(roomCode) {
    return this.http('/api/rooms/' + encodeURIComponent(roomCode))
  }

  createRoom({ displayName, rules, turnTimeoutSeconds } = {}) {
    return this.http('/api/rooms', { method: 'POST', body: { displayName, rules, turnTimeoutSeconds } })
  }

  joinRoom({ roomCode, displayName } = {}) {
    return this.http('/api/rooms/join', { method: 'POST', body: { roomCode, displayName } })
  }

  // ---------- 连接与重连 ----------

  /**
   * 建立连接并声明身份。
   * @param {Object} cred { roomId, playerId, resumeToken, displayName, roomCode, seatIndex }
   */
  connect(cred) {
    clearTimeout(this._leaveCloseTimer) // 撤销上一轮 leaveRoom 的延迟关闭（见 leaveRoom）
    this.roomId = cred.roomId
    this.playerId = cred.playerId
    this.resumeToken = cred.resumeToken
    this.displayName = cred.displayName || ''
    this.closed = false
    this.retry = 0
    this._open()
    return new Promise((resolve, reject) => {
      this._reconnectWaiters.push({ resolve, reject })
      // 兜底超时：10s 内没拿到 RECONNECTED 视为失败，避免按钮永久 loading
      setTimeout(() => {
        const i = this._reconnectWaiters.findIndex(w => w.reject === reject)
        if (i >= 0) {
          this._reconnectWaiters.splice(i, 1)
          reject(new NetError('SERVER_ERROR', '连接超时，请重试'))
        }
      }, 10000)
    })
  }

  _open() {
    this._closeSocket()
    this.onStatus('connecting')
    let ws
    try {
      ws = new WebSocket(buildWsUrl(this.baseUrl, this.wsPath))
    } catch (e) {
      this._scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.onStatus('open')
      this._startPing()
      this._sendRaw({
        type: 'RECONNECT',
        roomId: this.roomId,
        resumeToken: this.resumeToken,
        requestId: randomId()
      })
    }
    ws.onmessage = ev => {
      let msg = null
      try {
        msg = JSON.parse(ev.data)
      } catch (e) {
        return
      }
      this._dispatch(msg)
    }
    ws.onclose = () => {
      this._stopPing()
      if (this.closed) {
        this.onStatus('closed')
        return
      }
      this.onStatus('reconnecting')
      this._scheduleReconnect()
    }
    ws.onerror = () => {
      /* onclose 会跟着触发，重连逻辑统一在那里 */
    }
  }

  _scheduleReconnect() {
    if (this.closed || this._retryTimer) return
    const delay = Math.min(1500 * Math.pow(1.6, this.retry), 12000)
    this.retry++
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null
      if (!this.closed) this._open()
    }, delay)
  }

  _closeSocket() {
    const ws = this.ws
    this.ws = null
    if (!ws) return
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
    try {
      ws.close()
    } catch (e) {
      /* 已断开 */
    }
  }

  _startPing() {
    this._stopPing()
    this._pingTimer = setInterval(() => {
      this._sendRaw({ type: 'PING' })
    }, 20000)
  }

  _stopPing() {
    if (this._pingTimer) clearInterval(this._pingTimer)
    this._pingTimer = null
  }

  // ---------- 发送 ----------

  _sendRaw(msg) {
    if (!this.ws || this.ws.readyState !== 1) return false
    try {
      this.ws.send(JSON.stringify(msg))
      return true
    } catch (e) {
      return false
    }
  }

  isOpen() {
    return !!(this.ws && this.ws.readyState === 1)
  }

  /** 订阅服务端消息（返回取消订阅函数）；牌局适配层用它接力，不覆盖大厅订阅 */
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {}
    this._eventFns.push(fn)
    return () => {
      const i = this._eventFns.indexOf(fn)
      if (i >= 0) this._eventFns.splice(i, 1)
    }
  }

  _emit(msg) {
    // 快照后再分发：订阅者在回调里新增/取消订阅不会打乱本轮遍历
    for (const fn of this._eventFns.slice()) {
      try {
        fn(msg)
      } catch (e) {
        /* 单个订阅者异常不影响其他订阅者 */
      }
    }
  }

  /** 牌局动作：requestId 幂等，服务端最多执行一次 */
  sendAction({ gameId, windowId, action }) {
    const requestId = randomId()
    const ok = this._sendRaw({
      type: 'PLAYER_ACTION',
      requestId,
      gameId,
      windowId,
      action
    })
    return ok ? requestId : null
  }

  sendAdmin(type, payload = {}) {
    return this._sendRaw({ type, requestId: randomId(), ...payload })
  }

  /** 主动退出（永久）：作废 resumeToken */
  leaveRoom(reason = 'LEAVE_ROOM') {
    this._sendRaw({ type: 'LEAVE_ROOM', requestId: randomId(), reason })
    this.closed = true
    clearCredential()
    // 稍等 150ms 再关，确保 LEAVE_ROOM 发得出去。若这期间玩家又建房/坐下，
    // connect() 会清掉这个定时器，否则刚连上的新连接会被它顺手关掉（像点了没反应）。
    clearTimeout(this._leaveCloseTimer)
    this._leaveCloseTimer = setTimeout(() => this.close(), 150)
  }

  resync() {
    return this._sendRaw({ type: 'STATE_RESYNC' })
  }

  close() {
    this.closed = true
    if (this._retryTimer) {
      clearTimeout(this._retryTimer)
      this._retryTimer = null
    }
    this._stopPing()
    this._closeSocket()
    this.onStatus('closed')
  }

  // ---------- 接收 ----------

  _dispatch(msg) {
    if (!msg || !msg.type) return
    if (msg.type === 'PONG') return

    if (msg.type === 'RECONNECTED') {
      this.playerId = msg.playerId || this.playerId
      this._flushReconnectWaiters(null)
      this._emit(msg)
      return
    }
    if (msg.type === 'ERROR') {
      const recoverable = ['INVALID_RESUME_TOKEN', 'ROOM_NOT_FOUND', 'PLAYER_ALREADY_LEFT', 'ROOM_DESTROYED']
      const fatal = recoverable.indexOf(msg.errorCode) >= 0 && !!this.resumeToken
      if (fatal) {
        // 令牌已失效：停止自动重连，避免无意义地反复握手
        clearCredential()
        this.closed = true
        this._flushReconnectWaiters(new NetError(msg.errorCode, errorText(msg.errorCode)))
        this.onStatus('fatal')
      }
      this.onError({
        errorCode: msg.errorCode,
        message: msg.message || errorText(msg.errorCode),
        fatal,
        requestId: msg.requestId || null,
        command: msg.command || null
      })
      this._emit(msg)
      return
    }
    if (msg.type === 'ACTION_REJECTED') {
      this.onError({
        errorCode: msg.payload && msg.payload.errorCode,
        message: (msg.payload && msg.payload.message) || errorText(msg.payload && msg.payload.errorCode),
        requestId: msg.payload && msg.payload.requestId,
        action: msg.payload && msg.payload.action
      })
      return
    }
    if (msg.type === 'LEFT_ROOM') {
      this.closed = true
      clearCredential()
      this.close()
    }
    this._emit(msg)
  }

  _flushReconnectWaiters(err) {
    const waiters = this._reconnectWaiters
    this._reconnectWaiters = []
    for (const w of waiters) {
      if (err) w.reject(err)
      else w.resolve()
    }
  }
}