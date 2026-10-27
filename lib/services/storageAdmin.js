import 'server-only';

import { query } from '../db/index.js';
import { countAssetsByLocation } from '../storage/storageLocations.js';
import { getStorageMetrics } from '../storage/storageService.js';
import {
  listStorageLocationViews,
  publicStorageSettings,
  readStorageSettings,
} from '../storage/storageSettingsV2.js';
import { listStorageMigrationRuns } from './storageMigration.js';

async function storageCounts() {
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM ai_studio.user_assets WHERE deleted_at IS NULL AND object_key IS NOT NULL) AS assets_total,
      (SELECT COUNT(*)::int FROM ai_studio.user_assets WHERE deleted_at IS NULL AND object_key IS NOT NULL
        AND (storage_provider IS NULL OR storage_provider = 'amh' OR storage_provider = 'local')) AS assets_local,
      (SELECT COUNT(*)::int FROM ai_studio.creations WHERE result_object_key IS NOT NULL) AS creations_total,
      (SELECT COUNT(*)::int FROM ai_studio.creations WHERE result_object_key IS NOT NULL
        AND (storage_provider IS NULL OR storage_provider = 'amh' OR storage_provider = 'local')) AS creations_local,
      (SELECT COUNT(*)::int FROM auth_usr.users WHERE avatar_object_key IS NOT NULL) AS avatars_total,
      (SELECT COUNT(*)::int FROM auth_usr.users WHERE avatar_object_key IS NOT NULL
        AND (avatar_storage_provider IS NULL OR avatar_storage_provider = 'amh' OR avatar_storage_provider = 'local')) AS avatars_local
  `);
  const row = result.rows?.[0] || {};
  return {
    assets: { total: Number(row.assets_total || 0), local: Number(row.assets_local || 0) },
    creations: { total: Number(row.creations_total || 0), local: Number(row.creations_local || 0) },
    avatars: { total: Number(row.avatars_total || 0), local: Number(row.avatars_local || 0) },
  };
}

export async function getStorageAdminOverview() {
  const settings = await readStorageSettings({ fresh: true });
  const locations = await listStorageLocationViews({ limit: 50 });
  const [counts, byLocation, metrics, runs] = await Promise.all([
    storageCounts(),
    countAssetsByLocation(locations.map((item) => item.id)).catch(() => ({})),
    getStorageMetrics().catch(() => null),
    listStorageMigrationRuns(8).catch(() => []),
  ]);

  return {
    settings: publicStorageSettings(settings),
    locations: locations.map((item) => ({ ...item, assetCount: byLocation[item.id] || 0 })),
    counts,
    metrics,
    runs,
  };
}
