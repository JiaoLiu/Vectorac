# Vectorac 联机麻将服务（好友房）

四川麻将「血战到底」好友房的服务器权威后端：房间管理 + WebSocket 实时同步 + 规则裁决。

- **服务器权威**：所有碰/杠/胡/番数由服务端引擎裁决（`engine/` 与前端同一份规则，打包时覆盖进来），前端只渲染快照
- **零外部依赖**：不需要 MySQL / Redis / 消息队列，房间全在内存里
- **只监听 127.0.0.1**，对外由 nginx 反代到 `vectorac.com` 同源路径，前端不需要区分环境
- **掉线自动重连 + AI 托管**：真人断线后座位不会丢，重连拿回原座位
- **多局连打**：每局打完回等待室，每人 100 分跨局累计，任一家 ≤ 0 判破产并结束房间
- 打包自带 `node_modules`（`express` / `ws` / `dotenv` 全是纯 JS），服务器**不需要 `npm install`**

## 目录结构

```
mahjong-service/
├── server.js            # Express + ws 入口：房间 API + WebSocket 升级 + 健康检查
├── config.js            # 配置读取（全部走环境变量，默认值在此，禁止写死业务代码）
├── errors.js            # 错误码
├── rooms/
│   ├── room-manager.js  # 房间注册表：创建 / 查找 / 过期清理
│   ├── room.js          # 房间：座位、局号、跨局累计积分、ready、破产判定
│   ├── seat.js          # 座位：昵称、resumeToken、ready、AI 标记
│   ├── game-session.js  # 一局牌局：包住引擎，推快照 / 收动作
│   ├── action-window.js # 响应窗口（胡并行 / 杠碰串行）的截止时间管理
│   ├── ai-jobs.js       # AI 托管任务（并发上限 + 决策超时）
│   ├── room-queue.js    # 动作串行化队列（同一房间动作顺序执行）
│   ├── hub.js           # WebSocket 广播 / 单播
│   ├── sessions.js      # 连接会话与座位绑定
│   └── serializer.js    # 按视角序列化快照（看不到别人的手牌）
├── engine/              # 规则引擎薄转发层（打包时被真实引擎覆盖，见 scripts/bundle.sh）
├── scripts/
│   ├── bundle.sh        # 本地打包（含 node_modules + 真实引擎）
│   ├── install.sh       # 服务器一键安装/升级 + 写 systemd unit
│   ├── mahjong.service  # systemd 模板（占位符由 install.sh 替换）
│   └── mahjong-proxy.conf  # nginx location 片段（主 server 块里以 include 引用）
├── test.js              # 端到端测试（不依赖网络监听）
└── package.json
```

## 启动（本地开发）

```bash
cd mahjong-service
npm install     # express + ws + dotenv
npm start
# → 监听 http://127.0.0.1:3032
```

官网页面在 `blogs/other/mahjong_game.md`（路由 `/blogs/other/mahjong_game.html`）。
本地前后端联调：仓库根目录 `npm run dev` 起 VuePress，`.vuepress/config.js` 的 `devServer.proxy`
已把 `/api/rooms`、`/api/game-stats`、`/mahjong-ws` 反代到 `127.0.0.1:3032`，前端无需改配置。

```bash
curl http://127.0.0.1:3032/api/health
```

## 环境变量

