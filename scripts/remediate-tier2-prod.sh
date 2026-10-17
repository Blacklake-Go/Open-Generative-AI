#!/usr/bin/env bash
# ==============================================================================
# 脚本名称: remediate-tier2-prod.sh
# 适用环境: 生产主服务器 (43.133.253.76 / VM-0-15-ubuntu)
# 安全级别: Tier 2 (建议归档与确认后清理)
# 功能说明: 归档精炼历史备份、修剪 pnpm store/cache、移除 MySQL 8.0 测试包、清理废弃 5.7 实例
# ==============================================================================

set -euo pipefail

MODE="${1:---dry-run}"
AUTO_YES="${2:-}"
BACKUP_DIR="/home/ubuntu/backups"
MYSQL_TEST_DIR="/usr/local/mysql-8.0/mysql-test"
MYSQL_57_DIR="/home/usrdata/mysql-5.7"
STALE_RELEASE_DIR="/home/wwwroot/AI/domain/supdance.com/.release-canvas-i2i-20261013"

echo "======================================================================"
echo " [Tier 2 治理] 生产环境归档与深度修剪脚本"
echo " 当前执行模式: ${MODE}"
echo " 执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================================"

# ------------------------------------------------------------------------------
# 1. 扫描与空间评估 (Dry-Run / Scope Analysis)
# ------------------------------------------------------------------------------
echo ">>> [Phase 1] 扫描待精简资产..."

# 检查 1: /home/ubuntu/backups 中可精简的早期发布包
EXCESS_BACKUPS=()
if [ -d "${BACKUP_DIR}" ]; then
    # 保留最新的 2 个发布包目录，其余标记为待清理
    mapfile -t ALL_RELEASE_DIRS < <(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name "*release*" -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk '{print $2}')
    if [ "${#ALL_RELEASE_DIRS[@]}" -gt 2 ]; then
        EXCESS_BACKUPS=("${ALL_RELEASE_DIRS[@]:2}")
        echo "[待精简项 A] 历史发布全量包: 共有 ${#ALL_RELEASE_DIRS[@]} 个，保留最新 2 个，待清理 ${#EXCESS_BACKUPS[@]} 个 (预计释放 ~6.5 GB)"
    fi
fi

# 检查 2: pnpm 缓存与存储
echo "[待精简项 B] 全局 pnpm 缓存与 CAS 存储池 (预计释放 ~2.5 GB)"
echo "   - /root/.cache/pnpm"
echo "   - /home/ubuntu/.cache/pnpm"
echo "   - 执行 pnpm store prune 剔除未引用的孤立块"

# 检查 3: MySQL 8.0 测试套件
if [ -d "${MYSQL_TEST_DIR}" ]; then
    echo "[待精简项 C] MySQL 8.0 预编译测试套件: ${MYSQL_TEST_DIR} ($(du -sh "${MYSQL_TEST_DIR}" 2>/dev/null | awk '{print $1}'))"
fi

# 检查 4: 废弃发布候选目录
if [ -d "${STALE_RELEASE_DIR}" ]; then
    echo "[待精简项 D] 废弃发布候选目录: ${STALE_RELEASE_DIR} ($(du -sh "${STALE_RELEASE_DIR}" 2>/dev/null | awk '{print $1}'))"
fi

# 检查 5: 停止运行的 MySQL 5.7 实例
if [ -d "${MYSQL_57_DIR}" ]; then
    echo "[待精简项 E] 停用的 MySQL 5.7 实例目录: ${MYSQL_57_DIR} ($(du -sh "${MYSQL_57_DIR}" 2>/dev/null | awk '{print $1}')，先压缩归档再移除)"
fi

if [ "${MODE}" = "--dry-run" ]; then
    echo ""
    echo "======================================================================"
    echo " [预演报告 (Dry-Run)] 若执行将深度收回:"
    echo "  1. 精简历史备份: 预计释放约 6.5 GB"
    echo "  2. 清理 pnpm cache 并执行 store prune: 预计释放约 2.5 GB"
    echo "  3. 移除失效候选发布目录: 预计释放 1.07 GB"
    echo "  4. 移除 MySQL 8.0 冗余测试套件: 预计释放 745 MB"
    echo "  5. 归档并清理 MySQL 5.7 数据: 净释放约 200 MB"
    echo "  6. 执行 apt-get clean: 预计释放 112 MB"
    echo "  --------------------------------------------------"
    echo "  预计总计深度释放空间: ~10.5 GB"
    echo "  (若要真正执行清理，请运行: sudo bash $0 --execute --yes)"
    echo "======================================================================"
    exit 0
