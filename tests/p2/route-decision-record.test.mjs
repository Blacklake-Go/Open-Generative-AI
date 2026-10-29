import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildRouteDecisionMetadata,
  summarizeEligibleCandidates,
  summarizeExclusions,
  summarizeSelectedRoute,
  ROUTE_DECISION_RECORD_VERSION,
} from '../../lib/modelCenter/routeDecisionRecord.js';
import { scoreRouteCandidates } from '../../lib/modelCenter/routePricing.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

function candidate(overrides = {}) {
  return {
    providerId: 'prov-a',
    providerModelId: 'pm-a',
    providerModel: {
      id: 'map-a',
      mapping_version: 3,
      provider_endpoint: 'https://provider.example/generate',
      provider_model_version: 'model-v2',
      concurrency_limit: 10,
      active_attempt_count: 0,
    },
    priceVersionId: 'pv-a',
    priceType: 'official_public',
    estimatedCost: 0.5,
    estimatedCostCurrency: 'CNY',
    estimatedCostCny: 0.5,
    estimatedCostUsd: 0.07,
    estimatedCostSource: 'official_public_price',
    fxSnapshot: { usdToCny: 7.2, toCny: 7.2 },
    priority: 100,
    successRate: 0.95,
    latencyMs: 500,
    healthStatus: 'healthy',
    healthEvidence: {
      healthStatus: 'healthy',
      probeKind: 'http',
      evidenceLevel: 'http_probe',
      checkedAt: '2026-10-29T08:59:00.000Z',
      ageMs: 60_000,
      maxAgeMs: 900_000,
      source: 'ai_studio.ai_providers.health_status',
      probeSource: 'ops_bill.provider_health_checks',
      scope: 'provider',
    },
    ...overrides,
  };
}

function evaluation(overrides = {}) {
  return {
    candidates: [candidate()],
    rejected: [
      { providerId: 'prov-b', providerModelId: 'pm-b', reason: 'HEALTH_CHECK_STALE' },
      { providerId: 'prov-c', providerModelId: 'pm-c', reason: 'HEALTH_CHECK_STALE' },
      { providerId: 'prov-d', providerModelId: 'pm-d', reason: 'CIRCUIT_OPEN' },
    ],
    ...overrides,
  };
}

function build(overrides = {}) {
  const evaluated = overrides.evaluation || evaluation();
  const decision = scoreRouteCandidates(evaluated, { routingMode: 'cost' });
  return buildRouteDecisionMetadata({
    decision,
    winner: decision.selected,
    evaluation: evaluated,
    decisionId: 'rdl_test',
    quoteId: 'quote_1',
    costCeiling: { maxCostCny: 5, maxCostUsd: null, quoteId: 'quote_1', source: 'generation_quote_failover_ceiling' },
    budgetUsd: null,
    budgetCny: 5,
    ...overrides,
  });
}

test('selected route record carries provider, endpoint, mapping and price versions, cost and fx', () => {
  const metadata = build();

  assert.equal(metadata.recordVersion, ROUTE_DECISION_RECORD_VERSION);
  assert.equal(metadata.decisionId, 'rdl_test');
  assert.equal(metadata.quoteId, 'quote_1');
  assert.ok(metadata.policyVersion, '策略版本必须记录');
  assert.equal(metadata.routingMode, 'cost');
  assert.equal(metadata.strategy, 'cost_ascending');

  assert.deepEqual(metadata.selectedRoute, {
    providerId: 'prov-a',
    providerModelId: 'pm-a',
    providerEndpoint: 'https://provider.example/generate',
    providerModelVersion: 'model-v2',
    mappingId: 'map-a',
    mappingVersion: 3,
    priceVersionId: 'pv-a',
    priceType: 'official_public',
    estimatedCostCny: 0.5,
    estimatedCostUsd: 0.07,
    estimatedCostCurrency: 'CNY',
    estimatedCostSource: 'official_public_price',
    fxSnapshot: { usdToCny: 7.2, toCny: 7.2 },
  });
});

