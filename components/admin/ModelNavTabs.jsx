'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * AI 模型中心顶层三位一体切换卡片组 (Top Switchable Card Tabs Group)
 * 涵盖：
 * 1. 模型管理 (/admin/models)
 * 2. 供应商管理（模型API） (/admin/models/providers)
 * 3. 模型定价与利润 (/admin/models/pricing)
 *
 * 统一高度 h-[42px]，暗黑极简高对比卡片组设计
 */
export default function ModelNavTabs({
  activeTab: propActiveTab,
  modelCount,
  rightAction,
  className = '',
}) {
  const pathname = usePathname();

  const tabs = [
    { id: 'models', label: '模型管理', href: '/admin/models', count: modelCount },
    { id: 'providers', label: '供应商管理（模型API）', href: '/admin/models/providers' },
    { id: 'pricing', label: '模型定价与利润', href: '/admin/models/pricing' },
  ];

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2 rounded-2xl bg-surface-raised/70 border border-line-subtle shadow-elevation-1 ${className}`}
    >
      {/* 顶层切换卡片组 (Switchable Card Tabs) */}
      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
        {tabs.map((tab) => {
          const isActive = propActiveTab
            ? propActiveTab === tab.id
            : tab.id === 'models'
            ? pathname === '/admin/models' || pathname === '/admin/models/frontend'
            : tab.id === 'providers'
            ? pathname === '/admin/models/providers' || pathname?.startsWith('/admin/models/providers')
            : tab.id === 'pricing'
            ? pathname === '/admin/models/pricing' || pathname?.startsWith('/admin/models/pricing')
            : pathname?.startsWith(tab.href);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`inline-flex items-center gap-2 rounded-xl px-4 h-[42px] text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
                isActive
                  ? 'bg-white text-black border-white shadow-elevation-1 font-bold'
                  : 'bg-surface-raised border-line text-ink-muted hover:text-ink hover:bg-white/[0.06]'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-mono font-bold ${
                    isActive ? 'bg-black/15 text-black' : 'bg-white/10 text-ink-subtle'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* 右侧业务操作 (统一高度 h-[42px]) */}
      {rightAction && (
        <div className="shrink-0 flex items-center gap-2">
          {rightAction}
        </div>
      )}
    </div>
  );
}
