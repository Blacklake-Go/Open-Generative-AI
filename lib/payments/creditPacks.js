/**
 * KOYO Studio 算力购买与额度配置规范
 * 
 * 依据《KOYO Studio 五档订阅积分、兑换与权益方案》(v2.2):
 * 1. 通用算力包 (Universal Credit Packs):
 *    ¥1 = 10 积分 (¥0.10/分)，全站模型通用，长期永久有效。
 * 2. 顶级模型专属算力包 (Exclusive Model Family Credit Packs):
 *    绑定规范模型家族 (首批: Veo 3.1 Standard, Seedance 2.0 标准版)。
 *    标准发放: 每 ¥1 得 10 已购专属分 (1年有效) + 6 加赠专属分 (31天有效) = 16 分/元 (约 ¥0.0625/分)。
 *    首购加赠: 全平台每账户首笔专属包订单再赠 min(支付元数 * 2, 1400) 专属分 (31天有效)。
 *    仅抵扣该模型家族已核准规格报价，不能跨模型或转为通用积分。
 */

export const UNIVERSAL_CREDIT_PACKS = Object.freeze([
  { id: 'credit_490', kind: 'universal', credits: 490, priceCny: 49, displayOrder: 1, featured: false, name: '490 通用算力', rateLabel: '¥0.10/分', validityText: '永久有效' },
  { id: 'credit_1400', kind: 'universal', credits: 1400, priceCny: 140, displayOrder: 2, featured: false, name: '1,400 通用算力', rateLabel: '¥0.10/分', validityText: '永久有效' },
  { id: 'credit_2100', kind: 'universal', credits: 2100, priceCny: 210, displayOrder: 3, featured: false, name: '2,100 通用算力', rateLabel: '¥0.10/分', validityText: '永久有效' },
  { id: 'credit_3500', kind: 'universal', credits: 3500, priceCny: 350, displayOrder: 4, featured: true, name: '3,500 通用算力', rateLabel: '¥0.10/分', validityText: '永久有效' },
  { id: 'credit_7000', kind: 'universal', credits: 7000, priceCny: 700, displayOrder: 5, featured: false, name: '7,000 通用算力', rateLabel: '¥0.10/分', validityText: '永久有效' },
  { id: 'credit_14000', kind: 'universal', credits: 14000, priceCny: 1400, displayOrder: 6, featured: false, name: '14,000 通用算力', rateLabel: '¥0.10/分', validityText: '永久有效' },
  { id: 'credit_70000', kind: 'universal', credits: 70000, priceCny: 7000, displayOrder: 7, featured: false, name: '70,000 通用算力', rateLabel: '¥0.10/分', validityText: '永久有效' },
]);

export const EXCLUSIVE_MODEL_FAMILIES = Object.freeze({
  veo: {
    key: 'veo',
    familyName: 'Veo 3.1 Standard',
    canonicalModelId: 'veo-3.1-standard',
    badge: 'Google 旗舰视频',
    description: '仅限 Veo 3.1 Standard 规范模型已核准规格抵扣，不能跨模型或转成通用积分',
    refSpec: '720p 含音频 5 秒',
    refCostCredits: 910,
    subscriberPolicy: 'subscriber_or_pack',
  },
  seedance: {
    key: 'seedance',
    familyName: 'Seedance 2.0 标准版',
    canonicalModelId: 'seedance-2.0',
    badge: 'Seedance 旗舰',
    description: '仅限 Seedance 2.0 标准版规范模型已核准规格抵扣，不能跨模型或转成通用积分',
    refSpec: '720p 无输入视频 5 计费秒',
    refCostCredits: 625,
    subscriberPolicy: 'subscriber_or_pack',
  },
});

const EXCLUSIVE_PACK_TIER_CONFIGS = Object.freeze([
  {
    tierKey: '350',
    priceCny: 350,
    purchasedCredits: 3500,
    standardBonusCredits: 2100,
    standardTotalCredits: 5600,
    firstBonusCredits: 700,
    firstTotalCredits: 6300,
    displayOrder: 1,
    featured: false,
  },
  {
    tierKey: '700',
    priceCny: 700,
    purchasedCredits: 7000,
    standardBonusCredits: 4200,
    standardTotalCredits: 11200,
    firstBonusCredits: 1400,
    firstTotalCredits: 12600,
    displayOrder: 2,
    featured: true,
  },
  {
    tierKey: '1400',
    priceCny: 1400,
    purchasedCredits: 14000,
    standardBonusCredits: 8400,
    standardTotalCredits: 22400,
    firstBonusCredits: 1400,
    firstTotalCredits: 23800,
    displayOrder: 3,
    featured: false,
  },
  {
    tierKey: '7000',
    priceCny: 7000,
    purchasedCredits: 70000,
    standardBonusCredits: 42000,
    standardTotalCredits: 112000,
    firstBonusCredits: 1400,
    firstTotalCredits: 113400,
    displayOrder: 4,
    featured: false,
  },
]);

