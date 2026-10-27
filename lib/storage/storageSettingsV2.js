import 'server-only';

import { getSettingByKey, updateSettingValue } from '../repositories/settings.js';
import { decryptSecret, encryptSecret, maskSecret } from './storageCrypto.js';
import {
  findOrCreateStorageLocation,
  getStorageLocation,
  listStorageLocations,
  storageLocationDigest,
} from './storageLocations.js';
import { STORAGE_PROVIDER_IDS } from './providers.js';

export const STORAGE_SETTINGS_KEY = 'storage_config_v2';
export const STORAGE_PROVIDERS = STORAGE_PROVIDER_IDS;

export { PROVIDER_CATALOG } from './providers.js';

const DEFAULTS = Object.freeze({
  provider: 'local',
  enabled: true,
  endpoint: '',
  region: '',
  bucket: '',
  accessKeyId: '',
  accessKeySecret: '',
  sessionToken: '',
  pathPrefix: 'supdance',
  publicBaseUrl: '',
  s3Preset: 'custom',
  pathStyle: false,
  signedUrlTtl: 600,
  storageLocationId: '',
  updatedAt: null,
});

export function normalizeProvider(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'amh' || raw === '' || raw === 'local') return 'local';
  return STORAGE_PROVIDERS.includes(raw) ? raw : 'local';
}

function sanitizePrefix(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

export function normalizeStorageSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const provider = normalizeProvider(source.provider);
  const endpoint = String(source.endpoint || '').trim().replace(/\/+$/, '');
  return {
    ...DEFAULTS,
    provider,
    enabled: source.enabled !== false,
    endpoint,
    region: String(source.region || '').trim(),
    bucket: String(source.bucket || '').trim(),
    accessKeyId: String(source.accessKeyId || '').trim(),
    accessKeySecret: String(source.accessKeySecret || ''),
    sessionToken: String(source.sessionToken || ''),
    pathPrefix: sanitizePrefix(source.pathPrefix || DEFAULTS.pathPrefix) || '',
    publicBaseUrl: String(source.publicBaseUrl || '').trim().replace(/\/+$/, ''),
    s3Preset: String(source.s3Preset || 'custom').trim().toLowerCase() || 'custom',
    pathStyle: Boolean(source.pathStyle),
    signedUrlTtl: Math.min(86400, Math.max(60, Number(source.signedUrlTtl) || DEFAULTS.signedUrlTtl)),
    storageLocationId: String(source.storageLocationId || '').trim(),
    updatedAt: source.updatedAt || null,
  };
}

function encodeSecrets(settings) {
  return {
    ...settings,
    accessKeySecret: settings.accessKeySecret ? encryptSecret(settings.accessKeySecret) : '',
    sessionToken: settings.sessionToken ? encryptSecret(settings.sessionToken) : '',
  };
}

function decodeSecrets(raw) {
  const settings = normalizeStorageSettings(raw);
  settings.accessKeySecret = raw?.accessKeySecret ? decryptSecret(raw.accessKeySecret) : '';
  settings.sessionToken = raw?.sessionToken ? decryptSecret(raw.sessionToken) : '';
  return settings;
}

let settingsCache = { value: null, at: 0 };
const SETTINGS_CACHE_MS = 5000;

export function invalidateStorageSettingsCache() {
  settingsCache = { value: null, at: 0 };
}

export async function readStorageSettings({ fresh = false } = {}) {
  if (!fresh && settingsCache.value && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) {
    return settingsCache.value;
  }
  const row = await getSettingByKey(STORAGE_SETTINGS_KEY).catch(() => null);
  if (!row?.value) {
    settingsCache = { value: null, at: Date.now() };
    return null;
  }
  const settings = decodeSecrets(row.value);
  settings.updatedAt = row.updated_at || row.updatedAt || null;
  settingsCache = { value: settings, at: Date.now() };
  return settings;
}

export async function loadLocationSettings(id) {
  const row = await getStorageLocation(id);
  if (!row) return null;
  const settings = decodeSecrets(row.value_json);
  settings.storageLocationId = row.id;
  return settings;
}

