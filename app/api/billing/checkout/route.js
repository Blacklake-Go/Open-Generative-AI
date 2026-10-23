import { getUserFromRequest, json } from '@/lib/services/auth';
import { createPaymentCheckout } from '@/lib/services/paymentService';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { assertCheckoutAdmitted } from '@/lib/payments/checkoutAdmission';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要先登录' }, { status: 401 });
  try {
    const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
    if (guarded) return guarded;
    const limit = await consumeRateLimit({ scope: 'billing_checkout_user', subject: user.id || getClientIp(request), limit: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const body = await request.json();
    const provider = String(body.provider || '').toLowerCase();
    if (!['stripe', 'wechat', 'alipay', 'paypal'].includes(provider)) return json({ error: '不支持的支付渠道' }, { status: 400 });
    const planId = String(body.planId || '');
    const productType = body.productType || (
      planId.startsWith('credit_')
        ? 'credit_pack'
        : planId.startsWith('exclusive_')
        ? 'exclusive_pack'
        : 'subscription'
    );
    const availability = await assertCheckoutAdmitted({ userId: user.id, provider, productType, planId });
    if (!availability.ok) return json({ error: availability.error }, { status: availability.status });
    const billingCycle = productType === 'subscription'
      ? (['yearly', 'quarterly', 'monthly'].includes(String(body.billingCycle || '').toLowerCase())
          ? String(body.billingCycle).toLowerCase()
          : 'monthly')
      : 'one_time';
    // 服务端幂等键：同用户 + 同套餐/算力包 + 同周期 + 同渠道，30 分钟时间窗内去重，
    // 防止客户端每次点击生成新订单（重复下单）。窗口外可正常重新下单。
    const timeWindow = Math.floor(Date.now() / (30 * 60 * 1000));
    const idempotencyKey = `checkout_${user.id}_${provider}_${planId}_${billingCycle}_${timeWindow}`;
    const result = await createPaymentCheckout({
      request,
      user,
      planId,
      provider,
      billingCycle,
      productType,
      idempotencyKey,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  } catch (error) {
    console.error('[billing/checkout]', error);
    const status = error.code === 'IDEMPOTENCY_REQUIRED' || error.code === 'IDEMPOTENCY_CONFLICT' ? 422 : 500;
    return json({ error: publicErrorMessage(error, '创建订单失败') }, { status });
  }
}
