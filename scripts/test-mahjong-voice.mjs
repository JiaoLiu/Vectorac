import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const result=await build({entryPoints:['.vuepress/components/mahjong/ui.js'],bundle:true,format:'esm',platform:'node',write:false})
const {default:UI}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
globalThis.window={speechSynthesis:{cancel(){}}}
const flush=()=>new Promise(r=>setTimeout(r,8))
function fixture({decode='success'}={}){
 const ui=new UI({querySelector(){return null}})
 ui._els={table:{hidden:false}}
 ui.isOnline=true;ui.net={sendVoice(){return true}};ui.onlinePlayer={seatIndex:0}
 ui.toast=()=>{};ui.showChatBubble=()=>({})
 ui._volCanSet=()=>true
 ui._master={gain:{value:.6}}
 ui._bgm={volume:.4,paused:false,pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}}
 const sources=[],decodes=[]
 const ac={state:'running',currentTime:0,destination:{},
  createGain(){return {gain:{value:0},connect(){},disconnect(){}}},
  createBufferSource(){const s={start(){s.started=true},stop(){s.stopped=true},connect(){}};sources.push(s);return s},
  decodeAudioData(bytes,ok,fail){decodes.push({ok,fail});if(decode==='success')ok({duration:1})}
 }
 ui._ensureAudio=()=>ac
 const receive=id=>ui._onChatMsg({type:'VOICE_MSG',payload:{seatIndex:1,mime:'audio/wav',data:btoa(id),duration:1}})
 return {ui,ac,sources,decodes,receive,close:()=>ui._teardownChat()}
}
test('FIFO; recorded voice outranks every announcement even with game sound disabled',async()=>{
 const f=fixture(),{ui,sources,receive}=f
 ui.settings.sound=false
 receive('A');receive('B');receive('C')
 assert.equal(sources.length,1);assert.equal(ui._voiceQueue.length,2)
 assert.equal(atob(ui._voiceActive.entry.data),'A');assert.equal(ui._master.gain.value,0)
 assert.equal(ui._bgm.paused,true)
 assert.equal(ui._bgm.volume,.4*.08)
 ui.settings.sound=true
 for(const key of ['wan1','peng','gang','hu','zimo','phrase-0'])ui.speak(key,'test')
 assert.equal(sources[0].stopped,undefined,'announcements cannot stop the player')
 for(const expected of ['B','C']){sources.at(-1).onended();await flush();assert.equal(atob(ui._voiceActive.entry.data),expected)}
 sources.at(-1).onended();await flush()
 assert.equal(ui._voiceActive,null);assert.equal(ui._master.gain.value,.6);assert.equal(ui._bgm.volume,.4)
 f.close()
})
test('recording pauses current voice at queue head; arrivals wait until tracks close',async()=>{
 const f=fixture(),{ui,sources,receive}=f
 receive('A');receive('B')
 ui._recStarting=true;ui._pauseVoiceQueue();receive('C')
 assert.ok(sources[0].stopped);assert.deepEqual(ui._voiceQueue.map(e=>atob(e.data)),['A','B','C'])
 ui._recStarting=false;ui._recStream={getTracks:()=>[{stop(){}}]}
 ui._drainVoiceQueue();assert.equal(sources.length,1,'onstop window remains blocked')
 ui._recStartAt=Date.now()-200;ui._recChunks=[]
 ui._finishVoiceRec()
 assert.equal(sources.length,1,'wait for audio-session handoff')
 ui._voiceResumeAt=0;ui._drainVoiceQueue()
 assert.equal(atob(ui._voiceActive.entry.data),'A');assert.equal(sources.length,2)
 sources[0].onended();assert.equal(atob(ui._voiceActive.entry.data),'A','stale ended cannot consume restarted voice')
 sources[1].onended();await flush();assert.equal(atob(ui._voiceActive.entry.data),'B')
 f.close()
})
test('game actions and direct countdown notes never open audio during player playback',()=>{
 const f=fixture(),{ui,receive,sources}=f;receive('A')
 ui._ensureAudio=()=>{throw Error('game action must not resume or create audio during voice')}
 for(let i=0;i<100;i++){
  for(const type of ['discard','click','draw','peng','gang','hu','dice'])ui.sound(type)
  ui._note(990);ui._duckBgm(i%2===0)
 }
 assert.equal(ui._master.gain.value,0);assert.equal(ui._bgm.paused,true)
 assert.equal(sources[0].stopped,undefined);assert.equal(atob(ui._voiceActive.entry.data),'A');f.close()
})
test('voice switch pauses/retains FIFO independently of sound switch',()=>{
 const f=fixture(),{ui,receive,sources}=f
 ui.settings.voice=false;receive('A');receive('B');assert.equal(sources.length,0)
 ui.settings.sound=false;ui.settings.voice=true;ui._drainVoiceQueue();assert.equal(sources.length,1)
 ui.settings.voice=false;ui._pauseVoiceQueue();assert.ok(sources[0].stopped)
 ui.settings.voice=true;ui._drainVoiceQueue();assert.equal(atob(ui._voiceActive.entry.data),'A')
 assert.equal(ui.settings.sound,false);f.close()
})
test('manual replay queues without preemption or duplicate pending entries',()=>{
 const f=fixture(),{ui,receive}=f;receive('A')
 const bubble={};ui._playVoiceData('audio/wav',btoa('B'),bubble);ui._playVoiceData('audio/wav',btoa('B'),bubble)
 assert.equal(atob(ui._voiceActive.entry.data),'A');assert.equal(ui._voiceQueue.length,1);f.close()
})
test('late decode failure after recording pause cannot resurrect or replace another job',()=>{
 const f=fixture({decode:'pending'}),{ui,receive,decodes}=f
 receive('A');ui._recStarting=true;ui._pauseVoiceQueue();receive('B')
 ui._recStarting=false;ui._drainVoiceQueue()
 const job=ui._voiceActive
 let fallback=0;ui._playVoiceViaElement=()=>{fallback++}
 decodes[0].fail();decodes[0].ok({duration:1})
 assert.equal(fallback,0);assert.equal(ui._voiceActive,job);f.close()
})
test('WebAudio fallback retains the same queue slot; element end advances once',async()=>{
 const elements=[]
 globalThis.Audio=class {constructor(){elements.push(this)}play(){return Promise.resolve()}pause(){}}
 const f=fixture({decode:'pending'}),{ui,receive,decodes}=f
 receive('A');receive('B');const job=ui._voiceActive
 decodes[0].fail();assert.equal(elements.length,1);assert.equal(ui._voiceActive,job)
 ui._ensureAudio=()=>{throw Error('fallback player must not overlap game WebAudio')}
 ui.sound('discard');ui._note(990);ui.speak('gang','杠')
 assert.equal(ui._master.gain.value,0);assert.equal(ui._bgm.paused,true)
 decodes[0].fail();assert.equal(elements.length,1,'late callback cannot start duplicate fallback')
 elements[0].onended();await flush();assert.equal(atob(ui._voiceActive.entry.data),'B');f.close()
})
test('mute-volume-limited platform pauses BGM until actual player voice completion',async()=>{
 const f=fixture(),{ui,receive,sources}=f;ui._volCanSet=()=>false
 receive('A');receive('B');assert.equal(ui._bgm.paused,true)
 sources[0].onended();await flush();assert.equal(ui._bgm.paused,true)
 sources[1].onended();await flush();assert.equal(ui._bgm.paused,false);f.close()
})
test('BGM paused by an earlier announcement resumes after player voice',async()=>{
 const f=fixture(),{ui,receive,sources}=f;ui._volCanSet=()=>false
 ui._duckBgmComm(.2);receive('A')
 await new Promise(r=>setTimeout(r,220))
 assert.equal(ui._bgm.paused,true)
 sources[0].onended();await flush();assert.equal(ui._bgm.paused,false);f.close()
})
test('leaving clears active and pending voice; old callbacks cannot resume queue',async()=>{
 const f=fixture(),{ui,receive,sources}=f;receive('A');receive('B');f.close()
 assert.equal(ui._voiceQueue.length,0);assert.equal(ui._voiceActive,null)
 sources[0].onended();await flush();assert.equal(sources.length,1)
})
test('denied microphone permission resumes the paused head message',async()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator')
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{throw Error('denied')}}}})
 globalThis.MediaRecorder=class {}
 const f=fixture(),{ui,receive,sources}=f;receive('A');receive('B')
 try {await ui.startVoiceRec();assert.equal(sources.length,2);assert.equal(atob(ui._voiceActive.entry.data),'A')}
 finally {f.close();if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator}
})

