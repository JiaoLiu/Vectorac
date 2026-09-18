#!/usr/bin/env bash
# 一键安装/更新 Vectorac 联机麻将服务
# 用法：先解压 tarball，再在解压目录中运行本脚本
#   tar -xzf mahjong-service-*.tar.gz
#   cd mahjong-service
#   sudo ADMIN_TOKEN=$(openssl rand -hex 16) bash scripts/install.sh
# 脚本幂等，重跑就升级（.env 不会被覆盖，只补缺失字段）。
#
# 说明：本服务只监听 127.0.0.1，对外由 nginx 反代到 vectorac.com 同源路径
#   /api/rooms、/api/game-stats（HTTP）与 /mahjong-ws（WebSocket）。
#   nginx 配置见 scripts/mahjong-proxy.conf（location 块需合并进主 server 块）。
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "请用 sudo 运行：sudo bash scripts/install.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$(dirname "$SCRIPT_DIR")"

if [[ ! -f "$SRC_DIR/server.js" ]]; then
  echo "错误：未找到 server.js，请在解压后的 mahjong-service 目录中运行本脚本" >&2
  exit 1
fi
# engine/ 里的真实引擎文件来自打包时覆盖；缺失说明包不完整
for f in contract rules engine ai; do
  if [[ ! -f "$SRC_DIR/engine/$f.js" ]]; then
    echo "错误：缺少 engine/$f.js，部署包不完整（请重新执行 bash scripts/bundle.sh 打包）" >&2
    exit 1
  fi
done

# ---- 自动检测 Node.js 路径（sudo 下 PATH 可能不含 nvm）----
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi
NODE_PATH="$(which node 2>/dev/null || echo /usr/bin/node)"
if [[ ! -x "$NODE_PATH" ]]; then
  echo "错误：找不到 Node.js，请先安装 Node.js 18+（建议 20/22 LTS）" >&2
  exit 1
fi
NODE_MAJOR="$("$NODE_PATH" -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 18 )); then
  echo "错误：当前是 $("$NODE_PATH" -v)，本服务需要 Node.js 18 及以上" >&2
  exit 1
fi
echo "==> Node.js: $("$NODE_PATH" -v) ($NODE_PATH)"

# ---- 可调参数（env 注入）----
INSTALL_DIR="${INSTALL_DIR:-/home/www/vectorac/mahjong-service}"
PORT="${PORT:-3032}"
HOST="${HOST:-127.0.0.1}"   # 只监听本地，nginx 反代对外
WS_PATH="${WS_PATH:-/mahjong-ws}"
ADMIN_TOKEN="${ADMIN_TOKEN:-admin-$(openssl rand -hex 8)}"

# ---- 自动检测运行用户：跟 vectorac 目录所有者保持一致 ----
DETECTED_OWNER="$(stat -c '%U:%G' /home/www/vectorac 2>/dev/null || true)"
if [[ -n "$DETECTED_OWNER" ]]; then
  RUN_USER="${RUN_USER:-${DETECTED_OWNER%:*}}"
  RUN_GROUP="${RUN_GROUP:-${DETECTED_OWNER#*:}}"
fi
RUN_USER="${RUN_USER:-${SUDO_USER:-www-data}}"
RUN_GROUP="${RUN_GROUP:-$(id -gn "$RUN_USER" 2>/dev/null || echo "$RUN_USER")}"

echo "==> 安装目录: $INSTALL_DIR"
echo "==> 端口:     $PORT (监听 $HOST)"
echo "==> WS 路径:  $WS_PATH"
echo "==> 运行用户: $RUN_USER:$RUN_GROUP"

# ---- 1. 复制文件（保留 .env）----
if [[ "$SRC_DIR" != "$INSTALL_DIR" ]]; then
  echo "==> 复制文件 → $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  # node_modules 已随 tarball 带过来（纯 JS 依赖，服务器不需要 npm）
  rsync -a --delete \
    --exclude='.env' \
    --exclude='dist' \
    --exclude='scripts/bundle.sh' \
    "$SRC_DIR/" "$INSTALL_DIR/"
else
  echo "==> 源码已在 $INSTALL_DIR，跳过复制"
fi

