#!/usr/bin/env bash
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web
node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const rows = await queryMany(\"SELECT id, name, enabled, priority FROM ai_studio.ai_providers ORDER BY priority\");
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
" 2>/dev/null
