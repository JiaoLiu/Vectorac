// CC0 clay recordings plus restored project-owned glitter/foil chimes; see v6 credits.
// Missing recordings stay silent; never fall back to synthesized noise.
// Each sculpting action owns its samples; no two actions share a recording.
export const TOOL_SOUNDS = {
  pump: ['press_01', 'press_02', 'press_03'],
  pinch: ['pinch_01', 'pinch_02'],
  flatten: ['flatten_01', 'flatten_02'],
  smooth: ['smooth_01', 'smooth_02'], carve: ['carve_01', 'carve_02'],
  tear: ['tear_01', 'tear_02'], fold: ['fold_01', 'fold_02'],
  move: ['drag_01', 'drag_02'], bubble: ['blow_01', 'blow_02'],
  pop: ['pop_01', 'pop_02', 'pop_03'], glitter: ['glitter_01', 'glitter_02'],
  foil: ['foil_01', 'foil_02'], release: ['thud_01', 'thud_02'],
  mold: ['mold_01', 'mold_02'], reset: ['reset_01', 'reset_02'],
  // Interface taps share the gentle dab/thud pools at their original pitch.
  pick: ['dab_01', 'dab_02'], material: ['dab_02', 'dab_01'],
  color: ['dab_01', 'dab_02'], add: ['thud_01', 'thud_02'],
  undo: ['smooth_01', 'smooth_02'], view: ['smooth_02', 'smooth_01'],
  rotate: ['smooth_01', 'smooth_02'], ui: ['dab_01', 'dab_02']
};

const BED = 'bed_01'; // Seamless loop that sustains long holds.

