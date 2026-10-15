'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Eye, EyeOff, Star, StarOff, Search, ChevronDown, ChevronUp,
  Pencil, X, Save, Loader2, Image, Video, Music, Bot, Layers,
  Pin, CheckCircle2, XCircle, RefreshCw, Plus, Sparkles, Filter,
  Check, ArrowUpDown, ShieldCheck, AlertTriangle, Zap
} from 'lucide-react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import ModelRepositoryDrawer from './ModelRepositoryDrawer';
import StudioLivePreviewer from './StudioLivePreviewer';
import UnroutedConfirmModal from './UnroutedConfirmModal';
import SmartMatchModal from './SmartMatchModal';
import ModelHygieneDrawer from './ModelHygieneDrawer';
import BrandLogo from '@/components/admin/BrandLogo';

const CATEGORY_OPTIONS = [
  { id: 'image', label: '图像模型', icon: Image, desc: '文生图、图生图' },
  { id: 'video', label: '视频模型', icon: Video, desc: '文生视频、图生视频' },
  { id: 'audio', label: '音频模型', icon: Music, desc: '音乐、语音 TTS' },
  { id: 'text', label: '智能体 / 语言', icon: Bot, desc: '对话、推理' },
  { id: 'all', label: '全部模型', icon: Layers, desc: '全库总览' },
];

const SUBTYPE_OPTIONS = {
  image: [
    { id: 'all', label: '全部' },
    { id: 't2i', label: '文生图 (T2I)' },
    { id: 'i2i', label: '图生图 (I2I)' },
  ],
  video: [
    { id: 'all', label: '全部' },
    { id: 't2v', label: '文生视频 (T2V)' },
    { id: 'i2v', label: '图生视频 (I2V)' },
    { id: 'v2v', label: '视频编辑 (V2V)' },
  ],
  audio: [
    { id: 'all', label: '全部' },
    { id: 'music', label: '音乐生成' },
    { id: 'tts', label: '语音 (TTS)' },
    { id: 'sfx', label: '音效 (SFX)' },
  ],
  text: [
    { id: 'all', label: '全部' },
    { id: 'chat', label: '智能对话' },
    { id: 'reasoning', label: '深度推理' },
  ],
};

const PRESET_BADGES = ['最新', '经济', '旗舰', '极速', 'New', 'Best', 'Hot', 'Pro', 'Fast', '4.5 旗舰', '3.0', '置顶'];

const PRESET_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3'];
const PRESET_RESOLUTIONS = ['1024x1024', '1280x720', '720x1280', '1920x1080', '1080x1920', '2048x2048', '3840x2160'];
const PRESET_DURATIONS = [3, 5, 10, 15, 30, 60];

const TIER_LABELS = { core: 'Core 核心', backup: 'Backup 备用', experimental: '实验', deprecated: '停用' };
const TIER_COLORS = { core: 'success', backup: 'neutral', experimental: 'warning', deprecated: 'danger' };

function categoryLabel(cat) {
  return CATEGORY_OPTIONS.find((c) => c.id === cat)?.label || cat || '—';
}

