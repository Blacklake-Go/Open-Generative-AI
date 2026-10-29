import 'server-only';
import { getCurrentExchangeRateSnapshot } from './exchangeRates.js';
import { normalizeGenerationTaskType } from '../modelCenter/capabilitySchema.js';

import { dataClient, now, randomId } from '../repositories/runtimeDb.js';
import { getCanonicalModelById, getRoutingPolicy, listProviderModelsByModelId } from '../repositories/aiCatalog.js';
import { getServerProviderApiKey } from './providerSecrets.js';
import { hasProviderAdapter } from '../adapters/index.js';
import { buildMuapiEstimatePayload } from '../adapters/muapiModelContracts.js';
import {
  attachOfficialPublicPriceVersions,
  buildRouteQuoteSnapshot,
  evaluateRouteCandidates,
  normalizeRouteCostCeiling,
  ROUTING_POLICY_VERSION,
  scoreRouteCandidates,
} from '../modelCenter/routePricing.js';
import { buildRouteDecisionMetadata } from '../modelCenter/routeDecisionRecord.js';

export const ROUTING_MODES = Object.freeze({
  COST: 'cost',
  PRIORITY: 'priority',
  QUALITY: 'quality',
  STABILITY: 'stability',
  BALANCED: 'balanced',
});

const ROUTING_MODE_LABELS = Object.freeze({
  cost: '成本优先',
  priority: '管理员优先级',
  quality: '质量优先',
  stability: '稳定优先',
  balanced: '均衡',
});

export const DEFAULT_WEIGHTS = Object.freeze({ cost: 0.55, success_rate: 0.30, speed: 0.15, capacity: 0 });

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch {}
  }
  return {};
}

function quoteSnapshotFromRow(row) {
  if (!row) return null;
  const direct = parseJson(row.route_snapshot_json);
  if (Array.isArray(direct.candidates) && direct.candidates.length) return direct;
  const breakdown = parseJson(row.pricing_breakdown_json);
  const legacy = parseJson(breakdown.routeQuote);
  return Array.isArray(legacy.candidates) && legacy.candidates.length ? legacy : null;
}


function pricingParameters(parameters = {}, prompt = '') {
  return { ...parameters, ...(prompt ? { prompt } : {}) };
}

function inferRequestedTask(model, parameters = {}) {
  const explicit = parameters.task_type || parameters.taskType || parameters.generation_mode;
  if (explicit) return normalizeGenerationTaskType(explicit);
  const declaredMode = String(parameters.mode || '').toLowerCase();
  if (/^(t2i|i2i|t2v|i2v|v2v|t2a|text[_-]to[_-](image|video|audio)|image[_-]to[_-](image|video)|video[_-]to[_-]video)$/.test(declaredMode)) {
    return declaredMode;
  }
  const hasVideoInput = Boolean(parameters.input_video || parameters.video_url || parameters.source_video);
  const hasImageInput = Boolean(parameters.image_url || parameters.image || parameters.reference_images?.length
    || parameters.image_urls?.length || parameters.reference_image || parameters.input_image || parameters.images?.length);
  const category = String(model.category || model.type || '').toLowerCase();
  if (category.includes('music')) return 't2m';
  if (category.includes('text')) return 't2t';
  if (category.includes('audio')) return 't2a';
  if (category.includes('video')) return hasVideoInput ? 'v2v' : hasImageInput ? 'i2v' : 't2v';
  if (category.includes('image')) return hasImageInput ? 'i2i' : 't2i';
  return '';
}

