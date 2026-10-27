import 'server-only';

import crypto from 'node:crypto';
import { query, queryMany, queryOne, nowIso, withTransaction } from '../db/index.js';

function generateId(prefix = 'ast') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export const LIBRARY_KINDS = ['text', 'image', 'video', 'audio', 'model', 'entity', 'canvas'];
export const LIBRARY_CATEGORIES = ['character', 'environment', 'prop', 'material', 'other'];

function normalizeLibraryKind(assetType, kind) {
  if (LIBRARY_KINDS.includes(kind)) return kind;
  const type = String(assetType || '').toLowerCase();
  if (type === 'video') return 'video';
  if (type === 'audio' || type === 'music') return 'audio';
  if (type === 'document') return 'text';
  return 'image';
}

function normalizeLibraryCategory(category) {
  return LIBRARY_CATEGORIES.includes(category) ? category : 'other';
}

function buildLibraryWhere({
  userId,
  status = 'ready',
  kind = 'all',
  category = 'all',
  folderId = 'all',
  uncategorized = false,
  search = '',
}, exclude = null) {
  const params = [userId];
  const conditions = ['a.user_id = $1'];

  if (status === 'trash') {
    conditions.push("a.status = 'trash'");
  } else if (status === 'archived') {
    conditions.push("a.status = 'archived'", 'a.deleted_at IS NULL');
  } else {
    conditions.push("a.status = 'ready'", 'a.deleted_at IS NULL');
  }

  if (exclude !== 'folder') {
    if (uncategorized || folderId === 'uncategorized') {
      conditions.push('a.folder_id IS NULL');
    } else if (folderId && folderId !== 'all') {
      params.push(folderId);
      conditions.push(`a.folder_id = $${params.length}`);
    }
  }

  if (exclude !== 'kind' && kind && kind !== 'all') {
    params.push(kind);
    conditions.push(`a.kind = $${params.length}`);
  }

  if (exclude !== 'category' && category && category !== 'all') {
    params.push(category);
    conditions.push(`a.category = $${params.length}`);
  }

  if (exclude !== 'search' && search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    const idx = params.length;
    conditions.push(`(a.title ILIKE $${idx} OR a.prompt ILIKE $${idx} OR COALESCE(a.source, '') ILIKE $${idx} OR COALESCE(a.note, '') ILIKE $${idx} OR a.asset_data::text ILIKE $${idx} OR array_to_string(a.tags, ' ') ILIKE $${idx})`);
  }

  return { whereSql: conditions.join(' AND '), params };
}

// ==========================================
// 文件夹相关仓储方法 (两级子文件夹)
// ==========================================

export async function listAssetFolders(userId) {
  return queryMany(`
    SELECT 
      f.*,
      COALESCE(counts.asset_count, 0)::int AS asset_count
    FROM ai_studio.asset_folders f
    LEFT JOIN (
      SELECT folder_id, COUNT(*) AS asset_count
      FROM ai_studio.user_assets
      WHERE user_id = $1 AND status = 'ready' AND folder_id IS NOT NULL
      GROUP BY folder_id
    ) counts ON f.id = counts.folder_id
    WHERE f.user_id = $1
    ORDER BY f.depth ASC, f.sort_order ASC, f.created_at ASC
  `, [userId]);
}

