import test from 'node:test'
import assert from 'node:assert/strict'
import {createWardrobeAudio} from '../.vuepress/components/dressup/audio.mjs'
test('gesture unlock, independent controls, background pause and complete disposal',()=>{
 const audios=[],contexts=[],tones=[]
 class Audio{constructor(src){this.src=src;this.paused=true;audios.push(this)}play(){this.paused=false;return Promise.resolve()}pause(){this.paused=true}removeAttribute(){this.src=''}load(){}}
 class Ctx{constructor(){this.state='running';this.currentTime=1;contexts.push(this)}createOscillator(){const o={frequency:{},connect(){},disconnect(){},start(){tones.push(o)},stop(){}};return o}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}close(){this.closed=true;return Promise.resolve()}}
 const a=createWardrobeAudio({Audio,AudioContext:Ctx});assert.equal(audios.length,0);assert.equal(contexts.length,0)
 a.unlock();assert.equal(audios[0].paused,false);assert.equal(audios[0].loop,true);a.play('dress');assert.equal(tones.length,2)
 a.effects(false);contexts[0].currentTime++;a.play('reward');assert.equal(tones.length,2);assert.equal(audios[0].paused,false)
 a.music(false);assert.equal(audios[0].paused,true);a.effects(true);contexts[0].currentTime++;a.play('color');assert.equal(tones.length,3)
 a.music(true);a.pause(true);assert.equal(audios[0].paused,true);a.pause(false);assert.equal(audios[0].paused,false)
 a.destroy();assert.equal(audios[0].paused,true);assert.equal(audios[0].src,'');assert.equal(contexts[0].closed,true);a.unlock();assert.equal(audios.length,1)
})
