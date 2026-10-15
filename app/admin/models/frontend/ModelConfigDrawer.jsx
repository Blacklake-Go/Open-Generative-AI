'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Save, Loader2, RefreshCw, CheckCircle2, XCircle,
  Eye, Pin, Star, Sparkles, Check, AlertTriangle, Layers,
  ChevronDown, Search, ArrowRight, ShieldCheck, DollarSign,
  TrendingUp, Percent, Zap
} from 'lucide-react';
import { Button, StatusBadge } from '@/components/admin/AdminUi';
import BrandLogo from '@/components/admin/BrandLogo';
import { resolveBrand } from '@/lib/modelCenter/brandDictionary.js';

const PRESET_BADGES = ['最新', '经济', '旗舰', '极速', 'New', 'Best', 'Hot', 'Pro', 'Fast', '4.5 旗舰', '3.0', '置顶'];
const PRESET_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3'];
const PRESET_RESOLUTIONS = ['1024x1024', '1280x720', '720x1280', '1920x1080', '1080x1920', '2048x2048', '3840x2160'];
const PRESET_DURATIONS = [3, 5, 10, 15, 30, 60];

const CATEGORY_MAP = {
  image: '图像模型',
  video: '视频模型',
  audio: '音频模型',
  text: '智能体 / 语言',
};

const SUBTYPE_OPTIONS = {
  image: [
    { id: 't2i', label: '文生图 (T2I)' },
    { id: 'i2i', label: '图生图 (I2I)' },
  ],
  video: [
    { id: 't2v', label: '文生视频 (T2V)' },
    { id: 'i2v', label: '图生视频 (I2V)' },
    { id: 'v2v', label: '视频编辑 (V2V)' },
  ],
  audio: [
    { id: 'music', label: '音乐生成' },
    { id: 'tts', label: '语音 (TTS)' },
    { id: 'sfx', label: '音效 (SFX)' },
  ],
  text: [
    { id: 'chat', label: '智能对话' },
    { id: 'reasoning', label: '深度推理' },
  ],
};

