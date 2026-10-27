import 'server-only';

import crypto from 'node:crypto';
import { query, queryMany, queryOne } from '../db/index.js';

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export async function createSyncToken({ userId, tokenHash, label }) {
  return queryOne(`
    INSERT INTO ai_studio.asset_sync_tokens (id, user_id, token_hash, label)
    VALUES ($1, $2, $3, $4)
    RETURNING id, user_id, label, last_used_at, revoked_at, created_at
  `, [generateId('astok'), userId, tokenHash, label || '']);
}

export async function listSyncTokens(userId) {
  return queryMany(`
    SELECT id, user_id, label, last_used_at, revoked_at, created_at
    FROM ai_studio.asset_sync_tokens
    WHERE user_id = $1 AND revoked_at IS NULL
    ORDER BY created_at DESC
  `, [userId]);
}

export async function revokeSyncToken(userId, tokenId) {
  return queryOne(`
    UPDATE ai_studio.asset_sync_tokens
    SET revoked_at = now()
    WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
    RETURNING id
  `, [tokenId, userId]);
}

export async function getUserBySyncTokenHash(tokenHash) {
  return queryOne(`
    SELECT t.id AS token_id, u.id, u.email, u.display_name, u.username
    FROM ai_studio.asset_sync_tokens t
    JOIN auth_usr.users u ON u.id = t.user_id
    WHERE t.token_hash = $1 AND t.revoked_at IS NULL
    LIMIT 1
  `, [tokenHash]);
}

export async function touchSyncToken(tokenId) {
  await query(`
    UPDATE ai_studio.asset_sync_tokens
    SET last_used_at = now()
    WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
  `, [tokenId]).catch(() => {});
}

export async function getSyncLink(userId, externalSystem, externalId) {
  return queryOne(`
    SELECT * FROM ai_studio.asset_sync_links
    WHERE user_id = $1 AND external_system = $2 AND external_id = $3
    LIMIT 1
  `, [userId, externalSystem, externalId]);
}

export async function createSyncLink({ userId, externalSystem, externalId, assetId, direction = 'import', metadata = {} }) {
  return queryOne(`
    INSERT INTO ai_studio.asset_sync_links (id, user_id, external_system, external_id, asset_id, direction, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    ON CONFLICT (user_id, external_system, external_id)
    DO UPDATE SET asset_id = EXCLUDED.asset_id, updated_at = now()
    RETURNING *
  `, [generateId('asln'), userId, externalSystem, externalId, assetId, direction, JSON.stringify(metadata || {})]);
}

export async function deleteSyncLink(userId, externalSystem, externalId) {
  return queryOne(`
    DELETE FROM ai_studio.asset_sync_links
    WHERE user_id = $1 AND external_system = $2 AND external_id = $3
    RETURNING *
  `, [userId, externalSystem, externalId]);
}

export async function listUserAssetsForSync(userId, { since = null, limit = 100, assetType = 'all' } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
  // 从影策推来的资产不再回传，避免连接器把同一份素材反复拉回影策。
  const conditions = ['a.user_id = $1', "a.status = 'ready'", 'a.deleted_at IS NULL', "NOT (a.source_type = 'asset_sync' AND a.source_provider = 'yingce')"];
  const params = [userId];
  if (since) {
    params.push(since);
    conditions.push(`a.created_at > $${params.length}`);
  }
  if (assetType && assetType !== 'all') {
    params.push(String(assetType).toLowerCase());
    conditions.push(`a.asset_type = $${params.length}`);
  }
  params.push(safeLimit);
  return queryMany(`
    SELECT a.id, a.asset_type, a.title, a.mime_type, a.file_size_bytes, a.width, a.height,
           a.checksum, a.created_at, a.updated_at, a.object_key, a.media_url,
           a.source_type, a.source_provider,
           (a.preview_object_key IS NOT NULL OR a.thumbnail_object_key IS NOT NULL) AS has_preview
    FROM ai_studio.user_assets a
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.created_at ASC
    LIMIT $${params.length}
  `, params);
}
