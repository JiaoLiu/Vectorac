import {CARDS_BY_TYPE,displayText} from './theme.mjs'
import {esc} from './presentation.mjs'

// Read-only aid: no modal, no extra confirmation and no changes to legal actions.
export function selectedCardHint(ui,view){
  if(ui.hints===false||ui.skill||ui.paused||ui.auto||view.winner||ui.transfer||ui.draws?.length||ui.moves?.length)return ''
  const canSelect=view.pending
    ? view.pending.actor===0&&['response','counter','discard','axe','judge-replace'].includes(view.pending.kind)
    : view.current===0&&view.phase==='play'
  if(!canSelect)return ''
  const own=view.players[0],c=own.hand.find(c=>c.id===ui.selected[0])||Object.values(own.equip).find(c=>c?.id===ui.selected[0])
  if(!c)return ''
  const as=view.pending&&['response','counter','rescue','support','blade'].includes(view.pending.kind)?ui.as||view.pending.as:ui.currentAs(view),d=CARDS_BY_TYPE[as]||CARDS_BY_TYPE[c.type],category={basic:'基本牌',trick:'法术',delay:'阵法',equip:'法宝'}[d.category]
  const label=category+(d.range?' · 攻击距离 '+d.range:'')+(as&&as!==c.type?' · '+CARDS_BY_TYPE[c.type].name+'转化':'')
  return `<aside class="fs-selected-tip" role="status" aria-live="polite" data-tip-type="${d.type}"><b>${esc(d.name)}：<span>${esc(label)}</span></b><p>${esc(displayText(d.help))}</p></aside>`
}
