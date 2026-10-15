import 'server-only';

import { queryOne, queryMany, execute } from '../db/index.js';
import { getDefaultExclusiveFeatures } from '../pricing/exclusiveBenefits.js';

// 订阅价盘的唯一规范来源。四档付费套餐月付依次为 6折、7折、8折、8.8折；
// 周期定价下限为 6 折（BASE 季/年付均为 6 折，STAR 年付约束为 6 折，PRO/APEX 享季付 9 折与年付 10/12 系数）。
// BASE: 2,000分/月 (¥140); STAR: 5,000分/月 (¥350); PRO: 12,000分/月 (¥800); APEX: 27,000分/月 (¥1,760)。
export const COMMERCIAL_PLAN_CATALOG = Object.freeze({
  starter: {
    id: 'starter',
    codeName: 'BASE',
    name: 'Starter (入门探索版)',
    standardMonthlyCny: 233.33,
    tierDiscountRate: 0.60,
    monthlyOriginCny: 233.33,
    monthlyCny: 140,
    monthlyOriginUsd: 33.33,
    monthlyUsd: 20,
    quarterlyOriginCny: 700,
    quarterlyCny: 420,
    quarterlyOriginUsd: 100,
    quarterlyUsd: 60,
    yearlyOriginCny: 2800,
    yearlyCny: 1680,
    yearlyOriginUsd: 400,
    yearlyUsd: 240,
    quotaBase: 2000,
    monthlyCredits: 2000,
    concurrency: 2,
    asyncConcurrency: 2,
    portraitCapacity: 2,
    storageGb: 5,
    badge: '',
    exclusiveFeatures: ['no_watermark', 'commercial_license'],
    videoFeatures: [
      '已开放视频模型按量调用',
      '专享异步并发: 2 路并行生成',
      '普通队列优先调度',
    ],
    imageFeatures: [
      '图像模型按量使用与规格透明报价',
      '无水印纯净导出支持',
    ],
    moreFeatures: [
      '授权数字人像容量: 2 个',
      '5GB 云端资产库空间',
      '个人商用授权许可',
    ],
    features: [
      '每月 2,000 创作积分',
      '任务并发: 2 路同时生成',
      '授权人像容量: 2 个',
      '支持范围内无水印导出',
      '5GB 云端资产库空间',
      '个人商用授权',
    ],
  },
  basic: {
    id: 'basic',
    codeName: 'STAR',
    name: 'Basic (进阶创作者)',
    standardMonthlyCny: 500,
    tierDiscountRate: 0.70,
    monthlyOriginCny: 500,
    monthlyCny: 350,
    monthlyOriginUsd: 71.43,
    monthlyUsd: 50,
    quarterlyOriginCny: 1500,
    quarterlyCny: 945,
    quarterlyOriginUsd: 214.29,
    quarterlyUsd: 135,
    yearlyOriginCny: 6000,
    yearlyCny: 3600,
    yearlyOriginUsd: 857.14,
    yearlyUsd: 514,
    quotaBase: 5000,
    monthlyCredits: 5000,
    concurrency: 4,
    asyncConcurrency: 4,
    portraitCapacity: 5,
    storageGb: 20,
    badge: '最受欢迎',
    exclusiveFeatures: ['no_watermark', 'vip_speed_queue', 'export_4k', 'commercial_license'],
    videoFeatures: [
      '包含 BASE 全部模型调用特权',
      '专享异步并发: 4 路并行生成',
      '更高队列优先级 (免排队)',
    ],
    imageFeatures: [
      '4K 极清 / 超采样规格按价使用',
      '多风格真人面容一致性生成增强',
    ],
    moreFeatures: [
      '授权数字人像容量: 5 个',
      '20GB 专属素材资产库存储空间',
      '创作者商业使用许可',
    ],
    features: [
      '每月 5,000 创作积分',
      '任务并发: 4 路同时生成',
      '更高队列优先级 (免排队)',
      '4K 极清 / 超采样规格按价使用',
      '授权人像容量: 5 个',
      '20GB 专属素材资产库空间',
      '商业使用许可',
    ],
  },
  plus: {
    id: 'plus',
    codeName: 'PRO',
    name: 'Plus (专业工作室)',
    standardMonthlyCny: 1000,
    tierDiscountRate: 0.80,
    monthlyOriginCny: 1000,
    monthlyCny: 800,
    monthlyOriginUsd: 142.86,
    monthlyUsd: 114,
    quarterlyOriginCny: 3000,
    quarterlyCny: 2160,
    quarterlyOriginUsd: 428.57,
    quarterlyUsd: 308,
    yearlyOriginCny: 12000,
    yearlyCny: 8000,
    yearlyOriginUsd: 1714.29,
    yearlyUsd: 1142,
    quotaBase: 12000,
    monthlyCredits: 12000,
    concurrency: 6,
    asyncConcurrency: 6,
    portraitCapacity: 15,
    storageGb: 50,
    badge: '',
    exclusiveFeatures: ['no_watermark', 'exclusive_latest_models', 'vip_speed_queue', 'export_4k', 'commercial_license'],
    videoFeatures: [
      '专享异步并发: 6 路高速并行生成',
      '已开放首发模型专属使用权',
      '高码率无损规格按价使用',
    ],
    imageFeatures: [
      '多任务批量极速出图',
      '超清超采样最高细节渲染',
    ],
    moreFeatures: [
      '授权数字人像容量: 15 个',
      '50GB 团队级素材资产库空间',
      '工作室商用范围授权',
    ],
    features: [
      '每月 12,000 创作积分',
      '任务并发: 6 路高速并行生成',
      '包含 STAR 全部特权',
      '已开放首发模型专属使用权',
      '工作室商用范围授权',
      '高码率无损规格按价使用',
      '授权人像容量: 15 个',
      '50GB 团队级素材资产库空间',
    ],
  },
  pro: {
    id: 'pro',
    codeName: 'APEX',
    name: 'Pro (旗舰大师版)',
    standardMonthlyCny: 2000,
    tierDiscountRate: 0.88,
    monthlyOriginCny: 2000,
    monthlyCny: 1760,
    monthlyOriginUsd: 285.71,
    monthlyUsd: 251,
    quarterlyOriginCny: 6000,
    quarterlyCny: 4752,
    quarterlyOriginUsd: 857.14,
    quarterlyUsd: 678,
    yearlyOriginCny: 24000,
    yearlyCny: 17600,
    yearlyOriginUsd: 3428.57,
    yearlyUsd: 2514,
    quotaBase: 27000,
    monthlyCredits: 27000,
    concurrency: 8,
    asyncConcurrency: 8,
    portraitCapacity: 30,
    storageGb: 100,
    badge: '旗舰尊享',
    exclusiveFeatures: ['no_watermark', 'exclusive_latest_models', 'vip_speed_queue', 'export_4k', 'commercial_license', 'dedicated_support'],
    videoFeatures: [
      '专享异步并发: 8 路顶级并发上限',
      '最高配置队列优先级',
      '超长连续镜头与高码率无损生成',
    ],
    imageFeatures: [
      '4K 极清超采样顶级工商业画质',
      '已接入且标记开放的首发模型',
    ],
    moreFeatures: [
      '授权数字人像容量: 30 个',
      '100GB 顶级云端资产库空间',
      'VIP 专属支持入口 & 专票开具',
      '企业级 SLA 服务能力保障',
    ],
    features: [
      '每月 27,000 创作积分',
      '任务并发: 8 路顶级并发上限',
      '包含 PRO 全部特权',
      '最高配置队列优先级',
      '授权人像容量: 30 个',
      '100GB 顶级云端资产库空间',
      'VIP 专属支持入口 & 专票开具',
      '企业级 SLA 服务能力保障',
    ],
  },
});

