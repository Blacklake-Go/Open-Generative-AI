#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SERVER_IP="${DEPLOY_SERVER_IP:-43.155.166.90}"
REMOTE_USER="${DEPLOY_USER:-ubuntu}"
REMOTE_WEB_DIR="/home/wwwroot/AI/domain/supdance.com/web"
BACKUP_MANIFEST="${SUPDANCE_DEPLOY_BACKUP_MANIFEST:-/home/ubuntu/backups/supdance-canvas-release.json}"
SNAPSHOT_ROOT="${SUPDANCE_DEPLOY_SOURCE_SNAPSHOT:-}"
REMOTE="${REMOTE_USER}@${SERVER_IP}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/supdance-canvas-release.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ ! "$BACKUP_MANIFEST" =~ ^/home/ubuntu/backups/[A-Za-z0-9._-]+\.json$ ]]; then
  echo "REFUSED: backup manifest must be a named JSON file under /home/ubuntu/backups." >&2
  exit 2
fi
if [ -z "$SNAPSHOT_ROOT" ]; then
  echo "REFUSED: set SUPDANCE_DEPLOY_SOURCE_SNAPSHOT to a separately frozen production source candidate." >&2
  exit 2
fi

SSH_OPTS=(-o BindInterface=en0 -o ConnectTimeout=15 -o BatchMode=yes -o StrictHostKeyChecking=no)
echo "[1/5] 在任何服务器写入前校验源码、配置、数据库、对象、当前构建和恢复演练备份..."
BACKUP_PREFLIGHT="$(env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
  ssh -T "${SSH_OPTS[@]}" "$REMOTE" \
  "sudo -n node --input-type=module - '$BACKUP_MANIFEST' '$REMOTE_WEB_DIR'" \
  < "$SCRIPT_DIR/verify-production-backup.mjs")"
echo "生产备份与回滚校验通过：$BACKUP_PREFLIGHT"

echo "[2/5] 校验冻结生产源快照、Linux 构建来源及 11 个 Canvas API 路由..."
SNAPSHOT_RESULT="$(node "$SCRIPT_DIR/verify-production-snapshot.mjs" "$SNAPSHOT_ROOT" "$BACKUP_PREFLIGHT")"
echo "候选源码与构建校验通过：$SNAPSHOT_RESULT"

echo "[3/5] 打包已验证的候选源码与独立构建..."
COPYFILE_DISABLE=1 tar -czf "$TMP_DIR/source_supdance_update.tar.gz" \
  --exclude='./.git' --exclude='./.next' --exclude='./node_modules' --exclude='./data' \
  --exclude='./.next-backup-*' --exclude='./.next-pre-*' --exclude='./.next-previous-*' --exclude='./.next-failed-*' \
  --exclude='./public/uploads' --exclude='./logs' --exclude='./.cache' --exclude='./coverage' \
  --exclude='./dist' --exclude='./.env' --exclude='./.env.*' \
  -C "$SNAPSHOT_ROOT" .
COPYFILE_DISABLE=1 tar -czf "$TMP_DIR/next_supdance_dist.tar.gz" -C "$SNAPSHOT_ROOT" .next
tar -tzf "$TMP_DIR/source_supdance_update.tar.gz" >/dev/null
tar -tzf "$TMP_DIR/next_supdance_dist.tar.gz" >/dev/null

echo "[4/5] 上传已校验发布包与恢复脚本..."
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
  scp "${SSH_OPTS[@]}" \
    "$TMP_DIR/next_supdance_dist.tar.gz" \
    "$TMP_DIR/source_supdance_update.tar.gz" \
    "$SCRIPT_DIR/remote-deploy-canvas-safe.sh" \
    "$SCRIPT_DIR/verify-production-backup.mjs" \
    "$SCRIPT_DIR/verify-production-snapshot.mjs" \
    "$REMOTE:/home/ubuntu/"

echo "[5/5] 切换并执行就绪、Session 与 CORS 验收；失败自动恢复原源码和构建..."
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
  ssh -T "${SSH_OPTS[@]}" "$REMOTE" \
  "sudo env SUPDANCE_DEPLOY_BACKUP_MANIFEST='$BACKUP_MANIFEST' bash /home/ubuntu/remote-deploy-canvas-safe.sh"
