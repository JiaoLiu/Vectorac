import { createLocalGame } from '../.vuepress/components/mahjong/adapter.js'
import { SUITS } from '../.vuepress/components/mahjong/contract.js'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const fail = message => { throw new Error(message) }

const events = []
const game = createLocalGame({
  seed: 20260916,
  aiLevel: 'easy',
  onEvent: event => events.push(event)
})

let view = game.view()
if (view.phase !== 'swap' || !view.legal.some(a => a.type === 'swap')) fail('初始阶段不是换三张')

const bySuit = {}
for (const tile of view.my.hand) {
  const suit = ['wan', 'tong', 'tiao'][Math.floor(tile / 9)]
  ;(bySuit[suit] ||= []).push(tile)
}
const swapTiles = Object.values(bySuit).find(tiles => tiles.length >= 3)?.slice(0, 3)
if (!swapTiles) fail('测试手牌没有可换的同花色三张')
if (!game.dispatch({ seat: 0, type: 'swap', tiles: swapTiles }).ok) fail('人类换三张动作失败')

await wait(1800)
view = game.view()
if (!['swap', 'void'].includes(view.phase)) fail('AI 换三张后阶段异常: ' + view.phase)

if (view.phase === 'void') {
  if (!game.dispatch({ seat: 0, type: 'void', suit: SUITS[0] }).ok) fail('人类定缺动作失败')
}

await wait(2200)
view = game.view()
if (!['void', 'discard', 'respond', 'finished'].includes(view.phase)) fail('AI 推进后阶段异常: ' + view.phase)
if (!events.some(e => e.type === 'game-start' || e.type === 'swap-apply')) fail('没有收到引擎事件')

const saved = game.exportState()
const restored = createLocalGame({ restoreState: saved, aiLevel: 'easy' })
if (JSON.stringify(restored.exportState()) !== JSON.stringify(saved)) fail('存档恢复状态不一致')
restored.dispose()

// 会话：首局掷骰定庄，后续局掷骰定摸排起点
const first = game.session()
if (first.round !== 1 || first.mode !== 'dealer') fail('首局会话语义异常: ' + JSON.stringify(first))
if (first.dealer !== game.view().dealer) fail('首局骰子定庄与引擎庄家不一致')
// restart 缺省沿用本局庄家
game.restart({})
const second = game.session()
if (second.round !== 2 || second.mode !== 'draw') fail('第二局会话语义异常: ' + JSON.stringify(second))
if (second.dealer !== first.dealer) fail('restart 缺省应沿用本局庄家')
// 第二局：骰子点数定摸牌起点方位（墙头），牌墙按「起点方位×14+点数和」开牌旋转
if (second.startSeat !== (second.dice[0] + second.dice[1] - 2) % 4) fail('摸牌起点与骰子点数不一致')
if (second.headSeat !== second.startSeat) fail('headSeat 与摸牌起点不一致')
const diceSum2 = second.dice[0] + second.dice[1]
if (second.wallOffset !== (second.headSeat * 14 + diceSum2) % 56) fail('牌墙开牌偏移与骰子不一致')
// 首局：墙头在庄家方位，开牌点 = 点数和（2~12）
if (first.headSeat !== first.dealer) fail('首局墙头应在庄家方位')
const diceSum1 = first.dice[0] + first.dice[1]
if (first.wallOffset !== (first.headSeat * 14 + diceSum1) % 56) fail('首局开牌偏移与骰子不一致')
// restart({dealer})：先胡者坐庄（UI 按上局结果传入）
const nextDealer = (first.dealer + 2) % 4
game.restart({ dealer: nextDealer })
const third = game.session()
if (third.dealer !== nextDealer) fail('restart({dealer}) 未生效: ' + JSON.stringify(third))
if (game.view().dealer !== nextDealer) fail('引擎庄家与指定下局庄家不一致')
if (game.view().players[nextDealer].handCount !== 14) fail('新庄家应起手 14 张')
// restart({rules})：封顶番数覆盖生效
game.restart({ rules: { capFan: 3 } })
if (game.exportState().rules.capFan !== 3) fail('restart({rules}) 封顶番数未生效')
// 建局 rules 覆盖
const capped = createLocalGame({ seed: 7, aiLevel: 'easy', rules: { capFan: 2 } })
if (capped.exportState().rules.capFan !== 2) fail('建局 rules 覆盖未生效')
capped.dispose()

game.dispose()
console.log('=== adapter 冒烟测试通过 ===')