function planMeta(plan) {
  return {
    monthlyOriginCny: plan.monthlyOriginCny ?? null,
    monthlyOriginUsd: plan.monthlyOriginUsd ?? null,
    quarterlyOriginCny: plan.quarterlyOriginCny ?? null,
    quarterlyCny: plan.quarterlyCny,
    quarterlyOriginUsd: plan.quarterlyOriginUsd ?? null,
    quarterlyUsd: plan.quarterlyUsd,
    yearlyOriginCny: plan.yearlyOriginCny ?? null,
    yearlyCny: plan.yearlyCny,
    yearlyOriginUsd: plan.yearlyOriginUsd ?? null,
    yearlyUsd: plan.yearlyUsd,
    quotaBase: plan.quotaBase,
    quotaBonus: 0,
    concurrency: plan.concurrency,
    asyncConcurrency: plan.asyncConcurrency,
    portraitCapacity: plan.portraitCapacity,
    storageGb: plan.storageGb ?? 5,
    badge: plan.badge,
    exclusiveFeatures: plan.exclusiveFeatures || getDefaultExclusiveFeatures(plan.id),
    videoFeatures: plan.videoFeatures || [],
    imageFeatures: plan.imageFeatures || [],
    moreFeatures: plan.moreFeatures || [],
  };
}

