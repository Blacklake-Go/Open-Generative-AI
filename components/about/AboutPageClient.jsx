'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Shield,
  Zap,
  Globe,
  Cpu,
  Layers,
  Search,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ChevronRight,
  BookOpen,
  Film,
  Image as ImageIcon,
  Music,
  Boxes,
  ExternalLink,
  Activity,
  BarChart3,
  Server,
  Clock,
  Compass,
  SlidersHorizontal,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import { SpatialBackground } from '@/components/spatial';
import FigmaBrandSlider from './FigmaBrandSlider';
import ModelScreenerTable from '@/components/models/ModelScreenerTable';
import ModelBrandLogo from '@/components/models/ModelBrandLogo';
import SparklineChart from '@/components/models/SparklineChart';
import AboutFooter from './AboutFooter';
import { cn } from '@/lib/utils';
import {
  SCREENER_MODELS,
  getGlobalTelemetryStats,
} from '@/lib/modelCenter/modelScreenerData';

// 针对不同模态定制专业、自然、高可读性的遥测指标展示
function getHeroModelTelemetry(m, isChinese) {
  if (!m) {
    return {
      outputLabel: isChinese ? '24h 调用' : '24h Calls',
      outputValue: '--',
      latencyDisplay: '--',
    };
  }

  if (m.category === 'image') {
    return {
      outputLabel: isChinese ? '24h 出图' : '24h Images',
      outputValue: isChinese
        ? `${(m.totalGenerations / 10000).toFixed(1)}万 张`
        : `${(m.totalGenerations / 1000000).toFixed(2)}M imgs`,
      latencyDisplay: isChinese
        ? `渲染: ${(m.latencyMs / 1000).toFixed(1)}s`
        : `Render: ${(m.latencyMs / 1000).toFixed(1)}s`,
    };
  }

  if (m.category === 'video') {
    return {
      outputLabel: isChinese ? '24h 成片' : '24h Videos',
      outputValue: isChinese
        ? `${(m.totalGenerations / 10000).toFixed(1)}万 段`
        : `${(m.totalGenerations / 1000000).toFixed(2)}M vids`,
      latencyDisplay: isChinese
        ? `成片: ${(m.latencyMs / 1000).toFixed(1)}s`
        : `Render: ${(m.latencyMs / 1000).toFixed(1)}s`,
    };
  }

  if (m.category === 'audio') {
    return {
      outputLabel: isChinese ? '24h 编曲' : '24h Tracks',
      outputValue: isChinese
        ? `${(m.totalGenerations / 10000).toFixed(1)}万 首`
        : `${(m.totalGenerations / 1000).toFixed(0)}k tracks`,
      latencyDisplay: isChinese
        ? `全曲: ${(m.latencyMs / 1000).toFixed(1)}s`
        : `Track: ${(m.latencyMs / 1000).toFixed(1)}s`,
    };
  }

  // LLM / 多模态推理
  return {
    outputLabel: isChinese ? '24h 推理' : '24h Invocations',
    outputValue: isChinese
      ? `${(m.calls24h / 10000).toFixed(1)}万 次`
      : `${(m.calls24h / 1000000).toFixed(2)}M req`,
    latencyDisplay: isChinese
      ? `首字: ${m.ttftMs || 110}ms`
      : `TTFT: ${m.ttftMs || 110}ms`,
  };
}

// 使用流程 4 步 (极简有力)
const HOW_IT_WORKS_STEPS = [
  {
    step: 'Step 1',
    title: 'Model Discovery',
    titleZh: '全景选型',
    desc: 'Compare throughput, latency, and costs across leading foundation models.',
    descZh: '综合比对时延、生图数与费率，秒级锁定最佳基座。',
    icon: Search,
  },
  {
    step: 'Step 2',
    title: 'Studio Tuning',
    titleZh: '创意微调',
    desc: 'Adjust prompts, ratios, motion paths, and multimodal references.',
    descZh: '在 Studio 控制台精细调校提示词、长宽比与运镜轨迹。',
    icon: SlidersHorizontal,
  },
  {
    step: 'Step 3',
    title: 'Instant Inference',
    titleZh: '极速推理',
    desc: 'Global edge routing with sub-second queueing and cinematic output.',
    descZh: '全球专线并发撮合，秒级完成电影级高画质渲染。',
    icon: Zap,
  },
  {
    step: 'Step 4',
    title: 'Pipeline Export',
    titleZh: '资产交付',
    desc: 'Export high-res media directly to workflow nodes or Open APIs.',
    descZh: '高保真媒体一键沉淀，无缝串接生产管道与 API。',
    icon: Boxes,
  },
];

