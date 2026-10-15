# SupDance Production Readiness — first audit snapshot

Date: 2026-09-23 (Asia/Taipei). Initial evidence snapshot, not a full release certification.

## Architecture observed

- Web: Next.js App Router / React / Node. `supdance.service` runs `npm run start` from `/home/wwwroot/AI/domain/supdance.com/web` on loopback port 3100.
- Database: PostgreSQL 16 via `lib/db/connection.js`; 41 SQL migrations currently exist in `lib/db/migrations/`.
- Generation: Studio (`packages/studio`) -> `/api/generation/quote` -> authenticated/idempotent `/api/generations` -> `lib/services/generationCore.js` -> provider routing/adapters -> object-storage ingestion -> creation/assets history -> credit settlement or release.
- Worker: active `supdance-worker.service` runs `scripts/generation-worker-supervisor.mjs` from this project root.
- Payment: `/api/billing/checkout` -> `lib/payments/*` -> Alipay/Stripe/WeChat webhooks -> `lib/services/webhookDispatcher.js`, `lib/repositories/webhooks.js`, and order/entitlement/credit updates.

## Live snapshot

- Domain resolves to the configured host. After the updated build was placed in `.next`, `supdance-worker.service` restarted at 10:14 and `supdance.service` restarted at 10:35 (Asia/Taipei); both are active. The active `.next/BUILD_ID` was created at 10:34.
- Deployed service smoke: direct `/api/health`, `/api/live`, `/api/ready`, and `/studio/image` returned HTTP 200; Nginx HTTPS `/api/health` and `/studio/image` also returned HTTP 200. Health latency was 1.69s direct and 4.99s via Nginx during concurrent builds. Earlier health/ready checks each had one 8-second timeout followed by successful bounded rechecks; resource pressure from concurrent builds is observed, but the earlier timeouts’ cause is unconfirmed.
- `GET /api/generations` returned 401 without a session; `/api/billing/plans` and `/api/models/active` returned 200.
- Visible Image Studio chooser: 77 T2I and 74 I2I rows. Inventory only; no generation submitted.
- Git checkout: `main` is 7 commits behind `origin/main`; the worktree has 537 modified/untracked entries. Existing source changes were preserved and used by the observed build; exact build-to-commit provenance is not recorded, so a clean reproducible release remains outstanding.
- Separate stopped PM2 `supdance-worker` entry invokes a legacy PHP queue launcher. It is not the active systemd Node worker, but is operationally misleading.

## Confirmed gaps and limits

1. The storage-ingestion failure path previously marked a task succeeded with `result_url = null`, committed reserved credits, and claimed a retry that had no consumer. TASK-001 is patched in source: storage failure records a failed task and releases the reservation in the same transaction. Focused regression tests pass. Web and worker were restarted after a new build was placed in `.next`; no provider-backed storage-failure injection was run, so financial runtime behavior remains unverified.
2. `/api/health` and `/api/ready` check PostgreSQL/migrations only; they omit queue, storage, AI provider, and payment readiness.
3. Registration/login, generation output, credit settlement/refund, checkout/webhook, subscription, history/download, and admin RBAC remain unverified. No signup, OTP, purchase, or paid generation was performed.

Architecture discovery and public smoke checks: DONE. TASK-001 source fix: deployed; focused tests pass, runtime failure injection remains unverified. Build provenance and full audit/remediation: IN PROGRESS. See companion audit docs.
