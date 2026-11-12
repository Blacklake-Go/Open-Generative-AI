import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { requireIsolatedTestDatabase } from '../../scripts/test-database-guard.mjs';

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  const parsed = requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL);
  // This suite is only for the disposable database created by run-isolated-pg-tests.mjs.
  assert.match(parsed.pathname, /^\/p7_test_it_[a-f0-9]{12}$/);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '5432');
  process.env.DATABASE_URL = testUrl;
}
const db = testUrl ? await import('../../lib/db/index.js') : null;
const options = { skip: !testUrl, timeout: 30_000 };

test.after(async () => {
  if (db) await db.closePgPool();
});

test('quotes and orderability stay bound to the published capability contract', options, async () => {
  const { allocateUserId } = await import('../../lib/auth/user-id.js');
  const authRepo = await import('../../lib/repositories/auth.js');
  const authService = await import('../../lib/services/auth.js');
  const { listActiveModels, assertPublicModelOrderable } = await import('../../lib/services/models.js');
  const { publicCanvasModel } = await import('../../lib/canvas/modelDescriptor.js');
  const { createGenerationQuote, verifyAndConsumeQuote } = await import('../../lib/services/pricingEngine.js');
  const { setModelRoutingPolicy } = await import('../../lib/services/modelPricingControl.js');
  const quoteRoute = await import('../../app/api/generation/quote/route.js');

  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  const modelId = `capability_test_${suffix}`;
  const modelSlug = modelId.slice(0, 64);
  const mappingId = `mapping_${suffix}`;
  const providerModelId = `model_${suffix}`;
  const identifier = `cap_quote_${suffix}`;
  const oldApiKey = process.env.MUAPI_API_KEY;
  const oldPublicAppUrl = process.env.PUBLIC_APP_URL;
  let userId = null;

  try {
    await db.execute(`INSERT INTO ai_studio.exchange_rate_snapshots
      (id,base_currency,quote_currency,rate,source_type,observed_at,expires_at,created_by)
      VALUES ($1,'USD','CNY',7.2,'manual',now(),now()+interval '1 day','test-fixture')`, [`fx_${suffix}`]);
    userId = await allocateUserId({
      reserve: (candidate, digits) => authRepo.reserveUserId(candidate, digits),
      findFirstAvailable: (digits) => authRepo.findFirstAvailableUserId(digits),
      isExhausted: (digits) => authRepo.isUserIdPoolExhausted(digits),
    });
    await db.execute(`INSERT INTO auth_usr.users
      (id,email,password_hash,password_salt,role,credits,status)
      VALUES ($1,$2,'test-hash','test-salt','user',0,'active')`, [userId, `${userId}@capability.test`]);
    await db.execute(`INSERT INTO ai_studio.ai_models
      (id,slug,name,display_name,category,status,tier,is_visible,auto_route_eligible,
       capabilities,supported_resolutions,supported_input_types,supported_output_types)
      VALUES ($1,$2,'Capability binding fixture','Capability binding fixture','image','active','core',TRUE,TRUE,
        $3::jsonb,'["1024x1024"]'::jsonb,'["text"]'::jsonb,'["image"]'::jsonb)`,
    [modelId, modelSlug, JSON.stringify({
      input_schema: {
        type: 'object',
        properties: { prompt: { type: 'string', maxLength: 120 } },
        required: ['prompt'],
        additionalProperties: false,
      },
    })]);
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
        $4::jsonb,'approved',
        '/api/v1/test-image','["t2i"]'::jsonb,'["1024x1024"]'::jsonb,'[]'::jsonb,
        '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,1)`,
    [mappingId, modelId, providerModelId, JSON.stringify({
      input_types: ['text'],
      output_types: ['image'],
      parameters: ['resolution', 'num_images', 'watermark'],
    })]);
    await db.execute(`INSERT INTO ai_studio.provider_model_price_versions
      (id,provider_model_id,version_no,price_type,billing_unit,currency,price_config,applicability,
       source_url,source_observed_at,fetched_at,effective_at,expires_at,evidence_digest,status,approved_by,approved_at)
      VALUES ($1,$2,1,'aggregator','per_request','USD','{"base_cost":0.01,"currency":"USD"}'::jsonb,
        '{}'::jsonb,'https://muapi.ai/docs/pricing',now(),now(),now(),now()+interval '7 days',
        'fixture-evidence','active','test-fixture',now())`, [`price_v1_${suffix}`, mappingId]);
    await setModelRoutingPolicy({ modelId, routingMode: 'stability' });
    process.env.MUAPI_API_KEY = 'not-a-real-provider-key-for-local-tests';

    // 1. The published V2 descriptor is derived from the reviewed route, not client input.
    const models = await listActiveModels();
    const listed = models.find((row) => row.id === modelId);
    assert.ok(listed, 'fixture model must be exposed by the public catalogue');
    assert.equal(listed.hasWorkingRoute, true);
    const descriptor = publicCanvasModel(listed, { schemaVersion: 2 });
    assert.equal(descriptor.capability, 'image');
    assert.equal(descriptor.available, true);
    assert.match(descriptor.capabilityVersion, /^[a-f0-9]{64}$/);
    assert.deepEqual(descriptor.inputSchema.properties.resolution.enum, ['1024x1024']);
    assert.equal(descriptor.inputSchema.properties.num_images.const, 1);
    assert.deepEqual(descriptor.inputSchema.required, ['prompt']);
    assert.equal(descriptor.inputSchema.additionalProperties, false);
    const capabilitySnapshot = {
      version: descriptor.capabilityVersion,
      schemaVersion: 2,
      schema: descriptor.inputSchema,
    };

    const parameters = {
      prompt: 'capability binding fixture',
      task_type: 't2i',
      resolution: '1024x1024',
      num_images: 1,
      watermark: false,
    };

    // 2. Snapshot binding never changes the price the server already computes.
    const legacyQuote = await createGenerationQuote({
      userId, modelId, parameters, idempotencyKey: `${identifier}_legacy`,
    });
    const boundQuote = await createGenerationQuote({
      userId, modelId, parameters, capabilitySnapshot, idempotencyKey: `${identifier}_bound`,
    });
    assert.equal(boundQuote.credits, legacyQuote.credits);
    assert.equal(boundQuote.pricingBreakdown.capability.version, capabilitySnapshot.version);
    const storedQuote = await db.queryOne(
      'SELECT pricing_breakdown_json,request_hash FROM ai_studio.generation_quotes WHERE id=$1',
      [boundQuote.quoteId],
    );
    const storedBreakdown = typeof storedQuote.pricing_breakdown_json === 'string'
      ? JSON.parse(storedQuote.pricing_breakdown_json)
      : storedQuote.pricing_breakdown_json;
    assert.equal(storedBreakdown.capability.version, capabilitySnapshot.version);
    assert.equal(storedBreakdown.capability.schemaVersion, 2);

    // 3. Replaying the same key and contract is idempotent; a different contract conflicts.
    const replayed = await createGenerationQuote({
      userId, modelId, parameters, capabilitySnapshot, idempotencyKey: `${identifier}_bound`,
    });
    assert.equal(replayed.quoteId, boundQuote.quoteId);
    assert.equal(replayed.idempotent, true);
    await assert.rejects(
      createGenerationQuote({
        userId, modelId, parameters,
        capabilitySnapshot: { ...capabilitySnapshot, version: 'outdated_capability' },
        idempotencyKey: `${identifier}_bound`,
      }),
      { code: 'QUOTE_IDEMPOTENCY_CONFLICT' },
    );

    // 4. Rejected and invalid parameter drift never consumes the quote.
    await assert.rejects(
      verifyAndConsumeQuote({
        quoteId: boundQuote.quoteId, userId, modelId, parameters,
        expectedCapabilityVersion: 'outdated_capability',
      }),
      { code: 'QUOTE_CAPABILITY_MISMATCH' },
    );
    await assert.rejects(
      verifyAndConsumeQuote({
        quoteId: boundQuote.quoteId, userId, modelId, parameters,
        currentCapabilityVersion: 'republished_capability',
      }),
      { code: 'QUOTE_CAPABILITY_MISMATCH' },
    );
    await assert.rejects(
      verifyAndConsumeQuote({
        quoteId: boundQuote.quoteId, userId, modelId,
        parameters: { ...parameters, num_images: 2 },
      }),
      { code: 'QUOTE_PARAMETERS_MISMATCH' },
    );
    assert.equal((await db.queryOne(
      'SELECT consumed_at FROM ai_studio.generation_quotes WHERE id=$1', [boundQuote.quoteId],
    )).consumed_at, null);

    await assert.rejects(
      createGenerationQuote({
        userId, modelId, capabilitySnapshot,
        parameters: { ...parameters, resolution: '2048x2048' },
        idempotencyKey: `${identifier}_bad_resolution`,
      }),
      { code: 'MODEL_PARAMETERS_INVALID' },
    );
    await assert.rejects(
      createGenerationQuote({
        userId, modelId, capabilitySnapshot,
        parameters: { ...parameters, prompt: undefined },
        idempotencyKey: `${identifier}_missing_prompt`,
      }),
      { code: 'MODEL_PARAMETERS_INVALID' },
    );

    // 5. The matching contract consumes exactly once.
    const consumed = await verifyAndConsumeQuote({
      quoteId: boundQuote.quoteId, userId, modelId, parameters,
      expectedCapabilityVersion: capabilitySnapshot.version,
      currentCapabilityVersion: capabilitySnapshot.version,
    });
    assert.equal(consumed.is_consumed, true);
    await assert.rejects(
      verifyAndConsumeQuote({ quoteId: boundQuote.quoteId, userId, modelId, parameters }),
      { code: 'QUOTE_ALREADY_CONSUMED' },
    );

    // 6. The HTTP route exposes the same contract, refusal codes and statuses.
    process.env.PUBLIC_APP_URL = 'http://127.0.0.1:3100';
    const session = await authService.createSession(userId);
    const createRequest = (body, idempotencyKey) => new NextRequest(
      new URL('/api/generation/quote', 'http://127.0.0.1:3100'),
      {
        method: 'POST',
        headers: new Headers({
          Origin: 'http://127.0.0.1:3100',
          Cookie: `ko_session=${session.token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        }),
        body: JSON.stringify(body),
      },
    );
    const matchingResponse = await quoteRoute.POST(createRequest({
      modelId, parameters, capabilityVersion: descriptor.capabilityVersion,
    }, `${identifier}_route_ok`));
    assert.equal(matchingResponse.status, 201, JSON.stringify(await matchingResponse.clone().json()));
    const matchingBody = await matchingResponse.json();
    assert.equal(matchingBody.pricingBreakdown.capability.version, descriptor.capabilityVersion);

    const outdatedResponse = await quoteRoute.POST(createRequest({
      modelId, parameters, capabilityVersion: 'outdated_capability',
    }, `${identifier}_route_outdated`));
    assert.equal(outdatedResponse.status, 409);
    assert.equal((await outdatedResponse.json()).code, 'MODEL_CAPABILITY_CHANGED');

    const unknownResponse = await quoteRoute.POST(createRequest({
      modelId: `missing_${suffix}`, parameters, capabilityVersion: descriptor.capabilityVersion,
    }, `${identifier}_route_missing`));
    assert.equal(unknownResponse.status, 404);
    assert.equal((await unknownResponse.json()).code, 'MODEL_NOT_AVAILABLE');

    // 7. Availability explains why a mounted model cannot be ordered or executed.
    await db.execute('UPDATE ai_studio.provider_models SET enabled=FALSE WHERE id=$1', [mappingId]);
    await assert.rejects(assertPublicModelOrderable(modelId), (error) => {
      assert.equal(error.code, 'MODEL_NOT_PUBLICLY_AVAILABLE');
      assert.ok(error.reasonCodes.includes('NO_VERIFIED_ROUTE'), `reasonCodes=${error.reasonCodes}`);
      return true;
    });
    await db.execute('UPDATE ai_studio.provider_models SET enabled=TRUE WHERE id=$1', [mappingId]);

    // 8. Site publication scope is enforced by the same orderability service.
    await db.execute(`UPDATE ai_studio.ai_models SET capabilities=capabilities || $2::jsonb WHERE id=$1`,
      [modelId, JSON.stringify({ publicationPolicy: { sites: ['canvas'], audience: 'all', userIds: [] } })]);
    await assert.rejects(assertPublicModelOrderable(modelId), { code: 'MODEL_SCOPE_FORBIDDEN' });
    const canvasOnly = await assertPublicModelOrderable(modelId, { site: 'canvas' });
    assert.equal(canvasOnly.id, modelId);
    await assert.rejects(
      createGenerationQuote({ userId, modelId, parameters, idempotencyKey: `${identifier}_main_scope` }),
      { code: 'MODEL_SCOPE_FORBIDDEN' },
    );
    const canvasQuote = await createGenerationQuote({
      userId, modelId, parameters, site: 'canvas', idempotencyKey: `${identifier}_canvas_scope`,
    });
    assert.ok(canvasQuote.quoteId);
    await db.execute(`UPDATE ai_studio.ai_models SET capabilities=capabilities #- '{publicationPolicy}' WHERE id=$1`, [modelId]);
  } finally {
    if (oldApiKey === undefined) delete process.env.MUAPI_API_KEY;
    else process.env.MUAPI_API_KEY = oldApiKey;
    if (oldPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = oldPublicAppUrl;
    if (userId) {
      await db.execute('DELETE FROM ai_studio.generation_quotes WHERE user_id=$1', [userId]);
      await db.execute('DELETE FROM ai_studio.routing_policies WHERE model_id=$1', [modelId]);
      await db.execute(`DELETE FROM ai_studio.provider_model_price_versions
        WHERE provider_model_id IN (SELECT id FROM ai_studio.provider_models WHERE model_id=$1)`, [modelId]);
      await db.execute('DELETE FROM ai_studio.provider_models WHERE model_id=$1', [modelId]);
      await db.execute('DELETE FROM ai_studio.model_pricing WHERE model_id=$1', [modelId]);
      await db.execute('DELETE FROM ai_studio.ai_models WHERE id=$1', [modelId]);
      await db.execute('DELETE FROM auth_usr.users WHERE id=$1', [userId]);
      await db.execute('DELETE FROM auth_usr.user_id_allocations WHERE user_id=$1', [userId]);
    }
    await db.execute('DELETE FROM ai_studio.exchange_rate_snapshots WHERE id=$1', [`fx_${suffix}`]);
  }
});