export function validateStorageSettings(settings, { hasStoredSecret = false } = {}) {
  const provider = settings.provider;
  if (!STORAGE_PROVIDERS.includes(provider)) {
    return '存储供应商无效';
  }
  if (provider === 'local') return null;

  if (!settings.bucket) return '请填写 Bucket';
  if (!settings.accessKeyId) return '请填写 Access Key ID';
  if (!settings.accessKeySecret && !hasStoredSecret) return '请填写 Access Key Secret';

  if (provider === 's3' && !settings.endpoint) return '请填写 S3 Endpoint';
  if (!settings.region && !settings.endpoint) return '请填写 Region 或 Endpoint';

  if (settings.endpoint) {
    try {
      const parsed = new URL(settings.endpoint);
      if (!['http:', 'https:'].includes(parsed.protocol)) return 'Endpoint 必须是 http(s) 地址';
      if (parsed.search || parsed.hash) return 'Endpoint 不能包含查询参数或片段';
    } catch {
      return 'Endpoint 地址格式无效';
    }
  }
  if (provider === 'cos' && !settings.region) return '腾讯云 COS 需要填写 Region';
  return null;
}

export function publicStorageSettings(settings) {
  if (!settings) {
    return {
      provider: 'local',
      enabled: true,
      endpoint: '',
      region: '',
      bucket: '',
      pathPrefix: 'supdance',
      publicBaseUrl: '',
      s3Preset: 'custom',
      pathStyle: false,
      signedUrlTtl: 600,
      accessKeyIdMasked: '',
      hasAccessKeySecret: false,
      storageLocationId: '',
      updatedAt: null,
    };
  }
  return {
    provider: settings.provider,
    enabled: settings.enabled !== false,
    endpoint: settings.endpoint || '',
    region: settings.region || '',
    bucket: settings.bucket || '',
    pathPrefix: settings.pathPrefix || '',
    publicBaseUrl: settings.publicBaseUrl || '',
    s3Preset: settings.s3Preset || 'custom',
    pathStyle: Boolean(settings.pathStyle),
    signedUrlTtl: settings.signedUrlTtl,
    accessKeyIdMasked: settings.accessKeyId ? maskSecret(settings.accessKeyId) : '',
    hasAccessKeySecret: Boolean(settings.accessKeySecret),
    storageLocationId: settings.storageLocationId || '',
    updatedAt: settings.updatedAt || null,
  };
}

/**
 * 保存平台存储配置。凭据以 AES-256-GCM 加密后落库，并同步写入一条
 * storage_locations 记录；历史资源继续通过各自记录的位置读取。
 */
export async function saveStorageSettings({ config = {}, actorEmail = 'system' } = {}) {
  const current = await readStorageSettings({ fresh: true });
  const incoming = normalizeStorageSettings(config);

  if (!incoming.accessKeyId && current && normalizeProvider(current.provider) === incoming.provider) {
    // 后台只回显掩码，未重新填写时沿用已存 Access Key ID。
    incoming.accessKeyId = current.accessKeyId || '';
  }
  if (!incoming.accessKeySecret && current && normalizeProvider(current.provider) === incoming.provider) {
    incoming.accessKeySecret = current.accessKeySecret || '';
  }
  if (!incoming.sessionToken && current && normalizeProvider(current.provider) === incoming.provider) {
    incoming.sessionToken = current.sessionToken || '';
  }

  const error = validateStorageSettings(incoming, { hasStoredSecret: Boolean(incoming.accessKeySecret) });
  if (error) {
    throw Object.assign(new Error(error), { code: 'STORAGE_SETTINGS_INVALID', statusCode: 422 });
  }

  let storageLocationId = '';
  if (incoming.provider !== 'local') {
    const digest = storageLocationDigest(incoming);
    storageLocationId = await findOrCreateStorageLocation({
      provider: incoming.provider,
      digest,
      valueJson: encodeSecrets(incoming),
    });
  } else {
    storageLocationId = await findOrCreateStorageLocation({
      provider: 'local',
      digest: storageLocationDigest(incoming),
      valueJson: encodeSecrets(incoming),
    });
  }

  const stored = { ...incoming, storageLocationId };
  const value = { ...encodeSecrets(stored), updatedAt: new Date().toISOString() };
  await updateSettingValue({ key: STORAGE_SETTINGS_KEY, value, updatedBy: actorEmail });
  invalidateStorageSettingsCache();
  const saved = await readStorageSettings({ fresh: true });
  return { settings: saved, storageLocationId };
}

export async function listStorageLocationViews({ limit = 20 } = {}) {
  const rows = await listStorageLocations({ limit });
  return rows.map((row) => {
    let settings = null;
    try {
      settings = decodeSecrets(row.value_json);
    } catch {
      settings = null;
    }
    return {
      id: row.id,
      provider: row.provider,
      region: settings?.region || '',
      bucket: settings?.bucket || '',
      endpoint: settings?.endpoint || '',
      pathPrefix: settings?.pathPrefix || '',
      testedAt: row.tested_at,
      createdAt: row.created_at,
    };
  });
}
