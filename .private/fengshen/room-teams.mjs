import {modeById} from './setup.mjs'
import {esc} from './presentation.mjs'

// Absolute seats are fixed teams; never use the rotating in-game local view.
export function roomTeam(modeId,seat,mySeat){
  const mode=modeById(modeId)
  if(!mode.teams||!Number.isInteger(seat)||seat<0||seat>=mode.players)return null
  const side=seat%2,ownValid=Number.isInteger(mySeat)&&mySeat>=0&&mySeat<mode.players
  return {side,name:side===0?'青龙队':'朱雀队',seats:Array.from({length:mode.players},(_,i)=>i).filter(i=>i%2===side).map(i=>i+1),relation:!ownValid?'':seat===mySeat?'你':mySeat%2===side?'与你同队':'对方队伍'}
}
export function roomTeamBadge(mode,seat,mySeat){
  const t=roomTeam(mode,seat,mySeat)
  return t?`<span class="fs-room-team fs-room-team-${t.side}" data-team-side="${t.side}">${t.name}${t.relation?' · '+t.relation:''}</span>`:''
}
export function roomTeamsGuide(mode,mySeat){
  const a=roomTeam(mode,0,mySeat),b=roomTeam(mode,1,mySeat)
  if(!a||!b)return ''
  return `<div class="fs-room-teams" aria-label="入座队伍"><span class="fs-room-team fs-room-team-0">${a.name} · ${a.seats.join('、')} 号</span><span class="fs-room-team fs-room-team-1">${b.name} · ${b.seats.join('、')} 号</span><small>${Number.isInteger(mySeat)?`你在${esc(roomTeam(mode,mySeat,mySeat)?.name||'')}，换座会改变队伍。`:'按座位组队，入座前可先选队友位置。'}</small></div>`
}