export async function getAssetFolderById(userId, folderId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT * FROM ai_studio.asset_folders
    WHERE id = $1 AND user_id = $2
  `, [folderId, userId]);
}

export async function createAssetFolder({ userId, parentId = null, name, color = '#e11d74', icon = 'folder' }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    const err = new Error('文件夹名称不能为空');
    err.code = 'INVALID_FOLDER_NAME';
    throw err;
  }
  if (trimmedName.length > 128) {
    const err = new Error('文件夹名称不能超过128字符');
    err.code = 'INVALID_FOLDER_NAME';
    throw err;
  }

  let depth = 1;
  if (parentId) {
    const parent = await getAssetFolderById(userId, parentId);
    if (!parent) {
      const err = new Error('父级文件夹不存在');
      err.code = 'PARENT_FOLDER_NOT_FOUND';
      throw err;
    }
    if (parent.depth >= 2) {
      const err = new Error('资产库最多支持两级子文件夹分类');
      err.code = 'FOLDER_DEPTH_EXCEEDED';
      throw err;
    }
    depth = 2;
  }

  const existing = await queryOne(`
    SELECT id FROM ai_studio.asset_folders
    WHERE user_id = $1 
      AND COALESCE(parent_id, 'root') = COALESCE($2, 'root')
      AND name = $3
  `, [userId, parentId, trimmedName]);

  if (existing) {
    const err = new Error('同层级下已存在同名文件夹');
    err.code = 'FOLDER_NAME_DUPLICATE';
    throw err;
  }

  const folderId = generateId('fld');
  return queryOne(`
    INSERT INTO ai_studio.asset_folders (
      id, user_id, parent_id, depth, name, color, icon, sort_order, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 0, now(), now()
    )
    RETURNING *
  `, [folderId, userId, parentId || null, depth, trimmedName, color, icon]);
}

export async function updateAssetFolder(userId, folderId, { name, color, icon, sortOrder }) {
  const folder = await getAssetFolderById(userId, folderId);
  if (!folder) {
    const err = new Error('目标文件夹不存在');
    err.code = 'FOLDER_NOT_FOUND';
    throw err;
  }

  const updates = [];
  const params = [folderId, userId];

  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (!trimmed) {
      const err = new Error('文件夹名称不能为空');
      err.code = 'INVALID_FOLDER_NAME';
      throw err;
    }
    // Check duplicates
    const duplicate = await queryOne(`
      SELECT id FROM ai_studio.asset_folders
      WHERE user_id = $1 
        AND COALESCE(parent_id, 'root') = COALESCE($2, 'root')
        AND name = $3
        AND id != $4
    `, [userId, folder.parent_id, trimmed, folderId]);
    if (duplicate) {
      const err = new Error('同层级下已存在同名文件夹');
      err.code = 'FOLDER_NAME_DUPLICATE';
      throw err;
    }
    params.push(trimmed);
    updates.push(`name = $${params.length}`);
  }

  if (typeof color === 'string' && color) {
    params.push(color.trim());
    updates.push(`color = $${params.length}`);
  }

  if (typeof icon === 'string' && icon) {
    params.push(icon.trim());
    updates.push(`icon = $${params.length}`);
  }

  if (typeof sortOrder === 'number') {
    params.push(sortOrder);
    updates.push(`sort_order = $${params.length}`);
  }

  if (updates.length === 0) return folder;

  updates.push('updated_at = now()');
  return queryOne(`
    UPDATE ai_studio.asset_folders
    SET ${updates.join(', ')}
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `, params);
}

export async function deleteAssetFolder(userId, folderId) {
  const folder = await getAssetFolderById(userId, folderId);
  if (!folder) {
    const err = new Error('目标文件夹不存在');
    err.code = 'FOLDER_NOT_FOUND';
    throw err;
  }

  // 事务执行：将该文件夹（以及二级子文件夹）的所有资产移至未分类（NULL），避免误删素材
  return withTransaction(async (tx) => {
    // 找出所有下属子文件夹
    const subfolderRows = await tx.queryMany(`
      SELECT id FROM ai_studio.asset_folders
      WHERE user_id = $1 AND parent_id = $2
    `, [userId, folderId]);
    const allFolderIds = [folderId, ...subfolderRows.map(r => r.id)];

    // 将素材 folder_id 置空
    await tx.query(`
      UPDATE ai_studio.user_assets
      SET folder_id = NULL, updated_at = now()
      WHERE user_id = $1 AND folder_id = ANY($2)
    `, [userId, allFolderIds]);

    // 删除文件夹（外键 CASCADE 级联删除二级子文件夹）
    await tx.query(`
      DELETE FROM ai_studio.asset_folders
      WHERE id = $1 AND user_id = $2
    `, [folderId, userId]);

    return { success: true, deletedFolderId: folderId, freedFoldersCount: allFolderIds.length };
  });
}

// ==========================================
// 资产素材相关仓储方法
// ==========================================

export async function listUserAssets({
  userId,
  folderId = 'all',
  assetType = 'all',
  search = '',
  isFavorite = false,
  page = 1,
  limit = 30,
  sort = 'newest',
  mediaOnly = false,
}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const whereConditions = ['a.user_id = $1', "a.status = 'ready'", 'a.deleted_at IS NULL'];
  const params = [userId];

  // 文件夹筛选
  if (folderId === 'unorganized') {
    whereConditions.push('a.folder_id IS NULL');
  } else if (folderId && folderId !== 'all') {
    params.push(folderId);
    whereConditions.push(`a.folder_id = $${params.length}`);
  }

  // 应用类别筛选 (image, video, audio, workflow)
  if (assetType && assetType !== 'all') {
    params.push(assetType.toLowerCase());
    whereConditions.push(`a.asset_type = $${params.length}`);
  }

  // 收藏筛选
  if (isFavorite) {
    whereConditions.push('a.is_favorite = TRUE');
  }

  // 画布等下游只消费媒体素材，排除文本/模型/实体等非媒体类型
  if (mediaOnly) {
    whereConditions.push("a.kind IN ('image', 'video', 'audio')");
  }

  // 关键字搜索 (支持 prompt, title, model_name)
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    const idx = params.length;
    whereConditions.push(`(a.prompt ILIKE $${idx} OR a.title ILIKE $${idx} OR a.model_name ILIKE $${idx})`);
  }

  let orderBy = 'a.created_at DESC';
  if (sort === 'oldest') {
    orderBy = 'a.created_at ASC';
  } else if (sort === 'model') {
    orderBy = 'a.model_name ASC NULLS LAST, a.created_at DESC';
  }

  const whereSql = whereConditions.join(' AND ');

  // 总数查询
  const countRow = await queryOne(`
    SELECT COUNT(*)::int AS total
    FROM ai_studio.user_assets a
    WHERE ${whereSql}
  `, params);
  const total = countRow?.total || 0;

  // 分页列表查询 (附带文件夹信息)
  const queryParams = [...params, safeLimit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const assets = await queryMany(`
    SELECT 
      a.*,
      f.name AS folder_name,
      f.color AS folder_color,
      f.depth AS folder_depth
    FROM ai_studio.user_assets a
    LEFT JOIN ai_studio.asset_folders f ON a.folder_id = f.id
    WHERE ${whereSql}
    ORDER BY a.is_pinned DESC, ${orderBy}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, queryParams);

  return {
    assets,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}

