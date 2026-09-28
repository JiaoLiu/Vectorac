// Cut the approved CC0 recordings into the game kit; no synthesized sound.
// Requires ffmpeg. Usage: node scripts/prepare-slime-recordings.mjs /path/to/sources
// The source folder must contain slime.mp3 and bubbles.mp3 from the URLs below.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const sourceDir = process.argv[2];
if (!sourceDir) throw new Error('Pass a folder containing the two approved source MP3s.');
const out = new URL('../.vuepress/public/audio/slime-v6/', import.meta.url);
const rate = 22050;
const sources = {
  slime: {
    title: 'Slime', author: 'qubodup', license: 'CC0-1.0',
    page: 'https://freesound.org/people/qubodup/sounds/127449/',
    download: 'https://cdn.freesound.org/previews/127/127449_71257-lq.mp3',
    sha256: '5dd188917ed63766283f610c226467081122577fb20c37864c4b4eed55580037'
  },
  bubbles: {
    title: 'slime - bubble blowing recordings', author: 'rubberduck9999', license: 'CC0-1.0',
    page: 'https://freesound.org/people/rubberduck9999/sounds/680446/',
    download: 'https://cdn.freesound.org/previews/680/680446_14687392-lq.mp3',
    sha256: '0ad2a459f9d99f217a9da566a9378bb1980c1853771cf01d61906b8aa9845895'
  }
};
// Each action uses its own source excerpts, not different pitches of one hit.
// [source, start seconds, length seconds, softer level (optional)]
const cuts = {
  press_01:['slime',27.00,.44], press_02:['slime',42.20,.42], press_03:['slime',74.45,.44],
  pinch_01:['slime',27.00,.38], pinch_02:['slime',31.20,.45],
  flatten_01:['slime',48.90,.80], flatten_02:['slime',113.15,.85],
  smooth_01:['slime',2.20,.70,true], smooth_02:['slime',3.40,.75,true],
  carve_01:['slime',42.20,.45], carve_02:['slime',74.45,.40],
  tear_01:['slime',115.35,.85], tear_02:['slime',92.10,.80],
  fold_01:['slime',27.00,.85], fold_02:['slime',31.15,.80],
  drag_01:['slime',41.00,.65], drag_02:['slime',63.65,.80],
  blow_01:['slime',65.40,.70], blow_02:['slime',66.20,.75],
  pop_01:['bubbles',27.05,.28], pop_02:['bubbles',35.30,.28], pop_03:['bubbles',24.10,.30],
  glitter_01:['slime',11.70,.40,true], glitter_02:['slime',51.20,.45,true],
  foil_01:['slime',7.45,.45,true], foil_02:['slime',10.20,.50,true],
  thud_01:['slime',97.00,.26,true], thud_02:['slime',119.00,.28,true],
  mold_01:['slime',114.20,.90], mold_02:['slime',116.10,.85],
  reset_01:['slime',48.15,.90], reset_02:['slime',108.55,.90],
  dab_01:['slime',49.00,.24,true], dab_02:['slime',12.45,.22,true],
  bed_01:['slime',31.05,2.8,true]
};
const decoded = {};
for (const [key, meta] of Object.entries(sources)) {
  const file = resolve(sourceDir, key + '.mp3');
  const bytes = await readFile(file);
  if (createHash('sha256').update(bytes).digest('hex') !== meta.sha256)
    throw new Error('Unexpected source bytes: ' + key);
  const result = spawnSync('ffmpeg', ['-v','error','-i',file,'-ac','1','-ar',String(rate),
    '-af','highpass=f=85,lowpass=f=6200','-f','f32le','pipe:1'], {maxBuffer:50e6});
  if (result.error || result.status !== 0) throw new Error(String(result.error || result.stderr));
  decoded[key] = Float32Array.from({length:result.stdout.length / 4}, (_,i) => result.stdout.readFloatLE(i*4));
}
function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
  b.writeUInt32LE(rate,24); b.writeUInt32LE(rate*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34);
  b.write('data',36); b.writeUInt32LE(samples.length*2,40);
  samples.forEach((s,i)=>b.writeInt16LE(Math.round(s*32767),44+i*2));
  return b;
}
await mkdir(out,{recursive:true});
const samples = {};
for (const [name,[source,start,length,soft]] of Object.entries(cuts)) {
  if (/^(glitter|foil)_/.test(name)) {
    const bytes = await readFile(new URL('../.vuepress/public/audio/slime-v3/'+name+'.wav',import.meta.url));
    await writeFile(new URL(name+'.wav',out),bytes);
    samples[name]={source:'originalChimes',duration:(bytes.length-44)/2/rate,loop:false,
      sha256:createHash('sha256').update(bytes).digest('hex')};
    continue;
  }
  let data = decoded[source].slice(Math.round(start*rate),Math.round((start+length)*rate));
  const loop = name === 'bed_01';
  if (loop) {
    // Overlap the tail and head, then wrap at adjacent source samples. No
    // silence gap or arbitrary click at the seam of a sustained hold.
    const overlap = Math.round(.16*rate), n = data.length-overlap;
    const joined = new Float32Array(n);
    joined.set(data.subarray(overlap,n));
    for(let i=0;i<overlap;i++) {
      const a = i/(overlap-1);
      joined[n-overlap+i] = data[n+i]*(1-a)+data[i]*a;
    }
    data = joined;
  } else {
    const fadeIn = Math.round(.012*rate), fadeOut = Math.round(.055*rate);
    for(let i=0;i<data.length;i++)
      data[i] *= Math.min(1,i/fadeIn,(data.length-1-i)/fadeOut);
  }
  let sum=0,peak=0;
  for(const v of data){sum+=v*v;peak=Math.max(peak,Math.abs(v));}
  const rms=Math.sqrt(sum/data.length);
  if(!Number.isFinite(rms)||rms<1e-6)throw new Error('Silent or invalid excerpt: '+name);
  // One fixed gain per excerpt preserves the real recording's dynamics. No
  // oscillator, noise bed, heavy compressor, or clipped/transformed transients.
  // Preserve the three accepted pop files byte-for-byte. Everything else is
  // qubodup, brought up from its very low source level, with no pitch change.
  const isPop = name.startsWith('pop_');
  const gain=Math.min((isPop?.075:loop?.085:soft?.11:.14)/rms,(isPop?.56:.8)/peak);
  for(let i=0;i<data.length;i++)data[i]*=gain;
  const bytes=wav(data);
  await writeFile(new URL(name+'.wav',out),bytes);
  samples[name]={source,start,length,duration:data.length/rate,loop,gain,
    rms:rms*gain,peak:peak*gain,sha256:createHash('sha256').update(bytes).digest('hex')};
}
sources.originalChimes={title:'Original v3 glitter and foil chimes',author:'Vectorac',license:'Project-owned',generator:'scripts/gen-slime-sounds.mjs'};
await writeFile(new URL('manifest.json',out),JSON.stringify({sampleRate:rate,sources,samples},null,2)+'\n');
console.log('Prepared '+Object.keys(samples).length+' real-recording clips in '+out.pathname);
