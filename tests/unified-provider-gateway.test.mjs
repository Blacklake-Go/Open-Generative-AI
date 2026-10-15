import assert from 'node:assert/strict';
import test from 'node:test';

import { providerRegistry } from '../lib/ai/providers/registry.ts';
import { OpenAIProviderPlugin } from '../lib/ai/providers/plugins/openai.plugin.ts';
import { KlingProviderPlugin } from '../lib/ai/providers/plugins/kling.plugin.ts';

test('ProviderRegistry: discovers registered modern plugins and falls back to legacy adapters', async () => {
  assert.equal(providerRegistry.hasProvider('openai'), true);
  assert.equal(providerRegistry.hasProvider('kling'), true);
  // Volcengine is in legacy adapters pool and should bridge cleanly
  assert.equal(providerRegistry.hasProvider('volcengine'), true);
  assert.equal(providerRegistry.hasProvider('non_existent_provider_xyz'), false);

  const openai = await providerRegistry.getProvider('openai');
  assert.equal(openai.providerId, 'openai');

  const kling = await providerRegistry.getProvider('kling');
  assert.equal(kling.providerId, 'kling');
});

test('OpenAIProviderPlugin: parameter validation and normalization', async () => {
  const plugin = new OpenAIProviderPlugin();

  const invalid = await plugin.validateParams('dall-e-3', null);
  assert.equal(invalid.valid, false);

  const valid1 = await plugin.validateParams('dall-e-3', { aspectRatio: '16:9', quality: 'hd' });
  assert.equal(valid1.valid, true);
  assert.equal(valid1.normalizedParams.resolution, '1792x1024');
  assert.equal(valid1.normalizedParams.quality, 'hd');

  const valid2 = await plugin.validateParams('dall-e-3', { aspectRatio: '1:1' });
  assert.equal(valid2.valid, true);
  assert.equal(valid2.normalizedParams.resolution, '1024x1024');
  assert.equal(valid2.normalizedParams.quality, 'standard');
});

test('OpenAIProviderPlugin: normalizeOutput standard format', () => {
  const plugin = new OpenAIProviderPlugin();
  const mockResponse = {
    data: [
      { url: 'https://oai.cdn.com/sample1.png', revised_prompt: 'sunset' },
    ],
  };

  const outputs = plugin.normalizeOutput(mockResponse);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].type, 'image');
  assert.equal(outputs[0].url, 'https://oai.cdn.com/sample1.png');
  assert.equal(outputs[0].mimeType, 'image/png');
});

test('KlingProviderPlugin: parameter validation and normalization', async () => {
  const plugin = new KlingProviderPlugin();

  const valid = await plugin.validateParams('kling-video-2-6', {
    duration: 10,
    aspectRatio: '9:16',
    quality: 'pro',
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.normalizedParams.duration, '10');
  assert.equal(valid.normalizedParams.aspect_ratio, '9:16');
  assert.equal(valid.normalizedParams.mode, 'pro');
});

test('KlingProviderPlugin: normalizeOutput standard video format', () => {
  const plugin = new KlingProviderPlugin();
  const mockResponse = {
    code: 0,
    data: {
      task_result: {
        videos: [
          { id: 'v1', url: 'https://kling.cdn.com/video1.mp4', duration: '5.0' },
        ],
      },
    },
  };

  const outputs = plugin.normalizeOutput(mockResponse);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].type, 'video');
  assert.equal(outputs[0].url, 'https://kling.cdn.com/video1.mp4');
  assert.equal(outputs[0].mimeType, 'video/mp4');
  assert.equal(outputs[0].duration, 5);
});
