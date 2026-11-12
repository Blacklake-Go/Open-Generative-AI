import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inspect } from 'node:util';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';

const testUrl = process.env.TEST_DATABASE_URL;
const originalStorageKey = process.env.STORAGE_SECRETS_ENCRYPTION_KEY;
const TEST_KEY = 'generation-result-checkpoints-isolated-test-key';
if (testUrl) {
  requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL);
  process.env.DATABASE_URL = testUrl;
  process.env.STORAGE_SECRETS_ENCRYPTION_KEY = TEST_KEY;
}
const db = testUrl ? await import('../../lib/db/index.js') : null;
const results = testUrl ? await import('../../lib/repositories/generationResults.js') : null;
const storageCrypto = testUrl ? await import('../../lib/storage/storageCrypto.js') : null;
const pgTest = (name, fn) => test(name, { skip: !testUrl }, fn);
const users = [];
const identityError = { code: 'GENERATION_RESULT_IDENTITY_CONFLICT' };
const encryptionError = { code: 'GENERATION_RESULT_ENCRYPTION_UNAVAILABLE' };
const URL = 'https://provider.example.test/private-output.png?signature=checkpoint-secret-url';
const TEXT = 'Private generated text, not public task metadata.';
const output = { resultUrl: URL, resultText: TEXT, actualCostUsd: 0.375 };
const storedResult = {
  objectKey: 'private/checkpoint/original.png',
  bucket: 'checkpoint-test-bucket',
  region: 'test-region',
  provider: 's3',
  storageLocationId: 'checkpoint-test-location',
  mimeType: 'image/png',
  sizeBytes: 1024,
  checksum: 'checkpoint-checksum',
  previewObjectKey: 'private/checkpoint/preview.png',
  thumbnailObjectKey: 'private/checkpoint/thumbnail.png',
  attempts: 2,
  extra: { uploadId: 'preserve-complete-storage-result', parts: [1, 2] },
};

