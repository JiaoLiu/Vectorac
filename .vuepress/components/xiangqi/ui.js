import {
  RED, BLACK, PIECE_LABELS, createInitialBoard, cloneBoard, getLegalMoves,
  getMovesFrom, applyMove, isInCheck, findGeneral, resultForSideToMove,
  otherSide, chooseMove
} from './engine.mjs'
import { XIANGQI_PUZZLES, createPuzzleBoard, isCorrectPuzzleChoice, getPuzzlePage } from './puzzles.mjs'

const SIDE_LABEL = { red: '红方', black: '黑方' }
const FILE_X = (x) => 38 + x * 58
const RANK_Y = (y) => 42 + y * 59.4

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
}

function boardPoint(file, rank, side) {
  const x = FILE_X(file)
  const y = RANK_Y(rank)
  return side === BLACK ? { x: 540 - x, y: 620 - y } : { x, y }
}

export default class XiangqiUI {
  /**
   * @param {HTMLElement} root 页面骨架（结构与 xiangqi.md 一致）
   * @param {Object} [opts]
   * @param {Object} [opts.online] 联机适配器：提供后 UI 进入联机模式——
   *   棋盘 / 状态全部来自适配器，走子只发意图（服务端裁决），本地不跑 AI：
   *     - getView() → { board, mySide, currentSide, lastMove, moves, canMove, over, winner, inCheck }
   *     - tryMove({ fromX, fromY, toX, toY }) 走子意图
   *     - statusText(view) → { text, thinking, check } 状态条文案（含倒计时）
   *   状态变化后由外部调用 syncFromOnline() 触发重绘。
   */
  constructor(root, opts) {
    this.root = root
    this.online = (opts && opts.online) || null
    this.board = createInitialBoard()
    this.mode = 'match'
    this.playerSide = RED
    this.currentSide = RED
    this.landscape = false
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
    // 联机默认关 BGM（避免盖过语音聊天），用户可手动开；单机保持默认开
    this.musicEnabled = !this.online
    this.musicStarted = false
    this.soundEnabled = true
    this.audioContext = null
    this.bgm = null
    this.puzzles = XIANGQI_PUZZLES
    this.puzzleIndex = 0
    this.puzzlePage = 0
    this.completedPuzzles = new Set()
    this.unlockedPuzzleCount = 1
    this.puzzleMessage = ''
    this.selectedPuzzleChoice = null
    this.loadPuzzleProgress()
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
    this.onFirstGesture = this._tryNativeFullscreen.bind(this)
    root.addEventListener('click', this.onClick)
    root.addEventListener('keydown', this.onKeyDown)
    if (typeof document !== 'undefined') document.addEventListener('pointerdown', this.onFirstGesture, { once: true })
    this.landscapeQuery = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(max-height: 560px) and (orientation: landscape)')
      : null
    this.landscape = Boolean(this.landscapeQuery && this.landscapeQuery.matches)
    this.placeLayoutControls()
    this.onLandscapeChange = (event) => {
      if (this.landscape === event.matches) return
      this.landscape = event.matches
      this.placeLayoutControls()
      this.render()
    }
    if (this.landscapeQuery) {
      if (this.landscapeQuery.addEventListener) this.landscapeQuery.addEventListener('change', this.onLandscapeChange)
      else if (this.landscapeQuery.addListener) this.landscapeQuery.addListener(this.onLandscapeChange)
    }
    this.render()
    this.enterFullscreen()
  }

  placeLayoutControls() {
    const actions = this.root.querySelector('.xq-top-actions')
    const destination = this.root.querySelector(this.landscape ? '.xq-match-card' : '.xq-topbar')
    if (!actions || !destination) return
    if (this.landscape) destination.prepend(actions)
    else destination.append(actions)
  }

