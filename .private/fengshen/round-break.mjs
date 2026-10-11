// Room lifecycle stays authoritative; showing the ended table is only a view.
export function roundBreakActive({game,setup,preview=false,room}){
  return !preview&&!!game&&!setup&&(!!game.winner||!!room?.hasPlayed&&['WAITING','FINISHED'].includes(room.status))
}
export function showRoom({game,setup,preview=false,roomView=false,room}){
  return !!preview||!!roomView||(!game&&!setup)||(!setup&&room?.status!=='PLAYING'&&!roundBreakActive({game,setup,preview,room}))
}
export const endedTableKey=c=>c?.roomId&&c?.playerId?'vectorac.fengshen.ended-table:'+c.roomId+':'+c.playerId:null
export function readEndedTable(storage,credential,room){
  if(!room?.hasPlayed||!['WAITING','FINISHED'].includes(room.status))return null
  try{
    const key=endedTableKey(credential),v=key&&JSON.parse(storage.getItem(key)||'null')
    if(!v||v.schema!==1||v.round!==room.round||typeof v.gameId!=='string'||!Number.isInteger(v.version)||v.meta?.mySeat!==credential.seatIndex||!v.game?.winner||!Array.isArray(v.game.players)||v.game.players.length<2||v.game.players.length>8)return null
    return v
  }catch{return null}
}
