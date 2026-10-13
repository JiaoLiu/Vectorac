import {PARTS,partAsset,partBackAsset,partHairAsset,fitIndex} from './parts.mjs'
import {materialImage} from './materials.mjs'
import bounds from './layer-bounds.mjs'
import {HAT_HAIR_CUTS} from './hat-coverage.mjs'
import {NEW_CAP_CUTS} from './accessory-coverage.mjs'
import {tucksIntoWaist,clipTuckedTop} from './waist-fit.mjs'
import {bakedFeature} from './beauty.mjs'
import {BODY_HEAD_START,fullCap,crownCut} from './head-fit.mjs'
import {HAIR_PIECE_ANCHORS,capDecoration} from './headpiece-fit.mjs'
export const BASE='/img/games/dressup/layers/v5/master.webp'
export function baseSource(){return BASE}
export const FEET='/img/games/dressup/layers/v5/feet.webp'
export function underbodySource(parts){const p=PARTS.find(p=>p.id===parts.bottom&&p.category==='bottom');return p&&['v13','v14'].includes(p.wearVersion)?'/img/games/dressup/layers/v13/underbody.webp':p&&p.index>=12?'/img/games/dressup/layers/v11/underbody.webp':`/img/games/dressup/layers/v5/underbody-${p?fitIndex(p):0}.webp`}
export function layerSources(parts){const hat=PARTS.find(p=>p.id===parts.hat);return [...new Set([BASE,FEET,underbodySource(parts),...Object.values(parts).map(id=>PARTS.find(p=>p.id===id)).filter(Boolean).flatMap(p=>[p.category==='hair'?partHairAsset(p,hat):partAsset(p),partBackAsset(p,hat)]).filter(Boolean)])]}
// Anatomical layers keep the master 512 x 1024 canvas, never independent alpha fits.
export const REGISTERED_ORDER=['socks','shoes','bottom','top','face','eyes','brows','lip']
export const SOCK_VISIBLE_END=[955,925,954,880]
export const sockEnd=p=>p&&p.sockEnd!==undefined?p.sockEnd:SOCK_VISIBLE_END[p?fitIndex(p):0]
export function paintComposite(ctx,images,parts){
 const chosen=category=>PARTS.find(p=>p.id===parts[category]&&p.category===category)
 const tucked=tucksIntoWaist(chosen('top'),chosen('bottom'))
 function registered(category,back=false){const p=chosen(category);if(!p||p.index<0)return
  if(!back&&bakedFeature(chosen('face'),p))return
  const hat=chosen('hat'),source=back?partBackAsset(p,hat):category==='hair'?partHairAsset(p,hat):partAsset(p);if(!source)return
  const capHair=category==='hair'&&fullCap(hat)
  // Follow the cap's actual silhouette, not a horizontal cut through all hair.
  // No hat pixel in a column means no clipping of the side strands there.
  if(capHair){const cuts=hat.cap?NEW_CAP_CUTS[hat.id]:HAT_HAIR_CUTS[fitIndex(hat)],cut=x=>crownCut(p,cuts[x],back);ctx.save();ctx.beginPath();ctx.moveTo(0,1024);ctx.lineTo(0,cut(0));for(let x=1;x<512;x++){ctx.lineTo(x,cut(x-1));ctx.lineTo(x,cut(x))}ctx.lineTo(512,cut(511));ctx.lineTo(512,1024);ctx.closePath();ctx.clip()}
  if(category==='shoes'){const end=sockEnd(p);ctx.clearRect(185,end,142,1024-end)}
  if(category==='socks'){const shoe=chosen('shoes');ctx.save();ctx.beginPath();ctx.rect(0,0,512,sockEnd(shoe));ctx.clip()}
  if(category==='top'&&tucked){ctx.save();clipTuckedTop(ctx)}
  if(category==='top'){ctx.save();ctx.beginPath();ctx.rect(0,BODY_HEAD_START,512,1024-BODY_HEAD_START);ctx.clip()}
  const image=materialImage(images.get(source),p)
  const frame=back?p.backFrame:p.frame
  ctx.drawImage(image,...(frame?[frame.x,frame.y,frame.w,frame.h]:[0,0,512,1024]))
  if(category==='top')ctx.restore()
  if(category==='top'&&tucked)ctx.restore()
  if(category==='socks')ctx.restore()
  if(capHair)ctx.restore()
 }
 ctx.clearRect(0,0,512,1024)
 registered('hair',true)
 registered('hair')
 const wristBack=partBackAsset(chosen('wrist'));if(wristBack)ctx.drawImage(images.get(wristBack),0,0,512,1024)
 // Old head skin is excluded on the layers that contain it, BEFORE blending
 // the new head. Never erase a rectangle from already painted rear/side hair.
 ctx.save();ctx.beginPath();ctx.rect(0,BODY_HEAD_START,512,1024-BODY_HEAD_START);ctx.clip()
 ctx.drawImage(images.get(BASE),0,0,512,1024)
 ctx.drawImage(images.get(underbodySource(parts)),0,0,512,1024)
 ctx.restore()
 ctx.drawImage(images.get(FEET),0,0,512,1024)
 for(const category of REGISTERED_ORDER){
  if(category==='bottom'&&tucked)continue
  registered(category)
  // A tucked blouse has no loose side tails. Untucked Chinese jackets keep
  // their whole curved hem over the skirt, even when it covers the band.
  if(category==='top'&&tucked)registered('bottom')
 }
 registered('necklace');registered('wrist')
 // Small accessories retain their established attachment anchors.
 // Front strands do not contain skin patches. Jewellery is attached after hair
 // so a purchased/trial earring cannot disappear under the entire hair sprite.
 // Complete front layers preserve every temple strand and long side lock.
 // The ponytail is a clean hair-only image, not an old model with skin remnants.
 registered('hair')
 for(const category of ['earrings']){
  const p=chosen(category);if(!p||p.index<0)continue
  if(p.assetVersion==='v11'){registered(category);continue}
  const src=partAsset(p),b=bounds[src],img=images.get(src);if(!b||!img)continue
  if(category==='earrings'){const i=fitIndex(p),h=[21,25,27,12][i],w=i===3?9:11,rects=[[b.x,b.y,b.w/2,b.h,220-w/2,131,w,h],[b.x+b.w/2,b.y,b.w/2,b.h,292-w/2,131,w,h]]
   if(p.material)ctx.drawImage(materialImage(img,p,false,rects),0,0,512,1024)
   else for(const rect of rects)ctx.drawImage(img,...rect)
  }
 }
 const piece=chosen('headpiece'),decoration=capDecoration(piece,chosen('hat'))
 function paintHeadpiece(){if(!piece||piece.index<0)return
  if(piece.assetVersion==='v11'&&!decoration){registered('headpiece');return}
  const src=partAsset(piece),b=bounds[src]||(piece.id==='headpiece-10'?{x:289,y:50,w:40,h:52}:null);if(!b)return
  const rect=[b.x,b.y,b.w,b.h,...(decoration||HAIR_PIECE_ANCHORS[fitIndex(piece)])]
  if(piece.material)ctx.drawImage(materialImage(images.get(src),piece,false,[rect]),0,0,512,1024)
  else ctx.drawImage(images.get(src),...rect)
 }
 if(!decoration)paintHeadpiece()
 registered('hat')
 if(decoration)paintHeadpiece()
}
