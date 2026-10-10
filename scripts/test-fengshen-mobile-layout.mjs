import test from 'node:test'
import assert from 'node:assert/strict'
import {arenaGeometry,handScrollForCard} from '../.private/fengshen/arena-layout.mjs'
import {handLayout,HAND_LIFT,HAND_TOP,HAND_BOTTOM} from '../.private/fengshen/hand.mjs'
import {viewportFrame,bindGameViewport} from '../.private/fengshen/viewport.mjs'
import {moveStarCard} from '../.private/fengshen/star-drag.mjs'
import {readFile} from 'node:fs/promises'
import {renderBattle,renderCenter} from '../.private/fengshen/table.mjs'
import {createGame,playerView} from '../.private/fengshen/engine.mjs'
const overlap=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)+.5&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)+.5
test('all seat counts fit inside safe geometry with no overlapping opponents on phone and desktop',()=>{
 for(const [width,height]of [[568,320],[667,375],[844,390],[932,430],[1024,768],[1280,900],[320,568],[390,844],[430,932]])for(const seats of [2,4,5,6,8]){
  const landscape=width>height,g=arenaGeometry({width:width-(landscape?118:0),height,seats,safeTop:landscape?0:47,safeBottom:landscape?21:34}),p=Object.values(g.positions)
  for(const r of p){assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=g.width+.01&&r.y+r.height<=height+.01,JSON.stringify({width,height,seats,r}))}
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)assert.ok(!overlap(p[i],p[j]),JSON.stringify({width,height,seats,a:p[i],b:p[j]}))
  if(landscape&&seats>2){const own={x:0,y:height-21-g.heroHeight,width:g.heroWidth,height:g.heroHeight};assert.ok(!overlap(own,g.positions[1]));assert.ok(g.center.bottom>g.center.top)}
 }
})
test('large iPhone landscape keeps heroes large and top row compact, not percentage-spread',()=>{const g=arenaGeometry({width:932-118,height:430,seats:8});assert.ok(g.heroWidth>100);for(let seat=2;seat<6;seat++)assert.ok(Math.abs(g.positions[seat+1].x-g.positions[seat].x-g.heroWidth-g.gap)<.001);assert.equal(g.positions[2].y,0)})
test('pinch frame stays in unzoomed coordinates, recovers offsets and handles zero/inactive samples',()=>{
 const a=viewportFrame({innerWidth:932,innerHeight:430,viewport:{width:466,height:215,scale:2,offsetLeft:110,offsetTop:20}});assert.deepEqual(a,{width:932,height:430,scale:2,left:110,top:20})
 assert.deepEqual(viewportFrame({innerWidth:430,innerHeight:932,viewport:{width:430,height:932,scale:1}}),{width:430,height:932,scale:1,left:0,top:0})
 assert.equal(viewportFrame({innerWidth:844,innerHeight:390,viewport:{width:0,height:0,scale:0}}).height,390)
})
test('viewport binding remeasures on pageshow/orientation/visibility and releases all listeners',()=>{
 const events=()=>({handlers:new Map(),addEventListener(k,f){this.handlers.set(k,f)},removeEventListener(k){this.handlers.delete(k)}}),vv=Object.assign(events(),{width:932,height:430,scale:1}),win=Object.assign(events(),{innerWidth:932,innerHeight:430,visualViewport:vv,requestAnimationFrame:f=>(f(),1),cancelAnimationFrame(){},setTimeout:f=>(f(),1),clearTimeout(){}}),doc=Object.assign(events(),{hidden:false}),props={},root=Object.assign(events(),{style:{setProperty:(k,v)=>props[k]=v},classList:{contains:()=>true}});let layouts=0
 const binding=bindGameViewport(root,()=>layouts++,{win,doc});assert.equal(props['--fs-height'],'430px');doc.hidden=true;vv.height=1;binding.update();assert.equal(props['--fs-height'],'430px');doc.hidden=false;vv.height=215;vv.width=466;vv.scale=2;doc.handlers.get('visibilitychange')();assert.equal(props['--fs-scale'],1);assert.equal(props['--fs-height'],'430px');vv.scale=1;vv.width=430;vv.height=932;win.innerWidth=430;win.innerHeight=932;win.handlers.get('orientationchange')();assert.equal(props['--fs-width'],'430px');assert.equal(props['--fs-height'],'932px');assert.ok(layouts>=3);binding.destroy();assert.equal(win.handlers.size,0);assert.equal(doc.handlers.size,0);assert.equal(vv.handlers.size,0)
})
test('star drag supports arbitrary in-row reorder, cross-row insertion, preserves exactly all IDs and rejects invalid moves',()=>{
 const s={id:8,top:['a','b','c','d','e'],bottom:[]},a=moveStarCard(s,'e','top','b');assert.deepEqual(a.top,['a','e','b','c','d']);assert.deepEqual(s.top,['a','b','c','d','e']);const b=moveStarCard(a,'c','bottom'),c=moveStarCard(b,'a','bottom','c');assert.deepEqual(c.bottom,['a','c']);assert.deepEqual(c.top,['e','b','d']);assert.deepEqual(c.top.concat(c.bottom).sort(),s.top.slice().sort());assert.equal(moveStarCard(s,'bad','top'),s);assert.equal(moveStarCard(s,'a','bad'),s)
})
test('timer belongs to hand heading, not portrait; star panel owns visible confirmation controls',()=>{
 const state=createGame({heroId:'yangjian',role:'lord',seed:7}),ui={state,selected:[],targets:[],clock:{key:'play',seconds:60},hints:true,header:()=>'',targetable:()=>[],matching:()=>[],currentAs:()=>null,equipment:()=>'',skills:()=>'',won:()=>false,pendingText:()=>''}
 const html=renderBattle(ui),hand=html.slice(html.indexOf('class="fs-hand-heading"'));assert.ok(hand.includes('aria-label="思考倒计时"'));assert.ok(!html.slice(0,html.indexOf('class="fs-hand-heading"')).includes('aria-label="思考倒计时"'))
 const v=playerView(state,0);v.pending={kind:'guanxing',actor:0,id:3};v.legal=[{type:'arrange',pool:state.players[0].hand.slice(0,3)},{type:'pass'}];const center=renderCenter(ui,v);assert.ok(center.includes('fs-star-choice'));assert.ok(center.includes('data-star-zone="top"'));assert.ok(center.includes('data-star-zone="bottom"'));assert.ok(center.includes('确认牌序'));assert.ok(center.includes('原序放回牌顶'))
})
test('legacy take-grid rules never shrink or hide Star panel; hand reveal never scrolls the document',async()=>{
 const css=await readFile(new URL('../.private/fengshen/table.css',import.meta.url),'utf8'),app=await readFile(new URL('../.private/fengshen/app.js',import.meta.url),'utf8'),hand=await readFile(new URL('../.private/fengshen/hand.mjs',import.meta.url),'utf8');assert.ok(!css.includes('.fs-center-choice:not(.fs-counter-choice)'));assert.ok(css.includes('.fs-take-choice>footer'));assert.ok(!app.includes('scrollIntoView'));assert.ok(!app.includes('syncScrollSpacer'));assert.ok(!hand.includes('visualViewport?.height'))
})
test('1 to 108 cards fit the actual vertical budget including raised selection and badge clearance',()=>{
 for(const availableHeight of [70,100,130,180])for(const count of [1,6,30,60,108])for(const landscape of [true,false]){
  const l=handLayout({count,width:360,height:landscape?390:844,landscape,availableHeight});assert.ok(l.cardHeight+HAND_TOP+HAND_BOTTOM<=availableHeight+.01);assert.ok(HAND_TOP-HAND_LIFT>=9);assert.ok(l.step>=l.cardWidth*.84);if(count>=30)assert.ok(l.scroll);assert.equal(l.span,count?l.cardWidth+l.step*(count-1):0)
 }
})
test('revealing selection uses full card face width, including the last card and returns to the first',()=>{
 assert.equal(handScrollForCard({scrollLeft:0,viewportWidth:300,cardStart:270,cardWidth:80}),52)
 assert.equal(handScrollForCard({scrollLeft:52,viewportWidth:300,cardStart:0,cardWidth:80}),0)
 assert.equal(handScrollForCard({scrollLeft:52,viewportWidth:300,cardStart:80,cardWidth:80}),52)
 const l=handLayout({count:108,width:300,height:390,landscape:true,availableHeight:150});assert.ok(handScrollForCard({scrollLeft:0,viewportWidth:300,cardStart:l.step*107,cardWidth:l.cardWidth})>0)
})
