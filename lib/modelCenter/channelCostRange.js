/**
 * 后台模型价格透视表的渠道成本摘要。
 *
 * 成本口径必须与运行时路由一致，否则后台会向运营展示一个无法成交的价格：
 * - 有可路由的 active 价格版本时，直接复用 routePricing 的 estimateRequestCost，
 *   支持请求、图片、输入/输出秒数、token、工具费和组合计费；
 * - 没有价格版本时才回退 provider_models.cost_config（含迁移 022 的每秒成本换算）；
 * - 价格版本只使用自己的 price_config，不与旧 cost_config 合并。
 *
 * 任何缺成本、缺汇率、计费单位未验证或需要请求输入才能估算的情况都保持 null，
 * 并记录可读原因，绝不把“不知道”当成 0 成本或免费。
 *
 * 本模块不依赖数据库或 Next.js，方便单测直接调用。
 */
import { estimateProviderCost, normalizeProviderCostConfig } from '../pricing/creditPolicy.js';
import { estimateRequestCost } from './routePricing.js';

const ROUTE_PRICE_TYPES = new Set(['account_actual', 'aggregator', 'manual']);
// estimateProviderCost 只把非 CNY 币种按 USD 汇率换算；其它币种不能被误算。
const LEGACY_SUPPORTED_CURRENCIES = new Set(['USD', 'CNY', 'RMB']);
const VIDEO_CATEGORIES = new Set(['video', 'video_image', 'video_text']);
// 与迁移 022 / normalizeProviderCostConfig 保持同一展示基准：没有指定时长时按 5 秒估算。
const PLATFORM_DEFAULT_VIDEO_SECONDS = 5;

export const CHANNEL_COST_REASONS = Object.freeze({
  NOT_CONFIGURED: 'COST_NOT_CONFIGURED',
  FX_UNAVAILABLE: 'FX_RATE_UNAVAILABLE',
  CURRENCY_UNSUPPORTED: 'COST_CURRENCY_UNSUPPORTED',
  INPUT_REQUIRED: 'COST_INPUT_REQUIRED',
  INVALID_CONFIG: 'COST_CONFIG_INVALID',
  PRICE_VERSION_UNIT_UNVERIFIED: 'PRICE_VERSION_UNIT_UNVERIFIED',
});

/**
 * estimateRequestCost 的失败原因映射到后台可展示的失败类别。
 * 未知原因不猜测，归入 INVALID_CONFIG 并保留原始 detail。
 */
function reasonForEstimate(reason) {
  switch (reason) {
    case 'FX_RATE_MISSING':
      return CHANNEL_COST_REASONS.FX_UNAVAILABLE;
    case 'PRICE_CONFIG_MISSING':
    case 'UNIT_PRICE_MISSING':
      return CHANNEL_COST_REASONS.NOT_CONFIGURED;
    case 'BILLING_UNIT_UNVERIFIED':
      return CHANNEL_COST_REASONS.PRICE_VERSION_UNIT_UNVERIFIED;
    case 'OUTPUT_DURATION_REQUIRED':
    case 'INPUT_DURATION_REQUIRED':
    case 'REFERENCE_DURATION_REQUIRED':
    case 'INPUT_TOKEN_ESTIMATE_REQUIRED':
    case 'OUTPUT_TOKEN_BUDGET_REQUIRED':
    case 'IMAGE_COUNT_REQUIRED':
    case 'UNIT_INPUT_REQUIRED':
    case 'TOOL_COUNT_REQUIRED':
    case 'BATCH_COUNT_REQUIRED':
      return CHANNEL_COST_REASONS.INPUT_REQUIRED;
    default:
      return CHANNEL_COST_REASONS.INVALID_CONFIG;
  }
}

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
  if (value === null || value === undefined || value === '') return null;
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

function priceVersionCurrency(version, config) {
  const currency = String(version?.currency || config.currency || 'USD').trim().toUpperCase();
  return currency || 'USD';
}

/**
 * 后台默认按平台 5 秒基准展示视频成本；请求参数或价格版本自带默认时长时以它们为准。
 * 只为展示补默认值，不写回配置，也不影响运行时报价。
 */
function withDefaultVideoDuration(config, parameters, category) {
  if (!VIDEO_CATEGORIES.has(String(category))) return config;
  const params = objectValue(parameters);
  const hasParameterDuration = [
    params.output_duration, params.outputDuration, params.video_duration,
    params.videoDuration, params.duration,
  ].some((value) => Number(value) > 0);
  const hasConfigDuration = [
    config.default_output_seconds, config.default_duration_seconds, config.default_duration,
  ].some((value) => Number(value) > 0);
  if (hasParameterDuration || hasConfigDuration) return config;
  return { ...config, default_output_seconds: PLATFORM_DEFAULT_VIDEO_SECONDS };
}

/**
 * 用运行时同一个估算器计算价格版本成本。
 * 返回的 reason 是原始失败原因，便于后台解释到底缺哪一项输入。
 */
