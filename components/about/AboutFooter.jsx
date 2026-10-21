'use client';

import React from 'react';
import Link from 'next/link';
import {
  Zap,
  ArrowRight,
  Activity,
  Cpu,
  Layers,
  ChevronRight,
  BarChart3,
  Mail,
  Sparkles,
} from 'lucide-react';
import ModelBrandLogo from '@/components/models/ModelBrandLogo';
import BrandLogo from '@/components/site/BrandLogo';
import { useBranding } from '@/lib/hooks/useBranding';

// 核心大模型矩阵导航定义 (按模态分类，涵盖官方品牌 ID 与直达路由)
const FOOTER_MODEL_GROUPS = [
  {
    id: 'image',
    title: 'Text-to-Image Models',
    titleZh: '图像生成 · 视觉大模型',
    icon: Layers,
    accentColor: '#00f5d4',
    models: [
      {
        id: 'flux-dev',
        name: 'FLUX.1 [dev]',
        providerId: 'bfl',
        provider: 'Black Forest Labs',
        tag: '12B · 4K 排印',
      },
      {
        id: 'seedream-5.0',
        name: 'Seedream 5.0 (即梦)',
        providerId: 'bytedance',
        provider: '字节跳动 (ByteDance)',
        tag: '电影超清',
      },
      {
        id: 'wan2.1-text-to-image',
        name: '通义万相 2.1 (Wan)',
        providerId: 'alibaba',
        provider: '阿里巴巴 (Alibaba)',
        tag: '真实流体',
      },
      {
        id: 'midjourney-v7',
        name: 'Midjourney V7',
        providerId: 'midjourney',
        provider: 'Midjourney',
        tag: '概念美学',
      },
      {
        id: 'gpt-image-2.5-flash',
        name: 'GPT-Image 2.5 Flash',
        providerId: 'openai',
        provider: 'OpenAI',
        tag: '毫秒极速',
      },
    ],
  },
  {
    id: 'video',
    title: 'Text-to-Video Models',
    titleZh: '视频生成 · 运镜大模型',
    icon: Activity,
    accentColor: '#e11d74',
    models: [
      {
        id: 'kling-v2.6-pro-t2v',
        name: 'Kling 2.6 Pro (可灵)',
        providerId: 'kuaishou',
        provider: '快手 (Kuaishou)',
        tag: '60 FPS 运镜',
      },
      {
        id: 'minimax-hailuo-2.3-standard-t2v',
        name: 'Hailuo 2.3 (海螺视频)',
        providerId: 'minimax',
        provider: 'MiniMax',
        tag: '长镜头连贯',
      },
      {
        id: 'veo3-text-to-video',
        name: 'Google Veo 3',
        providerId: 'google',
        provider: 'Google DeepMind',
        tag: '物理光影',
      },
      {
        id: 'wan2.1-t2v',
        name: 'Wan 2.1 Video',
        providerId: 'alibaba',
        provider: '阿里巴巴 (Alibaba)',
        tag: '14B 骨干网',
      },
      {
        id: 'runway-gen3',
        name: 'Runway Gen-3 Alpha',
        providerId: 'runway',
        provider: 'Runway',
        tag: '电影工业级',
      },
    ],
  },
  {
    id: 'audio',
    title: 'Audio & Music Models',
    titleZh: '音频音乐 · 声音大模型',
    icon: Sparkles,
    accentColor: '#3772FF',
    models: [
      {
        id: 'suno-create-music',
        name: 'Suno V3.5 Music',
        providerId: 'suno',
        provider: 'Suno AI',
        tag: '全轨编曲人声',
      },
      {
        id: 'minimax-music-3.0',
        name: 'MiniMax Music 3.0',
        providerId: 'minimax',
        provider: 'MiniMax',
        tag: '高保真乐器',
      },
      {
        id: 'minimax-speech-2.6-hd',
        name: 'MiniMax Speech 2.6 HD',
        providerId: 'minimax',
        provider: 'MiniMax',
        tag: '情感语音合成',
      },
      {
        id: 'elevenlabs-turbo-v2',
        name: 'ElevenLabs Turbo v2',
        providerId: 'elevenlabs',
        provider: 'ElevenLabs',
        tag: 'AI 配音',
      },
    ],
  },
  {
    id: 'llm',
    title: 'LLM & Reasoning',
    titleZh: '大语言 · 逻辑推理模型',
    icon: Cpu,
    accentColor: '#fbbf24',
    models: [
      {
        id: 'deepseek-v3',
        name: 'DeepSeek-V3 671B',
        providerId: 'deepseek',
        provider: '深度求索 (DeepSeek)',
        tag: 'SOTA 推理',
      },
      {
        id: 'gpt-4o',
        name: 'GPT-4o Omni',
        providerId: 'openai',
        provider: 'OpenAI',
        tag: '全模态中枢',
      },
      {
        id: 'claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        providerId: 'anthropic',
        provider: 'Anthropic',
        tag: '代码架构旗舰',
      },
      {
        id: 'qwen-2.5-max',
        name: 'Qwen 2.5 Max (千问)',
        providerId: 'alibaba',
        provider: '阿里巴巴 (Alibaba)',
        tag: '复杂长文本',
      },
    ],
  },
];

