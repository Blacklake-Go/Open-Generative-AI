import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalPipeline } from '../lib/ai/core/pipeline.ts';

test('CanonicalGenerationPipeline: validates user authentication', async () => {
  await assert.rejects(
    async () => {
      await canonicalPipeline.execute({
        user: null,
        modelId: 'kling-video-2-6',
        prompt: 'test prompt',
        parameters: {},
        quoteId: 'q-123',
        idempotencyKey: 'idemp-12345678',
        source: 'studio',
      });
    },
    { code: 'UNAUTHENTICATED' }
  );
});

test('CanonicalGenerationPipeline: enforces modelId and quoteId presence', async () => {
  await assert.rejects(
    async () => {
      await canonicalPipeline.execute({
        user: { id: 'usr-1' },
        modelId: '',
        prompt: 'test prompt',
        parameters: {},
        quoteId: 'q-123',
        idempotencyKey: 'idemp-12345678',
        source: 'studio',
      });
    },
    { code: 'MODEL_ID_REQUIRED' }
  );

  await assert.rejects(
    async () => {
      await canonicalPipeline.execute({
        user: { id: 'usr-1' },
        modelId: 'kling-video-2-6',
        prompt: 'test prompt',
        parameters: {},
        quoteId: '',
        idempotencyKey: 'idemp-12345678',
        source: 'studio',
      });
    },
    { code: 'QUOTE_REQUIRED' }
  );
});
