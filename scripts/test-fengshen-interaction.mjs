import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,stat} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createGame,dispatch,playerView,restoreGame,allCards,catalog,THEME_VERSION} from '../.private/fengshen/engine.mjs'
import {createEngine} from '../.private/fengshen/core/engine.mjs'
import {makeDeck} from '../.private/fengshen/core/catalog.mjs'
import {hand,equipment,judgeTop} from './fixtures/sanguo.mjs'
import {renderBattle,renderCenter} from '../.private/fengshen/table.mjs'
import {AUDIO_ENTRIES,VOICES} from '../.private/fengshen/audio-manifest.mjs'
import {CardVoice,cuesForAction} from '../.private/fengshen/voice.mjs'

function fixture(heroId='yangjian',role='lord',current=0){
  const s=createGame({heroId,role,seed:17});s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=current;s.logs=[];s.lastPlayed=null;s.lastEvent=null
  for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
  return s
}
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);assert.equal(allCards(r.state).length,121);assert.equal(new Set(allCards(r.state).map(c=>c.id)).size,121);return r.state}
const play=(s,c,target)=>step(s,{type:'play',as:c.type,ids:[c.id],targets:target==null?[]:[target]})
const ui=s=>({state:s,paused:false,selected:[],targets:[],skill:null,choiceIndex:null,choiceZone:'hand',pace:650,voice:{enabled:true},header:()=>'<header></header>',targetable:()=>[],matching:()=>[],currentAs:()=>null,equipment:()=>'',skills:()=>'',won:()=>false,pendingText:()=>''})

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
test('counter places the spell, target and own response cards in the center; chain reversal is retained',()=>{
  let s=fixture('jinling','loyal',1);const [spell]=hand(s,1,'dismantle'),[negate]=hand(s,0,'nullify','shan');s=play(s,spell,0)
  assert.equal(s.pending.kind,'counter');assert.equal(s.pending.actor,0)
  const v=playerView(s,0),center=renderCenter(ui(s),v);assert.ok(center.includes('破法'));assert.equal(center.includes('无懈可击'),false);assert.ok(center.includes('破阵'));assert.ok(center.includes(negate.id))
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
  const center=renderCenter(ui(s),playerView(s,0));assert.ok(center.includes('data-type="sha"'));assert.ok(center.includes('转化攻击'));assert.equal(center.includes('fs-effective-sha'),false);assert.equal(s.lastPlayed.cards[0].type,'shan')
})
test('selecting a theme card explains its function outside the face',()=>{
  const s=fixture(),[c]=hand(s,0,'snatch');hand(s,1,'shan');const model=ui(s);model.selected=[c.id]
  const html=renderBattle(model),rail=html.slice(html.indexOf('class="fs-status"'),html.indexOf('class="fs-dock"'))
  assert.ok(rail.includes('摄宝：'));assert.ok(rail.includes('获得'));assert.ok(html.includes('<strong>摄宝</strong>'));assert.equal(html.includes('<strong>顺手牵羊</strong>'),false)
})
test('Jizhi and Yingzi draw automatically; Luoyi keeps its real tradeoff prompt',()=>{
  let s=fixture('jinling');const [draw]=hand(s,0,'draw');s=play(s,draw)
  assert.equal(s.players[0].hand.length,3);assert.equal(s.pending,null);assert.ok(s.logs.some(l=>l.cue?.skill==='jizhi'))
  s=createGame({heroId:'guangchengzi',role:'lord',seed:8});assert.equal(s.players[0].hand.length,7);assert.notEqual(s.pending?.skill,'yingzi')
  s=createGame({heroId:'moliqing',role:'lord',seed:8});assert.equal(s.pending.skill,'luoyi');assert.equal(playerView(s,0).legal.filter(a=>a.type==='choose').length,2)
})
test('Jianxiong and Tieji are automatic in this theme, without changing classic defaults',()=>{
  let s=fixture('dixin','loyal',1);const [attack]=hand(s,1,'sha');s=play(s,attack,0);s=step(s,{type:'pass'});assert.ok(s.players[0].hand.some(c=>c.id===attack.id));assert.notEqual(s.pending?.skill,'jianxiong')
  s=fixture('leizhenzi');const [slash]=hand(s,0,'sha');judgeTop(s,'heart',4);const hp=s.players[1].hp;s=play(s,slash,1);assert.equal(s.players[1].hp,hp-1);assert.notEqual(s.pending?.skill,'tieji')
})
test('old optional Jizhi save restores, auto-confirms, and retains all physical cards',()=>{
  const legacy=createEngine({...catalog,automaticSkills:[]});let s=fixture('jinling');const [draw]=hand(s,0,'draw');const r=legacy.dispatch(s,{seat:0,type:'play',as:'draw',ids:[draw.id],targets:[]});assert.ok(r.ok)
  assert.equal(r.state.pending.skill,'jizhi');const restored=restoreGame(r.state);assert.ok(restored);assert.equal(restored.players[0].hand.length,3);assert.equal(restored.pending,null);assert.equal(restored.theme,THEME_VERSION);assert.equal(allCards(restored).length,121)
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
test('all generated MP3s are present and decodable, with verified male/female voices',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../.private/fengshen/assets/audio/manifest.json',import.meta.url),'utf8'));assert.deepEqual(manifest.voices,VOICES);assert.equal(manifest.files.length,AUDIO_ENTRIES.length*2);assert.equal(manifest.files.length,234)
  for(const file of manifest.files){
    const path=new URL('../.private/fengshen/assets/audio/'+file,import.meta.url);assert.ok((await stat(path)).size>1000)
    const result=spawnSync('/opt/homebrew/bin/ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path.pathname],{encoding:'utf8'});assert.equal(result.status,0,file)
    const duration=Number(result.stdout);assert.ok(duration>.15&&duration<6,`${file}: ${duration}`)
    const decoded=spawnSync('/opt/homebrew/bin/ffmpeg',['-v','error','-xerror','-i',path.pathname,'-f','null','-'],{encoding:'utf8'});assert.equal(decoded.status,0,`${file}: ${decoded.stderr}`)
  }
})
