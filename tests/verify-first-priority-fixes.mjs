import assert from 'node:assert/strict';
import { getPgPool, closePgPool, queryOne, execute, withTransaction } from '../lib/db/index.js';
import * as modelsRepo from '../lib/repositories/models.js';
import * as modelBrands from '../lib/services/modelBrands.js';
import { resolveBrand } from '../lib/modelCenter/brandDictionary.js';

async function runTests() {
  console.log('=== STARTING FIRST PRIORITY VERIFICATION SUITE ===\n');
  const pool = getPgPool();

  try {
    // ----------------------------------------------------
    // Test Suite 1: models.js Capabilities Preservation & Operations
    // ----------------------------------------------------
    console.log('--- Test Suite 1: models.js Capabilities Preservation & Operations ---');

    const targetModelId = 'flux-schnell';
    const original = await modelsRepo.getModelById(targetModelId);
    assert.ok(original, `Model ${targetModelId} should exist in database`);
    assert.ok(original.capabilities, 'Model capabilities should be defined');
    assert.equal(typeof original.capabilities, 'object', 'Capabilities must be an object, not string or undefined');
    console.log(`[PASS] 1.1 getModelById returns parsed capabilities object:`, original.capabilities);

    const baselineCaps = { ...original.capabilities };
    const testTag = `verify_test_${Date.now()}`;

    // Test 1.2: updateModelConfig with basic fields only (name, credits_price)
    console.log('[RUN] 1.2 Testing updateModelConfig without capabilities modification...');
    const updatedName = `${original.name} (Verified)`;
    const updatedBasic = await modelsRepo.updateModelConfig(targetModelId, {
      name: updatedName,
      credits_price: 25,
    });
    assert.ok(updatedBasic, 'updateModelConfig should return updated model');
    assert.equal(updatedBasic.name, updatedName);
    assert.equal(Number(updatedBasic.credits_price), 25);
    for (const [key, val] of Object.entries(baselineCaps)) {
      assert.deepEqual(updatedBasic.capabilities[key], val, `Key "${key}" in capabilities was lost during basic update!`);
    }
    console.log('[PASS] 1.2 Basic update preserved all original capabilities without data loss');

    // Test 1.3: updateModelConfig with is_pinned, badge, sub_type
    console.log('[RUN] 1.3 Testing updateModelConfig with is_pinned, badge, sub_type...');
    const updatedDecorations = await modelsRepo.updateModelConfig(targetModelId, {
      is_pinned: true,
      badge: '官方推荐',
      sub_type: 't2i',
    });
    assert.ok(updatedDecorations);
    assert.equal(updatedDecorations.is_pinned, true);
    assert.equal(updatedDecorations.capabilities.is_pinned, true);
    assert.equal(updatedDecorations.capabilities.badge, '官方推荐');
    for (const [key, val] of Object.entries(baselineCaps)) {
      if (['is_pinned', 'badge', 'sub_type'].includes(key)) continue;
      assert.deepEqual(updatedDecorations.capabilities[key], val, `Key "${key}" was lost when adding badge/is_pinned!`);
    }
    console.log('[PASS] 1.3 Decoration updates merged into capabilities while preserving original keys');

    // Test 1.4: updateModelConfig with extra capabilities object
    console.log('[RUN] 1.4 Testing updateModelConfig with extra custom capabilities...');
    const updatedCustomCaps = await modelsRepo.updateModelConfig(targetModelId, {
      capabilities: {
        test_feature_key: testTag,
        aspect_ratios_custom: ['1:1', '16:9'],
      },
    });
    assert.ok(updatedCustomCaps);
    assert.equal(updatedCustomCaps.capabilities.test_feature_key, testTag);
    assert.deepEqual(updatedCustomCaps.capabilities.aspect_ratios_custom, ['1:1', '16:9']);
    assert.equal(updatedCustomCaps.capabilities.badge, '官方推荐', 'badge was lost when merging capabilities object!');
    for (const [key, val] of Object.entries(baselineCaps)) {
      if (['is_pinned', 'badge', 'sub_type'].includes(key)) continue;
      assert.deepEqual(updatedCustomCaps.capabilities[key], val, `Baseline key "${key}" was lost when merging custom capabilities!`);
    }
    console.log('[PASS] 1.4 Custom capabilities merged cleanly without destroying previous fields');

    // Test 1.5: Restore original state to leave DB clean
    console.log('[RUN] 1.5 Restoring model original state...');
    await modelsRepo.updateModelConfig(targetModelId, {
      name: original.name,
      credits_price: original.credits_price,
      is_pinned: Boolean(original.is_pinned),
      badge: null,
      sub_type: null,
      capabilities: baselineCaps,
    });
    await execute(`
      UPDATE ai_studio.ai_models
      SET name = $1, display_name = $2, capabilities = $3::jsonb, is_pinned = $4
      WHERE id = $5
    `, [original.name, original.display_name || original.name, JSON.stringify(baselineCaps), Boolean(original.is_pinned), targetModelId]);
    console.log('[PASS] 1.5 Model restored cleanly to baseline state');

    // Test 1.6: getModelWithOperations
    console.log('[RUN] 1.6 Testing getModelWithOperations...');
    const withOps = await modelsRepo.getModelWithOperations(targetModelId);
    assert.ok(withOps, 'getModelWithOperations must return data');
    assert.ok(Array.isArray(withOps.routes), 'routes must be an array');
    assert.ok(withOps.capabilities, 'capabilities must be present');
    assert.equal(withOps.name, original.name, 'getModelWithOperations name must not be shadowed by display_name');
    assert.ok(withOps.display_name, 'display_name must be present in getModelWithOperations');
    console.log(`[PASS] 1.6 getModelWithOperations succeeded with ${withOps.routes.length} routes and unshadowed name`);

    // Test 1.7: findModelByEndpointOrId
    console.log('[RUN] 1.7 Testing findModelByEndpointOrId...');
    const foundDirect = await modelsRepo.findModelByEndpointOrId('flux-schnell');
    assert.ok(foundDirect, 'Exact ID match failed');
    const foundAlias = await modelsRepo.findModelByEndpointOrId('flux-dev-image');
    assert.ok(foundAlias, 'Alias match failed');
    assert.equal(foundAlias.id, 'flux-dev');
    console.log('[PASS] 1.7 findModelByEndpointOrId successfully resolved exact ID and alias');

    // ----------------------------------------------------
    // Test Suite 2: modelBrands.js SQL Alignment & Operations
    // ----------------------------------------------------
    console.log('\n--- Test Suite 2: modelBrands.js SQL Alignment & Operations ---');

    const testProviderId = 'runninghub';
    const testModelId = 'flux-schnell';
    const testProviderModelId = `test_pmodel_${Date.now()}`;
    const testEndpoint = '/api/v1/test-endpoint';

    // Test 2.1: bindBrandModel (11 columns alignment)
    console.log('[RUN] 2.1 Testing bindBrandModel insertion with 11 aligned columns...');
    const bindResult = await modelBrands.bindBrandModel({
      providerId: testProviderId,
      modelId: testModelId,
      providerModelId: testProviderModelId,
      priority: 150,
      baseCost: 0.035,
      currency: 'USD',
      providerEndpoint: testEndpoint,
      enabled: true,
    });
    assert.ok(bindResult.success, 'bindBrandModel should return success: true');
    assert.ok(bindResult.id, 'bindBrandModel should return generated id');
    console.log('[PASS] 2.1 bindBrandModel successfully inserted row with id:', bindResult.id);

    const insertedRow = await queryOne(`
      SELECT id, model_id, provider_id, provider_model_id, provider_endpoint,
             enabled, priority, cost_config, review_status
      FROM ai_studio.provider_models
      WHERE id = $1
    `, [bindResult.id]);
    assert.ok(insertedRow, 'Inserted channel model row must exist in DB');
    assert.equal(insertedRow.model_id, testModelId);
    assert.equal(insertedRow.provider_id, testProviderId);
    assert.equal(insertedRow.provider_model_id, testProviderModelId);
    assert.equal(insertedRow.provider_endpoint, testEndpoint);
    assert.equal(insertedRow.enabled, true);
    assert.equal(insertedRow.priority, 150);
    assert.equal(insertedRow.review_status, 'approved');
    const costCfg = typeof insertedRow.cost_config === 'string'
      ? JSON.parse(insertedRow.cost_config) : insertedRow.cost_config;
    assert.equal(costCfg.currency, 'USD');
    assert.equal(costCfg.base_cost, 0.035);
    console.log('[PASS] 2.1 Verified column values, types, and cost_config JSON in DB');

    // Test 2.2: ON CONFLICT DO UPDATE
    console.log('[RUN] 2.2 Testing bindBrandModel idempotency and ON CONFLICT update...');
    const rebindResult = await modelBrands.bindBrandModel({
      providerId: testProviderId,
      modelId: testModelId,
      providerModelId: testProviderModelId,
      priority: 200,
      baseCost: 0.045,
      currency: 'USD',
      providerEndpoint: '/api/v1/updated-endpoint',
      enabled: false,
    });
    assert.ok(rebindResult.success);
    const updatedRow = await queryOne(`
      SELECT priority, enabled, provider_endpoint, cost_config
      FROM ai_studio.provider_models
      WHERE id = $1
    `, [bindResult.id]);
    assert.equal(updatedRow.priority, 200);
    assert.equal(updatedRow.enabled, false);
    assert.equal(updatedRow.provider_endpoint, '/api/v1/updated-endpoint');
    const updatedCostCfg = typeof updatedRow.cost_config === 'string'
      ? JSON.parse(updatedRow.cost_config) : updatedRow.cost_config;
    assert.equal(updatedCostCfg.base_cost, 0.045);
    console.log('[PASS] 2.2 ON CONFLICT DO UPDATE successfully updated existing binding');

    // Test 2.3: toggleChannelModel
    console.log('[RUN] 2.3 Testing toggleChannelModel...');
    const toggleResult = await modelBrands.toggleChannelModel(bindResult.id, true);
    assert.equal(toggleResult.success, true);
    assert.equal(toggleResult.enabled, true);
    const toggledRow = await queryOne('SELECT enabled FROM ai_studio.provider_models WHERE id = $1', [bindResult.id]);
    assert.equal(toggledRow.enabled, true);
    console.log('[PASS] 2.3 toggleChannelModel successfully toggled enabled flag');

    // Test 2.4: updateChannelPriority
    console.log('[RUN] 2.4 Testing updateChannelPriority...');
    const priorityResult = await modelBrands.updateChannelPriority(bindResult.id, 300);
    assert.equal(priorityResult.success, true);
    assert.equal(priorityResult.priority, 300);
    const priorityRow = await queryOne('SELECT priority FROM ai_studio.provider_models WHERE id = $1', [bindResult.id]);
    assert.equal(priorityRow.priority, 300);
    console.log('[PASS] 2.4 updateChannelPriority successfully updated priority');

    // Test 2.5: getProviderBrandStats
    console.log('[RUN] 2.5 Testing getProviderBrandStats...');
    const stats = await modelBrands.getProviderBrandStats();
    assert.ok(stats && typeof stats === 'object');
    assert.ok(stats[testProviderId], `Stats should contain provider ${testProviderId}`);
    assert.ok(stats[testProviderId].totalModels > 0);
    assert.ok(Array.isArray(stats[testProviderId].brandsList));
    console.log(`[PASS] 2.5 getProviderBrandStats returned valid stats with ${Object.keys(stats).length} providers`);

    // Test 2.6: getBrandModelsPageData
    console.log('[RUN] 2.6 Testing getBrandModelsPageData...');
    const pageData = await modelBrands.getBrandModelsPageData({ providerId: testProviderId });
    assert.ok(Array.isArray(pageData.providers));
    assert.ok(Array.isArray(pageData.channels));
    assert.ok(Array.isArray(pageData.canonicalCandidates));
    assert.ok(Array.isArray(pageData.allBrands));
    const createdChannel = pageData.channels.find(c => c.id === bindResult.id);
    assert.ok(createdChannel, 'Created test channel should be included in page data channels');
    assert.equal(createdChannel.brandId, 'bfl');
    assert.equal(createdChannel.priority, 300);
    console.log(`[PASS] 2.6 getBrandModelsPageData resolved brand: ${createdChannel.brandName} (${createdChannel.brandId})`);

    // Test 2.7: unbindChannelModel
    console.log('[RUN] 2.7 Testing unbindChannelModel cleanup...');
    const unbindResult = await modelBrands.unbindChannelModel(bindResult.id);
    assert.equal(unbindResult.success, true);
    const deletedRow = await queryOne('SELECT id FROM ai_studio.provider_models WHERE id = $1', [bindResult.id]);
    assert.equal(deletedRow, null, 'Row must be deleted from ai_studio.provider_models');
    console.log('[PASS] 2.7 unbindChannelModel successfully deleted channel');

    // Test 2.8: bindBrandModel input validation on empty/missing inputs
    console.log('[RUN] 2.8 Testing bindBrandModel input validation...');
    await assert.rejects(
      async () => await modelBrands.bindBrandModel({ providerId: '', modelId: 'flux-schnell', providerModelId: 'test' }),
      /required non-empty strings/,
      'bindBrandModel should reject empty providerId'
    );
    await assert.rejects(
      async () => await modelBrands.bindBrandModel({ providerId: 'runninghub', modelId: null, providerModelId: 'test' }),
      /required non-empty strings/,
      'bindBrandModel should reject null modelId'
    );
    await assert.rejects(
      async () => await modelBrands.bindBrandModel({ providerId: 'runninghub', modelId: 'flux-schnell', providerModelId: '   ' }),
      /required non-empty strings/,
      'bindBrandModel should reject whitespace-only providerModelId'
    );
    console.log('[PASS] 2.8 bindBrandModel strictly validated required fields');

    // Test 2.9: Non-existent channel operations must throw instead of returning false success
    console.log('[RUN] 2.9 Testing channel operations on non-existent channels...');
    await assert.rejects(
      async () => await modelBrands.toggleChannelModel('non_existent_channel_id_9999', true),
      /Channel model not found/,
      'toggleChannelModel must throw on non-existent channel'
    );
    await assert.rejects(
      async () => await modelBrands.updateChannelPriority('non_existent_channel_id_9999', 50),
      /Channel model not found/,
      'updateChannelPriority must throw on non-existent channel'
    );
    await assert.rejects(
      async () => await modelBrands.unbindChannelModel('non_existent_channel_id_9999'),
      /Channel model not found/,
      'unbindChannelModel must throw on non-existent channel'
    );
    console.log('[PASS] 2.9 Channel operations on non-existent channels safely rejected');

    // ----------------------------------------------------
    // Test Suite 3: Deep Edge Cases & Adversarial Verification
    // ----------------------------------------------------
    console.log('\n--- Test Suite 3: Deep Edge Cases & Adversarial Tests ---');

    // Test 3.1: createModel lifecycle with rich capabilities, pricing, and retrieval
    const newModelId = `edge_test_model_${Date.now()}`;
    console.log(`[RUN] 3.1 Testing createModel lifecycle for ${newModelId}...`);
    const createdModel = await modelsRepo.createModel({
      id: newModelId,
      name: 'Edge Test Model',
      displayName: 'Edge Test Display Name',
      category: 'image',
      description: 'Comprehensive edge test model',
      sort: 99,
      isFeatured: true,
      isPinned: true,
      isVisible: true,
      tier: 'core',
      badge: '深度测试',
      subType: 't2i',
      capabilities: {
        custom_seed: true,
        nested: { level: 2 },
        supported_styles: ['photoreal', 'anime'],
      },
      supportedResolutions: ['1024x1024', '2048x2048'],
      supportedDurations: [],
      supportedRatios: ['1:1', '16:9'],
      creditsPrice: 40,
    });
    assert.ok(createdModel, 'createModel should return created model');
    assert.equal(createdModel.id, newModelId);
    assert.equal(createdModel.capabilities.badge, '深度测试');
    assert.equal(createdModel.capabilities.sub_type, 't2i');
    assert.equal(createdModel.capabilities.is_pinned, true);
    assert.equal(createdModel.capabilities.custom_seed, true);
    assert.deepEqual(createdModel.capabilities.nested, { level: 2 });
    assert.equal(Number(createdModel.credits_price), 40);
    console.log('[PASS] 3.1 createModel safely stored all capabilities and pricing');

    // Test 3.2: updateModelConfig with capabilities as JSON string
    console.log('[RUN] 3.2 Testing updateModelConfig when capabilities is passed as JSON string...');
    const updatedFromString = await modelsRepo.updateModelConfig(newModelId, {
      capabilities: JSON.stringify({ string_injected_cap: 'valid_val' }),
    });
    assert.equal(updatedFromString.capabilities.string_injected_cap, 'valid_val');
    assert.equal(updatedFromString.capabilities.custom_seed, true, 'Previous capabilities were destroyed by string input!');
    assert.equal(updatedFromString.capabilities.badge, '深度测试');
    console.log('[PASS] 3.2 JSON string capabilities safely parsed and merged without data loss');

    // Test 3.3: updateModelConfig clearing badge and sub_type with null/empty
    console.log('[RUN] 3.3 Testing clearing badge and sub_type cleanly...');
    const clearedDecorations = await modelsRepo.updateModelConfig(newModelId, {
      badge: null,
      sub_type: '',
      is_pinned: false,
    });
    assert.equal(clearedDecorations.capabilities.badge, undefined, 'Badge should be cleanly removed, not string "null"');
    assert.equal(clearedDecorations.capabilities.sub_type, undefined, 'sub_type should be cleanly removed');
    assert.equal(clearedDecorations.capabilities.is_pinned, false);
    assert.equal(clearedDecorations.capabilities.custom_seed, true, 'Base capabilities were lost when clearing badge!');
    console.log('[PASS] 3.3 Null/empty badge and sub_type cleanly unset without data corruption');

    // Test 3.4: Non-existent model ID update returns null safely
    console.log('[RUN] 3.4 Testing updateModelConfig on non-existent model...');
    const nonExistentResult = await modelsRepo.updateModelConfig('non_existent_model_id_999999', {
      name: 'Ghost Model',
    });
    assert.equal(nonExistentResult, null, 'Updating non-existent model must return null safely');
    console.log('[PASS] 3.4 Non-existent model returned null safely without unhandled exception');

    // Test 3.5: Transaction safety & rollback verification
    console.log('[RUN] 3.5 Testing transactional atomicity & rollback...');
    let txErrorCaught = false;
    try {
      await withTransaction(async (tx) => {
        await modelsRepo.updateModelConfig(newModelId, {
          name: 'Name In Transaction Before Abort',
          credits_price: 999,
        }, tx);
        throw new Error('Simulated transaction crash to test rollback');
      });
    } catch (e) {
      txErrorCaught = true;
    }
    assert.equal(txErrorCaught, true, 'Transaction error must be thrown');
    const postRollbackModel = await modelsRepo.getModelById(newModelId);
    assert.notEqual(postRollbackModel.name, 'Name In Transaction Before Abort', 'Transaction rollback failed! Leaked changes to DB');
    assert.notEqual(Number(postRollbackModel.credits_price), 999, 'Credits price leaked from aborted transaction');
    console.log('[PASS] 3.5 Transaction rolled back cleanly without state corruption');

    // Test 3.6: resolveBrand behavior with various inputs
    console.log('[RUN] 3.6 Testing resolveBrand on various edge cases...');
    assert.equal(resolveBrand({}).id, 'other');
    assert.equal(resolveBrand(null).id, 'other');
    assert.equal(resolveBrand({ id: 'kling-v2.6-pro-t2v' }).id, 'kuaishou');
    assert.equal(resolveBrand({ id: 'suno-v4' }).id, 'suno');
    assert.equal(resolveBrand({ id: 'unknown-model', capabilities: { brand: 'minimax' } }).id, 'minimax');
    console.log('[PASS] 3.6 resolveBrand safely handled edge cases and fallback');

    // Clean up created test model
    console.log('[RUN] 3.7 Cleaning up test model...');
    await execute('DELETE FROM ai_studio.model_pricing WHERE model_id = $1', [newModelId]);
    await execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [newModelId]);
    await execute('DELETE FROM ai_studio.models_config WHERE id = $1', [newModelId]);
    console.log('[PASS] 3.7 Test model cleaned up from all tables');

    // Test 3.8: display_name null must not throw TypeError and must update other fields in ai_models
    console.log('[RUN] 3.8 Testing display_name: null does not crash ai_models update...');
    const originalFlux = await queryOne('SELECT sort, name, display_name FROM ai_studio.ai_models WHERE id = $1', ['flux-schnell']);
    await modelsRepo.updateModelConfig('flux-schnell', { display_name: null, sort: 888 });
    const fluxAfterNullDisplayName = await queryOne('SELECT sort, display_name FROM ai_studio.ai_models WHERE id = $1', ['flux-schnell']);
    assert.equal(fluxAfterNullDisplayName.sort, 888, 'sort was not updated when display_name: null was passed');
    assert.equal(fluxAfterNullDisplayName.display_name, originalFlux.display_name, 'display_name should remain intact');
    await execute('UPDATE ai_studio.ai_models SET sort = $1 WHERE id = $2', [originalFlux.sort, 'flux-schnell']);
    console.log('[PASS] 3.8 display_name: null handled safely without crashing ai_models update');

    // Test 3.9: name: null and category: null must not be stringified to "null"
    console.log('[RUN] 3.9 Testing name: null and category: null do not store literal string "null"...');
    await modelsRepo.updateModelConfig('flux-schnell', { name: null, category: null });
    const fluxAfterNulls = await queryOne('SELECT name, category FROM ai_studio.ai_models WHERE id = $1', ['flux-schnell']);
    const mcFluxAfterNulls = await queryOne('SELECT name, type FROM models_config WHERE id = $1', ['flux-schnell']);
    assert.notEqual(fluxAfterNulls.name, 'null');
    assert.notEqual(fluxAfterNulls.category, 'null');
    assert.notEqual(mcFluxAfterNulls.name, 'null');
    assert.equal(fluxAfterNulls.name, originalFlux.name);
    console.log('[PASS] 3.9 name: null and category: null safely ignored without stringification corruption');

    // Test 3.10: whitespace-only badge and sub_type are cleanly unset in both tables
    console.log('[RUN] 3.10 Testing whitespace-only badge and sub_type clean deletion...');
    await modelsRepo.updateModelConfig('flux-schnell', { badge: '   ', sub_type: '   ' });
    const mcBadgeCheck = await queryOne('SELECT metadata_json FROM models_config WHERE id = $1', ['flux-schnell']);
    const aimBadgeCheck = await queryOne('SELECT capabilities FROM ai_studio.ai_models WHERE id = $1', ['flux-schnell']);
    assert.equal(mcBadgeCheck.metadata_json?.badge, undefined, 'models_config badge should be deleted, not empty string');
    assert.equal(aimBadgeCheck.capabilities?.badge, undefined, 'ai_models badge should be deleted');
    console.log('[PASS] 3.10 Whitespace-only badge/sub_type cleanly deleted from all metadata stores');

    // Test 3.11: maintenance status is preserved during unrelated updates
    console.log('[RUN] 3.11 Testing status preservation for maintenance models...');
    await execute("UPDATE ai_studio.ai_models SET status = 'maintenance' WHERE id = 'flux-schnell'");
    await modelsRepo.updateModelConfig('flux-schnell', { credits_price: 35 });
    const maintenanceCheck = await queryOne('SELECT status FROM ai_studio.ai_models WHERE id = $1', ['flux-schnell']);
    assert.equal(maintenanceCheck.status, 'maintenance', 'status was flipped to active during price update!');
    await modelsRepo.updateModelConfig('flux-schnell', { status: 'active', credits_price: 20 });
    const activeCheck = await queryOne('SELECT status FROM ai_studio.ai_models WHERE id = $1', ['flux-schnell']);
    assert.equal(activeCheck.status, 'active', 'explicit status update failed');
    console.log('[PASS] 3.11 Model maintenance status preserved and explicit status updates honored');

    // Test 3.12: createModel synchronizes to models_config table
    console.log('[RUN] 3.12 Testing createModel dual-write to models_config...');
    const syncTestId = `sync_test_${Date.now()}`;
    await modelsRepo.createModel({
      id: syncTestId,
      name: 'Sync Test Model',
      category: 'image',
      creditsPrice: 25,
      tier: 'core',
      isVisible: true,
    });
    const syncedMc = await queryOne('SELECT id, name, credits_price, tier FROM models_config WHERE id = $1', [syncTestId]);
    assert.ok(syncedMc, 'Newly created model must be synchronized to models_config');
    assert.equal(syncedMc.name, 'Sync Test Model');
    assert.equal(Number(syncedMc.credits_price), 25);
    await execute('DELETE FROM ai_studio.model_pricing WHERE model_id = $1', [syncTestId]);
    await execute('DELETE FROM ai_studio.ai_models WHERE id = $1', [syncTestId]);
    await execute('DELETE FROM ai_studio.models_config WHERE id = $1', [syncTestId]);
    console.log('[PASS] 3.12 createModel safely synchronized across both catalog tables');

    console.log('\n=============================================================');
    console.log('🎉 ALL 28 TEST CASES PASSED WITH 100% SUCCESS AND ZERO DEFECTS');
    console.log('=============================================================');
  } finally {
    await closePgPool().catch(() => {});
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
