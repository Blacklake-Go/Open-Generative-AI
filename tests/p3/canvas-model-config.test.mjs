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

test('Canvas candidates use the same published and orderable model admission as the main site', async () => {
  const published = { id: 'ready-image', name: 'Ready image', type: 'image', credits_price: 15, tier: 'core', is_active: true, is_visible: true, auto_route_eligible: true, hasWorkingRoute: true };
  const candidates = await listCanvasModelCandidates({
    listModels: async () => [published,
      { ...published, id: 'missing-route', hasWorkingRoute: false },
      { ...published, id: 'hidden', is_visible: false },
      { ...published, id: 'unpriced', credits_price: 0 },
      { ...published, id: 'backup', tier: 'backup' },
      { ...published, id: 'not-published', auto_route_eligible: false },
    ],
  });
  assert.deepEqual(candidates.map((model) => model.id), ['ready-image']);
  assert.equal(candidates[0].credits, 15);
});
