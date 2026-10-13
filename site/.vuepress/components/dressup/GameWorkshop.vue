<template>
  <div class="fw-playroom">
    <div class="fw-minigame-nav"><button :aria-pressed="kind==='memory'" @click="start('memory')">花饰记忆</button><button :aria-pressed="kind==='styling'" @click="start('styling')">主题搭配</button><button :aria-pressed="kind==='sewing'" @click="start('sewing')">节奏缝纫</button></div>
    <template v-if="kind==='memory'"><h3>花饰记忆</h3><p>翻开两张相同的花饰，把六对花饰全部找出来。{{game.moves}} 次翻牌 · {{game.matched.length/2}} / 6 对</p><div class="fw-memory-grid"><button v-for="(card,i) in game.cards" :key="i" :class="{revealed:game.open.includes(i)||game.matched.includes(i),matched:game.matched.includes(i)}" :disabled="game.matched.includes(i)||game.complete" :aria-label="game.open.includes(i)||game.matched.includes(i)?symbols[card]:'翻开花饰 '+(i+1)" @click="flip(i)"><span>{{game.open.includes(i)||game.matched.includes(i)?glyphs[card]:'✧'}}</span><small v-if="game.open.includes(i)||game.matched.includes(i)">{{symbols[card]}}</small></button></div></template>
    <template v-if="kind==='styling'"><small>今日搭配委托</small><h3>{{brief.name}}</h3><p>{{brief.text}}</p><div class="fw-brief"><span v-for="t in brief.tags" :key="t">{{t}}风格</span><span>{{sceneName(brief.scene)}}</span></div><p>先去衣橱或精细装扮区搭配，再回来交稿。可以混搭饰品补充风格。</p><button class="fw-primary" @click="$emit('dress')">去搭配</button><button @click="submit" :disabled="!!preview||game.paid">提交当前穿搭</button><p v-if="game.score!==undefined" aria-live="polite">{{game.score}} / 100 · {{game.complete?'完美契合主题！':'再看看委托的风格和场景。'}}</p></template>
    <template v-if="kind==='sewing'"><h3>节奏缝纫</h3><p>指针进入中间金色区时落针。六针缝好一条缎带；靠近中心可获得更高奖励，落空可以继续。</p><div class="fw-sewing-track" :class="flash?'flash-'+flash:''"><i class="fw-sewing-target"></i><u v-for="(m,i) in game.marks" :key="i" class="fw-sew-mark" :class="'is-'+m.grade" :style="{left:(m.position*100)+'%'}"></u><b :style="{left:(needle*100)+'%'}"></b></div><button class="fw-primary fw-stitch" :disabled="game.complete" @pointerdown.prevent="sew" @keydown.enter.prevent="sew" @keydown.space.prevent="sew">落针</button><p>{{game.stitches}} / 6 针 · {{game.score}} 精细度</p><p aria-live="polite">{{stitchMessage}}</p></template>
    <div v-if="game.complete" class="fw-game-reward" role="status"><strong>{{game.paid?'金币已到账':'完成啦！'}}</strong><p>这局获得 {{earned}} 金币</p><button class="fw-primary" @click="start(kind)">再玩一局</button></div>
  </div>
