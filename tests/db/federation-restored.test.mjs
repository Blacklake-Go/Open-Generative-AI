import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, scryptSync } from 'node:crypto';

if (process.env.SUPDANCE_RESTORED_DRILL !== 'true' || new URL(process.env.DATABASE_URL).hostname !== 'one-db') {
  throw new Error('This test only runs against the named isolated restored ONE database.');
}
const db = await import('../../lib/db/index.js');
const accounts = await import('../../lib/federation/accounts.js');
const { snapshotLegacyFinance } = await import('../../lib/federation/legacyFinance.js');
const { signTicket } = await import('../../lib/federation/ticket.js');
const { allocateUserId } = await import('../../lib/auth/user-id.js');
const repo = await import('../../lib/repositories/auth.js');

async function seedUser() {
  const id = await allocateUserId({ reserve: (value, digits) => repo.reserveUserId(value, digits),
    findFirstAvailable: (digits) => repo.findFirstAvailableUserId(digits), isExhausted: (digits) => repo.isUserIdPoolExhausted(digits) });
  const salt = 'isolated-fixture-salt';
  await db.execute(`INSERT INTO auth_usr.users(id,email,password_hash,password_salt,role,credits,status)
    VALUES($1,$2,$3,$4,'user',0,'active')`, [id, `${id}@example.test`, scryptSync('isolated-test-password', salt, 64).toString('hex'), salt]);
  return { id };
}

async function sourceFingerprints() {
  const result = [];
  for (const [table, key] of [['ops_bill.credit_wallets', 'user_id'], ['ops_bill.credit_ledger', 'id'], ['ops_bill.credit_ledger_v2', 'id'],
    ['ops_bill.credit_reservations', 'id'], ['ops_bill.credit_returned_lots', 'id'], ['ops_bill.currency_wallets', 'user_id'], ['ops_bill.currency_journal_entries', 'id']]) {
    result.push(await db.queryOne(`SELECT '${table}' AS source,count(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY ${key}),'')) AS fingerprint FROM ${table} t`));
  }
  return result;
}

test('restored finance provenance is repeatable and preserves every original financial row', async () => {
  const before = await sourceFingerprints();
  await db.execute(await readFile('lib/db/migrations/088_supdance_federation.sql', 'utf8'));
  const first = await snapshotLegacyFinance();
  const second = await snapshotLegacyFinance();
  assert.ok(first.some((source) => source.sourceRows > 0), 'must use nonempty restored financial data');
  assert.ok(first.every((source) => source.sourceRows === source.inserted));
  assert.ok(second.every((source) => source.inserted === 0));
  assert.deepEqual(await sourceFingerprints(), before);
  assert.equal((await db.queryOne(`SELECT count(*)::int AS count FROM supdance_federation.legacy_finance_snapshots
    WHERE source_kind='currency_wallet' AND (source_payload ? 'pay_password_hash' OR source_payload ? 'pay_password_salt')`)).count, 0);
  console.log(JSON.stringify({ restored_finance: first, second_sync_inserted: 0, original_rows_unchanged: true }));
});

