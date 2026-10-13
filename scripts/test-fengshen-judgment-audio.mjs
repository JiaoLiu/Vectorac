import test from 'node:test'
import assert from 'node:assert/strict'
import {judgmentSamples,JUDGMENT_SOUND_SECONDS} from '../site/.vuepress/components/fengshen/judgment-audio.mjs'
import {CardVoice} from '../site/.vuepress/components/fengshen/voice.mjs'
for(const kind of ['prison','ration','thunder','fire','chain','unchain'])test(`${kind} Foley is finite, bounded and non-silent at mobile sample rates`,()=>{
 for(const rate of [22050,44100,48000]){const data=judgmentSamples(kind,rate);assert.equal(data.length,Math.ceil(rate*JUDGMENT_SOUND_SECONDS));let power=0;for(const v of data){assert.ok(Number.isFinite(v));assert.ok(Math.abs(v)<=.751);power+=v*v}assert.ok(Math.sqrt(power/data.length)>.015);assert.equal(Math.abs(data[0]),0)}
})
function audio(){const sources=[],ctx={state:'running',sampleRate:22050,currentTime:0,destination:{},resume:async()=>true,close:async()=>{},createBuffer:(_,n)=>({getChannelData:()=>new Float32Array(n)}),createGain:()=>({gain:{value:1},connect(){},disconnect(){}}),createBufferSource(){const source={connect(){},disconnect(){},start(...args){this.started=args},stop(){this.stopped=true;this.onended?.()}};sources.push(source);return source}};return {sources,ctx}}
test('judgment sounds obey mute and suspended/expired contexts without blocking speech or gameplay',async()=>{
 const {ctx,sources}=audio(),v=new CardVoice({createContext:()=>ctx});await v.unlock()
 assert.equal(await v.judgmentSound('prison'),true);assert.equal(v.effects.size,1);assert.equal(v.busy,false);assert.equal(v.queue.length,0);assert.equal(v.history.at(-1).key,'sfx-judgment-prison')
 const first=sources.at(-1);assert.ok(first.started[1]<.2)
 v.setEnabled(false);assert.equal(first.stopped,true);assert.equal(v.effects.size,0);assert.equal(await v.judgmentSound('prison'),false)
 v.enabled=true;ctx.state='suspended';const count=sources.length;assert.equal(await v.judgmentSound('thunder'),false);assert.equal(sources.length,count,'no stale suspended scheduling')
 ctx.state='running';assert.equal(await v.judgmentSound('thunder',{elapsed:2000}),false);assert.equal(await v.judgmentSound('unknown'),false);assert.equal(sources.length,count)
 assert.equal(await v.judgmentSound('ration'),true);sources.at(-1).onended();assert.equal(v.effects.size,0);assert.equal(v.history.at(-1).status,'played');v.destroy()
})
test('a hanging resume cannot queue stale judgment sound or leave the game busy',async()=>{
 const {ctx}=audio(),v=new CardVoice({createContext:()=>ctx});await v.unlock();v.ready=new Promise(()=>{});assert.equal(await v.judgmentSound('prison'),false);assert.equal(v.effects.size,0);assert.equal(v.busy,false);v.destroy()
})
test('mute during readiness drops the pending sound rather than playing it later',async()=>{
 const {ctx}=audio(),v=new CardVoice({createContext:()=>ctx});await v.unlock();let ready;v.ready=new Promise(r=>ready=r);const pending=v.judgmentSound('prison');v.setEnabled(false);ready(true);assert.equal(await pending,false);assert.equal(v.effects.size,0);v.destroy()
})
