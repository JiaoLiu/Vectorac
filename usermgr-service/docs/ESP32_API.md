# Vectorac 设备平台 ESP32 API

## 1. 平台地址模型

生产环境基址：`https://vectorac.com`

| 类型 | 地址 |
| --- | --- |
| 全局管理平台 | `https://vectorac.com/admin/` |
| 全局管理 API | `https://vectorac.com/admin/api/*` |
| 产品用户页面 | `https://vectorac.com/{product}/account/` |
| 产品用户/设备 API | `https://vectorac.com/{product}/api/*` |
| 健康检查（仅服务器本机） | `http://127.0.0.1:3031/healthz` |

`{product}` 是管理平台创建的产品代码，例如小V为 `xiaov`。ESP32 固件应把产品代码作为编译期配置，不要把 `xiaov` 写死在公共 SDK 中。

所有请求和响应使用 `Content-Type: application/json`。生产环境只允许 HTTPS。

## 2. 安全边界

- `PROVISION_TOKEN` 仅供受控工厂烧录工具使用，绝不能写入 ESP32 量产固件。
- `FactoryKey` 是每台设备独立的 32 字节随机密钥，API 表示为 64 字符小写 hex。
- ESP32 将 FactoryKey 写入 eFuse 后，应关闭对应读保护/写保护，具体操作按芯片安全方案执行。
- 运行时请求使用 HMAC-SHA256，不使用管理 Token。
- `timestamp` 是 Unix epoch 毫秒，设备时间与服务器最多相差 5 分钟。
- `nonce` 每次请求必须唯一，建议使用 16 随机字节的 hex（32 字符）；服务端最低接受 8 字符。
- `signature` 是 HMAC-SHA256 原始 32 字节结果的 Base64，不是 hex。

## 3. 工厂烧录流程（烧录工具调用）

### 3.1 申请设备凭证

`POST /admin/api/provision`

Header：

```http
Authorization: Bearer <PROVISION_TOKEN>
Content-Type: application/json
```

请求：

```json
{
  "product": "xiaov",
  "hardware_id": "AC:A7:04:28:C9:10"
}
```

首次成功响应：

```json
{
  "ok": true,
  "sn": "XV000001",
  "factory_key": "64-character-lowercase-hex",
  "challenge": "64-character-lowercase-hex"
}
```

烧录工具把 `factory_key` 转为 32 字节并写入设备安全存储。若设备已经完成 provision，响应为：

```json
{ "ok": true, "already_provisioned": true, "sn": "XV000001" }
```

此时服务端不会再次返回 FactoryKey。

### 3.2 验证设备确实持有 FactoryKey

设备计算：

```text
message = "v1|provision_verify|" + hardware_id + "|" + challenge
response = lowercase_hex(HMAC_SHA256(factory_key_bytes, UTF8(message)))
```

注意：这里的 `response` 使用 hex；运行时接口的 `signature` 使用 Base64。

烧录工具提交：`POST /admin/api/provision/verify`

```json
{
  "product": "xiaov",
  "hardware_id": "AC:A7:04:28:C9:10",
  "challenge": "服务端返回的 challenge",
  "response": "设备计算的64字符hex"
}
```

Header 同样使用 `Authorization: Bearer <PROVISION_TOKEN>`。

成功：

```json
{ "ok": true, "sn": "XV000001", "status": "provisioned" }
```

烧录失败可由工厂工具调用 `POST /admin/api/provision/fail`：

```json
{
  "product": "xiaov",
  "hardware_id": "AC:A7:04:28:C9:10",
  "reason": "efuse_write_failed"
}
```

## 4. ESP32 运行时签名

除 provision verify 外，设备接口统一签名原文：

```text
v1|{action}|{hardware_id}|{timestamp}|{nonce}
```

计算方式：

```text
signature = Base64(HMAC_SHA256(factory_key_bytes, UTF8(message)))
```

动作映射：

| 接口 | action |
| --- | --- |
| `/device/activate` | `activate` |
| `/device/status` | `status` |
| `/device/bind/qrcode` | `qrcode` |
| `/device/bind/poll` | `poll` |

签名只覆盖上述五个字段，不覆盖 JSON 的其他字段。`hardware_id` 的大小写、冒号格式必须与 provision 时完全一致。

ESP-IDF/mbedTLS 伪代码：

```c
snprintf(message, sizeof(message), "v1|%s|%s|%lld|%s",
         action, hardware_id, timestamp_ms, nonce);
mbedtls_md_hmac(info_sha256, factory_key, 32,
                (const unsigned char *)message, strlen(message), digest);
base64_encode(digest, 32, signature);
```

