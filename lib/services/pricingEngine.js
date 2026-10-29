import 'server-only';

import crypto from 'node:crypto';
import { validateCapabilityParameters } from '../modelCenter/validateCapabilitySchema.js';
import { randomId, dataClient } from '../repositories/runtimeDb.js';
import { getCanonicalModelById, getModelPricing } from '../repositories/aiCatalog.js';
import { MODEL_ENDPOINT_ALIASES, findModelByEndpointOrId } from '../repositories/models.js';
import {
  CREDIT_PRICING_POLICY,
} from '../pricing/creditPolicy.js';
import { buildRouteQuoteSnapshot, selectRouteCandidate } from '../modelCenter/routePricing.js';
import { resolveModelPricePolicy } from '../modelCenter/priceResolution.js';
import { routeGenerationTask } from './smartRouter.js';
import { assertPublicModelOrderable } from './models.js';

const DEFAULT_QUOTE_TTL_MINUTES = 5;

const IGNORED_QUOTE_KEYS = new Set([
  'prompt',
  'watermark',
  'quoteId',
  'quote_id',
  'idempotencyKey',
  'idempotency_key',
  'studioId',
  'studio_id',
  'routingMode',
  'routing_mode',
  'modelId',
  'model',
  'endpoint',
  'label',
]);

export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashQuoteRequest(modelId, parameters, capabilityVersion = null) {
  const norm = parameters && typeof parameters === 'object' ? { ...parameters } : {};
  for (const key of Object.keys(norm)) {
    if (IGNORED_QUOTE_KEYS.has(key) || norm[key] === undefined) {
      delete norm[key];
    }
  }
  return crypto.createHash('sha256')
    .update(stableSerialize({ modelId, parameters: norm, ...(capabilityVersion ? {capabilityVersion} : {}) })).digest('hex');
}

async function resolveCanonicalModelId(modelId, transaction = null, options = {}) {
  if (!modelId) return null;
  const direct = await getCanonicalModelById(modelId, transaction);
  if (direct) return direct.id;
  const alias = MODEL_ENDPOINT_ALIASES[String(modelId).trim().toLowerCase()];
  if (alias) {
    const canonical = await getCanonicalModelById(alias, transaction);
    if (canonical) return canonical.id;
  }
  const legacy = await findModelByEndpointOrId(modelId, options);
  return legacy?.id || String(modelId);
}

/**
 * 模型计价引擎 (PricingEngine)
 * 计算用户端销售积分 (Credits)，并与底层真实 API 成本完全解耦
 */