function planSeedRow(plan) {
  return {
    id: plan.id,
    name: plan.name,
    monthly_cny: plan.monthlyCny,
    monthly_usd: plan.monthlyUsd,
    display_order: ['starter', 'basic', 'plus', 'pro'].indexOf(plan.id) + 1,
    enabled: true,
    features_json: { items: plan.features, meta: planMeta(plan) },
  };
}

export function parseFeaturesAndMeta(value, planId = '') {
  let features = [];
  let meta = {};

  if (Array.isArray(value)) {
    features = value;
  } else if (value && typeof value === 'object') {
    features = Array.isArray(value.items) ? value.items : (Array.isArray(value.features) ? value.features : []);
    meta = value.meta || value;
  } else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        features = parsed;
      } else if (parsed && typeof parsed === 'object') {
        features = Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed.features) ? parsed.features : []);
        meta = parsed.meta || parsed;
      }
    } catch {}
  }

  // 套餐基准默认值 fallback
  const defaultsByPlan = {
    starter: planMeta(COMMERCIAL_PLAN_CATALOG.starter),
    basic: planMeta(COMMERCIAL_PLAN_CATALOG.basic),
    plus: planMeta(COMMERCIAL_PLAN_CATALOG.plus),
    pro: planMeta(COMMERCIAL_PLAN_CATALOG.pro),
    free: { yearlyCny: 0, yearlyUsd: 0, quotaBase: 0, quotaBonus: 0, concurrency: 1, asyncConcurrency: 1, portraitCapacity: 0, storageGb: 1, badge: '免费体验', exclusiveFeatures: [] },
  };

  const idKey = String(planId || '').toLowerCase();
  const def = defaultsByPlan[idKey] || { yearlyCny: 0, yearlyUsd: 0, quotaBase: 0, quotaBonus: 0, concurrency: 1, asyncConcurrency: 1, portraitCapacity: 0, storageGb: 1, badge: '', exclusiveFeatures: getDefaultExclusiveFeatures(idKey) };

  const parsedExclusiveFeatures = Array.isArray(meta.exclusiveFeatures)
    ? meta.exclusiveFeatures
    : (Array.isArray(meta.exclusive_features) ? meta.exclusive_features : (def.exclusiveFeatures || getDefaultExclusiveFeatures(idKey)));

  return {
    features,
    meta: {
      monthlyOriginCny: meta.monthlyOriginCny ?? meta.monthly_origin_cny ?? def.monthlyOriginCny ?? null,
      monthlyOriginUsd: meta.monthlyOriginUsd ?? meta.monthly_origin_usd ?? def.monthlyOriginUsd ?? null,
      yearlyOriginCny: meta.yearlyOriginCny ?? meta.yearly_origin_cny ?? def.yearlyOriginCny ?? null,
      yearlyCny: Number(meta.yearlyCny ?? meta.yearly_cny ?? def.yearlyCny),
      yearlyOriginUsd: meta.yearlyOriginUsd ?? meta.yearly_origin_usd ?? def.yearlyOriginUsd ?? null,
      yearlyUsd: Number(meta.yearlyUsd ?? meta.yearly_usd ?? def.yearlyUsd),
      quarterlyOriginCny: meta.quarterlyOriginCny ?? meta.quarterly_origin_cny ?? def.quarterlyOriginCny ?? null,
      quarterlyCny: Number(meta.quarterlyCny ?? meta.quarterly_cny ?? def.quarterlyCny ?? 0),
      quarterlyOriginUsd: meta.quarterlyOriginUsd ?? meta.quarterly_origin_usd ?? def.quarterlyOriginUsd ?? null,
      quarterlyUsd: Number(meta.quarterlyUsd ?? meta.quarterly_usd ?? def.quarterlyUsd ?? 0),
      quotaBase: Number(meta.quotaBase ?? meta.quota_base ?? def.quotaBase),
      quotaBonus: 0,
      concurrency: Number(meta.concurrency ?? def.concurrency),
      asyncConcurrency: Number(meta.asyncConcurrency ?? def.asyncConcurrency),
      portraitCapacity: Number(meta.portraitCapacity ?? def.portraitCapacity),
      storageGb: Number(meta.storageGb ?? def.storageGb ?? 5),
      badge: String(meta.badge || def.badge || ''),
      exclusiveFeatures: parsedExclusiveFeatures,
      videoFeatures: meta.videoFeatures || def.videoFeatures || [],
      imageFeatures: meta.imageFeatures || def.imageFeatures || [],
      moreFeatures: meta.moreFeatures || def.moreFeatures || [],
    },
  };
}

