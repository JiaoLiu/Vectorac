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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$(dirname "$SCRIPT_DIR")"

if [[ ! -f "$SRC_DIR/server.js" ]]; then
  echo "错误：未找到 server.js，请在解压后的 usermgr-service 目录中运行本脚本" >&2
  exit 1
fi

# ---- 参数 ----
INSTALL_DIR="${INSTALL_DIR:-/home/www/vectorac/usermgr-service}"
PORT="${PORT:-3031}"
HOST="${HOST:-127.0.0.1}"  # 只监听本地，nginx 反代对外
JWT_SECRET="${JWT_SECRET:?必须设置 JWT_SECRET}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?必须设置 ADMIN_PASSWORD}"
KEY_ENCRYPTION_SECRET="${KEY_ENCRYPTION_SECRET:?必须设置 KEY_ENCRYPTION_SECRET}"
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
# 同步代码（不含 data/ dist/ node_modules/）
rsync -a --delete \
  --exclude='data' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='dist' \
  "$SRC_DIR/" "$INSTALL_DIR/"

# ---- node_modules ----
if [[ -d "$SRC_DIR/node_modules" ]]; then
  rsync -a --delete "$SRC_DIR/node_modules/" "$INSTALL_DIR/node_modules/"
else
  echo "==> 安装依赖..."
  cd "$INSTALL_DIR" && npm install --omit=dev
fi

# ---- .env ----
cat > "$INSTALL_DIR/.env" <<EOF
PORT=$PORT
HOST=$HOST
JWT_SECRET=$JWT_SECRET
ADMIN_PASSWORD=$ADMIN_PASSWORD
KEY_ENCRYPTION_SECRET=$KEY_ENCRYPTION_SECRET
ADMIN_IP_WHITELIST=$ADMIN_IP_WHITELIST
EOF
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
ExecStart=$(which node) $INSTALL_DIR/server.js
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
echo "    管理密码: $ADMIN_PASSWORD"
echo "    nginx 配置: 参考 $INSTALL_DIR/scripts/usermgr-proxy.conf"
echo ""
echo "常用命令:"
echo "  systemctl status usermgr"
echo "  journalctl -u usermgr -f"
