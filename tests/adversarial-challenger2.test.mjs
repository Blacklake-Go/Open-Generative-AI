import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CREDIT_PRICING_POLICY,
  quoteCreditsFromProviderCostCny,
} from '../lib/pricing/creditPolicy.js';
import {
  selectRouteCandidate,
  evaluateRouteCandidates,
  buildRouteQuoteSnapshot,
  ROUTING_MODE_WEIGHT_PRESETS,
} from '../lib/modelCenter/routePricing.js';
import { calculateModelPrice } from '../lib/services/pricingEngine.js';
import { serializePublicAppModel } from '../lib/modelCenter/publicDirectory.js';

// ============================================================================
// Helper Fixtures
// ============================================================================

function createCandidate({
  providerId = 'prov-a',
  providerModelId = 'pm-a',
  estimatedCostCny = 1.0,
  estimatedCostUsd = 0.14,
  priceVersionId = 'pver-1',
  successRate = 0.95,
  latencyMs = 500,
  priority = 100,
  concurrencyLimit = 10,
  activeAttemptCount = 0,
  priceType = 'account_actual',
  estimatedCostSource = 'provider_price_version',
  fxSnapshot = { usdToCny: 7.2, rates: { USD_CNY: 7.2, CNY_CNY: 1 } },
} = {}) {
  return {
    providerId,
    providerModelId,
    priceVersionId,
    priceType,
    estimatedCostSource,
    estimatedCost: estimatedCostCny,
    estimatedCostCny,
    estimatedCostUsd,
    estimatedCostCurrency: 'CNY',
    successRate,
    latencyMs,
    priority,
    fxSnapshot,
    providerModel: {
      concurrency_limit: concurrencyLimit,
      active_attempt_count: activeAttemptCount,
      priority,
      mapping_version: 1,
      provider_endpoint: `/api/v1/${providerId}`,
    },
  };
}

function mockTransaction(modelData, pricingData) {
  return {
    queryOne: async (sql, params) => {
      if (sql.includes('ai_studio.ai_models')) {
        return modelData;
      }
      if (sql.includes('ai_studio.model_pricing')) {
        return pricingData;
      }
      return null;
    },
    queryMany: async () => [],
    query: async () => [],
    execute: async () => {},
  };
}

// ============================================================================
// Section 1: Gross Margin Floor Adversarial Challenge (< 75%)
// ============================================================================

test('CHALLENGE-1.1: Math boundary — candidates yielding margin < 75% are rejected with PRICING_MARGIN_BELOW_FLOOR', async () => {
  // Locked site price = 10.0 CNY
  // minMarginRate = 0.75, providerCostReserveRate = 0.10
  // costCeilingCny = 10.0 * (1 - 0.75) / 1.10 = 2.27272727... CNY
  const modelData = {
    id: 'test-model-margin',
    name: 'Margin Test Model',
    category: 'image',
  };
  const pricingData = {
    model_id: 'test-model-margin',
    pricing_type: 'fixed',
    site_price_cny: '10.00',
    min_gross_margin_rate: 0.75,
    min_credits: 10,
    base_credits: 50,
  };

  // Test candidate with cost 2.30 CNY (margin = (10 - 2.3 * 1.1) / 10 = 74.7% < 75%)
  const failingCandidate = createCandidate({
    providerId: 'prov-expensive',
    providerModelId: 'pm-expensive',
    estimatedCostCny: 2.30,
  });

  const tx = mockTransaction(modelData, pricingData);

  await assert.rejects(
    async () => {
      await calculateModelPrice({
        modelId: 'test-model-margin',
        pricingConfig: pricingData,
        parameters: {},
        transaction: tx,
        routeResult: {
          allCandidates: [failingCandidate],
          rejectedCandidates: [],
          routingMode: 'cost',
          fxSnapshot: { usdToCny: 7.2 },
        },
      });
    },
    (err) => {
      assert.equal(err.code, 'PRICING_MARGIN_BELOW_FLOOR');
      assert.ok(err.message.includes('75% 毛利底线'));
      return true;
    }
  );
});

