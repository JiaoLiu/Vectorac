import test from 'node:test'
import assert from 'node:assert/strict'
import {riverLayout} from '../.vuepress/components/mahjong/table-layout.mjs'
const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1e-6&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1e-6
test('rectangular rivers stay within separate regions, including rotated footprints',()=>{
 for(const [width,height] of [[130,270],[240,480],[330,110],[640,200],[800,500]])for(const counts of [[0,0,0,0],[12,13,14,15],[30,18,24,12],[36,36,36,36]]){
  const snapshot=counts.slice(),layout=riverLayout(width,height,counts),all=layout.flat()
  assert.deepEqual(counts,snapshot)
  layout.forEach((tiles,s)=>assert.equal(tiles.length,counts[s]))
  for(let i=0;i<all.length;i++){
   const p=all[i];assert.ok(p.w>0&&p.h>0);assert.ok(p.x>=-1e-6&&p.y>=-1e-6&&p.x+p.w<=width+1e-6&&p.y+p.h<=height+1e-6)
   for(let j=i+1;j<all.length;j++)assert.ok(!overlap(p,all[j]))
  }
  for(const s of [1,3])assert.ok(layout[s].every(p=>p.w>p.h),'side discard occupies its rotated width')
 }
})
test('neighboring discards touch instead of retaining pre-rotation gaps',()=>{
 const layout=riverLayout(480,240,[12,12,12,12])
 assert.equal(layout[0][0].x+layout[0][0].w,layout[0][1].x)
 assert.equal(layout[3][0].y+layout[3][0].h,layout[3][1].y)
 assert.equal(layout[1][1].y+layout[1][1].h,layout[1][0].y)
})
