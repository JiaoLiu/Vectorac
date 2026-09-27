// Generates the slime foley kit into .vuepress/public/audio/slime-v2/.
// Every sample is synthesized here (brown-noise squish, air blubs, micro
// crackles, chirped pops) so the game owns its sounds outright. Re-run with:
//   node scripts/gen-slime-sounds.mjs
import {writeFile, mkdir, rm, readdir} from 'node:fs/promises';

const SR = 44100;
const DIR = new URL('../.vuepress/public/audio/slime-v2/', import.meta.url);
let seed = 20260927;
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const TAU = Math.PI * 2;

// Wet squish: brown noise through an LFO-swept lowpass (putty folding over
// itself), one low "blub" of trapped air, and sparse micro-crackles.
function squish(dur, {crackles = 16, depth = 1, rate = 1} = {}) {
  const n = Math.ceil(dur * SR), out = new Float32Array(n);
  const p1 = rand() * TAU, p2 = rand() * TAU;
  const f1 = (.5 + rand() * .8) * rate, f2 = (1.1 + rand() * 1.2) * rate;
  const blubAt = .04 + rand() * .12, blubLen = .09 + rand() * .08, blubF = 70 + rand() * 40;
  const events = [];
  for (let i = 0; i < crackles; i++)
    events.push([rand() * dur * .92, 800 + rand() * 2400, .15 + rand() * .45, .008 + rand() * .02]);
  let brown = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = t / dur;
    const lfo = .5 + .5 * Math.sin(TAU * f1 * t + p1) * (.55 + .45 * Math.sin(TAU * f2 * t + p2));
    const a = 1 - Math.exp(-TAU * (220 + 950 * lfo * depth) / SR);
    brown = (brown + (rand() * 2 - 1) * .05) * .992;
    lp += a * (brown * 10 - lp);
    let s = lp * Math.min(1, t / .01) * Math.exp(-2.6 * x);
    const bt = t - blubAt;
    if (bt > 0 && bt < blubLen) {
      const bx = bt / blubLen;
      s += Math.sin(TAU * blubF * (1 - .5 * bx) * bt) * Math.sin(Math.PI * bx) * .5 * Math.min(1, t / .01);
    }
    for (const [et, ef, ea, ed] of events) {
      const dt = t - et;
      if (dt > 0 && dt < ed * 6) s += ea * Math.exp(-dt / ed) * Math.sin(TAU * ef * dt) * (.8 + rand() * .4);
    }
    out[i] = s;
  }
  return out;
}

// Dense popping crackle while a stretched sheet tears or gets folded over.
function stretch(dur) {
  return squish(dur, {crackles: 58, depth: .75, rate: .8});
}

// Bubble pop: pitch-dropping resonant chirp plus a click transient.
function pop() {
  const dur = .1 + rand() * .04, n = Math.ceil(dur * SR), out = new Float32Array(n);
  const f0 = 620 + rand() * 180;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = t / dur;
    let s = Math.sin(TAU * f0 * (1 - .72 * Math.min(1, x * 1.15)) * t) * Math.exp(-9 * x);
    if (t < .006) s += (rand() * 2 - 1) * (1 - t / .006) * .5;
    out[i] = s * .8;
  }
  return out;
}

// Bubble forming: soft breath of filtered noise with a faint rising tone.
function blow() {
  const dur = .34, n = Math.ceil(dur * SR), out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = t / dur;
    const a = 1 - Math.exp(-TAU * (500 + 900 * x) / SR);
    lp += a * ((rand() * 2 - 1) - lp);
    out[i] = (lp * 1.4 + Math.sin(TAU * (240 + 120 * x) * t) * .15) * Math.sin(Math.PI * x);
  }
  return out;
}

// Short plip for taps and interface actions.
function dab() {
  const dur = .1, n = Math.ceil(dur * SR), out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = t / dur;
    const a = 1 - Math.exp(-TAU * 900 / SR);
    lp += a * ((rand() * 2 - 1) - lp);
    out[i] = Math.sin(TAU * (330 - 180 * x) * t) * Math.exp(-22 * x) + lp * .25 * Math.exp(-30 * x);
  }
  return out;
}

// Low thup for releases, resets and dropping a fresh lump on the table.
function thud() {
  const dur = .2, n = Math.ceil(dur * SR), out = new Float32Array(n);
  let brown = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = t / dur;
    brown = (brown + (rand() * 2 - 1) * .05) * .99;
    const a = 1 - Math.exp(-TAU * 300 / SR);
    lp += a * (brown * 8 - lp);
    out[i] = Math.sin(TAU * 140 * (1 - .5 * x) * t) * Math.exp(-14 * x) + lp * .3 * Math.exp(-16 * x);
  }
  return out;
}

// Tiny bright pings for glitter and foil sprinkles.
function shimmer() {
  const dur = .3, n = Math.ceil(dur * SR), out = new Float32Array(n);
  const pings = [];
  for (let k = 0; k < 4; k++) pings.push([k * .05 + rand() * .03, 1900 + rand() * 2300]);
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = t / dur;
    let s = (rand() * 2 - 1) * .05 * Math.exp(-8 * x);
    for (const [pt, pf] of pings) {
      const dt = t - pt;
      if (dt > 0) s += .5 * Math.exp(-dt / .02) * Math.sin(TAU * pf * dt);
    }
    out[i] = s;
  }
  return out;
}

// Soft whoosh for smoothing, carving, rotating and view resets.
function swipe(flip = false) {
  const dur = .32, n = Math.ceil(dur * SR), out = new Float32Array(n);
  let fast = 0, slow = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, x = t / dur, w = flip ? 1 - x : x;
    const noise = rand() * 2 - 1;
    fast += (1 - Math.exp(-TAU * (500 + 1100 * w) / SR)) * (noise - fast);
    slow += (1 - Math.exp(-TAU * 180 / SR)) * (noise - slow);
    out[i] = (fast - slow) * 1.6 * Math.pow(Math.sin(Math.PI * x), .7);
  }
  return out;
}

function normalize(data, peak = .72) {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / max;
  return data;
}

function wav(data) {
  const n = data.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), 44 + i * 2);
  return buf;
}

const kit = {
  press_01: () => squish(.5 + rand() * .1, {crackles: 14}),
  press_02: () => squish(.55 + rand() * .1, {crackles: 18}),
  press_03: () => squish(.45 + rand() * .1, {crackles: 12, depth: 1.2}),
  knead_01: () => squish(.85 + rand() * .15, {crackles: 24, rate: .8}),
  knead_02: () => squish(.9 + rand() * .15, {crackles: 28, rate: .7}),
  stretch_01: () => stretch(1.0 + rand() * .1),
  stretch_02: () => stretch(.95 + rand() * .1),
  pop_01: pop, pop_02: pop, pop_03: pop,
  blow_01: blow, blow_02: blow,
  dab_01: dab, dab_02: dab,
  thud_01: thud, thud_02: thud,
  shimmer_01: shimmer, shimmer_02: shimmer,
  swipe_01: () => swipe(false), swipe_02: () => swipe(true),
  mold_01: () => squish(.75, {crackles: 10, depth: 1.25, rate: .7})
};

await mkdir(DIR, {recursive: true});
for (const file of await readdir(DIR))
  if (file.endsWith('.wav')) await rm(new URL(file, DIR));
for (const [name, make] of Object.entries(kit)) {
  await writeFile(new URL(name + '.wav', DIR), wav(normalize(make())));
  console.log('generated', name);
}
console.log('done:', Object.keys(kit).length, 'samples');