test('failed BGM resume keeps intent and retries; manual music off remains off',async()=>{
 const f=fixture(),{ui,receive,sources}=f;let attempts=0
 ui._bgm.play=function(){attempts++;if(attempts===1)return Promise.reject(Error('session switching'));this.paused=false;return Promise.resolve()}
 receive('A');sources[0].onended();await flush()
 assert.equal(ui._voiceBgmHolding,true);assert.equal(ui._bgm.paused,true)
 await new Promise(r=>setTimeout(r,450))
 assert.equal(attempts,2);assert.equal(ui._voiceBgmHolding,false);assert.equal(ui._bgm.paused,false)
 receive('B');ui.settings.music=false;sources[1].onended();await flush()
 assert.equal(ui._bgm.paused,true);assert.equal(attempts,2);f.close()
})

test('native media playback uses playback session without creating WebAudio',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldAudio=globalThis.Audio
 const session={type:'play-and-record'}
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{audioSession:session}})
 let element
 globalThis.Audio=class {constructor(){element=this}play(){return Promise.resolve()}pause(){}}
 const f=fixture(),{ui,receive}=f;ui._preferVoiceMedia=()=>true
 ui._ensureAudio=()=>{throw Error('native recording should not create a WebAudio context')}
 try {receive('A');assert.equal(session.type,'playback');assert.equal(ui._voiceMsgPlaying,element)}
 finally {f.close();globalThis.Audio=oldAudio;if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator}
})

