import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
const source = await readFile(new URL('../.vuepress/components/slime-audio.js', import.meta.url), 'utf8');
const {default: Audio, TOOL_SOUNDS} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

// Recording mocks: every scheduled gain move and stop() lands in `events`.
const param = () => ({value:0,events:[],
 setValueAtTime(v,t){assert.ok(Number.isFinite(v));this.events.push(['set',v,t]);},
 linearRampToValueAtTime(v,t){assert.ok(Number.isFinite(v));this.events.push(['ramp',v,t]);},
 exponentialRampToValueAtTime(v,t){assert.ok(v>0&&Number.isFinite(v));this.events.push(['exp',v,t]);},
 cancelScheduledValues(t){this.events.push(['cancel',t]);},
 setTargetAtTime(v,t,tc){assert.ok(Number.isFinite(v)&&Number.isFinite(tc));this.events.push(['target',v,t,tc]);}});
const node = () => ({gain:param(),playbackRate:param(),frequency:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),
 connect(){},disconnect(){},start(){},stop(when){this.stops=(this.stops||0)+1;this.stopAt=when;}});
const context = {state:'suspended',currentTime:0,sampleRate:8000,destination:node(),createGain:node,createDynamicsCompressor:node,createBufferSource:node,createBiquadFilter:node,createOscillator:node,createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};},resume(){this.state='running';return Promise.resolve();},suspend(){this.state='suspended';return Promise.resolve();},close(){this.state='closed';return Promise.resolve();}};
let created=0;
context.decodeAudioData=async()=>({duration:.5});
let requests=0;
const audio=new Audio({createContext:()=>{created++;return context;},fetchAudio:async()=>{requests++;return new ArrayBuffer(2);},random:()=>.5});

// The whole kit must exist on disk where the game fetches it.
const allSamples=new Set([...Object.values(TOOL_SOUNDS).flat(),'bed_01']);
for(const name of allSamples)
 await access(new URL('../.vuepress/public/audio/slime-v3/'+name+'.wav',import.meta.url));

// Sculpting actions never share a recording: each has its own timbre.
const sculpting=['pump','pinch','flatten','smooth','carve','tear','fold','move','bubble','pop','glitter','foil','mold','reset'];
for(let i=0;i<sculpting.length;i++)for(let j=i+1;j<sculpting.length;j++){
 const overlap=TOOL_SOUNDS[sculpting[i]].filter(n=>TOOL_SOUNDS[sculpting[j]].includes(n));
 assert.deepEqual(overlap,[],sculpting[i]+' and '+sculpting[j]+' must not share samples');
}

