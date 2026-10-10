import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,stat} from 'node:fs/promises'
import {HEROES,PLAYABLE_HEROES,CARDS_BY_TYPE,PLANNED_EQUIPMENT,ALLIANCES,heroForBase,displayText} from '../.private/fengshen/theme.mjs'
import {catalog,createGame,dispatch,playerView,restoreGame,allCards,THEME_VERSION} from '../.private/fengshen/engine.mjs'
import {createGame as classicGame,restoreGame as classicRestore,hero as classicHero} from '../.private/fengshen/core/engine.mjs'
import {HERO_BY_ID,CARDS,makeDeck} from '../.private/fengshen/core/catalog.mjs'
import {chooseAI} from '../.private/fengshen/engine.mjs'
import {ART_PROMPTS} from '../.private/fengshen/art-prompts.mjs'

test('52 unique portraits, 43 playable heroes; every enabled primitive exists',()=>{
  assert.equal(HEROES.length,52);assert.equal(new Set(HEROES.map(h=>h.id)).size,52)
  assert.equal(PLAYABLE_HEROES.length,43)
  for(const h of HEROES){if(h.playable){assert.ok(catalog.HERO_BY_ID[h.engineId]);assert.deepEqual(Object.keys(h.skillNames),catalog.HERO_BY_ID[h.engineId].skills)}else assert.throws(()=>createGame({heroId:h.id}))}
  assert.equal(HEROES.find(h=>h.baseHero==='xiaoqiao').name,'龙吉公主');assert.equal(HEROES.find(h=>h.baseHero==='xiaoqiao').sex,'female')
})
test('theme and classic catalogs do not mutate each other',()=>{
  const a=createGame({heroId:'jinling',role:'lord',seed:1}),b=classicGame({heroId:'huangyueying',seed:2})
  assert.equal(catalog.HERO_BY_ID.huangyueying.faction,'qun');assert.equal(classicHero(b.players[0]).faction,'shu')
  assert.equal(catalog.HERO_BY_ID.liubei.faction,'shu');assert.equal(catalog.HERO_BY_ID.caocao.faction,'wei');assert.equal(catalog.HERO_BY_ID.sunquan.faction,'wu')
  assert.equal(a.theme,THEME_VERSION);assert.equal(b.theme,undefined);assert.equal(HERO_BY_ID.huangyueying.name,'黄月英')
  assert.equal(catalog.HERO_BY_ID.huangyueying.name,'金灵圣母')
})
test('deck physical identities and all equipment stats remain unchanged',()=>{
  assert.equal(Object.keys(CARDS_BY_TYPE).length,39)
  for(const [type,c] of Object.entries(CARDS)){assert.equal(CARDS_BY_TYPE[type].range,c.range);assert.equal(CARDS_BY_TYPE[type].slot,c.slot);assert.equal(CARDS_BY_TYPE[type].category,c.category)}
  for(const h of PLAYABLE_HEROES){const s=createGame({heroId:h.id,seed:33});assert.deepEqual(allCards(s).sort((a,b)=>a.id.localeCompare(b.id)),catalog.makeDeck().sort((a,b)=>a.id.localeCompare(b.id)))}
  for(const p of PLANNED_EQUIPMENT)assert.equal(CARDS_BY_TYPE[p.type],undefined)
})
test('lord support uses the mapped alliance, not Huang Yueying original Shu faction',()=>{
  const s=createGame({heroId:'jifa',role:'lord',seed:7})
  s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0
  const ids=['liubei','huangyueying','zhangfei','zhaoyun','machao']
  for(const p of s.players){p.heroId=ids[p.seat];p.hp=p.maxHp=catalog.HERO_BY_ID[p.heroId].hp+(p.role==='lord'?1:0);p.hand=[];p.judgment=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0}}
  const r=dispatch(s,{seat:0,type:'skill',skill:'jijiang',target:1})
  assert.ok(r.ok,r.error);assert.equal(r.state.pending.kind,'support');assert.equal(r.state.pending.actor,2)
  assert.deepEqual(r.state.pending.candidates,[2,3,4]);assert.equal(r.state.pending.candidates.includes(1),false)
  assert.ok(restoreGame(r.state));assert.equal(allCards(r.state).length,121)
})
test('save themes reject cross-loads and unsupported generals',()=>{
  const a=createGame({heroId:'yangjian',seed:5}),b=classicGame({seed:5})
  assert.deepEqual(restoreGame(a),a);assert.equal(restoreGame(b),null);assert.equal(classicRestore(a),null)
  const wrong=structuredClone(a);wrong.theme='other';assert.equal(restoreGame(wrong),null)
  const changed=structuredClone(a);changed.players[0].heroId='guanyu';assert.equal(restoreGame(changed),null)
})
test('display layer adapts hero, card, skill and support descriptions',()=>{
  assert.equal(heroForBase('huangyueying').name,'金灵圣母')
  assert.equal(displayText('刘备以仁德交给黄月英诸葛连弩'),'姬发以仁君交给金灵圣母火尖枪')
  assert.equal(displayText('其他蜀将提供杀；其他魏将提供闪；其他吴将救你'),'其他周势力角色提供杀；其他商势力角色提供闪；其他阐教角色救你')
  assert.equal(displayText('金灵圣母使用仙桃'),'金灵圣母使用仙桃')
  assert.equal(displayText(displayText('刘备使用桃')),'姬发使用仙桃')
})
test('AI only receives legal player views, not hidden hands, identities or deck',()=>{
  const s=createGame({heroId:'jifa',role:'loyal',seed:5}),v=playerView(s,0)
  assert.equal(v.deck,undefined);for(const p of v.players.slice(1)){assert.deepEqual(p.hand,[]);if(p.role!=='lord')assert.equal(p.role,null)}
  assert.ok(chooseAI(playerView(s,s.pending?.actor??s.current)))
})
test('180 seeded matches complete legally across every enabled character and role',()=>{
  const winners={lord:0,rebel:0,renegade:0}
  for(let seed=1;seed<=180;seed++){
    let s=createGame({heroId:PLAYABLE_HEROES[(seed-1)%PLAYABLE_HEROES.length].id,role:['lord','loyal','rebel','renegade','random'][seed%5],seed}),actions=0
    while(!s.winner&&actions++<3500){const actor=s.pending?.actor??s.current,v=playerView(s,actor),a=chooseAI(v);assert.ok(a,`seed ${seed} actor ${actor}`);const r=dispatch(s,a);assert.ok(r.ok,`seed ${seed}: ${r.error} ${JSON.stringify(a)}`);s=r.state;if(actions%71===0){assert.equal(allCards(s).length,121);assert.ok(restoreGame(s))}}
    assert.ok(s.winner,`seed ${seed} failed to finish`);winners[s.winner]++;assert.equal(allCards(s).length,121)
  }
  console.log('Fengshen prototype simulations (not a balance result):',winners)
})
test('91 independent artwork prompts are complete and workspace assets exist',async()=>{
  assert.equal(ART_PROMPTS.length,91);assert.equal(new Set(ART_PROMPTS.map(a=>a.kind+'/'+a.id)).size,91)
  for(const a of ART_PROMPTS){assert.ok(a.prompt.includes('no watermark'));const s=await stat(new URL(`../.private/fengshen/assets/${a.kind}/${a.id}.jpg`,import.meta.url));assert.ok(s.size>1000)}
  for(const h of HEROES){const full=await stat(new URL(`../.private/fengshen/${h.image}`,import.meta.url)),thumb=await stat(new URL(`../.private/fengshen/${h.thumbnail}`,import.meta.url));assert.ok(thumb.size>1000&&thumb.size<full.size)}
})
test('prototype stays out of VuePress public routes and binds loopback',async()=>{
  const script=await readFile(new URL('./fengshen-preview.mjs',import.meta.url),'utf8'),html=await readFile(new URL('../.private/fengshen/index.html',import.meta.url),'utf8')
  assert.ok(script.includes("server.listen(port,'127.0.0.1'"));assert.ok(html.includes('noindex,nofollow,noarchive'))
  await assert.rejects(stat(new URL('../blogs/other/fengshen.md',import.meta.url)))
})
