// Keep one persistent bitmap: changing URLs or viewport size never clears it.
import {layerSources,paintComposite} from './compositor.mjs'
export function createModelRenderer(canvas,ImageClass=Image,options={}){
  let generation=0,disposed=false,last=null
  // Full-body placement stays in 512x1024 logical coordinates. Native backing
  // pixels increase for makeup close-ups; cropped HD heads avoid huge textures.
  const scale=options.bitmapScale!==undefined?options.bitmapScale:canvas.ownerDocument&&typeof window!=='undefined'?Math.min(3,Math.max(2,window.devicePixelRatio||1)):1
  if(scale>1){canvas.width=512*scale;canvas.height=1024*scale;canvas.dataset.scale=String(scale)}
  const cache=new Map()
  function repaint(){
    if(!last||disposed)return
    const ctx=canvas.getContext('2d')
    ctx.clearRect(0,0,canvas.width,canvas.height)
    ctx.drawImage(last,0,0,canvas.width,canvas.height)
  }
  function load(src){
    if(cache.has(src))return cache.get(src)
    const promise=new Promise((resolve,reject)=>{
      const img=new ImageClass()
      img.onload=async()=>{
        try{if(img.decode)await img.decode();if(!img.naturalWidth||!img.naturalHeight)throw new Error('empty image');resolve(img)}catch(e){reject(e)}
      }
      img.onerror=()=>reject(new Error('image load failed'));img.src=src
    }).catch(e=>{cache.delete(src);throw e})
    cache.set(src,promise)
    if(cache.size>24)cache.delete(cache.keys().next().value)
    return promise
  }
  if(canvas.addEventListener)canvas.addEventListener('contextrestored',repaint)
  return {
    async show(src){
      const token=++generation
      try{const img=await load(src);if(disposed||token!==generation)return 'stale'
        // Decode and latest-request validation complete before touching the visible bitmap.
        last=img;repaint();canvas.dataset.src=src;return 'ready'
      }catch(e){if(disposed||token!==generation)return 'stale';return 'error'}
    },
    async showLayers(parts){
      const token=++generation,srcs=layerSources(parts),key='fine:'+JSON.stringify(parts)
      try{const decoded=await Promise.all(srcs.map(load));if(disposed||token!==generation)return 'stale'
        const frame=document.createElement('canvas');frame.width=512*scale;frame.height=1024*scale
        const ctx=frame.getContext('2d');if(scale>1)ctx.setTransform(scale,0,0,scale,0,0)
        paintComposite(ctx,new Map(srcs.map((src,i)=>[src,decoded[i]])),parts)
        if(disposed||token!==generation)return 'stale';last=frame;repaint();canvas.dataset.src=key;return 'ready'
      }catch(e){if(disposed||token!==generation)return 'stale';return 'error'}
    },
    repaint,
    destroy(){disposed=true;generation++;cache.clear();last=null;if(canvas.removeEventListener)canvas.removeEventListener('contextrestored',repaint)}
  }
}
