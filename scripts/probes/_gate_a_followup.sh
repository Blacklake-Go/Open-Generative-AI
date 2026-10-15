#!/usr/bin/env bash
W=/home/wwwroot/AI/domain/supdance.com/web
set -a; . /etc/supdance.env; set +a
cd "$W"
echo "### active models summary"
curl -s http://127.0.0.1:3100/api/models/active | python3 -c "
import sys,json; d=json.load(sys.stdin); m=d.get('models',[])
print('count',len(m))
for x in m: print(' ',x.get('id'),'|',x.get('category') or x.get('type'),'|',x.get('provider'),'|',x.get('creditsPrice'))"
echo "### route file on server"
ls -la --time-style=full-iso app/api/models/active/route.js; head -5 app/api/models/active/route.js
grep -n "displayName\|listActiveModels\|listPublicModels" app/api/models/active/route.js | head
echo "### BUILD_ID / deploy time"
cat .next/BUILD_ID; echo; ls -la --time-style=full-iso .next/BUILD_ID
echo "### recently modified source (last 10h)"
find app lib components scripts -newer .next/BUILD_ID -type f 2>/dev/null | head -20
echo "### git"
git config --global --add safe.directory "$W" 2>/dev/null
git -C "$W" log --oneline -3; git -C "$W" remote -v | head -1; git -C "$W" status --porcelain | wc -l | xargs echo "uncommitted:"
node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const q = async (l, s) => { try { console.log(l, JSON.stringify(await queryMany(s))); } catch (e) { console.log(l, 'ERR', e.message.slice(0,140)); } };
await q('providers:', \"SELECT id, enabled, health_status, updated_at FROM ai_studio.ai_providers WHERE id IN ('muapi','runninghub','volcengine') ORDER BY id\");
await q('muapi routes enabled:', \"SELECT COUNT(*) FILTER (WHERE enabled) en, MAX(updated_at) last FROM ai_studio.provider_models WHERE provider_id='muapi'\");
await q('gen tables:', \"SELECT table_schema||'.'||table_name t FROM information_schema.tables WHERE table_name ~ '(generation|creation|task)' ORDER BY 1\");
await q('audit log recent provider changes:', \"SELECT action, target_id, created_at FROM admin_audit_logs WHERE created_at > now()-interval '12 hours' ORDER BY created_at DESC LIMIT 10\");
process.exit(0);
" 2>/dev/null
