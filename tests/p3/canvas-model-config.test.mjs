import assert from 'node:assert/strict';
import test from 'node:test';

import { listCanvasModelCandidates, projectCanvasConfig } from '../../lib/services/canvasModelConfig.js';

const emptyMounts = () => ({ image: [], video: [], text: [], audio: [] });

test('Canvas config preserves only an explicitly mounted model default', () => {
  const mountedModelIds = { ...emptyMounts(), image: ['image-a', 'image-b'] };
  const candidates = [
    { id: 'image-a', capability: 'image' },
    { id: 'image-b', capability: 'image' },
  ];

  const valid = projectCanvasConfig({
    mountedModelIds,
    defaults: { imageModelId: 'image-b' },
  }, candidates);
  assert.equal(valid.defaults.imageModelId, 'image-b');

  const missing = projectCanvasConfig({
    mountedModelIds,
    defaults: { imageModelId: '' },
  }, candidates);
  assert.equal(missing.defaults.imageModelId, '');

  const unavailable = projectCanvasConfig({
    mountedModelIds,
    defaults: { imageModelId: 'retired-model' },
  }, candidates);
  assert.equal(unavailable.defaults.imageModelId, '');
});

test('Canvas model candidates require a recent healthy or degraded provider route', async () => {
  const now = Date.parse('2026-10-09T07:00:00Z');
  const rows = [
    { id: 'healthy-image', name: 'Healthy image', category: 'image', credits: 15, health_status: 'healthy', last_health_check_at: new Date(now - 60_000).toISOString() },
    { id: 'degraded-image', name: 'Degraded image', category: 'image', credits: 20, health_status: 'degraded', last_health_check_at: new Date(now - 60_000).toISOString() },
    { id: 'stale-image', name: 'Stale image', category: 'image', credits: 25, health_status: 'healthy', last_health_check_at: new Date(now - 16 * 60_000).toISOString() },
    { id: 'unhealthy-image', name: 'Unhealthy image', category: 'image', credits: 30, health_status: 'unhealthy', last_health_check_at: new Date(now - 60_000).toISOString() },
  ];
  const candidates = await listCanvasModelCandidates({
    query: async () => rows,
    now,
    maxHealthAgeMs: 15 * 60_000,
  });

  assert.deepEqual(candidates.map((model) => model.id), ['healthy-image', 'degraded-image']);
});
