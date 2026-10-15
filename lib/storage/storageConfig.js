import 'server-only';

import path from 'node:path';
import { getSettingByKey, updateSettingValue } from '../repositories/settings.js';

export const STORAGE_CONFIG_KEY = 'storage_config';
export const STORAGE_PROVIDERS = Object.freeze(['amh', 'cos']);

export function resolveStorageProvider(configured) {
  const envProv = String(process.env.STORAGE_PROVIDER || '').trim().toLowerCase();
  if (['cos', 'amh'].includes(envProv)) return envProv;
  if (process.env.COS_SECRET_ID && process.env.COS_BUCKET) return 'cos';
  const cfg = String(configured || '').trim().toLowerCase();
  if (['cos', 'amh'].includes(cfg)) return cfg;
  return 'amh';
}

export const STORAGE_PROVIDER = resolveStorageProvider();

function runtimeEnvironment() {
  const value = String(process.env.STORAGE_ENVIRONMENT || process.env.NODE_ENV || '').trim().toLowerCase();
  return ['development', 'staging', 'production'].includes(value) ? value : 'development';
}

function resolveStorageDir() {
  const custom = String(process.env.AMH_STORAGE_DIR || process.env.STORAGE_LOCAL_DIR || '').trim();
  if (custom) return path.resolve(custom);
  return path.resolve(process.cwd(), 'public', 'uploads');
}

function resolvePublicUrlPrefix() {
  const custom = String(process.env.AMH_STORAGE_URL_PREFIX || process.env.STORAGE_PUBLIC_URL_PREFIX || '').trim();
  if (custom) return custom.replace(/\/+$/, '');
  return '/uploads';
}

const DEFAULT_CONFIG = Object.freeze({
  provider: STORAGE_PROVIDER,
  environment: runtimeEnvironment(),
  storageDir: resolveStorageDir(),
  publicUrlPrefix: resolvePublicUrlPrefix(),
  maxFileBytes: {
    image: 50 * 1024 * 1024,
    audio: 500 * 1024 * 1024,
    video: 10 * 1024 * 1024 * 1024,
    document: 50 * 1024 * 1024,
    other: 50 * 1024 * 1024,
  },
  multipartThresholdBytes: 5 * 1024 * 1024,
  multipartPartSizeBytes: 8 * 1024 * 1024,
});

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeConfig(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const limits = source.maxFileBytes && typeof source.maxFileBytes === 'object' ? source.maxFileBytes : {};
  return {
    ...DEFAULT_CONFIG,
    provider: resolveStorageProvider(source.provider),
    environment: runtimeEnvironment(),
    storageDir: resolveStorageDir(),
    publicUrlPrefix: resolvePublicUrlPrefix(),
    maxFileBytes: {
      image: clampInt(limits.image, 1, 10 * 1024 * 1024 * 1024, DEFAULT_CONFIG.maxFileBytes.image),
      audio: clampInt(limits.audio, 1, 10 * 1024 * 1024 * 1024, DEFAULT_CONFIG.maxFileBytes.audio),
      video: clampInt(limits.video, 1, 20 * 1024 * 1024 * 1024, DEFAULT_CONFIG.maxFileBytes.video),
      document: clampInt(limits.document, 1, 10 * 1024 * 1024 * 1024, DEFAULT_CONFIG.maxFileBytes.document),
      other: clampInt(limits.other, 1, 10 * 1024 * 1024 * 1024, DEFAULT_CONFIG.maxFileBytes.other),
    },
    multipartThresholdBytes: clampInt(source.multipartThresholdBytes, 1 * 1024 * 1024, 5 * 1024 * 1024 * 1024, DEFAULT_CONFIG.multipartThresholdBytes),
    multipartPartSizeBytes: clampInt(source.multipartPartSizeBytes, 5 * 1024 * 1024, 5 * 1024 * 1024 * 1024, DEFAULT_CONFIG.multipartPartSizeBytes),
  };
}

export async function getStorageConfig() {
  const row = await getSettingByKey(STORAGE_CONFIG_KEY).catch(() => null);
  return normalizeConfig(row?.value || {});
}

export async function saveStorageConfig({ actorEmail = 'system', config = {} }) {
  const next = normalizeConfig(config);
  await updateSettingValue({ key: STORAGE_CONFIG_KEY, value: next, updatedBy: actorEmail });
  return getStorageConfig();
}

export function publicStorageConfig(config) {
  const value = config || {};
  return {
    provider: STORAGE_PROVIDER,
    environment: value.environment || runtimeEnvironment(),
    storageDir: value.storageDir || resolveStorageDir(),
    publicUrlPrefix: value.publicUrlPrefix || resolvePublicUrlPrefix(),
    maxFileBytes: value.maxFileBytes || DEFAULT_CONFIG.maxFileBytes,
    multipartThresholdBytes: value.multipartThresholdBytes || DEFAULT_CONFIG.multipartThresholdBytes,
    multipartPartSizeBytes: value.multipartPartSizeBytes || DEFAULT_CONFIG.multipartPartSizeBytes,
  };
}
