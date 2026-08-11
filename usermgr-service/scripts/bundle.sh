#!/usr/bin/env bash
# 打包 usermgr-service 为 tarball（含 node_modules）
# 用法：bash scripts/bundle.sh
# 产物：dist/usermgr-service-YYYYMMDD-HHMMSS.tar.gz
set -euo pipefail

cd "$(dirname "$0")/.."
VERSION="$(date +%Y%m%d-%H%M%S)"
DIST_DIR="dist"
OUT="$DIST_DIR/usermgr-service-$VERSION.tar.gz"

mkdir -p "$DIST_DIR"

echo "==> 安装生产依赖..."
npm install --omit=dev

echo "==> 打包 -> $OUT"
tar -czf "$OUT" \
  --exclude='dist' \
  --exclude='data' \
  --exclude='.git' \
  --exclude='test.js' \
  --exclude='*.tar.gz' \
  server.js db.js package.json \
  public scripts

echo "==> 完成: $OUT ($(du -h "$OUT" | cut -f1))"
echo "    scp $OUT root@jane66.com:"
echo "    ssh root@jane66.com 'tar -xzf usermgr-service-*.tar.gz && cd usermgr-service && sudo PORT=3031 JWT_SECRET=\$(openssl rand -hex 32) ADMIN_PASSWORD=\$(openssl rand -hex 8) KEY_ENCRYPTION_SECRET=\$(openssl rand -hex 32) bash scripts/install.sh'"
