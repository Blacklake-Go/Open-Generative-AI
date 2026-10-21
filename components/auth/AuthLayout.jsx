'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Globe, ChevronDown, Check } from 'lucide-react';
import BrandLogo from '@/components/site/BrandLogo';
import { useBranding } from '@/lib/hooks/useBranding';
import { SpatialBackground } from '@/components/spatial';
import { getAuthCopy, getAuthRoutes, normalizeAuthLocale } from '@/lib/authCopy';

export default function AuthLayout({
  children,
  locale = 'en',
  title = '',
  subtitle = '',
}) {
  const { brand } = useBranding();
  const normalizedLocale = normalizeAuthLocale(locale);
  const copy = getAuthCopy(normalizedLocale).layout;
  const routes = getAuthRoutes(normalizedLocale);
  const currentLocale = routes.localeOptions.find((opt) => opt.active) || routes.localeOptions[0];

  const [showLangMenu, setShowLangMenu] = useState(false);
  const langMenuRef = useRef(null);

  const handleSelectLocale = (code) => {
    setShowLangMenu(false);
    try {
      document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `locale=${code}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target)) {
        setShowLangMenu(false);
      }
    };
    if (showLangMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLangMenu]);

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

        {/* 语言切换辅助导航 (6 语言胶囊下拉器) */}
        <div className="relative" ref={langMenuRef}>
          <button
            type="button"
            onClick={() => setShowLangMenu((prev) => !prev)}
            className="h-8 px-3 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 text-white/80 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-all active:scale-95 shadow-elevation-1 cursor-pointer"
            aria-expanded={showLangMenu}
            aria-label="Select Language"
          >
            <Globe size={13} className="text-white/70" />
            <span>{currentLocale?.label || 'Language'}</span>
            <ChevronDown
              size={12}
              className={`text-white/60 transition-transform duration-200 ${showLangMenu ? 'rotate-180' : ''}`}
            />
          </button>

          {showLangMenu && (
            <div className="absolute right-0 top-full mt-1.5 min-w-[130px] p-1.5 rounded-xl bg-[#14171d]/95 backdrop-blur-2xl border border-white/10 shadow-elevation-3 z-50 animate-fade-in flex flex-col gap-0.5">
              {routes.localeOptions.map((opt) => (
                <Link
                  key={opt.code}
                  href={opt.url}
                  onClick={() => handleSelectLocale(opt.code)}
                  className={`h-7 px-2.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    opt.active
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.active && <Check size={12} className="text-brand" />}
                </Link>
              ))}
            </div>
          )}
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
