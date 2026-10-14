import {stableOpponents} from './fixtures/gods-stable.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createGame,createAssignedGame,dispatch,playerView,allCards,restoreGame,catalog,militaryCatalog,chooseAI} from '../site/.vuepress/components/fengshen/engine.mjs'
import {makeDeck} from '../site/.vuepress/components/fengshen/core/catalog.mjs'
import {hand,equipment} from './fixtures/sanguo.mjs'
import {combatContext,damageCues,collateralSelection} from '../site/.vuepress/components/fengshen/combat.mjs'
import {handLayout} from '../site/.vuepress/components/fengshen/hand.mjs'
import {cardFace} from '../site/.vuepress/components/fengshen/presentation.mjs'
import {CARDS_BY_TYPE} from '../site/.vuepress/components/fengshen/theme.mjs'
import {CardVoice} from '../site/.vuepress/components/fengshen/voice.mjs'
import {createEngine} from '../site/.vuepress/components/fengshen/core/engine.mjs'
import {advanceUnavailable,DecisionClock} from '../site/.vuepress/components/fengshen/flow.mjs'
import {BackgroundMusic} from '../site/.vuepress/components/fengshen/music.mjs'
import {drawEffects} from '../site/.vuepress/components/fengshen/draw-effects.mjs'
import {recoveryCues} from '../site/.vuepress/components/fengshen/health-effects.mjs'
function fixture(current=0,heroId='yangjian'){
 const s=stableOpponents(createGame({heroId,role:'lord',seed:17}));s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.logs=[];s.lastPlayed=null;s.lastEvent=null
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp}
 if(s.players[1].heroId==='machao'){const other=s.players.slice(2).find(p=>p.heroId!=='machao');[s.players[1].heroId,other.heroId]=[other.heroId,s.players[1].heroId]}
 return s
}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,108);return r.state}
test('AI saves Nullify on a full-HP group-heal recipient in either counter direction, for self/ally/enemy',()=>{
 const s=createAssignedGame({roles:['lord','rebel','loyal','rebel'],heroIds:['yangjian','nezha','jifa','wenzhong'],sides:[0,1,0,1],seed:23});hand(s,1,'nullify')
 const view=playerView(s,1),counter=view.players[1].hand.find(c=>c.type==='nullify')
 for(const target of [0,1,3])for(const negated of [false,true]){
  view.pending={kind:'counter',actor:1,id:20,source:2,target,cardType:'garden',negated};view.legal=[{type:'pass'},{type:'respond',as:'nullify',ids:[counter.id]}]
  const p=view.players[target];p.hp=p.maxHp
  assert.equal(chooseAI(view).type,'pass',`full HP target ${target}, negated=${negated}`)
  p.hp--;const answer=chooseAI(view),enemy=target===0
  assert.equal(answer.type,(enemy!==negated)?'respond':'pass',`wounded target ${target}, negated=${negated}`)
  p.hp=p.maxHp
 }
 view.pending={kind:'counter',actor:1,id:21,source:2,target:0,cardType:'draw',negated:false}
 assert.equal(chooseAI(view).type,'respond','full HP does not make enemy card-draw worthless')
 view.pending={...view.pending,target:3,cardType:'arrows'};assert.equal(chooseAI(view).type,'respond','protect full-HP allies from real damage')
})
test('AI holds a lone Peach for teammates while healthy, and eats one when carrying several or badly hurt',()=>{
 const build=(peaches,hp)=>{
  const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['yangjian','nezha','jifa','wenzhong','hades'],seed:23})
  Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:1,logs:[]})
  for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.hp=p.maxHp}
  s.players[1].hp=hp;hand(s,1,...Array(peaches).fill('tao'))
  return s
 }
 const healthy=playerView(build(1,3),1)
 assert.ok(healthy.legal.some(a=>a.type==='play'&&a.as==='tao'),'血量健康时仍可自愈（引擎照常提供）')
 assert.notEqual(chooseAI(healthy).as,'tao','血量健康且只有一张桃时必须留着救队友')
 assert.equal(chooseAI(playerView(build(2,3),1)).as,'tao','血量健康但有多张桃时吃一张')
 assert.equal(chooseAI(playerView(build(1,1),1)).as,'tao','贫血时即使只有一张桃也自保')
})
test('AI 不浪费救不活的桃：凑不齐就一颗都不出，接力救得活才出手',()=>{
 // 座位 2、3 同为反贼（队友）；受伤触发技（雷鉴等）的武将避开受害者位，防止插进救援询问。
 const build=(dyingHp,peaches,attacker=4,victim=3,ai=2,relaySeat=null,victimJunk=false)=>{
  let s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['yangjian','wenzhong','nezha','jifa','hades'],seed:23})
  Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:attacker,logs:[],lastPlayed:null,lastEvent:null})
  for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp}
  const [sha]=hand(s,attacker,'sha');hand(s,ai,...Array(peaches).fill('tao'))
  if(relaySeat!=null)hand(s,relaySeat,'sha')
  if(victimJunk)hand(s,victim,'sha')
  s.players[victim].hp=dyingHp
  s=step(s,{seat:attacker,type:'play',as:'sha',ids:[sha.id],targets:[victim]})
  s=step(s,{type:'pass'})
  assert.equal(s.pending.kind,'rescue');assert.equal(s.pending.actor,ai)
  return {s,view:playerView(s,ai)}
 }
 // -1 血要两个桃，手里只有一个：出桃也救不活，必须留着
 let {view}=build(0,1)
 assert.equal(view.players[3].hp,-1,'被打到 -1 血，需两个桃')
 assert.equal(chooseAI(view).type,'pass','凑不齐所需桃数，一颗都不该白出')
 // 濒死者手里就算捏着杂牌也不赌他暗藏桃/琼浆
 ;({view}=build(0,1,4,3,2,null,true))
 assert.equal(chooseAI(view).type,'pass','不赌濒死者手里暗藏桃')
 // 凑得齐两个桃才出手
 ;({view}=build(0,2))
 assert.equal(chooseAI(view).type,'respond','手里桃够救活，必须救')
 // 只差一个桃就能活：出桃即活，照常救
 ;({view}=build(1,1))
 assert.equal(chooseAI(view).type,'respond','出一个桃就能救活，照常救')
 // 多人场放宽：还轮得到询问的同侧队友手里有牌，接力能补上缺口就出（反贼 3 救反贼 2，座位 4 未问到且持牌）
 ;({view}=build(0,1,1,2,3,4))
 assert.equal(chooseAI(view).type,'respond','队友接力能成就出')
 // 接力补不上缺口（没人可接）照样留桃
 ;({view}=build(0,1,1,2,3))
 assert.equal(chooseAI(view).type,'pass','没有接力补缺就不出')
 // 敌方（主公）濒死不救（既有行为不变）
 ;({view}=build(0,2,4,0,2))
 assert.equal(chooseAI(view).type,'pass','敌方濒死不救')
 // 自救照常出桃：救不活自己也是一死，桃随阵亡弃掉，留着没有意义
 ;({view}=build(0,1,1,2,2))
 assert.equal(view.players[2].hp,-1,'自己被打到 -1 血')
 assert.equal(chooseAI(view).type,'respond','自救有多少出多少')
})
test('AI stops wasting black slashes on Renwang Shield, yet keeps attacking red, qinggang or unarmored targets',()=>{
 const build=(armor,slashType='sha',suit='spade',weapon=null)=>{
  const military=slashType!=='sha'
  const s=createAssignedGame({roles:['lord','rebel','loyal','rebel','renegade'],heroIds:['yangjian','nezha','jifa','wenzhong','hades'],seed:23,...(military?{deckVersion:2}:{})})
  Object.assign(s,{deck:(military?militaryCatalog:catalog).makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:1,logs:[]})
  for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.hp=p.maxHp}
  if(armor)equipment(s,0,armor)
  if(weapon)equipment(s,1,weapon)
  hand(s,1,[slashType,suit])
  return playerView(s,1)
 }
 const attacks=v=>{const a=chooseAI(v);return a.type==='play'&&['sha','firesha','thundersha'].includes(a.as)}
 assert.ok(!attacks(build('renwang')),'黑色的杀打仁王盾必被挡，AI 不该白送一张牌')
 assert.ok(!attacks(build('renwang','thundersha','spade')),'黑色雷杀同样是黑杀，也会被仁王盾挡下')
 assert.ok(attacks(build('renwang','sha','heart')),'红色的杀照常进攻仁王盾')
 assert.ok(attacks(build('renwang','sha','spade','qinggang')),'青釭剑无视防具，黑杀也能穿透仁王盾')
 assert.ok(attacks(build(null)),'无防具时黑杀正常进攻')
})
test('group-heal only opens a Nullify window for wounded recipients; full HP asks nobody',()=>{
 for(const missing of [0,1]){
  let s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['yangjian','nezha','jifa','wenzhong','hades'],seed:23})
  Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:1,logs:[]});for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.hp=p.maxHp}
  const heal=hand(s,1,'garden')[0],nullify=hand(s,2,'nullify')[0];s.players[0].hp-=missing
  s=step(s,{seat:1,type:'play',as:'garden',ids:[heal.id],targets:[]});const asked=[];let limit=0
  while(s.pending?.kind==='counter'&&limit++<80){
   asked.push(s.pending.target)
   const atEnemy=s.pending.actor===2&&s.pending.target===0
   s=step(s,atEnemy?chooseAI(playerView(s,2)):{type:'pass'})
  }
  assert.ok(asked.every(t=>t===0),'only the wounded recipient is ever asked: '+JSON.stringify(asked))
  assert.equal(asked.length>0,!!missing,'满血群体回血不再逐个询问破法')
  assert.equal(s.players[2].hand.some(c=>c.id===nullify.id),!missing);assert.equal(s.players[0].hp,s.players[0].maxHp-missing);assert.equal(allCards(s).length,108)
 }
})
test('「本轮不出」对同一张群体锦囊只询问一次破法，新的一张牌重新询问',()=>{
 let s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['yangjian','nezha','jifa','wenzhong','hades'],seed:23})
 Object.assign(s,{deck:catalog.makeDeck(),discard:[],processing:[],harvestPool:[],queue:[],pending:null,phase:'play',current:1,logs:[]})
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.hp=p.maxHp}
 const arrows=hand(s,1,'arrows')[0],nullify=hand(s,0,'nullify')[0]
 s=step(s,{seat:1,type:'play',as:'arrows',ids:[arrows.id],targets:[]})
 assert.equal(s.pending?.kind,'counter');assert.equal(s.pending.actor,0)
 assert.ok(playerView(s,0).legal.some(a=>a.type==='decline'),'群体锦囊的破法面板要提供「本轮不出」')
 const asks=[];let guard=0
 while(s.pending&&guard++<120){if(s.pending.kind==='counter'){asks.push(s.pending.actor);s=step(s,{type:'decline'})}else s=step(s,{type:'pass'})}
 assert.deepEqual(asks,[0],'「本轮不出」后，同一张万箭齐发不再逐个目标追问破法')
 assert.equal(s.players[0].hand.some(c=>c.id===nullify.id),true,'「本轮不出」不消耗无懈可击')
 const harvest=hand(s,1,'harvest')[0]
 s=step(s,{seat:1,type:'play',as:'harvest',ids:[harvest.id],targets:[]})
 assert.equal(s.pending?.kind,'counter','新的一张牌（新 batch）必须重新询问破法');assert.equal(s.pending.actor,0)
})
test('Peach recovery exposes actual public HP gain once, with no false full-HP cue',()=>{
 let s=fixture(),[c]=hand(s,0,'tao');s.players[0].hp--;const before=s;s=step(s,{type:'play',as:'tao',ids:[c.id],targets:[]})
 const cues=recoveryCues(before,s);assert.equal(cues.length,1);assert.equal(cues[0].amount,1);assert.equal(cues[0].target,0);assert.deepEqual(Object.keys(cues[0]).sort(),['amount','id','kind','target'])
 assert.deepEqual(recoveryCues(s,s),[]);assert.deepEqual(recoveryCues(s,restoreGame(s)),[]);assert.equal(playerView(s,1).logs.find(l=>l.cue?.kind==='recover').cue.amount,1)
 s=fixture(0,'jifa');const gifts=hand(s,0,'sha','shan'),full=s;s=step(s,{type:'skill',skill:'rende',ids:gifts.map(c=>c.id),target:1});assert.equal(s.players[0].hp,full.players[0].maxHp);assert.deepEqual(recoveryCues(full,s),[])
})
test('Hades recovery counts actual capped gain, not nominal damage; red damage is retained',()=>{
 for(const missing of [1,2]){let s=fixture(0,'hades');s.players[0].hp=s.players[0].maxHp-missing;s.players[0].marks.naked=true;const [c]=hand(s,0,'sha');s=step(s,{type:'play',as:'sha',ids:[c.id],targets:[1]});const before=s;s=step(s,{type:'pass'});const heals=recoveryCues(before,s),hits=damageCues(before,s);assert.equal(heals.length,1);assert.equal(heals[0].amount,missing);assert.equal(hits[0].amount,2);assert.equal(hits[0].target,1);assert.equal(s.players[0].hp,s.players[0].maxHp)}
})
test('legacy catalog recovery mechanics stay intact without themed recovery cues',()=>{
 const classic=createEngine({...catalog,trackBattle:false}),s=fixture(),[c]=hand(s,0,'tao');s.players[0].hp--;const hp=s.players[0].hp,r=classic.dispatch(s,{seat:0,type:'play',as:'tao',ids:[c.id],targets:[]});assert.ok(r.ok);assert.equal(r.state.players[0].hp,hp+1);assert.deepEqual(recoveryCues(s,r.state),[])
})
test('resolved draw trick emits one actual two-card cue and highlights only local new cards',()=>{
 let s=fixture(),[c]=hand(s,0,'draw');const before=s;s=step(s,{type:'play',as:'draw',ids:[c.id],targets:[]})
 assert.equal(s.players[0].hand.length,2);const effects=drawEffects(before,s);assert.equal(effects.length,1);assert.equal(effects[0].count,2);assert.equal(effects[0].target,0);assert.deepEqual(effects[0].ownIds,s.players[0].hand.map(c=>c.id))
 assert.deepEqual(drawEffects(s,restoreGame(s)),[],'loading saved draw results does not draw or animate again')
})
test('other player draw cue appears only after nullify gate; contains no hidden faces or IDs',()=>{
 let s=fixture(2),[c]=hand(s,2,'draw');hand(s,0,'nullify');s=step(s,{type:'play',as:'draw',ids:[c.id],targets:[]});assert.equal(s.pending.kind,'counter');assert.deepEqual(drawEffects(s,s),[])
 const before=s;s=step(s,{type:'pass'});assert.equal(s.players[2].hand.length,2);const effects=drawEffects(before,s);assert.equal(effects.length,1);assert.equal(effects[0].target,2);assert.equal(effects[0].count,2);assert.deepEqual(effects[0].ownIds,[])
 const v=playerView(s,0),cue=v.logs.find(l=>l.cue?.kind==='draw').cue;assert.deepEqual(Object.keys(cue).sort(),['count','kind','playedId','reason','target']);assert.deepEqual(v.players[2].hand,[])
 for(const hidden of s.players[2].hand)assert.equal(JSON.stringify(effects).includes(hidden.id),false)
})
test('cancelled draw trick has no two-card cue, but the independent automatic Jizhi draw still animates',()=>{
 let s=fixture(0,'jinling'),[c]=hand(s,0,'draw'),[counter]=hand(s,1,'nullify');const original=s
 s=step(s,{type:'play',as:'draw',ids:[c.id],targets:[]});assert.equal(s.pending.kind,'counter');assert.equal(s.players[0].hand.length,1)
 s=step(s,{type:'respond',ids:[counter.id]});assert.equal(s.players[0].hand.length,1);const afterCancel=drawEffects(original,s);assert.equal(afterCancel.some(e=>e.reason==='card-draw'),false,'cancelled draw trick emits no two-card cue');assert.ok(afterCancel.some(e=>e.reason==='skill-draw'&&e.count===1&&e.target===0),'independent automatic Jizhi draw still animates its single card')
 s=fixture(0,'jinling');[c]=hand(s,0,'draw');const before=s;s=step(s,{type:'play',as:'draw',ids:[c.id],targets:[]});assert.equal(s.players[0].hand.length,3);const effects=drawEffects(before,s);const trick=effects.find(e=>e.reason==='card-draw'),extra=effects.find(e=>e.reason==='skill-draw');assert.equal(trick.count,2);assert.equal(extra.count,1);assert.deepEqual([...trick.ownIds,...extra.ownIds].sort(),s.players[0].hand.map(c=>c.id).sort(),'trick + Jizhi cues together highlight every new local card exactly once')
})
test('exhausted draw uses actual count rather than falsely showing two received cards',()=>{
 for(const available of [0,1]){let s=fixture(),[c]=hand(s,0,'draw');s.players[4].hand.push(...s.deck.splice(available));const before=s;s=step(s,{type:'play',as:'draw',ids:[c.id],targets:[]});while(s.pending?.kind==='counter')s=step(s,{type:'pass'});assert.equal(s.players[0].hand.length,available);const effects=drawEffects(before,s);assert.equal(effects.length,available?1:0);if(available)assert.equal(effects[0].count,1)}
})
test('classic default draw mechanics and log structure remain unchanged',()=>{
 const classic=createEngine({...catalog,trackBattle:false}),s=fixture(),[c]=hand(s,0,'draw'),r=classic.dispatch(s,{seat:0,type:'play',as:'draw',ids:[c.id],targets:[]});assert.ok(r.ok);assert.equal(r.state.players[0].hand.length,2);assert.equal(r.state.logs.some(l=>l.cue?.kind==='draw'),false)
})
test('Sha response identifies attacker and defender; dodge is not damage',()=>{
 let s=fixture(1);const [sha]=hand(s,1,'sha'),[shan]=hand(s,0,'shan');const before=s
 s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]});const v=playerView(s,0),c=combatContext(v)
 assert.equal(c.source,1);assert.equal(c.target,0);assert.match(c.text,/→ 杀 →/);assert.match(c.hint,/需出闪/)
 assert.equal(v.pending.context.type,'attack');assert.equal(v.pending.context.cardIds,undefined)
 s=step(s,{type:'respond',ids:[shan.id]});assert.equal(s.players[0].hp,before.players[0].hp);assert.equal(damageCues(before,s).length,0);assert.equal(combatContext(playerView(s,0)).kind,'dodge')
 assert.equal(playerView(s,2).lastResponse.as,'shan');assert.equal(playerView(s,2).lastResponse.cards[0].id,shan.id);assert.ok(restoreGame(s))
})
test('a blocked black Sha shows an armor result, never a hurt cue or endless attack prompt',()=>{
 let s=fixture(1),[c]=hand(s,1,'sha');equipment(s,0,'renwang');s=step(s,{type:'play',as:'sha',ids:[c.id],targets:[0]});assert.equal(s.pending,null);assert.equal(combatContext(playerView(s,0)).kind,'blocked');assert.equal(s.logs.some(l=>l.cue?.kind==='damage'),false)
})
test('axe forced-hit exposes matching respond options so two discards can be confirmed',()=>{
 let s=fixture(1);const [sha]=hand(s,1,'sha'),[shan]=hand(s,0,'shan');equipment(s,1,'axe');const spare=hand(s,1,'tao','shan')
 s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]});s=step(s,{type:'respond',ids:[shan.id]});const v=playerView(s,1)
 assert.equal(v.pending.kind,'axe');assert.equal(v.pending.as,'axe')
 const answer=v.legal.find(a=>a.type==='respond'&&(a.as||v.pending.as)==='axe'&&a.ids.length===2)
 assert.ok(answer,'axe respond option must match the pending as so confirm can enable')
 s=step(s,{type:'respond',ids:answer.ids,as:'axe'});assert.equal(s.players[0].hp,v.players[0].hp-1)
})
test('actual damage cues survive later healing and are not replayed by restore/render',()=>{
 let s=fixture(1);const [sha]=hand(s,1,'sha');s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]});const before=s
 s=step(s,{type:'pass'});const hits=damageCues(before,s);assert.equal(hits.length,1);assert.equal(hits[0].target,0);assert.equal(hits[0].source,1);assert.equal(hits[0].amount,1)
 assert.equal(damageCues(s,s).length,0);assert.equal(damageCues(s,restoreGame(s)).length,0)
 const healed=structuredClone(s);healed.players[0].hp++;assert.equal(damageCues(before,healed).length,1)
})
test('borrowed sword targets caster, holder supplies Sha and owns damage attribution',()=>{
 let s=fixture();const [borrow]=hand(s,0,'collateral');equipment(s,1,'qinggang');const [sha]=hand(s,1,'sha')
 assert.ok(playerView(s,0).legal.some(a=>a.as==='collateral'&&a.targets[0]===1&&a.targets[1]===0))
 s=step(s,{type:'play',as:'collateral',ids:[borrow.id],targets:[1,0]});let c=combatContext(playerView(s,0));assert.equal(c.kind,'command');assert.equal(c.source,1);assert.equal(c.target,0);assert.equal(c.commandedBy,0)
 s=step(s,{type:'respond',ids:[sha.id]});c=combatContext(playerView(s,0));assert.equal(c.kind,'attack');assert.equal(c.source,1);assert.equal(c.target,0)
 const before=s;s=step(s,{type:'pass'});assert.equal(damageCues(before,s)[0].source,1)
})
test('borrowed sword refusal gives weapon, not damage; reselection retains valid roles',()=>{
 let s=fixture();const [borrow]=hand(s,0,'collateral'),weapon=equipment(s,1,'qinggang');s=step(s,{type:'play',as:'collateral',ids:[borrow.id],targets:[1,0]});const before=s;s=step(s,{type:'pass'});assert.ok(s.players[0].hand.some(c=>c.id===weapon.id));assert.equal(damageCues(before,s).length,0)
 assert.deepEqual(collateralSelection([1,0],1),[]);assert.deepEqual(collateralSelection([1,0],0),[1]);assert.deepEqual(collateralSelection([1,0],2),[1,2]);assert.deepEqual(collateralSelection([1],0),[1,0])
})
test('duel and AOE Sha response is not mislabeled a regular Sha attack',()=>{
 for(const type of ['duel','savage','arrows']){let s=fixture(1);const [c]=hand(s,1,type);hand(s,0,type==='arrows'?'shan':'sha');s=step(s,{type:'play',as:type,ids:[c.id],targets:type==='duel'?[0]:[]});const context=combatContext(playerView(s,0));assert.equal(context.kind,type==='duel'?'duel':'aoe');assert.equal(context.source,1);assert.match(context.hint,/需出/)}
})
test('converted Sha remembers effective type without altering its physical card',()=>{
 let s=fixture();const [shan]=hand(s,0,'shan');s=step(s,{type:'play',as:'sha',ids:[shan.id],targets:[1]});assert.equal(s.lastPlayed.as,'sha');assert.equal(s.lastPlayed.cards[0].type,'shan');assert.ok(restoreGame(s))
})
test('private battle cues do not change classic default prompts or damage logs',()=>{
 const classic=createEngine({...catalog,trackBattle:false});const s=fixture(1),[c]=hand(s,1,'sha');let r=classic.dispatch(s,{seat:1,type:'play',as:'sha',ids:[c.id],targets:[0]});assert.ok(r.ok);assert.equal(classic.playerView(r.state,0).pending.context,undefined)
 r=classic.dispatch(r.state,{seat:0,type:'pass'});assert.ok(r.ok);assert.equal(r.state.logs.some(l=>l.cue?.kind==='damage'),false)
})
test('hand sizes 1..60 retain readable overlap; large hands explicitly scroll instead of compressing',()=>{
 for(const [width,height,landscape]of [[304,568,false],[370,844,false],[408,915,false],[493,375,true],[634,390,true],[1060,900,true]])for(let count=1;count<=60;count++){
  const l=handLayout({width,height,count,landscape});assert.ok(l.step>=l.cardWidth*.84,JSON.stringify(l));assert.equal(l.scroll,l.span>width+.01);assert.equal(l.rows,1)
 }
})
test('all cards retain thematic names and one fixed scale surface, never baseline aliases',()=>{
 const deck=makeDeck();for(const type of ['sha','shan']){const html=cardFace(deck.find(c=>c.type===type));assert.ok(html.includes('fs-basic-card'));assert.equal(html.includes('<img'),true);assert.match(html,/<strong>[杀闪]<\/strong>/)}
 for(const [type,name]of [['snatch','摄宝'],['nullify','破法'],['draw','天机显化']]){const html=cardFace(deck.find(c=>c.type===type));assert.ok(html.includes('fs-card-design'));assert.ok(html.includes(`<strong>${name}</strong>`));assert.equal(html.includes(CARDS_BY_TYPE[type].baseName),false)}
})
test('no-resource Sha/duel resolves immediately, but conversion, armor and aid are still choices',()=>{
 for(const type of ['sha','duel']){let s=fixture(1),[c]=hand(s,1,type);s=step(s,{type:'play',as:type,ids:[c.id],targets:[0]});const hp=s.players[0].hp;assert.equal(s.pending.kind,'response');s=advanceUnavailable(s,dispatch,playerView);assert.equal(s.players[0].hp,hp-1);assert.equal(s.pending,null)}
 let s=fixture(1),[c]=hand(s,1,'sha');hand(s,0,'sha');s=step(s,{type:'play',as:'sha',ids:[c.id],targets:[0]});assert.equal(advanceUnavailable(s,dispatch,playerView).pending.kind,'response','Longdan conversion must not be passed automatically')
 s=fixture(1);[c]=hand(s,1,'sha');equipment(s,0,'bagua');s=step(s,{type:'play',as:'sha',ids:[c.id],targets:[0]});assert.equal(advanceUnavailable(s,dispatch,playerView).pending.kind,'response','armor remains a valid response')
})
test('delayed judgment exposes the actual public card and pauses effects until acknowledgement',()=>{
 for(const [type,suit,rank,hit]of [['lightning','spade',5,true],['lightning','heart',4,false],['indulgence','club',5,true],['indulgence','heart',4,false]]){
  let s=fixture(4),[delay]=hand(s,0,type);s.players[0].hand.pop();s.players[0].judgment.push(delay)
  const index=s.deck.findIndex(c=>c.suit===suit&&c.rank===rank),judge=s.deck.splice(index,1)[0];s.deck.unshift(judge);const hp=s.players[0].hp
  s=step(s,{type:'end'});assert.equal(s.pending.kind,'reveal');assert.equal(s.pending.card.id,judge.id);assert.equal(s.pending.hit,hit);assert.equal(s.players[0].hp,hp);assert.ok(restoreGame(s));assert.equal(playerView(s,2).pending.card.id,judge.id)
  const invalid=structuredClone(s);invalid.pending.card.rank=14;assert.equal(restoreGame(invalid),null)
  const before=s;s=step(s,{type:'ack'});assert.equal(s.players[0].hp,hp-(type==='lightning'&&hit?3:0));assert.equal(s.current,type==='indulgence'&&hit?1:0)
  if(type==='lightning'&&!hit)assert.ok(s.players[1].judgment.some(c=>c.id===delay.id))
  assert.equal(dispatch(s,{type:'ack',seat:0,revision:before.revision,promptId:before.pending.id}).ok,false)
 }
})
test('default clock is 60 seconds; selections do not reset it and pause/hidden time does not count',()=>{
 let time=0;const c=new DecisionClock({now:()=>time});assert.equal(c.duration,60000);c.sync('play0',true);time=15000;c.sync('play0',true);assert.equal(c.seconds,45);c.sync('play0',false);time=90000;c.sync('play0',true);assert.equal(c.seconds,45);time+=45000;assert.equal(c.tick(),true);assert.equal(c.seconds,0);c.sync('response1',true);assert.equal(c.seconds,60)
})
test('music loops quietly, muted music stays paused and failed autoplay is harmless',async()=>{
 let plays=0,pauses=0;const a={loop:false,volume:1,play:async()=>{plays++},pause:()=>{pauses++},removeAttribute(){},load(){}}
 const m=new BackgroundMusic({createAudio:()=>a});assert.equal(await m.unlock(),true);assert.equal(a.loop,true);assert.equal(a.volume,.15);m.setEnabled(false);assert.equal(await m.unlock(),false);assert.equal(plays,1);assert.equal(pauses,1);m.destroy()
 const blocked=new BackgroundMusic({createAudio:()=>({...a,play:async()=>{throw Error('autoplay blocked')}})});assert.equal(await blocked.unlock(),false);blocked.destroy()
})
test('original hurt WAV is bounded PCM with a short non-silent waveform',async()=>{
 const w=await readFile(new URL('../site/.vuepress/components/fengshen/assets/audio/sfx/damage.wav',import.meta.url));assert.equal(w.toString('ascii',0,4),'RIFF');assert.equal(w.readUInt16LE(20),1);assert.equal(w.readUInt32LE(24),24000);assert.equal(w.readUInt16LE(34),16);assert.ok(w.length>10000&&w.length<20000);assert.ok(w.subarray(44).some(v=>v!==0))
})
test('hurt plays independently of speech; stop/mute cancels delayed effects',async()=>{
 let starts=0,resolveFetch;const sources=[];const context={sampleRate:24000,resume:async()=>{},createBuffer:()=>({}),decodeAudioData:async()=>({}),destination:{},close:async()=>{},createBufferSource(){const source={connect(){},disconnect(){},start(){starts++;setTimeout(()=>source.onended?.(),1)},stop(){source.onended?.()}};sources.push(source);return source}}
 const v=new CardVoice({createContext:()=>context,fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})});await v.unlock();const base=starts;assert.ok(await v.hurt(2));await new Promise(r=>setTimeout(r,8));assert.equal(starts,base+1);assert.equal(v.history.at(-1).key,'sfx-damage');assert.equal(v.history.at(-1).status,'played');v.destroy()
 const delayed=new CardVoice({createContext:()=>context,fetchAudio:()=>new Promise(r=>resolveFetch=r)});await delayed.unlock();const pending=delayed.hurt();await new Promise(r=>setTimeout(r,1));delayed.setEnabled(false);resolveFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)});const old=starts;assert.equal(await pending,false);assert.equal(starts,old);assert.equal(delayed.effects.size,0);delayed.destroy()
})
