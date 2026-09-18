// ============================================================
// 联机服务入口（mahjong-service/server.js）
// ------------------------------------------------------------
// 分工（文档 §47）：
//   HTTP  → 创建房间 / 加入房间 / 房间列表 / 统计（无需长连接的一次性动作）
//   WS    → 重连绑定、房间实时同步、管理员命令、游戏 Action、连接状态
//
// 服务端权威：所有 GameState 修改都经 Room 的串行队列 → 引擎裁决，
// 客户端只发送意图，接收「自己视角」的视图（文档 §44）。
// ============================================================

import http from 'node:http'
import express from 'express'
import { WebSocketServer } from 'ws'
import { config } from './config.js'
import { ERR, fail, toErrorPayload } from './errors.js'
import { AiService } from './rooms/ai-jobs.js'
import { Hub } from './rooms/hub.js'
import { PlayerSessionManager } from './rooms/sessions.js'
import { RoomManager, normalizeRoomCode } from './rooms/room-manager.js'
import { ROOM_STATUS } from './rooms/seat.js'

/** 结构化日志（文档 §52）：一行一条 JSON，字段固定便于检索 */
function createLogger(minLevel = 'info') {
  const order = { debug: 10, info: 20, warn: 30, error: 40 }
  const floor = order[minLevel] || 20
  return (event, fields = {}, level = 'info') => {
    if ((order[level] || 20) < floor) return
    const line = { ts: new Date().toISOString(), level, event, ...fields }
    const text = JSON.stringify(line)
    if (level === 'error') console.error(text)
    else console.log(text)
  }
}

