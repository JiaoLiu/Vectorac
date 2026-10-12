import {stableOpponents} from './fixtures/gods-stable.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,stat} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createGame,dispatch,playerView,restoreGame,allCards,catalog,THEME_VERSION} from '../.private/fengshen/engine.mjs'
import {createEngine} from '../.private/fengshen/core/engine.mjs'
import {makeDeck} from '../.private/fengshen/core/catalog.mjs'
import {hand,equipment,judgeTop} from './fixtures/sanguo.mjs'
import {renderBattle,renderCenter,renderControls,turnActive} from '../.private/fengshen/table.mjs'
import {takeSelection} from '../.private/fengshen/take-selection.mjs'
import {AUDIO_ENTRIES,VOICES} from '../.private/fengshen/audio-manifest.mjs'
import {CardVoice,cuesForAction} from '../.private/fengshen/voice.mjs'
import {playerResources} from '../.private/fengshen/presentation.mjs'
import {roundBreakActive,showRoom,endedTableKey,readEndedTable} from '../.private/fengshen/round-break.mjs'

function fixture(heroId='yangjian',role='lord',current=0){
  const s=stableOpponents(createGame({heroId,role,seed:17}));s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.logs=[];s.lastPlayed=null;s.lastEvent=null
  for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
  return s
}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,108);assert.equal(new Set(allCards(r.state).map(c=>c.id)).size,108);return r.state}
const play=(s,c,target)=>step(s,{type:'play',as:c.type,ids:[c.id],targets:target==null?[]:[target]})
const ui=s=>({state:s,paused:false,selected:[],targets:[],skill:null,choiceIndex:null,choiceZone:'hand',pace:650,voice:{enabled:true},header:()=>'<header></header>',targetable:()=>[],matching:()=>[],currentAs:()=>null,equipment:()=>'',skills:()=>'',won:()=>false,pendingText:()=>''})
test('online round break keeps the board for either finish-event order and on refresh, without changing room lifecycle',()=>{
 const ended={game:{winner:'0'},room:{status:'WAITING',hasPlayed:true}},roomFirst={game:{winner:null},room:{status:'WAITING',hasPlayed:true}},gameFirst={game:{winner:'lord'},room:{status:'PLAYING',hasPlayed:false}}
 for(const v of [ended,roomFirst,gameFirst,{...ended,room:{status:'FINISHED',hasPlayed:true}}]){assert.equal(roundBreakActive(v),true);assert.equal(showRoom(v),false);assert.equal(showRoom({...v,roomView:true}),true)}
 assert.equal(roundBreakActive({...ended,setup:{stage:'others'}}),false);assert.equal(showRoom({...ended,setup:{stage:'others'}}),false)
 assert.equal(showRoom({room:{status:'WAITING',hasPlayed:true},game:null}),true,'no local final snapshot yet: show room until it arrives')
 assert.equal(showRoom({game:{winner:null},room:{status:'WAITING',hasPlayed:false}}),true)
 assert.equal(showRoom({...ended,preview:true}),true)
 const model={online:{roundBreak:true,roundControls:()=>'<button data-online="ready">准备下一轮</button>'}},html=renderControls(model,{winner:'lord'})
 assert.ok(html.includes('准备下一轮'));assert.ok(!html.includes('quit-confirm'),'prepare must never leave the room')
})
test('ended-table cache is per room/player and accepted only for the same settled round and original seat',()=>{
 const cred={roomId:'r',playerId:'p',seatIndex:1},room={hasPlayed:true,status:'WAITING',round:2},v={schema:1,round:2,gameId:'g',version:9,meta:{mySeat:1},game:{winner:'0',players:[{},{}]}},map=new Map([[endedTableKey(cred),JSON.stringify(v)]]),storage={getItem:k=>map.get(k)}
 assert.deepEqual(readEndedTable(storage,cred,room),v)
 for(const bad of [{...room,status:'PLAYING'},{...room,round:3},{...room,hasPlayed:false}])assert.equal(readEndedTable(storage,cred,bad),null)
 for(const other of [{...cred,playerId:'q'},{...cred,roomId:'q'},{...cred,seatIndex:0}])assert.equal(readEndedTable(storage,other,room),null)
 map.set(endedTableKey(cred),'broken');assert.equal(readEndedTable(storage,cred,room),null)
 assert.equal(endedTableKey(null),null)
})
test('public resource badges label HP and hand count without exposing or miscounting redacted hands',()=>{
 for(const handCount of [0,7,30,108])for(const hp of [-1,0,1,2,4]){
  const html=playerResources({seat:3,hp,maxHp:4,handCount,hand:[]})
  assert.ok(html.includes(`aria-label="血量 ${hp}/4"`));assert.ok(html.includes(`aria-label="手牌 ${handCount} 张"`));assert.ok(html.includes(`<b>${handCount}</b>`))
  assert.ok(html.includes('data-hp-tone="'+(hp<=1?'critical':hp<=2?'wounded':'healthy')+'"'))
 }
 assert.ok(playerResources({seat:0,hp:4,maxHp:4,hand:[{},{}]}).includes('手牌 2 张'))
 const s=fixture(),held=hand(s,1,'sha','shan','tao'),html=renderBattle(ui(s))
 assert.ok(html.includes('手牌 3 张'));for(const c of held)assert.ok(!html.includes(`data-id="${c.id}"`),'opponent faces remain hidden')
 assert.equal((html.match(/data-resource="hp"/g)||[]).length,s.players.length)
})

