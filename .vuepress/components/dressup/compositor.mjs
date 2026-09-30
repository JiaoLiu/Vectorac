import {PARTS,partAsset} from './parts.mjs'
import bounds from './layer-bounds.mjs'
export const BASE='/img/games/dressup/layers/base.webp'
export function layerSources(parts){return [BASE,...Object.values(parts).map(id=>PARTS.find(p=>p.id===id)).filter(p=>p&&(p.category!=='face'||p.index!==0)).map(partAsset).filter(Boolean)]}
const geometry={top:[[148,190,216,225],[148,190,216,225],[149,182,214,226],[150,228,212,189]],bottom:[[85,391,342,302],[108,391,296,295],[73,389,366,560],[170,391,172,550]],socks:[[200,650,112,310],[202,650,108,310],[200,650,112,310],[202,650,108,310]],shoes:[[202,901,111,75],[202,901,111,75],[201,899,113,79],[201,867,113,111]],hat:[[167,8,179,173],[183,17,147,148],[181,7,150,149],[184,12,144,78]],headpiece:[[285,46,43,60],[289,66,38,42],[282,58,45,87],[286,54,40,62]],earrings:[[215,125,83,18],[215,123,83,25],[215,123,83,29],[217,125,80,17]],face:[[214,62,84,100],[211,62,90,100],[214,62,84,100],[213,62,86,100]]}
export function paintComposite(ctx,images,parts){
  ctx.clearRect(0,0,512,1024);ctx.drawImage(images.get(BASE),0,0,512,1024)
  function draw(category){const p=PARTS.find(p=>p.id===parts[category]);if(!p||p.index<0||category==='face'&&p.index===0)return;const src=partAsset(p),img=images.get(src),b=bounds[src],rect=geometry[category][p.index];if(!img||!b)return
    if(category==='earrings'){const h=p.index===2?23:p.index===1?21:16;ctx.drawImage(img,b.x,b.y,b.w/2,b.h,214,123,8,h);ctx.drawImage(img,b.x+b.w/2,b.y,b.w/2,b.h,290,123,8,h);return}
    // Keep the base hairline: face variants replace the lower forehead/face, not the hair crown.
    if(category==='face'){ctx.drawImage(img,b.x,b.y+b.h*.2,b.w,b.h*.8,p.index===1?212:214,77,p.index===1?88:84,84);return}
    ctx.drawImage(img,b.x,b.y,b.w,b.h,...rect)
  }
  draw('socks');draw('shoes');draw('bottom');draw('top');draw('face')
  // Makeup belongs to the face coordinates, and is drawn before headwear/jewelry.
  const face=Number(parts.face.split('-')[1]),brow=Number(parts.brows.split('-')[1]),lip=Number(parts.lip.split('-')[1])
  const by=98,ly=141
  if(face||brow){
    if(!face){ctx.fillStyle='#eecabb';for(const x of [228,265]){ctx.beginPath();ctx.ellipse(x+9,by,12,4,0,0,Math.PI*2);ctx.fill()}}
    ctx.strokeStyle='#694b3c';ctx.lineCap='round';ctx.lineWidth=brow===3?2.8:1.8
    for(const x of [227,267]){ctx.beginPath();ctx.moveTo(x,by+1);ctx.quadraticCurveTo(x+9,by-(brow===1?0:brow===2?5:3),x+19,by+(brow===3?-2:0));ctx.stroke()}
  }
  if(lip){const colors=['','#ad6375','#db806a','#8c3c56','#d692a9'];ctx.globalAlpha=.8;ctx.fillStyle=colors[lip];ctx.beginPath();ctx.moveTo(244,ly);ctx.quadraticCurveTo(251,ly-3,256,ly-1);ctx.quadraticCurveTo(261,ly-3,268,ly);ctx.quadraticCurveTo(256,ly+8,244,ly);ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#ffffff66';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(252,ly+3);ctx.lineTo(260,ly+3);ctx.stroke()}
  draw('earrings');draw('headpiece');draw('hat')
}
