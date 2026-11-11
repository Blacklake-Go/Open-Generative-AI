import test from 'node:test';
import assert from 'node:assert/strict';
import {
  grantSubscriptionCredits,
  reversePaymentCredits,
  transferPaymentCreditsToSubscription,
} from '../../lib/financial/creditService.js';
import { analyzeLegacySubscriptionCreditLedger } from '../../scripts/reconcile-subscription-credit-bucket.mjs';

function createTransaction({ wallet, rows = [], order = null, userCredits = 0 }) {
  const state = {
    wallet: wallet ? { ...wallet } : null,
    rows: rows.map((row) => ({ ...row })),
    order: order ? { ...order } : null,
    obligation: null,
    userCredits,
  };
  const userId = 'test-user';
  return {
    state,
    async queryOne(sql, params = []) {
      if (sql.includes('WHERE idempotency_key = $1')) {
        const row = state.rows.find((item) => item.idempotency_key === params[0]);
        return row ? { ...row } : null;
      }
      if (sql.includes('SELECT status, billing_cycle FROM orders')) return state.order ? { ...state.order } : null;
      if (sql.includes('AS grant_count')) {
        const grants = state.rows.filter((row) => row.user_id === params[0] && row.reference_id === params[1]
          && row.action_type === 'CREDIT_GRANT' && Number(row.delta) > 0);
        const buckets = [...new Set(grants.map((row) => row.bucket_type))];
        return {
          grant_count: grants.length,
          bucket_count: buckets.length,
          bucket_type: buckets.length === 1 ? buckets[0] : null,
          granted_amount: grants.reduce((sum, row) => sum + Number(row.delta), 0),
        };
      }
      if (sql.includes("action_type = 'CREDIT_GRANT'")) {
        const grants = state.rows.filter((row) => row.user_id === params[0] && row.reference_id === params[1]
          && row.action_type === 'CREDIT_GRANT' && Number(row.delta) > 0);
        const buckets = [...new Set(grants.map((row) => row.bucket_type))].sort((a, b) =>
          grants.filter((row) => row.bucket_type === b).reduce((sum, row) => sum + Number(row.delta), 0)
          - grants.filter((row) => row.bucket_type === a).reduce((sum, row) => sum + Number(row.delta), 0));
        const bucket = buckets[0];
        return bucket ? {
          bucket_type: bucket,
          granted_amount: grants.filter((row) => row.bucket_type === bucket).reduce((sum, row) => sum + Number(row.delta), 0),
        } : null;
      }
      if (sql.includes("action_type = 'CREDIT_TRANSFER'") && sql.includes('AS subscription_delta')) {
        const entries = state.rows.filter((row) => row.user_id === params[0] && row.reference_id === params[1]
          && row.action_type === 'CREDIT_TRANSFER');
        return {
          entry_count: entries.length,
          subscription_delta: entries.filter((row) => row.bucket_type === 'SUBSCRIPTION').reduce((sum, row) => sum + Number(row.delta), 0),
          perpetual_delta: entries.filter((row) => row.bucket_type === 'PERPETUAL').reduce((sum, row) => sum + Number(row.delta), 0),
        };
      }
      if (sql.includes("action_type = 'CREDIT_TRANSFER'") && !sql.includes('FROM credit_ledger_v2 later')) {
        return { entry_count: state.rows.filter((row) => row.user_id === params[0] && row.reference_id === params[1]
          && row.action_type === 'CREDIT_TRANSFER').length };
      }
      if (sql.includes("action_type = 'PAYMENT_REFUND'")) {
        const refunds = state.rows.filter((row) => row.user_id === params[0] && row.reference_id === params[1]
          && row.action_type === 'PAYMENT_REFUND');
        return { reversed_amount: refunds.reduce((sum, row) => sum + Math.max(0, -Number(row.delta)), 0), entry_count: refunds.length };
      }
      if (sql.includes('FROM credit_ledger_v2 later')) {
        const transferTime = Math.max(...state.rows.filter((row) => row.reference_id === params[1]
          && row.action_type === 'CREDIT_TRANSFER' && row.bucket_type === 'SUBSCRIPTION')
          .map((row) => new Date(row.created_at).getTime()));
        return { entry_count: state.rows.filter((row) => row.user_id === params[0]
          && row.bucket_type === 'SUBSCRIPTION' && Number(row.delta) > 0
          && row.reference_id !== params[1] && new Date(row.created_at).getTime() > transferTime).length };
      }
      if (sql.includes('SELECT * FROM credit_wallets')) return state.wallet ? { ...state.wallet } : null;
      if (sql.includes('SELECT credits FROM users')) return { credits: state.userCredits };
      throw new Error(`Unhandled queryOne: ${sql}`);
    },
    async execute(sql, params = []) {
      if (sql.includes('UPDATE credit_wallets')) {
        state.wallet.subscription_credits = Number(params[0]);
        if (sql.includes('subscription_expires_at = CASE')) {
          if (params[1]) state.wallet.subscription_expires_at = null;
        } else {
          state.wallet.subscription_expires_at = params[1];
        }
        if (sql.includes('perpetual_credits = $3')) state.wallet.perpetual_credits = Number(params[2]);
        return { rowCount: 1 };
      }
      if (sql.includes('UPDATE users SET credits = $1')) {
        state.userCredits = Number(params[0]);
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO credit_ledger_v2')) {
        let actionType;
        let bucketType;
        let delta;
        let balanceAfter;
        let referenceId;
        let description;
        let idempotencyKey;
        if (sql.includes("'CREDIT_GRANT'")) {
          actionType = 'CREDIT_GRANT';
          bucketType = sql.includes("'SUBSCRIPTION'") ? 'SUBSCRIPTION' : 'PERPETUAL';
          [delta, balanceAfter, referenceId, description, idempotencyKey] = params.slice(2, 7);
        } else if (sql.includes("'CREDIT_TRANSFER'")) {
          actionType = 'CREDIT_TRANSFER';
          bucketType = sql.includes("'SUBSCRIPTION'") ? 'SUBSCRIPTION' : 'PERPETUAL';
          [delta, balanceAfter, referenceId, description, idempotencyKey] = params.slice(2, 7);
        } else {
          actionType = 'PAYMENT_REFUND';
          [, , bucketType, delta, balanceAfter, referenceId, description, idempotencyKey] = params;
        }
        state.rows.push({
          id: params[0], user_id: params[1], bucket_type: bucketType,
          delta: Number(delta), balance_after: Number(balanceAfter), action_type: actionType,
          reference_id: referenceId, description, idempotency_key: idempotencyKey,
          created_at: params.at(-1),
        });
        return { rowCount: 1 };
      }
      if (sql.includes('INSERT INTO credit_refund_obligations')) {
        state.obligation = {
          granted_amount: Number(params[3]), reversed_amount: Number(params[4]), status: params[5],
        };
        return { rowCount: 1 };
      }
      throw new Error(`Unhandled execute: ${sql}`);
    },
  };
}

