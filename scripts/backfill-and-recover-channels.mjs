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

const { closePgPool, queryOne, queryMany, execute } = await import('../lib/db/connection.js');
const { runMigrations, getMigrationStatus } = await import('../lib/db/migrations.js');
const { listActiveModels } = await import('../lib/services/models.js');
const { isSelectablePublicModel } = await import('../lib/modelCenter/publicDirectory.js');

async function main() {
  console.log('=== [P3] DATA BACKFILL & CHANNEL RECOVERY START ===\n');

  // Step 1: Run migrations
  console.log('[Step 1] Applying pending database migrations...');
  const migrationResult = await runMigrations();
  console.log('Migration result:', JSON.stringify(migrationResult, null, 2));

  // Step 2: Verify provider_models capabilities
  console.log('\n[Step 2] Verifying provider_models capabilities backfill...');
  const capsCheck = await queryOne(`
    SELECT 
      count(*) as total_provider_models,
      count(*) FILTER (WHERE capabilities IS NULL OR capabilities = '{}'::jsonb OR NOT (capabilities ? 'input_types' AND capabilities ? 'output_types')) as missing_caps,
      count(*) FILTER (WHERE capabilities ? 'input_types' AND capabilities ? 'output_types') as valid_caps
    FROM ai_studio.provider_models;
  `);
  console.log('Provider models capabilities check:', capsCheck);

  // Step 3: Verify provider_model_price_versions
  console.log('\n[Step 3] Verifying provider_model_price_versions activation...');
  const priceCheck = await queryMany(`
    SELECT status, billing_unit, count(*) 
    FROM ai_studio.provider_model_price_versions 
    GROUP BY status, billing_unit
    ORDER BY status, count DESC;
  `);
  console.log('Price versions check:', priceCheck);

  // Step 4: Verify provider heartbeat & health
  console.log('\n[Step 4] Verifying ai_providers heartbeat & health status...');
  const providerCheck = await queryMany(`
    SELECT id, enabled, health_status, last_health_check_at, circuit_state
    FROM ai_studio.ai_providers
    WHERE enabled = true
    ORDER BY id;
  `);
  console.log('Providers health check:', providerCheck);

  // Step 5: Test listActiveModels() and isSelectablePublicModel()
  console.log('\n[Step 5] Testing listActiveModels() and public model directory admission...');
  const activeModels = await listActiveModels();
  console.log(`Total visible models from listActiveModels(): ${activeModels.length}`);

  const selectableModels = activeModels.filter(isSelectablePublicModel);
  console.log(`Selectable public models (satisfying all admission gates): ${selectableModels.length}`);

  const modelsWithWorkingRoute = activeModels.filter(m => m.hasWorkingRoute);
  console.log(`Models with verified working routes: ${modelsWithWorkingRoute.length}`);

  const byCategory = {};
  for (const m of selectableModels) {
    byCategory[m.category] = (byCategory[m.category] || 0) + 1;
  }
  console.log('Selectable models by category:', byCategory);

  if (selectableModels.length > 0) {
    console.log('\nSample selectable model:');
    const sample = selectableModels[0];
    console.log(JSON.stringify({
      id: sample.id,
      name: sample.name,
      category: sample.category,
      tier: sample.tier,
      provider: sample.provider,
      available_providers: sample.available_providers,
      credits_price: sample.credits_price,
      is_active: sample.is_active,
      is_visible: sample.is_visible,
      auto_route_eligible: sample.auto_route_eligible,
      hasWorkingRoute: sample.hasWorkingRoute,
      generation_capabilities: sample.generation_capabilities,
    }, null, 2));
  }

  if (selectableModels.length === 0) {
    console.error('\n[ERROR] No selectable public models found! Check admission conditions.');
    process.exitCode = 1;
  } else {
    console.log('\n🎉 [P3] Data backfill & channel recovery completed successfully!');
  }
}

try {
  await main();
} catch (err) {
  console.error('[FATAL]', err);
  process.exitCode = 1;
} finally {
  await closePgPool().catch(() => {});
}
