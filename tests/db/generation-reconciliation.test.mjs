import test from 'node:test';
import assert from 'node:assert/strict';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) { requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL); process.env.DATABASE_URL = testUrl; }
const db = testUrl ? await import('../../lib/db/index.js') : null;
test.after(async () => { if (db) await db.closePgPool(); });

test('reconciliation requires privileges and terminal evidence, restores original expiry, and never releases twice', { skip: !testUrl }, async () => {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const { reserveCredits, getCreditWallet } = await import('../../lib/financial/creditService.js');
  const { reconcileGeneration, listGenerationReconciliations } = await import('../../lib/services/generationReconciliation.js');
  const id = await allocateUserId({ reserve: auth.reserveUserId, findFirstAvailable: auth.findFirstAvailableUserId, isExhausted: auth.isUserIdPoolExhausted });
  const job = `reconcile_${id}_${Date.now()}`;
  let reservation;
  try {
    await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status) VALUES($1,$2,'user',0,'active')`, [id, `${id}@reconciliation.test`]);
    await db.execute(`INSERT INTO ops_bill.credit_wallets(user_id,daily_free_credits,daily_expires_at) VALUES($1,10,now()+interval '1 hour')`, [id]);
    reservation = await reserveCredits({ userId:id, amount:10, modelId:'fixture', idempotencyKey:job });
    await db.execute(`INSERT INTO ai_studio.creations(id,user_id,studio_id,status,credit_cost,model,reservation_id,started_at)
      VALUES($1,$2,'canvas','processing',10,'fixture',$3,now())`, [job,id,reservation.reservationId]);
    await db.execute(`UPDATE ops_bill.credit_reservations SET bucket_allocations_json=NULL,
      created_at=now()-interval '2 days',creation_id=$2 WHERE id=$1`, [reservation.reservationId,job]);
    const input = { creationId:job, reservationId:reservation.reservationId, action:'confirm_failure', idempotencyKey:job,
      evidence:{kind:'not_submitted',reference:'provider-case-123',observedAt:new Date().toISOString()} };
    await assert.rejects(reconcileGeneration({...input,actor:{id,role:'user'}}),{code:'FORBIDDEN'});
    await assert.rejects(reconcileGeneration({...input,actor:{id,role:'operations_admin'}}),{code:'FORBIDDEN'});
    await assert.rejects(reconcileGeneration({...input,actor:{id,role:'admin'}}),{code:'RECONCILIATION_EVIDENCE_REQUIRED'});
    assert.equal((await getCreditWallet(id)).frozenCredits,10);
    const queue = await listGenerationReconciliations({limit:100});
    assert.ok(queue.rows.some(row => row.creation_id===job && row.needs_expiry_evidence));
    const expired = new Date(Date.now()-86400000).toISOString();
    const complete = {...input,actor:{id,role:'admin'},originalExpiries:{daily:{kind:'expires',expiresAt:expired}}};
    const resolved = await reconcileGeneration(complete);
    assert.equal(resolved.status,'failed');
    assert.equal(resolved.expiredAmount,10);
    assert.equal(resolved.releasedAmount,0);
    assert.equal((await getCreditWallet(id)).frozenCredits,0);
    assert.equal((await getCreditWallet(id)).totalAvailable,0);
    assert.equal((await reconcileGeneration(complete)).idempotent,true);
    assert.equal((await db.queryOne(`SELECT count(*)::int AS n FROM ops_bill.credit_ledger_v2 WHERE reference_id=$1 AND action_type='TASK_RELEASE'`,[reservation.reservationId])).n,1);
    assert.equal((await db.queryOne(`SELECT count(*)::int AS n FROM ops_bill.admin_audit_logs WHERE target_id=$1 AND action='generation.reconciliation_confirm_failure'`,[job])).n,1);
  } finally {
    await db.execute('DELETE FROM ops_bill.admin_audit_logs WHERE target_id=$1',[job]);
    await db.execute('DELETE FROM ai_studio.creations WHERE id=$1',[job]);
    await db.execute('DELETE FROM ops_bill.credit_returned_lots WHERE user_id=$1',[id]);
    await db.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id=$1',[id]);
    await db.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id=$1',[id]);
    await db.execute('DELETE FROM auth_usr.users WHERE id=$1',[id]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1',[id]);
  }
});
