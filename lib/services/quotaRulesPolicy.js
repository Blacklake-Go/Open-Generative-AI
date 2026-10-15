import { CREDIT_PRICING_POLICY } from '../pricing/creditPolicy.js';

const BENCHMARK_STARTER_PLAN = Object.freeze({
  id: 'starter',
  codeName: 'BASE',
  monthlyCredits: 2000,
  monthlyCny: 140,
});

export const QUOTA_RULES_SETTING_KEY = 'quota_rules';

/**
 * 默认新用户额度与签到规则
 * 严格对齐《权益设计和算力包.md》与统一价盘 creditPolicy.js：
 * 1. 注册初始赠送 40 积分 (永久有效，可直接生成 4 张万相 Turbo 或 2 张 FLUX pro)
 * 2. 完成引导奖励 50 积分 (永久有效，累计达 90 积分，刚好解锁 1 条 MiniMax Hailuo 或万相 5s 视频)
 * 3. 每日签到赠送 10 积分 (当日 23:59:59 到期，与免费体验档 FREE 规则 100% 一致，每日可生成 1 张万相 Turbo)
 */
export const DEFAULT_QUOTA_RULES = Object.freeze({
  initialSignupCredits: 40,
  onboardingRewardCredits: 50,
  dailyCheckinCredits: 10,
  dailyCheckinValidity: 'today', // 'today' (当日23:59:59到期) | '24h' | 'perpetual'
  onboardingGateEnabled: true,   // 是否对未完成引导的新用户启用工作台拦截引导
  dailySignupIpLimit: 5,         // 单 IP 每日注册受赠上限 (防刷防黑产)
});

// 具有代表性的官方核验模型单价基准（用于定价表一致性核验与获客成本测算）
export const BENCHMARK_MODELS = Object.freeze([
  {
    id: 'wanx2.1-t2i-turbo',
    name: '万相 2.1 Turbo (生图)',
    category: 'image',
    credits: 10,
    costCny: 0.14,
    description: '单张 10 积分，每日签到 10 分即可免费生成 1 张',
  },
  {
    id: 'flux1.1-pro',
    name: 'FLUX 1.1 [pro] (生图)',
    category: 'image',
    credits: 20,
    costCny: 0.288,
    description: '单张 20 积分，初始 40 积分即可免费生成 2 张',
  },
  {
    id: 'wanx2.1-t2v-turbo',
    name: '万相 2.1 Turbo 5秒 (视频)',
    category: 'video',
    credits: 80,
    costCny: 1.20,
    description: '单条 80 积分，入驻累计 90 积分即可免费生成 1 条并余 10 积分',
  },
  {
    id: 'minimax-hailuo-2.3-fast',
    name: 'MiniMax Hailuo 2.3 Fast 6秒 (视频)',
    category: 'video',
    credits: 90,
    costCny: 1.368,
    description: '单条 90 积分，入驻累计 90 积分恰好足额生成 1 条完整视频',
  },
  {
    id: 'seedance-2.0-480p',
    name: 'Seedance 2.0 480p 5秒 (视频)',
    category: 'video',
    credits: 295,
    costCny: 4.62,
    description: '单条 295 积分，建议引导用户升级至付费套餐 Starter (2,000分)',
  },
  {
    id: 'veo-3.1-standard',
    name: 'Veo 3.1 Standard 720p 5秒 (顶级视频)',
    category: 'video',
    credits: 910,
    costCny: 14.40,
    description: '单条 910 积分，旗舰工作室级模型，受订阅或专属算力包支持',
  },
]);

/**
 * 校验并规范化规则对象
 */
export function normalizeQuotaRules(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const cleanInt = (val, fallback, min, max) => {
    const num = Number.parseInt(val, 10);
    if (!Number.isFinite(num)) return fallback;
    if (num < min) return min;
    if (num > max) return max;
    return num;
  };

  const validityCandidates = ['today', '24h', 'perpetual'];
  const validity = validityCandidates.includes(source.dailyCheckinValidity)
    ? source.dailyCheckinValidity
    : DEFAULT_QUOTA_RULES.dailyCheckinValidity;

  return {
    initialSignupCredits: cleanInt(source.initialSignupCredits, DEFAULT_QUOTA_RULES.initialSignupCredits, 0, 500),
    onboardingRewardCredits: cleanInt(source.onboardingRewardCredits, DEFAULT_QUOTA_RULES.onboardingRewardCredits, 0, 500),
    dailyCheckinCredits: cleanInt(source.dailyCheckinCredits, DEFAULT_QUOTA_RULES.dailyCheckinCredits, 0, 100),
    dailyCheckinValidity: validity,
    onboardingGateEnabled: source.onboardingGateEnabled !== false,
    dailySignupIpLimit: cleanInt(source.dailySignupIpLimit, DEFAULT_QUOTA_RULES.dailySignupIpLimit, 1, 50),
  };
}

/**
 * 核对当前额度规则与官方定价表的一致性，测算单位经济学指标
 */
