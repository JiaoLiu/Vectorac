import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../.vuepress/components/slime-audio.js', import.meta.url), 'utf8');
const {default: Audio, TOOL_SOUNDS} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const param = () => ({value:0,setValueAtTime(v){assert.ok(Number.isFinite(v));},linearRampToValueAtTime(v){assert.ok(Number.isFinite(v));},exponentialRampToValueAtTime(v){assert.ok(v>0 && Number.isFinite(v));}});
const node = () => ({gain:param(),frequency:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),connect(){},disconnect(){},start(){},stop(){}});
const context = {state:'suspended',currentTime:0,sampleRate:8000,destination:node(),createGain:node,createDynamicsCompressor:node,createBufferSource:node,createBiquadFilter:node,createOscillator:node,createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};},resume(){this.state='running';return Promise.resolve();},suspend(){this.state='suspended';return Promise.resolve();},close(){this.state='closed';return Promise.resolve();}};
let created=0;
const audio=new Audio({createContext:()=>{created++;return context;},random:()=>.5});
assert.equal(created,0,'audio is lazy until a user gesture');
audio.setEnabled(false); audio.unlock(); assert.equal(created,0);
audio.setEnabled(true); await audio.resuming; assert.equal(created,1);
for(const material of ['butter','cotton','crystal','liquid','foam','memory','clay'])for(const tool of Object.keys(TOOL_SOUNDS)){
 audio.stop(); assert.equal(audio.play(tool,material),true,material+' '+tool);
}
audio.stop();for(let i=0;i<100;i++)audio.play('pop');
assert.equal(audio.voices.size,8,'rapid actions cannot create unlimited overlapping voices');
audio.setEnabled(false);assert.equal(audio.voices.size,0);assert.equal(audio.play('pump'),false);
audio.setEnabled(true); audio.begin('pump','cotton',.6);audio.end('cotton',false);assert.equal(audio.gesture,false);
audio.begin('pinch','cotton',.6);audio.suspend();assert.equal(audio.voices.size,0);assert.equal(audio.gesture,false);
audio.destroy();assert.equal(context.state,'closed');audio.unlock();assert.equal(created,1);
const unavailable=new Audio({createContext:()=>{throw new Error('unavailable');}});assert.doesNotThrow(()=>unavailable.unlock());assert.equal(unavailable.play('pump'),false);
console.log('PASS: all tool/material voices, lazy unlock, mute, voice cap, cancellation, background, disposal and unsupported audio');