export async function getUserAssetById(userId, assetId) {
  return queryOne(`
    SELECT 
      a.*,
      f.name AS folder_name,
      f.color AS folder_color,
      f.depth AS folder_depth
    FROM ai_studio.user_assets a
    LEFT JOIN ai_studio.asset_folders f ON a.folder_id = f.id
    WHERE a.id = $1 AND a.user_id = $2
  `, [assetId, userId]);
}

export async function getUserAssetByCreationId(userId, creationId, transaction = null) {
  if (!userId || !creationId) return null;
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT * FROM ai_studio.user_assets
    WHERE user_id = $1 AND creation_id = $2 AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `, [userId, creationId]);
}

export async function getCanvasUploadAssetByIdempotencyHash(userId, keyHash) {
  if (!userId || !/^[a-f0-9]{64}$/.test(String(keyHash || ''))) return null;
  return queryOne(`
    SELECT * FROM ai_studio.user_assets
    WHERE user_id = $1 AND generation_params->>'canvas_upload_idempotency_hash' = $2
      AND deleted_at IS NULL
    LIMIT 1
  `, [userId, keyHash]);
}

export async function createUserAsset({
  transaction = null,
  userId,
  folderId = null,
  creationId = null,
  assetType = 'image',
  studioId = 'image',
  title = '',
  mediaUrl,
  thumbnailUrl = null,
  previewUrl = null,
  mimeType = 'image/webp',
  fileSizeBytes = 0,
  width = null,
  height = null,
  aspectRatio = null,
  durationSeconds = null,
  prompt = '',
  negativePrompt = '',
  modelId = null,
  modelName = null,
  provider = null,
  bucket = null,
  region = null,
  storageProvider = null,
  storageLocationId = null,
  objectKey = null,
  previewObjectKey = null,
  thumbnailObjectKey = null,
  originalFilename = null,
  filename = null,
  extension = null,
  checksum = null,
  visibility = 'private',
  sourceType = null,
  sourceProvider = null,
  sourceTaskId = null,
  originalAssetId = null,
  previewAssetId = null,
  thumbnailAssetId = null,
  storageStatus = 'ready',
  storageErrorCode = null,
  generationParams = {},
  creditCost = 0,
  generationDurationMs = 0,
  isFavorite = false,
  tags = [],
  kind = null,
  category = 'other',
  source = null,
  note = null,
  coverUrl = null,
  assetData = {},
}) {
  if (!mediaUrl && !objectKey && !['text', 'entity', 'canvas'].includes(kind)) {
    const err = new Error('媒体对象 Key 不能为空');
    err.code = 'INVALID_MEDIA_URL';
    throw err;
  }

  // 验证文件夹归属
  let validFolderId = null;
  if (folderId) {
    const folder = await getAssetFolderById(userId, folderId, transaction);
    if (folder) validFolderId = folder.id;
  }

  // 规范化类别
  let normalizedType = (assetType || 'image').toLowerCase();
  if (!['image', 'video', 'audio', 'music', 'document', 'avatar', 'thumbnail', 'workflow', 'other'].includes(normalizedType)) {
    normalizedType = 'image';
  }

  const assetId = generateId('ast');
  const safeTitle = (title || prompt.substring(0, 30) || '创作素材').trim();
  const normalizedKind = normalizeLibraryKind(normalizedType, kind);
  const normalizedCategory = normalizeLibraryCategory(category);

  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    INSERT INTO ai_studio.user_assets (
      id, user_id, folder_id, creation_id, asset_type, studio_id, title,
      media_url, thumbnail_url, preview_url, mime_type, file_size_bytes,
      width, height, aspect_ratio, duration_seconds,
      prompt, negative_prompt, model_id, model_name, provider,
      bucket, region, object_key, original_filename, filename, extension,
      checksum, visibility, source_type, source_provider, source_task_id,
      original_asset_id, preview_asset_id, thumbnail_asset_id, preview_object_key, thumbnail_object_key,
      storage_status, storage_error_code,
      generation_params, credit_cost, generation_duration_ms,
      is_favorite, is_pinned, tags, status, created_at, updated_at, storage_provider, storage_location_id,
      kind, category, source, note, cover_url, asset_data
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18, $19, $20, $21,
      $22, $23, $24, $25, $26, $27,
      $28, $29, $30, $31, $32,
      $33, $34, $35, $36, $37,
      $38, $39,
      $40, $41, $42,
      $43, FALSE, $44, 'ready', now(), now(), $45, $46,
      $47, $48, $49, $50, $51, $52
    )
    RETURNING *
  `, [
    assetId, userId, validFolderId, creationId, normalizedType, studioId, safeTitle,
    mediaUrl || null, thumbnailUrl || mediaUrl || null, previewUrl || mediaUrl || null, mimeType, fileSizeBytes,
    width, height, aspectRatio, durationSeconds,
    prompt, negativePrompt, modelId, modelName || modelId, provider,
    bucket, region, objectKey, originalFilename, filename, extension,
    checksum, ['private', 'unlisted', 'public'].includes(visibility) ? visibility : 'private',
    sourceType, sourceProvider, sourceTaskId, originalAssetId, previewAssetId, thumbnailAssetId, previewObjectKey, thumbnailObjectKey,
    ['pending', 'ready', 'failed'].includes(storageStatus) ? storageStatus : 'ready', storageErrorCode,
    JSON.stringify(generationParams || {}), creditCost, generationDurationMs,
    Boolean(isFavorite), tags || [], storageProvider, storageLocationId,
    normalizedKind, normalizedCategory, source, note, coverUrl, JSON.stringify(assetData || {}),
  ]);
}