export function verifyQuotaPricingConsistency(rulesInput = null) {
  const rules = normalizeQuotaRules(rulesInput || DEFAULT_QUOTA_RULES);
  const cnyPerCredit = CREDIT_PRICING_POLICY.cnyPerCredit; // ¥0.07/分 (月付基准面值)
  const estimatedCostPerCredit = 0.014;

  const totalNewcomerCredits = rules.initialSignupCredits + rules.onboardingRewardCredits;
  const estimatedCac = Number((totalNewcomerCredits * estimatedCostPerCredit).toFixed(2));
  const perceivedValueCny = Number((totalNewcomerCredits * cnyPerCredit).toFixed(2));
  const dailyCheckinCost = Number((rules.dailyCheckinCredits * estimatedCostPerCredit).toFixed(2));
  const dailyCheckinValue = Number((rules.dailyCheckinCredits * cnyPerCredit).toFixed(2));

  // 兑换能力测算
  const modelTrials = BENCHMARK_MODELS.map((model) => {
    const totalRunsPossible = Math.floor(totalNewcomerCredits / model.credits);
    const signupOnlyRuns = Math.floor(rules.initialSignupCredits / model.credits);
    const dailyCheckinRuns = Math.floor(rules.dailyCheckinCredits / model.credits);
    return {
      id: model.id,
      name: model.name,
      category: model.category,
      creditsPerRun: model.credits,
      officialCostCny: model.costCny,
      totalRunsPossible,
      signupOnlyRuns,
      dailyCheckinRuns,
      canAffordWithTotal: totalRunsPossible >= 1,
      canAffordWithSignup: signupOnlyRuns >= 1,
      canAffordDaily: dailyCheckinRuns >= 1,
    };
  });

  // 与订阅价盘最低档 Starter (BASE) 对比
  const starterMonthlyCredits = BENCHMARK_STARTER_PLAN.monthlyCredits;
  const starterPriceCny = BENCHMARK_STARTER_PLAN.monthlyCny;
  const freeVsStarterRatio = Number((starterMonthlyCredits / (totalNewcomerCredits || 1)).toFixed(1));

  // 审计检查项 (Checklist)
  const checks = [
    {
      id: 'check_signup_image_trial',
      title: '初始注册赠送可覆盖基础生图',
      description: `初始赠送 ${rules.initialSignupCredits} 分，至少可生成 2 次万相 Turbo 或 1 次 FLUX pro 生图`,
      passed: rules.initialSignupCredits >= 20,
      severity: 'high',
    },
    {
      id: 'check_onboarding_video_unlock',
      title: '入驻累计额度可解锁完整 AI 视频体验',
      description: `累计 ${totalNewcomerCredits} 积分可满足万相 5s 视频 (80分) 或 MiniMax Hailuo 视频 (90分) 单次生成`,
      passed: totalNewcomerCredits >= 80,
      severity: 'high',
    },
    {
      id: 'check_daily_checkin_free_tier',
      title: '每日签到积分严格对齐免费体验档 (FREE) 承诺',
      description: `定价表明确标示 FREE 档每日主动签到 10 分，当前配置为 ${rules.dailyCheckinCredits} 分`,
      passed: rules.dailyCheckinCredits === 10,
      severity: 'medium',
    },
    {
      id: 'check_daily_checkin_validity',
      title: '每日签到积分采用当日到期机制',
      description: '签到积分需当日 23:59:59 到期失效，避免长期屯分挤占平台商业 GPU 算力',
      passed: rules.dailyCheckinValidity === 'today',
      severity: 'medium',
    },
    {
      id: 'check_cac_within_budget',
      title: '单客获客算力成本 (CAC) 处于安全边际',
      description: `当前累计 ${totalNewcomerCredits} 积分对应平台理论成本为 ¥${estimatedCac}，低于 ¥2.50 预算红线`,
      passed: estimatedCac <= 2.50,
      severity: 'high',
    },
    {
      id: 'check_starter_upgrade_gradient',
      title: '商业套餐梯度具有显著吸引力',
      description: `Starter 档拥有 ${starterMonthlyCredits} 积分 (¥${starterPriceCny})，为免费总额度的 ${freeVsStarterRatio} 倍，转化梯度健康`,
      passed: freeVsStarterRatio >= 15,
      severity: 'low',
    },
  ];

  const failedChecks = checks.filter((c) => !c.passed);
  const isConsistent = failedChecks.length === 0;

  return {
    rules,
    unitEconomics: {
      totalNewcomerCredits,
      perceivedValueCny,
      estimatedCac,
      cnyPerCredit,
      estimatedCostPerCredit,
      dailyCheckinCost,
      dailyCheckinValue,
      freeVsStarterRatio,
    },
    modelTrials,
    starterPlan: BENCHMARK_STARTER_PLAN,
    checks,
    failedChecks,
    isConsistent,
    statusText: isConsistent ? '与官方定价表 100% 完全一致' : `存在 ${failedChecks.length} 项偏离定价表设计`,
    auditedAt: new Date().toISOString(),
  };
}
