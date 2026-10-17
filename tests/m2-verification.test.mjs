import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/generation/quote/route.js';
import { dataClient } from '../lib/repositories/runtimeDb.js';
import { listActiveModels } from '../lib/services/models.js';
import { routeGenerationTask } from '../lib/services/smartRouter.js';
import { createSession } from '../lib/services/auth.js';
import { CREDIT_PRICING_POLICY } from '../lib/pricing/creditPolicy.js';
import { closePgPool } from '../lib/db/index.js';
import { resetRateLimitBucket } from '../lib/security/requestGuard.js';

test.after(async () => {
  await closePgPool().catch(() => {});
});

test('M2-1: Verify ops_bill.system_settings default image model preset is nano-banana', async () => {
  const client = dataClient();
  const setting = await client.readOne("SELECT value_json FROM ops_bill.system_settings WHERE key = 'model_presets'");
  assert.equal(setting?.value_json?.default_image_model, 'nano-banana');
});

test('M2-2: Verify RunningHub route pm_nano-banana_runninghub is enabled and selected under cost mode', async () => {
  const client = dataClient();
  const rhRoute = await client.readOne("SELECT * FROM ai_studio.provider_models WHERE id = 'pm_nano-banana_runninghub'");
  assert.equal(rhRoute.enabled, true);
  assert.equal(rhRoute.priority, 200);

  const volcRoute = await client.readOne("SELECT * FROM ai_studio.provider_models WHERE id = 'pm_nano-banana_volcengine'");
  assert.equal(volcRoute.enabled, true);
  assert.ok(volcRoute.priority >= 300, `volcRoute priority must be at least 300, got ${volcRoute.priority}`);

  const routingResult = await routeGenerationTask({
    modelId: 'nano-banana',
    parameters: { prompt: 'A sunny mountain peak' },
    routingMode: 'cost',
    persistDecision: false,
  });

  assert.equal(routingResult.selectedProviderId, 'runninghub', 'RunningHub must be selected as cheapest primary channel');
  assert.ok(routingResult.allCandidates.some(c => c.providerId === 'volcengine'), 'Volcengine must be available as failover');
});

test('M2-3: Verify direct provider endpoints are correctly populated in ai_studio.provider_models', async () => {
  const client = dataClient();
  const expectedEndpoints = {
    'pm_wan2_1_text_to_image_alibaba': '/services/aigc/text2image/image-synthesis',
    'pm_wan2_1_image_to_video_alibaba': '/services/aigc/video-generation/video-synthesis',
    'pm_kling_v2_6_pro_t2v_kling': '/v1/videos/text2video',
    'pm_minimax_hailuo_2_3_standard_t2v_minimax': '/v1/video_generation',
    'pm_veo_2_text_to_video_google': '/v1/projects/{project}/locations/{location}/publishers/google/models/veo-2.0-generate-001',
  };

  for (const [pmId, expectedEp] of Object.entries(expectedEndpoints)) {
    const row = await client.readOne('SELECT provider_endpoint, enabled FROM ai_studio.provider_models WHERE id = $1', [pmId]);
    assert.ok(row, `Mapping ${pmId} must exist`);
    assert.equal(row.enabled, true, `Mapping ${pmId} must be enabled`);
    assert.equal(row.provider_endpoint, expectedEp, `Mapping ${pmId} endpoint mismatch`);
  }
});

test('M2-4: Verify public selectable models via listActiveModels()', async () => {
  const activeModels = await listActiveModels();
  const readyModels = activeModels.filter(m => m.hasWorkingRoute);
  assert.ok(readyModels.length >= 14, `Expected at least 14 ready models, got ${readyModels.length}`);
  
  const readyIds = new Set(readyModels.map(m => m.id));
  assert.ok(readyIds.has('nano-banana'), 'nano-banana must be in ready models');
  assert.ok(readyIds.has('seedream-5.0'), 'seedream-5.0 must be in ready models');
  assert.ok(readyIds.has('minimax-music-3.0'), 'minimax-music-3.0 must be in ready models');
});

test('M2-5: Verify all 14 core models produce HTTP 201 with quoteId and gross margin >= 75% via POST /api/generation/quote', async () => {
  const client = dataClient();
  const u = await client.readOne('SELECT id FROM auth_usr.users LIMIT 1');
  await resetRateLimitBucket({ scope: 'generation_quote_user', subject: u.id });
  const session = await createSession(u.id);

  const coreModels = await client.readMany("SELECT id FROM ai_studio.ai_models WHERE tier = 'core' ORDER BY category, id");
  assert.ok(coreModels.length >= 14, `Expected at least 14 core models, got ${coreModels.length}`);

  for (const m of coreModels) {
    const req = new Request('http://localhost:3000/api/generation/quote', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'test_m2_verif_' + m.id + '_' + Date.now(),
        'cookie': `ko_session=${session.token}`,
      },
      body: JSON.stringify({
        modelId: m.id,
        parameters: { prompt: 'Validation prompt for milestone 2' },
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    assert.equal(res.status, 201, `Quote for ${m.id} failed with status ${res.status}: ${JSON.stringify(json)}`);
    assert.equal(json.success, true);
    assert.ok(json.quoteId, `Missing quoteId for ${m.id}`);
    assert.ok(json.credits > 0, `Credits must be > 0 for ${m.id}`);

    // Verify gross margin >= 75%
    const sitePriceCny = json.credits * CREDIT_PRICING_POLICY.cnyPerCredit;
    const estCostCny = json.pricingBreakdown?.estimatedProviderCostCny;
    assert.ok(estCostCny > 0, `Missing estimatedProviderCostCny in breakdown for ${m.id}`);

    const costWithReserve = estCostCny * (1 + CREDIT_PRICING_POLICY.providerCostReserveRate);
    const margin = (sitePriceCny - costWithReserve) / sitePriceCny;
    assert.ok(
      margin >= 0.749,
      `Model ${m.id} margin ${Math.round(margin * 1000) / 10}% is below 75% floor (retail: ¥${sitePriceCny}, cost: ¥${estCostCny})`
    );
  }
});
