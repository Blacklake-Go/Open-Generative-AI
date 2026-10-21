'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  GoogleIcon,
  XIcon,
  TikTokIcon,
  InstagramIcon,
  WeChatIcon,
  QQIcon,
  DouyinIcon,
  BilibiliIcon,
} from '@/components/SocialIcons';
import { getAuthCopy, getAuthRoutes } from '@/lib/authCopy';
import { openOAuthPopup } from '@/lib/auth/oauthPopup';

const COUNTRY_CODES = [
  { code: '+86', label: '中国大陆 (+86)' },
  { code: '+1', label: '美国 / 加拿大 (+1)' },
  { code: '+852', label: '中国香港 (+852)' },
  { code: '+886', label: '中国台湾 (+886)' },
  { code: '+81', label: '日本 (+81)' },
  { code: '+65', label: '新加坡 (+65)' },
  { code: '+44', label: '英国 (+44)' },
];

const SOCIAL_ICONS = {
  google: { label: 'Google', icon: GoogleIcon },
  x: { label: 'X', icon: XIcon },
  tiktok: { label: 'TikTok', icon: TikTokIcon },
  instagram: { label: 'Instagram', icon: InstagramIcon },
  wechat: { label: '微信', icon: WeChatIcon },
  qq: { label: 'QQ', icon: QQIcon },
  douyin: { label: '抖音', icon: DouyinIcon },
  bilibili: { label: '哔哩哔哩', icon: BilibiliIcon },
};

