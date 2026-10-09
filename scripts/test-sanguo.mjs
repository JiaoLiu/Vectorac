import assert from 'node:assert/strict'
import test from 'node:test'
import {CARDS,HEROES,makeDeck,isRed} from '../.vuepress/components/sanguo/catalog.mjs'
import {createGame,dispatch,playerView,legalActions,distance,attackRange,settle,allCards,restoreGame} from '../.vuepress/components/sanguo/engine.mjs'
import {chooseAI} from '../.vuepress/components/sanguo/ai.mjs'
import {fixture,setHero,take,hand,equipment,judgeTop,step,play,pass,respond,choose,check} from './fixtures/sanguo.mjs'

test('classic 108-card deck: exact categories, suits, physical IDs and core distributions',()=>{
  const deck=makeDeck();assert.equal(deck.length,108);assert.equal(new Set(deck.map(c=>c.id)).size,108)
  for(const suit of ['spade','club','heart','diamond'])assert.equal(deck.filter(c=>c.suit===suit).length,27)
  for(const [category,count]of [['basic',53],['equip',19]])assert.equal(deck.filter(c=>CARDS[c.type].category===category).length,count)
  for(const [type,count]of [['sha',30],['shan',15],['tao',8],['nullify',4]])assert.equal(deck.filter(c=>c.type===type).length,count)
  assert.equal(HEROES.length,12);assert.equal(new Set(HEROES.map(h=>h.id)).size,12)
})
test('all selectable heroes and identities start legally: four cards, lord bonus, lord first',()=>{
  for(const hero of HEROES)for(const role of ['lord','loyal','rebel','renegade']) {
    const s=createGame({heroId:hero.id,role,seed:42});assert.equal(s.players[0].role,role);assert.equal(s.players[0].maxHp,hero.hp+(role==='lord'?1:0));assert.equal(s.players[s.current].role,'lord');check(s);assert.ok(restoreGame(JSON.stringify(s)))
  }
})
test('illegal and stale actions are atomic, including randomness and card zones',()=>{
  const s=fixture(),[sha]=hand(s,0,'sha');const raw=JSON.stringify(s)
  for(const action of [{seat:0,type:'play',ids:[sha.id],as:'sha',targets:[0]},{seat:1,type:'end'},{seat:0,type:'play',ids:[sha.id,sha.id],as:'sha',targets:[1]},{seat:0,type:'end',revision:999}]){assert.equal(dispatch(s,action).ok,false);assert.equal(JSON.stringify(s),raw)}
})
test('one ordinary slash per play phase; answering shan does not consume play quota',()=>{
  let s=fixture();const [sha,sha2]=hand(s,0,'sha','sha'),[shan]=hand(s,1,'shan');s=play(s,sha,1);assert.equal(s.pending.actor,1);s=respond(s,shan);assert.equal(s.players[1].hp,s.players[1].maxHp);assert.equal(dispatch(s,{seat:0,type:'play',ids:[sha2.id],as:'sha',targets:[1]}).ok,false)
})
test('slash without dodge damages; processing card finishes once',()=>{
  let s=fixture();const [sha]=hand(s,0,'sha');s=play(s,sha,1);assert.ok(s.processing.some(c=>c.id===sha.id));s=pass(s);assert.equal(s.players[1].hp,s.players[1].maxHp-1);assert.ok(s.discard.some(c=>c.id===sha.id));check(s)
})
test('living-seat distance, attack range, horses and mashu are directional',()=>{
  const s=fixture('machao');assert.equal(distance(s,0,2),1);equipment(s,2,'dilu');assert.equal(distance(s,0,2),2);equipment(s,0,'chitu');assert.equal(distance(s,0,2),1);equipment(s,0,'bow');assert.equal(attackRange(s,0),5);s.players[1].alive=false;assert.equal(distance(s,0,2),1)
})
test('wusheng converts red equipment but cannot retain a spent weapon attack range',()=>{
  const s=fixture('guanyu');const bow=equipment(s,0,'bow');assert.ok(isRed(bow));assert.ok(legalActions(s,0).some(a=>a.as==='sha'&&a.ids.includes(bow.id)&&a.targets[0]===1));assert.equal(dispatch(s,{seat:0,type:'play',ids:[bow.id],as:'sha',targets:[2]}).ok,false)
})
test('longdan swaps slash and dodge in both play and response windows',()=>{
  let s=fixture('zhaoyun');const [shan]=hand(s,0,'shan');s=play(s,shan,1,'sha');assert.equal(s.pending.as,'shan')
  s=fixture('zhaoyun','loyal',1);const [sha]=hand(s,0,'sha'),[attack]=hand(s,1,'sha');s=play(s,attack,0);s=respond(s,sha);assert.equal(s.players[0].hp,s.players[0].maxHp)
})
test('zhangfei and crossbow allow successive slashes',()=>{
  for(const hero of ['zhangfei','guanyu']){let s=fixture(hero);if(hero==='guanyu')equipment(s,0,'crossbow');const cards=hand(s,0,'sha','sha');for(const card of cards){s=play(s,card,1);s=pass(s)}assert.equal(s.players[1].hp,s.players[1].maxHp-2)}
})
test('lvbu requires two dodges and does not accept a single successful dodge',()=>{
  let s=fixture('lvbu');const [sha]=hand(s,0,'sha'),dodges=hand(s,1,'shan','shan');s=play(s,sha,1);assert.equal(s.pending.remaining,2);s=respond(s,dodges[0]);assert.equal(s.pending.remaining,1);s=respond(s,dodges[1]);assert.equal(s.players[1].hp,s.players[1].maxHp)
})
test('lvbu duel requires two slashes on each exchange and deals exactly one failed-exchange damage',()=>{
  let s=fixture('lvbu');const [duel]=hand(s,0,'duel'),[sha]=hand(s,1,'sha');s=play(s,duel,1);assert.equal(s.pending.remaining,2);s=respond(s,sha);assert.equal(s.pending.remaining,1);s=pass(s);assert.equal(s.players[1].hp,s.players[1].maxHp-1)
})
test('dying rescue can require multiple peaches and accepts the human decision',()=>{
  let s=fixture('guanyu','loyal',1);const [sha]=hand(s,1,'sha'),[tao]=hand(s,0,'tao');s.players[0].hp=1;s=play(s,sha,0);s=pass(s);assert.equal(s.pending.kind,'rescue');assert.equal(s.pending.actor,0);s=respond(s,tao);assert.equal(s.players[0].hp,1);assert.equal(s.players[0].alive,true)
})
test('lord sunquan receives two HP from another Wu hero peach',()=>{
  let s=fixture('sunquan');setHero(s,1,'huanggai');s.players[0].hp=-1;const [tao]=hand(s,1,'tao');s.phase='resolve';s.queue=[{type:'rescue',target:0,source:2}];settle(s);s=respond(s,tao);assert.equal(s.players[0].hp,1);assert.equal(s.players[0].alive,true)
})
test('rende threshold heals only once; hand transfers conserve IDs',()=>{
  let s=fixture('liubei');s.players[0].hp--;const cards=hand(s,0,'sha','shan','tao')
  s=step(s,{type:'skill',skill:'rende',ids:[cards[0].id],target:1});assert.equal(s.players[0].hp,s.players[0].maxHp-1)
  s=step(s,{type:'skill',skill:'rende',ids:[cards[1].id],target:1});assert.equal(s.players[0].hp,s.players[0].maxHp)
  s.players[0].hp--;s=step(s,{type:'skill',skill:'rende',ids:[cards[2].id],target:1});assert.equal(s.players[0].hp,s.players[0].maxHp-1);assert.deepEqual(s.players[1].hand.map(c=>c.id),cards.map(c=>c.id))
})
test('zhiheng exchanges equipment and cards together, once per phase',()=>{
  let s=fixture('sunquan');const [sha]=hand(s,0,'sha'),armor=equipment(s,0,'bagua');s=step(s,{type:'skill',skill:'zhiheng',ids:[sha.id,armor.id]});assert.equal(s.players[0].hand.length,2);assert.equal(s.players[0].equip.armor,null);assert.equal(dispatch(s,{seat:0,type:'skill',skill:'zhiheng',ids:[s.players[0].hand[0].id]}).ok,false)
})
test('kurou loses HP rather than damage, draws only after surviving rescue',()=>{
  let s=fixture('huanggai');s=step(s,{type:'skill',skill:'kurou'});assert.equal(s.players[0].hp,s.players[0].maxHp-1);assert.equal(s.players[0].hand.length,2)
  s=fixture('huanggai','rebel');s.players[0].hp=1;const [tao]=hand(s,0,'tao');s=step(s,{type:'skill',skill:'kurou'});assert.equal(s.pending.kind,'rescue');s=respond(s,tao);assert.equal(s.players[0].hp,1);assert.equal(s.players[0].hand.length,2)
})
test('zhouyu yingzi is optional, fanjian gives the randomly picked card even on a wrong guess',()=>{
  let s=createGame({heroId:'zhouyu',role:'lord',seed:1});assert.equal(s.pending.skill,'yingzi');s=choose(s,'yes');assert.equal(s.players[0].hand.length,7)
  s=fixture('zhouyu');const [card]=hand(s,0,['sha','spade']);s=step(s,{type:'skill',skill:'fanjian',target:1});assert.equal(s.pending.kind,'guess');s=choose(s,'heart');assert.ok(s.players[1].hand.some(c=>c.id===card.id));assert.equal(s.players[1].hp,s.players[1].maxHp-1)
})
test('caocao jianxiong moves the physical damage card out of processing, without duplication',()=>{
  let s=fixture('caocao','loyal',1);const [sha]=hand(s,1,'sha');s=play(s,sha,0);s=pass(s);assert.equal(s.pending.skill,'jianxiong');s=choose(s,'yes');assert.ok(s.players[0].hand.some(c=>c.id===sha.id));assert.equal(s.processing.length,0);check(s)
})
test('hujia asks Wei peers; supplying dodge completes the original response',()=>{
  let s=fixture('caocao','lord',1);setHero(s,2,'xuchu');const [shan]=hand(s,2,'shan'),[sha]=hand(s,1,'sha');s=play(s,sha,0);assert.ok(legalActions(s,0).some(a=>a.type==='support'));s=step(s,{type:'support'});assert.equal(s.pending.actor,2);s=respond(s,shan);assert.equal(s.players[0].hp,s.players[0].maxHp)
})
test('jijiang uses supporter card with lord as damage source and does not reveal hidden hands',()=>{
  let s=fixture('liubei');const [sha]=hand(s,1,'sha');s=step(s,{type:'skill',skill:'jijiang',target:4});assert.equal(s.pending.actor,1);s=respond(s,sha);assert.equal(s.pending.actor,4);assert.equal(s.pending.source,0);s=pass(s);assert.equal(s.players[4].hp,s.players[4].maxHp-1);check(s)
})
test('hujia can request two separate Wei dodges against lvbu wushuang',()=>{
  let s=fixture('caocao','lord',1);setHero(s,1,'lvbu');setHero(s,2,'xuchu');const [sha]=hand(s,1,'sha'),dodges=hand(s,2,'shan','shan');s=play(s,sha,0)
  for(const dodge of dodges){s=step(s,{type:'support'});assert.equal(s.pending.actor,2);s=respond(s,dodge)}
  assert.equal(s.players[0].hp,s.players[0].maxHp);assert.equal(s.pending,null)
})
test('machao tieji red blocks dodge; black permits it',()=>{
  for(const suit of ['heart','spade']){let s=fixture('machao');const [sha]=hand(s,0,'sha');hand(s,1,'shan');judgeTop(s,suit,1);s=play(s,sha,1);assert.equal(s.pending.skill,'tieji');s=choose(s,'yes');if(suit==='heart')assert.equal(s.players[1].hp,s.players[1].maxHp-1);else assert.equal(s.pending.as,'shan')}
})
test('yueying jizhi offers one draw per ordinary trick; qicai ignores snatch distance',()=>{
  let s=fixture('huangyueying');const [snatch]=hand(s,0,'snatch');hand(s,2,'sha');assert.ok(legalActions(s,0).some(a=>a.as==='snatch'&&a.targets[0]===2));s=play(s,snatch,2);assert.equal(s.pending.skill,'jizhi');s=choose(s,'yes');assert.equal(s.players[0].hand.length,1);s=choose(s,'hand');assert.equal(s.players[0].hand.length,2)
})
test('xuchu luoyi draws one, boosts slash and not AOE damage',()=>{
  let s=createGame({heroId:'xuchu',role:'lord',seed:1});assert.equal(s.pending.skill,'luoyi');s=choose(s,'yes');assert.equal(s.players[0].hand.length,5);assert.equal(s.players[0].marks.naked,true)
  s=fixture('xuchu');s.players[0].marks.naked=true;const [sha]=hand(s,0,'sha');s=play(s,sha,1);s=pass(s);assert.equal(s.players[1].hp,s.players[1].maxHp-2)
})
test('bagua judges red as a dodge, black returns to card response; qinggang bypasses armor',()=>{
  for(const suit of ['heart','spade']){let s=fixture();equipment(s,1,'bagua');const [sha]=hand(s,0,'sha');judgeTop(s,suit,1);s=play(s,sha,1);s=step(s,{type:'bagua'});if(suit==='heart')assert.equal(s.pending,null);else assert.equal(s.pending.baguaTried,true)}
  let s=fixture();equipment(s,0,'qinggang');equipment(s,1,'bagua');const [sha]=hand(s,0,'sha');s=play(s,sha,1);assert.equal(legalActions(s,1).some(a=>a.type==='bagua'),false)
})
test('renwang blocks black slash; mixed spear slash is colorless and not blocked',()=>{
  let s=fixture();equipment(s,1,'renwang');const [sha]=hand(s,0,['sha','spade']);s=play(s,sha,1);assert.equal(s.pending,null);assert.equal(s.players[1].hp,s.players[1].maxHp)
  s=fixture();equipment(s,0,'spear');equipment(s,1,'renwang');const cards=hand(s,0,['shan','heart'],['sha','spade']);s=step(s,{type:'play',ids:cards.map(c=>c.id),as:'sha',targets:[1]});assert.equal(s.pending.as,'shan');s=pass(s);assert.equal(s.players[1].hp,s.players[1].maxHp-1)
})
test('halberd only extends last-hand slash to at most three distinct targets',()=>{
  let s=fixture();equipment(s,0,'halberd');const [sha]=hand(s,0,'sha');assert.ok(legalActions(s,0).some(a=>a.targets?.length===3));s=step(s,{type:'play',ids:[sha.id],as:'sha',targets:[1,2,3]});for(let i=0;i<3;i++)s=pass(s);assert.equal(s.players.slice(1,4).every(p=>p.hp===p.maxHp-1),true)
})
test('axe spends two additional cards after dodge and causes one normal damage',()=>{
  let s=fixture();equipment(s,0,'axe');const [sha,...cost]=hand(s,0,'sha','shan','tao'),[shan]=hand(s,1,'shan');s=play(s,sha,1);s=respond(s,shan);assert.equal(s.pending.kind,'axe');s=respond(s,cost);assert.equal(s.players[1].hp,s.players[1].maxHp-1);assert.equal(s.players[0].hand.length,0)
})
test('blade additional slash does not consume a new ordinary play quota',()=>{
  let s=fixture();equipment(s,0,'blade');const [sha,extra]=hand(s,0,'sha','sha'),[shan]=hand(s,1,'shan');s=play(s,sha,1);s=respond(s,shan);assert.equal(s.pending.kind,'blade');s=respond(s,extra);s=pass(s);assert.equal(s.players[1].hp,s.players[1].maxHp-1);assert.equal(s.players[0].marks.sha,1)
})
test('ice sword replaces damage with exactly two discards',()=>{
  let s=fixture();equipment(s,0,'ice');const [sha]=hand(s,0,'sha');hand(s,1,'tao','duel');s=play(s,sha,1);s=pass(s);assert.equal(s.pending.skill,'ice');s=choose(s,'yes');s=choose(s,'hand');s=choose(s,'hand');assert.equal(s.players[1].hp,s.players[1].maxHp);assert.equal(s.players[1].hand.length,0)
})
test('bow can remove either horse then finish damage',()=>{
  let s=fixture();equipment(s,0,'bow');const horse=equipment(s,1,'dilu'),[sha]=hand(s,0,'sha');s=play(s,sha,1);s=pass(s);assert.equal(s.pending.skill,'bow');s=choose(s,'defenseHorse');assert.equal(s.players[1].equip.defenseHorse,null);assert.ok(s.discard.some(c=>c.id===horse.id));assert.equal(s.players[1].hp,s.players[1].maxHp-1)
})
test('dualsword gives opposite-sex target a real discard-or-draw choice',()=>{
  let s=fixture();setHero(s,1,'huangyueying');equipment(s,0,'dualsword');const [sha]=hand(s,0,'sha');hand(s,1,'tao');s=play(s,sha,1);s=choose(s,'yes');assert.equal(s.pending.skill,'dualTarget');s=choose(s,'draw');assert.equal(s.players[0].hand.length,1);assert.equal(s.pending.as,'shan')
})
test('counter-counter chain restores the original trick, each nullify consumed once',()=>{
  let s=fixture();const [draw]=hand(s,0,'draw'),[n1]=hand(s,1,'nullify'),[n2]=hand(s,2,'nullify');s=play(s,draw);assert.equal(s.pending.actor,1);s=respond(s,n1);assert.equal(s.pending.chain.negated,true);s=respond(s,n2);assert.equal(s.pending,null);assert.equal(s.players[0].hand.length,2)
})
test('a single nullify stops draw trick; old prompt IDs cannot answer a new response',()=>{
  let s=fixture();const [draw]=hand(s,0,'draw'),[nullify]=hand(s,1,'nullify');s=play(s,draw);const id=s.pending.id;s=respond(s,nullify);assert.equal(s.players[0].hand.length,0);assert.equal(dispatch(s,{seat:1,type:'pass',promptId:id}).ok,false)
})
test('global savage resolves in order, no private identity exemption and no card leakage',()=>{
  let s=fixture('zhangfei');const [aoe]=hand(s,0,'savage');s=play(s,aoe);for(let seat=1;seat<5;seat++){assert.equal(s.pending.actor,seat);s=pass(s)}assert.ok(s.players.slice(1).every(p=>p.hp===p.maxHp-1));check(s)
})
test('harvest presents a shared shrinking pool, each living player selects once',()=>{
  let s=fixture();const [harvest]=hand(s,0,'harvest');s=play(s,harvest);for(let seat=0;seat<5;seat++){assert.equal(s.pending.actor,seat);assert.equal(s.harvestPool.length,5-seat);s=choose(s,s.harvestPool[0].id)}assert.equal(s.harvestPool.length,0);assert.ok(s.players.every(p=>p.hand.length===1));check(s)
})
test('collateral refusal transfers weapon; ordered targets cannot be swapped',()=>{
  let s=fixture();const [card]=hand(s,0,'collateral'),weapon=equipment(s,1,'crossbow');assert.equal(dispatch(s,{seat:0,type:'play',ids:[card.id],as:'collateral',targets:[0,1]}).ok,false);s=play(s,card,[1,0]);s=pass(s);assert.equal(s.players[1].equip.weapon,null);assert.ok(s.players[0].hand.some(c=>c.id===weapon.id))
})
test('indulgence skips play on non-heart judgment but still draws and discards normally',()=>{
  let s=fixture();const indulgence=take(s,'indulgence');s.players[1].judgment.push(indulgence);judgeTop(s,'spade',3);s=step(s,{type:'end'});assert.notEqual(s.current,1);assert.ok(s.logs.some(l=>l.text.includes('判定')));assert.equal(s.players[1].hand.length,2)
})
test('lightning non-hit passes to next living player and hit causes three sourceless damage',()=>{
  let s=fixture();const lightning=take(s,'lightning');s.players[1].judgment.push(lightning);judgeTop(s,'heart',2);s=step(s,{type:'end'});assert.ok(s.players[2].judgment.some(c=>c.id===lightning.id));assert.equal(s.current,1)
  s=fixture();s.players[1].judgment.push(take(s,'lightning'));judgeTop(s,'spade',7);s=step(s,{type:'end'});assert.equal(s.players[1].hp,s.players[1].maxHp-3)
})
test('a player dying during own duel automatically ends that turn, not an AI deadlock',()=>{
  let s=fixture('guanyu','rebel');s.players[0].hp=1;const [duel]=hand(s,0,'duel'),[sha]=hand(s,1,'sha');s=play(s,duel,1);s=respond(s,sha);assert.equal(s.pending.actor,0);s=pass(s);assert.equal(s.players[0].alive,false);assert.notEqual(s.current,0);assert.ok(s.pending||legalActions(s,s.current).length)
})
test('killing a rebel draws three; a lord killing loyal loses all hand and equipment',()=>{
  for(const role of ['rebel','loyal']){let s=fixture('zhangfei');const target=s.players.find(p=>p.role===role).seat;equipment(s,0,'bow');s.players[target].hp=1;const [sha]=hand(s,0,'sha');hand(s,0,'shan');s=play(s,sha,target);s=pass(s);assert.equal(s.players[target].alive,false);if(role==='rebel')assert.equal(s.players[0].hand.length,4);else{assert.equal(s.players[0].hand.length,0);assert.equal(s.players[0].equip.weapon,null)}}
})
test('lord death awards rebels except a sole living renegade; loyal victory includes dead loyal',()=>{
  let s=fixture('guanyu','renegade');const lord=s.players.find(p=>p.role==='lord');for(const p of s.players)if(p.seat!==0&&p!==lord){p.alive=false;p.hp=0}lord.hp=1;equipment(s,0,'bow');const [sha]=hand(s,0,'sha');s=play(s,sha,lord.seat);s=pass(s);assert.equal(s.winner,'renegade')
  s=fixture();for(const p of s.players)if(p.role==='rebel'||p.role==='renegade'){p.alive=false;p.hp=0}s.phase='resolve';const victim=s.players.find(p=>p.role==='loyal');victim.hp=0;s.queue=[{type:'rescue',target:victim.seat,source:null}];settle(s);assert.equal(s.winner,'lord')
})
test('saves restore mid-response/counter/rescue with all physical IDs; malformed zones rejected',()=>{
  let s=fixture();const [sha]=hand(s,0,'sha');s=play(s,sha,1);const restored=restoreGame(JSON.stringify(s));assert.deepEqual(restored,s);assert.deepEqual(pass(restored),pass(s));const bad=structuredClone(s);bad.deck[0]=bad.deck[1];assert.equal(restoreGame(bad),null)
})
test('invalid pending choices, queued events and last-played card metadata reject safely',()=>{
  let s=createGame({heroId:'xuchu',role:'lord',seed:2});const choice=structuredClone(s);choice.pending.choices=null;assert.equal(restoreGame(choice),null)
  const skill=structuredClone(s);skill.pending.skill='invented';assert.equal(restoreGame(skill),null)
  s=fixture();const [sha]=hand(s,0,'sha');s=play(s,sha,1);const queued=structuredClone(s);queued.queue.push({type:'invented'});assert.equal(restoreGame(queued),null)
  const played=structuredClone(s);played.lastPlayed.cards[0].type='invented';assert.equal(restoreGame(played),null)
})
test('AI choices are invariant under opponents concealed identity/hand permutations',()=>{
  const a=fixture('guanyu','loyal');hand(a,0,'sha','snatch');hand(a,1,'shan');hand(a,2,'tao');const b=structuredClone(a);[b.players[1].hand,b.players[2].hand]=[b.players[2].hand,b.players[1].hand];const hidden=b.players.filter(p=>p.seat!==0&&p.role!=='lord');[hidden[0].role,hidden[1].role]=[hidden[1].role,hidden[0].role];assert.deepEqual(playerView(a,0),playerView(b,0));assert.deepEqual(chooseAI(playerView(a,0)),chooseAI(playerView(b,0)))
})
test('critically wounded AI does not initiate a duel with no slash resources against armed hands',()=>{
  const s=fixture('zhangfei','rebel');s.players[0].hp=1;hand(s,0,'duel');for(let i=1;i<5;i++)hand(s,i,'sha');const action=chooseAI(playerView(s,0));assert.equal(action.type,'end')
})
test('120 seeded five-player AI matches finish legally; inventory and response saves never diverge',()=>{
  const winners=new Set()
  for(let seed=1;seed<=120;seed++) {
    let s=createGame({seed,heroId:HEROES[seed%12].id}),steps=0
    while(s.phase!=='finished'&&steps++<3000){const seat=s.pending?.actor??s.current,action=chooseAI(playerView(s,seat));assert.ok(action,`seed ${seed}, step ${steps}: no stalled turn`);const result=dispatch(s,action);assert.ok(result.ok,`seed ${seed}: ${result.error}`);s=result.state;check(s);if(s.pending&&steps%7===0)assert.ok(restoreGame(JSON.stringify(s)))}
    assert.equal(s.phase,'finished',`seed ${seed} terminates`);winners.add(s.winner)
  }
  assert.ok(winners.has('lord')&&winners.has('rebel')&&winners.has('renegade'))
})
