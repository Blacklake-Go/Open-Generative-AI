import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildAlipaySignString,
  getAlipayProvider,
  signAlipayParams,
} from '../../lib/payments/alipayProvider.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const { privateKey: alipayPrivatePem, publicKey: alipayPublicPem } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function signedNotify(overrides = {}) {
  const params = {
    app_id: '2021006156651438',
    charset: 'utf-8',
    gmt_create: '2026-09-22 12:00:00',
    notify_time: '2026-09-22 12:00:05',
    notify_type: 'trade_status_sync',
    out_trade_no: 'order_r11_probe',
    sign_type: 'RSA2',
    trade_no: '2026092222001463641431658603',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '140.00',
    ...overrides,
  };
  // 异步通知的 sign 由剔除 sign_type 的校验串生成，与 verifyAlipaySignature 对称。
  params.sign = signAlipayParams(params, alipayPrivatePem, true);
  return params;
}

function testProvider() {
  return getAlipayProvider({
    appId: '2021006156651438',
    privateKey: alipayPrivatePem,
    publicKey: alipayPublicPem,
  });
}

test('alipay notify passes verification only for a genuine RSA2 signature over the verify string', () => {
  const provider = testProvider();
  const params = signedNotify();
  assert.equal(provider.verifyWebhookSignature(params), params);

  const tampered = { ...params, total_amount: '1.00' };
  assert.throws(() => provider.verifyWebhookSignature(tampered), { code: 'ALIPAY_WEBHOOK_SIGNATURE_INVALID' });
});

test('alipay notify rejects payloads from another app_id before signature check', () => {
  const provider = testProvider();
  const foreign = signedNotify({ app_id: '2021000000000000' });
  assert.throws(() => provider.verifyWebhookSignature(foreign), { code: 'ALIPAY_WEBHOOK_APP_ID_MISMATCH' });
});

test('alipay notify rejects payloads missing sign or app_id as malformed', () => {
  const provider = testProvider();
  const noSign = signedNotify();
  delete noSign.sign;
  assert.throws(() => provider.verifyWebhookSignature(noSign), { code: 'ALIPAY_WEBHOOK_MALFORMED' });

  const noAppId = signedNotify();
  delete noAppId.app_id;
  assert.throws(() => provider.verifyWebhookSignature(noAppId), { code: 'ALIPAY_WEBHOOK_MALFORMED' });
});

test('signing keeps sign_type while verification excludes it', () => {
  const params = signedNotify();
  assert.ok(buildAlipaySignString(params).includes('sign_type=RSA2'));
  assert.ok(!buildAlipaySignString(params, true).includes('sign_type'));
});

