/**
 * 倍率定价策略引擎。
 *
 * 自动定价 = max(渠道最低成本 × 有效倍率, 渠道最低成本 ÷ (1 - 最低毛利率))
 * 手动调价 = 管理员覆盖 (标记 pricing_mode = 'manual' | 'locked')
 * 积分换算 = 售价 ÷ 积分单价
 *
 * 这里只负责后台的“建议价”口径（人民币）；用户侧真正收费的积分单价、
 * 准备金和毛利底线统一来自 lib/pricing/creditPolicy.js，两处不得各自维护
 * 一套商业数值。
 */

import { findActivePricingStrategy, upsertPricingStrategy } from '../repositories/pricingStrategy.js';

/**
 * 获取当前活跃的定价策略。
 * @returns {Promise<object>} 定价策略对象
 */
export async function getActivePricingStrategy() {
  const row = await findActivePricingStrategy();
  if (!row) {
    return {
      id: null,
      base_multiplier: 1.5,
      min_margin_rate: 0.30,
      category_multipliers: {},
      tier_multipliers: {},
      spec_multipliers: {},
      rounding_strategy: 'ceil_to_0.01',
    };
  }
  return row;
}

/**
 * 保存定价策略。
 * @param {object} strategy - 策略配置
 * @param {string} updatedBy - 操作者用户 ID
 */
export async function savePricingStrategy(strategy, updatedBy) {
  return upsertPricingStrategy(strategy, updatedBy);
}

/**
 * 获取模型的有效倍率。
 *
 * 优先级: 分类倍率覆盖 > 基准倍率 → 再乘以分级倍率
 */
export function getEffectiveMultiplier(model, strategy) {
  const baseMultiplier = Number(strategy.base_multiplier);
  const categoryOverride = Number(strategy.category_multipliers?.[model.category]);
  const tierOverride = Number(strategy.tier_multipliers?.[model.tier]);
  const categoryMultiplier = Number.isFinite(categoryOverride) && categoryOverride > 0
    ? categoryOverride
    : Number.isFinite(baseMultiplier) && baseMultiplier > 0 ? baseMultiplier : 1.0;
  const tierMultiplier = Number.isFinite(tierOverride) && tierOverride > 0 ? tierOverride : 1.0;
  return categoryMultiplier * tierMultiplier;
}

/**
 * 获取规格级别的倍率修正 (分辨率/时长分档)。
 *
 * spec_multipliers 结构示例:
 * {
 *   "resolution": { "4k": 2.0, "2k": 1.5, "1k": 1.0, "720p": 0.8 },
 *   "duration":   { "60s": 2.5, "30s": 1.8, "10s": 1.2, "5s": 1.0 }
 * }
 *
 * @param {object} spec - 用户请求规格 (e.g. { resolution: '4k', duration: '10s' })
 * @param {object} strategy - 定价策略
 * @returns {number} 规格倍率修正 (乘积)
 */
export function getSpecMultiplier(spec, strategy) {
  if (!spec || !strategy.spec_multipliers) return 1.0;
  const specMults = strategy.spec_multipliers;
  let factor = 1.0;

  // 分辨率修正
  if (spec.resolution && specMults.resolution) {
    const resKey = String(spec.resolution).toLowerCase().replace(/[^a-z0-9]/g, '');
    factor *= specMults.resolution[resKey] ?? specMults.resolution[spec.resolution] ?? 1.0;
  }

  // 时长修正
  if (spec.duration && specMults.duration) {
    // 尝试精确匹配，否则找最近的时长档位
    const durSec = typeof spec.duration === 'number' ? spec.duration : parseInt(spec.duration, 10);
    const durKey = `${durSec}s`;
    if (specMults.duration[durKey]) {
      factor *= specMults.duration[durKey];
    } else if (Number.isFinite(durSec)) {
      // 找最近的时长档位
      const brackets = Object.entries(specMults.duration)
        .map(([k, v]) => [parseInt(k, 10), v])
        .filter(([k]) => Number.isFinite(k))
        .sort((a, b) => a[0] - b[0]);
      if (brackets.length) {
        const closest = brackets.reduce((best, cur) =>
          Math.abs(cur[0] - durSec) < Math.abs(best[0] - durSec) ? cur : best
        );
        factor *= closest[1];
      }
    }
  }

  return factor;
}