# ---- 2. .env（systemd EnvironmentFile 读取它）----
ENV_FILE="$INSTALL_DIR/.env"
echo "==> 处理 $ENV_FILE"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
# 已有值不动，只补缺失字段：升级时不会覆盖生产配置
ensure_env() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    echo "    · $key 已有，保留"
  else
    echo "    + $key=$val"
    echo "$key=$val" >> "$ENV_FILE"
  fi
}
ensure_env PORT "$PORT"
ensure_env HOST "$HOST"
ensure_env WS_PATH "$WS_PATH"
ensure_env ADMIN_TOKEN "$ADMIN_TOKEN"
# 容量与超时（不填则用 config.js 内置默认值：20 房 / 摸打 30s / 定缺 20s / 2 路 AI 并发）
ensure_env MAX_ROOMS "20"
ensure_env TURN_TIMEOUT_SECONDS "30"
ensure_env VOID_TIMEOUT_SECONDS "20"
ensure_env MIN_ROOM_TURN_TIMEOUT_SECONDS "10"
ensure_env MAX_ROOM_TURN_TIMEOUT_SECONDS "600"
ensure_env DISCONNECTED_AI_DELAY_MS "1500"
ensure_env WAITING_ROOM_TTL_MINUTES "30"
ensure_env WAITING_DISCONNECTED_TTL_MINUTES "10"
ensure_env FINISHED_ROOM_TTL_MINUTES "10"
ensure_env SWEEP_INTERVAL_SECONDS "30"
ensure_env AI_MAX_CONCURRENCY "2"
ensure_env AI_DECISION_TIMEOUT_MS "3000"
ensure_env AI_LEVEL "normal"
ensure_env LOG_LEVEL "info"

# ---- 3. systemd unit（替换占位符）----
UNIT_FILE="/etc/systemd/system/mahjong.service"
echo "==> 生成 $UNIT_FILE"
sed -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
    -e "s|__RUN_USER__|$RUN_USER|g" \
    -e "s|__RUN_GROUP__|$RUN_GROUP|g" \
    -e "s|__NODE_PATH__|$NODE_PATH|g" \
    "$INSTALL_DIR/scripts/mahjong.service" > "$UNIT_FILE"

# ---- 4. 权限 ----
chown -R "$RUN_USER:$RUN_GROUP" "$INSTALL_DIR"

# ---- 5. 启停 ----
systemctl daemon-reload
systemctl enable mahjong.service
echo "==> 重启服务"
systemctl restart mahjong.service
sleep 1

# ---- 6. 状态与自检 ----
echo ""
echo "=== 服务状态 ==="
systemctl --no-pager --full status mahjong.service | head -10 || true
echo ""
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "==> 端口 $PORT 已监听 ✓"
else
  echo "==> 端口 $PORT 暂未监听，请执行 journalctl -u mahjong -n 50 查看日志" >&2
fi
if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "==> /api/health 通过 ✓"
else
  echo "==> /api/health 失败，请查看日志" >&2
fi

# ---- 7. nginx 提示 ----
NGINX_SNIPPET="$INSTALL_DIR/scripts/mahjong-proxy.conf"
echo ""
echo "================ 接下来：让官网能连上联机服务 ================"
echo "联机大厅走官网同源路径（无需改前端）："
echo "  HTTP  /api/rooms      房间列表 / 创建 / 加入"
echo "  HTTP  /api/game-stats  后台统计（需 X-Admin-Token）"
echo "  WS    $WS_PATH"
echo ""
echo "把 $NGINX_SNIPPET 里的 location 块合并进 vectorac.com 主 server { }："
echo "  sudo vim /etc/nginx/conf.d/vectorac.conf"
echo "  # 粘贴 location 块后："
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "注意：nginx 要允许 WebSocket 升级（配置里已含 Upgrade/Connection 头），"
echo "      且 proxy_read_timeout 要足够大，否则长连接会被 60s 掐断。"
echo ""
echo "================ 常用命令 ================"
echo "  sudo systemctl status mahjong     # 状态"
echo "  sudo systemctl restart mahjong    # 重启"
echo "  sudo journalctl -u mahjong -f     # 实时日志（JSON 结构化）"
echo "  sudo vim $ENV_FILE && sudo systemctl restart mahjong   # 改配置"
echo ""
echo "  统计接口令牌：$ADMIN_TOKEN"
echo "  查看统计：curl -H 'X-Admin-Token: <token>' http://127.0.0.1:$PORT/api/game-stats"