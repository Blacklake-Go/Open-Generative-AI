import 'server-only';

import { createOrder, updateOrder } from './billing.js';
import { getStripeProvider } from '../payments/stripeProvider.js';
import { getWechatProvider } from '../payments/wechatProvider.js';
import { getAlipayProvider, extractAlipayQrFromCashierUrl } from '../payments/alipayProvider.js';
import { getProviderSecret, recordProviderCall as persistProviderCall } from '../repositories/providers.js';

// 支付宝原生二维码异步解析缓存
const alipayQrCache = new Map();

function resolveAlipayQrCodeInBackground(orderId, cashierUrl) {
  if (!orderId || !cashierUrl) return;
  (async () => {
    try {
      const qrCode = await extractAlipayQrFromCashierUrl(cashierUrl);
      if (qrCode) {
        alipayQrCache.set(String(orderId), qrCode);
      }
    } catch {
      // 容错静默，维持 iframe 模式
    }
  })();
}

import { findPublicPlanById } from '../repositories/plans.js';
import { publicErrorMessage } from '../security/publicError.js';
import { findOrderById, hasPaidExclusiveOrder, updateOrderFields } from '../repositories/billing.js';
import { handleProviderPaymentWebhook } from './webhookDispatcher.js';
import { assertPaymentChannelUsable } from '../payments/providerCredentials.js';
import { readKeyOrPath } from '../payments/keyMaterial.js';
import {
  findCreditPackById,
  findExclusivePackById,
  calculateExclusivePackGrant,
} from '../payments/creditPacks.js';

