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
 enqueue(events){for(const e of events){if(this.seen.has(e.key))continue;this.seen.add(e.key);this.items.push({...e,readyAt:this.now()+(e.leadMs??JUDGMENT_LEAD_MS),started:null})}}
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
function fire(){return '<span class="fs-character-heat" data-motion></span><svg class="fs-character-fire" viewBox="0 0 100 144" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fs-character-flame" x2="0" y2="1"><stop stop-color="#fbed9a" stop-opacity=".65"/><stop offset=".4" stop-color="#ff963a" stop-opacity=".8"/><stop offset="1" stop-color="#ad3620" stop-opacity=".85"/></linearGradient></defs><path class="fs-character-flame-outer" data-motion d="M-10 145C-1 123 4 100 1 91C17 104 12 119 26 130C15 96 29 84 29 52C46 73 44 96 48 110C55 76 66 63 58 33C81 61 68 84 78 110C83 86 92 77 90 57C110 85 93 112 110 147Z" fill="url(#fs-character-flame)"/><path class="fs-character-flame-inner" data-motion d="M15 144C9 123 22 108 24 95C37 111 28 126 41 135C35 110 49 100 47 76C64 101 51 116 65 131C65 111 78 103 79 88C96 110 84 126 97 144Z" fill="#ffe299" opacity=".65"/></svg><span class="fs-character-embers" data-motion><i></i><i></i><i></i><i></i></span>'}
function chains(){const strand=(side,y,angle)=>'<g class="fs-character-chain-'+side+'" data-motion><g transform="rotate('+angle+' 50 '+y+')">'+Array.from({length:8},(_,i)=>'<ellipse cx="'+(i*16-6)+'" cy="'+y+'" rx="10" ry="5.5" fill="none" stroke="url(#fs-character-steel)" stroke-width="3.5"/><path d="M'+(i*16-14)+' '+(y-1)+'q2-5 8-4" fill="none" stroke="#e5e5d5" stroke-width=".8" opacity=".7"/>').join('')+'</g></g>';return '<svg class="fs-character-chains" viewBox="0 0 100 144" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fs-character-steel" x2=".7" y2="1"><stop stop-color="#dde4df"/><stop offset=".3" stop-color="#6f8c89"/><stop offset=".6" stop-color="#253b3a"/><stop offset="1" stop-color="#bdd2c6"/></linearGradient></defs>'+strand('left',58,22)+strand('right',88,-22)+'</svg>'}
export function sceneHtml(e){return '<span class="fs-sr-only">'+esc(e.targetName||'')+' '+esc(e.title)+'：'+esc(e.result)+'</span>'+(e.kind==='fire'?fire():['chain','unchain'].includes(e.kind)?chains():e.kind==='thunder'?thunder():e.kind==='prison'?prison():ration())}
export function paintJudgmentCinematic(root,frame){
 root.querySelectorAll('.fs-judgment-cinematic').forEach(e=>e.remove())
 root.querySelectorAll('[data-judgment-afflicted]').forEach(e=>{e.classList.remove('fs-judgment-afflicted');e.removeAttribute('data-judgment-afflicted');e.style.removeProperty('--judgment-elapsed')})
 if(!frame?.event)return
 const e=frame.event
 for(const seat of e.targets||[e.target]){
 const target=root.querySelector(seat===0?'.fs-own-hero>button':'[data-player="'+seat+'"] .fs-player-main')
 if(!target)continue
 const name=e.targetNames?.[seat]||e.targetName||'',layer=root.ownerDocument.createElement('span');layer.className='fs-judgment-cinematic fs-character-judgment is-'+e.kind;layer.dataset.judgmentEffect=e.effect;layer.dataset.judgmentEvent=e.key;layer.dataset.judgmentTarget=seat;layer.setAttribute('role','status');layer.setAttribute('aria-label',name+' '+e.title+'：'+e.result);layer.innerHTML=sceneHtml({...e,targetName:name})
 layer.style.setProperty('--judgment-elapsed','-'+frame.elapsed+'ms');target.append(layer)
 target.dataset.judgmentAfflicted=e.kind;target.classList.add('fs-judgment-afflicted');target.style.setProperty('--judgment-elapsed','-'+frame.elapsed+'ms')
 }
}
