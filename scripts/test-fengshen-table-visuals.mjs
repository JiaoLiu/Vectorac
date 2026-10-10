import test from 'node:test'
import assert from 'node:assert/strict'
import {makeDeck} from '../.private/fengshen/core/catalog.mjs'
import {createGame,dispatch,playerView,catalog,restoreGame} from '../.private/fengshen/engine.mjs'
import {createEngine} from '../.private/fengshen/core/engine.mjs'
import {targetLinks,judgmentMark,publicPicks,tutorialEnabled,responsePrompt} from '../.private/fengshen/table-visuals.mjs'
import {renderCenter,renderBattle,delayIcons} from '../.private/fengshen/table.mjs'
import {hand} from './fixtures/sanguo.mjs'
import {readFile} from 'node:fs/promises'
function fixture(){const s=createGame({heroId:'yangjian',role:'lord',seed:17});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null;for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}return s}
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
test('recipient prompts do not intercept taps; interactive card-selection panels remain separate',async()=>{
 const s=fixture(),model=ui(s),v=playerView(s,0)
 for(const kind of ['yiji','liuli','tuxi']){v.pending={id:1,actor:0,kind};assert.ok(renderCenter(model,v).includes('fs-skill-prompt'))}
 const css=await readFile(new URL('../.private/fengshen/arena-table.css',import.meta.url),'utf8');assert.match(css,/\.fs-center-choice\.fs-skill-prompt\{pointer-events:none/)
})
test('skill virtual Duel is illustrated without forged suit or rank; opponent cannot see Guanxing pool',()=>{
 const s=fixture(),model=ui(s),v=playerView(s,0);v.lastPlayed={id:1,source:0,targets:[1,2],as:'duel',cards:[],virtualType:'duel',label:'魅惑'}
 const html=renderCenter(model,v);assert.ok(html.includes('data-type="duel"'));assert.ok(html.includes('无实体花色点数'));assert.ok(html.includes('class="fs-rank"><i></i>'))
 v.pending={id:2,actor:1,kind:'guanxing'};v.legal=[];const concealed=renderCenter(model,v);assert.ok(concealed.includes('不能查看'));assert.equal(concealed.includes('data-type='),false)
})
