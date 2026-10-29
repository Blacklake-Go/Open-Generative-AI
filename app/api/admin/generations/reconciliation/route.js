import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, releaseIdempotency, getRequiredIdempotencyKey } from '@/lib/admin/idempotency';
import { publicErrorMessage } from '@/lib/security/publicError';
import { listGenerationReconciliations, reconcileGeneration } from '@/lib/services/generationReconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAdminErrorBoundary(async (request) => {
  const guard = await requirePermission(request, PERMISSIONS.generationsRead);
  if (!guard.ok) return guard.response;
  return okResponse(await listGenerationReconciliations(new URL(request.url).searchParams), guard.requestId);
});

export const POST = withAdminErrorBoundary(async (request) => {
  const guard = await requirePermission(request, PERMISSIONS.generationsWrite);
  if (!guard.ok) return guard.response;
  const key = getRequiredIdempotencyKey(request);
  if (!key) return errorResponse('IDEMPOTENCY_REQUIRED', '核对操作须提供幂等标识', 422, guard.requestId);
  const body = await request.json();
  const idem = await checkIdempotency({ scope: 'generation_reconciliation', key, actorId: guard.user.id });
  if (!idem.allowed) return idem.cachedResponse ? okResponse(idem.cachedResponse, guard.requestId)
    : errorResponse('CONFLICT', '该核对操作正在处理', 409, guard.requestId);
  try {
    const result = await reconcileGeneration({ ...body, actor: guard.user, idempotencyKey: key, requestId: guard.requestId });
    await completeIdempotency(idem.keyHash, result);
    return okResponse(result, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idem.keyHash);
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404
      : error.code === 'RECONCILIATION_CONFLICT' ? 409 : 422;
    return errorResponse(error.code || 'RECONCILIATION_FAILED', publicErrorMessage(error, '核对未完成，冻结额度已保留'), status, guard.requestId);
  }
});
