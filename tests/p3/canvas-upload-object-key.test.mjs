import test from 'node:test';
import assert from 'node:assert/strict';

import { assertCanvasUploadObjectKey } from '../../lib/storage/objectKeyPolicy.js';

const userId = 'user_123';
const validKey = `uploads/${userId}/canvas/${'a'.repeat(64)}-${'b'.repeat(64)}.bin`;

test('accepts deterministic Canvas upload keys scoped to the requesting user', () => {
  assert.equal(assertCanvasUploadObjectKey(validKey, userId), validKey);
});

test('rejects object keys belonging to another user', () => {
  assert.throws(() => assertCanvasUploadObjectKey(validKey, 'user_456'), { code: 'STORAGE_OBJECT_KEY_INVALID' });
});

test('rejects traversal, unexpected folders, and malformed content digests', () => {
  for (const key of [
    `uploads/${userId}/canvas/../${'b'.repeat(64)}.bin`,
    `uploads/${userId}/other/${'a'.repeat(64)}-${'b'.repeat(64)}.bin`,
    `uploads/${userId}/canvas/${'a'.repeat(63)}-${'b'.repeat(64)}.bin`,
    `uploads/${userId}/canvas/${'a'.repeat(64)}-${'b'.repeat(64)}.bin/extra`,
  ]) {
    assert.throws(() => assertCanvasUploadObjectKey(key, userId), { code: 'STORAGE_OBJECT_KEY_INVALID' });
  }
});
