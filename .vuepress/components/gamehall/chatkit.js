// ============================================================
// 联机房间共用套件（gamehall/chatkit.js）
// ------------------------------------------------------------
// 供 gomoku / xiangqi / junqi 的 remote.js 复用的两块能力：
//
// 1) 全屏接管（enterFullscreen / exitFullscreen）
//    进入房间即整屏覆盖文章页：盖过主题导航与左下聊天浮标
//    （chat-widget z-index 9999），body 锁滚动。单机版游戏
//    （五子棋 .gk-fullscreen / 军棋 .jq-fullscreen）同款做法。
//
// 2) 聊天面板（chatDockHtml / bindChatDock / speakPhrase）
//    复刻麻将联机的语音体验：🎤 按钮点开面板 → 4 条快捷语
//    + 「按住说话」长按录音。播报对齐麻将：优先播 /audio/gamehall/
//    下的预生成普通话音频（phrase-N.mp3，gen-mahjong-tts.mjs 生成），
//    文件缺失或加载失败时回退浏览器 speechSynthesis（zh-CN）。
//    通道复用服务端 gameType 无关的 CHAT_MSG / VOICE_MSG relay：
//    快捷语只发序号（0-7，服务端白名单上限 8 条），文案由
//    收发两端本地查表。
// ============================================================

/** 棋类快捷语（普通话，≤8 条；面板展示前 4 条，对齐麻将 CHAT_PANEL_COUNT） */
export const CHAT_PHRASES = [
  '快点儿吧，我等不及了',
  '别急，让我想想',
  '好棋！',
  '这步走得漂亮！',
  '哎呀，大意了',
  '稳住，这局能赢',
  '承让承让',
  '痛快，再来一局！'
]
const PANEL_COUNT = 4

/**
 * 全屏接管：进入房间即整屏（等待室 + 对局 + 结算全程）。
 * 注意：class 只加在 <body> 上——#gameHall 是 Vue 管理的 vnode，
 * 父组件 re-render 打补丁时会把元素 class 重置回 "gh-root"（实测），
 * 而 body 在 Vue 应用外不受影响；CSS 选择器一律从 body.gkr-full 出发。
 */
export function enterFullscreen() {
  document.body.classList.add('gkr-lock')
  document.body.classList.add('gkr-full')
}

export function exitFullscreen() {
  document.body.classList.remove('gkr-lock')
  document.body.classList.remove('gkr-full')
}

/**
 * 播报第 idx 条快捷语：优先播预生成普通话音频（/audio/gamehall/phrase-N.mp3），
 * 文件缺失 / 加载失败回退 speechSynthesis。连发时截断上一条（音频与 TTS 都掐）。
 */
const PHRASE_AUDIO_BASE = '/audio/gamehall'
const _phraseClips = {}
let _phrasePlaying = null

export function speakPhrase(idx, text) {
  if (_phrasePlaying) {
    try { _phrasePlaying.pause() } catch (e) { /* 忽略 */ }
    _phrasePlaying = null
  }
  const key = 'phrase-' + idx
  let clip = _phraseClips[key]
  if (!clip) {
    try {
      clip = new Audio(`${PHRASE_AUDIO_BASE}/${key}.mp3`)
      clip.preload = 'auto'
      clip.addEventListener('error', () => { clip._broken = true })
      _phraseClips[key] = clip
    } catch (e) {
      _speakPhraseSynth(text)
      return
    }
  }
  if (clip._broken) {
    _speakPhraseSynth(text)
    return
  }
  try {
    clip.currentTime = 0
    clip.addEventListener('ended', () => { if (_phrasePlaying === clip) _phrasePlaying = null }, { once: true })
    const p = clip.play()
    _phrasePlaying = clip
    if (p && p.catch) {
      p.catch(() => {
        clip._broken = true
        if (_phrasePlaying === clip) _phrasePlaying = null
        _speakPhraseSynth(text)
      })
    }
  } catch (e) {
    clip._broken = true
    _speakPhraseSynth(text)
  }
}

