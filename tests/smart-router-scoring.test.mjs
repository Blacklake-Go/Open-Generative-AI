import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectRouteCandidate,
  ROUTING_MODE_WEIGHT_PRESETS,
} from '../lib/modelCenter/routePricing.js';

function createCandidate({
  providerId = 'prov-a',
  providerModelId = 'pm-a',
  estimatedCostCny = 1.0,
  estimatedCostUsd = 0.14,
  successRate = 0.95,
  latencyMs = 500,
  priority = 100,
  concurrencyLimit = 10,
  activeAttemptCount = 0,
} = {}) {
  return {
    providerId,
    providerModelId,
    estimatedCostCny,
    estimatedCostUsd,
    successRate,
    latencyMs,
    priority,
    providerModel: {
      concurrency_limit: concurrencyLimit,
      active_attempt_count: activeAttemptCount,
    },
  };
}

test('ROUTING_MODE_WEIGHT_PRESETS defines expected 4 modes with 4 dimensions', () => {
  const modes = ['cost', 'quality', 'stability', 'balanced'];
  for (const mode of modes) {
    const preset = ROUTING_MODE_WEIGHT_PRESETS[mode];
    assert.ok(preset, `Preset for mode ${mode} must exist`);
    assert.ok('cost' in preset, `Mode ${mode} must define cost weight`);
    assert.ok('success_rate' in preset, `Mode ${mode} must define success_rate weight`);
    assert.ok('speed' in preset, `Mode ${mode} must define speed weight`);
    assert.ok('capacity' in preset, `Mode ${mode} must define capacity weight`);
    
    const sum = preset.cost + preset.success_rate + preset.speed + preset.capacity;
    assert.ok(Math.abs(sum - 1.0) < 0.001, `Mode ${mode} weights should sum to 1.0 (got ${sum})`);
  }
});

test('cost mode selects cheapest candidate regardless of priority or speed', () => {
  const candidateFast = createCandidate({
    providerId: 'fast-expensive',
    estimatedCostCny: 2.0,
    latencyMs: 100,
    successRate: 0.99,
  });
  const candidateCheap = createCandidate({
    providerId: 'slow-cheap',
    estimatedCostCny: 0.5,
    latencyMs: 2000,
    successRate: 0.85,
  });

  const winner = selectRouteCandidate({ candidates: [candidateFast, candidateCheap] }, {
    routingMode: 'cost',
    costTieToleranceRate: 0,
  });
  assert.equal(winner.providerId, 'slow-cheap');
});

test('quality mode prefers high success rate even if cost is higher', () => {
  const highQuality = createCandidate({
    providerId: 'high-quality',
    estimatedCostCny: 2.0,
    successRate: 0.99,
    latencyMs: 600,
  });
  const lowQuality = createCandidate({
    providerId: 'low-quality',
    estimatedCostCny: 0.5,
    successRate: 0.60,
    latencyMs: 500,
  });

  const winner = selectRouteCandidate({ candidates: [highQuality, lowQuality] }, {
    routingMode: 'quality',
  });
  assert.equal(winner.providerId, 'high-quality');
});

test('stability mode balances success rate and latency', () => {
  const stableFast = createCandidate({
    providerId: 'stable-fast',
    estimatedCostCny: 1.5,
    successRate: 0.96,
    latencyMs: 200,
  });
  const slowFailing = createCandidate({
    providerId: 'slow-failing',
    estimatedCostCny: 0.5,
    successRate: 0.70,
    latencyMs: 3000,
  });

  const winner = selectRouteCandidate({ candidates: [stableFast, slowFailing] }, {
    routingMode: 'stability',
  });
  assert.equal(winner.providerId, 'stable-fast');
});

