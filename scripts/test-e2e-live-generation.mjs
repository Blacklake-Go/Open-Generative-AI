import 'server-only';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createSession } from '../lib/services/auth.js';
import { getCreditWallet } from '../lib/financial/creditService.js';
import { findCreationById } from '../lib/repositories/creations.js';
import { pollGenerationTask } from '../lib/services/generationCore.js';
import { queryOne } from '../lib/db/index.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyImageBytes(url) {
  const absoluteUrl = url.startsWith('http') ? url : `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  const res = await fetch(absoluteUrl);
  if (!res.ok) throw new Error(`Failed to fetch generated image: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 100) throw new Error(`Generated image too small: ${bytes.length} bytes`);

  // Detect image signature
  const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
                 bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // WEBP
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  const format = isWebp ? 'WEBP' : (isPng ? 'PNG' : (isJpeg ? 'JPEG' : 'UNKNOWN'));
  return { format, sizeBytes: bytes.length };
}

async function runModelJourney({ testUserId, sessionToken, modelId, prompt, label }) {
  console.log(`\n======================================================`);
  console.log(`🚀 [E2E] Testing Model Flow: ${label} (${modelId})`);
  console.log(`======================================================`);

  // Step 1: Record initial wallet balance
  const walletBefore = await getCreditWallet(testUserId);
  console.log(`[1. Wallet Balance Before] Available: ${walletBefore.totalAvailable}, Frozen: ${walletBefore.frozenCredits}`);
  assert.ok(walletBefore.totalAvailable > 30, 'User wallet must have enough credits to generate');

  // Step 2: Request anti-tamper quote via HTTP POST /api/generation/quote
  console.log(`[2. HTTP Quote Request] POST ${BASE_URL}/api/generation/quote`);
  const quoteIdempotencyKey = `quote_key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const quoteRes = await fetch(`${BASE_URL}/api/generation/quote`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': `ko_session=${sessionToken}`,
      'idempotency-key': quoteIdempotencyKey,
    },
    body: JSON.stringify({
      model: modelId,
      parameters: {
        prompt,
        aspect_ratio: '1:1',
      },
    }),
  });

  const quoteJson = await quoteRes.json();
  console.log(`[2. HTTP Quote Response] status: ${quoteRes.status}, quoteId: ${quoteJson.quoteId}, credits: ${quoteJson.credits}`);
  assert.ok([200, 201].includes(quoteRes.status), `Quote request failed: ${JSON.stringify(quoteJson)}`);
  assert.ok(quoteJson.quoteId, 'Quote response must contain quoteId');
  assert.ok(quoteJson.credits > 0, 'Quote response must have positive credits');

  const quoteId = quoteJson.quoteId;
  const quotedCredits = quoteJson.credits;

  // Step 3: Create Generation Task via HTTP POST /api/generations
  console.log(`[3. HTTP Task Creation] POST ${BASE_URL}/api/generations`);
  const taskIdempotencyKey = `task_key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const taskRes = await fetch(`${BASE_URL}/api/generations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': `ko_session=${sessionToken}`,
      'idempotency-key': taskIdempotencyKey,
    },
    body: JSON.stringify({
      quoteId,
      model: modelId,
      prompt,
      parameters: {
        aspect_ratio: '1:1',
      },
    }),
  });

  const taskJson = await taskRes.json();
  console.log(`[3. HTTP Task Response] status: ${taskRes.status}, creationId: ${taskJson.creation?.id || taskJson.creation_id}, task status: ${taskJson.status || taskJson.creation?.status}`);
  assert.ok([200, 201, 202].includes(taskRes.status), `Task creation failed: ${JSON.stringify(taskJson)}`);

  const creationId = taskJson.creation?.id || taskJson.creation_id;
  assert.ok(creationId, 'Must receive creationId');

  // Step 4: Verify Database Reservation & State
  const creationRow = await findCreationById(creationId);
  console.log(`[4. DB State Check] id: ${creationRow.id}, status: ${creationRow.status}, provider: ${creationRow.provider}, model: ${creationRow.model}, reservation_id: ${creationRow.reservation_id}`);
  assert.ok(creationRow, 'Creation record must exist in database');

  // Step 5: Wait/Poll for Completion
  console.log(`[5. Polling Task] Waiting for generation completion...`);
  let pollAttempts = 0;
  let finalStatus = creationRow.status;
  let finalResultUrl = taskJson.result_url || creationRow.result_url;

  while (['queued', 'processing'].includes(finalStatus) && pollAttempts < 60) {
    pollAttempts += 1;
    await sleep(2000);

    // Run poll tick (emulates background worker polling)
    try {
      const pollTick = await pollGenerationTask({
        creationId,
        testDependencies: { claimDuePollingCreation: async (id) => findCreationById(id) },
      });
      if (pollTick.creation) {
        finalStatus = pollTick.creation.status;
        if (pollTick.creation.result_url || pollTick.creation.storageUrl) {
          finalResultUrl = pollTick.creation.result_url || pollTick.creation.storageUrl;
        }
      }
    } catch (e) {
      console.warn(`[Poll tick error]`, e.message);
    }

    // Query via user API: GET /api/generations?id=...
    const traceRes = await fetch(`${BASE_URL}/api/generations?id=${creationId}`, {
      headers: {
        'cookie': `ko_session=${sessionToken}`,
      },
    });
    if (traceRes.ok) {
      const traceJson = await traceRes.json();
      finalStatus = traceJson.creation?.status || finalStatus;
      if (traceJson.creation?.result_url || traceJson.creation?.storageUrl) {
        finalResultUrl = traceJson.creation.result_url || traceJson.creation.storageUrl;
      }
      console.log(`   Attempt ${pollAttempts}: status = ${finalStatus}`);
    }
  }

  assert.equal(finalStatus, 'succeeded', `Generation task failed to succeed, ended with: ${finalStatus}`);
  console.log(`[5. Succeeded!] Task completed successfully in attempt ${pollAttempts}.`);

  // Step 6: Verify Image Asset Availability & Integrity
  console.log(`[6. Image Asset Verification] Verifying output file from storage...`);
  const finalRecord = await findCreationById(creationId);
  assert.ok(finalRecord.result_object_key, 'Must have result_object_key in S3/storage');
  console.log(`   Storage Object Key: ${finalRecord.result_object_key}`);

  if (!finalResultUrl) {
    const { exposeCreationResult } = await import('../lib/services/generations.js');
    const exposed = await exposeCreationResult(finalRecord);
    finalResultUrl = exposed.result_url || exposed.storageUrl;
  }
  assert.ok(finalResultUrl, 'Must have accessible finalResultUrl');
  console.log(`   Fetching URL: ${finalResultUrl.slice(0, 80)}...`);
  const imgVerification = await verifyImageBytes(finalResultUrl);
  console.log(`   Image format: ${imgVerification.format}, size: ${imgVerification.sizeBytes} bytes`);
  assert.notEqual(imgVerification.format, 'UNKNOWN', 'Image header must be valid WEBP, PNG or JPEG');
  assert.ok(imgVerification.sizeBytes > 1000, 'Image bytes must be substantial (>1KB)');

  // Step 7: Verify Two-Phase Financial Ledger Settlement
  console.log(`[7. Financial Ledger Check] Verifying final wallet settlement...`);
  const walletAfter = await getCreditWallet(testUserId);
  console.log(`   Wallet After: Available: ${walletAfter.totalAvailable}, Frozen: ${walletAfter.frozenCredits}`);
  assert.equal(walletAfter.frozenCredits, 0, 'Frozen credits must be 0 after completion');
  const deducted = walletBefore.totalAvailable - walletAfter.totalAvailable;
  console.log(`   Deducted credits: ${deducted} (quoted was ${quotedCredits})`);
  assert.equal(deducted, quotedCredits, 'Wallet deducted amount must match quoted credits');

  console.log(`✅ [E2E] Model Flow PASSED: ${label} (${modelId})\n`);
  return { creationId, modelId, finalRecord, imgVerification, deducted };
}

async function main() {
  console.log('======================================================');
  console.log('🎯 KOYO Studio E2E Live Image Generation Test Suite');
  console.log('======================================================');

  // Refresh provider readiness so health checks are fresh
  const { probeProviderChannel } = await import('../lib/services/healthProbe.js');
  for (const p of ['runninghub', 'volcengine', 'muapi', 'google']) {
    try { await probeProviderChannel(p); } catch {}
  }

  // Verify server connectivity
  const healthCheck = await fetch(`${BASE_URL}/api/models/active?refresh=true`);
  if (!healthCheck.ok) {
    throw new Error(`Server at ${BASE_URL} not healthy: HTTP ${healthCheck.status}`);
  }
  const resJson = await healthCheck.json();
  const activeModels = Array.isArray(resJson) ? resJson : resJson.models || [];
  console.log(`Active server models available: ${activeModels.length}`);
  const activeIds = new Set(activeModels.map(m => m.id));
  assert.ok(activeIds.has('imagen-4'), 'Active catalog must include imagen-4');
  assert.ok(activeIds.has('seedream-5.0'), 'Active catalog must include seedream-5.0');

  // Select test user and generate session
  const adminRow = await queryOne('SELECT id, email FROM auth_usr.users WHERE email = $1', ['admin@koyosim.com']);
  const testUserId = adminRow?.id || '855934';
  console.log(`Using Test User ID: ${testUserId} (${adminRow?.email})`);

  const session = await createSession(testUserId);
  const sessionToken = session.token;
  assert.ok(sessionToken, 'Must generate valid session token');

  // Test 1: Google Imagen 4 (using client identifier google-imagen4-ultra)
  const imagenResult = await runModelJourney({
    testUserId,
    sessionToken,
    modelId: 'google-imagen4-ultra',
    prompt: 'A cyberpunk street neon reflections rain hyper-detailed 8k',
    label: 'Google Imagen 4 (Aliased & Failover Route)',
  });

  // Test 2: Bytedance Seedream (using client identifier seedream-4.5)
  const seedreamResult = await runModelJourney({
    testUserId,
    sessionToken,
    modelId: 'seedream-4.5',
    prompt: 'A serene mountain lake at sunrise, watercolor aesthetic',
    label: 'ByteDance Seedream 4.5 / 5.0 (Volcengine Route)',
  });

  console.log('======================================================');
  console.log('🎉 ALL E2E GENERATION FLOWS TESTED & PASSED 100%!');
  console.log('======================================================');
  console.log('Summary:');
  console.log(`1. Google Imagen 4 Task: ${imagenResult.creationId} -> Provider: ${imagenResult.finalRecord.provider} -> ${imagenResult.imgVerification.format} (${imagenResult.imgVerification.sizeBytes} B) -> Deducted: ${imagenResult.deducted} credits`);
  console.log(`2. ByteDance Seedream Task: ${seedreamResult.creationId} -> Provider: ${seedreamResult.finalRecord.provider} -> ${seedreamResult.imgVerification.format} (${seedreamResult.imgVerification.sizeBytes} B) -> Deducted: ${seedreamResult.deducted} credits`);

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
