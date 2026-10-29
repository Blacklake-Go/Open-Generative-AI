import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const parsed = requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL);
  // This suite is only for the disposable database created by run-isolated-pg-tests.mjs.
  assert.match(parsed.pathname, /^\/p7_test_it_[a-f0-9]{12}$/);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '5432');
  process.env.DATABASE_URL = testUrl;
}
const db = testUrl ? await import('../../lib/db/index.js') : null;
const credits = testUrl ? await import('../../lib/financial/creditService.js') : null;
const creations = testUrl ? await import('../../lib/repositories/creations.js') : null;
const lockPool = testUrl ? new pg.Pool({
  connectionString: testUrl,
  application_name: 'credit-reservation-lifecycle-locks',
  max: 6,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
  options: '-c search_path=ai_studio,ops_bill,auth_usr,sys_core,public',
}) : null;
const options = { skip: !testUrl, timeout: 30_000 };
const users = [];
const MODEL = 'lifecycle-fixture';
const STUDIO = 'video';
const AMOUNT = 10;
const BALANCE = 100;
const LINK_CONFLICT = { code: 'GENERATION_RESERVATION_LINK_CONFLICT' };

test.after(async () => {
  if (lockPool) await lockPool.end();
  if (db) await db.closePgPool();
});
test.afterEach(async () => {
  for (const id of users.splice(0)) {
    await db.execute('DELETE FROM ai_studio.creations WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM ops_bill.credit_returned_lots WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [id]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [id]);
  }
});

// Same canonical user allocation/bootstrap as credit-release-expiry.test.mjs.
async function userFixture() {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const id = await allocateUserId({
    reserve: auth.reserveUserId,
    findFirstAvailable: auth.findFirstAvailableUserId,
    isExhausted: auth.isUserIdPoolExhausted,
  });
  users.push(id);
  assert.equal(await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status)
    VALUES($1,$2,'user',$3,'active')`, [id, `${id}@reservation-lifecycle.test`, BALANCE]), 1);
  return id;
}

async function fixture() {
  const userId = await userFixture();
  const reserved = await credits.reserveCredits({
    userId, amount: AMOUNT, modelId: MODEL, studioId: STUDIO, idempotencyKey: `lifecycle_${userId}`,
  });
  const f = { userId, reservationId: reserved.reservationId };
  const row = await reservation(f);
  assert.equal(new Date(row.expires_at) - new Date(row.created_at), 15 * 60_000);
  await assertMoney(f, 'RESERVED');
  return f;
}

async function reservation(f) {
  return db.queryOne('SELECT * FROM ops_bill.credit_reservations WHERE id=$1', [f.reservationId]);
}

async function task(f, overrides = {}, transaction = null) {
  const row = await creations.createGenerationTask({
    userId: f.userId, studioId: STUDIO, modelId: MODEL, provider: 'isolated-fixture',
    creditCost: AMOUNT, reservationId: f.reservationId,
    idempotencyKey: db.randomId('lifecycle_task'), inputSummary: { modelType: 'video' },
    ...overrides, transaction,
  });
  assert.ok(row?.id, 'fixture must actually insert a task');
  return row;
}

async function atMinute(f, minutes, creationId = null) {
  // Move persisted timestamps, not the JS/PG clocks; there is no wall-clock wait.
  await db.withTransaction(async (tx) => {
    assert.equal(await tx.execute(`UPDATE ops_bill.credit_reservations
      SET created_at=now()-$2::int*interval '1 minute',
          expires_at=now()-($2::int-15)*interval '1 minute' WHERE id=$1`,
    [f.reservationId, minutes]), 1);
    if (creationId) {
      assert.equal(await tx.execute(`UPDATE ai_studio.creations
        SET created_at=now()-$2::int*interval '1 minute',
            started_at=now()-$2::int*interval '1 minute',
            updated_at=now()-$2::int*interval '1 minute' WHERE id=$1`,
      [creationId, minutes]), 1);
    }
  });
  const row = await reservation(f);
  assert.equal(new Date(row.expires_at) - new Date(row.created_at), 15 * 60_000);
  assert.ok(new Date(row.expires_at).getTime() < Date.now(), 'the reservation really is expired');
}

async function assertMoney(f, status) {
  const row = await reservation(f);
  assert.equal(row.status, status);
  assert.equal(Number(row.reserved_amount), AMOUNT);
  assert.equal(Number(row.settled_amount), status === 'COMMITTED' ? AMOUNT : 0);
  assert.equal(Number(row.released_amount), status === 'VOIDED' ? AMOUNT : 0);
  assert.equal(Number(row.expired_amount), 0);
  const available = status === 'VOIDED' ? BALANCE : BALANCE - AMOUNT;
  const wallet = await credits.getCreditWallet(f.userId);
  assert.equal(wallet.totalAvailable, available);
  assert.equal(wallet.perpetualCredits, available);
  assert.equal(wallet.frozenCredits, status === 'RESERVED' ? AMOUNT : 0);
  assert.equal(Number((await db.queryOne('SELECT credits FROM auth_usr.users WHERE id=$1', [f.userId])).credits), available);
  const journal = await db.queryMany(`SELECT action_type,delta FROM ops_bill.credit_ledger_v2
    WHERE reference_id=$1 ORDER BY action_type`, [f.reservationId]);
  const expected = [{ action_type: 'TASK_RESERVE', delta: -AMOUNT }];
  if (status === 'COMMITTED') expected.unshift({ action_type: 'TASK_COMMIT', delta: 0 });
  if (status === 'VOIDED') expected.unshift({ action_type: 'TASK_RELEASE', delta: AMOUNT });
  assert.deepEqual(journal, expected, 'exact journal rows, not only net balance, prove exactly-once settlement');
}

async function assertScan(f, expectedStatus, result = null) {
  result ??= await credits.cleanupExpiredReservations();
  if (expectedStatus === null) {
    assert.equal(result.checkedCount, 0);
    assert.deepEqual(result.processed, []);
  } else {
    assert.equal(result.checkedCount, 1);
    assert.equal(result.processed.length, 1);
    assert.equal(result.processed[0].id, f.reservationId);
    assert.equal(result.processed[0].status, expectedStatus);
    assert.equal(result.processed[0].res.success, expectedStatus === 'voided');
    if (expectedStatus === 'skipped') assert.equal(result.processed[0].res.skipped, true);
  }
  return result;
}

function releaseCandidate(f, transaction = null) {
  return credits.voidCredits({
    reservationId: f.reservationId, onlyIfUnlinked: true, onlyIfExpired: true, transaction,
  });
}

function barrier() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Manual holders are independent real PG sessions. execute intentionally returns a NUMBER,
// matching lib/db/pg.js rather than pg.QueryResult (link checks affected rows === 1).
async function heldTransaction() {
  const client = await lockPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '8s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'");
  } catch (error) {
    client.release(true);
    throw error;
  }
  let finished = false;
  async function finish(command) {
    if (finished) return;
    finished = true;
    let failed = false;
    try { await client.query(command); }
    catch (error) { failed = true; throw error; }
    finally { client.release(failed); }
  }
  return {
    pid: client.processID,
    query: (sql, params = []) => client.query(sql, params),
    queryOne: async (sql, params = []) => (await client.query(sql, params)).rows[0] || null,
    queryMany: async (sql, params = []) => (await client.query(sql, params)).rows,
    execute: async (sql, params = []) => (await client.query(sql, params)).rowCount,
    commit: () => finish('COMMIT'),
    rollback: () => finish('ROLLBACK'),
  };
}

async function race(work) {
  const holders = [];
  const running = [];
  try {
    return await work({
      hold: async () => {
        const tx = await heldTransaction();
        holders.push(tx);
        return tx;
      },
      start: (promise) => {
        // Install a rejection handler immediately; a competing transaction can fail
        // before the test reaches assert.rejects. Keep the original promise to assert.
        promise.catch(() => {});
        running.push(promise);
        return promise;
      },
    });
  } finally {
    // Release blockers even if an assertion fails, before waiting for blocked work.
    for (const tx of holders) await tx.rollback();
    await Promise.allSettled(running);
  }
}

async function waitForBlock(t, blockerPid, queryFragment, waiterPid = null) {
  const deadline = Date.now() + 3_000;
  let rows = [];
  do {
    // Autocommit observer: each query gets a fresh pg_stat_activity snapshot.
    // Poll the actual lock graph; never use sleep or elapsed time to order races.
    ({ rows } = await lockPool.query(`SELECT pid,query,wait_event_type,pg_blocking_pids(pid) AS blockers
      FROM pg_stat_activity WHERE datname=current_database() AND $1::int=ANY(pg_blocking_pids(pid))
        AND ($2::int IS NULL OR pid=$2)`, [blockerPid, waiterPid]));
    const row = rows.find((candidate) => candidate.wait_event_type === 'Lock'
      && candidate.query.includes(queryFragment));
    if (row) {
      assert.ok(row.blockers.includes(blockerPid));
      t.diagnostic(`PG lock confirmed: ${row.pid} waits for ${blockerPid} (${queryFragment})`);
      return row.pid;
    }
  } while (Date.now() < deadline);
  assert.fail(`Expected PG lock wait on ${blockerPid} for ${queryFragment}; observed ${JSON.stringify(rows)}`);
}

async function lockWallet(tx, f) {
  await tx.queryOne('SELECT user_id FROM ops_bill.credit_wallets WHERE user_id=$1 FOR UPDATE', [f.userId]);
}

for (const state of ['queued', 'processing', 'pending_reconciliation']) {
  test(`minute 16: ${state} task retains expired reservation and all frozen credits`, options, async () => {
    const f = await fixture();
    const job = await task(f);
    assert.equal(await creations.linkReservationToCreation(f.reservationId, job.id), 1);
    if (state !== 'queued') {
      await db.execute(`UPDATE ai_studio.creations SET status='processing',provider_request_id=$2 WHERE id=$1`,
        [job.id, `fixture_receipt_${job.id}`]);
    }
    if (state === 'pending_reconciliation') {
      // Pending reconciliation is a processing task plus evidence events, not a new status.
      for (const eventType of ['TASK_RECONCILIATION_REQUIRED', 'PROVIDER_POLL_PAUSED']) {
        await creations.insertGenerationEvent({
          creationId: job.id, userId: f.userId, reservationId: f.reservationId,
          eventType, fromStatus: 'processing', toStatus: 'processing',
          idempotencyKey: `${job.id}:${eventType}`, metadata: { reason: 'UPSTREAM_OUTCOME_UNCONFIRMED' },
        });
      }
    }
    await atMinute(f, 16, job.id);
    for (let i = 0; i < 2; i++) {
      await assertScan(f, null);
      assert.equal((await releaseCandidate(f)).skipped, true, 'locked candidate path must also preserve linked funds');
    }
    await assertMoney(f, 'RESERVED');
    assert.equal((await reservation(f)).creation_id, job.id);
    const current = await creations.findCreationById(job.id);
    assert.equal(current.status, state === 'queued' ? 'queued' : 'processing');
    const events = await db.queryMany('SELECT event_type FROM ai_studio.generation_events WHERE creation_id=$1 ORDER BY event_type', [job.id]);
    assert.deepEqual(events.map((row) => row.event_type), state === 'pending_reconciliation'
      ? ['PROVIDER_POLL_PAUSED', 'TASK_RECONCILIATION_REQUIRED'] : []);
  });
}

test('minute 25: successful task commits an expired reservation once with TASK_COMMIT delta 0', options, async () => {
  const f = await fixture();
  const job = await task(f);
  await creations.linkReservationToCreation(f.reservationId, job.id);
  await db.execute("UPDATE ai_studio.creations SET status='processing' WHERE id=$1", [job.id]);
  await atMinute(f, 25, job.id);
  await assertScan(f, null);
  const result = await db.withTransaction(async (tx) => {
    const committed = await credits.commitCredits({
      reservationId: f.reservationId, creationId: job.id, expectedUserId: f.userId, transaction: tx,
    });
    // Model successful evidence locally, without importing/calling any Provider or storage service.
    assert.equal(await tx.execute(`UPDATE ai_studio.creations SET status='succeeded',completed_at=now()
      WHERE id=$1 AND status='processing'`, [job.id]), 1);
    return committed;
  });
  assert.equal(result.status, 'COMMITTED');
  for (let i = 0; i < 2; i++) {
    assert.equal((await credits.commitCredits({ reservationId: f.reservationId, creationId: job.id })).alreadyCommitted, true);
    await assertScan(f, null);
    assert.equal((await releaseCandidate(f)).skipped, true);
  }
  await assert.rejects(credits.voidCredits({ reservationId: f.reservationId }), /COMMITTED/);
  await assertMoney(f, 'COMMITTED');
  assert.equal((await creations.findCreationById(job.id)).status, 'succeeded');
  assert.equal((await reservation(f)).creation_id, job.id);
});

test('expired orphan releases exactly once and repeated cleanup/void cannot mint credits', options, async () => {
  const f = await fixture();
  await atMinute(f, 16);
  await assertScan(f, 'voided');
  for (let i = 0; i < 2; i++) {
    await assertScan(f, null);
    assert.equal((await releaseCandidate(f)).skipped, true);
    assert.equal((await credits.voidCredits({ reservationId: f.reservationId })).alreadyVoided, true);
  }
  await assert.rejects(credits.commitCredits({ reservationId: f.reservationId }), /VOIDED/);
  await assertMoney(f, 'VOIDED');
});

test('cleanup rechecks expiry after its scan and skips a reservation extended by another locked transaction', options, async (t) => {
  const f = await fixture();
  await atMinute(f, 16);
  await race(async ({ hold, start }) => {
    const updater = await hold();
    await updater.queryOne('SELECT id FROM ops_bill.credit_reservations WHERE id=$1 FOR UPDATE', [f.reservationId]);
    const cleanup = start(credits.cleanupExpiredReservations());
    // This SELECT FOR UPDATE only runs after the real cleanup scan found the expired row.
    await waitForBlock(t, updater.pid, 'credit_reservations WHERE id = $1 FOR UPDATE');
    assert.equal(await updater.execute(`UPDATE ops_bill.credit_reservations
      SET expires_at=now()+interval '1 hour' WHERE id=$1`, [f.reservationId]), 1);
    await updater.commit();
    await assertScan(f, 'skipped', await cleanup);
  });
  assert.ok(new Date((await reservation(f)).expires_at).getTime() > Date.now());
  await assertScan(f, null);
  await assertMoney(f, 'RESERVED');
});

test('cleanup locks first: competing task link fails and its entire creation transaction rolls back', options, async (t) => {
  const f = await fixture();
  await atMinute(f, 16);
  let job;
  await race(async ({ hold, start }) => {
    const wallet = await hold();
    await lockWallet(wallet, f);
    const cleanup = start(credits.cleanupExpiredReservations());
    const cleanerPid = await waitForBlock(t, wallet.pid, 'credit_wallets WHERE user_id = $1 FOR UPDATE');
    const inserting = barrier();
    const admission = start(db.withTransaction(async (tx) => {
      const { pid } = await tx.queryOne('SELECT pg_backend_pid() AS pid');
      job = await task(f, {}, tx);
      inserting.resolve(pid);
      await creations.linkReservationToCreation(f.reservationId, job.id, tx);
      return job;
    }));
    const admissionPid = await Promise.race([inserting.promise, admission.then(() => assert.fail('admission finished before its barrier'))]);
    await waitForBlock(t, cleanerPid, 'UPDATE credit_reservations r', admissionPid);
    await wallet.commit();
    await assertScan(f, 'voided', await cleanup);
    await assert.rejects(admission, LINK_CONFLICT);
  });
  assert.equal(await creations.findCreationById(job.id), null, 'failed link must roll back the inserted queued task');
  assert.equal((await reservation(f)).creation_id, null);
  await assertScan(f, null);
  await assertMoney(f, 'VOIDED');
});

test('link locks first: cleanup scanned the old orphan but skips after the creation transaction commits', options, async (t) => {
  const f = await fixture();
  await atMinute(f, 16);
  let job;
  await race(async ({ hold, start }) => {
    const admission = await hold();
    job = await task(f, {}, admission);
    assert.equal(await creations.linkReservationToCreation(f.reservationId, job.id, admission), 1);
    const cleanup = start(credits.cleanupExpiredReservations());
    await waitForBlock(t, admission.pid, 'credit_reservations WHERE id = $1 FOR UPDATE');
    await admission.commit();
    await assertScan(f, 'skipped', await cleanup);
  });
  assert.equal((await creations.findCreationById(job.id)).status, 'queued');
  assert.equal((await reservation(f)).creation_id, job.id);
  assert.equal(await creations.linkReservationToCreation(f.reservationId, job.id), 1, 'same-job linking is idempotent');
  await assertScan(f, null);
  await assertMoney(f, 'RESERVED');
});

test('cleanup locks first: concurrent commit cannot settle already released funds', options, async (t) => {
  const f = await fixture();
  await atMinute(f, 16);
  await race(async ({ hold, start }) => {
    const wallet = await hold();
    await lockWallet(wallet, f);
    const cleanup = start(credits.cleanupExpiredReservations());
    const cleanerPid = await waitForBlock(t, wallet.pid, 'credit_wallets WHERE user_id = $1 FOR UPDATE');
    const commit = start(credits.commitCredits({ reservationId: f.reservationId }));
    await waitForBlock(t, cleanerPid, 'credit_reservations WHERE id = $1 FOR UPDATE');
    await wallet.commit();
    await assertScan(f, 'voided', await cleanup);
    await assert.rejects(commit, /VOIDED/);
  });
  await assertScan(f, null);
  await assertMoney(f, 'VOIDED');
});

test('commit locks first: scanned cleanup skips COMMITTED and duplicate commit remains a no-op', options, async (t) => {
  const f = await fixture();
  await atMinute(f, 25);
  await race(async ({ hold, start }) => {
    const settlement = await hold();
    assert.equal((await credits.commitCredits({ reservationId: f.reservationId, transaction: settlement })).status, 'COMMITTED');
    const cleanup = start(credits.cleanupExpiredReservations());
    await waitForBlock(t, settlement.pid, 'credit_reservations WHERE id = $1 FOR UPDATE');
    await settlement.commit();
    await assertScan(f, 'skipped', await cleanup);
  });
  assert.equal((await credits.commitCredits({ reservationId: f.reservationId })).alreadyCommitted, true);
  await assertScan(f, null);
  await assertMoney(f, 'COMMITTED');
});

test('two cleanup transactions contend on the same expired orphan and append only one release', options, async (t) => {
  const f = await fixture();
  await atMinute(f, 16);
  await race(async ({ hold, start }) => {
    const wallet = await hold();
    await lockWallet(wallet, f);
    const first = start(credits.cleanupExpiredReservations());
    const firstPid = await waitForBlock(t, wallet.pid, 'credit_wallets WHERE user_id = $1 FOR UPDATE');
    const second = start(credits.cleanupExpiredReservations());
    await waitForBlock(t, firstPid, 'credit_reservations WHERE id = $1 FOR UPDATE');
    await wallet.commit();
    await assertScan(f, 'voided', await first);
    await assertScan(f, 'skipped', await second);
  });
  assert.equal((await credits.voidCredits({ reservationId: f.reservationId })).alreadyVoided, true);
  await assertScan(f, null);
  await assertMoney(f, 'VOIDED');
});

test('two success callbacks contend on an expired reservation and append only one zero-delta commit', options, async (t) => {
  const f = await fixture();
  await atMinute(f, 25);
  await race(async ({ hold, start }) => {
    const first = await hold();
    assert.equal((await credits.commitCredits({ reservationId: f.reservationId, transaction: first })).status, 'COMMITTED');
    const second = start(credits.commitCredits({ reservationId: f.reservationId }));
    await waitForBlock(t, first.pid, 'credit_reservations WHERE id = $1 FOR UPDATE');
    await first.commit();
    assert.equal((await second).alreadyCommitted, true);
  });
  await assertMoney(f, 'COMMITTED');
});

for (const direction of ['creation_id only', 'reverse reservation_id only']) {
  test(`cleanup respects ${direction} without requiring the other association`, options, async () => {
    const f = await fixture();
    await atMinute(f, 16);
    if (direction === 'creation_id only') {
      await db.execute('UPDATE ops_bill.credit_reservations SET creation_id=$2 WHERE id=$1', [f.reservationId, 'missing-but-linked-creation']);
    } else {
      await task(f);
      assert.equal((await reservation(f)).creation_id, null);
    }
    await assertScan(f, null);
    assert.equal((await releaseCandidate(f)).skipped, true);
    await assertMoney(f, 'RESERVED');
  });
}

for (const expiry of ['infinity', '-infinity']) {
  test(`cleanup refuses non-finite PostgreSQL expires_at=${expiry}`, options, async () => {
    const f = await fixture();
    // TIMESTAMPTZ NOT NULL rejects null/invalid strings, but PG does accept infinities.
    await db.execute('UPDATE ops_bill.credit_reservations SET expires_at=$2::timestamptz WHERE id=$1', [f.reservationId, expiry]);
    await assertScan(f, expiry === '-infinity' ? 'skipped' : null);
    assert.equal((await releaseCandidate(f)).skipped, true);
    await assertMoney(f, 'RESERVED');
  });
}

for (const mismatch of ['user', 'model', 'studio', 'amount', 'reservation']) {
  test(`link rejects ${mismatch} mismatch and rolls back the candidate task`, options, async () => {
    const f = await fixture();
    const overrides = {};
    if (mismatch === 'user') overrides.userId = await userFixture();
    if (mismatch === 'model') overrides.modelId = `${MODEL}-other`;
    if (mismatch === 'studio') overrides.studioId = 'image';
    if (mismatch === 'amount') overrides.creditCost = AMOUNT + 1;
    if (mismatch === 'reservation') overrides.reservationId = (await fixture()).reservationId;
    let job;
    await assert.rejects(db.withTransaction(async (tx) => {
      job = await task(f, overrides, tx);
      await creations.linkReservationToCreation(f.reservationId, job.id, tx);
    }), LINK_CONFLICT);
    assert.ok(job?.id, 'the failure must occur at link, not during task insertion');
    assert.equal(await creations.findCreationById(job.id), null);
    assert.equal((await reservation(f)).creation_id, null);
    await assertMoney(f, 'RESERVED');
  });
}

test('link cannot overwrite a nonempty creation_id even when the candidate tuple otherwise matches', options, async () => {
  const f = await fixture();
  const job = await task(f);
  const prior = 'already-linked-other-job';
  await db.execute('UPDATE ops_bill.credit_reservations SET creation_id=$2 WHERE id=$1', [f.reservationId, prior]);
  await assert.rejects(creations.linkReservationToCreation(f.reservationId, job.id), LINK_CONFLICT);
  assert.equal((await reservation(f)).creation_id, prior);
  await assertMoney(f, 'RESERVED');
});

for (const status of ['COMMITTED', 'VOIDED']) {
  test(`link rejects an already ${status} reservation without retaining a queued task`, options, async () => {
    const f = await fixture();
    if (status === 'COMMITTED') await credits.commitCredits({ reservationId: f.reservationId });
    else await credits.voidCredits({ reservationId: f.reservationId });
    let job;
    await assert.rejects(db.withTransaction(async (tx) => {
      job = await task(f, {}, tx);
      await creations.linkReservationToCreation(f.reservationId, job.id, tx);
    }), LINK_CONFLICT);
    assert.ok(job?.id);
    assert.equal(await creations.findCreationById(job.id), null);
    assert.equal((await reservation(f)).creation_id, null);
    await assertMoney(f, status);
  });
}
