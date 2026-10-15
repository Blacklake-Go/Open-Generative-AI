import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const { allocateUserId } = await import('../../lib/auth/user-id.js');
const authRepo = await import('../../lib/repositories/auth.js');
const workerHealthRepo = await import('../../lib/repositories/workerHealth.js');
const requestGuard = await import('../../lib/security/requestGuard.js');
const currencyService = await import('../../lib/financial/currencyService.js');

// Reserve a genuine canonical numeric user_id through the production allocator
// and its append-only ledger, then create the user. This keeps the fixtures
// compliant with migration 037's users_id_numeric_check + users_id_allocation_fk.
async function seedCanonicalUser(extraColumns = {}) {
  const id = await allocateUserId({
    reserve: (candidate, digits) => authRepo.reserveUserId(candidate, digits),
    findFirstAvailable: (digits) => authRepo.findFirstAvailableUserId(digits),
    isExhausted: (digits) => authRepo.isUserIdPoolExhausted(digits),
  });
  const columns = { email: `${id}@example.test`, password_hash: 'hash', password_salt: 'salt', role: 'user', credits: 0, status: 'active', ...extraColumns };
  const keys = Object.keys(columns);
  const placeholders = keys.map((_, i) => `$${i + 2}`).join(', ');
  await db.execute(`INSERT INTO users (id, ${keys.join(', ')}) VALUES ($1, ${placeholders})`, [id, ...keys.map((k) => columns[k])]);
  return id;
}

async function dropCanonicalUser(id) {
  await db.execute('DELETE FROM users WHERE id = $1', [id]).catch(() => {});
  await db.execute('DELETE FROM user_id_allocations WHERE user_id = $1', [id]).catch(() => {});
}

test.after(async () => {
  await db.closePgPool();
});

test('PostgreSQL test environment is explicit and migrations are converged', { skip: !testUrl }, async () => {
  await migrations.runMigrations();
  const status = await migrations.getMigrationStatus();
  const migrationFiles = (await readdir(new URL('../../lib/db/migrations/', import.meta.url)))
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
  assert.equal(status.ok, true);
  assert.equal(status.pending.length, 0);
  assert.equal(status.drifted.length, 0);
  assert.equal(status.latest, migrationFiles.at(-1)?.replace(/\.sql$/i, ''));
});

test('persistent rate-limit status locks after the configured failures and resets explicitly', { skip: !testUrl }, async () => {
  const scope = `currency_pay_password_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const subject = `fixture-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const options = { scope, subject, limit: 3, windowMs: 60_000 };

  try {
    assert.equal((await requestGuard.getRateLimitStatus(options)).allowed, true);
    for (let attempt = 0; attempt < options.limit; attempt += 1) {
      assert.equal((await requestGuard.consumeRateLimit(options)).allowed, true);
    }
    const locked = await requestGuard.getRateLimitStatus(options);
    assert.equal(locked.allowed, false);
    assert.equal(locked.remaining, 0);
    assert.ok(locked.retryAfterSeconds > 0);
  } finally {
    await requestGuard.resetRateLimitBucket({ scope, subject });
  }

  assert.equal((await requestGuard.getRateLimitStatus(options)).allowed, true);
});

