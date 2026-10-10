// Classic skill mechanics; descriptions are independently written for this UI.
export const SUITS = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }
export const ROLES = {
  lord: { name: '主公', goal: '消灭反贼与内奸，与忠臣共同获胜', color: '#d3ac62' },
  loyal: { name: '忠臣', goal: '保护主公，消灭反贼与内奸', color: '#78bca0' },
  rebel: { name: '反贼', goal: '击败主公即可获胜', color: '#e38875' },
  renegade: { name: '内奸', goal: '先除掉其他人，最后单独击败主公', color: '#b9a0cf' }
}
export const FACTIONS = { shu: '蜀', wei: '魏', wu: '吴', qun: '群' }
export const SKILLS = {
  guanxing:['观星','准备阶段观看牌堆顶X张牌，X为存活人数且至多五；可按任意顺序将它们放回牌堆顶或底。','trigger'],
  guose:['国色','方块手牌或装备可以当乐不思蜀使用；不能与已经存在的同类延时牌重复。','convert'],
  liuli:['流离','成为杀的目标时，可弃一张手牌或装备，将杀转给弃牌后仍在自己攻击范围内的其他角色，不能转回杀的使用者。','trigger'],
  lijian:['离间','出牌阶段限一次，弃一张手牌或装备，让一名其他男性对另一名男性决斗。顺序决定谁先响应；经典原版不能用无懈抵消。','active'],
  guicai:['鬼才','一张判定牌生效前，可以用一张手牌替换它；原判定牌弃置。','trigger'],
  fankui:['反馈','受伤后，可取得伤害来源的一张手牌或装备；不包括判定区。','trigger'],
  tiandu:['天妒','自己的最终判定牌生效后，可以获得这张牌；被替换掉的旧牌不能获得。','trigger'],
  yiji:['遗计','每受到一点伤害后，可以摸两张牌，再将其中任意张交给其他角色；不能赠出原有手牌。','trigger'],
  luoshen:['洛神','准备阶段可以判定；黑色判定牌归自己，并可继续判定，红色则结束。','trigger'],
  ganglie:['刚烈','受伤后可以判定；不是红桃时，伤害来源弃两张手牌或受到一点伤害。','trigger'],
  tuxi:['突袭','摸牌阶段，可以不摸牌，改为获得至多两名其他角色的各一张手牌。只选一人也不再摸牌。','trigger'],
  kongcheng:['空城','没有手牌时，不能成为杀或决斗的目标。','locked'],
  biyue:['闭月','结束阶段可以摸一张牌。','trigger'],
  qianxun:['谦逊','不能成为顺手牵羊或乐不思蜀的目标；其他拆牌、伤害和技能仍按正常规则处理。','locked'],
  lianying:['连营','失去最后一张手牌时，可以摸一张。只有装备被移走不触发；死亡清空手牌也不触发。','trigger'],
  qingnang:['青囊','出牌阶段限一次，弃一张手牌，让一名角色回复一点体力；可以治疗自己。','active'],
  jijiu:['急救','只在你的回合外，红色手牌或装备可以当桃使用；自己的回合内不能这样转化。','convert'],
  jieyin:['结姻','出牌阶段限一次，弃两张手牌，令自己与一名受伤的其他男性各回复一点体力。','active'],
  xiaoji:['枭姬','每失去一张装备区里的牌，可以摸两张；转交、被取走、被弃置或替换均属于失去。','trigger'],
  qixi: ['奇袭','可以将一张黑色手牌或装备当作过河拆桥使用。','convert'],
  qingguo: ['倾国','可以将一张黑色手牌当作闪使用或打出；装备不能这样转化。','convert'],
  keji: ['克己','本回合出牌阶段没有使用或打出杀时，自动跳过弃牌阶段。','locked'],
  rende: ['仁德', '交给其他角色任意张手牌；本阶段累计给出两张时回复一点体力。', 'active'],
  jijiang: ['激将', '主公技：需要杀时，可请其他蜀将提供。', 'lord'],
  wusheng: ['武圣', '红色手牌或装备可以当作杀使用、打出。', 'convert'],
  paoxiao: ['咆哮', '出牌阶段使用杀没有次数限制。', 'locked'],
  longdan: ['龙胆', '手牌中的杀与闪可以互相转化。', 'convert'],
  mashu: ['马术', '计算你到其他角色的距离时减少一。', 'locked'],
  tieji: ['铁骑', '出杀时可判定；红色判定使目标无法用闪响应。', 'trigger'],
  jizhi: ['集智', '使用普通锦囊时可额外摸一张牌。', 'trigger'],
  qicai: ['奇才', '使用锦囊不受距离限制。', 'locked'],
  zhiheng: ['制衡', '每个出牌阶段一次：弃置任意数量的手牌、装备，摸等量牌。', 'active'],
  jiuyuan: ['救援', '主公技：其他吴将救你时，一张桃回复两点体力。', 'lord'],
  kurou: ['苦肉', '出牌阶段可失去一点体力，存活后摸两张牌。', 'active'],
  yingzi: ['英姿', '摸牌阶段可以多摸一张牌。', 'trigger'],
  fanjian: ['反间', '每个出牌阶段一次：他人猜花色，获得你一张随机手牌；猜错受到一点伤害。', 'active'],
  jianxiong: ['奸雄', '受到伤害并存活后，可收回造成伤害的实体牌。', 'trigger'],
  hujia: ['护驾', '主公技：需要闪时，可请其他魏将提供。', 'lord'],
  luoyi: ['裸衣', '摸牌阶段可少摸一张；本回合你造成的杀、决斗伤害增加一点。', 'trigger'],
  wushuang: ['无双', '你的杀需两张闪抵消；与你决斗，对方每轮需打两张杀。', 'locked']
}
export const HEROES = [
  {id:'zhugeliang',name:'诸葛亮',title:'卧龙',faction:'shu',hp:3,sex:'male',skills:['guanxing','kongcheng'],emblem:'星'},
  {id:'daqiao',name:'大乔',title:'国色',faction:'wu',hp:3,sex:'female',skills:['guose','liuli'],emblem:'移'},
  {id:'diaochan',name:'貂蝉',title:'绝世舞姬',faction:'qun',hp:3,sex:'female',skills:['lijian','biyue'],emblem:'月'},
  {id:'simayi',name:'司马懿',title:'狼顾之鬼',faction:'wei',hp:3,sex:'male',skills:['fankui','guicai'],emblem:'判'},
  {id:'guojia',name:'郭嘉',title:'早终先知',faction:'wei',hp:3,sex:'male',skills:['tiandu','yiji'],emblem:'计'},
  {id:'zhenji',name:'甄姬',title:'洛神',faction:'wei',hp:3,sex:'female',skills:['luoshen','qingguo'],emblem:'洛'},
  {id:'xiahoudun',name:'夏侯惇',title:'独眼罗刹',faction:'wei',hp:4,sex:'male',skills:['ganglie'],emblem:'烈'},
  {id:'zhangliao',name:'张辽',title:'前将军',faction:'wei',hp:4,sex:'male',skills:['tuxi'],emblem:'袭',source:'https://www.sanguosha.com/hero/18'},
  {id:'luxun',name:'陆逊',title:'儒生雄才',faction:'wu',hp:3,sex:'male',skills:['qianxun','lianying'],emblem:'营',source:'https://www.sanguosha.com/hero/14'},
  {id:'huatuo',name:'华佗',title:'神医',faction:'qun',hp:3,sex:'male',skills:['qingnang','jijiu'],emblem:'医',source:'https://www.sanguosha.com/hero/22'},
  {id:'sunshangxiang',name:'孙尚香',title:'弓腰姬',faction:'wu',hp:3,sex:'female',skills:['jieyin','xiaoji'],emblem:'姻',source:'https://www.sanguosha.com/hero/25'},
  {id:'ganning',name:'甘宁',title:'锦帆游侠',faction:'wu',hp:4,sex:'male',skills:['qixi'],emblem:'袭'},
  {id:'lvmeng',name:'吕蒙',title:'白衣渡江',faction:'wu',hp:4,sex:'male',skills:['keji'],emblem:'藏'},
  { id: 'liubei', name: '刘备', title: '仁德之君', faction: 'shu', hp: 4, sex: 'male', skills: ['rende', 'jijiang'], emblem: '仁', source: 'https://www.sanguosha.com/hero/1' },
  { id: 'guanyu', name: '关羽', title: '美髯公', faction: 'shu', hp: 4, sex: 'male', skills: ['wusheng'], emblem: '义', source: 'https://www.sanguosha.com/hero/2' },
  { id: 'zhangfei', name: '张飞', title: '万夫不当', faction: 'shu', hp: 4, sex: 'male', skills: ['paoxiao'], emblem: '勇', source: 'https://x.sanguosha.com/hero/3.html' },
  { id: 'zhaoyun', name: '赵云', title: '常山子龙', faction: 'shu', hp: 4, sex: 'male', skills: ['longdan'], emblem: '胆', source: 'https://www.sanguosha.com/hero/5' },
  { id: 'machao', name: '马超', title: '西凉铁骑', faction: 'shu', hp: 4, sex: 'male', skills: ['mashu', 'tieji'], emblem: '骑', source: 'https://www.sanguosha.com/hero/6' },
  { id: 'huangyueying', name: '黄月英', title: '奇智女杰', faction: 'shu', hp: 3, sex: 'female', skills: ['jizhi', 'qicai'], emblem: '智', source: 'https://www.sanguosha.com/hero/7' },
  { id: 'sunquan', name: '孙权', title: '江东之主', faction: 'wu', hp: 4, sex: 'male', skills: ['zhiheng', 'jiuyuan'], emblem: '衡', source: 'https://x.sanguosha.com/hero/8.html' },
  { id: 'huanggai', name: '黄盖', title: '三朝虎臣', faction: 'wu', hp: 4, sex: 'male', skills: ['kurou'], emblem: '烈', source: 'https://sanguosha.com/news/20161025_2321_1417' },
  { id: 'zhouyu', name: '周瑜', title: '大都督', faction: 'wu', hp: 3, sex: 'male', skills: ['yingzi', 'fanjian'], emblem: '谋', source: 'https://x.sanguosha.com/hero/12.html' },
  { id: 'caocao', name: '曹操', title: '乱世奸雄', faction: 'wei', hp: 4, sex: 'male', skills: ['jianxiong', 'hujia'], emblem: '雄', source: 'https://www.sanguosha.com/hero/15' },
  { id: 'xuchu', name: '许褚', title: '虎痴', faction: 'wei', hp: 4, sex: 'male', skills: ['luoyi'], emblem: '虎', source: 'https://x.sanguosha.com/hero/20.html' },
  { id: 'lvbu', name: '吕布', title: '无双飞将', faction: 'qun', hp: 4, sex: 'male', skills: ['wushuang'], emblem: '战', source: 'https://x.sanguosha.com/hero/24.html' }
]
export const HERO_BY_ID = Object.fromEntries(HEROES.map(hero => [hero.id, hero]))
const card = (name, category, symbol, help, extra = {}) => ({ name, category, symbol, help, ...extra })
export const CARDS = {
  sha: card('杀', 'basic', '戈', '攻击范围内的一名其他角色，需闪抵消，否则受到一点伤害。'),
  shan: card('闪', 'basic', '盾', '响应杀，抵消一次攻击；不能主动对他人使用。'),
  tao: card('桃', 'basic', '桃', '出牌时回复自己一点体力，或救援濒死角色。'),
  duel: card('决斗', 'trick', '斗', '双方轮流打出杀，不能响应的一方受到一点伤害。'),
  dismantle: card('过河拆桥', 'trick', '拆', '弃置一名其他角色手牌、装备或判定区的一张牌。'),
  snatch: card('顺手牵羊', 'trick', '取', '距离一以内，获得其他角色的一张手牌、装备或判定牌。'),
  draw: card('无中生有', 'trick', '策', '对自己使用，摸两张牌。'),
  savage: card('南蛮入侵', 'trick', '蛮', '其他角色依次打出杀，否则受到一点伤害。'),
  arrows: card('万箭齐发', 'trick', '矢', '其他角色依次使用闪，否则受到一点伤害。'),
  garden: card('桃园结义', 'trick', '盟', '所有存活角色依次回复一点体力。'),
  harvest: card('五谷丰登', 'trick', '谷', '亮出与存活人数相同的牌，各人按顺序选一张。'),
  collateral: card('借刀杀人', 'trick', '借', '令有武器的他人对其攻击范围内的角色出杀，否则交出武器。'),
  nullify: card('无懈可击', 'trick', '解', '抵消一项锦囊效果，也可抵消另一张无懈可击。'),
  indulgence: card('乐不思蜀', 'delay', '乐', '目标判定：不是红桃则跳过出牌阶段。'),
  lightning: card('闪电', 'delay', '雷', '判定黑桃二至九受到三点无来源伤害；否则流向下家。'),
  crossbow: card('诸葛连弩', 'equip', '弩', '本出牌阶段可不限次数使用杀。', { slot: 'weapon', range: 1 }),
  dualsword: card('雌雄双股剑', 'equip', '双', '对异性出杀，可令其弃一张手牌或让你摸一张牌。', { slot: 'weapon', range: 2 }),
  qinggang: card('青釭剑', 'equip', '剑', '你使用杀时无视目标防具。', { slot: 'weapon', range: 2 }),
  blade: card('青龙偃月刀', 'equip', '刀', '杀被闪抵消后，可再对同一目标使用一张杀。', { slot: 'weapon', range: 3 }),
  spear: card('丈八蛇矛', 'equip', '矛', '可以用两张手牌合成一张杀使用或打出。', { slot: 'weapon', range: 3 }),
  axe: card('贯石斧', 'equip', '斧', '杀被抵消后，可弃两张牌强制造成伤害。', { slot: 'weapon', range: 3 }),
  halberd: card('方天画戟', 'equip', '戟', '使用最后一张手牌作杀，可选择最多三个目标。', { slot: 'weapon', range: 4 }),
  bow: card('麒麟弓', 'equip', '弓', '杀造成伤害时，可弃置目标的一匹马。', { slot: 'weapon', range: 5 }),
  ice: card('寒冰剑', 'equip', '冰', '杀即将造成伤害时，可改为弃置目标两张手牌或装备。', { slot: 'weapon', range: 2 }),
  bagua: card('八卦阵', 'equip', '卦', '需要闪时可判定，红色视为响应一张闪。', { slot: 'armor' }),
  renwang: card('仁王盾', 'equip', '甲', '黑色的杀对你无效。', { slot: 'armor' }),
  chitu: card('赤兔', 'equip', '驹', '你到其他角色的距离减少一。', { slot: 'offenseHorse' }),
  dayuan: card('大宛', 'equip', '驹', '你到其他角色的距离减少一。', { slot: 'offenseHorse' }),
  zixing: card('紫骍', 'equip', '驹', '你到其他角色的距离减少一。', { slot: 'offenseHorse' }),
  jueying: card('绝影', 'equip', '马', '其他角色到你的距离增加一。', { slot: 'defenseHorse' }),
  dilu: card('的卢', 'equip', '马', '其他角色到你的距离增加一。', { slot: 'defenseHorse' }),
  zhuahuang: card('爪黄飞电', 'equip', '马', '其他角色到你的距离增加一。', { slot: 'defenseHorse' })
}

