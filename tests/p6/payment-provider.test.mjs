import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import {
  PAYMENT_PROVIDER_ACTIONS,
  PaymentProviderError,
  assertPaymentProvider,
  normalizeProviderError,
} from '../../lib/payments/provider.js';
import { createStripeProvider, verifyStripeWebhookSignature } from '../../lib/payments/stripeProvider.js';
import { getOrderProductType, resolveOrderCreditGrantAmount } from '../../lib/payments/planFulfillment.js';
import { createResilientProvider, resetProviderCircuits } from '../../lib/services/providerRuntime.js';

test('payment provider contract exposes all required payment operations', () => {
  const provider = Object.fromEntries(PAYMENT_PROVIDER_ACTIONS.map((action) => [action, async () => ({})]));
  assert.equal(assertPaymentProvider(provider), provider);
  assert.throws(() => assertPaymentProvider({}), /missing payment provider method/);
});

test('provider errors are normalized without exposing secrets or payloads', () => {
  const error = normalizeProviderError(new Error('Authorization: Bearer sk_test_secret upstream body'), {
    provider: 'stripe',
    action: 'refund',
  });
  assert.ok(error instanceof PaymentProviderError);
  assert.equal(error.provider, 'stripe');
  assert.equal(error.action, 'refund');
  assert.match(error.message, /支付供应商(暂时不可用|请求失败)/);
  assert.doesNotMatch(error.message, /sk_test_secret|Bearer/);
});

test('Stripe signature verification accepts any valid v1 signature and rejects stale or invalid signatures', () => {
  const secret = 'whsec_test_only';
  const payload = '{"id":"evt_test"}';
  const timestamp = 1_800_000_000;
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const nowMs = timestamp * 1000 + 2000;
  assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp},v1=bad,v1=${digest}`, secret, nowMs), true);
  assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp - 301},v1=${digest}`, secret, nowMs), false);
  assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp},v1=${'0'.repeat(64)}`, secret, nowMs), false);
});

test('paid order fulfillment preserves the order credit snapshot and recognizes legacy pack ids', () => {
  const subscriptionOrder = {
    plan_id: 'starter',
    billing_cycle: 'monthly',
    metadata_json: { productType: 'subscription', creditAmount: 2400 },
  };
  assert.equal(getOrderProductType(subscriptionOrder), 'subscription');
  assert.equal(resolveOrderCreditGrantAmount({
    order: subscriptionOrder,
    plan: { id: 'starter', quotaBase: 2000, quotaBonus: 0 },
  }), 2400);

  const legacyCreditPackOrder = {
    plan_id: 'credit_490',
    billing_cycle: 'monthly',
    metadata_json: { creditAmount: 490 },
  };
  assert.equal(getOrderProductType(legacyCreditPackOrder), 'credit_pack');
  assert.equal(resolveOrderCreditGrantAmount({ order: legacyCreditPackOrder, plan: null }), 490);
});

test('Stripe provider delegates checkout, query, cancel and refund to an injected client', async () => {
  const calls = [];
  const client = {
    checkout: { sessions: {
      create: async (params, options) => { calls.push(['create', params, options]); return { id: 'cs_test', url: 'https://checkout.test' }; },
      retrieve: async (id) => { calls.push(['retrieve', id]); return { id, payment_intent: 'pi_test' }; },
    } },
    subscriptions: { cancel: async (id) => { calls.push(['cancel', id]); return { id, status: 'canceled' }; } },
    refunds: { create: async (params, options) => { calls.push(['refund', params, options]); return { id: 're_test', status: 'succeeded' }; } },
  };
  const provider = createStripeProvider({ client, secret: 'sk_test_unit', mode: 'test', randomSuffix: () => '12345678' });
  const checkout = await provider.createCheckout({
    order: { id: 'order_1', user_id: 'user_1' },
    user: { id: 'user_1', email: 'user@example.com' },
    plan: { id: 'pro', name: 'Pro', monthlyUsd: 5 },
    successUrl: 'https://app.test/success',
    cancelUrl: 'https://app.test/cancel',
  });
  assert.equal(checkout.id, 'cs_test');
  assert.match(calls[0][2].idempotencyKey, /order_1/);
  assert.equal(calls[0][1].integration_identifier, 'supdance_checkout_12345678');
  assert.equal(calls[0][1].mode, 'subscription');
  assert.ok(calls[0][1].subscription_data);
  assert.equal(calls[0][1].payment_intent_data, undefined);

  await provider.createCheckout({
    order: { id: 'order_credit_1', currency: 'USD', amount_minor: 999 },
    user: { id: 'user_1', email: 'user@example.com' },
    plan: { id: 'credit_490', name: '490 通用算力' },
    successUrl: 'https://app.test/success',
    cancelUrl: 'https://app.test/cancel',
    amountMinor: 999,
    billingCycle: 'one_time',
    creditAmount: 490,
    productType: 'credit_pack',
  });
  assert.equal(calls[1][1].mode, 'payment');
  assert.ok(calls[1][1].payment_intent_data);
  assert.equal(calls[1][1].subscription_data, undefined);
  assert.equal(calls[1][1].line_items[0].price_data.recurring, undefined);
  assert.equal(calls[1][1].metadata.product_type, 'credit_pack');
  assert.equal(calls[1][1].metadata.credit_amount, '490');
  await provider.retrievePayment('cs_test');
  await provider.cancel('sub_test');
  await provider.refund({ paymentIntentId: 'pi_test', idempotencyKey: 'refund:order_1' });
  assert.deepEqual(calls.map(([name]) => name), ['create', 'create', 'retrieve', 'cancel', 'refund']);
});

test('resilient provider retries transient failures and opens a circuit', async () => {
  resetProviderCircuits();
  let attempts = 0;
  const provider = createResilientProvider({
    provider: { async generate() { attempts += 1; throw Object.assign(new Error('temporary'), { code: 'UPSTREAM_503' }); } },
    providerName: 'mock-p6',
    maxAttempts: 2,
    failureThreshold: 1,
    resetMs: 60_000,
    sleep: async () => {},
  });
  await assert.rejects(provider.generate({}), /支付供应商/);
  await assert.rejects(provider.generate({}), /熔断|circuit/i);
  assert.equal(attempts, 2);
});

test('resilient provider enforces a timeout even when a provider ignores AbortSignal', async () => {
  resetProviderCircuits();
  const provider = createResilientProvider({
    provider: { async generate() { return new Promise(() => {}); } },
    providerName: 'mock-p6-timeout',
    timeoutMs: 10,
    maxAttempts: 1,
    sleep: async () => {},
  });
  await assert.rejects(provider.generate({}), (error) => error.code === 'PROVIDER_TIMEOUT');
});

test('P6 migration and routes contain payment ledger, event replay and raw-body verification seams', () => {
  const migration = fs.readFileSync(new URL('../../lib/db/migrations/009_payment_provider_v2.sql', import.meta.url), 'utf8');
  const uniquenessMigration = fs.readFileSync(new URL('../../lib/db/migrations/013_payment_success_uniqueness.sql', import.meta.url), 'utf8');
  assert.match(migration, /payment_ledger/);
  assert.match(migration, /orders_provider_idempotency_idx/);
  assert.match(migration, /provider_call_logs/);
  assert.match(uniquenessMigration, /payment_ledger_one_success_per_order_idx/);
  assert.match(fs.readFileSync(new URL('../../app/api/billing/webhooks/stripe/route.js', import.meta.url), 'utf8'), /request\.text\(\)/);
  assert.match(fs.readFileSync(new URL('../../app/api/billing/checkout/route.js', import.meta.url), 'utf8'), /getStripeProvider|createPayment/);
  assert.match(fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8'), /withTransaction|payment_ledger/);
  assert.match(fs.readFileSync(new URL('../../lib/db/migrations/012_payment_credit_refunds.sql', import.meta.url), 'utf8'), /credit_refund_obligations/);
  assert.match(fs.readFileSync(new URL('../../lib/financial/creditService.js', import.meta.url), 'utf8'), /reversePaymentCredits/);
  assert.match(fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8'), /credits_refund/);
  assert.match(fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8'), /retryable/);
  assert.match(fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8'), /replayError = `\$\{result\.action/);
});

