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

// ============================================================
// 通信语音通道（权重：人语音 > 快捷语 > 音效 / 背景乐）
// ------------------------------------------------------------
// 与麻将联机同一套思路（mahjong/ui.js 的 _voicePrimed/_duckBgmComm 简化版）：
//   · 单个共享 <audio> 元素：首次手势播一段静音 WAV 拿到「逐元素播放许可」，
//     之后所有语音只换 src。iOS 对手势栈外的 play() 一律 NotAllowedError——
//     旧版快捷语「TTS 没生效」的根因：WS 回调里 play 被拒后误标文件损坏，
//     永久掉进 TTS 回退，而 TTS 在无手势上下文同样哑火；
//   · 队列顺序播放，人语音插队到队首；当前在播的一条必播完（保证完整）；
//   · 播放期间 duck 各游戏注册的 BGM：音量可写的平台压低，iOS（volume
//     只读）整体暂停、播完恢复；
//   · 播放期间 isCommActive() 为 true，各游戏音效入口自查静默。
// ============================================================

const VOICE_MAX_SEC = 15 // 与麻将一致：语音消息最长秒数
const PHRASE_AUDIO_BASE = '/audio/gamehall'
const COMM_QUEUE_MAX = 6
const COMM_DUCK_VOLUME = 0.06

// 204 字节静音 WAV（8kHz 单声道），麻将同款手势解锁材料
const _SILENT_WAV = (() => {
  const bytes = new Uint8Array(204)
  const v = new DataView(bytes.buffer)
  const str = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i) }
  str(0, 'RIFF'); v.setUint32(4, 196, true); str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, 160, true)
  try {
    return 'data:audio/wav;base64,' + btoa(String.fromCharCode.apply(null, bytes))
  } catch (e) {
    return ''
  }
})()

let _commEl = null // 共享播放元素（prime 后获得逐元素播放许可）
let _commPrimed = false
let _commPriming = false
let _commPrimeBound = false
let _commPlaying = null // 当前在播的队列项
const _commQueue = [] // { kind:'voice'|'phrase', src, text, dur }
const _phraseBroken = new Set() // 确认加载失败的 phrase mp3（直接走 TTS，不再反复 404）
const _bgmRegistry = new Set() // 各游戏注册的 BGM <audio> 元素
const _bgmDuckedByComm = new Set() // 当前被通信通道压低的元素

/** 语音播放中（人语音 / 快捷语）：游戏音效入口自查，播放期间静默 */
export function isCommActive() {
  return !!_commPlaying
}

/** 各游戏 BGM 元素注册 / 注销（创建后注册，销毁前注销） */
export function registerBgm(el) {
  if (el) _bgmRegistry.add(el)
}
export function unregisterBgm(el) {
  _bgmRegistry.delete(el)
  _bgmDuckedByComm.delete(el)
}

function _getCommEl() {
  if (_commEl || typeof Audio === 'undefined') return _commEl
  try {
    _commEl = new Audio()
    _commEl.preload = 'auto'
  } catch (e) {
    /* 无 Audio 环境 */
  }
  return _commEl
}

/** 音量可写检测：iOS Safari 的 HTMLMediaElement.volume 只读（恒为 1） */
let _volSettable = null
function _volCanSet() {
  if (_volSettable == null) {
    try {
      const a = document.createElement('audio')
      a.volume = 0.42
      _volSettable = a.volume === 0.42
    } catch (e) {
      _volSettable = false
    }
  }
  return _volSettable
}

/** 首次手势解锁共享元素（bindChatDock 时挂一次；capture 保证最早看到手势） */
export function bindCommPrime() {
  if (_commPrimeBound || typeof document === 'undefined') return
  _commPrimeBound = true
  const onGesture = () => _primeComm()
  document.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  document.addEventListener('keydown', onGesture, { capture: true })
}