export function mapPlanConfig(row) {
  if (!row) return null;
  const { features, meta } = parseFeaturesAndMeta(row.features_json ?? row.features, row.id);
  const policyPlan = COMMERCIAL_PLAN_CATALOG[row.id];
  const defPolicyMeta = policyPlan ? planMeta(policyPlan) : meta;

  const rowMonthlyCny = Number(row.monthly_cny ?? 0);
  const rowMonthlyUsd = Number(row.monthly_usd ?? 0);

  const effectiveName = row.name || policyPlan?.name || row.id;
  const effectiveMonthlyCny = rowMonthlyCny > 0 ? rowMonthlyCny : (policyPlan?.monthlyCny ?? 0);
  const effectiveMonthlyUsd = rowMonthlyUsd > 0 ? rowMonthlyUsd : (policyPlan?.monthlyUsd ?? 0);
  const effectiveYearlyCny = meta.yearlyCny > 0 ? meta.yearlyCny : (policyPlan?.yearlyCny ?? (effectiveMonthlyCny * 10));
  const effectiveYearlyUsd = meta.yearlyUsd > 0 ? meta.yearlyUsd : (policyPlan?.yearlyUsd ?? (effectiveMonthlyUsd * 10));
  const effectiveQuarterlyCny = meta.quarterlyCny > 0 ? meta.quarterlyCny : (policyPlan?.quarterlyCny ?? Math.round(effectiveMonthlyCny * 3 * 0.9));
  const effectiveQuarterlyUsd = meta.quarterlyUsd > 0 ? meta.quarterlyUsd : (policyPlan?.quarterlyUsd ?? Math.round(effectiveMonthlyUsd * 3 * 0.9));
  const effectiveQuotaBase = meta.quotaBase > 0 ? meta.quotaBase : (policyPlan?.quotaBase ?? 0);
  const effectiveConcurrency = meta.concurrency > 0 ? meta.concurrency : (policyPlan?.concurrency ?? 1);
  const effectiveAsyncConcurrency = meta.asyncConcurrency > 0 ? meta.asyncConcurrency : (policyPlan?.asyncConcurrency ?? 1);
  const effectivePortraitCapacity = meta.portraitCapacity !== undefined ? meta.portraitCapacity : (policyPlan?.portraitCapacity ?? 0);
  const effectiveStorageGb = meta.storageGb > 0 ? meta.storageGb : (policyPlan?.storageGb ?? 5);
  const effectiveBadge = meta.badge !== undefined && meta.badge !== '' ? meta.badge : (policyPlan?.badge ?? '');
  const effectiveExclusiveFeatures = Array.isArray(meta.exclusiveFeatures) && meta.exclusiveFeatures.length > 0
    ? meta.exclusiveFeatures
    : (policyPlan?.exclusiveFeatures || getDefaultExclusiveFeatures(row.id));

  const effectiveFeatures = Array.isArray(features) && features.length > 0
    ? features
    : (policyPlan?.features || []);

  const mergedMeta = {
    ...defPolicyMeta,
    ...meta,
    monthlyOriginCny: meta.monthlyOriginCny ?? policyPlan?.monthlyOriginCny,
    monthlyOriginUsd: meta.monthlyOriginUsd ?? policyPlan?.monthlyOriginUsd,
    quarterlyOriginCny: meta.quarterlyOriginCny ?? policyPlan?.quarterlyOriginCny,
    quarterlyCny: effectiveQuarterlyCny,
    quarterlyOriginUsd: meta.quarterlyOriginUsd ?? policyPlan?.quarterlyOriginUsd,
    quarterlyUsd: effectiveQuarterlyUsd,
    yearlyOriginCny: meta.yearlyOriginCny ?? policyPlan?.yearlyOriginCny,
    yearlyCny: effectiveYearlyCny,
    yearlyOriginUsd: meta.yearlyOriginUsd ?? policyPlan?.yearlyOriginUsd,
    yearlyUsd: effectiveYearlyUsd,
    quotaBase: effectiveQuotaBase,
    concurrency: effectiveConcurrency,
    asyncConcurrency: effectiveAsyncConcurrency,
    portraitCapacity: effectivePortraitCapacity,
    storageGb: effectiveStorageGb,
    badge: effectiveBadge,
    exclusiveFeatures: effectiveExclusiveFeatures,
    videoFeatures: meta.videoFeatures?.length ? meta.videoFeatures : (policyPlan?.videoFeatures || []),
    imageFeatures: meta.imageFeatures?.length ? meta.imageFeatures : (policyPlan?.imageFeatures || []),
    moreFeatures: meta.moreFeatures?.length ? meta.moreFeatures : (policyPlan?.moreFeatures || []),
  };

  return {
    id: row.id,
    codeName: policyPlan?.codeName || (row.id === 'pro' ? 'APEX' : row.id === 'plus' ? 'PRO' : row.id === 'basic' ? 'STAR' : 'BASE'),
    name: effectiveName,
    monthlyOriginCny: mergedMeta.monthlyOriginCny,
    monthlyCny: effectiveMonthlyCny,
    monthlyOriginUsd: mergedMeta.monthlyOriginUsd,
    monthlyUsd: effectiveMonthlyUsd,
    quarterlyOriginCny: mergedMeta.quarterlyOriginCny,
    quarterlyCny: effectiveQuarterlyCny,
    quarterlyOriginUsd: mergedMeta.quarterlyOriginUsd,
    quarterlyUsd: effectiveQuarterlyUsd,
    yearlyOriginCny: mergedMeta.yearlyOriginCny,
    yearlyCny: effectiveYearlyCny,
    yearlyOriginUsd: mergedMeta.yearlyOriginUsd,
    yearlyUsd: effectiveYearlyUsd,
    quotaBase: effectiveQuotaBase,
    quotaBonus: 0,
    concurrency: effectiveConcurrency,
    asyncConcurrency: effectiveAsyncConcurrency,
    portraitCapacity: effectivePortraitCapacity,
    storageGb: effectiveStorageGb,
    badge: effectiveBadge,
    exclusiveFeatures: effectiveExclusiveFeatures,
    features: effectiveFeatures,
    videoFeatures: mergedMeta.videoFeatures,
    imageFeatures: mergedMeta.imageFeatures,
    moreFeatures: mergedMeta.moreFeatures,
    meta: mergedMeta,
    displayOrder: Number(row.display_order || 0),
    enabled: Number(row.enabled) === 1 || row.enabled === true,
    updatedAt: row.updated_at || null,
  };
}

