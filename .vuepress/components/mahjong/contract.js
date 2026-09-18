// ============================================================
// 四川麻将（血战到底）共享契约 —— 规则版本 scmj-1.1
// ------------------------------------------------------------
// 本文件是 规则引擎(rules.js / engine.js)、AI(ai.js) 与 牌桌 UI(ui.js)
// 之间唯一的数据结构契约，任何模块不得另起一套牌局结构。
//
// 核心原则：
//   1. 页面不判断胡牌，AI 不修改牌局，一切动作交给引擎 dispatch 裁决。
//   2. GameState / PlayerView / Action / GameEvent / Settlement 均为
//      纯 JSON（可 JSON.stringify），用于存档、回放与未来服务端复用。
//   3. 随机性只来自 createGame 的 seed（洗牌）与驱动方传入的 rng（AI 决策），
//      相同 seed + 相同动作序列 ⇒ 完全相同的对局。
//
// 环境：VuePress 1.5 / webpack4，无 TS 编译链，类型用 JSDoc 描述。
// 本文件零依赖、纯函数，浏览器与 Node 均可 import。
// ============================================================

// scmj-1.1：幺鸡换牌判定改为「看幺鸡在哪一步进入副露」（见 engine.js meld.wildPeng）
export const RULE_VERSION = "scmj-1.1";

// ---------- 牌 ----------
// 108 张：万(0-8) 筒(9-17) 条(18-26)，每种 4 张。
// 牌 id = 花色序号 * 9 + (点数 - 1)
export const SUITS = ["wan", "tong", "tiao"];
export const SUIT_NAMES = { wan: "万", tong: "筒", tiao: "条" };
export const RANK_NAMES = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
export const TILE_KINDS = 27;
export const TILE_COPIES = 4;
export const TOTAL_TILES = 108;

/** suit: 'wan'|'tong'|'tiao', rank: 1..9 -> tileId 0..26 */
export function tileId(suit, rank) {
  return SUITS.indexOf(suit) * 9 + (rank - 1);
}
export function tileSuit(id) {
  return SUITS[Math.floor(id / 9)];
}
export function tileRank(id) {
  return (id % 9) + 1;
}
/** '三万' 风格名称，UI 直接展示 */
export function tileName(id) {
  return RANK_NAMES[tileRank(id) - 1] + SUIT_NAMES[tileSuit(id)];
}
/** 全部 108 张牌 id（每 id x4） */
export function allTileIds() {
  const a = [];
  for (let i = 0; i < TILE_KINDS; i++)
    for (let c = 0; c < TILE_COPIES; c++) a.push(i);
  return a;
}

/** 幺鸡（一条）id = 18：开启幺鸡赖子后作为万能牌（可当任意牌） */
export const YAOJI_TILE = tileId("tiao", 1);

// ---------- 座位与屏幕方位（UI 固定渲染） ----------
// 0 = 自己(下)  1 = 右(下家)  2 = 上(对家)  3 = 左(上家)
// 行动顺序 0→1→2→3（逆时针），已胡玩家跳过。

// ---------- 阶段 ----------
export const PHASE_DEAL = "deal"; // 发牌（瞬时，构造时完成）
export const PHASE_SWAP = "swap"; // 换三张：等待每人选 3 张同花色
export const PHASE_VOID = "void"; // 定缺：等待每人选缺门
export const PHASE_DISCARD = "discard"; // 摸/打：turn 玩家行动
export const PHASE_RESPOND = "respond"; // 响应窗口：他人对出牌/补杠表态
export const PHASE_FINISHED = "finished";

// ---------- 动作 ----------
export const ACTION = {
  SWAP: "swap", // {type, seat, tiles:[3张同花色]}
  VOID: "void", // {type, seat, suit}
  DISCARD: "discard", // {type, seat, tile}
  PENG: "peng", // {type, seat}              —— 针对 pendingDiscard
  GANG: "gang", // {type, seat, tile, gangType:'ming'|'an'|'bu'}
  SWAP_YAOJI: "swap-yaoji", // {type, seat, tile}  —— 幺鸡局把带幺鸡的明杠/暗杠换回真牌
  HU: "hu", // {type, seat}              —— 自摸/点炮/抢杠由引擎判定
  PASS: "pass" // {type, seat}              —— 放弃当前响应
};
// 每个动作必须携带：actionId(发起方生成的唯一串) 与 stateVersion(=state.version)。
// 引擎按 actionId 去重，按 stateVersion 拒绝过期动作。

