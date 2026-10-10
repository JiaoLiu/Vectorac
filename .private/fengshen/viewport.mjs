import {bindVirtualMedia,logicalScreen}from './screen-mode.mjs'
// Keep logical layout stable while allowing native pinch zoom and pan.
export function viewportFrame({innerWidth,innerHeight,viewport}){
 const scale=Number.isFinite(viewport?.scale)&&viewport.scale>0?viewport.scale:1
 let width=viewport?.width>0?viewport.width*scale:innerWidth
 if(Math.abs(width-innerWidth)>Math.max(48,innerWidth*.08))width=innerWidth
 const height=viewport?.height>0?viewport.height*scale:innerHeight
 return {width,height,scale,left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0}
}
export function bindGameViewport(root,layout,{win=window,doc=document,mobile=()=>win.matchMedia?.('(pointer: coarse)').matches||win.navigator?.maxTouchPoints>0}={}){
 let frame=0,settle=[],closed=false,immersive=false,rotated=false,spacer=null,mobileOverride=null
 const media=bindVirtualMedia(doc),isMobile=()=>mobileOverride??!!mobile()
 const syncSpacer=()=>{
  const on=immersive&&isMobile()&&!doc.fullscreenElement&&!doc.webkitFullscreenElement
  if(doc.documentElement?.classList){doc.documentElement.classList.toggle('fs-immersive-scroll',on);doc.body.classList.toggle('fs-immersive-scroll',on)}
  if(on){if(!spacer){spacer=doc.createElement('div');spacer.className='fs-scroll-spacer';spacer.setAttribute('aria-hidden','true')}if(!spacer.parentNode)doc.body.appendChild(spacer);spacer.style.height=(win.innerHeight+120)+'px'}
  else if(spacer){spacer.remove();spacer=null}
 }
 const update=()=>{
   if(closed||doc.hidden)return
   const v=viewportFrame({innerWidth:win.innerWidth,innerHeight:win.innerHeight,viewport:win.visualViewport}),s=logicalScreen({...v,immersive,mobile:isMobile(),rotated})
   root.classList.toggle?.('fs-force-landscape',s.force);if(root.dataset)root.dataset.virtualLandscape=String(s.force)
   root.style.setProperty('--fs-width',s.width+'px');root.style.setProperty('--fs-height',s.height+'px');root.style.setProperty('--fs-left',(s.force?v.width:0)+'px');root.style.setProperty('--fs-top','0px');root.style.setProperty('--fs-scale',1);root.style.setProperty('--fs-rotation',s.force?'90deg':'0deg')
   media.apply(s.force,s.width,s.height);syncSpacer();layout()
 }
 const queue=()=>{win.cancelAnimationFrame(frame);frame=win.requestAnimationFrame(update)}
 const recover=()=>{settle.forEach(win.clearTimeout.bind(win));queue();settle=[80,240,600].map(ms=>win.setTimeout(queue,ms))}
 const visibility=()=>{if(!doc.hidden)recover()}
 const orientation=()=>{if(immersive)rotated=true;recover()}
 win.addEventListener('resize',queue);win.addEventListener('orientationchange',orientation);win.addEventListener('pageshow',recover);doc.addEventListener('visibilitychange',visibility)
 win.visualViewport?.addEventListener('resize',queue);win.visualViewport?.addEventListener('scroll',queue)
 update()
 return {update,recover,setImmersive(on){const changed=immersive!==!!on;immersive=!!on;update();if(changed&&immersive&&isMobile()&&!doc.fullscreenElement)win.scrollTo?.(0,1);if(changed&&!immersive)win.scrollTo?.(0,0)},setMobileOverride(value){mobileOverride=value;update()},destroy(){immersive=false;syncSpacer();media.restore();root.classList.remove?.('fs-force-landscape');closed=true;win.cancelAnimationFrame(frame);settle.forEach(win.clearTimeout.bind(win));win.removeEventListener('resize',queue);win.removeEventListener('orientationchange',orientation);win.removeEventListener('pageshow',recover);doc.removeEventListener('visibilitychange',visibility);win.visualViewport?.removeEventListener('resize',queue);win.visualViewport?.removeEventListener('scroll',queue)}}
}