test('currency transfer stops pay-password checks after five persisted failures', { skip: !testUrl }, async () => {
  const userId = await seedCanonicalUser();
  const resetSenderId = await seedCanonicalUser();
  const suspendedReceiverId = await seedCanonicalUser({ status: 'suspended' });
  const failureScope = { scope: 'currency_pay_password_failure', subject: userId };
  const resetScope = { scope: 'currency_pay_password_failure', subject: resetSenderId };
  try {
    await currencyService.getCurrencyWallet(userId);
    await currencyService.setPayPassword(userId, 'fixture-pay-password');
    await assert.rejects(
      () => currencyService.setPayPassword(userId, 'replacement-pay-password'),
      (error) => error.code === 'PAY_PASSWORD_CURRENT_REQUIRED',
    );
    await assert.rejects(
      () => currencyService.setPayPassword(userId, 'replacement-pay-password', 'wrong-fixture-password'),
      (error) => error.code === 'PAY_PASSWORD_INVALID',
    );
    assert.equal(await currencyService.verifyPayPassword(userId, 'fixture-pay-password'), true);
    await currencyService.setPayPassword(userId, 'replacement-pay-password', 'fixture-pay-password');
    assert.equal(await currencyService.verifyPayPassword(userId, 'replacement-pay-password'), true);
    await currencyService.getCurrencyWallet(resetSenderId);
    await currencyService.setPayPassword(resetSenderId, 'fixture-pay-password');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(
        () => currencyService.transferCurrency({
          senderId: userId,
          receiverId: `${userId}1`,
          amount: 1,
          payPassword: 'wrong-fixture-password',
          clientIp: '127.0.0.1',
          idempotencyKey: `pay-password-failure-${userId}-${attempt}`,
        }),
        /支付密码错误/,
      );
    }

    await assert.rejects(
      () => currencyService.transferCurrency({
        senderId: userId,
        receiverId: `${userId}1`,
        amount: 1,
        payPassword: 'wrong-fixture-password',
        clientIp: '127.0.0.1',
        idempotencyKey: `pay-password-failure-blocked-${userId}`,
      }),
      (error) => error.code === 'RATE_LIMITED' && error.retryAfterSeconds > 0,
    );
    await assert.rejects(
      () => currencyService.setPayPassword(userId, 'bypass-lockout-password', 'replacement-pay-password'),
      (error) => error.code === 'RATE_LIMITED' && error.retryAfterSeconds > 0,
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.rejects(
        () => currencyService.transferCurrency({
          senderId: resetSenderId,
          receiverId: `${resetSenderId}1`,
          amount: 1,
          payPassword: 'wrong-fixture-password',
          clientIp: '127.0.0.2',
          idempotencyKey: `pay-password-reset-failure-${resetSenderId}-${attempt}`,
        }),
        /支付密码错误/,
      );
    }
    await assert.rejects(
      () => currencyService.transferCurrency({
        senderId: resetSenderId,
        receiverId: suspendedReceiverId,
        amount: 1,
        payPassword: 'fixture-pay-password',
        clientIp: '127.0.0.2',
        idempotencyKey: `pay-password-reset-${resetSenderId}`,
      }),
      /收款方账户状态异常/,
    );
    assert.equal((await requestGuard.getRateLimitStatus({ ...resetScope, limit: 5, windowMs: 15 * 60 * 1000 })).allowed, true);
  } finally {
    await requestGuard.resetRateLimitBucket(failureScope);
    await requestGuard.resetRateLimitBucket(resetScope);
    await db.execute('DELETE FROM currency_wallets WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM currency_wallets WHERE user_id = $1', [resetSenderId]).catch(() => {});
    await dropCanonicalUser(suspendedReceiverId);
    await dropCanonicalUser(resetSenderId);
    await dropCanonicalUser(userId);
  }
});

test('query, queryOne and execute use PostgreSQL parameter binding', { skip: !testUrl }, async () => {
  const row = await db.queryOne('SELECT $1::text AS value', ['bound']);
  assert.equal(row.value, 'bound');
  assert.equal(await db.execute('SELECT $1::text AS value', ['executed']), 1);
});

test('provider readiness reads only public active models and their route mappings', { skip: !testUrl }, async () => {
  const { listPublicModelProviderRoutes } = await import('../../lib/repositories/dependencyHealth.js');
  const rows = await listPublicModelProviderRoutes();
  assert.ok(Array.isArray(rows));
  for (const row of rows) {
    assert.equal(typeof row.model_id, 'string');
    assert.ok(row.mapping_id === null || typeof row.mapping_id === 'string');
  }
});

