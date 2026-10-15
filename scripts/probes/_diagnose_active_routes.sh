#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
// Eligible-route criteria from listActiveModels, ignoring provider.enabled, grouped by provider
const rows = await queryMany(\`
  SELECT pm.provider_id, p.enabled AS provider_enabled, m.status AS model_status, COUNT(DISTINCT m.id) AS models
  FROM ai_studio.provider_models pm
  JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
  JOIN ai_studio.ai_models m ON m.id = pm.model_id
  WHERE pm.enabled = TRUE AND pm.review_status = 'approved'
    AND NULLIF(BTRIM(pm.provider_endpoint), '') IS NOT NULL
  GROUP BY pm.provider_id, p.enabled, m.status
  ORDER BY pm.provider_id, m.status\`);
console.log('approved+enabled routes by provider/model status:');
console.log(JSON.stringify(rows, null, 2));

const act = await queryMany(\`
  SELECT m.id, pm.provider_id, pm.enabled, pm.review_status, pv.price_type, pv.status AS pv_status,
         COALESCE(pv.source_observed_at, pv.fetched_at, pv.created_at) AS observed
  FROM ai_studio.ai_models m
  JOIN ai_studio.provider_models pm ON pm.model_id = m.id
  LEFT JOIN ai_studio.provider_model_price_versions pv ON pv.provider_model_id = pm.id AND pv.status='active'
  WHERE m.status = 'active' ORDER BY m.id, pm.provider_id\`);
console.log('routes of the 8 active models:');
console.log(JSON.stringify(act, null, 2));
process.exit(0);
" 2>/dev/null
