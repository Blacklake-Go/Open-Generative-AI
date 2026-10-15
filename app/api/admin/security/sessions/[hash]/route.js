import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { revokeSessionByHash } from '@/lib/repositories/sessions';
import { logAudit } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleRevokeSingle(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.sessionsRevoke);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);

  const idemp = await checkIdempotency({
    scope: 'session_revoke_single',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '会话撤销正在处理中', 409, guard.requestId);
  }

  const { hash } = await context.params;
  const result = await revokeSessionByHash(hash);

  await logAudit({
    actor: guard.user,
    action: 'sessions.revoke_single',
    targetType: 'session',
    targetId: hash,
    riskLevel: 'medium',
    after: { tokenHash: hash, rowCount: result?.rowCount || 1 },
    requestId: guard.requestId,
  });

  const responsePayload = { ok: true, tokenHash: hash };
  await completeIdempotency(idemp.keyHash, responsePayload);
  return okResponse(responsePayload, guard.requestId);
}

export const DELETE = withAdminErrorBoundary(handleRevokeSingle);
export const POST = withAdminErrorBoundary(handleRevokeSingle);
