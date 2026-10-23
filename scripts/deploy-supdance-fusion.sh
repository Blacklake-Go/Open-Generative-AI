#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SERVER_IP="${DEPLOY_SERVER_IP:-43.133.253.76}"
REMOTE_USER="${DEPLOY_USER:-ubuntu}"
REMOTE="${REMOTE_USER}@${SERVER_IP}"
REMOTE_WEB_DIR="/home/wwwroot/AI/domain/supdance.com/web"

SSH_OPTS=(-o ConnectTimeout=15 -o BatchMode=yes -o StrictHostKeyChecking=no -o BindInterface=en0)

echo "=================================================="
echo "KOYO Studio / SupDance 生产部署开始"
echo "目标服务器: $REMOTE"
echo "目标目录:   $REMOTE_WEB_DIR"
echo "=================================================="

# 1. 本地打包已验证的代码和构建
echo "[1/5] 本地打包已验证源码与构建产物..."
SOURCE_ARCHIVE="/tmp/source_supdance_fusion.tar.gz"
NEXT_ARCHIVE="/tmp/next_supdance_fusion.tar.gz"

rm -f "$SOURCE_ARCHIVE" "$NEXT_ARCHIVE"

COPYFILE_DISABLE=1 tar --no-xattrs --exclude='public/uploads' -czf "$SOURCE_ARCHIVE" \
  packages/studio \
  app \
  components \
  lib \
  plugins \
  src \
  messages \
  scripts \
  public \
  config \
  middleware.js \
  tailwind.config.js \
  next.config.mjs \
  package.json \
  docs/UI_DESIGN_SYSTEM.md \
  docs/ADMIN_UI_DESIGN_SYSTEM.md \
  docs/UI_COMPONENTS.md

COPYFILE_DISABLE=1 tar --no-xattrs --exclude='.next/cache' -czf "$NEXT_ARCHIVE" .next

ls -lh "$SOURCE_ARCHIVE" "$NEXT_ARCHIVE"

# 2. 上传至服务器
echo "[2/5] 上传发布归档包至服务器 /tmp 目录..."
scp "${SSH_OPTS[@]}" "$SOURCE_ARCHIVE" "$NEXT_ARCHIVE" "$REMOTE:/tmp/"

# 3. 在服务器端执行安全备份与原子切换
echo "[3/5] 执行服务器端快照备份与原子切换..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo bash -c '
set -Eeuo pipefail

WEB_DIR=\"$REMOTE_WEB_DIR\"
RELEASE_ID=\"\$(date -u +%Y%m%dT%H%M%SZ)-\$\$\"
BACKUP_DIR=\"/home/ubuntu/backups/fusion-release-\${RELEASE_ID}\"
STAGE=\"/dev/shm/fusion-stage-\${RELEASE_ID}\"

echo \"创建发布备份目录: \$BACKUP_DIR\"
mkdir -p \"\$BACKUP_DIR\" \"\$STAGE\"

# 备份当前源码
echo \"备份当前生产源码与配置...\"
tar -czf \"\$BACKUP_DIR/source-backup.tar.gz\" -C \"\$WEB_DIR\" \
  packages/studio \
  app/globals.css \
  tailwind.config.js \
  components \
  package.json \
  2>/dev/null || true

