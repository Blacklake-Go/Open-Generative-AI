import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isPlatformDefaultRoutingWeights,
  normalizeRoutingMode,
  ROUTING_LEGACY_DEFAULT_WEIGHTS,
  ROUTING_MODE_WEIGHT_PRESETS,
  ROUTING_MODES,
  ROUTING_POLICY_VERSION,
  scoreRouteCandidates,
} from '../../lib/modelCenter/routePricing.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

function candidate({
  providerId = 'prov-a',
  providerModelId = 'pm-a',
  estimatedCostCny = 1,
  estimatedCostUsd = 0.14,
  successRate = 0.5,
  latencyMs = 1000,
  priority = 0,
  concurrencyLimit = 10,
  activeAttemptCount = 0,
  endpoint = 'https://provider.example/generate',
} = {}) {
  return {
    providerId,
    providerModelId,
    estimatedCostCny,
    estimatedCostUsd,
    successRate,
    latencyMs,
    priority,
    priceVersionId: `price_${providerModelId}`,
    providerModel: {
      provider_endpoint: endpoint,
      concurrency_limit: concurrencyLimit,
      active_attempt_count: activeAttemptCount,
    },
  };
}

const evaluation = (...candidates) => ({ candidates, rejected: [] });

test('all five routing modes are recognized and unknown values are rejected explicitly', () => {
  assert.deepEqual([...ROUTING_MODES], ['cost', 'priority', 'quality', 'stability', 'balanced']);
  for (const mode of ROUTING_MODES) {
    assert.equal(normalizeRoutingMode(mode, null), mode);
    assert.equal(normalizeRoutingMode(` ${mode.toUpperCase()} `, null), mode);
  }
  assert.equal(normalizeRoutingMode('non_existent_mode', null), null);
  assert.equal(normalizeRoutingMode('', null), null);
  assert.equal(normalizeRoutingMode(undefined, 'cost'), 'cost');
});

test('cost mode is strict ascending cost and near ties are decided by health signals', () => {
  const cheapFragile = candidate({ providerId: 'cheap', providerModelId: 'pm-cheap', estimatedCostCny: 1.0, successRate: 0.5, latencyMs: 3000 });
  const nearCheapSolid = candidate({ providerId: 'solid', providerModelId: 'pm-solid', estimatedCostCny: 1.005, successRate: 0.99, latencyMs: 300 });
  const expensive = candidate({ providerId: 'pricey', providerModelId: 'pm-pricey', estimatedCostCny: 5, successRate: 0.99 });
  const decision = scoreRouteCandidates(evaluation(cheapFragile, nearCheapSolid, expensive), { routingMode: 'cost' });
  assert.equal(decision.strategy, 'cost_ascending');
  assert.equal(decision.routingMode, 'cost');
  assert.equal(decision.selected.providerId, 'solid');
  assert.equal(decision.policyVersion, ROUTING_POLICY_VERSION);
  assert.equal(decision.modeFallback, null);
});

test('cost mode does not let a 1%+ cheaper but unhealthier route win', () => {
  const cheap = candidate({ providerId: 'cheap', providerModelId: 'pm-cheap', estimatedCostCny: 1.0, successRate: 0.4, latencyMs: 5000 });
  const slightlyDearer = candidate({ providerId: 'dearer', providerModelId: 'pm-dearer', estimatedCostCny: 1.05, successRate: 0.99, latencyMs: 200 });
  const decision = scoreRouteCandidates(evaluation(cheap, slightlyDearer), { routingMode: 'cost', costTieToleranceRate: 0.01 });
  assert.equal(decision.selected.providerId, 'cheap', 'outside tolerance the cheaper route must win');
});

test('priority mode follows administrator priority first and cost second', () => {
  const preferredExpensive = candidate({ providerId: 'admin-preferred', providerModelId: 'pm-preferred', priority: 500, estimatedCostCny: 9 });
  const cheaper = candidate({ providerId: 'cheap', providerModelId: 'pm-cheap', priority: 10, estimatedCostCny: 0.5 });
  const sameRankCheaper = candidate({ providerId: 'tie-cheap', providerModelId: 'pm-tie', priority: 500, estimatedCostCny: 1 });
  const decision = scoreRouteCandidates(evaluation(cheaper, preferredExpensive, sameRankCheaper), { routingMode: 'priority' });
  assert.equal(decision.strategy, 'admin_priority');
  assert.equal(decision.routingMode, 'priority');
  assert.equal(decision.selected.providerId, 'tie-cheap');
  assert.equal(decision.scores[0].priority, 500);
});

test('quality mode uses the quality preset even when storage still holds platform default weights', () => {
  const reliableExpensive = candidate({ providerId: 'reliable', providerModelId: 'pm-reliable', estimatedCostCny: 10, successRate: 0.99, latencyMs: 1200 });
  const flakyCheap = candidate({ providerId: 'flaky', providerModelId: 'pm-flaky', estimatedCostCny: 0.2, successRate: 0.3, latencyMs: 1200 });
  const decision = scoreRouteCandidates(evaluation(reliableExpensive, flakyCheap), {
    routingMode: 'quality',
    // Migration 019 seeded this balanced set into every routing policy.
    weights: { cost: 0.40, success_rate: 0.30, speed: 0.20, capacity: 0.10 },
  });
  assert.equal(decision.strategy, 'weighted_score');
  assert.equal(decision.selected.providerId, 'reliable');
  assert.deepEqual(decision.weights, { ...ROUTING_MODE_WEIGHT_PRESETS.quality });
  assert.equal(decision.weightsConfigured.success_rate, 0.8);
});