// ---------- dispatch 错误码 ----------
export const ERR = {
  STALE: "stale", // stateVersion 不匹配
  DUPLICATE: "duplicate", // actionId 已执行过
  NOT_ACTIVE: "not-active", // 不是该玩家的行动窗口
  ILLEGAL: "illegal", // 内容不合法（错牌、未打缺门、不能胡等）
  WRONG_PHASE: "wrong-phase"
};

// ---------- 规则配置 ----------
export const DEFAULT_RULES = {
  ruleVersion: RULE_VERSION,
  players: 4, // 固定 4 座，空位由 AI 补齐
  baseScore: 1, // 底分
  capFan: 4, // 封顶番数（单笔支付上限 2^capFan 分）；默认值，入口滑杆可选 2~6
  zimoFan: 1, // 自摸加番
  haidiFan: 1, // 海底加番（摸到/打出牌墙最后一张牌时胡牌；自摸为“海底捞月”）
  gangShangFan: 1, // 杠上胡加番（杠后补牌胡：自摸为“杠上花”，点炮为“杠上炮”，都给胡牌者加番）
  qianggangFan: 1, // 抢杠胡加番（补杠被抢：杠不成立，抢杠者额外加番）
  genFan: 1, // 根加番：每有一组 4 张相同牌（明/暗/补杠，或碰后手留一张、手里 4 张未杠）加 1 番
  swapThree: true, // 换三张（方向由 seed 派生：下家/上家/对家）
  voidRequired: true, // 定缺；未打完缺门牌不能碰杠胡
  chi: false, // 不允许吃
  gangMing: 1, // 明杠（刮风）：放杠者付 1
  gangAn: 2, // 暗杠（下雨）：每位活跃未胡玩家付 2
  gangBu: 1, // 补杠基准分（仅幺鸡局生效）：带幺鸡每活跃玩家付 1；非幺鸡局补杠仍按 gangAn
  // 幺鸡赖子：开启后幺鸡（一条）为万能牌，可补位碰/杠、杠钱与番数按「带/不带幺鸡」区分、
  // 支持幺鸡杠换牌、杠上炮转雨、结算幺鸡喜钱（详见 rules.js / engine.js 说明）。
  yaojiEnabled: false,
  xiThree: 4, // 幺鸡局喜钱：结算时手上有 3 只幺鸡，每家付 4 分
  xiFour: 8, // 幺鸡局喜钱：结算时手上有 4 只幺鸡，每家付 8 分
  chaHuaZhu: true, // 查花猪：未打缺者赔封顶分给每位未胡玩家
  chaDaJiao: true, // 查大叫：流局时未听牌者按其手牌最大可能番数赔给每位已听牌玩家（封顶内）
  refundGangOnFlow: true, // 退杠：流局时未听牌者（含花猪）退还本局全部已收杠钱；胡满结束的局不退
  taxRefund: false, // 退税：v1 暂不启用（规则说明页须如实标注）
  endWhenHuPlayers: 3 // 三人胡牌即结束
};

// ============================================================
// 数据结构（JSDoc 契约，各模块按此实现）
// ============================================================

/**
 * Meld 副露
 * {kind:'peng', tile, from:seat, wild?, wildPeng?}                   碰
 * {kind:'gang', gangType:'ming'|'an'|'bu', tile, from, wild?, wildPeng?}  明杠/暗杠/补杠
 * from: 来源座位（暗杠为 null）
 * wild: 该副露里用了几张幺鸡赖子补位（0/undefined 表示纯真牌）。
 *   - 幺鸡局才有值；碰/杠允许「真牌 + 幺鸡」凑齐（如 1 张 1 万 + 1 只幺鸡碰 1 万）。
 * wildPeng: 其中有多少只幺鸡是在「碰」这一步进来的（碰赖时 = wild）。
 *   - 幺鸡在「碰」这一步进来的不可换回：碰赖本身、以及之后用真牌补杠成的杠，
 *     都不能把幺鸡换回手牌；
 *   - 碰是纯真牌、幺鸡在补杠那一步才补进来的（wildPeng 为空/0），
 *     之后手里又摸到对应真牌，可以「换牌」把幺鸡收回手牌（见 engine.js）。
 */

/**
 * PlayerState
 * {
 *   seat: 0..3,
 *   hand: [tileId 升序]（不含刚摸的牌），
 *   melds: [Meld],
 *   discards: [tileId]（按打出顺序），
 *   void: 'wan'|'tong'|'tiao'|null,
 *   hu: null | {how:'zimo'|'dianpao'|'qianggang', winTile, fan, names:[], huOrder, scoreDelta},
 *   delta: number,          // 本局累计积分变化（含杠分），整数
 *   swapPicked: [tileId]|null  // 换三张阶段暂存
 * }
 */

