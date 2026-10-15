import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { queryMany } from '@/lib/db/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  if (period === 'yesterday') return "AND pcr.created_at < now() - INTERVAL '1 day'";
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
    WHERE pcr.created_at >= ${since} ${endClause}
    GROUP BY pcr.model_id, m.display_name, pcr.provider_id, p.name
    ORDER BY total_cost_usd DESC, total_requests DESC
  `);

  return okResponse({ rows, period }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