assert.equal(created,0,'audio is lazy until a user gesture');
audio.setEnabled(false); audio.unlock(); assert.equal(created,0);
audio.setEnabled(true); await audio.resuming; assert.equal(created,1);
await audio.ready;assert.equal(requests,allSamples.size);assert.equal(audio.buffers.size,allSamples.size);
for(const material of ['butter','cotton','crystal','liquid','foam','memory','clay'])for(const tool of Object.keys(TOOL_SOUNDS)){
 audio.stop(); assert.equal(audio.play(tool,material),true,material+' '+tool);
}
const studio = await readFile(new URL('../.vuepress/components/SlimeStudio.js', import.meta.url), 'utf8');
for(const key of new Set([...studio.matchAll(/audio\.(?:play|begin)\(\s*['"]([a-z]+)['"]/g)].map(match=>match[1])))
 assert.ok(TOOL_SOUNDS[key],'SlimeStudio triggers "'+key+'" but no recording is mapped to it');

audio.stop();for(let i=0;i<100;i++)audio.play('pop');
assert.equal(audio.voices.size,4,'rapid actions cannot create unlimited overlapping voices');

// Holding still never re-triggers the attack sample.
audio.stop();audio.begin('pump','butter',.6);
const first=audio.lastSample.pump;
for(let i=0;i<600;i++)audio.tick(1/60,'pump','butter',.6,0);
assert.equal([...audio.voices].filter(v=>!v.bed).length,1,'holding still never repeats a knocking rhythm');
audio.stop();audio.play('pump');assert.notEqual(audio.lastSample.pump,first,'successive pokes use different recordings');
audio.stop();audio.begin('pinch');audio.clock=0;audio.tick(.2,'pinch','butter',.6,1);
assert.equal([...audio.voices].filter(v=>!v.bed).length,2,'rubbing movement triggers another wet sample');

// A bed starts with the gesture and swells with motion.
audio.stop();audio.begin('pump','butter',.6);
const bed=audio.bed;
assert.ok(bed&&bed.bed&&bed.gesture===audio.gestureId,'a sustained bed starts with the gesture');
assert.ok(bed.sources[0].loop,'the bed loops seamlessly for unlimited holds');
const base=bed.base;
audio.tick(1/60,'pump','butter',.6,1);
const swell=bed.gain.gain.events.find(e=>e[0]==='target'&&e[1]>base);
assert.ok(swell,'rubbing swells the bed above its resting level');
audio.tick(1/60,'pump','butter',.6,0);

// Quick tap (50ms): gesture voices fade to zero fast, other sounds untouched.
context.currentTime=10;
audio.stop();audio.play('pop'); // a bubble popping belongs to no gesture
const outsider=[...audio.voices].find(v=>v.gesture===null);
audio.begin('pump','butter',.6);
const tapBed=audio.bed;
context.currentTime=10.05; // 50ms tap
audio.end('butter',true);
const attack=[...audio.voices].find(v=>!v.bed&&v.gesture===audio.gestureId);
assert.equal(attack.gain.gain.events.at(-1)[0],'ramp');
assert.equal(attack.gain.gain.events.at(-1)[1],0,'the tap fades to silence');
assert.ok(Math.abs(attack.gain.gain.events.at(-1)[2]-10.13)<1e-9,'the fade lands 80ms after release');
assert.ok(Math.abs(attack.sources[0].stopAt-(10.13+.02))<1e-9,'the source stops right after the fade');
assert.equal(outsider.sources[0].stops,1,'an in-flight bubble pop is not cut off by the tap');
assert.ok(Math.abs(tapBed.gain.gain.events.at(-1)[2]-10.23)<1e-9,'the bed tails off more gently than the attack');

// Boundary holds: 199ms and 201ms both tail off smoothly on release.
for(const held of [.199,.201]){
 audio.stop();context.currentTime=20;audio.begin('pump','butter',.6);
 context.currentTime=20+held;audio.end('butter',true);
 const voice=[...audio.voices].find(v=>!v.bed&&v.gesture===audio.gestureId);
 assert.equal(voice.sources[0].stops,2,'release at '+held*1000+'ms schedules the fade-out stop');
}

// 3-second long hold: the bed sustains it, release tails everything off.
audio.stop();context.currentTime=30;audio.begin('pump','butter',.6);
for(let i=0;i<180;i++)audio.tick(1/60,'pump','butter',.6,i%20?0:.6);
context.currentTime=33;
assert.ok(audio.voices.has(audio.bed),'the bed is still sounding after three seconds');
const longBed=audio.bed;
audio.end('butter',true);
assert.equal(longBed.sources[0].stops,1,'releasing the long hold fades the bed');
assert.ok(audio.lastSample.release,'a long hold answers with a soft release thup');

// Cancel mid-hold: same smooth tail-off, but no release thup.
audio.stop();context.currentTime=40;audio.begin('pump','butter',.6);
context.currentTime=41.2;delete audio.lastSample.release;
audio.end('butter',false);
const cancelled=[...audio.voices].find(v=>v.bed&&v.gesture===audio.gestureId);
assert.equal(cancelled.sources[0].stops,1,'cancelling also fades the bed smoothly');
assert.equal(audio.lastSample.release,undefined,'a cancelled gesture never plays the release thup');

audio.setEnabled(false);assert.equal(audio.voices.size,0);assert.equal(audio.play('pump'),false);
audio.setEnabled(true); audio.begin('pump','cotton',.6);audio.end('cotton',false);assert.equal(audio.gesture,false);
audio.begin('pinch','cotton',.6);audio.suspend();assert.equal(audio.voices.size,0);assert.equal(audio.gesture,false);
audio.destroy();assert.equal(context.state,'closed');audio.unlock();assert.equal(created,1);
// iOS Safari regression: an AudioContext created outside a user gesture can
// stay suspended forever. Warmup must only fetch; the context is born in the
// gesture and the fetched bytes decode right after it.
let made=0;
const ios=new Audio({createContext:()=>{made++;return {...context,state:'suspended',resume(){return Promise.resolve();}};},fetchAudio:async()=>new ArrayBuffer(2),random:()=>.5});
await ios.warmup();
assert.equal(made,0,'warmup never creates an AudioContext outside a gesture');
assert.equal(ios.raw.size,allSamples.size,'warmup still fetched every sample for later decoding');
assert.equal(ios.play('pump'),false,'nothing plays before the first gesture');
ios.unlock();
assert.equal(made,1,'the context is created inside the gesture');
await ios.ready;
assert.equal(ios.buffers.size,allSamples.size,'fetched bytes decode after the gesture');
assert.equal(ios.play('pump'),false,'still silent while suspended');
ios.context.state='running';
assert.equal(ios.play('pump'),true,'sound works once the gesture resumes the context');
ios.destroy();

const unavailable=new Audio({createContext:()=>{throw new Error('unavailable');}});assert.doesNotThrow(()=>unavailable.unlock());assert.equal(unavailable.play('pump'),false);

// Failed loads are not cached forever: after the cooldown the game retries.
let online=false;
const flaky=new Audio({createContext:()=>({...context,state:'running'}),fetchAudio:async()=>{if(!online)throw new Error('offline');return new ArrayBuffer(2);},retryDelay:50});
flaky.unlock();await flaky.ready;assert.equal(flaky.play('pump'),false);
assert.equal(flaky.failures.size>0,true,'the failure is remembered during the cooldown');
assert.equal(await flaky.load('press_01'),null,'the cooldown prevents request floods');
await new Promise(r=>setTimeout(r,60));online=true;
await flaky.load('press_01');
assert.equal(flaky.buffers.has('press_01'),true,'a later gesture retries and recovers the sound');
flaky.destroy();

let finish;
const late=new Audio({createContext:()=>({...context,state:'running'}),fetchAudio:()=>new Promise(resolve=>{finish=resolve;})});
late.unlock();await Promise.resolve();late.begin('pump');late.setEnabled(false);finish(new ArrayBuffer(2));await Promise.resolve();await Promise.resolve();
assert.equal(late.voices.size,0,'late downloads never play automatically after mute/release');late.destroy();
console.log('PASS: per-action timbres, kit on disk, gesture isolation, fade curves, long-hold bed, cancel, retry, mute and disposal');
