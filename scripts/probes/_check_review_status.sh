#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const r = await queryMany(\"SELECT review_status, count(*) FROM ai_studio.provider_models WHERE provider_id = 'runninghub' GROUP BY review_status\");
console.log('RunningHub review_status 分布:');
console.log(JSON.stringify(r, null, 2));

const app = await queryMany(\"SELECT id, model_id, review_status, enabled, provider_endpoint FROM ai_studio.provider_models WHERE provider_id = 'runninghub' AND review_status = 'approved'\");
console.log('已批准的 3 个渠道:');
console.log(JSON.stringify(app, null, 2));

process.exit(0);
" 2>/dev/null