const future = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const emptyWallet = (perpetual = 500) => ({
  user_id: 'test-user', daily_free_credits: 0, daily_expires_at: null,
  subscription_credits: 0, subscription_expires_at: null,
  perpetual_credits: perpetual, frozen_credits: 0,
});

test('subscription grants use the positional production API and refund only the subscription bucket', async () => {
  const transaction = createTransaction({ wallet: emptyWallet() });
  const grant = await grantSubscriptionCredits('test-user', 70, future(30), '订阅测试', 'order-sub', 'payment:order-sub:credits', transaction);
  assert.equal(grant.subscriptionCredits, 70);
  assert.equal(transaction.state.wallet.subscription_credits, 70);
  assert.equal(transaction.state.wallet.perpetual_credits, 500);

  const retry = await grantSubscriptionCredits('test-user', 70, future(30), '订阅测试', 'order-sub', 'payment:order-sub:credits', transaction);
  assert.equal(retry.idempotent, true);
  assert.equal(transaction.state.rows.length, 1);

  transaction.state.wallet.subscription_credits = 20;
  const refund = await reversePaymentCredits({
    userId: 'test-user', referenceId: 'order-sub', idempotencyKey: 'payment:refund-1:credits_refund', transaction,
  });
  assert.equal(refund.reversedAmount, 20);
  assert.equal(refund.unrecoveredAmount, 50);
  assert.equal(transaction.state.wallet.subscription_credits, 0);
  assert.equal(transaction.state.wallet.perpetual_credits, 500);
  assert.equal(transaction.state.obligation.status, 'PENDING');
});

test('subscription grant refuses an idempotency key already used by a perpetual grant', async () => {
  const transaction = createTransaction({
    wallet: emptyWallet(70),
    rows: [{ id: 'legacy-grant', user_id: 'test-user', bucket_type: 'PERPETUAL', delta: 70,
      balance_after: 70, action_type: 'CREDIT_GRANT', reference_id: 'order-sub',
      idempotency_key: 'payment:order-sub:credits' }],
  });

  await assert.rejects(
    grantSubscriptionCredits('test-user', 70, future(30), '订阅测试', 'order-sub', 'payment:order-sub:credits', transaction),
    { code: 'CREDIT_GRANT_IDEMPOTENCY_CONFLICT' },
  );
  assert.equal(transaction.state.wallet.subscription_credits, 0);
  assert.equal(transaction.state.rows.length, 1);
});