test('CHALLENGE-1.2: Boundary precision test around exact 75% margin threshold', async () => {
  // Site price = 10.00 CNY
  // costCeilingCny = 10.0 * 0.25 / 1.10 = 2.27272727...
  const modelData = { id: 'test-model-boundary', name: 'Boundary Model', category: 'image' };
  const pricingData = {
    model_id: 'test-model-boundary',
    pricing_type: 'fixed',
    site_price_cny: '10.00',
    min_gross_margin_rate: 0.75,
    min_credits: 10,
    base_credits: 50,
  };
  const tx = mockTransaction(modelData, pricingData);

  // Candidate with cost 2.27 CNY <= 2.272727 -> Margin >= 75% -> PASS
  const validCandidate = createCandidate({
    providerId: 'prov-valid',
    providerModelId: 'pm-valid',
    estimatedCostCny: 2.27,
  });
  const quoteValid = await calculateModelPrice({
    modelId: 'test-model-boundary',
    pricingConfig: pricingData,
    parameters: {},
    transaction: tx,
    routeResult: {
      allCandidates: [validCandidate],
      rejectedCandidates: [],
      routingMode: 'cost',
      fxSnapshot: { usdToCny: 7.2 },
    },
  });
  assert.ok(quoteValid.credits > 0);
  assert.equal(quoteValid.selectedProviderModelId, 'pm-valid');

  // Candidate with cost 2.28 CNY > 2.272727 -> Margin < 75% -> REJECT with PRICING_MARGIN_BELOW_FLOOR
  const invalidCandidate = createCandidate({
    providerId: 'prov-invalid',
    providerModelId: 'pm-invalid',
    estimatedCostCny: 2.28,
  });
  await assert.rejects(
    async () => {
      await calculateModelPrice({
        modelId: 'test-model-boundary',
        pricingConfig: pricingData,
        parameters: {},
        transaction: tx,
        routeResult: {
          allCandidates: [invalidCandidate],
          rejectedCandidates: [],
          routingMode: 'cost',
          fxSnapshot: { usdToCny: 7.2 },
        },
      });
    },
    (err) => err.code === 'PRICING_MARGIN_BELOW_FLOOR'
  );
});

test('CHALLENGE-1.3: Tampering clamp — passing min_gross_margin_rate < 0.30 cannot lower the 30% floor', async () => {
  const modelData = { id: 'test-model-clamp', name: 'Clamp Model', category: 'image' };
  // Malicious / misconfigured pricing attempt to set 10% margin floor
  const pricingData = {
    model_id: 'test-model-clamp',
    pricing_type: 'fixed',
    site_price_cny: '10.00',
    min_gross_margin_rate: 0.10, // Attempted 10% floor!
    min_credits: 10,
    base_credits: 50,
  };
  const tx = mockTransaction(modelData, pricingData);

  // Candidate has cost = 7.0 CNY. Margin = (10 - 7 * 1.1) / 10 = 23% (passes 10%, fails 30%)
  const candidate = createCandidate({
    providerId: 'prov-mid',
    providerModelId: 'pm-mid',
    estimatedCostCny: 7.0,
  });

  await assert.rejects(
    async () => {
      await calculateModelPrice({
        modelId: 'test-model-clamp',
        pricingConfig: pricingData,
        parameters: {},
        transaction: tx,
        routeResult: {
          allCandidates: [candidate],
          rejectedCandidates: [],
          routingMode: 'cost',
          fxSnapshot: { usdToCny: 7.2 },
        },
      });
    },
    (err) => {
      assert.equal(err.code, 'PRICING_MARGIN_BELOW_FLOOR');
      assert.ok(err.message.includes('30% 毛利底线'), 'Must enforce clamped 30% floor, not 10%');
      return true;
    }
  );
});

