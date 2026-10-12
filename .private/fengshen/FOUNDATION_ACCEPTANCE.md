# 2026-10-12 基础英雄完整补齐

当前可玩名单：基础57人（标准25、风8、火8、林8、山8）＋其他扩展7人，共64人。新增罗宣（董卓）、南极仙翁（刘禅）、杨任（姜维）、张奎（张郃）、惧留孙（邓艾）、殷郊（孙策）、老子（张昭张纮）。所有角色绑定一套完整原版技能，不拼接不同参考将。

规则与事件分别实现于 `foundation-roster.mjs`、`core/foundation-skills.mjs`；客户端与联机服务继续共享同一个引擎。主公技能仍按身份与机械阵营判断，队伍对抗不启用主公技能。觉醒持久化、上限变动、公开仙田、额外回合的原顺序返回均纳入存档恢复。

原版规则核对：[林包规则文本](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/ThicketPackage.lua)、[山包规则文本](https://github.com/Mogara/QSanguosha-v2/blob/master/lang/zh_CN/Package/MountainPackage.lua)。按原版享乐额外基本牌、肉林连续双闪、放权结束阶段付费、屯田最终判定、凿险／志继／魂姿准备阶段觉醒、制霸未赢时收回两张拼点牌、固政弃牌阶段手牌返还等核对，未引入界限突破改版。

专项测试 `scripts/test-fengshen-foundation.mjs` 覆盖22项结果断言，包括成本合法性、发动时机、连续响应、额外回合（含翻面跳过）、觉醒技能立即可用、判定区域失牌不触发仙田、仙田参与距离与实体牌守恒、多目标选择、拼点归属及每个交互步骤的存档恢复。原有全角色身份、队伍、军争AI回归继续执行，AI只使用本人视图与公共信息。

浏览器验证由 `scripts/test-fengshen-foundation-browser.mjs` 实际触摸传宝、两目标地变、仙田选择／夺域、授道付费及64人图鉴，覆盖844×390、390×844、667×375。浏览器模拟与实体手机验收分开记录。

7张立绘通过内置 imagegen 独立生成，已逐张检查并保存为原图与缩略图；实际提示词、源文件、最终项目路径在 `assets/foundation-art-manifest.json`。新增18条技能名称男女声报音全部生成，沿用原音色，当前共318个运行MP3。

删除的停用文件为 `assets/cards/fireattack.svg`、`hualiu.svg`、`supplyshortage.svg`，随后缚神索也重制为 JPG 并删除 `ironchain.svg`；四个旧文件均可通过 Git 恢复。构建会移除历史 SVG 产物，发布时单独移出线上公开目录；不使用全站 rsync 删除。

发布前执行完整工作区构建和规则／联机回归。发布后比较线上入口JS/CSS及运行素材SHA-256，确认旧SVG不再公开，并检查服务端规则目录已同步64人。
