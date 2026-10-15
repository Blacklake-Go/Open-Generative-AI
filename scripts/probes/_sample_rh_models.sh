#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const rows = await queryMany(\"SELECT model_id, provider_model_id, provider_endpoint, cost_config FROM ai_studio.provider_models WHERE provider_id = 'runninghub' LIMIT 20\");
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
" 2>/dev/null
