import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessPublicModelProviderReadiness,
  probeRequiredProviders,
  createCachedDependencyProbe,
} from '../lib/services/dependencyHealth.js';
import {
  evaluateRouteCandidates,
  selectRouteCandidate,
  ROUTING_MODE_WEIGHT_PRESETS,
} from '../lib/modelCenter/routePricing.js';
import { ROUTING_MODES } from '../lib/services/smartRouter.js';

const NOW = Date.parse('2026-10-13T12:00:00Z');

function createMockRoute(overrides = {}) {
  return {
    model_id: 'test-image-model',
    mapping_id: 'map-img-1',
    provider_id: 'kling',
    mapping_enabled: true,
    review_status: 'approved',
    provider_endpoint: '/v1/images/generations',
    provider_enabled: true,
    model_category: 'image',
    health_status: 'healthy',
    circuit_state: 'closed',
    last_health_check_at: new Date(NOW - 60_000).toISOString(),
    active_price_version: {
      id: 'price-1',
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

// -----------------------------------------------------------------------------
// SUITE 1: COLD-START SCENARIOS (older than 15 min, 30 days, null, undefined)
// -----------------------------------------------------------------------------

test('[Adversarial M2] Cold-start: assessPublicModelProviderReadiness strictly marks stale and missing timestamps as unknown', () => {
  const staleVariations = [
    { label: '16 minutes stale (>15m)', timestamp: new Date(NOW - 16 * 60_000).toISOString() },
    { label: '30 days stale', timestamp: new Date(NOW - 30 * 24 * 60 * 60_000).toISOString() },
    { label: 'null timestamp (never checked)', timestamp: null },
    { label: 'undefined timestamp', timestamp: undefined },
    { label: 'empty string timestamp', timestamp: '' },
    { label: 'corrupt date string', timestamp: 'not_a_valid_date' },
  ];

  for (const { label, timestamp } of staleVariations) {
    const route = createMockRoute({ last_health_check_at: timestamp });
    const result = assessPublicModelProviderReadiness([route], {
      credentialProviders: new Set(['kling']),
      adapterProviders: new Set(['kling']),
      now: NOW,
    });

    assert.equal(
      result.status,
      'unknown',
      `Expected status to be 'unknown' for ${label}, got '${result.status}'`
    );
    assert.equal(
      result.errorCode,
      'PROVIDER_HEALTH_STALE',
      `Expected errorCode 'PROVIDER_HEALTH_STALE' for ${label}, got '${result.errorCode}'`
    );
    assert.equal(result.staleHealthModels, 1, `Expected 1 staleHealthModel for ${label}`);
    assert.equal(result.coveredModels, 0, `Expected 0 coveredModels for ${label}`);
  }
});

test('[Adversarial M2] Cold-start: probeRequiredProviders actively probes and recovers stale (16m, 30d, null) routes', async () => {
  const routes = [
    createMockRoute({
      model_id: 'image-core',
      model_category: 'image',
      provider_id: 'kling',
      mapping_id: 'map-kling',
      last_health_check_at: new Date(NOW - 30 * 24 * 60 * 60_000).toISOString(), // 30 days stale
    }),
    createMockRoute({
      model_id: 'video-core',
      model_category: 'video',
      provider_id: 'minimax',
      mapping_id: 'map-minimax',
      last_health_check_at: null, // Cold start null
    }),
  ];

  const dbUpdates = [];
  const probed = [];

  const result = await probeRequiredProviders({
    listRoutes: async () => routes,
    resolveApiKey: async ({ provider }) => `key-${provider}`,
    getAdapter: async (provider) => ({
      healthCheck: async () => {
        probed.push(provider);
        return { healthy: true, latencyMs: 30 };
      },
    }),
    hasAdapter: () => true,
    updateHealth: async (provider, status) => {
      dbUpdates.push({ provider, ...status });
    },
    now: NOW,
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.coveredModels, 2);
  assert.equal(result.unavailableModels, 0);
  assert.equal(result.staleHealthModels, 0);
  assert.deepEqual(probed.sort(), ['kling', 'minimax']);
  assert.equal(dbUpdates.length, 2);
  assert.ok(dbUpdates.every((u) => u.healthStatus === 'healthy'));
});

test('[Adversarial M2] Cold-start: probeRequiredProviders gracefully survives DB write failures during health update', async () => {
  const routes = [
    createMockRoute({
      model_id: 'image-core',
      model_category: 'image',
      provider_id: 'kling',
      last_health_check_at: null,
    }),
    createMockRoute({
      model_id: 'video-core',
      model_category: 'video',
      provider_id: 'minimax',
      last_health_check_at: new Date(NOW - 30 * 24 * 60 * 60_000).toISOString(),
    }),
  ];

  // DB update throws an error (e.g. read-only replica or connection loss)
  const result = await probeRequiredProviders({
    listRoutes: async () => routes,
    resolveApiKey: async () => 'key',
    getAdapter: async () => ({ healthCheck: async () => ({ healthy: true }) }),
    hasAdapter: () => true,
    updateHealth: async () => {
      throw new Error('DATABASE_CONNECTION_LOST');
    },
    now: NOW,
  });

  // In-memory readiness should still succeed even if DB update failed
  assert.equal(result.status, 'healthy');
  assert.equal(result.coveredModels, 2);
});

test('[Adversarial M2] Cold-start: partial probe failure retains unknown for unrecovered model', async () => {
  const routes = [
    createMockRoute({
      model_id: 'image-core',
      model_category: 'image',
      provider_id: 'kling',
      last_health_check_at: new Date(NOW - 30 * 24 * 60 * 60_000).toISOString(),
    }),
    createMockRoute({
      model_id: 'video-core',
      model_category: 'video',
      provider_id: 'minimax',
      last_health_check_at: null,
    }),
  ];

  const result = await probeRequiredProviders({
    listRoutes: async () => routes,
    resolveApiKey: async () => 'key',
    getAdapter: async (provider) => ({
      healthCheck: async () => {
        if (provider === 'kling') return { healthy: true };
        throw new Error('Connection refused by minimax');
      },
    }),
    hasAdapter: () => true,
    updateHealth: async () => {},
    now: NOW,
  });

  // Kling is healthy, but Minimax failed and has null timestamp -> unknown
  assert.equal(result.status, 'unknown');
  assert.equal(result.errorCode, 'PROVIDER_HEALTH_STALE');
  assert.equal(result.coveredModels, 1);
  assert.equal(result.staleHealthModels, 1);
});

// -----------------------------------------------------------------------------
// SUITE 2: UPSTREAM TIMEOUT AND AbortSignal.timeout SAFETY
// -----------------------------------------------------------------------------

test('[Adversarial M2] Timeout safety: MuAPI fetch respects AbortSignal.timeout(1800)', async () => {
  const routes = [
    createMockRoute({
      model_id: 'image-core',
      model_category: 'image',
      provider_id: 'muapi',
      last_health_check_at: null,
    }),
    createMockRoute({
      model_id: 'video-core',
      model_category: 'video',
      provider_id: 'kling',
      last_health_check_at: new Date(NOW - 60_000).toISOString(),
    }),
  ];

  let observedSignal = null;
  const startedAt = Date.now();

  const result = await probeRequiredProviders({
    listRoutes: async () => routes,
    resolveApiKey: async ({ provider }) => `key-${provider}`,
    getAdapter: async () => ({ healthCheck: async () => ({ healthy: true }) }),
    hasAdapter: () => true,
    fetchFn: async (url, options) => {
      observedSignal = options?.signal;
      // Simulate slow upstream (2500ms delay)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ ok: true, json: async () => ({ balance: 100 }) }), 2500);
        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('The operation was aborted due to timeout'));
          });
        }
      });
    },
    updateHealth: async () => {},
    now: NOW,
  });

  const durationMs = Date.now() - startedAt;

  // Verify that signal was an AbortSignal and aborted
  assert.ok(observedSignal, 'AbortSignal should be passed to fetchFn');
  assert.ok(observedSignal.aborted, 'AbortSignal should have aborted');
  assert.ok(durationMs < 2300, `Probe should abort around 1800ms, completed in ${durationMs}ms`);

  // MuAPI should be marked unknown due to timeout
  const muapiStatus = result.providers.find((p) => p.providerId === 'muapi');
  assert.ok(muapiStatus, 'MuAPI should be in providers list');
  assert.equal(muapiStatus.status, 'unknown');
  assert.equal(result.status, 'unknown');
});