// 前沿模型深度研报指南
const LEARN_CARDS = [
  {
    id: 'learn-1',
    badge: 'MODEL ARCHITECTURE',
    title: 'FLUX.1 [dev] rectified flow transformer & 4K commercial typography',
    titleZh: '深入解析 FLUX.1 [dev] 架构与 4K 超清商业排印实操',
    author: 'KOYO Research Lab',
    date: '2026-10-08',
    imageBg: 'from-[#3772FF]/30 to-[#00f5d4]/20',
  },
  {
    id: 'learn-2',
    badge: 'CINEMATIC VIDEO',
    title: 'Kling 2.6 Pro cinematic camera trajectories & physical consistency',
    titleZh: '快手可灵 Kling 2.6 Pro 电影级镜头运动与真实物理控制',
    author: 'AI Film Collective',
    date: '2026-10-06',
    imageBg: 'from-[#e11d74]/30 to-[#3772FF]/20',
  },
  {
    id: 'learn-3',
    badge: 'EDGE TELEMETRY',
    title: 'Achieving sub-second failover across 28 global edge nodes',
    titleZh: '揭秘全球 28 个边缘节点毫秒级故障自动漂移架构',
    author: 'Infrastructure Team',
    date: '2026-10-04',
    imageBg: 'from-[#00f5d4]/30 to-[#10b981]/20',
  },
];

