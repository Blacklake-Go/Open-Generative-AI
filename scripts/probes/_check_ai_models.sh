#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const m = await queryMany(\"SELECT status, count(*) FROM ai_studio.ai_models GROUP BY status\");
console.log('ai_models status 分布:');
console.log(JSON.stringify(m, null, 2));

const act = await queryMany(\"SELECT id, name, category, status, tier, is_visible FROM ai_studio.ai_models WHERE status = 'active' LIMIT 10\");
console.log('部分 active 模型:');
console.log(JSON.stringify(act, null, 2));

process.exit(0);
" 2>/dev/null
