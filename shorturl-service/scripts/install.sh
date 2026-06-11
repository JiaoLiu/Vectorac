#!/usr/bin/env bash
# 一键安装/更新 Vectorac 短链服务
# 用法：先解压 tarball，再在解压目录中运行本脚本
#   tar -xzf shorturl-service-*.tar.gz
#   cd shorturl-service
#   sudo SHORT_BASE_URL=https://s.vectorac.com \
#        ADMIN_TOKEN=$(openssl rand -hex 16) \
#        bash scripts/install.sh
# 脚本幂等，重跑就升级（数据目录不会被覆盖）。
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "请用 sudo 运行：sudo bash scripts/install.sh" >&2
  exit 1
fi

# 脚本所在目录就是解压后的 shorturl-service 目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$(dirname "$SCRIPT_DIR")"

if [[ ! -f "$INSTALL_DIR/server.js" ]]; then
  echo "错误：未找到 server.js，请在解压后的 shorturl-service 目录中运行本脚本" >&2
  echo "" >&2
  echo "正确用法：" >&2
  echo "  tar -xzf shorturl-service-*.tar.gz" >&2
  echo "  cd shorturl-service" >&2
  echo "  sudo SHORT_BASE_URL=https://s.vectorac.com ADMIN_TOKEN=\$(openssl rand -hex 16) bash scripts/install.sh" >&2
  exit 1
fi

# ---- 可调参数（env 注入）----
# 默认跟你的官网静态站平级，放在 /home/www/vectorac/shorturl-service/
# 可通过环境变量 INSTALL_DIR 覆盖
INSTALL_DIR="${INSTALL_DIR:-/home/www/vectorac/shorturl-service}"
PORT="${PORT:-3030}"
SHORT_BASE_URL="${SHORT_BASE_URL:-http://localhost:${PORT}}"
ADMIN_TOKEN="${ADMIN_TOKEN:-admin-$(openssl rand -hex 8)}"

echo "==> 安装目录:   $INSTALL_DIR"
echo "==> 端口:       $PORT"
echo "==> 短链前缀:   $SHORT_BASE_URL"

# ---- 自动检测运行用户 ----
# 1) 跟现有 vectorac 目录的所有者保持一致（最自然）
# 2) 否则用 SUDO_USER
# 3) 再否则用 www-data
DETECTED_OWNER="$(stat -c '%U:%G' /home/www/vectorac 2>/dev/null || true)"
if [[ -n "$DETECTED_OWNER" ]]; then
  RUN_USER="${RUN_USER:-${DETECTED_OWNER%:*}}"
  RUN_GROUP="${RUN_GROUP:-${DETECTED_OWNER#*:}}"
fi
RUN_USER="${RUN_USER:-${SUDO_USER:-www-data}}"
RUN_GROUP="${RUN_GROUP:-$(id -gn "$RUN_USER" 2>/dev/null || echo "$RUN_USER")}"
echo "==> 运行用户:   $RUN_USER:$RUN_GROUP"

# ---- 自动检测 Node.js 路径 ----
# 优先使用 nvm 版本，否则用系统默认
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi
NODE_PATH="$(which node 2>/dev/null || echo /usr/bin/node)"
echo "==> Node.js 路径: $NODE_PATH"

# 1. 复制文件到安装目录（直接覆盖升级）
echo "==> 复制文件 → $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
# 用 rsync 复制，排除 scripts 目录中不需要的 bundle.sh
rsync -a --delete \
  --exclude='scripts/bundle.sh' \
  --exclude='data/' \
  "$SCRIPT_DIR/../" "$INSTALL_DIR/"
# 保留已有的 data 目录
[ -d "$INSTALL_DIR/data" ] || mkdir -p "$INSTALL_DIR/data"

# 2. 写 .env（systemd 的 EnvironmentFile 会读它；每次 install 重新生成）
ENV_FILE="$INSTALL_DIR/.env"
echo "==> 写入 $ENV_FILE"
cat > "$ENV_FILE" <<EOF
# Vectorac 短链服务环境变量（install.sh 生成，权限 600）
PORT=$PORT
HOST=127.0.0.1
SHORT_BASE_URL=$SHORT_BASE_URL
ADMIN_TOKEN=$ADMIN_TOKEN
EOF
chmod 600 "$ENV_FILE"

# 3. 生成 systemd unit（替换占位符）
UNIT_FILE="/etc/systemd/system/shorturl.service"
echo "==> 生成 $UNIT_FILE"
sed -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    -e "s|__RUN_USER__|$RUN_USER|g" \
    -e "s|__RUN_GROUP__|$RUN_GROUP|g" \
    -e "s|__NODE_PATH__|$NODE_PATH|g" \
    "$INSTALL_DIR/scripts/shorturl.service" > "$UNIT_FILE"

# 4. chown 让服务用户能读（node_modules 也要可读）
echo "==> 设置权限 chown -R $RUN_USER:$RUN_GROUP $INSTALL_DIR"
chown -R "$RUN_USER:$RUN_GROUP" "$INSTALL_DIR"
# data 目录要可写
chmod 755 "$INSTALL_DIR/data"

# 5. 启停
systemctl daemon-reload
systemctl enable shorturl.service
echo "==> 重启服务"
systemctl restart shorturl.service
sleep 1

# 6. 状态
echo ""
echo "=== 服务状态 ==="
systemctl --no-pager --full status shorturl.service | head -10 || true
echo ""

# 7. 检查
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "==> 端口 $PORT 已监听 ✓"
else
  echo "==> 端口 $PORT 暂未监听，请执行 journalctl -u shorturl -n 50 查看日志" >&2
fi
if curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
  echo "==> /healthz 通过 ✓"
else
  echo "==> /healthz 失败，请查看日志" >&2
fi

# 8. nginx 提示
NGINX_SNIPPET="$INSTALL_DIR/scripts/shorturl-proxy.conf"
echo ""
echo "================ 接下来：让 s.vectorac.com 能访问 ================"
echo "DNS 你的 *.vectorac.com 已经通，所以 s.vectorac.com 不用动。"
echo ""
echo "推荐：直接当 conf.d 文件用（nginx.conf 默认 include /etc/nginx/conf.d/*.conf）"
echo "  sudo cp $NGINX_SNIPPET /etc/nginx/conf.d/shorturl.conf"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "或者合并到现有 vectorac.conf：把 $NGINX_SNIPPET 里两个 location 块"
echo "  拷进 /etc/nginx/conf.d/vectorac.conf 的 server { } 里"
echo ""
echo "================ 目录结构 ================"
echo "$INSTALL_DIR/"
echo "├── server.js  db.js  package.json"
echo "├── node_modules/        # 已装好，无需再 npm install"
echo "├── public/  views/  scripts/"
echo "├── data/                # shorturl.json 在这里（备份这个）"
echo "└── .env                 # PORT / SHORT_BASE_URL / ADMIN_TOKEN"
echo ""
echo "================ 常用命令 ================"
echo "  sudo systemctl status shorturl     # 状态"
echo "  sudo systemctl restart shorturl    # 重启"
echo "  sudo journalctl -u shorturl -f     # 实时日志"
echo "  sudo vim $ENV_FILE && sudo systemctl restart shorturl   # 改配置"
echo ""
echo "  管理员令牌：$ADMIN_TOKEN"
