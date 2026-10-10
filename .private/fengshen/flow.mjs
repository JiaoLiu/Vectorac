// No hand, conversion, armor or lord aid means there is no decision to ask.
// Keep engine mechanics unchanged: dispatch its one legal pass immediately.
export function advanceUnavailable(state,dispatch,playerView){
  let s=state
  for(let i=0;i<32&&s.pending?.kind==='response';i++){
    const p=s.pending,legal=playerView(s,p.actor).legal
    if(legal.length!==1||legal[0].type!=='pass')break
    const r=dispatch(s,{type:'pass',seat:p.actor,revision:s.revision,promptId:p.id})
    if(!r.ok)break
    s=r.state
  }
  return s
}
export class DecisionClock{
 constructor({duration=60000,now=()=>Date.now()}={}){this.duration=duration;this.now=now;this.key=null;this.left=duration;this.stamp=now();this.running=false}
 sync(key,running){this.tick();if(key!==this.key){this.key=key;this.left=this.duration}this.running=!!key&&running;this.stamp=this.now();return this.seconds}
 tick(){const t=this.now();if(this.running)this.left=Math.max(0,this.left-(t-this.stamp));this.stamp=t;return this.left===0}
 get seconds(){return Math.ceil(this.left/1000)}
}
