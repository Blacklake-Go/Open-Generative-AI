'use client';

import { Card, StatusBadge } from '@/components/admin/AdminUi';
import { Code2, ExternalLink, HelpCircle, AlertCircle, ShieldAlert } from 'lucide-react';

const MAX_CUSTOM_SCRIPT_LENGTH = 10000;

export default function CustomScriptCard({ value, onChange, disabled }) {
  const custom = value || { enabled: false, code: '' };
  const code = custom.code ?? custom.customCode ?? '';
  const isOverLimit = code.length > MAX_CUSTOM_SCRIPT_LENGTH;

  const handleToggle = (nextEnabled) => {
    onChange({ ...custom, enabled: nextEnabled, code });
  };

  const handleCodeChange = (e) => {
    onChange({ ...custom, code: e.target.value });
  };

  return (
    <Card className="flex flex-col justify-between p-6 lg:col-span-2">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-amber-400">
              <Code2 className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white text-sm">自定义统计代码与第三方探针</h3>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-400">
                  高级扩展
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                支持加载自建分析平台（如 Umami, Plausible）或第三方在线客服、监测探针代码。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <StatusBadge tone={custom.enabled ? 'good' : 'neutral'}>
              {custom.enabled ? '已启用' : '未启用'}
            </StatusBadge>
            <button
              type="button"
              role="switch"
              aria-checked={custom.enabled}
              aria-label="启用自定义统计代码"
              disabled={disabled}
              onClick={() => handleToggle(!custom.enabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40 ${
                custom.enabled ? 'border-cyan-500/50 bg-cyan-500/80' : 'border-white/[0.12] bg-white/[0.08]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-3.5 rounded-full bg-white transition-transform duration-200 shadow-sm ${
                  custom.enabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="custom-script-input" className="text-xs font-medium text-gray-300">
              JavaScript 埋点代码或完整 &lt;script&gt; 标签
            </label>
            <span
              className={`text-[11px] tabular-nums ${
                isOverLimit ? 'font-semibold text-red-400' : 'text-gray-400'
              }`}
            >
              {code.length.toLocaleString()} / {MAX_CUSTOM_SCRIPT_LENGTH.toLocaleString()} 字符
            </span>
          </div>
          <textarea
            id="custom-script-input"
            rows={4}
            disabled={disabled}
            value={code}
            onChange={handleCodeChange}
            placeholder="<!-- 粘贴第三方服务商提供的完整 <script> 埋点代码，或纯 JS 函数逻辑 -->"
            className={`w-full font-mono text-xs rounded-xl border px-3.5 py-2.5 text-gray-200 placeholder-white/20 outline-none transition-colors ${
              isOverLimit
                ? 'border-red-500/60 bg-red-500/[0.04] focus:border-red-500'
                : 'border-white/10 bg-black/40 focus:border-cyan-500/60'
            }`}
          />
          {isOverLimit && (
            <p className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>
                自定义统计代码超出上限（最大 {MAX_CUSTOM_SCRIPT_LENGTH} 字符，当前 {code.length} 字符）
              </span>
            </p>
          )}
          <div className="flex items-start gap-1.5 text-[11px] text-amber-400/90 leading-4">
            <ShieldAlert className="size-3.5 shrink-0 text-amber-400 mt-0.5" />
            <span>
              安全提示：脚本将通过客户端隔离组件动态注入执行，严禁粘贴来历不明的未授权脚本，以保障前台数据与会话安全。
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
          <span>常用隐私合规方案参考：</span>
          <a
            href="https://cloud.umami.is/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
          >
            <span>Umami</span>
            <ExternalLink className="size-3" />
          </a>
          <span className="text-white/20">·</span>
          <a
            href="https://plausible.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
          >
            <span>Plausible</span>
            <ExternalLink className="size-3" />
          </a>
          <span className="text-white/20">·</span>
          <a
            href="https://www.51.la/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-gray-300 hover:text-white transition-colors"
          >
            <span>51LA</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </Card>
  );
}
