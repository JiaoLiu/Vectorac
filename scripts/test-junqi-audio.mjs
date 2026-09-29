import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const source=await readFile(new URL('../.vuepress/components/junqi/audio.js',import.meta.url),'utf8')
const {createJunqiAudio}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))
test('gesture-created audio, independent switches, pause and complete cleanup',async()=>{
 let contexts=0,notes=0,closed=0,current
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}})
 class Audio{
  constructor(){contexts++;current=this;this.state='suspended';this.currentTime=0;this.destination={}}
  createGain(){return {gain:param(),connect(){},disconnect(){}}}
  createOscillator(){return {frequency:param(),connect(){},disconnect(){},start(){notes++},stop(){}}}
  resume(){this.state='running';return Promise.resolve()}
  close(){closed++;return Promise.resolve()}
 }
 globalThis.window={AudioContext:Audio}
 const audio=createJunqiAudio()
 try{
  assert.equal(contexts,0);audio.play();assert.equal(notes,0)
  audio.unlock();await Promise.resolve();assert.equal(contexts,1)
  assert.ok(notes>0,'music starts by default after the gesture')
  const musicNotes=notes;audio.play('move');assert.equal(notes,musicNotes+2)
  audio.effects(false);audio.play('win');assert.equal(notes,musicNotes+2)
  audio.pause(true);current.state='suspended';const backgroundNotes=notes
  audio.pause(false);await Promise.resolve();assert.equal(current.state,'running');assert.ok(notes>backgroundNotes,'music automatically resumes after background')
  audio.music(true);const played=notes
  audio.pause(true);audio.play('both');assert.equal(notes,played)
  audio.music(false);audio.pause(false);assert.equal(notes,played)
  audio.effects(true);audio.play('both');assert.equal(notes,played+2)
 }finally{audio.destroy();delete globalThis.window}
 assert.equal(closed,1)
})