export async function calculateModelPrice({
  modelId,
  pricingConfig = null,
  parameters = {},
  subscriptionLevel = 'free',
  transaction = null,
  routeResult = null,
} = {}) {
  let model = null;
  if (modelId) {
    model = await getCanonicalModelById(modelId, transaction);
    if (!model) {
      const cleanKey = String(modelId).trim().toLowerCase();
      const aliasedId = MODEL_ENDPOINT_ALIASES[cleanKey];
      if (aliasedId) {
        model = await getCanonicalModelById(aliasedId, transaction);
      }
    }
    if (!model) {
      const legacy = await findModelByEndpointOrId(modelId, { parameters });
      if (legacy) {
        model = {
          id: legacy.id,
          name: legacy.name,
          category: legacy.type || 'image',
          credits_price: legacy.credits_price,
        };
      }
    }
    if (!model) throw Object.assign(new Error(`模型 ${modelId} 不存在`), { code: 'MODEL_NOT_FOUND' });
  }

  let pricing = pricingConfig || (model ? await getModelPricing(model.id, transaction) : null);
  if (!pricing || pricing.is_active === false) {
    throw Object.assign(new Error(`模型 ${model.id} 未配置有效价盘`), { code: 'MODEL_PRICING_UNCONFIGURED' });
  }

  const formulaConfig = pricing.formula_config || {};
  const baseCredits = Number(pricing.base_credits);
  if (!Number.isFinite(baseCredits) || baseCredits <= 0) {
    throw Object.assign(new Error(`模型 ${model.id} 的价盘基础积分无效`), { code: 'MODEL_PRICING_UNCONFIGURED' });
  }
  const minCredits = Math.max(Number(pricing.min_credits || 10), CREDIT_PRICING_POLICY.minimumCredits);
  const route = routeResult || await routeGenerationTask({
    modelId: model.id,
    parameters,
    persistDecision: false,
    transaction,
  });
  const routeCandidates = route.allCandidates || [];
  if (!routeCandidates.length) {
    throw Object.assign(new Error(`模型 ${model.id} 没有可报价的渠道`), { code: 'MODEL_PRICING_UNCONFIGURED' });
  }
  const lowest = routeCandidates[0];
  const highestCost = Math.max(...routeCandidates.map((candidate) => candidate.estimatedCostCny));
  const maxCostCandidate = routeCandidates.find((candidate) => candidate.estimatedCostCny === highestCost);

  const resolutionText = String(parameters.resolution || parameters.size || '').toLowerCase();
  const resolutionMultiplier = Object.entries(formulaConfig.resolution_multipliers || {})
    .find(([key]) => resolutionText.includes(String(key).toLowerCase()))?.[1] ?? 1;
  const duration = Number.parseInt(parameters.duration || parameters.video_duration || parameters.output_duration, 10);
  const durationMultiplier = Number.isFinite(duration) && formulaConfig.duration_multipliers
    ? Number(formulaConfig.duration_multipliers[String(duration)] ?? (duration > 5 ? 1 + (duration - 5) * 0.15 : 1))
    : 1;
  const quality = String(parameters.quality || parameters.quality_mode || 'standard').toLowerCase();
  const qualityMultiplier = Number(formulaConfig.quality_multipliers?.[quality] ?? 1);

  // 积分来源、站点售价与毛利底线由同一纯函数解析，报价、任务与后台共用一套口径。
  // 锁定价盘未生效/已过期是硬阻断，不会悄悄退回积分换算，也不会被当作免费。
  const priceResolution = resolveModelPricePolicy({
    pricing,
    highestProviderCostCny: highestCost,
    minCredits,
    formulaMultipliers: {
      resolution: resolutionMultiplier,
      duration: durationMultiplier,
      quality: qualityMultiplier,
    },
  });
  const priceBlocker = priceResolution.blockers.find((item) => [
    'SITE_PRICE_NOT_EFFECTIVE', 'SITE_PRICE_EXPIRED', 'PRICE_POLICY_INVALID',
  ].includes(item.code));
  if (priceBlocker) {
    const messages = {
      SITE_PRICE_NOT_EFFECTIVE: '本站售价尚未生效',
      SITE_PRICE_EXPIRED: '本站售价已过期，请管理员重新发布',
      PRICE_POLICY_INVALID: `模型 ${model.id} 的价盘缺少可用的积分或成本口径`,
    };
    throw Object.assign(new Error(messages[priceBlocker.code]), { code: priceBlocker.code, details: priceBlocker });
  }
  const finalCredits = priceResolution.credits.value;
  const sitePriceCny = priceResolution.sitePrice.cny;
  const marginOverrideActive = priceResolution.marginFloor.source === 'time_limited_override';
  const minMarginRate = priceResolution.marginFloor.rate;
  const costCeilingCny = sitePriceCny * (1 - minMarginRate)
    / (1 + CREDIT_PRICING_POLICY.providerCostReserveRate);
  const maxFailoverCostUsd = route.fxSnapshot?.usdToCny > 0
    ? Number((costCeilingCny / route.fxSnapshot.usdToCny).toFixed(8)) : null;
  const routeCandidatesWithinMargin = routeCandidates.filter((candidate) => candidate.estimatedCostCny <= costCeilingCny);
  if (!routeCandidatesWithinMargin.some((candidate) => candidate.providerModelId === lowest.providerModelId)) {
    throw Object.assign(new Error(`模型 ${model.id} 当前售价无法覆盖最低成本渠道并满足 ${Math.round(minMarginRate * 100)}% 毛利底线`), {
      code: 'PRICING_MARGIN_BELOW_FLOOR',
      details: {
        sitePriceCny, lowestCostCny: lowest.estimatedCostCny, costCeilingCny, minMarginRate,
        evaluatedChannels: routeCandidates.map((candidate) => ({
          providerId: candidate.providerId, providerModelId: candidate.providerModelId,
          priceVersionId: candidate.priceVersionId, estimatedCostCny: candidate.estimatedCostCny,
          estimatedCostUsd: candidate.estimatedCostUsd, priceType: candidate.priceType,
          estimatedCostSource: candidate.estimatedCostSource,
        })),
        grossMarginRate: sitePriceCny > 0
          ? Number(((sitePriceCny - lowest.estimatedCostCny * (1 + CREDIT_PRICING_POLICY.providerCostReserveRate)) / sitePriceCny).toFixed(4))
          : null,
        eligibleChannels: routeCandidatesWithinMargin.map((candidate) => ({ providerId: candidate.providerId,
          providerModelId: candidate.providerModelId, priceVersionId: candidate.priceVersionId,
          estimatedCostCny: candidate.estimatedCostCny, estimatedCostUsd: candidate.estimatedCostUsd })),
      },
    });
  }

  // Apply the configured policy only inside the quote's margin-safe candidate set.
  // The default remains strict minimum cost; alternate policies can never route
  // through a channel that would violate the quoted margin floor.
  const selected = selectRouteCandidate({ candidates: routeCandidatesWithinMargin }, {
    routingMode: route.routingMode || 'cost',
    weights: route.weights || null,
  });
  if (!selected) throw Object.assign(new Error(`模型 ${model.id} 没有满足毛利底线的合格渠道`), { code: 'PRICING_MARGIN_BELOW_FLOOR' });

  const fxSnapshot = selected.fxSnapshot;
  const routeQuote = {
    ...buildRouteQuoteSnapshot({
      candidates: routeCandidatesWithinMargin,
      rejected: [
        ...(route.rejectedCandidates || []),
        ...routeCandidates.filter((candidate) => candidate.estimatedCostCny > costCeilingCny).map((candidate) => ({
          providerId: candidate.providerId,
          providerModelId: candidate.providerModelId,
          reason: 'MINIMUM_MARGIN_FLOOR',
        })),
      ],
    }, selected, { maxFailoverCostUsd, maxFailoverCostCny: costCeilingCny }),
    routingMode: route.routingMode || 'cost',
    policyVersion: route.policyVersion || null,
    rejected: [
      ...(route.rejectedCandidates || []),
      ...routeCandidates.filter((candidate) => candidate.estimatedCostCny > costCeilingCny).map((candidate) => ({
        providerId: candidate.providerId,
        providerModelId: candidate.providerModelId,
        reason: 'MINIMUM_MARGIN_FLOOR',
      })),
    ],
    maxFailoverCostCny: Number(costCeilingCny.toFixed(8)),
      minGrossMarginRate: minMarginRate,
      marginOverrideActive,
  };
  const worstFailoverCostCny = Math.max(...routeCandidatesWithinMargin.map((candidate) => candidate.estimatedCostCny));
  const reservedWorstCaseCostCny = worstFailoverCostCny * (1 + CREDIT_PRICING_POLICY.providerCostReserveRate);
  const grossMarginRate = sitePriceCny > 0
    ? Number(((sitePriceCny - reservedWorstCaseCostCny) / sitePriceCny).toFixed(4)) : null;
  const estimatedSellingPriceUsd = fxSnapshot?.usdToCny > 0
    ? Number((sitePriceCny / fxSnapshot.usdToCny).toFixed(8)) : null;
  const costSource = {
    providerId: selected.providerId,
    providerModelId: selected.providerModelId,
    priceVersionId: selected.priceVersionId,
    priceType: selected.priceType,
    currency: selected.estimatedCostCurrency,
    estimatedCost: selected.estimatedCost,
    estimatedCostCny: selected.estimatedCostCny,
    estimatedCostUsd: selected.estimatedCostUsd,
    route: route.routingMode === 'cost' ? 'minimum_estimated_actual_cost' : `admin_${route.routingMode}_policy`,
    components: selected.estimate?.components || {},
  };

  return {
    modelId: model.id,
    modelName: model.display_name || model.name,
    credits: finalCredits,
    pricingType: pricing.pricing_type,
    pricePolicyVersion: priceResolution.policyVersion,
    creditsSource: priceResolution.credits.source,
    sitePriceCny,
    sitePriceVersionId: pricing.active_site_price_version_id || null,
    selectedProviderId: selected.providerId,
    selectedProviderModelId: selected.providerModelId,
    selectedPriceVersionId: selected.priceVersionId,
    estimatedProviderCostUsd: selected.estimatedCostUsd,
    estimatedProviderCostCny: selected.estimatedCostCny,
    evaluatedChannels: routeCandidates.map((candidate) => ({
      providerId: candidate.providerId,
      providerModelId: candidate.providerModelId,
      priceVersionId: candidate.priceVersionId,
      estimatedCostCny: candidate.estimatedCostCny,
      estimatedCostUsd: candidate.estimatedCostUsd,
      estimatedCostSource: candidate.estimatedCostSource,
      conservativeUpperBoundExpiresAt: candidate.conservativeUpperBoundExpiresAt,
      healthStatus: candidate.healthStatus,
      successRate: candidate.successRate,
      latencyMs: candidate.latencyMs,
    })),
    eligibleChannels: routeCandidatesWithinMargin.map((candidate) => ({ providerId: candidate.providerId,
      providerModelId: candidate.providerModelId, priceVersionId: candidate.priceVersionId,
      estimatedCostCny: candidate.estimatedCostCny, estimatedCostUsd: candidate.estimatedCostUsd,
      estimatedCostSource: candidate.estimatedCostSource,
      conservativeUpperBoundExpiresAt: candidate.conservativeUpperBoundExpiresAt })),
    maxFailoverCostUsd,
    maxFailoverCostCny: Number(costCeilingCny.toFixed(8)),
    fxSnapshot,
    routeQuote,
    marginCheck: {
      sitePriceCny,
      selectedCostCny: selected.estimatedCostCny,
      worstEligibleCostCny: Math.max(...routeCandidatesWithinMargin.map((candidate) => candidate.estimatedCostCny)),
      grossMarginRate,
      minimumGrossMarginRate: minMarginRate,
      passed: grossMarginRate !== null && grossMarginRate >= minMarginRate,
    },
    pricingBreakdown: {
      pricePolicyVersion: priceResolution.policyVersion,
      baseCredits,
      formulaBaseCredits: priceResolution.formulaBaseCredits,
      creditsSource: priceResolution.credits.source,
      creditsReason: priceResolution.credits.reason,
      minimumCredits: priceResolution.credits.minimumCredits,
      resolutionMultiplier: Number(resolutionMultiplier),
      durationMultiplier,
      qualityMultiplier,
      subscriptionDiscount: 1,
      subscriptionLevel,
      cnyPerCredit: CREDIT_PRICING_POLICY.cnyPerCredit,
      providerCostReserveRate: CREDIT_PRICING_POLICY.providerCostReserveRate,
      targetContributionMarginRate: minMarginRate,
      estimatedProviderCostCny: Number(selected.estimatedCostCny.toFixed(8)),
      worstEligibleProviderCostCny: Number(highestCost.toFixed(8)),
      costSource,
      sitePriceCny,
      routeQuote,
      fxSnapshot,
      priceSourceConfigured: true,
      priceResolution,
    },
    estimatedSellingPriceUsd,
    grossMarginRate,
    isMarginWarning: grossMarginRate === null || grossMarginRate < minMarginRate,
  };
}

