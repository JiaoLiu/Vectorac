import {stableOpponents} from './fixtures/gods-stable.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {makeDeck} from '../site/.vuepress/components/fengshen/core/catalog.mjs'
import {createGame,createAssignedGame,dispatch,playerView,catalog,militaryCatalog,restoreGame} from '../site/.vuepress/components/fengshen/engine.mjs'
import {createEngine} from '../site/.vuepress/components/fengshen/core/engine.mjs'
import {targetLinks,judgmentMark,publicPicks,tutorialEnabled,responsePrompt,responderHighlight,responseSelection,counterSelection} from '../site/.vuepress/components/fengshen/table-visuals.mjs'
import {rescueEffects,discardEffects} from '../site/.vuepress/components/fengshen/draw-effects.mjs'
import {TargetBeams,BEAM_DURATION} from '../site/.vuepress/components/fengshen/target-beams.mjs'
import {renderCenter,renderBattle,renderOpponent,delayIcons} from '../site/.vuepress/components/fengshen/table.mjs'
import {hand} from './fixtures/sanguo.mjs'
import {readFile} from 'node:fs/promises'
function fixture(){const s=stableOpponents(createGame({heroId:'yangjian',role:'lord',seed:17}));s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null;for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}return s}
const cleanGame=heroId=>{const s=stableOpponents(createGame({heroId,role:'lord',seed:17}));s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null;for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}return s}
const fakeCard=(type,suit='spade',rank=9)=>({id:`fx-${type}-${suit}${rank}`,type,suit,rank})
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);return r.state}
const ui=(s,hints=true)=>({state:s,hints,paused:false,selected:[],targets:[],skill:null,choiceIndex:null,pace:650,header:()=>'',targetable:()=>[],matching:()=>[],currentAs:()=>null,equipment:()=>'',skills:()=>'',won:()=>false,pendingText:()=>''})
test('first visit has hints; disabling survives preference reads',()=>{assert.equal(tutorialEnabled(null),true);assert.equal(tutorialEnabled({}),true);assert.equal(tutorialEnabled({hints:false}),false);assert.equal(tutorialEnabled({hints:true}),true)})
test('target arrows represent attack and legal collateral self-target without text narration',()=>{
 let s=fixture(),[sha]=hand(s,0,'sha');hand(s,1,'shan');s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[1]});const v=playerView(s,0)
 assert.deepEqual(targetLinks(v),[{source:0,target:1}]);assert.deepEqual(targetLinks(v,{targets:[1,0],as:'collateral'}),[{source:0,target:1},{source:1,target:0}]);assert.equal(renderCenter(ui(s),v).includes('fs-battle-link'),false);assert.equal(responsePrompt(v),'请出闪')
})
test('disabled teaching suppresses selected card descriptions but keeps required response controls',()=>{
 let s=fixture(),[snatch]=hand(s,0,'snatch');hand(s,1,'shan');const model=ui(s,false);model.selected=[snatch.id]
 assert.equal(renderBattle(model).includes('摄宝：'),false);model.hints=true;assert.ok(renderBattle(model).includes('摄宝：'))
 const [sha]=hand(s,1,'sha');s.current=1;s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]});const html=renderBattle(ui(s,false));assert.ok(html.includes('请出闪'));assert.ok(html.includes('放弃'));assert.equal(html.includes('→ 杀 →'),false)
})
test('judgment check/cross means delayed effect applied/not applied, not user survival',()=>{
 assert.deepEqual(judgmentMark({hit:true}),{symbol:'✓',label:'判定生效',hit:true});assert.equal(judgmentMark({hit:false}).symbol,'×')
 const s=fixture(),v=playerView(s,0);for(const hit of [true,false]){v.pending={kind:'reveal',target:0,delayType:'indulgence',card:makeDeck()[0],hit};const html=renderCenter(ui(s),v);assert.ok(html.includes(`data-judge-hit="${hit}"`));assert.ok(html.includes(hit?'✓':'×'))}
 const p={judgment:[{type:'indulgence'},{type:'lightning'}],seat:0};assert.ok(delayIcons(p,{pending:null}).includes('data-delay="indulgence"'));assert.ok(delayIcons(p,{pending:null}).includes('aria-label="迷魂阵"'))
})
test('harvest choices are public for every observer and receipts retain exact chooser/card',()=>{
 let s=fixture(),[c]=hand(s,0,'harvest');s=step(s,{type:'play',as:'harvest',ids:[c.id],targets:[]});assert.equal(s.pending.kind,'pick');const chosen=s.harvestPool[0]
 assert.equal(playerView(s,4).harvestPool.length,5);s=step(s,{type:'choose',value:chosen.id});const v=playerView(s,0),picks=publicPicks(v);assert.equal(picks.length,1);assert.equal(picks[0].source,0);assert.equal(picks[0].card.id,chosen.id);assert.equal(v.harvestPool.length,4);assert.equal(v.players[1].hand.length,0)
 const center=renderCenter(ui(s),v);assert.ok(center.includes('data-picked-by="0"'));assert.ok(center.includes('杨戬'));assert.ok(center.includes('已选'));assert.ok(restoreGame(s))
})
test('classic harvest view/logs remain unchanged',()=>{
 const classic=createEngine({...catalog,trackBattle:false});let s=fixture(),[c]=hand(s,0,'harvest');let r=classic.dispatch(s,{seat:0,type:'play',as:'harvest',ids:[c.id],targets:[]});assert.ok(r.ok);s=r.state;r=classic.dispatch(s,{seat:0,type:'choose',value:s.harvestPool[0].id});assert.ok(r.ok);assert.equal(r.state.logs.some(l=>l.cue?.kind==='harvest-pick'),false);assert.equal(classic.playerView(r.state,0).harvestPool,undefined)
})
test('area attack draws every public living target, not only the current responder',()=>{
 let s=fixture(),[c]=hand(s,0,'arrows');hand(s,1,'shan');s=step(s,{type:'play',as:'arrows',ids:[c.id],targets:[]});const v=playerView(s,0),links=targetLinks(v);assert.equal(links.length,4);assert.ok(links.every(l=>l.source===0&&l.target!==0));assert.equal(new Set(links.map(l=>l.target)).size,4)
})
test('one area play expires at 2.5s even while counter/responders and revisions change',()=>{
 let time=0,s=fixture(),[c]=hand(s,0,'arrows');for(let i=1;i<5;i++)hand(s,i,'shan');const beams=new TargetBeams({now:()=>time})
 s=step(s,{type:'play',as:'arrows',ids:[c.id],targets:[]});beams.record(playerView(s,0));assert.equal(beams.frame(playerView(s,0)).links.length,4)
 time=1800;s=step(s,{type:'pass'});beams.record(playerView(s,0));assert.equal(beams.frame(playerView(s,0)).elapsed,1800)
 time=BEAM_DURATION;assert.deepEqual(beams.frame(playerView(s,0)).links,[])
 s=step(s,{type:'pass'});beams.record(playerView(s,0));assert.deepEqual(beams.frame(playerView(s,0)).links,[],'the next AOE recipient cannot restart beams')
 while(s.pending)s=step(s,{type:'pass'});beams.record(playerView(s,0));assert.deepEqual(beams.frame(playerView(s,0)).links,[],'settled-card fallback cannot restart beams')
})
test('Life Pact (jieyin) draws a healer-to-target beam for 2.5s without touching the public discard display',()=>{
 let time=0,s=stableOpponents(createGame({heroId:'isis',role:'lord',seed:17}));s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null;for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
 // 自己与目标都受伤，才能看出「哪 2 个加血了」；seat 1 刘备是男性，符合生命之契目标。
 s.players[0].hp--;s.players[1].hp--;const ids=[hand(s,0,'sha')[0].id,hand(s,0,'shan')[0].id]
 const beams=new TargetBeams({now:()=>time}),eventId=s.eventId
 s=step(s,{type:'skill',skill:'jieyin',ids,target:1})
 const v=playerView(s,0)
 // 黄线：结姻者 → 受伤男性，和杀一样 2.5s 后自动消失
 assert.deepEqual(targetLinks(v),[{source:0,target:1}])
 beams.record(v);assert.deepEqual(beams.frame(v).links,[{source:0,target:1}])
 time=BEAM_DURATION;assert.deepEqual(beams.frame(v).links,[])
 // 丢的 2 张牌展示照旧：仍进弃牌堆、仍发公开弃牌线索；连线只借 lastPlayed，不产出牌面
 assert.ok(ids.every(id=>s.discard.some(c=>c.id===id)))
 const cue=s.logs.find(l=>l.id>eventId&&l.cue?.kind==='discard-cue')?.cue
 assert.ok(cue);assert.deepEqual(cue.cards.map(c=>c.id).sort(),ids.slice().sort())
 assert.equal(v.lastPlayed.as,'jieyin');assert.equal(v.lastPlayed.cards.length,0);assert.equal(v.lastPlayed.virtualType,undefined)
 assert.ok(restoreGame(s))
})
test('slash/savage responses pre-select a literal normal card; converted responses stay manual',()=>{
 // 出杀：手里有普通闪就默认替玩家选中，但同一次询问内玩家改选不被覆盖
 let s=fixture(),[sha]=hand(s,1,'sha');const [shan]=hand(s,0,'shan');hand(s,0,'tao')
 s.current=1;s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]})
 let v=playerView(s,0)
 const first=responseSelection(v,null,[]),key=first.key
 assert.ok(key&&key.startsWith(`${v.revision}:`))
 assert.deepEqual(first.selected,[shan.id])
 const [tao]=v.players[0].hand.filter(c=>c.type==='tao')
 assert.deepEqual(responseSelection(v,key,[tao.id]).selected,[tao.id],'player change preserved within one query')
 // 万妖袭营（南蛮）：需要出杀，同样默认选中普通杀
 let s2=fixture(),[sav]=hand(s2,1,'savage');const [shaCard]=hand(s2,0,'sha');hand(s2,0,'shan')
 s2.current=1;s2=step(s2,{type:'play',as:'savage',ids:[sav.id],targets:[]})
 while(s2.pending&&s2.pending.actor!==0)s2=step(s2,{type:'pass'})
 assert.equal(s2.pending?.as,'sha');const v2=playerView(s2,0)
 assert.deepEqual(responseSelection(v2,null,[]).selected,[shaCard.id])
 // 磐影（青刚，黑桃当闪）：转化响应绝不代选，玩家须自己确认
 let s3=stableOpponents(createGame({heroId:'shiji',role:'lord',seed:17}));s3.deck=catalog.makeDeck();s3.discard=[];s3.processing=[];s3.harvestPool=[];s3.queue=[];s3.pending=null;s3.phase='play';s3.current=0;s3.logs=[];s3.lastPlayed=null;s3.lastEvent=null;for(const p of s3.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
 const spade=s3.deck.find(c=>c.type==='sha'&&c.suit==='spade');assert.ok(spade);s3.players[0].hand.push(spade)
 let s4=s3,[sha2]=hand(s4,1,'sha');s4.current=1;s4=step(s4,{type:'play',as:'sha',ids:[sha2.id],targets:[0]})
 const v3=playerView(s4,0)
 assert.ok(v3.legal.some(a=>a.type==='respond'&&a.ids.includes(spade.id)),'conversion is legal')
 assert.deepEqual(responseSelection(v3,null,[99]).selected,[99],'no pre-selection for suit conversions')
})
test('fire/thunder slash count as literal slashes; all suit conversions never pre-selected',()=>{
 // 需要杀：炎杀、雷杀物理上就是杀，与普通杀一样代选
 let s=cleanGame('isis'),[sav]=hand(s,1,'savage');const fire=fakeCard('firesha');s.players[0].hand.push(fire)
 s.current=1;s=step(s,{type:'play',as:'savage',ids:[sav.id],targets:[]})
 while(s.pending&&s.pending.actor!==0)s=step(s,{type:'pass'})
 assert.equal(s.pending?.as,'sha');let v=playerView(s,0)
 assert.ok(v.legal.some(a=>a.type==='respond'&&!a.guhuo&&a.ids.includes(fire.id)),'fire slash responds')
 assert.deepEqual(responseSelection(v,null,[]).selected,[fire.id])
 // 雷杀同理
 let s2=cleanGame('isis'),[sav2]=hand(s2,1,'savage');const thunder=fakeCard('thundersha');s2.players[0].hand.push(thunder)
 s2.current=1;s2=step(s2,{type:'play',as:'savage',ids:[sav2.id],targets:[]})
 while(s2.pending&&s2.pending.actor!==0)s2=step(s2,{type:'pass'})
 const v2=playerView(s2,0)
 assert.deepEqual(responseSelection(v2,null,[]).selected,[thunder.id])
 // 龙胆·杀当闪（杨戬）：只有杀时被杀，转化合法但绝不代选
 let s3=cleanGame('yangjian'),[atk]=hand(s3,1,'sha');const sla=fakeCard('sha','club');s3.players[0].hand.push(sla)
 s3.current=1;s3=step(s3,{type:'play',as:'sha',ids:[atk.id],targets:[0]})
 const v3=playerView(s3,0)
 assert.ok(v3.legal.some(a=>a.type==='respond'&&!a.guhuo&&a.ids.includes(sla.id)),'slash-as-dodge conversion is legal')
 assert.deepEqual(responseSelection(v3,null,[77]).selected,[77],'slash as dodge never pre-selected')
 // 龙胆·闪当杀（杨戬）＋武圣·红桃当杀（金吒）：万妖要杀时转化闪绝不代选
 let s4=cleanGame('yangjian'),[sav3]=hand(s4,1,'savage');const shan=fakeCard('shan');s4.players[0].hand.push(shan)
 s4.current=1;s4=step(s4,{type:'play',as:'savage',ids:[sav3.id],targets:[]})
 while(s4.pending&&s4.pending.actor!==0)s4=step(s4,{type:'pass'})
 const v4=playerView(s4,0)
 assert.ok(v4.legal.some(a=>a.type==='respond'&&!a.guhuo&&a.ids.includes(shan.id)),'dodge-as-slash conversion is legal')
 assert.deepEqual(responseSelection(v4,null,[88]).selected,[88],'dodge as slash never pre-selected')
 let s5=cleanGame('jinzha'),[sav4]=hand(s5,1,'savage');const red=fakeCard('shan','heart');s5.players[0].hand.push(red)
 s5.current=1;s5=step(s5,{type:'play',as:'savage',ids:[sav4.id],targets:[]})
 while(s5.pending&&s5.pending.actor!==0)s5=step(s5,{type:'pass'})
 const v5=playerView(s5,0)
 assert.ok(v5.legal.some(a=>a.type==='respond'&&!a.guhuo&&a.ids.includes(red.id)),'red-as-slash conversion is legal')
 assert.deepEqual(responseSelection(v5,null,[66]).selected,[66],'wusheng conversion never pre-selected')
})
test('AOE keeps nullify prompts for others; own response pre-select then own counter never clash',()=>{
 // 别人被无懈询问时不做杀/闪预选；自己出杀/闪预选后，轮到自己破法时由破法预选接管，二者互不覆盖
 let s=cleanGame('isis');hand(s,1,'savage');hand(s,2,'nullify')
 s.current=1;s=step(s,{type:'play',as:'savage',ids:[s.players[1].hand[0].id],targets:[]})
 while(s.pending&&s.pending.actor===0)s=step(s,{type:'pass'})
 if(s.pending?.kind==='counter'&&s.pending.actor!==0){
  const v=playerView(s,0)
  assert.equal(responseSelection(v,null,['kept']).key,null)
  assert.deepEqual(responseSelection(v,null,['kept']).selected,['kept'],'others\' nullify prompt never touches my selection')
 }
 // 自己持无懈：万妖先按座次问破法——自己被问时由破法预选接管，杀闪预选不干扰
 let s2=cleanGame('isis');const [sav5]=hand(s2,1,'savage');const [nullify]=hand(s2,0,'nullify');const [sha3]=hand(s2,0,'sha')
 s2.current=1;s2=step(s2,{type:'play',as:'savage',ids:[sav5.id],targets:[]})
 while(s2.pending&&s2.pending.actor!==0)s2=s2.pending.kind==='counter'?step(s2,{type:'decline'}):step(s2,{type:'pass'})
 if(s2.pending?.kind==='counter'){
  const v2=playerView(s2,0),own=counterSelection(v2,null,[])
  assert.deepEqual(own.selected,[nullify.id],'own nullify prompt pre-selects the nullify')
  assert.equal(responseSelection(v2,null,['kept']).key,null,'counter moment has no slash/dodge pre-select')
  s2=step(s2,{type:'decline'})
 }
 // 破法问完轮到自己出杀响应（万妖要杀）：杀闪预选接管
 while(s2.pending&&s2.pending.actor!==0)s2=step(s2,{type:'pass'})
 assert.equal(s2.pending?.kind,'response');assert.equal(s2.pending?.as,'sha')
 const v2=playerView(s2,0),sel=responseSelection(v2,null,[])
 assert.deepEqual(sel.selected,[sha3.id],'own slash/dodge prompt pre-selects first')
 assert.equal(counterSelection(v2,null,[]).key,null,'while responding there is no counter prompt to hijack')
})
test('new play gets a fresh lifetime, but restore/render never replays old connections',()=>{
 let time=0,s=fixture(),[c]=hand(s,0,'arrows');const beams=new TargetBeams({now:()=>time});s=step(s,{type:'play',as:'arrows',ids:[c.id],targets:[]});while(s.pending)s=step(s,{type:'pass'});let v=playerView(s,0)
 assert.deepEqual(beams.frame(v).links,[],'no animation before an action is observed');beams.record(v);time=3000;assert.deepEqual(beams.frame(v).links,[])
 const [next]=hand(s,0,'snatch');hand(s,1,'sha');s=step(s,{type:'play',as:'snatch',ids:[next.id],targets:[1]});v=playerView(s,0);beams.record(v);assert.deepEqual(beams.frame(v).links,[{source:0,target:1}]);assert.equal(beams.frame(v).elapsed,0)
 beams.clear();assert.deepEqual(beams.frame(v).links,[],'restoring a game clears transient animations')
 beams.restore(v);beams.record(v);assert.deepEqual(beams.frame(v).links,[],'first resumed response cannot replay the saved play')
})
test('live aim is independent of expired effect beams and never reactivates them',()=>{
 let time=0,s=fixture(),[c]=hand(s,0,'arrows');const beams=new TargetBeams({now:()=>time});s=step(s,{type:'play',as:'arrows',ids:[c.id],targets:[]});while(s.pending)s=step(s,{type:'pass'});const v=playerView(s,0);beams.record(v);time=9000
 assert.deepEqual(beams.frame(v,{targets:[2],as:'sha'}).links,[{source:0,target:2}]);assert.equal(beams.frame(v,{targets:[2],as:'sha'}).preview,true)
 assert.deepEqual(beams.frame(v,{targets:[],as:'sha'}).links,[]);assert.deepEqual(beams.frame(v).links,[])
})
test('borrowed-sword two links share one lifetime across counter, holder response and settlement',()=>{
 let time=0,s=fixture(),[c]=hand(s,0,'collateral');const [w]=hand(s,1,'qinggang');s.players[1].hand.pop();s.players[1].equip.weapon=w;hand(s,1,'sha');hand(s,2,'nullify');const beams=new TargetBeams({now:()=>time})
 s=step(s,{type:'play',as:'collateral',ids:[c.id],targets:[1,2]});beams.record(playerView(s,0));assert.equal(beams.frame(playerView(s,0)).links.length,2);time=3000
 for(let i=0;i<8&&s.pending?.kind==='counter';i++){s=step(s,{type:'pass'});beams.record(playerView(s,0))}assert.equal(s.pending.kind,'response');assert.deepEqual(beams.frame(playerView(s,0)).links,[])
 s=step(s,{type:'pass'});beams.record(playerView(s,0));assert.deepEqual(beams.frame(playerView(s,0)).links,[])
})
test('after an area trick settles, aiming a new Slash clears the old all-player links until a target is picked',()=>{
 let s=fixture(),[arrows]=hand(s,0,'arrows');hand(s,0,'sha');for(let i=1;i<5;i++)hand(s,i,'shan');s=step(s,{type:'play',as:'arrows',ids:[arrows.id],targets:[]});for(let i=0;i<20&&s.pending;i++)s=step(s,{type:'pass'});assert.equal(s.pending,null);assert.equal(playerView(s,0).lastPlayed.as,'arrows')
 const v=playerView(s,0)
 // 挑牌中（as 已知）但未点目标：不得回退显示上一张群体牌的全体连线，否则一张杀看起来能打所有人。
 assert.deepEqual(targetLinks(v,{targets:[],as:'sha'}),[])
 assert.deepEqual(targetLinks(v,{targets:[1],as:'sha'}),[{source:0,target:1}])
})
test('collateral exposes the victim at counter time and keeps both links through every stage',()=>{
 let s=fixture(),[c]=hand(s,0,'collateral');const [w]=hand(s,1,'qinggang');s.players[1].hand.pop();s.players[1].equip.weapon=w;hand(s,1,'sha');hand(s,2,'nullify')
 s=step(s,{type:'play',ids:[c.id],as:'collateral',targets:[1,2]});assert.equal(s.pending.kind,'counter')
 const v0=playerView(s,0);assert.equal(v0.pending.victim,2,'无懈询问阶段须暴露被杀目标，玩家才能决定要不要出破法')
 assert.deepEqual(targetLinks(v0),[{source:0,target:1},{source:1,target:2}],'无懈询问阶段即画借刀者→持刀者、持刀者→被杀目标双线')
 for(let i=0;i<8&&s.pending?.kind==='counter';i++)s=step(s,{type:'pass'})
 assert.equal(s.pending?.kind,'response');const v1=playerView(s,0);assert.equal(v1.pending.context.type,'collateral')
 assert.deepEqual(targetLinks(v1),[{source:0,target:1},{source:1,target:2}],'持刀者响应阶段保持双线')
 s=step(s,{type:'pass'});assert.equal(s.pending,null,'持刀者放弃出杀后交出武器')
 const v2=playerView(s,0);assert.equal(v2.lastPlayed.as,'collateral');assert.equal(v2.players[0].hand.length,1,'武器应交予借刀者')
 assert.deepEqual(targetLinks(v2),[{source:0,target:1},{source:1,target:2}],'结算尾迹保持双线')
})
test('collateral/lijian target picks get order badges naming each combat role',()=>{
 const s=fixture(),v=playerView(s,0)
 const blade=ui(s);blade.currentAs=()=>'collateral';blade.targets=[1,2]
 assert.ok(renderOpponent(blade,v.players[1],v).includes('>持刀</b>'));assert.ok(renderOpponent(blade,v.players[2],v).includes('>被杀</b>'))
 blade.targets=[1,0];assert.ok(renderBattle(blade).includes('>被杀</b>'),'自己作为被杀目标也有徽章')
 const lijian=ui(s);lijian.skill='lijian';lijian.targets=[1,2]
 assert.ok(renderOpponent(lijian,v.players[1],v).includes('>决斗</b>'));assert.ok(renderOpponent(lijian,v.players[2],v).includes('>先出杀</b>'))
 const plain=ui(s);plain.targets=[1];assert.ok(!renderOpponent(plain,v.players[1],v).includes('fs-target-seq'),'普通出牌无顺序徽章')
})
test('recipient prompts do not intercept taps; interactive card-selection panels remain separate',async()=>{
 const s=fixture(),model=ui(s),v=playerView(s,0)
 for(const kind of ['yiji','liuli','tuxi']){v.pending={id:1,actor:0,kind};assert.ok(renderCenter(model,v).includes('fs-skill-prompt'))}
 const css=await readFile(new URL('../site/.vuepress/components/fengshen/arena-table.css',import.meta.url),'utf8');assert.match(css,/\.fs-center-choice\.fs-skill-prompt\{pointer-events:none/)
})
test('yiji pool renders as a private flip-card dialog for the owner and card backs for everyone else',()=>{
 const s=fixture(),model=ui(s),v=playerView(s,0)
 v.pending={id:1,kind:'yiji',actor:0,count:2};v.yijiPool=[{id:'t1',type:'sha',suit:'spade',rank:7},{id:'t2',type:'shan',suit:'heart',rank:3}]
 const own=renderCenter(model,v)
 assert.ok(own.includes('fs-yiji-choice')&&own.includes('data-yiji-card="t1"')&&own.includes('data-yiji-card="t2"')&&own.includes('原有手牌不能送出'))
 // 选好牌后牌池保持可见，可继续多选；接收者做进面板内，配合确认一次性把多张牌交给同一人。
 model.selected=['t1','t2'];model.targets=[];model.targetable=()=>[1,2];const multi=renderCenter(model,v)
 assert.ok(multi.includes('data-yiji-card="t1"')&&multi.includes('data-yiji-card="t2"'),'多选后牌池列表仍可见')
 assert.ok(multi.includes('fs-yiji-targets')&&multi.includes('data-action="target"')&&!multi.includes('data-action="target" data-value="0"'),'面板内选择接收者且不把自己列为接收者')
 assert.ok(multi.includes('已选 2 张'),'提示已选张数')
 model.targets=[2];const chose=renderCenter(model,v);assert.ok(chose.includes('已选 2 张 → '),'选好接收者后提示去向')
 const other=renderCenter(model,{...v,yijiPool:undefined,pending:{...v.pending,actor:1}})
 // 他人传道不再显示暗牌背（会被窄面板裁断且无信息量），只留等待提示；给牌靠飞牌动画表达。
 assert.ok(other.includes('fs-yiji-wait')&&other.includes('等待')&&!other.includes('fs-yiji-back')&&!other.includes('data-yiji-card'))
})
test('skill virtual Duel is illustrated without forged suit or rank; opponent cannot see Guanxing pool',()=>{
 const s=fixture(),model=ui(s),v=playerView(s,0);v.lastPlayed={id:1,source:0,targets:[1,2],as:'duel',cards:[],virtualType:'duel',label:'魅惑'}
 const html=renderCenter(model,v);assert.ok(html.includes('data-type="duel"'));assert.ok(html.includes('无实体花色点数'));assert.ok(html.includes('class="fs-rank"><i></i>'))
 v.pending={id:2,actor:1,kind:'guanxing'};v.legal=[];const concealed=renderCenter(model,v);assert.ok(concealed.includes('不能查看'));assert.equal(concealed.includes('data-type='),false)
})
test('dying rescue emits a public cue naming who saves whom, so the animation can show the peach source',()=>{
 let s=fixture();s.current=1;s.players[0].hp=1
 const [sha]=hand(s,1,'sha'),[tao]=hand(s,2,'tao')
 s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]});s=step(s,{type:'pass'});assert.equal(s.pending.kind,'rescue');assert.equal(s.pending.actor,2)
 const before=s;s=step(s,{type:'respond',ids:[tao.id]})
 const eff=rescueEffects(before,s)
 assert.equal(eff.length,1);assert.equal(eff[0].source,2);assert.equal(eff[0].target,0);assert.equal(eff[0].card.type,'tao');assert.equal(s.players[0].hp,1)
 assert.ok(s.logs.some(l=>l.cue?.kind==='rescue-heal'&&l.cue.source===2&&l.cue.target===0))
})
test('public discard is shown inline on the table with its faces, then auto-dismisses',()=>{
 let s=fixture();s.current=1;s.players[1].maxHp=2;s.players[1].hp=2
 for(let i=0;i<5;i++)hand(s,1,'sha')
 s=step(s,{type:'end'});assert.equal(s.pending.kind,'discard');assert.equal(s.pending.count,3)
 const before=s;s=step(s,{type:'discard',ids:s.players[1].hand.slice(0,3).map(c=>c.id)})
 const eff=discardEffects(before,s)
 assert.equal(eff.length,1);assert.equal(eff[0].seat,1);assert.equal(eff[0].cards.length,3)
 // 牌面公开：任何视角都能看到弃了什么牌（进入弃牌堆的牌本就公开）。
 assert.equal(playerView(s,0).logs.find(l=>l.cue?.kind==='discard-cue').cue.cards.length,3)
 const model=ui(s);model.discards={seat:1,cards:eff[0].cards}
 const html=renderCenter(model,playerView(s,0))
 // 内联在牌桌中间一行，不再是单独的弹窗（不需要点击关闭）。
 assert.ok(html.includes('fs-public-discard')&&html.includes('fs-discard-card'))
 assert.equal(html.includes('fs-center-choice'),false)
 assert.equal(html.includes('fs-discard-show'),false)
})
test('dismantle exposes the discarded card publicly; snatch keeps the hand card hidden',()=>{
 // 拆牌：被拆掉的牌公开，任何视角可见。
 let s=fixture(),[dm]=hand(s,0,'dismantle');hand(s,1,'sha')
 s=step(s,{type:'play',as:'dismantle',ids:[dm.id],targets:[1]});assert.equal(s.pending.kind,'take')
 const before=s;s=step(s,{type:'choose',value:playerView(s,s.pending.actor).legal[0].value})
 const eff=discardEffects(before,s)
 assert.equal(eff.length,1);assert.equal(eff[0].seat,1);assert.equal(eff[0].by,0);assert.equal(eff[0].cards.length,1)
 assert.equal(playerView(s,2).logs.find(l=>l.cue?.kind==='discard-cue').cue.cards.length,1)
 // 偷牌：取走的是暗手牌，不公开，不发弃置线索。
 let t=fixture(),[sn]=hand(t,0,'snatch');hand(t,1,'sha')
 t=step(t,{type:'play',as:'snatch',ids:[sn.id],targets:[1]})
 const beforeT=t;t=step(t,{type:'choose',value:playerView(t,t.pending.actor).legal[0].value})
 assert.equal(discardEffects(beforeT,t).length,0)
 assert.equal(t.logs.filter(l=>l.id>beforeT.eventId).some(l=>l.cue?.kind==='discard-cue'),false)
})
test('a fallen player lays their whole hand on the table so everyone can see it',()=>{
 let s=fixture();s.current=1;s.players[0].hp=1
 const [a]=hand(s,0,'sha'),[b]=hand(s,0,'snatch') // 无闪，无法自救，也无人持桃
 const [sha]=hand(s,1,'sha')
 s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]})
 const before=s;s=step(s,{type:'pass'})
 assert.equal(s.players[0].alive,false,'0 号席因伤害阵亡')
 const eff=discardEffects(before,s),cue=playerView(s,0).logs.find(l=>l.cue?.kind==='discard-cue')?.cue
 // 阵亡后手牌全部弃置是公开信息：必须摆到牌桌中央让所有人看清。
 assert.equal(eff.length,1);assert.equal(eff[0].seat,0,`${eff.length}`)
 assert.equal(eff[0].cards.length,2)
 assert.ok(cue);assert.equal(cue.seat,0)
 assert.deepEqual(cue.cards.map(c=>c.id).sort(),[a.id,b.id].sort())
})
test('passive responder highlight targets real choices only, never pure public reveals',()=>{
 const base={seat:0,current:2,players:[],extension:null}
 // 真抉择：出杀闪、五谷选牌、借刀响应等——高亮该玩家
 for(const pending of [{kind:'response',actor:3},{kind:'pick',actor:3},{kind:'ext',actor:3}])
  assert.equal(responderHighlight({...base,pending}),3,`${pending.kind} 应高亮`)
 // 破法（无懈）询问是私密信息：绝不公开高亮持无懈者，否则全场据此推断身份；本人屏幕仍可提示。
 assert.equal(responderHighlight({...base,pending:{kind:'counter',actor:3}}),null)
 assert.equal(responderHighlight({...base,pending:{kind:'counter',actor:0}}),0)
 // 濒死求桃逐个私下询问：公开高亮等于告诉全场谁手里有桃，涉及记牌与后续计算，一律不亮。
 assert.equal(responderHighlight({...base,pending:{kind:'rescue',actor:3}}),null)
 // 变法改判的等待者走 fs-replace-focus 淡黄标记，不再叠响应黄框。
 assert.equal(responderHighlight({...base,pending:{kind:'judge-replace',actor:3}}),null)
 // 纯公开展示：判定翻开、ext 展示阶段——不高亮（否则两人轮流闪黄框）
 assert.equal(responderHighlight({...base,pending:{kind:'reveal',actor:3}}),null)
 assert.equal(responderHighlight({...base,pending:{kind:'ext',actor:3},extension:{stage:'reveal'}}),null)
 // 当前回合玩家保持蓝绿 turn-active，不被泛黄覆盖
 assert.equal(responderHighlight({...base,pending:{kind:'response',actor:2}}),null)
 assert.equal(responderHighlight({...base,pending:null}),null)
})
test('turn, judgment, judge-replace and dying keep distinct cues without an extra yellow ring',async()=>{
 const css=await readFile(new URL('../site/.vuepress/components/fengshen/arena-table.css',import.meta.url),'utf8')
 // 判定中的角色同时就是当前回合者：判定内发光改用蓝绿，不再在蓝绿边框外再叠一圈黄。
 assert.match(css,/\.fs-playing \.fs-judging\{box-shadow:inset 0 0 0 3px #77ffdc/)
 // 变法改判的等待者用更淡的黄色内发光，与"该出杀闪"的响应黄框区分开。
 assert.match(css,/\.fs-playing \.fs-replace-focus\{box-shadow:inset 0 0 0 4px #ffe9b0/)
 // 濒死角色用红色状态框公开提示；被询问的救援者不在此高亮（见 responderHighlight）。
 assert.match(css,/\.fs-dying\{border:3px solid #ff7a6d/)
})
test('濒死救援提示写明转化来源，琼浆救不了别人',()=>{
 const fixture=hero0=>{const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:[hero0,'nezha','dixin','jinling','kongxuan'],seed:23,deckVersion:2});s.deck=militaryCatalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=1;s.turns=1;s.lastPlayed=null;s.lastResponse=null;s.exchange=null;s.publicReveal=null;s.logs=[];for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp;p.alive=true}return s}
 const give=(s,seat,type,suit)=>{const i=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit));assert.ok(i>=0,`牌堆缺 ${type} ${suit||''}`);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
 const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,r.error);return r.state}
 // 3 号位被打到濒死，等救援询问轮到自己（手里只有一张琼浆）
 const dying=(hero0,suit)=>{let s=fixture(hero0);give(s,0,'wine',suit);const attack=give(s,1,'sha');s.players[2].hp=1;s=step(s,{type:'play',as:'sha',ids:[attack.id],targets:[2]});s=step(s,{type:'pass'});while(s.pending?.kind==='rescue'&&s.pending.actor!==0)s=step(s,{type:'pass'});return s}
 const asked=s=>s.pending?.kind==='rescue'&&s.pending.actor===0
 // 无转化技能：只有一张琼浆时压根轮不到救别人（琼浆只能自救）
 assert.equal(asked(dying('jifa')),false,'只有一张琼浆的普通人不会被询问救别人')
 // 妖言（扣置任意手牌假冒仙桃）：提示点明是声明假冒，不是琼浆在救人
 let s=dying('shengongbao');assert.ok(asked(s),'妖言持有琼浆会被询问救援');assert.ok(responsePrompt(playerView(s,0)).includes('可扣置一张手牌假冒'),'妖言救援提示写明假冒来源: '+responsePrompt(playerView(s,0)))
 // 急救（红色牌当桃）：提示点明是急救红牌转化，不是琼浆在救人
 s=dying('taiyi','diamond');assert.ok(asked(s),'急救持有红琼浆会被询问救援');assert.ok(responsePrompt(playerView(s,0)).includes('可用红色牌当仙桃救援'),'急救救援提示写明转化来源: '+responsePrompt(playerView(s,0)))
 // 黑琼浆对急救无效（非红牌），仍不询问
 assert.equal(asked(dying('taiyi','spade')),false,'黑琼浆不能触发急救救援')
 // 手里有真仙桃时保持原本的直白文案，不提技能转化
 let s2=fixture('taiyi');give(s2,0,'tao');const atk=give(s2,1,'sha');s2.players[2].hp=1;s2=step(s2,{type:'play',as:'sha',ids:[atk.id],targets:[2]});s2=step(s2,{type:'pass'});while(s2.pending?.kind==='rescue'&&s2.pending.actor!==0)s2=step(s2,{type:'pass'});const prompt=responsePrompt(playerView(s2,0));assert.ok(prompt.includes('是否使用仙桃救援'),'真仙桃救援保持直白文案: '+prompt);assert.equal(prompt.includes('用红色牌当'),false)
})
