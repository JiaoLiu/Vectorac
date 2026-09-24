// ============================================================
// 五子棋 UI（gomoku/ui.js）
// Canvas 棋盘渲染 + 人机对战交互。
// 深色面板 + 暖色木纹棋盘；黑先白后；支持三档难度、悔棋、
// 先后手切换、战绩统计（localStorage）、WebAudio 音效。
// ============================================================

import { createBoard, checkWin, isFull, opponentOf, BLACK, WHITE, EMPTY, BOARD_SIZE } from './engine.js'
import { chooseMove, LEVEL } from './ai.js'

const STATS_KEY = 'gomoku-stats-v1'
const SETTINGS_KEY = 'gomoku-settings-v1'
const STAR_POINTS = [
  [3, 3],
  [11, 3],
  [3, 11],
  [11, 11],
  [7, 7]
]

const DIFF_NAMES = { easy: '简单', medium: '中等', hard: '困难' }

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (e) {
    return fallback
  }
}

function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch (e) {
    /* 隐私模式等场景静默失败 */
  }
}

export default class GomokuUI {
  constructor(root) {
    this.root = root
    this.canvas = root.querySelector('[data-gk-canvas]')
    this.ctx = this.canvas.getContext('2d')

    // 设置（持久化）
    this.settings = Object.assign({ level: LEVEL.MEDIUM, first: 'player', sound: true, music: true }, loadJSON(SETTINGS_KEY, {}))
    this.stats = loadJSON(STATS_KEY, {})

    // 对局状态
    this.board = createBoard()
    this.history = [] // [{x, y, color}]
    this.state = 'playing' // playing | thinking | over
    this.result = null // 'win' | 'loss' | 'draw'
    this.winLine = null
    this.hover = null
    this.anims = new Map() // "x,y" -> 落子动画起始时间戳
    this.resultRecorded = false

    this._raf = null
    this._aiTimer = null
    this._audio = null
    this._destroyed = false

    // 全屏状态（默认开启，麻将同款：CSS fixed + 根节点移挂 body）
    this._fullscreen = false
    this._reparented = false
    this._placeholder = null

    this._onPointerDown = this._handlePointerDown.bind(this)
    this._onPointerMove = this._handlePointerMove.bind(this)
    this._onPointerLeave = () => {
      this.hover = null
      this._requestDraw()
    }
    this._onResize = () => this._resize()
    this._onContextMenu = (e) => e.preventDefault()
    // 原生全屏需用户手势，首次触摸/点击时再尝试一次
    this._onFirstGesture = () => {
      if (this._fullscreen) this._tryNativeFullscreen()
      // AudioContext 与 Audio 元素均需手势解锁：resume 后背景音乐自动出声
      this._ensureAudio()
      if (this._audio && this._audio.state === 'suspended') this._audio.resume().catch(() => {})
      this._music(true)
    }
    // 页面切后台暂停背景音乐，回前台恢复
    this._onVisibility = () => {
      if (typeof document === 'undefined') return
      this._music(!document.hidden)
    }
  }

  mount() {
    this._resize()
    this.canvas.addEventListener('pointerdown', this._onPointerDown)
    this.canvas.addEventListener('pointermove', this._onPointerMove)
    this.canvas.addEventListener('pointerleave', this._onPointerLeave)
    this.canvas.addEventListener('contextmenu', this._onContextMenu)
    window.addEventListener('resize', this._onResize)
    document.addEventListener('pointerdown', this._onFirstGesture, { once: true })
    document.addEventListener('visibilitychange', this._onVisibility)
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this._onResize) : null
    if (this._ro) this._ro.observe(this.canvas.parentElement)

