'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Eye, EyeOff, Search, ChevronDown, ChevronUp,
  X, Save, Loader2, Layers, Pin, Sparkles, Filter,
  Check, ShieldCheck, Zap, DollarSign, Plus, Copy,
  CheckCircle2, ArrowRight, ExternalLink, RefreshCw
} from 'lucide-react';
import { Card, Button } from '@/components/admin/AdminUi';
import ModelRepositoryDrawer from './ModelRepositoryDrawer';
import StudioLivePreviewer from './StudioLivePreviewer';
import UnroutedConfirmModal from './UnroutedConfirmModal';
import SmartMatchModal from './SmartMatchModal';
import ModelHygieneDrawer from './ModelHygieneDrawer';
import ModelConfigDrawer from './ModelConfigDrawer';
import BrandLogo from '@/components/admin/BrandLogo';
import { BRANDS, resolveBrand } from '@/lib/modelCenter/brandDictionary.js';

// ─── 任务场景定义 (严格对照草稿图4第3行绿色模块) ──────────────────────
const TASK_SCENES = [
  { id: 'all', label: '全部场景', desc: '全库所有模型' },
  { id: 't2i', label: '文生图', desc: '文本描述生成高质量图像' },
  { id: 'i2i', label: '图生图', desc: '参考图片风格与结构变体生成' },
  { id: 't2v', label: '文生视频', desc: '提示词直接驱动动态视频' },
  { id: 'i2v', label: '图生视频', desc: '首帧/参考图生成高帧率视频' },
  { id: 'v2v', label: '视频编辑', desc: '视频换装、风格重绘与转绘' },
  { id: 'audio', label: '音乐 / 语音', desc: '全能 AI 编曲与拟真 TTS 语音' },
];

function getModelSceneLabel(model) {
  const cat = String(model.category || '').toLowerCase();
  const sub = String(model.sub_type || model.capabilities?.sub_type || '').toLowerCase();
  const name = String(model.display_name || model.name || '').toLowerCase();
  const id = String(model.id || '').toLowerCase();

  if (cat === 'audio') {
    if (sub === 'tts' || name.includes('语音') || name.includes('tts')) return '语音 (TTS)';
    return '音乐生成';
  }
  if (cat === 'image_edit' || sub === 'i2i' || id.includes('i2i') || name.includes('图生图')) {
    return '图生图';
  }
  if (cat === 'image') {
    return '文生图';
  }
  if (sub === 'v2v' || id.includes('v2v') || name.includes('编辑')) {
    return '视频编辑';
  }
  if (cat === 'video_image' || sub === 'i2v' || id.includes('i2v') || name.includes('图生视频')) {
    return '图生视频';
  }
  if (cat === 'video') {
    return '文生视频';
  }
  return '通用场景';
}

function matchesScene(model, sceneId) {
  if (!sceneId || sceneId === 'all') return true;
  const cat = String(model.category || '').toLowerCase();
  const sub = String(model.sub_type || model.capabilities?.sub_type || '').toLowerCase();
  const name = String(model.display_name || model.name || '').toLowerCase();
  const id = String(model.id || '').toLowerCase();

  if (sceneId === 't2i') {
    return cat === 'image' && sub !== 'i2i';
  }
  if (sceneId === 'i2i') {
    return cat === 'image_edit' || sub === 'i2i' || id.includes('i2i') || name.includes('图生图') || (cat === 'image' && Boolean(model.capabilities?.supports_image_input));
  }
  if (sceneId === 't2v') {
    return cat === 'video' && sub !== 'i2v' && sub !== 'v2v';
  }
  if (sceneId === 'i2v') {
    return cat === 'video_image' || sub === 'i2v' || id.includes('i2v') || name.includes('图生视频') || (cat === 'video' && Boolean(model.capabilities?.supports_first_frame));
  }
  if (sceneId === 'v2v') {
    return sub === 'v2v' || id.includes('v2v') || name.includes('编辑');
  }
  if (sceneId === 'audio') {
    return cat === 'audio';
  }
  return true;
}

