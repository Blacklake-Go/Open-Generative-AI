'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowLeft,
  Zap,
  Activity,
  Layers,
  Cpu,
  Shield,
  Copy,
  Check,
  ExternalLink,
  Clock,
  TrendingUp,
  TrendingDown,
  Globe,
  Sliders,
  DollarSign,
  Info,
  Server,
  Share2,
  ChevronRight,
  Boxes,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import TradingViewModelChart from './TradingViewModelChart';
import ModelBrandLogo from './ModelBrandLogo';
import { inferStudioTabFromModel } from '@/lib/studio-routes';
import SparklineChart from './SparklineChart';
import {
  getModelById,
  getAllScreenerModels,
} from '@/lib/modelCenter/modelScreenerData';

export default function ModelDetailPageClient({ modelId, locale = 'zh-CN' }) {
  const isChinese = Boolean(locale?.includes('zh'));
  const model = getModelById(modelId);

  const [copied, setCopied] = useState(false);

  if (!model) {
    return (
      <div className="min-h-screen bg-[#08090d] text-white flex flex-col items-center justify-center">
        <StudioHeader locale={locale} activeTab="models" />
        <div className="text-center p-8 max-w-md">
          <h1 className="text-2xl font-bold mb-2">
            {isChinese ? '未找到该模型档案' : 'Model Not Found'}
          </h1>
          <p className="text-sm text-white/50 mb-6">
            {isChinese ? `模型标识 "${modelId}" 不存在或已下线。` : `Model "${modelId}" is not available.`}
          </p>
          <Link
            href={isChinese ? '/zh/about#models' : '/about#models'}
            className="px-6 py-2.5 rounded-full bg-[#3772FF] text-white text-xs font-semibold"
          >
            {isChinese ? '返回模型总揽看板' : 'Back to Screener'}
          </Link>
        </div>
      </div>
    );
  }

  const handleCopyId = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(model.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const screenerUrl = isChinese ? '/zh/about#models' : '/about#models';
  const targetTab = model.category === 'video' ? 'video'
    : model.category === 'audio' ? 'audio'
    : model.category === 'llm' || model.category === 'multimodal' ? 'agents'
    : inferStudioTabFromModel(model.id);
  const studioUrl = isChinese
    ? `/zh/studio?tab=${targetTab}&model=${encodeURIComponent(model.id)}`
    : `/studio?tab=${targetTab}&model=${encodeURIComponent(model.id)}`;
  const apiDocsUrl = isChinese ? '/zh/call-api' : '/call-api';

  // 同品类其他推荐模型
  const allModels = getAllScreenerModels();
  const relatedModels = allModels
    .filter((m) => m.category === model.category && m.id !== model.id)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-[#07080c] text-white selection:bg-[#3772FF]/40 selection:text-white relative overflow-x-hidden font-sans">
      {/* 顶部全站导航 */}
      <StudioHeader locale={locale} activeTab="models" className="relative z-40" />

      {/* 空间暗夜背景氛围光源 */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1100px] h-[500px] bg-gradient-to-b from-[#3772FF]/12 via-[#00f5d4]/5 to-transparent blur-[140px] rounded-full" />
        <div className="absolute top-[800px] -right-32 w-[600px] h-[600px] bg-[#e11d74]/5 blur-[140px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 pt-6 pb-24">
        {/* 面包屑与快捷返回导航 */}
        <div className="flex items-center gap-2 text-xs text-white/50 mb-6 font-mono">
          <Link
            href={screenerUrl}
            className="hover:text-white transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{isChinese ? '模型总揽看板' : 'Model Screener'}</span>
          </Link>
          <ChevronRight className="w-3 h-3 text-white/20" />
          <span className="text-white/40">{model.provider}</span>
          <ChevronRight className="w-3 h-3 text-white/20" />
          <span className="text-white font-medium">{model.name}</span>
        </div>

        {/* ========================================================= */}
        {/* SYMBOL HEADER (TradingView 风格行情抬头与实时指标)           */}
        {/* ========================================================= */}
        <div className="bg-[#0e1017] border border-white/[0.08] rounded-2xl p-6 sm:p-8 mb-8 shadow-elevation-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* 左侧：模型品牌官方高保真标识、全称、Symbol 标签与健康状态 */}
            <div className="flex items-start sm:items-center gap-4">
              <ModelBrandLogo
                providerId={model.providerId}
                provider={model.provider}
                modelId={model.id}
                size="xl"
                className="!w-14 !h-14 sm:!w-16 sm:!h-16 !rounded-2xl border-white/15 shadow-xl bg-gradient-to-tr from-[#1b1e2a] to-[#252a3a] shrink-0"
              />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
                    {model.name}
                  </h1>
                  {/* 代号 Ticker Symbol Badge */}
                  <span className="px-2.5 py-0.5 rounded-full bg-white/[0.08] border border-white/10 text-xs font-mono font-bold text-white/90 whitespace-nowrap">
                    {model.symbol}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#3772FF]/20 border border-[#3772FF]/40 text-xs font-semibold text-[#60a5fa] whitespace-nowrap">
                    {isChinese ? model.categoryLabelZh : model.type}
                  </span>
                </div>

                {/* 状态与集群指标标签群 (结构化胶囊，杜绝句末孤立点) */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/60 font-mono">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] whitespace-nowrap">
                    <span
                      className={`w-2 h-2 rounded-full animate-pulse ${
                        model.statusLevel === 'optimal'
                          ? 'bg-emerald-400'
                          : model.statusLevel === 'busy'
                          ? 'bg-amber-400'
                          : 'bg-rose-400'
                      }`}
                    />
                    <span
                      className={`font-semibold ${
                        model.statusLevel === 'optimal'
                          ? 'text-emerald-400'
                          : model.statusLevel === 'busy'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {isChinese ? model.statusZh : (model.statusLevel === 'optimal' ? 'Operational' : 'Busy')}
                    </span>
                  </span>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] whitespace-nowrap">
                    <span className="text-white/40">{isChinese ? '负载' : 'Load'}:</span>
                    <span className="text-white font-medium">{model.clusterLoad}%</span>
                  </span>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] whitespace-nowrap">
                    <span className="text-white/40">SLA:</span>
                    <span className="text-white font-medium">{model.sla}%</span>
                  </span>

                  {model.queueWait && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/50 whitespace-nowrap">
                      <span>{isChinese ? model.queueWait : (model.queueWait.includes('无排队') ? 'Zero Queue' : model.queueWait)}</span>
                    </span>
                  )}
                </div>

                {/* 独立架构说明，规避换行孤立点 */}
                {model.architecture && (
                  <div className="text-[11px] text-white/40 font-mono mt-1.5 tracking-tight truncate max-w-xl">
                    {model.architecture}
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：费率单价、24h 涨跌幅与核心行动按钮组 (强制单行不折叠) */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 lg:gap-8 shrink-0">
              <div className="text-left sm:text-right font-mono shrink-0">
                <div className="text-xs text-white/40 mb-1 whitespace-nowrap">
                  {isChinese ? '标准调用费率' : 'Base Rate'}
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white tracking-tight whitespace-nowrap">
                  {isChinese ? model.priceRate : model.priceRateEn}
                </div>
                <div className="text-xs text-emerald-400 font-semibold mt-1 flex items-center sm:justify-end gap-1 whitespace-nowrap">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  <span>24h {model.callsChange24h}</span>
                </div>
              </div>

              {/* 动作按钮群 (防止汉字换行割裂) */}
              <div className="flex items-center gap-3 shrink-0 flex-nowrap">
                <Link
                  href={studioUrl}
                  className="px-6 py-3 rounded-full bg-[#3772FF] hover:bg-[#2e62de] text-white text-xs font-bold tracking-wide transition-all shadow-[0_4px_20px_rgba(55,114,255,0.4)] hover:shadow-[0_6px_25px_rgba(55,114,255,0.6)] hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Zap className="w-4 h-4 fill-current shrink-0" />
                  <span className="whitespace-nowrap">{isChinese ? '在 Studio 中体验' : 'Try in Studio'}</span>
                </Link>

                <Link
                  href={apiDocsUrl}
                  className="px-5 py-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-semibold tracking-wide transition-all border border-white/[0.1] hover:border-white/20 hover:-translate-y-0.5 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  title={isChinese ? 'API 接口文档' : 'API Documentation'}
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#00f5d4]" />
                  <span className="whitespace-nowrap">{isChinese ? 'API 文档' : 'API Docs'}</span>
                </Link>

                <button
                  onClick={handleCopyId}
                  className="p-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-semibold tracking-wide transition-all border border-white/[0.1] hover:border-white/20 hover:-translate-y-0.5 cursor-pointer shrink-0"
                  title={isChinese ? '复制模型标识 ID' : 'Copy Model ID'}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-white/70" />}
                </button>
              </div>
            </div>
          </div>

          {/* 模型极简描述行 */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] flex items-start gap-3 text-xs sm:text-sm text-white/75 leading-relaxed bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.04]">
            <Info className="w-4 h-4 text-[#00f5d4] shrink-0 mt-0.5" />
            <p className="flex-1">{isChinese ? model.description : model.descriptionEn}</p>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 4 组关键运营指标微卡 (TradingView Financials 概览卡)         */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#0f1118] border border-white/[0.08] hover:border-white/20 rounded-2xl p-5 shadow-elevation-1 transition-all duration-300">
            <div className="text-xs text-white/40 font-mono mb-1.5 flex items-center justify-between">
              <span>{isChinese ? '24小时实时调用' : '24h Total Calls'}</span>
              <Activity className="w-3.5 h-3.5 text-[#00f5d4]/60" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight flex items-baseline gap-1.5">
              <span>
                {isChinese
                  ? `${(model.calls24h / 10000).toFixed(1)}万`
                  : `${(model.calls24h / 1000000).toFixed(2)}M`}
              </span>
              <span className="text-xs text-white/40 font-normal">
                {isChinese ? '次' : 'calls'}
              </span>
            </div>
            <div className="text-xs text-emerald-400 font-mono mt-1.5 flex items-center gap-1 font-medium">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span>{model.callsChange24h} {isChinese ? '较昨日' : 'vs yesterday'}</span>
            </div>
          </div>

          <div className="bg-[#0f1118] border border-white/[0.08] hover:border-white/20 rounded-2xl p-5 shadow-elevation-1 transition-all duration-300">
            <div className="text-xs text-white/40 font-mono mb-1.5 flex items-center justify-between">
              <span>{isChinese ? '累计模态交付产出' : 'Total Generations'}</span>
              <Layers className="w-3.5 h-3.5 text-[#3772FF]/60" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight flex items-baseline gap-1.5">
              <span>
                {model.outputUnit === 'Tokens'
                  ? isChinese
                    ? `${(model.totalGenerations / 100000000).toFixed(2)}亿`
                    : `${(model.totalGenerations / 1000000000).toFixed(2)}B`
                  : isChinese
                  ? `${(model.totalGenerations / 10000).toFixed(1)}万`
                  : `${(model.totalGenerations / 1000000).toFixed(2)}M`}
              </span>
              <span className="text-xs text-white/40 font-normal">
                {isChinese ? model.outputUnit || '件' : model.outputUnitEn || 'items'}
              </span>
            </div>
            <div className="text-xs text-emerald-400 font-mono mt-1.5 flex items-center gap-1 font-medium truncate">
              <TrendingUp className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {model.generationsChange24h} · {isChinese ? model.qualityRatioZh : model.qualityRatioEn}
              </span>
            </div>
          </div>

          <div className="bg-[#0f1118] border border-white/[0.08] hover:border-white/20 rounded-2xl p-5 shadow-elevation-1 transition-all duration-300">
            <div className="text-xs text-white/40 font-mono mb-1.5 flex items-center justify-between">
              <span>{isChinese ? '平均响应时延 (端到端)' : 'Avg Latency (P50)'}</span>
              <Zap className="w-3.5 h-3.5 text-amber-400/60" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight flex items-baseline gap-1.5">
              <span>
                {model.latencyMs >= 1000
                  ? (model.latencyMs / 1000).toFixed(1)
                  : model.latencyMs}
              </span>
              <span className="text-xs text-white/40 font-normal">
                {model.latencyMs >= 1000 ? 's' : 'ms'}
              </span>
            </div>
            <div className="text-xs text-[#38bdf8] font-mono mt-1.5 flex items-center gap-1 font-medium truncate">
              <Zap className="w-3 h-3 shrink-0" />
              <span className="truncate">{isChinese ? model.latencyBreakdownZh : model.latencyBreakdownEn}</span>
            </div>
          </div>

          <div className="bg-[#0f1118] border border-white/[0.08] hover:border-white/20 rounded-2xl p-5 shadow-elevation-1 transition-all duration-300">
            <div className="text-xs text-white/40 font-mono mb-1.5 flex items-center justify-between">
              <span>{isChinese ? '高可用 SLA 与节点自愈' : 'Availability SLA'}</span>
              <Shield className="w-3.5 h-3.5 text-emerald-400/60" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight flex items-baseline gap-1.5">
              <span>{model.sla}%</span>
            </div>
            <div className="text-xs text-emerald-400 font-mono mt-1.5 flex items-center gap-1 font-medium">
              <Shield className="w-3 h-3 shrink-0" />
              <span>{isChinese ? `自愈漂移 <${model.failoverMs || 80}ms` : `Failover <${model.failoverMs || 80}ms`}</span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 核心多指标 TradingView 官方 Canvas 交互图表                 */}
        {/* ========================================================= */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#00f5d4]" />
              <span>{isChinese ? '模型算力与调用深度走势' : 'Model Telemetry & Volume Chart'}</span>
            </h2>
            <div className="text-xs font-mono text-white/40 hidden sm:block">
              {isChinese ? '60 FPS 极速高精遥测引擎' : '60 FPS Real-time Telemetry Engine'}
            </div>
          </div>

          <TradingViewModelChart
            model={model}
            locale={locale}
            initialTimeframe="24h"
            initialMetric="invocations"
            height={460}
          />
        </section>

        {/* ========================================================= */}
        {/* 4 叠财务与规格深度拆解 (TradingView Financials Overview 规范) */}
        {/* ========================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* CARD 01: 性能与吞吐概览 */}
          <div className="bg-[#0f1118] border border-white/[0.08] rounded-2xl p-6 shadow-elevation-2">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-[#3772FF]/15 flex items-center justify-center text-[#3772FF]">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {isChinese ? '性能指标与并发吞吐' : 'Operational Performance'}
                </h3>
                <p className="text-xs text-white/40 font-mono">
                  {isChinese ? '生产级 SLA 与长尾时延监控' : 'Production-grade Latency & Concurrency'}
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs font-mono">
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '首字/首块延迟 (P50 TTFT)' : 'P50 TTFT'}</span>
                <span className="text-white font-bold">{model.ttftMs} ms</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '长尾极端延迟 (P99 Latency)' : 'P99 Latency'}</span>
                <span className="text-white font-bold">{model.p99LatencyMs} ms</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '平均并发吞吐能力' : 'Throughput TPS'}</span>
                <span className="text-emerald-400 font-bold">{model.throughputTps}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '全网并发负载峰值' : 'Peak Concurrency'}</span>
                <span className="text-white font-bold">{model.peakConcurrency}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-white/60">{isChinese ? '全球专线丢包率' : 'Packet Loss Rate'}</span>
                <span className="text-emerald-400 font-bold">{model.packetLoss}</span>
              </div>
            </div>
          </div>

          {/* CARD 02: 成本与费率体系 */}
          <div className="bg-[#0f1118] border border-white/[0.08] rounded-2xl p-6 shadow-elevation-2">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {isChinese ? '计费模型与成本结构' : 'Cost & Billing Matrix'}
                </h3>
                <p className="text-xs text-white/40 font-mono">
                  {isChinese ? '阶梯计费与高并发折扣明细' : 'Credits and Token Breakdown'}
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs font-mono">
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '单次任务基准消耗' : 'Base Task Cost'}</span>
                <span className="text-[#00f5d4] font-bold">{model.pricingDetails.baseCredits} {isChinese ? '算力点' : 'Credits'}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '提示词输入成本 (每千字)' : 'Input Cost / 1k Tokens'}</span>
                <span className="text-white font-bold">{model.pricingDetails.input1kTokens}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '生成产出计费 (每千字)' : 'Output Cost / 1k Tokens'}</span>
                <span className="text-white font-bold">{model.pricingDetails.output1kTokens}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '超分辨率 4K 倍率' : '4K Upscale Multiplier'}</span>
                <span className="text-white font-bold">{model.pricingDetails.upscale4kMultiplier}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-white/60">{isChinese ? '会员专属峰值折扣' : 'VIP Discount'}</span>
                <span className="text-[#e11d74] font-bold">{model.pricingDetails.vipDiscount}</span>
              </div>
            </div>
          </div>

          {/* CARD 03: 架构与技术规格 */}
          <div className="bg-[#0f1118] border border-white/[0.08] rounded-2xl p-6 shadow-elevation-2">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-[#e11d74]/15 flex items-center justify-center text-[#e11d74]">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {isChinese ? '架构设计与技术规格' : 'Technical Specifications'}
                </h3>
                <p className="text-xs text-white/40 font-mono">
                  {isChinese ? '参数规模与原生分辨率上限' : 'Parameters, Context & Resolutions'}
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs font-mono">
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '核心架构' : 'Architecture'}</span>
                <span className="text-white font-bold text-right max-w-[220px] truncate">{model.architecture}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '有效参数量' : 'Parameters'}</span>
                <span className="text-white font-bold">{model.parameters}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '上下文窗口长度' : 'Context Window'}</span>
                <span className="text-white font-bold">{model.contextWindow}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-white/60">{isChinese ? '最大输出分辨率' : 'Max Resolution'}</span>
                <span className="text-white font-bold">{model.maxResolution}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-white/60">{isChinese ? '最大单次时长/尺寸' : 'Max Duration'}</span>
                <span className="text-white font-bold">{model.duration}</span>
              </div>
            </div>
          </div>

          {/* CARD 04: 全球边缘节点延迟监控 */}
          <div className="bg-[#0f1118] border border-white/[0.08] rounded-2xl p-6 shadow-elevation-2">
            <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-[#00f5d4]/15 flex items-center justify-center text-[#00f5d4]">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {isChinese ? '全球专线节点与健康拨测' : 'Global Edge Gateways'}
                </h3>
                <p className="text-xs text-white/40 font-mono">
                  {isChinese ? '实时各区网络 Ping 与负载均衡' : 'Live Region Latency & Load Balancing'}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs font-mono">
              {model.gateways.map((gw, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-white/70">
                      {isChinese ? gw.region : gw.regionEn}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-20 bg-white/10 h-1.5 rounded-full overflow-hidden hidden sm:block">
                      <div
                        className="bg-[#3772FF] h-full rounded-full"
                        style={{ width: `${gw.load}%` }}
                      />
                    </div>
                    <span className="text-white/40 text-[11px] w-8 text-right hidden sm:inline">
                      {gw.load}%
                    </span>
                    <span className="text-emerald-400 font-bold w-12 text-right">
                      {gw.ping}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 同赛道竞品对比与相关推荐                                     */}
        {/* ========================================================= */}
        {relatedModels.length > 0 && (
          <section className="pt-8 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {isChinese ? '同赛道前沿模型' : 'Comparable Models in Same Domain'}
                </h2>
                <p className="text-xs text-white/40 mt-0.5">
                  {isChinese ? '基于架构能力与创意领域的精选模型' : 'Models with similar creative modalities'}
                </p>
              </div>

              <Link
                href={screenerUrl}
                className="text-xs text-[#3772FF] hover:text-white font-semibold flex items-center gap-1 transition-colors"
              >
                <span>{isChinese ? '查看全网模型总揽' : 'Explore All Models'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {relatedModels.map((rel) => {
                const relUrl = isChinese ? `/zh/models/${rel.id}` : `/models/${rel.id}`;
                return (
                  <Link
                    key={rel.id}
                    href={relUrl}
                    className="bg-[#0f1118] border border-white/[0.08] hover:border-white/20 rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 shadow-elevation-1 flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <ModelBrandLogo
                            providerId={rel.providerId}
                            provider={rel.provider}
                            modelId={rel.id}
                            size="md"
                          />
                          <div>
                            <div className="font-bold text-white group-hover:text-[#00f5d4] transition-colors">
                              {rel.name}
                            </div>
                            <div className="text-[11px] font-mono text-white/40">{rel.symbol}</div>
                          </div>
                        </div>

                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {rel.callsChange24h}
                        </span>
                      </div>

                      <div className="text-xs text-white/60 line-clamp-2 leading-relaxed mb-4">
                        {isChinese ? rel.description : rel.descriptionEn}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                      <div className="font-mono text-xs">
                        <span className="text-white/40 block text-[10px]">{isChinese ? '标准费率' : 'Rate'}</span>
                        <span className="text-white font-bold">{isChinese ? rel.priceRate : rel.priceRateEn}</span>
                      </div>

                      <SparklineChart
                        data={rel.sparkline}
                        width={90}
                        height={24}
                        isPositive={rel.isPositive}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
