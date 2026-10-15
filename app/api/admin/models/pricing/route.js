import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import {
  listCanonicalModels,
  getModelPricing,
  upsertModelPricing,
} from '@/lib/application/dataAccess.js';
import { queryMany } from '@/lib/application/dataAccess.js';
import { logAudit } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const [models, pricingList] = await Promise.all([
    listCanonicalModels(),
    queryMany(`
      SELECT mp.*, m.name, m.display_name, m.category, m.status AS model_status
      FROM ai_studio.model_pricing mp
      JOIN ai_studio.ai_models m ON m.id = mp.model_id
      ORDER BY m.sort ASC, m.id ASC
    `),
  ]);

  const pricingMap = new Map(pricingList.map((p) => [p.model_id, p]));
  const fullList = models.map((m) => {
    const existing = pricingMap.get(m.id);
    return {
      modelId: m.id,
      modelName: m.display_name || m.name,
      category: m.category,
      modelStatus: m.status,
      pricingType: existing?.pricing_type || 'fixed',
      baseCredits: existing?.base_credits == null ? null : Number(existing.base_credits),
      formulaConfig: existing?.formula_config || {},
      subscriptionDiscounts: {},
      minCredits: Number(existing?.min_credits ?? 10),
      minGrossMarginRate: Math.max(Number(existing?.min_gross_margin_rate ?? 0.75), 0.75),
      isActive: existing?.is_active === true,
      updatedAt: existing?.updated_at || m.updated_at,
    };
  });

  return okResponse({ pricing: fullList }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  if (!body.modelId && !body.model_id) {
    return errorResponse('VALIDATION_ERROR', 'modelId 为必填项', 422, guard.requestId);
  }

  const modelId = body.modelId || body.model_id;
  const baseCredits = Number(body.baseCredits ?? body.base_credits);
  if (!Number.isInteger(baseCredits) || baseCredits <= 0) {
    return errorResponse('VALIDATION_ERROR', '必须提供已核实的正整数积分价格', 422, guard.requestId);
  }
  const before = await getModelPricing(modelId);

  const updated = await upsertModelPricing({
    model_id: modelId,
    pricing_type: body.pricingType || body.pricing_type || 'fixed',
    base_credits: baseCredits,
    formula_config: body.formulaConfig || body.formula_config || {},
    // 会员套餐的权益不再以生成单价折扣体现，避免绕过统一成本报价。
    subscription_discounts: {},
    min_credits: Number(body.minCredits ?? body.min_credits ?? 10),
    min_gross_margin_rate: Math.max(Number(body.minGrossMarginRate ?? body.min_gross_margin_rate ?? 0.75), 0.75),
    is_active: body.isActive !== false && body.is_active !== false,
  });

  await logAudit({
    actor: guard.user,
    action: 'models.pricing_update',
    targetType: 'model_pricing',
    targetId: modelId,
    riskLevel: 'high',
    before,
    after: updated,
  });

  return okResponse({ pricing: updated }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
