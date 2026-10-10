# 众神斗法 · 免费单机试玩

## 当前规则：经典原版标准 25 人

每个人物绑定一位完整参考武将，保留整套技能、基础体力、性别和机械阵营，不混用界／谋／OL加强版本。对应表见 [CANONICAL_MAPPING.md](CANONICAL_MAPPING.md)，规则与验收边界见 [CLASSIC_ACCEPTANCE.md](CLASSIC_ACCEPTANCE.md)。

本批 54 人形象图鉴，标准 25 人进入将池。风／火／林／山及一将成名仍为后续候选，不以图片或元数据存在冒充技能完成。完整目标目录 64 人，但没有素材或完整技能的人物不能选取。

- 姬发＝刘备：仁德＋激将。
- 帝辛＝曹操：奸雄＋护驾。
- 金灵圣母＝黄月英：集智＋奇才。
- 伊西斯＝孙尚香：结姻＋枭姬，没有仁德或集智。
- 姜子牙＝诸葛亮；闻仲＝司马懿；玉鼎真人＝郭嘉；云霄＝大乔；妲己＝貂蝉。

机械同盟按原武将决定：蜀／青盟、魏／赤盟、吴／金盟、群／玄盟。神话势力仅用于人物背景。单技能复用按原版保留（例如后续马超与庞德都有马术），禁止的是随意拼接、删减完整技能组。

牌堆为经典标准 108 张实体牌、32 类插画卡牌，花色点数及数量保持不变。7 类扩展牌素材和实验机制保留，但不进入正式标准牌堆。此前“43人混搭＋121牌池”的草案已经被本版取代，不能作为最新发布信息。

## 单机玩法与操作

身份局支持五人、八人：先随机身份，主公先选，再给其他角色发独立候选。其他身份在阵亡或终局公开，自己始终可以查看身份。

1v1／2v2／3v3 是本项目的简化队伍对抗，不冒称官方竞技模式：队伍公开、席位交替，全员先选将，之后掷骰定先手，按席位顺序轮转。没有身份主公加血、主公技或身份击杀奖惩。

手机支持横竖屏、叠牌及手牌横向滑动。判定中央翻牌后继续；推演牌序只对本人可见，改判使用手牌；转移攻击的范围按弃牌后装备计算；受伤分牌只能分配本次新得到的牌。没有响应资源时自动继续，有可用响应时允许选择。

正收益摸牌／收牌技能自动发动；裸衣、突袭、洛神等存在取舍的技能保留选择，分配牌与选择目标仍需操作。60秒超时进入AI托管，可随时接管。AI只接收玩家视图，不读取隐藏手牌、身份或牌堆。

## 存档

新版使用独立存档键 `vectorac.fengshen.classic-original.save.v2`。旧混搭存档 `vectorac.fengshen.internal.save.v1` 原样保留，不删除、不覆盖，也不把旧技能强行迁入新规则。大厅显示旧存档保留提示；新版须新开局。刷新新版可恢复已锁定身份、候选、选将与结算窗口。

## 本机验收

```bash
npm run test:fengshen
node scripts/validate-fengshen-roster.mjs --check
FENGSHEN_PORT=4192 node scripts/fengshen-preview.mjs --qa
```

QA页面只监听本机，不发布。包含孙尚香、推演、转移攻击、受伤分牌、双男性决斗、公开判定、30手牌和手机布局场景。规则测试、浏览器模拟与真实手机验收是不同层次；构建通过不等于实体iPhone通过。

## 全站发布

用户授权完成后提交全部已完成工作区并发布官网；旧“三国·逐鹿”确认移除。必须先完成检查与当前完整工作区构建，不同步旧public草稿：

```bash
npm run test:fengshen
node scripts/validate-fengshen-roster.mjs --check
npm run build
rsync -rtn --itemize-changes --exclude=.DS_Store public/ root@jane66.com:/home/www/vectorac/dist/
rsync -rt --exclude=.DS_Store public/ root@jane66.com:/home/www/vectorac/dist/
```

最终地址：[众神斗法](https://vectorac.com/games/fengshen/)。发布根目录为 `/home/www/vectorac/dist/`，不需要传到/tmp。不加 `--delete`，不在2C2G服务器跑npm或编译Node原生依赖。保留服务器数据、密钥、固件及其他业务。

GitHub提交不等于官网部署。postbuild生成内容哈希JS/CSS，发布后核对在线HTML引用、JS/CSS哈希、人物、男女声音频、字体及小游戏入口。发布校验失败应阻止输出，不降级为仅警告。

运行素材按白名单复制；不上传 `.private` 源目录、文档、QA、生成提示词、音频清单、.env或数据库。试玩页保留noindex。这个免费原型不代表商业发行或知识产权审查已完成。

## 素材记录

原创人物与物品由内置image_gen生成，记录在 `assets/expansion-art-manifest.json`、`assets/classic-art-manifest.json`。新土行孙、石矶形象已制作独立立绘及缩略图。卡牌报音使用免费Edge TTS：男声Yunxi、女声Xiaoxiao；当前72条卡牌／技能名称，共144个运行引用MP3。生成脚本只发送名称，不发送项目代码、密钥或存档。字体许可随运行字体发布。
