import test from 'node:test'
import assert from 'node:assert/strict'
import {createAssignedGame,dispatch,playerView,catalog} from '../site/.vuepress/components/fengshen/engine.mjs'
import {CARDS_BY_TYPE} from '../site/.vuepress/components/fengshen/theme.mjs'
import {stableOpponents} from './fixtures/gods-stable.mjs'
// 自动结束出牌（maybeAutoEnd）依赖引擎唯一事实：legalActions 只剩 {type:'end'} 时才自动结束。
// 本文件是安全网回归：枚举全部出牌阶段主动技能与全部实体牌，逐一证明「可发动/可出时
// legalActions 必含对应动作」，防止未来新增技能或牌时漏报，导致玩家的动作被自动跳过。
const step=(s,a)=>{const r=dispatch(s,{seat:s.pending?.actor??s.current,...a});assert.ok(r.ok,r.error);return r.state}
function base(heroId,role='rebel',heroIds){
 // heroIds 省略时用固定的已接入英雄补齐并锁死对手池（stableOpponents 会替换 1-4 号位）；
 // 显式传入时是完整五人名单（首位即 heroId），原样保留以便指定主公英雄。
 const list=heroIds||[heroId,...['jifa','yangjian','nezha','jinling','daji'].filter(h=>h!==heroId).slice(0,4)]
 const roles=[role,role==='lord'?'loyal':'lord','loyal','rebel','renegade']
 const assigned=createAssignedGame({roles,heroIds:list,seed:19})
 const s=heroIds?assigned:stableOpponents(assigned)
 s.deck=catalog.makeDeck();s.discard=[];s.processing=[];s.harvestPool=[];s.queue=[];s.pending=null;s.phase='play';s.current=0;s.logs=[];s.lastPlayed=null;s.lastEvent=null
 for(const p of s.players){p.hand=[];p.equip={weapon:null,armor:null,offenseHorse:null,defenseHorse:null};p.judgment=[];p.marks={sha:0,rende:0};p.hp=p.maxHp;p.alive=true}
 return s
}
const give=(s,seat,type,suit='spade',rank=9)=>{const c={id:`ax-${type}-${seat}-${suit}${rank}`,type,suit,rank};s.players[seat].hand.push(c);return c}
const CARDS='rende zhiheng kurou fanjian jieyin qingnang lijian qiangxi jijiang luanji huangtian quhu tianyi ganlu dimeng anxu xueji luanwu jiushi lianhuan tiaoxin zhijian zhiba'.split(' ')
const CASES={
 rende:['jifa',s=>give(s,0,'tao','heart')],
 zhiheng:['yunzhongzi',s=>give(s,0,'sha')],
 kurou:['chenqi',()=>{}],
 fanjian:['guangchengzi',s=>give(s,0,'sha')],
 jieyin:['isis',s=>{s.players[0].hp--;s.players[1].hp--;give(s,0,'sha');give(s,0,'shan')}],
 qingnang:['taiyi',s=>{s.players[1].hp--;give(s,0,'sha')}],
 lijian:['daji',s=>give(s,0,'sha')],
 qiangxi:['thor',()=>{}],
 jijiang:['jifa',()=>{},'lord'],
 luanji:['yuanshi',s=>{give(s,0,'sha','spade');give(s,0,'shan','spade')}],
 huangtian:['shengongbao',s=>give(s,0,'shan'),'rebel',['shengongbao','randeng','jifa','nezha','jinling']],
 quhu:['fuxi',s=>{s.players[0].hp--;give(s,0,'sha');give(s,1,'shan')}],
 tianyi:['susanoo',s=>{give(s,0,'sha');give(s,1,'shan')}],
 ganlu:['nuwa',()=>{}],
 dimeng:['zeus',()=>{}],
 anxu:['amaterasu',()=>{}],
 xueji:['artemis',s=>{s.players[0].hp--;give(s,0,'tao','heart')}],
 luanwu:['loki',()=>{}],
 jiushi:['apollo',()=>{}],
 lianhuan:['tsukuyomi',s=>give(s,0,'sha','club')],
 tiaoxin:['yangren',()=>{}],
 zhijian:['laozi',s=>give(s,0,'bagua')],
 zhiba:['guangchengzi',s=>{give(s,0,'sha');give(s,1,'shan')},'rebel',['guangchengzi','yinjiao','jifa','nezha','jinling']],
}
test('every play-phase active skill shows up in legalActions so auto-end can never skip it',()=>{
 assert.deepEqual(CARDS.sort(),Object.keys(CASES).sort(),'技能清单与场景表必须一一对应')
 for(const skill of CARDS){
  const [heroId,setup,role='rebel',heroIds]=CASES[skill]
  const s=base(heroId,role,heroIds);setup(s)
  const legal=playerView(s,0).legal
  assert.ok(legal.some(a=>a.type==='skill'&&a.skill===skill),`${skill}（${heroId}）可发动时 legalActions 必须包含它，否则会被自动结束出牌误跳过`)
 }
 // 摄宝（jixi）无Playable英雄持有，对局中不存在，无需覆盖
})
test('every physical card type offers a play action so auto-end can never skip it',()=>{
 const s=base('yangjian');s.players[0].hp-- // 受伤才能出桃
 // 给对手准备可被指定目标的手牌/装备/判定牌，保证摄宝/落宝/兵粮等都有目标
 for(const seat of [1,2,3,4])give(s,seat,'shan')
 s.players[1].equip.weapon={id:'ax-weapon',type:'qinggang',suit:'spade',rank:1}
 s.players[1].judgment.push({id:'ax-judge',type:'indulgence',suit:'heart',rank:6})
 for(const [type,def] of Object.entries(CARDS_BY_TYPE)){
  if(def.virtualOnly)continue
  if(['shan','nullify'].includes(type))continue // 响应牌不可主动出
  const c=give(s,0,type)
  const as=def.attackNature?'sha':type,legal=playerView(s,0).legal
  assert.ok(legal.some(a=>a.type==='play'&&a.as===as&&a.ids.includes(c.id)),`${type}（${def.name}）可出时 legalActions 必须包含 play:${as}`)
  s.players[0].hand.pop()
 }
 // 闪与无懈确实不产生主动 play——此时 legal 只剩 end，自动结束是正确行为
 give(s,0,'shan');give(s,0,'nullify')
 assert.ok(!playerView(s,0).legal.some(a=>a.type==='play'&&['shan','nullify'].includes(a.as)),'响应牌不应有主动出牌动作')
})
test('bare play phase offers exactly one end action, the exact shape auto-end relies on',()=>{
 const s=base('yangjian')
 assert.deepEqual(playerView(s,0).legal,[{type:'end'}])
 // 打出这张结束牌后正常进入弃牌/下家，不产生异常
 const out=step(s,{type:'end'})
 assert.ok(out.winner==null||out.phase!=='play'||out.current!==0)
})