export async function updateUserAsset(userId, assetId, { folderId, title, isFavorite, isPinned, tags, status, category, source, note, coverUrl, assetData }) {
  const asset = await getUserAssetById(userId, assetId);
  if (!asset) {
    const err = new Error('素材资产不存在');
    err.code = 'ASSET_NOT_FOUND';
    throw err;
  }

  const updates = [];
  const params = [assetId, userId];

  if (folderId !== undefined) {
    if (folderId === null || folderId === '') {
      updates.push('folder_id = NULL');
    } else {
      const folder = await getAssetFolderById(userId, folderId);
      if (!folder) {
        const err = new Error('目标文件夹不存在');
        err.code = 'FOLDER_NOT_FOUND';
        throw err;
      }
      params.push(folder.id);
      updates.push(`folder_id = $${params.length}`);
    }
  }

  if (typeof title === 'string') {
    params.push(title.trim());
    updates.push(`title = $${params.length}`);
  }

  if (typeof isFavorite === 'boolean') {
    params.push(isFavorite);
    updates.push(`is_favorite = $${params.length}`);
  }

  if (typeof isPinned === 'boolean') {
    params.push(isPinned);
    updates.push(`is_pinned = $${params.length}`);
  }

  if (Array.isArray(tags)) {
    params.push(tags);
    updates.push(`tags = $${params.length}`);
  }

  if (typeof status === 'string' && ['ready', 'archived', 'trash'].includes(status)) {
    params.push(status);
    const idx = params.length;
    updates.push(`status = $${idx}`);
    if (status === 'trash') {
      updates.push('trashed_at = COALESCE(trashed_at, now())', 'deleted_at = COALESCE(deleted_at, now())');
    } else {
      updates.push('trashed_at = NULL', 'deleted_at = NULL');
    }
  }

  if (typeof category === 'string') {
    params.push(normalizeLibraryCategory(category));
    updates.push(`category = $${params.length}`);
  }

  if (typeof source === 'string' || source === null) {
    params.push(source === null ? null : source.trim().slice(0, 255));
    updates.push(`source = $${params.length}`);
  }

  if (typeof note === 'string' || note === null) {
    params.push(note === null ? null : note.trim());
    updates.push(`note = $${params.length}`);
  }

  if (typeof coverUrl === 'string' || coverUrl === null) {
    params.push(coverUrl === null ? null : coverUrl.trim());
    updates.push(`cover_url = $${params.length}`);
  }

  if (assetData && typeof assetData === 'object' && !Array.isArray(assetData)) {
    params.push(JSON.stringify(assetData));
    updates.push(`asset_data = $${params.length}::jsonb`);
  }

  if (updates.length === 0) return asset;

  updates.push('updated_at = now()');
  return queryOne(`
    UPDATE ai_studio.user_assets
    SET ${updates.join(', ')}
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `, params);
}

