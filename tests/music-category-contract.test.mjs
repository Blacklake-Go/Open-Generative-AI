import assert from 'node:assert/strict';
import test from 'node:test';

import { CAPABILITY_AUTO_ALIASES, resolveAutoCapabilityAlias } from '../lib/repositories/models.js';
import { modelModality, normalizeGenerationTaskType } from '../lib/modelCenter/capabilitySchema.js';
import { projectReadyRouteCapabilities } from '../lib/modelCenter/publicCapabilities.js';
import { evaluateRouteCandidates } from '../lib/modelCenter/routePricing.js';
import { projectCanvasConfig, validateCanvasModelConfig } from '../lib/services/canvasModelConfig.js';

const canvasDefaults = (overrides = {}) => ({
  imageModelId: '', videoModelId: '', textModelId: '', audioModelId: '', musicModelId: '',
  canvasImageCount: '1', audioVoice: 'alloy', audioFormat: 'mp3',
  audioSpeed: '1', audioInstructions: '', systemPrompt: '',
  ...overrides,
});

test('auto alias inference routes lyrics and music-style requests to the music capability', () => {
  assert.equal(resolveAutoCapabilityAlias('auto', { lyrics: 'la la' }), 'auto-music');
  assert.equal(resolveAutoCapabilityAlias('auto', { music_style: 'city pop' }), 'auto-music');
  assert.equal(resolveAutoCapabilityAlias('auto', {}, 'music'), 'auto-music');
  assert.equal(resolveAutoCapabilityAlias('auto', {}, 't2m'), 'auto-music');
  assert.equal(resolveAutoCapabilityAlias('auto', {}, 'audio'), 'auto-audio');
  assert.equal(resolveAutoCapabilityAlias('auto', {}, 'video'), 'auto-video');
  assert.equal(resolveAutoCapabilityAlias('auto', {}), 'auto-image');
  assert.equal(resolveAutoCapabilityAlias(' Auto-Music '), 'auto-music');

  for (const key of ['music', 't2m', 'text_to_music', 'auto-music']) {
    assert.deepEqual(CAPABILITY_AUTO_ALIASES[key], { category: 'music', defaultModelId: 'suno-create-music' }, key);
  }
  assert.equal(CAPABILITY_AUTO_ALIASES.t2a.category, 'audio');
  assert.equal(normalizeGenerationTaskType('music'), 't2m');
  assert.equal(normalizeGenerationTaskType('text_to_music'), 't2m');
  assert.equal(normalizeGenerationTaskType('speech'), 'speech');
});

test('music models are a distinct modality while speech and voice clones stay audio', () => {
  assert.equal(modelModality({ type: 'music' }), 'music');
  assert.equal(modelModality({ type: 'audio', capabilities: { sub_type: 'music' } }), 'music');
  assert.equal(modelModality({ type: 'audio', metadata_json: { modality: 'music' } }), 'music');
  assert.equal(modelModality({ category: 'audio', capabilities: '{"sub_type":"music"}' }), 'music');
  assert.equal(modelModality({ type: 'audio', capabilities: { sub_type: 'speech' } }), 'audio');
  assert.equal(modelModality({ type: 'audio' }), 'audio');
  assert.equal(modelModality({ type: 'image' }), 'image');
});

test('legacy t2a-declared music routes publish as a t2m/music capability', () => {
  const asT2a = projectReadyRouteCapabilities([{
    supported_task_types: ['t2a', 'text_to_audio'],
    mapping_capabilities: { input_types: ['text'], output_types: ['audio'], parameters: ['prompt', 'lyrics'] },
  }]);
  assert.deepEqual(asT2a.map((capability) => capability.taskType), ['t2a']);
  assert.deepEqual(asT2a[0].outputTypes, ['audio']);

  const asT2m = projectReadyRouteCapabilities([{
    supported_task_types: ['t2m'],
    mapping_capabilities: { input_types: ['text'], output_types: ['audio'], parameters: ['prompt', 'lyrics'] },
  }]);
  assert.deepEqual(asT2m.map((capability) => capability.taskType), ['t2m']);
  assert.deepEqual(asT2m[0].outputTypes, ['music']);
  assert.deepEqual(asT2m[0].variants[0].outputTypes, ['music']);
  assert.deepEqual(asT2m[0].parameters, ['prompt', 'lyrics']);

  const wrongOutput = projectReadyRouteCapabilities([{
    supported_task_types: ['t2m'],
    mapping_capabilities: { input_types: ['text'], output_types: ['image'], parameters: ['prompt'] },
  }]);
  assert.deepEqual(wrongOutput, []);
});

