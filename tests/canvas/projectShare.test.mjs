import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectCanvasShareAssetIds,
  createCanvasShareToken,
  hashCanvasShareToken,
  isCanvasShareToken,
  rewriteCanvasShareAssetUrls,
} from '../../lib/canvas/projectShare.js';

test('canvas share tokens are random URL-safe values and only hashes are persisted', () => {
  const first = createCanvasShareToken();
  const second = createCanvasShareToken();
  assert.equal(isCanvasShareToken(first), true);
  assert.notEqual(first, second);
  assert.equal(hashCanvasShareToken(first).length, 64);
  assert.notEqual(hashCanvasShareToken(first), first);
  assert.equal(isCanvasShareToken('short-token'), false);
});

test('shared asset URLs are limited to IDs referenced by the shared snapshot', () => {
  const snapshot = {
    nodes: [
      { data: { assetId: 'asset_1', contentUrl: '/api/canvas/assets/asset_1/content' } },
      { data: { storageKey: 'koyo-asset:asset_2' } },
      { data: { url: 'https://www.supdance.com/api/canvas/assets/asset_3/content?preview=1' } },
    ],
  };
  assert.deepEqual([...collectCanvasShareAssetIds(snapshot)].sort(), ['asset_1', 'asset_2', 'asset_3']);
  assert.deepEqual(rewriteCanvasShareAssetUrls(snapshot, 'a'.repeat(43)), {
    nodes: [
      { data: { assetId: 'asset_1', contentUrl: `/api/canvas/shares/${'a'.repeat(43)}/assets/asset_1/content` } },
      { data: { storageKey: 'koyo-asset:asset_2' } },
      { data: { url: `/api/canvas/shares/${'a'.repeat(43)}/assets/asset_3/content?preview=1` } },
    ],
  });
});
