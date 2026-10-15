import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveS3BackupTarget, uploadBackupFile } from '../scripts/s3-backup-upload.mjs';

test('S3 backup target rejects unsafe bucket, prefix, and filename input', () => {
  assert.deepEqual(resolveS3BackupTarget({
    bucket: 'supdance-backups',
    prefix: '/postgres/daily/',
    filename: 'postgres-2026-09-24.dump',
  }), {
    bucket: 'supdance-backups',
    key: 'postgres/daily/postgres-2026-09-24.dump',
    uri: 's3://supdance-backups/postgres/daily/postgres-2026-09-24.dump',
  });
  assert.throws(() => resolveS3BackupTarget({ bucket: 'bad..bucket', filename: 'postgres-one.dump' }), { code: 'S3_BACKUP_BUCKET_INVALID' });
  assert.throws(() => resolveS3BackupTarget({ bucket: 'supdance-backups', prefix: '../outside', filename: 'postgres-one.dump' }), { code: 'S3_BACKUP_PREFIX_INVALID' });
  assert.throws(() => resolveS3BackupTarget({ bucket: 'supdance-backups', filename: '../postgres-one.dump' }), { code: 'S3_BACKUP_FILENAME_INVALID' });
});

test('backup uploader encrypts, uploads, and verifies the remote byte count', async () => {
  const calls = [];
  const result = await uploadBackupFile({
    filePath: '/tmp/postgres-2026-09-24.dump',
    bytes: 4096,
    env: {
      S3_BACKUP_BUCKET: 'supdance-backups',
      S3_BACKUP_PREFIX: 'postgres/daily',
      S3_BACKUP_REGION: 'ap-southeast-1',
      S3_BACKUP_SSE: 'aws:kms',
      S3_BACKUP_KMS_KEY_ID: 'alias/supdance-backups',
      DATABASE_URL: 'postgresql://localhost/app',
    },
    exec: async (binary, args, options) => {
      calls.push({ binary, args, options });
      return { stdout: calls.length === 1 ? '' : '{"bytes":4096,"encryption":"aws:kms","kmsKeyId":"arn:aws:kms:ap-southeast-1:123456789012:key/test"}\n' };
    },
  });

  assert.equal(result.uploaded, true);
  assert.equal(result.bytes, 4096);
  assert.equal(result.encryption, 'aws:kms');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].binary, 'aws');
  assert.ok(calls[0].args.includes('s3'));
  assert.ok(calls[0].args.includes('cp'));
  assert.ok(calls[0].args.includes('--only-show-errors'));
  assert.ok(calls[0].args.includes('--sse-kms-key-id'));
  assert.equal(Object.hasOwn(calls[0].options.env, 'DATABASE_URL'), false);
  assert.ok(calls[1].args.includes('head-object'));
  assert.ok(calls[1].args.includes('{bytes:ContentLength,encryption:ServerSideEncryption,kmsKeyId:SSEKMSKeyId}'));
  assert.ok(calls[1].args.includes('json'));
  assert.ok(!calls[0].args.includes('DATABASE_URL'));
});

test('backup uploader stays local without a bucket and fails closed on size mismatch', async () => {
  let invoked = false;
  const localOnly = await uploadBackupFile({
    filePath: '/tmp/postgres-2026-09-24.dump',
    bytes: 10,
    env: {},
    exec: async () => { invoked = true; },
  });
  assert.equal(localOnly.uploaded, false);
  assert.equal(invoked, false);

  await assert.rejects(() => uploadBackupFile({
    filePath: '/tmp/postgres-2026-09-24.dump',
    bytes: 10,
    env: { NODE_ENV: 'production' },
    exec: async () => { invoked = true; },
  }), { code: 'S3_BACKUP_BUCKET_NOT_CONFIGURED' });
  assert.equal(invoked, false, 'missing production bucket should fail before invoking AWS CLI');

  await assert.rejects(() => uploadBackupFile({
    filePath: '/tmp/postgres-2026-09-24.dump',
    bytes: 10,
    env: { S3_BACKUP_BUCKET: 'supdance-backups', S3_BACKUP_SSE: 'AES256' },
    exec: async (binary, args) => ({ stdout: args.includes('head-object') ? '{"bytes":9,"encryption":"AES256"}\n' : '' }),
  }), { code: 'S3_BACKUP_SIZE_MISMATCH' });

  await assert.rejects(() => uploadBackupFile({
    filePath: '/tmp/postgres-2026-09-24.dump',
    bytes: 10,
    env: { S3_BACKUP_BUCKET: 'supdance-backups', S3_BACKUP_SSE: 'aws:kms' },
    exec: async (binary, args) => ({ stdout: args.includes('head-object') ? '{"bytes":10,"encryption":"AES256"}\n' : '' }),
  }), { code: 'S3_BACKUP_ENCRYPTION_MISMATCH' });
});

test('backup uploader rejects unsafe encryption and endpoint settings', async () => {
  await assert.rejects(() => uploadBackupFile({
    filePath: '/tmp/postgres-2026-09-24.dump', bytes: 1,
    env: { S3_BACKUP_BUCKET: 'supdance-backups', S3_BACKUP_SSE: 'aws:kms:dsse' },
  }), { code: 'S3_BACKUP_SSE_INVALID' });
  await assert.rejects(() => uploadBackupFile({
    filePath: '/tmp/postgres-2026-09-24.dump', bytes: 1,
    env: { S3_BACKUP_BUCKET: 'supdance-backups', S3_BACKUP_ENDPOINT: 'http://example.test' },
  }), { code: 'S3_BACKUP_ENDPOINT_INVALID' });
});
