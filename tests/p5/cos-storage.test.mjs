import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { CosStorageAdapter } from '../../lib/storage/cosStorageAdapter.js';

test('CosStorageAdapter - 10-minute signed URL contract & TTL 600s', async () => {
  const adapter = new CosStorageAdapter({
    secretId: 'AKIDTestSecretId1234567890',
    secretKey: 'TestSecretKey0987654321',
    bucket: 'test-koyo-bucket-1250000000',
    region: 'ap-guangzhou',
    signedUrlTtl: 600,
  });

  const objectKey = 'generated/2026/10/03/sample-video.mp4';
  const signedUrl = await adapter.getSignedUrl({ key: objectKey });

  // 1. 验证签名 URL 指向私有 COS 桶
  assert.ok(signedUrl.startsWith('https://test-koyo-bucket-1250000000.cos.ap-guangzhou.myqcloud.com/generated/2026/10/03/sample-video.mp4?'));

  // 2. 解析 URL 查询参数
  const urlObj = new URL(signedUrl);
  assert.equal(urlObj.searchParams.get('q-sign-algorithm'), 'sha1');
  assert.equal(urlObj.searchParams.get('q-ak'), 'AKIDTestSecretId1234567890');

  // 3. 验证 10 分钟临时时效 (TTL 600s)
  const signTime = urlObj.searchParams.get('q-sign-time');
  assert.ok(signTime, 'q-sign-time 必须存在');
  const [startStr, endStr] = signTime.split(';');
  const startSec = Number(startStr);
  const endSec = Number(endStr);
  assert.ok(Number.isFinite(startSec) && Number.isFinite(endSec));
  assert.equal(endSec - startSec, 600, '防盗链临时签名有效期必须精确为 10 分钟 (600秒)');

  const keyTime = urlObj.searchParams.get('q-key-time');
  assert.equal(keyTime, signTime, 'q-key-time 与 q-sign-time 必须一致');

  // 4. 验证签名哈希存在且为 40 位十六进制 (HMAC-SHA1)
  const signature = urlObj.searchParams.get('q-signature');
  assert.match(signature, /^[a-f0-9]{40}$/, '签名必须为有效 40 位十六进制串');

  // 5. 验证附件下载 disposition
  const attachmentUrl = await adapter.getSignedUrl({ key: objectKey, disposition: 'attachment' });
  const attachmentObj = new URL(attachmentUrl);
  assert.equal(attachmentObj.searchParams.get('response-content-disposition'), 'attachment');
  assert.ok(attachmentObj.searchParams.get('q-url-param-list').includes('response-content-disposition'));
});

test('CosStorageAdapter - private storage isolation & CRUD', async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cos-private-test-'));
  const adapter = new CosStorageAdapter({
    privateStorageDir: tempDir,
    bucket: 'test-private-bucket',
    region: 'ap-shanghai',
  });

  try {
    // 1. 安全检查：拒绝路径穿越
    assert.throws(
      () => adapter.normalizeKey('../../../etc/passwd'),
      (err) => err.code === 'STORAGE_OBJECT_KEY_INVALID'
    );
    assert.throws(
      () => adapter.normalizeKey('videos/../../secret.txt'),
      (err) => err.code === 'STORAGE_OBJECT_KEY_INVALID'
    );

    // 2. 隔离上传（写入私有目录，严禁写入 public/uploads）
    const testBuffer = Buffer.from('private koyo video artifact content');
    const uploadResult = await adapter.upload({
      key: 'videos/2026/10/03/render.mp4',
      body: testBuffer,
      contentType: 'video/mp4',
    });
    assert.equal(uploadResult.provider, 'cos');
    assert.equal(uploadResult.key, 'videos/2026/10/03/render.mp4');
    assert.equal(uploadResult.size, testBuffer.length);

    // 确认文件存储在 privateStorageDir，而不是当前工作目录 public/uploads
    const expectedLocalPath = path.join(tempDir, 'videos', '2026', '10', '03', 'render.mp4');
    const existsLocally = await fsp.stat(expectedLocalPath).then(() => true).catch(() => false);
    assert.equal(existsLocally, true, '产物必须隔离写入私有目录');

    // 3. 存在性与读取
    assert.equal(await adapter.exists({ key: 'videos/2026/10/03/render.mp4' }), true);
    assert.equal(await adapter.exists({ key: 'videos/non-existent.mp4' }), false);

    const downloadResult = await adapter.download({ key: 'videos/2026/10/03/render.mp4' });
    assert.deepEqual(downloadResult.body, testBuffer);

    // 4. 元数据
    const meta = await adapter.getMetadata({ key: 'videos/2026/10/03/render.mp4' });
    assert.equal(meta.size, testBuffer.length);
    assert.equal(meta.provider, 'cos');

    // 5. 健康检查
    const health = await adapter.testConnection();
    assert.equal(health.status, 'healthy');
    assert.equal(health.provider, 'cos');

    // 6. 删除
    const delResult = await adapter.delete({ key: 'videos/2026/10/03/render.mp4' });
    assert.equal(delResult.deleted, true);
    assert.equal(await adapter.exists({ key: 'videos/2026/10/03/render.mp4' }), false);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});
