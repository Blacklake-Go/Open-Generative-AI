import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultExclusiveFeatures, EXCLUSIVE_BENEFITS } from '../lib/pricing/exclusiveBenefits.js';

test('专属权益配置与默认分级正确性', () => {
  // Free 默认无专属付费特权
  const freeFeatures = getDefaultExclusiveFeatures('free');
  assert.deepEqual(freeFeatures, []);

  // Starter 默认去水印
  const starterFeatures = getDefaultExclusiveFeatures('starter');
  assert.ok(starterFeatures.includes('no_watermark'));
  assert.ok(!starterFeatures.includes('exclusive_latest_models'));

  // Basic 默认去水印与加速队列
  const basicFeatures = getDefaultExclusiveFeatures('basic');
  assert.ok(basicFeatures.includes('no_watermark'));
  assert.ok(basicFeatures.includes('vip_speed_queue'));
  assert.ok(!basicFeatures.includes('exclusive_latest_models'));

  // Plus 默认包含最新模型使用权与4K导出
  const plusFeatures = getDefaultExclusiveFeatures('plus');
  assert.ok(plusFeatures.includes('no_watermark'));
  assert.ok(plusFeatures.includes('vip_speed_queue'));
  assert.ok(plusFeatures.includes('exclusive_latest_models'));
  assert.ok(plusFeatures.includes('export_4k'));

  // Pro 默认包含所有专属权益
  const proFeatures = getDefaultExclusiveFeatures('pro');
  assert.ok(proFeatures.includes('commercial_license'));
  assert.ok(proFeatures.includes('dedicated_support'));
  assert.ok(proFeatures.includes('exclusive_latest_models'));
});

test('最新模型使用权拦截判定逻辑', () => {
  function verifyModelAccess(model, entitlements) {
    const isModelExclusive = Boolean(
      model.tier === 'exclusive' ||
      model.is_exclusive === true ||
      model.metadata_json?.exclusive === true ||
      model.capabilities?.exclusive === true
    );

    if (isModelExclusive && !entitlements?.hasExclusiveLatestModels) {
      throw Object.assign(new Error('该模型为会员专属最新模型，请升级至开通“最新模型专属使用权”的套餐'), {
        code: 'EXCLUSIVE_MODEL_REQUIRED',
      });
    }
    return true;
  }

  const standardModel = { id: 'flux-schnell', tier: 'standard' };
  const exclusiveModelTier = { id: 'sora-2', tier: 'exclusive' };
  const exclusiveModelFlag = { id: 'kling-v2', is_exclusive: true };
  const exclusiveModelMeta = { id: 'wan-2.2', metadata_json: { exclusive: true } };

  const freeEntitlements = { hasExclusiveLatestModels: false };
  const plusEntitlements = { hasExclusiveLatestModels: true };

  // 普通模型：免费与高级用户均可访问
  assert.equal(verifyModelAccess(standardModel, freeEntitlements), true);
  assert.equal(verifyModelAccess(standardModel, plusEntitlements), true);

  // 专属模型：无权限时抛出 EXCLUSIVE_MODEL_REQUIRED
  assert.throws(() => verifyModelAccess(exclusiveModelTier, freeEntitlements), {
    code: 'EXCLUSIVE_MODEL_REQUIRED',
  });
  assert.throws(() => verifyModelAccess(exclusiveModelFlag, freeEntitlements), {
    code: 'EXCLUSIVE_MODEL_REQUIRED',
  });
  assert.throws(() => verifyModelAccess(exclusiveModelMeta, null), {
    code: 'EXCLUSIVE_MODEL_REQUIRED',
  });

  // 专属模型：有权限时顺利通过
  assert.equal(verifyModelAccess(exclusiveModelTier, plusEntitlements), true);
  assert.equal(verifyModelAccess(exclusiveModelFlag, plusEntitlements), true);
  assert.equal(verifyModelAccess(exclusiveModelMeta, plusEntitlements), true);
});

test('去水印动态注入与权限防篡改逻辑', () => {
  function applyWatermarkPolicy(parameters, entitlements) {
    const effectiveParameters = { ...(parameters || {}) };
    if (effectiveParameters.watermark === undefined) {
      effectiveParameters.watermark = !Boolean(entitlements?.hasNoWatermark);
    } else if (!entitlements?.hasNoWatermark) {
      effectiveParameters.watermark = true;
    }
    return effectiveParameters;
  }

  const unprivileged = { hasNoWatermark: false };
  const privileged = { hasNoWatermark: true };

  // 1. 无去水印权益用户，未传 watermark 参数 -> 强制 true
  assert.equal(applyWatermarkPolicy({}, unprivileged).watermark, true);

  // 2. 无去水印权益用户，试图前端伪造传 watermark: false -> 强制覆写为 true (防绕过)
  assert.equal(applyWatermarkPolicy({ watermark: false }, unprivileged).watermark, true);

  // 3. 有去水印权益用户，未传 watermark 参数 -> 默认为 false (免水印)
  assert.equal(applyWatermarkPolicy({}, privileged).watermark, false);

  // 4. 有去水印权益用户，主动选择 false -> 保持 false
  assert.equal(applyWatermarkPolicy({ watermark: false }, privileged).watermark, false);

  // 5. 有去水印权益用户，主动选择 true (例如测试水印效果) -> 尊重用户意愿保持 true
  assert.equal(applyWatermarkPolicy({ watermark: true }, privileged).watermark, true);
});
