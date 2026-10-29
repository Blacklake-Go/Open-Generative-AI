/**
 * 后台模型价格透视表的渠道成本摘要。
 *
 * 复用运行时唯一的成本估算实现（lib/pricing/creditPolicy.js），让后台看到的
 * 渠道成本与报价、迁移 022 的回填口径一致：
 * - 视频按 cost_per_output_second × 默认输出时长（缺省 5 秒）计算；
 * - 旧 video base_cost 由 normalizeProviderCostConfig 迁移为每秒成本；
 * - 汇率未知时保留 null，绝不把“缺成本”当成 0 或免费。
 *
 * 成本来源优先级与路由保持一致：优先使用当前 active 的价格版本，缺失时才
 * 回退到 provider_models.cost_config。价格版本缺失会被单独计数，因为路由
 * 在没有有效价格版本时会拒绝该线路，后台需要能看到这项缺口。
 *
 * 本模块不依赖数据库或 Next.js，方便单测直接调用。
 */
import { estimateProviderCost, normalizeProviderCostConfig } from '../pricing/creditPolicy.js';

const ROUTE_PRICE_TYPES = new Set(['account_actual', 'aggregator', 'manual']);
// estimateProviderCost 只把非 CNY 币种按 USD 汇率换算；其它币种不能被误算。
const SUPPORTED_CURRENCIES = new Set(['USD', 'CNY', 'RMB']);

export const CHANNEL_COST_REASONS = Object.freeze({
  NOT_CONFIGURED: 'COST_NOT_CONFIGURED',
  FX_UNAVAILABLE: 'FX_RATE_UNAVAILABLE',
  CURRENCY_UNSUPPORTED: 'COST_CURRENCY_UNSUPPORTED',
});

function objectValue(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function currentPriceVersion(row) {
  const version = objectValue(row?.active_price_version ?? row?.activePriceVersion);
  if (!version.id) return null;
  if (String(version.status || '').toLowerCase() !== 'active') return null;
  if (!ROUTE_PRICE_TYPES.has(String(version.price_type || '').toLowerCase())) return null;
  if (!Object.keys(objectValue(version.price_config)).length) return null;
  return version;
}

function effectiveCostConfig(row, priceVersion) {
  if (!priceVersion) {
    return { config: objectValue(row?.cost_config ?? row?.costConfig), source: 'provider_cost_config' };
  }
  // 价格版本是唯一权威：只使用它自己的 price_config，不与旧 cost_config 合并，
  // 避免把两套计价字段叠加成不存在的成本。
  const config = { ...objectValue(priceVersion.price_config) };
  const currency = String(priceVersion.currency || config.currency || '').trim();
  if (currency) config.currency = currency;
  return { config, source: 'price_version' };
}

/**
 * 汇总一个逻辑模型下所有启用渠道的成本范围。
 *
 * @param {Array} providerModels provider_models 行，可带 active_price_version。
 * @param {object} options
 * @param {object} [options.fxSnapshot] 汇率快照，形如 {usdToCny, rates}。
 * @param {string} [options.category] 模型类别，video 类会触发旧配置迁移。
 * @param {string} [options.modelId] 逻辑模型 ID。
 * @param {object} [options.parameters] 用于估算规格的请求参数；后台默认留空，
 *   视频即按默认 5 秒计算。
 */
export function summarizeChannelCosts(providerModels = [], {
  fxSnapshot = {},
  category = '',
  modelId = '',
  parameters = {},
} = {}) {
  const rows = Array.isArray(providerModels) ? providerModels : [];
  const priced = [];
  const unpricedReasons = {};
  let channelCount = 0;
  let priceVersionChannels = 0;
  let costConfigChannels = 0;

  for (const row of rows) {
    if (!row || row.enabled === false) continue;
    channelCount += 1;

    const priceVersion = currentPriceVersion(row);
    if (priceVersion) priceVersionChannels += 1;
    const effective = effectiveCostConfig(row, priceVersion);
    const normalized = normalizeProviderCostConfig(effective.config, { category, modelId });
    const currency = String(normalized.currency || 'USD').toUpperCase();
    const priority = numberOrNull(row.priority) ?? 0;
    const providerId = row.provider_id ?? row.providerId ?? null;
    const providerModelId = row.provider_model_id ?? row.providerModelId ?? null;
    const explicitlyFree = normalized.is_free === true || normalized.free === true;

    let reason = null;
    let estimate = null;
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      reason = CHANNEL_COST_REASONS.CURRENCY_UNSUPPORTED;
    } else if (explicitlyFree) {
      estimate = {
        currency,
        cost: 0,
        costCny: 0,
        costUsd: 0,
        outputSeconds: numberOrNull(normalized.default_output_seconds) ?? 0,
        inputSeconds: 0,
        units: 1,
      };
    } else {
      estimate = estimateProviderCost(normalized, parameters, fxSnapshot);
      if (!(Number(estimate.cost) > 0)) reason = CHANNEL_COST_REASONS.NOT_CONFIGURED;
      else if (!(Number(estimate.costCny) > 0)) reason = CHANNEL_COST_REASONS.FX_UNAVAILABLE;
    }

    if (reason) {
      unpricedReasons[reason] = (unpricedReasons[reason] || 0) + 1;
      continue;
    }

    if (effective.source !== 'price_version') costConfigChannels += 1;

    priced.push({
      providerId,
      providerModelId,
      priority,
      currency,
      costCny: Number(estimate.costCny),
      costUsd: numberOrNull(estimate.costUsd),
      costSource: effective.source,
      priceVersionId: priceVersion?.id || null,
      priceType: priceVersion?.price_type || null,
      expiresAt: priceVersion?.expires_at || null,
      explicitlyFree,
      outputSeconds: numberOrNull(estimate.outputSeconds),
      inputSeconds: numberOrNull(estimate.inputSeconds),
      units: numberOrNull(estimate.units),
    });
  }

  let minCostCny = null;
  let minCostUsd = null;
  let maxCostCny = null;
  let maxCostUsd = null;
  let minCostChannel = null;
  let costBasis = null;

  if (priced.length) {
    const byCny = [...priced].sort((left, right) => left.costCny - right.costCny
      || right.priority - left.priority
      || String(left.providerModelId || '').localeCompare(String(right.providerModelId || '')));
    const cheapest = byCny[0];
    const priciest = byCny[byCny.length - 1];
    minCostCny = cheapest.costCny;
    maxCostCny = priciest.costCny;
    const usdCosts = priced.map((item) => item.costUsd).filter((value) => value !== null);
    minCostUsd = usdCosts.length ? Math.min(...usdCosts) : null;
    maxCostUsd = usdCosts.length ? Math.max(...usdCosts) : null;
    minCostChannel = {
      providerId: cheapest.providerId,
      providerModelId: cheapest.providerModelId,
      priority: cheapest.priority,
      currency: cheapest.currency,
      costSource: cheapest.costSource,
      priceVersionId: cheapest.priceVersionId,
      priceType: cheapest.priceType,
      expiresAt: cheapest.expiresAt,
      explicitlyFree: cheapest.explicitlyFree,
    };
    costBasis = {
      outputSeconds: cheapest.outputSeconds,
      inputSeconds: cheapest.inputSeconds,
      units: cheapest.units,
    };
  }

  return {
    channelCount,
    pricedChannels: priced.length,
    unpricedChannels: channelCount - priced.length,
    priceVersionChannels,
    costConfigChannels,
    unpricedReasons,
    minCostCny,
    minCostUsd,
    maxCostCny,
    maxCostUsd,
    minCostChannel,
    costBasis,
  };
}
