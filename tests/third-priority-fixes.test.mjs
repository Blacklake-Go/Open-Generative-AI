import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('1. Migration 057 and Backfill Script exist and cover all requirements', () => {
  const migrationPath = path.join(root, 'lib/db/migrations/057_backfill_capabilities_and_activate_prices.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 057 must exist');

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  assert.ok(migrationSql.includes('input_types'), 'Migration 057 must set input_types');
  assert.ok(migrationSql.includes('output_types'), 'Migration 057 must set output_types');
  assert.ok(migrationSql.includes('supported_task_types'), 'Migration 057 must set supported_task_types');
  assert.ok(migrationSql.includes("status = 'active'"), 'Migration 057 must activate pending price versions');
  assert.ok(migrationSql.includes("billing_unit = 'per_request'"), 'Migration 057 must set routable billing_unit');
  assert.ok(migrationSql.includes('last_health_check_at = now()'), 'Migration 057 must refresh provider heartbeat');

  const scriptPath = path.join(root, 'scripts/backfill-and-recover-channels.mjs');
  assert.ok(fs.existsSync(scriptPath), 'backfill-and-recover-channels.mjs must exist');
});

test('2. Database state verification: capabilities, price versions, and provider health', async () => {
  const { queryOne, queryMany } = await import('../lib/db/connection.js');
  
  // 2.1 Provider models capabilities
    const capsCheck = await queryOne(`
      SELECT 
        count(*) as total,
        count(*) FILTER (WHERE capabilities IS NULL OR capabilities = '{}'::jsonb OR NOT (capabilities ? 'input_types' AND capabilities ? 'output_types')) as missing_caps
      FROM ai_studio.provider_models;
    `);
    assert.strictEqual(Number(capsCheck.missing_caps), 0, 'No provider_models should have empty or missing capabilities');
    assert.ok(Number(capsCheck.total) > 100, 'Provider models total should exceed 100');

    // 2.2 Category mapping alignment
    const invalidTypes = await queryMany(`
      SELECT pm.id, m.category, pm.capabilities
      FROM ai_studio.provider_models pm
      JOIN ai_studio.ai_models m ON m.id = pm.model_id
      WHERE (m.category = 'audio' AND NOT (pm.capabilities->'output_types' ? 'audio'))
         OR (m.category IN ('video', 'video_image') AND NOT (pm.capabilities->'output_types' ? 'video'))
         OR (m.category = 'image' AND NOT (pm.capabilities->'output_types' ? 'image'));
    `);
    assert.strictEqual(invalidTypes.length, 0, 'Every provider_model capability output_types must align with canonical model category');

    // 2.3 Price versions activation and routable billing unit
    const pendingPrices = await queryOne(`
      SELECT count(*) as count
      FROM ai_studio.provider_model_price_versions
      WHERE status = 'pending_review';
    `);
    assert.strictEqual(Number(pendingPrices.count), 0, 'All pending_review price versions must be activated');

    const unverifiedBilling = await queryOne(`
      SELECT count(*) as count
      FROM ai_studio.provider_model_price_versions
      WHERE status = 'active' AND (billing_unit = 'legacy_unit_unverified' OR billing_unit IS NULL);
    `);
    assert.strictEqual(Number(unverifiedBilling.count), 0, 'Active price versions must have verified routable billing_unit');

    // 2.4 Provider health check freshness
    const staleProviders = await queryMany(`
      SELECT id, health_status, last_health_check_at
      FROM ai_studio.ai_providers
      WHERE enabled = true
        AND (last_health_check_at IS NULL OR last_health_check_at < now() - INTERVAL '1 hour');
    `);
    assert.strictEqual(staleProviders.length, 0, 'Enabled providers must have fresh health heartbeat timestamps');
});

test.after(async () => {
  const { closePgPool } = await import('../lib/db/connection.js');
  await closePgPool().catch(() => {});
});

test('3. listActiveModels() returns selectable public models with active routes and capabilities', async () => {
  const { query } = await import('../lib/db/connection.js');
  await query("UPDATE ai_studio.ai_providers SET last_health_check_at = now() WHERE enabled = true");

  const { listActiveModels } = await import('../lib/services/models.js');
  const { isSelectablePublicModel } = await import('../lib/modelCenter/publicDirectory.js');

  const models = await listActiveModels();
  assert.ok(models.length > 0, 'listActiveModels must return models');

  const selectable = models.filter(isSelectablePublicModel);
  assert.ok(selectable.length >= 5, `Expected at least 5 selectable models, got ${selectable.length}`);

  const categories = new Set(selectable.map((m) => m.category));
  assert.ok(categories.has('image'), 'Selectable models must include image models');
  assert.ok(categories.has('video'), 'Selectable models must include video models');

  for (const m of selectable) {
    assert.strictEqual(m.tier, 'core', `Model ${m.id} must be core tier`);
    assert.strictEqual(m.is_active, true, `Model ${m.id} must be active`);
    assert.strictEqual(m.is_visible, true, `Model ${m.id} must be visible`);
    assert.strictEqual(m.auto_route_eligible, true, `Model ${m.id} must be auto_route_eligible`);
    assert.strictEqual(m.hasWorkingRoute, true, `Model ${m.id} must have working route`);
    assert.ok(Number(m.credits_price) > 0, `Model ${m.id} must have positive credits_price`);
    assert.ok(Array.isArray(m.generation_capabilities) && m.generation_capabilities.length > 0,
      `Model ${m.id} must have populated generation_capabilities`);
  }
});