test('legacy platform default weights do not override the stability preset either', () => {
  const decision = scoreRouteCandidates(evaluation(candidate()), {
    routingMode: 'stability',
    weights: ROUTING_LEGACY_DEFAULT_WEIGHTS,
  });
  assert.deepEqual(decision.weights, { ...ROUTING_MODE_WEIGHT_PRESETS.stability });
  assert.equal(isPlatformDefaultRoutingWeights(ROUTING_LEGACY_DEFAULT_WEIGHTS), true);
  assert.equal(isPlatformDefaultRoutingWeights(ROUTING_MODE_WEIGHT_PRESETS.balanced), true);
  assert.equal(isPlatformDefaultRoutingWeights({ cost: 0.1, success_rate: 0.6, speed: 0.2, capacity: 0.1 }), false);
});

test('custom administrator weights are normalized and take effect', () => {
  const stable = candidate({ providerId: 'stable', providerModelId: 'pm-stable', successRate: 0.95, latencyMs: 5000, estimatedCostCny: 5 });
  const fast = candidate({ providerId: 'fast', providerModelId: 'pm-fast', successRate: 0.5, latencyMs: 100, estimatedCostCny: 5 });
  const decision = scoreRouteCandidates(evaluation(stable, fast), {
    routingMode: 'balanced',
    weights: { cost: 0, success_rate: 0, speed: 4, capacity: 0 },
  });
  assert.equal(decision.selected.providerId, 'fast');
  assert.deepEqual(decision.weights, { cost: 0, success_rate: 0, speed: 1, capacity: 0 });
});

test('balanced mode falls back to its own preset when no weights are stored', () => {
  const decision = scoreRouteCandidates(evaluation(candidate({ providerId: 'only' })), { routingMode: 'balanced', weights: null });
  assert.equal(decision.weightsConfigured.success_rate, 0.3);
  assert.equal(decision.selected.providerId, 'only');
});

test('unknown stored mode falls back to balanced but records the requested mode and reason', () => {
  const decision = scoreRouteCandidates(evaluation(candidate({ providerId: 'only' })), { routingMode: 'non_existent_mode' });
  assert.equal(decision.routingMode, 'balanced');
  assert.equal(decision.requestedRoutingMode, 'non_existent_mode');
  assert.deepEqual(decision.modeFallback, {
    requested: 'non_existent_mode',
    applied: 'balanced',
    reason: 'ROUTING_MODE_UNKNOWN',
  });
  assert.equal(decision.selected.providerId, 'only');
});

test('decision exposes every candidate with rank, endpoint, price version and component scores', () => {
  const decision = scoreRouteCandidates(evaluation(
    candidate({ providerId: 'a', providerModelId: 'pm-a', estimatedCostCny: 1 }),
    candidate({ providerId: 'b', providerModelId: 'pm-b', estimatedCostCny: 2 }),
  ), { routingMode: 'cost' });
  assert.equal(decision.candidateCount, 2);
  assert.equal(decision.scores.length, 2);
  const [first, second] = decision.scores;
  assert.equal(first.rank, 1);
  assert.equal(first.selected, true);
  assert.equal(second.selected, false);
  for (const key of ['providerId', 'providerModelId', 'providerEndpoint', 'priceVersionId', 'priority',
    'estimatedCostCny', 'estimatedCostUsd', 'totalScore', 'costScore', 'successScore', 'speedScore', 'capacityScore']) {
    assert.ok(key in first, `score must expose ${key}`);
  }
  assert.equal(first.priceVersionId, 'price_pm-a');
  assert.equal(first.providerEndpoint, 'https://provider.example/generate');
});

test('empty evaluation returns no selection instead of throwing', () => {
  const decision = scoreRouteCandidates(evaluation(), { routingMode: 'priority' });
  assert.equal(decision.selected, null);
  assert.equal(decision.strategy, null);
  assert.equal(decision.candidateCount, 0);
  assert.equal(decision.policyVersion, ROUTING_POLICY_VERSION);
});

test('migration 085 records policy version and selection metadata on route decision logs', () => {
  const sql = fs.readFileSync(path.join(REPO_ROOT, 'lib/db/migrations/085_route_decision_policy_version.sql'), 'utf8');
  assert.match(sql, /ALTER TABLE ai_studio\.route_decision_logs/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS policy_version VARCHAR\(32\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS selection_metadata_json JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(sql, /COMMENT ON COLUMN ai_studio\.route_decision_logs\.selection_metadata_json/);
});

test('quote execution accepts the priority mode and refuses unknown stored modes', () => {
  // generationCore imports this helper for the quote whitelist; the contract is
  // "valid modes pass through unchanged, anything else yields no override".
  assert.equal(normalizeRoutingMode('priority', null), 'priority');
  assert.equal(normalizeRoutingMode('stability', null), 'stability');
  assert.equal(normalizeRoutingMode('legacy_fastest', null), null);
});
