import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../.vuepress/components/slime-audio.js', import.meta.url), 'utf8');
const {default: Audio, TOOL_SOUNDS} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const param = () => ({value:0,setValueAtTime(v){assert.ok(Number.isFinite(v));},linearRampToValueAtTime(v){assert.ok(Number.isFinite(v));},exponentialRampToValueAtTime(v){assert.ok(v>0 && Number.isFinite(v));}});
const node = () => ({gain:param(),playbackRate:param(),frequency:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),connect(){},disconnect(){},start(){},stop(){this.stops=(this.stops||0)+1;}});
const context = {state:'suspended',currentTime:0,sampleRate:8000,destination:node(),createGain:node,createDynamicsCompressor:node,createBufferSource:node,createBiquadFilter:node,createOscillator:node,createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};},resume(){this.state='running';return Promise.resolve();},suspend(){this.state='suspended';return Promise.resolve();},close(){this.state='closed';return Promise.resolve();}};
let created=0;
context.decodeAudioData=async()=>({duration:.5});
let requests=0;
const audio=new Audio({createContext:()=>{created++;return context;},fetchAudio:async()=>{requests++;return new ArrayBuffer(2);},random:()=>.5});
assert.equal(created,0,'audio is lazy until a user gesture');
audio.setEnabled(false); audio.unlock(); assert.equal(created,0);
audio.setEnabled(true); await audio.resuming; assert.equal(created,1);
const kitSize = new Set(Object.values(TOOL_SOUNDS).flat()).size;
await audio.ready;assert.equal(requests,kitSize);assert.equal(audio.buffers.size,kitSize);
for(const material of ['butter','cotton','crystal','liquid','foam','memory','clay'])for(const tool of Object.keys(TOOL_SOUNDS)){
 audio.stop(); assert.equal(audio.play(tool,material),true,material+' '+tool);
}
const studio = await readFile(new URL('../.vuepress/components/SlimeStudio.js', import.meta.url), 'utf8');
for(const key of new Set([...studio.matchAll(/audio\.(?:play|begin)\(\s*['"]([a-z]+)['"]/g)].map(match=>match[1])))
 assert.ok(TOOL_SOUNDS[key],'SlimeStudio triggers "'+key+'" but no recording is mapped to it');
audio.stop();for(let i=0;i<100;i++)audio.play('pop');
assert.equal(audio.voices.size,3,'rapid actions cannot create unlimited overlapping voices');
audio.stop();audio.begin('pump','butter',.6);
const first=audio.lastSample.pump;
for(let i=0;i<600;i++)audio.tick(1/60,'pump','butter',.6,0);
assert.equal(audio.voices.size,1,'holding still never repeats a knocking rhythm');
audio.stop();audio.play('pump');assert.notEqual(audio.lastSample.pump,first,'successive pokes use different recordings');
audio.stop();audio.begin('pinch');audio.clock=0;audio.tick(.2,'pinch','butter',.6,1);
assert.equal(audio.voices.size,2,'rubbing movement triggers another wet sample');
audio.setEnabled(false);assert.equal(audio.voices.size,0);assert.equal(audio.play('pump'),false);
// A quick tap ducks the long squish instead of letting it ring out in full.
audio.setEnabled(true); audio.begin('pump','butter',.6);
assert.equal(audio.voices.size,1);
const tapped=[...audio.voices][0];
assert.equal(tapped.sources[0].stops,1,'only the natural end is scheduled while holding');
audio.end('butter',false);
assert.equal(tapped.sources[0].stops,2,'releasing a short press schedules an early fade-out stop');
assert.equal(audio.gesture,false);
// A long hold leaves the sample alone and ends naturally.
audio.stop();audio.begin('pump','butter',.6);
context.currentTime=.9;audio.end('butter',false);
assert.equal([...audio.voices][0].sources[0].stops,1,'long presses ring out to the natural end');
context.currentTime=0;
audio.setEnabled(true); audio.begin('pump','cotton',.6);audio.end('cotton',false);assert.equal(audio.gesture,false);
audio.begin('pinch','cotton',.6);audio.suspend();assert.equal(audio.voices.size,0);assert.equal(audio.gesture,false);
audio.destroy();assert.equal(context.state,'closed');audio.unlock();assert.equal(created,1);
const unavailable=new Audio({createContext:()=>{throw new Error('unavailable');}});assert.doesNotThrow(()=>unavailable.unlock());assert.equal(unavailable.play('pump'),false);
const failed=new Audio({createContext:()=>({...context,state:'running'}),fetchAudio:async()=>{throw new Error('offline');}});
failed.unlock();await failed.ready;assert.equal(failed.play('pump'),false);failed.destroy();
let finish;
const late=new Audio({createContext:()=>({...context,state:'running'}),fetchAudio:()=>new Promise(resolve=>{finish=resolve;})});
late.unlock();await Promise.resolve();late.begin('pump');late.setEnabled(false);finish(new ArrayBuffer(2));await Promise.resolve();await Promise.resolve();
assert.equal(late.voices.size,0,'late downloads never play automatically after mute/release');late.destroy();
console.log('PASS: all tool/material voices, lazy unlock, mute, voice cap, cancellation, background, disposal and unsupported audio');
