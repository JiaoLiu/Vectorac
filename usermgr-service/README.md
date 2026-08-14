# Vectorac 全产品设备管理平台

Vectorac 全产品统一的**产品/用户/设备/订单/服务期管理平台**。`xiaov` 是其中一个产品代码，不是管理平台本身。

## 功能
- **用户端（手机端）**：手机号注册登录、扫码绑定设备、续费下单、转账备注提交
- **管理端（PC）**：用户/设备/订单/产品配置/绑定关系 全 CRUD
- **火山 License 续期**：用户付款 → 自动延长服务期 → 管理员在火山控制台手动购买 License → 平台记录完成

## 路由

| 路径 | 用途 |
| --- | --- |
| `/admin/` | 全产品管理后台（PC 端 SPA） |
| `/admin/api/*` | 管理端 API（管理后台调用） |
| `/{product}/account/` | 指定产品用户端，例如 `/xiaov/account/` |
| `/{product}/api/*` | 指定产品用户/设备 API，例如 `/xiaov/api/*` |
| `/healthz` | 健康检查（nginx/systemd 用） |

## 文档目录

本服务的说明统一从本 README 进入：

- 本文件：平台架构、公开地址、构建、部署和运维
- [`docs/ESP32_API.md`](docs/ESP32_API.md)：ESP32、工厂烧录工具、HMAC 签名及完整设备 API

`usermgr-service/**` 已在 VuePress `patterns` 中整体排除，不会构建到 vectorac.com，也不会进入官网站内搜索。注意仓库本身是 Public，因此这些源文件仍可在 GitHub 被查看。

## 本地开发

```bash
npm install
node server.js          # 默认监听 :3031
node seed-mock.js       # 灌入演示数据（可选）
node test.js            # 跑全量回归测试（169+ 用例）
```

## 部署到服务器

跟 shorturl-service 一样用 tarball + `install.sh` 一键装（systemd 守护 + 崩溃自动拉起 + 开机自启）。

### 1. GitHub Actions 构建 Linux x64 部署包

在 GitHub 仓库进入 **Actions → Build usermgr Linux x64 package → Run workflow**。
完成后下载 Artifacts 中的 `usermgr-service-linux-x64-*`。GitHub 下载的是 zip，里面包含 `.tar.gz` 部署包；无需在 Mac 解压，直接把 zip 上传服务器。

工作流使用 Rocky Linux 8 + Node.js 22.22.0 构建并验证 Linux x64 原生模块。服务器不会运行 npm，也不会编译 SQLite。

### 2. 上传到服务器

```bash
cd ~/Downloads
scp usermgr-service-linux-x64-*.zip root@jane66.com:/home/www/vectorac/
```

上传前请确保 `~/Downloads` 里只保留本次 Artifact，避免通配符上传多个旧版本。

### 3. 服务器一键部署

```bash
ssh root@jane66.com
cd /home/www/vectorac
rm -rf usermgr-release
mkdir usermgr-release
unzip -j usermgr-service-linux-x64-*.zip -d usermgr-release
tar -xzf usermgr-release/usermgr-service-linux-x64-*.tar.gz -C usermgr-release
cd usermgr-release/usermgr-service
sudo PORT=3031 \
     JWT_SECRET=$(openssl rand -hex 32) \
     ADMIN_PASSWORD=$(openssl rand -hex 8) \
     KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32) \
     bash scripts/install.sh

# 确认服务正常后清理上传包和临时发布目录
cd /home/www/vectorac
curl http://127.0.0.1:3031/healthz
rm -rf usermgr-release
rm -f usermgr-service-linux-x64-*.zip
```

以上带三个随机密钥的命令只用于首次安装。升级时不能重新生成密钥，见下方“升级”。

环境变量说明：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PORT` | 否 | 监听端口，默认 3031 |
| `JWT_SECRET` | **是** | 用户 JWT 签名密钥 |
| `ADMIN_PASSWORD` | **是** | 管理后台登录密码 |
| `PROVISION_TOKEN` | 首次安装自动生成 | 工厂烧录工具调用 provision API 的专用令牌，禁止写入量产固件 |
| `KEY_ENCRYPTION_SECRET` | **是** | 设备 FactoryKey / 火山 Secret AES 加密密钥（**改了所有现存设备密钥失效**） |
| `ADMIN_IP_WHITELIST` | 否 | 管理后台 IP 白名单，逗号分隔。留空只靠密码 |
| `VOLCANO_ENABLED` | 否 | 是否启用火山集成，默认 false；产品密钥在管理平台的产品配置中填写 |
| `SMS_API_KEY` | 否 | 短信供应商配置占位；当前真实短信发送尚未实现，留空为开发模式 |

`install.sh` 做的事：
- 把文件复制到 `/home/www/vectorac/usermgr-service/`（`INSTALL_DIR` env 可改）
- 写 `.env`（权限 600）
- 自动检测 `/home/www/vectorac` 的所有者当运行用户（一般是 `www-data`）
- 使用部署包内由 GitHub Actions 构建的 Linux x64 依赖；服务器绝不运行 npm
- 装 `/etc/systemd/system/usermgr.service`（`Restart=on-failure`，崩了自动拉起）
- `systemctl enable usermgr`（开机自启）
- `systemctl restart usermgr`（立即启动）
- 校验 `/healthz`

### 4. nginx 反代

```bash
# 将下面文件中的 location 块合并到 vectorac.com 的现有 server { } 内：
sudo vim /home/www/vectorac/usermgr-service/scripts/usermgr-proxy.conf
sudo vim /etc/nginx/conf.d/vectorac.conf
sudo nginx -t && sudo systemctl reload nginx
```

不要把 `usermgr-proxy.conf` 直接复制成独立 conf；其中是 `location` 指令，必须位于现有 `server { }` 内。

反代公开地址：
- `https://vectorac.com/admin/` → 全产品管理平台
- `https://vectorac.com/admin/api/*` → 全局管理 API
- `https://vectorac.com/{product}/account/*` → 产品用户端
- `https://vectorac.com/{product}/api/*` → 产品用户/设备 API

