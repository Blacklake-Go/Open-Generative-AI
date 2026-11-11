import test from 'node:test';
import assert from 'node:assert/strict';

import { grantSubscriptionCredits, reversePaymentCredits } from '../../lib/financial/creditService.js';

function createCreditTransaction(initialWallet) {
  const wallet = { ...initialWallet };
  const ledger = [];
  const obligations = [];
  const user = { credits: 0 };

  return {
    wallet,
    ledger,
    obligations,
    user,
    async queryOne(sql, params = []) {
      const statement = sql.replace(/\s+/g, ' ').trim();
      if (statement.includes('FROM credit_ledger_v2 WHERE idempotency_key = $1')) {
        const row = ledger.find((entry) => entry.idempotency_key === params[0]);
        return row ? {
          id: row.id,
          user_id: row.user_id,
          reference_id: row.reference_id,
          bucket_type: row.bucket_type,
          action_type: row.action_type,
          delta: row.delta,
          balance_after: row.balance_after,
        } : null;
      }
      if (statement.includes("action_type = 'CREDIT_GRANT'")) {
        const rows = ledger.filter((entry) => entry.user_id === params[0]
          && entry.reference_id === params[1]
          && entry.action_type === 'CREDIT_GRANT'
          && entry.delta > 0);
        if (!rows.length) return { bucket_type: null, granted_amount: 0 };
        const bucket = rows[0].bucket_type;
        return {
          bucket_type: bucket,
          granted_amount: rows.filter((entry) => entry.bucket_type === bucket).reduce((sum, entry) => sum + entry.delta, 0),
        };
      }
      if (statement.includes("action_type = 'PAYMENT_REFUND'")) {
        return {
          reversed_amount: ledger.filter((entry) => entry.user_id === params[0]
            && entry.reference_id === params[1]
            && entry.action_type === 'PAYMENT_REFUND')
            .reduce((sum, entry) => sum + Math.max(0, -entry.delta), 0),
        };
      }
      if (statement.includes("action_type = 'CREDIT_TRANSFER'")) {
        return {
          entry_count: 0,
          subscription_delta: 0,
          perpetual_delta: 0,
        };
      }
      if (statement.includes('FROM credit_wallets WHERE user_id = $1')) return { ...wallet };
      if (statement.includes('FROM users WHERE id = $1')) return { credits: user.credits };
      throw new Error(`Unexpected queryOne SQL: ${statement}`);
    },
    async execute(sql, params = []) {
      const statement = sql.replace(/\s+/g, ' ').trim();
      if (statement.startsWith('INSERT INTO credit_wallets')) {
        return 1;
      }
      if (statement.startsWith('UPDATE credit_wallets SET subscription_credits = $1, subscription_expires_at = $2')) {
        wallet.subscription_credits = params[0];
        wallet.subscription_expires_at = params[1];
        return 1;
      }
      if (statement.startsWith('UPDATE credit_wallets SET subscription_credits = $1, subscription_expires_at = CASE')) {
        wallet.subscription_credits = params[0];
        if (params[1]) wallet.subscription_expires_at = null;
        wallet.perpetual_credits = params[2];
        return 1;
      }
      if (statement.startsWith('UPDATE users SET credits = $1')) {
        user.credits = params[0];
        return 1;
      }
      if (statement.startsWith('INSERT INTO credit_ledger_v2')) {
        const isGrant = statement.includes("'SUBSCRIPTION'") && statement.includes("'CREDIT_GRANT'");
        ledger.push(isGrant
          ? { id: params[0], user_id: params[1], bucket_type: 'SUBSCRIPTION', delta: params[2], balance_after: params[3], action_type: 'CREDIT_GRANT', reference_id: params[4], description: params[5], idempotency_key: params[6] }
          : { id: params[0], user_id: params[1], bucket_type: params[2], delta: params[3], balance_after: params[4], action_type: 'PAYMENT_REFUND', reference_id: params[5], description: params[6], idempotency_key: params[7] });
        return 1;
      }
      if (statement.startsWith('INSERT INTO credit_refund_obligations')) {
        obligations.push({ user_id: params[1], reference_id: params[2], granted_amount: params[3], reversed_amount: params[4], status: params[5] });
        return 1;
      }
      throw new Error(`Unexpected execute SQL: ${statement}`);
    },
  };
}

test('subscription payment grants expire, preserve the total wallet, and refund only the subscription bucket', async () => {
  const now = Date.now();
  const tx = createCreditTransaction({
    user_id: 'test-user',
    daily_free_credits: 4,
    daily_expires_at: new Date(now + 60_000).toISOString(),
    subscription_credits: 9,
    subscription_expires_at: new Date(now - 60_000).toISOString(),
    perpetual_credits: 100,
    frozen_credits: 0,
  });
  const expiresAt = new Date(now + 30 * 86_400_000).toISOString();

  const granted = await grantSubscriptionCredits(
    'test-user', 40, expiresAt, 'Starter 订阅积分', 'order_test_subscription', 'payment:order_test_subscription:credits', tx,
  );
  assert.equal(granted.subscriptionCredits, 40);
  assert.equal(granted.totalAvailable, 144);
  assert.equal(tx.wallet.subscription_credits, 40);
  assert.equal(tx.wallet.perpetual_credits, 100);
  assert.equal(tx.user.credits, 144);
  assert.equal(tx.ledger[0].bucket_type, 'SUBSCRIPTION');
  assert.equal(tx.ledger[0].balance_after, 40);
  assert.equal(tx.ledger[0].reference_id, 'order_test_subscription');
  assert.equal(tx.ledger[0].idempotency_key, 'payment:order_test_subscription:credits');

  const repeated = await grantSubscriptionCredits(
    'test-user', 40, expiresAt, 'Starter 订阅积分', 'order_test_subscription', 'payment:order_test_subscription:credits', tx,
  );
  assert.equal(repeated.idempotent, true);
  assert.equal(tx.wallet.subscription_credits, 40);
  assert.equal(tx.ledger.length, 1);

  // Simulate 15 credits spent from the subscription bucket before refund.
  tx.wallet.subscription_credits = 25;
  const refunded = await reversePaymentCredits({
    userId: 'test-user',
    referenceId: 'order_test_subscription',
    idempotencyKey: 'refund:order_test_subscription:credits',
    transaction: tx,
  });
  assert.equal(refunded.reversedAmount, 25);
  assert.equal(refunded.unrecoveredAmount, 15);
  assert.equal(refunded.status, 'PENDING');
  assert.equal(tx.wallet.subscription_credits, 0);
  assert.equal(tx.wallet.perpetual_credits, 100);
  assert.equal(tx.user.credits, 104);
  assert.equal(tx.ledger[1].bucket_type, 'SUBSCRIPTION');
  assert.equal(tx.ledger[1].delta, -25);
  assert.deepEqual(tx.obligations[0], {
    user_id: 'test-user',
    reference_id: 'order_test_subscription',
    granted_amount: 40,
    reversed_amount: 25,
    status: 'PENDING',
  });
});
