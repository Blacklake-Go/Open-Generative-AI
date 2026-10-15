import React from 'react';
import StudioHeader from '@/components/site/StudioHeader';
import SupplierMarquee from '@/components/call-api/SupplierMarquee';
import PremiumFooter from '@/components/call-api/PremiumFooter';
import InteractiveCanvasPreview from '@/components/call-api/InteractiveCanvasPreview';
import StudioFeatureGrid from '@/components/call-api/StudioFeatureGrid';
import CreativeGallery from '@/components/call-api/CreativeGallery';
import { SpatialBackground } from '@/components/spatial';

export const metadata = {
  title: 'SupDance AI Studio | 新一代旗舰级生成式 AI 视觉创作平台',
  description: '聚合全球顶尖生图与视频模型。无需管理多个平台，在统一专业画布中自由创作超写实人像、电影级分镜、商业海报与动态视觉。',
  // 零入链的落地页：没有内部链接给它导权重，被爬到的只会是搜索引擎自己猜的。
  robots: { index: false, follow: false },
};

export default function CallApiPage() {
  return (
    <div className="min-h-screen bg-obsidian text-ink selection:bg-brand-line selection:text-brand-hover relative overflow-x-hidden font-sans">
      
      {/* SupDance AI 空间光影视觉系统 (7层独立引擎) */}
      <SpatialBackground variant="hero" />

      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* 1. 顶部全站统一固定导航栏 */}
        <StudioHeader />

        {/* 2. Hero 极具视觉冲击力核心区 */}
        <section id="hero" className="relative pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
          <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8">
            
            {/* 顶部动态亮点标签 */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-wash border border-brand-line text-xs text-ink backdrop-blur-md shadow-inner shadow-brand-soft">
                <span className="flex h-2 w-2 rounded-full bg-brand animate-ping" />
                <span className="text-brand-hover font-semibold">全新上线</span>
                <span className="text-ink-subtle">|</span>
                <span>FLUX.1 [pro] 1.1 Ultra 与 Midjourney v6.1 已入驻 Studio 工作台</span>
                <svg className="w-3.5 h-3.5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* 核心超级主标与副标 */}
            <div className="text-center max-w-4xl mx-auto mb-10">
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
                一个工作台 · 释放<br />
                <span className="bg-gradient-to-r from-surface-inverse via-brand to-brand-active bg-clip-text text-transparent">
                  全模态 AI 创意生产力
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-ink-muted font-normal leading-relaxed max-w-2xl mx-auto">
                聚合全球顶尖生图与视频模型。无需在多个平台间频繁切换，在统一专业画布中自由创作超写实人像、电影级分镜、商业海报与动态视觉。
              </p>
            </div>

            {/* CTA 操作组：直接引导至首页核心功能 */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
              <a
                href="/studio"
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-brand-active to-blue-600 hover:from-brand hover:to-blue-500 text-ink font-bold text-sm tracking-wide shadow-elevation-3 shadow-brand-line hover:shadow-brand-line hover:-translate-y-0.5 transition-all flex items-center gap-2 btn-spatial-glow"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span>立即进入 Studio 免费创作</span>
              </a>

              <a
                href="/community"
                className="px-7 py-4 rounded-xl bg-wash hover:bg-wash-strong text-ink font-semibold text-sm border border-line hover:border-line-strong backdrop-blur-md hover:-translate-y-0.5 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>探索社区精选大作 (10万+)</span>
              </a>

              <a
                href="/pricing"
                className="px-6 py-4 rounded-xl text-ink hover:text-ink font-medium text-sm transition-colors flex items-center gap-1.5"
              >
                <span>查看会员与算力方案</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>

            {/* 核心交互体验区：生图预览与同款一键 Remix */}
            <InteractiveCanvasPreview />

          </div>
        </section>

        {/* 3. 【重点吸收】：全球顶尖生图与视觉模型无缝无限滑动跑马灯 */}
        <SupplierMarquee />

        {/* 4. 深度结合首页 4 大工坊功能网格 */}
        <StudioFeatureGrid />

        {/* 5. 创作者社区精选作品流与一键同款 Remix */}
        <CreativeGallery />

        {/* 6. 【高端奢华生图平台专属页脚】 */}
        <PremiumFooter />

      </div>
    </div>
  );
}
