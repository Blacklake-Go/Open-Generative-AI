import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUserActiveConcurrency,
  getUserConcurrencyLimit,
  getProviderModelActiveConcurrency,
  checkConcurrency,
} from '../lib/services/concurrencyControl.js';

function mockTransaction(handlers = {}) {
  return {
    async queryOne(sql, params = []) {
      if (handlers.queryOne) {
        return handlers.queryOne(sql, params);
      }
      return null;
    },
    async query(sql, params = []) {
      if (handlers.query) {
        return handlers.query(sql, params);
      }
      return { rows: [] };
    },
  };
}

test('getUserActiveConcurrency counts active tasks from ai_studio.creations', async () => {
  const tx = mockTransaction({
    queryOne(sql, params) {
      assert.match(sql, /FROM ai_studio\.creations/);
      assert.match(sql, /status IN \('queued', 'processing'\)/);
      assert.equal(params[0], 'usr_123');
      return { active_count: 3 };
    },
  });

  const count = await getUserActiveConcurrency('usr_123', tx);
  assert.equal(count, 3);
});

test('getUserConcurrencyLimit defaults to free tier limit (1) when no subscription', async () => {
  const tx = mockTransaction({
    queryOne(sql, params) {
      assert.match(sql, /FROM ops_bill\.subscriptions/);
      return null;
    },
  });

  const limit = await getUserConcurrencyLimit('usr_free', tx);
  assert.equal(limit, 1);
});

test('getUserConcurrencyLimit maps tier plan_id to preset limits', async () => {
  const tiers = [
    { planId: 'starter', expected: 2 },
    { planId: 'basic', expected: 4 },
    { planId: 'plus', expected: 6 },
    { planId: 'pro', expected: 8 },
    { planId: 'team', expected: 10 },
    { planId: 'ultra', expected: 12 },
  ];

  for (const { planId, expected } of tiers) {
    const tx = mockTransaction({
      queryOne() {
        return { plan_id: planId, features_json: null };
      },
    });
    const limit = await getUserConcurrencyLimit(`usr_${planId}`, tx);
    assert.equal(limit, expected, `Plan ${planId} should have concurrency limit ${expected}`);
  }
});

test('getUserConcurrencyLimit respects custom concurrency in features_json', async () => {
  const tx = mockTransaction({
    queryOne() {
      return {
        plan_id: 'custom_enterprise',
        features_json: JSON.stringify({ concurrency: 16 }),
      };
    },
  });

  const limit = await getUserConcurrencyLimit('usr_ent', tx);
  assert.equal(limit, 16);
});

test('getProviderModelActiveConcurrency counts active provider attempts', async () => {
  const tx = mockTransaction({
    queryOne(sql, params) {
      assert.match(sql, /FROM ai_studio\.generation_attempts/);
      assert.match(sql, /status IN \('submitted', 'processing'\)/);
      assert.equal(params[0], 'muapi');
      assert.equal(params[1], 'flux-dev');
      return { active_count: 5 };
    },
  });

  const count = await getProviderModelActiveConcurrency('muapi', 'flux-dev', tx);
  assert.equal(count, 5);
});

test('checkConcurrency allows generation when active count is below limit', async () => {
  const tx = mockTransaction({
    queryOne(sql) {
      if (sql.includes('ai_studio.creations')) {
        return { active_count: 1 };
      }
      if (sql.includes('ops_bill.subscriptions')) {
        return { plan_id: 'pro', features_json: null }; // limit 8
      }
      return null;
    },
  });

  const result = await checkConcurrency({ userId: 'usr_pro', transaction: tx });
  assert.equal(result.allowed, true);
  assert.equal(result.activeCount, 1);
  assert.equal(result.limit, 8);
});

test('checkConcurrency rejects with USER_CONCURRENCY_EXCEEDED when active count meets or exceeds limit', async () => {
  const tx = mockTransaction({
    queryOne(sql) {
      if (sql.includes('ai_studio.creations')) {
        return { active_count: 1 };
      }
      if (sql.includes('ops_bill.subscriptions')) {
        return null; // free tier limit is 1
      }
      return null;
    },
  });

  const result = await checkConcurrency({ userId: 'usr_free', transaction: tx });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'USER_CONCURRENCY_EXCEEDED');
  assert.equal(result.activeCount, 1);
  assert.equal(result.limit, 1);
  assert.match(result.message, /当前有 1 个任务正在处理，最多允许 1 个同时进行/);
});