test('balanced mode incorporates cost, success rate, speed and capacity', () => {
  const candidateA = createCandidate({
    providerId: 'a',
    estimatedCostCny: 1.0,
    successRate: 0.95,
    latencyMs: 500,
    concurrencyLimit: 10,
    activeAttemptCount: 0,
  });
  const candidateB = createCandidate({
    providerId: 'b',
    estimatedCostCny: 3.0,
    successRate: 0.80,
    latencyMs: 1500,
    concurrencyLimit: 10,
    activeAttemptCount: 9,
  });

  const winner = selectRouteCandidate({ candidates: [candidateA, candidateB] }, {
    routingMode: 'balanced',
  });
  assert.equal(winner.providerId, 'a');
});

test('custom weights from database override default mode presets', () => {
  const expensiveHighSuccess = createCandidate({
    providerId: 'expensive-high-success',
    estimatedCostCny: 10.0,
    successRate: 0.99,
    latencyMs: 500,
  });
  const cheapLowSuccess = createCandidate({
    providerId: 'cheap-low-success',
    estimatedCostCny: 0.1,
    successRate: 0.50,
    latencyMs: 500,
  });

  // Under cost-heavy custom weights (cost: 0.95, success_rate: 0.05), cheap must win
  const winnerCostHeavy = selectRouteCandidate(
    { candidates: [expensiveHighSuccess, cheapLowSuccess] },
    {
      routingMode: 'balanced',
      weights: { cost: 0.95, success_rate: 0.05, speed: 0, capacity: 0 },
    }
  );
  assert.equal(winnerCostHeavy.providerId, 'cheap-low-success');

  // Under quality-heavy custom weights (cost: 0.05, success_rate: 0.95), high-success must win
  const winnerQualityHeavy = selectRouteCandidate(
    { candidates: [expensiveHighSuccess, cheapLowSuccess] },
    {
      routingMode: 'balanced',
      weights: { cost: 0.05, success_rate: 0.95, speed: 0, capacity: 0 },
    }
  );
  assert.equal(winnerQualityHeavy.providerId, 'expensive-high-success');
});

test('capacity scoring favors candidate with available headroom when other factors are tied', () => {
  const saturated = createCandidate({
    providerId: 'saturated',
    estimatedCostCny: 1.0,
    successRate: 0.95,
    latencyMs: 500,
    concurrencyLimit: 10,
    activeAttemptCount: 10, // 0% headroom
  });
  const idle = createCandidate({
    providerId: 'idle',
    estimatedCostCny: 1.0,
    successRate: 0.95,
    latencyMs: 500,
    concurrencyLimit: 10,
    activeAttemptCount: 0, // 100% headroom
  });

  // Give capacity a meaningful weight
  const winner = selectRouteCandidate(
    { candidates: [saturated, idle] },
    {
      routingMode: 'balanced',
      weights: { cost: 0.25, success_rate: 0.25, speed: 0.25, capacity: 0.25 },
    }
  );
  assert.equal(winner.providerId, 'idle');
});

test('weights are automatically normalized when they do not sum to 1.0', () => {
  const candidateFast = createCandidate({
    providerId: 'fast',
    estimatedCostCny: 1.0,
    successRate: 0.95,
    latencyMs: 100,
  });
  const candidateSlow = createCandidate({
    providerId: 'slow',
    estimatedCostCny: 1.0,
    successRate: 0.95,
    latencyMs: 1000,
  });

  // Weights sum to 100 instead of 1.0
  const winner = selectRouteCandidate(
    { candidates: [candidateFast, candidateSlow] },
    {
      routingMode: 'balanced',
      weights: { cost: 10, success_rate: 10, speed: 80, capacity: 0 },
    }
  );
  assert.equal(winner.providerId, 'fast');
});

test('handles empty candidates or single candidate gracefully', () => {
  assert.equal(selectRouteCandidate({ candidates: [] }), null);
  assert.equal(selectRouteCandidate(null), null);

  const single = createCandidate({ providerId: 'only-one' });
  assert.equal(selectRouteCandidate({ candidates: [single] }).providerId, 'only-one');
  assert.equal(selectRouteCandidate({ candidates: [single] }, { routingMode: 'balanced' }).providerId, 'only-one');
});
