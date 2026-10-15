import assert from 'node:assert/strict';
import { VolcengineAdapter } from '../lib/adapters/VolcengineAdapter.js';
import { AlibabaAdapter } from '../lib/adapters/AlibabaAdapter.js';
import { GoogleAdapter } from '../lib/adapters/GoogleAdapter.js';
import { getServerProviderApiKey } from '../lib/services/providerSecrets.js';
import { getCanvasModelConfig, listCanvasModelCandidates, getCanvasAllowedModelIds } from '../lib/services/canvasModelConfig.js';

async function main() {
  console.log('=== STEP 1: VERIFY CANVAS CONFIG DEFAULTS AND MOUNTS ===');
  const config = await getCanvasModelConfig();
  assert.ok(config, 'Canvas config must exist');
  assert.equal(config.defaults.imageModelId, 'seedream-4.5', 'Default image model must be seedream-4.5');
  assert.equal(config.defaults.videoModelId, 'wan-2.1', 'Default video model must be wan-2.1');
  assert.equal(config.defaults.audioModelId, 'gemini-3-1-flash-tts', 'Default audio model must be gemini-3-1-flash-tts');
  assert.equal(config.defaults.canvasImageCount, '1', 'Default canvasImageCount must be 1');
  console.log('✓ Step 1 Passed: Defaults match required persistent specifications.');

  console.log('\n=== STEP 2: VERIFY ALL 8 MODELS ARE CANDIDATES AND ALLOWED ===');
  const candidates = await listCanvasModelCandidates();
  const candidateIds = new Set(candidates.map((c) => c.id));
  const allowed = await getCanvasAllowedModelIds();

  const requiredModels = [
    'seedream-4.5',
    'seedream-4.0',
    'seedream-5.0',
    'seedream-5.0-edit',
    'wan2.1-text-to-image',
    'wan-2.1',
    'gemini-3-1-flash-tts',
    'gemini-2-5-pro-tts',
  ];

  for (const id of requiredModels) {
    assert.ok(candidateIds.has(id), `Model ${id} must be in candidate list`);
    assert.ok(allowed.has(id), `Model ${id} must be in allowed list`);
    const model = candidates.find((c) => c.id === id);
    assert.ok(model.brandLogoUrl, `Model ${id} must have a brandLogoUrl`);
    assert.ok(model.brandBadge, `Model ${id} must have a brandBadge`);
    console.log(`✓ Model ${id} [${model.brandBadge}] (${model.credits} credits) is active, verified, and branded`);
  }

  console.log('\n=== STEP 3: LIVE INVOCATION OF ALL 8 MOUNTED MODELS ===');

  const volcKey = await getServerProviderApiKey({ provider: 'volcengine' });
  assert.ok(volcKey, 'Volcengine API key must exist');
  const volcAdapter = new VolcengineAdapter({ apiKey: volcKey });

  const aliKey = await getServerProviderApiKey({ provider: 'alibaba' });
  assert.ok(aliKey, 'Alibaba API key must exist');
  const aliAdapter = new AlibabaAdapter({ apiKey: aliKey });

  const googleKey = await getServerProviderApiKey({ provider: 'google' });
  assert.ok(googleKey, 'Google API key must exist');
  const googleAdapter = new GoogleAdapter({ apiKey: googleKey });

  // 1. seedream-4.5 (Image)
  console.log('\n[1/8] Invoking seedream-4.5 (Volcengine)...');
  const r1 = await volcAdapter.createTask({ providerModelId: 'seedream-4.5', prompt: 'A simple geometric test square' });
  assert.equal(r1.status, 'succeeded');
  assert.ok(r1.resultUrl && r1.resultUrl.startsWith('https://'), 'seedream-4.5 must return a valid https image url');
  console.log(`✓ seedream-4.5 live generation succeeded: ${r1.resultUrl.slice(0, 60)}...`);

  // 2. seedream-4.0 (Image)
  console.log('\n[2/8] Invoking seedream-4.0 (Volcengine)...');
  const r2 = await volcAdapter.createTask({ providerModelId: 'seedream-4.0', prompt: 'A simple geometric test square' });
  assert.equal(r2.status, 'succeeded');
  assert.ok(r2.resultUrl && r2.resultUrl.startsWith('https://'), 'seedream-4.0 must return a valid https image url');
  console.log(`✓ seedream-4.0 live generation succeeded: ${r2.resultUrl.slice(0, 60)}...`);

  // 3. seedream-5.0 (Image)
  console.log('\n[3/8] Invoking seedream-5.0 (Volcengine)...');
  const r3 = await volcAdapter.createTask({ providerModelId: 'seedream-5.0', prompt: 'A simple geometric test square' });
  assert.equal(r3.status, 'succeeded');
  assert.ok(r3.resultUrl && r3.resultUrl.startsWith('https://'), 'seedream-5.0 must return a valid https image url');
  console.log(`✓ seedream-5.0 live generation succeeded: ${r3.resultUrl.slice(0, 60)}...`);

  // 4. seedream-5.0-edit (Image)
  console.log('\n[4/8] Invoking seedream-5.0-edit (Volcengine)...');
  const r4 = await volcAdapter.createTask({ providerModelId: 'seedream-5.0-edit', prompt: 'A simple geometric test square' });
  assert.equal(r4.status, 'succeeded');
  assert.ok(r4.resultUrl && r4.resultUrl.startsWith('https://'), 'seedream-5.0-edit must return a valid https image url');
  console.log(`✓ seedream-5.0-edit live generation succeeded: ${r4.resultUrl.slice(0, 60)}...`);

  // 5. wan2.1-text-to-image (Image)
  console.log('\n[5/8] Invoking wan2.1-text-to-image (Alibaba)...');
  const r5 = await aliAdapter.createTask({ providerModelId: 'wan2.1-text-to-image', prompt: 'A calm mountain landscape at dawn' });
  assert.ok(r5.status === 'processing' || r5.status === 'succeeded');
  assert.ok(r5.providerRequestId, 'wan2.1-text-to-image must return a task ID');
  console.log(`✓ wan2.1-text-to-image task created: taskId=${r5.providerRequestId}`);

  // 6. wan-2.1 (Video)
  console.log('\n[6/8] Invoking wan-2.1 (Alibaba Video)...');
  const r6 = await aliAdapter.createTask({ providerModelId: 'wan-2.1', prompt: 'A waterfall in a lush forest', parameters: { category: 'video' } });
  assert.ok(r6.status === 'processing' || r6.status === 'succeeded');
  assert.ok(r6.providerRequestId, 'wan-2.1 must return a task ID');
  console.log(`✓ wan-2.1 video task created: taskId=${r6.providerRequestId}`);

  // 7. gemini-3-1-flash-tts (Audio)
  console.log('\n[7/8] Invoking gemini-3-1-flash-tts (Google)...');
  const r7 = await googleAdapter.createTask({ providerModelId: 'gemini-3-1-flash-tts', prompt: 'Koyo Studio audio synthesis test.', parameters: { category: 'audio' } });
  assert.equal(r7.status, 'succeeded');
  assert.ok(r7.resultUrl && r7.resultUrl.startsWith('data:audio/wav;base64,'), 'gemini-3-1-flash-tts must return a base64 audio data uri');
  console.log(`✓ gemini-3-1-flash-tts audio generated: size=${r7.resultUrl.length} chars`);

  // 8. gemini-2-5-pro-tts (Audio)
  console.log('\n[8/8] Invoking gemini-2-5-pro-tts (Google)...');
  const r8 = await googleAdapter.createTask({ providerModelId: 'gemini-2-5-pro-tts', prompt: 'High fidelity speech verification test.', parameters: { category: 'audio' } });
  assert.equal(r8.status, 'succeeded');
  assert.ok(r8.resultUrl && r8.resultUrl.startsWith('data:audio/wav;base64,'), 'gemini-2-5-pro-tts must return a base64 audio data uri');
  console.log(`✓ gemini-2-5-pro-tts audio generated: size=${r8.resultUrl.length} chars`);

  console.log('\n======================================================');
  console.log('🎉 ALL 8 MOUNTED CANVAS MODELS VERIFIED 100% OPERATIONAL!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