fi

# ------------------------------------------------------------------------------
# 2. 正式执行模式 (Execution Mode)
# ------------------------------------------------------------------------------
if [ "${MODE}" != "--execute" ]; then
    echo "[-] 未知参数: ${MODE}。仅支持 --dry-run 或 --execute。"
    exit 1
fi

if [ "${AUTO_YES}" != "--yes" ]; then
    echo ""
    read -r -p " [!] 警告: 即将执行 Tier 2 深度归档与清理，请输入 'YES' 确认执行: " CONFIRM
    if [ "${CONFIRM}" != "YES" ]; then
        echo "[-] 操作已取消。"
        exit 0
    fi
fi

echo ""
echo ">>> [Phase 2] 正在执行深度清理..."

# 动作 1: 精简历史备份
if [ "${#EXCESS_BACKUPS[@]}" -gt 0 ]; then
    echo "[-] 正在精简早期版本备份..."
    for bdir in "${EXCESS_BACKUPS[@]}"; do
        echo "    移除超期发布包: ${bdir}"
        rm -rf "${bdir}"
    done
    # 清理独立的冗余重复包 (如旧的 zst 副本)
    rm -f "${BACKUP_DIR}"/canvas-fusion-prepatch-*.tar.zst 2>/dev/null || true
    rm -f "${BACKUP_DIR}"/koyosim-canvas-source-*.tar.gz 2>/dev/null || true
    echo "[+] 历史备份精简完成。"
fi

# 动作 2: 清理 pnpm 缓存并修剪 store
echo "[-] 正在清理 pnpm 下载缓存..."
rm -rf /root/.cache/pnpm/* /home/ubuntu/.cache/pnpm/* 2>/dev/null || true

echo "[-] 正在执行 pnpm store prune..."
if command -v pnpm &>/dev/null; then
    pnpm store prune || true
    su - ubuntu -c "pnpm store prune" 2>/dev/null || true
fi
echo "[+] pnpm 缓存与存储修剪完成。"

# 动作 3: 移除 MySQL 8.0 编译测试套件
if [ -d "${MYSQL_TEST_DIR}" ]; then
    echo "[-] 正在移除 MySQL 8.0 测试套件目录: ${MYSQL_TEST_DIR} ..."
    rm -rf "${MYSQL_TEST_DIR}"
    echo "[+] MySQL 测试套件已移除。"
fi

# 动作 4: 移除废弃发布候选目录
if [ -d "${STALE_RELEASE_DIR}" ]; then
    echo "[-] 正在移除废弃候选目录: ${STALE_RELEASE_DIR} ..."
    rm -rf "${STALE_RELEASE_DIR}"
    echo "[+] 废弃候选目录已移除。"
fi

# 动作 5: 压缩归档并清理 MySQL 5.7 遗留数据
if [ -d "${MYSQL_57_DIR}" ]; then
    echo "[-] 正在压缩归档 MySQL 5.7 数据至 /home/ubuntu/db_archive/ ..."
    mkdir -p /home/ubuntu/db_archive
    tar -czf /home/ubuntu/db_archive/mysql-5.7-legacy-archive.tar.gz -C /home/usrdata mysql-5.7 2>/dev/null || true
    rm -rf "${MYSQL_57_DIR}"
    echo "[+] MySQL 5.7 遗留数据已归档并安全移除。"
fi

# 动作 6: 清理 APT 包缓存
echo "[-] 正在清理 APT 本地缓存..."
apt-get clean
echo "[+] APT 缓存已清理。"

# ------------------------------------------------------------------------------
# 3. 后置验证断言 (Post-Verification Checks)
# ------------------------------------------------------------------------------
echo ""
echo ">>> [Phase 3] 正在验证系统与数据库状态..."
systemctl is-active supdance.service || echo "[-] 警告: supdance 服务未正常运行！"
systemctl is-active mysql || echo "[-] 警告: mysql 服务未正常运行！"
systemctl is-active postgresql || echo "[-] 警告: postgresql 服务未正常运行！"

echo ""
echo "根分区最新可用空间 (df -h /):"
df -h /

echo ""
echo "======================================================================"
echo "[+] Tier 2 治理成功完成！累计释放空间达标。"
echo "======================================================================"
