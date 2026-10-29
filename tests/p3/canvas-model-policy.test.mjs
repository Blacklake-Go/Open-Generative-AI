import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  filterCanvasModelsByVerification,
  getCanvasTestOnlyModelIds,
  getCanvasVerifiedModelIdsForUser,
  parseCanvasE2EVerifiedModelIds,
} from '../../lib/canvas/modelPolicy.js';

test('Canvas exposes no model until an E2E-verified model is explicitly configured', () => {
  assert.deepEqual(
    [...filterCanvasModelsByVerification({
      mountedModelIds: ['image-a'],
      candidateModelIds: ['image-a'],
      verifiedModelIds: [],
    })],
    [],
  );
});

test('Canvas model verification must intersect mounted and currently eligible models', () => {
  assert.deepEqual(
    [...filterCanvasModelsByVerification({
      mountedModelIds: ['image-a', 'image-b'],
      candidateModelIds: ['image-a'],
      verifiedModelIds: ['image-a', 'image-b'],
    })],
    ['image-a'],
  );
});

test('verified model environment values are parsed as trimmed comma-separated IDs', () => {
  assert.deepEqual([...parseCanvasE2EVerifiedModelIds(' image-a, ,image-b ')], ['image-a', 'image-b']);
  assert.deepEqual([...parseCanvasE2EVerifiedModelIds(undefined)], []);
});

test('production does not promote route candidates to E2E-verified models by default', () => {
  const service = fs.readFileSync(new URL('../../lib/services/canvasModelConfig.js', import.meta.url), 'utf8');

  assert.match(service, /parseCanvasE2EVerifiedModelIds\(envVerified\)/);
  assert.doesNotMatch(service, /new Set\(candidateModelIds\)/);
  assert.match(service,/verifiedByPublication/);
  assert.match(service,/publicationVerifiedCapabilityVersion === publicCanvasModel/);
});

test('unverified E2E models are exposed only to explicitly configured test users', () => {
  const options = {
    mountedModelIds: ['verified-a', 'test-b', 'test-c'],
    candidateModelIds: ['verified-a', 'test-b'],
    globalVerifiedModelIds: ['verified-a'],
    testUserIds: ['isolated-user'],
    testModelIds: ['test-b', 'test-c'],
  };
  const allowedForTestUser = filterCanvasModelsByVerification({
    ...options,
    verifiedModelIds: getCanvasVerifiedModelIdsForUser({ ...options, userId: 'isolated-user' }),
  });
  const allowedForOtherUser = filterCanvasModelsByVerification({
    ...options,
    verifiedModelIds: getCanvasVerifiedModelIdsForUser({ ...options, userId: 'another-user' }),
  });

  assert.deepEqual([...allowedForTestUser], ['verified-a', 'test-b']);
  assert.deepEqual([...allowedForOtherUser], ['verified-a']);
  assert.deepEqual(
    [...filterCanvasModelsByVerification({
      ...options,
      verifiedModelIds: getCanvasVerifiedModelIdsForUser({ ...options }),
    })],
    ['verified-a'],
  );
});

test('test-only model access works without admin mounts and intersects the live candidate set', () => {
  const options = {
    testUserIds: ['808405'],
    testModelIds: ['seedream-5.0', 'unavailable-model'],
    candidateModelIds: ['seedream-5.0'],
  };
  assert.deepEqual([...getCanvasTestOnlyModelIds({ ...options, userId: '808405' })], ['seedream-5.0']);
  assert.deepEqual([...getCanvasTestOnlyModelIds({ ...options, userId: 'other-user' })], []);
  assert.deepEqual([...getCanvasTestOnlyModelIds({ ...options, userId: '' })], []);
  assert.deepEqual([...getCanvasTestOnlyModelIds({ ...options, candidateModelIds: [], userId: '808405' })], []);
});

test('model, quote, and job APIs all enforce the same server-side verified-model allowlist', () => {
  const service = fs.readFileSync(new URL('../../lib/services/canvasModelConfig.js', import.meta.url), 'utf8');
  const models = fs.readFileSync(new URL('../../app/api/canvas/models/route.js', import.meta.url), 'utf8');
  const quotes = fs.readFileSync(new URL('../../app/api/canvas/quotes/route.js', import.meta.url), 'utf8');
  const jobs = fs.readFileSync(new URL('../../app/api/canvas/jobs/route.js', import.meta.url), 'utf8');

  assert.match(service, /CANVAS_E2E_VERIFIED_MODEL_IDS/);
  assert.match(service, /CANVAS_E2E_TEST_USER_IDS/);
  assert.match(service, /CANVAS_E2E_TEST_MODEL_IDS/);
  assert.match(service, /filterCanvasModelsByVerification/);
  assert.match(service, /getCanvasTestOnlyModelIds/);
  assert.match(models, /getCanvasAllowedModelIds\(\{ userId: user\.id \}\)/);
  assert.match(models, /allowed\.has\(model\.id\)/);
  assert.match(quotes, /getCanvasAllowedModelIds\(\{ userId: user\.id \}\)/);
  assert.match(quotes, /if \(!allowed\.has\(modelId\)\)/);
  assert.match(jobs, /getCanvasAllowedModelIds\(\{ userId: user\.id \}\)/);
  assert.match(jobs, /if \(!allowed\.has\(modelId\)\)/);
});

test('Canvas config hides test-only mounts and defaults from other accounts', () => {
  const config = fs.readFileSync(new URL('../../app/api/canvas/config/route.js', import.meta.url), 'utf8');

  assert.match(config, /getCanvasAllowedModelIds\(\{ userId: user\.id \}\)/);
  assert.match(config, /projected\.mountedModelIds\[capability\]\.filter\(\(id\) => allowedModelIds\.has\(id\)\)/);
  assert.match(config, /if \(!allowedModelIds\.has\(projected\.defaults\[defaultKey\]\)\) projected\.defaults\[defaultKey\] = ''/);
});

test('Canvas quote entitlement failures fail closed instead of pricing as Free', () => {
  const quotes = fs.readFileSync(new URL('../../app/api/canvas/quotes/route.js', import.meta.url), 'utf8');

  assert.match(quotes, /const subscription = await getActiveSubscription\(user\.id\);/);
  assert.doesNotMatch(quotes, /getActiveSubscription\(user\.id\)\.catch/);
  assert.match(quotes, /: 503;/);
  assert.match(quotes, /publicErrorPayload\(error, '暂时无法确认可靠报价，请稍后重试', 'QUOTE_FAILED'\)/);
});