/** TTS 兜底（预生成音频不可用时） */
function _speakPhraseSynth(text) {
  try {
    if (!window.speechSynthesis || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'
    u.rate = 1.05
    window.speechSynthesis.speak(u)
  } catch (e) {
    /* 无 TTS 环境忽略 */
  }
}

/**
 * 语音录制器：与麻将联机同一套流程（mahjong/ui.js startVoiceRec/stopVoiceRec 的
 * 通用化移植）。iOS 关键点全部保留：
 *   · getUserMedia 异步窗口内松手可放弃开录（_abort），录音机不变孤儿；
 *   · rec.start(1000) 必带 timeslice——iOS Safari 不带时 stop() 常产出
 *     只有文件头的空录音（三棋此前「点了不行」的根因）；
 *   · stop 前 requestData() 兜底；mime 逐个 try（iOS isTypeSupported 会抛）；
 *   · 太短 / 没录到声音给出明确提示，不静默吞掉。
 */
const VOICE_MAX_SEC = 15 // 与麻将一致：语音消息最长秒数

export class VoiceRecorder {
  /**
   * @param {Object} opts
   *   - onSend({ mime, data, duration }) 录音校验通过（base64 数据）
   *   - onState(on:boolean)             录音状态变化（驱动 UI 录音态）
   *   - onError(text)                   提示（toast）
   */
  constructor({ onSend, onState, onError } = {}) {
    this._onSend = onSend
    this._onState = onState
    this._onError = onError
    this._recorder = null
    this._stream = null
    this._starting = false
    this._abort = false
    this._discard = false
    this._startAt = 0
    this._timer = null
    this._chunks = []
    this._mime = 'audio/webm'
  }

  get active() {
    return !!(this._recorder || this._starting || this._stream)
  }

  async start() {
    if (this.active) return
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      this._error('当前浏览器不支持录音，可改用快捷短语')
      return
    }
    // 开录中标记：getUserMedia 是异步的（授权弹窗/硬件初始化可达数百毫秒），
    // 此窗口内松手必须能放弃开录，否则录音机变孤儿一直收音
    this._starting = true
    this._abort = false
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      this._starting = false
      this._error('无法使用麦克风，请检查系统授权')
      return
    }
    if (this._abort) { // 等待授权期间已松手：立即关轨，不开录
      this._starting = false
      stream.getTracks().forEach(t => t.stop())
      return
    }
    const mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    const mime =
      mimes.find(m => {
        try {
          return MediaRecorder.isTypeSupported(m)
        } catch (err) {
          return false
        }
      }) || ''
    let rec
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    } catch (err) {
      this._starting = false
      stream.getTracks().forEach(t => t.stop())
      this._error('录音初始化失败')
      return
    }
    this._chunks = []
    this._mime = rec.mimeType || mime || 'audio/webm'
    this._startAt = Date.now()
    this._discard = false
    this._recorder = rec
    this._starting = false
    this._stream = stream
    rec.ondataavailable = ev => {
      if (ev.data && ev.data.size) this._chunks.push(ev.data)
    }
    rec.onstop = () => this._finish()
    try {
      // 必须带 timeslice：iOS Safari 不带时 stop() 常产出只有文件头的空录音
      rec.start(1000)
    } catch (err) {
      this._recorder = null
      this._stream = null
      this._startAt = 0
      stream.getTracks().forEach(t => t.stop())
      this._error('录音启动失败')
      return
    }
    this._state(true)
    // 到最长时限自动停（走正常发送流程）
    clearTimeout(this._timer)
    this._timer = setTimeout(() => this.stop(false), VOICE_MAX_SEC * 1000)
  }

  stop(cancel) {
    if (this._starting && !this._recorder) {
      // getUserMedia 还在路上：标记放弃，resolve 后由 start() 关轨
      this._abort = true
      return
    }
    const rec = this._recorder
    if (!rec) return
    this._recorder = null // 先置空防重入；收尾在 onstop → _finish
    this._discard = !!cancel
    clearTimeout(this._timer)
    try {
      if (rec.state !== 'inactive') {
        try { rec.requestData() } catch (e) { /* 部分浏览器不支持，忽略 */ }
        rec.stop()
      } else {
        this._finish()
      }
    } catch (err) {
      this._finish()
    }
  }

  /** 录音结束收尾：关轨、复位 UI、编码上送（或按场景丢弃） */
  _finish() {
    if (!this._startAt) return // 已收尾过
    const durMs = Date.now() - this._startAt
    this._startAt = 0
    clearTimeout(this._timer)
    if (this._stream) {
      this._stream.getTracks().forEach(t => t.stop())
      this._stream = null
    }
    this._state(false)
    const chunks = this._chunks
    this._chunks = []
    const mime = this._mime
    if (this._discard) {
      this._discard = false
      return
    }
    if (!chunks.length) {
      this._error('没有录到声音，请重试')
      return
    }
    if (durMs < 800) {
      this._error('说话时间太短')
      return
    }
    const blob = new Blob(chunks, { type: mime })
    if (blob.size > 200 * 1024) {
      this._error('语音太长了，控制在 ' + VOICE_MAX_SEC + ' 秒内')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      const base64 = url.slice(url.indexOf(',') + 1)
      if (!base64) return
      const seconds = Math.min(VOICE_MAX_SEC, Math.max(1, Math.round(durMs / 1000)))
      if (this._onSend) this._onSend({ mime: blob.type, data: base64, duration: seconds })
    }
    reader.readAsDataURL(blob)
  }

  _state(on) {
    if (this._onState) this._onState(on)
  }

  _error(text) {
    if (this._onError) this._onError(text)
  }
}

