import { ENHANCEMENTS, EDITIONS, SEALS, SUIT_NAMES } from './catalog.mjs'

const rankName = rank => ({11:'J',12:'Q',13:'K',14:'A'}[rank] || String(rank))

const enhancementTiming = {
  bonus: '本牌参与计分时，额外获得 30 筹码。',
  mult: '本牌参与计分时，倍率 +4。',
  wild: '组成牌型时可视为任意花色；不会改变牌面点数。',
  glass: '本牌参与计分时，最终倍率 ×2；每次打出后有 1/4 概率被摧毁。',
  steel: '本牌留在手牌中时，于本手计分的留手效果阶段提供 ×1.5 倍率。',
  stone: '本牌计分时额外获得 50 筹码；不参与点数牌型或人头牌判定。',
  gold: '本牌留在手牌中并击败盲注时，获得 $3；打出它不会获得这笔钱。',
  lucky: '本牌参与计分时，分别判定：1/5 概率倍率 +20，1/15 概率获得 $20。'
}

const editionTiming = {
  foil: '本牌参与计分时，筹码 +50。',
  holo: '本牌参与计分时，倍率 +10。',
  poly: '本牌参与计分时，最终倍率 ×1.5。',
  negative: '持续效果：小丑牌槽位 +1。'
}

const sealTiming = {
  red: '触发时机：本牌计分、触发留手效果或结算封蜡效果时，额外触发一次。',
  blue: '触发时机：击败盲注时若本牌仍在手牌中，生成一张对应上一手牌型的星球牌。',
  gold: '触发时机：本牌参与计分时，每次触发获得 $3。',
  purple: '触发时机：弃掉本牌时，生成一张塔罗牌。'
}

export function playingCardDetails(card) {
  if (!card || card.hidden) return []
  const details = [{label:'牌面', value:`${SUIT_NAMES[card.suit] || '黑桃'} ${rankName(card.rank)}`}]
  if (card.enh) details.push({label:'增强', value:`${ENHANCEMENTS[card.enh] || card.enh}。${enhancementTiming[card.enh] || ''}`})
  if (card.edition) details.push({label:'版本', value:`${EDITIONS[card.edition] || card.edition}。${editionTiming[card.edition] || ''}`})
  if (card.seal) details.push({label:'封蜡', value:`${SEALS[card.seal] || card.seal}。${sealTiming[card.seal] || ''}`})
  return details
}