function _primeComm() {
  if (_commPrimed || _commPriming) return
  // 与麻将 _resumeVoiceFromGesture 同款顺序：先在手势栈内直接补播队列
  // （首个已解锁的 play 就是用户刚点的快捷语，出声零延迟）；再在后台
  // 静默解锁共享元素。绝不能反过来等 prime 完成再串行补播——否则
  // 「静音 WAV(~20ms)→暂停→load 复位→再 drain」整条链结束才出声，
  // 每次点快捷语都要白等 1 秒左右。
  _drainComm()
  const el = _getCommEl()
  if (!el || !_SILENT_WAV) return
  _commPriming = true
  el.src = _SILENT_WAV
  el.volume = 0.01
  try {
    Promise.resolve(el.play())
      .then(
        () => { _commPrimed = true },
        () => { /* 本次手势没解锁成，下次手势再试 */ }
      )
      .then(() => {
        _commPriming = false
        try { el.pause() } catch (e) { /* 忽略 */ }
        el.removeAttribute('src')
        el.load()
        el.volume = 1
        // 不再在此补播：队列要么已在上面手势栈内播掉，要么等新入队触发
      })
  } catch (e) {
    _commPriming = false
  }
}

/** BGM duck 同步：通道活跃（在播或有积压）压低 / 暂停 BGM，空闲恢复 */
function _syncCommDuck() {
  const active = !!(_commPlaying || _commQueue.length)
  for (const el of _bgmRegistry) {
    if (active) {
      if (_volCanSet()) {
        if (!_bgmDuckedByComm.has(el)) {
          _bgmDuckedByComm.add(el)
          el._gkrVol = el.volume
          try { el.volume = COMM_DUCK_VOLUME } catch (e) { /* 忽略 */ }
        }
      } else if (!el.paused) {
        _bgmDuckedByComm.add(el)
        try { el.pause() } catch (e) { /* 忽略 */ }
      }
    } else if (_bgmDuckedByComm.has(el)) {
      _bgmDuckedByComm.delete(el)
      if (_volCanSet()) {
        try { el.volume = typeof el._gkrVol === 'number' ? el._gkrVol : el.volume } catch (e) { /* 忽略 */ }
      } else if (el.paused) {
        try {
          const p = el.play()
          if (p && p.catch) p.catch(() => { /* 恢复失败由游戏自身 BGM 逻辑兜底 */ })
        } catch (e) { /* 忽略 */ }
      }
    }
  }
}

/**
 * 播报第 idx 条快捷语：入队顺序播（不截断，保证每条完整）。
 * 优先预生成普通话 mp3，确认加载失败回退浏览器 speechSynthesis（zh-CN）。
 */
export function speakPhrase(idx, text) {
  _enqueueComm({
    kind: 'phrase',
    src: `${PHRASE_AUDIO_BASE}/phrase-${idx}.mp3`,
    text: text || CHAT_PHRASES[idx] || '',
    dur: 3
  }, false)
}

/** 人语音播报：权重最高——插队到队首（当前在播的一条不打断，下一条即播） */
export function enqueueVoice({ mime, data, duration } = {}) {
  if (!data) return
  _enqueueComm({
    kind: 'voice',
    src: 'data:' + (mime || 'audio/webm') + ';base64,' + data,
    text: '',
    dur: Math.min(VOICE_MAX_SEC, Math.max(1, Math.round(duration || 1))) + 0.5
  }, true)
}

function _enqueueComm(item, front) {
  if (front) _commQueue.unshift(item)
  else _commQueue.push(item)
  // 积压修剪：优先丢快捷语，人语音尽量保住
  while (_commQueue.length > COMM_QUEUE_MAX) {
    const i = _commQueue.findIndex(q => q.kind === 'phrase')
    if (i === -1) _commQueue.shift()
    else _commQueue.splice(i, 1)
  }
  _drainComm()
}

