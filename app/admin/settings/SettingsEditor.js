'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, StatusBadge } from '@/components/admin/AdminUi';
import {
  BilibiliIcon,
  DouyinIcon,
  GoogleIcon,
  InstagramIcon,
  QQIcon,
  TikTokIcon,
  WeChatIcon,
  XIcon,
} from '@/components/SocialIcons';

export default function SettingsEditor({ initialSettings }) {
  const [settings, setSettings] = useState(initialSettings || []);
  const [savingKey, setSavingKey] = useState(null);
  const [feedback, setFeedback] = useState({});

  const getVal = (key, fallback) => {
    const item = settings.find((s) => s.key === key);
    return item?.value !== undefined ? item.value : fallback;
  };

  const saveSetting = async (key, value, visibility = 'public') => {
    setSavingKey(key);
    setFeedback((prev) => ({ ...prev, [key]: '' }));

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ key, value, visibility }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '保存失败');

      setFeedback((prev) => ({ ...prev, [key]: '已成功更新并留存审计' }));
      setTimeout(() => {
        setFeedback((prev) => ({ ...prev, [key]: '' }));
      }, 3000);
    } catch (err) {
      setFeedback((prev) => ({ ...prev, [key]: `错误: ${err.message}` }));
    } finally {
      setSavingKey(null);
    }
  };

  // 1. 全站公告横幅
  const banner = getVal('site_banner', { enabled: false, message: '', tone: 'info', dismissible: true });
  const [bannerEnabled, setBannerEnabled] = useState(Boolean(banner.enabled));
  const [bannerMsg, setBannerMsg] = useState(banner.message || '');
  const [bannerTone, setBannerTone] = useState(banner.tone || 'info');

  // 2. 注册开关
  const reg = getVal('registration_enabled', { enabled: true, allow_oauth: true });
  const [allowRegister, setAllowRegister] = useState(Boolean(reg.enabled));
  const [allowOauth, setAllowOauth] = useState(Boolean(reg.allow_oauth));

  // 3. 维护模式
  const maint = getVal('maintenance_mode', { enabled: false, message: '' });
  const [maintEnabled, setMaintEnabled] = useState(Boolean(maint.enabled));
  const [maintMsg, setMaintMsg] = useState(maint.message || '系统正在例行升级，请稍候访问');

  // 4. 探索应用 (Explore Apps) 入口开关 (默认隐藏)
  const exploreAppsCfg = getVal('feature_explore_apps', { enabled: false });
  const [exploreAppsEnabled, setExploreAppsEnabled] = useState(Boolean(exploreAppsCfg.enabled));



  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* 探索应用 (Explore Apps) 侧边栏开关 */}
      <Card className="lg:col-span-2 border-cyan-500/20 bg-black/40">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white">探索应用 (Explore Apps) 侧边栏入口</h2>
            <p className="text-xs text-gray-400">
              控制 Studio 创作者左侧侧边栏底部的「Explore Apps」功能入口。首发上线建议保持隐藏，待正式生态插件发布后开启。
            </p>
          </div>
          <StatusBadge tone={exploreAppsEnabled ? 'good' : 'neutral'}>
            {exploreAppsEnabled ? '前台已显示' : '已隐藏 (推荐)'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting('feature_explore_apps', {
              enabled: exploreAppsEnabled,
            });
          }}
          className="flex flex-wrap items-center justify-between gap-4 pt-1"
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="explore_apps_toggle"
              checked={exploreAppsEnabled}
              onChange={(e) => setExploreAppsEnabled(e.target.checked)}
              className="size-4 rounded border-white/20 bg-black/40 text-cyan-400 focus:ring-cyan-400"
            />
            <label htmlFor="explore_apps_toggle" className="text-xs font-semibold text-white/90 select-none cursor-pointer">
              在前台左侧导航栏显示「Explore Apps (应用探索)」入口
            </label>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-cyan-300">{feedback['feature_explore_apps']}</span>
            <button
              type="submit"
              disabled={savingKey === 'feature_explore_apps'}
              className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 transition-all"
            >
              {savingKey === 'feature_explore_apps' ? '保存中…' : '保存应用入口设置'}
            </button>
          </div>
        </form>
      </Card>
      {/* 前端Logo与导航菜单管理 */}
      <Card className="lg:col-span-2 border-cyan-500/30 bg-gradient-to-r from-cyan-950/20 via-black to-purple-950/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-2 rounded-full bg-cyan-400" />
              <h2 className="text-sm font-bold text-white">品牌设置 (Logo 与网站 Icon)</h2>
              <StatusBadge tone="good">动态全站响应</StatusBadge>
            </div>
            <p className="text-xs text-gray-400">
              统一管理 Studio 前台品牌 Logo、网站浏览器 Icon 图标（官方三色方块系统预设 / 自定义上传）、跳转路径以及顶栏右侧菜单导航。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href="/admin/content/branding#icon-settings"
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-300 transition-all hover:bg-cyan-500/20 active:scale-[0.98]"
            >
              Icon 图标定位 →
            </a>
            <a
              href="/admin/content/branding"
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-black transition-all hover:bg-cyan-300 active:scale-[0.98] shadow-lg shadow-cyan-500/20"
            >
              进入品牌设置工作台 →
            </a>
          </div>
        </div>
      </Card>

      {/* 全站公告横幅 */}
      <Card>
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <h2 className="text-sm font-bold text-white">前台全站横幅公告 (Banner)</h2>
          <StatusBadge tone={bannerEnabled ? 'info' : 'neutral'}>
            {bannerEnabled ? '已开启前台展示' : '已关闭'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting('site_banner', {
              enabled: bannerEnabled,
              message: bannerMsg,
              tone: bannerTone,
              dismissible: true,
            });
          }}
          className="space-y-3.5"
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="banner_toggle"
              checked={bannerEnabled}
              onChange={(e) => setBannerEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="banner_toggle" className="text-xs text-white/80">
              启用前台顶部公告横幅
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1">公告文案内容</label>
            <input
              type="text"
              required
              value={bannerMsg}
              onChange={(e) => setBannerMsg(e.target.value)}
              placeholder="例如：系统已升级支持全新 Flux 与 Hailuo 视频生成模型！"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1">展示色调风格</label>
            <select
              value={bannerTone}
              onChange={(e) => setBannerTone(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
            >
              <option value="info">冰青 (信息通知)</option>
              <option value="good">翠绿 (新功能/福利)</option>
              <option value="warn">琥珀 (注意/提醒)</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-cyan-200">{feedback['site_banner']}</span>
            <button
              type="submit"
              disabled={savingKey === 'site_banner'}
              className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-200 disabled:opacity-50"
            >
              {savingKey === 'site_banner' ? '保存中…' : '保存公告配置'}
            </button>
          </div>
        </form>
      </Card>

      {/* 注册与第三方登录开关 */}
      <Card>
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <h2 className="text-sm font-bold text-white">用户注册与授权访问</h2>
          <StatusBadge tone={allowRegister ? 'good' : 'warn'}>
            {allowRegister ? '开放新用户注册' : '已暂停注册'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting('registration_enabled', {
              enabled: allowRegister,
              allow_oauth: allowOauth,
            });
          }}
          className="space-y-4"
        >
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">允许新用户自主注册</p>
                <p className="text-[11px] text-white/40">关闭后仅已有用户可登录</p>
              </div>
              <input
                type="checkbox"
                checked={allowRegister}
                onChange={(e) => setAllowRegister(e.target.checked)}
                className="h-4 w-4 rounded"
              />
            </div>

            <div className="flex items-start justify-between border-t border-white/[0.05] pt-3 gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">允许第三方社交平台快捷登录 (OAuth)</p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  支持境内外主流社交账号快速鉴权与新用户无感建档
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                    <WeChatIcon size={13} /> 微信
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                    <QQIcon size={13} /> QQ
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white">
                    <DouyinIcon size={13} /> 抖音
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
                    <BilibiliIcon size={13} /> 哔哩哔哩
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-300">
                    <GoogleIcon size={13} /> Google
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white">
                    <XIcon size={13} /> X
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
                    <TikTokIcon size={13} /> TikTok
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                    <InstagramIcon size={13} /> Instagram
                  </span>
                </div>
                <div className="mt-2.5">
                  <Link
                    href="/admin/system/login?category=social"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
                  >
                    前往「登录方式与连通性」管理各渠道凭据与网络探针 →
                  </Link>
                </div>
              </div>
              <input
                type="checkbox"
                checked={allowOauth}
                onChange={(e) => setAllowOauth(e.target.checked)}
                className="mt-1 h-4 w-4 rounded shrink-0 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-cyan-200">{feedback['registration_enabled']}</span>
            <button
              type="submit"
              disabled={savingKey === 'registration_enabled'}
              className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-200 disabled:opacity-50"
            >
              {savingKey === 'registration_enabled' ? '保存中…' : '保存注册策略'}
            </button>
          </div>
        </form>
      </Card>

      {/* 维护模式开关 */}
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-white">系统维护模式 (Maintenance Mode)</h2>
            <p className="text-xs text-white/40 mt-1">开启后前台所有页面将显示维护拦截页，仅管理员可正常访问。</p>
          </div>
          <StatusBadge tone={maintEnabled ? 'danger' : 'good'}>
            {maintEnabled ? '维护拦截中' : '对外正常营业'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting('maintenance_mode', {
              enabled: maintEnabled,
              message: maintMsg,
            });
          }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="maint_toggle"
              checked={maintEnabled}
              onChange={(e) => setMaintEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="maint_toggle" className="text-xs font-semibold text-red-200">
              启用全局维护拦截模式
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1">对外维护提示语</label>
            <input
              type="text"
              value={maintMsg}
              onChange={(e) => setMaintMsg(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-cyan-200">{feedback['maintenance_mode']}</span>
            <button
              type="submit"
              disabled={savingKey === 'maintenance_mode'}
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50"
            >
              {savingKey === 'maintenance_mode' ? '保存中…' : '保存维护设置'}
            </button>
          </div>
        </form>
      </Card>

      {/* 新用户额度与签到规则中枢快捷卡片 */}
      <Card className="lg:col-span-2 border-cyan-500/20 bg-black/40">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base">🎁</span>
              <h2 className="text-sm font-bold text-white">新用户赠送与每日签到额度策略</h2>
            </div>
            <p className="text-xs text-gray-400">
              控制新用户初始获赠积分、三方登录或完善资料引导奖励、每日签到额度及防刷风控，系统内置与平台定价表的实时一致性检验。
            </p>
          </div>
          <StatusBadge tone="good">动态规则中枢就绪</StatusBadge>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 mb-4">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <span className="text-[11px] text-white/50 block">新用户注册初始</span>
            <span className="text-base font-bold text-cyan-300 font-mono mt-1 block">40 算力积分</span>
            <span className="text-[11px] text-white/40 mt-1 block">注册即入账，门槛试用</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <span className="text-[11px] text-white/50 block">完善资料 / 引导奖励</span>
            <span className="text-base font-bold text-emerald-300 font-mono mt-1 block">+50 算力积分</span>
            <span className="text-[11px] text-white/40 mt-1 block">完成昵称或问卷立得</span>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <span className="text-[11px] text-white/50 block">每日主动签到</span>
            <span className="text-base font-bold text-amber-300 font-mono mt-1 block">10 算力积分</span>
            <span className="text-[11px] text-white/40 mt-1 block">当日有效，促进日活</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/10 bg-cyan-500/[0.03] p-3.5">
          <div className="flex items-center gap-2 text-xs text-white/70">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>定价契约验证：新人合计 90 积分 = 1 次旗舰试用，边际获客成本 ¥1.26 ≤ 预算红线 ¥2.50</span>
          </div>
          <Link
            href="/admin/credits?tab=rules"
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-200 transition shadow-lg shadow-cyan-500/10"
          >
            <span>进入新用户与签到规则控制台</span>
            <span>→</span>
          </Link>
        </div>
      </Card>

    </div>
  );
}
