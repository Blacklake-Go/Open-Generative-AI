#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const r = await queryMany(\"SELECT id, provider_model_id, status, price_type, created_at, source_observed_at, fetched_at FROM ai_studio.provider_model_price_versions WHERE provider_model_id = 'pm_runninghub_minimax_hailuo_2_3_standard_t2v'\");
console.log(JSON.stringify(r, null, 2));

const m = await queryMany(\"SELECT id, name, status, tier, is_visible FROM ai_studio.ai_models WHERE id = 'minimax-hailuo-2.3-standard-t2v'\");
console.log('Model status:');
console.log(JSON.stringify(m, null, 2));

const p = await queryMany(\"SELECT model_id, base_credits, is_active FROM ai_studio.model_pricing WHERE model_id = 'minimax-hailuo-2.3-standard-t2v'\");
console.log('Model pricing:');
console.log(JSON.stringify(p, null, 2));

process.exit(0);
" 2>/dev/null