test('CHALLENGE-1.4: Multi-candidate filtering — sub-75% margin candidates are pruned and cannot win even in quality mode', async () => {
  const modelData = { id: 'test-model-prune', name: 'Prune Model', category: 'image' };
  const pricingData = {
    model_id: 'test-model-prune',
    pricing_type: 'fixed',
    site_price_cny: '10.00',
    min_gross_margin_rate: 0.75,
    min_credits: 10,
    base_credits: 50,
  };
  const tx = mockTransaction(modelData, pricingData);

  // Candidate A: 2.00 CNY cost (margin = 78% >= 75%), success rate 0.85
  const candidateSafe = createCandidate({
    providerId: 'prov-safe',
    providerModelId: 'pm-safe',
    estimatedCostCny: 2.00,
    successRate: 0.85,
    latencyMs: 800,
  });

  // Candidate B: 3.50 CNY cost (margin = 61.5% < 75%), success rate 0.9999 (super high quality!)
  const candidateViolating = createCandidate({
    providerId: 'prov-violating',
    providerModelId: 'pm-violating',
    estimatedCostCny: 3.50,
    successRate: 0.9999,
    latencyMs: 100,
  });

  const quote = await calculateModelPrice({
    modelId: 'test-model-prune',
    pricingConfig: pricingData,
    parameters: {},
    transaction: tx,
    routeResult: {
      allCandidates: [candidateSafe, candidateViolating],
      rejectedCandidates: [],
      routingMode: 'quality', // Requesting quality mode!
      fxSnapshot: { usdToCny: 7.2 },
    },
  });

  // Even though candidateViolating has far higher quality, it violates the 75% margin floor!
  // It must be pruned, and candidateSafe MUST be selected!
  assert.equal(quote.selectedProviderModelId, 'pm-safe');
  assert.equal(quote.routeQuote.candidates.length, 1);
  assert.equal(quote.routeQuote.candidates[0].providerModelId, 'pm-safe');
  assert.ok(
    quote.routeQuote.rejected.some(
      (r) => r.providerModelId === 'pm-violating' && r.reason === 'MINIMUM_MARGIN_FLOOR'
    ),
    'Violating candidate must be recorded in rejected with MINIMUM_MARGIN_FLOOR'
  );
});

test('CHALLENGE-1.5: quoteCreditsFromProviderCostCny mathematically guarantees >= 30% contribution margin', () => {
  const testCosts = [0.001, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0, 50.0, 100.0, 1000.0];
  for (const costCny of testCosts) {
    const result = quoteCreditsFromProviderCostCny(costCny);
    assert.ok(
      result.contributionMarginRate >= 0.30,
      `Cost ${costCny} yielded margin ${result.contributionMarginRate} which is below 0.30`
    );
    assert.ok(result.credits >= 10, 'Must satisfy minimum credits of 10');
    assert.equal(result.credits % 5, 0, 'Must satisfy credit rounding of 5');
  }
});

test('CHALLENGE-1.6: evaluateRouteCandidates rejects candidate exceeding quote ceiling with QUOTE_COST_CEILING_EXCEEDED', () => {
  const fxSnapshot = { id: 'fx-test', usdToCny: 7.2, rates: { USD_CNY: 7.2, CNY_CNY: 1 } };
  const quote = {
    maxFailoverCostCny: 1.50,
    maxFailoverCostUsd: 0.208,
    candidates: [
      {
        providerId: 'prov-a',
        providerModelId: 'pm-a',
        mappingVersion: 1,
        providerEndpoint: '/v1/generate',
        estimatedCostCny: 1.20,
        estimatedCostUsd: 0.166,
      },
    ],
  };

  const candidateExceeding = {
    model_id: 'model-a',
    provider_id: 'prov-a',
    provider_model_id: 'pm-a',
    mapping_version: 1,
    provider_endpoint: '/v1/generate',
    enabled: true,
    provider_enabled: true,
    adapter_available: true,
    credentials_configured: true,
    review_status: 'approved',
    supported_task_types: ['t2i'],
    capabilities: { input_types: ['text'], output_types: ['image'] },
    health_status: 'healthy',
    last_health_check_at: new Date().toISOString(),
    active_price_version: {
      id: 'pver-a',
      price_type: 'account_actual',
      billing_unit: 'per_request',
      currency: 'CNY',
      price_config: { base_cost: 1.80, currency: 'CNY' }, // 1.80 > 1.50 ceiling!
      status: 'active',
      source_observed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    },
  };

  const evalResult = evaluateRouteCandidates([candidateExceeding], { task_type: 't2i' }, {
    modelId: 'model-a',
    fxSnapshot,
    quoteSnapshot: quote,
  });

  assert.equal(evalResult.candidates.length, 0);
  assert.equal(evalResult.rejected.length, 1);
  assert.equal(evalResult.rejected[0].reason, 'QUOTE_COST_CEILING_EXCEEDED');
});

