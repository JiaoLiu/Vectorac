## 项目概述
这是一个基于 **VuePress 1.5.4** 构建的静态网站项目，使用了 **vuepress-theme-reco** 主题，主要用于展示成都向量加速科技有限公司的信息。

项目同时包含三个独立的 Node.js 后端服务：**短链跳转 API 服务**（`shorturl-service/`，为官网「产品 → 短链跳转」提供后端能力）、**设备管理服务**（`usermgr-service/`）和**联机麻将服务**（`mahjong-service/`，四川麻将好友房）。部署流程与官网静态站不同，详见 [短链服务部署](#短链服务部署一键) / [usermgr-service 部署](#usermgr-service-部署一键) / [联机麻将服务部署](#联机麻将服务部署一键) 章节。

## 运行方式

### 1. 安装依赖
首先需要安装项目依赖：
```bash
npm install
```

### 2. 开发模式
运行开发服务器，用于本地开发和预览：
```bash
npm run dev
```
- 会启动本地开发服务器，默认地址：`http://localhost:8080`
- 自动打开浏览器
- 支持热重载，修改文件后会自动刷新页面

### 3. 构建生产版本
生成可部署的静态文件：
```bash
npm run build
```
- 构建输出目录：`public/`（在 `.vuepress/config.js` 中配置）
- 生成的静态文件可以直接部署到任何静态网站托管服务

## 短链服务部署（一键）

短链服务 (`shorturl-service/`) 是独立 Node.js 进程，**不依赖 npm install 到服务器**，用打包好的 tarball + 一行 `install.sh` 部署，systemd 守护 + 崩溃自动拉起 + 开机自启。

### 1. 本地打包（含 node_modules）

```bash
cd shorturl-service
bash scripts/bundle.sh
# → dist/shorturl-service-20260611-1530.tar.gz
scp dist/shorturl-service-*.tar.gz <user>@<server>:
```

打包脚本做的事：
- 复制 `server.js` / `db.js` / `public` / `views` / `scripts` / `package.json` / `README.md`
- 运行 `npm install --omit=dev` 把生产依赖（express + write-file-atomic）装到 `node_modules/`
- 排除 `data/` `test.js` `.git` 等无关文件
- 整个产物约 5MB，**服务器无需 `npm install`**

### 2. 服务器部署

```bash
# 先解压 tarball
tar -xzf shorturl-service-*.tar.gz
cd shorturl-service

# 再运行安装脚本（一行命令，直接复制粘贴）
sudo SHORT_BASE_URL=https://s.vectorac.com ADMIN_TOKEN=$(openssl rand -hex 16) bash scripts/install.sh
```

`install.sh` 幂等可重跑，会：
- 把当前目录的文件复制到 `/home/www/vectorac/shorturl-service/`（跟静态站 `dist/` 平级；`INSTALL_DIR` env 可改）
- 写 `INSTALL_DIR/.env`（`PORT` `HOST` `SHORT_BASE_URL` `ADMIN_TOKEN`，权限 600）
- 自动用 `/home/www/vectorac` 的所有者当运行用户（一般是 `www-data`）
- 装 `/etc/systemd/system/shorturl.service`（`Restart=on-failure`，崩了自动拉起）
- `systemctl enable shorturl`（开机自启）
- `systemctl restart shorturl`（立即启动）
- 校验 `/healthz`、监听端口

### 3. nginx 反代（最少改动）

```bash
sudo cp /home/www/vectorac/shorturl-service/scripts/shorturl-proxy.conf /etc/nginx/conf.d/shorturl.conf
sudo nginx -t && sudo systemctl reload nginx
```

`nginx.conf` 默认 `include /etc/nginx/conf.d/*.conf`，所以新文件直接生效。

或者把 `shorturl-proxy.conf` 里的两个 `location` 块合并进 `/etc/nginx/conf.d/vectorac.conf` 的 `server { }` 里。

DNS 不用动（`*.vectorac.com` 通配已经覆盖 `s.vectorac.com`）。改完 nginx `s.vectorac.com/s/aB3xY7z` 直接能用。

> 端口说明：服务默认跑 `127.0.0.1:3030`（因为 3000 在服务器上被占）。如要改：`PORT=xxxx bash install.sh ...`，同时改 `shorturl-proxy.conf` 里的 `proxy_pass` 行。

### 4. 完全不动 nginx 的备选

```bash
# Cloudflare Tunnel（推荐，无需公网 IP）
cloudflared tunnel create shorturl
cloudflared tunnel route dns shorturl s.vectorac.com
cloudflared tunnel --url http://localhost:3030 run
```

### 5. 升级

```bash
# 本地
bash scripts/bundle.sh
scp dist/shorturl-service-*.tar.gz <user>@<server>:

# 服务器（解压后重跑 install.sh；数据文件不会被覆盖）
tar -xzf shorturl-service-*.tar.gz
cd shorturl-service
sudo SHORT_BASE_URL=https://s.vectorac.com \
     ADMIN_TOKEN=$(openssl rand -hex 16) \
     bash scripts/install.sh
```

### 6. 常用运维命令

```bash
sudo systemctl status shorturl       # 状态
sudo systemctl restart shorturl      # 重启
sudo journalctl -u shorturl -f       # 实时日志
sudo journalctl -u shorturl -n 200   # 最近 200 行日志
sudo vim /home/www/vectorac/shorturl-service/.env  # 改配置
sudo systemctl restart shorturl
curl http://127.0.0.1:3030/healthz   # 健康检查
```

### 7. 部署后目录结构（跟 dist/ 平级）

```
/home/www/vectorac/
├── dist/                          # 静态官网（已有）
└── shorturl-service/              # 短链服务（install.sh 装的）
    ├── server.js  db.js  package.json
    ├── node_modules/              # 已装好，无需再 npm install
    ├── public/  views/  scripts/
    ├── data/                      # shorturl.json（备份这个）
    └── .env                       # PORT / SHORT_BASE_URL / ADMIN_TOKEN

/etc/systemd/system/shorturl.service
```

### 8. 关于 `SHORT_BASE_URL`

`SHORT_BASE_URL` 决定了「用户在演示页 / API 拿到的短链前缀」长什么样：

| 场景 | 建议值 |
| --- | --- |
| 本地开发 | `http://localhost:3000`（默认） |
| 线上公网 (`s.vectorac.com`) | `https://s.vectorac.com` |
| Cloudflare Tunnel | `https://s.vectorac.com`（外部访问域名） |

改完之后必须 `sudo systemctl restart shorturl` 才生效。旧短链不受影响（短码存的是目标 URL，前缀只是展示）。

## usermgr-service 部署（一键）

设备端用户/设备/订单/服务期管理服务。完整文档见 `usermgr-service/README.md`，下面是最少步骤：

### 构建 Linux x64 部署包

在 GitHub Actions 手动运行 **Build usermgr Linux x64 package**，下载 artifact 并解压得到 `.tar.gz`。包内已经包含 Rocky Linux 8 / Node 22 的 Linux x64 依赖，服务器不运行 npm。

```bash
scp usermgr-service-linux-x64-*.tar.gz root@jane66.com:/tmp/
```

### 服务器一键部署
```bash
ssh root@jane66.com
rm -rf /tmp/usermgr-release && mkdir /tmp/usermgr-release
tar -xzf /tmp/usermgr-service-linux-x64-*.tar.gz -C /tmp/usermgr-release
cd /tmp/usermgr-release/usermgr-service
sudo PORT=3031 \
     JWT_SECRET=$(openssl rand -hex 32) \
     ADMIN_PASSWORD=$(openssl rand -hex 8) \
     KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32) \
     bash scripts/install.sh
```

### nginx 反代（合并进 vectorac.conf）
```bash
sudo cp /home/www/vectorac/usermgr-service/scripts/usermgr-proxy.conf /etc/nginx/conf.d/usermgr.conf
sudo nginx -t && sudo systemctl reload nginx
```

### 必须备份
- `data/usermgr.db` — SQLite 数据库（所有用户/设备/订单/服务期数据）
- `.env` — `JWT_SECRET` / `ADMIN_PASSWORD` / `KEY_ENCRYPTION_SECRET`（**KEY_ENCRYPTION_SECRET 绝对不能丢**，丢了所有设备 FactoryKey 全部失效需重新烧录）

### 运维命令
```bash
sudo systemctl status usermgr
sudo systemctl restart usermgr
sudo journalctl -u usermgr -f
```

## 联机麻将服务部署（一键）

四川麻将「血战到底」好友房后端（房间管理 + WebSocket 实时同步 + 服务端规则裁决）。
完整文档见 `mahjong-service/README.md`，下面是最少步骤。

### 1. 本地打包（含 node_modules，服务器无需 npm install）

```bash
cd mahjong-service
bash scripts/bundle.sh
# → dist/mahjong-service-YYYYMMDD-HHmm.tar.gz（约 1MB）

# 上传到官网同级的中转目录（不要用 /tmp）
ssh root@jane66.com 'mkdir -p /home/www/vectorac/.deploy'
scp dist/mahjong-service-*.tar.gz root@jane66.com:/home/www/vectorac/.deploy/
```

### 2. 服务器一键部署

```bash
ssh root@jane66.com
cd /home/www/vectorac/.deploy
rm -rf mahjong-service && tar -xzf "$(ls -t mahjong-service-*.tar.gz | head -1)"
cd mahjong-service
sudo ADMIN_TOKEN=$(openssl rand -hex 16) bash scripts/install.sh
```

安装到 `/home/www/vectorac/mahjong-service`（与 `dist/` 平级）；`.env` 不覆盖、只补缺失字段，
幂等可重跑 —— **升级和回滚都是同一套流程**（回滚就解压旧 tarball 再跑 install.sh）。

### 3. nginx 反代（在 vectorac.conf 主 server 块里加一行 include）

麻将的三个 location **不能**像短链那样丢到 `conf.d/` 独立文件里：
`location` 指令不允许出现在 `server` 块之外，会直接报 `location directive is not allowed here`。
做法是在 `vectorac.com` 的 `server { }`（443/ssl 那个块）里加一行 include，
反代规则留在安装目录，以后只改那一个文件：

```nginx
include /home/www/vectorac/mahjong-service/scripts/mahjong-proxy.conf;
```

懒得手动定位 server 块，可直接跑 README 里的「插入 + 校验」脚本（自动备份 + 自动选 443 块 +
`nginx -t` 通过才 reload，幂等可重跑）：`mahjong-service/README.md` → 「部署到 vectorac.com / nginx」。
手动插入后照旧 `sudo nginx -t && sudo systemctl reload nginx`。

前端走官网同源路径（`https://vectorac.com/api/rooms`、`wss://vectorac.com/mahjong-ws`），不用改 DNS。
验证：`/api/rooms` 应返回 JSON（返回 HTML 说明没生效）；WS 握手要 `curl --http1.1`，期望 `101`
（不带 `--http1.1` 会因 HTTP/2 剥掉 `Upgrade` 头而返回 404，是测试姿势问题）。

### 备份

服务无持久化数据（房间全在内存，重启即清空）；唯一要留的是
`/home/www/vectorac/mahjong-service/.env`（含 `ADMIN_TOKEN` / 超时 / 容量配置）。
`.deploy/` 里的历史 tarball 就是回滚点，建议留最近 3 份。

### 运维命令

```bash
sudo systemctl status mahjong
sudo systemctl restart mahjong
sudo journalctl -u mahjong -f
curl http://127.0.0.1:3032/api/health
```

## OCR 文字识别服务

官网「产品 → 文字识别」演示页的后端。**独立部署在服务器 `/home/ocr/`，不在本仓库内**，与其它 Node 服务无依赖关系，是唯一的 Python 服务。

### 访问链路

```
浏览器
  └─ https://vectorac.com/blogs/other/ch_ocr   (VuePress 页，iframe 嵌入下面这个)
       └─ iframe https://vectorac.com/ch_ocr
            └─ nginx location /ch_ocr → http://127.0.0.1:5001/
                 └─ Flask 服务 /home/ocr/server.py（渲染前端 + 识别）
```

- `nginx`：`/etc/nginx/conf.d/vectorac.conf` 里 `location /ch_ocr { proxy_pass http://127.0.0.1:5001/; }`（注意带尾斜杠，去掉前缀）。
- 前端页面（上传图 → 调 `/ocr` → 显示结果）是 Flask 模板 `/home/ocr/templates/index.html`，**不在本仓库**，改 UI 直接改这个文件；**改完必须重启服务才生效**（生产模式 Jinja2 会缓存编译后的模板，`curl -s http://127.0.0.1:5001/ | grep 新特征串` 可验证服务端是否已吐新页面）。
- 前端流程：选图 → canvas 压缩（`MAX_WH` 最长边、JPEG 质量）→ POST `/ch_ocr/upload` 存到 `/home/ocr/images/` → GET `/ch_ocr/ocr?img=<文件名>` 返回识别文本 JSON。

### 迁移前架构（EasyOCR，已废弃）

- 引擎：**EasyOCR 1.2.4**（2020 老版），`easyocr.Reader(['ch_sim'], gpu=False)`，PyTorch CPU 推理。
- 运行时：**系统 Python 3.6.8**（`/usr/bin/python3`）。
- 识别效果差的原因（实测确认）：
  1. EasyOCR 1.2.4 中文模型本身精度一般，复杂背景/手写/卡证小字弱；
  2. 只 `readtext(..., detail=0)` 返回纯文本流，无坐标、无置信度、**无法做卡证结构化**；
  3. PyTorch 进程常驻 ~750MB，长期不重启内存碎片化 + 触发 swap，慢且不稳。
  - 曾把前端 `MAX_WH` 1000→2200、JPEG 0.8→0.92 验证，**识别效果几乎无变化**，证明瓶颈在引擎而非图片清晰度。
- 旧启动方式：`ocr_run.sh`（`while [ 1 ]; do python3 server.py; done` 死循环守护）。

### 迁移后架构（RapidOCR）

- 引擎：**RapidOCR（ONNX Runtime）**，检测+识别模型走 ONNX，**不依赖 PyTorch**。
- 运行时：**独立 venv `/home/ocr/venv38`（Python 3.8.8）**，不碰系统 3.6（EasyOCR 残留依赖仍在 3.6，互不干扰）。
  - 系统已有 `/usr/bin/python3.8`；CentOS 8 / glibc 2.28 满足 onnxruntime 要求。
  - 建环境：`/usr/bin/python3.8 -m venv /home/ocr/venv38`，再 `pip install rapidocr-onnxruntime flask`。
- 优势：中文精度代差提升（PaddleOCR 同源权重）、内存从 ~750MB 降到 ~350MB、返回文字框坐标/置信度、支持卡证票据场景。
- `server.py` 改动：仅替换识别调用（`easyocr.Reader(...).readtext(...)` → RapidOCR），**接口路径 `/upload` `/ocr` 与前端模板完全不动**，用户无感。

### 启动 / 停止

```bash
cd /home/ocr

# 启动（后台 + 日志）
nohup /home/ocr/venv38/bin/python server.py > /home/ocr/ocr_output.log 2>&1 &

# 确认起来了（应看到 venv38/bin/python server.py，端口 5001 在监听）
ps aux | grep 'server.py' | grep -v grep
ss -tlnp | grep 5001

# 停止（按端口杀，最可靠；pkill 模式匹配经常因启动时用全路径 /home/ocr/server.py 而静默失败）
PID=$(ss -tlnp | grep ':5001' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
[ -n "$PID" ] && kill -9 $PID

# 重启一条龙：杀老进程 → 启动 → 验证端口和新页面特征
PID=$(ss -tlnp | grep ':5001' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
[ -n "$PID" ] && kill -9 $PID; sleep 1
cd /home/ocr && nohup /home/ocr/venv38/bin/python /home/ocr/server.py > /home/ocr/ocr_output.log 2>&1 &
sleep 2; ss -tlnp | grep ':5001'
```

> 旧的 `ocr_run.sh` 守护循环只适用于老的 3.6 EasyOCR；切到 venv38 后若要崩溃自拉起，建议改成 systemd 服务（参照 mahjong/shorturl 的 `Restart=on-failure` 写法），比 `while [1]` 更可控。

### 排查问题

| 现象 | 排查 |
| --- | --- |
| 页面打不开 / 502 | `curl -s http://127.0.0.1:5001/ocr?img=x.jpg` 看是否有响应；`ps aux \| grep server.py` 看进程在不在 |
| 识别接口 500 | 看日志 `tail -50 /home/ocr/ocr_output.log`；常见是图片路径不存在（`/ocr?img=` 的文件没在 `images/` 里） |
| 识别慢、内存高 | `free -h` 看是否进 swap；`ps aux \| grep server.py` 看 RSS；超 1G 就重启服务释放 |
| 识别全错/乱码 | 确认用的是 venv38 的 RapidOCR（`ps` 输出应含 `venv38`），不是又跑回了 3.6 EasyOCR |
| 识别质量差 | 先确认前端没把图压太狠（模板里 `MAX_WH` / JPEG 质量）；再确认模型是 RapidOCR |
| 改了前端 UI 没生效 | 先 `curl -s http://127.0.0.1:5001/ \| grep 新特征串`：没有 → 重启服务（Jinja2 模板缓存）；有 → 用户端强刷（Cmd/Ctrl+Shift+R）清缓存 |

### 关键文件

- `/home/ocr/server.py` — Flask 服务（识别 + 前端）
- `/home/ocr/templates/index.html` — 演示页 UI（压缩参数 `MAX_WH`、JPEG 质量在这改）
- `/home/ocr/ocr_run.sh` — 旧 3.6 启动脚本（废弃）
- `/home/ocr/venv38/` — RapidOCR 独立 Python 3.8 环境
- `/home/ocr/images/` — 上传图片暂存（前端每次覆盖同名 `temp.jpg`，不会无限堆积）
- `/home/ocr/ocr_output.log` — 运行日志

## 人脸匹配服务

官网「产品 → 人脸匹配」演示页的后端。**独立部署在服务器 `/home/FaceNet_Compare/`，不在本仓库内**（本仓库只保留源码副本 `.private/face-service/`），与其它服务无依赖。

### 访问链路

```
浏览器
  └─ https://vectorac.com/face_compare          (产品页 Demo 链接，直接用这个地址)
       └─ nginx location /face_compare → http://127.0.0.1:5000/
            └─ Flask 服务 /home/FaceNet_Compare/server.py（渲染前端 + 检测/识别/活体）
```

- `nginx`：`/etc/nginx/conf.d/vectorac.conf` 里有两块：`location /face_compare` 和 `location = /face_compare/`。**后者不能省**——`proxy_pass .../` 会把 `/face_compare/` 拼成 `//` 传给 Flask，Werkzeug 会把 `//` 308 重定向到 `http://vectorac.com/`，用户带尾斜杠访问会被弹回官网首页。
- 前端页面是 Flask 模板 `/home/FaceNet_Compare/templates/index.html`，**不在本仓库**；改 UI 直接改这个文件，**改完必须重启服务**（生产模式 Jinja2 缓存模板，`curl -s http://127.0.0.1:5000/ | grep 新特征串` 验证）。
- 前端流程：选图 → canvas 压缩（`MAX_WH` 最长边、JPEG 质量）→ POST `/face_compare/upload` 存到 `/home/FaceNet_Compare/images/` → GET `/face_compare/compare?img1=&img2=` 返回 JSON。

### 迁移前架构（TensorFlow 1.x + FaceNet，已废弃）

- 引擎：2018 年自训练的 **FaceNet**（`20180408-102900.pb`，92MB frozen graph，Inception-ResNet-v1）+ **MTCNN**（`align/det1~3.npy` 三级级联）。
- 运行时：**Python 2.7 + TensorFlow 1.x**，uwsgi socket 监听 5000。
- 带不动的原因：TF1 进程常驻 500MB~1GB，92MB 的 Inception-ResNet-v1 在 2核2G 机器上推理慢且易触发 swap；MTCNN 三级级联还要额外开销；旧代码读图后**只 padding 不缩放**，大图直接喂模型。用户已于 2026-09 停掉该服务。

### 迁移后架构（ONNX Runtime CPU）

| 环节 | 模型 | 大小 | 输入 |
| --- | --- | --- | --- |
| 人脸检测 | SCRFD-500M `det_500m.onnx` | 2.5MB | 640×640，9 个输出按 `[score8,score16,score32,bbox8,bbox16,bbox32,kps8,kps16,kps32]` |
| 特征提取 | ArcFace MobileFaceNet `w600k_mbf.onnx` | 13MB | 112×112，输出 512 维，需 L2 归一化 + 余弦相似度 |
| 静默活体 | MiniFASNetV2 `minifasnet_v2.onnx` | 1.7MB | 80×80，输出 3 类 **logits（不含 softmax）** |

- 运行时：**独立 venv `/home/FaceNet_Compare/venv38`（Python 3.8.8）**，与 OCR 的 `/home/ocr/venv38` 分开，互不影响。
- 优势：常驻内存 **~77MB**（旧服务 500MB~1GB）、单次比对 50~110ms、新增静默活体能力。
- 旧代码全部保留在 `/home/FaceNet_Compare/_legacy_backup/`，可回滚。

### 踩过的坑（重要）

1. **活体模型绝对不能对输入做 `/255` 归一化。** 官方 `src/data_io/functional.py` 的 `to_tensor` 里 `return img.float().div(255)` 这行**被注释掉了**（`modify by zkx`），模型期望的是 **0~255 原始像素、BGR、HWC→CHW**。如果按常规习惯除以 255，模型输出会饱和成几乎恒定的值，真人/伪造都判成同一类（实测真人样本 live 概率从 0.9997 掉到 0.0003）。模型输出是 logits，需要自己做 softmax。
2. **活体模型用哪一类代表「真人」**：官方 `test.py` 里 `label == 1` 才打印 `Real Face`，所以 `FACE_LIVE_CLASS=1`。官方 demo 是把 `2.7_80x80_MiniFASNetV2` 和 `4_0_80x80_MiniFASNetV1SE` 两个模型结果相加求平均，本服务只用 V2 单模型（省内存），实测已足够。
3. **横躺/倒置照片会让关键点错乱。** SCRFD 仍能检出人脸，但 5 点顺序会乱（鼻尖跑到眼睛上方），对齐随之失效——同一人的相似度会从 0.79 掉到 0.06。`server.py` 用 `_lm_valid()` 检查「鼻尖在双眼连线下方、嘴在鼻尖下方」，不通过就依次试 90°/270°/180° 旋转。正常照片第一次（0°）就通过，**零额外开销**；只有问题照片才多跑几次检测。返回给前端的 `box` 已换算回原图坐标，前端不需要做旋转处理（`rotate` 字段仅作提示）。
4. **阈值取值**（实测 15 张真人照 + 官方活体样本）：同一人余弦相似度 0.43~0.79，不同人 0.01~0.20，故 `FACE_SIM_THRESHOLD` 取 **0.35**（两侧余量都够）。活体：真人照片 0.74~1.00，伪造样本 0.0004~0.02，`FACE_LIVE_THRESHOLD` 取 **0.50**。
5. **已知误判**：低分辨率、强后期/调色的图（例如电视剧截图）会被活体判成「疑似翻拍」。这是模型对「非自然拍摄画面」的正常反应，真人自拍不受影响。
6. 服务器上的 `models/minifasnet_v2.onnx` 是早期从 HuggingFace 下的版本，**与从官方 `.pth` 自行转换的结果逐位等价**（torch/onnx maxdiff ~1e-6），无需替换。

### 启动 / 停止（systemd）

```bash
# 状态 / 启动 / 停止 / 重启
systemctl status facecompare
systemctl start facecompare
systemctl stop facecompare
systemctl restart facecompare

# 实时日志（服务 stdout/stderr 走 journald）
journalctl -u facecompare -f

# 改完 /home/FaceNet_Compare/server.py 或 templates/index.html 后
systemctl restart facecompare
```

### 排查问题

| 现象 | 排查 |
| --- | --- |
| 页面打不开 / 502 | `curl -s http://127.0.0.1:5000/healthz`；`systemctl status facecompare` 看进程和报错 |
| 带尾斜杠访问被弹回官网首页 | 确认 `nginx -T \| grep -A2 "location = /face_compare/"` 存在，改完 `nginx -t && systemctl reload nginx` |
| 比对接口 400 `face not detected` | 图里确实没脸，或脸太小（`FACE_MIN_SIZE` 默认 40px） |
| 相似度普遍偏低 | 先确认服务加载的是 ONNX 版（`journalctl -u facecompare` 应看到「模型加载完成」）；再确认 `FACE_SIM_THRESHOLD` 没被环境变量改乱 |
| 活体结果全是同一类 | 十有八九是 `liveness()` 里又对输入做了 `/255`，见「踩过的坑 1」 |
| 内存占用高 | `systemctl status facecompare` 看 Memory；正常应 ~77MB，明显偏高就 `systemctl restart facecompare` |

### 关键文件

- `/home/FaceNet_Compare/server.py` — Flask 服务（检测 / 对齐 / 识别 / 活体 / 比对），源码副本在 `.private/face-service/server.py`
- `/home/FaceNet_Compare/templates/index.html` — 演示页 UI（压缩参数 `MAX_WH`、JPEG 质量在这改），副本在 `.private/face-service/templates/index.html`
- `/etc/systemd/system/facecompare.service` — systemd 单元，副本在 `.private/face-service/facecompare.service`
- `/home/FaceNet_Compare/venv38/` — 独立 Python 3.8 环境（onnxruntime + opencv-python-headless + flask + numpy）
- `/home/FaceNet_Compare/models/` — 三个 ONNX 模型
- `/home/FaceNet_Compare/images/` — 上传图片暂存（前端每次覆盖同名文件，不会无限堆积）
- `/home/FaceNet_Compare/_legacy_backup/` — 旧 FaceNet/MTCNN/uwsgi 代码，回滚用

## 部署配置

### 1. 核心配置文件
- **`package.json`**：定义了项目依赖和脚本命令
- **`.vuepress/config.js`**：VuePress 主配置文件，包含：
  - 网站标题、描述、关键词
  - 主题配置（导航栏、博客设置、评论系统等）
  - 构建输出目录（`dest: 'public'`）
  - 元数据配置（viewport、备案信息等）
  - 百度推送脚本

### 2. 部署步骤（生产服务器 jane66.com）
1. **构建生产版本**：`npm run build` → 产物输出到 `public/`（在 `.vuepress/config.js` 中配置）
2. **上传到服务器**：将本地 `public/` 目录的所有文件同步到服务器 `/home/www/vectorac/dist/`：
   ```bash
   rsync -avz --delete public/ root@jane66.com:/home/www/vectorac/dist/
   ```
3. **验证**：浏览器访问 `https://vectorac.com/` 看页面是否更新；如改了 `<link>` 标签可执行：
   ```bash
   curl -s https://vectorac.com/ | grep -i 'rel="icon\|rel="shortcut'
   ```

> 其他托管服务（GitHub Pages、Netlify、Vercel、阿里云OSS、腾讯云COS）也可用，将 `public/` 目录上传即可，但生产环境使用 rsync 到 jane66.com 服务器的 `/home/www/vectorac/dist/` 目录。

### 3. 项目结构
```
Vectorac/
├── .vuepress/           # VuePress 配置和静态资源
│   ├── public/          # 静态资源目录（图片、JS文件等）
│   └── config.js        # 主配置文件
├── blogs/               # 博客文章目录
│   ├── other/           # 其他文章
│   └── timeline/        # 时间线文章
├── docs/                # 文档目录
├── public/              # 构建输出目录（自动生成）
├── .gitignore           # Git 忽略文件配置
├── package.json         # 项目配置
└── README.md            # 首页内容
```

## 主要功能配置

1. **主题**：使用了 `vuepress-theme-reco` 博客主题
2. **评论系统**：配置了 Valine 评论系统（当前已关闭显示）
3. **百度推送**：集成了百度推送脚本
4. **响应式设计**：支持移动端和桌面端
5. **备案信息**：包含了ICP备案和公安备案信息

## 开发建议

### 1. 修改内容
- **首页内容**：修改 `README.md`
- **导航栏**：修改 `.vuepress/config.js` 中的 `nav` 配置
- **博客文章**：在 `blogs/` 目录下添加或修改 Markdown 文件
- **文档**：在 `docs/` 目录下添加或修改 Markdown 文件

### 2. 添加新页面
- 在对应目录下创建 Markdown 文件
- 在导航栏中配置链接（如果需要）

### 3. 自定义样式
- 可以在 `.vuepress/` 目录下创建 `styles/` 目录，添加自定义 CSS 文件
- 在 `config.js` 中配置 `stylus` 或 `scss` 预处理器

## 部署示例

### GitHub Pages 部署

1. **安装 gh-pages 依赖**：
```bash
npm install -D gh-pages
```

2. **修改 package.json**，添加 deploy 脚本：
```json
"scripts": {
  "dev": "vuepress dev . --open --host \"localhost\"",
  "build": "vuepress build .",
  "deploy": "npm run build && gh-pages -d public"
}
```

3. **运行部署命令**：
```bash
npm run deploy
```

### 其他部署方式

#### Netlify / Vercel
1. 连接 GitHub 仓库
2. 配置构建命令：`npm run build`
3. 配置发布目录：`public`
4. 保存配置，自动部署

#### 阿里云 OSS / 腾讯云 COS
1. 构建生产版本：`npm run build`
2. 登录云服务控制台，创建存储桶
3. 开启静态网站托管
4. 将 `public/` 目录下的所有文件上传到存储桶

## 注意事项

1. **备案信息**：如果网站域名变更，需要更新 `.vuepress/config.js` 中的备案信息
2. **百度推送**：如果网站域名变更，需要更新百度推送脚本配置
3. **评论系统**：如果需要开启评论功能，需要在 `.vuepress/config.js` 中修改 `valineConfig.showComment` 为 `true`
4. **主题更新**：如果需要更新 VuePress 或主题版本，建议先在测试环境测试后再升级

## 常见问题

### 1. 构建失败
- 检查依赖是否正确安装：`npm install`
- 检查 Node.js 版本是否兼容（建议使用 Node.js 12+）
- 查看错误信息，针对性解决

### 2. 本地开发服务器无法启动
- 检查端口是否被占用
- 查看控制台错误信息
- 尝试重新安装依赖

### 3. 部署后样式错乱
- 检查构建是否成功：`npm run build`
- 检查部署的文件是否完整
- 检查网站根路径配置

### 4. 源码样式修改

#### 4.1 移除侧边栏个人信息组件

**修改文件**：`node_modules/vuepress-theme-reco/components/Common.vue`

**修改内容**：

**原始代码**：
```vue
<Sidebar
  :items="sidebarItems"
  @toggle-sidebar="toggleSidebar">
  <template slot="top">
    <PersonalInfo />  <!-- 个人信息组件 -->
  </template>
  <slot
    name="sidebar-bottom"
    slot="bottom"/>
</Sidebar>
```

**修改后代码**：
```vue
<Sidebar
  :items="sidebarItems"
  @toggle-sidebar="toggleSidebar">
  <!-- 已移除个人信息组件 -->
  <slot
    name="sidebar-bottom"
    slot="bottom"/>
</Sidebar>
```

**功能说明**：
- 该修改用于移除侧边栏顶部的个人信息组件
- 个人信息组件包含作者头像、名称、文章数和标签数统计
- 修改后侧边栏将不再显示这些个人信息

**注意事项**：
- 此修改直接修改了 node_modules 目录中的文件，升级主题版本后需要重新应用
- 如需长期移除该组件，建议使用主题的自定义覆盖机制或创建本地组件覆盖

#### 4.2 自定义首页Features显示

**修改文件**：`node_modules/vuepress-theme-reco/components/HomeBlog.vue`

**修改内容**：

**1. 注释掉home-blog-wrapper部分代码**
```vue
<!-- <ModuleTransition delay="0.16">
  <div v-show="recoShowModule" class="home-blog-wrapper">
    <div class="blog-list"> -->
      <!-- 博客列表 -->
      <!-- <note-abstract
        :data="$recoPosts"
        :currentPage="currentPage"></note-abstract> -->
      <!-- 分页 -->
      <!-- <pagation
        class="pagation"
        :total="$recoPosts.length"
        :currentPage="currentPage"
        @getCurrentPage="getCurrentPage" />
    </div>
    <div class="info-wrapper">
      <PersonalInfo/>
      <h4><i class="iconfont reco-category"></i> {{homeBlogCfg.category}}</h4>
      <ul class="category-wrapper">
        <li class="category-item" v-for="(item, index) in this.$categories.list" :key="index">
          <router-link :to="item.path">
            <span class="category-name">{{ item.name }}</span>
            <span class="post-num" :style="{ 'backgroundColor': getOneColor() }">{{ item.pages.length }}</span>
          </router-link>
        </li>
      </ul>
      <hr>
      <h4 v-if="$tags.list.length !== 0"><i class="iconfont reco-tag"></i> {{homeBlogCfg.tag}}</h4>
      <TagList @getCurrentTag="getPagesByTags" />
      <h4 v-if="$themeConfig.friendLink && $themeConfig.friendLink.length !== 0"><i class="iconfont reco-friend"></i> {{homeBlogCfg.friendLink}}</h4>
      <FriendLink />
    </div>
  </div>
</ModuleTransition> -->
```

**2. 调整feature部分布局**
```vue
<div class="features" v-if="recoShowModule && $frontmatter.features && $frontmatter.features.length">
  <div v-for="(feature, index) in $frontmatter.features" :key="index" class="feature" :class="{ 'feature-reverse': index % 2 === 1 }">
    <div class="feature-content">
      <!-- <h2>{{ feature.title }}</h2> -->
      <p>{{ feature.details }}</p>
    </div>
    <div class="feature-image-wrapper">
      <img v-if="feature.image" :src="$withBase(feature.image)" alt="feature" class="feature-image" />
    </div>
  </div>
</div>
```

**3. 修改.features和.feature样式**
```stylus
.features {
  border-top: 1px solid var(--border-color);
  padding: 2rem 0;
  margin-top: 3rem;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
  
  .feature {
      display: flex;
      flex-direction: row;
      align-items: center;
      margin-bottom: 3rem;
      transition: all .3s ease;
      
      &:last-child {
        margin-bottom: 0;
      }
      
      &.feature-reverse {
        flex-direction: row-reverse;
      }
      
      &:hover {
        transform: translateY(-5px);
      }
    
    .feature-content {
      flex: 1;
      padding: 0 2rem;
      
      h2 {
        font-size: 2rem;
        font-weight: 600;
        color: #333;
        margin-bottom: 1rem;
        border-bottom: none;
        padding-bottom: 0;
      }
      
      p {
        font-size: 1.1rem;
        line-height: 1.6;
        color: #666;
        margin: 0;
      }
    }
    
    .feature-image-wrapper {
      flex: 0 0 50%;
      
      img.feature-image {
        width: 100%;
        max-height: 400px;
        object-fit: contain;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
    }
  }
}
```

**4. 移动端响应式样式**
```stylus
@media (max-width: $MQMobile) {
  .features {
    padding: 1rem 0;
    margin-top: 2rem;
    
    .feature {
      flex-direction: column !important;
      max-width: 100%;
      padding: 0 1.5rem;
      margin-bottom: 2rem;
      
      .feature-content {
        padding: 1rem 0 0 0 !important;
      }
      
      .feature-image-wrapper {
        flex: 0 0 100%;
      }
    }
  }
}
```

**功能说明**：
- 注释掉了home-blog-wrapper部分代码，隐藏了博客列表和信息侧边栏
- 调整了feature部分布局，实现图片与文本交替排列（第一个图片左文本右，第二个图片右文本左）
- 修改了.features和.feature的CSS样式，使其更加现代和专业
- 优化了移动端响应式布局，确保在竖屏手机端图片在上文本在下

**注意事项**：
- 此修改直接修改了 node_modules 目录中的文件，升级主题版本后需要重新应用
- 修改了多个部分的样式，包括布局、颜色、间距等
- 建议在修改前备份原始文件，以便恢复
- 响应式布局已在多种设备上测试，确保良好的显示效果

#### 4.3 隐藏页面标题组件

**修改文件**：`node_modules/vuepress-theme-reco/components/Page.vue`

**修改内容**：

**原始代码**：
```vue
<ModuleTransition>
  <div v-show="recoShowModule && $page.title" class="page-title">
    <h1 class="title">{{$page.title}}</h1>
    <PageInfo :pageInfo="$page" :showAccessNumber="showAccessNumber"></PageInfo>
  </div>
</ModuleTransition>
```

**修改后代码**：
```vue
<!-- <ModuleTransition>
  <div v-show="recoShowModule && $page.title" class="page-title">
    <h1 class="title">{{$page.title}}</h1>
    <PageInfo :pageInfo="$page" :showAccessNumber="showAccessNumber"></PageInfo>
  </div>
</ModuleTransition> -->
```

**功能说明**：
- 该修改用于隐藏页面顶部的标题和页面信息组件
- 页面标题组件包含页面大标题和页面信息（作者、日期、阅读量等）
- 修改后页面将不再显示这些顶部标题信息

**注意事项**：
- 此修改直接修改了 node_modules 目录中的文件，升级主题版本后需要重新应用
- 如需长期隐藏该组件，建议使用主题的自定义覆盖机制或创建本地组件覆盖

#### 4.4 移除底部主题推广链接

**修改文件**：`node_modules/vuepress-theme-reco/components/Footer.vue`

**修改内容**：

**原始代码**：
```vue
<span>
  <i class="iconfont reco-theme"></i>
  <a target="blank" href="https://vuepress-theme-reco.recoluan.com">{{`vuepress-theme-reco@${version}`}}</a>
</span>
```

**修改后代码**：
```vue
<!-- <span>
  <i class="iconfont reco-theme"></i>
  <a target="blank" href="https://vuepress-theme-reco.recoluan.com">{{`vuepress-theme-reco@${version}`}}</a>
</span> -->
```

**功能说明**：
- 该修改用于移除网页底部显示的 `vuepress-theme-reco@版本号` 推广链接
- 该链接指向主题官网 `https://vuepress-theme-reco.recoluan.com`
- 修改后底部将不再显示该主题推广信息，仅保留备案信息和版权信息

**注意事项**：
- 此修改直接修改了 node_modules 目录中的文件，升级主题版本后需要重新应用
- 如需长期移除，建议使用主题的自定义覆盖机制

#### 4.5 其他样式定制建议

1. **自定义全局样式**：在 `.vuepress/styles/index.styl` 中添加自定义样式
2. **覆盖主题组件**：在 `.vuepress/components/` 目录下创建同名组件覆盖默认组件
3. **使用 CSS 变量**：主题支持通过 CSS 变量自定义颜色、间距等样式

**示例**：修改主题主色调
```css
:root {
  --accent-color: #3eaf7c;  /* 主题主色调 */
  --text-color: #2c3e50;     /* 文本颜色 */
  --background-color: #fff;  /* 背景颜色 */
}
```

## 维护建议

1. 定期更新依赖，修复安全漏洞
2. 定期备份配置文件和重要内容
3. 遵循 Git 工作流，合理使用分支管理
4. 编写清晰的 commit 信息，便于追溯历史变更
5. 定期检查网站运行状态，确保正常访问

---

**更新时间**：2026-09-18
**维护人员**：Jiao
