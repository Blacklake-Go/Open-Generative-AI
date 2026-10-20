'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Cpu,
  Layers,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react';
import StudioHeader from '@/components/site/StudioHeader';
import ModelBrandLogo from './ModelBrandLogo';
import { useModelDirectory } from '@/lib/hooks/useModelDirectory';
import { inferStudioTabFromModel } from '@/lib/studio-routes';
import { getModelById } from '@/lib/modelCenter/modelScreenerData';

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

function categoryTab(model) {
  const category = String(model?.category || '').toLowerCase();
  if (category === 'video') return 'video';
  if (category === 'audio') return 'audio';
  if (category === 'text' || category === 'llm' || category === 'multimodal') return 'agents';
  return 'image';
}

function formatPrice(model, isChinese) {
  if (!model) return '—';
  if (model.pricingType === 'free') return isChinese ? '免费' : 'Free';
  const price = Number(model.creditsPrice);
  if (Number.isFinite(price) && price > 0) return isChinese ? `${price} 算力点起` : `${price} credits from`;
  return isChinese ? '按量计费' : 'Usage-based';
}

export default function ModelDetailPageClient({ modelId, locale = 'zh-CN' }) {
  const isChinese = Boolean(locale?.includes('zh'));
  const { models, telemetryById, loading, error, reload } = useModelDirectory({ range: '24h' });
  const [copied, setCopied] = useState(false);

  const meta = getModelById(modelId);
  const active = models.find(
    (item) => String(item.id) === String(modelId) || String(item.slug) === String(modelId)
  );
  const model = active || meta;
  const stats = model ? telemetryById.get(String(model.id)) || null : null;
  const available = Boolean(active && active.isActive !== false && active.hasWorkingRoute !== false);

  const relatedModels = useMemo(() => {
    if (!active) return [];
    return models
      .filter((item) => item.category === active.category && String(item.id) !== String(active.id))
      .slice(0, 3);
  }, [models, active]);

  const handleCopyId = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(String(modelId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const screenerUrl = isChinese ? '/zh/models' : '/models';
  const targetTab = inferStudioTabFromModel(active?.id || meta?.id || modelId, categoryTab(active || meta));
  const studioUrl = isChinese
    ? `/zh/studio?tab=${targetTab}&model=${encodeURIComponent(modelId)}`
    : `/studio?tab=${targetTab}&model=${encodeURIComponent(modelId)}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        <StudioHeader locale={locale} activeTab="models" />
        <main className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-12">
          <div className="h-4 w-40 animate-pulse rounded bg-surface" />
          <div className="mt-6 h-64 animate-pulse rounded-3xl border border-line bg-surface" />
        </main>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="flex min-h-screen flex-col bg-canvas text-ink">
        <StudioHeader locale={locale} activeTab="models" />
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <Cpu className="h-8 w-8 text-ink-muted" />
          <h1 className="mt-4 text-2xl font-bold">{isChinese ? '未找到该模型' : 'Model Not Found'}</h1>
          <p className="mt-2 max-w-md text-sm text-ink-muted">
            {isChinese
              ? `模型标识 "${modelId}" 不存在或已下线。`
              : `Model "${modelId}" does not exist or has been removed.`}
          </p>
          <Link
            href={screenerUrl}
            className="mt-6 rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-ink-on-accent"
          >
            {isChinese ? '返回模型目录' : 'Back to models'}
          </Link>
        </div>
      </div>
    );
  }

  const name = active?.displayName || meta?.name || String(modelId);
  const description = active?.description
    || (isChinese ? meta?.description : meta?.descriptionEn)
    || (isChinese ? '该模型暂无补充说明。' : 'No additional description is available for this model.');
  const provider = active?.provider || meta?.provider || 'SupDance';
  const category = active?.category || meta?.category || 'image';

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-canvas font-sans text-ink selection:bg-brand/30">
      <StudioHeader locale={locale} activeTab="models" className="relative z-40" />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-b from-brand/10 via-brand/5 to-transparent blur-[140px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-[1200px] px-4 pb-24 pt-6 sm:px-6 lg:px-12">
        <div className="mb-6 flex items-center gap-2 font-mono text-xs text-ink-muted">
          <Link href={screenerUrl} className="flex items-center gap-1.5 transition hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isChinese ? '模型目录' : 'Models'}</span>
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>{provider}</span>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-ink">{name}</span>
        </div>

        {error ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-xs text-ink-muted">
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
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
              <div className="flex min-w-0 items-start gap-4">
                <ModelBrandLogo
                  providerId={provider}
                  provider={provider}
                  modelId={active?.id || modelId}
                  size="xl"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">{name}</h1>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                      available
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                    }`}>
                      {available ? (isChinese ? '可创作' : 'Available') : (isChinese ? '暂不可用' : 'Unavailable')}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-muted">
                    {provider} · {category} · {String(modelId)}
                  </p>
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
                <div className="rounded-2xl border border-line bg-canvas px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted">{isChinese ? '参考价格' : 'Price'}</p>
                  <p className="mt-1 font-mono text-lg font-black text-ink">{formatPrice(active, isChinese)}</p>
                </div>
                {available ? (
                  <Link
                    href={studioUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-xs font-bold text-ink-on-accent shadow-sm"
                  >
                    {isChinese ? '立即创作' : 'Create now'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <Link
                    href={screenerUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-5 py-3 text-xs font-bold text-ink-muted"
                  >
                    {isChinese ? '查看其他模型' : 'Browse other models'}
                  </Link>
                )}
              </div>
            </div>

            {!available ? (
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700">
                <Shield className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {isChinese
                    ? '该模型尚未上架或通道正在维护，当前无法发起生成任务。'
                    : 'This model is not listed yet or its channel is under maintenance, so generation is unavailable.'}
                </span>
              </div>
            ) : null}

            <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: isChinese ? '24h 调用' : '24h calls', value: stats ? formatCalls(stats.totalCalls) : '—', icon: Activity },
                { label: isChinese ? '成功率' : 'Success rate', value: stats && Number(stats.totalCalls) > 0 ? `${Number(stats.successRate).toFixed(1)}%` : '—', icon: Shield },
                { label: isChinese ? '平均耗时' : 'Avg latency', value: stats ? formatLatency(stats.avgDurationMs) : '—', icon: Clock },
                { label: isChinese ? 'P90 耗时' : 'P90 latency', value: stats ? formatLatency(stats.p90DurationMs) : '—', icon: Zap },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-2xl border border-line bg-canvas p-4">
                    <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-muted">
                      <Icon className="h-3 w-3 text-brand" />
                      {item.label}
                    </p>
                    <p className="mt-2 font-mono text-xl font-black text-ink">{item.value}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-ink-muted">
              {isChinese
                ? '统计范围：过去 24 小时的真实生成任务；无调用时显示 “—”。'
                : 'Scope: actual generation tasks in the last 24 hours; “—” means no calls.'}
            </p>
          </div>

          <div className="border-t border-line bg-canvas/60 px-6 py-4 sm:px-8">
            <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-ink-muted">{isChinese ? '模型 ID' : 'Model ID'}</dt>
                <dd className="mt-1 flex items-center gap-2 font-mono text-ink">
                  <span className="truncate">{String(modelId)}</span>
                  <button type="button" onClick={handleCopyId} className="text-ink-muted transition hover:text-ink" aria-label="Copy model ID">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">{isChinese ? '厂商' : 'Provider'}</dt>
                <dd className="mt-1 text-ink">{provider}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">{isChinese ? '类别' : 'Category'}</dt>
                <dd className="mt-1 text-ink">{category}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">{isChinese ? '上架状态' : 'Listing status'}</dt>
                <dd className={`mt-1 font-semibold ${available ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {available ? (isChinese ? '已上架' : 'Listed') : (isChinese ? '未上架 / 维护中' : 'Not listed / maintenance')}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {relatedModels.length > 0 ? (
          <section className="mt-10">
            <div className="mb-4 flex items-center gap-2">
              <Layers className="h-4 w-4 text-brand" />
              <h2 className="text-lg font-bold text-ink">{isChinese ? '同类模型' : 'Related models'}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedModels.map((item) => {
                const url = isChinese
                  ? `/zh/models/${encodeURIComponent(item.id)}`
                  : `/models/${encodeURIComponent(item.id)}`;
                return (
                  <Link
                    key={item.id}
                    href={url}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-brand/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ModelBrandLogo providerId={item.provider} provider={item.provider} modelId={item.id} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{item.displayName || item.name}</p>
                        <p className="truncate text-[11px] text-ink-muted">{item.provider || 'SupDance'}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-brand" />
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
