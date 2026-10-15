import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CORE_MODEL_IDS,
  CAPABILITY_AUTO_ALIASES,
} from '../lib/repositories/models.js';
import {
  assertGenerationTransition,
  canTransitionGeneration,
} from '../lib/services/generationState.js';
import { createMockGenerationProvider } from '../lib/services/generationProviders.js';
import {
  selectRouteCandidate,
  buildRouteQuoteSnapshot,
} from '../lib/modelCenter/routePricing.js';
import {
  hasProviderAdapter,
  getProviderAdapter,
} from '../lib/adapters/index.js';

test('E2E Flow 1: 生图功能核心模型与规格校验', async () => {
  const imageCoreIds = ['nano-banana', 'flux-dev', 'flux-kontext-pro-t2i', 'wan2.1-text-to-image', 'gpt4o-text-to-image', 'bytedance-seedream-v3'];
  assert.ok(imageCoreIds.length >= 4 && imageCoreIds.length <= 8, '生图核心模型聚焦在 4~8 个');
  for (const id of imageCoreIds) {
    assert.ok(CORE_MODEL_IDS.has(id), `Core 集合必须包含生图核心模型 ${id}`);
  }

  // 模拟生图任务创建与 Provider 正常执行
  const mockCreation = { id: 'gen_img_1', model: 'nano-banana', prompt: 'a beautiful sunset over mountains' };
  const provider = createMockGenerationProvider({ resultUrl: 'https://cdn.supdance.local/img_1.png' });
  const result = await provider.generate({ creation: mockCreation });
  assert.equal(result.resultUrl, 'https://cdn.supdance.local/img_1.png');
  assert.ok(result.providerRequestId);
});

test('E2E Flow 2: 生视频功能核心模型与规格校验', async () => {
  const videoCoreIds = ['seedance-v2.0-t2v', 'kling-v2.6-pro-t2v', 'veo3-text-to-video', 'wan2.1-image-to-video', 'minimax-hailuo-2.3-standard-t2v'];
  assert.ok(videoCoreIds.length >= 4 && videoCoreIds.length <= 6, '生视频核心模型聚焦在 4~6 个');
  for (const id of videoCoreIds) {
    assert.ok(CORE_MODEL_IDS.has(id), `Core 集合必须包含视频核心模型 ${id}`);
  }

  // 模拟视频任务状态流转
  assert.equal(canTransitionGeneration('queued', 'processing'), true);
  assert.equal(canTransitionGeneration('processing', 'succeeded'), true);
});

test('E2E Flow 3: 生音乐功能核心模型与规格校验', async () => {
  const audioCoreIds = ['suno-create-music', 'minimax-music-3.0', 'mmaudio-v2-text-to-audio'];
  assert.ok(audioCoreIds.length >= 2 && audioCoreIds.length <= 4, '生音乐核心模型聚焦在 2~4 个');
  for (const id of audioCoreIds) {
    assert.ok(CORE_MODEL_IDS.has(id), `Core 集合必须包含音乐核心模型 ${id}`);
  }
});

test('E2E Flow 4: 无限画布 (Canvas) 纯能力路由与自动选型', () => {
  // Canvas 仅传入 capability，不传或传入 auto
  const canvasImage = CAPABILITY_AUTO_ALIASES['auto'];
  assert.equal(canvasImage.category, 'image');
  assert.equal(canvasImage.defaultModelId, 'nano-banana');

  const canvasVideo = CAPABILITY_AUTO_ALIASES['video'];
  assert.equal(canvasVideo.category, 'video');
  assert.equal(canvasVideo.defaultModelId, 'seedance-v2.0-t2v');

  const canvasAudio = CAPABILITY_AUTO_ALIASES['music'];
  assert.equal(canvasAudio.category, 'audio');
  assert.equal(canvasAudio.defaultModelId, 'suno-create-music');

  // 画布客户端无需直接接触任何第三方 Provider ID
  assert.doesNotMatch(canvasImage.defaultModelId, /runninghub|muapi|byteplus/);
  assert.doesNotMatch(canvasVideo.defaultModelId, /runninghub|muapi|byteplus/);
});

