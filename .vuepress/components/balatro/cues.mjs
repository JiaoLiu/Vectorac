import { HANDS, JOKERS, TAROTS, SPECTRALS, SUITS, byId } from './catalog.mjs'
import { evaluate, debuffed, matchesSuit, has, consumableSlots, blueprintCanCopyAny, sellValue } from './engine.mjs'

const rank = n => ({11:'J',12:'Q',13:'K',14:'A'}[n] || n)
const face = (s,c) => c.enh!=='stone' && (c.rank>=11 && c.rank<=13 || has(s,'pareidolia'))
const cue = (label, detail, ready=false, tone='target') => ({label,detail,ready,tone})

// Read accumulated state only. Do not score a hypothetical hand (which can mutate RNG/state).
export function jokerProgress(s,card) {
  if(!s||!card||card.kind!=='joker')return []
  const fmt=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(value)
  const lines=[]
  if(['green','bus','trousers','popcorn','redcard','flash','ceremonial'].includes(card.id))lines.push(`当前 +${fmt(card.value)} 倍率`)
  if(['runner','square','ice','wee','castle'].includes(card.id))lines.push(`当前 +${fmt(card.value)} 筹码`)
  if(['constellation','hologram','ramen','banana','vampire','glass','luckycat','madness','obelisk','campfire','hitroad','canio','yorick'].includes(card.id))lines.push(`当前 ×${fmt(card.value)} 倍率`)
  if(card.id==='yorick')lines.push(`下次成长：已弃 ${card.counter}/23 张`)
  if(card.id==='loyalty')lines.push(`距离下次 ×4：${6-card.counter%6} 次出牌`)
  if(card.id==='seltzer')lines.push(`剩余 ${card.value} 次出牌`)
  if(card.id==='turtle')lines.push(`当前手牌上限 +${card.value}`)
  if(card.id==='invisible')lines.push(`已完成 ${card.value}/2 轮${card.value>=2?'，出售可触发复制':''}`)
  if(card.id==='rocket')lines.push(`当前盲注奖励 +$${fmt(card.value)}（击败 Boss 时再成长）`)
  if(card.id==='egg')lines.push(`当前售价 $${fmt(sellValue(card))}`)
  const dynamic={steel:()=>`当前 ×${fmt(1+.2*s.deck.filter(c=>c.enh==='steel').length)} 倍率`,throwback:()=>`当前 ×${fmt(1+.25*s.skips)} 倍率`,fortune:()=>`当前 +${s.tarotUsed} 倍率`,abstract:()=>`当前 +${s.jokers.length*3} 倍率`,bull:()=>`当前 +${Math.max(0,s.money)*2} 筹码`,boot:()=>`当前 +${Math.max(0,Math.floor(s.money/5))*2} 倍率`,stone:()=>`当前 +${s.deck.filter(c=>c.enh==='stone').length*25} 筹码`,erosion:()=>`当前 +${Math.max(0,s.initialDeckSize-s.deck.length)*4} 倍率`,swash:()=>`当前 +${s.jokers.filter(j=>j.uid!==card.uid).reduce((n,j)=>n+sellValue(j),0)} 倍率`}
  if(dynamic[card.id])lines.push(dynamic[card.id]())
  if((card.disabled||card.perished)&&lines.length)lines.unshift('目前已失效，以下为保留数值，不参与计分')
  return lines
}

