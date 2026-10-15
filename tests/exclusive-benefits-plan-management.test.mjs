import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXCLUSIVE_BENEFITS,
  EXCLUSIVE_BENEFIT_KEYS,
  getDefaultExclusiveFeatures,
  syncFeaturesListWithExclusive,
} from '../lib/pricing/exclusiveBenefits.js';

import {
  COMMERCIAL_PLAN_CATALOG,
  parseFeaturesAndMeta,
  mapPlanConfig,
} from '../lib/repositories/plans.js';

import { updatePlanDetails, createPlan } from '../lib/services/billing.js';

test('专属权益定义与键名校验', () => {
  assert.ok(Array.isArray(EXCLUSIVE_BENEFITS));
  assert.equal(EXCLUSIVE_BENEFITS.length, 6);

  const expectedKeys = [
    'no_watermark',
    'exclusive_latest_models',
    'vip_speed_queue',
    'export_4k',
    'commercial_license',
    'dedicated_support',
  ];

  assert.deepEqual([...EXCLUSIVE_BENEFIT_KEYS].sort(), [...expectedKeys].sort());

  // 默认套餐特权映射
  const starterDefaults = getDefaultExclusiveFeatures('starter');
  assert.ok(starterDefaults.includes('no_watermark'));
  assert.ok(starterDefaults.includes('commercial_license'));
  assert.equal(starterDefaults.includes('exclusive_latest_models'), false);

  const basicDefaults = getDefaultExclusiveFeatures('basic');
  assert.ok(basicDefaults.includes('no_watermark'));
  assert.ok(basicDefaults.includes('vip_speed_queue'));
  assert.ok(basicDefaults.includes('export_4k'));

  const plusDefaults = getDefaultExclusiveFeatures('plus');
  assert.ok(plusDefaults.includes('exclusive_latest_models'));

  const proDefaults = getDefaultExclusiveFeatures('pro');
  assert.ok(proDefaults.includes('exclusive_latest_models'));
  assert.ok(proDefaults.includes('dedicated_support'));
});

test('syncFeaturesListWithExclusive 能正确将勾选的专属权益合并至展示特性列表', () => {
  const initial = ['基础生图通道', '每月 2,000 积分'];
  const exclusive = ['no_watermark', 'exclusive_latest_models'];

  const synced = syncFeaturesListWithExclusive(initial, exclusive);
  assert.ok(synced.some((line) => line.includes('去水印')));
  assert.ok(synced.some((line) => line.includes('首发模型专属使用权')));
  assert.equal(synced.length, 4);

  // 重复同步不会产生重复项
  const secondSync = syncFeaturesListWithExclusive(synced, exclusive);
  assert.equal(secondSync.length, 4);
});

import {
  UNIVERSAL_CREDIT_PACKS,
  EXCLUSIVE_MODEL_FAMILIES,
  findCreditPackById,
  findExclusivePackById,
  calculateExclusivePackGrant,
} from '../lib/payments/creditPacks.js';

test('COMMERCIAL_PLAN_CATALOG 默认内置专属权益与 v2.2 价格体系及 0.60 下限截断', () => {
  const expectedQuotas = { starter: 2000, basic: 5000, plus: 12000, pro: 27000 };
  const expectedMonthly = { starter: 140, basic: 350, plus: 800, pro: 1760 };
  const expectedQuarterly = { starter: 420, basic: 945, plus: 2160, pro: 4752 };
  const expectedYearly = { starter: 1680, basic: 3600, plus: 8000, pro: 17600 };

  for (const [key, plan] of Object.entries(COMMERCIAL_PLAN_CATALOG)) {
    assert.ok(Array.isArray(plan.exclusiveFeatures), `${key} 应该包含 exclusiveFeatures`);
    assert.ok(plan.exclusiveFeatures.length > 0, `${key} 应该有默认专属特权`);

    assert.equal(plan.quotaBase, expectedQuotas[key], `${key} 配额应为 ${expectedQuotas[key]}`);
    assert.equal(plan.monthlyCny, expectedMonthly[key], `${key} 月付价格应为 ${expectedMonthly[key]}`);
    assert.equal(plan.quarterlyCny, expectedQuarterly[key], `${key} 季付价格应为 ${expectedQuarterly[key]}`);
    assert.equal(plan.yearlyCny, expectedYearly[key], `${key} 年付价格应为 ${expectedYearly[key]}`);

    // 全局周期折率下限 0.60 校验
    const monthlyEffective = plan.monthlyCny / (plan.monthlyOriginCny || (plan.monthlyCny / 0.6));
    assert.ok(monthlyEffective >= 0.599, `${key} 月付有效折率不能低于 6 折`);

    const quarterlyEffective = plan.quarterlyCny / (plan.quarterlyOriginCny || (plan.monthlyOriginCny * 3));
    assert.ok(quarterlyEffective >= 0.599, `${key} 季付有效折率不能低于 6 折`);

    const yearlyEffective = plan.yearlyCny / (plan.yearlyOriginCny || (plan.monthlyOriginCny * 12));
    assert.ok(yearlyEffective >= 0.599, `${key} 年付有效折率不能低于 6 折`);
  }
});

