'use client';

import { useState, useMemo } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import BrandLogo from '@/components/admin/BrandLogo';
import {
  Search, Layers, Eye, EyeOff, Shield, Zap, ChevronDown,
  Image, Video, Music, Workflow, Loader2,
} from 'lucide-react';

const CATEGORY_LABELS = { image: '图像', video: '视频', audio: '音乐', workflow: '工作流' };
const CATEGORY_COLORS = {
  image: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  video: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  audio: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  workflow: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};
const TIER_TONES = { core: 'good', backup: 'neutral', experimental: 'warn', disabled: 'danger' };
const TIER_LABELS = { core: 'Core 核心', backup: 'Backup 备用', experimental: '实验', disabled: '停用' };
const ROUTING_LABELS = { cost: '成本优先', balanced: '智能平衡', quality: '质量优先', stability: '稳定优先' };

export default function RegistryClient({ initialModels = [], canWrite = false }) {
  const [models, setModels] = useState(initialModels);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [busy, setBusy] = useState('');

  // Inline edit state
  const [editTier, setEditTier] = useState('');
  const [editVisible, setEditVisible] = useState(true);
  const [editAutoRoute, setEditAutoRoute] = useState(false);
  const [editBackup, setEditBackup] = useState('');

  const stats = useMemo(() => ({
    total: models.length,
    core: models.filter((m) => m.tier === 'core').length,
    experimental: models.filter((m) => m.tier === 'experimental').length,
    noRoutes: models.filter((m) => m.approved_route_count === 0).length,
  }), [models]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return models.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (tierFilter !== 'all' && m.tier !== tierFilter) return false;
      if (kw && ![m.id, m.name, m.display_name].some((v) => String(v || '').toLowerCase().includes(kw))) return false;
      return true;
    });
  }, [models, search, categoryFilter, tierFilter]);

  function openEdit(model) {
    setExpandedId(expandedId === model.id ? null : model.id);
    setEditTier(model.tier || 'backup');
    setEditVisible(model.is_visible !== false);
    setEditAutoRoute(Boolean(model.auto_route_eligible));
    setEditBackup(model.backup_model_id || '');
  }

  async function saveTiering(modelId) {
    setBusy(modelId);
    try {
      const res = await fetch('/api/admin/models/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_model_tiering',
          modelId,
          tier: editTier,
          isVisible: editVisible,
          autoRouteEligible: editAutoRoute,
          backupModelId: editBackup || null,
        }),
      });
      if (res.ok) {
        setModels((prev) =>
          prev.map((m) =>
            m.id === modelId
              ? { ...m, tier: editTier, is_visible: editVisible, auto_route_eligible: editAutoRoute, backup_model_id: editBackup || null }
              : m
          )
        );
        setExpandedId(null);
      } else {
        const data = await res.json();
        alert(data.error?.message || '保存失败');
      }
    } catch (err) {
      alert('保存出错: ' + err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-6">
      {/* 指标 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="模型总数" value={stats.total} hint="已注册的规范模型" tone="info" />
        <MetricCard label="核心模型" value={stats.core} hint="前台精选展示" tone="good" />
        <MetricCard label="实验模型" value={stats.experimental} hint="后台灰度测试" tone="warn" />
        <MetricCard label="无可用通道" value={stats.noRoutes} hint="尚无已审核路由" tone={stats.noRoutes > 0 ? 'danger' : 'neutral'} />
      </div>

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型名称或 ID..."
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
        >
          <option value="all">全部类型</option>
          <option value="image">图像</option>
          <option value="video">视频</option>
          <option value="audio">音乐</option>
          <option value="workflow">工作流</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
        >
          <option value="all">全部分级</option>
          <option value="core">Core 核心</option>
          <option value="backup">Backup 备用</option>
          <option value="experimental">实验</option>
          <option value="disabled">停用</option>
        </select>
        <span className="text-xs text-gray-500">{filtered.length} 个模型</span>
      </div>

      {/* 模型列表 */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-surface/90 shadow-xl backdrop-blur-md">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/[0.08] bg-white/[0.02] uppercase tracking-[0.06em] text-gray-400">
            <tr>
              <th className="px-4 py-3.5">模型</th>
              <th className="px-4 py-3.5">类型</th>
              <th className="px-4 py-3.5">分级</th>
              <th className="px-4 py-3.5">可见</th>
              <th className="px-4 py-3.5">路由映射</th>
              <th className="px-4 py-3.5">调度策略</th>
              <th className="px-4 py-3.5">积分</th>
              <th className="px-4 py-3.5">今日 / 30日</th>
              <th className="px-4 py-3.5">失败率</th>
              <th className="px-4 py-3.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {filtered.map((m) => {
              const failureRate = m.calls_30d > 0 ? ((m.failures_30d / m.calls_30d) * 100).toFixed(1) : null;
              const isExpanded = expandedId === m.id;

              return (
                <tr key={m.id} className="group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <BrandLogo model={m} size="sm" className="rounded-md shrink-0" />
                      <div>
                        <span className="block font-semibold text-white">{m.display_name || m.name}</span>
                        <span className="block font-mono text-[10px] text-gray-500 mt-0.5">{m.id}</span>
                        {m.backup_model_id && (
                          <span className="block text-[10px] text-gray-500 mt-0.5">→ 备用: {m.backup_model_id}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 font-medium border ${CATEGORY_COLORS[m.category] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                      {CATEGORY_LABELS[m.category] || m.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={TIER_TONES[m.tier] || 'neutral'}>
                      {TIER_LABELS[m.tier] || m.tier || '未设置'}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    {m.is_visible !== false ? (
                      <Eye className="size-3.5 text-emerald-400" />
                    ) : (
                      <EyeOff className="size-3.5 text-gray-500" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-white">{m.approved_route_count}</span>
                    <span className="text-gray-500"> / {m.route_count}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {ROUTING_LABELS[m.routing_mode] || m.routing_mode || '成本优先'}
                  </td>
                  <td className="px-4 py-3 font-mono text-cyan-400">
                    {m.base_credits ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-300">
                    {m.calls_today} / {m.calls_30d}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {failureRate === null ? (
                      <span className="text-gray-500">—</span>
                    ) : (
                      <span className={Number(failureRate) >= 5 ? 'text-red-400 font-bold' : 'text-gray-300'}>
                        {failureRate}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(m)}
                      className="rounded p-1.5 text-gray-400 hover:bg-white/[0.06] hover:text-cyan-400 transition-colors"
                    >
                      <ChevronDown className={`size-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="px-4 py-10 text-center text-xs text-gray-500">当前筛选下没有模型记录。</p>
        )}
      </div>

      {/* 展开编辑面板 */}
      {expandedId && (
        <Card className="border-cyan-500/20 bg-cyan-950/5">
          <h3 className="text-sm font-semibold text-white mb-4">
            编辑模型分层: {models.find((m) => m.id === expandedId)?.display_name || expandedId}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">模型分级 (Tier)</label>
              <select
                value={editTier}
                onChange={(e) => setEditTier(e.target.value)}
                disabled={!canWrite}
                className="w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none disabled:opacity-50"
              >
                <option value="core">Core 核心模型</option>
                <option value="backup">Backup 备用模型</option>
                <option value="experimental">Experimental 实验模型</option>
                <option value="disabled">Disabled 停用模型</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">前台可见性</label>
              <select
                value={editVisible ? 'true' : 'false'}
                onChange={(e) => setEditVisible(e.target.value === 'true')}
                disabled={!canWrite}
                className="w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none disabled:opacity-50"
              >
                <option value="true">前台可见</option>
                <option value="false">前台隐藏</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">自动路由</label>
              <select
                value={editAutoRoute ? 'true' : 'false'}
                onChange={(e) => setEditAutoRoute(e.target.value === 'true')}
                disabled={!canWrite}
                className="w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none disabled:opacity-50"
              >
                <option value="true">参与自动路由</option>
                <option value="false">不参与</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">备用模型</label>
              <select
                value={editBackup}
                onChange={(e) => setEditBackup(e.target.value)}
                disabled={!canWrite}
                className="w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">未指定</option>
                {models.filter((m) => m.id !== expandedId).map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name || m.name} ({m.id})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              disabled={!canWrite || busy === expandedId}
              onClick={() => saveTiering(expandedId)}
              className="bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold"
            >
              {busy === expandedId ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
              保存分层配置
            </Button>
            <Button
              variant="ghost"
              onClick={() => setExpandedId(null)}
              className="text-gray-400 hover:text-white text-xs"
            >
              取消
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
