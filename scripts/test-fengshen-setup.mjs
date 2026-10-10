import test from 'node:test'
import assert from 'node:assert/strict'
import {createSetup,setupView,dispatchSetup,chooseSetupAI,restoreSetup,restoreSession,LORD_HEROES} from '../.private/fengshen/setup.mjs'
import {PLAYABLE_HEROES,HERO_BY_THEME_ID} from '../.private/fengshen/theme.mjs'
import {createGame,playerView,dispatch,allCards,restoreGame} from '../.private/fengshen/engine.mjs'
import {chooseAI} from '../.vuepress/components/sanguo/ai.mjs'
import {renderHome,renderSetup} from '../.private/fengshen/setup-ui.mjs'
const step=(s,a)=>{const r=dispatchSetup(s,{revision:s.revision,...a});assert.ok(r.ok,r.error);return r.setup}
function reveal(s){return step(s,{type:'reveal',seat:0})}
function finish(s){s=reveal(s);s=step(s,chooseSetupAI(setupView(s,s.lord)));for(let i=0;i<5;i++)if(i!==s.lord)s=step(s,chooseSetupAI(setupView(s,i)));return s}

test('identities are randomly assigned before any character is chosen or hand is dealt',()=>{
  const seen=new Set()
  for(let seed=1;seed<=100;seed++){
    const s=createSetup({seed});seen.add(s.roles[0]);assert.equal(s.stage,'identity');assert.equal(s.lord,s.roles.indexOf('lord'));assert.deepEqual(s.picks,[null,null,null,null,null]);assert.equal(s.deck,undefined)
    assert.equal(s.roles.filter(r=>r==='lord').length,1);assert.equal(s.roles.filter(r=>r==='loyal').length,1);assert.equal(s.roles.filter(r=>r==='rebel').length,2);assert.equal(s.roles.filter(r=>r==='renegade').length,1)
    assert.deepEqual(restoreSetup(s),s)
  }
  assert.equal(seen.size,4)
})
test('lord candidates contain 3 lord-style heroes plus 2 distinct random supported heroes',()=>{
  for(let seed=1;seed<=100;seed++){
    const s=createSetup({seed}),offers=s.offers[s.lord];assert.equal(offers.length,5);assert.equal(new Set(offers).size,5)
    for(const id of LORD_HEROES)assert.ok(offers.includes(id))
    for(const id of offers)assert.ok(HERO_BY_THEME_ID[id].playable)
    for(let seat=0;seat<5;seat++)if(seat!==s.lord)assert.deepEqual(s.offers[seat],[])
  }
})
test('invalid sequence, picking outside own offer and stale confirmations are atomic',()=>{
  let s=createSetup({seed:1});const seat=(s.lord+1)%5
  for(const action of [{type:'pick',seat:s.lord,heroId:s.offers[s.lord][0]},{type:'begin',seat:0},{type:'pick',seat,heroId:'jifa'}]){const r=dispatchSetup(s,action);assert.equal(r.ok,false);assert.equal(r.setup,s)}
  s=reveal(s)
  assert.equal(dispatchSetup(s,{type:'pick',seat,heroId:'jifa'}).ok,false)
  assert.equal(dispatchSetup(s,{type:'pick',seat:s.lord,heroId:'jiangziya'}).ok,false)
  assert.equal(dispatchSetup(s,{type:'pick',seat:s.lord,heroId:s.offers[s.lord][0],revision:0}).ok,false)
})
test('after lord confirmation, others receive independent random 2-card packets, excluding the selected lord',()=>{
  for(let seed=1;seed<=100;seed++){
    let s=reveal(createSetup({seed}));const selected=s.offers[s.lord][0];s=step(s,{type:'pick',seat:s.lord,heroId:selected});assert.equal(s.stage,'others');assert.equal(s.published[s.lord],selected)
    const packets=s.offers.filter((_,i)=>i!==s.lord);assert.ok(packets.every(a=>a.length===2));assert.equal(new Set(packets.flat()).size,8);assert.equal(packets.flat().includes(selected),false)
    assert.ok(restoreSetup(s))
  }
})
test('views and AI cannot see another player hidden identity, candidate packet or unpublished pick',()=>{
  let s=reveal(createSetup({seed:4}));s=step(s,chooseSetupAI(setupView(s,s.lord)))
  const other=[0,1,2,3,4].find(i=>i!==s.lord&&i!==0);s=step(s,chooseSetupAI(setupView(s,other)))
  const v=setupView(s,0);assert.equal(v.offers,undefined);assert.equal(v.roles,undefined)
  for(const p of v.players)if(p.seat!==0&&p.seat!==s.lord){assert.equal(p.role,null);assert.equal(p.heroId,null)}
  assert.equal(v.players[other].ready,true);assert.equal(v.players[s.lord].heroId,s.picks[s.lord])
})
test('ready draft is handed to the game unchanged; it never rerolls roles or heroes',()=>{
  for(let seed=1;seed<=50;seed++){
    const ready=finish(createSetup({seed}));assert.equal(ready.stage,'ready');assert.deepEqual(ready.published,ready.picks)
    const r=dispatchSetup(ready,{type:'begin',seat:0,revision:ready.revision});assert.ok(r.ok);const game=r.game
    assert.deepEqual(game.players.map(p=>p.role),ready.roles)
    assert.deepEqual(game.players.map(p=>p.heroId),ready.picks.map(id=>HERO_BY_THEME_ID[id].baseHero))
    assert.equal(game.current,ready.lord);assert.equal(game.turns,1);assert.equal(allCards(game).length,108)
    for(const p of game.players){const h=HERO_BY_THEME_ID[ready.picks[p.seat]];assert.equal(p.maxHp,h.hp+(p.seat===ready.lord?1:0));if(p.seat!==ready.lord)assert.equal(p.hand.length,4)}
    assert.ok(restoreGame(game));assert.deepEqual(dispatchSetup(ready,{type:'begin',seat:0}).game,game)
  }
})
test('refresh preserves every draft stage and locked picks; old combat saves still restore',()=>{
  let s=createSetup({seed:6});assert.deepEqual(restoreSession({kind:'setup',setup:s}),{kind:'setup',setup:s});s=reveal(s);assert.deepEqual(restoreSetup(s),s)
  s=step(s,chooseSetupAI(setupView(s,s.lord)));assert.deepEqual(restoreSetup(s),s)
  const seat=[0,1,2,3,4].find(i=>i!==s.lord);s=step(s,chooseSetupAI(setupView(s,seat)));const fixed=s.picks[seat];assert.equal(restoreSetup(s).picks[seat],fixed);assert.equal(dispatchSetup(s,{type:'pick',seat,heroId:s.offers[seat][1]}).ok,false)
  for(let i=0;i<5;i++)if(!s.picks[i])s=step(s,chooseSetupAI(setupView(s,i)));assert.deepEqual(restoreSetup(s),s)
  const game=createGame({heroId:'jifa',seed:42});assert.deepEqual(restoreSession(game),{kind:'game',game});assert.equal(restoreSession({kind:'setup',setup:{}}),null)
})
test('malformed drafts reject duplicate packets, leaked publication, unsupported heroes and mismatched identities',()=>{
  const ready=finish(createSetup({seed:3}));for(const modify of [s=>s.roles[0]='invalid',s=>s.lord=(s.lord+1)%5,s=>s.offers[s.lord][0]='jiangziya',s=>s.picks[0]=s.picks[1],s=>s.published[0]='bad',s=>s.seed=-1,s=>s.candidateCount=3]){const bad=structuredClone(ready);modify(bad);assert.equal(restoreSetup(bad),null)}
  let s=reveal(createSetup({seed:5}));s=step(s,chooseSetupAI(setupView(s,s.lord)));const bad=structuredClone(s),seat=(s.lord+1)%5;bad.published[seat]=bad.offers[seat][0];assert.equal(restoreSetup(bad),null)
})
test('home removes role/free-hero picking; draft shows only the local assigned candidates',()=>{
  const home=renderHome({header:()=>'',resumeSession:null});assert.ok(home.includes('开始身份局'));assert.equal(home.includes('data-action="role"'),false);assert.equal(home.includes('data-action="hero"'),false)
  let s=reveal(createSetup({seed:1}));const user={header:()=>'',setup:s,draftHero:null}
  let html=renderSetup(user),v=setupView(s,0);assert.equal((html.match(/class="fs-draft-pick"/g)||[]).length,v.candidates.length)
  s=step(s,chooseSetupAI(setupView(s,s.lord)));user.setup=s;v=setupView(s,0);html=renderSetup(user);assert.equal((html.match(/class="fs-draft-pick"/g)||[]).length,v.candidates.length)
  for(let seed=1;seed<=20;seed++){let draft=reveal(createSetup({seed}));draft=step(draft,chooseSetupAI(setupView(draft,draft.lord)));assert.equal(renderSetup({...user,setup:draft}).includes('${'),false)}
})
test('100 drafted AI matches finish legally after the complete startup workflow',()=>{
  for(let seed=1;seed<=100;seed++){
    const ready=finish(createSetup({seed}));let s=dispatchSetup(ready,{type:'begin',seat:0}).game,actions=0
    while(!s.winner&&actions++<3500){const seat=s.pending?.actor??s.current,a=chooseAI(playerView(s,seat)),r=dispatch(s,a);assert.ok(r.ok,`seed ${seed}: ${r.error}`);s=r.state}
    assert.ok(s.winner,`draft seed ${seed}`);assert.equal(allCards(s).length,108)
  }
})