// ============================================================================
// Section 2: All 4 Routing Modes Adversarial Challenge
// ============================================================================

test('CHALLENGE-2.1: Mode "cost" — strict cost supremacy over speed, quality, and priority', () => {
  const expensiveUltraFast = createCandidate({
    providerId: 'fast-expensive',
    estimatedCostCny: 1.05,
    latencyMs: 10,
    successRate: 1.0,
    priority: 9999,
  });
  const cheapSlow = createCandidate({
    providerId: 'cheap-slow',
    estimatedCostCny: 1.00,
    latencyMs: 4000,
    successRate: 0.80,
    priority: 0,
  });

  // Cheap slow must win because 1.00 < 1.05 (>1% tolerance)
  const winner = selectRouteCandidate(
    { candidates: [expensiveUltraFast, cheapSlow] },
    { routingMode: 'cost', costTieToleranceRate: 0.01 }
  );
  assert.equal(winner.providerId, 'cheap-slow');

  // Near-tie within 1% tolerance:
  const candidateA = createCandidate({
    providerId: 'cand-a',
    estimatedCostCny: 1.000,
    latencyMs: 1000,
    successRate: 0.90,
  });
  const candidateB = createCandidate({
    providerId: 'cand-b',
    estimatedCostCny: 1.005, // Within 1% tolerance of 1.000 (1.005 <= 1.010)
    latencyMs: 200,
    successRate: 0.99,
  });
  const tieWinner = selectRouteCandidate(
    { candidates: [candidateA, candidateB] },
    { routingMode: 'cost', costTieToleranceRate: 0.01 }
  );
  assert.equal(tieWinner.providerId, 'cand-b', 'Within tie tolerance, candidate with higher success rate wins');
});

test('CHALLENGE-2.2: Mode "quality" — 80% weight on success rate dominates cost and latency', () => {
  const highQualityCostly = createCandidate({
    providerId: 'prov-hq',
    estimatedCostCny: 10.0,
    successRate: 0.995,
    latencyMs: 2000,
  });
  const lowQualityDirtCheap = createCandidate({
    providerId: 'prov-lq',
    estimatedCostCny: 0.10,
    successRate: 0.70,
    latencyMs: 100,
  });

  const winner = selectRouteCandidate(
    { candidates: [highQualityCostly, lowQualityDirtCheap] },
    { routingMode: 'quality' }
  );
  assert.equal(winner.providerId, 'prov-hq', 'Quality mode must choose 99.5% success over 100x cheaper provider');
});

test('CHALLENGE-2.3: Mode "stability" — balanced success rate (55%) and speed (25%) over extreme latency outliers', () => {
  // Candidate A: 0.95 success rate, blazing fast (100ms)
  const responsive = createCandidate({
    providerId: 'prov-fast-stable',
    estimatedCostCny: 1.0,
    successRate: 0.95,
    latencyMs: 100,
  });
  // Candidate B: 0.96 success rate (only 1% higher), but terrible latency (8000ms)
  const sluggish = createCandidate({
    providerId: 'prov-sluggish',
    estimatedCostCny: 1.0,
    successRate: 0.96,
    latencyMs: 8000,
  });

  const winner = selectRouteCandidate(
    { candidates: [responsive, sluggish] },
    { routingMode: 'stability' }
  );
  assert.equal(winner.providerId, 'prov-fast-stable', 'Stability mode speed weight (0.25) must penalize 80x higher latency');
});

