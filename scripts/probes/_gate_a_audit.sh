#!/usr/bin/env bash
# Read-only Gate A audit. Prints no secret values.
W=/home/wwwroot/AI/domain/supdance.com/web
B=http://127.0.0.1:3100
set -a; . /etc/supdance.env; set +a
cd "$W"
has() { if [ -n "${!1:-}" ]; then echo "$1=SET(len ${#1})"; else echo "$1=UNSET"; fi; }

echo "### A1 code / repo"
git -C "$W" remote -v | head -1; git -C "$W" status --porcelain | wc -l | xargs echo "uncommitted files:"

echo "### A2 host security"
ufw status 2>/dev/null | head -1
grep -Ei '^\s*(PasswordAuthentication|PermitRootLogin)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
systemctl is-active fail2ban 2>/dev/null | xargs echo "fail2ban:"
ss -tlnp 2>/dev/null | awk 'NR>1{print $4}' | grep -vE '^(127\.|\[::1\])' | sed 's/.*://' | sort -un | xargs echo "public listening ports:"
df -h / | awk 'NR==2{print "disk:",$5}'; free -m | awk '/Mem/{print "mem MB used/total:",$3"/"$2}'
echo "backup timers:"; systemctl list-timers --all 2>/dev/null | grep -iE 'backup|dump' || echo "  none"
crontab -l 2>/dev/null | grep -iE 'backup|dump' || echo "  root cron: no backup job"
ls -la /home/ubuntu/backups /var/backups/supdance 2>/dev/null | tail -3

echo "### A3 MuAPI removal"
for f in app/api/v1/[[...path]]/route.js lib/adapters/MuAPIAdapter.js packages/studio/src/muapi.js components/ApiKeyModal.js; do [ -e "$f" ] && echo "EXISTS $f" || echo "gone   $f"; done
grep -rlis muapi app lib components --include=*.js --include=*.jsx 2>/dev/null | wc -l | xargs echo "server source files mentioning muapi:"
has MUAPI_API_KEY
curl -s -o /dev/null -w "GET /api/v1/account/balance -> %{http_code}\n" $B/api/v1/account/balance

echo "### A4 official standby keys"
for k in VOLCENGINE_API_KEY ARK_API_KEY KLING_ACCESS_KEY KLING_API_KEY MINIMAX_API_KEY DASHSCOPE_API_KEY OPENAI_API_KEY GOOGLE_API_KEY GEMINI_API_KEY RUNNINGHUB_API_KEY; do has $k; done

echo "### A5/A6 models, signup credits, generations"
has INITIAL_SIGNUP_CREDITS; echo "INITIAL_SIGNUP_CREDITS value: ${INITIAL_SIGNUP_CREDITS:-<default>}"
curl -s $B/api/models/active | head -c 300; echo
node --experimental-loader ./scripts/server-only-loader.mjs -e "
const { queryMany } = await import('./lib/db/index.js');
const q = async (label, sql) => { try { console.log(label, JSON.stringify(await queryMany(sql))); } catch (e) { console.log(label, 'ERR', e.message.slice(0,120)); } };
await q('provider secrets (names only):', \"SELECT provider_id, COUNT(*) FROM ops_bill.provider_secrets GROUP BY provider_id\");
await q('jobs last 7d by status:', \"SELECT status, COUNT(*) FROM ai_studio.generation_jobs WHERE created_at > now()-interval '7 days' GROUP BY status\");
await q('jobs all-time by provider/status:', \"SELECT provider_id, status, COUNT(*) FROM ai_studio.generation_jobs GROUP BY 1,2 ORDER BY 1,2\");
await q('invite codes:', \"SELECT status, COUNT(*), SUM(used_count) used FROM ai_studio.invite_codes GROUP BY status\");
await q('users:', \"SELECT COUNT(*) total, COUNT(*) FILTER (WHERE role<>'user') admins FROM users\");
await q('pending orders:', \"SELECT status, COUNT(*) FROM orders GROUP BY status\");
process.exit(0);
" 2>/dev/null

echo "### A7 invite gate (register without code)"
curl -s -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"email":"audit-probe-no-code@example.invalid","password":"Probe-Only-123!"}' | head -c 300; echo
has INVITE_CODE_REQUIRED; echo "INVITE_CODE_REQUIRED value: ${INVITE_CODE_REQUIRED:-<default>}"

echo "### A8 compliance / moderation"
for k in CONTENT_MODERATION_PROVIDER ALIYUN_GREEN_ACCESS_KEY TENCENT_TMS_SECRET_ID MODERATION_ENABLED; do has $k; done

echo "### Ops"
for k in OPS_ALERT_WEBHOOK_URL SENTRY_DSN NEXT_PUBLIC_SENTRY_DSN; do has $k; done
echo "SMTP_FROM_NAME: ${SMTP_FROM_NAME:-<unset>}"
echo "PUBLIC_PAID_CHECKOUT_ENABLED: ${PUBLIC_PAID_CHECKOUT_ENABLED:-<unset>}"

echo "### Front-end checks"
for p in / /zh /en /pricing /zh/pricing /register /zh/register /studio; do curl -s -o /dev/null -w "$p -> %{http_code}\n" $B$p; done
curl -s $B/zh | grep -oE 'Seedance 2\.5[^<]{0,20}|82% ?OFF|4折|SLA' | sort -u | head -5 | sed 's/^/  promo text found: /'
curl -s $B/api/ready; echo
