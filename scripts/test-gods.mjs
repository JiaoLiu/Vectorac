import test from 'node:test'
import assert from 'node:assert/strict'
import {PLAYABLE_HEROES,HEROES,skillHelp} from '../site/.vuepress/components/fengshen/theme.mjs'
import {CANONICAL_BY_ID} from '../site/.vuepress/components/fengshen/canonical-roster.mjs'
import {catalog,createGame,createAssignedGame,dispatch,playerView,restoreGame,allCards,chooseAI,militaryCatalog} from '../site/.vuepress/components/fengshen/engine.mjs'
import {AUDIO_ENTRIES,skillAudioKey} from '../site/.vuepress/components/fengshen/audio-manifest.mjs'
const aiFixture=(options,seat)=>{const s=createAssignedGame({seed:23,deckVersion:2,...options});s.deck=militaryCatalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=seat;s.turns=1;s.lastPlayed=null;s.lastResponse=null;s.exchange=null;s.publicReveal=null;s.logs=[];for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0};p.hp=p.maxHp;p.alive=true}return s}
const aiGive=(s,seat,type,suit=null)=>{const i=s.deck.findIndex(c=>c.type===type&&(!suit||c.suit===suit));assert.ok(i>=0,'牌堆缺 '+type);const c=s.deck.splice(i,1)[0];s.players[seat].hand.push(c);return c}
const aiStep=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,revision:s.revision,promptId:s.pending?.id,...a});assert.ok(r.ok,r.error);return r.state}
const aiPick=s=>chooseAI(playerView(s,s.pending?.actor??s.current))
const rescueDying=s=>{s=aiStep(s,{type:'pass'});while(s.pending?.kind==='rescue'&&s.pending.actor!==1)s=aiStep(s,{type:'pass'});assert.equal(s.pending?.kind,'rescue');assert.equal(s.pending?.actor,1);return s}
test('all verified characters retain full original skills, HP, sex and mechanical faction',()=>{
 assert.equal(PLAYABLE_HEROES.length,64)
 for(const h of PLAYABLE_HEROES){const c=CANONICAL_BY_ID[h.id],runtime=catalog.HERO_BY_ID[h.engineId];assert.equal(c.verification,'verified');assert.deepEqual(Object.keys(h.skillNames).sort(),c.skills.slice().sort());assert.equal(runtime.hp,c.hp);assert.equal(runtime.sex,c.sex);assert.equal(runtime.faction,c.mechanicalFaction);assert.equal(h.referenceId,c.referenceId);assert.ok(HEROES.includes(h))}
})
test('unsupported full reference profiles cannot enter assignments or new games',()=>{for(const h of HEROES.filter(h=>!h.playable)){assert.throws(()=>createGame({heroId:h.id}));assert.throws(()=>createAssignedGame({heroIds:[h.id,'jifa','nezha','yangjian','dixin'],roles:['lord','loyal','rebel','rebel','renegade']}))}})
test('every enabled skill has themed help and named audio without mixed duplicates',()=>{for(const h of PLAYABLE_HEROES)for(const [s,name] of Object.entries(h.skillNames)){assert.ok(skillHelp(h,s));assert.ok(AUDIO_ENTRIES.some(e=>e.key===skillAudioKey(h.engineId,s)&&e.text===name),h.name+' '+s)}assert.equal(new Set(AUDIO_ENTRIES.map(e=>e.key)).size,AUDIO_ENTRIES.length)})
test('AI stays invariant under concealed opponent cards and roles permutations',()=>{
 for(const h of PLAYABLE_HEROES){const s=createGame({heroId:h.id,seed:28}),seat=s.pending?.actor??s.current,altered=structuredClone(s);for(const p of altered.players)if(p.seat!==seat){p.hand.reverse();if(p.role==='rebel')p.role='renegade';else if(p.role==='renegade')p.role='rebel'}assert.deepEqual(chooseAI(playerView(s,seat)),chooseAI(playerView(altered,seat)))}
})
test('all completed heroes survive seeded AI games and prompt save/reload',()=>{
 for(let seed=0;seed<75;seed++){let s=createGame({heroId:PLAYABLE_HEROES[seed%PLAYABLE_HEROES.length].id,seed:seed+200}),steps=0;while(!s.winner&&steps++<6000){const a=chooseAI(playerView(s,s.pending?.actor??s.current)),r=dispatch(s,a);assert.ok(r.ok,r.error);s=r.state;if(steps%41===0){assert.ok(restoreGame(s));assert.equal(allCards(s).length,108)}}assert.ok(s.winner,'seed '+seed)}
})
test('AI 响应优先真牌，只有没真牌时才废牌假冒',()=>{
 const identity={roles:['lord','loyal','rebel','rebel','renegade'],heroIds:['jifa','shengongbao','dixin','jinling','kongxuan']}
 // 妖言忠臣救援主公：真仙桃在手不得拿废牌假冒
 let s=aiFixture(identity,4),atk=aiGive(s,4,'sha'),tao=aiGive(s,1,'tao');aiGive(s,1,'lightning');s.players[0].hp=1
 s=rescueDying(aiStep(s,{type:'play',as:'sha',ids:[atk.id],targets:[0]}))
 let pick=aiPick(s)
 assert.ok(pick.ids?.includes(tao.id)&&!pick.guhuo,'真桃救援不得假冒：'+JSON.stringify(pick))
 // 手里只有废牌时才用假冒救援队友
 s=aiFixture(identity,4);atk=aiGive(s,4,'sha');aiGive(s,1,'lightning');s.players[0].hp=1
 s=rescueDying(aiStep(s,{type:'play',as:'sha',ids:[atk.id],targets:[0]}))
 pick=aiPick(s)
 assert.ok(pick.guhuo,'没真牌才假冒救援：'+JSON.stringify(pick))
 // 真桃凑不齐所需（-1 血要两个桃、手里只有一个真桃）：一颗都不出，也不拿真桃去赌假冒凑数
 s=aiFixture(identity,4);atk=aiGive(s,4,'sha');aiGive(s,1,'tao');aiGive(s,1,'lightning');s.players[0].hp=0
 s=rescueDying(aiStep(s,{type:'play',as:'sha',ids:[atk.id],targets:[0]}))
 pick=aiPick(s)
 assert.equal(pick.type,'pass','救不活就别白送真桃：'+JSON.stringify(pick))
 // 出闪同理：真闪在手不得拿废牌假冒
 s=aiFixture(identity,0);atk=aiGive(s,0,'sha');const shan=aiGive(s,1,'shan');aiGive(s,1,'lightning')
 s=aiStep(s,{type:'play',as:'sha',ids:[atk.id],targets:[1]})
 pick=aiPick(s)
 assert.ok(pick.ids?.includes(shan.id)&&!pick.guhuo,'真闪响应不得假冒：'+JSON.stringify(pick))
})
test('AI 闪电按判定传递路径的敌我分布决定挂不挂',()=>{
 const heroes=['nezha','dixin','shengongbao','jinling','kongxuan']
 // 传递路径上全是敌人：值得挂出
 let s=aiFixture({sides:[0,1,1,1,1],heroIds:heroes},0);aiGive(s,0,'lightning')
 let pick=aiPick(s)
 assert.equal(pick.type,'play');assert.equal(pick.as,'lightning')
 // 敌人排在路径末尾、前面全是自己人：闪电先炸自己再流经队友，留在手里
 s=aiFixture({sides:[0,0,0,0,1],heroIds:heroes},0);aiGive(s,0,'lightning')
 pick=aiPick(s)
 assert.ok(!(pick.type==='play'&&pick.as==='lightning'),'不该挂出闪电：'+JSON.stringify(pick))
})
test('AI 决斗按敌方手牌数计风险，同分出杀先出普通杀',()=>{
 const options={sides:[0,1,0,0,0],heroIds:['nezha','shengongbao','dixin','jinling','kongxuan']}
 const duelTable=enemyCards=>{const s=aiFixture(options,0),duel=aiGive(s,0,'duel'),sha=aiGive(s,0,'sha');for(let i=0;i<enemyCards;i++)aiGive(s,1,'sha');return {s,duel,sha}}
 // 敌人空手牌：决斗必赢，优先于杀
 let {s,duel,sha}=duelTable(0),pick=aiPick(s)
 assert.equal(pick.as,'duel');assert.deepEqual(pick.targets,[1]);assert.ok(pick.ids.includes(duel.id))
 // 敌人五张手牌：决斗可能被反杀，先出杀
 ;({s,duel,sha}=duelTable(5));pick=aiPick(s)
 assert.equal(pick.as,'sha');assert.ok(pick.ids.includes(sha.id))
 // 同分偏好低价值牌：火杀先摸到也要先出普通杀
 s=aiFixture(options,0);const fire=aiGive(s,0,'firesha');const plain=aiGive(s,0,'sha');aiGive(s,0,'thundersha')
 pick=aiPick(s)
 assert.equal(pick.as,'sha');assert.ok(pick.ids.includes(plain.id)&&!pick.ids.includes(fire.id),'应先出普通杀：'+JSON.stringify(pick))
})