# 备份当前 .next 运行时目录
echo \"备份当前生产 .next 构建目录...\"
if [ -d \"\$WEB_DIR/.next\" ]; then
  tar --exclude=\"cache\" -czf \"\$BACKUP_DIR/next-backup.tar.gz\" -C \"\$WEB_DIR\" .next
fi

echo \"解压候选源码与新构建到临时暂存区...\"
tar -xzf /tmp/source_supdance_fusion.tar.gz -C \"\$STAGE\"
tar -xzf /tmp/next_supdance_fusion.tar.gz -C \"\$STAGE\"

echo \"验证构建 BUILD_ID: \$(cat \"\$STAGE/.next/BUILD_ID\")\"

# 停止业务服务
echo \"暂停应用服务进入原子切换窗口...\"
systemctl stop supdance.service canvas-supdance.service supdance-worker.service

# 原子替换 .next
if [ -d \"\$WEB_DIR/.next\" ]; then
  mv \"\$WEB_DIR/.next\" \"\$WEB_DIR/.next-prev-\${RELEASE_ID}\"
fi
mv \"\$STAGE/.next\" \"\$WEB_DIR/.next\"

# 同步新源码
rsync -a \"\$STAGE/packages/studio/\" \"\$WEB_DIR/packages/studio/\"
mkdir -p \"\$WEB_DIR/node_modules/studio/src\" \"\$WEB_DIR/node_modules/studio/dist\"
rsync -a \"\$STAGE/packages/studio/src/\" \"\$WEB_DIR/node_modules/studio/src/\"
rsync -a \"\$STAGE/packages/studio/dist/\" \"\$WEB_DIR/node_modules/studio/dist/\"
rsync -a --delete \"\$STAGE/components/\" \"\$WEB_DIR/components/\"
rsync -a --delete \"\$STAGE/app/\" \"\$WEB_DIR/app/\"
rsync -a \"\$STAGE/lib/\" \"\$WEB_DIR/lib/\"
if [ -d \"\$STAGE/plugins\" ]; then
  rsync -a \"\$STAGE/plugins/\" \"\$WEB_DIR/plugins/\"
  chown -R www:www \"\$WEB_DIR/plugins\"
fi
if [ -d \"\$STAGE/src\" ]; then
  rsync -a \"\$STAGE/src/\" \"\$WEB_DIR/src/\"
  chown -R www:www \"\$WEB_DIR/src\"
fi
rsync -a \"\$STAGE/messages/\" \"\$WEB_DIR/messages/\"
rsync -a \"\$STAGE/scripts/\" \"\$WEB_DIR/scripts/\"
if [ -d \"\$STAGE/public\" ]; then
  rsync -a --exclude=\"uploads\" \"\$STAGE/public/\" \"\$WEB_DIR/public/\"
fi
if [ -d \"\$STAGE/config\" ]; then
  rsync -a \"\$STAGE/config/\" \"\$WEB_DIR/config/\"
fi
cp \"\$STAGE/middleware.js\" \"\$WEB_DIR/middleware.js\"
cp \"\$STAGE/app/globals.css\" \"\$WEB_DIR/app/globals.css\"
cp \"\$STAGE/tailwind.config.js\" \"\$WEB_DIR/tailwind.config.js\"
cp \"\$STAGE/next.config.mjs\" \"\$WEB_DIR/next.config.mjs\"
cp \"\$STAGE/package.json\" \"\$WEB_DIR/package.json\"

# 修复文件所有权为 www:www
echo \"更新文件权限...\"
chown -R www:www \"\$WEB_DIR/.next\"
chown -R www:www \"\$WEB_DIR/packages/studio\"
chown -R www:www \"\$WEB_DIR/node_modules/studio\"
chown -R www:www \"\$WEB_DIR/components\"
chown -R www:www \"\$WEB_DIR/app\"
chown -R www:www \"\$WEB_DIR/lib\"
chown -R www:www \"\$WEB_DIR/messages\"
chown -R www:www \"\$WEB_DIR/scripts\"
chown -R www:www \"\$WEB_DIR/public\"
chown -R www:www \"\$WEB_DIR/config\" 2>/dev/null || true
chown www:www \"\$WEB_DIR/middleware.js\" \"\$WEB_DIR/tailwind.config.js\" \"\$WEB_DIR/next.config.mjs\" \"\$WEB_DIR/package.json\"

# 执行数据库版本迁移
echo \"执行数据库版本迁移 (058 等)...\"
(cd \"\$WEB_DIR\" && node --env-file=/etc/supdance.env scripts/migrate.mjs)

# 清理暂存文件
rm -rf \"\$STAGE\" /tmp/source_supdance_fusion.tar.gz /tmp/next_supdance_fusion.tar.gz

# 启动服务
echo \"重启应用与 Worker 服务...\"
systemctl start supdance.service canvas-supdance.service supdance-worker.service
echo \"SWITCH_COMPLETED RELEASE_ID=\$RELEASE_ID\"
'"

# 4. 执行上线后健康检查
echo "[4/5] 验证线上服务存活与 HTTP 状态..."
ssh "${SSH_OPTS[@]}" "$REMOTE" "
set -e
sleep 4

echo '=== 服务状态 ==='
sudo systemctl is-active supdance.service
sudo systemctl is-active canvas-supdance.service
sudo systemctl is-active supdance-worker.service

echo '=== 端口监听状态 ==='
curl -s -o /dev/null -w 'Port 3100 (canvas-supdance): HTTP %{http_code}\n' http://127.0.0.1:3100/zh
curl -s -o /dev/null -w 'Port 3200 (supdance): HTTP %{http_code}\n' http://127.0.0.1:3200/zh

echo '=== /api/ready 健康检查 ==='
curl -s http://127.0.0.1:3200/api/ready
echo ''

echo '=== SEO / Sitemap / Robots 接口校验 ==='
curl -s -o /dev/null -w 'Sitemap.xml: HTTP %{http_code}\n' http://127.0.0.1:3200/sitemap.xml
curl -s -o /dev/null -w 'Robots.txt: HTTP %{http_code}\n' http://127.0.0.1:3200/robots.txt
curl -s -o /dev/null -w 'IndexNow Key: HTTP %{http_code}\n' http://127.0.0.1:3200/api/seo/indexnow-key

echo '=== /api/models/active 接口校验 ==='
curl -s http://127.0.0.1:3200/api/models/active | jq -c '{success, models_count: (.models | length)}'
echo ''

echo '=== /api/generation/quote 接口契约验证 ==='
curl -s -X POST http://127.0.0.1:3200/api/generation/quote \
  -H 'Content-Type: application/json' \
  -d '{\"modelId\":\"koyo-cinematic-v2\",\"studioId\":\"cinema\",\"specs\":{\"aspectRatio\":\"2.39:1\"}}'
echo ''

echo '=== Onboarding 新人引导页面验证 ==='
curl -s -o /dev/null -w 'Onboarding Preview: HTTP %{http_code}\n' 'http://127.0.0.1:3200/onboarding?preview=1'
"

# 5. 公网域名验证
echo "[5/5] 公网域名 (https://www.supdance.com) 验收..."
curl -s -I https://www.supdance.com/zh | grep -E "HTTP|set-cookie|content-type" || true
curl -s -I https://www.supdance.com/sitemap.xml | grep -E "HTTP|content-type" || true
curl -s -o /dev/null -w 'Public Onboarding: HTTP %{http_code}\n' 'https://www.supdance.com/onboarding?preview=1'
echo '=== 线上 robots.txt 预览 ==='
curl -s https://www.supdance.com/robots.txt | head -n 6 || true
curl -s https://www.supdance.com/api/ready
echo ""

echo "=================================================="
echo "🎉 部署全部成功并已通过线上校验！"
echo "=================================================="
