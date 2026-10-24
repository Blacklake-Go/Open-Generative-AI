import 'server-only';

import { nowIso, withTransaction } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as billingRepo from '../repositories/billing.js';
import * as settingsRepo from '../repositories/settings.js';
import * as plansRepo from '../repositories/plans.js';
import { getCreditWallet } from '../financial/creditService.js';
import { getCurrencyWallet } from '../financial/currencyService.js';
import { getCreditBalance } from './credits.js';
import { getStripeProvider } from '../payments/stripeProvider.js';
import { reversePaymentCredits } from '../financial/creditService.js';
import { publicErrorMessage } from '../security/publicError.js';
import { resolveAlipayProvider, resolveWechatProvider } from './paymentService.js';
import { resolvePaypalProvider } from '../payments/providerCredentials.js';
import { getEquippedCoinReward } from './coinRewards.js';
import { syncFeaturesListWithExclusive, getDefaultExclusiveFeatures } from '../pricing/exclusiveBenefits.js';

export async function listPublicPlans() {
  return plansRepo.listPublicPlans();
}

export async function createOrder({ userId, provider, plan, amountMinor, currency, idempotencyKey, billingCycle = 'monthly', metadata = {} }) {
  const normalizedKey = String(idempotencyKey || '').trim().slice(0, 200);
  if (normalizedKey.length < 8) {
    throw Object.assign(new Error('支付订单必须提供有效的幂等键'), { code: 'IDEMPOTENCY_REQUIRED' });
  }
  return billingRepo.createPaymentOrder({ userId, provider, planId: plan.id, amountMinor, currency, idempotencyKey: normalizedKey, billingCycle, metadata });
}

export async function updateOrder(orderId, updates = {}) {
  return billingRepo.updateOrderFields(orderId, updates);
}

export async function getSubscription(userId) {
  return billingRepo.getActiveSubscription(userId);
}

export async function getEntitlements(userId) {
  const subscription = await getSubscription(userId);
  const isPaid = Boolean(subscription && ['active', 'trialing'].includes(subscription.status));
  const plan = await plansRepo.findPublicPlanById(isPaid ? subscription.plan_id : 'free');
  if (!plan) throw Object.assign(new Error('套餐目录尚未完成迁移或已被停用'), { code: 'PLAN_NOT_AVAILABLE' });
  const creditWallet = await getCreditWallet(userId);
  const currencyWallet = await getCurrencyWallet(userId);
  const avatarFrame = await getEquippedCoinReward(userId);
  const credits = creditWallet ? creditWallet.totalAvailable : await getCreditBalance(userId);

  const exclusiveFeatures = Array.isArray(plan.exclusiveFeatures) && plan.exclusiveFeatures.length > 0
    ? plan.exclusiveFeatures
    : (Array.isArray(plan.meta?.exclusiveFeatures) ? plan.meta.exclusiveFeatures : (isPaid ? getDefaultExclusiveFeatures(plan.id) : []));

  return {
    planId: isPaid ? plan.id : 'free',
    planName: plan.name,
    status: subscription?.status || 'free',
    provider: subscription?.provider || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    features: plan.features,
    exclusiveFeatures,
    hasNoWatermark: exclusiveFeatures.includes('no_watermark'),
    hasExclusiveLatestModels: exclusiveFeatures.includes('exclusive_latest_models'),
    hasVipSpeedQueue: exclusiveFeatures.includes('vip_speed_queue'),
    hasExport4k: exclusiveFeatures.includes('export_4k'),
    hasCommercialLicense: exclusiveFeatures.includes('commercial_license'),
    hasCanvasPremiumTools: exclusiveFeatures.includes('canvas_premium_tools'),
    hasDedicatedSupport: exclusiveFeatures.includes('dedicated_support'),
    concurrency: Number(plan.meta?.concurrency ?? plan.concurrency ?? 1),
    asyncConcurrency: Number(plan.meta?.asyncConcurrency ?? plan.asyncConcurrency ?? 1),
    portraitCapacity: Number(plan.meta?.portraitCapacity ?? plan.portraitCapacity ?? 0),
    storageGb: Number(plan.meta?.storageGb ?? plan.storageGb ?? (isPaid ? 5 : 1)),
    tierCredits: Number(plan.meta?.quotaBase ?? plan.quotaBase ?? 0),
    credits,
    creditBuckets: creditWallet || null,
    currencyWallet: currencyWallet || null,
    avatarFrame: avatarFrame || null,
    isPaidSubscription: isPaid,
    advanced: isPaid,
  };
}

