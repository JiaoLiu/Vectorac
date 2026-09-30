import test from 'node:test'
import assert from 'node:assert/strict'
import {selectPreview,displayParts,purchasedPreview,previewItems} from '../.vuepress/components/dressup/preview.mjs'
import {BASE,baseSource,layerSources,paintComposite,REGISTERED_ORDER,underbodySource} from '../.vuepress/components/dressup/compositor.mjs'
import {freshState,normalize,act} from '../.vuepress/components/dressup/engine.mjs'
import {DEFAULT_PARTS,FREE_PARTS,fineTags,PARTS,CATEGORIES,PART_GROUPS,partAsset,partBackAsset,partThumbnail,fitIndex} from '../.vuepress/components/dressup/parts.mjs'
import {EDITIONS} from '../.vuepress/components/dressup/collections.mjs'
import {STYLES} from '../.vuepress/components/dressup/styles.mjs'
import {ACCESSORIES} from '../.vuepress/components/dressup/accessories.mjs'
import {JEWELLERY_FOOTWEAR} from '../.vuepress/components/dressup/jewellery-footwear.mjs'
import {memoryGame,flipMemory,closeMemory,stylingGame,submitStyling,sewingGame,stitch,gameReward} from '../.vuepress/components/dressup/minigames.mjs'
import {faceSampleX} from '../.vuepress/components/dressup/face-fit.mjs'
test('six genuinely new garment cuts have separate wearable/design assets, not more colour editions',()=>{
 assert.equal(STYLES.length,12)
 for(const p of STYLES){assert.equal(p.material,undefined);assert.equal(p.sourceIndex,undefined);assert.ok(partAsset(p).includes(p.category==='bottom'?'/v13/':'/v10/'));assert.ok(partThumbnail(p).includes('/v10/catalog/'));assert.notEqual(partAsset(p),partThumbnail(p));assert.ok(!EDITIONS.some(q=>q.id===p.id))}
 assert.equal(new Set(STYLES.map(partAsset)).size,12)
 assert.ok(underbodySource({...DEFAULT_PARTS,bottom:'bottom-17'}).endsWith('/v13/underbody.webp'))
 let s={...freshState(),coins:1000};s=act(s,{type:'buy',kind:'part',id:'top-12'}).state;s=act(s,{type:'buy',kind:'part',id:'bottom-17'}).state
 const look=JSON.stringify(s.look);s=act(s,{type:'part',id:'brows-3'}).state;assert.equal(s.look.parts.top,'top-12');assert.equal(s.look.parts.bottom,'bottom-17');s=normalize(JSON.parse(JSON.stringify(s)));assert.equal(s.look.parts.top,'top-12');assert.notEqual(JSON.stringify(s.look),look)
})
test('twelve new accessory cuts purchase and persist without resetting clothing or older ownership',()=>{
 assert.equal(ACCESSORIES.length,12)
 for(const category of ['hair','headpiece','hat','earrings','socks','shoes'])assert.equal(ACCESSORIES.filter(p=>p.category===category).length,2)
 let s={...freshState(),coins:2000}
 for(const p of ACCESSORIES){assert.ok(partAsset(p).includes(p.id==='hat-11'?'/v12/':'/v11/'));assert.ok(partThumbnail(p).includes('/v11/catalog/'));assert.notEqual(partAsset(p),partThumbnail(p));s=act(s,{type:'buy',kind:'part',id:p.id}).state;assert.ok(s.ownedParts.includes(p.id));assert.equal(s.look.parts[p.category],p.id);assert.equal(s.look.parts.top,DEFAULT_PARTS.top)}
 const saved=normalize(JSON.parse(JSON.stringify(s)));assert.deepEqual(saved.look,s.look);assert.deepEqual(saved.ownedParts,s.ownedParts)
})
test('six shoe silhouettes and eight jewellery pieces have independent product art and persistent slots',()=>{
 assert.equal(JEWELLERY_FOOTWEAR.length,14)
 for(const [category,count] of [['shoes',6],['necklace',4],['wrist',4]])assert.equal(JEWELLERY_FOOTWEAR.filter(p=>p.category===category).length,count)
 let s={...freshState(),coins:3000}
 for(const p of JEWELLERY_FOOTWEAR){assert.ok(partAsset(p).includes(p.wearVersion?'/v13/':'/v12/'));assert.ok(partThumbnail(p).includes('/v12/catalog/'));assert.notEqual(partAsset(p),partThumbnail(p));assert.equal(p.material,undefined);assert.equal(p.sourceIndex,undefined);s=act(s,{type:'buy',kind:'part',id:p.id}).state;assert.equal(s.look.parts[p.category],p.id);assert.equal(s.look.parts.top,'top-0')}
 s=act(s,{type:'album',id:'new-jewels'}).state;s=act(s,{type:'part',id:'necklace-none'}).state;s=act(s,{type:'part',id:'wrist-none'}).state
 s=act(normalize(JSON.parse(JSON.stringify(s))),{type:'restoreAlbum',id:'new-jewels'}).state
 assert.equal(s.look.parts.necklace,'necklace-3');assert.equal(s.look.parts.wrist,'wrist-3');assert.equal(s.look.parts.shoes,'shoes-11')
})
test('old saves receive empty necklace and wrist slots without resetting clothing, albums or money',()=>{
 const old={...DEFAULT_PARTS,top:'top-3',bottom:'bottom-2',hat:'hat-11'};delete old.necklace;delete old.wrist
 const s=normalize({...freshState(),coins:487,ownedParts:[...FREE_PARTS,'top-3','bottom-2','hat-11'],look:{mode:'fine',parts:old},albums:[{id:'prior',look:{mode:'fine',parts:old}}]})
 assert.equal(s.coins,487);assert.equal(s.look.parts.top,'top-3');assert.equal(s.look.parts.bottom,'bottom-2');assert.equal(s.look.parts.hat,'hat-11');assert.equal(s.look.parts.necklace,'necklace-none');assert.equal(s.look.parts.wrist,'wrist-none');assert.deepEqual(s.albums[0].look.parts,s.look.parts)
 const draft=selectPreview(selectPreview(selectPreview({},'shoes-10',s.ownedParts),'necklace-2',s.ownedParts),'wrist-0',s.ownedParts)
 assert.deepEqual(draft,{shoes:'shoes-10',necklace:'necklace-2',wrist:'wrist-0'});assert.deepEqual(purchasedPreview(draft,'necklace-2'),{shoes:'shoes-10',wrist:'wrist-0'});assert.equal(displayParts(s.look.parts,draft).top,'top-3')
})
test('grouping covers every category exactly once; bracelet rear sits behind body and front above clothing',()=>{
 assert.deepEqual(PART_GROUPS.flatMap(g=>g.categories).sort(),CATEGORIES.map(c=>c.id).sort())
 const parts={...DEFAULT_PARTS,necklace:'necklace-0',wrist:'wrist-0'},sources=layerSources(parts),draws=[]
 const wrist=PARTS.find(p=>p.id==='wrist-0'),images=new Map(sources.map(src=>[src,{src}]))
 const ctx=new Proxy({drawImage:img=>draws.push(img.src)},{get:(o,k)=>o[k]||(()=>{})});paintComposite(ctx,images,parts)
 assert.ok(sources.includes(partBackAsset(wrist)));assert.ok(draws.indexOf(partBackAsset(wrist))<draws.indexOf(BASE));assert.ok(draws.indexOf(partAsset(wrist))>draws.indexOf(partAsset(PARTS.find(p=>p.id===parts.top))))
 assert.equal(partBackAsset(PARTS.find(p=>p.id==='wrist-none')),'');assert.ok(partBackAsset(PARTS.find(p=>p.id==='wrist-2')).includes('/v13/wrist-2-back.webp'))
 const hat=PARTS.find(p=>p.id==='hat-11');assert.ok(partAsset(hat).includes('/v12/hat-11'));assert.ok(partThumbnail(hat).includes('/v11/catalog/hat-11'))
})
test('32 editions reuse registered assets, independent product designs and existing fit indices',()=>{
 assert.equal(EDITIONS.length,32);assert.equal(new Set(PARTS.map(p=>p.id)).size,PARTS.length)
 for(const p of EDITIONS){const original=PARTS.find(q=>q.id===`${p.category}-${p.sourceIndex}`)
  assert.equal(partAsset(p),partAsset(original));assert.equal(partThumbnail(p),partThumbnail(original));assert.equal(fitIndex(p),original.index)
  assert.deepEqual(layerSources({...DEFAULT_PARTS,[p.category]:p.id}),layerSources({...DEFAULT_PARTS,[p.category]:original.id}))
 }
})
test('edition purchases, trial drafts and albums persist their own identities without changing other slots',()=>{
 let s=act(freshState(),{type:'buy',kind:'part',id:'top-4'}).state
 assert.equal(s.coins,45);assert.equal(s.look.parts.top,'top-4');assert.equal(s.look.parts.bottom,'bottom-0')
 let draft=selectPreview({},'hat-7',s.ownedParts);draft=selectPreview(draft,'bottom-11',s.ownedParts)
 assert.deepEqual(displayParts(s.look.parts,draft),{...s.look.parts,hat:'hat-7',bottom:'bottom-11'})
 s=act(s,{type:'album',id:'mint-edition'}).state;s=act(s,{type:'part',id:'top-0'}).state
 s=act(normalize(JSON.parse(JSON.stringify(s))),{type:'restoreAlbum',id:'mint-edition'}).state
 assert.equal(s.look.parts.top,'top-4');assert.equal(s.albums[0].look.parts.top,'top-4')
})
test('face shaping stays small and smooth, preserves the nose and never widens the neck',()=>{
 for(let face=0;face<4;face++)for(let y=25;y<164;y++)for(let x=190;x<322;x++){
  const mapped=faceSampleX(face,x,y)
  if(y>=148||y<=120||Math.abs(x-256)<=16)assert.equal(mapped,x,'fixed anatomy must not move')
  assert.ok(Math.abs(mapped-x)<4.7,'jaw/cheek deformation is excessive')
  assert.ok(Math.abs(mapped-faceSampleX(face,x,y+1))<1,'face contour must change by less than one source pixel per row')
 }
})
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
test('blank master and anatomical layers all use the same registered canvas',()=>{
 for(let i=0;i<4;i++){const parts={...DEFAULT_PARTS,face:'face-'+i};const src=baseSource(parts),sources=layerSources(parts)
  assert.equal(src,BASE);assert.equal(sources.filter(x=>x===BASE).length,1)
  assert.ok(sources.includes(partAsset(PARTS.find(p=>p.id===`face-${i}`))))
  for(const category of ['hair','shoes','eyes','brows','lip'])assert.ok(sources.includes(partAsset(PARTS.find(p=>p.id===category+'-0'))))
 }
})
test('anatomical layers are drawn in place without per-item bounding-box resizing or painted makeup',()=>{
 const draws=[],images=new Map(layerSources(DEFAULT_PARTS).map(src=>[src,{src}]))
 const ctx=new Proxy({drawImage:(img,...rect)=>draws.push({src:img.src,rect})},{get:(o,k)=>o[k]||(()=>{})})
 paintComposite(ctx,images,DEFAULT_PARTS)
 for(const call of draws)assert.deepEqual(call.rect,[0,0,512,1024])
 const order=REGISTERED_ORDER.map(c=>partAsset(PARTS.find(p=>p.id===DEFAULT_PARTS[c])))
 assert.deepEqual(draws.slice(4,4+order.length).map(d=>d.src),order)
})
test('old fine saves and albums gain independent eyes without losing purchased socks, face or clothing',()=>{
 const parts={...DEFAULT_PARTS,top:'top-3',socks:'socks-1',face:'face-2'};delete parts.eyes
 let s=normalize({...freshState(),coins:678,ownedParts:[...FREE_PARTS,'top-3','socks-1'],look:{mode:'fine',parts},albums:[{id:'existing',look:{mode:'fine',parts}}]})
 assert.equal(s.coins,678);assert.equal(s.look.parts.eyes,'eyes-0');assert.equal(s.albums[0].look.parts.eyes,'eyes-0')
 s=act(s,{type:'part',id:'eyes-2'}).state;assert.equal(s.look.parts.top,'top-3');assert.equal(s.look.parts.face,'face-2');assert.equal(s.look.parts.socks,'socks-1');assert.equal(s.albums[0].look.parts.eyes,'eyes-0')
 const socks=PARTS.filter(p=>p.category==='socks'&&p.index>=0);assert.equal(socks.length,8);assert.ok(socks.some(p=>p.name.includes('短袜')));assert.ok(socks.some(p=>p.name.includes('中筒')));assert.ok(socks.some(p=>p.name.includes('过膝')))
})
