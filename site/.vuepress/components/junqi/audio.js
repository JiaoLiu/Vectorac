// The music file starts after the first user gesture; generated cues remain on
// Web Audio so they can be mixed separately and never delay the first move.
//
// 语音权重接线（人语音 > 快捷语 > 音效/BGM）走依赖注入：调用方（FourKingdoms.vue）
// 把 gamehall/chatkit.js 的 { isCommActive, registerBgm, unregisterBgm } 传进来。
// 本文件保持零 import——scripts/test-junqi-audio.mjs 以 data:URL 方式加载源码
// 做隔离测试，静态相对 import 在 data:URL 模块中无法解析。
export function createJunqiAudio(comm) {
  const commIsActive = comm && typeof comm.isCommActive === 'function' ? comm.isCommActive : () => false
  const commRegister = comm && typeof comm.registerBgm === 'function' ? comm.registerBgm : () => {}
  const commUnregister = comm && typeof comm.unregisterBgm === 'function' ? comm.unregisterBgm : () => {}
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
            commUnregister(a)
            bgm=null;bgmFailed=true;syncMusic()
          })
          bgm=a
          commRegister(a) // 注册给 chatkit：语音播放期间自动 duck
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
            if(error&&error.name!=='NotAllowedError'&&error.name!=='AbortError'&&bgm===audio){commUnregister(audio);bgm=null;bgmFailed=true;syncMusic()}
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
      // 语音（人语音 / 快捷语）播放期间音效静默：语音权重高于音效，
      // 叠放会盖过人声（联机对局；单机或未注入时 commIsActive 恒 false，无影响）
      if(commIsActive())return
      const t=ctx.currentTime
      if(kind==='move'){tone(620,t,.075,.19,effectsBus,'triangle');tone(190,t,.11,.14,effectsBus)}
      else if(kind==='both'){tone(95,t,.23,.22,effectsBus,'triangle');tone(145,t+.035,.18,.13,effectsBus)}
      else if(kind==='win'||kind==='lose'){tone(280,t,.12,.18,effectsBus,'triangle');tone(kind==='win'?520:160,t+.075,.18,.13,effectsBus)}
      else if(kind==='dice'){for(let i=0;i<8;i++)tone(300+Math.random()*300,t+i*.1,.055,.12,effectsBus,'square')}
      else {for(let i=0;i<3;i++)tone([330,440,660][i],t+i*.13,.45,.12,effectsBus)}
    },
    destroy(){
      disposed=true
      if(bgm){commUnregister(bgm);bgm.pause();bgm.removeAttribute('src');bgm.load();bgm=null}
      for(const voice of voices){try{voice.stop()}catch(e){}}
      voices.clear();if(ctx)ctx.close().catch(()=>{});ctx=null
    }
  }
}
