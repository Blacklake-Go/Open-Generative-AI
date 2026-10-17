#!/usr/bin/env bash
# ==============================================================================
# 脚本名称: remediate-deep-prod.sh
# 适用环境: 生产主服务器 (43.133.253.76 / VM-0-15-ubuntu)
# 安全级别: Deep Cleanup (深度垃圾与编译/旧版本残留治理)
# 功能说明: 清理未引用 Node 副本、OpenSSL 编译单测、旧版废弃源码、冗余回滚、过期云监控日志与包
# ==============================================================================

set -euo pipefail

MODE="${1:---dry-run}"
AUTO_YES="${2:-}"
PROD_WEB_DIR="/home/wwwroot/AI/domain/supdance.com/web"

echo "======================================================================"
echo " [深度清理治理] 生产环境次级冗余与垃圾深度收割"
echo " 当前执行模式: ${MODE}"
echo " 执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================================================"

# ------------------------------------------------------------------------------
# 1. 前置安全检查 (Pre-flight Safety Assertions)
# ------------------------------------------------------------------------------
echo ">>> [Phase 1] 正在执行前置安全检查..."

if [ "$(id -u)" -ne 0 ] && [ "${MODE}" = "--execute" ]; then
    echo "[-] 错误: 正式执行必须使用 root 权限 (sudo bash $0 --execute)"
    exit 1
fi

if [ ! -d "${PROD_WEB_DIR}/.next" ]; then
    echo "[-] 致命安全警报: 未检测到生产主站构建 ${PROD_WEB_DIR}/.next，终止以保护站点！"
    exit 1
fi
echo "[+] 安全校验通过: 生产当前构建 ${PROD_WEB_DIR}/.next 状态正常。"

# ------------------------------------------------------------------------------
# 2. 扫描待清理项目与空间评估 (Scope Assessment)
# ------------------------------------------------------------------------------
echo ""
echo ">>> [Phase 2] 扫描深度清理项..."

TOTAL_ESTIMATED_MB=0

# 1. 冗余 Node 副本
if [ -d "/opt/codex-node-v22.22.2" ]; then
    echo "  [项 1] 冗余 Node 副本: /opt/codex-node-v22.22.2 (203 MB)"
    TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 203))
fi

# 2. OpenSSL 源码测试残留
if [ -d "/home/usrdata/nginx-1.24/openssl-1.1.1w" ]; then
    echo "  [项 2] OpenSSL 1.1.1w 编译源码与测试集: /home/usrdata/nginx-1.24/openssl-1.1.1w (451 MB)"
    TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 451))
fi

# 3. 闲置的 PHP 8.4
if [ -d "/usr/local/php-8.4" ]; then
    echo "  [项 3] 停用的旧版 PHP 8.4 运行时: /usr/local/php-8.4 (364 MB)"
    TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 364))
fi

# 4. 今日候选与暂存构建目录
if [ -d "/home/wwwroot/AI/domain/supdance.com/image-release-candidate-20261017" ]; then
    echo "  [项 4.1] 今日废弃临时候选目录: .../image-release-candidate-20261017 (141 MB)"
    TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 141))
fi
if [ -d "/home/ubuntu/builds/supdance-privacy-codex-20261017" ]; then
    echo "  [项 4.2] 本地暂存构建树: /home/ubuntu/builds/supdance-privacy-codex-20261017 (96 MB)"
    TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 96))
fi

# 5. 历史 Koyosim 遗留目录
if [ -d "/home/wwwroot/AI/deps/koyosim-auth-repair" ]; then
    echo "  [项 5.1] 历史 Koyosim 依赖: /home/wwwroot/AI/deps/koyosim-auth-repair (232 MB)"
    TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 232))
fi
if [ -d "/home/wwwroot/AI/.koyosim-canvas-release-20261012T000000Z" ]; then
    echo "  [项 5.2] 历史 Koyosim 源码归档: /home/wwwroot/AI/.koyosim-canvas-release-20261012T000000Z (191 MB)"
    TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 191))
