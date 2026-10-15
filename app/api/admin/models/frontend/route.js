import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { query, queryOne } from '@/lib/db/index';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const { modelId, displayName, pricingHint, badge, sort, isVisible, isDefault, isPinned, baseCredits } = body;

  if (!modelId) {
    return errorResponse('VALIDATION_ERROR', '缺少目标模型 ID', 400, guard.requestId);
  }
  if (baseCredits !== undefined) {
    return errorResponse('PRICING_REVIEW_REQUIRED', '请在模型定价页核实并设置积分价格', 422, guard.requestId);
  }

  // 1. 读取原模型配置
  const existing = await queryOne('SELECT id, capabilities, display_name, sort, is_visible FROM ai_studio.ai_models WHERE id = $1', [modelId]);
  if (!existing) {
    return errorResponse('NOT_FOUND', '未找到指定模型', 404, guard.requestId);
  }

  const capabilities = existing.capabilities && typeof existing.capabilities === 'object' ? existing.capabilities : {};
  if (badge !== undefined) capabilities.badge = String(badge || '').trim();
  if (pricingHint !== undefined) capabilities.pricing_hint = String(pricingHint || '').trim();
  if (isDefault !== undefined) capabilities.is_default = Boolean(isDefault);
  if (isPinned !== undefined) capabilities.is_pinned = Boolean(isPinned);

  const updates = [
    'capabilities = $2::jsonb',
    'updated_at = NOW()',
  ];
  const params = [modelId, JSON.stringify(capabilities)];

  if (displayName !== undefined) {
    params.push(String(displayName).trim());
    updates.push(`display_name = $${params.length}`);
  }
  if (sort !== undefined && Number.isFinite(Number(sort))) {
    params.push(Number(sort));
    updates.push(`sort = $${params.length}`);
  }
  if (isVisible !== undefined) {
    params.push(Boolean(isVisible));
    updates.push(`is_visible = $${params.length}`);
  }

  await query(`
    UPDATE ai_studio.ai_models
    SET ${updates.join(', ')}
    WHERE id = $1
  `, params);

  return okResponse({ success: true, modelId }, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