export default function FrontendConfigClient({ initialModels = [], canWrite }) {
  const [models, setModels] = useState(initialModels);
  const [publicDirectory, setPublicDirectory] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState('all'); // 'all' | brand.id
  const [activeScene, setActiveScene] = useState('all'); // 'all' | 't2i' | 'i2i' | 't2v' | 'i2v' | 'v2v' | 'audio'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'visible' | 'hidden'
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Deep Config Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerModel, setDrawerModel] = useState(null);
  const [isDrawerNew, setIsDrawerNew] = useState(false);

  // Quick Price Modal State
  const [quickPriceModal, setQuickPriceModal] = useState(null); // { model, credits }
  const [quickPriceInput, setQuickPriceInput] = useState('');
  const [savingQuickPrice, setSavingQuickPrice] = useState(false);

  // Operational Drawers & Modals
  const [repoDrawerOpen, setRepoDrawerOpen] = useState(false);
  const [previewerOpen, setPreviewerOpen] = useState(false);
  const [hygieneDrawerOpen, setHygieneDrawerOpen] = useState(false);
  const [smartMatchOpen, setSmartMatchOpen] = useState(false);
  const [smartMatchTargetModel, setSmartMatchTargetModel] = useState(null);
  const [unroutedConfirmModel, setUnroutedConfirmModel] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refreshPublicDirectory = useCallback(async () => {
    try {
      const response = await fetch('/api/models/active?nocache=1', { cache: 'no-store' });
      if (!response.ok) throw new Error('公开目录暂不可读取');
      const body = await response.json();
      if (!Array.isArray(body.models)) throw new Error('公开目录格式无效');
      setPublicDirectory(new Map(body.models.map((model) => [String(model.id), model])));
    } catch {
      setPublicDirectory(null);
    }
  }, []);

  useEffect(() => {
    refreshPublicDirectory();
  }, [refreshPublicDirectory]);

  // 通用 API 调用
  const callAPI = useCallback(async (body) => {
    const res = await fetch('/api/admin/models/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || '操作失败');
    }
    return data;
  }, []);

  // 厂商统计 & 过滤项列表 (排序按模型数量递减)
  const brandStats = useMemo(() => {
    const counts = {};
    models.forEach((m) => {
      const b = resolveBrand(m);
      if (b && b.id) {
        counts[b.id] = (counts[b.id] || 0) + 1;
      }
    });
    return counts;
  }, [models]);

  const activeBrands = useMemo(() => {
    return BRANDS.filter((b) => (brandStats[b.id] || 0) > 0)
      .sort((a, b) => (brandStats[b.id] || 0) - (brandStats[a.id] || 0));
  }, [brandStats]);

  // 场景统计
  const sceneCounts = useMemo(() => {
    const counts = {};
    const brandScoped = selectedBrand === 'all'
      ? models
      : models.filter((m) => resolveBrand(m)?.id === selectedBrand);

    TASK_SCENES.forEach((scene) => {
      counts[scene.id] = brandScoped.filter((m) => matchesScene(m, scene.id)).length;
    });
    return counts;
  }, [models, selectedBrand]);

  // 切换品牌时，若当前场景无该品牌模型，则智能重置为 'all'，杜绝 0 模型困惑
  const handleBrandSelect = useCallback((brandId) => {
    setSelectedBrand(brandId);
    if (brandId !== 'all' && activeScene !== 'all') {
      const brandModels = models.filter((m) => resolveBrand(m)?.id === brandId);
      const hasInScene = brandModels.some((m) => matchesScene(m, activeScene));
      if (!hasInScene) {
        setActiveScene('all');
      }
    }
  }, [models, activeScene]);

  // 计算单模型预估毛利率
  const computeModelMargin = useCallback((model, overrideCredits = null) => {
    const costCny = model.min_cost_cny !== null && model.min_cost_cny !== undefined ? Number(model.min_cost_cny) : null;
    const credits = overrideCredits !== null ? overrideCredits : Number(model.base_credits || 0);
    const userPriceCny = credits * 0.1; // 1 credit = 0.1 CNY

    if (costCny !== null && costCny > 0 && userPriceCny > 0) {
      const marginCny = userPriceCny - costCny;
      const rate = Number(((marginCny / userPriceCny) * 100).toFixed(1));
      let status = 'healthy';
      if (rate < 0) status = 'loss';
      else if (rate < 30) status = 'low';
      else if (rate >= 40) status = 'high';

      return {
        hasData: true,
        costCny: costCny.toFixed(3),
        userPriceCny: userPriceCny.toFixed(2),
        marginCny: marginCny.toFixed(2),
        rate,
        status,
      };
    }
    return {
      hasData: false,
      costCny: null,
      userPriceCny: userPriceCny.toFixed(2),
      marginCny: null,
      rate: null,
      status: 'unknown',
    };
  }, []);

  // 最终过滤后的模型列表
  const currentModels = useMemo(() => {
    let list = models;

    // 1. 厂商筛选
    if (selectedBrand !== 'all') {
      list = list.filter((m) => resolveBrand(m)?.id === selectedBrand);
    }

    // 2. 任务场景筛选
    if (activeScene !== 'all') {
      list = list.filter((m) => matchesScene(m, activeScene));
    }

    // 3. 展示状态筛选
    if (statusFilter === 'visible') {
      list = list.filter((m) => Boolean(m.is_visible));
    } else if (statusFilter === 'hidden') {
      list = list.filter((m) => !m.is_visible);
    }

    // 4. 关键词搜索
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          (m.display_name || m.name || '').toLowerCase().includes(q) ||
          (m.id || '').toLowerCase().includes(q) ||
          resolveBrand(m)?.shortName.toLowerCase().includes(q)
      );
    }

    // 排序: 置顶优先 -> 展示优先 -> sort -> created_at
    return list.sort((a, b) => {
      const aPinned = Boolean(a.is_pinned);
      const bPinned = Boolean(b.is_pinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const aVis = Boolean(a.is_visible);
      const bVis = Boolean(b.is_visible);
      if (aVis !== bVis) return aVis ? -1 : 1;

      if ((a.sort ?? 0) !== (b.sort ?? 0)) return (a.sort ?? 0) - (b.sort ?? 0);
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }, [models, selectedBrand, activeScene, statusFilter, search]);

  // 前台展示开关切换
  const toggleVisibility = useCallback(
    async (model) => {
      if (!canWrite) return;
      const newVisible = !model.is_visible;
      const previous = [...models];
      setSaving(model.id);

      setModels((prev) =>
        prev.map((m) =>
          m.id === model.id
            ? {
                ...m,
                is_visible: newVisible,
                ...(newVisible ? { auto_route_eligible: true, status: 'active', tier: 'core' } : {}),
              }
            : m
        )
      );

      try {
        await callAPI({
          action: 'update_model_tiering',
          modelId: model.id,
          isVisible: newVisible,
          autoRouteEligible: newVisible ? true : undefined,
          isActive: newVisible ? true : undefined,
          tier: newVisible ? 'core' : undefined,
        });
        showToast(`${model.display_name || model.name} 已${newVisible ? '开启前台展示' : '关闭前台展示'}`);
        refreshPublicDirectory();
      } catch (err) {
        setModels(previous);
        showToast(err.message, 'error');
      } finally {
        setSaving(null);
      }
    },
    [canWrite, models, callAPI, showToast, refreshPublicDirectory]
  );

  // 置顶切换
  const togglePinned = useCallback(
    async (model) => {
      if (!canWrite) return;
      const newPinned = !model.is_pinned;
      const previous = [...models];
      setSaving(model.id);
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, is_pinned: newPinned } : m)));
      try {
        await callAPI({ action: 'update_model_tiering', modelId: model.id, isPinned: newPinned });
        showToast(`${model.display_name || model.name} ${newPinned ? '已置顶到首位 📌' : '已取消置顶'}`);
      } catch (err) {
        setModels(previous);
        showToast(err.message, 'error');
      } finally {
        setSaving(null);
      }
    },
    [canWrite, models, callAPI, showToast]
  );

  // 排序上移下移
  const moveModel = useCallback(
    async (model, direction) => {
      if (!canWrite) return;
      const currentList = currentModels;
      const idx = currentList.findIndex((m) => m.id === model.id);
      if (idx < 0) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentList.length) return;

      const targetModel = currentList[targetIdx];
      const oldSortA = model.sort ?? idx + 1;
      const oldSortB = targetModel.sort ?? targetIdx + 1;
      const newSortA = oldSortB;
      const newSortB = oldSortA === oldSortB ? (direction === 'up' ? oldSortA - 1 : oldSortA + 1) : oldSortA;

      const previous = [...models];
      setModels((prev) =>
        prev.map((m) => {
          if (m.id === model.id) return { ...m, sort: newSortA };
          if (m.id === targetModel.id) return { ...m, sort: newSortB };
          return m;
        })
      );

      try {
        await callAPI({
          action: 'bulk_update_sort',
          items: [
            { modelId: model.id, sort: newSortA },
            { modelId: targetModel.id, sort: newSortB },
          ],
        });
        showToast('排序调整已保存 ✓');
      } catch (err) {
        setModels(previous);
        showToast(`排序调整失败: ${err.message}`, 'error');
      }
    },
    [canWrite, currentModels, models, callAPI, showToast]
  );

  // 复制模型 ID
  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    showToast(`已复制模型 ID: ${id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // 打开右侧高级配置抽屉
  const startEdit = useCallback((model) => {
    setDrawerModel(model);
    setIsDrawerNew(false);
    setDrawerOpen(true);
  }, []);

  // 抽屉保存
  const handleDrawerSave = useCallback(
    async (formData) => {
      if (!canWrite) return;
      const targetId = formData.model_id;
      if (!targetId) return;

      const isVisible = formData.is_visible !== undefined ? formData.is_visible : true;
      const creditsPrice = Number(formData.credits);

      setSaving(targetId);
      try {
        await callAPI({
          action: 'update_model_tiering',
          modelId: targetId,
          displayName: formData.display_name,
          description: formData.description,
          badge: formData.badge || '',
          subType: formData.sub_type || '',
          sort: Number(formData.sort),
          tier: formData.tier || (isVisible ? 'core' : 'backup'),
          isFeatured: formData.is_featured,
          isPinned: formData.is_pinned,
          isVisible,
          autoRouteEligible: isVisible ? true : undefined,
          isActive: isVisible ? true : undefined,
          creditsPrice,
          supportedRatios: formData.supported_ratios,
          supportedResolutions: formData.supported_resolutions,
          supportedDurations: formData.supported_durations,
          capabilities: formData.capabilities,
        });

        setModels((prev) => {
          const idx = prev.findIndex((m) => m.id === targetId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              display_name: formData.display_name,
              description: formData.description,
              badge: formData.badge,
              sub_type: formData.sub_type,
              sort: Number(formData.sort),
              tier: formData.tier || (isVisible ? 'core' : 'backup'),
              is_featured: formData.is_featured,
              is_pinned: formData.is_pinned,
              is_visible: isVisible,
              base_credits: creditsPrice,
              supported_ratios: formData.supported_ratios,
              supportedResolutions: formData.supported_resolutions,
              supported_durations: formData.supported_durations,
              capabilities: formData.capabilities,
            };
            return updated;
          }
          return prev;
        });

        showToast(`模型【${formData.display_name || targetId}】配置已成功保存 ✓`);
        refreshPublicDirectory();
      } catch (err) {
        showToast(`保存失败: ${err.message}`, 'error');
        throw err;
      } finally {
        setSaving(null);
      }
    },
    [canWrite, callAPI, showToast, refreshPublicDirectory]
  );

  // 极速改价保存
  const handleSaveQuickPrice = useCallback(async () => {
    if (!quickPriceModal) return;
    const model = quickPriceModal.model;
    const credits = Number(quickPriceInput);
    if (!Number.isInteger(credits) || credits <= 0) {
      showToast('单次生成积分必须为大于0的正整数', 'error');
      return;
    }
    setSavingQuickPrice(true);
    try {
      await callAPI({
        action: 'update_model_tiering',
        modelId: model.id,
        creditsPrice: credits,
      });
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, base_credits: credits } : m)));
      showToast(`模型【${model.display_name || model.name}】积分定价已调整为 ${credits} 积分 ✓`);
      setQuickPriceModal(null);
      refreshPublicDirectory();
    } catch (err) {
      showToast(`调价失败: ${err.message}`, 'error');
    } finally {
      setSavingQuickPrice(false);
    }
  }, [quickPriceModal, quickPriceInput, callAPI, showToast, refreshPublicDirectory]);

  // 从模型库引入
  const handleDrawerAddModel = useCallback(
    async (model, targetCategory) => {
      setSaving(model.id);
      const previous = [...models];

      setModels((prev) => {
        const exists = prev.some((m) => m.id === model.id);
        if (exists) {
          return prev.map((m) =>
            m.id === model.id
              ? { ...m, is_visible: true, auto_route_eligible: true, status: 'active', tier: 'core', category: targetCategory, sort: 1 }
              : m
          );
        }
        return [
          { ...model, is_visible: true, auto_route_eligible: true, status: 'active', tier: 'core', category: targetCategory, sort: 1 },
          ...prev,
        ];
      });

      try {
        await callAPI({
          action: 'update_model_tiering',
          modelId: model.id,
          isVisible: true,
          autoRouteEligible: true,
          isActive: true,
          tier: 'core',
          category: targetCategory,
          sort: 1,
        });
        showToast(`已成功引入模型【${model.display_name || model.name}】✓`);
        refreshPublicDirectory();
      } catch (err) {
        setModels(previous);
        showToast(`引入失败: ${err.message}`, 'error');
      } finally {
        setSaving(null);
      }
    },
    [models, callAPI, showToast, refreshPublicDirectory]
  );

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-16">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-surface-raised border border-line px-4 py-2.5 text-body-sm shadow-elevation-3 animate-fade-in text-ink font-medium">
          <CheckCircle2 className="size-4 text-brand" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* ─── ROW 1: 顶层业务三位一体导航 (草稿图4第1行: 模型管理 / 模型API / 模型定价) ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-line-subtle">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-well/80 rounded-xl border border-line-subtle">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-surface-raised text-ink font-bold text-body-sm shadow-elevation-1 border border-line"
          >
            <Layers className="size-4 text-brand" />
            <span>模型管理</span>
            <span className="rounded-full bg-brand/10 text-brand px-1.5 py-0.2 text-[11px] font-mono font-bold">
              {models.length}
            </span>
          </button>
          <a
            href="/admin/models/routing"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface text-body-sm font-medium transition-colors"
          >
            <Zap className="size-4 text-amber-400" />
            <span>模型 API / 渠道</span>
          </a>
          <a
            href="/admin/models/pricing"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface text-body-sm font-medium transition-colors"
          >
            <DollarSign className="size-4 text-emerald-400" />
            <span>模型定价与利润</span>
          </a>
        </div>

        {/* Global Operational Shortcuts */}
        <div className="flex items-center gap-2 shrink-0">
          {canWrite && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setRepoDrawerOpen(true)}
              className="text-xs font-semibold shadow-elevation-2"
            >
              <Plus className="size-3.5 mr-1" />
              从模型库引入
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setHygieneDrawerOpen(true)}
            className="text-xs text-ink-muted hover:text-ink"
            title="去重与规范治理"
          >
            <ShieldCheck className="size-3.5 mr-1 text-emerald-400" />
            去重治理
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewerOpen(true)}
            className="text-xs text-ink-muted hover:text-ink"
            title="查看前台 Studio 真实下拉组件"
          >
            <Eye className="size-3.5 mr-1" />
            Studio 下拉预览
          </Button>
        </div>
      </div>

      {/* ─── ROW 2: 厂商 / 品牌直选过滤条 (草稿图4第2行黄色模块) ─── */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 custom-scrollbar">
        <button
          type="button"
          onClick={() => handleBrandSelect('all')}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all border ${
            selectedBrand === 'all'
              ? 'bg-white text-black border-white shadow-elevation-1 font-bold'
              : 'bg-surface-raised border-line text-ink-muted hover:text-ink hover:bg-white/[0.06]'
          }`}
        >
          <span>全部厂商</span>
          <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
            selectedBrand === 'all' ? 'bg-black/20 text-black font-bold' : 'bg-white/10 text-ink-subtle'
          }`}>
            {models.length}
          </span>
        </button>

        {activeBrands.map((brand) => {
          const isSelected = selectedBrand === brand.id;
          const count = brandStats[brand.id] || 0;
          return (
            <button
              key={brand.id}
              type="button"
              onClick={() => handleBrandSelect(brand.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all border ${
                isSelected
                  ? 'bg-white text-black border-white shadow-elevation-1 font-bold'
                  : 'bg-surface-raised border-line text-ink-muted hover:text-ink hover:bg-white/[0.06]'
              }`}
            >
              <BrandLogo brand={brand} size="xs" className="rounded shrink-0" />
              <span>{brand.shortName}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                isSelected ? 'bg-black/20 text-black font-bold' : 'bg-white/10 text-ink-subtle'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── ROW 3: 业务任务场景单行过滤条 (草稿图4第3行绿色模块) ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-2 rounded-2xl bg-surface-raised border border-line-subtle">
        {/* Left: Task Scene Pills */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
          {TASK_SCENES.map((scene) => {
            const isActive = activeScene === scene.id;
            const count = sceneCounts[scene.id] || 0;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => setActiveScene(scene.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-brand text-white font-bold shadow-elevation-1'
                    : 'text-ink-muted hover:text-ink hover:bg-white/[0.06]'
                }`}
              >
                <span>{scene.label}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                  isActive ? 'bg-black/20 text-white font-bold' : 'bg-white/10 text-ink-subtle'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Search + Status Selector + Result Count */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-line-subtle bg-well px-2.5 py-1.5 text-xs text-ink outline-none cursor-pointer focus:border-brand"
          >
            <option value="all">全部展示状态</option>
            <option value="visible">仅看展示已开</option>
            <option value="hidden">仅看展示已关</option>
          </select>

          <div className="relative w-48 sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-ink-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型名称或ID..."
              className="w-full rounded-xl border border-line-subtle bg-well pl-7 pr-6 py-1.5 text-xs text-ink placeholder:text-ink-subtle outline-none focus:border-brand"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <span className="text-caption text-ink-subtle hidden sm:inline-block font-mono">
            共 {currentModels.length} 个
          </span>
        </div>
      </div>

      {/* ─── ROW 4: 核心所见即所得管理大表 (草稿图4核心表格主体) ─── */}
      <Card className="overflow-hidden p-0 border border-line shadow-elevation-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-raised/80 text-caption font-semibold text-ink-muted">
                <th className="px-3.5 py-3 w-[120px]">厂商品牌</th>
                <th className="px-3.5 py-3 min-w-[200px]">模型名称 / 系统ID</th>
                <th className="px-3 py-3 w-[100px]">任务场景</th>
                <th className="px-3.5 py-3 min-w-[220px]">支持能力规格</th>
                <th className="px-3 py-3 w-[120px] text-right">官方参考成本</th>
                <th className="px-3.5 py-3 w-[150px] text-center">平台积分定价</th>
                <th className="px-3 py-3 w-[120px] text-center">预估毛利率</th>
                <th className="px-3 py-3 w-[120px] text-center">前台展示</th>
                <th className="px-3 py-3 w-[120px] text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-body-sm">
              {currentModels.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-ink-muted space-y-2">
                    <p>{search ? '未检索到匹配的模型' : '当前筛选条件下暂无模型'}</p>
                    {selectedBrand !== 'all' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedBrand('all');
                          setActiveScene('all');
                        }}
                        className="text-xs"
                      >
                        清除筛选，查看全部模型
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                currentModels.map((model, idx) => {
                  const brand = resolveBrand(model);
                  const isVisible = Boolean(model.is_visible);
                  const isSavingThis = saving === model.id;
                  const sceneLabel = getModelSceneLabel(model);
                  const marginInfo = computeModelMargin(model);
                  const credits = Number(model.base_credits || 0);

                  const ratios = Array.isArray(model.supported_ratios) ? model.supported_ratios : [];
                  const resolutions = Array.isArray(model.supported_resolutions) ? model.supported_resolutions : [];
                  const durations = Array.isArray(model.supported_durations) ? model.supported_durations : [];

                  return (
                    <tr
                      key={model.id}
                      className={`group transition-colors ${
                        isVisible
                          ? 'hover:bg-white/[0.02]'
                          : 'bg-white/[0.005] opacity-75 hover:opacity-100 hover:bg-white/[0.02]'
                      }`}
                    >
                      {/* Col 1: 厂商品牌 */}
                      <td className="px-3.5 py-3 align-middle">
                        <div className="flex items-center gap-2">
                          <BrandLogo brand={brand} size="xs" className="rounded shrink-0" />
                          <span className="font-medium text-ink text-xs whitespace-nowrap">
                            {brand?.shortName || '通用'}
                          </span>
                        </div>
                      </td>

                      {/* Col 2: 模型名称 / 系统 ID */}
                      <td className="px-3.5 py-3 align-middle">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-ink text-body-sm">
                              {model.display_name || model.name}
                            </span>
                            {model.badge && (
                              <span className="rounded-md bg-brand/15 text-brand border border-brand/25 px-1.5 py-0.2 text-[10px] font-bold">
                                {model.badge}
                              </span>
                            )}
                            {model.is_pinned && (
                              <span className="text-[11px]" title="已置顶首位 📌">
                                📌
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-ink-subtle">
                            <span className="font-mono text-caption">{model.id}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyId(model.id)}
                              className="opacity-0 group-hover:opacity-100 hover:text-ink p-0.5 transition-opacity"
                              title="复制模型 ID"
                            >
                              <Copy className="size-2.5" />
                            </button>
                            {copiedId === model.id && (
                              <span className="text-[10px] text-emerald-400 font-sans">已复制</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Col 3: 任务场景 */}
                      <td className="px-3 py-3 align-middle">
                        <span className="inline-flex rounded-full bg-white/[0.06] border border-white/10 px-2.5 py-0.5 text-xs text-ink-muted whitespace-nowrap">
                          {sceneLabel}
                        </span>
                      </td>

                      {/* Col 4: 支持能力规格 */}
                      <td className="px-3.5 py-3 align-middle">
                        <div className="space-y-1 text-caption">
                          {ratios.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-ink-subtle text-[11px]">画幅:</span>
                              {ratios.slice(0, 4).map((r) => (
                                <span
                                  key={r}
                                  className="rounded bg-well px-1 py-0.2 font-mono text-[10px] text-ink-muted border border-line-subtle"
                                >
                                  {r}
                                </span>
                              ))}
                              {ratios.length > 4 && (
                                <span className="text-ink-subtle text-[10px]">+{ratios.length - 4}</span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-ink-subtle text-[11px]">
                            {resolutions.length > 0 && (
                              <span>分辨率: <strong className="text-ink-muted font-mono">{resolutions[resolutions.length - 1]}</strong></span>
                            )}
                            {durations.length > 0 && (
                              <span>时长: <strong className="text-ink-muted font-mono">{durations.join('/')}s</strong></span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Col 5: 官方参考成本 */}
                      <td className="px-3 py-3 align-middle text-right font-mono">
                        {Number(model.min_cost_cny) > 0 ? (
                          <div>
                            <span className="text-ink font-semibold">¥{Number(model.min_cost_cny).toFixed(3)}</span>
                            <span className="block text-[10px] text-ink-subtle">/次调用</span>
                          </div>
                        ) : Number(model.min_cost_usd) > 0 ? (
                          <div>
                            <span className="text-ink font-semibold">${Number(model.min_cost_usd).toFixed(4)}</span>
                            <span className="block text-[10px] text-ink-subtle">/次调用</span>
                          </div>
                        ) : (
                          <span className="text-ink-subtle text-caption">暂无报价</span>
                        )}
                      </td>

                      {/* Col 6: 平台积分定价 (点击极速调价) */}
                      <td className="px-3.5 py-3 align-middle text-center">
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => {
                              setQuickPriceModal({ model, credits });
                              setQuickPriceInput(String(credits || 50));
                            }}
                            className="inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-xl bg-brand/5 hover:bg-brand/15 border border-brand/20 transition-all group/price"
                            title="点击极速调整用户扣减积分"
                          >
                            <span className="font-mono font-bold text-brand text-body-sm group-hover/price:underline">
                              {credits} 积分 ✏️
                            </span>
                            <span className="font-mono text-[10px] text-ink-subtle">
                              ≈ ¥{(credits * 0.1).toFixed(2)}
                            </span>
                          </button>
                        ) : (
                          <div className="font-mono font-semibold text-brand">
                            {credits} 积分
                          </div>
                        )}
                      </td>

                      {/* Col 7: 预估毛利率 */}
                      <td className="px-3 py-3 align-middle text-center">
                        {marginInfo.hasData ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono font-bold border ${
                              marginInfo.status === 'loss'
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                : marginInfo.status === 'high'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {marginInfo.rate}%
                          </span>
                        ) : (
                          <span className="text-ink-subtle text-caption">—</span>
                        )}
                      </td>

                      {/* Col 8: 前台展示开关 */}
                      <td className="px-3 py-3 align-middle text-center">
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => toggleVisibility(model)}
                            disabled={isSavingThis}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-label font-medium transition-all border ${
                              isVisible
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 shadow-elevation-1'
                                : 'bg-white/[0.04] text-ink-subtle border-line-subtle hover:bg-white/[0.08] hover:text-ink'
                            }`}
                            title={isVisible ? '展示已开 (点击关闭)' : '展示已关 (点击开启)'}
                          >
                            {isSavingThis ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : isVisible ? (
                              <>
                                <Eye className="size-3 text-emerald-400" />
                                <span>展示已开</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="size-3" />
                                <span>展示已关</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-ink-subtle text-caption">
                            {isVisible ? '展示中' : '已隐藏'}
                          </span>
                        )}
                      </td>

                      {/* Col 9: 快捷操作 */}
                      <td className="px-3 py-3 align-middle text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canWrite && (
                            <>
                              {/* 快速置顶 */}
                              <button
                                type="button"
                                onClick={() => togglePinned(model)}
                                disabled={isSavingThis}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  model.is_pinned
                                    ? 'text-amber-400 bg-amber-400/15 hover:bg-amber-400/25'
                                    : 'text-ink-subtle hover:text-ink hover:bg-white/[0.06]'
                                }`}
                                title={model.is_pinned ? '取消置顶' : '置顶到首位'}
                              >
                                <Pin className={`size-3.5 ${model.is_pinned ? 'fill-amber-400' : ''}`} />
                              </button>

                              {/* 快速上移/下移 */}
                              <button
                                type="button"
                                onClick={() => moveModel(model, 'up')}
                                disabled={idx === 0}
                                className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-white/[0.06] disabled:opacity-20"
                                title="上移"
                              >
                                <ChevronUp className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveModel(model, 'down')}
                                disabled={idx === currentModels.length - 1}
                                className="p-1.5 rounded-lg text-ink-subtle hover:text-ink hover:bg-white/[0.06] disabled:opacity-20"
                                title="下移"
                              >
                                <ChevronDown className="size-3.5" />
                              </button>

                              {/* 高级配置 (右侧滑出抽屉) */}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => startEdit(model)}
                                className="h-7 text-xs px-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-ink ml-1 font-medium"
                              >
                                配置
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ─── 极速调价浮层 (Quick Price Modal) ─── */}
      {quickPriceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-surface-raised border border-line p-5 shadow-elevation-3 space-y-4">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <div className="flex items-center gap-2">
                <BrandLogo model={quickPriceModal.model} size="sm" className="rounded-md" />
                <h3 className="text-body font-semibold text-ink">极速调整积分定价</h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickPriceModal(null)}
                className="text-ink-subtle hover:text-ink p-1 rounded-md"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-body-sm font-semibold text-ink">
                  {quickPriceModal.model.display_name || quickPriceModal.model.name}
                </p>
                <p className="font-mono text-caption text-ink-subtle">
                  {quickPriceModal.model.id}
                </p>
              </div>

              {/* Reference Cost info */}
              <div className="p-2.5 rounded-xl bg-well/60 border border-line-subtle flex items-center justify-between text-caption">
                <span className="text-ink-muted">官方渠道成本参考</span>
                <span className="font-mono text-ink font-semibold">
                  {Number(quickPriceModal.model.min_cost_cny) > 0
                    ? `¥${Number(quickPriceModal.model.min_cost_cny).toFixed(3)}/次`
                    : Number(quickPriceModal.model.min_cost_usd) > 0
                    ? `$${Number(quickPriceModal.model.min_cost_usd).toFixed(4)}/次`
                    : '暂无成本报价'}
                </span>
              </div>

              {/* Credits input */}
              <div className="space-y-1.5">
                <label className="text-label text-ink-muted block font-medium">
                  单次生成扣除积分 (10 积分 = ¥1.00)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quickPriceInput}
                    onChange={(e) => setQuickPriceInput(e.target.value)}
                    className="w-full rounded-xl bg-field border border-line-subtle px-3 py-2 text-body font-mono text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand font-bold"
                    placeholder="如 50"
                    autoFocus
                  />
                  <span className="absolute right-3 top-2.5 text-caption text-ink-subtle font-mono">
                    ≈ ¥{((Number(quickPriceInput) || 0) * 0.1).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Estimated Margin */}
              {(() => {
                const margin = computeModelMargin(quickPriceModal.model, Number(quickPriceInput));
                if (!margin.hasData) return null;
                const isHealthy = margin.status === 'high';
                const isLoss = margin.status === 'loss';
                return (
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between text-caption ${
                    isLoss
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      : isHealthy
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}>
                    <span>预估毛利率</span>
                    <span className="font-mono font-bold">
                      {margin.rate}% {isLoss ? '(亏损警告)' : isHealthy ? '(健康毛利)' : '(微利)'}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setQuickPriceModal(null)}
                disabled={savingQuickPrice}
              >
                取消
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveQuickPrice}
                disabled={savingQuickPrice}
              >
                {savingQuickPrice ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Save className="size-3.5 mr-1" />
                )}
                确认调整
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 右侧抽屉式高级配置面板 (ModelConfigDrawer) ─── */}
      <ModelConfigDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerModel(null);
        }}
        model={drawerModel}
        isNew={isDrawerNew}
        allModels={models}
        activeCategory={drawerModel?.category || 'image'}
        canWrite={canWrite}
        onSave={handleDrawerSave}
        onSmartMatch={(m) => {
          setSmartMatchTargetModel(m);
          setSmartMatchOpen(true);
        }}
      />

      {/* ─── 模型库引入抽屉 (ModelRepositoryDrawer) ─── */}
      <ModelRepositoryDrawer
        isOpen={repoDrawerOpen}
        onClose={() => setRepoDrawerOpen(false)}
        activeCategory={activeScene === 'all' ? 'image' : activeScene}
        categoryLabel={TASK_SCENES.find((s) => s.id === activeScene)?.label || '模型库'}
        allModels={models}
        canWrite={canWrite}
        onAddModel={handleDrawerAddModel}
        onCreateCustomModel={async (data) => {
          await callAPI({ action: 'create_model', ...data });
          showToast(`已注册模型【${data.displayName || data.name}】✓`);
          window.location.reload();
        }}
        onSelectForEdit={(m) => startEdit(m)}
      />

      {/* ─── Studio 真实下拉预览模拟器 (StudioLivePreviewer) ─── */}
      <StudioLivePreviewer
        isOpen={previewerOpen}
        onClose={() => setPreviewerOpen(false)}
        activeCategory="all"
        categoryLabel="Studio 前台"
        visibleModels={models.filter((m) => Boolean(m.is_visible))}
      />

      {/* ─── 去重治理助手 (ModelHygieneDrawer) ─── */}
      <ModelHygieneDrawer
        isOpen={hygieneDrawerOpen}
        onClose={() => setHygieneDrawerOpen(false)}
        onHygieneCompleted={async () => {
          showToast('模型治理与收敛完成，正在刷新数据...');
          window.location.reload();
        }}
      />

      {/* ─── 智能通道匹配弹窗 (SmartMatchModal) ─── */}
      <SmartMatchModal
        isOpen={smartMatchOpen}
        onClose={() => {
          setSmartMatchOpen(false);
          setSmartMatchTargetModel(null);
        }}
        initialModel={smartMatchTargetModel}
        allModels={models}
        activeCategory="all"
        onModelActivated={(updatedModel) => {
          setModels((prev) =>
            prev.map((m) =>
              m.id === updatedModel.id
                ? { ...m, approved_routes: Math.max(1, Number(m.approved_routes || 0) + 1) }
                : m
            )
          );
          showToast(`已激活模型渠道：${updatedModel.id} ✓`);
        }}
      />
    </div>
  );
}
