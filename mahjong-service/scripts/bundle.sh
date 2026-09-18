#!/usr/bin/env bash
# 把联机麻将服务打成自包含 tarball（含 node_modules），上传到服务器后无需 npm install。
# 用法：cd mahjong-service && bash scripts/bundle.sh
# 产物：dist/mahjong-service-YYYYMMDD-HHmm.tar.gz
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

DIST_DIR="${DIST_DIR:-$HERE/dist}"
mkdir -p "$DIST_DIR"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="$DIST_DIR/mahjong-service-${STAMP}.tar.gz"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK" 2>/dev/null' EXIT

echo "==> 复制源码到临时目录"
mkdir -p "$WORK/mahjong-service"
cp -r server.js config.js errors.js engine rooms scripts package.json package-lock.json README.md \
  "$WORK/mahjong-service/"

# 规则只有一份（文档 §六十六：不要复制第二套麻将规则）：
# 仓库内 engine/*.js 是薄 re-export，指向 .vuepress/components/mahjong/。
# 打包时用真实文件覆盖，服务端才能在独立部署形态下自包含运行。
SRC_MJ="$(cd "$HERE/../.vuepress/components/mahjong" && pwd)"
echo "==> 用真实规则引擎 / AI 覆盖 engine/ 薄转发层"
for f in contract rules engine ai; do
  if [ ! -f "$SRC_MJ/$f.js" ]; then
    echo "✗ 找不到 $SRC_MJ/$f.js，无法打包" >&2
    exit 1
  fi
  cp "$SRC_MJ/$f.js" "$WORK/mahjong-service/engine/$f.js"
done

# 不打包开发期文件
rm -f "$WORK/mahjong-service/test.js"
rm -rf "$WORK/mahjong-service/dist"

# 复用本目录已装好的 node_modules（express / ws / dotenv 均为纯 JS，无原生模块）
if [ -d "$HERE/node_modules/express" ] && [ -d "$HERE/node_modules/ws" ] && [ -d "$HERE/node_modules/dotenv" ]; then
  echo "==> 复用本地 node_modules（已装好，跳过 npm install）"
  cp -r "$HERE/node_modules" "$WORK/mahjong-service/"
else
  echo "==> 本地 node_modules 缺失，跑 npm install（首次约 20s）"
  (cd "$WORK/mahjong-service" &&
    npm install --omit=dev --omit=optional --no-audit --no-fund --no-progress)
fi

echo "==> 打包"
cd "$WORK"
tar -czf "$OUT" mahjong-service
cd "$HERE"

SIZE=$(du -h "$OUT" | cut -f1)
echo ""
echo "✓ 已生成: $OUT  ($SIZE)"
echo "  在 Finder 打开: open $DIST_DIR"
echo ""
echo "  上传并部署（中转目录用官网同级 .deploy，不要用 /tmp；详见 README.md）："
echo "    ssh <user>@<server> 'mkdir -p /home/www/vectorac/.deploy'"
echo "    scp $OUT <user>@<server>:/home/www/vectorac/.deploy/"
echo "    ssh <user>@<server>"
echo "    cd /home/www/vectorac/.deploy && rm -rf mahjong-service"
echo "    tar -xzf $(basename "$OUT")   # 解出 .deploy/mahjong-service/"
echo "    cd mahjong-service && sudo ADMIN_TOKEN=\$(openssl rand -hex 16) bash scripts/install.sh"
echo "    # 安装目录：/home/www/vectorac/mahjong-service（与官网 dist/ 平级）"