export default class SlimeAudio {
  constructor({createContext, random = Math.random, fetchAudio, baseUrl = '/audio/slime-v6/', retryDelay = 30000,
    now = Date.now, getAudioSession = () => typeof navigator !== 'undefined' ? navigator.audioSession : null} = {}) {
    this.createContext = createContext || (() => {
      const Context = window.AudioContext || window.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this.fetchAudio = fetchAudio || (url => fetch(url).then(response => {
      if (!response.ok) throw new Error('Sound unavailable');
      return response.arrayBuffer();
    }));
    this.baseUrl = baseUrl;
    this.retryDelay = retryDelay;
    this.random = random;
    this.now = now;
    this.getAudioSession = getAudioSession;
    this.enabled = true;
    this.voices = new Set();
    this.buffers = new Map();
    this.loading = new Map();
    this.failures = new Map();
    this.raw = new Map();
    this.lastSample = {};
    this.clock = 0;
    this.gesture = false;
    this.gestureId = 0;
  }
  // Idle prefetch does not touch the audio device. Create/resume and prime the
  // output synchronously in a real input event, not in a download callback.
  load(name) {
    if (this.buffers.has(name)) return Promise.resolve(this.buffers.get(name));
    if (this.loading.has(name)) return this.loading.get(name);
    if (this.raw.has(name)) {
      if (this.context) this.decodePending();
      return Promise.resolve(null);
    }
    const failedAt = this.failures.get(name);
    if (failedAt && Date.now() < failedAt) return Promise.resolve(null);
    const task = Promise.resolve().then(() => this.fetchAudio(this.baseUrl + name + '.wav'))
      .then(data => {
        if (this.destroyed) return null;
        if (!this.context) {
          this.raw.set(name, data); // Keep the bytes; decode after the first gesture.
          return null;
        }
        return this.context.decodeAudioData(data).then(buffer => {
          if (!this.destroyed) this.buffers.set(name, buffer);
          return buffer;
        });
      }).then(buffer => {
        this.loading.delete(name);
        return buffer;
      }).catch(() => {
        // Failed loads may retry after a cooldown: a deploy or a flaky network
        // must not silence the game for the whole session. In-flight dedup via
        // `loading` still prevents request floods.
        this.failures.set(name, Date.now() + this.retryDelay);
        this.loading.delete(name);
        return null;
      });
    this.loading.set(name, task);
    return task;
  }
  ensureContext() {
    if (this.context || this.destroyed) return this.context;
    try {
      const c = this.createContext();
      if (!c) return null;
      this.context = c;
      this.master = c.createGain();
      this.master.gain.value = .7;
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -16;
      this.limiter.knee.value = 12;
      this.limiter.ratio.value = 5;
      this.master.connect(this.limiter);
      this.limiter.connect(c.destination);
      return c;
    } catch (_) {
      return null; /* Audio unavailable must never stop sculpting. */
    }
  }
  // Fetch the kit in small priority batches during idle time: first-touch
  // sounds (press/dab/thud/bed) land in batch one instead of fighting the
  // first gesture for bandwidth. No AudioContext is touched here.
  warmup() {
    if (this.warming) return this.warming;
    if (!this.enabled || this.destroyed) return null;
    const priority = ['press_01', 'press_02', 'press_03', BED, 'dab_01', 'dab_02', 'thud_01', 'thud_02'];
    const rest = [...new Set([...Object.values(TOOL_SOUNDS).flat(), BED])].filter(name => !priority.includes(name));
    const names = [...priority, ...rest];
    this.warming = (async () => {
      for (let i = 0; i < names.length; i += 6)
        await Promise.all(names.slice(i, i + 6).map(name => this.load(name)));
    })();
    this.ready = this.warming;
    return this.warming;
  }
  // Decode everything fetched before the gesture, priority samples first.
  decodePending() {
    if (this.decoding) return this.decoding;
    const c = this.context;
    if (!c) return null;
    const names = [...this.raw.keys()];
    if (!names.length) return null;
    this.decoding = (async () => {
      for (const name of names) {
        const data = this.raw.get(name);
        if (!data) continue;
        this.raw.delete(name);
        try {
          const buffer = await c.decodeAudioData(data);
          if (!this.destroyed) this.buffers.set(name, buffer);
        } catch (_) {
          this.failures.set(name, Date.now() + this.retryDelay);
        }
      }
      this.decoding = null;
    })();
    return this.decoding;
  }
  unlock() {
    if (!this.enabled || this.destroyed) return;
    try {
      // Use the media playback route on Safari, as <audio> does. This is scoped
      // to this game and restored when muted, backgrounded or destroyed.
      const session = this.getAudioSession();
      if (session && !this.audioSession) {
        const previousType = session.type;
        session.type = 'playback';
        this.audioSession = {session, previousType};
      }
    } catch (_) { /* Older browsers do not implement AudioSession. */ }
    try {
      const previous = this.context, now = this.now();
      const health = this.health;
      // WebKit may report suspended/interrupted forever, or running with a
      // frozen clock. Only replace it in a later user gesture, never a timer.
      if (previous && (previous.state === 'closed' || (health &&
          now - health.checkedAt > 1500 && previous.currentTime <= health.time))) {
        this.stop();
        this.context = null;
        this.health = null;
        if (previous.state !== 'closed') Promise.resolve(previous.close()).catch(() => {});
      }
      const c = this.ensureContext();
      if (!c) return;
      if (!this.health || c.currentTime > this.health.time)
        this.health = {time:c.currentTime, checkedAt:now};
      this.warmup();
      if (c.state !== 'running') {
        // Never gate future gestures on this promise: Safari can leave it
        // pending indefinitely. A late rejection must not stop newer voices.
        this.resuming = Promise.resolve(c.resume()).catch(() => {});
        const prime = c.createBufferSource();
        prime.buffer = c.createBuffer(1, 1, c.sampleRate);
        prime.connect(c.destination);
        prime.onended = () => prime.disconnect();
        prime.start(0);
      }
      // Decode prefetched priority samples immediately; do not wait for the
      // slowest remaining download before the first press can make a sound.
      const decoding = this.decodePending();
      this.ready = Promise.all([this.warming, decoding]).then(() => this.decodePending());
    } catch (_) { /* Audio unavailable must never stop sculpting. */ }
  }
  releaseSession() {
    if (!this.audioSession) return;
    const {session, previousType} = this.audioSession;
    try { if (session.type === 'playback') session.type = previousType; } catch (_) {}
    this.audioSession = null;
  }
  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) { this.stop(); this.releaseSession(); }
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
    if (!available.length) {
      // Nothing decoded for this action yet: kick off (re)loads so the next
      // attempt can sound. A previous failure alone never mutes the session.
      candidates.forEach(name => { this.load(name); });
      return false; // Never queue late sounds after release.
    }
    if (this.voices.size >= 4) {
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
    // Taps stay under the sculpting foley; a new material or a new lump should land.
    const soft = ['ui', 'rotate', 'pick', 'undo', 'view', 'color'].includes(tool);
    const rate = tool === 'pop' ? (.97 + this.random() * .06) * (cotton ? .94 : 1) : 1;
    const level = (.4 + Math.max(0, Math.min(1, strength)) * .5) * (quiet ? .42 : soft ? .6 : 1) * (cotton ? .65 : 1);
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
    const voice = {sources: [source], nodes: [source, filter, gain], gain, gesture: this.gesture ? this.gestureId : null};
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
    this.sprinkleSound = tool === 'glitter' || tool === 'foil';
    this.gesture = true;
    this.gestureId += 1;
    this.gestureStart = this.context ? this.context.currentTime : 0;
    this.clock = .38;
    this.motion = 0;
    this.gestureSoundStarted = this.play(tool, material, strength);
    this.startBed(material);
  }
  // A seamless squish loop sustains the hold: while the finger stays down the
  // contact keeps a soft voice, and rubbing swells it. Ends with a smooth
  // fade on release or cancel instead of a hard cutoff or a timed gate.
  startBed(material) {
    const c = this.context, buffer = this.buffers.get(BED);
    if (this.sprinkleSound || !this.enabled || this.destroyed || !c || c.state !== 'running' || !buffer || this.bed) return;
    const cotton = material === 'cotton';
    const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 1;
    filter.type = 'lowpass';
    filter.frequency.value = cotton ? 3600 : 6000;
    filter.Q.value = .5;
    const t = c.currentTime, base = cotton ? .1 : .14;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(base, t + .25);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    const voice = {sources: [source], nodes: [source, filter, gain], gain, gesture: this.gestureId, bed: true, base};
    this.voices.add(voice);
    source.onended = () => {
      voice.nodes.forEach(node => node.disconnect());
      this.voices.delete(voice);
    };
    source.start(t);
    this.bed = voice;
  }
  duck(voice, fade = .08) {
    const t = this.context.currentTime, p = voice.gain.gain;
    try { p.cancelScheduledValues(t); } catch (_) {}
    p.setValueAtTime(Math.max(0, Math.min(1, p.value || 0)), t);
    p.linearRampToValueAtTime(0, t + fade);
    voice.sources.forEach(source => {try {source.stop(t + fade + .02);} catch (_) {}});
  }
  tick(dt, tool, material, strength = .65, motion = 0) {
    if (!this.gesture) return;
    // First-touch decoding/resume may finish after pointerdown. Catch up only
    // while that same gesture is held, never replay old pokes after release.
    if (!this.gestureSoundStarted) this.gestureSoundStarted = this.play(tool, material, strength);
    if (!this.bed) this.startBed(material);
    // The bed swells with rubbing and settles back when the finger rests.
    if (this.bed && this.voices.has(this.bed) && this.context)
      this.bed.gain.gain.setTargetAtTime(
        this.bed.base + Math.min(.35, Math.max(0, motion) * .8),
        this.context.currentTime, .09);
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
    if (active && this.context) {
      // Only this gesture's voices tail off; bubbles, button taps and other
      // sounds keep playing untouched.
      for (const voice of [...this.voices])
        if (voice.gesture === this.gestureId) this.duck(voice, voice.bed ? .18 : .08);
      this.bed = null;
      if (audible && !this.sprinkleSound && this.context.currentTime - (this.lastPlayedAt || 0) > .3)
        this.play('release', material, .35);
    }
  }
  stop() {
    this.gesture = false;
    this.bed = null;
    this.voices.forEach(voice => {
      voice.sources.forEach(source => {try {source.stop();} catch (_) {}});
      voice.nodes.forEach(node => node.disconnect());
    });
    this.voices.clear();
  }
  suspend() {
    this.stop();
    this.health = null;
    this.releaseSession();
    if (this.context && this.context.state !== 'closed') Promise.resolve(this.context.suspend()).catch(() => {});
  }
  destroy() {
    this.destroyed = true;
    this.stop();
    this.releaseSession();
    this.buffers.clear();
    if (this.context && this.context.state !== 'closed') Promise.resolve(this.context.close()).catch(() => {});
  }
}
