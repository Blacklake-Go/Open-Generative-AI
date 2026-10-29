import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
const identityError = { code: 'PROVIDER_COST_IDENTITY_CONFLICT', message: /job\/attempt\/provider\/model identity/ };

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
  await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status) VALUES($1,$2,'user',0,'active')`, [userId, `${userId}@provider-cost.test`]);
  const jobId = db.randomId('cost_job');
  const providerId = 'cost_fixture_provider';
  const modelId = 'cost_fixture_model';
  await db.execute(`INSERT INTO ai_studio.creations(id,user_id,studio_id,status,credit_cost,provider,model)
    VALUES($1,$2,'image','processing',40,$3,$4)`, [jobId, userId, providerId, modelId]);
  const attempt = await attempts.createGenerationAttempt({
    creationId: jobId, attemptNumber: 1, providerId, providerModelId: 'fixture_upstream_model',
    providerRequestId: db.randomId('receipt'),
  });
  return { jobId, attemptId: attempt.id, providerId, modelId };
}

async function nextAttempt(input) {
  return attempts.createGenerationAttempt({
    creationId: input.jobId, attemptNumber: 2, providerId: input.providerId,
    providerModelId: 'fixture_upstream_model', providerRequestId: db.randomId('receipt'),
  });
}

const readCost = (id) => db.queryOne('SELECT * FROM ai_studio.provider_cost_records WHERE id=$1', [id]);
const jobCosts = (jobId) => db.queryMany('SELECT * FROM ai_studio.provider_cost_records WHERE job_id=$1 ORDER BY id', [jobId]);

pgTest('pending cost recovers in place and retains its original pricing and FX snapshots', async () => {
  const input = await fixture();
  const fx = { usdToCny: 7.1, capturedAt: '2026-01-01T00:00:00Z' };
  const id = await costs.insertProviderCostRecord({
    ...input, estimatedCostUsd: 0.75, priceVersionId: 'price_original', fxSnapshot: fx, costSource: 'estimate_only',
  });
  assert.equal(id, `pcr_${crypto.createHash('sha256').update(input.attemptId).digest('hex').slice(0, 28)}`);
  const pending = await readCost(id);
  assert.equal(pending.actual_cost_usd, null);
  assert.equal(pending.credits_charged, 0);
  assert.equal(pending.reconciliation_status, 'pending_reconciliation');

  const recoveredId = await costs.insertProviderCostRecord({
    ...input, creditsCharged: 40, actualCostUsd: 0.6, costSource: 'provider_reported',
    estimatedCostUsd: 99, priceVersionId: 'price_new', fxSnapshot: { usdToCny: 99 }, currency: 'CNY',
  });
  assert.equal(recoveredId, id);
  const recovered = await readCost(id);
  assert.equal((await jobCosts(input.jobId)).length, 1);
  assert.equal(Number(recovered.actual_cost_usd), 0.6);
  assert.equal(recovered.credits_charged, 40);
  assert.equal(recovered.cost_source, 'provider_reported');
  assert.equal(recovered.reconciliation_status, 'provider_reported');
  assert.equal(Number(recovered.estimated_cost_usd), 0.75);
  assert.equal(recovered.price_version_id, 'price_original');
  assert.deepEqual(recovered.fx_snapshot_json, fx);
  assert.equal(recovered.currency, 'USD');
  assert.deepEqual(recovered.created_at, pending.created_at);
});

pgTest('concurrent pending and success writes for one attempt produce one fully updated cost', async () => {
  const input = await fixture();
  const snapshot = { estimatedCostUsd: 1, priceVersionId: 'price_concurrent', fxSnapshot: { usdToCny: 7 } };
  const ids = await Promise.all(Array.from({ length: 32 }, (_, i) => costs.insertProviderCostRecord({
    ...input, ...snapshot,
    creditsCharged: i % 2 ? 40 : 0,
    actualCostUsd: i % 2 ? 0.8 : null,
    costSource: i % 2 ? 'provider_reported' : 'estimate_only',
  })));
  assert.equal(new Set(ids).size, 1);
  const rows = await jobCosts(input.jobId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].credits_charged, 40);
  assert.equal(Number(rows[0].actual_cost_usd), 0.8);
  assert.equal(rows[0].reconciliation_status, 'provider_reported');
  assert.equal(rows[0].cost_source, 'provider_reported');
  assert.equal(Number(rows[0].estimated_cost_usd), 1);
  assert.equal(rows[0].price_version_id, snapshot.priceVersionId);
  assert.deepEqual(rows[0].fx_snapshot_json, snapshot.fxSnapshot);
});

for (const actualCostUsd of [0, 1.25]) {
  pgTest(`late null and undefined costs cannot erase reported amount ${actualCostUsd}, source or credits`, async () => {
    const input = await fixture();
    const id = await costs.insertProviderCostRecord({
      ...input, creditsCharged: 40, actualCostUsd, costSource: 'provider_reported',
    });
    const original = await readCost(id);
    for (const unknown of [null, undefined]) {
      await costs.insertProviderCostRecord({
        ...input, actualCostUsd: unknown, creditsCharged: 0, costSource: 'estimate_only',
        reconciliationStatus: 'pending_reconciliation',
      });
      assert.deepEqual(await readCost(id), original);
    }
  });
}

pgTest('unknown costs stay null and absent historical snapshots are not invented on retry', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord(input);
  await costs.insertProviderCostRecord({ ...input, actualCostUsd: undefined, estimatedCostUsd: undefined });
  let row = await readCost(id);
  assert.equal(row.actual_cost_usd, null);
  assert.equal(row.estimated_cost_usd, null);
  assert.equal(row.reconciliation_status, 'pending_reconciliation');
  await costs.insertProviderCostRecord({
    ...input, actualCostUsd: 0.5, estimatedCostUsd: 8, priceVersionId: 'late_price', fxSnapshot: { usdToCny: 9 },
  });
  row = await readCost(id);
  assert.equal(Number(row.actual_cost_usd), 0.5);
  assert.equal(row.estimated_cost_usd, null);
  assert.equal(row.price_version_id, null);
  assert.deepEqual(row.fx_snapshot_json, {});
});

pgTest('settled credits recover even while the provider amount remains unknown', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord(input);
  await costs.insertProviderCostRecord({ ...input, creditsCharged: 40 });
  await costs.insertProviderCostRecord(input);
  const row = await readCost(id);
  assert.equal(row.credits_charged, 40);
  assert.equal(row.actual_cost_usd, null);
  assert.equal(row.reconciliation_status, 'pending_reconciliation');
});

pgTest('reported amounts may be corrected to zero while charged credits never decrease or accumulate', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord({ ...input, creditsCharged: 10, actualCostUsd: 1 });
  for (const creditsCharged of [40, 40, 20, 0]) {
    await costs.insertProviderCostRecord({ ...input, creditsCharged, actualCostUsd: 0, costSource: 'provider_reported' });
  }
  const row = await readCost(id);
  assert.equal(Number(row.actual_cost_usd), 0);
  assert.equal(row.credits_charged, 40);
  assert.equal(row.reconciliation_status, 'provider_reported');
  assert.equal((await jobCosts(input.jobId)).length, 1);
});

for (const status of ['invoice_matched', 'disputed', 'not_billable']) {
  pgTest(`automatic retries preserve ${status} and its manually reconciled amount/source`, async () => {
    // Protect a manual decision even when its amount is still unknown; zero is also known.
    for (const actual of [null, status === 'not_billable' ? 0 : 0.25]) {
      const input = await fixture();
      const id = await costs.insertProviderCostRecord({
        ...input, creditsCharged: 40, actualCostUsd: 1, estimatedCostUsd: 2,
        priceVersionId: 'manual_price', fxSnapshot: { usdToCny: 7 },
      });
      await db.execute(`UPDATE ai_studio.provider_cost_records
        SET reconciliation_status=$2, actual_cost_usd=$3, cost_source='invoice' WHERE id=$1`, [id, status, actual]);
      const manual = await readCost(id);
      for (const lateActual of [null, 99]) {
        await costs.insertProviderCostRecord({
          ...input, actualCostUsd: lateActual, creditsCharged: 0,
          costSource: lateActual === null ? 'estimate_only' : 'provider_reported',
          estimatedCostUsd: 99, priceVersionId: 'late_price', fxSnapshot: { usdToCny: 99 },
        });
        assert.deepEqual(await readCost(id), manual);
      }
    }
  });
}

pgTest('different attempts for the same job retain independent costs', async () => {
  const input = await fixture();
  const second = await nextAttempt(input);
  const firstId = await costs.insertProviderCostRecord({ ...input, actualCostUsd: 1 });
  const secondId = await costs.insertProviderCostRecord({ ...input, attemptId: second.id, actualCostUsd: 2, creditsCharged: 40 });
  assert.notEqual(firstId, secondId);
  assert.equal((await jobCosts(input.jobId)).length, 2);
  assert.equal(Number((await readCost(firstId)).actual_cost_usd), 1);
  assert.equal(Number((await readCost(secondId)).actual_cost_usd), 2);
  assert.equal((await readCost(firstId)).credits_charged, 0);
  assert.equal((await readCost(secondId)).credits_charged, 40);
});

pgTest('conflicting job, provider and model identities fail explicitly without modifying the cost', async () => {
  const input = await fixture();
  const other = await fixture();
  const id = await costs.insertProviderCostRecord(input);
  const original = await readCost(id);
  for (const mismatch of [{ jobId: other.jobId }, { providerId: 'other_provider' }, { modelId: 'other_model' }]) {
    await assert.rejects(costs.insertProviderCostRecord({
      ...input, ...mismatch, actualCostUsd: 99, creditsCharged: 99,
    }), identityError);
    assert.deepEqual(await readCost(id), original);
  }
});

for (const detached of [false, true]) {
  pgTest(`a deterministic id cannot silently reuse ${detached ? 'a detached' : 'a different'} attempt identity`, async () => {
    const input = await fixture();
    const second = await nextAttempt(input);
    const id = await costs.insertProviderCostRecord(input);
    // Exercise the collision guard, including ON DELETE SET NULL's detached-row shape.
    await db.execute('UPDATE ai_studio.provider_cost_records SET attempt_id=$2 WHERE id=$1', [id, detached ? null : second.id]);
    const original = await readCost(id);
    await assert.rejects(costs.insertProviderCostRecord({ ...input, creditsCharged: 40, actualCostUsd: 1 }), identityError);
    assert.deepEqual(await readCost(id), original);
  });
}

pgTest('concurrent conflicting identities choose one writer and reject the other without mixing values', async () => {
  const input = await fixture();
  const candidates = [
    { ...input, actualCostUsd: 1, creditsCharged: 10 },
    { ...input, modelId: 'other_model', actualCostUsd: 2, creditsCharged: 20 },
  ];
  const results = await Promise.allSettled(candidates.map((candidate) => costs.insertProviderCostRecord(candidate)));
  const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, identityError.code);
  const rows = await jobCosts(input.jobId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].model_id, candidates[winnerIndex].modelId);
  assert.equal(Number(rows[0].actual_cost_usd), candidates[winnerIndex].actualCostUsd);
  assert.equal(rows[0].credits_charged, candidates[winnerIndex].creditsCharged);
});

pgTest('recovery upsert uses the supplied transaction and rolls back with its settlement', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord(input);
  const original = await readCost(id);
  await assert.rejects(db.withTransaction(async (transaction) => {
    await costs.insertProviderCostRecord({ ...input, creditsCharged: 40, actualCostUsd: 0.5, transaction });
    const row = await transaction.queryOne('SELECT * FROM ai_studio.provider_cost_records WHERE id=$1', [id]);
    assert.equal(row.credits_charged, 40);
    assert.equal(Number(row.actual_cost_usd), 0.5);
    throw Object.assign(new Error('Abort fixture settlement'), { code: 'FIXTURE_ROLLBACK' });
  }), { code: 'FIXTURE_ROLLBACK' });
  assert.deepEqual(await readCost(id), original);
  await db.withTransaction((transaction) => costs.insertProviderCostRecord({
    ...input, creditsCharged: 40, actualCostUsd: 0.5, transaction,
  }));
  assert.equal((await readCost(id)).credits_charged, 40);
  assert.equal(Number((await readCost(id)).actual_cost_usd), 0.5);
});

pgTest('identity conflict aborts the caller transaction instead of committing unrelated writes', async () => {
  const input = await fixture();
  const id = await costs.insertProviderCostRecord(input);
  const original = await readCost(id);
  const second = await nextAttempt(input);
  await assert.rejects(db.withTransaction(async (transaction) => {
    await costs.insertProviderCostRecord({ ...input, attemptId: second.id, actualCostUsd: 2, transaction });
    await costs.insertProviderCostRecord({ ...input, providerId: 'wrong_provider', actualCostUsd: 99, transaction });
  }), identityError);
  assert.deepEqual(await readCost(id), original);
  assert.equal((await jobCosts(input.jobId)).length, 1);
});

pgTest('legacy calls without attemptId retain append-only behavior and nullable costs', async () => {
  const { attemptId, ...input } = await fixture();
  const firstId = await costs.insertProviderCostRecord(input);
  const secondId = await costs.insertProviderCostRecord({ ...input, attemptId: null, actualCostUsd: 0, creditsCharged: 40 });
  assert.notEqual(firstId, secondId);
  assert.equal((await jobCosts(input.jobId)).length, 2);
  const first = await readCost(firstId);
  const second = await readCost(secondId);
  assert.equal(first.attempt_id, null);
  assert.equal(second.attempt_id, null);
  assert.equal(first.actual_cost_usd, null);
  assert.equal(first.reconciliation_status, 'pending_reconciliation');
  assert.equal(Number(second.actual_cost_usd), 0);
  assert.equal(second.reconciliation_status, 'provider_reported');
});
