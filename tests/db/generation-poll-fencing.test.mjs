import test from 'node:test';
import assert from 'node:assert/strict';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL);
  process.env.DATABASE_URL = testUrl;
}
const db = testUrl ? await import('../../lib/db/index.js') : null;
const creations = testUrl ? await import('../../lib/repositories/creations.js') : null;
const attempts = testUrl ? await import('../../lib/repositories/attempts.js') : null;
const pgTest = (name, fn) => test(name, { skip: !testUrl }, fn);
const users = [];
const dueAt = new Date('2020-01-01T00:00:00.000Z');
const futureAt = new Date('2099-01-01T00:00:00.000Z');

// Fixtures only touch the isolated PostgreSQL database: no core, provider or storage calls.
test.after(async () => { if (db) await db.closePgPool(); });
test.afterEach(async () => {
  for (const id of users.splice(0)) {
    await db.execute('DELETE FROM ai_studio.creations WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [id]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [id]);
  }
});

async function fixture({ provider = 'poll_fixture_provider', receipt = 'poll_fixture_receipt', lease = null, nextPollAt = dueAt, status = 'processing' } = {}) {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const userId = await allocateUserId({ reserve: auth.reserveUserId, findFirstAvailable: auth.findFirstAvailableUserId, isExhausted: auth.isUserIdPoolExhausted });
  users.push(userId);
  await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status) VALUES($1,$2,'user',0,'active')`, [userId, `${userId}@poll-fencing.test`]);
  const id = db.randomId('poll_job');
  return db.queryOne(`INSERT INTO ai_studio.creations
    (id,user_id,studio_id,status,credit_cost,provider,model,provider_request_id,poll_locked_until,next_poll_at,input_summary_json,started_at)
    VALUES($1,$2,'image',$3,0,$4,'poll_fixture_model',$5,$6,$7,'{"prompt":"isolated fixture"}'::jsonb,NOW()) RETURNING *`,
  [id, userId, status, provider, receipt, lease, nextPollAt]);
}

const readCreation = (id) => db.queryOne('SELECT * FROM ai_studio.creations WHERE id=$1', [id]);
const readAttempt = (id) => db.queryOne('SELECT * FROM ai_studio.generation_attempts WHERE id=$1', [id]);
const fence = (row) => ({
  expectedProviderRequestId: row.provider_request_id,
  expectedProvider: row.provider,
  expectedPollLockedUntil: row.poll_locked_until,
});
const createAttempt = (row, attemptNumber, overrides = {}) => attempts.createGenerationAttempt({
  creationId: row.id, attemptNumber, providerId: row.provider,
  providerModelId: 'poll_fixture_upstream_model', providerRequestId: row.provider_request_id,
  ...overrides,
});

for (const method of ['updateGenerationOutcome', 'updateCreationStatus', 'scheduleNextPoll']) {
  pgTest(`${method}: receipt/provider/lease mismatches are no-ops, matching Date fences succeed`, async () => {
    const row = await fixture({ lease: futureAt });
    const isSchedule = method === 'scheduleNextPoll';
    const updates = isSchedule ? { nextPollAt: futureAt } : {
      status: 'succeeded', resultText: 'local result', actualCostUsd: 0,
      expectedStatus: 'processing',
    };
    for (const mismatch of [
      { expectedProviderRequestId: 'another_receipt' },
      { expectedProviderRequestId: null },
      { expectedProvider: 'another_provider' },
      { expectedProvider: null },
      { expectedPollLockedUntil: new Date(futureAt.getTime() + 1) },
      { expectedPollLockedUntil: null },
    ]) {
      assert.equal(await creations[method](row.id, { ...updates, ...fence(row), ...mismatch }), isSchedule ? 0 : null);
      assert.deepEqual(await readCreation(row.id), row, 'a rejected fence must not even touch updated_at');
    }
    if (!isSchedule) {
      assert.equal(await creations[method](row.id, { ...updates, ...fence(row), expectedStatus: 'queued' }), null);
      assert.deepEqual(await readCreation(row.id), row, 'existing status fencing must still apply');
    }
    const result = await creations[method](row.id, { ...updates, ...fence(row) });
    if (isSchedule) {
      assert.equal(result, 1);
      const scheduled = await readCreation(row.id);
      assert.deepEqual(scheduled.next_poll_at, futureAt);
      assert.equal(scheduled.poll_locked_until, null);
    } else {
      assert.equal(result.status, 'succeeded');
      assert.equal(result.result_text, 'local result');
      assert.equal(Number(result.actual_cost_usd), 0);
      assert.ok(result.completed_at instanceof Date);
      assert.equal(result.next_poll_at, null);
      assert.equal(result.poll_locked_until, null);
    }
  });

  pgTest(`${method}: explicit null matches SQL NULL while undefined preserves legacy unfenced calls`, async () => {
    const row = await fixture({ provider: null, receipt: null });
    const isSchedule = method === 'scheduleNextPoll';
    const updates = isSchedule ? { nextPollAt: futureAt } : { status: 'processing', resultText: 'null receipt' };
    for (const mismatch of [
      { expectedProviderRequestId: 'receipt' },
      { expectedProvider: 'provider' },
      { expectedPollLockedUntil: futureAt },
    ]) {
      assert.equal(await creations[method](row.id, { ...updates, ...fence(row), ...mismatch }), isSchedule ? 0 : null);
      assert.deepEqual(await readCreation(row.id), row);
    }
    const matched = await creations[method](row.id, { ...updates, ...fence(row) });
    assert.equal(isSchedule ? matched : matched.id, isSchedule ? 1 : row.id);
    const legacy = await fixture({ lease: futureAt });
    const unfenced = await creations[method](legacy.id, {
      ...updates, expectedProviderRequestId: undefined, expectedProvider: undefined, expectedPollLockedUntil: undefined,
    });
    assert.equal(isSchedule ? unfenced : unfenced.id, isSchedule ? 1 : legacy.id);
  });
}

pgTest('an expired lease reclaimed by a new worker rejects the old worker unlock and terminal outcome', async () => {
  // Seed the exact lease previously held by the expired worker; no wall-clock sleep.
  const oldWorker = await fixture({ lease: dueAt });
  const started = Date.now();
  const newWorker = await creations.claimDuePollingCreation(oldWorker.id);
  assert.equal(newWorker.id, oldWorker.id);
  assert.deepEqual(newWorker.input_summary_json, oldWorker.input_summary_json, 'claim returns the complete row');
  assert.ok(newWorker.poll_locked_until.getTime() >= started + 30_000);
  assert.ok(newWorker.poll_locked_until.getTime() <= Date.now() + 30_000);
  assert.notDeepEqual(newWorker.poll_locked_until, oldWorker.poll_locked_until);
  assert.equal(await creations.scheduleNextPoll(oldWorker.id, { ...fence(oldWorker), nextPollAt: futureAt }), 0);
  for (const method of ['updateGenerationOutcome', 'updateCreationStatus']) {
    assert.equal(await creations[method](oldWorker.id, {
      ...fence(oldWorker), expectedStatus: 'processing', status: 'succeeded', resultText: 'stale worker',
    }), null);
  }
  assert.deepEqual(await readCreation(oldWorker.id), newWorker);
  assert.equal(await creations.claimDuePollingCreation(oldWorker.id, 30, { force: true }), null, 'force never bypasses an active lease');
  const completed = await creations.updateGenerationOutcome(newWorker.id, {
    ...fence(newWorker), expectedPollLockedUntil: newWorker.poll_locked_until.toISOString(),
    expectedStatus: 'processing', status: 'succeeded', resultText: 'current worker',
  });
  assert.equal(completed.result_text, 'current worker');
  assert.equal(completed.poll_locked_until, null);
  assert.equal(await creations.scheduleNextPoll(newWorker.id, { nextPollAt: futureAt }), 0, 'terminal rows cannot be rescheduled');
});

pgTest('concurrent claims for the same receipt have exactly one lease owner', async () => {
  const row = await fixture();
  const results = await Promise.all(Array.from({ length: 12 }, () => creations.claimDuePollingCreation(row.id)));
  const winners = results.filter(Boolean);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].provider_request_id, row.provider_request_id);
  assert.ok(winners[0].poll_locked_until instanceof Date);
  assert.deepEqual(await readCreation(row.id), winners[0]);
});

async function checkpoint(row, stage = 'provider_succeeded') {
  const attempt = await createAttempt(row, 1, { status: 'succeeded' });
  // Eligibility only inspects the receipt identity and stage, never the encrypted payload.
  await db.execute(`INSERT INTO ai_studio.generation_result_checkpoints
    (creation_id,attempt_id,provider_id,provider_request_id,stage,encrypted_payload_json)
    VALUES($1,$2,$3,$4,$5,'{"fixture":"opaque"}'::jsonb)`,
  [row.id, attempt.id, row.provider, row.provider_request_id, stage]);
}

const pause = (row, eventType) => creations.insertGenerationEvent({
  creationId: row.id, userId: row.user_id, eventType,
  provider: row.provider, providerRequestId: row.provider_request_id,
});
const dueIds = async (now = new Date()) => (await creations.listDuePollingCreations(50, now)).map((row) => row.id);

pgTest('list requires a due poll time, but fast claims do not; force never bypasses status or receipt eligibility', async () => {
  const due = await fixture();
  const future = await fixture({ nextPollAt: futureAt });
  const unscheduled = await fixture({ nextPollAt: null });
  const locked = await fixture({ lease: futureAt });
  const expired = await fixture({ lease: dueAt });
  const noReceipt = await fixture({ receipt: null });
  const queued = await fixture({ status: 'queued' });
  const succeeded = await fixture({ status: 'succeeded' });
  assert.deepEqual(new Set(await dueIds()), new Set([due.id, expired.id]));
  assert.deepEqual(new Set(await dueIds(new Date().toISOString())), new Set([due.id, expired.id]));
  assert.equal((await creations.claimDuePollingCreation(future.id)).id, future.id);
  assert.equal((await creations.claimDuePollingCreation(unscheduled.id)).id, unscheduled.id);
  for (const row of [locked, noReceipt, queued, succeeded]) {
    assert.equal(await creations.claimDuePollingCreation(row.id), null);
    assert.equal(await creations.claimDuePollingCreation(row.id, 30, { force: true }), null);
  }
});

pgTest('list retains due-time ordering, limit and lease boundary behavior', async () => {
  const first = await fixture({ nextPollAt: dueAt });
  const second = await fixture({ nextPollAt: new Date(dueAt.getTime() + 1_000) });
  const locked = await fixture({ lease: futureAt });
  const rows = await creations.listDuePollingCreations(1, futureAt);
  assert.deepEqual(rows.map((row) => row.id), [first.id]);
  assert.deepEqual(await dueIds(futureAt), [first.id, second.id], 'lease equality is still locked');
  assert.ok((await dueIds(new Date(futureAt.getTime() + 1))).includes(locked.id));
});

for (const eventType of ['PROVIDER_POLL_PAUSED', 'GENERATION_LOCAL_RECOVERY_PAUSED']) {
  pgTest(`${eventType} blocks receipt-only polling unless forced`, async () => {
    const row = await fixture();
    await pause(row, eventType);
    assert.ok(!(await dueIds()).includes(row.id));
    assert.equal(await creations.claimDuePollingCreation(row.id), null);
    assert.equal((await creations.claimDuePollingCreation(row.id, 30, { force: true })).id, row.id);
    assert.equal(await creations.claimDuePollingCreation(row.id, 30, { force: true }), null);
  });
}

for (const stage of ['provider_succeeded', 'archived']) {
  for (const receipt of [null, 'async_checkpoint_receipt']) {
    pgTest(`${stage} checkpoint with ${receipt === null ? 'null' : 'async'} receipt recovers despite provider pause but respects local pause`, async () => {
      const row = await fixture({ receipt });
      await checkpoint(row, stage);
      await pause(row, 'PROVIDER_POLL_PAUSED');
      assert.ok((await dueIds()).includes(row.id));
      const claimed = await creations.claimDuePollingCreation(row.id);
      assert.equal(claimed.id, row.id);
      assert.equal(claimed.provider_request_id, receipt);
      assert.equal('encrypted_payload_json' in claimed, false);
      assert.equal(await creations.scheduleNextPoll(row.id, { ...fence(claimed), nextPollAt: dueAt }), 1);
      await pause(row, 'GENERATION_LOCAL_RECOVERY_PAUSED');
      assert.ok(!(await dueIds()).includes(row.id), 'local recovery pause wins even with a successful checkpoint');
      assert.equal(await creations.claimDuePollingCreation(row.id), null);
      assert.equal((await creations.claimDuePollingCreation(row.id, 30, { force: true })).id, row.id);
    });
  }
}

pgTest('a synchronous checkpoint allows only one concurrent local recovery owner and still requires due time in the list', async () => {
  const row = await fixture({ receipt: null, nextPollAt: futureAt });
  await checkpoint(row);
  assert.ok(!(await dueIds()).includes(row.id));
  const results = await Promise.all(Array.from({ length: 12 }, () => creations.claimDuePollingCreation(row.id)));
  assert.equal(results.filter(Boolean).length, 1);
  const winner = results.find(Boolean);
  assert.equal(winner.provider_request_id, null);
  assert.ok(winner.poll_locked_until instanceof Date);
  assert.equal(await creations.scheduleNextPoll(row.id, { ...fence(winner), nextPollAt: dueAt }), 1);
  assert.ok((await dueIds()).includes(row.id));
});

pgTest('checkpoints from another creation or provider never enable recovery, even when forced', async () => {
  const other = await fixture({ receipt: null });
  await checkpoint(other);
  const row = await fixture({ receipt: null });
  assert.ok(!(await dueIds()).includes(row.id), 'another creation\'s checkpoint is not evidence for this row');
  assert.equal(await creations.claimDuePollingCreation(row.id), null);
  assert.equal(await creations.claimDuePollingCreation(row.id, 30, { force: true }), null);
  await checkpoint(row);
  await db.execute(`UPDATE ai_studio.generation_result_checkpoints SET provider_id='wrong_provider' WHERE creation_id=$1`, [row.id]);
  await pause(row, 'PROVIDER_POLL_PAUSED');
  assert.ok(!(await dueIds()).includes(row.id), 'a checkpoint from another provider never makes the row due');
  assert.equal(await creations.claimDuePollingCreation(row.id), null);
  assert.equal(await creations.claimDuePollingCreation(row.id, 30, { force: true }), null);
});

pgTest('a checkpoint receipt bootstraps recovery only while the parent has no receipt', async () => {
  const row = await fixture({ receipt: null });
  await checkpoint(row);
  await db.execute(`UPDATE ai_studio.generation_result_checkpoints SET provider_request_id='checkpoint_receipt' WHERE creation_id=$1`, [row.id]);
  assert.ok((await dueIds()).includes(row.id));
  const bootstrap = await creations.claimDuePollingCreation(row.id);
  assert.equal(bootstrap.id, row.id);
  assert.equal(bootstrap.provider_request_id, null, 'a checkpoint receipt must not be published as the parent receipt');
  assert.equal(await creations.scheduleNextPoll(row.id, { ...fence(bootstrap), nextPollAt: dueAt }), 1);
  // Once the parent publishes its own receipt, the receipt-only path applies:
  // a mismatched checkpoint no longer decides eligibility, it is simply ignored.
  await db.execute(`UPDATE ai_studio.creations SET provider_request_id='new_receipt' WHERE id=$1`, [row.id]);
  assert.ok((await dueIds()).includes(row.id));
  const receiptOnly = await creations.claimDuePollingCreation(row.id);
  assert.equal(receiptOnly.id, row.id);
  assert.equal(receiptOnly.provider_request_id, 'new_receipt');
  assert.equal(await creations.scheduleNextPoll(row.id, { ...fence(receiptOnly), nextPollAt: dueAt }), 1);
  await pause(row, 'PROVIDER_POLL_PAUSED');
  assert.ok(!(await dueIds()).includes(row.id), 'without a matching checkpoint a provider pause blocks receipt-only polling');
  assert.equal(await creations.claimDuePollingCreation(row.id), null);
  const forced = await creations.claimDuePollingCreation(row.id, 30, { force: true });
  assert.equal(forced.id, row.id);
  assert.equal(await creations.scheduleNextPoll(row.id, { ...fence(forced), nextPollAt: dueAt }), 1);
  await db.execute(`UPDATE ai_studio.generation_result_checkpoints SET provider_request_id='new_receipt' WHERE creation_id=$1`, [row.id]);
  assert.ok((await dueIds()).includes(row.id), 'a matching checkpoint recovers despite the provider pause');
  assert.equal((await creations.claimDuePollingCreation(row.id)).id, row.id);
});

pgTest('fenced scheduling and outcomes remain transactional and register afterCommit only for successful writes', async () => {
  const row = await fixture({ lease: futureAt });
  const effects = [];
  await assert.rejects(db.withTransaction(async (transaction) => {
    const scoped = { ...transaction, afterCommit: (effect) => effects.push(effect) };
    assert.equal(await creations.updateGenerationOutcome(row.id, {
      ...fence(row), expectedProvider: 'wrong', status: 'succeeded', transaction: scoped,
    }), null);
    assert.equal(effects.length, 0);
    assert.equal(await creations.scheduleNextPoll(row.id, { ...fence(row), nextPollAt: futureAt, transaction: scoped }), 1);
    const outcome = await creations.updateGenerationOutcome(row.id, {
      ...fence(row), expectedPollLockedUntil: null, status: 'succeeded', resultText: 'transactional', transaction: scoped,
    });
    assert.equal(outcome.result_text, 'transactional');
    assert.equal(effects.length, 1);
    assert.equal(typeof effects[0], 'function');
    assert.deepEqual(await readCreation(row.id), row, 'other clients cannot observe uncommitted changes');
    throw Object.assign(new Error('Rollback fixture'), { code: 'FIXTURE_ROLLBACK' });
  }), { code: 'FIXTURE_ROLLBACK' });
  assert.deepEqual(await readCreation(row.id), row);
});

pgTest('receipt lookup binds creation and provider, including null receipts, rather than the latest attempt', async () => {
  const row = await fixture();
  const original = await createAttempt(row, 1);
  const sameReceipt = await createAttempt(row, 2);
  const nullReceipt = await createAttempt(row, 3, { providerRequestId: null });
  const otherProvider = await createAttempt(row, 4, { providerId: 'other_provider' });
  const latest = await createAttempt(row, 5, { providerRequestId: 'other_receipt' });
  // Deliberately reverse created_at order: receipt lookup must use attempt_number.
  await db.execute(`UPDATE ai_studio.generation_attempts SET created_at=$2 WHERE id=$1`, [original.id, futureAt]);
  const otherCreation = await fixture();
  await createAttempt(otherCreation, 100);
  assert.equal((await attempts.getGenerationAttemptForReceipt(row.id, row.provider, row.provider_request_id)).id, sameReceipt.id);
  assert.equal((await attempts.getGenerationAttemptForReceipt(row.id, row.provider, null)).id, nullReceipt.id);
  assert.equal((await attempts.getGenerationAttemptForReceipt(row.id, 'other_provider', row.provider_request_id)).id, otherProvider.id);
  assert.equal((await attempts.getGenerationAttemptForReceipt(row.id, row.provider, 'other_receipt')).id, latest.id);
  assert.equal(await attempts.getGenerationAttemptForReceipt(row.id, row.provider, 'missing'), null);
  assert.equal(await attempts.getGenerationAttemptForReceipt(row.id, 'missing', null), null);
  assert.equal(await attempts.getGenerationAttemptForReceipt('missing', row.provider, row.provider_request_id), null);
  await assert.rejects(db.withTransaction(async (transaction) => {
    const uncommitted = await createAttempt(row, 6, { transaction });
    assert.equal((await attempts.getGenerationAttemptForReceipt(row.id, row.provider, row.provider_request_id, transaction)).id, uncommitted.id);
    assert.equal((await attempts.getGenerationAttemptForReceipt(row.id, row.provider, row.provider_request_id)).id, sameReceipt.id);
    throw Object.assign(new Error('Rollback fixture'), { code: 'FIXTURE_ROLLBACK' });
  }), { code: 'FIXTURE_ROLLBACK' });
});

pgTest('attempt outcomes clear nonterminal completion, merge metadata and preserve known costs including zero', async () => {
  const row = await fixture();
  const attempt = await createAttempt(row, 1);
  for (const status of ['submitted', 'processing']) {
    await db.execute('UPDATE ai_studio.generation_attempts SET completed_at=$2 WHERE id=$1', [attempt.id, dueAt]);
    await attempts.updateGenerationAttemptOutcome(attempt.id, { status, metadata: { [status]: true, overwritten: status } });
    const current = await readAttempt(attempt.id);
    assert.equal(current.status, status);
    assert.equal(current.completed_at, null);
  }
  assert.deepEqual((await readAttempt(attempt.id)).metadata_json, { submitted: true, processing: true, overwritten: 'processing' });
  for (const actualCostUsd of [1.25, 0]) {
    await attempts.updateGenerationAttemptOutcome(attempt.id, { status: 'processing', actualCostUsd, costSource: 'provider_reported' });
    for (const unknown of [null, undefined]) {
      await attempts.updateGenerationAttemptOutcome(attempt.id, {
        status: 'processing', actualCostUsd: unknown, costSource: 'estimate_only', reconciliationStatus: 'pending_reconciliation',
      });
      const current = await readAttempt(attempt.id);
      assert.equal(Number(current.actual_cost_usd), actualCostUsd);
      assert.equal(current.cost_source, 'provider_reported');
      assert.equal(current.reconciliation_status, 'provider_reported');
      assert.deepEqual(current.metadata_json, { submitted: true, processing: true, overwritten: 'processing' });
    }
  }
  for (const status of ['failed', 'timeout', 'cancelled', 'succeeded']) {
    await attempts.updateGenerationAttemptOutcome(attempt.id, { status });
    assert.ok((await readAttempt(attempt.id)).completed_at instanceof Date);
  }
  const succeeded = await readAttempt(attempt.id);
  for (const status of ['processing', 'submitted']) {
    await attempts.updateGenerationAttemptOutcome(attempt.id, { status, metadata: { stale: true }, errorCode: 'STALE' });
    assert.deepEqual(await readAttempt(attempt.id), succeeded, 'late nonterminal writes cannot downgrade any part of success');
  }
});

pgTest('concurrent attempt metadata patches merge atomically and success cannot be downgraded by processing', async () => {
  const row = await fixture();
  const attempt = await createAttempt(row, 1);
  await Promise.all(Array.from({ length: 12 }, (_, i) => attempts.updateGenerationAttemptOutcome(attempt.id, {
    status: 'processing', metadata: { [`patch_${i}`]: i },
  })));
  assert.deepEqual((await readAttempt(attempt.id)).metadata_json, Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`patch_${i}`, i])));
  await Promise.all([
    attempts.updateGenerationAttemptOutcome(attempt.id, { status: 'succeeded', actualCostUsd: 0.5, costSource: 'provider_reported', metadata: { success: true } }),
    ...Array.from({ length: 12 }, () => attempts.updateGenerationAttemptOutcome(attempt.id, { status: 'processing' })),
  ]);
  const current = await readAttempt(attempt.id);
  assert.equal(current.status, 'succeeded');
  assert.ok(current.completed_at instanceof Date);
  assert.equal(Number(current.actual_cost_usd), 0.5);
  assert.equal(current.metadata_json.success, true);
});

for (const reconciliationStatus of ['invoice_matched', 'disputed', 'not_billable']) {
  pgTest(`automatic attempt updates preserve manual ${reconciliationStatus} and its amount/source`, async () => {
    const row = await fixture();
    for (const [i, actualCostUsd] of [null, 0, 0.25].entries()) {
      const attempt = await createAttempt(row, i + 1);
      await attempts.updateGenerationAttemptOutcome(attempt.id, {
        status: 'processing', reconciliationStatus, actualCostUsd, costSource: 'invoice', metadata: { manual: true },
      });
      for (const lateCost of [null, 99]) {
        for (const automaticStatus of [null, 'pending_reconciliation', 'provider_reported']) {
          await attempts.updateGenerationAttemptOutcome(attempt.id, {
            status: 'succeeded', actualCostUsd: lateCost, costSource: 'provider_reported', reconciliationStatus: automaticStatus,
          });
          const current = await readAttempt(attempt.id);
          assert.equal(current.reconciliation_status, reconciliationStatus);
          assert.equal(current.actual_cost_usd === null ? null : Number(current.actual_cost_usd), actualCostUsd);
          assert.equal(current.cost_source, 'invoice');
          assert.deepEqual(current.metadata_json, { manual: true });
        }
      }
    }
  });
}
