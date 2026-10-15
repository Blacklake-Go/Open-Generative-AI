import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUOTA_RULES,
  normalizeQuotaRules,
  verifyQuotaPricingConsistency,
  BENCHMARK_MODELS,
} from '../../lib/services/quotaRules.js';

test('配额规则默认值定义契约', () => {
  assert.equal(DEFAULT_QUOTA_RULES.initialSignupCredits, 40, '默认注册赠送应为 40 积分');
  assert.equal(DEFAULT_QUOTA_RULES.onboardingRewardCredits, 50, '默认引导完成赠送应为 50 积分');
  assert.equal(DEFAULT_QUOTA_RULES.dailyCheckinCredits, 10, '默认每日签到应为 10 积分');
  assert.equal(DEFAULT_QUOTA_RULES.dailyCheckinValidity, 'today', '签到积分应默认为当日有效');
  assert.equal(DEFAULT_QUOTA_RULES.onboardingGateEnabled, true, '引导奖励门槛应默认开启');
  assert.equal(DEFAULT_QUOTA_RULES.dailySignupIpLimit, 5, '单 IP 每日注册上限应为 5');
});

test('规则归一化防御：非法值修正与安全边界兜底', () => {
  // 空输入或缺省
  const normalizedEmpty = normalizeQuotaRules(null);
  assert.deepEqual(normalizedEmpty, DEFAULT_QUOTA_RULES);

  // 极端或越界输入修正
  const normalizedOutlier = normalizeQuotaRules({
    initialSignupCredits: -10,
    onboardingRewardCredits: 99999,
    dailyCheckinCredits: 'invalid',
    dailyCheckinValidity: 'forever_invalid',
    onboardingGateEnabled: 'not-a-bool',
    dailySignupIpLimit: 0,
  });

  assert.equal(normalizedOutlier.initialSignupCredits, 0, '负数应被纠正为 0');
  assert.equal(normalizedOutlier.onboardingRewardCredits, 500, '超大值应被封顶至安全上限 500');
  assert.equal(normalizedOutlier.dailyCheckinCredits, 10, '非法非数字应回退至默认 10');
  assert.equal(normalizedOutlier.dailyCheckinValidity, 'today', '非法有效期策略应回退至 today');
  assert.equal(normalizedOutlier.dailySignupIpLimit, 1, '低于下限的 IP 限制应归一化为 1');
});

test('官方核验基准模型定义完整性', () => {
  // 基准模型列表覆盖文生图、旗舰生图与视频模型
  assert.ok(BENCHMARK_MODELS.some((m) => m.id === 'wanx2.1-t2i-turbo' && m.category === 'image' && m.credits === 10));
  assert.ok(BENCHMARK_MODELS.some((m) => m.id === 'flux1.1-pro' && m.category === 'image' && m.credits === 20));
  assert.ok(BENCHMARK_MODELS.some((m) => m.id === 'wanx2.1-t2v-turbo' && m.category === 'video' && m.credits === 80));
  assert.ok(BENCHMARK_MODELS.some((m) => m.id === 'minimax-hailuo-2.3-fast' && m.category === 'video' && m.credits === 90));
  assert.ok(BENCHMARK_MODELS.some((m) => m.id === 'seedance-2.0-480p' && m.category === 'video' && m.credits === 295));
  assert.ok(BENCHMARK_MODELS.some((m) => m.id === 'veo-3.1-standard' && m.category === 'video' && m.credits === 910));
});

