// One coordinate system for the board, seats and hand. Never use zoomed screen
// rectangles or equipment count to decide a portrait's dimensions.
import {tableCardLayout,publicDiscardLayout} from './table-trail.mjs'
import {choicePanelGeometry} from './panel-selection.mjs'
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))
export function arenaGeometry({width,height,seats=5,safeTop=0,safeBottom=0}){
 const landscape=width>height,gap=clamp(width*.012,6,12),topSeats=seats===2?[1]:!landscape&&seats===8?[3,4,5]:Array.from({length:Math.max(1,seats-3)},(_,i)=>i+2)
 let heroHeight,dockHeight,centerTop,centerBottom,positions={}
 if(landscape){
   heroHeight=Math.min(174,height*.34,(width-gap*(topSeats.length+1))/(topSeats.length+2)*1.46)
   heroHeight=Math.max(56,heroHeight)
   dockHeight=clamp(height*.29,82,146)+50
   // Reuse the hand-heading/lift clearance; never scale the whole board.
   centerTop=heroHeight+8;centerBottom=height-dockHeight+28
 }else{
   // Upright own portrait alongside a horizontally scrolling hand, not above it.
   dockHeight=(width<360?95:115)+98+safeBottom
   const board=height-safeTop-dockHeight
   heroHeight=Math.max(52,Math.min(132,board*.29,(width-gap*(topSeats.length+1))/(topSeats.length+2)*1.46))
   centerTop=safeTop+heroHeight+38;centerBottom=height-dockHeight-8
 }
 const heroWidth=heroHeight/1.46,block=topSeats.length*heroWidth+(topSeats.length-1)*gap,start=(width-block)/2,top=landscape?0:safeTop+28
 topSeats.forEach((seat,i)=>positions[seat]={x:start+i*(heroWidth+gap),y:top,width:heroWidth,height:heroHeight})
 if(seats!==2){
   const sideY=landscape?Math.max(30,height-safeBottom-2*heroHeight-gap):top+heroHeight+gap
   positions[1]={x:0,y:sideY,width:heroWidth,height:heroHeight}
   positions[seats-1]={x:width-heroWidth,y:sideY,width:heroWidth,height:heroHeight}
   if(!landscape&&seats===8){positions[2]={x:0,y:sideY,width:heroWidth,height:heroHeight};positions[1].y+=heroHeight+gap;positions[6]={x:width-heroWidth,y:sideY,width:heroWidth,height:heroHeight};positions[7].y+=heroHeight+gap}
 }
 const center={left:heroWidth+gap,right:width-heroWidth-gap,top:centerTop,bottom:Math.max(centerTop+40,centerBottom)}
 const ownHeroHeight=landscape?heroHeight:clamp(height*.18,132,160)
 return {landscape,width,height,heroWidth,heroHeight,ownHeroHeight,ownHeroWidth:ownHeroHeight/1.46,gap,dockHeight,handHeight:dockHeight-28,actionWidth:clamp(width*.13,80,116),positions,center}
}
export function centerCardHeight(center){return clamp(center.bottom-center.top-28,24,132)}
export function takeCardHeight(rowHeight){return clamp(rowHeight-24,32,124)}
export function poolCardHeight({width,height,count}){const fit=(width-4-Math.max(0,count-1)*8)/Math.max(1,count)*1.44;return Math.max(32,Math.min(120,height,fit>=96?fit:120))}
export function heroNameSize({height,count,reserved=18,portraitOwn=false}){return Math.max(5,Math.min(15,(height-reserved-2-(portraitOwn?9:11))/Math.max(1,count)/1.05))}
export function layoutArena(root){
 const arena=root.querySelector('.fs-arena');if(!arena)return
 const style=getComputedStyle(root),left=parseFloat(style.paddingLeft)||0,right=parseFloat(style.paddingRight)||0,top=parseFloat(style.paddingTop)||0,bottom=parseFloat(style.paddingBottom)||0
 const g=arenaGeometry({width:root.clientWidth-left-right,height:root.clientHeight,seats:Number(arena.dataset.seats),safeTop:top,safeBottom:bottom})
 root.dataset.layout=g.landscape?'landscape':'portrait'
 const panelFit=choicePanelGeometry({height:g.height,safeTop:top,safeBottom:bottom});root.style.setProperty('--choice-top',panelFit.top+'px');root.style.setProperty('--choice-height',panelFit.height+'px')
 for(const [key,value]of Object.entries({'hero-width':g.heroWidth,'hero-height':g.heroHeight,'own-hero-width':g.ownHeroWidth,'own-hero-height':g.ownHeroHeight,'dock-size':g.dockHeight,'hand-height':g.handHeight,'action-width':g.actionWidth,'seat-gap':g.gap,'center-top':g.center.top,'center-bottom':g.height-g.center.bottom,'center-side':g.center.left}))root.style.setProperty('--'+key,value+'px')
 root.style.setProperty('--take-card-height',Math.max(48,Math.min(124,g.height-top-bottom-176))+'px')
 root.style.setProperty('--center-card-height',centerCardHeight(g.center)+'px')
 const trail=root.querySelector('.fs-table-trail')
 if(trail){const cards=[...trail.querySelectorAll('.fs-card-play')],fit=tableCardLayout({width:g.center.right-g.center.left,height:g.center.bottom-g.center.top,count:cards.length}),focus=cards.filter(c=>c.classList.contains('is-current-effect')).slice(-fit.visible),rest=cards.filter(c=>!focus.includes(c)).slice(-Math.max(0,fit.visible-focus.length));trail.style.setProperty('--table-columns',fit.columns);trail.style.setProperty('--table-card-height',fit.cardHeight+'px');cards.forEach(c=>c.hidden=!focus.includes(c)&&!(fit.visible>focus.length&&rest.includes(c)))}
 // 公开弃置/阵亡亮牌一次可能摆出整副手牌：竖屏上下有空间就多行铺开，横屏按宽度压小牌面，绝不横向裁切。
 const discard=root.querySelector('.fs-played.fs-public-discard')
 if(discard){const cards=[...discard.querySelectorAll('.fs-card-play')],avail=Math.max(24,(g.center.bottom-g.center.top)-(trail?.offsetHeight||0)-8),fit=publicDiscardLayout({width:g.center.right-g.center.left,height:avail,count:cards.length});discard.style.setProperty('--table-columns',fit.columns);discard.style.setProperty('--table-card-height',fit.cardHeight+'px');cards.forEach((c,i)=>c.hidden=i<cards.length-fit.visible)}
 root.style.setProperty('--pool-card-height',Math.max(32,Math.min(120,g.height-g.dockHeight-60))+'px')
 const pool=root.querySelector('.fs-pool-choice'),list=pool?.querySelector('.fs-center-card-list')
 if(list)pool.style.setProperty('--pool-card-height',poolCardHeight({width:list.clientWidth,height:Math.max(32,list.clientHeight-16),count:list.querySelectorAll('.fs-choice-card').length})+'px')
 const take=root.querySelector('.fs-take-choice'),takeRow=take?.querySelector('.fs-center-card-list')
 if(takeRow)take.style.setProperty('--take-card-height',takeCardHeight(takeRow.clientHeight)+'px')
 for(const name of root.querySelectorAll('.fs-player-info>strong,.fs-own-hero strong')){const own=name.closest('.fs-own-hero'),panel=own?.closest('.fs-own-panel'),equipped=own?!!panel.querySelector('.fs-equip'):Number(name.closest('.fs-player')?.dataset.equipCount)>0,three=panel?.dataset.skillCount==='3',reserved=own?(equipped?(three?73:57):(three?44:29)):(equipped?76:46);name.style.setProperty('--hero-name-size',heroNameSize({height:own?g.ownHeroHeight:g.heroHeight,count:[...name.textContent].length,reserved})+'px')}
 for(const p of root.querySelectorAll('.fs-player')){const r=g.positions[p.dataset.player];if(r)Object.assign(p.style,{left:r.x+'px',top:r.y+'px',right:'auto',bottom:'auto',width:r.width+'px',height:r.height+'px',transform:'none'})}
 for(const zone of root.querySelectorAll('.fs-star-zone')){
   const list=zone.querySelector('.fs-center-card-list'),fit=(list.clientWidth-32)/5*1.44
   zone.style.setProperty('--star-card-height',Math.min(130,root.clientHeight*.32,Math.max(85,fit))+'px')
 }
 return g
}
// Scroll the hand only; scrollIntoView can pan the whole Safari visual viewport.
export function revealHandCard(root,id){
 const hand=root.querySelector('.fs-hand'),button=hand?.querySelector(`[data-id="${id}"]`);if(!button)return
 const row=button.closest('.fs-hand-row'),x=button.offsetLeft+(row?.offsetLeft||0),width=button.querySelector('.fs-card-face')?.offsetWidth||button.offsetWidth
 hand.scrollLeft=handScrollForCard({scrollLeft:hand.scrollLeft,viewportWidth:hand.clientWidth,cardStart:x,cardWidth:width});hand.scrollTop=0
}
export function handScrollForCard({scrollLeft,viewportWidth,cardStart,cardWidth}){
 if(cardStart<scrollLeft+2)return Math.max(0,cardStart-2)
 if(cardStart+cardWidth>scrollLeft+viewportWidth-2)return Math.max(0,cardStart+cardWidth-viewportWidth+2)
 return scrollLeft
}
