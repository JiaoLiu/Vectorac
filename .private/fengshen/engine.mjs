import * as baseline from './core/catalog.mjs'
import { createEngine } from './core/engine.mjs'
import {createAI} from './core/ai.mjs'
import { ALLIANCES, PLAYABLE_HEROES, CARDS_BY_TYPE, skillName,makeExpandedDeck } from './theme.mjs'
export const THEME_VERSION='fengshen-internal-v1'
// Mechanical factions are an explicit alliance adapter, never the old hero's
// hard-coded nationality. Public base IDs stay intact for the existing local AI.
const heroes=PLAYABLE_HEROES.map(h=>({...baseline.HERO_BY_ID[h.baseHero],id:h.engineId,name:h.name,hp:h.hp,sex:h.sex,skills:Object.keys(h.skillNames),faction:ALLIANCES[h.faction]}))
export const catalog={...baseline,theme:THEME_VERSION,HEROES:heroes,HERO_BY_ID:Object.fromEntries(heroes.map(h=>[h.id,h])),CARDS:CARDS_BY_TYPE,
  makeDeck:makeExpandedDeck,deckVersion:2,legacyMakeDeck:baseline.makeDeck,
  individualHandChoices:true,trackBattle:true,animatedJudgments:true,automaticSkills:['jizhi','yingzi','jianxiong','tieji'],
  skillNames:Object.assign({},...PLAYABLE_HEROES.map(h=>h.skillNames)),
  skillName,
}
const engine=createEngine(catalog)
export const chooseAI=createAI(catalog)
export const {dispatch,playerView,allCards,legalActions,distance,attackRange,hasSkill,hero}=engine
export function createGame({heroId='jifa',...options}={}) {
  const chosen=PLAYABLE_HEROES.find(h=>h.id===heroId)
  if(!chosen)throw new Error('该角色尚未接入完整技能，不能进入对局')
  return {...engine.createGame({...options,heroId:chosen.engineId}),theme:THEME_VERSION}
}
export function createAssignedGame({roles,heroIds,seed}){
  const ids=heroIds.map(id=>PLAYABLE_HEROES.find(h=>h.id===id)?.engineId)
  if(ids.some(id=>!id))throw new Error('所选武将的技能尚未接入')
  return {...engine.createAssignedGame({roles,heroIds:ids,seed}),theme:THEME_VERSION}
}
export function restoreGame(raw){
  if(!raw||raw.theme!==THEME_VERSION)return null
  let state=engine.restoreGame(raw)
  // Upgrade an old optional-positive-skill response without losing the match.
  while(state?.pending?.kind==='choice'&&catalog.automaticSkills.includes(state.pending.skill)){
    const p=state.pending,r=engine.dispatch(state,{type:'choose',value:'yes',seat:p.actor,promptId:p.id,revision:state.revision})
    if(!r.ok)return null;state=r.state
  }
  return state
}
