#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { execute, queryMany } = await import('./lib/db/index.js');
await execute(\"UPDATE ai_studio.ai_providers SET enabled = FALSE, updated_at = NOW() WHERE id = 'muapi'\");
await execute(\"UPDATE ai_studio.provider_models SET enabled = FALSE, updated_at = NOW() WHERE provider_id = 'muapi'\");
const rows = await queryMany(\"SELECT id, name, enabled, priority FROM ai_studio.ai_providers ORDER BY priority\");
console.log('=== 当前平台供应商状态 ===');
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
" 2>/dev/null
