# Vectorac 网站仓库

网站源码统一在 `site/`，后台服务在 `services/`，开发文档在 `dev/`，构建与测试工具在 `scripts/`。官网首页源文件为 `site/README.md`。

开发前阅读 [开发规范](dev/DEVELOPMENT.md) 与 [目录说明](dev/DIRECTORY_LAYOUT.md)。

```sh
npm run dev
npm run build
```

正式网站输出为 `build/site/`，发布目标仍为 `/home/www/vectorac/dist/`。内部预览、缓存和测试产物按开发规范及时清理；发布包与回滚备份合计最多保留最近 3 份。

服务说明：[联机游戏](services/mahjong/README.md)、[短链](services/shorturl/README.md)、[用户与设备管理](services/usermgr/README.md)。部署流程见 [dev/deploy.md](dev/deploy.md)。
