import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getCanvasModelConfig, listCanvasModelCandidates, saveCanvasModelConfig } from '@/lib/services/canvasModelConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;
  const [config, candidates] = await Promise.all([getCanvasModelConfig(), listCanvasModelCandidates()]);
  return okResponse({ config, candidates }, guard.requestId);
}

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;
  const key = getRequiredIdempotencyKey(request);
  if (!key) return errorResponse('IDEMPOTENCY_REQUIRED', '保存配置需要 Idempotency-Key', 422, guard.requestId);
  const idempotency = await checkIdempotency({ scope: 'canvas_model_config', key, actorId: guard.user.id });
  if (!idempotency.allowed) {
    if (idempotency.cachedResponse) return okResponse(idempotency.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '相同配置正在保存', 409, guard.requestId);
  }
  try {
    const input = await request.json().catch(() => null);
    const result = await saveCanvasModelConfig({ actor: guard.user, input, requestId: guard.requestId });
    if (result.error) {
      await releaseIdempotency(idempotency.keyHash);
      return resultErrorResponse(result.error, guard.requestId);
    }
    await completeIdempotency(idempotency.keyHash, result.setting);
    return okResponse(result.setting, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idempotency.keyHash);
    throw error;
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const PUT = withAdminErrorBoundary(handlePUT);