export default function AboutFooter({ locale = 'en' }) {
  const isChinese = Boolean(locale?.includes('zh'));
  const { brand } = useBranding();
  const brandName = brand?.brandName || 'SupDance';
  const logoHref = brand?.logoHref || (isChinese ? '/zh' : '/');
  const logoTarget = brand?.logoTarget || '_self';

  const getModelUrl = (modelId) => {
    return isChinese ? `/zh/models/${modelId}` : `/models/${modelId}`;
  };

  const getStudioUrl = (tab = 'image') => {
    const root = isChinese ? '/zh/studio' : '/studio';
    return `${root}?tab=${tab}`;
  };

  return (
    <footer className="relative mt-20 border-t border-white/[0.08] bg-[#07080c] pt-16 pb-12 overflow-hidden select-none">
      {/* 底部全景极光微光环境背光 (指针安全) */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1200px] h-[480px] bg-gradient-to-t from-[#e11d74]/10 via-[#3772FF]/5 to-transparent blur-[160px] pointer-events-none" />
      <div className="absolute -bottom-24 -left-20 w-[420px] h-[420px] bg-[#00f5d4]/5 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-12 relative z-10">
        {/* ========================================================= */}
        {/* TIER 1: 品牌超级号召横幅与实时算力集群全网状态条           */}
        {/* ========================================================= */}
        <div className="relative rounded-2xl p-7 sm:p-10 mb-16 overflow-hidden border border-white/10 bg-gradient-to-r from-[#12141c] via-[#161a26] to-[#12141c] backdrop-blur-2xl shadow-elevation-2">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-[#e11d74]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-[#3772FF]/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2.5 mb-3">
                <span className="px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs font-mono text-[#00f5d4] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00f5d4] animate-pulse" />
                  <span>{isChinese ? '模型目录已开放' : 'Model directory available'}</span>
                </span>
                <span className="text-xs text-white/40 font-mono">
                  {isChinese ? '真实调用统计 · 24h' : 'Actual usage · 24h'}
                </span>
              </div>

              <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                {isChinese ? (
                  <>面向全球创作者与影视团队的 AI 模型与创作工作台</>
                ) : (
                  <>Foundation Models & Creative Workspace</>
                )}
              </h3>
              <p className="text-xs sm:text-sm text-white/60 mt-2 leading-relaxed max-w-xl">
                {isChinese
                  ? '一站式无缝聚合 FLUX、可灵、Suno、DeepSeek 等核心旗舰模型。毫秒级自愈漂移与确定性交付，开启工业化生成时代。'
                  : 'Deterministic multi-model routing, sub-second failover, and high-performance telemetry for next-generation creative pipelines.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <Link
                href={isChinese ? '/zh/studio' : '/studio'}
                className="px-6 py-3 rounded-full bg-[#e11d74] hover:bg-[#c0175f] text-white font-bold text-xs tracking-wide shadow-[0_4px_20px_rgba(225,29,116,0.4)] hover:shadow-[0_6px_25px_rgba(225,29,116,0.6)] transition-all hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>{isChinese ? '进入 Studio 创意工坊' : 'Launch Studio Workspace'}</span>
              </Link>
              <Link
                href={isChinese ? '/zh/about#models' : '/about#models'}
                className="px-5 py-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white font-semibold text-xs border border-white/10 transition-all hover:-translate-y-0.5 flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <BarChart3 className="w-3.5 h-3.5 text-[#00f5d4]" />
                <span>{isChinese ? '查看模型目录' : 'View Model Directory'}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TIER 2: 核心大模型全矩阵导航 (4 大模态深度分类目录)           */}
        {/* ========================================================= */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[#00f5d4]" />
              <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {isChinese ? '核心前沿模型全矩阵导航' : 'CORE FOUNDATION MODEL DIRECTORY'}
              </h4>
            </div>
            <Link
              href={isChinese ? '/zh/models' : '/models'}
              className="text-xs text-[#3772FF] hover:text-white transition-colors flex items-center gap-1 font-mono font-medium"
            >
              <span>{isChinese ? '全部模型专题档案' : 'All Model Profiles'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FOOTER_MODEL_GROUPS.map((group) => {
              const IconComp = group.icon;
              return (
                <div
                  key={group.id}
                  className="bg-[#0c0e14] border border-white/[0.08] hover:border-white/20 rounded-xl p-5 transition-all duration-300 hover:bg-[#10131b] shadow-elevation-1 flex flex-col justify-between"
                >
                  <div>
                    {/* 分组抬头 */}
                    <div className="flex items-center gap-2.5 pb-3 mb-3 border-b border-white/[0.06]">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${group.accentColor}18`,
                          color: group.accentColor,
                        }}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">
                          {isChinese ? group.titleZh : group.title}
                        </div>
                      </div>
                    </div>

                    {/* 模型列表 */}
                    <div className="space-y-2.5">
                      {group.models.map((m) => (
                        <Link
                          key={m.id}
                          href={getModelUrl(m.id)}
                          className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/[0.04] transition-all group/item"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* 官方高清矢量品牌微标 */}
                            <ModelBrandLogo
                              providerId={m.providerId}
                              provider={m.provider}
                              modelId={m.id}
                              size="sm"
                              className="shrink-0"
                            />
                            <div className="truncate">
                              <span className="text-xs font-medium text-white/80 group-hover/item:text-[#00f5d4] transition-colors truncate block">
                                {m.name}
                              </span>
                              <span className="text-[10px] text-white/35 font-mono block truncate">
                                {m.provider}
                              </span>
                            </div>
                          </div>

                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-white/[0.05] text-white/50 border border-white/5 shrink-0 ml-2">
                            {m.tag}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>

                  {/* 底部微注 */}
                  <div className="pt-3 mt-3 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono text-white/30">
                    <span>MODEL GROUP · {group.id.toUpperCase()}</span>
                    <span className="text-emerald-400">CATALOG</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================= */}
        {/* TIER 3: 产品体系、开发者生态、合规政策与技术订阅           */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12 border-b border-white/[0.08]">
          {/* 第 1 列：品牌微标与企业愿景 (占据 4 列) */}
          <div className="lg:col-span-4 flex flex-col items-start space-y-4">
            <Link
              href={logoHref}
              target={logoTarget}
              className="group flex flex-col items-start gap-1.5 cursor-pointer"
              aria-label={`${brandName} Home`}
            >
              <BrandLogo
                brand={brand}
                className="inline-flex items-center gap-2.5 [&>span:first-child]:group-hover:scale-105 transition-transform duration-200"
                nameClassName="text-lg font-black tracking-tight text-white group-hover:text-[#00f5d4] transition-colors"
              />
              <span className="text-[10px] font-mono text-white/40 tracking-wider uppercase">
                {brand?.brandSlogan || (isChinese ? 'AI 创意工作室' : 'Generative AI Workspace')}
              </span>
            </Link>

            <p className="text-xs text-white/60 leading-relaxed max-w-sm">
              {isChinese
                ? '面向创作者、独立工作室与团队的专业生成式 AI 创作工作台与模型接入层，支持模型发现、生成与工作流协作。'
                : 'A generative AI workspace and model access layer for creators, independent studios, and teams.'}
            </p>

            <div className="pt-2 text-xs font-mono text-white/50 space-y-1">
              <div>support@{brandName.toLowerCase()}.com</div>
            </div>
          </div>

          {/* 第 2 列：核心工作台 (2 列) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              {isChinese ? '创意工作台' : 'WORKSPACES'}
            </div>
            <ul className="space-y-2 text-xs text-white/60">
              <li>
                <Link href={getStudioUrl('image')} className="hover:text-white transition-colors">
                  {isChinese ? '图像生图工坊' : 'Image Studio'}
                </Link>
              </li>
              <li>
                <Link href={getStudioUrl('video')} className="hover:text-white transition-colors">
                  {isChinese ? '视频运镜导演台' : 'Video Cinema'}
                </Link>
              </li>
              <li>
                <Link href={getStudioUrl('audio')} className="hover:text-white transition-colors">
                  {isChinese ? '音频音乐工作台' : 'Audio & Music'}
                </Link>
              </li>
              <li>
                <Link href={isChinese ? '/zh/workflow' : '/workflow'} className="hover:text-white transition-colors">
                  {isChinese ? '节点式工作流' : 'Workflow Canvas'}
                </Link>
              </li>
              <li>
                <Link href={isChinese ? '/zh/pricing' : '/pricing'} className="hover:text-white transition-colors">
                  {isChinese ? '会员订阅方案' : 'Pricing & Plans'}
                </Link>
              </li>
            </ul>
          </div>

          {/* 第 3 列：开发者与遥测 (2 列) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              {isChinese ? '开发者与遥测' : 'DEVELOPER & API'}
            </div>
            <ul className="space-y-2 text-xs text-white/60">
              <li>
                <Link href={isChinese ? '/zh/call-api' : '/call-api'} className="hover:text-white transition-colors">
                  {isChinese ? '开放平台（筹备中）' : 'API Platform (Coming Soon)'}
                </Link>
              </li>
              <li>
                <Link href={isChinese ? '/zh/about#models' : '/about#models'} className="hover:text-white transition-colors">
                  {isChinese ? '模型目录与真实调用' : 'Model Directory'}
                </Link>
              </li>
              <li>
                <Link href={isChinese ? '/zh/community' : '/community'} className="hover:text-white transition-colors">
                  {isChinese ? '创作者案例广场' : 'Community Gallery'}
                </Link>
              </li>
              <li>
                <Link href={isChinese ? '/zh/benefits' : '/benefits'} className="hover:text-white transition-colors">
                  {isChinese ? '创作者算力权益' : 'Creator Benefits'}
                </Link>
              </li>
            </ul>
          </div>

          {/* 第 4 列：技术动态订阅与合规 (4 列) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              {isChinese ? '模型技术周刊与通知' : 'NEWSLETTER & UPDATES'}
            </div>
            <p className="text-xs text-white/50 leading-relaxed">
              {isChinese
                ? `订阅 ${brandName} 技术周报，第一时间获取模型与产品更新公告。`
                : `Subscribe to receive ${brandName} foundation model updates and technical release notes.`}
            </p>

            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-[#12141c] p-3 text-xs text-white/60">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#00f5d4]" />
              <div>
                <p className="font-semibold text-white">
                  {isChinese ? '邮件订阅即将开放' : 'Email newsletter coming soon'}
                </p>
                <p className="mt-1 leading-relaxed">
                  {isChinese
                    ? '目前还没有可用的邮件订阅服务。欢迎先加入社区获取模型与产品更新。'
                    : 'Email subscriptions are not available yet. Join the community for model and product updates.'}
                </p>
                <Link
                  href={isChinese ? '/zh/community' : '/community'}
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-[#00f5d4] hover:text-white transition-colors"
                >
                  {isChinese ? '前往社区' : 'Visit community'}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-3 text-[11px] text-white/40">
              <Link href={isChinese ? '/zh/privacy' : '/privacy'} className="hover:text-white transition-colors">
                {isChinese ? '隐私政策' : 'Privacy Policy'}
              </Link>
              <span>·</span>
              <Link href={isChinese ? '/zh/terms' : '/terms'} className="hover:text-white transition-colors">
                {isChinese ? '服务条款' : 'Terms of Service'}
              </Link>
              <span>·</span>
              <Link href={isChinese ? '/zh/refund' : '/refund'} className="hover:text-white transition-colors">
                {isChinese ? '退款准则' : 'Refund Policy'}
              </Link>
              <span>·</span>
              <Link href={isChinese ? '/zh/content-policy' : '/content-policy'} className="hover:text-white transition-colors">
                {isChinese ? '内容安全' : 'Content Policy'}
              </Link>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TIER 4: 底部版权标识、技术底座致敬与安全状态条             */}
        {/* ========================================================= */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] font-mono text-white/40">
          <div className="flex flex-wrap items-center gap-2">
            <span>© 2026 {brandName} ({brandName.toLowerCase()}.com). All Rights Reserved.</span>
            <span className="hidden sm:inline">·</span>
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              备案编号：沪ICP备2026050086号
            </a>
            <span className="hidden sm:inline">·</span>
            <span className="text-white/30 hidden sm:inline">Next-Gen Creative AI Operating System</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>High-Precision Canvas Core</span>
            </span>
            <span>·</span>
            <span>Model Gateway</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
