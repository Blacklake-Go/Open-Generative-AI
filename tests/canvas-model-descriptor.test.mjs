import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCanvasModel, canvasCatalogVersion } from '../lib/canvas/modelDescriptor.js';

const model = { id: 'fixture-image', name: 'Fixture', type: 'image', tier: 'core', is_active: true, is_visible: true, auto_route_eligible: true, hasWorkingRoute: true, credits_price: 15,
  metadata_json: { input_schema: { type: 'object', properties: { size: { type: 'string', enum: ['1k', '2k'] } }, required: ['size'] }, api_key: 'must-never-be-published', supports_reference: true } };

test('published model descriptors are versioned and disclose only public capability fields', () => {
  const descriptor = publicCanvasModel(model);
  assert.equal(descriptor.available, true);
  assert.equal(descriptor.schemaVersion, 1);
  assert.equal(descriptor.availability.state, 'enabled');
  assert.deepEqual(descriptor.inputSchema.properties.size.enum, ['1k', '2k']);
  assert.doesNotMatch(JSON.stringify(descriptor), /must-never|api_key/);
  assert.equal(descriptor.capabilityVersion, publicCanvasModel(model).capabilityVersion);
});

test('capability versions change on parameters; catalogue versions also change on price', () => {
  const original = publicCanvasModel(model);
  const repriced = publicCanvasModel({ ...model, credits_price: 20 });
  assert.equal(original.capabilityVersion, repriced.capabilityVersion);
  assert.notEqual(canvasCatalogVersion([original]), canvasCatalogVersion([repriced]));
  const updated = publicCanvasModel({ ...model, metadata_json: { ...model.metadata_json, supports_reference: false } });
  assert.notEqual(original.capabilityVersion, updated.capabilityVersion);
  const disabled = publicCanvasModel({ ...model, hasWorkingRoute: false });
  assert.equal(disabled.available, false);
  assert.deepEqual(disabled.availability.reasonCodes, ['NO_VERIFIED_ROUTE']);
});
