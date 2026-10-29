import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCachedDependencyProbe,
  assessPublicModelProviderReadiness,
  probeRequiredProviders,
} from '../lib/services/dependencyHealth.js';

test('dependency probes cache successful results and coalesce concurrent requests', async () => {
  let calls = 0;
  const probe = createCachedDependencyProbe({
    probe: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { status: 'healthy', provider: 'fixture' };
    },
    timeoutMs: 100,
    cacheMs: 1000,
  });

  const [first, concurrent] = await Promise.all([probe(), probe()]);
  const cached = await probe();
  assert.equal(calls, 1);
  assert.equal(first.status, 'healthy');
  assert.equal(concurrent.status, 'healthy');
  assert.equal(cached.cached, true);
  assert.equal(cached.provider, 'fixture');
});

test('unconfigured dependencies report degraded and transient probe timeouts report unknown', async () => {
  const degradedProbe = createCachedDependencyProbe({
    probe: async () => ({ status: 'degraded', errorCode: 'SMTP_DISABLED' }),
    timeoutMs: 100,
    cacheMs: 1000,
  });
  const timeoutProbe = createCachedDependencyProbe({
    probe: () => new Promise(() => {}),
    timeoutMs: 10,
    cacheMs: 1000,
  });

  assert.equal((await degradedProbe()).status, 'degraded');
  const timedOut = await timeoutProbe();
  assert.equal(timedOut.status, 'unknown');
  assert.equal(timedOut.errorCode, 'DEPENDENCY_PROBE_TIMEOUT');
});

function createMockRoute(overrides = {}) {
  const now = Date.now();
  return {
    model_id: 'core-image-model',
    mapping_id: 'map-image-1',
    provider_id: 'kling',
    mapping_enabled: true,
    review_status: 'approved',
    provider_endpoint: '/v1/images/generations',
    provider_enabled: true,
    model_category: 'image',
    health_status: 'healthy',
    circuit_state: 'closed',
    last_health_check_at: new Date(now - 60_000).toISOString(),
    active_price_version: {
      id: 'price-1',
      price_type: 'manual',
      status: 'active',
      billing_unit: 'per_request',
      currency: 'USD',
      effective_at: new Date(now - 60_000).toISOString(),
      source_observed_at: new Date(now - 60_000).toISOString(),
      price_config: { base_cost: 0.05 },
    },
    cost_config: { base_cost: 0.05 },
    ...overrides,
  };
}

test('provider readiness honors the configured router price age and still rejects older prices', async () => {
  const previous = process.env.MODEL_PRICE_MAX_AGE_MS;
  const now = Date.now();
  process.env.MODEL_PRICE_MAX_AGE_MS = String(30 * 86400000);
  try {
    const check = async (days) => {
      const base = createMockRoute();
      const price = { ...base.active_price_version, source_observed_at: new Date(now - days * 86400000).toISOString() };
      return probeRequiredProviders({
        listRoutes: async () => [
          { ...base, model_category: 'image', active_price_version: price },
          { ...base, model_id: 'video', model_category: 'video', active_price_version: price },
        ],
        resolveApiKey: async () => 'configured',
        hasAdapter: () => true,
        getAdapter: async () => ({ healthCheck: async () => ({ healthy: true }) }),
        updateHealth: async () => {},
        now,
      });
    };
    assert.equal((await check(8)).status, 'healthy');
    assert.equal((await check(31)).status, 'degraded');
  } finally {
    if (previous === undefined) delete process.env.MODEL_PRICE_MAX_AGE_MS;
    else process.env.MODEL_PRICE_MAX_AGE_MS = previous;
  }
});

