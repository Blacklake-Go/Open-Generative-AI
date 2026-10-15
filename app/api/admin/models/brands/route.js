import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import {
  getBrandModelsPageData,
  bindBrandModel,
  toggleChannelModel,
  updateChannelPriority,
  unbindChannelModel,
} from '@/lib/services/modelBrands.js';
import { logAudit } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get('provider') || null;

  const data = await getBrandModelsPageData({ providerId });
  return okResponse(data, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const action = body.action || 'bind';

  if (action === 'toggle') {
    const { channelId, enabled } = body;
    if (!channelId) {
      return errorResponse('VALIDATION_ERROR', '缺少 channelId 参数', 422, guard.requestId);
    }
    const result = await toggleChannelModel(channelId, enabled);
    await logAudit({
      actor: guard.user,
      action: 'provider_models.toggle',
      targetType: 'provider_model',
      targetId: channelId,
      riskLevel: 'medium',
      after: { enabled },
    });
    return okResponse(result, guard.requestId);
  }

  if (action === 'priority') {
    const { channelId, priority } = body;
    if (!channelId) {
      return errorResponse('VALIDATION_ERROR', '缺少 channelId 参数', 422, guard.requestId);
    }
    const result = await updateChannelPriority(channelId, priority);
    await logAudit({
      actor: guard.user,
      action: 'provider_models.update_priority',
      targetType: 'provider_model',
      targetId: channelId,
      riskLevel: 'low',
      after: { priority },
    });
    return okResponse(result, guard.requestId);
  }

  if (action === 'unbind') {
    const { channelId } = body;
    if (!channelId) {
      return errorResponse('VALIDATION_ERROR', '缺少 channelId 参数', 422, guard.requestId);
    }
    const result = await unbindChannelModel(channelId);
    await logAudit({
      actor: guard.user,
      action: 'provider_models.unbind',
      targetType: 'provider_model',
      targetId: channelId,
      riskLevel: 'high',
      before: { channelId },
    });
    return okResponse(result, guard.requestId);
  }

  // 默认：挂载品牌模型
  const { providerId, modelId, providerModelId, priority, baseCost, currency, providerEndpoint, enabled } = body;
  if (!providerId || !modelId || !providerModelId) {
    return errorResponse('VALIDATION_ERROR', '供应商 ID、规范模型 ID 与渠道内部模型标识均为必填项', 422, guard.requestId);
  }

  const result = await bindBrandModel({
    providerId,
    modelId,
    providerModelId,
    priority: Number(priority ?? 100),
    baseCost: Number(baseCost ?? 0.01),
    currency: currency || 'USD',
    providerEndpoint: providerEndpoint || '',
    enabled: enabled !== false,
  });

  await logAudit({
    actor: guard.user,
    action: 'provider_models.bind_brand_model',
    targetType: 'provider_model',
    targetId: result.id,
    riskLevel: 'medium',
    after: result,
  });

  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
