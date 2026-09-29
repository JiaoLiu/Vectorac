import {
  RED, BLACK, PIECE_LABELS, createInitialBoard, cloneBoard, getLegalMoves,
  getMovesFrom, applyMove, isInCheck, findGeneral, resultForSideToMove,
  otherSide, chooseMove
} from './engine.mjs'

const SIDE_LABEL = { red: '红方', black: '黑方' }
const FILE_X = (x) => 38 + x * 58
const RANK_Y = (y) => 42 + y * 59.4

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
}

export default class XiangqiUI {
  constructor(root) {
    this.root = root
    this.board = createInitialBoard()
    this.playerSide = RED
    this.currentSide = RED
    this.difficulty = 'medium'
    this.selected = null
    this.legalFrom = []
    this.hintMove = null
    this.lastMove = null
    this.history = []
    this.animatingMove = null
    this.captureAnimation = null
    this.phase = 'playing'
    this.winner = null
    this.thinking = false
    this._aiTimer = null
    this._placeholder = null
    this._expanded = false
    this._destroyed = false
    this.musicEnabled = false
    this.soundEnabled = true
    this.audioContext = null
    this.bgm = null
    if (typeof document !== 'undefined') document.body.classList.add('xq-page-active')
    this.boardEl = root.querySelector('[data-xq-board]')
    this.statusEl = root.querySelector('[data-xq-status]')
    this.moveCountEl = root.querySelector('[data-xq-move-count]')
    this.historyEl = root.querySelector('[data-xq-history]')
    this.resultEl = root.querySelector('[data-xq-result]')
    this.resultTitleEl = root.querySelector('[data-xq-result-title]')
    this.resultTextEl = root.querySelector('[data-xq-result-text]')
    this.onClick = this._onClick.bind(this)
    this.onKeyDown = this._onKeyDown.bind(this)
    root.addEventListener('click', this.onClick)
    root.addEventListener('keydown', this.onKeyDown)
    this.render()
  }

  _onClick(event) {
    const target = event.target.closest && event.target.closest('button, [data-xq-square]')
    if (!target || !this.root.contains(target)) return
    this.prepareAudio()

    if (target.matches('[data-xq-side]')) {
      if (this.playerSide !== target.dataset.xqSide) {
        this.playerSide = target.dataset.xqSide
        this.newGame()
      }
      return
    }
    if (target.matches('[data-xq-level]')) {
      this.difficulty = target.dataset.xqLevel
      this.root.querySelectorAll('[data-xq-level]').forEach((button) => button.classList.toggle('is-active', button === target))
      return
    }
    if (target.matches('[data-xq-new]') || target.matches('[data-xq-again]')) {
      this.newGame()
      return
    }
    if (target.matches('[data-xq-undo]')) {
      this.undo()
      return
    }
    if (target.matches('[data-xq-hint]')) {
      this.showHint()
      return
    }
    if (target.matches('[data-xq-fullscreen]')) {
      this.toggleExpanded()
      return
    }
    if (target.matches('[data-xq-music]')) {
      this.toggleMusic()
      return
    }
    if (target.matches('[data-xq-sound]')) {
      this.soundEnabled = !this.soundEnabled
      this.syncAudioControls()
      return
    }
    if (target.matches('[data-xq-result-close]')) {
      this.resultEl.hidden = true
      return
    }
    if (target.matches('[data-xq-square]')) {
      this.chooseSquare(Number(target.dataset.x), Number(target.dataset.y))
    }
  }

