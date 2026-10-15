'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  Zap,
  Sparkles,
  ShieldCheck,
  Gift,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
} from 'lucide-react';
import RechargeModal from '@/components/account/RechargeModal';
import AuthModal from '@/components/AuthModal';
import { EXCLUSIVE_BENEFITS } from '@/lib/pricing/exclusiveBenefits';

// 支付方式徽标
function WeChatPayIcon({ className = 'size-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M9.5 4C4.8 4 1 7.4 1 11.5c0 2.4 1.3 4.5 3.3 5.8-.2.8-.7 2.4-.8 2.7 0 0-.1.2.1.3.2.1.4 0 .4 0 .6-.4 2.3-1.6 3.1-2.2.8.3 1.6.4 2.4.4.3 0 .7 0 1-.1-.3-.7-.4-1.5-.4-2.4 0-4.4 4-8 9-8 .5 0 1 .1 1.5.2C19.4 6.3 14.8 4 9.5 4z"
        fill="#07C160"
      />
      <path
        d="M17.5 9c-4.1 0-7.5 3-7.5 6.8 0 2.1 1.1 4 2.9 5.2-.2.7-.6 2.1-.7 2.4 0 0-.1.2.1.2.2.1.3 0 .3 0 .5-.3 2-1.4 2.7-1.9.7.2 1.4.3 2.2.3 4.1 0 7.5-3 7.5-6.8S21.6 9 17.5 9z"
        fill="#07C160"
      />
      <circle cx="6.5" cy="8.5" r="1" fill="#fff" />
      <circle cx="12.5" cy="8.5" r="1" fill="#fff" />
      <circle cx="15" cy="13.5" r="1" fill="#fff" />
      <circle cx="20" cy="13.5" r="1" fill="#fff" />
    </svg>
  );
}

function AlipayIcon({ className = 'size-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#1677FF" />
      <path
        d="M18.8 15.6c-1.3-.6-3.2-1.4-5.2-2.1 1.1-1.7 1.8-3.7 2-5.7H19V6.6h-4.3V5h-1.8v1.6H8.5v1.2h4.5c-.3 1.6-.9 3.2-1.7 4.5-1.5-.6-3.1-1.2-4.1-1.2-2.2 0-3.6 1.4-3.6 3.2 0 1.9 1.6 3.3 3.8 3.3 2.3 0 4.6-1.5 6.2-3.8 2.2.8 4.7 1.9 6.2 2.6.5.2 1 .3 1.4.3 1.2 0 2.2-.9 2.2-2.1 0-.6-.3-1.1-.9-1.4l-1.8-.9zM7.2 16.2c-1.3 0-2.1-.8-2.1-1.9 0-1.1.9-1.9 2.1-1.9.9 0 2.1.4 3.4.9-1 1.9-2.2 2.9-3.4 2.9z"
        fill="#fff"
      />
    </svg>
  );
}

// 悬浮气泡提示组件
function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex items-center ml-1 cursor-pointer text-ink-subtle hover:text-ink transition-colors"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Info className="size-3" />
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 w-52 rounded-lg bg-overlay border border-line-strong p-2 text-[11px] leading-tight text-ink shadow-elevation-3 pointer-events-none text-center">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-overlay" />
        </span>
      )}
    </span>
  );
}

