import 'server-only';

import * as assetRepo from '../repositories/assets.js';
import { toClientAsset } from './assets.js';
import { getAssetStorageAdapter } from '../storage/storageService.js';
import { getEntitlements } from './billing.js';

const MAX_TEXT_CONTENT = 500_000;
const MAX_TAGS = 40;

function trimText(value, max = 255) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean)
    .map((tag) => tag.slice(0, 64)))]
    .slice(0, MAX_TAGS);
}

function normalizeLibraryQuery(options = {}) {
  return {
    status: options.status === 'trash' ? 'trash' : 'ready',
    kind: options.kind && options.kind !== 'all' ? String(options.kind) : 'all',
    category: options.category && options.category !== 'all' ? String(options.category) : 'all',
    folderId: options.folderId || options.folder_id || 'all',
    uncategorized: Boolean(options.uncategorized),
    search: typeof options.search === 'string' ? options.search.slice(0, 200) : '',
    page: Math.max(1, Number(options.page) || 1),
    pageSize: Math.min(200, Math.max(1, Number(options.pageSize) || 40)),
  };
}

function normalizeAssetIds(assetIds) {
  if (!Array.isArray(assetIds)) return [];
  return [...new Set(assetIds
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id) => id && id.length <= 128))]
    .slice(0, 200);
}

export async function getLibraryAssets(userId, options = {}) {
  if (!userId) throw new Error('User ID is required');
  const query = normalizeLibraryQuery(options);
  const [page, facets] = await Promise.all([
    assetRepo.listLibraryAssets({ userId, ...query }),
    assetRepo.getLibraryFacetCounts({ userId, ...query }),
  ]);

  return {
    assets: await Promise.all(page.assets.map(toLibraryAsset)),
    ...facets,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    hasMore: page.hasMore,
  };
}

export async function getLibraryAsset(userId, assetId) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  const asset = await assetRepo.getUserAssetById(userId, assetId);
  return asset ? toLibraryAsset(asset) : null;
}

export async function createLibraryAsset(userId, payload = {}) {
  if (!userId) throw new Error('User ID is required');
  const kind = payload.kind === 'entity' ? 'entity' : 'text';
  const title = trimText(payload.title, 255) || (kind === 'entity' ? '未命名角色' : '未命名文本');
  const source = trimText(payload.source, 255) || null;
  const note = typeof payload.note === 'string' ? payload.note.slice(0, 20_000) : null;
  const coverUrl = trimText(payload.coverUrl, 2048) || null;
  const category = typeof payload.category === 'string' ? payload.category : 'other';
  const folderId = typeof payload.folderId === 'string' && payload.folderId.trim() ? payload.folderId.trim() : null;
  const tags = normalizeTags(payload.tags);

  let assetData;
  if (kind === 'text') {
    const content = typeof payload.data?.content === 'string' ? payload.data.content : '';
    if (!content.trim()) {
      throw Object.assign(new Error('文本内容不能为空'), { code: 'INVALID_ASSET_DATA' });
    }
    if (content.length > MAX_TEXT_CONTENT) {
      throw Object.assign(new Error('文本内容过长，最多 50 万字符'), { code: 'INVALID_ASSET_DATA' });
    }
    assetData = { content };
  } else {
    const definition = payload.data?.definition && typeof payload.data.definition === 'object' && !Array.isArray(payload.data.definition)
      ? payload.data.definition
      : {};
    assetData = { definition };
  }

  const asset = await assetRepo.createUserAsset({
    userId,
    folderId,
    assetType: 'other',
    studioId: 'library',
    title,
    mediaUrl: null,
    mimeType: kind === 'text' ? 'text/plain' : 'application/json',
    prompt: '',
    kind,
    category,
    source,
    note,
    coverUrl,
    assetData,
    tags,
    visibility: 'private',
    sourceType: kind === 'text' ? 'library_text' : 'library_entity',
  });

  return toLibraryAsset(asset);
}

