<template>
  <div class="fw-fine">
    <div class="fw-section-title"><h2>每一个细节，都由你搭配</h2><p>上衣、下装与妆饰分别选择；点击可试穿，解锁后永久拥有。</p></div>
    <div class="fw-part-groups" aria-label="装扮分组"><button v-for="g in groups" :key="g.id" :aria-pressed="group===g.id" @click="chooseGroup(g.id)">{{g.name}}</button></div>
    <div class="fw-part-categories" aria-label="精细装扮分类"><button v-for="c in categories" :key="c.id" :aria-pressed="category===c.id" @click="category=c.id">{{c.name}}</button></div>
    <p v-if="group==='makeup'" class="fw-makeup-summary">当前脸型：{{faceName}} · {{currentBeauty?'整套妆容：'+currentBeauty.name:'妆容：单项搭配'}}</p>
    <section v-if="category==='beauty'" class="fw-beauty-presets" aria-label="完整妆容套组"><h3>整套妆容</h3><p>一套包含脸型、眼睛、眉毛和唇色。不同套组可以共用脸型；单项修改请切换上方分类。</p><div class="fw-beauty-choices"><button v-for="p in presets" :key="p.id" :aria-label="'换上'+p.name+'妆容'" :aria-pressed="matchesBeauty(selected,p)" @click="$emit('beauty',p.id)"><img :src="beautyPreview(p)" :alt="p.name" loading="lazy" draggable="false"><strong>{{p.name}}<span class="fw-beauty-kind">套组</span></strong><small>{{p.detail}}</small><small v-if="matchesBeauty(selected,p)" class="fw-beauty-active">整套已用</small></button></div></section>
    <div v-else class="fw-part-grid"><article v-for="p in choices" :key="p.id" :class="{selected:selected[category]===p.id}">
      <button class="fw-part-preview" :aria-label="'试戴'+p.name" @click="$emit('choose',p.id)">
        <PartDesign v-if="partThumbnail(p)" :part="p"/>
        <span v-else-if="p.category==='lip'" class="fw-lip-swatch" :style="{background:lipColors[p.index]}"></span>
        <span v-else-if="p.category==='brows'" class="fw-brow-preview" :class="'brow-'+p.index"></span>
        <span v-else class="fw-part-none">留白</span>
      </button>
      <strong>{{p.name}}</strong><small>{{p.tag||'卸下这一件'}}</small>
      <button v-if="!owned.includes(p.id)" @click="$emit('buy',p.id)">✦ {{p.price}} 解锁</button>
      <button v-else @click="$emit('choose',p.id)">{{selected[category]===p.id?(category==='face'?'当前脸型':'已选用'):'换上'}}</button>
    </article></div>
  </div>
