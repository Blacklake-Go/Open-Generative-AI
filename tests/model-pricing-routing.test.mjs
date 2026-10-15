import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRouteQuoteSnapshot,
  exchangeRateSnapshotFromRows,
  estimateRequestCost,
  evaluateRouteCandidates,
  selectRouteCandidate,
} from '../lib/modelCenter/routePricing.js';
import { buildCsv, buildXlsx, parseCsv, parseXlsx } from '../lib/modelCenter/priceWorkbook.js';
import { canRetireMissingCatalogEntries, muapiTaskEndpoint, normalizeMuapiCatalogItem } from '../lib/modelCenter/syncRules.js';

const fxSnapshot = { id: 'fx-test', usdToCny: 7.2, rates: { USD_CNY: 7.2, CNY_CNY: 1 }, observedAt: new Date().toISOString() };
const now = Date.now();

function mapping({ providerId, cost = 0.1, resolution = '1024x1024', health = 'healthy', checkedAt = now - 1000,
  price = true, priceConfig = null, expiresAt = now + 60_000, mappingVersion = 1, endpoint = '/v1/generate',
  successRate = 0.5, priority = 0, licenseRequirements = [], verifiedLicenseConditions = [] } = {}) {
  return {
    model_id: 'canonical-image-v1', provider_id: providerId, provider_model_id: `${providerId}-image-v1`,
    provider_model_version: 'v1', provider_endpoint: endpoint, mapping_version: mappingVersion,
    enabled: true, provider_enabled: true, adapter_available: true, credentials_configured: true,
    review_status: 'approved', supported_task_types: ['t2i'], supported_resolutions: [resolution],
    license_requirements: licenseRequirements,
    capabilities: { input_types: ['text'], output_types: ['image'], verified_license_conditions: verifiedLicenseConditions },
    health_status: health, last_health_check_at: new Date(checkedAt).toISOString(), circuit_state: 'closed',
    success_rate: successRate, average_latency_ms: providerId === 'slow' ? 900 : 300, priority,
    active_price_version: price ? {
      id: `price-${providerId}`, price_type: 'account_actual', status: 'active',
      source_observed_at: new Date(now - 60_000).toISOString(), expires_at: new Date(expiresAt).toISOString(),
      billing_unit: 'per_request', currency: 'USD',
      price_config: priceConfig || { base_cost: cost, currency: 'USD' },
    } : null,
  };
}

function evaluate(mappings, parameters = { task_type: 't2i', resolution: '1024x1024', num_images: 1 }, options = {}) {
  return evaluateRouteCandidates(mappings, parameters, {
    modelId: 'canonical-image-v1', now, fxSnapshot, ...options,
  });
}

test('same display name does not make an unsupported resolution equivalent', () => {
  const result = evaluate([mapping({ providerId: 'small-only', resolution: '512x512' })]);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected[0].reason, 'RESOLUTION_UNSUPPORTED');
});

test('a requested resolution cannot fall through to an otherwise-ready route with no resolution contract', () => {
  const verified = mapping({ providerId: 'verified-video', resolution: '720p' });
  verified.model_id = 'canonical-video-v1';
  verified.provider_model_id = 'verified-video-v1';
  verified.supported_task_types = ['t2v'];
  verified.capabilities = { input_types: ['text'], output_types: ['video'] };
  const unverified = { ...verified, provider_id: 'unverified-video', provider_model_id: 'unverified-video-v1',
    supported_resolutions: [], capabilities: { input_types: ['text'], output_types: ['video'] } };
  const result = evaluateRouteCandidates([verified, unverified], {
    task_type: 't2v', resolution: '720p',
  }, { modelId: 'canonical-video-v1', now, fxSnapshot });

  assert.deepEqual(result.candidates.map((candidate) => candidate.providerId), ['verified-video']);
  assert.equal(result.rejected.find((candidate) => candidate.providerId === 'unverified-video')?.reason,
    'RESOLUTION_UNVERIFIED');
});

