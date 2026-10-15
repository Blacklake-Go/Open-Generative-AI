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
    stripeSecret, stripeWebhook] = await Promise.all([
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
    Promise.resolve(process.env.STRIPE_WEBHOOK_SECRET || ''),
  ]);

  const stripeMode = process.env.STRIPE_MODE || (stripeSecret?.startsWith('sk_test_') ? 'test' : 'live');
  const credentials = {
    alipay: Boolean(alipayAppId && alipayPrivateKey && alipayPublicKey),
    wechat: Boolean(wechatAppId && wechatMchId && wechatApiV3Key && wechatSerialNo && wechatPrivateKey && wechatPublicKey),
    stripe: Boolean(stripeSecret && stripeWebhook) && (stripeMode === 'test' || process.env.STRIPE_LIVE_ENABLED === 'true'),
  };
  const config = {
    alipay: credentials.alipay && process.env.ALIPAY_ENABLED !== 'false',
    wechat: credentials.wechat && process.env.WECHAT_ENABLED !== 'false',
    stripe: credentials.stripe,
  };
  const [alipayEnabled, wechatEnabled, stripeEnabled] = await Promise.all([
    providerRepo.getProviderEnabled('alipay'),
    providerRepo.getProviderEnabled('wechat'),
    providerRepo.getProviderEnabled('stripe'),
  ]);
  return {
    stripe: { configured: credentials.stripe, enabled: Boolean(config.stripe && stripeEnabled), mode: stripeMode, currencies: ['USD'], testModeOnly: process.env.STRIPE_LIVE_ENABLED !== 'true' },
    wechat: { configured: credentials.wechat, enabled: Boolean(config.wechat && wechatEnabled), currencies: ['CNY'], status: config.wechat && wechatEnabled ? 'active' : 'unavailable' },
    alipay: { configured: credentials.alipay, enabled: Boolean(config.alipay && alipayEnabled), currencies: ['CNY'], status: config.alipay && alipayEnabled ? 'active' : 'unavailable' },
  };
}