export async function updateLibraryAsset(userId, assetId, payload = {}) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  const existing = await assetRepo.getUserAssetById(userId, assetId);
  if (!existing) {
    throw Object.assign(new Error('素材资产不存在'), { code: 'ASSET_NOT_FOUND' });
  }

  const updates = {};
  if (payload.title !== undefined) updates.title = trimText(payload.title, 255);
  if (payload.category !== undefined) updates.category = payload.category;
  if (payload.tags !== undefined) updates.tags = normalizeTags(payload.tags);
  if (payload.source !== undefined) updates.source = payload.source;
  if (payload.note !== undefined) updates.note = payload.note;
  if (payload.folderId !== undefined) updates.folderId = payload.folderId;
  if (payload.coverUrl !== undefined) updates.coverUrl = payload.coverUrl;
  if (payload.isFavorite !== undefined) updates.isFavorite = Boolean(payload.isFavorite);

  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    const base = existing.asset_data && typeof existing.asset_data === 'object' ? existing.asset_data : {};
    if (existing.kind === 'text') {
      const content = typeof payload.data.content === 'string' ? payload.data.content : base.content || '';
      if (!content.trim()) {
        throw Object.assign(new Error('文本内容不能为空'), { code: 'INVALID_ASSET_DATA' });
      }
      if (content.length > MAX_TEXT_CONTENT) {
        throw Object.assign(new Error('文本内容过长，最多 50 万字符'), { code: 'INVALID_ASSET_DATA' });
      }
      updates.assetData = { ...base, content };
    } else if (existing.kind === 'entity') {
      updates.assetData = {
        ...base,
        definition: payload.data.definition && typeof payload.data.definition === 'object' && !Array.isArray(payload.data.definition)
          ? payload.data.definition
          : (base.definition || {}),
      };
    }
  }

  const updated = await assetRepo.updateUserAsset(userId, assetId, updates);
  return toLibraryAsset(updated);
}

export async function trashLibraryAssets(userId, assetIds) {
  const ids = normalizeAssetIds(assetIds);
  if (!ids.length) throw Object.assign(new Error('请选择要操作的素材'), { code: 'INVALID_ASSET_IDS' });
  const count = await assetRepo.trashAssets(userId, ids);
  return { success: true, count };
}

export async function restoreLibraryAssets(userId, assetIds) {
  const ids = normalizeAssetIds(assetIds);
  if (!ids.length) throw Object.assign(new Error('请选择要恢复的素材'), { code: 'INVALID_ASSET_IDS' });
  const count = await assetRepo.restoreAssets(userId, ids);
  return { success: true, count };
}

export async function purgeLibraryAssets(userId, assetIds) {
  const ids = normalizeAssetIds(assetIds);
  if (!ids.length) throw Object.assign(new Error('请选择要彻底删除的素材'), { code: 'INVALID_ASSET_IDS' });
  const purged = await assetRepo.purgeAssets(userId, ids);
  await deleteStoredObjects(purged);
  return { success: true, count: purged.length, deletedIds: purged.map((row) => row.id) };
}

export async function emptyLibraryTrash(userId) {
  if (!userId) throw new Error('User ID is required');
  let count = 0;
  for (let batch = 0; batch < 50; batch += 1) {
    const rows = await assetRepo.listTrashAssets(userId, 200);
    if (!rows.length) break;
    const purged = await assetRepo.purgeAssets(userId, rows.map((row) => row.id));
    await deleteStoredObjects(purged);
    count += purged.length;
    if (rows.length < 200) break;
  }
  return { success: true, count };
}

export async function getLibraryUsage(userId) {
  if (!userId) throw new Error('User ID is required');
  const usage = await assetRepo.getAssetStorageUsage(userId);
  let planId = 'free';
  let planName = '免费版';
  let storageGb = 1;
  try {
    const entitlements = await getEntitlements(userId);
    planId = entitlements.planId;
    planName = entitlements.planName;
    storageGb = Number(entitlements.storageGb || 0);
  } catch (error) {
    console.error('[asset-library] entitlements unavailable:', error?.code || error?.message);
  }
  const quotaBytes = Math.max(0, storageGb) * 1024 ** 3;
  return {
    usedBytes: usage.usedBytes,
    assetCount: usage.assetCount,
    quotaBytes,
    storageGb,
    planId,
    planName,
    percent: quotaBytes > 0 ? Math.min(100, (usage.usedBytes / quotaBytes) * 100) : 0,
  };
}

const BYTES_PER_GB = 1024 ** 3;

/** 上传落库前的容量闸门：套餐容量未知时放行（避免计费库抖动阻断上传）。 */
export async function assertStorageQuota(userId, incomingBytes = 0) {
  if (!userId) throw new Error('User ID is required');
  const usage = await assetRepo.getAssetStorageUsage(userId);
  let storageGb;
  try {
    const entitlements = await getEntitlements(userId);
    storageGb = Number(entitlements.storageGb || 0);
  } catch (error) {
    console.error('[asset-library] quota check skipped:', error?.code || error?.message);
    return { enforced: false, usedBytes: usage.usedBytes, quotaBytes: 0 };
  }
  const quotaBytes = Math.max(0, storageGb) * BYTES_PER_GB;
  if (quotaBytes <= 0) return { enforced: false, usedBytes: usage.usedBytes, quotaBytes: 0, storageGb };
  const size = Math.max(0, Number(incomingBytes) || 0);
  if (usage.usedBytes + size > quotaBytes) {
    const error = new Error('存储空间不足，请清理素材或升级套餐后再上传');
    error.code = 'STORAGE_QUOTA_EXCEEDED';
    error.quota = {
      usedBytes: usage.usedBytes,
      quotaBytes,
      storageGb,
      incomingBytes: size,
      remainingBytes: Math.max(0, quotaBytes - usage.usedBytes),
    };
    throw error;
  }
  return { enforced: true, usedBytes: usage.usedBytes, quotaBytes, storageGb };
}

