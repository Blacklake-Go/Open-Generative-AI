import test from 'node:test';
import assert from 'node:assert/strict';

import { submitPlatformGeneration } from '../../packages/studio/src/platformGeneration.js';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test('platform generation obtains the server quote before creating a job and binds both to one retry key', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/generation/quote') {
      return jsonResponse({ quote_id: 'quote_123', creditsQuoted: 17, expires_at: '2030-01-01T00:00:00Z' }, 201);
    }
    if (url === '/api/generations') {
      return jsonResponse({ creation_id: 'gen_123', status: 'queued' }, 202);
    }
    if (url === '/api/generations?id=gen_123') {
      return jsonResponse({ creation: { id: 'gen_123', status: 'succeeded', result_url: 'https://assets.invalid/result.png', credit_cost: 17 } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const requestIds = [];
  const result = await submitPlatformGeneration({
    modelId: 'seedream-5.0',
    studioId: 'image',
    prompt: 'a test image',
    parameters: { task_type: 't2i', size: '1024x1024', num_images: 1 },
    idempotencyKey: 'platform-generation-test-123',
    fetchImpl,
    waitImpl: async () => {},
    maxAttempts: 1,
    onRequestId: (id) => requestIds.push(id),
  });

  assert.deepEqual(calls.map((call) => call.url), [
    '/api/generation/quote',
    '/api/generations',
    '/api/generations?id=gen_123',
  ]);
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'platform-generation-test-123:quote');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    modelId: 'seedream-5.0',
    parameters: { task_type: 't2i', size: '1024x1024', num_images: 1 },
  });
  assert.equal(calls[1].options.headers['Idempotency-Key'], 'platform-generation-test-123');
  assert.equal(JSON.parse(calls[1].options.body).quoteId, 'quote_123');
  assert.equal(JSON.parse(calls[1].options.body).studioId, 'image');
  assert.deepEqual(requestIds, ['gen_123']);
  assert.equal(result.url, 'https://assets.invalid/result.png');
  assert.equal(result.cost.amount_credits, 17);
});

test('platform generation never submits a job when the quote endpoint rejects the settings', async () => {
  const calls = [];
  const authErrors = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse({ code: 'MODEL_PRICE_UNAVAILABLE', error: 'This model has no approved price.' }, 422);
  };

  await assert.rejects(
    () => submitPlatformGeneration({
      modelId: 'unpriced-model',
      prompt: 'do not submit',
      idempotencyKey: 'platform-generation-fail-123',
      fetchImpl,
      onAuthRequired: (status, message) => authErrors.push({ status, message }),
    }),
    (error) => error.code === 'MODEL_PRICE_UNAVAILABLE' && error.status === 422,
  );

  assert.deepEqual(calls.map((call) => call.url), ['/api/generation/quote']);
  assert.deepEqual(authErrors, []);
});

test('platform generation does not claim a refund when the task trace only reports failure', async () => {
  const fetchImpl = async (url) => {
    if (url === '/api/generation/quote') return jsonResponse({ quoteId: 'quote_failure', creditsQuoted: 9 }, 201);
    if (url === '/api/generations') return jsonResponse({ creation_id: 'gen_failure', status: 'queued' }, 202);
    if (url === '/api/generations?id=gen_failure') {
      return jsonResponse({ creation: { id: 'gen_failure', status: 'failed', error_reason: 'provider failed', credit_cost: 9 } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const phases = [];

  await assert.rejects(
    () => submitPlatformGeneration({
      modelId: 'seedream-5.0',
      idempotencyKey: 'platform-generation-failure-123',
      fetchImpl,
      waitImpl: async () => {},
      maxAttempts: 1,
      onPhase: (phase, requestId) => phases.push({ phase, requestId }),
    }),
    (error) => {
      assert.equal(error.code, 'GENERATION_FAILED');
      assert.equal(error.generationResult.cost.refunded, undefined);
      assert.equal(error.generationResult.cost.refund_status, 'unverified');
      return true;
    },
  );

  assert.deepEqual(phases, [
    { phase: 'reserved', requestId: 'gen_failure' },
    { phase: 'failed', requestId: 'gen_failure' },
  ]);
});

test('platform generation routes an unauthenticated quote response to the login handler', async () => {
  const calls = [];
  const authErrors = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return jsonResponse({ code: 'UNAUTHENTICATED', error: 'Sign in first.' }, 401);
  };

  await assert.rejects(
    () => submitPlatformGeneration({
      modelId: 'seedream-5.0',
      idempotencyKey: 'platform-generation-unauth-123',
      fetchImpl,
      onAuthRequired: (status, message) => authErrors.push({ status, message }),
    }),
    { code: 'UNAUTHENTICATED', status: 401 },
  );

  assert.deepEqual(calls, ['/api/generation/quote']);
  assert.deepEqual(authErrors, [{ status: 401, message: 'Sign in first.' }]);
});

test('platform generation rejects a malformed quote before creating a job', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return jsonResponse({ credits: 17 }, 201);
  };

  await assert.rejects(
    () => submitPlatformGeneration({
      modelId: 'seedream-5.0',
      idempotencyKey: 'platform-generation-malformed-123',
      fetchImpl,
    }),
    { code: 'QUOTE_REQUIRED' },
  );

  assert.deepEqual(calls, ['/api/generation/quote']);
});
