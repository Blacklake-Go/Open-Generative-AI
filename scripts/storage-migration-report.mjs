import fs from 'node:fs';
import { createRequire } from 'node:module';

if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const require = createRequire(import.meta.url);
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} };
} catch {}

const { closePgPool, queryMany, queryOne } = await import('../lib/db/index.js');

const objectKeyColumn = await queryOne(`
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'ai_studio' AND table_name = 'user_assets' AND column_name = 'object_key'
`);
const objectKeyClause = objectKeyColumn ? "WHEN object_key IS NOT NULL THEN 'object_key'" : '';

const counts = await queryMany(`
  SELECT source, category, COUNT(*)::int AS count
  FROM (
    SELECT 'creation' AS source,
      CASE
        WHEN result_url LIKE 'data:%' THEN 'base64'
        WHEN result_url LIKE '/%' THEN 'local_url'
        WHEN result_url ~* '^https?://' THEN 'third_party_url'
        WHEN result_url IS NULL OR result_url = '' THEN 'missing'
        ELSE 'other'
      END AS category
    FROM ai_studio.creations
    UNION ALL
    SELECT 'user_asset' AS source,
      CASE
        WHEN media_url LIKE 'data:%' THEN 'base64'
        WHEN media_url LIKE '/%' THEN 'local_url'
        WHEN media_url ~* '^https?://' THEN 'third_party_url'
        ${objectKeyClause}
        WHEN media_url IS NULL OR media_url = '' THEN 'missing'
        ELSE 'other'
      END AS category
    FROM ai_studio.user_assets
  ) inventory
  GROUP BY source, category
  ORDER BY source, category
`);

const result = {
  generatedAt: new Date().toISOString(),
  note: 'URL availability was not probed; this is a metadata-only inventory and does not migrate or delete content.',
  counts,
};
console.log(JSON.stringify(result, null, 2));
await closePgPool();
