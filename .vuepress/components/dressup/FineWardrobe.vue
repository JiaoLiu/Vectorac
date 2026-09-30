<template>
  <div class="fw-fine">
    <div class="fw-section-title"><h2>每一个细节，都由你搭配</h2><p>上衣、下装与妆饰分别选择；点击可试穿，解锁后永久拥有。</p></div>
    <div class="fw-part-categories" aria-label="精细装扮分类"><button v-for="c in categories" :key="c.id" :aria-pressed="category===c.id" @click="category=c.id">{{c.name}}</button></div>
    <div class="fw-part-grid"><article v-for="p in choices" :key="p.id" :class="{selected:selected[category]===p.id}">
      <button class="fw-part-preview" :aria-label="'试戴'+p.name" @click="$emit('choose',p.id)">
        <img v-if="partAsset(p)" :class="{'fw-face-thumb':p.category==='face'}" :src="partAsset(p)" :alt="p.name" draggable="false">
        <span v-else-if="p.category==='lip'" class="fw-lip-swatch" :style="{background:lipColors[p.index]}"></span>
        <span v-else-if="p.category==='brows'" class="fw-brow-preview" :class="'brow-'+p.index"></span>
        <span v-else class="fw-part-none">留白</span>
      </button>
      <strong>{{p.name}}</strong><small>{{p.tag||'卸下这一件'}}</small>
      <button v-if="!owned.includes(p.id)" @click="$emit('buy',p.id)">✦ {{p.price}} 解锁</button>
      <button v-else @click="$emit('choose',p.id)">{{selected[category]===p.id?'已选用':'换上'}}</button>
    </article></div>
  </div>
</template>
<script>
import {CATEGORIES,PARTS,partAsset} from './parts.mjs'
export default {props:['owned','selected'],data:()=>({category:'top',categories:CATEGORIES,lipColors:['#e8b5a3','#ad6375','#e5876d','#8d3e59','#d89aaf']}),computed:{choices(){return PARTS.filter(p=>p.category===this.category)}},methods:{partAsset}}
</script>
<style>
.fw-part-categories{display:flex;overflow:auto;gap:5px;margin-bottom:16px;padding:3px 0 8px;scrollbar-width:thin}
.fw-part-categories button{white-space:nowrap;flex:none;min-height:40px;padding:7px 12px}.fw-part-categories [aria-pressed=true]{background:#986177!important;color:#fff!important}
.fw-part-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fw-part-grid article{min-width:0;background:#fffdfa;border:1px solid #e8ded8;border-radius:14px;overflow:hidden;padding-bottom:10px;text-align:center}.fw-part-grid article.selected{border-color:#a9637c;box-shadow:0 0 0 1px #a9637c}
.fw-part-grid .fw-part-preview{display:flex;justify-content:center;align-items:center;width:100%;height:150px;min-width:0;padding:8px;border:0;border-radius:0;background:radial-gradient(ellipse,#fff,#f1e7df);overflow:hidden}.fw-part-preview img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;pointer-events:none}
.fw-part-grid strong,.fw-part-grid small{display:block;margin:8px 5px 0;font-size:12px}.fw-part-grid small{color:#a08b8b;font-size:10px;margin:4px 0 8px}.fw-part-grid article>button:last-child{font-size:11px;min-height:36px;padding:7px 12px}
.fw-lip-swatch{display:block;width:56px;height:23px;border-radius:60% 60% 50% 50%;box-shadow:inset 0 -5px 6px #0002,inset 0 4px 4px #ffffff66}.fw-brow-preview{width:62px;height:15px;border-top:6px solid #705045;border-radius:75% 75% 0 0;transform:rotate(-5deg)}.fw-brow-preview.brow-1{border-radius:4px;transform:none;height:6px}.fw-brow-preview.brow-2{border-radius:90% 90% 0 0;transform:rotate(-12deg)}.fw-brow-preview.brow-3{border-top-width:9px;transform:rotate(-9deg)}.fw-part-none{color:#ba9e91;font-size:22px;font-family:serif;letter-spacing:5px}
.fw-part-preview{position:relative}.fw-part-preview img.fw-face-thumb{position:absolute;width:500px;height:1000px;max-width:none;max-height:none;left:50%;top:-32px;transform:translateX(-50%)}
@media(max-height:550px) and (orientation:landscape){.fw-part-grid .fw-part-preview{height:120px}.fw-part-categories{margin-bottom:8px}}
</style>
