import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { generateStorageVariants } from '../../lib/storage/storageService.js';

test('sharp creates preview and thumbnail WebP variants with the pinned native runtime', async () => {
  const sourceImage = await sharp({
    create: { width: 32, height: 24, channels: 4, background: { r: 180, g: 70, b: 40, alpha: 1 } },
  }).png().toBuffer();
  const uploaded = [];
  const storage = {
    async download({ key }) {
      assert.equal(key, 'user-1/images/original.png');
      return { body: sourceImage };
    },
    async upload(object) { uploaded.push(object); },
    async delete() {},
  };

  const result = await generateStorageVariants({
    storage,
    objectKey: 'user-1/images/original.png',
    type: 'image',
    mimeType: 'image/png',
  });

  assert.equal(result.variantStatus, 'ready');
  assert.equal(result.width, 32);
  assert.equal(result.height, 24);
  assert.deepEqual(uploaded.map(({ key }) => key), [
    'user-1/images/preview/original.webp',
    'user-1/images/thumbnail/original.webp',
  ]);
  for (const object of uploaded) {
    assert.equal(object.contentType, 'image/webp');
    assert.equal(object.size, object.body.length);
    assert.equal((await sharp(object.body).metadata()).format, 'webp');
  }
});
