'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  FileText,
  Zap,
  ShieldCheck,
  RotateCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';
import SeoMetadataCard from '../seo/SeoMetadataCard';
import SearchVerificationCard from '../seo/SearchVerificationCard';
import SitemapRobotsCard from '../seo/SitemapRobotsCard';
import SearchPushConsoleCard from '../seo/SearchPushConsoleCard';

export default function SeoTab() {
  const [seoConfig, setSeoConfig] = useState(null);
  const [pushConfig, setPushConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSeo, setIsSavingSeo] = useState(false);
  const [isSavingPushConfig, setIsSavingPushConfig] = useState(false);
  const [notice, setNotice] = useState(null);

  // Fetch SEO & Push configs on mount
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [seoRes, pushRes] = await Promise.all([
        fetch('/api/admin/seo/config'),
        fetch('/api/admin/seo/push/config'),
      ]);

      const [seoJson, pushJson] = await Promise.all([
        seoRes.json(),
        pushRes.json(),
      ]);

      if (seoJson.data) setSeoConfig(seoJson.data);
      if (pushJson.data) setPushConfig(pushJson.data);
    } catch (err) {
      console.warn('[SeoTab] Failed to fetch SEO configs:', err);
      // Safe fallback state for offline / preview
      setSeoConfig({
        title: 'SupDance — Free AI Image & Video Studio',
        titleTemplate: '%s | SupDance AI Studio',
        description: 'Generate AI images and videos using 200+ models — Flux, Midjourney, Kling, Veo, Seedance and more.',
        keywords: ['AI Image Generator', 'AI Video', 'Flux AI', 'Midjourney Online', 'Kling AI', 'Text to Video', 'KOYO Studio'],
        canonicalBase: 'https://www.supdance.com',
        openGraph: {
          title: 'SupDance — Free AI Image & Video Studio',
          description: 'Generate AI images and videos using 200+ models...',
          image: 'https://www.supdance.com/og-image.png',
          type: 'website',
        },
        twitter: {
          card: 'summary_large_image',
          site: '@SupDanceAI',
          creator: '@SupDanceAI',
        },
        verification: { google: '', baidu: '', bing: '', yandex: '' },
      });
      setPushConfig({
        indexNow: { enabled: true, host: 'www.supdance.com', key: '3f82a45c81924619b068ad1d5d893f44' },
        baiduPush: { enabled: false, site: 'https://www.supdance.com', token: '' },
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save partial or complete SEO config
  const handleSaveSeo = async (partialConfig) => {
    setIsSavingSeo(true);
    try {
      const merged = {
        ...(seoConfig || {}),
        ...partialConfig,
        verification: {
          ...(seoConfig?.verification || {}),
          ...(partialConfig.verification || {}),
        },
        openGraph: {
          ...(seoConfig?.openGraph || {}),
          ...(partialConfig.openGraph || {}),
        },
        twitter: {
          ...(seoConfig?.twitter || {}),
          ...(partialConfig.twitter || {}),
        },
      };

      const res = await fetch('/api/admin/seo/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });

      const json = await res.json();
      if (res.ok && json.data) {
        setSeoConfig(json.data);
        setNotice({ tone: 'good', text: 'SEO 配置已成功更新并生效！' });
        setTimeout(() => setNotice(null), 3000);
      } else {
        setNotice({ tone: 'danger', text: json.error?.message || '保存 SEO 配置失败' });
      }
    } catch (err) {
      setNotice({ tone: 'danger', text: `请求错误: ${err.message}` });
    } finally {
      setIsSavingSeo(false);
    }
  };

  // Save Search Push Config
  const handleSavePushConfig = async (nextPushConfig) => {
    setIsSavingPushConfig(true);
    try {
      const res = await fetch('/api/admin/seo/push/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPushConfig),
      });

      const json = await res.json();
      if (res.ok && json.data) {
        setPushConfig(json.data);
        setNotice({ tone: 'good', text: '搜索引擎主动推送凭据已更新！' });
        setTimeout(() => setNotice(null), 3000);
      } else {
        setNotice({ tone: 'danger', text: json.error?.message || '保存推送凭据失败' });
      }
    } catch (err) {
      setNotice({ tone: 'danger', text: `请求错误: ${err.message}` });
    } finally {
      setIsSavingPushConfig(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-white/[0.03]" />
      </div>
    );
  }

  const verifiedCount = Object.values(seoConfig?.verification || {}).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      {notice && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${
            notice.tone === 'good'
              ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
              : 'border-red-500/30 bg-red-950/20 text-red-300'
          }`}
        >
          {notice.tone === 'good' ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* 核心 SEO 与推送概览 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
              动态站点地图
            </span>
            <FileText className="size-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">/sitemap.xml</p>
          <p className="mt-1 text-xs text-gray-400">全站公开路由自动索引聚合</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
              网络爬虫协议
            </span>
            <Globe className="size-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">/robots.txt</p>
          <p className="mt-1 text-xs text-gray-400">规范爬虫抓取边界与 Sitemap 声明</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
              搜索引擎主动推送
            </span>
            <Zap className="size-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-400">IndexNow + 百度</p>
          <p className="mt-1 text-xs text-gray-400">毫秒级通知搜索引擎蜘蛛收录</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">
              站长平台验证状态
            </span>
            <ShieldCheck className="size-4 text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">
            {verifiedCount > 0 ? `${verifiedCount} / 4 平台已激活` : '4 大平台待配置'}
          </p>
          <p className="mt-1 text-xs text-gray-400">Google / 百度 / 必应 / Yandex</p>
        </Card>
      </div>

      {/* SEO 功能模块分区 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 模块 1：全局 TDK 与社交分享元数据 */}
        <SeoMetadataCard
          config={seoConfig}
          onSave={handleSaveSeo}
          isSaving={isSavingSeo}
        />

        {/* 模块 2：站长平台验证代码管理 */}
        <SearchVerificationCard
          config={seoConfig}
          onSave={handleSaveSeo}
          isSaving={isSavingSeo}
        />

        {/* 模块 3：动态站点地图与爬虫规则 */}
        <SitemapRobotsCard
          config={seoConfig}
          onSave={handleSaveSeo}
          isSaving={isSavingSeo}
        />

        {/* 模块 4：搜索引擎实时主动推送控制台 */}
        <SearchPushConsoleCard
          pushConfig={pushConfig}
          onSavePushConfig={handleSavePushConfig}
          isSavingConfig={isSavingPushConfig}
        />
      </div>
    </div>
  );
}
