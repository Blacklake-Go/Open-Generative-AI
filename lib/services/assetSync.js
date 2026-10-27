import 'server-only';

import crypto from 'node:crypto';
import { ingestBuffer } from '../storage/storageService.js';
import { recordUserAsset, toClientAsset } from './assets.js';
import {
  createSyncLink,
  createSyncToken,
  deleteSyncLink,
  getSyncLink,
  getUserBySyncTokenHash,
  listUserAssetsForSync,
  listSyncTokens,
  revokeSyncToken,
  touchSyncToken,
} from '../repositories/assetSync.js';
import { getUserAsset, deleteUserAsset } from './assets.js';

const TOKEN_PREFIX = 'sds_';
const EXTERNAL_SYSTEMS = new Set(['yingce']);
const MAX_BYTES = { image: 20 * 1024 * 1024, video: 100 * 1024 * 1024, audio: 40 * 1024 * 1024 };

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export async function createAssetSyncToken(userId, { label = '' } = {}) {
  if (!userId) throw Object.assign(new Error('User is required'), { code: 'UNAUTHENTICATED' });
  const token = TOKEN_PREFIX + crypto.randomBytes(24).toString('base64url');
  const record = await createSyncToken({ userId, tokenHash: hashToken(token), label: String(label || '').slice(0, 120) });
  return { token, record };
}

export async function getAssetSyncTokens(userId) {
  return listSyncTokens(userId);
}

export async function revokeAssetSyncToken(userId, tokenId) {
  const row = await revokeSyncToken(userId, tokenId);
  return Boolean(row);
}

export async function authenticateAssetSyncRequest(request) {
  const header = String(request?.headers?.get?.('authorization') || '');
  const match = header.match(/^Bearer\s+(sds_[A-Za-z0-9_-]{20,80})$/);
  if (!match) return null;
  const row = await getUserBySyncTokenHash(hashToken(match[1]));
  if (!row) return null;
  void touchSyncToken(row.token_id);
  return row;
}

export async function listSyncedAssets(user, { since = null, limit = 100, assetType = 'all' } = {}) {
  if (!user?.id) throw Object.assign(new Error('User is required'), { code: 'UNAUTHENTICATED' });
  const rows = await listUserAssetsForSync(user.id, { since, limit, assetType });
  return rows.map((row) => ({
    id: row.id,
    type: row.asset_type,
    title: row.title || '',
    mimeType: row.mime_type || '',
    size: Number(row.file_size_bytes || 0),
    width: row.width || null,
    height: row.height || null,
    checksum: row.checksum || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasPreview: Boolean(row.has_preview),
    contentUrl: `/api/canvas/assets/${encodeURIComponent(row.id)}/content`,
  }));
}

export async function importSyncedAsset(user, { externalSystem, externalId, title, assetType, mimeType, buffer, width, height, filename }) {
  if (!user?.id) throw Object.assign(new Error('User is required'), { code: 'UNAUTHENTICATED' });
  const system = String(externalSystem || '').toLowerCase();
  if (!EXTERNAL_SYSTEMS.has(system)) throw Object.assign(new Error('不支持的外部资产来源'), { code: 'SYNC_SYSTEM_UNSUPPORTED' });
  const external = String(externalId || '').trim();
  if (!external || external.length > 200) throw Object.assign(new Error('外部资产 ID 无效'), { code: 'SYNC_EXTERNAL_ID_INVALID' });
  const existing = await getSyncLink(user.id, system, external);
  if (existing) {
    const asset = await getUserAsset(user.id, existing.asset_id);
    if (asset) return { asset, idempotent: true };
  }
  const type = String(assetType || '').toLowerCase();
  const declaredMime = String(mimeType || '').toLowerCase();
  const resolvedType = ['image', 'video', 'audio'].includes(type) ? type : declaredMime.startsWith('image/') ? 'image' : declaredMime.startsWith('video/') ? 'video' : declaredMime.startsWith('audio/') ? 'audio' : '';
  if (!resolvedType) throw Object.assign(new Error('仅支持图片、视频或音频资产'), { code: 'SYNC_TYPE_UNSUPPORTED' });
  if (!buffer?.length) throw Object.assign(new Error('资产内容为空'), { code: 'SYNC_CONTENT_EMPTY' });
  if (buffer.length > MAX_BYTES[resolvedType]) throw Object.assign(new Error('资产超过同步大小上限'), { code: 'SYNC_CONTENT_TOO_LARGE' });
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeUserId = String(user.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const externalHash = crypto.createHash('sha256').update(external).digest('hex');
  const objectKey = `uploads/${safeUserId}/canvas/${externalHash}-${checksum}.bin`;
  const stored = await ingestBuffer({
    body: buffer,
    userId: user.id,
    type: resolvedType,
    filename: String(filename || `${external}.bin`),
    contentType: declaredMime || `${resolvedType}/octet-stream`,
    sourceType: 'asset_sync',
    sourceProvider: system,
    objectKey,
  });
  const asset = await recordUserAsset(user.id, {
    assetType: resolvedType,
    studioId: 'sync',
    title: String(title || filename || '同步素材').slice(0, 160),
    objectKey: stored.objectKey,
    previewObjectKey: stored.previewObjectKey || null,
    thumbnailObjectKey: stored.thumbnailObjectKey || null,
    bucket: stored.bucket || null,
    region: stored.region || null,
    mimeType: stored.mimeType || declaredMime,
    fileSizeBytes: stored.sizeBytes || buffer.length,
    width: Number.isFinite(Number(width)) && Number(width) > 0 ? Number(width) : null,
    height: Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : null,
    checksum: stored.checksum || checksum,
    visibility: 'private',
    sourceType: 'asset_sync',
    sourceProvider: system,
    storageStatus: 'ready',
    generationParams: { asset_sync: { system, external_id: external } },
  });
  await createSyncLink({ userId: user.id, externalSystem: system, externalId: external, assetId: asset.id, direction: 'import', metadata: { title: asset.title, mimeType: asset.mime_type } });
  return { asset: await toClientAsset(asset), idempotent: false };
}

export async function removeSyncedAsset(user, { externalSystem, externalId }) {
  if (!user?.id) throw Object.assign(new Error('User is required'), { code: 'UNAUTHENTICATED' });
  const system = String(externalSystem || '').toLowerCase();
  const external = String(externalId || '').trim();
  const link = await getSyncLink(user.id, system, external);
  if (!link) return { removed: false };
  await deleteUserAsset(user.id, link.asset_id).catch(() => null);
  await deleteSyncLink(user.id, system, external);
  return { removed: true, assetId: link.asset_id };
}