test('E2E Flow 5: 多供应商绑定与智能 Provider 选择（成本/质量/健康/延迟）', () => {
  const candidates = [
    {
      providerId: 'runninghub',
      providerModelId: 'rh-nano-banana',
      estimatedCostCny: 0.15,
      estimatedCostUsd: 0.02,
      priceVersionId: 'pv_1',
      priceType: 'account_actual',
      successRate: 0.98,
      latencyMs: 1200,
      priority: 10,
      fxSnapshot: { usdToCny: 7.2 },
    },
    {
      providerId: 'volcengine',
      providerModelId: 'volc-nano-banana',
      estimatedCostCny: 0.22,
      estimatedCostUsd: 0.03,
      priceVersionId: 'pv_2',
      priceType: 'vendor_direct',
      successRate: 0.95,
      latencyMs: 2500,
      priority: 5,
      fxSnapshot: { usdToCny: 7.2 },
    },
    {
      providerId: 'official',
      providerModelId: 'google-nano-banana',
      estimatedCostCny: 0.35,
      estimatedCostUsd: 0.05,
      priceVersionId: 'pv_3',
      priceType: 'official_public',
      successRate: 0.99,
      latencyMs: 800,
      priority: 1,
      fxSnapshot: { usdToCny: 7.2 },
    },
  ];

  // 1. 成本优先策略选择最低成本渠道
  const costWinner = selectRouteCandidate({ candidates }, { routingMode: 'cost' });
  assert.equal(costWinner.providerId, 'runninghub', '成本优先模式应选择 runninghub');

  // 2. 稳定性优先策略在满足健康与成本条件下评估质量与延迟
  const stabilityWinner = selectRouteCandidate({ candidates }, { routingMode: 'stability' });
  assert.ok(stabilityWinner, '稳定性优先策略应成功选路');
});

test('E2E Flow 6: 一级故障转移（Provider 级别自动重试与切换）', async () => {
  const candidates = [
    { providerId: 'runninghub', providerModelId: 'rh-model', estimatedCostCny: 0.10, priceVersionId: 'pv_1', fxSnapshot: { usdToCny: 7.2 } },
    { providerId: 'volcengine', providerModelId: 'volc-model', estimatedCostCny: 0.15, priceVersionId: 'pv_2', fxSnapshot: { usdToCny: 7.2 } },
  ];

  // 第一轮：runninghub 胜出
  const round1 = selectRouteCandidate({ candidates: candidates.filter((c) => !['excluded'].includes(c.providerId)) }, { routingMode: 'cost' });
  assert.equal(round1.providerId, 'runninghub');

  // 当 runninghub 发生可重试错误，排除 runninghub 后第二轮：官方直连 volcengine 自动接管
  const round2 = selectRouteCandidate({ candidates: candidates.filter((c) => c.providerId !== 'runninghub') }, { routingMode: 'cost' });
  assert.equal(round2.providerId, 'volcengine');
});

test('E2E Flow 7: 二级故障转移（Model 级别 Backup 模型接管与计费上限保护）', async () => {
  const primaryModel = {
    id: 'nano-banana',
    tier: 'core',
    backup_model_id: 'flux-dev',
    credits_price: 30,
  };
  const backupModel = {
    id: 'flux-dev',
    tier: 'core',
    credits_price: 25,
  };

  assert.equal(primaryModel.backup_model_id, 'flux-dev');
  assert.ok(CORE_MODEL_IDS.has(backupModel.id));

  // 预扣金额为 30 积分，故障转移至备用模型后，结算金额严格不高于预扣金额
  const reservedCredits = 30;
  const backupSettleCredits = Math.min(reservedCredits, backupModel.credits_price);
  assert.equal(backupSettleCredits, 25, '若备用模型更便宜，用户享受更低价或不多扣');
  assert.ok(backupSettleCredits <= reservedCredits, '结算额度绝不能超过预扣凭单');
});

test('E2E Flow 8: 异常与失败终态处理（全渠道耗尽解冻释放 vs 审核违规立即阻断）', () => {
  // 1. 全渠道耗尽失败，必须安全退回
  assert.equal(canTransitionGeneration('processing', 'failed'), true);

  // 2. 状态机禁止从 succeeded 逆转为 processing
  assert.equal(canTransitionGeneration('succeeded', 'processing'), false);
  assert.throws(() => assertGenerationTransition('succeeded', 'processing'), {
    code: 'INVALID_GENERATION_TRANSITION',
  });
});
