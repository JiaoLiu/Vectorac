// Small procedural tactile sounds. No downloads, microphone or background music.
export const TOOL_SOUNDS = {
  pump: [340, .19, .7], pinch: [650, .18, .55], flatten: [260, .23, .8],
  smooth: [850, .2, .35], carve: [1800, .12, .35], tear: [1400, .2, .65],
  fold: [300, .24, .8], move: [480, .13, .35], bubble: [550, .22, .5],
  pop: [1250, .1, .8], glitter: [3400, .1, .22], foil: [2300, .12, .3],
  release: [450, .15, .4], mold: [230, .28, .8], reset: [380, .25, .65],
  ui: [900, .045, .12], rotate: [550, .06, .1]
};

export default class SlimeAudio {
  constructor({createContext, random = Math.random} = {}) {
    this.createContext = createContext || (() => {
      const Context = window.AudioContext || window.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this.random = random;
    this.enabled = true;
    this.voices = new Set();
    this.clock = 0;
    this.gesture = false;
  }
  unlock() {
    if (!this.enabled || this.destroyed) return;
    try {
      if (!this.context) {
        this.context = this.createContext();
        if (!this.context) return;
        const c = this.context;
        this.master = c.createGain();
        this.master.gain.value = .28;
        this.limiter = c.createDynamicsCompressor();
        this.limiter.threshold.value = -18;
        this.limiter.knee.value = 12;
        this.limiter.ratio.value = 8;
        this.master.connect(this.limiter);
        this.limiter.connect(c.destination);
        this.noise = c.createBuffer(1, Math.ceil(c.sampleRate * .6), c.sampleRate);
        const data = this.noise.getChannelData(0);
        let smooth = 0;
        for (let i = 0; i < data.length; i++) {
          smooth = smooth * .6 + (this.random() * 2 - 1) * .4;
          data[i] = smooth;
        }
      }
      if (this.context.state !== 'running' && !this.resuming) {
        this.resuming = Promise.resolve(this.context.resume()).catch(() => {this.stop();}).finally(() => {this.resuming = null;});
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
    const c = this.context, profile = TOOL_SOUNDS[tool];
    if (!this.enabled || this.destroyed || !c || !this.master || !this.noise || c.state === 'closed' || !profile || this.voices.size >= 8) return false;
    if (c.state !== 'running' && !this.resuming) return false;
    const cotton = material === 'cotton';
    const wet = material === 'crystal' || material === 'liquid';
    const variation = .88 + this.random() * .24;
    const frequency = profile[0] * variation * (cotton ? .72 : wet ? 1.25 : 1);
    const duration = profile[1] * (cotton ? 1.2 : 1);
    const level = profile[2] * Math.max(.15, Math.min(1, strength)) * (cotton ? .7 : 1);
    const time = c.currentTime;
    const noise = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    noise.buffer = this.noise;
    filter.type = 'bandpass';
    filter.Q.value = cotton ? .45 : .9;
    filter.frequency.setValueAtTime(frequency, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * .45), time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + .008);
    gain.gain.exponentialRampToValueAtTime(.001, time + duration);
    noise.connect(filter); filter.connect(gain); gain.connect(this.master);
    const nodes = [noise, filter, gain], sources = [noise];
    // Elastic low note beneath the texture; cotton stays airy rather than rubbery.
    if (!cotton && !['smooth', 'carve', 'glitter', 'foil', 'rotate'].includes(tool)) {
      const tone = c.createOscillator(), envelope = c.createGain();
      tone.type = 'sine';
      tone.frequency.setValueAtTime((tool === 'pop' ? 380 : 160) * variation, time);
      tone.frequency.exponentialRampToValueAtTime(55, time + duration);
      envelope.gain.setValueAtTime(.001, time);
      envelope.gain.linearRampToValueAtTime(level * .25, time + .006);
      envelope.gain.exponentialRampToValueAtTime(.001, time + duration);
      tone.connect(envelope); envelope.connect(this.master);
      nodes.push(tone, envelope); sources.push(tone);
    }
    const voice = {sources, nodes};
    this.voices.add(voice);
    noise.onended = () => {
      nodes.forEach(node => node.disconnect());
      this.voices.delete(voice);
    };
    sources.forEach(source => {source.start(time); source.stop(time + duration + .015);});
    return true;
  }
  begin(tool, material, strength) {
    this.gesture = true;
    this.clock = .16;
    this.play(tool, material, strength);
  }
  tick(dt, tool, material, strength = .65, motion = 0) {
    if (!this.gesture) return;
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = .13 + this.random() * .12;
    this.play(tool, material, Math.min(1, strength * .55 + motion * .25));
  }
  end(material, audible = true) {
    const wasActive = this.gesture;
    this.gesture = false;
    if (audible && wasActive) this.play('release', material, .55);
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
    if (this.context && this.context.state !== 'closed') Promise.resolve(this.context.close()).catch(() => {});
  }
}
