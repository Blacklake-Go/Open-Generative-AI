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
  assert.deepEqual(summary.costBasis, { outputSeconds: 5, inputSeconds: 0, units: 1 });
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
    minCostCny: null,
    minCostUsd: null,
    maxCostCny: null,
    maxCostUsd: null,
    minCostChannel: null,
    costBasis: null,
  });
});