export async function processOrderRefund({ actor, orderId, reason, requestId }) {
  const order = await billingRepo.findOrderById(orderId);
  if (!order) return { error: '未找到对应订单' };

  if (order.status === 'refunded') {
    return { error: '该订单已处于退款状态' };
  }
  if (order.provider === 'stripe' && !order.provider_order_id && !order.provider_payment_id) {
    return { error: 'Stripe 订单缺少供应商支付标识，不能安全退款' };
  }

  let externalRefundId = null;
  let providerNotice = null;

  // 1. 若为 Stripe 订单且具备商户密钥，调用上游真实退款
  if (order.provider === 'stripe' && order.provider_order_id) {
    try {
      const stripe = getStripeProvider();
      const session = order.provider_order_id ? await stripe.retrievePayment(order.provider_order_id) : null;
      const paymentIntentId = order.provider_payment_id || session?.payment_intent;
      if (!paymentIntentId) return { error: 'Stripe 订单尚未关联可退款的支付意图' };
      const refundData = await stripe.refund({ paymentIntentId, idempotencyKey: `refund:${order.id}` });
      if (refundData?.id && ['succeeded', 'pending'].includes(refundData.status || 'succeeded')) {
        externalRefundId = refundData.id;
        providerNotice = 'Stripe 原路退款指令已提交，最终状态以 Webhook 对账为准';
      } else return { error: 'Stripe 未确认退款请求' };
    } catch (stripeErr) {
      console.error('[processOrderRefund] Stripe 退款失败:', { code: stripeErr.code || 'PROVIDER_ERROR' });
      return { error: publicErrorMessage(stripeErr, 'Stripe 退款失败') };
    }
  }

  // 1.1 若为支付宝订单，调用支付宝原路退款
  if (order.provider === 'alipay') {
    try {
      const alipay = await resolveAlipayProvider();
      const refundAmountYuan = ((order.amount_minor || 0) / 100).toFixed(2);
      const refundRes = await alipay.refund({
        outTradeNo: order.id,
        refundAmountYuan,
        reason: reason || '后台管理退款',
      });
      externalRefundId = refundRes?.trade_no || refundRes?.out_trade_no || `alipay_ref_${Date.now()}`;
      providerNotice = '支付宝原路退款成功，资金已原路退回用户支付宝账户';
    } catch (alipayErr) {
      console.error('[processOrderRefund] 支付宝退款失败:', alipayErr.message);
      return { error: publicErrorMessage(alipayErr, '支付宝原路退款失败，请稍后重试') };
    }
  }

  // 1.15 若为 PayPal 订单，调用 PayPal 原路退款
  if (order.provider === 'paypal') {
    try {
      const paypal = await resolvePaypalProvider();
      const captureId = order.provider_payment_id || order.provider_order_id;
      const refundRes = await paypal.refund({
        captureId,
        amountMinor: order.amount_minor || 0,
        currency: order.currency || 'USD',
        reason: reason || '后台管理退款',
        idempotencyKey: `refund:${order.id}`,
      });
      externalRefundId = refundRes?.id || `paypal_ref_${Date.now()}`;
      providerNotice = 'PayPal 原路退款成功，资金已原路退回用户账户';
    } catch (paypalErr) {
      console.error('[processOrderRefund] PayPal 退款失败:', paypalErr.message);
      return { error: publicErrorMessage(paypalErr, 'PayPal 原路退款失败，请稍后重试') };
    }
  }

  // 1.2 若为微信订单，调用微信 APIv3 原路退款。
  //     未拿到微信确认的 refund_id 之前绝不进入下面的事务，
  //     否则会出现"订单标记已退款、积分已回收、但资金没有退回用户"的假退款。
  if (order.provider === 'wechat') {
    try {
      const wechat = await resolveWechatProvider();
      const refundRes = await wechat.refund({
        paymentIntentId: order.provider_payment_id || null,
        outTradeNo: order.id,
        // 稳定退款单号：同一订单重复提交由微信侧幂等，不会退两次。
        outRefundNo: `ref_${String(order.id).replace(/[^A-Za-z0-9!@$*_+-]/g, '').slice(0, 56)}`,
        refundAmount: order.amount_minor || 0,
        totalAmount: order.amount_minor || 0,
        reason: reason || '后台管理退款',
      });
      const wechatStatus = refundRes?.status || 'SUCCESS';
      if (!refundRes?.refund_id || !['SUCCESS', 'PROCESSING'].includes(wechatStatus)) {
        return { error: '微信未确认退款请求，请稍后重试或在微信商户平台手工退款' };
      }
      externalRefundId = refundRes.refund_id;
      providerNotice = wechatStatus === 'PROCESSING'
        ? '微信原路退款已受理，资金预计 1-3 个工作日退回用户微信'
        : '微信原路退款成功，资金已退回用户微信账户';
    } catch (wechatErr) {
      console.error('[processOrderRefund] 微信退款失败:', wechatErr.message);
      return { error: publicErrorMessage(wechatErr, '微信原路退款失败，请稍后重试') };
    }
  }

  // 2. 数据库事务：标记退款 + 记入不可变支付账本 + 同步取消订阅。
  const outcome = await withTransaction(async (tx) => {
    const locked = await billingRepo.lockOrder(orderId, tx);
    if (!locked || !['paid', 'completed'].includes(locked.status)) return null;
    const now = nowIso();
    const updated = await billingRepo.markOrderRefundedInTransaction(orderId, now, tx);
    if (externalRefundId) {
      await billingRepo.insertPaymentRefundLedger({ order, provider: order.provider, eventId: `manual:${externalRefundId}`, externalRefundId, reason, transaction: tx });
    }
    // 回收结果必须带回给操作者：钱已退但积分没扣完是资损，只写 obligation 表等于没人知道。
    const creditRecovery = await reversePaymentCredits({
      userId: order.user_id,
      referenceId: order.id,
      reason: reason || `订单 ${order.id} 退款`,
      idempotencyKey: `refund:${order.id}:credits`,
      transaction: tx,
    });
    await billingRepo.cancelMatchingSubscription({ userId: order.user_id, planId: order.plan_id, timestamp: now, transaction: tx });
    await logAudit({
      actor,
      action: 'orders.refund',
      targetType: 'order',
      targetId: orderId,
      riskLevel: 'high',
      before: { status: order.status, amount_minor: order.amount_minor },
      after: {
        status: 'refunded',
        reason,
        externalRefundId,
        providerNotice,
        credit_reversed: creditRecovery?.reversedAmount ?? null,
        credit_unrecovered: creditRecovery?.unrecoveredAmount ?? null,
      },
      requestId,
      transaction: tx,
    });
    return { updated, creditRecovery };
  });
  if (!outcome?.updated) return { error: '订单状态已被其他请求变更，请刷新后重试' };

  return {
    order: outcome.updated,
    externalRefundId,
    providerNotice,
    creditRecovery: outcome.creditRecovery ? {
      reversedAmount: Number(outcome.creditRecovery.reversedAmount || 0),
      unrecoveredAmount: Number(outcome.creditRecovery.unrecoveredAmount || 0),
      status: outcome.creditRecovery.status || 'COMPLETED',
    } : null,
  };
}

