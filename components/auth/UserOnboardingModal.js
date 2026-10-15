'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Check,
  Palette,
  Film,
  Workflow,
  Bot,
  User,
  ArrowRight,
  Loader2,
  Shuffle,
  Copy,
  Coins,
  Camera,
} from 'lucide-react';
import { randomNickname } from '@/lib/onboarding/copy';
import { defaultAvatarAt, defaultAvatarUrl, DEFAULT_AVATAR_COUNT } from '@/lib/onboarding/schema';

// 核心创作领域：对齐 UI_REPAIR_INSTRUCTION 顶级分类导航
const INDUSTRIES = [
  { id: 'media', name: '个人 / 自媒体' },
  { id: 'anime', name: '短漫剧' },
  { id: 'advertising', name: '影视 / 广告' },
  { id: 'game', name: '游戏美术' },
  { id: 'ecommerce', name: '电商视觉' },
  { id: 'free', name: '自由创作' },
];

const SITE_FEATURES = [
  {
    id: 'image',
    name: '图像精绘',
    desc: 'Nano / Flux / SD 顶级画质',
    icon: Palette,
  },
  {
    id: 'video',
    name: 'AI 视频',
    desc: 'Wan 2.1 / Hailuo / Kling 视效',
    icon: Film,
  },
  {
    id: 'workflow',
    name: '商业工作流',
    desc: 'Vibe 画布批量节点自动化',
    icon: Workflow,
  },
  {
    id: 'agent',
    name: 'AI 智能体',
    desc: '创意策划与分镜协同智能体',
    icon: Bot,
  },
];

// 平滑数字滚动动效 Hook (Count-up Animation)
function useCountUp(target, duration = 800) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!target || target <= 0) {
      setCount(0);
      return;
    }
    let startTimestamp = null;
    let frameId;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic: 1 - (1 - progress)^3
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(easeOut * target));
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return count;
}

