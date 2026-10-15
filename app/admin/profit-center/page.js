import { Card, PageHeader, MetricCard, DataTable, StatusBadge } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { queryMany } from '@/lib/db/index';
import ProfitPeriodSelector from './ProfitPeriodSelector';

const CREDIT_TO_CNY = 0.07;

const PERIOD_LABELS = {
  today: '今天', yesterday: '昨天', '7d': '近 7 天', '30d': '近 30 天', month: '本月',
};

function periodToSql(period) {
  switch (period) {
    case 'today': return { since: "now() - INTERVAL '1 day'", end: '' };
    case 'yesterday': return { since: "now() - INTERVAL '2 day'", end: "AND c.updated_at < now() - INTERVAL '1 day'" };
    case '30d': return { since: "now() - INTERVAL '30 day'", end: '' };
    case 'month': return { since: "date_trunc('month', now())", end: '' };
    default: return { since: "now() - INTERVAL '7 day'", end: '' };
  }
}

async function getProfitData(period = '7d') {
  const { since, end } = periodToSql(period);
  return queryMany(`
    SELECT
      c.model AS model_id,
      m.display_name AS model_name,
      m.category,
      mp.min_gross_margin_rate,
      SUM(c.credit_cost)::int AS total_credits,
      ROUND(SUM(c.credit_cost) * ${CREDIT_TO_CNY}, 2) AS revenue_cny,
      ROUND(COALESCE(SUM(cost_agg.total_cost_usd), 0)::numeric, 4) AS cost_usd,
      ROUND(COALESCE(SUM(cost_agg.total_cost_usd), 0)::numeric * 7.2, 2) AS cost_cny_est,
      ROUND(SUM(c.credit_cost) * ${CREDIT_TO_CNY}
        - COALESCE(SUM(cost_agg.total_cost_usd), 0)::numeric * 7.2, 2) AS gross_profit_cny,
      CASE WHEN SUM(c.credit_cost) * ${CREDIT_TO_CNY} = 0 THEN 0
        ELSE ROUND(
          (SUM(c.credit_cost) * ${CREDIT_TO_CNY}
            - COALESCE(SUM(cost_agg.total_cost_usd), 0)::numeric * 7.2)
          / (SUM(c.credit_cost) * ${CREDIT_TO_CNY}) * 100, 1)
      END AS gross_margin_pct,
      COUNT(*)::int AS generation_count
    FROM ai_studio.creations c
    LEFT JOIN ai_studio.ai_models m ON m.id = c.model
    LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = c.model AND mp.is_active = TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(COALESCE(pcr.actual_cost_usd, pcr.estimated_cost_usd, 0)) AS total_cost_usd
      FROM ai_studio.provider_cost_records pcr
      WHERE pcr.job_id = c.id
    ) cost_agg ON TRUE
    WHERE c.status = 'succeeded'
      AND c.updated_at >= ${since} ${end}
    GROUP BY c.model, m.display_name, m.category, mp.min_gross_margin_rate
    ORDER BY revenue_cny DESC
  `);
}

export default async function ProfitCenterPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.dashboardRead);

  const resolvedParams = await searchParams;
  const period = resolvedParams?.period || '7d';
  let rows = [];
  try {
    rows = await getProfitData(period);
  } catch (error) {
    console.error('[admin/profit-center]', error.message);
  }

  const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue_cny || 0), 0);
  const totalCostCny = rows.reduce((sum, r) => sum + Number(r.cost_cny_est || 0), 0);
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
    { key: 'revenue', label: '收入(CNY)', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-brand font-semibold">¥{Number(row.revenue_cny).toFixed(2)}</span>
    )},
    { key: 'cost_usd', label: 'API 成本(USD)', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white/70">${Number(row.cost_usd).toFixed(4)}</span>
    )},
    { key: 'cost_cny', label: '成本(CNY)', render: (row) => (
      <span className="text-xs font-mono tabular-nums text-white/70">¥{Number(row.cost_cny_est).toFixed(2)}</span>
    )},
    { key: 'profit', label: '毛利(CNY)', render: (row) => (
      <span className={`text-xs font-mono tabular-nums ${Number(row.gross_profit_cny) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        ¥{Number(row.gross_profit_cny).toFixed(2)}
      </span>
    )},
    { key: 'margin', label: '毛利率', render: (row) => {
      const margin = Number(row.gross_margin_pct);
      const minMargin = Number(row.min_gross_margin_rate || 0.75) * 100;
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
        description="按模型分析平台收入与 API 成本，监控毛利率。积分换算：1 Credit = ¥0.07 CNY。"
      >
        <ProfitPeriodSelector currentPeriod={period} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <MetricCard label="积分消费" value={totalCredits.toLocaleString()} hint={`${PERIOD_LABELS[period] || period}`} tone="neutral" />
        <MetricCard label="估算收入" value={`¥${totalRevenue.toFixed(2)}`} hint="CNY" tone="info" />
        <MetricCard label="API 成本" value={`¥${totalCostCny.toFixed(2)}`} hint="CNY 估算" tone={totalCostCny > totalRevenue ? 'danger' : 'neutral'} />
        <MetricCard
          label="综合毛利率"
          value={`${overallMargin}%`}
          hint={`毛利 ¥${totalProfit.toFixed(2)}`}
          tone={Number(overallMargin) >= 50 ? 'good' : Number(overallMargin) >= 30 ? 'warn' : 'danger'}
        />
      </div>

      <DataTable columns={columns} rows={rows} empty="该时间段暂无利润数据" />

      <div className="mt-6">
        <Card>
          <h3 className="text-xs font-bold text-white mb-2">计算说明</h3>
          <ul className="space-y-1 text-[11px] leading-4 text-white/50">
            <li>• 收入 = 用户消费积分 × ¥0.07/Credit</li>
            <li>• 成本 = 供应商实际/估算 API 费用 × 7.2 汇率</li>
            <li>• 毛利 = 收入 - 成本</li>
            <li>• ⚠ 标记表示毛利率低于该模型配置的最低毛利率阈值</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

