import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execute, queryOne } from '../db/index.js';
import { getStorageConfig } from './storageConfig.js';
import { createStorageAdapter, normalizeProviderId } from './adapterRegistry.js';
import { loadLocationSettings } from './storageSettingsV2.js';
import { assertCanvasUploadObjectKey } from './objectKeyPolicy.js';

export const ASSET_TYPES = Object.freeze(['image', 'video', 'audio', 'music', 'document', 'avatar', 'thumbnail', 'generated', 'upload', 'other']);
export const VISIBILITIES = Object.freeze(['private', 'unlisted', 'public']);

/** ingest* 的返回值 → createUserAsset / updateCreationStatus 的位置字段 */
export function storedLocationFields(stored = {}) {
  return {
    bucket: stored.bucket || null,
    region: stored.region || null,
    storageProvider: stored.provider || null,
    storageLocationId: stored.storageLocationId || null,
  };
}

const MIME_EXTENSIONS = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif'], ['image/avif', 'avif'],
  ['video/mp4', 'mp4'], ['video/quicktime', 'mov'], ['video/webm', 'webm'],
  ['audio/mpeg', 'mp3'], ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/aac', 'aac'], ['audio/mp4', 'm4a'], ['audio/x-m4a', 'm4a'], ['audio/flac', 'flac'], ['audio/x-flac', 'flac'], ['audio/ogg', 'ogg'],
  ['application/pdf', 'pdf'],
]);
const EXT_MIMES = new Map([...MIME_EXTENSIONS.entries()].map(([mime, ext]) => [ext, mime]));
const IMAGE_VARIANT_TYPES = new Set(['image', 'avatar', 'thumbnail', 'generated']);

function normalizeType(type) {
  const value = String(type || 'other').toLowerCase();
  if (value === 'music') return 'audio';
  if (value === 'avatar') return 'avatar';
  return ASSET_TYPES.includes(value) ? value : 'other';
}

function extensionFromName(name) {
  const ext = path.extname(String(name || '')).slice(1).toLowerCase();
  return ext.replace(/[^a-z0-9]/g, '');
}

