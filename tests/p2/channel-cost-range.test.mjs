import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHANNEL_COST_REASONS,
  summarizeChannelCosts,
} from '../../lib/modelCenter/channelCostRange.js';

const FX = { usdToCny: 7.2 };

function channel(overrides = {}) {
  return {
    provider_id: 'muapi',
    provider_model_id: 'model_a',
    priority: 100,
    enabled: true,
    cost_config: {},
    active_price_version: null,
    ...overrides,
  };
}

function priceVersion(overrides = {}) {
  return {
    id: 'pv_1',
    version_no: 1,
    price_type: 'aggregator',
    billing_unit: 'per_request',
    currency: 'USD',
    price_config: {},
    status: 'active',
    ...overrides,
  };
}

test('迁移 022 后的视频渠道按每秒成本 × 默认 5 秒计价，不再显示 0 成本', () => {
  const summary = summarizeChannelCosts([
    channel({ cost_config: { cost_per_output_second: 0.01 } }),
  ], { fxSnapshot: FX, category: 'video', modelId: 'kling-v2' });

  assert.equal(summary.channelCount, 1);
  assert.equal(summary.pricedChannels, 1);
  assert.equal(summary.unpricedChannels, 0);
  assert.deepEqual(summary.unpricedReasons, {});
  assert.equal(summary.costConfigChannels, 1);
  assert.equal(summary.priceVersionChannels, 0);
  assert.equal(summary.minCostUsd, 0.05);
  assert.equal(summary.minCostCny, 0.36);
  assert.equal(summary.maxCostUsd, 0.05);
  assert.equal(summary.maxCostCny, 0.36);
  assert.deepEqual(summary.costBasis, { outputSeconds: 5, inputSeconds: 0, units: 1, billingUnit: null });
  assert.equal(summary.minCostChannel.costSource, 'provider_cost_config');
});

test('旧视频 base_cost 迁移为每秒成本，显式默认时长参与计算', () => {
  const legacy = summarizeChannelCosts([
    channel({ cost_config: { base_cost: 0.08 } }),
  ], { fxSnapshot: FX, category: 'video', modelId: 'seedance-pro' });
  assert.equal(legacy.minCostUsd, 0.4);
  assert.equal(legacy.minCostCny, 2.88);
  assert.equal(legacy.costBasis.outputSeconds, 5);

  const tenSeconds = summarizeChannelCosts([
    channel({ cost_config: { cost_per_output_second: 0.01, default_output_seconds: 10 } }),
  ], { fxSnapshot: FX, category: 'video', modelId: 'seedance-pro' });
  assert.equal(tenSeconds.minCostUsd, 0.1);
  assert.equal(tenSeconds.minCostCny, 0.72);
  assert.equal(tenSeconds.costBasis.outputSeconds, 10);
});