test('assessPublicModelProviderReadiness recovers from cold-start staleness when active probe reports healthy', () => {
  const now = Date.now();
  // Stale historical timestamp (30 minutes ago, exceeding 15m threshold)
  const staleRoutes = [
    createMockRoute({
      model_id: 'image-1',
      model_category: 'image',
      provider_id: 'kling',
      last_health_check_at: new Date(now - 30 * 60_000).toISOString(),
    }),
    createMockRoute({
      model_id: 'video-1',
      model_category: 'video',
      provider_id: 'minimax',
      last_health_check_at: new Date(now - 30 * 60_000).toISOString(),
    }),
  ];

  // Without active probe overrides, staleness causes unknown status
  const unprobed = assessPublicModelProviderReadiness(staleRoutes, {
    credentialProviders: new Set(['kling', 'minimax']),
    adapterProviders: new Set(['kling', 'minimax']),
    now,
  });
  assert.equal(unprobed.status, 'unknown');
  assert.equal(unprobed.errorCode, 'PROVIDER_HEALTH_STALE');

  // With active probe healthy overrides, staleness is safely overcome
  const probed = assessPublicModelProviderReadiness(staleRoutes, {
    credentialProviders: new Set(['kling', 'minimax']),
    adapterProviders: new Set(['kling', 'minimax']),
    providerStatusOverrides: new Map([
      ['kling', 'healthy'],
      ['minimax', 'healthy'],
    ]),
    now,
  });
  assert.equal(probed.status, 'healthy');
  assert.equal(probed.coveredModels, 2);
  assert.equal(probed.unavailableModels, 0);
  assert.equal(probed.missingCategories.length, 0);
});

test('probeRequiredProviders actively probes adapters and resolves provider readiness', async () => {
  const now = Date.now();
  const mockRoutes = [
    createMockRoute({
      model_id: 'image-1',
      model_category: 'image',
      provider_id: 'kling',
      last_health_check_at: null, // Cold start: never checked before
    }),
    createMockRoute({
      model_id: 'video-1',
      model_category: 'video',
      provider_id: 'minimax',
      last_health_check_at: new Date(now - 60 * 60_000).toISOString(), // 1 hour stale
    }),
  ];

  const updatedProviders = [];
  const probedProviders = [];

  const result = await probeRequiredProviders({
    listRoutes: async () => mockRoutes,
    resolveApiKey: async ({ provider }) => `key-for-${provider}`,
    getAdapter: async (provider) => ({
      healthCheck: async () => {
        probedProviders.push(provider);
        return { healthy: true, latencyMs: 25 };
      },
    }),
    hasAdapter: () => true,
    updateHealth: async (provider, status) => {
      updatedProviders.push({ provider, ...status });
    },
    now,
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.coveredModels, 2);
  assert.equal(result.unavailableModels, 0);
  assert.deepEqual(probedProviders.sort(), ['kling', 'minimax']);
  assert.equal(updatedProviders.length, 2);
  assert.ok(updatedProviders.every((u) => u.healthStatus === 'healthy'));
});

test('probeRequiredProviders detects degraded provider balance and missing credentials', async () => {
  const now = Date.parse('2026-10-13T00:00:00Z');
  const mockRoutes = [
    createMockRoute({
      model_id: 'image-1',
      model_category: 'image',
      provider_id: 'muapi',
      last_health_check_at: new Date(now - 60_000).toISOString(),
    }),
    createMockRoute({
      model_id: 'video-1',
      model_category: 'video',
      provider_id: 'unconfigured-provider',
      last_health_check_at: new Date(now - 60_000).toISOString(),
    }),
  ];

  // MuAPI with 0 balance and unconfigured-provider without key
  const result = await probeRequiredProviders({
    listRoutes: async () => mockRoutes,
    resolveApiKey: async ({ provider }) => (provider === 'muapi' ? 'muapi-key' : null),
    getAdapter: async () => ({ healthCheck: async () => ({ healthy: true }) }),
    hasAdapter: (provider) => provider === 'muapi',
    fetchFn: async () => ({
      ok: true,
      json: async () => ({ balance: 0 }),
    }),
    updateHealth: async () => {},
    now,
  });

  assert.equal(result.status, 'degraded');
  assert.equal(result.coveredModels, 0);
  assert.equal(result.unavailableModels, 2);
});

