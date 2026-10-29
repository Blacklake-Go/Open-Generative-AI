import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CREDIT_PRICING_POLICY } from '../../lib/pricing/creditPolicy.js';
import {
  PRICE_SOURCES,
  calculateAutoPrice,
  getEffectiveMultiplier,
  getEffectivePrice,
  getSpecMultiplier,
  resolveEffectivePrice,
} from '../../lib/services/pricingStrategy.js';

const NOW = Date.parse('2026-10-29T08:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const PAST = '2026-10-01T00:00:00.000Z';

function strategy(overrides = {}) {
  return {
    base_multiplier: 1.5,
    min_margin_rate: 0.3,
    rounding_strategy: 'ceil_to_0.01',
    category_multipliers: {},
    tier_multipliers: {},
    spec_multipliers: {},
    ...overrides,
  };
}

function modelPricing(overrides = {}) {
  return {
    pricing_mode: 'auto',
    price_locked: false,
    site_price_cny: null,
    auto_suggested_price_cny: null,
    manual_override_price_cny: null,
    override_expires_at: null,
    price_valid_until: null,
    ...overrides,
  };
}

test('向下取整与四舍五入不得把建议价压到毛利底线之下', () => {
  // 成本 10 / (1 - 0.30) = 14.2857…；floor 会得到 14.28，低于底线，必须抬回 14.29。
  const floored = calculateAutoPrice(
    { lowestChannelCostCny: 10, category: 'image', tier: 'core' },
    strategy({ base_multiplier: 1.0, rounding_strategy: 'floor_to_0.01' }),
  );
  assert.equal(floored.roundingRaisedToMarginFloor, true);
  assert.equal(floored.reason, 'ROUNDING_RAISED_TO_MARGIN_FLOOR');
  assert.equal(floored.suggestedPrice, 14.29);
  assert.ok(floored.suggestedPrice >= floored.minPriceForMarginCny);
  assert.ok(floored.marginRate >= floored.minMarginRate);

  // 成本 13 / 0.7 = 18.5714…；round 会得到 18.57，同样低于底线，必须抬回 18.58。
  const rounded = calculateAutoPrice(
    { lowestChannelCostCny: 13, category: 'image', tier: 'core' },
    strategy({ base_multiplier: 1.0, rounding_strategy: 'round_to_0.01' }),
  );
  assert.equal(rounded.roundingRaisedToMarginFloor, true);
  assert.equal(rounded.suggestedPrice, 18.58);
  assert.ok(rounded.marginRate >= rounded.minMarginRate);
});

test('向上取整策略保持原值，且倍率高于底线时原因明确', () => {
  const ceilCent = calculateAutoPrice(
    { lowestChannelCostCny: 10, category: 'image', tier: 'core' },
    strategy({ base_multiplier: 1.0 }),
  );
  assert.equal(ceilCent.roundingRaisedToMarginFloor, false);
  assert.equal(ceilCent.reason, 'MARGIN_FLOOR_ABOVE_MULTIPLIER');
  assert.equal(ceilCent.suggestedPrice, 14.29);

  const ceilTenth = calculateAutoPrice(
    { lowestChannelCostCny: 10, category: 'image', tier: 'core' },
    strategy({ base_multiplier: 1.0, rounding_strategy: 'ceil_to_0.1' }),
  );
  assert.equal(ceilTenth.suggestedPrice, 14.3);
  assert.ok(ceilTenth.marginRate >= ceilTenth.minMarginRate);

  const aboveFloor = calculateAutoPrice(
    { lowestChannelCostCny: 2, category: 'image', tier: 'core' },
    strategy({ base_multiplier: 10 }),
  );
  assert.equal(aboveFloor.reason, 'MULTIPLIER_ABOVE_MARGIN_FLOOR');
  assert.equal(aboveFloor.suggestedPrice, 20);
  assert.equal(aboveFloor.roundingRaisedToMarginFloor, false);
});

test('渠道成本未知时不编造建议价，而是返回空值与原因', () => {
  for (const cost of [null, undefined, 0, -1, 'abc']) {
    const result = calculateAutoPrice({ lowestChannelCostCny: cost, category: 'video', tier: 'core' }, strategy());
    assert.equal(result.suggestedPrice, null);
    assert.equal(result.marginRate, null);
    assert.equal(result.minPriceForMarginCny, null);
    assert.equal(result.reason, 'LOWEST_CHANNEL_COST_UNKNOWN');
  }
});

test('分类/分级倍率与规格倍率按既有档位取值', () => {
  const effective = getEffectiveMultiplier(
    { category: 'video', tier: 'backup' },
    strategy({ base_multiplier: 1.5, category_multipliers: { video: 2 }, tier_multipliers: { backup: 0.5 } }),
  );
  assert.equal(effective, 1);

  const fallbackToBase = getEffectiveMultiplier(
    { category: 'unknown', tier: 'unknown' },
    strategy({ base_multiplier: 1.8, category_multipliers: { video: 2 } }),
  );
  assert.equal(fallbackToBase, 1.8);

  const specStrategy = strategy({
    spec_multipliers: {
      resolution: { '4k': 2, '2k': 1.5, '1k': 1, '720p': 0.8 },
      duration: { '60s': 2.5, '30s': 1.8, '10s': 1.2, '5s': 1 },
    },
  });
  assert.equal(getSpecMultiplier({ resolution: '4K', duration: '10s' }, specStrategy), 2 * 1.2);
  // 12 秒没有精确档位，取最近的 10 秒档。
  assert.equal(getSpecMultiplier({ duration: 12 }, specStrategy), 1.2);
  assert.equal(getSpecMultiplier({ duration: 55 }, specStrategy), 2.5);
  assert.equal(getSpecMultiplier({}, specStrategy), 1);
});

test('有效价优先级：有效期内锁定价 > 人工覆盖价 > 自动建议价', () => {
  const locked = resolveEffectivePrice(modelPricing({
    pricing_mode: 'locked',
    price_locked: true,
    site_price_cny: 12.6,
    manual_override_price_cny: 11,
    auto_suggested_price_cny: 10,
    price_valid_until: FUTURE,
  }), { now: NOW });
  assert.deepEqual(locked, {
    priceCny: 12.6,
    source: 'locked_site_price',
    reason: 'LOCKED_SITE_PRICE_ACTIVE',
    mode: 'locked',
    expiresAt: FUTURE,
    expired: false,
  });

  const manual = resolveEffectivePrice(modelPricing({
    pricing_mode: 'manual',
    site_price_cny: 12.6,
    manual_override_price_cny: 11,
    auto_suggested_price_cny: 10,
    override_expires_at: FUTURE,
  }), { now: NOW });
  assert.equal(manual.priceCny, 11);
  assert.equal(manual.source, 'manual_override_price');
  assert.equal(manual.reason, 'MANUAL_OVERRIDE_ACTIVE');
  assert.equal(manual.mode, 'manual');
  assert.equal(manual.expired, false);

  const auto = resolveEffectivePrice(modelPricing({ auto_suggested_price_cny: 10 }), { now: NOW });
  assert.equal(auto.priceCny, 10);
  assert.equal(auto.source, 'auto_suggested_price');
  assert.equal(auto.reason, 'AUTO_SUGGESTED_PRICE');
  assert.equal(auto.mode, 'auto');
});

test('人工价过期后不再收费，回退自动建议价并明确原因', () => {
  const fallback = resolveEffectivePrice(modelPricing({
    pricing_mode: 'manual',
    manual_override_price_cny: 11,
    auto_suggested_price_cny: 10,
    override_expires_at: PAST,
  }), { now: NOW });
  assert.equal(fallback.priceCny, 10);
  assert.equal(fallback.source, 'auto_suggested_price');
  assert.equal(fallback.reason, 'MANUAL_PRICE_EXPIRED_FALLBACK_TO_AUTO');
  assert.equal(fallback.expired, true);

  const noAuto = resolveEffectivePrice(modelPricing({
    pricing_mode: 'locked',
    price_locked: true,
    site_price_cny: 12.6,
    price_valid_until: PAST,
  }), { now: NOW });
  assert.equal(noAuto.priceCny, null);
  assert.equal(noAuto.source, 'unconfigured');
  assert.equal(noAuto.reason, 'MANUAL_PRICE_EXPIRED_AND_NO_AUTO_PRICE');
  assert.equal(noAuto.expired, true);
});

test('人工模式缺少人工价时回退自动价，缺价不隐式变成 0 或免费', () => {
  const fallback = resolveEffectivePrice(modelPricing({
    pricing_mode: 'manual',
    auto_suggested_price_cny: 10,
  }), { now: NOW });
  assert.equal(fallback.priceCny, 10);
  assert.equal(fallback.reason, 'MANUAL_PRICE_MISSING_FALLBACK_TO_AUTO');

  const missing = resolveEffectivePrice(modelPricing({ pricing_mode: 'manual' }), { now: NOW });
  assert.equal(missing.priceCny, null);
  assert.equal(missing.source, 'unconfigured');
  assert.equal(missing.reason, 'MANUAL_PRICE_MISSING_AND_NO_AUTO_PRICE');

  const autoMissing = resolveEffectivePrice(modelPricing(), { now: NOW });
  assert.equal(autoMissing.priceCny, null);
  assert.equal(autoMissing.source, 'unconfigured');
  assert.equal(autoMissing.reason, 'AUTO_PRICE_NOT_GENERATED');
});

test('兼容入口 getEffectivePrice 只返回数值，且不修改传入模型', () => {
  const record = modelPricing({ pricing_mode: 'manual', manual_override_price_cny: 11, override_expires_at: FUTURE });
  const snapshot = JSON.parse(JSON.stringify(record));
  assert.equal(getEffectivePrice(record), 11);
  assert.equal(getEffectivePrice(modelPricing()), null);
  assert.deepEqual(record, snapshot);
  assert.equal(resolveEffectivePrice(null).source, 'unconfigured');
});

test('解析出的来源都在 PRICE_SOURCES 常量内', () => {
  const samples = [
    modelPricing({ auto_suggested_price_cny: 10 }),
    modelPricing({ pricing_mode: 'manual', manual_override_price_cny: 11 }),
    modelPricing({ pricing_mode: 'locked', price_locked: true, site_price_cny: 12 }),
    modelPricing(),
  ];
  for (const sample of samples) {
    const { source } = resolveEffectivePrice(sample, { now: NOW });
    assert.ok(PRICE_SOURCES.includes(source), `unexpected source ${source}`);
  }
  assert.deepEqual([...PRICE_SOURCES], [
    'locked_site_price',
    'manual_override_price',
    'auto_suggested_price',
    'unconfigured',
  ]);
});

test('商业数值仍来自唯一政策源，后台建议价不另立积分换算', () => {
  assert.deepEqual({ ...CREDIT_PRICING_POLICY }, {
    cnyPerCredit: 0.07,
    providerCostReserveRate: 0.1,
    targetContributionMarginRate: 0.3,
    minimumGrossMarginRate: 0.3,
    creditRounding: 5,
    minimumCredits: 10,
  });

  const defaultMargin = calculateAutoPrice(
    { lowestChannelCostCny: 10, category: 'image', tier: 'core' },
    strategy({ base_multiplier: 1.0 }),
  );
  assert.equal(defaultMargin.minMarginRate, CREDIT_PRICING_POLICY.minimumGrossMarginRate);

  // 守卫：后台建议价模块不得再声明一套 ¥/积分、准备金或毛利底线常数。
  const source = readFileSync(
    fileURLToPath(new URL('../../lib/services/pricingStrategy.js', import.meta.url)),
    'utf8',
  );
  assert.equal(source.includes('0.07'), false, 'pricingStrategy.js 不应重复定义积分面值');
  assert.equal(source.includes('providerCostReserveRate'), false, 'pricingStrategy.js 不应重复定义准备金率');
});
