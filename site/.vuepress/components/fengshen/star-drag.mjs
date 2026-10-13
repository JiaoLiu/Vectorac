import {localPoint}from './screen-mode.mjs'
export function moveStarCard(state,id,zone,beforeId=null){
 if(!state||!['top','bottom'].includes(zone)||!state.top.concat(state.bottom).includes(id))return state
 const next={...state,top:state.top.filter(x=>x!==id),bottom:state.bottom.filter(x=>x!==id)}
 const at=next[zone].indexOf(beforeId);next[zone].splice(at<0?next[zone].length:at,0,id);return next
}
export function bindStarDrag(root,{getState,onMove,onInteraction=()=>{}}){
 let drag=null,suppressUntil=0
 const cleanup=()=>{if(!drag)return;root.querySelectorAll('.is-dragging,.is-drop-target').forEach(e=>e.classList.remove('is-dragging','is-drop-target'));drag.ghost?.remove();try{root.releasePointerCapture(drag.pointer)}catch{}drag=null;onInteraction(false)}
 const down=e=>{
   const card=e.target.closest('.fs-star-card');if(!card||e.button!==0||e.isPrimary===false||!getState())return
   cleanup();drag={id:card.dataset.id,pointer:e.pointerId,x:e.clientX,y:e.clientY,card,moved:false,zone:null,before:null};onInteraction(true);root.setPointerCapture?.(e.pointerId)
 }
 const move=e=>{
   if(!drag||e.pointerId!==drag.pointer)return
   if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return
   if(e.cancelable)e.preventDefault()
   if(!drag.moved){drag.moved=true;drag.card.classList.add('is-dragging');drag.ghost=document.createElement('div');drag.ghost.className='fs-star-ghost';drag.ghost.setAttribute('aria-hidden','true');drag.ghost.style.width=drag.card.offsetWidth+'px';drag.ghost.style.height=drag.card.offsetHeight+'px';drag.ghost.append(drag.card.querySelector('.fs-card-face').cloneNode(true));root.append(drag.ghost)}
   const point=localPoint(root,e.clientX,e.clientY)
   drag.ghost.style.left=point.x+'px';drag.ghost.style.top=point.y+'px'
   const hit=document.elementFromPoint(e.clientX,e.clientY),zone=hit?.closest('[data-star-zone]')
   root.querySelectorAll('.is-drop-target').forEach(e=>e.classList.remove('is-drop-target'))
   drag.zone=zone?.dataset.starZone||null;drag.before=null
   if(zone){
     const list=zone.querySelector('.fs-center-card-list'),r=list.getBoundingClientRect(),rotated=root.classList.contains('fs-force-landscape'),axis=rotated?e.clientY:e.clientX,start=rotated?r.top:r.left,end=rotated?r.bottom:r.right;if(axis>end-18)list.scrollLeft+=14;if(axis<start+18)list.scrollLeft-=14
     const before=[...list.querySelectorAll('.fs-star-card')].filter(c=>c.dataset.id!==drag.id).find(c=>{const r=c.getBoundingClientRect();return rotated?e.clientY<r.top+r.height/2:e.clientX<r.left+r.width/2})
     drag.before=before?.dataset.id||null;before?.classList.add('is-drop-target')
   }
 }
 const up=e=>{
   if(!drag||e.pointerId!==drag.pointer)return
   const {moved,id,zone,before}=drag;cleanup()
   if(moved){suppressUntil=Date.now()+500;if(zone)onMove(moveStarCard(getState(),id,zone,before));if(e.cancelable)e.preventDefault()}
 }
 const click=e=>{if(Date.now()<suppressUntil&&e.target.closest('.fs-star-choice')){e.preventDefault();e.stopImmediatePropagation()}}
 const key=e=>{
   const button=e.target.closest('.fs-star-card'),s=getState();if(!button||!s||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return
   e.preventDefault();e.stopPropagation();const id=button.dataset.id,zone=s.top.includes(id)?'top':'bottom',at=s[zone].indexOf(id)
   if(['ArrowUp','ArrowDown'].includes(e.key))onMove(moveStarCard(s,id,e.key==='ArrowUp'?'top':'bottom'))
   else{const to=e.key==='ArrowLeft'?at-1:at+1;if(to<0||to>=s[zone].length)return;const next={...s,[zone]:s[zone].slice()};[next[zone][at],next[zone][to]]=[next[zone][to],next[zone][at]];onMove(next)}
   root.querySelector(`.fs-star-card[data-id="${id}"]`)?.focus({preventScroll:true})
 }
 const visibility=()=>{if(document.hidden)cleanup()}
 root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move,{passive:false});root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cleanup);root.addEventListener('lostpointercapture',cleanup);root.addEventListener('click',click,true);root.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);window.addEventListener('orientationchange',cleanup);window.addEventListener('resize',cleanup)
 return {cancel:cleanup,destroy(){cleanup();root.removeEventListener('pointerdown',down);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',cleanup);root.removeEventListener('lostpointercapture',cleanup);root.removeEventListener('click',click,true);root.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('orientationchange',cleanup);window.removeEventListener('resize',cleanup)}}
}
