import 'server-only';

import { countActiveCreationsByUserId } from '../repositories/creations.js';
import { findActiveUserSubscriptionPlan } from '../repositories/billing.js';
import { countActiveAttemptsByProviderModel } from '../repositories/attempts.js';

// Default concurrency limits per subscription tier (realistic and production safe)
const TIER_CONCURRENCY_DEFAULTS = Object.freeze({
  free: 1,
  starter: 2,
  basic: 4,
  plus: 6,
  pro: 8,
  team: 10,
  ultra: 12,
});

/**
 * Check user-level concurrency: how many generation tasks are currently processing for this user.
 */
export async function getUserActiveConcurrency(userId, transaction = null) {
  return countActiveCreationsByUserId(userId, transaction);
}

/**
 * Get the user's concurrency limit based on their subscription tier.
 */
export async function getUserConcurrencyLimit(userId, transaction = null) {
  const sub = await findActiveUserSubscriptionPlan(userId, transaction);
  if (sub?.features_json) {
    const features = typeof sub.features_json === 'string' ? JSON.parse(sub.features_json) : sub.features_json;
    const concurrencyVal = features?.meta?.concurrency ?? features?.concurrency;
    if (Number.isFinite(Number(concurrencyVal))) return Number(concurrencyVal);
  }
  const planId = String(sub?.plan_id || 'free').toLowerCase();
  return TIER_CONCURRENCY_DEFAULTS[planId] || TIER_CONCURRENCY_DEFAULTS.free;
}

/**
 * Check provider-level concurrency: how many active attempts exist for this provider model.
 */
export async function getProviderModelActiveConcurrency(providerId, providerModelId, transaction = null) {
  return countActiveAttemptsByProviderModel(providerId, providerModelId, transaction);
}

/**
 * Perform full concurrency check. Returns { allowed, reason, activeCount, limit }.
 */
export async function checkConcurrency({ userId, modelId = null, transaction = null } = {}) {
  const [activeCount, limit] = await Promise.all([
    getUserActiveConcurrency(userId, transaction),
    getUserConcurrencyLimit(userId, transaction),
  ]);
  
  if (activeCount >= limit) {
    return {
      allowed: false,
      reason: 'USER_CONCURRENCY_EXCEEDED',
      activeCount,
      limit,
      message: `当前有 ${activeCount} 个任务正在处理，最多允许 ${limit} 个同时进行。请等待当前任务完成后重试。`,
    };
  }
  
  return { allowed: true, activeCount, limit };
}
