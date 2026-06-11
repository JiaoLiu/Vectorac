::: warning 短链跳转 API
基于令牌的短链生成、302 跳转、点击统计一体化方案。短码 7 位自定义字母数字、安全简洁、零运维；演示版可直接生成令牌、创建短链并查看实时折线图。
:::

## 在线演示

<a id="demo-cta" class="demo-cta" href="https://s.vectorac.com/" target="_blank" rel="noopener">
  🚀 在新标签页中打开在线演示
</a>

演示流程建议：

1. 点上方按钮，**新标签页**会打开演示首页。
2. 在「**首页**」点 **生成令牌**，把 `tk_xxx` 复制下来。
3. 进入「**创建短链**」，把令牌和任意一个 `https://...` 长链粘进去，点生成。
4. 复制生成的短链，再开一个新标签页粘贴访问，会 **302 跳转到目标 URL**。
5. 多访问几次后回到「**数据统计**」，能看到 KPI 数字上涨 + 折线图出现新点。
6. 进入「**短链管理**」填入管理员令牌 `admin-demo-2026`（生产请改），可看到所有短链并删除。

## 说明

1. **多租户令牌**：每个调用方持有一个独立令牌（生产环境通过邮件/短信下发），所有写入操作都需要令牌，避免被滥用。
2. **短码生成**：默认 7 位字母数字（去掉了 0/O/1/I/l 等易混淆字符），CRNG 随机，碰撞后自动重试。
3. **302 跳转**：访问 `https://s.vectorac.com/s/{code}` 直接 302 到目标 URL，毫秒级响应；同短链重复访问自动累计点击。
4. **实时统计**：近 14 天点击趋势折线图、Top 链接、令牌请求数、点击来源 Top，无需任何额外配置。
5. **管理后台**：内置 `/links` 管理视图，列出全部短链 + 删除（管理员令牌鉴权）。
6. **零依赖部署**：服务是单一 Node.js 进程，JSON 文件持久化，**不依赖 MySQL/Redis/任何外部服务**；与现有官网 nginx 完全解耦，不动一行 nginx 即可上线。

## 部署说明

服务代码位于仓库根目录 `shorturl-service/`，独立 Node.js 进程，跑在 `0.0.0.0:3030`（可改）。要把它暴露到 `s.vectorac.com` 子域名有两种方式：

1. **不动 nginx**（推荐）：保持服务跑在 `3030` 端口，让现有官网 nginx 增加一条 `location /s/ { proxy_pass http://127.0.0.1:3030; }` 即可（也属于"零业务变更"）。如确实不能动 nginx，可以用 Cloudflare Tunnel 等内网穿透方案。
2. **绑定 s.vectorac.com**：在现有 nginx 里加一个 `server { server_name s.vectorac.com; ... }` 段反向代理到 3030 即可。

详细步骤、API 文档与故障排查见服务根目录的 `README.md` 和 `.private/deploy.md`。

## 使用方式

::: details 在线 API
通过 HTTP API 调用，支持任何语言。下面是最常见的 cURL / Node.js / Python 三个示例。
:::

```bash
# 1. 申请令牌（演示：直接 POST 即可）
curl -X POST https://s.vectorac.com/api/token/generate \
  -H 'Content-Type: application/json' \
  -d '{"name":"我的应用"}'
# → { "token": "tk_xxx...", "name": "我的应用", "request_count": 0, ... }

# 2. 创建短链
curl -X POST https://s.vectorac.com/api/links \
  -H 'Content-Type: application/json' \
  -d '{
    "base_url":   "https://s.vectorac.com",
    "token":      "tk_xxx...",
    "target_url": "https://example.com/landing/page?utm_source=email",
    "remark":     "618 活动落地页"
  }'
# → { "code": "aB3xY7z", "short_url": "https://s.vectorac.com/s/aB3xY7z", ... }

# 3. 访问短链 → 302 跳转到目标 URL
curl -I https://s.vectorac.com/s/aB3xY7z
# HTTP/1.1 302 Found
# Location: https://example.com/landing/page?utm_source=email

# 4. 查看统计
curl 'https://s.vectorac.com/api/stats/overview?token=tk_xxx...'
# → { totals: {...}, trend: { labels:[...], data:[...] }, top:[...] }
```

```js
// Node.js / 浏览器 fetch
const TOKEN = 'tk_xxx';
const r = await fetch('https://s.vectorac.com/api/links', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    base_url:   'https://s.vectorac.com',
    token:      TOKEN,
    target_url: 'https://example.com/landing/page',
    remark:     '618'
  })
}).then(r => r.json());
console.log(r.short_url);   // https://s.vectorac.com/s/aB3xY7z
```

```python
import requests
r = requests.post('https://s.vectorac.com/api/links', json={
    'base_url':   'https://s.vectorac.com',
    'token':      'tk_xxx',
    'target_url': 'https://example.com/landing/page',
    'remark':     '618'
}).json()
print(r['short_url'])
```

## 典型适用场景

- 短信/邮件营销：原始 URL 太长、容易被识别为垃圾链接，用短链提升到达率。
- 线下物料：海报/名片上印短链（甚至再做 QR），更易扫更易记。
- 渠道追踪：通过不同 remark 区分推广来源，统计每个短链的点击量。
- 内部 A/B 测试：同一目标 URL 创建多个短链，对比不同文案投放的点击效果。

## 快速对照

| 维度 | 说明 |
| --- | --- |
| 短码长度 | 7 位（56 位熵，约 3 万亿组合） |
| 跳转时延 | 单进程毫秒级，WAL 文件持久化 |
| 鉴权 | 令牌（生产）+ 可选管理员令牌 |
| 存储 | 本地 JSON 文件（默认）/ 可换 SQLite/MySQL |
| 部署 | 单 Node 进程，不动 nginx，零外部依赖 |
| 监控 | 内置 `/healthz`，暴露 KPI 仪表板 |
| 扩展点 | 令牌下发、过期、限速、域名白名单全部已留好接口 |
