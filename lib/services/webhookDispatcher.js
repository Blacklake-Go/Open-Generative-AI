import { findPublicPlanByIdTx } from '../repositories/plans.js';
import { now, withTransaction, dataClient } from '../repositories/runtimeDb.js';
import { grantPerpetualCredits, grantSubscriptionCredits, reversePaymentCredits } from '../financial/creditService.js';
import { logAudit } from '../admin/audit.js';
import { getProviderSecret } from '../repositories/providers.js';
import * as webhookRepo from '../repositories/webhooks.js';
import { getOrderProductType, resolveOrderCreditGrantAmount } from '../payments/planFulfillment.js';

export async function getStripeWebhookSecret() {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  return getProviderSecret('stripe', 'webhook_secret');
}

function eventTime(event) {
  return event?.created ? new Date(Number(event.created) * 1000).toISOString() : null;
}

function eventMetadata(object) {
  return object?.metadata || object?.subscription_details?.metadata || {};
}

function orderMetadata(order) {
  if (order?.metadata_json && typeof order.metadata_json === 'object') return order.metadata_json;
  try {
    return JSON.parse(order?.metadata_json || '{}');
  } catch {
    throw Object.assign(new Error('支付订单元数据无效，不能履约'), { code: 'ORDER_METADATA_INVALID' });
  }
}

function cycleDays(cycle) {
  return cycle === 'yearly' ? 365 : cycle === 'quarterly' ? 92 : 31;
}

function stripePeriodEnd(object, metadata, baseTime = Date.now()) {
  const epochSeconds = Number(object?.current_period_end || object?.period_end);
  if (Number.isFinite(epochSeconds) && epochSeconds > 0) {
    return new Date(epochSeconds * 1000).toISOString();
  }
  const periodDays = Number(metadata?.period_days || metadata?.periodDays) || cycleDays(metadata?.billing_cycle || metadata?.billingCycle);
  return new Date(baseTime + periodDays * 24 * 60 * 60 * 1000).toISOString();
}

async function syncSubscription({ tx, userId, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, eventCreatedAt }) {
  return webhookRepo.syncStripeSubscription({ tx, userId, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, eventCreatedAt, transaction: tx });
}

async function settleStripeOrderRefund({ order, transaction }) {
  await webhookRepo.markOrderRefundedFromWebhook(order.id, now(), transaction);
  const creditRecovery = await reversePaymentCredits({
    userId: order.user_id,
    referenceId: order.id,
    reason: `Stripe 订单 ${order.id} 全额退款`,
    idempotencyKey: `payment:${order.id}:credits_refund`,
    transaction,
  });
  return {
    success: true,
    action: 'refund_recorded',
    orderId: order.id,
    creditReversed: Number(creditRecovery?.reversedAmount || 0),
    creditUnrecovered: Number(creditRecovery?.unrecoveredAmount || 0),
  };
}

