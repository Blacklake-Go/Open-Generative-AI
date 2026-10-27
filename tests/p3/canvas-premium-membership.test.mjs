import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { EXCLUSIVE_BENEFIT_KEYS, getDefaultExclusiveFeatures } from '../../lib/pricing/exclusiveBenefits.js';

const read = (relativeUrl) => fs.readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');

test('画布高级工具是合法的会员专属权益，付费套餐默认授予、免费套餐不授予', () => {
  assert.ok(EXCLUSIVE_BENEFIT_KEYS.includes('canvas_premium_tools'));
  for (const planId of ['starter', 'basic', 'plus', 'pro']) {
    assert.ok(
      getDefaultExclusiveFeatures(planId).includes('canvas_premium_tools'),
      `${planId} 默认权益缺少 canvas_premium_tools`
    );
  }
  assert.equal(getDefaultExclusiveFeatures('free').includes('canvas_premium_tools'), false);

  const plans = read('../../lib/repositories/plans.js');
  for (const planId of ['starter', 'basic', 'plus', 'pro']) {
    const block = new RegExp(`${planId}: \\{[\\s\\S]*?exclusiveFeatures: \\[[^\\]]*canvas_premium_tools`);
    assert.match(plans, block, `${planId} 目录权益缺少 canvas_premium_tools`);
  }
});

test('报价接口对 premiumFeature 做会员鉴权并返回可识别的拒绝码', () => {
  const quotes = read('../../app/api/canvas/quotes/route.js');
  assert.match(quotes, /const premiumFeature = .*body\.premiumFeature/);
  assert.match(quotes, /EXCLUSIVE_BENEFIT_KEYS\.includes\(premiumFeature\)/);
  assert.match(quotes, /UNKNOWN_PREMIUM_FEATURE/);
  assert.match(quotes, /entitlements = await getEntitlements\(user\.id\)/);
  assert.match(quotes, /entitlements\?\.isPaidSubscription/);
  assert.match(quotes, /entitlements\.exclusiveFeatures\.includes\(premiumFeature\)/);
  assert.match(quotes, /code: 'MEMBERSHIP_REQUIRED'/);
  assert.match(quotes, /requiredFeature: premiumFeature/);
  assert.match(quotes, /status: 403/);
  assert.match(quotes, /ENTITLEMENT_LOOKUP_FAILED/);
});

test('生成任务必须携带报价，积分按已核销报价冻结且先核销后冻结', () => {
  const jobs = read('../../app/api/canvas/jobs/route.js');
  assert.match(jobs, /const quoteId = String\(body\.quoteId \|\| body\.quote_id/);
  assert.match(jobs, /code: 'QUOTE_REQUIRED'/);
  assert.match(jobs, /quoteId,/);

  const core = read('../../lib/services/generationCore.js');
  const verifyIndex = core.indexOf('verifyAndConsumeQuote({');
  const reserveIndex = core.indexOf('reserveCredits({');
  assert.ok(verifyIndex > 0, 'generationCore 未调用 verifyAndConsumeQuote');
  assert.ok(reserveIndex > verifyIndex, '必须先核销报价再冻结积分');
  assert.match(core, /creditCost = verifiedQuote\.credits/);
  assert.match(core, /quoteId: effectiveQuoteId/);
  assert.match(core, /userId,\s*modelId: model\.id,\s*parameters: parametersForQuote,\s*transaction: tx/);
});

test('画布会话返回前端权益判定所需的会员字段', () => {
  const session = read('../../app/api/canvas/session/route.js');
  assert.match(session, /isPaid: Boolean\(entitlements\?\.isPaidSubscription\)/);
  assert.match(session, /exclusiveFeatures: Array\.isArray\(entitlements\?\.exclusiveFeatures\)/);
  assert.match(session, /hasCanvasPremiumTools: Boolean\(entitlements\?\.hasCanvasPremiumTools\)/);
});