test('a requested aspect ratio or duration needs a declaration on the selected provider route', () => {
  const route = mapping({ providerId: 'video', resolution: '720p' });
  route.model_id = 'canonical-video-v1';
  route.provider_model_id = 'video-v1';
  route.supported_task_types = ['t2v'];
  route.capabilities = { input_types: ['text'], output_types: ['video'] };

  const aspectRatio = evaluateRouteCandidates([route], {
    task_type: 't2v', aspect_ratio: '16:9',
  }, { modelId: 'canonical-video-v1', now, fxSnapshot });
  assert.equal(aspectRatio.rejected[0].reason, 'ASPECT_RATIO_UNVERIFIED');

  route.capabilities.aspect_ratios = ['16:9'];
  const duration = evaluateRouteCandidates([route], {
    task_type: 't2v', duration: 6,
  }, { modelId: 'canonical-video-v1', now, fxSnapshot });
  assert.equal(duration.rejected[0].reason, 'DURATION_UNVERIFIED');
});

test('provider capability checks validate every supplied alias for the same specification', () => {
  const route = mapping({ providerId: 'video', resolution: '1280x720' });
  route.model_id = 'canonical-video-v1';
  route.provider_model_id = 'video-v1';
  route.supported_task_types = ['t2v'];
  route.supported_durations = [6];
  route.capabilities = { input_types: ['text'], output_types: ['video'] };

  const conflictingResolution = evaluateRouteCandidates([route], {
    task_type: 't2v', resolution: '1280*720', size: '1080p',
  }, { modelId: 'canonical-video-v1', now, fxSnapshot });
  assert.equal(conflictingResolution.rejected[0].reason, 'RESOLUTION_UNSUPPORTED');

  const consistentAliases = evaluateRouteCandidates([route], {
    task_type: 't2v', resolution: '1280*720', duration: 6, duration_seconds: 6,
  }, { modelId: 'canonical-video-v1', now, fxSnapshot });
  assert.equal(consistentAliases.candidates.length, 1);
});

test('provider routes reject undeclared supplemental parameters while allowing declared media fields', () => {
  const route = mapping({ providerId: 'video' });
  route.model_id = 'canonical-video-v1';
  route.provider_model_id = 'video-v1';
  route.supported_task_types = ['i2v'];
  route.supported_resolutions = [];
  route.capabilities = { input_types: ['image'], output_types: ['video'] };

  const undeclared = evaluateRouteCandidates([route], {
    task_type: 'i2v', generate_audio: true,
  }, { modelId: 'canonical-video-v1', now, fxSnapshot });
  assert.equal(undeclared.candidates.length, 0);
  assert.equal(undeclared.rejected[0].reason, 'PARAMETER_UNVERIFIED');

  const declared = evaluateRouteCandidates([{ ...route,
    capabilities: { ...route.capabilities, parameters: ['generate_audio'] },
  }], {
    task_type: 'i2v', generate_audio: true, image_url: 'https://asset.example/image.png',
    reference_images: ['https://asset.example/reference.png'],
  }, { modelId: 'canonical-video-v1', now, fxSnapshot });
  assert.equal(declared.candidates.length, 1);
});

test('cost strategy selects the lower-cost equivalent mapping despite lower priority and reliability', () => {
  const result = evaluate([
    mapping({ providerId: 'expensive', cost: 0.3, priority: 999, successRate: 0.99 }),
    mapping({ providerId: 'cheap', cost: 0.1, priority: 0, successRate: 0.1 }),
  ]);
  const winner = selectRouteCandidate(result, { routingMode: 'cost', costTieToleranceRate: 0 });
  assert.equal(winner.providerId, 'cheap');
  assert.equal(winner.estimatedCostUsd, 0.1);
});

test('non-cost admin strategies can only break ties inside their eligible set', () => {
  const result = evaluate([
    mapping({ providerId: 'cheap', cost: 0.1, successRate: 0.4 }),
    mapping({ providerId: 'reliable', cost: 0.104, successRate: 0.99 }),
  ]);
  assert.equal(selectRouteCandidate(result, { routingMode: 'cost', costTieToleranceRate: 0 }).providerId, 'cheap');
  assert.equal(selectRouteCandidate(result, { routingMode: 'quality' }).providerId, 'reliable');
});

