'use client';

import { Card, StatusBadge } from '@/components/admin/AdminUi';
import { BarChart3, ExternalLink, HelpCircle, AlertCircle } from 'lucide-react';

const GA4_REGEX = /^G-[A-Za-z0-9]+$/;

export default function GoogleAnalyticsCard({ value, onChange, disabled }) {
  const ga4 = value || { enabled: false, measurementId: '' };
  const id = ga4.measurementId?.trim() || '';
  const hasError = ga4.enabled && Boolean(id) && !GA4_REGEX.test(id);

  const handleToggle = (nextEnabled) => {
    onChange({ ...ga4, enabled: nextEnabled });
  };

  const handleIdChange = (e) => {
    onChange({ ...ga4, measurementId: e.target.value.trim() });
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

        <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/30 p-4 space-y-2">
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
            onChange={handleIdChange}
            placeholder="例如：G-12345ABCDE"
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
