import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPublicModelProviderReadiness, createProviderScopeOverflowStatus } from '../lib/services/dependencyHealth.js';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const credentials = new Set(['provider-a', 'provider-b']);
const adapters = new Set(['provider-a', 'provider-b']);

function route(overrides = {}) {
  return {
    model_id: 'model-a',
    mapping_id: 'mapping-a',
    provider_id: 'provider-a',
    mapping_enabled: true,
    review_status: 'approved',
    provider_endpoint: '/v1/generate',
    provider_enabled: true,
    model_category: 'image',
    health_status: 'healthy',
    circuit_state: 'closed',
    last_health_check_at: new Date(NOW - 60_000).toISOString(),
    active_price_version: {
      id: 'price-a',
      price_type: 'manual',
      status: 'active',
      billing_unit: 'per_request',
      currency: 'USD',
      effective_at: new Date(NOW - 60_000).toISOString(),
      source_observed_at: new Date(NOW - 60_000).toISOString(),
      price_config: { base_cost: 0.05 },
    },
    cost_config: { base_cost: 0.05 },
    ...overrides,
  };
}

test('public model provider readiness requires a recent healthy route per visible model', () => {
  const result = assessPublicModelProviderReadiness([
    route(),
    route({ mapping_id: 'mapping-b', provider_id: 'provider-b', health_status: 'unhealthy' }),
    route({ model_id: 'model-b', model_category: 'video', mapping_id: 'mapping-c', provider_id: 'provider-a', health_status: 'degraded' }),
    route({ model_id: 'model-b', model_category: 'video', mapping_id: 'mapping-d', provider_id: 'provider-b', health_status: 'healthy' }),
  ], { credentialProviders: credentials, adapterProviders: adapters, now: NOW });

  assert.equal(result.status, 'healthy');
  assert.equal(result.activeModels, 2);
  assert.equal(result.coveredModels, 2);
  assert.equal(result.unavailableModels, 0);
});

test('stale route health is unknown and cannot satisfy model readiness', () => {
  const result = assessPublicModelProviderReadiness([
    route({ last_health_check_at: new Date(NOW - (16 * 60_000)).toISOString() }),
  ], { credentialProviders: credentials, adapterProviders: adapters, now: NOW });

  assert.equal(result.status, 'unknown');
  assert.equal(result.staleHealthModels, 1);
  assert.equal(result.errorCode, 'PROVIDER_HEALTH_STALE');
});

test('missing model channels or credentials degrade readiness instead of assuming healthy', () => {
  const noPublicModels = assessPublicModelProviderReadiness([], { now: NOW });
  const noCredential = assessPublicModelProviderReadiness([route()], {
    credentialProviders: new Set(),
    adapterProviders: adapters,
    now: NOW,
  });

  assert.equal(noPublicModels.status, 'degraded');
  assert.equal(noCredential.status, 'degraded');
  assert.equal(noCredential.coveredModels, 0);
});

test('zero provider balance degrades readiness and an unreadable balance stays unknown', () => {
  const zeroBalance = assessPublicModelProviderReadiness([route()], {
    credentialProviders: credentials,
    adapterProviders: adapters,
    providerStatusOverrides: new Map([['provider-a', 'degraded']]),
    now: NOW,
  });
  const unreadableBalance = assessPublicModelProviderReadiness([route()], {
    credentialProviders: credentials,
    adapterProviders: adapters,
    providerStatusOverrides: new Map([['provider-a', 'unknown']]),
    now: NOW,
  });

  assert.equal(zeroBalance.status, 'degraded');
  assert.equal(zeroBalance.coveredModels, 0);
  assert.equal(zeroBalance.providers[0].status, 'degraded');
  assert.equal(unreadableBalance.status, 'unknown');
  assert.equal(unreadableBalance.coveredModels, 0);
});

test('provider scope overflow reports unknown coverage and preserves the public model count', () => {
  const result = createProviderScopeOverflowStatus([
    route(),
    route({ model_id: 'model-b', mapping_id: 'mapping-b' }),
    route({ model_id: 'model-a', mapping_id: 'mapping-c' }),
  ]);

  assert.equal(result.status, 'unknown');
  assert.equal(result.activeModels, 2);
  assert.equal(result.coveredModels, null);
  assert.equal(result.unavailableModels, null);
  assert.equal(result.errorCode, 'PROVIDER_SCOPE_TOO_LARGE');
});
