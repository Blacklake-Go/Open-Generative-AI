'use client';

import { useState } from 'react';
import { FileText, ExternalLink, Save, CheckCircle2, ShieldAlert, RefreshCw } from 'lucide-react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

export default function SitemapRobotsCard({ config, onSave, isSaving }) {
  const [customRules, setCustomRules] = useState(config?.robotsTxtCustom || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (onSave) {
      await onSave({
        robotsTxtCustom: customRules,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  return (
    <Card className="flex flex-col justify-between p-6">
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-400">
              <FileText className="size-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">动态 Sitemap 与 Robots 爬虫协议</h3>
              <span className="mt-0.5 inline-block text-[11px] text-gray-400">
                /sitemap.xml · /robots.txt
              </span>
            </div>
          </div>
          <StatusBadge tone="good">动态路由已就绪</StatusBadge>
        </div>

        <p className="text-xs leading-5 text-gray-300">
          基于全站路由表动态生成符合 sitemaps.org 标准的 XML 索引地图，并输出规范的 Robots.txt 爬虫指引协议，自动屏蔽管理后台与敏感私有接口。
        </p>

        {/* Dynamic Endpoints Access */}
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/30 p-3.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">动态站点地图</span>
                <span className="font-mono text-[11px] text-cyan-400">/sitemap.xml</span>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                自动收录首页、创作工作台、AI 模型库、社区等 14+ 公开主要路由，过滤后台与私有路径
              </p>
            </div>
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-cyan-300 hover:bg-white/10 transition-colors"
            >
              <span>查看 XML</span>
              <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/30 p-3.5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">爬虫抓取协议</span>
                <span className="font-mono text-[11px] text-cyan-400">/robots.txt</span>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                声明爬虫白名单与屏蔽规则（/admin/、/api/ 等），并在末尾显式指向 sitemap.xml
              </p>
            </div>
            <a
              href="/robots.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-cyan-300 hover:bg-white/10 transition-colors"
            >
              <span>查看规则</span>
              <ExternalLink className="size-3" />
            </a>
          </div>

          {/* Custom Robots.txt Rules */}
          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-gray-300">
                Robots.txt 自定义补充规则 (Custom Rules)
              </label>
              <span className="text-[10px] text-gray-400">保存后自动与 public/robots.txt 同步</span>
            </div>
            <textarea
              rows={3}
              value={customRules}
              onChange={(e) => setCustomRules(e.target.value)}
              placeholder="# 可在此输入额外的 Disallow 或 User-agent 规则，例如：&#10;Disallow: /temp-preview/&#10;Disallow: /private-campaign/"
              className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-white placeholder-white/30 outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-white/[0.08] pt-4">
          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="size-3.5" />
                爬虫规则已更新并同步至静态文件与动态路由
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-3.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Save className="size-3.5" />
            <span>{isSaving ? '正在保存...' : '更新爬虫协议'}</span>
          </button>
        </div>
      </form>
    </Card>
  );
}