export async function deleteUserAsset(userId, assetId) {
  const asset = await getUserAssetById(userId, assetId);
  if (!asset) {
    const err = new Error('素材资产不存在');
    err.code = 'ASSET_NOT_FOUND';
    throw err;
  }

  await query(`
    UPDATE ai_studio.user_assets
    SET status = 'trash', deleted_at = COALESCE(deleted_at, now()), trashed_at = COALESCE(trashed_at, now()), updated_at = now()
    WHERE id = $1 AND user_id = $2
  `, [assetId, userId]);

  return { success: true, deletedAssetId: assetId };
}

export async function batchMoveAssets(userId, assetIds, targetFolderId) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return { count: 0 };
  }

  let resolvedFolderId = null;
  if (targetFolderId) {
    const folder = await getAssetFolderById(userId, targetFolderId);
    if (!folder) {
      const err = new Error('目标文件夹不存在');
      err.code = 'FOLDER_NOT_FOUND';
      throw err;
    }
    resolvedFolderId = folder.id;
  }

  const result = await query(`
    UPDATE ai_studio.user_assets
    SET folder_id = $1, updated_at = now()
    WHERE user_id = $2 AND id = ANY($3)
  `, [resolvedFolderId, userId, assetIds]);

  return { success: true, count: result.rowCount };
}

