'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Play, Sparkles } from 'lucide-react';

export const REEL_FRAMES = [
  {
    id: 'frame-1',
    title: { zh: '赛博仿生肖像 · 真实光学散焦', en: 'Cybernetic Portrait · Swirl Bokeh' },
    model: 'FLUX.2 Klein',
    tag: '4K UHD · SWIRL BOKEH',
    aspect: '2.39:1 Cinema Scope',
    image: '/assets/cinema/swirl_bokeh_portrait.webp',
    href: '/studio?tab=image&model=flux-2-klein-4b',
  },
  {
    id: 'frame-2',
    title: { zh: '巨构未来主义城市 · 8K 大画幅', en: 'Megastructure Cityscape · 8K Format' },
    model: 'Google Veo 3.1',
    tag: '8K DIGITAL · ANAMORPHIC',
    aspect: 'Anamorphic 2.39:1',
    image: '/assets/cinema/modular_8k_digital.webp',
    href: '/studio?tab=video&model=veo3.1-text-to-video',
  },
  {
    id: 'frame-3',
    title: { zh: '高精机械仿生体 · 三维神经空间', en: 'Bionic Android · Spatial Mesh' },
    model: 'Hunyuan 3D',
    tag: 'SPATIAL MESH · 60 FPS',
    aspect: '3D Spatial Geometry',
    image: '/assets/cinema/studio_digital_s35.webp',
    href: '/studio?tab=video&model=hunyuan-text-to-video',
  },
  {
    id: 'frame-4',
    title: { zh: '双人对峙电影帧 · 70毫米胶片质感', en: 'Cinematic Confrontation · 70mm Film' },
    model: 'Wan 2.7 Ultra',
    tag: '70MM SCOPE · DYNAMIC MOTION',
    aspect: 'Grand Format 70mm',
    image: '/assets/cinema/grand_format_70mm_film.webp',
    href: '/studio?tab=video&model=wan2.7-text-to-video',
  },
  {
    id: 'frame-5',
    title: { zh: '动力装甲与微表情 · 电影镜头追踪', en: 'Power Armor & Expression · Lens Track' },
    model: 'MiniMax Hailuo 2.3',
    tag: '1080P ULTRA · MICRO-EXPRESSION',
    aspect: 'Classic Anamorphic',
    image: '/assets/cinema/classic_anamorphic.webp',
    href: '/studio?tab=video&model=minimax-hailuo-2.3-standard-t2v',
  },
  {
    id: 'frame-6',
    title: { zh: '微距极端光影 · 纳米光学解构', en: 'Extreme Macro Optics · Photorealism' },
    model: 'Nano Banana Pro',
    tag: 'OPTICAL RAY-TRACING · 4K',
    aspect: 'Macro Prime 100mm',
    image: '/assets/cinema/extreme_macro.webp',
    href: '/studio?tab=image&model=nano-banana-pro',
  },
];

export default function CinematicReel({ locale = 'zh' }) {
  const isChinese = String(locale).toLowerCase().startsWith('zh');
  // Double list for infinite seamless marquee loop
  const marqueeList = [...REEL_FRAMES, ...REEL_FRAMES];

  return (
    <div className="relative w-full overflow-hidden py-4">
      {/* 左右羽化衰减边缘 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16 bg-gradient-to-r from-canvas via-canvas/80 to-transparent sm:w-32"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16 bg-gradient-to-l from-canvas via-canvas/80 to-transparent sm:w-32"
      />

      {/* 无缝滑动电影长廊 (Seamless Marquee Reel) */}
      <div className="flex animate-marquee gap-5 px-4">
        {marqueeList.map((frame, idx) => (
          <Link
            key={`${frame.id}-${idx}`}
            href={isChinese ? frame.href.replace(/^\/studio/, '/zh/studio') : frame.href}
            className="group relative flex h-56 w-80 shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-surface shadow-elevation-3 transition-all duration-slow hover:scale-[1.02] hover:border-brand-line/70 sm:h-64 sm:w-96"
          >
            {/* 背景高清影视帧图片 */}
            <div className="absolute inset-0 z-0">
              <img
                src={frame.image}
                alt={frame.title[isChinese ? 'zh' : 'en']}
                className="size-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/60" />
            </div>

            {/* 顶部轻量 HUD 标签 */}
            <div className="relative z-10 flex items-center justify-between p-3.5 sm:p-4">
              <span className="rounded-md border border-white/15 bg-black/60 px-2 py-0.5 text-micro font-mono tracking-wider text-ink backdrop-blur-md">
                {frame.tag}
              </span>
              <div className="flex size-7 items-center justify-center rounded-full bg-black/50 text-white/70 opacity-0 backdrop-blur transition-opacity duration-fast group-hover:opacity-100">
                <ArrowUpRight className="size-3.5" />
              </div>
            </div>

            {/* 底部信息层 */}
            <div className="relative z-10 p-3.5 sm:p-4">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-brand" />
                <span className="text-micro font-semibold uppercase tracking-wider text-brand">
                  {frame.model}
                </span>
                <span className="text-micro font-mono text-white/50">· {frame.aspect}</span>
              </div>
              <h3 className="mt-1 text-card-title font-semibold text-white group-hover:text-cyan-200">
                {frame.title[isChinese ? 'zh' : 'en']}
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