/**
 * 计算自动定价建议价。
 *
 * @param {object} model - 模型信息（含 lowestChannelCostCny, category, tier）
 * @param {object} strategy - 定价策略
 * @param {object} [spec] - 可选的规格参数 (resolution, duration 等)
 * @returns {object} { suggestedPrice, effectiveMultiplier, specMultiplier, marginRate }
 */
export function calculateAutoPrice(model, strategy, spec = null) {
  const baseCost = Number(model.lowestChannelCostCny);
  if (!baseCost || !Number.isFinite(baseCost) || baseCost <= 0) {
    return {
      suggestedPrice: null,
      effectiveMultiplier: null,
      specMultiplier: null,
      marginRate: null,
      minMarginRate: null,
      minPriceForMarginCny: null,
      roundingStrategy: null,
      roundingRaisedToMarginFloor: false,
      reason: 'LOWEST_CHANNEL_COST_UNKNOWN',
    };
  }

  const effectiveMultiplier = getEffectiveMultiplier(model, strategy);
  const specMultiplier = spec ? getSpecMultiplier(spec, strategy) : 1.0;
  const totalMultiplier = effectiveMultiplier * specMultiplier;

  const suggestedByMultiplier = baseCost * totalMultiplier;

  const configuredMargin = Number(strategy.min_margin_rate);
  const minMarginRate = Number.isFinite(configuredMargin) && configuredMargin >= 0 && configuredMargin < 1
    ? configuredMargin
    : 0.3;
  const minPriceForMargin = baseCost / (1 - minMarginRate);

  const rawPrice = Math.max(suggestedByMultiplier, minPriceForMargin);
  const roundingStrategy = strategy.rounding_strategy || 'ceil_to_0.01';
  const roundedPrice = roundPrice(rawPrice, roundingStrategy);
  // 向下取整/四舍五入不能把已经保证毛利的底价再压到毛利底线之下：
  // 一旦取整结果低于 minPriceForMargin，就按同一取整粒度向上取整到底线之上。
  const roundingRaisedToMarginFloor = roundedPrice + 1e-9 < minPriceForMargin;
  const suggestedPrice = roundingRaisedToMarginFloor
    ? ceilToStep(minPriceForMargin, roundingStep(roundingStrategy))
    : roundedPrice;

  const marginRate = 1 - baseCost / suggestedPrice;

  return {
    suggestedPrice,
    effectiveMultiplier,
    specMultiplier,
    marginRate,
    minMarginRate,
    minPriceForMarginCny: minPriceForMargin,
    roundingStrategy,
    roundingRaisedToMarginFloor,
    reason: roundingRaisedToMarginFloor
      ? 'ROUNDING_RAISED_TO_MARGIN_FLOOR'
      : suggestedByMultiplier >= minPriceForMargin
        ? 'MULTIPLIER_ABOVE_MARGIN_FLOOR'
        : 'MARGIN_FLOOR_ABOVE_MULTIPLIER',
  };
}

export const PRICE_SOURCES = Object.freeze([
  'locked_site_price',
  'manual_override_price',
  'auto_suggested_price',
  'unconfigured',
]);

/**
 * 解析模型当前生效售价及其来源与原因。
 *
 * 优先级固定为：有效期内的人工锁定价 > 有效期内的人工覆盖价 > 自动建议价。
 * 人工价过期后不再生效，也不用过期价继续收费；没有可用价格时返回 null，
 * 由调用方显式处理，而不是隐式回退成 0 或免费。
 */