function _drainComm() {
  if (_commPlaying || _commPriming) return
  const item = _commQueue.shift()
  if (!item) {
    _syncCommDuck()
    return
  }
  _commPlaying = item
  _syncCommDuck()
  let settled = false
  const done = () => {
    if (settled || _commPlaying !== item) return
    settled = true
    _commPlaying = null
    _syncCommDuck()
    _drainComm()
  }
  // 已确认损坏的 phrase mp3 直接走 TTS；无 Audio 环境同样
  const el = _getCommEl()
  if (!el || (item.kind === 'phrase' && _phraseBroken.has(item.src))) {
    _speakCommSynth(item, done)
    return
  }
  el.onended = done
  el.onerror = () => {
    if (item.kind === 'phrase') {
      _phraseBroken.add(item.src)
      if (item.text) { _speakCommSynth(item, done); return }
    }
    done()
  }
  try {
    el.src = item.src
    const p = el.play()
    if (p && p.catch) {
      p.catch(err => {
        if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
          // 尚未解锁（prime 未完成或失败）：回队首等下次手势补播；
          // 注意不能标 _phraseBroken——播放被拒 ≠ 文件损坏（旧版这个误判
          // 导致快捷语永久掉进 TTS 回退，即「TTS 没生效」的根因之一）
          if (_commPlaying === item) _commPlaying = null
          settled = true
          el.onended = null
          el.onerror = null
          _commQueue.unshift(item)
          _syncCommDuck()
        } else if (el.onerror) {
          el.onerror()
        }
      })
    }
  } catch (e) {
    if (item.kind === 'phrase' && item.text) _speakCommSynth(item, done)
    else done()
  }
  // 兜底：ended 丢失时按估时收尾（仅当元素已停），防队列卡死
  setTimeout(() => {
    if (_commPlaying === item && !settled && (el.paused || el.ended)) done()
  }, Math.max(2500, item.dur * 1000 + 1500))
}

