import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_MODEL_HEALTH_MAX_AGE_MS,
  evaluateRouteCandidates,
  evaluateRouteHealth,
  scoreRouteCandidates,
} from '../../lib/modelCenter/routePricing.js';
import {
  normalizeProbeOutcome,
  probeFailureOutcome,
  PROBE_KIND,
  summarizeProbeResults,
} from '../../lib/services/probeContract.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = Date.UTC(2026, 9, 29, 9, 0, 0);

function at(offsetMs) {
  return new Date(NOW + offsetMs).toISOString();
}

/*
 * 基座线路故意使用“健康、凭据已配置、余额未知(null)”：
 * 未知余额必须保持未知并通过准入，不能被数据库默认 0 当成可用或不足。
 */
function activePrice(overrides = {}) {
  return {
    id: 'pv-a',
    price_type: 'official_public',
    status: 'active',
    billing_unit: 'per_request',
    currency: 'CNY',
    price_config: { unit_amount: 0.5 },
    source_observed_at: at(-60_000),
    effective_at: at(-86_400_000),
    ...overrides,
  };
}

function routeMapping(overrides = {}) {
  return {
    provider_id: 'prov-a',
    provider_model_id: 'pm-a',
    model_id: 'model-x',
    provider_endpoint: 'https://provider.example/generate',
    enabled: true,
    provider_enabled: true,
    adapter_available: true,
    credentials_configured: true,
    review_status: 'approved',
    supported_task_types: ['t2i'],
    capabilities: { input_types: ['text'], output_types: ['image'] },
    circuit_state: 'closed',
    health_status: 'healthy',
    last_health_check_at: at(-60_000),
    last_probe_kind: 'http',
    concurrency_limit: 10,
    active_attempt_count: 0,
    provider_balance: null,
    active_price_version: activePrice(),
    ...overrides,
  };
}

function evaluate(mapping, options = {}) {
  return evaluateRouteCandidates([mapping], { task_type: 't2i' }, {
    modelId: 'model-x',
    now: NOW,
    ...options,
  });
}

