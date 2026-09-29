import test from 'node:test';
import assert from 'node:assert/strict';
import { attachOfficialPublicPriceVersions, evaluateRouteCandidates } from '../../lib/modelCenter/routePricing.js';

test('official public active price fills a missing mapping price without replacing an existing price', () => {
  const manualPrice = { id: 'manual-price-version', price_type: 'manual', status: 'active' };
  const officialPrice = {
    id: 'official-price-version',
    price_type: 'official_public',
    status: 'active',
    billing_unit: 'per_request',
    currency: 'USD',
    price_config: { unit_amount: 0.25 },
  };
  const mappings = [
    { id: 'mapping-without-price', active_price_version: null },
    { id: 'mapping-with-manual-price', active_price_version: manualPrice },
  ];
  const rows = [
    { provider_model_id: 'mapping-without-price', price_version: officialPrice },
    { provider_model_id: 'mapping-with-manual-price', price_version: { ...officialPrice, id: 'must-not-override' } },
  ];

  const result = attachOfficialPublicPriceVersions(mappings, rows);

  assert.equal(result[0].active_price_version.id, 'official-price-version');
  assert.strictEqual(result[1], mappings[1]);
  assert.strictEqual(result[1].active_price_version, manualPrice);
});

test('official public provider prices are usable as fresh sourced route costs', () => {
  const now = Date.parse('2026-09-29T14:45:00.000Z');
  const evaluation = evaluateRouteCandidates([{
    model_id: 'wan2.7-text-to-image',
    provider_id: 'runninghub',
    provider_model_id: 'openapi/v2/alibaba/wan-2.7/text-to-image',
    provider_endpoint: '/openapi/v2/alibaba/wan-2.7/text-to-image',
    enabled: true,
    provider_enabled: true,
    review_status: 'approved',
    supported_task_types: ['t2i'],
    capabilities: { input_types: ['text'], output_types: ['image'] },
    adapter_available: true,
    credentials_configured: true,
    circuit_state: 'closed',
    health_status: 'healthy',
    last_health_check_at: new Date(now).toISOString(),
    active_price_version: {
      id: 'official-public-price-version',
      price_type: 'official_public',
      status: 'active',
      billing_unit: 'per_image',
      currency: 'USD',
      price_config: { unit_amount: 0.027 },
      source_observed_at: new Date(now).toISOString(),
    },
  }], { task_type: 't2i', prompt: 'route price fixture' }, {
    modelId: 'wan2.7-text-to-image',
    now,
    fxSnapshot: { usdToCny: 7.2 },
  });

  assert.equal(evaluation.rejected.length, 0);
  assert.equal(evaluation.candidates.length, 1);
  assert.equal(evaluation.candidates[0].priceType, 'official_public');
  assert.equal(evaluation.candidates[0].estimatedCostUsd, 0.027);
  assert.equal(evaluation.candidates[0].estimatedCostCny, 0.1944);
});
