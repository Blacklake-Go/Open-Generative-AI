/**
 * 倍率定价策略引擎。
 *
 * 自动定价 = max(渠道最低成本 × 有效倍率, 渠道最低成本 ÷ (1 - 最低毛利率))
 * 手动调价 = 管理员覆盖 (标记 pricing_mode = 'manual' | 'locked')
 * 积分换算 = 售价 ÷ 积分单价
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
  const categoryMultiplier =
    strategy.category_multipliers?.[model.category] ?? Number(strategy.base_multiplier);
  const tierMultiplier =
    strategy.tier_multipliers?.[model.tier] ?? 1.0;
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
    return { suggestedPrice: null, effectiveMultiplier: null, specMultiplier: null, marginRate: null };
  }

  const effectiveMultiplier = getEffectiveMultiplier(model, strategy);
  const specMultiplier = spec ? getSpecMultiplier(spec, strategy) : 1.0;
  const totalMultiplier = effectiveMultiplier * specMultiplier;

  const suggestedByMultiplier = baseCost * totalMultiplier;

  const minMarginRate = Number(strategy.min_margin_rate) || 0.3;
  const minPriceForMargin = baseCost / (1 - minMarginRate);

  const rawPrice = Math.max(suggestedByMultiplier, minPriceForMargin);
  const suggestedPrice = roundPrice(rawPrice, strategy.rounding_strategy || 'ceil_to_0.01');

  const marginRate = 1 - baseCost / suggestedPrice;

  return { suggestedPrice, effectiveMultiplier, specMultiplier, marginRate };
}

/**
 * 获取模型的有效售价。
 * locked/manual 模式使用手动价；auto 使用自动建议价。
 */
export function getEffectivePrice(model) {
  if (model.pricing_mode === 'manual' || model.pricing_mode === 'locked') {
    return model.manual_override_price_cny ?? model.auto_suggested_price_cny;
  }
  return model.auto_suggested_price_cny;
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
