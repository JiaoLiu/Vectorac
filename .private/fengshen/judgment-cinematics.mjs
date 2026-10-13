import {esc} from './presentation.mjs'

export const JUDGMENT_LEAD_MS=620,JUDGMENT_SCENE_MS=1080
const effects={lightning:{kind:'thunder',title:'天雷劫',result:'雷电落下'},leiji:{kind:'thunder',title:'雷击',result:'雷电落下'},indulgence:{kind:'prison',title:'迷魂阵',result:'跳过出牌阶段'},supplyshortage:{kind:'ration',title:'闭粮阵',result:'跳过摸牌阶段'}}
export function judgmentKey(view){const p=view?.pending;return p?.kind==='reveal'?`judgment:${view.turns}:${p.id}:${p.card?.id}:${p.delayType}`:null}
// Only the FINAL public reveal is eligible: no hand inspection, suit guesses,
// effects during replacement, failed rolls, or replays when a save is opened.
export function successfulJudgments(before,after){
 const p=after?.pending,d=effects[p?.delayType],key=judgmentKey(after)
 if(!d||p.kind!=='reveal'||p.hit!==true||!p.card?.id||!Number.isInteger(p.target)||key===judgmentKey(before))return []
 return [{...d,...(p.delayType==='leiji'&&after.judgmentLabel?{title:after.judgmentLabel}:{}),key,target:p.target,judgeId:p.card.id,effect:p.delayType}]
}
export class JudgmentCinematics{
 constructor({now=Date.now}={}){this.now=now;this.clear()}
 clear(){this.items=[];this.seen=new Set();this.completed=null}
 enqueue(events){for(const e of events){if(this.seen.has(e.key))continue;this.seen.add(e.key);this.items.push({...e,readyAt:this.now()+JUDGMENT_LEAD_MS,started:null})}}
 get busy(){return this.items.length>0}
 frame({blocked=false}={}){
  const now=this.now()
  while(this.items.length){const e=this.items[0]
   if(e.started==null){if(blocked||now<e.readyAt)return {event:null,remaining:Math.max(30,e.readyAt-now)};e.started=now}
   const elapsed=Math.max(0,now-e.started)
   if(elapsed<JUDGMENT_SCENE_MS)return {event:e,elapsed,remaining:JUDGMENT_SCENE_MS-elapsed}
   this.completed=e.key;this.items.shift()
  }
  return null
 }
}

function prison(){return '<span class="fs-character-shade" data-motion></span><span class="fs-character-door fs-character-door-left" data-motion><i></i><i></i></span><span class="fs-character-door fs-character-door-right" data-motion><i></i><i></i></span><span class="fs-character-lock" data-motion></span>'}
function ration(){return '<span class="fs-character-shade" data-motion></span><span class="fs-character-seal fs-character-seal-left" data-motion></span><span class="fs-character-seal fs-character-seal-right" data-motion></span><span class="fs-character-stamp" data-motion>封</span><span class="fs-character-grain" data-motion><i></i><i></i><i></i><i></i></span>'}
function thunder(){return '<span class="fs-character-flash" data-motion></span><svg class="fs-character-lightning" viewBox="0 0 100 144" preserveAspectRatio="none" aria-hidden="true"><g class="fs-cinema-bolt" data-motion><path d="M63 -10L30 57L53 52L26 137L45 76L20 83L46 -10Z" fill="#e7fcff" stroke="#98efff" stroke-width="1.5"/><path d="M42 42L13 62L23 72M40 88L79 57L69 80" fill="none" stroke="#d7ffff" stroke-width="2"/></g><g class="fs-character-sparks" data-motion stroke="#efffff" stroke-width="2"><path d="M41 93L12 103M49 99L70 128M48 94L88 84M37 102L22 136"/></g></svg>'}
export function sceneHtml(e){return '<span class="fs-sr-only">'+esc(e.targetName||'')+' '+esc(e.title)+'：'+esc(e.result)+'</span>'+(e.kind==='thunder'?thunder():e.kind==='prison'?prison():ration())}
export function paintJudgmentCinematic(root,frame){
 root.querySelectorAll('.fs-judgment-cinematic').forEach(e=>e.remove())
 root.querySelectorAll('[data-judgment-afflicted]').forEach(e=>{e.classList.remove('fs-judgment-afflicted');e.removeAttribute('data-judgment-afflicted');e.style.removeProperty('--judgment-elapsed')})
 if(!frame?.event)return
 const e=frame.event,target=root.querySelector(e.target===0?'.fs-own-hero>button':'[data-player="'+e.target+'"] .fs-player-main')
 if(!target)return
 const layer=root.ownerDocument.createElement('span');layer.className='fs-judgment-cinematic fs-character-judgment is-'+e.kind;layer.dataset.judgmentEffect=e.effect;layer.dataset.judgmentEvent=e.key;layer.dataset.judgmentTarget=e.target;layer.setAttribute('role','status');layer.setAttribute('aria-label',(e.targetName||'')+' '+e.title+'：'+e.result);layer.innerHTML=sceneHtml(e)
 layer.style.setProperty('--judgment-elapsed','-'+frame.elapsed+'ms');target.append(layer)
 target.dataset.judgmentAfflicted=e.kind;target.classList.add('fs-judgment-afflicted');target.style.setProperty('--judgment-elapsed','-'+frame.elapsed+'ms')
}
