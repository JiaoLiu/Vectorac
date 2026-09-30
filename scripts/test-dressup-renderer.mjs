import test from 'node:test'
import assert from 'node:assert/strict'
import {createModelRenderer} from '../.vuepress/components/dressup/renderer.mjs'
import {DEFAULT_PARTS} from '../.vuepress/components/dressup/parts.mjs'
import {layerSources} from '../.vuepress/components/dressup/compositor.mjs'
function fixture(){
 const pending=new Map(),draws=[]
 class Img{constructor(){this.naturalWidth=512;this.naturalHeight=1024}set src(src){this.url=src;pending.set(src,this)}decode(){return this.decoding||Promise.resolve()}}
 const canvas={width:512,height:1024,dataset:{},getContext:()=>({clearRect(){},drawImage(img){draws.push(img.url)}})}
 return {renderer:createModelRenderer(canvas,Img),pending,draws,canvas}
}
test('decode must complete before swapping visible bitmap',async()=>{
 const f=fixture();const initial=f.renderer.show('old');f.pending.get('old').onload();await initial
 let resolve;const next=f.renderer.show('new');const img=f.pending.get('new');img.decoding=new Promise(r=>resolve=r);img.onload()
 assert.deepEqual(f.draws,['old']);resolve();assert.equal(await next,'ready');assert.deepEqual(f.draws,['old','new'])
})
test('late decode cannot overwrite newer request, rotation repaints last good image',async()=>{
 const f=fixture();let release;const a=f.renderer.show('a');f.pending.get('a').decoding=new Promise(r=>release=r);f.pending.get('a').onload()
 const b=f.renderer.show('b');f.pending.get('b').onload();await b;release();assert.equal(await a,'stale');f.renderer.repaint();assert.deepEqual(f.draws,['b','b'])
})
test('failure retains old pixels and retries; destroy ignores callbacks',async()=>{
 const f=fixture();const a=f.renderer.show('a');f.pending.get('a').onload();await a
 const b=f.renderer.show('b');f.pending.get('b').onerror();assert.equal(await b,'error');assert.deepEqual(f.draws,['a'])
 const retry=f.renderer.show('b');f.pending.get('b').onload();assert.equal(await retry,'ready')
 const c=f.renderer.show('c');f.renderer.destroy();f.pending.get('c').onload();assert.equal(await c,'stale');assert.deepEqual(f.draws,['a','b'])
})
test('layer failure retains entire previous model; complete layers swap once; stale layering cannot overwrite an outfit',async()=>{
 const originalDocument=globalThis.document
 const ctx=new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)})
 globalThis.document={createElement:()=>({url:'assembled',getContext:()=>ctx})}
 try{
  const f=fixture(),old=f.renderer.show('old');f.pending.get('old').onload();await old
  const sources=layerSources(DEFAULT_PARTS),bad=f.renderer.showLayers(DEFAULT_PARTS)
  for(const src of sources)if(src.includes('hair-0'))f.pending.get(src).onerror();else f.pending.get(src).onload()
  assert.equal(await bad,'error');assert.deepEqual(f.draws,['old'])
  const complete=f.renderer.showLayers(DEFAULT_PARTS);f.pending.get(sources.find(x=>x.includes('hair-0'))).onload()
  assert.equal(await complete,'ready');assert.deepEqual(f.draws,['old','assembled'])
  const changed={...DEFAULT_PARTS,hair:'hair-1'},late=f.renderer.showLayers(changed);let release
  const hair=f.pending.get('/img/games/dressup/layers/v4/hair-1.webp');hair.decoding=new Promise(r=>release=r);hair.onload()
  const outfit=f.renderer.show('new-outfit');f.pending.get('new-outfit').onload();await outfit;release()
  assert.equal(await late,'stale');assert.deepEqual(f.draws,['old','assembled','new-outfit'])
 }finally{if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument}
})
