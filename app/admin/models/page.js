import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import { queryMany } from '@/lib/db/index';
import FrontendConfigClient from './frontend/FrontendConfigClient';

export const dynamic = 'force-dynamic';

async function getFrontendModels() {
  try {
    return await queryMany(`
      SELECT
        m.id, m.name, m.display_name, m.category, m.description,
        COALESCE(m.capabilities->>'badge', '') AS badge,
        COALESCE(m.capabilities->>'sub_type', '') AS sub_type,
        COALESCE((m.capabilities->>'is_default')::boolean, false) AS is_default,
        m.status, m.tier, m.is_visible, m.auto_route_eligible, m.is_featured,
        COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) AS is_pinned,
        m.sort,
        m.capabilities,
        COALESCE(m.supported_ratios, '[]'::jsonb) AS supported_ratios,
        COALESCE(m.supported_resolutions, '[]'::jsonb) AS supported_resolutions,
        COALESCE(m.supported_durations, '[]'::jsonb) AS supported_durations,
        m.created_at, m.updated_at,
        COALESCE(rc.approved_count, 0)::int AS approved_routes,
        COALESCE(rc.healthy_count, 0)::int AS healthy_routes,
        COALESCE(rc.total_routes, 0)::int AS total_routes,
        COALESCE(rc.provider_ids, '[]'::jsonb) AS provider_ids,
        rc.min_cost_usd,
        rc.min_cost_cny,
        COALESCE(mp.base_credits, 0)::int AS base_credits,
        COALESCE(mp.pricing_mode, 'auto') AS pricing_mode,
        COALESCE(mp.pricing_type, 'fixed') AS pricing_type,
        COALESCE(mp.min_gross_margin_rate, 0.3)::numeric AS min_gross_margin_rate,
        COALESCE(act.calls_24h, 0)::int AS calls_24h,
        CASE
          WHEN COALESCE(act.calls_24h, 0) > 0 THEN
            ROUND((COALESCE(act.success_24h, 0)::numeric / act.calls_24h::numeric) * 100, 1)
          ELSE 100.0
        END AS success_rate_24h,
        COALESCE(act.avg_ms_24h, 0)::int AS avg_ms_24h
      FROM ai_studio.ai_models m
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE pm.enabled AND pm.review_status = 'approved')::int AS approved_count,
          COUNT(*) FILTER (WHERE pm.enabled AND pm.review_status = 'approved' AND p.enabled = TRUE)::int AS healthy_count,
          COUNT(*)::int AS total_routes,
          jsonb_agg(DISTINCT pm.provider_id) FILTER (WHERE pm.provider_id IS NOT NULL) AS provider_ids,
          MIN(
            CASE 
              WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN (pm.cost_config->>'base_cost')::numeric / 7.2
              ELSE (pm.cost_config->>'base_cost')::numeric
            END
          ) AS min_cost_usd,
          MIN(
            CASE 
              WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN (pm.cost_config->>'base_cost')::numeric
              ELSE (pm.cost_config->>'base_cost')::numeric * 7.2
            END
          ) AS min_cost_cny
        FROM ai_studio.provider_models pm
        LEFT JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
        WHERE pm.model_id = m.id
      ) rc ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(att.id)::int AS calls_24h,
          COUNT(att.id) FILTER (WHERE att.status = 'succeeded')::int AS success_24h,
          ROUND(AVG(att.duration_ms) FILTER (WHERE att.duration_ms > 0))::int AS avg_ms_24h
        FROM ai_studio.generation_attempts att
        LEFT JOIN ai_studio.creations c ON c.id = att.creation_id
        WHERE (c.model = m.id OR att.provider_model_id = m.id)
          AND att.created_at >= NOW() - INTERVAL '24 hours'
      ) act ON TRUE
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
      WHERE m.status != 'disabled'
      ORDER BY
        CASE WHEN COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) THEN 0 ELSE 1 END,
        CASE WHEN m.is_visible THEN 0 ELSE 1 END,
        CASE m.tier WHEN 'core' THEN 0 WHEN 'backup' THEN 1 ELSE 2 END,
        m.sort ASC, m.created_at ASC
    `);
  } catch (err) {
    return await queryMany(`
      SELECT
        m.id, m.name, m.display_name, m.category, m.description,
        m.status, m.tier, m.is_visible, m.auto_route_eligible, m.is_featured,
        COALESCE((m.capabilities->>'is_pinned')::boolean, false) AS is_pinned,
        m.sort,
        m.capabilities,
        COALESCE(m.supported_ratios, '[]'::jsonb) AS supported_ratios,
        COALESCE(m.supported_resolutions, '[]'::jsonb) AS supported_resolutions,
        COALESCE(m.supported_durations, '[]'::jsonb) AS supported_durations,
        m.created_at, m.updated_at,
        COALESCE(rc.approved_count, 0)::int AS approved_routes,
        COALESCE(rc.approved_count, 0)::int AS healthy_routes,
        COALESCE(rc.total_routes, 0)::int AS total_routes,
        COALESCE(rc.provider_ids, '[]'::jsonb) AS provider_ids,
        rc.min_cost_usd,
        rc.min_cost_cny,
        COALESCE(mp.base_credits, 0)::int AS base_credits,
        COALESCE(mp.pricing_mode, 'auto') AS pricing_mode,
        COALESCE(mp.pricing_type, 'fixed') AS pricing_type,
        COALESCE(mp.min_gross_margin_rate, 0.3)::numeric AS min_gross_margin_rate,
        0 AS calls_24h,
        100.0 AS success_rate_24h,
        0 AS avg_ms_24h
      FROM ai_studio.ai_models m
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE pm.enabled AND pm.review_status = 'approved')::int AS approved_count,
          COUNT(*)::int AS total_routes,
          jsonb_agg(DISTINCT pm.provider_id) FILTER (WHERE pm.provider_id IS NOT NULL) AS provider_ids,
          MIN(
            CASE 
              WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN (pm.cost_config->>'base_cost')::numeric / 7.2
              ELSE (pm.cost_config->>'base_cost')::numeric
            END
          ) AS min_cost_usd,
          MIN(
            CASE 
              WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN (pm.cost_config->>'base_cost')::numeric
              ELSE (pm.cost_config->>'base_cost')::numeric * 7.2
            END
          ) AS min_cost_cny
        FROM ai_studio.provider_models pm WHERE pm.model_id = m.id
      ) rc ON TRUE
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
      WHERE m.status != 'disabled'
      ORDER BY
        CASE WHEN COALESCE((m.capabilities->>'is_pinned')::boolean, false) THEN 0 ELSE 1 END,
        CASE WHEN m.is_visible THEN 0 ELSE 1 END,
        CASE m.tier WHEN 'core' THEN 0 WHEN 'backup' THEN 1 ELSE 2 END,
        m.sort ASC, m.created_at ASC
    `);
  }
}

export default async function ModelsPage() {
  const admin = await requireAdminPagePermission(PERMISSIONS.modelsRead);

  let models = [];
  try {
    models = await getFrontendModels();
  } catch (error) {
    console.error('[admin/models] Failed to load models for frontend management:', error.message);
  }

  return (
    <FrontendConfigClient
      initialModels={JSON.parse(JSON.stringify(models))}
      canWrite={hasPermission(admin.role, PERMISSIONS.modelsWrite)}
    />
  );
}