export async function batchDeleteAssets(userId, assetIds) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return { count: 0 };
  }

  const result = await query(`
    UPDATE ai_studio.user_assets
    SET status = 'trash', deleted_at = COALESCE(deleted_at, now()), trashed_at = COALESCE(trashed_at, now()), updated_at = now()
    WHERE user_id = $1 AND id = ANY($2) AND deleted_at IS NULL
  `, [userId, assetIds]);

  return { success: true, count: result.rowCount };
}

export async function batchSetFavoriteAssets(userId, assetIds, isFavorite) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return { count: 0 };
  }

  const result = await query(`
    UPDATE ai_studio.user_assets
    SET is_favorite = $1, updated_at = now()
    WHERE user_id = $2 AND id = ANY($3) AND deleted_at IS NULL
  `, [Boolean(isFavorite), userId, assetIds]);

  return { success: true, count: result.rowCount };
}

export async function getAssetCountsByType(userId) {
  const rows = await queryMany(`
    SELECT 
      asset_type,
      COUNT(*)::int AS count
    FROM ai_studio.user_assets
    WHERE user_id = $1 AND status = 'ready' AND deleted_at IS NULL
    GROUP BY asset_type
  `, [userId]);

  const totalRow = await queryOne(`
    SELECT 
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE folder_id IS NULL)::int AS unorganized,
      COUNT(*) FILTER (WHERE is_favorite = TRUE)::int AS favorites
    FROM ai_studio.user_assets
    WHERE user_id = $1 AND status = 'ready' AND deleted_at IS NULL
  `, [userId]);

  const counts = {
    total: totalRow?.total || 0,
    unorganized: totalRow?.unorganized || 0,
    favorites: totalRow?.favorites || 0,
    image: 0,
    video: 0,
    audio: 0,
    workflow: 0,
  };

  for (const row of rows) {
    if (counts[row.asset_type] !== undefined) {
      counts[row.asset_type] = row.count;
    }
  }

  return counts;
}

// ==========================================
// 资产库（影策移植）仓储方法
// ==========================================

