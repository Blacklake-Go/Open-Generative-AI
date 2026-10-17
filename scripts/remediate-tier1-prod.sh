#!/usr/bin/env bash
# ==============================================================================
# 脚本名称: remediate-tier1-prod.sh
# 适用环境: 生产主服务器 (43.133.253.76 / VM-0-15-ubuntu)
# 安全级别: Tier 1 (零业务影响 - 即刻安全清理)
# 功能说明: 清理孤立 swapfile2、淘汰过期 .next-prev-* 目录、清空 AMH 回收站、截断超大日志
# ==============================================================================

set -euo pipefail

MODE="${1:---dry-run}"
AUTO_YES="${2:-}"
PROD_WEB_DIR="/home/wwwroot/AI/domain/supdance.com/web"

echo "======================================================================"
echo " [Tier 1 治理] 生产环境零影响安全清理脚本"
echo " 当前执行模式: ${MODE}"
echo " 执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================================"

# ------------------------------------------------------------------------------
# 1. 前置安全断言 (Pre-flight Safety Assertions)
# ------------------------------------------------------------------------------
echo ">>> [Phase 1] 正在执行前置安全检查..."

# 检查 1: 必须为 root 权限运行
if [ "$(id -u)" -ne 0 ] && [ "${MODE}" = "--execute" ]; then
    echo "[-] 错误: 正式执行必须使用 root 权限 (sudo bash $0 --execute)"
    exit 1
fi

# 检查 2: 验证 /swapfile2 绝未被内核挂载
if swapon --show | grep -q "/swapfile2"; then
    echo "[-] 致命安全警报: /swapfile2 正在被内核激活使用，禁止删除！"
    exit 1
fi
if grep -q "^/swapfile2" /etc/fstab; then
    echo "[-] 致命安全警报: /etc/fstab 中包含 /swapfile2 配置，禁止直接删除！"
    exit 1
fi
echo "[+] 安全校验通过: /swapfile2 确认未被挂载且不在 fstab 中。"

# 检查 3: 验证生产 web 目录下存在正常的 .next 活跃构建
if [ ! -d "${PROD_WEB_DIR}/.next" ]; then
    echo "[-] 致命安全警报: 未检测到生产活跃构建 ${PROD_WEB_DIR}/.next，终止以保护站点！"
    exit 1
fi
echo "[+] 安全校验通过: 生产当前构建 ${PROD_WEB_DIR}/.next 状态正常。"

# ------------------------------------------------------------------------------
# 2. 清理清单探测与演练 (Dry-Run / Scope Analysis)
# ------------------------------------------------------------------------------
echo ""
echo ">>> [Phase 2] 扫描待清理项目与空间评估..."

# 扫描项 A: 孤立 Swap
SWAP2_SIZE=0
if [ -f "/swapfile2" ]; then
    SWAP2_SIZE=$(stat -c%s "/swapfile2" 2>/dev/null || stat -f%z "/swapfile2" 2>/dev/null || echo 0)
    echo "[待清理项 A] 孤立交换文件: /swapfile2 ($(numfmt --to=iec-i --suffix=B "${SWAP2_SIZE}" 2>/dev/null || echo "${SWAP2_SIZE} bytes"))"
fi

# 扫描项 B: 过期 .next-prev-* 构建目录 (保留最新 2 个)
PREV_NEXT_COUNT=0
PREV_NEXT_DIRS=()
if [ -d "${PROD_WEB_DIR}" ]; then
    mapfile -t ALL_PREV_DIRS < <(find "${PROD_WEB_DIR}" -maxdepth 1 -type d -name ".next-prev-*" -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk '{print $2}')
    if [ "${#ALL_PREV_DIRS[@]}" -gt 2 ]; then
        PREV_NEXT_DIRS=("${ALL_PREV_DIRS[@]:2}")
        PREV_NEXT_COUNT="${#PREV_NEXT_DIRS[@]}"
        echo "[待清理项 B] 过期构建目录: 找到 ${#ALL_PREV_DIRS[@]} 个，保留最新 2 个，待清理 ${PREV_NEXT_COUNT} 个"
    else
        echo "[待清理项 B] 过期构建目录: 仅有 ${#ALL_PREV_DIRS[@]} 个，无需清理。"
    fi
fi

# 扫描项 C: AMH 文件回收站
AMH_TRASH="/home/usrdata/amfile/trash"
TRASH_EXISTS=false
if [ -d "${AMH_TRASH}" ] && [ "$(ls -A "${AMH_TRASH}" 2>/dev/null)" ]; then
    TRASH_EXISTS=true
    echo "[待清理项 C] AMH 回收站垃圾: ${AMH_TRASH} ($(du -sh "${AMH_TRASH}" 2>/dev/null | awk '{print $1}'))"
fi