export async function updatePlanDetails({
  actor,
  planId,
  name,
  monthlyCny,
  monthlyUsd,
  features,
  meta,
  yearlyCny,
  yearlyUsd,
  quarterlyCny,
  quarterlyUsd,
  quotaBase,
  quotaBonus,
  concurrency,
  asyncConcurrency,
  portraitCapacity,
  storageGb,
  badge,
  exclusiveFeatures,
  displayOrder,
  enabled,
  requestId,
}) {
  return await withTransaction(async (tx) => {
    const existing = await settingsRepo.findPlanConfigById(planId, tx);
    if (!existing) return { error: '目标套餐不存在' };

    const mergedMeta = {
      ...(existing.meta || {}),
      ...(meta || {}),
      ...(yearlyCny !== undefined ? { yearlyCny: Number(yearlyCny) } : {}),
      ...(yearlyUsd !== undefined ? { yearlyUsd: Number(yearlyUsd) } : {}),
      ...(quarterlyCny !== undefined ? { quarterlyCny: Number(quarterlyCny) } : {}),
      ...(quarterlyUsd !== undefined ? { quarterlyUsd: Number(quarterlyUsd) } : {}),
      ...(quotaBase !== undefined ? { quotaBase: Number(quotaBase) } : {}),
      ...(quotaBonus !== undefined ? { quotaBonus: Number(quotaBonus) } : {}),
      ...(concurrency !== undefined ? { concurrency: Number(concurrency) } : {}),
      ...(asyncConcurrency !== undefined ? { asyncConcurrency: Number(asyncConcurrency) } : {}),
      ...(portraitCapacity !== undefined ? { portraitCapacity: Number(portraitCapacity) } : {}),
      ...(storageGb !== undefined ? { storageGb: Number(storageGb) } : {}),
      ...(badge !== undefined ? { badge: String(badge) } : {}),
      ...(exclusiveFeatures !== undefined ? { exclusiveFeatures: Array.isArray(exclusiveFeatures) ? exclusiveFeatures : [] } : {}),
    };

    const targetExclusiveFeatures = mergedMeta.exclusiveFeatures || existing.exclusiveFeatures || [];
    const sourceFeatures = Array.isArray(features) ? features : (existing.features || []);
    const syncedFeatures = syncFeaturesListWithExclusive(sourceFeatures, targetExclusiveFeatures);

    const updated = await settingsRepo.updatePlanConfig({
      id: planId,
      name: String(name !== undefined ? name : existing.name).trim(),
      monthlyCny: Number(monthlyCny !== undefined ? monthlyCny : existing.monthly_cny),
      monthlyUsd: Number(monthlyUsd !== undefined ? monthlyUsd : existing.monthly_usd),
      features: syncedFeatures,
      meta: mergedMeta,
      displayOrder: Number(displayOrder !== undefined ? displayOrder : existing.display_order),
      enabled: Boolean(enabled !== undefined ? enabled : existing.enabled),
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'plans.update',
      targetType: 'plan',
      targetId: planId,
      riskLevel: 'medium',
      before: existing,
      after: updated,
      requestId,
      transaction: tx,
    });

    return { plan: updated };
  });
}

