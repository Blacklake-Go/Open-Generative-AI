import 'server-only';

import { dataClient, now, randomId } from '../repositories/runtimeDb.js';
import { getCanonicalModelById, getRoutingPolicy, listProviderModelsByModelId } from '../repositories/aiCatalog.js';
import { getServerProviderApiKey } from './providerSecrets.js';
import { hasProviderAdapter } from '../adapters/index.js';
import { buildMuapiEstimatePayload } from '../adapters/muapiModelContracts.js';
import {
  buildRouteQuoteSnapshot,
  evaluateRouteCandidates,
  exchangeRateSnapshotFromRows,
  selectRouteCandidate,
  ROUTING_MODE_WEIGHT_PRESETS,
} from '../modelCenter/routePricing.js';

export const ROUTING_MODES = Object.freeze({
  COST: 'cost',
  QUALITY: 'quality',
  STABILITY: 'stability',
  BALANCED: 'balanced',
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

async function getLatestFxSnapshot(client) {
  const rows = await client.readMany(`
    SELECT DISTINCT ON (base_currency,quote_currency)
      id,base_currency,quote_currency,rate,source_type,source_url,observed_at,expires_at
    FROM ai_studio.exchange_rate_snapshots
    ORDER BY base_currency,quote_currency,observed_at DESC
  `);
  return exchangeRateSnapshotFromRows(rows);
}

function pricingParameters(parameters = {}, prompt = '') {
  return { ...parameters, ...(prompt ? { prompt } : {}) };
}

function inferRequestedTask(model, parameters = {}) {
  const explicit = parameters.task_type || parameters.taskType || parameters.generation_mode;
  if (explicit) return String(explicit).toLowerCase();
  const declaredMode = String(parameters.mode || '').toLowerCase();
  if (/^(t2i|i2i|t2v|i2v|v2v|t2a|text[_-]to[_-](image|video|audio)|image[_-]to[_-](image|video)|video[_-]to[_-]video)$/.test(declaredMode)) {
    return declaredMode;
  }
  const hasVideoInput = Boolean(parameters.input_video || parameters.video_url || parameters.source_video);
  const hasImageInput = Boolean(parameters.image_url || parameters.image || parameters.reference_images?.length
    || parameters.image_urls?.length || parameters.reference_image || parameters.input_image || parameters.images?.length);
  const category = String(model.category || model.type || '').toLowerCase();
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
  persistDecision = true,
} = {}) {
  if (!modelId) throw Object.assign(new Error('路由目标 modelId 不能为空'), { code: 'MODEL_ID_REQUIRED' });
  const client = dataClient(transaction);
  const [canonical, rawProviderModels, policy, fxSnapshot, quoteRow] = await Promise.all([
    getCanonicalModelById(modelId, transaction),
    listProviderModelsByModelId(modelId, { enabledOnly: false, transaction }),
    getRoutingPolicy(modelId, transaction),
    getLatestFxSnapshot(client),
    quoteId ? client.readOne(`SELECT route_snapshot_json,pricing_breakdown_json FROM ai_studio.generation_quotes WHERE id=$1`, [quoteId]) : null,
  ]);
  if (!canonical) throw Object.assign(new Error(`规范模型 ${modelId} 不存在`), { code: 'MODEL_NOT_FOUND' });
  const quoteSnapshot = suppliedQuoteSnapshot || quoteSnapshotFromRow(quoteRow);
  const mode = requestedMode || quoteSnapshot?.routingMode || policy?.routing_mode || ROUTING_MODES.COST;
  const modelParameters = pricingParameters({
    ...parameters,
    task_type: inferRequestedTask(canonical, parameters),
  }, prompt);

  const enriched = await Promise.all((rawProviderModels || []).map(async (mapping) => {
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
    fxSnapshot: quoteSnapshot?.fxSnapshot || fxSnapshot,
    quoteSnapshot,
    excludedProviderIds,
  });
  const policyWeights = policy?.weights ? (typeof policy.weights === 'string' ? JSON.parse(policy.weights) : policy.weights) : null;
  const winner = selectRouteCandidate(evaluation, { routingMode: mode, weights: policyWeights });
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
  const next = [...evaluation.candidates]
    .filter((candidate) => candidate !== winner)
    .sort((a, b) => a.estimatedCostCny - b.estimatedCostCny)[0] || null;
  const selectionReason = mode === ROUTING_MODES.COST
    ? `${winner.providerId} 是本次请求合格渠道中预计成本最低的一家（${winner.estimatedCostCny} CNY）；`
      + (next ? `下一备选 ${next.providerId} 预计 ${next.estimatedCostCny} CNY。` : '没有可用备用渠道。')
    : `${winner.providerId} 按 ${mode} 策略选中，预计成本 ${winner.estimatedCostCny} CNY。`;

  if (jobId && persistDecision) {
    await client.write(`
      INSERT INTO ai_studio.route_decision_logs
        (id,job_id,model_id,candidate_providers_json,selected_provider_id,
         selected_provider_model_id,routing_mode,score,cost_score,stability_score,
         speed_score,capacity_score,selection_reason,created_at,quote_id,price_version_id,
         estimated_cost_cny,estimated_cost_usd,fx_snapshot_json,rejected_candidates_json,
         failover_cost_limit_usd)
      VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,0,0,0,0,0,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16)
    `, [
      `rdl_${randomId()}`, jobId, modelId,
      JSON.stringify(evaluation.candidates.map((candidate) => ({
        providerId: candidate.providerId,
        providerModelId: candidate.providerModelId,
        providerEndpoint: candidate.providerModel.provider_endpoint || null,
        providerModelVersion: candidate.providerModel.provider_model_version || null,
        mappingVersion: Number(candidate.providerModel.mapping_version || 0),
        priceVersionId: candidate.priceVersionId,
        estimatedCostCny: candidate.estimatedCostCny,
        estimatedCostUsd: candidate.estimatedCostUsd,
      }))),
      winner.providerId, winner.providerModelId, mode, selectionReason, now(), quoteId,
      winner.priceVersionId, winner.estimatedCostCny, winner.estimatedCostUsd,
      JSON.stringify(winner.fxSnapshot), JSON.stringify(evaluation.rejected),
      finiteCost(quoteSnapshot?.maxFailoverCostUsd),
    ]);
  }

  const candidates = [...evaluation.candidates]
    .sort((a, b) => a.estimatedCostCny - b.estimatedCostCny || b.priority - a.priority);
  const routeQuote = buildRouteQuoteSnapshot(evaluation, winner, {
    maxFailoverCostUsd: quoteSnapshot?.maxFailoverCostUsd ?? null,
  });
  return {
    selectedRoute,
    selectedProvider: selectedRoute,
    selectedProviderId: winner.providerId,
    selectedProviderModelId: winner.providerModelId,
    selectedPriceVersionId: winner.priceVersionId,
    winner: { ...winner, totalScore: 0 },
    allCandidates: candidates.map((candidate) => ({ ...candidate, totalScore: 0 })),
    rejectedCandidates: evaluation.rejected,
    routeQuote,
    routingMode: mode,
    mode,
    finalScore: 0,
    modelId,
    selectionReason,
  };
}
