import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { getWechatProvider } from '../../lib/payments/wechatProvider.js';
import { PaymentProviderError } from '../../lib/payments/provider.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function configuredProvider() {
  return getWechatProvider({
    appId: 'wx_app_test_only',
    mchId: '1900000109',
    apiV3Key: 'a'.repeat(32),
    serialNo: 'SERIAL_TEST_ONLY',
    privateKey,
    publicKey,
    notifyUrl: 'https://supdance.com/api/billing/webhooks/wechat',
  });
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return handler({ url, options });
  };
  return { requests, restore: () => { globalThis.fetch = original; } };
}

test('wechat refund calls APIv3 with fen amounts and reuses the caller supplied out_refund_no', async () => {
  const { requests, restore } = stubFetch(async ({ options }) => ({
    ok: true,
    status: 200,
    json: async () => ({
      refund_id: '503012024092200001',
      out_refund_no: JSON.parse(options.body).out_refund_no,
      status: 'PROCESSING',
    }),
  }));
  try {
    const provider = configuredProvider();
    const params = { outTradeNo: 'KOY20260922A1', outRefundNo: 'ref_KOY20260922A1', refundAmount: 990, totalAmount: 990, reason: '售后退款' };
    const first = await provider.refund(params);
    const retry = await provider.refund(params);

    assert.equal(first.refund_id, '503012024092200001');
    assert.equal(first.status, 'PROCESSING');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, 'https://api.mch.weixin.qq.com/v3/refund/domestic/refunds');
    assert.equal(requests[0].options.method, 'POST');

    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.out_trade_no, 'KOY20260922A1');
    assert.deepEqual(body.amount, { refund: 990, total: 990, currency: 'CNY' });
    // 重试必须命中微信侧同一退款单号，否则一次售后会变成两次退款。
    assert.equal(JSON.parse(requests[1].options.body).out_refund_no, body.out_refund_no);

    const signed = requests[0].options.headers.Authorization;
    const { nonce_str: nonce, timestamp, signature } = Object.fromEntries(
      [...signed.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
    );
    const message = `POST\n/v3/refund/domestic/refunds\n${timestamp}\n${nonce}\n${requests[0].options.body}\n`;
    const verified = crypto.createVerify('RSA-SHA256').update(message, 'utf8').verify(publicKey, signature, 'base64');
    assert.equal(verified, true, '微信 V3 请求签名不可验证');
  } finally {
    restore();
  }
});

test('wechat refund rejects loudly when merchant credentials are incomplete', async () => {
  const provider = getWechatProvider({
    appId: 'wx_app_test_only',
    mchId: '',
    apiV3Key: '',
    serialNo: '',
    privateKey: '',
  });
  await assert.rejects(
    () => provider.refund({ outTradeNo: 'KOY_TEST', refundAmount: 10, totalAmount: 10 }),
    (error) => error instanceof PaymentProviderError && error.code === 'PAYMENT_PROVIDER_NOT_CONFIGURED',
  );
});

test('wechat refund never fabricates a refund id when the upstream refuses', async () => {
  const { restore } = stubFetch(async () => ({
    ok: false,
    status: 403,
    json: async () => ({ code: 'NO_AUTH', message: '商户无退款权限' }),
  }));
  try {
    const provider = configuredProvider();
    await assert.rejects(
      () => provider.refund({ outTradeNo: 'KOY_TEST', outRefundNo: 'ref_KOY_TEST', refundAmount: 10, totalAmount: 10 }),
      (error) => error instanceof PaymentProviderError && error.retryable !== true,
    );
  } finally {
    restore();
  }
});

test('processOrderRefund settles WeChat refunds upstream before mutating order state', () => {
  const source = fs.readFileSync(new URL('../../lib/services/billing.js', import.meta.url), 'utf8');
  const branch = /if \(order\.provider === 'wechat'\) \{[\s\S]*?\n  \}\n/.exec(source);
  assert.ok(branch, 'billing.js 缺少微信原路退款分支');
  const body = branch[0];

  assert.match(body, /resolveWechatProvider\(\)/);
  assert.match(body, /wechat\.refund\(/);
  assert.match(body, /outRefundNo: /);
  assert.match(body, /externalRefundId = refundRes\.refund_id/);
  assert.match(body, /return \{ error: /);
  assert.ok(
    source.indexOf("order.provider === 'wechat'") < source.indexOf('await withTransaction('),
    '微信退款必须在订单事务提交前完成，否则失败时会留下已退款的假状态',
  );
  // 退款调用不得被挪进事务：事务回滚会让微信侧已退的钱与本地状态错位。
  assert.doesNotMatch(body, /withTransaction/);
  assert.ok(source.includes("import { resolveAlipayProvider, resolveWechatProvider } from './paymentService.js';"));

  const providerSource = fs.readFileSync(new URL('../../lib/payments/wechatProvider.js', import.meta.url), 'utf8');
  assert.match(providerSource, /outRefundNo \|\| `ref_\$\{Date\.now\(\)\}/);
});

test('webhook dispatcher refuses zero-amount settlement and skips replayed fulfillment', () => {
  const dispatcher = fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8');
  assert.match(dispatcher, /amountMinor !== dueMinor/);
  assert.doesNotMatch(dispatcher, /amountMinor < order\.amount_minor/);
  assert.match(dispatcher, /if \(!ledgerInserted\) \{\n\s+return \{ success: true, action: 'payment_already_recorded'/);
});