function publicOrigin(request) {
  if (!request) return process.env.PUBLIC_APP_URL || 'https://www.Supdance.com';
  return process.env.PUBLIC_APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

async function recordProviderCall(call, orderId) {
  try {
    await persistProviderCall({ ...call, orderId });
  } catch (error) {
    console.error('[payment/provider-log]', { code: error.code || 'LOG_FAILED' });
  }
}

export async function resolveWechatProvider(extra = {}) {
  const mchId = process.env.WECHAT_MCH_ID || (await getProviderSecret('wechat', 'mch_id'));
  const appId = process.env.WECHAT_APP_ID || (await getProviderSecret('wechat', 'app_id'));
  const apiV3Key = process.env.WECHAT_API_V3_KEY || (await getProviderSecret('wechat', 'api_v3_key'));
  const serialNo = process.env.WECHAT_CERT_SERIAL_NO || process.env.WECHAT_SERIAL_NO || (await getProviderSecret('wechat', 'serial_no'));
  const privateKey = readKeyOrPath(process.env.WECHAT_PRIVATE_KEY, process.env.WECHAT_PRIVATE_KEY_PATH, 'paymentService')
    || (await getProviderSecret('wechat', 'private_key'));
  const publicKey = readKeyOrPath(process.env.WECHAT_PUBLIC_KEY, process.env.WECHAT_CERT_PATH, 'paymentService')
    || (await getProviderSecret('wechat', 'public_key'));

  const options = { ...extra };
  if (mchId) options.mchId = mchId;
  if (appId) options.appId = appId;
  if (apiV3Key) options.apiV3Key = apiV3Key;
  if (serialNo) options.serialNo = serialNo;
  if (privateKey) options.privateKey = privateKey;
  if (publicKey) options.publicKey = publicKey;

  return getWechatProvider(options);
}

export async function resolveAlipayProvider(extra = {}) {
  const appId = process.env.ALIPAY_APP_ID || (await getProviderSecret('alipay', 'app_id'));
  const privateKey = readKeyOrPath(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_PATH, 'paymentService')
    || (await getProviderSecret('alipay', 'private_key'));
  const publicKey = readKeyOrPath(process.env.ALIPAY_PUBLIC_KEY, process.env.ALIPAY_PUBLIC_KEY_PATH, 'paymentService')
    || (await getProviderSecret('alipay', 'public_key'));
  const gateway = process.env.ALIPAY_GATEWAY || (await getProviderSecret('alipay', 'gateway')) || 'https://openapi.alipay.com/gateway.do';

  const options = { ...extra };
  if (appId) options.appId = appId;
  if (privateKey) options.privateKey = privateKey;
  if (publicKey) options.publicKey = publicKey;
  if (gateway) options.gateway = gateway;

  return getAlipayProvider(options);
}

async function checkIsFirstExclusivePurchase(userId) {
  try {
    const hasPaid = await hasPaidExclusiveOrder(userId);
    return !hasPaid;
  } catch {
    return false;
  }
}

export async function createPaymentCheckout({
  request,
  user,
  planId,
  provider = 'stripe',
  billingCycle = 'monthly',
  productType: requestedProductType = null,
  idempotencyKey,
}) {
  const normalizedProvider = String(provider || '').toLowerCase();
  if (!['stripe', 'wechat', 'alipay'].includes(normalizedProvider)) {
    return { error: '不支持的支付渠道', status: 400 };
  }
  const availability = await assertPaymentChannelUsable(normalizedProvider);
  if (!availability.ok) return { error: availability.error, status: availability.status };

  const strPlanId = String(planId || '');
  const resolvedProductType = requestedProductType || (
    strPlanId.startsWith('credit_')
      ? 'credit_pack'
      : strPlanId.startsWith('exclusive_')
      ? 'exclusive_pack'
      : 'subscription'
  );

  let planObj = null;
  let priceYuan = 140;
  let creditAmount = 2000;
  let cycle = 'monthly';
  let periodDays = 31;
  let metadata = {};

  if (resolvedProductType === 'credit_pack') {
    const pack = findCreditPackById(strPlanId);
    if (!pack) return { error: '请选择有效的通用算力包', status: 400 };
    planObj = { id: pack.id, name: pack.name };
    priceYuan = pack.priceCny;
    creditAmount = pack.credits;
    cycle = 'one_time';
    periodDays = null;
    metadata = {
      productType: 'credit_pack',
      productId: pack.id,
      creditAmount,
      planName: pack.name,
      priceYuan,
      billingCycle: 'one_time',
    };
  } else if (resolvedProductType === 'exclusive_pack') {
    const pack = findExclusivePackById(strPlanId);
    if (!pack) return { error: '请选择有效的模型专属算力包', status: 400 };
    const isFirst = await checkIsFirstExclusivePurchase(user.id);
    const grant = calculateExclusivePackGrant(pack, isFirst);
    planObj = { id: pack.id, name: pack.name };
    priceYuan = pack.priceCny;
    creditAmount = grant.totalCredits;
    cycle = 'one_time';
    periodDays = 365;
    metadata = {
      productType: 'exclusive_pack',
      productId: pack.id,
      familyKey: pack.familyKey,
      familyName: pack.familyName,
      canonicalModelId: pack.canonicalModelId,
      purchasedCredits: grant.purchasedCredits,
      standardBonusCredits: grant.standardBonusCredits,
      firstBonusCredits: grant.firstBonusCredits,
      isFirstPurchase: isFirst,
      creditAmount,
      planName: pack.name,
      priceYuan,
      billingCycle: 'one_time',
      purchasedValidityDays: 365,
      bonusValidityDays: 31,
    };
  } else {
    // 商业会员订阅 (五档标准体系: free/starter/basic/plus/pro -> FREE/BASE/STAR/PRO/APEX)
    const plan = await findPublicPlanById(strPlanId);
    if (!plan || plan.id === 'free') return { error: '请选择付费方案', status: 400 };
    planObj = plan;
    cycle = ['yearly', 'quarterly', 'monthly'].includes(billingCycle) ? billingCycle : 'monthly';
    let multiplier = 1;

    if (cycle === 'yearly') {
      periodDays = 365;
      multiplier = 12;
      priceYuan = Number(plan.yearlyCny || plan.meta?.yearlyCny) || (plan.id === 'pro' ? 17600 : plan.id === 'plus' ? 8000 : plan.id === 'basic' ? 3600 : 1680);
    } else if (cycle === 'quarterly') {
      periodDays = 92;
      multiplier = 3;
      priceYuan = Number(plan.quarterlyCny || plan.meta?.quarterlyCny) || (plan.id === 'pro' ? 4752 : plan.id === 'plus' ? 2160 : plan.id === 'basic' ? 945 : 420);
    } else {
      periodDays = 31;
      multiplier = 1;
      priceYuan = Number(plan.monthlyCny) || (plan.id === 'pro' ? 1760 : plan.id === 'plus' ? 800 : plan.id === 'basic' ? 350 : 140);
    }

    const baseQuota = Number(plan.quotaBase || 0);
    const monthlyCredits = baseQuota > 0
      ? baseQuota
      : (plan.id === 'pro' ? 27000 : plan.id === 'plus' ? 12000 : plan.id === 'basic' ? 5000 : 2000);
    creditAmount = monthlyCredits * multiplier;

    metadata = {
      productType: 'subscription',
      billingCycle: cycle,
      periodDays,
      creditAmount,
      monthlyCredits,
      planName: plan.name,
      priceYuan,
    };
  }

  const isRmb = normalizedProvider === 'wechat' || normalizedProvider === 'alipay';
  const currency = isRmb ? 'CNY' : 'USD';
  const amountMinor = isRmb
    ? Math.round(priceYuan * 100)
    : Math.round((cycle === 'yearly'
      ? (planObj.yearlyUsd || planObj.meta?.yearlyUsd || Number(planObj.monthlyUsd || (priceYuan / 7.2)) * 10)
      : cycle === 'quarterly'
        ? (planObj.quarterlyUsd || planObj.meta?.quarterlyUsd || Math.round(Number(planObj.monthlyUsd || (priceYuan / 7.2)) * 3 * 0.9))
        : (Number(planObj.monthlyUsd) || (priceYuan / 7.2))) * 100);
  if (!amountMinor || amountMinor <= 0) return { error: '该方案尚未设置价格', status: 400 };

  const created = await createOrder({
    userId: user.id,
    provider: normalizedProvider,
    plan: planObj,
    amountMinor,
    currency,
    idempotencyKey,
    billingCycle: cycle,
    metadata,
  });
  const order = created.order;

  // 微信支付 Native V3 扫码
  if (normalizedProvider === 'wechat') {
    try {
      const wechat = await resolveWechatProvider({
        onCall: (call) => recordProviderCall(call, order.id),
      });
      const session = await wechat.createCheckout({ order, user, plan: planObj });
      await updateOrder(order.id, {
        provider_order_id: session.id,
        checkout_url: session.code_url,
      });

      return {
        orderId: order.id,
        providerOrderId: session.id || order.provider_order_id || null,
        createdAt: order.created_at,
        qrCodeUrl: session.code_url,
        provider: 'wechat',
        amountYuan: (amountMinor / 100).toFixed(2),
        planName: planObj?.name || '算力服务',
        billingCycle: cycle,
        creditAmount,
        idempotent: created.idempotent,
      };
    } catch (error) {
      await updateOrder(order.id, { failure_code: error.code || 'WECHAT_ERROR' }).catch(() => {});
      return { error: publicErrorMessage(error, '微信支付下单失败，请稍后重试'), status: error.status || 502 };
    }
  }

  // 支付宝当面付 Precreate 扫码
  if (normalizedProvider === 'alipay') {
    try {
      const alipay = await resolveAlipayProvider({
        onCall: (call) => recordProviderCall(call, order.id),
      });
      const session = await alipay.createCheckout({ order, user, plan: planObj });
      await updateOrder(order.id, {
        provider_order_id: session.id,
        checkout_url: session.url || session.qr_code,
      });

      // 后台异步解析原生 qrCode（零阻塞本次毫秒级收银台拉起）
      if (session.isPagePay && session.url) {
        resolveAlipayQrCodeInBackground(order.id, session.url);
      }

      return {
        orderId: order.id,
        providerOrderId: session.id || order.provider_order_id || null,
        createdAt: order.created_at,
        qrCodeUrl: session.qr_code || null,
        qrImgUrl: session.qr_img_url || null,
        checkoutUrl: session.url || session.qr_code,
        isPagePay: Boolean(session.isPagePay),
        provider: 'alipay',
        amountYuan: (amountMinor / 100).toFixed(2),
        planName: planObj?.name || '算力服务',
        billingCycle: cycle,
        creditAmount,
        idempotent: created.idempotent,
      };
    } catch (error) {
      console.error('[paymentService/alipay precreate error]:', error);
      await updateOrder(order.id, { failure_code: error.code || 'ALIPAY_ERROR' }).catch(() => {});
      return { error: publicErrorMessage(error, '支付宝预下单失败，请稍后重试'), status: error.status || 502 };
    }
  }

  // Stripe 信用卡通道
  if (order.checkout_url) return { checkoutUrl: order.checkout_url, orderId: order.id, providerOrderId: order.provider_order_id || null, createdAt: order.created_at, idempotent: true };
  try {
    const secret = process.env.STRIPE_SECRET_KEY || (await getProviderSecret('stripe', 'secret_key'));
    const stripe = getStripeProvider({ secret, onCall: (call) => recordProviderCall(call, order.id) });
    // 只有明确为“套餐 + 周期”配置的 Stripe Price 才能复用；否则使用订单中
    // 已由服务器算出的 amountMinor，绝不能把年付/季付误带成月付 Price。
    const priceEnvKey = planObj?.id
      ? `STRIPE_PRICE_${String(planObj.id).replace(/[^a-z0-9]/gi, '_').toUpperCase()}_${cycle.toUpperCase()}`
      : '';
    const priceId = resolvedProductType === 'subscription' && priceEnvKey
      ? (process.env[priceEnvKey] || null)
      : null;
    const session = await stripe.createCheckout({
      order,
      user,
      plan: planObj,
      priceId: priceId || null,
      amountMinor,
      billingCycle: cycle,
      creditAmount,
      productType: resolvedProductType,
      periodDays,
      successUrl: `${publicOrigin(request)}/account?checkout=success`,
      cancelUrl: `${publicOrigin(request)}/account?checkout=cancelled`,
    });
    if (!session?.id || !session?.url) return { error: 'Stripe 暂时无法创建收款页面', status: 502 };
    await updateOrder(order.id, { provider_order_id: session.id, checkout_url: session.url });
    return { checkoutUrl: session.url, orderId: order.id, providerOrderId: session.id || order.provider_order_id || null, createdAt: order.created_at, idempotent: created.idempotent };
  } catch (error) {
    await updateOrder(order.id, { failure_code: error.code || 'PROVIDER_ERROR' }).catch(() => {});
    return { error: publicErrorMessage(error, 'Stripe 暂时无法创建收款页面'), status: error.status || 502 };
  }
}

function publicOrderStatus(order) {
  const alipayQr = alipayQrCache.get(String(order.id)) || null;
  return {
    orderId: order.id,
    status: order.status,
    qrCode: alipayQr,
    provider: order.provider || null,
    providerOrderId: order.provider_order_id || null,
    providerPaymentId: order.provider_payment_id || null,
    paidAmountMinor: order.paid_amount_minor == null ? null : Number(order.paid_amount_minor),
    amountMinor: order.amount_minor == null ? null : Number(order.amount_minor),
    currency: order.currency || null,
    planId: order.plan_id || null,
    createdAt: order.created_at || null,
    paidAt: order.paid_at || null,
  };
}

/**
 * 查询并同步订单支付状态（支持前端主动轮询，并在未收到 Webhook 时主动向上游查单）
 */
export async function syncOrderPaymentStatus(orderId, userId) {
  const order = await findOrderById(orderId);
  if (!order) return { error: '订单不存在', status: 404 };
  if (userId && order.user_id !== userId) return { error: '无权查看该订单', status: 403 };

  // 已核销直接返回
  if (order.status === 'paid' || order.status === 'refunded') {
    return publicOrderStatus(order);
  }

  // 若仍处于 pending，主动向上游查单同步
  try {
    if (order.provider === 'wechat') {
      const wechat = await resolveWechatProvider();
      const checkResult = await wechat.retrievePayment(order.id);
      if (checkResult.paid) {
        // 主动触发履约核销
        await handleProviderPaymentWebhook({
          provider: 'wechat',
          eventId: `sync_wechat_${order.id}`,
          eventType: 'wechat.payment_status_sync',
          payment: {
            out_trade_no: order.id,
            transaction_id: checkResult.transactionId,
            amount_total: checkResult.amountTotal || order.amount_minor,
            currency: 'CNY',
          },
        });
        const refreshed = await findOrderById(order.id);
        return publicOrderStatus(refreshed);
      } else if (order.created_at && (Date.now() - new Date(order.created_at).getTime()) > 30 * 60 * 1000) {
        try { if (typeof wechat.cancel === 'function') await wechat.cancel(order.id); } catch {}
        const closed = await updateOrderFields(order.id, { status: 'closed', failure_code: 'ORDER_EXPIRED_30M' });
        return publicOrderStatus(closed || order);
      }
    } else if (order.provider === 'alipay') {
      const alipay = await resolveAlipayProvider();
      const checkResult = await alipay.retrievePayment(order.id);
      if (checkResult.paid) {
        // 主动触发履约核销
        await handleProviderPaymentWebhook({
          provider: 'alipay',
          eventId: `sync_alipay_${order.id}`,
          eventType: 'alipay.payment_status_sync',
          payment: {
            out_trade_no: order.id,
            trade_no: checkResult.transactionId,
            amount_total: checkResult.amountTotal || order.amount_minor,
            currency: 'CNY',
          },
        });
        const refreshed = await findOrderById(order.id);
        return publicOrderStatus(refreshed);
      } else if (order.created_at && (Date.now() - new Date(order.created_at).getTime()) > 30 * 60 * 1000) {
        try { if (typeof alipay.cancel === 'function') await alipay.cancel(order.id); } catch {}
        const closed = await updateOrderFields(order.id, { status: 'closed', failure_code: 'ORDER_EXPIRED_30M' });
        return publicOrderStatus(closed || order);
      }
    } else if (order.created_at && (Date.now() - new Date(order.created_at).getTime()) > 30 * 60 * 1000) {
      const closed = await updateOrderFields(order.id, { status: 'closed', failure_code: 'ORDER_EXPIRED_30M' });
      return publicOrderStatus(closed || order);
    }
  } catch (err) {
    console.warn('[payment/sync-status]', { orderId, error: err.message });
  }

  return publicOrderStatus(order);
}
