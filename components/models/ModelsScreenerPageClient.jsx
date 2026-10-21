'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Cpu,
  Layers,
  RefreshCw,
  Zap,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import ModelScreenerTable from './ModelScreenerTable';
import ModelBrandLogo from './ModelBrandLogo';
import { useModelDirectory } from '@/lib/hooks/useModelDirectory';

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
  if (model?.pricingType === 'free') return isChinese ? '免费' : 'Free';
  const price = Number(model?.creditsPrice);
  if (Number.isFinite(price) && price > 0) return isChinese ? `${price} 算力点起` : `${price} credits from`;
  return isChinese ? '按量计费' : 'Usage-based';
}

export default function ModelsScreenerPageClient({ locale = 'en' }) {
  const isChinese = Boolean(locale?.includes('zh'));
  const { models, telemetry, telemetryById, loading, error, reload } = useModelDirectory({ range: '24h' });

  const activeById = useMemo(() => {
    const map = new Map();
    for (const model of models) {
      if (model.id) map.set(String(model.id), model);
      if (model.slug) map.set(String(model.slug), model);
    }
    return map;
  }, [models]);

  const topModels = useMemo(() => {
    const ranked = telemetry.models
      .map((item) => ({ stats: item, model: activeById.get(String(item.id)) }))
      .filter((item) => item.model)
      .slice(0, 4);
    if (ranked.length > 0) return ranked;
    return models.slice(0, 4).map((model) => ({ stats: null, model }));
  }, [telemetry.models, activeById, models]);

  const kpi = telemetry.kpi || {};
  const summaryCards = [
    {
      label: isChinese ? '24h 总调用' : '24h calls',
      value: loading ? '…' : error ? '—' : formatCalls(kpi.totalCalls),
      icon: BarChart3,
    },
    {
      label: isChinese ? '成功率' : 'Success rate',
      value: loading ? '…' : error ? '—' : Number(kpi.totalCalls) > 0 ? `${Number(kpi.successRate || 0).toFixed(1)}%` : '—',
      icon: Activity,
    },
    {
      label: isChinese ? '活跃模型' : 'Active models',
      value: loading ? '…' : error ? '—' : String(kpi.activeModelsCount || 0),
      icon: Layers,
    },
    {
      label: isChinese ? 'P90 耗时' : 'P90 latency',
      value: loading ? '…' : error ? '—' : formatLatency(kpi.p90DurationMs),
      icon: Zap,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-canvas font-sans text-ink selection:bg-brand/30">
      <StudioHeader locale={locale} activeTab="models" className="relative z-40" />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand/10 via-brand/5 to-transparent blur-[140px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-[1440px] px-4 pb-24 pt-8 sm:px-6 lg:px-12">
        <div className="mb-10 flex flex-col justify-between gap-6 border-b border-line pb-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-mono text-brand">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>{isChinese ? '真实调用统计 · 24h' : 'Actual usage · 24h'}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {isChinese ? '模型总览' : 'Model Directory'}
            </h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-muted sm:text-sm">
              {isChinese
                ? '已上架模型与过去 24 小时的调用量、成功率、耗时和价格。所有统计均来自实际生成任务记录。'
                : 'Listed models with actual 24-hour calls, success rate, latency, and pricing from real generation records.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
            {summaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="min-w-[126px] rounded-xl border border-line bg-surface px-4 py-3">
                  <span className="flex items-center gap-1.5 text-[10px] uppercase text-ink-muted">
                    <Icon className="h-3 w-3 text-brand" />
                    {card.label}
                  </span>
                  <span className="mt-1 block text-lg font-black text-ink">{card.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mb-12">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink">{isChinese ? '24h 调用领先模型' : 'Most used in 24h'}</h2>
              <p className="mt-1 text-xs text-ink-muted">
                {isChinese ? '按实际调用量排序，仅展示已上架模型。' : 'Ranked by actual calls among listed models.'}
              </p>
            </div>
            <Link href="#model-table" className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
              {isChinese ? '查看全部' : 'View all'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-ink-muted">
              <span>{error}</span>
              <button
                type="button"
                onClick={reload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-bold text-ink-on-accent"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {isChinese ? '重试' : 'Retry'}
              </button>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-40 animate-pulse rounded-2xl border border-line bg-surface" />
              ))}
            </div>
          ) : topModels.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-6 py-10 text-center">
              <Cpu className="mx-auto h-6 w-6 text-ink-muted" />
              <p className="mt-3 text-sm font-semibold text-ink">
                {isChinese ? '暂时没有可展示的模型' : 'No models available yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
              {topModels.map(({ stats, model }) => {
                const modelUrl = isChinese
                  ? `/zh/models/${encodeURIComponent(model.id)}`
                  : `/models/${encodeURIComponent(model.id)}`;
                return (
                  <Link
                    key={model.id}
                    href={modelUrl}
                    className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-sm transition hover:-translate-y-1 hover:border-brand/40"
                  >
                    <div>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ModelBrandLogo
                            providerId={model.provider}
                            provider={model.provider}
                            modelId={model.id}
                            size="md"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold leading-tight text-ink transition-colors group-hover:text-brand">
                              {model.displayName || model.name}
                            </div>
                            <div className="truncate text-[11px] font-mono text-ink-muted">
                              {model.provider || 'SupDance'}
                            </div>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                          {model.category || 'model'}
                        </span>
                      </div>

                      <div className="text-2xl font-black tracking-tight text-ink">{formatPrice(model, isChinese)}</div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-muted">
                        <span>
                          {isChinese ? '24h 调用' : '24h calls'}:{' '}
                          <strong className="font-semibold text-ink">{stats ? formatCalls(stats.totalCalls) : '—'}</strong>
                        </span>
                        <span className={stats && Number(stats.totalCalls) > 0 && stats.successRate >= 95 ? 'text-emerald-500' : 'text-ink-muted'}>
                          {stats && Number(stats.totalCalls) > 0 ? `${Number(stats.successRate).toFixed(1)}%` : (isChinese ? '暂无记录' : 'No calls')}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px] text-ink-muted">
                      <span>{isChinese ? '平均耗时' : 'Avg latency'}: {stats ? formatLatency(stats.avgDurationMs) : '—'}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-brand transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div id="model-table" className="mb-16 scroll-mt-24">
          <ModelScreenerTable
            locale={locale}
            models={models}
            telemetry={telemetry}
            telemetryById={telemetryById}
            loading={loading}
            error={error}
            onRetry={reload}
          />
        </div>
      </main>
    </div>
  );
}
