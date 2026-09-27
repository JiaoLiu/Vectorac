// CC0 foley hosted with the game. See public/audio/slime-v2/CREDITS.md.
// Missing recordings stay silent; never fall back to synthesized noise.
export const TOOL_SOUNDS = {
  pump: ['slime_01', 'slime_04', 'slime_14'],
  pinch: ['slime_03', 'slime_08', 'slime_09'],
  flatten: ['slime_02', 'slime_05', 'slime_10'],
  smooth: ['slime_07', 'slime_15'], carve: ['slime_06', 'slime_16'],
  tear: ['slime_08', 'slime_13'], fold: ['slime_02', 'slime_10'],
  move: ['slime_04', 'slime_14'], bubble: ['bubble_01', 'bubble_03'],
  pop: ['bubble_02', 'slime_12'], glitter: ['slime_11', 'slime_16'],
  foil: ['slime_06', 'slime_11'], release: ['slime_11', 'slime_12'],
  mold: ['slime_05', 'slime_15'], reset: ['slime_01', 'slime_14']
};

export default class SlimeAudio {
  constructor({createContext, random = Math.random, fetchAudio, baseUrl = '/audio/slime-v2/'} = {}) {
    this.createContext = createContext || (() => {
      const Context = window.AudioContext || window.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this.fetchAudio = fetchAudio || (url => fetch(url).then(response => {
      if (!response.ok) throw new Error('Sound unavailable');
      return response.arrayBuffer();
    }));
    this.baseUrl = baseUrl;
    this.random = random;
    this.enabled = true;
    this.voices = new Set();
    this.buffers = new Map();
    this.loading = new Map();
    this.lastSample = {};
    this.clock = 0;
    this.gesture = false;
  }
  load(name) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    const context = this.context;
    const task = Promise.resolve().then(() => this.fetchAudio(this.baseUrl + name + '.wav'))
      .then(data => context.decodeAudioData(data)).then(buffer => {
        if (!this.destroyed) this.buffers.set(name, buffer);
        return buffer;
      }).catch(() => null);
    // One attempt per session: missing assets must not flood requests each frame.
    this.loading.set(name, task);
    return task;
  }
  unlock() {
    if (!this.enabled || this.destroyed) return;
    try {
      if (!this.context) {
        this.context = this.createContext();
        if (!this.context) return;
        const c = this.context;
        this.master = c.createGain();
        this.master.gain.value = .7;
        this.limiter = c.createDynamicsCompressor();
        this.limiter.threshold.value = -16;
        this.limiter.knee.value = 12;
        this.limiter.ratio.value = 5;
        this.master.connect(this.limiter);
        this.limiter.connect(c.destination);
        this.ready = Promise.all([...new Set(Object.values(TOOL_SOUNDS).flat())].map(name => this.load(name)));
      }
      if (this.context.state !== 'running' && !this.resuming) {
        this.resuming = Promise.resolve(this.context.resume()).catch(() => this.stop()).finally(() => {this.resuming = null;});
      }
    } catch (_) { /* Audio unavailable must never stop sculpting. */ }
  }
  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) this.stop();
    else this.unlock();
  }
  play(tool, material = 'butter', strength = .65) {
    try { return this.playVoice(tool, material, strength); }
    catch (_) { return false; }
  }
  playVoice(tool, material, strength) {
    const c = this.context, candidates = TOOL_SOUNDS[tool];
    if (!this.enabled || this.destroyed || !c || c.state !== 'running' || !candidates) return false;
    const available = candidates.filter(name => this.buffers.has(name));
    if (!available.length) return false; // Never queue late sounds after release.
    if (this.voices.size >= 3) {
      const oldest = this.voices.values().next().value;
      oldest.sources.forEach(source => {try {source.stop();} catch (_) {}});
      oldest.nodes.forEach(node => node.disconnect());
      this.voices.delete(oldest);
    }
    const options = available.filter(name => name !== this.lastSample[tool]);
    const pool = options.length ? options : available;
    const name = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
    this.lastSample[tool] = name;
    const buffer = this.buffers.get(name), cotton = material === 'cotton';
    const quiet = ['smooth', 'carve', 'glitter', 'foil', 'release'].includes(tool);
    const rate = (.97 + this.random() * .06) * (cotton ? .94 : 1);
    const level = (.4 + Math.max(0, Math.min(1, strength)) * .5) * (quiet ? .42 : 1) * (cotton ? .65 : 1);
    const time = c.currentTime, duration = buffer.duration / rate;
    const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    filter.type = 'lowpass';
    filter.frequency.value = cotton ? 4200 : 7500;
    filter.Q.value = .5;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + .006);
    gain.gain.setValueAtTime(level, time + Math.max(.007, duration - .035));
    gain.gain.linearRampToValueAtTime(0, time + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    const voice = {sources: [source], nodes: [source, filter, gain]};
    this.voices.add(voice);
    source.onended = () => {
      voice.nodes.forEach(node => node.disconnect());
      this.voices.delete(voice);
    };
    source.start(time); source.stop(time + duration + .01);
    this.lastPlayedAt = time;
    return true;
  }
  begin(tool, material, strength) {
    this.gesture = true;
    this.clock = .38;
    this.motion = 0;
    this.play(tool, material, strength);
  }
  tick(dt, tool, material, strength = .65, motion = 0) {
    if (!this.gesture) return;
    this.clock -= dt;
    this.motion += Math.max(0, motion) * dt;
    // A motionless finger is not a metronome: rubbing distance drives repeats.
    if (this.clock > 0 || this.motion < .075 || motion < .035) return;
    if (this.play(tool, material, strength)) {
      this.clock = .32 + this.random() * .16;
      this.motion = 0;
    }
  }
  end(material, audible = true) {
    const active = this.gesture;
    this.gesture = false;
    if (audible && active && this.context && this.context.currentTime - (this.lastPlayedAt || 0) > .3)
      this.play('release', material, .35);
  }
  stop() {
    this.gesture = false;
    this.voices.forEach(voice => {
      voice.sources.forEach(source => {try {source.stop();} catch (_) {}});
      voice.nodes.forEach(node => node.disconnect());
    });
    this.voices.clear();
  }
  suspend() {
    this.stop();
    if (this.context && this.context.state !== 'closed') Promise.resolve(this.context.suspend()).catch(() => {});
  }
  destroy() {
    this.destroyed = true;
    this.stop();
    this.buffers.clear();
    if (this.context && this.context.state !== 'closed') Promise.resolve(this.context.close()).catch(() => {});
  }
}
