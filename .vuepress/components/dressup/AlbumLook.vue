<template><canvas ref="canvas" width="512" height="1024" class="fw-album-model" role="img" aria-label="收藏的穿搭"></canvas></template>
<script>
import {createModelRenderer} from './renderer.mjs'
import {asset} from './engine.mjs'
export default {props:['look'],mounted(){this._renderer=createModelRenderer(this.$refs.canvas,undefined,{bitmapScale:1});this.paint()},watch:{look:{deep:true,handler(){this.paint()}}},beforeDestroy(){if(this._renderer)this._renderer.destroy()},methods:{paint(){if(this._renderer){if(this.look.mode==='fine')this._renderer.showLayers(this.look.parts);else this._renderer.show(asset(this.look.outfit,this.look.pose))}}}}
</script>
<style>.fw-album-model{display:block;width:100%;height:200px;object-fit:contain;pointer-events:none}</style>