  _onClick(event) {
    const target = event.target.closest && event.target.closest('button, a[data-xq-back], [data-xq-square]')
    if (!target || !this.root.contains(target)) return
    this.prepareAudio()

    if (target.matches('a[data-xq-back]')) {
      this.exitFullscreen()
      return
    }
    if (target.matches('[data-xq-mode]')) {
      this.setMode(target.dataset.xqMode)
      return
    }
    if (target.matches('[data-xq-puzzle-level]')) {
      this.startPuzzle(Number(target.dataset.xqPuzzleLevel))
      return
    }
    if (target.matches('[data-xq-puzzle-page]')) {
      const page = this.puzzlePage + Number(target.dataset.xqPuzzlePage)
      const lastPage = Math.floor((this.puzzles.length - 1) / 10)
      this.puzzlePage = Math.max(0, Math.min(lastPage, page))
      this.render()
      return
    }
    if (target.matches('[data-xq-puzzle-choice]')) {
      this.answerPuzzleChoice(target.dataset.xqPuzzleChoice)
      return
    }
    if (target.matches('[data-xq-puzzle-restart]')) {
      this.restartPuzzle()
      return
    }
    if (target.matches('[data-xq-next]')) {
      this.startPuzzle(this.puzzleIndex + 1)
      return
    }

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
      if (this.mode === 'puzzle') this.restartPuzzle()
      else this.newGame()
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
    if (typeof window === 'undefined') return null
    if (!this.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext) {
        try { this.audioContext = new AudioContext() } catch (e) { this.audioContext = null }
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {})
    if (this.musicEnabled && !this.musicStarted) this.startMusic()
    return this.audioContext
  }