test('generation worker heartbeat is visible to the queue health probe', { skip: !testUrl }, async () => {
  const instanceId = `test-worker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await workerHealthRepo.recordWorkerHeartbeat({
    workerName: 'generation',
    instanceId,
    processId: process.pid,
    startedAt: new Date(),
  });
  try {
    const snapshot = await workerHealthRepo.readGenerationQueueHealth();
    assert.ok(snapshot.live_workers >= 1);
    assert.ok(snapshot.queued_count >= 0);
    assert.ok(snapshot.stale_processing_count >= 0);
    assert.ok(snapshot.failed_last_15m >= 0);
  } finally {
    await workerHealthRepo.removeWorkerHeartbeat({ workerName: 'generation', instanceId });
  }
});

test('generation worker process writes its heartbeat and removes it on graceful shutdown', { skip: !testUrl }, async () => {
  const pg = (await import('pg')).default;
  const suffix = `${process.pid}_${Math.random().toString(16).slice(2, 10)}`;
  const workerDbName = `p7_worker_${suffix}`;
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const workerDbUrl = new URL(testUrl);
  workerDbUrl.pathname = `/${workerDbName}`;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${workerDbName}"`);
  await admin.end();
  const sharedDatabaseUrl = process.env.DATABASE_URL;
  await db.closePgPool();
  process.env.DATABASE_URL = workerDbUrl.toString();
  try {
    await migrations.runMigrations();
    const workerDbStatus = await migrations.getMigrationStatus();
    assert.equal(workerDbStatus.ok, true);
    assert.equal(workerDbStatus.pending.length, 0);
    assert.equal(workerDbStatus.drifted.length, 0);
  } catch (error) {
    const cleanupAdmin = new pg.Client({ connectionString: adminUrl.toString() });
    await cleanupAdmin.connect();
    await cleanupAdmin.query(`DROP DATABASE IF EXISTS "${workerDbName}" WITH (FORCE)`);
    await cleanupAdmin.end();
    throw error;
  } finally {
    await db.closePgPool();
    process.env.DATABASE_URL = sharedDatabaseUrl;
  }
  const workerDb = new pg.Client({ connectionString: workerDbUrl.toString() });
  await workerDb.connect();
  const child = spawn(process.execPath, [
    '--experimental-loader',
    './scripts/server-only-loader.mjs',
    'scripts/generation-worker.mjs',
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: workerDbUrl.toString(),
      GENERATION_WORKER_POLL_MS: '10000',
      WORKER_HEARTBEAT_INTERVAL_MS: '5000',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let exited = false;
  child.once('exit', () => { exited = true; });

  const waitFor = async (check, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  };

  try {
    assert.ok(child.pid);
    const heartbeat = await waitFor(async () => {
      const result = await workerDb.query(`SELECT instance_id FROM sys_core.worker_heartbeats
        WHERE worker_name='generation' AND process_id=$1`, [child.pid]);
      return result.rows[0] || null;
    });
    assert.ok(heartbeat, 'worker process must register a live heartbeat');

    child.kill('SIGTERM');
    const exit = await Promise.race([
      new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
      new Promise((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
    assert.ok(exit, 'worker should stop within ten seconds after SIGTERM');
    assert.equal(exit.code, 0);

    const removed = await waitFor(async () => {
      const result = await workerDb.query(`SELECT instance_id FROM sys_core.worker_heartbeats
        WHERE worker_name='generation' AND process_id=$1`, [child.pid]);
      return result.rowCount === 0;
    });
    assert.equal(removed, true, 'graceful shutdown must remove its heartbeat');
  } finally {
    if (!exited && child.exitCode === null) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    await workerDb.end();
    const dropAdmin = new pg.Client({ connectionString: adminUrl.toString() });
    await dropAdmin.connect();
    await dropAdmin.query(`DROP DATABASE IF EXISTS "${workerDbName}" WITH (FORCE)`);
    await dropAdmin.end();
  }
});

test('readiness requires a live worker plus healthy configured core dependencies', { skip: !testUrl }, async () => {
  const instanceId = `test-readiness-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const healthyDependency = async () => ({ status: 'healthy' });
  const { getReadiness } = await import('../../lib/services/systemHealth.js');
  const dependencies = { storageProbe: healthyDependency, emailProbe: healthyDependency, providerProbe: healthyDependency };

  await workerHealthRepo.recordWorkerHeartbeat({
    workerName: 'generation',
    instanceId,
    processId: process.pid,
    startedAt: new Date(),
  });
  try {
    const degraded = await getReadiness({ ...dependencies, emailProbe: async () => ({ status: 'degraded' }) });
    assert.equal(degraded.worker.status, 'healthy');
    assert.equal(degraded.ready, false);

    const ready = await getReadiness(dependencies);
    assert.equal(ready.database.ok, true);
    assert.equal(ready.migrations.ok, true);
    assert.equal(ready.worker.status, 'healthy');
    assert.equal(ready.storage.status, 'healthy');
    assert.equal(ready.email.status, 'healthy');
    assert.equal(ready.providers.status, 'healthy');
    assert.equal(ready.ready, true);
  } finally {
    await workerHealthRepo.removeWorkerHeartbeat({ workerName: 'generation', instanceId });
  }
});

test('transaction rollback leaves no test row behind', { skip: !testUrl }, async () => {
  const { randomNumericUserId } = await import('../../lib/auth/user-id.js');
  let id = null;
  await assert.rejects(() => db.withTransaction(async (tx) => {
    // Reserve through the allocation ledger inside the same transaction so the
    // users FK is satisfied; rollback must also undo the ledger row.
    for (let attempt = 0; attempt < 8 && id === null; attempt++) {
      const candidate = randomNumericUserId(6);
      if (await authRepo.reserveUserId(candidate, 6, tx)) id = candidate;
    }
    assert.ok(id, 'expected a free numeric user_id for the rollback fixture');
    await tx.execute('INSERT INTO users (id, email, password_hash, password_salt) VALUES ($1, $2, $3, $4)', [id, `${id}@example.test`, 'hash', 'salt']);
    throw new Error('intentional rollback');
  }), /transaction failed/i);
  assert.equal(await db.queryOne('SELECT id FROM users WHERE id = $1', [id]), null);
  assert.equal(await db.queryOne('SELECT user_id FROM user_id_allocations WHERE user_id = $1', [id]), null);
});

test('idempotency duplicate request is rejected by the database constraint', { skip: !testUrl }, async () => {
  const id = `test_idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const values = [id, 'test', 'test-actor', 'processing', new Date().toISOString(), new Date(Date.now() + 60_000).toISOString()];
  await db.execute('INSERT INTO idempotency_keys (key_hash, scope, actor_id, status, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)', values);
  await assert.rejects(() => db.execute('INSERT INTO idempotency_keys (key_hash, scope, actor_id, status, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)', values), /duplicate key|unique constraint/i);
  await db.execute('DELETE FROM idempotency_keys WHERE key_hash = $1', [id]);
});

test('simulated generation settles once and releases once on provider failure', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const modelId = `p3_mock_${suffix}`;
  const key = `p3_generation_${suffix}`;
  const failureKey = `${key}_failure`;
  const mappingId = `p3_mapping_${suffix}`;
  const priceVersionId = `p3_price_${suffix}`;
  const oldApiKey = process.env.MUAPI_API_KEY;
  const oldNodeEnv = process.env.NODE_ENV;

  const { grantPerpetualCredits } = await import('../../lib/financial/creditService.js');
  const { createGenerationTask, processGenerationTask } = await import('../../lib/services/generationCore.js');
  const { createMockGenerationProvider } = await import('../../lib/services/generationProviders.js');

  const userId = await seedCanonicalUser();
  try {
    await db.execute(`INSERT INTO models_config (id, provider, name, type, credits_price, is_active)
      VALUES ($1, 'muapi', 'P3 Mock', 'image', 3, TRUE)`, [modelId]);
    await db.execute(`INSERT INTO ai_studio.ai_models
      (id,slug,name,display_name,category,status,supported_resolutions,supported_input_types,supported_output_types)
      VALUES ($1,$1,'P3 Mock','P3 Mock','image','active','["1024x1024"]'::jsonb,
        '["text"]'::jsonb,'["image"]'::jsonb)`, [modelId]);
    await db.execute(`INSERT INTO ai_studio.model_pricing
      (id,model_id,pricing_type,base_credits,formula_config,subscription_discounts,min_credits,
       min_gross_margin_rate,is_active,created_at,updated_at)
      VALUES ($1,$2,'fixed',3,'{}'::jsonb,'{}'::jsonb,1,0.35,TRUE,now(),now())`, [`p3_pricing_${suffix}`, modelId]);
    await db.execute(`UPDATE ai_studio.ai_providers SET enabled=TRUE,health_status='healthy',
      last_health_check_at=now(),balance=1000,circuit_state='closed' WHERE id='muapi'`);
    await db.execute(`INSERT INTO ai_studio.provider_models
      (id,model_id,provider_id,provider_model_id,enabled,priority,cost_config,capabilities,
       review_status,provider_endpoint,supported_task_types,supported_resolutions,
       supported_durations,supported_qualities,supported_regions,license_requirements,mapping_version)
      VALUES ($1,$2,'muapi',$3,TRUE,100,'{}'::jsonb,
        '{"input_types":["text"],"output_types":["image"]}'::jsonb,'approved',
        '/api/v1/test-image','["t2i"]'::jsonb,'["1024x1024"]'::jsonb,'[]'::jsonb,
        '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,1)`, [mappingId, modelId, modelId]);
    await db.execute(`INSERT INTO ai_studio.provider_model_price_versions
      (id,provider_model_id,version_no,price_type,billing_unit,currency,price_config,applicability,
       source_url,source_observed_at,fetched_at,effective_at,expires_at,evidence_digest,status,approved_by,approved_at)
      VALUES ($1,$2,1,'aggregator','per_request','USD','{"base_cost":0.01,"currency":"USD"}'::jsonb,
        '{}'::jsonb,'https://muapi.ai/docs/pricing',now(),now(),now(),now()+interval '7 days',
        'p3-fixture-evidence','active','test-fixture',now())`, [priceVersionId, mappingId]);
    process.env.MUAPI_API_KEY = 'not-a-real-provider-key-for-local-tests';
    process.env.NODE_ENV = 'test';
    await grantPerpetualCredits(userId, 30, 'P3 integration seed', userId, `p3:seed:${userId}`);

    const testDependencies = {
      syncAsset: false,
      async archiveGenerationResult({ creation }) {
        return {
          objectKey: `local-test/${creation.id}`,
          bucket: 'local-test',
          region: 'local',
          mimeType: 'image/png',
          sizeBytes: 4,
          checksum: `checksum-${creation.id}`,
          attempts: 1,
        };
      },
    };

    const { createGenerationQuote } = await import('../../lib/services/pricingEngine.js');
    const taskQuote = await createGenerationQuote({ userId, modelId, parameters: { aspect_ratio: '1:1' }, idempotencyKey: `${key}:quote` });
    const task = await createGenerationTask({ userId, modelId, prompt: 'test prompt', parameters: { aspect_ratio: '1:1' }, quoteId: taskQuote.quoteId, idempotencyKey: key });
    const duplicate = await createGenerationTask({ userId, modelId, prompt: 'test prompt', parameters: { aspect_ratio: '1:1' }, quoteId: taskQuote.quoteId, idempotencyKey: key });
    assert.equal(duplicate.creation.id, task.creation.id);
    assert.equal(duplicate.idempotent, true);

    const succeeded = await processGenerationTask({
      creationId: task.creation.id,
      providerClient: createMockGenerationProvider({ resultUrl: 'https://mock.invalid/p3-success.png' }),
      testDependencies,
    });
    assert.equal(succeeded.success, true);
    const repeated = await processGenerationTask({
      creationId: task.creation.id,
      providerClient: createMockGenerationProvider({ outcome: 'failed' }),
      testDependencies,
    });
    assert.equal(repeated.idempotent, true);

    const failureQuote = await createGenerationQuote({ userId, modelId, parameters: {}, idempotencyKey: `${failureKey}:quote` });
    const failureTask = await createGenerationTask({ userId, modelId, prompt: 'failure', quoteId: failureQuote.quoteId, idempotencyKey: failureKey });
    const failed = await processGenerationTask({
      creationId: failureTask.creation.id,
      providerClient: createMockGenerationProvider({ outcome: 'failed' }),
      testDependencies,
    });
    assert.equal(failed.success, false);

    const rows = await db.query(`SELECT c.status, r.status AS reservation_status FROM creations c JOIN credit_reservations r ON r.id = c.reservation_id WHERE c.id = ANY($1::text[])`, [[task.creation.id, failureTask.creation.id]]);
    assert.deepEqual(rows.rows.map((row) => [row.status, row.reservation_status]).sort(), [['failed', 'VOIDED'], ['succeeded', 'COMMITTED']]);
    const ledger = await db.query(`SELECT action_type FROM credit_ledger_v2 WHERE user_id = $1 AND action_type IN ('TASK_RESERVE', 'TASK_COMMIT', 'TASK_RELEASE')`, [userId]);
    assert.ok(ledger.rows.some((row) => row.action_type === 'TASK_RESERVE'));
    assert.ok(ledger.rows.some((row) => row.action_type === 'TASK_COMMIT'));
    assert.ok(ledger.rows.some((row) => row.action_type === 'TASK_RELEASE'));
  } finally {
    await db.execute('DELETE FROM credit_reservations WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM creations WHERE user_id = $1', [userId]).catch(() => {});
    await dropCanonicalUser(userId);
    await db.execute('DELETE FROM models_config WHERE id = $1', [modelId]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.provider_models WHERE id = $1', [mappingId]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.model_pricing WHERE model_id = $1', [modelId]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [modelId]).catch(() => {});
    if (oldApiKey === undefined) delete process.env.MUAPI_API_KEY;
    else process.env.MUAPI_API_KEY = oldApiKey;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
});

test('stale processing generation is failed once with its frozen credits restored', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = await seedCanonicalUser();
  const creationId = `timeout_generation_${suffix}`;
  const idempotencyKey = `timeout_reservation_${suffix}`;
  const modelId = `timeout_model_${suffix}`;
  const { grantPerpetualCredits, reserveCredits } = await import('../../lib/financial/creditService.js');
  const { expireStaleGenerationTasks } = await import('../../lib/services/generationCore.js');

  try {
    await grantPerpetualCredits(userId, 10, 'timeout integration seed', userId, `timeout_seed_${suffix}`);
    await db.execute(`INSERT INTO ai_studio.creations
      (id,user_id,studio_id,status,credit_cost,provider,model,started_at,created_at,updated_at)
      VALUES ($1,$2,'image','processing',10,'muapi',$3,now()-interval '20 minutes',now()-interval '20 minutes',now()-interval '20 minutes')`,
    [creationId, userId, modelId]);
    const reservation = await reserveCredits({
      userId,
      amount: 10,
      modelId,
      studioId: 'image',
      idempotencyKey,
    });
    await db.execute('UPDATE ai_studio.creations SET reservation_id=$2 WHERE id=$1', [creationId, reservation.reservationId]);
    await db.execute('UPDATE ops_bill.credit_reservations SET creation_id=$2 WHERE id=$1', [reservation.reservationId, creationId]);

    const frozen = await db.queryOne('SELECT perpetual_credits,frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [userId]);
    assert.equal(Number(frozen.perpetual_credits), 0);
    assert.equal(Number(frozen.frozen_credits), 10);

    const expired = await expireStaleGenerationTasks({ timeoutMs: 60_000, limit: 10 });
    assert.deepEqual(expired, { checkedCount: 1, processed: [{ id: creationId, status: 'failed' }] });

    const row = await db.queryOne(`SELECT status,error_code,error_reason FROM ai_studio.creations WHERE id=$1`, [creationId]);
    assert.equal(row.status, 'failed');
    assert.equal(row.error_code, 'PROVIDER_TIMEOUT');
    assert.match(row.error_reason, /超时/);
    const reservationRow = await db.queryOne('SELECT status FROM ops_bill.credit_reservations WHERE id=$1', [reservation.reservationId]);
    assert.equal(reservationRow.status, 'VOIDED');
    const ledger = await db.queryMany(`SELECT action_type,delta FROM ops_bill.credit_ledger_v2
      WHERE user_id=$1 AND reference_id=$2 ORDER BY action_type`, [userId, reservation.reservationId]);
    assert.deepEqual(ledger.map((entry) => [entry.action_type, Number(entry.delta)]), [['TASK_RELEASE', 10], ['TASK_RESERVE', -10]]);
    const restored = await db.queryOne('SELECT perpetual_credits,frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [userId]);
    assert.equal(Number(restored.perpetual_credits), 10);
    assert.equal(Number(restored.frozen_credits), 0);
    const timeoutEvents = await db.queryMany(`SELECT event_type FROM ai_studio.generation_events
      WHERE creation_id=$1 AND event_type='TASK_TIMEOUT'`, [creationId]);
    assert.equal(timeoutEvents.length, 1);

    const secondRun = await expireStaleGenerationTasks({ timeoutMs: 60_000, limit: 10 });
    assert.deepEqual(secondRun, { checkedCount: 0, processed: [] });
    const ledgerAfterRepeat = await db.queryMany(`SELECT action_type,delta FROM ops_bill.credit_ledger_v2
      WHERE user_id=$1 AND reference_id=$2`, [userId, reservation.reservationId]);
    assert.equal(ledgerAfterRepeat.length, 2);
  } finally {
    await db.execute('DELETE FROM ai_studio.creations WHERE id=$1', [creationId]).catch(() => {});
    await db.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id=$1', [userId]).catch(() => {});
    await db.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id=$1', [userId]).catch(() => {});
    await dropCanonicalUser(userId);
  }
});

test('credit settlement rejects an inconsistent reservation split without changing wallet, reservation, or ledger', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = await seedCanonicalUser();
  const reservationIds = [`split_commit_${suffix}`, `split_void_${suffix}`];
  const { commitCredits, voidCredits } = await import('../../lib/financial/creditService.js');

  try {
    await db.execute(`INSERT INTO ops_bill.credit_wallets
      (user_id,daily_free_credits,subscription_credits,perpetual_credits,frozen_credits)
      VALUES ($1,2,3,15,20)`, [userId]);

    for (const [index, settle] of [commitCredits, voidCredits].entries()) {
      const reservationId = reservationIds[index];
      await db.execute(`INSERT INTO ops_bill.credit_reservations
        (id,user_id,studio_id,model_id,reserved_amount,settled_amount,bucket_split_json,status,idempotency_key,expires_at)
        VALUES ($1,$2,'image','test-image',10,0,$3::jsonb,'RESERVED',$4,now()+interval '15 minutes')`,
      [reservationId, userId, JSON.stringify({ daily: 2, subscription: 3, perpetual: 4 }), `split_key_${suffix}_${index}`]);

      await assert.rejects(
        settle({ reservationId, settledAmount: 10, expectedUserId: userId }),
        { code: 'CREDIT_RESERVATION_BALANCE_MISMATCH' },
      );
      const wallet = await db.queryOne(`SELECT daily_free_credits,subscription_credits,perpetual_credits,frozen_credits
        FROM ops_bill.credit_wallets WHERE user_id=$1`, [userId]);
      assert.deepEqual(Object.values(wallet).map(Number), [2, 3, 15, 20]);
      const reservation = await db.queryOne(`SELECT status,settled_amount FROM ops_bill.credit_reservations WHERE id=$1`, [reservationId]);
      assert.deepEqual({ status: reservation.status, settledAmount: Number(reservation.settled_amount) }, { status: 'RESERVED', settledAmount: 0 });
      const ledger = await db.queryOne(`SELECT COUNT(*)::int AS count FROM ops_bill.credit_ledger_v2 WHERE reference_id=$1`, [reservationId]);
      assert.equal(ledger.count, 0);
    }
  } finally {
    await db.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id=$1', [userId]).catch(() => {});
    await db.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id=$1', [userId]).catch(() => {});
    await dropCanonicalUser(userId);
  }
});

test('payment credit refunds reverse a grant once and preserve non-negative balances', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const referenceId = `refund_order_${suffix}`;
  const idempotencyKey = `refund_credits_${suffix}`;
  const { grantPerpetualCredits, reversePaymentCredits } = await import('../../lib/financial/creditService.js');

  const userId = await seedCanonicalUser();
  try {
    await grantPerpetualCredits(userId, 10, 'payment grant test', referenceId, `grant:${idempotencyKey}`);
    const reversed = await reversePaymentCredits({ userId, referenceId, idempotencyKey });
    assert.equal(reversed.reversedAmount, 10);
    assert.equal(reversed.unrecoveredAmount, 0);
    const repeated = await reversePaymentCredits({ userId, referenceId, idempotencyKey });
    assert.equal(repeated.idempotent, true);
    const wallet = await db.queryOne('SELECT perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId]);
    assert.equal(Number(wallet.perpetual_credits), 0);
    const ledger = await db.queryOne(`SELECT delta, action_type FROM credit_ledger_v2 WHERE user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey]);
    assert.deepEqual({ delta: Number(ledger.delta), action_type: ledger.action_type }, { delta: -10, action_type: 'PAYMENT_REFUND' });
  } finally {
    await db.execute('DELETE FROM credit_refund_obligations WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
    await dropCanonicalUser(userId);
  }
});
