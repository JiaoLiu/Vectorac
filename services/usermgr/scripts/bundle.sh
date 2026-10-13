#!/usr/bin/env bash
set -euo pipefail

echo "本地 macOS 打包已禁用：better-sqlite3 的原生模块不能跨平台部署。" >&2
echo "请在 GitHub Actions 中运行：Build usermgr Linux x64 package" >&2
exit 1
