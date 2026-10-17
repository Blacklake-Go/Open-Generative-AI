import ModelNavTabs from '@/components/admin/ModelNavTabs';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS, hasPermission } from '@/lib/admin/permissions';
import { queryMany, queryOne } from '@/lib/db/index';
import { getModelPricingBreakdownList } from '@/lib/modelCenter/pricingMatrix';
import PricingManagerClient from './PricingManagerClient';

export const metadata = {
  title: '模型定价管理与价格明细 - SupDance 后台',
};

export const dynamic = 'force-dynamic';

export default async function ModelPricingPage({ searchParams }) {
  const admin = await requireAdminPagePermission(PERMISSIONS.modelsRead);
  const sp = await searchParams;
  const initialTab = sp?.tab || 'rules';

  const [pricingList, strategy, breakdownList, pendingPrices] = await Promise.all([
    queryMany(`
      SELECT 
        m.id AS "modelId", 
        COALESCE(m.display_name, m.name) AS "modelName", 
        m.category, 
        m.status AS "modelStatus",
        COALESCE(mp.pricing_type, 'fixed') AS "pricingType",
        COALESCE(mp.pricing_mode, 'auto') AS "pricingMode",
        mp.base_credits::int AS "baseCredits",
        COALESCE(mp.formula_config, '{}'::jsonb) AS "formulaConfig",
        COALESCE(mp.min_credits, 10)::int AS "minCredits",
        COALESCE(mp.min_gross_margin_rate, 0.3)::numeric AS "minGrossMarginRate",
        COALESCE(mp.is_active, false) AS "isActive",
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
    queryMany(`
      SELECT 
        pv.id,
        pv.provider_model_id,
        pv.version_no,
        pv.price_type,
        pv.billing_unit,
        pv.currency,
        pv.price_config,
        pv.applicability,
        pv.source_url,
        pv.source_api,
        pv.source_observed_at,
        pv.fetched_at,
        pv.effective_at,
        pv.expires_at,
        pv.status,
        pv.change_summary,
        pm.model_id,
        pm.provider_id,
        pm.provider_model_id AS "providerModelId",
        p.name AS "providerName",
        COALESCE(m.display_name, m.name) AS "modelName",
        m.category
      FROM ai_studio.provider_model_price_versions pv
      JOIN ai_studio.provider_models pm ON pm.id = pv.provider_model_id
      JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
      LEFT JOIN ai_studio.ai_models m ON m.id = pm.model_id
      WHERE pv.status IN ('staged', 'pending_review')
      ORDER BY pv.fetched_at DESC, pv.id DESC
      LIMIT 500
    `).catch(() => []),
  ]);

  const initialPricing = (pricingList || []).map((p) => ({
    modelId: p.modelId,
    modelName: p.modelName,
    category: p.category,
    modelStatus: p.modelStatus,
    pricingType: p.pricingType,
    pricingMode: p.pricingMode,
    baseCredits: p.baseCredits == null ? null : Number(p.baseCredits),
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
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      <ModelNavTabs activeTab="pricing" />
      <PricingManagerClient
        initialTab={initialTab}
        initialPricing={initialPricing}
        initialStrategy={initialStrategy}
        initialBreakdown={breakdownList}
        initialPendingPrices={pendingPrices || []}
        canWrite={hasPermission(admin.role, PERMISSIONS.modelsWrite)}
      />
    </div>
  );
}
