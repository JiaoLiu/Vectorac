export function createWardrobeAudio(env=window){
  let ctx=null,bgm=null,music=true,effects=true,hidden=false,disposed=false,unlocked=false,lastCue=-1
  const voices=new Set()
  function sync(){
    if(disposed||!unlocked||hidden||!music){if(bgm)bgm.pause();return}
    if(!bgm){bgm=new env.Audio('/audio/dressup/dream-culture.mp3');bgm.loop=true;bgm.preload='none';bgm.volume=.25}
    if(bgm.paused){const p=bgm.play();if(p&&p.catch)p.catch(()=>{})}
  }
  function tone(f,t,duration,gain){
    const osc=ctx.createOscillator(),g=ctx.createGain();osc.type='sine';osc.frequency.value=f
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration)
    osc.connect(g);g.connect(ctx.destination);voices.add(osc)
    osc.onended=()=>{voices.delete(osc);osc.disconnect();g.disconnect()};osc.start(t);osc.stop(t+duration+.02)
  }
  return {
    unlock(){if(disposed)return;unlocked=true;if(!ctx){const C=env.AudioContext||env.webkitAudioContext;if(C)try{ctx=new C()}catch(e){}}
      if(ctx&&ctx.state!=='running'){const p=ctx.resume();if(p&&p.catch)p.catch(()=>{})}sync()},
    music(value){music=value;sync()},effects(value){effects=value},
    pause(value){hidden=value;if(hidden)for(const v of voices){try{v.stop()}catch(e){}}sync()},
    play(kind='dress'){
      if(!effects||hidden||disposed||!ctx||ctx.state!=='running')return
      const t=ctx.currentTime;if(t-lastCue<.07)return;lastCue=t
      const notes={dress:[660,880],buy:[523,659,784],reward:[659,784,1047],color:[784],photo:[1200,900],pose:[587],perfect:[784,988,1319],hit:[659,880],miss:[330,247]}[kind]||[660]
      notes.forEach((f,i)=>tone(f,t+i*.07,kind==='reward'?.45:.2,.045))
    },
    destroy(){disposed=true;if(bgm){bgm.pause();bgm.removeAttribute('src');bgm.load();bgm=null}for(const v of voices){try{v.stop()}catch(e){}}voices.clear();if(ctx){const p=ctx.close();if(p&&p.catch)p.catch(()=>{})}ctx=null}
  }
}
