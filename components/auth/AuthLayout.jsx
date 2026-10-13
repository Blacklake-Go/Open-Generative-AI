'use client';

import React from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/site/BrandLogo';
import { useBranding } from '@/lib/hooks/useBranding';
import { SpatialBackground } from '@/components/spatial';
import { getAuthCopy, getAuthRoutes } from '@/lib/authCopy';

export default function AuthLayout({
  children,
  locale = 'zh-CN',
  title = '',
  subtitle = '',
}) {
  const { brand } = useBranding();
  const copy = getAuthCopy(locale).layout;
  const routes = getAuthRoutes(locale);

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-x-hidden bg-base text-ink select-none font-sans">
      {/* 1. 全局 AI 空间深暗光影与极光流体背景 */}
      <SpatialBackground variant="hero" isFixed showGrid showAurora showNoise />

      {/* 2. 顶部导航条 */}
      <header className="relative z-20 w-full px-4 sm:px-8 py-5 flex items-center justify-between">
        <Link
          href={routes.studioUrl}
          className="group inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 text-white/80 hover:text-white text-xs font-medium transition-all active:scale-95 shadow-elevation-1"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform group-hover:-translate-x-0.5"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>{copy.backToStudio}</span>
        </Link>

        <Link href={routes.studioUrl} className="flex items-center gap-2 opacity-95 hover:opacity-100 transition-opacity">
          <BrandLogo brand={brand} />
        </Link>

        {/* 语言切换辅助导航 */}
        <div className="flex items-center gap-2 text-xs text-white/60">
          <Link
            href={routes.switchLocaleUrl}
            className="px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 hover:text-white border border-white/5 transition-colors"
          >
            {routes.switchLocaleLabel}
          </Link>
        </div>
      </header>

      {/* 3. 中间核心毛玻璃认证卡片视口 */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-[450px] animate-fade-in">
          {/* 卡片外壳：严格遵循《UI_DESIGN_SYSTEM.md》深暗高斯毛玻璃、发丝高光边框与中性阴影 */}
          <div className="relative rounded-2xl bg-[#131519]/85 backdrop-blur-2xl border border-white/10 shadow-elevation-4 p-6 sm:p-8 overflow-hidden">
            {/* 顶部微透环境漫反射高光 */}
            <div
              className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full pointer-events-none opacity-40 blur-2xl"
              style={{ background: 'radial-gradient(circle, rgba(225,29,116,0.35) 0%, transparent 70%)' }}
            />

            {/* 卡片标题区 */}
            {(title || subtitle) && (
              <div className="mb-6 text-center">
                {title && (
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-1.5">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                    {subtitle}
                  </p>
                )}
              </div>
            )}

            {/* 子表单插槽 */}
            {children}
          </div>
        </div>
      </main>

      {/* 4. 底部法务条款与版权说明 */}
      <footer className="relative z-20 w-full px-4 py-6 text-center text-xs text-ink-muted flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
        <span>{copy.copyright}</span>
        <div className="flex items-center gap-3">
          <Link href={routes.termsUrl} className="hover:text-white transition-colors underline-offset-4 hover:underline">
            {copy.terms}
          </Link>
          <span className="opacity-30">·</span>
          <Link href={routes.privacyUrl} className="hover:text-white transition-colors underline-offset-4 hover:underline">
            {copy.privacy}
          </Link>
        </div>
      </footer>
    </div>
  );
}
