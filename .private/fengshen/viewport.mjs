// Safari's visual dimensions shrink during pinch zoom. Re-layout in unzoomed
// coordinates and counter-scale only this bounded game, not the entire website.
export function viewportFrame({innerWidth,innerHeight,viewport}){
 const scale=Number.isFinite(viewport?.scale)&&viewport.scale>0?viewport.scale:1
 let width=viewport?.width>0?viewport.width*scale:innerWidth
 if(Math.abs(width-innerWidth)>Math.max(48,innerWidth*.08))width=innerWidth
 const height=viewport?.height>0?viewport.height*scale:innerHeight
 return {width,height,scale,left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0}
}
export function bindGameViewport(root,layout,{win=window,doc=document}={}){
 let frame=0,settle=[],closed=false
 const update=()=>{
   if(closed||doc.hidden)return
   const v=viewportFrame({innerWidth:win.innerWidth,innerHeight:win.innerHeight,viewport:win.visualViewport})
   root.style.setProperty('--fs-width',v.width+'px');root.style.setProperty('--fs-height',v.height+'px');root.style.setProperty('--fs-left',v.left+'px');root.style.setProperty('--fs-top',v.top+'px');root.style.setProperty('--fs-scale',1/v.scale)
   layout()
 }
 const queue=()=>{win.cancelAnimationFrame(frame);frame=win.requestAnimationFrame(update)}
 const recover=()=>{settle.forEach(win.clearTimeout.bind(win));queue();settle=[80,240,600].map(ms=>win.setTimeout(queue,ms))}
 const visibility=()=>{if(!doc.hidden)recover()}
 const guard=e=>{if(root.classList.contains('fs-playing')&&e.cancelable)e.preventDefault()}
 win.addEventListener('resize',queue);win.addEventListener('orientationchange',recover);win.addEventListener('pageshow',recover);doc.addEventListener('visibilitychange',visibility)
 win.visualViewport?.addEventListener('resize',queue);win.visualViewport?.addEventListener('scroll',queue)
 root.addEventListener('gesturestart',guard,{passive:false});root.addEventListener('gesturechange',guard,{passive:false})
 update()
 return {update,recover,destroy(){closed=true;win.cancelAnimationFrame(frame);settle.forEach(win.clearTimeout.bind(win));win.removeEventListener('resize',queue);win.removeEventListener('orientationchange',recover);win.removeEventListener('pageshow',recover);doc.removeEventListener('visibilitychange',visibility);win.visualViewport?.removeEventListener('resize',queue);win.visualViewport?.removeEventListener('scroll',queue);root.removeEventListener('gesturestart',guard);root.removeEventListener('gesturechange',guard)}}
}
