// 回收站保留期清理：默认 30 天，默认 dry-run，--apply 才真正删除对象与记录。
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  };
} catch {}

try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const { getExpiredTrashAssets } = await import('../lib/repositories/assets.js');
const { purgeExpiredTrashAssets } = await import('../lib/services/assetLibrary.js');
const { closePgPool } = await import('../lib/db/index.js');

const apply = process.argv.includes('--apply');
const days = Math.max(1, Number(process.env.ASSET_TRASH_RETENTION_DAYS || 30));
const limit = Math.max(1, Number(process.env.ASSET_TRASH_RETENTION_BATCH || 200));

try {
  if (!apply) {
    const rows = await getExpiredTrashAssets({ days, limit: 1000 });
    console.log(`[asset-trash-retention] dry-run: ${rows.length} 条回收站素材超过 ${days} 天${rows.length >= 1000 ? '（已截断）' : ''}`);
  } else {
    const result = await purgeExpiredTrashAssets({ days, limit });
    console.log(`[asset-trash-retention] apply: 已清理 ${result.deletedCount} 条素材`);
  }
} finally {
  await closePgPool();
}
