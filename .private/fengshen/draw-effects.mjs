// Actual effect completion, not the original card click, drives presentation.
// Public logs hold counts only; local hand IDs never enter other players' cues.
export function drawEffects(before,after,viewer=0){
  const old=new Set(before.players[viewer].hand.map(c=>c.id)),incoming=after.players[viewer].hand.filter(c=>!old.has(c.id)).map(c=>c.id)
  return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='draw'&&l.cue.reason==='card-draw').slice().reverse().map(l=>({...l.cue,id:l.id,ownIds:l.cue.target===viewer?incoming.slice(-l.cue.count):[]}))
}
