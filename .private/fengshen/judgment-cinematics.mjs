import {esc} from './presentation.mjs'
import {localPoint} from './screen-mode.mjs'

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
const bronze='<linearGradient id="fs-judge-bronze" x2="0.7" y2="1"><stop stop-color="#fae0a2"/><stop offset=".23" stop-color="#a88246"/><stop offset=".5" stop-color="#e1c382"/><stop offset=".76" stop-color="#72532d"/><stop offset="1" stop-color="#dfbc7d"/></linearGradient>',wood='<linearGradient id="fs-judge-wood" x2="1" y2="1"><stop stop-color="#435a50"/><stop offset=".5" stop-color="#203b35"/><stop offset="1" stop-color="#152a27"/></linearGradient>'
const rivets=(xs,ys)=>xs.flatMap(x=>ys.map(y=>`<circle cx="${x}" cy="${y}" r="1.4" fill="#f5d595" opacity=".8"/>`)).join('')
function thunder(){return `<svg viewBox="0 0 200 110" aria-hidden="true"><defs><radialGradient id="fs-judge-storm"><stop stop-color="#92f6ff" stop-opacity=".45"/><stop offset="1" stop-color="#285c75" stop-opacity="0"/></radialGradient><linearGradient id="fs-judge-bolt" x2="0" y2="1"><stop stop-color="#fff"/><stop offset=".45" stop-color="#e7fcff"/><stop offset="1" stop-color="#80ddeb"/></linearGradient></defs><ellipse class="fs-cinema-mist" data-motion cx="100" cy="83" rx="85" ry="22" fill="url(#fs-judge-storm)"/><g class="fs-cinema-cloud" data-motion fill="#43596a" stroke="#96b6bd" stroke-width=".65"><path d="M45 20Q47 7 63 11Q74-3 91 7Q111-1 119 11Q141 4 152 19Q163 29 144 30H54Q34 30 45 20Z"/><path d="M58 23Q84 29 107 22Q123 30 143 23" fill="none" opacity=".6"/></g><g class="fs-cinema-bolt" data-motion><path d="M111 16L82 53H105L74 96L89 62H66L96 16Z" fill="url(#fs-judge-bolt)" stroke="#bcf8ff" stroke-width="1.2"/><path d="M93 42L55 54L68 64M94 66L139 48L130 65" fill="none" stroke="#d5ffff" stroke-width="1.8" stroke-linejoin="round"/></g><g class="fs-cinema-wave" data-motion fill="none" stroke="#9bdae0"><ellipse cx="94" cy="93" rx="45" ry="8" stroke-width="2"/><ellipse cx="94" cy="93" rx="69" ry="12" opacity=".4"/></g><g class="fs-cinema-sparks" data-motion stroke="#e0fdff" stroke-width="2" stroke-linecap="round"><path d="M51 88L45 82M65 96L60 101M128 91L139 85M104 92L108 101"/></g></svg>`}
function prison(){
 const door=(side,x)=>`<g class="fs-cinema-door-${side}" data-motion><rect x="${x}" y="25" width="56" height="69" rx="2" fill="url(#fs-judge-wood)" stroke="url(#fs-judge-bronze)" stroke-width="3"/>${[8,20,32,44].map(n=>`<rect x="${x+n}" y="28" width="4" height="63" rx="1" fill="url(#fs-judge-bronze)"/><path d="M${x+n+1} 29v60" stroke="#fff0be" stroke-width=".6" opacity=".5"/>`).join('')}<path d="M${x+2} 45h52M${x+2} 76h52" stroke="url(#fs-judge-bronze)" stroke-width="5"/>${rivets([x+6,x+50],[45,76])}</g>`
 return `<svg viewBox="0 0 200 110" aria-hidden="true"><defs>${bronze}${wood}<radialGradient id="fs-judge-jade"><stop stop-color="#d6c087" stop-opacity=".3"/><stop offset="1" stop-color="#8ba98b" stop-opacity="0"/></radialGradient></defs><ellipse class="fs-cinema-mist" data-motion cx="100" cy="76" rx="95" ry="32" fill="url(#fs-judge-jade)"/><ellipse cx="100" cy="99" rx="71" ry="7" fill="#0c1b19" opacity=".7"/><g fill="url(#fs-judge-bronze)" stroke="#533e25"><path d="M25 25L31 19H169L175 25L165 30H35Z"/><path d="M40 12H160L171 19H29Z"/><rect x="32" y="27" width="8" height="66" rx="2"/><rect x="160" y="27" width="8" height="66" rx="2"/><path d="M27 94H173V99H27Z"/></g><path d="M46 18H154" stroke="#fae1a3" opacity=".8"/>${door('left',43)}${door('right',101)}<g class="fs-cinema-lock" data-motion><path d="M91 60V53a9 9 0 0 1 18 0v7" fill="none" stroke="#e3c789" stroke-width="3"/><rect x="88" y="58" width="24" height="19" rx="3" fill="url(#fs-judge-bronze)" stroke="#4b3927"/><circle cx="100" cy="66" r="3" fill="#324237"/><path d="M100 66v5" stroke="#324237" stroke-width="2"/></g><ellipse class="fs-cinema-wave" data-motion cx="100" cy="95" rx="64" ry="8" fill="none" stroke="#e8c97f" stroke-width="1.5"/></svg>`
}
function ration(){return `<svg viewBox="0 0 200 110" aria-hidden="true"><defs>${bronze}${wood}<linearGradient id="fs-judge-sack" x2="1" y2="1"><stop stop-color="#dfc393"/><stop offset=".55" stop-color="#a2855b"/><stop offset="1" stop-color="#68563f"/></linearGradient></defs><ellipse class="fs-cinema-mist" data-motion cx="100" cy="77" rx="88" ry="29" fill="#b6975830"/><ellipse cx="100" cy="99" rx="75" ry="7" fill="#091912" opacity=".6"/><g class="fs-cinema-store" data-motion><path d="M63 33H147V93H63Z" fill="url(#fs-judge-wood)" stroke="url(#fs-judge-bronze)" stroke-width="2"/><path d="M51 35L105 9L159 35L153 39H57Z" fill="#3d5143" stroke="url(#fs-judge-bronze)" stroke-width="2"/><path d="M75 26H135M87 20H123" stroke="#dac593" stroke-width="1" opacity=".65"/><path d="M77 92V43H134V92M88 44V92M122 44V92" fill="none" stroke="#af986c" stroke-width="2"/><path d="M62 93H149V98H62Z" fill="url(#fs-judge-bronze)"/><g fill="url(#fs-judge-sack)" stroke="#69573f"><path d="M27 62Q37 55 49 61L45 68Q61 88 47 96H25Q10 89 30 68Z"/><path d="M34 61L28 55H46L42 62Z"/><path d="M145 72Q157 63 169 72L165 77Q183 94 168 98H147Q135 92 150 78Z"/></g><path d="M28 68H45M151 77H165M30 79Q35 85 31 92M158 84Q164 88 161 94" fill="none" stroke="#ead4a8" opacity=".7"/></g><g class="fs-cinema-seal-left" data-motion><path d="M70 43L77 39L137 86L131 92Z" fill="#c8a25d" stroke="#f3d995"/><path d="M80 47L129 85" stroke="#7c5631" stroke-dasharray="3 4"/></g><g class="fs-cinema-seal-right" data-motion><path d="M129 39L137 44L77 92L70 85Z" fill="#dbbd7d" stroke="#f1dfa7"/><path d="M128 47L78 85" stroke="#76512c" stroke-dasharray="3 4"/></g><g class="fs-cinema-lock" data-motion><circle cx="104" cy="66" r="10" fill="#8e4139" stroke="#ebc98b" stroke-width="2"/><path d="M99 62L105 59L110 65L104 72L98 67Z" fill="none" stroke="#eed6a1" stroke-width="1.5"/></g><g class="fs-cinema-grain" data-motion fill="#e2c895"><ellipse cx="19" cy="69" rx="2" ry="3"/><ellipse cx="48" cy="89" rx="2" ry="3"/><ellipse cx="172" cy="86" rx="2" ry="3"/></g></svg>`}
export function sceneHtml(e){const graphic=e.kind==='thunder'?thunder():e.kind==='prison'?prison():ration();return `<div class="fs-cinema-scene">${graphic}</div><div class="fs-cinema-caption"><b>${esc(e.title)}</b><small>${esc(e.targetName||'')}${e.targetName?' · ':''}${esc(e.result)}</small></div>`}
export function paintJudgmentCinematic(root,frame){
 root.querySelectorAll('.fs-judgment-cinematic').forEach(e=>e.remove())
 root.querySelectorAll('[data-judgment-afflicted]').forEach(e=>{e.classList.remove('fs-judgment-afflicted');e.removeAttribute('data-judgment-afflicted');e.style.removeProperty('--judgment-elapsed')})
 if(!frame?.event)return
 const e=frame.event,style=getComputedStyle(root),side=parseFloat(style.getPropertyValue('--center-side'))||80,top=parseFloat(style.getPropertyValue('--center-top'))||120,bottom=parseFloat(style.getPropertyValue('--center-bottom'))||140
 let w=Math.max(100,Math.min(200,(root.clientWidth-2*side)/2-12));const h=Math.max(76,Math.min(148,root.clientHeight-top-bottom)),y=top+h/2
 let x=root.clientWidth/2
 const judge=[...root.querySelectorAll('[data-judge-card]')].find(n=>n.dataset.judgeCard===e.judgeId)
 if(judge){const r=judge.getBoundingClientRect(),a=localPoint(root,r.left,r.top),b=localPoint(root,r.right,r.bottom),cx=(a.x+b.x)/2,half=Math.abs(b.x-a.x)/2
  w=Math.min(w,Math.max(root.clientWidth-side-cx-half-10,cx-half-10-side))
  const right=cx+half+10+w/2,left=cx-half-10-w/2
  x=right+w/2<=root.clientWidth-side?right:left-w/2>=side?left:root.clientWidth/2
 }
 const layer=root.ownerDocument.createElement('div');layer.className=`fs-judgment-cinematic is-${e.kind}`;layer.dataset.judgmentEffect=e.effect;layer.dataset.judgmentEvent=e.key;layer.setAttribute('role','status');layer.setAttribute('aria-label',`${e.targetName||''} ${e.title}：${e.result}`);layer.innerHTML=sceneHtml(e)
 Object.assign(layer.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});layer.style.setProperty('--judgment-elapsed',`-${frame.elapsed}ms`);root.append(layer)
 const target=root.querySelector(e.target===0?'.fs-own-hero>button':`[data-player="${e.target}"] .fs-player-main`)
 if(target){target.dataset.judgmentAfflicted=e.kind;target.classList.add('fs-judgment-afflicted');target.style.setProperty('--judgment-elapsed',`-${frame.elapsed}ms`)}
}