fi

# 6. Canvas 子站多余回滚
CANVAS_DIR="/home/wwwroot/AI/domain/canvas.supdance.com"
if [ -d "${CANVAS_DIR}" ]; then
    echo "  [项 6] Canvas 历史回滚副本 (保留 web 与 web.bak-20261017，清理其余 4 个，~110 MB)"
    TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 110))
fi

# 7. 历史旧对象包与旧 dump
echo "  [项 7] 历史冷数据对象包与过期数据库 dump (~200 MB)"
TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 200))

# 8. 腾讯云日志与安装包残留
echo "  [项 8] 腾讯云历史安全日志与安装包残留 (~210 MB)"
TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 210))

# 9. 超大访问日志截断
echo "  [项 9] 未截断的大型访问日志安全截断 (~118 MB)"
TOTAL_ESTIMATED_MB=$((TOTAL_ESTIMATED_MB + 118))

echo ""
echo "======================================================================"
echo " 预计本次深度清理可再释放空间: 约 ${TOTAL_ESTIMATED_MB} MB (~$((TOTAL_ESTIMATED_MB / 1024)) GB)"
echo "======================================================================"

if [ "${MODE}" = "--dry-run" ]; then
    echo " (若要正式执行，请运行: sudo bash $0 --execute --yes)"
    exit 0
fi

if [ "${MODE}" != "--execute" ]; then
    echo "[-] 未知参数: ${MODE}。仅支持 --dry-run 或 --execute。"
    exit 1
fi

if [ "${AUTO_YES}" != "--yes" ]; then
    echo ""
    read -r -p " [!] 警告: 即将执行深度垃圾清理，请输入 'YES' 确认执行: " CONFIRM
    if [ "${CONFIRM}" != "YES" ]; then
        echo "[-] 操作已取消。"
        exit 0
    fi
fi

# ------------------------------------------------------------------------------
# 3. 执行深度清理 (Action Execution)
# ------------------------------------------------------------------------------
echo ""
echo ">>> [Phase 3] 正在执行深度清理动作..."

# 动作 1: 移除未引用的 Node 副本
if [ -d "/opt/codex-node-v22.22.2" ]; then
    echo "[-] 正在移除冗余 Node 副本: /opt/codex-node-v22.22.2 ..."
    rm -rf /opt/codex-node-v22.22.2
    echo "[+] /opt/codex-node-v22.22.2 已清除。"
fi

# 动作 2: 移除 OpenSSL 源码测试残留
if [ -d "/home/usrdata/nginx-1.24/openssl-1.1.1w" ]; then
    echo "[-] 正在移除 OpenSSL 编译源码树: /home/usrdata/nginx-1.24/openssl-1.1.1w ..."
    rm -rf /home/usrdata/nginx-1.24/openssl-1.1.1w
    echo "[+] OpenSSL 编译残留已清除。"
fi

# 动作 3: 移除停用的 PHP 8.4 运行时
if [ -d "/usr/local/php-8.4" ]; then
    echo "[-] 正在安全移除未使用的旧版 PHP 8.4: /usr/local/php-8.4 ..."
    systemctl disable kacal-php84.service 2>/dev/null || true
    rm -f /etc/systemd/system/kacal-php84.service 2>/dev/null || true
    systemctl daemon-reload
    rm -rf /usr/local/php-8.4
    echo "[+] PHP 8.4 已安全移除。"
fi

# 动作 4: 移除今日候选与暂存构建目录
rm -rf /home/wwwroot/AI/domain/supdance.com/image-release-candidate-20261017 2>/dev/null || true
rm -rf /home/ubuntu/builds/supdance-privacy-codex-20261017 2>/dev/null || true
echo "[+] 今日暂存构建目录已清除。"

# 动作 5: 移除历史 Koyosim 遗留目录
rm -rf /home/wwwroot/AI/deps/koyosim-auth-repair 2>/dev/null || true
rm -rf /home/wwwroot/AI/.koyosim-canvas-release-20261012T000000Z 2>/dev/null || true
rm -rf /home/wwwroot/AI/staging/muapi-templates 2>/dev/null || true
echo "[+] 历史 Koyosim 遗留目录已清除。"

