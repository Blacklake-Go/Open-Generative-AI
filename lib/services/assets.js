import 'server-only';

import * as assetRepo from '../repositories/assets.js';
import { getAssetUrl } from '../storage/storageService.js';

export async function getUserAssetFolders(userId) {
  if (!userId) throw new Error('User ID is required');
  const folders = await assetRepo.listAssetFolders(userId);
  
  // 组装成两级树形结构，方便前端直接消费或按扁平数组消费
  const rootFolders = [];
  const folderMap = new Map();

  for (const f of folders) {
    folderMap.set(f.id, { ...f, children: [] });
  }

  for (const f of folders) {
    const item = folderMap.get(f.id);
    if (!f.parent_id) {
      rootFolders.push(item);
    } else {
      const parent = folderMap.get(f.parent_id);
      if (parent) {
        parent.children.push(item);
      } else {
        rootFolders.push(item);
      }
    }
  }

  return {
    folders,
    folderTree: rootFolders,
  };
}

export async function createUserAssetFolder(userId, { name, parentId = null, color = '#e11d74', icon = 'folder' }) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.createAssetFolder({
    userId,
    parentId,
    name,
    color,
    icon,
  });
}

export async function updateUserAssetFolder(userId, folderId, payload) {
  if (!userId || !folderId) throw new Error('User ID and folderId are required');
  return assetRepo.updateAssetFolder(userId, folderId, payload);
}

export async function deleteUserAssetFolder(userId, folderId) {
  if (!userId || !folderId) throw new Error('User ID and folderId are required');
  return assetRepo.deleteAssetFolder(userId, folderId);
}

export async function getUserAssets(userId, options = {}) {
  if (!userId) throw new Error('User ID is required');
  const result = await assetRepo.listUserAssets({
    userId,
    assetType: options.assetType || options.type || 'all',
    folderId: options.folderId || options.folder_id || 'all',
    search: options.search || '',
    isFavorite: Boolean(options.isFavorite || options.favoriteOnly || options.favorite),
    page: options.page || 1,
    limit: options.limit || 30,
    sort: options.sort || 'newest',
  });
  return {
    ...result,
    assets: await Promise.all(result.assets.map(toClientAsset)),
  };
}

export async function getUserAsset(userId, assetId) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  const asset = await assetRepo.getUserAssetById(userId, assetId);
  return asset ? toClientAsset(asset) : null;
}

export async function getUserAssetByCreationId(userId, creationId) {
  if (!userId || !creationId) throw new Error('User ID and creation ID are required');
  const asset = await assetRepo.getUserAssetByCreationId(userId, creationId);
  return asset ? toClientAsset(asset) : null;
}

export async function getCanvasUploadAssetByIdempotencyHash(userId, keyHash) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.getCanvasUploadAssetByIdempotencyHash(userId, keyHash);
}

export async function getUserAssetDownload(userId, assetId) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  const asset = await assetRepo.getUserAssetById(userId, assetId);
  if (!asset) return null;
  return {
    objectKey: asset.object_key || null,
    mediaUrl: asset.media_url || null,
    mimeType: asset.mime_type || null,
    sizeBytes: Number(asset.file_size_bytes || 0),
    visibility: asset.visibility || 'private',
    deletedAt: asset.deleted_at || null,
  };
}

export async function recordUserAsset(userId, payload) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.createUserAsset({
    userId,
    ...payload,
  });
}

export async function updateUserAsset(userId, assetId, payload) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  return assetRepo.updateUserAsset(userId, assetId, payload);
}

export async function deleteUserAsset(userId, assetId) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  return assetRepo.deleteUserAsset(userId, assetId);
}

export async function batchMoveUserAssets(userId, assetIds, targetFolderId) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.batchMoveAssets(userId, assetIds, targetFolderId);
}

export async function batchDeleteUserAssets(userId, assetIds) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.batchDeleteAssets(userId, assetIds);
}

export async function getUserAssetCounts(userId) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.getAssetCountsByType(userId);
}

/**
 * 将底层生成任务创建自动映射入用户私有资产库
 */