test('take selection commits on a second tap only in the same prompt/revision',()=>{
  const input={pending:{kind:'take',actor:0,id:12},revision:7,legal:[{type:'choose',value:'hand:0'},{type:'choose',value:'hand:1'}],index:0,promptId:'12',eventRevision:'7'}
  const first=takeSelection(input);assert.equal(first.kind,'select')
  assert.deepEqual(takeSelection({...input,selection:first.selection}),{kind:'commit',action:input.legal[0]})
  assert.equal(takeSelection({...input,index:1,selection:first.selection}).kind,'select')
  for(const changed of [{pending:{kind:'take',actor:0,id:13}},{revision:8},{pending:{kind:'take',actor:1,id:12}},{pending:{kind:'pick',actor:0,id:12}},{index:-1},{index:NaN}])assert.equal(takeSelection({...input,selection:first.selection,...changed}).kind,'ignore')
  const next=takeSelection({...input,pending:{kind:'take',actor:0,id:13},promptId:13,selection:first.selection});assert.equal(next.kind,'select','next victim needs a fresh selection')
})
test('snatch and dismantle repeat-tap use only public legal backs and conserve all cards',()=>{
  for(const type of ['snatch','dismantle']){
    let s=fixture();const [spell]=hand(s,0,type),held=hand(s,1,'shan','tao');s=play(s,spell,1)
    const v=playerView(s,0),input={pending:v.pending,revision:v.revision,legal:v.legal,index:1,promptId:v.pending.id,eventRevision:v.revision},first=takeSelection(input),second=takeSelection({...input,selection:first.selection})
    assert.equal(second.kind,'commit');assert.equal(second.action.card,undefined);s=step(s,second.action)
    assert.ok(type==='snatch'?s.players[0].hand.some(c=>c.id===held[1].id):s.discard.some(c=>c.id===held[1].id))
    const center=renderCenter({...ui(s),state:{...s,pending:{mode:type}},choiceIndex:1},{...v});assert.ok(center.includes('data-prompt="'+v.pending.id+'"'));assert.ok(center.includes('data-revision="'+v.revision+'"'));assert.ok(center.includes('再点已选牌或双击'))
    assert.ok(center.slice(center.indexOf('<footer>')).includes('data-action="choose-confirm"'));assert.ok(!renderControls({...ui(s),state:{...s,pending:{mode:type}}},v).includes('choose-confirm'))
  }
})
test('turn badge identifies the turn owner, not a responding or selected player, and disappears at death/end',()=>{
  const s=fixture('yangjian','lord',1),v=playerView(s,0),model=ui(s);v.pending={kind:'response',actor:2};model.targets=[2]
  assert.equal(turnActive(v.players[1],v),true);assert.equal(turnActive(v.players[2],v),false)
  const html=renderBattle(model);assert.ok(html.includes('data-turn-seat="1"'));assert.ok(!html.includes('data-turn-seat="0"'));assert.equal((html.match(/data-turn-seat=/g)||[]).length,1)
  assert.equal(turnActive({...v.players[1],alive:false},v),false);assert.equal(turnActive(v.players[1],{...v,winner:'rebel'}),false)
  s.current=0;assert.ok(renderBattle(ui(s)).includes('fs-own-hero turn-active'))
})

