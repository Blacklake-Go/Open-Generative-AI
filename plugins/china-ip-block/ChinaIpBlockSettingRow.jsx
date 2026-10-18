'use client';

import React, { useState } from 'react';
import { AdminSettingRow, StatusBadge } from '@/components/admin/AdminUi';
import { ShieldAlert, ShieldCheck, CheckCircle2, AlertCircle, Wrench, Trash2 } from 'lucide-react';

/**
 * 临时插件：中国流量屏蔽设置行与配置弹窗组件
 * 严格遵循 docs/UI_DESIGN_SYSTEM.md 与 docs/UI_REPAIR_INSTRUCTION.md 规范
 */
export default function ChinaIpBlockSettingRow({
  settings = [],
  saveSetting,
  savingKey,
}) {
  const currentVal = (() => {
    const item = settings.find((s) => s.key === 'china_ip_block');
    return item?.value || {
      enabled: false,
      exemptAdmin: true,
      whitelistIps: '',
    };
  })();

  const [enabled, setEnabled] = useState(Boolean(currentVal.enabled));
  const [exemptAdmin, setExemptAdmin] = useState(currentVal.exemptAdmin !== false);
  const [whitelistIps, setWhitelistIps] = useState(currentVal.whitelistIps || '');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // IP 在线测试状态
  const [testIpInput, setTestIpInput] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  // 快捷一键开关切换
  const handleToggle = async (e) => {
    e?.stopPropagation();
    const nextState = !enabled;
    setEnabled(nextState);
    const updated = {
      ...currentVal,
      enabled: nextState,
      exemptAdmin,
      whitelistIps,
    };
    await saveSetting('china_ip_block', updated);
  };

  // 保存弹窗内的详细配置
  const handleSaveModal = async () => {
    const updated = {
      enabled,
      exemptAdmin,
      whitelistIps,
    };
    const ok = await saveSetting('china_ip_block', updated);
    if (ok) {
      setIsModalOpen(false);
    }
  };

  // 执行 IP 诊断测试
  const handleTestIp = async () => {
    if (!testIpInput.trim()) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          action: 'test_china_ip',
          ip: testIpInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '测试失败');
      setTestResult(data.data);
    } catch (err) {
      setTestResult({ isChina: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const isSaving = savingKey === 'china_ip_block';

  return (
    <>
      <AdminSettingRow
        label="屏蔽中国流量 (临时插件)"
        value={
          <div className="flex items-center gap-3">
            <StatusBadge tone={enabled ? 'danger' : 'neutral'}>
              {enabled ? '已开启屏蔽 (403)' : '未开启屏蔽'}
            </StatusBadge>

            {/* 高精度状态开关 Switch 按钮 */}
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={enabled ? '停用中国流量屏蔽' : '启用中国流量屏蔽'}
              disabled={isSaving}
              onClick={handleToggle}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-[#0e1013] disabled:opacity-50 ${
                enabled ? 'bg-brand' : 'bg-white/10 hover:bg-white/15'
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        }
        context={
          enabled
            ? '已对所有来自中国大陆的访客 IP 强制返回 403 Forbidden 页面。临时插件架构，支持一键安全完全移除。'
            : '临时插件：开启后所有来自中国大陆的访客 IP 打开站点将显示标准 403 Forbidden 页面，支持放行白名单及管理后台豁免。'
        }
        action="高级配置与测试"
        onClickAction={() => setIsModalOpen(true)}
      />

      {/* 高级配置与 IP 阻断模拟弹窗 */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-[#0e1013] p-6 shadow-elevation-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <h3 className="text-body font-semibold text-ink flex items-center gap-2">
                <ShieldAlert className="size-4 text-brand" />
                <span>中国大陆流量屏蔽控制 (临时插件)</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-ink-subtle hover:text-ink text-sm px-2 py-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 text-xs">
              {/* 开关勾选 */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-line-subtle bg-surface">
                <div>
                  <div className="font-semibold text-ink text-sm">拦截所有中国流量</div>
                  <div className="text-ink-subtle mt-0.5">
                    开启后，来自中国大陆的访客访问任何前台页面将直接看到 403 Forbidden。
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={isSaving}
                  onClick={() => setEnabled(!enabled)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50 ${
                    enabled ? 'bg-brand' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 管理后台豁免保护 */}
              <div className="p-3 rounded-xl border border-line-subtle bg-surface space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={exemptAdmin}
                    onChange={(e) => setExemptAdmin(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-white/20 bg-black/40 text-brand focus:ring-brand cursor-pointer"
                  />
                  <div>
                    <span className="font-semibold text-ink">允许管理员访问管理后台路径 (/admin)</span>
                    <p className="text-ink-subtle mt-0.5">
                      推荐勾选。若管理员本身在中国境内，此项可确保管理员不会因开启拦截而把自己关在后台外面。
                    </p>
                  </div>
                </label>
              </div>

              {/* IP 检测测试工具 */}
              <div className="p-3.5 rounded-xl border border-line-subtle bg-surface space-y-2.5">
                <div className="font-semibold text-ink flex items-center justify-between">
                  <span>中国 IP 检测测试工具</span>
                  <span className="text-[11px] text-ink-subtle font-normal">权威 APNIC 网段库实时二分比对</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testIpInput}
                    onChange={(e) => setTestIpInput(e.target.value)}
                    placeholder="输入 IP 地址测试，如 114.114.114.114 或 8.8.8.8"
                    className="flex-1 rounded-xl border border-line bg-base px-3 py-2 text-xs text-ink outline-none focus:border-brand font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestIp}
                    disabled={isTesting || !testIpInput.trim()}
                    className="rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-ink px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {isTesting ? '检测中…' : '检测'}
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
                      testResult.isChina
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    }`}
                  >
                    {testResult.isChina ? (
                      <AlertCircle className="size-4 shrink-0 text-rose-400" />
                    ) : (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                    )}
                    <div>
                      <span className="font-semibold">
                        {testResult.isChina
                          ? `【判定拦截】IP ${testResult.ip} 属于中国大陆 (${testResult.type || 'CN'})`
                          : `【判定放行】IP ${testResult.ip} 属于海外或非中国公网 IP`}
                      </span>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        {testResult.isChina
                          ? '访问前台页面时将直接返回 403 Forbidden 拦截页。'
                          : '访问站点不受任何限制，正常放行通行。'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 放行白名单 */}
              <div>
                <label className="block font-medium text-ink-muted mb-1.5">
                  放行白名单 IP 或 CIDR 网段（每行一个，支持 IPv4/IPv6）
                </label>
                <textarea
                  rows={2}
                  value={whitelistIps}
                  onChange={(e) => setWhitelistIps(e.target.value)}
                  placeholder="例如：&#10;192.168.1.100&#10;120.24.0.0/16"
                  className="w-full rounded-xl border border-line bg-base p-2.5 text-xs text-ink outline-none focus:border-brand font-mono"
                />
                <p className="mt-1 text-caption text-ink-subtle">
                  位于白名单内的 IP 即使位于中国大陆境内，也将予以豁免放行。
                </p>
              </div>

              {/* 临时插件卸载说明 */}
              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-200/90 text-[11px] leading-relaxed">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
                  <Wrench className="size-3.5" />
                  <span>临时插件完全卸载指引</span>
                </div>
                本功能为独立临时插件设计。后续若需要彻底、完全移除此功能及相关代码，只需在服务器终端执行：
                <code className="block my-1.5 p-1.5 rounded bg-black/60 font-mono text-[10px] text-amber-100 select-all border border-amber-500/20">
                  node plugins/china-ip-block/uninstall.mjs
                </code>
                该脚本会自动抹除 Middleware 挂钩、管理页面配置项及插件目录，100% 干净还原。
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line-subtle">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl border border-line bg-white/[0.04] px-4 py-2 text-xs font-medium text-ink-muted hover:bg-white/[0.08] hover:text-ink transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveModal}
                className="rounded-xl bg-brand px-5 py-2 text-xs font-semibold text-white hover:bg-brand-hover active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
              >
                {isSaving ? '保存中…' : '保存安全配置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