## 5. ESP32 运行时接口

下面用 `{base}` 表示 `https://vectorac.com/{product}/api`。

### 5.1 激活/恢复设备凭证

`POST {base}/device/activate`，action=`activate`

```json
{
  "hardware_id": "AC:A7:04:28:C9:10",
  "timestamp": 1786490000000,
  "nonce": "32-character-random-hex",
  "signature": "base64-hmac"
}
```

成功：

```json
{
  "ok": true,
  "recovered": false,
  "sn": "XV000001",
  "volcano_device_name": "xiaov-aca70428c910",
  "device_secret": "provider-device-secret"
}
```

设备应安全保存 `sn`、`volcano_device_name`、`device_secret`。擦除 Flash 后可凭 eFuse FactoryKey 重新调用；`recovered=true` 时返回原 device secret。

### 5.2 查询绑定和服务状态

`POST {base}/device/status`，action=`status`

请求字段与 activate 相同。

成功响应主要字段：

```json
{
  "ok": true,
  "sn": "XV000001",
  "bound": true,
  "nickname": "客厅小V",
  "device_secret_ready": true,
  "credential_status": "volcano_registered",
  "service_status": "active",
  "service_expires_at": "2027-08-12T00:00:00.000Z",
  "ai_allowed": true,
  "provider_renew_status": "none",
  "provider_available": true
}
```

ESP32 在开启 AI/火山会话前调用该接口，以 `ai_allowed` 作为最终许可，不要自行推断。

### 5.3 生成用户绑定二维码

`POST {base}/device/bind/qrcode`，action=`qrcode`

请求字段与 activate 相同。

未绑定响应：

```json
{
  "ok": true,
  "qr_url": "https://vectorac.com/xiaov/account/bind?t=...",
  "temp_token": "16-character-hex",
  "expires_at": "2026-08-12T01:00:00.000Z"
}
```

ESP32 显示 `qr_url` 对应二维码并缓存 `temp_token` 用于轮询。Token 有效期 5 分钟。

已绑定响应：

```json
{ "ok": true, "already_bound": true, "message": "..." }
```

### 5.4 轮询绑定结果

`POST {base}/device/bind/poll`，action=`poll`

```json
{
  "hardware_id": "AC:A7:04:28:C9:10",
  "temp_token": "qrcode接口返回的token",
  "timestamp": 1786490000000,
  "nonce": "新的随机nonce",
  "signature": "base64-hmac"
}
```

等待中：

```json
{ "ok": true, "status": "pending" }
```

绑定完成：

```json
{ "ok": true, "status": "bound", "nickname": "客厅小V" }
```

建议每 2–3 秒轮询一次，每次必须生成新的 timestamp、nonce 和 signature；到 `expires_at` 后停止并重新生成二维码。

## 6. 推荐 ESP32 状态机

1. 首次开机从 eFuse 读取 FactoryKey，并取得 SNTP 时间。
2. 若 Flash 中无 provider device secret，调用 `activate`。
3. 调用 `status`。
4. 若 `bound=false`，调用 `bind/qrcode` 并展示二维码，再轮询 `bind/poll`。
5. 若 `bound=true` 且 `ai_allowed=true`，允许启动 AI 会话。
6. 若服务不可用，按 `service_status`、`provider_renew_status` 展示对应提示。
7. 每次启动 AI 会话前和长连接定期重查 `status`。

## 7. 通用错误处理

| HTTP | 常见 error | 处理 |
| --- | --- | --- |
| 400 | `missing_params` | 检查 JSON 字段 |
| 401 | `auth_failed` | 检查时间、nonce、HMAC、Base64与 FactoryKey |
| 403 | `device_not_provisioned` | 回工厂 provisioning 流程，不要无限重试 |
| 403 | `product_mismatch` | 产品代码、用户或绑定 Token 跨产品，停止调用 |
| 404 | `product_not_found` | 固件产品代码未在平台配置 |
| 404 | `device_not_provisioned` | HardwareID 或产品代码不匹配 |
| 409 | `device_already_bound` | 提示先由原用户解绑 |
| 410 | `challenge_expired` | 工厂工具重新调用 provision 获取 challenge |
| 429 | `rate_limited` | 指数退避后重试 |
| 5xx | 服务端/供应商错误 | 指数退避，保留设备本地状态，不擦除密钥 |

网络重试建议：1s、2s、4s、8s，最大 30s；每次签名请求都必须使用新 nonce。
