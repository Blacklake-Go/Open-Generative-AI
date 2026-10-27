import 'server-only';

import crypto from 'node:crypto';
import { execute, nowIso, queryMany, queryOne } from '../db/index.js';

function locationId() {
  return `sloc_${crypto.randomBytes(12).toString('hex')}`;
}

export function storageLocationDigest(settings = {}) {
  const canonical = JSON.stringify({
    provider: settings.provider,
    endpoint: settings.endpoint || '',
    region: settings.region || '',
    bucket: settings.bucket || '',
    accessKeyId: settings.accessKeyId || '',
    pathPrefix: settings.pathPrefix || '',
    pathStyle: Boolean(settings.pathStyle),
    s3Preset: settings.s3Preset || '',
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export async function findOrCreateStorageLocation({ provider, digest, valueJson, scope = 'platform', ownerId = '' }) {
  const existing = await queryOne(`
    SELECT id FROM ai_studio.storage_locations
    WHERE scope = $1 AND owner_id = $2 AND provider = $3 AND location_digest = $4
    LIMIT 1
  `, [scope, ownerId, provider, digest]);
  const now = nowIso();
  if (existing?.id) {
    await execute(`
      UPDATE ai_studio.storage_locations
      SET value_json = $2::jsonb, updated_at = $3
      WHERE id = $1
    `, [existing.id, JSON.stringify(valueJson), now]);
    return existing.id;
  }
  const id = locationId();
  await execute(`
    INSERT INTO ai_studio.storage_locations (id, scope, owner_id, provider, location_digest, value_json, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $7)
    ON CONFLICT (scope, owner_id, provider, location_digest) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at
  `, [id, scope, ownerId, provider, digest, JSON.stringify(valueJson), now]);
  const row = await queryOne(`
    SELECT id FROM ai_studio.storage_locations
    WHERE scope = $1 AND owner_id = $2 AND provider = $3 AND location_digest = $4
    LIMIT 1
  `, [scope, ownerId, provider, digest]);
  return row?.id || id;
}

export async function getStorageLocation(id) {
  if (!id) return null;
  return queryOne(`
    SELECT id, scope, owner_id, provider, location_digest, value_json, tested_at, tested_digest, created_at, updated_at
    FROM ai_studio.storage_locations WHERE id = $1
  `, [id]);
}

export async function listStorageLocations({ limit = 20 } = {}) {
  return queryMany(`
    SELECT id, provider, location_digest, tested_at, created_at, updated_at, value_json
    FROM ai_studio.storage_locations
    WHERE scope = 'platform'
    ORDER BY created_at DESC
    LIMIT $1
  `, [Math.min(100, Math.max(1, Number(limit) || 20))]);
}

export async function markStorageLocationTested(id, testedDigest) {
  if (!id) return;
  await execute(`
    UPDATE ai_studio.storage_locations SET tested_at = now(), tested_digest = $2, updated_at = now() WHERE id = $1
  `, [id, testedDigest]);
}

export async function countAssetsByLocation(ids = []) {
  if (!ids.length) return {};
  const rows = await queryMany(`
    SELECT storage_location_id, COUNT(*)::int AS count
    FROM ai_studio.user_assets
    WHERE storage_location_id = ANY($1::text[])
    GROUP BY storage_location_id
  `, [ids]);
  return Object.fromEntries(rows.map((row) => [row.storage_location_id, Number(row.count || 0)]));
}
