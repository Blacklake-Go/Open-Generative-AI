import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';

const testUrl = process.env.TEST_DATABASE_URL;
const previousEnv = new Map(['NODE_ENV', 'STORAGE_SECRETS_ENCRYPTION_KEY', 'DATABASE_URL']
  .map((key) => [key, process.env[key]]));
if (testUrl) {
  const parsed = requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL);
  assert.match(parsed.pathname, /^\/p7_test_it_[a-f0-9]{12}$/);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '5432');
  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = 'test';
  process.env.STORAGE_SECRETS_ENCRYPTION_KEY = 'generation-recovery-isolated-test-key';
}
const db = testUrl ? await import('../../lib/db/index.js') : null;
const credits = testUrl ? await import('../../lib/financial/creditService.js') : null;
const creations = testUrl ? await import('../../lib/repositories/creations.js') : null;
const attempts = testUrl ? await import('../../lib/repositories/attempts.js') : null;
const checkpoints = testUrl ? await import('../../lib/repositories/generationResults.js') : null;
const costs = testUrl ? await import('../../lib/repositories/costRecords.js') : null;
const circuits = testUrl ? await import('../../lib/services/circuitBreaker.js') : null;
const core = testUrl ? await import('../../lib/services/generationCore.js') : null;
const worker = testUrl ? await import('../../lib/services/taskWorker.js') : null;
const options = { skip: !testUrl, timeout: 30_000, concurrency: false };
const fixtures = [];
const BALANCE = 100;
const AMOUNT = 10;
const COST = 0.375;
const ESTIMATE = 0.5;
const TEXT = 'Private synchronous result: recover without another paid submission.';
const MEDIA_URL = 'https://generation-recovery.invalid/output.mp4?signature=private-fixture';
let unexpectedNetworkCalls = 0;