test('非视频类别不把 base_cost 迁移成每秒成本', () => {
  const summary = summarizeChannelCosts([
    channel({ cost_config: { base_cost: 0.02 } }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });

  assert.equal(summary.minCostUsd, 0.02);
  assert.equal(summary.minCostCny, 0.144);
  assert.equal(summary.costBasis.outputSeconds, 0);
});

test('active 价格版本优先于 provider cost_config，且两套配置不得叠加', () => {
  const summary = summarizeChannelCosts([
    channel({
      cost_config: { base_cost: 5, currency: 'USD' },
      active_price_version: priceVersion({
        id: 'pv_video',
        price_config: { cost_per_output_second: 0.01 },
      }),
    }),
  ], { fxSnapshot: FX, category: 'video', modelId: 'kling-v2' });

  assert.equal(summary.priceVersionChannels, 1);
  assert.equal(summary.costConfigChannels, 0);
  assert.equal(summary.minCostUsd, 0.05);
  assert.equal(summary.minCostCny, 0.36);
  assert.equal(summary.minCostChannel.costSource, 'price_version');
  assert.equal(summary.minCostChannel.priceVersionId, 'pv_video');
  assert.equal(summary.minCostChannel.priceType, 'aggregator');
});

test('价格版本的币种决定换算方向：CNY 版本不能按 USD 再乘汇率', () => {
  const summary = summarizeChannelCosts([
    channel({
      cost_config: { base_cost: 50, currency: 'USD' },
      active_price_version: priceVersion({
        id: 'pv_cny',
        price_type: 'manual',
        currency: 'CNY',
        price_config: { base_cost: 1 },
      }),
    }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });

  assert.equal(summary.minCostCny, 1);
  assert.equal(summary.minCostUsd, 0.13888889);
  assert.equal(summary.minCostChannel.priceType, 'manual');
});

test('失效或不可路由的价格版本回退到 cost_config 并单独计数', () => {
  const expired = summarizeChannelCosts([
    channel({
      cost_config: { base_cost: 0.02 },
      active_price_version: priceVersion({ status: 'expired', price_config: { base_cost: 9 } }),
    }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });
  assert.equal(expired.priceVersionChannels, 0);
  assert.equal(expired.costConfigChannels, 1);
  assert.equal(expired.minCostUsd, 0.02);

  const unrouteableType = summarizeChannelCosts([
    channel({
      cost_config: { base_cost: 0.02 },
      active_price_version: priceVersion({ price_type: 'official_public', price_config: { base_cost: 9 } }),
    }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });
  assert.equal(unrouteableType.priceVersionChannels, 0);
  assert.equal(unrouteableType.minCostUsd, 0.02);

  const emptyConfig = summarizeChannelCosts([
    channel({
      cost_config: { base_cost: 0.02 },
      active_price_version: priceVersion({ price_config: {} }),
    }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });
  assert.equal(emptyConfig.priceVersionChannels, 0);
  assert.equal(emptyConfig.minCostUsd, 0.02);
});

test('缺成本、缺汇率和不支持的币种都保持未知，不伪造 0 成本', () => {
  const missing = summarizeChannelCosts([
    channel({ cost_config: {} }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });
  assert.equal(missing.pricedChannels, 0);
  assert.equal(missing.unpricedChannels, 1);
  assert.deepEqual(missing.unpricedReasons, { [CHANNEL_COST_REASONS.NOT_CONFIGURED]: 1 });
  assert.equal(missing.minCostCny, null);
  assert.equal(missing.minCostUsd, null);
  assert.equal(missing.minCostChannel, null);

  const noFx = summarizeChannelCosts([
    channel({ cost_config: { base_cost: 0.02 } }),
  ], { fxSnapshot: {}, category: 'image', modelId: 'flux-dev' });
  assert.equal(noFx.pricedChannels, 0);
  assert.deepEqual(noFx.unpricedReasons, { [CHANNEL_COST_REASONS.FX_UNAVAILABLE]: 1 });
  assert.equal(noFx.minCostCny, null);

  const eur = summarizeChannelCosts([
    channel({ cost_config: { base_cost: 1, currency: 'EUR' } }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });
  assert.equal(eur.pricedChannels, 0);
  assert.deepEqual(eur.unpricedReasons, { [CHANNEL_COST_REASONS.CURRENCY_UNSUPPORTED]: 1 });
  assert.equal(eur.minCostCny, null);
});

test('多渠道取最低成本与最高成本，并按优先级与渠道 ID 稳定选中最低渠道', () => {
  const summary = summarizeChannelCosts([
    channel({ provider_model_id: 'expensive', priority: 500, cost_config: { base_cost: 0.05 } }),
    channel({ provider_model_id: 'cheap_low', priority: 10, cost_config: { base_cost: 0.01 } }),
    channel({ provider_model_id: 'cheap_high', priority: 20, cost_config: { base_cost: 0.01 } }),
    channel({ provider_model_id: 'disabled', enabled: false, cost_config: { base_cost: 0.001 } }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });

  assert.equal(summary.channelCount, 3);
  assert.equal(summary.pricedChannels, 3);
  assert.equal(summary.minCostUsd, 0.01);
  assert.equal(summary.minCostCny, 0.072);
  assert.equal(summary.maxCostUsd, 0.05);
  assert.equal(summary.maxCostCny, 0.36);
  assert.equal(summary.minCostChannel.providerModelId, 'cheap_high');
  assert.equal(summary.minCostChannel.priority, 20);
});

test('规格倍率进入后台成本估算，后台与报价口径一致', () => {
  const summary = summarizeChannelCosts([
    channel({
      cost_config: { base_cost: 0.01, resolution_multipliers: { '1024': 2 } },
    }),
  ], {
    fxSnapshot: FX,
    category: 'image',
    modelId: 'flux-dev',
    parameters: { resolution: '1024x1024' },
  });

  assert.equal(summary.minCostUsd, 0.02);
  assert.equal(summary.minCostCny, 0.144);
});

test('显式免费渠道计为 0 成本并标记来源，空渠道列表全部保持未知', () => {
  const free = summarizeChannelCosts([
    channel({ cost_config: { is_free: true, base_cost: 0.02 } }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });
  assert.equal(free.pricedChannels, 1);
  assert.equal(free.minCostCny, 0);
  assert.equal(free.minCostUsd, 0);
  assert.equal(free.minCostChannel.explicitlyFree, true);

  const empty = summarizeChannelCosts([], { fxSnapshot: FX });
  assert.deepEqual(empty, {
    channelCount: 0,
    pricedChannels: 0,
    unpricedChannels: 0,
    priceVersionChannels: 0,
    costConfigChannels: 0,
    unpricedReasons: {},
    unpricedDetails: [],
    minCostCny: null,
    minCostUsd: null,
    maxCostCny: null,
    maxCostUsd: null,
    minCostChannel: null,
    costBasis: null,
  });
});

test('价格版本按图片数计费时使用请求数量，且不与旧 cost_config 叠加', () => {
  const summary = summarizeChannelCosts([
    channel({
      cost_config: { base_cost: 5, currency: 'USD' },
      active_price_version: priceVersion({
        id: 'pv_image',
        billing_unit: 'per_image',
        price_config: { cost_per_image: 0.04 },
      }),
    }),
  ], {
    fxSnapshot: FX,
    category: 'image',
    modelId: 'flux-dev',
    parameters: { num_images: 2 },
  });

  assert.equal(summary.priceVersionChannels, 1);
  assert.equal(summary.costConfigChannels, 0);
  assert.equal(summary.minCostUsd, 0.08);
  assert.equal(summary.minCostCny, 0.576);
  assert.deepEqual(summary.costBasis, {
    outputSeconds: null,
    inputSeconds: null,
    units: 2,
    billingUnit: 'per_image',
  });
  assert.equal(summary.minCostChannel.billingUnit, 'per_image');
});

test('CNY 图片价格版本按图片数计价，USD 成本按同一汇率反算', () => {
  const summary = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_cny_image',
        currency: 'CNY',
        billing_unit: 'per_image',
        price_config: { cost_per_image: 1 },
      }),
    }),
  ], {
    fxSnapshot: FX,
    category: 'image',
    modelId: 'flux-dev',
    parameters: { num_images: 2 },
  });

  assert.equal(summary.minCostCny, 2);
  assert.equal(summary.minCostUsd, 0.27777778);
  assert.equal(summary.minCostChannel.currency, 'CNY');
});

test('按 token 计费的价格版本缺 token 估计时保持未知并说明缺哪一项', () => {
  const summary = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_tokens',
        billing_unit: 'per_token',
        price_config: { cost_per_1k_input_tokens: 0.01, cost_per_1k_output_tokens: 0.03 },
      }),
    }),
  ], { fxSnapshot: FX, category: 'text', modelId: 'gpt-test' });

  assert.equal(summary.pricedChannels, 0);
  assert.equal(summary.unpricedChannels, 1);
  assert.deepEqual(summary.unpricedReasons, { [CHANNEL_COST_REASONS.INPUT_REQUIRED]: 1 });
  assert.equal(summary.unpricedDetails.length, 1);
  assert.equal(summary.unpricedDetails[0].priceVersionId, 'pv_tokens');
  assert.equal(summary.unpricedDetails[0].detail, 'INPUT_TOKEN_ESTIMATE_REQUIRED');
  assert.equal(summary.minCostCny, null);
});

