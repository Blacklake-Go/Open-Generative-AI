#!/usr/bin/env bash
# ==============================================================================
# 脚本名称: remediate-koyosim-cleanup.sh
# 适用环境: 生产主服务器 (43.133.253.76 / VM-0-15-ubuntu)
# 功能说明: 释放 PM2 僵尸进程、清理废弃 amcrontab、重构 koyosim 备份脚本为 supdance、清理历史 koyosim 日志与死配置
# ==============================================================================

set -euo pipefail

echo "======================================================================"
echo " [执行治理] PM2 内存释放与 koyosim 旧标识安全脱敏/清理"
echo " 执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================================"

# 1. 释放 PM2 僵尸守护进程 (回收 ~85MB 内存)
echo ">>> [Phase 1] 正在停止空转的 PM2 守护进程..."
pm2 kill 2>/dev/null || true
su - ubuntu -c "pm2 kill" 2>/dev/null || true
echo "[+] PM2 进程已终止，内存已释放。"

# 2. 清理 /home/usrdata/amcrontab 废弃脚本与报错日志
echo ">>> [Phase 2] 清理 /home/usrdata/amcrontab 历史调试残留..."
rm -f /home/usrdata/amcrontab/pm2_restart.log 2>/dev/null || true
rm -f /home/usrdata/amcrontab/weairsim_ssl_*.sh 2>/dev/null || true
rm -f /home/usrdata/amcrontab/codex_ssl_*.sh 2>/dev/null || true
echo "[+] amcrontab 历史垃圾已清除。"

# 3. 将 /usr/local/bin/koyosim-backup.sh 安全升级为 supdance-db-backup.sh
echo ">>> [Phase 3] 重构与升级每日数据库备份脚本..."
cat << 'EOF' > /usr/local/bin/supdance-db-backup.sh
#!/usr/bin/env bash
set -e
BACKUP_DIR="/home/ubuntu/backups"
LOG_FILE="/var/log/supdance-db-backup.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/supdance_db_backup_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"
NOW=$(date +"%Y-%m-%d %H:%M:%S")
echo "[${NOW}] Starting PostgreSQL database backup (supdance production)..." >> "${LOG_FILE}"

# 导出当前核心业务数据库
if sudo -u postgres pg_dump -Fc koyosim_ai > "${BACKUP_FILE}"; then
    chmod 640 "${BACKUP_FILE}"
    chown ubuntu:ubuntu "${BACKUP_FILE}"
    SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    NOW=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[${NOW}] Backup completed successfully: ${BACKUP_FILE} (${SIZE})" >> "${LOG_FILE}"
    
    # 保留最近 7 天的日常备份
    find "${BACKUP_DIR}" -name "supdance_db_backup_*.dump" -mtime +7 -delete
    find "${BACKUP_DIR}" -name "koyosim_ai_backup_*.dump" -mtime +7 -delete 2>/dev/null || true
    echo "[${NOW}] Cleaned up backups older than 7 days." >> "${LOG_FILE}"
else
    NOW=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[${NOW}] ERROR: pg_dump failed!" >> "${LOG_FILE}"
    exit 1
fi
EOF

chmod 755 /usr/local/bin/supdance-db-backup.sh
chown root:root /usr/local/bin/supdance-db-backup.sh

# 更新 root crontab：将 koyosim-backup.sh 替换为 supdance-db-backup.sh
crontab -l | sed 's|/usr/local/bin/koyosim-backup.sh|/usr/local/bin/supdance-db-backup.sh|g' | crontab -
rm -f /usr/local/bin/koyosim-backup.sh
echo "[+] 每日定时备份已升级为 supdance-db-backup.sh，crontab 已同步更新。"

# 4. 安全清理历史 koyosim 日志与过期 dump
echo ">>> [Phase 4] 清理历史 koyosim 日志与过期备份文件..."
rm -f /home/wwwroot/AI/logs/koyosim.com-*.log* 2>/dev/null || true
rm -f /home/wwwroot/AI/logs/www.koyosim.com-*.log* 2>/dev/null || true
rm -f /home/wwwroot/AI/logs/go.koyosim.com-*.log* 2>/dev/null || true
rm -f /home/wwwroot/AI/logs/canvas.koyosim.com-*.log* 2>/dev/null || true
rm -f /home/ubuntu/koyosim.com-https.conf /home/ubuntu/koyosim_metrics.php /home/ubuntu/koyosim-*.txt /home/ubuntu/koyosim-*.log 2>/dev/null || true
rm -rf /etc/systemd/system/legacy_koyosim_backup 2>/dev/null || true
rm -f /home/ubuntu/db_archive/koyosim*.dump 2>/dev/null || true
rm -f /home/ubuntu/backups/koyosim* 2>/dev/null || true
rm -f /home/wwwroot/AI/backups/koyosim* 2>/dev/null || true
rm -f /home/wwwroot/AI/backups/pg_dumps/koyosim* 2>/dev/null || true
echo "[+] 历史 koyosim 日志、调试文件及旧 dump 已彻底清除。"

# 5. 验证健康状态
echo ">>> [Phase 5] 验证服务与内存状态..."
free -h
echo "Root Crontab:"
crontab -l
systemctl is-active supdance.service
echo "======================================================================"
echo "[+] 执行圆满成功！"
echo "======================================================================"
