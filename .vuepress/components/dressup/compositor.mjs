import {PARTS,partAsset,partBackAsset,fitIndex} from './parts.mjs'
import {materialImage} from './materials.mjs'
import bounds from './layer-bounds.mjs'
import {HAT_HAIR_CUTS} from './hat-coverage.mjs'
import {NEW_CAP_CUTS} from './accessory-coverage.mjs'
export const BASE='/img/games/dressup/layers/v5/master.webp'
export function baseSource(){return BASE}
export const FEET='/img/games/dressup/layers/v5/feet.webp'
export function underbodySource(parts){const p=PARTS.find(p=>p.id===parts.bottom&&p.category==='bottom');return p&&p.index>=12?'/img/games/dressup/layers/v11/underbody.webp':`/img/games/dressup/layers/v5/underbody-${p?fitIndex(p):0}.webp`}
export function layerSources(parts){return [...new Set([BASE,FEET,underbodySource(parts),...Object.values(parts).map(id=>PARTS.find(p=>p.id===id)).filter(Boolean).flatMap(p=>[partAsset(p),partBackAsset(p)]).filter(Boolean)])]}
// Anatomical layers keep the master 512 x 1024 canvas, never independent alpha fits.
export const REGISTERED_ORDER=['socks','shoes','bottom','top','face','eyes','brows','lip']
export const SOCK_VISIBLE_END=[955,925,954,880]
export const sockEnd=p=>p&&p.sockEnd!==undefined?p.sockEnd:SOCK_VISIBLE_END[p?fitIndex(p):0]
export function paintComposite(ctx,images,parts){
 const chosen=category=>PARTS.find(p=>p.id===parts[category]&&p.category===category)
 function registered(category){const p=chosen(category);if(!p||p.index<0)return
  const hat=chosen('hat'),capHair=category==='hair'&&hat&&(hat.cap||fitIndex(hat)>=0&&fitIndex(hat)<2)
  // Follow the cap's actual silhouette, not a horizontal cut through all hair.
  // No hat pixel in a column means no clipping of the side strands there.
  if(capHair){const cuts=hat.cap?NEW_CAP_CUTS[hat.id]:HAT_HAIR_CUTS[fitIndex(hat)];ctx.save();ctx.beginPath();ctx.moveTo(0,1024);ctx.lineTo(0,cuts[0]);for(let x=1;x<512;x++){ctx.lineTo(x,cuts[x-1]);ctx.lineTo(x,cuts[x])}ctx.lineTo(512,cuts[511]);ctx.lineTo(512,1024);ctx.closePath();ctx.clip()}
  if(category==='shoes'){const end=sockEnd(p);ctx.clearRect(185,end,142,1024-end)}
  if(category==='socks'){const shoe=chosen('shoes');ctx.save();ctx.beginPath();ctx.rect(0,0,512,sockEnd(shoe));ctx.clip()}
  ctx.drawImage(materialImage(images.get(partAsset(p)),p),0,0,512,1024)
  if(category==='socks')ctx.restore()
  if(capHair)ctx.restore()
 }
 ctx.clearRect(0,0,512,1024)
 registered('hair')
 const wristBack=partBackAsset(chosen('wrist'));if(wristBack)ctx.drawImage(images.get(wristBack),0,0,512,1024)
 ctx.drawImage(images.get(BASE),0,0,512,1024)
 ctx.drawImage(images.get(underbodySource(parts)),0,0,512,1024)
 ctx.drawImage(images.get(FEET),0,0,512,1024)
 for(const category of REGISTERED_ORDER){if(category==='face')ctx.clearRect(190,25,132,138);registered(category)}
 registered('necklace');registered('wrist')
 // Small accessories retain their established attachment anchors.
 const anchors={headpiece:[[285,46,43,60],[289,66,38,42],[282,58,45,87],[286,54,40,62]]}
 // Front strands do not contain skin patches. Jewellery is attached after hair
 // so a purchased/trial earring cannot disappear under the entire hair sprite.
 ctx.save();ctx.beginPath();ctx.rect(0,0,512,180);ctx.clip();registered('hair');ctx.restore()
 for(const category of ['earrings']){
  const p=chosen(category);if(!p||p.index<0)continue
  if(p.assetVersion==='v11'){registered(category);continue}
  const src=partAsset(p),b=bounds[src],img=images.get(src);if(!b||!img)continue
  if(category==='earrings'){const i=fitIndex(p),h=[21,25,27,12][i],w=i===3?9:11,rects=[[b.x,b.y,b.w/2,b.h,220-w/2,131,w,h],[b.x+b.w/2,b.y,b.w/2,b.h,292-w/2,131,w,h]]
   if(p.material)ctx.drawImage(materialImage(img,p,false,rects),0,0,512,1024)
   else for(const rect of rects)ctx.drawImage(img,...rect)
  }
 }
 const piece=chosen('headpiece');if(piece&&piece.index>=0&&piece.assetVersion==='v11')registered('headpiece')
 else if(piece&&piece.index>=0){const src=partAsset(piece),b=bounds[src],rect=[b.x,b.y,b.w,b.h,...anchors.headpiece[fitIndex(piece)]]
  if(piece.material)ctx.drawImage(materialImage(images.get(src),piece,false,[rect]),0,0,512,1024)
  else ctx.drawImage(images.get(src),...rect)
 }
 registered('hat')
}
