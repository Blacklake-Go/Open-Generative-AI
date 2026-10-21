import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAYMENT_PROVIDER_ACTIONS,
  PaymentProviderError,
  assertPaymentProvider,
  normalizeProviderError,
} from '../../lib/payments/provider.js';
import {
  createPaypalProvider,
  paypalCredentialReadiness,
} from '../../lib/payments/paypalProvider.js';

test('PayPal provider implements all required payment provider actions', () => {
  const provider = createPaypalProvider({
    clientId: 'test_client_id',
    clientSecret: 'test_client_secret',
    mode: 'sandbox',
  });
  assert.equal(assertPaymentProvider(provider), provider);
  for (const action of PAYMENT_PROVIDER_ACTIONS) {
    assert.equal(typeof provider[action], 'function', `missing action: ${action}`);
  }
});

test('PayPal credential readiness flags missing credentials accurately', () => {
  const empty = paypalCredentialReadiness({});
  assert.equal(empty.usable, false);
  assert.deepEqual(empty.missing, ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']);

  const onlyId = paypalCredentialReadiness({ clientId: 'id_123' });
  assert.equal(onlyId.usable, false);
  assert.deepEqual(onlyId.missing, ['PAYPAL_CLIENT_SECRET']);

  const full = paypalCredentialReadiness({ clientId: 'id_123', clientSecret: 'sec_456' });
  assert.equal(full.usable, true);
  assert.deepEqual(full.missing, []);
});

test('PayPal provider delegates checkout, query, cancel, and refund to injected client', async () => {
  const calls = [];
  const mockClient = {
    async createCheckout(args) {
      calls.push(['createCheckout', args]);
      return { id: 'pp_order_123', url: 'https://www.sandbox.paypal.com/checkoutnow?token=pp_order_123', status: 'CREATED' };
    },
    async retrievePayment(id) {
      calls.push(['retrievePayment', id]);
      return { id, status: 'COMPLETED', paid: true, transactionId: 'cap_123', amountTotal: 14000, currency: 'USD' };
    },
    async capturePayment(id) {
      calls.push(['capturePayment', id]);
      return { id, status: 'COMPLETED' };
    },
    async cancel(id) {
      calls.push(['cancel', id]);
      return { id, status: 'canceled' };
    },
    async refund(args) {
      calls.push(['refund', args]);
      return { id: 'ref_123', status: 'COMPLETED' };
    },
    async verifyWebhookSignature(rawBody, headers, webhookId) {
      calls.push(['verifyWebhookSignature', { rawBody, headers, webhookId }]);
      return true;
    },
  };

  const provider = createPaypalProvider({ client: mockClient, mode: 'sandbox' });

  // 1. createCheckout
  const checkout = await provider.createCheckout({
    order: { id: 'ord_test_1', amount_minor: 14000, currency: 'USD' },
    user: { id: 'usr_1', email: 'user@example.com' },
    plan: { id: 'starter', name: 'Starter Plan' },
    successUrl: 'https://supdance.com/success',
    cancelUrl: 'https://supdance.com/cancel',
    amountMinor: 14000,
  });
  assert.equal(checkout.id, 'pp_order_123');
  assert.match(checkout.url, /token=pp_order_123/);

  // 2. retrievePayment
  const payment = await provider.retrievePayment('pp_order_123');
  assert.equal(payment.paid, true);
  assert.equal(payment.transactionId, 'cap_123');

  // 3. cancel
  const canceled = await provider.cancel('pp_order_123');
  assert.equal(canceled.status, 'canceled');

  // 4. refund
  const refunded = await provider.refund({
    captureId: 'cap_123',
    amountMinor: 14000,
    currency: 'USD',
    reason: '退款测试',
    idempotencyKey: 'ref_idem_1',
  });
  assert.equal(refunded.id, 'ref_123');

  // 5. verifyWebhookSignature
  const verified = await provider.verifyWebhookSignature('{}', { 'paypal-transmission-id': 'tx_1' }, 'wh_123');
  assert.equal(verified, true);

  assert.deepEqual(calls.map(([name]) => name), [
    'createCheckout',
    'retrievePayment',
    'cancel',
    'refund',
    'verifyWebhookSignature',
  ]);
});

test('PayPal error normalization redacts secret headers and returns safe customer message', () => {
  const rawErr = new Error('Basic dGVzdF9pZDp0ZXN0X3NlY3JldA== unauthorized error');
  rawErr.status = 502;
  const normalized = normalizeProviderError(rawErr, { provider: 'paypal', action: 'createCheckout' });

  assert.ok(normalized instanceof PaymentProviderError);
  assert.equal(normalized.provider, 'paypal');
  assert.equal(normalized.action, 'createCheckout');
  assert.equal(normalized.retryable, true);
  assert.match(normalized.message, /支付供应商暂时不可用/);
  assert.doesNotMatch(normalized.message, /dGVzdF9pZDp0ZXN0X3NlY3JldA==|Basic/);
});
