import {stableOpponents} from './fixtures/gods-stable.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createAssignedGame,dispatch,playerView,catalog,allCards,restoreGame} from '../.private/fengshen/engine.mjs'
import {targetLinks,judgingSeat,counterSelection,counterAction} from '../.private/fengshen/table-visuals.mjs'
import {seatName} from '../.private/fengshen/combat.mjs'
import {tableTrail,trailCards,tableCardLayout,counterTrail,recentWithFocus} from '../.private/fengshen/table-trail.mjs'
import {judgmentEffects} from '../.private/fengshen/draw-effects.mjs'
import {renderCenter,renderBattle,renderControls} from '../.private/fengshen/table.mjs'
import {arenaGeometry} from '../.private/fengshen/arena-layout.mjs'
const fixture=(own='yangjian',current=0)=>{const s=createAssignedGame({heroIds:[own,'jifa','nezha','dixin','moliqing'],roles:['lord','loyal','rebel','rebel','renegade'],seed:37});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.queue=[];s.harvestPool=[];s.pending=null;s.lastPlayed=null;s.lastResponse=null;s.exchange=null;s.current=current;s.phase='play';for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.hp=p.maxHp;p.marks={sha:0}}return s}
const card=(s,seat,type)=>{const i=s.deck.findIndex(c=>c.type===type),c=s.deck.splice(i,1)[0];assert.ok(c);s.players[seat].hand.push(c);return c}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,108);assert.equal(new Set(allCards(r.state).map(c=>c.id)).size,108);return r.state}
const ui=s=>({state:s,selected:[],targets:[],choiceIndex:null,skill:null,hints:false,header:()=>'',targetable:()=>[],matching:()=>[],currentAs:()=>null,equipment:()=>'',skills:()=>'',won:()=>false,pendingText:()=>''})
test('single-target tricks and skill taking draw public yellow links during counter/take',()=>{
 for(const type of ['snatch','dismantle','duel','collateral']){let s=fixture(),c=card(s,0,type);card(s,1,'shan');card(s,2,'nullify');if(type==='collateral'){const w=card(s,1,'qinggang');s.players[1].hand.pop();s.players[1].equip.weapon=w}const targets=type==='collateral'?[1,0]:[1];s=step(s,{type:'play',ids:[c.id],as:type,targets});assert.equal(s.pending.kind,'counter');assert.deepEqual(targetLinks(playerView(s,0)),type==='collateral'?[{source:0,target:1},{source:1,target:0}]:[{source:0,target:1}])}
 const v=playerView(fixture(),0);v.pending={kind:'take',actor:0,target:1,source:0};assert.deepEqual(targetLinks(v),[{source:0,target:1}])
})
test('all-player tricks show every living victim before the attack response, never dead seats',()=>{
 for(const type of ['arrows','savage','garden','harvest']){let s=fixture(),c=card(s,0,type);card(s,2,'nullify');s=step(s,{type:'play',ids:[c.id],as:type,targets:[]});const v=playerView(s,0);assert.equal(v.pending.kind,'counter');assert.deepEqual(targetLinks(v).map(l=>l.target),[1,2,3,4]);v.players[4].alive=false;assert.deepEqual(targetLinks(v).map(l=>l.target),[1,2,3])}
})
test('delayed nullify highlights the judging owner and cannot inherit a stale attacker',()=>{
 const v=playerView(fixture(),0);v.lastPlayed={source:3,targets:[2],as:'sha',turn:v.turns};for(const kind of ['counter','reveal','judge-replace']){v.pending={kind,target:1,source:null};assert.equal(judgingSeat(v),1);assert.deepEqual(targetLinks(v),[])}
 v.pending=null;v.lastPlayed.turn--;assert.deepEqual(targetLinks(v),[])
})
test('counter auto-selects one legal hand card once per window and preserves manual replacement',()=>{
 let s=fixture('yangjian',1),spell=card(s,1,'snatch');card(s,0,'shan');card(s,0,'nullify');card(s,0,'nullify');s=step(s,{type:'play',ids:[spell.id],as:'snatch',targets:[0]});const v=playerView(s,0),first=counterSelection(v,null,[]),answers=v.legal.filter(a=>a.type==='respond');assert.deepEqual(first.selected,answers[0].ids);assert.deepEqual(counterSelection(v,first.key,answers[1].ids).selected,answers[1].ids);assert.deepEqual(counterSelection(v,first.key,[]).selected,[]);assert.notEqual(counterSelection({...v,revision:v.revision+1},first.key,[]).key,first.key);assert.deepEqual(counterSelection({...v,pending:{...v.pending,actor:2}},null,[]).selected,[])
 const model=ui(s);model.selected=first.selected;const html=renderBattle(model);assert.ok(!html.includes('fs-counter-choice'));assert.ok(!html.includes('fs-status'));assert.ok(html.includes('counter-ready'));assert.ok(html.includes('发动破法'));assert.ok(html.includes('不发动'));assert.ok(!renderCenter(model,v).includes(first.selected[0]))
})
test('two nullifies restore the single-target effect and its mark even if the chain immediately finishes',()=>{
 let s=fixture('yangjian',1),spell=card(s,1,'dismantle'),other=card(s,1,'nullify'),counter=card(s,0,'nullify');card(s,0,'shan');s=step(s,{type:'play',ids:[spell.id],as:'dismantle',targets:[0]});assert.equal(s.pending.actor,1);s=step(s,{type:'pass'});assert.equal(s.pending.actor,0);let trail=tableTrail([],playerView(s,0));s=step(s,{type:'respond',ids:[counter.id]});assert.equal(playerView(s,0).pending.negated,true);trail=tableTrail(trail,playerView(s,0));assert.equal(trail.find(e=>e.key.startsWith('play:')).negated,true);const model=ui(s);model.tableTrail=trail;assert.ok(renderCenter(model,playerView(s,0)).includes('效果已被抵消'));s=step(s,{type:'respond',ids:[other.id]});assert.equal(s.pending.kind,'take');trail=tableTrail(trail,playerView(s,0));assert.equal(trail.find(e=>e.key.startsWith('play:')).negated,false);assert.ok(restoreGame(s))
})
test('counter confirmation cooldown blocks an accidental rapid second response, not intentional later reversal',()=>{
 const v={seat:0,pending:{kind:'counter',actor:0},legal:[{type:'respond',ids:['public-own-1']},{type:'pass'}]};assert.equal(counterAction(v,['public-own-1'],{blockedUntil:1700,now:1100}),null);assert.equal(counterAction(v,['public-own-1'],{blockedUntil:1700,now:1700}).type,'respond');assert.equal(counterAction(v,['other'],{now:1800}),null);assert.equal(counterAction({...v,pending:{kind:'counter',actor:1}},['public-own-1']),null)
})
test('area effect cancellation applies only to this victim, not a permanent cancellation of the entire card',()=>{
 const v=playerView(fixture(),0),c=catalog.makeDeck().find(c=>c.type==='arrows');v.lastPlayed={id:4,source:0,targets:[],as:'arrows',cards:[c],turn:v.turns};v.exchange=[{source:0,cards:[c],as:'arrows'},{source:2,cards:[catalog.makeDeck().find(c=>c.type==='nullify')],as:'nullify'}];v.pending={kind:'counter',source:0,target:1,negated:true};let trail=tableTrail([],v);assert.equal(trail[0].negated,true);v.pending={kind:'response',source:0,target:2};trail=tableTrail(trail,v);assert.equal(trail[0].negated,false)
})
test('revealed judgment is a real table card with a stamp, not a panel; replacements remain public',()=>{
 const s=fixture(),v=playerView(s,0),c=catalog.makeDeck()[0];for(const hit of [true,false]){v.pending={kind:'reveal',id:6,actor:0,target:0,card:c,delayType:'indulgence',hit};const html=renderCenter(ui(s),v);assert.ok(html.includes('fs-compact-table'));assert.ok(!html.includes('fs-center-choice'));assert.ok(!html.includes('fs-judgment-reveal'));assert.ok(html.includes(`data-judge-hit="${hit}"`));assert.ok(html.includes('data-judge-card="'+c.id+'"'))}
 v.pending={kind:'judge-replace',id:7,actor:1,target:0};v.judgmentCard=c;assert.ok(renderCenter(ui(s),v).includes('data-judge-card="'+c.id+'"'))
})
test('rejudge prompt and final judgment share one physical card instead of duplicating faces',()=>{
 const s=fixture(),v=playerView(s,0),c=catalog.makeDeck().find(c=>c.suit==='heart')
 // 有改判权但未改判：先亮出这张判定牌（无命中戳记）。
 v.pending={kind:'judge-replace',id:6,actor:1,target:0};v.judgmentCard=c
 let trail=tableTrail([],v)
 assert.equal(trail.filter(e=>e.key===`judge:${c.id}`).length,1)
 assert.equal(trail.find(e=>e.key===`judge:${c.id}`).hit,undefined)
 // 判定完成：命中结果直接盖在同一张牌上，不再另起一张复制牌。
 v.pending={kind:'reveal',id:7,actor:0,target:0,card:c,delayType:'indulgence',hit:true}
 trail=tableTrail(trail,v)
 const judge=trail.filter(e=>e.key===`judge:${c.id}`)
 assert.equal(judge.length,1,'改判询问与最终判定共用同一张牌位')
 assert.equal(judge[0].hit,true,'命中戳记盖在原判定牌上')
 assert.equal(trailCards(trail).filter(e=>e.card?.id===c.id).length,1,'牌桌上只有一张实体判定牌')
})
test('a counter window names the exact victim being cancelled, never the whole card',()=>{
 let s=fixture('yangjian',1),spell=card(s,1,'snatch');card(s,0,'shan');card(s,0,'nullify')
 s=step(s,{type:'play',ids:[spell.id],as:'snatch',targets:[0]})
 const v=playerView(s,0);assert.equal(v.pending.kind,'counter');assert.equal(v.pending.actor,0)
 const html=renderControls(ui(s),v)
 assert.ok(html.includes('fs-counter-note'),'破法按钮旁必须点名本次抵消的目标')
 assert.ok(html.includes('抵消')&&html.includes('摄宝')&&html.includes(seatName(v,0)))
 // 二次破法恢复效果时，提示同样点名目标。
 const restored=renderControls(ui(s),{...v,pending:{...v.pending,negated:true}})
 assert.ok(restored.includes('恢复')&&restored.includes(seatName(v,0)))
})
test('Luoshen reveals black/red publicly, moves only black to hand, and emits no private hand data',()=>{
 for(const black of [true,false]){let s=fixture('shiji',4),i=s.deck.findIndex(c=>c.suit===(black?'spade':'heart')&&c.rank===5),c=s.deck.splice(i,1)[0];s.deck.unshift(c);s=step(s,{type:'end'});assert.equal(s.pending.skill,'luoshen');s=step(s,{type:'choose',value:'yes'});assert.equal(s.pending.kind,'reveal');assert.equal(s.pending.hit,black);assert.equal(playerView(s,3).pending.card.id,c.id);const before=s;s=step(s,{type:'ack'});const effects=judgmentEffects(before,s);assert.equal(effects.length,black?1:0);if(black){assert.equal(effects[0].card.id,c.id);assert.deepEqual(Object.keys(effects[0]).sort(),['card','id','kind','target']);assert.deepEqual(playerView(s,3).players[0].hand,[]);assert.equal(playerView(s,3).logs.find(l=>l.cue?.kind==='judgment-keep').cue.card.id,c.id)}assert.deepEqual(judgmentEffects(s,s),[])}
})
test('delayed counter completion updates the marker without referring to a previous-turn exchange',()=>{
 const v=playerView(fixture(),0),c=catalog.makeDeck().find(c=>c.type==='indulgence');v.players[0].judgment=[c];v.pending={kind:'counter',id:2,source:null,target:0,cardType:'indulgence',negated:false};let trail=tableTrail([],v);trail=counterTrail(trail,v);assert.equal(trail[0].negated,true);v.pending.negated=true;trail=counterTrail(trail,v);assert.equal(trail[0].negated,false)
})
test('public trail retains multiple plays and responses, is bounded, non-mutating and clears on a new turn',()=>{
 const v=playerView(fixture(),0);let trail=[];for(let i=1;i<18;i++){v.lastPlayed={id:i,source:1,cards:[catalog.makeDeck()[i]],as:catalog.makeDeck()[i].type,turn:v.turns};v.exchange=null;const previous=trail,old=JSON.stringify(previous);trail=tableTrail(trail,v);assert.equal(tableTrail(trail,v).length,trail.length);assert.equal(trail.length,Math.min(i,12));assert.equal(JSON.stringify(previous),old)}assert.equal(trailCards(trail).length,12);v.turns++;assert.deepEqual(tableTrail(trail,v),[]);assert.ok(!JSON.stringify(trail).includes('hand'))
})
test('many responses cannot crowd the current spell or judgment out of a small table',()=>{
 const v=playerView(fixture(),0),cards=catalog.makeDeck();v.lastPlayed={id:1,source:0,cards:[cards[0]],as:cards[0].type,turn:v.turns};v.exchange=Array.from({length:20},(_,i)=>({source:i%5,cards:[cards[i]],as:cards[i].type}));const trail=tableTrail([],v),faces=trailCards(trail);assert.equal(trail.length,12);assert.equal(faces.length,12);assert.ok(faces.some(e=>e.key==='play:1:0'));assert.ok(recentWithFocus(faces,3).some(e=>e.key==='play:1:0'));v.pending={id:5,kind:'reveal',target:0,card:cards[30],hit:true,delayType:'indulgence'};const next=trailCards(tableTrail(trail,v));assert.ok(recentWithFocus(next,1)[0].judgment);assert.equal(recentWithFocus(next,0).length,0)
})
test('table grid fits phone safe-area centers, keeps recent cards, can use two compact rows',()=>{
 let two=false;for(const [width,height]of [[568,320],[844,390],[932,430],[320,568],[390,844],[430,932]])for(const seats of [2,5,8])for(const count of [1,2,6,12]){const landscape=width>height,g=arenaGeometry({width:width-(landscape?118:0),height,seats,safeTop:landscape?0:47,safeBottom:landscape?21:34}),w=g.center.right-g.center.left,h=g.center.bottom-g.center.top,f=tableCardLayout({width:w,height:h,count});assert.ok(f.cardHeight*f.rows+5*(f.rows-1)<=h+.01);assert.ok(f.cardHeight/1.44*f.columns+5*(f.columns-1)<=w+.01);assert.ok(f.visible<=count);assert.ok(f.rows<=2);two||=f.rows===2}assert.ok(two)
})
test('reduced motion and portrait table visibility are explicit; no counter full-screen panel renderer remains',async()=>{
 const css=await readFile(new URL('../.private/fengshen/arena-table.css',import.meta.url),'utf8'),code=await readFile(new URL('../.private/fengshen/table.mjs',import.meta.url),'utf8');assert.ok(css.includes('.fs-compact-table{display:flex'));assert.ok(css.includes('prefers-reduced-motion:reduce'));assert.ok(!code.includes('function counterChoices'));assert.ok(code.includes('fs-counter-controls'))
})