test('webhook_events receipts use the provider-event composite key from the schema', () => {
  const repo = read('lib/repositories/webhooks.js');
  const section = repo.slice(repo.indexOf('export async function claimWebhookEvent'));
  assert.ok(section.length > 500, 'webhook_events section must exist');

  const inserts = section.match(/INSERT INTO webhook_events/g) || [];
  assert.equal(inserts.length, 2, 'claim + rejected receipt both insert');
  assert.equal((section.match(/INSERT INTO webhook_events\s*\n\s*\(provider/g) || []).length, 2, 'inserts must match the schema columns');
  assert.ok(!/\(id,\s*provider,\s*event_id/.test(section), 'webhook_events has no synthetic id column');
  assert.ok(!/'stripe'/.test(section), 'no provider may be hardcoded in webhook_events SQL');
  assert.match(section, /ON CONFLICT \(provider, event_id\) DO NOTHING/);
  assert.match(section, /status = 'rejected'/);
});

test('every webhook_events write path receives an explicit provider', () => {
  const repo = read('lib/repositories/webhooks.js');
  const section = repo.slice(repo.indexOf('export async function claimWebhookEvent'));
  const names = [...section.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.ok(names.length >= 9, `expected the full webhook_events API, got ${names.join(',')}`);
  for (const name of names) {
    const body = section.slice(section.indexOf(`export async function ${name}`));
    const signature = body.slice(0, body.indexOf(')'));
    if (name === 'findWebhookEvent') continue;
    assert.ok(signature.includes('provider'), `${name} must take provider`);
  }
});

test('provider notifications are recorded before fulfilment and never ack a failed payment', () => {
  const dispatcher = read('lib/services/webhookDispatcher.js');
  assert.match(dispatcher, /export async function handleProviderPaymentWebhook/);
  assert.match(dispatcher, /export async function recordRejectedWebhookReceipt/);
  assert.match(dispatcher, /transaction: outerTransaction = null/);
  assert.match(dispatcher, /return outerTransaction \? run\(outerTransaction\) : withTransaction\(run\)/);
  assert.match(dispatcher, /claimWebhookEvent\(\{ provider: 'stripe'/);
  assert.match(dispatcher, /回调渠道 \$\{normalizedProvider\} 与订单渠道/);
  assert.match(dispatcher, /if \(result\.success\) \{\s*await webhookRepo\.markWebhookProcessed\(\{ provider: normalizedProvider, eventId/);
  assert.match(dispatcher, /\} else \{\s*await webhookRepo\.markWebhookFailed\(\{\s*provider: normalizedProvider, eventId/);
  assert.ok(!/\.catch\(\(\) => \{\}\)/.test(dispatcher), 'no empty catch in the webhook dispatcher');
});

test('alipay callback route maps failures to real status codes and records every attempt', () => {
  const route = read('app/api/billing/webhooks/alipay/route.js');
  assert.match(route, /ALIPAY_WEBHOOK_MALFORMED/);
  assert.match(route, /ALIPAY_WEBHOOK_SIGNATURE_INVALID/);
  assert.match(route, /ALIPAY_PROVIDER_NOT_CONFIGURED/);
  assert.match(route, /status: 503/);
  assert.match(route, /recordRejectedWebhookReceipt/);
  assert.match(route, /handleProviderPaymentWebhook/);
  assert.match(route, /if \(!receipt\.success\) \{[\s\S]*?status: 500/);
  assert.match(route, /return new Response\('success', \{ status: 200/);
  assert.ok(!/catch \(error\) \{\s*console\.error\('\[webhook\/alipay\]', error\);\s*return new Response\('fail', \{ status: 500/.test(route), 'no blanket 500 handler');
});

test('wechat callback route mirrors the alipay receipt contract', () => {
  const route = read('app/api/billing/webhooks/wechat/route.js');
  assert.match(route, /WECHAT_WEBHOOK_MALFORMED/);
  assert.match(route, /WECHAT_WEBHOOK_SIGNATURE_INVALID/);
  assert.match(route, /WECHAT_WEBHOOK_MCH_ID_MISMATCH/);
  assert.match(route, /fail\('WECHAT_PROVIDER_NOT_CONFIGURED', 503\)/);
  assert.match(route, /recordRejectedWebhookReceipt/);
  assert.match(route, /if \(!receipt\.success\) \{[\s\S]*?500/);
  assert.match(route, /code: 'SUCCESS', message: '成功'/);
});

test('admin replay dispatches with the stored provider instead of assuming stripe', () => {
  const dispatcher = read('lib/services/webhookDispatcher.js');
  const replay = dispatcher.slice(dispatcher.indexOf('export async function replayWebhookEvent'));
  assert.match(replay, /const provider = String\(event\.provider \|\| 'stripe'\)\.toLowerCase\(\)/);
  assert.match(replay, /handleProviderPaymentWebhook\(\{/);
  assert.match(replay, /markWebhookReplay\(\{ provider, eventId/);
});

test('payment and ledger receipts share the same provider event id', () => {
  const dispatcher = read('lib/services/webhookDispatcher.js');
  assert.match(dispatcher, /event: \{ \.\.\.payment, id: eventId \}/);
  const alipayRoute = read('app/api/billing/webhooks/alipay/route.js');
  assert.match(alipayRoute, /const eventId = `alipay_\$\{params\.trade_no \|\| outTradeNo/);
});
