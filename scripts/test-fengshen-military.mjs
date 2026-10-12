import test from 'node:test'
import assert from 'node:assert/strict'
import {createAssignedGame,dispatch,playerView,restoreGame,allCards,catalog,chooseAI} from '../.private/fengshen/engine.mjs'
import {makeMilitaryDeck,HERO_BY_THEME_ID,PLAYABLE_HEROES} from '../.private/fengshen/theme.mjs'
import {createSetup,dispatchSetup,restoreSession} from '../.private/fengshen/setup.mjs'
import {printedCard,cardFace,effectiveCard} from '../.private/fengshen/presentation.mjs'
import {tableTrail,trailCards} from '../.private/fengshen/table-trail.mjs'
function fixture({heroes=['randeng','yuanshi','muzha','taiyi','nezha'],deckVersion=2}={}){
 const s=createAssignedGame({heroIds:heroes,roles:['lord','loyal','rebel','rebel','renegade'],seed:7,deckVersion})
 s.deck=(deckVersion===2?makeMilitaryDeck:catalog.makeDeck)();s.discard=[];s.processing=[];s.harvestPool=[];s.pending=null;s.queue=[];s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastResponse=null;s.lastEvent=null
 for(const p of s.players){p.hand=[];p.judgment=[];p.virtualJudgments={};p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.marks={sha:0}}
 return s
}
const give=(s,seat,type,filter=()=>true)=>{const i=s.deck.findIndex(c=>c.type===type&&filter(c));assert.ok(i>=0,`missing ${type}`);const [c]=s.deck.splice(i,1);s.players[seat].hand.push(c);return c}
const equip=(s,seat,type)=>{const c=give(s,seat,type);s.players[seat].hand.pop();s.players[seat].equip[catalog.CARDS[type].slot]=c;return c}
const top=(s,suit)=>{const i=s.deck.findIndex(c=>c.suit===suit);assert.ok(i>=0);s.deck.unshift(...s.deck.splice(i,1));return s.deck[0]}
function step(s,a){const r=dispatch(s,{seat:s.pending?.actor??s.current,promptId:s.pending?.id,revision:s.revision,...a});assert.ok(r.ok,r.error+' '+JSON.stringify(a));assert.equal(allCards(r.state).length,s.deckVersion===2?160:108);assert.equal(new Set(allCards(r.state).map(c=>c.id)).size,allCards(r.state).length);assert.ok(restoreGame(r.state),'restore '+r.state.pending?.kind);return r.state}
function settle(s){let n=0;while(s.pending&&n++<100){const p=s.pending,a=p.kind==='reveal'?{type:'ack'}:p.kind==='ext'&&p.stage==='reveal'?{type:'invoke',value:'ack'}:{type:'pass'};s=step(s,a)}assert.ok(n<100);return s}
test('classic military adds exactly 52 cards without changing old IDs; 108 remains default',()=>{
 const d=makeMilitaryDeck(),extra=d.slice(108);assert.equal(d.length,160);assert.deepEqual(d.slice(0,108),catalog.makeDeck());assert.equal(new Set(d.map(c=>c.id)).size,160)
 const count=t=>extra.filter(c=>c.type===t).length;assert.equal(count('firesha'),5);assert.equal(count('thundersha'),9);assert.equal(count('wine'),5);assert.equal(count('ironchain'),6);assert.equal(count('fireattack'),3);assert.equal(count('supplyshortage'),2);assert.equal(count('vine'),2);assert.equal(count('nullify'),3)
 for(const suit of ['spade','heart','club','diamond'])assert.deepEqual(extra.filter(c=>c.suit===suit).map(c=>c.rank),Array.from({length:13},(_,i)=>i+1))
 assert.equal(createSetup().deckVersion,1);assert.equal(createSetup({deckVersion:2}).deckVersion,2)
 for(const deckVersion of [1,2]){const s=fixture({deckVersion});assert.deepEqual(restoreGame(s),s);const bad=structuredClone(s);bad.deckVersion=3;assert.equal(restoreGame(bad),null)}
})
test('new heroes have complete distinct original profiles and original HP',()=>{
 for(const [id,base,skills,hp]of [['randeng','zhangjiao',['leiji','guidao','huangtian'],3],['yuanshi','yuanshao',['luanji','xueyi'],4],['muzha','xuhuang',['duanliang'],4]]){const h=HERO_BY_THEME_ID[id];assert.ok(h.playable);assert.equal(h.baseHero,base);assert.equal(h.hp,hp);assert.deepEqual(Object.keys(h.skillNames),skills)}
})
test('conversion keeps two original Slash faces, suits/ranks and physical Nullify count',()=>{
 let s=fixture({heroes:['yuanshi','randeng','muzha','taiyi','nezha']});const a=give(s,0,'sha',c=>c.suit==='spade'),b=give(s,0,'sha',c=>c.suit==='spade'),before=structuredClone([a,b]),nullifies=allCards(s).filter(c=>c.type==='nullify').length;s=settle(step(s,{type:'skill',skill:'luanji',ids:[a.id,b.id]}));assert.equal(s.lastPlayed.as,'arrows');assert.deepEqual(s.lastPlayed.cards,before);const shown=trailCards(tableTrail([],playerView(s,0))).filter(e=>e.key.startsWith('play:'));assert.equal(shown.length,2);for(const e of shown){assert.equal(printedCard(e.card).type,'sha');assert.ok(cardFace(e.card).includes('data-type="sha"'));assert.ok(cardFace(e.card).includes('♠'))}assert.equal(allCards(s).filter(c=>c.type==='nullify').length,nullifies)
 const physical={id:'test',type:'nullify',suit:'spade',rank:12};assert.deepEqual(printedCard(effectiveCard({effectiveSkills:['hongyan']},physical)).suit,'spade');assert.ok(cardFace({id:'delay',type:'supplyshortage',physicalType:'sha',suit:'spade',rank:7}).includes('data-type="sha"'))
})
for(const type of ['sha','firesha','thundersha'])test(type+' preserves correct chain nature and clears chains only on attribute damage',()=>{
 let s=fixture({heroes:['nezha','yuanshi','muzha','taiyi','randeng']});s.players[1].chained=s.players[2].chained=true;const c=give(s,0,type),hp=s.players.map(p=>p.hp);s=settle(step(s,{type:'play',as:'sha',ids:[c.id],targets:[1]}));assert.equal(s.players[1].hp,hp[1]-1);assert.equal(s.players[2].hp,hp[2]-(type==='sha'?0:1));assert.equal(s.players[2].chained,type==='sha')
})
test('physical chain recasts or targets two people; wine strengthens attribute Slash',()=>{
 let s=fixture({heroes:['nezha','yuanshi','muzha','taiyi','randeng']});let c=give(s,0,'ironchain');s=step(s,{type:'play',as:'ironchain',ids:[c.id],targets:[1,2]});assert.ok(s.players[1].chained&&s.players[2].chained)
 c=give(s,0,'wine');s=step(s,{type:'play',as:'wine',ids:[c.id],targets:[]});c=give(s,0,'firesha');const hp=s.players[2].hp;s=settle(step(s,{type:'play',as:'sha',ids:[c.id],targets:[1]}));assert.equal(s.players[2].hp,hp-2);assert.equal(s.players[0].marks.wine,0)
 s=fixture();c=give(s,0,'ironchain');s=step(s,{type:'play',as:'ironchain',ids:[c.id],targets:[]});assert.equal(s.players[0].hand.length,1)
})
test('fire attack uses visible shown suit and discards matching hand card; counter is allowed',()=>{
 let s=fixture();const fire=give(s,0,'fireattack'),cost=give(s,0,'sha',c=>c.suit==='spade'),shown=give(s,1,'sha',c=>c.suit==='spade'),hp=s.players[1].hp
 s=step(s,{type:'play',as:'fireattack',ids:[fire.id],targets:[1]});assert.equal(s.pending.stage,'fire-show');s=step(s,{type:'invoke',value:'confirm',ids:[shown.id]});s=step(s,{type:'invoke',value:'ack'});assert.equal(s.pending.stage,'fire-discard');s=step(s,{type:'invoke',value:'confirm',ids:[cost.id]});assert.equal(s.players[1].hp,hp-1)
})
test('original thunder judgment does not heal and only spade deals two; can decline',()=>{
 for(const suit of ['spade','club']){let s=fixture();s.current=1;const sha=give(s,1,'sha'),shan=give(s,0,'shan'),hp=s.players[1].hp;s.players[0].hp--;const ownHp=s.players[0].hp;top(s,suit);s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]});s=step(s,{type:'respond',as:'shan',ids:[shan.id]});assert.equal(s.pending.skill,'leiji');s=step(s,{type:'invoke',value:'confirm',target:1,ids:[]});assert.equal(s.pending.hit,suit==='spade');s=settle(s);assert.equal(s.players[1].hp,hp-(suit==='spade'?2:0));assert.equal(s.players[0].hp,ownHp)}
})
test('Guidao replaces with black equipment and obtains old judgment; rejects red',()=>{
 let s=fixture();s.current=1;const sha=give(s,1,'sha'),shan=give(s,0,'shan'),black=equip(s,0,'qinggang'),red=give(s,0,'tao');const old=top(s,'heart');s=step(s,{type:'play',as:'sha',ids:[sha.id],targets:[0]});s=step(s,{type:'respond',as:'shan',ids:[shan.id]});s=step(s,{type:'invoke',value:'confirm',target:1,ids:[]});assert.equal(s.pending.skill,'guidao');assert.ok(playerView(s,0).legal.some(a=>a.ids?.[0]===black.id));assert.ok(!playerView(s,0).legal.some(a=>a.ids?.[0]===red.id));s=step(s,{type:'respond',as:'judgment',ids:[black.id]});assert.ok(s.players[0].hand.some(c=>c.id===old.id));assert.equal(s.players[0].equip.weapon,null);assert.equal(s.pending.hit,true);s=settle(s);assert.equal(s.players[1].hp,2)
})
test('two Shans trigger two independent original thunder judgments',()=>{
 let s=fixture({heroes:['randeng','huangfeihu','muzha','taiyi','yuanshi']});s.current=1;const c=give(s,1,'sha'),a=give(s,0,'shan'),b=give(s,0,'shan');s=step(s,{type:'play',as:'sha',ids:[c.id],targets:[0]});s=step(s,{type:'respond',as:'shan',ids:[a.id]});assert.equal(s.pending.skill,'leiji');s=step(s,{type:'pass'});assert.equal(s.pending.remaining,1);s=step(s,{type:'respond',as:'shan',ids:[b.id]});assert.equal(s.pending.skill,'leiji');s=step(s,{type:'pass'});assert.equal(s.pending,null)
})
test('Luanji uses exactly two same-suit HAND cards, can repeat, never equipment',()=>{
 let s=fixture({heroes:['yuanshi','randeng','muzha','taiyi','nezha']});const a=give(s,0,'sha',c=>c.suit==='spade'),b=give(s,0,'sha',c=>c.suit==='spade'),bad=give(s,0,'tao'),weapon=equip(s,0,'qinggang');assert.ok(playerView(s,0).legal.some(o=>o.as==='arrows'&&o.ids.length===2));assert.ok(!playerView(s,0).legal.some(o=>o.as==='arrows'&&o.ids.includes(weapon.id)));assert.ok(!dispatch(s,{seat:0,type:'skill',skill:'luanji',ids:[a.id,bad.id]}).ok);s=settle(step(s,{type:'skill',skill:'luanji',ids:[a.id,b.id]}));assert.ok(s.discard.some(c=>c.id===a.id));assert.equal(s.players[1].hp,2)
})
test('lord hand limit counts other living Qun; team and non-lord never get lord bonus',()=>{
 let s=fixture({heroes:['yuanshi','randeng','muzha','taiyi','nezha']});for(let i=0;i<10;i++)give(s,0,'sha');s=step(s,{type:'end'});assert.equal(s.pending.kind,'discard');assert.equal(s.pending.count,1) // 5HP + 2 other Qun *2 (Randeng, Taiyi)
})
test('Huangtian donor must be Qun; gives actual Shan/Lightning once, disabled in team',()=>{
 let s=fixture();s.current=1;const c=give(s,1,'shan');assert.ok(playerView(s,1).legal.some(a=>a.skill==='huangtian'));s=step(s,{type:'skill',skill:'huangtian',target:0,ids:[c.id]});assert.ok(s.players[0].hand.some(h=>h.id===c.id));assert.ok(!playerView(s,1).legal.some(a=>a.skill==='huangtian'));s.current=2;give(s,2,'shan');assert.ok(!playerView(s,2).legal.some(a=>a.skill==='huangtian'))
})
test('Duanliang black basic/equipment conversion, range two, saves and skips draw only',()=>{
 for(const suit of ['heart','club']){let s=fixture({heroes:['muzha','yuanshi','randeng','taiyi','nezha']});const c=give(s,0,'sha',c=>c.suit==='spade');assert.ok(playerView(s,0).legal.some(a=>a.as==='supplyshortage'&&a.targets[0]===2));assert.ok(!playerView(s,0).legal.some(a=>a.as==='supplyshortage'&&a.targets.includes(0)));s=step(s,{type:'play',as:'supplyshortage',ids:[c.id],targets:[2]});assert.equal(s.players[2].virtualJudgments[c.id],'supplyshortage');s.current=1;top(s,suit);s=step(s,{type:'end'});while(s.pending)s=step(s,{type:s.pending.kind==='reveal'?'ack':'pass'});assert.equal(s.current,2);assert.equal(s.phase,'play');assert.equal(s.players[2].hand.length,suit==='club'?2:0);assert.equal(s.players[2].judgment.length,0)}
})
test('all 57 profiles finish military AI matches with 160 conserved cards and restorable prompts',()=>{
 for(let i=0;i<PLAYABLE_HEROES.length;i++){const heroes=[PLAYABLE_HEROES[i].id,...PLAYABLE_HEROES.filter((_,j)=>j!==i).slice(0,4).map(h=>h.id)];let s=createAssignedGame({heroIds:heroes,roles:['lord','loyal','rebel','rebel','renegade'],seed:i+31,deckVersion:2}),n=0;while(!s.winner&&n++<3500)s=step(s,chooseAI(playerView(s,s.pending?.actor??s.current)));assert.ok(s.winner,heroes[0]+' did not finish')}
})
test('virtual supply remains restorable on Hongyan recipient; original physical suit never mutates',()=>{
 let s=fixture({heroes:['muzha','longji','randeng','taiyi','nezha'],deckVersion:1});const c=give(s,0,'sha',c=>c.suit==='spade');s=step(s,{type:'play',as:'supplyshortage',ids:[c.id],targets:[1]});assert.equal(s.players[1].judgment[0].suit,'spade');assert.equal(playerView(s,1).players[1].judgment[0].type,'supplyshortage');assert.ok(restoreGame(s))
})
test('pre-draw Shensu attacker killed by redirected damage advances to next turn instead of freezing',()=>{
 let s=fixture({heroes:['huangtianhua','longji','muzha','taiyi','nezha'],deckVersion:1});s.players[0].role='loyal';s.players[0].maxHp--;s.players[0].hp=1;s.players[2].role='lord';s.players[2].hp=s.players[2].maxHp+=1;s.current=4;const cost=give(s,1,'tao',c=>c.suit==='heart');s=step(s,{type:'end'});assert.equal(s.pending.kind,'shensu');s=step(s,{type:'rush',target:1,ids:[],mode:1});s=step(s,{type:'pass'});assert.equal(s.pending.skill,'tianxiang');s=step(s,{type:'invoke',value:'confirm',target:0,ids:[cost.id]});s=settle(s);assert.equal(s.players[0].alive,false);assert.equal(s.current,1);assert.equal(s.phase,'play')
})
