import assert from 'node:assert/strict';
import test from 'node:test';
import { priceForIds } from '../packages/studio/src/modelPrice.js';
import { submitPlatformGeneration } from '../packages/studio/src/platformGeneration.js';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function jsonResponse(payload, status = 201) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test('generation retries reuse one intent key, then release it after terminal success', async () => {
  const idempotencyStorage = new MemoryStorage();
  const generationKeys = [];
  const quoteKeys = [];
  let generationAttempt = 0;

  const fetchImpl = async (url, options = {}) => {
    if (url === '/api/generation/quote') {
      quoteKeys.push(options.headers['Idempotency-Key']);
      return jsonResponse({ quoteId: 'quote-reused', creditsQuoted: 4 });
    }
    if (url === '/api/generations') {
      generationAttempt += 1;
      const key = options.headers['Idempotency-Key'];
      generationKeys.push(key);
      if (generationAttempt === 1) throw new Error('simulated network drop after submit');
      return jsonResponse({ creation: { id: 'generation-' + generationAttempt, status: 'queued' } });
    }
    if (url.startsWith('/api/generations?id=')) {
      const id = new URL(url, 'https://supdance.test').searchParams.get('id');
      return jsonResponse({
        creation: { id, status: 'succeeded', result_url: '/api/assets/test-result', credit_cost: 4 },
      });
    }
    throw new Error('Unexpected request: ' + url);
  };

  const submit = () => submitPlatformGeneration({
    modelId: 'verified-image-model',
    studioId: 'image',
    prompt: 'a still life',
    parameters: { aspect_ratio: '1:1', resolution: '1024' },
    fetchImpl,
    waitImpl: async () => {},
    maxAttempts: 2,
    idempotencyStorage,
  });

  await assert.rejects(submit(), /simulated network drop after submit/);
  assert.equal(idempotencyStorage.values.size, 1);

  await submit();
  assert.equal(generationKeys.length, 2);
  assert.equal(generationKeys[0], generationKeys[1]);
  assert.equal(quoteKeys[0], quoteKeys[1]);
  assert.equal(idempotencyStorage.values.size, 0);

  await submit();
  assert.equal(generationKeys.length, 3);
  assert.notEqual(generationKeys[1], generationKeys[2]);
});

test('unpriced models do not get a static or generic credit estimate', () => {
  const original = globalThis.__SUPDANCE_MODEL_PRICING_MAP__;
  globalThis.__SUPDANCE_MODEL_PRICING_MAP__ = new Map();

  try {
    assert.deepEqual(priceForIds('seedream-5.0'), { kind: 'missing', credits: null });
    assert.deepEqual(priceForIds('unknown-model-id'), { kind: 'missing', credits: null });
    globalThis.__SUPDANCE_MODEL_PRICING_MAP__.set('server-priced-model', { credits: 7, formula: false });
    assert.deepEqual(priceForIds('server-priced-model'), { kind: 'flat', credits: 7 });
  } finally {
    if (original === undefined) delete globalThis.__SUPDANCE_MODEL_PRICING_MAP__;
    else globalThis.__SUPDANCE_MODEL_PRICING_MAP__ = original;
  }
});