// Two cards per suit/rank plus four EX cards; 53 basic, 36 tricks, 19 equipment.
const PAIRS = {
  spade: [['duel','lightning'],['dualsword','bagua'],['dismantle','snatch'],['dismantle','snatch'],['blade','jueying'],['qinggang','indulgence'],['sha','savage'],['sha','sha'],['sha','sha'],['sha','sha'],['snatch','nullify'],['spear','dismantle'],['savage','dayuan']],
  club: [['crossbow','duel'],['sha','bagua'],['sha','dismantle'],['sha','dismantle'],['sha','dilu'],['sha','indulgence'],['sha','savage'],['sha','sha'],['sha','sha'],['sha','sha'],['sha','sha'],['collateral','nullify'],['collateral','nullify']],
  heart: [['garden','arrows'],['shan','shan'],['tao','harvest'],['tao','harvest'],['chitu','bow'],['tao','indulgence'],['tao','draw'],['tao','draw'],['tao','draw'],['sha','sha'],['sha','draw'],['tao','dismantle'],['shan','zhuahuang']],
  diamond: [['crossbow','duel'],['shan','shan'],['shan','snatch'],['shan','snatch'],['shan','axe'],['sha','shan'],['sha','shan'],['sha','shan'],['sha','shan'],['sha','shan'],['shan','shan'],['tao','halberd'],['sha','zixing']]
}
export function makeDeck() {
  const result = []
  for (const [suit, pairs] of Object.entries(PAIRS)) pairs.forEach((types, index) => types.forEach(type => result.push({ id: `c${result.length}`, type, suit, rank: index + 1 })))
  for (const [type,suit,rank] of [['ice','spade',2],['renwang','club',2],['lightning','heart',12],['nullify','diamond',12]]) result.push({ id: `c${result.length}`, type, suit, rank })
  return result
}
export const isRed = c => c.suit === 'heart' || c.suit === 'diamond'
export const rankName = n => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[n] || String(n)
