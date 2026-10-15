import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMuapiEstimatePayload } from '../lib/adapters/muapiModelContracts.js';

test('dynamic MuAPI estimate payload keeps image dimensions and excludes client-only data', () => {
  const payload = buildMuapiEstimatePayload({
    prompt: 'private prompt should not be sent to estimate',
    width: 512,
    height: 768,
    num_images: 1,
    image_url: 'https://private.example/image.png',
    api_key: 'must-not-be-forwarded',
  }, 'flux-schnell');

  assert.deepEqual(payload, {
    prompt: '',
    num_images: 1,
    width: 512,
    height: 768,
  });
});
