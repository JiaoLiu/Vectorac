# Vectorac 固件目录
#
# 目录结构：
#   /firmware/
#   ├── manifest.json                       # 网页刷机清单（所有产品共用，可含完整镜像和 app 升级包）
#   ├── {product}/                          # 每个产品一个子目录，自包含
#   │   ├── recovery/latest.json            # 恢复出厂接口：GET /firmware/{product}/recovery/latest.json
#   │   ├── ota/latest.json                 # OTA 升级接口：GET /firmware/{product}/ota/latest.json
#   │   ├── {product}-{ver}-full.bin       # 完整镜像（bootloader+分区表+app+LittleFS），刷 0x0
#   │   └── {product}-{ver}-app.bin        # app 升级包（仅 app 段），刷 0x10000
#   └── README.txt
#
# product 标识用小写英文短名，如 xiaov / speaker / phone。
#
# --- 三种使用场景 ---
#   1. 网页刷机（flasher.js）：读 /firmware/manifest.json，用户选具体条目，可烧完整镜像或 app 升级包
#   2. 设备 OTA 升级：GET /firmware/{product}/ota/latest.json → 下载 app.bin → 写 0x10000（OTA 分区）
#      注：ESP32 Update API 只能写 OTA 分区，不能写 0x0，所以 OTA 只能用 app 升级包
#   3. 设备恢复出厂：GET /firmware/{product}/recovery/latest.json → 下载 full.bin → 写 0x0（需特殊烧录工具，非 OTA）
#
# --- 网页刷机 manifest.json 字段（所有产品共用一份）---
#   id         必填，页面内部用，唯一即可
#   name       必填，下拉框显示的名称
#   version    必填，版本号
#   file       必填，相对于站点根的 URL（如 /firmware/xiaov/xiaov-0.0.1-alpha-full.bin）
#   address    必填，烧录起始地址（完整镜像 "0x0"，app 升级包 "0x10000"）
#   flashMode  可选，dio/qio/qout/dout，默认 dio
#   flashFreq  可选，40m/80m/26m/20m，默认 40m
#   flashSize  可选，4MB/2MB/8MB/16MB，默认 4MB
#   baudrate   可选，连接波特率，默认 921600
#   date       可选，发布日期
#   note       可选，备注
#
# --- OTA / Recovery 接口 {product}/{type}/latest.json 字段 ---
#   设备 GET /firmware/{product}/{type}/latest.json 拉取最新版本信息，对比 version 字段决定是否升级。
#   type 取值：ota（app 升级包，写 0x10000） / recovery（完整镜像，写 0x0）
#
#   必填字段：
#     version        版本号
#     url            固件下载 URL
#     address        烧录起始地址（ota 用 0x10000，recovery 用 0x0）
#     size           文件字节数
#     checksum       格式 sha256:xxx
#     flashMode      dio/qio/qout/dout
#     flashFreq      40m/80m/26m/20m
#     flashSize      4MB/2MB/8MB/16MB
#     date           发布日期
#     release_notes  发布说明
#
#   可选字段（app + LittleFS 双文件 OTA 时使用）：
#     littlefs_url        LittleFS 镜像 URL
#     littlefs_size       LittleFS 字节数
#     littlefs_checksum   格式 sha256:xxx
#
#   checksum 用 `shasum -a 256 xxx.bin` 计算；size 用 `stat -f %z xxx.bin` (macOS)。
#   暂无升级包时，version 设为 "0.0.0"、url 设为 ""，设备端识别后跳过升级。
#
#   示例 1：只发 app（90% 场景）
#     { "version": "1.0.1", "url": ".../xiaov-1.0.1.bin",
#       "address": "0x10000", "size": 2451431,
#       "checksum": "sha256:xxxxx...",
#       "flashMode": "dio", "flashFreq": "80m", "flashSize": "16MB",
#       "date": "2026-08-05", "release_notes": "..." }
#
#   示例 2：app + LittleFS（提示音/数据文件变化时）
#     { "version": "1.0.1", "url": ".../xiaov-1.0.1.bin",
#       "address": "0x10000", "size": 2451431,
#       "checksum": "sha256:xxxxx...",
#       "flashMode": "dio", "flashFreq": "80m", "flashSize": "16MB",
#       "date": "2026-08-05", "release_notes": "...",
#       "littlefs_url": ".../xiaov-1.0.1-littlefs.bin",
#       "littlefs_size": 1100000, "littlefs_checksum": "sha256:yyyyy..." }
#
# --- 发布流程 ---
#   1. 把编译出的 .bin 拷到对应产品子目录
#      - 完整镜像：{product}-{ver}-full.bin（PlatformIO「合并二进制」产物）
#      - app 升级包：{product}-{ver}-app.bin（PlatformIO「.pio/build/{env}/firmware.bin」）
#   2. 编辑 /firmware/manifest.json 加入对应条目（供网页刷机使用）
#   3. 编辑 /firmware/{product}/ota/latest.json 或 recovery/latest.json
#      同步 version / url / size / checksum / date / release_notes
#   4. rsync 上传到服务器（.bin 不入 git，通过 rsync 单独部署）
#
# --- 新增产品 ---
#   1. 新建 /firmware/{product}/ 目录，并建 ota/ 和 recovery/ 子目录
#   2. 放入 .bin 固件文件（full 和 app 两种）
#   3. 创建 ota/latest.json 和 recovery/latest.json
#   4. 在 /firmware/manifest.json 里追加条目（file 字段指向 /firmware/{product}/xxx.bin）
