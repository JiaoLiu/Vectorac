# 全部已有形象：54名完整上架

本文件为内部实现与证据，不发布到官网静态目录。范围按实际图片目录核对：54张独立立绘、54名目录角色，全部进入选将池。64人规划目录中其余10名没有形象，本次不把他们伪装为已完成。

新增申公豹、龙吉公主、通天教主、女娲、伏羲、宙斯、雅典娜、波塞冬、阿尔忒弥斯、阿波罗、奥丁、洛基、阿努比斯、拉、芭丝特、天照、须佐之男、月读、邓婵玉、韦护、琼霄、碧霄共22名。完整整套技能、体力、性别和机械阵营由canonical-roster和complete-roster绑定，不再从已有技能随意混搭。

## 固定旧版，不能混入修订技能

- 妖言采用旧于吉：可多次声明，所有体力大于0的其他角色可质疑；公开后真则质疑者失体力，假则质疑者摸牌。有人质疑后只有真实红桃仍生效。不是新版每回合一次、缠怨或单人质疑停止规则。
- 雅典娜采用旧王异：自己的判定可用牌顶替换；准备／结束阶段秘计判黑后，将整批私有牌交给一人。不是失体力取消他人用牌，也不是新版摸任意手牌分配。
- 芭丝特采用旧伤逝，不设后来至多两张上限。绝情改为无来源的失体力，不触发伤害类技能、防具伤害修正、连环或击杀赏罚；仍处理扣血声效、救援与死亡。
- 韦护采用旧不屈：保留零或负体力，公开护道牌需要点数不重复。不是新不屈回到1血／手牌上限奖励，也没有奋激。回血移走多余牌的选择先于再次救援判断。
- 琼霄采用旧惴恐／求援：拼点赢跳过出牌阶段；求援交任意手牌，非闪则追加该角色为杀目标。不套用新版目标限制与仅交闪规则。
- 阿尔忒弥斯按原版SP关银屏，血祭、虎啸、武继完整实现；觉醒加上限、回1血、失去虎啸，不附加后来的取得武器等效果。
- 巨象只取得他人使用的真实、非技能转化的群攻实体牌。行殇只拿手牌／装备；安恤和求援的取牌明示，其余私有赠牌日志不公开牌面。

## 现有108牌不变

新增焚天焰、缚神索和琼浆三种技能虚拟牌定义，供火计、连环、酒诗等使用，也可作为妖言声明。不会插入实体牌堆，所有旧c0至c107身份、花色、点数、物品属性保持不变。缚神索可由连环重铸，但不能以妖言重铸。

火攻、连环有独立代码矢量插画，琼浆使用已有原创酒器插画。卡面沿用大标题／下方插图的统一设计。所有127种报音名称有男女两份，共254个运行引用音频。没有复制原游戏美术、语音或整段文案。

## 共用事件接口

新增处理在core/complete-skills，仍由dispatch原子执行，选择错误返回旧状态。拼点／翻牌在中央牌桌显示；私有秘计包只给所有者视图。多选成本、对象及确认由extension-actions/table接入手牌／人物与已有安全区布局，不额外引入整屏说明框。

原版联动包括：红颜有效花色、鬼才／贞烈换判、颂威、无源扣血、濒死限定自救与补益、不屈重复与移牌、断肠失去借用技能、群攻来源替换、群攻牌收取、火／雷连环、拼点同点算未赢、天义与方天的目标叠加、命令杀时的武器成本范围与妖言质疑、回合临时效果清理。AI只读playerView及公开规则；公开说谎记录可影响质疑，不加给玩家的发动次数限制。

## 规则核对来源

- [风包](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/WindPackage.lua)与[怀旧包](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/NostalgiaPackage.lua)：采用对应旧版段落，拒绝同文件里的修订版差异。
- [火包](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/FirePackage.lua)、[林包](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/ThicketPackage.lua)、[山包](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/MountainPackage.lua)。
- [一将成名](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/YJCMPackage.lua)、[2012](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/YJCM2012Package.lua)、[2013](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/YJCM2013Package.lua)、[原版SP](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/SPPackage.lua)。

开源规则文本与事件实现用于版本核对，本项目独立实现，玩家页面不显示参考名或开发比较标签。此免费单机原型不表示已经通过商业发行审查。

## 验收层次

- 原有全部回归与test-fengshen-complete：逐技能成本／时机、拒绝非法动作、牌守恒、每步存档、牌面隐私、身份与队伍AI终止；另有大量随机对局回归。
- test-fengshen-complete-dom：离线JSDOM加载真实客户端点击处理器，验证多选成本、拼点确认、自己的装备交换、天香成本、选项切换、图鉴返回、身份标记与54人图鉴。不是浏览器渲染或真实手机测试。测试依赖临时独立安装，不修改项目锁文件。
- 构建与线上文件哈希、状态、图片／报音／矢量资源核对另行执行。浏览器工具持续超时，所以不能把CSS预算或DOM点击通过冒充真实iPhone Safari视觉／触摸验收。