async function dispatchStripeEventInTransaction(event, tx) {
  if (!event || typeof event.type !== 'string') return { success: false, error: '事件对象为空' };
  const object = event.data?.object || {};
  const metadata = eventMetadata(object);
  const userId = metadata.user_id;
  const plan = await findPublicPlanByIdTx(tx, metadata.plan_id || 'pro');
  const eventCreatedAt = eventTime(event);

  if (event.type === 'checkout.session.completed'
    || event.type === 'checkout.session.async_payment_succeeded'
    || event.type === 'payment_intent.succeeded') {
    if (!userId || !metadata.order_id) return { success: true, action: 'ignored_invalid_metadata' };
    const user = await webhookRepo.findUserInTransaction(userId, tx);
    if (!user) throw Object.assign(new Error('支付事件对应用户不存在，等待人工修复后重试'), { code: 'PAYMENT_USER_NOT_FOUND' });
    const order = await webhookRepo.lockOrderInTransaction(metadata.order_id, tx);
    if (!order) throw Object.assign(new Error('支付事件对应订单不存在，等待订单同步后重试'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
    if (order.user_id !== userId) throw Object.assign(new Error('支付事件用户与订单归属不匹配'), { code: 'PAYMENT_USER_ORDER_MISMATCH' });
    if (order.status === 'refunded') return { success: true, action: 'payment_already_refunded' };

    const productType = getOrderProductType(order);
    const orderMeta = orderMetadata(order);
    const plan = productType === 'subscription'
      ? await findPublicPlanByIdTx(tx, order.plan_id || metadata.plan_id)
      : null;
    if (productType === 'subscription' && !plan) return { success: true, action: 'ignored_invalid_plan' };
    if (event.type === 'checkout.session.completed' && object.payment_status !== 'paid') {
      return { success: true, action: 'checkout_payment_pending' };
    }
    if (event.type === 'checkout.session.async_payment_succeeded' && object.payment_status !== 'paid') {
      return { success: false, action: 'checkout_async_payment_unconfirmed', retryable: true };
    }

    const providerPaymentId = object.payment_intent || object.id || null;
    const paidAmountMinor = Number(object.amount_total ?? object.amount_received ?? 0);
    const paidCurrency = String(object.currency || '').toUpperCase();
    if (!(paidAmountMinor > 0)
      || (Number(order.amount_minor || 0) > 0 && paidAmountMinor !== Number(order.amount_minor))
      || (order.currency && paidCurrency && String(order.currency).toUpperCase() !== paidCurrency)) {
      throw Object.assign(new Error('Stripe 实付金额或币种与订单快照不一致，已停止履约'), { code: 'PAYMENT_AMOUNT_MISMATCH' });
    }
    const ledgerInserted = await webhookRepo.recordPaymentSuccess({
      eventId: event.id,
      order,
      userId,
      amountMinor: paidAmountMinor,
      currency: paidCurrency || order.currency || 'USD',
      providerPaymentId,
      payload: { id: object.id, type: event.type, created: event.created || null },
      transaction: tx,
    });

    await webhookRepo.markOrderPaid({
      orderId: order.id,
      providerOrderId: event.type.startsWith('checkout.session.') ? object.id || null : null,
      providerPaymentId,
      providerCustomerId: object.customer || null,
      paidAmountMinor,
      payload: { id: object.id, type: event.type, payment_status: object.payment_status || null },
      timestamp: now(),
      transaction: tx,
    });

    const subscriptionId = typeof object.subscription === 'string'
      ? object.subscription
      : (object.subscription?.id || null);
    const creditAmount = resolveOrderCreditGrantAmount({ order, plan });
    if (productType === 'subscription') {
      const periodEnd = stripePeriodEnd(object, { ...metadata, ...orderMeta }, eventCreatedAt ? new Date(eventCreatedAt).getTime() : Date.now());
      if (subscriptionId) {
        await syncSubscription({ tx, userId, planId: plan.id, providerCustomerId: object.customer || null, providerSubscriptionId: subscriptionId, status: 'active', currentPeriodEnd: periodEnd, eventCreatedAt });
      }
      await grantSubscriptionCredits(
        userId,
        creditAmount,
        periodEnd,
        `Stripe 订阅订单 ${order.id} 额度发放`,
        order.id,
        `payment:${order.id}:credits`,
        tx,
      );
    } else {
      await grantPerpetualCredits(
        userId,
        creditAmount,
        `Stripe 订单 ${order.id} 额度发放`,
        order.id,
        `payment:${order.id}:credits`,
        tx,
      );
    }
    return {
      success: true,
      action: ledgerInserted ? 'payment_recorded' : 'payment_already_recorded',
      productType,
      creditAmount,
    };
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const order = metadata.order_id ? await webhookRepo.lockOrderInTransaction(metadata.order_id, tx) : null;
    if (!order) return { success: false, action: 'checkout_async_failure_waiting_for_order', retryable: true };
    if (order.user_id !== userId) throw Object.assign(new Error('Stripe 支付失败事件用户与订单归属不匹配'), { code: 'PAYMENT_USER_ORDER_MISMATCH' });
    if (order.status === 'paid') return { success: true, action: 'checkout_async_failure_after_payment_ignored' };
    if (order.status !== 'refunded') {
      await webhookRepo.markOrderPaymentFailed({
        orderId: order.id,
        providerPaymentId: object.payment_intent || null,
        failureCode: 'ASYNC_PAYMENT_FAILED',
        timestamp: now(),
        transaction: tx,
      });
    }
    return { success: true, action: 'checkout_async_payment_failed_recorded' };
  }

  if (event.type === 'payment_intent.payment_failed') {
    const order = metadata.order_id ? await webhookRepo.lockOrderInTransaction(metadata.order_id, tx) : null;
    if (!order) return { success: false, action: 'payment_failure_waiting_for_order', retryable: true };
    if (!['paid', 'refunded'].includes(order.status)) {
      await webhookRepo.markOrderPaymentFailed({ orderId: order.id, providerPaymentId: object.id || null, failureCode: 'PAYMENT_FAILED', timestamp: now(), transaction: tx });
    }
    return { success: true, action: 'payment_failure_recorded' };
  }

  if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
    const paymentIntentId = object.payment_intent || object.charge || object.id;
    const order = await webhookRepo.lockOrderByProviderPaymentInTransaction(paymentIntentId, tx);
    if (!order) return { success: false, action: 'refund_waiting_for_order', retryable: true };
    if (order.status === 'refunded') return { success: true, action: 'refund_already_recorded', orderId: order.id };
    if (order.status !== 'paid') {
      return { success: false, action: 'refund_waiting_for_paid_order', retryable: true, orderId: order.id };
    }

    const paidAmountMinor = Number(order.paid_amount_minor || order.amount_minor || 0);
    const orderAmountMinor = Number(order.amount_minor);
    const currency = String(object.currency || order.currency || '').toUpperCase();
    if (!Number.isSafeInteger(paidAmountMinor) || paidAmountMinor <= 0
      || !Number.isSafeInteger(orderAmountMinor) || orderAmountMinor !== paidAmountMinor
      || (order.currency && currency !== String(order.currency).toUpperCase())) {
      throw Object.assign(new Error('Stripe 退款金额或币种无法与已支付订单核对'), { code: 'STRIPE_REFUND_ORDER_MISMATCH' });
    }

    let summary = await webhookRepo.getPaymentRefundSummary({ orderId: order.id, refundId: event.type === 'refund.updated' ? object.id : null, transaction: tx });
    const refundedSoFar = Number(summary?.refunded_amount_minor || 0);

    if (event.type === 'refund.updated') {
      const refundAmountMinor = Number(object.amount);
      if (object.status !== 'succeeded') {
        return { success: true, action: 'refund_not_settled', refundStatus: object.status || 'unknown', orderId: order.id };
      }
      if (!object.id || !Number.isSafeInteger(refundAmountMinor) || refundAmountMinor <= 0 || refundAmountMinor > paidAmountMinor) {
        throw Object.assign(new Error('Stripe 成功退款缺少有效退款 ID 或金额'), { code: 'STRIPE_REFUND_AMOUNT_INVALID' });
      }
      if (summary?.has_charge_snapshot || summary?.has_refund_object) {
        return { success: true, action: 'refund_already_accounted', orderId: order.id, refundedAmountMinor: refundedSoFar };
      }
      if (refundedSoFar + refundAmountMinor > paidAmountMinor) {
        throw Object.assign(new Error('Stripe 累计退款金额超过原支付金额'), { code: 'STRIPE_REFUND_TOTAL_EXCEEDS_PAYMENT' });
      }
      const inserted = await webhookRepo.recordPaymentRefund({
        eventId: `stripe-refund:${object.id}`,
        order,
        paymentIntentId: object.payment_intent || object.charge || order.provider_payment_id,
        amountMinor: refundAmountMinor,
        currency,
        payload: { id: event.id, refund_id: object.id, type: event.type, status: object.status, source: 'refund_object' },
        transaction: tx,
      });
      if (!inserted) return { success: true, action: 'refund_already_accounted', orderId: order.id };
      summary = await webhookRepo.getPaymentRefundSummary({ orderId: order.id, transaction: tx });
    } else {
      // Stripe's charge.refunded object reports a cumulative total and also fires for partial refunds.
      const cumulativeRefundedMinor = Number(object.amount_refunded);
      if (!Number.isSafeInteger(cumulativeRefundedMinor) || cumulativeRefundedMinor <= 0 || cumulativeRefundedMinor > paidAmountMinor) {
        throw Object.assign(new Error('Stripe charge.refunded 的累计退款金额无效'), { code: 'STRIPE_REFUND_AMOUNT_INVALID' });
      }
      const deltaMinor = Math.max(0, cumulativeRefundedMinor - refundedSoFar);
      if (deltaMinor > 0) {
        await webhookRepo.recordPaymentRefund({
          eventId: event.id,
          order,
          paymentIntentId,
          amountMinor: deltaMinor,
          currency,
          payload: { id: object.id, type: event.type, source: 'charge_snapshot', cumulative_amount_refunded: cumulativeRefundedMinor },
          transaction: tx,
        });
        summary = await webhookRepo.getPaymentRefundSummary({ orderId: order.id, transaction: tx });
      }
    }

    const totalRefundedMinor = Number(summary?.refunded_amount_minor || 0);
    if (!Number.isSafeInteger(totalRefundedMinor) || totalRefundedMinor > paidAmountMinor) {
      throw Object.assign(new Error('Stripe 累计退款账本超过原支付金额'), { code: 'STRIPE_REFUND_TOTAL_EXCEEDS_PAYMENT' });
    }
    if (totalRefundedMinor < paidAmountMinor) {
      return {
        success: true,
        action: 'partial_refund_recorded',
        orderId: order.id,
        refundedAmountMinor: totalRefundedMinor,
        remainingAmountMinor: paidAmountMinor - totalRefundedMinor,
      };
    }
    return settleStripeOrderRefund({ order, transaction: tx });
  }

  if (event.type === 'invoice.paid') {
    if (!userId || !plan || !object.subscription) return { success: true, action: 'ignored_invalid_invoice_metadata' };
    if (String(metadata.product_type || 'subscription') !== 'subscription') return { success: true, action: 'ignored_non_subscription_invoice' };
    const periodEnd = stripePeriodEnd(object, metadata, eventCreatedAt ? new Date(eventCreatedAt).getTime() : Date.now());
    await syncSubscription({
      tx, userId, planId: plan.id, providerCustomerId: object.customer || null, providerSubscriptionId: object.subscription,
      status: 'active', currentPeriodEnd: periodEnd, eventCreatedAt,
    });
    // 初次开通由 checkout.session.completed 履约；只有周期续费事件再次发放额度。
    if (object.billing_reason === 'subscription_cycle' || object.billing_reason === 'subscription_threshold') {
      const cycleMultiplier = metadata.billing_cycle === 'yearly' ? 12 : metadata.billing_cycle === 'quarterly' ? 3 : 1;
      const creditAmount = Number.parseInt(metadata.credit_amount, 10) || Number(plan.quotaBase || 0) * cycleMultiplier;
      if (creditAmount > 0) {
        await grantSubscriptionCredits(
          userId,
          creditAmount,
          periodEnd,
          `Stripe 订阅续费 ${object.id} 额度发放`,
          object.id,
          `payment:${object.id}:credits`,
          tx,
        );
      }
    }
    return { success: true, action: 'invoice_paid_processed' };
  }

  if (event.type === 'invoice.payment_failed') {
    if (!userId || !plan || !object.subscription) return { success: true, action: 'ignored_invalid_invoice_failure_metadata' };
    await syncSubscription({
      tx, userId, planId: plan.id, providerCustomerId: object.customer || null, providerSubscriptionId: object.subscription,
      status: 'past_due', currentPeriodEnd: object.period_end ? new Date(object.period_end * 1000).toISOString() : null, eventCreatedAt,
    });
    return { success: true, action: 'invoice_payment_failed_recorded' };
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    if (!userId || !plan || !object.id) return { success: true, action: 'ignored_invalid_subscription_metadata' };
    const user = await webhookRepo.findUserInTransaction(userId, tx);
    if (!user) throw Object.assign(new Error('订阅事件对应用户不存在，等待人工修复后重试'), { code: 'PAYMENT_USER_NOT_FOUND' });
    await syncSubscription({
      tx, userId, planId: plan.id, providerCustomerId: object.customer || null, providerSubscriptionId: object.id,
      status: event.type.endsWith('.deleted') ? 'canceled' : object.status || 'active',
      currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null,
      eventCreatedAt,
    });
    return { success: true, action: 'subscription_synced' };
  }

  return { success: true, action: 'ignored_unhandled_type', type: event.type };
}

export async function dispatchStripeEvent(event, { transaction = null } = {}) {
  if (transaction) return dispatchStripeEventInTransaction(event, transaction);
  return withTransaction((tx) => dispatchStripeEventInTransaction(event, tx));
}

export async function handleStripeWebhookEvent({ event, headers = null, force = false }) {
  try {
    return await withTransaction(async (tx) => {
      const timestamp = now();
      const claimed = await webhookRepo.claimWebhookEvent({ provider: 'stripe', eventId: event.id, eventType: event.type, eventCreatedAt: eventTime(event), payload: event, headers, timestamp, transaction: tx });
      if (!claimed) {
        const existing = await webhookRepo.getWebhookEventForUpdate({ provider: 'stripe', eventId: event.id, transaction: tx });
        if (!force && existing?.status !== 'failed' && existing?.status !== 'replay_failed') return { duplicate: true, action: 'duplicate_ignored' };
        await webhookRepo.markWebhookReceived({ provider: 'stripe', eventId: event.id, timestamp, transaction: tx });
      }
      const result = await dispatchStripeEventInTransaction(event, tx);
      if (result.retryable) {
        await webhookRepo.markWebhookFailed({ provider: 'stripe', eventId: event.id, errorMessage: `${result.action}，等待上游重试`, retryAt: new Date(Date.now() + 60_000).toISOString(), transaction: tx });
      } else {
        await webhookRepo.markWebhookProcessed({ provider: 'stripe', eventId: event.id, timestamp, transaction: tx });
      }
      await logAudit({ actor: { id: 'system:stripe-webhook', email: 'system@supdance.local' }, action: result.retryable ? 'payments.webhook_retryable' : 'payments.webhook_processed', targetType: 'webhook_event', targetId: event.id, riskLevel: result.retryable ? 'medium' : 'low', after: { provider: 'stripe', eventType: event.type, action: result.action, duplicate: false, retryable: Boolean(result.retryable) }, transaction: tx });
      return { ...result, duplicate: false };
    });
  } catch (error) {
    await webhookRepo.markWebhookFailedAfterRollback({ provider: 'stripe', eventId: event.id, errorCode: String(error.code || 'WEBHOOK_ERROR').slice(0, 120), retryAt: new Date(Date.now() + 60_000).toISOString() })
      .catch((receiptError) => console.error('[webhook/stripe] 失败回执写入异常', { code: receiptError.code || 'WEBHOOK_RECEIPT_WRITE_FAILED', eventId: event.id }));
    throw error;
  }
}

/**
 * 统一处理微信支付与支付宝的履约回调
 */
export function verifiedNativePaymentAmountMinor(event, dueAmountMinor) {
  const amountMinor = Number(event?.amount_total ?? event?.total_amount_minor);
  const dueMinor = Number(dueAmountMinor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0
    || !Number.isSafeInteger(dueMinor) || dueMinor <= 0 || amountMinor !== dueMinor) return null;
  return amountMinor;
}

export async function dispatchPaymentWebhook({ provider, event, headers = null, transaction: outerTransaction = null }) {
  const normalizedProvider = String(provider || '').toLowerCase();
  const orderId = event.out_trade_no || event.orderId;
  if (!orderId) {
    return { success: false, error: '缺少订单号 out_trade_no' };
  }

  const run = async (tx) => {
    const order = await webhookRepo.lockOrderInTransaction(orderId, tx);
    if (!order) {
      return { success: false, error: '订单不存在', orderId };
    }
    // 回调渠道必须与下单渠道一致，避免跨渠道串单入账
    if (order.provider && String(order.provider).toLowerCase() !== normalizedProvider) {
      return { success: false, error: `回调渠道 ${normalizedProvider} 与订单渠道 ${order.provider} 不一致`, orderId };
    }

    // 幂等保护：已支付则直接返回成功
    if (order.status === 'paid') {
      return { success: true, action: 'already_paid', orderId };
    }
    if (order.status === 'refunded') {
      return { success: true, action: 'payment_already_refunded', orderId };
    }

    const timestamp = now();
    const eventId = event.id || `${normalizedProvider}_${order.id}_${Date.now()}`;
    const providerPaymentId = event.transaction_id || event.trade_no || event.providerPaymentId || null;
    const dueMinor = Number(order.amount_minor);
    const amountMinor = verifiedNativePaymentAmountMinor(event, dueMinor);

    // 金额防御校验：回调金额必须存在且与订单应结金额一致，
    // 否则 total_amount 缺失时会以 0 分钱完成入账并放额度。
    if (amountMinor === null) {
      console.warn(`[webhook/${normalizedProvider}] 回调金额与订单不符，拒绝入账: 应付 ${dueMinor}, 实付 ${amountMinor}`);
      return { success: false, error: '回调金额与订单金额不一致', orderId };
    }

    // 记录支付流水
    const ledgerInserted = await webhookRepo.recordPaymentSuccess({
      eventId,
      order,
      userId: order.user_id,
      amountMinor,
      currency: 'CNY',
      providerPaymentId,
      payload: event,
      transaction: tx,
    });

    // 账本已留痕（重复回调 / 同交易号再次推送）时只确认幂等成功，
    // 不再推进订单、续期订阅或放额度。
    if (!ledgerInserted) {
      return { success: true, action: 'payment_already_recorded', orderId: order.id };
    }

    // 标记订单为已支付
    await webhookRepo.markOrderPaid({
      orderId: order.id,
      providerOrderId: order.provider_order_id || null,
      providerPaymentId,
      providerCustomerId: order.user_id,
      paidAmountMinor: amountMinor,
      payload: event,
      timestamp,
      transaction: tx,
    });

    const meta = orderMetadata(order);
    const productType = getOrderProductType(order);
    const billingCycle = meta.billingCycle || order.billing_cycle || 'monthly';
    const periodDays = Number(meta.periodDays) || (billingCycle === 'yearly' ? 365 : billingCycle === 'quarterly' ? 92 : 31);
    const plan = productType === 'subscription' ? await findPublicPlanByIdTx(tx, order.plan_id) : null;
    if (productType === 'subscription' && !plan) {
      throw Object.assign(new Error('订阅订单套餐不存在，已停止履约'), { code: 'PAYMENT_PLAN_NOT_FOUND' });
    }
    const creditAmount = resolveOrderCreditGrantAmount({ order, plan });
    let periodEnd = null;

    // 会员身份履约：为用户在数据库中正式开通/续期会员订阅并加固品牌资产
    if (productType === 'subscription' && order.plan_id && order.plan_id !== 'free') {
      // 品牌资产加固逻辑：若用户已有活跃订阅且未到期，有效期在原有效期基础上顺延
      const existingSub = await dataClient(tx).readOne(
        "SELECT current_period_end FROM subscriptions WHERE user_id = $1 AND status = 'active' AND current_period_end > now() ORDER BY current_period_end DESC LIMIT 1",
        [order.user_id]
      );
      const baseTimestamp = existingSub?.current_period_end
        ? new Date(existingSub.current_period_end).getTime()
        : Date.now();
      periodEnd = new Date(baseTimestamp + periodDays * 24 * 3600 * 1000).toISOString();

      await webhookRepo.syncPaymentSubscription({
        userId: order.user_id,
        provider: normalizedProvider,
        providerCustomerId: order.user_id,
        providerSubscriptionId: order.id,
        planId: order.plan_id,
        billingCycle,
        status: 'active',
        currentPeriodEnd: periodEnd,
        eventCreatedAt: timestamp,
        transaction: tx,
      });

      // 同步加固用户主表角色
      await dataClient(tx).write(
        "UPDATE auth_usr.users SET role = CASE WHEN role = 'admin' THEN 'admin' ELSE 'vip' END, updated_at = now() WHERE id = $1",
        [order.user_id]
      );
    }

    if (productType === 'subscription') {
      await grantSubscriptionCredits(
        order.user_id,
        creditAmount,
        periodEnd || new Date(Date.now() + periodDays * 24 * 3600 * 1000).toISOString(),
        `${normalizedProvider === 'wechat' ? '微信支付' : '支付宝'} 订阅订单 ${order.id} 到账`,
        order.id,
        `payment:${order.id}:credits`,
        tx,
      );
    } else if (ledgerInserted && creditAmount > 0) {
      await grantPerpetualCredits(
        order.user_id,
        creditAmount,
        `${normalizedProvider === 'wechat' ? '微信支付' : '支付宝'} 订单 ${order.id} 到账`,
        order.id,
        `payment:${order.id}:credits`,
        tx
      );
    }

    await logAudit({
      actor: { id: `system:${normalizedProvider}-webhook`, email: `system@${normalizedProvider}.local` },
      action: 'payments.native_qr_paid',
      targetType: 'order',
      targetId: order.id,
      riskLevel: 'low',
      after: { provider: normalizedProvider, orderId: order.id, productType, creditAmount, periodEnd, amountMinor },
      transaction: tx,
    });

    return { success: true, action: 'payment_recorded', orderId: order.id, productType, creditAmount, periodEnd };
  };

  return outerTransaction ? run(outerTransaction) : withTransaction(run);
}

/**
 * 厂商侧退款（商户后台手工退款、支付宝 TRADE_CLOSED 关单、微信 REFUND.* 通知）的兜底核销。
 * 动作与 Stripe charge.refunded 分支一致：退款账本留痕 + 订单置 refunded + 回收已发额度。
 * 少了这一路，钱从厂商退回用户、平台积分却原封不动，属于直接资损。
 */
async function dispatchPaymentRefundNoticeInTransaction({ provider, event, tx }) {
  const normalizedProvider = String(provider || '').toLowerCase();
  const orderId = event.out_trade_no || event.orderId;
  if (!orderId) return { success: false, error: '退款通知缺少订单号 out_trade_no' };

  const order = await webhookRepo.lockOrderInTransaction(orderId, tx);
  if (!order) return { success: false, error: '订单不存在', orderId };
  if (order.provider && String(order.provider).toLowerCase() !== normalizedProvider) {
    return { success: false, error: `退款通知渠道 ${normalizedProvider} 与订单渠道 ${order.provider} 不一致`, orderId };
  }
  // 只有已入账订单才可能是退款：未付款关单只是用户放弃支付，
  // 已 refunded 订单说明后台已核销过，重复入账会写出第二条退款流水。
  if (order.status !== 'paid') {
    return { success: true, action: order.status === 'refunded' ? 'refund_already_recorded' : 'refund_notice_not_paid', orderId: order.id, status: order.status };
  }

  const eventId = event.id || `${normalizedProvider}:${order.id}:refund`;
  const providerPaymentId = event.transaction_id || event.trade_no || order.provider_payment_id || null;
  const notifiedAmount = Number(event.refund_amount_minor || event.amount_refund || 0);
  const inserted = await webhookRepo.recordPaymentRefund({
    eventId,
    order,
    paymentIntentId: providerPaymentId,
    amountMinor: notifiedAmount > 0 ? notifiedAmount : Number(order.amount_minor || 0),
    currency: String(event.currency || order.currency || 'CNY').toUpperCase(),
    payload: event.raw || event,
    transaction: tx,
  });
  if (!inserted) return { success: true, action: 'refund_already_recorded', orderId: order.id };

  await webhookRepo.markOrderRefundedFromWebhook(order.id, now(), tx);
  const canceledSubscription = await webhookRepo.cancelPaymentSubscriptionForOrder({
    orderId: order.id,
    userId: order.user_id,
    provider: normalizedProvider,
    timestamp: now(),
    transaction: tx,
  });
  if (canceledSubscription) {
    const otherActiveSubscription = await dataClient(tx).readOne(
      "SELECT id FROM subscriptions WHERE user_id = $1 AND status IN ('active','trialing','past_due') AND current_period_end > now() LIMIT 1",
      [order.user_id],
    );
    if (!otherActiveSubscription) {
      await dataClient(tx).write(
        "UPDATE auth_usr.users SET role = 'user', updated_at = now() WHERE id = $1 AND role = 'vip'",
        [order.user_id],
      );
    }
  }
  const creditRecovery = await reversePaymentCredits({
    userId: order.user_id,
    referenceId: order.id,
    reason: `${normalizedProvider === 'wechat' ? '微信支付' : '支付宝'}订单 ${order.id} 厂商侧退款`,
    idempotencyKey: `payment:${eventId}:credits_refund`,
    transaction: tx,
  });
  await logAudit({
    actor: { id: `system:${normalizedProvider}-webhook`, email: `system@${normalizedProvider}.local` },
    action: 'payments.webhook_refund',
    targetType: 'order',
    targetId: order.id,
    riskLevel: 'high',
    before: { status: order.status },
    after: {
      provider: normalizedProvider,
      status: 'refunded',
      credit_reversed: creditRecovery?.reversedAmount ?? null,
      credit_unrecovered: creditRecovery?.unrecoveredAmount ?? null,
    },
    transaction: tx,
  });
  return { success: true, action: 'refund_recorded', orderId: order.id, creditReversed: Number(creditRecovery?.reversedAmount || 0) };
}

/**
 * 支付宝 / 微信通知的统一留痕 + 履约入口。
 * 合法到达的通知一律写 webhook_events（含重复、跳过、失败），
 * 履约未成功时绝不返回成功，避免厂商停止重试而丢失入账。
 */
export async function handleProviderPaymentWebhook({
  provider, eventId, eventType = null, payment = null, refund = null, skipReason = null,
  headers = null, eventCreatedAt = null, force = false,
}) {
  const normalizedProvider = String(provider || '').toLowerCase();
  const actor = { id: `system:${normalizedProvider}-webhook`, email: `system@${normalizedProvider}.local` };
  try {
    return await withTransaction(async (tx) => {
      const timestamp = now();
      const receipt = { provider: normalizedProvider, eventId, eventType, payment, refund: refund || null, skipReason: skipReason || null };
      const claimed = await webhookRepo.claimWebhookEvent({
        provider: normalizedProvider, eventId, eventType, eventCreatedAt, payload: receipt, headers, timestamp, transaction: tx,
      });
      if (!claimed) {
        const existing = await webhookRepo.getWebhookEventForUpdate({ provider: normalizedProvider, eventId, transaction: tx });
        if (!force && existing?.status !== 'failed' && existing?.status !== 'replay_failed') {
          return { success: true, duplicate: true, action: 'duplicate_ignored' };
        }
        await webhookRepo.markWebhookReceived({ provider: normalizedProvider, eventId, timestamp, transaction: tx });
      }

      if (refund) {
        const refundResult = await dispatchPaymentRefundNoticeInTransaction({
          provider: normalizedProvider, event: { ...refund, id: eventId }, tx,
        });
        if (refundResult.success) {
          await webhookRepo.markWebhookProcessed({ provider: normalizedProvider, eventId, timestamp, transaction: tx });
        } else {
          await webhookRepo.markWebhookFailed({
            provider: normalizedProvider, eventId,
            errorMessage: `${refundResult.error || '退款核销失败'}（订单 ${refundResult.orderId || '-'}）`,
            retryAt: new Date(Date.now() + 60_000).toISOString(), transaction: tx,
          });
        }
        await logAudit({
          actor, action: refundResult.success ? 'payments.webhook_processed' : 'payments.webhook_failed',
          targetType: 'webhook_event', targetId: eventId, riskLevel: 'high',
          after: { provider: normalizedProvider, eventType, kind: 'refund', action: refundResult.action || null, error: refundResult.error || null, orderId: refundResult.orderId || null },
          transaction: tx,
        });
        return { ...refundResult, duplicate: false };
      }

      if (!payment) {
        await webhookRepo.markWebhookProcessed({ provider: normalizedProvider, eventId, timestamp, transaction: tx });
        await logAudit({ actor, action: 'payments.webhook_skipped', targetType: 'webhook_event', targetId: eventId, riskLevel: 'low', after: { provider: normalizedProvider, eventType, reason: skipReason || '无需履约' }, transaction: tx });
        return { success: true, action: 'skipped', reason: skipReason || null, duplicate: false };
      }

      const result = await dispatchPaymentWebhook({ provider: normalizedProvider, event: { ...payment, id: eventId }, headers, transaction: tx });
      if (result.success) {
        await webhookRepo.markWebhookProcessed({ provider: normalizedProvider, eventId, timestamp, transaction: tx });
      } else {
        await webhookRepo.markWebhookFailed({
          provider: normalizedProvider, eventId,
          errorMessage: `${result.error || '履约失败'}（订单 ${result.orderId || '-'}）`,
          retryAt: new Date(Date.now() + 60_000).toISOString(), transaction: tx,
        });
      }
      await logAudit({
        actor, action: result.success ? 'payments.webhook_processed' : 'payments.webhook_failed',
        targetType: 'webhook_event', targetId: eventId, riskLevel: result.success ? 'low' : 'medium',
        after: { provider: normalizedProvider, eventType, action: result.action || null, error: result.error || null, orderId: result.orderId || null },
        transaction: tx,
      });
      return { ...result, duplicate: false };
    });
  } catch (error) {
    await webhookRepo.markWebhookFailedAfterRollback({
      provider: normalizedProvider, eventId,
      errorCode: String(error.code || 'WEBHOOK_ERROR').slice(0, 120),
      retryAt: new Date(Date.now() + 60_000).toISOString(),
    }).catch((receiptError) => console.error(`[webhook/${normalizedProvider}] 失败回执写入异常`, { code: receiptError.code || 'WEBHOOK_RECEIPT_WRITE_FAILED', eventId }));
    throw error;
  }
}

export async function recordRejectedWebhookReceipt({ provider, eventId, eventType = null, payload = null, headers = null, errorMessage }) {
  const normalizedProvider = String(provider || '').toLowerCase();
  try {
    return await withTransaction(async (tx) => webhookRepo.recordRejectedWebhook({
      provider: normalizedProvider, eventId, eventType, payload, headers,
      errorMessage: String(errorMessage || '通知被拒绝').slice(0, 500), timestamp: now(), transaction: tx,
    }));
  } catch (error) {
    console.error(`[webhook/${normalizedProvider}] 拒绝回执落库失败`, { code: error.code || 'WEBHOOK_RECEIPT_WRITE_FAILED', eventId });
    throw error;
  }
}

export async function replayWebhookEvent({ actor, eventId, requestId }) {
  const event = await webhookRepo.findWebhookEvent(eventId);
  if (!event) return { error: 'NOT_FOUND' };
  const provider = String(event.provider || 'stripe').toLowerCase();
  const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json || '{}') : (event.payload_json || {});
  let result;
  let replayError = null;
  try {
    if (provider === 'stripe') {
      result = await handleStripeWebhookEvent({ event: payload, headers: event.headers_json, force: true });
      if (result?.retryable) replayError = `${result.action || 'Webhook'} 暂未完成，仍需重试`;
    } else {
      result = await handleProviderPaymentWebhook({
        provider, eventId: event.event_id, eventType: event.event_type,
        payment: payload.payment || null,
        refund: payload.refund || null,
        skipReason: payload.skipReason || '重放：原通知未携带可履约载荷',
        headers: event.headers_json, force: true,
      });
      if (!result.success) replayError = `${result.error || result.action || 'Webhook'} 暂未完成，仍需重试`;
    }
  } catch (error) {
    replayError = `Webhook 重放失败（${String(error.code || 'WEBHOOK_ERROR').slice(0, 120)}）`;
  }
  const nextStatus = replayError ? 'replay_failed' : 'replayed';
  await withTransaction(async (tx) => {
    await webhookRepo.markWebhookReplay({ provider, eventId, status: nextStatus, replayedAt: now(), lastError: replayError, transaction: tx });
    await logAudit({ actor, action: 'webhooks.replay', targetType: 'webhook_event', targetId: eventId, riskLevel: 'medium', before: { attempts: event.attempts, status: event.status }, after: { provider, status: nextStatus, replayDetail: result?.action || null, replayError }, requestId, transaction: tx });
  });
  return { eventId, provider, status: nextStatus, detail: result?.action || null, error: replayError };
}