test('[Adversarial M2] Timeout safety: Slow adapter healthCheck (2500ms) is bounded by 1800ms race', async () => {
  const routes = [
    createMockRoute({
      model_id: 'image-core',
      model_category: 'image',
      provider_id: 'slow-provider',
      last_health_check_at: null,
    }),
    createMockRoute({
      model_id: 'video-core',
      model_category: 'video',
      provider_id: 'fast-provider',
      last_health_check_at: new Date(NOW - 60_000).toISOString(),
    }),
  ];

  const startedAt = Date.now();

  const result = await probeRequiredProviders({
    listRoutes: async () => routes,
    resolveApiKey: async () => 'key',
    getAdapter: async (provider) => ({
      healthCheck: async () => {
        if (provider === 'slow-provider') {
          // Takes 2500ms
          await new Promise((resolve) => setTimeout(resolve, 2500));
          return { healthy: true };
        }
        return { healthy: true };
      },
    }),
    hasAdapter: () => true,
    updateHealth: async () => {},
    now: NOW,
  });

  const durationMs = Date.now() - startedAt;

  // The race should timeout around 1800ms, well below 2500ms
  assert.ok(durationMs < 2300, `Slow adapter probe took ${durationMs}ms, should be bounded around 1800ms`);

  // slow-provider timed out and had null timestamp -> unknown
  const slowStatus = result.providers.find((p) => p.providerId === 'slow-provider');
  assert.equal(slowStatus?.status, 'unknown');
  assert.equal(result.status, 'unknown');
});

