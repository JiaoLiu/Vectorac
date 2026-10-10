import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile}from 'node:fs/promises'
import {cardTargetCandidates,selectingTargets,replaceTarget,boundedTargets}from '../.private/fengshen/target-selection.mjs'
import {arenaGeometry,centerCardHeight,poolCardHeight}from '../.private/fengshen/arena-layout.mjs'
import {equipmentSlot}from '../.private/fengshen/presentation.mjs'
test('Sha, snatch and dismantle retain every candidate after an unconfirmed single target',()=>{
 for(const as of ['sha','snatch','dismantle']){const actions=[1,2,3].map(t=>({as,targets:[t]}));assert.deepEqual(cardTargetCandidates(actions,as,[1]),[1,2,3]);assert.deepEqual(replaceTarget([1],3),[3]);assert.deepEqual(replaceTarget([3],3),[])}
})
test('ordered Collateral narrows only the second victim, including self',()=>{
 const actions=[{as:'collateral',targets:[1,0]},{as:'collateral',targets:[1,3]},{as:'collateral',targets:[2,4]}];assert.deepEqual(cardTargetCandidates(actions,'collateral'),[1,2]);assert.deepEqual(cardTargetCandidates(actions,'collateral',[1]),[0,3]);assert.deepEqual(cardTargetCandidates(actions,'collateral',[1,3]),[0,3])
 assert.deepEqual(boundedTargets([1,2,3],4,3),[2,3,4]);assert.deepEqual(boundedTargets([1,2],2,2),[1])
})
test('card/skill targeting consumes portrait detail taps, idle portrait taps still show details',()=>{
 const v={current:0,phase:'play'},u={selected:['c1'],skill:null};assert.equal(selectingTargets(u,v),true);assert.equal(selectingTargets({...u,selected:[]},v),false);assert.equal(selectingTargets({...u,selected:[],skill:'rende'},v),true);assert.equal(selectingTargets(u,{...v,current:1}),false);assert.equal(selectingTargets(u,{pending:{kind:'liuli',actor:0}}),true)
})
test('shared card, caption and response fit below the top portraits without scaling them',()=>{
 for(const [width,height]of [[568,320],[667,375],[844,390],[932,430],[1024,768]])for(const seats of [5,8]){const g=arenaGeometry({width:width-118,height,seats}),h=centerCardHeight(g.center);assert.ok(g.center.top>=g.heroHeight);assert.ok(h+28<=g.center.bottom-g.center.top+.01);assert.ok(g.center.bottom<=height-g.dockHeight+28);assert.ok(g.heroHeight>=56)}
 const h=poolCardHeight({width:624,height:160,count:8});assert.ok(h>=96);assert.ok(h/1.44*8+56+4<=624.01);assert.equal(poolCardHeight({width:460,height:117,count:8}),117)
})
test('equipment slots are pictorial and accessible, name font does not use partial calligraphy',async()=>{
 assert.ok(equipmentSlot('weapon').includes('<svg'));assert.ok(equipmentSlot('armor').includes('<svg'));const css=await readFile(new URL('../.private/fengshen/arena-table.css',import.meta.url),'utf8');assert.ok(css.includes('fs-equip>span'));assert.ok(css.includes('font-family:"PingFang SC"'));assert.ok(css.includes('.fs-pool-choice>.fs-center-card-list{display:flex;flex:none'));assert.ok(css.includes('height:var(--pool-card-height)'))
})
