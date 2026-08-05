# Vectorac 固件目录
#
# 目录结构：
#   /firmware/
#   ├── manifest.json          # 网页刷机用（所有产品统一清单，供 flasher.js 读取）
#   ├── {product}/             # 每个产品一个子目录，自包含
#   │   ├── latest.json        # OTA 检查接口：设备 GET /firmware/{product}/latest.json
#   │   └── xxx-{version}.bin  # 该产品的固件文件
#   └── README.txt             # 本文件
#
# product 标识用小写英文短名，如 xiaov / speaker / phone。
#
# --- 网页刷机 manifest.json 字段（所有产品共用一份）---
#   id         必填，页面内部用，唯一即可
#   name       必填，下拉框显示的名称
#   version    必填，版本号
#   file       必填，相对于站点根的 URL（如 /firmware/xiaov/xiaov-0.0.1-alpha.bin）
#   address    必填，烧录起始地址（如 "0x0" 或 "0x1000"）
#   flashMode  可选，dio/qio/qout/dout，默认 dio
#   flashFreq  可选，40m/80m/26m/20m，默认 40m
#   flashSize  可选，4MB/2MB/8MB/16MB，默认 4MB
#   baudrate   可选，连接波特率，默认 921600
#   date       可选，发布日期
#   note       可选，备注
#
# --- OTA 检查接口 {product}/latest.json 字段 ---
#   设备 GET /firmware/{product}/latest.json 拉取最新版本信息，对比 version 字段决定是否升级。
#   必填字段：version / url / address / size / checksum (格式 sha256:xxx)
#   可选字段：flashMode / flashFreq / flashSize / date / release_notes
#   checksum 用 `shasum -a 256 xxx.bin` 计算；size 用 `stat -f %z xxx.bin` (macOS)。
#
# --- 发布流程 ---
#   1. 把编译出的 .bin 拷到对应产品子目录（如 /firmware/xiaov/）
#   2. 编辑 /firmware/manifest.json 加入一项（供网页刷机使用）
#   3. 编辑 /firmware/{product}/latest.json 同步 version / url / size / checksum / date / release_notes（供 OTA 使用）
#   4. rsync 上传到服务器（.bin 不入 git，通过 rsync 单独部署）
#
# --- 新增产品 ---
#   1. 新建 /firmware/{product}/ 目录
#   2. 放入 .bin 固件文件
#   3. 创建该产品的 latest.json
#   4. 在 /firmware/manifest.json 里追加一项（file 字段指向 /firmware/{product}/xxx.bin）