export default function SubscriptionModal({
  isOpen,
  onClose,
  user = null,
  onOpenAuth = null,
  onSuccess = null,
  isInline = false,
}) {
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);
  const [showAuthModal, setShowAuthModal] = useState(false);
  // 周期：'monthly' | 'quarterly' | 'yearly'
  const [billingCycle, setBillingCycle] = useState('yearly'); // 默认展示高性价比年付
  // 选中的充值套餐打开
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [showFaq, setShowFaq] = useState(true);
  const [faqConfig, setFaqConfig] = useState(null);
  const [expandedFaqIds, setExpandedFaqIds] = useState(new Set(['faq-4', 'faq-5']));
  const [dynamicPlans, setDynamicPlans] = useState(null);
  const [expandedMoreFeatures, setExpandedMoreFeatures] = useState({});

  useEffect(() => {
    if (user) {
      setCurrentUser(user);
    } else if (isOpen) {
      fetch('/api/auth/me', { cache: 'no-store' })
        .then((res) => res.ok && res.json())
        .then((data) => {
          if (data?.user) setCurrentUser(data.user);
        })
        .catch(() => {});
    }
  }, [user, isOpen]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen && !isInline) return;
    // 异步拉取运营配置的最新订阅问答与前台套餐 (按需懒加载)
    if (!faqConfig) {
      fetch('/api/site/subscription-faq')
        .then((res) => res.ok && res.json())
        .then((data) => {
          if (data && Array.isArray(data.items)) {
            setFaqConfig(data);
          }
        })
        .catch(() => {});
    }

    if (!dynamicPlans) {
      fetch('/api/billing/plans')
        .then((res) => res.ok && res.json())
        .then((data) => {
          if (data && Array.isArray(data.plans) && data.plans.length > 0) {
            setDynamicPlans(data.plans);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, isInline, faqConfig, dynamicPlans]);

  useEffect(() => {
    if (isInline) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isInline, onClose]);

  // 4 档核心套餐配置数据（严格对齐 UI_DESIGN_SYSTEM 规范与深暗毛玻璃层级）
  const PLANS = useMemo(() => [
    {
      id: 'starter',
      codeName: 'BASE',
      name: 'Starter (入门探索版)',
      tagMonthly: '限时 6.7折',
      tagQuarterly: '限时 6.3折',
      tagYearly: '限时 6.3折',
      monthlyPrice: 140,
      monthlyOrigin: 233,
      quarterlyPrice: 420,
      quarterlyOrigin: 700,
      yearlyPrice: 1680,
      yearlyOrigin: 2800,
      creditsMonthly: 2000,
      bonusCredits: 500,
      highlight: false,
      badge: null,
      topRoofWindow: null,
      cardBorderClass: 'border-line hover:border-line-strong shadow-elevation-2',
      btnBgClass: 'bg-white text-ink-inverse font-bold hover:bg-zinc-200 active:bg-zinc-300',
      unitCostYearly: '¥0.070',
      modelRates: {
        seedancePro: { text: '约 ¥0.30/s', highlight: false },
        seedance25: { text: '约 ¥0.48/s', highlight: false },
        minimaxH3: { text: '约 ¥0.10/s', highlight: false },
        fluxPro: { text: '约 ¥0.15/张', highlight: false },
      },
      exclusiveFeatures: ['no_watermark', 'commercial_license'],
      videoFeatures: [
        '已开放视频模型按量调用',
        '专享异步并发: 2 路并行生成',
        '普通队列优先调度',
      ],
      imageFeatures: [
        '图像模型按量使用与规格透明报价',
        '无水印纯净导出支持',
      ],
      moreFeatures: [
        '授权数字人像容量: 2 个',
        '5GB 云端资产库空间',
        '个人商用授权许可',
      ],
    },
    {
      id: 'basic',
      codeName: 'STAR',
      name: 'Basic (进阶创作者)',
      tagMonthly: '限时 7折',
      tagQuarterly: '限时 6.3折',
      tagYearly: '限时 5.9折',
      monthlyPrice: 350,
      monthlyOrigin: 500,
      quarterlyPrice: 945,
      quarterlyOrigin: 1500,
      yearlyPrice: 4200,
      yearlyOrigin: 6000,
      creditsMonthly: 5000,
      bonusCredits: 1500,
      highlight: true,
      badge: '推荐',
      topRoofWindow: null,
      cardBorderClass: 'border-brand/50 hover:border-brand shadow-elevation-2',
      btnBgClass: 'bg-brand text-ink-on-accent font-bold hover:bg-brand-hover active:bg-brand-active',
      unitCostYearly: '¥0.060',
      modelRates: {
        seedancePro: { text: '约 ¥0.30/s', highlight: false },
        seedance25: { text: '约 ¥0.48/s', highlight: false },
        minimaxH3: { text: '约 ¥0.10/s', highlight: false },
        fluxPro: { text: '约 ¥0.15/张', highlight: false },
      },
      exclusiveFeatures: ['no_watermark', 'vip_speed_queue', 'export_4k', 'commercial_license'],
      videoFeatures: [
        '包含 BASE 全部可用模型特权',
        '专享异步并发: 4 路并行生成',
        '更高队列优先级 (免排队)',
      ],
      imageFeatures: [
        '4K 极清超采样与细节修复支持',
        '多风格真人面容一致性生成增强',
      ],
      moreFeatures: [
        '授权数字人像容量: 5 个',
        '20GB 专属素材资产库空间',
        '小微创作者商用许可及保障',
      ],
    },
    {
      id: 'plus',
      codeName: 'PRO',
      name: 'Plus (专业工作室)',
      tagMonthly: '限时 8折',
      tagQuarterly: '限时 7.2折',
      tagYearly: '限时 4.8折',
      monthlyPrice: 800,
      monthlyOrigin: 1000,
      quarterlyPrice: 2160,
      quarterlyOrigin: 3000,
      yearlyPrice: 8400,
      yearlyOrigin: 12000,
      creditsMonthly: 10000,
      bonusCredits: 3000,
      highlight: false,
      badge: null,
      topRoofWindow: '超值特惠 · Seedance 2.5 720P 低至0.37元/秒',
      cardBorderClass: 'border-line-strong hover:border-line-strong hover:bg-raised shadow-elevation-2',
      btnBgClass: 'bg-white text-ink-inverse font-bold hover:bg-zinc-200 active:bg-zinc-300',
      unitCostYearly: '¥0.056',
      modelRates: {
        seedancePro: { text: '约 ¥0.24/s', highlight: 'emerald' },
        seedance25: { text: '约 ¥0.37/s', highlight: 'emerald' },
        minimaxH3: { text: '约 ¥0.08/s', highlight: 'emerald' },
        fluxPro: { text: '约 ¥0.12/张', highlight: 'emerald' },
      },
      exclusiveFeatures: ['no_watermark', 'vip_speed_queue', 'export_4k', 'exclusive_latest_models', 'commercial_license'],
      videoFeatures: [
        '专享异步并发: 6 路高速并行生成',
        '已开放首发模型专属使用权',
        '高码率无损规格按份使用',
      ],
      imageFeatures: [
        '多任务批量极速出图',
        '4K 极清工商业级渲染管线',
      ],
      moreFeatures: [
        '授权数字人像容量: 15 个',
        '50GB 团队级素材资产库空间',
        '全渠道商业商用授权凭据',
      ],
    },
    {
      id: 'pro',
      codeName: 'APEX',
      name: 'Pro (旗舰大师版)',
      tagMonthly: '限时 8.8折',
      tagQuarterly: '限时 7.92折',
      tagYearly: '限时 4.1折',
      monthlyPrice: 1760,
      monthlyOrigin: 2000,
      quarterlyPrice: 4752,
      quarterlyOrigin: 6000,
      yearlyPrice: 16800,
      yearlyOrigin: 24000,
      creditsMonthly: 20000,
      bonusCredits: 8000,
      highlight: false,
      badge: '旗舰',
      topRoofWindow: '超值特惠 · Seedance 2.5 720P 低至0.36元/秒',
      cardBorderClass: 'border-2 border-brand/80 shadow-elevation-3 hover:border-brand',
      btnBgClass: 'bg-brand text-ink-on-accent font-bold hover:bg-brand-hover active:bg-brand-active shadow-elevation-2',
      unitCostYearly: '¥0.054',
      modelRates: {
        seedancePro: { text: '约 ¥0.23/s', highlight: 'pink' },
        seedance25: { text: '约 ¥0.36/s', highlight: 'pink' },
        minimaxH3: { text: '约 ¥0.08/s', highlight: 'pink' },
        fluxPro: { text: '约 ¥0.11/张', highlight: 'pink' },
      },
      exclusiveFeatures: ['no_watermark', 'vip_speed_queue', 'export_4k', 'exclusive_latest_models', 'commercial_license', 'dedicated_support'],
      videoFeatures: [
        '专享异步并发: 8 路顶级并发上限',
        '最高配置队列优先级',
        '超长连续镜头与高码率无损直出',
      ],
      imageFeatures: [
        '4K 极清超采样顶级工业画质',
        '专业级色彩管理与 RAW 格式导出',
      ],
      moreFeatures: [
        '授权数字人像容量: 30 个',
        '100GB 顶级云端资产库空间',
        '专属支持入口 & 专属 SLA',
      ],
    },
  ], []);

  const displayPlans = useMemo(() => {
    return (dynamicPlans && dynamicPlans.length > 0 ? dynamicPlans : PLANS)
      .filter((p) => p.id !== 'free')
      .map((p) => {
        const isBuiltIn = PLANS.find((bp) => bp.id === p.id);
        const monthlyPrice = p.monthlyPrice ?? p.monthlyCny ?? isBuiltIn?.monthlyPrice ?? 0;
        const monthlyOrigin = p.monthlyOrigin ?? p.monthlyOriginCny ?? isBuiltIn?.monthlyOrigin ?? Math.round(monthlyPrice * 1.2);
        const quarterlyPrice = p.quarterlyPrice ?? p.quarterlyCny ?? isBuiltIn?.quarterlyPrice ?? Math.round(monthlyPrice * 3);
        const quarterlyOrigin = p.quarterlyOrigin ?? p.quarterlyOriginCny ?? isBuiltIn?.quarterlyOrigin ?? monthlyOrigin * 3;
        const yearlyPrice = p.yearlyPrice ?? p.yearlyCny ?? isBuiltIn?.yearlyPrice ?? Math.round(monthlyPrice * 10);
        const yearlyOrigin = p.yearlyOrigin ?? p.yearlyOriginCny ?? isBuiltIn?.yearlyOrigin ?? monthlyOrigin * 12;
        const quotaBase = p.creditsMonthly ?? p.quotaBase ?? isBuiltIn?.creditsMonthly ?? 2000;
        const badge = p.badge || isBuiltIn?.badge || null;
        const highlight = p.highlight ?? (p.id === 'basic' || badge?.includes('受') || badge?.includes('推荐'));
        const exclusive = p.exclusiveFeatures || p.meta?.exclusiveFeatures || isBuiltIn?.exclusiveFeatures || [];

        return {
          id: p.id,
          codeName: p.codeName || isBuiltIn?.codeName || p.id.toUpperCase(),
          name: p.name || isBuiltIn?.name,
          tagMonthly: isBuiltIn?.tagMonthly || '限时优惠',
          tagQuarterly: isBuiltIn?.tagQuarterly || '限时 9折',
          tagYearly: isBuiltIn?.tagYearly || '最低 4.1折',
          monthlyPrice,
          monthlyOrigin,
          quarterlyPrice,
          quarterlyOrigin,
          yearlyPrice,
          yearlyOrigin,
          creditsMonthly: quotaBase,
          bonusCredits: isBuiltIn?.bonusCredits || 0,
          highlight,
          badge,
          topRoofWindow: isBuiltIn?.topRoofWindow || null,
          cardBorderClass: isBuiltIn?.cardBorderClass || 'border-line hover:border-line-strong',
          btnBgClass: isBuiltIn?.btnBgClass || 'bg-white text-ink-inverse hover:bg-zinc-200',
          modelRates: isBuiltIn?.modelRates || {
            seedancePro: { text: '约 ¥0.30/s' },
            seedance25: { text: '约 ¥0.48/s' },
            minimaxH3: { text: '约 ¥0.10/s' },
            fluxPro: { text: '约 ¥0.15/张' },
          },
          unitCostYearly: isBuiltIn?.unitCostYearly || '¥0.070',
          exclusiveFeatures: exclusive,
          videoFeatures: p.videoFeatures?.length ? p.videoFeatures : (isBuiltIn?.videoFeatures || []),
          imageFeatures: p.imageFeatures?.length ? p.imageFeatures : (isBuiltIn?.imageFeatures || []),
          moreFeatures: p.moreFeatures?.length ? p.moreFeatures : (isBuiltIn?.moreFeatures || (Array.isArray(p.features) ? p.features : [])),
        };
      });
  }, [dynamicPlans, PLANS]);

  const handleSubscribe = (plan) => {
    if (!currentUser) {
      if (onOpenAuth) {
        onOpenAuth();
      } else {
        setShowAuthModal(true);
      }
      return;
    }
    // 打开统一收银台
    setSelectedPlanId(plan.id);
    setIsRechargeOpen(true);
  };

  const toggleMoreFeatures = (planId) => {
    setExpandedMoreFeatures((prev) => ({
      ...prev,
      [planId]: !prev[planId],
    }));
  };

  if ((!isOpen && !isInline) || !mounted) return null;

  const contentInner = (
    <div
      className={`relative w-full max-w-6xl mx-auto rounded-2xl border border-line ${
        isInline ? 'bg-surface' : 'bg-overlay my-auto'
      } p-4 sm:p-7 text-ink shadow-elevation-4`}
      role={isInline ? 'region' : 'dialog'}
      aria-modal={isInline ? undefined : 'true'}
      aria-label="会员订阅方案"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 顶部右侧：关闭按钮 (弹窗模式生效) */}
      {!isInline && onClose && (
        <div className="absolute right-4 top-4 flex items-center gap-2 z-20">
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full border border-line bg-wash text-ink-muted hover:border-line-strong hover:bg-wash-strong hover:text-ink active:scale-95 active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* 顶部特惠跑马灯横幅 */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-full border border-brand-line bg-brand-soft px-4 py-2 text-xs shadow-elevation-1">
        <div className="flex items-center gap-2 truncate">
          <Sparkles className="size-3.5 text-brand shrink-0" />
          <span className="font-semibold text-ink truncate">
            双节超值特惠，年付会员享最高加赠，Seedance 2.5 720P 低至0.32元/秒
          </span>
        </div>
        <button
          type="button"
          onClick={() => setBillingCycle('yearly')}
          className="rounded-full bg-brand px-3.5 py-1 text-micro font-bold text-ink-on-accent hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] active:duration-instant transition-[background-color,transform] duration-fast ease-standard cursor-pointer shadow-elevation-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
        >
          立即抢购
        </button>
      </div>

      {/* 顶部标题区 */}
      <div className="text-center pt-1 pb-5">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-ink">
          订阅会员 升级你的导演权益
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-ink-muted max-w-xl mx-auto">
          专享高并发 GPU 算力通道 · 200+ 顶级 AI 模型全开 · 支持支付宝与微信支付
        </p>
      </div>

      {/* 切换栏：周期切换 (月付 / 季付 / 年付) + 单独购买算力包 */}
      <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4 pb-7 max-w-5xl mx-auto">
        {/* 周期切换 (居中主位) */}
        <div
          data-pill-segmented
          className="flex h-10 items-center rounded-full border border-line bg-wash p-1 text-xs font-semibold shadow-elevation-1"
        >
          <button
            type="button"
            data-pill-segment-item
            onClick={() => setBillingCycle('monthly')}
            className={`flex h-8 items-center justify-center rounded-full px-4 text-xs transition-all cursor-pointer ${
              billingCycle === 'monthly'
                ? 'bg-white text-ink-inverse shadow-elevation-1 font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            月付
          </button>
          <button
            type="button"
            data-pill-segment-item
            onClick={() => setBillingCycle('quarterly')}
            className={`relative flex h-8 items-center justify-center gap-1.5 rounded-full px-4 text-xs transition-all cursor-pointer ${
              billingCycle === 'quarterly'
                ? 'bg-white text-ink-inverse shadow-elevation-1 font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>季付</span>
            <span className="rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold">
              最高9折
            </span>
          </button>
          <button
            type="button"
            data-pill-segment-item
            onClick={() => setBillingCycle('yearly')}
            className={`relative flex h-8 items-center justify-center gap-1.5 rounded-full px-4 text-xs transition-all cursor-pointer ${
              billingCycle === 'yearly'
                ? 'bg-white text-ink-inverse shadow-elevation-1 font-bold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>年付</span>
            <span className="rounded-full bg-brand-soft text-brand border border-brand-line px-1.5 py-0.5 text-[9px] font-bold">
              最高省2月
            </span>
          </button>
        </div>

        {/* 购买算力包捷径 (右侧绝对定位悬挂，保持周期切换居中平衡) */}
        <div className="sm:absolute sm:right-0">
          <button
            type="button"
            onClick={() => setIsRechargeOpen(true)}
            className="flex h-10 items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-4 text-xs font-bold text-brand hover:bg-brand-pressed transition-all hover:scale-105 active:scale-95 shadow-elevation-1 cursor-pointer"
          >
            <Gift className="size-3.5 text-brand" />
            <span>单独购买算力包</span>
            <span className="rounded-full bg-brand text-ink-on-accent px-1.5 py-0.5 text-[9px]">永久有效/加赠</span>
          </button>
        </div>
      </div>

      {/* 卡片栅格展示 (4 列卡片，深度复刻统一的结构、色块与折算细节) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-6 items-stretch">
        {displayPlans.map((plan) => {
          const currentPrice =
            billingCycle === 'yearly'
              ? plan.yearlyPrice
              : billingCycle === 'quarterly'
              ? plan.quarterlyPrice
              : plan.monthlyPrice;

          const originPrice =
            billingCycle === 'yearly'
              ? plan.yearlyOrigin
              : billingCycle === 'quarterly'
              ? plan.quarterlyOrigin
              : plan.monthlyOrigin;

          const perMonthPrice =
            billingCycle === 'yearly'
              ? Math.round(plan.yearlyPrice / 12)
              : billingCycle === 'quarterly'
              ? Math.round(plan.quarterlyPrice / 3)
              : plan.monthlyPrice;

          const currentDiscountBadge =
            billingCycle === 'yearly'
              ? plan.tagYearly
              : billingCycle === 'quarterly'
              ? plan.tagQuarterly
              : plan.tagMonthly;

          const unitCost =
            billingCycle === 'yearly'
              ? plan.unitCostYearly
              : `¥${(currentPrice / (plan.creditsMonthly || 1)).toFixed(3)}`;

          const isMoreOpen = expandedMoreFeatures[plan.id];

          return (
            <div
              key={plan.id}
              className="relative flex flex-col justify-end w-full group"
            >
              {/* 连体屋顶视窗 */}
              {plan.topRoofWindow ? (
                <div className={`w-full py-1.5 px-3 rounded-t-xl text-center text-micro font-bold border-t border-x transition-colors duration-150 ${
                  plan.id === 'pro'
                    ? 'bg-brand-soft border-brand-line text-brand'
                    : 'bg-wash-strong border-line-strong text-ink'
                }`}>
                  {plan.topRoofWindow}
                </div>
              ) : (
                <div className="hidden lg:block h-[29px] pointer-events-none" aria-hidden="true" />
              )}

              {/* 卡片主体 */}
              <div
                className={`relative flex flex-col justify-between h-full flex-1 border bg-surface p-5 transition-all duration-200 hover:-translate-y-1 ${
                  plan.topRoofWindow ? 'rounded-b-xl border-t-0' : 'rounded-xl'
                } ${plan.cardBorderClass}`}
              >
                {/* 顶部悬浮徽章 (推荐/旗舰) */}
                {plan.badge && !plan.topRoofWindow && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-micro font-black uppercase tracking-wider shadow-elevation-1 bg-brand text-ink-on-accent">
                    {plan.badge}
                  </div>
                )}

                <div>
                  {/* 标题与折扣标签行 */}
                  <div className="min-h-[58px] flex flex-col justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black tracking-wide text-ink uppercase font-sans">
                        {plan.codeName}
                      </span>
                      <span className="rounded-md border border-line bg-wash-press px-2 py-0.5 text-micro font-bold text-ink">
                        {currentDiscountBadge}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted font-medium truncate">
                      {plan.name}
                    </p>
                  </div>

                  {/* 价格主呈现区 (大字号金额 + 原价划线 + 周期) */}
                  <div className="mt-4 flex items-baseline gap-1.5 flex-wrap min-h-[44px]">
                    <span className="text-3xl sm:text-4xl font-black tracking-tight text-ink font-mono">
                      ¥{currentPrice}
                    </span>
                    {originPrice ? (
                      <span className="text-xs text-ink-subtle line-through font-mono">
                        / 年 ¥{originPrice}
                      </span>
                    ) : null}
                  </div>

                  {/* 算力与价值折算公式区 */}
                  <div className="mt-4 rounded-xl border border-line bg-wash p-3 space-y-1.5 min-h-[96px] flex flex-col justify-between">
                    {/* 行 1: 每月到账算力 + 加赠 */}
                    <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                      <span className="text-amber-400">⚡</span>
                      <span>{plan.creditsMonthly.toLocaleString()} / 月</span>
                      {plan.bonusCredits > 0 && (
                        <span className="text-emerald-400 font-normal">
                          + 🎁 {plan.bonusCredits.toLocaleString()} 首充加赠
                        </span>
                      )}
                    </div>

                    {/* 行 2: 折合月单价与单点折算成本 */}
                    <div className="text-[11px] text-ink-muted">
                      ¥{perMonthPrice} / 月，1 算力 ≈ {unitCost}
                    </div>

                    {/* 行 3: 立即到账与签到权益说明 */}
                    <div className="flex items-center text-[10px] text-ink-subtle">
                      <span>立即获得 {plan.creditsMonthly.toLocaleString()} 算力 + 会员签到赠送</span>
                      <InfoTooltip text="开通后算力全额即时到账；每日签到额外赠送免费创作额度，可在个人资产中心查收。" />
                    </div>
                  </div>

                  {/* 订阅主操作按钮 */}
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan)}
                    disabled={isRechargeOpen && selectedPlanId === plan.id}
                    className={`mt-4 w-full h-11 rounded-full text-xs font-black uppercase tracking-wider transition-[background-color,color,transform] duration-fast ease-standard hover:opacity-90 active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer shadow-elevation-1 flex items-center justify-center gap-1.5 ${plan.btnBgClass}`}
                  >
                    {isRechargeOpen && selectedPlanId === plan.id ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>正在拉起支付...</span>
                      </>
                    ) : (
                      <span>订阅</span>
                    )}
                  </button>

                  {/* 模块一：常用模型折算 */}
                  <div className="mt-5 border-t border-line pt-4 min-h-[148px]">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-ink-muted mb-2.5">
                      <span>常用模型折算</span>
                      <InfoTooltip text="根据当前方案折算成本及模型每秒/每张算力消耗综合测算，实际按真实渲染规格计费。" />
                    </div>

                    <div className="space-y-1.5 text-xs text-ink">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-ink-muted flex items-center gap-1">
                          <span>✦</span> Seedance2.0 pro 720p
                        </span>
                        <span className={`font-mono text-[11px] font-bold ${
                          plan.modelRates.seedancePro.highlight === 'pink'
                            ? 'text-brand'
                            : plan.modelRates.seedancePro.highlight === 'emerald'
                            ? 'text-emerald-400'
                            : 'text-ink'
                        }`}>
                          {plan.modelRates.seedancePro.text}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-ink-muted flex items-center gap-1">
                          <span>✦</span> Seedance 2.5 720p
                        </span>
                        <span className={`font-mono text-[11px] font-bold ${
                          plan.modelRates.seedance25.highlight === 'pink'
                            ? 'text-brand'
                            : plan.modelRates.seedance25.highlight === 'emerald'
                            ? 'text-emerald-400'
                            : 'text-ink'
                        }`}>
                          {plan.modelRates.seedance25.text}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-ink-muted flex items-center gap-1">
                          <span>✦</span> MiniMax H3 Max Turbo
                        </span>
                        <span className={`font-mono text-[11px] font-bold ${
                          plan.modelRates.minimaxH3.highlight === 'pink'
                            ? 'text-brand'
                            : plan.modelRates.minimaxH3.highlight === 'emerald'
                            ? 'text-emerald-400'
                            : 'text-ink'
                        }`}>
                          {plan.modelRates.minimaxH3.text}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-ink-muted flex items-center gap-1">
                          <span>✦</span> 顶级图像 (Flux/SD) 2K
                        </span>
                        <span className={`font-mono text-[11px] font-bold ${
                          plan.modelRates.fluxPro.highlight === 'pink'
                            ? 'text-brand'
                            : plan.modelRates.fluxPro.highlight === 'emerald'
                            ? 'text-emerald-400'
                            : 'text-ink'
                        }`}>
                          {plan.modelRates.fluxPro.text}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 模块二：会员专用模型 */}
                  <div className="mt-5 border-t border-line pt-4 min-h-[196px]">
                    <div className="flex items-center gap-1 text-[11px] font-bold text-ink-muted mb-2.5">
                      <span>会员专用模型</span>
                    </div>

                    <div className="space-y-1.5 text-xs text-ink">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <Check className="size-3 text-emerald-400 shrink-0" />
                          <span>Seedance 2.5</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <Check className="size-3 text-emerald-400 shrink-0" />
                          <span>Seedance2.0 Pro / Fast / mini</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <Check className="size-3 text-emerald-400 shrink-0" />
                          <span>Sora、Kling、Runway 等</span>
                          <InfoTooltip text="支持 Sora 2、Kling 2.0 及 Runway Gen-3 等前沿影视级模型" />
                        </span>
                        <span className="rounded-md border border-line bg-wash-press px-1.5 py-0.5 text-[9px] font-bold text-ink">
                          最低4.2折
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <Check className="size-3 text-emerald-400 shrink-0" />
                          <span>Flux.1 Pro / Midjourney</span>
                        </span>
                        <span className="rounded-md border border-line bg-wash-press px-1.5 py-0.5 text-[9px] font-bold text-ink">
                          最低5折
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <Check className="size-3 text-emerald-400 shrink-0" />
                          <span>MiniMax 音乐 / 高清数字人</span>
                        </span>
                        <span className="rounded-md border border-line bg-wash-press px-1.5 py-0.5 text-[9px] font-bold text-ink">
                          6.4折
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px]">
                          <Check className="size-3 text-emerald-400 shrink-0" />
                          <span>4K 极清超采样 / 商业渲染</span>
                        </span>
                        <span className="rounded-md border border-line bg-wash-press px-1.5 py-0.5 text-[9px] font-bold text-ink">
                          最低5折
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 专属特权标签条 */}
                  {plan.exclusiveFeatures && plan.exclusiveFeatures.length > 0 && (
                    <div className="mt-4 rounded-xl border border-brand-line bg-brand-soft p-2.5 space-y-1.5 min-h-[58px]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand flex items-center gap-1">
                        <Sparkles className="size-3 text-brand" />
                        <span>专属特权</span>
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {plan.exclusiveFeatures.map((key) => {
                          const b = EXCLUSIVE_BENEFITS.find((x) => x.key === key);
                          if (!b) return null;
                          return (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 rounded-md bg-wash-press border border-line px-1.5 py-0.5 text-[9px] font-semibold text-ink"
                            >
                              <span>{b.label}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 更多权益折叠/展开 */}
                  <div className="mt-4 border-t border-line pt-3">
                    <button
                      type="button"
                      onClick={() => toggleMoreFeatures(plan.id)}
                      className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold text-ink-muted hover:text-ink transition-colors cursor-pointer"
                    >
                      <span>更多权益</span>
                      <ChevronDown className={`size-3.5 transition-transform duration-200 ${
                        isMoreOpen ? 'rotate-180 text-brand' : ''
                      }`} />
                    </button>

                    {isMoreOpen && (
                      <ul className="mt-2 space-y-1.5 text-[11px] text-ink leading-relaxed animate-in fade-in duration-150">
                        {plan.moreFeatures.map((f, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <Check className="size-3 text-brand shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* 底部支付保障说明 */}
                <div className="mt-5 border-t border-line pt-3 flex items-center justify-between text-[10px] text-ink-subtle">
                  <span className="flex items-center gap-1">
                    <AlipayIcon className="size-3" />
                    <WeChatPayIcon className="size-3" />
                    <span>即时开通</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="size-3 text-brand" />
                    <span>未成功秒级退</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部常见问题 FAQ 手风琴列表 */}
      <div className="border-t border-line pt-8 mt-4">
        <div className="flex items-center justify-between pb-4">
          <button
            type="button"
            onClick={() => setShowFaq(!showFaq)}
            className="inline-flex items-center gap-2 text-sm font-bold text-ink hover:text-brand transition-colors cursor-pointer group"
          >
            <HelpCircle className="size-4 text-brand group-hover:scale-110 transition-transform" />
            <span>订阅与算力常见问题 (点击{showFaq ? '收起' : '展开查看'})</span>
            {showFaq ? <ChevronUp className="size-4 text-ink-muted" /> : <ChevronDown className="size-4 text-ink-muted" />}
          </button>

          {showFaq && (
            <div className="text-[11px] text-ink-subtle hidden sm:block">
              包含套餐升降档规则、退款保证、商用版权与支付凭证
            </div>
          )}
        </div>

        {showFaq && (
          <div className="space-y-2.5 max-w-4xl mx-auto text-left animate-in fade-in duration-200">
            {(faqConfig?.items || [
              {
                id: 'faq-1',
                order: 1,
                question: '什么是订阅制专属额度？与通用算力有何区别？',
                answer: '订阅额度是每月随会员周期发放的核心资产，享有最高抵扣优先级，当月有效；通用算力永久有效，在月度额度用尽后自动作为备用池抵扣，两者协同保障您的创作不间断。',
              },
              {
                id: 'faq-2',
                order: 2,
                question: '生成失败会扣除我的额度吗？',
                answer: '绝对不会。系统采用两阶段安全预扣机制，因合规拦截或模型超时未完成等非用户原因时，冻结额度将在 1 秒内 100% 自动解冻返还至您的账户。',
              },
              {
                id: 'faq-3',
                order: 3,
                question: '支持哪些支付方式与开票？',
                answer: '全面支持支付宝扫码、微信支付直付及国际信用卡（Visa / MasterCard）。已支付订单可在个人中心“支付凭证”页面预览并下载，企业用户可在个人中心提交开票申请。',
              },
              {
                id: 'faq-4',
                order: 4,
                question: '支持随时变更或取消订阅吗？',
                answer: '由您完全自主控制。您可以随时在个人中心“会员订阅”中查看当前方案、升级档位或管理续费。取消后，已生效周期的全部权益与算力仍可正常使用直至周期届满。',
              },
              {
                id: 'faq-5',
                order: 5,
                question: '订阅后切换套餐，算力及权益会怎么变化？',
                answer: `SupDance 提供灵活的月度、季度与年度订阅方案，每个方案都包含一定数量的算力，可用于图像生成、视频生成、音乐生成与编辑等功能。注：进行档位升级或延长时，暂不支持补差价升级方式，升级支付档位正常价格。具体分为以下六种情况：

(1) 月付套餐：从低档位升级到高档位
• 剩余未使用的算力，会继续为您保留（有效期不变）
• 新的订阅套餐，将从升级付款成功之日起，重新按 31 天计算，积分即刻到账

(2) 季付套餐：从低档位升级到高档位
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的季付订阅套餐，将从升级付款成功之日起，重新按 93 天计算，首月积分即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(3) 年付套餐：从低档位升级到高档位
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月积分即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(4) 同档位套餐：从月付升级为季付
• 剩余未使用的算力，会继续为您保留（有效期不变）
• 新的季付订阅套餐，将从升级付款成功之日起，重新按 93 天计算，积分即刻到账

(5) 同档位套餐：从月付升级为年付
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月积分即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

(6) 同档位套餐：从季付升级为年付
• 订阅新升级套餐前已发放的、剩余未使用的算力，会继续为您保留（有效期不变）
• 新的年付订阅套餐，将从升级付款成功之日起，重新按 365 天计算，首月积分即刻到账
• 退款处理：原低档位套餐中，尚未发放算力月份对应的费用，我们将为您办理退款（原支付路径返还，5-10 个工作日）

温馨提示：如有疑问可随时通过客服渠道或发送邮件至 support@Supdance.com 联系我们。`,
              },
              {
                id: 'faq-6',
                order: 6,
                question: '关于自动续费与取消自动续费？',
                answer: '如果您使用的是周期连续订阅服务，系统将在每个账期届满前 24 小时进行预扣通知或扣款。您可随时在个人中心“会员订阅”中点击关闭自动续费，取消后您当前周期的所有权益与算力仍可正常使用直至周期结束，次期将不再扣款。',
              },
              {
                id: 'faq-7',
                order: 7,
                question: '如何申请退款？',
                answer: '如果您在最近一次付款后未有任何生成行为、权益使用和算力消耗，可在购买后 7 天内申请全额退款。若因系统问题导致生成失败，我们将自动进行相应算力返还。如需申请退款，请发送【您的账号、退款理由】至客服邮箱 support@Supdance.com，审核通过后，退款通常会在 5-10 个工作日内退回原支付方式。',
              },
              {
                id: 'faq-8',
                order: 8,
                question: '我们支持下载支付凭证，以及企业用户的开票服务。',
                answer: '支持。您可以在个人中心“支付凭证”页面预览并下载所有已支付的支付凭证。针对需要财务报销的企业客户，我们提供增值税普通发票与专用发票开具，后台直接录入开票抬头和税号即可快速申请。',
              },
              {
                id: 'faq-9',
                order: 9,
                question: '我在 SupDance 生成的内容归谁所有？',
                answer: '在法律允许的最大范围内，您拥有在 SupDance 上生成的所有内容的所有权。SupDance 不会对用户创作的作品主张任何版权。这意味着您可以自由地发布、下载、分发和商用这些视频及图像。',
              },
              {
                id: 'faq-10',
                order: 10,
                question: '免责声明与联系方式',
                answer: '上述内容仅供参考。SupDance 会根据产品优化与用户体验需要，不断调整功能、价格、订阅方案及算力政策。如出现争议或不一致情况，将以后台系统记录与实际账单数据为准，最终解释权归 SupDance 所有。其他相关细则详见《用户协议》与《隐私政策》。',
              },
            ]).map((faq, idx) => {
              const isExpanded = expandedFaqIds.has(faq.id);
              const displayIndex = faq.order || idx + 1;
              return (
                <div
                  key={faq.id || idx}
                  className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                    isExpanded
                      ? 'border-line-strong bg-raised shadow-elevation-1'
                      : 'border-line bg-well/60 hover:border-line-strong hover:bg-surface'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedFaqIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(faq.id)) next.delete(faq.id);
                        else next.add(faq.id);
                        return next;
                      });
                    }}
                    className="w-full flex items-center justify-between p-4 text-left cursor-pointer group"
                  >
                    <span className="text-xs sm:text-sm font-bold text-ink group-hover:text-brand transition-colors pr-3">
                      {displayIndex}. {faq.question}
                    </span>
                    <ChevronDown
                      className={`size-4 shrink-0 transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 text-brand' : 'text-ink-subtle group-hover:text-ink-muted'
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-line text-xs text-ink-muted leading-relaxed whitespace-pre-wrap animate-in fade-in duration-150">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 底部客服与政策说明小注 */}
            <div className="pt-4 text-center text-[11px] text-ink-subtle">
              <span>如对订阅或开票有任何疑问，请随时联系官方客服：</span>
              <a
                href={`mailto:${faqConfig?.supportEmail || 'support@Supdance.com'}`}
                className="text-brand hover:underline ml-1 font-mono"
              >
                {faqConfig?.supportEmail || 'support@Supdance.com'}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const modalContent = (
    <>
      {/* 收银台开启时隐藏底层弹窗，避免层叠冲突与多层模糊遮盖 */}
      {!isRechargeOpen && (
        isInline ? (
          <div className="w-full py-8 px-3 sm:px-6">
            {contentInner}
          </div>
        ) : (
          <div
            className="fixed inset-0 z-modal overflow-y-auto bg-scrim backdrop-blur-xl p-3 sm:p-6 animate-in fade-in duration-modal ease-enter"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose?.();
            }}
          >
            <div className="min-h-full flex items-start sm:items-center justify-center py-6">
              {contentInner}
            </div>
          </div>
        )
      )}

      {/* 扫码支付收银台 Modal */}
      {isRechargeOpen && (
        <RechargeModal
          isOpen={isRechargeOpen}
          onClose={() => setIsRechargeOpen(false)}
          initialPlanId={selectedPlanId}
          initialBillingCycle={billingCycle}
          autoCheckout={true}
          onPaySuccess={() => {
            setIsRechargeOpen(false);
            onClose?.();
            onSuccess?.();
          }}
        />
      )}

      {/* 统一认证登录弹窗 */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={(loggedInUser) => {
            setShowAuthModal(false);
            setCurrentUser(loggedInUser);
            if (selectedPlanId) {
              setIsRechargeOpen(true);
            }
          }}
        />
      )}
    </>
  );

  if (isInline) {
    return modalContent;
  }

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
