import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchPaymentWebhook, verifiedNativePaymentAmountMinor } from '../../lib/services/webhookDispatcher.js';

test('native payment amount requires the supplied paid amount to equal the order', () => {
  assert.equal(verifiedNativePaymentAmountMinor({ amount_total: 1200 }, 1200), 1200);
  assert.equal(verifiedNativePaymentAmountMinor({ total_amount_minor: 1200 }, 1200), 1200);
  for (const event of [{}, { amount_total: 0 }, { amount_total: '' },
    { amount_total: 1199 }, { amount_total: 1200.5 }, { amount_total: 'NaN' }]) {
    assert.equal(verifiedNativePaymentAmountMinor(event, 1200), null);
  }
  assert.equal(verifiedNativePaymentAmountMinor({ amount_total: 1200 }, 0), null);
});

test('native payment notices cannot fulfill an order without the exact paid amount', async () => {
  const order = {
    id: 'order_amount_probe',
    user_id: 'user_probe',
    provider: 'alipay',
    status: 'pending',
    amount_minor: 4900,
  };
  for (const amount of [undefined, 0, 4901, 49.5]) {
    let reads = 0;
    const tx = {
      async queryOne(sql) {
        assert.match(sql, /SELECT \* FROM orders WHERE id = \$1 FOR UPDATE/);
        reads += 1;
        return order;
      },
    };
    const event = { out_trade_no: order.id, trade_no: 'trade_probe' };
    if (amount !== undefined) event.amount_total = amount;
    const result = await dispatchPaymentWebhook({ provider: 'alipay', event, transaction: tx });
    assert.equal(result.success, false, `amount=${amount}`);
    assert.equal(result.error, '回调金额与订单金额不一致');
    assert.equal(reads, 1, 'invalid notice must stop before writing payment or credit ledgers');
  }
});

test('repeating a paid Alipay notice grants a credit pack only once', async () => {
  const order = {
    id: 'order_duplicate_probe', user_id: 'user_probe', provider: 'alipay',
    status: 'pending', amount_minor: 4900, plan_id: 'credit_490', billing_cycle: 'one_time',
    metadata_json: { productType: 'credit_pack', productId: 'credit_490', creditAmount: 490 },
  };
  const wallet = { daily_free_credits: 0, subscription_credits: 0, perpetual_credits: 106, frozen_credits: 0 };
  const paymentLedger = [];
  const creditLedger = [];
  const tx = {
    async queryOne(sql, params) {
      if (sql.includes('SELECT * FROM orders WHERE id = $1 FOR UPDATE')) return order;
      if (sql.includes('INSERT INTO payment_ledger')) {
        if (paymentLedger.length) return null;
        paymentLedger.push({ orderId: params[3], amount: params[5] });
        return { id: params[0] };
      }
      if (sql.includes('UPDATE orders') && sql.includes("ELSE 'paid'")) {
        order.status = 'paid';
        return { id: order.id, status: order.status };
      }
      if (sql.includes('FROM credit_ledger_v2 WHERE idempotency_key = $1')) {
        return creditLedger.find((row) => row.idempotencyKey === params[0]) || null;
      }
      if (sql.includes('SELECT * FROM credit_wallets WHERE user_id = $1')) return wallet;
      throw new Error(`Unexpected query: ${sql.slice(0, 100)}`);
    },
    async execute(sql, params) {
      if (sql.includes('INSERT INTO credit_wallets')) {
        wallet.perpetual_credits += params[1];
      } else if (sql.includes('INSERT INTO credit_ledger_v2')) {
        creditLedger.push({ amount: params[2], idempotencyKey: params[6] });
      } else if (!sql.includes('UPDATE users') && !sql.includes('INSERT INTO admin_audit_logs')) {
        throw new Error(`Unexpected execute: ${sql.slice(0, 100)}`);
      }
    },
  };
  const event = { out_trade_no: order.id, trade_no: 'trade_duplicate_probe', amount_total: 4900 };
  const first = await dispatchPaymentWebhook({ provider: 'alipay', event, transaction: tx });
  const second = await dispatchPaymentWebhook({ provider: 'alipay', event, transaction: tx });
  assert.equal(first.action, 'payment_recorded');
  assert.equal(second.action, 'already_paid');
  assert.equal(order.status, 'paid');
  assert.equal(wallet.perpetual_credits, 596);
  assert.deepEqual(paymentLedger.map((row) => row.amount), [4900]);
  assert.deepEqual(creditLedger.map((row) => row.amount), [490]);
});