全部可选，`install.sh` 会写进 `.env`（权限 600，不入库）。**已有值不会被覆盖**，只补缺失字段。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3032` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址（只监听本地，对外靠 nginx） |
| `WS_PATH` | `/mahjong-ws` | WebSocket 路径，需与 nginx `location` 一致 |
| `ADMIN_TOKEN` | 空 | 统计接口 `/api/game-stats` 的 `X-Admin-Token`；为空则该接口直接拒绝 |
| `MAX_ROOMS` | `20` | 全服活跃房间上限 |
| `START_SCORE` | `100` | 每人起始积分（跨局累计，与单机一致） |
| `TURN_TIMEOUT_SECONDS` | `30` | 摸打 / 响应窗口默认思考时长（秒）；房间可在等待室覆盖 |
| `VOID_TIMEOUT_SECONDS` | `20` | 定缺 / 换三张并行窗口时长（秒，固定不随房间变） |
| `MIN_ROOM_TURN_TIMEOUT_SECONDS` | `10` | 房主可设思考时长下限（秒） |
| `MAX_ROOM_TURN_TIMEOUT_SECONDS` | `600` | 房主可设思考时长上限（秒） |
| `DISCONNECTED_AI_DELAY_MS` | `1500` | 真人断线后多久交给 AI 托管（毫秒） |
| `WAITING_ROOM_TTL_MINUTES` | `30` | 等待室空置回收（分钟） |
| `WAITING_DISCONNECTED_TTL_MINUTES` | `10` | 等待室全员掉线回收（分钟） |
| `FINISHED_ROOM_TTL_MINUTES` | `10` | 已结束房间保留（分钟，供结算页查看战绩） |
| `SWEEP_INTERVAL_SECONDS` | `30` | 过期房间扫描间隔（秒） |
| `AI_MAX_CONCURRENCY` | `2` | AI 决策并发上限 |
| `AI_DECISION_TIMEOUT_MS` | `3000` | 单次 AI 决策超时（毫秒，超时用兜底动作） |
| `AI_LEVEL` | `normal` | AI 托管难度 |
| `LOG_LEVEL` | `info` | 日志级别（JSON 结构化输出） |
| `PROCESSED_REQUEST_ID_LIMIT` | `512` | 每房间幂等表保留的 requestId 数量 |

## 部署到 vectorac.com

**安装目录固定为 `/home/www/vectorac/mahjong-service`（与官网 `dist/` 平级）**，
上传中转目录用 `/home/www/vectorac/.deploy`（持久目录，**不要用 `/tmp`**）。

### 一键部署（首次 / 升级同一套流程）

**1. 本地：打包（含 node_modules，免 npm install）**

```bash
cd mahjong-service
bash scripts/bundle.sh
# 产物：dist/mahjong-service-YYYYMMDD-HHmm.tar.gz（约 1MB）
```

**2. 上传到官网同级的中转目录**

```bash
ssh root@jane66.com 'mkdir -p /home/www/vectorac/.deploy'
scp dist/mahjong-service-20260918-2130.tar.gz root@jane66.com:/home/www/vectorac/.deploy/
```

**3. 服务器：解压 + 一键安装**

```bash
ssh root@jane66.com

cd /home/www/vectorac/.deploy
rm -rf mahjong-service
tar -xzf mahjong-service-20260918-2130.tar.gz     # 解出 .deploy/mahjong-service/

cd mahjong-service
sudo ADMIN_TOKEN=$(openssl rand -hex 16) bash scripts/install.sh
```

> `tar -xzf mahjong-service-*.tar.gz` 在中转目录里有多份 tarball 时会报「匹配到多个文件」，
> 所以上面写死了版本号；懒一点可以 `tar -xzf "$(ls -t mahjong-service-*.tar.gz | head -1)"`。

`install.sh` 会：
- 把代码同步到 `/home/www/vectorac/mahjong-service/`（`INSTALL_DIR` env 可改），
  `rsync --delete` 但**排除 `.env` / `dist/` / `scripts/bundle.sh`** —— 生产配置不会被覆盖
- 写 `.env`（缺失字段才补，权限 600）
- 自动用 `/home/www/vectorac` 的所有者当运行用户（一般是 `www-data`）
- 装 `/etc/systemd/system/mahjong.service`（`Restart=on-failure`，崩了自动拉起，开机自启）
- `systemctl restart mahjong` 并自检端口监听 + `/api/health`
- 幂等：**升级就是重复上面 1→2→3，不需要先停服务**

`ADMIN_TOKEN` 只在首次写进 `.env` 时生效，升级时传不传都不影响已有值。忘了令牌这样看：

```bash
sudo grep '^ADMIN_TOKEN=' /home/www/vectorac/mahjong-service/.env
```

### nginx：把三个路径反代到 3032

**麻将服务的 `location` 块必须写在 `vectorac.com` 主 `server { }` 里**，
不能像短链那样丢到 `conf.d/` 独立文件 —— `location` 指令不允许出现在 `server` 块之外，
直接放 `conf.d/` 会报 `location directive is not allowed here`。

推荐做法：主配置里只加**一行 `include`**，反代规则留在服务安装目录
（`scripts/mahjong-proxy.conf`）。以后调整反代只改这一个文件，升级覆盖服务时它也跟着
tarball 更新，不用再碰主配置：

```nginx
# /etc/nginx/conf.d/vectorac.conf，写在 vectorac.com 的 server { } 内（443/ssl 那个块）
include /home/www/vectorac/mahjong-service/scripts/mahjong-proxy.conf;
```

`mahjong-proxy.conf` 里是三段 location：

| location | 用途 |
| --- | --- |
| `location /api/rooms` | 房间列表 / 创建 / 加入（HTTP） |
| `location = /api/game-stats` | 后台统计（HTTP，需 `X-Admin-Token`） |
| `location = /mahjong-ws` | 房间实时同步（WebSocket，含 `Upgrade` / `Connection` 头 + 600s 超时） |

懒得手动定位 server 块，就跑下面这段「插入 + 校验」脚本。它会先备份，再把 include 插进
`server_name` 含 `vectorac.com` 且带 443/ssl 的那个块，`nginx -t` 通过才 reload；
**幂等，重跑不会重复插入**（已经插过就直接跳过）：

```bash
sudo cp -a /etc/nginx/conf.d/vectorac.conf /etc/nginx/conf.d/vectorac.conf.bak-$(date +%Y%m%d-%H%M%S)

