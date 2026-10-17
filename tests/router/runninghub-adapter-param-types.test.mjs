import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';

try {
  register('../../scripts/server-only-loader.mjs', import.meta.url);
} catch {}

const { RunningHubAdapter } = await import('../../lib/adapters/RunningHubAdapter.js');

test('RunningHub uses mapping-local LIST parameters and preserves string option values', async () => {
  const originalFetch = globalThis.fetch;
  let requestPayload;

  globalThis.fetch = async (_input, init) => {
    requestPayload = JSON.parse(init.body);
    return new Response(JSON.stringify({ taskId: 'unit-test-task' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const adapter = new RunningHubAdapter({ apiKey: 'unit-test-only' });

    const result = await adapter.createTask({
      providerModelId: 'openapi/v2/minimax/hailuo-2.3/t2v-standard',
      providerEndpoint: '/openapi/v2/minimax/hailuo-2.3/t2v-standard',
      prompt: 'unit test only',
      endpointConfig: {
        params: [
          { fieldKey: 'prompt', type: 'STRING', required: true },
          { fieldKey: 'duration', type: 'LIST', required: true, defaultValue: '6', options: [{ value: '6' }, { value: '10' }] },
          { fieldKey: 'enablePromptExpansion', type: 'BOOLEAN', required: true, defaultValue: true },
        ],
      },
      parameters: { duration: 10, enablePromptExpansion: true },
    });

    assert.equal(requestPayload.prompt, 'unit test only');
    assert.equal(requestPayload.duration, '10');
    assert.equal(typeof requestPayload.duration, 'string');
    assert.equal(requestPayload.enablePromptExpansion, true);
    assert.equal(result.status, 'processing');
    assert.equal(result.providerRequestId, 'unit-test-task');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
