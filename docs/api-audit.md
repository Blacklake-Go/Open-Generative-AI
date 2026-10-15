# API audit — first snapshot

Date: 2026-09-23. Current tree contains 164 `app/api/**/route.js` modules. This is an inventory count, not a completed method/auth matrix.

| API | Method / auth from source | Live evidence | Status |
|---|---|---|---|
| `/api/health` | GET public; DB + migration check | Initially 200; one 8s timeout; recheck 200 in 0.75s, DB/migrations OK | PARTIAL; transient slow response |
| `/api/live` | GET public | 200 | PASS |
| `/api/ready` | GET public; DB + migration check | Initially 200; one 8s timeout; recheck 200 in 0.24s | PARTIAL; transient slow response and omits other dependencies |
| `/api/auth/me` | GET session-aware | 200; body not used to claim signed-in | PARTIAL |
| `/api/auth/login`, `/api/auth/register` | POST | Not called | UNVERIFIED |
| `/api/models/active` | GET public catalog | 200 | PARTIAL; provider health not probed |
| `/api/generation/quote` | POST | Not called | UNVERIFIED |
| `/api/generations` | GET needs session; POST session + mutation guard + rate limit + moderation + idempotency | GET without session: 401; POST not called | PARTIAL |
| `/api/billing/plans` | GET | 200 | PARTIAL |
| `/api/billing/checkout` | POST session + idempotency | Not called | UNVERIFIED |
| `/api/billing/webhooks/{alipay,stripe,wechat}` | POST with provider signature verification | Not called | UNVERIFIED |
| `/api/assets`, `/api/assets/upload` | GET/POST; ownership/validation not fully inspected | Not called | UNVERIFIED |

Next: inventory methods/auth for every route, inspect ownership/validation, then test safe error cases. Provider outages and webhook replay belong in isolated test environments; do not replay production events or submit paid requests as tests.