export async function ensureCommercialPlans() {
  const defaults = Object.values(COMMERCIAL_PLAN_CATALOG).map(planSeedRow);

  try {
    // 清理历史遗留套餐中的 BYOK 字样
    await execute(`
      UPDATE plans_config
      SET name = '免费体验版',
          features_json = '["基础图片与视频工作流", "每日签到赠送算力", "全站免Key云端托管推理"]'::jsonb
      WHERE id = 'free' AND name LIKE '%BYOK%'
    `);

    for (const p of defaults) {
      await execute(`
        INSERT INTO plans_config (id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, 1, now())
        ON CONFLICT (id) DO NOTHING
      `, [p.id, p.name, p.monthly_cny, p.monthly_usd, JSON.stringify(p.features_json), p.display_order]);
    }
  } catch (err) {
    console.error('[ensureCommercialPlans error]', err.message);
  }
}

export async function listPublicPlans() {
  let rows = await queryMany(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config
    WHERE (enabled::text = 'true' OR enabled::text = '1')
    ORDER BY display_order ASC, id ASC
  `);

  if (!rows.some((r) => r.id === 'starter')) {
    await ensureCommercialPlans();
    rows = await queryMany(`
      SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
      FROM plans_config
      WHERE (enabled::text = 'true' OR enabled::text = '1')
      ORDER BY display_order ASC, id ASC
    `);
  }

  return rows.map(mapPlanConfig);
}

export async function findPublicPlanById(id) {
  let row = await queryOne(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config
    WHERE id = $1 AND (enabled::text = 'true' OR enabled::text = '1')
  `, [id]);

  if (!row && ['starter', 'basic', 'plus', 'pro'].includes(id)) {
    await ensureCommercialPlans();
    row = await queryOne(`
      SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
      FROM plans_config
      WHERE id = $1 AND (enabled::text = 'true' OR enabled::text = '1')
    `, [id]);
  }

  if (!row && id === 'free') {
    row = await queryOne(`
      SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
      FROM plans_config
      WHERE id = 'free'
    `);
    if (!row) {
      return {
        id: 'free',
        name: '免费体验版',
        monthlyCny: 0,
        monthlyUsd: 0,
        features: ['基础图片与视频工作流', '每日签到赠送算力', '全站免Key云端托管推理'],
        exclusiveFeatures: [],
        enabled: true,
      };
    }
  }

  return mapPlanConfig(row);
}

export async function findPublicPlanByIdTx(tx, id) {
  if (!tx || typeof tx.queryOne !== 'function') throw new TypeError('transaction is required');
  let row = await tx.queryOne(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config
    WHERE id = $1 AND (enabled::text = 'true' OR enabled::text = '1')
  `, [id]);

  if (!row && id === 'free') {
    row = await tx.queryOne(`
      SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
      FROM plans_config
      WHERE id = 'free'
    `);
    if (!row) {
      return {
        id: 'free',
        name: '免费体验版',
        monthlyCny: 0,
        monthlyUsd: 0,
        features: ['基础图片与视频工作流', '每日签到赠送算力', '全站免Key云端托管推理'],
        exclusiveFeatures: [],
        enabled: true,
      };
    }
  }

  return mapPlanConfig(row);
}