</template>
<script>
import {memoryGame,flipMemory,closeMemory,MEMORY_SYMBOLS,stylingGame,submitStyling,BRIEFS,sewingGame,stitch,gameReward} from './minigames.mjs'
import {SCENES,item,OUTFITS} from './engine.mjs'
import {fineTags} from './parts.mjs'
import {createWardrobeAudio} from './audio.mjs'
export default {
  props:['look','preview','active'],data:()=>({kind:'memory',game:memoryGame(),symbols:MEMORY_SYMBOLS,glyphs:['🎀','✿','☽','◉','★','❦'],needle:0,stitchMessage:'',earned:0,flash:''}),
  computed:{brief(){return BRIEFS[this.game.brief]||BRIEFS[0]}},
  mounted(){this._alive=true;this._session=this.sessionId();this._audio=createWardrobeAudio();this.syncSound();this._tick=t=>{if(!this._alive)return;if(this.active&&this.kind==='sewing'&&!this.game.complete&&!document.hidden)this.needle=(Math.sin(t*.0025)+1)/2;this._frame=requestAnimationFrame(this._tick)};this._frame=requestAnimationFrame(this._tick)},
  beforeDestroy(){this._alive=false;cancelAnimationFrame(this._frame);clearTimeout(this._close);clearTimeout(this._flashTimer);if(this._audio)this._audio.destroy()},
  methods:{
    sceneName(id){return item(SCENES,id).name},sessionId(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)},
    // 与主组件共用 localStorage 里的音效开关，落针手势里同步一次即可。
    syncSound(){try{this._audio.effects(JSON.parse(localStorage.getItem('vectorac.wardrobe.audio')||'{}').sound!==false)}catch(e){}},
    start(kind){clearTimeout(this._close);clearTimeout(this._flashTimer);this.flash='';this.kind=kind;this.game=kind==='memory'?memoryGame():kind==='styling'?stylingGame():sewingGame();this._session=this.sessionId();this.earned=0;this.stitchMessage=''},
    flip(i){this.game=flipMemory(this.game,i);if(this.game.open.length===2){clearTimeout(this._close);this._close=setTimeout(()=>{this.game=closeMemory(this.game)},750)}this.pay()},
    submit(){if(this.preview)return;const tags=this.look.mode==='fine'?fineTags(this.look.parts):item(OUTFITS,this.look.outfit).tags;this.game=submitStyling(this.game,tags,this.look.scene);this.pay()},
    sew(){if(document.hidden||this.game.complete)return;this.game=stitch(this.game,this.needle);const mark=this.game.marks[this.game.marks.length-1],grade=mark?mark.grade:'miss';this.stitchMessage=grade==='perfect'?'完美一针！+2 精细度':grade==='hit'?'缝好了，+1 精细度':'落空…针滑出了缎带，调整节奏继续。';clearTimeout(this._flashTimer);this.flash='';this.$nextTick(()=>{this.flash=grade;this._flashTimer=setTimeout(()=>{this.flash=''},480)});this.syncSound();this._audio.unlock();this._audio.play(this.game.complete?'reward':grade);this.pay()},
    pay(){const amount=gameReward(this.game);if(!amount)return;this.earned=amount;this.game={...this.game,paid:true};this.$emit('reward',{id:this._session,reward:amount})}
  }
}
</script>
<style>
.fw-minigame-nav{display:flex;gap:6px;overflow:auto;padding-bottom:12px}.fw-minigame-nav button{flex:1;white-space:nowrap;min-height:42px;font-size:11px;padding:8px}.fw-minigame-nav [aria-pressed=true]{background:#986177!important;color:white!important}.fw-playroom h3{font-family:serif;font-size:23px!important}.fw-playroom>p{font-size:12px;color:#917b7d}.fw-memory-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:16px 0}.fw-memory-grid button{height:90px;border:2px solid #e1c7c6;background:repeating-linear-gradient(45deg,#e9d5d6 0 5px,#e1c6ca 5px 6px);display:flex;align-items:center;justify-content:center;flex-direction:column}.fw-memory-grid span{font-size:30px;line-height:1.3}.fw-memory-grid small{font-size:10px}.fw-memory-grid .revealed{background:#fffcf2}.fw-memory-grid .matched{opacity:.7;background:#e6efe0;border-color:#aac398}.fw-brief{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}.fw-brief span{background:#ede5df;border-radius:20px;padding:7px 12px;font-size:12px}.fw-game-reward{padding:16px;margin:16px 0;background:#e8eee1;border-radius:14px;text-align:center}.fw-game-reward strong{font-family:serif;font-size:23px}.fw-sewing-track{position:relative;height:60px;margin:28px 10px 20px;background:linear-gradient(0deg,transparent 26px,#cbaaa3 26px 34px,transparent 34px);border-radius:20px}.fw-sewing-target{position:absolute;left:26%;width:48%;height:100%;border-radius:14px;background:#e9cc8c66;border:1px solid #d1ad53}.fw-sewing-target:after{content:'';position:absolute;left:27%;width:46%;height:100%;background:#d1ad5366}.fw-sewing-track b{position:absolute;top:0;bottom:0;width:5px;border-radius:8px;transform:translateX(-50%);background:#865367;box-shadow:0 0 0 3px #fff6}.fw-stitch{width:100%;min-height:54px!important;font-size:18px!important}
/* 落针留痕：完美=金色发亮针脚，普通=棕色针脚，落空=红色小叉，六针过程一眼可辨。 */
.fw-sew-mark{position:absolute;top:19px;width:4px;height:22px;border-radius:3px;transform:translateX(-50%);pointer-events:none}
.fw-sew-mark.is-perfect{background:#d9b45c;box-shadow:0 0 7px #e9cc8ccc}
.fw-sew-mark.is-hit{background:#a98378}
.fw-sew-mark.is-miss{top:24px;width:12px;height:12px;background:none}
.fw-sew-mark.is-miss:before,.fw-sew-mark.is-miss:after{content:'';position:absolute;left:50%;top:50%;width:11px;height:2px;border-radius:2px;background:#b05656;transform:translate(-50%,-50%) rotate(45deg)}
.fw-sew-mark.is-miss:after{transform:translate(-50%,-50%) rotate(-45deg)}
.fw-sewing-track.flash-perfect .fw-sewing-target{animation:sewGlow .48s ease-out}
.fw-sewing-track.flash-miss{animation:sewShake .36s}
@keyframes sewGlow{0%{box-shadow:0 0 0 0 #e9cc8c00}35%{box-shadow:0 0 20px 5px #e9cc8cd9}100%{box-shadow:0 0 0 0 #e9cc8c00}}
@keyframes sewShake{0%,100%{transform:none}25%{transform:translateX(-4px)}55%{transform:translateX(4px)}80%{transform:translateX(-2px)}}
</style>
