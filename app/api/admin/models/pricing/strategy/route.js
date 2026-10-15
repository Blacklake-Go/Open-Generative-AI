import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { savePricingStrategy, getActivePricingStrategy } from '@/lib/services/pricingStrategy';
import { logAudit } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const strategy = await getActivePricingStrategy();
  return okResponse({ strategy }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const { baseMultiplier, minMarginRate, categoryMultipliers, tierMultipliers, specMultipliers } = body;

  if (!baseMultiplier || baseMultiplier < 1) {
    return errorResponse('VALIDATION_ERROR', '基准倍率不能小于 1', 400, guard.requestId);
  }

  if (!minMarginRate || minMarginRate < 0.1 || minMarginRate > 0.9) {
    return errorResponse('VALIDATION_ERROR', '最低毛利率应在 10%-90% 之间', 400, guard.requestId);
  }

  const before = await getActivePricingStrategy();

  const result = await savePricingStrategy(
    { baseMultiplier, minMarginRate, categoryMultipliers, tierMultipliers, specMultipliers },
    guard.user?.id
  );

  await logAudit({
    actor: guard.user,
    action: 'models.pricing_strategy_update',
    targetType: 'pricing_strategy',
    targetId: result?.id || 'default',
    riskLevel: 'high',
    before,
    after: result,
  });

  return okResponse({ strategy: result, message: '定价策略已保存' }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