sudo python3 - <<'PY'
import re, sys
p = '/etc/nginx/conf.d/vectorac.conf'
src = open(p, encoding='utf-8').read()
inc = '    include /home/www/vectorac/mahjong-service/scripts/mahjong-proxy.conf;\n'
if 'mahjong-proxy.conf' in src:
    print('已包含 mahjong-proxy.conf，无需改动'); sys.exit(0)
# 按大括号配对切出所有 server { } 块
blocks = []
for m in re.finditer(r'\bserver\s*\{', src):
    ob, depth = m.end() - 1, 0
    for j in range(ob, len(src)):
        if src[j] == '{': depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0:
                blocks.append((ob, j, src[ob:j])); break
cands = [(2 if ('ssl_certificate' in b or re.search(r'listen[^;]*443', b)) else 1, ob, be, b)
         for ob, be, b in blocks if 'vectorac.com' in b]
if not cands:
    print('没找到 server_name 含 vectorac.com 的块，请手动处理'); sys.exit(1)
cands.sort(key=lambda x: -x[0])
score, ob, be, body = cands[0]
m = re.search(r'\n[ \t]*location\b', body)
pos = ob + m.start() + 1 if m else ob + 1
open(p, 'w', encoding='utf-8').write(src[:pos] + inc + src[pos:])
print('候选 %d 个，已插入到 %s 的 server 块内' % (len(cands), '443/ssl 块' if score == 2 else '首个匹配块'))
PY

sudo nginx -t && sudo systemctl reload nginx
```

> 要看到「已插入到 **443/ssl 块**」才对 —— 80 端口的 server 块只管跳 HTTPS，
> 插到那里公网仍然连不上。用 `include` 不违反上面那条限制：三段 `location` 依旧处在
> `server` 块作用域内。

> 用官网同源路径（`https://vectorac.com/api/rooms`、`wss://vectorac.com/mahjong-ws`），
> 前端代码不需要区分开发/生产，也不用改 DNS（`*.vectorac.com` 通配）。

### 验证

```bash
curl -s http://127.0.0.1:3032/api/health
curl -s https://vectorac.com/api/rooms | head -c 200        # 期望 JSON，不是 HTML
curl -s -H "X-Admin-Token: $(sudo grep '^ADMIN_TOKEN=' /home/www/vectorac/mahjong-service/.env | cut -d= -f2)" \
     https://vectorac.com/api/game-stats
sudo systemctl status mahjong | head -5

# WebSocket 握手：必须带 --http1.1（期望 101）
# curl 默认协商 HTTP/2，而 Upgrade 是 hop-by-hop 头、在 HTTP/2 里会被剥掉，
# 后端只会当成普通 GET 返回 404 —— 看着像没配好，其实是测试姿势问题
curl -s --http1.1 -o /dev/null -w '%{http_code}\n' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://vectorac.com/mahjong-ws
```

两个容易被误判成故障的现象：

- 只测 `http://`（80 端口）会拿到 `301 Moved Permanently` —— 那是跳 HTTPS 的正常响应，
  不是配置错；用 `https://` 或 `curl -s -H 'Host: vectorac.com' http://127.0.0.1/api/rooms` 才准。
- `/api/game-stats` 不带 `X-Admin-Token` 返回 `403 application/json` 是**正常的**：
  这是应用层拒绝，说明反代已经通了（若反代没通会返回静态站的 `200 text/html`）。

浏览器打开 `https://vectorac.com/blogs/other/mahjong_game.html` → 「联机对战 · 好友房」→ 建房，
第二个浏览器窗口用邀请链接入座，两边都点「开始」验证 WS 心跳与同步。

### 升级与回滚

中转目录里保留历史 tarball 就是回滚点（约 1MB/份，建议留最近 3 份）：

```bash
# 升级（重复 打包 → 上传 → 解压 → install.sh）
# 回滚：解压旧 tarball 再跑一次 install.sh 即可（.env 不受影响）
cd /home/www/vectorac/.deploy
rm -rf mahjong-service && tar -xzf mahjong-service-20260901-1010.tar.gz
cd mahjong-service && sudo bash scripts/install.sh

# 清理旧包，只留最近 3 份
cd /home/www/vectorac/.deploy && ls -t mahjong-service-*.tar.gz | tail -n +4 | xargs -r rm -f
```

