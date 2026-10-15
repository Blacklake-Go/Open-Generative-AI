import { createRequire } from 'node:module';
import fs from 'node:fs';

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

const { dataClient } = await import('../lib/repositories/runtimeDb.js');

async function main() {
  const client = dataClient();
  const providers = await client.readMany('SELECT id, name, enabled, health_status FROM ai_studio.ai_providers');
  console.log('Providers:', providers);

  const unrouted = await client.readMany(`
    SELECT m.id, m.name, m.category, count(pm.id) filter (where pm.review_status = 'approved' and pm.enabled = true) as routes
    FROM ai_studio.ai_models m
    LEFT JOIN ai_studio.provider_models pm ON pm.model_id = m.id
    GROUP BY m.id, m.name, m.category
    HAVING count(pm.id) filter (where pm.review_status = 'approved' and pm.enabled = true) = 0
    ORDER BY m.category, m.id
  `);
  console.log('Unrouted count:', unrouted.length);
  console.log('Unrouted models:', unrouted.map(u => ({ id: u.id, cat: u.category })));

  const catalogSample = await client.readMany(`
    SELECT id, provider_id, provider_model_id, category, display_name, review_status
    FROM ai_studio.provider_catalog_entries
    LIMIT 20
  `);
  console.log('Catalog entries sample:', catalogSample);

  const providerModels = await client.readMany(`
    SELECT id, model_id, provider_id, provider_model_id, review_status, enabled
    FROM ai_studio.provider_models
    WHERE review_status != 'approved' OR enabled = false
    LIMIT 20
  `);
  console.log('Unapproved/Disabled provider models:', providerModels);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
