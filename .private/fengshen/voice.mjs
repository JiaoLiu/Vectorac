import {AUDIO_ENTRIES,audioPath} from './audio-manifest.mjs'
import {heroForBase,CARDS_BY_TYPE} from './theme.mjs'
import {skillAudioKey} from './audio-manifest.mjs'
const allowed=new Set(AUDIO_ENTRIES.map(e=>e.key))
// 一帧里最多补播几条历史事件：正常单手最多 2 条（见 cuesForAction 注释），超出说明是断线/后台补帧。
const MAX_BACKLOG_CUES=2
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
  // 给任意 await 加一个上限：音频上下文 resume、fetch/decode、onended 都可能永久挂起。
  // 只要 drain 卡在其中一步，busy 就永远不复位，schedule() 会被无限推迟，整局 AI 都不出牌。
  deadline(promise,ms,value){
    let timer
    return Promise.race([Promise.resolve(promise),new Promise(resolve=>{timer=setTimeout(()=>resolve(value),ms)})]).finally(()=>clearTimeout(timer))
  }
  async drain(){
    if(this.busy||this.closed)return
    this.busy=true;const generation=this.generation
    try{
      if(!await this.deadline(this.ready,2000,false)){this.queue=[];return}
      while(this.enabled&&!this.closed&&generation===this.generation&&this.queue.length){
        const cue=this.queue.shift()
        try{
          const buffer=await this.deadline(this.buffer(audioPath(cue.key,cue.sex)).catch(()=>null),4000,null)
          if(!buffer)throw new Error('音频加载超时')
          if(this.closed||generation!==this.generation||!this.enabled)break
          const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);this.source=source
          // onended 在页面后台（AudioContext 挂起）可能不会触发；stop() 的 interrupt 只在主动停止时生效。
          // 再按片段时长兜底：即使 onended 始终不来，也要在有限时间内复位 busy，AI 调度才不会被永久推迟。
          await new Promise((resolve,reject)=>{
            let settled=false
            const finish=ok=>{if(settled)return;settled=true;clearTimeout(guard);this.interrupt=null;try{source.disconnect()}catch{};ok?resolve():reject(new Error('播放失败'))}
            const guard=setTimeout(()=>finish(true),Math.max(1500,((buffer.duration||2)*1000)+600))
            this.interrupt=()=>finish(true)
            source.onended=()=>finish(true)
            try{source.start()}catch{finish(false)}
          })
          this.history.push({...cue,status:'played'});this.history=this.history.slice(-80)
        }catch(error){this.history.push({...cue,status:'failed'});console.warn('[封神报牌]',cue.key,error.message)}
      }
    }finally{
      // 只在本次 drain 仍然是"当前代"时复位：stop() 会提升 generation 并抢先复位，
      // 若此时套用旧一代的收尾，会把新一代（刚开局的语音）的 busy 提前松掉造成并发播放。
      if(generation===this.generation){this.source=null;this.busy=false}
      if(this.queue.length&&this.enabled&&!this.closed)this.drain();else this.onIdle()
    }
  }
  setEnabled(enabled){this.enabled=!!enabled;if(!enabled)this.stop();else this.unlock()}
  // stop() 清空队列并提升 generation；同时立刻复位 busy——否则若 drain 正卡在某个 await 上
  // （音频上下文 resume、fetch/decode 或 onended 未触发），busy 会一直为真，重开一局后 AI 再也不出牌。
  stop(){this.generation++;this.queue=[];if(this.source){try{this.source.stop()}catch{}}for(const source of this.effects){try{source.stop()}catch{}}this.effects.clear();this.interrupt?.();this.interrupt=null;this.busy=false}
  destroy(){this.closed=true;this.stop();this.context?.close().catch(()=>{})}
}
// Announce the effective card, not its physical disguise (e.g. Longdan Dodge
// used as Slash). Illegal actions and save loading never produce duplicate cues.
export function cuesForAction(before,action,after){
  const seat=action.seat??0,cues=[],type=action.type==='play'?action.as||before.players[seat].hand.find(c=>c.id===action.ids?.[0])?.type:action.type==='respond'&&before.pending?.kind!=='axe'?before.pending?.as:null
  if(type&&type!=='judgment'){const physical=before.players[seat].hand.concat(Object.values(before.players[seat].equip).filter(Boolean)).find(c=>c.id===action.ids?.[0]);const effective=type==='sha'&&CARDS_BY_TYPE[physical?.type]?.attackNature?physical.type:action.as==='wine'?'wine':type;cues.push({key:`card-${effective}`,sex:displaySex(before,seat)})}
  if(['play','respond'].includes(action.type)&&['indulgence','tao'].includes(action.as)&&action.ids?.length===1){const c=before.players[seat].hand.concat(Object.values(before.players[seat].equip).filter(Boolean)).find(c=>c.id===action.ids[0]);if(c&&c.type!==action.as)cues.push({key:skillAudioKey(before.players[seat],action.as==='tao'?'jijiu':'guose'),sex:displaySex(before,seat)})}
  if(action.type==='skill')cues.push({key:skillAudioKey(before.players[seat],action.skill),sex:displaySex(before,seat)})
  if(action.type==='play'){const p=before.players[seat],card=p.hand.concat(Object.values(p.equip).filter(Boolean)).find(c=>c.id===action.ids?.[0]),skill=action.as==='arrows'&&action.ids?.length===2?'luanji':action.as==='supplyshortage'&&card?.type!=='supplyshortage'?'duanliang':action.as==='fireattack'&&card?.type!=='fireattack'?'huoji':action.as==='ironchain'&&card?.type!=='ironchain'?'lianhuan':null;if(skill)cues.push({key:skillAudioKey(p,skill),sex:displaySex(before,seat)})}
  if(action.type==='play'&&action.as==='dismantle'&&action.ids?.length===1){const c=before.players[seat].hand.concat(Object.values(before.players[seat].equip).filter(Boolean)).find(c=>c.id===action.ids[0]);if(c&&c.type!=='dismantle')cues.push({key:skillAudioKey(before.players[seat],'qixi'),sex:displaySex(before,seat)})}
  if(action.type==='respond'&&before.pending?.as==='shan'&&action.ids?.length===1){const p=before.players[seat],c=p.hand.find(c=>c.id===action.ids[0]),h=heroForBase(p.incarnation?.activeHero||p.heroId);if(c&&c.type!=='shan'&&h?.skillNames.qingguo&&['spade','club'].includes(c.suit))cues.push({key:skillAudioKey(p,'qingguo'),sex:displaySex(before,seat)})}
  // 日志按 id 倒序（最新在前）。断线 / 后台回来的那一帧会一次补上好几手的历史事件，
  // 逐条播报只会让语音越播越落后（AI 已经出下一张了还在念前面的牌），所以只保留最新的几条。
  // 实测单手最多产生 2 条可播报事件（13448 手样本，含连携技能与出杀响应），超出即视为补帧。
  const backlog=after.logs.filter(l=>l.id>before.eventId&&l.cue&&after.players[l.cue.seat]).slice(0,MAX_BACKLOG_CUES)
  for(const line of backlog.reverse()){const cue=line.cue;if(cue.kind==='skill'&&!(action.type==='skill'&&cue.seat===seat&&cue.skill===action.skill))cues.push({key:skillAudioKey(after.players[cue.seat],cue.skill),sex:displaySex(after,cue.seat)});else if(cue.kind==='card-response')cues.push({key:`card-${cue.as}`,sex:displaySex(after,cue.seat)})}
  return cues
}
function displaySex(state,seat){const p=state.players[seat];return p.effectiveSex||heroForBase(p.incarnation?.activeHero||p.heroId)?.sex||'male'}
