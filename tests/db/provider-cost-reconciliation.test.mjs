import test from 'node:test';
import assert from 'node:assert/strict';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL);
  process.env.DATABASE_URL = testUrl;
}
const db = testUrl ? await import('../../lib/db/index.js') : null;
const costs = testUrl ? await import('../../lib/repositories/costRecords.js') : null;
const attempts = testUrl ? await import('../../lib/repositories/attempts.js') : null;
const users = [];
const pgTest = (name, fn) => test(name, { skip: !testUrl }, fn);
const invalidDecision = { code: 'COST_RECONCILIATION_INVALID' };

test.after(async () => { if (db) await db.closePgPool(); });
test.afterEach(async () => {
  for (const id of users.splice(0)) {
    await db.execute('DELETE FROM ai_studio.creations WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [id]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [id]);
  }
});

async function fixture() {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const userId = await allocateUserId({ reserve: auth.reserveUserId, findFirstAvailable: auth.findFirstAvailableUserId, isExhausted: auth.isUserIdPoolExhausted });
  users.push(userId);
  await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status) VALUES($1,$2,'user',120,'active')`, [userId, `${userId}@cost-reconcile.test`]);
  const jobId = db.randomId('rec_job');
  const providerId = db.randomId('rec_provider');
  const modelId = db.randomId('rec_model');
  await db.execute(`INSERT INTO ai_studio.creations(id,user_id,studio_id,status,credit_cost,provider,model)
    VALUES($1,$2,'image','processing',40,$3,$4)`, [jobId, userId, providerId, modelId]);
  const attempt = await attempts.createGenerationAttempt({
    creationId: jobId, attemptNumber: 1, providerId, providerModelId: 'fixture_upstream_model',
    providerRequestId: db.randomId('receipt'),
  });
  return { jobId, userId, attemptId: attempt.id, providerId, modelId };
}

const readCost = (id) => db.queryOne('SELECT * FROM ai_studio.provider_cost_records WHERE id=$1', [id]);
const readEvents = (id) => db.queryMany('SELECT * FROM ai_studio.provider_cost_reconciliation_events WHERE cost_record_id=$1 ORDER BY id', [id]);
const readUserCredits = async (id) => Number((await db.queryOne('SELECT credits FROM auth_usr.users WHERE id=$1', [id])).credits);
const inQueue = async (jobId, options) => (await costs.listCostReconciliationQueue({ limit: 200, ...options })).filter((row) => row.job_id === jobId);

pgTest('invoice_matched keeps estimated, reported and reconciled amounts independent and untouched by later retries', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord({
    ...input, creditsCharged: 40, estimatedCostUsd: 2, actualCostUsd: 1,
    costSource: 'provider_reported', fxSnapshot: { usdToCny: 7 },
  });
  const before = await readCost(id);
  const result = await costs.reconcileProviderCostRecord({
    costRecordId: id, status: 'invoice_matched', reconciledCostUsd: '1.25',
    evidenceRef: '  bill-2026-10-001  ', actorId: 'admin_1',
  });
  assert.match(result.eventId, /^pcre_/);
  assert.equal(result.costRecordId, id);
  assert.equal(result.jobId, input.jobId);
  assert.equal(result.attemptId, input.attemptId);
  assert.equal(result.providerId, input.providerId);
  assert.equal(result.modelId, input.modelId);
  assert.equal(result.fromStatus, 'provider_reported');
  assert.equal(result.status, 'invoice_matched');
  assert.equal(result.providerReportedCostUsd, 1);
  assert.equal(result.reconciledCostUsd, 1.25);
  assert.equal(result.varianceUsd, 0.25);
  assert.equal(result.evidenceRef, 'bill-2026-10-001');
  assert.equal(result.varianceReason, null);
  assert.equal(result.actorId, 'admin_1');

  let row = await readCost(id);
  assert.equal(row.reconciliation_status, 'invoice_matched');
  assert.equal(Number(row.reconciled_cost_usd), 1.25);
  assert.equal(row.billing_evidence_ref, 'bill-2026-10-001');
  assert.equal(row.variance_reason, null);
  assert.equal(row.reconciled_by, 'admin_1');
  assert.ok(row.reconciled_at instanceof Date);
  assert.equal(Number(row.estimated_cost_usd), 2);
  assert.equal(Number(row.actual_cost_usd), 1);
  assert.equal(row.credits_charged, 40);
  assert.equal(row.cost_source, 'provider_reported');
  assert.deepEqual(row.fx_snapshot_json, { usdToCny: 7 });
  assert.equal(row.created_at.getTime(), before.created_at.getTime());
  assert.equal(await readUserCredits(input.userId), 120);

  // Automatic settlement retries after reconciliation cannot rewrite a manual decision.
  await costs.insertProviderCostRecord({
    ...input, creditsCharged: 40, estimatedCostUsd: 99, actualCostUsd: 9, costSource: 'provider_reported',
  });
  row = await readCost(id);
  assert.equal(row.reconciliation_status, 'invoice_matched');
  assert.equal(Number(row.reconciled_cost_usd), 1.25);
  assert.equal(row.billing_evidence_ref, 'bill-2026-10-001');
  assert.equal(Number(row.actual_cost_usd), 1);
  assert.equal(Number(row.estimated_cost_usd), 2);
  assert.equal((await readEvents(id)).length, 1);
});

pgTest('invalid decisions are rejected before any write and unknown records fail explicitly', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord({ ...input, creditsCharged: 40, actualCostUsd: 1 });
  const original = await readCost(id);
  const invalid = [
    { status: 'invoice_matched' },
    { status: 'invoice_matched', reconciledCostUsd: 1 },
    { status: 'not_billable' },
    { status: 'not_billable', reconciledCostUsd: 2 },
    { status: 'cost_gap', reconciledCostUsd: 1, varianceReason: '原因' },
    { status: 'cost_gap' },
    { status: 'disputed' },
    { status: 'disputed', varianceReason: '   ' },
    { status: 'pending_reconciliation' },
    { status: 'provider_reported' },
  ];
  for (const decision of invalid) {
    await assert.rejects(
      costs.reconcileProviderCostRecord({ costRecordId: id, actorId: 'admin_1', ...decision }),
      invalidDecision,
      `decision ${JSON.stringify(decision)} must be rejected`,
    );
  }
  assert.deepEqual(await readCost(id), original);
  assert.equal((await readEvents(id)).length, 0);
  await assert.rejects(
    costs.reconcileProviderCostRecord({ costRecordId: 'pcr_missing', status: 'disputed', varianceReason: '原因' }),
    { code: 'COST_RECORD_NOT_FOUND' },
  );
  await assert.rejects(
    costs.reconcileProviderCostRecord({ status: 'disputed', varianceReason: '原因' }),
    { code: 'COST_RECORD_NOT_FOUND' },
  );
});

pgTest('not_billable only accepts a confirmed zero and survives later automatic retries', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord({
    ...input, creditsCharged: 40, estimatedCostUsd: 2, actualCostUsd: 1, costSource: 'provider_reported',
  });
  await assert.rejects(
    costs.reconcileProviderCostRecord({ costRecordId: id, status: 'not_billable', reconciledCostUsd: 0.01 }),
    invalidDecision,
  );
  const result = await costs.reconcileProviderCostRecord({
    costRecordId: id, status: 'not_billable', reconciledCostUsd: 0,
    varianceReason: '供应商确认该次调用未计费', actorId: 'admin_1',
  });
  assert.equal(result.reconciledCostUsd, 0);
  assert.equal(result.varianceUsd, -1);
  await costs.insertProviderCostRecord({ ...input, creditsCharged: 40, actualCostUsd: 9, estimatedCostUsd: 99 });
  await costs.insertProviderCostRecord({ ...input, creditsCharged: 0 });
  const row = await readCost(id);
  assert.equal(row.reconciliation_status, 'not_billable');
  assert.equal(Number(row.reconciled_cost_usd), 0);
  assert.equal(Number(row.actual_cost_usd), 1);
  assert.equal(Number(row.estimated_cost_usd), 2);
  assert.equal(row.variance_reason, '供应商确认该次调用未计费');
  assert.equal(row.reconciled_by, 'admin_1');
  assert.equal((await readEvents(id)).length, 1);
});

pgTest('disputed records an unknown amount and a later decision appends a chained event', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord({ ...input, creditsCharged: 40, actualCostUsd: 1 });
  const disputed = await costs.reconcileProviderCostRecord({
    costRecordId: id, status: 'disputed', varianceReason: '账单数量为上报的两倍',
    evidenceRef: 'ticket-42', actorId: 'admin_1',
  });
  assert.equal(disputed.reconciledCostUsd, null);
  assert.equal(disputed.varianceUsd, null);
  let row = await readCost(id);
  assert.equal(row.reconciliation_status, 'disputed');
  assert.equal(row.reconciled_cost_usd, null);
  assert.equal(Number(row.actual_cost_usd), 1);
  assert.equal(row.variance_reason, '账单数量为上报的两倍');
  assert.equal(row.billing_evidence_ref, 'ticket-42');

  const matched = await costs.reconcileProviderCostRecord({
    costRecordId: id, status: 'invoice_matched', reconciledCostUsd: 1.2,
    evidenceRef: 'bill-9', varianceReason: '按账单更新', actorId: 'admin_2',
  });
  assert.equal(matched.fromStatus, 'disputed');
  row = await readCost(id);
  assert.equal(row.reconciliation_status, 'invoice_matched');
  assert.equal(Number(row.reconciled_cost_usd), 1.2);
  assert.equal(Number(row.actual_cost_usd), 1);

  const events = await readEvents(id);
  assert.equal(events.length, 2);
  assert.deepEqual(
    new Set(events.map((event) => `${event.from_status}->${event.to_status}`)),
    new Set(['provider_reported->disputed', 'disputed->invoice_matched']),
  );
  const byEvent = new Map(events.map((event) => [event.id, event]));
  assert.equal(byEvent.get(disputed.eventId).actor_id, 'admin_1');
  assert.equal(byEvent.get(matched.eventId).actor_id, 'admin_2');
  assert.equal(byEvent.get(disputed.eventId).provider_reported_cost_usd, '1.00000000');
  assert.equal(byEvent.get(disputed.eventId).reconciled_cost_usd, null);
  assert.equal(byEvent.get(disputed.eventId).variance_usd, null);
  assert.equal(Number(byEvent.get(matched.eventId).variance_usd), 0.2);
  assert.equal(byEvent.get(matched.eventId).job_id, input.jobId);
  assert.equal(byEvent.get(matched.eventId).attempt_id, input.attemptId);
  assert.equal((await costs.listCostReconciliationEvents(id, { limit: 1 })).length, 1);
});

pgTest('cost_gap keeps the unknown cost null, surfaces in the queue and never fabricates a CNY value', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord({
    ...input, creditsCharged: 40, estimatedCostUsd: 2, fxSnapshot: { usdToCny: 7 },
  });
  await costs.reconcileProviderCostRecord({
    costRecordId: id, status: 'cost_gap', varianceReason: '2025-11 账单缺失', actorId: 'admin_1',
  });
  const row = await readCost(id);
  assert.equal(row.reconciliation_status, 'cost_gap');
  assert.equal(row.reconciled_cost_usd, null);
  assert.equal(row.actual_cost_usd, null);
  assert.equal(Number(row.estimated_cost_usd), 2);
  assert.equal(row.variance_reason, '2025-11 账单缺失');
  assert.equal(row.billing_evidence_ref, null);

  let queue = await inQueue(input.jobId);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].reconciliation_status, 'cost_gap');
  assert.equal(queue[0].job_status, 'processing');
  assert.equal(queue[0].attempt_id, input.attemptId);

  const { getCostReport } = await import('../../lib/admin/financialReporting.js');
  let report = (await getCostReport('7d')).find((item) => item.model_id === input.modelId);
  assert.equal(report.cost_gap_count, 1);
  assert.equal(report.awaiting_reconciliation, 1);
  assert.equal(report.reconciled_cost_usd, null);
  assert.equal(report.reconciled_cost_cny, null);
  assert.equal(report.pending_reconciliation, 1);
  assert.equal(Number(report.total_cost_usd), 2, 'missing provider cost falls back to the estimate, never to zero');

  await costs.reconcileProviderCostRecord({
    costRecordId: id, status: 'invoice_matched', reconciledCostUsd: 1.5,
    evidenceRef: 'bill-2025-11', actorId: 'admin_2',
  });
  report = (await getCostReport('7d')).find((item) => item.model_id === input.modelId);
  assert.equal(report.cost_gap_count, 0);
  assert.equal(report.awaiting_reconciliation, 0);
  assert.equal(Number(report.reconciled_cost_usd), 1.5);
  assert.equal(Number(report.reconciled_cost_cny), 10.5);
  assert.equal(Number(report.total_cost_usd), 1.5, 'the reconciled amount outranks the estimate');

  queue = await inQueue(input.jobId);
  assert.equal(queue.length, 0, 'matched bills leave the default queue');
  assert.equal((await inQueue(input.jobId, { status: 'invoice_matched' })).length, 1);
});

pgTest('concurrent reconciliations serialise on the row lock and every decision is preserved', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord({ ...input, creditsCharged: 40, actualCostUsd: 1 });
  const decisions = Array.from({ length: 8 }, (_, index) => ({
    costRecordId: id,
    status: 'invoice_matched',
    reconciledCostUsd: 1 + index / 10,
    evidenceRef: `bill-${index}`,
    actorId: `admin_${index}`,
  }));
  const results = await Promise.all(decisions.map((decision) => costs.reconcileProviderCostRecord(decision)));
  assert.equal(new Set(results.map((result) => result.eventId)).size, 8);

  const row = await readCost(id);
  assert.equal(row.reconciliation_status, 'invoice_matched');
  assert.ok(decisions.some((decision) => Number(row.reconciled_cost_usd) === decision.reconciledCostUsd));
  const events = await readEvents(id);
  assert.equal(events.length, 8);
  assert.ok(events.every((event) => event.to_status === 'invoice_matched'));
  assert.ok(events.every((event) => ['provider_reported', 'invoice_matched'].includes(event.from_status)));
  assert.deepEqual(events.map((event) => event.actor_id).sort(), decisions.map((decision) => decision.actorId).sort());
  assert.equal(await readUserCredits(input.userId), 120);
});

pgTest('reconciliation joins the caller transaction and rolls back with it', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord({ ...input, creditsCharged: 40, actualCostUsd: 1 });
  const original = await readCost(id);
  await assert.rejects(db.withTransaction(async (transaction) => {
    await costs.reconcileProviderCostRecord({
      costRecordId: id, status: 'invoice_matched', reconciledCostUsd: 1.4,
      evidenceRef: 'bill-tx', actorId: 'admin_1', transaction,
    });
    const inside = await transaction.queryOne('SELECT reconciliation_status FROM ai_studio.provider_cost_records WHERE id=$1', [id]);
    assert.equal(inside.reconciliation_status, 'invoice_matched');
    throw Object.assign(new Error('Abort fixture reconciliation'), { code: 'FIXTURE_ROLLBACK' });
  }), { code: 'FIXTURE_ROLLBACK' });
  assert.deepEqual(await readCost(id), original);
  assert.equal((await readEvents(id)).length, 0);

  await db.withTransaction((transaction) => costs.reconcileProviderCostRecord({
    costRecordId: id, status: 'invoice_matched', reconciledCostUsd: 1.4,
    evidenceRef: 'bill-tx', actorId: 'admin_1', transaction,
  }));
  assert.equal((await readCost(id)).reconciliation_status, 'invoice_matched');
  assert.equal(Number((await readCost(id)).reconciled_cost_usd), 1.4);
  assert.equal((await readEvents(id)).length, 1);
});