async function estimateMuapiDynamicPrice(mapping, parameters) {
  const price = parseJson(mapping.active_price_version);
  const config = parseJson(price.price_config);
  if (config.dynamic_pricing !== true) return mapping;
  if (String(mapping.provider_id).toLowerCase() !== 'muapi') {
    return { ...mapping, active_price_version: { ...price, price_config: {} } };
  }

  const modelId = String(mapping.provider_model_id || '').trim();
  if (!modelId || !/^[a-zA-Z0-9._:-]{1,128}$/.test(modelId)) {
    return { ...mapping, active_price_version: { ...price, price_config: {} } };
  }
  const defaultEstimateEndpoint = `/api/v1/models/${encodeURIComponent(modelId)}/estimate-cost`;
  const configuredEstimateEndpoint = String(config.estimate_endpoint || defaultEstimateEndpoint).trim();
  let estimateUrl;
  try {
    const parsed = new URL(configuredEstimateEndpoint, 'https://api.muapi.ai');
    if (parsed.origin !== 'https://api.muapi.ai' || parsed.username || parsed.password || parsed.hash) {
      return { ...mapping, active_price_version: { ...price, price_config: {} } };
    }
    estimateUrl = parsed.toString();
  } catch {
    return { ...mapping, active_price_version: { ...price, price_config: {} } };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(estimateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(buildMuapiEstimatePayload(parameters, modelId)),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    const amount = Number(result?.cost);
    const currency = String(result?.currency || '').toUpperCase();
    if (!response.ok || result?.model !== modelId || result?.dynamic_pricing !== true
      || !Number.isFinite(amount) || amount < 0 || !['USD', 'CNY', 'RMB'].includes(currency)) {
      return { ...mapping, active_price_version: { ...price, price_config: {} } };
    }
    const observedAt = new Date().toISOString();
    return {
      ...mapping,
      active_price_version: {
        ...price,
        billing_unit: 'per_request_estimate',
        currency,
        price_config: { base_cost: amount, currency, is_free: amount === 0, dynamic_estimate: true },
        source_observed_at: observedAt,
        fetched_at: observedAt,
        effective_at: observedAt,
        expires_at: null,
        request_estimate_source: estimateUrl,
      },
    };
  } catch {
    return { ...mapping, active_price_version: { ...price, price_config: {} } };
  } finally {
    clearTimeout(timer);
  }
}

function finiteCost(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(8)) : null;
}

function percent(rate) {
  return Math.round(Number(rate) * 10000) / 100;
}

/**
 * 生成可复核的中文选择理由。
 * 必须说明实际生效的策略、是否发生回退、胜出的依据以及下一备选，
 * 否则后台只能看到一个 providerId，无法解释配置是否按预期生效。
 */
function buildSelectionReason(decision, winner) {
  const parts = [];
  if (decision.modeFallback) {
    parts.push(`请求的调度策略「${decision.modeFallback.requested}」不是已定义策略，本次显式按均衡策略执行（${decision.modeFallback.reason}）。`);
  }
  const nextScore = decision.scores.find((score) => score.providerModelId !== winner.providerModelId) || null;
  const next = nextScore
    ? `下一备选 ${nextScore.providerId} 预计 ${nextScore.estimatedCostCny} CNY。`
    : '没有可用备用渠道。';
  if (decision.routingMode === 'cost') {
    const cheapest = decision.scores[0];
    parts.push(`${winner.providerId} 是本次请求合格渠道中预计成本最低的一家（${winner.estimatedCostCny} CNY）；${next}`);
    if (cheapest && cheapest.providerModelId !== winner.providerModelId) {
      parts.push(`严格最低成本为 ${cheapest.providerId}（${cheapest.estimatedCostCny} CNY），但 ${winner.providerId} 在 ${percent(decision.costTieToleranceRate)}% 成本容差内，且成功率、延迟或管理员优先级更优，由决胜规则接替。`);
    }
  } else if (decision.routingMode === 'priority') {
    parts.push(`${winner.providerId} 按管理员优先级选中（priority=${winner.priority ?? 0}），预计成本 ${winner.estimatedCostCny} CNY；同优先级内按成本与稳定性决胜。${next}`);
  } else {
    const weights = decision.weights || {};
    parts.push(`${winner.providerId} 按${ROUTING_MODE_LABELS[decision.routingMode] || decision.routingMode}加权评分选中（策略版本 ${decision.policyVersion}，权重 cost=${weights.cost ?? 'n/a'} / success_rate=${weights.success_rate ?? 'n/a'} / speed=${weights.speed ?? 'n/a'} / capacity=${weights.capacity ?? 'n/a'}），预计成本 ${winner.estimatedCostCny} CNY。${next}`);
  }
  parts.push(`策略版本 ${decision.policyVersion}，合格候选 ${decision.candidateCount} 条。`);
  // 健康证据必须随选择理由一起记录：credential 探针只证明“密钥已配置”，
  // 不能当作接口连通、鉴权成功或真实生成验证。
  const health = winner.healthEvidence || null;
  if (health?.evidenceLevel === 'credential_only') {
    parts.push(`健康状态 ${health.healthStatus || 'unknown'} 仅来自配置级凭据探针（${health.checkedAt || '时间未知'}），未完成接口连通、鉴权或真实生成验证。`);
  } else if (health?.evidenceLevel === 'http_probe') {
    parts.push(`健康状态 ${health.healthStatus || 'unknown'} 来自 ${health.checkedAt || '时间未知'} 的接口探针。`);
  } else if (health) {
    parts.push(`健康状态来源未记录探针等级（${health.healthStatus || 'unknown'}），不能据此认定鉴权或生成可用。`);
  }
  return parts.join('');
}

