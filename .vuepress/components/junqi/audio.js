// The music file starts after the first user gesture; generated cues remain on
// Web Audio so they can be mixed separately and never delay the first move.
export function createJunqiAudio() {
  let ctx, effectsBus
  let enabled=true, music=true, paused=false, disposed=false, unlocked=false
  let bgm=null, bgmFailed=false
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

  function syncMusic() {
    if(!unlocked||disposed||!music||paused){
      if(bgm&&!bgm.paused)bgm.pause()
      return
    }

    if(!bgmFailed){
      if(!bgm){
        try{
          const a=new window.Audio('/audio/junqi/clash-defiant.mp3')
          a.loop=true;a.preload='none';a.volume=.28
          a.addEventListener('error',()=>{
            if(disposed||bgm!==a)return
            bgm=null;bgmFailed=true;syncMusic()
          })
          bgm=a
          if(typeof navigator!=='undefined'&&'mediaSession' in navigator){
            try{navigator.mediaSession.metadata=new MediaMetadata({title:'四国军棋 · 背景音乐',artist:'Kevin MacLeod',album:'Vectorac'})}catch(e){}
          }
        }catch(e){bgmFailed=true}
      }
      if(bgm){
        const audio=bgm
        if(audio.paused){
          const p=audio.play()
          if(p&&p.catch)p.catch(error=>{
            if(error&&error.name!=='NotAllowedError'&&error.name!=='AbortError'&&bgm===audio){bgm=null;bgmFailed=true;syncMusic()}
          })
        }
      }
    }
  }

  return {
    unlock(){
      if(disposed)return
      unlocked=true
      if(!ctx){
        const AudioContext=window.AudioContext||window.webkitAudioContext
        if(AudioContext){
          try{
            ctx=new AudioContext();effectsBus=ctx.createGain()
            effectsBus.connect(ctx.destination)
          }catch(e){ctx=null}
        }
      }
      if(ctx&&ctx.state!=='running'){
        const resumed=ctx.resume()
        syncMusic() // Start HTML audio synchronously while the user gesture is active.
        resumed.catch(()=>{})
      }else syncMusic()
    },
    effects(value){enabled=value},
    music(value){music=value;syncMusic()},
    pause(value){paused=value;syncMusic()},
    play(kind='move'){
      if(!enabled||paused||!ctx||ctx.state!=='running')return
      const t=ctx.currentTime
      if(kind==='move'){tone(620,t,.075,.19,effectsBus,'triangle');tone(190,t,.11,.14,effectsBus)}
      else if(kind==='both'){tone(95,t,.23,.22,effectsBus,'triangle');tone(145,t+.035,.18,.13,effectsBus)}
      else if(kind==='win'||kind==='lose'){tone(280,t,.12,.18,effectsBus,'triangle');tone(kind==='win'?520:160,t+.075,.18,.13,effectsBus)}
      else if(kind==='dice'){for(let i=0;i<8;i++)tone(300+Math.random()*300,t+i*.1,.055,.12,effectsBus,'square')}
      else {for(let i=0;i<3;i++)tone([330,440,660][i],t+i*.13,.45,.12,effectsBus)}
    },
    destroy(){
      disposed=true
      if(bgm){bgm.pause();bgm.removeAttribute('src');bgm.load();bgm=null}
      for(const voice of voices){try{voice.stop()}catch(e){}}
      voices.clear();if(ctx)ctx.close().catch(()=>{});ctx=null
    }
  }
}
