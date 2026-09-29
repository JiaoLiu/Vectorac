import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../.vuepress/components/junqi/audio.js',import.meta.url),'utf8')
const {createJunqiAudio}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
test('gesture-created audio, independent switches, pause and complete cleanup',async()=>{
 let contexts=0,notes=0,closed=0,current,media
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}})
 class Audio{
  constructor(){contexts++;current=this;this.state='suspended';this.currentTime=0;this.destination={}}
  createGain(){return {gain:param(),connect(){},disconnect(){}}}
  createOscillator(){return {frequency:param(),connect(){},disconnect(){},start(){notes++},stop(){}}}
  resume(){this.state='running';return Promise.resolve()}
  close(){closed++;return Promise.resolve()}
 }
 class MediaAudio{
  constructor(src){media=this;this.src=src;this.paused=true;this.loop=false;this.volume=1;this.listeners={};this.playCalls=0}
  addEventListener(name,fn){this.listeners[name]=fn}
  play(){this.paused=false;this.playCalls++;return Promise.resolve()}
  pause(){this.paused=true}
  removeAttribute(name){if(name==='src')this.src=''}
  load(){}
 }
 globalThis.window={AudioContext:Audio,Audio:MediaAudio}
 const audio=createJunqiAudio()
 try{
  assert.equal(contexts,0);audio.play();assert.equal(notes,0)
  audio.unlock();assert.equal(media.paused,false,'HTML audio starts synchronously inside the user gesture');await Promise.resolve();assert.equal(contexts,1)
  assert.equal(media.src,'/audio/junqi/clash-defiant.mp3');assert.equal(media.loop,true)
  assert.equal(media.paused,false,'music starts after the gesture')
  const musicNotes=notes;audio.play('move');assert.equal(notes,musicNotes+2)
  audio.effects(false);audio.play('win');assert.equal(notes,musicNotes+2)
  audio.pause(true);assert.equal(media.paused,true)
  audio.pause(false);await Promise.resolve();assert.equal(media.paused,false,'music resumes after returning from background')
  audio.music(false);assert.equal(media.paused,true)
  audio.pause(true);audio.pause(false);assert.equal(media.paused,true,'turning music off remains respected after backgrounding')
  audio.music(true);assert.equal(media.paused,false)
  audio.effects(true);const beforeEffects=notes;audio.play('both');assert.equal(notes,beforeEffects+2)
 }finally{audio.destroy();delete globalThis.window}
 assert.equal(closed,1)
 assert.equal(media.src,'')
})

test('a missing battle track stays silent while sound effects still work',async()=>{
 let notes=0,current,media
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}})
 class AudioContextMock{
  constructor(){current=this;this.state='suspended';this.currentTime=0;this.destination={}}
  createGain(){return {gain:param(),connect(){},disconnect(){}}}
  createOscillator(){return {frequency:param(),connect(){},disconnect(){},start(){notes++},stop(){}}}
  resume(){this.state='running';return Promise.resolve()}
  close(){return Promise.resolve()}
 }
 class MediaAudioMock{
  constructor(){media=this;this.paused=true;this.listeners={}}
  addEventListener(name,fn){this.listeners[name]=fn}
  play(){this.paused=false;return Promise.resolve()}
  pause(){this.paused=true}
  removeAttribute(){}
  load(){}
 }
 globalThis.window={AudioContext:AudioContextMock,Audio:MediaAudioMock}
 const audio=createJunqiAudio()
 try{
  audio.unlock();await Promise.resolve()
  const before=notes
  assert.equal(media.paused,false)
  media.listeners.error()
  assert.equal(notes,before,'a missing track does not restart the rejected synthesized loop')
  audio.play('move')
  assert.equal(notes,before+2,'sound effects remain available when the music asset fails')
 }finally{audio.destroy();delete globalThis.window}
})

test('a rejected music decode is contained and does not retry on every gesture',async()=>{
 let playCalls=0
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}})
 class AudioContextMock{
  constructor(){this.state='suspended';this.currentTime=0;this.destination={}}
  createGain(){return {gain:param(),connect(){},disconnect(){}}}
  createOscillator(){return {frequency:param(),connect(){},disconnect(){},start(){},stop(){}}}
  resume(){this.state='running';return Promise.resolve()}
  close(){return Promise.resolve()}
 }
 class MediaAudioMock{
  constructor(){this.paused=true}
  addEventListener(){}
  play(){playCalls++;return Promise.reject(Object.assign(new Error('unsupported audio'),{name:'NotSupportedError'}))}
  pause(){this.paused=true}
  removeAttribute(){}
  load(){}
 }
 globalThis.window={AudioContext:AudioContextMock,Audio:MediaAudioMock}
 const audio=createJunqiAudio()
 try{
  audio.unlock()
  await new Promise(resolve=>setImmediate(resolve))
  audio.unlock()
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(playCalls,1,'a failed decode is contained and does not create an unhandled retry loop')
 }finally{audio.destroy();delete globalThis.window}
})