test('CHALLENGE-2.4: Mode "balanced" — multi-objective synthesis with concurrency capacity', () => {
  // Two candidates identical in cost, success rate, and latency, but one has zero concurrency headroom
  const saturated = createCandidate({
    providerId: 'prov-saturated',
    estimatedCostCny: 1.0,
    successRate: 0.95,
    latencyMs: 500,
    concurrencyLimit: 10,
    activeAttemptCount: 10, // 100% full
  });
  const freeHeadroom = createCandidate({
    providerId: 'prov-free',
    estimatedCostCny: 1.0,
    successRate: 0.95,
    latencyMs: 500,
    concurrencyLimit: 10,
    activeAttemptCount: 1, // 90% available
  });

  const winner = selectRouteCandidate(
    { candidates: [saturated, freeHeadroom] },
    { routingMode: 'balanced' }
  );
  assert.equal(winner.providerId, 'prov-free', 'Balanced mode must break tie via capacity headroom score');
});

test('CHALLENGE-2.5: Robustness under degenerate and edge-case inputs', () => {
  // Empty
  assert.equal(selectRouteCandidate({ candidates: [] }, { routingMode: 'cost' }), null);
  assert.equal(selectRouteCandidate({ candidates: [] }, { routingMode: 'quality' }), null);
  assert.equal(selectRouteCandidate({ candidates: [] }, { routingMode: 'stability' }), null);
  assert.equal(selectRouteCandidate({ candidates: [] }, { routingMode: 'balanced' }), null);

  // Single candidate
  const single = createCandidate({ providerId: 'solo' });
  for (const mode of ['cost', 'quality', 'stability', 'balanced']) {
    assert.equal(selectRouteCandidate({ candidates: [single] }, { routingMode: mode }).providerId, 'solo');
  }

  // Division by zero in min === max cost and latency:
  const cand1 = createCandidate({ providerId: 'c1', estimatedCostCny: 1.0, latencyMs: 500, successRate: 0.9 });
  const cand2 = createCandidate({ providerId: 'c2', estimatedCostCny: 1.0, latencyMs: 500, successRate: 0.9 });
  const result = selectRouteCandidate({ candidates: [cand1, cand2] }, { routingMode: 'balanced' });
  assert.ok(result, 'Must handle identical metrics without NaN');

  // Unknown routing mode string falls back to balanced
  const fallback = selectRouteCandidate({ candidates: [cand1, cand2] }, { routingMode: 'non_existent_mode' });
  assert.ok(fallback);

  // Concurrency limit = 0
  const zeroConc = createCandidate({ providerId: 'c-zero', concurrencyLimit: 0, activeAttemptCount: 0 });
  const concResult = selectRouteCandidate({ candidates: [zeroConc] }, { routingMode: 'balanced' });
  assert.equal(concResult.providerId, 'c-zero');
});

test('CHALLENGE-2.6: Zero site price cannot bypass margin floor — rejected with PRICING_MARGIN_BELOW_FLOOR', async () => {
  const modelData = { id: 'test-model-zero-site', name: 'Zero Price Model', category: 'image' };
  const pricingData = {
    model_id: 'test-model-zero-site',
    pricing_type: 'fixed',
    site_price_cny: '0.00', // Free site price
    min_gross_margin_rate: 0.75,
    min_credits: 10,
    base_credits: 50,
  };
  const tx = mockTransaction(modelData, pricingData);
  const paidCandidate = createCandidate({
    providerId: 'prov-cost',
    providerModelId: 'pm-cost',
    estimatedCostCny: 0.05, // Upstream costs 0.05 CNY
  });

  await assert.rejects(
    async () => {
      await calculateModelPrice({
        modelId: 'test-model-zero-site',
        pricingConfig: pricingData,
        parameters: {},
        transaction: tx,
        routeResult: {
          allCandidates: [paidCandidate],
          rejectedCandidates: [],
          routingMode: 'cost',
          fxSnapshot: { usdToCny: 7.2 },
        },
      });
    },
    (err) => err.code === 'PRICING_MARGIN_BELOW_FLOOR'
  );
});

