#!/usr/bin/env bash
# Run on the host with bash -s. No install/npm/secret regeneration.
set -euo pipefail
online_root=/home/www/vectorac/mahjong-service
online_archive="${ONLINE_ARCHIVE:?Set ONLINE_ARCHIVE to the exact uploaded release archive}"
online_count() { curl -fsS --max-time 8 http://127.0.0.1:3032/api/rooms | "$online_node" -e 'let b="";process.stdin.on("data",d=>b+=d);process.stdin.on("end",()=>{const j=JSON.parse(b);if(!j.ok||!Array.isArray(j.data.rooms))process.exit(2);process.stdout.write(String(j.data.rooms.length))})'; }
online_pid=$(systemctl show mahjong -p MainPID --value)
online_node=$(readlink "/proc/$online_pid/exe")
test -x "$online_node"
test -f "$online_archive"
test -f "$online_root/.env"
test "$(online_count)" = 0 || { echo 'BLOCKED: active rooms; no restart performed'; exit 10; }
umask 077
online_backup=/home/www/vectorac/.deploy/mahjong-before-online-$(date +%Y%m%d-%H%M%S).tar.gz
tar -czf "$online_backup" -C "$online_root" server.js config.js errors.js rooms engine scripts package.json package-lock.json
online_env_before=$(sha256sum "$online_root/.env" | cut -d' ' -f1)
online_stage=$(mktemp -d /home/www/vectorac/.deploy/gods-online.XXXXXX)
tar -xzf "$online_archive" -C "$online_stage"
"$online_node" --check "$online_stage/mahjong-service/server.js"
(cd "$online_stage/mahjong-service" && "$online_node" --input-type=module -e 'const m=await import("./rooms/adapters/index.js");if(m.resolveAdapter("fengshen").seatsPerRoom!==8)process.exit(2);console.log("package_import=ok")')
test "$(online_count)" = 0 || { echo 'BLOCKED: a room opened; no service files copied'; exit 10; }
rsync -rt --exclude=.env --exclude=data/ "$online_stage/mahjong-service/" "$online_root/"
if test "$(online_count)" != 0; then
 tar -xzf "$online_backup" -C "$online_root"
 echo 'BLOCKED: a room opened; original files restored without restart'
 exit 10
fi
systemctl restart mahjong
online_healthy=false
for online_attempt in 1 2 3 4 5; do
 if curl -fsS --max-time 3 http://127.0.0.1:3032/api/health >/dev/null; then online_healthy=true;break;fi
 sleep 1
done
if test "$online_healthy" != true; then
 tar -xzf "$online_backup" -C "$online_root"
 systemctl restart mahjong
 echo 'FAILED: original service restored; .env untouched'
 exit 20
fi
online_env_after=$(sha256sum "$online_root/.env" | cut -d' ' -f1)
test "$online_env_before" = "$online_env_after"
systemctl is-active mahjong
echo 'ENV_PRESERVED=true'
echo "backup=$online_backup"
echo "staging=$online_stage"