    this._bindControls()
    this._syncSettingsUI()
    this._renderStats()
    // 进入页面即开始游戏：默认全屏（移动端棋盘不再被主题内容容器压缩）
    this.enterFullscreen()
    this._newGame(true)
    this._music(true)
  }

  destroy() {
    this._destroyed = true
    this.exitFullscreen()
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    this.canvas.removeEventListener('pointermove', this._onPointerMove)
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave)
    this.canvas.removeEventListener('contextmenu', this._onContextMenu)
    window.removeEventListener('resize', this._onResize)
    document.removeEventListener('pointerdown', this._onFirstGesture)
    document.removeEventListener('visibilitychange', this._onVisibility)
    this._music(false)
    if (this._bgm) { this._bgm.pause(); this._bgm.removeAttribute('src'); this._bgm = null }
    if (this._ro) this._ro.disconnect()
    if (this._aiTimer) clearTimeout(this._aiTimer)
    if (this._raf) cancelAnimationFrame(this._raf)
    if (this._audio) {
      try {
        this._audio.close()
      } catch (e) {
        /* 忽略 */
      }
    }
  }

  // ---------------- 全屏沉浸模式 ----------------

  enterFullscreen() {
    if (this._fullscreen) return
    this._fullscreen = true
    // 主题容器带 transform，fixed 会被限制在其内部，临时移挂到 body 下
    if (!this._reparented && this.root.parentElement && this.root.parentElement !== document.body) {
      this._placeholder = document.createComment('gk-anchor')
      this.root.parentElement.insertBefore(this._placeholder, this.root)
      document.body.appendChild(this.root)
      this._reparented = true
    }
    this.root.classList.add('gk-fullscreen')
    if (typeof document !== 'undefined' && document.body) document.body.classList.add('gk-lock')
    this._syncFullscreenBtn()
    this._tryNativeFullscreen()
    this._resize()
  }

  exitFullscreen() {
    if (!this._fullscreen) return
    this._fullscreen = false
    if (this._reparented && this._placeholder && this._placeholder.parentElement) {
      this._placeholder.parentElement.insertBefore(this.root, this._placeholder)
      if (this._placeholder.remove) this._placeholder.remove()
    }
    this._reparented = false
    this._placeholder = null
    this.root.classList.remove('gk-fullscreen')
    if (typeof document !== 'undefined' && document.body) document.body.classList.remove('gk-lock')
    this._syncFullscreenBtn()
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        if (exit) {
          const p = exit.call(document)
          if (p && p.catch) p.catch(() => { /* 忽略 */ })
        }
      }
    } catch (e) { /* 忽略 */ }
    this._resize()
  }

  /** 触屏设备尝试原生全屏隐藏浏览器地址栏；不支持/被拒绝则仅用 CSS 全屏 */
  _tryNativeFullscreen() {
    try {
      const coarse = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches
      if (!coarse) return
      if (document.fullscreenElement || document.webkitFullscreenElement) return
      const req = this.root.requestFullscreen || this.root.webkitRequestFullscreen
      if (!req) return
      const p = req.call(this.root)
      if (p && p.catch) p.catch(() => { /* 静默，仅 CSS 全屏 */ })
    } catch (e) { /* 静默 */ }
  }

  _syncFullscreenBtn() {
    const btn = this.root.querySelector('[data-gk-fullscreen]')
    if (!btn) return
    btn.textContent = this._fullscreen ? '✕' : '⤢'
    btn.setAttribute('aria-label', this._fullscreen ? '退出全屏' : '进入全屏')
  }

  // ---------------- 布局与绘制 ----------------

  _resize() {
    const wrap = this.canvas.parentElement
    let cssW
    if (this._fullscreen) {
      // 全屏：wrap 由 flex 分配确定空间（canvas 绝对定位不撑容器），
      // 棋盘取可用宽/高中的小值；下限 200 兼容矮屏横屏，上限 900 防大屏过大
      cssW = Math.max(200, Math.min(wrap.clientWidth, wrap.clientHeight, 900))
    } else {
      // 双保险：容器宽度之外再按视口宽度上限约束，
      // 避免页面存在横向溢出时容器被撑宽、量出超过屏幕的棋盘
      const vw = document.documentElement.clientWidth || window.innerWidth || 620
      cssW = Math.max(280, Math.min(wrap.clientWidth, vw - 24, 620))
    }
    if (!cssW) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    // 尺寸未变直接跳过：布局微扰（如状态条文本变化）引起的 ResizeObserver
    // 触发不应重建木纹/重设 canvas，否则棋盘会闪一下
    if (cssW === this.size && dpr === this.dpr) return
    this.size = cssW
    this.canvas.style.width = cssW + 'px'
    this.canvas.style.height = cssW + 'px'
    this.canvas.width = Math.round(cssW * dpr)
    this.canvas.height = Math.round(cssW * dpr)
    this.dpr = dpr
    this.pad = cssW * 0.062
    this.cell = (cssW - this.pad * 2) / (BOARD_SIZE - 1)
    this.stoneR = this.cell * 0.44
    this._grain = this._makeGrain()
    this._requestDraw()
  }

  /** 生成木纹（每次 resize 重建，避免动画期间随机闪烁） */
  _makeGrain() {
    const lines = []
    for (let i = 0; i < 26; i++) {
      lines.push({
        y: this.pad * 0.6 + Math.random() * (this.size - this.pad * 1.2),
        amp: 1.5 + Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        width: 0.6 + Math.random() * 1.6,
        alpha: 0.04 + Math.random() * 0.06
      })
    }
    return lines
  }

  _requestDraw() {
    if (this._raf) return
    this._raf = requestAnimationFrame((ts) => {
      this._raf = null
      if (this._destroyed) return
      this._draw(ts)
      // 有落子动画或胜利脉冲时持续刷新
      if (this.anims.size > 0 || this.winLine) this._requestDraw()
    })
  }

  _draw(ts = performance.now()) {
    const { ctx, size, pad, cell } = this
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    // ----- 棋盘底：外框 + 木纹 -----
    const frame = ctx.createLinearGradient(0, 0, size, size)
    frame.addColorStop(0, '#8a5a2b')
    frame.addColorStop(0.5, '#6f4419')
    frame.addColorStop(1, '#54310f')
    ctx.fillStyle = frame
    this._roundRect(0, 0, size, size, size * 0.03)
    ctx.fill()

    const inset = pad * 0.55
    const wood = ctx.createLinearGradient(inset, inset, size - inset, size - inset)
    wood.addColorStop(0, '#f0c98c')
    wood.addColorStop(0.5, '#e2af6a')
    wood.addColorStop(1, '#d29a52')
    ctx.fillStyle = wood
    this._roundRect(inset, inset, size - inset * 2, size - inset * 2, size * 0.02)
    ctx.fill()

    // 木纹
    ctx.save()
    this._roundRect(inset, inset, size - inset * 2, size - inset * 2, size * 0.02)
    ctx.clip()
    for (const g of this._grain) {
      ctx.beginPath()
      ctx.strokeStyle = `rgba(120, 70, 20, ${g.alpha})`
      ctx.lineWidth = g.width
      for (let x = inset; x <= size - inset; x += 6) {
        const y = g.y + Math.sin(x / 60 + g.phase) * g.amp
        if (x === inset) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()

    // ----- 网格线 -----
    ctx.strokeStyle = 'rgba(58, 34, 8, 0.78)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < BOARD_SIZE; i++) {
      const p = pad + i * cell
      ctx.moveTo(pad, p)
      ctx.lineTo(size - pad, p)
      ctx.moveTo(p, pad)
      ctx.lineTo(p, size - pad)
    }
    ctx.stroke()

    // 边框加粗
    ctx.strokeStyle = 'rgba(58, 34, 8, 0.95)'
    ctx.lineWidth = 2
    ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2)

    // ----- 星位 -----
    ctx.fillStyle = 'rgba(58, 34, 8, 0.9)'
    for (const [sx, sy] of STAR_POINTS) {
      ctx.beginPath()
      ctx.arc(pad + sx * cell, pad + sy * cell, Math.max(3, cell * 0.1), 0, Math.PI * 2)
      ctx.fill()
    }

    // ----- 悬停预览 -----
    if (this.hover && this.state === 'playing' && this.board[this.hover.y][this.hover.x] === EMPTY) {
      this._drawStone(this.hover.x, this.hover.y, this.playerColor, 0.35, 1)
    }

    // ----- 棋子 -----
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const v = this.board[y][x]
        if (v === EMPTY) continue
        let scale = 1
        const animStart = this.anims.get(y * BOARD_SIZE + x)
        if (animStart !== undefined) {
          const t = Math.min((ts - animStart) / 160, 1)
          if (t >= 1) {
            this.anims.delete(y * BOARD_SIZE + x)
          } else {
            // easeOutBack：轻微回弹
            const c1 = 1.70158
            const c3 = c1 + 1
            scale = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
            scale = Math.max(scale, 0.05)
          }
        }
        this._drawStone(x, y, v, 1, scale)
      }
    }

    // ----- 最后一手标记 -----
    if (this.history.length) {
      const last = this.history[this.history.length - 1]
      const cx = pad + last.x * cell
      const cy = pad + last.y * cell
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(2.5, cell * 0.09), 0, Math.PI * 2)
      ctx.fillStyle = '#ff4d2d'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.stroke()
    }

    // ----- 胜利连线 + 脉冲 -----
    if (this.winLine) {
      const first = this.winLine[0]
      const lastPt = this.winLine[this.winLine.length - 1]
      const x1 = pad + first[0] * cell
      const y1 = pad + first[1] * cell
      const x2 = pad + lastPt[0] * cell
      const y2 = pad + lastPt[1] * cell
      const pulse = 0.5 + 0.5 * Math.sin(ts / 260)

      ctx.save()
      ctx.lineCap = 'round'
      ctx.strokeStyle = `rgba(255, 77, 45, ${0.55 + 0.35 * pulse})`
      ctx.lineWidth = Math.max(3, cell * 0.12)
      ctx.shadowColor = 'rgba(255, 77, 45, 0.8)'
      ctx.shadowBlur = 12 + 8 * pulse
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.restore()

      for (const [wx, wy] of this.winLine) {
        ctx.beginPath()
        ctx.arc(pad + wx * cell, pad + wy * cell, this.stoneR * (1.12 + 0.1 * pulse), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255, 120, 60, ${0.35 + 0.4 * pulse})`
        ctx.lineWidth = 2.5
        ctx.stroke()
      }
    }
  }

  _drawStone(x, y, color, alpha, scale) {
    const { ctx, pad, cell, stoneR } = this
    const cx = pad + x * cell
    const cy = pad + y * cell
    const r = stoneR * scale
    if (r <= 0) return

    ctx.save()
    ctx.globalAlpha = alpha
    // 投影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
    ctx.shadowBlur = r * 0.35
    ctx.shadowOffsetY = r * 0.14

    const grad = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r)
    if (color === BLACK) {
      grad.addColorStop(0, '#777')
      grad.addColorStop(0.35, '#333')
      grad.addColorStop(1, '#000')
    } else {
      grad.addColorStop(0, '#fff')
      grad.addColorStop(0.6, '#efefef')
      grad.addColorStop(1, '#c6c6c6')
    }
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    if (color === WHITE) {
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }
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

  // ---------------- 交互 ----------------

  _eventToGrid(e) {
    const rect = this.canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const gx = Math.round((px - this.pad) / this.cell)
    const gy = Math.round((py - this.pad) / this.cell)
    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE) return null
    const cx = this.pad + gx * this.cell
    const cy = this.pad + gy * this.cell
    if (Math.hypot(px - cx, py - cy) > this.cell * 0.5) return null
    return { x: gx, y: gy }
  }

  _handlePointerMove(e) {
    if (e.pointerType === 'touch') return
    this.hover = this._eventToGrid(e)
    this._requestDraw()
  }

  _handlePointerDown(e) {
    e.preventDefault()
    this._ensureAudio()
    if (this.state !== 'playing') return
    const g = this._eventToGrid(e)
    if (!g || this.board[g.y][g.x] !== EMPTY) return
    this._placeStone(g.x, g.y, this.playerColor)
    if (this._afterMove(g.x, g.y, this.playerColor)) return
    this._scheduleAI()
  }

  _placeStone(x, y, color) {
    this.board[y][x] = color
    this.history.push({ x, y, color })
    this.anims.set(y * BOARD_SIZE + x, performance.now())
    this._playStoneSound(color)
    this._updateMoveCount()
    this._requestDraw()
  }

  /** 落子后检查终局。返回 true 表示对局已结束 */
  _afterMove(x, y, color) {
    const line = checkWin(this.board, x, y)
    if (line) {
      this._finish(color === this.playerColor ? 'win' : 'loss', line)
      return true
    }
    if (isFull(this.board)) {
      this._finish('draw', null)
      return true
    }
    return false
  }

  _scheduleAI() {
    this.state = 'thinking'
    this._setStatus('thinking')
    this._syncButtons()
    //  artificial 思考时间，避免「秒下」的廉价感
    const delay = 420 + Math.random() * 480
    this._aiTimer = setTimeout(() => {
      if (this._destroyed) return
      const move = chooseMove(this.board, this.aiColor, this.settings.level)
      if (!move) return
      this._placeStone(move.x, move.y, this.aiColor)
      if (this._afterMove(move.x, move.y, this.aiColor)) return
      this.state = 'playing'
      this._setStatus('playing')
      this._syncButtons()
    }, delay)
  }

  _finish(result, line) {
    this.state = 'over'
    this.result = result
    this.winLine = line
    this._setStatus('over')
    this._syncButtons()
    this._recordStats(result)
    if (result === 'win') this._playMelody([523, 659, 784], 0.14, 0.12)
    else if (result === 'loss') this._playMelody([330, 247], 0.18, 0.14)
    else this._playMelody([392], 0.2, 0.1)
    this._requestDraw()
    this._showResultOverlay(result)
  }

  _newGame(triggerAI = true) {
    if (this._aiTimer) {
      clearTimeout(this._aiTimer)
      this._aiTimer = null
    }
    this.board = createBoard()
    this.history = []
    this.state = 'playing'
    this.result = null
    this.winLine = null
    this.hover = null
    this.anims.clear()
    this.resultRecorded = false
    this.playerColor = this.settings.first === 'player' ? BLACK : WHITE
    this.aiColor = opponentOf(this.playerColor)
    this._hideResultOverlay()
    this._updateMoveCount()
    this._setStatus('playing')
    this._syncButtons()
    this._requestDraw()
    if (triggerAI && this.aiColor === BLACK) this._scheduleAI()
  }

  _undo() {
    if (this.state === 'thinking') return
    // 至少要有玩家的一手才值得悔
    if (!this.history.some((m) => m.color === this.playerColor)) return
    if (this._aiTimer) {
      clearTimeout(this._aiTimer)
      this._aiTimer = null
    }
    // 终局后反悔：先回滚已记战绩，避免重复计数
    if (this.result && this.resultRecorded) this._rollbackStats()
    this.state = 'playing'
    this.result = null
    this.winLine = null
    this.resultRecorded = false
    this.resultLevel = null
    this._hideResultOverlay()

    // 先弹出 AI 的收尾手，再弹出玩家最后一手
    while (this.history.length && this.history[this.history.length - 1].color !== this.playerColor) {
      const m = this.history.pop()
      this.board[m.y][m.x] = EMPTY
    }
    if (this.history.length) {
      const m = this.history.pop()
      this.board[m.y][m.x] = EMPTY
    }
    this.anims.clear()
    this._updateMoveCount()
    this._setStatus('playing')
    this._syncButtons()
    this._requestDraw()

    // 悔完轮到 AI（例如 AI 执黑开局被悔掉）则让 AI 补一手
    const nextColor = this.history.length ? opponentOf(this.history[this.history.length - 1].color) : BLACK
    if (nextColor === this.aiColor) this._scheduleAI()
  }

  // ---------------- 控件绑定与状态同步 ----------------

  _bindControls() {
    this.root.querySelectorAll('[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.level = btn.dataset.diff
        saveJSON(SETTINGS_KEY, this.settings)
        this._syncSettingsUI()
        this._renderStats()
      })
    })
    this.root.querySelectorAll('[data-first]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.settings.first === btn.dataset.first) return
        this.settings.first = btn.dataset.first
        saveJSON(SETTINGS_KEY, this.settings)
        this._syncSettingsUI()
        this._newGame(true)
      })
    })
    this.root.querySelector('[data-gk-undo]').addEventListener('click', () => this._undo())
    this.root.querySelector('[data-gk-restart]').addEventListener('click', () => this._newGame(true))
    this.root.querySelector('[data-gk-sound]').addEventListener('click', () => {
      this.settings.sound = !this.settings.sound
      saveJSON(SETTINGS_KEY, this.settings)
      this._syncSettingsUI()
      if (this.settings.sound) {
        this._ensureAudio()
        this._playMelody([660], 0.08, 0.1)
      }
    })
    this.root.querySelector('[data-gk-music]').addEventListener('click', () => {
      this.settings.music = !this.settings.music
      saveJSON(SETTINGS_KEY, this.settings)
      this._syncSettingsUI()
      this._music(this.settings.music)
    })
    this.root.querySelector('[data-gk-again]').addEventListener('click', () => this._newGame(true))
    this.root.querySelector('[data-gk-view]').addEventListener('click', () => this._hideResultOverlay())
    this.root.querySelector('[data-gk-fullscreen]').addEventListener('click', () => {
      if (this._fullscreen) this.exitFullscreen()
      else this.enterFullscreen()
    })
  }

  _syncSettingsUI() {
    this.root.querySelectorAll('[data-diff]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.diff === this.settings.level)
    })
    this.root.querySelectorAll('[data-first]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.first === this.settings.first)
    })
    const soundBtn = this.root.querySelector('[data-gk-sound]')
    soundBtn.classList.toggle('muted', !this.settings.sound)
    soundBtn.textContent = this.settings.sound ? '🔊' : '🔇'
    soundBtn.setAttribute('aria-label', this.settings.sound ? '关闭音效' : '打开音效')
    const musicBtn = this.root.querySelector('[data-gk-music]')
    musicBtn.classList.toggle('muted', !this.settings.music)
    musicBtn.setAttribute('aria-label', this.settings.music ? '关闭背景音乐' : '打开背景音乐')
  }

  _syncButtons() {
    const undoBtn = this.root.querySelector('[data-gk-undo]')
    undoBtn.disabled = this.state === 'thinking' || !this.history.some((m) => m.color === this.playerColor)
  }

  _setStatus(kind) {
    const pill = this.root.querySelector('[data-gk-status]')
    const dot = this.root.querySelector('[data-gk-turn-dot]')
    pill.classList.remove('is-thinking', 'is-over')
    let text = ''
    if (kind === 'thinking') {
      text = 'AI 思考中'
      pill.classList.add('is-thinking')
      dot.className = 'gk-dot ' + (this.aiColor === BLACK ? 'gk-dot-black' : 'gk-dot-white')
    } else if (kind === 'over') {
      pill.classList.add('is-over')
      if (this.result === 'win') text = '🎉 你赢了'
      else if (this.result === 'loss') text = 'AI 获胜'
      else text = '平局'
      dot.className = 'gk-dot'
    } else {
      text = this.playerColor === BLACK ? '轮到你落子' : '轮到你了'
      dot.className = 'gk-dot ' + (this.playerColor === BLACK ? 'gk-dot-black' : 'gk-dot-white')
    }
    pill.querySelector('[data-gk-status-text]').textContent = text
  }

  _updateMoveCount() {
    this.root.querySelector('[data-gk-moves]').textContent = `第 ${this.history.length} 手`
  }

  // ---------------- 战绩 ----------------

  _recordStats(result) {
    if (this.resultRecorded) return
    this.resultRecorded = true
    this.resultLevel = this.settings.level
    const lv = this.settings.level
    if (!this.stats[lv]) this.stats[lv] = { w: 0, l: 0, d: 0 }
    if (result === 'win') this.stats[lv].w++
    else if (result === 'loss') this.stats[lv].l++
    else this.stats[lv].d++
    saveJSON(STATS_KEY, this.stats)
    this._renderStats()
  }

  _rollbackStats() {
    const lv = this.resultLevel || this.settings.level
    const s = this.stats[lv]
    if (!s) return
    if (this.result === 'win' && s.w > 0) s.w--
    else if (this.result === 'loss' && s.l > 0) s.l--
    else if (this.result === 'draw' && s.d > 0) s.d--
    saveJSON(STATS_KEY, this.stats)
    this._renderStats()
  }

  _renderStats() {
    const lv = this.settings.level
    const s = this.stats[lv] || { w: 0, l: 0, d: 0 }
    this.root.querySelector('[data-gk-win]').textContent = s.w
    this.root.querySelector('[data-gk-loss]').textContent = s.l
    this.root.querySelector('[data-gk-draw]').textContent = s.d
    this.root.querySelector('[data-gk-stats-level]').textContent = DIFF_NAMES[lv]
  }

  // ---------------- 结算浮层 ----------------

  _showResultOverlay(result) {
    const overlay = this.root.querySelector('[data-gk-result]')
    const title = overlay.querySelector('[data-gk-result-title]')
    const sub = overlay.querySelector('[data-gk-result-sub]')
    if (result === 'win') {
      title.textContent = '🎉 你赢了！'
      title.className = 'gk-result-title is-win'
    } else if (result === 'loss') {
      title.textContent = 'AI 获胜'
      title.className = 'gk-result-title is-loss'
    } else {
      title.textContent = '平局'
      title.className = 'gk-result-title is-draw'
    }
    sub.textContent = `${DIFF_NAMES[this.settings.level]}难度 · 共 ${this.history.length} 手`
    overlay.hidden = false
    requestAnimationFrame(() => overlay.classList.add('show'))
  }

  _hideResultOverlay() {
    const overlay = this.root.querySelector('[data-gk-result]')
    overlay.classList.remove('show')
    overlay.hidden = true
  }

  // ---------------- 音效 ----------------

  _ensureAudio() {
    if (this._audio || typeof AudioContext === 'undefined') return
    try {
      this._audio = new AudioContext()
    } catch (e) {
      /* 不支持则静默 */
    }
  }

  _tone(freq, startDelay, duration, volume) {
    if (!this._audio || !this.settings.sound) return
    const ctx = this._audio
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = freq
    const t0 = ctx.currentTime + startDelay
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + duration + 0.05)
  }

  _playStoneSound(color) {
    this._tone(color === BLACK ? 620 : 460, 0, 0.09, 0.18)
  }

  _playMelody(freqs, noteLen, volume) {
    freqs.forEach((f, i) => this._tone(f, i * noteLen * 1.1, noteLen, volume))
  }

  // ---------------- 背景音乐（禅意循环） ----------------

  _padTone(freq, duration, volume) {
    const ctx = this._audio
    if (!ctx || ctx.state === 'closed') return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t0 = ctx.currentTime
    gain.setValueAtTime(0.0001, t0)
    gain.exponentialRampToValueAtTime(volume, t0 + 0.3)
    gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + duration + 0.05)
  }

  /** 背景音乐：优先音乐文件循环（Meditation Impromptu 01 · Kevin MacLeod, CC-BY 4.0），
   *  文件缺失时回退 Web Audio 合成（C 宫五声音阶稀疏长音 + 低音 pad） */
  _music(active) {
    clearInterval(this._musicTimer)
    this._musicTimer = null
    if (this._bgm) this._bgm.pause()
    if (!active || this.settings.music === false) return
    if (typeof document !== 'undefined' && document.hidden) return
    if (!this._bgmFailed) {
      if (!this._bgm) {
        try {
          const a = new Audio('/audio/gomoku/bgm.mp3')
          a.loop = true
          a.volume = 0.5
          a.addEventListener('error', () => { this._bgmFailed = true; this._bgm = null; this._music(true) })
          this._bgm = a
        } catch (e) {
          this._bgmFailed = true
        }
      }
      if (this._bgm) {
        const p = this._bgm.play()
        if (p && p.catch) p.catch(() => {})
        return
      }
    }
    this._ensureAudio()
    if (!this._audio) return
    const scale = [261.63, 293.66, 329.63, 392, 440] // C D E G A
    const melody = [0, 0, 5, 0, 0, 3, 0, 0, 4, 0, 0, 0, 2, 0, 3, 0] // 16 步，0=休止
    let step = this._musicStep || 0
    const tick = () => {
      if (!this._audio || this._audio.state !== 'running') return
      const n = melody[step % 16]
      if (n) this._padTone(scale[n - 1] * 2, 1.8, 0.045)
      if (step % 16 === 0) this._padTone(scale[0] / 2, 3.6, 0.05)
      step++
      this._musicStep = step
    }
    tick()
    this._musicTimer = setInterval(tick, 500)
  }
}
