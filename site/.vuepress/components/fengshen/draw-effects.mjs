// Actual effect completion, not the original card click, drives presentation.
// Public logs hold counts only; local hand IDs never enter other players' cues.
export function drawEffects(before,after,viewer=0){
  const old=new Set(before.players[viewer].hand.map(c=>c.id)),incoming=after.players[viewer].hand.filter(c=>!old.has(c.id)).map(c=>c.id)
  const cues=after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='draw'&&['card-draw','skill-draw'].includes(l.cue.reason))
  // 同一窗口可能有多条摸牌（如仙机额外摸 1 张 + 锦囊摸 2 张），按时间顺序依次消费本地新牌，
  // 避免用 slice(-count) 让先发生的提示错认到后摸的牌。
  let cursor=0
  const mapped=cues.map(l=>{const own=l.cue.target===viewer;const ids=own?incoming.slice(cursor,cursor+l.cue.count):[];if(own)cursor+=l.cue.count;return {...l.cue,id:l.id,ownIds:ids}})
  return mapped.reverse()
}
// The face was already revealed to everyone; never read the recipient's hand.
export function judgmentEffects(before,after){return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='judgment-keep').slice().reverse().map(l=>({...l.cue,id:l.id}))}
export function harvestEffects(before,after){return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='harvest-pick').slice().reverse().map(l=>({...l.cue,id:l.id,target:l.cue.source}))}
export function transferEffects(before,after){return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='card-transfer'&&l.cue.count>0).slice().reverse().map(l=>({...l.cue,id:l.id}))}
// 传道（遗计）分牌：赠牌事件带 cards（仅 id，牌面私有），客户端据此从中央弹窗向接收者飞牌。
export function yijiEffects(before,after,viewer=0){return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='yiji-give').slice().reverse().map(l=>({...l.cue,id:l.id,count:l.cue.cards?.length||l.cue.count||0,cards:l.cue.seat===viewer||l.cue.target===viewer?l.cue.cards:[]}))}
// 公开救援来源元数据；客户端飞牌复用 publicPlayMotions，不再另飞一张到被救者。
export function rescueEffects(before,after){return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='rescue-heal').slice().reverse().map(l=>({...l.cue,id:l.id}))}
// 公开弃置：其他玩家弃置的牌（弃牌阶段/制衡/技能代价），客户端据此在牌桌上短暂展示后再收起。
export function discardEffects(before,after){return after.logs.filter(l=>l.id>before.eventId&&l.cue?.kind==='discard-cue').slice().reverse().map(l=>({...l.cue,id:l.id}))}
