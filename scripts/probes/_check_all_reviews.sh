#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const r = await queryMany(\"SELECT provider_id, review_status, count(*) FROM ai_studio.provider_models GROUP BY provider_id, review_status ORDER BY provider_id\");
console.log(JSON.stringify(r, null, 2));
process.exit(0);
" 2>/dev/null
