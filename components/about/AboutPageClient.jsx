'use client';

import React from 'react';
import Link from 'next/link';
import {
  Shield,
  Zap,
  Cpu,
  Search,
  ArrowRight,
  ChevronRight,
  Boxes,
  BarChart3,
  SlidersHorizontal,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import { SpatialBackground } from '@/components/spatial';
import FigmaBrandSlider from './FigmaBrandSlider';
import ModelScreenerTable from '@/components/models/ModelScreenerTable';
import ModelBrandLogo from '@/components/models/ModelBrandLogo';
import AboutFooter from './AboutFooter';
// 使用流程 4 步 (极简有力)
const HOW_IT_WORKS_STEPS = [
  {
    step: 'Step 1',
    title: 'Model Discovery',
    titleZh: '全景选型',
    desc: 'Compare listed models by actual usage, latency, and pricing.',
    descZh: '按真实调用量、时延与价格对比已上架模型。',
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
    desc: 'Run the selected model in the Studio with the parameters you choose.',
    descZh: '在 Studio 中按所选参数发起生成任务。',
    icon: Zap,
  },
  {
    step: 'Step 4',
    title: 'Pipeline Export',
    titleZh: '资产交付',
    desc: 'Download the generated media or continue iterating in the Studio.',
    descZh: '下载生成结果，或继续在 Studio 中迭代。',
    icon: Boxes,
  },
];

export default function AboutPageClient({ locale = 'en' }) {
  const isChinese = Boolean(locale?.includes('zh'));
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
                  ? '聚合 FLUX、可灵、Suno、DeepSeek 等基础模型，提供已上架模型清单与过去 24 小时的真实调用统计。'
                  : 'Aggregating foundation models such as FLUX, Kling, Suno, and DeepSeek, with listed models and actual 24-hour usage data.'}
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
                  <div className="text-xl font-black text-white tracking-tight">SUPDANCE MODEL HUB</div>
                  <div className="text-[11px] font-mono text-emerald-400 mt-1 flex items-center gap-1.5 justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{isChinese ? '已上架模型 · 真实调用数据' : 'Listed Models · Actual Usage'}</span>
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
                    {isChinese ? '查看模型' : 'View model'}
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
                    {isChinese ? '查看模型' : 'View model'}
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
                    {isChinese ? '查看模型' : 'View model'}
                  </span>
                </Link>
              </div>
            </div>
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
                <span>{isChinese ? '真实调用数据' : 'Actual Usage Data'}</span>
              </div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">
                {isChinese ? '模型总揽看板 (Model Screener)' : 'Foundation Model Screener'}
              </h2>
              <p className="text-xs sm:text-sm text-white/60 mt-1">
                {isChinese
                  ? '按实际调用量、成功率与平均耗时对比已上架模型。'
                  : 'Compare listed models by actual call volume, success rate, and average latency.'}
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
                  {isChinese ? '多区域基础设施' : 'Multi-region infrastructure'}
                </div>

                {/* 中环浮雕数据标签 */}
                <div className="absolute bottom-4 -left-4 px-3 py-1 rounded-full bg-[#161820] border border-[#3772FF]/40 text-[11px] font-bold text-[#3772FF] shadow-lg whitespace-nowrap font-mono">
                  {isChinese ? '24h 真实调用统计' : 'Actual 24h usage'}
                </div>

                {/* 内环浮雕数据标签 */}
                <div className="absolute bottom-4 -right-4 px-3 py-1 rounded-full bg-[#161820] border border-[#e11d74]/40 text-[11px] font-bold text-[#e11d74] shadow-lg whitespace-nowrap font-mono">
                  {isChinese ? '已上架模型目录' : 'Listed model directory'}
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
                      {isChinese ? '稳定可用 (Reliability)' : 'Reliability'}
                    </h4>
                    <p className="text-xs sm:text-sm text-white/60 leading-relaxed mt-0.5">
                      {isChinese
                        ? '以可用性监控与故障隔离保障生产连续性。'
                        : 'Availability monitoring and fault isolation for production continuity.'}
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
                        ? '联通 Studio 创意工坊、节点画布与多模型接入。'
                        : 'Unifying Studio canvases, visual workflows, and model access.'}
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
        {/* MODULE 08: COMMUNITY & RESEARCH CTA                       */}
        {/* ========================================================= */}
        <section id="learn-and-earn" className="py-20 border-t border-white/[0.06]">
          <div className="rounded-3xl border border-white/10 bg-[#12141a] p-8 text-center sm:p-12">
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {isChinese ? '模型研报与实战指南' : 'Research & Model Guides'}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-white/60 sm:text-sm">
              {isChinese
                ? '系统化的模型指南与实战文章仍在整理中。欢迎先加入社区，获取模型更新与产品公告。'
                : 'Structured model guides and practical articles are still being prepared. Join the community for model updates and product announcements.'}
            </p>
            <Link
              href={isChinese ? '/zh/community' : '/community'}
              className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-[#3772FF] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#2e62de]"
            >
              {isChinese ? '前往社区' : 'Visit community'}
              <ChevronRight className="h-4 w-4" />
            </Link>
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
