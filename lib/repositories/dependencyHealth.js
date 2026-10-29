import 'server-only';

import { queryMany } from '../db/index.js';

/**
 * Inspect the same visible, priced core models used by the public catalog.
 * Keep models in scope even when every provider route is unavailable so
 * readiness reports missing routes instead of silently omitting the model.
 */
export async function listPublicModelProviderRoutes({includeHidden=false,modelId=null,transaction=null} = {}) {
  const read=transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  return read(`
    SELECT m.id AS model_id,
      m.category AS model_category,
      pm.id AS mapping_id,
      pm.provider_id,
      pm.enabled AS mapping_enabled,
      pm.review_status,
      pm.provider_endpoint,
      pm.supported_task_types,
      pm.supported_resolutions,
      pm.supported_durations,
      pm.supported_qualities,
      pm.capabilities AS mapping_capabilities,
      pm.cost_config,
      p.enabled AS provider_enabled,
      p.health_status,
      p.circuit_state,
      p.last_health_check_at,
      CASE WHEN price.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', price.id,
        'price_type', price.price_type,
        'billing_unit', price.billing_unit,
        'currency', price.currency,
        'price_config', price.price_config,
        'source_observed_at', price.source_observed_at,
        'fetched_at', price.fetched_at,
        'created_at', price.created_at,
        'effective_at', price.effective_at,
        'expires_at', price.expires_at,
        'status', price.status
      ) END AS active_price_version
    FROM ai_studio.ai_models m
    JOIN ai_studio.model_pricing pr ON pr.model_id = m.id AND pr.is_active = TRUE
    LEFT JOIN ai_studio.provider_models pm ON pm.model_id = m.id
    LEFT JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    LEFT JOIN LATERAL (
      SELECT pv.*
      FROM ai_studio.provider_model_price_versions pv
      WHERE pv.provider_model_id = pm.id
        AND pv.status = 'active'
        AND pv.price_type IN ('account_actual', 'aggregator', 'manual')
      ORDER BY CASE pv.price_type WHEN 'account_actual' THEN 0 WHEN 'manual' THEN 1 ELSE 2 END,
        pv.version_no DESC
      LIMIT 1
    ) price ON TRUE
    WHERE (m.status = 'active' OR $1::boolean)
      AND ($2::text IS NULL OR m.id=$2)
      AND pr.base_credits IS NOT NULL
      AND (COALESCE(m.tier, 'backup') = 'core' OR $1::boolean)
      AND (COALESCE(m.is_visible, TRUE) = TRUE OR $1::boolean)
    ORDER BY m.id, pm.priority DESC NULLS LAST, pm.id ASC NULLS LAST
  `,[includeHidden,modelId]);
}
