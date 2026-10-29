import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveCanvasAssetReferences,
  resolveCanvasOwnedAssetReferences,
} from '../../lib/services/canvasAssetReferences.js';

test('resolves nested Canvas asset references using the supplied owner-scoped resolver', async () => {
  const requested = [];
  const input = { image: 'koyo-asset:asset_12345678', refs: ['koyo-asset:asset_abcdefgh'] };

  const result = await resolveCanvasAssetReferences(input, async (assetId) => {
    requested.push(assetId);
    return `https://private-assets.example/${assetId}`;
  });

  assert.deepEqual(requested, ['asset_12345678', 'asset_abcdefgh']);
  assert.deepEqual(result, {
    image: 'https://private-assets.example/asset_12345678',
    refs: ['https://private-assets.example/asset_abcdefgh'],
  });
  assert.equal(input.image, 'koyo-asset:asset_12345678');
});

test('rejects malformed asset identifiers without resolving them', async () => {
  let calls = 0;
  await assert.rejects(
    resolveCanvasAssetReferences({ image: 'koyo-asset:../../private' }, async () => {
      calls++;
      return 'https://private-assets.example/file';
    }),
    { code: 'CANVAS_ASSET_REFERENCE_INVALID' },
  );
  assert.equal(calls, 0);
});

test('rejects references that cannot be converted into HTTPS provider input', async () => {
  await assert.rejects(
    resolveCanvasAssetReferences('koyo-asset:asset_12345678', async () => 'http://public.example/file'),
    { code: 'CANVAS_ASSET_URL_UNAVAILABLE' },
  );
});

test('Canvas provider references use the job owner, object key, visibility, and HTTPS URL resolver', async () => {
  const lookups = [];
  const signed = [];
  const result = await resolveCanvasOwnedAssetReferences({
    image: 'koyo-asset:asset_12345678',
    references: ['koyo-asset:asset_abcdefgh'],
  }, {
    userId: 'canvas-owner-1',
    async getUserAssetDownload(userId, assetId) {
      lookups.push({ userId, assetId });
      return {
        objectKey: `private/${assetId}.webp`,
        visibility: 'private',
      };
    },
    async getAssetUrl(input) {
      signed.push(input);
      return `https://assets.example/${encodeURIComponent(input.objectKey)}?visibility=${input.visibility}`;
    },
  });

  assert.deepEqual(lookups, [
    { userId: 'canvas-owner-1', assetId: 'asset_12345678' },
    { userId: 'canvas-owner-1', assetId: 'asset_abcdefgh' },
  ]);
  assert.deepEqual(signed, [
    { provider: null, locationId: null, bucket: null, region: null, objectKey: 'private/asset_12345678.webp', visibility: 'private' },
    { provider: null, locationId: null, bucket: null, region: null, objectKey: 'private/asset_abcdefgh.webp', visibility: 'private' },
  ]);
  assert.deepEqual(result, {
    image: 'https://assets.example/private%2Fasset_12345678.webp?visibility=private',
    references: ['https://assets.example/private%2Fasset_abcdefgh.webp?visibility=private'],
  });
});

test('Volcengine receives owned Canvas image bytes as a data URI without fetching the public URL', async () => {
  const body = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const resolved = await resolveCanvasOwnedAssetReferences({ image: 'koyo-asset:asset_12345678' }, {
    userId: 'canvas-owner-1',
    providerId: 'volcengine',
    async getUserAssetDownload(userId, assetId) {
      assert.equal(userId, 'canvas-owner-1');
      assert.equal(assetId, 'asset_12345678');
      return { objectKey: 'private/input.jpg', mimeType: 'image/jpeg', sizeBytes: body.length };
    },
    async getAssetBytes(objectKey) {
      assert.equal(objectKey, 'private/input.jpg');
      return { body };
    },
    async getAssetUrl() {
      assert.fail('Volcengine must not depend on the public asset URL');
    },
  });
  assert.deepEqual(resolved, { image: `data:image/jpeg;base64,${body.toString('base64')}` });
});

test('Volcengine rejects oversized Canvas references before reading their bytes', async () => {
  await assert.rejects(resolveCanvasOwnedAssetReferences('koyo-asset:asset_12345678', {
    userId: 'canvas-owner-1',
    providerId: 'volcengine',
    async getUserAssetDownload() {
      return { objectKey: 'private/large.jpg', mimeType: 'image/jpeg', sizeBytes: 30 * 1024 * 1024 + 1 };
    },
    async getAssetBytes() {
      assert.fail('An oversized asset must not be downloaded into worker memory');
    },
    async getAssetUrl() {
      assert.fail('An oversized asset must not be exposed as a URL');
    },
  }), { code: 'CANVAS_ASSET_URL_UNAVAILABLE' });
});

test('Canvas provider references fail closed for missing owner-scoped or deleted assets', async () => {
  await assert.rejects(
    resolveCanvasOwnedAssetReferences('koyo-asset:asset_12345678', {
      userId: 'canvas-owner-1',
      async getUserAssetDownload(userId) {
        assert.equal(userId, 'canvas-owner-1');
        return null;
      },
      async getAssetUrl() {
        assert.fail('A missing asset must not be signed.');
      },
    }),
    { code: 'CANVAS_ASSET_URL_UNAVAILABLE' },
  );

  await assert.rejects(
    resolveCanvasOwnedAssetReferences('koyo-asset:asset_12345678', {
      userId: 'canvas-owner-1',
      async getUserAssetDownload() {
        return { objectKey: 'private/deleted.webp', deletedAt: '2026-10-09T00:00:00Z' };
      },
      async getAssetUrl() {
        assert.fail('A deleted asset must not be signed.');
      },
    }),
    { code: 'CANVAS_ASSET_URL_UNAVAILABLE' },
  );
});

test('Studio asset URLs are resolved for the owner and reject another user', async () => {
  const resolve = (userId) => resolveCanvasOwnedAssetReferences({ image_url: '/api/assets/asset_12345678/download?inline=1' }, {
    userId,
    getUserAssetDownload: async (owner) => owner === 'owner' ? { objectKey: 'private/image.png' } : null,
    getAssetUrl: async () => 'https://storage.example/fresh-signature',
  });
  assert.deepEqual(await resolve('owner'), { image_url: 'https://storage.example/fresh-signature' });
  await assert.rejects(resolve('another-user'), { code: 'CANVAS_ASSET_URL_UNAVAILABLE' });
});

test('Canvas provider references never treat a stored URL or unsafe path as a storage object key', async () => {
  for (const objectKey of [
    'https://external.example/private/user-file.webp',
    '/private/user-file.webp',
    'private\\user-file.webp',
    'private/../user-file.webp',
  ]) {
    await assert.rejects(
      resolveCanvasOwnedAssetReferences('koyo-asset:asset_12345678', {
        userId: 'canvas-owner-1',
        async getUserAssetDownload() {
          return { objectKey, visibility: 'private' };
        },
        async getAssetUrl() {
          assert.fail(`Unsafe key must not reach the storage URL signer: ${objectKey}`);
        },
      }),
      { code: 'CANVAS_ASSET_URL_UNAVAILABLE' },
    );
  }
});
