import {PLAYABLE_HEROES,HERO_BY_THEME_ID,ALLIANCES} from './theme.mjs'
import {createAssignedGame,restoreGame,THEME_VERSION} from './engine.mjs'
export const SETUP_VERSION=1
export const LORD_HEROES=['jifa','dixin','yunzhongzi']
// 玩法模式：身份局隐藏身份；对抗局（1v1/2v2/3v3）只有敌友两队，
// 0 号席固定为友方（本地），1 号席敌方，此后交替穿插，先手由开局掷骰决定。
export const MODES={
 identity5:{id:'identity5',name:'五人身份局',menu:'5人身份',players:5,roles:['lord','loyal','rebel','rebel','renegade'],teams:null,blurb:'1主1忠2反1内 · 经典隐藏身份'},
 identity8:{id:'identity8',name:'八人身份局',menu:'8人身份',players:8,roles:['lord','loyal','loyal','rebel','rebel','rebel','rebel','renegade'],teams:null,blurb:'1主2忠4反1内 · 大战场'},
 '3v3':{id:'3v3',name:'3v3 两军对垒',menu:'3v3',players:6,roles:null,teams:[['lord','loyal','loyal'],['rebel','rebel','rebel']],blurb:'友敌各3人穿插落座 · 掷骰定先手'},
 '2v2':{id:'2v2',name:'2v2 并肩作战',menu:'2v2',players:4,roles:null,teams:[['lord','loyal'],['rebel','rebel']],blurb:'双人搭档穿插落座 · 掷骰定先手'},
 '1v1':{id:'1v1',name:'1v1 单骑对决',menu:'1v1',players:2,roles:null,teams:[['lord'],['rebel']],blurb:'一对一 · 掷骰定先手'},
}
export const MODE_LIST=Object.values(MODES)
export const modeById=id=>MODES[id]||MODES.identity5
const clone=s=>JSON.parse(JSON.stringify(s))
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296}
function shuffle(s,a){const out=a.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
// 编排座位：身份局整体洗牌；对抗局 0 号席固定友方，两队内部各自洗牌后交替穿插
// （友、敌、友、敌…），保证「你出牌 → 下家敌人 → 队友 → 敌人」的循环。
function arrangeRoles(mode,s){
  if(!mode.teams)return shuffle(s,mode.roles)
  const teams=mode.teams.map(t=>shuffle(s,t))
  const out=[]
  for(let i=0;i<Math.max(teams[0].length,teams[1].length);i++){
    if(teams[0][i]!=null)out.push(teams[0][i])
    if(teams[1][i]!=null)out.push(teams[1][i])
  }
  return out
}
function mixSeed(value){let x=(value^0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return (x^(x>>>16))>>>0}
export function createSetup({seed=Date.now()>>>0,mode:modeId='identity5'}={}){
  const mode=modeById(modeId),n=mode.players,team=!!mode.teams
  // Mix time-like adjacent seeds before the first shuffle; a raw LCG's first
  // draw is correlated across neighboring milliseconds and biases seat roles.
  const s={version:SETUP_VERSION,theme:THEME_VERSION,mode:mode.id,stage:'identity',seed:mixSeed(seed),revision:0,roles:[],sides:null,dice:null,first:0,lord:0,offers:Array.from({length:n},()=>[]),picks:Array(n).fill(null),published:Array(n).fill(null),candidateCount:Math.min(3,Math.floor((PLAYABLE_HEROES.length-1)/(n-1)))}
  s.roles=arrangeRoles(mode,s)
  if(team){
    // sides[i]=0 友方 / 1 敌方；座位交替，故 i%2 即阵营。
    s.sides=s.roles.map((_,i)=>i%2)
    // 对抗局全员同时选将：开局就为每席发好独立候选，选完才掷骰定先手。
    const pool=shuffle(s,PLAYABLE_HEROES.map(h=>h.id))
    for(let i=0;i<n;i++)s.offers[i]=pool.splice(0,s.candidateCount)
    s.lord=0  // 选将完成后由骰点改写为真正的先手席位
  }else{
    s.lord=s.roles.indexOf('lord')
    const extras=shuffle(s,PLAYABLE_HEROES.filter(h=>!LORD_HEROES.includes(h.id)).map(h=>h.id)).slice(0,2)
    s.offers[s.lord]=shuffle(s,[...shuffle(s,LORD_HEROES).slice(0,3),...extras])
  }
  return s
}
export function setupView(s,seat=0){
  // 骰子只在选将完成（ready）后才掷出并公开；在此之前 dice/first 均为空。
  const rolled=s.sides&&Array.isArray(s.dice)
  return {stage:s.stage,revision:s.revision,seat,mode:s.mode||'identity5',role:s.roles[seat],lord:s.lord,teamMode:!!s.sides,sides:s.sides?s.sides.slice():null,dice:rolled?s.dice.slice():null,first:rolled?s.first:0,candidateCount:s.candidateCount,
    candidates:s.sides?(s.picks[seat]?[]:s.offers[seat].slice()):(s.stage==='lord'&&seat===s.lord||s.stage==='others'&&seat!==s.lord?s.offers[seat].slice():[]),
    picked:s.picks[seat],players:s.roles.map((role,index)=>({seat:index,role:s.sides?(s.sides[index]===0?'lord':'rebel'):(index===seat||role==='lord'?role:null),heroId:index===seat?s.picks[index]:s.published[index],ready:!!s.picks[index]})),
  }
}
export function dispatchSetup(state,action){
  try{
    if(action.revision!=null&&action.revision!==state.revision)throw Error('选将阶段已改变')
    const s=clone(state)
    const team=!!s.sides
    if(action.type==='reveal'&&s.stage==='identity'&&action.seat===0)s.stage='lord'
    else if(action.type==='pick'){
      const seat=action.seat
      if(!Number.isInteger(seat)||seat<0||seat>=s.roles.length||s.picks[seat])throw Error('该席位不能重新选将')
      // 对抗局全员同时选将；身份局仍按主公先选、其余后选的顺序。
      if(!team&&(s.stage==='lord'&&seat!==s.lord||s.stage==='others'&&seat===s.lord||!['lord','others'].includes(s.stage)))throw Error('请等待主公先选将')
      if(team&&!['lord','others'].includes(s.stage))throw Error('当前不能选将')
      if(!s.offers[seat].includes(action.heroId)||!HERO_BY_THEME_ID[action.heroId]?.playable)throw Error('只能选择发给自己的候选武将')
      if(s.picks.includes(action.heroId))throw Error('武将已经被选走')
      s.picks[seat]=action.heroId
      if(team){
        // 全员选完后掷骰：每席一枚骰面，点数最高者先手（并列取靠前席）。
        if(s.picks.every(Boolean)){
          s.published=s.picks.slice()
          s.dice=Array.from({length:s.roles.length},()=>1+Math.floor(random(s)*6))
          s.first=s.dice.indexOf(Math.max(...s.dice))
          s.lord=s.first
          s.stage='ready'
        }
      }else if(s.stage==='lord'){
        s.published[seat]=action.heroId
        const pool=shuffle(s,PLAYABLE_HEROES.filter(h=>h.id!==action.heroId).map(h=>h.id))
        for(let index=0;index<s.roles.length;index++)if(index!==s.lord)s.offers[index]=pool.splice(0,s.candidateCount)
        s.stage='others'
      }else if(s.picks.every(Boolean)){s.stage='ready';s.published=s.picks.slice()}
    }else if(action.type==='begin'&&s.stage==='ready'&&action.seat===0){
      return {ok:true,setup:s,game:createAssignedGame({roles:s.roles,heroIds:s.picks,seed:s.seed,label:modeById(s.mode).name,sides:s.sides||null,firstSeat:s.sides?s.first:null})}
    }else throw Error('当前阶段不允许这个操作')
    s.revision++;return {ok:true,setup:s}
  }catch(error){return {ok:false,error:error.message,setup:state}}
}
export function chooseSetupAI(view){
  if(!view.candidates.length||view.picked)return null
  const lord=view.players[view.lord].heroId&&HERO_BY_THEME_ID[view.players[view.lord].heroId]
  const score=id=>{const h=HERO_BY_THEME_ID[id],skills=Object.keys(h.skillNames);let n=h.hp*.3
    if(view.teamMode)return n+skills.length*.4  // 对抗局无身份加成，按体力和技能数择优
    if(view.role==='lord')n+=skills.some(s=>['jijiang','hujia','jiuyuan'].includes(s))?2:0
    if(view.role==='loyal'&&lord){if(h.mechanicalFaction===lord.mechanicalFaction)n+=2;if(skills.includes('rende'))n+=1}
    if(view.role==='rebel'&&skills.some(s=>['paoxiao','luoyi','longdan'].includes(s)))n+=.8
    if(view.role==='renegade'&&skills.some(s=>['zhiheng','jizhi','yingzi'].includes(s)))n+=1
    return n
  }
  const heroId=view.candidates.slice().sort((a,b)=>score(b)-score(a))[0]
  return {type:'pick',seat:view.seat,heroId,revision:view.revision}
}
export function restoreSetup(raw){
  try{
    const s=clone(raw),valid=id=>typeof id==='string'&&HERO_BY_THEME_ID[id]?.playable
    if(s.version!==SETUP_VERSION||s.theme!==THEME_VERSION||!['identity','lord','others','ready'].includes(s.stage)||!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295||!Number.isInteger(s.revision)||s.revision<0)return null
    // 旧存档没有 mode 字段，按五人身份局处理
    const mode=s.mode==null?MODES.identity5:MODES[s.mode];if(!mode)return null
    const n=mode.players,expected=mode.teams?mode.teams.flat():mode.roles,team=!!mode.teams
    if(!Array.isArray(s.roles)||s.roles.length!==n)return null
    if(!Number.isInteger(s.candidateCount)||s.candidateCount<1||s.candidateCount>3||s.candidateCount*(n-1)>PLAYABLE_HEROES.length-1)return null
    if(team){
      // 对抗局：sides 与座位交替一致（i%2）；骰子仅在选将完成后存在。
      if(!Array.isArray(s.sides)||s.sides.length!==n||s.sides.some((x,i)=>x!==i%2))return null
      if(s.roles.some((role,i)=>!mode.teams[s.sides[i]].includes(role)))return null
      for(const r of new Set(expected))if(s.roles.filter(x=>x===r).length!==expected.filter(x=>x===r).length)return null
      if(s.stage==='ready'){
        if(!Array.isArray(s.dice)||s.dice.length!==n||s.dice.some(d=>!Number.isInteger(d)||d<1||d>6))return null
        if(!Number.isInteger(s.first)||s.first<0||s.first>=n||s.dice[s.first]!==Math.max(...s.dice))return null
        if(s.lord!==s.first)return null
      }else{
        if(s.dice!=null||s.first!==0||s.lord!==0)return null
      }
    }else{
      if(s.lord!==s.roles.indexOf('lord'))return null
      for(const r of new Set(expected))if(s.roles.filter(x=>x===r).length!==expected.filter(x=>x===r).length)return null
    }
    if(![s.offers,s.picks,s.published].every(a=>Array.isArray(a)&&a.length===n)||s.offers.some(a=>!Array.isArray(a)||a.some(id=>!valid(id))||new Set(a).size!==a.length))return null
    if(s.picks.some((id,i)=>id!==null&&(!valid(id)||!s.offers[i].includes(id)))||new Set(s.picks.filter(Boolean)).size!==s.picks.filter(Boolean).length)return null
    if(team){
      // 对抗局：每席独立候选，全局互不重复；选完后全部公开。
      if(s.offers.some(a=>a.length!==s.candidateCount))return null
      if(new Set(s.offers.flat()).size!==s.offers.flat().length)return null
      if(s.stage==='ready'&&(!s.picks.every(Boolean)||s.published.some((id,i)=>id!==s.picks[i])))return null
      if(s.stage!=='ready'&&s.published.some(x=>x!==null))return null
      return s
    }
    const lordOffers=s.offers[s.lord]
    if(lordOffers.length!==5||lordOffers.filter(id=>LORD_HEROES.includes(id)).length!==3)return null
    if(['identity','lord'].includes(s.stage)){
      if(s.picks.some(Boolean)||s.published.some(x=>x!==null)||s.offers.some((a,i)=>i!==s.lord&&a.length))return null
    }else{
      if(!s.picks[s.lord]||s.published[s.lord]!==s.picks[s.lord])return null
      const otherOffers=s.offers.filter((_,i)=>i!==s.lord)
      if(otherOffers.some(a=>a.length!==s.candidateCount)||new Set(otherOffers.flat()).size!==otherOffers.flat().length||otherOffers.flat().includes(s.picks[s.lord]))return null
      if(s.stage==='others'&&(s.picks.every(Boolean)||s.published.some((id,i)=>i!==s.lord&&id!==null)))return null
      if(s.stage==='ready'&&(!s.picks.every(Boolean)||s.published.some((id,i)=>id!==s.picks[i])))return null
    }
    return s
  }catch{return null}
}
export function restoreSession(raw){
  if(raw?.kind==='setup'){const setup=restoreSetup(raw.setup);return setup?{kind:'setup',setup}:null}
  const game=restoreGame(raw?.kind==='game'?raw.game:raw)
  return game?{kind:'game',game}:null
}