test('failover accepts an equal-spec quoted candidate only below the quote ceiling', () => {
  const initial = evaluate([mapping({ providerId: 'first', cost: 0.1 }), mapping({ providerId: 'backup', cost: 0.2 })]);
  const selected = selectRouteCandidate(initial, { routingMode: 'cost', costTieToleranceRate: 0 });
  const quote = buildRouteQuoteSnapshot(initial, selected, { maxFailoverCostUsd: 0.11, maxFailoverCostCny: 0.8 });
  const over = evaluate([mapping({ providerId: 'backup', cost: 0.12 })], undefined, { quoteSnapshot: quote });
  assert.equal(over.candidates.length, 0);
  assert.equal(over.rejected[0].reason, 'QUOTE_COST_CEILING_EXCEEDED');
  const within = evaluate([mapping({ providerId: 'backup', cost: 0.105 })], undefined, { quoteSnapshot: quote });
  assert.equal(within.candidates[0].providerId, 'backup');
});

test('missing, zero-without-free-evidence, and expired prices are never interpreted as free', () => {
  const missing = evaluate([mapping({ providerId: 'missing', price: false })]);
  assert.equal(missing.rejected[0].reason, 'PRICE_MISSING');
  const zeroUnknown = evaluate([mapping({ providerId: 'zero-unknown', priceConfig: { base_cost: 0, currency: 'USD' } })]);
  assert.equal(zeroUnknown.rejected[0].reason, 'PRICE_CONFIG_MISSING');
  const expired = evaluate([mapping({ providerId: 'expired', expiresAt: now - 1 })]);
  assert.equal(expired.rejected[0].reason, 'PRICE_EXPIRED');
});

test('stale listed price may route only under a valid explicit conservative upper bound', () => {
  const bounded = mapping({ providerId: 'bounded', expiresAt: now - 1000 });
  bounded.active_price_version.conservative_upper_bound_config = { base_cost: 0.4, currency: 'USD' };
  bounded.active_price_version.conservative_upper_bound_currency = 'USD';
  bounded.active_price_version.conservative_upper_bound_expires_at = new Date(now + 60_000).toISOString();
  bounded.active_price_version.conservative_upper_bound_reason = '人工核验后设置短期上界';
  const allowed = evaluate([bounded]);
  assert.equal(allowed.candidates.length, 1);
  assert.equal(allowed.candidates[0].estimatedCostUsd, 0.4);
  assert.equal(allowed.candidates[0].estimatedCostSource, 'admin_conservative_upper_bound');

  bounded.active_price_version.conservative_upper_bound_expires_at = new Date(now - 1).toISOString();
  const refused = evaluate([bounded]);
  assert.equal(refused.candidates.length, 0);
  assert.equal(refused.rejected[0].reason, 'PRICE_EXPIRED');
});

test('explicitly verified free price is zero and eligible', () => {
  const result = evaluate([mapping({ providerId: 'free', priceConfig: { base_cost: 0, currency: 'USD', is_free: true } })]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].estimatedCostUsd, 0);
});

test('unknown or stale health checks exclude a channel', () => {
  const unknown = evaluate([mapping({ providerId: 'unknown', health: 'unknown' })]);
  assert.equal(unknown.rejected[0].reason, 'HEALTH_CHECK_FAILED');
  const stale = evaluate([mapping({ providerId: 'stale', checkedAt: now - 16 * 60_000 })], undefined, { maxHealthAgeMs: 15 * 60_000 });
  assert.equal(stale.rejected[0].reason, 'HEALTH_CHECK_STALE');
});

test('quote pins the mapping version and actual provider endpoint', () => {
  const initial = evaluate([mapping({ providerId: 'pinned' })]);
  const selected = selectRouteCandidate(initial, { routingMode: 'cost' });
  const quote = buildRouteQuoteSnapshot(initial, selected, { maxFailoverCostUsd: 0.1 });
  assert.equal(quote.candidates[0].mappingVersion, 1);
  assert.equal(quote.candidates[0].providerEndpoint, '/v1/generate');
  const changed = evaluate([mapping({ providerId: 'pinned', mappingVersion: 2 })], undefined, { quoteSnapshot: quote });
  assert.equal(changed.candidates.length, 0);
  assert.equal(changed.rejected[0].reason, 'MAPPING_CHANGED_AFTER_QUOTE');
});