test.afterEach(async () => {
  for (const userId of users.splice(0)) {
    await db.execute('DELETE FROM ai_studio.creations WHERE user_id = $1', [userId]);
    await db.execute('DELETE FROM auth_usr.users WHERE id = $1', [userId]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id = $1', [userId]);
  }
});
test.after(async () => {
  if (db) await db.closePgPool();
  if (originalStorageKey === undefined) delete process.env.STORAGE_SECRETS_ENCRYPTION_KEY;
  else process.env.STORAGE_SECRETS_ENCRYPTION_KEY = originalStorageKey;
});

async function addAttempt(identity, number, overrides = {}) {
  const input = { ...identity, ...overrides };
  const id = db.randomId('checkpoint_attempt');
  await db.execute(`
    INSERT INTO ai_studio.generation_attempts
      (id, creation_id, attempt_number, provider_id, provider_request_id, status)
    VALUES ($1, $2, $3, $4, $5, 'processing')
  `, [id, input.creationId, number, input.providerId, input.providerRequestId]);
  return id;
}

async function fixture({
  providerRequestId = db.randomId('checkpoint_receipt'),
  attemptReceipt = providerRequestId,
  withAttempt = true,
  status = 'processing',
} = {}) {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const userId = await allocateUserId({
    reserve: auth.reserveUserId,
    findFirstAvailable: auth.findFirstAvailableUserId,
    isExhausted: auth.isUserIdPoolExhausted,
  });
  users.push(userId);
  await db.execute(`
    INSERT INTO auth_usr.users (id, email, role, credits, status)
    VALUES ($1, $2, 'user', 0, 'active')
  `, [userId, `${userId}@generation-checkpoint.test`]);
  const identity = {
    creationId: db.randomId('checkpoint_creation'),
    attemptId: null,
    providerId: 'checkpoint_fixture_provider',
    providerRequestId,
  };
  await db.execute(`
    INSERT INTO ai_studio.creations (id, user_id, studio_id, status, provider, provider_request_id)
    VALUES ($1, $2, 'image', $3, $4, $5)
  `, [identity.creationId, userId, status, identity.providerId, providerRequestId]);
  if (withAttempt) identity.attemptId = await addAttempt({ ...identity, providerRequestId: attemptReceipt }, 1);
  return identity;
}

const rawCheckpoint = (id) => db.queryOne('SELECT * FROM ai_studio.generation_result_checkpoints WHERE creation_id = $1', [id]);
const creationState = (id) => db.queryOne(`
  SELECT status, provider, provider_request_id, next_poll_at, poll_locked_until
  FROM ai_studio.creations WHERE id = $1
`, [id]);
const save = (input) => results.saveGenerationResult({ ...output, ...input });
const archive = (input) => results.markGenerationResultArchived({ storedResult, ...input });
const expected = (identity, overrides = {}) => ({
  ...identity, stage: 'provider_succeeded', ...output, storedResult: null, ...overrides,
});

pgTest('encryption readiness round-trips using the existing storage key priority', () => {
  const previous = process.env.PROVIDER_SECRETS_ENCRYPTION_KEY;
  try {
    process.env.PROVIDER_SECRETS_ENCRYPTION_KEY = 'different-test-fallback-key';
    assert.equal(results.assertGenerationResultEncryptionReady(), true);
    const encrypted = storageCrypto.encryptSecret('fixed non-sensitive probe');
    delete process.env.PROVIDER_SECRETS_ENCRYPTION_KEY;
    assert.equal(storageCrypto.decryptSecret(encrypted), 'fixed non-sensitive probe');
    delete process.env.STORAGE_SECRETS_ENCRYPTION_KEY;
    process.env.PROVIDER_SECRETS_ENCRYPTION_KEY = 'test-provider-fallback-key';
    assert.equal(results.assertGenerationResultEncryptionReady(), true);
  } finally {
    process.env.STORAGE_SECRETS_ENCRYPTION_KEY = TEST_KEY;
    if (previous === undefined) delete process.env.PROVIDER_SECRETS_ENCRYPTION_KEY;
    else process.env.PROVIDER_SECRETS_ENCRYPTION_KEY = previous;
  }
});

pgTest('missing encryption keys fail safely and leave no checkpoint or poll scheduling changes', async () => {
  const identity = await fixture();
  const before = await creationState(identity.creationId);
  const keys = [
    'STORAGE_SECRETS_ENCRYPTION_KEY', 'PROVIDER_SECRETS_ENCRYPTION_KEY', 'ADMIN_SECRET_KEY',
    'AUTH_VERIFICATION_CODE_SECRET', 'BILLING_SESSION_SECRET', 'OAUTH_STATE_SECRET',
  ];
  const previous = keys.map((key) => [key, process.env[key]]);
  try {
    for (const key of keys) delete process.env[key];
    assert.throws(() => results.assertGenerationResultEncryptionReady(), encryptionError);
    await assert.rejects(save(identity), encryptionError);
    assert.equal(await rawCheckpoint(identity.creationId), null);
    assert.deepEqual(await creationState(identity.creationId), before);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

pgTest('encryption and decryption preflight failures never escape as STORAGE errors or leak causes', (t) => {
  for (const method of ['createCipheriv', 'createDecipheriv']) {
    const mocked = t.mock.method(crypto, method, () => { throw new Error(URL); });
    try {
      assert.throws(() => results.assertGenerationResultEncryptionReady(), (error) => {
        assert.equal(error.code, encryptionError.code);
        assert.equal(error.cause, undefined);
        assert.ok(!inspect(error).includes(URL));
        return true;
      });
    } finally {
      mocked.mock.restore();
    }
  }
});

pgTest('the separate encrypted table preserves exact results without leaking into creation/attempt SELECT *', async () => {
  const identity = await fixture();
  assert.equal(await results.getGenerationResult(identity.creationId), null);
  const saved = await save(identity);
  assert.deepEqual(saved, expected(identity));
  assert.deepEqual(await results.getGenerationResult(identity.creationId), saved);
  const row = await rawCheckpoint(identity.creationId);
  assert.equal(storageCrypto.isEncryptedSecret(row.encrypted_payload_json), true);
  assert.deepEqual(JSON.parse(storageCrypto.decryptSecret(row.encrypted_payload_json)), saved);
  assert.deepEqual(Object.keys(row).sort(), [
    'creation_id', 'attempt_id', 'provider_id', 'provider_request_id',
    'encrypted_payload_json', 'stage', 'created_at', 'updated_at',
  ].sort());
  const creation = await db.queryOne('SELECT * FROM ai_studio.creations WHERE id = $1', [identity.creationId]);
  const attempt = await db.queryOne('SELECT * FROM ai_studio.generation_attempts WHERE id = $1', [identity.attemptId]);
  for (const value of [row, creation, attempt]) {
    const serialized = JSON.stringify(value);
    assert.ok(!serialized.includes(URL));
    assert.ok(!serialized.includes(TEXT));
  }
});

pgTest('invalid first results and archival without a checkpoint or object key cannot write evidence', async () => {
  const identity = await fixture();
  const before = await creationState(identity.creationId);
  for (const empty of [{}, { resultUrl: '', resultText: '  ' }, { resultUrl: null, resultText: null }]) {
    await assert.rejects(results.saveGenerationResult({ ...identity, ...empty }), { code: 'GENERATION_RESULT_INVALID' });
    assert.equal(await rawCheckpoint(identity.creationId), null);
  }
  await assert.rejects(archive(identity), { code: 'GENERATION_RESULT_NOT_FOUND' });
  assert.deepEqual(await creationState(identity.creationId), before);
  await save(identity);
  const original = await rawCheckpoint(identity.creationId);
  for (const invalid of [null, {}, { objectKey: '  ' }]) {
    await assert.rejects(archive({ ...identity, storedResult: invalid }), { code: 'GENERATION_RESULT_INVALID' });
    assert.deepEqual(await rawCheckpoint(identity.creationId), original);
  }
});

pgTest('creation and attempt identity mismatches reject first saves without publishing a receipt', async () => {
  const identity = await fixture();
  const other = await fixture();
  const wrongProviderAttempt = await addAttempt(identity, 2, { providerId: 'wrong-provider' });
  const wrongReceiptAttempt = await addAttempt(identity, 3, { providerRequestId: 'wrong-receipt' });
  const before = await creationState(identity.creationId);
  for (const changed of [
    { providerId: 'wrong-provider' }, { providerRequestId: 'wrong-receipt' }, { providerRequestId: null },
    { attemptId: other.attemptId }, { attemptId: 'missing-attempt' },
    { attemptId: wrongProviderAttempt }, { attemptId: wrongReceiptAttempt },
    { creationId: other.creationId },
  ]) {
    await assert.rejects(save({ ...identity, ...changed }), identityError);
  }
  assert.equal(await rawCheckpoint(identity.creationId), null);
  assert.equal(await rawCheckpoint(other.creationId), null);
  assert.deepEqual(await creationState(identity.creationId), before);
});

pgTest('empty attempt receipts are allowed but existing checkpoint identity is immutable for save and archive', async () => {
  const identity = await fixture({ attemptReceipt: null });
  const saved = await save(identity);
  assert.deepEqual(saved, expected(identity));
  const original = await rawCheckpoint(identity.creationId);
  const secondAttempt = await addAttempt(identity, 2);
  const other = await fixture();
  for (const changed of [
    { attemptId: null }, { attemptId: secondAttempt }, { attemptId: other.attemptId },
    { providerId: 'wrong-provider' }, { providerRequestId: null }, { providerRequestId: 'wrong-receipt' },
  ]) {
    for (const write of [save, archive]) {
      await assert.rejects(write({ ...identity, ...changed }), identityError);
      assert.deepEqual(await rawCheckpoint(identity.creationId), original);
    }
  }
  await db.execute('UPDATE ai_studio.generation_attempts SET provider_request_id = $2 WHERE id = $1', [identity.attemptId, identity.providerRequestId]);
  assert.deepEqual(await save(identity), saved);
  await db.execute('UPDATE ai_studio.generation_attempts SET provider_request_id = $2 WHERE id = $1', [identity.attemptId, 'changed-attempt-receipt']);
  for (const write of [save, archive]) await assert.rejects(write(identity), identityError);
  assert.deepEqual(await rawCheckpoint(identity.creationId), original);
});

pgTest('matching current parents cannot overwrite a checkpoint from a different provider/receipt/attempt identity', async () => {
  const identity = await fixture({ withAttempt: false });
  await save(identity);
  const original = await rawCheckpoint(identity.creationId);
  const attemptId = await addAttempt(identity, 1);
  for (const changed of [
    { attemptId }, { providerId: 'new-provider' }, { providerRequestId: 'new-receipt' },
  ]) {
    const candidate = { ...identity, ...changed };
    await db.execute('UPDATE ai_studio.creations SET provider = $2, provider_request_id = $3 WHERE id = $1', [
      identity.creationId, candidate.providerId, candidate.providerRequestId,
    ]);
    for (const write of [save, archive]) await assert.rejects(write(candidate), identityError);
    assert.deepEqual(await rawCheckpoint(identity.creationId), original);
  }
});

pgTest('duplicate and concurrent successes retain the first URL, text, cost and encrypted bytes', async () => {
  const identity = await fixture();
  const originalResult = await save(identity);
  const originalRow = await rawCheckpoint(identity.creationId);
  const repeated = await Promise.all(Array.from({ length: 8 }, (_, index) => save({
    ...identity, resultUrl: `${URL}&retry=${index}`, resultText: 'replacement', actualCostUsd: 99,
  })));
  for (const result of repeated) assert.deepEqual(result, originalResult);
  assert.deepEqual(await results.saveGenerationResult(identity), originalResult);
  assert.deepEqual(await rawCheckpoint(identity.creationId), originalRow);
});

pgTest('concurrent first successes serialize on the creation and return one unmodified winner', async () => {
  const identity = await fixture();
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    ...identity, resultUrl: `${URL}&candidate=${index}`, resultText: `text-${index}`, actualCostUsd: index,
  }));
  const saved = await Promise.all(candidates.map(save));
  for (const result of saved) assert.deepEqual(result, saved[0]);
  const winner = candidates.find((candidate) => candidate.resultUrl === saved[0].resultUrl);
  assert.ok(winner);
  assert.equal(saved[0].resultText, winner.resultText);
  assert.equal(saved[0].actualCostUsd, winner.actualCostUsd);
  const count = await db.queryOne('SELECT COUNT(*)::int AS count FROM ai_studio.generation_result_checkpoints WHERE creation_id = $1', [identity.creationId]);
  assert.equal(count.count, 1);
});

pgTest('archival is monotonic, retains the complete first stored result, and removes the signed URL', async () => {
  const identity = await fixture();
  await save(identity);
  const before = await rawCheckpoint(identity.creationId);
  const archived = await archive(identity);
  assert.deepEqual(archived, expected(identity, { stage: 'archived', resultUrl: null, storedResult }));
  assert.deepEqual(await results.getGenerationResult(identity.creationId), archived);
  const row = await rawCheckpoint(identity.creationId);
  assert.deepEqual(row.created_at, before.created_at);
  assert.ok(row.updated_at >= before.updated_at);
  const decrypted = JSON.parse(storageCrypto.decryptSecret(row.encrypted_payload_json));
  assert.equal(Object.hasOwn(decrypted, 'resultUrl'), false);
  assert.ok(!JSON.stringify(decrypted).includes(URL));
  assert.deepEqual(decrypted.storedResult, storedResult);
  assert.equal(decrypted.resultText, TEXT);
  assert.equal(decrypted.actualCostUsd, output.actualCostUsd);
  assert.ok(!JSON.stringify(row).includes(storedResult.objectKey));
  const repeats = await Promise.all([
    archive({ ...identity, storedResult: { objectKey: 'replacement', attempts: 99 } }),
    save({ ...identity, resultUrl: `${URL}&late=true`, resultText: 'late text', actualCostUsd: 99 }),
    archive(identity),
  ]);
  for (const repeat of repeats) assert.deepEqual(repeat, archived);
  assert.deepEqual(await rawCheckpoint(identity.creationId), row);
});

pgTest('competing archives and late successes retain exactly one complete archived object', async () => {
  const identity = await fixture();
  await save(identity);
  const candidates = Array.from({ length: 6 }, (_, index) => ({ ...storedResult, objectKey: `object-${index}`, attempts: index }));
  const archived = await Promise.all(candidates.map((candidate) => archive({ ...identity, storedResult: candidate })));
  for (const result of archived) assert.deepEqual(result, archived[0]);
  assert.ok(candidates.some((candidate) => JSON.stringify(candidate) === JSON.stringify(archived[0].storedResult)));
  const [late, retry] = await Promise.all([save(identity), archive(identity)]);
  assert.deepEqual(late, archived[0]);
  assert.deepEqual(retry, archived[0]);
});

pgTest('non-processing creations return null without creating, updating or deleting evidence', async () => {
  for (const status of ['succeeded', 'failed', 'cancelled', 'queued']) {
    const empty = await fixture({ status });
    const before = await creationState(empty.creationId);
    assert.equal(await save(empty), null);
    assert.equal(await archive(empty), null);
    assert.equal(await rawCheckpoint(empty.creationId), null);
    assert.deepEqual(await creationState(empty.creationId), before);

    const identity = await fixture();
    const saved = await save(identity);
    const checkpoint = await rawCheckpoint(identity.creationId);
    await db.execute('UPDATE ai_studio.creations SET status = $2 WHERE id = $1', [identity.creationId, status]);
    const terminal = await creationState(identity.creationId);
    assert.equal(await save(identity), null);
    assert.equal(await archive(identity), null);
    assert.deepEqual(await rawCheckpoint(identity.creationId), checkpoint);
    assert.deepEqual(await results.getGenerationResult(identity.creationId), saved);
    assert.deepEqual(await creationState(identity.creationId), terminal);
  }
});

pgTest('synchronous results without receipts/attempts wake recovery without clearing the poll lease', async () => {
  for (const withAttempt of [false, true]) {
    const identity = await fixture({ providerRequestId: null, withAttempt });
    await db.execute(`UPDATE ai_studio.creations SET poll_locked_until = NOW() + INTERVAL '10 minutes' WHERE id = $1`, [identity.creationId]);
    const before = await creationState(identity.creationId);
    const saved = await results.saveGenerationResult({ ...identity, resultText: TEXT, actualCostUsd: 0 });
    assert.deepEqual(saved, expected(identity, { resultUrl: null, actualCostUsd: 0 }));
    const after = await creationState(identity.creationId);
    assert.ok(after.next_poll_at instanceof Date);
    assert.deepEqual(after.poll_locked_until, before.poll_locked_until);
    assert.equal(after.provider_request_id, null);
    assert.deepEqual(await results.getGenerationResult(identity.creationId), saved);
    assert.deepEqual(await archive(identity), { ...saved, stage: 'archived', storedResult });
    assert.equal((await creationState(identity.creationId)).provider_request_id, null);
  }
});

pgTest('recovery scheduling only brings NULL/future polls forward and never changes receipts or leases', async () => {
  const identity = await fixture({ providerRequestId: null, attemptReceipt: null });
  const withReceipt = { ...identity, providerRequestId: 'caller-owned-receipt' };
  // The caller owns receipt publication; this repository must not invent that side effect.
  await save(withReceipt);
  assert.equal((await creationState(identity.creationId)).provider_request_id, null);
  const attempt = await db.queryOne('SELECT provider_request_id FROM ai_studio.generation_attempts WHERE id = $1', [identity.attemptId]);
  assert.equal(attempt.provider_request_id, null);
  for (const write of [save, archive]) {
    for (const pollSql of ['NULL', "NOW() + INTERVAL '1 hour'", "NOW() - INTERVAL '1 hour'"]) {
      await db.execute(`UPDATE ai_studio.creations SET next_poll_at = ${pollSql}, poll_locked_until = NOW() + INTERVAL '5 minutes' WHERE id = $1`, [identity.creationId]);
      const before = await creationState(identity.creationId);
      await db.withTransaction(async (transaction) => {
        const now = await transaction.queryOne('SELECT NOW() AS now');
        await write({ ...withReceipt, transaction });
        const after = await transaction.queryOne('SELECT next_poll_at, poll_locked_until, provider_request_id FROM ai_studio.creations WHERE id = $1', [identity.creationId]);
        assert.deepEqual(after.next_poll_at, pollSql.includes('-') ? before.next_poll_at : now.now);
        assert.deepEqual(after.poll_locked_until, before.poll_locked_until);
        assert.equal(after.provider_request_id, null);
      });
    }
  }
});

pgTest('plaintext, damaged ciphertext and mismatched encrypted identities fail closed without leaking evidence', async () => {
  const identity = await fixture();
  await save(identity);
  const row = await rawCheckpoint(identity.creationId);
  const payload = JSON.parse(storageCrypto.decryptSecret(row.encrypted_payload_json));
  const damaged = { ...row.encrypted_payload_json, tag: '0'.repeat(32) };
  const invalid = [
    URL, payload, {}, { ...row.encrypted_payload_json, v: 99 }, damaged,
    storageCrypto.encryptSecret('not valid JSON'),
    ...[
      { creationId: 'different-creation' }, { attemptId: null },
      { providerId: 'different-provider' }, { providerRequestId: null }, { stage: 'archived' },
    ].map((mismatch) => storageCrypto.encryptSecret(JSON.stringify({ ...payload, ...mismatch }))),
  ];
  for (const encrypted of invalid) {
    await db.execute('UPDATE ai_studio.generation_result_checkpoints SET encrypted_payload_json = $2::jsonb WHERE creation_id = $1', [identity.creationId, JSON.stringify(encrypted)]);
    const corrupted = await rawCheckpoint(identity.creationId);
    for (const readOrWrite of [() => results.getGenerationResult(identity.creationId), () => save(identity), () => archive(identity)]) {
      await assert.rejects(readOrWrite(), (error) => {
        assert.equal(error.code, 'GENERATION_RESULT_UNREADABLE');
        const rendered = inspect(error, { depth: 10 });
        for (const secret of [URL, TEXT, row.encrypted_payload_json.data]) assert.ok(!rendered.includes(secret));
        assert.ok(!rendered.includes('STORAGE_'));
        return true;
      });
    }
    assert.deepEqual(await rawCheckpoint(identity.creationId), corrupted, 'unreadable evidence must not be replaced');
  }
});

pgTest('ciphertext copied between checkpoints or paired with altered row identity/stage is unreadable', async () => {
  const first = await fixture();
  const second = await fixture();
  await save(first);
  await save(second);
  const original = await rawCheckpoint(first.creationId);
  await db.execute('UPDATE ai_studio.generation_result_checkpoints SET encrypted_payload_json = $2::jsonb WHERE creation_id = $1', [second.creationId, JSON.stringify(original.encrypted_payload_json)]);
  await assert.rejects(results.getGenerationResult(second.creationId), { code: 'GENERATION_RESULT_UNREADABLE' });
  for (const [column, value] of [
    ['attempt_id', null], ['provider_id', 'tampered-provider'], ['provider_request_id', 'tampered-receipt'], ['stage', 'archived'],
  ]) {
    await db.execute(`UPDATE ai_studio.generation_result_checkpoints SET ${column} = $2 WHERE creation_id = $1`, [first.creationId, value]);
    await assert.rejects(results.getGenerationResult(first.creationId), { code: 'GENERATION_RESULT_UNREADABLE' });
    await db.execute(`UPDATE ai_studio.generation_result_checkpoints SET ${column} = $2 WHERE creation_id = $1`, [first.creationId, original[column]]);
  }
});

pgTest('a wrong decryption key yields only GENERATION_RESULT_UNREADABLE and cannot overwrite the evidence', async () => {
  const identity = await fixture();
  await save(identity);
  const original = await rawCheckpoint(identity.creationId);
  try {
    process.env.STORAGE_SECRETS_ENCRYPTION_KEY = 'wrong-isolated-test-key';
    for (const operation of [() => results.getGenerationResult(identity.creationId), () => save(identity), () => archive(identity)]) {
      await assert.rejects(operation(), { code: 'GENERATION_RESULT_UNREADABLE' });
    }
    assert.deepEqual(await rawCheckpoint(identity.creationId), original);
  } finally {
    process.env.STORAGE_SECRETS_ENCRYPTION_KEY = TEST_KEY;
  }
  assert.deepEqual(await results.getGenerationResult(identity.creationId), expected(identity));
});

pgTest('save and archival participate in caller transactions, including reads, scheduling and rollback', async () => {
  const identity = await fixture({ providerRequestId: null });
  await db.execute(`UPDATE ai_studio.creations SET next_poll_at = NOW() + INTERVAL '1 hour', poll_locked_until = NOW() + INTERVAL '10 minutes' WHERE id = $1`, [identity.creationId]);
  const before = await creationState(identity.creationId);
  const abort = () => { throw Object.assign(new Error('Abort isolated checkpoint transaction'), { code: 'CHECKPOINT_TEST_ROLLBACK' }); };
  await assert.rejects(db.withTransaction(async (transaction) => {
    const saved = await save({ ...identity, transaction });
    assert.deepEqual(await results.getGenerationResult(identity.creationId, transaction), saved);
    assert.equal(await results.getGenerationResult(identity.creationId), null, 'uncommitted evidence is not visible outside the transaction');
    const archived = await archive({ ...identity, transaction });
    assert.deepEqual(await results.getGenerationResult(identity.creationId, transaction), archived);
    abort();
  }), { code: 'CHECKPOINT_TEST_ROLLBACK' });
  assert.equal(await rawCheckpoint(identity.creationId), null);
  assert.deepEqual(await creationState(identity.creationId), before);

  await db.withTransaction((transaction) => save({ ...identity, transaction }));
  const original = await rawCheckpoint(identity.creationId);
  await db.execute(`UPDATE ai_studio.creations SET next_poll_at = NOW() + INTERVAL '1 hour' WHERE id = $1`, [identity.creationId]);
  const beforeArchive = await creationState(identity.creationId);
  await assert.rejects(db.withTransaction(async (transaction) => {
    await archive({ ...identity, transaction });
    abort();
  }), { code: 'CHECKPOINT_TEST_ROLLBACK' });
  assert.deepEqual(await rawCheckpoint(identity.creationId), original);
  assert.deepEqual(await creationState(identity.creationId), beforeArchive);
  await db.withTransaction((transaction) => archive({ ...identity, transaction }));
  assert.equal((await results.getGenerationResult(identity.creationId)).stage, 'archived');
});

pgTest('parent state is rechecked under the creation lock after a competing terminal transition', async () => {
  const identity = await fixture();
  let release;
  let locked;
  const released = new Promise((resolve) => { release = resolve; });
  const acquired = new Promise((resolve) => { locked = resolve; });
  const terminal = db.withTransaction(async (transaction) => {
    await transaction.execute("UPDATE ai_studio.creations SET status = 'succeeded' WHERE id = $1", [identity.creationId]);
    locked();
    await released;
  });
  await acquired;
  const saving = save(identity);
  release();
  await terminal;
  assert.equal(await saving, null);
  assert.equal(await rawCheckpoint(identity.creationId), null);
});

pgTest('schema foreign keys retain attempt identity and cascade only with creation deletion', async () => {
  const identity = await fixture();
  await save(identity);
  const original = await rawCheckpoint(identity.creationId);
  await assert.rejects(db.execute('DELETE FROM ai_studio.generation_attempts WHERE id = $1', [identity.attemptId]), { code: '23503' });
  assert.deepEqual(await rawCheckpoint(identity.creationId), original);
  await assert.rejects(db.execute("UPDATE ai_studio.generation_result_checkpoints SET stage = 'failed' WHERE creation_id = $1", [identity.creationId]), { code: '23514' });
  await db.execute('DELETE FROM ai_studio.creations WHERE id = $1', [identity.creationId]);
  assert.equal(await rawCheckpoint(identity.creationId), null);
});
