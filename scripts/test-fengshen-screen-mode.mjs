import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile}from 'node:fs/promises'
import {mediaMatches,logicalScreen,bindVirtualMedia,localPoint}from '../.private/fengshen/screen-mode.mjs'
import {bindGameViewport}from '../.private/fengshen/viewport.mjs'
const events=()=>({handlers:new Map(),addEventListener(k,f){this.handlers.set(k,f)},removeEventListener(k){this.handlers.delete(k)}})
const classes=()=>({set:new Set(),contains(k){return this.set.has(k)},toggle(k,on){on?this.set.add(k):this.set.delete(k)},remove(k){this.set.delete(k)}})
function fake(){
 const props={},root={style:{setProperty:(k,v)=>props[k]=v},classList:classes(),dataset:{}},children=[],body={classList:classes(),appendChild(e){e.parentNode=this;children.push(e)}},doc=Object.assign(events(),{hidden:false,styleSheets:[],documentElement:{classList:classes()},body,createElement(){return {style:{},setAttribute(){},remove(){children.splice(children.indexOf(this),1);this.parentNode=null}}}}),vv=Object.assign(events(),{width:390,height:844,scale:1,offsetTop:0,offsetLeft:0}),win=Object.assign(events(),{innerWidth:390,innerHeight:844,visualViewport:vv,requestAnimationFrame:f=>(f(),1),cancelAnimationFrame(){},setTimeout:f=>(f(),1),clearTimeout(){},scrollTo(){}})
 return {props,root,doc,win,vv,children}
}
test('default touch portrait becomes a virtual landscape only after entering the game',()=>{
 assert.deepEqual(logicalScreen({width:390,height:844,mobile:true,immersive:true,rotated:false}),{width:844,height:390,force:true})
 assert.equal(logicalScreen({width:390,height:844,mobile:true,immersive:false,rotated:false}).force,false)
 assert.equal(logicalScreen({width:390,height:844,mobile:false,immersive:true,rotated:false}).force,false)
 assert.equal(logicalScreen({width:390,height:844,mobile:true,immersive:true,rotated:true}).force,false)
})
test('virtual media evaluates every AND clause and preserves unknown accessibility conditions',()=>{
 assert.equal(mediaMatches('(max-height:559px) and (orientation:landscape)',844,390),true);assert.equal(mediaMatches('(max-width:699px) and (orientation:portrait)',844,390),false);assert.equal(mediaMatches('(min-height:381px) and (max-height:559px) and (orientation:landscape)',844,320),false);assert.equal(mediaMatches('(prefers-reduced-motion:reduce)',844,390),null)
 const a={media:{mediaText:'(orientation:portrait)'}},b={media:{mediaText:'(prefers-reduced-motion:reduce)'}},m=bindVirtualMedia({styleSheets:[{cssRules:[a,b]}]});m.apply(true,844,390);assert.equal(a.media.mediaText,'not all');assert.equal(b.media.mediaText,'(prefers-reduced-motion:reduce)');m.restore();assert.equal(a.media.mediaText,'(orientation:portrait)')
})
test('scroll spacer is idempotent, follows physical height, removed on exit and recreated on reentry',()=>{
 const f=fake(),v=bindGameViewport(f.root,()=>{},{win:f.win,doc:f.doc,mobile:()=>true});v.setImmersive(true);v.setImmersive(true);assert.equal(f.children.length,1);assert.equal(f.children[0].style.height,'964px');assert.equal(f.props['--fs-width'],'844px');assert.equal(f.props['--fs-height'],'390px');assert.equal(f.props['--fs-rotation'],'90deg');f.win.innerHeight=900;v.update();assert.equal(f.children[0].style.height,'1020px');v.setImmersive(false);assert.equal(f.children.length,0);assert.equal(f.doc.body.classList.contains('fs-immersive-scroll'),false);v.setImmersive(true);assert.equal(f.children.length,1);v.destroy();assert.equal(f.children.length,0);assert.equal(f.win.handlers.size,0)
})
test('real orientation releases virtual rotation; native pinch retains actual magnification without counter-scale',()=>{
 const f=fake(),v=bindGameViewport(f.root,()=>{},{win:f.win,doc:f.doc,mobile:()=>true});v.setImmersive(true);f.win.innerWidth=844;f.win.innerHeight=390;Object.assign(f.vv,{width:844,height:390});f.win.handlers.get('orientationchange')();assert.equal(f.props['--fs-rotation'],'0deg');f.win.innerWidth=390;f.win.innerHeight=844;Object.assign(f.vv,{width:390,height:844});f.win.handlers.get('orientationchange')();assert.equal(f.props['--fs-rotation'],'0deg');Object.assign(f.vv,{width:195,height:422,scale:2,offsetLeft:80});v.update();assert.equal(f.props['--fs-width'],'390px');assert.equal(f.props['--fs-height'],'844px');assert.equal(f.props['--fs-scale'],1);assert.equal(f.props['--fs-left'],'0px');v.destroy()
})
test('inverse coordinate mapping keeps beams, transfers and drag positions correct after 90-degree rotation',async()=>{
 const root={clientWidth:844,clientHeight:390,classList:{contains:()=>true},getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})};assert.deepEqual(localPoint(root,290,200),{x:200,y:100});root.classList.contains=()=>false;root.clientWidth=390;root.clientHeight=844;assert.deepEqual(localPoint(root,290,200),{x:290,y:200})
 const app=await readFile(new URL('../.private/fengshen/app.js',import.meta.url),'utf8');assert.ok(app.includes('`${ap.x-27}px`'));assert.ok(app.includes('`${tp.y-38}px`'))
})
test('native zoom is not blocked by gesture handlers or scroll-area touch-action',async()=>{
 const v=await readFile(new URL('../.private/fengshen/viewport.mjs',import.meta.url),'utf8'),css=await readFile(new URL('../.private/fengshen/arena-table.css',import.meta.url),'utf8');assert.ok(!v.includes('gesturestart'));assert.ok(!v.includes('preventDefault'));assert.ok(css.includes('touch-action:pan-x pinch-zoom'));assert.ok(css.includes('touch-action:pan-y pinch-zoom'));assert.ok(css.includes('touch-action:pinch-zoom;cursor:grab'))
})
