import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = testUrl ? await import('../../lib/db/index.js') : null;

test('pricing control pins idempotent quotes, previews and rolls back imports, and keeps missing actual cost pending reconciliation', {
  skip: !testUrl,
}, async () => {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const authRepo = await import('../../lib/repositories/auth.js');
  const assetRepo = await import('../../lib/repositories/assets.js');
  const { createGenerationQuote, verifyAndConsumeQuote } = await import('../../lib/services/pricingEngine.js');
  const { createGenerationTask, processGenerationTask } = await import('../../lib/services/generationCore.js');
  const { runGenerationWorkerOnce } = await import('../../lib/services/taskWorker.js');
  const { grantPerpetualCredits } = await import('../../lib/financial/creditService.js');
  const authService = await import('../../lib/services/auth.js');
  const quoteRoute = await import('../../app/api/generation/quote/route.js');
  const generationRoute = await import('../../app/api/generations/route.js');
  const publicDirectoryRoute = await import('../../app/api/models/active/route.js');
  const appDirectoryRoute = await import('../../app/api/app/models/available/route.js');
  const callbackRoute = await import('../../app/api/generations/[id]/callback/route.js');
  const { previewPriceImport, applyPriceImport, rollbackPriceImport } = await import('../../lib/services/modelPriceImport.js');
  const { approveProviderPrice, setModelRoutingPolicy } = await import('../../lib/services/modelPricingControl.js');
  const { getModelPricingBreakdownList, getFrontendModelsMatrixList } = await import('../../lib/modelCenter/pricingMatrix.js');
  const { insertProviderCostRecord } = await import('../../lib/repositories/costRecords.js');
  const { getCanvasProjectJob, listCanvasProjectJobs } = await import('../../lib/repositories/canvasProjects.js');

  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  const modelId = `pricing_test_${suffix}`;
  const unpricedModelId = `unpriced_test_${suffix}`;
  const modelSlug = modelId.slice(0, 64);
  const mappingId = `mapping_${suffix}`;
  const providerModelId = `model_${suffix}`;
  const videoModelId = `pricing_video_test_${suffix}`;
  const videoMappingId = `video_mapping_${suffix}`;
  const videoProviderModelId = `video_model_${suffix}`;
  const quoteKey = `quote_idem_${suffix}`;
  const importActor = { id: null, role: 'admin' };
  const oldApiKey = process.env.MUAPI_API_KEY;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldPollInterval = process.env.PROVIDER_POLL_INTERVAL_MS;
  const oldGenerationAsync = process.env.GENERATION_ASYNC;
  const oldPublicAppUrl = process.env.PUBLIC_APP_URL;
  const oldCallbackSecret = process.env.GENERATION_CALLBACK_SECRET;
  let userId = null;
  let creationId = null;
  let importedPriceVersionId = null;
  let importBatchId = null;

  try {
    await db.execute(`INSERT INTO ai_studio.exchange_rate_snapshots
      (id,base_currency,quote_currency,rate,source_type,observed_at,expires_at,created_by)
      VALUES ($1,'USD','CNY',7.2,'manual',now(),now()+interval '1 day','test-fixture')`, [`fx_test_${suffix}`]);
    userId = await allocateUserId({
      reserve: (candidate, digits) => authRepo.reserveUserId(candidate, digits),
      findFirstAvailable: (digits) => authRepo.findFirstAvailableUserId(digits),
      isExhausted: (digits) => authRepo.isUserIdPoolExhausted(digits),
    });
    importActor.id = userId;
    await db.execute(`INSERT INTO auth_usr.users
      (id,email,password_hash,password_salt,role,credits,status)
      VALUES ($1,$2,'test-hash','test-salt','user',0,'active')`, [userId, `${userId}@pricing.test`]);
    await db.execute(`INSERT INTO ops_bill.subscriptions
      (id,user_id,provider,provider_subscription_id,plan_id,status,current_period_end)
      VALUES ($1,$2,'local_test',$3,'pro','active',now()+interval '1 day')`,
    [`pricing_test_subscription_${suffix}`, userId, `pricing_test_subscription_${suffix}`]);

    await db.execute(`INSERT INTO ai_studio.ai_models
      (id,slug,name,display_name,category,status,tier,is_visible,auto_route_eligible,supported_resolutions,supported_input_types,supported_output_types)
      VALUES ($1,$2,'Pricing integration fixture','Pricing integration fixture','image','active','core',TRUE,TRUE,
        '["1024x1024"]'::jsonb,'["text"]'::jsonb,'["image"]'::jsonb)`, [modelId, modelSlug]);
    await db.execute(`INSERT INTO ai_studio.model_pricing
      (id,model_id,pricing_type,base_credits,formula_config,subscription_discounts,min_credits,
       min_gross_margin_rate,is_active,created_at,updated_at)
      VALUES ($1,$2,'fixed',50,'{}'::jsonb,'{}'::jsonb,10,0.75,TRUE,now(),now())`, [`pricing_${suffix}`, modelId]);
    await db.execute(`UPDATE ai_studio.ai_providers SET enabled=TRUE,health_status='healthy',
      last_health_check_at=now(),balance=1000,available_quota=1000,quota_checked_at=now(),circuit_state='closed' WHERE id='muapi'`);
    await db.execute(`INSERT INTO ai_studio.provider_models
      (id,model_id,provider_id,provider_model_id,enabled,priority,cost_config,capabilities,
       review_status,provider_endpoint,supported_task_types,supported_resolutions,
       supported_durations,supported_qualities,supported_regions,license_requirements,mapping_version)
      VALUES ($1,$2,'muapi',$3,TRUE,100,'{"base_cost":0.01}'::jsonb,
        '{"input_types":["text"],"output_types":["image"]}'::jsonb,'approved',
        '/api/v1/test-image','["t2i"]'::jsonb,'["1024x1024"]'::jsonb,'[]'::jsonb,
        '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,1)`, [mappingId, modelId, providerModelId]);
    await db.execute(`INSERT INTO ai_studio.provider_model_price_versions
      (id,provider_model_id,version_no,price_type,billing_unit,currency,price_config,applicability,
       source_url,source_observed_at,fetched_at,effective_at,expires_at,evidence_digest,status,approved_by,approved_at)
      VALUES ($1,$2,1,'aggregator','per_request','USD','{"base_cost":0.01,"currency":"USD"}'::jsonb,
        '{}'::jsonb,'https://muapi.ai/docs/pricing',now(),now(),now(),now()+interval '7 days',
        'fixture-evidence','active','test-fixture',now())`, [`price_v1_${suffix}`, mappingId]);
    await setModelRoutingPolicy({ modelId, routingMode: 'stability' });
    await db.execute(`INSERT INTO ai_studio.ai_models
      (id,slug,name,display_name,category,status,tier,is_visible,auto_route_eligible)
      VALUES ($1,$1,'Unpriced fixture','Unpriced fixture','image','active','core',TRUE,FALSE)`, [unpricedModelId]);
    const unpricedBreakdown = (await getModelPricingBreakdownList()).find((row) => row.modelId === unpricedModelId);
    const unpricedFrontend = (await getFrontendModelsMatrixList()).find((row) => row.id === unpricedModelId);
    assert.equal(unpricedBreakdown?.baseCredits, null);
    assert.equal(unpricedBreakdown?.userPriceCny, null);
    assert.equal(unpricedFrontend?.baseCredits, null);
    assert.equal(unpricedFrontend?.pricingHint, '未定价');

    await db.execute(`INSERT INTO ai_studio.ai_models
      (id,slug,name,display_name,category,status,tier,is_visible,auto_route_eligible,supported_resolutions,supported_durations,supported_input_types,supported_output_types)
      VALUES ($1,$2,'Video pricing integration fixture','Video pricing integration fixture','video','active','core',TRUE,TRUE,
        '["720p"]'::jsonb,'["5"]'::jsonb,'["text"]'::jsonb,'["video"]'::jsonb)`, [videoModelId, videoModelId]);
    await db.execute(`INSERT INTO ai_studio.model_pricing
      (id,model_id,pricing_type,base_credits,formula_config,subscription_discounts,min_credits,
       min_gross_margin_rate,is_active,created_at,updated_at)
      VALUES ($1,$2,'fixed',60,'{}'::jsonb,'{}'::jsonb,10,0.75,TRUE,now(),now())`, [`video_pricing_${suffix}`, videoModelId]);
    await db.execute(`INSERT INTO ai_studio.provider_models
      (id,model_id,provider_id,provider_model_id,enabled,priority,cost_config,capabilities,
       review_status,provider_endpoint,supported_task_types,supported_resolutions,
       supported_durations,supported_qualities,supported_regions,license_requirements,mapping_version)
      VALUES ($1,$2,'muapi',$3,TRUE,100,'{"cost_per_output_second":0.01}'::jsonb,
        '{"input_types":["text"],"output_types":["video"]}'::jsonb,'approved',
        '/api/v1/test-video','["t2v"]'::jsonb,'["720p"]'::jsonb,'["5"]'::jsonb,
        '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,1)`, [videoMappingId, videoModelId, videoProviderModelId]);
    await db.execute(`INSERT INTO ai_studio.provider_model_price_versions
      (id,provider_model_id,version_no,price_type,billing_unit,currency,price_config,applicability,
       source_url,source_observed_at,fetched_at,effective_at,expires_at,evidence_digest,status,approved_by,approved_at)
      VALUES ($1,$2,1,'account_actual','per_second','USD','{"cost_per_output_second":0.01}'::jsonb,
        '{}'::jsonb,'https://muapi.ai/docs/pricing',now(),now(),now(),now()+interval '7 days',
        'video-fixture-evidence','active','test-fixture',now())`, [`video_price_v1_${suffix}`, videoMappingId]);

    /*
     * 后台透视表的渠道成本必须与路由同口径：active 价格版本优先。
     * 迁移 022 后视频成本不再是 base_cost，旧实现会把这里算成 0 成本、100% 毛利。
     */
    const breakdown = await getModelPricingBreakdownList();
    const imageBreakdown = breakdown.find((row) => row.modelId === modelId);
    assert.equal(imageBreakdown?.channelCount, 1);
    assert.equal(imageBreakdown?.pricedChannels, 1);
    assert.equal(imageBreakdown?.unpricedChannels, 0);
    assert.equal(imageBreakdown?.minCostUsd, 0.01);
    assert.equal(imageBreakdown?.minCostCny, 0.072);
    assert.equal(imageBreakdown?.minCostChannel?.costSource, 'price_version');
    assert.equal(imageBreakdown?.minCostChannel?.priceVersionId, `price_v1_${suffix}`);
    assert.equal(imageBreakdown?.marginRate, 97.9);
    const videoBreakdown = breakdown.find((row) => row.modelId === videoModelId);
    assert.equal(videoBreakdown?.channelCount, 1);
    assert.equal(videoBreakdown?.pricedChannels, 1);
    assert.equal(videoBreakdown?.unpricedChannels, 0);
    // 0.01 USD/秒 × 默认 5 秒 = 0.05 USD；按 7.2 汇率折合 0.36 CNY。
    assert.equal(videoBreakdown?.minCostUsd, 0.05);
    assert.equal(videoBreakdown?.minCostCny, 0.36);
    assert.equal(videoBreakdown?.minCostChannel?.costSource, 'price_version');
    assert.equal(videoBreakdown?.minCostChannel?.priceVersionId, `video_price_v1_${suffix}`);
    assert.deepEqual(videoBreakdown?.costBasis, { outputSeconds: 5, inputSeconds: 0, units: 1 });
    assert.equal(videoBreakdown?.grossMarginCny, 3.84);
    assert.equal(videoBreakdown?.marginRate, 91.4);
    assert.equal(videoBreakdown?.marginStatus, 'high');

    process.env.MUAPI_API_KEY = 'not-a-real-provider-key-for-local-tests';
    const parameters = { task_type: 't2i', resolution: '1024x1024', num_images: 1 };
    const quote = await createGenerationQuote({ userId, modelId, parameters, idempotencyKey: quoteKey });
    const duplicateQuote = await createGenerationQuote({ userId, modelId, parameters, idempotencyKey: quoteKey });
    assert.equal(duplicateQuote.quoteId, quote.quoteId);
    assert.equal(duplicateQuote.idempotent, true);
    assert.equal(quote.routeSnapshot.selectedProviderId, 'muapi');
    assert.equal(quote.routeSnapshot.candidates[0].providerModelId, providerModelId);
    assert.equal(quote.routeSnapshot.routingMode, 'stability');
    const capabilitySnapshot = {version:`capability_${suffix}`,schemaVersion:2,schema:{type:'object',properties:{task_type:{const:'t2i'},resolution:{enum:['1024x1024']},num_images:{type:'integer',minimum:1,maximum:1}},required:['task_type','resolution','num_images'],additionalProperties:false}};
    const boundQuote = await createGenerationQuote({userId,modelId,parameters,capabilitySnapshot,idempotencyKey:`cap_quote_${suffix}`});
    assert.equal(boundQuote.credits,quote.credits,'capability metadata cannot change the price between sites');
    assert.equal(boundQuote.pricingBreakdown.capability.version,capabilitySnapshot.version);
    await assert.rejects(createGenerationQuote({userId,modelId,parameters,capabilitySnapshot:{...capabilitySnapshot,version:'changed'},idempotencyKey:`cap_quote_${suffix}`}),{code:'QUOTE_IDEMPOTENCY_CONFLICT'});
    await assert.rejects(verifyAndConsumeQuote({quoteId:boundQuote.quoteId,userId,modelId,parameters,expectedCapabilityVersion:'different'}),{code:'QUOTE_CAPABILITY_MISMATCH'});
    assert.equal((await db.queryOne('SELECT consumed_at FROM ai_studio.generation_quotes WHERE id=$1',[boundQuote.quoteId])).consumed_at,null);
    const bound = await verifyAndConsumeQuote({quoteId:boundQuote.quoteId,userId,modelId,parameters,expectedCapabilityVersion:capabilitySnapshot.version});
    assert.equal(bound.pricingBreakdown.capability.version,capabilitySnapshot.version);

    const consumed = await verifyAndConsumeQuote({ quoteId: quote.quoteId, userId, modelId, parameters });
    assert.equal(consumed.is_consumed, true);
    await assert.rejects(
      () => verifyAndConsumeQuote({ quoteId: quote.quoteId, userId, modelId, parameters }),
      (error) => error.code === 'QUOTE_ALREADY_CONSUMED',
    );

    process.env.NODE_ENV = 'test';
    process.env.PROVIDER_POLL_INTERVAL_MS = '1';
    await grantPerpetualCredits(userId, 500, 'local pricing integration fixture', userId, `pricing_test_grant_${suffix}`);
    const imageParameters = { task_type: 't2i', resolution: '1024x1024', num_images: 1 };
    const rollbackProjectId = `canvas_rollback_project_${suffix}`;
    await db.execute(`INSERT INTO ai_studio.canvas_projects (id,owner_user_id,name)
      VALUES ($1,$2,'Canvas transaction rollback fixture')`, [rollbackProjectId, userId]);
    const rollbackQuote = await createGenerationQuote({ userId, modelId, parameters: imageParameters,
      idempotencyKey: `canvas_rollback_quote_${suffix}` });
    const rollbackWalletBefore = await db.queryOne(`SELECT perpetual_credits,frozen_credits
      FROM ops_bill.credit_wallets WHERE user_id=$1`, [userId]);
    const rollbackLedgerBefore = await db.queryOne(`SELECT COUNT(*)::int AS count
      FROM ops_bill.credit_ledger_v2 WHERE user_id=$1`, [userId]);
    let canvasLinkAttempted = false;
    await assert.rejects(() => createGenerationTask({
      userId, modelId, prompt: 'isolated Canvas transaction rollback scenario',
      parameters: imageParameters, quoteParameters: imageParameters, quoteId: rollbackQuote.quoteId,
      idempotencyKey: `canvas_rollback_task_${suffix}`,
      onTaskCreated: async ({ creation, transaction }) => {
        canvasLinkAttempted = true;
        assert.ok(creation?.id);
        assert.equal(typeof transaction?.query, 'function');
        await transaction.query(`INSERT INTO ai_studio.canvas_project_jobs
          (job_id,project_id,owner_user_id,node_id,model_id,idempotency_key)
          VALUES ($1,$2,$3,'rollback-node',$4,$5)`,
        [creation.id, rollbackProjectId, userId, modelId, `canvas_rollback_task_${suffix}`]);
        throw Object.assign(new Error('isolated Canvas project-job link failure'), {
          code: 'TEST_CANVAS_PROJECT_LINK_ROLLBACK',
        });
      },
    }), (error) => error.code === 'TEST_CANVAS_PROJECT_LINK_ROLLBACK');
    assert.equal(canvasLinkAttempted, true);
    assert.equal((await db.queryOne('SELECT consumed_at FROM ai_studio.generation_quotes WHERE id=$1',
      [rollbackQuote.quoteId])).consumed_at, null);
    assert.equal((await db.queryOne('SELECT COUNT(*)::int AS count FROM ai_studio.creations WHERE user_id=$1',
      [userId])).count, 0);
    assert.equal((await db.queryOne('SELECT COUNT(*)::int AS count FROM ops_bill.credit_reservations WHERE user_id=$1',
      [userId])).count, 0);
    assert.equal((await db.queryOne('SELECT COUNT(*)::int AS count FROM ai_studio.canvas_project_jobs WHERE project_id=$1',
      [rollbackProjectId])).count, 0);
    assert.equal((await db.queryOne('SELECT COUNT(*)::int AS count FROM ops_bill.credit_ledger_v2 WHERE user_id=$1',
      [userId])).count, rollbackLedgerBefore.count);
    const rollbackWalletAfter = await db.queryOne(`SELECT perpetual_credits,frozen_credits
      FROM ops_bill.credit_wallets WHERE user_id=$1`, [userId]);
    assert.deepEqual(rollbackWalletAfter, rollbackWalletBefore);

    const atomicProjectId = `canvas_atomic_project_${suffix}`;
    const atomicNodeId = `atomic-node-${suffix}`;
    const atomicNodeKey = `canvas_node_${suffix}`;
    await db.execute(`INSERT INTO ai_studio.canvas_projects (id,owner_user_id,name)
      VALUES ($1,$2,'Canvas atomic generation fixture')`, [atomicProjectId, userId]);
    const atomicQuote = await createGenerationQuote({ userId, modelId, parameters: imageParameters,
      idempotencyKey: `canvas_atomic_quote_${suffix}` });
    const atomicTaskKey = `canvas_atomic_task_${suffix}`;
    const atomicWalletBefore = await db.queryOne(`SELECT perpetual_credits,frozen_credits
      FROM ops_bill.credit_wallets WHERE user_id=$1`, [userId]);
    const linkAtomicProjectJob = async ({ creation, transaction }) => {
      const values = [atomicProjectId, userId, atomicNodeId, creation.id, modelId, atomicNodeKey];
      const inserted = await transaction.query(`
        INSERT INTO ai_studio.canvas_project_jobs
          (project_id,owner_user_id,node_id,job_id,model_id,idempotency_key)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT DO NOTHING
        RETURNING job_id,project_id,owner_user_id,node_id,model_id,idempotency_key
      `, values);
      if (inserted.rows[0]) return inserted.rows[0];
      const existingLink = await transaction.query(`
        SELECT job_id,project_id,owner_user_id,node_id,model_id,idempotency_key
        FROM ai_studio.canvas_project_jobs
        WHERE (job_id=$4 AND owner_user_id=$2 AND model_id=$5)
           OR (project_id=$1 AND owner_user_id=$2 AND node_id=$3
               AND model_id=$5 AND idempotency_key=$6)
        FOR UPDATE
      `, values);
      const exact = existingLink.rows.find((row) => row.job_id === creation.id
        && row.project_id === atomicProjectId
        && row.owner_user_id === userId
        && row.node_id === atomicNodeId && row.model_id === modelId
        && row.idempotency_key === atomicNodeKey);
      if (exact) return exact;
      throw Object.assign(new Error('Canvas project-node idempotency conflict'), {
        code: 'CANVAS_PROJECT_JOB_IDEMPOTENCY_CONFLICT',
      });
    };
    const concurrentRequests = await Promise.all(Array.from({ length: 8 }, () => createGenerationTask({
      userId,
      modelId,
      prompt: 'isolated Canvas concurrent request',
      parameters: imageParameters,
      quoteParameters: imageParameters,
      quoteId: atomicQuote.quoteId,
      idempotencyKey: atomicTaskKey,
      studioId: 'canvas',
      onTaskCreated: linkAtomicProjectJob,
    })));
    const concurrentCreationIds = [...new Set(concurrentRequests.map((result) => result.creation.id))];
    assert.equal(concurrentCreationIds.length, 1);
    const atomicCreationId = concurrentCreationIds[0];
    assert.equal(concurrentRequests.some((result) => result.idempotent === false), true);
    assert.equal((await db.queryOne(`SELECT COUNT(*)::int AS count FROM ai_studio.creations
      WHERE user_id=$1 AND idempotency_key=$2`, [userId, atomicTaskKey])).count, 1);
    assert.equal((await db.queryOne(`SELECT COUNT(*)::int AS count FROM ops_bill.credit_reservations
      WHERE user_id=$1 AND idempotency_key=$2`, [userId, atomicTaskKey])).count, 1);
    assert.equal((await db.queryOne(`SELECT COUNT(*)::int AS count FROM ai_studio.canvas_project_jobs
      WHERE project_id=$1 AND node_id=$2 AND idempotency_key=$3`,
    [atomicProjectId, atomicNodeId, atomicNodeKey])).count, 1);
    const recoveredCanvasJobs = await listCanvasProjectJobs(userId, {
      projectId: atomicProjectId,
      idempotencyKeys: [atomicNodeKey],
      limit: 10,
    });
    assert.equal(recoveredCanvasJobs.length, 1);
    assert.equal(recoveredCanvasJobs[0].job_id, atomicCreationId);
    assert.equal(recoveredCanvasJobs[0].idempotency_key, atomicNodeKey);
    assert.equal(recoveredCanvasJobs[0].project_id, atomicProjectId);
    const atomicProviderRequestId = `canvas_provider_request_${suffix}`;
    await db.execute('UPDATE ai_studio.creations SET provider_request_id=$2 WHERE id=$1',
      [atomicCreationId, atomicProviderRequestId]);
    const canvasJobDetail = await getCanvasProjectJob(userId, atomicCreationId);
    assert.equal(canvasJobDetail.quote_id, atomicQuote.quoteId);
    assert.equal(canvasJobDetail.provider_request_id, atomicProviderRequestId);
    // The synthetic receipt above only proves the job lookup exposes it. A queued
    // task must not carry a receipt: the worker would have to poll rather than
    // dispatch, and a real submission publishes its receipt itself.
    await db.execute('UPDATE ai_studio.creations SET provider_request_id=NULL WHERE id=$1', [atomicCreationId]);
    assert.equal(await getCanvasProjectJob(`non_owner_${suffix}`, atomicCreationId), null);
    assert.equal((await listCanvasProjectJobs(`non_owner_${suffix}`, {
      projectId: atomicProjectId,
      limit: 10,
    })).length, 0);
    const atomicCreation = await db.queryOne('SELECT input_summary_json FROM ai_studio.creations WHERE id=$1', [atomicCreationId]);
    const atomicInput = typeof atomicCreation.input_summary_json === 'string'
      ? JSON.parse(atomicCreation.input_summary_json) : atomicCreation.input_summary_json;
    assert.equal(typeof atomicInput.parameters.watermark, 'boolean');
    assert.ok((await db.queryOne('SELECT consumed_at FROM ai_studio.generation_quotes WHERE id=$1',
      [atomicQuote.quoteId])).consumed_at);
    const atomicWalletAfter = await db.queryOne(`SELECT perpetual_credits,frozen_credits
      FROM ops_bill.credit_wallets WHERE user_id=$1`, [userId]);
    assert.equal(Number(atomicWalletBefore.perpetual_credits) - Number(atomicWalletAfter.perpetual_credits), 50);
    assert.equal(Number(atomicWalletAfter.frozen_credits) - Number(atomicWalletBefore.frozen_credits), 50);

    const conflictingQuote = await createGenerationQuote({ userId, modelId, parameters: imageParameters,
      idempotencyKey: `canvas_conflicting_quote_${suffix}` });
    const conflictingTaskKey = `canvas_conflicting_task_${suffix}`;
    await assert.rejects(() => createGenerationTask({
      userId,
      modelId,
      prompt: 'isolated Canvas conflicting node task',
      parameters: imageParameters,
      quoteParameters: imageParameters,
      quoteId: conflictingQuote.quoteId,
      idempotencyKey: conflictingTaskKey,
      studioId: 'canvas',
      onTaskCreated: linkAtomicProjectJob,
    }), (error) => error.code === 'CANVAS_PROJECT_JOB_IDEMPOTENCY_CONFLICT');
    assert.equal((await db.queryOne('SELECT consumed_at FROM ai_studio.generation_quotes WHERE id=$1',
      [conflictingQuote.quoteId])).consumed_at, null);
    assert.equal((await db.queryOne(`SELECT COUNT(*)::int AS count FROM ai_studio.creations
      WHERE user_id=$1 AND idempotency_key=$2`, [userId, conflictingTaskKey])).count, 0);
    assert.equal((await db.queryOne(`SELECT COUNT(*)::int AS count FROM ops_bill.credit_reservations
      WHERE user_id=$1 AND idempotency_key=$2`, [userId, conflictingTaskKey])).count, 0);
    assert.deepEqual(await db.queryOne(`SELECT perpetual_credits,frozen_credits
      FROM ops_bill.credit_wallets WHERE user_id=$1`, [userId]), atomicWalletAfter);

    process.env.PUBLIC_APP_URL = 'http://127.0.0.1:3100';
    const session = await authService.createSession(userId);
    // Exercise the authenticated Canvas contract using this isolated model and wallet,
    // never an arbitrary existing user or a production model's current price.
    const canvasModelsRoute = await import('../../app/api/canvas/models/route.js');
    const originalCanvasConfig = await db.queryOne(`SELECT value_json FROM ops_bill.system_settings WHERE key='canvas_model_config'`);
    const originalVerified = process.env.CANVAS_E2E_VERIFIED_MODEL_IDS;
    try {
      process.env.CANVAS_E2E_VERIFIED_MODEL_IDS = '*';
      await db.execute(`INSERT INTO ops_bill.system_settings(key,value_json,updated_at) VALUES('canvas_model_config',$1::jsonb,now())
        ON CONFLICT(key) DO UPDATE SET value_json=EXCLUDED.value_json`, [JSON.stringify({
        mountedModelIds: { image: [modelId, unpricedModelId], video: [], text: [], audio: [] },
        defaults: { imageModelId: modelId },
      })]);
      const response = await canvasModelsRoute.GET(new NextRequest('http://127.0.0.1:3100/api/canvas/models', {
        headers: { Origin: 'http://127.0.0.1:3100', Cookie: `ko_session=${session.token}` },
      }));
      assert.equal(response.status, 200);
      const catalog = await response.json();
      assert.equal(catalog.schemaVersion, 1);
      assert.equal(typeof catalog.catalogVersion, 'string');
      assert.deepEqual(catalog.models.map((m) => m.id), [modelId]);
      assert.equal(catalog.models[0].available, true);
      assert.equal(catalog.models[0].capability, 'image');
      assert.equal(catalog.models[0].creditsPrice, 50);
      assert.equal(catalog.models[0].availability.state, 'enabled');
    } finally {
      if (originalVerified === undefined) delete process.env.CANVAS_E2E_VERIFIED_MODEL_IDS;
      else process.env.CANVAS_E2E_VERIFIED_MODEL_IDS = originalVerified;
      if (originalCanvasConfig) await db.execute(`UPDATE ops_bill.system_settings SET value_json=$1::jsonb WHERE key='canvas_model_config'`, [JSON.stringify(originalCanvasConfig.value_json)]);
      else await db.execute(`DELETE FROM ops_bill.system_settings WHERE key='canvas_model_config'`);
    }
    const createRequest = (path, body, idempotencyKey) => new NextRequest(new URL(path, 'http://127.0.0.1:3100'), {
      method: 'POST',
      headers: new Headers({
        Origin: 'http://127.0.0.1:3100',
        Cookie: `ko_session=${session.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      }),
      body: JSON.stringify(body),
    });
    const directoryIds = async () => {
      const publicResponse = await publicDirectoryRoute.GET(new NextRequest(
        new URL('/api/models/active?nocache=1', 'http://127.0.0.1:3100')));
      const appResponse = await appDirectoryRoute.GET(new NextRequest(
        new URL('/api/app/models/available?type=image', 'http://127.0.0.1:3100')));
      assert.equal(publicResponse.status, 200);
      assert.equal(appResponse.status, 200);
      const publicBody = await publicResponse.json();
      const appBody = await appResponse.json();
      return {
        publicIds: publicBody.models.map((model) => model.id),
        appIds: appBody.data.models.map((model) => model.id),
      };
    };
    const visibleDirectories = await directoryIds();
    assert.ok(visibleDirectories.publicIds.includes(modelId));
    assert.ok(visibleDirectories.appIds.includes(modelId));
    await db.execute('UPDATE ai_studio.ai_models SET auto_route_eligible=FALSE WHERE id=$1', [modelId]);
    const blockedDirectories = await directoryIds();
    assert.ok(!blockedDirectories.publicIds.includes(modelId));
    assert.ok(!blockedDirectories.appIds.includes(modelId));
    const blockedQuoteResponse = await quoteRoute.POST(createRequest('/api/generation/quote', {
      modelId,
      parameters: imageParameters,
    }, `blocked_quote_${suffix}`));
    assert.equal(blockedQuoteResponse.status, 422);
    assert.equal((await blockedQuoteResponse.json()).code, 'MODEL_NOT_PUBLICLY_AVAILABLE');
    await db.execute('UPDATE ai_studio.ai_models SET auto_route_eligible=TRUE WHERE id=$1', [modelId]);
    const restoredDirectories = await directoryIds();
    assert.ok(restoredDirectories.publicIds.includes(modelId));
    assert.ok(restoredDirectories.appIds.includes(modelId));
    const quoteResponse = await quoteRoute.POST(createRequest('/api/generation/quote', {
      modelId,
      parameters: imageParameters,
    }, `image_quote_${suffix}`));
    assert.equal(quoteResponse.status, 201);
    const quoteBody = await quoteResponse.json();
    assert.ok(quoteBody.quote_id);
    assert.equal(quoteBody.credits, 50);

    process.env.GENERATION_ASYNC = 'true';
    const generationBody = {
      modelId,
      prompt: 'nonpaid local image scenario',
      parameters: imageParameters,
      quoteId: quoteBody.quote_id,
      studioId: 'image',
    };
    await db.execute('UPDATE ai_studio.ai_models SET auto_route_eligible=FALSE WHERE id=$1', [modelId]);
    const blockedTaskResponse = await generationRoute.POST(createRequest('/api/generations', generationBody, `blocked_task_${suffix}`));
    assert.equal(blockedTaskResponse.status, 422);
    assert.equal((await blockedTaskResponse.json()).code, 'MODEL_NOT_PUBLICLY_AVAILABLE');
    await db.execute('UPDATE ai_studio.ai_models SET auto_route_eligible=TRUE WHERE id=$1', [modelId]);
    const taskResponse = await generationRoute.POST(createRequest('/api/generations', generationBody, `image_task_${suffix}`));
    assert.equal(taskResponse.status, 202);
    const taskBody = await taskResponse.json();
    const imageTask = { creation: taskBody.creation };
    assert.ok(imageTask.creation?.id);
    assert.equal(imageTask.creation.status, 'queued');
    assert.equal(imageTask.creation.routing_mode, 'stability');
    const imageInputSummary = typeof imageTask.creation.input_summary_json === 'string'
      ? JSON.parse(imageTask.creation.input_summary_json) : imageTask.creation.input_summary_json;
    assert.equal(imageInputSummary.routingMode, 'stability');
    const duplicateTaskResponse = await generationRoute.POST(createRequest('/api/generations', generationBody, `image_task_${suffix}`));
    assert.equal(duplicateTaskResponse.status, 200);
    const duplicateTaskBody = await duplicateTaskResponse.json();
    assert.equal(duplicateTaskBody.creation.id, imageTask.creation.id);
    assert.equal(duplicateTaskBody.idempotent, true);
    const recoveredByKey=await generationRoute.GET(new NextRequest(new URL(`/api/generations?idempotencyKey=image_task_${suffix}`,'http://127.0.0.1:3100'),{headers:{Cookie:`ko_session=${session.token}`}}));
    assert.equal(recoveredByKey.status,200);
    assert.equal((await recoveredByKey.json()).creation.id,imageTask.creation.id);
    const foreignKey=await (await import('../../lib/repositories/creations.js')).findUserCreationByIdempotency('another-fixture-user',`image_task_${suffix}`);
    assert.equal(foreignKey,null,'member lookup remains scoped to the authenticated owner');
    if (oldGenerationAsync === undefined) delete process.env.GENERATION_ASYNC;
    else process.env.GENERATION_ASYNC = oldGenerationAsync;
    const duplicateImageTask = await createGenerationTask({ userId, modelId, studioId:'image', prompt: 'nonpaid local image scenario',
      parameters: imageParameters, quoteId: quoteBody.quote_id, idempotencyKey: `image_task_${suffix}` });
    assert.equal(duplicateImageTask.creation.id, imageTask.creation.id);
    assert.equal(duplicateImageTask.idempotent, true);

    const videoParameters = { task_type: 't2v', resolution: '720p', duration: 5 };
    const videoQuote = await createGenerationQuote({ userId, modelId: videoModelId, parameters: videoParameters,
      idempotencyKey: `video_quote_${suffix}` });
    const videoTask = await createGenerationTask({ userId, modelId: videoModelId, prompt: 'nonpaid local video scenario',
      parameters: videoParameters, quoteId: videoQuote.quoteId, idempotencyKey: `video_task_${suffix}` });
    const storageFailureQuote = await createGenerationQuote({ userId, modelId, parameters: imageParameters,
      idempotencyKey: `storage_failure_quote_${suffix}` });
    const storageFailureTask = await createGenerationTask({ userId, modelId, prompt: 'storage failure local scenario',
      parameters: imageParameters, quoteId: storageFailureQuote.quoteId, idempotencyKey: `storage_failure_task_${suffix}` });
    const assetFailureQuote = await createGenerationQuote({ userId, modelId, parameters: imageParameters,
      idempotencyKey: `asset_failure_quote_${suffix}` });
    const assetFailureTask = await createGenerationTask({ userId, modelId, prompt: 'asset sync failure local scenario',
      parameters: imageParameters, quoteId: assetFailureQuote.quoteId, idempotencyKey: `asset_failure_task_${suffix}` });
    const callbackQuote = await createGenerationQuote({ userId, modelId, parameters: imageParameters,
      idempotencyKey: `callback_quote_${suffix}` });
    const callbackTask = await createGenerationTask({ userId, modelId, prompt: 'callback failure local scenario',
      parameters: imageParameters, quoteId: callbackQuote.quoteId, idempotencyKey: `callback_task_${suffix}` });
    await db.execute(`UPDATE ai_studio.creations SET status='processing' WHERE id=$1 AND status='queued'`, [callbackTask.creation.id]);
    const storageFailureCreationId = storageFailureTask.creation.id;
    const assetFailureCreationId = assetFailureTask.creation.id;
    const submittedModels = [];
    const testDependencies = {
      async syncAsset(creation, { transaction, required }) {
        assert.equal(required, true);
        if (creation.id === assetFailureCreationId) {
          throw Object.assign(new Error('isolated asset sync failure'), { code: 'STORAGE_ASSET_SYNC_FAILED' });
        }
        const reservation = await transaction.queryOne(
          'SELECT status FROM ops_bill.credit_reservations WHERE id=$1',
          [creation.reservation_id],
        );
        assert.equal(reservation.status, 'RESERVED', 'private asset persistence must complete before credits are committed');
        return assetRepo.createUserAsset({ transaction, userId: creation.user_id, creationId: creation.id,
          objectKey: creation.result_object_key, visibility: 'private', storageStatus: 'ready', assetType: 'image' });
      },
      getProviderAdapter: async (providerId) => {
        assert.equal(providerId, 'muapi');
        return {
          async createTask({ providerModelId: submittedId, providerEndpoint }) {
            submittedModels.push(submittedId);
            if (submittedId === providerModelId) {
              assert.equal(providerEndpoint, '/api/v1/test-image');
              return { providerRequestId: `image_request_${suffix}`, resultUrl: 'data:image/png;base64,iVBORw0KGgo=', actualCostUsd: null };
            }
            assert.equal(submittedId, videoProviderModelId);
            assert.equal(providerEndpoint, '/api/v1/test-video');
            return { providerRequestId: `video_request_${suffix}`, resultUrl: null, actualCostUsd: null };
          },
          // The factory is stateless in production, so polling must recover the
          // upstream model from the stored attempt rather than adapter state.
          async getTask(requestId, { providerModelId: polledModelId } = {}) {
            assert.equal(requestId, `video_request_${suffix}`);
            assert.equal(polledModelId, videoProviderModelId, 'polling must reuse the attempt provider model');
            return { status: 'succeeded', resultUrl: 'data:video/mp4;base64,AAAA', actualCostUsd: 0.025 };
          },
          normalizeError(error) { return error; },
        };
      },
      async archiveGenerationResult({ resultUrl, creation }) {
        assert.match(resultUrl, /^data:(image\/png|video\/mp4);base64,/);
        if (creation.id === storageFailureCreationId) {
          throw Object.assign(new Error('isolated storage adapter failure'), {
            code: 'STORAGE_INGEST_FAILED',
            storageAttempts: 3,
            providerRequestId: `storage_failure_request_${suffix}`,
          });
        }
        return {
          objectKey: `local-test/${creation.id}`,
          bucket: 'local-test', region: 'local',
          mimeType: creation.model === modelId ? 'image/png' : 'video/mp4',
          sizeBytes: 4, checksum: `checksum-${creation.id}`, attempts: 1,
        };
      },
    };
    const workerCycle = await runGenerationWorkerOnce({ batchSize: 1, testDependencies });
    assert.equal(workerCycle.queuedCount, 1);
    assert.equal(workerCycle.processed[0]?.id, atomicCreationId);
    assert.equal(workerCycle.processed[0]?.result?.success, true);
    const imageResult = await processGenerationTask({ creationId: imageTask.creation.id, testDependencies });
    creationId = imageTask.creation.id;
    const videoResult = await processGenerationTask({ creationId: videoTask.creation.id, testDependencies });
    const storageFailureResult = await processGenerationTask({ creationId: storageFailureTask.creation.id, testDependencies });
    const assetFailureResult = await processGenerationTask({ creationId: assetFailureTask.creation.id, testDependencies });
    assert.equal(imageResult.success, true, JSON.stringify(imageResult));
    assert.equal(videoResult.success, true, JSON.stringify(videoResult));
    assert.ok(imageResult.creation.asset_id, 'synchronous response must contain the linked private asset ID');
    assert.equal(storageFailureResult.success, false);
    assert.equal(storageFailureResult.storageFailed, true);
    assert.equal(storageFailureResult.creation.status, 'failed');
    assert.equal(storageFailureResult.creation.storage_status, 'failed');
    assert.equal(storageFailureResult.creation.result_object_key, null);
    assert.equal(assetFailureResult.success, false);
    assert.equal(assetFailureResult.storageFailed, true);
    assert.equal(assetFailureResult.creation.status, 'failed');
    assert.deepEqual(submittedModels, [providerModelId, providerModelId, videoProviderModelId, providerModelId, providerModelId]);
    assert.equal(videoResult.attempts, 1);

    const failedReservation = await db.queryOne(`SELECT status FROM ops_bill.credit_reservations WHERE id=$1`, [storageFailureTask.creation.reservation_id]);
    assert.equal(failedReservation.status, 'VOIDED');
    const failureLedger = await db.queryMany(`SELECT action_type,delta FROM ops_bill.credit_ledger_v2
      WHERE user_id=$1 AND reference_id=$2 ORDER BY action_type,delta`, [userId, storageFailureTask.creation.reservation_id]);
    assert.ok(failureLedger.some((row) => row.action_type === 'TASK_RESERVE' && Number(row.delta) === -50));
    assert.ok(failureLedger.some((row) => row.action_type === 'TASK_RELEASE' && Number(row.delta) === 50));
    const assetFailureReservation = await db.queryOne(`SELECT status FROM ops_bill.credit_reservations WHERE id=$1`, [assetFailureTask.creation.reservation_id]);
    assert.equal(assetFailureReservation.status, 'VOIDED');
    const assetFailureLedger = await db.queryMany(`SELECT action_type,delta FROM ops_bill.credit_ledger_v2
      WHERE user_id=$1 AND reference_id=$2 ORDER BY action_type,delta`, [userId, assetFailureTask.creation.reservation_id]);
    assert.ok(assetFailureLedger.some((row) => row.action_type === 'TASK_RESERVE' && Number(row.delta) === -50));
    assert.ok(assetFailureLedger.some((row) => row.action_type === 'TASK_RELEASE' && Number(row.delta) === 50));

    const callbackSecret = `isolated_callback_${suffix}`.padEnd(48, 'x');
    process.env.GENERATION_CALLBACK_SECRET = callbackSecret;
    const callbackRequest = (secret, body, idempotencyKey = 'callback-failure-key') => new NextRequest(
      new URL(`/api/generations/${callbackTask.creation.id}/callback`, 'http://127.0.0.1:3100'),
      {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
          'X-Generation-Callback-Secret': secret,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        }),
        body: JSON.stringify(body),
      },
    );
    const rejectedCallback = await callbackRoute.POST(
      callbackRequest(`${callbackSecret}wrong`, { status: 'failed' }),
      { params: Promise.resolve({ id: callbackTask.creation.id }) },
    );
    assert.equal(rejectedCallback.status, 401);
    const missingIdempotencyCallback = await callbackRoute.POST(
      callbackRequest(callbackSecret, { status: 'failed' }, ''),
      { params: Promise.resolve({ id: callbackTask.creation.id }) },
    );
    assert.equal(missingIdempotencyCallback.status, 422);
    assert.equal((await db.queryOne('SELECT status FROM ai_studio.creations WHERE id=$1', [callbackTask.creation.id])).status, 'processing');
    const callbackResult = await callbackRoute.POST(
      callbackRequest(callbackSecret, { status: 'failed', errorCode: 'TEST_PROVIDER_FAILURE', errorReason: 'isolated provider failure' }),
      { params: Promise.resolve({ id: callbackTask.creation.id }) },
    );
    assert.equal(callbackResult.status, 200);
    const callbackBody = await callbackResult.json();
    assert.equal(callbackBody.creation.status, 'failed');
    assert.equal(callbackBody.success, false);
    const callbackCost = await db.queryOne('SELECT actual_cost_usd FROM ai_studio.creations WHERE id=$1', [callbackTask.creation.id]);
    assert.equal(callbackCost.actual_cost_usd, null, 'an omitted provider cost must stay unknown rather than being recorded as zero');
    const repeatedCallback = await callbackRoute.POST(
      callbackRequest(callbackSecret, { status: 'failed', errorCode: 'TEST_PROVIDER_FAILURE' }),
      { params: Promise.resolve({ id: callbackTask.creation.id }) },
    );
    assert.equal(repeatedCallback.status, 200);
    assert.equal((await repeatedCallback.json()).idempotent, true);
    const callbackReservation = await db.queryOne('SELECT status FROM ops_bill.credit_reservations WHERE id=$1', [callbackTask.creation.reservation_id]);
    assert.equal(callbackReservation.status, 'VOIDED');

    const completedCreations = await db.queryMany(`SELECT id,model,status,storage_status,result_object_key,
        actual_cost_usd,quote_id,reservation_id FROM ai_studio.creations WHERE id=ANY($1::text[]) ORDER BY model`,
    [[imageTask.creation.id, videoTask.creation.id]]);
    assert.equal(completedCreations.length, 2);
    assert.ok(completedCreations.every((row) => row.status === 'succeeded' && row.storage_status === 'ready' && row.result_object_key));
    assert.equal(completedCreations.find((row) => row.model === modelId).actual_cost_usd, null);
    assert.equal(Number(completedCreations.find((row) => row.model === videoModelId).actual_cost_usd), 0.025);
    const attempts = await db.queryMany(`SELECT ga.provider_model_id,ga.status,ga.reconciliation_status,
        r.selected_provider_id,r.quote_id FROM ai_studio.generation_attempts ga
      JOIN ai_studio.route_decision_logs r ON r.job_id=ga.creation_id
      WHERE ga.creation_id=ANY($1::text[]) ORDER BY ga.creation_id`, [[imageTask.creation.id, videoTask.creation.id]]);
    assert.equal(attempts.length, 2);
    assert.ok(attempts.every((row) => row.status === 'succeeded' && row.selected_provider_id === 'muapi' && row.quote_id));
    assert.equal(attempts.find((row) => row.provider_model_id === providerModelId).reconciliation_status, 'pending_reconciliation');
    assert.equal(attempts.find((row) => row.provider_model_id === videoProviderModelId).reconciliation_status, 'provider_reported');
    const costRows = await db.queryMany(`SELECT job_id,actual_cost_usd,reconciliation_status
      FROM ai_studio.provider_cost_records WHERE job_id=ANY($1::text[]) ORDER BY job_id`, [[imageTask.creation.id, videoTask.creation.id]]);
    assert.equal(costRows.length, 2);
    assert.equal(costRows.find((row) => row.job_id === imageTask.creation.id).actual_cost_usd, null);
    assert.equal(costRows.find((row) => row.job_id === videoTask.creation.id).reconciliation_status, 'provider_reported');
    assert.ok(await (await import('../../lib/repositories/creations.js')).findUserCreationByIdempotency(userId, `image_task_${suffix}`));
    const wallet = await db.queryOne('SELECT perpetual_credits,frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [userId]);
    assert.equal(Number(wallet.frozen_credits), 0);
    assert.equal(Number(wallet.perpetual_credits), 340);

    const imageCreationRow = await db.queryOne('SELECT * FROM ai_studio.creations WHERE id=$1', [imageTask.creation.id]);
    const { syncCreationToAsset } = await import('../../lib/services/assets.js');
    const syncedAsset = await syncCreationToAsset(imageCreationRow);
    assert.ok(syncedAsset?.id);
    const storedAsset = await db.queryOne(`SELECT user_id,creation_id,object_key,visibility,storage_status
      FROM ai_studio.user_assets WHERE id=$1`, [syncedAsset.id]);
    assert.equal(storedAsset.user_id, userId);
    assert.equal(storedAsset.creation_id, imageTask.creation.id);
    assert.equal(storedAsset.object_key, `local-test/${imageTask.creation.id}`);
    assert.equal(storedAsset.visibility, 'private');
    assert.equal(storedAsset.storage_status, 'ready');
    const { listUserGenerations } = await import('../../lib/services/generations.js');
    const userHistory = await listUserGenerations(userId, 20, '');
    assert.ok(userHistory.some((row) => row.id === imageTask.creation.id && row.status === 'succeeded'));
    assert.ok(userHistory.some((row) => row.id === storageFailureTask.creation.id && row.status === 'failed'));
    const historyResponse = await generationRoute.GET(new NextRequest(
      new URL('/api/generations', 'http://127.0.0.1:3100'),
      { method: 'GET', headers: new Headers({ Cookie: `ko_session=${session.token}` }) },
    ));
    assert.equal(historyResponse.status, 200);
    const historyBody = await historyResponse.json();
    assert.ok(historyBody.creations.some((row) => row.id === imageTask.creation.id && row.status === 'succeeded'));
    assert.ok(historyBody.creations.some((row) => row.id === storageFailureTask.creation.id && row.status === 'failed'));

    const observedAt = new Date().toISOString();
    const importRow = {
      canonical_model_id: modelId,
      provider_id: 'muapi',
      provider_model_id: providerModelId,
      price_type: 'aggregator',
      billing_unit: 'per_request',
      currency: 'USD',
      channel_price_json: JSON.stringify({ base_cost: 0.02, currency: 'USD' }),
      channel_source_url: 'https://muapi.ai/docs/pricing',
      channel_source_observed_at: observedAt,
      site_price_cny: '3.00',
      credits: '40',
    };
    const preview = await previewPriceImport({ rows: [importRow], sourceFilename: 'fixture.csv', actor: importActor });
    importBatchId = preview.batchId;
    assert.equal(preview.canApply, true);
    assert.equal(preview.validCount, 1);
    assert.equal(preview.mode, 'dry_run');

    const applied = await applyPriceImport({ batchId: preview.batchId, actor: importActor });
    assert.equal(applied.status, 'applied');
    importedPriceVersionId = applied.rows[0] && (await db.queryOne(`SELECT id FROM ai_studio.provider_model_price_versions
      WHERE provider_model_id=$1 AND status='pending_review' AND version_no=2`, [mappingId]))?.id;
    assert.ok(importedPriceVersionId);
    await approveProviderPrice({ versionId: importedPriceVersionId, actor: importActor });
    const rolledBack = await rollbackPriceImport({ batchId: preview.batchId, actor: importActor });
    assert.equal(rolledBack.status, 'rolled_back');
    const priceVersions = await db.queryMany(`SELECT id,status FROM ai_studio.provider_model_price_versions
      WHERE provider_model_id=$1 AND price_type='aggregator' ORDER BY version_no`, [mappingId]);
    assert.deepEqual(priceVersions.map((row) => [row.id, row.status]), [
      [`price_v1_${suffix}`, 'active'],
      [importedPriceVersionId, 'rejected'],
    ]);
    const restoredPricing = await db.queryOne(`SELECT site_price_cny,active_site_price_version_id
      FROM ai_studio.model_pricing WHERE model_id=$1`, [modelId]);
    assert.equal(restoredPricing.site_price_cny, null);
    assert.equal(restoredPricing.active_site_price_version_id, null);

    await db.execute(`INSERT INTO ai_studio.provider_model_price_versions
      (id,provider_model_id,version_no,price_type,billing_unit,currency,price_config,applicability,
       source_url,source_observed_at,fetched_at,effective_at,expires_at,evidence_digest,status,manually_locked)
      VALUES ($1,$2,3,'manual','per_request','USD','{"base_cost":0.015}'::jsonb,'{}'::jsonb,
        'https://manual.example.test',now(),now(),now(),now()+interval '7 days','manual-fixture','active',TRUE)`,
    [`manual_locked_${suffix}`, mappingId]);
    const conflict = await previewPriceImport({ rows: [importRow], sourceFilename: 'locked.csv', actor: importActor });
    assert.equal(conflict.canApply, false);
    assert.ok(conflict.rows[0].conflicts.includes('MANUAL_PRICE_LOCKED'));

    creationId = `cost_fixture_${suffix}`;
    await db.execute(`INSERT INTO ai_studio.creations
      (id,user_id,studio_id,status,credit_cost,provider,model,created_at,updated_at)
      VALUES ($1,$2,'pricing-test','failed',0,'muapi',$3,now(),now())`, [creationId, userId, modelId]);
    const costRecordId = await insertProviderCostRecord({
      jobId: creationId, providerId: 'muapi', modelId,
      estimatedCostUsd: 0.01, actualCostUsd: null, costSource: 'estimate_only',
    });
    const cost = await db.queryOne(`SELECT estimated_cost_usd,actual_cost_usd,reconciliation_status
      FROM ai_studio.provider_cost_records WHERE id=$1`, [costRecordId]);
    assert.equal(Number(cost.estimated_cost_usd), 0.01);
    assert.equal(cost.actual_cost_usd, null);
    assert.equal(cost.reconciliation_status, 'pending_reconciliation');
    // The publication workflow accepts only capability-bound, settled test evidence.
    const publication=await import('../../lib/services/modelPublication.js');
    const publicationActor={id:userId,email:`${userId}@pricing.test`,role:'admin'};
    await assert.rejects(publication.publishModel({actor:{...publicationActor,role:'auditor'},modelId,policy:{sites:['main'],audience:'all',userIds:[]}}),{code:'FORBIDDEN'});
    await db.execute(`UPDATE ai_studio.provider_models SET capabilities=capabilities || $2::jsonb WHERE id=$1`,[mappingId,JSON.stringify({parameters:['resolution','num_images','watermark']})]);
    const publicationParameters={resolution:'1024x1024',num_images:1,watermark:false,task_type:'t2i'};
    const initialReport=await publication.inspectModelPublication({modelId,parameters:publicationParameters});
    const v2DirectoryResponse=await publicDirectoryRoute.GET(new NextRequest(new URL('/api/models/active?schemaVersion=2&nocache=1','http://127.0.0.1:3100')));
    const v2Directory=await v2DirectoryResponse.json();
    assert.equal(v2Directory.schemaVersion,2);
    const v2Model=v2Directory.models.find(model=>model.id===modelId);
    assert.ok(v2Model.capabilityVersion);
    const v2Parameters={...publicationParameters,prompt:'published contract fixture'};
    const v2QuoteResponse=await quoteRoute.POST(createRequest('/api/generation/quote',{modelId,parameters:v2Parameters,capabilityVersion:v2Model.capabilityVersion},`main_v2_quote_${suffix}`));
    assert.equal(v2QuoteResponse.status,201,JSON.stringify(await v2QuoteResponse.clone().json()));
    const v2Quote=await v2QuoteResponse.json();
    assert.equal(v2Quote.pricingBreakdown.capability.version,v2Model.capabilityVersion);
    const outdatedQuote=await quoteRoute.POST(createRequest('/api/generation/quote',{modelId,parameters:v2Parameters,capabilityVersion:'outdated'},`old_v2_quote_${suffix}`));
    assert.equal(outdatedQuote.status,409);
    const publicationGuard=await (await import('../../lib/services/models.js')).createModel({actor:publicationActor,model:{id:'never_created',isVisible:true}});
    assert.equal(publicationGuard.code,'MODEL_PUBLICATION_REQUIRED');
    assert.equal(initialReport.ready,false);
    assert.ok(initialReport.checks.some(check=>check.code==='VERIFIED_TEST' && !check.passed));
    await assert.rejects(publication.publishModel({actor:publicationActor,modelId,policy:{sites:['canvas'],audience:'all',userIds:[]}}),{code:'MODEL_PUBLICATION_BLOCKED'});
    const publicationQuote=await publication.quoteModelPublicationTest({actor:publicationActor,modelId,parameters:publicationParameters,idempotencyKey:`publication_quote_${suffix}`});
    await assert.rejects(publication.submitModelPublicationTest({actor:publicationActor,modelId,parameters:publicationParameters,prompt:'fixture publication',quoteId:publicationQuote.quoteId,maxCredits:0,idempotencyKey:`publication_task_${suffix}`}),{code:'TEST_BUDGET_REQUIRED'});
    const publicationTask=await publication.submitModelPublicationTest({actor:publicationActor,modelId,parameters:publicationParameters,prompt:'fixture publication',quoteId:publicationQuote.quoteId,maxCredits:publicationQuote.credits,idempotencyKey:`publication_task_${suffix}`});
    await assert.rejects(publication.recordModelPublicationTest({actor:publicationActor,modelId,creationId:publicationTask.creation.id,resultReviewed:true}),{code:'TEST_EVIDENCE_INCOMPLETE'});
    const publicationResult=await processGenerationTask({creationId:publicationTask.creation.id,testDependencies});
    assert.equal(publicationResult.success,true);
    await publication.recordModelPublicationTest({actor:publicationActor,modelId,creationId:publicationTask.creation.id,resultReviewed:true});
    const publicationPolicy={sites:['canvas'],audience:'allowlist',userIds:[userId]};
    const published=await publication.publishModel({actor:publicationActor,modelId,policy:publicationPolicy});
    assert.equal(published.canvasMounted,true);
    const canvasConfigRow=await db.queryOne("SELECT value_json FROM ops_bill.system_settings WHERE key='canvas_model_config'");
    assert.ok(canvasConfigRow.value_json.mountedModelIds.image.includes(modelId));
    const {assertPublicModelOrderable}=await import('../../lib/services/models.js');
    await assert.rejects(assertPublicModelOrderable(modelId,{userId,site:'main'}),{code:'MODEL_SCOPE_FORBIDDEN'});
    await assertPublicModelOrderable(modelId,{userId,site:'canvas'});
    await assert.rejects(assertPublicModelOrderable(modelId,{userId:'different-user',site:'canvas'}),{code:'MODEL_SCOPE_FORBIDDEN'});
    await db.execute("UPDATE ai_studio.ai_models SET capabilities=jsonb_set(capabilities,'{publicationPolicy}',$2::jsonb) WHERE id=$1",[modelId,JSON.stringify({...publicationPolicy,sites:['main','canvas']})]);
    const anonymousDirectory=await publicDirectoryRoute.GET(new NextRequest(new URL('/api/models/active?schemaVersion=2&nocache=1','http://127.0.0.1:3100')));
    assert.ok(!(await anonymousDirectory.json()).models.some(model=>model.id===modelId));
    const ownerDirectory=await publicDirectoryRoute.GET(new NextRequest(new URL('/api/models/active?schemaVersion=2','http://127.0.0.1:3100'),{headers:{Cookie:`ko_session=${session.token}`}}));
    assert.ok((await ownerDirectory.json()).models.some(model=>model.id===modelId),'a shared catalogue cache must still apply this user scope');
    const cachedAnonymous=await publicDirectoryRoute.GET(new NextRequest(new URL('/api/models/active?schemaVersion=2','http://127.0.0.1:3100')));
    assert.ok(!(await cachedAnonymous.json()).models.some(model=>model.id===modelId),'an allowed user response cannot populate another user catalogue');
    await db.execute("UPDATE ai_studio.ai_models SET capabilities=capabilities - 'publicationPolicy' WHERE id=$1",[modelId]);
    // Unknown submission outcomes must neither retry upstream nor release held credits.
    for (const accepted of [false,true]) {
      const key=`uncertain_${accepted}_${suffix}`;
      const uncertainQuote=await createGenerationQuote({userId,modelId,parameters:imageParameters,idempotencyKey:`${key}_quote`});
      const uncertainTask=await createGenerationTask({userId,modelId,prompt:'isolated ambiguous response',parameters:imageParameters,quoteId:uncertainQuote.quoteId,idempotencyKey:key});
      const beforeHeld=await db.queryOne('SELECT frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1',[userId]);
      let submissions=0;
      const uncertainDeps={getProviderAdapter:async()=>({
        async createTask(){submissions++;if(!accepted)throw Object.assign(new Error('network response lost'),{code:'NETWORK_ERROR'});return {providerRequestId:`accepted_${key}`};},
        async getTask(){throw Object.assign(new Error('status query denied'),{code:'AUTH_ERROR',providerStatus:401});},
        normalizeError:error=>error,
      })};
      const uncertain=await processGenerationTask({creationId:uncertainTask.creation.id,testDependencies:uncertainDeps});
      assert.equal(uncertain.reconciliationRequired,true);
      assert.equal(uncertain.creation.status,'processing');
      assert.equal(submissions,1);
      await processGenerationTask({creationId:uncertainTask.creation.id,testDependencies:uncertainDeps});
      assert.equal(submissions,1,'a processing retry cannot submit to another provider');
      assert.equal((await db.queryOne('SELECT status FROM ops_bill.credit_reservations WHERE id=$1',[uncertainTask.creation.reservation_id])).status,'RESERVED');
      assert.deepEqual(await db.queryOne('SELECT frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1',[userId]),beforeHeld);
      assert.equal(Number((await db.queryOne("SELECT count(*) AS count FROM ai_studio.generation_events WHERE creation_id=$1 AND event_type='TASK_RECONCILIATION_REQUIRED'",[uncertainTask.creation.id])).count),1);
    }
    // A quote is bound to the published capability contract: if the contract changed after the
    // quote was issued, the task must be re-quoted before the quote is consumed or credits are held.
    const liveDirectory = await (await publicDirectoryRoute.GET(new NextRequest(new URL('/api/models/active?schemaVersion=2&nocache=1','http://127.0.0.1:3100')))).json();
    const liveModel = liveDirectory.models.find((model) => model.id === modelId);
    assert.ok(liveModel?.capabilityVersion, 'the published model must expose a capability version');
    await grantPerpetualCredits(userId, 200, 'capability binding fixture', userId, `pricing_test_capability_grant_${suffix}`);
    const publishedCapability = { version: liveModel.capabilityVersion, schemaVersion: 2, schema: { type: 'object', additionalProperties: true } };
    const currentQuote = await createGenerationQuote({ userId, modelId, parameters: imageParameters,
      capabilitySnapshot: publishedCapability, idempotencyKey: `capability_current_quote_${suffix}` });
    const currentQuoteTask = await createGenerationTask({ userId, modelId, prompt: 'capability contract fixture',
      parameters: imageParameters, quoteId: currentQuote.quoteId, idempotencyKey: `capability_current_task_${suffix}` });
    assert.equal(currentQuoteTask.creation.status, 'queued');

    const staleQuote = await createGenerationQuote({ userId, modelId, parameters: imageParameters,
      capabilitySnapshot: publishedCapability, idempotencyKey: `capability_stale_quote_${suffix}` });
    await db.execute(`UPDATE ai_studio.ai_models SET capabilities = capabilities || '{"supported_ratios":["1:1"]}'::jsonb WHERE id=$1`, [modelId]);
    const changedDirectory = await (await publicDirectoryRoute.GET(new NextRequest(new URL('/api/models/active?schemaVersion=2&nocache=1','http://127.0.0.1:3100')))).json();
    const changedModel = changedDirectory.models.find((model) => model.id === modelId);
    assert.ok(changedModel?.capabilityVersion);
    assert.notEqual(changedModel.capabilityVersion, liveModel.capabilityVersion, 'publishing new capability specs must change the version');
    const walletBeforeStaleTask = await db.queryOne('SELECT perpetual_credits,frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [userId]);
    await assert.rejects(createGenerationTask({ userId, modelId, prompt: 'stale capability contract',
      parameters: imageParameters, quoteId: staleQuote.quoteId, idempotencyKey: `capability_stale_task_${suffix}` }), { code: 'QUOTE_CAPABILITY_MISMATCH' });
    assert.equal((await db.queryOne('SELECT consumed_at FROM ai_studio.generation_quotes WHERE id=$1', [staleQuote.quoteId])).consumed_at, null,
      'a rejected quote must stay reusable for diagnostics and must not be consumed');
    assert.equal(Number((await db.queryOne('SELECT count(*) AS count FROM ai_studio.creations WHERE user_id=$1 AND idempotency_key=$2',
      [userId, `capability_stale_task_${suffix}`])).count), 0, 'a stale quote must not create a task');
    const walletAfterStaleTask = await db.queryOne('SELECT perpetual_credits,frozen_credits FROM ops_bill.credit_wallets WHERE user_id=$1', [userId]);
    assert.deepEqual(walletAfterStaleTask, walletBeforeStaleTask, 'a stale quote must not freeze or charge credits');
    await db.execute(`UPDATE ai_studio.ai_models SET capabilities = capabilities - 'supported_ratios' WHERE id=$1`, [modelId]);
  } finally {
    await db.execute('DELETE FROM ai_studio.exchange_rate_snapshots WHERE id=$1', [`fx_test_${suffix}`]).catch(() => {});
    if (oldApiKey === undefined) delete process.env.MUAPI_API_KEY;
    else process.env.MUAPI_API_KEY = oldApiKey;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldPollInterval === undefined) delete process.env.PROVIDER_POLL_INTERVAL_MS;
    else process.env.PROVIDER_POLL_INTERVAL_MS = oldPollInterval;
    if (oldGenerationAsync === undefined) delete process.env.GENERATION_ASYNC;
    else process.env.GENERATION_ASYNC = oldGenerationAsync;
    if (oldPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = oldPublicAppUrl;
    if (oldCallbackSecret === undefined) delete process.env.GENERATION_CALLBACK_SECRET;
    else process.env.GENERATION_CALLBACK_SECRET = oldCallbackSecret;
    await db.execute(`DELETE FROM ai_studio.route_decision_logs WHERE job_id IN
      (SELECT id FROM ai_studio.creations WHERE user_id=$1)`, [userId]).catch(() => {});
    await db.execute('DELETE FROM ai_studio.model_publication_tests WHERE model_id=$1',[modelId]).catch(()=>{});
    if (creationId) await db.execute('DELETE FROM ai_studio.creations WHERE id=$1', [creationId]).catch(() => {});
    if (userId) await db.execute('DELETE FROM ai_studio.creations WHERE user_id=$1', [userId]).catch(() => {});
    if (videoModelId) await db.execute('DELETE FROM ai_studio.ai_models WHERE id=$1', [videoModelId]).catch(() => {});
    if (modelId) await db.execute('DELETE FROM ai_studio.ai_models WHERE id=$1', [modelId]).catch(() => {});
    if (importActor.id) await db.execute('DELETE FROM ai_studio.model_price_import_batches WHERE actor_id=$1 AND source_filename IN ($2,$3)',
      [importActor.id, 'fixture.csv', 'locked.csv']).catch(() => {});
    if (userId) {
      await db.execute('DELETE FROM ops_bill.credit_ledger_v2 WHERE user_id=$1', [userId]).catch(() => {});
      await db.execute('DELETE FROM ops_bill.credit_reservations WHERE user_id=$1', [userId]).catch(() => {});
      await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [userId]).catch(() => {});
      await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [userId]).catch(() => {});
    }
  }
});

test.after(async () => {
  if (db) await db.closePgPool();
});