test('recording switches session; microphone denial restores playback',async()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');const session={type:'playback'}
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{audioSession:session,mediaDevices:{getUserMedia:async()=>{
  assert.equal(session.type,'play-and-record');throw Error('denied')
 }}}})
 const f=fixture()
 try {await f.ui.startVoiceRec();assert.equal(session.type,'playback')}
 finally {f.close();if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator}
})

test('autoplay rejection keeps FIFO; next ordinary gesture retries on the same element',async()=>{
 const old=globalThis.Audio;let created=0,allowed=false,plays=0
 globalThis.Audio=class {constructor(){created++}pause(){}play(){plays++;return allowed?Promise.resolve():Promise.reject(Object.assign(Error('gesture required'),{name:'NotAllowedError'}))}}
 const f=fixture(),{ui,receive}=f;ui._preferVoiceMedia=()=>true
 try {
  receive('A');receive('B');await flush()
  assert.equal(ui._voiceActive,null);assert.equal(ui._voicePlaybackBlocked,true)
  assert.deepEqual(ui._voiceQueue.map(e=>atob(e.data)),['A','B'])
  receive('C');assert.equal(plays,1,'no retry storm while blocked')
  allowed=true;ui._resumeVoiceFromGesture()
  assert.equal(atob(ui._voiceActive.entry.data),'A');assert.equal(created,1)
  ui._voiceElement.onended();await flush()
  assert.equal(atob(ui._voiceActive.entry.data),'B');assert.equal(created,1)
  ui._voiceElement.onended();await flush()
  assert.equal(atob(ui._voiceActive.entry.data),'C');assert.equal(created,1)
 } finally {f.close();globalThis.Audio=old}
})

test('entry gesture primes the reusable voice element, later messages do not create new elements',async()=>{
 const old=globalThis.Audio;let created=0
 globalThis.Audio=class {constructor(){created++}pause(){}play(){return Promise.resolve()}}
 const f=fixture(),{ui,receive}=f;ui._preferVoiceMedia=()=>true
 try {
  ui._resumeVoiceFromGesture();assert.equal(created,1);await flush();assert.equal(ui._voicePrimed,true)
  const player=ui._voiceElement;receive('A');assert.equal(ui._voiceMsgPlaying,player)
  ui._voiceElement.onended();await flush();receive('B');assert.equal(ui._voiceMsgPlaying,player);assert.equal(created,1)
 } finally {f.close();globalThis.Audio=old}
})
