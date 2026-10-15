'use client';

import React, { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, LogOut, User, Activity, UserRound, CreditCard, BarChart2 } from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'activity', label: '活跃历史', icon: Activity },
  { id: 'settings', label: '账号与设置', icon: UserRound },
  { id: 'billing', label: '订阅与账单', icon: CreditCard },
  { id: 'usage', label: '额度明细', icon: BarChart2 },
];

export function normalizeTab(tab) {
  if (!tab) return 'activity';
  const t = String(tab).toLowerCase().trim();
  if (['activity', 'stats', 'creations', 'dashboard', 'history'].includes(t)) {
    return 'activity';
  }
  if (['usage', 'ledger', 'points-details', 'credits', 'consumption', 'credits-usage'].includes(t)) {
    return 'usage';
  }
  if (['billing', 'membership', 'subscription', 'invoices', 'price-details', 'wallet', 'orders'].includes(t)) {
    return 'billing';
  }
  if (['settings', 'profile', 'security', 'edit-profile', 'account'].includes(t)) {
    return 'settings';
  }
  return 'settings';
}

export default function AccountLayout({
  user,
  activeTab = 'activity',
  onTabChange,
  onLogout,
  onClose,
  onOpenAuth,
  withBackdrop = false,
  children,
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const currentNormalizedTab = normalizeTab(activeTab);
  const currentItem = NAV_ITEMS.find((item) => item.id === currentNormalizedTab) || NAV_ITEMS[0];
  const CurrentIcon = currentItem.icon;

  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('account') || url.searchParams.has('action')) {
          url.searchParams.delete('account');
          url.searchParams.delete('action');
          window.history.replaceState(null, '', url.toString());
        }
      } catch {}
    }
    if (onClose) {
      onClose();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/studio');
    }
  }, [onClose, router]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleClose]);

  const handleLogoutClick = async () => {
    setLoggingOut(true);
    if (onLogout) {
      await onLogout();
    }
  };

  const cardContent = (
    <div
      className="relative w-full max-w-[1400px] 2xl:max-w-[1480px] h-[90vh] md:h-[86vh] max-h-[880px] min-h-[600px] rounded-2xl border border-line bg-overlay backdrop-blur-xl shadow-elevation-4 flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-modal ease-enter cursor-default select-none"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="个人中心与设置"
    >
      {/* 左侧垂直侧栏导航 (竖排 Tab) */}
      <aside className="w-full md:w-60 lg:w-64 shrink-0 border-b md:border-b-0 md:border-r border-line-subtle bg-surface flex flex-col justify-between">
        <div className="p-4 sm:p-5">
          {/* 侧栏顶部标题 */}
          <div className="mb-4 sm:mb-6 px-1 hidden md:block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
              ACCOUNT CENTER
            </span>
            <h2 className="mt-0.5 text-base font-bold text-ink tracking-tight">
              个人中心
            </h2>
          </div>

          {/* 竖排导航列表 */}
          <nav className="flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0 scrollbar-none" aria-label="个人中心导航">
            {NAV_ITEMS.map((item) => {
              const isActive = currentNormalizedTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`group relative flex items-center gap-2.5 md:gap-3 px-3.5 py-2.5 rounded-xl text-caption md:text-body-sm font-medium transition-[background-color,border-color,color,transform] duration-fast cursor-pointer shrink-0 md:shrink md:w-full overflow-hidden ${
                    isActive
                      ? 'bg-brand-soft text-white font-semibold shadow-elevation-1 border border-brand-line'
                      : 'text-ink-muted hover:text-ink hover:bg-wash border border-transparent hover:translate-x-0.5'
                  }`}
                >
                  {/* 活跃项左侧细高光指示条 */}
                  {isActive && (
                    <span className="hidden md:block absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-brand shadow-[0_0_8px_rgba(225,29,116,0.6)]" />
                  )}
                  <Icon className={`size-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-brand' : 'text-ink-muted group-hover:text-ink'}`} />
                  <span className="truncate text-left">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* 侧栏底部：桌面端 UID 与退出/登录 */}
        <div className="p-4 sm:p-5 border-t border-line-subtle bg-surface/50 hidden md:block">
          <div className="flex items-center justify-between text-caption text-ink-subtle font-mono px-1">
            <span className="text-micro text-ink-disabled uppercase">UID</span>
            <span className="truncate max-w-[130px] font-medium text-ink-muted">
              {user?.userNumber || user?.id || '—'}
            </span>
          </div>

          <div className="mt-3">
            {user ? (
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogoutClick}
                className="flex w-full items-center justify-center gap-2 px-3 py-2 rounded-xl text-caption font-medium text-ink-muted hover:text-danger hover:bg-danger-soft/20 transition-colors cursor-pointer disabled:opacity-50 border border-line-subtle/50"
              >
                <LogOut className={`size-3.5 ${loggingOut ? 'animate-spin' : ''}`} />
                <span>{loggingOut ? '正在退出…' : '退出登录'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (onOpenAuth) onOpenAuth();
                  else if (typeof window !== 'undefined') window.location.href = '/login';
                }}
                className="flex w-full items-center justify-center gap-2 px-3.5 py-2 rounded-full text-caption font-semibold text-brand bg-brand-soft border border-brand-line hover:bg-brand-pressed active:scale-[0.98] active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer shadow-elevation-1"
              >
                <User className="size-3.5" />
                <span>立即登录</span>
              </button>
            )}
          </div>
        </div>

        {/* 移动端紧凑底栏 */}
        <div className="md:hidden flex items-center justify-between px-4 py-2 border-t border-line-subtle bg-surface/50 text-caption">
          <span className="text-micro text-ink-subtle font-mono">UID: {user?.userNumber || user?.id || '—'}</span>
          {user && (
            <button
              type="button"
              disabled={loggingOut}
              onClick={handleLogoutClick}
              className="flex items-center gap-1.5 text-ink-muted hover:text-danger text-caption font-medium cursor-pointer"
            >
              <LogOut className="size-3" />
              <span>{loggingOut ? '退出中…' : '退出'}</span>
            </button>
          )}
        </div>
      </aside>

      {/* 右侧主面板：头部标题栏 + 滚动内容区 */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-raised/40 overflow-hidden">
        {/* 右侧内容头部 */}
        <header className="flex items-center justify-between px-5 md:px-6 py-3.5 md:py-4 border-b border-line-subtle bg-surface/30 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5">
            <CurrentIcon className="size-4 text-brand" />
            <h1 className="text-body-sm font-bold text-ink tracking-tight">
              {currentItem.label}
            </h1>
          </div>

          {/* 右上角关闭按钮 */}
          <button
            type="button"
            onClick={handleClose}
            className="size-8 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-wash active:scale-[0.98] active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer"
            title="关闭 (Esc)"
            aria-label="关闭弹窗"
          >
            <X className="size-4" />
          </button>
        </header>

        {/* 右侧可滚动内容主体 */}
        <main className="flex-1 overflow-y-auto scrollbar-rail p-5 sm:p-6 lg:p-8">
          <div key={currentNormalizedTab} className="animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out">
            {children}
          </div>
        </main>
      </div>
    </div>
  );

  if (!withBackdrop) {
    return cardContent;
  }

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-scrim backdrop-blur-xl animate-in fade-in duration-modal ease-enter overflow-hidden cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {cardContent}
    </div>
  );
}
