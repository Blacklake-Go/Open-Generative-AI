import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  evaluateCrossModelFailover,
  modelCapabilityProfile,
  CROSS_MODEL_FAILOVER,
} from '../../lib/modelCenter/failoverPolicy.js';
import {
  evaluateRouteCandidates,
  normalizeRouteCostCeiling,
} from '../../lib/modelCenter/routePricing.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const NOW = Date.UTC(2026, 9, 29, 9, 0, 0);

function at(offsetMs) {
  return new Date(NOW + offsetMs).toISOString();
}

function logicalModel(overrides = {}) {
  return {
    id: 'model-primary',
    type: 'video',
    status: 'active',
    is_active: true,
    is_visible: true,
    capabilities: {
      modality: 'video',
      supported_task_types: ['t2v'],
      capability_version: 'cap-v1',
    },
    ...overrides,
  };
}

function backupModel(overrides = {}) {
  return logicalModel({
    id: 'model-backup',
    capabilities: {
      modality: 'video',
      supported_task_types: ['t2v'],
      capability_version: 'cap-v1',
    },
    ...overrides,
  });
}

function quoteSnapshot(overrides = {}) {
  return {
    id: 'quote_1',
    modelId: 'model-primary',
    routingMode: 'cost',
    fxSnapshot: { usdToCny: 7.2, rates: { USD_CNY: 7.2 } },
    maxFailoverCostCny: 5,
    maxFailoverCostUsd: 0.7,
    candidates: [{ providerModelId: 'pm-primary', providerId: 'prov-a' }],
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return evaluateCrossModelFailover({
    studioId: 'www',
    requestedModel: logicalModel(),
    backupModel: backupModel(),
    parameters: { task_type: 't2v', duration: 5 },
    triggeringErrorCode: 'PROVIDER_UNAVAILABLE',
    quoteSnapshot: quoteSnapshot(),
    now: NOW,
    ...overrides,
  });
}

test('capability profile only trusts declared task types', () => {
  assert.deepEqual(modelCapabilityProfile(logicalModel()).taskTypes, ['t2v']);
  assert.equal(modelCapabilityProfile(logicalModel()).modality, 'video');
  assert.equal(modelCapabilityProfile(logicalModel()).capabilityVersion, 'cap-v1');

  const undeclared = modelCapabilityProfile(logicalModel({ capabilities: { modality: 'video' } }));
  assert.deepEqual(undeclared.taskTypes, []);
});

test('equivalent backup inside the quoted ceiling is allowed with explicit route options', () => {
  const decision = evaluate();

  assert.equal(decision.allowed, true);
  assert.equal(decision.code, CROSS_MODEL_FAILOVER.ALLOWED);
  assert.equal(decision.evidence.primaryModelId, 'model-primary');
  assert.equal(decision.evidence.backupModelId, 'model-backup');
  assert.equal(decision.evidence.taskType, 't2v');
  assert.equal(decision.evidence.quoteId, 'quote_1');
  assert.equal(decision.evidence.budget.maxCostCny, 5);
  assert.equal(decision.evidence.budget.maxCostUsd, 0.7);
  assert.equal(decision.evidence.checkedAt, new Date(NOW).toISOString());
  assert.equal(decision.routeOptions.quoteId, null);
  assert.equal(decision.routeOptions.routingMode, 'cost');
  assert.equal(decision.routeOptions.fxSnapshot.usdToCny, 7.2);
  assert.deepEqual(decision.routeOptions.costCeiling, {
    maxCostCny: 5,
    maxCostUsd: 0.7,
    quoteId: 'quote_1',
    source: 'generation_quote_failover_ceiling',
  });
});

test('a failing candidate list does not allow a backup when the original quote has no ceiling', () => {
  const noBudget = evaluate({ quoteSnapshot: quoteSnapshot({ maxFailoverCostCny: null, maxFailoverCostUsd: null }) });
  assert.equal(noBudget.allowed, false);
  assert.equal(noBudget.code, CROSS_MODEL_FAILOVER.BUDGET_UNKNOWN);

  const noQuote = evaluate({ quoteSnapshot: null });
  assert.equal(noQuote.allowed, false);
  assert.equal(noQuote.code, CROSS_MODEL_FAILOVER.BUDGET_UNKNOWN);
  assert.equal(noQuote.routeOptions, null);
});

test('missing backup configuration and inactive or hidden backups are refused', () => {
  assert.equal(evaluate({ backupModel: null }).code, CROSS_MODEL_FAILOVER.NOT_CONFIGURED);
  assert.equal(
    evaluate({ backupModel: backupModel({ id: 'model-primary' }) }).code,
    CROSS_MODEL_FAILOVER.NOT_CONFIGURED,
  );
  assert.equal(
    evaluate({ backupModel: backupModel({ is_active: false }) }).code,
    CROSS_MODEL_FAILOVER.BACKUP_INACTIVE,
  );
  assert.equal(
    evaluate({ backupModel: backupModel({ is_visible: false }) }).code,
    CROSS_MODEL_FAILOVER.BACKUP_HIDDEN,
  );
});

test('modality and task type equivalence are hard requirements', () => {
  const modalityMismatch = evaluate({
    backupModel: backupModel({
      type: 'image',
      capabilities: { modality: 'image', supported_task_types: ['t2i'] },
    }),
  });
  assert.equal(modalityMismatch.code, CROSS_MODEL_FAILOVER.MODALITY_MISMATCH);

  const undeclared = evaluate({
    requestedModel: logicalModel({ capabilities: { modality: 'video' } }),
    backupModel: backupModel({ capabilities: { modality: 'video', supported_task_types: ['t2v'] } }),
  });
  assert.equal(undeclared.code, CROSS_MODEL_FAILOVER.TASK_TYPE_UNVERIFIED);

  const requestedMissing = evaluate({
    parameters: { task_type: 'i2v' },
  });
  assert.equal(requestedMissing.code, CROSS_MODEL_FAILOVER.TASK_TYPE_MISMATCH);

  const backupMissingTask = evaluate({
    requestedModel: logicalModel({ capabilities: { supported_task_types: ['t2v', 'i2v'] } }),
    parameters: { task_type: 't2v' },
  });
  assert.equal(backupMissingTask.code, CROSS_MODEL_FAILOVER.TASK_TYPE_MISMATCH);
  assert.deepEqual(backupMissingTask.evidence.missingTasks, ['i2v']);
});

test('receipts, unknown submission and explicit content rejection never fail over', () => {
  assert.equal(
    evaluate({ hasProviderReceipt: true }).code,
    CROSS_MODEL_FAILOVER.UNCONFIRMED_SUBMISSION,
  );
  assert.equal(
    evaluate({ submissionOutcomeUnknown: true }).code,
    CROSS_MODEL_FAILOVER.UNCONFIRMED_SUBMISSION,
  );
  assert.equal(
    evaluate({
      triggeringErrorCode: 'CONTENT_REJECTED',
      nonRetryableErrorCodes: new Set(['CONTENT_REJECTED']),
    }).code,
    CROSS_MODEL_FAILOVER.NON_RETRYABLE_ERROR,
  );
  assert.equal(
    evaluate({ alreadyTriedBackup: true }).code,
    CROSS_MODEL_FAILOVER.ALREADY_TRIED,
  );
});

test('Canvas never switches logical models on its own', () => {
  const decision = evaluate({ studioId: 'canvas' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.code, CROSS_MODEL_FAILOVER.CANVAS_PINNED);
});

test('the quote must belong to the primary model', () => {
  const decision = evaluate({ quoteSnapshot: quoteSnapshot({ modelId: 'model-other' }) });
  assert.equal(decision.code, CROSS_MODEL_FAILOVER.QUOTE_MODEL_MISMATCH);
});

test('normalizeRouteCostCeiling accepts cny/usd bounds and rejects empty ceilings', () => {
  assert.deepEqual(normalizeRouteCostCeiling({ maxCostCny: 1.5, quoteId: 'q', source: 'quote' }), {
    maxCostCny: 1.5,
    maxCostUsd: null,
    quoteId: 'q',
    source: 'quote',
  });
  assert.equal(normalizeRouteCostCeiling(null), null);
  assert.equal(normalizeRouteCostCeiling({ maxCostCny: null, maxCostUsd: null }), null);
});

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

test('route admission enforces the cross-model cost ceiling', () => {
  const rejected = evaluateRouteCandidates([routeMapping()], { task_type: 't2i' }, {
    modelId: 'model-x',
    now: NOW,
    costCeiling: { maxCostCny: 0.1, quoteId: 'quote_1', source: 'generation_quote_failover_ceiling' },
  });
  assert.equal(rejected.candidates.length, 0);
  assert.equal(rejected.rejected[0].reason, 'QUOTE_COST_CEILING_EXCEEDED');
  assert.equal(rejected.rejected[0].evidence.costCeilingSource, 'generation_quote_failover_ceiling');
  assert.equal(rejected.rejected[0].evidence.maxCostCny, 0.1);
  assert.equal(rejected.rejected[0].evidence.estimatedCostCny, 0.5);

  const allowed = evaluateRouteCandidates([routeMapping()], { task_type: 't2i' }, {
    modelId: 'model-x',
    now: NOW,
    costCeiling: { maxCostCny: 10, quoteId: 'quote_1' },
  });
  assert.equal(allowed.candidates.length, 1);
});

test('generation pipeline uses the equivalence policy and no longer hardcodes a primary channel', () => {
  const core = fs.readFileSync(path.join(REPO_ROOT, 'lib/services/generationCore.js'), 'utf8');
  assert.match(core, /evaluateCrossModelFailover\(/);
  assert.match(core, /MODEL_FAILOVER_SKIPPED/);
  assert.match(core, /costCeiling: failoverRouteOptions\?\.costCeiling/);
  assert.match(core, /quoteId: failoverRouteOptions \? null :/);
  assert.doesNotMatch(core, /providerId === 'runninghub'/);

  const quotes = fs.readFileSync(path.join(REPO_ROOT, 'lib/repositories/quotes.js'), 'utf8');
  assert.match(quotes, /export async function getGenerationQuoteRouteSnapshot/);

  const router = fs.readFileSync(path.join(REPO_ROOT, 'lib/services/smartRouter.js'), 'utf8');
  assert.match(router, /normalizeRouteCostCeiling\(costCeiling\)/);
  assert.match(router, /crossModelCostCeiling/);
});
