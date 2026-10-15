#!/usr/bin/env bash
set -e
set -a; . /etc/supdance.env; set +a
cd /home/wwwroot/AI/domain/supdance.com/web

echo "=== 1. 验证 invite_codes 表是否存在 ==="
node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const r = await queryMany(\"SELECT count(*) as cnt FROM ai_studio.invite_codes\");
console.log('invite_codes 表已就绪, 当前记录数:', r[0].cnt);
process.exit(0);
" 2>/dev/null

echo ""
echo "=== 2. 生成 50 个种子用户邀请码 ==="
node scripts/generate-beta-invite-codes.mjs 50

echo ""
echo "=== 3. 检查 ai_providers 状态 ==="
node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const rows = await queryMany(\"SELECT id, name, enabled, priority FROM ai_studio.ai_providers ORDER BY priority\");
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
" 2>/dev/null

echo ""
echo "=== 4. 服务健康检查 ==="
curl -s http://127.0.0.1:3100/api/ready | python3 -m json.tool 2>/dev/null || curl -s http://127.0.0.1:3100/api/ready
echo ""
echo "=== 5. RunningHub API Key 余额验证 ==="
curl -s "https://www.runninghub.ai/api/openapi/v2/user/info" -H "Content-Type: application/json" -d "{\"apiKey\":\"$RUNNINGHUB_API_KEY\"}" | python3 -m json.tool 2>/dev/null || echo "curl failed"
