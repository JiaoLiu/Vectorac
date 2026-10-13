<template>
 <canvas v-if="part.material" ref="canvas" class="fw-design-canvas" role="img" :aria-label="part.name" :data-source="source"></canvas>
 <img v-else :src="source" :alt="part.name" draggable="false" loading="lazy">
</template>
<script>
import {partThumbnail} from './parts.mjs'
import {materialImage} from './materials.mjs'
export default {
 props:['part'],computed:{source(){return partThumbnail(this.part)}},
 mounted(){this.paint()},watch:{part(){this.paint()}},beforeDestroy(){this._request=(this._request||0)+1},
 methods:{async paint(){
  if(!this.part.material)return
  const token=this._request=(this._request||0)+1,p=this.part,image=new Image()
  try{await new Promise((ok,bad)=>{image.onload=ok;image.onerror=bad;image.src=partThumbnail(p)})
   if(image.decode)await image.decode()
   if(token!==this._request||!this.$refs.canvas)return
   const c=this.$refs.canvas;c.width=image.naturalWidth;c.height=image.naturalHeight
   c.getContext('2d').drawImage(materialImage(image,p,true),0,0);c.dataset.ready='true'
  }catch{if(token===this._request&&this.$refs.canvas)this.$refs.canvas.dataset.ready='error'}
 }}
}
</script>