test('health evidence carries source, scope and freshness', () => {
  const decision = evaluateRouteHealth({
    healthStatus: 'healthy',
    lastHealthCheckAt: at(-60_000),
    probeKind: 'http',
    now: NOW,
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, null);
  assert.equal(decision.evidenceLevel, 'http_probe');
  assert.equal(decision.source, 'ai_studio.ai_providers.health_status');
  assert.equal(decision.probeSource, 'ops_bill.provider_health_checks');
  assert.equal(decision.scope, 'provider');
  assert.equal(decision.checkedAt, at(-60_000));
  assert.equal(decision.ageMs, 60_000);
  assert.equal(decision.maxAgeMs, DEFAULT_MODEL_HEALTH_MAX_AGE_MS);
});

test('credential-only and legacy probes never claim verified connectivity', () => {
  const credential = evaluateRouteHealth({
    healthStatus: 'degraded',
    lastHealthCheckAt: at(-30_000),
    probeKind: PROBE_KIND.CREDENTIAL,
    now: NOW,
  });
  assert.equal(credential.eligible, true, 'degraded is a pending state, not a hard failure');
  assert.equal(credential.evidenceLevel, 'credential_only');
  assert.equal(credential.probeKind, 'credential');

  const legacy = evaluateRouteHealth({
    healthStatus: 'healthy',
    lastHealthCheckAt: at(-30_000),
    probeKind: null,
    now: NOW,
  });
  assert.equal(legacy.eligible, true);
  assert.equal(legacy.evidenceLevel, 'unknown');
  assert.equal(legacy.probeKind, null);
});

test('stale or failed health checks are rejected with age evidence', () => {
  const stale = evaluateRouteHealth({
    healthStatus: 'healthy',
    lastHealthCheckAt: at(-16 * 60_000),
    probeKind: 'http',
    now: NOW,
  });
  assert.equal(stale.eligible, false);
  assert.equal(stale.reason, 'HEALTH_CHECK_STALE');
  assert.equal(stale.ageMs, 16 * 60_000);

  const neverChecked = evaluateRouteHealth({ healthStatus: 'healthy', lastHealthCheckAt: null, now: NOW });
  assert.equal(neverChecked.reason, 'HEALTH_CHECK_STALE');
  assert.equal(neverChecked.checkedAt, null);
  assert.equal(neverChecked.ageMs, null);

  const failed = evaluateRouteHealth({
    healthStatus: 'unhealthy',
    lastHealthCheckAt: at(-60_000),
    probeKind: 'http',
    now: NOW,
  });
  assert.equal(failed.reason, 'HEALTH_CHECK_FAILED');
  assert.equal(failed.healthStatus, 'unhealthy');
});

test('admitted routes expose health evidence and keep unknown balance unknown', () => {
  const { candidates, rejected } = evaluate(routeMapping({ last_probe_kind: 'credential' }));
  assert.equal(rejected.length, 0);
  assert.equal(candidates.length, 1);

  const candidate = candidates[0];
  assert.equal(candidate.healthStatus, 'healthy');
  assert.deepEqual(candidate.healthEvidence, {
    healthStatus: 'healthy',
    probeKind: 'credential',
    evidenceLevel: 'credential_only',
    checkedAt: at(-60_000),
    ageMs: 60_000,
    maxAgeMs: DEFAULT_MODEL_HEALTH_MAX_AGE_MS,
    source: 'ai_studio.ai_providers.health_status',
    probeSource: 'ops_bill.provider_health_checks',
    scope: 'provider',
  });

  const decision = scoreRouteCandidates({ candidates, rejected }, { routingMode: 'cost' });
  assert.equal(decision.selected.healthEvidence.evidenceLevel, 'credential_only');
});

test('rejections explain stale health, circuit, capacity, quota and balance', () => {
  const cases = [
    {
      name: 'stale health',
      mapping: routeMapping({ last_health_check_at: at(-20 * 60_000) }),
      reason: 'HEALTH_CHECK_STALE',
      expect: (evidence) => {
        assert.equal(evidence.evidenceLevel, 'http_probe');
        assert.equal(evidence.ageMs, 20 * 60_000);
        assert.equal(evidence.maxAgeMs, DEFAULT_MODEL_HEALTH_MAX_AGE_MS);
        assert.equal(evidence.source, 'ai_studio.ai_providers.health_status');
      },
    },
    {
      name: 'unhealthy probe',
      mapping: routeMapping({ health_status: 'unhealthy' }),
      reason: 'HEALTH_CHECK_FAILED',
      expect: (evidence) => assert.equal(evidence.healthStatus, 'unhealthy'),
    },
    {
      name: 'open circuit',
      mapping: routeMapping({
        circuit_state: 'circuit_open',
        circuit_opened_at: at(-5 * 60_000),
        consecutive_failures: 7,
      }),
      reason: 'CIRCUIT_OPEN',
      expect: (evidence) => {
        assert.equal(evidence.circuitState, 'circuit_open');
        assert.equal(evidence.consecutiveFailures, 7);
        assert.equal(evidence.circuitOpenedAt, at(-5 * 60_000));
      },
    },
    {
      name: 'concurrency / rate limit',
      mapping: routeMapping({ concurrency_limit: 4, active_attempt_count: 4 }),
      reason: 'CAPACITY_EXHAUSTED',
      expect: (evidence) => {
        assert.equal(evidence.concurrencyLimit, 4);
        assert.equal(evidence.activeAttemptCount, 4);
      },
    },
    {
      name: 'stale quota observation',
      mapping: routeMapping({ available_quota: 100, quota_checked_at: null }),
      reason: 'QUOTA_CHECK_STALE',
      expect: (evidence) => {
        assert.equal(evidence.quota, 100);
        assert.equal(evidence.quotaCheckedAt, null);
        assert.equal(evidence.maxAgeMs, 15 * 60 * 1000);
      },
    },
    {
      name: 'exhausted quota',
      mapping: routeMapping({ available_quota: 0, quota_checked_at: at(-60_000) }),
      reason: 'QUOTA_EXHAUSTED',
      expect: (evidence) => assert.equal(evidence.quota, 0),
    },
    {
      name: 'negative provider balance',
      mapping: routeMapping({ provider_balance: -3, balance_checked_at: at(-60_000) }),
      reason: 'INSUFFICIENT_BALANCE',
      expect: (evidence) => assert.equal(evidence.providerBalance, -3),
    },
  ];

  for (const item of cases) {
    const { candidates, rejected } = evaluate(item.mapping);
    assert.equal(candidates.length, 0, `${item.name} must not become a candidate`);
    assert.equal(rejected.length, 1, `${item.name} must be rejected exactly once`);
    assert.equal(rejected[0].reason, item.reason);
    assert.equal(rejected[0].providerId, 'prov-a');
    assert.equal(rejected[0].providerModelId, 'pm-a');
    assert.ok(rejected[0].evidence, `${item.name} rejection must include evidence`);
    item.expect(rejected[0].evidence);
  }
});

test('configuration, approval and price rejections carry attributable evidence', () => {
  const notConfigured = evaluate(routeMapping({ credentials_configured: false }));
  assert.equal(notConfigured.rejected[0].reason, 'PROVIDER_NOT_CONFIGURED');
  assert.deepEqual(notConfigured.rejected[0].evidence, { credentialsConfigured: false, providerId: 'prov-a' });

  const notApproved = evaluate(routeMapping({ review_status: 'pending' }));
  assert.equal(notApproved.rejected[0].reason, 'MAPPING_NOT_APPROVED');
  assert.deepEqual(notApproved.rejected[0].evidence, { reviewStatus: 'pending' });

  const stalePrice = evaluate(
    routeMapping({ active_price_version: activePrice({ source_observed_at: at(-120_000) }) }),
    { maxPriceAgeMs: 60_000 },
  );
  assert.equal(stalePrice.rejected[0].reason, 'PRICE_STALE');
  assert.deepEqual(stalePrice.rejected[0].evidence, {
    priceVersionId: 'pv-a',
    priceType: 'official_public',
    priceObservedAt: at(-120_000),
    priceExpiresAt: null,
    billingUnit: 'per_request',
    conservativeUpperBoundUsable: false,
  });
});

test('probe contract keeps credential probes configuration-level', () => {
  const credential = normalizeProbeOutcome(
    { healthy: true, probeKind: 'credential', latencyMs: 42 },
    { elapsedMs: 42 },
  );
  assert.equal(credential.healthStatus, 'healthy');
  assert.equal(credential.probeKind, 'credential');
  assert.equal(credential.latencyMs, null, 'no network round trip, so no measured latency');

  const preflight = probeFailureOutcome({ code: 'PROVIDER_CREDENTIAL_MISSING', message: 'missing key' });
  assert.equal(preflight.probeKind, 'credential');
  assert.equal(preflight.healthStatus, 'degraded');
  assert.equal(preflight.latencyMs, null);

  const summary = summarizeProbeResults([credential, preflight]);
  assert.equal(summary.credentialOnly, 2);
  assert.equal(summary.unhealthy, 0);
});

test('admin health probing has a single graded implementation', () => {
  const routeSrc = fs.readFileSync(path.join(REPO_ROOT, 'app/api/admin/models/health/route.js'), 'utf8');
  assert.match(routeSrc, /probeProviderChannel[^}]*\}\s*from\s*'@\/lib\/services\/healthProbe'/s);
  assert.ok(
    !/import\s*\{[^}]*probeProviderChannel[^}]*\}\s*from\s*'@\/lib\/services\/circuitBreaker'/.test(routeSrc),
    'probeProviderChannel must not come from the breaker module',
  );

  const breakerSrc = fs.readFileSync(path.join(REPO_ROOT, 'lib/services/circuitBreaker.js'), 'utf8');
  assert.doesNotMatch(breakerSrc, /export\s+async\s+function\s+probeProviderChannel/);
  assert.match(breakerSrc, /lib\/services\/healthProbe\.js/, 'duplicate probe should be documented as moved');

  const catalogSrc = fs.readFileSync(path.join(REPO_ROOT, 'lib/repositories/aiCatalog.js'), 'utf8');
  assert.match(catalogSrc, /latest_probe\.probe_kind AS last_probe_kind/);
  assert.match(catalogSrc, /hc\.details_json->>'probeKind'/);

  const routerSrc = fs.readFileSync(path.join(REPO_ROOT, 'lib/services/smartRouter.js'), 'utf8');
  assert.match(routerSrc, /healthEvidence: winner\.healthEvidence \|\| null/);
  assert.match(routerSrc, /healthEvidenceLevel:/);
  assert.match(routerSrc, /未完成接口连通、鉴权或真实生成验证/);
});
