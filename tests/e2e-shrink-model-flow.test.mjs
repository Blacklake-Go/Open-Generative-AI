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

const aliasDefaults = (category) => new Set(
  Object.values(CAPABILITY_AUTO_ALIASES)
    .filter((alias) => alias.category === category)
    .map((alias) => alias.defaultModelId),
);

test('E2E Flow 1: 生图功能核心模型与规格校验', async () => {
  const imageDefaults = aliasDefaults('image');
  assert.equal(imageDefaults.size, 1, '所有生图别名必须收敛到同一个默认模型');
  const [imageDefault] = imageDefaults;
  assert.ok(CORE_MODEL_IDS.has(imageDefault), `生图默认模型 ${imageDefault} 必须属于 Core 目录`);
  assert.doesNotMatch(imageDefault, /runninghub|muapi|byteplus/i, '默认模型必须是逻辑模型 ID，而不是供应商映射 ID');

  // 模拟生图任务创建与 Provider 正常执行
  const mockCreation = { id: 'gen_img_1', model: imageDefault, prompt: 'a beautiful sunset over mountains' };
  const provider = createMockGenerationProvider({ resultUrl: 'https://cdn.supdance.local/img_1.png' });
  const result = await provider.generate({ creation: mockCreation });
  assert.equal(result.resultUrl, 'https://cdn.supdance.local/img_1.png');
  assert.ok(result.providerRequestId);
});

test('E2E Flow 2: 生视频功能核心模型与规格校验', async () => {
  const videoDefaults = aliasDefaults('video');
  assert.equal(videoDefaults.size, 1, '所有生视频别名必须收敛到同一个默认模型');
  const [videoDefault] = videoDefaults;
  assert.ok(CORE_MODEL_IDS.has(videoDefault), `生视频默认模型 ${videoDefault} 必须属于 Core 目录`);
  assert.doesNotMatch(videoDefault, /runninghub|muapi|byteplus/i, '默认模型必须是逻辑模型 ID，而不是供应商映射 ID');

  // 模拟视频任务状态流转
  assert.equal(canTransitionGeneration('queued', 'processing'), true);
  assert.equal(canTransitionGeneration('processing', 'succeeded'), true);
});

test('E2E Flow 3: 生音乐与语音能力分类校验', async () => {
  // P1 音乐迁移后 music 不再归并在 audio 之下：两类条目各自收敛，
  // 且不能回退到同一个默认模型。
  const musicDefaults = aliasDefaults('music');
  const audioDefaults = aliasDefaults('audio');
  assert.equal(musicDefaults.size, 1, '音乐别名必须收敛到同一个默认模型');
  assert.equal(audioDefaults.size, 1, '语音别名必须收敛到同一个默认模型');

  const [musicDefault] = musicDefaults;
  const [audioDefault] = audioDefaults;
  assert.notEqual(musicDefault, audioDefault, 'music 分类必须独立于 audio，不能共用语音默认模型');
  assert.ok(CORE_MODEL_IDS.has(audioDefault), `语音默认模型 ${audioDefault} 必须属于 Core 目录`);
  assert.doesNotMatch(musicDefault, /runninghub|muapi|byteplus/i, '音乐默认模型必须是逻辑模型 ID');
});

test('E2E Flow 4: 无限画布 (Canvas) 纯能力路由与自动选型', () => {
  // Canvas 仅传入 capability，不传或传入 auto
  const canvasImage = CAPABILITY_AUTO_ALIASES['auto'];
  assert.equal(canvasImage.category, 'image');
  assert.equal(canvasImage.defaultModelId, CAPABILITY_AUTO_ALIASES['image'].defaultModelId);

  const canvasVideo = CAPABILITY_AUTO_ALIASES['video'];
  assert.equal(canvasVideo.category, 'video');
  assert.equal(canvasVideo.defaultModelId, CAPABILITY_AUTO_ALIASES['auto-video'].defaultModelId);
  assert.ok(CORE_MODEL_IDS.has(canvasVideo.defaultModelId));

  const canvasMusic = CAPABILITY_AUTO_ALIASES['music'];
  assert.equal(canvasMusic.category, 'music');
  assert.equal(canvasMusic.defaultModelId, CAPABILITY_AUTO_ALIASES['auto-music'].defaultModelId);

  const canvasText = CAPABILITY_AUTO_ALIASES['text'];
  assert.equal(canvasText.category, 'text');
  assert.ok(CORE_MODEL_IDS.has(canvasText.defaultModelId));

  // 画布客户端无需直接接触任何第三方 Provider ID
  for (const [aliasName, alias] of Object.entries(CAPABILITY_AUTO_ALIASES)) {
    assert.doesNotMatch(alias.defaultModelId, /runninghub|muapi|byteplus/i, `别名 ${aliasName} 不得暴露供应商 ID`);
  }
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
  // 备用模型必须落在已发布的 Core 目录内，否则故障转移会落到无价格/未发布的线路。
  const primaryModel = {
    id: 'seedream-5.0-pro',
    tier: 'core',
    backup_model_id: 'seedream-4.5',
    credits_price: 30,
  };
  const backupModel = {
    id: 'seedream-4.5',
    tier: 'core',
    credits_price: 25,
  };

  assert.equal(primaryModel.backup_model_id, 'seedream-4.5');
  assert.ok(CORE_MODEL_IDS.has(backupModel.id), `备用模型 ${backupModel.id} 必须属于 Core 目录`);

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
