import Link from 'next/link';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import { queryMany, queryOne } from '@/lib/db/index';
import { CANONICAL_GROUPS, isOrphanVariantCandidate, suggestCanonicalTarget } from '@/lib/modelCenter/canonicalModels.js';
import { getReportingFxSnapshot } from '@/lib/admin/financialReporting';
import { CREDIT_PRICING_POLICY } from '@/lib/pricing/creditPolicy';
import FrontendConfigClient from './frontend/FrontendConfigClient';

export const dynamic = 'force-dynamic';

async function getFrontendModels() {
  const fx = await getReportingFxSnapshot();
  const reportParameters = [fx.usdToCny, CREDIT_PRICING_POLICY.cnyPerCredit];
  try {
    return await queryMany(`
      SELECT
        m.id, m.name, m.display_name, m.category, m.description,
        COALESCE(m.capabilities->>'badge', '') AS badge,
        COALESCE(m.capabilities->>'sub_type', '') AS sub_type,
        COALESCE(m.capabilities->>'pricing_hint', '') AS pricing_hint,
        COALESCE((m.capabilities->>'is_default')::boolean, false) AS is_default,
        m.status, m.tier, m.is_visible, m.auto_route_eligible, m.is_featured,
        COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) AS is_pinned,
        m.sort,
        m.capabilities,
        COALESCE(m.supported_ratios, '[]'::jsonb) AS supported_ratios,
        COALESCE(m.supported_resolutions, '[]'::jsonb) AS supported_resolutions,
        COALESCE(m.supported_durations, '[]'::jsonb) AS supported_durations,
        m.backup_model_id, m.backup_provider_id,
        mc.provider AS default_provider,
        m.created_at, m.updated_at,
        COALESCE(rc.approved_count, 0)::int AS approved_routes,
        COALESCE(rc.healthy_count, 0)::int AS healthy_routes,
        COALESCE(rc.total_routes, 0)::int AS total_routes,
        COALESCE(rc.provider_ids, '[]'::jsonb) AS provider_ids,
        COALESCE(rc.routes, '[]'::jsonb) AS routes,
        rc.min_cost_usd,
        rc.min_cost_cny,
        COALESCE(NULLIF(mp.base_credits, 0), mc.credits_price, 20)::int AS base_credits,
        COALESCE(mp.pricing_mode, 'auto') AS pricing_mode,
        COALESCE(mp.pricing_type, 'fixed') AS pricing_type,
        COALESCE(mp.min_gross_margin_rate, 0.3)::numeric AS min_gross_margin_rate,
        CASE
          WHEN COALESCE(NULLIF(mp.base_credits, 0), mc.credits_price, 20) > 0 AND rc.min_cost_cny IS NOT NULL AND rc.min_cost_cny > 0 THEN
            ROUND((((COALESCE(NULLIF(mp.base_credits, 0), mc.credits_price, 20)::numeric * $2::numeric - rc.min_cost_cny) / (COALESCE(NULLIF(mp.base_credits, 0), mc.credits_price, 20)::numeric * $2::numeric)) * 100)::numeric, 1)
          ELSE NULL
        END AS gross_margin_rate,
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
          COUNT(*) FILTER (WHERE pm.review_status = 'approved')::int AS approved_count,
          COUNT(*) FILTER (WHERE pm.enabled AND pm.review_status = 'approved' AND p.enabled = TRUE AND COALESCE(p.health_status, 'healthy') = 'healthy')::int AS healthy_count,
          COUNT(*)::int AS total_routes,
          jsonb_agg(DISTINCT pm.provider_id) FILTER (WHERE pm.provider_id IS NOT NULL) AS provider_ids,
          jsonb_agg(
            jsonb_build_object(
              'id', pm.id,
              'provider_id', pm.provider_id,
              'provider_name', COALESCE(p.name, pm.provider_id),
              'provider_model_id', pm.provider_model_id,
              'enabled', pm.enabled,
              'priority', pm.priority,
              'review_status', pm.review_status,
              'health_status', COALESCE(p.health_status, 'healthy'),
              'cost_cny', CASE
                WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN (pm.cost_config->>'base_cost')::numeric
                ELSE (pm.cost_config->>'base_cost')::numeric * $1::numeric
              END,
              'cost_usd', CASE
                WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN (pm.cost_config->>'base_cost')::numeric / $1::numeric
                ELSE (pm.cost_config->>'base_cost')::numeric
              END
            ) ORDER BY pm.priority DESC, pm.id ASC
          ) FILTER (WHERE pm.id IS NOT NULL) AS routes,
          MIN(
            CASE 
              WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN NULLIF(pm.cost_config->>'base_cost', '')::numeric / $1::numeric
              ELSE NULLIF(pm.cost_config->>'base_cost', '')::numeric
            END
          ) FILTER (WHERE pm.review_status = 'approved' AND NULLIF(pm.cost_config->>'base_cost', '')::numeric > 0) AS min_cost_usd,
          MIN(
            CASE 
              WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN NULLIF(pm.cost_config->>'base_cost', '')::numeric
              ELSE NULLIF(pm.cost_config->>'base_cost', '')::numeric * $1::numeric
            END
          ) FILTER (WHERE pm.review_status = 'approved' AND NULLIF(pm.cost_config->>'base_cost', '')::numeric > 0) AS min_cost_cny
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
      LEFT JOIN LATERAL (
        SELECT mc.credits_price, mc.provider FROM ai_studio.models_config mc
        WHERE LOWER(mc.id) = LOWER(m.id) AND mc.credits_price > 0 LIMIT 1
      ) mc ON TRUE
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
      WHERE m.status != 'disabled'
      ORDER BY
        CASE WHEN COALESCE(m.is_pinned, (m.capabilities->>'is_pinned')::boolean, false) THEN 0 ELSE 1 END,
        CASE WHEN m.is_visible THEN 0 ELSE 1 END,
        CASE m.tier WHEN 'core' THEN 0 WHEN 'backup' THEN 1 ELSE 2 END,
        m.sort ASC, m.created_at ASC
    `, reportParameters);
  } catch (err) {
    return await queryMany(`
      SELECT
        m.id, m.name, m.display_name, m.category, m.description,
        COALESCE(m.capabilities->>'badge', '') AS badge,
        COALESCE(m.capabilities->>'sub_type', '') AS sub_type,
        COALESCE(m.capabilities->>'pricing_hint', '') AS pricing_hint,
        m.status, m.tier, m.is_visible, m.auto_route_eligible, m.is_featured,
        COALESCE((m.capabilities->>'is_pinned')::boolean, false) AS is_pinned,
        m.sort,
        m.capabilities,
        COALESCE(m.supported_ratios, '[]'::jsonb) AS supported_ratios,
        COALESCE(m.supported_resolutions, '[]'::jsonb) AS supported_resolutions,
        COALESCE(m.supported_durations, '[]'::jsonb) AS supported_durations,
        m.backup_model_id, m.backup_provider_id,
        mc.provider AS default_provider,
        m.created_at, m.updated_at,
        COALESCE(rc.approved_count, 0)::int AS approved_routes,
        COALESCE(rc.healthy_count, 0)::int AS healthy_routes,
        COALESCE(rc.total_routes, 0)::int AS total_routes,
        COALESCE(rc.provider_ids, '[]'::jsonb) AS provider_ids,
        COALESCE(rc.routes, '[]'::jsonb) AS routes,
        rc.min_cost_usd,
        rc.min_cost_cny,
        COALESCE(NULLIF(mp.base_credits, 0), mc.credits_price, 20)::int AS base_credits,
        COALESCE(mp.pricing_mode, 'auto') AS pricing_mode,
        COALESCE(mp.pricing_type, 'fixed') AS pricing_type,
        COALESCE(mp.min_gross_margin_rate, 0.3)::numeric AS min_gross_margin_rate,
        CASE
          WHEN COALESCE(NULLIF(mp.base_credits, 0), mc.credits_price, 20) > 0 AND rc.min_cost_cny IS NOT NULL AND rc.min_cost_cny > 0 THEN
            ROUND((((COALESCE(NULLIF(mp.base_credits, 0), mc.credits_price, 20)::numeric * $2::numeric - rc.min_cost_cny) / (COALESCE(NULLIF(mp.base_credits, 0), mc.credits_price, 20)::numeric * $2::numeric)) * 100)::numeric, 1)
          ELSE NULL
        END AS gross_margin_rate,
        0 AS calls_24h,
        100.0 AS success_rate_24h,
        0 AS avg_ms_24h
      FROM ai_studio.ai_models m
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE pm.review_status = 'approved')::int AS approved_count,
          COUNT(*) FILTER (WHERE pm.enabled AND pm.review_status = 'approved')::int AS healthy_count,
          COUNT(*)::int AS total_routes,
          jsonb_agg(DISTINCT pm.provider_id) FILTER (WHERE pm.provider_id IS NOT NULL) AS provider_ids,
          jsonb_agg(
            jsonb_build_object(
              'id', pm.id,
              'provider_id', pm.provider_id,
              'provider_name', pm.provider_id,
              'provider_model_id', pm.provider_model_id,
              'enabled', pm.enabled,
              'priority', pm.priority,
              'review_status', pm.review_status,
              'health_status', 'healthy',
              'cost_cny', CASE
                WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN (pm.cost_config->>'base_cost')::numeric
                ELSE (pm.cost_config->>'base_cost')::numeric * $1::numeric
              END,
              'cost_usd', CASE
                WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN (pm.cost_config->>'base_cost')::numeric / $1::numeric
                ELSE (pm.cost_config->>'base_cost')::numeric
              END
            ) ORDER BY pm.priority DESC, pm.id ASC
          ) FILTER (WHERE pm.id IS NOT NULL) AS routes,
          MIN(
            CASE 
              WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN NULLIF(pm.cost_config->>'base_cost', '')::numeric / $1::numeric
              ELSE NULLIF(pm.cost_config->>'base_cost', '')::numeric
            END
          ) FILTER (WHERE pm.review_status = 'approved' AND NULLIF(pm.cost_config->>'base_cost', '')::numeric > 0) AS min_cost_usd,
          MIN(
            CASE 
              WHEN UPPER(pm.cost_config->>'currency') = 'CNY' THEN NULLIF(pm.cost_config->>'base_cost', '')::numeric
              ELSE NULLIF(pm.cost_config->>'base_cost', '')::numeric * $1::numeric
            END
          ) FILTER (WHERE pm.review_status = 'approved' AND NULLIF(pm.cost_config->>'base_cost', '')::numeric > 0) AS min_cost_cny
        FROM ai_studio.provider_models pm WHERE pm.model_id = m.id
      ) rc ON TRUE
      LEFT JOIN LATERAL (
        SELECT mc.credits_price, mc.provider FROM ai_studio.models_config mc
        WHERE LOWER(mc.id) = LOWER(m.id) AND mc.credits_price > 0 LIMIT 1
      ) mc ON TRUE
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
      WHERE m.status != 'disabled'
      ORDER BY
        CASE WHEN COALESCE((m.capabilities->>'is_pinned')::boolean, false) THEN 0 ELSE 1 END,
        CASE WHEN m.is_visible THEN 0 ELSE 1 END,
        CASE m.tier WHEN 'core' THEN 0 WHEN 'backup' THEN 1 ELSE 2 END,
        m.sort ASC, m.created_at ASC
    `, reportParameters);
  }
}

