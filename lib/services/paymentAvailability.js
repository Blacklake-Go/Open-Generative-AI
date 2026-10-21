import 'server-only';

import fs from 'node:fs';
import * as providerRepo from '@/lib/repositories/providers';

async function value(provider, name, envNames = [], pathEnvNames = []) {
  for (const envName of envNames) {
    if (process.env[envName]?.trim()) return process.env[envName].trim();
  }
  for (const pathEnvName of pathEnvNames) {
    const path = process.env[pathEnvName]?.trim();
    if (!path) continue;
    try {
      const contents = fs.readFileSync(path, 'utf8').trim();
      if (contents) return contents;
    } catch {}
  }
  return await providerRepo.getProviderSecret(provider, name);
}

export async function getPaymentAvailability() {
  const [alipayAppId, alipayPrivateKey, alipayPublicKey, wechatAppId, wechatMchId,
    wechatApiV3Key, wechatSerialNo, wechatPrivateKey, wechatPublicKey,
    stripeSecret, stripeWebhook,
    paypalClientId, paypalClientSecret, paypalModeVal] = await Promise.all([
    value('alipay', 'app_id', ['ALIPAY_APP_ID']),
    value('alipay', 'private_key', ['ALIPAY_PRIVATE_KEY'], ['ALIPAY_PRIVATE_KEY_PATH']),
    value('alipay', 'public_key', ['ALIPAY_PUBLIC_KEY'], ['ALIPAY_PUBLIC_KEY_PATH']),
    value('wechat', 'app_id', ['WECHAT_APP_ID']),
    value('wechat', 'mch_id', ['WECHAT_MCH_ID']),
    value('wechat', 'api_v3_key', ['WECHAT_API_V3_KEY']),
    value('wechat', 'serial_no', ['WECHAT_CERT_SERIAL_NO', 'WECHAT_SERIAL_NO']),
    value('wechat', 'private_key', ['WECHAT_PRIVATE_KEY'], ['WECHAT_PRIVATE_KEY_PATH']),
    value('wechat', 'public_key', ['WECHAT_PUBLIC_KEY'], ['WECHAT_CERT_PATH']),
    value('stripe', 'secret_key', ['STRIPE_SECRET_KEY']),
    value('stripe', 'webhook_secret', ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SIGNING_SECRET']),
    value('paypal', 'client_id', ['PAYPAL_CLIENT_ID']),
    value('paypal', 'client_secret', ['PAYPAL_CLIENT_SECRET']),
    value('paypal', 'mode', ['PAYPAL_MODE']),
  ]);

  const stripeMode = process.env.STRIPE_MODE || (stripeSecret?.startsWith('sk_test_') ? 'test' : 'live');
  const paypalMode = paypalModeVal || process.env.PAYPAL_MODE || (process.env.NODE_ENV === 'production' ? 'live' : 'sandbox');
  const credentials = {
    alipay: Boolean(alipayAppId && alipayPrivateKey && alipayPublicKey),
    wechat: Boolean(wechatAppId && wechatMchId && wechatApiV3Key && wechatSerialNo && wechatPrivateKey && wechatPublicKey),
    stripe: Boolean(stripeSecret && stripeWebhook) && (stripeMode === 'test' || process.env.STRIPE_LIVE_ENABLED === 'true'),
    paypal: Boolean(paypalClientId && paypalClientSecret),
  };
  const config = {
    alipay: credentials.alipay && process.env.ALIPAY_ENABLED !== 'false',
    wechat: credentials.wechat && process.env.WECHAT_ENABLED !== 'false',
    stripe: credentials.stripe,
    paypal: credentials.paypal && process.env.PAYPAL_ENABLED !== 'false',
  };
  const [alipayEnabled, wechatEnabled, stripeEnabled, paypalEnabled] = await Promise.all([
    providerRepo.getProviderEnabled('alipay'),
    providerRepo.getProviderEnabled('wechat'),
    providerRepo.getProviderEnabled('stripe'),
    providerRepo.getProviderEnabled('paypal'),
  ]);
  return {
    stripe: { configured: credentials.stripe, enabled: Boolean(config.stripe && stripeEnabled), mode: stripeMode, currencies: ['USD'], testModeOnly: process.env.STRIPE_LIVE_ENABLED !== 'true' },
    paypal: { configured: credentials.paypal, enabled: Boolean(config.paypal && paypalEnabled), mode: paypalMode, currencies: ['USD'], status: config.paypal && paypalEnabled ? 'active' : 'unavailable' },
    wechat: { configured: credentials.wechat, enabled: Boolean(config.wechat && wechatEnabled), currencies: ['CNY'], status: config.wechat && wechatEnabled ? 'active' : 'unavailable' },
    alipay: { configured: credentials.alipay, enabled: Boolean(config.alipay && alipayEnabled), currencies: ['CNY'], status: config.alipay && alipayEnabled ? 'active' : 'unavailable' },
  };
}
