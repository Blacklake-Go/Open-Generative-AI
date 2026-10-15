import { Card, PageHeader, MetricCard, DataTable, StatusBadge } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { queryMany } from '@/lib/db/index';
import CostCenterClient from './CostCenterClient';

const PERIOD_LABELS = {
  today: '今天', yesterday: '昨天', '7d': '近 7 天', '30d': '近 30 天', month: '本月',
};

function periodToSql(period) {
  switch (period) {
    case 'today': return { since: "now() - INTERVAL '1 day'", end: '' };
    case 'yesterday': return { since: "now() - INTERVAL '2 day'", end: "AND pcr.created_at < now() - INTERVAL '1 day'" };
    case '30d': return { since: "now() - INTERVAL '30 day'", end: '' };
    case 'month': return { since: "date_trunc('month', now())", end: '' };
    default: return { since: "now() - INTERVAL '7 day'", end: '' };
  }
}

async function getCostData(period = '7d') {
  const { since, end } = periodToSql(period);
  return queryMany(`
    SELECT
      pcr.model_id,
      m.display_name AS model_name,
      pcr.provider_id,
      p.name AS provider_name,
      COUNT(*)::int AS total_requests,
      COUNT(*) FILTER (WHERE att.status = 'succeeded')::int AS success_count,
      COUNT(*) FILTER (WHERE att.status = 'failed')::int AS failure_count,
      CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(COUNT(*) FILTER (WHERE att.status = 'succeeded')::numeric / COUNT(*) * 100, 1) END AS success_rate,
      ROUND(COALESCE(AVG(att.duration_ms) FILTER (WHERE att.duration_ms IS NOT NULL), 0))::int AS avg_duration_ms,
      ROUND(COALESCE(SUM(pcr.actual_cost_usd), SUM(pcr.estimated_cost_usd), 0)::numeric, 4) AS total_cost_usd,
      CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(COALESCE(SUM(pcr.actual_cost_usd), SUM(pcr.estimated_cost_usd), 0)::numeric / COUNT(*), 6) END AS avg_cost_usd
    FROM ai_studio.provider_cost_records pcr
    LEFT JOIN ai_studio.generation_attempts att ON att.id = pcr.attempt_id
    LEFT JOIN ai_studio.ai_models m ON m.id = pcr.model_id
    LEFT JOIN ai_studio.ai_providers p ON p.id = pcr.provider_id
    WHERE pcr.created_at >= ${since} ${end}
    GROUP BY pcr.model_id, m.display_name, pcr.provider_id, p.name
    ORDER BY total_cost_usd DESC, total_requests DESC
  `);
}

export default async function CostCenterPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.dashboardRead);

  const resolvedParams = await searchParams;
  const period = resolvedParams?.period || '7d';
  let rows = [];
  try {
    rows = await getCostData(period);
  } catch (error) {
    console.error('[admin/cost-center]', error.message);
  }

  const totalRequests = rows.reduce((sum, r) => sum + r.total_requests, 0);
  const totalSuccess = rows.reduce((sum, r) => sum + r.success_count, 0);
  const totalCostUsd = rows.reduce((sum, r) => sum + Number(r.total_cost_usd || 0), 0);
  const overallSuccessRate = totalRequests > 0 ? ((totalSuccess / totalRequests) * 100).toFixed(1) : '0';

  const columns = [
    { key: 'model', label: '模型', render: (row) => (
      <span className="text-xs font-semibold text-white">{row.model_name || row.model_id}</span>
    )},
    { key: 'provider', label: '供应商', render: (row) => (
      <span className="text-xs text-white/70">{row.provider_name || row.provider_id}</span>
    )},
    { key: 'total', label: '请求数', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white">{row.total_requests}</span>
    )},
    { key: 'success', label: '成功', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-emerald-400">{row.success_count}</span>
    )},
    { key: 'failure', label: '失败', render: (row) => (
      <span className={`text-xs font-mono tabular-nums ${row.failure_count > 0 ? 'text-red-400' : 'text-white/50'}`}>{row.failure_count}</span>
    )},
    { key: 'rate', label: '成功率', render: (row) => (
      <StatusBadge tone={Number(row.success_rate) >= 95 ? 'good' : Number(row.success_rate) >= 80 ? 'warn' : 'danger'}>
        {row.success_rate}%
      </StatusBadge>
    )},
    { key: 'latency', label: '平均耗时', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white/70">
        {row.avg_duration_ms > 0 ? `${(row.avg_duration_ms / 1000).toFixed(1)}s` : '—'}
      </span>
    )},
    { key: 'cost', label: 'API 成本', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white">${Number(row.total_cost_usd).toFixed(4)}</span>
    )},
    { key: 'unit_cost', label: '单次成本', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white/70">${Number(row.avg_cost_usd).toFixed(6)}</span>
    )},
  ];

  return (
    <>
      <PageHeader
        eyebrow="财务分析"
        title="成本中心"
        description="按模型和供应商分析 API 调用成本、成功率和平均耗时。"
      >
        <CostCenterClient currentPeriod={period} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard label="总请求数" value={totalRequests.toLocaleString()} hint={`${PERIOD_LABELS[period] || period}`} tone="neutral" />
        <MetricCard label="成功率" value={`${overallSuccessRate}%`} hint={`${totalSuccess} 次成功`} tone={Number(overallSuccessRate) >= 95 ? 'good' : 'warn'} />
        <MetricCard label="API 总成本" value={`$${totalCostUsd.toFixed(2)}`} hint="USD" tone="info" />
        <MetricCard label="估算成本(CNY)" value={`¥${(totalCostUsd * 7.2).toFixed(2)}`} hint="按 7.2 汇率估算" tone="neutral" />
      </div>

      <DataTable columns={columns} rows={rows} empty="该时间段暂无成本记录" />
    </>
  );
}