/**
 * Routes only among reviewed, equivalent mappings with a current actual-cost version.
 * Cost mode is a strict ascending cost decision; health and priority only break near ties.
 */
export async function routeGenerationTask({
  jobId,
  modelId,
  parameters = {},
  prompt = '',
  excludedProviderIds = [],
  transaction = null,
  resolveCredential = getServerProviderApiKey,
  quoteId = null,
  quoteSnapshot: suppliedQuoteSnapshot = null,
  routingMode: requestedMode = null,
  fxSnapshot: suppliedFxSnapshot = null,
  costCeiling = null,
  persistDecision = true,
} = {}) {
  if (!modelId) throw Object.assign(new Error('路由目标 modelId 不能为空'), { code: 'MODEL_ID_REQUIRED' });
  const client = dataClient(transaction);
  const [canonical, rawProviderModels, policy, fxSnapshot, quoteRow] = await Promise.all([
    getCanonicalModelById(modelId, transaction),
    listProviderModelsByModelId(modelId, { enabledOnly: false, transaction }),
    getRoutingPolicy(modelId, transaction),
    getCurrentExchangeRateSnapshot(client),
    quoteId ? client.readOne(`SELECT route_snapshot_json,pricing_breakdown_json FROM ai_studio.generation_quotes WHERE id=$1`, [quoteId]) : null,
  ]);
  if (!canonical) throw Object.assign(new Error(`规范模型 ${modelId} 不存在`), { code: 'MODEL_NOT_FOUND' });
  const quoteSnapshot = suppliedQuoteSnapshot || quoteSnapshotFromRow(quoteRow);
  // 报价快照的策略优先于当前配置：已经报价的任务必须按报价时的策略执行。
  const configuredMode = requestedMode || quoteSnapshot?.routingMode || policy?.routing_mode || ROUTING_MODES.COST;
  const modelParameters = pricingParameters({
    ...parameters,
    task_type: inferRequestedTask(canonical, parameters),
  }, prompt);

  const rawMappings = rawProviderModels || [];
  const missingPriceMappingIds = rawMappings
    .filter((mapping) => !parseJson(mapping.active_price_version).id)
    .map((mapping) => String(mapping.id || '').trim())
    .filter(Boolean);
  const officialPriceRows = missingPriceMappingIds.length
    ? await client.readMany([
      'SELECT DISTINCT ON (pv.provider_model_id)',
      '  pv.provider_model_id, to_jsonb(pv) AS price_version',
      'FROM ai_studio.provider_model_price_versions pv',
      'WHERE pv.provider_model_id = ANY($1::text[])',
      '  AND pv.status = \'active\'',
      '  AND pv.price_type = \'official_public\'',
      'ORDER BY pv.provider_model_id, pv.version_no DESC',
    ].join('\n'), [missingPriceMappingIds])
    : [];
  const mappingsWithOfficialPrices = attachOfficialPublicPriceVersions(rawMappings, officialPriceRows);

  const enriched = await Promise.all(mappingsWithOfficialPrices.map(async (mapping) => {
    const providerId = String(mapping.provider_id || '').toLowerCase();
    let credentialsConfigured = false;
    try { credentialsConfigured = Boolean(await resolveCredential({ provider: providerId })); } catch {}
    const candidate = {
      ...mapping,
      enabled: Boolean(mapping.enabled),
      provider_enabled: Boolean(mapping.provider_enabled),
      adapter_available: hasProviderAdapter(providerId),
      credentials_configured: credentialsConfigured,
    };
    return estimateMuapiDynamicPrice(candidate, modelParameters);
  }));

  const evaluation = evaluateRouteCandidates(enriched, modelParameters, {
    modelId,
    // 跨模型故障转移沿用原报价的汇率快照，但不再绑定原报价候选白名单；
    // 预算改由 costCeiling 强制执行，保证不会因切模型而放宽成本上限。
    fxSnapshot: suppliedFxSnapshot || quoteSnapshot?.fxSnapshot || fxSnapshot,
    quoteSnapshot,
    costCeiling,
    excludedProviderIds,
  });
  const policyWeights = policy?.weights ? (typeof policy.weights === 'string' ? JSON.parse(policy.weights) : policy.weights) : null;
  const decision = scoreRouteCandidates(evaluation, { routingMode: configuredMode, weights: policyWeights });
  const winner = decision.selected;
  if (!winner) {
    const details = evaluation.rejected;
    const firstReasons = [...new Set(details.map((item) => item.reason))].slice(0, 8);
    throw Object.assign(new Error(`规范模型 ${modelId} 当前没有符合规格且成本可验证的渠道`), {
      code: 'NO_COST_VERIFIED_ROUTE',
      details,
      rejectedReasons: firstReasons,
    });
  }

  const selectedRoute = winner.providerModel;
  const selectionReason = buildSelectionReason(decision, winner);
  const selectedScore = decision.selectedScore || {
    totalScore: 0, costScore: 0, successScore: 0, speedScore: 0, capacityScore: 0,
  };
  const scoreByModelId = new Map(decision.scores.map((score) => [score.providerModelId, score]));
  const normalizedCostCeiling = normalizeRouteCostCeiling(costCeiling);
  const effectiveBudgetUsd = quoteSnapshot?.maxFailoverCostUsd ?? normalizedCostCeiling?.maxCostUsd ?? null;
  const effectiveBudgetCny = quoteSnapshot?.maxFailoverCostCny ?? normalizedCostCeiling?.maxCostCny ?? null;
  // 先确定 id 再组装元数据，保证 attempt 能通过同一个 id 关联回本决策。
  const decisionId = jobId && persistDecision ? `rdl_${randomId()}` : null;
  const selectionMetadata = buildRouteDecisionMetadata({
    decision,
    winner,
    evaluation,
    decisionId,
    quoteId,
    costCeiling,
    budgetUsd: effectiveBudgetUsd,
    budgetCny: effectiveBudgetCny,
  });

  if (jobId && persistDecision) {
    await client.write(`
      INSERT INTO ai_studio.route_decision_logs
        (id,job_id,model_id,candidate_providers_json,selected_provider_id,
         selected_provider_model_id,routing_mode,policy_version,score,cost_score,
         stability_score,speed_score,capacity_score,selection_reason,
         selection_metadata_json,created_at,quote_id,price_version_id,
         estimated_cost_cny,estimated_cost_usd,fx_snapshot_json,rejected_candidates_json,
         failover_cost_limit_usd)
      VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb,$23)
    `, [
      decisionId, jobId, modelId,
      JSON.stringify(selectionMetadata.eligibleRoutes),
      winner.providerId, winner.providerModelId, decision.routingMode, decision.policyVersion,
      selectedScore.totalScore, selectedScore.costScore, selectedScore.successScore,
      selectedScore.speedScore, selectedScore.capacityScore, selectionReason,
      JSON.stringify(selectionMetadata), now(), quoteId,
      winner.priceVersionId, winner.estimatedCostCny, winner.estimatedCostUsd,
      JSON.stringify(winner.fxSnapshot), JSON.stringify(evaluation.rejected),
      effectiveBudgetUsd === null ? null : finiteCost(effectiveBudgetUsd),
    ]);
  }

  const candidates = [...evaluation.candidates]
    .sort((a, b) => a.estimatedCostCny - b.estimatedCostCny || b.priority - a.priority);
  const routeQuote = buildRouteQuoteSnapshot(evaluation, winner, {
    maxFailoverCostUsd: quoteSnapshot?.maxFailoverCostUsd ?? null,
  });
  return {
    // attempt 用这个 id 关联回决策记录，receipt/重试/终态因此可回溯到选择依据。
    decisionId,
    selectedRoute,
    selectedProvider: selectedRoute,
    selectedProviderId: winner.providerId,
    selectedProviderModelId: winner.providerModelId,
    selectedPriceVersionId: winner.priceVersionId,
    winner: { ...winner, totalScore: selectedScore.totalScore },
    allCandidates: candidates.map((candidate) => ({
      ...candidate,
      totalScore: scoreByModelId.get(candidate.providerModelId)?.totalScore ?? 0,
    })),
    rejectedCandidates: evaluation.rejected,
    routeQuote,
    routingMode: decision.routingMode,
    requestedRoutingMode: decision.requestedRoutingMode || null,
    mode: decision.routingMode,
    modeFallback: decision.modeFallback,
    policyVersion: decision.policyVersion,
    weights: decision.weights,
    selectionMetadata,
    finalScore: selectedScore.totalScore,
    modelId,
    selectionReason,
  };
}
