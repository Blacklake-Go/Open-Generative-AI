#!/usr/bin/env bash
# ==============================================================================
# 脚本名称: remediate-database-rename.sh
# 适用环境: 生产主服务器 (43.133.253.76 / VM-0-15-ubuntu)
# 功能说明: 将 PostgreSQL 库名与用户从 koyosim_ai / koyosim_ai_user 安全平滑升级为 supdance_ai / supdance_ai_user
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo " [数据库升级治理] koyosim_ai -> supdance_ai 数据库与角色平滑更名"
echo " 执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================================"

BACKUP_DIR="/home/ubuntu/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PRE_BACKUP="${BACKUP_DIR}/supdance_ai_pre_rename_${TIMESTAMP}.dump"

# 1. 前置热备
echo ">>> [Phase 1] 正在执行重命名前全量热备..."
mkdir -p "${BACKUP_DIR}"
sudo -u postgres pg_dump -Fc koyosim_ai > "${PRE_BACKUP}"
chmod 640 "${PRE_BACKUP}"
chown ubuntu:ubuntu "${PRE_BACKUP}"
echo "[+] 热备完成: ${PRE_BACKUP} ($(du -sh "${PRE_BACKUP}" | cut -f1))"

# 2. 暂停业务服务连接 (毫秒级)
echo ">>> [Phase 2] 临时挂起 Web 与 Worker 服务..."
systemctl stop supdance.service canvas-supdance.service supdance-worker.service || true
echo "[+] 服务已挂起。"

# 3. 终结数据库残留连接并执行重命名
echo ">>> [Phase 3] 执行 PostgreSQL 库名与用户更名..."
sudo -u postgres psql << 'EOF'
-- 1. 禁止新连接
ALTER DATABASE koyosim_ai WITH allow_connections = false;

-- 2. 终结现有连接
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'koyosim_ai' AND pid <> pg_backend_pid();

-- 3. 库名更名
ALTER DATABASE koyosim_ai RENAME TO supdance_ai;

-- 4. 恢复允许连接
ALTER DATABASE supdance_ai WITH allow_connections = true;

-- 5. 角色用户更名
ALTER USER koyosim_ai_user RENAME TO supdance_ai_user;
EOF
echo "[+] 数据库更名为 supdance_ai，角色更名为 supdance_ai_user。"

# 4. 更新环境变量配置 (/etc/supdance.env)
echo ">>> [Phase 4] 更新环境变量配置 /etc/supdance.env ..."
sed -i 's|postgres://koyosim_ai_user:|postgres://supdance_ai_user:|g' /etc/supdance.env
sed -i 's|:5432/koyosim_ai|:5432/supdance_ai|g' /etc/supdance.env
echo "[+] /etc/supdance.env 已更新为 supdance_ai。"

# 5. 更新定时备份脚本 /usr/local/bin/supdance-db-backup.sh
echo ">>> [Phase 5] 更新每日备份脚本目标库名..."
sed -i 's|pg_dump -Fc koyosim_ai|pg_dump -Fc supdance_ai|g' /usr/local/bin/supdance-db-backup.sh
echo "[+] /usr/local/bin/supdance-db-backup.sh 已指向 supdance_ai。"

# 6. 恢复启动所有业务服务
echo ">>> [Phase 6] 恢复启动生产服务..."
systemctl start supdance.service canvas-supdance.service supdance-worker.service
echo "[+] 生产服务已重启。"

# 7. 归档废弃的旧 env 文件
mv -f /etc/go-koyosim.env /etc/koyosim.env /home/ubuntu/db_archive/ 2>/dev/null || true
echo "[+] 废弃旧 env 文件已移入归档区。"

# 8. 后置连通性校验与业务探活
echo ">>> [Phase 7] 执行业务回归与数据库连通性验证..."
sleep 2

# 校验服务状态
systemctl is-active supdance.service
systemctl is-active canvas-supdance.service
systemctl is-active supdance-worker.service

# 校验新库直连查询
sudo -u postgres psql -d supdance_ai -c "SELECT count(*) AS total_users FROM auth_usr.users;"

# 校验 Web 端口探活
curl -sI http://127.0.0.1:3200 | head -n 1

echo "======================================================================"
echo "[+] 数据库库名、用户与配置已全链路升级为 supdance_ai，验证全部通过！"
echo "======================================================================"
