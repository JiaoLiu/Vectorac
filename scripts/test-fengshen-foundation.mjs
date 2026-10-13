import test from 'node:test'
import assert from 'node:assert/strict'
import {createAssignedGame,dispatch,playerView,restoreGame,allCards,catalog,militaryCatalog,hasSkill,distance,chooseAI} from '../.private/fengshen/engine.mjs'
import {createEngine} from '../.private/fengshen/core/engine.mjs'
import {HEROES,PLAYABLE_HEROES,skillHelp} from '../.private/fengshen/theme.mjs'
import {extensionAction,viewDistance} from '../.private/fengshen/extension-actions.mjs'
import {extensionPopup} from '../.private/fengshen/extension-table.mjs'
const E=createEngine(catalog),ids=['luoxuan','nanji','yangren','zhangkui','juliusun','yinjiao','laozi']
function fixture(hero,others=['jifa','nezha','yangjian','jinling'],current=0,deckVersion=1){
 const s=createAssignedGame({heroIds:[hero,...others],roles:['lord','loyal','rebel','rebel','renegade'],seed:23,deckVersion})
 s.deck=(deckVersion===2?militaryCatalog:catalog).makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.logs=[];s.turnIsExtra=false
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.hp=p.maxHp=catalog.HERO_BY_ID[p.heroId].hp+(p.role==='lord'?1:0);p.marks={sha:0};p.alive=true;delete p.persistent;delete p.gainedSkills;delete p.incarnation;delete p.fieldPile;delete p.maxHpLoss;delete p.faceDown}
 return s
}
function card(s,seat,type,suit,rank){const i=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit)&&(!rank||c.rank===rank));assert.ok(i>=0,type);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
function equip(s,seat,type){const c=card(s,seat,type);s.players[seat].hand.pop();s.players[seat].equip[catalog.CARDS[type].slot]=c;return c}
function top(s,suit){const i=s.deck.findIndex(c=>c.suit===suit);const c=s.deck.splice(i,1)[0];s.deck.unshift(c);return c}
function step(s,a){const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,r.error+' '+JSON.stringify(a));const count=s.deckVersion===2?160:108;assert.equal(allCards(r.state).length,count);assert.equal(new Set(allCards(r.state).map(c=>c.id)).size,count);assert.ok(restoreGame(r.state),'save '+JSON.stringify(r.state.pending));return r.state}
const invoke=(s,a={})=>step(s,{type:'invoke',value:s.pending.stage==='reveal'?'ack':s.pending.spec?'confirm':'yes',...a}),pass=s=>step(s,{type:'pass'}),ack=s=>step(s,{type:'ack'})
function phase(s,type,seat=0){s.current=seat;s.phase='resolve';s.queue=[{type,seat},...(type==='drawPhase'?[{type:'playPhase',seat}]:[])];E.settle(s);assert.ok(restoreGame(s),'initial phase save '+type);return s}
function slash(s,c,target){return step(s,{type:'play',as:'sha',ids:[c.id],targets:[target]})}
test('all five foundation packs have complete original rosters: 57 foundation plus seven additional profiles',()=>{
 assert.equal(PLAYABLE_HEROES.length,64)
 for(const [pack,count]of [['standard',25],['wind',8],['fire',8],['forest',8],['mountain',8]])assert.equal(HEROES.filter(h=>h.sourcePack===pack&&h.playable).length,count)
 for(const id of ids){const h=HEROES.find(h=>h.id===id);assert.ok(h.playable);for(const skill of Object.keys(h.skillNames))assert.ok(!skillHelp(h,skill).includes('待接入'))}
})
test('Jiuchi only converts spade hand cards, enforces Wine use limit, and restores converted play',()=>{
 let s=fixture('luoxuan');const spade=card(s,0,'sha','spade'),heart=card(s,0,'sha','heart');equip(s,0,'bow')
 assert.ok(playerView(s,0).legal.some(a=>a.as==='wine'&&a.ids[0]===spade.id));assert.ok(!playerView(s,0).legal.some(a=>a.as==='wine'&&a.ids[0]===heart.id))
 s=step(s,{type:'play',as:'wine',ids:[spade.id],targets:[]});assert.equal(s.players[0].marks.wine,1);assert.ok(!playerView(s,0).legal.some(a=>a.as==='wine'))
})
test('Roulin requires two sequential Dodges against a woman and from a female attacker',()=>{
 for(const reverse of [false,true]){let s=fixture('luoxuan',['jinling','nezha','yangjian','jifa'],reverse?1:0);const attacker=reverse?1:0,target=reverse?0:1,a=card(s,attacker,'sha'),d1=card(s,target,'shan'),d2=card(s,target,'shan'),hp=s.players[target].hp;s=slash(s,a,target);assert.equal(s.pending.remaining,2);s=step(s,{type:'respond',ids:[d1.id]});assert.equal(s.pending.remaining,1);s=step(s,{type:'respond',ids:[d2.id]});assert.equal(s.players[target].hp,hp)}
})
test('Double Dodge demands two Dodges: the AI keeps its only Dodge instead of wasting it',()=>{
 // 无双/肉林要求连续两张闪：手里凑不出这么多张时，打出的闪也是白发，AI 应放弃并留牌。
 let s=fixture('luoxuan',['jinling','nezha','yangjian','jifa']);const a=card(s,0,'sha');card(s,1,'shan')
 s=slash(s,a,1);assert.equal(s.pending.as,'shan');assert.equal(s.pending.remaining,2)
 assert.equal(playerView(s,1).legal.filter(o=>o.type==='respond').length,1)
 assert.equal(chooseAI(playerView(s,1)).type,'pass')
 // 手里凑够两张闪时正常打出。
 let t=fixture('luoxuan',['jinling','nezha','yangjian','jifa']);const at=card(t,0,'sha');card(t,1,'shan');card(t,1,'shan')
 t=slash(t,at,1);assert.equal(t.pending.remaining,2)
 assert.equal(chooseAI(playerView(t,1)).type,'respond')
})
test('Benghuai has a mandatory HP/max-HP choice only when another living player has lower HP',()=>{
 let s=fixture('luoxuan');s.players[0].hp=5;s=phase(s,'turnEnd');assert.equal(s.pending.skill,'benghuai');assert.equal(dispatch(s,{seat:0,type:'pass',promptId:s.pending.id}).ok,false);s=invoke(s,{value:'maxhp'});assert.equal(s.players[0].maxHp,8);assert.equal(s.players[0].maxHpLoss,1)
 s=fixture('luoxuan');s.players[0].hp=2;s=phase(s,'turnEnd');assert.ok(s.pending?.skill!=='benghuai')
})
test('Baonue asks the damaging ally, uses final spade judgment and heals the living lord',()=>{
 let s=fixture('luoxuan',['huangfeihu','nezha','yangjian','jinling'],1);s.players[0].hp=5;const a=card(s,1,'sha');top(s,'spade');s=slash(s,a,2);s=pass(s);assert.equal(s.pending.skill,'baonue');assert.equal(s.pending.actor,1);s=invoke(s);assert.equal(s.pending.delayType,'baonue');assert.equal(s.pending.hit,true);s=ack(s);assert.equal(s.players[0].hp,6)
})
test('Xiangle rejects equipment costs, cancels free Slash and permits a paid basic-card Slash',()=>{
 let s=fixture('nanji',undefined,1),a=card(s,1,'sha'),equipment=card(s,1,'bow'),basic=card(s,1,'tao'),hp=s.players[0].hp;s=slash(s,a,0);assert.equal(s.pending.skill,'xiangle');assert.equal(dispatch(s,{seat:1,type:'invoke',value:'confirm',ids:[equipment.id],promptId:s.pending.id}).ok,false)
 const v=playerView(s,1);assert.equal(extensionAction(v,{selected:[equipment.id],targets:[]}),null);s=invoke(s,{ids:[basic.id]});s=pass(s);assert.equal(s.players[0].hp,hp-1)
 s=fixture('nanji',undefined,1);a=card(s,1,'sha');hp=s.players[0].hp;s=slash(s,a,0);assert.equal(s.players[0].hp,hp);assert.equal(s.pending,null)
})
test('Fangquan pays after discard and inserts one extra turn before the original next seat',()=>{
 let s=fixture('nanji');card(s,0,'sha');s=phase(s,'playPhase');assert.equal(s.pending.skill,'fangquan');s=invoke(s);assert.equal(s.pending.stage,'gift');s=invoke(s,{ids:[s.players[0].hand[0].id],target:2});assert.equal(s.current,2);assert.equal(s.turnIsExtra,true);s=step(s,{type:'end'});assert.equal(s.current,1);assert.equal(s.turnIsExtra,false)
})
test('Ruoyu awakens once at tied lowest HP and grants lord support with max-HP increase',()=>{
 let s=fixture('nanji');s.players[0].hp=3;s=phase(s,'turnPrepare');assert.equal(s.players[0].persistent.ruoyu,true);assert.equal(s.players[0].maxHp,5);assert.equal(s.players[0].hp,4);assert.ok(hasSkill(s.players[0],'jijiang'));assert.ok(restoreGame(s))
})
test('a face-down Fangquan recipient turns upright, skips only the extra turn and returns to the scheduled normal seat',()=>{
 let s=fixture('nanji');card(s,0,'sha');s.players[2].faceDown=true;s=phase(s,'playPhase');s=invoke(s);s=invoke(s,{ids:[s.players[0].hand[0].id],target:2});assert.equal(s.players[2].faceDown,false);assert.equal(s.current,1);assert.equal(s.extraTurnReturn,undefined)
})
test('Tuntian does not trigger on own-turn loss or loss from the judgment area',()=>{
 let s=fixture('juliusun');const c=card(s,0,'sha');s=slash(s,c,1);s=pass(s);assert.ok(s.pending?.skill!=='tuntian')
 s=fixture('juliusun',undefined,1);const delay=card(s,0,'indulgence');s.players[0].hand.pop();s.players[0].judgment.push(delay);const take=card(s,1,'dismantle');s=step(s,{type:'play',as:'dismantle',ids:[take.id],targets:[0]});s=step(s,{type:'choose',value:delay.id});assert.ok(s.pending?.skill!=='tuntian')
})
test('Tiaoxin refusal discards the challenged card, acceptance performs an actual Slash and spends it once',()=>{
 let s=fixture('yangren'),held=card(s,1,'shan');s=step(s,{type:'skill',skill:'tiaoxin',target:1});s=pass(s);assert.equal(s.pending.kind,'take');s=step(s,{type:'choose',value:'hand:0'});assert.ok(s.discard.some(c=>c.id===held.id));assert.ok(!playerView(s,0).legal.some(a=>a.skill==='tiaoxin'))
 s=fixture('yangren');const a=card(s,1,'sha'),hp=s.players[0].hp;s=step(s,{type:'skill',skill:'tiaoxin',target:1});s=step(s,{type:'respond',ids:[a.id]});assert.equal(s.pending.actor,0);s=pass(s);assert.equal(s.players[0].hp,hp-1);assert.ok(s.discard.some(c=>c.id===a.id));assert.equal(s.current,0)
})
test('Zhiji gains Guanxing during this prepare phase after the mandatory healing/drawing choice',()=>{
 let s=fixture('yangren');s.players[0].hp=2;s=phase(s,'turnPrepare');assert.equal(s.pending.skill,'zhiji');s=invoke(s,{value:'draw'});assert.equal(s.players[0].maxHp,4);assert.ok(hasSkill(s.players[0],'guanxing'));assert.equal(s.pending.kind,'guanxing');s=pass(s);assert.equal(s.players[0].hand.length,4)
})
test('Qiaobian draw skip offers up to two private hand targets with frontend multi-target validation',()=>{
 let s=fixture('zhangkui');const c=card(s,0,'sha');card(s,1,'shan');card(s,2,'tao');s=phase(s,'drawPhase');s=invoke(s,{ids:[c.id]});assert.equal(s.pending.spec.multiTargets,true);const v=playerView(s,0);assert.deepEqual(extensionAction(v,{selected:[],targets:[1,2]}).targets,[1,2]);assert.equal(extensionAction(v,{selected:[],targets:[1,1]}),null);s=invoke(s,{targets:[1,2],ids:[]});s=step(s,{type:'choose',value:'hand:0'});s=step(s,{type:'choose',value:'hand:0'});assert.equal(s.players[0].hand.length,2);assert.equal(s.players[1].hand.length,0);assert.equal(s.players[2].hand.length,0)
})
test('Qiaobian moving equipment uses public card choice and preserves its exact physical identity',()=>{
 let s=fixture('zhangkui');const c=card(s,0,'sha'),weapon=equip(s,1,'bow');s=phase(s,'playPhase');s=invoke(s,{ids:[c.id]});assert.equal(s.pending.stage,'board-pick');assert.ok(extensionPopup(playerView(s,0)));s=invoke(s,{value:weapon.id});s=invoke(s,{target:2,ids:[]});assert.equal(s.players[1].equip.weapon,null);assert.equal(s.players[2].equip.weapon.id,weapon.id)
})
test('Qiaobian does not ask to skip the judge phase when the judgment area is empty',()=>{
 // 身上没有判定牌时，跳过判定阶段毫无意义（白弃一张牌），不应提示地变，直接进入摸牌阶段。
 let s=fixture('zhangkui');card(s,0,'sha');s=phase(s,'judgeDrawStart');assert.equal(s.pending.skill,'qiaobian');assert.equal(s.pending.phase,'draw','无判定牌时应跳过判定阶段的地变提示，直接进到摸牌阶段');assert.ok(!s.players[0].marks.skipJudge)
 // 有判定牌时才在判定阶段提示，弃牌可真正跳过判定。
 let t=fixture('zhangkui');const cost=card(t,0,'sha'),delay=card(t,0,'indulgence');t.players[0].hand.pop();t.players[0].judgment.push(delay);t=phase(t,'judgeDrawStart');assert.equal(t.pending.skill,'qiaobian');assert.equal(t.pending.phase,'judge');assert.ok(t.pending.instruction.includes('判定'));t=invoke(t,{ids:[cost.id]});assert.equal(t.players[0].marks.skipJudge,true);assert.ok(t.discard.some(x=>x.id===cost.id));assert.ok(t.players[0].judgment.some(x=>x.id===delay.id),'跳过判定后判定牌仍在判定区')
})
test('Tuntian keeps non-heart final judgment as a public field and never uses fields as ordinary cards',()=>{
 let s=fixture('juliusun',undefined,1),a=card(s,1,'sha'),d=card(s,0,'shan'),judge=top(s,'club');s=slash(s,a,0);s=step(s,{type:'respond',ids:[d.id]});assert.equal(s.pending.skill,'tuntian');s=invoke(s);assert.equal(s.pending.hit,true);s=ack(s);assert.equal(s.players[0].fieldPile[0].id,judge.id);assert.equal(playerView(s,2).players[0].fieldPile[0].id,judge.id);assert.equal(distance(s,0,2),1);assert.equal(viewDistance(playerView(s,0),0,2),1)
})
test('Zaoxian grants Jixi once, pays one field, and calculates Snatch distance after that payment',()=>{
 let s=fixture('juliusun');s.players[0].fieldPile=[];for(let i=0;i<3;i++)s.players[0].fieldPile.push(s.deck.shift());card(s,2,'shan');s=phase(s,'turnPrepare');assert.equal(s.players[0].persistent.zaoxian,true);assert.ok(hasSkill(s.players[0],'jixi'));const c=s.players[0].fieldPile[0];assert.ok(playerView(s,0).legal.some(a=>a.as==='snatch'&&a.ids[0]===c.id));assert.ok(!playerView(s,0).legal.some(a=>a.as===c.type&&a.ids[0]===c.id));s=step(s,{type:'play',as:'snatch',ids:[c.id],targets:[2]});s=step(s,{type:'choose',value:'hand:0'});assert.equal(s.players[0].fieldPile.length,2);assert.ok(s.discard.some(x=>x.id===c.id));s.players[0].fieldPile.splice(1).forEach(c=>s.deck.push(c));assert.ok(!playerView(s,0).legal.some(a=>a.as==='snatch'&&a.targets.includes(2)))
})
test('Jiang draws for a red Slash target even when armor blocks it, and for both Duel participants before counters',()=>{
 let s=fixture('yinjiao',undefined,0,2);const a=card(s,0,'sha','heart');equip(s,1,'vine');const own=s.players[0].hand.length;s=slash(s,a,1);assert.equal(s.players[0].hand.length,own);assert.equal(s.players[1].hp,s.players[1].maxHp)
 s=fixture('jifa',['yinjiao','nezha','yangjian','jinling']);const duel=card(s,0,'duel'),counter=card(s,1,'nullify');s=step(s,{type:'play',as:'duel',ids:[duel.id],targets:[1]});assert.equal(s.players[1].hand.length,2);assert.equal(s.pending.kind,'counter');s=step(s,{type:'respond',ids:[counter.id]});while(s.pending?.kind==='counter')s=pass(s);assert.equal(s.players[1].hand.length,1)
})
test('Hunzi awakens at exactly one HP and acquired Yinghun is offered before drawing in the same turn',()=>{
 let s=fixture('yinjiao');s.players[0].hp=1;s=phase(s,'turnPrepare');assert.equal(s.players[0].maxHp,4);assert.equal(s.players[0].hp,1);assert.ok(hasSkill(s.players[0],'yingzi'));assert.ok(hasSkill(s.players[0],'yinghun'));assert.equal(s.pending.skill,'yinghun')
})
test('Zhiba is granted to a same-alliance challenger and a tied/lost pindian returns both cards to the lord',()=>{
 let s=fixture('yinjiao',['yunzhongzi','nezha','yangjian','jinling'],1),low=card(s,1,'shan','diamond',2),high=card(s,0,'sha','diamond',13);assert.ok(playerView(s,1).legal.some(a=>a.skill==='zhiba'));s=step(s,{type:'skill',skill:'zhiba',target:0});s=invoke(s,{ids:[low.id]});s=invoke(s,{ids:[high.id]});s=invoke(s,{value:'ack'});assert.equal(s.pending.skill,'zhiba');s=invoke(s);assert.ok(s.players[0].hand.some(c=>c.id===low.id));assert.ok(s.players[0].hand.some(c=>c.id===high.id));assert.ok(!playerView(s,1).legal.some(a=>a.skill==='zhiba'))
})
test('Zhijian installs equipment on an empty other slot, draws once and refuses replacement',()=>{
 let s=fixture('laozi'),weapon=card(s,0,'bow');s=step(s,{type:'skill',skill:'zhijian',ids:[weapon.id],target:2});assert.equal(s.players[2].equip.weapon.id,weapon.id);assert.equal(s.players[0].hand.length,1);const other=card(s,0,'blade');assert.ok(!playerView(s,0).legal.some(a=>a.skill==='zhijian'&&a.target===2&&a.ids[0]===other.id))
})
test('Guzhen returns exactly one discarded hand card and obtains only the rest of that discard phase',()=>{
 let s=fixture('laozi',undefined,1);for(let i=0;i<6;i++)card(s,1,'sha');const before=s.deck.shift();s.discard.push(before);s=step(s,{type:'end'});const discarded=s.players[1].hand.slice(0,2).map(c=>c.id);s=step(s,{type:'discard',ids:discarded});assert.equal(s.pending.skill,'guzhen');assert.equal(s.pending.cards.length,2);s=invoke(s,{value:discarded[0]});assert.ok(s.players[1].hand.some(c=>c.id===discarded[0]));assert.ok(s.players[0].hand.some(c=>c.id===discarded[1]));assert.ok(s.discard.some(c=>c.id===before.id))
})
test('loyalist identifies the final unknown enemy using public lord/survivor information even after Jueqing',()=>{
 const v={seat:0,players:[{seat:0,alive:true,role:'loyal'},{seat:1,alive:true,role:'lord'},{seat:2,alive:true,role:null}],suspicion:[0,0,-3]};assert.equal(chooseAI.hostility(v,2),4)
})
