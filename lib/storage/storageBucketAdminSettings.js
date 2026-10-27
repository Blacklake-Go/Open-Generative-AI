import 'server-only';

import { getSettingByKey, updateSettingValue } from '../repositories/settings.js';
import { decryptSecret, encryptSecret, maskSecret } from './storageCrypto.js';

export const BUCKET_ADMIN_SETTINGS_KEY = 'storage_bucket_admin_v1';

const DEFAULTS = Object.freeze({
  accessKeyId: '',
  accessKeySecret: '',
  updatedAt: null,
});

function normalize(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    ...DEFAULTS,
    accessKeyId: String(source.accessKeyId || '').trim(),
    accessKeySecret: String(source.accessKeySecret || ''),
    updatedAt: source.updatedAt || null,
  };
}

function decode(raw) {
  const settings = normalize(raw);
  if (raw?.accessKeySecret) {
    try {
      settings.accessKeySecret = decryptSecret(raw.accessKeySecret);
    } catch {
      throw Object.assign(new Error('已保存的桶级管理密钥无法解密，请重新填写并保存'), {
        code: 'BUCKET_ADMIN_SECRET_UNDECRYPTABLE',
        statusCode: 409,
      });
    }
  }
  return settings;
}

let cache = { value: null, at: 0 };
const CACHE_MS = 5000;

export function invalidateBucketAdminSettingsCache() {
  cache = { value: null, at: 0 };
}

export async function readBucketAdminSettings({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) {
    return cache.value;
  }
  const row = await getSettingByKey(BUCKET_ADMIN_SETTINGS_KEY).catch(() => null);
  if (!row?.value) {
    cache = { value: null, at: Date.now() };
    return null;
  }
  const settings = decode(row.value);
  settings.updatedAt = row.updated_at || row.updatedAt || null;
  cache = { value: settings, at: Date.now() };
  return settings;
}

export async function saveBucketAdminSettings({ accessKeyId = '', accessKeySecret = '', actorEmail = 'system' } = {}) {
  const current = await readBucketAdminSettings({ fresh: true }).catch(() => null);
  const incoming = normalize({ accessKeyId, accessKeySecret });
  if (!incoming.accessKeyId && current?.accessKeyId) incoming.accessKeyId = current.accessKeyId;
  if (!incoming.accessKeySecret && current?.accessKeySecret) incoming.accessKeySecret = current.accessKeySecret;

  if (!incoming.accessKeyId) {
    throw Object.assign(new Error('请填写桶级管理 Access Key ID'), { code: 'BUCKET_ADMIN_KEY_REQUIRED', statusCode: 422 });
  }
  if (!incoming.accessKeySecret) {
    throw Object.assign(new Error('请填写桶级管理 Access Key Secret'), { code: 'BUCKET_ADMIN_SECRET_REQUIRED', statusCode: 422 });
  }

  const value = {
    accessKeyId: incoming.accessKeyId,
    accessKeySecret: encryptSecret(incoming.accessKeySecret),
    updatedAt: new Date().toISOString(),
  };
  await updateSettingValue({ key: BUCKET_ADMIN_SETTINGS_KEY, value, updatedBy: actorEmail });
  invalidateBucketAdminSettingsCache();
  return readBucketAdminSettings({ fresh: true });
}

export function publicBucketAdminSettings(settings) {
  return {
    accessKeyIdMasked: settings?.accessKeyId ? maskSecret(settings.accessKeyId) : '',
    hasAccessKeySecret: Boolean(settings?.accessKeySecret),
    updatedAt: settings?.updatedAt || null,
  };
}