export default function LoginForm({ locale = 'en' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = getAuthCopy(locale).login;
  const routes = getAuthRoutes(locale);

  const redirectUrl = searchParams.get('redirect') || routes.studioUrl;

  // Tabs: 'email' | 'phone'
  const [activeTab, setActiveTab] = useState('email');

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Phone state
  const [countryCode, setCountryCode] = useState('+86');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  // Status state
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [socialProviders, setSocialProviders] = useState([]);
  const [socialRegion, setSocialRegion] = useState(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const fetchSocialOptions = useCallback(() => {
    return fetch('/api/auth/social-options', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (Array.isArray(data.providers)) {
          setSocialProviders(
            data.providers.filter((p) => Boolean(p?.id && SOCIAL_ICONS[p.id]))
          );
        }
        if (data.region) {
          setSocialRegion(data.region);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch regional social providers
  useEffect(() => {
    fetchSocialOptions();
  }, [fetchSocialOptions]);

  // Send SMS verification code
  const handleSendPhoneCode = async () => {
    setErrorMsg('');
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setErrorMsg(copy.errEnterPhone);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/phone/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, countryCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send SMS code');

      setCountdown(60);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Submit Login
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setBusy(true);

    try {
      if (activeTab === 'phone') {
        const cleanPhone = phone.trim();
        const cleanCode = code.trim();
        if (!cleanPhone) {
          setErrorMsg(copy.errEnterPhone);
          setBusy(false);
          return;
        }
        if (!cleanCode) {
          setErrorMsg(copy.errEnterPhoneCode);
          setBusy(false);
          return;
        }
        const res = await fetch('/api/auth/phone/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, countryCode, code: cleanCode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || copy.errLoginFailed);
      } else {
        const cleanEmail = email.trim();
        if (!cleanEmail) {
          setErrorMsg(copy.errEnterEmail);
          setBusy(false);
          return;
        }
        if (!password) {
          setErrorMsg(copy.errEnterPassword);
          setBusy(false);
          return;
        }
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || copy.errLoginFailed);
      }

      // Success: redirect
      router.push(redirectUrl);
      router.refresh();
    } catch (err) {
      setErrorMsg(err.message || copy.errLoginFailed);
    } finally {
      setBusy(false);
    }
  };

  // 监听 URL 中的第三方授权错误参数与弹窗授权回调
  useEffect(() => {
    const authError = searchParams?.get('auth_error');
    if (authError) {
      setErrorMsg(decodeURIComponent(authError));
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleOAuthEvent = (data) => {
      if (!data || (data.type !== 'supdance-auth-complete' && data.type !== 'koyosim-auth-complete')) return;
      if (data.action === 'bind') return;
      if (data.ok) {
        router.push(redirectUrl);
        router.refresh();
      } else if (data.message) {
        setErrorMsg(data.message);
      }
    };

    const handleWindowMessage = (event) => handleOAuthEvent(event?.data);
    const handleStorageChange = (event) => {
      if ((event.key === 'supdance_auth_event' || event.key === 'supdance-oauth-sync' || event.key === 'koyosim_auth_event' || event.key === 'koyosim-oauth-sync') && event.newValue) {
        try {
          handleOAuthEvent(JSON.parse(event.newValue));
        } catch {}
      }
    };

    let channel = null;
    let channelKoyo = null;
    try {
      if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel('supdance_auth_channel');
        channel.onmessage = (event) => handleOAuthEvent(event.data);
        channelKoyo = new BroadcastChannel('koyosim_auth_channel');
        channelKoyo.onmessage = (event) => handleOAuthEvent(event.data);
      }
    } catch {}

    window.addEventListener('message', handleWindowMessage);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      if (channel) channel.close();
      if (channelKoyo) channelKoyo.close();
      window.removeEventListener('message', handleWindowMessage);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [redirectUrl, router]);

  const handleOAuth = (providerId) => {
    const url = `/api/auth/oauth/${providerId}?returnTo=${encodeURIComponent(redirectUrl)}&redirect=${encodeURIComponent(redirectUrl)}`;
    openOAuthPopup(url);
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* 1. 登录模式胶囊切换器 (Tabs Pill) */}
      <div className="flex p-1 rounded-full bg-[#101216] border border-white/10 shadow-elevation-1">
        <button
          type="button"
          onClick={() => {
            setActiveTab('email');
            setErrorMsg('');
          }}
          className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
            activeTab === 'email'
              ? 'bg-white/15 text-white shadow-elevation-1'
              : 'text-white/60 hover:text-white'
          }`}
        >
          {copy.tabEmail}
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('phone');
            setErrorMsg('');
          }}
          className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer ${
            activeTab === 'phone'
              ? 'bg-white/15 text-white shadow-elevation-1'
              : 'text-white/60 hover:text-white'
          }`}
        >
          {copy.tabPhone}
        </button>
      </div>

      {/* 2. 错误提示条 */}
      {errorMsg && (
        <div className="px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 animate-fade-in">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="flex-1">{errorMsg}</span>
        </div>
      )}

      {/* 3. 登录主表单 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {activeTab === 'email' ? (
          <>
            {/* 邮箱输入 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">
                {copy.emailLabel}
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={copy.emailPlaceholder}
                className="w-full h-11 px-3.5 rounded-xl bg-[#101216] border border-white/10 text-white placeholder-white/30 text-xs sm:text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/50 transition-all font-mono"
              />
            </div>

            {/* 密码输入 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-white/70">
                  {copy.passwordLabel}
                </label>
                <Link
                  href={routes.forgotPasswordUrl}
                  className="text-xs text-brand hover:text-brand-hover underline-offset-4 hover:underline transition-colors"
                >
                  {copy.forgotPasswordLink}
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={copy.passwordPlaceholder}
                  className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-[#101216] border border-white/10 text-white placeholder-white/30 text-xs sm:text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/50 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 p-1 cursor-pointer transition-colors"
                >
                  {showPassword ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 手机号输入 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">
                {copy.phoneLabel}
              </label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="h-11 px-2.5 rounded-xl bg-[#101216] border border-white/10 text-white text-xs focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/50 transition-all cursor-pointer"
                >
                  {COUNTRY_CODES.map((item) => (
                    <option key={item.code} value={item.code} className="bg-[#181a20] text-white">
                      {copy.countryLabels?.[item.code] || item.label}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={copy.phonePlaceholder}
                  className="flex-1 h-11 px-3.5 rounded-xl bg-[#101216] border border-white/10 text-white placeholder-white/30 text-xs sm:text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/50 transition-all font-mono"
                />
              </div>
            </div>

            {/* 短信验证码输入 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">
                {copy.codeLabel}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={copy.codePlaceholder}
                  className="flex-1 h-11 px-3.5 rounded-xl bg-[#101216] border border-white/10 text-white placeholder-white/30 text-xs sm:text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/50 transition-all font-mono tracking-widest"
                />
                <button
                  type="button"
                  disabled={busy || countdown > 0}
                  onClick={handleSendPhoneCode}
                  className="h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 disabled:opacity-40 border border-white/10 text-xs text-white font-medium transition-all cursor-pointer whitespace-nowrap"
                >
                  {countdown > 0 ? copy.resendCode(countdown) : copy.sendCode}
                </button>
              </div>
            </div>
          </>
        )}

        {/* 提交登录按钮 */}
        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 mt-2 rounded-full bg-brand hover:bg-brand-hover active:bg-brand-active disabled:opacity-50 text-white text-sm font-semibold transition-all duration-200 shadow-elevation-2 flex items-center justify-center gap-2 cursor-pointer"
        >
          {busy && <span className="animate-spin text-sm">◌</span>}
          <span>{busy ? copy.loggingIn : copy.submitLogin}</span>
        </button>
      </form>

      {/* 4. 第三方社交平台快捷登录 */}
      {(socialProviders.length > 0 || socialRegion) && (
        <div className="flex flex-col gap-3">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <span className="relative px-3 bg-[#131519] text-[11px] text-white/40 uppercase tracking-wider">
              {copy.socialDivider}
            </span>
          </div>

          {socialProviders.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {socialProviders.map((provider) => {
                const item = SOCIAL_ICONS[provider.id];
                if (!item) return null;
                const Icon = item.icon;
                const isZh = String(locale || '').startsWith('zh');
                const btnLabel = typeof copy.socialLoginLabel === 'function'
                  ? copy.socialLoginLabel(item.label)
                  : (isZh ? `${item.label} 登录` : item.label);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => handleOAuth(provider.id)}
                    title={btnLabel}
                    className="h-10 px-3.5 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 hover:border-white/20 flex items-center justify-center gap-2 text-xs font-medium text-white/90 hover:text-white transition-all active:scale-[0.98] shadow-elevation-1 cursor-pointer"
                  >
                    <Icon size={18} />
                    <span className="truncate">{btnLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. 注册新账号引导 */}
      <div className="pt-2 text-center text-xs text-white/60">
        <span>{copy.noAccountPrompt} </span>
        <Link
          href={routes.registerUrl}
          className="text-brand hover:text-brand-hover font-medium underline-offset-4 hover:underline transition-colors"
        >
          {copy.registerLink}
        </Link>
      </div>
    </div>
  );
}
