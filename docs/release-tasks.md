# Release tasks — initial evidence-backed list

Date: 2026-09-23. VERIFIED requires repeatable test evidence.
Updated: 2026-10-12.

## P0

### TASK-006 — Resolve Canvas Seedream 5.0 Model ID access failures
Module: Canvas / Model Routing / Volcengine
Problem: Canvas already reports the local Agent as connected, and the local MCP server lists 34 tools. The global Codex MCP registration was missing; it is now added and its `canvas_get_state` call succeeds. Generation is a separate failure: job `gen_c4434ef7c95a6e142a6cf415` failed before receiving a provider task ID with `InvalidEndpointOrModel.NotFound` for `doubao-seedream-5-0-260128`. The live Ark account showed no custom inference endpoints and no prebuilt endpoint for this model. The production admin page has three enabled routes under the same canonical `seedream-5.0` model, with conflicting provider IDs, API paths, and prices; the failed ID is on the priority-100 route with a 0.08 CNY cost floor. Customer pricing currently lists this model at 15 credits; review it before a model migration. Ark's old base model passed EOM on 2026-09-24, so new endpoints cannot be created; its scheduled EOS is 2026-11-24. Official migration guidance points to Seedream 5.0 Pro. Current Ark console prices observed: Pro `doubao-seedream-5-0-pro-260628` at 0.30 CNY/output image (up to 2.61M pixels); Flash `doubao-seedream-5-0-flash-260915` at 0.12 CNY/output image. Both exceed the existing route floor. The live Volcengine channel dashboard reports 14.3% success over 56 calls, 2,004 ms average, circuit closed, and zero consecutive failures.
Solution: Adapter changes classify explicit model/endpoint access failures as retryable `MODEL_ROUTE_UNAVAILABLE`, keep model-scoped failures from tripping the provider-wide breaker, and return a fixed secret-safe Canvas error. Do not treat failover among the three duplicate routes as safe until each route is verified. Production repair must remove the conflicting mappings, choose a user-approved supported variant, map its exact Model ID/API path/parameters, and align cost and retail pricing before enabling it. Do not silently substitute Pro or Flash for the existing base model.
Files: `lib/adapters/BaseAdapter.js`, `lib/adapters/index.js`, `lib/services/generationCore.js`, `lib/repositories/canvasProjects.js`, `lib/canvas/jobResultState.js`, Canvas job API routes, focused adapter and API tests.
Test: Local regression coverage added for Volcengine error classification, breaker scope, same-model failover eligibility, Pro model identity preservation, and secret-safe historical failure rendering. Focused tests pass 36/36. A mock adapter response is not real image-generation evidence.
Production gate: Candidate adapter changes are not deployed. Public `/api/ready` returned HTTP 503 at 2026-10-11T17:35:56Z (database and migrations OK; worker, storage, and email healthy; providers unhealthy). A fresh production release manifest captured at 2026-10-11T17:06:31Z is marked `verified`; source, config, Postgres dump, objects, and build archives passed SHA-256 and structural checks, all five restore-evidence files matched and reported `passed`, and the rollback-evidence hash matched. The snapshot records production HEAD `39c02816ae2a71530177e64fce5d14ac580efa45`, build ID `V-iDzQaowpReodJOdLerZ`, and 532 dirty entries. The backup gate is met; provider readiness remains NOT_READY. The user authorized a single Ark Seedream 5.0 Pro provider test capped at ¥0.30 and a SupDance test capped at 15 credits/image. The Ark page showed 2K, one output, ¥0.30, but browser control was interrupted before prompt submission; this run submitted neither provider nor SupDance generation and did not trigger a generation charge. Before production route changes, verify the exact Pro Model ID/API path/parameters and settle the conflicting canonical-model mappings and customer price. Then, when readiness permits, run one bounded image generation and verify provider terminal status, stored asset/history, and exact credit settlement.
Status: LOCAL CANDIDATE; Codex MCP registration configured; provider image test and real SupDance end-to-end generation UNVERIFIED; production generation NOT_READY.

## P1

### TASK-001 — Recover storage-ingestion failures or release user credits
Module: Generation / Storage / Credits
Problem: `finalizeStorageFailure` marks a task succeeded with null result URL and failed storage, commits reserved credits, and emits a retryable event. No failed-storage retry consumer was found in inspected worker/repository paths.
Risk: A user may be charged without a retrievable result; the advertised retry may never happen.
Solution: Use atomic refund behavior on storage-ingestion failure: void the reservation, mark the job failed with a null result, and emit an accurate failed event. Do not promise a retry until a durable consumer exists.
Files: `lib/services/generationCore.js`, `scripts/generation-worker.mjs`, storage services/repositories, focused tests; migration only if required.
Test: Added source-contract regression test; 4 focused generation-core tests pass, 4 isolated asset-storage tests pass, and syntax/ESLint pass. Full DB ledger integration and live build remain unverified.
Status: DONE (Worker restarted 10:14 after source patch; Web restarted 10:35 after build). Verification: focused generation-core tests 4/4, isolated asset-storage tests 4/4, syntax and ESLint pass; full DB ledger integration/build remain UNVERIFIED.

### TASK-002 — Expand readiness probes
Problem: `/api/health` and `/api/ready` cover PostgreSQL/migrations only, not queue, storage, AI provider, or payment.
Risk: Green readiness can coexist with unavailable paid-generation dependencies.
Solution: Add bounded, secret-safe probes and unknown/degraded states.
Files: health/ready routes and `lib/services/systemHealth.js`.
Test: Component-state tests and live secret-safe smoke.
Status: TODO

### TASK-003 — Restore reproducible release source
Problem: Production checkout is 7 commits behind `origin/main`, with 537 modified/untracked entries.
Risk: Build provenance, rollback, and reproduction are uncertain.
Solution: Preserve/review existing work, reconcile branch divergence, release from a recorded clean commit. Do not reset/discard the current worktree.
Test: Clean-checkout build, release safety checks, recorded build ID/commit.
Status: TODO

### TASK-004 — Verify real-user and financial core paths
Problem: Registration/login, terminal generation output, credit ledger, payment/webhook, subscription, history/download, and admin RBAC are untested.
Risk: Core readiness is unknown despite healthy DB/migration probes.
Solution: Use isolated provider/payment sandboxes and a confirmed test budget for cost-bearing generation; no production purchase or callback replay.
Test: Sandbox end-to-end evidence.
Status: UNVERIFIED

## P2

### TASK-005 — Clarify stale PM2 worker entry
Problem: Stopped PM2 `supdance-worker` uses a legacy PHP queue launcher; active systemd `supdance-worker.service` runs the Node generation supervisor.
Risk: Operators may restart/inspect the wrong process.
Solution: Confirm no consumer relies on PM2 entry, then retire/rename and document systemd as authoritative.
Test: Staging worker/queue check.
Status: TODO
