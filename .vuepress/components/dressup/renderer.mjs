// Keep one persistent bitmap: changing URLs or viewport size never clears it.
export function createModelRenderer(canvas,ImageClass=Image){
  let generation=0,disposed=false,last=null
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
    if(cache.size>8)cache.delete(cache.keys().next().value)
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
    repaint,
    destroy(){disposed=true;generation++;cache.clear();last=null;if(canvas.removeEventListener)canvas.removeEventListener('contextrestored',repaint)}
  }
}