/** TTS 回退（预生成音频不可用时）；onend 不可靠的平台按字数估时兜底 */
function _speakCommSynth(item, done) {
  try {
    if (!window.speechSynthesis || !item.text) {
      done()
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(item.text)
    u.lang = 'zh-CN'
    u.rate = 1.05
    let finished = false
    const wrap = () => {
      if (!finished) {
        finished = true
        done()
      }
    }
    u.onend = wrap
    u.onerror = wrap
    window.speechSynthesis.speak(u)
    setTimeout(wrap, 1200 + item.text.length * 260)
  } catch (e) {
    done()
  }
}

/**
 * 麦克风授权预请求（仅非 iOS 调用，见 bindChatDock.onToggle / _bindMicWarm）：
 * 提前在面板点开/进房手势里发起授权，让首次长按开录无需等弹窗。
 * 结果缓存：granted 后长按直接开录；denied 后浏览器不再弹，只能去设置里开。
 * iOS 不走这里——iOS Safari 麦克风是单捕获会话，prime + 开录两场请求会
 * 以 InvalidStateError 失败；授权统一由开录那次手势内唯一的 getUserMedia
 * 承担（对齐麻将 startVoiceRec）。
 */
let _micState = 'unknown' // 'unknown' | 'pending' | 'granted' | 'denied'
const _micSettle = [] // 等待预热落定的开录请求（见 VoiceRecorder.start）
function _flushMicSettle() {
  while (_micSettle.length) _micSettle.shift()()
}
export function primeMicPermission(onResult) {
  if (_micState === 'pending') return
  if (_micState === 'granted') {
    if (onResult) onResult('granted')
    return
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return
  _micState = 'pending'
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(stream => {
      _micState = 'granted'
      stream.getTracks().forEach(t => t.stop())
      _flushMicSettle()
      if (onResult) onResult('granted')
    })
    .catch(err => {
      _micState = err && err.name === 'NotAllowedError' ? 'denied' : 'unknown'
      _flushMicSettle()
      if (onResult) onResult(_micState)
    })
}

let _micWarmBound = false
/** iOS UA 判定（含 iPadOS 桌面模式） */
function _isIOSUA() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
/** 麦克风权限预热：仅非 iOS 环境在 bindChatDock 挂载时后台触发一次
    （桌面/安卓无弹窗时序问题，提前拿授权让首录更快）。iOS 不预热——
    iOS Safari 的麦克风是单捕获会话：上一场 getUserMedia 刚结束或仍在途时
    再发起一场，会被以 InvalidStateError 拒绝。面板 prime + 长按开录就是
    两场，实测报 InvalidStateError；麻将从不 prime、只在「按住说话」的
    pointerdown 手势里调唯一一次 getUserMedia，所以一直正常。iOS 对齐
    麻将：授权交给开录那次手势内请求，被拒由录音错误 toast 指路设置。 */
function _bindMicWarm() {
  if (_micWarmBound) return
  _micWarmBound = true
  if (typeof window === 'undefined') return
  if (_isIOSUA()) return
  setTimeout(() => primeMicPermission(), 0)
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
    // 若授权预热（面板 prime）还在路上，先等它落定再开录——iOS 对并发的
    // getUserMedia 会把后到的 reject 成 AbortError，表现就是「点了报无法
    // 使用麦克风」。等预热落定后权限已就绪，本次开录几乎瞬时返回。
    if (_micState === 'pending') {
      await new Promise(res => _micSettle.push(res))
      if (this._abort) { this._starting = false; return }
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      this._starting = false
      const name = err && err.name
      // 把真实错误名带出来，别让用户猜「设备或授权」——NotAllowedError=拒了，
      // NotFoundError=无麦克风，NotReadableError=被占用，SecurityError=非安全上下文
      const msg =
        name === 'NotAllowedError' ? '麦克风权限被拒绝：请在系统设置中允许后重试'
        : name === 'NotFoundError' ? '未检测到麦克风设备'
        : name === 'NotReadableError' ? '麦克风被其它应用占用'
        : name === 'SecurityError' ? '当前页面非安全上下文（需 https）'
        : ('无法使用麦克风：' + (name || (err && err.message) || '未知错误'))
      this._error(msg)
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
  // 语音通道手势解锁（全局一次）：iOS 手势栈外 play() 一律 NotAllowedError，
  // 必须趁真实手势把共享元素解锁，之后 WS 收到的语音 / 快捷语才播得出声
  bindCommPrime()
  // 麦克风权限预热（全局一次）：进房后首个手势即后台 getUserMedia。
  // iOS 的授权弹窗/静音检测是异步的，拖到点「按住说话」才第一次拿权限，
  // 那次松手多半撞上 getUserMedia 还没 resolve 的 _abort 窗口——录音被丢，
  // 体验就是「第一次点麦克风没反应」。提前在首个手势预热后，点麦克风时
  // 权限已就绪（granted 静默缓存或已弹过一次窗）。
  _bindMicWarm()
  const toggle = dock.querySelector('[data-chat="toggle"]')
  const panel = dock.querySelector('[data-chat-panel]')
  const micBtn = dock.querySelector('[data-chat="mic"]')
  const recTip = dock.querySelector('[data-chat-rectip]')

  const onToggle = ev => {
    ev.stopPropagation()
    const opening = panel.hidden
    panel.hidden = !panel.hidden
    toggle.setAttribute('aria-expanded', String(!panel.hidden))
    if (opening) {
      // 点开面板预请求麦克风授权——仅非 iOS。iOS 是单捕获会话（见
      // _bindMicWarm 注释）：面板 prime + 长按开录两场 getUserMedia 会
      // 撞 InvalidStateError，iOS 的授权交给开录那次手势内请求；被拒时
      // 由 VoiceRecorder 的错误 toast 指路系统设置。非 iOS 平台保留
      // prime：被拒时在面板顶部挂常驻红条指路系统设置，授权成功则摘掉。
      if (!_isIOSUA()) {
        primeMicPermission(state => {
          let banner = panel.querySelector('.gkr-chat-micdeny')
          if (state === 'denied') {
            if (!banner) {
              banner = document.createElement('div')
              banner.className = 'gkr-chat-micdeny'
              banner.textContent = '麦克风权限被拒绝：请在系统设置中允许后重试'
              panel.prepend(banner)
            }
          } else if (banner) banner.remove()
        })
      }
    }
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