export default function AboutPageClient({ locale = 'en' }) {
  const isChinese = Boolean(locale?.includes('zh'));
  const [emailInput, setEmailInput] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  // 取 4 个旗舰模型做 Hero 实时卡片
  const heroModels = [
    SCREENER_MODELS.find((m) => m.id === 'flux-dev'),
    SCREENER_MODELS.find((m) => m.id === 'kling-v2.6-pro-t2v'),
    SCREENER_MODELS.find((m) => m.id === 'suno-create-music'),
    SCREENER_MODELS.find((m) => m.id === 'deepseek-v3'),
  ].filter(Boolean);

  const globalStats = getGlobalTelemetryStats();

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (emailInput.trim()) {
      setSubscribed(true);
    }
  };

  const studioHref = isChinese ? '/zh/studio' : '/studio';

  return (
    <div className="min-h-screen bg-[#07080c] text-white selection:bg-[#3772FF]/40 selection:text-white relative overflow-x-hidden font-sans">
      {/* ========================================================= */}
      {/* MODULE 01: 全站统一固定顶栏导航                            */}
      {/* ========================================================= */}
      <StudioHeader locale={locale} activeTab="about" className="relative z-40" />

      {/* 核心 AI 空间光影与极光物理仿真系统 (与主页一致的 7 层全域流体光场 + 点阵 Canvas，指针安全) */}
      <SpatialBackground />

      <main className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 pt-4 pb-20">
        {/* ========================================================= */}
        {/* 头部专属：顶级模型品牌滑块 (FigmaBrandSlider)                */}
        {/* ========================================================= */}
        <section className="pt-2 pb-6">
          <FigmaBrandSlider locale={locale} />
        </section>

        {/* ========================================================= */}
        {/* MODULE 02: HERO STAGE (全球前沿多模态大模型实时算力中心)    */}
        {/* ========================================================= */}
        <section className="pt-8 pb-16 sm:pt-12 sm:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* 左侧文本与行动 */}
            <div className="lg:col-span-7 flex flex-col items-start text-left">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.2] mb-5">
                {isChinese ? (
                  <>
                    <span className="block text-white">
                      全球前沿多模态视觉大模型
                    </span>
                    <span className="block mt-2 text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-[#00f5d4] via-white to-white/80 bg-clip-text text-transparent leading-[1.3]">
                      应用场景算力场景与全景数据算力调度与全景遥测
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block text-white">
                      Frontier Multimodal Visual Models
                    </span>
                    <span className="block mt-2 text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-[#00f5d4] via-white to-white/80 bg-clip-text text-transparent leading-[1.3]">
                      Enterprise Compute Scenarios &amp; Panoramic Telemetry
                    </span>
                  </>
                )}
              </h1>

              {/* 极简副标 (无废话，直奔主题) */}
              <p className="text-sm sm:text-base text-white/75 max-w-lg leading-relaxed mb-8">
                {isChinese
                  ? '聚合 FLUX、可灵、Suno、DeepSeek 官方通道。毫秒级自愈漂移、确定性渲染保障与高精度实时全景看板。'
                  : 'Aggregating FLUX, Kling, Suno, and DeepSeek official channels with sub-second failover and high-precision telemetry.'}
              </p>

              {/* 胶囊按钮群 */}
              <div className="flex flex-wrap items-center gap-4">
                <a
                  href="#models"
                  className="px-8 py-3.5 rounded-full bg-[#3772FF] hover:bg-[#2e62de] text-white text-sm font-semibold tracking-wide transition-all duration-300 shadow-[0_4px_20px_rgba(55,114,255,0.4)] hover:shadow-[0_8px_30px_rgba(55,114,255,0.6)] hover:-translate-y-0.5 flex items-center gap-2 group cursor-pointer"
                >
                  <span>{isChinese ? '探索模型看板' : 'Explore Screener'}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </a>

                <Link
                  href={studioHref}
                  className="px-6 py-3.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-sm font-semibold tracking-wide transition-all duration-300 border border-white/10 hover:border-white/20 hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer shadow-elevation-1"
                >
                  <Zap className="w-4 h-4 text-[#00f5d4]" />
                  <span>{isChinese ? '进入 Studio 工作台' : 'Open Studio'}</span>
                </Link>
              </div>
            </div>

            {/* 右侧：3D 暗黑立体几何展台与动态漂浮官方品牌胶囊 */}
            <div className="lg:col-span-5 relative flex items-center justify-center min-h-[360px] sm:min-h-[420px]">
              <div className="relative w-full max-w-[420px] aspect-square flex items-center justify-center">
                {/* 环状发光底盘 */}
                <div className="absolute inset-4 rounded-full border border-white/10 bg-gradient-to-b from-white/5 to-transparent [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_70%)] animate-pulse" />
                <div className="absolute w-72 h-72 rounded-full bg-[#3772FF]/15 blur-3xl animate-glow-pulse" />
                <div className="absolute -bottom-4 w-60 h-20 bg-[#00f5d4]/10 blur-2xl rounded-full" />

                {/* 核心 3D 浮雕柱展台 */}
                <div className="relative z-10 w-56 h-56 rounded-3xl bg-gradient-to-tr from-[#12141a] via-[#1a1d26] to-[#252936] border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.2)] flex flex-col items-center justify-center p-6 text-center transform -rotate-2 hover:rotate-0 transition-transform duration-500 group">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#3772FF] to-[#00f5d4] p-[1.5px] mb-4 shadow-[0_0_30px_rgba(55,114,255,0.5)] group-hover:scale-105 transition-transform">
                    <div className="w-full h-full rounded-[14px] bg-[#0c0d12] flex items-center justify-center">
                      <Cpu className="w-8 h-8 text-[#00f5d4]" />
                    </div>
                  </div>
                  <div className="text-xl font-black text-white tracking-tight">KOYO MODEL HUB</div>
                  <div className="text-[11px] font-mono text-emerald-400 mt-1 flex items-center gap-1.5 justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isChinese ? '45+ 旗舰模型 · 实时全域遥测' : '45+ Foundation Models · Live Sync'}</span>
                  </div>
                </div>

                {/* 漂浮品牌胶囊 1: FLUX.1 [dev] (带官方 BFL 标识与平滑悬浮动效) */}
                <Link
                  href={isChinese ? '/zh/models/flux-dev' : '/models/flux-dev'}
                  className="absolute -top-2 left-2 z-20 px-3.5 py-1.5 rounded-full bg-[#161920]/95 backdrop-blur-md border border-white/15 shadow-2xl flex items-center gap-2.5 animate-subtle-float hover:scale-105 transition-transform cursor-pointer"
                >
                  <ModelBrandLogo providerId="bfl" size="sm" showRing={false} />
                  <span className="text-xs font-bold text-white">FLUX.1 [dev]</span>
                  <span className="text-xs font-mono text-emerald-400 font-semibold">
                    {heroModels.find((m) => m.id === 'flux-dev')?.callsChange24h || '+18.4%'}
                  </span>
                </Link>

                {/* 漂浮品牌胶囊 2: Kling 2.6 Pro (带快手官方标识) */}
                <Link
                  href={isChinese ? '/zh/models/kling-v2.6-pro-t2v' : '/models/kling-v2.6-pro-t2v'}
                  className="absolute bottom-4 -right-2 z-20 px-3.5 py-1.5 rounded-full bg-[#161920]/95 backdrop-blur-md border border-white/15 shadow-2xl flex items-center gap-2.5 animate-subtle-float-reverse hover:scale-105 transition-transform cursor-pointer"
                >
                  <ModelBrandLogo providerId="kuaishou" size="sm" showRing={false} />
                  <span className="text-xs font-bold text-white">Kling 2.6 Pro</span>
                  <span className="text-xs font-mono text-emerald-400 font-semibold">
                    {heroModels.find((m) => m.id === 'kling-v2.6-pro-t2v')?.callsChange24h || '+24.1%'}
                  </span>
                </Link>

                {/* 漂浮品牌胶囊 3: Suno V3.5 (带 Suno 官方标识) */}
                <Link
                  href={isChinese ? '/zh/models/suno-create-music' : '/models/suno-create-music'}
                  className="absolute top-24 -right-4 z-20 px-3 py-1.5 rounded-full bg-[#161920]/95 backdrop-blur-md border border-white/15 shadow-2xl flex items-center gap-2.5 animate-subtle-float hover:scale-105 transition-transform cursor-pointer"
                >
                  <ModelBrandLogo providerId="suno" size="sm" showRing={false} />
                  <span className="text-xs font-bold text-white">Suno V3.5</span>
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                    {heroModels.find((m) => m.id === 'suno-create-music')?.callsChange24h || '+14.6%'}
                  </span>
                </Link>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* MODULE 03: 4 组旗舰模型实时行情卡片 (集成官方品牌标识与高质感动效) */}
          {/* ========================================================= */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left mt-12">
            {heroModels.map((m) => {
              const modelUrl = isChinese ? `/zh/models/${m.id}` : `/models/${m.id}`;
              const telem = getHeroModelTelemetry(m, isChinese);
              return (
                <Link
                  key={m.id}
                  href={modelUrl}
                  className="bg-[#12141a] border border-white/10 hover:border-white/30 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_12px_35px_rgba(55,114,255,0.18)] shadow-elevation-2 flex flex-col justify-between group cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        {/* 官方高清矢量品牌微标 */}
                        <ModelBrandLogo
                          providerId={m.providerId}
                          provider={m.provider}
                          modelId={m.id}
                          size="md"
                        />
                        <div>
                          <div className="text-sm font-bold text-white group-hover:text-[#00f5d4] transition-colors leading-tight">
                            {m.name}
                          </div>
                          <div className="text-[11px] font-mono text-white/40">
                            {m.symbol}
                          </div>
                        </div>
                      </div>

                      {/* 涨跌幅胶囊 */}
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                        {m.callsChange24h}
                      </span>
                    </div>

                    <div className="text-2xl font-black text-white font-mono tracking-tight mt-1">
                      {isChinese ? m.priceRate : m.priceRateEn}
                    </div>
                    <div className="text-xs text-white/50 mt-1.5 font-mono flex items-center justify-between">
                      <span>{telem.outputLabel}: <strong className="text-white/80 font-semibold">{telem.outputValue}</strong></span>
                      <span className="text-emerald-400 font-medium">{telem.latencyDisplay}</span>
                    </div>
                  </div>

                  {/* 丝滑贝塞尔走势折线图 */}
                  <div className="pt-4 flex items-center justify-end">
                    <SparklineChart
                      data={m.sparkline}
                      width={120}
                      height={32}
                      isPositive={m.isPositive}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ========================================================= */}
        {/* MODULE 05: 模型总揽看板 (MODEL SCREENER SECTION)           */}
        {/* ========================================================= */}
        <section id="models" className="py-20 border-t border-white/[0.06] relative scroll-mt-20">
          <span id="market-update" className="sr-only" />

          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs font-mono text-[#00f5d4] mb-2.5">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{isChinese ? '全链路多模态实时驱动' : 'Real-time Telemetry Engine'}</span>
              </div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">
                {isChinese ? '模型总揽看板 (Model Screener)' : 'Foundation Model Screener'}
              </h2>
              <p className="text-xs sm:text-sm text-white/60 mt-1">
                {isChinese
                  ? '多时间维度指标横向对比，实时追踪调用量、生图数与平均响应时延。'
                  : 'Inspect live volume, generation outputs, and response latency across all foundation models.'}
              </p>
            </div>

            <Link
              href={studioHref}
              className="text-xs sm:text-sm text-[#3772FF] hover:text-white transition-colors flex items-center gap-1 group font-semibold cursor-pointer"
            >
              <span>{isChinese ? '在 Studio 工作台中全部体验' : 'Launch All in Studio'}</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* 核心 TradingView 风格高保真模型遥测表格 */}
          <ModelScreenerTable locale={locale} />
        </section>

        {/* ========================================================= */}
        {/* MODULE 06: PLATFORM METRICS & TRUST (公信力与统计数据)      */}
        {/* ========================================================= */}
        <section id="trust" className="py-20 border-t border-white/[0.06]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* 左侧：3 环同心圆数据罗盘 (动态旋转与发光) */}
            <div className="lg:col-span-6 bg-[#12141a] border border-white/10 rounded-2xl p-8 relative overflow-hidden flex flex-col items-center justify-center min-h-[420px] shadow-elevation-2">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,245,212,0.05),transparent_70%)]" />

              <div className="relative w-72 h-72 flex items-center justify-center">
                {/* 外环 (青绿旋转) */}
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#00f5d4]/40 animate-[spin_50s_linear_infinite]" />
                {/* 中环 (宝蓝逆转) */}
                <div className="absolute inset-6 rounded-full border-2 border-dashed border-[#3772FF]/40 animate-[spin_35s_linear_infinite_reverse]" />
                {/* 内环 (洋红稳态) */}
                <div className="absolute inset-12 rounded-full border-2 border-[#e11d74]/50" />

                {/* 中心核心 */}
                <div className="w-24 h-24 rounded-full bg-[#181a22] border border-white/20 shadow-2xl flex flex-col items-center justify-center p-2 z-10 text-center animate-subtle-float">
                  <Shield className="w-6 h-6 text-[#00f5d4] mb-0.5" />
                  <span className="text-[10px] font-black text-white uppercase tracking-wider font-mono">TRUST</span>
                </div>

                {/* 外环浮雕数据标签 */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#161820] border border-[#00f5d4]/40 text-[11px] font-bold text-[#00f5d4] shadow-lg whitespace-nowrap font-mono">
                  28+ {isChinese ? '全球边缘专线节点' : 'Global Edge Nodes'}
                </div>

                {/* 中环浮雕数据标签 */}
                <div className="absolute bottom-4 -left-4 px-3 py-1 rounded-full bg-[#161820] border border-[#3772FF]/40 text-[11px] font-bold text-[#3772FF] shadow-lg whitespace-nowrap font-mono">
                  {isChinese ? '3,820万+ 24h实时调用' : '38.2M+ 24h Invocations'}
                </div>

                {/* 内环浮雕数据标签 */}
                <div className="absolute bottom-4 -right-4 px-3 py-1 rounded-full bg-[#161820] border border-[#e11d74]/40 text-[11px] font-bold text-[#e11d74] shadow-lg whitespace-nowrap font-mono">
                  45+ {isChinese ? '前沿旗舰模型' : 'Foundation Models'}
                </div>
              </div>
            </div>

            {/* 右侧：三大生产力信条 (极简有力) */}
            <div className="lg:col-span-6 flex flex-col justify-center">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight mb-3">
                {isChinese ? (
                  <>
                    全球顶尖创作者的
                    <br />
                    高确定性算力基座
                  </>
                ) : (
                  <>
                    The Trusted Compute Foundation
                    <br />
                    for Creators Worldwide.
                  </>
                )}
              </h2>

              <p className="text-sm text-white/70 leading-relaxed mb-8 max-w-lg">
                {isChinese
                  ? '确定性与低延迟是生成式 AI 工业化生产的核心基石。'
                  : 'Determinism and low latency are the bedrock of generative AI industrialization.'}
              </p>

              <div className="space-y-5">
                {/* 1. Clarity */}
                <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#3772FF]/20 border border-[#3772FF]/40 text-[#3772FF] flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                    1
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">
                      {isChinese ? '清晰透明 (Clarity)' : 'Clarity'}
                    </h4>
                    <p className="text-xs sm:text-sm text-white/60 leading-relaxed mt-0.5">
                      {isChinese
                        ? '全链路算力消耗与费率透明可视，零隐形成本。'
                        : 'Transparent compute pricing with zero hidden fees and clear records.'}
                    </p>
                  </div>
                </div>

                {/* 2. Confidence */}
                <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#00f5d4]/20 border border-[#00f5d4]/40 text-[#00f5d4] flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                    2
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">
                      {isChinese ? '极速可用 (Speed & SLA)' : 'Speed & SLA'}
                    </h4>
                    <p className="text-xs sm:text-sm text-white/60 leading-relaxed mt-0.5">
                      {isChinese
                        ? '全球 28+ 边缘专线节点与 99.99% 系统高可用保障。'
                        : '28+ global edge nodes with 99.99% availability.'}
                    </p>
                  </div>
                </div>

                {/* 3. Community */}
                <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <div className="w-8 h-8 rounded-full bg-[#e11d74]/20 border border-[#e11d74]/40 text-[#e11d74] flex items-center justify-center shrink-0 font-bold text-xs mt-0.5">
                    3
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">
                      {isChinese ? '共荣生态 (Ecosystem)' : 'Ecosystem'}
                    </h4>
                    <p className="text-xs sm:text-sm text-white/60 leading-relaxed mt-0.5">
                      {isChinese
                        ? '联通 Studio 创意工坊、节点画布与高频 Open API。'
                        : 'Unifying Studio canvases, visual workflows, and open APIs.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* MODULE 07: HOW IT WORK (使用流程与新手引导)                */}
        {/* ========================================================= */}
        <section id="workflow" className="py-20 border-t border-white/[0.06] text-center relative scroll-mt-20">
          <span id="how-it-work" className="sr-only" />
          <div className="max-w-xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
              {isChinese ? '使用流程' : 'How It Works'}
            </h2>
            <p className="text-xs sm:text-sm text-white/70">
              {isChinese
                ? '简单四步开启前沿 AI 模型选型、创作与规模化集成。'
                : 'Simple 4 steps to discover, tune, infer, and export.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            {HOW_IT_WORKS_STEPS.map((step, idx) => {
              const IconComp = step.icon;
              return (
                <div
                  key={step.step}
                  className="group bg-[#12141a] border border-white/10 hover:border-white/30 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1.5 shadow-elevation-2 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-xs font-mono font-bold text-[#3772FF]">
                        {step.step}
                      </span>
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/80 group-hover:scale-110 group-hover:border-[#00f5d4]/40 transition-all duration-300">
                        <IconComp className="w-5 h-5 text-[#00f5d4]" />
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white mb-1.5 group-hover:text-[#00f5d4] transition-colors">
                      {isChinese ? step.titleZh : step.title}
                    </h3>
                    <p className="text-xs text-white/60 leading-relaxed">
                      {isChinese ? step.descZh : step.desc}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-white/[0.04] text-[11px] text-white/30 font-mono">
                    PHASE 0{idx + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ========================================================= */}
        {/* MODULE 08: LEARN & RESEARCH (前沿模型研报与指南)            */}
        {/* ========================================================= */}
        <section id="learn-and-earn" className="py-20 border-t border-white/[0.06]">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">
                {isChinese ? '模型研报与实战指南' : 'Research & Model Guides'}
              </h2>
              <p className="text-xs sm:text-sm text-white/70 mt-1">
                {isChinese
                  ? '掌握全球主流大模型提示词技巧与工业级工程实践。'
                  : 'Master prompt engineering and production workflows for foundation models.'}
              </p>
            </div>
            <Link
              href={isChinese ? '/zh/community' : '/community'}
              className="text-xs sm:text-sm text-[#3772FF] hover:text-white transition-colors flex items-center gap-1 group font-semibold cursor-pointer"
            >
              <span>{isChinese ? '查看全部技术文章' : 'See all articles'}</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {LEARN_CARDS.map((art) => (
              <div
                key={art.id}
                className="group bg-[#12141a] border border-white/10 hover:border-white/30 rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1.5 shadow-elevation-2 flex flex-col cursor-pointer"
              >
                <div className={cn('relative h-44 overflow-hidden bg-gradient-to-br', art.imageBg)}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08),transparent_70%)] group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#3772FF] text-white font-mono shadow-sm">
                      {art.badge}
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between">
                  <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-[#00f5d4] transition-colors leading-snug mb-4">
                    {isChinese ? art.titleZh : art.title}
                  </h3>

                  <div className="flex items-center justify-between text-xs text-white/40 pt-4 border-t border-white/[0.04] font-mono">
                    <span>{art.author}</span>
                    <span>{art.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* ========================================================= */}
      {/* MODULE 09: 高端品牌与核心模型全矩阵页脚 (AboutFooter)       */}
      {/* ========================================================= */}
      <AboutFooter locale={locale} />
    </div>
  );
}