test('client input cannot claim required licenses; mapping approval must record verified terms', () => {
  const required = mapping({ providerId: 'licensed', licenseRequirements: ['commercial'] });
  const spoofed = evaluate([required], {
    task_type: 't2i', resolution: '1024x1024', license_conditions_met: ['commercial'],
  });
  assert.equal(spoofed.candidates.length, 0);
  assert.equal(spoofed.rejected[0].reason, 'LICENSE_REQUIREMENT_NOT_CONFIRMED');

  required.capabilities.verified_license_conditions = ['commercial'];
  const verified = evaluate([required]);
  assert.equal(verified.candidates.length, 1);
});

test('unit price uses the requested amount of video seconds', () => {
  const estimate = estimateRequestCost({ amount: 0.2 }, { output_duration: 5 }, {
    billingUnit: 'per_second', currency: 'USD', fxSnapshot,
  });
  assert.equal(estimate.known, true);
  assert.equal(estimate.estimatedCostUsd, 1);
  assert.equal(estimate.estimatedCostCny, 7.2);
});

test('currency quotes use timestamped currency-pair snapshots and ignore expired pairs', () => {
  const snapshot = exchangeRateSnapshotFromRows([
    { id: 'fx-usd-cny', base_currency: 'USD', quote_currency: 'CNY', rate: '7.2', observed_at: new Date(now - 1000), expires_at: new Date(now + 60_000) },
    { id: 'fx-eur-cny', base_currency: 'EUR', quote_currency: 'CNY', rate: '7.8', observed_at: new Date(now - 1000), expires_at: new Date(now + 60_000) },
    { id: 'fx-gbp-cny-old', base_currency: 'GBP', quote_currency: 'CNY', rate: '9.1', observed_at: new Date(now - 10_000), expires_at: new Date(now - 1) },
  ], { now });
  const estimate = estimateRequestCost({ base_cost: 0.1 }, {}, {
    billingUnit: 'per_request', currency: 'EUR', fxSnapshot: snapshot,
  });
  assert.equal(estimate.estimatedCostCny, 0.78);
  assert.ok(snapshot.expiredPairs.includes('GBP_CNY'));
  assert.equal(snapshot.rateIds.EUR_CNY, 'fx-eur-cny');
});