  startMusic() {
    if (!this.musicEnabled || this.musicStarted || typeof Audio === 'undefined') return
    if (!this.bgm) {
      this.bgm = new Audio('/audio/xiangqi/guzheng-city.mp3')
      this.bgm.loop = true
      this.bgm.preload = 'auto'
      this.bgm.volume = 0.18
    }
    const audio = this.bgm
    try {
      const playing = audio.play()
      if (playing && typeof playing.then === 'function') {
        playing.then(() => {
          if (this.bgm === audio && this.musicEnabled) this.musicStarted = true
          this.syncAudioControls()
        }).catch(() => {
          // Keep the preference enabled; a later user gesture can retry playback.
          if (this.bgm === audio) this.musicStarted = false
          this.syncAudioControls()
        })
      } else {
        this.musicStarted = true
      }
    } catch (e) {
      this.musicStarted = false
    }
    this.syncAudioControls()
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
      this.musicStarted = false
      this.startMusic()
    } else if (this.bgm) {
      this.bgm.pause()
      this.musicStarted = false
    }
    this.syncAudioControls()
  }

  syncAudioControls() {
    const music = this.root.querySelector('[data-xq-music]')
    const sound = this.root.querySelector('[data-xq-sound]')
    if (music) {
      music.textContent = `♫ 背景音乐：${this.musicEnabled ? '开' : '关'}`
      music.setAttribute('aria-pressed', String(this.musicEnabled))
      music.setAttribute('aria-label', this.musicEnabled && !this.musicStarted ? '背景音乐默认开启，首次点击游戏区域后开始播放' : `背景音乐${this.musicEnabled ? '开启' : '关闭'}`)
      music.classList.toggle('is-on', this.musicEnabled)
    }
    if (sound) {
      sound.textContent = `♩ 落子音效：${this.soundEnabled ? '开' : '关'}`
      sound.setAttribute('aria-pressed', String(this.soundEnabled))
      sound.classList.toggle('is-on', this.soundEnabled)
    }
  }

  chooseSquare(x, y) {
    // 联机模式：只发走子意图，棋盘等服务端视图回来再变（服务端是权威）。
    // 选中高亮 / 合法落点用本地引擎计算（与服务端同一套规则）。
    if (this.online) {
      const v = this.online.getView()
      if (v.over || !v.canMove) return
      const piece = this.board[y] && this.board[y][x]
      if (this.selected) {
        const move = this.legalFrom.find((item) => item.toX === x && item.toY === y)
        if (move) {
          this.online.tryMove({ fromX: move.fromX, fromY: move.fromY, toX: move.toX, toY: move.toY })
          this.selected = null
          this.legalFrom = []
          this._renderOnline()
          return
        }
      }
      if (piece && piece.side === v.mySide) {
        this.selected = { x, y }
        this.legalFrom = getMovesFrom(this.board, x, y, v.mySide)
      } else {
        this.selected = null
        this.legalFrom = []
      }
      this._renderOnline()
      return
    }
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
    if (this.mode === 'puzzle') {
      if (this.currentPuzzle.kind === 'choice') {
        const choice = this.currentPuzzle.options.find((option) => option.move
          && option.move.fromX === move.fromX && option.move.fromY === move.fromY
          && option.move.toX === move.toX && option.move.toY === move.toY)
        if (choice) this.answerPuzzleChoice(choice.label)
        else {
          this.puzzleMessage = '这步不在本题候选着中。可从右侧选择 A–E；棋盘点击可尝试对应候选着。'
          this.selected = null
          this.legalFrom = []
          this.render()
        }
        return
      }
      const nextBoard = applyMove(this.board, move)
      const result = resultForSideToMove(nextBoard, otherSide(this.playerSide))
      if (!result || !result.checkmate || result.winner !== this.playerSide) {
        this.puzzleMessage = '这步还没有绝杀，再找找能封住将门的着法。'
        this.selected = { x: move.fromX, y: move.fromY }
        this.legalFrom = getMovesFrom(this.board, move.fromX, move.fromY, this.playerSide)
        this.hintMove = null
        this.render()
        return
      }
    }
    const before = cloneBoard(this.board)
    const captured = this.board[move.toY][move.toX]
    const moving = this.board[move.fromY][move.fromX]
    this.history.push({ board: before, side: this.currentSide, move: { ...move }, piece: moving ? moving.type : '', captured: captured ? captured.type : null })
    this.board = applyMove(this.board, move)
    this.lastMove = { ...move }
    this.animatingMove = {
      x: move.toX,
      y: move.toY,
      dx: 0,
      dy: 0
    }
    const fromPoint = boardPoint(move.fromX, move.fromY, this.playerSide)
    const toPoint = boardPoint(move.toX, move.toY, this.playerSide)
    const frame = this.boardEl.getBoundingClientRect()
    // The board viewBox stays 540x620 in both orientations; only the controls
    // move on landscape, so animation deltas must use the same coordinate space.
    const viewWidth = 540
    const viewHeight = 620
    this.animatingMove.dx = (fromPoint.x - toPoint.x) * frame.width / viewWidth
    this.animatingMove.dy = (fromPoint.y - toPoint.y) * frame.height / viewHeight
    this.captureAnimation = captured ? { x: move.toX, y: move.toY } : null
    this.playMoveSound(Boolean(captured))
    this.currentSide = otherSide(this.currentSide)
    this.selected = null
    this.legalFrom = []
    this.hintMove = null
    if (this.mode === 'puzzle') {
      this.phase = 'over'
      this.winner = this.playerSide
      this.completePuzzle()
      this.resultEl.hidden = false
      this.resultTitleEl.textContent = `${this.currentPuzzle.title} · 绝杀成功`
      this.resultTextEl.textContent = this.puzzleIndex < this.puzzles.length - 1
        ? `第 ${this.puzzleIndex + 1} 关通过，已解锁第 ${this.puzzleIndex + 2} 关。`
        : '全部残局关卡通关，棋力见长！'
    } else {
      this._checkFinished()
    }
    this.render()
    if (this.mode === 'match' && this.phase === 'playing' && this.currentSide !== this.playerSide) this.scheduleAI()
  }

  answerPuzzleChoice(label) {
    const puzzle = this.currentPuzzle
    if (this.mode !== 'puzzle' || !puzzle || puzzle.kind !== 'choice' || this.phase !== 'playing') return
    const choice = puzzle.options.find((option) => option.label === label)
    if (!choice) return
    this.selectedPuzzleChoice = label
    this.selected = null
    this.legalFrom = []
    this.hintMove = null
    if (!isCorrectPuzzleChoice(puzzle, label)) {
      this.puzzleMessage = '还不是正解。先确认目标是争胜还是谋和，再看黑方最佳应对。'
      this.render()
      return
    }
    this.puzzleMessage = ''
    this.hintMove = choice.move ? { ...choice.move } : null
    this.phase = 'over'
    this.winner = puzzle.target === 'red-win' ? RED : null
    this.completePuzzle()
    this.resultEl.hidden = false
    this.resultTitleEl.textContent = puzzle.target === 'draw' ? '判断正确 · 成功谋和' : '判断正确 · 红方取胜'
    const answerText = choice.label === 'E'
      ? '四个给定着法都不符合目标，正确选择是“以上都不对”。'
      : `关键首着：${choice.text}。`
    const nextText = this.puzzleIndex < this.puzzles.length - 1
      ? `第 ${this.puzzleIndex + 1} 关通过，已解锁第 ${this.puzzleIndex + 2} 关。`
      : '全部残局关卡通关，棋力见长！'
    this.resultTextEl.textContent = `${answerText} ${nextText}`
    this.render()
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
    const move = this.mode === 'puzzle' ? this.currentPuzzle.solution : chooseMove(this.board, this.playerSide, this.difficulty)
    if (this.mode === 'puzzle' && this.currentPuzzle.kind === 'choice' && !move) {
      this.puzzleMessage = '提示：A–D 四个候选首着都不成立，本题正解就是 E「以上选项都不对」。想看逐着分析，可点下方“查看本题讲解 ↗”。'
      this.render()
      return
    }
    if (!move) return
    this.hintMove = move
    this.selected = { x: move.fromX, y: move.fromY }
    this.legalFrom = getMovesFrom(this.board, move.fromX, move.fromY, this.playerSide)
    this.puzzleMessage = this.mode === 'puzzle'
      ? `提示：${this.currentPuzzle.kind === 'choice' ? this.currentPuzzle.options.find((option) => option.label === this.currentPuzzle.answer).text : this._moveLabel(move)}`
      : ''
    this.render()
    this.statusEl.textContent = this.mode === 'puzzle' ? this.puzzleMessage : `试试这步：${this._moveLabel(move)}`
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
    this.puzzleMessage = ''
    this.selectedPuzzleChoice = null
    this.thinking = false
    this.resultEl.hidden = true
    this.render()
    if (this.currentSide !== this.playerSide) this.scheduleAI()
  }

  loadPuzzleProgress() {
    if (typeof localStorage === 'undefined') return
    try {
      const saved = JSON.parse(localStorage.getItem('vectorac.xiangqi.puzzles.v1') || '{}')
      const knownIds = new Set(this.puzzles.map((puzzle) => puzzle.id))
      this.completedPuzzles = new Set(Array.isArray(saved.completed) ? saved.completed.filter((id) => knownIds.has(id)) : [])
      const highestCompleted = this.puzzles.reduce((highest, puzzle, index) => this.completedPuzzles.has(puzzle.id) ? Math.max(highest, index + 1) : highest, 0)
      const unlocked = Number(saved.unlocked)
      this.unlockedPuzzleCount = Math.max(1, Math.min(this.puzzles.length, Number.isInteger(unlocked) ? unlocked : highestCompleted + 1))
    } catch (e) {
      this.completedPuzzles = new Set()
      this.unlockedPuzzleCount = 1
    }
  }

  savePuzzleProgress() {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem('vectorac.xiangqi.puzzles.v1', JSON.stringify({
        unlocked: this.unlockedPuzzleCount,
        completed: Array.from(this.completedPuzzles)
      }))
    } catch (e) { /* progress is still usable for this visit */ }
  }

  completePuzzle() {
    this.completedPuzzles.add(this.currentPuzzle.id)
    this.unlockedPuzzleCount = Math.max(this.unlockedPuzzleCount, Math.min(this.puzzles.length, this.puzzleIndex + 2))
    this.savePuzzleProgress()
  }

  setMode(mode) {
    if (mode === this.mode || (mode !== 'match' && mode !== 'puzzle')) return
    if (mode === 'puzzle') {
      this.mode = 'puzzle'
      this.startPuzzle(Math.min(this.puzzleIndex, this.unlockedPuzzleCount - 1))
    } else {
      this.mode = 'match'
      this.newGame()
    }
  }

  startPuzzle(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.unlockedPuzzleCount || index >= this.puzzles.length) return
    clearTimeout(this._aiTimer)
    this.mode = 'puzzle'
    this.puzzleIndex = index
    this.puzzlePage = Math.floor(index / 10)
    this.currentPuzzle = this.puzzles[index]
    this.playerSide = this.currentPuzzle.side
    this.board = createPuzzleBoard(this.currentPuzzle)
    this.currentSide = this.currentPuzzle.side
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
    this.puzzleMessage = ''
    this.selectedPuzzleChoice = null
    this.resultEl.hidden = true
    this.render()
  }

  restartPuzzle() {
    this.startPuzzle(this.puzzleIndex)
  }

  enterFullscreen() {
    if (this._expanded || typeof document === 'undefined' || !document.body) return
    if (this.root.parentElement && this.root.parentElement !== document.body) {
      this._placeholder = document.createComment('xiangqi-root-placeholder')
      this.root.parentElement.insertBefore(this._placeholder, this.root)
      document.body.appendChild(this.root)
    }
    document.body.classList.add('xq-lock')
    this.root.classList.add('xq-expanded')
    this._expanded = true
    this._tryNativeFullscreen()
  }

  exitFullscreen() {
    if (!this._expanded || typeof document === 'undefined') return
    try {
      if (document.fullscreenElement === this.root || document.webkitFullscreenElement === this.root) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        if (exit) {
          const result = exit.call(document)
          if (result && result.catch) result.catch(() => {})
        }
      }
    } catch (e) { /* CSS 全屏仍可正常退出 */ }
    this.root.classList.remove('xq-expanded')
    document.body.classList.remove('xq-lock')
    if (this._placeholder && this._placeholder.parentElement) {
      this._placeholder.parentElement.insertBefore(this.root, this._placeholder)
      this._placeholder.remove()
    }
    this._placeholder = null
    this._expanded = false
  }

  _tryNativeFullscreen() {
    if (!this._expanded || typeof document === 'undefined' || typeof window === 'undefined') return
    try {
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches
      if (!coarse || document.fullscreenElement || document.webkitFullscreenElement) return
      const request = this.root.requestFullscreen || this.root.webkitRequestFullscreen
      if (!request) return
      const result = request.call(this.root)
      if (result && result.catch) result.catch(() => {})
    } catch (e) { /* 不支持原生全屏时保留 CSS 沉浸模式 */ }
  }

  render() {
    if (this._destroyed) return
    if (this.online) return this._renderOnline()
    this.boardEl.innerHTML = this._boardMarkup()
    this.animatingMove = null
    this.captureAnimation = null
    const check = isInCheck(this.board, this.currentSide)
    this.statusEl.classList.toggle('is-thinking', this.thinking)
    this.statusEl.classList.toggle('is-check', check && !this.thinking)
    this.statusEl.classList.toggle('is-puzzle-error', this.mode === 'puzzle' && Boolean(this.puzzleMessage) && !this.puzzleMessage.startsWith('提示：'))
    const puzzlePrompt = this.mode === 'puzzle'
      ? this.currentPuzzle && this.currentPuzzle.kind === 'choice' ? ' · 判断红方胜和' : ' · 找到一步绝杀'
      : ''
    this.statusEl.textContent = this.puzzleMessage || (this.thinking ? '电脑正在思考…' : this.phase === 'over' ? (this.mode === 'puzzle' ? '本关已完成' : '本局已结束') : check ? `${SIDE_LABEL[this.currentSide]}被将军，请应将` : `轮到${SIDE_LABEL[this.currentSide]}行棋${puzzlePrompt}`)
    this.moveCountEl.textContent = `${this.history.length} 手`
    this.root.querySelectorAll('[data-xq-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.xqMode === this.mode))
    const matchSettings = this.root.querySelector('[data-xq-match-settings]')
    const matchActions = this.root.querySelector('[data-xq-match-actions]')
    const puzzlePanel = this.root.querySelector('[data-xq-puzzle-panel]')
    if (matchSettings) matchSettings.hidden = this.mode === 'puzzle'
    if (matchActions) matchActions.hidden = this.mode === 'puzzle'
    if (puzzlePanel) puzzlePanel.hidden = this.mode !== 'puzzle'
    const title = this.root.querySelector('[data-xq-match-title]')
    const live = this.root.querySelector('.xq-match-live')
    if (title) title.textContent = this.mode === 'puzzle' ? '残局闯关' : '本局对弈'
    if (live) live.innerHTML = `<i></i>${this.mode === 'puzzle' ? '逐关挑战' : '单机'}`
    this.root.querySelectorAll('[data-xq-side]').forEach((button) => button.classList.toggle('is-active', button.dataset.xqSide === this.playerSide))
    this.root.querySelector('[data-xq-player-label]').textContent = `${SIDE_LABEL[this.playerSide]} · 你`
    this.root.querySelector('[data-xq-ai-label]').textContent = `${SIDE_LABEL[otherSide(this.playerSide)]} · ${this.mode === 'puzzle' ? '守方' : '电脑'}`
    this.root.querySelector('[data-xq-undo]').disabled = this.thinking || this.phase === 'over' || !this.history.some((entry) => entry.side === this.playerSide)
    this.root.querySelectorAll('[data-xq-hint]').forEach((button) => {
      button.disabled = this.thinking || this.phase !== 'playing' || this.currentSide !== this.playerSide
      if (this.mode === 'puzzle' && button.closest('[data-xq-puzzle-panel]')) button.textContent = this.hintMove ? '↻ 再看提示' : '✦ 提示'
      else if (this.mode === 'match') button.textContent = '✦ 着法提示'
    })
    const again = this.root.querySelector('[data-xq-again]')
    const next = this.root.querySelector('[data-xq-next]')
    if (again) again.textContent = this.mode === 'puzzle' ? '重试本关' : '再来一局'
    if (next) next.hidden = this.mode !== 'puzzle' || this.phase !== 'over' || this.puzzleIndex >= this.puzzles.length - 1
    const levelList = this.root.querySelector('[data-xq-puzzle-levels]')
    if (levelList && this.currentPuzzle) {
      const page = getPuzzlePage(this.puzzles, this.puzzlePage)
      this.puzzlePage = page.pageIndex
      levelList.innerHTML = page.items.map((puzzle, offset) => {
        const index = page.startIndex + offset
        const locked = index >= this.unlockedPuzzleCount
        const complete = this.completedPuzzles.has(puzzle.id)
        const current = index === this.puzzleIndex
        const label = locked ? '锁' : complete ? '✓' : String(index + 1)
        return `<button type="button" class="xq-puzzle-level${current ? ' is-current' : ''}${complete ? ' is-complete' : ''}" data-xq-puzzle-level="${index}" aria-label="第 ${index + 1} 关${locked ? '，未解锁' : ''}"${locked ? ' disabled' : ''}>${label}</button>`
      }).join('')
      const pageLabel = this.root.querySelector('[data-xq-puzzle-page-label]')
      if (pageLabel) pageLabel.textContent = `${page.startIndex + 1}–${page.startIndex + page.items.length} / ${this.puzzles.length}`
      this.root.querySelectorAll('[data-xq-puzzle-page]').forEach((button) => {
        const nextPage = this.puzzlePage + Number(button.dataset.xqPuzzlePage)
        button.disabled = nextPage < 0 || nextPage > Math.floor((this.puzzles.length - 1) / 10)
      })
      this.root.querySelector('[data-xq-puzzle-title]').textContent = `第 ${this.puzzleIndex + 1} 关 · ${this.currentPuzzle.title}`
      this.root.querySelector('[data-xq-puzzle-lesson]').textContent = this.currentPuzzle.lesson
      this.root.querySelector('[data-xq-puzzle-progress]').textContent = `已通关 ${this.completedPuzzles.size} / ${this.puzzles.length} · ${this.currentPuzzle.side === RED ? '红方先行' : '黑方先行'}`
      const choices = this.root.querySelector('[data-xq-puzzle-choices]')
      if (choices) {
        choices.hidden = this.currentPuzzle.kind !== 'choice'
        choices.innerHTML = this.currentPuzzle.kind === 'choice'
          ? this.currentPuzzle.options.map((option) => {
            const selected = this.selectedPuzzleChoice === option.label
            const state = selected ? this.phase === 'over' ? ' is-correct' : ' is-wrong' : ''
            return `<button type="button" class="xq-puzzle-choice${state}" data-xq-puzzle-choice="${option.label}" aria-pressed="${selected}"${this.phase === 'over' ? ' disabled' : ''}><b>${option.label}</b><span>${esc(option.text)}</span></button>`
          }).join('')
          : ''
      }
      const source = this.root.querySelector('[data-xq-puzzle-source]')
      if (source) {
        source.hidden = this.currentPuzzle.kind !== 'choice'
        source.innerHTML = this.currentPuzzle.kind === 'choice'
          ? `<a href="https://github.com/destinybird/Jianghu108" target="_blank" rel="noopener">题库来源 · Apache-2.0</a><a href="${esc(this.currentPuzzle.source)}" target="_blank" rel="noopener">查看本题讲解 ↗</a>`
          : ''
      }
    }
    this.syncAudioControls()
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
        const labelTransform = ''
        const pieceTransform = this.playerSide === BLACK ? 'rotate(180)' : ''
        const arrivalX = arriving && arriving.dx
        const arrivalY = arriving && arriving.dy
        pieceGroups.push(`<g class="xq-piece ${piece.side}${chosen ? ' is-selected' : ''}${arriving ? ' xq-piece-arrival' : ''}" data-xq-square data-x="${file}" data-y="${rank}" role="button" aria-label="${SIDE_LABEL[piece.side]}${label}" tabindex="0" transform="translate(${x(file)} ${y(rank)})">
          <g class="xq-piece-upright" transform="${pieceTransform}"><ellipse class="xq-piece-shadow" cy="7" rx="24" ry="20"/>
          <g class="xq-piece-body"${arriving ? ` style="--xq-dx:${arrivalX}px;--xq-dy:${arrivalY}px"` : ''}><ellipse class="xq-piece-side" cy="4" rx="23" ry="19.2"/><ellipse class="xq-piece-bevel" cy="1.4" rx="22.4" ry="18.6"/><ellipse class="xq-piece-face" rx="21" ry="17.5"/><ellipse class="xq-piece-rim" rx="16.5" ry="13.2"/><ellipse class="xq-piece-inner-rim" rx="15.1" ry="11.9"/>
          <ellipse class="xq-piece-gloss" cx="-6" cy="-8" rx="8" ry="3"/><text class="xq-piece-label-shadow" text-anchor="middle" dominant-baseline="central" transform="${labelTransform}" dx="0.7" dy="1.2">${label}</text><text class="xq-piece-label" text-anchor="middle" dominant-baseline="central" transform="${labelTransform}">${label}</text></g>
          <circle class="xq-piece-hit" r="27"/></g>
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

    // Keep the board upright in every viewport: landscape only moves controls to the right.
    // The black player sees the same top/bottom arrangement with logical ranks rotated 180°.
    const viewBox = '0 0 540 620'
    const boardTransform = this.playerSide === BLACK ? 'translate(540 620) rotate(180)' : ''
    const riverTransform = this.playerSide === BLACK ? 'rotate(180 270 310)' : ''

    return `<svg class="xq-board-svg${this.playerSide === BLACK ? ' is-flipped' : ''}${this.landscape ? ' is-landscape' : ''}" viewBox="${viewBox}" role="grid" aria-label="中国象棋棋盘，点击棋子选择，再点击落点">
      <defs>
        <linearGradient id="xq-board-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d999"/><stop offset=".5" stop-color="#e9bd70"/><stop offset="1" stop-color="#cf9148"/></linearGradient>
        <linearGradient id="xq-piece-bevel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5da"/><stop offset=".42" stop-color="#d3a461"/><stop offset="1" stop-color="#85572e"/></linearGradient>
        <linearGradient id="xq-red-piece" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e8"/><stop offset=".48" stop-color="#f3dfbd"/><stop offset="1" stop-color="#d7b278"/></linearGradient>
        <linearGradient id="xq-black-piece" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff5de"/><stop offset=".48" stop-color="#e8ddc5"/><stop offset="1" stop-color="#c4b28e"/></linearGradient>
        <linearGradient id="xq-board-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a96e3b"/><stop offset="1" stop-color="#5f3824"/></linearGradient>
        <pattern id="xq-wood-grain" width="260" height="88" patternUnits="userSpaceOnUse"><path d="M-12 15 C34 4 74 24 122 13 S214 7 274 18 M-18 52 C28 43 72 61 126 50 S218 44 280 56 M-10 76 C42 68 77 83 138 73 S222 69 270 79" fill="none" stroke="#81502b" stroke-opacity=".18" stroke-width="1.2"/><path d="M-8 18 C38 8 75 27 122 16 S214 10 270 21 M-16 55 C32 46 72 64 126 53 S216 48 276 59" fill="none" stroke="#fff0bd" stroke-opacity=".2" stroke-width=".8"/></pattern>
      </defs>
      <g class="xq-board-orientation" transform="${boardTransform}">
      <rect class="xq-board-wood" x="7" y="11" width="526" height="606" rx="25"/>
      <rect class="xq-board-side" x="10" y="10" width="520" height="598" rx="24"/>
      <rect class="xq-board-bevel" x="14" y="13" width="512" height="590" rx="21"/>
      <rect class="xq-board-surface" x="19" y="18" width="502" height="580" rx="15"/>
      <rect class="xq-board-grain" x="20" y="19" width="500" height="578" rx="14"/>
      <rect class="xq-board-inset" x="27" y="26" width="486" height="564" rx="8"/>
      <rect class="xq-river" x="39" y="${y(4) + 2}" width="462" height="${y(5) - y(4) - 4}" rx="9"/>
      <g class="xq-grid-underlay" transform="translate(0 1.4)">${horizontal}${vertical}${palace}</g>
      <g class="xq-grid-lines">${horizontal}${vertical}${palace}</g>
      <g class="xq-star-points">${starPoints}</g>
      <g class="xq-river-labels" transform="${riverTransform}"><text x="238" y="311">楚 河</text><text x="302" y="311">汉 界</text></g>
      <g class="xq-board-marks">${marks.join('')}</g>
      <g class="xq-square-hits">${hitTargets.join('')}</g>
      <path class="xq-corner-flourish" d="M44 45h12m-12 0v12 M496 45h-12m12 0v12 M44 575h12m-12 0v-12 M496 575h-12m12 0v-12"/>
      <g class="xq-board-pieces">${pieceGroups.join('')}</g>
      </g>
    </svg>`
  }

  // ---------------- 联机模式 ----------------

  /**
   * 联机：服务端新视图到达后由 remote 调用。
   * diff 出新着 → 补落子动画 + 音效；然后统一重绘。
   */
  syncFromOnline() {
    if (!this.online) return
    const v = this.online.getView()
    const lm = v.lastMove
    const key = lm ? `${v.moves}:${lm.fromX},${lm.fromY}>${lm.toX},${lm.toY}` : 'none'
    if (lm && key !== this._lastSyncKey) {
      this._lastSyncKey = key
      // 吃子判定用同步前的旧棋盘（落点上有无棋子）
      const captured = this.board && this.board[lm.toY] && this.board[lm.toY][lm.toX]
      this.board = v.board
      this.lastMove = { ...lm }
      const fromPoint = boardPoint(lm.fromX, lm.fromY, v.mySide)
      const toPoint = boardPoint(lm.toX, lm.toY, v.mySide)
      const frame = this.boardEl.getBoundingClientRect()
      // 与单机 play() 同一坐标系：viewBox 恒为 540x620
      this.animatingMove = {
        x: lm.toX,
        y: lm.toY,
        dx: (fromPoint.x - toPoint.x) * frame.width / 540,
        dy: (fromPoint.y - toPoint.y) * frame.height / 620
      }
      this.captureAnimation = captured ? { x: lm.toX, y: lm.toY } : null
      this.playMoveSound(Boolean(captured))
      // 新着落地后原选中态失效
      this.selected = null
      this.legalFrom = []
    } else {
      this.board = v.board
      this.lastMove = lm ? { ...lm } : null
    }
    this.playerSide = v.mySide
    this.currentSide = v.currentSide
    this.phase = v.over ? 'over' : 'playing'
    this.winner = v.winner || null
    this.hintMove = null
    this.thinking = false
    this._renderOnline()
  }

  /** 联机：状态条文案（倒计时等）定时刷新，不重建棋盘 */
  refreshStatus() {
    if (!this.online || this._destroyed) return
    const s = this.online.statusText(this.online.getView()) || {}
    this.statusEl.classList.toggle('is-thinking', !!s.thinking)
    this.statusEl.classList.toggle('is-check', !!s.check)
    this.statusEl.textContent = s.text || ''
  }

  _renderOnline() {
    if (this._destroyed) return
    this.boardEl.innerHTML = this._boardMarkup()
    this.animatingMove = null
    this.captureAnimation = null
    const v = this.online.getView()
    const s = this.online.statusText(v) || {}
    this.statusEl.classList.toggle('is-thinking', !!s.thinking)
    this.statusEl.classList.toggle('is-check', !!s.check)
    this.statusEl.classList.remove('is-puzzle-error')
    this.statusEl.textContent = s.text || ''
    if (this.moveCountEl) this.moveCountEl.textContent = `${v.moves || 0} 手`
    this.syncAudioControls()
  }

  destroy() {
    this._destroyed = true
    clearTimeout(this._aiTimer)
    this.root.removeEventListener('click', this.onClick)
    this.root.removeEventListener('keydown', this.onKeyDown)
    if (typeof document !== 'undefined') document.removeEventListener('pointerdown', this.onFirstGesture)
    if (this.landscapeQuery) {
      if (this.landscapeQuery.removeEventListener) this.landscapeQuery.removeEventListener('change', this.onLandscapeChange)
      else if (this.landscapeQuery.removeListener) this.landscapeQuery.removeListener(this.onLandscapeChange)
    }
    if (this.bgm) {
      this.bgm.pause()
      this.bgm.removeAttribute('src')
      this.bgm = null
    }
    if (this.audioContext && this.audioContext.state !== 'closed') this.audioContext.close().catch(() => {})
    this.audioContext = null
    if (typeof document !== 'undefined') document.body.classList.remove('xq-page-active')
    if (this._expanded) this.exitFullscreen()
  }
}