</template>
<script>
import {CATEGORIES,PART_GROUPS,PARTS,partThumbnail} from './parts.mjs'
import PartDesign from './PartDesign.vue'
import {BEAUTY_PRESETS,beautyPreview,matchesBeauty} from './beauty.mjs'
export default {components:{PartDesign},props:['owned','selected'],data:()=>({category:'top',group:'clothing',groups:PART_GROUPS,presets:BEAUTY_PRESETS,lipColors:['#e8b5a3','#ad6375','#e5876d','#8d3e59','#d89aaf']}),computed:{categories(){const g=PART_GROUPS.find(g=>g.id===this.group),items=CATEGORIES.filter(c=>g.categories.includes(c.id));return this.group==='makeup'?[{id:'beauty',name:'整套妆容'},...items]:items},choices(){return PARTS.filter(p=>p.category===this.category)},faceName(){const p=PARTS.find(p=>p.id===this.selected.face);return p?p.name:''},currentBeauty(){return BEAUTY_PRESETS.find(p=>matchesBeauty(this.selected,p))}},methods:{partThumbnail,beautyPreview,matchesBeauty,chooseGroup(id){const g=PART_GROUPS.find(g=>g.id===id);if(!g)return;this.group=id;if(!g.categories.includes(this.category)&&!(id==='makeup'&&this.category==='beauty'))this.category=id==='makeup'?'beauty':g.categories[0]}}}
</script>
<style>
.fw-beauty-presets{margin-bottom:18px;padding:12px 0;border-bottom:1px solid #e8ded8}.fw-beauty-presets h3{font:500 16px serif}.fw-beauty-presets>p{font-size:11px;color:#927b82}.fw-beauty-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.fw-beauty-choices button{min-width:0;overflow:hidden;padding:0 0 9px!important;text-align:center;background:#f4ede5!important}.fw-beauty-choices img{display:block;width:100%;aspect-ratio:1;object-fit:contain;pointer-events:none}.fw-beauty-choices strong,.fw-beauty-choices small{display:block;margin:5px 3px;font-size:12px}.fw-beauty-choices small{font-size:10px;color:#927b82}.fw-beauty-choices [aria-pressed=true]{border-color:#a9637c;box-shadow:0 0 0 1px #a9637c}
.fw-makeup-summary{font-size:11px;color:#80636d}.fw-beauty-kind{display:inline-block;margin-left:5px;padding:2px 4px;border:1px solid #d5b9c3;border-radius:4px;font-size:9px;font-weight:400}.fw-beauty-choices .fw-beauty-active{color:#985774}
.fw-part-categories{display:flex;overflow:auto;gap:5px;margin-bottom:16px;padding:3px 0 8px;scrollbar-width:thin}
.fw-part-groups{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:10px 0 6px}.fw-part-groups button{min-width:0;min-height:34px;padding:6px 3px;font-size:12px}.fw-part-groups [aria-pressed=true]{background:#eee2d9;color:#6f4c59;border-color:#cfb5bb}
.fw-part-categories button{white-space:nowrap;flex:none;min-height:40px;padding:7px 12px}.fw-part-categories [aria-pressed=true]{background:#986177!important;color:#fff!important}
.fw-part-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.fw-part-grid article{min-width:0;background:#fffdfa;border:1px solid #e8ded8;border-radius:14px;overflow:hidden;padding-bottom:10px;text-align:center}.fw-part-grid article.selected{border-color:#a9637c;box-shadow:0 0 0 1px #a9637c}
.fw-part-grid .fw-part-preview{display:flex;justify-content:center;align-items:center;width:100%;height:150px;min-width:0;padding:0;border:0;border-radius:0;background:#f4ede5;overflow:hidden}.fw-part-preview img{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;pointer-events:none}
.fw-part-grid strong,.fw-part-grid small{display:block;margin:8px 5px 0;font-size:12px}.fw-part-grid small{color:#a08b8b;font-size:10px;margin:4px 0 8px}.fw-part-grid article>button:last-child{font-size:11px;min-height:36px;padding:7px 12px}
.fw-lip-swatch{display:block;width:56px;height:23px;border-radius:60% 60% 50% 50%;box-shadow:inset 0 -5px 6px #0002,inset 0 4px 4px #ffffff66}.fw-brow-preview{width:62px;height:15px;border-top:6px solid #705045;border-radius:75% 75% 0 0;transform:rotate(-5deg)}.fw-brow-preview.brow-1{border-radius:4px;transform:none;height:6px}.fw-brow-preview.brow-2{border-radius:90% 90% 0 0;transform:rotate(-12deg)}.fw-brow-preview.brow-3{border-top-width:9px;transform:rotate(-9deg)}.fw-part-none{color:#ba9e91;font-size:22px;font-family:serif;letter-spacing:5px}
.fw-part-preview{position:relative}.fw-design-canvas{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;pointer-events:none}.fw-part-preview img.fw-face-thumb{position:absolute;width:500px;height:1000px;max-width:none;max-height:none;left:50%;top:-32px;transform:translateX(-50%)}
@media(max-height:550px) and (orientation:landscape){.fw-part-grid .fw-part-preview{height:120px}.fw-part-categories{margin-bottom:8px}}
</style>