test('按 token 计费的价格版本使用请求中的输入输出 token 估算', () => {
  const summary = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_tokens',
        billing_unit: 'per_token',
        price_config: { cost_per_1k_input_tokens: 0.01, cost_per_1k_output_tokens: 0.03 },
      }),
    }),
  ], {
    fxSnapshot: FX,
    category: 'text',
    modelId: 'gpt-test',
    parameters: { input_tokens: 1000, output_tokens: 500 },
  });

  assert.equal(summary.pricedChannels, 1);
  assert.equal(summary.minCostUsd, 0.025);
  assert.equal(summary.minCostCny, 0.18);
});

test('不可路由的计费单位显式拒绝，不回退旧 cost_config', () => {
  const summary = summarizeChannelCosts([
    channel({
      cost_config: { base_cost: 0.02 },
      active_price_version: priceVersion({
        id: 'pv_legacy_unit',
        billing_unit: 'legacy_unit_unverified',
        price_config: { base_cost: 0.02 },
      }),
    }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });

  assert.equal(summary.priceVersionChannels, 1);
  assert.equal(summary.costConfigChannels, 0);
  assert.equal(summary.pricedChannels, 0);
  assert.deepEqual(summary.unpricedReasons, { [CHANNEL_COST_REASONS.PRICE_VERSION_UNIT_UNVERIFIED]: 1 });
  assert.equal(summary.unpricedDetails[0].priceVersionId, 'pv_legacy_unit');
  assert.equal(summary.unpricedDetails[0].detail, 'BILLING_UNIT_UNVERIFIED');
  assert.equal(summary.minCostCny, null);
});

test('按请求计价的 unit_amount 与显式免费价格版本', () => {
  const fixed = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_fixed',
        price_config: { unit_amount: 0.3 },
      }),
    }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });
  assert.equal(fixed.minCostUsd, 0.3);
  assert.equal(fixed.minCostCny, 2.16);

  const free = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_free',
        price_config: { is_free: true },
      }),
    }),
  ], { fxSnapshot: FX, category: 'image', modelId: 'flux-dev' });
  assert.equal(free.pricedChannels, 1);
  assert.equal(free.minCostUsd, 0);
  assert.equal(free.minCostCny, 0);
  assert.equal(free.minCostChannel.explicitlyFree, true);
  assert.equal(free.minCostChannel.costSource, 'price_version');
});

