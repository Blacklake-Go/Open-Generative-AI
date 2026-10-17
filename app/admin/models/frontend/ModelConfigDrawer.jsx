'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Save, Loader2, RefreshCw, CheckCircle2, XCircle,
  Eye, Pin, Star, Sparkles, Check, AlertTriangle, Layers,
  ChevronDown, Search, ArrowRight, ShieldCheck, DollarSign,
  TrendingUp, Percent, Zap, Server, Sliders, Shield
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
  const [channelRoutes, setChannelRoutes] = useState([]);

  // Model Picker for new model
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (isNew) {
      setFormData({
        model_id: '',
        display_name: '',
        pricing_hint: '',
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
        primary_provider: '',
        backup_provider_id: '',
        backup_model_id: '',
        approved_routes: 0,
        healthy_routes: 0,
      });
      setChannelRoutes([]);
      setModelPickerOpen(true);
    } else if (model) {
      const initialCredits = Number(model.base_credits) > 0
        ? Number(model.base_credits)
        : (Number(model.credits_price) > 0 ? Number(model.credits_price) : 10);

      const routesList = Array.isArray(model.routes) ? model.routes : [];
      setChannelRoutes(routesList.map((r) => ({ ...r })));

      const primaryRoute = routesList.find((r) => r.provider_id === model.provider || r.provider_id === model.default_provider) || routesList[0];
      const backupRoute = routesList.find((r) => r.provider_id === model.backup_provider_id);

      setFormData({
        model_id: model.id,
        display_name: model.display_name || model.name || '',
        pricing_hint: model.pricing_hint || (model.capabilities?.pricing_hint) || '',
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
        min_cost_cny: model.min_cost_cny !== undefined && model.min_cost_cny !== null ? Number(model.min_cost_cny) : null,
        min_cost_usd: model.min_cost_usd !== undefined && model.min_cost_usd !== null ? Number(model.min_cost_usd) : null,
        primary_provider: model.provider || model.default_provider || (routesList[0]?.provider_id) || '',
        primary_route_id: primaryRoute?.id || '',
        backup_provider_id: model.backup_provider_id || '',
        backup_route_id: backupRoute?.id || '',
        approved_routes: model.approved_routes ?? routesList.filter((r) => r.review_status === 'approved').length,
        healthy_routes: model.healthy_routes ?? routesList.filter((r) => r.enabled && r.review_status === 'approved').length,
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

  // Margin calculation with real-time recalculation & loss detection
  const marginMetrics = useMemo(() => {
    let costCny = formData.min_cost_cny !== null && formData.min_cost_cny !== undefined ? Number(formData.min_cost_cny) : null;
    if (costCny === null || !Number.isFinite(costCny) || costCny <= 0) {
      const validRouteCosts = channelRoutes
        .map((r) => Number(r.cost_cny))
        .filter((c) => Number.isFinite(c) && c > 0);
      if (validRouteCosts.length > 0) {
        costCny = Math.min(...validRouteCosts);
      }
    }
    const credits = Number(formData.credits || 0);
    const userPriceCny = credits * 0.1; // 1 credit = 0.1 CNY

    if (costCny !== null && costCny > 0 && userPriceCny > 0) {
      const marginCny = userPriceCny - costCny;
      const rate = Number(((marginCny / userPriceCny) * 100).toFixed(1));
      let status = 'healthy';
      if (rate < 0) status = 'loss';
      else if (rate < 30) status = 'low';
      else if (rate >= 30) status = 'healthy';

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
  }, [formData.min_cost_cny, formData.credits, channelRoutes]);

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

  const handleRoutePriorityChange = (routeId, newPriority) => {
    setChannelRoutes((prev) =>
      prev.map((r) => (r.id === routeId ? { ...r, priority: Number(newPriority) } : r))
    );
  };

  const handleCategoryChange = (newCat) => {
    const validSubTypes = SUBTYPE_OPTIONS[newCat] || [];
    const currentSubType = formData.sub_type;
    const isValid = validSubTypes.some((s) => s.id === currentSubType);
    const nextSubType = isValid ? currentSubType : (validSubTypes[0]?.id || '');
    setFormData((f) => {
      const nextDurations = (newCat === 'video' || newCat === 'audio')
        ? ((f.supported_durations && f.supported_durations.length > 0) ? f.supported_durations : [5, 10])
        : f.supported_durations;
      return {
        ...f,
        category: newCat,
        sub_type: nextSubType,
        supported_durations: nextDurations,
      };
    });
  };

  const handleRouteEnabledToggle = (routeId) => {
    setChannelRoutes((prev) =>
      prev.map((r) => (r.id === routeId ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleSetPrimaryRoute = (route) => {
    setFormData((f) => ({
      ...f,
      primary_provider: route.provider_id,
      primary_route_id: route.id,
      backup_provider_id: (f.backup_route_id === route.id || f.backup_provider_id === route.provider_id) ? '' : f.backup_provider_id,
      backup_route_id: f.backup_route_id === route.id ? '' : f.backup_route_id,
    }));
    setChannelRoutes((prev) => {
      const maxPriority = prev.reduce((m, r) => Math.max(m, Number(r.priority) || 0), 0);
      return prev.map((r) => {
        if (r.id === route.id) {
          return {
            ...r,
            priority: Math.max(maxPriority + 10, 60),
            enabled: true,
          };
        }
        return r;
      });
    });
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

    // 计算当前健康可用通道数
    const healthyRoutesCount = channelRoutes.filter(
      (r) => r.enabled && (r.review_status === 'approved' || !r.review_status) && (r.health_status === 'healthy' || !r.health_status)
    ).length;
    const activeHealthyCount = channelRoutes.length > 0 ? healthyRoutesCount : Number(formData.healthy_routes || 0);
    const isZeroRoutes = activeHealthyCount <= 0;

    // 负毛利安全红线拦截与二次确认
    if (marginMetrics.hasData && marginMetrics.status === 'loss') {
      const ok = typeof window === 'undefined' ? true : window.confirm(
        `【⚠️ 赤红负毛利安全警示】当前单次积分定价 (${credits} 积分 ≈ ¥${marginMetrics.userPriceCny}) 低于采购底价 (¥${marginMetrics.costCny})，每笔生成将亏损 ¥${Math.abs(Number(marginMetrics.marginCny)).toFixed(2)}。确定仍要保存吗？`
      );
      if (!ok) return;
    }

    // 0 渠道阻断安全警示与二次确认
    if (isZeroRoutes && formData.is_visible) {
      const ok = typeof window === 'undefined' ? true : window.confirm(
        '【🔴 0 渠道阻断警示】当前模型可用通道数为 0。若开启前台展示，用户下单时将无法成功路由。确定仍要开启展示并保存吗？'
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        category: formData.category,
        sub_type: formData.sub_type,
        primary_provider: formData.primary_provider,
        backup_provider_id: formData.backup_provider_id,
        backup_model_id: formData.backup_model_id,
        channel_routes: channelRoutes,
        supported_ratios: formData.supported_ratios || [],
        supported_resolutions: formData.supported_resolutions || [],
        supported_durations: formData.supported_durations || [],
        capabilities: {
          ...(formData.capabilities || {}),
          pricing_hint: (formData.pricing_hint || '').trim(),
        },
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const previewName = formData.display_name || '模型展示名称';
  const previewBadge = formData.badge || '';
  const previewDesc = formData.description || '超高质感写实，精准理解提示词，极速出图。';
  const previewCredits = formData.credits || 10;
  const activeHealthyCount = channelRoutes.length > 0
    ? channelRoutes.filter((r) => r.enabled && (r.review_status === 'approved' || !r.review_status) && (r.health_status === 'healthy' || !r.health_status)).length
    : Number(formData.healthy_routes || 0);
  const hasZeroRoutes = activeHealthyCount <= 0;

  return (
    <div className="fixed inset-0 z-modal flex justify-end bg-black/75 backdrop-blur-sm animate-fade-in">
      {/* Drawer Container */}
      <div className="relative w-full max-w-3xl xl:w-[820px] bg-[#131519] border-l border-white/10 shadow-[-20px_0_60px_rgba(0,0,0,0.85)] flex flex-col h-full animate-slide-left text-ink">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-[#191c21] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo model={formData} size="md" className="rounded-xl shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-body-lg font-bold text-ink truncate">
                  {isNew ? '引入前台新模型' : `一站式配置 · ${formData.display_name || formData.model_id}`}
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
                disabled={checking || saving}
                className="h-8 text-xs font-mono"
              >
                {checking ? <Loader2 className="size-3 animate-spin mr-1" /> : <RefreshCw className="size-3 mr-1" />}
                模拟路由
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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

        {/* Drawer Body (Scrollable) with disabled fieldset during save */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <fieldset disabled={saving} className={`space-y-6 border-0 p-0 m-0 transition-opacity duration-150 ${saving ? 'opacity-50 pointer-events-none select-none' : ''}`}>
          {/* Section 1: 实时前台卡片效果 1:1 预览 (Studio Live Preview) */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3 shadow-elevation-1">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <span className="text-caption font-semibold text-ink-subtle uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="size-3.5 text-brand" />
                Section 1: 实时前台卡片 1:1 预览 (Studio Dropdown Preview)
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
                    <span className="text-caption text-brand font-semibold font-mono">
                      {formData.pricing_hint ? formData.pricing_hint : `${previewCredits} 积分 / 次`}
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

          {/* Section 2: 采购成本与定价毛利测算器 */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <h3 className="text-body font-bold text-ink flex items-center gap-2">
                <DollarSign className="size-4 text-brand" />
                Section 2: 采购成本与定价毛利测算器
              </h3>
              <span className="text-caption text-ink-subtle font-mono">
                1 积分 = ¥0.10
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Cost Box */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1">
                <span className="text-micro text-ink-subtle uppercase">官方采购底价 (成本)</span>
                <div className="font-mono font-bold text-body-lg text-white">
                  {formData.min_cost_cny !== null && formData.min_cost_cny !== undefined
                    ? `¥${Number(formData.min_cost_cny).toFixed(3)}`
                    : '—'}
                </div>
                <span className="text-[10px] text-ink-muted font-mono block">
                  {formData.min_cost_usd !== null && formData.min_cost_usd !== undefined
                    ? `($${Number(formData.min_cost_usd).toFixed(4)})`
                    : '暂无通道底价'}
                </span>
              </div>

              {/* Price / Credits Input */}
              <div className="rounded-xl border border-brand/30 bg-brand/[0.03] p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-micro text-brand uppercase font-bold">单次积分售价</span>
                  <span className="text-[10px] text-ink-subtle font-mono">C 端售价</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    value={formData.credits ?? ''}
                    onChange={(e) => setFormData((f) => ({ ...f, credits: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-full rounded-lg border border-brand/40 bg-black/50 px-2.5 py-1 text-body font-bold font-mono text-brand outline-none focus:border-brand"
                  />
                  <span className="text-caption font-bold text-brand shrink-0">积分</span>
                </div>
                <span className="text-[10px] text-ink-muted font-mono block">
                  折合: ¥{marginMetrics.userPriceCny} / 次
                </span>
              </div>

              {/* Real-time Profit Margin */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-1">
                <span className="text-micro text-ink-subtle uppercase">实时预估毛利率</span>
                <div className="font-mono font-bold text-body-lg flex items-center gap-1">
                  {marginMetrics.hasData ? (
                    <span className={
                      marginMetrics.status === 'loss' ? 'text-rose-400 font-black'
                        : marginMetrics.status === 'low' ? 'text-amber-400'
                        : 'text-emerald-400'
                    }>
                      {marginMetrics.rate}%
                    </span>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </div>
                <span className="text-[10px] text-ink-muted font-mono block">
                  {marginMetrics.hasData
                    ? `每单利润: ${Number(marginMetrics.marginCny) >= 0 ? '+' : ''}¥${marginMetrics.marginCny}`
                    : '待关联通道成本后计算'}
                </span>
              </div>
            </div>

            {/* Negative Margin Alert / Warning */}
            {marginMetrics.hasData && marginMetrics.status === 'loss' && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2 animate-pulse">
                <AlertTriangle className="size-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">⚠️ 赤红负毛利阻断警告：</span>
                  <span>当前单次积分定价 ({formData.credits} 积分 ≈ ¥{marginMetrics.userPriceCny}) 低于采购底价 (¥{marginMetrics.costCny})，每笔生成将亏损 ¥{Math.abs(Number(marginMetrics.marginCny)).toFixed(2)}。请调高积分定价以防资产流失！</span>
                </div>
              </div>
            )}

            {/* Pricing Hint Input */}
            <div>
              <label className="text-caption text-ink-muted block mb-1">
                前台扣费文案说明 (Pricing Hint)
              </label>
              <input
                type="text"
                value={formData.pricing_hint || ''}
                onChange={(e) => setFormData((f) => ({ ...f, pricing_hint: e.target.value }))}
                placeholder="例如: 🎬 基础 10 算力 (5秒视频) 或 ✨ 旗舰出图 20 积分"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand font-mono"
              />
              <span className="text-[11px] text-ink-subtle mt-1 block">
                展示在 Studio 模型选择器副标题。若留空，前台将默认显示为“{formData.credits || 10} 积分 / 次”。
              </span>
            </div>
          </div>

          {/* Section 3: 就地供应通道与主备快速调度 (Fast Route Switcher) */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
              <h3 className="text-body font-bold text-ink flex items-center gap-2">
                <Zap className="size-4 text-brand" />
                Section 3: 就地供应通道与主备快速调度 (Fast Route Switcher)
              </h3>
              {channelRoutes.filter((r) => r.enabled && r.review_status === 'approved').length > 0 ? (
                <span className="rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-micro font-bold flex items-center gap-1 font-mono">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {channelRoutes.filter((r) => r.enabled && r.review_status === 'approved').length}/{channelRoutes.length} 通道就绪
                </span>
              ) : (
                <span className="rounded-full bg-red-500/15 text-red-400 border border-red-500/30 px-2 py-0.5 text-micro font-bold flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  0 渠道阻断
                </span>
              )}
            </div>

            {/* Channel List Table */}
            {channelRoutes.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/30 overflow-x-auto text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] bg-white/[0.02] text-caption text-ink-muted">
                      <th className="px-3.5 py-2.5 min-w-[200px]">上游供应商</th>
                      <th className="px-3 py-2.5 w-[90px] text-center whitespace-nowrap">状态</th>
                      <th className="px-3 py-2.5 w-[85px] text-right whitespace-nowrap">单价</th>
                      <th className="px-3 py-2.5 w-[75px] text-center whitespace-nowrap">主通道</th>
                      <th className="px-3 py-2.5 w-[85px] text-center whitespace-nowrap">备用通道</th>
                      <th className="px-3 py-2.5 w-[80px] text-center whitespace-nowrap">权重</th>
                      <th className="px-3 py-2.5 w-[65px] text-center whitespace-nowrap">启用</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {channelRoutes.map((route) => {
                      const isPrimary = formData.primary_route_id ? formData.primary_route_id === route.id : formData.primary_provider === route.provider_id;
                      const isBackup = formData.backup_route_id ? formData.backup_route_id === route.id : (Boolean(formData.backup_provider_id) && formData.backup_provider_id === route.provider_id);
                      const isHealthy = route.health_status === 'healthy';

                      return (
                        <tr key={route.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-3.5 py-2.5">
                            <div className="font-semibold text-white break-words" title={route.provider_name || route.provider_id}>
                              {route.provider_name || route.provider_id}
                            </div>
                            <div className="font-mono text-[10px] text-ink-subtle break-all" title={route.provider_model_id}>
                              {route.provider_model_id}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              route.review_status === 'approved' && isHealthy
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-amber-500/15 text-amber-300'
                            }`}>
                              <span className={`size-1.5 rounded-full ${isHealthy ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                              {route.review_status === 'approved' ? '已核准' : '待审核'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-ink whitespace-nowrap">
                            {Number(route.cost_cny) > 0 ? `¥${Number(route.cost_cny).toFixed(3)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <input
                              type="radio"
                              name="primary_provider_radio"
                              checked={isPrimary}
                              onChange={() => handleSetPrimaryRoute(route)}
                              className="size-3.5 accent-brand cursor-pointer"
                              title="设为主通道（提权并确保启用）"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <input
                              type="radio"
                              name="backup_provider_radio"
                              checked={isBackup}
                              onClick={() => {
                                if (isBackup) {
                                  setFormData((f) => ({ ...f, backup_provider_id: '', backup_route_id: '' }));
                                }
                              }}
                              onChange={() => {
                                if (isPrimary) return;
                                setFormData((f) => ({ ...f, backup_provider_id: route.provider_id, backup_route_id: route.id }));
                              }}
                              className="size-3.5 accent-amber-500 cursor-pointer"
                              title={isBackup ? '点击取消备用通道' : '设为备用通道'}
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={route.priority ?? 50}
                              onChange={(e) => handleRoutePriorityChange(route.id, e.target.value)}
                              className="w-14 rounded bg-black/60 border border-white/10 px-1 py-0.5 text-center font-mono text-xs text-ink outline-none focus:border-brand"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={Boolean(route.enabled)}
                              onChange={() => handleRouteEnabledToggle(route.id)}
                              className="size-3.5 accent-brand cursor-pointer"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-center space-y-2">
                <p className="text-caption text-ink-muted">当前模型暂无绑定的上游通道</p>
                {onSmartMatch && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onSmartMatch(model || formData)}
                    className="h-8 text-xs font-semibold text-brand hover:text-white"
                  >
                    <Sparkles className="size-3.5 mr-1 text-brand" />
                    匹配候选上游渠道
                  </Button>
                )}
              </div>
            )}

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
                      去智能匹配中心 →
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

          {/* Section 4: 工作台规格与能力矩阵 */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-4">
            <h3 className="text-body font-bold text-ink flex items-center gap-2">
              <Layers className="size-4 text-brand" />
              Section 4: 工作台规格与能力矩阵 (Capabilities Matrix)
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
                          ? 'bg-brand/10 text-brand border border-brand/20 font-bold'
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

          {/* Section 5: 上下架与运营推荐控制 */}
          <div className="rounded-2xl border border-white/10 bg-surface-raised p-4 space-y-4">
            <h3 className="text-body font-bold text-ink">Section 5: 上下架与运营推荐控制</h3>

            {/* Warning if 0 routes and user activates is_visible */}
            {hasZeroRoutes && formData.is_visible && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">无可用通道警示：</span>
                  <span>当前模型可用通道数为 0。若开启前台展示，用户在 Studio 下单时可能会因缺乏通道而遇阻。建议先行在 Section 3 绑定或匹配可用上游通道。</span>
                </div>
              </div>
            )}

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

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
              <div>
                <label className="text-caption text-ink-muted block mb-1">模型分级 (Tier)</label>
                <select
                  value={formData.tier || 'core'}
                  onChange={(e) => setFormData((f) => ({ ...f, tier: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand"
                >
                  <option value="core">Core (核心主力推荐)</option>
                  <option value="backup">Backup (备用储备池)</option>
                  <option value="experimental">Experimental (实验探索)</option>
                </select>
              </div>

              <div>
                <label className="text-caption text-ink-muted block mb-1">排序权重 (越小越靠前)</label>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={formData.sort ?? 1}
                  onChange={(e) => setFormData((f) => ({ ...f, sort: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand font-mono"
                />
              </div>
            </div>

            {/* Category & Subtype Selection */}
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              <div>
                <label className="text-caption text-ink-muted block mb-1.5">
                  模型分类归属 (Category)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(CATEGORY_MAP).map(([catKey, catLabel]) => {
                    const isSelected = formData.category === catKey;
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => handleCategoryChange(catKey)}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all border text-center ${
                          isSelected
                            ? 'bg-brand/20 border-brand text-brand shadow-elevation-1'
                            : 'bg-black/40 border-white/10 text-ink-muted hover:text-ink hover:bg-white/[0.04]'
                        }`}
                      >
                        {catLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {SUBTYPE_OPTIONS[formData.category]?.length > 0 && (
                <div>
                  <label className="text-caption text-ink-muted block mb-1.5">
                    工作台子场景 (Sub-Type)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {SUBTYPE_OPTIONS[formData.category].map((st) => {
                      const isCur = formData.sub_type === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setFormData((f) => ({ ...f, sub_type: st.id }))}
                          className={`rounded-full px-3 py-1 text-caption transition-all font-mono ${
                            isCur
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold shadow-elevation-1'
                              : 'bg-black/40 border border-white/10 text-ink-muted hover:text-ink'
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* If New Model: Model ID input */}
            {isNew && (
              <div className="pt-2 border-t border-white/[0.06]">
                <label className="text-caption text-ink-muted block mb-1">
                  模型唯一标识符 (Model ID / Slug) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.model_id || ''}
                  onChange={(e) => setFormData((f) => ({ ...f, model_id: e.target.value.toLowerCase().replace(/[^a-z0-9-_.]/g, '') }))}
                  placeholder="例如: seedream-5.0-ultra 或 kling-v2.0"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand font-mono"
                />
              </div>
            )}

            {/* Description & Badge Details */}
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              <div>
                <label className="text-caption text-ink-muted block mb-1">前台展示名称</label>
                <input
                  type="text"
                  value={formData.display_name || ''}
                  onChange={(e) => setFormData((f) => ({ ...f, display_name: e.target.value }))}
                  placeholder="例如: 字节跳动 Seedream 4.5"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand"
                />
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
                  value={formData.badge || ''}
                  onChange={(e) => setFormData((f) => ({ ...f, badge: e.target.value }))}
                  placeholder="或自定义角标文本..."
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-caption text-ink outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-caption text-ink-muted block mb-1">前台能力描述</label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  placeholder="给 C 端用户展示的模型卖点或特性描述..."
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-body-sm text-ink outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>
          </fieldset>
        </div>

        {/* Sticky Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#191c21] flex items-center justify-between shrink-0">
          <div className="text-caption text-ink-muted font-mono">
            ID: <span className="text-white">{formData.model_id || '未设定'}</span>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || !canWrite || (!formData.model_id && isNew)}
              className="bg-brand hover:bg-brand-hover text-white rounded-lg px-4 font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  正在保存...
                </>
              ) : (
                <>
                  <Save className="size-3.5 mr-1.5" />
                  保存一站式配置
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
