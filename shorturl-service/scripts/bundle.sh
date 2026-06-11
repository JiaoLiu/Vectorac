#!/usr/bin/env bash
# 把短链服务打成自包含的 tarball（含 node_modules），上传到服务器后无需 npm install。
# 用法：cd shorturl-service && bash scripts/bundle.sh
# 产物：dist/shorturl-service-YYYYMMDD-HHmm.tar.gz
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="dist/shorturl-service-${STAMP}.tar.gz"
WORK="$(mktemp -d 2>/dev/null || mkdir -p "${TMPDIR:-/tmp}/shorturl-pack" && echo "${TMPDIR:-/tmp}/shorturl-pack")"
trap "rm -rf $WORK 2>/dev/null" EXIT

echo "==> 复制源码到临时目录"
mkdir -p "$WORK/shorturl-service"
cp -r server.js db.js package.json README.md public views scripts "$WORK/shorturl-service/"
# 清理工作目录，避免把开发期数据打包进去
rm -rf "$WORK/shorturl-service/public/app.js.bak"
[ -d "$WORK/shorturl-service/data" ] && rm -rf "$WORK/shorturl-service/data"
[ -f "$WORK/shorturl-service/test.js" ] && rm -f "$WORK/shorturl-service/test.js"
[ -f "$WORK/shorturl-service/test-cache.js" ] && rm -f "$WORK/shorturl-service/test-cache.js"

echo "==> 安装生产依赖（首次约 20s）"
cd "$WORK/shorturl-service"
if ! npm install --omit=dev --omit=optional --no-audit --no-fund --no-progress 2>&1 | tail -3; then
  echo "==> npm install 失败，从父仓库的 node_modules 递归复制依赖"
  PARENT_NM="$(cd "$HERE/.." && pwd)/node_modules"
  if [ ! -d "$PARENT_NM/express" ] || [ ! -d "$PARENT_NM/write-file-atomic" ]; then
    echo "✗ 父仓库也没有这些依赖，请检查网络或手动 npm install" >&2
    exit 1
  fi
  # 递归读取 package.json 的 dependencies 字段，把所有包复制过去（兼容 bash 3.2）
  DEPS_FILE="$WORK/.deps"
  : > "$DEPS_FILE"
  walk_deps() {
    local pkg="$1"
    grep -qxF "$pkg" "$DEPS_FILE" 2>/dev/null && return 0
    echo "$pkg" >> "$DEPS_FILE"
    [ -f "$PARENT_NM/$pkg/package.json" ] || return 0
    python3 -c "
import json
p = json.load(open('$PARENT_NM/$pkg/package.json'))
for d in p.get('dependencies', {}):
    print(d)
" 2>/dev/null | while read -r sub; do
      walk_deps "$sub"
    done
  }
  walk_deps express
  walk_deps write-file-atomic

  mkdir -p "$WORK/shorturl-service/node_modules"
  COUNT=0
  while read -r pkg; do
    [ -d "$PARENT_NM/$pkg" ] && cp -r "$PARENT_NM/$pkg" "$WORK/shorturl-service/node_modules/" && COUNT=$((COUNT+1))
  done < "$DEPS_FILE"
  echo "==> 已复制 $COUNT 个包到 node_modules"
fi

echo "==> 打包"
mkdir -p "$HERE/dist"
cd "$WORK"
tar -czf "$HERE/$OUT" shorturl-service
cd "$HERE"

SIZE=$(du -h "$OUT" | cut -f1)
echo ""
echo "✓ 已生成: $OUT  ($SIZE)"
echo "  上传并部署："
echo "    scp $OUT <user>@<server>:"
echo "    ssh <user>@<server>"
echo "    tar -xzf $(basename $OUT)"
echo "    cd shorturl-service"
echo "    sudo SHORT_BASE_URL=https://s.vectorac.com \\"
echo "         ADMIN_TOKEN=\$(openssl rand -hex 16) \\"
echo "         bash scripts/install.sh"
