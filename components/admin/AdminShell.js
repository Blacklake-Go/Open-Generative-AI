'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import AdminNav from './AdminNav';
import { roleLabel } from '@/lib/admin/permissions';
import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/site/StudioHeader';

export default function AdminShell({ user, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f6f8f9] text-slate-800 antialiased selection:bg-brand/10 selection:text-brand">
      {/* 56px 全局固定顶栏 (微信标准白底高质感顶栏) */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200/90 bg-white/95 px-4 backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          {/* 移动端汉堡按钮 */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 lg:hidden focus-visible:ring-2 focus-visible:ring-brand/40"
            aria-label="切换侧栏导航"
          >
            {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          <BrandMark compact />

          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
            运营管理端
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-700 sm:flex font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            系统在线
          </span>

          <span className="rounded-full border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-brand font-semibold text-[11px]">
            {roleLabel(user?.role)}
          </span>

          <span className="hidden rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600 md:inline font-mono text-[11px]">
            {user?.email}
          </span>

          <Link
            href="/studio"
            prefetch={false}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand select-none shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            返回 Studio
          </Link>

          <Link
            href="/account"
            prefetch={false}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 select-none shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            账户
          </Link>
        </div>
      </header>

      {/* 桌面端 220px 展开侧栏 (WeAnalysis 纯白微边侧栏) */}
      <aside className="fixed bottom-0 left-0 top-14 z-30 hidden w-[220px] overflow-y-auto border-r border-slate-200/90 bg-white px-2.5 py-4 admin-sidebar-scrollbar scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] lg:block">
        <AdminNav user={user} />
      </aside>

      {/* 移动端侧栏抽屉 */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="fixed bottom-0 left-0 top-14 w-[240px] overflow-y-auto border-r border-slate-200 bg-white px-3 py-5 shadow-2xl admin-sidebar-scrollbar scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <AdminNav user={user} onItemClick={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* 主画布区域 (微信企业级轻灰底色 #f6f8f9) */}
      <main className="min-h-screen pt-14 lg:pl-[220px] bg-[#f6f8f9]">
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