test('CSV and XLSX preserve price rows without exporting executable formulas', () => {
  const row = {
    canonical_model_id: 'canonical-image-v1', provider_id: 'muapi', provider_model_id: 'flux-v1',
    price_type: 'aggregator', billing_unit: 'per_request', currency: 'USD',
    channel_price_json: '{"base_cost":0.12}', source_url: 'https://example.invalid/pricing',
    price_config_json: '{"base_cost":0.12}', price_version_id: 'pver-1',
  };
  const csv = buildCsv([{ ...row, source_api: '=HYPERLINK("https://bad.invalid")' }]);
  assert.match(csv, /'=/);
  assert.equal(parseCsv(csv)[0].provider_model_id, row.provider_model_id);
  const xlsx = parseXlsx(buildXlsx([row]));
  assert.equal(xlsx[0].canonical_model_id, row.canonical_model_id);
  assert.equal(xlsx[0].price_version_id, 'pver-1');
  assert.throws(() => parseCsv('canonical_model_id,provider_id,provider_model_id\na,=cmd,b'),
    (error) => error.code === 'IMPORT_FORMULA_NOT_ALLOWED');
});

test('CSV import rejects duplicate or missing stable identity headers', () => {
  assert.throws(() => parseCsv('canonical_model_id,provider_id,provider_id\na,b,c'),
    (error) => error.code === 'IMPORT_DUPLICATE_HEADER');
  assert.throws(() => parseCsv('provider_id,provider_model_id\na,b'),
    (error) => error.code === 'IMPORT_REQUIRED_COLUMNS_MISSING');
});

test('empty or incomplete catalog responses never retire previously seen items', () => {
  assert.equal(canRetireMissingCatalogEntries({ fetchedCount: 0, reportedTotal: 0 }), false);
  assert.equal(canRetireMissingCatalogEntries({ fetchedCount: 2, reportedTotal: 3 }), false);
  assert.equal(canRetireMissingCatalogEntries({ fetchedCount: 2, reportedTotal: null, complete: false }), false);
  assert.equal(canRetireMissingCatalogEntries({ fetchedCount: 3, reportedTotal: 3, complete: true }), true);
  assert.equal(canRetireMissingCatalogEntries({ fetchedCount: 1 }), false);
  assert.equal(canRetireMissingCatalogEntries({ fetchedCount: 1, complete: true }), true);
});

test('MuAPI catalog identity, submit endpoint, and fixed per-request billing follow official fields', () => {
  const normalized = normalizeMuapiCatalogItem({
    name: 'flux-dev',
    endpoint_url: '/api/v1/flux-dev',
    cost: 0.025,
    cost_currency: 'USD',
    cost_strategy: 'fixed_cost',
    dynamic_pricing: false,
  }, { observedAt: new Date(now).toISOString() });
  assert.equal(normalized.providerModelId, 'flux-dev');
  assert.equal(normalized.endpoint, '/api/v1/flux-dev');
  assert.equal(normalized.catalogPrice.billingUnit, 'per_request');
  assert.equal(normalized.catalogPrice.priceConfig.base_cost, 0.025);
  assert.equal(estimateRequestCost(normalized.catalogPrice.priceConfig, { task_type: 't2i' }, {
    currency: normalized.catalogPrice.currency,
    billingUnit: normalized.catalogPrice.billingUnit,
    fxSnapshot,
  }).estimatedCostCny, 0.18);
});

test('MuAPI dynamic catalog price remains request-quoted and uses the documented estimate endpoint', () => {
  const normalized = normalizeMuapiCatalogItem({
    name: 'veo3-fast',
    endpoint_url: '/api/v1/veo3-fast',
    estimate_endpoint: '/api/v1/models/veo3-fast/estimate-cost',
    cost: 0.4,
    cost_currency: 'USD',
    cost_strategy: 'veo3-fast-t2v',
    dynamic_pricing: true,
  }, { observedAt: new Date(now).toISOString() });
  assert.equal(normalized.providerModelId, 'veo3-fast');
  assert.equal(normalized.endpoint, '/api/v1/veo3-fast');
  assert.equal(normalized.catalogPrice.billingUnit, 'per_request_estimate');
  assert.equal(normalized.catalogPrice.priceConfig.dynamic_pricing, true);
  assert.equal(normalized.estimateEndpoint, '/api/v1/models/veo3-fast/estimate-cost');
  const withoutListedCost = normalizeMuapiCatalogItem({
    name: 'dynamic-without-catalog-price', dynamic_pricing: true,
    estimate_endpoint: '/api/v1/models/dynamic-without-catalog-price/estimate-cost',
  });
  assert.equal(withoutListedCost.catalogPrice.priceConfig.base_cost, undefined);
  assert.equal(withoutListedCost.catalogPrice.priceConfig.dynamic_pricing, true);
});

test('MuAPI bare catalog paths are pinned to the versioned task route the supplier serves', () => {
  // Live evidence: POST /api/v1/nano-banana-pro -> 403 (auth required, route exists)
  // while POST /nano-banana-pro -> 404, so a stored bare path can never be called.
  const bare = normalizeMuapiCatalogItem({ name: 'nano-banana-pro', endpoint: '/nano-banana-pro' });
  assert.equal(bare.endpoint, '/api/v1/nano-banana-pro');
  const slugOnly = normalizeMuapiCatalogItem({ name: 'nano-banana', endpoint: 'nano-banana' });
  assert.equal(slugOnly.endpoint, '/api/v1/nano-banana');
  const absent = normalizeMuapiCatalogItem({ name: 'flux dev' });
  assert.equal(absent.endpoint, '/api/v1/flux%20dev');
  assert.equal(muapiTaskEndpoint('https://partner.example/api/v1/custom', 'x'), 'https://partner.example/api/v1/custom');
  assert.equal(muapiTaskEndpoint('/api/v1/already-prefixed', 'x'), '/api/v1/already-prefixed');
});