export function resolveEffectivePrice(model, { now = Date.now() } = {}) {
  const record = model && typeof model === 'object' ? model : {};
  const nowMs = Number(now);
  const currentTime = Number.isFinite(nowMs) ? nowMs : Date.now();

  const autoPrice = positiveNumber(record.auto_suggested_price_cny);
  const manualPrice = positiveNumber(record.manual_override_price_cny);
  const lockedPrice = record.price_locked === true ? positiveNumber(record.site_price_cny) : null;
  const pricingMode = String(record.pricing_mode || '').trim().toLowerCase();
  const mode = record.price_locked === true || pricingMode === 'locked'
    ? 'locked'
    : pricingMode === 'manual' ? 'manual' : 'auto';

  const expiry = parseTimestamp(
    record.manual_override_expires_at
      ?? record.override_expires_at
      ?? ((mode === 'locked' || record.price_locked === true) ? record.price_valid_until : null),
  );
  const expired = expiry !== null && expiry <= currentTime;
  const expiryIso = expiry !== null ? new Date(expiry).toISOString() : null;

  const manualCandidate = mode === 'locked'
    ? { price: lockedPrice, source: 'locked_site_price', reason: 'LOCKED_SITE_PRICE_ACTIVE' }
    : manualPrice !== null
      ? { price: manualPrice, source: 'manual_override_price', reason: 'MANUAL_OVERRIDE_ACTIVE' }
      : null;

  if (mode !== 'auto') {
    if (manualCandidate && manualCandidate.price !== null && !expired) {
      return {
        priceCny: manualCandidate.price,
        source: manualCandidate.source,
        reason: manualCandidate.reason,
        mode,
        expiresAt: expiryIso,
        expired: false,
      };
    }
    if (expired) {
      return {
        priceCny: autoPrice,
        source: autoPrice === null ? 'unconfigured' : 'auto_suggested_price',
        reason: autoPrice === null ? 'MANUAL_PRICE_EXPIRED_AND_NO_AUTO_PRICE' : 'MANUAL_PRICE_EXPIRED_FALLBACK_TO_AUTO',
        mode,
        expiresAt: expiryIso,
        expired: true,
      };
    }
    return {
      priceCny: autoPrice,
      source: autoPrice === null ? 'unconfigured' : 'auto_suggested_price',
      reason: autoPrice === null ? 'MANUAL_PRICE_MISSING_AND_NO_AUTO_PRICE' : 'MANUAL_PRICE_MISSING_FALLBACK_TO_AUTO',
      mode,
      expiresAt: expiryIso,
      expired: false,
    };
  }

  return {
    priceCny: autoPrice,
    source: autoPrice === null ? 'unconfigured' : 'auto_suggested_price',
    reason: autoPrice === null ? 'AUTO_PRICE_NOT_GENERATED' : 'AUTO_SUGGESTED_PRICE',
    mode,
    expiresAt: expiryIso,
    expired,
  };
}

/**
 * 获取模型的有效售价（兼容旧调用方，返回数值）。
 * 需要来源、原因或到期信息时使用 resolveEffectivePrice。
 */
export function getEffectivePrice(model) {
  return resolveEffectivePrice(model).priceCny;
}

function positiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTimestamp(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 价格取整粒度：与 roundPrice 的精度保持一致。
 */
function roundingStep(strategy) {
  return strategy === 'ceil_to_0.1' ? 0.1 : 0.01;
}

function ceilToStep(value, step) {
  const units = value / step;
  // 浮点误差会让刚好落在整数倍上的值多进一档，先收敛到 1e-9 再取整。
  const roundedUnits = Math.ceil(Number(units.toFixed(9)));
  return Number((roundedUnits * step).toFixed(10));
}

/**
 * 价格取整策略。
 */
function roundPrice(value, strategy) {
  switch (strategy) {
    case 'ceil_to_0.01':
      return Math.ceil(value * 100) / 100;
    case 'ceil_to_0.1':
      return Math.ceil(value * 10) / 10;
    case 'round_to_0.01':
      return Math.round(value * 100) / 100;
    case 'floor_to_0.01':
      return Math.floor(value * 100) / 100;
    default:
      return Math.ceil(value * 100) / 100;
  }
}