test('account mapping proves both owners, rejects session swapping, replay and conflicting links', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'supdance-federation-test-'));
  const oneKeys = generateKeyPairSync('ed25519');
  const mainKeys = generateKeyPairSync('ed25519');
  const onePrivate = oneKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const mainPrivate = mainKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  await writeFile(join(dir, 'one-private.pem'), onePrivate, { mode: 0o600 });
  await writeFile(join(dir, 'main-public.pem'), mainKeys.publicKey.export({ type: 'spki', format: 'pem' }));
  process.env.SUPDANCE_FEDERATION_PRIVATE_KEY_FILE = join(dir, 'one-private.pem');
  process.env.SUPDANCE_FEDERATION_MAIN_PUBLIC_KEY_FILE = join(dir, 'main-public.pem');
  process.env.SUPDANCE_FEDERATION_ENABLED = 'true';
  const a = await seedUser(); const b = await seedUser();
  process.env.SUPDANCE_FEDERATION_ONE_USER_IDS = `${a.id},${b.id}`;
  const before = await sourceFingerprints();
  try {
    await assert.rejects(() => accounts.beginAccountLink(a, 'session-a', 'wrong'), { code: 'REAUTH_REQUIRED' });
    const started = await accounts.beginAccountLink(a, 'session-a', 'isolated-test-password');
    assert.ok(started.authorizeUrl.startsWith('https://www.supdance.com/connect-one#'));
    const nonce = JSON.parse(Buffer.from(started.request.split('.')[1], 'base64url')).nonce;
    const now = Math.floor(Date.now() / 1000);
    const proof = signTicket({ version: 1, issuer: 'main', audience: 'one', purpose: 'identity-assertion', nonce,
      oneUserId: a.id, mainUserId: 'isolated-main-a', issuedAt: now, expiresAt: now + 60 }, mainPrivate);
    await assert.rejects(() => accounts.completeAccountLink(b, 'session-a', proof), { code: 'IDENTITY_OWNER_MISMATCH' });
    await assert.rejects(() => accounts.completeAccountLink(a, 'session-b', proof), { code: 'LINK_CHALLENGE_INVALID' });
    const concurrent = await Promise.allSettled([accounts.completeAccountLink(a, 'session-a', proof), accounts.completeAccountLink(a, 'session-a', proof)]);
    assert.equal(concurrent.filter((value) => value.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter((value) => value.status === 'rejected').length, 1);
    assert.equal((await db.queryOne('SELECT count(*)::int count FROM supdance_federation.identity_events WHERE one_user_id=$1', [a.id])).count, 1);
    const next = await accounts.beginAccountLink(b, 'session-b', 'isolated-test-password');
    const nextNonce = JSON.parse(Buffer.from(next.request.split('.')[1], 'base64url')).nonce;
    const conflict = signTicket({ version: 1, issuer: 'main', audience: 'one', purpose: 'identity-assertion', nonce: nextNonce,
      oneUserId: b.id, mainUserId: 'isolated-main-a', issuedAt: now, expiresAt: now + 60 }, mainPrivate);
    await assert.rejects(() => accounts.completeAccountLink(b, 'session-b', conflict), { code: 'IDENTITY_ALREADY_LINKED' });
    assert.equal((await db.queryOne('SELECT count(*)::int count FROM supdance_federation.identity_links')).count, 1);
    assert.deepEqual(await sourceFingerprints(), before);
    const { requireLegacyTransactionAuthority } = await import('../../lib/federation/transactionAuthority.js');
    await assert.rejects(() => requireLegacyTransactionAuthority(a.id), {code:'MAIN_WALLET_REQUIRED'});
    await requireLegacyTransactionAuthority(b.id);
    await db.execute("UPDATE supdance_federation.identity_links SET state='suspended' WHERE one_user_id=$1",[a.id]);
    await assert.rejects(() => requireLegacyTransactionAuthority(a.id), {code:'MAIN_WALLET_REQUIRED'});
    await db.execute("UPDATE supdance_federation.identity_links SET state='active' WHERE one_user_id=$1",[a.id]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test.after(async () => { await db.closePgPool(); });

test('main-site SSO is browser-bound, reuses the canonical identity and never auto-merges or grants credits', async () => {
  const { beginMainLogin, completeMainLogin } = await import('../../lib/federation/login.js');
  const dir = await mkdtemp(join(tmpdir(), 'supdance-sso-test-'));
  const oneKeys = generateKeyPairSync('ed25519'); const mainKeys = generateKeyPairSync('ed25519');
  await writeFile(join(dir, 'one-private.pem'), oneKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  await writeFile(join(dir, 'main-public.pem'), mainKeys.publicKey.export({ type: 'spki', format: 'pem' }));
  process.env.SUPDANCE_FEDERATION_ENABLED = 'true';
  process.env.SUPDANCE_FEDERATION_PRIVATE_KEY_FILE = join(dir, 'one-private.pem');
  process.env.SUPDANCE_FEDERATION_MAIN_PUBLIC_KEY_FILE = join(dir, 'main-public.pem');
  process.env.SUPDANCE_FEDERATION_MAIN_USER_IDS = 'main-sso-fixture';
  const mainPrivate = mainKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const legacy = await seedUser();
  const before = await sourceFingerprints();
  const starts = await Promise.all([beginMainLogin(), beginMainLogin()]);
  const proofs = starts.map((started) => {
    const request = new URL(started.authorizeUrl).hash.slice('#request='.length);
    const nonce = JSON.parse(Buffer.from(decodeURIComponent(request).split('.')[1], 'base64url')).nonce;
    const now = Math.floor(Date.now() / 1000);
    return signTicket({ version: 1, issuer: 'main', audience: 'one', purpose: 'login-assertion', nonce, oneUserId: '',
      mainUserId: 'main-sso-fixture', mainDisplayName: 'Canonical creator', issuedAt: now, expiresAt: now + 60 }, mainPrivate);
  });
  try {
    await assert.rejects(() => completeMainLogin('wrong-browser', proofs[0]), { code: 'LINK_CHALLENGE_INVALID' });
    const ids = await Promise.all(starts.map((value, index) => completeMainLogin(value.browserToken, proofs[index])));
    assert.equal(ids[0], ids[1]);
    assert.notEqual(ids[0], legacy.id);
    await assert.rejects(() => completeMainLogin(starts[0].browserToken, proofs[0]), { code: 'LINK_CHALLENGE_INVALID' });
    const row = await db.queryOne('SELECT role,credits,email,registration_source,onboarding_completed FROM auth_usr.users WHERE id=$1', [ids[0]]);
    assert.equal(BigInt(row.credits), 0n);
    assert.deepEqual({ ...row, credits: '0' }, { role: 'user', credits: '0', email: null, registration_source: 'supdance_main', onboarding_completed: true });
    assert.equal((await db.queryOne("SELECT count(*)::int count FROM auth_usr.auth_accounts WHERE user_id=$1 AND provider='supdance_main'", [ids[0]])).count, 1);
    assert.deepEqual(await sourceFingerprints(), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