export default function ModelConfigDrawer({
  isOpen,
  onClose,
  model,
  isNew = false,
  allModels = [],
  activeCategory = 'image',
  canWrite = false,
  onSave,
  onSmartMatch,
  onRunCheck,
}) {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [inlineCandidates, setInlineCandidates] = useState([]);
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'preview'

  // Model Picker for new model
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerSearch, setModelPickerSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (isNew) {
      setFormData({
        model_id: '',
        display_name: '',
        description: '',
        badge: 'New',
        sub_type: activeCategory === 'image' ? 't2i' : activeCategory === 'video' ? 't2v' : '',
        sort: 1,
        tier: 'core',
        is_featured: false,
        is_pinned: false,
        is_visible: true,
        credits: 50,
        category: activeCategory === 'all' ? 'image' : activeCategory,
        supported_ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        supported_resolutions: ['1024x1024', '1280x720', '720x1280'],
        supported_durations: [5, 10],
        capabilities: {},
        min_cost_cny: null,
        min_cost_usd: null,
      });
      setModelPickerOpen(true);
    } else if (model) {
      const initialCredits = Number(model.base_credits) > 0
        ? Number(model.base_credits)
        : (Number(model.credits_price) > 0 ? Number(model.credits_price) : 10);

      setFormData({
        model_id: model.id,
        display_name: model.display_name || model.name || '',
        description: model.description || '',
        badge: model.badge || '',
        sub_type: model.sub_type || (model.capabilities?.sub_type) || '',
        sort: model.sort ?? 1,
        tier: model.tier || 'core',
        is_featured: Boolean(model.is_featured),
        is_pinned: Boolean(model.is_pinned),
        is_visible: Boolean(model.is_visible),
        credits: initialCredits,
        category: model.category || 'image',
        supported_ratios: Array.isArray(model.supported_ratios) && model.supported_ratios.length > 0
          ? model.supported_ratios
          : ['1:1', '16:9', '9:16', '4:3', '3:4'],
        supported_resolutions: Array.isArray(model.supported_resolutions) && model.supported_resolutions.length > 0
          ? model.supported_resolutions
          : ['1024x1024', '1280x720', '720x1280'],
        supported_durations: Array.isArray(model.supported_durations) && model.supported_durations.length > 0
          ? model.supported_durations
          : [5, 10],
        capabilities: typeof model.capabilities === 'object' && model.capabilities ? model.capabilities : {},
        min_cost_cny: model.min_cost_cny ? Number(model.min_cost_cny) : null,
        min_cost_usd: model.min_cost_usd ? Number(model.min_cost_usd) : null,
        approved_routes: model.approved_routes ?? 0,
        healthy_routes: model.healthy_routes ?? 0,
        provider_ids: model.provider_ids || [],
      });

      // Proactively fetch smart candidates if no routes
      if (!model.approved_routes || Number(model.approved_routes) === 0) {
        fetch('/api/admin/models/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'match_channel_candidates',
            modelId: model.id,
            category: model.category || 'image',
            limit: 3,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (Array.isArray(d.data?.candidates)) {
              setInlineCandidates(d.data.candidates);
            }
          })
          .catch(() => {});
      } else {
        setInlineCandidates([]);
      }
    }
    setCheckResult(null);
  }, [isOpen, isNew, model, activeCategory]);

  const brandInfo = useMemo(() => {
    return resolveBrand(model || { id: formData.model_id, name: formData.display_name });
  }, [model, formData.model_id, formData.display_name]);

  // Margin calculation
  const marginMetrics = useMemo(() => {
    const costCny = formData.min_cost_cny;
    const credits = Number(formData.credits || 0);
    const userPriceCny = credits * 0.1; // 1 credit = 0.1 CNY

    if (costCny !== null && costCny !== undefined && costCny > 0 && userPriceCny > 0) {
      const marginCny = userPriceCny - costCny;
      const rate = Number(((marginCny / userPriceCny) * 100).toFixed(1));
      let status = 'healthy';
      if (rate < 0) status = 'loss';
      else if (rate < 30) status = 'low';
      else if (rate > 50) status = 'high';

      return {
        hasData: true,
        userPriceCny: userPriceCny.toFixed(2),
        costCny: costCny.toFixed(3),
        marginCny: marginCny.toFixed(2),
        rate,
        status,
      };
    }
    return { hasData: false, userPriceCny: userPriceCny.toFixed(2), costCny: '—', rate: null, status: 'unknown' };
  }, [formData.min_cost_cny, formData.credits]);

  const handleRunCheck = async () => {
    const id = formData.model_id;
    if (!id) return;
    setChecking(true);
    setCheckResult(null);
    try {
      if (onRunCheck) {
        const res = await onRunCheck(id);
        setCheckResult(res);
      } else {
        const res = await fetch('/api/admin/models/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'simulate', modelId: id }),
        });
        const d = await res.json();
        if (res.ok && !d.data?.simulation?.blocked) {
          setCheckResult({ ok: true, msg: `路由通畅：选中 ${d.data?.simulation?.selectedProviderId || '已就绪'}` });
        } else {
          setCheckResult({ ok: false, msg: d.data?.simulation?.selectionReason || '当前无可用路由通道' });
        }
      }
    } catch (err) {
      setCheckResult({ ok: false, msg: `检测失败: ${err.message}` });
    } finally {
      setChecking(false);
    }
  };

  const handleSave = async () => {
    if (!canWrite) return;
    const targetId = formData.model_id;
    if (!targetId) return;

    const credits = Number(formData.credits);
    if (!Number.isInteger(credits) || credits <= 0) {
      alert('单次生成积分必须为大于0的正整数');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const previewName = formData.display_name || '模型展示名称';
  const previewBadge = formData.badge || 'New';
  const previewDesc = formData.description || '超高质感写实，精准理解提示词，极速出图。';
  const previewCredits = formData.credits || 10;

  return (
    <div className="fixed inset-0 z-modal flex justify-end bg-black/75 backdrop-blur-sm animate-fade-in">
      {/* Drawer Container */}
      <div className="relative w-full max-w-2xl bg-[#131519] border-l border-white/10 shadow-[-20px_0_60px_rgba(0,0,0,0.85)] flex flex-col h-full animate-slide-left text-ink">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-[#191c21] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo model={formData} size="md" className="rounded-xl shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-body-lg font-bold text-ink truncate">
                  {isNew ? '添加前台展示模型' : `配置模型 · ${formData.display_name || formData.model_id}`}
                </h2>
                <span className="rounded-full bg-brand/15 text-brand px-2 py-0.2 text-[10px] font-bold border border-brand/30">
                  {brandInfo.shortName}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 font-mono text-caption text-ink-subtle">
                <span>ID: {formData.model_id || '未绑定'}</span>
                <span>·</span>
                <span>分类: {CATEGORY_MAP[formData.category] || formData.category}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isNew && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRunCheck}
                disabled={checking}
                className="h-8 text-xs font-mono"
              >
                {checking ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
                模拟路由
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-white/[0.08] transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Check Result Alert */}
        {checkResult && (
          <div className={`px-5 py-2.5 border-b text-caption flex items-center gap-2 ${
            checkResult.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          }`}>
            {checkResult.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
            <span className="font-medium">{checkResult.msg}</span>
          </div>
        )}

        {/* Drawer Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {/* Section 1: 实时前台卡片效果预览 (Studio Live Preview) */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3 shadow-elevation-1">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span className="text-caption font-semibold text-ink-subtle uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="size-3.5 text-brand" />
                前台卡片效果实时预览 (Studio Preview)
              </span>
              <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.2 text-[10px] text-ink-muted">
                1:1 还原 C 端体验
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#16181d] p-3.5 shadow-elevation-1 transition-all hover:border-brand/40">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-xl border border-white/10 flex items-center justify-center bg-brand/10 text-brand font-black text-sm shrink-0">
                  {previewName.charAt(0) || 'M'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-bold text-ink truncate">{previewName}</span>
                    {previewBadge && (
                      <span className="rounded-full bg-brand/20 text-brand px-2 py-0.2 text-[10px] font-bold border border-brand/30">
                        {previewBadge}
                      </span>
                    )}
                    {formData.is_pinned && (
                      <span className="rounded-full bg-amber-500/20 text-amber-300 px-1.5 py-0.2 text-[9px] font-bold border border-amber-500/30 flex items-center gap-0.5">
                        <Pin className="size-2 fill-amber-300" /> 置顶
                      </span>
                    )}
                    {formData.is_featured && (
                      <span className="rounded-full bg-yellow-500/20 text-yellow-300 px-1.5 py-0.2 text-[9px] font-bold border border-yellow-500/30 flex items-center gap-0.5">
                        <Star className="size-2 fill-yellow-300" /> 推荐
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-caption text-ink-subtle font-mono text-[11px]">
                      {formData.sub_type ? formData.sub_type.toUpperCase() : 'AI MODEL'}
                    </span>
                    <span className="text-ink-subtle">·</span>
                    <span className="text-caption text-cyan-400 font-semibold font-mono">
                      {previewCredits} 积分 / 次
                    </span>
                    {marginMetrics.hasData && (
                      <span className="text-[10px] text-ink-muted">
                        (≈ ¥{marginMetrics.userPriceCny})
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-caption text-ink-muted leading-relaxed line-clamp-2">
                    {previewDesc}
                  </p>
                </div>
                <div className="size-5 rounded-full bg-brand flex items-center justify-center text-white shrink-0 shadow-elevation-1">
                  <Check className="size-3 stroke-[3]" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: 渠道与可用性 (打通模型API) */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-body font-bold text-ink flex items-center gap-2">
                <Zap className="size-4 text-brand" />
                可用渠道与路由健康
              </h3>
              {formData.healthy_routes > 0 ? (
                <span className="rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-micro font-bold flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {formData.healthy_routes}/{formData.approved_routes} 已审可用
                </span>
              ) : (
                <span className="rounded-full bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 text-micro font-bold flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  无可用渠道
                </span>
              )}
            </div>

            {/* Smart Match recommendations if unrouted */}
            {inlineCandidates.length > 0 && (
              <div className="rounded-xl border border-brand/30 bg-brand/[0.04] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand flex items-center gap-1">
                    <Sparkles className="size-3.5" /> 智能备选渠道推荐
                  </span>
                  {onSmartMatch && (
                    <button
                      type="button"
                      onClick={() => onSmartMatch(model || formData)}
                      className="text-micro text-brand hover:underline font-medium"
                    >
                      匹配中心 →
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {inlineCandidates.slice(0, 2).map((cand, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-black/40 border border-white/5 p-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white truncate">{cand.providerName || cand.providerId}</div>
                        <div className="font-mono text-[10px] text-gray-400 truncate">{cand.providerModelId}</div>
                      </div>
                      <span className="rounded bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 text-[10px] font-bold shrink-0 ml-2">
                        匹配度 {Math.round(cand.confidence * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: 采购成本与定价策略 (打通模型定价与毛利率) */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-4">
            <h3 className="text-body font-bold text-ink flex items-center gap-2">
              <DollarSign className="size-4 text-cyan-400" />
              采购成本与定价测算
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Cost Box */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1">
                <span className="text-micro text-ink-subtle uppercase">采购底价 (成本)</span>
                <div className="font-mono font-bold text-body-lg text-white">
                  {formData.min_cost_cny !== null ? `¥${Number(formData.min_cost_cny).toFixed(3)}` : '—'}
                </div>
                <span className="text-[10px] text-ink-muted font-mono block">
                  {formData.min_cost_usd !== null ? `($${Number(formData.min_cost_usd).toFixed(3)})` : '暂无通道底价'}
                </span>
              </div>

              {/* Price / Credits Input */}
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/[0.03] p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-micro text-cyan-300 uppercase font-bold">单次生成积分</span>
                  <span className="text-[10px] text-ink-subtle font-mono">1积分=0.1元</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={formData.credits ?? ''}
                    onChange={(e) => setFormData((f) => ({ ...f, credits: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-full rounded-lg border border-cyan-500/40 bg-black/50 px-2.5 py-1 text-body font-bold font-mono text-cyan-300 outline-none focus:border-cyan-400"
                  />
                  <span className="text-caption font-bold text-cyan-400 shrink-0">积分</span>
                </div>
                <span className="text-[10px] text-ink-muted font-mono block">
                  折合 C 端售价: ¥{marginMetrics.userPriceCny}
                </span>
              </div>

              {/* Real-time Profit Margin */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1">
                <span className="text-micro text-ink-subtle uppercase">预估毛利率</span>
                <div className="font-mono font-bold text-body-lg flex items-center gap-1">
                  {marginMetrics.hasData ? (
                    <span className={
                      marginMetrics.status === 'high' ? 'text-emerald-400'
                        : marginMetrics.status === 'healthy' ? 'text-cyan-400'
                        : marginMetrics.status === 'low' ? 'text-amber-400'
                        : 'text-red-400 animate-pulse'
                    }>
                      {marginMetrics.rate}%
                    </span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </div>
                <span className="text-[10px] text-ink-muted font-mono block">
                  {marginMetrics.hasData
                    ? `每单利润: +¥${marginMetrics.marginCny}`
                    : '待关联通道成本后计算'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: 基础展示配置 */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-4">
            <h3 className="text-body font-bold text-ink">基础展示信息</h3>

            <div className="space-y-3">
              <div>
                <label className="text-caption text-ink-muted block mb-1">前台展示名称</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="例如: 字节跳动 Seedream 4.0"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-caption text-ink-muted block mb-1">子类型归属 (场景)</label>
                  <select
                    value={formData.sub_type}
                    onChange={(e) => setFormData((f) => ({ ...f, sub_type: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand"
                  >
                    <option value="">未指定 (通用)</option>
                    {(SUBTYPE_OPTIONS[formData.category] || []).map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-caption text-ink-muted block mb-1">排序权重 (越小越靠前)</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={formData.sort ?? 1}
                    onChange={(e) => setFormData((f) => ({ ...f, sort: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand font-mono"
                  />
                </div>
              </div>

              {/* Badge Selection */}
              <div>
                <label className="text-caption text-ink-muted block mb-1.5">运营角标</label>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {PRESET_BADGES.map((b) => {
                    const isCur = formData.badge === b;
                    return (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setFormData((f) => ({ ...f, badge: isCur ? '' : b }))}
                        className={`rounded-full px-2.5 py-1 text-caption transition-all ${
                          isCur
                            ? 'bg-brand text-white shadow-elevation-1 font-bold'
                            : 'bg-black/40 border border-white/10 text-ink-muted hover:text-ink'
                        }`}
                      >
                        {b}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={formData.badge}
                  onChange={(e) => setFormData((f) => ({ ...f, badge: e.target.value }))}
                  placeholder="或自定义微章文本..."
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-caption text-ink outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-caption text-ink-muted block mb-1">前台能力描述</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  placeholder="给 C 端用户展示的模型核心卖点或特性描述..."
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>

          {/* Section 5: 模型能力与参数矩阵 (Capabilities Matrix) */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-4">
            <h3 className="text-body font-bold text-ink flex items-center gap-2">
              <Layers className="size-4 text-brand" />
              能力与参数矩阵 (Capabilities Matrix)
            </h3>

            {/* Supported Ratios */}
            <div className="space-y-1.5">
              <span className="text-caption text-ink-muted block">支持画幅比例 (点击切换可选比例)</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_RATIOS.map((ratio) => {
                  const isSelected = (formData.supported_ratios || []).includes(ratio);
                  return (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => {
                        const cur = formData.supported_ratios || [];
                        const next = isSelected ? cur.filter((r) => r !== ratio) : [...cur, ratio];
                        setFormData((f) => ({ ...f, supported_ratios: next }));
                      }}
                      className={`rounded-full px-2.5 py-0.5 text-caption font-mono transition-all ${
                        isSelected
                          ? 'bg-brand text-white font-bold shadow-elevation-1'
                          : 'bg-black/40 border border-white/10 text-ink-muted hover:text-ink'
                      }`}
                    >
                      {ratio}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Supported Resolutions */}
            <div className="space-y-1.5">
              <span className="text-caption text-ink-muted block">支持分辨率规格</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_RESOLUTIONS.map((res) => {
                  const isSelected = (formData.supported_resolutions || []).includes(res);
                  return (
                    <button
                      key={res}
                      type="button"
                      onClick={() => {
                        const cur = formData.supported_resolutions || [];
                        const next = isSelected ? cur.filter((r) => r !== res) : [...cur, res];
                        setFormData((f) => ({ ...f, supported_resolutions: next }));
                      }}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-mono transition-all ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                          : 'bg-black/40 border border-white/10 text-ink-muted hover:text-ink'
                      }`}
                    >
                      {res}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Supported Durations (video or audio) */}
            {(formData.category === 'video' || formData.category === 'audio') && (
              <div className="space-y-1.5">
                <span className="text-caption text-ink-muted block">可选生成时长 (秒)</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_DURATIONS.map((dur) => {
                    const isSelected = (formData.supported_durations || []).includes(dur);
                    return (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => {
                          const cur = formData.supported_durations || [];
                          const next = isSelected ? cur.filter((d) => d !== dur) : [...cur, dur];
                          setFormData((f) => ({ ...f, supported_durations: next }));
                        }}
                        className={`rounded-full px-2.5 py-0.5 text-caption font-mono transition-all ${
                          isSelected
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                            : 'bg-black/40 border border-white/10 text-ink-muted hover:text-ink'
                        }`}
                      >
                        {dur}s
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Feature Flags */}
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/[0.06]">
              <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(formData.capabilities?.hires_fix)}
                  onChange={(e) => setFormData((f) => ({
                    ...f,
                    capabilities: { ...(f.capabilities || {}), hires_fix: e.target.checked }
                  }))}
                  className="rounded size-3.5 accent-brand"
                />
                <span>高清修复 (Hires Fix)</span>
              </label>

              <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(formData.capabilities?.seed_control !== false)}
                  onChange={(e) => setFormData((f) => ({
                    ...f,
                    capabilities: { ...(f.capabilities || {}), seed_control: e.target.checked }
                  }))}
                  className="rounded size-3.5 accent-brand"
                />
                <span>支持指定种子 (Seed)</span>
              </label>

              <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(formData.capabilities?.camera_control)}
                  onChange={(e) => setFormData((f) => ({
                    ...f,
                    capabilities: { ...(f.capabilities || {}), camera_control: e.target.checked }
                  }))}
                  className="rounded size-3.5 accent-brand"
                />
                <span>运镜与控制 (Camera Control)</span>
              </label>
            </div>
          </div>

          {/* Section 6: 上架与展示开关 */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-3">
            <h3 className="text-body font-bold text-ink">展示控制与推荐</h3>
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(formData.is_visible)}
                  onChange={(e) => setFormData((f) => ({ ...f, is_visible: e.target.checked }))}
                  className="rounded accent-brand size-4"
                />
                <span className="font-semibold text-brand">在前台模型库展示 (is_visible)</span>
              </label>

              <label className="flex items-center gap-2 text-body-sm text-amber-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(formData.is_pinned)}
                  onChange={(e) => setFormData((f) => ({ ...f, is_pinned: e.target.checked }))}
                  className="rounded accent-amber-500 size-4"
                />
                <Pin className="size-3.5 fill-amber-300" />
                <span>前台列表置顶 📌</span>
              </label>

              <label className="flex items-center gap-2 text-body-sm text-yellow-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(formData.is_featured)}
                  onChange={(e) => setFormData((f) => ({ ...f, is_featured: e.target.checked }))}
                  className="rounded accent-yellow-500 size-4"
                />
                <Star className="size-3.5 fill-yellow-300" />
                <span>标记为推荐 ⭐</span>
              </label>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#191c21] flex items-center justify-between shrink-0">
          <div className="text-caption text-ink-muted font-mono">
            ID: <span className="text-white">{formData.model_id}</span>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || !canWrite}
              className="bg-brand hover:bg-brand-hover text-white rounded-lg px-4"
            >
              {saving ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Save className="size-3.5 mr-1.5" />}
              保存展示配置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
