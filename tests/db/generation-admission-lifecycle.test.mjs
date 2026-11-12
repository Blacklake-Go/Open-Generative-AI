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
const fixtures = [];
test.afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    await db.execute('DELETE FROM ai_studio.creations WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM ai_studio.generation_quotes WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [f.userId]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [f.userId]);
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id=$1', [f.modelId]);
  }
});

async function fixture() {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const { grantPerpetualCredits } = await import('../../lib/financial/creditService.js');
  const userId = await allocateUserId({ reserve: auth.reserveUserId, findFirstAvailable: auth.findFirstAvailableUserId, isExhausted: auth.isUserIdPoolExhausted });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const modelId = `admission_${suffix}`;
  fixtures.push({ userId, modelId });
  await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status) VALUES($1,$2,'user',0,'active')`, [userId, `${userId}@admission.test`]);
  await db.execute(`INSERT INTO ai_studio.ai_models(id,slug,name,display_name,category,status,tier,is_visible)
    VALUES($1,$1,'Admission fixture','Admission fixture','video','active','core',TRUE)`, [modelId]);
  await grantPerpetualCredits(userId, 100, 'isolated fixture', userId, `seed_${suffix}`);
  return { userId, modelId, suffix };
}

test('distinct billable requests share one atomic user concurrency admission and preserve retries', { skip: !testUrl }, async () => {
  const { createGenerationTask } = await import('../../lib/services/generationCore.js');
  const f = await fixture();
  const requests = [];
  for (const i of [1, 2]) {
    const quoteId = `quote_${f.suffix}_${i}`;
    await db.execute(`INSERT INTO ai_studio.generation_quotes(id,user_id,model_id,parameters_json,credits_quoted,pricing_breakdown_json,expires_at,created_at)
      VALUES($1,$2,$3,'{}'::jsonb,10,'{}'::jsonb,now()+interval '5 minutes',now())`, [quoteId, f.userId, f.modelId]);
    requests.push({ userId: f.userId, modelId: f.modelId, prompt: 'isolated fixture', quoteId, idempotencyKey: `task_${f.suffix}_${i}`, requirePublicAvailability: false });
  }
  const results = await Promise.allSettled(requests.map((input) => createGenerationTask(input)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.equal(rejected.reason.code, 'USER_CONCURRENCY_EXCEEDED');
  const wallet = await db.queryOne('SELECT frozen_credits,perpetual_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [f.userId]);
  assert.equal(Number(wallet.frozen_credits), 10);
  assert.equal(Number(wallet.perpetual_credits), 90);
  const winner = results.findIndex((r) => r.status === 'fulfilled');
  const retry = await createGenerationTask(requests[winner]);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.creation.id, results[winner].value.creation.id);
  for (const changed of [{prompt:'another requested output'},{parameters:{resolution:'1080p'}},{modelId:'another-model'}]) {
    await assert.rejects(createGenerationTask({...requests[winner],...changed}),{code:'GENERATION_IDEMPOTENCY_CONFLICT'});
  }
  assert.equal(Number((await db.queryOne('SELECT frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1',[f.userId])).frozen_credits),10);
  const quote = await db.queryOne('SELECT consumed_at FROM ai_studio.generation_quotes WHERE id=$1', [requests[1 - winner].quoteId]);
  assert.equal(quote.consumed_at, null);
});

test('reservation expiry and task timeout cannot release an acknowledged upstream video', { skip: !testUrl }, async () => {
  const { reserveCredits, cleanupExpiredReservations, commitCredits } = await import('../../lib/financial/creditService.js');
  const { expireStaleGenerationTasks } = await import('../../lib/services/generationCore.js');
  const f = await fixture();
  const r = await reserveCredits({ userId: f.userId, amount: 10, modelId: f.modelId, studioId: 'video', idempotencyKey: `reserve_${f.suffix}` });
  const id = `video_${f.suffix}`;
  await db.execute(`INSERT INTO ai_studio.creations(id,user_id,studio_id,status,credit_cost,provider,model,started_at,created_at,updated_at,reservation_id,provider_request_id,input_summary_json)
    VALUES($1,$2,'video','processing',10,'muapi',$3,now()-interval '16 minutes',now()-interval '16 minutes',now()-interval '16 minutes',$4,'fixture-accepted','{"modelType":"video"}'::jsonb)`, [id, f.userId, f.modelId, r.reservationId]);
  await db.execute(`UPDATE ops_bill.credit_reservations SET creation_id=$2,expires_at=now()-interval '1 minute' WHERE id=$1`, [r.reservationId, id]);
  await cleanupExpiredReservations();
  let reservation = await db.queryOne('SELECT status FROM ops_bill.credit_reservations WHERE id=$1', [r.reservationId]);
  assert.equal(reservation.status, 'RESERVED', 'TTL is not evidence of provider failure');
  await db.execute(`UPDATE ai_studio.creations SET started_at=now()-interval '31 minutes',updated_at=now()-interval '31 minutes' WHERE id=$1`, [id]);
  await expireStaleGenerationTasks();
  await expireStaleGenerationTasks();
  const creation = await db.queryOne('SELECT status FROM ai_studio.creations WHERE id=$1', [id]);
  assert.equal(creation.status, 'processing');
  reservation = await db.queryOne('SELECT status FROM ops_bill.credit_reservations WHERE id=$1', [r.reservationId]);
  assert.equal(reservation.status, 'RESERVED');
  const events = await db.queryMany(`SELECT id FROM ai_studio.generation_events WHERE creation_id=$1 AND event_type='TASK_RECONCILIATION_REQUIRED'`, [id]);
  assert.equal(events.length, 1);
  const settled = await commitCredits({ reservationId: r.reservationId, creationId: id, expectedUserId: f.userId });
  assert.equal(settled.status, 'COMMITTED');
});

test('expired standalone reservations are released once while queued task funds remain reserved', { skip: !testUrl }, async () => {
  const { reserveCredits, cleanupExpiredReservations } = await import('../../lib/financial/creditService.js');
  const f = await fixture();
  const r = await reserveCredits({ userId: f.userId, amount: 10, modelId: f.modelId, idempotencyKey: `standalone_${f.suffix}` });
  await db.execute(`UPDATE ops_bill.credit_reservations SET expires_at=now()-interval '1 minute' WHERE id=$1`, [r.reservationId]);
  await cleanupExpiredReservations();
  await cleanupExpiredReservations();
  const row = await db.queryOne('SELECT status FROM ops_bill.credit_reservations WHERE id=$1', [r.reservationId]);
  assert.equal(row.status, 'VOIDED');
  const ledger = await db.queryOne(`SELECT count(*)::int AS count FROM ops_bill.credit_ledger_v2 WHERE reference_id=$1 AND action_type='TASK_RELEASE'`, [r.reservationId]);
  assert.equal(ledger.count, 1);
});
