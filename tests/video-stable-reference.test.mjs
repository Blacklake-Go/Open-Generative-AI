import test from 'node:test';
import assert from 'node:assert/strict';
import { getI2VModelById } from '../packages/studio/src/models.js';
import { mapReferenceParams } from '../packages/studio/src/modelCapabilities.js';
import { resolveCanvasOwnedAssetReferences } from '../lib/services/canvasAssetReferences.js';

test('Kling image-to-video preserves a stable reference and resolves it for the owner', async () => {
  const reference = '/api/assets/asset_12345678/download?inline=1';
  const parameters = mapReferenceParams(getI2VModelById('kling-v3.0-pro-image-to-video'), { image_url: reference });
  assert.equal(parameters.image_url, reference);
  const options = {
    userId: 'owner',
    getUserAssetDownload: async (user, id) => user === 'owner' && id === 'asset_12345678'
      ? { objectKey: 'private/image.png', visibility: 'private' } : null,
    getAssetUrl: async () => 'https://storage.example/image.png?signature=fresh',
    providerId: 'muapi',
  };
  assert.equal((await resolveCanvasOwnedAssetReferences(parameters, options)).image_url, 'https://storage.example/image.png?signature=fresh');
  await assert.rejects(resolveCanvasOwnedAssetReferences(parameters, { ...options, userId: 'other' }), { code: 'CANVAS_ASSET_URL_UNAVAILABLE' });
});
