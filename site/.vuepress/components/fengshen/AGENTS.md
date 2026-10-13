# 众神斗法开发规则

任何本目录代码、卡牌、角色、美术、布局、动画修改，先完整阅读 [DEVELOPMENT.md](../../../../dev/games/fengshen/DEVELOPMENT.md)，遵守字体覆盖、共用卡面、手机兼容和发布验收门槛。

新增或修改牌名必须补齐内嵌字库；不得让缺字回退系统字体。所有卡面复用 `presentation.mjs:cardFace()`。完成前运行 `npm run test:fengshen:ui` 并检查截图；不得将规则测试或构建成功表述为真机 UI 验收完成。
