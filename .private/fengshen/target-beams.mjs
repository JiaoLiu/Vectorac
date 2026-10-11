import {targetLinks} from './table-visuals.mjs'
export const BEAM_DURATION=2500
// A whole AOE/counter/borrowed-sword chain is one play, not one prompt.
// Revision/prompt changes and viewport redraws must never restart its animation.
function effectKey(view){
 const p=view.pending,played=view.lastPlayed
 if(p?.kind==='take'&&!['snatch','dismantle'].includes(played?.as))return `take:${view.turns}:${p.id}`
 return played?`play:${played.turn??view.turns}:${played.id}`:p?`prompt:${view.turns}:${p.id}`:null
}
export class TargetBeams{
 constructor({now=Date.now}={}){this.now=now;this.events=new Map()}
 clear(){this.events.clear()}
 // Called only after a successful game action, never from render/restore.
 record(view){
  const key=effectKey(view)
  if(!key||this.events.has(key)||!targetLinks(view).length)return
  this.events.set(key,this.now())
  if(this.events.size>80)this.events.delete(this.events.keys().next().value)
 }
 frame(view,selection={}){
  const links=targetLinks(view,selection)
  if(selection.targets?.length)return {links,preview:true,elapsed:0,remaining:0}
  const started=this.events.get(effectKey(view)),elapsed=started==null?BEAM_DURATION:Math.max(0,this.now()-started)
  return {links:elapsed<BEAM_DURATION?links:[],preview:false,elapsed,remaining:Math.max(0,BEAM_DURATION-elapsed)}
 }
}
