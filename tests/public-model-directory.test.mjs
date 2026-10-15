import test from 'node:test';
import assert from 'node:assert/strict';
import { isSelectablePublicModel, selectPublicModels, serializePublicAppModel, serializePublicGenerationCapabilities } from '../lib/modelCenter/publicDirectory.js';
import { projectReadyRouteCapabilities } from '../lib/modelCenter/publicCapabilities.js';

const ready = {
  id: 'reviewed-image', category: 'image', tier: 'core',
  is_active: true, is_visible: true, auto_route_eligible: true,
  hasWorkingRoute: true, credits_price: 12,
};

test('public directories include only positively priced, active, routable models', () => {
  const rows = [ready,
    { ...ready, id: 'missing-price', credits_price: null },
    { ...ready, id: 'hidden', is_visible: false },
    { ...ready, id: 'pending-route', auto_route_eligible: false },
    { ...ready, id: 'unhealthy', hasWorkingRoute: false },
    { ...ready, id: 'testing', is_active: false },
    { ...ready, id: 'backup', tier: 'backup' },
    { ...ready, id: 'video', category: 'video' },
  ];
  assert.deepEqual(selectPublicModels(rows, 'image').map((row) => row.id), ['reviewed-image']);
  assert.deepEqual(selectPublicModels(rows, 'video').map((row) => row.id), ['video']);
  assert.equal(isSelectablePublicModel({ ...ready, credits_price: 0 }), false);
  assert.equal(isSelectablePublicModel({ ...ready, credits_price: '12' }), true);
});

test('public app models expose only reviewed generation capabilities, never route internals', () => {
  const model = serializePublicAppModel({
    id: 'reviewed-video',
    name: 'Reviewed Video',
    category: 'video',
    generation_capabilities: [{
      taskType: 't2v',
      inputTypes: ['text'],
      outputTypes: ['video'],
      aspectRatios: ['16:9', '9:16'],
      resolutions: ['720p'],
      durations: [5, 10],
      qualities: ['standard'],
      parameters: ['generate_audio'],
      providerEndpoint: 'must-not-be-exposed',
      apiKey: 'must-not-be-exposed',
    }],
  });

  assert.deepEqual(model.generationCapabilities, [{
    taskType: 't2v',
    inputTypes: ['text'],
    outputTypes: ['video'],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p'],
    durations: [5, 10],
    qualities: ['standard'],
    parameters: ['generate_audio'],
  }]);
  assert.equal(JSON.stringify(model).includes('must-not-be-exposed'), false);
});

test('active-model metadata exposes sanitized route capabilities for creator controls', () => {
  const capabilities = serializePublicGenerationCapabilities([{
    taskType: 't2v',
    inputTypes: ['text'],
    outputTypes: ['video'],
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
    durations: [5],
    qualities: ['standard'],
    parameters: [],
    endpoint: 'private-endpoint',
    credential: 'private-credential',
  }]);

  assert.deepEqual(capabilities, [{
    taskType: 't2v',
    inputTypes: ['text'],
    outputTypes: ['video'],
    aspectRatios: ['16:9'],
    resolutions: ['720p'],
    durations: [5],
    qualities: ['standard'],
    parameters: [],
  }]);
  assert.equal(JSON.stringify(capabilities).includes('private-'), false);
});

test('public app directory never invents a credit price when the server model has no configured price', () => {
  const model = serializePublicAppModel({
    id: 'unpriced-video',
    name: 'Unpriced Video',
    category: 'video',
    base_credits: null,
    site_price_cny: null,
  });

  assert.equal(model.credits, null);
  assert.equal(model.startingCredits, null);
  assert.equal(model.quoteRequired, true);
  assert.equal(model.creditsAreQuote, false);
  assert.equal(JSON.stringify(model).includes('100'), false);
});

test('public app serialization drops the production legacy 100-credit fallback', () => {
  const model = serializePublicAppModel({
    id: 'legacy-video',
    name: 'Legacy video',
    category: 'video',
    credits: 100,
    priceCny: null,
  });

  assert.equal(model.credits, null);
  assert.equal(model.startingCredits, null);
  assert.equal(model.priceCny, null);
  assert.equal(JSON.stringify(model).includes('100'), false);
});

test('public capabilities merge only task types with explicit compatible inputs and outputs', () => {
  const capabilities = projectReadyRouteCapabilities([
    {
      supported_task_types: ['text-to-video', 'i2v'],
      supported_resolutions: ['720p'],
      supported_durations: [5, 10],
      supported_qualities: ['standard'],
      mapping_capabilities: {
        input_types: ['text'],
        output_types: ['video'],
        aspect_ratios: ['16:9', '9:16'],
        parameters: ['generate_audio'],
      },
    },
    {
      supported_task_types: ['t2v'],
      supported_resolutions: ['1080p'],
      supported_qualities: ['high'],
      mapping_capabilities: {
        input_types: ['text'],
        output_types: ['video'],
        durations: [8],
      },
    },
    {
      supported_task_types: ['t2v'],
      mapping_capabilities: { output_types: ['video'] },
    },
  ]);

  assert.deepEqual(capabilities, [{
    taskType: 't2v',
    inputTypes: ['text'],
    outputTypes: ['video'],
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p', '1080p'],
    durations: [5, 10, 8],
    qualities: ['standard', 'high'],
    parameters: ['generate_audio'],
  }]);
});

test('production-shaped reviewed video route metadata projects only declared controls', () => {
  const kling = projectReadyRouteCapabilities([{
    supported_task_types: ['t2v', 'i2v'],
    supported_resolutions: [],
    supported_durations: [],
    mapping_capabilities: {
      input_types: ['text', 'image'],
      output_types: ['video'],
      supported_aspect_ratios: ['16:9', '9:16', '1:1'],
    },
  }]);
  assert.deepEqual(kling, [
    {
      taskType: 't2v', inputTypes: ['text'], outputTypes: ['video'],
      aspectRatios: ['16:9', '9:16', '1:1'], resolutions: [], durations: [],
      qualities: [],
      parameters: [],
    },
    {
      taskType: 'i2v', inputTypes: ['image'], outputTypes: ['video'],
      aspectRatios: ['16:9', '9:16', '1:1'], resolutions: [], durations: [],
      qualities: [],
      parameters: [],
    },
  ]);

  const seedance = projectReadyRouteCapabilities([{
    supported_task_types: ['t2v'],
    supported_resolutions: ['720p'],
    supported_durations: [4, 5, 10, 15],
    mapping_capabilities: {
      input_types: ['text'],
      output_types: ['video'],
      supported_aspect_ratios: ['16:9', '9:16'],
    },
  }, {
    // A reviewed mapping with no capability declaration adds no guessed controls.
    supported_task_types: [],
    supported_resolutions: [],
    supported_durations: [],
    mapping_capabilities: {},
  }]);
  assert.deepEqual(seedance, [{
    taskType: 't2v', inputTypes: ['text'], outputTypes: ['video'],
    aspectRatios: ['16:9', '9:16'], resolutions: ['720p'], durations: [4, 5, 10, 15],
    qualities: [],
    parameters: [],
  }]);
});