/**
 * 生成防篡改 Quote 报价单 (有效期 5 分钟)
 */
export async function createGenerationQuote({
  userId,
  user,
  modelId,
  parameters = {},
  capabilitySnapshot = null,
  subscriptionLevel = 'free',
  ttlMinutes = DEFAULT_QUOTE_TTL_MINUTES,
  idempotencyKey = null,
  transaction = null,
  requirePublicAvailability = true,
  site = 'main',
} = {}) {
  const effectiveUserId = userId || user?.id;
  if (!effectiveUserId) throw Object.assign(new Error('用户未登录'), { code: 'UNAUTHENTICATED' });

  const client = dataClient(transaction);
  const normalizedIdempotencyKey = idempotencyKey
    ? crypto.createHash('sha256').update(`${effectiveUserId}:${String(idempotencyKey).trim()}`).digest('hex')
    : null;
  if (normalizedIdempotencyKey) {
    const incomingModelId = await resolveCanonicalModelId(modelId, transaction, { parameters });
    const incomingRequestHash = hashQuoteRequest(incomingModelId, parameters, capabilitySnapshot?.version);
    const previous = await client.readOne(`
      SELECT id,model_id,parameters_json,credits_quoted,pricing_breakdown_json,
        estimated_provider_cost_usd,expires_at,consumed_at,route_snapshot_json,fx_snapshot_json,request_hash,site_price_version_id
      FROM ai_studio.generation_quotes WHERE user_id=$1 AND idempotency_key=$2
    `, [effectiveUserId, normalizedIdempotencyKey]);
    if (previous) {
      if (previous.model_id !== incomingModelId
        || (previous.request_hash && previous.request_hash !== incomingRequestHash)) {
        throw Object.assign(new Error('该报价幂等键已用于不同模型或参数'), { code: 'QUOTE_IDEMPOTENCY_CONFLICT' });
      }
      const breakdown = typeof previous.pricing_breakdown_json === 'string'
        ? JSON.parse(previous.pricing_breakdown_json) : previous.pricing_breakdown_json || {};
      const routeSnapshot = typeof previous.route_snapshot_json === 'string'
        ? JSON.parse(previous.route_snapshot_json) : previous.route_snapshot_json || {};
      return {
        quoteId: previous.id,
        modelId: previous.model_id,
        credits: Number(previous.credits_quoted),
        pricingBreakdown: breakdown,
        expiresAt: previous.expires_at,
        idempotent: true,
        routeSnapshot,
        calculation: {
          modelId: previous.model_id,
          credits: Number(previous.credits_quoted),
          pricingBreakdown: breakdown,
          estimatedProviderCostUsd: previous.estimated_provider_cost_usd === null
            ? null : Number(previous.estimated_provider_cost_usd),
          routeQuote: routeSnapshot,
        },
      };
    }
  }

  if (requirePublicAvailability) {
    const publicModelId = await resolveCanonicalModelId(modelId, transaction, { parameters });
    await assertPublicModelOrderable(publicModelId,{userId:effectiveUserId,site});
  }

  if (capabilitySnapshot) validateCapabilityParameters(String(modelId), capabilitySnapshot.version, capabilitySnapshot.schema, parameters);

  const calculation = await calculateModelPrice({
    modelId,
    parameters,
    subscriptionLevel,
    transaction,
  });

  if (capabilitySnapshot) calculation.pricingBreakdown = {...calculation.pricingBreakdown,capability:capabilitySnapshot};

  const run = client.write;
  const quoteId = `quote_${randomId()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const canonicalParameters = JSON.stringify(parameters || {});
  const requestHash = hashQuoteRequest(calculation.modelId, parameters, capabilitySnapshot?.version);
  const routeSnapshot = calculation.routeQuote || {};
  const policySnapshot = {
    pricePolicyVersion: calculation.pricePolicyVersion || null,
    creditsSource: calculation.creditsSource || null,
    sitePriceSource: calculation.pricingBreakdown?.priceResolution?.sitePrice?.source || null,
    marginFloorSource: calculation.pricingBreakdown?.priceResolution?.marginFloor?.source || null,
    cnyPerCredit: CREDIT_PRICING_POLICY.cnyPerCredit,
    providerCostReserveRate: CREDIT_PRICING_POLICY.providerCostReserveRate,
        minGrossMarginRate: calculation.marginCheck?.minimumGrossMarginRate,
        creditRounding: CREDIT_PRICING_POLICY.creditRounding,
    sitePriceVersionId: calculation.sitePriceVersionId || null,
  };

  try {
    await run(`
    INSERT INTO ai_studio.generation_quotes
      (id, user_id, model_id, parameters_json, credits_quoted, pricing_breakdown_json,
       estimated_provider_cost_usd, expires_at, created_at, route_snapshot_json,
       fx_snapshot_json, idempotency_key, request_hash, pricing_policy_snapshot_json,site_price_version_id)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9, $10::jsonb,
       $11::jsonb, $12, $13, $14::jsonb,$15)
    `, [
      quoteId, effectiveUserId, calculation.modelId, canonicalParameters,
      calculation.credits, JSON.stringify(calculation.pricingBreakdown),
      calculation.estimatedProviderCostUsd, expiresAt.toISOString(), now.toISOString(),
      JSON.stringify(routeSnapshot), JSON.stringify(calculation.fxSnapshot || {}),
      normalizedIdempotencyKey, requestHash, JSON.stringify(policySnapshot), calculation.sitePriceVersionId || null,
    ]);
  } catch (error) {
    if (error?.code !== '23505' || !normalizedIdempotencyKey || transaction) throw error;
    const raced = await client.readOne(`
      SELECT id,model_id,parameters_json,credits_quoted,pricing_breakdown_json,
        estimated_provider_cost_usd,expires_at,consumed_at,route_snapshot_json,request_hash
      FROM ai_studio.generation_quotes WHERE user_id=$1 AND idempotency_key=$2
    `, [effectiveUserId, normalizedIdempotencyKey]);
    if (!raced) throw error;
    if (raced.model_id !== calculation.modelId || raced.request_hash !== requestHash) {
      throw Object.assign(new Error('该报价幂等键已用于不同模型或参数'), { code: 'QUOTE_IDEMPOTENCY_CONFLICT' });
    }
    const breakdown = typeof raced.pricing_breakdown_json === 'string'
      ? JSON.parse(raced.pricing_breakdown_json) : raced.pricing_breakdown_json || {};
    const routeSnapshot = typeof raced.route_snapshot_json === 'string'
      ? JSON.parse(raced.route_snapshot_json) : raced.route_snapshot_json || {};
    return {
      quoteId: raced.id,
      modelId: raced.model_id,
      credits: Number(raced.credits_quoted),
      pricingBreakdown: breakdown,
      expiresAt: raced.expires_at,
      idempotent: true,
      routeSnapshot,
      calculation: {
        modelId: raced.model_id,
        credits: Number(raced.credits_quoted),
        pricingBreakdown: breakdown,
        estimatedProviderCostUsd: raced.estimated_provider_cost_usd === null
          ? null : Number(raced.estimated_provider_cost_usd),
        routeQuote: routeSnapshot,
      },
    };
  }

  return {
    quoteId,
    modelId: calculation.modelId,
    credits: calculation.credits,
    pricingBreakdown: calculation.pricingBreakdown,
    expiresAt: expiresAt.toISOString(),
    routeSnapshot,
    idempotent: false,
    calculation,
  };
}

/**
 * 校验并消费 Quote 报价单
 * 严防前端恶意篡改 Credits 字段
 */
export async function verifyAndConsumeQuote({
  quoteId,
  userId,
  user,
  expectedUserId,
  modelId,
  expectedModelId,
  parameters = null,
  expectedCapabilityVersion = null,
  currentCapabilityVersion = null,
  transaction = null,
} = {}) {
  if (!quoteId) return null;

  const targetUserId = userId || user?.id || expectedUserId;
  const targetModelId = modelId || expectedModelId;

  const client = dataClient(transaction);
  const run = client.readOne;
  const executeRun = client.write;

  const quote = await run(
    'SELECT * FROM ai_studio.generation_quotes WHERE id = $1 FOR UPDATE',
    [quoteId]
  );

  if (!quote) {
    throw Object.assign(new Error('报价单不存在或已失效'), { code: 'QUOTE_NOT_FOUND' });
  }

  if (targetUserId && String(quote.user_id) !== String(targetUserId)) {
    throw Object.assign(new Error('报价单归属用户不符'), { code: 'QUOTE_USER_MISMATCH' });
  }

  if (targetModelId && quote.model_id !== targetModelId) {
    throw Object.assign(new Error('报价单模型与当前任务不一致'), { code: 'QUOTE_MODEL_MISMATCH' });
  }

  const storedBreakdown = typeof quote.pricing_breakdown_json === 'string' ? JSON.parse(quote.pricing_breakdown_json) : quote.pricing_breakdown_json || {};
  const capability = storedBreakdown.capability;
  if (expectedCapabilityVersion && capability?.version !== expectedCapabilityVersion) throw Object.assign(new Error('任务能力版本与报价不一致，请重新报价'), {code:'QUOTE_CAPABILITY_MISMATCH'});
  // The published catalogue is authoritative even when a legacy client omits the version:
  // a quote priced against an outdated capability contract must be re-quoted, not silently
  // executed against the new specification.
  if (capability?.version && currentCapabilityVersion && capability.version !== currentCapabilityVersion) {
    throw Object.assign(new Error('模型能力已更新，该报价已失效，请重新报价'), { code: 'QUOTE_CAPABILITY_MISMATCH' });
  }
  if (parameters !== null && quote.request_hash) {
    const requestHash = hashQuoteRequest(quote.model_id, parameters, capability?.version);
    if (requestHash !== quote.request_hash) {
      throw Object.assign(new Error('本次任务参数与报价参数不一致，请重新报价'), { code: 'QUOTE_PARAMETERS_MISMATCH' });
    }
  }

  if (capability && parameters !== null) validateCapabilityParameters(quote.model_id,capability.version,capability.schema,parameters);

  if (quote.consumed_at) {
    throw Object.assign(new Error('该报价单已被使用，请重新获取报价'), { code: 'QUOTE_ALREADY_CONSUMED' });
  }

  const now = new Date();
  if (new Date(quote.expires_at).getTime() < now.getTime()) {
    throw Object.assign(new Error('报价单已过期，请重新获取最新报价'), { code: 'QUOTE_EXPIRED' });
  }

  // 标记已被消费
  await executeRun(
    'UPDATE ai_studio.generation_quotes SET consumed_at = $1 WHERE id = $2',
    [now.toISOString(), quoteId]
  );

  return {
    id: quote.id,
    quoteId: quote.id,
    credits: Number(quote.credits_quoted),
    estimatedCostUsd: quote.estimated_provider_cost_usd === null || quote.estimated_provider_cost_usd === undefined
      ? null : Number(quote.estimated_provider_cost_usd),
    pricingBreakdown: typeof quote.pricing_breakdown_json === 'string'
      ? JSON.parse(quote.pricing_breakdown_json)
      : (quote.pricing_breakdown_json || {}),
    consumed_at: now.toISOString(),
    is_consumed: true,
    routeSnapshot: typeof quote.route_snapshot_json === 'string'
      ? JSON.parse(quote.route_snapshot_json) : (quote.route_snapshot_json || {}),
    fxSnapshot: typeof quote.fx_snapshot_json === 'string'
      ? JSON.parse(quote.fx_snapshot_json) : (quote.fx_snapshot_json || {}),
  };
}