export async function createPlan({
  actor,
  planId,
  name,
  monthlyCny,
  monthlyUsd,
  yearlyCny,
  yearlyUsd,
  quarterlyCny,
  quarterlyUsd,
  quotaBase,
  concurrency,
  asyncConcurrency,
  portraitCapacity,
  storageGb,
  badge,
  exclusiveFeatures,
  features,
  displayOrder,
  enabled,
  requestId,
}) {
  return await withTransaction(async (tx) => {
    const cleanId = String(planId || '').trim().toLowerCase();
    if (!cleanId || !/^[a-z0-9_-]{2,32}$/.test(cleanId)) {
      return { error: '套餐 ID 必须为 2-32 位的英文字母、数字、下划线或连字符' };
    }
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { error: '套餐名称不能为空' };
    }

    const existing = await settingsRepo.findPlanConfigById(cleanId, tx);
    if (existing) {
      return { error: `套餐 ID "${cleanId}" 已存在` };
    }

    const mCny = Number(monthlyCny || 0);
    const mUsd = Number(monthlyUsd || 0);
    const qCny = quarterlyCny !== undefined ? Number(quarterlyCny) : Math.round(mCny * 3 * 0.9);
    const qUsd = quarterlyUsd !== undefined ? Number(quarterlyUsd) : Math.round(mUsd * 3 * 0.9);
    const yCny = yearlyCny !== undefined ? Number(yearlyCny) : Math.round(mCny * 10);
    const yUsd = yearlyUsd !== undefined ? Number(yearlyUsd) : Math.round(mUsd * 10);

    const safeExclusiveFeatures = Array.isArray(exclusiveFeatures) ? exclusiveFeatures : getDefaultExclusiveFeatures(cleanId);
    const meta = {
      monthlyOriginCny: Math.round(mCny * 1.2),
      monthlyOriginUsd: Math.round(mUsd * 1.2),
      quarterlyOriginCny: mCny * 3,
      quarterlyCny: qCny,
      quarterlyOriginUsd: mUsd * 3,
      quarterlyUsd: qUsd,
      yearlyOriginCny: mCny * 12,
      yearlyCny: yCny,
      yearlyOriginUsd: mUsd * 12,
      yearlyUsd: yUsd,
      quotaBase: Number(quotaBase || 2000),
      quotaBonus: 0,
      concurrency: Number(concurrency || 2),
      asyncConcurrency: Number(asyncConcurrency || 2),
      portraitCapacity: Number(portraitCapacity || 2),
      storageGb: Number(storageGb || 5),
      badge: String(badge || ''),
      exclusiveFeatures: safeExclusiveFeatures,
    };

    const initialFeatures = Array.isArray(features) && features.length > 0
      ? features
      : [`每月 ${meta.quotaBase} 创作积分`, `任务并发: ${meta.concurrency} 路同时生成`];

    const finalFeatures = syncFeaturesListWithExclusive(initialFeatures, safeExclusiveFeatures);

    const plan = await settingsRepo.createPlanConfig({
      id: cleanId,
      name: cleanName,
      monthlyCny: mCny,
      monthlyUsd: mUsd,
      features: finalFeatures,
      meta,
      displayOrder: Number(displayOrder || 50),
      enabled: Boolean(enabled !== undefined ? enabled : true),
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'plans.create',
      targetType: 'plan',
      targetId: cleanId,
      riskLevel: 'medium',
      before: null,
      after: plan,
      requestId,
      transaction: tx,
    });

    return { plan };
  });
}

export async function deletePlan({ actor, planId, requestId }) {
  return await withTransaction(async (tx) => {
    const existing = await settingsRepo.findPlanConfigById(planId, tx);
    if (!existing) return { error: '目标套餐不存在' };

    await settingsRepo.deletePlanConfig(planId, tx);

    await logAudit({
      actor,
      action: 'plans.delete',
      targetType: 'plan',
      targetId: planId,
      riskLevel: 'high',
      before: existing,
      after: { ...existing, enabled: false },
      requestId,
      transaction: tx,
    });

    return { success: true, planId };
  });
}
