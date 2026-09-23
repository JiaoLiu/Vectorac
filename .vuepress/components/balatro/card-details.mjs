import { ENHANCEMENTS, EDITIONS, SEALS, SUIT_NAMES } from './catalog.mjs'

const rankName = rank => ({11:'J',12:'Q',13:'K',14:'A'}[rank] || String(rank))

// catalog 里的短标签自带数值或一整句效果（如「蓝色蜡封：击败盲注时…」），
// 这里单独维护名称与完整作用，避免同一句效果在详情里被写两遍。
const enhancementName = {bonus:'奖励牌',mult:'倍率牌',wild:'万能牌',glass:'玻璃牌',steel:'钢铁牌',stone:'石头牌',gold:'黄金牌',lucky:'幸运牌'}
const editionName = {foil:'闪箔',holo:'镭射',poly:'多彩',negative:'负片'}
const sealName = {red:'红色蜡封',blue:'蓝色蜡封',gold:'金色蜡封',purple:'紫色蜡封'}

const enhancementEffect = {
  bonus: '本牌参与计分时，额外获得 30 筹码。',
  mult: '本牌参与计分时，倍率 +4。',
  wild: '组成牌型时可视为任意花色；不会改变牌面点数。',
  glass: '本牌参与计分时，最终倍率 ×2；每次打出后有 1/4 概率被摧毁。',
  steel: '本牌留在手牌中时，于本手计分的留手效果阶段提供 ×1.5 倍率。',
  stone: '本牌计分时额外获得 50 筹码；不参与点数牌型或人头牌判定。',
  gold: '本牌留在手牌中并击败盲注时，获得 $3；打出它不会获得这笔钱。',
  lucky: '本牌参与计分时，分别判定：1/5 概率倍率 +20，1/15 概率获得 $20。'
}

const editionEffect = {
  foil: '本牌参与计分时，筹码 +50。',
  holo: '本牌参与计分时，倍率 +10。',
  poly: '本牌参与计分时，最终倍率 ×1.5。',
  negative: '持续效果：小丑牌槽位 +1。'
}

const sealEffect = {
  red: '本牌计分、触发留手效果或结算封蜡效果时，额外触发一次。',
  blue: '击败盲注时若本牌仍在手牌中，生成一张对应上一手牌型的星球牌。',
  gold: '本牌参与计分时，每次触发获得 $3。',
  purple: '弃掉本牌时，生成一张塔罗牌。'
}

const trim = text => String(text).replace(/[。；;]\s*$/, '')
const enhancementLabel = enh => `${enhancementName[enh] || ENHANCEMENTS[enh] || enh}：${trim(enhancementEffect[enh] || '')}`
const editionLabel = edition => `${editionName[edition] || EDITIONS[edition] || edition}：${trim(editionEffect[edition] || '')}`
const sealLabel = seal => `${sealName[seal] || SEALS[seal] || seal}：${trim(sealEffect[seal] || '')}`

// 补充包与商店里展示的一行说明：特殊牌会把作用写全，普通牌只写「标准扑克牌」。
export function playingCardSummary(card) {
  if (!card || card.hidden) return '背面朝上'
  const parts = [card.enh ? enhancementLabel(card.enh) : '标准扑克牌']
  if (card.edition) parts.push(editionLabel(card.edition))
  if (card.seal) parts.push(sealLabel(card.seal))
  return parts.join(' · ')
}

export function playingCardDetails(card) {
  if (!card || card.hidden) return []
  const details = [{label:'牌面', value:`${SUIT_NAMES[card.suit] || '黑桃'} ${rankName(card.rank)}`}]
  if (card.enh) details.push({label:'增强', value:`${enhancementLabel(card.enh)}。`})
  if (card.edition) details.push({label:'版本', value:`${editionLabel(card.edition)}。`})
  if (card.seal) details.push({label:'封蜡', value:`${sealLabel(card.seal)}。`})
  return details
}
