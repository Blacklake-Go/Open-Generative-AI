import test from 'node:test';
import assert from 'node:assert/strict';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL);
  process.env.DATABASE_URL = testUrl;
}
const db = testUrl ? await import('../../lib/db/index.js') : null;
test.after(async () => { if (db) await db.closePgPool(); });
const users = [];
test.afterEach(async () => {
  for (const id of users.splice(0)) {
    await db.execute('DELETE FROM ops_bill.credit_returned_lots WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id=$1', [id]);
    await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [id]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [id]);
  }
});

async function fixture(legacyCredits = 0) {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const id = await allocateUserId({ reserve: auth.reserveUserId, findFirstAvailable: auth.findFirstAvailableUserId, isExhausted: auth.isUserIdPoolExhausted });
  users.push(id);
  await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status) VALUES($1,$2,'user',$3,'active')`, [id, `${id}@release-expiry.test`, legacyCredits]);
  return id;
}

test('old expired daily and subscription reservations never inflate a replenished cycle', { skip: !testUrl }, async () => {
  const { reserveCredits, voidCredits, getCreditWallet } = await import('../../lib/financial/creditService.js');
  const id = await fixture();
  await db.execute(`INSERT INTO ops_bill.credit_wallets(user_id,daily_free_credits,subscription_credits,daily_expires_at,subscription_expires_at)
    VALUES($1,10,10,now()+interval '1 hour',now()+interval '1 hour')`, [id]);
  const reserved = await reserveCredits({ userId: id, amount: 20, modelId: 'fixture', idempotencyKey: `expiry_${id}` });
  // Advance the original batch's expiry in the persisted fixture, then create the next cycle.
  await db.execute(`UPDATE ops_bill.credit_reservations SET bucket_allocations_json=(
    SELECT jsonb_agg(jsonb_set(value,'{expiresAt}',to_jsonb((now()-interval '1 day')::text)))
    FROM jsonb_array_elements(bucket_allocations_json)) WHERE id=$1`, [reserved.reservationId]);
  await db.execute(`UPDATE ops_bill.credit_wallets SET daily_free_credits=10,subscription_credits=10,
    daily_expires_at=now()+interval '2 hours',subscription_expires_at=now()+interval '2 hours' WHERE user_id=$1`, [id]);
  const release = await voidCredits({ reservationId: reserved.reservationId });
  assert.equal(release.expiredAmount, 20);
  assert.equal(release.releasedAmount, 0);
  const wallet = await getCreditWallet(id);
  assert.equal(wallet.dailyFree, 10);
  assert.equal(wallet.subscriptionCredits, 10);
  assert.equal(wallet.frozenCredits, 0);
  assert.equal(Number((await db.queryOne('SELECT credits FROM auth_usr.users WHERE id=$1', [id])).credits), 20);
  const entries = await db.queryMany(`SELECT action_type,SUM(delta)::int AS delta FROM ops_bill.credit_ledger_v2
    WHERE reference_id=$1 GROUP BY action_type`, [reserved.reservationId]);
  assert.deepEqual(Object.fromEntries(entries.map((r) => [r.action_type, r.delta])), { TASK_RESERVE: -20, TASK_RELEASE: 20, CREDIT_EXPIRE: -20 });
  await voidCredits({ reservationId: reserved.reservationId });
  assert.equal((await getCreditWallet(id)).totalAvailable, 20);
});

test('valid releases retain their original expiry and are spent before later batches', { skip: !testUrl }, async () => {
  const { reserveCredits, voidCredits, getCreditWallet } = await import('../../lib/financial/creditService.js');
  const id = await fixture();
  const expiry = new Date(Date.now() + 3600000).toISOString();
  await db.execute(`INSERT INTO ops_bill.credit_wallets(user_id,daily_free_credits,daily_expires_at) VALUES($1,10,$2)`, [id, expiry]);
  const first = await reserveCredits({ userId: id, amount: 10, modelId: 'fixture', idempotencyKey: `first_${id}` });
  await db.execute(`UPDATE ops_bill.credit_wallets SET daily_free_credits=10,daily_expires_at=now()+interval '2 hours' WHERE user_id=$1`, [id]);
  await voidCredits({ reservationId: first.reservationId });
  let wallet = await getCreditWallet(id);
  assert.equal(wallet.dailyFree, 20);
  assert.equal(new Date(wallet.returnedLots[0].expiresAt).toISOString(), expiry);
  const next = await reserveCredits({ userId: id, amount: 5, modelId: 'fixture', idempotencyKey: `next_${id}` });
  const row = await db.queryOne('SELECT bucket_allocations_json FROM ops_bill.credit_reservations WHERE id=$1', [next.reservationId]);
  assert.equal(row.bucket_allocations_json[0].source, 'returned');
  assert.equal(row.bucket_allocations_json[0].expiresAt, expiry);
  assert.equal((await db.queryOne('SELECT daily_free_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [id])).daily_free_credits, 10);
  await voidCredits({ reservationId: next.reservationId });
  wallet = await getCreditWallet(id);
  assert.equal(wallet.dailyFree, 20);
  assert.equal(wallet.frozenCredits, 0);
  assert.ok(wallet.returnedLots.every((lot) => new Date(lot.expiresAt).toISOString() === expiry));
  assert.equal(Number((await db.queryOne('SELECT credits FROM auth_usr.users WHERE id=$1', [id])).credits), 20);
});

test('legacy expiring reservations without evidence preserve their frozen amount', { skip: !testUrl }, async () => {
  const { reserveCredits, voidCredits } = await import('../../lib/financial/creditService.js');
  const id = await fixture();
  await db.execute(`INSERT INTO ops_bill.credit_wallets(user_id,daily_free_credits,daily_expires_at) VALUES($1,10,now()+interval '1 hour')`, [id]);
  const reserved = await reserveCredits({ userId: id, amount: 10, modelId: 'fixture', idempotencyKey: `legacy_${id}` });
  await db.execute('UPDATE ops_bill.credit_reservations SET bucket_allocations_json=NULL WHERE id=$1', [reserved.reservationId]);
  await assert.rejects(voidCredits({ reservationId: reserved.reservationId }), { code: 'CREDIT_RELEASE_CONTEXT_REQUIRED' });
  assert.equal((await db.queryOne('SELECT status FROM ops_bill.credit_reservations WHERE id=$1', [reserved.reservationId])).status, 'RESERVED');
  assert.equal((await db.queryOne('SELECT frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [id])).frozen_credits, 10);
});

test('expired wallet and returned batches enter the ledger once without releasing active reservations', {skip:!testUrl}, async()=>{
  const {reserveCredits,voidCredits,getCreditWallet}=await import('../../lib/financial/creditService.js');
  const id=await fixture();
  await db.execute(`INSERT INTO ops_bill.credit_wallets(user_id,daily_free_credits,subscription_credits,perpetual_credits,daily_expires_at,subscription_expires_at)
    VALUES($1,12,8,5,now()+interval '1 hour',now()+interval '1 hour')`,[id]);
  const first=await reserveCredits({userId:id,amount:10,modelId:'fixture',idempotencyKey:`expiry_release_${id}`});
  await voidCredits({reservationId:first.reservationId});
  await db.execute("UPDATE ops_bill.credit_wallets SET daily_expires_at=now()-interval '1 second',subscription_expires_at=now()-interval '1 second' WHERE user_id=$1",[id]);
  await db.execute("UPDATE ops_bill.credit_returned_lots SET expires_at=now()-interval '1 second' WHERE user_id=$1",[id]);
  const pending=await reserveCredits({userId:id,amount:3,modelId:'fixture',idempotencyKey:`expiry_frozen_${id}`});
  const wallets=await Promise.all([getCreditWallet(id),getCreditWallet(id)]);
  for(const wallet of wallets){assert.equal(wallet.totalAvailable,2);assert.equal(wallet.frozenCredits,3);}
  const journal=await db.queryOne("SELECT COUNT(*)::int AS count,SUM(delta)::int AS amount FROM ops_bill.credit_ledger_v2 WHERE user_id=$1 AND action_type='CREDIT_EXPIRE'",[id]);
  assert.equal(journal.count,3);assert.equal(journal.amount,-20);
  assert.equal(Number((await db.queryOne('SELECT SUM(remaining_credits) AS remaining FROM ops_bill.credit_returned_lots WHERE user_id=$1',[id])).remaining),0);
  assert.equal(Number((await db.queryOne('SELECT credits FROM auth_usr.users WHERE id=$1',[id])).credits),2);
  await voidCredits({reservationId:pending.reservationId});
  assert.equal((await getCreditWallet(id)).totalAvailable,5);
  assert.equal((await db.queryOne("SELECT COUNT(*)::int AS count FROM ops_bill.credit_ledger_v2 WHERE user_id=$1 AND action_type='CREDIT_EXPIRE'",[id])).count,3);
});

test('legacy balances survive first reserve and grant, and concurrent check-ins grant once', { skip: !testUrl }, async () => {
  const { reserveCredits, voidCredits, grantPerpetualCredits, dailyCheckIn, getCreditWallet } = await import('../../lib/financial/creditService.js');
  const id = await fixture(100);
  const first = await reserveCredits({ userId: id, amount: 10, modelId: 'fixture', idempotencyKey: `bootstrap_${id}` });
  assert.equal((await getCreditWallet(id)).totalAvailable, 90);
  await voidCredits({ reservationId: first.reservationId });
  assert.equal((await getCreditWallet(id)).totalAvailable, 100);
  const second = await fixture(100);
  await grantPerpetualCredits(second, 5, 'fixture');
  assert.equal((await getCreditWallet(second)).totalAvailable, 105);
  const checks = await Promise.allSettled([dailyCheckIn(second), dailyCheckIn(second)]);
  assert.equal(checks.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await db.queryOne(`SELECT count(*)::int AS n FROM ops_bill.credit_ledger_v2 WHERE user_id=$1 AND action_type='DAILY_CHECKIN'`, [second])).n, 1);
});