const MAX_EXPORT_ASSETS = 1000;

export async function getLibraryExportAssets(userId, { assetIds = [] } = {}) {
  if (!userId) throw new Error('User ID is required');
  const rows = [];
  const ids = normalizeAssetIds(assetIds);
  if (ids.length) {
    for (const id of ids) {
      const row = await assetRepo.getUserAssetById(userId, id);
      if (row && row.status === 'ready' && !row.deleted_at) rows.push(row);
    }
  } else {
    let page = 1;
    while (rows.length < MAX_EXPORT_ASSETS) {
      const result = await assetRepo.listLibraryAssets({ userId, status: 'ready', page, pageSize: 200 });
      rows.push(...result.assets);
      if (!result.hasMore || !result.assets.length) break;
      page += 1;
    }
    rows.length = Math.min(rows.length, MAX_EXPORT_ASSETS);
  }
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    // 画布工程行只是指向在线工程的引用，没有可导出的文件内容
    if (row.kind === 'canvas') continue;
    items.push({ row, asset: await toLibraryAsset(row) });
  }
  return items;
}

export async function purgeExpiredTrashAssets({ days = 30, limit = 200 } = {}) {
  let deletedCount = 0;
  const deletedIds = [];
  for (let batch = 0; batch < 50; batch += 1) {
    const rows = await assetRepo.getExpiredTrashAssets({ days, limit });
    if (!rows.length) break;
    await deleteStoredObjects(rows);
    const purged = await assetRepo.purgeAssetRows(rows.map((row) => row.id));
    deletedCount += purged.length;
    deletedIds.push(...purged.map((row) => row.id));
    if (rows.length < limit) break;
  }
  return { deletedCount, deletedIds };
}

async function deleteStoredObjects(rows) {
  for (const row of rows) {
    const keys = [row.object_key, row.preview_object_key, row.thumbnail_object_key].filter(Boolean);
    if (!keys.length) continue;
    try {
      const adapter = await getAssetStorageAdapter({
        provider: row.storage_provider,
        locationId: row.storage_location_id,
        bucket: row.bucket,
        region: row.region,
      });
      for (const key of keys) {
        try {
          await adapter.delete({ key });
        } catch (error) {
          console.error('[asset-library] storage delete failed:', { assetId: row.id, key, code: error?.code || error?.message });
        }
      }
    } catch (error) {
      console.error('[asset-library] storage adapter unavailable:', { assetId: row.id, code: error?.code || error?.message });
    }
  }
}

export async function toLibraryAsset(asset) {
  if (!asset) return null;
  const client = await toClientAsset(asset);
  const assetData = asset.asset_data && typeof asset.asset_data === 'object' ? asset.asset_data : {};
  const kind = asset.kind || 'image';
  const durationMs = asset.duration_seconds ? Math.round(Number(asset.duration_seconds) * 1000) : 0;

  const data = kind === 'text'
    ? { content: assetData.content || asset.prompt || '' }
    : kind === 'entity'
      ? { definition: assetData.definition || {} }
      : kind === 'canvas'
        ? {
            projectId: assetData.canvasProjectId || null,
            version: Number(assetData.version || 1),
            url: assetData.url || (assetData.canvasProjectId ? `/canvas/${assetData.canvasProjectId}` : null),
            coverUrl: client.coverUrl,
          }
        : kind === 'model'
          ? {
              url: client.url,
              fileName: asset.original_filename || asset.filename || '',
              bytes: client.size,
              mimeType: client.mimeType,
              checksum: asset.checksum || null,
            }
          : {
              url: client.url,
              thumbnailUrl: client.thumbnailUrl,
              previewUrl: client.previewUrl,
              width: client.width,
              height: client.height,
              bytes: client.size,
              mimeType: client.mimeType,
              durationMs,
            };

  return {
    ...client,
    kind,
    category: asset.category || 'other',
    title: client.title,
    tags: client.tags,
    source: asset.source || '',
    note: asset.note || '',
    folderId: asset.folder_id || null,
    folderName: asset.folder_name || null,
    folderColor: asset.folder_color || null,
    coverUrl: asset.cover_url || null,
    createdAt: client.createdAt,
    updatedAt: asset.updated_at || null,
    trashedAt: asset.trashed_at || asset.deleted_at || null,
    metadata: {
      prompt: client.prompt,
      negativePrompt: client.negativePrompt,
      model: client.model,
      provider: asset.provider || null,
      width: client.width,
      height: client.height,
      aspectRatio: client.aspectRatio,
      durationMs,
      bytes: client.size,
      mimeType: client.mimeType,
      creditCost: client.creditCost,
      generationParams: asset.generation_params || {},
    },
    data,
  };
}
