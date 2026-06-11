# Vectorac 短链跳转 API 服务

基于 Node.js + Express + JSON 文件的轻量短链服务：

- **零外部依赖**（不需要 MySQL / Redis / MongoDB）
- **不动一行 nginx**（跑在独立端口，自带演示页 + API）
- **支持令牌鉴权 + 管理员视图**
- **内置 14 天点击趋势折线图 / Top 链接 / KPI 仪表板**
- **数据存 JSON 文件**，单文件可直接 `cp` 备份；演示量级（万级短链 / 十万级点击）足够

## 目录结构

```
shorturl-service/
├── server.js        # Express 入口：API + SSR 演示页 + 302 跳转
├── db.js            # JSON 文件持久化层（接口形态贴近 SQL，便于换 SQLite）
├── public/          # 前端静态资源（CSS / JS）
├── data/            # 运行期生成：shorturl.json
├── test.js          # 端到端测试（不依赖网络监听）
├── package.json
└── README.md
```

## 启动

```bash
cd shorturl-service
npm install     # express + write-file-atomic
npm start
# → [shorturl] listening on http://0.0.0.0:3030
```

打开浏览器访问 `http://<host>:3030/` 即可看到演示首页。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3030` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `SHORT_BASE_URL` | `http://localhost:<PORT>` | 短链对外前缀（生成/展示短链时使用） |
| `ADMIN_TOKEN` | `admin-demo-2026` | 管理员令牌（`/api/admin/*` 和 `/links` 管理页用） |

## 部署到 s.vectorac.com

### 一键部署（推荐）

整个流程就两步：本地打包 + 服务器一行命令。

**1. 本地：打包（含 node_modules，免 npm install）**

```bash
cd shorturl-service
bash scripts/bundle.sh
# 产物：dist/shorturl-service-20260611-1530.tar.gz（约 5MB）
scp dist/shorturl-service-*.tar.gz <user>@<server>:
```

**2. 服务器：一键安装 + 启停 + 写 systemd**

```bash
sudo SHORT_BASE_URL=https://s.vectorac.com \
     ADMIN_TOKEN=$(openssl rand -hex 16) \
     bash install.sh ~/shorturl-service-20260611-1530.tar.gz
```

`install.sh` 会：
- 解压到 `/home/www/vectorac/shorturl-service/`（跟 `dist/` 平级，**`INSTALL_DIR` env 可改**）
- 写 `.env`（PORT / HOST / SHORT_BASE_URL / ADMIN_TOKEN，权限 600）
- 自动用 `/home/www/vectorac` 的所有者当运行用户（一般是 `www-data`）
- 装 `/etc/systemd/system/shorturl.service`（`Restart=on-failure`，崩了自动拉起，开机自启）
- `systemctl restart shorturl`（立即启动）

> 你 DNS 是 `*.vectorac.com` 通配，**不用动 DNS**，nginx 那一段改完 `s.vectorac.com` 直接生效。

**3. nginx：把 `/s/` 和 `/api/` 反代到 3030**

最简单：直接当 conf.d 文件（你的 `nginx.conf` 默认会 `include /etc/nginx/conf.d/*.conf`）：

```bash
sudo cp /home/www/vectorac/shorturl-service/scripts/shorturl-proxy.conf /etc/nginx/conf.d/shorturl.conf
sudo nginx -t && sudo systemctl reload nginx
```

或者合并到现有 `vectorac.conf`：把 `shorturl-proxy.conf` 里两个 `location` 块拷进 `/etc/nginx/conf.d/vectorac.conf` 的 `server { }` 里。

跑通后短链形如 `https://s.vectorac.com/s/aB3xY7z`，302 跳到目标 URL。

### 完全不动 nginx（Cloudflare Tunnel）

```bash
cloudflared tunnel create shorturl
cloudflared tunnel route dns shorturl s.vectorac.com
cloudflared tunnel --url http://localhost:3030 run
```

### 升级

```bash
# 本地
bash scripts/bundle.sh
scp dist/shorturl-service-*.tar.gz <user>@<server>:

# 服务器（脚本幂等，会自动 stop 旧版本、起新版本；data/ 和 .env 不会被覆盖）
sudo bash install.sh ~/shorturl-service-*.tar.gz
```

