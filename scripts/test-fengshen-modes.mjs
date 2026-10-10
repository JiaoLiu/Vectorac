import test from 'node:test'
import assert from 'node:assert/strict'
import {createSetup,setupView,dispatchSetup,chooseSetupAI,restoreSetup,MODES,MODE_LIST,modeById} from '../.private/fengshen/setup.mjs'
import {PLAYABLE_HEROES,HERO_BY_THEME_ID} from '../.private/fengshen/theme.mjs'
import {playerView,dispatch,allCards,restoreGame,catalog,chooseAI} from '../.private/fengshen/engine.mjs'
import {renderHome} from '../.private/fengshen/setup-ui.mjs'
const DECK_SIZE=catalog.makeDeck().length
const step=(s,a)=>{const r=dispatchSetup(s,{revision:s.revision,...a});assert.ok(r.ok,r.error);return r.setup}
const sorted=a=>a.slice().sort()
function finish(s){s=step(s,{type:'reveal',seat:0});if(!s.sides)s=step(s,chooseSetupAI(setupView(s,s.lord)));for(let i=0;i<s.roles.length;i++)if(!s.picks[i])s=step(s,chooseSetupAI(setupView(s,i)));return s}

test('mode registry covers five playable modes and falls back to identity5',()=>{
  assert.deepEqual(MODE_LIST.map(m=>m.id),['identity5','identity8','3v3','2v2','1v1'])
  assert.deepEqual(MODE_LIST.map(m=>m.players),[5,8,6,4,2])
  for(const m of MODE_LIST){assert.equal(modeById(m.id),m);assert.ok(m.name&&m.menu&&m.blurb)}
  assert.equal(modeById('9v9'),MODES.identity5);assert.equal(modeById(null),MODES.identity5);assert.equal(modeById(undefined),MODES.identity5)
})
test('every mode deals its declared roles; team modes interleave friend/enemy seats from seat 0',()=>{
  for(const mode of MODE_LIST){
    for(let seed=1;seed<=80;seed++){
      const s=createSetup({seed,mode:mode.id})
      assert.equal(s.mode,mode.id);assert.equal(s.stage,'identity')
      assert.equal(s.roles.length,mode.players);assert.equal(s.offers.length,mode.players);assert.equal(s.picks.length,mode.players);assert.equal(s.published.length,mode.players)
      assert.ok(s.candidateCount>=1&&s.candidateCount<=3&&s.candidateCount*(mode.players-1)<=PLAYABLE_HEROES.length-1)
      if(mode.teams){
        // 对抗局：0 号席固定友方，座位交替穿插，先手由骰点最高者担任。
        assert.deepEqual(s.sides,s.roles.map((_,i)=>i%2))
        assert.equal(s.sides[0],0,`${mode.id}: seat 0 must be the local side`)
        assert.deepEqual(sorted(s.roles),sorted(mode.teams.flat()))
        assert.equal(s.dice,null)
        assert.equal(s.lord,0)
        assert.ok(s.offers.every(packet=>packet.length===s.candidateCount))
      }else{
        const expected=sorted(mode.roles)
        assert.deepEqual(sorted(s.roles),expected)
        assert.equal(s.roles.filter(r=>r==='lord').length,1);assert.equal(s.lord,s.roles.indexOf('lord'))
      }
    }
  }
})
test('candidate packets fit the roster even in the eight-player mode',()=>{
  for(const mode of MODE_LIST){
    for(let seed=1;seed<=30;seed++){
      let s=step(createSetup({seed,mode:mode.id}),{type:'reveal',seat:0})
      const selected=s.offers[s.lord][0];s=step(s,{type:'pick',seat:s.lord,heroId:selected})
      const packets=s.offers.filter((_,i)=>i!==s.lord)
      assert.ok(packets.every(a=>a.length===s.candidateCount),mode.id)
      assert.equal(new Set(packets.flat()).size,packets.flat().length)
      assert.equal(packets.flat().includes(selected),false)
      for(const id of packets.flat())assert.ok(HERO_BY_THEME_ID[id].playable)
    }
  }
})
test('begin hands every mode to the game with roles, seats, turn order and label intact',()=>{
  for(const mode of MODE_LIST){
    for(let seed=1;seed<=20;seed++){
      const ready=finish(createSetup({seed,mode:mode.id}));assert.equal(ready.stage,'ready')
      const r=dispatchSetup(ready,{type:'begin',seat:0,revision:ready.revision});assert.ok(r.ok);const game=r.game
      assert.equal(game.players.length,mode.players)
      if(mode.teams){assert.ok(game.teamMode);assert.deepEqual(game.sides,ready.sides);assert.deepEqual(game.players.map(p=>p.role),ready.sides.map(x=>x===0?'lord':'rebel'))}
      else assert.deepEqual(game.players.map(p=>p.role),ready.roles)
      assert.deepEqual(game.players.map(p=>p.heroId),ready.picks.map(id=>HERO_BY_THEME_ID[id].engineId))
      assert.equal(game.current,ready.lord);assert.equal(allCards(game).length,DECK_SIZE)
      assert.ok(game.logs.some(l=>l.text.includes(mode.name)),`${mode.id}: mode label missing`)
      assert.ok(restoreGame(game))
    }
  }
})
test('mode drafts survive refresh at every stage; legacy and tampered saves are handled',()=>{
  for(const modeId of ['identity8','3v3','1v1']){
    let s=createSetup({seed:9,mode:modeId});assert.deepEqual(restoreSetup(s),s)
    s=step(s,{type:'reveal',seat:0});assert.deepEqual(restoreSetup(s),s)
    s=step(s,chooseSetupAI(setupView(s,s.lord)));assert.deepEqual(restoreSetup(s),s)
    const other=[...s.roles.keys()].find(i=>i!==s.lord);s=step(s,chooseSetupAI(setupView(s,other)));assert.deepEqual(restoreSetup(s),s)
    for(let i=0;i<s.roles.length;i++)if(!s.picks[i])s=step(s,chooseSetupAI(setupView(s,i)));assert.equal(s.stage,'ready');assert.deepEqual(restoreSetup(s),s)
  }
  const legacy=createSetup({seed:9});delete legacy.mode;const restored=restoreSetup(legacy)
  assert.deepEqual(restored,legacy)
  assert.equal(setupView(restored,0).mode,'identity5')
  const begun=dispatchSetup(finish(restored),{type:'begin',seat:0});assert.ok(begun.ok)
  assert.ok(begun.game.logs.some(l=>l.text.includes('五人身份局')))
  const unknown=createSetup({seed:9});unknown.mode='9v9';assert.equal(restoreSetup(unknown),null)
  const resized=createSetup({seed:9,mode:'3v3'});resized.mode='identity5';assert.equal(restoreSetup(resized),null)
  const broken=createSetup({seed:9,mode:'3v3'});broken.roles=['lord','loyal','rebel','rebel','loyal','rebel'];broken.lord=0;assert.equal(restoreSetup(broken),null)
})
test('home lists every mode with its blurb, selection state and start label',()=>{
  for(const mode of MODE_LIST){
    const home=renderHome({header:()=>'',resumeSession:null,mode:mode.id})
    assert.equal((home.match(/data-action="mode"/g)||[]).length,MODE_LIST.length)
    for(const m of MODE_LIST){assert.ok(home.includes(`data-id="${m.id}"`));assert.ok(home.includes(m.blurb))}
    assert.ok(home.includes(`fs-mode-chip selected" data-action="mode" data-id="${mode.id}"`))
    assert.ok(home.includes(`开始${mode.name}`))
  }
})
test('AI matches across all modes finish with correct winners',()=>{
  for(const mode of MODE_LIST){
    const winners=new Set()
    for(let seed=1;seed<=30;seed++){
      const ready=finish(createSetup({seed:seed*7919,mode:mode.id}));let s=dispatchSetup(ready,{type:'begin',seat:0}).game,actions=0
      while(!s.winner&&actions++<6000){const seat=s.pending?.actor??s.current;const r=dispatch(s,chooseAI(playerView(s,seat)));assert.ok(r.ok,`${mode.id} seed ${seed}: ${r.error}`);s=r.state}
      assert.ok(s.winner,`${mode.id} seed ${seed}: unfinished`);winners.add(s.winner)
      assert.equal(allCards(s).length,DECK_SIZE)
      if(mode.teams){
        // 对抗局：胜方阵营存活，败方全灭；winner 为胜方阵营下标字符串。
        assert.ok(['0','1'].includes(s.winner),`${mode.id}: winner must be a side`)
        const loser=s.winner==='0'?'1':'0'
        assert.ok(s.players.filter(p=>s.sides[p.seat]===Number(s.winner)).some(p=>p.alive),`${mode.id}: winning side wiped`)
        assert.ok(s.players.filter(p=>s.sides[p.seat]===Number(loser)).every(p=>!p.alive),`${mode.id}: losing side survived`)
        assert.ok(s.teamMode)
      }else{
        const lord=s.players.find(p=>p.role==='lord')
        if(s.winner==='rebel')assert.equal(lord.alive,false,`${mode.id}: rebel win with living lord`)
        if(s.winner==='lord')assert.ok(s.players.filter(p=>p.role==='rebel'||p.role==='renegade').every(p=>!p.alive),`${mode.id}: lord win with surviving rebel`)
        if(s.winner==='renegade'){assert.equal(lord.alive,false);assert.equal(s.players.filter(p=>p.alive).length,1)}
      }
      assert.ok(restoreGame(s))
    }
    if(mode.id==='1v1'||mode.id==='2v2')assert.equal(winners.size,2,`${mode.id}: one side always wins`)
  }
})
