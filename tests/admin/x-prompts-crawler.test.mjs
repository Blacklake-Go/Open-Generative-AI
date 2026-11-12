import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPromptDetails } from '../../lib/services/xPromptCrawler.js';

test('extractPromptDetails: 能够正确解析 Midjourney 提示词和 --ar / --v 参数', () => {
  const text = 'A futuristic cybernetic dancer, neon illumination, reflective glass floor --ar 16:9 --v 6.1 --s 250';
  const result = extractPromptDetails(text);

  assert.equal(result.category, 'image');
  assert.equal(result.model, 'Midjourney v6.1');
  assert.ok(result.parameters.includes('--ar 16:9'));
  assert.ok(result.parameters.includes('--v 6.1'));
  assert.equal(result.prompt, 'A futuristic cybernetic dancer, neon illumination, reflective glass floor');
});

test('extractPromptDetails: 当推文正文仅为 "Prompt 👇" 时，优先采用图片 ALT 详细提示词', () => {
  const text = 'Prompt in ALT 👇 Enjoy!';
  const photos = [{ url: 'https://pbs.twimg.com/media/abc.jpg' }];
  const imgAlts = ['Cinematic portrait of an ancient warrior queen in obsidian armor, dramatic side rim light --ar 9:16 --v 6.1'];

  const result = extractPromptDetails(text, photos, imgAlts);

  assert.equal(result.category, 'image');
  assert.ok(result.prompt.includes('Cinematic portrait of an ancient warrior queen'));
  assert.ok(result.parameters.includes('--ar 9:16'));
});

test('extractPromptDetails: 能够识别生视频模型与提示词', () => {
  const text = 'Runway Gen-3 prompt: slow motion aerial shot orbiting a crystal mountain peak at sunrise, volumetric fog';
  const result = extractPromptDetails(text);

  assert.equal(result.category, 'video');
  assert.equal(result.model, 'Runway Gen-3');
  assert.ok(result.prompt.includes('slow motion aerial shot orbiting a crystal mountain peak'));
});

test('extractPromptDetails: 能够识别生音乐模型与提示词', () => {
  const text = 'Suno v3.5 prompt: [Intro] synthwave melody [Verse 1] neon lights in Tokyo rain [Chorus] pulse of the city';
  const result = extractPromptDetails(text);

  assert.equal(result.category, 'music');
  assert.equal(result.model, 'Suno v3.5');
  assert.ok(result.prompt.includes('synthwave melody'));
});

test('extractPromptDetails: 能够提取负面提示词 (Negative prompt) 与 Flux 模型', () => {
  const text = 'Flux.1 prompt: Hyperrealistic portrait of an astronaut on Mars Negative prompt: blur, oversaturated, deformed hands, extra limbs';
  const result = extractPromptDetails(text);

  assert.equal(result.category, 'image');
  assert.equal(result.model, 'Flux.1 Schnell');
  assert.equal(result.negativePrompt, 'blur, oversaturated, deformed hands, extra limbs');
  assert.ok(result.prompt.includes('Hyperrealistic portrait of an astronaut on Mars'));
});