test('eligible candidates keep mapping, price and health evidence alongside scores', () => {
  const metadata = build();
  assert.equal(metadata.eligibleRoutes.length, 1);
  const route = metadata.eligibleRoutes[0];
  assert.equal(route.mappingId, 'map-a');
  assert.equal(route.mappingVersion, 3);
  assert.equal(route.providerEndpoint, 'https://provider.example/generate');
  assert.equal(route.priceVersionId, 'pv-a');
  assert.equal(route.priceType, 'official_public');
  assert.equal(route.healthEvidenceLevel, 'http_probe');
  assert.equal(route.healthCheckedAt, '2026-10-29T08:59:00.000Z');
  assert.equal(route.totalScore, metadata.candidates[0].totalScore);

  assert.deepEqual(metadata.exclusions, {
    total: 3,
    byReason: { HEALTH_CHECK_STALE: 2, CIRCUIT_OPEN: 1 },
  });
});

test('budget keeps unknown bounds unknown instead of zero and records the cross-model ceiling', () => {
  const metadata = build();

  assert.equal(metadata.budget.maxFailoverCostUsd, null, '未知 USD 上限必须是 null，不能写成 0');
  assert.equal(metadata.budget.maxFailoverCostCny, 5);
  assert.deepEqual(metadata.budget.crossModelCostCeiling, {
    maxCostCny: 5,
    maxCostUsd: null,
    quoteId: 'quote_1',
    source: 'generation_quote_failover_ceiling',
  });

  const noCeiling = build({ costCeiling: null });
  assert.equal(noCeiling.budget.crossModelCostCeiling, null);
});

test('preview decisions without persistence do not pretend to have a decision id', () => {
  const metadata = build({ decisionId: null });
  assert.equal(metadata.decisionId, null);
});

test('empty evaluation degrades safely', () => {
  assert.equal(summarizeSelectedRoute(null), null);
  assert.deepEqual(summarizeEligibleCandidates(), []);
  assert.deepEqual(summarizeExclusions(), { total: 0, byReason: {} });

  const metadata = build({ evaluation: { candidates: [], rejected: [] } });
  assert.equal(metadata.selectedRoute, null);
  assert.deepEqual(metadata.eligibleRoutes, []);
});

test('selection records never carry provider credentials', () => {
  const metadata = build();
  const serialized = JSON.stringify(metadata).toLowerCase();
  for (const forbidden of ['api_key', 'apikey', 'authorization', 'bearer ', 'cookie', 'secret']) {
    assert.ok(!serialized.includes(forbidden), `选择记录不得包含 ${forbidden}`);
  }
});

test('attempts link to the decision so receipt, retry and terminal state are traceable', () => {
  const attempts = fs.readFileSync(path.join(REPO_ROOT, 'lib/repositories/attempts.js'), 'utf8');
  assert.match(attempts, /routeDecisionId = null/);
  assert.match(attempts, /route_decision_id, metadata_json/);
  assert.match(attempts, /\$17, \$18::jsonb/);

  const migration = fs.readFileSync(
    path.join(REPO_ROOT, 'lib/db/migrations/087_attempt_route_decision_link.sql'),
    'utf8',
  );
  assert.match(migration, /ADD COLUMN IF NOT EXISTS route_decision_id VARCHAR\(64\)/);
  assert.match(migration, /attempts_route_decision_idx/);

  const core = fs.readFileSync(path.join(REPO_ROOT, 'lib/services/generationCore.js'), 'utf8');
  assert.match(core, /routeDecisionId: routeDecision\.decisionId \|\| null/);
  assert.match(core, /metadata: pendingFailoverMetadata \? \{ failover: pendingFailoverMetadata \} : \{\}/);
  assert.match(core, /pendingFailoverMetadata = \{/);

  const router = fs.readFileSync(path.join(REPO_ROOT, 'lib/services/smartRouter.js'), 'utf8');
  assert.match(router, /buildRouteDecisionMetadata\(/);
  assert.match(router, /decisionId,\s*\n\s*selectedRoute,/);
  assert.match(router, /JSON\.stringify\(selectionMetadata\.eligibleRoutes\)/);
});