# 仓库目录与源码入口

2026-10-13 已执行目录迁移。网站源码只有 `site/` 一处；后端、开发文档与构建产物分别归档。迁移不改变官网 URL、接口路径及服务器安装目录。

```text
Vectorac/
├── site/                         # 唯一网站源码目录
│   ├── README.md                 # VuePress 首页
│   ├── blogs/                    # 页面与文章
│   ├── docs/                     # 官网公开文档
│   └── .vuepress/
│       ├── config.js             # 框架配置
│       ├── components/           # 组件与各游戏源码，含 fengshen
│       ├── public/               # 正式静态资源源文件
│       ├── plugins/
│       ├── styles/
│       └── templates/
├── services/
│   ├── mahjong/                  # 全部联机游戏共用服务
│   ├── shorturl/                 # 短链服务
│   ├── usermgr/                  # 用户与设备管理
│   └── face/                     # 人脸演示服务
├── dev/                          # 内部文档，不生成官网页面
│   ├── DEVELOPMENT.md
│   ├── DIRECTORY_LAYOUT.md
│   ├── deploy.md
│   ├── flasher.md
│   └── games/                    # 模块规范与验收记录
├── scripts/                      # 构建、测试、素材工具与必要夹具
├── build/                        # 生成产物，Git 忽略
│   ├── site/                     # 正式网站构建
│   ├── preview/                  # 内部预览和 QA 构建
│   ├── packages/                 # 本地服务包
│   └── cache/                    # 构建临时文件，构建后清理
├── .github/workflows/            # 平台约定路径
├── AGENTS.md                     # 开发规则入口
├── README.md                     # 仓库说明，不是官网首页
├── package.json
└── package-lock.json
```

## 唯一维护入口

- 官网顶部搜索只索引 `blogs/other` 与 `blogs/timeline` 的公开博客标题、章节；`dev/`、服务说明、首页、联系页及分类/标签页不参与搜索。构建源文件采用明确白名单，内部文档不能因为改目录而进入官网。
- 页面及首页：`site/blogs/`、`site/docs/`、`site/README.md`。网站仍使用 `/blogs/...`、`/docs/...` 及原游戏 URL，不能将本地的 `site/` 前缀加到公开网址。
- 游戏规则、UI 与 AI：`site/.vuepress/components/<game>/`。众神斗法也归入 `fengshen/`，其正式独立入口由构建脚本生成到 `build/site/games/fengshen/`。
- 联机服务的 `services/mahjong/engine/` 保留薄转发层，引用上述同一份规则；打包时生成自包含的服务代码，不能另维护第二套规则。
- 正式素材：`site/.vuepress/public/` 及众神斗法模块的 `assets/`；生成 Worker 的源入口是 `site/.vuepress/components/slime-rebuild.worker.js`，哈希脚本及 URL 模块由构建工具生成。
- 人脸服务以 `services/face/` 为仓库维护入口。服务器运行实例与仓库差异须在发布时核对，不再建立另一份本地源码副本。
- 内部开发、部署和验收文档统一在 `dev/`。原 `.trae/documents/` 的说明已迁入 `dev/games/`；原 `.private/` 不再存放业务源码。按需生成的本地秘密配置仍须忽略，不放进网站素材目录。
- `build/`、各服务依赖、测试输出均不是另一套源码。禁止直接修改构建输出修复功能，禁止用软链接或复制旧目录维持两份维护入口。

`.github/` 是 GitHub 工作流识别的目录，`.vuepress/` 是当前 VuePress 的配置、组件和静态资源约定目录；后者已收进 `site/`，无需再改其名称。

## 构建、测试与发布路径

在仓库根目录运行：

```sh
npm run dev
npm run build
npm run test:fengshen
npm run test:fengshen:ui
npm run test:fengshen:online
```

- 正式输出：`build/site/`；首页为 `build/site/index.html`。
- 众神斗法内部预览：`node scripts/fengshen-preview.mjs`；QA 增加 `--qa`，仅本地监听。输出分别为 `build/preview/fengshen/`、`build/preview/fengshen-qa/`。
- 本地服务命令从 `services/mahjong/`、`services/shorturl/` 或 `services/usermgr/` 执行；每个服务保留独立依赖与运行配置。
- 本地服务包放在 `build/packages/`；归档内仍保留 `mahjong-service/`、`shorturl-service/`、`usermgr-service/` 等部署目录名，与既有安装脚本兼容。
- 用户服务的 Linux 原生依赖包仍走 `.github/workflows/build-usermgr-linux.yml`；本地 macOS 构建不能替代 Linux CI 包验证。
- 官网发布同步源改为 `build/site/`，服务器目标仍是 `/home/www/vectorac/dist/`。服务端安装路径、nginx 与 systemd 名称保持既有约定，详见 [deploy.md](deploy.md) 及各服务 README。

完成后按 [DEVELOPMENT.md](DEVELOPMENT.md) 清理本次临时文件与进程。迁移验证记录见 [MIGRATION_ACCEPTANCE.md](MIGRATION_ACCEPTANCE.md)。