function detectMime(head, declaredMime = '', filename = '') {
  const declared = String(declaredMime || '').split(';')[0].trim().toLowerCase();
  const ext = extensionFromName(filename);
  if (head?.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head?.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head?.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (head?.length >= 6 && /^GIF8[79]a/.test(head.toString('ascii', 0, 6))) return 'image/gif';
  if (head?.length >= 12 && head.toString('ascii', 4, 8) === 'ftyp') return ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  if (declared && (MIME_EXTENSIONS.has(declared) || declared.startsWith('video/') || declared.startsWith('audio/'))) return declared;
  return EXT_MIMES.get(ext) || 'application/octet-stream';
}

function validateMime(mime, type) {
  const normalized = String(mime || '').toLowerCase();
  if (type === 'image' || type === 'avatar' || type === 'thumbnail') return normalized.startsWith('image/') && MIME_EXTENSIONS.has(normalized);
  if (type === 'video') return normalized.startsWith('video/') && MIME_EXTENSIONS.has(normalized);
  if (type === 'audio') return normalized.startsWith('audio/') && MIME_EXTENSIONS.has(normalized);
  if (type === 'document') return normalized === 'application/pdf';
  return MIME_EXTENSIONS.has(normalized) || normalized.startsWith('image/') || normalized.startsWith('video/') || normalized.startsWith('audio/') || ['application/zip', 'application/x-zip-compressed', 'application/json', 'application/octet-stream'].includes(normalized);
}

function variantObjectKey(objectKey, variant) {
  const normalized = String(objectKey || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const directory = lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
  const filename = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const basename = filename.replace(/\.[^.]+$/, '') || 'asset';
  return `${directory}/${variant}/${basename}.webp`.replace(/^\//, '');
}

function safeFilename(filename, fallbackExt) {
  const clean = String(filename || 'asset').normalize('NFKC').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  const ext = extensionFromName(clean) || fallbackExt;
  const withoutExt = clean.replace(new RegExp(`\\.${ext}$`, 'i'), '') || 'asset';
  return `${withoutExt}.${ext}`;
}

/**
 * Build unified AMH object keys.
 * Partitions storage into /images, /videos, /audio, /avatars, /uploads, /generated, /temp.
 */
export function buildObjectKey({
  userId = 'system',
  type = 'other',
  filename = '',
  now = new Date(),
  sourceType = null,
  avatar = false,
  workflowId = null,
} = {}) {
  const normalizedType = normalizeType(type);
  const safeUserId = String(userId || 'system').replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = extensionFromName(filename) || (normalizedType === 'video' ? 'mp4' : normalizedType === 'audio' ? 'mp3' : 'webp');
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const uuid = crypto.randomUUID();

  if (avatar || normalizedType === 'avatar') {
    return `avatars/${safeUserId}/${uuid}.${ext}`;
  }
  if (workflowId) {
    return `workflows/${safeUserId}/${String(workflowId).replace(/[^a-zA-Z0-9_-]/g, '_')}/${uuid}.${ext}`;
  }
  if (sourceType === 'generation' || normalizedType === 'generated') {
    return `generated/${year}/${month}/${day}/${uuid}.${ext}`;
  }
  if (normalizedType === 'image') {
    return `images/${year}/${month}/${day}/${uuid}.${ext}`;
  }
  if (normalizedType === 'video') {
    return `videos/${year}/${month}/${day}/${uuid}.${ext}`;
  }
  if (normalizedType === 'audio') {
    return `audio/${year}/${month}/${day}/${uuid}.${ext}`;
  }
  if (normalizedType === 'temp') {
    return `temp/${uuid}.${ext}`;
  }
  return `uploads/${safeUserId}/${year}/${month}/${uuid}.${ext}`;
}

function adapterFromConfig(config = {}, options = {}) {
  return createStorageAdapter({
    provider: config.storageProvider || config.provider,
    endpoint: config.endpoint || '',
    region: config.region || '',
    bucket: config.bucket || '',
    accessKeyId: config.accessKeyId || '',
    accessKeySecret: config.accessKeySecret || '',
    sessionToken: config.sessionToken || '',
    pathPrefix: config.pathPrefix || '',
    publicBaseUrl: config.publicBaseUrl || '',
    s3Preset: config.s3Preset || 'custom',
    pathStyle: Boolean(config.pathStyle),
    signedUrlTtl: config.signedUrlTtl || 600,
    storageDir: config.storageDir,
    publicUrlPrefix: config.publicUrlPrefix,
  }, options);
}

/**
 * Provider-neutral facade for application storage services.
 * All application layers interact through this interface. AMH is the underlying storage manager.
 */
export class StorageService {
  constructor(adapter, config = {}) {
    if (!adapter) throw new Error('StorageService 需要一个 StorageAdapter');
    this.adapter = adapter;
    this.config = config;
  }

  upload(args) { return this.adapter.upload(args); }
  multipartUpload(args) { return this.adapter.multipartUpload(args); }
  download(args) { return this.adapter.download(args); }
  downloadStream(args) { return this.adapter.downloadStream(args); }
  delete(args) { return this.adapter.delete(args); }
  exists(args) { return this.adapter.exists(args); }
  getUrl(args) { return this.adapter.getUrl(args); }
  getSignedUrl(args) { return this.adapter.getSignedUrl(args); }
  copy(args) { return this.adapter.copy(args); }
  move(args) { return this.adapter.move(args); }
  getMetadata(args) { return this.adapter.getMetadata(args); }
  testConnection() { return this.adapter.testConnection(); }
}

export async function getStorageAdapter() {
  const config = await getStorageConfig();
  return adapterFromConfig(config);
}

export async function getStorageConfigAndAdapter(options = {}) {
  const config = await getStorageConfig();
  const adapter = adapterFromConfig(config, options);
  return { config, adapter, storage: new StorageService(adapter, config) };
}

export async function getStorageService() {
  const { storage } = await getStorageConfigAndAdapter();
  return storage;
}

async function recordOperation({
  assetId = null,
  userId = null,
  provider = 'amh',
  objectKey = null,
  operation,
  sizeBytes = null,
  durationMs = null,
  status,
  errorCode = null,
}) {
  try {
    await execute(`
      INSERT INTO ai_studio.storage_operation_logs
        (id, asset_id, user_id, provider, object_key, operation, size_bytes, duration_ms, status, error_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [`sop_${crypto.randomBytes(12).toString('hex')}`, assetId, userId, provider, objectKey, operation, sizeBytes, durationMs, status, errorCode]);
  } catch {
    // Storage telemetry must never fail the user-facing storage operation.
  }
}

export async function ingestBuffer({
  body,
  userId = 'system',
  type = 'other',
  taskId = null,
  sourceProvider = null,
  filename = 'asset',
  contentType = '',
  visibility = 'private',
  sourceType = 'user_upload',
  objectKey = null,
} = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
  const normalizedType = normalizeType(type);
  const { config, adapter, storage } = await getStorageConfigAndAdapter();
  const limit = config.maxFileBytes[normalizedType] || config.maxFileBytes.other;

  if (!buffer.length) {
    throw Object.assign(new Error('待归档文件为空'), { code: 'STORAGE_FILE_EMPTY' });
  }
  if (buffer.length > limit) {
    throw Object.assign(new Error('文件超过当前类型大小限制'), { code: 'STORAGE_FILE_TOO_LARGE' });
  }

  const mime = detectMime(buffer.subarray(0, 64 * 1024), contentType, filename);
  if (!validateMime(mime, normalizedType)) {
    throw Object.assign(new Error(`文件类型与 ${normalizedType} 不匹配`), { code: 'STORAGE_FILE_TYPE_INVALID' });
  }

  const ext = MIME_EXTENSIONS.get(mime) || extensionFromName(filename) || 'bin';
  const key = objectKey
    ? assertCanvasUploadObjectKey(objectKey, userId)
    : buildObjectKey({
      userId,
      type: normalizedType,
      filename: filename || `asset.${ext}`,
      sourceType,
      avatar: normalizedType === 'avatar',
    });

  const startedAt = Date.now();
  try {
    const upload = await storage.upload({ key, body: buffer, contentType: mime, size: buffer.length });
    const variants = await generateStorageVariants({ storage, objectKey: key, type: normalizedType, mimeType: mime });
    await recordOperation({
      userId,
      provider: adapter.provider,
      objectKey: key,
      operation: 'ingest',
      sizeBytes: buffer.length,
      durationMs: Date.now() - startedAt,
      status: 'success',
    });

    return {
      provider: adapter.provider,
      objectKey: key,
      url: storage.getUrl({ key }),
      mimeType: mime,
      extension: ext,
      sizeBytes: buffer.length,
      checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
      visibility: VISIBILITIES.includes(visibility) ? visibility : 'private',
      sourceType,
      sourceProvider,
      sourceTaskId: taskId,
      location: upload.location || null,
      bucket: adapter.bucket || null,
      region: adapter.region || null,
      storageLocationId: config.storageLocationId || null,
      endpoint: adapter.endpoint || config.endpoint || null,
      ...variants,
    };
  } catch (error) {
    await recordOperation({
      userId,
      provider: adapter.provider,
      objectKey: key,
      operation: 'ingest',
      sizeBytes: buffer.length,
      durationMs: Date.now() - startedAt,
      status: 'failed',
      errorCode: error.code || 'STORAGE_INGEST_FAILED',
    });
    throw error;
  }
}

export async function ingestRemoteFile({
  url,
  userId = 'system',
  type = 'other',
  taskId = null,
  sourceProvider = null,
  filename = '',
  contentType = '',
  visibility = 'private',
  timeoutMs = 120000,
} = {}) {
  if (!url) throw Object.assign(new Error('Provider 结果地址无效'), { code: 'STORAGE_SOURCE_URL_INVALID' });

  if (String(url).startsWith('data:')) {
    const match = String(url).match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw Object.assign(new Error('Provider Data URL 无效'), { code: 'STORAGE_SOURCE_URL_INVALID' });
    const mime = match[1] || contentType || 'application/octet-stream';
    const body = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]));
    return ingestBuffer({
      body,
      userId,
      type,
      taskId,
      sourceProvider,
      filename: filename || `provider-result.${MIME_EXTENSIONS.get(mime) || 'bin'}`,
      contentType: mime,
      visibility,
      sourceType: 'generation',
    });
  }

  if (!/^https?:\/\//i.test(String(url))) {
    throw Object.assign(new Error('Provider 结果地址无效'), { code: 'STORAGE_SOURCE_URL_INVALID' });
  }

  const normalizedType = normalizeType(type);
  const { config, adapter, storage } = await getStorageConfigAndAdapter();
  const tempDir = path.join(adapter.storageDir, 'temp');
  await adapter.ensureDir(tempDir);
  const tempPath = path.join(tempDir, `supdance-download-${crypto.randomUUID()}.tmp`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let size = 0;
  const startedAt = Date.now();

  try {
    const response = await fetch(String(url), {
      headers: { Accept: contentType || '*/*', 'User-Agent': 'SupDance-AMHStorage/2.0' },
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw Object.assign(new Error(`Provider 文件下载失败（${response.status}）`), {
        code: 'STORAGE_SOURCE_DOWNLOAD_FAILED',
        statusCode: response.status,
      });
    }

    const declaredSize = Number(response.headers.get('content-length') || 0);
    const limit = config.maxFileBytes[normalizedType] || config.maxFileBytes.other;
    if (declaredSize > limit) {
      throw Object.assign(new Error('Provider 文件超过当前类型大小限制'), { code: 'STORAGE_FILE_TOO_LARGE' });
    }

    const limited = new Readable({ read() {} });
    const reader = response.body.getReader();
    (async () => {
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > limit) {
            throw Object.assign(new Error('Provider 文件超过当前类型大小限制'), { code: 'STORAGE_FILE_TOO_LARGE' });
          }
          limited.push(Buffer.from(next.value));
        }
        limited.push(null);
      } catch (error) {
        limited.destroy(error);
      }
    })();

    await pipeline(limited, fs.createWriteStream(tempPath, { mode: 0o644 }));

    const handle = await fsp.open(tempPath, 'r');
    const head = Buffer.alloc(64 * 1024);
    const readHead = await handle.read(head, 0, head.length, 0);
    await handle.close();

    const mime = detectMime(head.subarray(0, readHead.bytesRead), response.headers.get('content-type') || contentType, filename || url);
    if (!validateMime(mime, normalizedType)) {
      throw Object.assign(new Error(`文件类型与 ${normalizedType} 不匹配`), { code: 'STORAGE_FILE_TYPE_INVALID' });
    }

    const ext = MIME_EXTENSIONS.get(mime) || extensionFromName(filename) || 'bin';
    const key = buildObjectKey({
      userId,
      type: normalizedType,
      filename: filename || `result.${ext}`,
      sourceType: 'generation',
    });

    const checksum = await checksumFile(tempPath);
    const upload = await storage.multipartUpload({ key, filePath: tempPath, contentType: mime });
    const variants = await generateStorageVariants({ storage, objectKey: key, type: normalizedType, mimeType: mime });

    await recordOperation({
      userId,
      provider: adapter.provider,
      objectKey: key,
      operation: 'ingest',
      sizeBytes: size,
      durationMs: Date.now() - startedAt,
      status: 'success',
    });

    return {
      provider: adapter.provider,
      objectKey: key,
      url: storage.getUrl({ key }),
      mimeType: mime,
      extension: ext,
      sizeBytes: size,
      checksum,
      visibility: VISIBILITIES.includes(visibility) ? visibility : 'private',
      sourceType: 'generation',
      sourceProvider,
      sourceTaskId: taskId,
      location: upload.location || null,
      bucket: adapter.bucket || null,
      region: adapter.region || null,
      storageLocationId: config.storageLocationId || null,
      endpoint: adapter.endpoint || config.endpoint || null,
      ...variants,
    };
  } catch (error) {
    const normalized = error?.code
      ? error
      : Object.assign(new Error(`远端文件下载异常: ${error?.message || 'unknown error'}`), {
        code: 'STORAGE_SOURCE_DOWNLOAD_FAILED',
        cause: error,
      });

    await recordOperation({
      userId,
      objectKey: null,
      operation: 'ingest',
      sizeBytes: size || null,
      durationMs: Date.now() - startedAt,
      status: 'failed',
      errorCode: normalized.code,
    });
    throw normalized;
  } finally {
    clearTimeout(timer);
    await fsp.unlink(tempPath).catch(() => {});
  }
}

async function checksumFile(filePath) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

const locationAdapterCache = new Map();

async function adapterForLocation(locationId) {
  if (!locationId) return null;
  const cached = locationAdapterCache.get(locationId);
  if (cached && Date.now() - cached.at < 60_000) return cached.adapter;
  const settings = await loadLocationSettings(locationId).catch(() => null);
  if (!settings) return null;
  const adapter = createStorageAdapter(settings);
  locationAdapterCache.set(locationId, { adapter, at: Date.now() });
  return adapter;
}

/**
 * 按资源自身记录的位置解析适配器。历史资源（provider 为空或 amh）走本地；
 * 远端资源优先使用 storageLocationId 指向的加密凭据，其次使用当前配置。
 */
export async function getAssetStorageAdapter({ provider, locationId, bucket, region } = {}) {
  const located = await adapterForLocation(locationId);
  if (located) return located;
  // 存储位置字段上线前写入的资源没有位置信息，实际都落在本地 AMH 目录。
  const normalized = provider ? normalizeProviderId(provider) : 'local';
  if (normalized === 'local') {
    const config = await getStorageConfig();
    return adapterFromConfig({ ...config, provider: 'local', storageProvider: 'local' });
  }
  const { config, adapter } = await getStorageConfigAndAdapter();
  const current = normalizeProviderId(config.storageProvider || config.provider);
  if (current === normalized) {
    if ((!bucket || bucket === config.bucket) && (!region || region === config.region)) return adapter;
  }
  return null;
}

export async function getAssetUrl({ objectKey, visibility = 'private', disposition = 'inline', provider = null, locationId = null, bucket = null, region = null } = {}) {
  if (!objectKey) return null;
  const raw = String(objectKey).trim();
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return raw;

  const adapter = await getAssetStorageAdapter({ provider, locationId, bucket, region });
  if (!adapter) {
    throw Object.assign(new Error('资源所属存储位置不可用'), { code: 'STORAGE_LOCATION_UNAVAILABLE' });
  }
  return adapter.getSignedUrl({ key: objectKey, disposition });
}

export async function inspectStoredObject({ objectKey, type = 'image', filename = '' } = {}) {
  if (!objectKey) throw Object.assign(new Error('对象 Key 不能为空'), { code: 'STORAGE_OBJECT_KEY_INVALID' });
  const normalizedType = normalizeType(type);
  const { config, adapter } = await getStorageConfigAndAdapter();
  const metadata = await adapter.getMetadata({ key: objectKey });
  const limit = config.maxFileBytes[normalizedType] || config.maxFileBytes.other;

  if (!metadata.size || metadata.size > limit) {
    throw Object.assign(new Error('文件超过当前类型大小限制'), { code: 'STORAGE_FILE_TOO_LARGE' });
  }

  const sample = await adapter.download({ key: objectKey, range: 'bytes=0-65535' });
  const head = Buffer.isBuffer(sample.body) ? sample.body : Buffer.from(sample.body || '');
  const mimeType = detectMime(head, metadata.mimeType, filename);
  if (!validateMime(mimeType, normalizedType)) {
    throw Object.assign(new Error(`文件类型与 ${normalizedType} 不匹配`), { code: 'STORAGE_FILE_TYPE_INVALID' });
  }
  return { ...metadata, mimeType, type: normalizedType };
}

export async function generateStorageVariants({ storage, objectKey, type = 'image', mimeType = '' } = {}) {
  if (!storage || !objectKey || !IMAGE_VARIANT_TYPES.has(normalizeType(type)) || !String(mimeType).startsWith('image/')) {
    return { previewObjectKey: null, thumbnailObjectKey: null, variantStatus: 'not_applicable' };
  }

  const startedAt = Date.now();
  const previewObjectKey = variantObjectKey(objectKey, 'preview');
  const thumbnailObjectKey = variantObjectKey(objectKey, 'thumbnail');

  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default || sharpModule;
    const source = await storage.download({ key: objectKey });
    const body = Buffer.isBuffer(source.body) ? source.body : Buffer.from(source.body || '');
    const image = sharp(body, { failOn: 'error' });
    const metadata = await image.metadata();

    const preview = await image.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const thumbnail = await image.clone().resize({ width: 480, height: 480, fit: 'cover', position: 'attention' }).webp({ quality: 76 }).toBuffer();

    await storage.upload({ key: previewObjectKey, body: preview, contentType: 'image/webp', size: preview.length });
    try {
      await storage.upload({ key: thumbnailObjectKey, body: thumbnail, contentType: 'image/webp', size: thumbnail.length });
    } catch (error) {
      await storage.delete({ key: previewObjectKey }).catch(() => {});
      throw error;
    }

    return {
      previewObjectKey,
      thumbnailObjectKey,
      variantStatus: 'ready',
      width: metadata.width || null,
      height: metadata.height || null,
      variantDurationMs: Date.now() - startedAt,
    };
  } catch (error) {
    await storage.delete({ key: previewObjectKey }).catch(() => {});
    await storage.delete({ key: thumbnailObjectKey }).catch(() => {});
    return {
      previewObjectKey: null,
      thumbnailObjectKey: null,
      variantStatus: 'failed',
      variantErrorCode: error.code || 'STORAGE_VARIANT_FAILED',
      variantDurationMs: Date.now() - startedAt,
    };
  }
}

export async function prepareDirectUpload({ userId, type, filename, mimeType, sizeBytes } = {}) {
  const normalizedType = normalizeType(type);
  const { config, adapter } = await getStorageConfigAndAdapter();
  const limit = config.maxFileBytes[normalizedType] || config.maxFileBytes.other;

  if (!Number.isFinite(Number(sizeBytes)) || Number(sizeBytes) <= 0) {
    throw Object.assign(new Error('文件大小无效'), { code: 'STORAGE_FILE_SIZE_INVALID' });
  }
  if (Number(sizeBytes) > limit) {
    throw Object.assign(new Error('文件超过当前类型大小限制'), { code: 'STORAGE_FILE_TOO_LARGE' });
  }
  if (!validateMime(mimeType, normalizedType)) {
    throw Object.assign(new Error('文件类型不在允许范围内'), { code: 'STORAGE_FILE_TYPE_INVALID' });
  }

  const extension = MIME_EXTENSIONS.get(String(mimeType).split(';')[0].toLowerCase()) || extensionFromName(filename) || 'bin';
  const objectKey = buildObjectKey({
    userId,
    type: normalizedType,
    filename: `${path.basename(filename || 'asset')}.${extension}`,
    sourceType: 'user_upload',
  });

  return {
    provider: adapter.provider,
    objectKey,
    uploadUrl: '/api/assets/upload',
    method: 'POST',
    url: adapter.getUrl({ key: objectKey }),
    headers: { 'Content-Type': String(mimeType).split(';')[0].toLowerCase() },
  };
}

export async function testStorageConnection() {
  const adapter = await getStorageAdapter();
  return adapter.testConnection();
}

export async function getStorageMetrics() {
  const config = await getStorageConfig().catch(() => null);
  const provider = config?.storageProvider || 'local';
  try {
    const [today, total] = await Promise.all([
      queryOne(`
        SELECT COALESCE(SUM(file_size_bytes), 0)::bigint AS bytes,
               COUNT(*)::int AS files
        FROM ai_studio.user_assets
        WHERE created_at >= CURRENT_DATE AND deleted_at IS NULL AND storage_status = 'ready'
      `),
      queryOne(`
        SELECT COALESCE(SUM(file_size_bytes), 0)::bigint AS bytes,
               COUNT(*)::int AS files
        FROM ai_studio.user_assets
        WHERE deleted_at IS NULL AND storage_status = 'ready'
      `),
    ]);
    const failures = await queryOne(`
      SELECT COUNT(*)::int AS count
      FROM ai_studio.storage_operation_logs
      WHERE created_at >= CURRENT_DATE AND status = 'failed'
    `).catch(() => ({ count: 0 }));

    return {
      provider,
      todayBytes: Number(today?.bytes || 0),
      todayFiles: Number(today?.files || 0),
      totalBytes: Number(total?.bytes || 0),
      totalFiles: Number(total?.files || 0),
      failedUploads: Number(failures?.count || 0),
      source: 'amh_storage',
    };
  } catch {
    return { provider, todayBytes: 0, todayFiles: 0, totalBytes: 0, totalFiles: 0, failedUploads: 0, source: 'unavailable' };
  }
}