export async function listLibraryAssets({
  userId,
  status = 'ready',
  kind = 'all',
  category = 'all',
  folderId = 'all',
  uncategorized = false,
  search = '',
  page = 1,
  pageSize = 40,
}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(200, Math.max(1, Number(pageSize) || 40));
  const offset = (safePage - 1) * safeSize;
  const filters = { userId, status, kind, category, folderId, uncategorized, search };
  const { whereSql, params } = buildLibraryWhere(filters);

  const countRow = await queryOne(`
    SELECT COUNT(*)::int AS total
    FROM ai_studio.user_assets a
    WHERE ${whereSql}
  `, params);
  const total = countRow?.total || 0;

  const orderBy = status === 'trash'
    ? 'a.trashed_at DESC NULLS LAST, a.created_at DESC'
    : 'a.is_pinned DESC, a.created_at DESC';
  const rows = await queryMany(`
    SELECT
      a.*,
      f.name AS folder_name,
      f.color AS folder_color,
      f.depth AS folder_depth
    FROM ai_studio.user_assets a
    LEFT JOIN ai_studio.asset_folders f ON a.folder_id = f.id
    WHERE ${whereSql}
    ORDER BY ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, safeSize, offset]);

  return {
    assets: rows,
    total,
    page: safePage,
    pageSize: safeSize,
    hasMore: offset + rows.length < total,
  };
}

export async function getLibraryFacetCounts({
  userId,
  status = 'ready',
  kind = 'all',
  category = 'all',
  folderId = 'all',
  uncategorized = false,
  search = '',
}) {
  const filters = { userId, status, kind, category, folderId, uncategorized, search };

  const kindScope = buildLibraryWhere(filters, 'kind');
  const kindRows = await queryMany(`
    SELECT a.kind, COUNT(*)::int AS count
    FROM ai_studio.user_assets a
    WHERE ${kindScope.whereSql}
    GROUP BY a.kind
  `, kindScope.params);

  const categoryScope = buildLibraryWhere(filters, 'category');
  const categoryRows = await queryMany(`
    SELECT a.category, COUNT(*)::int AS count
    FROM ai_studio.user_assets a
    WHERE ${categoryScope.whereSql}
    GROUP BY a.category
  `, categoryScope.params);

  const folderScope = buildLibraryWhere(filters, 'folder');
  const folderRows = await queryMany(`
    SELECT COALESCE(a.folder_id, 'uncategorized') AS folder_key, COUNT(*)::int AS count
    FROM ai_studio.user_assets a
    WHERE ${folderScope.whereSql}
    GROUP BY COALESCE(a.folder_id, 'uncategorized')
  `, folderScope.params);

  return {
    kindCounts: Object.fromEntries(kindRows.map((row) => [row.kind, row.count])),
    categoryCounts: Object.fromEntries(categoryRows.map((row) => [row.category, row.count])),
    folderCounts: Object.fromEntries(folderRows.map((row) => [row.folder_key, row.count])),
  };
}

export async function trashAssets(userId, assetIds) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) return 0;
  const result = await query(`
    UPDATE ai_studio.user_assets
    SET status = 'trash',
        deleted_at = COALESCE(deleted_at, now()),
        trashed_at = COALESCE(trashed_at, now()),
        updated_at = now()
    WHERE user_id = $1 AND id = ANY($2) AND status <> 'trash' AND COALESCE(kind, '') <> 'canvas'
  `, [userId, assetIds]);
  return result.rowCount;
}

export async function restoreAssets(userId, assetIds) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) return 0;
  const result = await query(`
    UPDATE ai_studio.user_assets
    SET status = 'ready', deleted_at = NULL, trashed_at = NULL, updated_at = now()
    WHERE user_id = $1 AND id = ANY($2) AND status = 'trash'
  `, [userId, assetIds]);
  return result.rowCount;
}

export async function purgeAssets(userId, assetIds) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) return [];
  return queryMany(`
    DELETE FROM ai_studio.user_assets
    WHERE user_id = $1 AND id = ANY($2) AND status = 'trash'
    RETURNING id, object_key, preview_object_key, thumbnail_object_key,
              storage_provider, storage_location_id, bucket, region, visibility
  `, [userId, assetIds]);
}

export async function purgeAssetRows(assetIds) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) return [];
  return queryMany(`
    DELETE FROM ai_studio.user_assets
    WHERE id = ANY($1) AND status = 'trash'
    RETURNING id, object_key, preview_object_key, thumbnail_object_key,
              storage_provider, storage_location_id, bucket, region, visibility
  `, [assetIds]);
}

export async function listTrashAssets(userId, limit = 200) {
  const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 200));
  return queryMany(`
    SELECT a.*
    FROM ai_studio.user_assets a
    WHERE a.user_id = $1 AND a.status = 'trash'
    ORDER BY COALESCE(a.trashed_at, a.deleted_at) ASC
    LIMIT $2
  `, [userId, safeLimit]);
}

export async function getAssetStorageUsage(userId) {
  const row = await queryOne(`
    SELECT COALESCE(SUM(a.file_size_bytes), 0)::bigint AS used_bytes,
           COUNT(*)::int AS asset_count
    FROM ai_studio.user_assets a
    WHERE a.user_id = $1
      AND a.status IN ('ready', 'archived')
      AND a.deleted_at IS NULL
  `, [userId]);
  return {
    usedBytes: Number(row?.used_bytes || 0),
    assetCount: row?.asset_count || 0,
  };
}

export async function getExpiredTrashAssets({ days = 30, limit = 100 } = {}) {
  const safeDays = Math.min(3650, Math.max(1, Number(days) || 30));
  const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 100));
  return queryMany(`
    SELECT a.*
    FROM ai_studio.user_assets a
    WHERE a.status = 'trash'
      AND COALESCE(a.trashed_at, a.deleted_at) < now() - ($1::int * interval '1 day')
    ORDER BY COALESCE(a.trashed_at, a.deleted_at) ASC
    LIMIT $2
  `, [safeDays, safeLimit]);
}
