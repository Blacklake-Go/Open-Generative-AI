import 'server-only';

import { execute, query, queryOne, randomId } from '../db/index.js';
import { createStorageAdapter } from '../storage/adapterRegistry.js';
import { loadLocationSettings } from '../storage/storageSettingsV2.js';
import { getAssetStorageAdapter } from '../storage/storageService.js';

export const MIGRATION_PHASES = Object.freeze(['assets', 'creations', 'avatars', 'completed']);

// 单个对象超过该体积时不走内存中转，直接记失败等待人工处理。
const MAX_COPY_BYTES = 512 * 1024 * 1024;

const advanceLocks = new Set();

function migrationError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function copyObject({ sourceAdapter, targetAdapter, key, mimeHint = '' }) {
  if (!key) return 'empty';
  if (/^https?:\/\//i.test(key) || key.startsWith('/') || key.startsWith('data:')) return 'external';
  if (await targetAdapter.exists({ key }).catch(() => false)) return 'exists';

  const metadata = await sourceAdapter.getMetadata({ key });
  const size = Number(metadata?.size || 0);
  if (!size) throw migrationError('STORAGE_MIGRATION_SOURCE_EMPTY', `源对象为空: ${key}`);
  if (size > MAX_COPY_BYTES) throw migrationError('STORAGE_MIGRATION_FILE_TOO_LARGE', `对象过大: ${key} (${size} bytes)`);

  const downloaded = await sourceAdapter.download({ key });
  const body = Buffer.isBuffer(downloaded?.body) ? downloaded.body : Buffer.from(downloaded?.body || []);
  if (body.length !== size) throw migrationError('STORAGE_MIGRATION_SIZE_MISMATCH', `读取长度不一致: ${key}`);

  const contentType = metadata?.mimeType || downloaded?.contentType || mimeHint || 'application/octet-stream';
  await targetAdapter.upload({ key, body, contentType, size: body.length });
  const copied = await targetAdapter.getMetadata({ key });
  if (Number(copied?.size || 0) !== size) {
    throw migrationError('STORAGE_MIGRATION_VERIFY_FAILED', `校验失败: ${key}`);
  }
  return 'copied';
}

async function copyAssetKeys({ sourceAdapter, targetAdapter, keys, mimeHint }) {
  let copied = 0;
  let internal = 0;
  for (const key of keys) {
    const outcome = await copyObject({ sourceAdapter, targetAdapter, key, mimeHint });
    if (outcome === 'copied') copied += 1;
    if (outcome === 'copied' || outcome === 'exists') internal += 1;
  }
  return { copied, internal };
}

async function processAssetRow(row, target) {
  const sourceAdapter = await getAssetStorageAdapter({
    provider: row.storage_provider,
    locationId: row.storage_location_id,
    bucket: row.bucket,
    region: row.region,
  });
  if (!sourceAdapter) throw migrationError('STORAGE_MIGRATION_SOURCE_UNAVAILABLE', '源存储位置不可用');
  const { internal } = await copyAssetKeys({
    sourceAdapter,
    targetAdapter: target.adapter,
    keys: [row.object_key, row.preview_object_key, row.thumbnail_object_key],
    mimeHint: row.mime_type,
  });
  // 外链或空 Key 没有可复制的对象，保留原有指针，避免误标为目标位置。
  if (!internal) return false;
  await execute(`
    UPDATE ai_studio.user_assets
    SET storage_provider = $1, storage_location_id = $2, bucket = $3, region = $4, updated_at = NOW()
    WHERE id = $5
  `, [target.provider, target.locationId, target.bucket, target.region, row.id]);
  return true;
}

async function processCreationRow(row, target) {
  const sourceAdapter = await getAssetStorageAdapter({
    provider: row.storage_provider,
    locationId: row.storage_location_id,
    bucket: row.storage_bucket,
    region: row.storage_region,
  });
  if (!sourceAdapter) throw migrationError('STORAGE_MIGRATION_SOURCE_UNAVAILABLE', '源存储位置不可用');
  const { internal } = await copyAssetKeys({
    sourceAdapter,
    targetAdapter: target.adapter,
    keys: [row.result_object_key, row.storage_preview_object_key, row.storage_thumbnail_object_key],
    mimeHint: row.storage_mime_type,
  });
  if (!internal) return false;
  await execute(`
    UPDATE ai_studio.creations
    SET storage_provider = $1, storage_location_id = $2, storage_bucket = $3, storage_region = $4, updated_at = NOW()
    WHERE id = $5
  `, [target.provider, target.locationId, target.bucket, target.region, row.id]);
  return true;
}

async function processAvatarRow(row, target) {
  const sourceAdapter = await getAssetStorageAdapter({
    provider: row.avatar_storage_provider,
    locationId: row.avatar_storage_location_id,
  });
  if (!sourceAdapter) throw migrationError('STORAGE_MIGRATION_SOURCE_UNAVAILABLE', '源存储位置不可用');
  const { internal } = await copyAssetKeys({ sourceAdapter, targetAdapter: target.adapter, keys: [row.avatar_object_key] });
  if (!internal) return false;
  await execute(`
    UPDATE auth_usr.users
    SET avatar_storage_provider = $1, avatar_storage_location_id = $2, updated_at = NOW()
    WHERE id = $3
  `, [target.provider, target.locationId, row.id]);
  return true;
}

async function fetchBatch(phase, { targetLocationId, cursor, limit }) {
  const params = [targetLocationId, cursor?.createdAt || null, cursor?.id || null, limit];
  if (phase === 'assets') {
    const result = await query(`SELECT id, created_at, object_key, preview_object_key, thumbnail_object_key,
        storage_provider, storage_location_id, bucket, region, mime_type
      FROM ai_studio.user_assets
      WHERE deleted_at IS NULL AND object_key IS NOT NULL
        AND storage_location_id IS DISTINCT FROM $1
        AND ($2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3::varchar))
      ORDER BY created_at, id
      LIMIT $4`, params);
    return result.rows || [];
  }
  if (phase === 'creations') {
    const result = await query(`SELECT id, created_at, result_object_key, storage_preview_object_key, storage_thumbnail_object_key,
        storage_provider, storage_location_id, storage_bucket, storage_region, storage_mime_type
      FROM ai_studio.creations
      WHERE result_object_key IS NOT NULL
        AND storage_location_id IS DISTINCT FROM $1
        AND ($2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3::varchar))
      ORDER BY created_at, id
      LIMIT $4`, params);
    return result.rows || [];
  }
  const result = await query(`SELECT id, created_at, avatar_object_key, avatar_storage_provider, avatar_storage_location_id
    FROM auth_usr.users
    WHERE avatar_object_key IS NOT NULL
      AND avatar_storage_location_id IS DISTINCT FROM $1
      AND ($2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3::varchar))
    ORDER BY created_at, id
    LIMIT $4`, params);
  return result.rows || [];
}

export async function getStorageMigrationRun(runId) {
  return queryOne('SELECT * FROM ai_studio.storage_migration_runs WHERE id = $1', [runId]);
}

export async function listStorageMigrationRuns(limit = 10) {
  const result = await query('SELECT * FROM ai_studio.storage_migration_runs ORDER BY started_at DESC LIMIT $1', [limit]);
  return result.rows || [];
}

export async function startStorageMigration({ actorEmail = 'system', targetLocationId }) {
  const location = await loadLocationSettings(targetLocationId);
  if (!location) throw migrationError('STORAGE_LOCATION_NOT_FOUND', '目标存储位置不存在');
  if (location.provider === 'local') throw migrationError('STORAGE_MIGRATION_LOCAL_TARGET', '目标位置不能是服务器本地存储');
  const running = await queryOne("SELECT id FROM ai_studio.storage_migration_runs WHERE status = 'running' LIMIT 1");
  if (running) throw migrationError('STORAGE_MIGRATION_RUNNING', '已有迁移任务正在运行');

  const id = randomId('smr');
  await execute(`
    INSERT INTO ai_studio.storage_migration_runs (id, target_location_id, target_provider, status, phase)
    VALUES ($1, $2, $3, 'running', 'assets')
  `, [id, targetLocationId, location.provider]);
  await execute(`
    INSERT INTO ai_studio.storage_operation_logs (id, provider, operation, status, error_code)
    VALUES ($1, $2, 'migrate_start', 'success', NULL)
  `, [randomId('sop'), location.provider]).catch(() => {});
  return { run: await getStorageMigrationRun(id), actorEmail };
}

export async function cancelStorageMigration(runId) {
  const updated = await queryOne(`
    UPDATE ai_studio.storage_migration_runs
    SET status = 'cancelled', finished_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND status = 'running'
    RETURNING *
  `, [runId]);
  return updated;
}

/**
 * 处理一批历史资源。可重复调用直到 status 变为 completed；游标与计数持久化，
 * 服务重启后从上次位置继续。
 */
export async function advanceStorageMigration(runId, { maxItems = 20 } = {}) {
  if (advanceLocks.has(runId)) return getStorageMigrationRun(runId);
  advanceLocks.add(runId);
  try {
    const run = await getStorageMigrationRun(runId);
    if (!run || run.status !== 'running') return run;
    const settings = await loadLocationSettings(run.target_location_id);
    if (!settings) throw migrationError('STORAGE_LOCATION_NOT_FOUND', '目标存储位置不存在');

    const target = {
      adapter: createStorageAdapter(settings),
      provider: settings.provider,
      locationId: run.target_location_id,
      bucket: settings.bucket || null,
      region: settings.region || null,
    };

    let phase = run.phase || 'assets';
    let cursor = run.cursor_created_at ? { createdAt: run.cursor_created_at, id: run.cursor_id } : null;
    let processed = 0;
    let migrated = run.migrated || 0;
    let skipped = run.skipped || 0;
    let failed = run.failed || 0;
    let scanned = run.scanned || 0;
    let lastError = run.last_error || null;

    while (processed < maxItems && phase !== 'completed') {
      const rows = await fetchBatch(phase, {
        targetLocationId: run.target_location_id,
        cursor,
        limit: Math.min(50, maxItems - processed),
      });
      if (!rows.length) {
        if (phase === 'assets') { phase = 'creations'; cursor = null; continue; }
        if (phase === 'creations') { phase = 'avatars'; cursor = null; continue; }
        phase = 'completed';
        break;
      }

      for (const row of rows) {
        processed += 1;
        scanned += 1;
        cursor = { createdAt: row.created_at, id: row.id };
        try {
          const moved = phase === 'assets'
            ? await processAssetRow(row, target)
            : phase === 'creations'
              ? await processCreationRow(row, target)
              : await processAvatarRow(row, target);
          if (moved) migrated += 1;
          else skipped += 1;
        } catch (error) {
          failed += 1;
          lastError = `${error?.code || 'STORAGE_MIGRATION_FAILED'}: ${String(error?.message || error).slice(0, 300)}`;
        }
      }

      await execute(`
        UPDATE ai_studio.storage_migration_runs
        SET phase = $1, cursor_created_at = $2, cursor_id = $3, scanned = $4,
            migrated = $5, skipped = $6, failed = $7, last_error = $8, updated_at = NOW()
        WHERE id = $9
      `, [phase, cursor?.createdAt || null, cursor?.id || null, scanned, migrated, skipped, failed, lastError, runId]);
    }

    const completed = phase === 'completed';
    const updated = await queryOne(`
      UPDATE ai_studio.storage_migration_runs
      SET phase = $1, cursor_created_at = $2, cursor_id = $3, scanned = $4,
          migrated = $5, skipped = $6, failed = $7, last_error = $8,
          status = $9::varchar,
          finished_at = CASE WHEN $9::varchar = 'completed' THEN NOW() ELSE finished_at END,
          updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [phase, cursor?.createdAt || null, cursor?.id || null, scanned, migrated, skipped, failed, lastError, completed ? 'completed' : 'running', runId]);
    return updated;
  } finally {
    advanceLocks.delete(runId);
  }
}
