'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getLocaleFromPathname, LOCALE_CONFIGS, SUPPORTED_LOCALES, normalizeLocale } from '@/lib/locales';
import { switchLocale as switchLocaleVia } from '@/lib/client/localeSwitch';

const FLAG_BY_LOCALE = {
  en: ['/flags/en.svg', 'English'],
  'zh-CN': ['/flags/zh-cn.svg', 'Simplified Chinese'],
  'zh-TW': ['/flags/zh-tw.svg', 'Traditional Chinese'],
  'ja-JP': ['/flags/ja.svg', 'Japanese'],
  'ko-KR': ['/flags/ko.svg', 'Korean'],
  es: ['/flags/es.svg', 'Spanish'],
};

const LOCALE_OPTIONS = SUPPORTED_LOCALES.map((code) => {
  const [flag, flagAlt] = FLAG_BY_LOCALE[code] || ['/flags/en.svg', code];
  return {
    code,
    label: LOCALE_CONFIGS[code]?.nativeName || code,
    flag,
    flagAlt,
  };
});

export default function LanguageSwitcher({ className = '', showLabel = true }) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // 无前缀页上路径说不出语言，标签于是永远显示 English。首帧仍按路径渲染
  // （与服务端一致，避免 hydration 错位），挂载后再跟中间件真正使用的 cookie 对齐。
  const [cookieLocale, setCookieLocale] = useState(null);
  useEffect(() => {
    const hit = /(?:^|;\s*)(?:NEXT_LOCALE|locale)=([^;]+)/.exec(document.cookie);
    if (hit) setCookieLocale(normalizeLocale(decodeURIComponent(hit[1])));
  }, []);
  const pathLocale = getLocaleFromPathname(pathname);
  const currentLocale = pathLocale === 'en' && cookieLocale ? cookieLocale : pathLocale;
  const currentOption = LOCALE_OPTIONS.find((option) => option.code === currentLocale) || LOCALE_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function switchLocale(targetLocale) {
    setOpen(false);
    if (targetLocale === currentLocale) return;
    // cookie 写入、偏好落库、"换前缀导航还是原地刷新"全交给唯一实现：
    // 这里以前养着一份独立拷贝，在只有 /zh 真建了树的事实下必然与用户菜单那份分叉。
    const query = searchParams?.toString();
    switchLocaleVia({ targetLocale, pathname, search: query ? `?${query}` : '' });
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    const currentIndex = Math.max(0, LOCALE_OPTIONS.findIndex((option) => option.code === currentLocale));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = event.key === 'ArrowDown'
        ? (currentIndex + 1) % LOCALE_OPTIONS.length
        : (currentIndex - 1 + LOCALE_OPTIONS.length) % LOCALE_OPTIONS.length;
      switchLocale(LOCALE_OPTIONS[nextIndex].code);
    }
  }

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleMenuKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900/70 border border-zinc-800 hover:text-white hover:border-zinc-700 transition-all cursor-pointer"
        aria-label={`Switch language. Current language: ${currentOption.label}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        {showLabel && <span>{currentOption.label}</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div role="menu" aria-label="Language options" className="absolute right-0 mt-1.5 w-40 py-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95">
          {LOCALE_OPTIONS.map((option) => {
            const selected = option.code === currentLocale;
            return (
              <button
                key={option.code}
                type="button"
                role="menuitem"
                aria-current={selected ? 'true' : undefined}
                onClick={() => switchLocale(option.code)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition-colors ${selected ? 'text-cyan-400 bg-cyan-950/20 font-medium' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'}`}
              >
                <img src={option.flag} alt={option.flagAlt} className="h-4 w-5 rounded-[4px] object-cover ring-1 ring-white/10" />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected && <span className="text-cyan-400" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
