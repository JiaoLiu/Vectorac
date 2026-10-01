// ============================================================
// 斗地主音频（doudizhu/audio.js）
// 零资源文件：WebAudio 程序化合成 BGM 与音效。
// BGM 默认开启，首次手势解锁（iOS 兼容）；音效可独立开关。
// ============================================================

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

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext
      if (!AC) return false
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.8
      master.connect(ctx.destination)
      musicBus = ctx.createGain()
      musicBus.gain.value = musicOn ? 0.3 : 0
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

  // ---------- 程序化 BGM：C 宫五声音阶轻快 loop，32 步 ----------
  const MEL = [0, 4, 7, 4, 9, 7, 4, 0, 2, 4, 7, 9, 7, 4, 2, 0, 0, 4, 7, 4, 9, 12, 9, 7, 4, 7, 9, 7, 4, 2, 0, -1]
  const BASS = [0, -1, -1, -1, 5, -1, -1, -1, 3, -1, -1, -1, 5, -1, 4, -1, 0, -1, -1, -1, 5, -1, -1, -1, 3, -1, -1, -1, 5, -1, 4, -1]
  const BASE = 261.63 // C4
  const PENT = [0, 2, 4, 7, 9] // 宫商角徵羽
  const freqOf = deg => {
    if (deg < 0) return 0
    const oct = Math.floor(deg / 5)
    return BASE * Math.pow(2, oct + PENT[deg % 5] / 12)
  }

  function scheduleStep(t) {
    const s = step % 32
    const spb = 60 / 132 / 2 // 132bpm 八分音符
    const mf = freqOf(MEL[s])
    if (mf) tone(musicBus, mf, t, spb * 0.9, 'triangle', 0.5)
    const bf = BASS[s] >= 0 ? freqOf(BASS[s]) / 4 : 0
    if (bf) tone(musicBus, bf, t, spb * 1.4, 'sine', 0.8)
    if (s % 4 === 0) hat(t, 0.12)
    if (s % 8 === 4) hat(t, 0.25)
    step++
    nextTime += spb
  }

  function hat(t, vol) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 8000
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
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

  return {
    unlock() {
      if (!ensureCtx()) return
      if (musicOn) startMusic()
    },
    sfx(name) {
      if (!soundOn || !ctx || !SFX[name]) return
      ensureCtx()
      SFX[name](ctx.currentTime + 0.01)
    },
    setMusicOn(on) {
      musicOn = on
      if (musicBus) musicBus.gain.value = on ? 0.3 : 0
      if (ctx) { if (on) startMusic(); else stopMusic() }
    },
    setSoundOn(on) {
      soundOn = on
      if (sfxBus) sfxBus.gain.value = on ? 0.9 : 0
    },
    get musicOn() { return musicOn },
    get soundOn() { return soundOn },
    destroy() { stopMusic(); if (ctx) { ctx.close(); ctx = null } }
  }
}
