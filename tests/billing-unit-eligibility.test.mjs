import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateRequestCost,
  evaluateRouteCandidates,
  isRoutableBillingUnit,
} from '../lib/modelCenter/routePricing.js';
import { assessPublicModelProviderReadiness } from '../lib/services/dependencyHealth.js';
import { isPublicProviderRouteReady } from '../lib/services/models.js';

const NOW = Date.now();
const FX = { usdToCny: 7.2, rates: { USD_CNY: 7.2 } };

function route(billingUnit = 'per_request') {
  return {
    model_id: 'image-model',
    mapping_id: 'mapping-a',
    provider_id: 'provider-a',
    provider_model_id: 'provider-a-image-v1',
    provider_model_version: 'v1',
    provider_endpoint: '/v1/images/generations',
    mapping_version: 1,
    mapping_enabled: true,
    enabled: true,
    provider_enabled: true,
    adapter_available: true,
    credentials_configured: true,
    review_status: 'approved',
    supported_task_types: ['t2i'],
    supported_resolutions: ['1024x1024'],
    capabilities: { input_types: ['text'], output_types: ['image'] },
    health_status: 'healthy',
    last_health_check_at: new Date(NOW - 60_000).toISOString(),
    circuit_state: 'closed',
    cost_config: { base_cost: 0.05 },
    active_price_version: {
      id: 'price-a',
      price_type: 'manual',
      status: 'active',
      billing_unit: billingUnit,
      currency: 'USD',
      effective_at: new Date(NOW - 60_000).toISOString(),
      source_observed_at: new Date(NOW - 60_000).toISOString(),
      expires_at: new Date(NOW + 60_000).toISOString(),
      price_config: { base_cost: 0.05 },
    },
  };
}

test('routable billing units are explicit and legacy placeholders are rejected', () => {
  assert.equal(isRoutableBillingUnit('per_request'), true);
  assert.equal(isRoutableBillingUnit(' PER_SECOND '), true);
  assert.equal(isRoutableBillingUnit('legacy_unit_unverified'), false);
  assert.equal(isRoutableBillingUnit('provider_defined_unit_pending_review'), false);
});

test('cost estimation does not silently replace an unknown configured unit with per-request', () => {
  const estimate = estimateRequestCost({ base_cost: 0.05, billing_unit: 'legacy_unit_unverified' }, {}, {
    currency: 'USD', fxSnapshot: FX,
  });
  assert.equal(estimate.known, false);
  assert.equal(estimate.reason, 'BILLING_UNIT_UNVERIFIED');
});

test('router excludes an otherwise healthy, priced mapping with an unverified billing unit', () => {
  const result = evaluateRouteCandidates([route('legacy_unit_unverified')], {
    task_type: 't2i', resolution: '1024x1024', num_images: 1,
  }, {
    modelId: 'image-model', now: NOW, fxSnapshot: FX,
  });

  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected[0].reason, 'BILLING_UNIT_UNVERIFIED');
});

test('public catalog route eligibility also fails closed on unknown billing units', () => {
  const configuredProviders = new Set(['provider-a']);
  assert.equal(isPublicProviderRouteReady(route('per_request'), configuredProviders, NOW), true);
  assert.equal(isPublicProviderRouteReady(route('legacy_unit_unverified'), configuredProviders, NOW), false);
});

test('readiness does not count a route with an unverified billing unit as covered', () => {
  const row = {
    model_id: 'image-model',
    mapping_id: 'mapping-a',
    provider_id: 'provider-a',
    mapping_enabled: true,
    review_status: 'approved',
    provider_endpoint: '/v1/images/generations',
    provider_enabled: true,
    model_category: 'image',
    health_status: 'healthy',
    circuit_state: 'closed',
    last_health_check_at: new Date(NOW - 60_000).toISOString(),
    active_price_version: {
      id: 'price-a',
      price_type: 'manual',
      status: 'active',
      billing_unit: 'legacy_unit_unverified',
      currency: 'USD',
      effective_at: new Date(NOW - 60_000).toISOString(),
      source_observed_at: new Date(NOW - 60_000).toISOString(),
      price_config: { base_cost: 0.05 },
    },
    cost_config: { base_cost: 0.05 },
  };
  const result = assessPublicModelProviderReadiness([row], {
    credentialProviders: new Set(['provider-a']),
    adapterProviders: new Set(['provider-a']),
    now: NOW,
  });

  assert.notEqual(result.status, 'healthy');
  assert.equal(result.coveredModels, 0);
  assert.equal(result.unavailableModels, 1);
});

test('price staging rejects an unverified unit before loading a provider mapping', async () => {
  const { stageProviderPrice } = await import('../lib/services/modelPricingControl.js');
  await assert.rejects(stageProviderPrice({
    providerModelId: 'mapping-that-must-not-be-read',
    priceType: 'manual',
    billingUnit: 'legacy_unit_unverified',
    currency: 'USD',
    priceConfig: { base_cost: 0.05 },
    sourceUrl: 'https://supplier.example/pricing',
    sourceObservedAt: new Date().toISOString(),
  }), (error) => error.code === 'PRICE_BILLING_UNIT_UNVERIFIED');
});
