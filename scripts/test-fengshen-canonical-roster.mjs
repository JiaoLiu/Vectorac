import test from 'node:test'
import assert from 'node:assert/strict'
import {CANONICAL_ROSTER,CANONICAL_BY_ID,auditCanonicalRoster}from '../.private/fengshen/canonical-roster.mjs'
import {HEROES,ALLIANCES}from '../.private/fengshen/theme.mjs'
test('64 one-to-one target profiles: full Standard 25, each Wind/Fire/Forest/Mountain 8, seven Yijiang profiles',()=>{
 assert.equal(CANONICAL_ROSTER.length,64);assert.equal(new Set(CANONICAL_ROSTER.map(h=>h.id)).size,64);assert.equal(new Set(CANONICAL_ROSTER.map(h=>h.referenceId)).size,64)
 for(const [pack,count]of [['standard',25],['wind',8],['fire',8],['forest',8],['mountain',8]])assert.equal(CANONICAL_ROSTER.filter(h=>h.pack===pack).length,count)
 assert.ok(HEROES.every(h=>CANONICAL_BY_ID[h.id]));assert.ok(CANONICAL_ROSTER.every(h=>h.skills.length===h.sourceSkillNames.length))
})
test('Isis maps to full Sun Shangxiang, never Rende/Jizhi; established Liu Bei/Cao Cao/Yueying mappings stay unique',()=>{
 assert.deepEqual(CANONICAL_BY_ID.isis.skills,['jieyin','xiaoji']);assert.equal(CANONICAL_BY_ID.isis.referenceName,'孙尚香')
 assert.equal(CANONICAL_BY_ID.jifa.referenceName,'刘备');assert.equal(CANONICAL_BY_ID.dixin.referenceName,'曹操');assert.equal(CANONICAL_BY_ID.jinling.referenceName,'黄月英')
 assert.equal(CANONICAL_ROSTER.filter(h=>h.skills.includes('rende')).length,1);assert.equal(CANONICAL_ROSTER.filter(h=>h.skills.includes('jizhi')).length,1)
})
test('runtime profiles are one-to-one; certification must match completed batch',()=>{
 const issues=auditCanonicalRoster(HEROES,ALLIANCES)
 assert.deepEqual(issues,[]);assert.deepEqual(HEROES.find(h=>h.id==='isis').skillNames,{jieyin:'生命之契',xiaoji:'圣翼'})
})
test('single skill reuse is allowed by reference package, but not extra mixed skills',()=>{
 assert.ok(CANONICAL_BY_ID.leizhenzi.skills.includes('mashu'));assert.ok(CANONICAL_BY_ID.luya.skills.includes('mashu'))
 const base=CANONICAL_BY_ID.isis,h={...base,playable:true,skillNames:{jieyin:'生命之契',xiaoji:'圣翼'},faction:'olympus'}
 const correct=auditCanonicalRoster([h],ALLIANCES);assert.ok(!correct.some(s=>s.includes('技能组不等于')))
 const mixed=auditCanonicalRoster([{...h,skillNames:{...h.skillNames,jizhi:'秘法'}}],ALLIANCES);assert.ok(mixed.some(s=>s.includes('技能组不等于')))
})
