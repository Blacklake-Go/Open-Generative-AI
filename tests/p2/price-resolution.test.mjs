import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDIT_PRICING_POLICY,
  quoteCreditsFromProviderCostCny,
} from '../../lib/pricing/creditPolicy.js';
import {
  MARGIN_FLOOR_SOURCES,
  PRICE_BLOCKER_CODES,
  PRICE_CREDITS_SOURCES,
  PRICE_POLICY_VERSION,
  resolveModelPricePolicy,
  SITE_PRICE_SOURCES,
} from '../../lib/modelCenter/priceResolution.js';

const NOW = Date.parse('2026-10-29T08:00:00.000Z');

function pricing(overrides = {}) {
  return {
    pricing_type: 'fixed',
    base_credits: 30,
    min_credits: 10,
    site_price_cny: null,
    price_valid_from: null,
    price_valid_until: null,
    active_site_price_version_id: null,
    min_gross_margin_rate: null,
    override_reason: null,
    override_expires_at: null,
    ...overrides,
  };
}

function resolve(overrides = {}, input = {}) {
  return resolveModelPricePolicy({
    pricing: pricing(overrides),
    highestProviderCostCny: 1,
    minCredits: 10,
    now: NOW,
    ...input,
  });
}

test('固定价：积分来自价盘基础积分，无锁定价时按积分面值换算站点售价', () => {
  const result = resolve();
  assert.equal(result.policyVersion, PRICE_POLICY_VERSION);
  assert.equal(result.pricingType, 'fixed');
  assert.equal(result.credits.value, 30);
  assert.equal(result.credits.source, 'fixed_base_credits');
  assert.equal(result.credits.reason, 'FIXED_BASE_CREDITS_FROM_MODEL_PRICING');
  assert.equal(result.credits.minimumCredits, 10);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.sitePrice.source, 'credit_denomination');
  assert.equal(result.sitePrice.reason, 'CREDITS_TIMES_CNY_PER_CREDIT');
  assert.equal(result.sitePrice.cny, Number((30 * CREDIT_PRICING_POLICY.cnyPerCredit).toFixed(8)));
});

test('固定价：供应商成本不参与积分计算，缺成本也不改变固定报价', () => {
  const withCost = resolve({}, { highestProviderCostCny: 999 });
  const withoutCost = resolve({}, { highestProviderCostCny: null });
  assert.equal(withCost.credits.value, 30);
  assert.equal(withoutCost.credits.value, 30);
  assert.deepEqual(withCost.blockers, []);
  assert.deepEqual(withoutCost.blockers, []);
});

test('固定价：最低积分与基础积分都不额外取整，沿用现有价盘口径', () => {
  const result = resolve({ base_credits: 10.5, min_credits: 12.5 }, { minCredits: 12.5 });
  assert.equal(result.credits.minimumCredits, 12.5);
  assert.equal(result.credits.value, 12.5);

  const aboveFloor = resolve({ base_credits: 10.5, min_credits: 4 }, { minCredits: 10 });
  assert.equal(aboveFloor.credits.value, 10.5);
});

test('锁定价盘：有效期内使用站点售价版本，并保留版本号与有效期', () => {
  const result = resolve({
    site_price_cny: 12.6,
    active_site_price_version_id: 'spv_123',
    price_valid_from: '2026-10-01T00:00:00.000Z',
    price_valid_until: '2026-12-01T00:00:00.000Z',
  });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.sitePrice.source, 'site_price_version');
  assert.equal(result.sitePrice.reason, 'LOCKED_SITE_PRICE_VERSION');
  assert.equal(result.sitePrice.cny, 12.6);
  assert.equal(result.sitePrice.versionId, 'spv_123');
  assert.equal(result.sitePrice.validFrom, '2026-10-01T00:00:00.000Z');
  assert.equal(result.sitePrice.validUntil, '2026-12-01T00:00:00.000Z');
  assert.equal(result.credits.value, 30);
});

test('锁定价盘：未生效与已过期都是硬阻断，不退回积分换算', () => {
  const future = resolve({ site_price_cny: 12.6, price_valid_from: '2026-11-01T00:00:00.000Z' });
  assert.ok(future.blockers.some((item) => item.code === 'SITE_PRICE_NOT_EFFECTIVE'
    && item.reason === 'SITE_PRICE_VALID_FROM_IN_FUTURE'));
  assert.equal(future.sitePrice.source, 'credit_denomination');

  const expired = resolve({ site_price_cny: 12.6, price_valid_until: '2026-10-29T07:59:59.000Z' });
  assert.ok(expired.blockers.some((item) => item.code === 'SITE_PRICE_EXPIRED'
    && item.reason === 'SITE_PRICE_VALID_UNTIL_PASSED'));
  assert.equal(expired.sitePrice.source, 'credit_denomination');
});

test('公式价：积分由最高合格候选成本反推，与既有政策函数逐值一致并保留公式基础积分', () => {
  const formula = {
    pricing_type: 'formula',
    base_credits: 20,
    min_credits: 10,
  };
  const result = resolve(formula, {
    highestProviderCostCny: 2.4,
    minCredits: 10,
    formulaMultipliers: { resolution: 2, duration: 1.5, quality: 1 },
  });
  const expected = quoteCreditsFromProviderCostCny(2.4, { minimumCredits: 10 });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.credits.value, expected.credits);
  assert.equal(result.credits.source, 'provider_cost_margin_ceiling');
  assert.equal(result.credits.reason, 'FORMULA_CREDITS_DERIVED_FROM_WORST_ELIGIBLE_PROVIDER_COST');
  assert.equal(result.formulaBaseCredits, Math.max(10, Math.round(20 * 2 * 1.5 * 1)));
  assert.deepEqual(result.formulaMultipliers, { resolution: 2, duration: 1.5, quality: 1 });
});

