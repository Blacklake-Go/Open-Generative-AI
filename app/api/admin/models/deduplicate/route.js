import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { logAudit } from '@/lib/admin/audit';
import { scanModelHygiene, mergeModelAlias, runFullHygieneSync } from '@/lib/services/modelHygiene.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const data = await scanModelHygiene();
  return okResponse(data, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const action = body.action || '';

  if (action === 'merge') {
    const { sourceModelId, targetModelId } = body;
    if (!sourceModelId || !targetModelId) {
      return errorResponse('VALIDATION_ERROR', '缺少 sourceModelId 或 targetModelId', 422, guard.requestId);
    }
    const result = await mergeModelAlias({ sourceModelId, targetModelId, actor: guard.user });
    await logAudit({
      actor: guard.user,
      action: 'model.merge_alias',
      targetType: 'ai_model',
      targetId: targetModelId,
      riskLevel: 'medium',
      before: { sourceModelId },
      after: result,
      requestId: guard.requestId,
    });
    return okResponse(result, guard.requestId);
  }

  if (action === 'run_sync') {
    const stats = await runFullHygieneSync();
    await logAudit({
      actor: guard.user,
      action: 'model.hygiene_sync',
      targetType: 'ai_model',
      targetId: 'all',
      riskLevel: 'high',
      before: null,
      after: stats,
      requestId: guard.requestId,
    });
    return okResponse({ stats }, guard.requestId);
  }

  return errorResponse('VALIDATION_ERROR', `不支持的操作类型: ${action}`, 422, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
