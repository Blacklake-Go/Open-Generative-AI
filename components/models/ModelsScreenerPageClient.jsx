'use client';

import React from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Activity,
  Layers,
  Zap,
  Globe,
  Shield,
  ArrowRight,
  TrendingUp,
  Cpu,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import ModelScreenerTable from './ModelScreenerTable';
import SparklineChart from './SparklineChart';
import ModelBrandLogo from './ModelBrandLogo';
import {
  SCREENER_MODELS,
  getGlobalTelemetryStats,
} from '@/lib/modelCenter/modelScreenerData';

function getHeroModelTelemetry(m, isChinese) {
  if (!m) {
    return { outputLabel: isChinese ? '24h 调用' : '24h Calls', outputValue: '--', latencyDisplay: '--' };
  }
  if (m.category === 'image') {
    return {
      outputLabel: isChinese ? '24h 出图' : '24h Images',
      outputValue: isChinese ? `${(m.totalGenerations / 10000).toFixed(1)}万 张` : `${(m.totalGenerations / 1000000).toFixed(2)}M imgs`,
      latencyDisplay: isChinese ? `渲染: ${(m.latencyMs / 1000).toFixed(1)}s` : `Render: ${(m.latencyMs / 1000).toFixed(1)}s`,
    };
  }
  if (m.category === 'video') {
    return {
      outputLabel: isChinese ? '24h 成片' : '24h Videos',
      outputValue: isChinese ? `${(m.totalGenerations / 10000).toFixed(1)}万 段` : `${(m.totalGenerations / 1000000).toFixed(2)}M vids`,
      latencyDisplay: isChinese ? `成片: ${(m.latencyMs / 1000).toFixed(1)}s` : `Render: ${(m.latencyMs / 1000).toFixed(1)}s`,
    };
  }
  if (m.category === 'audio') {
    return {
      outputLabel: isChinese ? '24h 编曲' : '24h Tracks',
      outputValue: isChinese ? `${(m.totalGenerations / 10000).toFixed(1)}万 首` : `${(m.totalGenerations / 1000).toFixed(0)}k tracks`,
      latencyDisplay: isChinese ? `全曲: ${(m.latencyMs / 1000).toFixed(1)}s` : `Track: ${(m.latencyMs / 1000).toFixed(1)}s`,
    };
  }
  return {
    outputLabel: isChinese ? '24h 推理' : '24h Invocations',
    outputValue: isChinese ? `${(m.calls24h / 10000).toFixed(1)}万 次` : `${(m.calls24h / 1000000).toFixed(2)}M req`,
    latencyDisplay: isChinese ? `首字: ${m.ttftMs || 110}ms` : `TTFT: ${m.ttftMs || 110}ms`,
  };
}

export default function ModelsScreenerPageClient({ locale = 'zh-CN' }) {
  const isChinese = Boolean(locale?.includes('zh'));
  const globalStats = getGlobalTelemetryStats();

  const heroModels = [
    SCREENER_MODELS.find((m) => m.id === 'flux-dev'),
    SCREENER_MODELS.find((m) => m.id === 'kling-v2.6-pro-t2v'),
    SCREENER_MODELS.find((m) => m.id === 'suno-create-music'),
    SCREENER_MODELS.find((m) => m.id === 'deepseek-v3'),
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-[#07080c] text-white selection:bg-[#3772FF]/40 selection:text-white relative overflow-x-hidden font-sans">
      <StudioHeader locale={locale} activeTab="models" className="relative z-40" />

      {/* 空间暗夜背景氛围光源 */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1100px] h-[500px] bg-gradient-to-b from-[#3772FF]/12 via-[#00f5d4]/5 to-transparent blur-[140px] rounded-full" />
        <div className="absolute top-[800px] -left-32 w-[600px] h-[600px] bg-[#e11d74]/5 blur-[140px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 pt-8 pb-24">
        {/* 头部标题与全网遥测总揽 */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs font-mono text-[#00f5d4] mb-3">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isChinese ? '全球大模型实时遥测看板' : 'Global Model Real-time Telemetry'}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              {isChinese ? '模型总揽看板' : 'Model Screener'}
            </h1>
            <p className="text-xs sm:text-sm text-white/60 mt-2 max-w-2xl leading-relaxed">
              {isChinese
                ? '全站聚合全球主流多模态 AI 基座，提供时调用量、日调用量、周、月维度全景对比，实时追踪生图数、长尾时延与费率标准。'
                : 'Real-time telemetry, invocation volumes, generation throughput, and pricing matrix across all foundation models.'}
            </p>
          </div>

          {/* 全网宏观指标卡 */}
          <div className="flex items-center gap-6 font-mono text-xs">
            <div className="bg-[#0f1118] border border-white/[0.08] rounded-xl px-4 py-3">
              <span className="text-white/40 block text-[10px] uppercase">{isChinese ? '24h 全网总调用' : '24h Total Calls'}</span>
              <span className="text-lg font-black text-white font-mono">{globalStats.totalCalls24h}</span>
              <span className="text-[10px] text-emerald-400 block font-semibold">{globalStats.totalCallsDelta}</span>
            </div>
            <div className="bg-[#0f1118] border border-white/[0.08] rounded-xl px-4 py-3">
              <span className="text-white/40 block text-[10px] uppercase">{isChinese ? '累计生成产出' : 'Total Outputs'}</span>
              <span className="text-lg font-black text-white font-mono">{globalStats.totalGenerations}</span>
              <span className="text-[10px] text-emerald-400 block font-semibold">{globalStats.totalGenerationsDelta}</span>
            </div>
          </div>
        </div>

        {/* 4 组旗舰模型实时走势卡 */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left mb-12">
          {heroModels.map((m) => {
            const modelUrl = isChinese ? `/zh/models/${m.id}` : `/models/${m.id}`;
            const telem = getHeroModelTelemetry(m, isChinese);
            return (
              <Link
                key={m.id}
                href={modelUrl}
                className="bg-[#12141a] border border-white/10 hover:border-white/25 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 shadow-elevation-2 flex flex-col justify-between group cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
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

                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                      {m.callsChange24h}
                    </span>
                  </div>

                  <div className="text-2xl font-black text-white font-mono tracking-tight mt-1 whitespace-nowrap">
                    {isChinese ? m.priceRate : m.priceRateEn}
                  </div>
                  <div className="text-xs text-white/50 mt-1.5 font-mono flex items-center justify-between">
                    <span>{telem.outputLabel}: <strong className="text-white/80 font-semibold">{telem.outputValue}</strong></span>
                    <span className="text-emerald-400 font-medium">{telem.latencyDisplay}</span>
                  </div>
                </div>

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

        {/* 核心 TradingView 风格模型遥测总揽表格 */}
        <div className="mb-16">
          <ModelScreenerTable locale={locale} />
        </div>
      </main>
    </div>
  );
}