### 常用运维命令

```bash
sudo systemctl status shorturl       # 状态
sudo systemctl restart shorturl      # 重启
sudo journalctl -u shorturl -f       # 实时日志
sudo journalctl -u shorturl -n 200   # 最近 200 行
sudo vim /home/www/vectorac/shorturl-service/.env  # 改配置
sudo systemctl restart shorturl
curl http://127.0.0.1:3030/healthz   # 健康检查
```

### 部署后的目录结构

```
/home/www/vectorac/
├── dist/                          # 静态官网（已有）
└── shorturl-service/              # 短链服务（install.sh 装的）
    ├── server.js  db.js  package.json
    ├── node_modules/              # 已装好，无需再 npm install
    ├── public/  views/  scripts/
    ├── data/                      # shorturl.json（备份这个）
    └── .env                       # PORT / SHORT_BASE_URL / ADMIN_TOKEN（权限 600）
```

数据文件就一个：`/home/www/vectorac/shorturl-service/data/shorturl.json`，`cp` 即备份。

### 关于 `SHORT_BASE_URL`

`SHORT_BASE_URL` 决定了「用户在演示页 / API 拿到的短链前缀」长什么样：

| 场景 | 建议值 |
| --- | --- |
| 本地开发 | `http://localhost:3030`（默认） |
| 线上公网 (`s.vectorac.com`) | `https://s.vectorac.com` |
| Cloudflare Tunnel | `https://s.vectorac.com`（外部访问域名） |

改完必须 `sudo systemctl restart shorturl` 才生效。旧短链不受影响（短码存的是目标 URL，前缀只是展示）。



## API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/token/generate` | 申请演示令牌 |
| `POST` | `/api/links` | 创建短链（body 含 `token`） |
| `GET`  | `/api/links?token=...` | 列出某令牌下的所有短链 |
| `DELETE` | `/api/links/:code` | 删除某条短链（body 含 `token`） |
| `GET`  | `/api/stats/overview?token=...` | 统计概览：KPI + 14 天趋势 + Top 链接 |
| `GET`  | `/api/admin/links?token=ADMIN` | 管理员视图：列出所有短链 |
| `DELETE` | `/api/admin/links/:code` | 管理员删除 |
| `GET`  | `/s/:code` | **302 跳转 + 计数** |
| `GET`  | `/healthz` | 健康检查 |
| `GET`  | `/` `/create` `/links` `/stats` `/api-docs` | 演示页面（SSR） |

## 测试

```bash
node test.js
# → 11 个测试用例全部通过
```

测试不依赖网络监听，直接调用业务函数，覆盖：令牌生成、创建/复用、302、非法输入拒绝、统计、删除、管理员鉴权。

## 数据备份

```bash
cp data/shorturl.json data/shorturl.json.bak-$(date +%Y%m%d)
```

恢复：

```bash
cp data/shorturl.json.bak-20260610 data/shorturl.json
# 重启服务即可
```

## 升级到 SQLite / MySQL

只需替换 `db.js`，保持对外的函数签名（`insertToken / getToken / listLinksByToken ...`）。`server.js` 内部没有直接用 `db._state`，只用了暴露的函数和 `_state`（仅在统计时聚合），换库时同步调整即可。

## 常见问题

**Q: 短码会不会重复？**
A: 7 位、56 位字符集（去易混字符）有约 3 万亿组合。创建时先查表，已占用就重新随机一次；连续 5 次碰撞才报错（实际不会发生）。

**Q: 怎么防止别人乱创建？**
A: 演示版 `/api/token/generate` 是开放的（任何人能拿到令牌）。生产环境需要把这个接口替换成「发邮件 / 发短信」的人工流程，或在它前面套一个验证码/鉴权。

**Q: 演示令牌怎么清理？**
A: 直接编辑 `data/shorturl.json` 删 `tokens` 里的对象即可；服务会在下次写时落盘。

**Q: 数据量大了怎么办？**
A: 1 万条短链 + 50 万次点击的 JSON 文件大约 30MB，每次写都会 `write-file-atomic`，正常。再大就换 SQLite（接口兼容）。
