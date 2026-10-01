// ============================================================
// 斗地主音频（doudizhu/audio.js）
// 零资源文件：WebAudio 程序化合成多轨 BGM（旋律/贝斯/和声垫/鼓组，
// A/B 双段 chord loop）与音效；报牌语音走「预生成 mp3 优先、
// 浏览器 speechSynthesis 兜底」，播放语音时 BGM 自动闪避（duck）。
// BGM 默认开启，首次手势解锁（iOS 兼容）；音效/语音共用开关。
// ============================================================

const MUSIC_BASE_GAIN = 0.3
const MUSIC_DUCK_GAIN = 0.07

export function createDoudizhuAudio() {
  let ctx = null
  let master = null
  let musicBus = null
  let sfxBus = null
  let noiseBuf = null
  let musicOn = true
  let soundOn = true
  let musicTimer = null
  let step = 0
  let nextTime = 0
  let voiceEl = null
  let voiceSrc = ''
  let duckDepth = 0

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext
      if (!AC) return false
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.8
      master.connect(ctx.destination)
      musicBus = ctx.createGain()
      musicBus.gain.value = musicOn ? MUSIC_BASE_GAIN : 0
      musicBus.connect(master)
      sfxBus = ctx.createGain()
      sfxBus.gain.value = soundOn ? 0.9 : 0
      sfxBus.connect(master)
      const len = ctx.sampleRate * 0.5
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') ctx.resume()
    return true
  }

  // ---------- 多轨 BGM ----------
  // 8 小节循环（每小节 8 个八分音符）：A 段 C-G-Am-F，B 段 F-G-Em-Am
  // 数字 = 相对 C4 的半音数，-1 = 休止
  const MEL = [
    // A 段：轻快五声性主题
    4, 7, 9, 7, 12, 9, 7, 4, // C
    11, 9, 7, 4, 7, 9, 11, 7, // G
    9, 12, 16, 12, 9, 7, 9, 4, // Am
    5, 9, 12, 9, 7, 4, 2, 0, // F
    // B 段：高八度推进，情绪上扬
    17, 16, 12, 9, 12, 16, 17, 16, // F
    16, 14, 12, 11, 12, 14, 16, 19, // G
    16, 19, 16, 12, 11, 12, 7, 4, // Em
    12, 9, 7, 4, 7, 9, 12, 9 // Am
  ]
  // 每小节根音（相对 C2 的半音数）
  const BASS_ROOT = [0, 7, 9, 5, 5, 7, 4, 9]
  // 和弦色彩：maj / min（pad 用）
  const CHORD_KIND = ['maj', 'maj', 'min', 'maj', 'maj', 'maj', 'min', 'min']
  const BASE = 261.63 // C4
  const STEPS = 64
  const SPB = 60 / 126 / 2 // 126bpm 八分音符

  const freqOf = semi => BASE * Math.pow(2, semi / 12)

  function scheduleStep(t) {
    const s = step % STEPS
    const bar = Math.floor(s / 8) // 0..7
    const inBar = s % 8
    // 旋律：方波经低通，带一点圆润
    const m = MEL[s]
    if (m >= 0) leadTone(freqOf(m), t, SPB * 0.92)
    // 贝斯：根-根-五度走动（低两个八度）
    if (inBar === 0 || inBar === 2 || inBar === 5 || inBar === 7) {
      const fifth = inBar >= 5 ? 7 : 0
      tone(musicBus, freqOf(BASS_ROOT[bar] + fifth) / 4, t, SPB * 1.5, 'sine', 0.7)
    }
    // 和声垫：每小节开头铺三和弦（高一个八度，长音弱起）
    if (inBar === 0) {
      const third = CHORD_KIND[bar] === 'min' ? 3 : 4
      for (const iv of [0, third, 7]) {
        padTone(freqOf(BASS_ROOT[bar] + iv + 12), t, SPB * 7.6)
      }
    }
    // 鼓组：kick 1/3 拍，snare 2/4 拍，hat 八分，B 段加花
    if (inBar === 0 || inBar === 4 || (bar >= 4 && inBar === 3 && bar % 2 === 1)) kick(t)
    if (inBar === 2 || inBar === 6) snare(t)
    hat(t, inBar % 2 === 0 ? 0.1 : 0.2)
    step++
    nextTime += SPB
  }

  function leadTone(freq, t, dur) {
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = freq
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 2400
    f.Q.value = 0.8
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.16, t + 0.012)
    g.gain.setValueAtTime(0.16, t + dur * 0.55)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(f); f.connect(g); g.connect(musicBus)
    o.start(t); o.stop(t + dur + 0.05)
  }

  function padTone(freq, t, dur) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = freq
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 850
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.05, t + 0.09)
    g.gain.setValueAtTime(0.05, t + dur * 0.7)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(f); f.connect(g); g.connect(musicBus)
    o.start(t); o.stop(t + dur + 0.05)
  }

  function kick(t) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(150, t)
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.55, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    o.connect(g); g.connect(musicBus)
    o.start(t); o.stop(t + 0.16)
  }

  function snare(t) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1900
    f.Q.value = 0.9
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.3, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09)
    src.connect(f); f.connect(g); g.connect(musicBus)
    src.start(t); src.stop(t + 0.1)
    tone(musicBus, 190, t, 0.07, 'triangle', 0.2)
  }

  function hat(t, vol) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 8200
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035)
    src.connect(f); f.connect(g); g.connect(musicBus)
    src.start(t); src.stop(t + 0.05)
  }

  function tone(bus, freq, t, dur, type, vol) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g); g.connect(bus)
    o.start(t); o.stop(t + dur + 0.05)
  }

  function startMusic() {
    if (musicTimer || !ctx) return
    step = 0
    nextTime = ctx.currentTime + 0.05
    musicTimer = setInterval(() => {
      if (!ctx) return
      while (nextTime < ctx.currentTime + 0.35) scheduleStep(nextTime)
    }, 120)
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null }
  }

  // ---------- 音效 ----------
  const SFX = {
    select(t) { tone(sfxBus, 720, t, 0.06, 'square', 0.25) },
    play(t) { tone(sfxBus, 300, t, 0.09, 'square', 0.35); tone(sfxBus, 190, t + 0.05, 0.12, 'square', 0.3) },
    pass(t) { tone(sfxBus, 220, t, 0.14, 'sine', 0.35) },
    bid(t) { tone(sfxBus, 523, t, 0.08, 'triangle', 0.4); tone(sfxBus, 784, t + 0.08, 0.12, 'triangle', 0.4) },
    landlord(t) { [523, 659, 784, 1047].forEach((f, i) => tone(sfxBus, f, t + i * 0.09, 0.14, 'triangle', 0.4)) },
    bomb(t) {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuf
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(3000, t)
      f.frequency.exponentialRampToValueAtTime(80, t + 0.5)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.9, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
      src.connect(f); f.connect(g); g.connect(sfxBus)
      src.start(t); src.stop(t + 0.6)
      tone(sfxBus, 90, t, 0.5, 'sine', 0.9)
    },
    rocket(t) {
      SFX.bomb(t)
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(200, t)
      o.frequency.exponentialRampToValueAtTime(1600, t + 0.45)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.25, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      o.connect(g); g.connect(sfxBus)
      o.start(t); o.stop(t + 0.55)
    },
    alarm(t) { tone(sfxBus, 880, t, 0.09, 'square', 0.35); tone(sfxBus, 880, t + 0.14, 0.09, 'square', 0.35) },
    win(t) { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(sfxBus, f, t + i * 0.1, 0.22, 'triangle', 0.4)) },
    lose(t) { [392, 330, 262, 196].forEach((f, i) => tone(sfxBus, f, t + i * 0.14, 0.24, 'sine', 0.4)) }
  }

  // ---------- 报牌语音：mp3 优先，浏览器 TTS 兜底 ----------
  // 共享 <audio> 元素（iOS 需在用户手势里解锁一次）；播放期间 BGM duck。
  const SILENT_WAV =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA='

  function getVoiceEl() {
    if (!voiceEl) {
      voiceEl = new Audio()
      voiceEl.preload = 'none'
    }
    return voiceEl
  }

  function applyDuck() {
    if (!musicBus || !musicOn) return
    musicBus.gain.value = duckDepth > 0 ? MUSIC_DUCK_GAIN : MUSIC_BASE_GAIN
  }

  function speakFallback(text) {
    try {
      if (!('speechSynthesis' in window) || !text) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-CN'
      u.rate = 1.15
      u.volume = 0.9
      u.onended = u.onerror = () => { duckDepth = Math.max(0, duckDepth - 1); applyDuck() }
      window.speechSynthesis.speak(u)
    } catch { /* 无 TTS 则静默 */ }
  }

  function voice(key, text) {
    if (!soundOn) return
    const el = getVoiceEl()
    // 上一条未播完直接打断（报牌节奏快，与 QQ 一致）
    try { el.pause() } catch { /* ignore */ }
    duckDepth++
    applyDuck()
    const done = () => { duckDepth = Math.max(0, duckDepth - 1); applyDuck() }
    el.onended = done
    el.onerror = () => { done(); speakFallback(text) }
    const src = `/audio/doudizhu/${key}.mp3`
    if (voiceSrc !== src) { el.src = src; voiceSrc = src }
    else el.currentTime = 0
    const p = el.play()
    if (p && p.catch) {
      p.catch(() => {
        // 未解锁/文件缺失等：已触发 onerror 的不重复兜底
        if (el.error) return
        done()
        speakFallback(text)
      })
    }
  }

  return {
    unlock() {
      if (!ensureCtx()) return
      if (musicOn) startMusic()
      // iOS：共享 <audio> 必须在用户手势里 play 一次才解锁后续 programmatic play
      const el = getVoiceEl()
      if (el.dataset.unlocked !== '1') {
        el.dataset.unlocked = '1'
        const prevSrc = el.src
        el.src = SILENT_WAV
        const p = el.play()
        const restore = () => { try { el.pause() } catch { /* ignore */ } if (prevSrc) el.src = prevSrc; else el.removeAttribute('src') }
        if (p && p.then) p.then(restore).catch(restore)
        else restore()
      }
    },
    sfx(name) {
      if (!soundOn || !ctx || !SFX[name]) return
      ensureCtx()
      SFX[name](ctx.currentTime + 0.01)
    },
    voice,
    setMusicOn(on) {
      musicOn = on
      if (musicBus) musicBus.gain.value = on ? (duckDepth > 0 ? MUSIC_DUCK_GAIN : MUSIC_BASE_GAIN) : 0
      if (ctx) { if (on) startMusic(); else stopMusic() }
    },
    setSoundOn(on) {
      soundOn = on
      if (sfxBus) sfxBus.gain.value = on ? 0.9 : 0
      if (!on && voiceEl) { try { voiceEl.pause() } catch { /* ignore */ } }
      if (!on && 'speechSynthesis' in window) { try { window.speechSynthesis.cancel() } catch { /* ignore */ } }
    },
    get musicOn() { return musicOn },
    get soundOn() { return soundOn },
    destroy() {
      stopMusic()
      if (voiceEl) { try { voiceEl.pause() } catch { /* ignore */ } voiceEl = null }
      if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel() } catch { /* ignore */ } }
      if (ctx) { ctx.close(); ctx = null }
    }
  }
}
