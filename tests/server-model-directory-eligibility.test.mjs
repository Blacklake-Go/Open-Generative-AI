import test from 'node:test';
import assert from 'node:assert/strict';
import { applyActiveModelDirectory, isServerModelGenerationEligible, t2iModels } from '../packages/studio/src/models.js';

const readyModel = {
  id: 'seedream-5.0',
  isActive: true,
  isVisible: true,
  autoRouteEligible: true,
  hasWorkingRoute: true,
  creditsPrice: 8,
};

test('server model directory requires a healthy route and a published price', () => {
  assert.equal(isServerModelGenerationEligible(readyModel), true);

  for (const patch of [
    { hasWorkingRoute: undefined },
    { hasWorkingRoute: false },
    { autoRouteEligible: undefined },
    { autoRouteEligible: false },
    { isActive: false },
    { isVisible: false },
    { creditsPrice: 0 },
    { creditsPrice: null },
    { creditsPrice: Number.NaN },
  ]) {
    assert.equal(
      isServerModelGenerationEligible({ ...readyModel, ...patch }),
      false,
      `must reject ${JSON.stringify(patch)}`,
    );
  }
});

test('directory refresh removes and restores a previously listed model', () => {
  const modelId = t2iModels[0]?.id;
  assert.ok(modelId);
  const row = { ...readyModel, id: modelId };
  assert.equal(applyActiveModelDirectory([row]).activeCount, 1);
  assert.ok(t2iModels.some((model) => model.id === modelId));
  assert.equal(applyActiveModelDirectory([]).activeCount, 0);
  assert.ok(!t2iModels.some((model) => model.id === modelId));
  assert.equal(applyActiveModelDirectory([row]).activeCount, 1);
  assert.ok(t2iModels.some((model) => model.id === modelId));
});