function priceVersionCost(version, parameters, fxSnapshot, category) {
  const baseConfig = objectValue(version.price_config);
  const currency = priceVersionCurrency(version, baseConfig);
  const billingUnit = version.billing_unit || baseConfig.billing_unit || baseConfig.unit || null;
  const config = withDefaultVideoDuration(baseConfig, parameters, category);
  const result = estimateRequestCost(
    { ...config, currency },
    parameters,
    { currency, billingUnit, fxSnapshot },
  );
  return { result, currency, billingUnit };
}

function legacyCostConfig(row, category, modelId) {
  const normalized = normalizeProviderCostConfig(objectValue(row?.cost_config ?? row?.costConfig), { category, modelId });
  return normalized;
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
 *   视频即按默认 5 秒计算，按 token 计价的模型则会如实显示“需要请求输入”。
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
  const unpricedDetails = [];
  let channelCount = 0;
  let priceVersionChannels = 0;
  let costConfigChannels = 0;

  for (const row of rows) {
    if (!row || row.enabled === false) continue;
    channelCount += 1;

    const priceVersion = currentPriceVersion(row);
    const providerId = row.provider_id ?? row.providerId ?? null;
    const providerModelId = row.provider_model_id ?? row.providerModelId ?? null;
    const priority = numberOrNull(row.priority) ?? 0;

    let reason = null;
    let detail = null;
    let entry = null;

    if (priceVersion) {
      priceVersionChannels += 1;
      const { result, currency, billingUnit } = priceVersionCost(priceVersion, parameters, fxSnapshot, category);
      const priceConfig = objectValue(priceVersion.price_config);
      const explicitlyFree = priceConfig.is_free === true || priceConfig.free === true;
      if (!result.known) {
        reason = reasonForEstimate(result.reason);
        detail = result.reason || null;
      } else {
        entry = {
          providerId,
          providerModelId,
          priority,
          currency,
          costCny: Number(result.estimatedCostCny),
          costUsd: numberOrNull(result.estimatedCostUsd),
          costSource: 'price_version',
          priceVersionId: priceVersion.id,
          priceType: priceVersion.price_type || null,
          expiresAt: priceVersion.expires_at || null,
          explicitlyFree,
          billingUnit,
          outputSeconds: numberOrNull(result.outputSeconds),
          inputSeconds: numberOrNull(result.inputSeconds),
          units: numberOrNull(result.units),
        };
      }
    } else {
      const normalized = legacyCostConfig(row, category, modelId);
      const currency = String(normalized.currency || 'USD').toUpperCase();
      const explicitlyFree = normalized.is_free === true || normalized.free === true;
      let estimate = null;
      if (!LEGACY_SUPPORTED_CURRENCIES.has(currency)) {
        reason = CHANNEL_COST_REASONS.CURRENCY_UNSUPPORTED;
        detail = currency;
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
        if (!(Number(estimate.cost) > 0)) {
          reason = CHANNEL_COST_REASONS.NOT_CONFIGURED;
          detail = estimate.reason || null;
        } else if (!(Number(estimate.costCny) > 0)) {
          reason = CHANNEL_COST_REASONS.FX_UNAVAILABLE;
          detail = estimate.reason || null;
        }
      }
      if (!reason) {
        entry = {
          providerId,
          providerModelId,
          priority,
          currency,
          costCny: Number(estimate.costCny),
          costUsd: numberOrNull(estimate.costUsd),
          costSource: 'provider_cost_config',
          priceVersionId: null,
          priceType: null,
          expiresAt: null,
          explicitlyFree,
          billingUnit: normalized.billing_unit ? String(normalized.billing_unit).toLowerCase() : null,
          outputSeconds: numberOrNull(estimate.outputSeconds),
          inputSeconds: numberOrNull(estimate.inputSeconds),
          units: numberOrNull(estimate.units),
        };
      }
    }

    if (reason) {
      unpricedReasons[reason] = (unpricedReasons[reason] || 0) + 1;
      unpricedDetails.push({
        providerId,
        providerModelId,
        priceVersionId: priceVersion?.id || null,
        reason,
        detail,
      });
      continue;
    }

    if (entry.costSource !== 'price_version') costConfigChannels += 1;
    priced.push(entry);
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
      billingUnit: cheapest.billingUnit,
    };
    costBasis = {
      outputSeconds: cheapest.outputSeconds,
      inputSeconds: cheapest.inputSeconds,
      units: cheapest.units,
      billingUnit: cheapest.billingUnit,
    };
  }

  return {
    channelCount,
    pricedChannels: priced.length,
    unpricedChannels: channelCount - priced.length,
    priceVersionChannels,
    costConfigChannels,
    unpricedReasons,
    unpricedDetails,
    minCostCny,
    minCostUsd,
    maxCostCny,
    maxCostUsd,
    minCostChannel,
    costBasis,
  };
}
