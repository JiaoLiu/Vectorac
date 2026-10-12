import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir,stat} from 'node:fs/promises'
import {createAssignedGame,createGame,dispatch,playerView,restoreGame,allCards,catalog,chooseAI,hasSkill} from '../.private/fengshen/engine.mjs'
import {HEROES,PLAYABLE_HEROES,CARDS_BY_TYPE,skillHelp,displayText,ALLIANCES} from '../.private/fengshen/theme.mjs'
import {auditCanonicalRoster} from '../.private/fengshen/canonical-roster.mjs'
import {COMPLETE_PROFILES} from '../.private/fengshen/complete-roster.mjs'
import {extensionAction,extensionTargets} from '../.private/fengshen/extension-actions.mjs'
import {panelSelection,panelAction} from '../.private/fengshen/panel-selection.mjs'
import {renderBattle,renderCenter,renderControls} from '../.private/fengshen/table.mjs'
import {cardFace,display,effectiveCard} from '../.private/fengshen/presentation.mjs'
function fixture(hero='yangjian',others=['jifa','nezha','dixin','jinling'],current=0){
 const ids=[hero,...others];assert.equal(new Set(ids).size,5)
 const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:ids,seed:23});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.lastPlayed=null;s.lastResponse=null;s.exchange=null;s.publicReveal=null;s.logs=[]
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp;p.alive=true;delete p.faceDown;delete p.chained;delete p.skillsSealed;delete p.persistent;delete p.buquPile}
 return s
}
function card(s,seat,type,suit=null,rank=null){const i=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit)&&(!rank||c.rank===rank));assert.ok(i>=0,type+' '+suit+' '+rank);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
function equip(s,seat,type){const c=card(s,seat,type);s.players[seat].hand.pop();s.players[seat].equip[catalog.CARDS[type].slot]=c;return c}
function top(s,predicate){const i=s.deck.findIndex(predicate);assert.ok(i>=0);const c=s.deck.splice(i,1)[0];s.deck.unshift(c);return c}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,promptId:s.pending?.id,revision:s.revision,...a});assert.ok(r.ok,r.error+' '+JSON.stringify(a));assert.equal(allCards(r.state).length,108);assert.equal(new Set(allCards(r.state).map(c=>c.id)).size,108);assert.ok(restoreGame(r.state),'restore '+JSON.stringify(r.state.pending));return r.state}
const invoke=(s,extra={})=>step(s,{type:'invoke',value:s.pending?.stage==='reveal'?'ack':s.pending?.spec?'confirm':'yes',...extra})
const pass=s=>step(s,playerView(s,s.pending.actor).legal.find(a=>a.type==='pass')||{type:'invoke',value:'ack'})
const sha=(s,c,target)=>step(s,{type:'play',as:'sha',ids:[c.id],targets:[target]})
function drain(s,stop=()=>!s.pending,limit=60){for(let i=0;!stop(s)&&i<limit;i++){assert.ok(s.pending);s=pass(s)}assert.ok(stop(s),JSON.stringify(s.pending));return s}
const ui=s=>({state:s,selected:[],targets:[],skill:null,paused:false,header:()=>'',matching:()=>[],currentAs:()=>null,targetable:()=>[],equipment:()=>'',skills:()=>'',won:()=>false,pendingText:()=>''})
test('all 64 existing independent portraits are complete, certified, uniquely mapped and selectable',async()=>{
 assert.equal(HEROES.length,64);assert.equal(PLAYABLE_HEROES.length,64);assert.deepEqual(auditCanonicalRoster(HEROES,ALLIANCES),[])
 const files=(await readdir(new URL('../.private/fengshen/assets/heroes/',import.meta.url))).filter(s=>s.endsWith('.jpg')&&!s.endsWith('-thumb.jpg'));assert.equal(files.length,64)
 for(const h of HEROES){assert.ok(h.playable);assert.equal(h.missingSkills.length,0);assert.ok(await stat(new URL('../.private/fengshen/'+h.image,import.meta.url)));for(const skill of Object.keys(h.skillNames))assert.ok(skillHelp(h,skill));assert.ok(createGame({heroId:h.id,seed:2}))}
 assert.ok(!displayText('恢复体力，获得手牌').includes('undefined'))
})
test('Guhuo never exposes the concealed physical card before questions finish; false challenged card fizzles and rewards questioner',()=>{
 let s=fixture('shengongbao'),fake=card(s,0,'sha','spade');s=step(s,{type:'play',as:'draw',ids:[fake.id],targets:[],guhuo:true});assert.equal(s.pending.stage,'question');const v=playerView(s,1);assert.ok(!JSON.stringify(v).includes(fake.id));assert.equal(v.lastPlayed.cards.length,0)
 const questioner=s.pending.actor;s=invoke(s,{value:'question'});while(s.pending?.stage==='question')s=invoke(s,{value:'believe'});assert.equal(s.pending.stage,'reveal');assert.equal(playerView(s,3).publicReveal.cards[0].id,fake.id);assert.equal(s.publicReveal.hit,false);s=invoke(s);assert.equal(s.players[0].hand.length,0);assert.equal(s.players[questioner].hand.length,1);assert.ok(s.discard.some(c=>c.id===fake.id))
})
test('Guhuo unchallenged fiction succeeds; challenged truth hurts questioners but only true hearts continue',()=>{
 for(const [truth,heart,questions,success]of [[false,false,false,true],[true,false,true,false],[true,true,true,true]]){let s=fixture('shengongbao'),c=truth?card(s,0,'sha',heart?'heart':'spade'):card(s,0,'shan');equip(s,0,'bow');const hp=s.players[2].hp,qhp=s.players[1].hp;s=step(s,{type:'play',as:'sha',ids:[c.id],targets:[2],guhuo:true});let first=true;while(s.pending?.stage==='question'){s=invoke(s,{value:first&&questions?'question':'believe'});first=false}assert.equal(s.publicReveal.hit,success);s=invoke(s);if(s.pending?.kind==='response')s=pass(s);assert.equal(s.players[2].hp,hp-(success?1:0));assert.equal(s.players[1].hp,qhp-(truth&&questions?1:0))}
})
test('Guhuo response retains the incoming attack context and resumes the exact original response',()=>{
 let s=fixture('shengongbao',undefined,1),attack=card(s,1,'sha'),fake=card(s,0,'tao');s=sha(s,attack,0);const played=s.lastPlayed.id,hp=s.players[0].hp;s=step(s,{type:'respond',ids:[fake.id],guhuo:true});assert.equal(s.lastPlayed.id,played);while(s.pending?.stage==='question')s=invoke(s,{value:'believe'});s=invoke(s);assert.equal(s.players[0].hp,hp);assert.equal(s.lastResponse.as,'shan');assert.ok(s.discard.some(c=>c.id===fake.id))
})
test('Tianxiang redirects full damage, Hongyan permits a physical spade cost, and recipient draws after damage',()=>{
 let s=fixture('longji',undefined,1);s.players[0].hp=2;s.players[2].hp=3;const c=card(s,1,'sha'),heart=card(s,0,'sha','spade');s=sha(s,c,0);s=pass(s);assert.equal(s.pending.skill,'tianxiang');const v=playerView(s,0);assert.equal(effectiveCard(v.players[0],v.players[0].hand[0]).suit,'heart');s=invoke(s,{ids:[heart.id],target:2});assert.equal(s.players[0].hp,2);assert.equal(s.players[2].hp,2);assert.equal(s.players[2].hand.length,2);assert.equal(s.logs.find(l=>l.cue?.kind==='damage').cue.source,1);assert.equal(s.discard.find(c=>c.id===heart.id).suit,'spade')
})
test('Hongyan affects own final judgment without rewriting the canonical physical card',()=>{
 let s=fixture('longji',undefined,4),lightning=card(s,0,'lightning');s.players[0].hand.pop();s.players[0].judgment.push(lightning);const judge=top(s,c=>c.suit==='spade'&&c.rank===5),hp=s.players[0].hp;s=step(s,{type:'end'});assert.equal(s.pending.kind,'reveal');assert.equal(s.pending.card.suit,'spade');assert.equal(s.pending.effectiveSuit,'heart');assert.equal(s.pending.hit,false);s=step(s,{type:'ack'});assert.equal(s.players[0].hp,hp);assert.ok(allCards(s).some(c=>c.id===judge.id&&c.suit==='spade'))
})
test('Fangzhu draws current lost HP then turns chosen role over; Xingshang inherits hand/equipment but not judgment',()=>{
 let s=fixture('tongtian',undefined,1),attack=card(s,1,'sha');s=sha(s,attack,0);s=pass(s);assert.equal(s.pending.skill,'fangzhu');s=invoke(s,{target:2,ids:[]});assert.equal(s.players[2].hand.length,1);assert.equal(s.players[2].faceDown,true)
 s=fixture('tongtian',['nezha','dixin','yangjian','jinling'],1);s.players[2].hp=1;const held=card(s,2,'tao'),weapon=equip(s,2,'bow'),delay=card(s,2,'indulgence');s.players[2].hand.pop();s.players[2].judgment.push(delay);const c=card(s,1,'sha');s=sha(s,c,2);s=pass(s);if(s.pending?.kind==='rescue')s=pass(s);assert.equal(s.pending.skill,'xingshang');s=invoke(s);assert.ok(s.players[0].hand.some(c=>c.id===held.id));assert.ok(s.players[0].hand.some(c=>c.id===weapon.id));assert.ok(!s.players[0].hand.some(c=>c.id===delay.id));assert.ok(s.discard.some(c=>c.id===delay.id))
})
test('Songwei asks the judged allied role after its black final judgment, not the lord',()=>{
 let s=fixture('tongtian',['wenzhong','nezha','yangjian','jinling']);const delay=card(s,1,'indulgence');s.players[1].hand.pop();s.players[1].judgment.push(delay);top(s,c=>c.suit==='spade');s=step(s,{type:'end'});s=step(s,{type:'ack'});assert.equal(s.pending.skill,'songwei');assert.equal(s.pending.actor,1);s=invoke(s);assert.equal(s.players[0].hand.length,1)
})
test('Ganlu exchanges whole equipment zones, includes self, and uses lost-HP difference without duplicating items',()=>{
 let s=fixture('nuwa');s.players[0].hp--;const w=equip(s,0,'bow'),armor=equip(s,1,'bagua');s=step(s,{type:'skill',skill:'ganlu',targets:[0,1]});assert.equal(s.players[0].equip.armor.id,armor.id);assert.equal(s.players[1].equip.weapon.id,w.id);assert.equal(s.players[0].equip.weapon,null);assert.ok(!playerView(s,0).legal.some(a=>a.skill==='ganlu'))
 const invalid=fixture('nuwa');equip(invalid,1,'bow');const r=dispatch(invalid,{seat:0,type:'skill',skill:'ganlu',targets:[1,2]});assert.equal(r.ok,false)
})
test('Buyi exposes one chosen hidden hand card, discards only nonbasic, and rescues before ordinary peach loop',()=>{
 let s=fixture('nuwa',undefined,2);s.players[1].hp=1;const cure=card(s,1,'bow'),attack=card(s,2,'sha');s=sha(s,attack,1);s=pass(s);assert.equal(s.pending.stage,'buyi');assert.equal(s.pending.actor,0);assert.ok(!JSON.stringify(playerView(s,0).legal).includes(cure.id));s=invoke(s,{value:'0'});assert.equal(s.pending.stage,'reveal');assert.equal(s.publicReveal.cards[0].id,cure.id);s=invoke(s);assert.equal(s.players[1].hp,1);assert.equal(s.players[1].alive,true);assert.ok(s.discard.some(c=>c.id===cure.id))
})
test('Quhu resolves secret two-stage Pindian with visible result and a tiger-owned damage source',()=>{
 let s=fixture('fuxi');s.players[0].hp=2;const high=card(s,0,'sha','diamond',13),low=card(s,1,'shan','diamond',2),hp=s.players[2].hp;s=step(s,{type:'skill',skill:'quhu',target:1});s=invoke(s,{ids:[high.id]});assert.equal(s.pending.actor,1);assert.ok(!JSON.stringify(playerView(s,1)).includes(high.id));s=invoke(s,{ids:[low.id]});assert.equal(s.publicReveal.cards.length,2);assert.equal(s.publicReveal.hit,true);s=invoke(s);assert.equal(s.pending.stage,'quhu-target');s=invoke(s,{target:2,ids:[]});assert.equal(s.players[2].hp,hp-1);assert.equal(s.logs.find(l=>l.cue?.kind==='damage').cue.source,1)
})
test('Jieming triggers once per damage point and fills only to min(maxHP,5)',()=>{
 let s=fixture('fuxi',undefined,1);const c=card(s,1,'sha');s=sha(s,c,0);s=pass(s);assert.equal(s.pending.skill,'jieming');s=invoke(s,{target:2,ids:[]});assert.equal(s.players[2].hand.length,4);assert.equal(s.players[0].hp,s.players[0].maxHp-1)
})
test('Haoshi draws four total and mandates half to a tied minimum-hand other role; Dimeng exact cost swaps hidden hands',()=>{
 let s=fixture('zeus',undefined,4);for(let i=0;i<4;i++)card(s,0,'sha');for(let seat=1;seat<5;seat++)card(s,seat,'shan');s=step(s,{type:'end'});assert.equal(s.pending.skill,'haoshi');s=invoke(s);assert.equal(s.players[0].hand.length,8);assert.equal(s.pending.spec.min,4);s=invoke(s,{ids:s.players[0].hand.slice(0,4).map(c=>c.id),target:1});assert.equal(s.players[0].hand.length,4);assert.equal(s.players[1].hand.length,5)
 s=fixture('zeus');const cost=[card(s,0,'sha'),card(s,0,'shan')];card(s,1,'tao');for(let i=0;i<3;i++)card(s,2,'sha');const first=s.players[1].hand.map(c=>c.id),second=s.players[2].hand.map(c=>c.id);s=step(s,{type:'skill',skill:'dimeng',ids:cost.map(c=>c.id),targets:[1,2]});assert.deepEqual(s.players[1].hand.map(c=>c.id),second);assert.deepEqual(s.players[2].hand.map(c=>c.id),first);assert.equal(playerView(s,0).players[1].hand.length,0)
})
test('original Zhenlie replaces with deck top without HP cost; Miji gifts an owner-private packet only after black judge',()=>{
 let s=fixture('athena',undefined,4),delay=card(s,0,'lightning');s.players[0].hand.pop();s.players[0].judgment.push(delay);const old=top(s,c=>c.suit==='spade'&&c.rank===5),replacement=s.deck.find(c=>c.suit==='heart');s.deck.splice(s.deck.indexOf(replacement),1);s.deck.splice(1,0,replacement);const hp=s.players[0].hp;s=step(s,{type:'end'});assert.equal(s.pending.stage,'zhenlie');s=invoke(s);assert.equal(s.pending.card.id,replacement.id);assert.equal(s.pending.hit,false);s=step(s,{type:'ack'});assert.equal(s.players[0].hp,hp);assert.ok(s.discard.some(c=>c.id===old.id))
 s=fixture('athena',undefined,4);s.players[0].hp=2;top(s,c=>c.suit==='club');s=step(s,{type:'end'});s=invoke(s);assert.equal(s.pending.stage,'zhenlie');s=pass(s);s=step(s,{type:'ack'});assert.equal(s.pending.stage,'gift');const packet=playerView(s,0).extension.cards;assert.equal(packet.length,2);assert.equal(playerView(s,2).extension.cards.length,0);for(const c of packet)assert.ok(!JSON.stringify(playerView(s,2)).includes(c.id));s=invoke(s,{target:1,ids:[]});assert.equal(s.players[1].hand.length,2)
})
test('Huoshou makes Savage ineffective on self and replaces damage source; Zaiqi publicly recovers hearts and obtains rest',()=>{
 let s=fixture('poseidon',['jifa','nezha','yangjian','jinling'],1),c=card(s,1,'savage'),hp=s.players[0].hp;s=step(s,{type:'play',as:'savage',ids:[c.id],targets:[]});s=drain(s);assert.equal(s.players[0].hp,hp);assert.ok(s.logs.filter(l=>l.cue?.kind==='damage').every(l=>l.cue.source===0))
 s=fixture('poseidon',undefined,4);s.players[0].hp=3;const heart=top(s,c=>c.suit==='heart'),other=s.deck.find(c=>c.suit==='club');s.deck.splice(s.deck.indexOf(other),1);s.deck.splice(1,0,other);s=step(s,{type:'end'});s=invoke(s);assert.equal(s.publicReveal.cards.length,2);s=invoke(s);assert.equal(s.players[0].hp,4);assert.ok(s.players[0].hand.some(c=>c.id===other.id));assert.ok(s.discard.some(c=>c.id===heart.id));assert.equal(s.players[0].hand.length,1)
})
test('Xueji exact red cost and multiple targets; Huxiao refunds dodged Slash; Wuji awakens once and removes only Huxiao',()=>{
 let s=fixture('artemis',['jifa','nezha','yangjian','jinling']);s.players[0].hp=2;equip(s,0,'bow');const cost=card(s,0,'tao'),attack=card(s,0,'sha');s=step(s,{type:'skill',skill:'xueji',ids:[cost.id],targets:[1,2]});assert.equal(s.players[0].marks.damageDealt,2);assert.equal(s.players[1].hand.length,1);s=sha(s,attack,1);s=pass(s);assert.equal(s.players[0].marks.damageDealt,3);s=step(s,{type:'end'});assert.equal(s.players[0].persistent.wuji,true);assert.equal(s.players[0].maxHp,5);assert.equal(s.players[0].hp,3);assert.ok(!hasSkill(s.players[0],'huxiao'));assert.ok(hasSkill(s.players[0],'xueji'))
 s=fixture('artemis');const a=card(s,0,'sha'),b=card(s,0,'sha'),d=card(s,1,'shan');s=sha(s,a,1);s=step(s,{type:'respond',ids:[d.id]});assert.equal(s.players[0].marks.huxiao,1);assert.ok(playerView(s,0).legal.some(a=>a.as==='sha'&&a.ids[0]===b.id))
})
test('Luoying obtains others club discards/judgments, never ordinary use/response; Jiushi keeps pre-damage face snapshot',()=>{
 let s=fixture('apollo',undefined,1);for(let i=0;i<6;i++)card(s,1,'sha','club');s=step(s,{type:'end'});const ids=s.players[1].hand.slice(0,2).map(c=>c.id);s=step(s,{type:'discard',ids});assert.ok(ids.every(id=>s.players[0].hand.some(c=>c.id===id)))
 s=fixture('apollo',undefined,1);const attack=card(s,1,'sha','club');s=sha(s,attack,0);s=pass(s);assert.ok(!s.players[0].hand.some(c=>c.id===attack.id))
 s=fixture('apollo',undefined,1);s.players[0].faceDown=true;const c=card(s,1,'sha');s=sha(s,c,0);s=pass(s);assert.equal(s.pending.skill,'jiushi-back');s=invoke(s);assert.equal(s.players[0].faceDown,false)
})
test('Bazhen provides optional armor judgment only when unequipped, respects ignored armor; Kanpo black hand counters',()=>{
 let s=fixture('odin',undefined,1),c=card(s,1,'sha');top(s,c=>c.suit==='heart');s=sha(s,c,0);assert.ok(playerView(s,0).legal.some(a=>a.type==='bagua'));const hp=s.players[0].hp;s=step(s,{type:'bagua'});s=step(s,{type:'ack'});assert.equal(s.players[0].hp,hp)
 s=fixture('odin',undefined,1);equip(s,1,'qinggang');c=card(s,1,'sha');s=sha(s,c,0);assert.ok(!playerView(s,0).legal.some(a=>a.type==='bagua'))
 s=fixture('odin',undefined,1);const spell=card(s,1,'dismantle'),black=card(s,0,'sha','club');s=step(s,{type:'play',as:'dismantle',ids:[spell.id],targets:[0]});assert.ok(playerView(s,0).legal.some(a=>a.type==='respond'&&a.ids[0]===black.id))
})
test('Huoji is a targeted counterable virtual trick with public show, matching hand discard and fire damage',()=>{
 let s=fixture('odin'),red=card(s,0,'tao'),cost=card(s,0,'sha','club'),shown=card(s,1,'sha','club'),hp=s.players[1].hp;s=step(s,{type:'play',as:'fireattack',ids:[red.id],targets:[1]});while(s.pending?.kind==='counter')s=pass(s);assert.equal(s.pending.stage,'fire-show');s=invoke(s,{ids:[shown.id]});assert.equal(s.publicReveal.cards[0].id,shown.id);s=invoke(s);assert.equal(s.pending.stage,'fire-discard');s=invoke(s,{ids:[cost.id]});assert.equal(s.players[1].hp,hp-1);assert.ok(s.discard.some(c=>c.id===cost.id))
})
test('Weimu excludes black trick/delay targets including own black lightning; Wansha only restricts peaches, not Buyi',()=>{
 let s=fixture('loki'),black=card(s,0,'lightning','spade');assert.ok(!playerView(s,0).legal.some(a=>a.ids?.includes(black.id)&&a.as==='lightning'))
 s=fixture('yangjian',['jifa','loki','nezha','jinling']);const spell=card(s,0,'dismantle','spade');card(s,2,'shan');assert.ok(!playerView(s,0).legal.some(a=>a.as==='dismantle'&&a.ids[0]===spell.id&&a.targets.includes(2)))
 s=fixture('loki',['nuwa','jifa','nezha','jinling']);s.players[2].hp=1;const attack=card(s,0,'sha');card(s,1,'tao');card(s,2,'bagua');equip(s,0,'bow');s=sha(s,attack,2);s=pass(s);assert.equal(s.pending.skill,'buyi');s=pass(s);assert.equal(s.players[2].alive,false);assert.equal(s.players[1].hand.some(c=>c.type==='tao'),true)
})
test('Luanwu is once per game; no valid nearest Slash loses HP without damage triggers',()=>{
 let s=fixture('loki',['jifa','nezha','yangjian','jinling']),before=s.players.map(p=>p.hp);s=step(s,{type:'skill',skill:'luanwu'});assert.deepEqual(s.players.map(p=>p.hp),before.map((hp,i)=>hp-(i?1:0)));assert.ok(!playerView(s,0).legal.some(a=>a.skill==='luanwu'));assert.equal(s.logs.filter(l=>l.cue?.kind==='damage').length,0)
})
test('Shuangxiong obtains final judgment and converts only opposite-color hand cards for this turn',()=>{
 let s=fixture('anubis',undefined,4),red=card(s,0,'tao'),black=card(s,0,'sha','club');top(s,c=>c.suit==='spade');s=step(s,{type:'end'});s=invoke(s);const judge=s.pending.card.id;s=step(s,{type:'ack'});assert.ok(s.players[0].hand.some(c=>c.id===judge));assert.equal(s.players[0].marks.shuangxiongColor,'black');const legal=playerView(s,0).legal;assert.ok(legal.some(a=>a.as==='duel'&&a.ids[0]===red.id));assert.ok(!legal.some(a=>a.as==='duel'&&a.ids[0]===black.id))
})
test('Yinghun branches use current lost HP and discard can include equipment',()=>{
 let s=fixture('ra',undefined,4);s.players[0].hp=2;s=step(s,{type:'end'});assert.equal(s.pending.skill,'yinghun');s=invoke(s,{value:'draw-many',target:1,ids:[]});assert.equal(s.players[1].hand.length,3);assert.equal(s.pending.spec.min,1);s=invoke(s,{ids:[s.players[1].hand[0].id]});assert.equal(s.players[1].hand.length,2)
})
test('Jueqing causes sourceless HP loss, no armor/transfer/hurt-trigger or kill reward; Shangshi refills full lost HP',()=>{
 let s=fixture('bastet',['jifa','bixiao','yangjian','jinling']);s.players[0].hp=2;s.players[2].hp=1;const c=card(s,0,'sha');equip(s,0,'bow');const before=s.players[0].hand.length;s=sha(s,c,2);s=pass(s);assert.equal(s.players[2].alive,false);assert.equal(s.players[0].skillsSealed,undefined);assert.ok(!s.logs.some(l=>l.cue?.kind==='damage'));assert.equal(s.players[0].hand.length,s.players[0].maxHp-s.players[0].hp)
 s=fixture('bastet');s.players[0].hp=1;const cost=card(s,0,'dismantle');card(s,1,'shan');s=step(s,{type:'play',as:'dismantle',ids:[cost.id],targets:[1]});s=step(s,playerView(s,0).legal.find(a=>a.type==='choose'));assert.equal(s.players[0].hand.length,3)
})
test('Anxu publicly moves one hidden card and draws for controller on nonspade; Zhuiyi dead actor may choose anyone except killer',()=>{
 let s=fixture('amaterasu');card(s,1,'shan');const gift=card(s,2,'tao');card(s,2,'sha');s=step(s,{type:'skill',skill:'anxu',targets:[1,2]});assert.equal(s.pending.actor,1);s=step(s,playerView(s,1).legal.find(a=>a.value==='hand:0'));assert.ok(s.players[1].hand.some(c=>c.id===gift.id));assert.equal(s.players[0].hand.length,1);assert.equal(s.logs.find(l=>l.cue?.kind==='public-transfer').cue.card.id,gift.id)
 s=fixture('amaterasu',undefined,1);s.players[0].hp=1;s.players[2].hp--;const c=card(s,1,'sha');s=sha(s,c,0);s=pass(s);assert.equal(s.players[0].alive,false);assert.equal(s.pending.skill,'zhuiyi');assert.ok(!s.pending.spec.targets.includes(1));s=invoke(s,{target:2,ids:[]});assert.equal(s.players[2].hand.length,3);assert.equal(s.players[2].hp,s.players[2].maxHp)
})
test('Tianyi strict Pindian win raises count, range and target count; ties prohibit using Slash despite crossbow',()=>{
 let s=fixture('susanoo'),high=card(s,0,'sha','diamond',13),low=card(s,1,'shan','diamond',2),next=card(s,0,'sha');s=step(s,{type:'skill',skill:'tianyi',target:1});s=invoke(s,{ids:[high.id]});s=invoke(s,{ids:[low.id]});s=invoke(s);assert.equal(s.players[0].marks.tianyiWin,true);assert.ok(playerView(s,0).legal.some(a=>a.as==='sha'&&a.targets.length===2&&a.targets.includes(2)))
 s=fixture('susanoo');equip(s,0,'crossbow');const a=card(s,0,'sha','club',7),b=card(s,1,'sha','spade',7);card(s,0,'sha');s=step(s,{type:'skill',skill:'tianyi',target:1});s=invoke(s,{ids:[a.id]});s=invoke(s,{ids:[b.id]});s=invoke(s);assert.ok(!playerView(s,0).legal.some(a=>a.as==='sha'))
})
test('Lianhuan can recast without Jizhi/use count, targets toggle chains; elemental damage transmits once and unchains',()=>{
 let s=fixture('tsukuyomi'),cost=card(s,0,'sha','club');s=step(s,{type:'play',as:'ironchain',ids:[cost.id],targets:[1,2]});assert.equal(s.players[1].chained,true);assert.equal(s.players[2].chained,true)
 s=fixture('odin',['jifa','nezha','yangjian','jinling']);s.players[1].chained=s.players[2].chained=true;const fire=card(s,0,'tao'),match=card(s,0,'sha','club'),shown=card(s,1,'sha','club'),hp1=s.players[1].hp,hp2=s.players[2].hp;s=step(s,{type:'play',as:'fireattack',ids:[fire.id],targets:[1]});while(s.pending?.kind==='counter')s=pass(s);s=invoke(s,{ids:[shown.id]});s=invoke(s);s=invoke(s,{ids:[match.id]});assert.equal(s.players[1].hp,hp1-1);assert.equal(s.players[2].hp,hp2-1);assert.equal(s.players[1].chained,false);assert.equal(s.players[2].chained,false)
 s=fixture('tsukuyomi');const c=card(s,0,'sha','club');s=step(s,{type:'skill',skill:'lianhuan',ids:[c.id]});assert.equal(s.players[0].hand.length,1);assert.equal(s.players[0].marks.sha,0)
 // 连上自己时，自己的连环标记也要显示（不能只在对手身上看到）。
 const c2=card(s,0,'sha','club');s=step(s,{type:'play',as:'ironchain',ids:[c2.id],targets:[0,1]});while(s.pending?.kind==='counter')s=pass(s);assert.equal(s.players[0].chained,true);assert.equal(s.players[1].chained,true);assert.equal((renderBattle(ui(s)).match(/fs-chain-mark/g)||[]).length,2)
})
test('Niepan consumes its once-game flag and resets own areas/chain/face before ordinary rescue',()=>{
 let s=fixture('tsukuyomi',undefined,1);s.players[0].hp=1;s.players[0].faceDown=s.players[0].chained=true;equip(s,0,'bow');const delay=card(s,0,'indulgence');s.players[0].hand.pop();s.players[0].judgment.push(delay);const c=card(s,1,'sha');s=sha(s,c,0);s=pass(s);assert.equal(s.pending.skill,'niepan');s=invoke(s);assert.equal(s.players[0].hp,3);assert.equal(s.players[0].hand.length,3);assert.equal(s.players[0].faceDown,false);assert.equal(s.players[0].chained,false);assert.equal(s.players[0].judgment.length,0);assert.equal(s.players[0].equip.weapon,null);assert.equal(s.players[0].persistent.niepan,true)
})
test('Juxiang immunity and real Savage collection; Lieren only after actual Slash damage, winning steals no judgments',()=>{
 let s=fixture('dengchanyu',['jifa','nezha','yangjian','jinling'],1),c=card(s,1,'savage'),hp=s.players[0].hp;s=step(s,{type:'play',as:'savage',ids:[c.id],targets:[]});s=drain(s);assert.equal(s.players[0].hp,hp);assert.ok(s.players[0].hand.some(card=>card.id===c.id))
 s=fixture('dengchanyu');const attack=card(s,0,'sha'),high=card(s,0,'sha','diamond',13),low=card(s,1,'shan','diamond',2),held=card(s,1,'tao');s=sha(s,attack,1);s=pass(s);assert.equal(s.pending.skill,'lieren');s=invoke(s);s=invoke(s,{ids:[high.id]});s=invoke(s,{ids:[low.id]});s=invoke(s);assert.equal(s.pending.kind,'take');s=step(s,playerView(s,0).legal.find(a=>a.type==='choose'));assert.ok(s.players[0].hand.some(c=>c.id===held.id))
})
test('old Buqu keeps zero HP alive with unique ranks, repeated rank goes into normal rescue, recovery chooses removable pile',()=>{
 let s=fixture('weihu',undefined,1);s.players[0].hp=1;top(s,c=>c.rank===2);const attack=card(s,1,'sha');s=sha(s,attack,0);s=pass(s);assert.equal(s.pending.skill,'buqu');s=invoke(s);assert.equal(s.players[0].hp,0);assert.equal(s.players[0].alive,true);assert.equal(s.players[0].buquPile.length,1);s=invoke(s);assert.equal(s.players[0].alive,true);assert.equal(s.pending,null)
 s.current=0;s.phase='play';const peach=card(s,0,'tao');s=step(s,{type:'play',as:'tao',ids:[peach.id],targets:[]});assert.equal(s.pending.stage,'buqu-remove');const id=s.pending.cards[0].id;s=invoke(s,{value:id});assert.equal(s.players[0].buquPile.length,0);assert.equal(s.players[0].hp,1)
})
test('original Zhuikong wins skip play, not all-target restriction; Qiuyuan non-Dodge hand gift adds helper as target',()=>{
 let s=fixture('qiongxiao');s.players[0].hp=2;const high=card(s,0,'sha','diamond',13),low=card(s,1,'shan','diamond',2);s=step(s,{type:'end'});assert.equal(s.pending.skill,'zhuikong');s=invoke(s);s=invoke(s,{ids:[high.id]});s=invoke(s,{ids:[low.id]});s=invoke(s);assert.ok(s.current!==1)
 s=fixture('qiongxiao',undefined,1);const attack=card(s,1,'sha'),gift=card(s,2,'tao'),hp0=s.players[0].hp,hp2=s.players[2].hp;s=sha(s,attack,0);assert.equal(s.pending.skill,'qiuyuan');s=invoke(s,{target:2,ids:[]});s=invoke(s,{ids:[gift.id]});s=drain(s);assert.equal(s.players[0].hp,hp0-1);assert.equal(s.players[2].hp,hp2-1);assert.ok(s.players[0].hand.some(c=>c.id===gift.id))
})
test('Beige accepts owned cost after actual Slash and all suit outcomes; Duanchang erases killer skills including borrowed ones',()=>{
 for(const suit of ['heart','diamond','spade','club']){let s=fixture('bixiao',['jifa','nezha','yangjian','jinling'],1),c=card(s,1,'sha'),cost=card(s,0,'shan');if(suit==='club')card(s,1,'tao');top(s,card=>card.suit===suit);const hp=s.players[2].hp;equip(s,1,'bow');s=sha(s,c,2);s=pass(s);assert.equal(s.pending.skill,'beige');s=invoke(s,{ids:[cost.id]});s=step(s,{type:'ack'});if(s.pending?.stage==='discard')s=invoke(s,{ids:s.players[1].hand.concat(Object.values(s.players[1].equip).filter(Boolean)).slice(0,s.pending.spec.min).map(c=>c.id)});if(suit==='heart')assert.equal(s.players[2].hp,hp);if(suit==='diamond')assert.equal(s.players[2].hand.length,2);if(suit==='spade')assert.equal(s.players[1].faceDown,true)}
 let s=fixture('yangjian',['jifa','bixiao','nezha','jinling']);s.players[2].hp=1;equip(s,0,'bow');const c=card(s,0,'sha');s=sha(s,c,2);s=pass(s);assert.equal(s.players[0].skillsSealed,true);assert.deepEqual(playerView(s,0).players[0].effectiveSkills,[]);assert.deepEqual(display(playerView(s,0).players[0]).skillNames,{})
})
test('mandatory new choices have explicit hand-area or panel confirmation, selected card highlights, no modal reveal',()=>{
 let s=fixture('fuxi');s.players[0].hp=2;const c=card(s,0,'sha');card(s,1,'shan');s=step(s,{type:'skill',skill:'quhu',target:1});const v=playerView(s,0),model=ui(s);assert.ok(renderControls(model,v).includes('确认驱兽'));model.selected=[c.id];assert.ok(extensionAction(v,model));assert.ok(!/data-action="confirm"[^>]*disabled/.test(renderControls(model,v)))
 s=fixture('weihu');const pile=card(s,0,'shan');s.players[0].hand.pop();s.players[0].buquPile=[pile];s.pending={kind:'ext',skill:'buqu',actor:0,id:9,stage:'buqu-remove',cards:[pile],required:true,options:[{type:'invoke',value:pile.id,label:'移走护道牌'}]};const p=playerView(s,0),first=panelSelection({view:p,index:0,promptId:9,revision:p.revision});model.state=s;model.panelSelection=first.selection;assert.ok(panelAction(p,first.selection));assert.ok(renderCenter(model,p).includes('fs-choice-card selected'));assert.ok(renderCenter(model,p).includes('确认选择'))
 const face=cardFace({type:'fireattack',virtual:true});assert.ok(face.includes('fireattack-v2-thumb.jpg'));assert.ok(!face.includes('undefined'));const chain=cardFace({type:'ironchain',virtual:true});assert.ok(chain.includes('ironchain-v2-thumb.jpg'));assert.ok(!chain.includes('.svg'))
})
test('Luanwu commanded Guhuo must perform questions rather than bypassing the bluff mechanic',()=>{
 let s=fixture('loki',['shengongbao','nezha','yangjian','jinling']),fake=card(s,1,'shan');s=step(s,{type:'skill',skill:'luanwu'});assert.equal(s.pending.actor,1);s=invoke(s,{value:'attack',ids:[fake.id],target:2});assert.equal(s.pending.stage,'question');while(s.pending?.stage==='question')s=invoke(s,{value:'believe'});s=invoke(s);assert.equal(s.pending.kind,'response');assert.equal(s.pending.actor,2);s=pass(s);assert.ok(s.logs.some(l=>l.cue?.kind==='damage'&&l.cue.source===1&&l.cue.target===2));assert.ok(s.discard.some(c=>c.id===fake.id))
})
test('linked Lightning deals three thunder to each chained role and removes chain state',()=>{
 let s=fixture('tsukuyomi',['jifa','nezha','yangjian','jinling'],4);s.players[0].chained=s.players[1].chained=true;const delay=card(s,0,'lightning');s.players[0].hand.pop();s.players[0].judgment.push(delay);top(s,c=>c.suit==='spade'&&c.rank===5);const hp=s.players.map(p=>p.hp);s=step(s,{type:'end'});s=step(s,{type:'ack'});assert.equal(s.players[0].hp,hp[0]-3);assert.equal(s.players[1].hp,hp[1]-3);assert.equal(s.players[0].chained,false);assert.equal(s.players[1].chained,false)
})
test('Buqu repeated rank enters rescue, one heal removes duplicate and can leave zero HP alive',()=>{
 let s=fixture('weihu',undefined,1);s.players[0].hp=0;const pile=card(s,0,'shan','diamond',2);s.players[0].hand.pop();s.players[0].buquPile=[pile];s.players[0].buquSafe=true;top(s,c=>c.rank===2);const rescue=card(s,2,'tao'),attack=card(s,1,'sha');s=sha(s,attack,0);s=pass(s);s=invoke(s);assert.equal(s.publicReveal.hit,false);s=invoke(s);assert.equal(s.pending.kind,'rescue');s=step(s,{type:'respond',ids:[rescue.id]});assert.equal(s.pending.stage,'buqu-remove');s=invoke(s,{value:s.pending.cards[0].id});assert.equal(s.players[0].hp,0);assert.equal(s.players[0].alive,true);assert.equal(s.players[0].buquPile.length,1);assert.equal(s.pending,null)
})
test('turn-scoped Tianyi, Shuangxiong and Wine expire after finish, not during later roles commands',()=>{
 let s=fixture('susanoo'),high=card(s,0,'sha','diamond',13),low=card(s,1,'shan','diamond',2);s=step(s,{type:'skill',skill:'tianyi',target:1});s=invoke(s,{ids:[high.id]});s=invoke(s,{ids:[low.id]});s=invoke(s);assert.equal(s.players[0].marks.tianyiWin,true);s=step(s,{type:'end'});assert.equal(s.players[0].marks.tianyiWin,undefined)
})
test('Guhuo includes registered skill-only tricks/basic cards but cannot bluff-recast Iron Chain',()=>{
 const s=fixture('shengongbao'),c=card(s,0,'shan');const legal=playerView(s,0).legal;assert.ok(legal.some(a=>a.as==='wine'));assert.ok(legal.some(a=>a.as==='ironchain'&&a.targets.length));assert.ok(!legal.some(a=>a.as==='ironchain'&&!a.targets.length));assert.ok(!catalog.makeDeck().some(c=>c.type==='wine'))
})
test('all 64 heroes run identity/team AI with conserved cards, restored prompts and private hand isolation',()=>{
 for(const h of HEROES)for(const mode of ['identity','team']){let s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:[h.id,...['jifa','nezha','yangjian','jinling','dixin'].filter(id=>id!==h.id).slice(0,4)],seed:37,...(mode==='team'?{roles:null,sides:[0,1,0,1,1],firstSeat:0}:{})}),n=0;while(!s.winner&&n++<3000){const v=playerView(s,s.pending?.actor??s.current);assert.ok(v.players.every(p=>p.seat===v.seat||p.hand.length===0));const a=chooseAI(v);assert.ok(a,h.id+' no AI '+JSON.stringify(v.pending));s=step(s,a)}assert.ok(s.winner,h.id+' '+mode+' did not finish')}
})
