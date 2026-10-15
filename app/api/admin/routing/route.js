import { withAdminErrorBoundary, requirePermission, okResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { queryMany, queryOne, execute, nowIso, randomId } from '@/lib/db/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const rows = await queryMany(`
    SELECT
      m.id, m.name, m.display_name, m.category, m.status, m.sort,
      rp.routing_mode, rp.weights, rp.failover_enabled,
      rp.circuit_breaker_config,
      COALESCE(ch.enabled_count, 0)::int AS enabled_channels,
      COALESCE(ch.total_count, 0)::int AS total_channels,
      COALESCE(health.healthy_count, 0)::int AS healthy_channels
    FROM ai_studio.ai_models m
    LEFT JOIN ai_studio.routing_policies rp ON rp.model_id = m.id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE pm.enabled = TRUE)::int AS enabled_count
      FROM ai_studio.provider_models pm WHERE pm.model_id = m.id
    ) ch ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS healthy_count
      FROM ai_studio.provider_models pm
      JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
      WHERE pm.model_id = m.id AND pm.enabled = TRUE
        AND p.enabled = TRUE AND p.health_status IN ('healthy', 'degraded')
    ) health ON TRUE
    ORDER BY m.sort ASC, m.created_at ASC
  `);

  return okResponse({ models: rows }, guard.requestId);
}

async function handlePATCH(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const { model_id, routing_mode, weights, failover_enabled } = body;
  if (!model_id) {
    return resultErrorResponse('model_id required', guard.requestId);
  }

  const existing = await queryOne(
    'SELECT * FROM ai_studio.routing_policies WHERE model_id = $1', [model_id]
  );

  const now = nowIso();
  if (existing) {
    const setClauses = ['updated_at = $1'];
    const params = [now];
    let idx = 1;
    if (routing_mode !== undefined) {
      setClauses.push(`routing_mode = $${++idx}`);
      params.push(routing_mode);
    }
    if (weights !== undefined) {
      setClauses.push(`weights = $${++idx}::jsonb`);
      params.push(JSON.stringify(weights));
    }
    if (failover_enabled !== undefined) {
      setClauses.push(`failover_enabled = $${++idx}`);
      params.push(Boolean(failover_enabled));
    }
    params.push(model_id);
    await execute(
      `UPDATE ai_studio.routing_policies SET ${setClauses.join(', ')} WHERE model_id = $${++idx}`,
      params
    );
  } else {
    await execute(`
      INSERT INTO ai_studio.routing_policies
        (id, model_id, routing_mode, weights, failover_enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6)
    `, [
      `rp_${randomId()}`, model_id, routing_mode || 'balanced',
      JSON.stringify(weights || { cost: 0.4, success_rate: 0.3, speed: 0.2, capacity: 0.1 }),
      failover_enabled !== false, now,
    ]);
  }

  const updated = await queryOne(
    'SELECT * FROM ai_studio.routing_policies WHERE model_id = $1', [model_id]
  );
  return okResponse({ policy: updated }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const PATCH = withAdminErrorBoundary(handlePATCH);
