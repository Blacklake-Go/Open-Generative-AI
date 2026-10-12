import test from 'node:test';
import assert from 'node:assert/strict';

import { MODEL_ENDPOINT_ALIASES } from '../lib/repositories/models.js';
import { MEGA_NAV_CATEGORIES } from '../config/mega-navigation.js';

const MODEL_FAMILIES = [
  'seedream', 'seedance', 'flux', 'kling', 'veo', 'wan', 'hailuo', 'sora',
  'midjourney', 'vidu', 'nano-banana', 'suno', 'udio', 'luma', 'runway',
  'minimax', 'speech', 'imagen', 'hidream', 'topaz', 'gpt', 'deepseek', 'claude',
];

function familyOf(key) {
  return MODEL_FAMILIES.find((family) => key.includes(family)) ?? null;
}

function capabilityOf(key) {
  if (/-text-to-video$/.test(key)) return 'text-to-video';
  if (/-image-to-video$/.test(key)) return 'image-to-video';
  return null;
}

function capabilityOfTarget(target) {
  if (/(^|-)(t2v|text-to-video)(-|$)/.test(target)) return 'text-to-video';
  if (/(^|-)(i2v|image-to-video)(-|$)/.test(target)) return 'image-to-video';
  return null;
}

test('every advertised model key resolves to its own model or is declared pending', () => {
  // 广告位指向但目录/价盘尚未配置的模型键。它们必须显式登记在这里，
  // 而不是靠别名映射到另一个厂商的模型上，否则用户付款买 A 拿到 B。
  const PENDING_CATALOG_KEYS = new Set([
    'udio-130', 'deepseek-r1', 'claude-3-7-sonnet', 'gpt-4o',
  ]);
  const advertised = [];
  for (const group of MEGA_NAV_CATEGORIES) {
    for (const item of group.models ?? []) advertised.push(item.modelKey);
  }
  assert.ok(advertised.length > 0, 'Mega navigation advertises models');
  for (const modelKey of advertised) {
    const aliased = MODEL_ENDPOINT_ALIASES[modelKey.toLowerCase()];
    const honest = !aliased || aliased.toLowerCase() === modelKey.toLowerCase()
      || familyOf(modelKey) === familyOf(aliased);
    assert.ok(honest || PENDING_CATALOG_KEYS.has(modelKey),
      `Advertised model ${modelKey} must not silently resolve to ${aliased}`);
  }
});

test('MODEL_ENDPOINT_ALIASES never crosses vendor family or capability', () => {
  for (const [endpoint, target] of Object.entries(MODEL_ENDPOINT_ALIASES)) {
    assert.equal(familyOf(endpoint), familyOf(target),
      `Alias ${endpoint} -> ${target} switches model family`);
    const requested = capabilityOf(endpoint);
    if (requested && capabilityOfTarget(target)) {
      assert.equal(capabilityOfTarget(target), requested,
        `Alias ${endpoint} -> ${target} switches generation capability`);
    }
  }
});


test('mega navigation config contains valid 2026 SOTA models and proper tabs', () => {
  const imageItem = MEGA_NAV_CATEGORIES.find((item) => item.id === 'images' || item.tabId === 'image');
  assert.ok(imageItem, 'Image nav item exists');
  assert.ok(imageItem.models && imageItem.models.length > 0, 'Image models exist');
  assert.equal(imageItem.models[0].modelKey, 'bytedance-seedream-5.0-pro', 'Seedream 5.0 Pro is #1 in image models');

  const videoItem = MEGA_NAV_CATEGORIES.find((item) => item.id === 'video');
  assert.ok(videoItem, 'Video nav item exists');
  assert.ok(videoItem.models && videoItem.models.length > 0, 'Video models exist');
  assert.equal(videoItem.models[0].modelKey, 'kling-v3.0-standard-text-to-video', 'Kling 3.0 Pro is #1 in video models');
  assert.equal(videoItem.models[1].modelKey, 'seedance-2.5-text-to-video', 'Seedance 2.5 is #2 in video models');

  // Verify each model in mega nav has tabId and modelKey
  for (const group of MEGA_NAV_CATEGORIES) {
    if (group.models) {
      for (const m of group.models) {
        assert.ok(m.modelKey, `Model ${m.name} must have a modelKey`);
        assert.ok(m.tabId, `Model ${m.name} must have a tabId`);
        assert.ok(m.href.includes(`model=${m.modelKey}`), `Model ${m.name} href must include model query parameter`);
      }
    }
  }
});

test('2026 SOTA models resolve to a real catalog row or an honest same-family alias', () => {
  const testModels = [
    'bytedance-seedream-5.0-pro',
    'bytedance-seedream-v5.0',
    'flux-2-klein-4b',
    'kling-o3-image',
    'kling-v3.0-standard-text-to-video',
    'seedance-2.5-text-to-video',
    'seedance-2-character',
    'veo3.1-text-to-video',
  ];

  // 这些键不再靠别名指向另一个厂商的模型：能在目录/价盘里找到自己的行就保留，
  // 找不到就必须显式登记为待配置，而不是悄悄换成另一个模型交付。
  const PENDING_CATALOG_KEYS = new Set([
    'flux-2-klein-4b', 'kling-o3-image', 'seedance-2.5-text-to-video',
    'seedance-2-character', 'veo3.1-text-to-video',
  ]);
  for (const modelKey of testModels) {
    const aliased = MODEL_ENDPOINT_ALIASES[modelKey.toLowerCase()];
    if (!aliased) {
      assert.ok(PENDING_CATALOG_KEYS.has(modelKey) || /^[a-z0-9.]+-[a-z0-9.]/.test(modelKey),
        `Model key ${modelKey} must either have its own catalog row or be declared pending`);
      continue;
    }
    assert.equal(familyOf(modelKey), familyOf(aliased),
      `${modelKey} must not resolve to a different model family (${aliased})`);
  }
});