test('组合计费的价格版本叠加请求内各组成部分后再应用规格倍率', () => {
  const summary = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_combo',
        billing_unit: 'per_request',
        price_config: {
          base_cost: 0.01,
          cost_per_image: 0.02,
          resolution_multipliers: { '1024': 2 },
        },
      }),
    }),
  ], {
    fxSnapshot: FX,
    category: 'image',
    modelId: 'flux-dev',
    parameters: { num_images: 2, resolution: '1024x1024' },
  });

  assert.equal(summary.minCostUsd, 0.1);
  assert.equal(summary.minCostCny, 0.72);
});

test('视频价格版本缺时长时按平台 5 秒展示，显式时长优先', () => {
  const defaulted = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_video_second',
        billing_unit: 'per_second',
        price_config: { cost_per_output_second: 0.01 },
      }),
    }),
  ], { fxSnapshot: FX, category: 'video', modelId: 'kling-v2' });
  assert.equal(defaulted.minCostUsd, 0.05);
  assert.equal(defaulted.minCostCny, 0.36);
  assert.deepEqual(defaulted.costBasis, {
    outputSeconds: 5,
    inputSeconds: null,
    units: 1,
    billingUnit: 'per_second',
  });

  const explicit = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_video_second',
        billing_unit: 'per_second',
        price_config: { cost_per_output_second: 0.01 },
      }),
    }),
  ], {
    fxSnapshot: FX,
    category: 'video',
    modelId: 'kling-v2',
    parameters: { duration: 10 },
  });
  assert.equal(explicit.minCostUsd, 0.1);

  const configured = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_video_second',
        billing_unit: 'per_second',
        price_config: { cost_per_output_second: 0.01, default_output_seconds: 10 },
      }),
    }),
  ], { fxSnapshot: FX, category: 'video', modelId: 'kling-v2' });
  assert.equal(configured.minCostUsd, 0.1);
  assert.equal(configured.costBasis.outputSeconds, 10);
});

test('非视频类别不补平台默认时长，缺时长的按秒价格版本保持未知', () => {
  const summary = summarizeChannelCosts([
    channel({
      active_price_version: priceVersion({
        id: 'pv_audio_second',
        billing_unit: 'per_second',
        price_config: { cost_per_output_second: 0.01 },
      }),
    }),
  ], { fxSnapshot: FX, category: 'audio', modelId: 'tts-test' });

  assert.equal(summary.pricedChannels, 0);
  assert.deepEqual(summary.unpricedReasons, { [CHANNEL_COST_REASONS.INPUT_REQUIRED]: 1 });
  assert.equal(summary.unpricedDetails[0].detail, 'OUTPUT_DURATION_REQUIRED');
  assert.equal(summary.minCostCny, null);
});
