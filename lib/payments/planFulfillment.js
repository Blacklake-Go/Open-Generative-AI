import { findCreditPackById, findExclusivePackById } from './creditPacks.js';

export function getPlanCreditGrantAmount(plan) {
  if (String(plan?.id || '').toLowerCase() === 'free') return 0;

  const base = Number(plan?.quotaBase);
  const bonus = Number(plan?.quotaBonus || 0);
  const total = base + bonus;
  if (!Number.isSafeInteger(base) || base < 0
    || !Number.isSafeInteger(bonus) || bonus < 0
    || !Number.isSafeInteger(total) || total <= 0) {
    throw Object.assign(new Error('付费套餐缺少有效的算力发放配置'), {
      code: 'PLAN_CREDIT_AMOUNT_INVALID',
    });
  }
  return total;
}

export function normalizeBillingCycle(value, { productType = 'subscription' } = {}) {
  const cycle = String(value || 'monthly').trim().toLowerCase();
  if (productType === 'credit_pack' || productType === 'exclusive_pack') {
    if (cycle === 'one_time') return cycle;
    return 'one_time';
  }
  if (!['monthly', 'quarterly', 'yearly'].includes(cycle)) {
    throw Object.assign(new Error('订阅套餐周期必须为月付 (monthly)、季付 (quarterly) 或年付 (yearly)'), {
      code: 'BILLING_CYCLE_UNAVAILABLE',
    });
  }
  return cycle;
}

function readOrderMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getOrderProductType(order) {
  const metadata = readOrderMetadata(order?.metadata_json);
  const explicit = metadata.productType || metadata.product_type;
  if (explicit) {
    const productType = String(explicit).trim().toLowerCase();
    if (productType !== 'subscription' && productType !== 'credit_pack' && productType !== 'exclusive_pack') {
      throw Object.assign(new Error('订单商品类型无效，不能履约'), { code: 'ORDER_PRODUCT_TYPE_INVALID' });
    }
    return productType;
  }

  // 若元数据缺失，根据 plan_id 与套餐/算力包注册表推导
  const planId = String(order?.plan_id || '').trim().toLowerCase();
  if (findCreditPackById(planId)) return 'credit_pack';
  if (findExclusivePackById(planId)) return 'exclusive_pack';
  if (['basic', 'pro', 'max', 'enterprise', 'starter', 'free'].includes(planId)) return 'subscription';

  if (order?.billing_cycle === 'one_time') {
    if (planId.startsWith('exclusive_')) return 'exclusive_pack';
    return 'credit_pack';
  }
  if (['monthly', 'quarterly', 'yearly'].includes(String(order?.billing_cycle || '').toLowerCase())) {
    return 'subscription';
  }

  throw Object.assign(new Error(`无法安全判定订单 [${order?.id || 'unknown'}] 的商品类型 (plan: ${planId})，拒绝默认按订阅履约`), {
    code: 'ORDER_PRODUCT_TYPE_AMBIGUOUS',
  });
}

export function resolveOrderCreditGrantAmount({ order, plan }) {
  const metadata = readOrderMetadata(order?.metadata_json);
  const productType = getOrderProductType(order);
  const snapshotPlanId = metadata.productId ?? metadata.product_id ?? metadata.planId ?? metadata.plan_id;
  if (snapshotPlanId && order?.plan_id && snapshotPlanId !== order.plan_id) {
    throw Object.assign(new Error('订单套餐快照与实际订单不一致，不能履约'), {
      code: 'ORDER_PLAN_SNAPSHOT_MISMATCH',
    });
  }
  const billingCycle = order?.billing_cycle || metadata.billingCycle || metadata.billing_cycle || ((productType === 'credit_pack' || productType === 'exclusive_pack') ? 'one_time' : 'monthly');
  normalizeBillingCycle(billingCycle, { productType });
  const snapshot = metadata.creditAmount ?? metadata.credit_amount;

  if (productType === 'credit_pack') {
    const pack = findCreditPackById(order?.plan_id || snapshotPlanId);
    const amount = Number(snapshot);
    if (!pack || !Number.isSafeInteger(amount) || amount !== pack.credits) {
      throw Object.assign(new Error('通用算力包订单快照无效，不能履约'), { code: 'CREDIT_PACK_SNAPSHOT_INVALID' });
    }
    return pack.credits;
  }

  if (productType === 'exclusive_pack') {
    const pack = findExclusivePackById(order?.plan_id || snapshotPlanId);
    const amount = Number(snapshot);
    if (!pack || !Number.isSafeInteger(amount) || amount <= 0) {
      throw Object.assign(new Error('专属算力包订单快照无效，不能履约'), { code: 'EXCLUSIVE_PACK_SNAPSHOT_INVALID' });
    }
    return amount;
  }

  if (snapshot !== undefined && snapshot !== null) {
    const amount = Number(snapshot);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw Object.assign(new Error('订单中的算力快照无效，不能履约'), {
        code: 'ORDER_CREDIT_SNAPSHOT_INVALID',
      });
    }
    return amount;
  }
  return getPlanCreditGrantAmount(plan);
}