test('legacy perpetual refunds preserve unrelated balance when the wallet is consistent', async () => {
  const transaction = createTransaction({
    wallet: emptyWallet(580),
    rows: [{ user_id: 'test-user', bucket_type: 'PERPETUAL', delta: 80, balance_after: 580,
      action_type: 'CREDIT_GRANT', reference_id: 'order-legacy', idempotency_key: 'payment:order-legacy:credits' }],
  });
  const refund = await reversePaymentCredits({
    userId: 'test-user', referenceId: 'order-legacy', idempotencyKey: 'payment:refund-2:credits_refund', transaction,
  });
  assert.equal(refund.reversedAmount, 80);
  assert.equal(transaction.state.wallet.perpetual_credits, 500);
  assert.equal(transaction.state.obligation.status, 'COMPLETED');
});

test('legacy grant migration moves only the unused payment remainder and refund leaves later perpetual credits', async () => {
  const order = { id: 'order-migrate', status: 'paid', billing_cycle: 'monthly' };
  const transaction = createTransaction({
    order,
    wallet: emptyWallet(2596),
    rows: [{ id: 'grant-1', user_id: 'test-user', bucket_type: 'PERPETUAL', delta: 2400,
      balance_after: 2400, action_type: 'CREDIT_GRANT', reference_id: 'order-migrate',
      idempotency_key: 'payment:order-migrate:credits', created_at: new Date().toISOString() }],
  });
  const moved = await transferPaymentCreditsToSubscription({
    userId: 'test-user', referenceId: 'order-migrate', amount: 2396, expiresAt: future(20),
    reason: 'migration test', idempotencyKey: 'migration:order-migrate:v1', transaction,
  });
  assert.equal(moved.transferredAmount, 2396);
  assert.equal(transaction.state.wallet.perpetual_credits, 200);
  assert.equal(transaction.state.wallet.subscription_credits, 2396);
  assert.equal(transaction.state.rows.filter((row) => row.action_type === 'CREDIT_TRANSFER').length, 2);

  const retry = await transferPaymentCreditsToSubscription({
    userId: 'test-user', referenceId: 'order-migrate', amount: 2396, expiresAt: future(20),
    reason: 'migration test', idempotencyKey: 'migration:order-migrate:v1', transaction,
  });
  assert.equal(retry.idempotent, true);
  assert.equal(transaction.state.rows.filter((row) => row.action_type === 'CREDIT_TRANSFER').length, 2);

  const refund = await reversePaymentCredits({
    userId: 'test-user', referenceId: 'order-migrate', idempotencyKey: 'payment:refund-migrate:credits_refund', transaction,
  });
  assert.equal(refund.reversedAmount, 2396);
  assert.equal(refund.unrecoveredAmount, 4);
  assert.equal(refund.status, 'PENDING');
  assert.equal(transaction.state.wallet.subscription_credits, 0);
  assert.equal(transaction.state.wallet.perpetual_credits, 200);
  assert.equal(transaction.state.obligation.granted_amount, 2400);
  assert.equal(transaction.state.obligation.reversed_amount, 2396);
});

test('transferred refund fails closed if unrelated subscription credits were granted later', async () => {
  const order = { id: 'order-migrate', status: 'paid', billing_cycle: 'monthly' };
  const transaction = createTransaction({
    order,
    wallet: emptyWallet(2596),
    rows: [{ id: 'grant-1', user_id: 'test-user', bucket_type: 'PERPETUAL', delta: 2400,
      balance_after: 2400, action_type: 'CREDIT_GRANT', reference_id: 'order-migrate',
      idempotency_key: 'payment:order-migrate:credits', created_at: new Date().toISOString() }],
  });
  await transferPaymentCreditsToSubscription({
    userId: 'test-user', referenceId: 'order-migrate', amount: 2396, expiresAt: future(20),
    idempotencyKey: 'migration:order-migrate:v1', transaction,
  });
  const transferTime = transaction.state.rows.find((row) => row.bucket_type === 'SUBSCRIPTION'
    && row.action_type === 'CREDIT_TRANSFER').created_at;
  transaction.state.wallet.subscription_credits += 50;
  transaction.state.rows.push({ id: 'later-grant', user_id: 'test-user', bucket_type: 'SUBSCRIPTION',
    delta: 50, balance_after: 2446, action_type: 'CREDIT_GRANT', reference_id: 'other-order',
    idempotency_key: 'other-order:credits', created_at: new Date(new Date(transferTime).getTime() + 1000).toISOString() });

  const refund = await reversePaymentCredits({
    userId: 'test-user', referenceId: 'order-migrate', idempotencyKey: 'payment:refund-migrate:credits_refund', transaction,
  });
  assert.equal(refund.reversedAmount, 0);
  assert.equal(refund.unrecoveredAmount, 2400);
  assert.equal(refund.deferredForUnrelatedGrant, true);
  assert.equal(transaction.state.wallet.subscription_credits, 2446);
  assert.equal(transaction.state.wallet.perpetual_credits, 200);
});

