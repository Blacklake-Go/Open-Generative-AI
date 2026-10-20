'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Cpu,
  RefreshCw,
  Search,
} from 'lucide-react';
import ModelBrandLogo from './ModelBrandLogo';
import { useModelDirectory } from '@/lib/hooks/useModelDirectory';
import { inferStudioTabFromModel } from '@/lib/studio-routes';

const CATEGORY_LABELS = {
  zh: { image: '图像', video: '视频', audio: '音频', text: '文本', llm: '文本', multimodal: '多模态' },
  en: { image: 'Image', video: 'Video', audio: 'Audio', text: 'Text', llm: 'Text', multimodal: 'Multimodal' },
};

function formatCalls(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return '—';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  return count.toLocaleString('en-US');
}

function formatLatency(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function formatPrice(model, isChinese) {
  if (model.pricingType === 'free') return isChinese ? '免费' : 'Free';
  const price = Number(model.creditsPrice);
  if (Number.isFinite(price) && price > 0) {
    return isChinese ? `${price} 算力点起` : `${price} credits from`;
  }
  return isChinese ? '按量计费' : 'Usage-based';
}

function categoryLabel(model, isChinese) {
  const key = String(model.category || '').toLowerCase();
  return CATEGORY_LABELS[isChinese ? 'zh' : 'en'][key] || model.category || (isChinese ? '通用' : 'General');
}

function categoryTab(model) {
  const category = String(model?.category || '').toLowerCase();
  if (category === 'video') return 'video';
  if (category === 'audio') return 'audio';
  if (category === 'text' || category === 'llm' || category === 'multimodal') return 'agents';
  return 'image';
}

function modelStats(telemetryById, model) {
  return telemetryById.get(String(model.id)) || null;
}

export default function ModelScreenerTable({
  locale = 'zh-CN',
  models: providedModels,
  telemetry: providedTelemetry,
  telemetryById: providedTelemetryById,
  loading: providedLoading,
  error: providedError,
  onRetry,
}) {
  const isChinese = Boolean(locale?.includes('zh'));
  const directory = useModelDirectory({ enabled: providedModels === undefined });
  const models = providedModels ?? directory.models;
  const telemetry = providedTelemetry ?? directory.telemetry;
  const telemetryById = providedTelemetryById ?? directory.telemetryById;
  const loading = providedLoading ?? directory.loading;
  const error = providedError ?? directory.error;
  const retry = onRetry ?? directory.reload;

  const modelsRoot = isChinese ? '/zh/models' : '/models';
  const studioRoot = isChinese ? '/zh/studio' : '/studio';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('calls');

  const copy = isChinese
    ? {
        title: '全部已上架模型',
        subtitle: `调用量、成功率与耗时来自过去 ${telemetry.range || '24h'} 的真实生成记录。`,
        syncing: '同步中',
        availableModels: `${models.length} 个可用模型`,
        search: '搜索模型、厂商或能力…',
        all: '全部',
        sortOptions: [
          { id: 'calls', label: '调用量优先' },
          { id: 'success', label: '成功率优先' },
          { id: 'latency', label: '耗时优先' },
          { id: 'name', label: '名称排序' },
        ],
        loadError: '模型数据暂时无法加载',
        retry: '重试',
        emptyTitle: '没有匹配的模型',
        emptyHint: '试试清空搜索词或切换分类。',
        headers: ['模型', '类别', '24h 调用', '成功率', '平均耗时', '价格', '状态', '操作'],
        available: '可创作',
        maintenance: '通道维护中',
        details: '详情',
        create: '创作',
        mobileCalls: '24h 调用',
        mobileSuccess: '成功率',
        mobileLatency: '平均耗时',
        mobileDetails: '查看详情',
        mobileCreate: '去创作',
      }
    : {
        title: 'All listed models',
        subtitle: `Call volume, success rate, and latency come from actual generation records in the last ${telemetry.range || '24h'}.`,
        syncing: 'Syncing',
        availableModels: `${models.length} available models`,
        search: 'Search models, providers, or capabilities…',
        all: 'All',
        sortOptions: [
          { id: 'calls', label: 'Most calls' },
          { id: 'success', label: 'Best success rate' },
          { id: 'latency', label: 'Lowest latency' },
          { id: 'name', label: 'Name' },
        ],
        loadError: 'Model data is temporarily unavailable',
        retry: 'Retry',
        emptyTitle: 'No matching models',
        emptyHint: 'Clear the search or switch category.',
        headers: ['Model', 'Category', '24h calls', 'Success', 'Avg latency', 'Price', 'Status', 'Actions'],
        available: 'Available',
        maintenance: 'Channel maintenance',
        details: 'Details',
        create: 'Create',
        mobileCalls: '24h calls',
        mobileSuccess: 'Success',
        mobileLatency: 'Avg latency',
        mobileDetails: 'Details',
        mobileCreate: 'Create',
      };

  const categories = useMemo(() => {
    const found = new Map();
    for (const model of models) {
      const key = String(model.category || 'other').toLowerCase();
      if (!found.has(key)) found.set(key, categoryLabel(model, isChinese));
    }
    return [...found.entries()].map(([id, label]) => ({ id, label }));
  }, [models, isChinese]);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = models.filter((model) => {
      if (category !== 'all' && String(model.category || '').toLowerCase() !== category) {
        return false;
      }
      if (!keyword) return true;
      return [model.name, model.displayName, model.id, model.provider, model.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });

    return filtered.sort((left, right) => {
      const leftStats = modelStats(telemetryById, left);
      const rightStats = modelStats(telemetryById, right);
      if (sort === 'name') {
        return String(left.displayName || left.name || '').localeCompare(
          String(right.displayName || right.name || ''),
          isChinese ? 'zh-CN' : 'en'
        );
      }
      if (sort === 'success') {
        return (rightStats?.successRate ?? -1) - (leftStats?.successRate ?? -1);
      }
      if (sort === 'latency') {
        const leftLatency = leftStats?.avgDurationMs > 0 ? leftStats.avgDurationMs : Number.POSITIVE_INFINITY;
        const rightLatency = rightStats?.avgDurationMs > 0 ? rightStats.avgDurationMs : Number.POSITIVE_INFINITY;
        return leftLatency - rightLatency;
      }
      return (rightStats?.totalCalls ?? -1) - (leftStats?.totalCalls ?? -1);
    });
  }, [models, query, category, sort, telemetryById, isChinese]);

  return (
    <section className="w-full">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand">Model inventory</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-ink">{copy.title}</h2>
          <p className="mt-1 text-xs text-ink-muted">{copy.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-muted">
          <Cpu className="h-3.5 w-3.5 text-brand" />
          {loading ? copy.syncing : copy.availableModels}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            className="w-full rounded-xl border border-line bg-canvas py-2.5 pl-9 pr-3 text-xs text-ink outline-none transition focus:border-brand"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
              category === 'all' ? 'bg-brand text-ink-on-accent' : 'bg-canvas text-ink-muted hover:text-ink'
            }`}
          >
            {copy.all}
          </button>
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                category === item.id ? 'bg-brand text-ink-on-accent' : 'bg-canvas text-ink-muted hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-[11px] text-ink-muted">
          <ArrowUpDown className="h-3.5 w-3.5" />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="bg-transparent text-[11px] font-semibold text-ink outline-none"
          >
            {copy.sortOptions.map((option) => (
              <option key={option.id} value={option.id} className="bg-surface text-ink">
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
          <p className="text-sm font-semibold text-ink">{copy.loadError}</p>
          <p className="mt-1 text-xs text-ink-muted">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-ink-on-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {copy.retry}
          </button>
        </div>
      ) : loading ? (
        <div className="overflow-hidden rounded-2xl border border-line">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex animate-pulse items-center gap-4 border-b border-line bg-surface p-4 last:border-b-0">
              <div className="h-10 w-10 rounded-xl bg-canvas" />
              <div className="h-4 w-40 rounded bg-canvas" />
              <div className="ml-auto h-4 w-20 rounded bg-canvas" />
              <div className="h-4 w-20 rounded bg-canvas" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center">
          <Search className="mx-auto h-6 w-6 text-ink-muted" />
          <p className="mt-3 text-sm font-semibold text-ink">{copy.emptyTitle}</p>
          <p className="mt-1 text-xs text-ink-muted">{copy.emptyHint}</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-canvas text-[11px] uppercase tracking-wider text-ink-muted">
                  {copy.headers.map((header, index) => (
                    <th key={header} className={`px-4 py-3 font-semibold ${index === copy.headers.length - 1 ? 'text-right' : ''}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((model) => {
                  const stats = modelStats(telemetryById, model);
                  const available = model.isActive !== false && model.hasWorkingRoute !== false;
                  const studioTab = inferStudioTabFromModel(model.id, categoryTab(model));
                  return (
                    <tr key={model.id} className="border-b border-line bg-surface last:border-b-0 hover:bg-canvas/60">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <ModelBrandLogo providerId={model.provider} provider={model.provider} modelId={model.id} />
                          <div className="min-w-0">
                            <Link href={`${modelsRoot}/${encodeURIComponent(model.id)}`} className="block truncate text-sm font-bold text-ink hover:text-brand">
                              {model.displayName || model.name}
                            </Link>
                            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                              {model.provider || 'SupDance'} · {model.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                          {categoryLabel(model, isChinese)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-ink">
                        {stats ? formatCalls(stats.totalCalls) : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        {stats && Number(stats.totalCalls) > 0 ? (
                          <span className={`inline-flex items-center gap-1 font-mono text-xs font-semibold ${
                            stats.successRate >= 99 ? 'text-emerald-500' : stats.successRate >= 95 ? 'text-amber-500' : 'text-red-500'
                          }`}>
                            <Activity className="h-3 w-3" />
                            {Number(stats.successRate).toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-ink-muted">
                          <Clock className="h-3 w-3" />
                          {stats ? formatLatency(stats.avgDurationMs) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-ink-muted">{formatPrice(model, isChinese)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${available ? 'text-emerald-500' : 'text-amber-500'}`}>
                          <CheckCircle2 className="h-3 w-3" />
                          {available ? copy.available : copy.maintenance}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`${modelsRoot}/${encodeURIComponent(model.id)}`}
                            className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted transition hover:text-ink"
                          >
                            {copy.details}
                          </Link>
                          {available ? (
                            <Link
                              href={`${studioRoot}?tab=${studioTab}&model=${encodeURIComponent(model.id)}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-ink-on-accent"
                            >
                              {copy.create}
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {rows.map((model) => {
              const stats = modelStats(telemetryById, model);
              const available = model.isActive !== false && model.hasWorkingRoute !== false;
              const studioTab = inferStudioTabFromModel(model.id, categoryTab(model));
              return (
                <article key={model.id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <ModelBrandLogo providerId={model.provider} provider={model.provider} modelId={model.id} />
                    <div className="min-w-0 flex-1">
                      <Link href={`${modelsRoot}/${encodeURIComponent(model.id)}`} className="block truncate text-sm font-bold text-ink">
                        {model.displayName || model.name}
                      </Link>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                        {model.provider || 'SupDance'} · {categoryLabel(model, isChinese)}
                      </p>
                    </div>
                    <span className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                      {formatPrice(model, isChinese)}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-canvas p-2">
                      <p className="text-[10px] text-ink-muted">{copy.mobileCalls}</p>
                      <p className="mt-1 font-mono text-xs font-bold text-ink">{stats ? formatCalls(stats.totalCalls) : '—'}</p>
                    </div>
                    <div className="rounded-xl bg-canvas p-2">
                      <p className="text-[10px] text-ink-muted">{copy.mobileSuccess}</p>
                      <p className="mt-1 font-mono text-xs font-bold text-ink">{stats && Number(stats.totalCalls) > 0 ? `${Number(stats.successRate).toFixed(1)}%` : '—'}</p>
                    </div>
                    <div className="rounded-xl bg-canvas p-2">
                      <p className="text-[10px] text-ink-muted">{copy.mobileLatency}</p>
                      <p className="mt-1 font-mono text-xs font-bold text-ink">{stats ? formatLatency(stats.avgDurationMs) : '—'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Link
                      href={`${modelsRoot}/${encodeURIComponent(model.id)}`}
                      className="flex-1 rounded-xl border border-line px-3 py-2 text-center text-[11px] font-semibold text-ink-muted"
                    >
                      {copy.mobileDetails}
                    </Link>
                    {available ? (
                      <Link
                        href={`${studioRoot}?tab=${studioTab}&model=${encodeURIComponent(model.id)}`}
                        className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand px-3 py-2 text-[11px] font-bold text-ink-on-accent"
                      >
                        {copy.mobileCreate}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
