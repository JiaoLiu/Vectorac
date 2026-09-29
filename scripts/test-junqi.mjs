import test from 'node:test'
import assert from 'node:assert/strict'
import {BOARD,TYPES,ARMIES,createGame,canDeploy,swapFormation,armyNode,legalMoves,battle,startGame,rollOpening,move,visibleType,chooseAI,restoreGame,surrender,nextClockwiseSeat,at} from '../.vuepress/components/junqi/engine.mjs'
const piece=(id,type,seat,pos)=>({id,type,seat,pos,moved:false})
function fixture(extra=[]){const s=createGame({seed:123});s.phase='play';s.pieces=[0,1,2,3].map(seat=>piece('flag'+seat,'flag',seat,armyNode(seat,5,1))).concat(extra);return s}
test('129 nodes, four five-camp armies, reciprocal railway and road graph',()=>{
 assert.equal(BOARD.nodes.length,129);assert.equal(BOARD.nodes.filter(n=>n.kind==='camp').length,20)
 assert.equal(BOARD.nodes.filter(n=>n.kind==='hq').length,8);assert.equal(BOARD.edges.filter(e=>e.curve).length,4)
 for(const n of BOARD.nodes)for(const e of BOARD.adjacency[n.id])assert.ok(BOARD.adjacency[e.to].some(back=>back.to===n.id&&back.rail===e.rail))
})
test('100 seeded deployments always have 25 correct legal pieces per army',()=>{
 for(let seed=0;seed<100;seed++){const s=createGame({seed});assert.equal(new Set(s.pieces.map(p=>p.pos)).size,100)
  for(let seat=0;seat<4;seat++)for(const type of Object.keys(TYPES))assert.equal(s.pieces.filter(p=>p.seat===seat&&p.type===type).length,TYPES[type].count)
  for(const p of s.pieces)assert.ok(canDeploy(p.type,BOARD.byId[p.pos],p.seat))
 }
})
test('invalid formation swaps are atomic and setup ends on departure',()=>{
 const s=createGame({seed:7}),flag=s.pieces.find(p=>p.seat===0&&p.type==='flag'),front=s.pieces.find(p=>p.pos===armyNode(0,0,0)),before=JSON.stringify(s)
 assert.equal(swapFormation(s,flag.id,front.id),false);assert.equal(JSON.stringify(s),before)
 startGame(s);assert.equal(s.phase,'play');assert.equal(swapFormation(s,flag.id,front.id),false)
})
test('dice decide the opening seat, unique highest breaks ties by rerolling',()=>{
 const seats=new Set()
 for(let seed=0;seed<60;seed++){
  const roll=rollOpening(createGame({seed}))
  assert.deepEqual(roll,rollOpening(createGame({seed})),'opening roll is reproducible from the seed')
  const last=roll.rounds[roll.rounds.length-1]
  const sum=r=>r.dice[0]+r.dice[1]
  assert.ok(roll.rounds.every(round=>round.every(r=>r.dice.every(v=>v>=1&&v<=6))))
  const best=Math.max(...last.map(sum))
  assert.equal(last.filter(r=>sum(r)===best).length,1,'a single seat owns the highest total')
  assert.equal(sum(last.find(r=>r.seat===roll.first)),best)
  const s=createGame({seed});startGame(s,roll)
  assert.equal(s.phase,'play');assert.equal(s.turn,roll.first,'the dice winner moves first, not seat 0')
  assert.match(s.logs[0],new RegExp('^'+ARMIES[roll.first]+'掷骰得先手'))
  seats.add(roll.first)
 }
 assert.ok(seats.size>1,'先手随掷骰变化，而不是固定青龙：'+[...seats].sort().join(','))
})
test('dice chooses only the opening seat; every starting seat then follows the same clockwise cycle',()=>{
 for(let first=0;first<4;first++){
  const s=createGame({seed:100+first})
  s.pieces=[]
  for(let seat=0;seat<4;seat++){
   s.pieces.push(piece(`flag-${seat}`,'flag',seat,armyNode(seat,5,1)))
   s.pieces.push(piece(`commander-${seat}`,'commander',seat,armyNode(seat,0,2)))
  }
  startGame(s,{first,rounds:[]})
  let expected=first
  for(let turn=0;turn<8;turn++){
   assert.equal(s.turn,expected,`dice winner ${first}: fixed order at move ${turn+1}`)
   const p=s.pieces.find(p=>p.seat===expected&&p.type==='commander')
   const to=legalMoves(s,p.id).find(pos=>BOARD.byId[pos].seat===expected&&BOARD.byId[pos].kind!=='camp'&&!at(s,pos))
   assert.ok(to,`army ${expected} has a safe move for the order test`)
   assert.equal(move(s,p.id,to),true)
   expected=nextClockwiseSeat(expected)
   assert.equal(s.turn,expected,`after army ${p.seat}, the next seat is clockwise`)
  }
 }
})
test('railway long moves, engineer turns, normal piece cannot make a right-angle turn',()=>{
 const p=piece('p','general',0,armyNode(0,0,2)),s=fixture([p])
 assert.ok(legalMoves(s,'p').includes(armyNode(2,0,2)))
 assert.ok(!legalMoves(s,'p').includes(armyNode(1,0,2)))
 p.type='engineer';assert.ok(legalMoves(s,'p').includes(armyNode(1,0,2)))
})
test('normal pieces follow curved rail but cannot cross occupied stations or allies',()=>{
 const p=piece('p','general',0,armyNode(0,2,0)),s=fixture([p])
 assert.ok(legalMoves(s,'p').includes(armyNode(1,2,4)))
 s.pieces.push(piece('block','platoon',2,armyNode(0,1,0)))
 assert.ok(!legalMoves(s,'p').includes(armyNode(0,0,0)));assert.ok(!legalMoves(s,'p').includes(armyNode(0,1,0)))
})
test('camps have diagonal roads and protected occupants; headquarters immobile',()=>{
 const p=piece('p','general',0,armyNode(0,0,0)),s=fixture([p])
 const camp=armyNode(0,1,1);assert.ok(legalMoves(s,'p').includes(camp))
 s.pieces.push(piece('enemy','engineer',1,camp));assert.ok(!legalMoves(s,'p').includes(camp))
 p.pos=armyNode(0,5,3);assert.deepEqual(legalMoves(s,'p'),[])
 p.pos=armyNode(0,4,0);p.type='mine';assert.deepEqual(legalMoves(s,'p'),[])
})
test('complete combat relations including mine, bomb and flag',()=>{
 assert.equal(battle('engineer','mine'),'win');assert.equal(battle('commander','mine'),'lose')
 assert.equal(battle('general','commander'),'lose');assert.equal(battle('division','brigade'),'win')
 assert.equal(battle('platoon','platoon'),'both');assert.equal(battle('engineer','flag'),'win')
 for(const type of Object.keys(TYPES)){assert.equal(battle('bomb',type),'both');assert.equal(battle(type,'bomb'),'both')}
})
test('commander death reveals only that army flag and hides other ranks',()=>{
 const s=fixture([piece('p','commander',0,armyNode(0,0,0)),piece('b','bomb',1,armyNode(0,0,1)),piece('survivor','general',1,armyNode(1,0,0))]);s.mode='dark'
 assert.equal(move(s,'p',armyNode(0,0,1)),true);assert.equal(s.flags[0],true)
 assert.equal(visibleType(s,s.pieces.find(p=>p.id==='flag0'),1),'flag')
 assert.equal(visibleType(s,s.pieces.find(p=>p.id==='survivor'),0),null)
})
test('one captured flag does not defeat team; two eliminated armies do',()=>{
 const s=fixture([piece('a','engineer',0,armyNode(1,4,1)),piece('b','general',2,armyNode(2,0,0)),piece('c','general',3,armyNode(3,0,0))])
 assert.ok(move(s,'a',armyNode(1,5,1)));assert.equal(s.alive[1],false);assert.equal(s.phase,'play');assert.equal(s.pieces.some(p=>p.seat===1),false)
 surrender(s,3);assert.equal(s.phase,'finished');assert.equal(s.winner,0)
})
test('illegal turn/destination does not mutate state',()=>{
 const s=createGame({seed:4});startGame(s);const before=JSON.stringify(s),enemy=s.pieces.find(p=>p.seat===1)
 assert.equal(move(s,enemy.id,armyNode(0,0,0)),false);assert.equal(JSON.stringify(s),before)
})
test('AI hidden-rank invariance and dual visibility',()=>{
 const s=createGame({seed:5});startGame(s);s.mode='dark';const clone=JSON.parse(JSON.stringify(s))
 for(const p of clone.pieces)if(p.seat===1||p.seat===3)p.type=p.type==='commander'?'engineer':'commander'
 assert.deepEqual(chooseAI(s,0),chooseAI(clone,0))
 const friend=s.pieces.find(p=>p.seat===2);assert.equal(visibleType(s,friend),null);s.mode='dual';assert.equal(visibleType(s,friend),friend.type)
})
test('saved game restores and corrupted saves reject',()=>{
 const s=createGame({seed:2});assert.deepEqual(restoreGame(JSON.stringify(s)),s)
 assert.equal(restoreGame('{'),null);s.pieces[1].pos=s.pieces[0].pos;assert.equal(restoreGame(JSON.stringify(s)),null)
})
test('seeded AI matches remain legal and end without deadlocked active turn',()=>{
 for(let seed=1;seed<=3;seed++){
  const s=createGame({seed});startGame(s)
  for(let i=0;i<600&&s.phase==='play';i++){
   const next=chooseAI(s);assert.ok(next);assert.ok(move(s,next.pieceId,next.to));assert.equal(new Set(s.pieces.map(p=>p.pos)).size,s.pieces.length)
  }
  assert.equal(s.phase,'finished')
 }
})
test('70 quiet plies draw; a collision resets the quiet counter',()=>{
 const p=piece('p','general',0,armyNode(0,0,2)),s=fixture([p]);s.quiet=69
 assert.ok(move(s,'p','c:8:10'));assert.equal(s.phase,'finished');assert.equal(s.winner,'draw')
 const t=fixture([piece('p','general',0,armyNode(0,0,2)),piece('enemy','platoon',1,'c:8:10'),piece('mobile','general',1,armyNode(1,0,0))]);t.quiet=69
 assert.ok(move(t,'p','c:8:10'));assert.equal(t.quiet,0);assert.equal(t.phase,'play')
})
test('an army with no legal moves is eliminated on its turn, while its teammate continues',()=>{
 const s=fixture([piece('p','general',0,armyNode(0,0,2)),piece('mate','general',2,armyNode(2,0,0)),piece('enemy','general',3,armyNode(3,0,0))])
 assert.ok(move(s,'p','c:8:10'));assert.equal(s.alive[1],false);assert.equal(s.turn,2);assert.equal(s.phase,'play')
})
test('default is dark; layouts vary and never trap major officers in HQ',()=>{
 const layouts=new Set()
 for(let seed=10;seed<40;seed++){
  const s=createGame({seed});assert.equal(s.mode,'dark')
  layouts.add(s.pieces.filter(p=>p.seat===1).map(p=>p.pos).join(','))
  for(const p of s.pieces)if(TYPES[p.type].rank>=6)assert.notEqual(BOARD.byId[p.pos].kind,'hq')
  assert.equal(s.pieces.filter(p=>visibleType(s,p)!==null).length,25)
 }
 assert.ok(layouts.size>25)
})
test('AI protects its flag against an immediate known attacker',()=>{
 const s=fixture([piece('guard','general',0,armyNode(0,4,0)),piece('invader','engineer',1,armyNode(0,4,1))]);s.mode='open'
 const next=chooseAI(s,0);assert.equal(next.pieceId,'guard');assert.equal(next.to,armyNode(0,4,1))
})
test('AI uses a bomb on a commander rather than an expendable platoon',()=>{
 const s=fixture([piece('bomb','bomb',0,'c:8:8'),piece('large','commander',1,'c:6:8'),piece('small','platoon',3,'c:10:8')]);s.mode='open'
 assert.equal(chooseAI(s,0).to,'c:6:8')
})
test('combat intelligence belongs only to involved seats, and moving reveals no exact rank',()=>{
 const s=fixture([piece('p','general',0,armyNode(0,0,2)),piece('enemy','commander',1,'c:8:10'),piece('mate','general',2,armyNode(2,0,0))])
 move(s,'p','c:8:10');assert.ok(s.intel['0:enemy'].includes('commander'));assert.ok(!s.intel['0:enemy'].includes('platoon'))
 assert.equal(s.intel['2:enemy'],undefined)
 assert.equal(visibleType(s,s.pieces.find(p=>p.id==='enemy'),0),null)
})
test('dark flags remain concealed until commander death, including finished view',()=>{
 const s=createGame();s.phase='finished';const f=s.pieces.find(p=>p.seat===1&&p.type==='flag')
 assert.equal(visibleType(s,f),null);s.flags[1]=true;assert.equal(visibleType(s,f),'flag')
})
test('AI leaves home and initiates combat instead of waiting inside camps',()=>{
 for(let seed=1;seed<=10;seed++){
  const s=createGame({seed});startGame(s);let advances=0,combats=0
  // Opponent holds position in this strategy harness; AI still must attack.
  for(let i=0;i<32&&s.phase==='play';i++){
   if(s.turn===0)s.turn=1
   const action=chooseAI(s),p=s.pieces.find(p=>p.id===action.pieceId)
   if(BOARD.byId[action.to].seat!==p.seat)advances++
   assert.ok(move(s,action.pieceId,action.to));if(s.lastMove.outcome!=='move')combats++
  }
  assert.ok(advances>=5,'army deploys outside home: '+seed)
  assert.ok(combats>=3,'army initiates attacks: '+seed)
 }
})