/**
 * GameState（引擎唯一权威状态，纯 JSON）
 * {
 *   version: number,            // 每次成功动作 +1
 *   ruleVersion: RULE_VERSION,
 *   rules: {…DEFAULT_RULES 深拷贝},
 *   seed: number,
 *   phase: PHASE_*,
 *   dealer: 0..3,               // 庄家（默认 seed % 4，可由 createGame 显式指定）
 *   turn: 0..3,                 // 当前行动者（respond 阶段为出牌/补杠者）
 *   drawnTile: tileId|null,     // turn 玩家刚摸的牌（打出/杠后清 null）
 *                               // 庄家起手 14 张直接打第一张，故首个摸打回合为 null
 *   mustDiscard: bool,          // 碰牌后的强制出牌回合：只许打一张，不能胡/杠
 *   wall: [tileId...],          // 剩余牌墙：普通摸牌 shift()，杠后摸牌 pop()
 *                               // 发牌后按 wallOffset 旋转，决定摸排起点
 *                               // （起点方位 headSeat×14 + 骰子点数之和=开牌点）
 *   players: [PlayerState x4],
 *   pendingDiscard: null | {seat, tile, tag},
 *   pendingKong: null | {seat, tile, tag},  // 补杠抢胡窗口
 *                              // tag = 出牌/补杠批次号，用于判定一炮多响
 *                              // （同一 tag 的多次胡 = 同一张牌被多家胡）
 *   gangTurn: null | {seat, total, items:[{from, amount}]}, // 本回合杠分暂存：
 *                              // 幺鸡局「杠上炮转雨」用，回合结束/下一家摸牌即清空
 *   claims: {seat: 'hu'|'peng'|'gang'|'pass'}, // 响应窗口内已表态者及动作
 *   results: null | Settlement,
 *   events: [GameEvent...],     // 完整事件日志（seq 递增）
 *   actionLog: [{actionId, seat, type, ...payload}]  // 已执行动作（回放用）
 * }
 */

/**
 * GameEvent
 * {seq, type, seat?, data?}
 * type ∈ 'game-start' 'deal' 'swap-select' 'swap-apply' 'void-set'
 *        'draw' 'discard' 'peng' 'gang' 'swap-yaoji' 'rob-start' 'hu' 'pass'
 *        'turn' 'liuju' 'settle'
 */

/**
 * ActionOption（playerView().legal 数组元素，UI 据此渲染按钮）
 * {type:'swap'}                                   换三张（3 张同花色由 UI 选择、引擎校验）
 * {type:'void', suits:[...]}                       定缺可选花色
 * {type:'discard', tiles:[可打牌 id]}               已按缺门优先过滤
 * {type:'peng', tile}
 * {type:'gang', options:[{tile, gangType}]}        多种杠时逐项列出
 * {type:'swap-yaoji', tile}                        幺鸡局：把带幺鸡的明杠/暗杠换回真牌
 * {type:'hu', how:'zimo'|'dianpao'|'qianggang'}
 * {type:'pass'}
 */

/**
 * PlayerView（UI/AI 唯一可见信息，严禁夹带他人手牌或墙序）
 * {
 *   version, ruleVersion, phase, turn, dealer, wallCount,
 *   yaoji: bool,                 // 是否幺鸡赖子局（UI 用来显示幺鸡副露 / 换牌按钮）
 *   pendingDiscard, pendingKong,
 *   players: [{seat, handCount, melds, discards, void, hu, delta}],  // 含自己
 *     // void = 'wan'|'tong'|'tiao'|null。定缺阶段只公开自己的缺门（他人为 null），
 *     //   四家全部定完才公开他人缺门，避免后定缺者照着先定完的 AI 针对性选择
 *   my: {hand:[升序,不含drawnTile], drawnTile, melds, discards, void, hu, delta,
 *        ting:[可胡牌张 id], fan:{fan, names, kind:'hu'|'ting'|'potential'}|null,
 *        passHu:{fan, tile}|null, awaitingNearer:[seat...]},
 *     // fan = 当前番数：已胡给胡牌番数；听牌取听张最大番；未听但有副露时估番
 *     // passHu = {fan, tile}|null：过水（过庄前）已放弃的点炮番数。
 *     //   放弃点炮胡后、自己摸牌前不能再胡同番或更低番的炮——此时「胡」不出现
 *     //   在 legal 里，只剩「过」；自摸与番更大的炮不受限，玩家始终可继续选择过。
 *     // awaitingNearer = [seat...]：响应窗口里仍在等我表态、且离出牌者更近的座位。
 *     //   非空 = 此刻是「更近的一家先叫牌」，我的碰/杠权还在排队（legal 里的
 *     //   「过」只是占位，不是我的回合）。UI 用它把那个孤零零的「过」换成等待
 *     //   提示，避免玩家误点一下就把碰权送掉；等这些座位表态后会重新给出碰/杠。
 *   legal: [ActionOption...],
 *   waiting: [seat...],          // 响应窗口内尚未表态的座位（按摸牌顺序排列：自出牌者
 *                                //   下家起逆时针；碰/明杠同级时最近的先叫，更近者没
 *                                //   表态前较远者拿不到碰/杠选项）
 *   lastEvents: [GameEvent...尾部≤20],
 *   results: Settlement|null
 * }
 */