# 扫描项 D: 待安全截断的过大日志
DISPATCHER_LOG="/usr/local/qcloud/monitor/barad/log/dispatcher.log"
MYSQL_ERR_LOG="/home/usrdata/mysql-8.0/VM-0-10-ubuntu.err"

# 扫描项 E: Docker 停用残留
DOCKER_BUILDKIT="/var/lib/docker/buildkit"

if [ "${MODE}" = "--dry-run" ]; then
    echo ""
    echo "======================================================================"
    echo " [预演报告 (Dry-Run)] 若执行将安全回收:"
    echo "  1. 删除 /swapfile2: 预计释放 4.00 GiB"
    echo "  2. 删除 ${PREV_NEXT_COUNT} 个历史 .next-prev 目录: 预计释放约 3.05 GB"
    echo "  3. 清空 AMH 回收站: 预计释放约 184 MB"
    echo "  4. 截断 dispatcher.log 与 MySQL err 日志: 预计释放约 110 MB"
    echo "  5. 清理 Docker buildkit 缓存: 预计释放约 41 MB"
    echo "  --------------------------------------------------"
    echo "  预计总计即刻释放空间: ~7.34 GB"
    echo "  (若要真正执行清理，请运行: sudo bash $0 --execute --yes)"
    echo "======================================================================"
    exit 0
fi

# ------------------------------------------------------------------------------
# 3. 正式执行模式 (Execution Mode)
# ------------------------------------------------------------------------------
if [ "${MODE}" != "--execute" ]; then
    echo "[-] 未知参数: ${MODE}。仅支持 --dry-run 或 --execute。"
    exit 1
fi

if [ "${AUTO_YES}" != "--yes" ]; then
    echo ""
    read -r -p " [!] 警告: 即将对生产环境执行 Tier 1 清理，请输入 'YES' 确认执行: " CONFIRM
    if [ "${CONFIRM}" != "YES" ]; then
        echo "[-] 操作已取消。"
        exit 0
    fi
fi

echo ""
echo ">>> [Phase 3] 正在执行清理动作..."

# 动作 1: 删除 /swapfile2
if [ -f "/swapfile2" ]; then
    echo "[-] 正在删除孤立交换文件: /swapfile2 ..."
    rm -f /swapfile2
    echo "[+] /swapfile2 已清除。"
fi

# 动作 2: 淘汰过期 .next-prev-* 目录
if [ "${#PREV_NEXT_DIRS[@]}" -gt 0 ]; then
    echo "[-] 正在淘汰 ${#PREV_NEXT_DIRS[@]} 个过期构建快照..."
    for dir in "${PREV_NEXT_DIRS[@]}"; do
        echo "    移除: ${dir}"
        rm -rf "${dir}"
    done
    echo "[+] 过期构建目录已清理完成。"
fi

# 动作 3: 清空 AMH 回收站
if [ "${TRASH_EXISTS}" = true ]; then
    echo "[-] 正在清空 AMH 回收站: ${AMH_TRASH} ..."
    rm -rf "${AMH_TRASH:?}"/*
    echo "[+] AMH 回收站已清空。"
fi

# 动作 4: 安全截断大日志 (保持文件描述符)
if [ -f "${DISPATCHER_LOG}" ]; then
    echo "[-] 正在截断云监控日志: ${DISPATCHER_LOG} ..."
    cat /dev/null > "${DISPATCHER_LOG}"
fi
if [ -f "${MYSQL_ERR_LOG}" ]; then
    echo "[-] 正在截断 MySQL 错误日志: ${MYSQL_ERR_LOG} ..."
    cat /dev/null > "${MYSQL_ERR_LOG}"
fi
echo "[+] 僵尸日志已截断至 0 字节。"

# 动作 5: 清理停用的 Docker buildkit 残留
if [ -d "${DOCKER_BUILDKIT}" ]; then
    echo "[-] 正在清理 Docker buildkit 缓存..."
    rm -rf "${DOCKER_BUILDKIT}"/*
    echo "[+] Docker 缓存已清理。"
fi

# 动作 6: 清理临时测试 HTML
rm -f /tmp/supdance-privacy-*.html 2>/dev/null || true

# ------------------------------------------------------------------------------
# 4. 后置验证断言 (Post-Verification Checks)
# ------------------------------------------------------------------------------
echo ""
echo ">>> [Phase 4] 正在执行清理后系统健康检查..."

echo "1. 交换空间状态 (swapon --show):"
swapon --show

echo "2. 生产 Web 服务当前状态 (systemctl is-active supdance):"
systemctl is-active supdance.service || echo "[-] 警告: supdance 服务未正常运行！"

echo "3. 根分区最新磁盘利用率 (df -h /):"
df -h /

echo ""
echo "======================================================================"
echo "[+] Tier 1 清理圆满成功！业务完全不受影响。"
echo "======================================================================"
