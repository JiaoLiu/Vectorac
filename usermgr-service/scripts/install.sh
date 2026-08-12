#!/usr/bin/env bash
# 一键安装/更新 Vectorac 用户管理服务
# 用法：先解压 tarball，再在解压目录中运行本脚本
#   tar -xzf usermgr-service-*.tar.gz
#   cd usermgr-service
#   sudo PORT=3031 \
#        JWT_SECRET=$(openssl rand -hex 32) \
#        ADMIN_PASSWORD=$(openssl rand -hex 8) \
#        KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32) \
#        bash scripts/install.sh
# 脚本幂等，重跑就升级（数据目录不会被覆盖）
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "请用 sudo 运行：sudo bash scripts/install.sh" >&2
  exit 1
fi

# 检测可用的 Node.js（sudo 环境下 PATH 可能不含 nvm）
NODE_BIN="$(which node 2>/dev/null || true)"
# 如果 sudo 下是旧版 Node，尝试找 nvm 的
if [[ -z "$NODE_BIN" ]] || "$NODE_BIN" -v 2>/dev/null | grep -q 'v10\.'; then
  if [[ -f /root/.nvm/versions/node/v22.22.0/bin/node ]]; then
    export PATH="/root/.nvm/versions/node/v22.22.0/bin:$PATH"
    NODE_BIN=/root/.nvm/versions/node/v22.22.0/bin/node
  elif [[ -f "$HOME/.nvm/versions/node/v22.22.0/bin/node" ]]; then
    export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH"
    NODE_BIN="$HOME/.nvm/versions/node/v22.22.0/bin/node"
  fi
fi
if [[ -z "$NODE_BIN" ]] || [[ ! -x "$NODE_BIN" ]]; then
  echo "错误：找不到 Node.js，请先安装 Node.js 20 或 22 LTS" >&2
  exit 1
fi

NODE_MAJOR="$($NODE_BIN -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 20 )); then
  echo "错误：当前是 $($NODE_BIN -v)，请升级到 Node.js 20 或 22 LTS" >&2
  exit 1
fi

echo "==> Node: $($NODE_BIN -v) ($NODE_BIN)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$(dirname "$SCRIPT_DIR")"

if [[ ! -f "$SRC_DIR/server.js" ]]; then
  echo "错误：未找到 server.js，请在解压后的 usermgr-service 目录中运行本脚本" >&2
  exit 1
fi
NATIVE_MODULE="$SRC_DIR/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
if [[ ! -f "$NATIVE_MODULE" ]]; then
  echo "错误：部署包不含 Linux x64 node_modules。" >&2
  echo "请从 GitHub Actions 的 Build usermgr Linux x64 package 下载构建产物。" >&2
  echo "为保护服务器，本脚本不会运行 npm install 或源码编译。" >&2
  exit 1
fi
if command -v file >/dev/null 2>&1 && ! file "$NATIVE_MODULE" | grep -q 'ELF 64-bit.*x86-64'; then
  echo "错误：better-sqlite3 不是 Linux x64 二进制：$(file "$NATIVE_MODULE")" >&2
  exit 1
fi

# ---- 参数 ----
INSTALL_DIR="${INSTALL_DIR:-/home/www/vectorac/usermgr-service}"
PORT="${PORT:-3031}"
HOST="${HOST:-127.0.0.1}"  # 只监听本地，nginx 反代对外
EXISTING_ENV="$INSTALL_DIR/.env"
if [[ ! -f "$EXISTING_ENV" ]]; then
  JWT_SECRET="${JWT_SECRET:?首次安装必须设置 JWT_SECRET}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:?首次安装必须设置 ADMIN_PASSWORD}"
  KEY_ENCRYPTION_SECRET="${KEY_ENCRYPTION_SECRET:?首次安装必须设置 KEY_ENCRYPTION_SECRET}"
fi
ADMIN_IP_WHITELIST="${ADMIN_IP_WHITELIST:-}"  # 留空则只靠密码

# 运行用户：跟 vectorac 目录所有者一致
DETECTED_OWNER="$(stat -c '%U:%G' /home/www/vectorac 2>/dev/null || true)"
if [[ -n "$DETECTED_OWNER" ]]; then
  RUN_USER="${RUN_USER:-${DETECTED_OWNER%:*}}"
  RUN_GROUP="${RUN_GROUP:-${DETECTED_OWNER#*:}}"
else
  RUN_USER="${RUN_USER:-www-data}"
  RUN_GROUP="${RUN_GROUP:-www-data}"
fi

echo "==> 安装目录: $INSTALL_DIR"
echo "==> 端口:     $PORT (监听 $HOST)"
echo "==> 运行用户: $RUN_USER:$RUN_GROUP"

# ---- 复制文件（保留 data/）----
mkdir -p "$INSTALL_DIR"
# 备份现有 .env（如果存在）
if [[ -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env" "$INSTALL_DIR/.env.bak.$(date +%s)"
fi
# 同步代码和已经构建好的 Linux node_modules（保留 data/ 和 .env）
rsync -a --delete \
  --exclude='data' \
  --exclude='.env' \
  --exclude='dist' \
  "$SRC_DIR/" "$INSTALL_DIR/"

# ---- node_modules ----
echo "==> 使用部署包内预构建的 Linux x64 依赖（服务器不运行 npm）"

# ---- .env ----
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
cat > "$INSTALL_DIR/.env" <<EOF
PORT=$PORT
HOST=$HOST
JWT_SECRET=$JWT_SECRET
ADMIN_PASSWORD=$ADMIN_PASSWORD
KEY_ENCRYPTION_SECRET=$KEY_ENCRYPTION_SECRET
ADMIN_IP_WHITELIST=$ADMIN_IP_WHITELIST
EOF
else
  echo "==> 保留现有 .env（密钥不变）"
fi
chmod 600 "$INSTALL_DIR/.env"
chown -R "$RUN_USER:$RUN_GROUP" "$INSTALL_DIR"

# ---- systemd unit ----
UNIT_FILE="/etc/systemd/system/usermgr.service"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Vectorac User Management Service
After=network.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$NODE_BIN $INSTALL_DIR/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable usermgr
systemctl restart usermgr

# ---- 等待启动 ----
sleep 1
if curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  echo "==> 启动成功: http://127.0.0.1:$PORT/healthz → ok"
else
  echo "==> 警告：healthz 未响应，查看日志：journalctl -u usermgr -n 50" >&2
fi

echo ""
echo "==> 部署完成"
echo "    管理后台: http://<服务器IP>:$PORT/admin/  (IP 访问，不绑域名)"
if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
  echo "    管理密码: $ADMIN_PASSWORD"
else
  echo "    管理密码: 沿用现有 .env"
fi
echo "    nginx 配置: 参考 $INSTALL_DIR/scripts/usermgr-proxy.conf"
echo ""
echo "常用命令:"
echo "  systemctl status usermgr"
echo "  journalctl -u usermgr -f"