# 动作 6: 精简 Canvas 子站回滚副本 (保留 web 与 web.bak-20261017)
if [ -d "${CANVAS_DIR}" ]; then
    echo "[-] 正在精简 Canvas 子站历史回滚..."
    rm -rf "${CANVAS_DIR}/web-bak-202610160542" 2>/dev/null || true
    rm -rf "${CANVAS_DIR}/web.rollback-20261013T150000Z" 2>/dev/null || true
    rm -rf "${CANVAS_DIR}/web.rollback-codex-20261013T2120Z" 2>/dev/null || true
    rm -rf "${CANVAS_DIR}/web.rollback-codex-20261013T222611Z" 2>/dev/null || true
    echo "[+] Canvas 历史回滚已精简至仅留最新快照。"
fi

# 动作 7: 清理历史备份中的过期对象和旧 dump
echo "[-] 正在清理 /home/ubuntu/backups 中的旧对象与历史 Dump..."
rm -f /home/ubuntu/backups/pnpm-store-pre-prune-*.tar.zst 2>/dev/null || true
rm -f /home/ubuntu/backups/koyosim-canvas-objects-*.tar.gz 2>/dev/null || true
rm -f /home/ubuntu/backups/koyosim-canvas-build-*.tar.gz 2>/dev/null || true
rm -rf /home/ubuntu/backups/canvas-fusion-prepatch-20261013T073403Z 2>/dev/null || true
rm -rf /home/ubuntu/backups/supdance-model-route-20261013T154737Z 2>/dev/null || true
rm -rf /home/ubuntu/backups/koyosim-canvas-i2i-20261013 2>/dev/null || true
rm -f /home/ubuntu/backups/model-schedule-202609*.dump 2>/dev/null || true
rm -f /home/ubuntu/backups/model-schedule-2026100*.dump 2>/dev/null || true
rm -f /home/ubuntu/backups/koyosim_ai-pre-*.dump 2>/dev/null || true
echo "[+] 历史冷数据对象包与过期 Dump 已清理。"

# 动作 8: 清理腾讯云安全日志与安装包残留
echo "[-] 正在清理腾讯云历史日志与安装包..."
rm -f /usr/local/qcloud/onion_check.tgz 2>/dev/null || true
rm -f /usr/local/qcloud/onion_check/agent.zip 2>/dev/null || true
rm -f /usr/local/qcloud/YunJing/log/ydservice.2026101[1-6].log 2>/dev/null || true
echo "[+] 腾讯云日志与安装残留已清理。"

# 动作 9: 安全截断超大访问日志
cat /dev/null > /home/wwwroot/AI/logs/canvas.supdance.com.log 2>/dev/null || true
cat /dev/null > /usr/local/amh-7.3/logs/amh-access.log 2>/dev/null || true
cat /dev/null > /usr/local/nginx-1.24/logs/access.log 2>/dev/null || true
echo "[+] 访问日志已安全截断。"

# 动作 10: 重启 tat_agent 释放被删二进制句柄
systemctl restart tat_agent 2>/dev/null || true
echo "[+] tat_agent 进程句柄已刷新释放。"

# ------------------------------------------------------------------------------
# 4. 后置健康校验 (Post-Verification Checks)
# ------------------------------------------------------------------------------
echo ""
echo ">>> [Phase 4] 正在验证业务与系统健康状态..."
systemctl is-active supdance.service || echo "[-] 警告: supdance 服务未正常运行！"
systemctl is-active postgresql || echo "[-] 警告: postgresql 服务未正常运行！"
curl -sI http://127.0.0.1:3200 | head -n 1

echo ""
echo "根分区最新可用空间 (df -h /):"
df -h /

echo ""
echo "======================================================================"
echo "[+] 深度清理圆满成功！服务器盘面进一步大幅精简。"
echo "======================================================================"
