'use client';

import { useState, useMemo } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import BrandLogo from '@/components/admin/BrandLogo';
import {
  Route, Play, Search, ChevronDown, Shield, Scale, Zap, Clock,
  Loader2, RefreshCw,
} from 'lucide-react';

/* ── helpers ── */
function money(value, currency = 'CNY', digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '未知';
  return `${Number(value).toFixed(digits)} ${currency}`;
}

function channelLabel(providerId, providers = []) {
  return providers.find((p) => p.id === providerId)?.name || providerId || '—';
}

function makeIdempotencyKey() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

const ROUTING_MODES = [
  { value: 'cost', label: '成本优先', icon: Scale, desc: '优先选择预估成本最低的健康渠道' },
  { value: 'quality', label: '质量优先', icon: Shield, desc: '优先选择质量评分最高的渠道' },
  { value: 'stability', label: '稳定优先', icon: Clock, desc: '优先选择成功率最高、延迟最低的渠道' },
  { value: 'balanced', label: '智能平衡', icon: Zap, desc: '综合成本、质量和稳定性多因素智能调度' },
];

function defaultSimulationParameters(model) {
  if (model?.id === 'bytedance-seedream-v3') {
    return { task_type: 't2i', num_images: 1, aspect_ratio: '1:1' };
  }
  return model?.category?.includes('video')
    ? { task_type: 't2v', duration: 5, resolution: '720p', quality: 'standard' }
    : { task_type: 't2i', num_images: 1, resolution: '1024x1024' };
}

