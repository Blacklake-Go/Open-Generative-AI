import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';

import { AmhStorageAdapter } from '../../lib/storage/amhStorageAdapter.js';
import {
  StorageService,
  buildObjectKey,
  ingestBuffer,
  ingestRemoteFile,
  getAssetUrl,
  testStorageConnection,
} from '../../lib/storage/storageService.js';

test('AmhStorageAdapter - basic CRUD and security path validation', async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'amh-storage-test-'));
  const adapter = new AmhStorageAdapter({
    storageDir: tempDir,
    publicUrlPrefix: '/uploads',
  });

  try {
    // 1. Security check: path traversal attempts must throw
    assert.throws(
      () => adapter.resolvePath('../../../etc/passwd'),
      (err) => err.code === 'STORAGE_OBJECT_KEY_INVALID' || err.code === 'STORAGE_OBJECT_PATH_OUT_OF_BOUNDS',
      'Path traversal attempt must be rejected'
    );
    assert.throws(
      () => adapter.resolvePath('images/../../secret.txt'),
      (err) => err.code === 'STORAGE_OBJECT_KEY_INVALID' || err.code === 'STORAGE_OBJECT_PATH_OUT_OF_BOUNDS',
      'Relative path traversal must be rejected'
    );

    // 2. Upload
    const content = Buffer.from('hello amh storage');
    const uploadResult = await adapter.upload({
      key: 'images/2026/09/test.txt',
      body: content,
      contentType: 'text/plain',
    });
    assert.equal(uploadResult.provider, 'amh');
    assert.equal(uploadResult.key, 'images/2026/09/test.txt');
    assert.equal(uploadResult.size, content.length);
    assert.equal(uploadResult.location, '/uploads/images/2026/09/test.txt');

    // 3. Exists
    assert.equal(await adapter.exists({ key: 'images/2026/09/test.txt' }), true);
    assert.equal(await adapter.exists({ key: 'images/non-existent.txt' }), false);

    // 4. Download
    const downloadResult = await adapter.download({ key: 'images/2026/09/test.txt' });
    assert.deepEqual(downloadResult.body, content);

    // 5. Metadata
    const metadata = await adapter.getMetadata({ key: 'images/2026/09/test.txt' });
    assert.equal(metadata.size, content.length);
    assert.equal(metadata.provider, 'amh');

    // 6. URL resolution
    assert.equal(adapter.getUrl({ key: 'images/2026/09/test.txt' }), '/uploads/images/2026/09/test.txt');
    assert.equal(adapter.getUrl({ key: 'https://cdn.example.com/pic.jpg' }), 'https://cdn.example.com/pic.jpg');
    assert.equal(adapter.getUrl({ key: '/uploads/legacy.jpg' }), '/uploads/legacy.jpg');

    // 7. Signed URL (direct for AMH)
    assert.equal(await adapter.getSignedUrl({ key: 'images/2026/09/test.txt' }), '/uploads/images/2026/09/test.txt');
    assert.equal(
      await adapter.getSignedUrl({ key: 'images/2026/09/test.txt', disposition: 'attachment' }),
      '/uploads/images/2026/09/test.txt?disposition=attachment'
    );

    // 8. Test connection
    const health = await adapter.testConnection();
    assert.equal(health.status, 'healthy');
    assert.equal(health.provider, 'amh');

    // 9. Delete
    const deleteResult = await adapter.delete({ key: 'images/2026/09/test.txt' });
    assert.equal(deleteResult.deleted, true);
    assert.equal(await adapter.exists({ key: 'images/2026/09/test.txt' }), false);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('buildObjectKey - proper directory partitioning', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  const avatarKey = buildObjectKey({ userId: 'usr_123', type: 'avatar', filename: 'me.png', now });
  assert.match(avatarKey, /^avatars\/usr_123\/[a-f0-9-]+\.png$/);

  const genKey = buildObjectKey({ userId: 'usr_123', type: 'image', sourceType: 'generation', now });
  assert.match(genKey, /^generated\/2026\/09\/26\/[a-f0-9-]+\.webp$/);

  const videoKey = buildObjectKey({ userId: 'usr_123', type: 'video', now });
  assert.match(videoKey, /^videos\/2026\/09\/26\/[a-f0-9-]+\.mp4$/);

  const audioKey = buildObjectKey({ userId: 'usr_123', type: 'audio', now });
  assert.match(audioKey, /^audio\/2026\/09\/26\/[a-f0-9-]+\.mp3$/);

  const uploadKey = buildObjectKey({ userId: 'usr_456', type: 'upload', filename: 'doc.pdf', now });
  assert.match(uploadKey, /^uploads\/usr_456\/2026\/09\/[a-f0-9-]+\.pdf$/);
});

test('ingestBuffer - stores buffer and returns clean AMH URL', async () => {
  const fakePng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...new Array(100).fill(0x00),
  ]);

  const result = await ingestBuffer({
    body: fakePng,
    userId: 'test_user_unit',
    type: 'image',
    filename: 'unit-test.png',
    contentType: 'image/png',
  });

  assert.equal(result.provider, 'amh');
  assert.match(result.objectKey, /^images\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9-]+\.png$/);
  assert.match(result.url, /^\/uploads\/images\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9-]+\.png$/);
  assert.equal(result.sizeBytes, fakePng.length);

  // Clean up disk
  const diskPath = path.join(process.cwd(), 'public', result.url.replace(/^\//, ''));
  if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
});

test('ingestRemoteFile - downloads and saves remote generation result', async () => {
  const fakeMp4 = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp
    ...new Array(120).fill(0x00),
  ]);

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(fakeMp4.length) });
    res.end(fakeMp4);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockUrl = `http://127.0.0.1:${port}/model-output.mp4`;

  try {
    const result = await ingestRemoteFile({
      url: mockUrl,
      userId: 'test_user_video',
      type: 'video',
      filename: 'ai-gen.mp4',
    });

    assert.equal(result.provider, 'amh');
    assert.match(result.objectKey, /^generated\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9-]+\.mp4$/);
    assert.match(result.url, /^\/uploads\/generated\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9-]+\.mp4$/);
    assert.equal(result.sizeBytes, fakeMp4.length);

    // Clean up
    const diskPath = path.join(process.cwd(), 'public', result.url.replace(/^\//, ''));
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  } finally {
    server.close();
  }
});

test('ingestRemoteFile - handles download errors gracefully', async () => {
  await assert.rejects(
    () => ingestRemoteFile({ url: 'http://127.0.0.1:58999/not-found.mp4', type: 'video' }),
    (err) => err.code === 'STORAGE_SOURCE_DOWNLOAD_FAILED' || err.code === 'STORAGE_INGEST_FAILED'
  );
});

test('testStorageConnection - validates AMH storage health check', async () => {
  const result = await testStorageConnection();
  assert.equal(result.status, 'healthy');
  assert.equal(result.provider, 'amh');
  assert.ok(typeof result.storageDir === 'string');
});