test('官方默认配额规则与定价表的一致性全量校验通过', () => {
  const result = verifyQuotaPricingConsistency(DEFAULT_QUOTA_RULES);

  assert.equal(result.isConsistent, true, '默认规则必须与定价表 100% 一致');
  assert.equal(result.unitEconomics.totalNewcomerCredits, 90, '新用户首日总额度为 40 + 50 = 90');
  assert.equal(result.unitEconomics.perceivedValueCny, 6.30, '用户感知价值应为 90 * 0.07 = 6.30 元');
  assert.equal(result.unitEconomics.estimatedCac, 1.26, '平台边际成本应为 90 * 0.014 = 1.26 元');
  assert.ok(result.unitEconomics.estimatedCac <= 2.50, '边际成本 1.26 元必须小于预算上限 2.50 元');

  // 6 项核心检查清单逐项验证
  assert.equal(result.checks.length, 6, '必须包含 6 项结构化校验');
  for (const item of result.checks) {
    assert.equal(item.passed, true, `检查项 [${item.id}: ${item.title}] 必须校验通过`);
  }

  // 关键体验容量矩阵验证
  const capacityMap = Object.fromEntries(result.modelTrials.map((c) => [c.id, c.totalRunsPossible]));
  assert.equal(capacityMap['wanx2.1-t2i-turbo'], 9, '90 积分应支持生成 9 次 通义万相 Turbo');
  assert.equal(capacityMap['flux1.1-pro'], 4, '90 积分应支持生成 4 次 FLUX 1.1 Pro');
  assert.equal(capacityMap['wanx2.1-t2v-turbo'], 1, '90 积分应支持生成 1 次 万相 5秒视频 (剩 10 分)');
  assert.equal(capacityMap['minimax-hailuo-2.3-fast'], 1, '90 积分应支持生成 1 次 海螺 2.3 视频 (刚好用完)');
  assert.equal(capacityMap['seedance-2.0-480p'], 0, '90 积分无法生成 Seedance (295分)，保障高价值付费转化');
  assert.equal(capacityMap['veo-3.1-standard'], 0, '90 积分无法生成 Veo 2 (910分)，保障旗舰付费壁垒');
});

test('异常配额规则触发定价一致性警告', () => {
  // 异常场景 1：额度过低，新用户无法完成任何视频试用（总额度仅 20）
  const tooLowResult = verifyQuotaPricingConsistency({
    ...DEFAULT_QUOTA_RULES,
    initialSignupCredits: 10,
    onboardingRewardCredits: 10,
  });
  assert.equal(tooLowResult.isConsistent, false, '过低额度应导致一致性校验不通过');
  const trialCheck = tooLowResult.checks.find((c) => c.id === 'check_onboarding_video_unlock');
  assert.equal(trialCheck?.passed, false, '视频解锁项应被标记为失败');

  // 异常场景 2：赠送过大导致 CAC 穿透预算（总额度 200，成本 2.80 > 2.50）
  const tooHighResult = verifyQuotaPricingConsistency({
    ...DEFAULT_QUOTA_RULES,
    initialSignupCredits: 100,
    onboardingRewardCredits: 100,
  });
  assert.equal(tooHighResult.isConsistent, false, '超预算赠送应导致一致性校验不通过');
  const cacCheck = tooHighResult.checks.find((c) => c.id === 'check_cac_within_budget');
  assert.equal(cacCheck?.passed, false, '获客成本预算项应被标记为失败');

  // 异常场景 3：每日签到赠送过多破坏付费体系（每天签到给 100 分）
  const excessiveCheckinResult = verifyQuotaPricingConsistency({
    ...DEFAULT_QUOTA_RULES,
    dailyCheckinCredits: 100,
  });
  assert.equal(excessiveCheckinResult.isConsistent, false, '签到积分超标应导致一致性校验不通过');
  const checkinCheck = excessiveCheckinResult.checks.find((c) => c.id === 'check_daily_checkin_free_tier');
  assert.equal(checkinCheck?.passed, false, '免费签到基准项应被标记为失败');
});

test('认证服务注册与入驻奖励解析函数与配额规则动态绑定', async () => {
  const { resolveInitialSignupCredits, resolveOnboardingRewardCredits } = await import('../../lib/services/auth.js');

  const signupCredits = await resolveInitialSignupCredits();
  assert.equal(typeof signupCredits, 'number');
  assert.ok(signupCredits >= 0);

  const onboardingCredits = await resolveOnboardingRewardCredits();
  assert.equal(typeof onboardingCredits, 'number');
  assert.ok(onboardingCredits >= 0);
});