export default async function ModelsPage({ searchParams }) {
  const admin = await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const initialBrand = resolvedSearchParams?.brand || 'all';

  let models = [];
  let pendingPricesCount = 0;

  try {
    const [fetchedModels, pendingRow] = await Promise.all([
      getFrontendModels(),
      queryOne(`
        SELECT COUNT(*)::int AS count
        FROM ai_studio.provider_model_price_versions
        WHERE status IN ('staged', 'pending_review')
      `).catch(() => ({ count: 0 })),
    ]);
    const canonicalMap = new Map();
    CANONICAL_GROUPS.forEach((g) => {
      canonicalMap.set(g.targetId, g.aliases || []);
    });

    models = (fetchedModels || []).map((m) => {
      const aliases = canonicalMap.get(m.id) || [];
      const isCanonical = canonicalMap.has(m.id);
      const isOrphan = isOrphanVariantCandidate(m.id, m.tier);
      const suggestedTarget = isOrphan ? suggestCanonicalTarget(m.id) : null;
      return {
        ...m,
        aliases,
        alias_count: aliases.length,
        is_canonical: isCanonical,
        is_orphan_candidate: isOrphan,
        suggested_target: suggestedTarget,
      };
    });
    pendingPricesCount = Number(pendingRow?.count || 0);
  } catch (error) {
    console.error('[admin/models] Failed to load models for frontend management:', error.message);
  }

  return (
    <>
    <div className="mb-4"><Link href="/admin/models/publication" className="text-sm font-medium text-brand hover:underline">模型接入、测试与发布 →</Link></div>
    <FrontendConfigClient
      initialModels={JSON.parse(JSON.stringify(models))}
      initialBrand={initialBrand}
      pendingPricesCount={pendingPricesCount}
      canWrite={hasPermission(admin.role, PERMISSIONS.modelsWrite)}
    />
    </>
  );
}
