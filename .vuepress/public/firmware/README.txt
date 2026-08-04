# Vectorac Robot 固件目录
#
# 把 .bin 固件文件放到本目录，然后在 manifest.json 里登记一项即可。
# 字段说明：
#   id         必填，页面内部用，唯一即可
#   name       必填，下拉框显示的名称
#   version    必填，版本号
#   file       必填，相对于站点根的 URL（一般是 /firmware/xxx.bin）
#   address    必填，烧录起始地址（如 "0x0" 或 "0x1000"）
#   flashMode  可选，dio/qio/qout/dout，默认 dio
#   flashFreq  可选，40m/80m/26m/20m，默认 40m
#   flashSize  可选，4MB/2MB/8MB/16MB，默认 4MB
#   baudrate   可选，连接波特率，默认 921600
#   date       可选，发布日期
#   note       可选，备注
#
# 发布流程：
#   1. 把编译出的 .bin 拷到本目录
#   2. 编辑 manifest.json 加入一项
#   3. git push，CI 自动 build & 部署
