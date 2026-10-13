import test from 'node:test'
import assert from 'node:assert/strict'
import {PlayMotionQueue,publicPlayMotions,pendingImpact} from '../site/.vuepress/components/fengshen/play-motion.mjs'
import {adapter} from '../services/mahjong/rooms/adapters/fengshen.js'
const card={id:'public-1',type:'nullify',suit:'club',rank:12}
test('nullify uses actual public caster and the current AOE victim, not next actor',()=>{
 const before={turns:2,lastResponse:null,lastPlayed:{id:1},pending:{kind:'counter',actor:3,source:1,target:0,cardType:'arrows',negated:false}}
 const after={...before,lastResponse:{id:7,source:3,as:'nullify',cards:[card],turn:2},pending:{...before.pending,actor:4,target:2}}
 const [e]=publicPlayMotions(before,after)
 assert.equal(e.source,3);assert.equal(e.focus.target,0);assert.equal(e.focus.kind,'damage');assert.equal(e.focus.negated,true)
 assert.deepEqual(publicPlayMotions(after,after),[],'rerender cannot replay a response')
 before.pending.negated=true;assert.equal(publicPlayMotions(before,after)[0].focus.negated,false,'counter-counter restores effect, not another shield')
})
test('own nullify prompt shows pending damage, cards or healing without exposing holder',()=>{
 for(const [cardType,kind]of [['arrows','damage'],['savage','damage'],['harvest','gain'],['draw','gain'],['garden','heal'],['snatch','take']]){
  const f=pendingImpact({pending:{kind:'counter',actor:4,source:2,target:0,cardType,negated:false}})
  assert.equal(f.kind,kind);assert.equal(f.target,0);assert.equal(f.source,2);assert.equal('actor' in f,false)
 }
})
test('all public plays, responses and virtual cards animate; hidden hands never enter events',()=>{
 const before={turns:2,lastPlayed:null,lastResponse:null},play={id:1,turn:2,source:2,as:'sha',cards:[{...card,type:'sha'}]}
 assert.equal(publicPlayMotions(before,{...before,lastPlayed:play})[0].source,2)
 assert.equal(publicPlayMotions(before,{...before,lastResponse:{...play,id:2,as:'shan'}})[0].as,'shan')
 assert.equal(publicPlayMotions(before,{...before,lastPlayed:{...play,cards:[],virtualType:'duel'}})[0].virtualType,'duel')
 assert.deepEqual(publicPlayMotions(before,{...before,players:[{hand:[card]}],pending:{kind:'counter',actor:3}}),[])
})
test('public flights queue in order and do not restart on resize, expiry or duplicate states',()=>{
 let now=0;const q=new PlayMotionQueue({now:()=>now}),events=[{key:'a',source:1,cards:[card],counter:true},{key:'b',source:2,cards:[card],counter:false}]
 q.enqueue(events);now=300;assert.equal(q.frame().elapsed,300);q.enqueue(events);assert.equal(q.items.length,2);assert.equal(q.frame().elapsed,300)
 now=1451;assert.equal(q.frame().event.key,'b');assert.equal(q.frame().elapsed,0)
 now+=1051;assert.equal(q.busy,false);q.enqueue(events);assert.equal(q.busy,false,'same public IDs never replay after expiry');q.clear();assert.equal(q.items.length,0)
})
test('online AI waits for public flight, while passing and drafting stay quick',()=>{
 assert.equal(adapter.aiPaceMs({s:{pending:null},action:{type:'respond'}}),1700)
 assert.equal(adapter.aiPaceMs({s:{pending:null},action:{type:'play'}}),1700)
 assert.equal(adapter.aiPaceMs({s:{pending:null},action:{type:'pass'}}),650)
 assert.equal(adapter.aiPaceMs({s:{pending:{kind:'reveal'}}}),1800)
})