test('route admission keeps existing t2a music routes usable for t2m requests, without widening t2a', () => {
  const now = Date.now();
  const mapping = (overrides = {}) => ({
    provider_id: 'music-provider',
    provider_model_id: 'music-model',
    model_id: 'music-logical',
    enabled: true,
    provider_enabled: true,
    provider_endpoint: 'https://provider.example/v1/generate',
    review_status: 'approved',
    supported_task_types: ['t2a', 'text_to_audio'],
    capabilities: { input_types: ['text'], output_types: ['audio'], parameters: ['prompt', 'lyrics'] },
    health_status: 'healthy',
    last_health_check_at: new Date(now - 60_000).toISOString(),
    active_price_version: {
      id: 'music-price',
      price_type: 'manual',
      status: 'active',
      billing_unit: 'per_request',
      currency: 'CNY',
      price_config: { base_cost: 2 },
      source_observed_at: new Date(now - 60_000).toISOString(),
    },
    ...overrides,
  });

  const music = evaluateRouteCandidates([mapping()], { task_type: 't2m', prompt: 'song', lyrics: 'la la' }, { now });
  assert.deepEqual(music.rejected, []);
  assert.equal(music.candidates.length, 1);
  assert.equal(music.candidates[0].estimatedCostCurrency, 'CNY');

  const speech = evaluateRouteCandidates([mapping()], { task_type: 't2a', prompt: 'hello' }, { now });
  assert.equal(speech.candidates.length, 1);

  const t2mOnly = mapping({ supported_task_types: ['t2m'], capabilities: { input_types: ['text'], output_types: ['music'], parameters: ['prompt'] } });
  const speechOnMusic = evaluateRouteCandidates([t2mOnly], { task_type: 't2a', prompt: 'hello' }, { now });
  assert.deepEqual(speechOnMusic.rejected.map((entry) => entry.reason), ['TASK_TYPE_UNSUPPORTED']);

  const wrongOutput = mapping({ capabilities: { input_types: ['text'], output_types: ['image'], parameters: ['prompt', 'lyrics'] } });
  const imageOutput = evaluateRouteCandidates([wrongOutput], { task_type: 't2m', prompt: 'song' }, { now });
  assert.deepEqual(imageOutput.rejected.map((entry) => entry.reason), ['OUTPUT_TYPE_UNSUPPORTED']);
});

test('legacy canvas audio mounts split into audio and music with legal defaults in both schema views', () => {
  const candidates = [
    { id: 'voice-clone', capability: 'audio' },
    { id: 'minimax-speech-2.6', capability: 'audio' },
    { id: 'suno-v4', capability: 'music' },
  ];
  const config = {
    mountedModelIds: { image: [], video: [], text: [], audio: ['voice-clone', 'suno-v4', 'minimax-speech-2.6'] },
    defaults: canvasDefaults({ audioModelId: 'suno-v4' }),
  };

  const v2 = projectCanvasConfig(config, candidates);
  assert.deepEqual(v2.mountedModelIds.audio, ['voice-clone', 'minimax-speech-2.6']);
  assert.deepEqual(v2.mountedModelIds.music, ['suno-v4']);
  assert.equal(v2.defaults.musicModelId, 'suno-v4');
  // 语音组默认优先语音合成模型，不把声音克隆模型当作默认 TTS。
  assert.equal(v2.defaults.audioModelId, 'minimax-speech-2.6');
  assert.equal(validateCanvasModelConfig(v2, candidates), null);

  const v1 = projectCanvasConfig(config, candidates, { schemaVersion: 1 });
  assert.deepEqual(v1.mountedModelIds.audio, ['voice-clone', 'minimax-speech-2.6', 'suno-v4']);
  assert.equal(v1.defaults.audioModelId, 'suno-v4');
  assert.equal(v1.mountedModelIds.music, undefined);
});

test('canvas config accepts explicit music mounts and rejects music inside the audio group', () => {
  const candidates = [
    { id: 'speech', capability: 'audio' },
    { id: 'song', capability: 'music' },
  ];
  const valid = projectCanvasConfig({
    mountedModelIds: { image: [], video: [], text: [], audio: ['speech'], music: ['song'] },
    defaults: canvasDefaults({ audioModelId: 'speech', musicModelId: 'song' }),
  }, candidates);
  assert.deepEqual(valid.mountedModelIds.music, ['song']);
  assert.equal(validateCanvasModelConfig(valid, candidates), null);

  const misplaced = {
    mountedModelIds: { ...valid.mountedModelIds, audio: ['song'] },
    defaults: { ...valid.defaults, audioModelId: 'song' },
  };
  assert.equal(validateCanvasModelConfig(misplaced, candidates), 'audio 挂载列表包含无效、重复或当前不可用的模型');

  const missingMusicDefault = {
    mountedModelIds: valid.mountedModelIds,
    defaults: { ...valid.defaults, musicModelId: '' },
  };
  assert.equal(validateCanvasModelConfig(missingMusicDefault, candidates), 'music 默认模型必须属于已挂载模型');

  const emptyMusicDefault = {
    mountedModelIds: { ...valid.mountedModelIds, music: [] },
    defaults: { ...valid.defaults, musicModelId: '' },
  };
  assert.equal(validateCanvasModelConfig(emptyMusicDefault, candidates), null);
});
