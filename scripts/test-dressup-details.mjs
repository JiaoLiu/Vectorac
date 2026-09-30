import test from 'node:test'
import assert from 'node:assert/strict'
import {selectPreview,displayParts,purchasedPreview,previewItems} from '../.vuepress/components/dressup/preview.mjs'
import {baseSource,layerSources,coveredBody} from '../.vuepress/components/dressup/compositor.mjs'
import {freshState,normalize,act} from '../.vuepress/components/dressup/engine.mjs'
import {DEFAULT_PARTS,FREE_PARTS,fineTags} from '../.vuepress/components/dressup/parts.mjs'
import {memoryGame,flipMemory,closeMemory,stylingGame,submitStyling,sewingGame,stitch,gameReward} from '../.vuepress/components/dressup/minigames.mjs'
test('old saves preserve coins, outfit, scene and album while receiving free detail options',()=>{
 const s=normalize({version:1,coins:352,owned:['mint'],scenes:['garden'],look:{outfit:'mint',scene:'garden',pose:2},albums:[{id:'old',look:{outfit:'mint',scene:'garden',pose:2}}]})
 assert.equal(s.coins,352);assert.equal(s.look.outfit,'mint');assert.equal(s.look.pose,2);assert.equal(s.look.mode,'outfit');assert.deepEqual(s.look.parts,DEFAULT_PARTS);assert.deepEqual(s.ownedParts,FREE_PARTS);assert.equal(s.albums[0].look.scene,'garden')
})
test('part purchase charges once, equips independently and rejects locked or wrong-category parts',()=>{
 let s=freshState();s=act(s,{type:'buy',kind:'part',id:'earrings-0'}).state;assert.equal(s.coins,70);assert.equal(s.look.parts.earrings,'earrings-0');assert.equal(s.look.parts.top,'top-0');assert.equal(s.look.mode,'fine');assert.equal(act(s,{type:'buy',kind:'part',id:'earrings-0'}).state.coins,70)
 assert.equal(act(s,{type:'part',id:'hat-2'}).ok,false);const broken=normalize({...s,look:{...s.look,parts:{top:'earrings-0',hat:'hat-2',lip:'lip-3'}}});assert.equal(broken.look.parts.top,'top-0');assert.equal(broken.look.parts.hat,'hat-none');assert.equal(broken.look.parts.lip,'lip-3')
})
test('fine albums snapshot makeup and restore independently of later changes',()=>{
 let s=act(freshState(),{type:'part',id:'lip-3'}).state;s=act(s,{type:'album',id:'fine'}).state;s=act(s,{type:'part',id:'lip-1'}).state;assert.equal(s.albums[0].look.parts.lip,'lip-3');s=act(s,{type:'restoreAlbum',id:'fine'}).state;assert.equal(s.look.parts.lip,'lip-3');assert.equal(s.look.mode,'fine');assert.equal(act(s,{type:'wear',outfit:'blush'}).state.look.mode,'outfit')
})
test('memory blocks third flip, preserves mismatches until closed and pays only after all pairs',()=>{
 let g=memoryGame(()=>.42);assert.equal(gameReward(g),0);const a=0,b=g.cards.findIndex(x=>x!==g.cards[a]);g=flipMemory(flipMemory(g,a),b);assert.equal(g.moves,1);assert.deepEqual(flipMemory(g,11),g);g=closeMemory(g);assert.equal(g.open.length,0)
 for(let symbol=0;symbol<6;symbol++){const pair=g.cards.map((c,i)=>c===symbol?i:-1).filter(i=>i>=0);g=flipMemory(flipMemory(g,pair[0]),pair[1])}assert.equal(g.complete,true);assert.equal(g.matched.length,12);assert.equal(gameReward(g),60);assert.equal(gameReward({...g,paid:true}),0)
})
test('styling requires both actual styles and the requested scene, not preview choices',()=>{
 const g=stylingGame(()=>0);assert.equal(submitStyling(g,['甜美'],'garden').score,65);assert.equal(submitStyling(g,['甜美','自然'],'atelier').score,70);const win=submitStyling(g,fineTags(DEFAULT_PARTS),'garden');assert.equal(win.score,100);assert.equal(gameReward(win),65)
})
test('sewing misses earn nothing and six successful stitches set grade-based reward',()=>{
 let g=sewingGame();g=stitch(g,.95);assert.equal(g.stitches,0);assert.equal(gameReward(g),0);for(let i=0;i<6;i++)g=stitch(g,.5);assert.equal(g.complete,true);assert.equal(gameReward(g),60);assert.deepEqual(stitch(g,.5),g)
 let normal=sewingGame();for(let i=0;i<6;i++)normal=stitch(normal,.7);assert.equal(gameReward(normal),45)
})
test('game reward deduplication survives saves and unrelated purchases',()=>{
 let s=act(freshState(),{type:'gameReward',id:'round-1',reward:60}).state;assert.equal(s.coins,160);s=act(normalize(JSON.parse(JSON.stringify(s))),{type:'buy',kind:'part',id:'earrings-0'}).state;assert.equal(s.coins,130);assert.equal(act(s,{type:'gameReward',id:'round-1',reward:60}).state.coins,130);assert.equal(act(s,{type:'gameReward',id:'bad',reward:100000}).ok,false)
})
test('multi-slot fitting draft survives owned accessories, makeup and a different purchase',()=>{
 const s=freshState();let draft=selectPreview({},'top-3',s.ownedParts)
 draft=selectPreview(draft,'bottom-2',s.ownedParts);draft=selectPreview(draft,'headpiece-0',s.ownedParts);draft=selectPreview(draft,'face-1',s.ownedParts)
 assert.deepEqual(draft,{top:'top-3',bottom:'bottom-2'});assert.equal(displayParts(s.look.parts,draft).top,'top-3');assert.equal(previewItems(draft).length,2)
 assert.equal(s.look.parts.top,'top-0');assert.equal(s.ownedParts.includes('top-3'),false)
 const next=purchasedPreview(draft,'top-3');assert.deepEqual(next,{bottom:'bottom-2'});assert.deepEqual(draft,{top:'top-3',bottom:'bottom-2'})
 const replaced=selectPreview(draft,'top-1',s.ownedParts);assert.deepEqual(replaced,{top:'top-1',bottom:'bottom-2'})
 assert.deepEqual(selectPreview(replaced,'top-0',s.ownedParts),{bottom:'bottom-2'})
})
test('old fine saves gain default hair; hair purchase and album restore preserve clothing and face',()=>{
 const parts={...DEFAULT_PARTS,top:'top-3',face:'face-2'};delete parts.hair
 let s=normalize({...freshState(),coins:500,ownedParts:[...FREE_PARTS,'top-3'],look:{mode:'fine',parts},albums:[{id:'old',look:{mode:'fine',parts}}]})
 assert.equal(s.look.parts.hair,'hair-0');assert.equal(s.albums[0].look.parts.hair,'hair-0')
 s=act(s,{type:'buy',kind:'part',id:'hair-1'}).state;assert.equal(s.coins,430);assert.equal(s.look.parts.top,'top-3');assert.equal(s.look.parts.face,'face-2')
 s=act(s,{type:'album',id:'long-hair'}).state;s=act(s,{type:'part',id:'hair-0'}).state;s=act(s,{type:'restoreAlbum',id:'long-hair'}).state
 assert.equal(s.look.parts.hair,'hair-1');assert.equal(s.look.parts.top,'top-3')
})
test('face selects an entire registered base, never a cropped rectangular face overlay',()=>{
 for(let i=0;i<4;i++){const parts={...DEFAULT_PARTS,face:'face-'+i};const src=baseSource(parts),sources=layerSources(parts)
  assert.equal(src,`/img/games/dressup/layers/v4/base-${i}.webp`);assert.equal(sources.filter(x=>x.includes('/base-')).length,1);assert.equal(sources.some(x=>x.includes('/face-')),false)
  assert.ok(sources.includes('/img/games/dressup/layers/v4/hair-0.webp'));assert.ok(sources.includes('/img/games/dressup/layers/v4/shoes-0.webp'))
 }
})
test('body cover masks never overlap (even-odd clipping), and exclude face and hands',()=>{
 for(let i=0;i<4;i++)for(const socks of ['socks-none','socks-0']){
  const cuts=coveredBody({...DEFAULT_PARTS,bottom:'bottom-'+i,socks}),bodyEnd=Math.max(...cuts[0].map(p=>p[1]))
  assert.equal(Math.min(...cuts[0].map(p=>p[1])),270);assert.ok(cuts[0].every(p=>p[0]>=155&&p[0]<=357))
  if(socks==='socks-none')assert.equal(cuts.length,1)
  else assert.ok(Math.min(...cuts[1].map(p=>p[1]))>=bodyEnd,'overlapping exclusions would reveal the body again')
 }
})
