import { CREDIT_PRICING_POLICY, quoteCreditsFromProviderCostCny } from '../pricing/creditPolicy.js';

/**
 * 报价价格解析（纯函数）。
 *
 * 报价里“积分从哪来、本站售价从哪来、毛利底线从哪来”必须可解释，并且两个站点
 * 用同一份规则得到同样结果。这里不查库、不读环境变量，输入是模型价盘记录和本次
 * 请求已解析出的乘数，输出是带来源与原因的确定结果；金额计算沿用现有政策常量，
 * 不引入新的商业数值。
 */
export const PRICE_POLICY_VERSION = 'price-policy-v1';

export const PRICE_CREDITS_SOURCES = Object.freeze([
  'fixed_base_credits',
  'provider_cost_margin_ceiling',
]);

export const SITE_PRICE_SOURCES = Object.freeze([
  'site_price_version',
  'credit_denomination',
]);

export const MARGIN_FLOOR_SOURCES = Object.freeze([
  'policy_default',
  'model_config',
  'time_limited_override',
]);

export const PRICE_BLOCKER_CODES = Object.freeze([
  'SITE_PRICE_NOT_EFFECTIVE',
  'SITE_PRICE_EXPIRED',
  'PRICE_POLICY_INVALID',
]);

function finiteNumber(value) {
  // 数据库空值必须保持“未知”，不能被 Number(null) 变成 0：
  // 缺成本按 0 反推会得到最低积分，缺毛利配置会被误报为“低于政策底线”。
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveMultiplier(value) {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : 1;
}

function nonEmpty(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseTime(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 把价盘记录解析为一次报价使用的价格政策。
 *
 * @param {object} input
 * @param {object} input.pricing        ai_studio.model_pricing 行（含 pricing_type/base_credits/site_price_cny 等）
 * @param {number} input.highestProviderCostCny 本次报价合格候选中最高的供应商成本（人民币）
 * @param {number} input.minCredits     价盘与政策取大后的最低积分
 * @param {{resolution?:number,duration?:number,quality?:number}} [input.formulaMultipliers]
 * @param {number} [input.now]          可控时间，默认 Date.now()
 * @param {object} [input.policy]       预留覆盖，默认 CREDIT_PRICING_POLICY
 */
export function resolveModelPricePolicy({
  pricing,
  highestProviderCostCny,
  minCredits,
  formulaMultipliers = {},
  now = Date.now(),
  policy = CREDIT_PRICING_POLICY,
} = {}) {
  const record = pricing && typeof pricing === 'object' ? pricing : {};
  const effectivePolicy = { ...CREDIT_PRICING_POLICY, ...(policy || {}) };
  // 不额外取整，保持与既有报价完全一致的最低积分口径（价盘 min_credits 可能非整数）。
  const minimumCredits = Math.max(0, finiteNumber(minCredits) ?? effectivePolicy.minimumCredits);
  const pricingType = String(record.pricing_type || 'fixed').toLowerCase() === 'formula' ? 'formula' : 'fixed';
  const baseCredits = finiteNumber(record.base_credits);
  const blockers = [];

  if (baseCredits === null || baseCredits <= 0) {
    blockers.push({ code: 'PRICE_POLICY_INVALID', reason: 'BASE_CREDITS_INVALID' });
  }

  const resolutionMultiplier = positiveMultiplier(formulaMultipliers.resolution);
  const durationMultiplier = positiveMultiplier(formulaMultipliers.duration);
  const qualityMultiplier = positiveMultiplier(formulaMultipliers.quality);
  const formulaBaseCredits = baseCredits === null || baseCredits <= 0
    ? null
    : Math.max(minimumCredits, Math.round(baseCredits * resolutionMultiplier * durationMultiplier * qualityMultiplier));
  const fixedCredits = baseCredits === null || baseCredits <= 0
    ? null
    : Math.max(minimumCredits, baseCredits);

  // 固定价：价盘积分即售价积分。公式价：现有政策以“最高合格候选成本 + 准备金 + 目标毛利”
  // 反推积分，确保同一报价内的候选切换都不突破毛利底线；公式乘数保留在快照中供解释。
  let credits = null;
  let creditsSource = null;
  let creditsReason = null;
  if (pricingType === 'formula') {
    const worstCost = finiteNumber(highestProviderCostCny);
    if (worstCost !== null && worstCost >= 0) {
      credits = quoteCreditsFromProviderCostCny(worstCost, { ...effectivePolicy, minimumCredits }).credits;
      creditsSource = 'provider_cost_margin_ceiling';
      creditsReason = 'FORMULA_CREDITS_DERIVED_FROM_WORST_ELIGIBLE_PROVIDER_COST';
    } else {
      blockers.push({ code: 'PRICE_POLICY_INVALID', reason: 'PROVIDER_COST_UNKNOWN_FOR_FORMULA' });
    }
  } else if (fixedCredits !== null) {
    credits = fixedCredits;
    creditsSource = 'fixed_base_credits';
    creditsReason = 'FIXED_BASE_CREDITS_FROM_MODEL_PRICING';
  }

  // 站点售价：锁定价盘优先，但有效期外是硬阻断，不能悄悄退回积分换算；
  // 没有锁定价盘时按积分售卖面值换算，界面与计算使用同一 cnyPerCredit。
  const lockedPrice = finiteNumber(record.site_price_cny);
  const hasLockedPrice = record.site_price_cny !== null && record.site_price_cny !== undefined
    && record.site_price_cny !== '' && lockedPrice !== null && lockedPrice >= 0;
  const validFrom = parseTime(record.price_valid_from);
  const validUntil = parseTime(record.price_valid_until);
  let sitePrice = null;
  if (hasLockedPrice) {
    if (validFrom !== null && validFrom > now) {
      blockers.push({ code: 'SITE_PRICE_NOT_EFFECTIVE', reason: 'SITE_PRICE_VALID_FROM_IN_FUTURE', validFrom: new Date(validFrom).toISOString() });
    } else if (validUntil !== null && validUntil <= now) {
      blockers.push({ code: 'SITE_PRICE_EXPIRED', reason: 'SITE_PRICE_VALID_UNTIL_PASSED', validUntil: new Date(validUntil).toISOString() });
    } else {
      sitePrice = {
        source: 'site_price_version',
        reason: 'LOCKED_SITE_PRICE_VERSION',
        cny: lockedPrice,
        versionId: record.active_site_price_version_id || null,
        validFrom: validFrom !== null ? new Date(validFrom).toISOString() : null,
        validUntil: validUntil !== null ? new Date(validUntil).toISOString() : null,
      };
    }
  }
  if (!sitePrice) {
    sitePrice = {
      source: 'credit_denomination',
      reason: 'CREDITS_TIMES_CNY_PER_CREDIT',
      cny: credits === null ? null : Number((credits * effectivePolicy.cnyPerCredit).toFixed(8)),
      versionId: null,
      validFrom: null,
      validUntil: null,
    };
  }

  // 毛利底线：限期人工覆盖 > 模型配置 > 政策默认；低于政策底线时以政策为准并说明。
  const overrideReason = nonEmpty(record.override_reason);
  const overrideExpiresAt = parseTime(record.override_expires_at);
  const overrideActive = Boolean(overrideReason && overrideExpiresAt !== null && overrideExpiresAt > now);
  const policyFloor = finiteNumber(effectivePolicy.minimumGrossMarginRate)
    ?? finiteNumber(effectivePolicy.targetContributionMarginRate) ?? 0.30;
  const configuredFloor = finiteNumber(record.min_gross_margin_rate);
  let marginFloor;
  if (overrideActive) {
    marginFloor = {
      source: 'time_limited_override',
      reason: 'ADMIN_TIME_LIMITED_OVERRIDE_ACTIVE',
      rate: 0,
      overrideReason,
      expiresAt: new Date(overrideExpiresAt).toISOString(),
    };
  } else if (configuredFloor !== null && configuredFloor >= policyFloor) {
    marginFloor = {
      source: 'model_config',
      reason: 'MODEL_MIN_GROSS_MARGIN_RATE',
      rate: configuredFloor,
      overrideReason: '',
      expiresAt: null,
    };
  } else {
    marginFloor = {
      source: 'policy_default',
      reason: configuredFloor !== null && configuredFloor < policyFloor
        ? 'MODEL_CONFIG_BELOW_POLICY_FLOOR'
        : 'PRICING_POLICY_DEFAULT',
      rate: policyFloor,
      overrideReason: '',
      expiresAt: null,
    };
  }

  return {
    policyVersion: PRICE_POLICY_VERSION,
    pricingType,
    baseCredits,
    formulaMultipliers: { resolution: resolutionMultiplier, duration: durationMultiplier, quality: qualityMultiplier },
    formulaBaseCredits,
    credits: {
      value: credits,
      source: creditsSource,
      reason: creditsReason,
      minimumCredits,
    },
    sitePrice,
    marginFloor,
    denomination: {
      cnyPerCredit: effectivePolicy.cnyPerCredit,
      providerCostReserveRate: effectivePolicy.providerCostReserveRate,
      targetContributionMarginRate: effectivePolicy.targetContributionMarginRate,
      minimumGrossMarginRate: effectivePolicy.minimumGrossMarginRate,
      creditRounding: effectivePolicy.creditRounding,
      minimumCredits: effectivePolicy.minimumCredits,
    },
    blockers,
  };
}
