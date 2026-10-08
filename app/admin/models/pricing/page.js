import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import { queryMany, queryOne } from '@/lib/db/index';
import { getModelPricingBreakdownList, getFrontendModelsMatrixList } from '@/lib/modelCenter/pricingMatrix';
import PricingManagerClient from './PricingManagerClient';

export const metadata = {
  title: '模型定价管理与价格明细 - KoyoSIM 后台',
};

export const dynamic = 'force-dynamic';

export default async function ModelPricingPage({ searchParams }) {
  const admin = await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const sp = await searchParams;
  const initialTab = sp?.tab || 'rules';

  const [pricingList, strategy, breakdownList, frontendModelsList] = await Promise.all([
    queryMany(`
      SELECT 
        m.id AS "modelId", 
        COALESCE(m.display_name, m.name) AS "modelName", 
        m.category, 
        m.status AS "modelStatus",
        COALESCE(mp.pricing_type, 'fixed') AS "pricingType",
        COALESCE(mp.pricing_mode, 'auto') AS "pricingMode",
        COALESCE(mp.base_credits, 10)::int AS "baseCredits",
        COALESCE(mp.formula_config, '{}'::jsonb) AS "formulaConfig",
        COALESCE(mp.min_credits, 10)::int AS "minCredits",
        COALESCE(mp.min_gross_margin_rate, 0.3)::numeric AS "minGrossMarginRate",
        COALESCE(mp.is_active, true) AS "isActive",
        COALESCE(mp.price_locked, false) AS "manuallyLocked",
        mp.auto_suggested_price_cny AS "autoSuggestedPriceCny",
        mp.manual_override_price_cny AS "manualOverridePriceCny",
        COALESCE(mp.updated_at, m.updated_at) AS "updatedAt"
      FROM ai_studio.ai_models m
      LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id
      WHERE m.status != 'disabled'
      ORDER BY m.sort ASC, m.id ASC
    `),
    queryOne(`SELECT * FROM ai_studio.pricing_strategy WHERE is_active = true LIMIT 1`).catch(() => null),
    getModelPricingBreakdownList().catch(() => []),
    getFrontendModelsMatrixList().catch(() => []),
  ]);

  const initialPricing = (pricingList || []).map((p) => ({
    modelId: p.modelId,
    modelName: p.modelName,
    category: p.category,
    modelStatus: p.modelStatus,
    pricingType: p.pricingType,
    pricingMode: p.pricingMode,
    baseCredits: Number(p.baseCredits ?? 10),
    formulaConfig: p.formulaConfig || {},
    subscriptionDiscounts: {},
    minCredits: Number(p.minCredits ?? 10),
    minGrossMarginRate: Number(p.minGrossMarginRate ?? 0.3),
    isActive: p.isActive !== false,
    manuallyLocked: Boolean(p.manuallyLocked),
    autoSuggestedPriceCny: p.autoSuggestedPriceCny ? Number(p.autoSuggestedPriceCny) : null,
    manualOverridePriceCny: p.manualOverridePriceCny ? Number(p.manualOverridePriceCny) : null,
    updatedAt: p.updatedAt,
  }));

  const initialStrategy = strategy
    ? {
        baseMultiplier: Number(strategy.base_multiplier ?? 1.5),
        minMarginRate: Number(strategy.min_margin_rate ?? 0.3),
        categoryMultipliers: strategy.category_multipliers || {},
        tierMultipliers: strategy.tier_multipliers || {},
        specMultipliers: strategy.spec_multipliers || {},
      }
    : { baseMultiplier: 1.5, minMarginRate: 0.3, categoryMultipliers: {}, tierMultipliers: {}, specMultipliers: {} };

  return (
    <>
      <PageHeader
        eyebrow="AI 模型中心"
        title="模型定价与明细中心"
        description="配置全局倍率定价策略、穿透供应商多渠道底价与毛利明细，并实时掌控当前前台模型售卖扣费态览。"
      />
      <PricingManagerClient
        initialTab={initialTab}
        initialPricing={initialPricing}
        initialStrategy={initialStrategy}
        initialBreakdown={breakdownList}
        initialFrontendModels={frontendModelsList}
        canWrite={hasPermission(admin.role, PERMISSIONS.modelsWrite)}
      />
    </>
  );
}
