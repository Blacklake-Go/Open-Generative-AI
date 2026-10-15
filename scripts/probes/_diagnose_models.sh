#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const r1 = await queryMany(\"SELECT count(*) FROM ai_studio.provider_models WHERE provider_id = 'runninghub'\");
const r2 = await queryMany(\"SELECT count(*) FROM ai_studio.provider_models WHERE provider_id = 'runninghub' AND enabled = true\");
const r3 = await queryMany(\"SELECT count(*) FROM ai_studio.provider_models WHERE provider_id = 'runninghub' AND review_status = 'approved'\");
const r4 = await queryMany(\"SELECT count(*) FROM ai_studio.provider_models WHERE provider_id = 'runninghub' AND NULLIF(BTRIM(provider_endpoint), '') IS NOT NULL\");
const r5 = await queryMany(\"SELECT count(*) FROM ai_studio.provider_model_price_versions pv JOIN ai_studio.provider_models pm ON pm.id = pv.provider_model_id WHERE pm.provider_id = 'runninghub'\");
console.log('RunningHub 渠道诊断:');
console.log({ total: r1[0].count, enabled: r2[0].count, approved: r3[0].count, has_endpoint: r4[0].count, price_versions: r5[0].count });
process.exit(0);
" 2>/dev/null