test('公式价：缺少可用成本时阻断可靠报价，不按 0 或免费处理', () => {
  const missing = resolve({ pricing_type: 'formula' }, { highestProviderCostCny: null });
  assert.ok(missing.blockers.some((item) => item.code === 'PRICE_POLICY_INVALID'
    && item.reason === 'PROVIDER_COST_UNKNOWN_FOR_FORMULA'));
  assert.equal(missing.credits.value, null);
  assert.equal(missing.credits.source, null);
});

test('价盘缺少有效基础积分时阻断，不把缺失积分当成 0 或免费', () => {
  const zero = resolve({ base_credits: 0 });
  assert.ok(zero.blockers.some((item) => item.code === 'PRICE_POLICY_INVALID' && item.reason === 'BASE_CREDITS_INVALID'));
  assert.equal(zero.credits.value, null);

  const missing = resolve({ base_credits: null });
  assert.ok(missing.blockers.some((item) => item.reason === 'BASE_CREDITS_INVALID'));
  assert.equal(missing.credits.value, null);
});

test('毛利底线：政策默认、模型配置、限期覆盖的优先级与原因', () => {
  const policyDefault = resolve();
  assert.equal(policyDefault.marginFloor.source, 'policy_default');
  assert.equal(policyDefault.marginFloor.reason, 'PRICING_POLICY_DEFAULT');
  assert.equal(policyDefault.marginFloor.rate, CREDIT_PRICING_POLICY.minimumGrossMarginRate);

  const modelConfig = resolve({ min_gross_margin_rate: 0.45 });
  assert.equal(modelConfig.marginFloor.source, 'model_config');
  assert.equal(modelConfig.marginFloor.reason, 'MODEL_MIN_GROSS_MARGIN_RATE');
  assert.equal(modelConfig.marginFloor.rate, 0.45);

  const belowFloor = resolve({ min_gross_margin_rate: 0.1 });
  assert.equal(belowFloor.marginFloor.source, 'policy_default');
  assert.equal(belowFloor.marginFloor.reason, 'MODEL_CONFIG_BELOW_POLICY_FLOOR');
  assert.equal(belowFloor.marginFloor.rate, CREDIT_PRICING_POLICY.minimumGrossMarginRate);

  const override = resolve({
    min_gross_margin_rate: 0.45,
    override_reason: '促销期管理员批准',
    override_expires_at: '2026-11-01T00:00:00.000Z',
  });
  assert.equal(override.marginFloor.source, 'time_limited_override');
  assert.equal(override.marginFloor.reason, 'ADMIN_TIME_LIMITED_OVERRIDE_ACTIVE');
  assert.equal(override.marginFloor.rate, 0);
  assert.equal(override.marginFloor.overrideReason, '促销期管理员批准');
  assert.equal(override.marginFloor.expiresAt, '2026-11-01T00:00:00.000Z');

  const expiredOverride = resolve({
    min_gross_margin_rate: 0.45,
    override_reason: '促销期管理员批准',
    override_expires_at: '2026-10-28T00:00:00.000Z',
  });
  assert.equal(expiredOverride.marginFloor.source, 'model_config');
  assert.equal(expiredOverride.marginFloor.rate, 0.45);
});

test('积分面值与准备金政策与本仓库唯一政策源逐值一致，未被本批改动', () => {
  const result = resolve();
  assert.deepEqual(result.denomination, {
    cnyPerCredit: 0.07,
    providerCostReserveRate: 0.1,
    targetContributionMarginRate: 0.3,
    minimumGrossMarginRate: 0.3,
    creditRounding: 5,
    minimumCredits: 10,
  });
  assert.equal(result.denomination.cnyPerCredit, CREDIT_PRICING_POLICY.cnyPerCredit);
  assert.equal(result.denomination.creditRounding, CREDIT_PRICING_POLICY.creditRounding);
});

test('同一输入重复解析结果深度相等，两站报价路径共用同一规则', () => {
  const overrides = {
    pricing_type: 'formula',
    base_credits: 25,
    min_credits: 10,
    site_price_cny: 9.8,
    active_site_price_version_id: 'spv_9',
    price_valid_from: '2026-10-01T00:00:00.000Z',
    price_valid_until: '2026-12-31T00:00:00.000Z',
    min_gross_margin_rate: 0.4,
  };
  const input = { highestProviderCostCny: 1.7, minCredits: 10, formulaMultipliers: { resolution: 1.2 } };
  assert.deepEqual(resolve(overrides, input), resolve(overrides, input));
});

test('来源与阻断码常量完整覆盖解析器可能返回的值', () => {
  const overridesList = [
    {},
    { pricing_type: 'formula' },
    { site_price_cny: 9, price_valid_until: '2026-10-01T00:00:00.000Z' },
    { site_price_cny: 9, price_valid_from: '2026-12-01T00:00:00.000Z' },
    { base_credits: 0 },
    { override_reason: 'x', override_expires_at: '2026-11-01T00:00:00.000Z' },
    { min_gross_margin_rate: 0.9 },
  ];
  for (const overrides of overridesList) {
    const result = resolve(overrides);
    if (result.credits.source) assert.ok(PRICE_CREDITS_SOURCES.includes(result.credits.source));
    if (result.sitePrice.source) assert.ok(SITE_PRICE_SOURCES.includes(result.sitePrice.source));
    assert.ok(MARGIN_FLOOR_SOURCES.includes(result.marginFloor.source));
    for (const blocker of result.blockers) assert.ok(PRICE_BLOCKER_CODES.includes(blocker.code));
  }
});
