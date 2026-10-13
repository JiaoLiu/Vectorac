import {tableChainKey} from './table-trail.mjs'
export const SETTLED_HOLD_MS=400,SETTLED_FADE_MS=180
// Wait for the ENGINE's pending chain and all public animations, rather than
// guessing that Dodge is final (Axe/Blade/skills/rescue may still follow).
export class TableSettlement{
 constructor({now=Date.now}={}){this.now=now;this.clear()}
 clear(){this.key=null;this.deadline=null;this.closedChain=null}
 frame(view,{busy=false}={}){
  const key=tableChainKey(view),now=this.now()
  if(key!==this.key){this.key=key;this.deadline=null;this.closedChain=null}
  if(this.closedChain===key)return {closedChain:key,fading:false,remaining:0}
  const p=view.pending,active=p&&!(p.kind==='discard'&&!p.skill&&view.phase==='resolve')&&p.kind!=='incarnation'
  if(active||busy){this.deadline=null;return {closedChain:null,fading:false,remaining:0}}
  if(this.deadline==null)this.deadline=now+SETTLED_HOLD_MS
  const remaining=this.deadline+SETTLED_FADE_MS-now
  if(remaining<=0){this.closedChain=key;return {closedChain:key,fading:false,remaining:0}}
  return {closedChain:null,fading:now>=this.deadline,remaining:now<this.deadline?this.deadline-now:remaining}
 }
}