/**
 * 聊天 dock 的 DOM：与麻将联机同一结构（scmj-chat）——右下角圆形 🎙语音 按钮
 * + 弹出面板（顶部全宽「🎤 按住说话」+ 2 列快捷语）。录音提示胶囊在按钮左侧。
 */
export function chatDockHtml() {
  let phrases = ''
  for (let i = 0; i < PANEL_COUNT; i++) {
    phrases += '<button type="button" class="gkr-chat-phrase" data-chat="phrase" data-idx="' + i + '">' + CHAT_PHRASES[i] + '</button>'
  }
  return (
    '<div class="gkr-voice-dock" data-gkr-voice-dock>' +
    '  <div class="gkr-chat-rectip" data-chat-rectip hidden>🎙 正在录音…松开发送</div>' +
    '  <div class="gkr-chat-panel" data-chat-panel hidden>' +
    '    <button type="button" class="gkr-chat-micbtn" data-chat="mic" title="按住说话">🎤 按住说话</button>' +
    phrases +
    '  </div>' +
    '  <button type="button" class="gkr-chat-btn" data-chat="toggle" title="语音 / 短语" aria-label="打开或收起语音与短语" aria-expanded="false">🎙<span>语音</span></button>' +
    '</div>'
  )
}

/**
 * 绑定 dock 交互（事件模型与麻将 bindChat 一致）。
 * @param {HTMLElement} dock chatDockHtml() 渲染出的根节点
 * @param {Object} handlers
 *   - onStartRec()        面板大按钮按下（开始录音）
 *   - onStopRec(cancel)   松开/滑出/取消（cancel=true 丢弃录音）
 *   - onPhrase(idx)       点了第 idx 条快捷语
 * @returns {{ setRecUI(on:boolean), closePanel(), destroy() }}
 */
export function bindChatDock(dock, { onStartRec, onStopRec, onPhrase } = {}) {
  const toggle = dock.querySelector('[data-chat="toggle"]')
  const panel = dock.querySelector('[data-chat-panel]')
  const micBtn = dock.querySelector('[data-chat="mic"]')
  const recTip = dock.querySelector('[data-chat-rectip]')

  const onToggle = ev => {
    ev.stopPropagation()
    panel.hidden = !panel.hidden
    toggle.setAttribute('aria-expanded', String(!panel.hidden))
  }
  toggle.addEventListener('click', onToggle)

  const onPhraseClick = ev => {
    const btn = ev.target.closest('[data-chat="phrase"]')
    if (!btn) return
    panel.hidden = true
    toggle.setAttribute('aria-expanded', 'false')
    if (onPhrase) onPhrase(Number(btn.getAttribute('data-idx')) || 0)
  }
  panel.addEventListener('click', onPhraseClick)

  // 长按录音（触屏 + 鼠标通用；拦 contextmenu 防 iOS 长按弹菜单）
  micBtn.addEventListener('pointerdown', ev => {
    ev.preventDefault()
    if (onStartRec) onStartRec()
  })
  micBtn.addEventListener('pointerup', ev => {
    ev.preventDefault()
    if (onStopRec) onStopRec(false)
  })
  micBtn.addEventListener('pointercancel', () => onStopRec && onStopRec(false))
  micBtn.addEventListener('pointerleave', () => onStopRec && onStopRec(false))
  micBtn.addEventListener('contextmenu', ev => ev.preventDefault())

  // 点面板外区域收起
  const onDocClick = ev => {
    if (!dock.contains(ev.target)) {
      panel.hidden = true
      toggle.setAttribute('aria-expanded', 'false')
    }
  }
  document.addEventListener('click', onDocClick)

  return {
    setRecUI(on) {
      micBtn.classList.toggle('gkr-chat-mic-on', !!on)
      toggle.classList.toggle('gkr-chat-mic-on', !!on)
      if (recTip) recTip.hidden = !on
    },
    closePanel() {
      panel.hidden = true
      toggle.setAttribute('aria-expanded', 'false')
    },
    destroy() {
      document.removeEventListener('click', onDocClick)
    }
  }
}