test('通用算力包与顶级模型专属包 (v2.2 规则)', () => {
  // 1. 通用包 7 档校验
  assert.equal(UNIVERSAL_CREDIT_PACKS.length, 7);
  for (const pack of UNIVERSAL_CREDIT_PACKS) {
    assert.equal(pack.credits, pack.priceCny * 10, `${pack.id} 应严格遵守 ¥1 = 10 积分`);
    assert.equal(findCreditPackById(pack.id)?.id, pack.id);
  }

  // 2. 顶级模型专属包首批家族
  assert.equal(Object.keys(EXCLUSIVE_MODEL_FAMILIES).length, 2);
  const veoFamily = EXCLUSIVE_MODEL_FAMILIES.veo;
  const seedanceFamily = EXCLUSIVE_MODEL_FAMILIES.seedance;
  assert.ok(veoFamily);
  assert.ok(seedanceFamily);
  assert.equal(veoFamily.refCostCredits, 910);
  assert.equal(seedanceFamily.refCostCredits, 625);

  // 3. 专属包发放与首购加赠计算
  const veo350 = findExclusivePackById('exclusive_veo_350');
  assert.ok(veo350);
  assert.equal(veo350.standardTotalCredits, 350 * 16); // 5600
  // 首购加赠: min(350 * 2, 1400) = 700
  const grantFirst = calculateExclusivePackGrant(veo350, true);
  assert.equal(grantFirst.purchasedCredits, 3500);
  assert.equal(grantFirst.standardBonusCredits, 2100);
  assert.equal(grantFirst.firstBonusCredits, 700);
  assert.equal(grantFirst.totalCredits, 6300);

  // 非首购无加赠
  const grantRepeat = calculateExclusivePackGrant(veo350, false);
  assert.equal(grantRepeat.firstBonusCredits, 0);
  assert.equal(grantRepeat.totalCredits, 5600);

  // 大额专属包封顶 1400 加赠
  const veo1400 = findExclusivePackById('exclusive_veo_1400');
  const grant1400 = calculateExclusivePackGrant(veo1400, true);
  assert.equal(grant1400.firstBonusCredits, 1400);
  assert.equal(grant1400.totalCredits, 1400 * 16 + 1400); // 22400 + 1400 = 23800
});

test('parseFeaturesAndMeta 正确解析包含 exclusiveFeatures 的元数据结构', () => {
  const rawFeatures = {
    items: ['测试权益 1', '测试权益 2'],
    meta: {
      quotaBase: 8888,
      concurrency: 5,
      storageGb: 50,
      exclusiveFeatures: ['no_watermark', 'exclusive_latest_models'],
    },
  };

  const parsed = parseFeaturesAndMeta(rawFeatures, 'custom_tier');
  assert.equal(parsed.meta.quotaBase, 8888);
  assert.equal(parsed.meta.concurrency, 5);
  assert.equal(parsed.meta.storageGb, 50);
  assert.deepEqual(parsed.meta.exclusiveFeatures, ['no_watermark', 'exclusive_latest_models']);
});

test('mapPlanConfig 优先采用数据库中的定制属性，而不是被硬编码价盘擦除', () => {
  const dbRow = {
    id: 'starter',
    name: 'Starter 自定义运营版',
    monthly_cny: 159,
    monthly_usd: 22,
    display_order: 1,
    enabled: true,
    features_json: {
      items: ['自定义权益A', '自定义权益B'],
      meta: {
        quotaBase: 3000,
        concurrency: 3,
        storageGb: 10,
        badge: '运营特惠',
        exclusiveFeatures: ['no_watermark', 'vip_speed_queue', 'commercial_license'],
      },
    },
  };

  const plan = mapPlanConfig(dbRow);
  assert.equal(plan.name, 'Starter 自定义运营版');
  assert.equal(plan.monthlyCny, 159);
  assert.equal(plan.monthlyUsd, 22);
  assert.equal(plan.quotaBase, 3000);
  assert.equal(plan.concurrency, 3);
  assert.equal(plan.storageGb, 10);
  assert.equal(plan.badge, '运营特惠');
  assert.deepEqual(plan.exclusiveFeatures, ['no_watermark', 'vip_speed_queue', 'commercial_license']);
  assert.ok(plan.features.includes('自定义权益A'));
});
