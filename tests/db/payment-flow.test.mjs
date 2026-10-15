import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const authService = await import('../../lib/services/auth.js');
const checkoutRoute = await import('../../app/api/billing/checkout/route.js');
const { createPaymentCheckout } = await import('../../lib/services/paymentService.js');
const { invalidatePaymentChannelStatus } = await import('../../lib/payments/providerCredentials.js');
const billingPlansRoute = await import('../../app/api/billing/plans/route.js');
const creditPacksRoute = await import('../../app/api/billing/credit-packs/route.js');
const { setPaymentProviderEnabled } = await import('../../lib/services/paymentProviders.js');
const alipayWebhookRoute = await import('../../app/api/billing/webhooks/alipay/route.js');
const { signAlipayParams } = await import('../../lib/payments/alipayProvider.js');

const origin = 'http://127.0.0.1:3100';

function rememberEnv(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnv(values) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function seedCanonicalUser() {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const authRepo = await import('../../lib/repositories/auth.js');
  const id = await allocateUserId({
    reserve: (candidate, digits) => authRepo.reserveUserId(candidate, digits),
    findFirstAvailable: (digits) => authRepo.findFirstAvailableUserId(digits),
    isExhausted: (digits) => authRepo.isUserIdPoolExhausted(digits),
  });
  await db.execute(
    `INSERT INTO users (id,email,password_hash,password_salt,role,credits,status)
     VALUES ($1,$2,'hash','salt','user',0,'active')`,
    [id, `${id}@payment-flow.example.test`],
  );
  return id;
}

function checkoutRequest(token) {
  return new NextRequest(new URL('/api/billing/checkout', origin), {
    method: 'POST',
    headers: new Headers({
      Origin: origin,
      Cookie: `ko_session=${token}`,
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.244',
    }),
    body: JSON.stringify({ provider: 'alipay', planId: 'pro', billingCycle: 'monthly' }),
  });
}

function signedNotify({ orderId, tradeNo, tradeStatus, amountYuan, privateKey, invalid = false }) {
  const params = {
    app_id: '2026000000000000',
    out_trade_no: orderId,
    trade_no: tradeNo,
    trade_status: tradeStatus,
    total_amount: amountYuan,
    sign_type: 'RSA2',
  };
  params.sign = invalid ? 'invalid-test-signature' : signAlipayParams(params, privateKey, true);
  return new NextRequest(new URL('/api/billing/webhooks/alipay', origin), {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: new URLSearchParams(params).toString(),
  });
}

test.after(async () => {
  await db.closePgPool();
});

test('Alipay checkout, signed callback idempotency, and refund reverse the isolated ledger once', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const userId = await seedCanonicalUser();
  const session = await authService.createSession(userId);
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const envNames = [
    'ALIPAY_APP_ID', 'ALIPAY_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY', 'ALIPAY_GATEWAY',
    'ALIPAY_ENABLED', 'PUBLIC_APP_URL', 'NODE_ENV', 'PUBLIC_PAID_CHECKOUT_ENABLED',
  ];
  const oldEnv = rememberEnv(envNames);
  const oldFetch = globalThis.fetch;
  const oldProvider = await db.queryOne('SELECT * FROM ops_bill.provider_configs WHERE provider=$1', ['alipay']);
  let orderId = null;
  const tradeNo = `trade_${suffix}`;
  const mismatchTradeNo = `underpaid_${suffix}`;
  const eventIds = [`alipay_${tradeNo}`, `alipay_${tradeNo}_closed`, `alipay_${mismatchTradeNo}`];

  try {
    process.env.NODE_ENV = 'test';
    process.env.PUBLIC_APP_URL = origin;
    process.env.ALIPAY_APP_ID = '2026000000000000';
    process.env.ALIPAY_PRIVATE_KEY = privateKey;
    process.env.ALIPAY_PUBLIC_KEY = publicKey;
    process.env.ALIPAY_GATEWAY = 'https://alipay.test/gateway.do';
    process.env.ALIPAY_ENABLED = 'true';
    delete process.env.PUBLIC_PAID_CHECKOUT_ENABLED;
    await db.execute(
      `INSERT INTO ops_bill.provider_configs (provider,kind,name,enabled,updated_at)
       VALUES ('alipay','payment','Alipay isolated test',true,now())
       ON CONFLICT (provider) DO UPDATE SET enabled=true,updated_at=now()`,
    );

    // Admin toggles must immediately affect both the public pack catalog and
    // checkout, even when the credential status was cached moments earlier.
    const actor = { id: userId };
    await setPaymentProviderEnabled({ actor, provider: 'alipay', enabled: false });
    const hiddenPacks = await creditPacksRoute.GET();
    assert.equal((await hiddenPacks.json()).providers.alipay.enabled, false);
    const hiddenPlans = await billingPlansRoute.GET();
    assert.equal((await hiddenPlans.json()).providers.alipay.enabled, false);
    const disabledCheckout = await checkoutRoute.POST(checkoutRequest(session.token));
    assert.equal(disabledCheckout.status, 503);
    await setPaymentProviderEnabled({ actor, provider: 'alipay', enabled: true });
    invalidatePaymentChannelStatus();
    const closedPacks = await creditPacksRoute.GET();
    assert.equal((await closedPacks.json()).providers.alipay.enabled, false);
    const closedPlans = await billingPlansRoute.GET();
    assert.equal((await closedPlans.json()).providers.alipay.enabled, false);
    const ordersBeforeClosedCheckout = Number((await db.queryOne(
      'SELECT count(*) AS count FROM ops_bill.orders WHERE user_id=$1', [userId],
    )).count);
    const closedCheckout = await checkoutRoute.POST(checkoutRequest(session.token));
    assert.equal(closedCheckout.status, 503);
    assert.match((await closedCheckout.json()).error, /新购暂未开放/);
    const directClosedCheckout = await createPaymentCheckout({
      request: checkoutRequest(session.token), user: { id: userId }, planId: 'pro', provider: 'alipay',
    });
    assert.equal(directClosedCheckout.status, 503);
    assert.match(directClosedCheckout.error, /新购暂未开放/);
    const ordersAfterClosedCheckout = Number((await db.queryOne(
      'SELECT count(*) AS count FROM ops_bill.orders WHERE user_id=$1', [userId],
    )).count);
    assert.equal(ordersAfterClosedCheckout, ordersBeforeClosedCheckout);

    process.env.PUBLIC_PAID_CHECKOUT_ENABLED = 'true';
    invalidatePaymentChannelStatus();
    const enabledPacks = await creditPacksRoute.GET();
    assert.equal((await enabledPacks.json()).providers.alipay.enabled, true);
    const enabledPlans = await billingPlansRoute.GET();
    assert.equal((await enabledPlans.json()).providers.alipay.enabled, true);

    let gatewayCalls = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://alipay.test', 'payment test must never contact a real provider');
      gatewayCalls += 1;
      const form = new URLSearchParams(String(init.body || ''));
      assert.equal(form.get('method'), 'alipay.trade.precreate');
      return new Response(JSON.stringify({
        alipay_trade_precreate_response: { code: '10000', qr_code: 'https://qr.alipay.com/test-fixture' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const walletBefore = await db.queryOne(
      `INSERT INTO ops_bill.credit_wallets
         (user_id,daily_free_credits,subscription_credits,perpetual_credits,frozen_credits,updated_at)
       VALUES ($1,0,0,0,0,now())
       ON CONFLICT (user_id) DO UPDATE SET updated_at=ops_bill.credit_wallets.updated_at
       RETURNING subscription_credits,perpetual_credits,subscription_expires_at`, [userId],
    );
    const beforeSubscriptionCredits = Number(walletBefore.subscription_credits);
    const beforeCredits = Number(walletBefore.perpetual_credits);
    const checkout = await checkoutRoute.POST(checkoutRequest(session.token));
    assert.equal(checkout.status, 200, JSON.stringify(await checkout.clone().json()));
    const checkoutBody = await checkout.json();
    orderId = checkoutBody.orderId;
    assert.ok(orderId);
    assert.equal(checkoutBody.provider, 'alipay');
    assert.equal(checkoutBody.qrCodeUrl, 'https://qr.alipay.com/test-fixture');
    assert.equal(gatewayCalls, 1);

    const order = await db.queryOne('SELECT * FROM ops_bill.orders WHERE id=$1', [orderId]);
    assert.equal(order.status, 'pending');
    assert.equal(order.currency, 'CNY');
    const amountYuan = (Number(order.amount_minor) / 100).toFixed(2);
    const rejected = await alipayWebhookRoute.POST(signedNotify({
      orderId, tradeNo, tradeStatus: 'TRADE_SUCCESS', amountYuan, privateKey, invalid: true,
    }));
    assert.equal(rejected.status, 400);
    assert.equal((await db.queryOne('SELECT status FROM ops_bill.orders WHERE id=$1', [orderId])).status, 'pending');
    const afterRejectedWallet = await db.queryOne(
      'SELECT subscription_credits,perpetual_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [userId],
    );
    assert.equal(Number(afterRejectedWallet.subscription_credits), beforeSubscriptionCredits);
    assert.equal(Number(afterRejectedWallet.perpetual_credits), beforeCredits);

    const mismatchedAmount = await alipayWebhookRoute.POST(signedNotify({
      orderId, tradeNo: mismatchTradeNo, tradeStatus: 'TRADE_SUCCESS',
      amountYuan: ((Number(order.amount_minor) - 1) / 100).toFixed(2), privateKey,
    }));
    assert.equal(mismatchedAmount.status, 500);
    assert.equal((await db.queryOne('SELECT status FROM ops_bill.orders WHERE id=$1', [orderId])).status, 'pending');
    const afterMismatchedWallet = await db.queryOne(
      'SELECT subscription_credits,perpetual_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [userId],
    );
    assert.equal(Number(afterMismatchedWallet.subscription_credits), beforeSubscriptionCredits);
    assert.equal(Number(afterMismatchedWallet.perpetual_credits), beforeCredits);
    assert.equal(Number((await db.queryOne('SELECT count(*) AS count FROM ops_bill.payment_ledger WHERE order_id=$1', [orderId])).count), 0);
    assert.equal((await db.queryOne(
      'SELECT status FROM ops_bill.webhook_events WHERE provider=$1 AND event_id=$2', ['alipay', `alipay_${mismatchTradeNo}`],
    )).status, 'failed');

    const paidNotify = () => signedNotify({
      orderId, tradeNo, tradeStatus: 'TRADE_SUCCESS', amountYuan, privateKey,
    });
    const paid = await alipayWebhookRoute.POST(paidNotify());
    assert.equal(paid.status, 200, await paid.text());
    const duplicate = await alipayWebhookRoute.POST(paidNotify());
    assert.equal(duplicate.status, 200, await duplicate.text());

    const metadata = typeof order.metadata_json === 'string' ? JSON.parse(order.metadata_json) : order.metadata_json;
    const expectedCredits = Number(metadata.creditAmount);
    const paidOrder = await db.queryOne('SELECT status,paid_amount_minor,provider_payment_id FROM ops_bill.orders WHERE id=$1', [orderId]);
    assert.equal(paidOrder.status, 'paid');
    assert.equal(Number(paidOrder.paid_amount_minor), Number(order.amount_minor));
    assert.equal(paidOrder.provider_payment_id, `trade_${suffix}`);
    const paidLedger = await db.queryMany(
      "SELECT entry_type,amount_minor FROM ops_bill.payment_ledger WHERE order_id=$1 ORDER BY entry_type", [orderId],
    );
    assert.deepEqual(paidLedger.map((row) => [row.entry_type, Number(row.amount_minor)]), [['payment_succeeded', Number(order.amount_minor)]]);
    const paidWallet = await db.queryOne(
      'SELECT subscription_credits,perpetual_credits,subscription_expires_at FROM ops_bill.credit_wallets WHERE user_id=$1', [userId],
    );
    assert.equal(Number(paidWallet.subscription_credits), beforeSubscriptionCredits + expectedCredits);
    assert.equal(Number(paidWallet.perpetual_credits), beforeCredits, 'subscription purchase must not grant perpetual credits');
    assert.ok(new Date(paidWallet.subscription_expires_at).getTime() > Date.now(), 'subscription credits must have a future expiry');
    const activeSubscription = await db.queryOne(
      "SELECT plan_id,status FROM ops_bill.subscriptions WHERE user_id=$1 AND provider_subscription_id=$2", [userId, orderId],
    );
    assert.deepEqual({ planId: activeSubscription.plan_id, status: activeSubscription.status }, { planId: 'pro', status: 'active' });

    const otherSubscriptionId = `other_sub_${suffix}`;
    await db.execute(
      `INSERT INTO ops_bill.subscriptions (id,user_id,provider,provider_subscription_id,plan_id,status,current_period_end)
       VALUES ($1,$2,'stripe',$3,'basic','active',now()+interval '30 days')`,
      [otherSubscriptionId, userId, otherSubscriptionId],
    );

    const closeNotify = () => signedNotify({
      orderId, tradeNo, tradeStatus: 'TRADE_CLOSED', amountYuan, privateKey,
    });
    const closed = await alipayWebhookRoute.POST(closeNotify());
    assert.equal(closed.status, 200, await closed.text());
    const duplicateClose = await alipayWebhookRoute.POST(closeNotify());
    assert.equal(duplicateClose.status, 200, await duplicateClose.text());

    const refundedOrder = await db.queryOne('SELECT status FROM ops_bill.orders WHERE id=$1', [orderId]);
    assert.equal(refundedOrder.status, 'refunded');
    const refundedSubscription = await db.queryOne(
      'SELECT status FROM ops_bill.subscriptions WHERE user_id=$1 AND provider_subscription_id=$2', [userId, orderId],
    );
    assert.equal(refundedSubscription.status, 'canceled');
    assert.equal((await db.queryOne('SELECT role FROM auth_usr.users WHERE id=$1', [userId])).role, 'vip');
    const finalLedger = await db.queryMany(
      'SELECT entry_type,amount_minor FROM ops_bill.payment_ledger WHERE order_id=$1 ORDER BY entry_type', [orderId],
    );
    assert.deepEqual(finalLedger.map((row) => [row.entry_type, Number(row.amount_minor)]), [
      ['payment_refund', Number(order.amount_minor)],
      ['payment_succeeded', Number(order.amount_minor)],
    ]);
    const finalWallet = await db.queryOne(
      'SELECT subscription_credits,perpetual_credits,subscription_expires_at FROM ops_bill.credit_wallets WHERE user_id=$1', [userId],
    );
    assert.equal(Number(finalWallet.subscription_credits), beforeSubscriptionCredits);
    assert.equal(Number(finalWallet.perpetual_credits), beforeCredits);
    assert.equal(finalWallet.subscription_expires_at, null, 'full refund should clear the exhausted subscription-credit expiry');
    const creditRefundRows = await db.queryMany(
      "SELECT action_type,delta FROM ops_bill.credit_ledger_v2 WHERE user_id=$1 AND reference_id=$2 AND action_type='PAYMENT_REFUND'",
      [userId, orderId],
    );
    assert.equal(creditRefundRows.length, 1);
    assert.equal(Number(creditRefundRows[0].delta), -expectedCredits);

  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv(oldEnv);
    if (oldProvider) {
      await db.execute(
        `INSERT INTO ops_bill.provider_configs (provider,kind,name,enabled,config_json,updated_by,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (provider) DO UPDATE SET kind=EXCLUDED.kind,name=EXCLUDED.name,
         enabled=EXCLUDED.enabled,config_json=EXCLUDED.config_json,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`,
        [oldProvider.provider, oldProvider.kind, oldProvider.name, oldProvider.enabled, oldProvider.config_json, oldProvider.updated_by, oldProvider.updated_at],
      );
    } else {
      await db.execute('DELETE FROM ops_bill.provider_configs WHERE provider=$1', ['alipay']);
    }
    if (orderId) await db.execute('DELETE FROM ops_bill.orders WHERE id=$1', [orderId]).catch(() => {});
    if (eventIds.length) await db.execute('DELETE FROM ops_bill.webhook_events WHERE provider=$1 AND event_id=ANY($2::text[])', ['alipay', eventIds]).catch(() => {});
    if (orderId) {
      await db.execute(
        `DELETE FROM ops_bill.webhook_events WHERE provider='alipay' AND event_id LIKE 'reject_%'
         AND payload_json->'notify'->>'out_trade_no'=$1`, [orderId],
      ).catch(() => {});
    }
    await db.execute('DELETE FROM users WHERE id=$1', [userId]).catch(() => {});
    await db.execute('DELETE FROM user_id_allocations WHERE user_id=$1', [userId]).catch(() => {});
  }
});