export default function RoutingClient({ initialSnapshot, canWrite = false }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Simulator state
  const [simModelId, setSimModelId] = useState(initialSnapshot.models?.[0]?.id || '');
  const initialSimulatorModel = initialSnapshot.models?.find((model) => model.id === simModelId);
  const [paramsText, setParamsText] = useState(() => JSON.stringify(defaultSimulationParameters(initialSimulatorModel), null, 2));
  const [simulation, setSimulation] = useState(null);

  async function refreshSnapshot() {
    const res = await fetch('/api/admin/models/control', { cache: 'no-store' });
    const payload = await res.json();
    if (res.ok) setSnapshot(payload.data);
  }

  async function action(actionName, values = {}, { readOnly = false } = {}) {
    if (!readOnly && !canWrite) return null;
    setBusy(actionName); setError(''); setNotice('');
    try {
      const res = await fetch('/api/admin/models/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(readOnly ? {} : { 'Idempotency-Key': makeIdempotencyKey() }),
        },
        body: JSON.stringify({ action: actionName, ...values }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error?.message || '操作失败');
      const result = payload.data?.result || payload.data;
      if (actionName === 'simulate') setSimulation(result.simulation || result);
      else if (!readOnly) {
        setNotice(result.message || `${actionName} 已完成`);
        await refreshSnapshot();
      }
      return result;
    } catch (cause) {
      setError(cause.message || '操作失败');
      return null;
    } finally { setBusy(''); }
  }

  const filteredModels = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return (snapshot.models || []).filter((m) => {
      if (!kw) return true;
      return [m.id, m.name, m.display_name].some((v) => String(v || '').toLowerCase().includes(kw));
    });
  }, [snapshot.models, search]);

  const routingStats = useMemo(() => {
    const models = snapshot.models || [];
    return {
      total: models.length,
      cost: models.filter((m) => (m.routing_mode || 'cost') === 'cost').length,
      balanced: models.filter((m) => m.routing_mode === 'balanced').length,
      quality: models.filter((m) => m.routing_mode === 'quality').length,
      stability: models.filter((m) => m.routing_mode === 'stability').length,
    };
  }, [snapshot.models]);

  return (
    <div className="space-y-6">
      {/* 反馈消息 */}
      {notice && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">{notice}</div>}
      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">{error}</div>}

      {/* 指标 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="路由模型数" value={routingStats.total} hint="所有已注册的规范模型" tone="info" />
        <MetricCard label="成本优先" value={routingStats.cost} hint="按最低预估成本选路" tone="neutral" />
        <MetricCard label="智能平衡" value={routingStats.balanced} hint="综合多因素智能调度" tone="good" />
        <MetricCard label="质量/稳定" value={routingStats.quality + routingStats.stability} hint="偏重质量或稳定性" tone="neutral" />
      </div>

      {/* 路由策略参考 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROUTING_MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <Card key={mode.value} className="border-white/[0.06] hover:border-white/[0.12] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="size-4 text-brand" />
                <h3 className="text-xs font-semibold text-white">{mode.label}</h3>
              </div>
              <p className="text-[11px] text-gray-400 leading-5">{mode.desc}</p>
            </Card>
          );
        })}
      </div>

      {/* 搜索栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模型名称或 ID..."
            className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40"
          />
        </div>
        <span className="text-xs text-gray-500">{filteredModels.length} 个模型</span>
      </div>

      {/* 路由策略表 */}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-surface/90 shadow-xl backdrop-blur-md">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/[0.08] bg-white/[0.02] uppercase tracking-[0.06em] text-gray-400">
            <tr>
              <th className="px-4 py-3.5">模型</th>
              <th className="px-4 py-3.5">类型</th>
              <th className="px-4 py-3.5">路由策略</th>
              <th className="px-4 py-3.5">已审核通道</th>
              <th className="px-4 py-3.5">容灾备用</th>
              <th className="px-4 py-3.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {filteredModels.map((model) => {
              const approvedRoutes = (model.routes || []).filter(
                (r) => r.review_status === 'approved' && r.health_status !== 'unhealthy'
              );
              return (
                <tr key={model.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <BrandLogo model={model} size="sm" className="rounded-md shrink-0" />
                      <div>
                        <span className="block font-semibold text-white">{model.display_name || model.name}</span>
                        <span className="block font-mono text-[10px] text-gray-500 mt-0.5">{model.id}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{model.category}</td>
                  <td className="px-4 py-3">
                    <select
                      value={model.routing_mode || 'cost'}
                      onChange={(e) => action('routing_policy', { modelId: model.id, routingMode: e.target.value })}
                      disabled={!canWrite || busy === 'routing_policy'}
                      className="rounded border border-white/[0.12] bg-surface-raised px-2 py-1 text-xs text-white focus:border-brand focus:outline-none disabled:opacity-50"
                    >
                      {ROUTING_MODES.map((mode) => (
                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-white">{approvedRoutes.length}</span>
                    <span className="text-gray-500"> / {(model.routes || []).length}</span>
                    {approvedRoutes.length === 0 && (
                      <span className="ml-2 text-[10px] text-red-400">⚠ 无可用</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={model.failover_enabled ? 'good' : 'neutral'}>
                      {model.failover_enabled ? '已启用' : '未启用'}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        setSimModelId(model.id);
                        setParamsText(JSON.stringify(defaultSimulationParameters(model), null, 2));
                        document.getElementById('route-simulator')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="rounded p-1.5 text-gray-400 hover:bg-white/[0.06] hover:text-brand transition-colors"
                    >
                      <Play className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filteredModels.length && (
          <p className="px-4 py-10 text-center text-xs text-gray-500">当前搜索无匹配模型。</p>
        )}
      </div>

      {/* 路由模拟器 */}
      <Card id="route-simulator" className="border-white/[0.08]">
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,.75fr)_minmax(20rem,1.25fr)]">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Route className="size-4 text-brand" />
              模拟报价与选路解释
            </h2>
            <p className="text-xs text-gray-400 leading-5">
              只运行服务端报价和路由计算，不提交生成任务、不预扣积分。模拟与用户报价共用同一计价与候选筛选逻辑。
            </p>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">规范模型</label>
              <select
                value={simModelId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSimModelId(id);
                  const model = (snapshot.models || []).find((m) => m.id === id);
                  setParamsText(JSON.stringify(defaultSimulationParameters(model), null, 2));
                  setSimulation(null);
                }}
                className="w-full rounded-lg border border-white/[0.12] bg-surface-raised px-3 py-2 text-xs text-white focus:border-brand focus:outline-none"
              >
                {(snapshot.models || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name || m.name} · {m.id}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">本次规格 JSON</label>
              <textarea
                value={paramsText}
                onChange={(e) => setParamsText(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] p-3 font-mono text-xs text-white focus:border-brand focus:outline-none"
                spellCheck="false"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={async () => {
                  try {
                    await action('simulate', { modelId: simModelId, parameters: JSON.parse(paramsText) }, { readOnly: true });
                  } catch {
                    setError('规格 JSON 格式无效');
                  }
                }}
                disabled={busy === 'simulate'}
                className="rounded-xl bg-brand hover:bg-brand-hover text-white px-5 py-2 text-xs font-semibold shadow-sm transition-all"
              >
                {busy === 'simulate' ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Play className="mr-1 size-3" />}
                模拟报价
              </Button>
              {simulation?.selectedProviderId && (
                <StatusBadge tone="good">
                  选中 {channelLabel(simulation.selectedProviderId, snapshot.providers)} ·{' '}
                  {money(simulation.candidates?.find((c) => c.providerId === simulation.selectedProviderId)?.estimatedCostCny)}
                </StatusBadge>
              )}
            </div>
            {simulation && (
              <div className="grid gap-2 border-t border-white/[0.06] pt-3 text-xs">
                <p className="text-gray-200">
                  <span className="font-medium">为什么选这家：</span>
                  {simulation.selectionReason || '无合格渠道'}
                </p>
                <p className="text-gray-400">
                  站点售价 {simulation.sitePriceCny === null ? '未知' : money(simulation.sitePriceCny)} ·
                  用户扣减 {simulation.credits ?? '未知'} 积分 ·
                  毛利 {simulation.marginCheck?.grossMarginRate == null ? '未知' : `${(simulation.marginCheck.grossMarginRate * 100).toFixed(1)}%`}
                </p>
                {simulation.pricingError && (
                  <p className="text-amber-400">报价状态：{simulation.pricingError.message}</p>
                )}
                <div className="grid gap-2 pt-1">
                  {(simulation.candidates || []).map((c) => (
                    <div
                      key={`${c.providerId}:${c.providerModelId}`}
                      className="flex flex-wrap justify-between gap-2 rounded-lg border border-white/[0.06] px-3 py-2"
                    >
                      <span className="text-gray-200">{channelLabel(c.providerId, snapshot.providers)} · {c.providerModelId}</span>
                      <span className="font-mono text-gray-400">
                        {money(c.estimatedCostCny)} · 成功率 {(c.successRate * 100).toFixed(0)}% · {Math.round(c.latencyMs)} ms
                      </span>
                    </div>
                  ))}
                </div>
                {!!simulation.rejectedCandidates?.length && (
                  <details className="pt-1 text-gray-500">
                    <summary className="cursor-pointer text-xs">
                      查看 {simulation.rejectedCandidates.length} 个被拒候选与原因
                    </summary>
                    <ul className="mt-2 grid gap-1">
                      {simulation.rejectedCandidates.map((item, i) => (
                        <li key={`${item.providerId}-${i}`} className="text-[11px]">
                          {item.providerId} / {item.providerModelId}：{item.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