test('CHALLENGE-2.7: Invalid base_credits <= 0 rejects with MODEL_PRICING_UNCONFIGURED', async () => {
  const modelData = { id: 'test-model-bad-base', name: 'Bad Base Model', category: 'image' };
  const pricingData = {
    model_id: 'test-model-bad-base',
    pricing_type: 'formula',
    base_credits: 0, // Invalid base credits
    min_credits: 10,
  };
  const tx = mockTransaction(modelData, pricingData);
  const cand = createCandidate();

  await assert.rejects(
    async () => {
      await calculateModelPrice({
        modelId: 'test-model-bad-base',
        pricingConfig: pricingData,
        parameters: {},
        transaction: tx,
        routeResult: {
          allCandidates: [cand],
          rejectedCandidates: [],
          routingMode: 'cost',
        },
      });
    },
    (err) => err.code === 'MODEL_PRICING_UNCONFIGURED'
  );
});

test('CHALLENGE-2.8: Missing model pricing never invents a fallback quote', async () => {
  const modelData = { id: 'test-model-missing-pricing', name: 'Unpriced Model', category: 'image' };
  const tx = mockTransaction(modelData, null);

  await assert.rejects(
    async () => {
      await calculateModelPrice({
        modelId: modelData.id,
        parameters: {},
        transaction: tx,
        routeResult: {
          allCandidates: [createCandidate()],
          rejectedCandidates: [],
          routingMode: 'cost',
          fxSnapshot: { usdToCny: 7.2 },
        },
      });
    },
    (err) => err.code === 'MODEL_PRICING_UNCONFIGURED'
  );
});

test('CHALLENGE-2.9: Inactive model pricing cannot produce a quote', async () => {
  const modelData = { id: 'test-model-inactive-pricing', name: 'Inactive Pricing Model', category: 'image' };
  const pricingData = {
    model_id: modelData.id,
    pricing_type: 'fixed',
    base_credits: 50,
    is_active: false,
  };
  const tx = mockTransaction(modelData, pricingData);

  await assert.rejects(
    async () => {
      await calculateModelPrice({
        modelId: modelData.id,
        parameters: {},
        transaction: tx,
        routeResult: {
          allCandidates: [createCandidate()],
          rejectedCandidates: [],
          routingMode: 'cost',
          fxSnapshot: { usdToCny: 7.2 },
        },
      });
    },
    (err) => err.code === 'MODEL_PRICING_UNCONFIGURED'
  );
});

test('CHALLENGE-2.10: Public model directory never invents 100 credits or presents credits as a quote', () => {
  const missingPrice = serializePublicAppModel({
    id: 'test-model-public-missing-price',
    name: 'Public Model',
    category: 'image',
    credits_price: null,
  });
  assert.equal(missingPrice.credits, null);
  assert.equal(missingPrice.startingCredits, null);
  assert.equal(missingPrice.quoteRequired, true);
  assert.equal(missingPrice.creditsAreQuote, false);

  const formulaPrice = serializePublicAppModel({
    id: 'test-model-public-formula-price',
    name: 'Formula Model',
    category: 'image',
    credits_price: 15,
    pricing_type: 'formula',
  });
  assert.equal(formulaPrice.credits, null);
  assert.equal(formulaPrice.startingCredits, 15);
  assert.equal(formulaPrice.quoteRequired, true);
  assert.equal(formulaPrice.creditsAreQuote, false);
});

