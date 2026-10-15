'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 微信小程序规范下划线选项卡导航 (WeChat Underline Sub-Navigation Tabs)
 * 严格依据 docs/ADMIN_UI_DESIGN_SYSTEM.md §5 次级选项卡规范设计：
 * - 纯粹文本主导，去除厚重药丸底框与多余彩标
 * - 激活态高对比文字 + 底部实心圆角 2px 下划标尺
 * - 跨 /admin/models、/admin/models/routing、/admin/models/pricing 统一无缝切换
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
    { id: 'routing', label: '模型 API / 渠道', href: '/admin/models/routing' },
    { id: 'pricing', label: '模型定价与利润', href: '/admin/models/pricing' },
  ];

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-subtle ${className}`}>
      {/* 极简下划线切换导航 (WeChat Spec: Underline Tabs) */}
      <div className="flex items-center gap-8 -mb-px overflow-x-auto custom-scrollbar">
        {tabs.map((tab) => {
          const isActive = propActiveTab
            ? propActiveTab === tab.id
            : tab.href === '/admin/models'
            ? pathname === '/admin/models' || pathname === '/admin/models/frontend'
            : pathname?.startsWith(tab.href);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`relative pb-3 text-sm font-semibold whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer ${
                isActive
                  ? 'text-brand'
                  : 'text-ink-muted hover:text-ink font-medium'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-mono font-bold ${
                    isActive ? 'bg-brand/10 text-brand' : 'bg-white/10 text-ink-subtle'
                  }`}
                >
                  {tab.count}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 inset-x-0 h-0.5 bg-brand rounded-full shadow-[0_1px_6px_rgba(225,29,116,0.4)]" />
              )}
            </Link>
          );
        })}
      </div>

      {/* 右侧业务主行动按钮 */}
      {rightAction && (
        <div className="pb-2.5 shrink-0 flex items-center gap-2">
          {rightAction}
        </div>
      )}
    </div>
  );
}
