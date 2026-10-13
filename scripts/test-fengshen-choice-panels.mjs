import {stableOpponents} from './fixtures/gods-stable.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createAssignedGame,createGame,dispatch,playerView,allCards,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
import {restoreSession} from '../site/.vuepress/components/fengshen/setup.mjs'
import {panelSelection,panelAction,harvestSeat,cleanRoleMarks,nextRoleMark,choicePanelGeometry} from '../site/.vuepress/components/fengshen/panel-selection.mjs'
import {harvestEffects} from '../site/.vuepress/components/fengshen/draw-effects.mjs'
import {renderCenter,renderControls,renderOpponent} from '../site/.vuepress/components/fengshen/table.mjs'
const model=s=>({state:s,selected:[],targets:[],targetable:()=>[],equipment:()=>'',matching:()=>[],currentAs:()=>null})
function fixture(){const s=stableOpponents(createGame({heroId:'yangjian',role:'lord',seed:17}));s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp;p.alive=true}return s}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,108);assert.equal(new Set(allCards(r.state).map(c=>c.id)).size,108);return r.state}
const select=(v,index=0,selection)=>panelSelection({view:v,index,selection,promptId:String(v.pending.id),revision:String(v.revision)})
test('Sun form selection highlights hero and skill, previews, and always owns an explicit confirm',()=>{
 const s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['sunwukong','jifa','nezha','yangjian','dixin'],seed:71}),v=playerView(s,0),ui=model(s);assert.equal(v.pending.kind,'incarnation')
 let html=renderCenter(ui,v);assert.ok(html.includes('确认变身'));assert.match(html,/data-action="panel-confirm"[^>]*disabled/)
 const first=select(v);assert.equal(first.kind,'select');ui.panelSelection=first.selection;html=renderCenter(ui,v);assert.ok(html.includes('fs-incarnation-entry selected'));assert.ok(html.includes('aria-pressed="true"'));assert.ok(html.includes('aria-live="polite"'));assert.ok(!/data-action="panel-confirm"[^>]*disabled/.test(html));assert.deepEqual(panelAction(v,first.selection),v.legal[0]);assert.equal(select(v,0,first.selection).kind,'commit');assert.ok(!html.includes('data-action="response" data-value="0"'))
 assert.equal(playerView(step(s,panelAction(v,first.selection)),0).players[0].incarnation.activeSkill,v.legal[0].skill)
})
test('selection rejects stale prompt, revision, option, or other actor; moving to another choice does not commit',()=>{
 const v={seat:0,revision:9,pending:{kind:'incarnation',id:4,actor:0},legal:[{type:'transform',heroId:'ganning',skill:'qixi'},{type:'transform',heroId:'daqiao',skill:'guose'}]},first=select(v).selection
 assert.equal(select(v,1,first).kind,'select')
 for(const changed of [{revision:10},{pending:{...v.pending,id:5}},{pending:{...v.pending,actor:1}},{legal:[v.legal[1]]}])assert.equal(panelAction({...v,...changed},first),null)
 for(const changed of [{promptId:3},{revision:8},{index:-1},{index:NaN}])assert.equal(panelSelection({view:v,selection:first,index:0,promptId:4,revision:9,...changed}).kind,'ignore')
})
test('harvest selects/highlights before confirmation, cues expose only public face and actual recipient',()=>{
 let s=fixture(),i=s.deck.findIndex(c=>c.type==='harvest'),c=s.deck.splice(i,1)[0];s.players[0].hand.push(c);s=step(s,{type:'play',ids:[c.id],as:'harvest',targets:[]});const v=playerView(s,0),first=select(v),ui={...model(s),panelSelection:first.selection},picked=v.legal[0].card
 assert.equal(harvestSeat(v),0);const html=renderCenter(ui,v);assert.ok(html.includes('获取选中牌'));assert.ok(html.includes('fs-choice-card selected'));assert.ok(html.includes(`data-pool-card="${picked.id}"`));assert.ok(html.includes('aria-pressed="true"'))
 const before=s;s=step(s,panelAction(v,first.selection));const effects=harvestEffects(before,s);assert.equal(effects.length,1);assert.equal(effects[0].target,0);assert.equal(effects[0].card.id,picked.id);assert.ok(s.players[0].hand.some(c=>c.id===picked.id));assert.equal(playerView(s,3).players[0].hand.length,0);assert.deepEqual(harvestEffects(s,s),[])
 assert.equal(harvestSeat(playerView(s,0)),1);assert.equal(panelAction(playerView(s,0),first.selection),null)
})
test('harvest counter keeps the public pool visible so the nullify decider can see it; recipient still identified',()=>{
 const s=fixture(),v=playerView(s,0),c=catalog.makeDeck().find(c=>c.type==='harvest');v.lastPlayed={id:4,as:'harvest',source:1,targets:[],turn:v.turns,cards:[c]};v.harvestPool=catalog.makeDeck().slice(0,5);v.pending={id:2,kind:'counter',actor:0,target:3,source:1,cardType:'harvest'}
 assert.equal(harvestSeat(v),3)
 // 破法询问期间保留牌池面板（池子是公开信息，持有无懈者要边看边决定），而不是整块藏起来。
 const html=renderCenter(model(s),v)
 assert.ok(html.includes('fs-pool-choice'),'pool stays visible while deciding nullify')
 assert.ok(html.includes('等待破法结算'),'pool panel shows the countering note')
 assert.equal(harvestSeat({...v,pending:{...v.pending,cardType:'draw'}}),null)
 // 非五谷的无懈询问仍只显示公开出牌区，不残留牌池面板。
 const other={...v,lastPlayed:{...v.lastPlayed,as:'draw'},harvestPool:[]}
 assert.ok(!renderCenter(model(s),other).includes('fs-pool-choice'))
})
test('judge replacement has explicit confirm and selected hand follows exact legal response',()=>{
 const s=fixture(),v=playerView(s,0),c=catalog.makeDeck()[0];v.pending={kind:'judge-replace',actor:0,target:1,id:4};v.legal=[{type:'respond',ids:[c.id],as:'judgment'},{type:'pass'}]
 assert.match(renderControls(model(s),v),/data-action="confirm"[^>]*disabled/);assert.ok(!/data-action="confirm"[^>]*disabled/.test(renderControls({...model(s),selected:[c.id]},v)));assert.ok(renderControls({...model(s),selected:[c.id]},v).includes('确认改判'))
})
test('damage-triggered take uses the same highlighted card and in-panel confirmation as snatch',()=>{
 let s=createAssignedGame({roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['wenzhong','nezha','jifa','yangjian','dixin'],seed:17});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=1;for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp}
 for(const [seat,type]of [[1,'sha'],[1,'shan']]){const i=s.deck.findIndex(c=>c.type===type);s.players[seat].hand.push(s.deck.splice(i,1)[0])}const attack=s.players[1].hand[0];s=step(s,{type:'play',as:'sha',ids:[attack.id],targets:[0]});s=step(s,{type:'pass'});assert.equal(s.pending.kind,'choice');assert.equal(s.pending.skill,'fankui');s=step(s,{type:'choose',value:'yes'});assert.equal(s.pending.kind,'take');const v=playerView(s,0),html=renderCenter({...model(s),choiceIndex:0,choiceZone:'hand'},v);assert.ok(html.includes('fs-choice-dialog fs-take-choice'));assert.ok(html.includes('fs-choice-card selected'));assert.ok(html.slice(html.indexOf('<footer>')).includes('获得选中牌'))
})
test('equipment in the take panel shows a range/±1/armor badge so horses are distinguishable',async()=>{
 const s=fixture(),deck=catalog.makeDeck()
 const horse=deck.find(c=>c.type==='dilu'),weapon=deck.find(c=>c.type==='qinggang'),armor=deck.find(c=>c.type==='renwang')
 s.pending={kind:'take',id:4,actor:0,source:0,target:1,mode:'snatch'}
 const v=playerView(s,0)
 v.legal=[{type:'choose',value:horse.id,card:horse,zone:'equipment'},{type:'choose',value:weapon.id,card:weapon,zone:'equipment'},{type:'choose',value:armor.id,card:armor,zone:'equipment'}]
 const html=renderCenter({...model(s),choiceZone:'equipment'},v)
 assert.ok(html.includes('<b class="fs-choice-effect">+1</b>'),'defensive horse shows +1')
 assert.ok(html.includes('<b class="fs-choice-effect">距2</b>'),'weapon shows attack range')
 assert.ok(html.includes('<b class="fs-choice-effect">防</b>'),'armor shows 防')
 const css=await readFile(new URL('../site/.vuepress/components/fengshen/table.css',import.meta.url),'utf8')
 assert.ok(css.includes('.fs-choice-effect{'),'badge has styling')
})
test('private identity guesses cycle without revealing roles or changing AI state; reveal supersedes guess',()=>{
 const s=fixture(),v=playerView(s,0),p=v.players.find(p=>p.seat!==0&&!p.role),original=JSON.stringify(s);let marks={};for(const role of ['loyal','rebel','renegade',undefined]){marks=nextRoleMark(v,marks,p.seat);assert.equal(marks[p.seat],role)}
 marks=nextRoleMark(v,{},p.seat);const html=renderOpponent({...model(s),roleMarks:marks},p,v);assert.ok(html.includes('data-action="role-mark"'));assert.ok(html.includes('身份猜测：忠臣'));assert.ok(html.includes('<i>猜</i>'));assert.equal(JSON.stringify(s),original)
 const revealed={...v,players:v.players.map(t=>t.seat===p.seat?{...t,role:'rebel',alive:false}:t)};assert.deepEqual(cleanRoleMarks(revealed,marks),{});assert.ok(!renderOpponent({...model(s),roleMarks:marks},revealed.players[p.seat],revealed).includes('data-action="role-mark"'));assert.deepEqual(cleanRoleMarks({...v,teamMode:true},marks),{})
})
test('guess sidecar resumes with existing session format; old bare-state saves still load',()=>{
 const s=fixture(),raw={kind:'game',game:s,roleMarks:{1:'loyal'}};assert.ok(restoreSession(raw));assert.ok(restoreSession(s));assert.equal(restoreSession(raw).game.roleMarks,undefined);assert.deepEqual(raw.roleMarks,{1:'loyal'})
})
test('all panel geometry reserves short-landscape safe areas and fixed action footer',async()=>{
 for(const height of [240,270,320,390,430,568,844])for(const safeTop of [0,47])for(const safeBottom of [0,21,34]){const g=choicePanelGeometry({height,safeTop,safeBottom});assert.ok(g.top>=safeTop+28);assert.ok(g.top+g.height<=height-safeBottom-8+.01);assert.ok(g.height>=110)}
 const css=await readFile(new URL('../site/.vuepress/components/fengshen/arena-table.css',import.meta.url),'utf8');assert.ok(css.includes('height:var(--choice-height'));assert.ok(css.includes('>footer{display:flex;flex:none'));assert.ok(css.includes('.fs-choice-dialog>.fs-incarnation-options'));assert.ok(css.includes('.fs-role-marker'));assert.ok(css.includes('.fs-pick-focus'))
 const flight=await readFile(new URL('../site/.vuepress/components/fengshen/combat.css',import.meta.url),'utf8');assert.ok(flight.includes('span:last-child:not(.fs-clean-card):not(.fs-card-back)'));assert.ok(flight.includes('.fs-transfer-flight>.fs-clean-card'))
})
