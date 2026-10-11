// Presentation-only selection. Never execute a stale option in a later prompt.
export function panelAction(view,selection){
 const p=view.pending,a=view.legal[selection?.index]
 return p?.actor===view.seat&&['incarnation','pick'].includes(p.kind)&&selection?.promptId===p.id&&selection.revision===view.revision&&a&&JSON.stringify(a)===selection.signature?a:null
}
export function panelSelection({view,selection,index,promptId,revision}){
 const p=view.pending,a=view.legal[index]
 if(p?.actor!==view.seat||!['incarnation','pick'].includes(p?.kind)||String(p.id)!==String(promptId)||String(view.revision)!==String(revision)||!Number.isInteger(index)||!['transform','choose'].includes(a?.type))return {kind:'ignore'}
 const next={promptId:p.id,revision:view.revision,index,signature:JSON.stringify(a)}
 return panelAction(view,selection)&&selection.index===index?{kind:'commit',action:a}:{kind:'select',selection:next}
}
export function harvestSeat(view){const p=view.pending;return p?.kind==='pick'?p.actor:p?.kind==='counter'&&p.cardType==='harvest'?p.target:null}
export function cleanRoleMarks(view,marks={}){marks=marks&&typeof marks==='object'?marks:{};return Object.fromEntries(view.teamMode?[]:view.players.filter(p=>p.seat!==view.seat&&!p.role&&p.alive&&['loyal','rebel','renegade'].includes(marks[p.seat])).map(p=>[p.seat,marks[p.seat]]))}
export function nextRoleMark(view,marks,seat){const clean=cleanRoleMarks(view,marks),p=view.players[seat];if(view.teamMode||!p||p.role||!p.alive||seat===view.seat)return clean;const roles=[null,'loyal','rebel','renegade'],next=roles[(roles.indexOf(clean[seat]||null)+1)%roles.length];if(next)clean[seat]=next;else delete clean[seat];return clean}
export function choicePanelGeometry({height,safeTop=0,safeBottom=0}){const top=28+safeTop,bottom=8+safeBottom;return {top,height:Math.min(360,Math.max(0,height-top-bottom))}}