test('[Adversarial M2] Timeout safety: Late promise rejection does not trigger unhandled rejection', async () => {
  const routes = [
    createMockRoute({
      model_id: 'image-core',
      model_category: 'image',
      provider_id: 'late-failing-provider',
      last_health_check_at: new Date(NOW - 60_000).toISOString(),
    }),
  ];

  let unhandledRejectionCaught = false;
  const onUnhandled = () => { unhandledRejectionCaught = true; };
  process.on('unhandledRejection', onUnhandled);

  try {
    await probeRequiredProviders({
      listRoutes: async () => routes,
      resolveApiKey: async () => 'key',
      getAdapter: async () => ({
        healthCheck: async () => {
          // Reject after 1900ms (after the 1800ms timeout race has settled)
          await new Promise((resolve) => setTimeout(resolve, 1900));
          throw new Error('Late network connection failure');
        },
      }),
      hasAdapter: () => true,
      updateHealth: async () => {},
      now: NOW,
    });

    // Wait a brief window to let late rejection fire
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(unhandledRejectionCaught, false, 'Late rejection should not crash process');
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('[Adversarial M2] Timeout safety: createCachedDependencyProbe handles infinite hang', async () => {
  const hangingProbe = createCachedDependencyProbe({
    probe: () => new Promise(() => {}), // Never settles
    timeoutMs: 50,
    cacheMs: 1000,
  });

  const startedAt = Date.now();
  const outcome = await hangingProbe();
  const durationMs = Date.now() - startedAt;

  assert.ok(durationMs < 200, `Hanging probe should timeout quickly, took ${durationMs}ms`);
  assert.equal(outcome.status, 'unknown');
  assert.equal(outcome.errorCode, 'DEPENDENCY_PROBE_TIMEOUT');
});

// -----------------------------------------------------------------------------
// SUITE 3: CIRCUIT BREAKER TRIPPING & ROUTE DEGRADATION
// -----------------------------------------------------------------------------

test('[Adversarial M2] Circuit breaker: assessPublicModelProviderReadiness marks tripped route as unhealthy even if active probe reports healthy', () => {
  const route = createMockRoute({
    circuit_state: 'circuit_open', // Tripped circuit breaker
    health_status: 'healthy',
  });

  // Even if active probe reported healthy override:
  const result = assessPublicModelProviderReadiness([route], {
    credentialProviders: new Set(['kling']),
    adapterProviders: new Set(['kling']),
    providerStatusOverrides: new Map([['kling', 'healthy']]),
    now: NOW,
  });

  // Circuit breaker MUST take precedence over healthy status
  assert.equal(result.status, 'unhealthy');
  assert.equal(result.coveredModels, 0);
  assert.equal(result.unavailableModels, 1);
  const klingStatus = result.providers.find((p) => p.providerId === 'kling');
  assert.equal(klingStatus?.status, 'unhealthy');
});

test('[Adversarial M2] Circuit breaker: multi-route failover preserves model health when primary circuit trips', () => {
  const routes = [
    createMockRoute({
      model_id: 'shared-image-model',
      model_category: 'image',
      mapping_id: 'map-primary',
      provider_id: 'provider-a',
      circuit_state: 'circuit_open', // Primary tripped
      health_status: 'healthy',
    }),
    createMockRoute({
      model_id: 'shared-image-model',
      model_category: 'image',
      mapping_id: 'map-secondary',
      provider_id: 'provider-b',
      circuit_state: 'closed', // Secondary healthy
      health_status: 'healthy',
    }),
    createMockRoute({
      model_id: 'video-model',
      model_category: 'video',
      mapping_id: 'map-video',
      provider_id: 'provider-b',
      circuit_state: 'closed',
      health_status: 'healthy',
    }),
  ];

  const result = assessPublicModelProviderReadiness(routes, {
    credentialProviders: new Set(['provider-a', 'provider-b']),
    adapterProviders: new Set(['provider-a', 'provider-b']),
    now: NOW,
  });

  // Both image and video models are covered, with shared-image-model covered by provider-b
  assert.equal(result.status, 'healthy');
  assert.equal(result.coveredModels, 2);
  assert.equal(result.unavailableModels, 0);

  // But provider-a is reported unhealthy while provider-b is healthy
  const provA = result.providers.find((p) => p.providerId === 'provider-a');
  const provB = result.providers.find((p) => p.providerId === 'provider-b');
  assert.equal(provA?.status, 'unhealthy');
  assert.equal(provB?.status, 'healthy');
});

test('[Adversarial M2] Circuit breaker: all routes tripped degrades model and readiness to unhealthy', () => {
  const routes = [
    createMockRoute({
      model_id: 'shared-image-model',
      model_category: 'image',
      mapping_id: 'map-primary',
      provider_id: 'provider-a',
      circuit_state: 'circuit_open',
    }),
    createMockRoute({
      model_id: 'shared-image-model',
      model_category: 'image',
      mapping_id: 'map-secondary',
      provider_id: 'provider-b',
      circuit_state: 'open',
    }),
  ];

  const result = assessPublicModelProviderReadiness(routes, {
    credentialProviders: new Set(['provider-a', 'provider-b']),
    adapterProviders: new Set(['provider-a', 'provider-b']),
    now: NOW,
  });

  assert.equal(result.status, 'unhealthy');
  assert.equal(result.coveredModels, 0);
  assert.equal(result.unavailableModels, 1);
  assert.equal(result.errorCode, 'PROVIDER_ROUTE_UNAVAILABLE');
});

function createRouterMapping({
  providerId,
  cost = 0.1,
  circuitState = 'closed',
  health = 'healthy',
  endpoint = '/v1/generate',
} = {}) {
  return {
    model_id: 'canonical-image-v1',
    provider_id: providerId,
    provider_model_id: `${providerId}-image-v1`,
    provider_model_version: 'v1',
    provider_endpoint: endpoint,
    mapping_version: 1,
    enabled: true,
    provider_enabled: true,
    adapter_available: true,
    credentials_configured: true,
    review_status: 'approved',
    supported_task_types: ['t2i'],
    supported_resolutions: ['1024x1024'],
    capabilities: { input_types: ['text'], output_types: ['image'] },
    health_status: health,
    last_health_check_at: new Date(NOW - 60_000).toISOString(),
    circuit_state: circuitState,
    success_rate: 0.9,
    average_latency_ms: 300,
    priority: 10,
    active_price_version: {
      id: `price-${providerId}`,
      price_type: 'account_actual',
      status: 'active',
      source_observed_at: new Date(NOW - 60_000).toISOString(),
      expires_at: new Date(NOW + 60_000).toISOString(),
      billing_unit: 'per_request',
      currency: 'USD',
      price_config: { base_cost: cost, currency: 'USD' },
    },
  };
}

test('[Adversarial M2] Circuit breaker: evaluateRouteCandidates rejects open circuits with CIRCUIT_OPEN and fails over', () => {
  const mappings = [
    createRouterMapping({
      providerId: 'primary-cheap',
      cost: 0.10,
      circuitState: 'circuit_open', // TRIPPED
    }),
    createRouterMapping({
      providerId: 'backup-reliable',
      cost: 0.25,
      circuitState: 'closed', // HEALTHY
    }),
  ];

  const fxSnapshot = { id: 'fx-test', usdToCny: 7.2, rates: { USD_CNY: 7.2, CNY_CNY: 1 }, observedAt: new Date(NOW).toISOString() };
  const evaluation = evaluateRouteCandidates(mappings, { task_type: 't2i', resolution: '1024x1024', num_images: 1 }, {
    modelId: 'canonical-image-v1',
    now: NOW,
    fxSnapshot,
  });

  // primary-cheap must be rejected with CIRCUIT_OPEN
  assert.equal(evaluation.candidates.length, 1);
  assert.equal(evaluation.rejected.length, 1);
  assert.equal(evaluation.rejected[0].providerId, 'primary-cheap');
  assert.equal(evaluation.rejected[0].reason, 'CIRCUIT_OPEN');

  // backup-reliable is the only viable candidate
  assert.equal(evaluation.candidates[0].providerId, 'backup-reliable');

  // Router must select the backup candidate
  const winner = selectRouteCandidate(evaluation, {
    routingMode: ROUTING_MODES.COST,
  });
  assert.ok(winner);
  assert.equal(winner.providerId, 'backup-reliable');
});

test('[Adversarial M2] Circuit breaker: all candidates tripped leaves candidate pool empty', () => {
  const mappings = [
    createRouterMapping({
      providerId: 'prov-1',
      circuitState: 'open',
    }),
    createRouterMapping({
      providerId: 'prov-2',
      circuitState: 'circuit_open',
    }),
  ];

  const fxSnapshot = { id: 'fx-test', usdToCny: 7.2, rates: { USD_CNY: 7.2, CNY_CNY: 1 }, observedAt: new Date(NOW).toISOString() };
  const evaluation = evaluateRouteCandidates(mappings, { task_type: 't2i', resolution: '1024x1024', num_images: 1 }, {
    modelId: 'canonical-image-v1',
    now: NOW,
    fxSnapshot,
  });

  assert.equal(evaluation.candidates.length, 0);
  assert.equal(evaluation.rejected.length, 2);
  assert.ok(evaluation.rejected.every((r) => r.reason === 'CIRCUIT_OPEN'));

  const winner = selectRouteCandidate(evaluation, { routingMode: ROUTING_MODES.COST });
  assert.equal(winner, null);
});

// -----------------------------------------------------------------------------
// SUITE 4: EXTREME BOUNDARY & CORRUPTION EDGE CASES
// -----------------------------------------------------------------------------

test('[Adversarial M2] Boundary: empty or null route set safely yields NO_PUBLIC_MODELS degraded', () => {
  const nullResult = assessPublicModelProviderReadiness(null, { now: NOW });
  assert.equal(nullResult.status, 'degraded');
  assert.equal(nullResult.errorCode, 'NO_PUBLIC_MODELS');
  assert.equal(nullResult.activeModels, 0);

  const emptyResult = assessPublicModelProviderReadiness([], { now: NOW });
  assert.equal(emptyResult.status, 'degraded');
  assert.equal(emptyResult.errorCode, 'NO_PUBLIC_MODELS');
});

test('[Adversarial M2] Boundary: corrupted health_status values fail-closed to unhealthy', () => {
  const corruptedRoute = createMockRoute({
    health_status: 'CORRUPTED_GARBAGE_VALUE',
  });
  const result = assessPublicModelProviderReadiness([corruptedRoute], {
    credentialProviders: new Set(['kling']),
    adapterProviders: new Set(['kling']),
    now: NOW,
  });
  assert.equal(result.status, 'unhealthy');
  assert.equal(result.coveredModels, 0);
  assert.equal(result.unavailableModels, 1);
});

test('[Adversarial M2] Boundary: getAdapter rejection or malformed outcome does not crash probing', async () => {
  const routes = [
    createMockRoute({
      model_id: 'img-1',
      provider_id: 'bad-adapter-prov',
      last_health_check_at: new Date(NOW - 60_000).toISOString(),
    }),
    createMockRoute({
      model_id: 'img-2',
      provider_id: 'malformed-outcome-prov',
      last_health_check_at: new Date(NOW - 60_000).toISOString(),
    }),
  ];

  const result = await probeRequiredProviders({
    listRoutes: async () => routes,
    resolveApiKey: async () => 'key',
    getAdapter: async (providerId) => {
      if (providerId === 'bad-adapter-prov') {
        throw new Error('Adapter constructor threw segmentation fault simulation');
      }
      return {
        healthCheck: async () => ({ healthy: null, garbage: true }),
      };
    },
    hasAdapter: () => true,
    updateHealth: async () => {},
    now: NOW,
  });

  // Neither provider should be marked healthy by probe override
  // They fall back to their timestamp and health_status in mock route
  assert.ok(result);
  assert.equal(result.activeModels, 2);
});

