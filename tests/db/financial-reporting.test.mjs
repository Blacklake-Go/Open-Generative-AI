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

test('financial reports combine each actual or estimated record, retain locked FX, and keep missing costs unknown', { skip: !testUrl }, async () => {
  const { getCostReport, getProfitReport } = await import('../../lib/admin/financialReporting.js');
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const auth = await import('../../lib/repositories/auth.js');
  const userId = await allocateUserId({ reserve: auth.reserveUserId, findFirstAvailable: auth.findFirstAvailableUserId, isExhausted: auth.isUserIdPoolExhausted });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const model = `report_${suffix}`, job = `report_job_${suffix}`;
  try {
    await db.execute(`INSERT INTO auth_usr.users(id,email,role,credits,status) VALUES($1,$2,'user',0,'active')`, [userId, `${userId}@report.test`]);
    await db.execute(`INSERT INTO ai_studio.ai_models(id,slug,name,display_name,category,status,tier,is_visible)
      VALUES($1,$1,'Reporting fixture','Reporting fixture','image','active','experimental',FALSE)`, [model]);
    await db.execute(`INSERT INTO ai_studio.model_pricing(id,model_id,pricing_type,base_credits,is_active) VALUES($1,$2,'fixed',100,TRUE)`, [`price_${suffix}`, model]);
    const { getModelPricingBreakdownList } = await import('../../lib/modelCenter/pricingMatrix.js');
    const matrix = (await getModelPricingBreakdownList()).find((row) => row.modelId === model);
    assert.equal(matrix.userPriceCny, 7, 'admin credit conversion matches runtime pricing policy');
    await db.execute(`INSERT INTO ai_studio.creations(id,user_id,studio_id,status,credit_cost,model)
      VALUES($1,$2,'image','succeeded',100,$3)`, [job, userId, model]);
    const insert = (id, actual, estimated, fx) => db.execute(`INSERT INTO ai_studio.provider_cost_records
      (id,job_id,provider_id,model_id,credits_charged,actual_cost_usd,estimated_cost_usd,fx_snapshot_json)
      VALUES($1,$2,'muapi',$3,100,$4,$5,$6::jsonb)`, [id, job, model, actual, estimated, JSON.stringify(fx)]);
    await insert(`actual_${suffix}`, 1, 9, { usdToCny: 6 });
    await insert(`estimate_${suffix}`, null, 2, { rates: { USD_CNY: 7 } });
    let costs = (await getCostReport()).find((row) => row.model_id === model);
    assert.equal(Number(costs.total_cost_usd), 3, 'one actual must not hide a different record’s estimate');
    assert.equal(Number(costs.confirmed_cost_usd), 1);
    assert.equal(Number(costs.total_cost_cny), 20, 'each cost retains its own historical FX');
    assert.equal(costs.pending_reconciliation, 1);
    let profit = (await getProfitReport()).find((row) => row.model_id === model);
    assert.equal(Number(profit.revenue_cny), 7);
    assert.equal(Number(profit.gross_profit_cny), -13);
    assert.equal(profit.pending_reconciliation, 1);

    await db.execute(`UPDATE ai_studio.provider_cost_records SET fx_snapshot_json='{}'::jsonb WHERE id=$1`, [`estimate_${suffix}`]);
    costs = (await getCostReport()).find((row) => row.model_id === model);
    profit = (await getProfitReport()).find((row) => row.model_id === model);
    assert.equal(costs.total_cost_cny, null);
    assert.equal(profit.gross_profit_cny, null);
    assert.equal(profit.gross_margin_pct, null);
    assert.equal(profit.unknown_cost_count, 1);
    assert.equal(Number(profit.cost_usd), 3);

    await insert(`unknown_${suffix}`, null, null, { usdToCny: 7 });
    costs = (await getCostReport()).find((row) => row.model_id === model);
    assert.equal(costs.total_cost_usd, null);
    assert.equal(costs.unknown_cost_count, 1);
    // A reported zero is known and requires no currency conversion.
    await db.execute(`UPDATE ai_studio.provider_cost_records SET actual_cost_usd=0,fx_snapshot_json='{}'::jsonb WHERE job_id=$1`, [job]);
    profit = (await getProfitReport()).find((row) => row.model_id === model);
    assert.equal(Number(profit.cost_cny_est), 0);
    assert.equal(Number(profit.gross_profit_cny), 7);
    assert.equal(profit.pending_reconciliation, 0);

    await db.execute('DELETE FROM ai_studio.provider_cost_records WHERE job_id=$1', [job]);
    await insert(`failed_${suffix}`, 2, 2, {usdToCny:1});
    await db.execute("UPDATE ai_studio.creations SET status='failed' WHERE id=$1",[job]);
    profit = (await getProfitReport()).find((row) => row.model_id === model);
    assert.equal(Number(profit.revenue_cny),0,'refunded failures have no recognised credit revenue');
    assert.equal(Number(profit.total_credits),0);
    assert.equal(Number(profit.cost_cny_est),2,'incurred provider cost survives task failure');
    assert.equal(Number(profit.gross_profit_cny),-2);
    await db.execute('DELETE FROM ai_studio.provider_cost_records WHERE job_id=$1', [job]);
    await db.execute("UPDATE ai_studio.creations SET status='succeeded' WHERE id=$1",[job]);
    profit = (await getProfitReport()).find((row) => row.model_id === model);
    assert.equal(profit.cost_cny_est, null, 'absence of a cost record is not a free generation');
    assert.equal(profit.gross_margin_pct, null);
  } finally {
    await db.execute('DELETE FROM ai_studio.provider_cost_records WHERE job_id=$1', [job]);
    await db.execute('DELETE FROM ai_studio.creations WHERE user_id=$1', [userId]);
    await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [userId]);
    await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [userId]);
    await db.execute('DELETE FROM ai_studio.ai_models WHERE id=$1', [model]);
  }
});
