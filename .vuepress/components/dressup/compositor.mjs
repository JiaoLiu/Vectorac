import {PARTS,partAsset} from './parts.mjs'
import bounds from './layer-bounds.mjs'
export const BASE='/img/games/dressup/layers/v5/master.webp'
export function baseSource(){return BASE}
export const FEET='/img/games/dressup/layers/v5/feet.webp'
export function underbodySource(parts){const p=PARTS.find(p=>p.id===parts.bottom&&p.category==='bottom');return `/img/games/dressup/layers/v5/underbody-${p?p.index:0}.webp`}
export function layerSources(parts){return [...new Set([BASE,FEET,underbodySource(parts),...Object.values(parts).map(id=>PARTS.find(p=>p.id===id)).filter(Boolean).map(partAsset).filter(Boolean)])]}
// Anatomical layers keep the master 512 x 1024 canvas, never independent alpha fits.
export const REGISTERED_ORDER=['socks','shoes','bottom','top','face','eyes','brows','lip']
export const SOCK_VISIBLE_END=[955,925,954,880]
export function paintComposite(ctx,images,parts){
 const chosen=category=>PARTS.find(p=>p.id===parts[category]&&p.category===category)
 function registered(category){const p=chosen(category);if(!p||p.index<0)return
  const hat=chosen('hat'),capHair=category==='hair'&&hat&&hat.index>=0&&hat.index<2
  // A solid hat encloses the crown/ponytail root. The tail below the cap remains.
  if(capHair){ctx.save();ctx.beginPath();ctx.rect(0,59,512,965);ctx.clip()}
  if(category==='shoes'){const end=SOCK_VISIBLE_END[p.index];ctx.clearRect(185,end,142,1024-end)}
  if(category==='socks'){const shoe=chosen('shoes');ctx.save();ctx.beginPath();ctx.rect(0,0,512,SOCK_VISIBLE_END[shoe?shoe.index:0]);ctx.clip()}
  ctx.drawImage(images.get(partAsset(p)),0,0,512,1024)
  if(category==='socks')ctx.restore()
  if(capHair)ctx.restore()
 }
 ctx.clearRect(0,0,512,1024)
 registered('hair');ctx.drawImage(images.get(BASE),0,0,512,1024)
 ctx.drawImage(images.get(underbodySource(parts)),0,0,512,1024)
 ctx.drawImage(images.get(FEET),0,0,512,1024)
 for(const category of REGISTERED_ORDER){if(category==='face')ctx.clearRect(190,25,132,138);registered(category)}
 // Small accessories retain their established attachment anchors.
 const anchors={headpiece:[[285,46,43,60],[289,66,38,42],[282,58,45,87],[286,54,40,62]]}
 // Front strands do not contain skin patches. Jewellery is attached after hair
 // so a purchased/trial earring cannot disappear under the entire hair sprite.
 ctx.save();ctx.beginPath();ctx.rect(0,0,512,180);ctx.clip();registered('hair');ctx.restore()
 for(const category of ['earrings']){
  const p=chosen(category);if(!p||p.index<0)continue
  const src=partAsset(p),b=bounds[src],img=images.get(src);if(!b||!img)continue
  if(category==='earrings'){const h=[21,25,27,12][p.index],w=p.index===3?9:11;ctx.drawImage(img,b.x,b.y,b.w/2,b.h,220-w/2,131,w,h);ctx.drawImage(img,b.x+b.w/2,b.y,b.w/2,b.h,292-w/2,131,w,h)}
 }
 const piece=chosen('headpiece');if(piece&&piece.index>=0){const src=partAsset(piece),b=bounds[src];ctx.drawImage(images.get(src),b.x,b.y,b.w,b.h,...anchors.headpiece[piece.index])}
 registered('hat')
}