// Fail closed if an evolving core accidentally ignores an injected provider/storage
// dependency. PostgreSQL remains real; no fetch/HTTP request may leave this suite.
test.before(() => {
  if (!testUrl) return;
  const denyNetwork = () => {
    unexpectedNetworkCalls++;
    throw Object.assign(new Error('Unexpected real provider/storage HTTP request'), { code: 'TEST_NETWORK_FORBIDDEN' });
  };
  mock.method(globalThis, 'fetch', denyNetwork);
  for (const transport of [http, https]) {
    mock.method(transport, 'request', denyNetwork);
    mock.method(transport, 'get', denyNetwork);
  }
});
test.afterEach(async () => {
  const networkCalls = unexpectedNetworkCalls;
  unexpectedNetworkCalls = 0;
  for (const f of fixtures.splice(0)) {
    await db.execute('DELETE FROM ops_bill.admin_audit_logs WHERE target_id=$1', [f.creationId]);
    await db.execute('DELETE FROM ops_bill.provider_call_logs WHERE provider=$1', [f.providerId]);
    await db.execute('DELETE FROM ai_studio.creations WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM ops_bill.credit_returned_lots WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [f.userId]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [f.userId]);
  }
  assert.equal(networkCalls, 0, 'provider and storage must remain fully isolated');
});
test.after(async () => {
  mock.restoreAll();
  if (db) await db.closePgPool();
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function fixture({ accepted = false, receipt = undefined, media = false } = {}) {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const userId = await allocateUserId({
    reserve: auth.reserveUserId,
    findFirstAvailable: auth.findFirstAvailableUserId,
    isExhausted: auth.isUserIdPoolExhausted,
  });
  const f = {
    userId, providerId: db.randomId('recovery_provider'), modelId: 'recovery_fixture_model',
    receipt: receipt === undefined ? db.randomId('recovery_receipt') : receipt,
    studioId: media ? 'video' : 'text', creationId: null, reservationId: null,
  };
  fixtures.push(f);
  await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status)
    VALUES($1,$2,'user',0,'active')`, [userId, `${userId}@generation-recovery.test`]);
  await credits.grantPerpetualCredits(userId, BALANCE, 'isolated recovery fixture', userId, `seed_${f.providerId}`);
  const reserved = await credits.reserveCredits({
    userId, amount: AMOUNT, modelId: f.modelId, studioId: f.studioId,
    idempotencyKey: `reserve_${f.providerId}`,
  });
  f.reservationId = reserved.reservationId;
  await db.withTransaction(async (tx) => {
    const creation = await creations.createGenerationTask({
      userId, studioId: f.studioId, modelId: f.modelId, provider: f.providerId,
      creditCost: AMOUNT, reservationId: f.reservationId, estimatedCostUsd: ESTIMATE,
      idempotencyKey: `creation_${f.providerId}`,
      inputSummary: { prompt: 'isolated recovery fixture', modelType: media ? 'video' : 'text', parameters: {} },
      transaction: tx,
    });
    f.creationId = creation.id;
    assert.equal(await creations.linkReservationToCreation(f.reservationId, f.creationId, tx), 1);
    if (accepted) {
      await creations.claimQueuedGeneration(f.creationId, tx);
      await creations.updateGenerationOutcome(f.creationId, {
        status: 'processing', providerRequestId: f.receipt,
        nextPollAt: f.receipt ? new Date(0) : null, expectedStatus: 'processing', transaction: tx,
      });
      const attempt = await attempts.createGenerationAttempt({
        creationId: f.creationId, attemptNumber: 1, providerId: f.providerId,
        providerModelId: f.modelId, providerRequestId: f.receipt, status: 'processing',
        estimatedCostUsd: ESTIMATE, costCurrency: 'USD', costSource: 'quote_estimate', transaction: tx,
      });
      f.attemptId = attempt.id;
      await costs.insertProviderCostRecord({
        jobId: f.creationId, attemptId: f.attemptId, providerId: f.providerId, modelId: f.modelId,
        estimatedCostUsd: ESTIMATE, costSource: 'estimate_only', transaction: tx,
      });
    }
  });
  await assertMoney(f, 'RESERVED');
  return f;
}

const readCreation = (f) => creations.findCreationById(f.creationId);
const readCosts = (f) => db.queryMany('SELECT * FROM ai_studio.provider_cost_records WHERE job_id=$1 ORDER BY id', [f.creationId]);
const readEvents = (f) => db.queryMany('SELECT * FROM ai_studio.generation_events WHERE creation_id=$1 ORDER BY id', [f.creationId]);
const readJournal = (f) => db.queryMany(`SELECT action_type,delta FROM ops_bill.credit_ledger_v2
  WHERE reference_id=$1 ORDER BY action_type`, [f.reservationId]);
const terminalEvents = (events) => events.filter((row) => ['succeeded', 'failed', 'cancelled'].includes(row.to_status));

async function assertMoney(f, status) {
  const reservation = await db.queryOne('SELECT * FROM ops_bill.credit_reservations WHERE id=$1', [f.reservationId]);
  assert.equal(reservation.status, status);
  assert.equal(reservation.creation_id, f.creationId);
  assert.equal(Number(reservation.reserved_amount), AMOUNT);
  assert.equal(Number(reservation.settled_amount), status === 'COMMITTED' ? AMOUNT : 0);
  assert.equal(Number(reservation.released_amount), status === 'VOIDED' ? AMOUNT : 0);
  assert.equal(Number(reservation.expired_amount), 0);
  const available = status === 'VOIDED' ? BALANCE : BALANCE - AMOUNT;
  const wallet = await credits.getCreditWallet(f.userId);
  assert.equal(wallet.totalAvailable, available);
  assert.equal(wallet.perpetualCredits, available);
  assert.equal(wallet.frozenCredits, status === 'RESERVED' ? AMOUNT : 0);
  assert.equal(Number((await db.queryOne('SELECT credits FROM auth_usr.users WHERE id=$1', [f.userId])).credits), available);
  const expected = [{ action_type: 'TASK_RESERVE', delta: -AMOUNT }];
  if (status === 'COMMITTED') expected.unshift({ action_type: 'TASK_COMMIT', delta: 0 });
  if (status === 'VOIDED') expected.unshift({ action_type: 'TASK_RELEASE', delta: AMOUNT });
  assert.deepEqual(await readJournal(f), expected, 'exact ledger rows prove one settlement/release, not merely a correct net balance');
}

async function assertPending(f, { scheduled = true } = {}) {
  const creation = await readCreation(f);
  assert.equal(creation.status, 'processing');
  assert.equal(creation.provider_request_id, f.receipt);
  assert.equal(creation.completed_at, null);
  assert.equal(creation.poll_locked_until, null, 'retry must release its own lease');
  if (scheduled) assert.ok(creation.next_poll_at instanceof Date, 'local failure must schedule durable recovery');
  assert.equal(terminalEvents(await readEvents(f)).length, 0, 'rolled-back terminal events must not leak');
  await assertMoney(f, 'RESERVED');
  return creation;
}

async function assertOneCost(f, { charged = AMOUNT, actual = COST, status = 'succeeded' } = {}) {
  const rows = await attempts.listAttemptsByCreationId(f.creationId);
  assert.equal(rows.length, 1, 'recovery must not create a second paid attempt');
  assert.equal(rows[0].provider_id, f.providerId);
  assert.equal(rows[0].provider_request_id, f.receipt);
  if (status) assert.equal(rows[0].status, status);
  assert.equal(rows[0].actual_cost_usd === null ? null : Number(rows[0].actual_cost_usd), actual);
  const records = await readCosts(f);
  assert.equal(records.length, 1, 'acceptance and finalization must upsert the same attempt cost');
  assert.equal(records[0].attempt_id, rows[0].id);
  assert.equal(Number(records[0].credits_charged), charged);
  assert.equal(records[0].actual_cost_usd === null ? null : Number(records[0].actual_cost_usd), actual);
  assert.equal(Number(records[0].estimated_cost_usd), ESTIMATE);
  return records[0];
}

async function assertSucceeded(f, { text = TEXT, objectKey = null } = {}) {
  const creation = await readCreation(f);
  assert.equal(creation.status, 'succeeded');
  assert.equal(creation.provider_request_id, f.receipt);
  assert.equal(creation.result_text, text);
  assert.equal(creation.result_object_key, objectKey);
  assert.equal(creation.result_url, null, 'signed upstream URLs must not become public creation data');
  assert.equal(creation.poll_locked_until, null);
  assert.equal(creation.next_poll_at, null);
  assert.ok(creation.completed_at instanceof Date);
  await assertMoney(f, 'COMMITTED');
  await assertOneCost(f);
  assert.equal(terminalEvents(await readEvents(f)).length, 1, 'only one terminal event may commit');
}

async function makeDue(f) {
  // Move only scheduling time, never clear a live lease to make a broken test pass.
  assert.equal(await db.execute(`UPDATE ai_studio.creations SET next_poll_at=now()-interval '1 second'
    WHERE id=$1 AND status='processing' AND poll_locked_until IS NULL`, [f.creationId]), 1);
}

function harness(f, { generate = null, getTask = null, failCommitOnce = false } = {}) {
  const calls = { generate: 0, createTask: 0, getTask: [], archive: [], commit: 0, pgFaults: [] };
  const stored = {
    objectKey: `private/${f.userId}/${f.creationId}/original.mp4`, bucket: 'fixture-bucket', region: 'fixture-region',
    provider: 'cos', mimeType: 'video/mp4', sizeBytes: 128, checksum: 'fixture-sha256',
    previewObjectKey: `private/${f.userId}/${f.creationId}/preview.mp4`,
    thumbnailObjectKey: `private/${f.userId}/${f.creationId}/thumbnail.webp`, attempts: 1,
  };
  let faultPending = failCommitOnce;
  const adapter = {
    async createTask() { calls.createTask++; assert.fail('recovery must never redispatch createTask'); },
    async getTask(receipt, input) {
      calls.getTask.push(receipt);
      assert.equal(receipt, f.receipt, 'poll must use the original persisted receipt');
      return getTask ? getTask(receipt, input, calls.getTask.length)
        : { status: 'succeeded', resultText: TEXT, actualCostUsd: COST };
    },
    normalizeError: (error) => error,
  };
  const dependencies = {
    syncAsset: false, // Account/state/checkpoint integration only; never contact storage.
    async getProviderAdapter(providerId) { assert.equal(providerId, f.providerId); return adapter; },
    async archiveGenerationResult(input) {
      calls.archive.push(input);
      assert.equal(input.resultUrl, MEDIA_URL);
      assert.equal(input.creation.id, f.creationId);
      const checkpoint = await checkpoints.getGenerationResult(f.creationId);
      assert.equal(checkpoint?.stage, 'provider_succeeded', 'success evidence must be durable before archival');
      return { ...stored };
    },
    async commitCredits(input) {
      calls.commit++;
      assert.ok(input.transaction, 'terminal update and credit commit must share the real transaction');
      const result = await credits.commitCredits(input);
      if (faultPending) {
        faultPending = false;
        // Real settlement has already changed the wallet and appended TASK_COMMIT.
        // A genuine PG error now aborts the whole terminal transaction, not just a mock.
        const inside = await input.transaction.queryOne('SELECT status FROM ops_bill.credit_reservations WHERE id=$1', [f.reservationId]);
        assert.equal(inside.status, 'COMMITTED');
        const terminal = await input.transaction.queryOne('SELECT status FROM ai_studio.creations WHERE id=$1', [f.creationId]);
        assert.equal(terminal.status, 'succeeded');
        try { await input.transaction.queryOne('SELECT 1 / 0 AS injected_recovery_commit_failure'); }
        catch (error) { calls.pgFaults.push(error.code); throw error; }
        assert.fail('PostgreSQL must reject division by zero');
      }
      return result;
    },
    // Explicitly inject REAL implementations for the new recovery dependency seam.
    getGenerationResult: checkpoints.getGenerationResult,
    getGenerationAttemptForReceipt: attempts.getGenerationAttemptForReceipt,
    saveGenerationResult: checkpoints.saveGenerationResult,
    markGenerationResultArchived: checkpoints.markGenerationResultArchived,
    updateGenerationAttemptOutcome: attempts.updateGenerationAttemptOutcome,
    recordProviderSuccess: circuits.recordProviderSuccess,
    recordProviderFailure: circuits.recordProviderFailure,
  };
  const providerClient = {
    async generate(input) {
      calls.generate++;
      return generate ? generate(input, calls.generate) : { providerRequestId: f.receipt };
    },
  };
  return {
    calls, stored, dependencies,
    process: () => core.processGenerationTask({ creationId: f.creationId, providerClient, testDependencies: dependencies }),
    poll: () => core.pollGenerationTask({ creationId: f.creationId, testDependencies: dependencies }),
    callback: (overrides = {}) => core.handleGenerationCallback({
      creationId: f.creationId, status: 'succeeded', providerRequestId: f.receipt,
      resultUrl: MEDIA_URL, actualCostUsd: COST,
      callbackIdempotencyKey: `callback_${f.creationId}`, testDependencies: dependencies, ...overrides,
    }),
  };
}

async function saveTextCheckpoint(f) {
  await checkpoints.saveGenerationResult({
    creationId: f.creationId, attemptId: f.attemptId, providerId: f.providerId,
    providerRequestId: f.receipt, resultText: TEXT, actualCostUsd: COST,
  });
  await attempts.updateGenerationAttemptOutcome(f.attemptId, {
    status: 'succeeded', providerRequestId: f.receipt, actualCostUsd: COST, costSource: 'provider_reported',
  });
  await costs.insertProviderCostRecord({
    jobId: f.creationId, attemptId: f.attemptId, providerId: f.providerId, modelId: f.modelId,
    estimatedCostUsd: ESTIMATE, actualCostUsd: COST, costSource: 'provider_reported',
  });
}

async function snapshot(f) {
  return {
    creation: await readCreation(f),
    reservation: await db.queryOne('SELECT * FROM ops_bill.credit_reservations WHERE id=$1', [f.reservationId]),
    wallet: await db.queryOne('SELECT * FROM ops_bill.credit_wallets WHERE user_id=$1', [f.userId]),
    journal: await readJournal(f), attempts: await attempts.listAttemptsByCreationId(f.creationId),
    costs: await readCosts(f), events: await readEvents(f),
    checkpoint: await checkpoints.getGenerationResult(f.creationId),
  };
}

function barrier() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function reached(gate, running) {
  await Promise.race([gate.promise, running.then(() => assert.fail('poll finished before reaching its provider barrier'))]);
}

test('sync text without receipt: PG commit failure preserves checkpoint and process recovery generates only once', options, async () => {
  const f = await fixture({ receipt: null });
  const h = harness(f, { generate: async () => ({ output: TEXT, actualCostUsd: COST }), failCommitOnce: true });
  await h.process();
  assert.deepEqual(h.calls.pgFaults, ['22012'], 'must reach the actual terminal PG fault');
  await assertPending(f);
  const saved = await checkpoints.getGenerationResult(f.creationId);
  assert.equal(saved?.stage, 'provider_succeeded');
  assert.equal(saved.resultText, TEXT);
  assert.equal(saved.providerRequestId, null);
  await assertOneCost(f, { charged: 0 });
  await makeDue(f);
  assert.ok((await creations.listDuePollingCreations()).some((row) => row.id === f.creationId));
  await h.process();
  await h.poll();
  await assertSucceeded(f);
  assert.deepEqual(await checkpoints.getGenerationResult(f.creationId), saved);
  assert.equal(h.calls.generate, 1);
  assert.equal(h.calls.createTask, 0);
  assert.equal(h.calls.getTask.length, 0);
  assert.equal(h.calls.archive.length, 0);
  assert.equal(h.calls.commit, 2, 'one rolled-back real commit followed by one successful real commit');
});

test('media: archived object key survives PG terminal rollback and recovery neither downloads nor polls again', options, async () => {
  const f = await fixture({ media: true });
  const h = harness(f, {
    generate: async () => ({ providerRequestId: f.receipt, resultUrl: MEDIA_URL, actualCostUsd: COST }),
    failCommitOnce: true,
  });
  await h.process();
  assert.deepEqual(h.calls.pgFaults, ['22012']);
  await assertPending(f);
  const saved = await checkpoints.getGenerationResult(f.creationId);
  assert.equal(saved?.stage, 'archived');
  assert.deepEqual(saved.storedResult, h.stored);
  assert.equal(saved.resultUrl, null);
  assert.equal((await readCreation(f)).result_object_key, null, 'terminal object linkage rolled back');
  await assertOneCost(f, { charged: 0 });
  await makeDue(f);
  await h.poll();
  await h.process();
  await assertSucceeded(f, { text: null, objectKey: h.stored.objectKey });
  assert.deepEqual(await checkpoints.getGenerationResult(f.creationId), saved);
  assert.equal(h.calls.generate, 1);
  assert.equal(h.calls.createTask, 0);
  assert.equal(h.calls.getTask.length, 0);
  assert.equal(h.calls.archive.length, 1);
  assert.equal(h.calls.commit, 2);
});

test('accepted receipt: first getTask transient keeps funds frozen and next poll recovers that same attempt', options, async () => {
  const f = await fixture();
  const h = harness(f, { getTask: async (_receipt, _input, call) => {
    if (call === 1) throw Object.assign(new Error('fixture transient status lookup'), { code: 'NETWORK_ERROR', isRetryable: true });
    return { status: 'succeeded', resultText: TEXT, actualCostUsd: COST };
  } });
  await h.process();
  assert.deepEqual(h.calls.getTask, [f.receipt]);
  await assertPending(f);
  assert.equal(await checkpoints.getGenerationResult(f.creationId), null);
  await assertOneCost(f, { charged: 0, actual: null, status: 'processing' });
  await makeDue(f);
  await h.process();
  await assertSucceeded(f);
  assert.deepEqual(h.calls.getTask, [f.receipt, f.receipt]);
  assert.equal(h.calls.generate, 1);
  assert.equal(h.calls.createTask, 0);
  assert.equal(h.calls.commit, 1);
});

for (const status of ['failed', 'cancelled']) {
  test(`explicit ${status}: repeated polls and callbacks release the real reservation exactly once`, options, async () => {
    const f = await fixture({ accepted: true });
    const h = harness(f, { getTask: async () => ({ status, error: 'explicit upstream terminal evidence', actualCostUsd: COST }) });
    await h.poll();
    await h.poll();
    await h.callback({ status, resultUrl: null });
    await h.callback({ status, resultUrl: null, callbackIdempotencyKey: `late_${f.creationId}` });
    assert.equal((await readCreation(f)).status, status);
    await assertMoney(f, 'VOIDED');
    await assertOneCost(f, { charged: 0, status });
    assert.equal(terminalEvents(await readEvents(f)).length, 1);
    assert.equal(await checkpoints.getGenerationResult(f.creationId), null);
    assert.equal(h.calls.getTask.length, 1);
    assert.equal(h.calls.commit, 0);
    assert.equal(h.calls.archive.length, 0);
  });
}

test('duplicate/concurrent and late callbacks keep one real commit and one attempt cost', options, async () => {
  const f = await fixture({ accepted: true, media: true });
  const h = harness(f);
  await Promise.all([h.callback(), h.callback()]);
  await assertSucceeded(f, { text: null, objectKey: h.stored.objectKey });
  const completed = await snapshot(f);
  for (const status of ['succeeded', 'failed', 'cancelled']) {
    await h.callback({ status, actualCostUsd: null, callbackIdempotencyKey: `late_${status}_${f.creationId}` });
  }
  await h.poll();
  assert.deepEqual(await snapshot(f), completed, 'late callbacks cannot alter terminal evidence or null out known cost');
  assert.equal(h.calls.commit, 1);
  assert.equal(h.calls.archive.length, 1);
  assert.equal(h.calls.getTask.length, 0);
  assert.equal(h.calls.createTask, 0);
});

test('wrong-receipt success/failure/cancellation callbacks leave creation, checkpoint and all accounting unchanged', options, async () => {
  const f = await fixture({ accepted: true });
  const h = harness(f);
  const before = await snapshot(f);
  for (const status of ['succeeded', 'failed', 'cancelled']) {
    try { await h.callback({ status, providerRequestId: 'another-paid-task-receipt' }); }
    catch (error) { assert.match(String(error.code), /RECEIPT|IDENTITY/, 'only identity rejection is expected'); }
    assert.deepEqual(await snapshot(f), before, `${status} callback for another receipt must be a total no-op`);
  }
  assert.equal(h.calls.commit, 0);
  assert.equal(h.calls.archive.length, 0);
  assert.equal(h.calls.getTask.length, 0);
});

test('a durable success checkpoint outranks a late failed callback: recover and commit, never refund', options, async () => {
  const f = await fixture({ accepted: true });
  await saveTextCheckpoint(f);
  const saved = await checkpoints.getGenerationResult(f.creationId);
  const h = harness(f);
  await h.callback({ status: 'failed', resultUrl: null, actualCostUsd: null });
  await h.poll();
  await assertSucceeded(f);
  assert.deepEqual(await checkpoints.getGenerationResult(f.creationId), saved);
  assert.equal(h.calls.commit, 1);
  assert.equal(h.calls.getTask.length, 0);
  assert.equal(h.calls.archive.length, 0);
});

for (const staleStatus of ['failed', 'succeeded']) {
  test(`expired poll lease: old ${staleStatus} response cannot release, finalize, or unlock the new worker`, options, async () => {
    const f = await fixture({ accepted: true });
    const oldEntered = barrier();
    const newEntered = barrier();
    const oldReply = barrier();
    const newReply = barrier();
    const h = harness(f, { getTask: async (_receipt, _input, call) => {
      if (call === 1) { oldEntered.resolve(); return oldReply.promise; }
      if (call === 2) { newEntered.resolve(); return newReply.promise; }
      assert.fail('only the two controlled workers may poll');
    } });
    const running = [];
    const start = () => {
      const promise = h.poll();
      promise.catch(() => {});
      running.push(promise);
      return promise;
    };
    try {
      const started = Date.now();
      const oldPoll = start();
      await reached(oldEntered, oldPoll);
      const oldClaim = await readCreation(f);
      assert.ok(oldClaim.poll_locked_until.getTime() >= started + 30_000);
      assert.ok(oldClaim.poll_locked_until.getTime() <= Date.now() + 30_000);
      assert.equal((await h.poll()).skipped, true, 'a live lease excludes a second poll');
      assert.equal(h.calls.getTask.length, 1);
      await db.execute(`UPDATE ai_studio.creations SET poll_locked_until=now()-interval '1 second' WHERE id=$1`, [f.creationId]);
      const newPoll = start();
      await reached(newEntered, newPoll);
      const newClaim = await readCreation(f);
      assert.notDeepEqual(newClaim.poll_locked_until, oldClaim.poll_locked_until);
      const beforeStaleReply = await snapshot(f);
      oldReply.resolve(staleStatus === 'failed'
        ? { status: 'failed', error: 'obsolete worker failure', actualCostUsd: COST }
        : { status: 'succeeded', resultText: 'obsolete worker success', actualCostUsd: COST });
      await oldPoll;
      assert.deepEqual(await snapshot(f), beforeStaleReply, 'stale lease must fence ALL state/ledger/cost/checkpoint writes');
      await assertMoney(f, 'RESERVED');
      assert.equal(h.calls.commit, 0);
      newReply.resolve({ status: 'succeeded', resultText: TEXT, actualCostUsd: COST });
      await newPoll;
      await assertSucceeded(f);
      assert.equal(h.calls.commit, 1);
      assert.equal(h.calls.createTask, 0);
    } finally {
      oldReply.resolve({ status: 'processing' });
      newReply.resolve({ status: 'processing' });
      await Promise.allSettled(running);
    }
  });
}

for (const source of ['receipt', 'receiptless checkpoint']) {
  test(`fresh worker recovers processing from ${source} using real queue scans without dispatching again`, options, async () => {
    const f = await fixture({ accepted: true, ...(source === 'receiptless checkpoint' ? { receipt: null } : {}) });
    if (source === 'receiptless checkpoint') await saveTextCheckpoint(f);
    await makeDue(f);
    // A fresh dependency object has no knowledge of the original submission/result.
    const fresh = harness(f);
    const summary = await worker.runGenerationWorkerOnce({ testDependencies: fresh.dependencies });
    assert.equal(summary.queuedCount, 0);
    assert.deepEqual(summary.processed, []);
    assert.equal(summary.duePollingCount, 1);
    assert.equal(summary.polled.length, 1);
    assert.equal(summary.polled[0].id, f.creationId);
    assert.equal(summary.polled[0].error, undefined);
    await assertSucceeded(f);
    const repeat = await worker.runGenerationWorkerOnce({ testDependencies: fresh.dependencies });
    assert.equal(repeat.queuedCount, 0);
    assert.equal(repeat.duePollingCount, 0);
    assert.equal(fresh.calls.generate, 0);
    assert.equal(fresh.calls.createTask, 0);
    assert.equal(fresh.calls.getTask.length, source === 'receipt' ? 1 : 0);
    assert.equal(fresh.calls.archive.length, 0);
    assert.equal(fresh.calls.commit, 1);
    await assertMoney(f, 'COMMITTED');
  });
}

test('unknown submission outcome without receipt: a retryable network error neither refunds nor generates again', options, async () => {
  const f = await fixture({ receipt: null });
  const h = harness(f, { generate: async () => {
    throw Object.assign(new Error('connection reset after request bytes were sent'), {
      code: 'NETWORK_ERROR', isRetryable: true, retryable: true,
    });
  } });
  await h.process();
  assert.equal(h.calls.generate, 1, 'unknown acceptance is not safe for even an in-process provider retry');
  await assertPending(f, { scheduled: false });
  assert.equal(await checkpoints.getGenerationResult(f.creationId), null);
  await h.process();
  await h.poll();
  const summary = await worker.runGenerationWorkerOnce({ testDependencies: h.dependencies });
  assert.equal(summary.queuedCount, 0);
  assert.equal(summary.duePollingCount, 0);
  assert.equal(h.calls.generate, 1);
  assert.equal(h.calls.createTask, 0);
  assert.equal(h.calls.getTask.length, 0);
  assert.equal(h.calls.archive.length, 0);
  assert.equal(h.calls.commit, 0);
  await assertPending(f, { scheduled: false });
  await assertOneCost(f, { charged: 0, actual: null, status: null });
  const events = await readEvents(f);
  assert.equal(events.filter((row) => row.event_type === 'TASK_RECONCILIATION_REQUIRED').length, 1);
});