// Presentation only: never simulate play(), advance RNG or mutate run state to predict a proc.
export function cardCue(s,card,visited=[]) {
  if (!s || !card) return null
  if (card.kind==='joker' && s.phase==='play' && s.blind===2 && s.boss==='acorn' && !s.disabledBoss && !has(s,'chicot')) return null
  if (card.disabled || card.perished) return cue('已失效','这张小丑目前不提供效果',false,'muted')
  let active=s.phase==='play'
  const selected=s.hand.filter(c=>s.selected.includes(c.uid))
  // Never reveal the identity of face-down cards through an actionable highlight.
  const known=selected.length>0 && selected.every(c=>!c.hidden)
  const hand=known?evaluate(selected,s):null
  const scoring=hand?hand.scoring.filter(c=>!debuffed(s,c)):[]
  if (card.kind==='planet') {
    const h=byId(HANDS,card.id)
    return cue(`${h.name} ↑1`,`${h.name} Lv.${s.levels[h.id]} → ${s.levels[h.id]+1}；双击或双点直接使用`,false,'planet')
  }
  if (card.kind==='tarot' || card.kind==='spectral') {
    const def=byId(card.kind==='tarot'?TAROTS:SPECTRALS,card.id)
    if(def.max) {
      const valid=(active||s.pack)&&selected.length>=1&&selected.length<=def.max&&(card.id!=='death'||selected.length===2)
      return cue(valid?'目标已选':card.id==='death'?'选 2 张':`选 1～${def.max} 张`,valid?`${def.name}：已选择 ${selected.length} 张目标牌，点击使用`:`${def.name}：先选择${card.id==='death'?'恰好 2':` 1～${def.max}`}张手牌`,!!valid,'skill')
    }
    if(card.id==='fool')return cue(s.lastUsed?'可复制':'尚无目标',s.lastUsed?'复制上一次使用的塔罗或星球牌':'还未使用过塔罗或星球牌',false,'skill')
    return null
  }
  if(card.kind!=='joker')return null
  if(active&&hand&&s.blind===2&&!s.disabledBoss&&!has(s,'chicot')&&!['mail','castle','trading','burnt'].includes(card.id)) {
    if(s.boss==='psychic'&&selected.length!==5 || s.boss==='eye'&&s.roundPlayed[hand.id] || s.boss==='mouth'&&Object.keys(s.roundPlayed).length&&!s.roundPlayed[hand.id])active=false
  }
  if(['blueprint','brainstorm'].includes(card.id)) {
    if(visited.includes(card.uid))return cue('复制循环','没有可复制的有效效果',false,'muted')
    const index=s.jokers.findIndex(j=>j.uid===card.uid),source=s.jokers[card.id==='blueprint'?index+1:0]
    if(!source)return cue(card.id==='blueprint'?'右侧空位':'最左侧空位',card.id==='blueprint'?'右侧放一张小丑才能复制能力':'最左侧放一张小丑才能复制能力',false,'muted')
    if(!['blueprint','brainstorm'].includes(source.id)&&!blueprintCanCopyAny(source.id))return cue('无法复制',`${byId(JOKERS,source.id).name} 的能力不兼容蓝图`,false,'muted')
    const inherited=cardCue(s,source,visited.concat(card.uid))
    return inherited?{...inherited,detail:`复制 ${byId(JOKERS,source.id).name}：${inherited.detail}`}:cue('复制中',`复制 ${byId(JOKERS,source.id).name} 的能力`,false,'copy')
  }
  if(card.id==='toDo') {
    const name=byId(HANDS,card.hand).name,ready=active&&hand&&hand.id===card.hand
    return cue(`${name} +$4`,`本轮打出${name}获得 $4${ready?'；当前选牌已满足':''}`,!!ready)
  }
  if(['ancient','castle','idol','mail'].includes(card.id)) {
    const discard=card.id==='castle'||card.id==='mail'
    const eligible=discard?selected.filter(c=>!c.hidden):scoring
    const matched=eligible.filter(c=>card.id==='mail'?c.rank===card.rank:matchesSuit(s,c,card.suit)&&(card.id!=='idol'||c.rank===card.rank)).length
    const target=card.id==='mail'?rank(card.rank):`${SUITS[card.suit]}${card.id==='idol'?rank(card.rank):''}`
    const effect={ancient:'×1.5',castle:'+3 筹码',idol:'×2',mail:'+$5'}[card.id]
    return cue(`${target} ${effect}`,`${discard?'弃掉':'计分'} ${target}：每张 ${effect}${matched?`，当前 ${matched} 张符合`:''}`,active&&known&&matched>0&&(!discard||s.discards>0))
  }
  if(['loyalty','yorick','invisible','seltzer','turtle','ice','popcorn'].includes(card.id)) {
    const label={loyalty:`${card.counter%6+1}/6 · ×4`,yorick:`${card.counter}/23`,invisible:`${Math.min(2,card.value)}/2 轮`,seltzer:`剩 ${card.value} 手`,turtle:`手牌 +${card.value}`,ice:`+${card.value} 筹码`,popcorn:`+${card.value} 倍率`}[card.id]
    return cue(label,byId(JOKERS,card.id).desc,card.id==='loyalty'?active&&card.counter%6===5:card.id==='invisible'&&card.value>=2,'counter')
  }
  if(card.id==='hanging')return cue('首张计分牌 +2 次',byId(JOKERS,card.id).desc,active&&!!hand&&hand.scoring.length>0&&!debuffed(s,hand.scoring[0]))
  if(['DNA','sixth','trading','burnt'].includes(card.id)) {
    const discard=card.id==='trading'||card.id==='burnt',first=discard?s.discarded===0:s.plays===0
    const valid=card.id==='burnt'?known:known&&selected.length===1&&(card.id!=='sixth'||selected[0].rank===6)
    const label={DNA:'首手单牌',sixth:'首手单张 6',trading:'首次弃单牌',burnt:'首次弃牌 ↑'}[card.id]
    return cue(first?label:'下轮恢复',byId(JOKERS,card.id).desc,active&&first&&!!valid&&(!discard||s.discards>0),first?'target':'muted')
  }
  if(['acrobat','dusk'].includes(card.id))return cue(s.hands===1?'最后一手':`余 ${s.hands} 手`,byId(JOKERS,card.id).desc,active&&s.hands===1&&known)
  if(card.id==='half')return cue('≤3 张 +20',byId(JOKERS,card.id).desc,active&&selected.length>0&&selected.length<=3)
  if(card.id==='vagabond')return cue('≤$4 造塔罗',byId(JOKERS,card.id).desc,active&&s.money<=4&&s.consumables.length<consumableSlots(s)&&known)
  if(card.id==='summit')return cue('余3弃 +15',byId(JOKERS,card.id).desc,active&&s.discards===3&&known)
  if(card.id==='blackboard') {
    const held=s.hand.filter(c=>!selected.includes(c))
    return cue('留手全黑 ×3',byId(JOKERS,card.id).desc,active&&known&&held.length>0&&held.every(c=>!c.hidden&&(matchesSuit(s,c,0)||matchesSuit(s,c,2))))
  }
  if(card.id==='cardsharp')return cue('重复牌型 ×3',byId(JOKERS,card.id).desc,active&&hand&&!!s.roundPlayed[hand.id])
  const patterns={jolly:['pair','对子 +8'],zany:['three','三条 +12'],mad:['two','两对 +10'],crazy:['straight','顺子 +12'],droll:['flush','同花 +10'],duo:['pair','对子 ×2'],trio:['three','三条 ×3'],family:['four','四条 ×4'],order:['straight','顺子 ×3'],tribe:['flush','同花 ×2']}
  if(patterns[card.id]){const [pattern,label]=patterns[card.id];return cue(label,byId(JOKERS,card.id).desc,active&&hand&&hand.contains[pattern])}
  return null
}
