import { getUserFromRequest, json } from '@/lib/services/auth';
import { paymentChannelStatus } from '@/lib/payments/providerCredentials';
import { paymentPilotAvailable } from '@/lib/payments/checkoutAdmission';
import { listUniversalCreditPacks, listExclusiveModelFamilies } from '@/lib/payments/creditPacks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  let channels = null;
  try {
    channels = await paymentChannelStatus();
  } catch (error) {
    console.error('[billing/credit-packs] payment channel status unavailable', { code: error.code || 'PAYMENT_STATUS_UNAVAILABLE' });
  }
  const user = await getUserFromRequest(request).catch(() => null);
  const pilotPackId = user && await paymentPilotAvailable({
    userId: user.id,
    provider: 'alipay',
    productType: 'credit_pack',
    planId: 'credit_490',
  }) ? 'credit_490' : null;
  return json({
    packs: listUniversalCreditPacks(),
    universalPacks: listUniversalCreditPacks(),
    pilotPackId,
    exclusiveFamilies: listExclusiveModelFamilies(),
    // 算力包按人民币一次性购买；不暴露 Stripe 或任何凭据诊断信息。
    providers: {
      alipay: { enabled: Boolean(channels?.alipay?.enabled), currency: 'CNY' },
      wechat: { enabled: Boolean(channels?.wechat?.enabled), currency: 'CNY' },
    },
  });
}

