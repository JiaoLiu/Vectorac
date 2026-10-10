import test from 'node:test'
import assert from 'node:assert/strict'
import {PLAYABLE_HEROES,HEROES,skillHelp} from '../.private/fengshen/theme.mjs'
import {CANONICAL_BY_ID} from '../.private/fengshen/canonical-roster.mjs'
import {catalog,createGame,createAssignedGame,dispatch,playerView,restoreGame,allCards,chooseAI} from '../.private/fengshen/engine.mjs'
import {AUDIO_ENTRIES,skillAudioKey} from '../.private/fengshen/audio-manifest.mjs'
test('all verified characters retain full original skills, HP, sex and mechanical faction',()=>{
 assert.equal(PLAYABLE_HEROES.length,26)
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
