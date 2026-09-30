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
  if(category==='shoes'){const end=SOCK_VISIBLE_END[p.index];ctx.clearRect(185,end,142,1024-end)}
  if(category==='socks'){const shoe=chosen('shoes');ctx.save();ctx.beginPath();ctx.rect(0,0,512,SOCK_VISIBLE_END[shoe?shoe.index:0]);ctx.clip()}
  ctx.drawImage(images.get(partAsset(p)),0,0,512,1024)
  if(category==='socks')ctx.restore()
 }
 ctx.clearRect(0,0,512,1024)
 registered('hair');ctx.drawImage(images.get(BASE),0,0,512,1024)
 ctx.drawImage(images.get(underbodySource(parts)),0,0,512,1024)
 ctx.drawImage(images.get(FEET),0,0,512,1024)
 for(const category of REGISTERED_ORDER){if(category==='face')ctx.clearRect(200,30,112,133);registered(category)}
 ctx.save();ctx.beginPath();ctx.rect(0,0,512,180);ctx.clip();registered('hair');ctx.restore()
 // Small accessories retain their established attachment anchors.
 const anchors={hat:[[167,8,179,173],[183,17,147,148],[181,7,150,149],[184,12,144,78]],headpiece:[[285,46,43,60],[289,66,38,42],[282,58,45,87],[286,54,40,62]]}
 for(const category of ['earrings','headpiece','hat']){
  const p=chosen(category);if(!p||p.index<0)continue
  const src=partAsset(p),b=bounds[src],img=images.get(src);if(!b||!img)continue
  if(category==='earrings'){const h=p.index===2?23:p.index===1?21:16;ctx.drawImage(img,b.x,b.y,b.w/2,b.h,206,119,8,h);ctx.drawImage(img,b.x+b.w/2,b.y,b.w/2,b.h,299,119,8,h)}
  else ctx.drawImage(img,b.x,b.y,b.w,b.h,...anchors[category][p.index])
 }
}
