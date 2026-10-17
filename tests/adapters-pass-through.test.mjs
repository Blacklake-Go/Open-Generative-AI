import test from 'node:test';
import assert from 'node:assert/strict';

import { VolcengineAdapter, resolveModelName } from '../lib/adapters/VolcengineAdapter.js';
import { BytePlusAdapter, resolveModel } from '../lib/adapters/BytePlusAdapter.js';

test('VolcengineAdapter: 精确透传原生模型名与接入点 (ep-*)，无模糊猜测或掉包', () => {
  // 原生模型与端点必须精确透传
  assert.equal(resolveModelName('doubao-seedream-5-0-pro-260628'), 'doubao-seedream-5-0-pro-260628');
  assert.equal(resolveModelName('doubao-seedream-5-0-260128'), 'doubao-seedream-5-0-260128');
  assert.equal(resolveModelName('doubao-seedream-4-5-251128'), 'doubao-seedream-4-5-251128');
  assert.equal(resolveModelName('doubao-seededit-3-0-i2i-250628'), 'doubao-seededit-3-0-i2i-250628');
  assert.equal(resolveModelName('ep-20261016-myendpoint'), 'ep-20261016-myendpoint');

  // 新规范规格别名必须精确映射
  assert.equal(resolveModelName('seedream-5.0-pro'), 'doubao-seedream-5-0-pro-260628');
  assert.equal(resolveModelName('seedream-5.0-flash'), 'seedream-5.0-flash');
  assert.equal(resolveModelName('seedream-5.0-lite'), 'seedream-5.0-lite');
  assert.equal(resolveModelName('seedream-4.5'), 'doubao-seedream-4-5-251128');
  assert.equal(resolveModelName('seedream-5.0-edit'), 'seedream-5.0-edit');
  assert.equal(resolveModelName('nano-banana-pro'), 'nano-banana-pro');

  // 未知或未来模型一律透传原始标识，绝不能默认掉包成 5.0 Pro
  assert.equal(resolveModelName('custom-seedream-future-v6'), 'custom-seedream-future-v6');
  assert.equal(resolveModelName('random-unknown-model'), 'random-unknown-model');
});

test('BytePlusAdapter: 生图与视频规格精确映射与透传，杜绝强制兜底', () => {
  // 生图原生模型与端点必须精确透传
  assert.equal(resolveModel('dola-seedream-5-0-pro-260628', 'image'), 'dola-seedream-5-0-pro-260628');
  assert.equal(resolveModel('seedream-5-0-lite-260128', 'image'), 'seedream-5-0-lite-260128');
  assert.equal(resolveModel('ep-20261016-byteplus-ep', 'image'), 'ep-20261016-byteplus-ep');

  // 生图规范规格别名必须精确映射
  assert.equal(resolveModel('seedream-5.0-pro', 'image'), 'dola-seedream-5-0-pro-260628');
  assert.equal(resolveModel('seedream-5.0-flash', 'image'), 'seedream-5-0-lite-260128');
  assert.equal(resolveModel('seedream-5.0-lite', 'image'), 'seedream-5-0-lite-260128');
  assert.equal(resolveModel('seedream-4.5', 'image'), 'seedream-4-5-251128');

  // 视频规范规格别名与原生端点映射
  assert.equal(resolveModel('seedance-2.5', 'video'), 'dreamina-seedance-2-5-260628');
  assert.equal(resolveModel('seedance-2.0', 'video'), 'dreamina-seedance-2-0-260128');
  assert.equal(resolveModel('dreamina-seedance-2-0-fast-260128', 'video'), 'dreamina-seedance-2-0-fast-260128');
  assert.equal(resolveModel('ep-20261016-video-ep', 'video'), 'ep-20261016-video-ep');

  // 未知模型必须精确透传原始标识，绝不能静默兜底为 seedream-5.0 或 seedance-2.0
  assert.equal(resolveModel('unknown-model-xyz', 'image'), 'unknown-model-xyz');
  assert.equal(resolveModel('unknown-video-model-xyz', 'video'), 'unknown-video-model-xyz');
});

test('VolcengineAdapter & BytePlusAdapter: 满足标准 IModelProvider 接口契约', async () => {
  const volc = new VolcengineAdapter({ apiKey: 'mock-volc' });
  const byteplus = new BytePlusAdapter({ apiKey: 'mock-bp' });

  // validateParams
  assert.equal(volc.validateParams({ prompt: 'hello' }).valid, true);
  assert.throws(() => volc.validateParams({ prompt: '' }), (err) => err.code === 'INVALID_INPUT');

  assert.equal(byteplus.validateParams({ prompt: 'hello' }).valid, true);
  assert.throws(() => byteplus.validateParams({ prompt: '' }), (err) => err.code === 'INVALID_INPUT');

  // submitJob / pollStatus aliases exist
  assert.equal(typeof volc.submitJob, 'function');
  assert.equal(typeof volc.pollStatus, 'function');
  assert.equal(typeof volc.normalizeOutput, 'function');

  assert.equal(typeof byteplus.submitJob, 'function');
  assert.equal(typeof byteplus.pollStatus, 'function');
  assert.equal(typeof byteplus.normalizeOutput, 'function');
});
