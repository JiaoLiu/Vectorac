import {PLAYABLE_HEROES,HERO_BY_THEME_ID,ALLIANCES} from './theme.mjs'
import {createAssignedGame,restoreGame,THEME_VERSION} from './engine.mjs'
export const SETUP_VERSION=1
export const LORD_HEROES=['jifa','dixin','yunzhongzi']
const roleCounts={lord:1,loyal:1,rebel:2,renegade:1}
const clone=s=>JSON.parse(JSON.stringify(s))
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296}
function shuffle(s,a){const out=a.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function mixSeed(value){let x=(value^0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return (x^(x>>>16))>>>0}
export function createSetup({seed=Date.now()>>>0}={}){
  // Mix time-like adjacent seeds before the first shuffle; a raw LCG's first
  // draw is correlated across neighboring milliseconds and biases seat roles.
  const s={version:SETUP_VERSION,theme:THEME_VERSION,stage:'identity',seed:mixSeed(seed),revision:0,roles:[],lord:0,offers:Array.from({length:5},()=>[]),picks:Array(5).fill(null),published:Array(5).fill(null),candidateCount:Math.min(3,Math.floor((PLAYABLE_HEROES.length-1)/4))}
  s.roles=shuffle(s,['lord','loyal','rebel','rebel','renegade']);s.lord=s.roles.indexOf('lord')
  const extras=shuffle(s,PLAYABLE_HEROES.filter(h=>!LORD_HEROES.includes(h.id)).map(h=>h.id)).slice(0,2)
  s.offers[s.lord]=shuffle(s,[...LORD_HEROES,...extras]);return s
}
export function setupView(s,seat=0){
  return {stage:s.stage,revision:s.revision,seat,role:s.roles[seat],lord:s.lord,candidateCount:s.candidateCount,
    candidates:s.stage==='lord'&&seat===s.lord||s.stage==='others'&&seat!==s.lord?s.offers[seat].slice():[],
    picked:s.picks[seat],players:s.roles.map((role,index)=>({seat:index,role:index===seat||role==='lord'?role:null,heroId:index===seat?s.picks[index]:s.published[index],ready:!!s.picks[index]})),
  }
}
export function dispatchSetup(state,action){
  try{
    if(action.revision!=null&&action.revision!==state.revision)throw Error('选将阶段已改变')
    const s=clone(state)
    if(action.type==='reveal'&&s.stage==='identity'&&action.seat===0)s.stage='lord'
    else if(action.type==='pick'){
      const seat=action.seat
      if(!Number.isInteger(seat)||seat<0||seat>4||s.picks[seat])throw Error('该席位不能重新选将')
      if(s.stage==='lord'&&seat!==s.lord||s.stage==='others'&&seat===s.lord||!['lord','others'].includes(s.stage))throw Error('请等待主公先选将')
      if(!s.offers[seat].includes(action.heroId)||!HERO_BY_THEME_ID[action.heroId]?.playable)throw Error('只能选择发给自己的候选武将')
      if(s.picks.includes(action.heroId))throw Error('武将已经被选走')
      s.picks[seat]=action.heroId
      if(s.stage==='lord'){
        s.published[seat]=action.heroId
        const pool=shuffle(s,PLAYABLE_HEROES.filter(h=>h.id!==action.heroId).map(h=>h.id))
        for(let index=0;index<5;index++)if(index!==s.lord)s.offers[index]=pool.splice(0,s.candidateCount)
        s.stage='others'
      }else if(s.picks.every(Boolean)){s.stage='ready';s.published=s.picks.slice()}
    }else if(action.type==='begin'&&s.stage==='ready'&&action.seat===0){
      return {ok:true,setup:s,game:createAssignedGame({roles:s.roles,heroIds:s.picks,seed:s.seed})}
    }else throw Error('当前阶段不允许这个操作')
    s.revision++;return {ok:true,setup:s}
  }catch(error){return {ok:false,error:error.message,setup:state}}
}
export function chooseSetupAI(view){
  if(!view.candidates.length||view.picked)return null
  const lord=view.players[view.lord].heroId&&HERO_BY_THEME_ID[view.players[view.lord].heroId]
  const score=id=>{const h=HERO_BY_THEME_ID[id],skills=Object.keys(h.skillNames);let n=h.hp*.3
    if(view.role==='lord')n+=skills.some(s=>['jijiang','hujia','jiuyuan'].includes(s))?2:0
    if(view.role==='loyal'&&lord){if(ALLIANCES[h.faction]===ALLIANCES[lord.faction])n+=2;if(skills.includes('rende'))n+=1}
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
    if(!Array.isArray(s.roles)||s.roles.length!==5||Object.entries(roleCounts).some(([r,n])=>s.roles.filter(x=>x===r).length!==n)||s.lord!==s.roles.indexOf('lord'))return null
    if(!Number.isInteger(s.candidateCount)||s.candidateCount<1||s.candidateCount>3||s.candidateCount*4>PLAYABLE_HEROES.length-1)return null
    if(![s.offers,s.picks,s.published].every(a=>Array.isArray(a)&&a.length===5)||s.offers.some(a=>!Array.isArray(a)||a.some(id=>!valid(id))||new Set(a).size!==a.length))return null
    if(s.picks.some((id,i)=>id!==null&&(!valid(id)||!s.offers[i].includes(id)))||new Set(s.picks.filter(Boolean)).size!==s.picks.filter(Boolean).length)return null
    const lordOffers=s.offers[s.lord];if(lordOffers.length!==5||LORD_HEROES.some(id=>!lordOffers.includes(id)))return null
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