export function createServer({ logger } = {}) {
  const log = logger || createLogger(process.env.LOG_LEVEL || 'info')
  const sessions = new PlayerSessionManager()
  const hub = new Hub({ logger: (e, f) => log(e, f, 'debug') })
  const aiService = new AiService({
    maxConcurrency: config.aiMaxConcurrency,
    level: config.aiLevel,
    decisionTimeoutMs: config.aiDecisionTimeoutMs,
    logger: (e, f) => log(e, f, 'warn')
  })
  const manager = new RoomManager({ sessions, hub, aiService, logger: log })

  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '64kb' }))
  // 生产环境为同源（nginx 反代）；开放 CORS 便于本地联调（无 Cookie 凭据）
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, data: { activeRooms: manager.size, uptimeSeconds: Math.floor(process.uptime()) } })
  })

  // 房间列表（大厅）
  app.get('/api/rooms', (req, res) => {
    res.json({
      ok: true,
      data: {
        rooms: manager.listRooms(),
        activeRooms: manager.size,
        maxRooms: config.maxRooms
      }
    })
  })

  // 创建房间（创建者 = Seat0 + 第一任管理员）
  app.post('/api/rooms', async (req, res) => {
    try {
      const { displayName, rules } = req.body || {}
      const { summary, player } = manager.createRoom({ displayName, rules })
      res.json({ ok: true, data: { room: summary, player } })
    } catch (err) {
      sendHttpError(res, err, log, 'create-room')
    }
  })

  // 加入房间（房号加入）
  app.post('/api/rooms/join', async (req, res) => {
    try {
      const { roomCode, displayName } = req.body || {}
      const { summary, player } = await manager.joinRoom({ roomCode, displayName })
      res.json({ ok: true, data: { room: summary, player } })
    } catch (err) {
      sendHttpError(res, err, log, 'join-room')
    }
  })

  // 按房号查看房间（等待室直接刷新 / 邀请链接进入）
  app.get('/api/rooms/:roomCode', (req, res) => {
    const room = manager.getRoomByCode(normalizeRoomCode(req.params.roomCode))
    if (!room || room.status === ROOM_STATUS.DESTROYED) {
      return res.status(404).json({ ok: false, errorCode: ERR.ROOM_NOT_FOUND, message: '房间不存在' })
    }
    res.json({ ok: true, data: { room: room.summary() } })
  })

  // 管理统计接口（文档 §55）：必须带 ADMIN_TOKEN
  app.get('/api/game-stats', (req, res) => {
    const token = req.get('X-Admin-Token') || req.query.token
    if (!config.adminToken || token !== config.adminToken) {
      return res.status(403).json({ ok: false, errorCode: ERR.FORBIDDEN, message: '无权限' })
    }
    res.json({ ok: true, data: manager.stats() })
  })

  app.use((req, res) => {
    res.status(404).json({ ok: false, errorCode: ERR.ROOM_NOT_FOUND, message: '接口不存在' })
  })

  const server = http.createServer(app)
  const wss = new WebSocketServer({ server, path: config.wsPath })

  // ---------------- WebSocket ----------------

  wss.on('connection', (ws, req) => {
    ws.isAlive = true
    ws.bound = false
    log('ws-open', { ip: req.socket.remoteAddress })

    ws.on('pong', () => {
      ws.isAlive = true
    })
    ws.on('message', raw => {
      onMessage(ws, raw).catch(err => {
        safeSend(ws, { type: 'ERROR', ...toErrorPayload(err) })
      })
    })
    ws.on('close', () => {
      onClose(ws).catch(err => log('ws-close-error', { message: String(err && err.message) }, 'error'))
    })
    ws.on('error', err => {
      log('ws-error', { message: String(err && err.message) }, 'warn')
    })
  })

  // 心跳：清理半死连接（手机切后台/网络中断时 close 事件可能永远不来）
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate()
        continue
      }
      ws.isAlive = false
      try {
        ws.ping()
      } catch (_) {
        /* 已断开 */
      }
    }
  }, 30000)
  if (heartbeat.unref) heartbeat.unref()

  /**
   * 绑定校验：任何房间内消息都必须来自已 RECONNECT 的连接。
   * 返回 { playerId, room } 或抛错。
   */
  function requireBound(ws) {
    if (!ws.bound || !ws.playerId) fail(ERR.INVALID_RESUME_TOKEN, '连接未绑定玩家')
    const room = manager.getRoom(ws.roomId)
    if (!room || room.status === ROOM_STATUS.DESTROYED) fail(ERR.ROOM_DESTROYED)
    return { playerId: ws.playerId, room }
  }

  async function onMessage(ws, raw) {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch (_) {
      return safeSend(ws, { type: 'ERROR', errorCode: ERR.INVALID_ACTION, message: '消息不是合法 JSON' })
    }
    if (!msg || !msg.type) {
      return safeSend(ws, { type: 'ERROR', errorCode: ERR.INVALID_ACTION, message: '缺少 type' })
    }

    switch (msg.type) {
      case 'PING':
        return safeSend(ws, { type: 'PONG', serverTime: Date.now() })

      case 'RECONNECT':
        return handleReconnect(ws, msg)

      case 'PLAYER_ACTION':
        return handlePlayerAction(ws, msg)

      case 'STATE_RESYNC':
        return handleResync(ws)

      case 'ADD_AI':
        return handleAdminCommand(ws, msg, 'ADD_AI')
      case 'REMOVE_AI':
        return handleAdminCommand(ws, msg, 'REMOVE_AI')
      case 'UPDATE_RULES':
        return handleAdminCommand(ws, msg, 'UPDATE_RULES')
      case 'START_GAME':
        return handleAdminCommand(ws, msg, 'START_GAME')

      case 'LEAVE_ROOM':
        return handleLeave(ws, msg)

      default:
        return safeSend(ws, {
          type: 'ERROR',
          errorCode: ERR.INVALID_ACTION,
          message: '未知消息类型：' + msg.type,
          requestId: msg.requestId || null
        })
    }
  }

  // ---- RECONNECT（文档 §42 / §43）----
  async function handleReconnect(ws, msg) {
    const { resumeToken, roomId, requestId } = msg
    const { session, room } = manager.resolveReconnect(resumeToken)
    if (roomId && roomId !== room.roomId) {
      return safeSend(ws, { type: 'ERROR', errorCode: ERR.INVALID_RESUME_TOKEN, message: '房间与令牌不匹配', requestId })
    }

    // 单 Socket 替换：新连接生效，旧连接立即失效
    const old = hub.register(session.playerId, room.roomId, session.seatIndex, ws)
    ws.bound = true
    if (old) {
      try {
        old.close(4001, 'replaced-by-new-connection')
      } catch (_) {
        /* 已断开 */
      }
    }

    await room.reconnect({ playerId: session.playerId })

    // 完整同步：先房间快照，再「自己视角」的牌局视图（文档 §43）
    hub.pushRoomSnapshot(room, session.playerId)
    if (room.status === ROOM_STATUS.PLAYING && room.gameSession) {
      hub.pushGameState(room, room.gameSession)
      hub.send(session.playerId, room, 'ACTION_WINDOW_OPENED', {
        windowId: room.gameSession.window ? room.gameSession.window.windowId : null,
        type: room.gameSession.window ? room.gameSession.window.type : null,
        eligibleSeats: room.gameSession.window ? room.gameSession.window.eligibleSeats : [],
        deadlineAt: room.gameSession.window ? room.gameSession.window.deadlineAt : null,
        legalActionsBySeat: room.gameSession.window ? room.gameSession.window.legalActionsBySeat : {}
      })
    }
    log('ws-reconnect', {
      roomId: room.roomId,
      roomCode: room.roomCode,
      seatIndex: session.seatIndex,
      roomStatus: room.status
    })
    return safeSend(ws, {
      type: 'RECONNECTED',
      roomId: room.roomId,
      roomCode: room.roomCode,
      seatIndex: session.seatIndex,
      playerId: session.playerId,
      requestId: requestId || null,
      serverTime: Date.now()
    })
  }

  // ---- PLAYER_ACTION（文档 §32 / §33 / §34）----
  async function handlePlayerAction(ws, msg) {
    const { playerId, room } = requireBound(ws)
    const { requestId, gameId, windowId, action } = msg
    try {
      const res = await room.handleAction({ playerId, requestId, gameId, windowId, action })
      hub.send(playerId, room, 'ACTION_ACCEPTED', { requestId: requestId || null, duplicate: !!res.duplicate })
    } catch (err) {
      const payload = toErrorPayload(err)
      log('action-rejected', {
        roomId: room.roomId,
        seatIndex: ws.seatIndex,
        requestId: requestId || null,
        errorCode: payload.errorCode
      }, 'warn')
      safeSend(ws, {
        ...hub.envelope(room, 'ACTION_REJECTED', {
          requestId: requestId || null,
          errorCode: payload.errorCode,
          message: payload.message,
          action: action ? action.type : null
        })
      })
    }
  }

  // ---- 断线重连后的手动全量同步 ----
  async function handleResync(ws) {
    const { playerId, room } = requireBound(ws)
    hub.pushRoomSnapshot(room, playerId)
    if (room.status === ROOM_STATUS.PLAYING && room.gameSession) {
      hub.pushGameState(room, room.gameSession)
    }
  }

  // ---- 管理员命令 ----
  async function handleAdminCommand(ws, msg, kind) {
    const { playerId, room } = requireBound(ws)
    try {
      if (kind === 'ADD_AI') await room.addAi(playerId, msg.seatIndex)
      else if (kind === 'REMOVE_AI') await room.removeAi(playerId, msg.seatIndex)
      else if (kind === 'UPDATE_RULES') await room.updateRules(playerId, msg.rules)
      else if (kind === 'START_GAME') await room.startGame(playerId)
    } catch (err) {
      const payload = toErrorPayload(err)
      log('admin-command-rejected', {
        roomId: room.roomId,
        seatIndex: ws.seatIndex,
        command: kind,
        errorCode: payload.errorCode
      }, 'warn')
      safeSend(ws, {
        ...hub.envelope(room, 'ERROR', {}),
        requestId: msg.requestId || null,
        command: kind,
        errorCode: payload.errorCode,
        message: payload.message
      })
    }
  }

  // ---- 主动退出（文档 §12 / §13 / §14 / §16）----
  async function handleLeave(ws, msg) {
    if (!ws.bound || !ws.playerId) return
    const playerId = ws.playerId
    const room = manager.getRoom(ws.roomId)
    if (room && room.status !== ROOM_STATUS.DESTROYED) {
      await room.leave(playerId, msg.reason || 'LEAVE_ROOM')
      safeSend(ws, hub.envelope(room, 'LEFT_ROOM', { requestId: msg.requestId || null }))
    }
    hub.unregister(playerId, ws)
    ws.bound = false
    try {
      ws.close(1000, 'left-room')
    } catch (_) {
      /* 已断开 */
    }
  }

  // ---- 连接关闭 = DISCONNECT（文档 §12 / §17 绝不当成 LEAVE）----
  async function onClose(ws) {
    if (!ws.bound || !ws.playerId) return
    const playerId = ws.playerId
    // 已经被新连接顶替的旧 socket：unregister 会返回 false，不能把新连接标成断线
    if (!hub.unregister(playerId, ws)) return
    const room = manager.getRoom(ws.roomId)
    if (!room || room.status === ROOM_STATUS.DESTROYED) return
    await room.disconnect(playerId, 'SOCKET_CLOSED')
  }

  function safeSend(ws, msg) {
    if (!ws || ws.readyState !== 1) return false
    try {
      ws.send(JSON.stringify(msg))
      return true
    } catch (_) {
      return false
    }
  }

  function sendHttpError(res, err, logger, event) {
    const payload = toErrorPayload(err)
    const status = err && err.status ? err.status : 500
    if (status >= 500) logger(event + '-error', { message: String(err && err.message) }, 'error')
    else logger(event + '-rejected', { errorCode: payload.errorCode }, 'warn')
    res.status(status).json({ ok: false, ...payload })
  }

  manager.startSweeper()

  async function close() {
    manager.stopSweeper()
    clearInterval(heartbeat)
    manager.destroyAll('SERVER_SHUTDOWN')
    await new Promise(resolve => wss.close(resolve))
    await new Promise(resolve => server.close(resolve))
  }

  return { app, server, wss, manager, hub, sessions, aiService, config, logger: log, close }
}

// 直接运行（node server.js）时监听端口；被 import（测试）时不自动启动
const isMain = process.argv[1] && import.meta.url === 'file://' + process.argv[1]
if (isMain) {
  const { server, manager, logger, close } = createServer()
  server.listen(config.port, config.host, () => {
    logger('server-listening', {
      host: config.host,
      port: config.port,
      wsPath: config.wsPath,
      maxRooms: config.maxRooms
    })
  })
  let closing = false
  const shutdown = async signal => {
    if (closing) return
    closing = true
    logger('server-shutdown', { signal, activeRooms: manager.size })
    try {
      await close()
      process.exit(0)
    } catch (e) {
      logger('server-shutdown-error', { message: String(e && e.message) }, 'error')
      process.exit(1)
    }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}