export function buildExclusivePackItem(familyKey, tier) {
  const family = EXCLUSIVE_MODEL_FAMILIES[familyKey];
  if (!family) return null;

  const standardGenerations = Math.floor(tier.standardTotalCredits / family.refCostCredits);
  const firstGenerations = Math.floor(tier.firstTotalCredits / family.refCostCredits);

  return Object.freeze({
    id: `exclusive_${familyKey}_${tier.tierKey}`,
    kind: 'exclusive_pack',
    familyKey,
    familyName: family.familyName,
    canonicalModelId: family.canonicalModelId,
    name: `${family.familyName} 专属包 (￥${tier.priceCny})`,
    priceCny: tier.priceCny,
    purchasedCredits: tier.purchasedCredits,
    standardBonusCredits: tier.standardBonusCredits,
    standardTotalCredits: tier.standardTotalCredits,
    firstBonusCredits: tier.firstBonusCredits,
    firstTotalCredits: tier.firstTotalCredits,
    purchasedValidityDays: 365,
    bonusValidityDays: 31,
    purchasedValidityText: '自购买起 1 年有效',
    bonusValidityText: '自购买起 31 天有效',
    refSpec: family.refSpec,
    refCostCredits: family.refCostCredits,
    standardGenerations,
    firstGenerations,
    rateStandard: (tier.priceCny / tier.standardTotalCredits).toFixed(4),
    rateFirst: (tier.priceCny / tier.firstTotalCredits).toFixed(4),
    displayOrder: tier.displayOrder,
    featured: Boolean(tier.featured),
  });
}

/**
 * 列出所有通用算力包
 */
export function listCreditPacks() {
  return UNIVERSAL_CREDIT_PACKS.map((pack) => ({ ...pack }));
}

export function listUniversalCreditPacks() {
  return listCreditPacks();
}

/**
 * 根据 ID 查找通用算力包
 */
export function findCreditPackById(id) {
  const strId = String(id || '');
  const pack = UNIVERSAL_CREDIT_PACKS.find(
    (item) => item.id === strId ||
              (strId.startsWith('credit_') && item.priceCny === Number(strId.replace('credit_', '')))
  );
  return pack ? { ...pack } : null;
}

/**
 * 列出所有支持专属包的模型家族
 */
export function listExclusiveModelFamilies() {
  return Object.values(EXCLUSIVE_MODEL_FAMILIES).map((f) => ({
    ...f,
    packs: EXCLUSIVE_PACK_TIER_CONFIGS.map((t) => buildExclusivePackItem(f.key, t)),
  }));
}

/**
 * 根据家族 key 获取该家族的 4 档专属包列表
 */
export function listExclusivePacksByFamily(familyKey) {
  const family = EXCLUSIVE_MODEL_FAMILIES[familyKey];
  if (!family) return [];
  return EXCLUSIVE_PACK_TIER_CONFIGS.map((t) => buildExclusivePackItem(familyKey, t));
}

/**
 * 根据 ID 查找专属算力包 (如 exclusive_veo_350)
 */
export function findExclusivePackById(id) {
  const strId = String(id || '');
  for (const familyKey of Object.keys(EXCLUSIVE_MODEL_FAMILIES)) {
    for (const tier of EXCLUSIVE_PACK_TIER_CONFIGS) {
      if (`exclusive_${familyKey}_${tier.tierKey}` === strId) {
        return buildExclusivePackItem(familyKey, tier);
      }
    }
  }
  return null;
}

/**
 * 统一查找任意算力包（通用或专属）
 */
export function findAnyCreditPack(id) {
  return findCreditPackById(id) || findExclusivePackById(id);
}

/**
 * 计算订单在首购与复购情境下的专属包发放明细
 */
export function calculateExclusivePackGrant(pack, isFirstPurchase = false) {
  if (!pack) return null;
  const purchased = pack.purchasedCredits;
  const standardBonus = pack.standardBonusCredits;
  const firstBonus = isFirstPurchase ? pack.firstBonusCredits : 0;
  const totalCredits = purchased + standardBonus + firstBonus;
  return {
    purchasedCredits: purchased,
    standardBonusCredits: standardBonus,
    firstBonusCredits: firstBonus,
    totalCredits,
    isFirstPurchase,
    purchasedValidityDays: 365,
    bonusValidityDays: 31,
  };
}