export default function UserOnboardingModal({ user, onComplete, onClose }) {
  const userNumber = user?.userNumber || (user?.id ? String(user.id).slice(-6) : '888888');
  const initialName = user?.displayName || user?.display_name || user?.name || '';
  const initialAvatar = user?.avatarUrl || user?.avatar || user?.avatar_url || defaultAvatarUrl(userNumber);

  const [displayName, setDisplayName] = useState(initialName || randomNickname('zh-CN'));
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [selectedIndustry, setSelectedIndustry] = useState('media');
  const [selectedFeatures, setSelectedFeatures] = useState(['image', 'video']);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);
  const [error, setError] = useState('');
  const [rewardSuccess, setRewardSuccess] = useState(null); // { rewardCredits: 50, user: ... }
  const fileInputRef = useRef(null);

  const trimmedName = displayName.trim();
  const isNameValid = trimmedName.length >= 2 && trimmedName.length <= 24;

  const targetReward = rewardSuccess?.rewardCredits ?? 50;
  const animatedCredits = useCountUp(rewardSuccess ? targetReward : 0, 800);
  const animatedTotal = 40 + animatedCredits;

  const toggleFeature = (id) => {
    setSelectedFeatures((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((f) => f !== id) : prev) : [...prev, id]
    );
  };

  const handleCopyUid = async () => {
    try {
      await navigator.clipboard.writeText(String(userNumber));
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    } catch {}
  };

  const handleRollName = () => {
    setDisplayName(randomNickname('zh-CN'));
  };

  const handleUploadAvatar = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.avatarUrl) {
        throw new Error(data?.error || '头像上传失败');
      }
      setAvatarUrl(data.avatarUrl);
    } catch (err) {
      setError(err?.message || '头像上传出现异常');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const submitOnboarding = async (isSkipping = false) => {
    if (busy) return;
    setError('');
    setBusy(true);

    try {
      const activeIndustryObj = INDUSTRIES.find((i) => i.id === selectedIndustry);
      const industryName = activeIndustryObj ? activeIndustryObj.name : '个人 / 自媒体';

      const payload = isSkipping
        ? { skip: true }
        : {
            displayName: trimmedName || user?.displayName || `创作者#${userNumber}`,
            avatarUrl: avatarUrl || null,
            industry: industryName,
            occupation: industryName,
            preferences: {
              features: selectedFeatures,
              industryId: selectedIndustry,
            },
          };

      const res = await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || '保存设定失败，请稍后重试');
      }

      const rewardCredits = Number(data?.data?.rewardCredits ?? 50);
      const updatedUser = {
        ...user,
        displayName: payload.displayName || user?.displayName,
        avatarUrl: payload.avatarUrl || avatarUrl,
        onboardingCompleted: true,
      };

      // 展示入驻礼遇成功结算视图
      if (rewardCredits > 0) {
        setRewardSuccess({ rewardCredits, user: updatedUser });
      } else {
        onComplete?.(updatedUser);
      }
    } catch (err) {
      setError(err.message || '网络连接异常，请重试');
    } finally {
      setBusy(false);
    }
  };

  // 视图二：入驻礼遇奖励到账成功视图 (Glass-Stage 算力展台卡)
  if (rewardSuccess) {
    return (
      <div
        className="fixed inset-0 z-modal flex items-center justify-center bg-scrim backdrop-blur-xl p-4 transition-opacity duration-modal ease-enter animate-fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-reward-title"
      >
        <div className="relative w-full max-w-[440px] rounded-2xl border border-line bg-overlay backdrop-blur-2xl p-6 sm:p-8 shadow-elevation-4 text-center text-ink select-none overflow-hidden animate-scale-in">
          {/* 顶部微透环境漫反射高光 */}
          <div
            className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-32 rounded-full pointer-events-none opacity-40 blur-3xl animate-glow-pulse"
            style={{ background: 'radial-gradient(circle, rgba(225,29,116,0.45) 0%, transparent 70%)' }}
          />

          {/* 精密徽章底座 */}
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft border border-brand-line text-brand shadow-elevation-2">
            <Coins className="size-7" />
          </div>

          {/* 标题区（去除任何 emoji 与营销词汇） */}
          <h2 id="onboarding-reward-title" className="mt-4 text-section-title font-bold text-ink tracking-tight">
            新手创作算力已激活
          </h2>
          <p className="mt-1.5 text-caption text-ink-muted">
            专属创作者空间已就绪，算力已注入您的账户
          </p>

          {/* 核心算力展台卡 (Glass-Stage) */}
          <div className="my-5 rounded-xl border border-brand-line/60 bg-gradient-to-b from-brand/10 to-transparent p-5 backdrop-blur-md shadow-elevation-2 relative overflow-hidden">
            {/* 顶部微光发丝线 */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />

            {/* 动态滚动数字 */}
            <div className="flex items-baseline justify-center gap-1.5">
              <span className="font-mono text-4xl font-extrabold text-brand tracking-tight">
                +{animatedCredits}
              </span>
              <span className="text-caption font-semibold text-brand/90">
                算力积分 (Credits)
              </span>
            </div>

            {/* 算力额度清晰拆解 */}
            <div className="mt-3.5 pt-3 border-t border-line-subtle text-caption text-ink-muted flex items-center justify-center gap-1.5">
              <span>基础注册 40</span>
              <span>+</span>
              <span>入驻礼遇 {animatedCredits}</span>
              <span>=</span>
              <span className="text-ink font-mono font-bold">总额度 {animatedTotal} 积分</span>
            </div>

            {/* 算力折算价值徽章 */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-wash px-2.5 py-1 text-micro text-ink-muted">
                <Film className="size-3 text-brand" />
                <span>可免费生成 1 条高清视频</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-wash px-2.5 py-1 text-micro text-ink-muted">
                <Palette className="size-3 text-brand" />
                <span>或 9 张 Flux 高清原画</span>
              </span>
            </div>
          </div>

          {/* 主操作按钮 */}
          <button
            type="button"
            onClick={() => onComplete?.(rewardSuccess.user)}
            className="h-11 w-full rounded-full bg-brand text-body font-semibold text-ink-on-accent transition-[background-color,color,transform] duration-fast ease-standard hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring shadow-elevation-1 cursor-pointer flex items-center justify-center gap-2 group"
          >
            <span>即刻开启 AI 创作</span>
            <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    );
  }

  // 视图一：创作者入驻设定视图
  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-scrim backdrop-blur-xl p-4 transition-opacity duration-modal ease-enter animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-modal-title"
    >
      <div className="relative w-full max-w-[500px] rounded-2xl border border-line bg-overlay backdrop-blur-2xl p-5 sm:p-7 shadow-elevation-4 max-h-[92vh] overflow-y-auto select-none">
        {/* 顶部微透环境漫反射高光 */}
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full pointer-events-none opacity-30 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(225,29,116,0.4) 0%, transparent 70%)' }}
        />

        {/* 跳过 / 关闭按钮 */}
        <button
          type="button"
          onClick={() => submitOnboarding(true)}
          disabled={busy}
          aria-label="跳过并稍后设置"
          className="absolute right-4 top-4 size-8 rounded-full bg-wash hover:bg-surface-raised border border-line-subtle text-ink-muted hover:text-ink active:scale-95 active:duration-instant flex items-center justify-center transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer z-10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
        >
          <X className="size-3.5" />
        </button>

        {/* 顶部标题与整合的 Meta 状态栏 */}
        <div className="mb-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft border border-brand-line text-brand shadow-elevation-1">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 id="onboarding-modal-title" className="text-section-title font-bold text-ink tracking-tight">
                欢迎加入 SupDance 创作者阵列
              </h2>
              <p className="text-caption text-ink-muted mt-0.5">
                完善创作者偏好，一键激活专属创作算力
              </p>
            </div>
          </div>

          {/* 统一整合的 Meta 状态条（吸收并替换原突兀的大绿横幅） */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-subtle bg-wash px-3 py-2 text-micro">
            {/* 创作者专属 UID */}
            <button
              type="button"
              onClick={handleCopyUid}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface-raised px-2.5 py-0.5 font-mono text-ink-muted hover:text-ink hover:border-line active:scale-[0.98] active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer"
              title="点击复制创作者 UID"
            >
              <span>#{userNumber}</span>
              {copiedUid ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3 text-ink-muted" />}
            </button>

            {/* 算力礼遇高光微标签 */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 font-medium text-brand">
              <Coins className="size-3" />
              <span>入驻专属礼遇 +50 算力（激活后达 90 积分）</span>
            </div>
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submitOnboarding(false); }} className="space-y-4">
          {/* 1. 创作者头像选择与上传 */}
          <div>
            <div className="mb-2 flex items-center justify-between text-label font-semibold text-ink">
              <span>创作者头像</span>
              <span className="text-caption text-ink-muted">点击预设或本地上传</span>
            </div>
            <div className="flex items-center gap-3">
              {/* 当前头像预览与本地上传 */}
              <div className="relative shrink-0 group">
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="size-13 rounded-full border-2 border-brand-line bg-well object-cover shadow-elevation-1 transition-transform group-hover:scale-105"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                  aria-label="上传自定义头像"
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin text-ink" />
                  ) : (
                    <Camera className="size-4 text-ink" />
                  )}
                </button>
              </div>

              {/* 8 款精选预设头像微缩选择器 */}
              <div className="flex-1 min-w-0">
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                  {Array.from({ length: DEFAULT_AVATAR_COUNT }, (_, idx) => {
                    const preset = defaultAvatarAt(idx);
                    const isSelected = avatarUrl === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAvatarUrl(preset)}
                        className={`relative aspect-square overflow-hidden rounded-full border transition-[border-color,transform,opacity] duration-fast ease-standard active:scale-95 active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer ${
                          isSelected
                            ? 'border-brand ring-2 ring-brand-ring scale-105 shadow-elevation-1'
                            : 'border-line-subtle hover:border-line opacity-70 hover:opacity-100 hover:scale-105'
                        }`}
                        aria-label={`选择预设头像 ${idx + 1}`}
                      >
                        <img src={preset} alt="" className="size-full object-cover" />
                        {isSelected && (
                          <span className="absolute inset-0 flex items-center justify-center bg-brand/25">
                            <Check className="size-2.5 text-white stroke-[3]" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadAvatar}
              className="hidden"
            />
          </div>

          {/* 2. 创作者昵称输入与随机摇号 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-label font-semibold text-ink">
              <label htmlFor="onboarding-nickname-input" className="flex items-center gap-1.5">
                <User className="size-3.5 text-brand" />
                <span>创作者昵称</span>
              </label>
              <span className={`text-caption font-mono ${isNameValid ? 'text-ink-muted' : 'text-danger'}`}>
                {trimmedName.length}/24
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex h-10 flex-1 items-center rounded-xl border border-line-subtle bg-well px-3.5 transition focus-within:border-brand-line focus-within:ring-1 focus-within:ring-brand-ring">
                <input
                  id="onboarding-nickname-input"
                  type="text"
                  maxLength={24}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="请输入您的创作者昵称 (2-24字符)"
                  className="w-full bg-transparent text-body text-ink placeholder-ink-disabled outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleRollName}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line-subtle bg-wash hover:bg-surface-raised px-3 text-caption font-medium text-ink-muted hover:text-ink active:scale-[0.98] active:duration-instant transition-[background-color,color,border-color,transform] duration-fast ease-standard focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer"
                title="随机生成艺术昵称"
              >
                <Shuffle className="size-3.5 text-brand" />
                <span>随机</span>
              </button>
            </div>
          </div>

          {/* 3. 核心创作领域（严格遵循胶囊圆角与品牌洋红高光规范） */}
          <div>
            <label className="mb-2 block text-label font-semibold text-ink">
              核心创作领域
            </label>
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRIES.map((item) => {
                const isSelected = selectedIndustry === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedIndustry(item.id)}
                    className={`h-7.5 rounded-full px-3 text-caption font-medium transition-[background-color,color,border-color,transform] duration-fast ease-standard active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer ${
                      isSelected
                        ? 'bg-brand text-ink-on-accent font-semibold shadow-elevation-1'
                        : 'border border-line-subtle bg-wash text-ink-muted hover:border-line hover:bg-surface-raised hover:text-ink'
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. 首选创作工作台（2x2 轻量微雕磁贴） */}
          <div>
            <label className="mb-2 block text-label font-semibold text-ink">
              首选创作工作台（可多选）
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SITE_FEATURES.map((feat) => {
                const Icon = feat.icon;
                const active = selectedFeatures.includes(feat.id);
                return (
                  <button
                    key={feat.id}
                    type="button"
                    onClick={() => toggleFeature(feat.id)}
                    className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-[background-color,color,border-color,transform] duration-fast ease-standard active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring cursor-pointer ${
                      active
                        ? 'border-brand-line bg-brand-soft text-ink shadow-elevation-1'
                        : 'border-line-subtle bg-wash text-ink-muted hover:border-line hover:bg-surface-raised hover:text-ink'
                    }`}
                  >
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        active ? 'bg-brand/20 text-brand' : 'bg-surface-raised text-ink-muted'
                      }`}
                    >
                      <Icon className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-card-title text-ink font-semibold truncate">{feat.name}</span>
                        {active && <Check className="size-3 text-brand shrink-0" />}
                      </div>
                      <p className="mt-0.5 truncate text-micro text-ink-muted">{feat.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 异常提示 */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-caption text-red-400 text-center animate-fade-in">
              {error}
            </div>
          )}

          {/* 底部操作区 */}
          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="submit"
              disabled={busy || !isNameValid}
              className="h-11 w-full flex-1 rounded-full bg-brand text-body font-semibold text-ink-on-accent transition-[background-color,color,transform] duration-fast ease-standard hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] active:duration-instant focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shadow-elevation-1 group"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>正在初始化创作者空间…</span>
                </>
              ) : (
                <>
                  <span>完成设定并激活 50 算力</span>
                  <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => submitOnboarding(true)}
              className="h-10 px-4 rounded-full border border-line-subtle text-caption text-ink-muted hover:text-ink hover:bg-wash transition-colors cursor-pointer whitespace-nowrap"
            >
              跳过并直接体验
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
