// Original quiet plucked accompaniment and short wooden-piece cues.
// Audio is created/resumed only by a user gesture; music and effects are separate.
export function createJunqiAudio() {
  let ctx, musicBus, effectsBus, timer, step=0, enabled=true, music=true, paused=false, disposed=false
  const voices=new Set()
  function tone(frequency,start,duration,gain,bus,type='sine') {
    const osc=ctx.createOscillator(), envelope=ctx.createGain()
    osc.type=type;osc.frequency.value=frequency
    envelope.gain.setValueAtTime(0,start)
    envelope.gain.linearRampToValueAtTime(gain,start+.008)
    envelope.gain.exponentialRampToValueAtTime(.0001,start+duration)
    osc.connect(envelope);envelope.connect(bus);voices.add(osc)
    osc.onended=()=>{voices.delete(osc);osc.disconnect();envelope.disconnect()}
    osc.start(start);osc.stop(start+duration+.02)
  }
  function tick() {
    if(!ctx||ctx.state!=='running'||!music||paused)return
    const notes=[220,261.63,329.63,392,329.63,261.63,196,293.66,349.23,440,349.23,293.66]
    const f=notes[step++%notes.length], t=ctx.currentTime
    tone(f,t,1.8,.12,musicBus);tone(f*2,t,1.1,.025,musicBus)
    if(step%6===1)tone(f/2,t,3,.07,musicBus)
  }
  function schedule(){clearInterval(timer);if(!disposed&&ctx&&music&&!paused){tick();timer=setInterval(tick,650)}}
  return {
    unlock(){
      if(disposed)return
      if(!ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;ctx=new Audio();musicBus=ctx.createGain();effectsBus=ctx.createGain();musicBus.gain.value=music&&!paused?.45:0;musicBus.connect(ctx.destination);effectsBus.connect(ctx.destination);if(ctx.state==='running')schedule()}
      if(ctx.state!=='running')ctx.resume().then(()=>schedule()).catch(()=>{})
    },
    effects(value){enabled=value},
    music(value){music=value;if(musicBus)musicBus.gain.setTargetAtTime(music&&!paused?.45:0,ctx.currentTime,.08);schedule()},
    pause(value){paused=value;if(musicBus)musicBus.gain.setTargetAtTime(music&&!paused?.45:0,ctx.currentTime,.08);if(!paused&&ctx&&ctx.state!=='running')ctx.resume().then(schedule).catch(()=>{});else schedule()},
    play(kind='move'){
      if(!enabled||paused||!ctx||ctx.state!=='running')return
      const t=ctx.currentTime
      if(kind==='move'){tone(620,t,.075,.19,effectsBus,'triangle');tone(190,t,.11,.14,effectsBus)}
      else if(kind==='both'){tone(95,t,.23,.22,effectsBus,'triangle');tone(145,t+.035,.18,.13,effectsBus)}
      else if(kind==='win'||kind==='lose'){tone(280,t,.12,.18,effectsBus,'triangle');tone(kind==='win'?520:160,t+.075,.18,.13,effectsBus)}
      else {for(let i=0;i<3;i++)tone([330,440,660][i],t+i*.13,.45,.12,effectsBus)}
    },
    destroy(){disposed=true;clearInterval(timer);for(const voice of voices){try{voice.stop()}catch(e){}}voices.clear();if(ctx)ctx.close().catch(()=>{});ctx=null}
  }
}
