import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { queryMany } from '@/lib/db/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CREDIT_TO_CNY = 0.07;

function periodToInterval(period) {
  switch (period) {
    case 'today': return "now() - INTERVAL '1 day'";
    case 'yesterday': return "now() - INTERVAL '2 day'";
    case '7d': return "now() - INTERVAL '7 day'";
    case '30d': return "now() - INTERVAL '30 day'";
    case 'month': return "date_trunc('month', now())";
    default: return "now() - INTERVAL '7 day'";
  }
}

function periodEndClause(period) {
  if (period === 'yesterday') return "AND c.updated_at < now() - INTERVAL '1 day'";
  return '';
}

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.dashboardRead);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '7d';
  const since = periodToInterval(period);
  const endClause = periodEndClause(period);

  const rows = await queryMany(`
    SELECT
      c.model AS model_id,
      m.display_name AS model_name,
      m.category,
      mp.min_gross_margin_rate,
      SUM(c.credit_cost)::int AS total_credits_consumed,
      ROUND(SUM(c.credit_cost) * ${CREDIT_TO_CNY}, 2) AS revenue_cny,
      ROUND(COALESCE(cost_agg.total_cost_usd, 0)::numeric, 4) AS total_cost_usd,
      ROUND(COALESCE(cost_agg.total_cost_usd, 0)::numeric * 7.2, 2) AS total_cost_cny_est,
      ROUND(SUM(c.credit_cost) * ${CREDIT_TO_CNY}
        - COALESCE(cost_agg.total_cost_usd, 0)::numeric * 7.2, 2) AS gross_profit_cny,
      CASE WHEN SUM(c.credit_cost) * ${CREDIT_TO_CNY} = 0 THEN 0
        ELSE ROUND(
          (SUM(c.credit_cost) * ${CREDIT_TO_CNY}
            - COALESCE(cost_agg.total_cost_usd, 0)::numeric * 7.2)
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
      AND c.updated_at >= ${since} ${endClause}
    GROUP BY c.model, m.display_name, m.category, mp.min_gross_margin_rate
    ORDER BY revenue_cny DESC
  `);

  return okResponse({ rows, period, creditToCny: CREDIT_TO_CNY }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