/**
 * Settlement（state.results / view.results）
 * {
 *   liuju: bool,
 *   huOrder: [{seat, how, winTile, fan, names:[], scoreDelta, from?, tag?}],
 *     // tag = 点炮/抢杠的出牌批次号（自摸无）；同 from 且同 tag 的多人胡 = 一炮多响
 *   ledger: [{from, to, amount, reason}],
 *     // reason ∈ 'zimo' 'dianpao' 'qianggang' 'gang-ming' 'gang-an'
 *     //          'cha-huazhu' 'cha-dajiao' 'gang-refund'
 *     //          'gang-zhuan-yu'（杠上炮转雨） 'yaoji-xi'（幺鸡喜钱）
 *   perSeat: [{seat, delta}],
 *   seats: [{seat, hand:[tileId], melds:[Meld], void, hu, ting:bool}],
 *     // 终局牌面（牌局已结束，无隐私问题）：结算页摆出各家手牌 + 副露，供核对
 *     // 番型（七对/清一色等）、杠数与听牌判定。点炮 / 抢杠胡者的 hand 不含胡牌张
 *     // （那张牌在点炮者弃牌区），展示时用 hu.winTile 补；ting = 未胡且已打缺且真听牌
 *   chaItems: [{type:'huazhu'|'dajiao', seat, amount, fan?, names?:[]}]
 *     // dajiao 的 fan/names = 该未听牌者按手牌估出的赔付番数（非封顶）
 *   refundItems: [{type:'tuigang', seat, amount, count}]
 *     // 退杠：流局时未听牌者退还本局全部已收杠钱（count = 退还笔数）
 *   xiItems: [{seat, count, amount, total}]
 *     // 幺鸡喜钱（幺鸡局）：结算时名下有 3 只幺鸡每家给 4 分、4 只每家给 8 分；
 *     // count = 名下幺鸡数（手牌 + 副露，含被抢杠后留在副露补位的），
 *     // amount = 每家支付额，total = 该玩家总收入
 * }
 * 不变量：所有 ledger 金额之和为 0，perSeat.delta 之和为 0。
 */

// ============================================================
// UI 适配层接口（adapter.js）
// ------------------------------------------------------------
// UI 只通过该接口与牌局交互；本地版 = 引擎+AI 的封装，
// 未来联网版替换为 WebSocket 实现而 UI 不变。
//
// createLocalGame({seed?, aiLevel?, rules?, seatNames?, onEvent?,
//                  session?, restoreState?}) -> {
//   view(): PlayerView                 // 人类玩家(座位0)视角
//   dispatch(action): {ok, error?}     // 人类动作（actionId 由 adapter 生成）
//   suggest(): {text, action?}|null    // 策略建议（ai.suggest 封装），仅建议不代打
//   session(): {round, dealer, dice, startSeat, headSeat, wallOffset, mode}
//                                      // 会话信息：局号、本局庄家、本局骰子
//                                      //   headSeat = 本局摸牌起点方位（墙头所在座位）
//   opening(): {dice, dealer, round, mode, startSeat, headSeat}
//                                      // 开局掷骰表现（纯展示字段，可选）
//                                      //   mode='dealer' 首局定庄（墙头在庄家方位）
//                                      //   mode='draw'   后续局骰子定摸牌起点方位
//   finished(): bool
//   restart(opts?): void               // 再来一局（局号 +1）
//                                      //   opts.round  显式局号（缺省 +1）
//                                      //   opts.dealer 下局庄家：先胡者坐庄，
//                                      //     一炮多响时点炮者坐庄（缺省沿用本局）
//                                      //   opts.rules  规则覆盖（如 capFan）
//   dispose(): void                    // 清理定时器/监听
//   exportState(): GameState           // 导出 JSON 存档
// }
// session 仅承载牌局之外的会话信息（局号等），不混入 GameState；
// restoreState 恢复时应同时传入 session，否则局号从 1 重新计。
// onEvent(ev: GameEvent) 在每次状态推进后回调（用于音效/动画）。
// AI 出牌节奏（延迟、可取消）由 adapter 控制，引擎不做任何等待。
// ============================================================
