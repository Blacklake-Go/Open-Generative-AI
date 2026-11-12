import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_AVAILABILITY_REASON as REASON,
  evaluateModelAvailability,
  isModelAvailable,
  modelAvailabilityChecks,
} from '../lib/modelCenter/availability.js';
import { isSelectablePublicModel, selectPublicModels } from '../lib/modelCenter/publicDirectory.js';
import { publicCanvasModel } from '../lib/canvas/modelDescriptor.js';

const ready = {
  id: 'ready-image',
  name: 'Ready image',
  category: 'image',
  type: 'image',
  tier: 'core',
  is_active: true,
  is_visible: true,
  auto_route_eligible: true,
  hasWorkingRoute: true,
  credits_price: 15,
  metadata_json: {},
};

const failedCodes = (model, options) => evaluateModelAvailability(model, options).reasonCodes;

test('a fully published model passes every admission check', () => {
  const result = evaluateModelAvailability(ready);
  assert.equal(result.available, true);
  assert.equal(result.state, 'enabled');
  assert.deepEqual(result.reasonCodes, []);
  assert.deepEqual(result.reasons, []);
  assert.equal(isModelAvailable(ready), true);
  assert.equal(isSelectablePublicModel(ready), true);
  const checks = modelAvailabilityChecks(ready);
  assert.ok(checks.length > 0);
  assert.ok(checks.every((check) => check.ok === true && typeof check.message === 'string' && check.message.length > 0));
});

test('each admission rule reports its own reason code', () => {
  assert.deepEqual(failedCodes(null), [REASON.NOT_FOUND]);
  assert.deepEqual(failedCodes({ ...ready, is_active: false }), [REASON.INACTIVE]);
  assert.deepEqual(failedCodes({ ...ready, is_visible: false }), [REASON.HIDDEN]);
  assert.deepEqual(failedCodes({ ...ready, tier: 'backup' }), [REASON.TIER_RESTRICTED]);
  assert.deepEqual(failedCodes({ ...ready, auto_route_eligible: false }), [REASON.NOT_ROUTABLE]);
  assert.deepEqual(failedCodes({ ...ready, hasWorkingRoute: false }), [REASON.NO_VERIFIED_ROUTE]);
  for (const credits_price of [0, null, undefined, '', 'free', -5]) {
    assert.deepEqual(failedCodes({ ...ready, credits_price }), [REASON.PRICE_MISSING], `credits_price=${String(credits_price)}`);
  }
  assert.deepEqual(failedCodes({ ...ready, credits_price: '12' }), [], 'numeric strings are accepted like the legacy rule');
});

test('multiple failures keep a deterministic order and expose readable reasons', () => {
  const result = evaluateModelAvailability({ ...ready, is_active: false, is_visible: false, credits_price: 0 });
  assert.equal(result.available, false);
  assert.equal(result.state, 'disabled');
  assert.deepEqual(result.reasonCodes, [REASON.INACTIVE, REASON.HIDDEN, REASON.PRICE_MISSING]);
  assert.equal(result.reasons.length, 3);
  assert.ok(result.reasons.every((reason) => typeof reason === 'string' && reason.length > 0));
});

test('site publication is only evaluated when a site context is supplied', () => {
  const canvasOnly = { ...ready, metadata_json: { publicationPolicy: { sites: ['canvas'], audience: 'all', userIds: [] } } };
  assert.equal(evaluateModelAvailability(canvasOnly).available, true, 'catalogue evaluation without a site stays client-agnostic');
  assert.deepEqual(failedCodes(canvasOnly, { site: 'main' }), [REASON.SITE_RESTRICTED]);
  assert.equal(evaluateModelAvailability(canvasOnly, { site: 'canvas' }).available, true);
});

test('audience is only evaluated for an identified user', () => {
  const paidOnly = { ...ready, metadata_json: { publicationPolicy: { sites: ['main', 'canvas'], audience: 'paid', userIds: [] } } };
  assert.equal(evaluateModelAvailability(paidOnly).available, true, 'anonymous catalogue rows are filtered by the caller, not by a fake user');
  assert.deepEqual(failedCodes(paidOnly, { userId: 'user-1' }), [REASON.AUDIENCE_RESTRICTED]);
  assert.equal(evaluateModelAvailability(paidOnly, { userId: 'user-1', isPaid: true }).available, true);

  const allowlisted = { ...ready, metadata_json: { publicationPolicy: { sites: ['main'], audience: 'allowlist', userIds: ['42'] } } };
  assert.equal(evaluateModelAvailability(allowlisted, { userId: '42' }).available, true);
  assert.deepEqual(failedCodes(allowlisted, { userId: '43' }), [REASON.AUDIENCE_RESTRICTED]);
});

test('the shared admission rule keeps the legacy directory outcome', () => {
  const legacyCases = [
    {}, { ...ready }, { ...ready, is_active: false }, { ...ready, is_visible: false },
    { ...ready, tier: 'backup' }, { ...ready, auto_route_eligible: false },
    { ...ready, hasWorkingRoute: false }, { ...ready, credits_price: 0 }, { ...ready, credits_price: '12' },
  ];
  for (const model of legacyCases) {
    assert.equal(isSelectablePublicModel(model), evaluateModelAvailability(model).available);
  }
});

test('selectPublicModels keeps category and main-site publication filtering', () => {
  const published = { ...ready, id: 'main-image' };
  const canvasOnly = { ...ready, id: 'canvas-image', metadata_json: { publicationPolicy: { sites: ['canvas'], audience: 'all', userIds: [] } } };
  const video = { ...ready, id: 'main-video', category: 'video' };
  const selected = selectPublicModels([published, canvasOnly, video], 'image');
  assert.deepEqual(selected.map((model) => model.id), ['main-image']);
});

test('canvas descriptors expose the shared availability reasons', () => {
  const enabled = publicCanvasModel(ready);
  assert.equal(enabled.available, true);
  assert.deepEqual(enabled.availability, { state: 'enabled', reasonCodes: [], reasons: [] });

  const unpriced = publicCanvasModel({ ...ready, credits_price: 0 });
  assert.equal(unpriced.available, false);
  assert.equal(unpriced.availability.state, 'disabled');
  assert.deepEqual(unpriced.availability.reasonCodes, [REASON.PRICE_MISSING]);
  assert.match(unpriced.availability.reasons[0], /价格/);

  const unrouted = publicCanvasModel({ ...ready, hasWorkingRoute: false });
  assert.deepEqual(unrouted.availability.reasonCodes, [REASON.NO_VERIFIED_ROUTE]);
  assert.match(unrouted.availability.reasons[0], /线路/);
});
