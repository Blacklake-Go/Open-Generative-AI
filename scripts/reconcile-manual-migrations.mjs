import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {},
  };
} catch {}

const { withTransaction, closePgPool } = await import('../lib/db/index.js');
const { getMigrationStatus } = await import('../lib/db/migrations.js');

const migrations = [
  '073_generation_130pricing_and_canvas_capabilities',
  '074_volcengine_seedance2_route_ready',
];

async function assertCondition(tx, description, sql) {
  const [row] = await tx.queryMany(sql);
  if (row?.ok !== true) throw new Error('Manual migration evidence missing: ' + description);
}

async function verify073(tx) {
  await assertCondition(tx, 'formula and launch prices', `
    SELECT
      NOT EXISTS (SELECT 1 FROM ai_studio.model_pricing
        WHERE pricing_type='formula' AND min_gross_margin_rate IS DISTINCT FROM 0.15)
      AND EXISTS (SELECT 1 FROM ai_studio.model_pricing
        WHERE model_id='seedance-2.0' AND base_credits=135 AND min_gross_margin_rate=0.15)
      AND EXISTS (SELECT 1 FROM ai_studio.model_pricing
        WHERE model_id='kling-2.6' AND base_credits=10 AND min_gross_margin_rate=0.15)
      AS ok`);
  await assertCondition(tx, 'RunningHub Seedance resolution multipliers', `
    SELECT count(*)=2 AS ok
    FROM ai_studio.provider_model_price_versions
    WHERE provider_model_id IN
      ('pm_runninghub_seedance20_global_t2v','pm_runninghub_seedance20_global_i2v')
      AND price_config->'resolution_multipliers'
        @> '{"480p":0.5,"720p":1.0,"1080p":1.5,"2k":2.0,"4k":3.0}'::jsonb`);
  await assertCondition(tx, 'image and video capabilities', `
    SELECT count(*)=6 AS ok FROM ai_studio.ai_models
    WHERE (id IN ('seedream-5.0','seedream-4.5')
      AND capabilities @> '{"supports_reference":true,"supports_edit":true}'::jsonb
      AND supported_resolutions @> '["1K","2K","4K"]'::jsonb)
       OR (id='seedance-2.0'
      AND capabilities @> '{"supports_reference":true,"supports_edit":false,"supports_audio":true}'::jsonb
      AND supported_resolutions @> '["480p","720p","1080p"]'::jsonb)
       OR (id IN ('kling-3.0','kling-2.6','kling-2.5')
      AND capabilities @> '{"supports_reference":true,"supports_edit":false}'::jsonb
      AND supported_resolutions @> '["720p","1080p"]'::jsonb)`);
  await assertCondition(tx, 'Canvas mounts and defaults', `
    SELECT EXISTS (SELECT 1 FROM ops_bill.system_settings
    WHERE key='canvas_model_config'
      AND value_json->'mountedModelIds'->'image' @> '["seedream-5.0","seedream-4.5"]'::jsonb
      AND value_json->'mountedModelIds'->'video' @> '["seedance-2.0","kling-3.0","kling-2.6","kling-2.5"]'::jsonb
      AND value_json #>> '{defaults,imageModelId}'='seedream-5.0'
      AND value_json #>> '{defaults,videoModelId}'='seedance-2.0') AS ok`);
}

async function verify074(tx) {
  await assertCondition(tx, 'disabled direct Seedance mapping', `
    SELECT EXISTS (SELECT 1 FROM ai_studio.provider_models
    WHERE id='pm_volcengine_seedance20_global_t2v'
      AND model_id='seedance-2.0' AND provider_id='volcengine'
      AND provider_model_id='doubao-seedance-2-0-260128'
      AND enabled=false AND review_status='approved'
      AND provider_endpoint='/contents/generations/tasks') AS ok`);
  await assertCondition(tx, 'Seedance direct route cost version', `
    SELECT EXISTS (SELECT 1 FROM ai_studio.provider_model_price_versions
    WHERE id='pver_volcengine_seedance20_global_20261019'
      AND provider_model_id='pm_volcengine_seedance20_global_t2v'
      AND price_type='manual' AND billing_unit='per_output_second'
      AND currency='CNY' AND status='active'
      AND price_config->>'cost_per_output_second'='1.0'
      AND price_config->'resolution_multipliers'
        @> '{"480p":0.5,"720p":1.0,"1080p":1.5,"2k":2.0,"4k":3.0}'::jsonb) AS ok`);
}

try {
  const changes = await withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['supdance:postgresql:migrations']);
    const result = [];
    for (const version of migrations) {
      const source = await fs.readFile(path.join(process.cwd(), 'lib/db/migrations', version + '.sql'), 'utf8');
      const checksum = crypto.createHash('sha256').update(source.replace(/^\uFEFF/, ''), 'utf8').digest('hex');
      if (version.startsWith('073')) await verify073(tx);
      else await verify074(tx);
      const [record] = await tx.queryMany(
        'SELECT checksum FROM sys_core.schema_migrations WHERE version=$1', [version]);
      if (record && record.checksum !== checksum) throw new Error('Migration checksum mismatch: ' + version);
      if (!record) {
        await tx.query(`INSERT INTO sys_core.schema_migrations
          (version,name,checksum,applied_at,execution_ms)
          VALUES ($1,$2,$3,now(),0)`, [version, version + '.sql', checksum]);
        result.push({ version, status: 'adopted_existing_state' });
      } else result.push({ version, status: 'already_recorded' });
    }
    return result;
  });
  const status = await getMigrationStatus();
  console.log(JSON.stringify({ changes, ok: status.ok, pending: status.pending, drifted: status.drifted }));
  if (!status.ok) process.exitCode = 1;
} finally {
  await closePgPool();
}