改动只涉及配置时不必重新打包：

```bash
sudo vim /home/www/vectorac/mahjong-service/.env
sudo systemctl restart mahjong
```

### 常用运维命令

```bash
sudo systemctl status mahjong      # 状态
sudo systemctl restart mahjong     # 重启
sudo systemctl stop mahjong        # 停止
sudo journalctl -u mahjong -f      # 实时日志（JSON 结构化）
sudo journalctl -u mahjong -n 200  # 最近 200 行
curl http://127.0.0.1:3032/api/health
```

### 部署后的目录结构

```
/home/www/vectorac/
├── dist/                     # 官网静态站（仓库 public/ rsync 过来）
├── mahjong-service/          # 联机麻将服务（install.sh 装的，与 dist/ 平级）
│   ├── server.js  config.js  errors.js
│   ├── engine/  rooms/  scripts/
│   ├── node_modules/         # tarball 自带，无需再 npm install
│   └── .env                  # PORT / ADMIN_TOKEN / 超时 / 容量（权限 600，备份这个）
└── .deploy/                  # 部署中转：上传的 tarball + 解压暂存（回滚点）
```

服务无持久化数据：房间全在内存，重启即清空（牌局数据本来也不跨重启）。唯一要备份的是 `.env`。

## 接口与协议

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查（`install.sh` 自检也用它） |
| `GET` | `/api/rooms` | 房间列表（只读：房号 / 人数 / 状态 / 房规） |
| `POST` | `/api/rooms` | 创建房间（可带房规：封顶番数、换三张、幺鸡赖子、AI 提示、思考时长） |
| `POST` | `/api/rooms/join` | 加入房间（拿 `resumeToken`，重连也用它） |
| `GET` | `/api/rooms/:roomCode` | 单房间详情 |
| `GET` | `/api/game-stats` | 后台统计，需 `X-Admin-Token`；令牌为空直接拒绝 |
| `WS` | `/mahjong-ws` | 房间实时同步（快照推送 + 动作提交，均为 JSON 消息） |

WebSocket 消息：客户端发 `JOIN / ACTION / TOGGLE_READY / UPDATE_RULES / ADD_AI / CHAT / PING`，
服务端推 `SNAPSHOT / EVENT / ERROR / PONG`。动作都带 `requestId`，服务端做幂等去重。

## 测试

```bash
cd mahjong-service
npm test          # node test.js
```

测试不依赖网络监听，直接驱动房间与引擎，覆盖：建/加房间、房号唯一性、重连令牌、
动作幂等、掉线 AI 托管、胡/杠/碰阶段仲裁、多局累计积分与破产、ready 自动开下一局、
规则选项透传、过期房间回收等。改动引擎或房间逻辑后**必须全量跑一遍**。

## 常见问题

**Q: 前端连不上（大厅一直加载 / WS 400）？**
A: 按顺序查：① `curl http://127.0.0.1:3032/api/health` 服务是否活着；② nginx 是否 reload 过、
`/mahjong-ws` 的 `Upgrade` / `Connection` 头有没有丢；③ `sudo journalctl -u mahjong -n 50` 看握手记录。

**Q: 牌局中途所有人都掉线了会怎样？**
A: 房间不会立刻销毁。真人断线 `DISCONNECTED_AI_DELAY_MS` 后由 AI 托管继续打，
全员掉线的等待室按 `WAITING_DISCONNECTED_TTL_MINUTES` 回收；重连带 `resumeToken` 即可拿回原座位。

**Q: 为什么服务器上不用 `npm install`？**
A: `bundle.sh` 已把生产依赖（`--omit=dev`）打进 tarball 的 `node_modules/`；三个依赖都是纯 JS，
无原生模块，跨机器直接复用。要换 Node 版本或加依赖时重新打包即可。

**Q: 改了规则（`engine/`）为什么线上没生效？**
A: `engine/*.js` 在仓库里是**薄转发层**（指向 `.vuepress/components/mahjong/`），
真正生效的是打包时被覆盖进去的真实引擎。所以改完必须重新 `bundle.sh` + 部署 + `install.sh` 重启，
只改仓库里的 `.vuepress/components/mahjong/engine.js` 对服务端无效。

**Q: 房主设置的思考时长为什么不是 30 秒？**
A: `.env` 里若已有 `TURN_TIMEOUT_SECONDS`，升级时 install.sh **不会覆盖**它。
改 `sudo vim .env` 后 `sudo systemctl restart mahjong`；房主在等待室也能按房覆盖（10~600 秒）。