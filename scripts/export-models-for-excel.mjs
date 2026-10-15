import 'server-only';
import fs from 'node:fs';
import { queryMany } from '../lib/db/index.js';

async function main() {
  const rows = await queryMany(`
    SELECT 
      m.id,
      m.slug,
      m.name,
      m.display_name,
      m.category,
      m.status,
      m.sort,
      m.description,
      m.capabilities,
      COALESCE(pr.base_credits, pr.min_credits, 20) AS credits_price,
      pr.pricing_type,
      pr.formula_config,
      pr.site_price_cny,
      pr.min_gross_margin_rate,
      pr.is_active AS pricing_active,
      COALESCE(ch.channels, '[]'::jsonb) AS channels
    FROM ai_studio.ai_models m
    LEFT JOIN ai_studio.model_pricing pr ON pr.model_id = m.id AND pr.is_active = TRUE
    LEFT JOIN LATERAL (
      SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'channel_id', pm.id,
          'provider_id', pm.provider_id,
          'provider_name', p.name,
          'provider_type', p.provider_type,
          'provider_model_id', pm.provider_model_id,
          'enabled', pm.enabled,
          'priority', pm.priority,
          'cost_config', pm.cost_config,
          'metadata', pm.metadata,
          'is_primary', COALESCE((pm.metadata->>'primary')::boolean, false),
          'canonical_parent', pm.metadata->>'canonical_parent',
          'health_status', p.health_status,
          'provider_enabled', p.enabled
        ) ORDER BY COALESCE((pm.metadata->>'primary')::boolean, false) DESC, pm.priority DESC, pm.id ASC
      ) AS channels
      FROM ai_studio.provider_models pm
      LEFT JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
      WHERE pm.model_id = m.id
    ) ch ON TRUE
    WHERE m.status != 'disabled'
    ORDER BY m.category, m.name, m.id
  `);

  console.log(`Exported ${rows.length} models.`);
  fs.writeFileSync('./scripts/exported_models.json', JSON.stringify(rows, null, 2), 'utf-8');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
