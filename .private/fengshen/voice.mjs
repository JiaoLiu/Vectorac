import {AUDIO_ENTRIES,audioPath} from './audio-manifest.mjs'
import {heroForBase} from './theme.mjs'
import {skillAudioKey} from './audio-manifest.mjs'
const allowed=new Set(AUDIO_ENTRIES.map(e=>e.key))
export class CardVoice {
  constructor({enabled=true,createContext=()=>{const C=window.AudioContext||window.webkitAudioContext;return C?new C():null},fetchAudio=url=>fetch(url),onIdle=()=>{}}={}){
    this.enabled=enabled;this.createContext=createContext;this.fetchAudio=fetchAudio;this.onIdle=onIdle;this.context=null;this.ready=null;this.queue=[];this.cache=new Map();this.busy=false;this.generation=0;this.history=[];this.source=null;this.closed=false;this.effects=new Set()
  }
  unlock(){
    if(this.closed||!this.enabled)return Promise.resolve(false)
    try{
      this.context ||= this.createContext();if(!this.context)return Promise.resolve(false)
      const c=this.context
      this.ready=Promise.resolve(c.resume()).then(()=>{
        const source=c.createBufferSource();source.buffer=c.createBuffer(1,1,c.sampleRate);source.connect(c.destination);source.start();return true
      }).catch(()=>false)
      return this.ready
    }catch{return Promise.resolve(false)}
  }
  speak(key,sex='male'){
    if(this.closed||!this.enabled||!allowed.has(key)||!this.context)return false
    const item={key,sex:sex==='female'?'female':'male'};this.queue.push(item)
    this.history.push({...item,status:'queued'});this.history=this.history.slice(-80)
    this.drain();return true
  }
  async buffer(url){
    if(!this.cache.has(url))this.cache.set(url,(async()=>{const r=await this.fetchAudio(url);if(!r.ok)throw new Error('Audio '+r.status);return this.context.decodeAudioData(await r.arrayBuffer())})().catch(e=>{this.cache.delete(url);throw e}))
    return this.cache.get(url)
  }
  async hurt(amount=1){
    if(this.closed||!this.enabled||!this.context)return false
    const generation=this.generation,cue={key:'sfx-damage',amount}
    this.history.push({...cue,status:'queued'})
    try{
      if(!await this.ready)return false
      const buffer=await this.buffer('assets/audio/sfx/damage.wav')
      if(this.closed||!this.enabled||generation!==this.generation)return false
      const source=this.context.createBufferSource(),gain=this.context.createGain?.();source.buffer=buffer
      if(gain){gain.gain.value=.5;source.connect(gain);gain.connect(this.context.destination)}else source.connect(this.context.destination)
      this.effects.add(source)
      source.onended=()=>{this.effects.delete(source);source.disconnect();gain?.disconnect();if(generation===this.generation){this.history.push({...cue,status:'played'});this.history=this.history.slice(-80);this.onIdle()}}
      source.start();return true
    }catch(error){this.history.push({...cue,status:'failed'});console.warn('[封神受伤音效]',error.message);return false}
  }
  async drain(){
    if(this.busy||this.closed)return
    this.busy=true;const generation=this.generation
    try{
      if(!await this.ready){this.queue=[];return}
      while(this.enabled&&!this.closed&&generation===this.generation&&this.queue.length){
        const cue=this.queue.shift()
        try{
          const buffer=await this.buffer(audioPath(cue.key,cue.sex))
          if(this.closed||generation!==this.generation||!this.enabled)break
          const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);this.source=source
          await new Promise((resolve,reject)=>{source.onended=()=>{source.disconnect();resolve()};try{source.start()}catch(e){source.disconnect();reject(e)}})
          this.history.push({...cue,status:'played'});this.history=this.history.slice(-80)
        }catch(error){this.history.push({...cue,status:'failed'});console.warn('[封神报牌]',cue.key,error.message)}
      }
    }finally{
      this.source=null;this.busy=false
      if(this.queue.length&&this.enabled&&!this.closed)this.drain();else this.onIdle()
    }
  }
  setEnabled(enabled){this.enabled=!!enabled;if(!enabled)this.stop();else this.unlock()}
  stop(){this.generation++;this.queue=[];if(this.source){try{this.source.stop()}catch{}}for(const source of this.effects){try{source.stop()}catch{}}this.effects.clear()}
  destroy(){this.closed=true;this.stop();this.context?.close().catch(()=>{})}
}
// Announce the effective card, not its physical disguise (e.g. Longdan Dodge
// used as Slash). Illegal actions and save loading never produce duplicate cues.
export function cuesForAction(before,action,after){
  const seat=action.seat??0,cues=[],type=action.type==='play'?action.as||before.players[seat].hand.find(c=>c.id===action.ids?.[0])?.type:action.type==='respond'&&before.pending?.kind!=='axe'?before.pending?.as:null
  if(type)cues.push({key:`card-${type}`,sex:displaySex(before,seat)})
  if(action.type==='skill')cues.push({key:skillAudioKey(before.players[seat].heroId,action.skill),sex:displaySex(before,seat)})
  for(const line of after.logs.filter(l=>l.id>before.eventId).slice().reverse())if(line.cue?.kind==='skill'&&after.players[line.cue.seat])cues.push({key:skillAudioKey(after.players[line.cue.seat].heroId,line.cue.skill),sex:displaySex(after,line.cue.seat)})
  return cues
}
function displaySex(state,seat){return heroForBase(state.players[seat].heroId)?.sex||'male'}
