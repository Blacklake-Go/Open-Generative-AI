import 'server-only';

import { AmhStorageAdapter } from './amhStorageAdapter.js';
import { CosStorageAdapter } from './cosStorageAdapter.js';
import { AliyunOssStorageAdapter } from './ossStorageAdapter.js';
import { S3CompatibleStorageAdapter } from './s3StorageAdapter.js';

export const PROVIDER_NAMES = Object.freeze({
  local: '服务器本地',
  amh: '服务器本地',
  oss: '阿里云 OSS',
  cos: '腾讯云 COS',
  qiniu: '七牛云 Kodo',
  s3: 'S3 兼容存储',
});

export function normalizeProviderId(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (!provider || provider === 'amh' || provider === 'local') return 'local';
  return provider;
}

export function resolveQiniuEndpoint(settings = {}) {
  if (settings.endpoint) return settings.endpoint;
  const region = String(settings.region || '').trim();
  if (!region) return '';
  return `https://s3-${region}.qiniucs.com`;
}

export function createStorageAdapter(settings = {}, options = {}) {
  const provider = normalizeProviderId(settings.provider);
  switch (provider) {
    case 'cos':
      return new CosStorageAdapter({
        secretId: settings.accessKeyId,
        secretKey: settings.accessKeySecret,
        sessionToken: settings.sessionToken,
        bucket: settings.bucket,
        region: settings.region || 'ap-guangzhou',
        endpoint: settings.endpoint,
        pathPrefix: settings.pathPrefix,
        customDomain: settings.publicBaseUrl,
        signedUrlTtl: settings.signedUrlTtl,
        ...options,
      });
    case 'oss':
      return new AliyunOssStorageAdapter({ ...settings, ...options });
    case 'qiniu':
      return new S3CompatibleStorageAdapter({
        ...settings,
        ...options,
        provider: 'qiniu',
        endpoint: resolveQiniuEndpoint(settings),
        pathStyle: true,
      });
    case 's3':
      return new S3CompatibleStorageAdapter({ ...settings, ...options, provider: 's3' });
    case 'local':
    default:
      return new AmhStorageAdapter(settings, options);
  }
}