test('legacy ledger preflight derives the exact unused grant without consuming later voucher credits', () => {
  const at = (value) => new Date(value).toISOString();
  const order = { id: 'order-migrate', status: 'paid', billing_cycle: 'monthly' };
  const grant = { id: 'grant-1', reference_id: order.id, bucket_type: 'PERPETUAL', delta: 2400, created_at: at('2026-09-19T10:12:55Z') };
  const perpetualRows = [
    { ...grant, action_type: 'CREDIT_GRANT' },
    { id: 'reserve-1', bucket_type: 'PERPETUAL', action_type: 'TASK_RESERVE', delta: -2, created_at: at('2026-09-20T05:04:46Z') },
    { id: 'release-1', bucket_type: 'PERPETUAL', action_type: 'TASK_RELEASE', delta: 2, created_at: at('2026-09-20T05:04:48Z') },
    { id: 'reserve-2', bucket_type: 'PERPETUAL', action_type: 'TASK_RESERVE', delta: -2, created_at: at('2026-09-20T07:11:24Z') },
    { id: 'commit-1', bucket_type: 'PERPETUAL', action_type: 'TASK_COMMIT', delta: 0, created_at: at('2026-09-20T07:11:37Z') },
    { id: 'reserve-3', bucket_type: 'PERPETUAL', action_type: 'TASK_RESERVE', delta: -2, created_at: at('2026-09-20T07:19:36Z') },
    { id: 'commit-2', bucket_type: 'PERPETUAL', action_type: 'TASK_COMMIT', delta: 0, created_at: at('2026-09-20T07:19:47Z') },
    { id: 'reserve-4', bucket_type: 'PERPETUAL', action_type: 'TASK_RESERVE', delta: -2, created_at: at('2026-09-21T10:40:01Z') },
    { id: 'release-2', bucket_type: 'PERPETUAL', action_type: 'TASK_RELEASE', delta: 2, created_at: at('2026-09-21T10:40:03Z') },
    { id: 'reserve-5', bucket_type: 'PERPETUAL', action_type: 'TASK_RESERVE', delta: -2, created_at: at('2026-09-21T12:43:26Z') },
    { id: 'release-3', bucket_type: 'PERPETUAL', action_type: 'TASK_RELEASE', delta: 2, created_at: at('2026-09-21T12:43:27Z') },
    { id: 'reserve-6', bucket_type: 'PERPETUAL', action_type: 'TASK_RESERVE', delta: -55, created_at: at('2026-09-24T16:50:26Z') },
    { id: 'release-4', bucket_type: 'PERPETUAL', action_type: 'TASK_RELEASE', delta: 55, created_at: at('2026-09-24T16:50:27Z') },
    ...[0, 1, 2, 3].map((index) => ({ id: `voucher-${index}`, bucket_type: 'PERPETUAL', action_type: 'CREDIT_GRANT',
      reference_id: `voucher-${index}`, delta: 50, created_at: new Date(Date.UTC(2026, 9, 1, 11, index)).toISOString() })),
  ];
  const plan = analyzeLegacySubscriptionCreditLedger({
    order, productType: 'subscription', grantRows: [grant], perpetualRows,
    wallet: { perpetual_credits: 2596, subscription_credits: 0, subscription_expires_at: null, frozen_credits: 0 },
    paymentSuccessCount: 1,
    activeSubscription: { status: 'active', current_period_end: '2026-10-20T00:00:00.000Z' },
    now: new Date('2026-10-01T00:00:00.000Z'),
  });
  assert.equal(plan.eligible, true, plan.blockers.join(','));
  assert.equal(plan.transferAmount, 2396);
  assert.equal(plan.consumedBeforeMigration, 4);
  assert.equal(plan.preservedLaterPerpetualCredits, 200);
  assert.equal(plan.perpetualAfter, 200);
});
