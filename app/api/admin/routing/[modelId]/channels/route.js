import { withAdminErrorBoundary, requirePermission, okResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { queryMany, execute, nowIso } from '@/lib/db/index';
import { setChannelPrimary } from '@/lib/repositories/aiCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request, { params }) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const { modelId } = await params;
  const rows = await queryMany(`
    SELECT
      pm.id, pm.model_id, pm.provider_id, pm.provider_model_id, pm.enabled,
      pm.priority, pm.timeout, pm.max_retries, pm.concurrency_limit, pm.rate_limit,
      pm.review_status, pm.provider_model_version, pm.provider_endpoint,
      pm.metadata, pm.cost_config,
      COALESCE((pm.metadata->>'primary')::boolean, false) AS is_primary,
      p.name AS provider_name, p.provider_type, p.health_status, p.circuit_state,
      p.consecutive_failures, p.balance AS provider_balance, p.currency AS provider_currency,
      COALESCE(active.active_count, 0)::int AS active_attempt_count,
      COALESCE(stats.success_rate, 0)::numeric AS success_rate,
      COALESCE(stats.average_latency_ms, 0)::numeric AS average_latency_ms,
      COALESCE(stats.total_attempts, 0)::int AS total_recent_attempts
    FROM ai_studio.provider_models pm
    JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS active_count
      FROM ai_studio.generation_attempts att
      WHERE att.provider_id = pm.provider_id
        AND att.provider_model_id = pm.provider_model_id
        AND att.status IN ('submitted', 'processing')
    ) active ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS total_attempts,
        CASE WHEN COUNT(*) = 0 THEN 0
          ELSE COUNT(*) FILTER (WHERE a2.status = 'succeeded')::numeric / COUNT(*) END AS success_rate,
        AVG(a2.duration_ms) FILTER (WHERE a2.duration_ms IS NOT NULL) AS average_latency_ms
      FROM (
        SELECT status, duration_ms FROM ai_studio.generation_attempts
        WHERE provider_id = pm.provider_id ORDER BY created_at DESC LIMIT 100
      ) a2
    ) stats ON TRUE
    WHERE pm.model_id = $1
    ORDER BY COALESCE((pm.metadata->>'primary')::boolean, false) DESC, pm.priority DESC, pm.id ASC
  `, [modelId]);

  return okResponse({ channels: rows }, guard.requestId);
}

async function handlePATCH(request, { params }) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const { modelId } = await params;
  const body = await request.json().catch(() => ({}));
  const { channel_id, enabled, priority, is_primary } = body;
  if (!channel_id) {
    return resultErrorResponse('channel_id required', guard.requestId);
  }

  if (is_primary) {
    try {
      await setChannelPrimary(modelId, channel_id);
    } catch (err) {
      return resultErrorResponse(err.message || '切换主渠道失败', guard.requestId);
    }
  }

  if (enabled !== undefined || priority !== undefined) {
    const setClauses = ['updated_at = $1'];
    const setParams = [nowIso()];
    let idx = 1;
    if (enabled !== undefined) {
      setClauses.push(`enabled = $${++idx}`);
      setParams.push(Boolean(enabled));
    }
    if (priority !== undefined) {
      setClauses.push(`priority = $${++idx}`);
      setParams.push(Number(priority));
    }
    setParams.push(channel_id, modelId);
    await execute(
      `UPDATE ai_studio.provider_models SET ${setClauses.join(', ')} WHERE id = $${++idx} AND model_id = $${++idx}`,
      setParams
    );
  }

  return okResponse({ ok: true, channel_id, is_primary: Boolean(is_primary) }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const PATCH = withAdminErrorBoundary(handlePATCH);