export async function syncCreationToAsset(creation, { transaction = null, required = false } = {}) {
  const syncError = (cause = null) => Object.assign(new Error('生成结果未能写入用户私有资产库'), {
    code: 'STORAGE_ASSET_SYNC_FAILED',
    ...(cause ? { cause } : {}),
  });
  if (!creation?.id || !creation.user_id || (!creation.result_url && !creation.result_object_key)) {
    if (required) throw syncError();
    return null;
  }
  if (required && !creation.result_object_key) throw syncError();

  try {
    const existing = await assetRepo.getUserAssetByCreationId(creation.user_id, creation.id, transaction);
    if (existing) {
      if (required && (!existing.id || !existing.object_key || existing.visibility !== 'private')) {
        throw syncError();
      }
      return existing;
    }

    let input = {};
    try {
      input = typeof creation.input_summary_json === 'string'
        ? JSON.parse(creation.input_summary_json)
        : (creation.input_summary_json || {});
    } catch {}

    const prompt = input.prompt || creation.label || '';
    const studioId = String(creation.studio_id || 'image').toLowerCase();

    let assetType = 'image';
    if (studioId.includes('video') || studioId.includes('motion') || studioId.includes('cinema') || studioId.includes('clip') || studioId.includes('lip')) {
      assetType = 'video';
    } else if (studioId.includes('audio') || studioId.includes('music') || studioId.includes('sound')) {
      assetType = 'audio';
    } else if (studioId.includes('workflow') || studioId.includes('agent') || studioId.includes('design')) {
      assetType = 'workflow';
    }

    const asset = await assetRepo.createUserAsset({
      transaction,
      userId: creation.user_id,
      creationId: creation.id,
      assetType,
      studioId: creation.studio_id || 'image',
      title: creation.label || prompt.substring(0, 30) || '生成素材',
      mediaUrl: creation.result_url || null,
      thumbnailUrl: creation.result_url || null,
      previewUrl: creation.result_url || null,
      objectKey: creation.result_object_key || null,
      previewObjectKey: creation.storage_preview_object_key || null,
      thumbnailObjectKey: creation.storage_thumbnail_object_key || null,
      bucket: creation.storage_bucket || null,
      region: creation.storage_region || null,
      mimeType: creation.storage_mime_type || (assetType === 'video' ? 'video/mp4' : assetType === 'audio' ? 'audio/mpeg' : 'image/webp'),
      fileSizeBytes: creation.storage_size_bytes || 0,
      checksum: creation.storage_checksum || null,
      visibility: 'private',
      sourceType: 'generation',
      sourceProvider: creation.provider || null,
      sourceTaskId: creation.id,
      storageStatus: creation.storage_status || 'ready',
      prompt,
      negativePrompt: input.negative_prompt || input.negativePrompt || '',
      modelId: creation.model,
      modelName: creation.model,
      provider: creation.provider,
      generationParams: input.parameters || input || creation.metadata_json || {},
      creditCost: creation.credit_cost || 0,
      generationDurationMs: creation.duration_ms || 0,
      aspectRatio: input.aspect_ratio || input.aspectRatio || null,
      width: input.width || null,
      height: input.height || null,
    });
    if (required && (!asset?.id || !asset.object_key || asset.visibility !== 'private')) {
      throw syncError();
    }
    return asset;
  } catch (err) {
    const existing = await assetRepo.getUserAssetByCreationId(creation.user_id, creation.id, transaction).catch(() => null);
    if (existing && (!required || (existing.id && existing.object_key && existing.visibility === 'private'))) return existing;
    if (required) throw syncError(err);
    console.error('[syncCreationToAsset] failed:', err.message);
    return null;
  }
}

export async function toClientAsset(asset) {
  if (!asset) return null;
  const [url, thumbnailUrl, previewUrl] = await Promise.all([
    asset.object_key ? getAssetUrl({ objectKey: asset.object_key, visibility: asset.visibility || 'private' }).catch(() => null) : Promise.resolve(asset.media_url || null),
    asset.thumbnail_object_key ? getAssetUrl({ objectKey: asset.thumbnail_object_key, visibility: asset.visibility || 'private' }).catch(() => null) : (asset.thumbnail_url ? Promise.resolve(asset.thumbnail_url) : Promise.resolve(null)),
    asset.preview_object_key ? getAssetUrl({ objectKey: asset.preview_object_key, visibility: asset.visibility || 'private' }).catch(() => null) : (asset.preview_url ? Promise.resolve(asset.preview_url) : Promise.resolve(null)),
  ]);
  const resolvedUrl = url || asset.media_url || null;
  return {
    id: asset.id,
    type: asset.asset_type,
    category: asset.asset_type,
    url: resolvedUrl,
    thumbnailUrl: thumbnailUrl || resolvedUrl,
    previewUrl: previewUrl || resolvedUrl,
    width: asset.width,
    height: asset.height,
    duration: asset.duration_seconds,
    mimeType: asset.mime_type,
    size: Number(asset.file_size_bytes || 0),
    checksum: asset.checksum || null,
    visibility: asset.visibility || 'private',
    status: asset.status,
    storageStatus: asset.storage_status || 'ready',
    title: asset.title || (asset.prompt ? asset.prompt.slice(0, 30) : '素材'),
    createdAt: asset.created_at,
    folderId: asset.folder_id,
    folderName: asset.folder_name || null,
    folderColor: asset.folder_color || null,
    prompt: asset.prompt || '',
    negativePrompt: asset.negative_prompt || '',
    model: asset.model_name || asset.model_id || 'AI Model',
    aspectRatio: asset.aspect_ratio || 'auto',
    quality: asset.generation_params?.quality || '2K',
    starred: Boolean(asset.is_favorite),
    creditCost: asset.credit_cost || 0,
    tags: Array.isArray(asset.tags) ? asset.tags : [],
  };
}
