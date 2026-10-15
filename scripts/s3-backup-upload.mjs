import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const AWS_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'TMP', 'TEMP', 'LANG', 'LC_ALL',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
]);

export function resolveS3BackupTarget({ bucket, prefix = 'postgres', filename } = {}) {
  const cleanBucket = String(bucket || '').trim();
  if (!/^(?=.{3,63}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(cleanBucket)
    || cleanBucket.includes('..') || cleanBucket.includes('.-') || cleanBucket.includes('-.')
    || /^\d{1,3}(\.\d{1,3}){3}$/.test(cleanBucket)) {
    throw Object.assign(new Error('S3_BACKUP_BUCKET is invalid.'), { code: 'S3_BACKUP_BUCKET_INVALID' });
  }

  const safeFilename = String(filename || '');
  if (path.basename(safeFilename) !== safeFilename || !/^postgres-[A-Za-z0-9._-]+\.dump$/.test(safeFilename)) {
    throw Object.assign(new Error('Backup filename is invalid.'), { code: 'S3_BACKUP_FILENAME_INVALID' });
  }

  const cleanPrefix = String(prefix || '').trim().replace(/^\/+|\/+$/g, '');
  const segments = cleanPrefix ? cleanPrefix.split('/') : [];
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw Object.assign(new Error('S3_BACKUP_PREFIX is invalid.'), { code: 'S3_BACKUP_PREFIX_INVALID' });
  }

  const key = [...segments, safeFilename].join('/');
  return { bucket: cleanBucket, key, uri: `s3://${cleanBucket}/${key}` };
}

function awsOptions(env) {
  const options = { timeout: DEFAULT_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 };
  const region = String(env.S3_BACKUP_REGION || '').trim();
  if (region) options.regionArgs = ['--region', region];
  const endpoint = String(env.S3_BACKUP_ENDPOINT || '').trim();
  if (endpoint) {
    let parsed;
    try { parsed = new URL(endpoint); } catch {}
    if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw Object.assign(new Error('S3_BACKUP_ENDPOINT is invalid.'), { code: 'S3_BACKUP_ENDPOINT_INVALID' });
    }
    options.endpointArgs = ['--endpoint-url', parsed.toString().replace(/\/$/, '')];
  }
  return options;
}

function awsCliEnv(env) {
  const safe = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (AWS_ENV_KEYS.has(key) || key.startsWith('AWS_')) safe[key] = value;
  }
  for (const [key, value] of Object.entries(env)) {
    if (AWS_ENV_KEYS.has(key) || key.startsWith('AWS_')) safe[key] = value;
  }
  safe.AWS_PAGER = '';
  safe.AWS_CLI_AUTO_PROMPT = 'off';
  return safe;
}

export async function uploadBackupFile({ filePath, bytes, env = process.env, exec = execFileAsync } = {}) {
  const bucket = String(env.S3_BACKUP_BUCKET || '').trim();
  if (!bucket) {
    if (env.NODE_ENV === 'production') {
      throw Object.assign(new Error('Production backups require a configured remote bucket.'), {
        code: 'S3_BACKUP_BUCKET_NOT_CONFIGURED',
      });
    }
    return { uploaded: false, reason: 'S3_BACKUP_BUCKET_NOT_CONFIGURED' };
  }

  const target = resolveS3BackupTarget({
    bucket,
    prefix: env.S3_BACKUP_PREFIX || 'postgres',
    filename: path.basename(String(filePath || '')),
  });
  const sse = String(env.S3_BACKUP_SSE || 'aws:kms').trim();
  if (!['AES256', 'aws:kms'].includes(sse)) {
    throw Object.assign(new Error('S3_BACKUP_SSE must be AES256 or aws:kms.'), { code: 'S3_BACKUP_SSE_INVALID' });
  }
  const kmsKeyId = String(env.S3_BACKUP_KMS_KEY_ID || '').trim();
  if (kmsKeyId && sse !== 'aws:kms') {
    throw Object.assign(new Error('S3_BACKUP_KMS_KEY_ID requires aws:kms encryption.'), { code: 'S3_BACKUP_KMS_CONFIG_INVALID' });
  }

  const { timeout, windowsHide, maxBuffer, regionArgs = [], endpointArgs = [] } = awsOptions(env);
  const cliEnv = awsCliEnv(env);
  const commonArgs = [...regionArgs, ...endpointArgs];
  const uploadArgs = [
    's3', 'cp', String(filePath), target.uri,
    '--only-show-errors', '--sse', sse,
    ...commonArgs,
  ];
  if (kmsKeyId) uploadArgs.push('--sse-kms-key-id', kmsKeyId);

  try {
    await exec('aws', uploadArgs, { timeout, windowsHide, maxBuffer, env: cliEnv });
    const { stdout = '' } = await exec('aws', [
      's3api', 'head-object', '--bucket', target.bucket, '--key', target.key,
      '--query', '{bytes:ContentLength,encryption:ServerSideEncryption,kmsKeyId:SSEKMSKeyId}',
      '--output', 'json', ...commonArgs,
    ], { timeout: 30_000, windowsHide, maxBuffer, env: cliEnv });
    let remoteObject;
    try { remoteObject = JSON.parse(String(stdout)); } catch {}
    if (Number(remoteObject?.bytes) !== Number(bytes)) {
      throw Object.assign(new Error('Uploaded backup size does not match the local dump.'), { code: 'S3_BACKUP_SIZE_MISMATCH' });
    }
    if (remoteObject?.encryption !== sse || (sse === 'aws:kms' && !remoteObject?.kmsKeyId)) {
      throw Object.assign(new Error('Uploaded backup encryption does not match the requested server-side encryption.'), {
        code: 'S3_BACKUP_ENCRYPTION_MISMATCH',
      });
    }
  } catch (error) {
    if (['S3_BACKUP_SIZE_MISMATCH', 'S3_BACKUP_ENCRYPTION_MISMATCH'].includes(error?.code)) throw error;
    throw Object.assign(new Error('S3 backup upload or verification failed.'), {
      code: 'S3_BACKUP_UPLOAD_FAILED',
      cause: { code: error?.code || 'AWS_CLI_FAILED' },
    });
  }

  return { uploaded: true, bucket: target.bucket, key: target.key, bytes: Number(bytes), encryption: sse };
}