test('indexed hidden choices expose neither card IDs nor faces; selected back is the actual card',()=>{
  let s=fixture();const [snatch]=hand(s,0,'snatch'),held=hand(s,1,'shan','tao','sha');s=play(s,snatch,1)
  const v=playerView(s,0),hidden=v.legal.filter(a=>a.hidden)
  assert.equal(hidden.length,3);assert.deepEqual(hidden.map(a=>a.value),['hand:0','hand:1','hand:2'])
  for(const a of hidden){assert.equal(a.card,undefined);assert.equal(a.id,undefined);assert.equal(a.ids,undefined)}
  const center=renderCenter(ui(s),v);for(const c of held)assert.equal(center.includes(c.id),false)
  assert.equal((center.match(/class="fs-card-back"/g)||[]).length,3)
  const wrong=dispatch(s,{seat:0,type:'choose',value:'hand:30'});assert.equal(wrong.ok,false);assert.deepEqual(wrong.state,s)
  s=step(s,{type:'choose',value:'hand:1'});assert.ok(s.players[0].hand.some(c=>c.id===held[1].id));assert.equal(s.players[1].hand.length,2)
})
test('equipment and judgment are explicit face-up zones, removable independently',()=>{
  for(const zone of ['equipment','judgment']){
    let s=fixture();const [dismantle]=hand(s,0,'dismantle');hand(s,1,'shan');const sword=equipment(s,1,'qinggang'),delay=s.deck.splice(s.deck.findIndex(c=>c.type==='indulgence'),1)[0];s.players[1].judgment.push(delay)
    s=play(s,dismantle,1);const v=playerView(s,0),chosen=v.legal.find(a=>a.zone===zone)
    assert.equal(chosen.card.id,zone==='equipment'?sword.id:delay.id)
    const model=ui(s);model.choiceZone=zone;assert.ok(renderCenter(model,v).includes(`data-type="${chosen.card.type}"`))
    s=step(s,chosen);assert.ok(s.discard.some(c=>c.id===chosen.card.id))
  }
})
test('counter leaves spell on table and response in hand; chain reversal is retained',()=>{
  let s=fixture('jinling','loyal',1);const [spell]=hand(s,1,'dismantle'),[negate]=hand(s,0,'nullify','shan');s=play(s,spell,0)
  assert.equal(s.pending.kind,'counter');assert.equal(s.pending.actor,0)
  const v=playerView(s,0),center=renderCenter(ui(s),v);assert.ok(!center.includes('fs-center-choice'));assert.equal(center.includes('无懈可击'),false);assert.ok(center.includes('破阵'));assert.ok(!center.includes(negate.id));const model=ui(s);model.selected=[negate.id];const html=renderBattle(model);assert.ok(html.includes('counter-ready'));assert.ok(html.includes('发动破法'));assert.ok(html.includes('不发动'));assert.ok(!html.includes('fs-counter-choice'))
  const beforeCount=s.players[0].hand.length;s=step(s,{type:'respond',ids:[negate.id]})
  assert.equal(s.players[0].hand.length,beforeCount,'one nullify is spent and automatic Jizhi draws one')
  assert.ok(s.logs.some(l=>l.cue?.skill==='jizhi'));assert.notEqual(s.pending?.skill,'jizhi')
})
test('played Sha and actual Shan remain illustrated side by side, with responder attribution',()=>{
  let s=fixture('yangjian','lord',1),[sha]=hand(s,1,'sha'),[shan]=hand(s,0,'shan')
  s=play(s,sha,0);s=step(s,{type:'respond',ids:[shan.id]})
  const center=renderCenter(ui(s),playerView(s,0));assert.ok(center.includes('data-type="sha"'));assert.ok(center.includes('data-type="shan"'));assert.ok(center.includes('杨戬（你）'));assert.equal(s.lastResponse.source,0);assert.equal(s.lastResponse.as,'shan');assert.equal((center.match(/fs-card-design/g)||[]).length,2)
})
test('converted Sha uses the same illustrated card UI without changing the physical card',()=>{
  let s=fixture(),[shan]=hand(s,0,'shan');hand(s,1,'shan');s=step(s,{type:'play',as:'sha',ids:[shan.id],targets:[1]})
  const center=renderCenter(ui(s),playerView(s,0));assert.ok(center.includes('data-type="shan"'));assert.ok(!center.includes('data-type="sha"'));assert.ok(center.includes('作为杀使用'));assert.equal(center.includes('fs-effective-sha'),false);assert.equal(s.lastPlayed.cards[0].type,'shan')
})
test('selecting a theme card explains its function outside the face',()=>{
  const s=fixture(),[c]=hand(s,0,'snatch');hand(s,1,'shan');const model=ui(s);model.selected=[c.id]
  const html=renderBattle(model),rail=html.slice(html.indexOf('class="fs-status"'),html.indexOf('class="fs-dock"'))
  assert.ok(rail.includes('摄宝：'));assert.ok(rail.includes('获得'));assert.ok(html.includes('<strong>摄宝</strong>'));assert.equal(html.includes('<strong>顺手牵羊</strong>'),false)
})
test('selection aid is read-only, works in response windows and honors teaching toggle',()=>{
  const s=fixture(),[c]=hand(s,0,'shan'),model=ui(s);model.selected=[c.id]
  const before=JSON.stringify(s)
  assert.ok(renderBattle(model).includes('data-tip-type="shan"'))
  assert.ok(renderBattle(model).includes('不能主动对他人使用'))
  model.hints=false;assert.ok(!renderBattle(model).includes('fs-selected-tip'));model.hints=true
  s.current=1;assert.ok(!renderBattle(model).includes('fs-selected-tip'))
  s.pending={kind:'response',actor:0,source:1,target:0,as:'shan'};assert.ok(renderBattle(model).includes('data-tip-type="shan"'))
  s.pending=null;s.current=0;assert.equal(JSON.stringify(s),before)
  model.selected=[];assert.ok(!renderBattle(model).includes('fs-selected-tip'))
})
test('Jizhi and Yingzi draw automatically; Luoyi keeps its real tradeoff prompt',()=>{
  let s=fixture('jinling');const [draw]=hand(s,0,'draw');s=play(s,draw)
  assert.equal(s.players[0].hand.length,3);assert.equal(s.pending,null);assert.ok(s.logs.some(l=>l.cue?.skill==='jizhi'));assert.ok(s.logs.some(l=>l.cue?.kind==='draw'&&l.cue.reason==='skill-draw'&&l.cue.target===0),'Jizhi emits a draw cue so the deck-to-hand flight animates')
  s=createGame({heroId:'guangchengzi',role:'lord',seed:8});assert.equal(s.players[0].hand.length,7);assert.notEqual(s.pending?.skill,'yingzi')
  s=createGame({heroId:'moliqing',role:'lord',seed:8});assert.equal(s.pending.skill,'luoyi');assert.equal(playerView(s,0).legal.filter(a=>a.type==='choose').length,2)
})
test('Jianxiong and Tieji are automatic in this theme, without changing classic defaults',()=>{
  let s=fixture('dixin','loyal',1);const [attack]=hand(s,1,'sha');s=play(s,attack,0);s=step(s,{type:'pass'});assert.ok(s.players[0].hand.some(c=>c.id===attack.id));assert.notEqual(s.pending?.skill,'jianxiong')
  s=fixture('leizhenzi');const [slash]=hand(s,0,'sha');judgeTop(s,'heart',4);const hp=s.players[1].hp;s=play(s,slash,1);assert.equal(s.pending.kind,'reveal');s=step(s,{type:'ack'});assert.equal(s.players[1].hp,hp-1);assert.notEqual(s.pending?.skill,'tieji')
})
test('old optional Jizhi save restores, auto-confirms, and retains all physical cards',()=>{
  const legacy=createEngine({...catalog,automaticSkills:[]});let s=fixture('jinling');const [draw]=hand(s,0,'draw');const r=legacy.dispatch(s,{seat:0,type:'play',as:'draw',ids:[draw.id],targets:[]});assert.ok(r.ok)
  assert.equal(r.state.pending.skill,'jizhi');const restored=restoreGame(r.state);assert.ok(restored);assert.equal(restored.players[0].hand.length,3);assert.equal(restored.pending,null);assert.equal(restored.theme,THEME_VERSION);assert.equal(allCards(restored).length,108)
})
test('dead identities are revealed and own identity persists through death and endgame',()=>{
  let s=fixture('yangjian','loyal');const dead=s.players[1];dead.alive=false;dead.hp=0
  let v=playerView(s,0),html=renderBattle(ui(s));assert.equal(v.players[1].role,dead.role);assert.ok(html.includes(`data-revealed-role="${dead.role}"`));assert.ok(html.includes('fs-own-identity'))
  s.players[0].alive=false;s.players[0].hp=0;s.current=2;html=renderBattle(ui(s));assert.ok(html.includes('你的身份：忠臣'));assert.ok(html.includes('观战中'));assert.ok(html.includes('fs-own-identity'))
  s.phase='finished';s.winner='rebel';v=playerView(s,0);assert.ok(v.players.every(p=>p.role));assert.ok(renderBattle(ui(s)).includes('你的身份：忠臣'))
})
test('status hint floats above the table without a layout rail',()=>{
  const html=renderBattle(ui(fixture()));assert.ok(html.includes('class="fs-status"'));assert.equal(html.includes('class="fs-operation"'),false);assert.equal(html.includes('class="fs-instruction"'),false)
})
test('male/female cues follow the effective card and actor, including auto skills and nullify',()=>{
  let s=fixture('jinling'),[c]=hand(s,0,'draw'),r=dispatch(s,{seat:0,type:'play',as:'draw',ids:[c.id],targets:[]})
  assert.deepEqual(cuesForAction(s,{seat:0,type:'play',as:'draw'},r.state),[{key:'card-draw',sex:'female'},{key:'skill-jizhi',sex:'female'}])
  s=fixture('yangjian');const [dodge]=hand(s,0,'shan');r=dispatch(s,{seat:0,type:'play',as:'sha',ids:[dodge.id],targets:[1]});assert.ok(r.ok);assert.equal(cuesForAction(s,{seat:0,type:'play',as:'sha'},r.state)[0].key,'card-sha')
})
test('active skills announce once and commanded attacks announce their actual actor',()=>{
  const before=fixture('fuxi'),after=structuredClone(before);after.logs.push({id:before.eventId+1,cue:{kind:'skill',skill:'quhu',seat:0}},{id:before.eventId+2,cue:{kind:'card-response',as:'sha',seat:1}})
  const cues=cuesForAction(before,{seat:0,type:'skill',skill:'quhu'},after)
  assert.equal(cues.filter(c=>c.key==='skill-quhu').length,1);assert.equal(cues.filter(c=>c.key==='card-sha').length,1)
  before.players[0].incarnation={activeHero:'pangde',activeSkill:'mashu'};after.logs=[{id:before.eventId+1,cue:{kind:'skill',skill:'mashu',seat:0}}];after.players[0].incarnation=before.players[0].incarnation
  assert.equal(cuesForAction(before,{seat:1,type:'pass'},after)[0].key,'skill-luya-mashu')
})
test('backlogged frames announce only the newest cues, in order',()=>{
  const before=fixture('fuxi'),after=structuredClone(before),base=before.eventId
  // 日志 newest-first（引擎 note 用 unshift 写入）。7 条历史事件模拟断线 / 后台补帧。
  after.logs=[7,6,5,4,3,2,1].map(n=>({id:base+n,cue:{kind:'card-response',as:'sha',seat:0}}))
  const backlog=cuesForAction(before,{seat:0,type:'pass'},after)
  assert.equal(backlog.length,2,'补帧只播最新两条，避免语音越播越落后')
  assert.ok(backlog.every(c=>c.key==='card-sha'))
  // 正常单手（≤2 条）不受影响，仍按发生顺序播报
  after.logs=[{id:base+2,cue:{kind:'card-response',as:'shan',seat:0}},{id:base+1,cue:{kind:'skill',skill:'quhu',seat:0}}]
  assert.deepEqual(cuesForAction(before,{seat:0,type:'pass'},after).map(c=>c.key),['skill-quhu','card-shan'])
})
const tick=()=>new Promise(r=>setTimeout(r,5))
function fakeContext({rejectResume=false}={}){
  return {state:'running',sampleRate:48000,destination:{},resume:()=>rejectResume?Promise.reject(Error('blocked')):Promise.resolve(),createBuffer:()=>({}),close:()=>Promise.resolve(),decodeAudioData:()=>Promise.resolve({duration:.02}),createBufferSource(){return {connect(){},disconnect(){},start(){setTimeout(()=>this.onended?.(),3)},stop(){this.onended?.()}}}}
}
test('audio serializes cues, caches buffers, and does not replay on UI render',async()=>{
  const paths=[],voice=new CardVoice({createContext:()=>fakeContext(),fetchAudio:async p=>{paths.push(p);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)}}})
  await voice.unlock();assert.ok(voice.speak('card-sha','male'));assert.ok(voice.speak('card-shan','female'));assert.ok(voice.speak('card-sha','male'));assert.equal(voice.speak('bad-key'),false)
  for(let i=0;i<30&&voice.busy;i++)await tick()
  assert.equal(voice.history.filter(c=>c.status==='played').length,3);assert.equal(paths.length,2);assert.ok(paths[0].includes('/male/'));assert.ok(paths[1].includes('/female/'));voice.destroy()
})
test('blocked autoplay and disabling audio do not spin or block gameplay',async()=>{
  const voice=new CardVoice({createContext:()=>fakeContext({rejectResume:true})});await voice.unlock();voice.speak('card-sha');await tick();assert.equal(voice.busy,false);assert.equal(voice.queue.length,0)
  voice.setEnabled(false);assert.equal(voice.speak('card-shan','female'),false);voice.destroy()
})
test('stop releases a background-suspended drain so AI scheduling resumes',async()=>{
  // 页面后台时 AudioContext 挂起：source 的 onended 不触发、stop() 也不派发。
  // 修复前 drain 永远挂在 await 上，busy 不复位，schedule 被 voice.busy 无限推迟。
  const suspendedContext=()=>({state:'suspended',sampleRate:48000,destination:{},resume:()=>Promise.resolve(),createBuffer:()=>({}),close:()=>Promise.resolve(),decodeAudioData:()=>Promise.resolve({duration:.02}),createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}}}})
  const voice=new CardVoice({createContext:suspendedContext,fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})})
  await voice.unlock();assert.ok(voice.speak('card-sha'))
  for(let i=0;i<10&&!voice.busy;i++)await tick()
  assert.equal(voice.busy,true,'drain 应挂起在等待播放结束')
  voice.stop()
  for(let i=0;i<10&&voice.busy;i++)await tick()
  assert.equal(voice.busy,false,'stop 必须释放挂起的 drain');voice.destroy()
})
test('a hanging audio resume cannot freeze a freshly restarted game',async()=>{
  // 音频上下文一直 resume 不上（例如切后台后被系统挂起）：drain 卡在 await this.ready 上，
  // 旧代码 busy 永不复位，回到大厅再开局后 schedule() 被 voice.busy 无限推迟，AI 再也不出牌，只能刷新。
  const hangContext=()=>({state:'suspended',sampleRate:48000,destination:{},resume:()=>new Promise(()=>{}),createBuffer:()=>({}),close:()=>Promise.resolve(),decodeAudioData:()=>Promise.resolve({duration:.02}),createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}}}})
  const voice=new CardVoice({createContext:hangContext,fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})})
  voice.unlock();assert.ok(voice.speak('card-sha'))
  for(let i=0;i<10&&!voice.busy;i++)await tick()
  assert.equal(voice.busy,true,'drain 应挂起在等待音频上下文')
  voice.stop() // 重开一局：start() 与「再开一局」都会调用 stop()
  assert.equal(voice.busy,false,'stop 必须立刻复位卡死的 busy，否则新局 AI 不出牌');voice.destroy()
  // 即使没人调用 stop()，兜底超时也必须复位 busy，绝不能让调度被永久推迟。
  const lone=new CardVoice({createContext:hangContext,fetchAudio:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(4)})})
  lone.unlock();assert.ok(lone.speak('card-sha'))
  for(let i=0;i<10&&!lone.busy;i++)await tick()
  for(let i=0;i<600&&lone.busy;i++)await tick()
  assert.equal(lone.busy,false,'超时必须自动复位 busy');lone.destroy()
})
test('all generated MP3s are present and decodable, with verified male/female voices',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../.private/fengshen/assets/audio/manifest.json',import.meta.url),'utf8'));assert.deepEqual(manifest.voices,VOICES);assert.equal(manifest.files.length,AUDIO_ENTRIES.length*2);assert.equal(manifest.entries.length,AUDIO_ENTRIES.length)
  for(const file of manifest.files){
    const path=new URL('../.private/fengshen/assets/audio/'+file,import.meta.url);assert.ok((await stat(path)).size>1000)
    const result=spawnSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path.pathname],{encoding:'utf8'});assert.equal(result.status,0,file)
    const duration=Number(result.stdout);assert.ok(duration>.15&&duration<6,`${file}: ${duration}`)
    const decoded=spawnSync('/opt/homebrew/bin/ffmpeg',['-v','error','-xerror','-i',path.pathname,'-f','null','-'],{encoding:'utf8'});assert.equal(decoded.status,0,`${file}: ${decoded.stderr}`)
  }
})
