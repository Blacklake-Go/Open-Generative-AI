import { Card, PageHeader, MetricCard, DataTable, StatusBadge } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getCostReport } from '@/lib/admin/financialReporting';
import CostCenterClient from './CostCenterClient';

const PERIOD_LABELS = {
  today: '今天', yesterday: '昨天', '7d': '近 7 天', '30d': '近 30 天', month: '本月',
};

export default async function CostCenterPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.dashboardRead);

  const resolvedParams = await searchParams;
  const period = resolvedParams?.period || '7d';
  let rows = [];
  try {
    rows = await getCostReport(period);
  } catch (error) {
    console.error('[admin/cost-center]', error.message);
  }

  const totalRequests = rows.reduce((sum, r) => sum + r.total_requests, 0);
  const totalSuccess = rows.reduce((sum, r) => sum + r.success_count, 0);
  const pending = rows.reduce((sum, r) => sum + r.pending_reconciliation, 0);
  const usdComplete = rows.every((r) => r.total_cost_usd != null);
  const cnyComplete = rows.every((r) => r.total_cost_cny != null);
  const totalCostCny = rows.reduce((sum, r) => sum + Number(r.total_cost_cny || 0), 0);
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
    { key: 'cost', label: 'API 成本（含估算）', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white">{row.total_cost_usd == null ? '待核对' : `$${Number(row.total_cost_usd).toFixed(4)}`}</span>
    )},
    { key: 'unit_cost', label: '单次成本', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white/70">{row.avg_cost_usd == null ? '待核对' : `$${Number(row.avg_cost_usd).toFixed(6)}`}</span>
    )},
  ];

  return (
    <>
      <PageHeader
        eyebrow="财务分析"
        title="成本中心"
        description="按模型和供应商分析 API 调用成本。实际费用与待核对估算合并展示；历史人民币成本使用任务锁定汇率。"
      >
        <CostCenterClient currentPeriod={period} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard label="总请求数" value={totalRequests.toLocaleString()} hint={`${PERIOD_LABELS[period] || period}`} tone="neutral" />
        <MetricCard label="成功率" value={`${overallSuccessRate}%`} hint={`${totalSuccess} 次成功`} tone={Number(overallSuccessRate) >= 95 ? 'good' : 'warn'} />
        <MetricCard label="API 总成本（含估算）" value={usdComplete ? `$${totalCostUsd.toFixed(2)}` : '待核对'} hint={`${pending} 条费用待核对`} tone="info" />
        <MetricCard label="成本(CNY，含估算)" value={cnyComplete ? `¥${totalCostCny.toFixed(2)}` : '待核对'} hint="按任务锁定汇率；缺失费用或汇率时待核对" tone="neutral" />
      </div>

      <DataTable columns={columns} rows={rows} empty="该时间段暂无成本记录" />
    </>
  );
}