test('P6 generation and proxy paths resolve server-managed provider secrets', () => {
  const secretService = fs.readFileSync(new URL('../../lib/services/providerSecrets.js', import.meta.url), 'utf8');
  const generationProviders = fs.readFileSync(new URL('../../lib/services/generationProviders.js', import.meta.url), 'utf8');
  const providerService = fs.readFileSync(new URL('../../lib/services/providers.js', import.meta.url), 'utf8');
  const legacyProxy = fs.readFileSync(new URL('../../app/api/api/v1/[[...path]]/route.js', import.meta.url), 'utf8');

  assert.match(secretService, /getProviderSecret/);
  assert.match(secretService, /MUAPI_API_KEY/);
  assert.match(generationProviders, /getServerProviderApiKey/);
  assert.match(providerService, /getServerProviderApiKey/);
  assert.match(legacyProxy, /getServerProviderApiKey/);
  assert.doesNotMatch(legacyProxy, /getApiKeyFromRequest/);
});

test('checkout UI has no fake payment success or QR simulation', () => {
  const source = fs.readFileSync(new URL('../../components/account/RechargeModal.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/billing\/checkout/);
  assert.match(source, /前往 Stripe 收银台/);
  assert.doesNotMatch(source, /模拟支付成功|支付模拟成功/);
  assert.doesNotMatch(source, /setTimeout\s*\([^)]*(?:setPollStatus\(['"]paid|onPaySuccess|paymentSucceeded)/s);
  assert.doesNotMatch(source, /QrCode|showQrCode|SUBSCRIPTION_PLANS/);
});
