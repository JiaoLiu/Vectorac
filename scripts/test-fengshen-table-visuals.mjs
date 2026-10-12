import {stableOpponents} from './fixtures/gods-stable.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {makeDeck} from '../.private/fengshen/core/catalog.mjs'
import {createGame,dispatch,playerView,catalog,restoreGame} from '../.private/fengshen/engine.mjs'
import {createEngine} from '../.private/fengshen/core/engine.mjs'
import {targetLinks,judgmentMark,publicPicks,tutorialEnabled,responsePrompt,responderHighlight} from '../.private/fengshen/table-visuals.mjs'
import {rescueEffects,discardEffects} from '../.private/fengshen/draw-effects.mjs'
import {TargetBeams,BEAM_DURATION} from '../.private/fengshen/target-beams.mjs'
import {renderCenter,renderBattle,renderOpponent,delayIcons} from '../.private/fengshen/table.mjs'
import {hand} from './fixtures/sanguo.mjs'
import {readFile} from 'node:fs/promises'
function fixture(){const s=stableOpponents(createGame({heroId:'yangjian',role:'lord',seed:17}));s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null;for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}return s}
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
 const css=await readFile(new URL('../.private/fengshen/arena-table.css',import.meta.url),'utf8');assert.match(css,/\.fs-center-choice\.fs-skill-prompt\{pointer-events:none/)
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
 // 真抉择：出杀闪、五谷选牌、濒死求桃、借刀响应、拼点——高亮该玩家
 for(const pending of [{kind:'response',actor:3},{kind:'pick',actor:3},{kind:'rescue',actor:3},{kind:'ext',actor:3}])
  assert.equal(responderHighlight({...base,pending}),3,`${pending.kind} 应高亮`)
 // 破法（无懈）询问是私密信息：绝不公开高亮持无懈者，否则全场据此推断身份；本人屏幕仍可提示。
 assert.equal(responderHighlight({...base,pending:{kind:'counter',actor:3}}),null)
 assert.equal(responderHighlight({...base,pending:{kind:'counter',actor:0}}),0)
 // 纯公开展示：判定翻开、ext 展示阶段——不高亮（否则两人轮流闪黄框）
 assert.equal(responderHighlight({...base,pending:{kind:'reveal',actor:3}}),null)
 assert.equal(responderHighlight({...base,pending:{kind:'ext',actor:3},extension:{stage:'reveal'}}),null)
 // 当前回合玩家保持蓝绿 turn-active，不被泛黄覆盖
 assert.equal(responderHighlight({...base,pending:{kind:'response',actor:2}}),null)
 assert.equal(responderHighlight({...base,pending:null}),null)
})
