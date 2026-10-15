'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';
import { BarChart3, ExternalLink, HelpCircle, AlertCircle, KeyRound, ChevronDown, ChevronUp, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

const GA4_REGEX = /^G-[A-Za-z0-9]+$/;

export default function GoogleAnalyticsCard({ value, onChange, disabled }) {
  const ga4 = value || {
    enabled: false,
    measurementId: '',
    propertyId: '',
    serviceAccountEmail: '',
    serviceAccountPrivateKey: '',
  };

  const [showAdvanced, setShowAdvanced] = useState(Boolean(ga4.propertyId || ga4.serviceAccountEmail));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok: boolean, message: string }

  const id = ga4.measurementId?.trim() || '';
  const hasError = ga4.enabled && Boolean(id) && !GA4_REGEX.test(id);

  const handleToggle = (nextEnabled) => {
    onChange({ ...ga4, enabled: nextEnabled });
  };

  const handleFieldChange = (field, val) => {
    onChange({ ...ga4, [field]: val });
  };

  // 支持直接粘贴 Google Service Account 完整 JSON 自动解析
  const handleJsonPaste = (text) => {
    try {
      const parsed = JSON.parse(text);
      if (parsed.client_email && parsed.private_key) {
        onChange({
          ...ga4,
          serviceAccountEmail: parsed.client_email,
          serviceAccountPrivateKey: parsed.private_key,
        });
        setTestResult({
          ok: true,
          message: `已自动解析服务账号凭证: ${parsed.client_email}`,
        });
        return true;
      }
    } catch {}
    return false;
  };

  // 测试与 GA4 Data API 的连通性
  const handleTestConnection = async () => {
    if (!ga4.propertyId) {
      setTestResult({ ok: false, message: '请先填入 GA4 媒体资源 ID (Property ID)' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/visitors/analytics/ga4', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: ga4.propertyId,
          serviceAccountEmail: ga4.serviceAccountEmail,
          serviceAccountPrivateKey: ga4.serviceAccountPrivateKey,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.data?.ok) {
        setTestResult({
          ok: false,
          message: json.data?.message || json.error?.message || '连通性测试未通过，请核对凭证与 GA4 权限设置',
        });
      } else {
        setTestResult({
          ok: true,
          message: json.data.message || '连通成功！GA4 数据源已就绪。',
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err?.message || '测试网络请求失败',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="flex flex-col justify-between p-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-400">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white text-sm">Google Analytics 4 (GA4)</h3>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-400">
                  国际站主力
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                基于事件模型，提供全链路转化漏斗与全球访客受众洞察。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <StatusBadge tone={ga4.enabled ? 'good' : 'neutral'}>
              {ga4.enabled ? '已启用' : '未启用'}
            </StatusBadge>
            <button
              type="button"
              role="switch"
              aria-checked={ga4.enabled}
              aria-label="启用 Google Analytics 4"
              disabled={disabled}
              onClick={() => handleToggle(!ga4.enabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40 ${
                ga4.enabled ? 'border-cyan-500/50 bg-cyan-500/80' : 'border-white/[0.12] bg-white/[0.08]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-3.5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                  ga4.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 基础配置：衡量 ID 与 媒体资源 ID */}
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="ga4-id-input" className="text-xs font-medium text-gray-300">
                Measurement ID (衡量 ID)
              </label>
              <span className="text-[11px] text-gray-400">格式：G-XXXXXXXXXX</span>
            </div>
            <input
              id="ga4-id-input"
              type="text"
              disabled={disabled}
              value={ga4.measurementId || ''}
              onChange={(e) => handleFieldChange('measurementId', e.target.value.trim())}
              placeholder="例如：G-BP6RZPLRZ2"
              className={`w-full rounded-xl border px-3.5 py-2 text-xs text-white placeholder-white/20 outline-none transition-colors ${
                hasError
                  ? 'border-red-500/60 bg-red-500/[0.04] focus:border-red-500'
                  : 'border-white/10 bg-black/40 focus:border-cyan-500/60'
              }`}
            />
            {hasError && (
              <p className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>Google Analytics 4 衡量 ID 格式错误，必须形如 G-XXXXXXXXXX</span>
              </p>
            )}
            <p className="text-[11px] leading-4 text-gray-400 flex items-start gap-1">
              <HelpCircle className="size-3.5 shrink-0 text-gray-400 mt-0.5" />
              <span>在 Google Analytics 管理员 → 数据流 → 网站数据流中复制以 G- 开头的 ID。</span>
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="ga4-prop-id-input" className="text-xs font-medium text-gray-300">
                Property ID (媒体资源数字 ID)
              </label>
              <span className="text-[11px] text-cyan-400/80">用于后台直拉数据源</span>
            </div>
            <input
              id="ga4-prop-id-input"
              type="text"
              disabled={disabled}
              value={ga4.propertyId || ''}
              onChange={(e) => handleFieldChange('propertyId', e.target.value.trim())}
              placeholder="例如：558360595"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white placeholder-white/20 outline-none transition-colors focus:border-cyan-500/60"
            />
            <p className="text-[11px] leading-4 text-gray-400 flex items-start gap-1">
              <HelpCircle className="size-3.5 shrink-0 text-gray-400 mt-0.5" />
              <span>可在 Google Analytics 管理员 → 媒体资源详情中查看，例如 558360595。</span>
            </p>
          </div>

          {/* 高级设置开关：Google Analytics Data API 服务账号密钥 */}
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between text-xs font-medium text-gray-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="size-3.5 text-cyan-400" />
                <span>Google Analytics Data API 服务账号凭据 (拉取数据源)</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-gray-400">
                <span>{showAdvanced ? '收起凭据配置' : '展开凭据配置'}</span>
                {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </div>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-3 pt-3 border-t border-white/[0.06]">
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.03] p-2.5 text-[11px] text-cyan-300/90 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-medium mb-1">
                    <Sparkles className="size-3 text-cyan-400 shrink-0" />
                    <span>支持粘贴 Google Cloud 服务账号 JSON 自动解析</span>
                  </div>
                  <div>在 Google Cloud Console 创建服务账号，并在 GA4「媒体资源访问权限管理」中添加该邮箱为「查看者 Viewer」。</div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-gray-400 block mb-1">
                    Service Account Client Email (服务账号邮箱)
                  </label>
                  <input
                    type="text"
                    disabled={disabled}
                    value={ga4.serviceAccountEmail || ''}
                    onChange={(e) => {
                      const text = e.target.value.trim();
                      if (!handleJsonPaste(text)) {
                        handleFieldChange('serviceAccountEmail', text);
                      }
                    }}
                    placeholder="例如：ga4-reader@my-project.iam.gserviceaccount.com"
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder-white/20 outline-none focus:border-cyan-500/60"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-gray-400">
                      Private Key (私钥内容或直接粘贴 JSON)
                    </label>
                    <span className="text-[10px] text-gray-500">仅用于服务端签名，加密存储</span>
                  </div>
                  <textarea
                    rows={3}
                    disabled={disabled}
                    value={ga4.serviceAccountPrivateKey || ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      if (!handleJsonPaste(text)) {
                        handleFieldChange('serviceAccountPrivateKey', text);
                      }
                    }}
                    placeholder="-----BEGIN PRIVATE KEY----- ... 或直接粘贴整个 JSON 密钥文件"
                    className="w-full rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-[11px] text-white/80 placeholder-white/20 outline-none focus:border-cyan-500/60 resize-y"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    disabled={disabled || testing || !ga4.propertyId}
                    onClick={handleTestConnection}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  >
                    {testing ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>正在校验 Google Data API 连通性...</span>
                      </>
                    ) : (
                      <>
                        <BarChart3 className="size-3" />
                        <span>测试 API 连通性</span>
                      </>
                    )}
                  </button>

                  <a
                    href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-gray-400 hover:text-cyan-300 transition-colors inline-flex items-center gap-1"
                  >
                    <span>Google Cloud 凭证中心</span>
                    <ExternalLink className="size-2.5" />
                  </a>
                </div>

                {testResult && (
                  <div
                    className={`rounded-lg border p-2.5 text-xs flex items-start gap-2 ${
                      testResult.ok
                        ? 'border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-300'
                        : 'border-red-500/30 bg-red-500/[0.05] text-red-300'
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-400 mt-0.5" />
                    ) : (
                      <AlertCircle className="size-4 shrink-0 text-red-400 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{testResult.message}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-4">
        <div className="flex items-center gap-3">
          <a
            href="https://analytics.google.com/analytics/web/#/realtime"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200 transition-colors"
          >
            <span>实时访客看版</span>
            <ExternalLink className="size-3" />
          </a>
          <a
            href="https://analytics.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <span>控制台首页</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
        <a
          href="https://support.google.com/analytics/answer/9304153"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
        >
          官方获取文档 ↗
        </a>
      </div>
    </Card>
  );
}