  _onKeyDown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.target.closest && event.target.closest('button')) return
    const square = event.target.closest && event.target.closest('[data-xq-square]')
    if (!square) return
    event.preventDefault()
    this.chooseSquare(Number(square.dataset.x), Number(square.dataset.y))
  }

  prepareAudio() {
    if (this.audioContext || typeof window === 'undefined') return this.audioContext
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return null
    try { this.audioContext = new AudioContext() } catch (e) { this.audioContext = null }
    if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {})
    return this.audioContext
  }

  playMoveSound(capture) {
    if (!this.soundEnabled) return
    const context = this.prepareAudio()
    if (!context) return
    const now = context.currentTime
    try {
      const tone = context.createOscillator()
      const toneGain = context.createGain()
      tone.type = 'sine'
      tone.frequency.setValueAtTime(capture ? 250 : 340, now)
      tone.frequency.exponentialRampToValueAtTime(capture ? 145 : 175, now + 0.085)
      toneGain.gain.setValueAtTime(0.0001, now)
      toneGain.gain.exponentialRampToValueAtTime(capture ? 0.16 : 0.11, now + 0.004)
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
      tone.connect(toneGain).connect(context.destination)
      tone.start(now)
      tone.stop(now + 0.13)

      const length = Math.max(1, Math.floor(context.sampleRate * 0.075))
      const buffer = context.createBuffer(1, length, context.sampleRate)
      const samples = buffer.getChannelData(0)
      for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length)
      const noise = context.createBufferSource()
      const filter = context.createBiquadFilter()
      const noiseGain = context.createGain()
      noise.buffer = buffer
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(capture ? 1250 : 1550, now)
      noiseGain.gain.setValueAtTime(capture ? 0.22 : 0.15, now)
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055)
      noise.connect(filter).connect(noiseGain).connect(context.destination)
      noise.start(now)
      noise.stop(now + 0.06)
    } catch (e) { /* audio is optional; never interrupt a move */ }
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled
    if (this.musicEnabled) {
      if (!this.bgm) {
        this.bgm = new Audio('/audio/xiangqi/guzheng-city.mp3')
        this.bgm.loop = true
        this.bgm.preload = 'none'
        this.bgm.volume = 0.18
      }
      const audio = this.bgm
      const playing = audio.play()
      if (playing && typeof playing.catch === 'function') {
        playing.catch(() => {
          if (this.bgm === audio && this.musicEnabled) {
            this.musicEnabled = false
            this.syncAudioControls()
          }
        })
      }
    } else if (this.bgm) {
      this.bgm.pause()
    }
    this.syncAudioControls()
  }

  syncAudioControls() {
    const music = this.root.querySelector('[data-xq-music]')
    const sound = this.root.querySelector('[data-xq-sound]')
    if (music) {
      music.textContent = `♫ 背景音乐：${this.musicEnabled ? '开' : '关'}`
      music.setAttribute('aria-pressed', String(this.musicEnabled))
      music.classList.toggle('is-on', this.musicEnabled)
    }
    if (sound) {
      sound.textContent = `♩ 落子音效：${this.soundEnabled ? '开' : '关'}`
      sound.setAttribute('aria-pressed', String(this.soundEnabled))
      sound.classList.toggle('is-on', this.soundEnabled)
    }
  }

  chooseSquare(x, y) {
    if (this.phase !== 'playing' || this.thinking || this.currentSide !== this.playerSide) return
    const piece = this.board[y] && this.board[y][x]
    if (this.selected) {
      const move = this.legalFrom.find((item) => item.toX === x && item.toY === y)
      if (move) {
        this.play(move)
        return
      }
    }
    if (piece && piece.side === this.playerSide) {
      this.selected = { x, y }
      this.legalFrom = getMovesFrom(this.board, x, y, this.playerSide)
      this.hintMove = null
    } else {
      this.selected = null
      this.legalFrom = []
      this.hintMove = null
    }
    this.render()
  }

  play(move) {
    if (this.phase !== 'playing') return
    const before = cloneBoard(this.board)
    const captured = this.board[move.toY][move.toX]
    const moving = this.board[move.fromY][move.fromX]
    this.history.push({ board: before, side: this.currentSide, move: { ...move }, piece: moving ? moving.type : '', captured: captured ? captured.type : null })
    this.board = applyMove(this.board, move)
    this.lastMove = { ...move }
    this.animatingMove = {
      x: move.toX,
      y: move.toY,
      dx: FILE_X(move.fromX) - FILE_X(move.toX),
      dy: RANK_Y(move.fromY) - RANK_Y(move.toY)
    }
    this.captureAnimation = captured ? { x: move.toX, y: move.toY } : null
    this.playMoveSound(Boolean(captured))
    this.currentSide = otherSide(this.currentSide)
    this.selected = null
    this.legalFrom = []
    this.hintMove = null
    this._checkFinished()
    this.render()
    if (this.phase === 'playing' && this.currentSide !== this.playerSide) this.scheduleAI()
  }

  _checkFinished() {
    const result = resultForSideToMove(this.board, this.currentSide)
    if (!result) return
    this.phase = 'over'
    this.winner = result.winner
    this.resultEl.hidden = false
    const playerWon = result.winner === this.playerSide
    this.resultTitleEl.textContent = playerWon ? '漂亮！你赢了' : '这局棋，电脑占先了'
    this.resultTextEl.textContent = `${SIDE_LABEL[result.winner]}获胜 · ${result.checkmate ? '将死' : '无棋可走'}`
  }

  scheduleAI() {
    clearTimeout(this._aiTimer)
    this.thinking = true
    this.render()
    this._aiTimer = setTimeout(() => {
      if (this._destroyed || this.phase !== 'playing') return
      const move = chooseMove(this.board, this.currentSide, this.difficulty)
      this.thinking = false
      if (move) this.play(move)
      else {
        this._checkFinished()
        this.render()
      }
    }, 120)
  }

  undo() {
    if (!this.history.length || this.phase === 'over' || this.thinking) return
    // AI 对局成对撤回：把玩家刚下的棋与 AI 的回应一起收回。
    let count = 1
    const last = this.history[this.history.length - 1]
    if (this.history.length >= 2 && last.side !== this.playerSide) count = 2
    else if (last.side !== this.playerSide) return
    let entry = null
    for (let i = 0; i < count; i++) entry = this.history.pop()
    this.board = cloneBoard(entry.board)
    this.currentSide = entry.side
    this.lastMove = this.history.length ? { ...this.history[this.history.length - 1].move } : null
    this.selected = null
    this.legalFrom = []
    this.hintMove = null
    this.phase = 'playing'
    this.winner = null
    this.resultEl.hidden = true
    this.render()
  }

  showHint() {
    if (this.phase !== 'playing' || this.thinking || this.currentSide !== this.playerSide) return
    const move = chooseMove(this.board, this.playerSide, this.difficulty)
    if (!move) return
    this.hintMove = move
    this.selected = { x: move.fromX, y: move.fromY }
    this.legalFrom = getMovesFrom(this.board, move.fromX, move.fromY, this.playerSide)
    this.render()
    this.statusEl.textContent = `试试这步：${this._moveLabel(move)}`
  }

  _moveLabel(move) {
    const piece = this.board[move.fromY][move.fromX]
    const label = piece ? PIECE_LABELS[piece.side][piece.type] : '棋子'
    return `${SIDE_LABEL[piece ? piece.side : this.currentSide]}${label}：${move.fromX + 1}路${move.fromY + 1}行 → ${move.toX + 1}路${move.toY + 1}行`
  }

  newGame() {
    clearTimeout(this._aiTimer)
    this.board = createInitialBoard()
    this.currentSide = RED
    this.selected = null
    this.legalFrom = []
    this.hintMove = null
    this.lastMove = null
    this.animatingMove = null
    this.captureAnimation = null
    this.history = []
    this.phase = 'playing'
    this.winner = null
    this.thinking = false
    this.resultEl.hidden = true
    this.render()
    if (this.currentSide !== this.playerSide) this.scheduleAI()
  }

  toggleExpanded() {
    if (!this._expanded) {
      this._placeholder = document.createComment('xiangqi-root-placeholder')
      this.root.parentNode.insertBefore(this._placeholder, this.root)
      document.body.appendChild(this.root)
      document.body.classList.add('xq-lock')
      this.root.classList.add('xq-expanded')
      this._expanded = true
      this.root.querySelector('[data-xq-fullscreen]').textContent = '收起棋盘'
    } else {
      this.root.classList.remove('xq-expanded')
      document.body.classList.remove('xq-lock')
      if (this._placeholder && this._placeholder.parentNode) {
        this._placeholder.parentNode.insertBefore(this.root, this._placeholder)
        this._placeholder.remove()
      }
      this._placeholder = null
      this._expanded = false
      const button = this.root.querySelector('[data-xq-fullscreen]')
      if (button) button.textContent = '沉浸对弈'
    }
  }

  render() {
    if (this._destroyed) return
    this.boardEl.innerHTML = this._boardMarkup()
    this.animatingMove = null
    this.captureAnimation = null
    const check = isInCheck(this.board, this.currentSide)
    this.statusEl.classList.toggle('is-thinking', this.thinking)
    this.statusEl.classList.toggle('is-check', check && !this.thinking)
    this.statusEl.textContent = this.thinking ? '电脑正在思考…' : this.phase === 'over' ? '本局已结束' : check ? `${SIDE_LABEL[this.currentSide]}被将军，请应将` : `轮到${SIDE_LABEL[this.currentSide]}行棋`
    this.moveCountEl.textContent = `${this.history.length} 手`
    this.root.querySelectorAll('[data-xq-side]').forEach((button) => button.classList.toggle('is-active', button.dataset.xqSide === this.playerSide))
    this.root.querySelector('[data-xq-player-label]').textContent = `${SIDE_LABEL[this.playerSide]} · 你`
    this.root.querySelector('[data-xq-ai-label]').textContent = `${SIDE_LABEL[otherSide(this.playerSide)]} · 电脑`
    this.root.querySelector('[data-xq-undo]').disabled = this.thinking || this.phase === 'over' || !this.history.some((entry) => entry.side === this.playerSide)
    this.root.querySelector('[data-xq-hint]').disabled = this.thinking || this.phase !== 'playing' || this.currentSide !== this.playerSide
    this.historyEl.innerHTML = this.history.length
      ? this.history.slice(-6).reverse().map((entry, i) => `<div class="xq-history-row"><span>${this.history.length - i}</span><b class="${entry.side}">${SIDE_LABEL[entry.side]}</b><span>${esc(PIECE_LABELS[entry.side][entry.piece])} ${entry.move.fromX + 1},${entry.move.fromY + 1}→${entry.move.toX + 1},${entry.move.toY + 1}${entry.captured ? ` · 吃${esc(PIECE_LABELS[otherSide(entry.side)][entry.captured])}` : ''}</span></div>`).join('')
      : '<div class="xq-history-empty">棋盘已摆好，轮到红方先行。</div>'
  }

  _boardMarkup() {
    const x = FILE_X
    const y = RANK_Y
    const marks = []
    const pieceGroups = []
    const selectedMoves = new Map(this.legalFrom.map((move) => [`${move.toX},${move.toY}`, move]))
    for (let rank = 0; rank < 10; rank++) {
      for (let file = 0; file < 9; file++) {
        const move = selectedMoves.get(`${file},${rank}`)
        if (move) {
          marks.push(move.capture
            ? `<circle class="xq-capture-target" cx="${x(file)}" cy="${y(rank)}" r="24"/>`
            : `<circle class="xq-move-target" cx="${x(file)}" cy="${y(rank)}" r="8"/>`)
        }
      }
    }
    if (this.lastMove) {
      marks.push(`<rect class="xq-last-square" x="${x(this.lastMove.fromX) - 25}" y="${y(this.lastMove.fromY) - 25}" width="50" height="50" rx="8"/>`)
      marks.push(`<rect class="xq-last-square" x="${x(this.lastMove.toX) - 25}" y="${y(this.lastMove.toY) - 25}" width="50" height="50" rx="8"/>`)
    }
    if (this.captureAnimation) marks.push(`<circle class="xq-capture-burst" cx="${x(this.captureAnimation.x)}" cy="${y(this.captureAnimation.y)}" r="20"/>`)
    if (this.hintMove) {
      marks.push(`<path class="xq-hint-line" d="M ${x(this.hintMove.fromX)} ${y(this.hintMove.fromY)} L ${x(this.hintMove.toX)} ${y(this.hintMove.toY)}"/>`)
    }
    const checkedGeneral = this.phase === 'playing' && isInCheck(this.board, this.currentSide) ? findGeneral(this.board, this.currentSide) : null
    if (checkedGeneral) marks.push(`<circle class="xq-check-ring" cx="${x(checkedGeneral.x)}" cy="${y(checkedGeneral.y)}" r="27"/>`)

    for (let rank = 0; rank < 10; rank++) {
      for (let file = 0; file < 9; file++) {
        const piece = this.board[rank][file]
        if (!piece) continue
        const chosen = this.selected && this.selected.x === file && this.selected.y === rank
        const arriving = this.animatingMove && this.animatingMove.x === file && this.animatingMove.y === rank ? this.animatingMove : null
        const label = PIECE_LABELS[piece.side][piece.type]
        pieceGroups.push(`<g class="xq-piece ${piece.side}${chosen ? ' is-selected' : ''}${arriving ? ' xq-piece-arrival' : ''}" data-xq-square data-x="${file}" data-y="${rank}" role="button" aria-label="${SIDE_LABEL[piece.side]}${label}" tabindex="0" transform="translate(${x(file)} ${y(rank)})">
          <ellipse class="xq-piece-shadow" cy="4" rx="24" ry="20"/>
          <g class="xq-piece-body"${arriving ? ` style="--xq-dx:${arriving.dx}px;--xq-dy:${arriving.dy}px"` : ''}><ellipse class="xq-piece-side" cy="2" rx="22.5" ry="19"/><ellipse class="xq-piece-face" rx="21" ry="17.5"/><ellipse class="xq-piece-rim" rx="16.5" ry="13.2"/>
          <ellipse class="xq-piece-gloss" cx="-6" cy="-8" rx="8" ry="3"/><text class="xq-piece-label" text-anchor="middle" dominant-baseline="central" transform="${this.playerSide === BLACK ? 'rotate(180)' : ''}">${label}</text></g>
          <circle class="xq-piece-hit" r="27"/>
        </g>`)
      }
    }

    const hitTargets = []
    for (let rank = 0; rank < 10; rank++) {
      for (let file = 0; file < 9; file++) {
        if (!this.board[rank][file]) hitTargets.push(`<circle class="xq-square-hit" data-xq-square data-x="${file}" data-y="${rank}" cx="${x(file)}" cy="${y(rank)}" r="25" role="button" tabindex="0" aria-label="落子到${file + 1}路${rank + 1}行"/>`)
      }
    }

    const horizontal = Array.from({ length: 10 }, (_, rank) => `<line x1="${x(0)}" y1="${y(rank)}" x2="${x(8)}" y2="${y(rank)}"/>`).join('')
    const vertical = [0, 8].map((file) => `<line x1="${x(file)}" y1="${y(0)}" x2="${x(file)}" y2="${y(9)}"/>`).join('') +
      Array.from({ length: 7 }, (_, i) => i + 1).map((file) => `<line x1="${x(file)}" y1="${y(0)}" x2="${x(file)}" y2="${y(4)}"/><line x1="${x(file)}" y1="${y(5)}" x2="${x(file)}" y2="${y(9)}"/>`).join('')
    const palace = `<path d="M ${x(3)} ${y(0)} L ${x(5)} ${y(2)} M ${x(5)} ${y(0)} L ${x(3)} ${y(2)} M ${x(3)} ${y(7)} L ${x(5)} ${y(9)} M ${x(5)} ${y(7)} L ${x(3)} ${y(9)}"/>`
    const starPoints = [[1, 2], [7, 2], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6], [1, 7], [7, 7]]
      .map(([file, rank]) => `<g class="xq-star" transform="translate(${x(file)} ${y(rank)})"><path d="M-5-8h-4v-4 M5-8h4v-4 M-5 8h-4v4 M5 8h4v4"/></g>`).join('')

    return `<svg class="xq-board-svg${this.playerSide === BLACK ? ' is-flipped' : ''}" viewBox="0 0 540 620" role="grid" aria-label="中国象棋棋盘，点击棋子选择，再点击落点">
      <defs>
        <linearGradient id="xq-board-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d999"/><stop offset=".5" stop-color="#e9bd70"/><stop offset="1" stop-color="#cf9148"/></linearGradient>
        <linearGradient id="xq-red-piece" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e8"/><stop offset=".48" stop-color="#f3dfbd"/><stop offset="1" stop-color="#d7b278"/></linearGradient>
        <linearGradient id="xq-black-piece" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff5de"/><stop offset=".48" stop-color="#e8ddc5"/><stop offset="1" stop-color="#c4b28e"/></linearGradient>
        <linearGradient id="xq-board-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a96e3b"/><stop offset="1" stop-color="#5f3824"/></linearGradient>
        <filter id="xq-board-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="9" stdDeviation="9" flood-color="#633b1d" flood-opacity=".26"/></filter>
      </defs>
      <rect class="xq-board-wood" x="7" y="11" width="526" height="606" rx="25" filter="url(#xq-board-shadow)"/>
      <rect class="xq-board-side" x="8" y="7" width="524" height="601" rx="24"/>
      <rect class="xq-board-surface" x="16" y="15" width="508" height="585" rx="18"/>
      <rect class="xq-board-inset" x="26" y="25" width="488" height="565" rx="11"/>
      <rect class="xq-river" x="39" y="${y(4) + 2}" width="462" height="${y(5) - y(4) - 4}" rx="9"/>
      <g class="xq-grid-lines">${horizontal}${vertical}${palace}</g>
      <g class="xq-star-points">${starPoints}</g>
      <g class="xq-river-labels" transform="${this.playerSide === BLACK ? 'rotate(180 270 310)' : ''}"><text x="238" y="311">楚 河</text><text x="302" y="311">汉 界</text></g>
      <g class="xq-board-marks">${marks.join('')}</g>
      <g class="xq-square-hits">${hitTargets.join('')}</g>
      <g class="xq-board-pieces">${pieceGroups.join('')}</g>
      <path class="xq-corner-flourish" d="M44 45h12m-12 0v12 M496 45h-12m12 0v12 M44 575h12m-12 0v-12 M496 575h-12m12 0v-12"/>
    </svg>`
  }

  destroy() {
    this._destroyed = true
    clearTimeout(this._aiTimer)
    this.root.removeEventListener('click', this.onClick)
    this.root.removeEventListener('keydown', this.onKeyDown)
    if (this.bgm) {
      this.bgm.pause()
      this.bgm.removeAttribute('src')
      this.bgm = null
    }
    if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close().catch(() => {})
    this.audioContext = null
    if (typeof document !== 'undefined') document.body.classList.remove('xq-page-active')
    if (this._expanded) this.toggleExpanded()
  }
}
