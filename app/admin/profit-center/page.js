import { Card, PageHeader, MetricCard, DataTable, StatusBadge } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getProfitReport } from '@/lib/admin/financialReporting';
import { CREDIT_PRICING_POLICY } from '@/lib/pricing/creditPolicy';
import ProfitPeriodSelector from './ProfitPeriodSelector';

const CREDIT_TO_CNY = CREDIT_PRICING_POLICY.cnyPerCredit;

const PERIOD_LABELS = {
  today: '今天', yesterday: '昨天', '7d': '近 7 天', '30d': '近 30 天', month: '本月',
};

export default async function ProfitCenterPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.dashboardRead);

  const resolvedParams = await searchParams;
  const period = resolvedParams?.period || '7d';
  let rows = [];
  try {
    rows = await getProfitReport(period);
  } catch (error) {
    console.error('[admin/profit-center]', error.message);
  }

  const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue_cny || 0), 0);
  const totalCostCny = rows.reduce((sum, r) => sum + Number(r.cost_cny_est || 0), 0);
  const complete = rows.every((r) => r.cost_cny_est != null);
  const pending = rows.reduce((sum, r) => sum + r.pending_reconciliation, 0);
  const totalProfit = totalRevenue - totalCostCny;
  const overallMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';
  const totalCredits = rows.reduce((sum, r) => sum + r.total_credits, 0);

  const columns = [
    { key: 'model', label: '模型', render: (row) => (
      <div>
        <p className="text-xs font-semibold text-white">{row.model_name || row.model_id}</p>
        <p className="text-[11px] text-white/40">{row.category} · {row.generation_count} 次</p>
      </div>
    )},
    { key: 'credits', label: '消费(Credits)', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white">{row.total_credits.toLocaleString()}</span>
    )},
    { key: 'revenue', label: '积分折算收入(CNY)', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-brand font-semibold">¥{Number(row.revenue_cny).toFixed(2)}</span>
    )},
    { key: 'cost_usd', label: 'API 成本(USD)', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white/70">{row.cost_usd == null ? '待核对' : `$${Number(row.cost_usd).toFixed(4)}`}</span>
    )},
    { key: 'cost_cny', label: '成本(CNY)', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white/70">{row.cost_cny_est == null ? '待核对' : `¥${Number(row.cost_cny_est).toFixed(2)}`}</span>
    )},
    { key: 'profit', label: '估算毛利(CNY)', render: (row) => (
      <span className={`text-xs font-mono tabular-nums ${Number(row.gross_profit_cny) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {row.gross_profit_cny == null ? '待核对' : `¥${Number(row.gross_profit_cny).toFixed(2)}`}
      </span>
    )},
    { key: 'margin', label: '估算毛利率', render: (row) => {
      if (row.gross_margin_pct == null) return <StatusBadge tone="warn">待核对</StatusBadge>;
      const margin = Number(row.gross_margin_pct);
      const minMargin = Number(row.min_gross_margin_rate ?? CREDIT_PRICING_POLICY.minimumGrossMarginRate) * 100;
      const belowFloor = margin < minMargin && margin < 35;
      return (
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={margin >= 50 ? 'good' : margin >= 30 ? 'warn' : 'danger'}>
            {margin.toFixed(1)}%
          </StatusBadge>
          {belowFloor && (
            <span className="text-[10px] text-red-400" title={`低于最低毛利率 ${minMargin}%`}>⚠</span>
          )}
        </div>
      );
    }},
  ];

  return (
    <>
      <PageHeader
        eyebrow="财务分析"
        title="利润中心"
        description={`按模型分析积分折算收入与 API 成本，监控估算毛利。积分换算：1 Credit = ¥${CREDIT_TO_CNY}。`}
      >
        <ProfitPeriodSelector currentPeriod={period} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard label="积分消费" value={totalCredits.toLocaleString()} hint={`${PERIOD_LABELS[period] || period}`} tone="neutral" />
        <MetricCard label="估算收入" value={`¥${totalRevenue.toFixed(2)}`} hint="CNY" tone="info" />
        <MetricCard label="API 成本（含估算）" value={complete ? `¥${totalCostCny.toFixed(2)}` : '待核对'} hint={`${pending} 条费用待核对`} tone={totalCostCny > totalRevenue ? 'danger' : 'neutral'} />
        <MetricCard
          label="综合估算毛利率"
          value={complete ? `${overallMargin}%` : '待核对'}
          hint={complete ? `估算毛利 ¥${totalProfit.toFixed(2)}` : '费用或任务汇率缺失'}
          tone={Number(overallMargin) >= 50 ? 'good' : Number(overallMargin) >= 30 ? 'warn' : 'danger'}
        />
      </div>

      <DataTable columns={columns} rows={rows} empty="该时间段暂无利润数据" />

      <div className="mt-6">
        <Card>
          <h3 className="text-xs font-bold text-white mb-2">计算说明</h3>
          <ul className="space-y-1 text-[11px] leading-4 text-white/50">
            <li>• 积分折算收入 = 用户消费积分 × ¥{CREDIT_TO_CNY}/Credit，不代表现金实收</li>
            <li>• 成本按每条记录优先取供应商实际费用，否则取估算费用；使用该任务锁定汇率</li>
            <li>• 估算毛利 = 积分折算收入 - 成本；费用或汇率缺失时显示待核对，估算费用仍需对账</li>
            <li>• ⚠ 标记表示毛利率低于该模型配置的最低毛利率阈值</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

