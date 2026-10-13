# 2026-10-12：三名新角色与经典军争

默认仍为标准108张；单机首页与联机建房可另选军争160张。选择在开局冻结，不允许房内切换。没有牌堆字段的旧房间／旧选将按108张处理；旧108张存档原样恢复，160张存档使用独立校验器，不改主题版本。

## 完整原版对应（仅内部）

|角色|原版参照|技能|基础体力／机械同盟|
|---|---|---|---|
|燃灯道人|风包旧张角|灯雷＝雷击、移劫＝鬼道、归灯＝黄天|3／玄盟|
|元始天尊|火包袁绍|万剑＝乱击、仙统＝血裔|4／玄盟|
|木吒|林包徐晃|断道＝断粮|4／赤盟|

雷击仅黑桃判定造成两点雷伤，不引入新版回血；鬼道允许黑色手牌或装备，拿回旧判定牌；黄天只允许其他玄盟交真实闪／闪电，每出牌阶段一次。乱击要求两张相同花色手牌，不能拿装备凑；血裔只在身份主公生效，按其他存活玄盟每人加两张上限。断粮仅黑色基本牌／装备，使用距离二，梅花判定成功否则跳过摸牌，不跳过出牌。

原版事件核对：[旧雷击](https://github.com/Mogara/QSanguosha-v2/blob/master/src/package/nostalgia.cpp)、[鬼道／黄天](https://github.com/Mogara/QSanguosha-v2/blob/master/src/package/wind.cpp)、[乱击／血裔](https://github.com/Mogara/QSanguosha-v2/blob/master/src/package/fire.cpp)、[断粮](https://github.com/Mogara/QSanguosha-v2/blob/master/src/package/thicket.cpp)。官网当下OL技能可能是修订版，不能代替本次冻结的原版。

## 实体牌

军争按[52张原版军争表](https://github.com/Mogara/QSanguosha-v2/blob/master/src/package/maneuvering.cpp)追加 c108–c159，c0–c107不变。火杀5、雷杀9、酒5、铁索6、火攻3、兵粮2；另外桃4、闪9、无懈3和6张装备（含两张藤甲）。新卡使用本游戏命名及原创素材。旧121张实验函数只用于独立回归，不作为正式牌堆。

普通伤害不传导；火、雷伤害按连环传导并解除连环。首目标受防具修正后的实际伤害作为传导起点，其他目标再独立处理防具。酒强化下一张杀，火攻展示手牌并弃同花色，普通杀可经扇转火杀；火杀／雷杀共用杀的次数、距离和响应限制。

## 素材和操作

实体牌面永不改名、换插图或改变印刷花色点数。元始两张同花色手牌作为飞剑齐发使用，牌桌仍显示那两张真实牌；动作的 as 与牌面 type 分离，方便记牌。鬼才／鬼道改判、转杀／转闪／转阵法等同样保留原牌；圣颜的有效花色只参与规则，不改变印刷花色。纯虚拟技能无实体牌时才显示虚拟效果牌。

三名角色使用内置 imagegen 独立生成、无文字的2:3原创肖像；提示集见 [MILITARY_ART_PROMPTS.md](MILITARY_ART_PROMPTS.md)。成果在 assets/heroes/{randeng,yuanshi,muzha}.jpg，缩略图同目录。闭粮阵、守山獬豸延续现有代码原生SVG插画，不使用商业游戏素材。新增卡／技能免费Edge TTS均有男女声。

万剑按钮开启两张手牌选择，同花色且合法才允许确认。雷击目标选择、鬼道手牌／装备改判保留显式确认，使用现有短横屏安全区布局。发现并修复原改判确认未路由到 judgment 响应的缺口；闻仲也适用。修复疾行在判定／摸牌前被转伤致死导致流程停住；下一存活者正常开始回合。

## 复验

- `npm run test:fengshen`：原规则＋新增军争测试，包括完整角色AI局、每个响应的恢复和实体牌守恒。
- `npm run test:fengshen:online`：真实本机WebSocket，加显式牌堆配置及每座位私密视图验证。
- `FENGSHEN_PORT=4186 node scripts/fengshen-preview.mjs --qa`，另运行 `node scripts/test-fengshen-military-browser.mjs`：独立Chromium、844×390／932×430／390×844触摸选择和确认。QA不发布。

模拟完成不是胜率平衡结论，也不是实际iPhone Safari或双手机验收。待真机验收横竖屏、前后台恢复、触摸取牌及真实好友联机。
