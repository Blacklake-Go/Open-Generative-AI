'use client';

import { useState } from 'react';
import { getBrandById, resolveBrand } from '@/lib/modelCenter/brandDictionary.js';

const SIZE_MAP = {
  xs: 'size-3.5',
  sm: 'size-5',
  md: 'size-9',
  lg: 'size-12',
};

const TONE_BG_MAP = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  brand: 'bg-brand/10 text-brand border-brand/20',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * 品牌官方标识规范化渲染组件 (Brand Logo Component)
 * - 纯矢量 SVG / 高清透明 PNG 无损渲染
 * - 暗黑背景高对比度与光学留白
 * - 支持直接传入 model 对象、brandId、或已解析的 brand 对象
 * - onError 智能自动平滑降级为品牌双字母微标，杜绝页面破图
 */
export default function BrandLogo({
  brand,
  brandId,
  model,
  size = 'md',
  className = '',
  imageClassName = '',
}) {
  const [hasError, setHasError] = useState(false);

  const brandObj =
    brand ||
    (model ? resolveBrand(model) : null) ||
    (brandId ? getBrandById(brandId) : null) || {
      id: 'other',
      name: '其他品牌',
      shortName: '其他',
      iconText: 'AI',
      tone: 'neutral',
      logoUrl: '/assets/brands/other.svg',
    };

  const logoUrl = brandObj.logoUrl || `/assets/brands/${brandObj.id}.svg`;
  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;
  const toneClass = TONE_BG_MAP[brandObj.tone] || TONE_BG_MAP.neutral;

  if (hasError || !logoUrl) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center font-mono font-bold select-none border ${sizeClass} ${toneClass} ${className}`}
        title={brandObj.name}
      >
        <span className="text-[10px] leading-none">
          {brandObj.iconText || brandObj.shortName?.slice(0, 2) || 'AI'}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden select-none ${sizeClass} ${className}`}
      title={brandObj.name}
    >
      <img
        src={logoUrl}
        alt={brandObj.name || 'Brand Logo'}
        loading="lazy"
        onError={() => setHasError(true)}
        className={`size-full object-contain pointer-events-none transition-transform duration-200 ${imageClassName}`}
      />
    </span>
  );
}
