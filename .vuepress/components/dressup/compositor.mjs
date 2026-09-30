import {PARTS,partAsset} from './parts.mjs'
import oldBounds from './layer-bounds.mjs'
import newBounds from './layer-bounds-v4.mjs'
const bounds={...oldBounds,...newBounds}
export const BASE='/img/games/dressup/layers/v4/base-0.webp'
export function baseSource(parts){const p=PARTS.find(p=>p.id===parts.face&&p.category==='face');return `/img/games/dressup/layers/v4/base-${p?p.index:0}.webp`}
export function layerSources(parts){return [...new Set([baseSource(parts),...Object.values(parts).map(id=>PARTS.find(p=>p.id===id)).filter(p=>p&&p.category!=='face').map(partAsset).filter(Boolean)])]}
const geometry={top:[[148,190,216,225],[148,190,216,225],[149,182,214,226],[150,201,212,216]],bottom:[[85,391,342,302],[108,391,296,295],[73,389,366,560],[170,391,172,550]],socks:[[199,650,114,333],[201,650,110,333],[199,650,114,333],[201,650,110,333]],shoes:[[199,927,114,58],[199,930,114,55],[199,927,114,58],[199,893,114,92]],hat:[[167,8,179,173],[183,17,147,148],[181,7,150,149],[184,12,144,78]],headpiece:[[285,46,43,60],[289,66,38,42],[282,58,45,87],[286,54,40,62]],earrings:[[215,125,83,18],[215,123,83,25],[215,123,83,29],[217,125,80,17]]}
// Fixed face-window anchors, not alpha bounding boxes: long hair is not scaled
// to the bob's height. Back lengths go behind the body; fringe goes in front.
const hairGeometry=[[138,16,224,224],[94,23,320,320],[142,24,224,224],[139,-5,230,230]]
const bodyOutline=[[180,270],[186,350],[180,390],[160,440],[155,490],[166,560],[180,640],[186,700],[200,860],[196,985]]
// Garments define the dressed silhouette. Suppress the covered torso/hip/leg
// silhouette instead of letting the wider base poke through beside a skirt.
export function coveredBody(parts){
 const bottom=PARTS.find(p=>p.id===parts.bottom),end=[650,655,942,942][bottom?bottom.index:0]
 const edge=[]
 for(let i=0;i<bodyOutline.length;i++){
  const [x,y]=bodyOutline[i];if(y<=end)edge.push([x,y])
  else{const [px,py]=bodyOutline[i-1];edge.push([px+(x-px)*(end-py)/(y-py),end]);break}
 }
 const sockStart=Math.max(end,650)
 return [edge.concat(edge.slice().reverse().map(([x,y])=>[512-x,y])),...(parts.socks!=='socks-none'?[[[176,sockStart],[336,sockStart],[336,985],[176,985]]]:[])]
}
export function paintComposite(ctx,images,parts){
  const hair=PARTS.find(p=>p.id===parts.hair&&p.category==='hair'),hairImage=hair&&images.get(partAsset(hair))
  function drawHair(){if(hairImage)ctx.drawImage(hairImage,...hairGeometry[hair.index])}
  ctx.clearRect(0,0,512,1024);drawHair()
  ctx.save();ctx.beginPath();ctx.rect(0,0,512,1024)
  for(const polygon of coveredBody(parts)){ctx.moveTo(...polygon[0]);for(const p of polygon.slice(1))ctx.lineTo(...p);ctx.closePath()}
  ctx.clip('evenodd');ctx.drawImage(images.get(baseSource(parts)),0,0,512,1024);ctx.restore()
  function draw(category){const p=PARTS.find(p=>p.id===parts[category]);if(!p||p.index<0)return;const src=partAsset(p),img=images.get(src),b=bounds[src],rect=geometry[category][p.index];if(!img||!b)return
    if(category==='earrings'){const h=p.index===2?23:p.index===1?21:16;ctx.drawImage(img,b.x,b.y,b.w/2,b.h,214,123,8,h);ctx.drawImage(img,b.x+b.w/2,b.y,b.w/2,b.h,290,123,8,h);return}
    if(category==='bottom'){
      const [x,y,w,h]=rect,waist=[1.35,1.2,1.22,1.35][p.index]
      for(let dy=0;dy<h;dy+=2){const dh=Math.min(2,h-dy),scale=1+(waist-1)*Math.max(0,1-dy/(h*.18));ctx.drawImage(img,b.x,b.y+b.h*dy/h,b.w,b.h*dh/h,256+(x-256)*scale,y+dy,w*scale,dh)}
      return
    }
    ctx.drawImage(img,b.x,b.y,b.w,b.h,...rect)
  }
  draw('socks');draw('shoes');draw('bottom');draw('top')
  // Makeup belongs to the face coordinates, and is drawn before headwear/jewelry.
  const brow=Number(parts.brows.split('-')[1]),lip=Number(parts.lip.split('-')[1])
  const by=98,ly=141
  if(brow){
    ctx.fillStyle='#eecabb';for(const x of [228,265]){ctx.beginPath();ctx.ellipse(x+9,by,12,4,0,0,Math.PI*2);ctx.fill()}
    ctx.strokeStyle='#694b3c';ctx.lineCap='round';ctx.lineWidth=brow===3?2.8:1.8
    for(const x of [227,267]){ctx.beginPath();ctx.moveTo(x,by+1);ctx.quadraticCurveTo(x+9,by-(brow===1?0:brow===2?5:3),x+19,by+(brow===3?-2:0));ctx.stroke()}
  }
  if(lip){const colors=['','#ad6375','#db806a','#8c3c56','#d692a9'];ctx.globalAlpha=.8;ctx.fillStyle=colors[lip];ctx.beginPath();ctx.moveTo(244,ly);ctx.quadraticCurveTo(251,ly-3,256,ly-1);ctx.quadraticCurveTo(261,ly-3,268,ly);ctx.quadraticCurveTo(256,ly+8,244,ly);ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#ffffff66';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(252,ly+3);ctx.lineTo(260,ly+3);ctx.stroke()}
  ctx.save();ctx.beginPath();ctx.rect(0,0,512,180);ctx.clip();drawHair();ctx.restore()
  draw('earrings');draw('headpiece');draw('hat')
}
