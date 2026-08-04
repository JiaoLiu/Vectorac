# Vectorac 固件刷写工具 · 开发文档

> 这份文档不对外发布，给工程团队自己看。用户视角的介绍在 `blogs/other/flasher.md`。

## 工作原理

1. **串口**：浏览器原生 `navigator.serial.requestPort()` 让用户授权一个串口，所有读写都在浏览器里完成，**数据不出本机**。
2. **协议**：[esptool-js](https://github.com/espressif/esptool-js) 是 Espressif 官方从 Python `esptool` 移植的 JS 实现，支持握手、Flash 检测、写入、校验、硬复位全流程。
3. **固件托管**：`.bin` 文件放在 `.vuepress/public/firmware/`，由 VuePress build 时直接拷到产物根目录 `/firmware/`；前端 `fetch('/firmware/xxx.bin')` 拿到字节数组后直接喂给 `esploader.writeFlash()`。
4. **零后端**：不像 shorturl-service 那样需要独立 Node 进程，本工具完全是几个静态文件 + 一段 ESM 模块。

## 发布新固件

把编译出的 `.bin` 文件拷到 `.vuepress/public/firmware/`，然后在 `.vuepress/public/firmware/manifest.json` 里加一项。

**最简写法**（其他字段不写走默认值）：

```json
[
  {
    "id": "xiaov-v1.1.0",
    "name": "小V v1.1.0",
    "file": "/firmware/xiaov-v1.1.0.bin"
  }
]
```

**完整字段**（有需要才加）：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `id` | 必填 | 唯一 ID |
| `name` | 必填 | 下拉框显示名 |
| `file` | 必填 | 固件 URL |
| `address` | `0x0` | 烧录起始地址 |
| `flashMode` | `dio` | dio/qio/qout/dout |
| `flashFreq` | `40m` | 80m/40m/26m/20m |
| `flashSize` | `4MB` | 1/2/4/8/16/32MB |
| `baudrate` | `921600` | 烧录波特率 |
| `version` | `id` | 版本号 |
| `date` | — | 发布日期 |
| `note` | — | 备注 |

`git push` 后 CI 自动 build + 部署，新固件立即可选。

**本地文件自动检测**：选择本地 `.bin` 时，如果文件头第一字节是 `0xE9`（ESP image magic），自动从第 3/4 字节解析 flash mode/freq/size。否则用默认 `dio/40m/4MB`。用户可在 UI 里手动覆盖。

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `.vuepress/public/js/flasher.js` | 刷写逻辑：UI + Web Serial + esptool-js（ESM 动态 import，CDN 加载，失败回退 esm.sh） |
| `.vuepress/public/firmware/manifest.json` | 固件清单，加新固件只改这里 |
| `.vuepress/public/firmware/README.txt` | 怎么放真固件的说明 |
| `blogs/other/flasher.md` | 对外入口页，里面有 `<div id="flasher-app">` 容器 |
| `.vuepress/config.js` | head 全局引入 flasher.js + 导航「产品 → 固件刷写」菜单项 |

## 快速对照

| 维度 | 说明 |
| --- | --- |
| 部署形态 | 纯静态，跟着 VuePress 一起 build，零后端 |
| 浏览器要求 | Chrome / Edge 89+（Web Serial API） |
| 协议 | Web Serial + esptool-js（CDN ESM 引入） |
| 固件清单 | `/firmware/manifest.json`，新增固件只改 JSON |
| 固件文件 | `/firmware/*.bin`，VuePress 原样拷贝 |
| 芯片支持 | ESP32 / ESP32-S2 / S3 / C3（esptool-js 内置） |
| 鉴权 | 浏览器原生串口授权（用户主动点击） |
| 数据流向 | 固件 URL → 浏览器 fetch → esptool-js → USB 串口 → 芯片 |

## 已知约定

- 波特率不暴露给用户：优先用固件清单 `baudrate` 字段，未指定则用默认 `921600`（ESP32 ROM 标准高速）。
- 端口 already open 兜底：`requestPort()` 后先 `port.close()` 一次再开，避免上次没断开导致连接失败。
- VID 0x303a / PID 0x1001 是 ESP32-S3 内置 USB-OTG 串口，esptool-js 原生支持。
- 示例 manifest 里登记的 `.bin` 文件尚未提供，需要把真固件拷到 `.vuepress/public/firmware/` 才能跑通烧录。
- 串口调试面板和烧录区**互斥**：`serialConnectBtn` 点击时检查 `state.connected`，反之亦然，避免一个串口被两个 reader 占用导致 `lock failed`。
- 串口调试模式波特率让用户选（115200 / 921600 / 等），因为这个模式没有固件清单来定义，且设备固件跑起来后的波特率由固件决定（不像 ROM bootloader 会自动协商）。
- 串口调试 HEX 模式：发送支持 `AA BB CC` / `AABBCC` / `0xAA,0xBB` 三种格式；接收直接显示空格分隔的 16 进制。
- 回车换行：发送文本模式自动追加 `\r\n`（可改 `\n` / `\r` / 无），便于 AT 命令调试。

## 已知坑：esptool-js atob-lite

esptool-js 0.6.0 的 `stubFlasher.js` 第一行 `import atob from "atob-lite"` 是 CJS 模块。直接通过 unpkg ESM 加载时，`default` 导出拿不到，导致 `atob(undefined)` → `Failed to execute 'atob' on 'Window': The string to be decoded is not correctly encoded`（[官方 issue #167](https://github.com/espressif/esptool-js/issues/167)）。

修复（双保险）：
1. **首选 esm.sh**：`https://esm.sh/esptool-js@0.6.0`，专门处理 CJS → ESM 转换并 polyfill Node 依赖。
2. **polyfill window.atob**：在加载 esptool-js 之前重写 `window.atob`，失败时清理非 base64 字符 + 补齐 padding 后重试。

`unpkg.com/esptool-js@0.6.0/lib/index.js` 仅作为最后兜底，已知有 bug。