function normalizeProviders(provs) {
  if (!provs) return [];
  if (Array.isArray(provs)) return provs;
  try {
    const parsed = typeof provs === 'string' ? JSON.parse(provs) : provs;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function describeAvailability(model, directory) {
  if (!model.is_visible) return { label: '已隐藏', detail: '展示开关已关闭', tone: 'neutral' };
  if (model.status !== 'active') return { label: '待配置', detail: '模型状态尚未激活', tone: 'warning' };
  if (model.tier !== 'core') return { label: '待配置', detail: '当前公开目录仅准入核心模型', tone: 'warning' };
  if (!model.auto_route_eligible) return { label: '待配置', detail: '未开启自动路由准入', tone: 'warning' };
  if (!(Number(model.base_credits) > 0)) return { label: '待配置', detail: '缺少有效积分价格', tone: 'warning' };
  if (!(Number(model.approved_routes) > 0)) return { label: '待配置', detail: '缺少已审核渠道', tone: 'warning' };
  if (!directory) return { label: '待核验', detail: '公开目录读取中或失败', tone: 'warning' };
  const publicModel = directory.get(String(model.id));
  if (!publicModel) return { label: '待核验', detail: '公开目录未返回此模型', tone: 'warning' };
  if (!publicModel.isActive || !publicModel.autoRouteEligible || !publicModel.hasWorkingRoute || !(Number(publicModel.creditsPrice) > 0)) {
    return { label: '待核验', detail: '供应商凭证、成本、端点或健康检查未满足准入', tone: 'warning' };
  }
  return { label: '目录可选', detail: '仍需真实生成与积分结算验收', tone: 'success' };
}

export default function FrontendConfigClient({ initialModels = [], canWrite }) {
  const [models, setModels] = useState(initialModels);
  const [publicDirectory, setPublicDirectory] = useState(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('image'); // Default to image type
  const [subTypeFilter, setSubTypeFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('blocked'); // blocked | core | visible | backup | all
  const [editingId, setEditingId] = useState(null); // model id or '__new__'
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(null);
  const [batchOperating, setBatchOperating] = useState(false);
  const [toast, setToast] = useState(null);

  // Drawers & Modals
  const [repoDrawerOpen, setRepoDrawerOpen] = useState(false);
  const [previewerOpen, setPreviewerOpen] = useState(false);
  const [hygieneDrawerOpen, setHygieneDrawerOpen] = useState(false);
  const [unroutedConfirmModel, setUnroutedConfirmModel] = useState(null);
  const [smartMatchOpen, setSmartMatchOpen] = useState(false);
  const [smartMatchTargetModel, setSmartMatchTargetModel] = useState(null);

  // Model Searchable Select (inline create form)
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerSearch, setModelPickerSearch] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [inlineCandidates, setInlineCandidates] = useState([]);
  const modelPickerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target)) {
        setModelPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  useEffect(() => { refreshPublicDirectory(); }, [refreshPublicDirectory]);

  // Reset subtype filter when category changes
  const handleCategoryChange = useCallback((catId) => {
    setActiveCategory(catId);
    setSubTypeFilter('all');
  }, []);

  // Category statistics
  const categoryStats = useMemo(() => {
    const stats = {
      image: { total: 0, visible: 0, hidden: 0, core: 0, unrouted: 0, selectable: 0, blocked: 0 },
      video: { total: 0, visible: 0, hidden: 0, core: 0, unrouted: 0, selectable: 0, blocked: 0 },
      audio: { total: 0, visible: 0, hidden: 0, core: 0, unrouted: 0, selectable: 0, blocked: 0 },
      text: { total: 0, visible: 0, hidden: 0, core: 0, unrouted: 0, selectable: 0, blocked: 0 },
      all: { total: models.length, visible: 0, hidden: 0, core: 0, unrouted: 0, selectable: 0, blocked: 0 },
    };

    models.forEach((m) => {
      const cat = m.category || 'image';
      const target = stats[cat] || stats.image;
      const isVis = Boolean(m.is_visible);
      const isCore = m.tier === 'core';
      const hasRoute = (m.approved_routes ?? 0) > 0;
      const availability = describeAvailability(m, publicDirectory);

      target.total += 1;
      if (isVis) target.visible += 1;
      else target.hidden += 1;
      if (isCore) target.core += 1;
      if (!hasRoute) target.unrouted += 1;
      if (availability.label === '目录可选') target.selectable += 1;
      else if (isVis) target.blocked += 1;

      if (isVis) stats.all.visible += 1;
      else stats.all.hidden += 1;
      if (isCore) stats.all.core += 1;
      if (!hasRoute) stats.all.unrouted += 1;
      if (availability.label === '目录可选') stats.all.selectable += 1;
      else if (isVis) stats.all.blocked += 1;
    });

    return stats;
  }, [models, publicDirectory]);

  // Current category models filtered by subtype, visibility, search
  const currentCategoryModels = useMemo(() => {
    let list = models;

    // 1. Primary Category Filter
    if (activeCategory !== 'all') {
      list = list.filter((m) => (m.category || '').startsWith(activeCategory));
    }

    // 2. Subtype Filter
    if (subTypeFilter !== 'all') {
      list = list.filter((m) => {
        const sub = m.sub_type || (m.capabilities && m.capabilities.sub_type) || '';
        return sub.toLowerCase() === subTypeFilter.toLowerCase();
      });
    }

    // 3. Visibility / Tier Filter
    if (visibilityFilter === 'blocked') {
      list = list.filter((m) => m.is_visible && describeAvailability(m, publicDirectory).label !== '目录可选');
    } else if (visibilityFilter === 'core') {
      list = list.filter((m) => m.tier === 'core' && Boolean(m.is_visible));
    } else if (visibilityFilter === 'visible') {
      list = list.filter((m) => Boolean(m.is_visible));
    } else if (visibilityFilter === 'backup' || visibilityFilter === 'hidden') {
      list = list.filter((m) => !m.is_visible || m.tier === 'backup');
    }

    // 4. Search Query
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          (m.display_name || m.name || '').toLowerCase().includes(q) ||
          (m.id || '').toLowerCase().includes(q) ||
          normalizeProviders(m.provider_ids).some((p) => String(p).toLowerCase().includes(q))
      );
    }

    // Sort order: is_pinned DESC -> is_visible DESC -> sort ASC -> created_at ASC
    return list.sort((a, b) => {
      const aPinned = Boolean(a.is_pinned);
      const bPinned = Boolean(b.is_pinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const aVis = Boolean(a.is_visible);
      const bVis = Boolean(b.is_visible);
      if (aVis !== bVis) return aVis ? -1 : 1;

      const tierOrder = { core: 0, backup: 1, experimental: 2, deprecated: 3 };
      const aTier = tierOrder[a.tier] ?? 1;
      const bTier = tierOrder[b.tier] ?? 1;
      if (aTier !== bTier) return aTier - bTier;

      if ((a.sort ?? 0) !== (b.sort ?? 0)) return (a.sort ?? 0) - (b.sort ?? 0);
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }, [models, activeCategory, subTypeFilter, visibilityFilter, search, publicDirectory]);

  // Dropdown list for selecting a model in inline new form
  const modelPickerOptions = useMemo(() => {
    const q = (modelPickerSearch || '').trim().toLowerCase();
    let list = models;
    if (activeCategory !== 'all') {
      list = list.filter((m) => (m.category || '').startsWith(activeCategory));
    }
    if (!q) return list;
    return list.filter(
      (m) =>
        (m.display_name || '').toLowerCase().includes(q) ||
        (m.name || '').toLowerCase().includes(q) ||
        (m.id || '').toLowerCase().includes(q) ||
        normalizeProviders(m.provider_ids).some((p) => String(p).toLowerCase().includes(q))
    );
  }, [models, activeCategory, modelPickerSearch]);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const callAPI = useCallback(async (payload) => {
    const res = await fetch('/api/admin/models/control', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `frontend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || data.message || '操作失败');
    await refreshPublicDirectory();
    return data;
  }, [refreshPublicDirectory]);

  // Execute actual toggle visibility (with optimistic rollback)
  const executeToggleVisibility = useCallback(
    async (model, newVisible) => {
      if (!canWrite) return;
      const previousModels = [...models];

      // Optimistic update
      setModels((prev) => prev.map((m) => (m.id === model.id ? {
        ...m,
        is_visible: newVisible,
        ...(newVisible ? { auto_route_eligible: true, status: 'active', tier: 'core' } : {})
      } : m)));
      setSaving(model.id);

      try {
        await callAPI({
          action: 'update_model_tiering',
          modelId: model.id,
          isVisible: newVisible,
          autoRouteEligible: newVisible ? true : (model.auto_route_eligible ?? false),
          isActive: newVisible ? true : (model.status === 'active' || model.is_active),
          tier: newVisible ? 'core' : (model.tier || 'backup'),
        });
        showToast(`${model.display_name || model.name} 展示开关已${newVisible ? '开启，并已自动准入路由与激活' : '关闭'}`);
        refreshPublicDirectory();
      } catch (err) {
        setModels(previousModels); // Rollback
        showToast(err.message, 'error');
      } finally {
        setSaving(null);
      }
    },
    [canWrite, models, callAPI, showToast, refreshPublicDirectory]
  );

  // Toggle Visibility: Intercepts models with 0 routes
  const toggleVisibility = useCallback(
    (model) => {
      if (!canWrite) return;
      const newVisible = !model.is_visible;
      const hasRoutes = (model.approved_routes ?? 0) > 0;

      // If turning on and 0 routes, prompt confirmation modal!
      if (newVisible && !hasRoutes) {
        setUnroutedConfirmModel({ model, newVisible: true });
        return;
      }

      executeToggleVisibility(model, newVisible);
    },
    [canWrite, executeToggleVisibility]
  );

  const toggleFeatured = useCallback(
    async (model) => {
      if (!canWrite) return;
      const newFeatured = !model.is_featured;
      const previous = [...models];
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, is_featured: newFeatured } : m)));
      setSaving(model.id);
      try {
        await callAPI({ action: 'update_model_tiering', modelId: model.id, isFeatured: newFeatured });
        showToast(`${model.display_name || model.name} ${newFeatured ? '已标记推荐 ⭐' : '已取消推荐'}`);
      } catch (err) {
        setModels(previous);
        showToast(err.message, 'error');
      } finally {
        setSaving(null);
      }
    },
    [canWrite, models, callAPI, showToast]
  );

  const togglePinned = useCallback(
    async (model) => {
      if (!canWrite) return;
      const newPinned = !model.is_pinned;
      const previous = [...models];
      setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, is_pinned: newPinned } : m)));
      setSaving(model.id);
      try {
        await callAPI({ action: 'update_model_tiering', modelId: model.id, isPinned: newPinned });
        showToast(`${model.display_name || model.name} ${newPinned ? '已置顶到前台首位 📌' : '已取消置顶'}`);
      } catch (err) {
        setModels(previous);
        showToast(err.message, 'error');
      } finally {
        setSaving(null);
      }
    },
    [canWrite, models, callAPI, showToast]
  );

  // Quick move adjacent models up/down
  const moveModel = useCallback(
    async (model, direction) => {
      if (!canWrite) return;
      const currentList = currentCategoryModels;
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
        showToast('排序调整已同步前台 ✓');
      } catch (err) {
        setModels(previous);
        showToast(`排序调整失败: ${err.message}`, 'error');
      }
    },
    [canWrite, currentCategoryModels, models, callAPI, showToast]
  );

  // Add model from Repository Drawer into active category
  const handleDrawerAddModel = useCallback(
    async (model, targetCategory) => {
      const hasRoutes = (model.approved_routes ?? 0) > 0;
      if (!hasRoutes) {
        setUnroutedConfirmModel({ model, newVisible: true, targetCategory });
        return;
      }
      await executeAddModelToCategory(model, targetCategory);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [models]
  );

  const executeAddModelToCategory = useCallback(
    async (model, targetCategory) => {
      setSaving(model.id);
      const previous = [...models];

      setModels((prev) => {
        const exists = prev.some((m) => m.id === model.id);
        if (exists) {
          return prev.map((m) =>
            m.id === model.id
              ? {
                  ...m,
                  is_visible: true,
                  auto_route_eligible: true,
                  status: 'active',
                  tier: 'core',
                  category: targetCategory,
                  sort: 1,
                }
              : m
          );
        }
        return [
          {
            ...model,
            is_visible: true,
            auto_route_eligible: true,
            status: 'active',
            tier: 'core',
            category: targetCategory,
            sort: 1,
          },
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
        showToast(`已设置【${model.display_name || model.name}】展示分类并开启路由准入；请核对目录准入状态`);
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

  // Create brand new custom model from drawer
  const handleDrawerCreateCustomModel = useCallback(
    async (modelData) => {
      try {
        const res = await callAPI({
          action: 'create_model',
          ...modelData,
        });
        const created = res.data?.result || modelData;
        setModels((prev) => [
          {
            id: modelData.modelId,
            name: modelData.name,
            display_name: modelData.displayName,
            category: modelData.category,
            sub_type: modelData.subType,
            badge: modelData.badge,
            base_credits: modelData.creditsPrice,
            description: modelData.description,
            is_visible: false,
            is_pinned: modelData.isPinned,
            sort: modelData.sort,
            tier: modelData.tier || 'core',
            approved_routes: 0,
            provider_ids: [],
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        showToast(`已注册模型【${modelData.displayName || modelData.name}】；渠道与价格审核前保持隐藏`);
      } catch (err) {
        showToast(`注册失败: ${err.message}`, 'error');
        throw err;
      }
    },
    [callAPI, showToast]
  );

  const startEdit = useCallback((model) => {
    setEditingId(model.id);
    const initialCredits = Number(model.base_credits) > 0
      ? Number(model.base_credits)
      : (Number(model.credits_price) > 0 ? Number(model.credits_price) : '');
    setEditForm({
      model_id: model.id,
      display_name: model.display_name || model.name || '',
      description: model.description || '',
      badge: model.badge || '',
      sub_type: model.sub_type || '',
      sort: model.sort ?? 0,
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
    });
    setModelPickerSearch('');
    setModelPickerOpen(false);
    setCheckResult(null);
    setInlineCandidates([]);

    // If model has 0 routes, proactively fetch smart match candidates
    if (!model.routes || Number(model.routes) === 0) {
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
    }
  }, []);

  const startNew = useCallback(() => {
    setEditingId('__new__');
    setEditForm({
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
    });
    setModelPickerSearch('');
    setModelPickerOpen(true);
    setCheckResult(null);
    setInlineCandidates([]);
  }, [activeCategory]);

  const runCheck = useCallback(
    async (modelId) => {
      if (!modelId) {
        showToast('请先选择一个模型', 'error');
        return;
      }
      setChecking(true);
      setCheckResult(null);
      try {
        const res = await fetch('/api/admin/models/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'simulate', modelId }),
        });
        const data = await res.json();
        if (!res.ok) {
          setCheckResult({ ok: false, msg: data.error?.message || '不可调用' });
          showToast(`检测失败: ${data.error?.message || '不可调用'}`, 'error');
          return;
        }
        const sim = data.data?.simulation;
        if (sim?.blocked) {
          const reason = sim.selectionReason || '当前无可用路由通道';
          setCheckResult({ ok: false, msg: `不可调用: ${reason}` });
          showToast(`不可调用: ${reason}`, 'error');
          // 自动拉取智能推荐渠道
          fetch('/api/admin/models/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'match_channel_candidates',
              modelId,
              category: editForm.category || 'image',
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
          const prov = sim?.selectedProviderId || '已就绪';
          setCheckResult({ ok: true, msg: `模拟选中 ${prov}；未验证真实调用` });
          showToast(`路由模拟选中 ${prov}；请继续核对公开目录与真实任务`);
        }
      } catch (err) {
        setCheckResult({ ok: false, msg: `检测出错: ${err.message}` });
        showToast(`检测出错: ${err.message}`, 'error');
      } finally {
        setChecking(false);
      }
    },
    [editForm.category, showToast]
  );

  const handleSelectModel = useCallback((model) => {
    const selCredits = Number(model.base_credits) > 0
      ? Number(model.base_credits)
      : (Number(model.credits_price) > 0 ? Number(model.credits_price) : '');
    setEditForm((f) => ({
      ...f,
      model_id: model.id,
      display_name: model.display_name || model.name,
      description: f.description || model.description || '',
      badge: f.badge || model.badge || 'New',
      sub_type: f.sub_type || model.sub_type || (model.category === 'video' ? 't2v' : 't2i'),
      sort: f.sort ?? (model.sort ?? 1),
      tier: f.tier || model.tier || 'core',
      is_featured: f.is_featured ?? Boolean(model.is_featured),
      is_pinned: f.is_pinned ?? Boolean(model.is_pinned),
      is_visible: true,
      credits: selCredits,
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
    }));
    setModelPickerSearch('');
    setModelPickerOpen(false);
    setCheckResult(null);
    setInlineCandidates([]);

    if (!model.routes || Number(model.routes) === 0) {
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
    }
  }, []);

  const saveEdit = useCallback(async () => {
    if (!canWrite) return;
    const targetId = editForm.model_id || editingId;
    if (!targetId || targetId === '__new__') {
      showToast('请先选择要配置的模型', 'error');
      return;
    }
    const isVisible = editForm.is_visible !== undefined ? editForm.is_visible : true;
    if (editForm.credits === '' || editForm.credits === null || editForm.credits === undefined) {
      showToast('请填写单次生成积分（必须为大于0的正整数）', 'error');
      return;
    }
    const creditsPrice = Number(editForm.credits);
    if (!Number.isInteger(creditsPrice) || creditsPrice <= 0) {
      showToast('单次生成积分必须为大于0的正整数', 'error');
      return;
    }
    setSaving(targetId);
    try {
      await callAPI({
        action: 'update_model_tiering',
        modelId: targetId,
        displayName: editForm.display_name,
        description: editForm.description,
        badge: editForm.badge || '',
        subType: editForm.sub_type || '',
        sort: Number(editForm.sort),
        tier: editForm.tier || (isVisible ? 'core' : 'backup'),
        isFeatured: editForm.is_featured,
        isPinned: editForm.is_pinned,
        isVisible,
        autoRouteEligible: isVisible ? true : undefined,
        isActive: isVisible ? true : undefined,
        creditsPrice,
        supportedRatios: editForm.supported_ratios,
        supportedResolutions: editForm.supported_resolutions,
        supportedDurations: editForm.supported_durations,
        capabilities: editForm.capabilities,
      });

      setModels((prev) => {
        const idx = prev.findIndex((m) => m.id === targetId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            display_name: editForm.display_name,
            description: editForm.description,
            badge: editForm.badge || '',
            sub_type: editForm.sub_type || '',
            sort: Number(editForm.sort),
            tier: editForm.tier,
            is_featured: editForm.is_featured,
            is_pinned: editForm.is_pinned,
            is_visible: isVisible,
            ...(isVisible ? { auto_route_eligible: true, status: 'active' } : {}),
            base_credits: creditsPrice,
            credits_price: creditsPrice,
            supported_ratios: editForm.supported_ratios,
            supported_resolutions: editForm.supported_resolutions,
            supported_durations: editForm.supported_durations,
            capabilities: editForm.capabilities,
          };
          return updated;
        }
        return prev;
      });

      showToast('展示配置已保存；请核对公开目录准入状态');
      refreshPublicDirectory();
      setEditingId(null);
      setCheckResult(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(null);
    }
  }, [canWrite, editForm, editingId, callAPI, showToast, refreshPublicDirectory]);

  // Batch action: hide all models with 0 approved routes
  const batchHideUnrouted = useCallback(async () => {
    if (!canWrite) return;
    const unroutedVisible = currentCategoryModels.filter((m) => m.approved_routes === 0 && m.is_visible);
    if (unroutedVisible.length === 0) {
      showToast('当前分类下没有无通道但在前台可见的模型');
      return;
    }

    setBatchOperating(true);
    try {
      for (const m of unroutedVisible) {
        await callAPI({ action: 'update_model_tiering', modelId: m.id, isVisible: false });
      }
      setModels((prev) =>
        prev.map((m) => {
          if (unroutedVisible.some((u) => u.id === m.id)) {
            return { ...m, is_visible: false };
          }
          return m;
        })
      );
      showToast(`已将 ${unroutedVisible.length} 个无通道模型隐藏 ✓`);
    } catch (err) {
      showToast(`批量操作失败: ${err.message}`, 'error');
    } finally {
      setBatchOperating(false);
    }
  }, [canWrite, currentCategoryModels, callAPI, showToast]);

  const activeStats = categoryStats[activeCategory] || categoryStats.image;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-toast rounded-xl px-4 py-2.5 text-body-sm font-medium shadow-elevation-3 border transition-all ${
            toast.type === 'error'
              ? 'bg-red-500/15 text-red-300 border-red-500/25'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Top Banner & Context Note */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface-raised border border-line-subtle shadow-elevation-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Zap className="size-4" />
            </span>
            <h2 className="text-body font-bold text-ink">模型展示与目录准入</h2>
            <span className="rounded-full bg-brand/15 text-brand px-2.5 py-0.5 text-micro font-semibold border border-brand/30">
              按类型垂直管控
            </span>
          </div>
          <p className="mt-1 text-caption text-ink-muted leading-relaxed">
            配置展示意向与文案，并对照公开目录检查准入。目录可选仍不代表真实生成已验收。
          </p>
        </div>

        {canWrite && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Primary Action: Add from Model Repository */}
            <Button
              variant="primary"
              size="sm"
              onClick={() => setRepoDrawerOpen(true)}
              className="text-xs shadow-elevation-2"
            >
              <Plus className="size-3.5 mr-1" />
              <Sparkles className="size-3.5 mr-1 text-yellow-300" />
              从模型库添加模型
            </Button>

            {/* Smart Routing Match Center */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSmartMatchTargetModel(null);
                setSmartMatchOpen(true);
              }}
              className="text-xs bg-brand/10 hover:bg-brand/20 border-brand/30 text-brand font-semibold shadow-elevation-1"
              title="只读查看候选，映射需人工核对和审核"
            >
              <Zap className="size-3.5 mr-1 text-brand" />
              核对渠道候选
            </Button>

            {/* Model Hygiene & Deduplication Assistant */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setHygieneDrawerOpen(true)}
              className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400 font-semibold shadow-elevation-1"
              title="模型库治理与去重助手：扫描重复变体，一键安全收敛规范模型"
            >
              <ShieldCheck className="size-3.5 mr-1 text-emerald-400" />
              去重治理助手
            </Button>

            {/* Toggle WYSIWYG Fig 2 Studio Previewer */}
            <Button
              variant={previewerOpen ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setPreviewerOpen((p) => !p)}
              className={`text-xs ${previewerOpen ? 'border-brand text-brand' : ''}`}
              title="按公开目录准入结果预览模型展示"
            >
              <Eye className="size-3.5 mr-1" />
              目录展示预览
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3" aria-label="模型接入步骤">
        <a href="/admin/models/routing" className="rounded-xl border border-line-subtle bg-surface p-3 text-body-sm text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          <span className="font-mono text-brand">01</span> 核实模型与渠道 <span className="block mt-1 text-caption text-ink-muted">准确身份、端点和能力审核</span>
        </a>
        <a href="/admin/models/pricing" className="rounded-xl border border-line-subtle bg-surface p-3 text-body-sm text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          <span className="font-mono text-brand">02</span> 审核成本与售价 <span className="block mt-1 text-caption text-ink-muted">核对成本单位和有效积分价格</span>
        </a>
        <a href="/admin/models" className="rounded-xl border border-line-subtle bg-surface p-3 text-body-sm text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          <span className="font-mono text-brand">03</span> 配置展示并验收 <span className="block mt-1 text-caption text-ink-muted">核对公开目录，再做受控真实任务</span>
        </a>
      </div>

      {/* TYPE-FIRST CATEGORY NAVIGATION (必须根据类型) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-caption font-semibold text-ink-subtle uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="size-3.5" />
            模型类型划分 (Primary Type)
          </label>
          <span className="text-caption text-ink-muted">
            全库模型: <span className="font-semibold text-ink">{models.length}</span> · 当前展示开关已开启:{' '}
            <span className="font-semibold text-brand">{categoryStats.all.visible}</span>
          </span>
        </div>

        {/* Pill Segmented Type Switcher */}
        <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-line-subtle bg-well p-1 shadow-elevation-1">
          {CATEGORY_OPTIONS.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            const cStats = categoryStats[cat.id] || { total: 0, visible: 0 };

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-body-sm font-medium transition-all ${
                  isActive
                    ? 'bg-surface-inverse text-ink-inverse shadow-elevation-1 font-semibold'
                    : 'text-ink-muted hover:bg-wash hover:text-ink'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span>{cat.label}</span>
                <span
                  className={`rounded-full px-2 py-0.2 text-[10px] font-mono ${
                    isActive ? 'bg-black/20 text-white' : 'bg-white/[0.06] text-ink-subtle'
                  }`}
                >
                  {cStats.visible}/{cStats.total}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category-Level Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label={`${categoryLabel(activeCategory)} 目录可选`} value={activeStats.selectable} />
        <MetricCard label="待处理或待核验" value={activeStats.blocked} variant={activeStats.blocked > 0 ? 'warning' : 'default'} />
        <MetricCard label="已隐藏池" value={activeStats.hidden} />
        <div className="flex flex-col justify-between">
          <MetricCard
            label="无通道模型"
            value={activeStats.unrouted}
            variant={activeStats.unrouted > 0 ? 'warning' : 'default'}
          />
          {activeStats.unrouted > 0 && (
            <button
              type="button"
              onClick={() => {
                setSmartMatchTargetModel(null);
                setSmartMatchOpen(true);
              }}
              className="mt-1 w-full rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 py-1 text-micro font-bold flex items-center justify-center gap-1 transition-colors"
            >
              <Zap className="size-3" />
              查看渠道候选 ({activeStats.unrouted})
            </button>
          )}
        </div>
      </div>

      {/* Secondary Controls Bar: Sub-type chips, Visibility Filter, Search, Batch Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 rounded-xl bg-surface-raised border border-line-subtle">
        {/* Left: Sub-types & Visibility Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Subtype chips for the selected category */}
          {SUBTYPE_OPTIONS[activeCategory] && (
            <div className="flex items-center gap-1 rounded-full bg-well p-0.5 border border-line-subtle">
              {SUBTYPE_OPTIONS[activeCategory].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubTypeFilter(sub.id)}
                  className={`rounded-full px-2.5 py-1 text-label font-medium transition-colors ${
                    subTypeFilter === sub.id
                      ? 'bg-brand text-white shadow-elevation-1 font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}

          {/* Visibility / Tier Quick Filter */}
          <div className="flex items-center gap-1 rounded-full bg-well p-0.5 border border-line-subtle text-caption">
            {[
              { id: 'blocked', label: '待处理' },
              { id: 'core', label: '核心展示' },
              { id: 'visible', label: '展示已开' },
              { id: 'backup', label: '📦 备选/存档' },
              { id: 'all', label: '全库所有' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVisibilityFilter(v.id)}
                className={`rounded-full px-2.5 py-1 text-label transition-colors ${
                  visibilityFilter === v.id
                    ? 'bg-surface-raised text-ink font-semibold border border-line shadow-elevation-1'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Search Input & Batch Operations */}
        <div className="flex items-center gap-2.5 flex-1 lg:max-w-md justify-end">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-ink-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`在 ${categoryLabel(activeCategory)} 中搜索...`}
              className="w-full rounded-xl border border-line-subtle bg-well pl-8 pr-7 py-1.5 text-body-sm text-ink placeholder:text-ink-subtle outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {canWrite && (
            <div className="flex items-center gap-1.5 shrink-0">
              {activeStats.unrouted > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSmartMatchTargetModel(null);
                    setSmartMatchOpen(true);
                  }}
                  disabled={batchOperating}
                  className="text-micro h-8 px-2.5 bg-brand/15 hover:bg-brand/25 border-brand/35 text-brand font-bold shadow-elevation-1"
                  title="查看候选；需人工核实后审核映射"
                >
                  <Zap className="size-3 mr-1" />
                  查看候选 ({activeStats.unrouted})
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={batchHideUnrouted}
                disabled={batchOperating}
                className="text-micro h-8 px-2 text-ink-muted"
                title="隐藏当前分类下无通道可用模型"
              >
                收起无通道
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* MODEL LIST CARD */}
      <Card>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line-subtle bg-surface-raised rounded-t-xl">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink text-card-title">{categoryLabel(activeCategory)} 列表</span>
            <span className="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-micro font-medium border border-brand/20">
              {currentCategoryModels.length} 个模型
            </span>
          </div>

          <div className="text-caption text-ink-muted hidden sm:flex items-center gap-3">
            <span>置顶模型 📌 排在首位</span>
            <span>·</span>
            <span>公开目录按服务端准入条件更新</span>
          </div>
        </div>

        {/* New Model Creation Form Inline */}
        {editingId === '__new__' && renderEditForm()}

        {/* Model Rows */}
        {currentCategoryModels.length === 0 && editingId !== '__new__' ? (
          <div className="px-4 py-16 text-center text-body-sm text-ink-muted space-y-3">
            <p>{search ? '没有匹配的模型' : `当前 ${categoryLabel(activeCategory)} 下暂无上架模型`}</p>
            {canWrite && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRepoDrawerOpen(true)}
                className="text-xs"
              >
                <Plus className="size-3.5 mr-1" />
                从模型库挑选并加入当前分类
              </Button>
            )}
          </div>
        ) : (
          currentCategoryModels.map((model, idx) => renderModelRow(model, idx))
        )}
      </Card>

      {/* ─── Model Repository Ingestion Drawer (随时从模型库增加模型) ───────── */}
      <ModelRepositoryDrawer
        isOpen={repoDrawerOpen}
        onClose={() => setRepoDrawerOpen(false)}
        activeCategory={activeCategory}
        categoryLabel={categoryLabel(activeCategory)}
        allModels={models}
        canWrite={canWrite}
        onAddModel={handleDrawerAddModel}
        onCreateCustomModel={handleDrawerCreateCustomModel}
        onSelectForEdit={(m) => startEdit(m)}
      />

      {/* ─── Studio Live Fig 2 Dropdown Simulator (所见即所得图2极简下拉器) ──── */}
      <StudioLivePreviewer
        isOpen={previewerOpen}
        onClose={() => setPreviewerOpen(false)}
        activeCategory={activeCategory}
        categoryLabel={categoryLabel(activeCategory)}
        visibleModels={models.filter((m) =>
          (activeCategory === 'all' || String(m.category || '').startsWith(activeCategory))
          && describeAvailability(m, publicDirectory).label === '目录可选')}
      />

      {/* ─── Channel Safety Guard Modal (无可用渠道二次确认弹窗) ─────────────── */}
      <UnroutedConfirmModal
        model={unroutedConfirmModel?.model}
        onSmartMatch={(m) => {
          setUnroutedConfirmModel(null);
          setSmartMatchTargetModel(m);
          setSmartMatchOpen(true);
        }}
        onConfirm={() => {
          if (unroutedConfirmModel?.targetCategory) {
            executeAddModelToCategory(unroutedConfirmModel.model, unroutedConfirmModel.targetCategory);
          } else if (unroutedConfirmModel?.model) {
            executeToggleVisibility(unroutedConfirmModel.model, true);
          }
          setUnroutedConfirmModel(null);
        }}
        onCancel={() => setUnroutedConfirmModel(null)}
      />

      {/* ─── Smart Match & Routing Center Modal (智能通道极速匹配中枢) ───────── */}
      <SmartMatchModal
        isOpen={smartMatchOpen}
        onClose={() => {
          setSmartMatchOpen(false);
          setSmartMatchTargetModel(null);
        }}
        initialModel={smartMatchTargetModel}
        allModels={models}
        activeCategory={activeCategory}
        onModelActivated={(updatedModel) => {
          setModels((prev) =>
            prev.map((m) =>
              m.id === updatedModel.id
                ? {
                    ...m,
                    routes: Math.max(1, Number(m.routes || 0) + 1),
                    approved_routes: Math.max(1, Number(m.approved_routes || 0) + 1),
                    provider: updatedModel.provider || m.provider,
                  }
                : m
            )
          );
          if (editingId === updatedModel.id) {
            setCheckResult({ ok: true, msg: `渠道已就绪 (${updatedModel.provider} · 激活成功)` });
            setInlineCandidates([]);
          }
          showToast(`已成功激活模型渠道：${updatedModel.id} ✓`);
        }}
        onBatchCompleted={(result) => {
          if (result && Array.isArray(result.results)) {
            const matchedMap = new Map(
              result.results.filter((r) => r.ok).map((r) => [r.modelId, r.providerId])
            );
            setModels((prev) =>
              prev.map((m) =>
                matchedMap.has(m.id)
                  ? {
                      ...m,
                      routes: Math.max(1, Number(m.routes || 0) + 1),
                      approved_routes: Math.max(1, Number(m.approved_routes || 0) + 1),
                      provider: matchedMap.get(m.id) || m.provider,
                    }
                  : m
              )
            );
            showToast(`批量匹配完成！成功修复激活 ${result.matchedCount || 0} 个模型通道 ✓`);
          }
        }}
      />

      {/* ─── Model Hygiene & Deduplication Assistant ─────────────── */}
      <ModelHygieneDrawer
        isOpen={hygieneDrawerOpen}
        onClose={() => setHygieneDrawerOpen(false)}
        onHygieneCompleted={async () => {
          showToast('模型治理与收敛完成，正在刷新数据...');
          window.location.reload();
        }}
      />
    </div>
  );

  // ─── Inline Edit Form & Live Card Preview ──────────────────────────────
  function renderEditForm() {
    const isNew = editingId === '__new__';
    const previewName = editForm.display_name || '模型展示名称';
    const previewBadge = editForm.badge || 'New';
    const previewDesc = editForm.description || '超高质感写实，精准理解提示词，极速出图。';
    const previewCredits = editForm.credits || 50;

    return (
      <div className="border-t border-line-subtle bg-well/40 p-4 space-y-5 rounded-b-xl animate-fade-in">
        <div className="flex items-center justify-between border-b border-line-subtle pb-3">
          <div className="flex items-center gap-2">
            {!isNew && <BrandLogo model={editForm} size="sm" className="rounded-md" />}
            <h3 className="text-body font-semibold text-ink">
              {isNew ? '添加前台展示模型' : `编辑前台展示配置 · ${editForm.display_name || editForm.model_id}`}
            </h3>
          </div>

          {checkResult && (
            <span
              className={`text-caption flex items-center gap-1 font-medium ${
                checkResult.ok ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {checkResult.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
              {checkResult.msg}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Model Selector (for New) or Display Info */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-label text-ink-muted block font-medium">绑定模型 ID</label>
                {editForm.model_id && (
                  <span className="font-mono text-caption text-ink-subtle">ID: {editForm.model_id}</span>
                )}
              </div>

              {isNew ? (
                <div className="relative" ref={modelPickerRef}>
                  <input
                    type="text"
                    value={editForm.model_id ? `${editForm.display_name} (${editForm.model_id})` : ''}
                    readOnly
                    onClick={() => setModelPickerOpen((p) => !p)}
                    placeholder="点击从所有渠道模型库中选择要暴漏的模型..."
                    className="w-full rounded-xl border border-line-strong bg-surface-raised pl-3 pr-8 py-2 text-body text-ink cursor-pointer outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-ink-subtle pointer-events-none" />

                  {modelPickerOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-dropdown rounded-xl border border-line-strong bg-[#191c21] p-2 shadow-elevation-3 overflow-hidden">
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-ink-subtle" />
                        <input
                          type="text"
                          autoFocus
                          value={modelPickerSearch}
                          onChange={(e) => setModelPickerSearch(e.target.value)}
                          placeholder="搜索模型库 ID 或名称..."
                          className="w-full rounded-lg border border-line-subtle bg-white/[0.04] pl-8 pr-7 py-1.5 text-body-sm text-ink placeholder:text-ink-subtle outline-none focus:border-brand"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
                        {modelPickerOptions.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => handleSelectModel(m)}
                            className="flex items-center justify-between rounded-lg px-3 py-2 text-body-sm hover:bg-white/[0.06] cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <BrandLogo model={m} size="sm" className="rounded-md shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-ink truncate">{m.display_name || m.name}</div>
                                <div className="font-mono text-caption text-ink-subtle">{m.id}</div>
                              </div>
                            </div>
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-ink-muted shrink-0 ml-2">
                              {categoryLabel(m.category)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editForm.display_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="输入前台展示名称..."
                    className="flex-1 rounded-xl border border-line-strong bg-surface-raised px-3 py-2 text-body text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => runCheck(editForm.model_id)}
                    disabled={checking || !editForm.model_id}
                    className="shrink-0 h-10 px-3"
                  >
                    {checking ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <RefreshCw className="size-3.5 mr-1" />}
                    模拟路由
                  </Button>
                </div>
              )}

              {/* 💡 智能推荐渠道卡片 (如果存在高置信度候选或检测失败) */}
              {inlineCandidates.length > 0 && (
                <div className="mt-2.5 rounded-xl border border-brand/40 bg-brand/[0.05] p-3.5 space-y-2.5 animate-fade-in shadow-elevation-1">
                  <div className="flex items-center justify-between">
                    <span className="text-label font-bold text-ink flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-brand" />
                      💡 智能渠道推荐 (检测到该模型暂无可用通道)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const m = models.find((item) => item.id === editForm.model_id) || editForm;
                        setSmartMatchTargetModel(m);
                        setSmartMatchOpen(true);
                      }}
                      className="text-micro text-brand hover:underline font-medium"
                    >
                      查看全部备选供应商...
                    </button>
                  </div>

                  <div className="space-y-2">
                    {inlineCandidates.slice(0, 2).map((cand, idx) => (
                      <div
                        key={`${cand.providerId}-${cand.providerModelId}-${idx}`}
                        className="rounded-lg border border-line-subtle bg-white/[0.03] p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-ink text-body-sm">
                              {cand.providerName || cand.providerId}
                            </span>
                            <span className="font-mono text-caption text-ink-muted bg-white/[0.06] px-1.5 py-0.2 rounded">
                              {cand.providerModelId}
                            </span>
                            <span className="text-micro text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-bold">
                              匹配度 {Math.round(cand.confidence * 100)}%
                            </span>
                            {idx === 0 && (
                              <span className="text-[10px] bg-brand text-white font-bold px-1.5 py-0.2 rounded">
                                首选
                              </span>
                            )}
                          </div>
                          <div className="text-caption text-ink-subtle truncate">{cand.reason}</div>
                        </div>

                        <a href="/admin/models/routing" className="inline-flex h-8 shrink-0 items-center rounded-lg bg-brand px-3 text-label font-medium text-ink-on-accent">
                          核实并审核
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Badges Presets & Custom Badge */}
            <div>
              <label className="text-label text-ink-muted block font-medium mb-1.5">
                前台徽章标签 (如：4.5 旗舰 / New / Best / Hot)
              </label>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {PRESET_BADGES.map((b) => {
                  const isCur = editForm.badge === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, badge: isCur ? '' : b }))}
                      className={`rounded-full px-2.5 py-1 text-label transition-all ${
                        isCur
                          ? 'bg-brand text-white shadow-elevation-1 font-bold'
                          : 'bg-surface-raised border border-line text-ink-muted hover:text-ink'
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={editForm.badge || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, badge: e.target.value }))}
                placeholder="或自定义徽章文本（留空则不显示徽章）"
                className="w-full rounded-xl border border-line-subtle bg-surface-raised px-3 py-1.5 text-body-sm text-ink outline-none focus:border-brand"
              />
            </div>

            {/* Credits Price, Sub-type & Sort Order */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-label text-ink-muted block font-medium mb-1">
                  单次生成积分 (base_credits)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={editForm.credits ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                      setEditForm((f) => ({ ...f, credits: val }));
                    }}
                    min="1"
                    placeholder="如 50"
                    className="w-full rounded-xl border border-line-strong bg-surface-raised pl-3 pr-10 py-2 text-body text-ink outline-none focus:border-brand font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-ink-subtle pointer-events-none">
                    积分
                  </span>
                </div>
              </div>

              <div>
                <label className="text-label text-ink-muted block font-medium mb-1">子类型归属</label>
                <select
                  value={editForm.sub_type || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, sub_type: e.target.value }))}
                  className="w-full rounded-xl border border-line-strong bg-surface-raised px-3 py-2 text-body text-ink outline-none focus:border-brand [&>option]:bg-[#131519]"
                >
                  <option value="">未指定 (通用)</option>
                  <option value="t2i">文生图 (T2I)</option>
                  <option value="i2i">图生图 (I2I)</option>
                  <option value="t2v">文生视频 (T2V)</option>
                  <option value="i2v">图生视频 (I2V)</option>
                  <option value="v2v">视频编辑 (V2V)</option>
                  <option value="music">音乐生成</option>
                  <option value="tts">语音 (TTS)</option>
                  <option value="chat">智能对话</option>
                  <option value="reasoning">深度推理</option>
                </select>
              </div>

              <div>
                <label className="text-label text-ink-muted block font-medium mb-1">排序权重 (越小越靠前)</label>
                <input
                  type="number"
                  value={editForm.sort}
                  onChange={(e) => setEditForm((f) => ({ ...f, sort: e.target.value }))}
                  className="w-full rounded-xl border border-line-strong bg-surface-raised px-3 py-2 text-body text-ink outline-none focus:border-brand"
                  min="0"
                />
              </div>
            </div>

            {/* Model Description */}
            <div>
              <label className="text-label text-ink-muted block font-medium mb-1">
                前台能力描述 (支持多语言或特性概括)
              </label>
              <textarea
                value={editForm.description || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="例如：超高质感写实，精准理解提示词，极速出图。"
                className="w-full rounded-xl border border-line-strong bg-surface-raised px-3 py-2 text-body text-ink outline-none resize-none focus:border-brand"
              />
            </div>

            {/* Capabilities Matrix Builder (画幅比例、分辨率、时长与能力特性) */}
            <div className="rounded-xl border border-line-subtle bg-white/[0.02] p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-line-subtle pb-2">
                <span className="text-label font-bold text-ink flex items-center gap-1.5">
                  <Layers className="size-3.5 text-brand" />
                  模型能力与参数矩阵 (Capabilities Matrix)
                </span>
                <span className="text-caption text-ink-subtle">
                  定义前台画板支持的参数档位
                </span>
              </div>

              {/* Supported Ratios */}
              <div>
                <label className="text-caption text-ink-muted block mb-1.5">
                  支持画幅比例 (点击切换可选比例)
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_RATIOS.map((ratio) => {
                    const isSelected = (editForm.supported_ratios || []).includes(ratio);
                    return (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => {
                          const cur = editForm.supported_ratios || [];
                          const next = isSelected ? cur.filter((r) => r !== ratio) : [...cur, ratio];
                          setEditForm((f) => ({ ...f, supported_ratios: next }));
                        }}
                        className={`rounded-full px-2.5 py-0.5 text-caption font-mono transition-all ${
                          isSelected
                            ? 'bg-brand text-white font-bold shadow-elevation-1'
                            : 'bg-surface-raised border border-line text-ink-muted hover:text-ink'
                        }`}
                      >
                        {ratio}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Supported Resolutions */}
              <div>
                <label className="text-caption text-ink-muted block mb-1.5">
                  支持分辨率规格 (点击切换可选分辨率)
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESET_RESOLUTIONS.map((res) => {
                    const isSelected = (editForm.supported_resolutions || []).includes(res);
                    return (
                      <button
                        key={res}
                        type="button"
                        onClick={() => {
                          const cur = editForm.supported_resolutions || [];
                          const next = isSelected ? cur.filter((r) => r !== res) : [...cur, res];
                          setEditForm((f) => ({ ...f, supported_resolutions: next }));
                        }}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-mono transition-all ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                            : 'bg-surface-raised border border-line text-ink-muted hover:text-ink'
                        }`}
                      >
                        {res}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Supported Durations (only for video or audio) */}
              {(editForm.category === 'video' || editForm.category === 'audio' || activeCategory === 'video' || activeCategory === 'audio') && (
                <div>
                  <label className="text-caption text-ink-muted block mb-1.5">
                    可选生成时长 (秒)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PRESET_DURATIONS.map((dur) => {
                      const isSelected = (editForm.supported_durations || []).includes(dur);
                      return (
                        <button
                          key={dur}
                          type="button"
                          onClick={() => {
                            const cur = editForm.supported_durations || [];
                            const next = isSelected ? cur.filter((d) => d !== dur) : [...cur, dur];
                            setEditForm((f) => ({ ...f, supported_durations: next }));
                          }}
                          className={`rounded-full px-2.5 py-0.5 text-caption font-mono transition-all ${
                            isSelected
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                              : 'bg-surface-raised border border-line text-ink-muted hover:text-ink'
                          }`}
                        >
                          {dur}s
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Advanced feature flags */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(editForm.capabilities?.hires_fix)}
                    onChange={(e) => setEditForm((f) => ({
                      ...f,
                      capabilities: { ...(f.capabilities || {}), hires_fix: e.target.checked }
                    }))}
                    className="rounded size-3.5"
                  />
                  <span>高清修复 (Hires Fix)</span>
                </label>

                <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(editForm.capabilities?.seed_control !== false)}
                    onChange={(e) => setEditForm((f) => ({
                      ...f,
                      capabilities: { ...(f.capabilities || {}), seed_control: e.target.checked }
                    }))}
                    className="rounded size-3.5"
                  />
                  <span>支持指定种子 (Seed)</span>
                </label>

                <label className="flex items-center gap-2 text-caption text-ink-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(editForm.capabilities?.camera_control)}
                    onChange={(e) => setEditForm((f) => ({
                      ...f,
                      capabilities: { ...(f.capabilities || {}), camera_control: e.target.checked }
                    }))}
                    className="rounded size-3.5"
                  />
                  <span>运镜与控制 (Camera Control)</span>
                </label>
              </div>
            </div>

            {/* Switches */}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(editForm.is_visible)}
                  onChange={(e) => setEditForm((f) => ({ ...f, is_visible: e.target.checked }))}
                  className="rounded accent-brand size-4"
                />
                <span className="font-semibold text-brand">在前台模型库展示 (is_visible)</span>
              </label>

              <label className="flex items-center gap-2 text-body-sm text-amber-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(editForm.is_pinned)}
                  onChange={(e) => setEditForm((f) => ({ ...f, is_pinned: e.target.checked }))}
                  className="rounded accent-amber-500 size-4"
                />
                <Pin className="size-3.5 fill-amber-300" />
                <span>前台列表置顶 📌</span>
              </label>

              <label className="flex items-center gap-2 text-body-sm text-ink-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(editForm.is_featured)}
                  onChange={(e) => setEditForm((f) => ({ ...f, is_featured: e.target.checked }))}
                  className="rounded size-4"
                />
                <span>标记为推荐 ⭐</span>
              </label>
            </div>
          </div>

          {/* Right: LIVE CARD PREVIEW (matching Fig 2 & Fig 3 UI) */}
          <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-2xl bg-surface-raised border border-line shadow-elevation-2">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-line-subtle pb-2">
                <span className="text-caption font-semibold text-ink-subtle uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="size-3.5 text-brand" />
                  前台卡片效果即时预览 (Studio Live Preview)
                </span>
                <span className="rounded-full bg-well px-2 py-0.5 text-micro text-ink-muted">
                  参考图2、图3
                </span>
              </div>

              {/* High-Fidelity Preview Card */}
              <div className="rounded-xl border border-line-strong bg-surface p-3.5 shadow-elevation-1 space-y-2 relative overflow-hidden transition-all hover:border-brand/40">
                <div className="flex items-start gap-3">
                  {/* Emblem Avatar */}
                  <div className="size-9 rounded-xl border border-line flex items-center justify-center bg-brand/10 text-brand font-black text-sm shrink-0 shadow-elevation-1">
                    {previewName.charAt(0) || 'M'}
                  </div>

                  {/* Title & Badges */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body font-bold text-ink truncate">{previewName}</span>
                      {previewBadge && (
                        <span className="rounded-full bg-brand/20 text-brand px-2 py-0.2 text-[10px] font-bold border border-brand/30">
                          {previewBadge}
                        </span>
                      )}
                      {editForm.is_pinned && (
                        <span className="rounded-full bg-amber-500/20 text-amber-300 px-1.5 py-0.2 text-[9px] font-bold border border-amber-500/30 flex items-center gap-0.5">
                          <Pin className="size-2 fill-amber-300" /> 置顶
                        </span>
                      )}
                    </div>

                    {/* Subtype & Tag */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-caption text-ink-subtle font-mono text-[11px]">
                        {editForm.sub_type ? editForm.sub_type.toUpperCase() : 'AI MODEL'}
                      </span>
                      <span className="text-ink-subtle">·</span>
                      <span className="text-caption text-brand/80 font-medium">
                        {previewCredits} 积分 / 次
                      </span>
                    </div>

                    {/* Description */}
                    <p className="mt-1 text-caption text-ink-muted leading-relaxed line-clamp-2">
                      {previewDesc}
                    </p>
                  </div>

                  {/* Selected checkmark indicator */}
                  <div className="size-5 rounded-full bg-brand flex items-center justify-center text-white shrink-0 shadow-elevation-1">
                    <Check className="size-3 stroke-[3]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-line-subtle mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setCheckResult(null);
                }}
              >
                <X className="size-3.5 mr-1" />
                取消
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={saveEdit}
                disabled={saving === (editForm.model_id || editingId)}
              >
                {saving === (editForm.model_id || editingId) ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Save className="size-3.5 mr-1" />
                )}
                保存展示配置
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Model Row ────────────────────────────────────────────────────────
  function renderModelRow(model, index) {
    const isEditing = editingId === model.id;
    const isSaving = saving === model.id;
    const isVisible = Boolean(model.is_visible);
    const hasRoutes = (model.approved_routes ?? 0) > 0;
    const availability = describeAvailability(model, publicDirectory);

    return (
      <div
        key={model.id}
        className={`group border-b border-line-subtle last:border-b-0 transition-colors ${
          isVisible ? 'hover:bg-white/[0.015]' : 'bg-white/[0.008] opacity-80 hover:opacity-100'
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Index & Quick Move Up/Down */}
          <div className="flex flex-col items-center justify-center w-7 shrink-0 text-center">
            {canWrite && index > 0 && (
              <button
                type="button"
                onClick={() => moveModel(model, 'up')}
                className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-ink transition-opacity p-0.5"
                title="上移此模型"
              >
                <ChevronUp className="size-3" />
              </button>
            )}
            <span className="font-mono text-caption text-ink-subtle">{index + 1}</span>
            {canWrite && index < currentCategoryModels.length - 1 && (
              <button
                type="button"
                onClick={() => moveModel(model, 'down')}
                className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-ink transition-opacity p-0.5"
                title="下移此模型"
              >
                <ChevronDown className="size-3" />
              </button>
            )}
          </div>

          {/* Model Information */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <BrandLogo model={model} size="sm" className="rounded-md shrink-0" />
              <span className={`text-body font-bold truncate ${isVisible ? 'text-ink' : 'text-ink-muted'}`}>
                {model.display_name || model.name}
              </span>

              {/* Badges */}
              {model.badge && (
                <span className="rounded-full bg-brand/15 text-brand px-2 py-0.5 text-micro font-semibold border border-brand/25">
                  {model.badge}
                </span>
              )}

              {model.is_pinned && (
                <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5 text-micro font-semibold border border-amber-500/30 flex items-center gap-0.5 shadow-elevation-1">
                  <Pin className="size-2.5 fill-amber-300" /> 前台置顶
                </span>
              )}

              <StatusBadge status={TIER_COLORS[model.tier] || 'neutral'} size="sm">
                {TIER_LABELS[model.tier] || model.tier}
              </StatusBadge>

              <span title={availability.detail} className={`rounded-full border px-2 py-0.5 text-micro font-medium ${
                availability.tone === 'success'
                  ? 'border-success-line bg-success-soft text-success'
                  : availability.tone === 'warning'
                    ? 'border-warning-line bg-warning-soft text-warning'
                    : 'border-line-subtle bg-well text-ink-muted'
              }`}>
                {availability.label} · {availability.detail}
              </span>

              {model.is_featured && (
                <span className="rounded-full bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 text-micro border border-yellow-500/25">
                  推荐
                </span>
              )}

              {/* Channel Readiness Status */}
              {hasRoutes ? (
                model.healthy_routes > 0 ? (
                  <span className="rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-micro border border-emerald-500/25 flex items-center gap-1 font-medium">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {model.healthy_routes}/{model.approved_routes} 已审且供应商启用
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-micro border border-amber-500/25 flex items-center gap-1 font-medium">
                    <AlertTriangle className="size-2.5" />
                    {model.approved_routes} 已审通道待核验
                  </span>
                )
              ) : (
                <div className="flex items-center gap-1">
                  <span className="rounded-full bg-red-500/15 text-red-400 px-1.5 py-0.5 text-micro border border-red-500/25 flex items-center gap-0.5">
                    <AlertTriangle className="size-2.5" /> 无可用通道
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSmartMatchTargetModel(model);
                      setSmartMatchOpen(true);
                    }}
                    className="rounded-full bg-brand/15 hover:bg-brand/25 text-brand px-2 py-0.5 text-micro border border-brand/30 flex items-center gap-1 transition-colors font-bold shadow-elevation-1"
                    title="查看候选并进入人工审核"
                  >
                    <Zap className="size-2.5" /> 查看候选
                  </button>
                </div>
              )}

              {/* 24h Real Telemetry Badge */}
              {Number(model.calls_24h || 0) > 0 ? (
                <span className="rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 text-micro font-mono flex items-center gap-1">
                  <span>24h: {model.calls_24h} 次</span>
                  <span>·</span>
                  <span>{model.success_rate_24h}%</span>
                </span>
              ) : (
                <span className="rounded-full bg-white/[0.03] text-ink-subtle px-2 py-0.5 text-micro font-mono">
                  24h 0 次
                </span>
              )}
            </div>

            {/* Sub-line */}
            <div className="mt-1 flex items-center gap-2 flex-wrap text-caption text-ink-muted">
              <span className="font-mono text-ink-subtle">{model.id}</span>
              <span>·</span>
              <span className="rounded bg-white/[0.04] px-1.5 py-0.2 text-[10px] text-ink-muted">
                {model.sub_type ? model.sub_type.toUpperCase() : categoryLabel(model.category)}
              </span>
              {model.base_credits > 0 && (
                <>
                  <span>·</span>
                  <span className="font-mono text-brand font-medium">{model.base_credits} 积分</span>
                </>
              )}
              {Array.isArray(model.supported_ratios) && model.supported_ratios.length > 0 && (
                <>
                  <span>·</span>
                  <span className="text-[10px] text-ink-subtle">
                    {model.supported_ratios.length} 种比例
                  </span>
                </>
              )}
            </div>

            {model.description && (
              <p className="mt-1 text-caption text-ink-muted line-clamp-1">{model.description}</p>
            )}
          </div>

          {/* Controls & Visibility Toggle (展示控制) */}
          <div className="flex items-center gap-2 shrink-0">
            {canWrite && (
              <>
                {/* PROMINENT VISIBILITY TOGGLE SWITCH */}
                <button
                  type="button"
                  onClick={() => toggleVisibility(model)}
                  disabled={isSaving}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label font-medium transition-all border ${
                    isVisible
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25 shadow-elevation-1'
                      : 'bg-white/[0.04] text-ink-subtle border-line-subtle hover:bg-white/[0.08] hover:text-ink'
                  }`}
                  title={isVisible ? '关闭展示意向' : '开启展示意向；仍需通过目录准入'}
                >
                  {isSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isVisible ? (
                    <>
                      <Eye className="size-3.5 text-emerald-400" />
                      <span>展示已开</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="size-3.5" />
                      <span>展示关闭</span>
                    </>
                  )}
                </button>

                {/* Quick Pin Toggle */}
                <button
                  type="button"
                  onClick={() => togglePinned(model)}
                  disabled={isSaving}
                  className={`rounded-lg p-2 transition-colors ${
                    model.is_pinned
                      ? 'text-amber-400 bg-amber-400/15 hover:bg-amber-400/25'
                      : 'text-ink-subtle hover:bg-white/[0.06] hover:text-ink'
                  }`}
                  title={model.is_pinned ? '取消前台置顶' : '置顶在前台列表首位'}
                >
                  <Pin className={`size-3.5 ${model.is_pinned ? 'fill-amber-400' : ''}`} />
                </button>

                {/* Quick Featured Toggle */}
                <button
                  type="button"
                  onClick={() => toggleFeatured(model)}
                  disabled={isSaving}
                  className={`rounded-lg p-2 transition-colors ${
                    model.is_featured
                      ? 'text-yellow-400 bg-yellow-400/15 hover:bg-yellow-400/25'
                      : 'text-ink-subtle hover:bg-white/[0.06] hover:text-ink'
                  }`}
                  title={model.is_featured ? '取消推荐' : '标记为推荐'}
                >
                  {model.is_featured ? (
                    <Star className="size-3.5 fill-yellow-400" />
                  ) : (
                    <StarOff className="size-3.5" />
                  )}
                </button>

                {/* Edit Details */}
                <button
                  type="button"
                  onClick={() => (isEditing ? setEditingId(null) : startEdit(model))}
                  disabled={isSaving}
                  className="rounded-lg p-2 text-ink-subtle hover:bg-white/[0.06] hover:text-ink transition-colors"
                  title="编辑展示名称、描述、徽章"
                >
                  <Pencil className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Inline Edit Form */}
        {isEditing && renderEditForm()}
      </div>
    );
  }
}