### 5. 验证

```bash
curl http://127.0.0.1:3031/healthz     # 健康检查
curl http://服务器IP:3031/account/       # 用户端首页
curl http://服务器IP:3031/admin/         # 管理后台首页
```

### 6. 首次使用

1. 用上面 `ADMIN_PASSWORD` 登录 `http://服务器IP:3031/admin/`
2. 进「产品配置」→ 编辑 xiaov（自动创建的）→ 填入火山 InstanceID / ProductKey / ProductSecret / BotID
3. 烧录工具调用 `/admin/api/provision`（PROVISION_TOKEN 在 `.env`）录入设备
4. 用户扫码绑定设备、续费下单

小V RTC 固件不需要写死 RTCAppID。首次 `DynamicRegister` 后平台把 `Result.RTCAppID` 保存到产品的 `products.rtc_app_id`；旧设备缺少该字段时，下一次 `/activate` 自动补取一次并返回 `rtc_app_id`，设备保存到 NVS。该过程不重写 eFuse，也不重新绑定用户。

## 升级

```bash
# GitHub Actions 手动运行 Build usermgr Linux x64 package，下载 artifact
cd ~/Downloads
scp usermgr-service-linux-x64-*.zip root@jane66.com:/home/www/vectorac/

# 服务器：只保留一个本次 Artifact；重跑 install.sh 不覆盖 .env 和 data/
ssh root@jane66.com
cd /home/www/vectorac
rm -rf usermgr-release
mkdir usermgr-release
unzip -j usermgr-service-linux-x64-*.zip -d usermgr-release
tar -xzf usermgr-release/usermgr-service-linux-x64-*.tar.gz -C usermgr-release
cd usermgr-release/usermgr-service
PORT=3031 bash scripts/install.sh

# 验证并清理；正式目录是 /home/www/vectorac/usermgr-service
curl http://127.0.0.1:3031/healthz
systemctl status usermgr --no-pager
cd /home/www/vectorac
rm -rf usermgr-release
rm -f usermgr-service-linux-x64-*.zip
```

升级命令不会重新生成 `JWT_SECRET`、`ADMIN_PASSWORD`、`PROVISION_TOKEN` 或 `KEY_ENCRYPTION_SECRET`；安装脚本保留正式目录里的 `.env` 与 `data/`。

如果改了 `.env`：
```bash
sudo vim /home/www/vectorac/usermgr-service/.env
sudo systemctl restart usermgr
```

## 常用运维命令

```bash
sudo systemctl status usermgr        # 状态
sudo systemctl restart usermgr       # 重启
sudo journalctl -u usermgr -f        # 实时日志
sudo journalctl -u usermgr -n 200    # 最近 200 行日志
sudo vim /home/www/vectorac/usermgr-service/.env  # 改配置
curl http://127.0.0.1:3031/healthz   # 健康检查
```

## 目录结构（部署后）

```
/home/www/vectorac/
├── dist/                          # 静态官网（已有）
├── shorturl-service/              # 短链服务（已有）
└── usermgr-service/               # 用户/设备管理服务（本服务）
    ├── server.js  db.js  volcano.js
    ├── public/                    # SPA 前端
    │   ├── account/  (用户端)
    │   └── admin/    (管理后台)
    ├── node_modules/              # GitHub Actions 预构建的 Linux x64 依赖
    ├── scripts/                   # install.sh / bundle.sh / usermgr-proxy.conf
    ├── data/                      # SQLite 数据库（**备份这个**）
    └── .env                       # JWT_SECRET / ADMIN_PASSWORD / KEY_ENCRYPTION_SECRET

/etc/systemd/system/usermgr.service
```

## 配置备份清单

服务器上**必须定期备份**：
- `/home/www/vectorac/usermgr-service/data/usermgr.db` —— SQLite 数据库
- `/home/www/vectorac/usermgr-service/.env` —— 密钥配置

**绝对不能丢**：
- `KEY_ENCRYPTION_SECRET` —— 丢了所有现存设备 FactoryKey 全部失效，需要重新烧录
- `data/usermgr.db` —— 丢了所有用户/设备/订单数据全没

## 端口说明

默认 3031，host 监听 `127.0.0.1`（只本地，nginx 反代对外）。要改端口：
```bash
sudo PORT=3032 bash scripts/install.sh
```
同时改 nginx 配置里 `proxy_pass http://127.0.0.1:3031;` 为新端口。

## 测试

```bash
node test.js    # 全量回归测试 169+ 用例
```

测试会用内存 sqlite（不污染生产 db），覆盖：
- 用户注册/登录
- 设备 provision / verify / 绑定
- 续费订单（pending → paid → provider completed）
- 火山续期状态机
- 产品管理（创建/删除）
- 套餐管理

---

更新时间：2026-08-14
